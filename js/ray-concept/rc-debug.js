/**
 * rc-debug.js — RayDebugLog: shared log model + Debug sub-tab renderer
 * Populated by all 4 stage modules via the logFn callback.
 * 100% independent — zero imports from main app.
 */

// ── Shared log store (module-level) ──────────────────────────────────────────
let _log = [];

/**
 * Append a debug entry.
 * Called by stage modules via the logFn(stageId, event, refNo, data) callback.
 */
export function debugLog(stageId, event, refNo, data = {}) {
  _log.push({
    ts: Date.now(),
    stageId,
    event,
    refNo: refNo || '',
    data
  });
}

/** Return the active logFn callback for use by stage modules. */
export function getLogFn() {
  return debugLog;
}

/** Clear the log (called before each full pipeline run). */
export function clearLog() { _log = []; }

/** Return a snapshot of the current log. */
export function getLog() { return [..._log]; }

// ── Debug UI renderer ────────────────────────────────────────────────────────

/**
 * Render the Debug sub-tab into a container element.
 * @param {HTMLElement} container
 * @param {object[]}    connectionMatrix  — from Stage 3
 */
export function renderDebugTab(container, connectionMatrix = []) {
  container.innerHTML = `
    <div style="padding:0.75rem;display:flex;flex-direction:column;gap:0.75rem;height:100%;overflow:auto">

      <!-- Filter bar -->
      <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
        <span style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-code)">Filter:</span>
        <select id="rc-dbg-filter-stage" style="${selStyle()}">
          <option value="">All Stages</option>
          <option value="S1">S1 — Parse</option>
          <option value="S2">S2 — Extract</option>
          <option value="S3-P0">S3-P0 — Gap Fill</option>
          <option value="S3-P1">S3-P1 — Bridge</option>
          <option value="S3-P2">S3-P2 — Branch</option>
          <option value="S4">S4 — Emit</option>
        </select>
        <select id="rc-dbg-filter-event" style="${selStyle()}">
          <option value="">All Events</option>
          <option value="hit">hit</option>
          <option value="miss">miss</option>
          <option value="gap-filled">gap-filled</option>
          <option value="bridge-injected">bridge-injected</option>
          <option value="early-exit">early-exit</option>
          <option value="stub-injected">stub-injected</option>
          <option value="excluded">excluded</option>
          <option value="pass-complete">pass-complete</option>
        </select>
        <input id="rc-dbg-filter-ref" type="text" placeholder="RefNo contains…"
          style="font-size:0.73rem;background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:2px 6px;width:160px">
        <button id="rc-dbg-apply-filter" style="${btnStyle()}">▶ Filter</button>
        <button id="rc-dbg-clear-filter" style="${btnStyle(true)}">✕ Clear</button>
        <button id="rc-dbg-copy-table"   style="${btnStyle(true)}">📋 Copy Table</button>
        <button id="rc-dbg-export-json"  style="${btnStyle(true)};margin-left:auto">↓ Export JSON</button>
      </div>

      <!-- Cross-stage trace table -->
      <div style="flex:1;overflow:auto;border:1px solid var(--steel);border-radius:4px">
        <table id="rc-dbg-trace-table" style="${tableStyle()}">
          <thead>
            <tr style="background:var(--bg-panel);position:sticky;top:0">
              <th style="${thStyle()}">#</th>
              <th style="${thStyle()}">Stage</th>
              <th style="${thStyle()}">Event</th>
              <th style="${thStyle()}">RefNo</th>
              <th style="${thStyle()}">Detail</th>
            </tr>
          </thead>
          <tbody id="rc-dbg-trace-body"></tbody>
        </table>
      </div>

      <!-- Connection matrix -->
      <div style="border:1px solid var(--steel);border-radius:4px">
        <div style="padding:4px 8px;font-size:0.72rem;font-weight:600;color:var(--amber);border-bottom:1px solid var(--steel);display:flex;align-items:center;gap:0.5rem">
          CONNECTION MATRIX
          <button id="rc-dbg-copy-matrix" style="${btnStyle(true)};margin-left:auto">📋 Copy Matrix</button>
        </div>
        <div style="overflow:auto;max-height:200px">
          <table id="rc-dbg-matrix-table" style="${tableStyle()}">
            <thead>
              <tr style="background:var(--bg-panel)">
                <th style="${thStyle()}">RefNo</th>
                <th style="${thStyle()}">Type</th>
                <th style="${thStyle()}">EP1 →</th>
                <th style="${thStyle()}">EP2 →</th>
                <th style="${thStyle()}">BP →</th>
                <th style="${thStyle()}">Status</th>
              </tr>
            </thead>
            <tbody id="rc-dbg-matrix-body"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Wire filter button
  container.querySelector('#rc-dbg-apply-filter')
    .addEventListener('click', () => applyFilter(container));
  container.querySelector('#rc-dbg-clear-filter')
    .addEventListener('click', () => { clearFilters(container); renderTraceTable(container, _log); });
  container.querySelector('#rc-dbg-export-json')
    .addEventListener('click', () => exportJson(connectionMatrix));

  // Copy trace table as TSV
  container.querySelector('#rc-dbg-copy-table')
    .addEventListener('click', () => {
      const rows = [['#', 'Stage', 'Event', 'RefNo', 'Detail']];
      _log.forEach((e, i) => rows.push([i + 1, e.stageId, e.event, e.refNo, formatData(e.data)]));
      copyTsv(rows, container.querySelector('#rc-dbg-copy-table'));
    });

  // Copy connection matrix as TSV
  container.querySelector('#rc-dbg-copy-matrix')
    .addEventListener('click', () => {
      const rows = [['RefNo', 'Type', 'EP1', 'EP2', 'BP', 'Status']];
      connectionMatrix.forEach(r => rows.push([r.refNo, r.type, r.ep1, r.ep2, r.bp, r.status]));
      copyTsv(rows, container.querySelector('#rc-dbg-copy-matrix'));
    });

  // Initial render
  renderTraceTable(container, _log);
  renderMatrix(container, connectionMatrix);
}

function applyFilter(container) {
  const stage = container.querySelector('#rc-dbg-filter-stage').value;
  const event = container.querySelector('#rc-dbg-filter-event').value;
  const ref   = container.querySelector('#rc-dbg-filter-ref').value.toLowerCase();
  const filtered = _log.filter(e =>
    (!stage || e.stageId === stage) &&
    (!event || e.event  === event)  &&
    (!ref   || e.refNo.toLowerCase().includes(ref))
  );
  renderTraceTable(container, filtered);
}

function clearFilters(container) {
  container.querySelector('#rc-dbg-filter-stage').value = '';
  container.querySelector('#rc-dbg-filter-event').value = '';
  container.querySelector('#rc-dbg-filter-ref').value   = '';
}

function renderTraceTable(container, entries) {
  const tbody = container.querySelector('#rc-dbg-trace-body');
  if (!tbody) return;
  const STATUS_COLORS = {
    hit: '#22c55e', miss: '#ef4444', 'gap-filled': '#3b82f6',
    'bridge-injected': '#22c55e', 'early-exit': '#f59e0b',
    'stub-injected': '#a78bfa', excluded: '#ef4444', 'pass-complete': '#06b6d4'
  };
  tbody.innerHTML = entries.map((e, i) => {
    const color = STATUS_COLORS[e.event] || 'var(--text-muted)';
    const detail = formatData(e.data);
    return `<tr style="border-bottom:1px solid var(--steel)">
      <td style="${tdStyle()}">${i + 1}</td>
      <td style="${tdStyle()};color:#f59e0b">${e.stageId}</td>
      <td style="${tdStyle()};color:${color}">${e.event}</td>
      <td style="${tdStyle()};color:var(--text-code);font-family:var(--font-code)">${e.refNo}</td>
      <td style="${tdStyle()};color:var(--text-muted);max-width:320px;white-space:pre-wrap">${detail}</td>
    </tr>`;
  }).join('');
}

function renderMatrix(container, matrix) {
  const tbody = container.querySelector('#rc-dbg-matrix-body');
  if (!tbody || !matrix.length) return;
  const STATUS_BG = { FULL: '#16a34a22', PARTIAL: '#b45309aa', OPEN: '#dc262633' };
  const STATUS_COLOR = { FULL: '#22c55e', PARTIAL: '#f59e0b', OPEN: '#ef4444' };
  tbody.innerHTML = matrix.map(row => `<tr style="border-bottom:1px solid var(--steel);background:${STATUS_BG[row.status]||''}">
    <td style="${tdStyle()};font-family:var(--font-code)">${row.refNo}</td>
    <td style="${tdStyle()}">${row.type}</td>
    <td style="${tdStyle()};color:${row.ep1==='ORPHAN'?'#ef4444':'#22c55e'}">${row.ep1}</td>
    <td style="${tdStyle()};color:${row.ep2==='ORPHAN'?'#ef4444':'#22c55e'}">${row.ep2}</td>
    <td style="${tdStyle()};color:${row.bp==='ORPHAN'?'#ef4444':row.bp==='—'?'var(--text-muted)':'#22c55e'}">${row.bp}</td>
    <td style="${tdStyle()};color:${STATUS_COLOR[row.status]};font-weight:600">${row.status}</td>
  </tr>`).join('');
}

function formatData(data) {
  if (!data || typeof data !== 'object') return '';
  return Object.entries(data).map(([k, v]) => {
    const val = typeof v === 'object' ? JSON.stringify(v) : v;
    return `${k}:${val}`;
  }).join('  ');
}

function exportJson(connectionMatrix = []) {
  const payload = { log: _log, connectionMatrix };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'ray-debug-log.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function copyTsv(rows, btn) {
  const tsv = rows.map(r => r.map(c => String(c ?? '').replace(/\t/g, ' ')).join('\t')).join('\n');
  navigator.clipboard.writeText(tsv).then(() => {
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = tsv;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

// ── Style helpers (inline, no external CSS) ───────────────────────────────────
function selStyle() {
  return 'font-size:0.73rem;background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:3px;padding:2px 4px';
}
function btnStyle(secondary = false) {
  return `font-size:0.72rem;padding:3px 8px;border-radius:3px;cursor:pointer;border:1px solid var(--steel);background:${secondary?'var(--bg-panel)':'var(--amber)'};color:${secondary?'var(--text-primary)':'#000'}`;
}
function tableStyle() { return 'width:100%;border-collapse:collapse;font-size:0.72rem;font-family:var(--font-code)'; }
function thStyle()    { return 'text-align:left;padding:3px 6px;font-size:0.7rem;color:var(--text-muted);border-bottom:1px solid var(--steel)'; }
function tdStyle()    { return 'padding:2px 6px;vertical-align:top'; }
