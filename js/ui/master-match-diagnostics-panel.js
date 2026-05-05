import { dataManager } from '../services/data-manager.js';
import { CONVERTED_BORE_COL, convertBoreValue, sameConvertedBore } from '../services/bore-converter.js';

const PANEL_ID = 'master-match-diagnostics-panel';
const BUTTON_ID = 'master-match-diagnostics-button';
const MAX_ROWS = 200;

const S = v => String(v ?? '').trim();
const pick = (row, keys) => keys.map(k => row?.[k]).find(v => S(v)) ?? '';
const normClass = v => S(v).toUpperCase().replace(/[^A-Z0-9]/g, '');

function inputRows() {
  const pcf = dataManager.getPCF?.() || [];
  const line = dataManager.getLinelist?.() || [];
  return (Array.isArray(pcf) && pcf.length ? pcf : line).slice(0, MAX_ROWS);
}

function converted(row) {
  const existing = S(row?.[CONVERTED_BORE_COL] ?? row?.ConvertedBore);
  if (existing) return { value: existing, status: S(row?.['_Converted Bore Status']) || 'existing' };
  const raw = pick(row, ['BORE', 'Bore', 'bore', 'Size', 'DN', 'NB', 'NPS', 'Line Size', 'OD', 'O/D']);
  const od = pick(row, ['OD', 'O/D', 'Outside Diameter', 'OutsideDiameter']);
  const r = convertBoreValue(raw, { sourceColumn: 'diagnostic', odFallback: od });
  return { value: r.convertedBore, status: r.status };
}

function matchPc(row, pcRows) {
  const pc = pick(row, ['Piping Class', 'PipingClass', 'pipingClass', 'PIPING CLASS', 'Spec', 'SPEC']);
  const cb = converted(row).value;
  const candidates = pc ? pcRows.filter(r => normClass(pick(r, ['Piping Class', 'piping_class', 'PipingClass'])) === normClass(pc)) : pcRows;
  const hit = candidates.find(r => sameConvertedBore(cb, pick(r, [CONVERTED_BORE_COL, 'ConvertedBore', 'Size', 'DN', 'NB', 'NPS', 'Bore', 'OD', 'O/D'])));
  return hit ? { row: hit, source: 'converted-bore' } : { row: null, source: cb ? 'unresolved' : 'no-converted-bore' };
}

export function buildMasterMatchDiagnostics() {
  const pcRows = dataManager.getPipingClassMaster?.() || [];
  return inputRows().map((row, i) => {
    const cb = converted(row);
    const m = matchPc(row, pcRows);
    const mr = m.row || {};
    return {
      row: i + 1,
      refNo: pick(row, ['REF NO.', 'RefNo', 'Ref No', 'refNo', 'CA97', 'ca97']),
      pipingClass: pick(row, ['Piping Class', 'PipingClass', 'pipingClass', 'PIPING CLASS', 'Spec', 'SPEC']),
      rawBore: pick(row, ['BORE', 'Bore', 'bore', 'Size', 'DN', 'NB', 'NPS', 'Line Size']),
      od: pick(row, ['OD', 'O/D', 'Outside Diameter', 'OutsideDiameter']),
      convertedBore: cb.value,
      conversionStatus: cb.status,
      matched: m.row ? 'YES' : 'NO',
      matchedClass: pick(mr, ['Piping Class', 'piping_class', 'PipingClass']),
      matchedSize: pick(mr, [CONVERTED_BORE_COL, 'ConvertedBore', 'Size', 'DN', 'NB', 'NPS', 'Bore', 'OD', 'O/D']),
      ca3: pick(mr, ['CA3', 'CA 3', 'Material_Name', 'Material', 'material']),
      ca4: pick(mr, ['CA4', 'CA 4', 'Wall Thickness', 'Wall', 'Thk', 'Thickness']),
      ca7: pick(mr, ['CA7', 'CA 7', 'Corrosion Allowance', 'CA', 'Corr. Allow.']),
      matchSource: m.source,
    };
  });
}

function esc(v) { return S(v).replace(/[&<>]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[ch])); }

export function renderMasterMatchDiagnostics() {
  const host = document.getElementById('panel-masterdata') || document.body;
  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.style.cssText = 'margin:.75rem 0;padding:.75rem;border:1px solid var(--steel);border-radius:8px;background:var(--bg-panel);max-height:420px;overflow:auto';
    host.appendChild(panel);
  }
  const rows = buildMasterMatchDiagnostics();
  const bad = rows.filter(r => r.matched !== 'YES' || !r.ca3 || !r.ca4 || !r.ca7).length;
  const heads = ['#','Ref','Class','Raw Bore','OD','Converted','Status','Matched','M.Class','M.Size','CA3','CA4','CA7','Source'];
  panel.innerHTML = `<b style="color:var(--amber)">Master Matching Diagnostics</b><span style="margin-left:.75rem;color:${bad?'var(--red-warn)':'var(--green-ok)'}">Rows ${rows.length}, attention ${bad}</span><table style="width:100%;font-size:.72rem;border-collapse:collapse;margin-top:.5rem"><thead><tr>${heads.map(h=>`<th style="text-align:left;border-bottom:1px solid var(--steel);padding:4px">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td>${r.row}</td><td>${esc(r.refNo)}</td><td>${esc(r.pipingClass)}</td><td>${esc(r.rawBore)}</td><td>${esc(r.od)}</td><td><b>${esc(r.convertedBore)}</b></td><td>${esc(r.conversionStatus)}</td><td>${r.matched}</td><td>${esc(r.matchedClass)}</td><td>${esc(r.matchedSize)}</td><td>${esc(r.ca3)}</td><td>${esc(r.ca4)}</td><td>${esc(r.ca7)}</td><td>${esc(r.matchSource)}</td></tr>`).join('')}</tbody></table>`;
  return rows;
}

export function initMasterMatchDiagnosticsPanel() {
  if (!document.getElementById(BUTTON_ID)) {
    const host = document.getElementById('panel-masterdata') || document.body;
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.className = 'btn btn-secondary btn-sm';
    btn.textContent = 'Master Match Diagnostics';
    btn.style.margin = '.5rem 0';
    btn.addEventListener('click', renderMasterMatchDiagnostics);
    host.prepend(btn);
  }
  window.__MASTER_MATCH_DIAGNOSTICS__ = renderMasterMatchDiagnostics;
}
try { if (typeof window !== 'undefined') window.initMasterMatchDiagnosticsPanel = initMasterMatchDiagnosticsPanel; } catch (_) {}
