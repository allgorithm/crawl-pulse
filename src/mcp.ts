// SPDX-License-Identifier: MIT
import { createInterface } from 'node:readline';
import { analyzeCrawlWithAi } from './ai.ts';
import { CrawlEngine, generateLlmsBundle } from './crawler.ts';
import { CrawlStorage } from './storage.ts';

export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: string | number | null;
    method: string;
    params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: unknown;
    error?: {
        code: number;
        message: string;
    };
}

export const MCP_TOOLS_DEFINITION = [
    {
        name: 'scrape_url',
        description:
            'Ruft eine einzelne Webseite SSRF-geschützt ab, entfernt Rauschen sowie versteckte Prompt-Injections und gibt sauberes LLM-Markdown, Metadaten, Schema.org JSON-LD und einen BFSG/SEO-Qualitätsbericht zurück.',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Ziel-URL (http:// oder https://)' },
                zeroPii: {
                    type: 'boolean',
                    description: 'Schwärzt E-Mail-Adressen, IBANs und Telefonnummern automatisch.',
                },
                cssSelector: {
                    type: 'string',
                    description: 'Optionaler CSS-Selektor (#id, .class, tag) für gezielte Extraktion.',
                },
            },
            required: ['url'],
        },
    },
    {
        name: 'crawl_site',
        description:
            'Crawlt eine Domain (BFS oder Sitemap) mit Tiefen- und Seitenlimit, speichert den Bericht in der lokalen SQLite-Datenbank und liefert den Gesamtbericht samt llms.txt Index.',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Start-URL der Website' },
                mode: {
                    type: 'string',
                    enum: ['crawl', 'sitemap', 'single'],
                    description: 'Crawl-Modus (Standard: crawl)',
                },
                maxPages: { type: 'number', description: 'Maximale Seitenanzahl (1-100, Standard: 15)' },
                maxDepth: { type: 'number', description: 'Maximale Klicktiefe (0-5, Standard: 2)' },
                zeroPii: { type: 'boolean', description: 'Zero-PII-Schwärzung aktivieren' },
            },
            required: ['url'],
        },
    },
    {
        name: 'list_saved_crawls',
        description: 'Listet die lokal in SQLite gespeicherten Crawl-Läufe inklusive Health-Score und Token-Anzahl auf.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Maximale Anzahl (Standard: 20)' },
            },
        },
    },
    {
        name: 'get_crawl_bundle',
        description: 'Gibt das vollständige LLM-Kontext-Bundle (llms-full.md) eines gespeicherten Crawl-Laufs zurück.',
        inputSchema: {
            type: 'object',
            properties: {
                runId: { type: 'string', description: 'ID des gespeicherten Crawl-Laufs' },
            },
            required: ['runId'],
        },
    },
    {
        name: 'ask_crawl',
        description:
            'Führt eine KI- oder lokale Heuristik-Analyse (summary, schema, qa) auf einem gespeicherten Crawl-Lauf aus.',
        inputSchema: {
            type: 'object',
            properties: {
                runId: { type: 'string', description: 'ID des gespeicherten Crawl-Laufs' },
                mode: {
                    type: 'string',
                    enum: ['summary', 'schema', 'qa'],
                    description: 'Analyse-Modus',
                },
                prompt: {
                    type: 'string',
                    description: 'Frage oder gewünschtes JSON-Schema',
                },
            },
            required: ['runId', 'mode'],
        },
    },
];

