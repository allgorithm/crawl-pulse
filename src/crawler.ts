// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { annotateCrawlCitation, countCitationFindings } from './citation.ts';
import { extractPageFromHtml } from './extractor.ts';
import {
    type DnsLookupFn,
    normalizeUrl,
    safeFetchText,
    SsrfBlockedError,
    validateSafeUrl,
} from './security.ts';
import type {
    AiCrawlerAccess,
    CrawledPage,
    CrawlOptions,
    CrawlProgressEvent,
    CrawlRun,
    CrawlSummaryReport,
} from './types.ts';

export function parseRobotsTxt(robotsContent: string): string[] {
    const disallowed: string[] = [];
    const lines = robotsContent.split(/\r?\n/);
    let appliesToUs = false;

    for (const rawLine of lines) {
        const line = rawLine.split('#')[0].trim();
        if (!line) {
            continue;
        }
        const [directiveRaw, ...valueParts] = line.split(':');
        const directive = directiveRaw.trim().toLowerCase();
        const value = valueParts.join(':').trim();

        if (directive === 'user-agent') {
            const ua = value.toLowerCase();
            appliesToUs = ua === '*' || ua.includes('crawlpulse');
        } else if (directive === 'disallow' && appliesToUs && value) {
            disallowed.push(value);
        }
    }

    return disallowed;
}

export function isAllowedByRobots(pathname: string, disallowedRules: string[]): boolean {
    for (const rule of disallowedRules) {
        if (rule === '/') {
            return false;
        }
        const cleanRule = rule.replace(/\*+$/, '');
        if (cleanRule && pathname.startsWith(cleanRule)) {
            return false;
        }
    }
    return true;
}

export function parseSitemapXml(xml: string): string[] {
    const urls: string[] = [];
    const locRegex = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
    let match: RegExpExecArray | null;
    while ((match = locRegex.exec(xml)) !== null) {
        const raw = match[1]
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
            .replace(/&amp;/g, '&')
            .trim();
        if (raw.startsWith('http://') || raw.startsWith('https://')) {
            urls.push(raw);
        }
    }
    return Array.from(new Set(urls));
}

export function matchesPathPatterns(
    urlString: string,
    includePatterns: string[],
    excludePatterns: string[],
): boolean {
    let pathAndQuery = urlString;
    try {
        const parsed = new URL(urlString);
        pathAndQuery = parsed.pathname + parsed.search;
    } catch {
        pathAndQuery = urlString;
    }

    const matchPattern = (target: string, pattern: string): boolean => {
        const trimmed = pattern.trim();
        if (!trimmed) {
            return false;
        }
        const escaped = trimmed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        return new RegExp(escaped, 'i').test(target);
    };

    for (const ex of excludePatterns) {
        if (ex.trim() && matchPattern(pathAndQuery, ex)) {
            return false;
        }
    }

    const activeIncludes = includePatterns.filter((p) => p.trim() !== '');
    if (activeIncludes.length === 0) {
        return true;
    }

    return activeIncludes.some((inc) => matchPattern(pathAndQuery, inc));
}

export function computeSummaryReport(
    pages: CrawledPage[],
    blockedBySsrf: number,
    aiCrawlerAccess: AiCrawlerAccess[] = [],
): CrawlSummaryReport {
    const totalPages = pages.length;
    const successfulPages = pages.filter((p) => p.status >= 200 && p.status < 400 && !p.error).length;
    const failedPages = totalPages - successfulPages;
    const totalWords = pages.reduce((acc, p) => acc + p.wordCount, 0);
    const totalEstimatedTokens = pages.reduce((acc, p) => acc + p.estimatedTokens, 0);
    const averageResponseTimeMs =
        totalPages > 0 ? Math.round(pages.reduce((acc, p) => acc + p.responseTimeMs, 0) / totalPages) : 0;

    const missingTitleCount = pages.filter((p) => p.auditIssues.some((i) => i.code === 'MISSING_TITLE')).length;
    const missingDescriptionCount = pages.filter((p) =>
        p.auditIssues.some((i) => i.code === 'MISSING_META_DESCRIPTION'),
    ).length;
    const missingH1Count = pages.filter((p) => p.auditIssues.some((i) => i.code === 'MISSING_H1')).length;
    const multipleH1Count = pages.filter((p) => p.auditIssues.some((i) => i.code === 'MULTIPLE_H1')).length;
    const imagesWithoutAltCount = pages.reduce(
        (acc, p) => acc + p.images.filter((img) => !img.hasAlt).length,
        0,
    );
    const brokenLinksCount = pages.filter((p) => p.status >= 400).length;
    const jsonLdPagesCount = pages.filter((p) => p.jsonLd.length > 0).length;
    const promptInjectionsNeutralized = pages.reduce((acc, p) => acc + p.promptInjectionsRemoved, 0);
    const piiRedactedTotal = pages.reduce((acc, p) => acc + p.piiRedactedCount, 0);

    let healthScore = 100;
    if (totalPages > 0) {
        const errorRatio = failedPages / totalPages;
        const missingTitleRatio = missingTitleCount / totalPages;
        const missingDescRatio = missingDescriptionCount / totalPages;
        const missingH1Ratio = missingH1Count / totalPages;

        healthScore -= Math.round(errorRatio * 40);
        healthScore -= Math.round(missingTitleRatio * 20);
        healthScore -= Math.round(missingDescRatio * 15);
        healthScore -= Math.round(missingH1Ratio * 15);
        if (imagesWithoutAltCount > 0) {
            healthScore -= Math.min(10, imagesWithoutAltCount * 2);
        }
        healthScore = Math.max(0, Math.min(100, healthScore));
    }

    return {
        totalPages,
        successfulPages,
        failedPages,
        blockedBySsrf,
        totalWords,
        totalEstimatedTokens,
        averageResponseTimeMs,
        missingTitleCount,
        missingDescriptionCount,
        missingH1Count,
        multipleH1Count,
        imagesWithoutAltCount,
        brokenLinksCount,
        jsonLdPagesCount,
        promptInjectionsNeutralized,
        piiRedactedTotal,
        healthScore,
        aiCrawlerAccess,
        citationFindingCount: countCitationFindings(pages),
    };
}

