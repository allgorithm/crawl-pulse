// SPDX-License-Identifier: MIT
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AiConfig, CrawledPage, CrawlOptions, CrawlRun, CrawlSummaryReport } from './types.ts';

export interface RunDiffResult {
    runAId: string;
    runBId: string;
    addedUrls: string[];
    removedUrls: string[];
    changedPages: Array<{
        url: string;
        oldTitle: string;
        newTitle: string;
        oldTokens: number;
        newTokens: number;
    }>;
    healthScoreDelta: number;
    totalTokensDelta: number;
}

export class CrawlStorage {
    private readonly db: DatabaseSync;

    public constructor(dbPath?: string) {
        const candidates = dbPath
            ? [dbPath]
            : [
                  process.env.CRAWL_PULSE_DB,
                  join(homedir(), '.crawl-pulse', 'crawl-pulse.db'),
                  '/tmp/crawl-pulse/crawl-pulse.db',
                  ':memory:',
              ].filter((c): c is string => Boolean(c));

        let openedDb: DatabaseSync | null = null;
        for (const candidate of candidates) {
            try {
                if (candidate !== ':memory:') {
                    mkdirSync(dirname(candidate), { recursive: true });
                }
                openedDb = new DatabaseSync(candidate);
                break;
            } catch {
                // Nächsten Kandidaten probieren (z. B. /tmp oder :memory: in restriktiven Umgebungen)
            }
        }

        this.db = openedDb ?? new DatabaseSync(':memory:');
        this.initSchema();
    }

