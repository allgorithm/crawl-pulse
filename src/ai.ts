// SPDX-License-Identifier: MIT
import { spawn } from 'node:child_process';
import { isCitationIssueCode } from './citation.ts';
import { scrubPii } from './security.ts';
import type { AiAnalysisResult, AiConfig, CrawledPage, CrawlRun } from './types.ts';

export interface DiscoveredAiStatus {
    ollamaAvailable: boolean;
    ollamaModels: string[];
    lmStudioAvailable: boolean;
    lmStudioModels: string[];
}

export async function discoverLocalAiModels(fetchImpl: typeof fetch = fetch): Promise<DiscoveredAiStatus> {
    const status: DiscoveredAiStatus = {
        ollamaAvailable: false,
        ollamaModels: [],
        lmStudioAvailable: false,
        lmStudioModels: [],
    };

    // 1. Prüfe lokales Ollama (127.0.0.1:11434)
    try {
        const res = await fetchImpl('http://127.0.0.1:11434/api/tags', {
            signal: AbortSignal.timeout(1_200),
        });
        if (res.ok) {
            const data = (await res.json()) as { models?: Array<{ name?: string }> };
            status.ollamaAvailable = true;
            status.ollamaModels = (data.models ?? [])
                .map((m) => m.name ?? '')
                .filter((n) => n.length > 0);
        }
    } catch {
        // Ollama läuft aktuell nicht
    }

    // 2. Prüfe lokales LM Studio (127.0.0.1:1234)
    try {
        const res = await fetchImpl('http://127.0.0.1:1234/v1/models', {
            signal: AbortSignal.timeout(1_200),
        });
        if (res.ok) {
            const data = (await res.json()) as { data?: Array<{ id?: string }> };
            status.lmStudioAvailable = true;
            status.lmStudioModels = (data.data ?? [])
                .map((m) => m.id ?? '')
                .filter((n) => n.length > 0);
        }
    } catch {
        // LM Studio läuft aktuell nicht
    }

    return status;
}

const LOCAL_MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

const LOCAL_RUNTIMES = {
    ollama: { appName: 'Ollama', origin: 'http://127.0.0.1:11434' },
    lmstudio: { appName: 'LM Studio', origin: 'http://127.0.0.1:1234' },
} as const;

export type LocalRuntimeProvider = keyof typeof LOCAL_RUNTIMES;

export class LocalModelStartError extends Error {
    public readonly statusCode: number;

    public constructor(message: string, statusCode: number) {
        super(message);
        this.name = 'LocalModelStartError';
        this.statusCode = statusCode;
    }
}

export interface LocalModelStartResult {
    provider: LocalRuntimeProvider;
    runtimeStarted: boolean;
    modelLoaded: boolean;
    model: string;
    models: string[];
}

function modelsFor(status: DiscoveredAiStatus, provider: LocalRuntimeProvider): string[] {
    return provider === 'ollama' ? status.ollamaModels : status.lmStudioModels;
}

function runtimeIsUp(status: DiscoveredAiStatus, provider: LocalRuntimeProvider): boolean {
    return provider === 'ollama' ? status.ollamaAvailable : status.lmStudioAvailable;
}

function assertLocalProvider(provider: unknown): LocalRuntimeProvider {
    if (provider === 'ollama' || provider === 'lmstudio') {
        return provider;
    }
    throw new LocalModelStartError('Nur Ollama und LM Studio lassen sich lokal starten.', 422);
}

function assertModelName(model: string): void {
    if (!LOCAL_MODEL_NAME.test(model)) {
        throw new LocalModelStartError('Der Modellname ist ungültig.', 422);
    }
}

async function runFixedCommand(command: string, args: readonly string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const child = spawn(command, [...args], { stdio: 'ignore' });
        child.on('error', () => {
            reject(new LocalModelStartError('Die lokale Laufzeit konnte nicht gestartet werden.', 502));
        });
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new LocalModelStartError('Die lokale Laufzeit konnte nicht gestartet werden.', 502));
            }
        });
    });
}

export async function defaultLaunchLocalRuntime(provider: LocalRuntimeProvider): Promise<void> {
    const appName = LOCAL_RUNTIMES[provider].appName;
    if (process.platform === 'darwin') {
        await runFixedCommand('open', ['-a', appName]);
        return;
    }
    if (provider === 'ollama') {
        const child = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' });
        child.unref();
        return;
    }
    throw new LocalModelStartError('LM Studio lässt sich hier nur über die installierte App starten.', 422);
}

