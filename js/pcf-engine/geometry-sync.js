/**
 * geometry-sync.js — Phase 4B Bi-directional coordinate calculator
 *
 * Supports three reconstruction paths:
 *   Path A: EP1/EP2 available -> DELTA + LEN/AXIS
 *   Path B: DELTA available   -> EP1/EP2 + LEN/AXIS
 *   Path C: LEN/AXIS available -> DELTA + EP1/EP2
 *
 * Chaining rule:
 *   If EP1 is missing and the row is reconstructed from DELTA or LEN/AXIS,
 *   EP1 = previous row EP2. If no previous EP2 exists, EP1 = origin.
 */

const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 });

function n(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function point(value) {
  if (!value || typeof value !== 'object') return null;
  const x = n(value.x), y = n(value.y), z = n(value.z);
  return [x, y, z].every(v => v != null) ? { x, y, z } : null;
}

function clonePoint(pt) {
  return pt ? { x: pt.x, y: pt.y, z: pt.z } : null;
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function hasAnyDelta(row) {
  return [row?.deltaX, row?.deltaY, row?.deltaZ].some(v => n(v) != null);
}

function hasAnyLenAxis(row) {
  return [row?.len1, row?.len2, row?.len3].some(v => n(v) != null) ||
    [row?.axis1, row?.axis2, row?.axis3].some(v => String(v || '').trim());
}

function hasBothEps(row) {
  return !!point(row?.ep1) && !!point(row?.ep2);
}

function axisLabel(delta, axis) {
  if (delta == null || Math.abs(delta) < 1e-9) return '';
  if (axis === 'x') return delta > 0 ? 'East' : 'West';
  if (axis === 'y') return delta > 0 ? 'North' : 'South';
  if (axis === 'z') return delta > 0 ? 'Up' : 'Down';
  return '';
}

export function deltaToLenAxis(delta, axis) {
  const d = n(delta, 0);
  if (Math.abs(d) < 1e-9) return { len: null, axis: '' };
  return { len: d, axis: axisLabel(d, axis) };
}

export function axisToSign(axis) {
  const a = String(axis || '').trim().toLowerCase();
  if (['east', '+x', 'x+', 'e'].includes(a)) return 1;
  if (['west', '-x', 'x-', 'w'].includes(a)) return -1;
  if (['north', '+y', 'y+', 'n'].includes(a)) return 1;
  if (['south', '-y', 'y-', 's'].includes(a)) return -1;
  if (['up', '+z', 'z+', 'u'].includes(a)) return 1;
  if (['down', '-z', 'z-', 'd'].includes(a)) return -1;
  return 0;
}

export function lenAxisToDelta(length, axis) {
  const len = n(length, 0);
  const sign = axisToSign(axis);
  if (!sign || Math.abs(len) < 1e-9) return 0;
  return Math.abs(len) * sign;
}

export function calculateDeltaFromEps(ep1, ep2) {
  const a = point(ep1), b = point(ep2);
  if (!a || !b) return null;
  return sub(b, a);
}

export function calculateLenAxisFromDelta(delta) {
  const dx = n(delta?.x, 0), dy = n(delta?.y, 0), dz = n(delta?.z, 0);
  const x = deltaToLenAxis(dx, 'x');
  const y = deltaToLenAxis(dy, 'y');
  const z = deltaToLenAxis(dz, 'z');
  return {
    len1: x.len,
    axis1: x.axis,
    len2: y.len,
    axis2: y.axis,
    len3: z.len,
    axis3: z.axis,
  };
}

export function calculateDeltaFromLenAxis(row) {
  return {
    x: lenAxisToDelta(row?.len1, row?.axis1),
    y: lenAxisToDelta(row?.len2, row?.axis2),
    z: lenAxisToDelta(row?.len3, row?.axis3),
  };
}

function deltaFromRow(row) {
  return {
    x: n(row?.deltaX, 0),
    y: n(row?.deltaY, 0),
    z: n(row?.deltaZ, 0),
  };
}

function startPoint(row, prevEp2) {
  return point(row?.ep1) || point(prevEp2) || clonePoint(ORIGIN);
}

function applyDelta(row, delta, prevEp2) {
  const ep1 = startPoint(row, prevEp2);
  const ep2 = point(row?.ep2) || add(ep1, delta);
  const lenAxis = calculateLenAxisFromDelta(delta);
  return {
    ...row,
    ep1,
    ep2,
    deltaX: delta.x,
    deltaY: delta.y,
    deltaZ: delta.z,
    ...lenAxis,
    geometrySync: {
      path: row.geometrySync?.path || '',
      source: row.geometrySync?.source || '',
      chainedFromPrevious: !point(row?.ep1) && !!point(prevEp2),
      usedOrigin: !point(row?.ep1) && !point(prevEp2),
    }
  };
}

export function syncGeometryRow(row, options = {}) {
  const prevEp2 = options.prevEp2 || null;
  const ep1 = point(row?.ep1);
  const ep2 = point(row?.ep2);
  const diagnostics = [];

  if (hasBothEps(row)) {
    const delta = calculateDeltaFromEps(ep1, ep2);
    const synced = applyDelta({ ...row, geometrySync: { path: 'A', source: 'EP1/EP2' } }, delta, prevEp2);
    synced.geometryDiagnostics = diagnostics;
    return synced;
  }

  if (hasAnyDelta(row)) {
    const delta = deltaFromRow(row);
    const synced = applyDelta({ ...row, geometrySync: { path: 'B', source: 'DELTA' } }, delta, prevEp2);
    synced.geometryDiagnostics = diagnostics;
    return synced;
  }

  if (hasAnyLenAxis(row)) {
    const delta = calculateDeltaFromLenAxis(row);
    const synced = applyDelta({ ...row, geometrySync: { path: 'C', source: 'LEN/AXIS' } }, delta, prevEp2);
    synced.geometryDiagnostics = diagnostics;
    return synced;
  }

  diagnostics.push({
    severity: 'warning',
    code: 'GS-001',
    message: 'No EP, DELTA, or LEN/AXIS data available for geometry sync.',
  });

  return {
    ...row,
    geometrySync: { path: 'none', source: 'none', chainedFromPrevious: false, usedOrigin: false },
    geometryDiagnostics: diagnostics,
  };
}

export function syncGeometryRows(rows = [], options = {}) {
  const out = [];
  let prevEp2 = point(options.startEp2) || null;
  for (const row of rows || []) {
    const synced = syncGeometryRow(row, { ...options, prevEp2 });
    out.push(synced);
    if (point(synced.ep2)) prevEp2 = point(synced.ep2);
  }
  return {
    rows: out,
    summary: {
      inputRows: Array.isArray(rows) ? rows.length : 0,
      outputRows: out.length,
      pathA: out.filter(r => r.geometrySync?.path === 'A').length,
      pathB: out.filter(r => r.geometrySync?.path === 'B').length,
      pathC: out.filter(r => r.geometrySync?.path === 'C').length,
      unresolved: out.filter(r => r.geometrySync?.path === 'none').length,
      chainedRows: out.filter(r => r.geometrySync?.chainedFromPrevious).length,
      originRows: out.filter(r => r.geometrySync?.usedOrigin).length,
    }
  };
}

export function validateGeometryRoundTrip(row, tolerance = 0.001) {
  const synced = syncGeometryRow(row);
  const errors = [];
  if (point(synced.ep1) && point(synced.ep2)) {
    const delta = calculateDeltaFromEps(synced.ep1, synced.ep2);
    const dxOk = Math.abs(delta.x - n(synced.deltaX, 0)) <= tolerance;
    const dyOk = Math.abs(delta.y - n(synced.deltaY, 0)) <= tolerance;
    const dzOk = Math.abs(delta.z - n(synced.deltaZ, 0)) <= tolerance;
    if (!dxOk) errors.push({ field: 'deltaX', expected: delta.x, actual: synced.deltaX });
    if (!dyOk) errors.push({ field: 'deltaY', expected: delta.y, actual: synced.deltaY });
    if (!dzOk) errors.push({ field: 'deltaZ', expected: delta.z, actual: synced.deltaZ });
  }
  return { pass: errors.length === 0, errors, synced };
}

try {
  if (typeof window !== 'undefined') {
    window.syncPcfGeometryRow = syncGeometryRow;
    window.syncPcfGeometryRows = syncGeometryRows;
    window.validatePcfGeometryRoundTrip = validateGeometryRoundTrip;
  }
} catch (_) {}
