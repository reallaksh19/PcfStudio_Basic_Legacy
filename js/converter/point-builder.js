/**
 * point-builder.js — Build PointDict from a ComponentGroup's rows
 * Extracts all geometry and design values per Point number.
 * Applies fallback defaults from config.caDefinitions.
 *
 * Exports:
 *   buildPts(group, config)   → PointDict
 *   getPrimary(pts)           → Point   (Point "1" or "0" or first)
 *   getBranch(pts)            → Point | null  (Point "3" or null)
 *   getEndpoints(pts, rule)   → {ep1, ep2, cp, bp}  geometry points
 */

import { warn } from '../logger.js';
import { parseCoord, parseBore } from '../geometry/coord-engine.js';

const MOD = 'point-builder';

/**
 * Coerce a value to float. Returns defaultVal if null/empty/NaN.
 * @param {*} val
 * @param {number} defaultVal
 * @returns {number}
 */
const _toFloat = (val, defaultVal = 0) => {
  if (val === null || val === undefined || val === '') return defaultVal;
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(n) ? defaultVal : n;
};

/**
 * Get a design value from a row, applying CA default if missing/zero.
 * @param {*} rowValue
 * @param {object} caDef    - from config.caDefinitions[slot]
 * @returns {*}
 */
const _resolveCAValue = (rowValue, caDef) => {
  if (!caDef) return rowValue;
  if (rowValue === null || rowValue === undefined || rowValue === '' || rowValue === 0) {
    return caDef.default;
  }
  return rowValue;
};

/**
 * Build PointDict from a ComponentGroup.
 * @param {object} group    - ComponentGroup from grouper
 * @param {object} config   - full config
 * @returns {object}  pts   - { '0': {...}, '1': {...}, '2': {...}, '3': {...} }
 */
