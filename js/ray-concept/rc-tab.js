/**
 * rc-tab.js — New Ray Concept Tab: Full UI orchestrator
 * Coordinates all 4 stages, RayConfig panel, pass log, stage output previews,
 * download buttons, and Debug sub-tab.
 * 100% independent — only imports from rc-* siblings and reads from DOM.
 */

import { getRayConfig, setRayConfig, resetRayConfig } from './rc-config.js';
import { runStage1, emit2DCSV } from './rc-stage1-parser.js';
import { runStage2 } from './rc-stage2-extractor.js';
import { runStage3 } from './rc-stage3-ray-engine.js';
import { runStage4 } from './rc-stage4-dispatcher.js';
import { debugLog, clearLog, getLog, renderDebugTab } from './rc-debug.js';
import { loadMastersInto, collectMaterialCodeRequests } from './rc-master-loader.js';
import { lookupPipelineRefs, formatDetailForLog } from './rc-pipeline-lookup.js';
import { getConfig }          from '../config/config-store.js';
import { linelistService }    from '../services/linelist-service.js';
import { dataManager }        from '../services/data-manager.js';
import { masterTableService } from '../services/master-table-service.js';
import { readExcelAsCSV, isExcelFile } from '../input/excel-parser.js';
import { showMaterialCodePopup } from '../ui/material-code-popup.js';
import { convertAvevaXmlToRawCsv } from './rc-xml-import.js';
import { compactDroppedInlineComponentsForIsoPcf } from './rc-inline-drop-compactor.js';

// ── Internal state (isolated to this tab) ────────────────────────────────────
const rcState = {
  rawCsvText:      null,
  rawFileName:     '',
  components:      [],   // Stage 1 output
  csv2DText:       '',   // Stage 1 CSV text
  fittingsPcfText: '',   // Stage 2 output
  connectionMatrix:[],   // Stage 3 output
  injectedPipes:   [],   // Stage 3 bridges
  pipelineRef:     '',   // derived from Stage 1
  isoMetricPcfText:'',   // Stage 4 output
  isoPcfCsvText:   '',   // ISOPCF CSV preview (gasket/misc dropped)
  isoPcfComponents:[],   // post-drop component list for ISOPCF CSV
  engineMode:      localStorage.getItem('pcfStudio.engineMode') || 'legacy',
  finalComponents: [],   // rcState.components + normalised bridge pipes (post-S3)
  finalCsv2DText:  '',   // emit2DCSV(finalComponents, cfg)
  stageStatus: { s1: 'idle', s2: 'idle', s3: 'idle', s4: 'idle' },
  mastersLog:      [],   // Masters / Pipeline button event log
  pcActiveTable:   []    // Pre-filtered PC master rows (bores matching current CSV)
};

// ── Bootstrap (called from app.js) ───────────────────────────────────────────
export function initRayConceptTab() {
  const root = document.getElementById('panel-new-ray');
  if (!root) return;
  root.innerHTML = buildPanelHTML();
  wireEvents(root);
  // Expose 2D CSV components for cross-module access (e.g. Smart Fixer "Refresh from 2D CSV")
  window.__getRc2DComponents = () => rcState.components ?? [];
}

