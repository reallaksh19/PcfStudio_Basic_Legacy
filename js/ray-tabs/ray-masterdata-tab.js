/**
 * ray-masterdata-tab.js — Master Data tab for ray.html
 * Instantiates MasterDataController (all existing sub-tabs) then injects
 * a "CA & Rating Config" sub-tab sourced from DEFAULT_CONFIG.caDefinitions.
 */

import { MasterDataController } from '../ui/master-data-controller.js';
import { getConfig, saveConfig } from '../config/config-store.js';
import { DEFAULT_CONFIG }       from '../config/defaults.js';
import { linelistService }      from '../services/linelist-service.js';

export function initRayMasterData() {
  // Initialise the main Master Data controller into the container
  linelistService.init();
  new MasterDataController('integ-app-container');

  // After controller renders, inject "CA & Rating Config" sub-tab
  requestAnimationFrame(() => _injectCaConfigTab());
}

function _injectCaConfigTab() {
  const container = document.getElementById('integ-app-container');
  if (!container) return;

  const tabBar = container.querySelector('.integ-tabs');
  const content = container.querySelector('.integ-content');
  if (!tabBar || !content) return;

  // ── Add tab button ──────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.className = 'tab-btn';
  btn.dataset.tab = 'ca-config';
  btn.textContent = 'CA, Rating and Misc Config';
  tabBar.appendChild(btn);

  // ── Add tab pane (starts hidden) ────────────────────────────────
  const pane = document.createElement('div');
  pane.id = 'ca-config';
  pane.className = 'tab-pane';
  pane.style.display = 'none';   // explicitly hidden until tab is clicked
  pane.innerHTML = _buildCaConfigHtml();
  content.appendChild(pane);

  // ── Wire CA tab button click ────────────────────────────────────
  btn.addEventListener('click', () => {
    // Hide all other panes (both class and inline style)
    tabBar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    content.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none';
    });
    btn.classList.add('active');
    pane.classList.add('active');
    pane.style.display = '';   // restore to CSS block
  });

  // ── Patch existing tab buttons to hide CA pane when clicked ─────
  tabBar.querySelectorAll('.tab-btn:not([data-tab="ca-config"])').forEach(origBtn => {
    origBtn.addEventListener('click', () => {
      pane.classList.remove('active');
      pane.style.display = 'none';
    });
  });

  // ── Wire save/reset buttons ─────────────────────────────────────
  pane.querySelector('#ca-config-save')?.addEventListener('click', _saveCaConfig);
  pane.querySelector('#ca-config-reset')?.addEventListener('click', _resetCaConfig);
}

