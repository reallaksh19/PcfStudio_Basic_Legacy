import { dataManager } from '../services/data-manager.js';

const NOTICE_ID = 'linelist-key-notice-toast';
let lastSignature = '';

function sourceLabel(value, fallback) {
  const s = String(value || '').trim();
  return s || fallback;
}

function buildKeyMessage() {
  const map = dataManager.headerMap?.linelist || {};
  const service = sourceLabel(map.service, 'Service');
  const lineNo = sourceLabel(map.lineNo, 'Line Number');
  const spare = sourceLabel(map.key3 || map.spare || '', '(none)');

  return {
    service,
    lineNo,
    spare,
    signature: `${service}|${lineNo}|${spare}|${dataManager.getLinelist?.().length || 0}`,
    text: `Line key is based on columns: ${service} + ${lineNo}${spare !== '(none)' ? ` + ${spare}` : ''}.`
  };
}

function removeNotice() {
  document.getElementById(NOTICE_ID)?.remove();
}

function showNotice() {
  const rows = dataManager.getLinelist?.() || [];
  if (!rows.length) return;

  const msg = buildKeyMessage();
  if (msg.signature === lastSignature) return;
  lastSignature = msg.signature;

  removeNotice();

  const toast = document.createElement('div');
  toast.id = NOTICE_ID;
  toast.setAttribute('role', 'status');
  toast.style.cssText = [
    'position:fixed',
    'right:18px',
    'bottom:18px',
    'z-index:2147483000',
    'max-width:440px',
    'padding:0.75rem 0.85rem',
    'border:1px solid var(--steel)',
    'border-left:4px solid var(--amber)',
    'border-radius:8px',
    'background:var(--bg-panel)',
    'color:var(--text-primary)',
    'box-shadow:0 10px 30px rgba(0,0,0,0.35)',
    'font-family:var(--font-ui)',
    'font-size:0.78rem',
    'line-height:1.35'
  ].join(';');

  toast.innerHTML = `
    <div style="display:flex;gap:0.65rem;align-items:flex-start">
      <div style="color:var(--amber);font-weight:800;font-size:1rem;line-height:1">ⓘ</div>
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--font-code);font-size:0.72rem;font-weight:700;color:var(--amber);margin-bottom:0.25rem">LINELIST KEY CONFIRMATION</div>
        <div>${msg.text}</div>
        <div style="font-size:0.68rem;color:var(--text-muted);margin-top:0.25rem">This key is used before fetching linelist data into PCF CA/attribute mapping.</div>
      </div>
      <button id="${NOTICE_ID}-close" type="button" style="background:transparent;border:0;color:var(--text-muted);cursor:pointer;font-size:1rem;line-height:1">×</button>
    </div>
  `;

  document.body.appendChild(toast);
  document.getElementById(`${NOTICE_ID}-close`)?.addEventListener('click', removeNotice);
  setTimeout(removeNotice, 9000);
}

export function initLinelistKeyNotice() {
  const render = () => setTimeout(showNotice, 0);

  dataManager.onReady(render);
  dataManager.onChange((type) => {
    if (type === 'linelist' || type === 'headermap') render();
  });

  // Show again when user attempts to leave Linelist Manager.
  document.addEventListener('click', (event) => {
    const tab = event.target?.closest?.('[data-tab]')?.getAttribute?.('data-tab');
    if (tab && tab !== 'linelist' && dataManager.getLinelist?.().length) {
      showNotice();
    }
  }, true);
}

try {
  if (typeof window !== 'undefined') window.initLinelistKeyNotice = initLinelistKeyNotice;
} catch (_) {}
