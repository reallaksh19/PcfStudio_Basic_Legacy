/**
 * fallback-validator.js — Phase 5C fallback validation
 *
 * Validates fallback provenance/result rules:
 * - TEE CP midpoint fallback
 * - BEND CP corner fallback, not midpoint
 * - OLET CP/BP fallback diagnostics
 * - CP bore = EP/header bore
 * - CA97 / CA98 fallback chains
 * - Branch bore fallback: TEE=header bore, OLET=50 mm
 */

function clean(v) { return String(v ?? '').trim(); }
function n(v, fallback = null) { if (v == null || v === '') return fallback; const x = Number(v); return Number.isFinite(x) ? x : fallback; }
function point(p) { if (!p || typeof p !== 'object') return null; const x=n(p.x), y=n(p.y), z=n(p.z); return [x,y,z].every(v=>v!=null) ? {x,y,z} : null; }
function approx(a,b,tol){ if(a==null&&b==null)return true; if(a==null||b==null)return false; return Math.abs(Number(a)-Number(b))<=tol; }
function typeOf(row){ return clean(row?.type || row?.rawType).toUpperCase(); }
function midpoint(a,b){ const p1=point(a), p2=point(b); if(!p1||!p2)return null; return {x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2,z:(p1.z+p2.z)/2}; }
function dist(a,b){ const p1=point(a), p2=point(b); if(!p1||!p2)return null; const dx=p1.x-p2.x,dy=p1.y-p2.y,dz=p1.z-p2.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); }
function issue(severity, code, row, message, extra={}){ return { phase:'5C', validator:'fallback-validator', severity, code, rowIndex: row?.rowIndex ?? null, refNo: row?.refNo || row?.ca97 || '', type:typeOf(row), message, ...extra }; }
function hasDiag(row, codePrefix){ return (row?.cpBpFallbackDiagnostics || row?.fallbackDiagnostics || []).some(d => clean(d.code).startsWith(codePrefix)); }

export function validateFallbackRow(row, options = {}) {
  const tol = Number(options.tolerance ?? 0.001);
  const diagnostics = [];
  const t = typeOf(row);

  if (t === 'TEE') {
    if (point(row.ep1) && point(row.ep2) && point(row.cp)) {
      const mp = midpoint(row.ep1,row.ep2);
      const d = dist(row.cp, mp);
      if (d != null && d > tol && hasDiag(row,'CP-TEE')) diagnostics.push(issue('error','FALLBACK-TEE-CP-MIDPOINT',row,'TEE CP fallback provenance exists but CP is not midpoint of EP1/EP2.',{expected:mp,actual:row.cp,distance:d}));
    }
    if ((row.branchBore == null || row.branchBore === '') && row.bore != null) diagnostics.push(issue('warning','FALLBACK-TEE-BRANCH-BORE-MISSING',row,'TEE branch bore missing; expected fallback to header bore.'));
    if (row.branchBore != null && row.bore != null && hasDiag(row,'BORE-TEE-BRANCH') && !approx(row.branchBore,row.bore,tol)) diagnostics.push(issue('error','FALLBACK-TEE-BRANCH-BORE',row,'TEE branch bore fallback should equal header bore.',{expected:row.bore,actual:row.branchBore}));
  }

  if (t === 'BEND') {
    if (point(row.ep1) && point(row.ep2) && point(row.cp)) {
      const mp = midpoint(row.ep1,row.ep2);
      const dMid = dist(row.cp, mp);
      if (dMid != null && dMid <= tol && hasDiag(row,'CP-BEND')) diagnostics.push(issue('error','FALLBACK-BEND-CP-MIDPOINT',row,'BEND CP fallback must not use midpoint; expected corner intersection.'));
      const r1 = dist(row.cp,row.ep1), r2 = dist(row.cp,row.ep2);
      if (r1 != null && r2 != null && Math.abs(r1-r2) > tol) diagnostics.push(issue('warning','FALLBACK-BEND-RADIUS-MISMATCH',row,'BEND CP distances to EP1/EP2 are not equal.',{r1,r2}));
    }
  }

  if (t === 'OLET') {
    if ((row.branchBore == null || row.branchBore === '') && !hasDiag(row,'BORE-OLET-BRANCH')) diagnostics.push(issue('warning','FALLBACK-OLET-BRANCH-BORE-MISSING',row,'OLET branch bore missing without fallback provenance.'));
    if (hasDiag(row,'BORE-OLET-BRANCH') && !approx(row.branchBore,50,tol)) diagnostics.push(issue('error','FALLBACK-OLET-BRANCH-BORE',row,'OLET branch bore fallback should be 50 mm.',{expected:50,actual:row.branchBore}));
    if (!point(row.cp) && !hasDiag(row,'CP-OLET')) diagnostics.push(issue('warning','FALLBACK-OLET-CP-PROVENANCE',row,'OLET CP missing without fallback/deferred provenance.'));
    if (!point(row.bp) && !hasDiag(row,'BP-OLET')) diagnostics.push(issue('warning','FALLBACK-OLET-BP-PROVENANCE',row,'OLET BP missing without fallback/incomplete provenance.'));
  }

  if (point(row.cp) && row.cpBore != null && row.bore != null && !approx(row.cpBore,row.bore,tol)) {
    diagnostics.push(issue('error','FALLBACK-CP-BORE',row,'CP bore fallback must equal header/EP bore.',{expected:row.bore,actual:row.cpBore}));
  }

  const refNo = clean(row.refNo);
  const csvSeq = clean(row.csvSeqNo);
  if (!clean(row.ca97)) diagnostics.push(issue('warning','FALLBACK-CA97-MISSING',row,'CA97 missing; expected fallback from REF NO.'));
  else if (refNo && clean(row.ca97) !== refNo && row?.trace?.fallbacks?.ca97) diagnostics.push(issue('error','FALLBACK-CA97',row,'CA97 fallback provenance exists but CA97 does not equal REF NO.',{expected:refNo,actual:row.ca97}));

  if (!clean(row.ca98)) diagnostics.push(issue('warning','FALLBACK-CA98-MISSING',row,'CA98 missing; expected fallback from CSV SEQ NO.'));
  else if (csvSeq && clean(row.ca98) !== csvSeq && row?.trace?.fallbacks?.ca98) diagnostics.push(issue('error','FALLBACK-CA98',row,'CA98 fallback provenance exists but CA98 does not equal CSV SEQ NO.',{expected:csvSeq,actual:row.ca98}));

  return diagnostics;
}

export function validateFallbackRows(rows = [], options = {}) {
  const diagnostics=[];
  for(const row of Array.isArray(rows)?rows:[]) diagnostics.push(...validateFallbackRow(row,options));
  return { pass: diagnostics.filter(d=>d.severity==='error').length===0, diagnostics, summary:{ rows:Array.isArray(rows)?rows.length:0, errors:diagnostics.filter(d=>d.severity==='error').length, warnings:diagnostics.filter(d=>d.severity==='warning').length } };
}

try { if (typeof window !== 'undefined') { window.validatePcfFallbackRows = validateFallbackRows; window.validatePcfFallbackRow = validateFallbackRow; } } catch (_) {}