async function warmLocalModel(provider: LocalRuntimeProvider, model: string, fetchImpl: typeof fetch): Promise<void> {
    const origin = LOCAL_RUNTIMES[provider].origin;
    if (provider === 'ollama') {
        const response = await fetchImpl(`${origin}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: '10m' }),
            signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) {
            throw new LocalModelStartError('Ollama hat das Modell nicht geladen.', 502);
        }
        return;
    }

    const response = await fetchImpl(`${origin}/api/v1/models/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
        signal: AbortSignal.timeout(120_000),
    });
    if (response.ok) {
        return;
    }
    if (response.status !== 404) {
        throw new LocalModelStartError('LM Studio hat das Modell nicht geladen.', 502);
    }

    const fallback = await fetchImpl(`${origin}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ok' }],
        }),
        signal: AbortSignal.timeout(120_000),
    });
    if (!fallback.ok) {
        throw new LocalModelStartError('LM Studio hat das Modell nicht geladen.', 502);
    }
}

export async function startLocalModel(params: {
    provider: unknown;
    model?: unknown;
    fetchImpl?: typeof fetch;
    launchImpl?: (provider: LocalRuntimeProvider) => Promise<void>;
    sleepImpl?: (ms: number) => Promise<void>;
    maxPolls?: number;
}): Promise<LocalModelStartResult> {
    const provider = assertLocalProvider(params.provider);
    const requested = typeof params.model === 'string' ? params.model.trim() : '';
    if (params.model !== undefined && params.model !== null && typeof params.model !== 'string') {
        throw new LocalModelStartError('Der Modellname ist ungültig.', 422);
    }
    if (requested !== '') {
        assertModelName(requested);
    }

    const fetchImpl = params.fetchImpl ?? fetch;
    const launchImpl = params.launchImpl ?? defaultLaunchLocalRuntime;
    const sleepImpl = params.sleepImpl ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    const maxPolls = params.maxPolls ?? 20;

    let discovered = await discoverLocalAiModels(fetchImpl);
    let runtimeStarted = false;
    if (!runtimeIsUp(discovered, provider)) {
        await launchImpl(provider);
        runtimeStarted = true;
        for (let attempt = 0; attempt < maxPolls && !runtimeIsUp(discovered, provider); attempt += 1) {
            discovered = await discoverLocalAiModels(fetchImpl);
            if (runtimeIsUp(discovered, provider)) {
                break;
            }
            await sleepImpl(500);
        }
    }

    if (!runtimeIsUp(discovered, provider)) {
        throw new LocalModelStartError('Die lokale Laufzeit antwortet nicht.', 502);
    }

    const models = modelsFor(discovered, provider);
    const target = requested !== '' ? requested : models.length === 1 ? models[0] : '';
    if (target === '') {
        return { provider, runtimeStarted, modelLoaded: false, model: '', models };
    }
    if (!models.includes(target)) {
        throw new LocalModelStartError('Das Modell steht in der lokalen Liste nicht zur Verfügung.', 422);
    }

    await warmLocalModel(provider, target, fetchImpl);
    return { provider, runtimeStarted, modelLoaded: true, model: target, models };
}

const STOP_WORDS = new Set([
    'zeig', 'zeige', 'zeigen', 'mir', 'mich', 'mein', 'meine', 'dir', 'uns',
    'den', 'dem', 'der', 'die', 'das', 'des', 'ein', 'eine', 'einen', 'einem', 'einer',
    'für', 'fuer', 'und', 'oder', 'mit', 'von', 'vom', 'aus', 'auf', 'bei', 'nach', 'über', 'ueber',
    'wie', 'was', 'wo', 'wer', 'welche', 'welcher', 'welches', 'wann', 'warum',
    'ist', 'sind', 'war', 'wird', 'werden', 'hat', 'haben', 'kann', 'können',
    'bitte', 'alle', 'alles', 'gibt', 'gibts', 'viel', 'viele', 'kostet', 'kosten',
    'preis', 'preise', 'euro', 'eur', 'teuer', 'günstig', 'guenstig', 'billig',
    'the', 'for', 'and', 'with', 'show', 'price', 'prices', 'cost', 'what', 'how', 'much',
]);

const PRICE_QUERY_REGEX = /\b(preis|preise|kosten|kostet|euro|eur|chf|teuer|günstig|guenstig|price|prices|cost)\b|€/i;
const PRICE_VALUE_REGEX = /\d{1,5}(?:[.,]\d{2})\s*(?:€|EUR|CHF|\$)/gi;
const BOILERPLATE_LINE_REGEX = /(warenkorb\s+anzeigen|cart\?action=show|zur\s+kasse|anmelden|registrieren|passwort\s+vergessen)/i;

function extractQueryIntent(query: string): { terms: string[]; isPriceQuery: boolean } {
    const isPriceQuery = PRICE_QUERY_REGEX.test(query);
    const rawTokens = query
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.replace(/[^a-zA-Z0-9äöüß]/g, ''))
        .filter((t) => t.length >= 2);

    const filtered = rawTokens.filter((t) => !STOP_WORDS.has(t));
    // Fallback, falls der Prompt nur aus Stoppwörtern bestand
    const terms = filtered.length > 0 ? filtered : rawTokens.filter((t) => t.length >= 3);
    return { terms, isPriceQuery };
}

function extractRelevantPageContext(page: CrawledPage, query: string, maxChars = 3200): string {
    let body = page.markdown || '';

    // Überspringe Mega-Menü / Header-Navigation, falls eine H1-Hauptüberschrift (# ...) existiert
    const h1Index = body.search(/^#\s+/m);
    if (h1Index > 200) {
        body = body.slice(h1Index);
    }

    if (body.length <= maxChars) {
        return body;
    }

    const { terms, isPriceQuery } = extractQueryIntent(query);
    const blocks = body.split(/\n{2,}/);
    const scored = blocks
        .map((block, idx) => {
            const trimmed = block.trim();
            if (!trimmed || BOILERPLATE_LINE_REGEX.test(trimmed)) {
                return { idx, trimmed, score: -10 };
            }
            const lower = trimmed.toLowerCase();
            let score = idx < 3 ? 2 : 0;
            for (const term of terms) {
                if (lower.includes(term)) {
                    score += 10;
                }
            }
            if (isPriceQuery && PRICE_VALUE_REGEX.test(trimmed)) {
                score += 6;
            }
            PRICE_VALUE_REGEX.lastIndex = 0;
            return { idx, trimmed, score };
        })
        .filter((item) => item.score >= 0);

    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);

    const chosen: Array<{ idx: number; text: string }> = [];
    let totalLen = 0;
    for (const item of scored) {
        if (totalLen + item.trimmed.length + 2 > maxChars) {
            if (chosen.length === 0) {
                chosen.push({ idx: item.idx, text: item.trimmed.slice(0, maxChars) });
            }
            continue;
        }
        chosen.push({ idx: item.idx, text: item.trimmed });
        totalLen += item.trimmed.length + 2;
    }

    chosen.sort((a, b) => a.idx - b.idx);
    return chosen.map((c) => c.text).join('\n\n');
}

export async function analyzeCrawlWithAi(params: {
    run: CrawlRun;
    config: AiConfig;
    mode: 'summary' | 'schema' | 'qa';
    prompt?: string;
    fetchImpl?: typeof fetch;
}): Promise<AiAnalysisResult> {
    const { run, config, mode, prompt = '' } = params;
    const fetchImpl = params.fetchImpl ?? fetch;

    // Wähle relevanteste Seiten anhand des Prompts (Startseite/Hauptseiten bei Übersichtsfragen priorisieren)
    const rankedPages = rankPagesForQuery(run.pages, prompt, mode);
    const selectedPages = rankedPages.slice(0, 6);
    const sourcesUsed = selectedPages.map((p) => p.url);

    const auditBlock = buildAuditContextBlock(run);
    const pagesContext = selectedPages
        .map(
            (p) =>
                `### Quelle: ${p.title} (${p.url})\nBeschreibung: ${p.description || '-'}\nInhalt:\n${extractRelevantPageContext(p, prompt, 2400)}`,
        )
        .join('\n\n---\n\n');

    let combinedContext =
        mode === 'summary' || /\b(seo|bfsg|audit|bericht|report|überblick|zusammenfassung)\b/i.test(prompt)
            ? `${auditBlock}\n\n---\n\n${pagesContext}`
            : pagesContext;

    let piiRedactedCount = 0;
    if (config.zeroPii) {
        const scrubbed = scrubPii(combinedContext);
        combinedContext = scrubbed.text;
        piiRedactedCount = scrubbed.redactedCount;
    }

    let fallbackReason = '';
    if (config.provider !== 'heuristic') {
        try {
            const effectiveConfig = { ...config };
            if (effectiveConfig.provider === 'ollama' || effectiveConfig.provider === 'lmstudio') {
                const discovered = await discoverLocalAiModels(fetchImpl);
                const available =
                    effectiveConfig.provider === 'ollama'
                        ? discovered.ollamaModels
                        : discovered.lmStudioModels;
                if (available.length > 0 && !available.includes(effectiveConfig.model)) {
                    effectiveConfig.model = available[0];
                }
            }

            const llmOutput = await callLlmEndpoint({
                config: effectiveConfig,
                mode,
                prompt,
                domain: run.domain,
                context: combinedContext,
                fetchImpl,
            });

            let structuredData: unknown = undefined;
            if (mode === 'schema') {
                structuredData = tryExtractJsonFromText(llmOutput);
            }

            return {
                providerUsed: effectiveConfig.provider,
                modelUsed: effectiveConfig.model,
                zeroPiiApplied: effectiveConfig.zeroPii,
                piiRedactedCount,
                mode,
                output: llmOutput,
                structuredData,
                sourcesUsed,
                generatedAt: new Date().toISOString(),
            };
        } catch (err) {
            fallbackReason = err instanceof Error ? err.message : String(err);
            // Sicherer lokaler Fallback auf deterministische Heuristik-Engine,
            // falls Ollama oder die externe API offline/nicht konfiguriert ist
        }
    }

    const fallback = runLocalHeuristicAnalysis({
        run,
        selectedPages,
        mode,
        prompt,
        zeroPii: config.zeroPii,
    });

    const outputWithNote = fallbackReason
        ? `_Hinweis: Lokales/externes LLM nicht erreichbar (${fallbackReason}) — lokale Offline-Heuristik wurde verwendet._\n\n${fallback.output}`
        : fallback.output;

    return {
        providerUsed: 'local-heuristic (Offline-Engine)',
        modelUsed: 'CrawlPulse-Local-Analyzer-v1',
        zeroPiiApplied: config.zeroPii,
        piiRedactedCount,
        mode,
        output: outputWithNote,
        structuredData: fallback.structuredData,
        sourcesUsed,
        generatedAt: new Date().toISOString(),
    };
}

