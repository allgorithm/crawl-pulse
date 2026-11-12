// SPDX-License-Identifier: MIT
import { normalizeUrl, scrubPii, stripPromptInjectionsAndHiddenHtml } from './security.ts';
import type {
    CrawledPage,
    ExtractedImage,
    ExtractedLink,
    PageAuditIssue,
    PageHeading,
} from './types.ts';

const NAMED_ENTITIES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    hellip: '…',
    copy: '©',
    reg: '®',
    euro: '€',
    auml: 'ä',
    ouml: 'ö',
    uuml: 'ü',
    Auml: 'Ä',
    Ouml: 'Ö',
    Uuml: 'Ü',
    szlig: 'ß',
    rarr: '→',
    larr: '←',
};

export function decodeHtmlEntities(input: string): string {
    return input
        .replace(/&#(\d+);/g, (_m, dec) => {
            const code = Number.parseInt(dec, 10);
            return Number.isNaN(code) ? _m : String.fromCodePoint(code);
        })
        .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
            const code = Number.parseInt(hex, 16);
            return Number.isNaN(code) ? _m : String.fromCodePoint(code);
        })
        .replace(/&([a-zA-Z0-9]+);/g, (full, name) => NAMED_ENTITIES[name] ?? full);
}

export function stripTags(html: string): string {
    return decodeHtmlEntities(
        html
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
    );
}

export function estimateTokens(text: string): number {
    if (!text || text.trim() === '') {
        return 0;
    }
    return Math.max(1, Math.ceil(text.trim().length / 4));
}

export function extractJsonLd(html: string): unknown[] {
    const results: unknown[] = [];
    const regex = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
        const raw = match[1].trim();
        if (!raw) {
            continue;
        }
        try {
            const parsed = JSON.parse(raw);
            results.push(parsed);
        } catch {
            // Ungültiges JSON-LD ignorieren
        }
    }
    return results;
}

export function extractMetaTags(html: string): {
    title: string;
    description: string;
    canonicalUrl: string;
    language: string;
    openGraph: Record<string, string>;
} {
    const langMatch = /<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i.exec(html);
    const language = langMatch ? langMatch[1].trim() : '';

    const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    let title = titleMatch ? stripTags(titleMatch[1]) : '';

    const canonicalMatch =
        /<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["']/i.exec(html) ??
        /<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']canonical["']/i.exec(html);
    const canonicalUrl = canonicalMatch ? canonicalMatch[1].trim() : '';

    let description = '';
    const openGraph: Record<string, string> = {};

    const metaRegex = /<meta\b([^>]+)>/gi;
    let match: RegExpExecArray | null;
    while ((match = metaRegex.exec(html)) !== null) {
        const attrs = match[1];
        const nameMatch = /\b(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(attrs);
        const contentMatch = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(attrs);
        if (!nameMatch || !contentMatch) {
            continue;
        }
        const key = nameMatch[1].trim().toLowerCase();
        const val = decodeHtmlEntities(contentMatch[1].trim());

        if (key === 'description' && !description) {
            description = val;
        }
        if (key.startsWith('og:') || key.startsWith('twitter:')) {
            openGraph[key] = val;
        }
    }

    if (!title && openGraph['og:title']) {
        title = openGraph['og:title'];
    }
    if (!description && openGraph['og:description']) {
        description = openGraph['og:description'];
    }

    return { title, description, canonicalUrl, language, openGraph };
}

export function extractHeadings(html: string): PageHeading[] {
    const headings: PageHeading[] = [];
    const cleanSource = html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

    const regex = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(cleanSource)) !== null) {
        const level = Number.parseInt(match[1], 10);
        const text = stripTags(match[2]);
        if (text) {
            headings.push({ level, text });
        }
    }
    return headings;
}

export function extractLinks(html: string, baseUrl: string): ExtractedLink[] {
    const links: ExtractedLink[] = [];
    const seen = new Set<string>();
    let baseHost = '';
    try {
        baseHost = new URL(baseUrl).hostname.toLowerCase();
    } catch {
        baseHost = '';
    }

    const regex = /<a\b([^>]+)>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
        const attrs = match[1];
        const hrefMatch = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs);
        if (!hrefMatch) {
            continue;
        }
        const rawHref = decodeHtmlEntities(hrefMatch[1].trim());
        if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
            continue;
        }

        const normalized = normalizeUrl(rawHref, baseUrl);
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);

        let isInternal = false;
        try {
            const targetHost = new URL(normalized).hostname.toLowerCase();
            isInternal = targetHost === baseHost;
        } catch {
            isInternal = false;
        }

        const text = stripTags(match[2]) || normalized;
        links.push({ href: normalized, text, isInternal });
    }

    return links;
}

