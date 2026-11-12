// SPDX-License-Identifier: MIT
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class SsrfBlockedError extends Error {
    public readonly code = 'SSRF_BLOCKED';

    public constructor(message: string) {
        super(message);
        this.name = 'SsrfBlockedError';
    }
}

export type DnsLookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultDnsLookup: DnsLookupFn = async (hostname: string) => {
    const timeoutMs = 8_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            lookup(hostname, { all: true, verbatim: true }),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('DNS-Zeitüberschreitung')), timeoutMs);
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
};

const TRACKING_PARAMS = new Set([
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'utm_id',
    'fbclid',
    'gclid',
    'dclid',
    'msclkid',
    'mc_cid',
    'mc_eid',
    '_hsenc',
    '_hsmi',
    'igshid',
]);

/**
 * Prüft deterministisch, ob eine IPv4- oder IPv6-Adresse lokal, privat,
 * reserviert oder eine Cloud-Metadaten-Adresse ist.
 */
export function isPrivateOrReservedIp(rawIp: string): boolean {
    const ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, '');

    // IPv4-mapped IPv6 in Punktnotation (z. B. ::ffff:127.0.0.1)
    if (ip.startsWith('::ffff:')) {
        const mappedPart = ip.slice('::ffff:'.length);
        if (isIP(mappedPart) === 4) {
            return isPrivateOrReservedIpv4(mappedPart);
        }
        // Hexadezimale Darstellung z. B. ::ffff:7f00:1
        const hexMatch = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(mappedPart);
        if (hexMatch) {
            const high = Number.parseInt(hexMatch[1], 16);
            const low = Number.parseInt(hexMatch[2], 16);
            const reconstructed = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
            return isPrivateOrReservedIpv4(reconstructed);
        }
    }

    const version = isIP(ip);
    if (version === 4) {
        return isPrivateOrReservedIpv4(ip);
    }

    if (version === 6) {
        return isPrivateOrReservedIpv6(ip);
    }

    // Fail-closed bei ungültigem IP-Format
    return true;
}

function isPrivateOrReservedIpv4(ip: string): boolean {
    const parts = ip.split('.').map((part) => Number.parseInt(part, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
        return true;
    }

    const [a, b, c] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) {
        return true;
    }
    // 10.0.0.0/8 (Private network RFC 1918)
    if (a === 10) {
        return true;
    }
    // 100.64.0.0/10 (Carrier-grade NAT RFC 6598)
    if (a === 100 && b >= 64 && b <= 127) {
        return true;
    }
    // 127.0.0.0/8 (Loopback)
    if (a === 127) {
        return true;
    }
    // 169.254.0.0/16 (Link-local & Cloud Metadata 169.254.169.254)
    if (a === 169 && b === 254) {
        return true;
    }
    // 172.16.0.0/12 (Private network RFC 1918)
    if (a === 172 && b >= 16 && b <= 31) {
        return true;
    }
    // 192.0.0.0/24 (IETF Protocol Assignments) & 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && (c === 0 || c === 2)) {
        return true;
    }
    // 192.168.0.0/16 (Private network RFC 1918)
    if (a === 192 && b === 168) {
        return true;
    }
    // 198.18.0.0/15 (Benchmarking)
    if (a === 198 && (b === 18 || b === 19)) {
        return true;
    }
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && c === 100) {
        return true;
    }
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && c === 113) {
        return true;
    }
    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved / Broadcast)
    if (a >= 224) {
        return true;
    }

    return false;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
    const normalized = ip.toLowerCase();

    // Unspecified (::) oder Loopback (::1)
    if (normalized === '::' || normalized === '::1' || normalized === '0:0:0:0:0:0:0:1' || normalized === '0:0:0:0:0:0:0:0') {
        return true;
    }
    // Unique Local Addresses fc00::/7 (fc00.. bis fdff..)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
        return true;
    }
    // Link-Local fe80::/10 (fe8., fe9., fea., feb.)
    if (/^fe[89ab]/i.test(normalized)) {
        return true;
    }
    // Multicast ff00::/8
    if (normalized.startsWith('ff')) {
        return true;
    }
    // Dokumentation 2001:db8::/32
    if (normalized.startsWith('2001:db8:') || normalized.startsWith('2001:0db8:')) {
        return true;
    }

    return false;
}

export interface SafeUrlValidationOptions {
    allowLocalhostForTesting?: boolean;
    lookupFn?: DnsLookupFn;
}

/**
 * Validiert eine Ziel-URL fail-closed gegen Protokoll-Missbrauch, Credentials,
 * verbotene Hostnamen und SSRF auf private/lokale IP-Adressen.
 */