/**
 * Erzeugt aus einem Crawl-Lauf ein standardisiertes `llms.txt` Verzeichnis
 * sowie ein vollständiges `llms-full.md` Kontext-Dokument für KI-Systeme.
 */
export function generateLlmsBundle(run: CrawlRun): {
    llmsTxt: string;
    llmsFullMd: string;
} {
    const linesTxt: string[] = [
        `# ${run.domain}`,
        '',
        `> Automatisch extrahierter KI-Kontext-Index von ${run.rootUrl} (${run.summary.successfulPages} Seiten, ~${run.summary.totalEstimatedTokens} Tokens).`,
        '',
        '## Seitenverzeichnis',
        '',
    ];

    const linesFull: string[] = [
        `# Vollständiger Website-Kontext: ${run.domain}`,
        '',
        `- **Quelle:** ${run.rootUrl}`,
        `- **Erstellt am:** ${run.startedAt}`,
        `- **Erfasste Seiten:** ${run.summary.successfulPages} / ${run.summary.totalPages}`,
        `- **Geschätzte LLM-Tokens:** ${run.summary.totalEstimatedTokens}`,
        `- **Health-Score:** ${run.summary.healthScore}/100`,
        '',
        '## Inhaltsverzeichnis',
        '',
    ];

    run.pages.forEach((page, idx) => {
        const desc = page.description ? `: ${page.description}` : '';
        linesTxt.push(`- [${page.title || page.url}](${page.url})${desc}`);
        linesFull.push(`${idx + 1}. [${page.title || page.url}](${page.url}) (~${page.estimatedTokens} Tokens)`);
    });

    linesFull.push('', '---', '');

    for (const page of run.pages) {
        linesFull.push(`## Seite: ${page.title || page.url}`);
        linesFull.push(`- **URL:** ${page.url}`);
        linesFull.push(`- **Status:** ${page.status} | **Wörter:** ${page.wordCount} | **Tokens:** ~${page.estimatedTokens}`);
        if (page.description) {
            linesFull.push(`- **Beschreibung:** ${page.description}`);
        }
        if (page.jsonLd.length > 0) {
            linesFull.push(`- **Schema.org JSON-LD:** \`${JSON.stringify(page.jsonLd)}\``);
        }
        linesFull.push('', page.markdown || '*(Kein Textinhalt extrahiert)*', '', '---', '');
    }

    return {
        llmsTxt: linesTxt.join('\n'),
        llmsFullMd: linesFull.join('\n'),
    };
}

export interface CrawlEngineDependencies {
    fetchImpl?: typeof fetch;
    lookupFn?: DnsLookupFn;
}

export class CrawlEngine extends EventEmitter {
    private stopped = false;
    private readonly deps: CrawlEngineDependencies;

    public constructor(deps: CrawlEngineDependencies = {}) {
        super();
        this.deps = deps;
    }

    public stop(): void {
        this.stopped = true;
    }

