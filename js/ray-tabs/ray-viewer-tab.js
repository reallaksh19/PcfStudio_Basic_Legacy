/**
 * ray-viewer-tab.js — 3D Viewer tab for ray.html
 * PCF input via textbox → parsePcf → Stitcher → React 3D canvas.
 * Reuses the same DOM IDs as viewer-tab.js so viewer-3d.js / App.jsx work unchanged.
 */

import { parsePcf }   from '../viewer/pcf-parser.js';
import { Stitcher }   from '../viewer/pcf-stitcher.js';
import { setState }   from '../state.js';

const LOG_PREFIX = '[RayViewer]';

let _dom        = {};
let _viewMode   = '3D';
let _processed  = { components: [], logs: [] };

export function initRayViewerTab() {
  _dom = {
    input:        document.getElementById('viewer-pcf-input'),
    generateBtn:  document.getElementById('btn-viewer-generate'),
    openBtn:      document.getElementById('btn-viewer-open'),
    fileInput:    document.getElementById('viewer-file-input'),
    clearBtn:     document.getElementById('btn-viewer-clear'),
    fullscreenBtn:document.getElementById('btn-viewer-fullscreen'),
    centreBtn:    document.getElementById('btn-viewer-centre'),
    canvasWrap:   document.getElementById('viewer-canvas-wrap'),
    tableWrap:    document.getElementById('viewer-table-wrap'),
    logEl:        document.getElementById('viewer-log'),
    statusEl:     document.getElementById('viewer-status'),
    btn3D:        document.getElementById('btn-viewer-3d'),
    btnTable:     document.getElementById('btn-viewer-table'),
    axXpos:       document.getElementById('ax-xpos'),
    axYpos:       document.getElementById('ax-ypos'),
    axZpos:       document.getElementById('ax-zpos'),
  };

  // Wire axis selectors
  [_dom.axXpos, _dom.axYpos, _dom.axZpos].forEach(sel =>
    sel?.addEventListener('change', _applyAxisConfig));

  _dom.generateBtn?.addEventListener('click', _runGenerate);
  _dom.clearBtn?.addEventListener('click', _handleClear);
  _dom.openBtn?.addEventListener('click', () => _dom.fileInput?.click());
  _dom.fileInput?.addEventListener('change', _handleFileOpen);
  _dom.fullscreenBtn?.addEventListener('click', _handleFullscreen);
  _dom.centreBtn?.addEventListener('click', () => {
    if (typeof window.__pcfCameraCenter === 'function') window.__pcfCameraCenter();
  });
  _dom.btn3D?.addEventListener('click', () => _switchView('3D'));
  _dom.btnTable?.addEventListener('click', () => _switchView('TABLE'));

  console.info(`${LOG_PREFIX} Viewer tab initialised.`);
}

function _applyAxisConfig() {
  if (!window.__PCF_AXIS_CONFIG__) window.__PCF_AXIS_CONFIG__ = {};
  const cfg = window.__PCF_AXIS_CONFIG__;
  const xp = _dom.axXpos?.value || 'East';
  const yp = _dom.axYpos?.value || 'North';
  const zp = _dom.axZpos?.value || 'Up';
  const opposites = { East:'West', West:'East', North:'South', South:'North', Up:'Down', Down:'Up' };
  cfg.X_POS = xp; cfg.X_NEG = opposites[xp];
  cfg.Y_POS = yp; cfg.Y_NEG = opposites[yp];
  cfg.Z_POS = zp; cfg.Z_NEG = opposites[zp];
}

async function _runGenerate() {
  const rawText = _dom.input?.value?.trim() || '';
  if (!rawText) { _status('Paste PCF content first.', 'warn'); return; }
  try {
    const raw = parsePcf(rawText);
    if (!raw.length) { _status('No components found.', 'warn'); return; }
    const stitcher = new Stitcher(6.0);
    _processed = stitcher.process(raw);
    _log(_processed.logs);
    setState('viewer3dComponents', _processed.components);
    _status(`✓ ${_processed.components.length} components.`, 'ok');
    // Mount React 3D app then reveal the canvas
    let mountReactApp;
    try {
      ({ mountReactApp } = await import('../editor/App.jsx'));
    } catch (jsxError) {
      console.warn(`${LOG_PREFIX} App.jsx import failed, retrying bundle`, jsxError);
      const bundleUrl = new URL('../editor/App.bundle.js', import.meta.url).href;
      ({ mountReactApp } = await import(/* @vite-ignore */ bundleUrl));
    }
    mountReactApp('react-root', { components: _processed.components });
    const reactRoot = document.getElementById('react-root');
    if (reactRoot) reactRoot.style.display = 'block';
    _switchView('3D');
  } catch (err) {
    console.error(`${LOG_PREFIX} Error:`, err);
    _status(`Error: ${err.message}`, 'error');
  }
}

async function _handleFileOpen(e) {
  const file = e.target?.files?.[0];
  if (!file) return;
  const text = await file.text();
  if (_dom.input) _dom.input.value = text;
  _status(`Loaded: ${file.name}`, 'ok');
  if (_dom.fileInput) _dom.fileInput.value = '';
}

function _handleClear() {
  if (_dom.input) _dom.input.value = '';
  if (_dom.logEl) _dom.logEl.innerHTML = '';
  if (_dom.tableWrap) _dom.tableWrap.innerHTML = '';
  setState('viewer3dComponents', []);
  _processed = { components: [], logs: [] };
  _status('Cleared.', 'ok');
}

function _handleFullscreen() {
  const target = document.getElementById('react-root') || _dom.canvasWrap;
  if (!target) return;
  const req = target.requestFullscreen || target.webkitRequestFullscreen || target.mozRequestFullScreen;
  if (req) req.call(target);
}

function _switchView(mode) {
  _viewMode = mode;
  _dom.btn3D?.classList.toggle('active', mode === '3D');
  _dom.btnTable?.classList.toggle('active', mode === 'TABLE');
  // react-root is inside viewer-canvas-wrap; only show it after a generate has run
  const reactRoot = document.getElementById('react-root');
  if (reactRoot && _processed.components.length > 0) {
    reactRoot.style.display = mode === '3D' ? 'block' : 'none';
  }
  if (_dom.tableWrap) _dom.tableWrap.style.display = mode === 'TABLE' ? 'block' : 'none';
}

function _log(logs = []) {
  if (!_dom.logEl) return;
  _dom.logEl.innerHTML = logs.slice(-50).map(l =>
    `<div style="color:${l.type === 'warn' ? 'var(--amber)' : 'var(--text-muted)'}">${l.message || l}</div>`
  ).join('');
}

function _status(msg, type = 'ok') {
  if (!_dom.statusEl) return;
  const colors = { ok: 'var(--green-ok)', warn: 'var(--amber)', error: '#ef4444' };
  _dom.statusEl.style.color = colors[type] || '';
  _dom.statusEl.textContent = msg;
}
