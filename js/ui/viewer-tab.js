/**
 * viewer-tab.js — ⑦ 3D VIEWER tab UI wiring
 * Connects the PCF parser → stitcher → 3D viewer pipeline.
 * Also supports toggling between 3D view and data table.
 *
 * Exports:
 *   initViewerTab()
 */

import { parsePcf } from '../viewer/pcf-parser.js';
import { Stitcher } from '../viewer/pcf-stitcher.js';
import { PcfViewer3D } from '../viewer/viewer-3d.js';
import { EditorCore } from '../editor/core/EditorCore.js';
import { renderTable } from '../viewer/table-log.js';
import { getState, setState, subscribe } from '../state.js';
import { ValidatorPanel } from '../editor/smart/ValidatorPanel.js';
import { useEditorStore } from '../editor/store.js';

// ── Axis direction config (editable at runtime via window.__PCF_AXIS_CONFIG__) ──
export const AXIS_CONFIG = window.__PCF_AXIS_CONFIG__ || {
    X_POS: 'East', X_NEG: 'West',
    Y_POS: 'North', Y_NEG: 'South',
    Z_POS: 'Up', Z_NEG: 'Down',
};
window.__PCF_AXIS_CONFIG__ = AXIS_CONFIG;  // expose for runtime editing

const LOG_PREFIX = '[ViewerTab]';

let _dom = {};
let _viewer3d = null;
let _editor = null;
let _validatorPanel = null;
let _processedData = { components: [], logs: [] };
let _viewMode = '3D'; // '3D' or 'TABLE'

