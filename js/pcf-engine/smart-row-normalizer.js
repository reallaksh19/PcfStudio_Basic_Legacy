/**
 * smart-row-normalizer.js — Phase 4A Smart Parser foundation
 *
 * Normalizes arbitrary imported rows into a canonical PCF row shape.
 * This module does not mutate the existing Stage 1 pipeline yet; Phase 4G will
 * wire it into Common Builder / import flow.
 */

import { CANONICAL_COLUMNS, mapHeaders } from './column-alias-registry.js';

function clean(value) {
  return String(value ?? '').trim();
}

function num(value) {
  const s = clean(value).replace(/,/g, '');
  if (!s) return null;
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number.parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function first(row, keys) {
  for (const k of keys || []) {
    if (k && row?.[k] != null && clean(row[k]) !== '') return row[k];
  }
  return '';
}

function getByCanonical(row, headerMap, canonical) {
  const source = headerMap?.[canonical];
  if (source && row?.[source] != null) return row[source];
  if (row?.[canonical] != null) return row[canonical];
  return '';
}

function parseCoordTriplet(value) {
  if (value && typeof value === 'object' && ['x', 'y', 'z'].some(k => value[k] != null)) {
    const x = num(value.x), y = num(value.y), z = num(value.z);
    return [x, y, z].every(v => v != null) ? { x, y, z } : null;
  }
  const s = clean(value);
  if (!s) return null;
  const parts = s.match(/-?\d+(?:\.\d+)?/g);
  if (!parts || parts.length < 3) return null;
  const [x, y, z] = parts.slice(0, 3).map(Number.parseFloat);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

function splitCoord(row, prefix) {
  const variants = [
    [`${prefix} X`, `${prefix} Y`, `${prefix} Z`],
    [`${prefix}_X`, `${prefix}_Y`, `${prefix}_Z`],
    [`${prefix}.x`, `${prefix}.y`, `${prefix}.z`],
    [`${prefix} EAST`, `${prefix} NORTH`, `${prefix} UP`],
  ];
  for (const [kx, ky, kz] of variants) {
    const x = num(row?.[kx]);
    const y = num(row?.[ky]);
    const z = num(row?.[kz]);
    if ([x, y, z].every(v => v != null)) return { x, y, z };
  }
  return null;
}

function coordFrom(row, headerMap, canonical, splitPrefix) {
  return parseCoordTriplet(getByCanonical(row, headerMap, canonical)) || splitCoord(row, splitPrefix);
}

function caValue(row, headerMap, n) {
  return clean(getByCanonical(row, headerMap, `CA${n}`));
}

function normalizeType(value) {
  return clean(value).toUpperCase();
}

function fallbackRef(row, headerMap, rowIndex, pipelineRef) {
  const explicit = clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.REF_NO));
  if (explicit) return explicit;
  const seq = clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.CSV_SEQ_NO)) || String(rowIndex + 1);
  return pipelineRef ? `${pipelineRef}_${seq}` : seq;
}