function buildAuditContextBlock(run: CrawlRun): string {
    const s = run.summary;
    const pageIndex = run.pages
        .slice(0, 20)
        .map((p) => `- ${p.title} (${p.url}) [${p.status}, ~${p.estimatedTokens} Tok.]`)
        .join('\n');
    const blockedBots = (s.aiCrawlerAccess ?? [])
        .filter((item) => item.status === 'blocked')
        .map((item) => item.bot)
        .join(', ');
    const citationLines = run.pages
        .flatMap((page) =>
            page.auditIssues
                .filter((item) => isCitationIssueCode(item.code))
                .map((item) => `- ${page.url}: ${item.message}`),
        )
        .slice(0, 12)
        .join('\n');

    return [
        `### Technischer Crawl- & SEO/BFSG-Audit-Überblick für ${run.domain}`,
        `- Geprüfte Seiten: ${s.successfulPages} erfolgreich / ${s.totalPages} gesamt (${s.failedPages} Fehler)`,
        `- Health-Score: ${s.healthScore}/100 | Ø Antwortzeit: ${s.averageResponseTimeMs} ms`,
        `- Seiten ohne <title>: ${s.missingTitleCount} | ohne Meta-Description: ${s.missingDescriptionCount} | ohne <h1>: ${s.missingH1Count}`,
        `- Bilder ohne alt-Text (BFSG/WCAG): ${s.imagesWithoutAltCount} | Seiten mit Schema.org JSON-LD (GEO): ${s.jsonLdPagesCount}`,
        `- Neutralisierte Prompt-Injections/Hidden-Nodes: ${s.promptInjectionsNeutralized}`,
        `- KI-Crawler ausgesperrt: ${blockedBots || 'keine der geprüften'}`,
        `- KI-Zitier-Befunde: ${s.citationFindingCount ?? 0}`,
        ``,
        `Erfasste Seiten (Auswahl):`,
        pageIndex,
        citationLines ? `\nKI-Zitier-Befunde:\n${citationLines}` : '',
    ].join('\n');
}

