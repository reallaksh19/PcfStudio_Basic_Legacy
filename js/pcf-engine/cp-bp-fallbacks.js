/**
 * cp-bp-fallbacks.js — Phase 4C CP/BP fallback calculation
 *
 * Rules:
 * - TEE CP = midpoint(EP1, EP2)
 * - TEE/OLET BP = CP + BRLEN * branch direction unit vector
 * - OLET CP uses existing CP if present; parent-axis inference is deferred until
 *   parent pipe topology is passed into this module.
 * - BEND CP is corner intersection for 90° axis-aligned bends, not midpoint.
 */

import { resolveBrlen } from './brlen-resolver.js';

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

function midpoint(a, b) {
  const p1 = point(a), p2 = point(b);
  if (!p1 || !p2) return null;
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    z: (p1.z + p2.z) / 2,
  };
}

function mag(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function unit(v) {
  const m = mag(v);
  if (m < 1e-9) return null;
  return scale(v, 1 / m);
}

function typeOf(component) {
  return clean(component?.type || component?.rawType).toUpperCase();
}

function directionFromAxis(axis) {
  const a = clean(axis).toLowerCase();
  if (['east', '+x', 'x+', 'e'].includes(a)) return { x: 1, y: 0, z: 0 };
  if (['west', '-x', 'x-', 'w'].includes(a)) return { x: -1, y: 0, z: 0 };
  if (['north', '+y', 'y+', 'n'].includes(a)) return { x: 0, y: 1, z: 0 };
  if (['south', '-y', 'y-', 's'].includes(a)) return { x: 0, y: -1, z: 0 };
  if (['up', '+z', 'z+', 'u'].includes(a)) return { x: 0, y: 0, z: 1 };
  if (['down', '-z', 'z-', 'd'].includes(a)) return { x: 0, y: 0, z: -1 };
  return null;
}

function inferBranchDirection(component, cp) {
  const explicit = directionFromAxis(component?.branchAxis || component?.branchDirection || component?.axis || component?.direction);
  if (explicit) return { dir: explicit, source: 'explicit-axis' };

  const existingBp = point(component?.bp);
  if (existingBp && cp) {
    const u = unit(sub(existingBp, cp));
    if (u) return { dir: u, source: 'existing-bp' };
  }

  return { dir: null, source: 'unresolved' };
}

function cornerCpForBend(component) {
  const ep1 = point(component?.ep1);
  const ep2 = point(component?.ep2);
  if (!ep1 || !ep2) return null;

  const candidates = [
    { x: ep1.x, y: ep1.y, z: ep2.z },
    { x: ep1.x, y: ep2.y, z: ep1.z },
    { x: ep2.x, y: ep1.y, z: ep1.z },
    { x: ep1.x, y: ep2.y, z: ep2.z },
    { x: ep2.x, y: ep1.y, z: ep2.z },
    { x: ep2.x, y: ep2.y, z: ep1.z },
  ];

  const radius = n(component?.radius ?? component?.bendRadius);
  if (radius != null && radius > 0) {
    let best = null;
    let bestErr = Infinity;
    for (const c of candidates) {
      const d1 = mag(sub(c, ep1));
      const d2 = mag(sub(c, ep2));
      const err = Math.abs(d1 - radius) + Math.abs(d2 - radius);
      if (err < bestErr) { bestErr = err; best = c; }
    }
    return best;
  }

  // If no radius is available, choose the right-angle corner candidate with
  // equal distances if possible. This is a best-effort fallback and should be
  // accompanied by a diagnostic.
  let best = null;
  let bestErr = Infinity;
  for (const c of candidates) {
    const d1 = mag(sub(c, ep1));
    const d2 = mag(sub(c, ep2));
    const err = Math.abs(d1 - d2);
    if (d1 > 1e-6 && d2 > 1e-6 && err < bestErr) { bestErr = err; best = c; }
  }
  return best;
}

export function applyCpBpFallback(component, options = {}) {
  const t = typeOf(component);
  const diagnostics = [];
  let out = { ...component };

  if (t === 'TEE') {
    if (!point(out.cp)) {
      const cp = midpoint(out.ep1, out.ep2);
      if (cp) {
        out.cp = cp;
        diagnostics.push({ severity: 'info', code: 'CP-TEE-MIDPOINT', message: 'TEE CP calculated as midpoint of EP1/EP2.' });
      } else {
        diagnostics.push({ severity: 'error', code: 'CP-TEE-MISSING', message: 'TEE CP unresolved: EP1/EP2 not available.' });
      }
    }

    if (!point(out.bp)) {
      const cp = point(out.cp);
      const br = resolveBrlen(out, options);
      const dir = inferBranchDirection(out, cp);
      if (cp && br.brlen != null && dir.dir) {
        out.bp = add(cp, scale(dir.dir, br.brlen));
        out.brlen = br.brlen;
        diagnostics.push({ severity: 'info', code: 'BP-TEE-BRLEN', message: 'TEE BP calculated from CP + BRLEN * direction.', source: br.source, directionSource: dir.source });
      } else {
        diagnostics.push({ severity: 'error', code: 'BP-TEE-INCOMPLETE', message: 'TEE BP unresolved: CP, BRLEN, or branch direction missing.', brlen: br, directionSource: dir.source });
      }
    }

    if (out.branchBore == null && out.bore != null) {
      out.branchBore = out.bore;
      diagnostics.push({ severity: 'info', code: 'BORE-TEE-BRANCH-FALLBACK', message: 'TEE branch bore defaulted to header bore.' });
    }
  }

  if (t === 'OLET') {
    if (!point(out.cp)) {
      diagnostics.push({ severity: 'warning', code: 'CP-OLET-PARENT-AXIS-DEFERRED', message: 'OLET CP from parent pipe axis requires topology context and is deferred.' });
    }

    if (out.branchBore == null) {
      out.branchBore = 50;
      diagnostics.push({ severity: 'info', code: 'BORE-OLET-BRANCH-FALLBACK', message: 'OLET branch bore defaulted to 50 mm.' });
    }

    if (!point(out.bp)) {
      const cp = point(out.cp);
      const br = resolveBrlen(out, options);
      const dir = inferBranchDirection(out, cp);
      if (cp && br.brlen != null && dir.dir) {
        out.bp = add(cp, scale(dir.dir, br.brlen));
        out.brlen = br.brlen;
        diagnostics.push({ severity: 'info', code: 'BP-OLET-BRLEN', message: 'OLET BP calculated from CP + BRLEN * direction.', source: br.source, directionSource: dir.source });
      } else {
        diagnostics.push({ severity: 'error', code: 'BP-OLET-INCOMPLETE', message: 'OLET BP unresolved: CP, BRLEN, or branch direction missing.', brlen: br, directionSource: dir.source });
      }
    }
  }

  if (t === 'BEND') {
    if (!point(out.cp)) {
      const cp = cornerCpForBend(out);
      if (cp) {
        out.cp = cp;
        diagnostics.push({ severity: out.radius || out.bendRadius ? 'info' : 'warning', code: 'CP-BEND-CORNER', message: 'BEND CP calculated as axis-aligned corner intersection, not midpoint.' });
      } else {
        diagnostics.push({ severity: 'error', code: 'CP-BEND-MISSING', message: 'BEND CP unresolved: EP1/EP2 not available.' });
      }
    }
  }

  if (point(out.cp) && out.cpBore == null && out.bore != null) {
    out.cpBore = out.bore;
  }

  out.cpBpFallbackDiagnostics = diagnostics;
  return out;
}

export function applyCpBpFallbacks(rows = [], options = {}) {
  const out = (Array.isArray(rows) ? rows : []).map(row => applyCpBpFallback(row, options));
  return {
    rows: out,
    summary: {
      inputRows: Array.isArray(rows) ? rows.length : 0,
      outputRows: out.length,
      diagnostics: out.reduce((acc, r) => acc + (r.cpBpFallbackDiagnostics?.length || 0), 0),
      errors: out.reduce((acc, r) => acc + (r.cpBpFallbackDiagnostics || []).filter(d => d.severity === 'error').length, 0),
      warnings: out.reduce((acc, r) => acc + (r.cpBpFallbackDiagnostics || []).filter(d => d.severity === 'warning').length, 0),
    }
  };
}

try {
  if (typeof window !== 'undefined') {
    window.applyPcfCpBpFallback = applyCpBpFallback;
    window.applyPcfCpBpFallbacks = applyCpBpFallbacks;
  }
} catch (_) {}
