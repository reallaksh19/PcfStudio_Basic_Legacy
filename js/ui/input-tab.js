/**
 * input-tab.js — INPUT Tab UI
 * Handles: file upload, drag-drop, paste, parse button, header mapping table, data preview.
 * Happy path: file → parse → show stats + mapping + preview.
 */

import { getConfig } from "../config/config-store.js";
import { setState, getState, resetStateForNewFile } from "../state.js";
import { clearDebugTab } from "./debug-tab.js";
import { updateStatusBar } from "../app.js";
import { switchTab } from "./tab-manager.js";
import { parseCSV, readFileAsText } from "../input/csv-parser.js";
import { readExcelAsCSV, isExcelFile } from "../input/excel-parser.js";
import { mapHeaders, applyHeaderMap } from "../input/header-mapper.js";
import { normaliseRows } from "../input/unit-transformer.js";

const LOG_PREFIX = "[InputTab]";

/** Cached DOM refs — grabbed once on init. */
let _dom = {};

export function initInputTab() {
  _dom = {
    dropZone: document.getElementById("drop-zone"),
    fileInput: document.getElementById("file-input"),
    psiBtn: document.getElementById("btn-psi-correction"),
    rayModeBtn: document.getElementById("btn-ray-mode"),
    pasteToggle: document.getElementById("btn-paste-toggle"),
    pasteArea: document.getElementById("paste-area"),
    pasteTxt: document.getElementById("paste-textarea"),
    parseBtn: document.getElementById("btn-parse"),
    appendToggle: document.getElementById("btn-append-toggle"),
    appendArea: document.getElementById("append-area"),
    appendTxt: document.getElementById("append-textarea"),
    appendParseBtn: document.getElementById("btn-append-parse"),
    clearBtn: document.getElementById("btn-clear"),
    nextBtn: document.getElementById("btn-input-next"),
    statsWrap: document.getElementById("parse-stats"),
    headerMapWrap: document.getElementById("header-map-wrap"),
    headerMapTable: document.getElementById("header-map-table"),
    previewWrap: document.getElementById("preview-wrap"),
    previewTable: document.getElementById("preview-table"),
    filenameLabel: document.getElementById("filename-label"),
  };

  const missing = Object.entries(_dom).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.warn(`${LOG_PREFIX} Missing DOM elements: ${missing.join(", ")}`);
  }

  wireDropZone();
  wireFileInput();
  wirePsiCorrectionBtn();
  wireRayModeBtn();
  wirePasteToggle();
  wireParseBtn();
  wireAppendToggle();
  wireAppendParseBtn();
  wireClearBtn();
  wireNextBtn();

  // Load default headers from localStorage if available
  loadDefaultHeaders();

  console.info(`${LOG_PREFIX} Input tab initialised.`);
}

// ── File handling ─────────────────────────────────────────────────

function wireDropZone() {
  const dz = _dom.dropZone;
  if (!dz) return;
  dz.addEventListener("click", () => _dom.fileInput?.click());
  dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("drag-over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag-over"));
  dz.addEventListener("drop", e => { e.preventDefault(); dz.classList.remove("drag-over"); handleFiles(e.dataTransfer.files); });
}

function wireFileInput() {
  _dom.fileInput?.addEventListener("change", e => handleFiles(e.target.files));
}

/** Apply (or clear) PSI mode state and sync button appearance. */
function _setPsiMode(on) {
  window.__PSI_CORRECTION_MODE = on;
  if (_dom.psiBtn) {
    _dom.psiBtn.classList.toggle("active", on);
    _dom.psiBtn.textContent = on ? "PSI Correction: ON" : "PSI Correction: OFF";
  }
}

function wirePsiCorrectionBtn() {
  // Initialise button label to reflect current (OFF) state
  if (_dom.psiBtn) _dom.psiBtn.textContent = "PSI Correction: OFF";

  _dom.psiBtn?.addEventListener("click", () => {
    const text = getState("rawText");
    if (!text) {
      showError("No data available. Please upload or paste CSV data first.");
      return;
    }

    const turningOn = !window.__PSI_CORRECTION_MODE;
    _setPsiMode(turningOn);
    console.info(`${LOG_PREFIX} PSI Correction toggled ${turningOn ? "ON" : "OFF"}. Reparsing pipeline...`);

    runPipeline(text, getState("meta")?.filename || "PSI-Data").then(() => {
      showError(`PSI Correction ${turningOn ? "applied" : "removed"} successfully.`, "success");
    });
  });
}