export const buildPts = (group, config) => {
  if (!group?.rows?.length) {
    warn(MOD, 'buildPts', `No rows in group: ${group?.refno}`, { refno: group?.refno });
    return {};
  }

  const caDefs = config?.caDefinitions ?? {};
  const pts = {};

  // Process rows sequentially from first to last (CSV order).
  // pts['1'] is always the FIRST row of this group.
  // pts['2'] is always the LAST row of this group.
  // Branch / centre points are resolved from intermediate rows by their Point column value.

  /**
   * Helper to find a value by fuzzy matching keys (case-insensitive, ignores spaces/special chars)
   */
  const _fuzzyFinder = (row, ...candidates) => {
    const norm = (s) => String(s).replace(/[^a-z0-9]/gi, '').toLowerCase();
    const candNorms = candidates.map(norm);
    for (const [key, val] of Object.entries(row)) {
      if (candNorms.includes(norm(key))) return val;
    }
    return undefined;
  };

  /**
   * Build a point object from a raw row.
   */
  const _buildPoint = (row) => {
    const isBlank = (row.East === undefined || row.East === null || String(row.East).trim() === '') &&
      (row.North === undefined || row.North === null || String(row.North).trim() === '') &&
      (row.Up === undefined || row.Up === null || String(row.Up).trim() === '');

    return {
      E: _toFloat(row.East, 0),
      N: _toFloat(row.North, 0),
      U: _toFloat(row.Up, 0),
      bore: row.Bore !== null ? _toFloat(row.Bore, 0) : parseBore(row._orig_Bore ?? ''),
      radius: _toFloat(row.Radius, 0),
      wall: _toFloat(_fuzzyFinder(row, 'Wall Thickness', 'wallthick'), _toFloat(caDefs.CA4?.default, 9.53)),
      corr: _toFloat(_fuzzyFinder(row, 'Corrosion Allowance', 'corrallow'), _toFloat(caDefs.CA7?.default, 3)),
      weight: _toFloat(row.Weight, _toFloat(caDefs.CA8?.default, 0)),
      insul: _toFloat(_fuzzyFinder(row, 'Insulation thickness', 'insulthick'), _toFloat(caDefs.CA5?.default, 0)),
      pressure: _resolveCAValue(_fuzzyFinder(row, 'Pressure'), caDefs.CA1),
      hydro: _resolveCAValue(_fuzzyFinder(row, 'Hydro test pressure', 'hydrotest'), caDefs.CA10),
      material: _resolveCAValue(_fuzzyFinder(row, 'Material'), caDefs.CA3) || '106',
      restraintType: String(row['Restraint Type'] ?? '').trim(),
      nodeName: String(row.NodeName ?? '').trim(),
      compName: String(row.componentName ?? '').trim(),
      rigid: String(row.Rigid ?? '').trim(),
      _rowIndex: row._rowIndex,
      _isBlank: isBlank,
      raw: row,
    };
  };

  const rows = group.rows;

  // Track if we found explicit Point=1 or Point=2 in the CSV
  let hasExplicitP1 = false;
  let hasExplicitP2 = false;

  rows.forEach(row => {
    const ptNum = String(row.Point ?? '').trim();
    if (ptNum === '1') {
      pts['1'] = _buildPoint(row);
      hasExplicitP1 = true;
    } else if (ptNum === '2') {
      pts['2'] = _buildPoint(row);
      hasExplicitP2 = true;
    } else if (ptNum === '3' && row._isBranchPoint && row.EndX !== undefined) {
      // Phase 1 TEE-BP enrichment stamped the perpendicular branch far-endpoint on this row.
      // Use EndX/EndY/EndZ directly — it is already vector-sense corrected.
      pts['3'] = {
        ..._buildPoint(row),
        E: parseFloat(row.EndX) || 0,
        N: parseFloat(row.EndY ?? row.North) || 0,
        U: parseFloat(row.EndZ ?? row.Up) || 0,
      };
    } else if (ptNum) {
      pts[ptNum] = _buildPoint(row);
    }
  });

  // Fallback for sequential logic if CSV didn't explicitly label Point=1
  if (!hasExplicitP1 && rows.length > 0) {
    const firstRowPt = String(rows[0].Point ?? '').trim();
    const firstRowPPt = String(rows[0].PPoint ?? '').trim();
    // Do not improperly duplicate the point if the user explicitly defined it as the END point (Point 2)
    const isExplicitlyP2 = firstRowPt === '2' || firstRowPPt === '2';

    if (!pts['1'] && !isExplicitlyP2) {
      pts['1'] = _buildPoint(rows[0]);
    }
  }

  // Option B & C: Topological Bridge for Grouped Components (Injected/Segmented/Standard)
  // STRICT OVERRIDE: If Stage 1 formally stamped explicit `EndX/Y/Z` target coordinates on the LAST row,
  // we MUST use them to define Point 2. This is critical for single-row synthetic pipes (injected)
  // where P1 comes from StartX and P2 must come from EndX, even if the CSV didn't have a second row.
  const finalRow = rows[rows.length - 1];
  const hasStampedEnd = finalRow && (finalRow.EndX !== undefined || finalRow.EndY !== undefined || finalRow.EndZ !== undefined);

  if (hasStampedEnd && !hasExplicitP2) {
    // No explicit P2 row in CSV — synthesise P2 from the stamped EndX of the final row.
    // This is the normal case for single-row pipes (injected/synthetic) and FLANGEs.
    const pseudoP2Row = {
      ...finalRow,
      East: finalRow.EndX ?? finalRow.East,
      North: finalRow.EndY ?? finalRow.North,
      Up: finalRow.EndZ ?? finalRow.Up
    };
    pts['2'] = _buildPoint(pseudoP2Row);
  } else if (hasStampedEnd && hasExplicitP2) {
    // P2 was already set from an explicit CSV row — do NOT overwrite it.
    // Only for Point=3 (TEE branch): if the P3 row has EndX stamped by Phase 0.5 OR
    // the TEE-BP enrichment (Phase 1), store it in pts['3'] — but only if not already
    // set by the _isBranchPoint path above (which is the preferred higher-quality value).
    const ptKey = String(finalRow.Point ?? '').trim();
    if (ptKey === '3' && finalRow.EndX !== undefined && !pts['3']) {
      pts['3'] = {
        ..._buildPoint(finalRow),
        E: parseFloat(finalRow.EndX) || 0,
        N: parseFloat(finalRow.EndY ?? finalRow.North) || 0,
        U: parseFloat(finalRow.EndZ ?? finalRow.Up) || 0,
      };
    }
  } else if (!hasExplicitP2 && rows.length > 1) {
    // Ultimate fallback if no EndX is stamped and no explicit P2 exists
    pts['2'] = _buildPoint(finalRow);
  }

  // --- ESCAPE HATCH FOR SYNTHETIC PIPES ---
  // If a single row was explicitly mutated into a PIPE (e.g., PSI Override or Gap Fill Injected),
  // it might have had anomalous 'Point' values ('3', '4') from its previous identity (OLET/Flange)
  // preventing standard explicit P1/P2 assignments. We must ruthlessly enforce them here.
  const checkRef = group?.refno || rows[0]?.RefNo || "";

  if (rows.length >= 1 && (checkRef.includes('_pipe') || checkRef.includes('_Injected') || checkRef.includes('_bridged') || checkRef.includes('_Support') || checkRef.includes('_Sp') || checkRef.includes('_Seg') || checkRef.includes('temp'))) {
    if (!pts['1']) {
      pts['1'] = _buildPoint(rows[0]);
    }
    if (!pts['2']) {
      // Force creation of P2 even if EndX is missing (use Start as fallback to avoid crash)
      const pseudoP2Row = {
        ...rows[0],
        East: rows[0].EndX ?? rows[0].East,
        North: rows[0].EndY ?? rows[0].North,
        Up: rows[0].EndZ ?? rows[0].Up
      };
      pts['2'] = _buildPoint(pseudoP2Row);
    }
  }

  // The Validation Gate: Geometry cannot proceed if it lacks two fundamental physical endpoints
  if (!pts['1'] || !pts['2']) {
    const rCurrent = rows[0] || {};
    const ref = group?.refno || rCurrent.RefNo || "UNKNOWN";
    const type = group?.pcfType || rCurrent.Type || "UNKNOWN";

    // Suppress fatal error natively for 0-row synthetic pipes OR split/gap components
    // as they are populated downstream by the algebraic sequence math solver.
    if (rows.length === 0 || ref.includes('_Sp') || ref.includes('_gap')) {
      console.info(`[point-builder] Synthetic Component ${ref} (${type}) bypassed initial point extraction. Geometry will be populated downstream by Algebraic Sequence Math.`);
    } else {
      console.error(`[point-builder] FATAL GEOMETRY ERROR: Component ${ref} (${type}) failed to resolve Pts["1"] or Pts["2"]. This component is missing physical endpoint data and will cause catastrophic downstream failures.`);
    }
  }

  return pts;
};

