/**
 * calculated-columns.js — Phase 4E calculated columns engine
 *
 * Adds deterministic calculated fields:
 * - DIAMETER = BORE
 * - WALL_THICK = CA4
 * - BEND_PTR increments when to-component is BEND
 * - RIGID_PTR increments when to-component is FLANGE or VALVE
 * - INT_PTR increments when to-component is TEE or OLET
 */

function clean(value) {
  return String(value ?? '').trim();
}

function n(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function typeOf(row) {
  return clean(row?.type || row?.rawType || row?.Type).toUpperCase();
}

function ca4(row) {
  return clean(row?.ca?.['4'] ?? row?.ca4 ?? row?.CA4 ?? row?.['CA4'] ?? row?.['CA 4']);
}

function bore(row) {
  return n(row?.bore ?? row?.BORE ?? row?.Bore);
}

function targetType(row, rows, index) {
  if (row?.toComponentType || row?.toType) return clean(row.toComponentType || row.toType).toUpperCase();
  const next = rows?.[index + 1];
  return typeOf(next);
}

export function applyCalculatedColumns(rows = [], options = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  let bendPtr = n(options.startBendPtr, 0) || 0;
  let rigidPtr = n(options.startRigidPtr, 0) || 0;
  let intPtr = n(options.startIntPtr, 0) || 0;

  const out = safeRows.map((row, index) => {
    const toType = targetType(row, safeRows, index);
    if (toType === 'BEND') bendPtr += 1;
    if (toType === 'FLANGE' || toType === 'VALVE') rigidPtr += 1;
    if (toType === 'TEE' || toType === 'OLET') intPtr += 1;

    const b = bore(row);
    const wt = ca4(row);

    return {
      ...row,
      diameter: row?.diameter ?? row?.DIAMETER ?? b,
      wallThick: row?.wallThick ?? row?.WALL_THICK ?? wt,
      bendPtr: row?.bendPtr ?? row?.BEND_PTR ?? bendPtr,
      rigidPtr: row?.rigidPtr ?? row?.RIGID_PTR ?? rigidPtr,
      intPtr: row?.intPtr ?? row?.INT_PTR ?? intPtr,
      calculatedColumns: {
        ...(row?.calculatedColumns || {}),
        diameterSource: b != null ? 'BORE' : 'unresolved',
        wallThickSource: wt ? 'CA4' : 'unresolved',
        pointerRule: 'to-component-type',
        toType,
      }
    };
  });

  return {
    rows: out,
    summary: {
      inputRows: safeRows.length,
      outputRows: out.length,
      finalBendPtr: bendPtr,
      finalRigidPtr: rigidPtr,
      finalIntPtr: intPtr,
      diameterResolved: out.filter(r => r.diameter != null && r.diameter !== '').length,
      wallThickResolved: out.filter(r => clean(r.wallThick)).length,
    }
  };
}

export function applyCalculatedColumnsToRow(row, context = {}) {
  const result = applyCalculatedColumns([row], context);
  return result.rows[0];
}

try {
  if (typeof window !== 'undefined') {
    window.applyPcfCalculatedColumns = applyCalculatedColumns;
    window.applyPcfCalculatedColumnsToRow = applyCalculatedColumnsToRow;
  }
} catch (_) {}