function _buildCaConfigHtml() {
  const cfg  = getConfig();
  const defs = cfg.caDefinitions || {};
  const rpm  = cfg.ratingPrefixMap || DEFAULT_CONFIG.ratingPrefixMap || {};
  const autoLoadPipingClass = cfg.smartData?.autoLoadPipingClassMasters === true;
  const twoChar = rpm.twoChar || { '10': 10000, '20': 20000, '15': 1500, '25': 2500 };
  const oneChar = rpm.oneChar || { '1': 150, '3': 300, '6': 600, '9': 900, '5': 5000 };

  const pcLogic    = cfg.smartData?.pipingClassLogic || DEFAULT_CONFIG.smartData?.pipingClassLogic || {};
  const pcDelim    = pcLogic.tokenDelimiter || '-';
  const pcSegment  = typeof pcLogic.tokenIndex === 'number' ? pcLogic.tokenIndex + 1 : 5; // UI is 1-based
  const elevOffset = cfg.smartData?.e3dElevationOffset ?? 100000;

  const caRows = Object.entries(defs).map(([key, def]) => {
    const ro = def.readonly ? 'readonly style="opacity:0.5"' : '';
    const writeOnVal = Array.isArray(def.writeOn) ? def.writeOn.join(', ') : (def.writeOn || '');
    return `
      <tr>
        <td style="padding:4px 8px;font-family:var(--font-code);color:var(--amber);font-size:0.75rem;white-space:nowrap">${key}</td>
        <td style="padding:4px 8px"><input class="config-input ca-def-label" data-key="${key}" data-field="label"
          value="${def.label || ''}" style="width:140px;font-size:0.75rem" ${ro}></td>
        <td style="padding:4px 8px"><input class="config-input ca-def-csv" data-key="${key}" data-field="csvField"
          value="${def.csvField || ''}" style="width:140px;font-size:0.75rem" ${ro}></td>
        <td style="padding:4px 8px"><input class="config-input ca-def-unit" data-key="${key}" data-field="unit"
          value="${def.unit || ''}" style="width:60px;font-size:0.75rem" ${ro}></td>
        <td style="padding:4px 8px"><input class="config-input ca-def-default" data-key="${key}" data-field="default"
          value="${def.default ?? ''}" style="width:70px;font-size:0.75rem" ${ro}></td>
        <td style="padding:4px 8px"><input class="config-input ca-def-writeon" data-key="${key}" data-field="writeOn"
          value="${writeOnVal}" style="width:160px;font-size:0.75rem" ${ro}
          title="'all' | 'all-except-support' | comma-separated PCF types"></td>
        <td style="padding:4px 8px"><input class="config-input ca-def-zeroval" data-key="${key}" data-field="zeroValue"
          value="${def.zeroValue ?? ''}" style="width:100px;font-size:0.75rem" ${ro}
          title="Text to write when value=0. Empty = write '0 {unit}'"></td>
      </tr>`;
  }).join('');

  const buildPrefixRows = (map) => Object.entries(map).map(([prefix, rating]) => `
    <tr>
      <td style="padding:3px 6px;border:1px solid var(--steel)">
        <input class="config-input" data-prefix="${prefix}" style="width:50px;font-size:0.72rem;font-family:var(--font-code)" value="${prefix}">
      </td>
      <td style="padding:3px 6px;border:1px solid var(--steel)">
        <input class="config-input" data-rating="${prefix}" style="width:70px;font-size:0.72rem;font-family:var(--font-code)" value="${rating}">
      </td>
    </tr>`).join('');

  return `
    <div style="padding:0.75rem;overflow:auto;height:100%">
      <!-- ── CA Attribute Definitions ─────────────────────────── -->
      <div class="flex gap-1 items-center mb-1">
        <h3 style="font-family:var(--font-code);font-size:0.85rem;color:var(--amber);margin:0">CA ATTRIBUTE DEFINITIONS</h3>
        <span style="font-size:0.72rem;color:var(--text-muted);margin-left:0.5rem">Sourced from main app config</span>
        <div style="margin-left:auto;display:flex;gap:0.5rem">
          <button class="btn btn-primary btn-sm" id="ca-config-save">✓ Save</button>
          <button class="btn btn-secondary btn-sm" id="ca-config-reset">↺ Reset Defaults</button>
        </div>
      </div>
      <div style="overflow:auto">
        <table style="border-collapse:collapse;width:100%;font-size:0.75rem">
          <thead>
            <tr style="border-bottom:2px solid var(--steel)">
              <th style="padding:4px 8px;text-align:left;color:var(--text-muted);font-size:0.7rem">Slot</th>
              <th style="padding:4px 8px;text-align:left;color:var(--text-muted);font-size:0.7rem">Label</th>
              <th style="padding:4px 8px;text-align:left;color:var(--text-muted);font-size:0.7rem">CSV Field</th>
              <th style="padding:4px 8px;text-align:left;color:var(--text-muted);font-size:0.7rem">Unit</th>
              <th style="padding:4px 8px;text-align:left;color:var(--text-muted);font-size:0.7rem">Default</th>
              <th style="padding:4px 8px;text-align:left;color:var(--text-muted);font-size:0.7rem">Write On</th>
              <th style="padding:4px 8px;text-align:left;color:var(--text-muted);font-size:0.7rem">Zero Value</th>
            </tr>
          </thead>
          <tbody id="ca-defs-tbody">${caRows}</tbody>
        </table>
      </div>
      <p class="text-muted text-xs" style="margin-top:0.5rem">
        <strong>Write On:</strong> <code>all</code> = all component types &nbsp;|&nbsp;
        <code>all-except-support</code> = all except SUPPORT &nbsp;|&nbsp;
        comma-separated PCF types (e.g. <code>FLANGE, VALVE</code>)
      </p>

      <!-- ── Piping Class Auto-Load Toggle + Segment Parse ────── -->
      <h3 style="font-family:var(--font-code);font-size:0.85rem;color:var(--amber);margin:1.25rem 0 0.4rem">
        PIPING CLASS MASTER
      </h3>
      <label style="display:flex;align-items:center;gap:0.6rem;font-size:0.78rem;cursor:pointer;user-select:none;margin-bottom:0.75rem">
        <input type="checkbox" id="ca-toggle-autoload-pipingclass" ${autoLoadPipingClass ? 'checked' : ''}
          style="width:14px;height:14px;accent-color:var(--amber);cursor:pointer">
        <span>Auto-load Piping Class Master into memory on startup</span>
        <span style="color:var(--text-muted);font-size:0.7rem">(off = stays in localStorage dormant; on = parsed into memory for piping class lookups)</span>
      </label>

      <div style="background:var(--bg-panel);border:1px solid var(--steel);border-radius:4px;padding:0.6rem 0.75rem">
        <div style="font-size:0.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:0.4rem">
          PIPELINE-REFERENCE → Piping Class
          <span style="font-size:0.7rem;color:var(--text-muted);font-weight:400;margin-left:0.4rem">
            — used by 📍 Pipeline button to derive piping class from the matched pipeline reference
          </span>
        </div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.5rem">
          Splits the pipeline reference string by the delimiter and picks the Nth segment as piping class.
          e.g. <code style="background:var(--bg-0);padding:1px 4px;border-radius:2px">ABC-DEF-GHI-JKL-15A4-X</code> → segment 5 → <strong>15A4</strong>
        </div>
        <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
          <label style="font-size:0.75rem;color:var(--text-muted);display:flex;align-items:center;gap:0.4rem">
            Delimiter
            <input id="ca-pc-delimiter" type="text" value="${pcDelim}"
              style="width:36px;font-size:0.75rem;font-family:var(--font-code);background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:2px 6px;text-align:center">
          </label>
          <label style="font-size:0.75rem;color:var(--text-muted);display:flex;align-items:center;gap:0.4rem">
            Segment #
            <input id="ca-pc-segment" type="number" min="1" max="20" value="${pcSegment}"
              style="width:52px;font-size:0.75rem;font-family:var(--font-code);background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:2px 6px;text-align:center">
            <span style="color:var(--text-muted);font-size:0.68rem">(1-based)</span>
          </label>
        </div>
      </div>

      <!-- ── Rating Detection — Piping Class Prefix ────────────── -->
      <h3 style="font-family:var(--font-code);font-size:0.85rem;color:var(--amber);margin:1.25rem 0 0.4rem">
        RATING DETECTION — PIPING CLASS PREFIX
      </h3>
      <p style="font-size:0.72rem;color:var(--text-muted);margin:0 0 0.6rem">
        2-char prefix checked first, then 1-char fallback.
        e.g. pipingClass <code>"15A4"</code> → prefix <code>"15"</code> → rating <strong>1500</strong>.
        Used by "📥 Load data from Masters" in the CSV→PCF tab.
      </p>
      <div style="display:flex;gap:2rem;flex-wrap:wrap">
        <div>
          <div style="font-size:0.7rem;color:var(--text-muted);font-weight:600;margin-bottom:0.3rem">2-CHAR PREFIX</div>
          <table id="prefix2-table" style="border-collapse:collapse;font-size:0.72rem">
            <thead><tr>
              <th style="padding:3px 8px;border:1px solid var(--steel);color:var(--amber);background:var(--bg-panel);text-align:left">Prefix</th>
              <th style="padding:3px 8px;border:1px solid var(--steel);color:var(--amber);background:var(--bg-panel);text-align:left">→ Rating</th>
            </tr></thead>
            <tbody id="prefix2-tbody">${buildPrefixRows(twoChar)}</tbody>
          </table>
        </div>
        <div>
          <div style="font-size:0.7rem;color:var(--text-muted);font-weight:600;margin-bottom:0.3rem">1-CHAR PREFIX</div>
          <table id="prefix1-table" style="border-collapse:collapse;font-size:0.72rem">
            <thead><tr>
              <th style="padding:3px 8px;border:1px solid var(--steel);color:var(--amber);background:var(--bg-panel);text-align:left">Prefix</th>
              <th style="padding:3px 8px;border:1px solid var(--steel);color:var(--amber);background:var(--bg-panel);text-align:left">→ Rating</th>
            </tr></thead>
            <tbody id="prefix1-tbody">${buildPrefixRows(oneChar)}</tbody>
          </table>
        </div>
      </div>

      <!-- ── Misc / Coordinate Config ──────────────────────────────── -->
      <h3 style="font-family:var(--font-code);font-size:0.85rem;color:var(--amber);margin:1.25rem 0 0.4rem">
        MISC / COORDINATE CONFIG
      </h3>
      <div style="background:var(--bg-panel);border:1px solid var(--steel);border-radius:4px;padding:0.6rem 0.75rem">
        <div style="font-size:0.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:0.3rem">
          E3D Coordinate — Elevation Offset
        </div>
        <p style="font-size:0.72rem;color:var(--text-muted);margin:0 0 0.5rem">
          Added to the <strong>Up</strong> coordinate of every Line Dump row before pipeline reference matching.
          Use when E3D exports Line Dump in a local/relative z-datum while component coordinates include a global elevation.
          <br>e.g. offset = 100000 → Line Dump Up 50 becomes 100050 for matching.
        </p>
        <label style="font-size:0.75rem;color:var(--text-muted);display:flex;align-items:center;gap:0.5rem">
          Elevation Offset (mm)
          <input id="ca-misc-elev-offset" type="number" step="1" value="${elevOffset}"
            style="width:110px;font-size:0.75rem;font-family:var(--font-code);background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:2px 6px">
          <span style="color:var(--text-muted);font-size:0.68rem">default: 100000 &nbsp;|&nbsp; set 0 to disable</span>
        </label>
      </div>
    </div>`;
}