export function extractImages(html: string, baseUrl: string): ExtractedImage[] {
    const images: ExtractedImage[] = [];
    const regex = /<img\b([^>]+)>/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
        const attrs = match[1];
        const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
        if (!srcMatch) {
            continue;
        }
        const rawSrc = decodeHtmlEntities(srcMatch[1].trim());
        let resolvedSrc = rawSrc;
        try {
            resolvedSrc = new URL(rawSrc, baseUrl).toString();
        } catch {
            resolvedSrc = rawSrc;
        }

        const hasAltAttr = /\balt\s*=\s*["']([^"']*)["']/i.exec(attrs);
        const alt = hasAltAttr ? decodeHtmlEntities(hasAltAttr[1].trim()) : '';
        images.push({
            src: resolvedSrc,
            alt,
            hasAlt: hasAltAttr !== null,
        });
    }
    return images;
}

/**
 * Extrahiert Elemente anhand eines einfachen CSS-Selektors (#id, .class, tag, tag.class).
 */
export function extractBySimpleSelector(html: string, selector?: string): string[] {
    if (!selector || selector.trim() === '') {
        return [];
    }
    const sel = selector.trim();
    const results: string[] = [];

    if (sel.startsWith('#')) {
        const id = sel.slice(1).replace(/[^a-zA-Z0-9_-]/g, '');
        const regex = new RegExp(`<([a-zA-Z0-9]+)\\b[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'gi');
        let m: RegExpExecArray | null;
        while ((m = regex.exec(html)) !== null) {
            const text = stripTags(m[2]);
            if (text) {
                results.push(text);
            }
        }
        return results;
    }

    if (sel.startsWith('.')) {
        const cls = sel.slice(1).replace(/[^a-zA-Z0-9_-]/g, '');
        const regex = new RegExp(
            `<([a-zA-Z0-9]+)\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
            'gi',
        );
        let m: RegExpExecArray | null;
        while ((m = regex.exec(html)) !== null) {
            const text = stripTags(m[2]);
            if (text) {
                results.push(text);
            }
        }
        return results;
    }

    const tag = sel.replace(/[^a-zA-Z0-9]/g, '');
    if (tag) {
        const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
        let m: RegExpExecArray | null;
        while ((m = regex.exec(html)) !== null) {
            const text = stripTags(m[1]);
            if (text) {
                results.push(text);
            }
        }
    }

    return results;
}

/**
 * Isoliert den Hauptinhalt einer HTML-Seite (Readability-Heuristik) und
 * konvertiert ihn in sauberes, strukturiertes LLM-Markdown.
 */
