/**
 * formula-validator.js — Phase 5B Formula validation
 *
 * Validates calculated formula consistency:
 * - LEN/AXIS from EP1/EP2 coordinates
 * - EP ⇄ DELTA ⇄ LEN/AXIS consistency
 * - BRLEN = magnitude(BP - CP), unless table/direct fallback source is recorded
 * - DIAMETER = BORE
 * - WALL_THICK = CA4
 * - BEND_PTR/RIGID_PTR/INT_PTR counters when expected values are present
 */

import { calculateDeltaFromEps, calculateLenAxisFromDelta, calculateDeltaFromLenAxis } from '../geometry-sync.js';

function clean(v) { return String(v ?? '').trim(); }
function n(v, fallback = null) { if (v == null || v === '') return fallback; const x = Number(v); return Number.isFinite(x) ? x : fallback; }
function point(p) { if (!p || typeof p !== 'object') return null; const x=n(p.x), y=n(p.y), z=n(p.z); return [x,y,z].every(v=>v!=null) ? {x,y,z} : null; }
function approx(a, b, tol) { if (a == null && b == null) return true; if (a == null || b == null) return false; return Math.abs(Number(a)-Number(b)) <= tol; }
function issue(severity, code, row, field, expected, actual, message) {
  return { phase:'5B', validator:'formula-validator', severity, code, rowIndex: row?.rowIndex ?? null, refNo: row?.refNo || row?.ca97 || '', type: clean(row?.type || row?.rawType).toUpperCase(), field, expected, actual, message };
}
function magBpCp(row) { const cp=point(row?.cp), bp=point(row?.bp); if(!cp||!bp) return null; const dx=bp.x-cp.x, dy=bp.y-cp.y, dz=bp.z-cp.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); }
function ca4(row) { return clean(row?.ca?.['4'] ?? row?.ca4 ?? row?.CA4 ?? row?.['CA4'] ?? row?.['CA 4']); }
function typeOf(row) { return clean(row?.type || row?.rawType).toUpperCase(); }

export function validateFormulaRow(row, options = {}) {
  const tol = Number(options.tolerance ?? 0.001);
  const diagnostics = [];
  const ep1 = point(row?.ep1);
  const ep2 = point(row?.ep2);

  if (ep1 && ep2) {
    const delta = calculateDeltaFromEps(ep1, ep2);
    const lenAxis = calculateLenAxisFromDelta(delta);
    if (!approx(row?.deltaX, delta.x, tol)) diagnostics.push(issue('error','FORMULA-DELTA-X',row,'deltaX',delta.x,row?.deltaX,'DELTA_X must equal EP2.x - EP1.x.'));
    if (!approx(row?.deltaY, delta.y, tol)) diagnostics.push(issue('error','FORMULA-DELTA-Y',row,'deltaY',delta.y,row?.deltaY,'DELTA_Y must equal EP2.y - EP1.y.'));
    if (!approx(row?.deltaZ, delta.z, tol)) diagnostics.push(issue('error','FORMULA-DELTA-Z',row,'deltaZ',delta.z,row?.deltaZ,'DELTA_Z must equal EP2.z - EP1.z.'));

    for (const f of ['len1','axis1','len2','axis2','len3','axis3']) {
      const expected = lenAxis[f];
      const actual = row?.[f];
      if (expected == null || expected === '') {
        if (actual != null && actual !== '' && Number(actual) !== 0) diagnostics.push(issue('warning',`FORMULA-${f.toUpperCase()}-ZERO`,row,f,expected,actual,`${f} should be blank/null when delta is zero.`));
      } else if (f.startsWith('len')) {
        if (!approx(actual, expected, tol)) diagnostics.push(issue('error',`FORMULA-${f.toUpperCase()}`,row,f,expected,actual,`${f} inconsistent with EP delta.`));
      } else if (clean(actual).toLowerCase() !== clean(expected).toLowerCase()) {
        diagnostics.push(issue('error',`FORMULA-${f.toUpperCase()}`,row,f,expected,actual,`${f} inconsistent with delta sign.`));
      }
    }
  }

  if ([row?.len1,row?.len2,row?.len3,row?.axis1,row?.axis2,row?.axis3].some(v => clean(v))) {
    const d = calculateDeltaFromLenAxis(row);
    if (row?.deltaX != null && !approx(row.deltaX, d.x, tol)) diagnostics.push(issue('error','FORMULA-LENAXIS-DELTA-X',row,'deltaX',d.x,row.deltaX,'DELTA_X inconsistent with LEN1/AXIS1.'));
    if (row?.deltaY != null && !approx(row.deltaY, d.y, tol)) diagnostics.push(issue('error','FORMULA-LENAXIS-DELTA-Y',row,'deltaY',d.y,row.deltaY,'DELTA_Y inconsistent with LEN2/AXIS2.'));
    if (row?.deltaZ != null && !approx(row.deltaZ, d.z, tol)) diagnostics.push(issue('error','FORMULA-LENAXIS-DELTA-Z',row,'deltaZ',d.z,row.deltaZ,'DELTA_Z inconsistent with LEN3/AXIS3.'));
  }

  const t = typeOf(row);
  if (t === 'TEE' || t === 'OLET') {
    const geomBrlen = magBpCp(row);
    const brSrc = clean(row?.brlenResolution?.source);
    const tableFallback = /table|Service|rc-config|direct-data-table/i.test(brSrc);
    if (geomBrlen != null && row?.brlen != null && !tableFallback && !approx(row.brlen, geomBrlen, tol)) {
      diagnostics.push(issue('error','FORMULA-BRLEN',row,'brlen',geomBrlen,row.brlen,'BRLEN must equal magnitude(BP - CP) unless table/direct fallback provenance is recorded.'));
    }
  }

  if (row?.bore != null && row?.diameter != null && !approx(row.diameter, row.bore, tol)) {
    diagnostics.push(issue('error','FORMULA-DIAMETER',row,'diameter',row.bore,row.diameter,'DIAMETER must equal BORE.'));
  }

  const wt = ca4(row);
  if (wt && clean(row?.wallThick) && clean(row.wallThick) !== wt) {
    diagnostics.push(issue('error','FORMULA-WALL-THICK',row,'wallThick',wt,row.wallThick,'WALL_THICK must equal CA4.'));
  }

  for (const ptr of ['bendPtr','rigidPtr','intPtr']) {
    const expected = row?.calculatedColumns?.expected?.[ptr];
    if (expected != null && !approx(row?.[ptr], expected, 0)) diagnostics.push(issue('error',`FORMULA-${ptr.toUpperCase()}`,row,ptr,expected,row?.[ptr],`${ptr} does not match expected pointer counter.`));
  }

  return diagnostics;
}

export function validateFormulaRows(rows = [], options = {}) {
  const diagnostics = [];
  for (const row of Array.isArray(rows) ? rows : []) diagnostics.push(...validateFormulaRow(row, options));
  return { pass: diagnostics.filter(d=>d.severity==='error').length === 0, diagnostics, summary: { rows: Array.isArray(rows)?rows.length:0, errors: diagnostics.filter(d=>d.severity==='error').length, warnings: diagnostics.filter(d=>d.severity==='warning').length } };
}

try { if (typeof window !== 'undefined') { window.validatePcfFormulaRows = validateFormulaRows; window.validatePcfFormulaRow = validateFormulaRow; } } catch (_) {}