// ── Panel HTML ────────────────────────────────────────────────────────────────
function buildPanelHTML() {
  // ── Inline SVG icons (Lucide-style, 14×14) ───────────────────────────────
  const ico = (d, w=14, h=14) =>
    `<svg width="${w}" height="${h}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;flex-shrink:0">${d}</svg>`;
  const ICO = {
    upload:   ico('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
    download: ico('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    mapPin:   ico('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
    database: ico('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>'),
    send:     ico('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'),
    settings: ico('<circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>'),
    play:     ico('<polygon points="5 3 19 12 5 21 5 3"/>'),
    plus:     ico('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  };

  // ── Button style helpers ─────────────────────────────────────────────────
  // Run All — amber, soft rounded, Inter
  const pillPrimary = `display:inline-flex;align-items:center;gap:5px;font-size:0.73rem;font-family:var(--font-inter);font-weight:600;padding:4px 11px;border-radius:6px;cursor:pointer;border:none;background:var(--amber);color:#000;box-shadow:0 1px 3px rgba(245,158,11,0.25);transition:all 150ms ease`;
  // Amber action buttons — soft rounded, Inter
  const actionPill = `display:inline-flex;align-items:center;gap:4px;font-size:0.70rem;font-family:var(--font-inter);font-weight:500;padding:3px 8px;border-radius:6px;cursor:pointer;border:none;background:var(--amber);color:#000;box-shadow:0 1px 2px rgba(0,0,0,0.12);transition:all 150ms ease`;
  // Ghost buttons — soft rounded, Inter
  const ghost = `display:inline-flex;align-items:center;gap:4px;font-size:0.72rem;font-family:var(--font-inter);font-weight:400;padding:3px 8px;border-radius:6px;cursor:pointer;border:1px solid var(--steel);background:transparent;color:var(--text-muted);transition:all 150ms ease`;

  return `
<div style="display:flex;flex-direction:column;height:100%;gap:0;padding:0;overflow:hidden">

  <!-- ── Tier 1: Pipeline Bar (brand + steps merged) ── -->
  <div class="rc-toolbar-tier rc-tier-stepper">
    <!-- Brand zone -->
    <div class="rc-tier-brand">
      <span class="rc-brand-mark">⚡ RAY</span>
      <input type="file" id="rc-file-input" accept=".csv,.txt,.xlsx,.xls,.xlsm" style="display:none">
      <input type="file" id="rc-xml-file-input" accept=".xml" style="display:none">
      <button id="rc-btn-upload" style="${actionPill}">${ICO.upload} CSV / XLSX</button>
      <button id="rc-btn-upload-xml" style="${actionPill}" title="Import AVEVA XML and map to Raw CSV">${ICO.upload} XML</button>
      <span id="rc-filename" class="rc-filename">No file loaded</span>
    </div>
    <span class="rc-brand-sep"></span>
    <!-- PARSE group -->
    <div class="rc-step-group">
      <span class="rc-step-group-label" style="color:rgba(96,165,250,0.6)">Parse</span>
      <div class="rc-step-group-btns">
        <button id="rc-btn-s1" class="rc-step-node" data-status="idle" disabled title="Parse CSV → 2D CSV"><span class="rc-step-badge">S1</span>Parse</button>
        <span class="rc-step-connector" id="rc-conn-s1-s2"></span>
        <button id="rc-btn-s2" class="rc-step-node" data-status="idle" disabled title="2D CSV → Fittings PCF"><span class="rc-step-badge">S2</span>Fittings</button>
      </div>
    </div>
    <span class="rc-group-divider"></span>
    <!-- RAY ENGINE group -->
    <div class="rc-step-group">
      <span class="rc-step-group-label" style="color:rgba(167,139,250,0.6)">Ray Engine</span>
      <div class="rc-step-group-btns">
        <button id="rc-btn-s3p0" class="rc-step-node" data-status="idle" disabled title="P0 Gap Fill"><span class="rc-step-badge">P0</span>Gap</button>
        <span class="rc-step-connector" id="rc-conn-p0-p1"></span>
        <button id="rc-btn-s3p1" class="rc-step-node" data-status="idle" disabled title="P1 Bridge"><span class="rc-step-badge">P1</span>Bridge</button>
        <span class="rc-step-connector" id="rc-conn-p1-p2"></span>
        <button id="rc-btn-s3p2" class="rc-step-node" data-status="idle" disabled title="P2 Branch"><span class="rc-step-badge">P2</span>Branch</button>
      </div>
    </div>
    <span class="rc-group-divider"></span>
    <!-- EMIT group -->
    <div class="rc-step-group">
      <span class="rc-step-group-label" style="color:rgba(52,211,153,0.6)">Emit</span>
      <div class="rc-step-group-btns">
        <button id="rc-btn-s4" class="rc-step-node" data-status="idle" disabled title="Emit Isometric PCF"><span class="rc-step-badge">S4</span>Emit</button>
      </div>
    </div>
    <!-- Run All + Config -->
    <button id="rc-btn-run-all" style="${pillPrimary};margin-left:auto;align-self:flex-end" disabled>${ICO.play} Run All</button>
    <button id="rc-btn-config-toggle" style="${ghost};align-self:flex-end">${ICO.settings} Settings</button>
    <!-- Engine Mode Toggle -->
    <label id="rc-engine-mode-toggle" style="display:flex;align-items:center;gap:6px;font-size:0.68rem;font-family:var(--font-code);color:var(--text-muted);cursor:pointer;padding:2px 6px;border:1px solid var(--steel);border-radius:var(--radius-sm);white-space:nowrap" title="Switch between legacy emitters and the unified Common PCF Builder engine">
      <input type="checkbox" id="rc-chk-engine-mode" style="accent-color:var(--accent)" ${rcState.engineMode === 'common' ? 'checked' : ''}>
      <span id="rc-engine-mode-label">${rcState.engineMode === 'common' ? 'Common PCF Builder' : 'Legacy Mode'}</span>
    </label>
  </div>

  <!-- ── Tier 2: Actions ── -->
  <div class="rc-toolbar-tier rc-tier-actions">
    <!-- Data Enrichment group -->
    <div class="rc-action-group enrichment">
      <span class="rc-action-group-label">Enrich</span>
      <button id="rc-btn-pipeline-lookup" style="${actionPill}" disabled title="Match component coordinates against Line Dump from E3D to populate Pipeline Reference, Line No Key, Piping Class and Rating on Final 2D CSV">${ICO.mapPin} Pipeline Ref</button>
      <button id="rc-btn-derive-lineno" style="${actionPill}" title="Derive blank LINENO KEY and PIPING CLASS from PIPELINE-REFERENCE in Final 2D CSV">${ICO.mapPin} LineNo Key</button>
      <button id="rc-btn-load-masters" style="${actionPill}" disabled>${ICO.database} Masters</button>
      <button id="rc-btn-reset-ca" style="${actionPill}" disabled title="Clear all CA-related properties for all components">Reset CA</button>
      <button id="rc-btn-reset-line-pc-rating" style="${actionPill}" disabled title="Clear LineNoKey, Piping Class and Rating from all current 2D rows">Reset LineNoKey/PC/Rating</button>
      <span id="rc-masters-status" style="font-size:0.68rem;color:var(--text-muted);font-family:var(--font-inter)"></span>
    </div>
    <!-- Interface group -->
    <div class="rc-action-group interface">
      <span class="rc-action-group-label">Interface</span>
      <button id="rc-btn-push-datatable" style="${actionPill}" disabled title="Push Final 2D CSV rows to PCF Fixer datatable">${ICO.send} Push to Datatable</button>
    </div>
    <!-- Export dropdown — rightmost -->
    <div class="rc-export-wrap" style="position:relative;margin-left:auto">
      <button id="rc-btn-export-toggle" style="${ghost};display:inline-flex;align-items:center;gap:5px" title="Export outputs">
        ${ico('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 15)}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <!-- Dropdown menu -->
      <div id="rc-export-menu" style="display:none;position:absolute;right:0;top:calc(100% + 4px);min-width:160px;background:var(--bg-2);border:1px solid var(--steel);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.3);padding:4px;z-index:200;overflow:hidden">
        <div style="font-size:0.55rem;font-family:var(--font-inter);font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;padding:4px 10px 2px;opacity:0.6">Export</div>
        <button id="rc-btn-save-2dcsv"      class="rc-menu-item" disabled>${ICO.download} 2D CSV</button>
        <button id="rc-btn-save-final2dcsv" class="rc-menu-item" disabled>${ICO.download} Final CSV</button>
        <button id="rc-btn-save-fittings"   class="rc-menu-item" disabled>${ICO.download} Fittings</button>
        <button id="rc-btn-save-iso"        class="rc-menu-item" style="border-top:1px solid var(--steel);margin-top:2px;padding-top:6px" disabled>${ICO.download} Isometric</button>
        <button id="rc-btn-save-pcfx"       class="rc-menu-item" style="color:var(--emerald)" disabled>${ICO.download} .pcfx JSON</button>
      </div>
    </div>
  </div>

  <!-- ── RayConfig panel (collapsible) ── -->
  <div id="rc-config-panel" style="display:none;border-bottom:1px solid var(--steel);padding:0.5rem 0.6rem;background:var(--bg-panel);flex-shrink:0">
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.4rem" id="rc-config-grid"></div>
    <div style="margin-top:0.5rem;border-top:1px solid var(--steel);padding-top:0.5rem">
      <div style="font-size:0.68rem;font-weight:700;color:var(--amber);margin-bottom:0.35rem;font-family:var(--font-code);letter-spacing:0.05em">SUPPORT MAPPING</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;margin-bottom:0.4rem">
        <label style="display:flex;flex-direction:column;gap:2px;font-size:0.68rem;color:var(--text-muted)">
          GUID Prefix <span style="font-size:0.62rem;opacity:.6">(mandatory)</span>
          <input data-cfg="supportMapping.guidPrefix" type="text" value="UCI:"
            style="font-size:0.7rem;background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:2px 5px">
        </label>
        <label style="display:flex;flex-direction:column;gap:2px;font-size:0.68rem;color:var(--text-muted)">
          Fallback Name
          <input id="rc-cfg-fallback-name" data-cfg-sm="fallbackName" type="text" value="RST"
            style="font-size:0.7rem;background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:2px 5px">
        </label>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.67rem;font-family:var(--font-code)">
        <thead><tr>
          <th style="padding:3px 6px;border:1px solid var(--steel);color:var(--amber);background:var(--bg-0);text-align:left">Block</th>
          <th style="padding:3px 6px;border:1px solid var(--steel);color:var(--amber);background:var(--bg-0);text-align:left">Friction</th>
          <th style="padding:3px 6px;border:1px solid var(--steel);color:var(--amber);background:var(--bg-0);text-align:left">Gap</th>
          <th style="padding:3px 6px;border:1px solid var(--steel);color:var(--amber);background:var(--bg-0);text-align:left">→ Name</th>
          <th style="padding:3px 6px;border:1px solid var(--steel);color:var(--amber);background:var(--bg-0);text-align:left">Description</th>
        </tr></thead>
        <tbody id="rc-cfg-sm-blocks"></tbody>
      </table>
      <div style="margin-top:0.35rem">
        <button id="rc-btn-sm-add-block" style="${ghost};padding:2px 8px">${ICO.plus} Add Block</button>
      </div>
    </div>
    <div style="margin-top:0.4rem;display:flex;gap:0.5rem">
      <button id="rc-btn-config-apply" style="${pillPrimary}">✓ Apply</button>
      <button id="rc-btn-config-reset" style="${ghost}">↺ Defaults</button>
    </div>
  </div>

  <!-- ── Main content: log + preview ── -->
  <div style="display:flex;gap:0;flex:1;min-height:0">

    <!-- Left: pass log -->
    <div style="width:210px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--steel)">
      <div style="padding:4px 8px;font-size:0.56rem;font-weight:600;letter-spacing:0.08em;color:var(--amber);background:var(--bg-panel);border-bottom:1px solid var(--steel);text-transform:uppercase;font-family:var(--font-inter)">
        Pipeline Console
      </div>
      <div id="rc-pass-log" style="flex:1;overflow-y:auto;font-family:var(--font-code);font-size:0.66rem;padding:0.4rem 0.5rem;background:#080c0a;color:#2ecc71;white-space:pre-wrap;line-height:1.5">
        <span style="color:var(--text-muted);font-style:italic">Awaiting input…</span>
      </div>
    </div>

    <!-- Right: sub-tabs + preview -->
    <div style="flex:1;display:flex;flex-direction:column;min-width:0">

      <!-- Sub-tab bar -->
      <div style="display:flex;align-items:center;border-bottom:1px solid var(--steel);background:var(--bg-2);flex-shrink:0;padding:0 0.5rem;gap:0.15rem;min-height:36px">
        <!-- Sub-tabs — pill active state -->
        <button class="rc-subtab-btn active" data-subtab="pipeline" style="${subtabStyle(true)}">
          ${ico('<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>', 13)} Pipeline
        </button>
        <button class="rc-subtab-btn" data-subtab="debug" style="${subtabStyle(false)}">
          ${ico('<path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M17.47 9c1.93-.2 3.53-1.9 3.53-4"/><path d="M22 13h-4"/>', 13)} Debug
        </button>
        <button class="rc-subtab-btn" data-subtab="masterslog" style="${subtabStyle(false)}">
          ${ico('<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>', 13)} Masters Log
        </button>
        <!-- VIEW group — right side -->
        <div style="display:flex;align-items:center;gap:0.15rem;margin-left:auto;background:var(--bg-1);border:1px solid var(--steel);border-radius:6px;padding:3px 4px">
          <span style="font-size:0.55rem;font-family:var(--font-inter);font-weight:600;color:var(--text-muted);padding:0 5px 0 3px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.55">View</span>
          <button class="rc-preview-btn active" data-preview="2dcsv"   style="${previewBtnStyle(true)}">2D CSV</button>
          <button class="rc-preview-btn" data-preview="fittings"        style="${previewBtnStyle(false)}">Fittings PCF</button>
          <button class="rc-preview-btn" data-preview="connmap"         style="${previewBtnStyle(false)}">Conn Map</button>
          <button class="rc-preview-btn" data-preview="final2dcsv"      style="${previewBtnStyle(false)}">Final 2D CSV</button>
          <button class="rc-preview-btn" data-preview="isopcfcsv"       style="${previewBtnStyle(false)}">ISOPCF CSV</button>
          <button class="rc-preview-btn" data-preview="isofinal"        style="${previewBtnStyle(false)}">Isometric PCF</button>
        </div>
        <button id="rc-btn-isopcf-info" title="PCF generation rules used for ISOPCF CSV" style="display:none;align-items:center;padding:3px 6px;cursor:pointer;border:1px solid var(--steel);border-radius:5px;background:transparent;color:var(--text-muted);margin-left:4px;font-size:11px;font-weight:600">ℹ</button>
        <span id="rc-diff-badge" style="font-size:0.65rem;font-family:var(--font-inter);padding:1px 6px;border-radius:4px;display:none;margin-left:4px"></span>
        <button id="rc-btn-copy-preview" style="display:inline-flex;align-items:center;padding:4px 8px;cursor:pointer;border:1px solid var(--steel);border-radius:5px;background:transparent;color:var(--text-muted);margin-left:4px;transition:all 150ms ease;font-weight:600" title="Copy to clipboard">
          ${ico('<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>', 16)}
        </button>
      </div>

      <!-- Pipeline sub-tab (preview area) -->
      <div id="rc-subtab-pipeline" style="flex:1;display:flex;flex-direction:column;min-height:0">
        <div id="rc-preview-area" style="flex:1;overflow:auto;background:var(--bg-0);font-family:var(--font-code);font-size:0.7rem;padding:0.5rem 0.6rem;white-space:pre;color:var(--text-primary);line-height:1.55">
          <span style="color:var(--text-muted);font-style:italic">Load a Raw CSV file and run the pipeline stages.</span>
        </div>
      </div>

      <!-- Debug sub-tab -->
      <div id="rc-subtab-debug" style="flex:1;display:none;min-height:0;overflow:hidden">
        <div id="rc-debug-container" style="height:100%;overflow:auto"></div>
      </div>

      <!-- Masters Log sub-tab -->
      <div id="rc-subtab-masterslog" style="flex:1;display:none;flex-direction:column;min-height:0;overflow:hidden">
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem 0.6rem;background:var(--bg-panel);border-bottom:1px solid var(--steel);flex-shrink:0">
          <span style="font-size:0.68rem;font-weight:700;letter-spacing:0.06em;color:var(--amber);font-family:var(--font-code)">MASTERS / PIPELINE LOG</span>
          <label style="display:flex;align-items:center;gap:4px;font-size:0.65rem;color:var(--text-muted);cursor:pointer;margin-left:auto;user-select:none" title="Collapse consecutive identical warnings/skips beyond 5 occurrences">
            <input type="checkbox" id="rc-masterslog-limit" checked style="cursor:pointer;accent-color:var(--amber)">
            Limit repeating to 5
          </label>
          <button id="rc-btn-clear-masterslog" style="font-size:0.65rem;padding:2px 8px;cursor:pointer;border:1px solid var(--steel);border-radius:3px;background:transparent;color:var(--text-muted)">🗑 Clear</button>
        </div>
        <div id="rc-masterslog-container" style="flex:1;overflow:auto;font-family:var(--font-code);font-size:0.68rem;background:var(--bg-0);padding:0.4rem 0.6rem">
          <span style="color:var(--text-muted);font-style:italic">No events yet — click 📥 Masters or 📍 Pipeline to log activity.</span>
        </div>
      </div>

    </div>
  </div>
</div>`;
}

// ── Event wiring ──────────────────────────────────────────────────────────────
function wireEvents(root) {
  window.addEventListener('pcf-push-to-2dcsv', (e) => {
    if (e.detail && Array.isArray(e.detail)) {
      if (rcState.finalComponents && rcState.finalComponents.length > 0) {
        rcState.finalComponents = [...e.detail];
        rcState.finalCsv2DText = emit2DCSV(rcState.finalComponents, getRayConfig());
      } else {
        rcState.components = [...e.detail];
        _rebuildCsv2D();
      }
      const root = document.querySelector('#ray-concept-tab');
      if (root) {
        const usingFinal = rcState.finalComponents && rcState.finalComponents.length > 0;
        if (usingFinal) render2DTable(root, rcState.finalCsv2DText, rcState.finalComponents);
        else            render2DTable(root, rcState.csv2DText, rcState.components);
        passLog(root, `📥 Received ${e.detail.length} updated rows from PCF Fixer Data Table`, 'info');
      }
    }
  });
  // File upload
  root.querySelector('#rc-btn-upload').addEventListener('click', () =>
    root.querySelector('#rc-file-input').click());
  root.querySelector('#rc-file-input').addEventListener('change', e => { void onFileLoad(e, root); });
  root.querySelector('#rc-btn-upload-xml').addEventListener('click', () =>
    root.querySelector('#rc-xml-file-input').click());
  root.querySelector('#rc-xml-file-input').addEventListener('change', e => { void onXmlFileLoad(e, root); });

  // RayConfig toggle
  root.querySelector('#rc-btn-config-toggle').addEventListener('click', () =>
    toggleConfig(root));
  root.querySelector('#rc-btn-config-apply').addEventListener('click', () =>
    applyConfig(root));
  root.querySelector('#rc-btn-config-reset').addEventListener('click', () =>
    resetConfig(root));

  // Pipeline buttons
  root.querySelector('#rc-btn-s1').addEventListener('click', () => runS1(root));
  root.querySelector('#rc-btn-s2').addEventListener('click', () => runS2(root));
  root.querySelector('#rc-btn-s3p0').addEventListener('click', () => runS3(root, { p0:true,  p1:false, p2:false }));
  root.querySelector('#rc-btn-s3p1').addEventListener('click', () => runS3(root, { p0:false, p1:true,  p2:false }));
  root.querySelector('#rc-btn-s3p2').addEventListener('click', () => runS3(root, { p0:false, p1:false, p2:true  }));
  root.querySelector('#rc-btn-s4').addEventListener('click', () => runS4(root));
  root.querySelector('#rc-btn-run-all').addEventListener('click', () => runAll(root));

  // Engine mode toggle
  root.querySelector('#rc-chk-engine-mode')?.addEventListener('change', e => {
    const mode = e.target.checked ? 'common' : 'legacy';
    rcState.engineMode = mode;
    localStorage.setItem('pcfStudio.engineMode', mode);
    const label = root.querySelector('#rc-engine-mode-label');
    if (label) label.textContent = mode === 'common' ? 'Common PCF Builder' : 'Legacy Mode';
  });

  // Download buttons
  root.querySelector('#rc-btn-save-fittings').addEventListener('click', () =>
    saveFile(rcState.fittingsPcfText, rcState.rawFileName.replace(/\.[^.]+$/, '') + '_fittings.pcf'));
  root.querySelector('#rc-btn-save-iso').addEventListener('click', () =>
    saveFile(rcState.isoMetricPcfText, rcState.rawFileName.replace(/\.[^.]+$/, '') + '_isometric.pcf'));
  root.querySelector('#rc-btn-save-2dcsv').addEventListener('click', () =>
    saveFile(rcState.csv2DText, rcState.rawFileName.replace(/\.[^.]+$/, '') + '_2d.csv'));
  root.querySelector('#rc-btn-save-final2dcsv').addEventListener('click', () =>
    saveFile(rcState.finalCsv2DText, rcState.rawFileName.replace(/\.[^.]+$/, '') + '_final2d.csv'));
  root.querySelector('#rc-btn-save-pcfx').addEventListener('click', () => {
    if (!rcState.finalComponents) return;
    const pcfxJson = exportTableRowsToPcfx(rcState.finalComponents);
    saveFile(JSON.stringify(pcfxJson, null, 2), rcState.rawFileName.replace(/\.[^.]+$/, '') + '_export.pcfx');
  });
  root.querySelector('#rc-btn-push-datatable').addEventListener('click', () => runPushToDatatable(root));
  root.querySelector('#rc-btn-reset-ca').addEventListener('click', () => runResetCA(root));
  root.querySelector('#rc-btn-reset-line-pc-rating')?.addEventListener('click', () => {
    resetLineNoKeyPcRating(root);
  });

  // Preview selector
  root.querySelectorAll('.rc-preview-btn').forEach(btn =>
    btn.addEventListener('click', () => switchPreview(root, btn.dataset.preview)));

  // ISOPCF info button — show PCF generation rules modal
  const isoPcfInfoBtn = root.querySelector('#rc-btn-isopcf-info');
  if (isoPcfInfoBtn) {
    isoPcfInfoBtn.addEventListener('click', () => {
      const cfg = getConfig();
      const dropList = (cfg.isopcfDrop || ['GASK','INST','PCOM','MISC']).join(', ');
      const stretchList = (cfg.isopcfStretchPriority || ['PIPE','FLANGE','TEE','BEND']).join(' → ');
      alert(
        'ISOPCF CSV Generation Rules\n\n' +
        `Drop types: ${dropList}\n` +
        `Stretch priority: ${stretchList}\n` +
        `Coord overflow: divide by 1000 if any value > ${(cfg.maxEpCoordValue || 999999999).toLocaleString()} mm\n` +
        `SKEY format: angle-bracket (e.g. <BEBW>)\n` +
        `CA3 (Material): numeric values only`
      );
    });
  }

  // Copy preview content
  root.querySelector('#rc-btn-copy-preview').addEventListener('click', () => {
    const el = root.querySelector('#rc-preview-area');
    if (!el) return;
    const text = el.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      const btn = root.querySelector('#rc-btn-copy-preview');
      const orig = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }).catch(() => {
      // fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  });

  // Sub-tab switches
  root.querySelectorAll('.rc-subtab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchSubTab(root, btn.dataset.subtab)));

  // Load masters button
  root.querySelector('#rc-btn-load-masters').addEventListener('click', () => runLoadMasters(root));

  // Pipeline lookup button
  root.querySelector('#rc-btn-pipeline-lookup').addEventListener('click', () => runPipelineLookup(root));
  root.querySelector('#rc-btn-derive-lineno').addEventListener('click', () => runDeriveLineNoKey(root));

  // Export dropdown toggle — use fixed positioning to escape overflow:auto clip
  root.querySelector('#rc-btn-export-toggle').addEventListener('click', () => {
    const menu = root.querySelector('#rc-export-menu');
    if (!menu) return;
    if (menu.style.display !== 'none') { menu.style.display = 'none'; return; }
    const btn  = root.querySelector('#rc-btn-export-toggle');
    const rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top      = (rect.bottom + 4) + 'px';
    menu.style.right    = (window.innerWidth - rect.right) + 'px';
    menu.style.left     = 'auto';
    menu.style.display  = 'block';
  });
  document.addEventListener('click', (e) => {
    const wrap = root.querySelector('.rc-export-wrap');
    if (wrap && wrap.contains(e.target)) return;
    const menu = root.querySelector('#rc-export-menu');
    if (menu) menu.style.display = 'none';
  });

  // Masters Log — delegated events (buttons and inputs inside the sub-tab)
  root.addEventListener('click', e => {
    if (e.target.id === 'rc-btn-clear-masterslog') {
      rcState.mastersLog = [];
      _renderMastersLog(root);
    }
  });
  root.addEventListener('change', e => {
    if (e.target.id === 'rc-masterslog-limit') _renderMastersLog(root);
  });

  // Build RayConfig grid
  buildConfigGrid(root);
}

// ── Step status helper ────────────────────────────────────────────────────────
function setStepStatus(root, sel, status) {
  const el = root.querySelector(sel);
  if (el) el.dataset.status = status;
}
function setConnDone(root, id) {
  const el = root.querySelector(`#${id}`);
  if (el) el.classList.add('done');
}

// ── File load ─────────────────────────────────────────────────────────────────
async function onFileLoad(e, root) {
  const file = e.target.files[0];
  if (!file) return;
  rcState.rawFileName = file.name;
  root.querySelector('#rc-filename').textContent = file.name;

  try {
    passLog(root, `── INPUT  ${_now()} ─────────`, 'header');
    passLog(root, `  ${file.name}`, 'info');
    if (isExcelFile(file)) {
      const { csv, sheetName } = await readExcelAsCSV(file);
      rcState.rawCsvText = csv;
      passLog(root, `  ∙ Source sheet: ${sheetName}`, 'stat');
    } else {
      rcState.rawCsvText = await file.text();
    }

    setBtn(root, '#rc-btn-s1', true);
    setBtn(root, '#rc-btn-run-all', true);
    setStepStatus(root, '#rc-btn-s1', 'ready');
    const rawLines = String(rcState.rawCsvText || '').split('\n').length;
    passLog(root, `  ∙ ${rawLines} raw lines`, 'stat');
  } catch (err) {
    passLog(root, `✕ Input load failed: ${err.message}`, 'error');
    _mastersLog('error', '❌ Input load failed', { file: file.name, error: err.message });
  } finally {
    e.target.value = '';
  }
}

async function onXmlFileLoad(e, root) {
  const file = e.target.files[0];
  if (!file) return;
  rcState.rawFileName = file.name.replace(/\.xml$/i, '.csv');
  root.querySelector('#rc-filename').textContent = file.name;
  try {
    passLog(root, `── INPUT(XML)  ${_now()} ────`, 'header');
    passLog(root, `  ${file.name}`, 'info');
    const xmlText = await file.text();
    const converted = convertAvevaXmlToRawCsv(xmlText);
    rcState.rawCsvText = converted.csvText;
    const mappingRows = Object.entries(converted.mapping || {})
      .map(([k, v]) => `${k} ← ${v}`)
      .join(' | ');
    passLog(root, `  ∙ ${converted.rowCount} XML nodes mapped to Raw CSV rows`, 'success');
    passLog(root, `  ∙ Pipeline Ref mapped from Branchname: ${converted.branchName || '—'}`, 'stat');
    passLog(root, `  ∙ Mapping: ${mappingRows}`, 'stat');
    setBtn(root, '#rc-btn-s1', true);
    setBtn(root, '#rc-btn-run-all', true);
    setStepStatus(root, '#rc-btn-s1', 'ready');
  } catch (err) {
    passLog(root, `✕ XML import failed: ${err.message}`, 'error');
  } finally {
    e.target.value = '';
  }
}

// ── Stage runners ─────────────────────────────────────────────────────────────
async function runS1(root) {
  if (!rcState.rawCsvText) return;
  clearLog();
  passLog(root, `── S1  PARSE  ${_now()} ──────`, 'header');
  try {
    const cfg = getConfig();
    const { components, csvText } = runStage1(rcState.rawCsvText, debugLog, cfg);
    rcState.components = components;
    rcState.csv2DText  = csvText;
    rcState.pipelineRef = components.find(c => c.pipelineRef)?.pipelineRef || '';
    rcState.stageStatus.s1 = 'done';
    // Component type breakdown
    const tc = {};
    for (const c of components) tc[c.type] = (tc[c.type] || 0) + 1;
    passLog(root, `✓ ${components.length} components`, 'success');
    for (const [t, n] of Object.entries(tc).sort((a,b) => b[1]-a[1]))
      passLog(root, `  ∙ ${t.padEnd(10)} ${n}`, 'stat');
    if (rcState.pipelineRef)
      passLog(root, `  ref: ${rcState.pipelineRef}`, 'stat');
    setStepStatus(root, '#rc-btn-s1', 'done');
    setStepStatus(root, '#rc-btn-s2', 'ready');
    setConnDone(root, 'rc-conn-s1-s2');
    setBtn(root, '#rc-btn-s2', true);
    setBtn(root, '#rc-btn-save-2dcsv', true);
    setBtn(root, '#rc-btn-load-masters', true);
    setBtn(root, '#rc-btn-reset-ca', true);
    setBtn(root, '#rc-btn-reset-line-pc-rating', true);
    setBtn(root, '#rc-btn-pipeline-lookup', true);
    render2DTable(root, csvText, rcState.components);
    activatePreviewBtn(root, '2dcsv');
    setBadge(root, '2dcsv', 'done');
  } catch (err) {
    passLog(root, `✕ ${err.message}`, 'error');
    rcState.stageStatus.s1 = 'error';
  }
}

async function runS2(root) {
  if (!rcState.components.length) return;
  passLog(root, `── S2  FITTINGS  ${_now()} ───`, 'header');
  try {
    const { pcfText } = runStage2(rcState.components, debugLog);
    rcState.fittingsPcfText = pcfText;
    rcState.stageStatus.s2 = 'done';
    const fitCount = (pcfText.match(/^(FLANGE|BEND|TEE|OLET|VALVE|SUPPORT|ELBOW)/gm) || []).length;
    passLog(root, `✓ ${fitCount} fitting blocks`, 'success');
    // Per-type breakdown
    const ft = {};
    (pcfText.match(/^(FLANGE|BEND|TEE|OLET|VALVE|SUPPORT|ELBOW)/gm)||[]).forEach(t => ft[t]=(ft[t]||0)+1);
    for (const [t,n] of Object.entries(ft).sort((a,b)=>b[1]-a[1]))
      passLog(root, `  ∙ ${t.padEnd(10)} ${n}`, 'stat');
    setStepStatus(root, '#rc-btn-s2', 'done');
    setStepStatus(root, '#rc-btn-s3p0', 'ready');
    setStepStatus(root, '#rc-btn-s3p1', 'ready');
    setStepStatus(root, '#rc-btn-s3p2', 'ready');
    setBtn(root, '#rc-btn-s3p0', true);
    setBtn(root, '#rc-btn-s3p1', true);
    setBtn(root, '#rc-btn-s3p2', true);
    setBtn(root, '#rc-btn-save-fittings', true);
    showPreview(root, 'rc-preview-area', pcfText);
    activatePreviewBtn(root, 'fittings');
    setBadge(root, 'fittings', 'done');
  } catch (err) {
    passLog(root, `✕ ${err.message}`, 'error');
    rcState.stageStatus.s2 = 'error';
  }
}

async function runS3(root, passOverride = null) {
  if (!rcState.components.length) return;
  passLog(root, `── S3  RAY ENGINE  ${_now()} ─`, 'header');
  const cfg = getRayConfig();
  if (passOverride) setRayConfig({ passEnabled: passOverride });
  try {
    const result = runStage3(rcState.components, rcState.pipelineRef, debugLog);
    rcState.injectedPipes    = result.injectedPipes;
    rcState.connectionMatrix = result.connectionMatrix;
    rcState.stageStatus.s3   = 'done';
    const { p0, p1, p2 }    = result.passStats;
    passLog(root, `  P0 gap-fill   ${p0}`, 'stat');
    passLog(root, `  P1 bridges    ${p1}`, 'stat');
    passLog(root, `  P2 branches   ${p2}`, 'stat');
    const orphans = result.orphanList.length;
    if (orphans > 0)
      passLog(root, `  ⚠ ${orphans} orphan${orphans !== 1 ? 's' : ''} open`, 'warn');
    else
      passLog(root, `✓ All endpoints connected`, 'success');
    setStepStatus(root, '#rc-btn-s3p0', 'done');
    setStepStatus(root, '#rc-btn-s3p1', 'done');
    setStepStatus(root, '#rc-btn-s3p2', 'done');
    setStepStatus(root, '#rc-btn-s4', 'ready');
    setConnDone(root, 'rc-conn-p0-p1');
    setConnDone(root, 'rc-conn-p1-p2');
    setBtn(root, '#rc-btn-s4', true);
    setBtn(root, '#rc-btn-pipeline-lookup', true);
    _buildFinalComponents();
    setBtn(root, '#rc-btn-save-final2dcsv', true);
    showConnMapPreview(root, result.connectionMatrix);
    activatePreviewBtn(root, 'connmap');
    // Re-render debug tab if open
    const dbgContainer = root.querySelector('#rc-debug-container');
    renderDebugTab(dbgContainer, rcState.connectionMatrix);
  } catch (err) {
    passLog(root, `✕ ${err.message}`, 'error');
    rcState.stageStatus.s3 = 'error';
  }
}


/**
 * Build a simple CSV string from ISOPCF component rows for the preview tab.
 */
function _buildIsoPcfCsvText(rows) {
  if (!rows.length) return '(no components)';
  const headers = ['Type', 'Bore', 'RefNo', 'SKEY',
    'CA1 (Des Pr.)', 'CA2 (Des Temp.)', 'CA3 (Material)', 'CA4 (Wall Thk.)',
    'CA5 (Ins Thk.)', 'CA6 (Ins Den.)', 'CA7 (Corr. Allow.)', 'CA8 (Comp Wt.)',
    'CA9 (Fluid Den.)', 'CA10 (Hydro Pr.)',
    'EP1', 'EP2', 'CP', 'BP'];
  const fmtPt = pt => pt ? `${pt.x?.toFixed(1)},${pt.y?.toFixed(1)},${pt.z?.toFixed(1)}` : '';
  const lines = [headers.join('\t')];
  for (const c of rows) {
    lines.push([
      c.type || '', c.bore ?? '', c.refNo || '', c.skey || '',
      c.ca1 ?? '', c.ca2 ?? '', c.ca3 ?? '', c.ca4 ?? '',
      c.ca5 ?? '', c.ca6 ?? '', c.ca7 ?? '', c.ca8 ?? '',
      c.ca9 ?? '', c.ca10 ?? '',
      fmtPt(c.ep1), fmtPt(c.ep2), fmtPt(c.cp), fmtPt(c.bp)
    ].join('\t'));
  }
  return lines.join('\n');
}

async function runS4(root) {
  const baseComponents = rcState.finalComponents.length ? rcState.finalComponents : rcState.components;
  const compactedSource = compactDroppedInlineComponentsForIsoPcf(baseComponents, { dropTypes: ['GASKET'] });
  const pcfInputComponents = compactedSource.components && compactedSource.components.length
    ? compactedSource.components
    : baseComponents;
  if (!baseComponents.length) return;
  passLog(root, `── S4  EMIT ISO  ${_now()} ──`, 'header');
  if (rcState.engineMode === 'common') {
    passLog(root, '  ⚙ Common PCF Builder engine active', 'stat');
  }
  try {
    let pcfText;
    if (rcState.engineMode === 'common') {
      // Common PCF Builder — use shared pcf-engine emitters
      const [{ buildPcfHeader }, { emitComponent, applyBridgeInterleave }, { maybeScaleCoords }] = await Promise.all([
        import('../pcf-engine/pcf-header.js'),
        import('../pcf-engine/pcf-emitter.js'),
        import('../pcf-engine/coord-scaler.js'),
      ]);
      const cfg4 = getConfig();
      const engineCfg = { ...cfg4, engineMode: 'common', decimalPrecision: cfg4.outputSettings?.decimalPlaces ?? 4 };
      // Mark injected bridge pipes before scaling so they can be identified after
      const markedBridges = (rcState.injectedPipes || []).map(p => ({ ...p, _isBridge: true }));
      const { components: scaledComps } = await maybeScaleCoords(
        [...pcfInputComponents, ...markedBridges],
        null  // auto-scale without popup
      );
      // Interleave bridge pipes after their source fittings (matching legacy S4 order)
      const ordered = applyBridgeInterleave(
        scaledComps.filter(c => !c._isBridge),
        scaledComps.filter(c => c._isBridge),
      );
      const header = buildPcfHeader(rcState.pipelineRef || rcState.rawFileName, engineCfg);
      const nl = '\r\n';
      // Map flat ca1…ca10 props → nested ca object expected by emitComponent
      const withCa = ordered.map(c => ({
        ...c,
        ca: {
          '1': c.ca1 ?? '', '2': c.ca2 ?? '', '3': c.ca3 ?? '',
          '4': c.ca4 ?? '', '5': c.ca5 ?? '', '6': c.ca6 ?? '',
          '7': c.ca7 ?? '', '8': c.ca8 ?? '', '9': c.ca9 ?? '', '10': c.ca10 ?? '',
          ...(c.ca || {}),  // preserve any already-nested ca values
        },
      }));
      const body = withCa.flatMap(c => emitComponent(c, engineCfg)).join(nl);
      pcfText = header + body;
    } else {
      // Legacy engine (unchanged)
      ({ pcfText } = runStage4(
        pcfInputComponents, rcState.injectedPipes, rcState.pipelineRef, debugLog
      ));
    }
    rcState.isoMetricPcfText = pcfText;
    rcState.stageStatus.s4   = 'done';
    // Build ISOPCF CSV (drop GASK/INST/PCOM/MISC, stretch adjacent)
    const cfg4 = getConfig();
    const compacted = compactDroppedInlineComponentsForIsoPcf(baseComponents, { dropTypes: ['GASKET'] });
    rcState.isoPcfComponents = compacted.components;
    rcState.isoPcfDropLog = compacted.dropLog || [];
    if (rcState.isoPcfDropLog.length) {
      const compactedCount = rcState.isoPcfDropLog
        .filter(x => x.status === 'compacted')
        .reduce((sum, x) => sum + (x.droppedCount || 0), 0);
      passLog(root, `🔧 ISOPCF geometry compacted: suppressed ${compactedCount} GASKET row(s), adjusted adjacent EP2/EP1 continuity.`, 'info');
    }
    rcState.isoPcfCsvText    = _buildIsoPcfCsvText(rcState.isoPcfComponents);
    const totalLines  = pcfText.split('\n').filter(l => l.trim()).length;
    const compBlocks  = (pcfText.match(/^(PIPE|FLANGE|BEND|TEE|OLET|VALVE|SUPPORT|ELBOW)/gm)||[]).length;
    const attrLines   = totalLines - compBlocks;
    passLog(root, `✓ ${totalLines} PCF lines`, 'success');
    passLog(root, `  ∙ ${compBlocks} component blocks`, 'stat');
    passLog(root, `  ∙ ${attrLines} attribute lines`, 'stat');
    if (rcState.injectedPipes?.length)
      passLog(root, `  ∙ ${rcState.injectedPipes.length} bridge pipes`, 'stat');
    setStepStatus(root, '#rc-btn-s4', 'done');
    _buildFinalComponents();
    setBtn(root, '#rc-btn-save-iso', true);
    setBtn(root, '#rc-btn-save-final2dcsv', true);
    setBtn(root, '#rc-btn-save-pcfx', true);
    setBtn(root, '#rc-btn-push-datatable', true);
    showPreview(root, 'rc-preview-area', pcfText);
    activatePreviewBtn(root, 'isofinal');
    setBadge(root, 'isofinal', 'done');
  } catch (err) {
    passLog(root, `✕ ${err.message}`, 'error');
    rcState.stageStatus.s4 = 'error';
  }
}

// NPS (inches) → NB (mm) — matches Pipe size Vs Sch master table (mirrors rc-master-loader.js)
const _TAB_NPS_TO_DN = new Map([
  [0.5,20],[0.75,25],[1,32],[1.25,40],[1.5,50],[2,65],[2.5,80],[3,90],
  [3.5,100],[4,125],[5,150],[6,200],[8,250],[10,300],[12,350],[14,400],
  [16,450],[18,500],[20,550],[22,600],[24,650],[26,700],[28,750],
  [30,800],[32,850],[34,900],[36,950]
]);
const _TAB_DN_TO_NPS = new Map([..._TAB_NPS_TO_DN.entries()].map(([nps,dn]) => [dn, nps]));
const _TAB_OD_TO_DN_ROWS = (() => {
  const t1 = masterTableService.getTables?.()?.table1EqualTee || [];
  return t1.map(r => ({ dn: Number.parseFloat(r?.bore_mm), od: Number.parseFloat(r?.od_mm) }))
    .filter(r => Number.isFinite(r.dn) && Number.isFinite(r.od));
})();
const _tabFuzzyMmEq = (a, b) => Math.abs(a - b) <= Math.max(1.5, Math.abs(b) * 0.006);
function _tabFuzzyDnFromOd(odMm) {
  let bestDn = null, bestOd = null, bestErr = Infinity;
  for (const r of _TAB_OD_TO_DN_ROWS) {
    const e = Math.abs(odMm - r.od);
    if (e < bestErr) { bestErr = e; bestDn = r.dn; bestOd = r.od; }
  }
  if (bestDn == null || bestOd == null) return null;
  return _tabFuzzyMmEq(odMm, bestOd) ? bestDn : null;
}

/** Read numeric size from a PC master row — two-pass case-insensitive key scan. */
function _pcRowSize(row) {
  if (!row) return 0;
  const PC_SIZE_KEYS = ['Size', 'DN', 'NPS'];
  for (const k of PC_SIZE_KEYS) {
    if (row[k] != null && String(row[k]).trim() !== '') return Number.parseFloat(row[k]) || 0;
  }
  const rowKeys = Object.keys(row);
  for (const k of PC_SIZE_KEYS) {
    const kl = k.toLowerCase();
    const found = rowKeys.find(rk => rk.toLowerCase() === kl);
    if (found && row[found] != null && String(row[found]).trim() !== '') return Number.parseFloat(row[found]) || 0;
  }
  return 0;
}

/** True when compBore (mm or NPS) and pcSize (NPS or mm) refer to the same nominal size. */
function _tabBoreMatches(compBore, pcSize) {
  if (!Number.isFinite(compBore) || compBore <= 0) return false;
  if (!Number.isFinite(pcSize)   || pcSize   <= 0) return false;
  if (Math.abs(compBore - pcSize) < 1) return true;
  const nps = _TAB_DN_TO_NPS.get(Math.round(compBore));  // comp is DN mm → NPS
  if (nps !== undefined && Math.abs(nps - pcSize) < 0.01) return true;
  const dn  = _TAB_NPS_TO_DN.get(compBore);              // comp is NPS → DN mm
  if (dn  !== undefined && Math.abs(dn  - pcSize) < 1)   return true;
  const compDnFromOd = _tabFuzzyDnFromOd(compBore);      // comp is OD mm → DN/NPS
  if (compDnFromOd != null) {
    if (Math.abs(compDnFromOd - pcSize) < 1) return true;
    const npsFromOd = _TAB_DN_TO_NPS.get(Math.round(compDnFromOd));
    if (npsFromOd !== undefined && Math.abs(npsFromOd - pcSize) < 0.01) return true;
  }
  const pcDnFromOd = _tabFuzzyDnFromOd(pcSize);          // pcSize is OD mm → DN/NPS
  if (pcDnFromOd != null) {
    if (Math.abs(compBore - pcDnFromOd) < 1) return true;
    const pcAsNps = _TAB_DN_TO_NPS.get(Math.round(pcDnFromOd));
    if (pcAsNps !== undefined && Math.abs(compBore - pcAsNps) < 0.01) return true;
  }
  return false;
}

/** Filter PC master to bores present in `components` and refresh the ACTIVE ROWS table. */
function _refreshPcActiveTable(components) {
  const container = document.getElementById('pipingclass-active-container');
  const countEl   = document.getElementById('pipingclass-active-count');

  // ── Resolve PC master data (live memory first, then localStorage) ──────────
  let pcRaw = dataManager.getPipingClassMaster() || [];
  if (!pcRaw.length) {
    pcRaw = dataManager.getPipingClassMasterFromStorage?.() || [];
  }
  if (!pcRaw.length) {
    rcState.pcActiveTable = [];
    _renderPcActiveTable();
    return;
  }

  // ── Build bore set from components ──────────────────────────────────────────
  const compBores = [...new Set(
    (components || []).map(c => Number.parseFloat(c.bore)).filter(b => Number.isFinite(b) && b > 0)
  )];

  // ── Filter to matching bores (NPS ↔ DN conversion aware) ───────────────────
  let filtered = compBores.length
    ? pcRaw.filter(row => {
        const sz = _pcRowSize(row);
        return compBores.some(b => _tabBoreMatches(b, sz));
      })
    : pcRaw;

  // ── Fall back to full table if filter returned nothing ──────────────────────
  // (protects against size column name mismatch or unit mismatch)
  const wasFiltered = compBores.length > 0;
  const boreMismatch = wasFiltered && filtered.length === 0;
  if (boreMismatch) filtered = pcRaw;

  rcState.pcActiveTable = filtered;
  _renderPcActiveTable();

  // Annotate count badge to explain what's shown
  if (countEl) {
    if (!wasFiltered) {
      countEl.textContent = `${pcRaw.length} rows (no CSV bores available)`;
    } else if (boreMismatch) {
      countEl.textContent = `${pcRaw.length} rows — ⚠ bore filter matched nothing (showing all)`;
      countEl.style.color = '#f59e0b';
    } else {
      countEl.textContent = `${filtered.length} of ${pcRaw.length} rows`;
      countEl.style.color = 'var(--text-muted)';
    }
  }
}

async function runLoadMasters(root) {
  let targets = rcState.finalComponents.length ? rcState.finalComponents : rcState.components;
  let usingFinal = rcState.finalComponents.length > 0;
  if (!targets.length) {
    const parsed = _rowsFromCsvText(rcState.finalCsv2DText.trim() ? rcState.finalCsv2DText : rcState.csv2DText).map(_mastersRowFromCsv);
    if (parsed.length) {
      targets = parsed;
      usingFinal = rcState.finalCsv2DText.trim().length > 0;
      if (usingFinal) rcState.finalComponents = parsed;
      else rcState.components = parsed;
    }
  }
  if (!targets.length) {
    passLog(root, `⚠ Masters: no component state available (run S1 first)`, 'warn');
    _mastersLog('warn', '⚠ Masters skipped: no component state available', {
      finalRows: rcState.finalComponents.length,
      stage1Rows: rcState.components.length
    });
    switchSubTab(root, 'masterslog');
    return;
  }
  const statusEl = root.querySelector('#rc-masters-status');
  if (statusEl) { statusEl.textContent = '⏳ Loading…'; statusEl.style.color = 'var(--text-muted)'; statusEl.style.fontWeight = 'normal'; }

  _refreshPcActiveTable(targets);
  _mastersLog('info', `📥 Masters started (${usingFinal ? 'Final CSV' : '2D CSV'})`, { components: targets.length });
  try {
    const cfg = getConfig();
    _mastersLog('info', 'Config loaded', {
      ratingMap2: JSON.stringify(cfg?.ratingPrefixMap?.twoChar || {}),
      ratingMap1: JSON.stringify(cfg?.ratingPrefixMap?.oneChar || {})
    });

    // ── Linelist diagnostic ───────────────────────────────────────────
    const dmLinelistRows = dataManager.getLinelist().length;
    const llServiceData  = linelistService.getData().length;
    if (dmLinelistRows === 0) {
      _mastersLog('warn', '⚠ Linelist: no data loaded — upload a linelist in Master Data → Linelist Manager', {
        dmRows: 0,
        serviceRows: 0
      });
    } else {
      const { smartMap = {}, keys = {} } = (() => {
        try { return linelistService.getData ? { smartMap: {}, keys: {} } : {}; } catch (_) { return {}; }
      })();
      _mastersLog('info', `📋 Linelist ready`, {
        dmRows: dmLinelistRows,
        serviceRows: llServiceData || `0 (will use dm fallback → ${dmLinelistRows})`,
        lineRefKey: (() => { try { const s = linelistService; return s._simpleMap ? `mapped (${s._simpleMap.size} keys)` : 'index not yet built'; } catch (_) { return '?'; } })()
      });
    }

    // Pass 1: match piping class / masters data first.
    let pass = await loadMastersInto(targets, cfg, new Map());
    rcState.pcActiveTable = pass.pcDataActive || [];
    _renderPcActiveTable();

    // Pass 2: allow approximate-class edits, then re-match.
    await maybeEditApproxMastersRows(targets);
    pass = await loadMastersInto(targets, cfg, new Map());
    rcState.pcActiveTable = pass.pcDataActive || [];
    _renderPcActiveTable();

    // Pass 3: run CA3 material mapping popup after class matching.
    const materialRequests = collectMaterialCodeRequests(targets, cfg);
    _mastersLog(materialRequests.length ? 'info' : 'warn',
      materialRequests.length
        ? `🧪 Material mapping requests: ${materialRequests.length}`
        : '⚠ Material mapping requests: 0 (all resolved or no material source found)');
    let materialOverrides = new Map();
    if (materialRequests.length) {
      const materialMap = dataManager.getMaterialMap?.() || [];
      materialOverrides = await new Promise(resolve => {
        showMaterialCodePopup({
          items: materialRequests,
          materialMap,
          onApply: (selections) => resolve(new Map(
            Object.entries(selections || {}).map(([k, v]) => [
              String(k || '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim(),
              String(v || '').trim()
            ])
          )),
          onCancel: () => resolve(new Map())
        });
      });
    }
    if (materialOverrides.size > 0) {
      pass = await loadMastersInto(targets, cfg, materialOverrides);
      rcState.pcActiveTable = pass.pcDataActive || [];
      _renderPcActiveTable();
    }
    const { updated, pcSnap, pcMissSamples, pcDataActive } = pass;

    // ── PC master diagnostic log ─────────────────────────────────────
    if (!pcSnap.loaded) {
      _mastersLog('warn', '⚠ Piping Class Master: not loaded — CA3 / CA4 / CA7 will be blank', {
        hint: 'Upload in Master Data → Piping Class Master'
      });
    } else {
      const colWarn = !pcSnap.hasMat || !pcSnap.hasWall || !pcSnap.hasCorr;
      _mastersLog(colWarn ? 'warn' : 'info',
        `🗂 Piping Class Master (${pcSnap.rows} rows)`, {
          cols:         pcSnap.cols,
          CA3_Material:    pcSnap.hasMat  ? '✓ detected' : `✗ NOT detected — tried: Material_Name, Material Name, Material`,
          CA4_WallThk:     pcSnap.hasWall ? '✓ detected' : `✗ NOT detected — tried: Wall Thickness, WallThickness, Wall_Thickness`,
          CA7_CorrAllow:   pcSnap.hasCorr ? '✓ detected' : `✗ NOT detected — tried: Corrosion Allowance, Corrosion Allow, Corrosion`,
        }
      );
    }

    if (usingFinal) {
      rcState.finalCsv2DText = emit2DCSV(rcState.finalComponents, getRayConfig());
      render2DTable(root, rcState.finalCsv2DText, rcState.finalComponents);
      activatePreviewBtn(root, 'final2dcsv');
    } else {
      _rebuildCsv2D();
      render2DTable(root, rcState.csv2DText, rcState.components);
      activatePreviewBtn(root, '2dcsv');
    }

    // ── Sync CA1-CA10 → ISOPCF CSV → Isometric PCF ──────────────────
    // Re-build the ISOPCF component list (preserves updated CA values via spread)
    const cfg4 = getConfig();
    const compactedTarget = compactDroppedInlineComponentsForIsoPcf(targets, { dropTypes: ['GASKET'] });
    rcState.isoPcfComponents = compactedTarget.components;
    rcState.isoPcfDropLog = compactedTarget.dropLog || [];
    if (rcState.isoPcfDropLog.length) {
      const compactedCount = rcState.isoPcfDropLog
        .filter(x => x.status === 'compacted')
        .reduce((sum, x) => sum + (x.droppedCount || 0), 0);
      passLog(root, `🔧 ISOPCF geometry compacted: suppressed ${compactedCount} GASKET row(s), adjusted adjacent EP2/EP1 continuity.`, 'info');
    }
    rcState.isoPcfCsvText    = _buildIsoPcfCsvText(rcState.isoPcfComponents);
    // Re-run S4 to regenerate the Isometric PCF text with updated CA1-CA10
    if (targets.length) {
      passLog(root, '↻ Re-generating Isometric PCF with updated CA attributes…', 'info');
      runS4(root).catch(e => passLog(root, `⚠ S4 re-run after Masters: ${e.message}`, 'warn'));
    }

    // ── Per-component tallies ────────────────────────────────────────
    let withCA = 0, withRating = 0, noLineno = 0, withCA6 = 0, withCA7 = 0,
        withLineList = 0, withPCMaster = 0, failedRows = 0;
    for (const c of targets) {
      if (c.ca1 || c.ca2 || c.ca3 || c.ca4 || c.ca5 || c.ca6 || c.ca7 || c.ca10) withCA++;
      if (c.rating) withRating++;
      if (!c.lineNoKey) noLineno++;
      const trace = c._mastersMeta || {};
      if (trace.linelist?.found)           withLineList++;
      if (trace.pipingClassMaster?.matched) withPCMaster++;
      if (trace.ca6?.applied)              withCA6++;
      if (trace.ca7?.applied)              withCA7++;

      const reasons = [];
      if (!trace.linelist?.found) reasons.push(trace.linelist?.reason || (!c.lineNoKey ? 'lineNoKey blank' : 'linelist missing'));
      if (!trace.pipingClassMaster?.matched && trace.pipingClassMaster?.reason) reasons.push(`PC:${trace.pipingClassMaster.reason}`);
      if (trace.pipingClassMaster?.warnMat)  reasons.push(trace.pipingClassMaster.warnMat);
      if (trace.pipingClassMaster?.warnWall) reasons.push(trace.pipingClassMaster.warnWall);
      if (!trace.ca6?.applied && trace.ca6?.reason) reasons.push(`CA6:${trace.ca6.reason}`);
      if (!trace.ca7?.applied && trace.ca7?.reason) reasons.push(`CA7:${trace.ca7.reason}`);
      if (!trace.ca8?.applied && trace.ca8?.reason) reasons.push(`CA8:${trace.ca8.reason}`);
      const reason = reasons.length ? reasons.join(' | ') : 'ok';
      if (reasons.length) failedRows++;

      _mastersLog('match', `${c.refNo || c.type} [${c.bore}nb]`, {
        reason,
        lineNoKey:   c.lineNoKey   || '—',
        pipingClass: c.pipingClass || '—',
        rating:      c.rating      || '—',
        ca1: c.ca1 || '—', ca2: c.ca2 || '—', ca3: c.ca3 || '—', ca4: c.ca4 || '—',
        ca5: c.ca5 || '—', ca6: c.ca6 || '—', ca7: c.ca7 || '—', ca8: c.ca8 || '—',
        ca10: c.ca10 || '—'
      });
    }

    // ── Status label (right of Masters button) ───────────────────────
    if (statusEl) {
      const allOk = updated > 0;
      statusEl.textContent = updated > 0
        ? `✓ ${updated} updated  ·  LL:${withLineList}  PC:${withPCMaster}`
        : `⚠ 0 enriched`;
      statusEl.style.color = updated > 0 ? '#2ecc71' : '#f59e0b';
      statusEl.style.fontWeight = '600';
    }
    passLog(root, updated > 0 ? `✓ Masters: ${updated} enriched` : `⚠ Masters: no fields enriched`, updated > 0 ? 'success' : 'warn');

    // ── PC master miss summary (prominent, actionable) ───────────────
    if (pcSnap.loaded && withPCMaster === 0 && targets.length > 0) {
      _mastersLog('warn', `⚠ Piping Class Master: 0/${targets.length} components matched — CA3/CA4/CA7 not written`, {
        hint: 'See sample diagnoses below'
      });
      pcMissSamples.forEach((d, i) => {
        _mastersLog('warn', `  PC miss sample ${i + 1}: ${d.searchedClass} bore=${d.searchedBore ?? '?'}`, {
          reason:          d.reason,
          ...(d.sampleClasses   ? { pcMasterSampleClasses: d.sampleClasses } : {}),
          ...(d.pcBoresForClass ? { pcBoresForThisClass:   d.pcBoresForClass } : {}),
          ...(d.hint            ? { hint:                  d.hint } : {}),
        });
      });
    } else if (pcSnap.loaded && withPCMaster > 0 && withPCMaster < targets.length) {
      const missed = targets.length - withPCMaster;
      _mastersLog('warn', `⚠ Piping Class Master: ${missed} components had no match`, {
        matched: withPCMaster, missed,
        ...(pcMissSamples.length ? { firstMiss: pcMissSamples[0] } : {})
      });
    }

    const linelistMissReason = withLineList === 0 && targets.length > 0
      ? (dataManager.getLinelist().length === 0
          ? 'no linelist data loaded'
          : noLineno === targets.length
              ? 'all components missing lineNoKey — run Pipeline Ref first'
              : 'lineNoKey values did not match any linelist row — check Line Ref column mapping')
      : null;
    _mastersLog(updated > 0 ? 'info' : 'warn',
      `${updated > 0 ? '✅' : '⚠'} Masters complete — ${updated}/${targets.length} updated`, {
      linelistHits: withLineList, pcMasterHits: withPCMaster,
      withRating, ca6Applied: withCA6, ca7Applied: withCA7,
      noLineNoKey: noLineno,
      ...(linelistMissReason ? { linelistMissReason } : {}),
      failedRows
    });
    switchSubTab(root, 'masterslog');
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `✕ ${err.message}`;
      statusEl.style.color = '#ef4444';
      statusEl.style.fontWeight = '600';
    }
    passLog(root, `✕ Masters: ${err.message}`, 'error');
    _mastersLog('error', `❌ ${err.message}`);
    switchSubTab(root, 'masterslog');
  }
}

function _norm(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function maybeEditApproxMastersRows(components) {
  const pcRows = dataManager.getPipingClassMaster?.() || [];
  const pcClasses = pcRows.map(r =>
    String(r?.['Piping Class'] || r?.piping_class || r?.PipingClass || '').trim()
  ).filter(Boolean);
  const findApproxClass = (pipingClass) => {
    const target = _norm(pipingClass);
    if (!target) return '';
    for (const cls of pcClasses) {
      const clsNorm = _norm(cls);
      if (!clsNorm || clsNorm === target) continue;
      if (target.startsWith(clsNorm) || clsNorm.startsWith(target)) return cls;
    }
    return '';
  };
  const rows = (components || []).filter(c => {
    const t = c?._mastersMeta?.pipingClassMaster;
    if (t?.approximate || (t?.rowClass && _norm(t.rowClass) !== _norm(c.pipingClass))) return true;
    const approxClass = findApproxClass(c?.pipingClass);
    if (!approxClass) return false;
    c._mastersMeta = c._mastersMeta || {};
    c._mastersMeta.pipingClassMaster = c._mastersMeta.pipingClassMaster || {};
    c._mastersMeta.pipingClassMaster.approximate = true;
    c._mastersMeta.pipingClassMaster.rowClass = c._mastersMeta.pipingClassMaster.rowClass || approxClass;
    return true;
  });
  if (!rows.length) return;

  const pickFirstNonEmpty = (items, read) => {
    for (const item of items) {
      const val = String(read(item) ?? '').trim();
      if (val) return val;
    }
    return '';
  };

  const groupMap = new Map();
  for (const row of rows) {
    const pipingClass = String(row?.pipingClass || '').trim();
    const matchedClass = String(row?._mastersMeta?.pipingClassMaster?.rowClass || '').trim()
      || findApproxClass(pipingClass);
    const effectiveClass = pipingClass || matchedClass;
    const size = String(row?.bore ?? '').trim();
    const key = `${_norm(effectiveClass)}|${size}`;
    if (!groupMap.has(key)) groupMap.set(key, { pipingClass: effectiveClass, matchedClass, size, rows: [] });
    groupMap.get(key).rows.push(row);
  }

  const groups = [...groupMap.values()].map(group => ({
    ...group,
    matchedClass: group.matchedClass || pickFirstNonEmpty(group.rows, r => r?._mastersMeta?.pipingClassMaster?.rowClass),
    pipingClass: group.pipingClass || pickFirstNonEmpty(group.rows, r => r?.pipingClass) || group.matchedClass || '',
    rating: pickFirstNonEmpty(group.rows, r => r?.rating),
    ca3: pickFirstNonEmpty(group.rows, r => r?.ca3),
    ca4: pickFirstNonEmpty(group.rows, r => r?.ca4),
    ca7: pickFirstNonEmpty(group.rows, r => r?.ca7)
  }));

  await new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem';
    const panel = document.createElement('div');
    panel.style.cssText = 'width:min(1100px,95vw);max-height:85vh;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-1);border:1px solid var(--steel);border-radius:8px;padding:10px;color:var(--text-primary);font-family:var(--font-code)';
    const iconBtn = 'display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid var(--steel);border-radius:4px;background:var(--bg-0);cursor:pointer';
    const header = `<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px\">
      <div><b>Approximate Masters Matches (${groups.length} groups)</b><span style=\"font-size:0.75rem;color:var(--text-muted);margin-left:8px\">${rows.length} rows • grouped by Piping Class + Size</span></div>
    </div>`;
    const th = 'padding:4px 6px;border:1px solid var(--steel);background:var(--bg-panel);position:sticky;top:0';
    const td = 'padding:2px 4px;border:1px solid rgba(255,255,255,0.08)';
    panel.innerHTML = `<div style=\"flex:1;overflow:auto;min-height:0\">${header}<table style=\"width:100%;border-collapse:collapse;font-size:0.72rem\"><thead><tr><th style=\"${th}\">Piping Class</th><th style=\"${th}\">Size</th><th style=\"${th}\">Matched Class</th><th style=\"${th}\">Rows</th><th style=\"${th}\">Rating</th><th style=\"${th}\">CA3</th><th style=\"${th}\">CA4</th><th style=\"${th}\">CA7</th></tr></thead><tbody>${
      groups.map((g, i) => `<tr>
        <td style="${td}"><input data-g="${i}" data-k="pipingClass" value="${escapeHtml(g.pipingClass || '')}" style="width:160px"></td>
        <td style="${td}">${escapeHtml(g.size || '')}</td>
        <td style="${td}">${escapeHtml(g.matchedClass || '')}</td>
        <td style="${td}">${g.rows.length}</td>
        <td style="${td}"><input data-g="${i}" data-k="rating" value="${escapeHtml(g.rating || '')}" style="width:90px"></td>
        <td style="${td}"><input data-g="${i}" data-k="ca3" value="${escapeHtml(g.ca3 || '')}" style="width:90px"></td>
        <td style="${td}"><input data-g="${i}" data-k="ca4" value="${escapeHtml(g.ca4 || '')}" style="width:90px"></td>
        <td style="${td}"><input data-g="${i}" data-k="ca7" value="${escapeHtml(g.ca7 || '')}" style="width:90px"></td>
      </tr>`).join('')
    }</tbody></table>
    <div style=\"font-size:0.72rem;color:var(--text-muted);margin-top:8px\">Save applies each group edit to all rows in that Piping Class + Size group.</div></div>
    <div style=\"display:flex;justify-content:flex-end;gap:8px;padding-top:8px;margin-top:8px;border-top:1px solid var(--steel);background:var(--bg-1)\">
      <button id=\"rc-approx-close-footer\" style=\"${iconBtn}\">
        <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg>
        Close
      </button>
      <button id=\"rc-approx-save-footer\" style=\"${iconBtn};background:var(--amber);border:none;color:#000\">
        <svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z\"/><polyline points=\"17 21 17 13 7 13 7 21\"/><polyline points=\"7 3 7 8 15 8\"/></svg>
        Save
      </button>
    </div>`;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); resolve(); };
    const save = () => {
      panel.querySelectorAll('input[data-g][data-k]').forEach(inp => {
        const i = Number(inp.dataset.g);
        const k = inp.dataset.k;
        if (!groups[i]) return;
        groups[i][k] = inp.value.trim();
      });
      groups.forEach(g => {
        const classToApply = String(g.pipingClass || g.matchedClass || '').trim();
        for (const row of g.rows) {
          row.pipingClass = classToApply;
          row.rating = g.rating;
          row.ca3 = g.ca3;
          row.ca4 = g.ca4;
          row.ca7 = g.ca7;
        }
      });
      close();
    };
    panel.querySelector('#rc-approx-close-footer').onclick = close;
    panel.querySelector('#rc-approx-save-footer').onclick = save;
  });
}

async function runPipelineLookup(root) {
  // Operate on finalComponents if available (post-S3), else fall back to components
  const targets = rcState.finalComponents.length ? rcState.finalComponents : rcState.components;
  if (!targets.length) return;
  const usingFinal = rcState.finalComponents.length > 0;

  const statusEl = root.querySelector('#rc-masters-status');
  if (statusEl) statusEl.textContent = '⏳ Matching…';

  _refreshPcActiveTable(targets);

  try {
    const cfg = getConfig();
    const pcLogic  = cfg?.smartData?.pipingClassLogic || {};

    const elevOffset = parseFloat(cfg?.smartData?.e3dElevationOffset ?? 0) || 0;
    // Probe the Line Dump header map so user can verify column detection
    const { dataManager: dm } = await import('../services/data-manager.js');
    const hm = dm.headerMap?.linedump || {};
    const sampleLD = dm.getLineDump()?.[0] || {};
    const UP_AL = ['Up','U','UP','up','Elevation','ELEV','Z','z'];
    const POS_AL = ['Position','position','POSITION','Pos','pos','Coordinate','Coord'];
    const resolvedZ = hm.z
      ? (sampleLD[hm.z] != null ? `'${hm.z}'` : `'${hm.z}'(missing)`)
      : UP_AL.find(a => sampleLD[a] != null)
          ? `auto:'${UP_AL.find(a => sampleLD[a] != null)}'`
          : POS_AL.find(a => sampleLD[a] != null)
              ? `packed-position:'${POS_AL.find(a => sampleLD[a] != null)}'`
              : '⚠ no Up col found';
    _mastersLog('info', `📍 Pipeline lookup started (${usingFinal ? 'Final CSV' : '2D CSV'})`, {
      components: targets.length,
      lineDumpRows: dm.getLineDump()?.length ?? 0,
      tolerance: '±25mm (segment)',
      elevOffset: elevOffset ? `+${elevOffset}mm to Up` : '0 (disabled)',
      coordSource: resolvedZ,
      delimiter: pcLogic.tokenDelimiter || '-',
      segment: typeof pcLogic.tokenIndex === 'number' ? pcLogic.tokenIndex + 1 : 5
    });

    const { updated, noLineDump, detail, coordError, hint } = lookupPipelineRefs(targets, cfg);

    if (noLineDump) {
      if (statusEl) statusEl.textContent = '⚠ No Line Dump loaded';
      passLog(root, `⚠ Line Dump empty`, 'warn');
      _mastersLog('warn', '⚠ Line Dump from E3D is empty — load it in Master Data first');
      switchSubTab(root, 'masterslog');
      return;
    }

    if (coordError) {
      if (statusEl) statusEl.textContent = '⚠ Line Dump column error';
      passLog(root, `✕ ${hint}`, 'error');
      _mastersLog('error', '❌ Line Dump coordinate columns not resolved', { hint });
      switchSubTab(root, 'masterslog');
      return;
    }

    // Rebuild the appropriate CSV and re-render the preview
    if (usingFinal) {
      rcState.finalCsv2DText = emit2DCSV(rcState.finalComponents, getRayConfig());
      render2DTable(root, rcState.finalCsv2DText, rcState.finalComponents);
      activatePreviewBtn(root, 'final2dcsv');
    } else {
      _rebuildCsv2D();
      render2DTable(root, rcState.csv2DText, rcState.components);
      activatePreviewBtn(root, '2dcsv');
    }

    if (statusEl) statusEl.textContent = `✓ Pipeline matched ${updated}/${targets.length}`;
    passLog(root, `✓ Pipeline: ${updated}/${targets.length} matched`, 'success');
    _mastersLog('info', `✅ Pipeline lookup complete — ${updated}/${targets.length} matched`);

    // Per-component detail log
    let matched = 0, skipped = 0;
    for (const entry of detail) {
      const { type: logType, label, details } = formatDetailForLog(entry);
      _mastersLog(logType, label, details);
      if (logType === 'match') matched++; else skipped++;
    }
    if (skipped > 0) _mastersLog('warn', `${skipped} components had no Line Dump match`, { matched, skipped, total: targets.length });

    // Auto-switch to Masters Log sub-tab so user sees results
    switchSubTab(root, 'masterslog');

  } catch (err) {
    if (statusEl) statusEl.textContent = `✕ ${err.message}`;
    passLog(root, `✕ Pipeline: ${err.message}`, 'error');
    _mastersLog('error', `❌ ${err.message}`);
  }
}

// Derive PIPING CLASS and LINENO KEY from PIPELINE-REFERENCE for Final 2D CSV rows.
// Only blank cells are populated; existing values are preserved.
function runDeriveLineNoKey(root) {
  if (!rcState.finalComponents.length && rcState.finalCsv2DText.trim()) {
    rcState.finalComponents = _rowsFromCsvText(rcState.finalCsv2DText).map(_mastersRowFromCsv);
  }
  const rows = rcState.finalComponents;
  if (!rows.length) {
    passLog(root, `⚠ Final 2D CSV not ready (run S3 first)`, 'warn');
    return;
  }

  const statusEl = root.querySelector('#rc-masters-status');
  const cfg = getConfig();
  const lineLogic = cfg?.smartData?.lineNoKeyLogic || cfg?.smartData?.lineNoLogic || {};
  const classLogic = cfg?.smartData?.pipingClassLogic || {};

  const deriveFromPipelineRef = (pipelineRef, logic, fallbackIndex) => {
    const rawRef = String(pipelineRef || '').trim();
    if (!rawRef) return '';
    const normalizedRef = rawRef.replace(/^[\/\\]+/, '');

    if (logic?.strategy === 'regex' && logic?.regexPattern) {
      try {
        const re = new RegExp(logic.regexPattern);
        const grp = Number(logic.regexGroup ?? 1);
        const rawMatch = rawRef.match(re);
        if (rawMatch?.[grp]) return String(rawMatch[grp]).trim();
        const normalizedMatch = normalizedRef.match(re);
        if (normalizedMatch?.[grp]) return String(normalizedMatch[grp]).trim();
      } catch {}
    }

    const tokenDelimiter = String(logic?.tokenDelimiter || '-');
    const tokenIndex = Number.isInteger(Number(logic?.tokenIndex))
      ? Number(logic.tokenIndex)
      : fallbackIndex;

    const splitByConfiguredDelimiter = normalizedRef
      .split(tokenDelimiter)
      .map(v => v.trim())
      .filter(Boolean);
    if (tokenIndex >= 0 && splitByConfiguredDelimiter[tokenIndex]) {
      return splitByConfiguredDelimiter[tokenIndex];
    }

    const splitByGenericDelimiters = normalizedRef
      .replace(/[\u201C\u201D\u2033\u02BA\u2036\u2018\u2019]/g, '"')
      .split(/[-/\\"]+/)
      .map(v => v.trim())
      .filter(Boolean);
    if (tokenIndex >= 0 && splitByGenericDelimiters[tokenIndex]) {
      return splitByGenericDelimiters[tokenIndex];
    }

    return splitByGenericDelimiters.at(-1) || splitByConfiguredDelimiter.at(-1) || '';
  };

  let updatedLineNo = 0;
  let updatedPipingClass = 0;
  for (const row of rows) {
    const pipelineRef = String(row.pipelineRef || '').trim();
    if (!pipelineRef) continue;

    if (!String(row.pipingClass || '').trim()) {
      const derivedClass = deriveFromPipelineRef(pipelineRef, classLogic, 4);
      if (derivedClass) {
        row.pipingClass = derivedClass;
        updatedPipingClass++;
      }
    }

    if (!String(row.lineNoKey || '').trim()) {
      const derivedLine = deriveFromPipelineRef(pipelineRef, lineLogic, 3);
      if (derivedLine) {
        row.lineNoKey = derivedLine;
        updatedLineNo++;
      }
    }
  }

  rcState.finalCsv2DText = emit2DCSV(rcState.finalComponents, getRayConfig());
  render2DTable(root, rcState.finalCsv2DText, rcState.finalComponents);
  activatePreviewBtn(root, 'final2dcsv');

  const totalUpdated = updatedLineNo + updatedPipingClass;
  if (statusEl) {
    statusEl.textContent = totalUpdated > 0
      ? `✓ Line:${updatedLineNo} Class:${updatedPipingClass}`
      : `⚠ Line:0 Class:0`;
  }

  passLog(
    root,
    totalUpdated > 0
      ? `✓ LineNoKey:${updatedLineNo}, PipingClass:${updatedPipingClass} derived`
      : `⚠ No blank LineNoKey/PipingClass values derived`,
    totalUpdated > 0 ? 'success' : 'warn'
  );
  _mastersLog(
    totalUpdated > 0 ? 'info' : 'warn',
    totalUpdated > 0
      ? `✅ Derive complete — LineNoKey:${updatedLineNo}, PipingClass:${updatedPipingClass}`
      : `⚠ Derive found no blank targets or no derivable pipeline refs`
  );
}

async function runAll(root) {
  clearLog();
  passLog(root, `── RUN ALL  ${_now()} ────────`, 'header');
  await runS1(root);
  if (rcState.stageStatus.s1 !== 'done') return;
  await runS2(root);
  if (rcState.stageStatus.s2 !== 'done') return;
  await runS3(root);
  if (rcState.stageStatus.s3 !== 'done') return;

  // Enrich: Pipeline Ref → Masters → then propagate to ISOPCF CSV
  passLog(root, `── Enrich: Pipeline Ref ────`, 'header');
  await runPipelineLookup(root);
  passLog(root, `── Enrich: Masters ─────────`, 'header');
  await runLoadMasters(root);

  await runS4(root);
  passLog(root, '', 'divider');
  passLog(root, `✓ Pipeline complete`, 'success');
  passLog(root, `  S1→S2→S3→PipelineRef→Masters→S4 done`, 'stat');

  // Focus the Pipeline tab (not Debug)
  switchSubTab(root, 'pipeline');
}

// ── RayConfig UI ──────────────────────────────────────────────────────────────
const CONFIG_FIELDS = [
  { key: 'gapFillTolerance',  label: 'Gap Fill Tolerance (mm)', type: 'number', step: '0.1' },
  { key: 'rayMaxDistance',    label: 'Ray Max Distance (mm)',   type: 'number' },
  { key: 'boreTolMultiplier', label: 'Bore Tol. Multiplier',   type: 'number', step: '0.05' },
  { key: 'minBoreTol',        label: 'Min Bore Tol (mm)',      type: 'number' },
  { key: 'deadZoneMin',       label: 'Dead Zone Min (mm)',     type: 'number', step: '0.1' },
  { key: 'stubPipeLength',    label: 'Stub Pipe Length (mm)',  type: 'number', step: '0.1' },
  { key: 'decimalPrecision',  label: 'Decimal Precision',      type: 'number', min: '1', max: '8' },
  { key: 'supportName',       label: 'Support Name',           type: 'text' },
  { key: 'pipelineRefPrefix',  label: 'Pipeline Ref Prefix',         type: 'text' },
  { key: 'defaultPipingClass', label: 'Default Piping Class (2D CSV)', type: 'text' },
  { key: 'enableBoreInchToMm', label: 'Enable Bore Inch→MM', type: 'checkbox' },
  { key: 'axisSnapAngle',     label: 'Axis Snap Angle (°)',    type: 'number', step: '0.5' },
  { key: 'sixAxP1Diameter',   label: '6Ax P1 Diameter (mm)',  type: 'number', step: '1' },
  { key: 'sixAxP1MaxDist',    label: '6Ax P1 Max Dist (mm)',  type: 'number' },
  { key: 'sixAxP2Diameter',   label: '6Ax P2 Diameter (mm)',  type: 'number', step: '1' },
  { key: 'sixAxP2DiamREDU',   label: '6Ax P2 Diam REDU (mm)',type: 'number', step: '1' },
  { key: 'sixAxP2MaxDist',    label: '6Ax P2 Max Dist (mm)',  type: 'number' }
];

function buildConfigGrid(root) {
  const cfg = getRayConfig();
  const grid = root.querySelector('#rc-config-grid');
  if (!grid) return;
  grid.innerHTML = CONFIG_FIELDS.map(f => `
    <label style="display:flex;flex-direction:column;gap:2px;font-size:0.7rem;color:var(--text-muted)">
      ${f.label}
      <input data-cfg="${f.key}" type="${f.type}"
        ${f.step ? `step="${f.step}"` : ''}
        ${f.min !== undefined ? `min="${f.min}"` : ''}
        ${f.max !== undefined ? `max="${f.max}"` : ''}
        ${f.type === 'checkbox' ? ` ${cfg[f.key] ? 'checked' : ''}` : ` value="${cfg[f.key] ?? ''}"`}
        style="font-size:0.72rem;background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:2px 5px">
    </label>`).join('');

  // Support mapping section
  const smPrefixEl = root.querySelector('[data-cfg="supportMapping.guidPrefix"]');
  if (smPrefixEl) smPrefixEl.value = cfg.supportMapping.guidPrefix ?? 'UCI:';
  const smFallbackEl = root.querySelector('#rc-cfg-fallback-name');
  if (smFallbackEl) smFallbackEl.value = cfg.supportMapping.fallbackName ?? 'RST';
  const smTbody = root.querySelector('#rc-cfg-sm-blocks');
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (smTbody) {
    smTbody.innerHTML = cfg.supportMapping.blocks.map(b => `
      <tr>
        <td style="padding:2px 6px;border:1px solid var(--steel);color:var(--text-primary)">
          <input data-cfg-block="${b.id}" data-cfg-block-field="label" type="text" value="${esc(b.label || `Block ${b.id}`)}"
            style="width:100%;font-size:0.68rem;background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:1px 4px">
        </td>
        <td style="padding:2px 6px;border:1px solid var(--steel);color:var(--text-primary)">
          <input data-cfg-block="${b.id}" data-cfg-block-field="frictionMatch" type="text" value="${esc((b.frictionMatch || []).join(' / '))}"
            style="width:100%;font-size:0.68rem;background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:1px 4px">
        </td>
        <td style="padding:2px 6px;border:1px solid var(--steel);color:var(--text-primary)">
          <input data-cfg-block="${b.id}" data-cfg-block-field="gapCondition" type="text" value="${esc(b.gapCondition || 'any')}"
            style="width:100%;font-size:0.68rem;background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:1px 4px">
        </td>
        <td style="padding:2px 6px;border:1px solid var(--steel);color:var(--amber);font-weight:600">
          <input data-cfg-block="${b.id}" data-cfg-block-field="name" type="text" value="${esc(b.name)}"
            style="width:100%;font-size:0.68rem;background:var(--bg-0);color:var(--amber);border:1px solid var(--steel);border-radius:3px;padding:1px 4px">
        </td>
        <td style="padding:2px 6px;border:1px solid var(--steel);color:var(--text-primary)">
          <input data-cfg-block="${b.id}" data-cfg-block-field="desc" type="text" value="${esc(b.desc || '')}"
            style="width:100%;font-size:0.68rem;background:var(--bg-0);color:var(--text-muted);border:1px solid var(--steel);border-radius:3px;padding:1px 4px">
        </td>
      </tr>`).join('');
  }

  root.querySelector('#rc-btn-sm-add-block')?.addEventListener('click', () => {
    const cfgLive = getRayConfig();
    const maxId = Math.max(0, ...(cfgLive.supportMapping?.blocks || []).map(b => Number.parseInt(b.id, 10) || 0));
    cfgLive.supportMapping.blocks.push({
      id: maxId + 1,
      label: `Block ${maxId + 1}`,
      frictionMatch: [''],
      gapCondition: 'any',
      name: cfgLive.supportMapping.fallbackName || 'CA150',
      desc: 'Custom block'
    });
    buildConfigGrid(root);
  });
}

function toggleConfig(root) {
  const panel = root.querySelector('#rc-config-panel');
  const btn   = root.querySelector('#rc-btn-config-toggle');
  const open  = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  btn.textContent = open ? '⚙ RayConfig ▲' : '⚙ RayConfig ▼';
  if (open) buildConfigGrid(root);
}

function applyConfig(root) {
  const patch = {};
  root.querySelectorAll('[data-cfg]').forEach(el => {
    const k = el.dataset.cfg;
    if (k.includes('.')) return; // handled separately below
    const v = el.type === 'number' ? parseFloat(el.value) : (el.type === 'checkbox' ? Boolean(el.checked) : el.value);
    if (!isNaN(v) || typeof v === 'string') patch[k] = v;
  });
  setRayConfig(patch);

  // Support mapping sub-fields
  const cfg = getRayConfig();
  const smPrefixEl = root.querySelector('[data-cfg="supportMapping.guidPrefix"]');
  if (smPrefixEl) cfg.supportMapping.guidPrefix = smPrefixEl.value || 'UCI:';
  const smFallbackEl = root.querySelector('#rc-cfg-fallback-name');
  if (smFallbackEl) cfg.supportMapping.fallbackName = smFallbackEl.value || 'RST';
  root.querySelectorAll('[data-cfg-block]').forEach(el => {
    const id = parseInt(el.dataset.cfgBlock, 10);
    const field = el.dataset.cfgBlockField;
    const block = cfg.supportMapping.blocks.find(b => b.id === id);
    if (!block || !field) return;
    const raw = String(el.value ?? '').trim();
    if (field === 'frictionMatch') {
      const tokens = raw.split('/').map(v => v.trim());
      block.frictionMatch = tokens.length ? tokens : [''];
      return;
    }
    if (field === 'gapCondition') {
      block.gapCondition = raw || 'any';
      return;
    }
    block[field] = raw || block[field];
  });

  passLog(root, `✓ Config applied`, 'info');
}

function resetConfig(root) {
  resetRayConfig();
  buildConfigGrid(root);
  passLog(root, `  Config reset`, 'stat');
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function passLog(root, msg, type = 'default') {
  const el = root.querySelector('#rc-pass-log');
  if (!el) return;
  if (el.querySelector('span')) el.innerHTML = '';
  const line = document.createElement('div');
  const styles = {
    header:  'color:#f59e0b;font-weight:700;margin-top:5px;font-size:0.63rem;letter-spacing:0.03em',
    stat:    'color:#64748b;padding-left:8px;font-size:0.62rem',
    success: 'color:#22c55e;font-weight:600',
    error:   'color:#ef4444;font-weight:600',
    warn:    'color:#fb923c',
    info:    'color:#38bdf8',
    divider: 'border-top:1px solid #1c2e20;margin:5px 0 2px;height:0;padding:0',
    default: 'color:#4ade80',
  };
  line.style.cssText = styles[type] || styles.default;
  if (type !== 'divider') line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}
function _now() {
  return new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function setBtn(root, sel, enabled) {
  const btn = root.querySelector(sel);
  if (btn) btn.disabled = !enabled;
}

function showPreview(root, containerId, text) {
  const el = root.querySelector(`#${containerId}`);
  if (!el) return;
  el.style.whiteSpace = 'pre';
  el.textContent = text;
}

const EDITABLE_2D_COLS = new Set(['PIPELINE-REFERENCE', 'PIPING CLASS', 'RATING', 'LINENO KEY',
  'CA1 (Des Pr.)', 'CA2 (Des Temp.)', 'CA3 (Material)', 'CA4 (Wall Thk.)',
  'CA5 (Ins Thk.)', 'CA6 (Ins Den.)', 'CA7 (Corr. Allow.)', 'CA8 (Comp Wt.)',
  'CA9 (Fluid Den.)', 'CA10 (Hydro Pr.)']);
const FILL_DOWN_2D_COLS = new Set(['PIPELINE-REFERENCE', 'LINENO KEY', 'PIPING CLASS', 'RATING',
  'CA1 (Des Pr.)', 'CA2 (Des Temp.)', 'CA3 (Material)', 'CA4 (Wall Thk.)',
  'CA5 (Ins Thk.)', 'CA6 (Ins Den.)', 'CA7 (Corr. Allow.)', 'CA8 (Comp Wt.)',
  'CA9 (Fluid Den.)', 'CA10 (Hydro Pr.)']);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _sync2DCsvOutputs() {
  const cfg = getRayConfig();
  if (rcState.components.length) {
    rcState.csv2DText = emit2DCSV(rcState.components, cfg);
  }
  if (rcState.finalComponents.length) {
    rcState.finalCsv2DText = emit2DCSV(rcState.finalComponents, cfg);
  }
}

function _rowsFromCsvText(csvText) {
  const lines = String(csvText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2 || !lines[0].includes(',')) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

function _mastersRowFromCsv(row) {
  return {
    refNo: row['REF NO.'] || '',
    type: row.Type || '',
    bore: row.BORE || '',
    lineNoKey: row['LINENO KEY'] || '',
    pipingClass: row['PIPING CLASS'] || '',
    rating: row.RATING || '',
    ca1: row['CA1 (Des Pr.)'] || '', ca2: row['CA2 (Des Temp.)'] || '', ca3: row['CA3 (Material)'] || '',
    ca4: row['CA4 (Wall Thk.)'] || '', ca5: row['CA5 (Ins Thk.)'] || '', ca6: row['CA6 (Ins Den.)'] || '',
    ca7: row['CA7 (Corr. Allow.)'] || '', ca8: row['CA8 (Comp Wt.)'] || '', ca10: row['CA10 (Hydro Pr.)'] || '',
    pipelineRef: row['PIPELINE-REFERENCE'] || ''
  };
}

function ensure2DTableStyles() {
  if (document.getElementById('rc-2d-table-styles')) return;
  const style = document.createElement('style');
  style.id = 'rc-2d-table-styles';
  style.textContent = `
    .cell-edited { border-bottom: 2px solid var(--amber) !important; }
    .fill-down-applied { background-color: rgba(245, 158, 11, 0.12) !important; }
    .rc-fill-down-btn:hover { opacity: 0.8; }
  `;
  document.head.appendChild(style);
}

function render2DTable(root, csvText, sourceRows = rcState.components) {
  const el = root.querySelector('#rc-preview-area');
  if (!el) return;
  const isFinal2DCsv = sourceRows === rcState.finalComponents;
  ensure2DTableStyles();
  if (!csvText) { el.style.whiteSpace = 'pre'; el.textContent = '(not yet generated)'; return; }
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) { el.style.whiteSpace = 'pre'; el.textContent = csvText; return; }
  const headers = lines[0].split(',');
  const rows    = lines.slice(1).map(l => l.split(','));
  const thStyle = `style="background:var(--bg-panel);color:var(--amber);padding:3px 8px;border:1px solid var(--steel);position:sticky;top:0;z-index:1;white-space:nowrap;font-size:0.65rem;font-family:var(--font-code)"`;
  const tdBase  = `padding:2px 6px;border:1px solid rgba(255,255,255,0.06);font-size:0.65rem;white-space:nowrap;font-family:var(--font-code)`;
  const tdStyle = (i, editable) => `style="${tdBase};${i%2?'background:rgba(255,255,255,0.02)':''}${editable?';padding:0;':''}"`;
  const inputStyle = `background:transparent;border:none;border-bottom:1px solid var(--amber);color:inherit;font-family:inherit;font-size:inherit;padding:2px 6px;width:100%;min-width:80px`;

  const thead = `<tr>${headers.map(h => {
    if (!FILL_DOWN_2D_COLS.has(h)) return `<th ${thStyle}>${h}</th>`;
    return `<th ${thStyle}><div style="display:flex;flex-direction:column;gap:3px;align-items:flex-start">
      <span>${h}</span>
      <button type="button" class="rc-fill-down-btn" data-col="${escapeHtml(h)}"
        style="align-self:flex-start;cursor:pointer;background:var(--amber);color:#000;border:none;border-radius:3px;padding:1px 5px;font-size:0.62rem;font-weight:700;line-height:1.4"
        title="Fill Down: copies the focused or first non-empty value downward into blank cells">↓ Fill</button>
    </div></th>`;
  }).join('')}</tr>`;
  const tbody = rows.map((r, ri) => {
    const comp = sourceRows[ri] || {};
    return `<tr>${headers.map((h, ci) => {
      const val = r[ci] ?? '';
      if (h === 'CA8 (Comp Wt.)' && Array.isArray(comp.ca8Options) && comp.ca8Options.length) {
        const current = String(comp.ca8 ?? val ?? '').trim();
        const options = comp.ca8Options
          .slice()
          .sort((a, b) => Number(a.weight) - Number(b.weight))
          .map(opt => {
            const weight = String(opt.weight ?? '').trim();
            const desc = String(opt.description ?? opt.type ?? '').trim();
            return `<option value="${escapeHtml(weight)}" ${current === weight ? 'selected' : ''}>${escapeHtml(`${weight} | ${desc}`)}</option>`;
          }).join('');
        return `<td ${tdStyle(ri, true)}><select data-row="${ri}" data-col="${ci}" data-col-name="${escapeHtml(h)}" style="${inputStyle};min-width:240px;width:240px;white-space:nowrap;font-family:var(--font-code)"><option value="" ${current === '' ? 'selected' : ''}>Select weight...</option>${options}</select></td>`;
      }
      if (EDITABLE_2D_COLS.has(h)) {
        return `<td ${tdStyle(ri, true)}><input type="text" value="${escapeHtml(val)}" data-row="${ri}" data-col="${ci}" data-col-name="${escapeHtml(h)}" style="${inputStyle}"></td>`;
      }
      return `<td ${tdStyle(ri, false)}>${val}</td>`;
    }).join('')}</tr>`;
  }).join('');

  el.style.whiteSpace = 'normal';
  el.innerHTML = `<table style="border-collapse:collapse"><thead>${thead}</thead><tbody id="rc-2d-tbody">${tbody}</tbody></table>`;

  // ── Excel-like auto-filter ────────────────────────────────────────────────
  const tbody2DEl = el.querySelector('#rc-2d-tbody');
  const columnFilters = {};

  const applyFilters2D = () => {
    const hasFilters = Object.keys(columnFilters).length > 0;
    tbody2DEl.querySelectorAll('tr').forEach(tr => {
      if (!hasFilters) { tr.style.display = ''; return; }
      const cells = tr.querySelectorAll('td');
      const show = Object.entries(columnFilters).every(([ci, allowed]) => {
        const cell = cells[Number(ci)];
        if (!cell) return true;
        const cellText = (cell.querySelector('input,select')?.value ?? cell.textContent ?? '').trim();
        return allowed.has(cellText);
      });
      tr.style.display = show ? '' : 'none';
    });
  };

  const openFilter2D = (colIdx, anchorEl) => {
    document.querySelectorAll('.rc-af-panel').forEach(p => p.remove());
    const allCellVals = [...tbody2DEl.querySelectorAll('tr')].map(tr => {
      const cell = tr.querySelectorAll('td')[colIdx];
      return (cell?.querySelector('input,select')?.value ?? cell?.textContent ?? '').trim();
    });
    const uniqueVals = [...new Set(allCellVals)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const active = columnFilters[colIdx];

    const panel = document.createElement('div');
    panel.className = 'rc-af-panel';
    panel.style.cssText = 'position:absolute;z-index:9999;background:#1e2533;border:1px solid #3a4460;border-radius:6px;padding:8px;min-width:180px;max-height:320px;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.5);font-size:0.75rem;color:#cdd6f4;';

    // Sort row
    const sortRow = document.createElement('div');
    sortRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;';
    ['A→Z', 'Z→A'].forEach((label, asc) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = 'flex:1;padding:2px 4px;background:#313552;border:1px solid #3a4460;border-radius:4px;cursor:pointer;color:#cdd6f4;font-size:0.7rem;';
      btn.onclick = () => {
        const trs = [...tbody2DEl.querySelectorAll('tr')];
        trs.sort((a, b) => {
          const av = (a.querySelectorAll('td')[colIdx]?.querySelector('input,select')?.value ?? a.querySelectorAll('td')[colIdx]?.textContent ?? '').trim();
          const bv = (b.querySelectorAll('td')[colIdx]?.querySelector('input,select')?.value ?? b.querySelectorAll('td')[colIdx]?.textContent ?? '').trim();
          return asc === 0 ? av.localeCompare(bv, undefined, { numeric: true }) : bv.localeCompare(av, undefined, { numeric: true });
        });
        trs.forEach(tr => tbody2DEl.appendChild(tr));
        panel.remove();
      };
      sortRow.appendChild(btn);
    });
    panel.appendChild(sortRow);

    // Search
    const searchEl = document.createElement('input');
    searchEl.type = 'text'; searchEl.placeholder = 'Search…';
    searchEl.style.cssText = 'width:100%;box-sizing:border-box;padding:3px 6px;margin-bottom:6px;background:#0f172a;border:1px solid #3a4460;border-radius:4px;color:#cdd6f4;font-size:0.75rem;';
    panel.appendChild(searchEl);

    // Select All / Clear
    const ctrlRow = document.createElement('div');
    ctrlRow.style.cssText = 'display:flex;gap:8px;margin-bottom:4px;';
    const btnAll2 = document.createElement('button'); btnAll2.textContent = 'Select All'; btnAll2.style.cssText = 'font-size:0.68rem;background:none;border:none;color:#89b4fa;cursor:pointer;padding:0;';
    const btnClr2 = document.createElement('button'); btnClr2.textContent = 'Clear'; btnClr2.style.cssText = btnAll2.style.cssText;
    ctrlRow.append(btnAll2, btnClr2);
    panel.appendChild(ctrlRow);

    const listDiv = document.createElement('div');
    listDiv.style.cssText = 'max-height:150px;overflow-y:auto;';
    const renderList2D = (q) => {
      listDiv.innerHTML = '';
      uniqueVals.filter(v => !q || v.toLowerCase().includes(q.toLowerCase())).forEach(val => {
        const lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.value = val;
        cb.checked = !active || active.has(val);
        lbl.append(cb, document.createTextNode(val || '(blank)'));
        listDiv.appendChild(lbl);
      });
    };
    renderList2D('');
    panel.appendChild(listDiv);
    searchEl.addEventListener('input', () => renderList2D(searchEl.value));
    btnAll2.onclick = () => listDiv.querySelectorAll('input').forEach(c => c.checked = true);
    btnClr2.onclick = () => listDiv.querySelectorAll('input').forEach(c => c.checked = false);

    // OK / Cancel
    const btnRow2 = document.createElement('div');
    btnRow2.style.cssText = 'display:flex;gap:4px;margin-top:8px;';
    const btnOk2 = document.createElement('button'); btnOk2.textContent = 'OK';
    btnOk2.style.cssText = 'flex:1;padding:3px;background:#89b4fa;color:#1e2533;border:none;border-radius:4px;cursor:pointer;font-weight:700;';
    const btnCancel2 = document.createElement('button'); btnCancel2.textContent = 'Cancel';
    btnCancel2.style.cssText = 'flex:1;padding:3px;background:#313552;color:#cdd6f4;border:1px solid #3a4460;border-radius:4px;cursor:pointer;';
    btnOk2.onclick = () => {
      const checked = [...listDiv.querySelectorAll('input:checked')].map(c => c.value);
      const unchecked = [...listDiv.querySelectorAll('input:not(:checked)')].map(c => c.value);
      if (unchecked.length === 0) delete columnFilters[colIdx];
      else columnFilters[colIdx] = new Set(checked);
      anchorEl.innerHTML = mkFilterSvg(!!columnFilters[colIdx]);
      anchorEl.style.opacity = '1';
      applyFilters2D();
      panel.remove();
    };
    btnCancel2.onclick = () => panel.remove();
    btnRow2.append(btnOk2, btnCancel2);
    panel.appendChild(btnRow2);

    // Position panel fixed below the anchor button (avoids header overlap)
    document.body.appendChild(panel);
    const rect2D = anchorEl.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.top = (rect2D.bottom + 2) + 'px';
    panel.style.left = rect2D.left + 'px';
    const closeHandler2D = (ev) => {
      if (!panel.contains(ev.target) && ev.target !== anchorEl) { panel.remove(); document.removeEventListener('click', closeHandler2D, true); }
    };
    setTimeout(() => document.addEventListener('click', closeHandler2D, true), 10);
    searchEl.focus();
  };

  // SVG triangle icon for filter buttons
  const mkFilterSvg = (active) => {
    const color = active ? '#89b4fa' : 'currentColor';
    return `<svg width="9" height="7" viewBox="0 0 9 7" fill="${color}" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle"><polygon points="0,0 9,0 4.5,7"/></svg>`;
  };

  // Reset-all-filters button — pinned top-right of the preview area
  const resetAllBtn = document.createElement('button');
  resetAllBtn.type = 'button';
  resetAllBtn.title = 'Clear all column filters';
  resetAllBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="vertical-align:middle;margin-right:3px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Reset Filters`;
  resetAllBtn.style.cssText = 'position:sticky;top:4px;right:0;float:right;z-index:10;cursor:pointer;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:4px;color:#f87171;padding:2px 7px;font-size:0.7rem;line-height:1.5;display:none;margin-bottom:4px;';
  resetAllBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    Object.keys(columnFilters).forEach(k => delete columnFilters[k]);
    el.querySelectorAll('.rc-af-btn').forEach(b => { b.innerHTML = mkFilterSvg(false); b.style.color = ''; });
    applyFilters2D();
    resetAllBtn.style.display = 'none';
  });
  el.insertBefore(resetAllBtn, el.firstChild);

  // Attach filter button to every header cell
  el.querySelectorAll('thead th').forEach((th, ci) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = mkFilterSvg(false);
    btn.className = 'rc-af-btn';
    btn.style.cssText = 'margin-left:4px;cursor:pointer;background:none;border:none;color:var(--text-secondary,#94a3b8);padding:0 2px;vertical-align:middle;opacity:0.6;';
    btn.title = 'Filter / sort column';
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = columnFilters[ci] ? '1' : '0.6'; });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openFilter2D(ci, btn);
    });
    th.appendChild(btn);
  });

  // Patch openFilter2D OK handler to update reset button visibility
  const _origOk = applyFilters2D;
  const updateResetBtn = () => {
    const hasAny = Object.keys(columnFilters).length > 0;
    resetAllBtn.style.display = hasAny ? 'inline-flex' : 'none';
  };
  // Wrap applyFilters2D to also update reset btn
  const origApply = applyFilters2D;
  const applyFilters2DAndReset = () => { origApply(); updateResetBtn(); };
  // Re-wire all filter OK buttons to the wrapped version by overriding applyFilters2D reference
  // (We close over applyFilters2D in openFilter2D already, so patch via re-assign isn't possible.
  // Instead, intercept the DOM mutation: attach a MutationObserver on rc-af-panel removal.)
  const panelObserver = new MutationObserver(() => updateResetBtn());
  panelObserver.observe(document.body, { childList: true, subtree: false });

  if (el._rc2dInputHandler) el.removeEventListener('input', el._rc2dInputHandler);
  if (el._rc2dClickHandler) el.removeEventListener('click', el._rc2dClickHandler);

  const fieldMap = {
    'PIPELINE-REFERENCE':    'pipelineRef',
    'PIPING CLASS':          'pipingClass',
    'RATING':                'rating',
    'LINENO KEY':            'lineNoKey',
    'CA1 (Des Pr.)':         'ca1',
    'CA2 (Des Temp.)':       'ca2',
    'CA3 (Material)':        'ca3',
    'CA4 (Wall Thk.)':       'ca4',
    'CA5 (Ins Thk.)':        'ca5',
    'CA6 (Ins Den.)':        'ca6',
    'CA7 (Corr. Allow.)':    'ca7',
    'CA8 (Comp Wt.)':        'ca8',
    'CA9 (Fluid Den.)':      'ca9',
    'CA10 (Hydro Pr.)':      'ca10',
  };

  const deriveLineNoFromPipelineRef = (pipelineRef) => {
    const rawRef = String(pipelineRef || '').trim();
    if (!rawRef) return '';
    const logic = getConfig()?.smartData?.lineNoLogic || {};
    const normalizedRef = rawRef.replace(/^[\/\\]+/, '');
    const readRegex = (text) => {
      if (!logic.regexPattern) return '';
      try {
        const m = text.match(new RegExp(logic.regexPattern));
        const grp = Number(logic.regexGroup ?? 1);
        return String((m && m[grp]) || '').trim();
      } catch {
        return '';
      }
    };
    if (logic.strategy === 'regex') {
      const regexVal = readRegex(rawRef) || readRegex(normalizedRef);
      if (regexVal) return regexVal;
    }
    const idx = Number(logic.tokenIndex ?? 2);
    const delim = String(logic.tokenDelimiter || '-');
    const splitByCfg = normalizedRef.split(delim).map(s => s.trim()).filter(Boolean);
    if (Number.isInteger(idx) && idx >= 0 && splitByCfg[idx]) return splitByCfg[idx];
    const splitGeneric = normalizedRef
      .replace(/[\u201C\u201D\u2033\u02BA\u2036\u2018\u2019]/g, '"')
      .split(/[-/\\"]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (Number.isInteger(idx) && idx >= 0 && splitGeneric[idx]) return splitGeneric[idx];
    return splitGeneric.at(-1) || splitByCfg.at(-1) || '';
  };

  const inputHandler = (e) => {
    if (!e.target.matches('input[data-row], select[data-row]')) return;
    const ri = +e.target.dataset.row;
    const ci = +e.target.dataset.col;
    const colName = headers[ci];
    const comp = sourceRows[ri];
    if (!comp || !fieldMap[colName]) return;
    const val = e.target.value.trim();
    comp[fieldMap[colName]] = colName === 'RATING'
      ? (val === '' ? '' : (Number.isNaN(Number(val)) ? val : Number(val)))
      : val;
    if (colName === 'CA8 (Comp Wt.)') {
      delete comp.ca8Options;
      comp.ca8Trace = 'selected from CA8 dropdown';
    }
    _sync2DCsvOutputs();
  };

  const clickHandler = (e) => {
    const btn = e.target.closest('.rc-fill-down-btn');
    if (!btn) return;
    const colName = btn.dataset.col;
    const colIdx = headers.indexOf(colName);
    if (colIdx === -1) return;
    const inputs = Array.from(el.querySelectorAll(`input[data-col="${colIdx}"]`));
    if (!inputs.length) return;
    const focused = inputs.find(inp => inp === document.activeElement && inp.value.trim()) || null;
    const sourceInput = focused || inputs.find(inp => inp.value.trim()) || null;
    if (!sourceInput) return;

    const sourceVal = sourceInput.value.trim();
    const sourceRowIdx = Number(sourceInput.dataset.row);
    const lineNoColIdx = headers.indexOf('LINENO KEY');
    let filled = 0;

    if (isFinal2DCsv && colName === 'PIPELINE-REFERENCE' && lineNoColIdx !== -1) {
      const sourceComp = sourceRows[sourceRowIdx];
      const sourceLineNoInput = el.querySelector(`input[data-row="${sourceRowIdx}"][data-col="${lineNoColIdx}"]`);
      const sourceLineNo = String((sourceLineNoInput?.value ?? sourceComp?.lineNoKey) || '').trim();
      if (!sourceLineNo) {
        const derivedSourceLineNo = deriveLineNoFromPipelineRef(sourceVal);
        if (derivedSourceLineNo) {
          if (sourceLineNoInput) sourceLineNoInput.value = derivedSourceLineNo;
          if (sourceComp) sourceComp.lineNoKey = derivedSourceLineNo;
        }
      }
    }

    for (const inp of inputs) {
      const rowIdx = Number(inp.dataset.row);
      if (rowIdx <= sourceRowIdx) continue;
      if (colName !== 'PIPELINE-REFERENCE' && inp.value.trim()) continue;
      inp.value = sourceVal;
      const comp = sourceRows[rowIdx];
      if (comp && fieldMap[colName]) {
        comp[fieldMap[colName]] = colName === 'RATING'
          ? (Number.isNaN(Number(sourceVal)) ? sourceVal : Number(sourceVal))
          : sourceVal;
      }
      if (isFinal2DCsv && colName === 'PIPELINE-REFERENCE' && lineNoColIdx !== -1) {
        const lineNoInput = el.querySelector(`input[data-row="${rowIdx}"][data-col="${lineNoColIdx}"]`);
        const existingLineNo = String((lineNoInput?.value ?? comp?.lineNoKey) || '').trim();
        if (!existingLineNo) {
          const derivedLineNo = deriveLineNoFromPipelineRef(sourceVal);
          if (derivedLineNo) {
            if (lineNoInput) lineNoInput.value = derivedLineNo;
            if (comp) comp.lineNoKey = derivedLineNo;
          }
        }
      }
      inp.classList.add('cell-edited', 'fill-down-applied');
      filled++;
    }

    if (filled > 0) _sync2DCsvOutputs();
  };

  el._rc2dInputHandler = inputHandler;
  el._rc2dClickHandler = clickHandler;
  el.addEventListener('input', inputHandler);
  el.addEventListener('click', clickHandler);
  setBtn(root, '#rc-btn-load-masters', sourceRows.length > 0 || _rowsFromCsvText(csvText).length > 0);
}

function _rebuildCsv2D() {
  _sync2DCsvOutputs();
}

function _buildFinalComponents() {
  const cfg = getRayConfig();
  // Normalise injected bridge pipes into full component-like objects
  const bridges = (rcState.injectedPipes || []).map((p, i) => ({
    type:        'PIPE',
    refNo:       `BRIDGE_${p.fromRefNo || ''}_${p.toRefNo || ''}_${i}`,
    bore:        p.bore,
    branchBore:  null,
    ep1:         p.ep1,
    ep2:         p.ep2,
    cp:          null,
    bp:          null,
    supportCoor: null,
    seqNo:       null,
    skey:        '',
    supportName: '',
    supportGuid: '',
    pipelineRef: p.pipelineRef || '',
    lineNoKey:   '',
    pipingClass: '',
    rating:      '',
    ca1:'', ca2:'', ca3:'', ca4:'', ca5:'',
    ca6:'', ca7:'', ca8:'', ca9:'', ca10:'',
    ca97:        '',
    ca98:        '',
    brlen:       null,
    lenAxis:     []
  }));
  rcState.finalComponents = [...rcState.components, ...bridges];
  rcState.finalCsv2DText  = emit2DCSV(rcState.finalComponents, cfg);
}

function _mapToDatatableRow(comp, rowIndex) {
  const ca = {};
  for (let n = 1; n <= 10; n++) ca[n] = comp[`ca${n}`] ?? '';
  const pipingClass = comp.pipingClass ?? '';
  const rating = comp.rating ?? '';
  const lineNoKey = comp.lineNoKey ?? '';
  return {
    _rowIndex:   rowIndex,
    refNo:       String(comp.refNo || '').replace(/=/g, '').trim(),
    type:        comp.type        || '',
    bore:        comp.bore        ?? null,
    branchBore:  comp.branchBore  ?? null,
    ep1:         comp.ep1  ? { x: comp.ep1.x,  y: comp.ep1.y,  z: comp.ep1.z  } : null,
    ep2:         comp.ep2  ? { x: comp.ep2.x,  y: comp.ep2.y,  z: comp.ep2.z  } : null,
    cp:          comp.cp   ? { x: comp.cp.x,   y: comp.cp.y,   z: comp.cp.z   } : null,
    bp:          comp.bp   ? { x: comp.bp.x,   y: comp.bp.y,   z: comp.bp.z   } : null,
    supportCoor: comp.supportCoor
      ? { x: comp.supportCoor.x, y: comp.supportCoor.y, z: comp.supportCoor.z }
      : null,
    skey:        comp.skey        ?? '',
    supportName: comp.supportName ?? '',
    supportGuid: comp.supportGuid ?? '',
    pipelineRef: comp.pipelineRef ?? '',
    lineNoKey,
    pipingClass,
    rating,
    ca,
    CA1: ca[1], CA2: ca[2], CA3: ca[3], CA4: ca[4], CA5: ca[5],
    CA6: ca[6], CA7: ca[7], CA8: ca[8], CA9: ca[9], CA10: ca[10],
    CA97: String(comp.ca97 ?? '').replace(/=/g, '').trim(),
    CA98: comp.ca98 ?? '',
    PIPING_CLASS: pipingClass,
    RATING: rating,
    LINENO_KEY: lineNoKey,
    ca1: ca[1], ca2: ca[2], ca3: ca[3], ca4: ca[4], ca5: ca[5],
    ca6: ca[6], ca7: ca[7], ca8: ca[8], ca9: ca[9], ca10: ca[10],
    ca97: String(comp.ca97 ?? '').replace(/=/g, '').trim(),
    ca98: comp.ca98 ?? ''
  };
}

function _verifyDatatablePayload(rows) {
  const required = ['CA1', 'CA2', 'CA3', 'CA4', 'CA5', 'CA6', 'CA7', 'CA8', 'CA9', 'CA10', 'PIPING_CLASS', 'RATING', 'LINENO_KEY'];
  const missing = [];
  rows.forEach((row, index) => {
    const absent = required.filter((key) => !(key in row));
    if (absent.length) missing.push({ row: index + 1, missing: absent });
  });
  return { ok: missing.length === 0, missing };
}


function clearLineNoKeyPcRatingFields(row) {
  if (!row) return row;

  const next = { ...row };

  // Canonical fields used by Ray / PCF Fixer / common PCF builder.
  next.lineNoKey = '';
  next.LINENO_KEY = '';
  next.pipelineRef = '';
  next.PIPELINE_REFERENCE = '';
  next.pipingClass = '';
  next.PIPING_CLASS = '';
  next.rating = '';
  next.RATING = '';

  // CSV/header-style aliases.
  next['Line No. (Derived)'] = '';
  next['PIPELINE-REFERENCE'] = '';
  next['Piping Class'] = '';
  next['Rating'] = '';

  // Attribute dictionaries.
  if (next.attributes && typeof next.attributes === 'object') {
    next.attributes = { ...next.attributes };
    next.attributes['Line No. (Derived)'] = '';
    next.attributes['PIPELINE-REFERENCE'] = '';
    next.attributes['PIPING_CLASS'] = '';
    next.attributes['RATING'] = '';
  }

  if (next.componentAttrs && typeof next.componentAttrs === 'object') {
    next.componentAttrs = { ...next.componentAttrs };
    next.componentAttrs.LINENO_KEY = '';
    next.componentAttrs.PIPING_CLASS = '';
    next.componentAttrs.RATING = '';
  }

  return next;
}

function resetLineNoKeyPcRating(root) {
  const sourceRows =
    rcState.finalComponents && rcState.finalComponents.length
      ? rcState.finalComponents
      : rcState.components;

  if (!sourceRows || !sourceRows.length) {
    passLog(root, '⚠ No 2D rows available to reset LineNoKey/PC/Rating.', 'warn');
    return;
  }

  const resetRows = sourceRows.map(clearLineNoKeyPcRatingFields);

  if (rcState.finalComponents && rcState.finalComponents.length) {
    rcState.finalComponents = resetRows;
    rcState.finalCsv2DText = emit2DCSV(rcState.finalComponents, getRayConfig());

    // Any downstream generated output is now stale.
    rcState.isoPcfComponents = [];
    rcState.isoPcfCsvText = '';
    rcState.isoMetricPcfText = '';

    render2DTable(root, rcState.finalCsv2DText, rcState.finalComponents);
  } else {
    rcState.components = resetRows;
    rcState.csv2DText = emit2DCSV(rcState.components, getRayConfig());

    rcState.finalComponents = [];
    rcState.finalCsv2DText = '';
    rcState.isoPcfComponents = [];
    rcState.isoPcfCsvText = '';
    rcState.isoMetricPcfText = '';

    render2DTable(root, rcState.csv2DText, rcState.components);
  }

  passLog(root, `🧹 Reset LineNoKey / Piping Class / Rating for ${resetRows.length} row(s).`, 'info');
  updatePreview(root);
}

async function runResetCA(root) {
  const usingFinal = rcState.finalComponents && rcState.finalComponents.length > 0;
  const components = usingFinal ? rcState.finalComponents : rcState.components;
  if (!components || components.length === 0) return;

  components.forEach(comp => {
    delete comp.ca1; delete comp.ca2; delete comp.ca3; delete comp.ca4; delete comp.ca5;
    delete comp.ca6; delete comp.ca7; delete comp.ca8; delete comp.ca9; delete comp.ca10;
  });

  if (usingFinal) {
    rcState.finalCsv2DText = emit2DCSV(rcState.finalComponents, getRayConfig());
    render2DTable(root, rcState.finalCsv2DText, rcState.finalComponents);
  } else {
    _rebuildCsv2D();
    render2DTable(root, rcState.csv2DText, rcState.components);
  }

  passLog(root, 'Cleared all CA properties (CA1 - CA10) from components.', 'info');
}

async function runPushToDatatable(root) {
  // Push source = ISOPCF components (GASK/INST/PCOM/MISC already dropped),
  // fallback to finalComponents, then S1 components.
  const sourceRows = rcState.isoPcfComponents.length
    ? rcState.isoPcfComponents
    : (rcState.finalComponents.length ? rcState.finalComponents : rcState.components);
  if (!sourceRows.length) {
    passLog(root, `⚠ No rows available. Run S1 first`, 'warn');
    _mastersLog('warn', '⚠ Push skipped: no rows available (run S1 first)');
    switchSubTab(root, 'masterslog');
    return;
  }
  try {
    const rows = sourceRows.map((c, i) => _mapToDatatableRow(c, i));
    const verification = _verifyDatatablePayload(rows);
    const src = rcState.finalComponents.length ? 'finalComponents' : 'components(S1 fallback)';
    const missingRefNo = rows.filter(r => !String(r.refNo || '').trim()).length;
    const missingLineNo = rows.filter(r => !String(r.lineNoKey || '').trim()).length;
    const uniqueRefNo = new Set(rows.map(r => String(r.refNo || '').trim()).filter(Boolean)).size;
    const pipeNoRef = rows.filter(r => String((r.type || '')).toUpperCase() === 'PIPE' && !String(r.refNo || '').trim()).length;
    window.__pcfPendingDataTable = rows;
    const delivery = [];
    if (typeof window.__pcfSetDataTable === 'function') {
      window.__pcfSetDataTable(rows);
      delivery.push('window.__pcfSetDataTable');
    }
    // Mirror directly to store too, to avoid stale global-hook timing.
    try {
      const { useStore } = await import('../pcf-fixer/store/useStore.js');
      useStore.getState().setExternalDataTable(rows);
      delivery.push('zustand.setExternalDataTable');
    } catch (storeErr) {
      _mastersLog('warn', '⚠ Secondary datatable mirror failed', { error: storeErr.message });
    }
    passLog(root, `✓ Pushed ${rows.length} rows`, 'success');
    _mastersLog('info', `✅ Push to Datatable complete — ${rows.length} rows`, {
      source: src,
      mode: delivery.join(' + ') || 'none',
      missingRefNo,
      missingLineNo,
      uniqueRefNo,
      pipeNoRef,
      columnsVerified: verification.ok,
      missingColumns: verification.ok ? [] : verification.missing.slice(0, 5)
    });
    switchSubTab(root, 'masterslog');
    const statusEl = root.querySelector('#rc-masters-status');
    if (statusEl) statusEl.textContent = verification.ok
      ? `✓ Pushed ${rows.length} rows`
      : `⚠ Pushed ${rows.length} rows with missing columns`;
  } catch (err) {
    passLog(root, `✕ Push: ${err.message}`, 'error');
    _mastersLog('error', '❌ Push to Datatable failed', { error: err.message });
    switchSubTab(root, 'masterslog');
    const statusEl = root.querySelector('#rc-masters-status');
    if (statusEl) statusEl.textContent = `✕ Push failed`;
  }
}

function showConnMapPreview(root, matrix) {
  const el = root.querySelector('#rc-preview-area');
  if (!el) return;
  const STATUS_ICON = { FULL: '🟢', PARTIAL: '🟡', OPEN: '🔴' };
  el.textContent = matrix.map(r =>
    `${STATUS_ICON[r.status] || '⚪'} ${r.refNo.padEnd(24)} ${r.type.padEnd(8)} ` +
    `EP1:${(r.ep1 || '—').padEnd(26)} EP2:${(r.ep2 || '—').padEnd(26)} BP:${r.bp || '—'}`
  ).join('\n');
}

// ── ISOPCF CSV Table renderer ─────────────────────────────────────────────────
function renderIsoPcfTable(root, rows) {
  const el = root.querySelector('#rc-preview-area');
  if (!el) return;
  ensure2DTableStyles();
  if (!rows || !rows.length) {
    el.style.whiteSpace = 'pre';
    el.textContent = '(ISOPCF CSV not yet generated — run S4 first)';
    return;
  }
  const fmtPt = pt => pt ? `${Number(pt.x).toFixed(1)},${Number(pt.y).toFixed(1)},${Number(pt.z).toFixed(1)}` : '';
  const headers = ['Type','Bore','RefNo','SKEY','CA1','CA2','CA3','CA4','CA5','CA6','CA7','CA8','CA9','CA10','EP1','EP2','CP','BP'];
  const thStyle = `style="background:var(--bg-panel);color:var(--amber);padding:3px 8px;border:1px solid var(--steel);position:sticky;top:0;z-index:1;white-space:nowrap;font-size:0.65rem;font-family:var(--font-code)"`;
  const tdBase  = `padding:2px 8px;border:1px solid rgba(255,255,255,0.06);font-size:0.65rem;white-space:nowrap;font-family:var(--font-code);color:var(--text-base)`;
  const tdS = (ri) => `style="${tdBase};${ri%2?'background:rgba(255,255,255,0.02)':''}"`;
  const thead = `<tr>${headers.map(h => `<th ${thStyle}>${h}</th>`).join('')}</tr>`;
  const tbody = rows.map((c, ri) => {
    const cells = [
      c.type  || '',
      c.bore  ?? '',
      c.refNo || '',
      c.skey  || '',
      c.ca1 || '', c.ca2 || '', c.ca3 || '', c.ca4 || '',
      c.ca5 || '', c.ca6 || '', c.ca7 || '', c.ca8 || '',
      c.ca9 || '', c.ca10 || '',
      fmtPt(c.ep1), fmtPt(c.ep2), fmtPt(c.cp), fmtPt(c.bp),
    ];
    return `<tr>${cells.map(v => `<td ${tdS(ri)}>${escapeHtml(String(v))}</td>`).join('')}</tr>`;
  }).join('');
  el.style.whiteSpace = 'normal';
  el.innerHTML = `<table style="border-collapse:collapse"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function _syncIsoFromLatestComponents() {
  const base = rcState.finalComponents.length ? rcState.finalComponents : rcState.components;
  if (!base.length) return [];
  const compactedSync = compactDroppedInlineComponentsForIsoPcf(base, { dropTypes: ['GASKET'] });
  rcState.isoPcfComponents = compactedSync.components;
  rcState.isoPcfDropLog = compactedSync.dropLog || [];
  rcState.isoPcfCsvText = _buildIsoPcfCsvText(rcState.isoPcfComponents);
  return base;
}

function switchPreview(root, activeKey) {
  root.querySelectorAll('.rc-preview-btn').forEach(b => {
    const on = b.dataset.preview === activeKey;
    b.style.background  = on ? 'var(--bg-3)' : 'transparent';
    b.style.color       = on ? 'var(--text-primary)' : 'var(--text-muted)';
    b.style.fontWeight  = on ? '600' : '400';
    b.style.borderBottom = '';
  });
  const textMap = {
    'fittings':   rcState.fittingsPcfText,
    'isofinal':   rcState.isoMetricPcfText,
    'isopcfcsv':  rcState.isoPcfCsvText,
  };
  // Show ISOPCF info button only when ISOPCF CSV tab is active
  const infoBtn = root.querySelector('#rc-btn-isopcf-info');
  if (infoBtn) infoBtn.style.display = activeKey === 'isopcfcsv' ? 'inline-flex' : 'none';
  if (activeKey === 'isopcfcsv' || activeKey === 'isofinal') {
    _syncIsoFromLatestComponents();
  }
  if (activeKey === 'connmap') {
    showConnMapPreview(root, rcState.connectionMatrix);
  } else if (activeKey === '2dcsv') {
    render2DTable(root, rcState.csv2DText || '', rcState.components);
  } else if (activeKey === 'final2dcsv') {
    render2DTable(root, rcState.finalCsv2DText || '(Final 2D CSV not yet generated — run S3/S4 first)', rcState.finalComponents);
  } else if (activeKey === 'isopcfcsv') {
    renderIsoPcfTable(root, rcState.isoPcfComponents);
  } else if (activeKey === 'isofinal') {
    if (rcState.finalComponents.length || rcState.components.length) {
      runS4(root).catch(() => showPreview(root, 'rc-preview-area', rcState.isoMetricPcfText || '(not yet generated)'));
    } else {
      showPreview(root, 'rc-preview-area', rcState.isoMetricPcfText || '(not yet generated)');
    }
  } else if (textMap[activeKey] !== undefined) {
    showPreview(root, 'rc-preview-area', textMap[activeKey] || '(not yet generated)');
  }
}

function activatePreviewBtn(root, key) {
  root.querySelectorAll('.rc-preview-btn').forEach(b => {
    const on = b.dataset.preview === key;
    b.style.background  = on ? 'var(--bg-3)' : 'transparent';
    b.style.color       = on ? 'var(--text-primary)' : 'var(--text-muted)';
    b.style.fontWeight  = on ? '600' : '400';
    b.style.borderBottom = '';
  });
}

function switchSubTab(root, tab) {
  root.querySelectorAll('.rc-subtab-btn').forEach(b => {
    const on = b.dataset.subtab === tab;
    b.style.background = on ? 'rgba(245,158,11,0.12)' : 'transparent';
    b.style.color      = on ? 'var(--amber)' : 'var(--text-muted)';
    b.style.fontWeight = on ? '600' : '400';
    b.style.borderLeft = '';
  });
  const pipelineEl   = root.querySelector('#rc-subtab-pipeline');
  const debugEl      = root.querySelector('#rc-subtab-debug');
  const mastersLogEl = root.querySelector('#rc-subtab-masterslog');
  if (pipelineEl)   pipelineEl.style.display   = tab === 'pipeline'   ? 'flex' : 'none';
  if (debugEl)      debugEl.style.display      = tab === 'debug'      ? 'flex' : 'none';
  if (mastersLogEl) mastersLogEl.style.display = tab === 'masterslog' ? 'flex' : 'none';
  if (tab === 'debug') {
    renderDebugTab(root.querySelector('#rc-debug-container'), rcState.connectionMatrix);
  }
  if (tab === 'masterslog') {
    _renderMastersLog(root);
  }
}

// ── Masters Log helpers ────────────────────────────────────────────────────────
function _mastersLog(type, msg, details = null) {
  rcState.mastersLog.push({
    ts:      new Date().toLocaleTimeString(),
    type,    // 'info' | 'warn' | 'error' | 'match' | 'skip'
    msg,
    details  // object with extra key/value pairs to show in expanded row
  });
}

function _escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _formatLogScalar(value) {
  if (value == null) return '—';
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value.trim() === '' ? '—' : value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return value.length ? value.map(_formatLogScalar).join(', ') : '[]';
  return String(value);
}

function _flattenLogDetails(details, prefix = '', out = [], depth = 0) {
  if (details == null) return out;
  if (depth > 2) {
    out.push([prefix || 'value', _formatLogScalar(details)]);
    return out;
  }

  if (Array.isArray(details)) {
    if (!details.length) {
      out.push([prefix || 'value', '[]']);
      return out;
    }
    details.forEach((item, idx) => {
      const key = prefix ? `${prefix}[${idx}]` : `[${idx}]`;
      if (item && typeof item === 'object' && !Array.isArray(item)) _flattenLogDetails(item, key, out, depth + 1);
      else out.push([key, _formatLogScalar(item)]);
    });
    return out;
  }

  if (typeof details === 'object') {
    const entries = Object.entries(details);
    if (!entries.length) {
      out.push([prefix || 'value', '{}']);
      return out;
    }
    entries.forEach(([key, value]) => {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) _flattenLogDetails(value, nextKey, out, depth + 1);
      else out.push([nextKey, _formatLogScalar(value)]);
    });
    return out;
  }

  out.push([prefix || 'value', _formatLogScalar(details)]);
  return out;
}

function _renderMastersLog(root) {
  const container = root.querySelector('#rc-masterslog-container');
  if (!container) return;
  const log = rcState.mastersLog;
  if (!log.length) {
    container.innerHTML = '<span style="color:var(--text-muted);font-style:italic">No events yet — click 📥 Masters or 📍 Pipeline to log activity.</span>';
    return;
  }

  const limitRepeats = root.querySelector('#rc-masterslog-limit')?.checked ?? true;
  const colorMap = { info: '#2ecc71', warn: '#f59e0b', error: '#ef4444', match: '#38bdf8', skip: '#64748b' };

  // ── Build display list (with optional collapse of repeating groups) ───────
  // Group key: type + msg + reason — only truly identical consecutive entries collapse.
  // match/skip entries are NEVER collapsed: each represents a distinct component result
  // and must remain individually visible regardless of the "limit repeating" setting.
  const NEVER_COLLAPSE = new Set(['match', 'skip']);
  const displayList = [];
  if (limitRepeats) {
    let i = 0;
    while (i < log.length) {
      const e      = log[i];
      const reason = e.details?.reason || '';
      if (NEVER_COLLAPSE.has(e.type)) {
        // Always show individually
        displayList.push({ entry: e });
        i++;
        continue;
      }
      // Measure run of consecutive entries with identical type + msg + reason
      let j = i + 1;
      while (j < log.length &&
             !NEVER_COLLAPSE.has(log[j].type) &&
             log[j].type === e.type &&
             log[j].msg  === e.msg &&
             (log[j].details?.reason || '') === reason) j++;
      const runLen = j - i;
      if (runLen === 1) {
        displayList.push({ entry: e });
      } else {
        // Collapse entire group to one summary row (msg is preserved for context)
        displayList.push({ collapsed: { count: runLen, type: e.type, msg: e.msg, reason, firstTs: e.ts, lastTs: log[j - 1].ts } });
      }
      i = j;
    }
  } else {
    log.forEach(e => displayList.push({ entry: e }));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const rows = displayList.map(de => {
    if (de.collapsed) {
      const { count, type, msg, reason, firstTs, lastTs } = de.collapsed;
      const c = colorMap[type] || '#64748b';
      const timeRange = firstTs === lastTs ? firstTs : `${firstTs} – ${lastTs}`;
      return `<div style="padding:3px 0 3px 0.5rem;border-bottom:1px solid rgba(255,255,255,.04);display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">
        <span style="color:#475569;font-size:0.63rem">[${timeRange}]</span>
        <span style="color:${c};font-weight:700;font-size:0.66rem">${_escapeHtml(type.toUpperCase())}</span>
        <span style="background:${c}22;color:${c};font-size:0.63rem;padding:0 5px;border-radius:10px;font-weight:600">×${count}</span>
        ${msg    ? `<span style="color:#e2e8f0;font-size:0.63rem">${_escapeHtml(msg)}</span>` : ''}
        ${reason ? `<span style="color:#64748b;font-size:0.63rem">${_escapeHtml(reason)}</span>` : ''}
      </div>`;
    }
    const e = de.entry;
    const c = colorMap[e.type] || '#e8eaf0';
    const detPairs = _flattenLogDetails(e.details);
    const det = detPairs.length
      ? `<div style="margin-left:1rem;margin-top:2px;color:#94a3b8;font-size:0.63rem;line-height:1.35">${
          detPairs.map(([k, v]) => `<div><span style="color:#94a3b8">${_escapeHtml(k)}:</span> <span style="color:#cbd5e1;white-space:pre-wrap">${_escapeHtml(v)}</span></div>`).join('')
        }</div>`
      : '';
    return `<div style="padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04)">
      <span style="color:#475569">[${_escapeHtml(e.ts)}]</span>
      <span style="color:${c};font-weight:600;margin:0 4px">${_escapeHtml(e.type.toUpperCase())}</span>
      <span style="color:#e2e8f0">${_escapeHtml(e.msg)}</span>
      ${det}
    </div>`;
  });

  container.innerHTML = rows.join('');
  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function _renderPcActiveTable() {
  const container = document.getElementById('pipingclass-active-container');
  if (!container) return;
  const rows = rcState.pcActiveTable;
  if (!rows.length) {
    container.innerHTML = '<span style="color:var(--text-muted);font-style:italic;padding:0.4rem 0.6rem;display:block">No PC master loaded — upload a file in Master Data → Piping Class Master.</span>';
    return;
  }
  const cols = Object.keys(rows[0]);
  const thStyle = 'position:sticky;top:0;z-index:1;background:#1e293b;color:var(--amber);font-size:0.63rem;font-weight:700;padding:3px 6px;border-bottom:1px solid var(--steel);white-space:nowrap;text-align:left';
  const tdStyle = 'font-size:0.63rem;padding:2px 6px;border-bottom:1px solid rgba(255,255,255,.04);color:#cbd5e1;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis';
  const header = `<tr>${cols.map(c => `<th style="${thStyle}">${_escapeHtml(c)}</th>`).join('')}</tr>`;
  const body = rows.map((row, ri) => {
    const bg = ri % 2 === 0 ? 'background:rgba(255,255,255,.02)' : '';
    return `<tr style="${bg}">${cols.map(c => `<td style="${tdStyle}" title="${_escapeHtml(String(row[c] ?? ''))}">${_escapeHtml(String(row[c] ?? ''))}</td>`).join('')}</tr>`;
  }).join('');
  container.innerHTML = `<table style="border-collapse:collapse;width:max-content;min-width:100%"><thead>${header}</thead><tbody>${body}</tbody></table>`;
}

function setBadge(root, key, status) {
  const badge = root.querySelector('#rc-diff-badge');
  if (!badge) return;
  badge.style.display = 'block';
  badge.style.background = status === 'done' ? '#16a34a' : '#dc2626';
  badge.style.color = '#fff';
  badge.textContent = `${key}: ${status}`;
}

function saveFile(text, filename) {
  if (!text) return;
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Button/tab styles ─────────────────────────────────────────────────────────
function btnStyle(variant = '') {
  const bg = variant === 'primary' ? 'var(--amber)' :
             variant === 'success' ? '#16a34a' : 'var(--bg-panel)';
  const color = (variant === 'primary' || variant === 'success') ? '#000' : 'var(--text-primary)';
  return `font-size:0.68rem;font-family:var(--font-code);padding:2px 9px;border-radius:12px;cursor:pointer;` +
         `border:1px solid var(--steel);background:${bg};color:${color}`;
}
function subtabStyle(active) {
  return `display:inline-flex;align-items:center;gap:5px;font-size:0.72rem;font-family:var(--font-inter);` +
    `font-weight:${active ? '600' : '400'};padding:5px 12px;cursor:pointer;border:none;border-radius:6px;` +
    `background:${active ? 'rgba(245,158,11,0.12)' : 'transparent'};` +
    `color:${active ? 'var(--amber)' : 'var(--text-muted)'};transition:all 150ms ease;white-space:nowrap`;
}
function previewBtnStyle(active) {
  return `font-size:0.68rem;font-family:var(--font-inter);font-weight:${active ? '600' : '400'};` +
    `padding:3px 8px;cursor:pointer;border:none;border-radius:4px;` +
    `background:${active ? 'var(--bg-3)' : 'transparent'};` +
    `color:${active ? 'var(--text-primary)' : 'var(--text-muted)'};transition:all 150ms ease;white-space:nowrap`;
}
