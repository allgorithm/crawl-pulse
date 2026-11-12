// SPDX-License-Identifier: MIT
import { normalizeUrl } from './security.ts';
import type { AiCrawlerAccess, CrawledPage, PageAuditIssue } from './types.ts';

const AI_CRAWLERS: Array<{ bot: string; explanation: string }> = [
    {
        bot: 'GPTBot',
        explanation:
            'Crawler von OpenAI für das Training von Modellen. Eine Sperre hier lässt die Suche in ChatGPT unberührt.',
    },
    {
        bot: 'OAI-SearchBot',
        explanation:
            'Crawler für die Suche in ChatGPT. Eine Sperre kann dazu führen, dass die Seite in ChatGPT-Antworten fehlt. Das ist unabhängig von GPTBot.',
    },
    {
        bot: 'Google-Extended',
        explanation:
            'Steuerung für Gemini und Vertex AI. Die Google-Suche folgt Googlebot, nicht dieser Zeile.',
    },
    {
        bot: 'PerplexityBot',
        explanation: 'Crawler von Perplexity. Eine Sperre kann die Seite aus Perplexity-Antworten heraushalten.',
    },
    {
        bot: 'ClaudeBot',
        explanation: 'Crawler von Anthropic. Eine Sperre kann die Seite aus Claude-Antworten heraushalten.',
    },
    {
        bot: 'Applebot-Extended',
        explanation:
            'Crawler für Apple Intelligence. Die normale Apple-Suche folgt Applebot, nicht dieser Zeile.',
    },
];

const CITATION_CODES = new Set([
    'CANONICAL_MISSING',
    'CANONICAL_MISMATCH',
    'DUPLICATE_TITLE',
    'THIN_QUOTE',
    'SCHEMA_FIELD_MISSING',
    'SCHEMA_NOT_IN_TEXT',
    'SCHEMA_NOT_CITABLE',
]);

const CANONICAL_EXPLANATION =
    'Die Canonical-URL ist die Adresse, die als die maßgebliche Fassung dieser Seite gilt, wenn derselbe Inhalt unter mehreren URLs erreichbar ist.';

const QUOTE_EXPLANATION =
    'Der Zitiersatz ist der erste Absatz unter der Hauptüberschrift. Eine Antwortmaschine kann diesen Satz als Beleg anführen.';

interface RobotsGroup {
    agents: string[];
    disallow: string[];
    allow: string[];
}

