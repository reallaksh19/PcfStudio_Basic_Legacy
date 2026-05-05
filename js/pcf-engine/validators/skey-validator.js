/**
 * skey-validator.js — Phase 5A <SKEY> validation
 *
 * Rules:
 * - PCF keyword must be <SKEY> with angle brackets.
 * - PIPE and SUPPORT do not require SKEY.
 * - FLANGE, VALVE, BEND, TEE, OLET, REDUCER-C, REDUCER-E require SKEY.
 */

const RULES = Object.freeze({
  PIPE: { mandatory: false, allowed: [] },
  SUPPORT: { mandatory: false, allowed: [] },
  FLANGE: { mandatory: true, allowed: ['FLWN', 'FLSO', 'FLBL', 'FLLJ', 'BLFL'] },
  VALVE: { mandatory: true, allowed: ['VBFL', 'VGAT', 'VGLB', 'VCHK', 'VBAL'] },
  BEND: { mandatory: true, allowed: ['BEBW', 'BESW'] },
  TEE: { mandatory: true, allowed: ['TEBW', 'TESW'] },
  OLET: { mandatory: true, allowed: ['OLWL', 'OLSO'] },
  'REDUCER-CONCENTRIC': { mandatory: true, allowed: ['RCBW'] },
  'REDUCER-ECCENTRIC': { mandatory: true, allowed: ['REBW'] },
  'REDUCER-C': { mandatory: true, allowed: ['RCBW'] },
  'REDUCER-E': { mandatory: true, allowed: ['REBW'] },
});

function clean(v) {
  return String(v ?? '').trim();
}

function typeOf(row) {
  const t = clean(row?.type || row?.rawType || row?.blockType).toUpperCase();
  if (t === 'REDU') return 'REDUCER-CONCENTRIC';
  return t;
}

function skeyOf(row) {
  return clean(row?.skey || row?.SKEY || row?.['<SKEY>']).toUpperCase();
}

function issue(severity, code, row, message, extra = {}) {
  return {
    phase: '5A',
    validator: 'skey-validator',
    severity,
    code,
    rowIndex: row?.rowIndex ?? row?.index ?? null,
    refNo: row?.refNo || row?.ca97 || row?.source?.originalRefNo || '',
    type: typeOf(row),
    message,
    ...extra,
  };
}

export function validateSkeyRow(row, options = {}) {
  const diagnostics = [];
  const type = typeOf(row);
  const skey = skeyOf(row);
  const rules = { ...RULES, ...(options.rules || {}) };
  const rule = rules[type];

  if (!rule) {
    diagnostics.push(issue('warning', 'SKEY-UNKNOWN-TYPE', row, `No SKEY rule registered for component type ${type || '(blank)'}.`));
    return diagnostics;
  }

  if (rule.mandatory && !skey) {
    diagnostics.push(issue('error', 'SKEY-MISSING', row, `${type} requires <SKEY>.`, { allowed: rule.allowed }));
    return diagnostics;
  }

  if (skey && Array.isArray(rule.allowed) && rule.allowed.length && !rule.allowed.includes(skey)) {
    diagnostics.push(issue(options.invalidSeverity || 'warning', 'SKEY-NONSTANDARD', row, `${type} has non-standard <SKEY> ${skey}.`, { skey, allowed: rule.allowed }));
  }

  return diagnostics;
}

export function validateSkeyRows(rows = [], options = {}) {
  const diagnostics = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    diagnostics.push(...validateSkeyRow(row, options));
  }
  return {
    pass: diagnostics.filter(d => d.severity === 'error').length === 0,
    diagnostics,
    summary: {
      rows: Array.isArray(rows) ? rows.length : 0,
      errors: diagnostics.filter(d => d.severity === 'error').length,
      warnings: diagnostics.filter(d => d.severity === 'warning').length,
    },
  };
}

export function validateSkeyInPcfText(pcfText, options = {}) {
  const lines = String(pcfText || '').split(/\r?\n/);
  const diagnostics = [];
  let currentType = '';
  let currentHasSkey = false;
  let currentLine = 0;

  const flush = () => {
    if (!currentType) return;
    diagnostics.push(...validateSkeyRow({ type: currentType, skey: currentHasSkey ? 'PRESENT' : '', rowIndex: currentLine }, {
      ...options,
      invalidSeverity: 'info',
      rules: Object.fromEntries(Object.entries({ ...RULES, ...(options.rules || {}) }).map(([k, v]) => [k, { ...v, allowed: [] }]))
    }));
  };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (RULES[t]) {
      flush();
      currentType = t;
      currentHasSkey = false;
      currentLine = i + 1;
    } else if (t.startsWith('<SKEY>')) {
      currentHasSkey = true;
    } else if (/^SKEY\b|^S-Key\b|^COMPONENT-KEY\b/i.test(t)) {
      diagnostics.push(issue('error', 'SKEY-KEYWORD-FORM', { type: currentType, rowIndex: i + 1 }, 'SKEY keyword must be exactly <SKEY> with angle brackets.', { line: t }));
    }
  }
  flush();

  return {
    pass: diagnostics.filter(d => d.severity === 'error').length === 0,
    diagnostics,
    summary: {
      errors: diagnostics.filter(d => d.severity === 'error').length,
      warnings: diagnostics.filter(d => d.severity === 'warning').length,
    },
  };
}

try {
  if (typeof window !== 'undefined') {
    window.validatePcfSkeyRows = validateSkeyRows;
    window.validatePcfSkeyRow = validateSkeyRow;
    window.validatePcfSkeyText = validateSkeyInPcfText;
  }
} catch (_) {}