    private initSchema(): void {
        this.db.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS crawl_runs (
                id TEXT PRIMARY KEY,
                root_url TEXT NOT NULL,
                domain TEXT NOT NULL,
                mode TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                options_json TEXT NOT NULL,
                summary_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS crawled_pages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                url TEXT NOT NULL,
                normalized_url TEXT NOT NULL,
                depth INTEGER NOT NULL,
                status INTEGER NOT NULL,
                title TEXT NOT NULL,
                word_count INTEGER NOT NULL,
                estimated_tokens INTEGER NOT NULL,
                page_json TEXT NOT NULL,
                FOREIGN KEY (run_id) REFERENCES crawl_runs(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_crawled_pages_run_id ON crawled_pages(run_id);

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL
            );
        `);
    }

    public saveRun(run: CrawlRun): void {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const upsertRun = this.db.prepare(`
                INSERT INTO crawl_runs (
                    id, root_url, domain, mode, status, started_at, finished_at, options_json, summary_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    status = excluded.status,
                    finished_at = excluded.finished_at,
                    options_json = excluded.options_json,
                    summary_json = excluded.summary_json
            `);

            upsertRun.run(
                run.id,
                run.rootUrl,
                run.domain,
                run.mode,
                run.status,
                run.startedAt,
                run.finishedAt ?? null,
                JSON.stringify(run.options),
                JSON.stringify(run.summary),
            );

            const deleteOldPages = this.db.prepare('DELETE FROM crawled_pages WHERE run_id = ?');
            deleteOldPages.run(run.id);

            const insertPage = this.db.prepare(`
                INSERT INTO crawled_pages (
                    run_id, url, normalized_url, depth, status, title, word_count, estimated_tokens, page_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const page of run.pages) {
                insertPage.run(
                    run.id,
                    page.url,
                    page.normalizedUrl,
                    page.depth,
                    page.status,
                    page.title,
                    page.wordCount,
                    page.estimatedTokens,
                    JSON.stringify(page),
                );
            }

            this.db.exec('COMMIT');
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }

    public listRuns(limit = 50): Array<Omit<CrawlRun, 'pages'>> {
        const stmt = this.db.prepare(`
            SELECT id, root_url, domain, mode, status, started_at, finished_at, options_json, summary_json
            FROM crawl_runs
            ORDER BY started_at DESC
            LIMIT ?
        `);

        const rows = stmt.all(limit) as Array<{
            id: string;
            root_url: string;
            domain: string;
            mode: CrawlRun['mode'];
            status: CrawlRun['status'];
            started_at: string;
            finished_at: string | null;
            options_json: string;
            summary_json: string;
        }>;

        return rows.map((row) => ({
            id: row.id,
            rootUrl: row.root_url,
            domain: row.domain,
            mode: row.mode,
            status: row.status,
            startedAt: row.started_at,
            finishedAt: row.finished_at ?? undefined,
            options: JSON.parse(row.options_json) as CrawlOptions,
            summary: JSON.parse(row.summary_json) as CrawlSummaryReport,
        }));
    }

    public getRun(id: string): CrawlRun | null {
        const runStmt = this.db.prepare(`
            SELECT id, root_url, domain, mode, status, started_at, finished_at, options_json, summary_json
            FROM crawl_runs
            WHERE id = ?
        `);

        const row = runStmt.get(id) as
            | {
                  id: string;
                  root_url: string;
                  domain: string;
                  mode: CrawlRun['mode'];
                  status: CrawlRun['status'];
                  started_at: string;
                  finished_at: string | null;
                  options_json: string;
                  summary_json: string;
              }
            | undefined;

        if (!row) {
            return null;
        }

        const pagesStmt = this.db.prepare(`
            SELECT page_json FROM crawled_pages WHERE run_id = ? ORDER BY id ASC
        `);
        const pageRows = pagesStmt.all(id) as Array<{ page_json: string }>;
        const pages = pageRows.map((p) => JSON.parse(p.page_json) as CrawledPage);

        return {
            id: row.id,
            rootUrl: row.root_url,
            domain: row.domain,
            mode: row.mode,
            status: row.status,
            startedAt: row.started_at,
            finishedAt: row.finished_at ?? undefined,
            options: JSON.parse(row.options_json) as CrawlOptions,
            summary: JSON.parse(row.summary_json) as CrawlSummaryReport,
            pages,
        };
    }

    public deleteRun(id: string): boolean {
        const stmt = this.db.prepare('DELETE FROM crawl_runs WHERE id = ?');
        const res = stmt.run(id);
        return Number(res.changes) > 0;
    }

    public compareRuns(runAId: string, runBId: string): RunDiffResult | null {
        const runA = this.getRun(runAId);
        const runB = this.getRun(runBId);
        if (!runA || !runB) {
            return null;
        }

        const mapA = new Map<string, CrawledPage>();
        for (const p of runA.pages) {
            mapA.set(p.normalizedUrl, p);
        }

        const mapB = new Map<string, CrawledPage>();
        for (const p of runB.pages) {
            mapB.set(p.normalizedUrl, p);
        }

        const addedUrls: string[] = [];
        const removedUrls: string[] = [];
        const changedPages: RunDiffResult['changedPages'] = [];

        for (const [url, pageB] of mapB.entries()) {
            const pageA = mapA.get(url);
            if (!pageA) {
                addedUrls.push(url);
            } else if (pageA.markdown !== pageB.markdown || pageA.title !== pageB.title) {
                changedPages.push({
                    url,
                    oldTitle: pageA.title,
                    newTitle: pageB.title,
                    oldTokens: pageA.estimatedTokens,
                    newTokens: pageB.estimatedTokens,
                });
            }
        }

        for (const url of mapA.keys()) {
            if (!mapB.has(url)) {
                removedUrls.push(url);
            }
        }

        return {
            runAId,
            runBId,
            addedUrls,
            removedUrls,
            changedPages,
            healthScoreDelta: runB.summary.healthScore - runA.summary.healthScore,
            totalTokensDelta: runB.summary.totalEstimatedTokens - runA.summary.totalEstimatedTokens,
        };
    }

    public getAiConfig(): AiConfig {
        const stmt = this.db.prepare('SELECT value_json FROM settings WHERE key = ?');
        const row = stmt.get('ai_config') as { value_json: string } | undefined;
        if (row) {
            try {
                return JSON.parse(row.value_json) as AiConfig;
            } catch {
                // Fallback
            }
        }
        return {
            provider: 'ollama',
            baseUrl: 'http://127.0.0.1:11434',
            model: 'qwen2.5-coder:7b',
            zeroPii: true,
        };
    }

    public saveAiConfig(config: AiConfig): void {
        const stmt = this.db.prepare(`
            INSERT INTO settings (key, value_json) VALUES ('ai_config', ?)
            ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
        `);
        stmt.run(JSON.stringify(config));
    }

    public close(): void {
        this.db.close();
    }
}