function fold(text: string): string {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseRobotsGroups(robotsTxt: string): RobotsGroup[] {
    const groups: RobotsGroup[] = [];
    let agents: string[] = [];
    let disallow: string[] = [];
    let allow: string[] = [];
    let seenRule = false;

    const flush = (): void => {
        if (agents.length > 0) {
            groups.push({ agents, disallow, allow });
        }
        agents = [];
        disallow = [];
        allow = [];
        seenRule = false;
    };

    for (const rawLine of robotsTxt.split(/\r?\n/)) {
        const line = rawLine.split('#')[0].trim();
        if (!line) {
            flush();
            continue;
        }
        const separator = line.indexOf(':');
        if (separator < 0) {
            continue;
        }
        const directive = line.slice(0, separator).trim().toLowerCase();
        const value = line.slice(separator + 1).trim();
        if (directive === 'user-agent') {
            if (seenRule) {
                flush();
            }
            if (value) {
                agents.push(value.toLowerCase());
            }
        } else if (directive === 'disallow' && value) {
            seenRule = true;
            disallow.push(value);
        } else if (directive === 'allow' && value) {
            seenRule = true;
            allow.push(value);
        }
    }
    flush();
    return groups;
}

function applicableGroup(groups: RobotsGroup[], bot: string): RobotsGroup | null {
    const needle = bot.toLowerCase();
    let best: { group: RobotsGroup; specificity: number } | null = null;
    for (const group of groups) {
        for (const agent of group.agents) {
            let specificity = 0;
            if (agent === needle) {
                specificity = needle.length + 1;
            } else if (agent === '*') {
                specificity = 1;
            }
            if (specificity > 0 && (!best || specificity > best.specificity)) {
                best = { group, specificity };
            }
        }
    }
    return best?.group ?? null;
}

function isPathBlocked(pathname: string, group: RobotsGroup): boolean {
    let bestLength = -1;
    let blocked = false;
    const consider = (rule: string, isAllow: boolean): void => {
        if (pathname.startsWith(rule) && rule.length >= bestLength) {
            bestLength = rule.length;
            blocked = !isAllow;
        }
    };
    for (const rule of group.disallow) {
        consider(rule, false);
    }
    for (const rule of group.allow) {
        consider(rule, true);
    }
    return blocked;
}

export function assessAiCrawlerAccess(robotsTxt: string | null): AiCrawlerAccess[] {
    if (robotsTxt === null) {
        return AI_CRAWLERS.map((crawler) => ({
            bot: crawler.bot,
            explanation: crawler.explanation,
            status: 'unknown',
            suggestion:
                'robots.txt der Start-Domain war bei diesem Lauf nicht lesbar. Die Datei /robots.txt prüfen. Liegt keine Datei, dürfen die Crawler die Seiten lesen.',
        }));
    }

    const groups = parseRobotsGroups(robotsTxt);
    return AI_CRAWLERS.map((crawler) => {
        const group = applicableGroup(groups, crawler.bot);
        const blocked = group ? isPathBlocked('/', group) : false;
        const partial = Boolean(group && !blocked && (group.disallow.length > 0 || group.allow.length > 0));
        let suggestion = 'Keine Änderung nötig, solange dieser Crawler den Auftritt lesen soll.';
        if (blocked) {
            suggestion = `In der Gruppe User-agent: ${crawler.bot} die Zeile Disallow: / entfernen oder durch Allow: / ersetzen, wenn diese Antwortmaschine den Auftritt lesen soll. Das gilt nur für diesen Crawler.`;
        } else if (partial) {
            suggestion =
                'Die Startseite ist lesbar. Einzelne Pfade können trotzdem gesperrt sein. Die Disallow-Zeilen dieser Gruppe gegen die Seiten prüfen, die zitiert werden sollen.';
        }
        return {
            bot: crawler.bot,
            explanation: crawler.explanation,
            status: blocked ? 'blocked' : 'allowed',
            suggestion,
        };
    });
}

export function isCitationIssueCode(code: string): boolean {
    return CITATION_CODES.has(code);
}

export function buildCitationQuote(page: Pick<CrawledPage, 'markdown'>): string {
    const lines = page.markdown.replace(/\r\n/g, '\n').split('\n');
    const headingAt = lines.findIndex((line) => /^#\s+\S/.test(line.trim()));
    const body: string[] = [];
    for (let index = headingAt >= 0 ? headingAt + 1 : 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line) {
            if (body.length > 0) {
                break;
            }
            continue;
        }
        if (/^#{1,6}\s+/.test(line)) {
            break;
        }
        body.push(line.replace(/^[-*]\s+/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'));
        if (body.join(' ').length > 320) {
            break;
        }
    }
    let text = body.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > 320) {
        text = `${text.slice(0, 317).trimEnd()}…`;
    }
    return text;
}

function successfulPage(page: CrawledPage): boolean {
    return page.status >= 200 && page.status < 400 && !page.error;
}

function titleKey(page: CrawledPage): string {
    const key = fold(page.title);
    if (!key || key === fold(page.url) || key === fold(page.normalizedUrl)) {
        return '';
    }
    return key;
}

function stringField(value: unknown): string {
    if (typeof value === 'string') {
        return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }
    return '';
}

function stringList(value: unknown): string[] {
    if (typeof value === 'string' && value.trim()) {
        return [value.trim()];
    }
    if (Array.isArray(value)) {
        return value.flatMap((item) => stringList(item));
    }
    return [];
}

function typeNames(node: Record<string, unknown>): string[] {
    const raw = node['@type'];
    if (typeof raw === 'string') {
        return [raw];
    }
    if (Array.isArray(raw)) {
        return raw.filter((item): item is string => typeof item === 'string');
    }
    return [];
}

function collectNodes(value: unknown, out: Record<string, unknown>[]): void {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectNodes(item, out);
        }
        return;
    }
    if (!isRecord(value)) {
        return;
    }
    if (value['@graph']) {
        collectNodes(value['@graph'], out);
    }
    if (value['@type']) {
        out.push(value);
    }
}

function textHas(haystack: string, needle: string): boolean {
    const foldedNeedle = fold(needle);
    return foldedNeedle.length >= 2 && fold(haystack).includes(foldedNeedle);
}