function wireRayModeBtn() {
  _dom.rayModeBtn?.addEventListener("click", () => {
    const turningOn = !window.__RAY_MODE;
    window.__RAY_MODE = turningOn;
    if (_dom.rayModeBtn) {
      _dom.rayModeBtn.classList.toggle("active", turningOn);
      _dom.rayModeBtn.textContent = turningOn ? "⚡ Ray Mode: ON" : "⚡ Ray Mode: OFF";
    }
    console.info(`${LOG_PREFIX} Ray Mode toggled ${turningOn ? "ON" : "OFF"}.`);
    // Re-run pipeline so Ray PCF is regenerated with new mode flag if needed
    const text = getState("rawText");
    if (text) {
      runPipeline(text, getState("meta")?.filename || "data").then(() => {
        showError(`Ray Mode ${turningOn ? "enabled" : "disabled"}.`, "success");
      });
    }
  });
}

function wirePasteToggle() {
  _dom.pasteToggle?.addEventListener("click", () => {
    const show = !_dom.pasteArea?.classList.contains("visible");
    _dom.pasteArea?.classList.toggle("visible", show);
    if (_dom.pasteToggle) _dom.pasteToggle.textContent = show ? "✕ Close Paste" : "⌗ Paste CSV";
    // Close append panel if paste is opening
    if (show) {
      _dom.appendArea?.classList.remove("visible");
      if (_dom.appendToggle) _dom.appendToggle.textContent = "＋ Append CSV";
    }
  });
}

function wireAppendToggle() {
  _dom.appendToggle?.addEventListener("click", () => {
    const show = !_dom.appendArea?.classList.contains("visible");
    _dom.appendArea?.classList.toggle("visible", show);
    if (_dom.appendToggle) {
      _dom.appendToggle.textContent = show ? "✕ Close Append" : "＋ Append CSV";
      _dom.appendToggle.classList.toggle("active", show);
    }
    // Close paste panel if append is opening
    if (show) {
      _dom.pasteArea?.classList.remove("visible");
      if (_dom.pasteToggle) _dom.pasteToggle.textContent = "⌗ Paste CSV";
    }
  });
}

function wireAppendParseBtn() {
  _dom.appendParseBtn?.addEventListener("click", () => {
    const text = _dom.appendTxt?.value?.trim();
    if (!text) { showError("No data to append. Paste CSV rows into the append field first."); return; }
    const existingRows = getState("normalizedRows") || [];
    if (!existingRows.length) {
      showError("No existing data to append to. Load a file or parse CSV first.");
      return;
    }
    runAppendPipeline(text);
  });
}

function wireParseBtn() {
  _dom.parseBtn?.addEventListener("click", () => {
    const text = getState("rawText");
    if (!text) { showError("No data to parse. Upload a file or paste CSV first."); return; }
    runPipeline(text, getState("meta")?.filename || "pasted-data");
  });
}

function wireClearBtn() {
  _dom.clearBtn?.addEventListener("click", () => {
    setState("rawText", "");
    setState("rawRows", []);
    setState("headerMap", {});
    setState("canonicalRows", []);
    setState("normalizedRows", []);
    setState("meta", { filename: "", rowCount: 0, groupCount: 0, processedAt: null });
    clearUI();
    console.info(`${LOG_PREFIX} Cleared all input data.`);
  });
}

function wireNextBtn() {
  _dom.nextBtn?.addEventListener("click", () => {
    const rows = getState("normalizedRows");
    if (!rows?.length) {
      showError("Please load and parse data before proceeding.");
      return;
    }
    switchTab('mapping');
  });
}