function _saveCaConfig() {
  const cfg  = getConfig();
  const defs = { ...cfg.caDefinitions };

  // Save CA definitions
  document.querySelectorAll('#ca-defs-tbody tr').forEach(row => {
    const key = row.querySelector('[data-key]')?.dataset.key;
    if (!key || !defs[key]) return;
    row.querySelectorAll('[data-field]').forEach(input => {
      if (input.readOnly) return;
      const field = input.dataset.field;
      let val = input.value.trim();
      if (field === 'writeOn' && val.includes(',')) {
        val = val.split(',').map(v => v.trim()).filter(Boolean);
      } else if (field === 'default' && !isNaN(Number(val)) && val !== '') {
        val = Number(val);
      } else if (val === '') {
        val = null;
      }
      defs[key][field] = val;
    });
  });
  cfg.caDefinitions = defs;

  // Save piping class auto-load toggle + segment parse config
  cfg.smartData = cfg.smartData || {};
  const autoLoadEl = document.getElementById('ca-toggle-autoload-pipingclass');
  if (autoLoadEl) cfg.smartData.autoLoadPipingClassMasters = autoLoadEl.checked;

  const pcDelimEl   = document.getElementById('ca-pc-delimiter');
  const pcSegmentEl = document.getElementById('ca-pc-segment');
  if (pcDelimEl || pcSegmentEl) {
    cfg.smartData.pipingClassLogic = cfg.smartData.pipingClassLogic || {};
    if (pcDelimEl && pcDelimEl.value.trim()) {
      cfg.smartData.pipingClassLogic.tokenDelimiter = pcDelimEl.value.trim();
    }
    if (pcSegmentEl) {
      const seg = parseInt(pcSegmentEl.value, 10);
      if (!isNaN(seg) && seg >= 1) cfg.smartData.pipingClassLogic.tokenIndex = seg - 1; // store 0-based
    }
  }

  // Save rating prefix maps
  const readPrefixTable = (tbodyId) => {
    const result = {};
    document.querySelectorAll(`#${tbodyId} tr`).forEach(row => {
      const inputs = row.querySelectorAll('input');
      if (inputs.length < 2) return;
      const prefix = inputs[0].value.trim();
      const rating = Number(inputs[1].value.trim());
      if (prefix && !isNaN(rating) && rating > 0) result[prefix] = rating;
    });
    return result;
  };
  cfg.ratingPrefixMap = {
    twoChar: readPrefixTable('prefix2-tbody'),
    oneChar: readPrefixTable('prefix1-tbody')
  };

  // Save misc / coordinate config
  const elevOffsetEl = document.getElementById('ca-misc-elev-offset');
  if (elevOffsetEl) {
    const val = parseFloat(elevOffsetEl.value);
    cfg.smartData.e3dElevationOffset = isNaN(val) ? 0 : val;
  }

  saveConfig(cfg);
  _showSaveStatus('✓ Saved');
}

function _resetCaConfig() {
  if (!confirm('Reset CA definitions, rating prefix map, and misc config to defaults?')) return;
  const cfg = getConfig();
  cfg.caDefinitions   = DEFAULT_CONFIG.caDefinitions;
  cfg.ratingPrefixMap = DEFAULT_CONFIG.ratingPrefixMap;
  cfg.smartData = cfg.smartData || {};
  cfg.smartData.e3dElevationOffset = DEFAULT_CONFIG.smartData.e3dElevationOffset;
  saveConfig(cfg);
  _reinjectCaPane();
}

function _reinjectCaPane() {
  const pane = document.getElementById('ca-config');
  if (pane) pane.innerHTML = _buildCaConfigHtml();
  document.querySelector('#ca-config #ca-config-save')?.addEventListener('click', _saveCaConfig);
  document.querySelector('#ca-config #ca-config-reset')?.addEventListener('click', _resetCaConfig);
}

function _showSaveStatus(msg) {
  const btn = document.getElementById('ca-config-save');
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = orig; }, 1500);
}
