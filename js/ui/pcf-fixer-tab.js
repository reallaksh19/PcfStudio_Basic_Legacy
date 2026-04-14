/**
 * pcf-fixer-tab.js
 * Controller for the "PCF FIXER" tab.
 * Loads the PCF-Fixer React app (separate Vite dev server) inside an iframe.
 * PCF-Fixer's own StatusBar (position:fixed) is scoped to the iframe viewport —
 * it never bleeds into 200-6's host status bar.
 */

const LOG_PREFIX = '[PcfFixerTab]';
const STORAGE_KEY = 'pcf_fixer_url';
const DEFAULT_URL  = 'http://localhost:5173';

export function initPcfFixerTab() {
    const frame       = document.getElementById('pcf-fixer-frame');
    const urlInput    = document.getElementById('pcf-fixer-url');
    const loadBtn     = document.getElementById('btn-pcf-fixer-load');
    const placeholder = document.getElementById('pcf-fixer-placeholder');
    const reloadBtn   = document.getElementById('btn-pcf-fixer-reload');
    const fullBtn     = document.getElementById('btn-pcf-fixer-fullscreen');

    if (!frame) {
        console.warn(`${LOG_PREFIX} iframe #pcf-fixer-frame not found.`);
        return;
    }

    // Restore last used URL from localStorage
    const savedUrl = localStorage.getItem(STORAGE_KEY) || DEFAULT_URL;
    if (urlInput) urlInput.value = savedUrl;

    /** Load a URL into the iframe and hide the placeholder. */
    function loadUrl(url) {
        if (!url) return;
        url = url.trim();
        localStorage.setItem(STORAGE_KEY, url);
        frame.src = url;
        frame.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        console.info(`${LOG_PREFIX} Loading PCF Fixer from: ${url}`);
    }

    // ── Load button ────────────────────────────────────────────────
    loadBtn?.addEventListener('click', () => {
        loadUrl(urlInput?.value);
    });

    // Allow pressing Enter in the URL input
    urlInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadUrl(urlInput.value);
    });

    // ── Reload button ──────────────────────────────────────────────
    reloadBtn?.addEventListener('click', () => {
        if (frame.src && frame.src !== 'about:blank') {
            // Reassign same src forces a reload
            const current = frame.src;
            frame.src = '';
            requestAnimationFrame(() => { frame.src = current; });
            console.info(`${LOG_PREFIX} Reloading iframe.`);
        }
    });

    // ── Full Window button ─────────────────────────────────────────
    fullBtn?.addEventListener('click', () => {
        const url = frame.src && frame.src !== 'about:blank'
            ? frame.src
            : urlInput?.value?.trim() || DEFAULT_URL;
        window.open(url, '_blank', 'noopener');
    });

    console.info(`${LOG_PREFIX} Initialised. Default URL: ${savedUrl}`);
}
