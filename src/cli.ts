// SPDX-License-Identifier: MIT
import { createInterface } from 'node:readline/promises';
import { analyzeCrawlWithAi } from './ai.ts';
import { CrawlEngine, generateLlmsBundle } from './crawler.ts';
import { startMcpStdioServer } from './mcp.ts';
import { createCrawlPulseServer } from './server.ts';
import { CrawlStorage } from './storage.ts';
import type { CrawlProgressEvent } from './types.ts';

export async function runCli(argv: string[]): Promise<void> {
    const args = argv.slice(2);
    const command = args[0] ?? 'help';
    const storage = new CrawlStorage();

    if (command === 'mcp') {
        startMcpStdioServer(storage);
        return;
    }

    if (command === 'gui') {
        const portIdx = args.indexOf('--port');
        const requestedPort = portIdx >= 0 && args[portIdx + 1] ? Number(args[portIdx + 1]) : 8985;
        const app = createCrawlPulseServer({ port: requestedPort, storage });
        const boundPort = await app.start();
        console.log(`\n🕸️  CrawlPulse Web-Dashboard gestartet!`);
        console.log(`🌐 URL:        http://127.0.0.1:${boundPort}`);
        console.log(`🛡️  Sicherheit: Localhost-Only (127.0.0.1) + SSRF-Guard + Prompt-Injection-Filter aktiv`);
        console.log(`🤖 MCP-Modus:  ./crawl-pulse mcp\n`);
        console.log(`Drücke Ctrl+C zum Beenden.`);
        return;
    }

    if (command === 'scrape' || command === 'crawl') {
        const targetUrl = args[1];
        if (!targetUrl) {
            console.error(`Fehler: Bitte eine Ziel-URL angeben. Beispiel: ./crawl-pulse ${command} https://example.com`);
            process.exitCode = 1;
            storage.close();
            return;
        }

        const isSingle = command === 'scrape';
        const isSitemap = args.includes('--sitemap');
        const zeroPii = args.includes('--zero-pii');
        const maxPagesIdx = args.indexOf('--max-pages');
        const maxDepthIdx = args.indexOf('--max-depth');
        const selectorIdx = args.indexOf('--selector');

        const maxPages = isSingle ? 1 : maxPagesIdx >= 0 ? Number(args[maxPagesIdx + 1]) : 15;
        const maxDepth = isSingle ? 0 : maxDepthIdx >= 0 ? Number(args[maxDepthIdx + 1]) : 2;
        const cssSelector = selectorIdx >= 0 ? args[selectorIdx + 1] : undefined;

        const engine = new CrawlEngine();
        engine.on('progress', (ev: CrawlProgressEvent) => {
            console.error(`[${ev.type.toUpperCase()}] ${ev.message}`);
        });

        try {
            const run = await engine.run({
                url: targetUrl,
                mode: isSingle ? 'single' : isSitemap ? 'sitemap' : 'crawl',
                maxPages,
                maxDepth,
                cssSelector,
                zeroPii,
            });
            storage.saveRun(run);

            if (isSingle && run.pages[0]) {
                console.log(run.pages[0].markdown);
            } else {
                const bundle = generateLlmsBundle(run);
                console.log(bundle.llmsTxt);
                console.error(
                    `\n✅ Gespeichert unter Run-ID: ${run.id} (Health-Score: ${run.summary.healthScore}/100, ~${run.summary.totalEstimatedTokens} Tokens)`,
                );
            }
        } catch (error) {
            console.error(`❌ Fehler: ${error instanceof Error ? error.message : String(error)}`);
            process.exitCode = 1;
        } finally {
            storage.close();
        }
        return;
    }

    if (command === 'list') {
        const runs = storage.listRuns(30);
        if (runs.length === 0) {
            console.log('Noch keine gespeicherten Crawl-Läufe vorhanden.');
        } else {
            console.log(
                'ID                                   | Datum                | Domain                    | Seiten | Tokens  | Health',
            );
            console.log('-'.repeat(115));
            for (const r of runs) {
                console.log(
                    `${r.id} | ${r.startedAt.slice(0, 19)} | ${r.domain.padEnd(25).slice(0, 25)} | ${String(r.summary.successfulPages).padStart(6)} | ${String(r.summary.totalEstimatedTokens).padStart(7)} | ${r.summary.healthScore}/100`,
                );
            }
        }
        storage.close();
        return;
    }

    if (command === 'report') {
        const runId = args[1];
        if (!runId) {
            console.error('Fehler: Bitte eine Run-ID angeben (`./crawl-pulse list` zeigt alle IDs).');
            process.exitCode = 1;
            storage.close();
            return;
        }
        const run = storage.getRun(runId);
        if (!run) {
            console.error(`Fehler: Crawl-Lauf "${runId}" nicht gefunden.`);
            process.exitCode = 1;
            storage.close();
            return;
        }

        const formatIdx = args.indexOf('--format');
        const format = formatIdx >= 0 ? args[formatIdx + 1] : 'summary';

        if (format === 'llms-full') {
            console.log(generateLlmsBundle(run).llmsFullMd);
        } else if (format === 'llms-txt') {
            console.log(generateLlmsBundle(run).llmsTxt);
        } else if (format === 'json') {
            console.log(JSON.stringify(run, null, 2));
        } else {
            const analysis = await analyzeCrawlWithAi({
                run,
                config: storage.getAiConfig(),
                mode: 'summary',
            });
            console.log(analysis.output);
        }
        storage.close();
        return;
    }

    if (command === 'tui') {
        await runInteractiveTui(storage);
        storage.close();
        return;
    }

    printHelp();
    storage.close();
}