function priceVariants(price: string): string[] {
    const variants = new Set<string>();
    const trimmed = price.trim();
    if (trimmed) {
        variants.add(trimmed);
    }
    const numeric = trimmed.replace(/[^\d.,]/g, '');
    if (numeric) {
        variants.add(numeric);
        variants.add(numeric.replaceAll('.', ','));
        variants.add(numeric.replaceAll(',', '.'));
        const whole = numeric.split(/[.,]/)[0];
        if (whole) {
            variants.add(whole);
        }
    }
    return [...variants];
}

function issue(
    code: string,
    severity: PageAuditIssue['severity'],
    message: string,
    explanation: string,
    suggestion: string,
): PageAuditIssue {
    return { code, severity, message, explanation, suggestion };
}

function schemaFindings(page: CrawledPage): PageAuditIssue[] {
    const nodes: Record<string, unknown>[] = [];
    collectNodes(page.jsonLd, nodes);
    if (nodes.length === 0) {
        return [];
    }

    const findings: PageAuditIssue[] = [];
    const visible = `${page.title}\n${page.markdown}`;
    let sawCitable = false;
    const seenTypes = new Set<string>();

    const push = (next: PageAuditIssue): void => {
        if (findings.length < 8) {
            findings.push(next);
        }
    };

    for (const node of nodes) {
        const types = typeNames(node);
        for (const typeName of types) {
            seenTypes.add(typeName);
        }

        if (types.some((typeName) => typeName === 'Organization' || typeName === 'LocalBusiness')) {
            sawCitable = true;
            const label = types.includes('LocalBusiness') ? 'LocalBusiness' : 'Organization';
            const name = stringField(node.name);
            const url = stringField(node.url);
            const sameAs = stringList(node.sameAs);
            if (!name) {
                push(
                    issue(
                        'SCHEMA_FIELD_MISSING',
                        'warning',
                        `${label} ohne name.`,
                        'name ist der Anbietername, den eine Antwortmaschine zitiert.',
                        'Im JSON-LD das Feld name mit dem Namen füllen, der auch in der Hauptüberschrift steht.',
                    ),
                );
            } else if (!textHas(visible, name)) {
                push(
                    issue(
                        'SCHEMA_NOT_IN_TEXT',
                        'warning',
                        `Der Name „${name}“ aus ${label} steht nicht im sichtbaren Seitentext.`,
                        'Antwortmaschinen gleichen den strukturierten Namen mit dem Satz ab, den Menschen lesen.',
                        'Den Namen in der Hauptüberschrift oder im ersten Absatz sichtbar nennen.',
                    ),
                );
            }
            if (!url) {
                push(
                    issue(
                        'SCHEMA_FIELD_MISSING',
                        'warning',
                        `${label} ohne url.`,
                        'url ist die maßgebliche Adresse des Anbieters in den Strukturdaten.',
                        'Im JSON-LD die kanonische HTTPS-Adresse des Anbieters als url eintragen.',
                    ),
                );
            }
            if (sameAs.length === 0) {
                push(
                    issue(
                        'SCHEMA_FIELD_MISSING',
                        'info',
                        `${label} ohne sameAs.`,
                        'sameAs listet andere offizielle Profile desselben Anbieters. Darüber lässt sich derselbe Name von einem anderen Anbieter unterscheiden.',
                        'Ein sameAs mit einer Profil-URL ergänzen, die zum selben Anbieter gehört.',
                    ),
                );
            }
        }

        if (types.includes('FAQPage')) {
            sawCitable = true;
            const questions = Array.isArray(node.mainEntity) ? node.mainEntity : node.mainEntity ? [node.mainEntity] : [];
            if (questions.length === 0) {
                push(
                    issue(
                        'SCHEMA_FIELD_MISSING',
                        'warning',
                        'FAQPage ohne Frage.',
                        'Eine FAQPage ist eine Liste aus Frage und Antwort. Ohne mainEntity gibt es nichts zu zitieren.',
                        'Jede sichtbare Frage als Question mit name und acceptedAnswer.text eintragen.',
                    ),
                );
            }
            for (const question of questions) {
                if (!isRecord(question)) {
                    continue;
                }
                const asked = stringField(question.name);
                const answerNode = isRecord(question.acceptedAnswer) ? question.acceptedAnswer : null;
                const answer = answerNode ? stringField(answerNode.text) : '';
                if (!asked || !answer) {
                    push(
                        issue(
                            'SCHEMA_FIELD_MISSING',
                            'warning',
                            'FAQ-Eintrag ohne Frage oder Antwort.',
                            'Eine Antwortmaschine kann nur eine Frage zitieren, deren Frage und Antwort beide gefüllt sind.',
                            'name der Question und text der acceptedAnswer aus dem sichtbaren FAQ-Text übernehmen.',
                        ),
                    );
                } else if (!textHas(visible, asked)) {
                    push(
                        issue(
                            'SCHEMA_NOT_IN_TEXT',
                            'warning',
                            `Die FAQ-Frage „${asked}“ steht nicht im sichtbaren Seitentext.`,
                            'Eine FAQPage ist eine Liste aus Frage und Antwort. Die Frage muss für Menschen auf der Seite stehen, nicht nur im JSON-LD.',
                            'Die Frage als Überschrift oder Absatz auf derselben Seite sichtbar machen.',
                        ),
                    );
                }
            }
        }

        const offers = types.includes('Offer') ? [node] : [];
        if (types.includes('Product')) {
            sawCitable = true;
            const productName = stringField(node.name);
            if (!productName) {
                push(
                    issue(
                        'SCHEMA_FIELD_MISSING',
                        'warning',
                        'Product ohne name.',
                        'name ist die Angebotsbezeichnung, die eine Antwortmaschine zitiert.',
                        'Im JSON-LD das Feld name mit der sichtbaren Produkt- oder Leistungsbezeichnung füllen.',
                    ),
                );
            } else if (!textHas(visible, productName)) {
                push(
                    issue(
                        'SCHEMA_NOT_IN_TEXT',
                        'warning',
                        `Der Produktname „${productName}“ steht nicht im sichtbaren Seitentext.`,
                        'Ein Product benennt das Angebot. Der Name im JSON-LD und der Name auf der Seite sollen dieselbe Sache bezeichnen.',
                        'Die Bezeichnung in der Überschrift oder im ersten Absatz sichtbar nennen.',
                    ),
                );
            }
            const nested = node.offers;
            if (Array.isArray(nested)) {
                offers.push(...nested.filter(isRecord));
            } else if (isRecord(nested)) {
                offers.push(nested);
            }
        }

        const offerNodes = types.includes('Product')
            ? offers.filter((offer) => offer !== node || types.includes('Offer'))
            : types.includes('Offer')
              ? [node]
              : [];
        if (types.includes('Product') && offerNodes.length === 0) {
            push(
                issue(
                    'SCHEMA_FIELD_MISSING',
                    'warning',
                    'Product ohne Offer.',
                    'Ein Offer nennt Preis und Währung, die eine Antwortmaschine als Angebot zitieren kann.',
                    'Ein offers-Objekt mit price und priceCurrency ergänzen, passend zum Preis im sichtbaren Text.',
                ),
            );
        }
        for (const offer of offerNodes) {
            if (types.includes('Offer')) {
                sawCitable = true;
            }
            const price = stringField(offer.price);
            const currency = stringField(offer.priceCurrency);
            if (!price) {
                push(
                    issue(
                        'SCHEMA_FIELD_MISSING',
                        'warning',
                        'Offer ohne price.',
                        'price ist der Betrag, den eine Antwortmaschine als Preis zitieren kann.',
                        'Den sichtbaren Preis als price eintragen, zusammen mit priceCurrency, zum Beispiel EUR.',
                    ),
                );
            } else if (!priceVariants(price).some((variant) => textHas(visible, variant))) {
                push(
                    issue(
                        'SCHEMA_NOT_IN_TEXT',
                        'warning',
                        `Der Preis „${price}“ aus dem Offer steht nicht im sichtbaren Seitentext.`,
                        'Stimmen JSON-LD und sichtbarer Preis nicht überein, kann eine Antwortmaschine einen Betrag zitieren, den die Seite nicht zeigt.',
                        'Denselben Betrag im Fließtext oder in der Preistabelle nennen wie im Feld price.',
                    ),
                );
            }
            if (!currency) {
                push(
                    issue(
                        'SCHEMA_FIELD_MISSING',
                        'info',
                        'Offer ohne priceCurrency.',
                        'priceCurrency ist die Währung des Preises, zum Beispiel EUR.',
                        'priceCurrency passend zum genannten Preis setzen.',
                    ),
                );
            }
        }
    }

    if (!sawCitable) {
        const listed = [...seenTypes].slice(0, 6).join(', ') || 'ohne @type';
        findings.unshift(
            issue(
                'SCHEMA_NOT_CITABLE',
                'info',
                `JSON-LD ist vorhanden (${listed}), ohne Organization, LocalBusiness, FAQPage oder Product/Offer.`,
                'Diese Typen transportieren Anbieter, Fragen und Preise. Andere Typen bleiben für eine Antwortmaschine oft ohne zitierbaren Fakt.',
                'Auf der Anbieter- oder Angebotsseite Organization oder LocalBusiness mit name, url und sameAs ergänzen, oder Product mit Offer.',
            ),
        );
    }

    return findings.slice(0, 8);
}

