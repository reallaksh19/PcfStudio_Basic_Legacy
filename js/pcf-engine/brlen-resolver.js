/**
 * brlen-resolver.js — Phase 4D BRLEN fallback resolver
 *
 * Priority:
 *  1. Direct Data Table BRLEN
 *  2. Calculated magnitude BP - CP
 *  3. TEE equal/reducing ASME lookup through existing app services/config
 *  4. OLET A + 0.5 × Header OD through existing app services/config
 *  5. Incomplete diagnostic
 */

import { getRayConfig, lookupTeeBreln, lookupOletBrlen } from '../ray-concept/rc-config.js';
import { getTeeBrlen, getOletBrlen } from '../services/fallbackcontract.js';

function n(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function clean(value) {
  return String(value ?? '').trim();
}

function point(value) {
  if (!value || typeof value !== 'object') return null;
  const x = n(value.x), y = n(value.y), z = n(value.z);
  return [x, y, z].every(v => v != null) ? { x, y, z } : null;
}

function mag(a, b) {
  const pa = point(a), pb = point(b);
  if (!pa || !pb) return null;
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const dz = pb.z - pa.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function typeOf(component) {
  return clean(component?.type || component?.rawType).toUpperCase();
}

function brlenFromServiceOrConfigForTee(headerBore, branchBore, cfg) {
  const h = n(headerBore), b = n(branchBore ?? headerBore);
  if (h == null || b == null) return null;

  const fromService = getTeeBrlen(h, b);
  if (fromService != null) return { value: fromService, source: 'masterTableService.getTeeBrlen' };

  const fromConfig = lookupTeeBreln(h, b, cfg);
  if (fromConfig != null) return { value: fromConfig, source: 'rc-config.lookupTeeBreln' };

  return null;
}

function brlenFromServiceOrConfigForOlet(headerBore, branchBore, cfg) {
  const h = n(headerBore), b = n(branchBore ?? 50);
  if (h == null || b == null) return null;

  const fromService = getOletBrlen(h, b);
  if (fromService != null) return { value: fromService, source: 'masterTableService.getOletBrlen' };

  const fromConfig = lookupOletBrlen(h, b, cfg);
  if (fromConfig != null) return { value: fromConfig, source: 'rc-config.lookupOletBrlen' };

  return null;
}

export function resolveBrlen(component, options = {}) {
  const cfg = options.cfg || getRayConfig();
  const diagnostics = [];
  const t = typeOf(component);

  const direct = n(component?.brlen ?? component?.branchLength ?? component?.BRLEN);
  if (direct != null && direct > 0) {
    return {
      brlen: direct,
      source: 'direct-data-table',
      complete: true,
      diagnostics,
    };
  }

  const geom = mag(component?.cp, component?.bp);
  if (geom != null && geom > 0) {
    return {
      brlen: geom,
      source: 'calculated-bp-minus-cp',
      complete: true,
      diagnostics,
    };
  }

  const headerBore = n(component?.bore ?? component?.headerBore ?? component?.mainBore);
  const branchBore = n(component?.branchBore ?? component?.branch_bore);

  if (t === 'TEE') {
    const hit = brlenFromServiceOrConfigForTee(headerBore, branchBore ?? headerBore, cfg);
    if (hit?.value != null) {
      return {
        brlen: hit.value,
        source: hit.source,
        complete: true,
        diagnostics,
      };
    }
    diagnostics.push({
      severity: 'error',
      code: 'BRLEN-TEE-MISSING',
      message: 'TEE BRLEN unresolved: no direct BRLEN, no BP/CP geometry, and no ASME tee table match.',
      headerBore,
      branchBore: branchBore ?? headerBore,
    });
  } else if (t === 'OLET') {
    const branch = branchBore ?? 50;
    const hit = brlenFromServiceOrConfigForOlet(headerBore, branch, cfg);
    if (hit?.value != null) {
      return {
        brlen: hit.value,
        source: hit.source,
        complete: true,
        diagnostics,
      };
    }
    diagnostics.push({
      severity: 'error',
      code: 'BRLEN-OLET-MISSING',
      message: 'OLET BRLEN unresolved: no direct BRLEN, no BP/CP geometry, and no weldolet table match.',
      headerBore,
      branchBore: branch,
    });
  } else {
    diagnostics.push({
      severity: 'info',
      code: 'BRLEN-NOT-APPLICABLE',
      message: `BRLEN fallback is not applicable to component type ${t || '(blank)'}.`,
    });
  }

  return {
    brlen: null,
    source: 'unresolved',
    complete: false,
    diagnostics,
  };
}

export function applyBrlenFallback(component, options = {}) {
  const result = resolveBrlen(component, options);
  return {
    ...component,
    brlen: result.brlen ?? component?.brlen ?? component?.branchLength ?? null,
    brlenResolution: result,
  };
}

export function resolveBrlenRows(rows = [], options = {}) {
  const out = (Array.isArray(rows) ? rows : []).map(row => applyBrlenFallback(row, options));
  return {
    rows: out,
    summary: {
      inputRows: Array.isArray(rows) ? rows.length : 0,
      resolved: out.filter(r => r.brlenResolution?.complete).length,
      unresolved: out.filter(r => r.brlenResolution && !r.brlenResolution.complete && !['BRLEN-NOT-APPLICABLE'].includes(r.brlenResolution.diagnostics?.[0]?.code)).length,
      direct: out.filter(r => r.brlenResolution?.source === 'direct-data-table').length,
      geometry: out.filter(r => r.brlenResolution?.source === 'calculated-bp-minus-cp').length,
      table: out.filter(r => /Service|rc-config/.test(r.brlenResolution?.source || '')).length,
    }
  };
}

try {
  if (typeof window !== 'undefined') {
    window.resolvePcfBrlen = resolveBrlen;
    window.resolvePcfBrlenRows = resolveBrlenRows;
  }
} catch (_) {}
