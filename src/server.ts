// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeCrawlWithAi, discoverLocalAiModels, LocalModelStartError, startLocalModel, type LocalRuntimeProvider } from './ai.ts';
import { CrawlEngine, type CrawlEngineDependencies, generateLlmsBundle } from './crawler.ts';
import { renderGuiHtml } from './gui.ts';
import { SsrfBlockedError, validateSafeUrl } from './security.ts';
import { CrawlStorage } from './storage.ts';
import type { AiConfig, CrawlOptions, CrawlProgressEvent } from './types.ts';

export interface ServerOptions {
    port?: number;
    storage: CrawlStorage;
    engineDeps?: CrawlEngineDependencies;
    allowLocalhostForTesting?: boolean;
    launchLocalRuntime?: (provider: LocalRuntimeProvider) => Promise<void>;
}

export interface DispatchedResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
}

export function createCrawlPulseServer(options: ServerOptions): {
    server: Server;
    start: () => Promise<number>;
    stop: () => Promise<void>;
    dispatch: (req: { method?: string; path: string; body?: unknown }) => Promise<DispatchedResponse>;
} {
    const storage = options.storage;
    let activeEngine: CrawlEngine | null = null;
    const eventStreams = new Map<string, Set<ServerResponse>>();
    const bufferedEvents = new Map<string, CrawlProgressEvent[]>();

    const currentFile = fileURLToPath(import.meta.url);
    const mcpScriptPath = join(dirname(dirname(currentFile)), 'crawl-pulse');

    const broadcastEvent = (runId: string, ev: CrawlProgressEvent): void => {
        const list = bufferedEvents.get(runId) ?? [];
        list.push(ev);
        bufferedEvents.set(runId, list);

        const clients = eventStreams.get(runId);
        if (!clients) {
            return;
        }
        const data = `data: ${JSON.stringify(ev)}\n\n`;
        for (const res of clients) {
            res.write(data);
        }
    };

    const requestHandler = async (
        req: IncomingMessage & { _mockBody?: unknown },
        res: ServerResponse,
    ): Promise<void> => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'no-referrer');

        const hostHeader = req.headers?.host ?? '127.0.0.1:8985';
        const url = new URL(req.url ?? '/', `http://${hostHeader}`);
        const pathname = url.pathname;
        const method = req.method ?? 'GET';

        try {
            // 1. HTML Dashboard
            if (method === 'GET' && pathname === '/') {
                const address = server.address();
                const boundPort = typeof address === 'object' && address ? address.port : (options.port ?? 8985);
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(renderGuiHtml(boundPort));
                return;
            }

            // 2. Healthcheck
            if (method === 'GET' && pathname === '/api/health') {
                sendJson(res, 200, { status: 'ok', bind: '127.0.0.1' });
                return;
            }

            // 3. Crawl starten
            if (method === 'POST' && pathname === '/api/crawl/start') {
                const body = (req._mockBody !== undefined ? req._mockBody : await readJsonBody(req)) as Partial<CrawlOptions>;
                const targetUrl = String(body.url ?? '').trim();

                // Synchrones Fail-Closed SSRF-Gate vor Job-Start
                await validateSafeUrl(targetUrl, {
                    allowLocalhostForTesting: options.allowLocalhostForTesting ?? body.allowLocalhostForTesting,
                    lookupFn: options.engineDeps?.lookupFn,
                });

                const runId = randomUUID();
                bufferedEvents.set(runId, []);
                const engine = new CrawlEngine(options.engineDeps);
                activeEngine = engine;

                engine.on('progress', (ev: CrawlProgressEvent) => {
                    broadcastEvent(runId, ev);
                });

                // Starte asynchron im Hintergrund
                void engine
                    .run(
                        {
                            ...body,
                            url: targetUrl,
                            allowLocalhostForTesting:
                                options.allowLocalhostForTesting ?? body.allowLocalhostForTesting,
                        },
                        runId,
                    )
                    .then((completedRun) => {
                        storage.saveRun(completedRun);
                    })
                    .catch((err) => {
                        broadcastEvent(runId, {
                            runId,
                            type: 'error',
                            pagesProcessed: 0,
                            maxPages: Number(body.maxPages ?? 15),
                            queueSize: 0,
                            message: err instanceof Error ? err.message : String(err),
                        });
                    });

                sendJson(res, 202, { runId, status: 'started' });
                return;
            }

            // 4. Aktiven Crawl stoppen
            if (method === 'POST' && pathname === '/api/crawl/stop') {
                if (activeEngine) {
                    activeEngine.stop();
                }
                sendJson(res, 200, { stopped: true });
                return;
            }

            // 5. Server-Sent Events (SSE) Live-Stream
            if (method === 'GET' && pathname === '/api/crawl/events') {
                const runId = url.searchParams.get('runId') ?? '';
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream; charset=utf-8',
                    'Cache-Control': 'no-cache, no-transform',
                    'Connection': 'keep-alive',
                    'X-Accel-Buffering': 'no',
                });
                res.socket?.setTimeout(0);
                res.write(': connected\n\n');

                const existing = bufferedEvents.get(runId) ?? [];
                for (const ev of existing) {
                    res.write(`data: ${JSON.stringify(ev)}\n\n`);
                }

                let set = eventStreams.get(runId);
                if (!set) {
                    set = new Set();
                    eventStreams.set(runId, set);
                }
                set.add(res);

                const heartbeat = setInterval(() => {
                    try {
                        if (res.writableEnded || res.destroyed) {
                            clearInterval(heartbeat);
                            return;
                        }
                        res.write(': ping\n\n');
                    } catch {
                        clearInterval(heartbeat);
                    }
                }, 10_000);

                req.on('close', () => {
                    clearInterval(heartbeat);
                    set?.delete(res);
                });
                return;
            }

            // 6. Runs vergleichen
            if (method === 'GET' && pathname === '/api/runs/compare') {
                const runA = url.searchParams.get('runA') ?? '';
                const runB = url.searchParams.get('runB') ?? '';
                const diff = storage.compareRuns(runA, runB);
                if (!diff) {
                    sendJson(res, 404, { error: 'Einer der beiden Crawl-Läufe wurde nicht gefunden.' });
                    return;
                }
                sendJson(res, 200, diff);
                return;
            }

            // 7. Alle gespeicherten Runs auflisten
            if (method === 'GET' && pathname === '/api/runs') {
                const runs = storage.listRuns(50);
                sendJson(res, 200, runs);
                return;
            }

            // 8. Export-Endpunkt (/api/runs/:id/export)
            const exportMatch = /^\/api\/runs\/([^/]+)\/export$/.exec(pathname);
            if (method === 'GET' && exportMatch) {
                const runId = decodeURIComponent(exportMatch[1]);
                const format = url.searchParams.get('format') ?? 'llms-full';
                const run = storage.getRun(runId);
                if (!run) {
                    sendJson(res, 404, { error: 'Crawl-Lauf nicht gefunden.' });
                    return;
                }

                const bundle = generateLlmsBundle(run);
                if (format === 'llms-txt') {
                    res.writeHead(200, {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Content-Disposition': `attachment; filename="${run.domain}-llms.txt"`,
                    });
                    res.end(bundle.llmsTxt);
                    return;
                }

                if (format === 'json') {
                    res.writeHead(200, {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Content-Disposition': `attachment; filename="${run.domain}-report.json"`,
                    });
                    res.end(JSON.stringify(run, null, 2));
                    return;
                }

                if (format === 'csv') {
                    const csvRows = [
                        ['URL', 'Title', 'Status', 'Words', 'EstimatedTokens', 'ResponseTimeMs', 'Issues'].join(','),
                        ...run.pages.map((p) =>
                            [
                                csvEscape(p.url),
                                csvEscape(p.title),
                                String(p.status),
                                String(p.wordCount),
                                String(p.estimatedTokens),
                                String(p.responseTimeMs),
                                csvEscape(p.auditIssues.map((i) => i.code).join(';')),
                            ].join(','),
                        ),
                    ];
                    res.writeHead(200, {
                        'Content-Type': 'text/csv; charset=utf-8',
                        'Content-Disposition': `attachment; filename="${run.domain}-pages.csv"`,
                    });
                    res.end(csvRows.join('\n'));
                    return;
                }

                res.writeHead(200, {
                    'Content-Type': 'text/markdown; charset=utf-8',
                    'Content-Disposition': `attachment; filename="${run.domain}-llms-full.md"`,
                });
                res.end(bundle.llmsFullMd);
                return;
            }

            // 9. Einzelnen Run abrufen oder löschen (/api/runs/:id)
            const runMatch = /^\/api\/runs\/([^/]+)$/.exec(pathname);
            if (runMatch) {
                const runId = decodeURIComponent(runMatch[1]);
                if (method === 'GET') {
                    const run = storage.getRun(runId);
                    if (!run) {
                        sendJson(res, 404, { error: 'Crawl-Lauf nicht gefunden.' });
                        return;
                    }
                    sendJson(res, 200, run);
                    return;
                }
                if (method === 'DELETE') {
                    const deleted = storage.deleteRun(runId);
                    sendJson(res, 200, { deleted });
                    return;
                }
            }

            // 10. KI-Status & Konfiguration
            if (method === 'GET' && pathname === '/api/ai/status') {
                const discovered = await discoverLocalAiModels(options.engineDeps?.fetchImpl);
                const config = storage.getAiConfig();
                // Niemals API-Key im Klartext zurücksenden
                sendJson(res, 200, {
                    discovered,
                    config: { ...config, apiKey: config.apiKey ? '***' : '' },
                    mcpScriptPath,
                });
                return;
            }

            if (method === 'POST' && pathname === '/api/ai/config') {
                const body = (req._mockBody !== undefined ? req._mockBody : await readJsonBody(req)) as Partial<AiConfig>;
                const existing = storage.getAiConfig();
                const updated: AiConfig = {
                    provider: body.provider ?? existing.provider,
                    baseUrl: body.baseUrl ?? existing.baseUrl,
                    model: body.model ?? existing.model,
                    apiKey: body.apiKey && body.apiKey !== '***' ? body.apiKey : existing.apiKey,
                    zeroPii: body.zeroPii ?? existing.zeroPii,
                };
                storage.saveAiConfig(updated);
                sendJson(res, 200, { saved: true });
                return;
            }

            if (method === 'POST' && pathname === '/api/ai/start') {
                const body = (req._mockBody !== undefined ? req._mockBody : await readJsonBody(req)) as {
                    provider?: unknown;
                    model?: unknown;
                };
                try {
                    const started = await startLocalModel({
                        provider: body.provider,
                        model: body.model,
                        fetchImpl: options.engineDeps?.fetchImpl,
                        launchImpl: options.launchLocalRuntime,
                    });
                    sendJson(res, 200, started);
                } catch (error) {
                    if (error instanceof LocalModelStartError) {
                        sendJson(res, error.statusCode, { error: error.message });
                        return;
                    }
                    throw error;
                }
                return;
            }

            if (method === 'POST' && pathname === '/api/ai/analyze') {
                const body = (req._mockBody !== undefined ? req._mockBody : await readJsonBody(req)) as {
                    runId?: string;
                    mode?: 'summary' | 'schema' | 'qa';
                    prompt?: string;
                };
                const run = storage.getRun(String(body.runId ?? ''));
                if (!run) {
                    sendJson(res, 404, { error: 'Ausgewählter Crawl-Lauf nicht gefunden.' });
                    return;
                }
                const analysis = await analyzeCrawlWithAi({
                    run,
                    config: storage.getAiConfig(),
                    mode: body.mode ?? 'summary',
                    prompt: body.prompt ?? '',
                    fetchImpl: options.engineDeps?.fetchImpl,
                });
                sendJson(res, 200, analysis);
                return;
            }

            sendJson(res, 404, { error: 'Endpunkt nicht gefunden.' });
        } catch (error) {
            if (error instanceof SsrfBlockedError) {
                sendJson(res, 422, { error: error.message, code: error.code });
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            sendJson(res, 500, { error: message });
        }
    };

    const server = createServer((req, res) => {
        void requestHandler(req, res);
    });

    const dispatch = async (reqInit: {
        method?: string;
        path: string;
        body?: unknown;
    }): Promise<DispatchedResponse> => {
        let status = 200;
        const headers: Record<string, string> = {};
        let responseBody = '';

        const mockReq = {
            method: reqInit.method ?? 'GET',
            url: reqInit.path,
            headers: { host: `127.0.0.1:${options.port ?? 8985}` },
            _mockBody: reqInit.body,
            on: () => {},
        } as unknown as IncomingMessage & { _mockBody?: unknown };

        const mockRes = {
            setHeader: (k: string, v: string) => {
                headers[k.toLowerCase()] = String(v);
            },
            writeHead: (code: number, hdrs?: Record<string, string>) => {
                status = code;
                if (hdrs) {
                    for (const [k, v] of Object.entries(hdrs)) {
                        headers[k.toLowerCase()] = String(v);
                    }
                }
            },
            write: (chunk: string) => {
                responseBody += String(chunk);
            },
            end: (chunk?: string) => {
                if (chunk) {
                    responseBody += String(chunk);
                }
            },
        } as unknown as ServerResponse;

        await requestHandler(mockReq, mockRes);
        return { status, headers, body: responseBody };
    };

    const start = (): Promise<number> =>
        new Promise((resolve, reject) => {
            const targetPort = options.port ?? 8985;
            server.once('error', reject);
            // Binde aus Sicherheitsgründen strikt an 127.0.0.1 (Localhost-Only)
            server.listen(targetPort, '127.0.0.1', () => {
                const addr = server.address();
                const boundPort = typeof addr === 'object' && addr ? addr.port : targetPort;
                resolve(boundPort);
            });
        });

    const stop = (): Promise<void> =>
        new Promise((resolve) => {
            for (const clients of eventStreams.values()) {
                for (const res of clients) {
                    res.end();
                }
            }
            eventStreams.clear();
            server.close(() => resolve());
        });

    return { server, start, stop, dispatch };
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buf.byteLength;
        if (total > 1024 * 1024) {
            throw new Error('Request-Payload zu groß.');
        }
        chunks.push(buf);
    }
    const raw = Buffer.concat(chunks).toString('utf-8').trim();
    return raw ? JSON.parse(raw) : {};
}

function csvEscape(val: string): string {
    const clean = String(val ?? '').replace(/"/g, '""');
    return `"${clean}"`;
}