export async function validateSafeUrl(rawUrl: string, options: SafeUrlValidationOptions = {}): Promise<URL> {
    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
        throw new SsrfBlockedError('Leere oder ungültige URL übergeben.');
    }

    let parsed: URL;
    try {
        parsed = new URL(rawUrl.trim());
    } catch {
        throw new SsrfBlockedError(`Ungültiges URL-Format: "${rawUrl}"`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new SsrfBlockedError(`Nicht erlaubtes Protokoll "${parsed.protocol}" (nur http: und https: zulässig).`);
    }

    if (parsed.username !== '' || parsed.password !== '') {
        throw new SsrfBlockedError('URLs mit eingebetteten Zugangsdaten (user:pass@host) sind aus Sicherheitsgründen gesperrt.');
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!hostname) {
        throw new SsrfBlockedError('Kein gültiger Hostname in der URL enthalten.');
    }

    if (options.allowLocalhostForTesting && (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1')) {
        return parsed;
    }

    const blockedHostPatterns = [
        'localhost',
        'metadata.google.internal',
        'metadata',
        'instance-data',
        '0.0.0.0',
    ];

    if (
        blockedHostPatterns.includes(hostname) ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        hostname.endsWith('.arpa')
    ) {
        throw new SsrfBlockedError(`Zugriff auf lokalen/internen Hostnamen "${hostname}" durch SSRF-Schutz blockiert.`);
    }

    // Direkte IP-Adresse in der URL prüfen
    if (isIP(hostname) !== 0) {
        if (isPrivateOrReservedIp(hostname)) {
            throw new SsrfBlockedError(`Zugriff auf private oder reservierte IP-Adresse "${hostname}" durch SSRF-Schutz blockiert.`);
        }
        return parsed;
    }

    // DNS-Auflösung vor dem Request prüfen (Schutz gegen DNS-Rebinding / lokale A-Records)
    const lookupFn = options.lookupFn ?? defaultDnsLookup;
    let records: Array<{ address: string; family: number }>;
    try {
        records = await lookupFn(hostname);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new SsrfBlockedError(`DNS-Auflösung für "${hostname}" fehlgeschlagen: ${message}`);
    }

    if (!records || records.length === 0) {
        throw new SsrfBlockedError(`Keine DNS-Einträge für "${hostname}" gefunden.`);
    }

    for (const record of records) {
        if (isPrivateOrReservedIp(record.address)) {
            throw new SsrfBlockedError(
                `Hostname "${hostname}" löst auf gesperrte interne IP-Adresse "${record.address}" auf (SSRF-Schutz).`,
            );
        }
    }

    return parsed;
}

export interface SafeFetchResult {
    finalUrl: string;
    status: number;
    statusText: string;
    contentType: string;
    body: string;
    responseTimeMs: number;
}

export interface SafeFetchOptions extends SafeUrlValidationOptions {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    userAgent?: string;
    fetchImpl?: typeof fetch;
}

/**
 * Führt einen HTTP-Abruf mit hop-by-hop Redirect-Validierung (SSRF-sicher),
 * hartem Timeout und Streaming-Größenlimit durch.
 */
export async function safeFetchText(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
    const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 12_000, 1_000), 60_000);
    const maxBytes = Math.min(Math.max(options.maxBytes ?? 5 * 1024 * 1024, 10_240), 25 * 1024 * 1024);
    const maxRedirects = options.maxRedirects ?? 5;
    const fetchImpl = options.fetchImpl ?? fetch;
    const startTime = performance.now();

    let currentUrl = rawUrl;

    for (let hop = 0; hop <= maxRedirects; hop++) {
        const validatedUrl = await validateSafeUrl(currentUrl, {
            allowLocalhostForTesting: options.allowLocalhostForTesting,
            lookupFn: options.lookupFn,
        });

        const response = await fetchImpl(validatedUrl.toString(), {
            method: 'GET',
            redirect: 'manual',
            headers: {
                'User-Agent': options.userAgent ?? 'CrawlPulse/1.0 (+Local-Safe-AI-Crawler)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
                'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            signal: AbortSignal.timeout(timeoutMs),
        });

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location) {
                throw new Error(`Redirect (${response.status}) ohne Location-Header von ${validatedUrl.toString()}`);
            }
            if (hop === maxRedirects) {
                throw new Error(`Maximale Anzahl an Weiterleitungen (${maxRedirects}) überschritten.`);
            }
            currentUrl = new URL(location, validatedUrl).toString();
            continue;
        }

        const contentLengthHeader = response.headers.get('content-length');
        if (contentLengthHeader) {
            const declaredBytes = Number.parseInt(contentLengthHeader, 10);
            if (!Number.isNaN(declaredBytes) && declaredBytes > maxBytes) {
                throw new Error(`Antwortgröße (${declaredBytes} Bytes) überschreitet das Sicherheitslimit von ${maxBytes} Bytes.`);
            }
        }

        const body = await readBodyWithLimit(response, maxBytes);
        const responseTimeMs = Math.round(performance.now() - startTime);

        return {
            finalUrl: validatedUrl.toString(),
            status: response.status,
            statusText: response.statusText || (response.status === 200 ? 'OK' : ''),
            contentType: response.headers.get('content-type') ?? 'text/html',
            body,
            responseTimeMs,
        };
    }

    throw new Error('Unerwartetes Ende der Redirect-Kette.');
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
    if (!response.body) {
        return '';
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (value) {
                totalBytes += value.byteLength;
                if (totalBytes > maxBytes) {
                    await reader.cancel('Maximale Antwortgröße überschritten');
                    throw new Error(`Antwort überschreitet das Sicherheitslimit von ${maxBytes} Bytes.`);
                }
                chunks.push(value);
            }
        }
    } finally {
        reader.releaseLock();
    }

    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return new TextDecoder('utf-8', { fatal: false }).decode(combined);
}