export function citationFindingsForPage(page: CrawledPage, titleCounts: Map<string, number>): PageAuditIssue[] {
    if (!successfulPage(page)) {
        return [];
    }
    const findings: PageAuditIssue[] = [];
    const canonical = page.canonicalUrl.trim();
    if (!canonical) {
        findings.push(
            issue(
                'CANONICAL_MISSING',
                'warning',
                'Keine Canonical-URL.',
                CANONICAL_EXPLANATION,
                'Im head ein link rel="canonical" auf die URL setzen, die zitiert werden soll.',
            ),
        );
    } else {
        const resolved = normalizeUrl(canonical, page.url);
        if (resolved && resolved !== page.normalizedUrl) {
            findings.push(
                issue(
                    'CANONICAL_MISMATCH',
                    'warning',
                    `Canonical-URL ${resolved} weicht von der aufgerufenen URL ab.`,
                    CANONICAL_EXPLANATION,
                    'Die Canonical-URL auf die aufgerufene Adresse setzen, oder die zitierfähige Fassung nur unter der Canonical-URL ausliefern.',
                ),
            );
        }
    }

    const key = titleKey(page);
    const copies = key ? (titleCounts.get(key) ?? 0) : 0;
    if (copies > 1) {
        findings.push(
            issue(
                'DUPLICATE_TITLE',
                'warning',
                `Der title „${page.title}“ kommt auf ${copies} Seiten dieses Laufs vor.`,
                'Der title ist die kurze Bezeichnung der Seite in Zitaten. Derselbe title auf mehreren URLs macht die Seiten schwer unterscheidbar.',
                'Jeder URL einen eigenen title geben, der das Thema genau dieser Seite nennt.',
            ),
        );
    }

    findings.push(...schemaFindings(page));
    return findings;
}

