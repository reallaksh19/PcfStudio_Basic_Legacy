import { dataManager } from '../services/data-manager.js';
import { gate } from '../services/gate-logger.js';
import { CONVERTED_BORE_COL, guessBoreSourceColumn } from '../services/bore-converter.js';

const TYPES = ['linelist', 'weights', 'pipingclass'];

function headersFor(type) {
  const rows =
    type === 'linelist' ? dataManager.getLinelist() :
    type === 'weights' ? dataManager.getWeights() :
    type === 'pipingclass' ? dataManager.getPipingClassMaster() : [];
  return Object.keys(rows?.[0] || {});
}

function textOf(el) {
  return String(el?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function findLineNoDerivedAnchor() {
  const candidates = [
    '#linelist-derived-section',
    '#linelist-x1-builder',
    '#x1-builder-section',
    '#linelist-attr-section',
    '#linelist-mapping-section'
  ];
  for (const selector of candidates) {
    const el = document.querySelector(selector);
    if (el && /line\s*no|lineno|derived/.test(textOf(el))) return el;
  }

  const all = [...document.querySelectorAll('label, .mapping-row, .field-row, .form-row, div, section')];
  const label = all.find(el => /line\s*no|lineno/.test(textOf(el)) && /derived/.test(textOf(el)));
  return label?.closest?.('.mapping-config, .mapping-row, .field-row, .form-row, section, div') || null;
}

function hostFor(type) {
  if (type === 'linelist') {
    const anchor = findLineNoDerivedAnchor();
    if (anchor) return { element: anchor, position: 'afterend' };
  }

  const element = document.getElementById(`${type}-mapping-section`) ||
    document.getElementById(`${type}-status-bar`) ||
    document.getElementById('integ-app-container');
  return element ? { element, position: 'afterend' } : null;
}

function renderTools(type) {
  if (!TYPES.includes(type)) return;
  const host = hostFor(type);
  if (!host?.element) return;

  const headers = headersFor(type).filter(Boolean);
  if (!headers.length) return;

  const id = `converted-bore-tools-${type}`;
  document.getElementById(id)?.remove();

  const saved = dataManager.getConvertedBoreSource?.(type) || '';
  const guessed = saved || guessBoreSourceColumn(headers, type);
  const title =
    type === 'linelist' ? 'Linelist Converted Bore' :
    type === 'weights' ? 'Weight Config Converted Bore' :
    'Piping Class Master Converted Bore';

  const wrap = document.createElement('div');
  wrap.id = id;
  wrap.dataset.convertedBoreType = type;
  wrap.style.cssText = [
    'margin:0.45rem 0 0.65rem 0',
    'padding:0.45rem',
    'border:1px solid var(--steel)',
    'border-radius:6px',
    'background:var(--bg-panel)',
    'display:flex',
    'align-items:center',
    'gap:0.5rem',
    'flex-wrap:wrap'
  ].join(';');

  const esc = (s) => String(s).replace(/"/g, '&quot;');
  const options = headers
    .filter(h => h !== CONVERTED_BORE_COL)
    .map(h => `<option value="${esc(h)}" ${h === guessed ? 'selected' : ''}>${h}</option>`)
    .join('');

  wrap.innerHTML = `
    <span style="font-size:0.72rem;font-family:var(--font-code);font-weight:700;color:var(--amber)">${title}</span>
    <span style="font-size:0.68rem;color:var(--text-muted)">Source column</span>
    <select id="${id}-select" style="font-size:0.7rem;background:var(--bg-0);color:var(--text-primary);border:1px solid var(--steel);border-radius:4px;padding:3px 6px;min-width:160px">${options}</select>
    <button id="${id}-btn" class="btn btn-secondary btn-sm" type="button">Convert to Bore</button>
    <span id="${id}-status" style="font-size:0.68rem;color:var(--text-muted)">${CONVERTED_BORE_COL} is auto-generated on import.</span>
  `;

  host.element.insertAdjacentElement(host.position || 'afterend', wrap);

  const btn = document.getElementById(`${id}-btn`);
  const select = document.getElementById(`${id}-select`);
  const status = document.getElementById(`${id}-status`);

  btn?.addEventListener('click', () => {
    const sourceColumn = select?.value || '';
    const res = dataManager.convertMasterBores(type, sourceColumn);
    if (status) {
      status.textContent = `✓ Converted ${res.converted} rows, unresolved ${res.unresolved}, source: ${res.sourceColumn}`;
      status.style.color = 'var(--green-ok)';
    }
    gate('ConvertedBoreTools', 'ConvertToBore', `${type} converted bore`, { type, sourceColumn, converted: res.converted, unresolved: res.unresolved });
    setTimeout(() => renderTools(type), 0);
  });
}

export function initConvertedBoreTools() {
  const renderAll = () => TYPES.forEach(renderTools);
  renderAll();
  dataManager.onReady(renderAll);
  dataManager.onChange((type) => {
    if (TYPES.includes(type)) setTimeout(() => renderTools(type), 0);
  });
  document.addEventListener('click', (event) => {
    const tab = event.target?.closest?.('[data-tab]')?.getAttribute?.('data-tab');
    if (TYPES.includes(tab)) setTimeout(() => renderTools(tab), 50);
  });
}

try {
  if (typeof window !== 'undefined') window.initConvertedBoreTools = initConvertedBoreTools;
} catch (_) {}