/**
 * Normalisiert URLs für die Deduplizierung (entfernt Fragmente, Tracking-Parameter
 * und vereinheitlicht Pfad-Slashes).
 */
export function normalizeUrl(rawUrl: string, baseUrl?: string): string | null {
    try {
        const parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
        parsed.hash = '';
        parsed.username = '';
        parsed.password = '';

        const keysToDelete: string[] = [];
        parsed.searchParams.forEach((_value, key) => {
            if (TRACKING_PARAMS.has(key.toLowerCase())) {
                keysToDelete.push(key);
            }
        });
        for (const key of keysToDelete) {
            parsed.searchParams.delete(key);
        }
        parsed.searchParams.sort();

        if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
            parsed.pathname = parsed.pathname.replace(/\/+$/, '');
        }

        return parsed.toString();
    } catch {
        return null;
    }
}

/**
 * Entfernt versteckte HTML-Elemente (display:none, visibility:hidden, font-size:0),
 * HTML-Kommentare und bekannte Prompt-Injection-Muster vor der LLM-Weiterverarbeitung.
 */
export function stripPromptInjectionsAndHiddenHtml(html: string): {
    cleanedHtml: string;
    removedCount: number;
} {
    let removedCount = 0;
    let working = html;

    // 1. HTML-Kommentare entfernen
    working = working.replace(/<!--[\s\S]*?-->/g, (comment) => {
        if (/ignore\s+(all\s+)?previous|system\s*prompt|instruction/i.test(comment)) {
            removedCount++;
        }
        return '';
    });

    // 2. Elemente mit versteckten Inline-Styles (display:none, visibility:hidden, opacity:0, font-size:0) entfernen
    const hiddenStyleRegex = /<([a-zA-Z0-9]+)\b[^>]*\bstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?\b|font-size\s*:\s*0(?:px|em|rem|%)?)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
    working = working.replace(hiddenStyleRegex, () => {
        removedCount++;
        return '';
    });

    // 3. Elemente mit hidden-Attribut oder template-Tags entfernen
    working = working.replace(/<(template|[a-zA-Z0-9]+)\b[^>]*\bhidden\b[^>]*>[\s\S]*?<\/\1>/gi, () => {
        removedCount++;
        return '';
    });

    // 4. Bekannte direkte Prompt-Injection-Steuersequenzen entschärfen
    const injectionPatterns = [
        /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules)/gi,
        /<\|im_start\|>|<\|im_end\|>|<\|endoftext\|>/gi,
        /\[INST\]|\[\/INST\]|<<SYS>>|<\/SYS>>/gi,
        /system\s+override\s*:\s*you\s+are\s+now/gi,
    ];

    for (const pattern of injectionPatterns) {
        working = working.replace(pattern, () => {
            removedCount++;
            return '[PROMPT-INJECTION-FILTERED]';
        });
    }

    return { cleanedHtml: working, removedCount };
}

/**
 * Reduziert personenbezogene Daten (E-Mail-Adressen, IBANs, Telefonnummern)
 * für den Zero-PII-Modus vor dem Versand an externe Cloud-LLMs.
 */
export function scrubPii(text: string): { text: string; redactedCount: number } {
    let redactedCount = 0;

    // E-Mail-Adressen
    let scrubbed = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, () => {
        redactedCount++;
        return '[E-MAIL-GESCHWÄRZT]';
    });

    // IBAN (DE und international)
    scrubbed = scrubbed.replace(/\b[A-Z]{2}\d{2}(?:\s?\d{4}){3,7}\s?\d{1,4}\b/g, () => {
        redactedCount++;
        return '[IBAN-GESCHWÄRZT]';
    });

    // DACH-Telefonnummern (+49, +43, +41, 0049 oder Vorwahl mit Trennern)
    scrubbed = scrubbed.replace(/(?:\+|00)(?:49|43|41)[\s\-./()0-9]{7,18}\d/g, () => {
        redactedCount++;
        return '[TELEFON-GESCHWÄRZT]';
    });

    return { text: scrubbed, redactedCount };
}