export function initViewerTab() {
    _dom = {
        input: document.getElementById('viewer-pcf-input'),
        loadBtn: document.getElementById('btn-viewer-load'),
        loadPass1Btn: document.getElementById('btn-viewer-load-pass1'),
        rayModeBtn: document.getElementById('btn-viewer-ray-mode'),
        openBtn: document.getElementById('btn-viewer-open'),
        clearBtn: document.getElementById('btn-viewer-clear'),
        fileInput: document.getElementById('viewer-file-input'),
        generateBtn: document.getElementById('btn-viewer-generate'),
        fullscreenBtn: document.getElementById('btn-viewer-fullscreen'),
        supportRatioEl: document.getElementById('viewer-support-ratio'),
        canvasWrap: document.getElementById('viewer-canvas-wrap'),
        tableWrap: document.getElementById('viewer-table-wrap'),
        logEl: document.getElementById('viewer-log'),
        statusEl: document.getElementById('viewer-status'),
        btn3D: document.getElementById('btn-viewer-3d'),
        btnTable: document.getElementById('btn-viewer-table'),
        btnCentre: document.getElementById('btn-viewer-centre'),
        exportPcfBtn: document.getElementById('btn-export-pcf-from-table'),
    };

    const missing = Object.entries(_dom).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) {
        console.warn(`${LOG_PREFIX} Missing DOM elements: ${missing.join(', ')}`);
    }

    // Load PCF from state (generated output)
    _dom.loadBtn?.addEventListener('click', () => _loadFromState('pcfLines'));
    _dom.loadPass1Btn?.addEventListener('click', () => _loadFromState('pcfPass1Lines'));

    // ⚡ Ray button — plain load of non-pipe PCF (not a toggle; just fetches rayPcfLines)
    _dom.rayModeBtn?.addEventListener('click', () => _loadFromState('rayPcfLines'));

    // Enable ⚡ Ray button only when rayPcfLines has been generated
    subscribe('rayPcfLines', lines => {
        if (_dom.rayModeBtn) _dom.rayModeBtn.disabled = !lines?.length;
    });

    // Wire Support Ratio textbox natively to the React view store
    _dom.supportRatioEl?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0 && typeof window.__pcfSetSupportRatio === 'function') {
            window.__pcfSetSupportRatio(val);
        }
    });

    // Subscribe to Pass 1 availability
    subscribe('pcfPass1Lines', lines => {
        if (_dom.loadPass1Btn) {
            _dom.loadPass1Btn.disabled = !lines || lines.length === 0;
        }
    });

    // Subscribe to viewer3dComponents changes (e.g., from validator fixingAction updates)
    subscribe('viewer3dComponents', components => {
        // If we're currently in table view, refresh the table
        if (_viewMode === 'TABLE' && _dom.tableWrap && _dom.tableWrap.style.display !== 'none') {
            _renderTableView();
        }
    });

    // Listen for validator updates and refresh table
    window.addEventListener('pcf-validator-updated', () => {
        console.log('[ViewerTab] Validator update detected, refreshing table view...');
        if (_viewMode === 'TABLE') {
            _renderTableView();
        }
    });

    // Bridge normalizedRows to window so React info panel can look up CSV Seq No
    window.__PCF_NORMALIZED_ROWS__ = getState('normalizedRows') || [];
    subscribe('normalizedRows', rows => { window.__PCF_NORMALIZED_ROWS__ = rows || []; });

    // Open PCF file from disk
    _dom.openBtn?.addEventListener('click', () => _dom.fileInput?.click());
    _dom.fileInput?.addEventListener('change', _handleFileOpen);

    // Clear button — dispose scene + reset state
    _dom.clearBtn?.addEventListener('click', () => {
        if (_dom.input) _dom.input.value = '';
        _processedData = { components: [], logs: [] };
        setState('viewer3dComponents', []);
        if (_dom.tableWrap) _dom.tableWrap.innerHTML = '';
        if (_dom.logEl) _dom.logEl.innerHTML = '';
        if (_viewer3d) { _viewer3d.dispose(); _viewer3d = null; }
        _showStatus('Cleared.', 'ok');
    });

    // Fullscreen fix
    _dom.fullscreenBtn?.addEventListener('click', () => {
        const target = document.getElementById('react-root') || _dom.canvasWrap;
        if (!target) return;
        const req = target.requestFullscreen || target.webkitRequestFullscreen || target.mozRequestFullScreen;
        if (req) req.call(target);
    });

    // Centre button — fit camera on legacy viewer OR React viewer
    _dom.btnCentre?.addEventListener('click', () => {
        if (typeof window.__pcfCameraCenter === 'function') window.__pcfCameraCenter();
        if (_viewer3d?.fitCamera) _viewer3d.fitCamera();
    });
    document.addEventListener('fullscreenchange', () => {
        if (_viewer3d?.renderer) {
            const w = _dom.canvasWrap?.clientWidth || window.innerWidth;
            const h = _dom.canvasWrap?.clientHeight || window.innerHeight;
            _viewer3d.renderer.setSize(w, h);
        }
    });

    // Export as PCF from Data Table state
    _dom.exportPcfBtn?.addEventListener('click', _exportPcfFromTable);

    // Generate 3D — always re-parse current textarea content and render to 3D view
    _dom.generateBtn?.addEventListener('click', () => {
        // Set view mode to 3D so _runGenerate picks the 3D render path.
        // We update the DOM state manually here (rather than calling _switchView which
        // also calls _render3D internally) so the 3D render only happens once, inside _runGenerate.
        _viewMode = '3D';
        _dom.btn3D?.classList.add('active');
        _dom.btnTable?.classList.remove('active');
        const reactRoot = document.getElementById('react-root');
        if (reactRoot) reactRoot.style.display = 'block';
        if (_dom.tableWrap) _dom.tableWrap.style.display = 'none';
        _runGenerate();  // re-parses PCF text + calls _render3D() since _viewMode is now '3D'
    });

    // View mode toggle
    _dom.btn3D?.addEventListener('click', () => {
        // Always re-generate from current PCF text so graphics + CA values are fresh
        const hasText = !!_dom.input?.value?.trim();
        if (hasText) _runGenerate();
        _switchView('3D');
    });
    _dom.btnTable?.addEventListener('click', () => {
        // Always re-generate so Data Table CA values reflect current PCF text
        const hasText = !!_dom.input?.value?.trim();
        if (hasText) _runGenerate();
        _switchView('TABLE');
    });

    // Set default view
    // _switchView('3D'); // DO NOT init WebGL on boot automatically

    // Initialize Smart Validator Panel
    _initValidatorPanel();

    console.info(`${LOG_PREFIX} Viewer tab initialised.`);
}