export async function handleMcpJsonRpc(
    request: JsonRpcRequest,
    storage: CrawlStorage,
    engineFactory: () => CrawlEngine = () => new CrawlEngine(),
): Promise<JsonRpcResponse | null> {
    const id = request.id ?? null;

    if (request.method === 'notifications/initialized') {
        return null;
    }

    if (request.method === 'initialize') {
        return {
            jsonrpc: '2.0',
            id,
            result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {},
                },
                serverInfo: {
                    name: 'crawl-pulse-mcp',
                    version: '1.0.0',
                },
            },
        };
    }

    if (request.method === 'tools/list') {
        return {
            jsonrpc: '2.0',
            id,
            result: {
                tools: MCP_TOOLS_DEFINITION,
            },
        };
    }

    if (request.method === 'tools/call') {
        const params = request.params ?? {};
        const toolName = String(params.name ?? '');
        const args = (params.arguments ?? {}) as Record<string, unknown>;

        try {
            if (toolName === 'scrape_url') {
                const engine = engineFactory();
                const run = await engine.run({
                    url: String(args.url ?? ''),
                    mode: 'single',
                    maxPages: 1,
                    maxDepth: 0,
                    zeroPii: Boolean(args.zeroPii ?? false),
                    cssSelector: args.cssSelector ? String(args.cssSelector) : undefined,
                });
                storage.saveRun(run);
                const page = run.pages[0];
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        runId: run.id,
                                        url: page?.url,
                                        title: page?.title,
                                        description: page?.description,
                                        estimatedTokens: page?.estimatedTokens,
                                        healthScore: run.summary.healthScore,
                                        auditIssues: page?.auditIssues,
                                        jsonLd: page?.jsonLd,
                                        customExtracted: page?.customExtracted,
                                        markdown: page?.markdown,
                                    },
                                    null,
                                    2,
                                ),
                            },
                        ],
                    },
                };
            }

            if (toolName === 'crawl_site') {
                const engine = engineFactory();
                const run = await engine.run({
                    url: String(args.url ?? ''),
                    mode: (args.mode as 'crawl' | 'sitemap' | 'single') ?? 'crawl',
                    maxPages: Number(args.maxPages ?? 15),
                    maxDepth: Number(args.maxDepth ?? 2),
                    zeroPii: Boolean(args.zeroPii ?? false),
                });
                storage.saveRun(run);
                const bundle = generateLlmsBundle(run);
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        runId: run.id,
                                        domain: run.domain,
                                        summary: run.summary,
                                        llmsTxt: bundle.llmsTxt,
                                    },
                                    null,
                                    2,
                                ),
                            },
                        ],
                    },
                };
            }

            if (toolName === 'list_saved_crawls') {
                const runs = storage.listRuns(Number(args.limit ?? 20));
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(runs, null, 2),
                            },
                        ],
                    },
                };
            }

            if (toolName === 'get_crawl_bundle') {
                const runId = String(args.runId ?? '');
                const run = storage.getRun(runId);
                if (!run) {
                    throw new Error(`Crawl-Lauf "${runId}" nicht gefunden.`);
                }
                const bundle = generateLlmsBundle(run);
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: bundle.llmsFullMd,
                            },
                        ],
                    },
                };
            }

            if (toolName === 'ask_crawl') {
                const runId = String(args.runId ?? '');
                const run = storage.getRun(runId);
                if (!run) {
                    throw new Error(`Crawl-Lauf "${runId}" nicht gefunden.`);
                }
                const aiResult = await analyzeCrawlWithAi({
                    run,
                    config: storage.getAiConfig(),
                    mode: (args.mode as 'summary' | 'schema' | 'qa') ?? 'summary',
                    prompt: String(args.prompt ?? ''),
                });
                return {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(aiResult, null, 2),
                            },
                        ],
                    },
                };
            }

            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32601,
                    message: `Unbekanntes MCP-Tool: ${toolName}`,
                },
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    isError: true,
                    content: [{ type: 'text', text: `Fehler: ${msg}` }],
                },
            };
        }
    }

    return {
        jsonrpc: '2.0',
        id,
        error: {
            code: -32601,
            message: `Methode nicht unterstützt: ${request.method}`,
        },
    };
}

export function startMcpStdioServer(storage: CrawlStorage): void {
    const rl = createInterface({
        input: process.stdin,
        terminal: false,
    });

    rl.on('line', async (line) => {
        const trimmed = line.trim();
        if (!trimmed) {
            return;
        }
        try {
            const req = JSON.parse(trimmed) as JsonRpcRequest;
            const res = await handleMcpJsonRpc(req, storage);
            if (res) {
                process.stdout.write(`${JSON.stringify(res)}\n`);
            }
        } catch {
            process.stdout.write(
                `${JSON.stringify({
                    jsonrpc: '2.0',
                    id: null,
                    error: { code: -32700, message: 'Ungültiges JSON-RPC-Format' },
                })}\n`,
            );
        }
    });
}
