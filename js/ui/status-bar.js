import { getConfig } from "../config/config-store.js";
import { subscribe } from "../state.js";

/**
 * status-bar.js
 * Renders the global pipeline status bar.
 * Shows: Processing Mode (Strict/Repair/Multi), Tolerance used, and Active Rules (short form).
 * Injects into the existing footer (#status-bar).
 */

const LOG_PREFIX = "[StatusBar]";
const STATS_CONTAINER_ID = "pipeline-stats-container";
const STATUS_TEXT_ID = "status-text";
const STATUS_DOT_ID = "status-dot";
let _statusFlashTimer = null;
let _statusRestore = null;

// Version updated as per rule: ver.dd-mm-yy time xx.xx (Task 5 / Rule 8B)
export const APP_REVISION = "Ver 07-04-2026 (1)";


export function initStatusBar() {
    // 1. Locate the existing footer
    const footer = document.getElementById("status-bar");
    if (!footer) {
        console.warn(`${LOG_PREFIX} Footer #status-bar not found.`);
        return;
    }

    // Clear default text nodes to clean up "PCF Converter v1.0..."
    // Keep elements with IDs (status dots) but remove anonymous text nodes
    Array.from(footer.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.includes("PCF Converter")) {
            node.textContent = "";
        }
        // Also remove the specific div if it exists (the one with margin-left:auto)
        if (node.nodeType === Node.ELEMENT_NODE && node.textContent.includes("No data leaves your machine")) {
            node.style.display = "none";
        }
    });

    // 2. Check if we already injected our container
    let container = document.getElementById(STATS_CONTAINER_ID);
    if (!container) {
        container = document.createElement("div");
        container.id = STATS_CONTAINER_ID;
        // Styling: Flex to hold items, push to right
        container.style.cssText = "display:flex; gap:0; align-items:center; margin-left: auto; height: 100%;";
        footer.appendChild(container);
    }

    // Subscribe to config changes to update the bar
    subscribe("config", () => renderStatusBar());

    // Initial render
    renderStatusBar();
    console.info(`${LOG_PREFIX} Initialised.`);
}

/**
 * Show a short-lived, non-intrusive status message in the legacy status area.
 * This intentionally auto-restores the previous status text after timeout.
 */
export function flashStatusNotice(message, type = "warn", ttlMs = 3200) {
    const textEl = document.getElementById(STATUS_TEXT_ID);
    const dotEl = document.getElementById(STATUS_DOT_ID);
    if (!textEl) return;

    if (!_statusRestore) {
        _statusRestore = {
            text: textEl.textContent || "Ready",
            dotClass: dotEl?.className || ""
        };
    }

    if (_statusFlashTimer) clearTimeout(_statusFlashTimer);

    textEl.textContent = message;
    if (dotEl) {
        dotEl.classList.remove("idle", "ok", "warn", "error");
        dotEl.classList.add(type === "error" ? "error" : type === "ok" ? "ok" : "warn");
    }

    _statusFlashTimer = setTimeout(() => {
        if (!_statusRestore) return;
        textEl.textContent = _statusRestore.text || "Ready";
        if (dotEl) dotEl.className = _statusRestore.dotClass || "status-dot idle";
        _statusRestore = null;
        _statusFlashTimer = null;
    }, Math.max(1200, Number(ttlMs) || 3200));
}

function renderStatusBar() {
    const container = document.getElementById(STATS_CONTAINER_ID);
    if (!container) return;

    const cfg = getConfig();
    const cs = cfg.coordinateSettings || {};
    const c3d = cs.common3DLogic || {};

    const mode = cs.pipelineMode || 'repair';
    const multi = cs.multiPass !== false;

    // Mode Label
    let modeLabel = "Unknown";
    let modeColor = "var(--text-muted)";
    let continuityTol = `±${cs.continuityTolerance ?? 0.5}mm`;
    let gapFillingTol = "N/A";

    // Styling helpers
    const groupStyle = `display:flex; align-items:center; height:100%; padding:0 1rem; border-left:1px solid var(--steel); gap:0.8rem;`;
    const labelStyle = (color) => `font-weight:700; color:${color}; white-space:nowrap; font-size:0.75rem;`;
    const valStyle = `color:var(--text-secondary); font-size:0.75rem;`;

    const chainMode = cs.chainBasedOrder !== false ? "Chain ON" : "Graph DFS";

    if (mode === 'strict' || mode === 'sequential') {
        modeLabel = `SEQUENTIAL (${chainMode})`;
        modeColor = "var(--amber)";
    } else if (mode === 'repair' || mode === 'fuzzy') {
        const baseTol = cs.continuityTolerance || 0.5;
        if (multi) {
            modeLabel = "FUZZY (MULTI)"; // Chain mode doesn't matter for multi
            modeColor = "var(--green-ok)";
            gapFillingTol = `±${(baseTol * 5).toFixed(1)}mm`;
        } else {
            modeLabel = `FUZZY (SINGLE) - ${chainMode}`;
            modeColor = "var(--blue-focus)";
            gapFillingTol = `±${baseTol.toFixed(1)}mm`;
        }
    }

    // Active Rules (Short Form)
    const geomRules = [];
    const overlapRules = [];
    if (c3d.enabled) {
        if (c3d.maxPipeRun) geomRules.push(`Run<${(c3d.maxPipeRun / 1000).toFixed(0)}m`);
        if (c3d.skew3PlaneLimit) geomRules.push(`Skew<${(c3d.skew3PlaneLimit / 1000).toFixed(1)}m`);
        if (c3d.maxOverlap) overlapRules.push(`<${c3d.maxOverlap}mm`);
    } else {
        geomRules.push("OFF");
        overlapRules.push("OFF");
    }

    const geomStr = geomRules.length > 0 ? geomRules.join(" • ") : "None";
    const overStr = overlapRules.length > 0 ? overlapRules.join(" • ") : "None";

    container.innerHTML = `
    <div style="${groupStyle}">
        <span style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Mode</span>
        <div style="${labelStyle(modeColor)}">${modeLabel}</div>
    </div>
    <div style="${groupStyle}">
        <span style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Continuity</span>
        <div style="${valStyle}">${continuityTol}</div>
    </div>
    <div style="${groupStyle}">
        <span style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Gap Filling</span>
        <div style="${valStyle}">${gapFillingTol}</div>
    </div>
    <div style="${groupStyle}" title="${geomStr}">
       <span style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Geometry</span>
       <div style="${valStyle}">${geomStr}</div>
    </div>
    <div style="${groupStyle}" title="${overStr}">
       <span style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Overlap</span>
       <div style="${valStyle}">${overStr}</div>
    </div>
    <div style="display:flex; align-items:center; height:100%; padding:0 1rem; border-left:1px solid var(--steel);">
       <div id="status-ver-val" style="font-family:var(--font-code); color:var(--text-muted); font-size:0.7rem;">${APP_REVISION}</div>
    </div>
  `;
}
