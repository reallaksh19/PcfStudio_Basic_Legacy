import { dataManager } from '../services/data-manager.js';
import { gate } from '../services/gate-logger.js';
import { CONVERTED_BORE_COL, guessBoreSourceColumn } from '../services/bore-converter.js';
import { guessPreferredBoreSourceColumn, shouldUsePreferredBoreSource } from '../services/bore-source-selector.js';

const TYPES = ['linelist', 'weights', 'pipingclass'];
const AUTO_CONVERTED = new Set();

function headersFor(type) {
  const rows =
    type === 'linelist' ? dataManager.getLinelist() :
    type === 'weights' ? dataManager.getWeights() :
    type === 'pipingclass' ? dataManager.getPipingClassMaster() : [];
  return Object.keys(rows?.[0] || {});
}

function rowsFor(type) {
  return type === 'linelist' ? dataManager.getLinelist() :
    type === 'weights' ? dataManager.getWeights() :
    type === 'pipingclass' ? dataManager.getPipingClassMaster() : [];
}

function textOf(el) {
  return String(el?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function nearestPlacementBlock(el) {
  if (!el) return null;
  return el.closest?.('[data-linelist-key-columns], #linelist-key-columns-section, #linelist-primary-key-section, #linelist-smart-key-section, .linelist-key-columns, .linelist-primary-key, .mapping-card, .mapping-config, .panel, fieldset, section') || el;
}

function findLinelistKeyColumnsAnchor() {
  const directCandidates = [
    '#linelist-key-columns-section',
    '#linelist-primary-key-section',
    '#linelist-smart-key-section',
    '[data-linelist-key-columns]',
    '.linelist-key-columns',
    '.linelist-primary-key'
  ];
  for (const selector of directCandidates) {
    const el = document.querySelector(selector);
    if (el) return el;
  }

  const scope = document.getElementById('linelist') || document.getElementById('integ-app-container') || document;
  const candidates = [...scope.querySelectorAll('h1,h2,h3,h4,h5,h6,label,legend,.panel-title,.mapping-title,.mapping-row,.field-row,.form-row,fieldset,section,div')]
    .filter(el => {
      const text = textOf(el);
      return text.includes('key columns') || (text.includes('primary key') && text.includes('service') && text.includes('sequence'));
    })
    .sort((a, b) => textOf(a).length - textOf(b).length);

  for (const candidate of candidates) {
    const block = nearestPlacementBlock(candidate);
    if (block && block.id !== 'linelist' && block.id !== 'integ-app-container') return block;
  }

  return null;
}

function findLineNoDerivedAnchor() {
  const candidates = [
    '#linelist-attr-section',
    '#linelist-derived-section',
    '#linelist-x1-builder',
    '#x1-builder-section',
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
    const element = findLinelistKeyColumnsAnchor() ||
      document.getElementById('linelist-mapping-section') ||
      findLineNoDerivedAnchor() ||
      document.getElementById('linelist-x1-builder-section') ||
      document.getElementById('linelist-derived-section') ||
      document.getElementById('linelist-attr-section') ||
      document.getElementById('linelist-status-bar') ||
      document.getElementById('integ-app-container');
    return element ? { element, position: 'afterend', placement: 'below-key-columns' } : null;
  }

  const element = document.getElementById(`${type}-mapping-section`) ||
    document.getElementById(`${type}-status-bar`) ||
    document.getElementById('integ-app-container');
  return element ? { element, position: 'afterend', placement: 'below-master-mapping' } : null;
}

function resolveBoreSource(type, headers) {
  const saved = dataManager.getConvertedBoreSource?.(type) || '';
  const preferred = guessPreferredBoreSourceColumn(headers, type) || guessBoreSourceColumn(headers, type);
  const source = shouldUsePreferredBoreSource(saved, preferred, headers, type) ? preferred : (saved || preferred);
  return { saved, preferred, source };
}

function autoConvertIfNeeded(type, sourceColumn, status = null) {
  const rows = rowsFor(type);
  if (!rows.length || !sourceColumn) return null;

  const signature = `${type}|${rows.length}|${sourceColumn}`;
  if (AUTO_CONVERTED.has(signature)) return null;
  AUTO_CONVERTED.add(signature);

  const res = dataManager.convertMasterBores(type, sourceColumn);
  if (status) {
    status.textContent = `✓ Auto Convert to Bore: ${res.converted} rows, unresolved ${res.unresolved}, source: ${res.sourceColumn}`;
    status.style.color = 'var(--green-ok)';
  }
  gate('ConvertedBoreTools', 'AutoConvertToBore', `${type} auto converted bore`, {
    type,
    sourceColumn,
    converted: res.converted,
    unresolved: res.unresolved
  });
  return res;
}

function renderTools(type) {
  if (!TYPES.includes(type)) return;
  const host = hostFor(type);
  if (!host?.element) return;

  const headers = headersFor(type).filter(Boolean);
  if (!headers.length) return;

  const id = `converted-bore-tools-${type}`;
  document.getElementById(id)?.remove();

  const { source: guessed } = resolveBoreSource(type, headers);
  const title =
    type === 'linelist' ? 'Linelist Converted Bore' :
    type === 'weights' ? 'Weight Config Converted Bore' :
    'Piping Class Master Converted Bore';

  const wrap = document.createElement('div');
  wrap.id = id;
  wrap.dataset.placement = host.placement || (type === 'linelist' ? 'below-key-columns' : 'below-master-mapping');
  wrap.style.cssText = [
    'margin:0.45rem 0 0.65rem 0',
    'padding:0.45rem',
    'border:1px solid var(--steel)',
    'border-radius:6px',
    'background:var(--bg-panel)',
    'display:flex',
    'align-items:center',
    'gap:0.5rem',
    'flex-wrap:wrap',
    'width:100%',
    type === 'linelist' ? 'flex:0 0 100%' : ''
  ].filter(Boolean).join(';');

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

  // Requirement: importing any of the three master tables must trigger Convert to Bore automatically.
  setTimeout(() => autoConvertIfNeeded(type, guessed, status), 0);

  btn?.addEventListener('click', () => {
    const sourceColumn = select?.value || '';
    AUTO_CONVERTED.delete(`${type}|${rowsFor(type).length}|${sourceColumn}`);
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