/** Entry point for both file drop and file input. */
async function handleFiles(fileList) {
  if (!fileList?.length) return;
  const file = fileList[0];

  // ── Append Mode: route file into the merge pipeline ──────────────
  const appendModeActive = _dom.appendToggle?.classList.contains("active");
  const existingRows = getState("normalizedRows") || [];
  if (appendModeActive && existingRows.length) {
    setLoading(true, `Reading ${file.name} for append…`);
    try {
      let text;
      let displayName = file.name;
      if (isExcelFile(file)) {
        const result = await readExcelAsCSV(file);
        text = result.csv;
        displayName = `${file.name} > ${result.sheetName}`;
      } else {
        text = await readFileAsText(file);
      }
      text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      await runAppendPipeline(text, displayName);
    } catch (err) {
      console.error(`${LOG_PREFIX} handleFiles (append) error: ${err.message}`, err);
      showError(`Could not read/append file: ${err.message}`);
    } finally {
      setLoading(false);
    }
    return; // skip normal replace flow
  }

  // ── Normal Mode: replace all state ───────────────────────────────
  setLoading(true, `Reading ${file.name}…`);
  try {
    let text;
    let displayName = file.name;

    if (isExcelFile(file)) {
      const result = await readExcelAsCSV(file);
      text = result.csv;
      displayName = `${file.name} > ${result.sheetName}`;
    } else {
      text = await readFileAsText(file);
    }

    // Normalise line endings (CR -> LF) to handle legacy Mac/Excel CSVs robustly
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Reset all processing state (preserves masters + config) and clear debug UI
    resetStateForNewFile();
    clearDebugTab();
    _setPsiMode(false); // Reset PSI toggle to OFF for new file
    // Reset Ray Mode toggle to OFF for new file
    window.__RAY_MODE = false;
    if (_dom.rayModeBtn) {
      _dom.rayModeBtn.classList.remove("active");
      _dom.rayModeBtn.textContent = "⚡ Ray Mode: OFF";
    }

    setState("rawText", text);
    setState("meta", { filename: file.name, rowCount: 0, groupCount: 0, processedAt: null });

    setFilenameLabel(`File Upload: ${displayName}`);
    _dom.dropZone?.classList.add("has-file");

    console.info(`${LOG_PREFIX} File loaded: "${displayName}". Text length: ${text.length}`);
    await runPipeline(text, file.name);
  } catch (err) {
    console.error(`${LOG_PREFIX} handleFiles error for "${file.name}". Reason: ${err.message}`, err);
    showError(`Could not read file: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

/** Append pipeline: parse new CSV and merge its rows into existing state.
 * @param {string} text - raw CSV/TSV text
 * @param {string} [filename] - display name for toast (defaults to 'pasted data')
 */
async function runAppendPipeline(text, filename = "pasted data") {
  setLoading(true, "Appending…");
  updateStatusBar("parsing", "appending rows");

  try {
    const config = getConfig();

    // Normalise line endings
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Step 1: Parse the new CSV chunk
    const { headers, rows, errors } = parseCSV(text, config.inputSettings);
    if (!rows.length) { showError("No rows found in append data. Check format."); return; }

    // Step 2: Map headers to canonical names
    const { headerMap } = mapHeaders(headers, config.headerAliases);

    // Step 3: Apply header map
    const canonicalRows = applyHeaderMap(rows, headerMap);

    // Step 4: Normalise units
    const newNormalizedRows = normaliseRows(canonicalRows, config.unitStripping);

    // Step 5: Merge into existing state
    const existingRawRows = getState("rawRows") || [];
    const existingCanonical = getState("canonicalRows") || [];
    const existingNormalized = getState("normalizedRows") || [];
    const existingRawText = getState("rawText") || "";

    const mergedRawRows = [...existingRawRows, ...rows];
    const mergedCanonical = [...existingCanonical, ...canonicalRows];
    const mergedNormalized = [...existingNormalized, ...newNormalizedRows];
    const mergedRawText = existingRawText + "\n" + text;

    setState("rawRows", mergedRawRows);
    setState("canonicalRows", mergedCanonical);
    setState("normalizedRows", mergedNormalized);
    setState("rawText", mergedRawText);

    const existingMeta = getState("meta") || {};
    const existingFilename = existingMeta.filename || "";
    const mergedFilename = existingFilename ? `${existingFilename} + ${filename}` : filename;
    setState("meta", { ...existingMeta, filename: mergedFilename, rowCount: mergedRawRows.length, processedAt: Date.now() });

    // Step 6: Update UI to reflect merged data
    const allHeaders = Object.keys(mergedNormalized[0] || {});
    renderStats({ rows: mergedRawRows.length, headers: allHeaders.length, unmapped: 0, errors: errors.length, delimiter: "," });
    renderPreview(mergedNormalized, config.inputSettings.previewRowCount);
    setFilenameLabel(`Merged: ${mergedFilename}`);

    // Clear the append textarea on success (only relevant for paste-append flow)
    if (_dom.appendTxt) _dom.appendTxt.value = "";
    _dom.appendArea?.classList.remove("visible");
    if (_dom.appendToggle) {
      _dom.appendToggle.textContent = "＋ Append CSV";
      _dom.appendToggle.classList.remove("active");
    }

    // Toast popup with stats
    showToast({
      type: "success",
      title: "Appended",
      message: filename,
      stats: [
        { num: newNormalizedRows.length, lbl: "New Rows" },
        { num: mergedNormalized.length, lbl: "Total" },
      ]
    });

    updateStatusBar("done", `${mergedNormalized.length} rows total after append`);
    console.info(`${LOG_PREFIX} Append complete.`, { appended: newNormalizedRows.length, total: mergedNormalized.length });

    if (errors.length) showWarning(`${errors.length} parse warning(s) in appended data.`);
  } catch (err) {
    console.error(`${LOG_PREFIX} Append error: ${err.message}`, err);
    showError(`Append error: ${err.message}`);
    updateStatusBar("error", err.message.slice(0, 60));
  } finally {
    setLoading(false);
  }
}

/** Full input pipeline: parse → map → normalise → preview. */
async function runPipeline(text, filename) {
  setLoading(true, "Parsing…");
  updateStatusBar("parsing", filename);

  try {
    const config = getConfig();

    // Step 1: Parse CSV/TSV
    const { headers, rows, delimiter, errors } = parseCSV(text, config.inputSettings);
    if (!rows.length) { showError("No data rows found. Check delimiter or file format."); return; }

    setState("rawRows", rows);

    // Step 2: Map headers to canonical names
    const { headerMap, unmapped } = mapHeaders(headers, config.headerAliases);
    setState("headerMap", headerMap);
    setState("unmappedHeaders", unmapped);

    // Step 3: Apply header map to rows
    const canonicalRows = applyHeaderMap(rows, headerMap);
    setState("canonicalRows", canonicalRows);

    // Step 4: Strip units, normalise numeric columns
    const normalizedRows = normaliseRows(canonicalRows, config.unitStripping);
    setState("normalizedRows", normalizedRows);

    // Trigger lazy load for piping class sizes found in the data ONLY if enabled in config
    if (config.smartData?.autoLoadPipingClassMasters) {
      setTimeout(() => {
        import("../services/data-manager.js").then(({ dataManager }) => {
          const sizes = new Set();
          normalizedRows.forEach(r => {
            if (r.Bore) sizes.add(String(r.Bore).trim());
          });
          if (sizes.size > 0) {
            dataManager.loadPipingClassSizes(Array.from(sizes));
          }
        }).catch(err => console.error("Failed to load DataManager for lazy sizing", err));
      }, 100);
    }

    // Step 5: Update meta
    setState("meta", { filename, rowCount: rows.length, groupCount: 0, processedAt: Date.now() });

    // Step 6: Render UI
    renderStats({ rows: rows.length, headers: headers.length, unmapped: unmapped.length, errors: errors.length, delimiter });
    renderHeaderMap(headers, headerMap, unmapped);
    renderPreview(normalizedRows, config.inputSettings.previewRowCount);

    updateStatusBar("done", `${rows.length} rows loaded`);
    console.info(`${LOG_PREFIX} Pipeline complete.`, { rows: rows.length, mapped: Object.keys(headerMap).length, unmapped: unmapped.length });

    if (errors.length) showWarning(`${errors.length} parse warning(s). Check data quality.`);
  } catch (err) {
    console.error(`${LOG_PREFIX} Pipeline error. Reason: ${err.message}`, err);
    showError(`Parse error: ${err.message}`);
    updateStatusBar("error", err.message.slice(0, 60));
  } finally {
    setLoading(false);
  }
}

// ── Render helpers ────────────────────────────────────────────────

function renderStats({ rows, headers, unmapped, errors, delimiter }) {
  if (!_dom.statsWrap) return;
  const delimLabel = delimiter === "\t" ? "TAB" : delimiter;
  _dom.statsWrap.innerHTML = `
    <div class="stat-chips">
      <div class="stat-chip"><span class="num">${rows}</span><span class="lbl">Rows</span></div>
      <div class="stat-chip"><span class="num">${headers}</span><span class="lbl">Columns</span></div>
      <div class="stat-chip ${unmapped ? 'warn' : ''}">
        <span class="num" style="color:${unmapped ? 'var(--yellow-warn)' : 'var(--green-ok)'}">${headers - unmapped}</span>
        <span class="lbl">Mapped</span>
      </div>
      ${unmapped ? `<div class="stat-chip"><span class="num" style="color:var(--yellow-warn)">${unmapped}</span><span class="lbl">Unmapped</span></div>` : ""}
      ${errors ? `<div class="stat-chip"><span class="num" style="color:var(--red-err)">${errors}</span><span class="lbl">Parse Errors</span></div>` : ""}
      <div class="stat-chip"><span class="num" style="color:var(--text-muted)">${delimLabel}</span><span class="lbl">Delimiter</span></div>
    </div>`;
  _dom.statsWrap.style.display = "block";
}

function renderHeaderMap(allHeaders, headerMap, unmapped) {
  if (!_dom.headerMapTable) return;

  // Clear previous data first when new CSV loads
  if (allHeaders.length === 0) {
    _dom.headerMapTable.querySelector("tbody").innerHTML = `
      <tr><td colspan="3" class="text-center text-muted">No CSV loaded</td></tr>`;
    _dom.headerMapWrap.style.display = "none";
    return;
  }

  const revMap = {};  // canonical → raw
  for (const [raw, canon] of Object.entries(headerMap)) revMap[canon] = raw;

  const rows = allHeaders.map(raw => {
    const canon = headerMap[raw];
    const status = canon ? "mapped" : "unmapped";
    const badge = canon
      ? `<span class="hdr-badge mapped">Mapped</span>`
      : `<span class="hdr-badge unmapped" style="color:var(--red-err)">Not Mapped</span>`;
    return `<tr class="hdr-map-row ${status}">
      <td><code>${escHtml(raw)}</code></td>
      <td>${canon ? `<code style="color:var(--green-ok)">${escHtml(canon)}</code>` : '<span class="text-muted">—</span>'}</td>
      <td>${badge}</td>
    </tr>`;
  }).join("");

  _dom.headerMapTable.querySelector("tbody").innerHTML = rows;
  _dom.headerMapWrap.style.display = "block";

  // Save header map to localStorage
  try {
    localStorage.setItem('pcf_header_map', JSON.stringify({ allHeaders, headerMap, unmapped }));
  } catch (err) {
    console.warn(`${LOG_PREFIX} Failed to save header map to localStorage:`, err);
  }
}

function renderPreview(rows, limit) {
  if (!_dom.previewTable || !rows.length) return;
  const config = getConfig();
  const logic = config.smartData?.lineNoLogic || {};

  // Derive Line No. for each row using the same strategy as row-validator
  function deriveLineNo(row) {
    if (row['Line Number']) return String(row['Line Number']).trim();
    const ref = String(row.RefNo || '').trim();
    if (!ref) return '-';
    if (logic.strategy === 'regex') {
      const m = ref.match(new RegExp(logic.regexPattern || '(.+)'));
      return m?.[logic.regexGroup ?? 1] || ref;
    }
    // Default: token
    const parts = ref.split(logic.tokenDelimiter || '-');
    return parts[logic.tokenIndex ?? 2] || ref;
  }

  const preview = rows.slice(0, limit);
  const cols = Object.keys(preview[0] || {});
  const showLineNo = cols.includes('RefNo') || cols.includes('Line Number');

  const lineNoTh = showLineNo
    ? `<th style="color:#f59e0b;font-size:0.7rem;white-space:nowrap">Line No.(Derived)</th>` : '';
  const head = `<tr>${lineNoTh}${cols.map(c => `<th>${escHtml(c)}</th>`).join('')}</tr>`;

  const body = preview.map(row => {
    const lineNoTd = showLineNo
      ? `<td style="color:#f59e0b;font-size:0.7rem;font-family:var(--font-code)">${escHtml(deriveLineNo(row))}</td>` : '';
    return `<tr>${lineNoTd}${cols.map(c => {
      const v = row[c] ?? '';
      const cls = isCoord(c) ? " class='num'" : '';
      return `<td${cls}>${escHtml(String(v).slice(0, 40))}</td>`;
    }).join('')}</tr>`;
  }).join('');

  _dom.previewTable.innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
  _dom.previewWrap.style.display = 'block';

  // Save current headers to localStorage for next page load
  try {
    localStorage.setItem('pcf_table_headers', JSON.stringify(cols));
  } catch (err) {
    console.warn(`${LOG_PREFIX} Failed to save headers to localStorage:`, err);
  }
}


// ── Load defaults from localStorage ──────────────────────────────

function loadDefaultHeaders() {
  try {
    const savedHeaders = localStorage.getItem('pcf_table_headers');
    const savedHeaderMap = localStorage.getItem('pcf_header_map');

    // Load preview table headers
    if (savedHeaders) {
      const cols = JSON.parse(savedHeaders);
      if (cols && cols.length && _dom.previewTable) {
        const head = `<tr>${cols.map(c => `<th>${escHtml(c)}</th>`).join("")}</tr>`;
        _dom.previewTable.innerHTML = `<thead>${head}</thead><tbody></tbody>`;
        if (_dom.previewWrap) _dom.previewWrap.style.display = "block";
        console.info(`${LOG_PREFIX} Loaded ${cols.length} default headers from localStorage.`);
      }
    }

    // Load header map table
    if (savedHeaderMap) {
      const { allHeaders, headerMap, unmapped } = JSON.parse(savedHeaderMap);
      if (allHeaders && allHeaders.length) {
        renderHeaderMap(allHeaders, headerMap || {}, unmapped || []);
        console.info(`${LOG_PREFIX} Loaded header map from localStorage.`);
      }
    }
  } catch (err) {
    console.warn(`${LOG_PREFIX} Failed to load default headers from localStorage:`, err);
  }
}

// ── Utility ───────────────────────────────────────────────────────

function setFilenameLabel(name) {
  if (_dom.filenameLabel) _dom.filenameLabel.textContent = name;
}

function clearUI() {
  if (_dom.statsWrap) _dom.statsWrap.style.display = "none";
  if (_dom.headerMapWrap) _dom.headerMapWrap.style.display = "none";
  if (_dom.previewWrap) _dom.previewWrap.style.display = "none";
  if (_dom.dropZone) _dom.dropZone.classList.remove("has-file");
  if (_dom.filenameLabel) _dom.filenameLabel.textContent = "";
}

function setLoading(on, msg = "") {
  const overlay = document.getElementById("loading-overlay");
  const txt = document.getElementById("loading-text");
  if (overlay) overlay.classList.toggle("active", on);
  if (txt && msg) txt.textContent = msg;
}

function showError(msg, type = "ERROR") {
  if (type === "ERROR") console.error(`${LOG_PREFIX} ${msg}`);
  else console.info(`${LOG_PREFIX} ${msg}`);
  const el = document.getElementById("input-error");
  if (el) {
    el.textContent = msg;
    el.className = `issue-item ${type.toUpperCase()} mt-1`;

    // Inject inline styling for success just in case CSS class doesn't exist natively
    if (type.toUpperCase() === "SUCCESS") {
      el.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
      el.style.color = "#10b981"; // emerald
      el.style.borderLeft = "4px solid #10b981";
    } else {
      el.style.backgroundColor = "";
      el.style.color = "";
      el.style.borderLeft = "";
    }

    el.style.display = "flex";
  }
}

function showWarning(msg) {
  console.warn(`${LOG_PREFIX} ${msg}`);
  const el = document.getElementById("input-error");
  if (el) { el.textContent = msg; el.className = "issue-item WARNING mt-1"; el.style.display = "flex"; }
}

const COORD_COLS = new Set(["East", "North", "Up", "Bore", "Wall Thickness", "Corrosion Allowance", "Radius", "Pressure", "Weight", "Insulation thickness", "Hydro test pressure"]);
function isCoord(col) { return COORD_COLS.has(col); }
function escHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

/**
 * Show a toast notification popup.
 * @param {{ type?: 'success'|'info'|'warn', title: string, message?: string, stats?: {num:number, lbl:string}[], duration?: number }} opts
 */
function showToast({ type = "success", title, message = "", stats = [], duration = 4000 } = {}) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const icons = { success: "✔", info: "ℹ", warn: "⚠" };
  const statsHtml = stats.length
    ? `<div class="toast-stats">${stats.map(s =>
      `<div class="toast-stat"><span class="ts-num">${s.num}</span><span class="ts-lbl">${escHtml(s.lbl)}</span></div>`
    ).join("")}</div>`
    : "";

  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <span class="toast-icon">${icons[type] || "✔"}</span>
    <div class="toast-body">
      <div class="toast-title">${escHtml(title)}</div>
      ${message ? `<div class="toast-message">${escHtml(message)}</div>` : ""}
      ${statsHtml}
    </div>`;

  container.appendChild(el);

  // Auto-dismiss
  setTimeout(() => {
    el.classList.add("toast-hide");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, duration);

  // Click to dismiss early
  el.addEventListener("click", () => {
    el.classList.add("toast-hide");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  });
}

