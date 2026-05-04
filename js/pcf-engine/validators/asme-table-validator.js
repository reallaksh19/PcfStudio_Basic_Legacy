/**
 * asme-table-validator.js — Phase 5D ASME/master table certification
 *
 * Validates existing in-app ASME/master tables and BRLEN priority behavior.
 * Does not duplicate ASME data; uses fallbackcontract/masterTableService.
 */

import { getTeeBrlen, getOletBrlen } from '../../services/fallbackcontract.js';
import { resolveBrlen } from '../brlen-resolver.js';

function clean(v) { return String(v ?? '').trim(); }
function n(v, fallback = null) { if (v == null || v === '') return fallback; const x = Number(v); return Number.isFinite(x) ? x : fallback; }
function issue(severity, code, message, extra = {}) { return { phase:'5D', validator:'asme-table-validator', severity, code, message, ...extra }; }
function approx(a,b,tol){ return Math.abs(Number(a)-Number(b)) <= tol; }

export function validateAsmeTables(options = {}) {
  const tol = Number(options.tolerance ?? 0.001);
  const diagnostics = [];

  const cases = [
    { name: 'Equal Tee DN400', kind: 'tee', header: 400, branch: 400, expected: 305 },
    { name: 'Reducing Tee 16x16x12', kind: 'tee', header: 400, branch: 300, expected: 295 },
    { name: 'Weldolet 10x4', kind: 'olet', header: 250, branch: 100, expected: 231.75 },
  ];

  for (const c of cases) {
    const actual = c.kind === 'tee' ? getTeeBrlen(c.header, c.branch) : getOletBrlen(c.header, c.branch);
    if (actual == null) {
      diagnostics.push(issue('error', 'ASME-LOOKUP-MISSING', `${c.name} lookup returned null.`, c));
    } else if (!approx(actual, c.expected, tol)) {
      diagnostics.push(issue('error', 'ASME-LOOKUP-MISMATCH', `${c.name} lookup mismatch.`, { ...c, actual }));
    }
  }

  return {
    pass: diagnostics.filter(d => d.severity === 'error').length === 0,
    diagnostics,
    summary: {
      cases: cases.length,
      errors: diagnostics.filter(d => d.severity === 'error').length,
      warnings: diagnostics.filter(d => d.severity === 'warning').length,
    },
  };
}

export function validateBrlenPriority(options = {}) {
  const tol = Number(options.tolerance ?? 0.001);
  const diagnostics = [];

  const direct = resolveBrlen({ type:'TEE', bore:400, branchBore:400, brlen:123 });
  if (direct.brlen !== 123 || direct.source !== 'direct-data-table') diagnostics.push(issue('error','BRLEN-PRIORITY-DIRECT','Direct BRLEN must win over table lookup.',{actual:direct}));

  const geom = resolveBrlen({ type:'TEE', bore:400, branchBore:400, cp:{x:0,y:0,z:0}, bp:{x:0,y:305,z:0} });
  if (!approx(geom.brlen,305,tol) || geom.source !== 'calculated-bp-minus-cp') diagnostics.push(issue('error','BRLEN-PRIORITY-GEOMETRY','BP−CP magnitude must win over table lookup when direct BRLEN is absent.',{actual:geom}));

  const table = resolveBrlen({ type:'TEE', bore:400, branchBore:300 });
  if (!approx(table.brlen,295,tol)) diagnostics.push(issue('error','BRLEN-PRIORITY-TEE-TABLE','Reducing tee table fallback should resolve 400/300 to 295.',{actual:table}));

  const olet = resolveBrlen({ type:'OLET', bore:250, branchBore:100 });
  if (!approx(olet.brlen,231.75,tol)) diagnostics.push(issue('error','BRLEN-PRIORITY-OLET-TABLE','OLET table fallback should use A + 0.5 × Header OD.',{actual:olet}));

  const missing = resolveBrlen({ type:'TEE', bore:999, branchBore:777 });
  if (missing.complete !== false) diagnostics.push(issue('error','BRLEN-PRIORITY-INCOMPLETE','Unmatched BRLEN should flag incomplete, not guess.',{actual:missing}));

  return {
    pass: diagnostics.filter(d => d.severity === 'error').length === 0,
    diagnostics,
    summary: {
      cases: 5,
      errors: diagnostics.filter(d => d.severity === 'error').length,
      warnings: diagnostics.filter(d => d.severity === 'warning').length,
    },
  };
}

export function validateAsmeCertification(options = {}) {
  const tables = validateAsmeTables(options);
  const priority = validateBrlenPriority(options);
  const diagnostics = [...tables.diagnostics, ...priority.diagnostics];
  return {
    pass: diagnostics.filter(d => d.severity === 'error').length === 0,
    diagnostics,
    summary: {
      tableErrors: tables.summary.errors,
      priorityErrors: priority.summary.errors,
      errors: diagnostics.filter(d => d.severity === 'error').length,
      warnings: diagnostics.filter(d => d.severity === 'warning').length,
    },
  };
}

try { if (typeof window !== 'undefined') { window.validatePcfAsmeTables = validateAsmeTables; window.validatePcfBrlenPriority = validateBrlenPriority; window.validatePcfAsmeCertification = validateAsmeCertification; } } catch (_) {}
