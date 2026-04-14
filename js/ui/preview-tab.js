/**
 * preview-tab.js — PCF preview with syntax highlighting
 */
import { getState, subscribe } from '../state.js';

const PREVIEW_LIMIT = 500; // lines shown initially

export const initPreviewTab = () => {
  subscribe('pcfLines', () => _renderPreview(false));
  document.getElementById('btn-copy-pcf')?.addEventListener('click', _copyToClipboard);
};

const KEYWORD_COLORS = {
  PIPE:'text-blue-400', BEND:'text-orange-400', TEE:'text-green-400',
  FLANGE:'text-red-400', VALVE:'text-purple-400', OLET:'text-teal-400',
  SUPPORT:'text-gray-400', 'REDUCER-CONCENTRIC':'text-yellow-400',
  'REDUCER-ECCENTRIC':'text-yellow-500', 'MESSAGE-SQUARE':'text-slate-400',
  'PIPELINE-REFERENCE':'text-cyan-400', DEFAULT:'text-white',
};

const _renderLines = (lines) => lines.map((line, i) => {
  const trimmed = line.trim();
  const isKeyword = !/^\s/.test(line) && trimmed !== '';
  const colorClass = isKeyword ? (KEYWORD_COLORS[trimmed] ?? KEYWORD_COLORS.DEFAULT) : 'text-slate-300';
  const num = String(i+1).padStart(4, ' ');
  return `<div class="flex hover:bg-slate-700/50">
    <span class="select-none text-slate-600 text-xs w-12 text-right pr-2">${num}</span>
    <span class="${colorClass} text-xs font-mono whitespace-pre">${_esc(line)}</span>
  </div>`;
}).join('');

const _renderPreview = (showAll) => {
  const lines = getState('pcfLines');
  const el    = document.getElementById('pcf-preview');
  if (!el || !lines?.length) return;

  const limited = !showAll && lines.length > PREVIEW_LIMIT;
  const visible = limited ? lines.slice(0, PREVIEW_LIMIT) : lines;

  let html = _renderLines(visible);

  if (limited) {
    const remaining = lines.length - PREVIEW_LIMIT;
    html += `<div class="flex items-center gap-2 px-3 py-2 bg-slate-800/60 border-t border-slate-600" id="pcf-show-more-bar">
      <span class="text-slate-400 text-xs">… ${remaining} more lines not shown</span>
      <button id="btn-show-all-pcf" class="btn btn-xs btn-secondary" style="font-size:0.7rem;padding:2px 8px">Show All</button>
    </div>`;
  }

  el.innerHTML = html;

  if (limited) {
    document.getElementById('btn-show-all-pcf')?.addEventListener('click', () => _renderPreview(true));
  }

  const countEl = document.getElementById('pcf-line-count');
  if (countEl) countEl.textContent = `${lines.length} lines${limited ? ` (showing ${PREVIEW_LIMIT})` : ''}`;
};

const _copyToClipboard = async () => {
  const lines = getState('pcfLines');
  if (!lines?.length) return;
  try {
    await navigator.clipboard.writeText(lines.join('\r\n'));
    const btn = document.getElementById('btn-copy-pcf');
    if (btn) { btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
  } catch (e) { console.warn('Clipboard failed:', e); }
};

const _esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
