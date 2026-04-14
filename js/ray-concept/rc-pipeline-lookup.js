/**
 * rc-pipeline-lookup.js — Populate pipelineRef, lineNoKey, pipingClass and rating
 * by matching component coordinates against Line Dump from E3D.
 *
 * Matching strategy:
 *   SUPPORT  — supportCoor tested against every Line Dump point (±25mm sphere)
 *   All else — every Line Dump point tested against EP1→EP2 segment (±25mm perp-distance)
 *              catches any sample point along the pipe run, not just endpoints.
 *
 * On match: pipelineRef ← row['PIPE'], lineNoKey ← row['Line No. (Derived)']
 * Then:     pipingClass ← Nth token of pipelineRef (config: smartData.pipingClassLogic)
 *           rating      ← prefix-map lookup on pipingClass  (config: ratingPrefixMap)
 *
 * Returns: { updated, noLineDump, detail[] }
 *   detail[i]: { refNo, type, bore, matched, matchPoint, t, pipelineRef, lineNoKey, pipingClass, rating }
 */

import { dataManager } from '../services/data-manager.js';

const TOLERANCE = 25;

// ── Geometry helpers ──────────────────────────────────────────────────────────

function _dist3D(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * True if point P is within `tol` mm of the segment EP1→EP2 (perpendicular distance).
 * Also returns t (projection parameter, 0=EP1, 1=EP2) via side-channel object.
 */
function _pointOnSegment(P, ep1, ep2, tol, out) {
  const dx = ep2.x - ep1.x, dy = ep2.y - ep1.y, dz = ep2.z - ep1.z;
  const lenSq = dx * dx + dy * dy + dz * dz;
  if (lenSq < 1e-6) {
    if (out) out.t = 0;
    return _dist3D(P, ep1) <= tol;
  }
  const wx = P.x - ep1.x, wy = P.y - ep1.y, wz = P.z - ep1.z;
  const t  = Math.max(0, Math.min(1, (wx * dx + wy * dy + wz * dz) / lenSq));
  if (out) out.t = t;
  const cx = ep1.x + t * dx, cy = ep1.y + t * dy, cz = ep1.z + t * dz;
  return Math.sqrt((P.x - cx) ** 2 + (P.y - cy) ** 2 + (P.z - cz) ** 2) <= tol;
}

// Common column name variants per axis (tried in order after hMap lookup fails)
const EAST_ALIASES  = ['East', 'E', 'EAST', 'east', 'X', 'x'];
const NORTH_ALIASES = ['North', 'N', 'NORTH', 'north', 'Y', 'y'];
const UP_ALIASES    = ['Up', 'U', 'UP', 'up', 'Elevation', 'ELEV', 'Z', 'z'];

// Column names that may hold a packed position string, e.g. "E 150000mm N 152500mm U 1336.5mm"
const POSITION_ALIASES = ['Position', 'position', 'POSITION', 'Pos', 'pos', 'Coordinate', 'Coord'];

function _pickCol(row, primary, aliases) {
  if (primary && row[primary] != null) return row[primary];
  for (const a of aliases) if (row[a] != null) return row[a];
  return undefined;
}

function _normKey(v) {
  return String(v ?? '')
    .normalize('NFKC')
    .replace(/\u00A0/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function _resolveHeader(row, preferred, aliases = []) {
  const keys = Object.keys(row || {});
  const byNorm = new Map(keys.map(k => [_normKey(k), k]));
  const candidates = [preferred, ...aliases].filter(Boolean);
  for (const c of candidates) {
    if (row[c] != null) return c;
    const found = byNorm.get(_normKey(c));
    if (found) return found;
  }
  return null;
}

/**
 * Try to parse a packed position string like "E 150000mm N 152500mm U 1336.5mm"
 * or "E=150000 N=152500 U=1336.5".  Returns {x,y,z} or null.
 */
function _parsePositionString(str) {
  if (!str) return null;
  const s = String(str);
  const ex = s.match(/\bE\s*=?\s*([-\d.]+)/i);
  const nx = s.match(/\bN\s*=?\s*([-\d.]+)/i);
  const ux = s.match(/\bU\s*=?\s*([-\d.]+)/i);
  if (!ex || !nx || !ux) return null;
  const x = parseFloat(ex[1]), y = parseFloat(nx[1]), z = parseFloat(ux[1]);
  return (isNaN(x) || isNaN(y) || isNaN(z)) ? null : { x, y, z };
}

/**
 * Extract {x,y,z} from a Line Dump row.
 * First tries individual axis columns (hMap + aliases).
 * Falls back to parsing a packed "Position" column if individual columns are absent.
 * elevOffset is added to the Up (z) axis to align E3D's local datum with component coordinates.
 * Returns null if any coord is NaN.
 */
function _rowPoint(row, hMap, elevOffset = 0) {
  const xRaw = _pickCol(row, hMap.x, EAST_ALIASES);
  const yRaw = _pickCol(row, hMap.y, NORTH_ALIASES);
  const zRaw = _pickCol(row, hMap.z, UP_ALIASES);

  if (xRaw != null && yRaw != null && zRaw != null) {
    const x = parseFloat(xRaw), y = parseFloat(yRaw), z = parseFloat(zRaw) + elevOffset;
    return (isNaN(x) || isNaN(y) || isNaN(z)) ? null : { x, y, z };
  }

  // Fallback: packed "Position" column
  const posRaw = _pickCol(row, hMap.position, POSITION_ALIASES);
  const pt = _parsePositionString(posRaw);
  if (pt) return { x: pt.x, y: pt.y, z: pt.z + elevOffset };

  return null;
}

// ── Attribute derivation ──────────────────────────────────────────────────────

function _derivePipingClass(pipelineRef, cfg) {
  if (!pipelineRef) return null;
  const pc    = cfg?.smartData?.pipingClassLogic || {};
  const delim = pc.tokenDelimiter || '-';
  const idx   = typeof pc.tokenIndex === 'number' ? pc.tokenIndex : 4; // 0-based, default 5th
  const token = String(pipelineRef).split(delim)[idx]?.trim();
  return token || null;
}


function _deriveRating(pipingClass, cfg) {
  if (!pipingClass) return null;
  const map2 = cfg?.ratingPrefixMap?.twoChar || { '10': 10000, '20': 20000, '15': 1500, '25': 2500 };
  const map1 = cfg?.ratingPrefixMap?.oneChar  || { '1': 150, '3': 300, '6': 600, '9': 900, '5': 5000 };
  const s = String(pipingClass).trim();
  return map2[s.slice(0, 2)] ?? map1[s.slice(0, 1)] ?? null;
}

function _deriveLineNoFromPipe(pipeStr) {
  if (!pipeStr) return '';
  let cfg = {};
  try { cfg = JSON.parse(globalThis?.localStorage?.getItem?.('lineDumpConfig') || '{}'); } catch {}
  const pos1 = parseInt(cfg.segmentPos || '3', 10);
  const pos2 = cfg.segmentPos2 ? parseInt(cfg.segmentPos2, 10) : null;
  const parts = String(pipeStr).replace(/[\u201C\u201D\u2033\u02BA\u2036\u2018\u2019]/g, '"').split(/[-/\\"]+/).filter(p => p.trim() !== '');
  const pick = (pos) => parts.length >= pos ? parts[pos - 1].trim().toUpperCase() : (parts.find(p => p.length >= 4 && /[A-Z0-9]/i.test(p))?.trim().toUpperCase() || '');
  const part1 = pick(pos1);
  if (pos2 && pos2 > 0) { const part2 = pick(pos2); return part2 ? `${part1}-${part2}` : part1; }
  return part1;
}

// ── Formatter helpers ─────────────────────────────────────────────────────────

function _fmtPt(pt) {
  if (!pt) return '—';
  return `E=${pt.x.toFixed(2)}  N=${pt.y.toFixed(2)}  U=${pt.z.toFixed(2)}`;
}

function _fmtT(t) {
  if (t == null) return '';
  const pct = Math.round(t * 100);
  const label = pct <= 10 ? ' (near EP1)' : pct >= 90 ? ' (near EP2)' : ` (${pct}% along)`;
  return `t=${t.toFixed(3)}${label}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Match every component against Line Dump rows and populate
 * pipelineRef, lineNoKey, pipingClass, rating in-place.
 *
 * @param {Array}  components  Array of component objects (mutated in-place)
 * @param {Object} cfg         getConfig() result
 * @returns {{ updated: number, noLineDump: boolean, detail: Array }}
 */
export function lookupPipelineRefs(components, cfg) {
  const lineDump = dataManager.getLineDump();
  if (!lineDump || lineDump.length === 0) return { updated: 0, noLineDump: true, detail: [] };

  const hMap      = dataManager.headerMap.linedump;
  // Try configured header map key first, then common E3D column name variants
  const LINE_NO_ALIASES = [
    'Line Number (Derived)', 'Line No. (Derived)', 'Line No (Derived)',
    'Line Number', 'Line No', 'LineNo', 'LINE_NO', 'LineNumber'
  ];
  const lineNoCol = _resolveHeader(lineDump[0] || {}, hMap.lineNo, [
    ...LINE_NO_ALIASES,
    'LINE NO.(DERIVED)',
    'LINE NO (DERIVED)'
  ]) || 'Line Number (Derived)';

  // Auto-detect which column carries the pipeline/pipe name
  const PIPE_COL_CANDIDATES = ['PIPE', 'Pipeline', 'PipeRef', 'Pipe Ref', 'pipe_ref', 'pipeline'];
  const sampleRow = lineDump[0] || {};
  const pipeCol   = _resolveHeader(sampleRow, null, PIPE_COL_CANDIDATES);
  const lineNoCandidateCols = Object.keys(sampleRow).filter((k) => {
    const n = _normKey(k);
    return n.includes('line') && n.includes('no') && k !== pipeCol;
  });

  // Elevation offset: added to Line Dump "Up" coord before matching
  const elevOffset = parseFloat(cfg?.smartData?.e3dElevationOffset ?? 0) || 0;

  // ── Preflight: verify coordinate columns can be resolved ───────────────────
  // Try to parse coordinates from the first Line Dump row.
  // If all three axes return NaN, surface a clear diagnostic.
  const allCols = Object.keys(sampleRow);
  const resolvedX = EAST_ALIASES.find(a => sampleRow[a] != null) || (hMap.x && sampleRow[hMap.x] != null ? hMap.x : null);
  const resolvedY = NORTH_ALIASES.find(a => sampleRow[a] != null) || (hMap.y && sampleRow[hMap.y] != null ? hMap.y : null);
  const resolvedZ = UP_ALIASES.find(a => sampleRow[a] != null)    || (hMap.z && sampleRow[hMap.z] != null ? hMap.z : null);
  const hasIndividualAxes = resolvedX && resolvedY && resolvedZ;

  // Fallback: packed Position column
  const resolvedPos = !hasIndividualAxes &&
    (POSITION_ALIASES.find(a => sampleRow[a] != null) || (hMap.position && sampleRow[hMap.position] != null ? hMap.position : null));
  const posTestOk = resolvedPos && _parsePositionString(sampleRow[resolvedPos]) !== null;

  const coordsOk = hasIndividualAxes || posTestOk;
  if (!coordsOk) {
    return {
      updated: 0, noLineDump: false, detail: [],
      coordError: true,
      hint: `Cannot resolve coordinate columns in Line Dump. ` +
            `Available columns: [${allCols.slice(0, 15).join(', ')}${allCols.length > 15 ? '…' : ''}]. ` +
            `Tried East aliases: [${EAST_ALIASES.join(', ')}] — ` +
            `North aliases: [${NORTH_ALIASES.join(', ')}] — ` +
            `Up aliases: [${UP_ALIASES.join(', ')}] — ` +
            `Position aliases: [${POSITION_ALIASES.join(', ')}] (parsed format: "E 12345mm N 67890mm U 111mm"). ` +
            `Configure the correct column names in Master Data → Header Map (linedump).`
    };
  }

  let updated = 0;
  const detail = [];

  for (const comp of components) {
    const entry = {
      refNo:       comp.refNo  || comp.type || '?',
      type:        comp.type   || '?',
      bore:        comp.bore   ?? null,
      matched:     false,
      matchPoint:  null,
      t:           null,   // projection parameter for segment match
      pipelineRef: null,
      lineNoKey:   null,
      pipingClass: null,
      rating:      null
    };

    let match      = null;
    let matchPoint = null;

    if (comp.type === 'SUPPORT') {
      // SUPPORT: sphere proximity check against supportCoor
      if (comp.supportCoor) {
        for (const row of lineDump) {
          const P = _rowPoint(row, hMap, elevOffset);
          if (P && _dist3D(P, comp.supportCoor) <= TOLERANCE) {
            match = row;
            matchPoint = P;
            entry.t = null; // point match, no t
            break;
          }
        }
      }
    } else {
      // All other types: segment-based match (EP1→EP2)
      const ep1 = comp.ep1;
      const ep2 = comp.ep2 || ep1;
      if (ep1) {
        const out = {};
        for (const row of lineDump) {
          const P = _rowPoint(row, hMap, elevOffset);
          if (P && _pointOnSegment(P, ep1, ep2, TOLERANCE, out)) {
            match = row;
            matchPoint = P;
            entry.t = out.t;
            break;
          }
        }
      }
    }

    entry.matchPoint = matchPoint;

    if (!match) {
      detail.push(entry);
      continue;
    }

    let changed = false;
    entry.matched = true;

    // ── PIPELINE-REFERENCE ───────────────────────────────────────────
    if (pipeCol) {
      const val = match[pipeCol];
      if (val != null && String(val).trim() !== '') {
        comp.pipelineRef = String(val).trim();
        entry.pipelineRef = comp.pipelineRef;
        changed = true;
      }
    }

    // ── LINENO KEY ───────────────────────────────────────────────────
    let lineNo = match[lineNoCol];
    let lineNoText = lineNo != null ? String(lineNo).trim() : '';
    if (lineNoText && entry.pipelineRef && lineNoText === entry.pipelineRef) {
      const altCol = lineNoCandidateCols.find((col) => {
        const v = match[col];
        if (v == null) return false;
        const t = String(v).trim();
        return t !== '' && t !== entry.pipelineRef;
      });
      if (altCol) {
        lineNoText = String(match[altCol]).trim();
      } else {
        // Strict anti-collision: if lineNo resolves to pipelineRef and no alternate
        // line-like column exists, keep lineNoKey blank instead of propagating wrong data.
        lineNoText = '';
      }
    }
    if (lineNoText !== '') {
      comp.lineNoKey = lineNoText;
      entry.lineNoKey = comp.lineNoKey;
      changed = true;
    }
    if (lineNoText === '') {
      const fallbackLineNo = _deriveLineNoFromPipe(match[pipeCol]);
      if (fallbackLineNo) {
        lineNoText = fallbackLineNo;
        comp.lineNoKey = fallbackLineNo;
        entry.lineNoKey = fallbackLineNo;
        changed = true;
      }
    }
    if (!lineNoText && entry.pipelineRef && String(comp.lineNoKey || '').trim() === entry.pipelineRef) {
      // Prevent stale wrong value from previous stage/import.
      comp.lineNoKey = '';
      entry.lineNoKey = '';
    }

    // ── PIPING CLASS (from pipelineRef segment) ──────────────────────
    if (comp.pipelineRef) {
      const pc = _derivePipingClass(comp.pipelineRef, cfg);
      if (pc) {
        comp.pipingClass = pc;
        entry.pipingClass = pc;
        changed = true;

        // ── RATING (from piping class prefix) ─────────────────────
        const rating = _deriveRating(pc, cfg);
        if (rating != null) {
          comp.rating = rating;
          entry.rating = rating;
          changed = true;
        }
      }
    }

    if (changed) updated++;
    detail.push(entry);
  }

  return { updated, noLineDump: false, detail };
}

// ── Log formatter (used by rc-tab.js to render detail entries) ────────────────

/**
 * Format a detail entry as a structured object for _mastersLog().
 * Returns { type: 'match'|'skip', label, details }
 */
export function formatDetailForLog(entry) {
  const label = `${entry.refNo} [${entry.type} ${entry.bore != null ? entry.bore + 'nb' : '—'}]`;
  if (entry.matched) {
    const d = {
      pipelineRef: entry.pipelineRef || '—',
      lineNoKey:   entry.lineNoKey   || '—',
      pipingClass: entry.pipingClass || '—',
      rating:      entry.rating      != null ? String(entry.rating) : '—',
      matchRule:   entry.type === 'SUPPORT' ? 'support sphere' : 'segment projection',
      toleranceMm: TOLERANCE
    };
    if (entry.t != null)        d.matchAt    = _fmtT(entry.t);
    if (entry.matchPoint)       d.matchPoint = _fmtPt(entry.matchPoint);
    return { type: 'match', label, details: d };
  } else {
    let hint = '—';
    if (entry.type === 'SUPPORT') {
      hint = `No Line Dump point within 25mm of supportCoor`;
    } else {
      hint = `No Line Dump point on segment EP1→EP2`;
    }
    return { type: 'skip', label, details: { reason: hint, matchRule: entry.type === 'SUPPORT' ? 'support sphere' : 'segment projection', toleranceMm: TOLERANCE } };
  }
}
