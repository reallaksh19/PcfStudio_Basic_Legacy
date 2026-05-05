import { masterTableService } from '../services/master-table-service.js';

const POPUP_ID = 'common-ca8-valve-weight-popup';
const RESOLVED_FLAG = '__commonCa8Resolved';

function s(value) {
  return String(value ?? '').trim();
}

function n(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function esc(value) {
  return s(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function normalizeType(type) {
  return s(type).toUpperCase();
}

function componentLengthMm(comp) {
  const explicit = n(comp?.lengthMm ?? comp?.length ?? comp?.len);
  if (explicit != null && explicit > 0) return explicit;

  const lenAxis = n(comp?.lenAxis?.len1 ?? comp?.lenAxis?.length ?? comp?.axisLength);
  if (lenAxis != null && lenAxis > 0) return lenAxis;

  const ep1 = comp?.ep1 || comp?.eps?.[0];
  const ep2 = comp?.ep2 || comp?.eps?.[1];
  if (ep1 && ep2) {
    const dx = Number(ep2.x) - Number(ep1.x);
    const dy = Number(ep2.y) - Number(ep1.y);
    const dz = Number(ep2.z) - Number(ep1.z);
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return Number.isFinite(length) && length > 0 ? Math.round(length) : null;
  }

  return null;
}

function componentKey(comp, index) {
  return s(comp?.refNo || comp?.ca97 || comp?.componentName || comp?.itemDescription || `VALVE-${index + 1}`);
}

export function findAmbiguousValveCa8Requests(components = []) {
  return (Array.isArray(components) ? components : [])
    .map((comp, index) => {
      if (normalizeType(comp?.type) !== 'VALVE') return null;
      if (comp?.[RESOLVED_FLAG] === true) return null;

      const boreMm = n(comp?.boreMm ?? comp?.bore);
      const ratingClass = n(comp?.ratingClass ?? comp?.rating);
      const lengthMm = componentLengthMm(comp);
      if (boreMm == null || ratingClass == null || lengthMm == null) return null;

      const candidates = masterTableService.findValveWeightCandidates({ boreMm, ratingClass, lengthMm });
      if (!Array.isArray(candidates) || candidates.length <= 1) return null;

      return {
        key: componentKey(comp, index),
        index,
        component: comp,
        boreMm,
        ratingClass,
        lengthMm,
        candidates,
      };
    })
    .filter(Boolean);
}

function optionLabel(candidate, idx) {
  const type = s(candidate.valve_type || candidate.type || candidate.description || `Option ${idx + 1}`);
  const weight = candidate.valve_weight ?? candidate.weight ?? candidate.flange_weight ?? '';
  const length = candidate.length_mm ?? '';
  return `${type || `Option ${idx + 1}`} | Wt ${weight || '-'} kg | L ${length || '-'} mm`;
}

function applySelection(requests, selections) {
  const applied = [];
  for (const req of requests) {
    const selectedIndex = Number.parseInt(selections[req.key], 10);
    const candidate = req.candidates[selectedIndex];
    if (!candidate) continue;

    const weight = candidate.valve_weight ?? candidate.weight ?? candidate.flange_weight ?? '';
    const valveType = candidate.valve_type || candidate.type || candidate.description || '';

    req.component.weight = weight;
    req.component.directWeight = weight;
    req.component.ca8 = weight;
    req.component.valveType = valveType;
    req.component.lengthMm = req.lengthMm;
    req.component.ratingClass = req.ratingClass;
    req.component.boreMm = req.boreMm;
    req.component[RESOLVED_FLAG] = true;
    req.component.commonCa8Resolution = {
      source: 'common-ca8-valve-weight-dropdown',
      valveType,
      weight,
      boreMm: req.boreMm,
      ratingClass: req.ratingClass,
      lengthMm: req.lengthMm,
      candidateCount: req.candidates.length,
    };
    applied.push({ key: req.key, weight, valveType });
  }
  return applied;
}

function showValveWeightPopup(requests, onApply, onCancel) {
  document.getElementById(POPUP_ID)?.remove();

  const overlay = document.createElement('div');
  overlay.id = POPUP_ID;
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2400;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:1rem';

  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';
  dialog.style.cssText = 'width:96vw;max-width:1120px;max-height:86vh;display:flex;flex-direction:column;background:var(--bg-1);border:1px solid var(--border, var(--steel));border-radius:10px;box-shadow:0 18px 40px rgba(0,0,0,.45);overflow:hidden';

  const rows = requests.map((req) => `
    <tr>
      <td style="padding:.55rem .7rem;border-bottom:1px solid var(--border, var(--steel));font-family:var(--font-code);white-space:nowrap">${esc(req.key)}</td>
      <td style="padding:.55rem .7rem;border-bottom:1px solid var(--border, var(--steel));white-space:nowrap">DN ${esc(req.boreMm)} / ${esc(req.ratingClass)}# / ${esc(req.lengthMm)} mm</td>
      <td style="padding:.55rem .7rem;border-bottom:1px solid var(--border, var(--steel));min-width:380px">
        <select data-ca8-key="${esc(req.key)}" style="width:100%;padding:.45rem .55rem;background:var(--bg-2);color:var(--text-primary);border:1px solid var(--border, var(--steel));border-radius:6px">
          ${req.candidates.map((candidate, idx) => `<option value="${idx}">${esc(optionLabel(candidate, idx))}</option>`).join('')}
        </select>
      </td>
    </tr>
  `).join('');

  dialog.innerHTML = `
    <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border, var(--steel));display:flex;justify-content:space-between;gap:1rem">
      <div>
        <div style="font-size:1rem;font-weight:700;color:var(--text-primary)">Resolve Valve CA8 Weight</div>
        <div style="font-size:.84rem;color:var(--text-secondary, var(--text-muted));margin-top:.25rem">Multiple Weight Config rows match the same valve size + rating + length. Select the correct valve type/weight before Common PCF Builder emits CA8.</div>
      </div>
      <button id="common-ca8-popup-close" type="button" style="background:transparent;color:var(--text-secondary, var(--text-muted));border:none;font-size:1.15rem;cursor:pointer">&times;</button>
    </div>
    <div style="padding:1rem 1.25rem;overflow:auto">
      <table style="width:100%;border-collapse:collapse;table-layout:auto">
        <thead>
          <tr>
            <th style="text-align:left;padding:.55rem .7rem;border-bottom:1px solid var(--border, var(--steel));color:var(--text-secondary, var(--text-muted))">Valve Ref</th>
            <th style="text-align:left;padding:.55rem .7rem;border-bottom:1px solid var(--border, var(--steel));color:var(--text-secondary, var(--text-muted))">Matched Criteria</th>
            <th style="text-align:left;padding:.55rem .7rem;border-bottom:1px solid var(--border, var(--steel));color:var(--text-secondary, var(--text-muted))">Weight Config Match</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="padding:1rem 1.25rem;border-top:1px solid var(--border, var(--steel));display:flex;justify-content:flex-end;gap:.5rem">
      <button id="common-ca8-popup-cancel" type="button" style="padding:.55rem .95rem;border-radius:8px;border:1px solid var(--border, var(--steel));background:var(--bg-2);color:var(--text-primary)">Cancel</button>
      <button id="common-ca8-popup-apply" type="button" style="padding:.55rem .95rem;border-radius:8px;border:none;background:#0f766e;color:#fff;font-weight:700">Apply Selected CA8</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    onCancel?.();
  };

  const apply = () => {
    const selections = {};
    dialog.querySelectorAll('select[data-ca8-key]').forEach(select => {
      selections[select.dataset.ca8Key] = select.value;
    });
    const applied = applySelection(requests, selections);
    overlay.remove();
    onApply?.(applied);
  };

  dialog.querySelector('#common-ca8-popup-close')?.addEventListener('click', close);
  dialog.querySelector('#common-ca8-popup-cancel')?.addEventListener('click', close);
  dialog.querySelector('#common-ca8-popup-apply')?.addEventListener('click', apply);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
}

function currentRayComponents() {
  const fromRay = typeof window.__getRc2DComponents === 'function' ? window.__getRc2DComponents() : [];
  return Array.isArray(fromRay) ? fromRay : [];
}

function status(message, color = 'var(--amber)') {
  const el = document.getElementById('rc-masters-status');
  if (el) {
    el.textContent = message;
    el.style.color = color;
  }
}

function isCommonBuilderMode() {
  const toggle = document.getElementById('rc-chk-engine-mode');
  if (toggle) return toggle.checked === true;
  return localStorage.getItem('pcfStudio.engineMode') === 'common';
}

export function initCommonCa8ValveWeightResolver() {
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#rc-btn-load-masters');
    if (!button || button.disabled || !isCommonBuilderMode()) return;

    const requests = findAmbiguousValveCa8Requests(currentRayComponents());
    if (!requests.length) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    status(`CA8 needs selection for ${requests.length} valve(s)`);
    showValveWeightPopup(requests, (applied) => {
      window.__COMMON_CA8_VALVE_WEIGHT_SELECTION__ = { applied, count: applied.length, at: Date.now() };
      status(`✓ CA8 selected for ${applied.length} valve(s). Loading masters…`, 'var(--green-ok)');
      setTimeout(() => button.click(), 0);
    }, () => {
      status('CA8 selection cancelled; masters not loaded', 'var(--amber)');
    });
  }, true);
}

try {
  if (typeof window !== 'undefined') {
    window.findAmbiguousValveCa8Requests = findAmbiguousValveCa8Requests;
    window.initCommonCa8ValveWeightResolver = initCommonCa8ValveWeightResolver;
  }
} catch (_) {}