export function htmlToCleanMarkdown(html: string, baseUrl: string): {
    markdown: string;
    cleanedHtml: string;
} {
    // 1. Entferne Skripte, Styles, SVGs, Formulareingaben und Cookie-/Navigations-Rauschen
    let body = html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
        .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');

    // Bevorzuge <main> oder <article>, falls vorhanden und gehaltvoll
    const mainMatch = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(body);
    const articleMatch = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(body);
    const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(body);

    if (mainMatch && stripTags(mainMatch[1]).length > 80) {
        body = mainMatch[1];
    } else if (articleMatch && stripTags(articleMatch[1]).length > 80) {
        body = articleMatch[1];
    } else if (bodyMatch) {
        body = bodyMatch[1];
    }

    // Entferne globale Navigation, Header-Menüs, Warenkorb-Header, Footer und Aside auch innerhalb von <main>-Wrappern
    body = body
        .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, '');

    // Entferne typische Cookie-, Consent- und Warenkorb-Dropdown-Container
    body = body.replace(
        /<(div|section|aside)\b[^>]*(?:id|class)\s*=\s*["'][^"']*(?:cookie-banner|cookie-consent|gdpr-banner|cmpbox|blockcart|desktop_cart)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
        '',
    );

    const cleanedHtml = body.trim();
    let md = cleanedHtml;

    // Code-Blöcke (<pre><code>...</code></pre>)
    md = md.replace(/<pre\b[^>]*>\s*(?:<code\b[^>]*>)?([\s\S]*?)(?:<\/code>)?\s*<\/pre>/gi, (_m, code) => {
        const cleanCode = decodeHtmlEntities(code.replace(/<[^>]+>/g, '')).trim();
        return `\n\n\`\`\`\n${cleanCode}\n\`\`\`\n\n`;
    });

    // Tabellen (<table>...</table>) in Markdown-Tabellen umwandeln
    md = md.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_m, tableInner) => {
        const rows: string[][] = [];
        const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
        let trMatch: RegExpExecArray | null;
        while ((trMatch = trRegex.exec(tableInner)) !== null) {
            const cells: string[] = [];
            const cellRegex = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi;
            let cellMatch: RegExpExecArray | null;
            while ((cellMatch = cellRegex.exec(trMatch[1])) !== null) {
                cells.push(stripTags(cellMatch[2]).replace(/\|/g, '\\|'));
            }
            if (cells.length > 0) {
                rows.push(cells);
            }
        }
        if (rows.length === 0) {
            return '';
        }
        const colCount = Math.max(...rows.map((r) => r.length));
        const normalizedRows = rows.map((r) => {
            while (r.length < colCount) {
                r.push('');
            }
            return r;
        });
        const header = `| ${normalizedRows[0].join(' | ')} |`;
        const divider = `| ${normalizedRows[0].map(() => '---').join(' | ')} |`;
        const dataLines = normalizedRows.slice(1).map((r) => `| ${r.join(' | ')} |`);
        return `\n\n${[header, divider, ...dataLines].join('\n')}\n\n`;
    });

    // Überschriften H1 - H6
    md = md.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, levelStr, inner) => {
        const level = Number.parseInt(levelStr, 10);
        const text = stripTags(inner);
        return text ? `\n\n${'#'.repeat(level)} ${text}\n\n` : '';
    });

    // Blockquotes
    md = md.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, inner) => {
        const text = stripTags(inner);
        return text ? `\n\n> ${text}\n\n` : '';
    });

    // Listenpunkte
    md = md.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => {
        const text = stripTags(inner);
        return text ? `\n- ${text}` : '';
    });
    md = md.replace(/<\/?(?:ul|ol)\b[^>]*>/gi, '\n\n');

    // Bilder
    md = md.replace(/<img\b([^>]+)>/gi, (_m, attrs) => {
        const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
        if (!srcMatch) {
            return '';
        }
        const altMatch = /\balt\s*=\s*["']([^"']*)["']/i.exec(attrs);
        const alt = altMatch ? decodeHtmlEntities(altMatch[1].trim()) : 'Bild';
        let resolvedSrc = srcMatch[1].trim();
        try {
            resolvedSrc = new URL(resolvedSrc, baseUrl).toString();
        } catch {
            // Belasse Original-Pfad
        }
        return `![${alt}](${resolvedSrc})`;
    });

    // Links
    md = md.replace(/<a\b([^>]+)>([\s\S]*?)<\/a>/gi, (_m, attrs, inner) => {
        const hrefMatch = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs);
        const label = stripTags(inner);
        if (!hrefMatch || !label) {
            return label;
        }
        const rawHref = hrefMatch[1].trim();
        if (rawHref.startsWith('#') || rawHref.startsWith('javascript:')) {
            return label;
        }
        const resolved = normalizeUrl(rawHref, baseUrl) ?? rawHref;
        return `[${label}](${resolved})`;
    });

    // Inline-Formatierung
    md = md.replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, (_m, inner) => {
        const t = stripTags(inner);
        return t ? `**${t}**` : '';
    });
    md = md.replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, (_m, inner) => {
        const t = stripTags(inner);
        return t ? `*${t}*` : '';
    });
    md = md.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_m, inner) => {
        const t = decodeHtmlEntities(inner.replace(/<[^>]+>/g, '').trim());
        return t ? `\`${t}\`` : '';
    });

    // Absätze & Zeilenumbrüche
    md = md.replace(/<br\s*\/?>/gi, '\n');
    md = md.replace(/<\/?(?:p|div|section|article|header|main)\b[^>]*>/gi, '\n\n');

    // Übrige Tags entfernen, Icon-Font-Glyphen (Private Use Area) säubern & Entities auflösen
    md = decodeHtmlEntities(md.replace(/<[^>]+>/g, '')).replace(/[\uE000-\uF8FF]/g, '');

    // Whitespace glätten
    md = md
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return { markdown: md, cleanedHtml };
}