/**
 * Get the primary point for design value resolution.
 * Priority: "1" → "0" → first available.
 * @param {object} pts
 * @returns {object|null}
 */
export const getPrimary = (pts) =>
  pts['1'] ?? pts['0'] ?? Object.values(pts)[0] ?? null;

/**
 * Get branch point if present (Point "3").
 * @param {object} pts
 * @returns {object|null}
 */
export const getBranch = (pts) => pts['3'] ?? null;

/**
 * Extract named geometry points from pts based on pcfRule.pointMap.
 * Returns null for each missing point and logs a warning.
 * @param {object} pts
 * @param {object} pointMap  - e.g. { EP1:'1', EP2:'2', CP:'0', BP:'3' }
 * @param {string} refno     - for log context
 * @returns {{ ep1, ep2, cp, bp }}  any can be null
 */
export const getEndpoints = (pts, pointMap, refno) => {
  const result = { ep1: null, ep2: null, cp: null, bp: null };

  if (pointMap.EP1) {
    result.ep1 = pts[pointMap.EP1] ?? null;
    if (!result.ep1) warn(MOD, 'getEndpoints', `Missing EP1 (Point "${pointMap.EP1}")`, { refno });
  }
  if (pointMap.EP2) {
    result.ep2 = pts[pointMap.EP2] ?? null;
    if (!result.ep2) warn(MOD, 'getEndpoints', `Missing EP2 (Point "${pointMap.EP2}")`, { refno });
  }
  if (pointMap.CP) {
    result.cp = pts[pointMap.CP] ?? null;
    if (!result.cp) warn(MOD, 'getEndpoints', `Missing CP (Point "${pointMap.CP}")`, { refno });
  }
  if (pointMap.BP) {
    result.bp = pts[pointMap.BP] ?? null;
    if (!result.bp) warn(MOD, 'getEndpoints', `Missing BP (Point "${pointMap.BP}")`, { refno });
  }
  if (pointMap.COORDS) {
    result.ep1 = pts[pointMap.COORDS] ?? null;
    if (!result.ep1) warn(MOD, 'getEndpoints', `Missing COORDS (Point "${pointMap.COORDS}")`, { refno });
  }

  return result;
};