async function runInteractiveTui(storage: CrawlStorage): Promise<void> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        console.log('\n╔══════════════════════════════════════════════════════════════════╗');
        console.log('║  🕸️  CrawlPulse TUI — Interaktives Terminal-Steuerzentrum        ║');
        console.log('╚══════════════════════════════════════════════════════════════════╝');

        while (true) {
            const runs = storage.listRuns(10);
            console.log('\nLetzte gespeicherte Crawl-Läufe:');
            if (runs.length === 0) {
                console.log('  (Noch keine Läufe gespeichert)');
            } else {
                runs.forEach((r, i) => {
                    console.log(
                        `  [${i + 1}] ${r.domain} (${r.summary.successfulPages} S., ~${r.summary.totalEstimatedTokens} Tok., Health ${r.summary.healthScore}/100) - ${r.startedAt.slice(0, 19)}`,
                    );
                });
            }

            console.log('\nAktionen: [N] Neuer Scrape/Crawl | [1-9] Lauf inspizieren | [Q] Beenden');
            const answer = (await rl.question('Auswahl > ')).trim();

            if (answer.toLowerCase() === 'q') {
                break;
            }

            if (answer.toLowerCase() === 'n') {
                const url = (await rl.question('Ziel-URL (https://...) > ')).trim();
                if (!url) continue;
                const engine = new CrawlEngine();
                try {
                    const run = await engine.run({ url, mode: 'crawl', maxPages: 10, maxDepth: 1 });
                    storage.saveRun(run);
                    console.log(
                        `✓ Crawl abgeschlossen: ${run.summary.successfulPages} Seiten, Health ${run.summary.healthScore}/100`,
                    );
                } catch (e) {
                    console.log(`❌ Fehler: ${e instanceof Error ? e.message : String(e)}`);
                }
                continue;
            }

            const idx = Number.parseInt(answer, 10) - 1;
            if (!Number.isNaN(idx) && runs[idx]) {
                const full = storage.getRun(runs[idx].id);
                if (full) {
                    const aiRes = await analyzeCrawlWithAi({
                        run: full,
                        config: storage.getAiConfig(),
                        mode: 'summary',
                    });
                    console.log('\n' + aiRes.output);
                }
            }
        }
    } finally {
        rl.close();
    }
}

function printHelp(): void {
    console.log(`
🕸️  CrawlPulse — Lokale Web-Crawl, Markdown & KI-Kontext-Engine (Zero-Dependency TypeScript)

Verwendung:
  ./crawl-pulse gui [--port 8985]                 Startet das Web-Dashboard im Browser (http://127.0.0.1:8985)
  ./crawl-pulse tui                               Startet das interaktive Terminal-Menü (TUI)
  ./crawl-pulse scrape <url> [--zero-pii]         Extrahiert eine einzelne Seite als sauberes LLM-Markdown
  ./crawl-pulse crawl <url> [--max-pages 15]      Crawlt eine Domain inkl. Sitemap & speichert den Bericht
  ./crawl-pulse list                              Listet alle lokal gespeicherten Crawl-Läufe (SQLite)
  ./crawl-pulse report <runId> [--format ...]     Gibt Executive Summary, llms-full, llms-txt oder JSON aus
  ./crawl-pulse mcp                               Startet den Model Context Protocol (MCP) Server über stdio
`);
}