function rankPagesForQuery(pages: CrawledPage[], query: string, mode: 'summary' | 'schema' | 'qa' = 'qa'): CrawledPage[] {
    const isBroadOverview =
        mode === 'summary' ||
        !query ||
        query.trim() === '' ||
        /\b(bericht|report|überblick|zusammenfassung|angebot|angebote|zielgruppe|gesamt|alles)\b/i.test(query);

    const { terms, isPriceQuery } = extractQueryIntent(query);

    return [...pages].sort((a, b) => {
        const score = (page: CrawledPage): number => {
            const urlLower = page.url.toLowerCase();
            const hayTitle = `${page.title} ${page.description} ${urlLower}`.toLowerCase();
            const hayBody = page.markdown.toLowerCase();
            let pts = 0;

            if (isBroadOverview) {
                if (page.depth === 0) {
                    pts += 30;
                } else if (page.depth === 1) {
                    pts += 15;
                }
                // News/Blog-Posts bei allgemeinen Angebots- & Überblicksberichten nicht vor Produktseiten ziehen
                if (/\/(news|aktuelles|blog|presse|archiv)\b/i.test(urlLower)) {
                    pts -= 12;
                }
            }

            for (const term of terms) {
                if (hayTitle.includes(term)) {
                    pts += 10;
                }
                const occurrences = hayBody.split(term).length - 1;
                pts += Math.min(occurrences, 8);
            }
            if (isPriceQuery) {
                const priceHits = (page.markdown.match(PRICE_VALUE_REGEX) ?? []).length;
                pts += Math.min(priceHits, 10);
            }
            return pts;
        };
        return score(b) - score(a);
    });
}