export function buildPageAudit(params: {
    status: number;
    title: string;
    description: string;
    language: string;
    headings: PageHeading[];
    images: ExtractedImage[];
    jsonLd: unknown[];
    responseTimeMs: number;
}): PageAuditIssue[] {
    const issues: PageAuditIssue[] = [];

    if (params.status >= 400) {
        issues.push({
            code: 'HTTP_ERROR',
            severity: 'error',
            message: `HTTP-Fehlerstatus ${params.status} beim Abruf der Seite.`,
        });
    }

    if (!params.title) {
        issues.push({
            code: 'MISSING_TITLE',
            severity: 'error',
            message: 'Kein <title>-Tag vorhanden (wichtig für SEO und Browser-Tabs).',
        });
    }

    if (!params.description) {
        issues.push({
            code: 'MISSING_META_DESCRIPTION',
            severity: 'warning',
            message: 'Keine Meta-Description vorhanden.',
        });
    }

    if (!params.language) {
        issues.push({
            code: 'MISSING_HTML_LANG',
            severity: 'warning',
            message: 'Fehlendes lang-Attribut im <html>-Element (BFSG / WCAG 3.1.1).',
        });
    }

    const h1Count = params.headings.filter((h) => h.level === 1).length;
    if (h1Count === 0) {
        issues.push({
            code: 'MISSING_H1',
            severity: 'warning',
            message: 'Keine H1-Hauptüberschrift auf der Seite gefunden.',
        });
    } else if (h1Count > 1) {
        issues.push({
            code: 'MULTIPLE_H1',
            severity: 'info',
            message: `${h1Count} H1-Überschriften gefunden (Empfehlung: genau eine H1 pro Seite).`,
        });
    }

    const missingAltCount = params.images.filter((img) => !img.hasAlt).length;
    if (missingAltCount > 0) {
        issues.push({
            code: 'IMAGE_MISSING_ALT',
            severity: 'warning',
            message: `${missingAltCount} Bild(er) ohne alt-Attribut (BFSG / WCAG 1.1.1 Barrierefreiheit).`,
        });
    }

    if (params.jsonLd.length === 0) {
        issues.push({
            code: 'NO_JSON_LD',
            severity: 'info',
            message: 'Keine Schema.org JSON-LD Strukturdaten für KI-Suchmaschinen (GEO) erkannt.',
        });
    }

    if (params.responseTimeMs > 2500) {
        issues.push({
            code: 'SLOW_RESPONSE',
            severity: 'warning',
            message: `Hohe Antwortzeit (${params.responseTimeMs} ms > 2500 ms).`,
        });
    }

    return issues;
}

export function extractPageFromHtml(params: {
    url: string;
    normalizedUrl: string;
    depth: number;
    status: number;
    statusText: string;
    contentType: string;
    rawHtml: string;
    responseTimeMs: number;
    cssSelector?: string;
    stripHiddenElements: boolean;
    zeroPii: boolean;
}): CrawledPage {
    const { cleanedHtml: injectionCleanedHtml, removedCount: promptInjectionsRemoved } = params.stripHiddenElements
        ? stripPromptInjectionsAndHiddenHtml(params.rawHtml)
        : { cleanedHtml: params.rawHtml, removedCount: 0 };

    const meta = extractMetaTags(injectionCleanedHtml);
    const headings = extractHeadings(injectionCleanedHtml);
    const links = extractLinks(injectionCleanedHtml, params.url);
    const images = extractImages(injectionCleanedHtml, params.url);
    const jsonLd = extractJsonLd(injectionCleanedHtml);
    const customExtracted = extractBySimpleSelector(injectionCleanedHtml, params.cssSelector);

    const { markdown: rawMarkdown, cleanedHtml } = htmlToCleanMarkdown(injectionCleanedHtml, params.url);
    const { text: finalMarkdown, redactedCount: piiRedactedCount } = params.zeroPii
        ? scrubPii(rawMarkdown)
        : { text: rawMarkdown, redactedCount: 0 };

    const title = meta.title || headings.find((h) => h.level === 1)?.text || params.url;
    const words = finalMarkdown
        .replace(/[#*`>|[\]()!-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 0);

    const auditIssues = buildPageAudit({
        status: params.status,
        title: meta.title,
        description: meta.description,
        language: meta.language,
        headings,
        images,
        jsonLd,
        responseTimeMs: params.responseTimeMs,
    });

    return {
        url: params.url,
        normalizedUrl: params.normalizedUrl,
        depth: params.depth,
        status: params.status,
        statusText: params.statusText,
        contentType: params.contentType,
        title,
        description: meta.description,
        canonicalUrl: meta.canonicalUrl,
        language: meta.language,
        markdown: finalMarkdown,
        cleanedHtml,
        wordCount: words.length,
        estimatedTokens: estimateTokens(finalMarkdown),
        responseTimeMs: params.responseTimeMs,
        headings,
        links,
        images,
        jsonLd,
        openGraph: meta.openGraph,
        customExtracted,
        auditIssues,
        promptInjectionsRemoved,
        piiRedactedCount,
        crawledAt: new Date().toISOString(),
    };
}
