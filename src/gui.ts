// SPDX-License-Identifier: MIT
export function renderGuiHtml(port: number): string {
    return `<!DOCTYPE html>
<html lang="de" data-theme="dark">
<head>
    <!-- SPDX-License-Identifier: MIT. Copyright (c) 2026 Aleksey Krivonos. -->
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" id="theme-color-meta" content="#090d16">
    <title>CrawlPulse — Lokale Web-Crawl, Markdown & KI-Kontext-Engine</title>
    <style>
        :root, [data-theme="dark"] {
            --bg-canvas: #090d16;
            --bg-surface-1: #111827;
            --bg-surface-2: #1e293b;
            --bg-glass: rgba(17, 24, 39, 0.84);
            --border-subtle: rgba(148, 163, 184, 0.16);
            --border-strong: rgba(148, 163, 184, 0.28);
            --text-high: #f8fafc;
            --text-medium: #cbd5e1;
            --text-low: #94a3b8;
            --accent-primary: #38bdf8;
            --accent-primary-hover: #0ea5e9;
            --accent-primary-fg: #082f49;
            --accent-secondary: #818cf8;
            --status-success-bg: rgba(16, 185, 129, 0.16);
            --status-success-fg: #34d399;
            --status-warning-bg: rgba(245, 158, 11, 0.16);
            --status-warning-fg: #fbbf24;
            --status-danger-bg: rgba(239, 68, 68, 0.18);
            --status-danger-fg: #f87171;
            --shadow-elevated: 0 10px 30px -5px rgba(2, 6, 23, 0.6), inset 0 1px 0 0 rgba(255, 255, 255, 0.06);
        }

        [data-theme="light"] {
            --bg-canvas: #f8fafc;
            --bg-surface-1: #ffffff;
            --bg-surface-2: #f1f5f9;
            --bg-glass: rgba(255, 255, 255, 0.88);
            --border-subtle: rgba(15, 23, 42, 0.12);
            --border-strong: rgba(15, 23, 42, 0.22);
            --text-high: #0f172a;
            --text-medium: #334155;
            --text-low: #475569;
            --accent-primary: #0369a1;
            --accent-primary-hover: #075985;
            --accent-primary-fg: #ffffff;
            --accent-secondary: #4f46e5;
            --status-success-bg: #dcfce7;
            --status-success-fg: #166534;
            --status-warning-bg: #fef3c7;
            --status-warning-fg: #92400e;
            --status-danger-bg: #fee2e2;
            --status-danger-fg: #991b1b;
            --shadow-elevated: 0 8px 24px -4px rgba(15, 23, 42, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.8);
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            min-height: 100dvh;
            background: var(--bg-canvas);
            color: var(--text-high);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.5;
            padding-left: env(safe-area-inset-left, 0px);
            padding-right: env(safe-area-inset-right, 0px);
            padding-bottom: env(safe-area-inset-bottom, 0px);
            overscroll-behavior-y: contain;
        }

        .visually-hidden {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }

        .tabular-nums {
            font-variant-numeric: tabular-nums;
        }

        /* Skip-to-Content Link (BFSG / WCAG 2.4.1) */
        .skip-link {
            position: absolute;
            top: -100px;
            left: 16px;
            z-index: 1000;
            padding: 12px 20px;
            background: var(--accent-primary);
            color: var(--accent-primary-fg);
            font-weight: 700;
            border-radius: 10px;
            text-decoration: none;
        }
        .skip-link:focus {
            top: 12px;
        }

        /* Sichtbarer Tastaturfokus (WCAG 2.4.7) */
        :focus-visible {
            outline: 3px solid var(--accent-primary);
            outline-offset: 2px;
        }

        @media (prefers-reduced-motion: reduce) {
            *, ::before, ::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
                scroll-behavior: auto !important;
            }
        }

        header.topbar {
            position: sticky;
            top: 0;
            z-index: 50;
            backdrop-filter: blur(14px);
            background: var(--bg-glass);
            border-bottom: 1px solid var(--border-subtle);
            padding: max(12px, env(safe-area-inset-top, 0px)) 24px 12px;
        }

        .topbar-inner {
            max-width: 1440px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .brand h1 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 700;
            letter-spacing: -0.02em;
        }

        .badge-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
            background: var(--status-success-bg);
            color: var(--status-success-fg);
            border: 1px solid var(--border-subtle);
        }

        .badge-warn {
            background: var(--status-warning-bg);
            color: var(--status-warning-fg);
        }

        .badge-danger {
            background: var(--status-danger-bg);
            color: var(--status-danger-fg);
        }

        nav.nav-tabs {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        @media (max-width: 720px) {
            nav.nav-tabs {
                flex-wrap: nowrap;
                overflow-x: auto;
                max-width: 100%;
                scroll-snap-type: x mandatory;
            }

            .tab-btn {
                scroll-snap-align: start;
                flex: 0 0 auto;
            }
        }

        .tab-btn, .btn {
            min-height: 44px;
            min-width: 44px;
            padding: 8px 16px;
            border-radius: 10px;
            border: 1px solid var(--border-subtle);
            background: var(--bg-surface-1);
            color: var(--text-medium);
            font-size: 0.875rem;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: background 150ms ease, color 150ms ease, border-color 150ms ease, transform 80ms ease-out;
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
        }

        .btn[hidden] {
            display: none;
        }

        @media (hover: hover) and (pointer: fine) {
            .tab-btn:hover, .btn:hover {
                background: var(--bg-surface-2);
                color: var(--text-high);
                border-color: var(--border-strong);
            }

            .btn-primary:hover {
                background: var(--accent-primary-hover);
                color: var(--accent-primary-fg);
            }
        }

        .tab-btn:active, .btn:active {
            transform: scale(0.98);
        }

        .tab-btn[aria-selected="true"], .btn-primary {
            background: var(--accent-primary);
            color: var(--accent-primary-fg);
            border-color: transparent;
            font-weight: 700;
        }

        .btn-danger {
            background: var(--status-danger-bg);
            color: var(--status-danger-fg);
            border-color: rgba(239, 68, 68, 0.35);
        }

        main.container {
            max-width: 1440px;
            margin: 0 auto;
            padding: 24px;
        }

        .panel {
            display: none;
        }
        .panel.active {
            display: block;
        }
        .panel[hidden] {
            display: none;
        }

        .card {
            background: var(--bg-surface-1);
            border: 1px solid var(--border-subtle);
            border-radius: 16px;
            padding: 20px;
            box-shadow: var(--shadow-elevated);
            margin-bottom: 20px;
        }

        .card h2 {
            margin: 0 0 8px 0;
            font-size: 1.15rem;
        }

        .card h3 {
            margin: 0 0 10px 0;
            font-size: 1rem;
        }

        .subtitle {
            color: var(--text-low);
            font-size: 0.875rem;
            margin: 0 0 16px 0;
        }

        .form-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 16px;
            margin-bottom: 16px;
        }

        .field {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .field label {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--text-medium);
        }

        .field input, .field select, .field textarea {
            min-height: 44px;
            padding: 10px 12px;
            border-radius: 10px;
            border: 1px solid var(--border-strong);
            background: var(--bg-surface-2);
            color: var(--text-high);
            font-size: 1rem;
            font-family: inherit;
        }

        .field-error {
            margin: 0;
            font-size: 0.875rem;
            font-weight: 600;
            color: var(--status-danger-fg);
        }

        .field-hint {
            font-size: 0.75rem;
            color: var(--text-low);
        }

        .checkbox-row {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            margin: 12px 0 20px 0;
        }

        .checkbox-label {
            min-height: 44px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 0.875rem;
            color: var(--text-medium);
            cursor: pointer;
        }

        .checkbox-label input[type="checkbox"] {
            width: 22px;
            height: 22px;
            accent-color: var(--accent-primary);
        }

        .link-btn {
            min-height: 44px;
            padding: 8px 0;
            border: 0;
            background: transparent;
            color: var(--accent-primary);
            font: inherit;
            font-weight: 600;
            text-align: left;
            cursor: pointer;
            touch-action: manipulation;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
            gap: 14px;
            margin-bottom: 20px;
        }

        .stat-box {
            background: var(--bg-surface-2);
            border: 1px solid var(--border-subtle);
            border-radius: 12px;
            padding: 14px 16px;
        }

        .stat-label {
            font-size: 0.78rem;
            color: var(--text-low);
            display: block;
        }

        .stat-value {
            font-size: 1.45rem;
            font-weight: 700;
            margin-top: 4px;
            display: block;
        }

        .split-view {
            display: grid;
            grid-template-columns: 360px 1fr;
            gap: 20px;
        }

        @media (max-width: 960px) {
            .split-view {
                grid-template-columns: 1fr;
            }
        }

        .page-list {
            max-height: 620px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .page-item-btn {
            width: 100%;
            text-align: left;
            padding: 12px;
            border-radius: 10px;
            border: 1px solid var(--border-subtle);
            background: var(--bg-surface-2);
            color: var(--text-high);
            cursor: pointer;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .page-item-btn[aria-current="true"] {
            border-color: var(--accent-primary);
            box-shadow: inset 3px 0 0 var(--accent-primary);
        }

        pre.code-view {
            background: var(--bg-surface-2);
            border: 1px solid var(--border-subtle);
            border-radius: 12px;
            padding: 16px;
            overflow-x: auto;
            max-height: 540px;
            font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
            font-size: 0.84rem;
            white-space: pre-wrap;
            word-break: break-word;
            color: var(--text-high);
        }

        .ai-result {
            margin: 0;
            min-height: 16rem;
            padding: 16px;
            border: 1px solid var(--border-subtle);
            border-radius: 12px;
            background: var(--bg-surface-2);
            color: var(--text-high);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 1rem;
            line-height: 1.65;
            white-space: pre-wrap;
            word-break: break-word;
        }

        #citation-heading {
            margin-top: 20px;
        }

        .citation-list {
            list-style: none;
            margin: 0;
            padding: 0;
            display: grid;
            gap: 12px;
        }

        .citation-item {
            padding: 12px 14px;
            border: 1px solid var(--border-subtle);
            border-radius: 12px;
            background: var(--bg-surface-2);
        }

        .citation-item h4 {
            margin: 0 0 6px;
            font-size: 1rem;
        }

        .citation-item p {
            margin: 0 0 6px;
        }

        pre.code-view.is-reading {
            max-height: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 1rem;
            line-height: 1.6;
        }

        .ai-sources {
            margin: 0 0 12px 0;
            padding-left: 1.25rem;
            color: var(--text-medium);
        }

        .ai-task {
            container-type: inline-size;
            display: grid;
            gap: 16px;
            align-items: start;
            min-width: 0;
            padding: 16px;
            border: 1px solid var(--border-subtle);
            border-radius: 16px;
            background: var(--bg-surface-2);
        }

        @container (min-width: 720px) {
            .ai-task {
                grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
            }
        }

        .ai-task h3 {
            margin-top: 0;
        }

        .ai-task .ai-result {
            background: var(--bg-surface-1);
        }

        .progress-track {
            width: 100%;
            height: 12px;
            background: var(--bg-surface-2);
            border-radius: 999px;
            overflow: hidden;
            margin: 12px 0;
        }

        .progress-bar {
            height: 100%;
            background: var(--accent-primary);
            width: 0%;
            transition: width 200ms ease;
        }

        .progress-bar.is-waiting {
            width: 35%;
            animation: progress-wait 1.1s ease-in-out infinite;
        }

        @keyframes progress-wait {
            from { transform: translateX(-120%); }
            to { transform: translateX(280%); }
        }

        table.data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.875rem;
        }

        table.data-table th, table.data-table td {
            padding: 12px;
            border-bottom: 1px solid var(--border-subtle);
            text-align: left;
        }

        table.data-table th {
            color: var(--text-low);
            font-weight: 600;
        }

        dialog.confirm-dialog {
            background: var(--bg-surface-1);
            color: var(--text-high);
            border: 1px solid var(--border-strong);
            border-radius: 16px;
            padding: 24px;
            max-width: 460px;
            box-shadow: var(--shadow-elevated);
        }

        .dialog-handle {
            display: none;
            width: 48px;
            height: 6px;
            margin: 0 auto 16px;
            border-radius: 999px;
            background: var(--border-strong);
        }

        @media (max-width: 640px) {
            dialog.confirm-dialog {
                width: 100%;
                max-width: 100%;
                margin: auto 0 0 0;
                border-radius: 16px 16px 0 0;
                padding-bottom: max(24px, env(safe-area-inset-bottom, 0px));
            }

            .dialog-handle {
                display: block;
            }
        }

        dialog::backdrop {
            background: rgba(2, 6, 23, 0.7);
        }

        .toast-region {
            position: fixed;
            bottom: max(16px, env(safe-area-inset-bottom, 0px));
            right: max(16px, env(safe-area-inset-right, 0px));
            z-index: 200;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .toast {
            background: var(--bg-surface-1);
            border: 1px solid var(--accent-primary);
            color: var(--text-high);
            padding: 12px 18px;
            border-radius: 12px;
            box-shadow: var(--shadow-elevated);
            font-size: 0.875rem;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <a href="#main" class="skip-link">Zum Hauptinhalt springen</a>

    <header class="topbar">
        <div class="topbar-inner">
            <div class="brand">
                <span aria-hidden="true" style="font-size:1.5rem;">🕸️</span>
                <div>
                    <h1>CrawlPulse</h1>
                    <span style="font-size:0.75rem;color:var(--text-low);">Lokale Web-Crawl, Markdown &amp; KI-Kontext-Engine (127.0.0.1:${port}) · Aleksey Krivonos · MIT</span>
                </div>
                <span class="badge-pill" id="security-badge">✓ SSRF-Guard & Localhost-Only</span>
            </div>

            <nav class="nav-tabs" aria-label="Hauptnavigation" role="tablist" aria-orientation="horizontal">
                <button type="button" role="tab" class="tab-btn" id="tab-btn-cockpit" aria-controls="panel-cockpit" aria-selected="true" tabindex="0" onclick="switchTab('cockpit')">Cockpit</button>
                <button type="button" role="tab" class="tab-btn" id="tab-btn-monitor" aria-controls="panel-monitor" aria-selected="false" tabindex="-1" onclick="switchTab('monitor')">Live-Monitor</button>
                <button type="button" role="tab" class="tab-btn" id="tab-btn-inspector" aria-controls="panel-inspector" aria-selected="false" tabindex="-1" onclick="switchTab('inspector')">Inspektor</button>
                <button type="button" role="tab" class="tab-btn" id="tab-btn-reports" aria-controls="panel-reports" aria-selected="false" tabindex="-1" onclick="switchTab('reports')">Berichte & Export</button>
                <button type="button" role="tab" class="tab-btn" id="tab-btn-ai" aria-controls="panel-ai" aria-selected="false" tabindex="-1" onclick="switchTab('ai')">KI-Studio & MCP</button>
                <button type="button" role="tab" class="tab-btn" id="tab-btn-history" aria-controls="panel-history" aria-selected="false" tabindex="-1" onclick="switchTab('history')">Historie (<span id="history-count" class="tabular-nums">0</span>)</button>
            </nav>
            <button type="button" class="btn" id="theme-toggle-btn" onclick="toggleTheme()" aria-label="Farbschema zwischen Dunkel und Hell umschalten">Farbschema</button>
        </div>
    </header>

    <main id="main" class="container">
        <div aria-live="polite" id="sr-status" class="visually-hidden">Bereit.</div>

        <!-- TAB 1: COCKPIT -->
        <section id="panel-cockpit" class="panel active" role="tabpanel" aria-labelledby="tab-btn-cockpit">
            <div class="card">
                <h2 id="heading-cockpit">Neuen Crawl oder Seiten-Extraktion starten</h2>
                <p class="subtitle">Wandelt Websites lokal und SSRF-geschützt in bereinigtes LLM-Markdown, Schema.org-Strukturdaten und Qualitätsberichte um.</p>

                <form id="crawl-form" onsubmit="startCrawl(event)">
                    <div class="form-grid">
                        <div class="field" style="grid-column: span 2;">
                            <label for="input-url">Ziel-URL (http:// oder https://) *</label>
                            <input id="input-url" name="url" type="url" required inputmode="url" autocomplete="url" autocapitalize="none" spellcheck="false" placeholder="https://example.com" value="https://example.com" aria-describedby="input-url-hint input-url-error">
                            <span class="field-hint" id="input-url-hint">Private IPs (127.0.0.1, 10.x, 192.168.x, 169.254.x) und lokale Dateien werden durch den SSRF-Guard automatisch blockiert.</span>
                            <p class="field-error" id="input-url-error" hidden></p>
                        </div>

                        <div class="field">
                            <label for="input-mode">Crawl-Modus</label>
                            <select id="input-mode" name="mode">
                                <option value="single">Einzelseite (Schneller Scrape)</option>
                                <option value="crawl" selected>Domain-Crawl (Interne Links folgen)</option>
                                <option value="sitemap">Sitemap-Scan (sitemap.xml + Crawl)</option>
                            </select>
                        </div>

                        <div class="field">
                            <label for="input-max-pages">Max. Seitenanzahl (1–200)</label>
                            <input id="input-max-pages" name="maxPages" type="number" inputmode="numeric" min="1" max="200" value="15" class="tabular-nums">
                        </div>

                        <div class="field">
                            <label for="input-max-depth">Max. Klicktiefe (0–5)</label>
                            <input id="input-max-depth" name="maxDepth" type="number" inputmode="numeric" min="0" max="5" value="2" class="tabular-nums">
                        </div>

                        <div class="field">
                            <label for="input-include">Nur Pfade einschließen (optional)</label>
                            <input id="input-include" name="includePatterns" type="text" placeholder="z. B. /docs/*, /blog/*">
                        </div>

                        <div class="field">
                            <label for="input-exclude">Pfade ausschließen (optional)</label>
                            <input id="input-exclude" name="excludePatterns" type="text" placeholder="z. B. /login, /cart, *.pdf">
                        </div>

                        <div class="field">
                            <label for="input-selector">Gezielter CSS-Selektor (optional)</label>
                            <input id="input-selector" name="cssSelector" type="text" placeholder="z. B. article, .pricing, #content">
                        </div>
                    </div>

                    <div class="checkbox-row">
                        <label class="checkbox-label">
                            <input type="checkbox" id="input-robots" checked>
                            <span>robots.txt respektieren</span>
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" id="input-strip-hidden" checked>
                            <span>Prompt-Injection- & Hidden-DOM-Filter aktivieren</span>
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" id="input-zero-pii">
                            <span>Zero-PII-Modus (E-Mails, IBANs & Telefonnummern schwärzen)</span>
                        </label>
                    </div>

                    <div style="display:flex;gap:12px;flex-wrap:wrap;">
                        <button type="submit" class="btn btn-primary" id="btn-start-crawl">🚀 Crawl jetzt starten</button>
                        <button type="button" class="btn" onclick="switchTab('ai')">🤖 KI-Anbindung prüfen</button>
                    </div>
                </form>
            </div>
        </section>

        <!-- TAB 2: LIVE MONITOR -->
        <section id="panel-monitor" class="panel" role="tabpanel" aria-labelledby="tab-btn-monitor" hidden>
            <div class="card">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
                    <div>
                        <h2 id="heading-monitor">Echtzeit-Crawl-Monitor (Server-Sent Events)</h2>
                        <p class="subtitle" id="monitor-status-text">Kein aktiver Crawl-Lauf. Starten Sie einen Lauf im Cockpit.</p>
                    </div>
                    <button type="button" class="btn btn-danger" id="btn-stop-crawl" onclick="stopActiveCrawl()" disabled>⏹ Crawl stoppen</button>
                </div>

                <div class="progress-track" role="progressbar" aria-label="Crawl-Fortschritt" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0 Prozent" id="progress-container">
                    <div class="progress-bar" id="monitor-progress-bar"></div>
                </div>

                <div class="stats-grid">
                    <div class="stat-box">
                        <span class="stat-label">Erfasste Seiten</span>
                        <span class="stat-value tabular-nums" id="mon-pages">0 / 0</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">Warteschlange (Queue)</span>
                        <span class="stat-value tabular-nums" id="mon-queue">0</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">Geschätzte LLM-Tokens</span>
                        <span class="stat-value tabular-nums" id="mon-tokens">0</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">SSRF / Injection Blocks</span>
                        <span class="stat-value tabular-nums" id="mon-blocks">0</span>
                    </div>
                </div>

                <h3>Live-Protokoll & Sitemap-Strom</h3>
                <pre class="code-view" id="monitor-log" style="max-height:360px;">Bereit für eingehende Crawl-Events...</pre>
            </div>
        </section>

        <!-- TAB 3: INSPEKTOR -->
        <section id="panel-inspector" class="panel" role="tabpanel" aria-labelledby="tab-btn-inspector" hidden>
            <div class="card">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
                    <div>
                        <h2 id="heading-inspector">Ergebnis-Inspektor (Bereinigtes Markdown & Strukturdaten)</h2>
                        <p class="subtitle" id="inspector-run-label">Wählen Sie links eine gecrawlte Unterseite zur Detailprüfung.</p>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button type="button" class="btn btn-primary" onclick="copyCurrentMarkdown()">📋 Markdown für LLM kopieren</button>
                        <button type="button" class="btn" onclick="switchTab('reports')">📊 Zum Gesamtbericht</button>
                    </div>
                </div>

                <div class="split-view">
                    <div>
                        <div class="field" style="margin-bottom:12px;">
                            <label for="inspector-search">Unterseiten filtern</label>
                            <input id="inspector-search" type="search" enterkeyhint="search" placeholder="Titel oder URL suchen..." oninput="renderInspectorPageList()">
                        </div>
                        <div class="page-list" id="inspector-page-list">
                            <p class="subtitle">Noch keine Seiten geladen.</p>
                        </div>
                    </div>

                    <div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
                            <button type="button" class="btn" onclick="setInspectorSubTab('markdown')">📝 LLM-Markdown</button>
                            <button type="button" class="btn" onclick="setInspectorSubTab('metadata')">🗂️ Metadaten & JSON-LD</button>
                            <button type="button" class="btn" onclick="setInspectorSubTab('audit')">🛡️ Audit & KI-Zitat</button>
                            <button type="button" class="btn" onclick="setInspectorSubTab('html')">💻 Bereinigtes HTML</button>
                        </div>
                        <div id="inspector-detail-header" style="margin-bottom:12px;"></div>
                        <pre class="code-view" id="inspector-detail-content">Bitte links eine Seite auswählen.</pre>
                    </div>
                </div>
            </div>
        </section>

        <!-- TAB 4: BERICHTE & EXPORT -->
        <section id="panel-reports" class="panel" role="tabpanel" aria-labelledby="tab-btn-reports" hidden>
            <div class="card">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
                    <div>
                        <h2 id="heading-reports">Qualitäts-, Barrierefreiheits- & LLM-Kontext-Bericht</h2>
                        <p class="subtitle" id="report-domain-subtitle">Gesamtauswertung des ausgewählten Crawl-Laufs.</p>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button type="button" class="btn btn-primary" onclick="exportBundle('llms-full')">⬇ llms-full.md (KI-Kontext-Bundle)</button>
                        <button type="button" class="btn" onclick="exportBundle('llms-txt')">⬇ llms.txt</button>
                        <button type="button" class="btn" onclick="exportBundle('json')">⬇ JSON-Report</button>
                        <button type="button" class="btn" onclick="exportBundle('csv')">⬇ CSV-Tabelle</button>
                    </div>
                </div>

                <div class="stats-grid" id="report-stats-grid">
                    <div class="stat-box">
                        <span class="stat-label">Health-Score</span>
                        <span class="stat-value tabular-nums" id="rep-health">– / 100</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">Erfolgreiche Seiten</span>
                        <span class="stat-value tabular-nums" id="rep-pages">0</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">Gesamt-Wörter / Tokens</span>
                        <span class="stat-value tabular-nums" id="rep-tokens">0</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">Ø Antwortzeit</span>
                        <span class="stat-value tabular-nums" id="rep-time">0 ms</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">Fehlende H1 / Title</span>
                        <span class="stat-value tabular-nums" id="rep-seo">0 / 0</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">Bilder ohne Alt-Text (BFSG)</span>
                        <span class="stat-value tabular-nums" id="rep-alt">0</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">Schema.org JSON-LD Seiten</span>
                        <span class="stat-value tabular-nums" id="rep-jsonld">0</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">Neutralisierte Injections / PII</span>
                        <span class="stat-value tabular-nums" id="rep-sec">0 / 0</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">KI-Zitier-Befunde</span>
                        <span class="stat-value tabular-nums" id="rep-citation">–</span>
                    </div>
                </div>

                <section aria-labelledby="citation-heading">
                    <h3 id="citation-heading">KI-Zitierbarkeit</h3>
                    <p class="field-hint" id="citation-glossary">Canonical-URL: die Adresse, die als maßgebliche Fassung einer Seite gilt. JSON-LD: maschinenlesbare Fakten im Seitenquelltext. Organization und LocalBusiness benennen den Anbieter. FAQPage enthält Frage und Antwort. Product und Offer enthalten Name, Preis und Währung. Der Zitiersatz ist der erste Absatz unter der Hauptüberschrift.</p>
                    <ul id="citation-crawlers" class="citation-list" aria-live="polite">
                        <li>Nach einem Crawl steht hier, welche KI-Crawler die Domain lesen dürfen.</li>
                    </ul>
                </section>

                <h3>Seiten-Übersicht & Befunde</h3>
                <div style="overflow-x:auto;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>URL</th>
                                <th>Titel</th>
                                <th class="tabular-nums">Status</th>
                                <th class="tabular-nums">Tokens</th>
                                <th class="tabular-nums">Zeit (ms)</th>
                                <th>Audit-Hinweise</th>
                            </tr>
                        </thead>
                        <tbody id="report-pages-tbody">
                            <tr><td colspan="6">Noch kein Crawl-Lauf geladen.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <!-- TAB 5: KI-STUDIO & MCP -->
        <section id="panel-ai" class="panel" role="tabpanel" aria-labelledby="tab-btn-ai" hidden>
            <div class="card">
                <h2 id="heading-ai">KI-Studio & 4-Wege-KI-Anbindung</h2>
                <p class="subtitle">Verbinden Sie CrawlPulse mit lokalem Ollama oder LM Studio auf diesem Rechner, mit einer OpenAI-kompatiblen Cloud-API oder als MCP-Server mit Ihrem KI-Editor. Ausgaben sind Entwürfe zur Prüfung.</p>

                <div class="stats-grid" style="margin-bottom:20px;">
                    <div class="stat-box">
                        <span class="stat-label">1️⃣ Lokales Ollama (127.0.0.1:11434)</span>
                        <span class="stat-value" id="ai-status-ollama" style="font-size:1rem;">Prüfe...</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">2️⃣ Lokales LM Studio (127.0.0.1:1234)</span>
                        <span class="stat-value" id="ai-status-lmstudio" style="font-size:1rem;">Prüfe...</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">3️⃣ Lokale Offline-Heuristik</span>
                        <span class="stat-value" style="font-size:1rem;color:var(--status-success-fg);">✓ Sofort einsatzbereit</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-label">4️⃣ MCP-Server (stdio JSON-RPC)</span>
                        <span class="stat-value" style="font-size:1rem;color:var(--status-success-fg);">✓ 5 Tools aktiv</span>
                    </div>
                </div>

                <div class="split-view">
                    <div>
                        <h3>KI-Provider konfigurieren</h3>
                        <form onsubmit="saveAiSettings(event)">
                            <div class="field" style="margin-bottom:12px;">
                                <label for="ai-provider">Aktiver KI-Provider</label>
                                <select id="ai-provider" onchange="onAiProviderChanged()">
                                    <option value="ollama">Lokales Ollama (http://127.0.0.1:11434)</option>
                                    <option value="lmstudio">Lokales LM Studio (http://127.0.0.1:1234)</option>
                                    <option value="openai-compatible">Cloud-API (OpenAI / DeepSeek / OpenRouter)</option>
                                    <option value="heuristic">Lokale Offline-Heuristik (Kein LLM nötig)</option>
                                </select>
                            </div>
                            <div class="field" style="margin-bottom:12px;">
                                <label for="ai-base-url">API Base-URL</label>
                                <input id="ai-base-url" type="url" value="http://127.0.0.1:11434">
                            </div>
                            <div class="field" style="margin-bottom:12px;" id="ai-model-field">
                                <label for="ai-model" id="ai-model-label">Modell</label>
                                <select id="ai-model">
                                    <option value="">Modelle werden geladen …</option>
                                </select>
                                <input id="ai-model-custom" type="text" hidden autocomplete="off" spellcheck="false" autocapitalize="none" aria-labelledby="ai-model-label" placeholder="z. B. gpt-4o-mini">
                                <span class="field-hint" id="ai-model-hint">Die Liste enthält nur Modelle, die Ollama oder LM Studio lokal melden.</span>
                                <button type="button" class="btn btn-primary" id="btn-start-model" onclick="startSelectedModel()">Modell starten</button>
                            </div>
                            <div class="field" style="margin-bottom:12px;">
                                <label for="ai-api-key">API-Key (nur für Cloud-API, bleibt lokal gespeichert)</label>
                                <input id="ai-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-...">
                            </div>
                            <label class="checkbox-label" style="margin-bottom:12px;">
                                <input type="checkbox" id="ai-zero-pii" checked>
                                <span>Zero-PII-Schutz vor jedem KI-Aufruf erzwingen</span>
                            </label>
                            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                <button type="submit" class="btn btn-primary">💾 Einstellungen speichern</button>
                                <button type="button" class="btn" onclick="checkLocalAiStatus()">🔄 Lokale Modelle neu suchen</button>
                            </div>
                        </form>

                        <hr style="border:none;border-top:1px solid var(--border-subtle);margin:20px 0;">
                        <h3>MCP-Server in Antigravity / Claude / Cursor einbinden</h3>
                        <p class="field-hint">Kopieren Sie diese Konfiguration in Ihre <code>mcp_config.json</code>:</p>
                        <pre class="code-view" id="mcp-config-snippet" style="font-size:0.75rem;"></pre>
                    </div>

                    <section class="ai-task" aria-labelledby="ai-run-heading">
                        <div>
                            <h3 id="ai-run-heading">KI-Analyse auf aktuellem Crawl ausführen</h3>
                            <div class="field" style="margin-bottom:12px;">
                                <label for="ai-mode">Analyse-Werkzeug</label>
                                <select id="ai-mode">
                                    <option value="summary">Executive Summary und Qualitätsbericht</option>
                                    <option value="schema">Strukturierte Daten extrahieren</option>
                                    <option value="qa">Frage an den gecrawlten Kontext</option>
                                </select>
                            </div>
                            <div class="field" style="margin-bottom:12px;">
                                <label for="ai-prompt">Frage, Fokus oder gewünschte Felder</label>
                                <textarea id="ai-prompt" rows="4" placeholder="Zum Beispiel: Welche Leistungen und Preise werden genannt?"></textarea>
                            </div>
                            <button type="button" class="btn btn-primary" id="btn-run-ai" onclick="runAiAnalysis()">KI-Analyse jetzt starten</button>
                        </div>
                        <div>
                            <h3 id="ai-result-heading">KI-Ergebnis</h3>
                            <p class="field-hint" id="ai-disclosure">Maschinell erzeugt. Entwurf zur Prüfung, keine automatische Entscheidung.</p>
                            <ul id="ai-sources" class="ai-sources" hidden></ul>
                            <pre class="ai-result" id="ai-output-box" aria-labelledby="ai-result-heading" aria-describedby="ai-disclosure" aria-live="polite">Die Antwort erscheint hier, direkt neben der Frage.</pre>
                        </div>
                    </section>
                </div>
            </div>
        </section>

        <!-- TAB 6: HISTORIE & DIFF -->
        <section id="panel-history" class="panel" role="tabpanel" aria-labelledby="tab-btn-history" hidden>
            <div class="card">
                <h2 id="heading-history">Gespeicherte Crawl-Läufe (Lokale SQLite-Datenbank)</h2>
                <p class="subtitle">Alle Läufe sind offline in Ihrer lokalen SQLite-Datenbank gespeichert und können jederzeit geladen oder miteinander verglichen werden.</p>

                <div style="overflow-x:auto;margin-bottom:24px;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Zeitpunkt</th>
                                <th>Domain / Start-URL</th>
                                <th>Modus</th>
                                <th class="tabular-nums">Seiten</th>
                                <th class="tabular-nums">Tokens</th>
                                <th class="tabular-nums">Health</th>
                                <th>Aktionen</th>
                            </tr>
                        </thead>
                        <tbody id="history-tbody">
                            <tr><td colspan="7">Lade gespeicherte Läufe...</td></tr>
                        </tbody>
                    </table>
                </div>

                <h3>Diff-Vergleich zwischen zwei Crawl-Läufen</h3>
                <div class="form-grid">
                    <div class="field">
                        <label for="diff-run-a">Älterer Lauf (Basis A)</label>
                        <select id="diff-run-a"></select>
                    </div>
                    <div class="field">
                        <label for="diff-run-b">Neuerer Lauf (Vergleich B)</label>
                        <select id="diff-run-b"></select>
                    </div>
                    <div class="field" style="justify-content:flex-end;">
                        <button type="button" class="btn btn-primary" onclick="compareSelectedRuns()">🔍 Läufe vergleichen</button>
                    </div>
                </div>
                <pre class="code-view" id="diff-output-box">Wählen Sie zwei gespeicherte Läufe aus, um neue, entfernte oder geänderte Unterseiten zu vergleichen.</pre>
            </div>
        </section>
    </main>

    <!-- Zweistufiger Bestätigungsdialog für destruktives Löschen (B2B SaaS UX Standard) -->
    <dialog id="delete-dialog" class="confirm-dialog" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-desc">
        <div class="dialog-handle" aria-hidden="true"></div>
        <h3 id="delete-dialog-title" style="margin-top:0;">Gespeicherten Crawl-Lauf unwiderruflich löschen?</h3>
        <p id="delete-dialog-desc" style="color:var(--text-medium);font-size:0.9rem;">
            Dieser Schritt entfernt den ausgewählten Crawl-Bericht und alle zugehörigen Markdown-Seiten aus der lokalen SQLite-Datenbank. Diese Aktion kann nicht rückgängig gemacht werden.
        </p>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
            <button type="button" class="btn" onclick="closeDeleteDialog()">Abbrechen</button>
            <button type="button" class="btn btn-danger" id="confirm-delete-btn">Ja, Bericht löschen</button>
        </div>
    </dialog>

    <div class="toast-region" id="toast-region" aria-live="polite"></div>

    <script>
        let currentRun = null;
        let selectedPageIndex = 0;
        let inspectorSubTab = 'markdown';
        let savedRunsList = [];
        let pendingDeleteRunId = null;
        let activeEventSource = null;
        let discoveredLocalModels = { ollama: [], lmstudio: [] };
        let preferredModel = '';

        function announce(msg) {
            const el = document.getElementById('sr-status');
            if (el) el.textContent = msg;
        }

        function showToast(msg) {
            announce(msg);
            const region = document.getElementById('toast-region');
            const item = document.createElement('div');
            item.className = 'toast';
            item.textContent = msg;
            region.appendChild(item);
            setTimeout(() => item.remove(), 3500);
        }

        function applyThemeColor(theme) {
            const meta = document.getElementById('theme-color-meta');
            if (meta) meta.setAttribute('content', theme === 'light' ? '#f8fafc' : '#090d16');
        }

        function toggleTheme() {
            const html = document.documentElement;
            const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            html.setAttribute('data-theme', next);
            applyThemeColor(next);
            localStorage.setItem('crawlpulse-theme', next);
        }

        const TABS = ['cockpit', 'monitor', 'inspector', 'reports', 'ai', 'history'];

        function resolveTab(tabName) {
            return TABS.includes(tabName) ? tabName : 'cockpit';
        }

        function applyTab(tabName) {
            const name = resolveTab(tabName);
            for (const t of TABS) {
                const selected = t === name;
                const btn = document.getElementById('tab-btn-' + t);
                const panel = document.getElementById('panel-' + t);
                if (btn) {
                    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
                    btn.tabIndex = selected ? 0 : -1;
                }
                if (panel) {
                    panel.classList.toggle('active', selected);
                    panel.toggleAttribute('hidden', !selected);
                }
            }
            return name;
        }

        function syncTabUrl(name, historyMode) {
            const url = new URL(window.location.href);
            if (name === 'cockpit') url.searchParams.delete('tab');
            else url.searchParams.set('tab', name);
            const next = url.pathname + url.search + url.hash;
            const current = window.location.pathname + window.location.search + window.location.hash;
            if (next === current) return;
            const state = { tab: name };
            if (historyMode === 'replace') window.history.replaceState(state, '', next);
            else window.history.pushState(state, '', next);
        }

        function switchTab(tabName, historyMode) {
            const name = applyTab(tabName);
            syncTabUrl(name, historyMode === 'replace' ? 'replace' : 'push');
            return name;
        }

        function setUrlFieldError(message) {
            const input = document.getElementById('input-url');
            const error = document.getElementById('input-url-error');
            if (!input || !error) return;
            if (!message) {
                input.removeAttribute('aria-invalid');
                error.hidden = true;
                error.textContent = '';
                return;
            }
            input.setAttribute('aria-invalid', 'true');
            error.hidden = false;
            error.textContent = message;
        }

        function setProgress(pct, waiting) {
            const value = Math.max(0, Math.min(100, Math.round(pct)));
            const bar = document.getElementById('monitor-progress-bar');
            const track = document.getElementById('progress-container');
            if (waiting) {
                bar.classList.add('is-waiting');
                bar.style.width = '35%';
                track.removeAttribute('aria-valuenow');
                track.setAttribute('aria-valuetext', 'Crawl läuft, Fortschritt noch offen');
                return;
            }
            bar.classList.remove('is-waiting');
            bar.style.width = value + '%';
            track.setAttribute('aria-valuenow', String(value));
            track.setAttribute('aria-valuetext', value + ' Prozent');
        }

        function escapeHtml(str) {
            return String(str ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        async function startCrawl(e) {
            e.preventDefault();
            const urlInput = document.getElementById('input-url');
            const url = urlInput.value.trim();
            setUrlFieldError('');
            let parsedUrl;
            try {
                parsedUrl = new URL(url);
            } catch {
                setUrlFieldError('Die Adresse ist ungültig. Beispiel: https://example.com');
                urlInput.focus();
                return;
            }
            if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                setUrlFieldError('Nur http- und https-Adressen sind zulässig.');
                urlInput.focus();
                return;
            }
            const mode = document.getElementById('input-mode').value;
            const maxPages = Number(document.getElementById('input-max-pages').value || 15);
            const maxDepth = Number(document.getElementById('input-max-depth').value || 2);
            const includePatterns = document.getElementById('input-include').value.split(',').map(s => s.trim()).filter(Boolean);
            const excludePatterns = document.getElementById('input-exclude').value.split(',').map(s => s.trim()).filter(Boolean);
            const cssSelector = document.getElementById('input-selector').value.trim();
            const respectRobotsTxt = document.getElementById('input-robots').checked;
            const stripHiddenElements = document.getElementById('input-strip-hidden').checked;
            const zeroPii = document.getElementById('input-zero-pii').checked;

            switchTab('monitor');
            const statusText = document.getElementById('monitor-status-text');
            const logEl = document.getElementById('monitor-log');
            statusText.textContent = 'Crawl wird gestartet …';
            logEl.textContent = 'Crawl wird gestartet …\\n';
            document.getElementById('mon-pages').textContent = '0 / ' + maxPages;
            document.getElementById('mon-queue').textContent = '…';
            document.getElementById('mon-tokens').textContent = '0';
            document.getElementById('mon-blocks').textContent = '0';
            document.getElementById('btn-stop-crawl').disabled = false;
            setProgress(0, true);
            announce('Crawl wird gestartet.');

            let res;
            try {
                res = await fetch('/api/crawl/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url, mode, maxPages, maxDepth, includePatterns, excludePatterns,
                        cssSelector, respectRobotsTxt, stripHiddenElements, zeroPii
                    }),
                    signal: AbortSignal.timeout(20_000)
                });
            } catch (error) {
                statusText.textContent = 'Der Crawl-Start hat nicht geantwortet.';
                logEl.textContent += 'Start fehlgeschlagen: ' + (error && error.name === 'TimeoutError' ? 'Zeitüberschreitung' : 'keine Verbindung zum lokalen Server') + '.\\n';
                document.getElementById('btn-stop-crawl').disabled = true;
                setProgress(0, false);
                showToast('Der Crawl-Start hat nicht geantwortet.');
                return;
            }

            let data = {};
            try {
                data = await res.json();
            } catch {
                data = {};
            }
            if (!res.ok || !data.runId) {
                switchTab('cockpit');
                setUrlFieldError(data.error || 'Der Crawl wurde abgelehnt.');
                urlInput.focus();
                document.getElementById('btn-stop-crawl').disabled = true;
                setProgress(0, false);
                showToast('Fehler: ' + (data.error || 'Crawl abgelehnt'));
                return;
            }

            statusText.textContent = 'Crawl gestartet. Live-Daten werden verbunden …';
            logEl.textContent += 'Lauf angenommen. Verbinde den Live-Stream …\\n';
            subscribeToEvents(data.runId);
        }

        function subscribeToEvents(runId) {
            if (activeEventSource) {
                activeEventSource.close();
            }
            let totalTokens = 0;
            let blocks = 0;
            let streamFinished = false;
            let sawEvent = false;
            activeEventSource = new EventSource('/api/crawl/events?runId=' + encodeURIComponent(runId));
            activeEventSource.onopen = () => {
                if (sawEvent || streamFinished) return;
                document.getElementById('monitor-status-text').textContent = 'Live-Verbindung steht. Warte auf die erste Seite …';
            };
            activeEventSource.onerror = () => {
                if (streamFinished) return;
                const statusText = document.getElementById('monitor-status-text');
                if (activeEventSource.readyState === EventSource.CLOSED) {
                    statusText.textContent = sawEvent
                        ? 'Die Live-Verbindung wurde getrennt.'
                        : 'Die Live-Verbindung konnte nicht aufgebaut werden.';
                    document.getElementById('monitor-log').textContent += 'Live-Verbindung getrennt.\\n';
                    setProgress(0, false);
                } else if (!sawEvent) {
                    statusText.textContent = 'Live-Verbindung wird erneut versucht …';
                }
            };
            activeEventSource.onmessage = async (ev) => {
                const payload = JSON.parse(ev.data);
                sawEvent = true;
                const logEl = document.getElementById('monitor-log');
                logEl.textContent += '[' + new Date().toLocaleTimeString('de-DE') + '] ' + payload.message + '\\n';
                logEl.scrollTop = logEl.scrollHeight;

                document.getElementById('monitor-status-text').textContent = payload.message;
                document.getElementById('mon-pages').textContent = payload.pagesProcessed + ' / ' + payload.maxPages;
                document.getElementById('mon-queue').textContent = String(payload.queueSize || 0);

                if (payload.page) {
                    totalTokens += payload.page.estimatedTokens || 0;
                    blocks += payload.page.promptInjectionsRemoved || 0;
                    document.getElementById('mon-tokens').textContent = String(totalTokens);
                    document.getElementById('mon-blocks').textContent = String(blocks);
                }

                const pct = payload.maxPages > 0 ? Math.min(100, Math.round((payload.pagesProcessed / payload.maxPages) * 100)) : 100;
                setProgress(pct, false);

                if (payload.type === 'completed' || payload.type === 'stopped' || payload.type === 'error') {
                    streamFinished = true;
                    document.getElementById('btn-stop-crawl').disabled = true;
                    setProgress(payload.type === 'error' ? pct : 100, false);
                    activeEventSource.close();
                    if (payload.type !== 'error') {
                        await loadRunById(runId);
                        await loadHistory();
                    }
                    showToast(payload.type === 'error'
                        ? ('Crawl-Fehler: ' + payload.message)
                        : ('Crawl abgeschlossen (' + payload.pagesProcessed + ' Seiten)'));
                }
            };
        }

        async function stopActiveCrawl() {
            await fetch('/api/crawl/stop', { method: 'POST' });
            showToast('Stopp-Signal gesendet');
        }

        async function loadRunById(runId) {
            const res = await fetch('/api/runs/' + encodeURIComponent(runId));
            if (!res.ok) return;
            currentRun = await res.json();
            selectedPageIndex = 0;
            renderInspectorPageList();
            renderInspectorDetail();
            renderReportView();
        }

        function renderInspectorPageList() {
            const container = document.getElementById('inspector-page-list');
            if (!currentRun || !currentRun.pages || currentRun.pages.length === 0) {
                container.innerHTML = '<p class="subtitle">Noch keine Seiten im aktuellen Lauf.</p>';
                return;
            }
            document.getElementById('inspector-run-label').textContent =
                'Aktiver Lauf: ' + currentRun.domain + ' (' + currentRun.pages.length + ' Seiten, ~' + currentRun.summary.totalEstimatedTokens + ' Tokens)';

            const filter = (document.getElementById('inspector-search').value || '').toLowerCase();
            container.innerHTML = '';

            currentRun.pages.forEach((p, idx) => {
                if (filter && !p.title.toLowerCase().includes(filter) && !p.url.toLowerCase().includes(filter)) {
                    return;
                }
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'page-item-btn';
                btn.setAttribute('aria-current', String(idx === selectedPageIndex));
                btn.onclick = () => {
                    selectedPageIndex = idx;
                    renderInspectorPageList();
                    renderInspectorDetail();
                };
                btn.innerHTML =
                    '<div style="display:flex;justify-content:space-between;gap:8px;width:100%;">' +
                    '<strong style="font-size:0.88rem;">' + escapeHtml(p.title || p.url) + '</strong>' +
                    '<span class="badge-pill tabular-nums">' + p.status + ' · ~' + p.estimatedTokens + ' Tok.</span>' +
                    '</div>' +
                    '<span style="font-size:0.75rem;color:var(--text-low);word-break:break-all;">' + escapeHtml(p.url) + '</span>';
                container.appendChild(btn);
            });
        }

        function setInspectorSubTab(subTab) {
            inspectorSubTab = subTab;
            renderInspectorDetail();
        }

        function renderInspectorDetail() {
            const headerEl = document.getElementById('inspector-detail-header');
            const boxEl = document.getElementById('inspector-detail-content');
            if (!currentRun || !currentRun.pages || !currentRun.pages[selectedPageIndex]) {
                headerEl.innerHTML = '';
                boxEl.classList.remove('is-reading');
                boxEl.textContent = 'Bitte links eine Seite auswählen.';
                return;
            }
            const page = currentRun.pages[selectedPageIndex];
            headerEl.innerHTML =
                '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">' +
                '<strong>' + escapeHtml(page.title) + '</strong>' +
                '<span class="badge-pill tabular-nums">Wörter: ' + page.wordCount + ' | Tokens: ~' + page.estimatedTokens + ' | ' + page.responseTimeMs + ' ms</span>' +
                (page.promptInjectionsRemoved > 0 ? '<span class="badge-pill badge-warn">🛡️ ' + page.promptInjectionsRemoved + ' Hidden/Injection entfernt</span>' : '') +
                '</div>';

            boxEl.classList.toggle('is-reading', inspectorSubTab === 'audit');
            if (inspectorSubTab === 'markdown') {
                boxEl.textContent = page.markdown || '(Kein Markdown-Inhalt)';
            } else if (inspectorSubTab === 'metadata') {
                boxEl.textContent = JSON.stringify({
                    url: page.url,
                    canonicalUrl: page.canonicalUrl,
                    language: page.language,
                    title: page.title,
                    description: page.description,
                    openGraph: page.openGraph,
                    jsonLd: page.jsonLd,
                    headings: page.headings,
                    customExtracted: page.customExtracted,
                    internalLinksCount: page.links.filter(l => l.isInternal).length,
                    externalLinksCount: page.links.filter(l => !l.isInternal).length,
                    imagesCount: page.images.length
                }, null, 2);
            } else if (inspectorSubTab === 'audit') {
                boxEl.textContent = formatAuditText(page);
            } else {
                boxEl.textContent = page.cleanedHtml || '';
            }
        }

        function copyCurrentMarkdown() {
            if (!currentRun || !currentRun.pages || !currentRun.pages[selectedPageIndex]) {
                showToast('Keine Seite zum Kopieren ausgewählt');
                return;
            }
            const page = currentRun.pages[selectedPageIndex];
            navigator.clipboard.writeText(page.markdown || '');
            showToast('Markdown (~' + page.estimatedTokens + ' Tokens) in die Zwischenablage kopiert!');
        }

        function formatAuditText(page) {
            const blocks = [];
            if (page.citationQuote) {
                blocks.push(
                    'Zitiersatz\\n' + page.citationQuote +
                    '\\n\\nWas das ist: Der erste Absatz unter der Hauptüberschrift. Eine Antwortmaschine kann diesen Satz als Beleg anführen.' +
                    '\\nVorschlag: Anbieter, Angebot und den konkreten Nutzen in ein bis zwei Sätzen nennen.'
                );
            }
            if (!page.auditIssues || page.auditIssues.length === 0) {
                blocks.push('Keine Befunde in den geprüften Qualitäts-, SEO-, Barrierefreiheits- und Zitierpunkten auf dieser Seite.');
            } else {
                page.auditIssues.forEach(function (issue) {
                    let block = '[' + String(issue.severity || '').toUpperCase() + ' — ' + issue.code + '] ' + issue.message;
                    if (issue.explanation) block += '\\nWas das ist: ' + issue.explanation;
                    if (issue.suggestion) block += '\\nVorschlag: ' + issue.suggestion;
                    blocks.push(block);
                });
            }
            return blocks.join('\\n\\n');
        }

        function renderCitationReport() {
            const list = document.getElementById('citation-crawlers');
            list.replaceChildren();
            const access = currentRun && currentRun.summary && currentRun.summary.aiCrawlerAccess
                ? currentRun.summary.aiCrawlerAccess
                : [];
            if (access.length === 0) {
                const empty = document.createElement('li');
                empty.textContent = 'Für diesen Lauf liegt keine Prüfung der KI-Crawler vor. Ein neuer Crawl schreibt sie in den Bericht.';
                list.appendChild(empty);
                return;
            }
            const statusLabel = { allowed: 'Nicht ausgesperrt', blocked: 'Ausgesperrt', unknown: 'Nicht geprüft' };
            access.forEach(function (item) {
                const li = document.createElement('li');
                li.className = 'citation-item';
                const title = document.createElement('h4');
                title.textContent = item.bot + ' — ' + (statusLabel[item.status] || item.status);
                const explanation = document.createElement('p');
                explanation.textContent = item.explanation;
                const suggestion = document.createElement('p');
                suggestion.className = 'field-hint';
                suggestion.textContent = 'Vorschlag: ' + item.suggestion;
                li.append(title, explanation, suggestion);
                list.appendChild(li);
            });
        }

        function renderReportView() {
            if (!currentRun) return;
            const s = currentRun.summary;
            document.getElementById('report-domain-subtitle').textContent =
                'Domain: ' + currentRun.domain + ' | Gestartet: ' + new Date(currentRun.startedAt).toLocaleString('de-DE');
            document.getElementById('rep-health').textContent = s.healthScore + ' / 100';
            document.getElementById('rep-pages').textContent = s.successfulPages + ' / ' + s.totalPages;
            document.getElementById('rep-tokens').textContent = s.totalWords + ' W. / ~' + s.totalEstimatedTokens + ' Tok.';
            document.getElementById('rep-time').textContent = s.averageResponseTimeMs + ' ms';
            document.getElementById('rep-seo').textContent = s.missingH1Count + ' / ' + s.missingTitleCount;
            document.getElementById('rep-alt').textContent = String(s.imagesWithoutAltCount);
            document.getElementById('rep-jsonld').textContent = String(s.jsonLdPagesCount);
            document.getElementById('rep-sec').textContent = s.promptInjectionsNeutralized + ' / ' + s.piiRedactedTotal;
            document.getElementById('rep-citation').textContent = s.citationFindingCount == null ? '–' : String(s.citationFindingCount);
            renderCitationReport();

            const tbody = document.getElementById('report-pages-tbody');
            tbody.innerHTML = '';
            currentRun.pages.forEach((p, idx) => {
                const tr = document.createElement('tr');
                const issueBadges = p.auditIssues.length === 0
                    ? '<span class="badge-pill">Keine Befunde</span>'
                    : p.auditIssues.map(i => '<span class="badge-pill badge-warn" style="margin-right:4px;">' + escapeHtml(i.code) + '</span>').join('');
                tr.innerHTML =
                    '<td style="word-break:break-all;"><button type="button" class="link-btn" onclick="selectedPageIndex=' + idx + ';switchTab(\\'inspector\\');renderInspectorPageList();renderInspectorDetail();">' + escapeHtml(p.url) + '</button></td>' +
                    '<td>' + escapeHtml(p.title) + '</td>' +
                    '<td class="tabular-nums">' + p.status + '</td>' +
                    '<td class="tabular-nums">~' + p.estimatedTokens + '</td>' +
                    '<td class="tabular-nums">' + p.responseTimeMs + '</td>' +
                    '<td>' + issueBadges + '</td>';
                tbody.appendChild(tr);
            });
        }

        function exportBundle(format) {
            if (!currentRun) {
                showToast('Bitte zuerst einen Crawl-Lauf starten oder aus der Historie laden.');
                return;
            }
            window.open('/api/runs/' + encodeURIComponent(currentRun.id) + '/export?format=' + encodeURIComponent(format), '_blank', 'noopener,noreferrer');
        }

        async function checkLocalAiStatus() {
            const res = await fetch('/api/ai/status');
            if (!res.ok) return;
            const data = await res.json();

            const ollamaEl = document.getElementById('ai-status-ollama');
            if (data.discovered.ollamaAvailable) {
                ollamaEl.textContent = '✓ Online (' + (data.discovered.ollamaModels.join(', ') || 'Bereit') + ')';
                ollamaEl.style.color = 'var(--status-success-fg)';
            } else {
                ollamaEl.textContent = '○ Offline (Nutzt Fallback)';
                ollamaEl.style.color = 'var(--text-low)';
            }

            const lmsEl = document.getElementById('ai-status-lmstudio');
            if (data.discovered.lmStudioAvailable) {
                lmsEl.textContent = '✓ Online (' + (data.discovered.lmStudioModels.join(', ') || 'Bereit') + ')';
                lmsEl.style.color = 'var(--status-success-fg)';
            } else {
                lmsEl.textContent = '○ Offline (Nutzt Fallback)';
                lmsEl.style.color = 'var(--text-low)';
            }

            if (data.config) {
                const provider = data.config.provider || 'ollama';
                document.getElementById('ai-provider').value = provider;
                document.getElementById('ai-base-url').value = data.config.baseUrl || 'http://127.0.0.1:11434';
                document.getElementById('ai-zero-pii').checked = Boolean(data.config.zeroPii);
                if (data.config.model) preferredModel = data.config.model;
            }

            document.getElementById('mcp-config-snippet').textContent = JSON.stringify({
                mcpServers: {
                    "crawl-pulse": {
                        command: "node",
                        args: ["--no-warnings", data.mcpScriptPath, "mcp"]
                    }
                }
            }, null, 2);

            discoveredLocalModels = {
                ollama: data.discovered.ollamaModels || [],
                lmstudio: data.discovered.lmStudioModels || []
            };
            if (data.config && data.config.model) preferredModel = data.config.model;
            renderModelField();
        }

        function renderModelField() {
            const provider = document.getElementById('ai-provider').value;
            const select = document.getElementById('ai-model');
            const custom = document.getElementById('ai-model-custom');
            const startBtn = document.getElementById('btn-start-model');
            const hint = document.getElementById('ai-model-hint');
            const label = document.getElementById('ai-model-label');
            const local = provider === 'ollama' || provider === 'lmstudio';
            select.hidden = !local;
            custom.hidden = local || provider === 'heuristic';
            startBtn.hidden = provider === 'heuristic' || provider === 'openai-compatible';
            label.setAttribute('for', local ? 'ai-model' : 'ai-model-custom');
            if (provider === 'heuristic') {
                hint.textContent = 'Die Offline-Heuristik braucht kein Modell und keinen Start im Terminal.';
                return;
            }
            if (!local) {
                hint.textContent = 'Cloud-Modelle werden als Name eingetragen. Der Schlüssel bleibt lokal.';
                if (!custom.value && preferredModel) custom.value = preferredModel;
                return;
            }
            const models = provider === 'ollama' ? discoveredLocalModels.ollama : discoveredLocalModels.lmstudio;
            const previous = select.value || preferredModel;
            select.innerHTML = '';
            if (models.length === 0) {
                select.add(new Option('Keine lokalen Modelle gefunden', ''));
                select.disabled = true;
                select.value = '';
                hint.textContent = 'Die Laufzeit ist aus oder hat kein Modell gemeldet. „Modell starten“ öffnet sie, ohne Terminal.';
                return;
            }
            select.disabled = false;
            for (const name of models) {
                select.add(new Option(name, name));
            }
            select.value = models.includes(previous) ? previous : models[0];
            preferredModel = select.value;
            hint.textContent = 'Wählen Sie ein gemeldetes Modell und starten Sie es mit dem Button.';
        }

        function onAiProviderChanged() {
            const provider = document.getElementById('ai-provider').value;
            const base = document.getElementById('ai-base-url');
            if (provider === 'ollama') base.value = 'http://127.0.0.1:11434';
            if (provider === 'lmstudio') base.value = 'http://127.0.0.1:1234';
            renderModelField();
        }

        function currentModelName() {
            const provider = document.getElementById('ai-provider').value;
            if (provider === 'openai-compatible') {
                return document.getElementById('ai-model-custom').value.trim();
            }
            if (provider === 'heuristic') return '';
            return document.getElementById('ai-model').value.trim();
        }

        async function startSelectedModel() {
            const provider = document.getElementById('ai-provider').value;
            const selected = currentModelName();
            const model = selected || preferredModel;
            const button = document.getElementById('btn-start-model');
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            const startingLabel = model ? 'Modell wird gestartet. Das kann einen Moment dauern.' : 'Lokale Laufzeit wird gestartet.';
            announce(startingLabel);
            showToast(startingLabel);
            try {
                const res = await fetch('/api/ai/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider, model })
                });
                const data = await res.json();
                if (!res.ok) {
                    showToast(data.error || 'Start abgelehnt');
                    await checkLocalAiStatus();
                    return;
                }
                if (data.modelLoaded) {
                    preferredModel = data.model;
                    showToast('Modell gestartet: ' + data.model);
                } else if ((data.models || []).length === 0) {
                    showToast('Laufzeit gestartet. Es ist noch kein Modell installiert.');
                } else {
                    preferredModel = data.models[0];
                    showToast('Laufzeit gestartet. Bitte ein Modell wählen und erneut starten.');
                }
                await checkLocalAiStatus();
            } catch {
                showToast('Die lokale Laufzeit ist nicht erreichbar.');
            } finally {
                button.disabled = false;
                button.removeAttribute('aria-busy');
            }
        }

        async function saveAiSettings(e) {
            e.preventDefault();
            const payload = {
                provider: document.getElementById('ai-provider').value,
                baseUrl: document.getElementById('ai-base-url').value.trim(),
                model: currentModelName(),
                apiKey: document.getElementById('ai-api-key').value.trim(),
                zeroPii: document.getElementById('ai-zero-pii').checked
            };
            await fetch('/api/ai/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (payload.provider === 'openai-compatible' && !payload.zeroPii) {
                showToast('Gespeichert. Zero-PII ist aus: Personenbezug kann an den Cloud-Anbieter gehen.');
            } else {
                showToast('KI-Konfiguration lokal gespeichert');
            }
        }

        async function runAiAnalysis() {
            if (!currentRun) {
                showToast('Bitte zuerst einen Crawl-Lauf starten oder aus der Historie auswählen.');
                return;
            }
            const mode = document.getElementById('ai-mode').value;
            const prompt = document.getElementById('ai-prompt').value.trim();
            const box = document.getElementById('ai-output-box');
            const disclosure = document.getElementById('ai-disclosure');
            const sources = document.getElementById('ai-sources');
            const button = document.getElementById('btn-run-ai');
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            box.textContent = 'Analysiere gecrawlten Website-Kontext...';
            disclosure.textContent = 'Analyse läuft. Das Ergebnis ist ein Entwurf zur Prüfung.';
            sources.replaceChildren();
            sources.hidden = true;
            box.scrollIntoView({ block: 'nearest' });

            try {
                const res = await fetch('/api/ai/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ runId: currentRun.id, mode, prompt })
                });
                const data = await res.json();
                if (!res.ok) {
                    box.textContent = 'Fehler: ' + (data.error || 'Analyse fehlgeschlagen');
                    disclosure.textContent = 'Die Analyse ist fehlgeschlagen. Es liegt kein maschinell erzeugter Text vor.';
                    return;
                }
                const piiNote = data.zeroPiiApplied
                    ? ' Zero-PII aktiv (' + data.piiRedactedCount + ' Schwärzungen).'
                    : ' Zero-PII war aus: Inhalte können an den gewählten Anbieter gegangen sein.';
                disclosure.textContent = 'Maschinell erzeugt mit ' + data.providerUsed + ' / ' + data.modelUsed + '. Entwurf zur Prüfung, keine automatische Entscheidung.' + piiNote;
                const usedSources = data.sourcesUsed || [];
                for (const url of usedSources) {
                    const item = document.createElement('li');
                    const link = document.createElement('a');
                    link.href = url;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = url;
                    const hint = document.createElement('span');
                    hint.className = 'visually-hidden';
                    hint.textContent = ' (öffnet in einem neuen Fenster)';
                    item.append(link, hint);
                    sources.appendChild(item);
                }
                sources.hidden = usedSources.length === 0;
                let resultText = data.output || '';
                if (data.mode !== 'schema' && data.structuredData !== undefined && data.structuredData !== null) {
                    resultText += '\\n\\nStrukturierte Daten:\\n' + JSON.stringify(data.structuredData, null, 2);
                }
                box.textContent = resultText;
                showToast('KI-Analyse abgeschlossen');
            } finally {
                button.disabled = false;
                button.removeAttribute('aria-busy');
            }
        }

        async function loadHistory() {
            const res = await fetch('/api/runs');
            if (!res.ok) return;
            savedRunsList = await res.json();
            document.getElementById('history-count').textContent = String(savedRunsList.length);

            const tbody = document.getElementById('history-tbody');
            const selectA = document.getElementById('diff-run-a');
            const selectB = document.getElementById('diff-run-b');
            tbody.innerHTML = '';
            selectA.innerHTML = '';
            selectB.innerHTML = '';

            if (savedRunsList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7">Noch keine gespeicherten Crawl-Läufe vorhanden. Starten Sie Ihren ersten Lauf im Tab „Cockpit“.</td></tr>';
                return;
            }

            savedRunsList.forEach((run, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML =
                    '<td class="tabular-nums">' + new Date(run.startedAt).toLocaleString('de-DE') + '</td>' +
                    '<td><strong>' + escapeHtml(run.domain) + '</strong><br><span style="font-size:0.75rem;color:var(--text-low);">' + escapeHtml(run.rootUrl) + '</span></td>' +
                    '<td>' + escapeHtml(run.mode) + '</td>' +
                    '<td class="tabular-nums">' + run.summary.successfulPages + ' / ' + run.summary.totalPages + '</td>' +
                    '<td class="tabular-nums">~' + run.summary.totalEstimatedTokens + '</td>' +
                    '<td class="tabular-nums"><span class="badge-pill">' + run.summary.healthScore + '/100</span></td>' +
                    '<td style="display:flex;gap:6px;flex-wrap:wrap;">' +
                    '<button type="button" class="btn" onclick="openSavedRun(\\'' + run.id + '\\')">📂 Öffnen</button>' +
                    '<button type="button" class="btn btn-danger" onclick="promptDeleteRun(\\'' + run.id + '\\', \\'' + escapeHtml(run.domain) + '\\')">🗑 Löschen</button>' +
                    '</td>';
                tbody.appendChild(tr);

                const optA = new Option(run.domain + ' (' + new Date(run.startedAt).toLocaleString('de-DE') + ')', run.id);
                const optB = new Option(run.domain + ' (' + new Date(run.startedAt).toLocaleString('de-DE') + ')', run.id);
                selectA.add(optA);
                selectB.add(optB);
                if (idx === 1) selectA.value = run.id;
                if (idx === 0) selectB.value = run.id;
            });

            if (!currentRun && savedRunsList[0]) {
                await loadRunById(savedRunsList[0].id);
            }
        }

        async function openSavedRun(runId) {
            await loadRunById(runId);
            switchTab('inspector');
            showToast('Crawl-Bericht geladen');
        }

        function promptDeleteRun(runId, domain) {
            pendingDeleteRunId = runId;
            document.getElementById('delete-dialog-desc').textContent =
                'Möchten Sie den gespeicherten Crawl-Lauf für „' + domain + '“ (' + runId.slice(0, 8) + ') unwiderruflich aus der lokalen SQLite-Datenbank löschen?';
            const dlg = document.getElementById('delete-dialog');
            dlg.showModal();
        }

        function closeDeleteDialog() {
            pendingDeleteRunId = null;
            document.getElementById('delete-dialog').close();
        }

        document.getElementById('confirm-delete-btn').onclick = async () => {
            if (!pendingDeleteRunId) return;
            await fetch('/api/runs/' + encodeURIComponent(pendingDeleteRunId), { method: 'DELETE' });
            closeDeleteDialog();
            await loadHistory();
            showToast('Crawl-Bericht gelöscht');
        };

        async function compareSelectedRuns() {
            const runA = document.getElementById('diff-run-a').value;
            const runB = document.getElementById('diff-run-b').value;
            if (!runA || !runB) return;
            const res = await fetch('/api/runs/compare?runA=' + encodeURIComponent(runA) + '&runB=' + encodeURIComponent(runB));
            const diff = await res.json();
            document.getElementById('diff-output-box').textContent = JSON.stringify(diff, null, 2);
        }

        (function init() {
            const savedTheme = localStorage.getItem('crawlpulse-theme');
            if (savedTheme === 'light' || savedTheme === 'dark') {
                document.documentElement.setAttribute('data-theme', savedTheme);
                applyThemeColor(savedTheme);
            }
            const tablist = document.querySelector('nav.nav-tabs');
            if (tablist) {
                tablist.addEventListener('keydown', (event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    const current = TABS.findIndex((t) => document.getElementById('tab-btn-' + t)?.getAttribute('aria-selected') === 'true');
                    let next = current < 0 ? 0 : current;
                    if (event.key === 'ArrowRight') next = (next + 1) % TABS.length;
                    if (event.key === 'ArrowLeft') next = (next - 1 + TABS.length) % TABS.length;
                    if (event.key === 'Home') next = 0;
                    if (event.key === 'End') next = TABS.length - 1;
                    event.preventDefault();
                    switchTab(TABS[next]);
                    document.getElementById('tab-btn-' + TABS[next])?.focus();
                });
            }
            window.addEventListener('popstate', () => {
                applyTab(new URLSearchParams(window.location.search).get('tab'));
            });
            const params = new URLSearchParams(window.location.search);
            const initialTab = params.get('tab');
            if (initialTab) switchTab(initialTab, 'replace');
            loadHistory();
            checkLocalAiStatus();
        })();
    </script>
</body>
</html>`;
}