export function normalizeSmartRow(row, options = {}) {
  const headerMap = options.headerMap || {};
  const rowIndex = Number(options.rowIndex ?? 0);
  const pipelineRef = clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.PIPELINE_REFERENCE)) || clean(options.pipelineRef);
  const refNo = fallbackRef(row, headerMap, rowIndex, pipelineRef);
  const csvSeqNo = clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.CSV_SEQ_NO)) || String(rowIndex + 1);

  const ca = {};
  for (let i = 1; i <= 10; i++) {
    const v = caValue(row, headerMap, i);
    if (v) ca[String(i)] = v;
  }

  const ca97 = clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.CA97)) || refNo;
  const ca98 = clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.CA98)) || csvSeqNo;

  const normalized = {
    rowIndex,
    rowNumber: clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.ROW)) || String(rowIndex + 1),
    csvSeqNo,
    type: normalizeType(getByCanonical(row, headerMap, CANONICAL_COLUMNS.TYPE)),
    text: clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.TEXT)),
    pipelineRef,
    refNo,
    bore: num(getByCanonical(row, headerMap, CANONICAL_COLUMNS.BORE)),
    branchBore: num(getByCanonical(row, headerMap, CANONICAL_COLUMNS.BRANCH_BORE)),
    ep1: coordFrom(row, headerMap, CANONICAL_COLUMNS.EP1_COORDS, 'EP1'),
    ep2: coordFrom(row, headerMap, CANONICAL_COLUMNS.EP2_COORDS, 'EP2'),
    cp: coordFrom(row, headerMap, CANONICAL_COLUMNS.CP_COORDS, 'CP'),
    bp: coordFrom(row, headerMap, CANONICAL_COLUMNS.BP_COORDS, 'BP'),
    skey: clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.SKEY)),
    supportCoor: coordFrom(row, headerMap, CANONICAL_COLUMNS.SUPPORT_COOR, 'SUPPORT COOR'),
    supportGuid: clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.SUPPORT_GUID)),
    supportName: clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.SUPPORT_NAME)),
    ca,
    ca97,
    ca98,
    fixingAction: clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.FIXING_ACTION)),
    len1: num(getByCanonical(row, headerMap, CANONICAL_COLUMNS.LEN1)),
    axis1: clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.AXIS1)),
    len2: num(getByCanonical(row, headerMap, CANONICAL_COLUMNS.LEN2)),
    axis2: clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.AXIS2)),
    len3: num(getByCanonical(row, headerMap, CANONICAL_COLUMNS.LEN3)),
    axis3: clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.AXIS3)),
    brlen: num(getByCanonical(row, headerMap, CANONICAL_COLUMNS.BRLEN)),
    deltaX: num(getByCanonical(row, headerMap, CANONICAL_COLUMNS.DELTA_X)),
    deltaY: num(getByCanonical(row, headerMap, CANONICAL_COLUMNS.DELTA_Y)),
    deltaZ: num(getByCanonical(row, headerMap, CANONICAL_COLUMNS.DELTA_Z)),
    diameter: num(getByCanonical(row, headerMap, CANONICAL_COLUMNS.DIAMETER)),
    wallThick: clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.WALL_THICK)),
    bendPtr: num(getByCanonical(row, headerMap, CANONICAL_COLUMNS.BEND_PTR)),
    rigidPtr: num(getByCanonical(row, headerMap, CANONICAL_COLUMNS.RIGID_PTR)),
    intPtr: num(getByCanonical(row, headerMap, CANONICAL_COLUMNS.INT_PTR)),
    raw: row,
    trace: {
      headerMap,
      fallbacks: {
        ca97: ca97 === refNo && !clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.CA97)) ? 'REF NO. fallback' : '',
        ca98: ca98 === csvSeqNo && !clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.CA98)) ? 'CSV SEQ NO fallback' : '',
        refNo: !clean(getByCanonical(row, headerMap, CANONICAL_COLUMNS.REF_NO)) ? 'SEQ/pipeline fallback' : '',
      }
    }
  };

  // Calculated column seed values that are safe at normalization time.
  if (normalized.diameter == null && normalized.bore != null) normalized.diameter = normalized.bore;
  if (!normalized.wallThick && normalized.ca['4']) normalized.wallThick = normalized.ca['4'];

  return normalized;
}

export function normalizeSmartRows(rows = [], options = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const headers = options.headers || Object.keys(safeRows[0] || {});
  const mapping = options.headerMap ? { map: options.headerMap, diagnostics: [] } : mapHeaders(headers, options);
  const out = safeRows.map((row, i) => normalizeSmartRow(row, { ...options, headerMap: mapping.map, rowIndex: i }));
  return {
    rows: out,
    headerMap: mapping.map,
    diagnostics: mapping.diagnostics,
    summary: {
      inputRows: safeRows.length,
      outputRows: out.length,
      matchedHeaders: Object.keys(mapping.map).length,
      unmatchedHeaderMessages: mapping.diagnostics.filter(d => d.severity === 'info').length,
      duplicateHeaderMessages: mapping.diagnostics.filter(d => d.severity === 'warning').length,
    }
  };
}

try {
  if (typeof window !== 'undefined') {
    window.normalizeSmartPcfRows = normalizeSmartRows;
    window.normalizeSmartPcfRow = normalizeSmartRow;
  }
} catch (_) {}