async function callLlmEndpoint(params: {
    config: AiConfig;
    mode: 'summary' | 'schema' | 'qa';
    prompt: string;
    domain: string;
    context: string;
    fetchImpl: typeof fetch;
}): Promise<string> {
    const { config, mode, prompt, domain, context, fetchImpl } = params;
    const base = config.baseUrl.replace(/\/+$/, '');
    const isNativeOllama = config.provider === 'ollama' && !base.endsWith('/v1') && !base.endsWith('/chat/completions');

    const systemMessage =
        mode === 'summary'
            ? 'Du bist ein präziser Website- und Architektur-Analyst. Erstelle einen ausführlichen, klar gegliederten deutschen Analyse-Bericht (1. Positionierung & Zielgruppe, 2. Konkrete Angebote, Produkte & Preise/Tarife, 3. Technische, SEO-, GEO- & BFSG-Befunde mit den konkreten Zahlen, 4. Handlungsempfehlungen) ausschließlich auf Basis der übergebenen Daten.'
            : mode === 'schema'
              ? 'Du bist ein präziser Daten-Extraktor. Extrahiere die angeforderten Informationen vollständig als valides JSON-Array von Objekten ohne umschließenden Fließtext.'
              : 'Du bist ein gründlicher Website-Analyst. Beantworte die Anfrage des Nutzers ausführlich, strukturiert (mit Überschriften, Aufzählungen und konkreten Fakten/Preisen/URLs) auf Basis aller relevanten übergebenen Quellen.';

    const userPrompt =
        mode === 'summary'
            ? `Erstelle einen ausführlichen, strukturierten Bericht für die gecrawlte Website ${domain}.\n\nZusatzfokus: ${prompt || 'Gesamtüberblick (Angebote, Zielgruppe, Technik, SEO/BFSG)'}\n\nKontext:\n${context}`
            : mode === 'schema'
              ? `Extrahiere strukturierte Daten als JSON aus folgendem Website-Kontext.\nGewünschtes Schema / Felder: ${prompt || 'Titel, Kategorie, Preis/Wert, Beschreibung, URL'}\n\nKontext:\n${context}`
              : `Anfrage: ${prompt}\n\nBeantworte die Anfrage ausführlich und strukturiert anhand dieses Website-Kontexts:\n${context}`;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (config.apiKey && config.apiKey.trim() !== '') {
        headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
    }

    if (isNativeOllama) {
        // Natives Ollama /api/chat setzt num_ctx explizit (Standard in Ollama wäre sonst nur 2048 Tokens!)
        const response = await fetchImpl(`${base}/api/chat`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: config.model || 'qwen2.5-coder:7b',
                stream: false,
                options: {
                    num_ctx: 16384,
                    num_predict: 8192,
                    temperature: 0.2,
                },
                messages: [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: userPrompt },
                ],
            }),
            signal: AbortSignal.timeout(180_000),
        });

        if (!response.ok) {
            throw new Error(`Ollama-Endpunkt antwortete mit HTTP ${response.status}`);
        }

        const json = (await response.json()) as {
            message?: { content?: string };
        };

        const content = json.message?.content?.trim();
        if (!content) {
            throw new Error('Leere Antwort vom Ollama-Endpunkt.');
        }

        return content;
    }

    const endpoint = base.endsWith('/chat/completions')
        ? base
        : base.endsWith('/v1')
          ? `${base}/chat/completions`
          : `${base}/v1/chat/completions`;

    const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: config.model || 'qwen2.5-coder:7b',
            temperature: 0.2,
            max_tokens: 8192,
            messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: userPrompt },
            ],
        }),
        signal: AbortSignal.timeout(180_000),
    });

    if (!response.ok) {
        throw new Error(`LLM-Endpunkt antwortete mit HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
    };

    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
        throw new Error('Leere Antwort vom LLM-Endpunkt.');
    }

    return content;
}

function tryExtractJsonFromText(text: string): unknown {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
    const candidate = fenced ? fenced[1].trim() : text.trim();
    try {
        return JSON.parse(candidate);
    } catch {
        const arrayMatch = /\[[\s\S]*\]/.exec(candidate);
        if (arrayMatch) {
            try {
                return JSON.parse(arrayMatch[0]);
            } catch {
                return undefined;
            }
        }
        return undefined;
    }
}

function runLocalHeuristicAnalysis(params: {
    run: CrawlRun;
    selectedPages: CrawledPage[];
    mode: 'summary' | 'schema' | 'qa';
    prompt: string;
    zeroPii: boolean;
}): { output: string; structuredData?: unknown } {
    const { run, selectedPages, mode, prompt } = params;
    const s = run.summary;

    if (mode === 'summary') {
        const topHeadings = selectedPages
            .flatMap((p) => p.headings.filter((h) => h.level <= 2).map((h) => h.text))
            .slice(0, 40);

        const lines = [
            `## Executive Summary: ${run.domain}`,
            '',
            `### 1. Umfang & Token-Bilanz`,
            `- **Erfasste Seiten:** ${s.successfulPages} erfolgreich (${s.failedPages} Fehler, ${s.blockedBySsrf} SSRF-Blocks)`,
            `- **Textvolumen:** ${s.totalWords} Wörter (~${s.totalEstimatedTokens} LLM-Tokens)`,
            `- **Durchschnittliche Antwortzeit:** ${s.averageResponseTimeMs} ms`,
            `- **Technischer Health-Score:** **${s.healthScore}/100**`,
            '',
            `### 2. Erkannte Kernthemen & Überschriften`,
            ...(topHeadings.length > 0
                ? topHeadings.map((h) => `- ${h}`)
                : ['- Keine H1/H2-Überschriften erkannt.']),
            '',
            `### 3. Qualitäts-, SEO- & Barrierefreiheits-Befunde (BFSG / WCAG)`,
            `- Seiten ohne \`<title>\`: **${s.missingTitleCount}**`,
            `- Seiten ohne Meta-Description: **${s.missingDescriptionCount}**`,
            `- Seiten ohne \`<h1>\`: **${s.missingH1Count}**`,
            `- Bilder ohne \`alt\`-Text: **${s.imagesWithoutAltCount}**`,
            `- Seiten mit Schema.org JSON-LD: **${s.jsonLdPagesCount}**`,
            `- Neutralisierte Prompt-Injections / Hidden-Nodes: **${s.promptInjectionsNeutralized}**`,
        ];

        return { output: lines.join('\n') };
    }

    if (mode === 'schema') {
        // Extrahiere strukturierte Einträge aus Seiten, Überschriften, Preisen und JSON-LD
        const records = selectedPages.map((p) => {
            const priceMatches = p.markdown.match(/\d+(?:[.,]\d{2})?\s?(?:€|EUR|CHF|\$)/g) ?? [];
            return {
                url: p.url,
                title: p.title,
                description: p.description || p.headings.find((h) => h.level === 2)?.text || '',
                headings: p.headings.slice(0, 12).map((h) => h.text),
                detectedPrices: Array.from(new Set(priceMatches)).slice(0, 12),
                wordCount: p.wordCount,
                estimatedTokens: p.estimatedTokens,
                jsonLdCount: p.jsonLd.length,
            };
        });

        return {
            output: JSON.stringify(records, null, 2),
            structuredData: records,
        };
    }

    // mode === 'qa'
    const topPage = selectedPages[0];
    if (!topPage) {
        return { output: 'Keine gecrawlten Seiten für die Beantwortung vorhanden.' };
    }

    const { terms, isPriceQuery } = extractQueryIntent(prompt);
    const matchingSnippets: string[] = [];

    for (const page of selectedPages) {
        const relevantContext = extractRelevantPageContext(page, prompt, 6000);

        if (isPriceQuery) {
            // Extrahiere Produkt-/Leistungs-Einträge mit Preisen aus Überschriften-Sektionen oder Absätzen
            const productMatches: string[] = [];
            const sections = relevantContext.split(/\n(?=#{1,4}\s+)/);
            for (const section of sections) {
                if (BOILERPLATE_LINE_REGEX.test(section)) {
                    continue;
                }
                const prices = section.match(PRICE_VALUE_REGEX);
                if (!prices || prices.length === 0) {
                    continue;
                }
                const lower = section.toLowerCase();
                const termMatches = terms.length === 0 || terms.some((t) => lower.includes(t)) || page.title.toLowerCase().includes(terms[0] ?? '');
                if (!termMatches) {
                    continue;
                }
                const firstLine = section.split('\n')[0]?.replace(/^#+\s*/, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim() ?? page.title;
                const uniquePrices = Array.from(new Set(prices)).slice(0, 12).join(', ');
                if (firstLine.length > 2) {
                    productMatches.push(`- **${firstLine}** — **${uniquePrices}**`);
                }
                if (productMatches.length >= 24) {
                    break;
                }
            }

            if (productMatches.length > 0) {
                matchingSnippets.push(`**Aus [${page.title}](${page.url}):**\n${productMatches.join('\n')}`);
                continue;
            }
        }

        const paragraphs = relevantContext.split(/\n\n+/);
        const rankedParagraphs: Array<{ score: number; text: string }> = [];
        for (const para of paragraphs) {
            const clean = para.trim();
            if (clean.length <= 20 || BOILERPLATE_LINE_REGEX.test(clean)) {
                continue;
            }
            const lower = clean.toLowerCase();
            let score = 0;
            for (const t of terms) {
                if (lower.includes(t)) {
                    score += 5;
                }
            }
            if (isPriceQuery && PRICE_VALUE_REGEX.test(clean)) {
                score += 4;
            }
            PRICE_VALUE_REGEX.lastIndex = 0;
            if (score > 0 || terms.length === 0) {
                rankedParagraphs.push({ score, text: clean.slice(0, 1800) });
            }
        }
        rankedParagraphs.sort((a, b) => b.score - a.score);
        for (const para of rankedParagraphs.slice(0, 3)) {
            matchingSnippets.push(`> **Aus [${page.title}](${page.url}):**\n> ${para.text}`);
        }
    }

    if (matchingSnippets.length === 0) {
        const fallbackBody = extractRelevantPageContext(topPage, prompt, 2400);
        matchingSnippets.push(
            `> **Aus [${topPage.title}](${topPage.url}):**\n> ${fallbackBody}`,
        );
    }

    return {
        output: [
            `### Antwort aus dem lokalen Crawl-Index (${selectedPages.length} geprüfte Seiten)`,
            '',
            ...matchingSnippets,
        ].join('\n\n'),
    };
}