export function annotateCrawlCitation(
    pages: CrawledPage[],
    robotsTxt: string | null,
): { pages: CrawledPage[]; aiCrawlerAccess: AiCrawlerAccess[] } {
    const aiCrawlerAccess = assessAiCrawlerAccess(robotsTxt);
    const titleCounts = new Map<string, number>();
    for (const page of pages) {
        const key = titleKey(page);
        if (key && successfulPage(page)) {
            titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
        }
    }

    const annotated = pages.map((page) => {
        const citationQuote = successfulPage(page) ? buildCitationQuote(page) : '';
        const findings = citationFindingsForPage(page, titleCounts);
        if (successfulPage(page) && citationQuote.length < 40) {
            findings.push(
                issue(
                    'THIN_QUOTE',
                    'warning',
                    citationQuote
                        ? `Der Zitiersatz ist kurz: „${citationQuote}“.`
                        : 'Unter der Hauptüberschrift steht kein zitierbarer Absatz.',
                    QUOTE_EXPLANATION,
                    'Unter der H1 ein bis zwei Sätze ergänzen, die Anbieter, Angebot und den konkreten Nutzen nennen.',
                ),
            );
        }
        return {
            ...page,
            citationQuote,
            auditIssues: [...page.auditIssues, ...findings],
        };
    });

    return { pages: annotated, aiCrawlerAccess };
}

export function countCitationFindings(pages: CrawledPage[]): number {
    return pages.reduce(
        (total, page) => total + page.auditIssues.filter((item) => isCitationIssueCode(item.code)).length,
        0,
    );
}