    public async run(rawOptions: Partial<CrawlOptions> & { url: string }, existingId?: string): Promise<CrawlRun> {
        this.stopped = false;
        const runId = existingId ?? randomUUID();

        const options: CrawlOptions = {
            url: rawOptions.url.trim(),
            mode: rawOptions.mode ?? 'crawl',
            maxPages: Math.min(Math.max(rawOptions.maxPages ?? 25, 1), 200),
            maxDepth: Math.min(Math.max(rawOptions.maxDepth ?? 2, 0), 5),
            concurrency: Math.min(Math.max(rawOptions.concurrency ?? 3, 1), 8),
            timeoutMs: Math.min(Math.max(rawOptions.timeoutMs ?? 12_000, 1_000), 60_000),
            maxBytes: Math.min(Math.max(rawOptions.maxBytes ?? 5 * 1024 * 1024, 10_240), 25 * 1024 * 1024),
            respectRobotsTxt: rawOptions.respectRobotsTxt ?? true,
            includePatterns: rawOptions.includePatterns ?? [],
            excludePatterns: rawOptions.excludePatterns ?? [],
            cssSelector: rawOptions.cssSelector,
            stripHiddenElements: rawOptions.stripHiddenElements ?? true,
            zeroPii: rawOptions.zeroPii ?? false,
            allowLocalhostForTesting: rawOptions.allowLocalhostForTesting ?? false,
        };

        if (options.mode === 'single') {
            options.maxPages = 1;
            options.maxDepth = 0;
        }

        // Validiere Start-URL sofort fail-closed gegen SSRF
        const validatedStartUrl = await validateSafeUrl(options.url, {
            allowLocalhostForTesting: options.allowLocalhostForTesting,
            lookupFn: this.deps.lookupFn,
        });

        const rootNormalized = normalizeUrl(validatedStartUrl.toString()) ?? validatedStartUrl.toString();
        const domain = validatedStartUrl.hostname.toLowerCase();
        const origin = validatedStartUrl.origin;

        const startedAt = new Date().toISOString();
        const pages: CrawledPage[] = [];
        let blockedBySsrf = 0;

        this.emitProgress({
            runId,
            type: 'started',
            url: rootNormalized,
            pagesProcessed: 0,
            maxPages: options.maxPages,
            queueSize: 1,
            message: `Starte Crawl (${options.mode}) für ${rootNormalized}`,
        });

        // robots.txt einmal laden: für die Crawl-Filter und für den KI-Zitierbarkeitsbericht.
        let disallowedRules: string[] = [];
        let robotsTxt: string | null = null;
        try {
            const robotsRes = await safeFetchText(`${origin}/robots.txt`, {
                timeoutMs: 4_000,
                maxBytes: 256 * 1024,
                allowLocalhostForTesting: options.allowLocalhostForTesting,
                lookupFn: this.deps.lookupFn,
                fetchImpl: this.deps.fetchImpl,
            });
            if (robotsRes.status === 200) {
                robotsTxt = robotsRes.body;
                if (options.respectRobotsTxt && options.mode !== 'single') {
                    disallowedRules = parseRobotsTxt(robotsTxt);
                }
            }
        } catch {
            robotsTxt = null;
        }

        const queue: Array<{ url: string; depth: number }> = [{ url: rootNormalized, depth: 0 }];
        const visited = new Set<string>([rootNormalized]);

        // 2. Falls Sitemap-Modus, versuche zusätzlich sitemap.xml einzulesen
        if (options.mode === 'sitemap') {
            try {
                const sitemapUrl = rootNormalized.endsWith('.xml') ? rootNormalized : `${origin}/sitemap.xml`;
                const sitemapRes = await safeFetchText(sitemapUrl, {
                    timeoutMs: options.timeoutMs,
                    maxBytes: options.maxBytes,
                    allowLocalhostForTesting: options.allowLocalhostForTesting,
                    lookupFn: this.deps.lookupFn,
                    fetchImpl: this.deps.fetchImpl,
                });
                if (sitemapRes.status === 200 && sitemapRes.body.includes('<loc>')) {
                    const discovered = parseSitemapXml(sitemapRes.body);
                    for (const loc of discovered) {
                        const norm = normalizeUrl(loc);
                        if (norm && !visited.has(norm) && visited.size < options.maxPages * 3) {
                            visited.add(norm);
                            queue.push({ url: norm, depth: 1 });
                        }
                    }
                }
            } catch {
                // Fallback auf normalen Crawl ab Start-URL
            }
        }

        // 3. BFS-Abarbeitung mit kontrollierter Parallelität
        while (queue.length > 0 && pages.length < options.maxPages && !this.stopped) {
            const remainingSlots = options.maxPages - pages.length;
            const batchSize = Math.min(options.concurrency, queue.length, remainingSlots);
            const batch = queue.splice(0, batchSize);

            const batchResults = await Promise.all(
                batch.map(async (item) => {
                    if (this.stopped) {
                        return null;
                    }

                    try {
                        const parsedTarget = new URL(item.url);
                        if (
                            options.respectRobotsTxt &&
                            !isAllowedByRobots(parsedTarget.pathname, disallowedRules)
                        ) {
                            return null;
                        }

                        const fetchResult = await safeFetchText(item.url, {
                            timeoutMs: options.timeoutMs,
                            maxBytes: options.maxBytes,
                            allowLocalhostForTesting: options.allowLocalhostForTesting,
                            lookupFn: this.deps.lookupFn,
                            fetchImpl: this.deps.fetchImpl,
                        });

                        const finalNormalized = normalizeUrl(fetchResult.finalUrl) ?? item.url;
                        const page = extractPageFromHtml({
                            url: fetchResult.finalUrl,
                            normalizedUrl: finalNormalized,
                            depth: item.depth,
                            status: fetchResult.status,
                            statusText: fetchResult.statusText,
                            contentType: fetchResult.contentType,
                            rawHtml: fetchResult.body,
                            responseTimeMs: fetchResult.responseTimeMs,
                            cssSelector: options.cssSelector,
                            stripHiddenElements: options.stripHiddenElements,
                            zeroPii: options.zeroPii,
                        });

                        return { item, page };
                    } catch (error) {
                        if (error instanceof SsrfBlockedError) {
                            blockedBySsrf++;
                            this.emitProgress({
                                runId,
                                type: 'blocked',
                                url: item.url,
                                depth: item.depth,
                                pagesProcessed: pages.length,
                                maxPages: options.maxPages,
                                queueSize: queue.length,
                                message: error.message,
                            });
                            return null;
                        }

                        const errMessage = error instanceof Error ? error.message : String(error);
                        const failedPage: CrawledPage = {
                            url: item.url,
                            normalizedUrl: item.url,
                            depth: item.depth,
                            status: 0,
                            statusText: 'ERROR',
                            contentType: '',
                            title: item.url,
                            description: '',
                            canonicalUrl: '',
                            language: '',
                            markdown: '',
                            cleanedHtml: '',
                            wordCount: 0,
                            estimatedTokens: 0,
                            responseTimeMs: 0,
                            headings: [],
                            links: [],
                            images: [],
                            jsonLd: [],
                            openGraph: {},
                            customExtracted: [],
                            auditIssues: [
                                {
                                    code: 'FETCH_ERROR',
                                    severity: 'error',
                                    message: errMessage,
                                },
                            ],
                            promptInjectionsRemoved: 0,
                            piiRedactedCount: 0,
                            error: errMessage,
                            crawledAt: new Date().toISOString(),
                        };

                        return { item, page: failedPage };
                    }
                }),
            );

            for (const res of batchResults) {
                if (!res || pages.length >= options.maxPages) {
                    continue;
                }

                pages.push(res.page);

                // Neue interne Links in die Queue aufnehmen, falls Tiefe erlaubt
                if (options.mode !== 'single' && res.item.depth < options.maxDepth) {
                    for (const link of res.page.links) {
                        if (!link.isInternal) {
                            continue;
                        }
                        if (visited.has(link.href)) {
                            continue;
                        }
                        if (!matchesPathPatterns(link.href, options.includePatterns, options.excludePatterns)) {
                            continue;
                        }
                        visited.add(link.href);
                        queue.push({ url: link.href, depth: res.item.depth + 1 });
                    }
                }

                this.emitProgress({
                    runId,
                    type: 'page',
                    url: res.page.url,
                    depth: res.page.depth,
                    status: res.page.status,
                    pagesProcessed: pages.length,
                    maxPages: options.maxPages,
                    queueSize: queue.length,
                    message: `Erfasst (${pages.length}/${options.maxPages}): ${res.page.title || res.page.url}`,
                    page: res.page,
                });
            }
        }

        const citation = annotateCrawlCitation(pages, robotsTxt);
        const summary = computeSummaryReport(citation.pages, blockedBySsrf, citation.aiCrawlerAccess);
        const finalStatus = this.stopped ? 'stopped' : 'completed';

        const runResult: CrawlRun = {
            id: runId,
            rootUrl: rootNormalized,
            domain,
            mode: options.mode,
            status: finalStatus,
            startedAt,
            finishedAt: new Date().toISOString(),
            options,
            summary,
            pages: citation.pages,
        };

        this.emitProgress({
            runId,
            type: finalStatus,
            pagesProcessed: pages.length,
            maxPages: options.maxPages,
            queueSize: 0,
            message:
                finalStatus === 'stopped'
                    ? `Crawl durch Benutzer gestoppt (${pages.length} Seiten).`
                    : `Crawl abgeschlossen: ${pages.length} Seiten, ~${summary.totalEstimatedTokens} Tokens, Health-Score ${summary.healthScore}/100.`,
            summary,
        });

        return runResult;
    }

    private emitProgress(event: CrawlProgressEvent): void {
        this.emit('progress', event);
    }
}