/**
 * Initialize Smart Validator Panel
 */
function _initValidatorPanel() {
    // Create validator panel container if it doesn't exist
    const viewerSection = document.getElementById('panel-viewer');
    if (!viewerSection) return;

    let validatorContainer = document.getElementById('validator-panel-container');
    if (!validatorContainer) {
        validatorContainer = document.createElement('div');
        validatorContainer.id = 'validator-panel-container';
        validatorContainer.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 40%;
            background: #1a1a1a;
            border-top: 2px solid #444;
            display: none;
            z-index: 100;
        `;
        viewerSection.appendChild(validatorContainer);
    }

    // Create toggle button
    const btnRow = document.querySelector('#panel-viewer .flex.gap-0');
    if (btnRow) {
        let toggleBtn = document.getElementById('btn-toggle-validator');
        if (!toggleBtn) {
            toggleBtn = document.createElement('button');
            toggleBtn.id = 'btn-toggle-validator';
            toggleBtn.className = 'btn btn-sm viewer-toggle-btn';
            toggleBtn.textContent = '🔍 Validator';
            toggleBtn.title = 'Toggle Smart Validator Console';
            toggleBtn.style.marginLeft = '0.5rem';
            btnRow.appendChild(toggleBtn);

            toggleBtn.addEventListener('click', () => {
                const isVisible = validatorContainer.style.display !== 'none';
                validatorContainer.style.display = isVisible ? 'none' : 'block';
                toggleBtn.classList.toggle('active', !isVisible);
            });
        }
    }

    // Initialize ValidatorPanel
    _validatorPanel = new ValidatorPanel('validator-panel-container', useEditorStore);
    console.info(`${LOG_PREFIX} Smart Validator initialized.`);
}

/** Load PCF text from state (output of Generate PCF) */
function _loadFromState(key) {
    const lines = getState(key);

    // Clear input first
    if (_dom.input) _dom.input.value = '';

    if (!lines?.length) {
        const msg = key === 'pcfPass1Lines'
            ? 'No Pass 1 data available (single-pass mode).'
            : 'No PCF generated yet. Generate in the OUTPUT tab first.';
        _showStatus(msg, 'warn');
        return;
    }
    if (_dom.input) {
        _dom.input.value = lines.join('\n');
    }
    _showStatus(`Loaded ${lines.length} lines (${key === 'pcfPass1Lines' ? 'Pass 1' : 'Final'}).`, 'ok');

    // Auto-run generate + refresh current view so CA and 3D graphics update immediately
    _runGenerate();
    // Small delay to let generate complete before switching view
    setTimeout(() => {
        if (_viewMode === '3D') _render3D();
    }, 100);
}


/** Open a .pcf/.txt file from disk and load into textarea */
async function _handleFileOpen(e) {
    const file = e.target?.files?.[0];
    if (!file) return;
    try {
        const text = await file.text();
        if (_dom.input) _dom.input.value = text;
        _showStatus(`Loaded file: ${file.name} (${text.split('\n').length} lines)`, 'ok');
    } catch (err) {
        _showStatus(`Error reading file: ${err.message}`, 'error');
    }
    // Reset so same file can be re-selected
    if (_dom.fileInput) _dom.fileInput.value = '';
}

/** Main generate pipeline */
function _runGenerate() {
    const rawText = _dom.input?.value?.trim() || '';
    if (!rawText) {
        _showStatus('Paste PCF content or Load from output first.', 'warn');
        return;
    }

    try {
        // 1. Parse
        const rawComponents = parsePcf(rawText);
        if (rawComponents.length === 0) {
            _showStatus('No components found in PCF text.', 'warn');
            return;
        }

        // 2. Stitch (Legacy gap detection - no longer mutates coordinates)
        const stitcher = new Stitcher(6.0); // Hardcode legacy 6mm tolerance purely for logging warning strings
        _processedData = stitcher.process(rawComponents);

        // 3. Render logs
        _renderLogs(_processedData.logs);

        // 4. Render current view
        if (_viewMode === '3D') {
            _render3D();
        } else {
            _renderTableView();
        }

        // Export to input text area immediately after stitching so that "PCF Input"
        // text area remains in sync with the tolerance snap adjustments
        setState('viewer3dComponents', _processedData.components);
        if (_dom.input) {
            _exportPcfToTextarea();
        }

        _showStatus(`✓ ${_processedData.components.length} components rendered.`, 'ok');
        console.info(`${LOG_PREFIX} Generate complete. ${_processedData.components.length} components.`);

        // Debug: Check centrePoint/branch1Point on first TEE or BEND
        const debugComp = _processedData.components.find(c => {
            const t = (c.type || '').toUpperCase();
            return t === 'TEE' || t === 'ELBOW' || t === 'BEND';
        });
        if (debugComp) {
            console.log('[DEBUG-CP] First TEE/BEND component:', {
                type: debugComp.type,
                centrePoint: debugComp.centrePoint,
                branch1Point: debugComp.branch1Point,
                points: debugComp.points
            });
        }

        // C10: Write to unified state — Data Table reads from here.
        // Preserve fixingAction values from validator across re-generate cycles.
        // ID-based matching fails because parsePcf() generates NEW _uid() values each call.
        // Component ORDER is deterministic (same PCF text → same sequence), so match by index.
        const prevComps = getState('viewer3dComponents') || [];
        const prevFixActions = prevComps.map(c => c.fixingAction || '');
        const hasAnyFixAction = prevFixActions.some(Boolean);
        const mergedComps = hasAnyFixAction
            ? _processedData.components.map((c, idx) => {
                const prevAction = prevFixActions[idx] || '';
                return prevAction ? { ...c, fixingAction: prevAction } : c;
            })
            : _processedData.components;
        console.log(`[ViewerTab] setState viewer3dComponents — fixActions preserved: ${prevFixActions.filter(Boolean).length}`);
        setState('viewer3dComponents', mergedComps);
        // Show Export as PCF button once data is available
        if (_dom.exportPcfBtn) _dom.exportPcfBtn.style.display = '';
    } catch (err) {
        console.error(`${LOG_PREFIX} Generate error:`, err);
        _showStatus(`Error: ${err.message}`, 'error');
    }
}

/** Export PCF from current Data Table (viewer3dComponents) state */
function _exportPcfFromTable() {
    const components = getState('viewer3dComponents') || _processedData.components;
    if (!components || components.length === 0) {
        _showStatus('No data to export. Generate first.', 'warn');
        return;
    }
    // Rebuild PCF text from parsed components (reconstruct from component data)
    const lines = [];
    for (const comp of components) {
        if ((comp.type || '').toUpperCase() === 'MESSAGE-SQUARE') {
            lines.push('MESSAGE-SQUARE');
            for (const [, v] of Object.entries(comp.attributes || {})) {
                lines.push(`    ${v}`);
            }
            continue;
        }
        lines.push(comp.type || 'UNKNOWN');
        for (const pt of (comp.points || [])) {
            lines.push(`    END-POINT  ${pt.x.toFixed(4)} ${pt.y.toFixed(4)} ${pt.z.toFixed(4)} ${(pt.bore || 0).toFixed(4)}`);
        }
        if (comp.centrePoint) {
            const cp = comp.centrePoint;
            lines.push(`    CENTRE-POINT  ${cp.x.toFixed(4)} ${cp.y.toFixed(4)} ${cp.z.toFixed(4)} ${(cp.bore || 0).toFixed(4)}`);
        }
        if (comp.branch1Point) {
            const bp = comp.branch1Point;
            lines.push(`    BRANCH1-POINT  ${bp.x.toFixed(4)} ${bp.y.toFixed(4)} ${bp.z.toFixed(4)} ${(bp.bore || 0).toFixed(4)}`);
        }
        for (const [k, v] of Object.entries(comp.attributes || {})) {
            lines.push(`    ${k} ${v}`);
        }
        lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'export-from-table.pcf';
    a.click();
    _showStatus('PCF exported from Data Table.', 'ok');
}

/** Update text area from current Data Table (viewer3dComponents) state */
function _exportPcfToTextarea() {
    const components = getState('viewer3dComponents') || _processedData.components;
    if (!components || components.length === 0) return;

    const lines = [];
    for (const comp of components) {
        if ((comp.type || '').toUpperCase() === 'MESSAGE-SQUARE') {
            lines.push('MESSAGE-SQUARE');
            for (const [, v] of Object.entries(comp.attributes || {})) {
                lines.push(`    ${v}`);
            }
            continue;
        }
        lines.push(comp.type || 'UNKNOWN');
        for (const pt of (comp.points || [])) {
            lines.push(`    END-POINT  ${pt.x.toFixed(4)} ${pt.y.toFixed(4)} ${pt.z.toFixed(4)} ${(pt.bore || 0).toFixed(4)}`);
        }
        if (comp.centrePoint) {
            const cp = comp.centrePoint;
            lines.push(`    CENTRE-POINT  ${cp.x.toFixed(4)} ${cp.y.toFixed(4)} ${cp.z.toFixed(4)} ${(cp.bore || 0).toFixed(4)}`);
        }
        if (comp.branch1Point) {
            const bp = comp.branch1Point;
            lines.push(`    BRANCH1-POINT  ${bp.x.toFixed(4)} ${bp.y.toFixed(4)} ${bp.z.toFixed(4)} ${(bp.bore || 0).toFixed(4)}`);
        }
        for (const [k, v] of Object.entries(comp.attributes || {})) {
            lines.push(`    ${k} ${v}`);
        }
        lines.push('');
    }

    if (_dom.input) {
        _dom.input.value = lines.join('\n');
    }
}

/** Switch between 3D and TABLE views */
function _switchView(mode) {
    _viewMode = mode;

    // Toggle active buttons
    _dom.btn3D?.classList.toggle('active', mode === '3D');
    _dom.btnTable?.classList.toggle('active', mode === 'TABLE');

    // Toggle containers
    const reactRoot = document.getElementById('react-root');

    if (mode === '3D') {
        // Show React Root, Hide Table
        if (reactRoot) reactRoot.style.display = 'block';
        if (_dom.tableWrap) _dom.tableWrap.style.display = 'none';
        if (_dom.canvasWrap) _dom.canvasWrap.style.display = 'none'; // Ensure legacy is hidden
        _render3D();
    } else {
        // Show Table, Hide React/3D
        if (reactRoot) reactRoot.style.display = 'none';
        if (_dom.canvasWrap) _dom.canvasWrap.style.display = 'none';
        if (_dom.tableWrap) _dom.tableWrap.style.display = 'block';
        _renderTableView();
    }
}

/** Render 3D view */
async function _render3D() {
    // Task 10: Switch to React Viewer
    const reactRoot = document.getElementById('react-root');

    if (reactRoot) {
        // Hide Legacy Canvas explicitly
        if (_dom.canvasWrap) _dom.canvasWrap.style.display = 'none';
        reactRoot.style.display = 'block';

        // Dynamically import React App (lazy load)
        try {
            let mountReactApp;
            try {
                ({ mountReactApp } = await import('../editor/App.jsx'));
            } catch (jsxError) {
                console.warn('[ViewerTab] Vite import failed, retrying browser bundle', jsxError);
                const bundleUrl = new URL('../editor/App.bundle.js', import.meta.url).href;
                ({ mountReactApp } = await import(/* @vite-ignore */ bundleUrl));
            }

            const { registerUpdateCallback } = await import('../editor/store.js');

            // Register callback to update Vanilla State when React changes
            registerUpdateCallback((updatedComponents) => {
                _processedData.components = updatedComponents;
                // Ideally, trigger re-stitch or update PCF output here
                console.log(`${LOG_PREFIX} React Editor updated ${updatedComponents.length} components.`);
            });

            // Ensure components array is valid and safe for React
            // Filter out purely null coordinates or NaN
            const safeComponents = (_processedData.components || []).map(c => {
                const safeC = {
                    ...c,
                    id: c.uuid || c.id || `comp-${Math.random()}`,
                    userData: c.userData || {}
                };

                // Sanitize Points for display: Convert strings to floats if needed
                // Legacy parser might leave them as strings
                if (safeC.userData.points) {
                    for (const key in safeC.userData.points) {
                        const pt = safeC.userData.points[key];
                        if (pt) {
                            if (typeof pt.x === 'string') pt.x = parseFloat(pt.x) || 0;
                            if (typeof pt.y === 'string') pt.y = parseFloat(pt.y) || 0;
                            if (typeof pt.z === 'string') pt.z = parseFloat(pt.z) || 0;
                        }
                    }
                }

                // Ensure root points array is also valid numbers
                if (safeC.points && Array.isArray(safeC.points)) {
                    safeC.points.forEach(pt => {
                        if (typeof pt.x === 'string') pt.x = parseFloat(pt.x) || 0;
                        if (typeof pt.y === 'string') pt.y = parseFloat(pt.y) || 0;
                        if (typeof pt.z === 'string') pt.z = parseFloat(pt.z) || 0;
                    });
                }

                return safeC;
            });

            // Update state so other parts of UI (like datatable) have latest patched points
            setState('viewer3dComponents', safeComponents);

            // Export to text area automatically to reflect stitched points
            if (_dom.input) {
                _exportPcfToTextarea();
            }

            mountReactApp('react-root', { components: safeComponents });
            console.info(`${LOG_PREFIX} React Editor Mounted with ${safeComponents.length} components.`);
            return; // Stop here, do not load legacy
        } catch (e) {
            console.error(`${LOG_PREFIX} Failed to mount React App:`, e);
            // Fallback to Legacy below
        }
    }

    // Lazy-init viewer (Legacy Fallback)
    if (_dom.canvasWrap) _dom.canvasWrap.style.display = 'block'; // Show legacy container
    if (!_viewer3d && _dom.canvasWrap) {
        _viewer3d = new PcfViewer3D(_dom.canvasWrap);
        // Initialize 3D Editor Overlay
        try {
            _editor = new EditorCore(_viewer3d);
            console.info(`${LOG_PREFIX} 3D Editor Module loaded.`);
        } catch (e) {
            console.error(`${LOG_PREFIX} Failed to load Editor Module:`, e);
        }
    }
    _viewer3d.render(_processedData.components);
}

/** Render table view */
function _renderTableView() {
    if (!_dom.tableWrap) return;

    // Use viewer3dComponents state if available (updated by validator), otherwise use _processedData
    const components = getState('viewer3dComponents') || _processedData.components;

    if (components.length === 0 && !_dom.input?.value?.trim()) {
        _dom.tableWrap.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted)">Paste or load a PCF file, then click <strong>▶ Generate</strong>.</div>';
        return;
    }
    renderTable(_dom.tableWrap, components);
}

/** Render log entries */
function _renderLogs(logs) {
    if (!_dom.logEl) return;
    if (!logs || logs.length === 0) {
        _dom.logEl.innerHTML = '<span style="color:var(--text-muted)">No log entries.</span>';
        return;
    }
    _dom.logEl.innerHTML = logs.map(log => {
        const color = log.type === 'WARN' ? 'var(--yellow-warn)' :
            log.type === 'SUCCESS' ? 'var(--green-ok)' :
                'var(--text-secondary)';
        return `<div style="margin-bottom:3px;color:${color}">
      <span style="color:var(--text-muted)">[${log.timestamp}]</span> ${_escHtml(log.message)}
    </div>`;
    }).join('');
}

/** Status bar within the viewer */
function _showStatus(msg, type) {
    if (!_dom.statusEl) return;
    const colors = { ok: 'var(--green-ok)', error: 'var(--red-err)', warn: 'var(--yellow-warn)' };
    _dom.statusEl.textContent = msg;
    _dom.statusEl.style.color = colors[type] || 'var(--text-muted)';
}

/** Escape HTML */
function _escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}
