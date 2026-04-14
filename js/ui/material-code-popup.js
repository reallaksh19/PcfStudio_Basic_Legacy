const POPUP_ID = 'material-code-popup-container';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[ch]));

export function showMaterialCodePopup({ items, materialMap, onApply, onCancel }) {
  const existing = document.getElementById(POPUP_ID);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = POPUP_ID;
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '2000';

  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';
  dialog.style.width = '96vw';
  dialog.style.maxWidth = '1100px';
  dialog.style.maxHeight = '86vh';
  dialog.style.display = 'flex';
  dialog.style.flexDirection = 'column';
  dialog.style.background = 'var(--bg-1)';
  dialog.style.border = '1px solid var(--border)';
  dialog.style.borderRadius = '10px';
  dialog.style.boxShadow = '0 18px 40px rgba(0,0,0,0.45)';
  dialog.style.overflow = 'hidden';

  const safeItems = Array.isArray(items) ? items : [];
  const safeMap = Array.isArray(materialMap) ? materialMap : [];
  const options = safeMap
    .map(entry => ({
      code: String(entry.code || entry.Code || '').trim(),
      desc: String(entry.desc || entry.Desc || entry.description || entry.Description || '').trim()
    }))
    .filter(entry => entry.code);

  const rowsHtml = safeItems.map((item, idx) => {
    const selectId = `mat-code-select-${idx}`;
    const current = String(item.code || '').trim();
    return `
      <tr data-item-key="${esc(item.key)}">
        <td style="padding:0.55rem 0.7rem; border-bottom:1px solid var(--border); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${esc(item.description)}
        </td>
        <td style="padding:0.55rem 0.7rem; border-bottom:1px solid var(--border); min-width:360px;">
          <select id="${selectId}" data-item-key="${esc(item.key)}" style="width:100%; padding:0.45rem 0.55rem; background:var(--bg-2); color:var(--text-primary); border:1px solid var(--border); border-radius:6px;">
            <option value="">Select code...</option>
            ${options.map(opt => `
              <option value="${esc(opt.code)}" ${current === opt.code ? 'selected' : ''}>${esc(opt.code)} | ${esc(opt.desc)}</option>
            `).join('')}
          </select>
        </td>
      </tr>
    `;
  }).join('');

  dialog.innerHTML = `
    <div style="padding:1rem 1.25rem; border-bottom:1px solid var(--border); display:flex; align-items:flex-start; justify-content:space-between; gap:1rem;">
      <div>
        <div style="font-size:1rem; font-weight:700; color:var(--text-primary);">Resolve CA3 Material Codes</div>
        <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.25rem;">Select a code for each unresolved material description. Dropdown entries show <code>Code | Desc</code>.</div>
      </div>
      <button id="material-code-popup-close" style="background:transparent; color:var(--text-secondary); border:none; font-size:1.1rem; cursor:pointer;">&times;</button>
    </div>
    <div style="padding:1rem 1.25rem; overflow:auto; background:var(--bg-1);">
      <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
        <thead>
          <tr>
            <th style="text-align:left; padding:0.55rem 0.7rem; border-bottom:1px solid var(--border); color:var(--text-secondary); width:55%;">Material Description</th>
            <th style="text-align:left; padding:0.55rem 0.7rem; border-bottom:1px solid var(--border); color:var(--text-secondary); width:45%;">PCF Material Map Code</th>
          </tr>
        </thead>
        <tbody>${rowsHtml || '<tr><td colspan="2" style="padding:1rem; color:var(--text-secondary);">No unresolved materials.</td></tr>'}</tbody>
      </table>
    </div>
    <div style="padding:1rem 1.25rem; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:0.5rem;">
      <button id="material-code-popup-cancel" style="padding:0.55rem 0.95rem; border-radius:8px; border:1px solid var(--border); background:var(--bg-2); color:var(--text-primary);">Cancel</button>
      <button id="material-code-popup-apply" style="padding:0.55rem 0.95rem; border-radius:8px; border:none; background:#0f766e; color:#fff; font-weight:700;">Apply Selected Codes</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    if (typeof onCancel === 'function') onCancel();
  };

  const apply = () => {
    const selections = {};
    dialog.querySelectorAll('select[data-item-key]').forEach(select => {
      const key = select.dataset.itemKey;
      const code = String(select.value || '').trim();
      if (key && code) selections[key] = code;
    });
    overlay.remove();
    if (typeof onApply === 'function') onApply(selections);
  };

  dialog.querySelector('#material-code-popup-close')?.addEventListener('click', close);
  dialog.querySelector('#material-code-popup-cancel')?.addEventListener('click', close);
  dialog.querySelector('#material-code-popup-apply')?.addEventListener('click', apply);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}
