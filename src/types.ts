// SPDX-License-Identifier: MIT
export type CrawlMode = 'single' | 'crawl' | 'sitemap';

export interface CrawlOptions {
    url: string;
    mode: CrawlMode;
    maxPages: number;
    maxDepth: number;
    concurrency: number;
    timeoutMs: number;
    maxBytes: number;
    respectRobotsTxt: boolean;
    includePatterns: string[];
    excludePatterns: string[];
    cssSelector?: string;
    stripHiddenElements: boolean;
    zeroPii: boolean;
    allowLocalhostForTesting?: boolean;
}

export interface ExtractedLink {
    href: string;
    text: string;
    isInternal: boolean;
}

export interface ExtractedImage {
    src: string;
    alt: string;
    hasAlt: boolean;
}

export interface PageHeading {
    level: number;
    text: string;
}

export interface PageAuditIssue {
    code: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
    explanation?: string;
    suggestion?: string;
}

export interface AiCrawlerAccess {
    bot: string;
    explanation: string;
    status: 'allowed' | 'blocked' | 'unknown';
    suggestion: string;
}

export interface CrawledPage {
    url: string;
    normalizedUrl: string;
    depth: number;
    status: number;
    statusText: string;
    contentType: string;
    title: string;
    description: string;
    canonicalUrl: string;
    language: string;
    markdown: string;
    cleanedHtml: string;
    wordCount: number;
    estimatedTokens: number;
    responseTimeMs: number;
    headings: PageHeading[];
    links: ExtractedLink[];
    images: ExtractedImage[];
    jsonLd: unknown[];
    openGraph: Record<string, string>;
    customExtracted: string[];
    auditIssues: PageAuditIssue[];
    promptInjectionsRemoved: number;
    piiRedactedCount: number;
    citationQuote?: string;
    error?: string;
    crawledAt: string;
}

export interface CrawlSummaryReport {
    totalPages: number;
    successfulPages: number;
    failedPages: number;
    blockedBySsrf: number;
    totalWords: number;
    totalEstimatedTokens: number;
    averageResponseTimeMs: number;
    missingTitleCount: number;
    missingDescriptionCount: number;
    missingH1Count: number;
    multipleH1Count: number;
    imagesWithoutAltCount: number;
    brokenLinksCount: number;
    jsonLdPagesCount: number;
    promptInjectionsNeutralized: number;
    piiRedactedTotal: number;
    healthScore: number;
    aiCrawlerAccess?: AiCrawlerAccess[];
    citationFindingCount?: number;
}

export interface CrawlRun {
    id: string;
    rootUrl: string;
    domain: string;
    mode: CrawlMode;
    status: 'running' | 'completed' | 'stopped' | 'failed';
    startedAt: string;
    finishedAt?: string;
    options: CrawlOptions;
    summary: CrawlSummaryReport;
    pages: CrawledPage[];
}

export interface CrawlProgressEvent {
    runId: string;
    type: 'started' | 'page' | 'blocked' | 'completed' | 'stopped' | 'error';
    url?: string;
    depth?: number;
    status?: number;
    pagesProcessed: number;
    maxPages: number;
    queueSize: number;
    message: string;
    page?: CrawledPage;
    summary?: CrawlSummaryReport;
}

export type AiProviderType = 'ollama' | 'lmstudio' | 'openai-compatible' | 'heuristic';

export interface AiConfig {
    provider: AiProviderType;
    baseUrl: string;
    apiKey?: string;
    model: string;
    zeroPii: boolean;
}

export interface AiAnalysisResult {
    providerUsed: string;
    modelUsed: string;
    zeroPiiApplied: boolean;
    piiRedactedCount: number;
    mode: 'summary' | 'schema' | 'qa';
    output: string;
    structuredData?: unknown;
    sourcesUsed: string[];
    generatedAt: string;
}
