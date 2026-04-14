import { ExcelParser } from "../services/excel-parser.js";
import { dataManager } from "../services/data-manager.js";
import { gate } from "../services/gate-logger.js";
import { materialService } from "../services/material-service.js";
import { linelistService } from "../services/linelist-service.js";
import { DiagnosticLogger } from "../utils/diagnostic-logger.js";
import { getState, setState } from "../state.js";
import { getConfig } from "../config/config-store.js";
import { masterTableService } from "../services/master-table-service.js";

/**
 * Main UI Controller for the Integration Module (Master Data Tab).
 * Manages five sub-tabs: Linelist Manager, Weight Config, Piping Class Master, PCF Material Map, Line Dump from E3D
 */
export class MasterDataController {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error("[MasterDataController] Container not found:", containerId);
      return;
    }
    // Loggers must exist before bindEvents() attaches any listeners
    this.logger       = new DiagnosticLogger();
    this.logFilter    = "ALL";
    this.weightLogger = new DiagnosticLogger();
    this.weightLogFilter = "ALL";
    this.renderTabs();
    this.bindEvents();
    this.bindNewMasterTableEvents();
    this._renderPipeSizeSchTable();

    // Initial load of smart map UI if headers exist in storage
    const state = getState("linelist");
    if (state && state.headers && state.headers.length > 0) {
      // Zero-Trust: sanitize headers before use — stored state may carry null/undefined entries
      const safeHeaders = state.headers.filter(h => h !== null && h !== undefined && String(h).trim() !== '');
      if (safeHeaders.length > 0) {
        this.renderSmartMapUI(safeHeaders);
        this.populateSourceSelect(safeHeaders);
        this.renderX1Builder(safeHeaders);
        document.getElementById("linelist-mapping-section").style.display = "";
        document.getElementById("linelist-attr-section").style.display = "";
      }
    }

    // Subscribe to DataManager changes
    dataManager.onChange((type) => this.handleDataChange(type));

    // Initial render from loaded storage — deferred until boot sequence completes
    // (loadFromStorage is async-gated behind `await import(config-store)`, so calling
    // renderInitialData() synchronously here would always see empty arrays)
    dataManager.onReady(() => this.renderInitialData());

    this._injectLogFilters();
    this._injectSessionDialog();
  }


  _renderPipeSizeSchTable() {
    const tbody = this.container.querySelector('#pipe-size-sch-tbody');
    if (!tbody) return;
    // [NB, Size, OD, 40S, 5S, 10S, S10, S20, S40, S60, XS/80S, S80, S100, S120, S140, S160, XXS]
    // '' = no value for that cell
    const rows = [
      ['',   '1/8"',  10.29, 1.2,  1.73, 2.41, '',    '',    '',    '',    '',    '',    '',    '',    '',    '',    ''],
      ['',   '1/4"',  13.72, 1.7,  2.24, 3.02, '',    '',    '',    '',    '',    '',    '',    '',    '',    '',    ''],
      ['',   '3/8"',  17.15, 1.7,  2.31, 3.2,  15,    '',    '',    '',    '',    '',    '',    '',    '',    '',    ''],
      [20,   '1/2"',  21.34, 2.8,  1.7,  2.1,  2.77,  3.73,  3.73,  4.78,  7.47,  '',    '',    '',    '',    '',    ''],
      [25,   '3/4"',  26.67, 2.9,  1.7,  2.1,  2.87,  3.91,  3.91,  5.56,  7.82,  '',    '',    '',    '',    '',    ''],
      [32,   '1"',    33.4,  3.4,  1.7,  2.8,  3.38,  4.55,  4.55,  6.35,  9.09,  '',    '',    '',    '',    '',    ''],
      [40,   '1¼"',   42.16, 3.6,  1.7,  2.8,  3.56,  4.85,  4.85,  6.35,  9.7,   '',    '',    '',    '',    '',    ''],
      [50,   '1½"',   48.26, 3.7,  1.7,  2.8,  3.68,  5.08,  5.08,  7.14,  10.2,  '',    '',    '',    '',    '',    ''],
      [65,   '2"',    60.33, 3.9,  1.7,  2.8,  3.91,  5.54,  5.54,  9.74,  11.1,  '',    '',    '',    '',    '',    ''],
      [80,   '2½"',   73.03, 5.2,  2.1,  3.1,  5.16,  7.01,  7.01,  9.53,  14,    '',    '',    '',    '',    '',    ''],
      [90,   '3"',    88.9,  5.5,  2.1,  3.1,  5.49,  7.62,  7.62,  11.1,  15.2,  '',    '',    '',    '',    '',    ''],
      [100,  '3½"',   101.6, 5.7,  2.1,  3.1,  5.74,  8.08,  8.08,  '',    '',    '',    '',    '',    '',    '',    ''],
      [125,  '4"',    114.3, 6,    2.1,  3.1,  6.02,  8.56,  8.56,  11.1,  13.5,  17.1,  '',    '',    '',    '',    ''],
      [150,  '5"',    141.3, 6.6,  2.8,  3.4,  6.55,  9.53,  9.53,  12.7,  15.9,  19.1,  '',    '',    '',    '',    ''],
      [200,  '6"',    168.3, 7.1,  2.8,  3.4,  7.11,  10.97, 11,    14.3,  18.3,  22,    '',    '',    '',    '',    ''],
      [250,  '8"',    219.1, 8.2,  2.8,  3.8,  6.4,   8.18,  10.3,  12.7,  12.7,  15.1,  19.3,  20.6,  23,    22.2,  ''],
      [300,  '10"',   273.1, 9.3,  3.4,  4.2,  6.4,   9.27,  12.7,  12.7,  15.1,  19.3,  21.4,  25.4,  28.6,  25.4,  ''],
      [350,  '12"',   323.9, 9.5,  4,    4.6,  6.4,   10.3,  14.3,  12.7,  17.5,  21.4,  25.4,  28.6,  33.3,  25.4,  ''],
      [400,  '14"',   355.6, 9.5,  4,    4.8,  6.4,   7.9,   11.1,  15.1,  12.7,  19.1,  23.8,  27.8,  31.8,  35.7,  ''],
      [450,  '16"',   406.4, 9.5,  4.2,  4.8,  6.4,   7.9,   12.7,  16.7,  12.7,  21.4,  26.2,  31,    36.5,  40.5,  ''],
      [500,  '18"',   457.2, 9.5,  4.2,  4.8,  6.4,   7.9,   14.3,  19.1,  12.7,  23.8,  29.4,  34.9,  39.7,  45.2,  ''],
      [550,  '20"',   508,   9.5,  4.8,  5.5,  6.4,   9.5,   15.1,  20.6,  12.7,  26.2,  32.5,  38.1,  44.5,  50,    ''],
      [600,  '22"',   558.8, 9.5,  4.8,  5.5,  6.4,   9.5,   22.2,  '',    12.7,  28.6,  34.9,  41.3,  47.6,  54,    ''],
      [650,  '24"',   609.6, 9.5,  5.5,  6.4,  6.4,   9.5,   17.5,  24.6,  12.7,  31,    38.9,  46,    52.4,  59.5,  ''],
      [700,  '26"',   660.4, 9.5,  7.9,  '',   13,    '',    '',    '',    12.7,  '',    '',    '',    '',    '',    ''],
      [750,  '28"',   711.2, 9.5,  7.9,  '',   13,    '',    '',    '',    12.7,  '',    '',    '',    '',    '',    ''],
      [800,  '30"',   762,   9.5,  6.4,  7.9,  7.9,   13,    '',    '',    12.7,  '',    '',    '',    '',    '',    ''],
      [850,  '32"',   812.8, 9.5,  7.9,  '',   13,    '',    '',    '',    17.5,  12.7,  '',    '',    '',    '',    ''],
      [900,  '34"',   863.6, 9.5,  7.9,  '',   13,    '',    '',    '',    17.5,  12.7,  '',    '',    '',    '',    ''],
      [950,  '36"',   914.4, 9.5,  7.9,  '',   13,    '',    '',    '',    19.1,  12.7,  '',    '',    '',    '',    ''],
    ];
    const td = (v, isKey) => {
      const empty = v === '' || v == null;
      const style = [
        'padding:3px 8px',
        'border:1px solid var(--steel)',
        'text-align:center',
        isKey ? 'color:var(--amber);font-weight:700' : (empty ? 'color:#334155' : 'color:#cbd5e1'),
      ].join(';');
      return `<td style="${style}">${empty ? '—' : v}</td>`;
    };
    const html = rows.map((r, i) => {
      const bg = i % 2 === 0 ? 'background:rgba(255,255,255,.02)' : '';
      return `<tr style="${bg}">${r.map((v, ci) => td(v, ci < 3)).join('')}</tr>`;
    }).join('');
    tbody.innerHTML = html;
  }

  bindNewMasterTableEvents() {
    const BATCH_SIZE = 60;

    const appendRowsInBatches = (tbody, rows, cols, statusEl, label) => {
      let i = 0;
      const total = rows.length;
      const step = () => {
        const frag = document.createDocumentFragment();
        const end = Math.min(i + BATCH_SIZE, total);
        for (; i < end; i++) {
          const tr = document.createElement('tr');
          for (const c of cols) {
            const td = document.createElement('td');
            td.style.cssText = 'border:1px solid var(--steel);padding:3px 6px';
            td.textContent = rows[i]?.[c] ?? '';
            tr.appendChild(td);
          }
          frag.appendChild(tr);
        }
        tbody.appendChild(frag);
        if (statusEl) statusEl.textContent = `${label} (${Math.min(i, total)}/${total})`;
        if (i < total) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const renderTable = (title, rows) => {
      const wrap = document.createElement('div');
      wrap.className = 'preview-table-wrap';
      wrap.style.cssText = 'border:1px solid var(--steel);border-radius:4px;background:var(--bg-panel);padding:0.45rem';
      const titleEl = document.createElement('div');
      titleEl.style.cssText = 'font-size:0.78rem;font-weight:600;color:var(--amber);margin-bottom:0.35rem';
      titleEl.textContent = title;

      const holder = document.createElement('div');
      holder.style.cssText = 'max-height:260px;overflow:auto';
      const table = document.createElement('table');
      table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.72rem';
      const thead = document.createElement('thead');
      const hr = document.createElement('tr');
      const cols = Object.keys(rows[0] || {});
      for (const c of cols) {
        const th = document.createElement('th');
        th.style.cssText = 'position:sticky;top:0;background:var(--bg-2);border:1px solid var(--steel);padding:4px 6px;text-align:left';
        th.textContent = c;
        hr.appendChild(th);
      }
      thead.appendChild(hr);
      const tbody = document.createElement('tbody');
      table.appendChild(thead);
      table.appendChild(tbody);
      holder.appendChild(table);
      wrap.appendChild(titleEl);
      wrap.appendChild(holder);
      const s = document.getElementById('nmt-status');
      appendRowsInBatches(tbody, rows, cols, s, `Loading ${title}`);
      return wrap;
    };

    const load = () => {
      const t = masterTableService.getTables();
      const grid = document.getElementById('nmt-grid-wrap');
      if (!grid) return;
      grid.innerHTML = '';
      const s = document.getElementById('nmt-status');
      if (s) s.textContent = 'Loading read-only tables in background…';
      grid.appendChild(renderTable('Table 1 — 9.A.1 Equal Tee (ASME B16.9)', t.table1EqualTee || []));
      grid.appendChild(renderTable('Table 2 — 9.A.2 Reducing Tee (ASME B16.9)', t.table2ReducingTee || []));
      grid.appendChild(renderTable('Table 3 — 9.A.3 Weldolet (MSS SP-97)', t.table3Weldolet || []));
      const t4Rows = masterTableService.getTable4Rows();
      grid.appendChild(renderTable(`Table 4 — Weight Master (in-app) rows: ${t4Rows.length} (preview: first 25)`, t4Rows.slice(0, 25)));
      if (s) setTimeout(() => { s.textContent = 'Read-only tables loaded progressively.'; }, 80);
    };

    requestAnimationFrame(load);
    document.addEventListener('click', (e) => {
      if (e.target?.id === 'nmt-load') load();
    });
  }

  renderInitialData() {
    if (dataManager.weightData && dataManager.weightData.length > 0) {
      this.handleDataChange('weights');
    }
    if (dataManager.pipingClassMaster && dataManager.pipingClassMaster.length > 0) {
      this.handleDataChange('pipingclass');
    }
    if (dataManager.materialMap && dataManager.materialMap.length > 0) {
      this.handleDataChange('materialmap');
    }
    if (dataManager.lineDumpData && dataManager.lineDumpData.length > 0) {
      this.handleDataChange('linedump');
    }
    if (dataManager.linelistData && dataManager.linelistData.length > 0) {
      this.handleDataChange('linelist');
    }
  }

  // ── Session label helper ──────────────────────────────────────────
  _sessionBadge(type) {
    const label = localStorage.getItem(`pcf_session_label_${type}`);
    return label ? ` · session: ${label}` : '';
  }

  handleDataChange(type) {
    // Guard: renderMappingUI calls updateHeaderMap which fires _notifyChange again.
    // Without this guard that creates an infinite recursive loop (each level causes
    // a stack overflow caught & swallowed by _notifyChange, so it loops forever).
    if (this._handlingDataChange) return;
    this._handlingDataChange = true;
    try {
      this._handleDataChangeInner(type);
    } finally {
      this._handlingDataChange = false;
    }
  }

  _handleDataChangeInner(type) {
    if (type === 'weights') {
      const data = dataManager.weightData;
      const statusEl = document.getElementById("weights-status");
      const statusBar = document.getElementById("weights-status-bar");
      if (data && data.length > 0) {
        document.getElementById("weights-mapping-section").style.display = "";
        const headers = Object.keys(data[0] || {});
        this.renderMappingUI('weights', headers);
        this.renderPreview('weights', data, headers);

        const dropZone = document.getElementById("weights-drop");
        if (dropZone) {
          dropZone.style.borderColor = "var(--green-ok)";
          dropZone.style.borderStyle = "solid";
        }

        if (statusEl) {
          statusEl.textContent = `✓ Loaded ${data.length} rows${this._sessionBadge('weights')}`;
          statusEl.style.color = "var(--green-ok)";
          if (statusBar) statusBar.style.display = "";
        }
      } else if (statusEl && statusEl.textContent.startsWith("⏳")) {
        // Always clear spinner — prevents "Parsing…" from sticking when data is empty
        statusEl.textContent = "⚠ 0 rows loaded — check file columns";
        statusEl.style.color = "var(--amber)";
        if (statusBar) statusBar.style.display = "";
      }
    } else if (type === 'pipingclass') {
      const data = dataManager.pipingClassMaster;
      const statusEl = document.getElementById("pipingclass-status");
      const statusBar = document.getElementById("pipingclass-status-bar");
      if (data && data.length > 0) {
        document.getElementById("pipingclass-mapping-section").style.display = "";
        const headers = Object.keys(data[0] || {});
        this.renderMappingUI('pipingclass', headers);
        this.renderPreview('pipingclass', data, headers);

        const dropZone = document.getElementById("piping-drop");
        if (dropZone) {
          dropZone.style.borderColor = "var(--green-ok)";
          dropZone.style.borderStyle = "solid";
        }

        if (statusEl) {
          statusEl.textContent = `✓ Loaded ${data.length} rows${this._sessionBadge('pipingclass')}`;
          statusEl.style.color = "var(--green-ok)";
          if (statusBar) statusBar.style.display = "";
        }
      } else if (statusEl && statusEl.textContent.startsWith("⏳")) {
        statusEl.textContent = "⚠ 0 rows loaded — check file columns";
        statusEl.style.color = "var(--amber)";
        if (statusBar) statusBar.style.display = "";
      }
    } else if (type === 'materialmap') {
      const data = dataManager.materialMap;
      if (data && data.length > 0) {
        const headers = ["code", "desc"];
        this.renderPreview("matmap", data, headers);

        const dropZone = document.getElementById("matmap-drop");
        if (dropZone) {
          dropZone.style.borderColor = "var(--green-ok)";
          dropZone.style.borderStyle = "solid";
        }

        const statusEl = document.getElementById("matmap-status");
        if (statusEl) {
          statusEl.textContent = `✓ Loaded ${data.length} entries${this._sessionBadge('matmap')}`;
          statusEl.style.color = "var(--green-ok)";
          document.getElementById("matmap-status-bar").style.display = "";
        }
      }
    } else if (type === 'linedump') {
      const data = dataManager.lineDumpData;
      if (data && data.length > 0) {
        document.getElementById("dump-mapping-section").style.display = "";
        const headers = Object.keys(data[0] || {});
        this.renderMappingUI('linedump', headers);
        this.renderDumpPreview(data, headers);
        this.renderDumpConfig();

        const dropZone = document.getElementById("dump-drop");
        if (dropZone) {
          dropZone.style.borderColor = "var(--green-ok)";
          dropZone.style.borderStyle = "solid";
        }

        const statusEl = document.getElementById("dump-status");
        if (statusEl) {
          const uniqueLines = new Set(data.map(r => r["Line Number (Derived)"]).filter(Boolean));
          statusEl.textContent = `✓ Loaded ${data.length} records, ${uniqueLines.size} unique lines${this._sessionBadge('linedump')}`;
          statusEl.style.color = "var(--green-ok)";
          document.getElementById("dump-status-bar").style.display = "";
        }
      }
    } else if (type === 'linelist') {
      const data = dataManager.linelistData;
      const statusEl = document.getElementById("linelist-status");
      const statusBar = document.getElementById("linelist-status-bar");
      if (data && data.length > 0) {
        const headers = Object.keys(data[0] || {});
        this.renderSmartMapUI(headers);
        this.populateSourceSelect(headers);
        this.renderX1Builder(headers);
        document.getElementById("linelist-mapping-section").style.display = "";
        document.getElementById("linelist-attr-section").style.display = "";
        
        this.renderPreview('linelist', data, headers);

        const dropZone = document.getElementById("linelist-drop");
        if (dropZone) {
          dropZone.style.borderColor = "var(--green-ok)";
          dropZone.style.borderStyle = "solid";
        }

        if (statusEl) {
          statusEl.textContent = `✓ ${data.length} rows loaded${this._sessionBadge('linelist')}`;
          statusEl.style.color = "var(--green-ok)";
          if (statusBar) statusBar.style.display = "";
        }
      }
    }
  }

  renderTabs() {
    this.container.innerHTML = `
      <div class="flex gap-1 items-center mb-1">
        <h2 style="font-family:var(--font-code);font-size:0.9rem;color:var(--amber)">MASTER DATA</h2>
      </div>

      <div class="integ-tabs">
        <button class="tab-btn active" data-tab="linelist">Linelist Manager</button>
        <button class="tab-btn" data-tab="weights">Weight Config</button>
        <button class="tab-btn" data-tab="pipingclass">Piping Class Master</button>
        <button class="tab-btn" data-tab="matmap">PCF Material Map</button>
        <button class="tab-btn" data-tab="dump">Line Dump from E3D</button>
        <button class="tab-btn" data-tab="new-master-table">ASME Tables and Wt Tables</button>
        <button class="tab-btn" data-tab="pipe-size-sch">Pipe size Vs Sch</button>
      </div>
      
      <div class="integ-content">

        <div id="new-master-table" class="tab-pane" style="display:none">
          <h4>ASME Tables and Wt Tables</h4>
          <p class="text-muted text-xs">All tables are read-only previews. Table 4 is in-app and shown as a sampled preview like other master tables.</p>
          <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem"><button id="nmt-load" class="btn btn-secondary btn-sm">Reload Tables</button><span id="nmt-status" class="text-xs text-muted"></span></div>
          <div id="nmt-grid-wrap" style="display:grid;grid-template-columns:1fr;gap:0.8rem"></div>
        </div>

        <!-- ═══ Pipe Size Vs Schedule Tab ═══ -->
        <div id="pipe-size-sch" class="tab-pane" style="display:none">
          <div style="margin-bottom:0.5rem;display:flex;align-items:baseline;gap:0.75rem">
            <span style="font-family:var(--font-code);font-size:0.75rem;font-weight:700;color:var(--amber)">PIPE SIZE vs SCHEDULE — Wall Thickness (mm)</span>
            <span style="font-size:0.65rem;color:var(--text-muted)">Source: ASME B36.10 / B36.19 · steeltubes.co.in</span>
          </div>
          <div style="overflow:auto;max-height:calc(100vh - 180px)">
            <table style="border-collapse:collapse;font-family:var(--font-code);font-size:0.63rem;white-space:nowrap">
              <thead>
                <tr style="background:#1e293b;position:sticky;top:0;z-index:1">
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:var(--amber);text-align:center">NB (mm)</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:var(--amber);text-align:center">Size (NPS)</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:var(--amber);text-align:center">OD (mm)</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:#94a3b8;text-align:center">40S</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:#94a3b8;text-align:center">5S</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:#94a3b8;text-align:center">10S</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:#94a3b8;text-align:center">S10</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:#94a3b8;text-align:center">S20</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:#94a3b8;text-align:center">S40</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:#94a3b8;text-align:center">S60</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:#94a3b8;text-align:center">XS/80S</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:#94a3b8;text-align:center">S80</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:#94a3b8;text-align:center">S100</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:#94a3b8;text-align:center">S120</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:#94a3b8;text-align:center">S140</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:#94a3b8;text-align:center">S160</th>
                  <th style="padding:4px 8px;border:1px solid var(--steel);color:#94a3b8;text-align:center">XXS</th>
                </tr>
              </thead>
              <tbody id="pipe-size-sch-tbody">
              </tbody>
            </table>
          </div>
        </div>

        <!-- ═══ Linelist Manager Sub-Tab ═══ -->
        <div id="linelist" class="tab-pane active">
          <div style="margin-bottom: 0.5rem; text-align: right; display:flex; gap:0.5rem; justify-content:flex-end;">
             <button id="btn-save-mapping-top" class="btn btn-secondary btn-sm">Save Mapping</button>
             <button id="btn-load-processmap" class="btn btn-primary btn-sm">Load Last ProcessMap</button>
          </div>
          <div class="upload-section" id="linelist-drop">
            <svg style="width:36px;height:36px;margin-bottom:0.5rem;color:var(--text-muted)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 2.75 2.75 0 0 1 3.072 2.955A2.75 2.75 0 0 1 18 19.5H6.75Z" />
            </svg>
            <div style="font-size:0.9rem;font-weight:500;color:var(--text-primary)">Drop Linelist Excel file here</div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.3rem">or click to browse · <span style="color:var(--amber);font-family:var(--font-code)">.xlsx .xls</span></div>
            <input type="file" id="linelist-upload" accept=".xlsx,.xls" style="display:none" />
          </div>
          <div id="linelist-status-bar" style="display:none" class="flex gap-1 items-center mb-1">
            <span class="text-xs text-code" id="linelist-status"></span>
          </div>
          
          <div style="display:flex; gap: 2rem; flex-wrap: wrap;">
              <!-- Left: Key Mapping -->
              <div class="mapping-config" style="flex:1;display:none;min-width:300px" id="linelist-mapping-section">
                <h4>Key Columns (Primary Key)</h4>
                <p class="text-muted text-xs" style="margin-bottom:0.75rem">Required for robust "Service + Sequence" matching.</p>
                <p class="text-muted text-xs" style="margin-bottom:0.75rem;padding:0.35rem 0.5rem;background:var(--bg-2);border-left:3px solid var(--amber);border-radius:2px;">
                  <strong>ColumnX1</strong> — Line Number &amp; Service are the basis for fetching linelist data into PCF (CA matrix, per-row refresh, and attribute injection all use this mapping).
                </p>
                <div id="linelist-mapping-ui"></div>

                <!-- ColumnX1 Formula Builder -->
                <div id="linelist-x1-builder" style="display:none;margin-top:0.85rem;padding-top:0.75rem;border-top:1px solid var(--steel);">
                  <h5 style="font-size:0.8rem;color:var(--amber);margin:0 0 0.5rem">ColumnX1 (PCF Line Ref) — Derived Key</h5>
                  <div style="display:flex;align-items:flex-end;gap:0.5rem;flex-wrap:wrap;">
                    <div>
                      <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px">Key1</div>
                      <select id="x1-key1" class="config-input" style="font-size:0.75rem;padding:0.2rem;max-width:150px;min-width:0;overflow:hidden;text-overflow:ellipsis;"></select>
                    </div>
                    <span style="color:var(--amber);font-size:1rem;padding-bottom:4px">+</span>
                    <div>
                      <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px">Key2</div>
                      <select id="x1-key2" class="config-input" style="font-size:0.75rem;padding:0.2rem;max-width:150px;min-width:0;overflow:hidden;text-overflow:ellipsis;"></select>
                    </div>
                    <span style="color:var(--amber);font-size:1rem;padding-bottom:4px">+</span>
                    <div>
                      <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px">Key3 (spare)</div>
                      <select id="x1-key3" class="config-input" style="font-size:0.75rem;padding:0.2rem;max-width:150px;min-width:0;overflow:hidden;text-overflow:ellipsis;"></select>
                    </div>
                    <button class="btn btn-sm" id="btn-derive-line-ref"
                      style="background:var(--amber);color:#000;border:none;font-weight:600;padding:0.25rem 0.6rem;">
                      Derive Line Ref Key
                    </button>
                  </div>
                  <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.35rem" id="x1-derive-status"></div>
                </div>

                <div id="linelist-key-warning" style="display:none;margin-top:0.5rem" class="issue-item WARNING">
                    <span class="issue-sev WARNING">WARN</span>
                    <span class="issue-msg">Primary keys not fully mapped. Fallback lookup may be unreliable.</span>
                </div>
              </div>

              <!-- Right: Attribute Mapping (SmartProcessMap) -->
              <div class="mapping-config" style="flex:1;display:none;min-width:300px" id="linelist-attr-section">
                <h4>Attribute Injection (SmartProcessMap)</h4>
                <p class="text-muted text-xs" style="margin-bottom:0.75rem">Map Line List columns to specific PCF attributes.</p>

                <div id="smart-map-ui">
                    <!-- Injected by renderSmartMapUI -->
                </div>

                <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--steel)">
                    <h5 style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.5rem">Custom Attribute Mapping</h5>
                    <div id="linelist-attr-ui">
                        <div class="map-row" style="max-width:100%">
                            <select id="new-attr-source" style="background:var(--bg-0);border:1px solid var(--steel);color:var(--text-primary);padding:0.3rem;border-radius:var(--radius-sm);max-width:220px;min-width:0;overflow:hidden;text-overflow:ellipsis;"><option value="">(Select Column)</option></select>
                            <span style="color:var(--text-muted);margin:0 0.3rem">→</span>
                            <input type="text" id="new-attr-target" placeholder="ATTRIBUTE_X" class="config-input" style="width:120px;">
                            <button class="btn btn-sm btn-primary" id="btn-add-attr">+ Add</button>
                        </div>
                        <div id="attr-list" style="margin-top:10px; max-height:150px; overflow-y:auto;"></div>
                    </div>
                </div>
              </div>
          </div>

          <div id="linelist-preview" style="display:none"></div>

          <!-- Diagnostic Log Panel — always visible below preview -->
          <div class="panel" style="margin-top:0.75rem" id="linelist-log-panel">
            <div class="panel-header">
              <span class="panel-title">Linelist Diagnostic Log</span>
              <button class="btn btn-secondary btn-sm" id="btn-clear-linelist-log">Clear</button>
            </div>
            <div class="panel-body" style="padding:0.5rem;overflow-y:auto;max-height:220px">
              <div id="linelist-diagnostic-log" style="font-family:var(--font-code);font-size:0.72rem;white-space:pre-wrap">
                <span style="color:var(--text-muted)">Upload a linelist file to see detailed processing logs...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ Weight Config Sub-Tab ═══ -->
        <div id="weights" class="tab-pane">
          <div style="margin-bottom:0.5rem;display:flex;gap:0.5rem;justify-content:flex-end;">
            <button id="btn-load-weights-json" class="btn btn-secondary btn-sm">Load JSON</button>
            <button id="btn-save-weights-json" class="btn btn-secondary btn-sm">Save JSON</button>
          </div>
          <div class="upload-section" id="weights-drop">
            <svg style="width:36px;height:36px;margin-bottom:0.5rem;color:var(--text-muted)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 2.75 2.75 0 0 1 3.072 2.955A2.75 2.75 0 0 1 18 19.5H6.75Z" />
            </svg>
            <div style="font-size:0.9rem;font-weight:500;color:var(--text-primary)">Drop Weight Database Excel file here</div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.3rem">or click to browse · <span style="color:var(--amber);font-family:var(--font-code)">.xlsx .xls</span></div>
            <input type="file" id="weights-upload" accept=".xlsx,.xls" style="display:none" />
          </div>
          <div id="weights-status-bar" style="display:none" class="flex gap-1 items-center mb-1">
            <span class="text-xs text-code" id="weights-status"></span>
          </div>
          <div class="mapping-config" style="display:none" id="weights-mapping-section">
            <h4>Header Mapping</h4>
            <div id="weights-mapping-ui"></div>
          </div>
          <div id="weights-preview" style="display:none"></div>

          <!-- Weight Diagnostic Log -->
          <div class="panel" style="margin-top:0.75rem" id="weights-log-panel">
            <div class="panel-header">
              <span class="panel-title">Weight Upload Log</span>
              <button class="btn btn-secondary btn-sm" id="btn-clear-weights-log">Clear</button>
            </div>
            <div class="panel-body" style="padding:0.5rem;overflow-y:auto;max-height:220px">
              <div id="weights-diagnostic-log" style="font-family:var(--font-code);font-size:0.72rem;white-space:pre-wrap">
                <span style="color:var(--text-muted)">Upload a weight Excel file to see detailed parsing logs...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ Piping Class Master Sub-Tab ═══ -->
        <div id="pipingclass" class="tab-pane">
          <div style="margin-bottom: 0.5rem;">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;">
              <label style="font-size:0.75rem;white-space:nowrap;color:var(--text-muted)">Size-wise URL:</label>
              <input id="piping-class-base-url" type="text" class="config-input" style="flex:1;font-size:0.72rem;font-family:var(--font-code)" placeholder="/Docs/Masters/piping_class/size_wise/" />
            </div>
            <div style="display:flex;gap:0.4rem;justify-content:flex-end;flex-wrap:wrap;">
              <button id="btn-load-piping-csv" class="btn btn-secondary btn-sm">Load Master for CSV Pipe size</button>
              <button id="btn-load-piping-process" class="btn btn-primary btn-sm" title="Load piping class master saved in localStorage from a previous session">Load Master for process Pipe size</button>
              <button id="btn-save-piping-storage" class="btn btn-secondary btn-sm" title="Save current piping class master to localStorage so it persists after refresh">💾 Save Piping Class</button>
            </div>
          </div>
          <div class="upload-section" id="piping-drop">
            <svg style="width:36px;height:36px;margin-bottom:0.5rem;color:var(--text-muted)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 2.75 2.75 0 0 1 3.072 2.955A2.75 2.75 0 0 1 18 19.5H6.75Z" />
            </svg>
            <div style="font-size:0.9rem;font-weight:500;color:var(--text-primary)">Drop Piping Class Master Excel file here</div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.3rem">or click to browse · <span style="color:var(--amber);font-family:var(--font-code)">.xlsx .xls</span></div>
            <input type="file" id="piping-upload" accept=".xlsx,.xls" style="display:none" />
          </div>
          <div id="pipingclass-status-bar" style="display:none" class="flex gap-1 items-center mb-1">
            <span class="text-xs text-code" id="pipingclass-status"></span>
          </div>
          <div class="mapping-config" style="display:none" id="pipingclass-mapping-section">
            <h4>Header Mapping</h4>
            <div id="pipingclass-mapping-ui"></div>
          </div>
          <div id="pipingclass-preview" style="display:none"></div>

          <!-- PC Active: rows filtered to bores in current CSV — populated when Masters runs -->
          <div id="pipingclass-active-section" style="margin-top:0.75rem;border:1px solid var(--steel);border-radius:6px;overflow:hidden">
            <div style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem 0.6rem;background:var(--bg-panel);border-bottom:1px solid var(--steel)">
              <span style="font-size:0.68rem;font-weight:700;letter-spacing:0.06em;color:var(--amber);font-family:var(--font-code)">ACTIVE ROWS</span>
              <span style="font-size:0.63rem;color:var(--text-muted)">— Piping Class Master filtered to bores in current CSV</span>
              <span id="pipingclass-active-count" style="font-size:0.65rem;color:var(--text-muted);margin-left:auto"></span>
            </div>
            <div id="pipingclass-active-container" style="max-height:340px;overflow:auto;font-family:var(--font-code);font-size:0.63rem;background:var(--bg-0)">
              <span style="color:var(--text-muted);font-style:italic;padding:0.4rem 0.6rem;display:block">Run Masters in the RAY pipeline tab to populate this view.</span>
            </div>
          </div>
        </div>

        <!-- ═══ PCF Material Map Sub-Tab ═══ -->
        <div id="matmap" class="tab-pane">
          <div style="margin-bottom:0.5rem;display:flex;gap:0.5rem;justify-content:flex-end;">
            <button id="btn-load-matmap-json" class="btn btn-secondary btn-sm">Load JSON</button>
            <button id="btn-save-matmap-json" class="btn btn-secondary btn-sm">Save JSON</button>
          </div>
          <div class="upload-section" id="matmap-drop">
            <svg style="width:36px;height:36px;margin-bottom:0.5rem;color:var(--text-muted)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 2.75 2.75 0 0 1 3.072 2.955A2.75 2.75 0 0 1 18 19.5H6.75Z" />
            </svg>
            <div style="font-size:0.9rem;font-weight:500;color:var(--text-primary)">Drop PCF Material Map file here</div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.3rem">or click to browse · <span style="color:var(--amber);font-family:var(--font-code)">.txt .csv</span></div>
            <input type="file" id="matmap-upload" accept=".txt,.csv" style="display:none" />
          </div>
          <div id="matmap-status-bar" style="display:none" class="flex gap-1 items-center mb-1">
            <span class="text-xs text-code" id="matmap-status"></span>
          </div>
          <div id="matmap-preview" style="display:none"></div>
        </div>

        <!-- ═══ Line Dump from E3D Sub-Tab ═══ -->
        <div id="dump" class="tab-pane">
          <div class="upload-section" id="dump-drop">
            <svg style="width:36px;height:36px;margin-bottom:0.5rem;color:var(--text-muted)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 2.75 2.75 0 0 1 3.072 2.955A2.75 2.75 0 0 1 18 19.5H6.75Z" />
            </svg>
            <div style="font-size:0.9rem;font-weight:500;color:var(--text-primary)">Drop LineDump Excel/CSV file here</div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.3rem">or click to browse · <span style="color:var(--amber);font-family:var(--font-code)">.xlsx .xls .csv</span></div>
            <input type="file" id="dump-upload" accept=".xlsx,.xls,.csv" style="display:none" />
          </div>
          <div id="dump-status-bar" style="display:none" class="flex gap-1 items-center mb-1">
            <span class="text-xs text-code" id="dump-status"></span>
          </div>

          <!-- Header Mapping for Line Dump -->
          <div class="mapping-config" style="display:none" id="dump-mapping-section">
            <h4>Header Mapping</h4>
            <div id="linedump-mapping-ui"></div>
          </div>

          <!-- Configuration for Line No. Derivation -->
          <div id="dump-derive-config" style="display:none; margin-bottom: 1rem;" class="mapping-config">
            <h4 style="margin-bottom:0.5rem">Derive Line Ref Key
              <span style="font-size:0.72rem;color:var(--text-muted);font-weight:normal"> — builds "Line Number (Derived)" column by splitting Segment Position by " - "</span>
            </h4>
            <div style="display:flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end;">
              <div>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px">Key1: Segment Position (split by −)</div>
                <div style="display:flex;align-items:center;gap:4px">
                  <span style="font-size:0.72rem;color:var(--text-muted)">Segment #:</span>
                  <input type="number" id="dump-segment-pos" value="3" min="1" max="20" class="config-input" style="width:55px;">
                </div>
              </div>
              <span style="color:var(--amber);font-size:1.1rem;padding-bottom:4px">+</span>
              <div>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px">Key2: Segment Position (split by −) <em>(optional)</em></div>
                <div style="display:flex;align-items:center;gap:4px">
                  <span style="font-size:0.72rem;color:var(--text-muted)">Segment #:</span>
                  <input type="number" id="dump-segment-pos2" value="" min="0" max="20" class="config-input" style="width:55px;" placeholder="—">
                </div>
              </div>
              <button class="btn btn-secondary btn-sm" id="btn-re-derive">↻ Re-derive</button>
            </div>
          </div>

          <div id="dump-stats" style="display:none" class="stat-chips"></div>
          <div id="dump-preview" style="display:none"></div>
        </div>

      </div>
    `;
  }

  bindEvents() {
    // ── Sub-Tab Switching ──
    this.container.querySelectorAll(".integ-tabs .tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) =>
        this.switchTab(e.target.dataset.tab),
      );
    });

    // ── Upload Drop Zones (click-to-browse) ──
    const wireDropZone = (dropId, inputId) => {
      const drop = document.getElementById(dropId);
      const input = document.getElementById(inputId);
      if (!drop || !input) return;
      drop.addEventListener("click", () => input.click());
      drop.addEventListener("dragover", (e) => {
        e.preventDefault();
        drop.style.borderColor = "var(--amber)";
      });
      drop.addEventListener("dragleave", () => {
        drop.style.borderColor = "";
      });
      drop.addEventListener("drop", (e) => {
        e.preventDefault();
        drop.style.borderColor = "";
        if (e.dataTransfer.files.length) {
          input.files = e.dataTransfer.files;
          input.dispatchEvent(new Event("change"));
        }
      });
    };

    wireDropZone("linelist-drop", "linelist-upload");
    wireDropZone("weights-drop", "weights-upload");
    wireDropZone("piping-drop", "piping-upload");
    wireDropZone("matmap-drop", "matmap-upload");
    wireDropZone("dump-drop", "dump-upload");

    // ── File Change Handlers ──
    document
      .getElementById("linelist-upload")
      .addEventListener("change", (e) =>
        this.handleUpload(e.target.files[0], "linelist"),
      );
    document
      .getElementById("weights-upload")
      .addEventListener("change", (e) =>
        this.handleUpload(e.target.files[0], "weights"),
      );
    document
      .getElementById("piping-upload")
      .addEventListener("change", (e) =>
        this.handleUpload(e.target.files[0], "pipingclass"),
      );

    // Piping Class Base URL — populate from stored value and sync changes to DataManager
    const pipingUrlInput = document.getElementById("piping-class-base-url");
    if (pipingUrlInput) {
      pipingUrlInput.value = dataManager._pipingClassBaseUrl || "/Docs/Masters/piping_class/size_wise/";
      pipingUrlInput.addEventListener("change", () => {
        dataManager.setPipingClassBaseUrl(pipingUrlInput.value.trim());
      });
    }

    // New Button Logic: Load Master for CSV Pipe size
    const btnLoadPipingCsv = document.getElementById("btn-load-piping-csv");
    if (btnLoadPipingCsv) {
      btnLoadPipingCsv.addEventListener("click", async () => {
        // Step 1: Look at the imported CSV (Linelist Manager) to find available NB sizes
        const linelistData = dataManager.linelistData;
        if (!linelistData || linelistData.length === 0) {
          alert("Please load a Linelist CSV first to detect sizes.");
          return;
        }

        // Find the NB (Nominal Bore) or Size column — must match specifically, no fallback to headers[0]
        const headers = Object.keys(linelistData[0] || {});
        const sizeCol = headers.find(h => {
          const lc = h.toLowerCase().replace(/[\s_-]/g, '');
          return lc === 'nb' || lc === 'nominalbore' || lc === 'size' || lc === 'nominalsize' || lc === 'bore' || lc === 'nps';
        });

        if (!sizeCol) {
          alert(`Could not detect a NB/Size column in the linelist. Available columns:\n${headers.slice(0, 20).join(', ')}\n\nPlease ensure a column named NB, Nominal Bore, Size, or NPS exists.`);
          return;
        }

        const sizes = new Set();
        linelistData.forEach(row => {
          const val = String(row[sizeCol] || '').trim();
          // Only include numeric-looking values (actual sizes, not blank or headers)
          if (val && /^[\d.]+/.test(val)) sizes.add(val);
        });

        if (sizes.size === 0) {
          alert(`No numeric sizes found in column "${sizeCol}".`);
          return;
        }

        console.log(`[MasterDataController] Detected sizes for Piping Class:`, Array.from(sizes));
        const statusEl = document.getElementById("pipingclass-status");
        const statusBar = document.getElementById("pipingclass-status-bar");
        if (statusBar) statusBar.style.display = "";
        if (statusEl) statusEl.textContent = `⏳ Loading sizes: ${Array.from(sizes).join(', ')}...`;

        // Request DataManager to lazy load these sizes
        await dataManager.loadPipingClassSizes(Array.from(sizes));

        // Trigger render
        this.handleDataChange("pipingclass");
      });
    }

    // Load piping class from localStorage (process pipe size)
    const btnLoadPipingProcess = document.getElementById("btn-load-piping-process");
    if (btnLoadPipingProcess) {
      btnLoadPipingProcess.addEventListener("click", () => {
        const statusEl  = document.getElementById("pipingclass-status");
        const statusBar = document.getElementById("pipingclass-status-bar");
        try {
          const raw = localStorage.getItem("pcf_master_pipingclass");
          if (!raw) {
            if (statusEl) { statusEl.textContent = "⚠ No piping class data found in localStorage. Load via CSV or upload first."; statusEl.style.color = "var(--amber)"; }
            if (statusBar) statusBar.style.display = "";
            return;
          }
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed) || parsed.length === 0) {
            if (statusEl) { statusEl.textContent = "⚠ Stored piping class data is empty."; statusEl.style.color = "var(--amber)"; }
            if (statusBar) statusBar.style.display = "";
            return;
          }
          dataManager.setPipingClassMaster(parsed);
          this.handleDataChange("pipingclass");
          if (statusEl) { statusEl.textContent = `✓ Loaded ${parsed.length} rows from localStorage`; statusEl.style.color = "var(--green-ok)"; }
          if (statusBar) statusBar.style.display = "";
        } catch (e) {
          if (statusEl) { statusEl.textContent = `✕ ${e.message}`; statusEl.style.color = "var(--red-err)"; }
          if (statusBar) statusBar.style.display = "";
        }
      });
    }

    // Save piping class to localStorage
    const btnSavePipingStorage = document.getElementById("btn-save-piping-storage");
    if (btnSavePipingStorage) {
      btnSavePipingStorage.addEventListener("click", () => {
        const data = dataManager.getPipingClassMaster();
        const statusEl  = document.getElementById("pipingclass-status");
        const statusBar = document.getElementById("pipingclass-status-bar");
        if (!data || data.length === 0) {
          if (statusEl) { statusEl.textContent = "⚠ No piping class data loaded to save."; statusEl.style.color = "var(--amber)"; }
          if (statusBar) statusBar.style.display = "";
          return;
        }
        dataManager.saveToStorage("pipingclass");
        btnSavePipingStorage.textContent = "✓ Saved";
        btnSavePipingStorage.style.color = "var(--green-ok)";
        if (statusEl) { statusEl.textContent = `✓ ${data.length} rows saved to localStorage`; statusEl.style.color = "var(--green-ok)"; }
        if (statusBar) statusBar.style.display = "";
        setTimeout(() => { btnSavePipingStorage.textContent = "💾 Save Piping Class"; btnSavePipingStorage.style.color = ""; }, 2000);
      });
    }

    document
      .getElementById("matmap-upload")
      .addEventListener("change", (e) =>
        this.handleMatMapUpload(e.target.files[0]),
      );
    document
      .getElementById("dump-upload")
      .addEventListener("change", (e) =>
        this.handleDumpUpload(e.target.files[0]),
      );

    // Event Listeners
    const addAttrBtn = document.getElementById("btn-add-attr");
    if (addAttrBtn)
      addAttrBtn.addEventListener("click", () => this.addAttributeMapping());

    const clearLogBtn = document.getElementById("btn-clear-linelist-log");
    if (clearLogBtn)
      clearLogBtn.addEventListener("click", () => this.clearLinelistLog());

    const clearWeightLogBtn = document.getElementById("btn-clear-weights-log");
    if (clearWeightLogBtn)
      clearWeightLogBtn.addEventListener("click", () => this.clearWeightLog());

    // Save Mapping (top bar)
    const saveMappingTopBtn = document.getElementById("btn-save-mapping-top");
    if (saveMappingTopBtn) {
      saveMappingTopBtn.addEventListener("click", () => {
        linelistService._saveConfig();
        saveMappingTopBtn.textContent = "✓ Saved";
        saveMappingTopBtn.style.color = "var(--green-ok)";
        setTimeout(() => {
          saveMappingTopBtn.textContent = "Save Mapping";
          saveMappingTopBtn.style.color = "";
        }, 2000);
      });
    }

    // Load Last ProcessMap — reloads smartMap from pcf_linelist_config and re-renders
    const loadProcessMapBtn = document.getElementById("btn-load-processmap");
    if (loadProcessMapBtn) {
      loadProcessMapBtn.addEventListener("click", () => {
        const state = getState("linelist");
        const headers = state?.headers;
        if (!headers || headers.length === 0) {
          alert("No linelist headers found. Upload a linelist file first.");
          return;
        }
        // Reload saved config from localStorage and merge into state
        try {
          const raw = localStorage.getItem("pcf_linelist_config");
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved.smartMap && Object.keys(saved.smartMap).length > 0) {
              setState("linelist", {
                ...state,
                smartMap:     { ...state.smartMap, ...saved.smartMap },
                keys:         saved.keys     || state.keys,
                smartOptions: saved.smartOptions || state.smartOptions
              });
              this.logToLinelist("info", "✓ ProcessMap restored from localStorage (pcf_linelist_config).");
            } else {
              this.logToLinelist("warn", "⚠ Saved config found but smartMap is empty — nothing to restore.");
            }
          } else {
            this.logToLinelist("warn", "⚠ No saved ProcessMap found in localStorage. Use 'Save Mapping' first.");
          }
        } catch (e) {
          this.logToLinelist("error", `✕ Failed to load ProcessMap: ${e.message}`);
        }
        this.renderSmartMapUI(headers);
      });
    }

    this.linelistLogs = [];

    // ── Weight Config JSON Load/Save ──
    document.getElementById("btn-save-weights-json")?.addEventListener("click", () => {
      const data = dataManager.getWeights();
      if (!data || data.length === 0) { alert("No weight data loaded."); return; }
      this._downloadJSON(data, "weight_config.json");
    });
    document.getElementById("btn-load-weights-json")?.addEventListener("click", () => {
      this._loadJSONFile((data) => {
        dataManager.setWeights(data);
        this.handleDataChange("weights");
      });
    });

    // ── PCF Material Map JSON Load/Save ──
    document.getElementById("btn-save-matmap-json")?.addEventListener("click", () => {
      const data = dataManager.getMaterialMap ? dataManager.getMaterialMap() : dataManager.materialMap;
      if (!data || data.length === 0) { alert("No material map data loaded."); return; }
      this._downloadJSON(data, "material_map.json");
    });
    document.getElementById("btn-load-matmap-json")?.addEventListener("click", () => {
      this._loadJSONFile((data) => {
        if (dataManager.setMaterialMap) dataManager.setMaterialMap(data);
        else dataManager.materialMap = data;
        this.handleDataChange("materialmap");
      });
    });

    // ── Session Save Dialog ──
    document.addEventListener('click', (e) => {
      if (e.target.id === 'msd-save') this._onSaveDialogConfirm();
      if (e.target.id === 'msd-skip') this._onSaveDialogSkip();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.getElementById('msd-dialog')?.style.display === 'flex') {
        this._onSaveDialogConfirm();
      }
      if (e.key === 'Escape' && document.getElementById('msd-dialog')?.style.display === 'flex') {
        this._onSaveDialogSkip();
      }
    });

    // Subscribe to linelist state changes for auto-logging
  }

  // ── Session Save Dialog ────────────────────────────────────────────

  _injectSessionDialog() {
    if (document.getElementById('msd-dialog')) return;
    const el = document.createElement('div');
    el.id = 'msd-dialog';
    el.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;align-items:center;justify-content:center;';
    el.innerHTML = `
      <div style="background:var(--bg-1,#1a1f2e);border:1px solid rgba(245,158,11,0.35);border-radius:8px;padding:1.5rem 1.75rem;width:380px;max-width:92vw;box-shadow:0 12px 40px rgba(0,0,0,0.55);">
        <div style="font-family:var(--font-code,monospace);font-size:0.78rem;font-weight:700;color:#f59e0b;letter-spacing:0.1em;margin-bottom:0.6rem;">MASTER DATA LOADED</div>
        <div id="msd-info" style="font-size:0.82rem;color:#94a3b8;margin-bottom:1rem;line-height:1.55;"></div>
        <label style="display:block;font-size:0.74rem;color:#64748b;margin-bottom:4px;">Session Label <span style="font-size:0.7rem;">(optional — helps identify data after page refresh)</span></label>
        <input id="msd-label" type="text" style="width:100%;box-sizing:border-box;background:var(--bg-0,#0f1117);border:1px solid #3a4255;color:#e8eaf0;padding:0.4rem 0.6rem;border-radius:4px;font-family:var(--font-code,monospace);font-size:0.82rem;margin-bottom:1.1rem;" placeholder="e.g. Rev01, Project A, Test run…">
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
          <button id="msd-skip" style="background:transparent;border:1px solid #3a4255;color:#94a3b8;padding:0.35rem 0.8rem;border-radius:4px;font-size:0.78rem;cursor:pointer;">This session only</button>
          <button id="msd-save" style="background:#f59e0b;border:none;color:#000;font-weight:700;padding:0.35rem 1rem;border-radius:4px;font-size:0.78rem;cursor:pointer;">Save to Session →</button>
        </div>
      </div>`;
    document.body.appendChild(el);
  }

  _showSaveDialog(type, fileName, rowCount) {
    const dialog = document.getElementById('msd-dialog');
    const infoEl = document.getElementById('msd-info');
    const labelEl = document.getElementById('msd-label');
    if (!dialog) return;

    const savedLabel = localStorage.getItem(`pcf_session_label_${type}`);
    const baseName = fileName.replace(/\.[^.]+$/, '');
    labelEl.value = savedLabel || baseName;

    const typeLabels = { linelist: 'Linelist', weights: 'Weight Config', pipingclass: 'Piping Class', matmap: 'Material Map', linedump: 'Line Dump (E3D)' };
    infoEl.innerHTML = `<strong style="color:#e8eaf0;">${fileName}</strong><br>${rowCount.toLocaleString()} rows · <span style="color:#f59e0b;">${typeLabels[type] || type}</span>`;

    this._dialogPendingType = type;
    dialog.style.display = 'flex';
    setTimeout(() => { labelEl.focus(); labelEl.select(); }, 50);
  }

  _onSaveDialogConfirm() {
    const type = this._dialogPendingType;
    const label = (document.getElementById('msd-label')?.value || '').trim();
    if (type && label) {
      localStorage.setItem(`pcf_session_label_${type}`, label);
    }
    this._closeSessionDialog();
    // Refresh status bar to show label
    if (type) this.handleDataChange(type);
  }

  _onSaveDialogSkip() {
    const type = this._dialogPendingType;
    // Remove from localStorage so data won't persist after refresh
    const keyMap = {
      linelist: 'pcf_master_linelist',
      weights: 'pcf_master_weights',
      pipingclass: 'pcf_master_pipingclass',
      matmap: 'pcf_master_materialmap',
      linedump: 'pcf_master_linedump',
    };
    const storageKey = keyMap[type];
    if (storageKey) {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(`pcf_session_label_${type}`);
    }
    this._closeSessionDialog();
  }

  _closeSessionDialog() {
    const dialog = document.getElementById('msd-dialog');
    if (dialog) dialog.style.display = 'none';
    this._dialogPendingType = null;
  }

  _downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  _loadJSONFile(callback) {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          callback(Array.isArray(data) ? data : [data]);
        } catch (err) { alert("Invalid JSON file: " + err.message); }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  switchTab(tabId) {
    this.container
      .querySelectorAll(".integ-tabs .tab-btn")
      .forEach((b) => b.classList.remove("active"));
    this.container
      .querySelectorAll(".tab-pane")
      .forEach((p) => { p.classList.remove("active"); p.style.display = 'none'; });

    this.container
      .querySelector(`.integ-tabs [data-tab="${tabId}"]`)
      ?.classList.add("active");
    const targetPane = this.container.querySelector(`#${tabId}`);
    if (targetPane) { targetPane.classList.add("active"); targetPane.style.display = ''; }

    // Clear weight status area if no weight data loaded yet (prevents stale linelist row count)
    if (tabId === "weights") {
      const ws = document.getElementById("weights-status");
      const wsb = document.getElementById("weights-status-bar");
      if (ws && dataManager.getWeights().length === 0) {
        ws.textContent = "";
        if (wsb) wsb.style.display = "none";
      }
    }
  }

  // ═══════════════════════════════════════════
  //  Linelist, Weights & Piping Class Upload Handler
  // ═══════════════════════════════════════════
  async handleUpload(file, type) {
    if (!file) return;

    // Get comprehensive keywords from config for Linelist
    let keywords = [];
    if (type === "linelist") {
      const config = getConfig();
      const smartKeywords = config.smartData?.smartProcessKeywords || {};

      // EXCLUDE Density/Phase from Detection List (too generic, causes false positives on data rows)
      const excludeKeys = ['DensityGas', 'DensityLiq', 'DensityMixed', 'Phase'];
      const detectionKeywords = [];

      Object.keys(smartKeywords).forEach(key => {
        if (!excludeKeys.includes(key)) {
          detectionKeywords.push(...(smartKeywords[key] || []));
        }
      });

      keywords = detectionKeywords;
      // Add Strong Primary Key Keywords
      keywords.push("Service", "System", "Line", "Sequence", "Seq", "Line No", "Piping Class", "Tag", "Unit", "Area", "Description");
    } else {
      const keywordMap = {
        weights: ["Size", "Weight", "Class", "Schedule", "Rating", "NPS", "RF/RTJ"], // Added NPS and RF/RTJ for better detection
        pipingclass: ["Class", "Material", "Wall", "Corrosion"],
      };
      keywords = keywordMap[type] || [];
    }

    const statusBar = document.getElementById(`${type}-status-bar`);
    const statusEl = document.getElementById(`${type}-status`);
    statusBar.style.display = "";
    statusEl.textContent = "⏳ Parsing…";

    // Map drop zone IDs (piping uses 'piping-drop' instead of 'pipingclass-drop')
    const dropZoneMap = {
      linelist: "linelist-drop",
      weights: "weights-drop",
      pipingclass: "piping-drop",
    };

    try {
      if (type === "weights") this.logToWeight("info", `📂 Parsing file: ${file.name}`);
      else this.logToLinelist("info", `📂 Parsing file: ${file.name}`);

      const result = await ExcelParser.parse(file, keywords);

      if (type === "weights") {
        // ── Detailed weight parse diagnostics ──────────────────────────
        const sheets = result.sheetNames || [];
        this.logToWeight("info", `📋 Sheets in workbook: ${sheets.join(", ") || "(none)"}`);
        this.logToWeight("info", `📌 Using sheet: "${result.sheetName || sheets[0] || "?"}" (header row ${result.detectedRow + 1})`);

        // Always log first 3 raw rows for diagnosis
        if (result.rawRows?.length) {
          result.rawRows.slice(0, 3).forEach((row, i) =>
            this.logToWeight("info", `  Raw row ${i + 1}: [${(row || []).map(c => `"${c ?? ''}"`).join(", ")}]`)
          );
        }

        this.logToWeight("info", `🔑 Headers detected (${result.headers.length}): ${result.headers.slice(0, 8).join(", ")}${result.headers.length > 8 ? "…" : ""}`);
        this.logToWeight("info", `📊 Raw data rows parsed: ${result.data.length}`);

        // ── FALLBACK: if 0 headers, treat first raw row as explicit header ──
        let finalResult = result;
        if (result.headers.length === 0 && result.rawRows?.length >= 2) {
          this.logToWeight("warn", "  0 headers via keyword scoring — retrying with row 0 as explicit header");
          const hdrs = (result.rawRows[0] || []).map(c => String(c ?? '').trim()).filter(Boolean);
          const dataRows = result.rawRows.slice(1).map(row => {
            const obj = {};
            hdrs.forEach((h, idx) => { obj[h] = (row || [])[idx] ?? ''; });
            return obj;
          }).filter(r => Object.values(r).some(v => v !== '' && v != null));
          finalResult = { ...result, headers: hdrs, data: dataRows };
          this.logToWeight("info", `  Fallback headers (${hdrs.length}): ${hdrs.slice(0, 8).join(", ")}${hdrs.length > 8 ? "…" : ""}`);
          this.logToWeight("info", `  Fallback data rows: ${dataRows.length}`);
        }

        dataManager.setWeights(finalResult.data);
        document.getElementById("weights-mapping-section").style.display = "";

        // Update result for status line below
        result.headers = finalResult.headers;
        result.data    = finalResult.data;

        const storedW = dataManager.getWeights().length;
        if (storedW > 0) {
          this.logToWeight("success", `✓ Stored ${storedW} valid rows`);
        } else {
          this.logToWeight("error", `✕ 0 rows stored — check that column headers match expected names`);
          this.logToWeight("warn", `  Expected keywords: ${keywords.join(", ")}`);
          if (result.rawRows?.length) {
            this.logToWeight("warn", `  First row values: [${(result.rawRows[0] || []).slice(0,6).map(c => `"${c ?? ''}"`).join(", ")}]`);
          }
        }
      } else if (type === "linelist") {
        this.logToLinelist("success", `✓ Detected ${result.data.length} rows, header at row ${result.detectedRow + 1}`);
        this.logToLinelist("info", "🔄 Processing linelist data...");

        const state = getState("linelist") || {};
        setState("linelist", {
          ...state,
          filename: file.name,
          headers: result.headers,
          rawRows: [],
          headerRowIndex: result.detectedRow,
        });
        linelistService._saveConfig();
        linelistService._invalidateCache(); // Force rebuild of lookup indexes from new data
        dataManager.setLinelist(result.data);

        this.logToLinelist("info", `📋 Detected ${result.headers?.length || 0} columns`);

        this.renderSmartMapUI(result.headers);
        this.populateSourceSelect(result.headers);
        this.renderX1Builder(result.headers);
        document.getElementById("linelist-mapping-section").style.display = "";
        document.getElementById("linelist-attr-section").style.display = "";

        this.logToLinelist("success", "✓ SmartProcessMap auto-fill complete (check dropdowns)");
      } else if (type === "pipingclass") {
        dataManager.setPipingClassMaster(result.data);
        document.getElementById("pipingclass-mapping-section").style.display = "";
        this.renderPreview('pipingclass', result.data, result.headers);
      }

      // Mirror success summary to linelist log only for non-weight types
      if (type !== "weights") {
        this.logToLinelist("success", `✓ Upload complete: ${result.data.length} rows loaded`);
      }

      const countByType = { linelist: () => dataManager.getLinelist().length, weights: () => dataManager.getWeights().length, pipingclass: () => dataManager.getPipingClassMaster().length };
      const storedCount = (countByType[type] ?? (() => result.data.length))();
      statusEl.textContent = `✓ Loaded ${storedCount} rows from "${file.name}" (header row ${result.detectedRow + 1})`;
      statusEl.style.color = storedCount > 0 ? "var(--green-ok)" : "var(--amber)";

      // Render Mapping UI for all types (including Linelist for Key Columns)
      this.renderMappingUI(type, result.headers);
      this.renderPreview(type, result.data, result.headers);

      // Update drop zone to show success
      const dropZone = document.getElementById(dropZoneMap[type]);
      if (dropZone) {
        dropZone.style.borderColor = "var(--green-ok)";
        dropZone.style.borderStyle = "solid";
      }

      this._showSaveDialog(type, file.name, result.data.length);
    } catch (err) {
      console.error(err);
      statusEl.textContent = `✕ Error: ${err.message}`;
      statusEl.style.color = "var(--red-err)";
      if (type === "weights") this.logToWeight("error", `✕ Parse error: ${err.message}`);
      else this.logToLinelist("error", `✕ Parse error: ${err.message}`);
    }
  }

  // ═══════════════════════════════════════════
  //  PCF Material Map Upload Handler (TXT/CSV)
  // ═══════════════════════════════════════════
  async handleMatMapUpload(file) {
    if (!file) return;

    const statusBar = document.getElementById("matmap-status-bar");
    const statusEl = document.getElementById("matmap-status");
    statusBar.style.display = "";
    statusEl.textContent = "⏳ Parsing Material Map…";

    try {
      const text = await file.text();
      const result = materialService.parseMaterialMap(text);
      dataManager.setMaterialMap(result);

      statusEl.textContent = `✓ Loaded ${result.length} material entries from "${file.name}"`;
      statusEl.style.color = "var(--green-ok)";

      // Render preview table from parsed map
      const headers = ["code", "desc"];
      this.renderPreview("matmap", result, headers);

      // Update drop zone to show success
      const dropZone = document.getElementById("matmap-drop");
      dropZone.style.borderColor = "var(--green-ok)";
      dropZone.style.borderStyle = "solid";

      this._showSaveDialog('matmap', file.name, result.length);
    } catch (err) {
      console.error(err);
      statusEl.textContent = `✕ Error: ${err.message}`;
      statusEl.style.color = "var(--red-err)";
    }
  }

  // ═══════════════════════════════════════════
  //  LineDump Upload Handler (with Line No. Derivation)
  // ═══════════════════════════════════════════
  async handleDumpUpload(file) {
    if (!file) return;

    const statusBar = document.getElementById("dump-status-bar");
    const statusEl = document.getElementById("dump-status");
    statusBar.style.display = "";
    statusEl.textContent = "⏳ Parsing LineDump…";

    try {
      // LineDump headers are fixed/known
      const keywords = [
        "Reference",
        "Name",
        "Type",
        "Pipe",
        "Position",
        "PIPE",
        "NAME",
        "POS",
        "POS WRT /*",
        "SPRE",
        "PIPE OF COMPREF",
        "SITE"
      ];
      const result = await ExcelParser.parse(file, keywords);

      // Derive Line No. from PIPE column using smart logic
      const enrichedData = result.data.map((row) => {
        // Derive immediately
        const pipeVal = row["PIPE"] || row["PIPE OF COMPREF"] || row["Pipe"] || row["pipe"] || "";
        const derived = this.deriveLineNo(pipeVal);
        return { ...row, "Line Number (Derived)": derived };
      });

      // Deduplicate by Position + East + North + Up coordinates.
      // E3D exports often repeat the same physical point for adjacent component ends.
      // Use broad regex matching to handle various E3D column naming conventions:
      //   East  → "East", "E", "Easting", "East (m)", etc.
      //   North → "North", "N", "Northing", "North (m)", etc.
      //   Up    → "Up", "U", "Elev", "Elevation", "Z", "Height", etc.
      // IMPORTANT: if a key column cannot be found, SKIP deduplication entirely —
      // falling back to a non-existent column name makes ALL rows share the same key
      // (empty string) causing nearly all rows to be falsely removed as duplicates.
      const posCol = result.headers.find(h => /^pos/i.test(h));
      const eCol = result.headers.find(h => /^e(ast(ing)?)?(\s|$)/i.test(h) || /^east$/i.test(h));
      const nCol = result.headers.find(h => /^n(orth(ing)?)?(\s|$)/i.test(h) || /^north$/i.test(h));
      const upCol = result.headers.find(h => /^(up|u|elev(ation)?|height|z)(\s|$)/i.test(h));

      let dedupedData;
      let removedDups = 0;

      if (posCol && !eCol && !nCol && !upCol) {
        // E3D sometimes exports all coordinates as a single Position string (e.g. "E ... N ... U ...")
        const seenKeys = new Set();
        dedupedData = enrichedData.filter(row => {
          const posVal = String(row[posCol] || '').trim();
          if (seenKeys.has(posVal)) return false;
          seenKeys.add(posVal);
          return true;
        });
        removedDups = enrichedData.length - dedupedData.length;
      } else if (eCol && nCol && upCol) {
        // All coordinate columns found — perform deduplication
        const seenKeys = new Set();
        dedupedData = enrichedData.filter(row => {
          const key = [
            String(row[posCol || ''] || '').trim(),
            String(row[eCol] || '').trim(),
            String(row[nCol] || '').trim(),
            String(row[upCol] || '').trim(),
          ].join('|');
          if (seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        });
        removedDups = enrichedData.length - dedupedData.length;
      } else {
        // Coordinate columns not identified — skip dedup to avoid false positives
        dedupedData = enrichedData;
        console.warn(`[LineDump] Dedup skipped: could not identify E/N/UP columns in headers: ${result.headers.join(', ')}`);
      }

      dataManager.setLineDump(dedupedData);

      // Show stats
      const uniqueLines = new Set(
        dedupedData.map((r) => r["Line Number"]).filter(Boolean),
      );
      const typeCount = {};
      dedupedData.forEach((r) => {
        const t = r[this._findColumn(result.headers, ["Type"])] || "UNKNOWN";
        typeCount[t] = (typeCount[t] || 0) + 1;
      });

      statusEl.textContent = `✓ Loaded ${dedupedData.length} elements from "${file.name}"${removedDups > 0 ? ` (${removedDups} duplicates removed)` : ''}`;
      statusEl.style.color = "var(--green-ok)";

      // Render stats chips
      const statsEl = document.getElementById("dump-stats");
      statsEl.style.display = "";
      statsEl.innerHTML = `
        <div class="stat-chip"><span class="num">${dedupedData.length}</span><span class="lbl">Elements</span></div>
        <div class="stat-chip"><span class="num">${uniqueLines.size}</span><span class="lbl">Unique Lines</span></div>
        <div class="stat-chip"><span class="num">${Object.keys(typeCount).length}</span><span class="lbl">Component Types</span></div>
      `;

      // Store detected coordinate column names for use in preview rendering
      this._dumpCoordCols = { pos: posCol, e: eCol, n: nCol, up: upCol };

      // Render Header Mapping
      document.getElementById("dump-mapping-section").style.display = "";
      this.renderMappingUI('linedump', result.headers);

      this.renderDumpPreview(dedupedData, result.headers);
      this.renderDumpConfig();

      // Update drop zone
      const dropZone = document.getElementById("dump-drop");
      dropZone.style.borderColor = "var(--green-ok)";
      dropZone.style.borderStyle = "solid";

      this._showSaveDialog('linedump', file.name, dedupedData.length);
    } catch (err) {
      console.error(err);
      statusEl.textContent = `✕ Error: ${err.message}`;
      statusEl.style.color = "var(--red-err)";
    }
  }

  /**
   * Smart Line Number Derivation from PIPE column.
   *
   * Input examples (E3D format):
   *   FCSEE-16"-P0511260-11440A1-01
   *   FCSEE-16"-P0511260-11440A1-01/B1
   *   /FCSEE-16"-P0511260-11440A1-01/B2
   *
   * The split by delimiters [-/"] produces empty strings from adjacent
   * delimiters. These must be FILTERED before indexing by segment position.
   *
   * Also handles various quote characters: ", ", \", etc.
   */
  // pos1 / pos2 can be passed directly (from renderDumpConfig); if not provided, reads from localStorage
  deriveLineNo(pipeStr, pos1, pos2) {
    if (!pipeStr) return "";
    const str = String(pipeStr).trim();

    // Read from localStorage when not provided
    const config = JSON.parse(localStorage.getItem("lineDumpConfig") || "{}");
    const segmentPos  = pos1 ?? parseInt(config.segmentPos  || "3", 10);
    const segmentPos2 = pos2 ?? (config.segmentPos2 ? parseInt(config.segmentPos2, 10) : null);

    // ── Helper: segment strategy ──────────────────────────────────
    const trySegment = (s, pos) => {
      const normalized = s.replace(/[\u201C\u201D\u2033\u02BA\u2036\u2018\u2019]/g, '"');
      const parts = normalized.split(/[-/\\"]+/).filter(p => p.trim() !== "");
      if (parts.length >= pos) return parts[pos - 1].trim().toUpperCase();
      return parts.find(p => p.length >= 4 && /[A-Z0-9]/i.test(p))?.trim().toUpperCase() || "";
    };

    const part1 = trySegment(str, segmentPos);
    if (segmentPos2 && segmentPos2 > 0) {
      const part2 = trySegment(str, segmentPos2);
      return part2 ? `${part1}-${part2}` : part1;
    }
    if (part1) return part1;

    // Regex fallback
    const regexMatch = str.match(/[A-Z]\d{5,}/i);
    if (regexMatch) {
      return regexMatch[0].toUpperCase();
    }

    // Regex found nothing — automatic fallback to segment strategy
    const segFallback = trySegment(str, segmentPos);
    if (segFallback) return segFallback;

    // Final fallback: any segment >= 6 chars with mixed alpha+numeric
    const normalized = str.replace(/[\u201C\u201D\u2033\u02BA]/g, '"');
    const parts = normalized.split(/[-/\\"]+/).filter(p => p.trim() !== "");
    for (const part of parts) {
      const clean = part.trim();
      if (clean.length >= 6 && /[A-Z]/i.test(clean) && /\d/.test(clean)) {
        return clean.toUpperCase();
      }
    }
    return "";
  }

  renderDumpConfig() {
    const configPanel = document.getElementById("dump-derive-config");
    if (!configPanel) return;

    configPanel.style.display = "block";

    const seg1Input = document.getElementById("dump-segment-pos");
    const seg2Input = document.getElementById("dump-segment-pos2");
    const reDeriveBtn = document.getElementById("btn-re-derive");

    // Load saved config
    const savedConfig = JSON.parse(localStorage.getItem("lineDumpConfig") || "{}");
    if (seg1Input && savedConfig.segmentPos)  seg1Input.value  = savedConfig.segmentPos;
    if (seg2Input && savedConfig.segmentPos2) seg2Input.value  = savedConfig.segmentPos2;

    const saveConfig = () => {
      localStorage.setItem("lineDumpConfig", JSON.stringify({
        segmentPos:  seg1Input?.value  || "3",
        segmentPos2: seg2Input?.value  || "",
      }));
    };

    if (seg1Input && !seg1Input.dataset.listener) {
      seg1Input.addEventListener("change", () => { saveConfig(); reDeriveBtn?.click(); });
      seg1Input.dataset.listener = "true";
    }
    if (seg2Input && !seg2Input.dataset.listener) {
      seg2Input.addEventListener("change", () => { saveConfig(); reDeriveBtn?.click(); });
      seg2Input.dataset.listener = "true";
    }

    if (reDeriveBtn && !reDeriveBtn.dataset.listener) {
      reDeriveBtn.addEventListener("click", () => {
        const data = dataManager.lineDumpData;
        if (!data || data.length === 0) return;

        const pos1 = parseInt(seg1Input?.value || "3", 10);
        const pos2Raw = seg2Input?.value?.trim();
        const pos2 = pos2Raw ? parseInt(pos2Raw, 10) : null;

        const enriched = data.map((row) => {
          const pipeVal = row["PIPE"] || row["PIPE OF COMPREF"] || row["Pipe"] || row["pipe"] || "";
          const derived = this.deriveLineNo(pipeVal, pos1, pos2);
          return { ...row, "Line Number (Derived)": derived };
        });

        dataManager.setLineDump(enriched);

        const headers = Object.keys(enriched[0] || {});
        if (!headers.includes("Line Number (Derived)") && enriched.length > 0) {
          headers.push("Line Number (Derived)");
        }

        this.renderDumpPreview(enriched, headers);
        this.logToLinelist("success", `✓ Re-derived ${enriched.length} line numbers`);
      });
      reDeriveBtn.dataset.listener = "true";
    }
  }

  /**
   * Find the actual header name that matches one of the candidate names.
   */
  _findColumn(headers, candidates) {
    for (const c of candidates) {
      const found = headers.find((h) =>
        h.toLowerCase().includes(c.toLowerCase()),
      );
      if (found) return found;
    }
    return null;
  }

  // ═══════════════════════════════════════════
  //  Attribute Mapping (SmartProcessMap)
  // ═══════════════════════════════════════════
  // Build a map of header → preview string "ColName | v1 | v2 | v3 | v4 | v5"
  _buildColPreviewMap(headers) {
    const data = dataManager.getLinelist() || [];
    const previewMap = {};
    headers.forEach(h => {
      const vals = [];
      for (let i = 0; i < data.length && vals.length < 5; i++) {
        const v = data[i][h];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          vals.push(String(v).trim());
        }
      }
      previewMap[h] = vals.length ? `${h} | ${vals.join(' | ')}` : h;
    });
    return previewMap;
  }

  renderSmartMapUI(headers) {
    const container = document.getElementById("smart-map-ui");
    container.innerHTML = "";

    const state = getState("linelist") || {};
    const mapping = state.smartMap || {};       // was incorrectly state.smartMapping — fixed
    const options = state.smartOptions || {};
    const colPreview = this._buildColPreviewMap(headers);

    // Define Rows with IMPROVED ALIASES (more specific patterns first)
    const rows = [
      {
        key: "P1",
        label: "Design Pressure (ATTRIBUTE1)",
        aliases: [
          "Design Pr",
          "Op. Pr",
          "Oper. Pr",
          "Max. Pr",
          "Design Pressure",
          "Operating Pressure",
        ],
      },
      {
        key: "T1",
        label: "Design Temperature (ATTRIBUTE2)",
        aliases: [
          "Design Temp",
          "Max Temp",
          "Op. Temp",
          "Oper. Temp",
          "Operating Temp",
          "Temperature"
        ],
      },
      {
        key: "InsThk",
        label: "Insulation thickness (ATTRIBUTE5)",
        aliases: ["Insulation", "Ins Thk", "Ins. Thk", "Insul", "Insulation thickness"],
      },
      // Density Group
      {
        key: "DensityDirect",
        label: "Density (ATTRIBUTE9)",
        aliases: ["Fluid Density", "Density"],
      },
      {
        key: "DensityGas",
        label: "Gas Density",
        aliases: ["Gas", "Density Gas", "Fluid Den"],
      },
      {
        key: "DensityLiq",
        label: "Liquid Density",
        aliases: ["Liquid", "Density Liq", "Fluid Den"],
      },
      {
        key: "DensityMixed",
        label: "Mixed Density",
        aliases: ["Mixed", "Density Mix"],
      },
      { key: "Phase", label: "Phase Column (for Density)", aliases: ["Phase"] },
      // Other
      {
        key: "HP",
        label: "Hydro Test Pr (COMP-ATTR10)",
        aliases: ["Hydro", "Test Pr", "Hydrostatic", "Hydro Pr"],
      },
      {
        key: "LineRef",
        label: "Line Number (PIPELINE-REF)",
        aliases: ["Derived", "Line No", "Line Number"],
      },
      {
        key: "PipingClass",
        label: "Piping Class (PIPING-CLASS)",
        aliases: ["Piping class", "Piping Spec", "Pipe Spec", "Spec"],
      },
    ];

    // 1. Render Table Rows
    rows.forEach((row) => {
      const div = document.createElement("div");
      div.className = "map-row";
      div.style.marginBottom = "0.5rem";

      const label = document.createElement("label");
      label.textContent = row.label;
      label.style.width = "180px";
      label.style.fontSize = "0.75rem";
      label.style.flexShrink = "0";

      const select = document.createElement("select");
      select.style.cssText =
        "background:var(--bg-0);border:1px solid var(--steel);color:var(--text-primary);padding:0.3rem;border-radius:var(--radius-sm);flex:1;min-width:0;max-width:320px;overflow:hidden;text-overflow:ellipsis;";

      // Empty Option
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "(Select Column)";
      select.appendChild(emptyOpt);

      // Populate Headers
      headers.forEach((h) => {
        // Zero-Trust: skip null/undefined/empty headers — state may carry stale malformed entries
        if (h === null || h === undefined || String(h).trim() === '') return;

        const opt = document.createElement("option");
        opt.value = h;
        opt.dataset.preview = colPreview[h] || h;  // store preview for dropdown display
        opt.textContent = opt.dataset.preview;

        // Auto-select if matches saved mapping OR fuzzy match alias
        const saved = mapping[row.key];
        if (saved === h) {
          opt.selected = true;
        } else if (!saved) {
          // Try auto-match
          const lowerH = h.toLowerCase();
          if (
            row.aliases.some((alias) => lowerH.includes(alias.toLowerCase()))
          ) {
            opt.selected = true;
          }
        }
        select.appendChild(opt);
      });

      // After population: if something is pre-selected, show just the column name (not preview)
      Array.from(select.options).forEach(o => {
        if (o.selected && o.value) o.textContent = o.value;
      });

      // Save on Change
      select.addEventListener("change", (e) => {
        // Restore preview text for all options; show only column name for selected
        Array.from(select.options).forEach(o => {
          o.textContent = (o.selected && o.value) ? o.value : (o.dataset.preview || o.value || '(Select Column)');
        });
        linelistService.updateSmartMapping(row.key, e.target.value);
        // Also save to generic state for table builder compatibility
        const st = getState("linelist") || {};
        st.smartMapping = st.smartMapping || {};
        st.smartMapping[row.key] = e.target.value;
        setState("linelist", st);

        // Auto-persist ProcessMap
        const saveState = { smartMapping: st.smartMapping, smartOptions: st.smartOptions || {}, mapping: st.mapping || {} };
        localStorage.setItem("pcf_smart_process_map", JSON.stringify(saveState));
      });

      // Auto-persist if alias-matched value was selected
      if (select.value && select.value !== "" && !mapping[row.key]) {
        console.log(
          `[SmartMap] Auto-persisting fuzzy match: ${row.key} => ${select.value}`,
        );
        this.logToLinelist(
          "info",
          `  → Auto-filled ${row.key}: "${select.value}"`,
        );
        linelistService.updateSmartMapping(row.key, select.value);
      }

      div.appendChild(label);
      div.appendChild(select);
      container.appendChild(div);
    });

    // 2. Render Density Option Toggle + phase-based hint
    const toggleDiv = document.createElement("div");
    toggleDiv.style.marginTop = "0.5rem";
    toggleDiv.style.fontSize = "0.75rem";
    toggleDiv.style.color = "var(--text-muted)";

    const isMixed = options.densityMixedPreference === "Mixed";
    toggleDiv.innerHTML = `
            <div style="font-size:0.7rem;margin-bottom:4px;color:var(--amber);font-style:italic">
                Phase-based logic (Gas/Liquid/Mixed) applies only when "Density (ATTRIBUTE9)" is not mapped.
                Use Liquid/Mixed:Liquid (Default). If Phase='M', use this preference. Fallback is Liquid.
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem">
                <span>Use Liquid/Mixed:</span>
                <button class="toggle ${isMixed ? "on" : ""}" id="toggle-density-pref" role="switch"></button>
                <span id="density-pref-lbl">${isMixed ? "Mixed" : "Liquid"} (Default)</span>
            </div>
        `;
    container.appendChild(toggleDiv);

    // Wire Toggle
    const btn = toggleDiv.querySelector("#toggle-density-pref");
    const lbl = toggleDiv.querySelector("#density-pref-lbl");
    btn.addEventListener("click", () => {
      const nextState = !btn.classList.contains("on"); // if on, next is off (Liquid)
      btn.classList.toggle("on", nextState);
      const val = nextState ? "Mixed" : "Liquid";
      lbl.textContent = nextState ? "Mixed" : "Liquid (Default)";
      linelistService.updateSmartOptions("densityMixedPreference", val);
    });

  }

  // ── ColumnX1 Formula Builder ──────────────────────────────────────────
  renderX1Builder(headers) {
    const builder = document.getElementById('linelist-x1-builder');
    if (!builder) return;
    builder.style.display = 'block';

    const saved = JSON.parse(localStorage.getItem('pcf_x1_keys') || '{}');
    const colPreview = this._buildColPreviewMap(headers);

    ['x1-key1', 'x1-key2', 'x1-key3'].forEach((selId, idx) => {
      const sel = document.getElementById(selId);
      if (!sel) return;
      const savedKey = saved[`key${idx + 1}`] || '';
      sel.innerHTML = `<option value="">(none)</option>` +
        headers.map(h => `<option value="${h}" ${h === savedKey ? 'selected' : ''}>${colPreview[h] || h}</option>`).join('');
      // Collapse selected option text
      Array.from(sel.options).forEach(o => {
        if (o.value) o.dataset.preview = colPreview[o.value] || o.value;
        if (o.selected && o.value) o.textContent = o.value;
      });
      if (!sel.dataset.listener) {
        sel.addEventListener('change', () => {
          Array.from(sel.options).forEach(o => {
            o.textContent = (o.selected && o.value) ? o.value : (o.dataset.preview || o.value || '(none)');
          });
        });
        sel.dataset.listener = 'true';
      }
    });

    const btn = document.getElementById('btn-derive-line-ref');
    if (btn && !btn.dataset.listener) {
      btn.addEventListener('click', () => this._deriveLineRefKey());
      btn.dataset.listener = 'true';
    }
  }

  _deriveLineRefKey() {
    const k1 = document.getElementById('x1-key1')?.value;
    const k2 = document.getElementById('x1-key2')?.value;
    const k3 = document.getElementById('x1-key3')?.value;
    const keys = [k1, k2, k3].filter(Boolean);

    if (!keys.length) { alert('Select at least one key column.'); return; }

    localStorage.setItem('pcf_x1_keys', JSON.stringify({ key1: k1, key2: k2, key3: k3 }));

    const data = dataManager.getLinelist();
    if (!data || !data.length) { alert('No linelist data loaded.'); return; }

    let count = 0;
    const enriched = data.map(row => {
      const val = keys.map(k => String(row[k] || '').trim()).filter(Boolean).join('');
      if (val) count++;
      return { ...row, ColumnX1: val };
    });

    dataManager.setLinelist(enriched);
    dataManager.updateHeaderMap('linelist', { lineNo: 'ColumnX1' });
    linelistService.updateKeys({ sequenceCol: 'ColumnX1', serviceCol: dataManager.headerMap.linelist.service });

    const statusEl = document.getElementById('x1-derive-status');
    if (statusEl) statusEl.textContent = `✓ ColumnX1 derived for ${count}/${data.length} rows from [${keys.join(' + ')}]`;
    this.logToLinelist('success', `✓ ColumnX1 derived from [${keys.join(', ')}] — ${count} rows updated. headerMap.linelist.lineNo → "ColumnX1"`);

    // Re-render preview with ColumnX1 column
    const allHeaders = Object.keys(enriched[0] || {});
    this.renderPreview('linelist', enriched, allHeaders);
  }

  populateSourceSelect(headers) {
    const sel = document.getElementById("new-attr-source");
    sel.innerHTML = '<option value="">(Select Column)</option>';
    const colPreview = this._buildColPreviewMap(headers);
    headers.forEach((h) => {
      const opt = document.createElement("option");
      opt.value = h;
      opt.dataset.preview = colPreview[h] || h;
      opt.textContent = opt.dataset.preview;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => {
      Array.from(sel.options).forEach(o => {
        o.textContent = (o.selected && o.value) ? o.value : (o.dataset.preview || o.value || '(Select Column)');
      });
    });
  }

  addAttributeMapping() {
    const source = document.getElementById("new-attr-source").value;
    const target = document.getElementById("new-attr-target").value.trim();

    if (source && target) {
      dataManager.setAttributeMapping(source, target);
      this.renderAttributeList();
      document.getElementById("new-attr-target").value = "";
    }
  }

  renderAttributeList() {
    const container = document.getElementById("attr-list");
    container.innerHTML = "";

    const map = dataManager.attributeMap;
    Object.keys(map).forEach((source) => {
      const div = document.createElement("div");
      div.className = "flex items-center gap-1 mb-1";
      div.style.fontSize = "0.78rem";
      div.innerHTML = `
        <span style="color:var(--text-muted);font-family:var(--font-code)">${source}</span>
        <span style="color:var(--text-muted);margin:0 0.3rem">→</span>
        <span style="color:var(--text-code);font-family:var(--font-code)">${map[source]}</span>
        <button class="btn btn-danger btn-sm" style="padding:0 6px;font-size:0.65rem;margin-left:auto">✕</button>
      `;

      div.querySelector("button").addEventListener("click", () => {
        dataManager.removeAttributeMapping(source);
        this.renderAttributeList();
      });

      container.appendChild(div);
    });
  }

  // ═══════════════════════════════════════════
  //  Mapping UI (Linelist + Weights key columns)
  // ═══════════════════════════════════════════
  renderMappingUI(type, headers) {
    const config = dataManager.headerMap[type];
    if (!config) return;
    const uiContainer = document.getElementById(`${type}-mapping-ui`);
    uiContainer.innerHTML = "";

    let autoMatchFound = false;

    // Friendly labels for known keys
    const labelMap = {
      // Linelist
      lineNo: "Line Seq no.",
      service: "Service",
      unit: "Unit",
      area: "Area",
      system: "System",

      // Weights
      size: "Bore",
      schedule: "Schedule",
      weight: "RF/RTJ KG", // Updated Label per User Request
      class: "Rating/Class",
      rating: "Rating", // Alternate if both exist

      // Piping Class
      class: "Piping Class",
      material: "Material Code",
      wall: "Wall Thickness",
      corrosion: "Corrosion Allowance",

      // Line Dump
      position: "Position String",
      x: "East", // Simplified to match "East" in E3D dump (avoiding confusion with East (X))
      y: "North",
      z: "Up",
      lineNo: "ColumnX1 (PCF Line Ref)" // PCF line designator — may differ from numeric Line Number
    };

    // Extra aliases per key for fields whose column headers vary widely in E3D/Excel exports.
    // Checked case-insensitively in both the exact-match and fuzzy-match passes.
    const aliasMap = {
      size: ['bore', 'nb', 'nominal bore', 'dn', 'nps', 'size (nps)', 'pipe size', 'od'],
      weight: ['rf/rtj kg', 'weight', 'wt', 'kg', 'flange weight', 'rtj', 'rf'],
      schedule: ['sch', 'schedule', 'thk', 'thickness'],
      lineNo: ['columnx1', 'column x1', 'line ref', 'line designation', 'line id', 'line tag', 'line no', 'line seq', 'seq no', 'pipe of compref', 'pipe'],
      position: ['pos wrt /*', 'pos', 'position string'],
    };

    Object.keys(config).forEach((key) => {
      // lineNo (ColumnX1) and service are managed by the formula builder — skip from mapping UI
      if (type === 'linelist' && (key === 'lineNo' || key === 'service')) return;

      const div = document.createElement("div");
      div.className = "map-row";
      div.style.display = "flex";
      div.style.alignItems = "center";
      div.style.gap = "0.5rem";

      const label = document.createElement("label");
      label.textContent = labelMap[key] || key; // Use friendly label or fallback to key

      // Status indicator
      const statusSpan = document.createElement("span");
      statusSpan.style.fontSize = "0.9rem";
      statusSpan.style.marginLeft = "auto";
      statusSpan.style.opacity = "0";
      statusSpan.className = `status-${type}-${key}`;

      const select = document.createElement("select");
      select.style.cssText =
        "background:var(--bg-0);border:1px solid var(--steel);color:var(--text-primary);padding:0.3rem;border-radius:var(--radius-sm);flex:1;min-width:0;max-width:260px;overflow:hidden;text-overflow:ellipsis;";

      // Add empty option
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "(Select)";
      select.appendChild(emptyOpt);

      let matchedValue = null;
      let exactMatchFound = false;

      // Rule 2: Strict Match First Logic
      // First pass: look for exact matches (including aliasMap entries)
      const keyAliases = (aliasMap[key] || []).map(a => a.toLowerCase());
      headers.forEach((h) => {
        if (h === null || h === undefined || String(h).trim() === "") return;
        const hClean = String(h).trim().toLowerCase();
        const confClean = String(config[key]).trim().toLowerCase();
        const labelClean = String(labelMap[key] || key).trim().toLowerCase();

        const aliasExact = keyAliases.includes(hClean);
        if (hClean === confClean || hClean === labelClean || aliasExact) {
          exactMatchFound = true;
          matchedValue = h;
          autoMatchFound = true;
        }
      });

      headers.forEach((h) => {
        // Skip null/undefined headers
        if (h === null || h === undefined || String(h).trim() === "") return;

        const opt = document.createElement("option");
        opt.value = h;
        opt.textContent = h;

        const hClean = String(h).trim().toLowerCase();
        const confClean = String(config[key]).trim().toLowerCase();
        const labelClean = String(labelMap[key] || key).trim().toLowerCase();

        // If exact match was found anywhere, only select the exact match
        if (exactMatchFound) {
          if (h === matchedValue) opt.selected = true;
        } else {
          // Fallback to fuzzy match ONLY if no exact match exists in the entire header list.
          // Also check against the aliasMap entries for this key.
          const aliasMatch = keyAliases.some(a => hClean.includes(a) || a.includes(hClean));
          if (hClean.includes(confClean) || confClean.includes(hClean) ||
            hClean.includes(labelClean) || labelClean.includes(hClean) || aliasMatch) {
            opt.selected = true;
            matchedValue = h;
            autoMatchFound = true;
          }
        }

        select.appendChild(opt);
      });

      // Auto-persist matched value
      if (matchedValue && type !== "linelist") {
        dataManager.updateHeaderMap(type, { [key]: matchedValue });
        statusSpan.textContent = "✓";
        statusSpan.style.color = "var(--green-ok)";
        statusSpan.style.opacity = "1";
      } else if (matchedValue) {
        statusSpan.textContent = "✓";
        statusSpan.style.color = "var(--green-ok)";
        statusSpan.style.opacity = "1";
      } else {
        statusSpan.textContent = "⚠";
        statusSpan.style.color = "var(--amber)";
        statusSpan.style.opacity = "0.5";
      }

      select.addEventListener("change", (e) => {
        dataManager.updateHeaderMap(type, { [key]: e.target.value });

        // Update status
        if (e.target.value) {
          statusSpan.textContent = "✓";
          statusSpan.style.color = "var(--green-ok)";
          statusSpan.style.opacity = "1";
        } else {
          statusSpan.textContent = "⚠";
          statusSpan.style.color = "var(--amber)";
          statusSpan.style.opacity = "0.5";
        }

        // Sync Linelist keys if type is linelist
        if (type === "linelist") {
          const currentMap = dataManager.headerMap.linelist || {};
          linelistService.updateKeys({
            sequenceCol: currentMap.lineNo,
            serviceCol: currentMap.service,
          });
        }
      });

      div.appendChild(label);
      div.appendChild(select);
      div.appendChild(statusSpan);
      uiContainer.appendChild(div);
    });

    if (autoMatchFound && type !== "linelist") {
      this.logToLinelist("success", `✓ Auto-matched ${type} header mappings`);
    }
  }

  // ═══════════════════════════════════════════
  //  Data Preview Tables
  // ═══════════════════════════════════════════
  renderPreview(type, data, headers) {
    const container = document.getElementById(`${type}-preview`);
    if (!data || data.length === 0) return;
    container.style.display = "block";

    // Show all columns, rely on horizontal scroll
    const displayHeaders = headers;
    container.innerHTML = "";
    container.appendChild(this._buildPreviewTable(data, displayHeaders, 50));

    // Scroll the preview into view so users can see it loaded
    requestAnimationFrame(() => {
      container.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  renderDumpPreview(data, headers) {
    const container = document.getElementById("dump-preview");
    if (!data || data.length === 0) return;
    container.style.display = "";

    // Detect actual East/North/Up column names via regex (same logic used in deduplication)
    const coordCols = this._dumpCoordCols || {};
    const eColActual  = coordCols.e  || headers.find(h => /^e(ast(ing)?)?(\s|$)/i.test(h) || /^east$/i.test(h));
    const nColActual  = coordCols.n  || headers.find(h => /^n(orth(ing)?)?(\s|$)/i.test(h) || /^north$/i.test(h));
    const upColActual = coordCols.up || headers.find(h => /^(up|u|elev(ation)?|height|z)(\s|$)/i.test(h));
    const posColActual = coordCols.pos || headers.find(h => /^pos/i.test(h));

    // Build priority list with actual column names
    const priorityCols = [
      "Reference of the element", "Reference", "Ref",
      "Name", "NAME", "Type",
      posColActual, "POS WRT /*",
      eColActual, nColActual, upColActual,
      "East", "North", "Up", "EAST", "NORTH", "UP", "Easting", "Northing", "Elevation",
      "PIPE", "Pipe", "PIPE OF COMPREF",
      "Line Number", "Line Number (Derived)", "Line No. (Derived)"
    ].filter(Boolean);

    let displayHeaders = priorityCols.filter(c => headers.includes(c));
    // De-duplicate while preserving order
    displayHeaders = [...new Set(displayHeaders)];

    // If POS WRT exists, inject East, North, Up parser dynamically for the preview
    let previewData = data;
    if (posColActual && displayHeaders.includes(posColActual)) {
      if (!displayHeaders.includes("East")) displayHeaders.splice(displayHeaders.indexOf(posColActual) + 1, 0, "East", "North", "Up");
      
      previewData = data.map(row => {
        const rowData = { ...row };
        const posVal = String(row[posColActual] || "");
        // Regex to match "E 156240mm N 150466mm U 1336mm"
        const eMatch = posVal.match(/E\s*([-.\d]+)/i);
        const nMatch = posVal.match(/N\s*([-.\d]+)/i);
        const uMatch = posVal.match(/U\s*([-.\d]+)/i);
        if (eMatch) rowData["East"] = eMatch[1].trim();
        if (nMatch) rowData["North"] = nMatch[1].trim();
        if (uMatch) rowData["Up"] = uMatch[1].trim();
        return rowData;
      });
    }

    // Fuzzy fallback: if no matches, try key fragments
    if (displayHeaders.length === 0) {
      const keyFragments = ["ref", "name", "type", "pos", "east", "north", "up", "elev", "pipe", "line", "site"];
      displayHeaders = headers.filter(h =>
        keyFragments.some(frag => h.toLowerCase().includes(frag))
      );
    }

    // Last resort: show first 10 columns
    if (displayHeaders.length === 0) {
      displayHeaders = headers.slice(0, 10);
    }

    // Always ensure Line Number (Derived) is included
    if (!displayHeaders.includes("Line Number (Derived)") && headers.includes("Line Number (Derived)")) {
      displayHeaders.push("Line Number (Derived)");
    }

    container.innerHTML = "";
    container.appendChild(this._buildPreviewTable(previewData, displayHeaders, 50));
  }

  _buildPreviewTable(data, displayHeaders, maxRows = 50) {
    const wrap = document.createElement("div");
    wrap.className = "data-table-wrap";
    wrap.style.maxHeight = "400px";
    wrap.style.overflowY = "auto";
    wrap.style.overflowX = "auto";
    wrap.style.width = "100%";
    wrap.style.maxWidth = "100%";
    // Note: overflow-x: auto is handled by CSS class .data-table-wrap, but forced here for safety

    const table = document.createElement("table");
    table.className = "data-table";

    // Header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    displayHeaders.forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      // Highlight the derived column
      if (h === "Line Number" || h === "Line No. (Derived)" || h === "Line Number (Derived)") {
        th.style.color = "var(--amber)";
      }
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement("tbody");
    data.slice(0, maxRows).forEach((row) => {
      const tr = document.createElement("tr");
      displayHeaders.forEach((h) => {
        const td = document.createElement("td");
        const val = row[h];
        td.textContent = val !== undefined && val !== null ? String(val) : "";
        // Highlight derived line number
        if ((h === "Line Number" || h === "Line No. (Derived)" || h === "Line Number (Derived)") && val) {
          td.style.color = "var(--green-ok)";
          td.style.fontWeight = "600";
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    if (data.length > maxRows) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = displayHeaders.length;
      td.style.cssText =
        "text-align:center;color:var(--text-muted);font-style:italic;padding:0.5rem";
      td.textContent = `… and ${data.length - maxRows} more rows`;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  // ══════════════════════════════════════
  //  Diagnostic Logging for Linelist
  // ══════════════════════════════════════
  logToLinelist(level, message) {
    // Map legacy levels to DiagnosticLogger
    switch (level) {
      case "success":
        this.logger.success(message);
        break;
      case "error":
        this.logger.error(message);
        break;
      case "warn":
        this.logger.warn(message);
        break;
      default:
        this.logger.info(message);
    }
    this.updateLog();
  }

  updateLog() {
    const logDiv = document.getElementById("linelist-diagnostic-log");
    if (!logDiv) return;

    logDiv.innerHTML = this.logger.getHTML(this.logFilter);

    // Auto-scroll
    const panel = logDiv.parentElement;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }

  clearLinelistLog() {
    this.logger.reset();
    this.updateLog();
    const logDiv = document.getElementById("linelist-diagnostic-log");
    if (logDiv && this.logger.logs.length === 0) {
      logDiv.innerHTML =
        '<span style="color:var(--text-muted)">Log cleared. Upload a linelist file to see detailed processing logs...</span>';
    }
  }

  // ══════════════════════════════════════
  //  Weight Diagnostic Logging
  // ══════════════════════════════════════
  logToWeight(level, message) {
    switch (level) {
      case "success": this.weightLogger.success(message); break;
      case "error":   this.weightLogger.error(message);   break;
      case "warn":    this.weightLogger.warn(message);    break;
      default:        this.weightLogger.info(message);
    }
    this.updateWeightLog();
  }

  updateWeightLog() {
    const logDiv = document.getElementById("weights-diagnostic-log");
    if (!logDiv) return;
    logDiv.innerHTML = this.weightLogger.getHTML(this.weightLogFilter);
    const panel = logDiv.parentElement;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }

  clearWeightLog() {
    this.weightLogger.reset();
    this.updateWeightLog();
    const logDiv = document.getElementById("weights-diagnostic-log");
    if (logDiv && this.weightLogger.logs.length === 0) {
      logDiv.innerHTML =
        '<span style="color:var(--text-muted)">Log cleared. Upload a weight Excel file to see detailed parsing logs...</span>';
    }
  }

  _injectLogFilters() {
    // Find panel header for Linelist Log
    const logPanel = document.getElementById("linelist-log-panel");
    if (!logPanel) return;

    const header = logPanel.querySelector(".panel-header");
    if (!header || header.dataset.filtersInjected) return;

    // Container for filters
    const filterGroup = document.createElement("div");
    filterGroup.className = "btn-group";
    filterGroup.style.marginLeft = "auto"; // Push to right
    filterGroup.style.marginRight = "0.5rem";

    const filters = [
      { label: "All", val: "ALL", color: "var(--steel)" },
      { label: "Warn", val: "WARN", color: "var(--amber)" },
      { label: "Err", val: "ERROR", color: "var(--red-err)" },
    ];

    filters.forEach((f) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-sm btn-secondary";
      btn.textContent = f.label;
      btn.style.borderColor = f.color;
      btn.style.color = f.color;
      btn.onclick = () => {
        this.logFilter = f.val;
        this.updateLog();
        filterGroup
          .querySelectorAll("button")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      };
      if (f.val === "ALL") btn.classList.add("active");
      filterGroup.appendChild(btn);
    });

    // Insert before the Clear button
    const clearBtn = document.getElementById("btn-clear-linelist-log");
    header.insertBefore(filterGroup, clearBtn);
    header.dataset.filtersInjected = "true";
  }
}
