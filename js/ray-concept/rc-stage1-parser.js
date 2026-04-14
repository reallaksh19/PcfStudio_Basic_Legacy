/**
 * rc-stage1-parser.js — Stage 1: Raw CSV (point-per-row) → 2D CSV (one row per component)
 * Input:  raw CSV text (export sys-1.csv format)
 * Output: { rows: [...], csvText: string }
 * 100% independent — only imports from rc-config.js
 */

import {
  getRayConfig, parseUnit, fmtNum, computeLenAxis, vecMag, vecSub,
  lookupTeeBreln, lookupOletBrlen
} from './rc-config.js';

// ── CSV parser (zero external libs) ─────────────────────────────────────────

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = splitCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = (cells[idx] ?? '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

// ── Column name resolver ─────────────────────────────────────────────────────

const COL = {
  sequence:       ['Sequence', 'Seq', 'SEQ'],
  nodeNo:         ['NodeNo', 'Node No', 'NODENO'],
  nodeName:       ['NodeName', 'Node Name', 'NODENAME'],
  compName:       ['componentName', 'Component Name', 'CompName'],
  description:    ['Description', 'Type Description', 'TypeDesc', 'ITEM-DESCRIPTION'],
  type:           ['Type'],
  refNo:          ['RefNo', 'Ref No', 'REFNO'],
  point:          ['Point'],
  ppoint:         ['PPoint'],
  bore:           ['Bore', 'BORE'],
  od:             ['O/D', 'OD'],
  radius:         ['Radius', 'RADIUS'],
  material:       ['Material', 'MATERIAL'],
  rigid:          ['Rigid', 'RIGID'],
  east:           ['East', 'EAST'],
  north:          ['North', 'NORTH'],
  up:             ['Up', 'UP'],
  // Support mapping columns
  restraintType:  ['Restraint Type', 'RestraintType', 'Restraint_Type'],
  restrFriction:  ['Restraint Friction', 'RestraintFriction', 'Friction'],
  restrGap:       ['Restraint Gap', 'RestraintGap', 'Gap'],
  // Component attributes CA1–CA10
  ca1:  ['CA1', 'CA 1', 'Attr1', 'Attribute1'],
  ca2:  ['CA2', 'CA 2', 'Attr2', 'Attribute2'],
  ca3:  ['CA3', 'CA 3', 'Attr3', 'Attribute3'],
  ca4:  ['CA4', 'CA 4', 'Attr4', 'Attribute4'],
  ca5:  ['CA5', 'CA 5', 'Attr5', 'Attribute5'],
  ca6:  ['CA6', 'CA 6', 'Attr6', 'Attribute6'],
  ca7:  ['CA7', 'CA 7', 'Attr7', 'Attribute7'],
  ca8:  ['CA8', 'CA 8', 'Attr8', 'Attribute8'],
  ca9:  ['CA9', 'CA 9', 'Attr9', 'Attribute9'],
  ca10: ['CA10', 'CA 10', 'Attr10', 'Attribute10'],
  // Piping metadata
  pipingClass: ['PipingClass', 'Piping Class', 'Piping_Class', 'PIPING_CLASS', 'Spec', 'SPEC'],
  rating:      ['Rating', 'RATING', 'PressureRating', 'Pressure Rating', 'Pressure_Rating'],
  lineNoKey:   ['LineNo_key', 'LineNoKey', 'Line No Key', 'LINENO_KEY', 'LineKey', 'Line No', 'LineNo']
};

// ── Support name mapping ──────────────────────────────────────────────────────
// Derives PCF <SUPPORT_NAME> from Friction + Gap using cfg.supportMapping blocks.
// Block evaluation order: Block 1 (Anchor) → Block 2 (Guide) → Block 3 (Restraint) → Fallback.
function deriveSupportName(friction, gap, cfg) {
  const sm  = cfg.supportMapping;
  // Normalise: treat 'NULL' and blank as empty string
  const fr  = String(friction ?? '').trim();
  const frN = fr.toUpperCase() === 'NULL' ? '' : fr;
  const gp  = String(gap ?? '').trim();
  const gpN = gp.toUpperCase() === 'NULL' ? '' : gp;
  const gpNum = parseFloat(gpN);

  for (const block of sm.blocks) {
    if (!block.frictionMatch.includes(frN)) continue;
    if      (block.gapCondition === 'empty') { if (gpN === '') return block.name; }
    else if (block.gapCondition === 'any')   { return block.name; }
    else if (block.gapCondition === '>0')    { if (!isNaN(gpNum) && gpNum > 0) return block.name; }
  }
  return sm.fallbackName;
}

function resolveCol(row, aliases) {
  for (const a of aliases) if (a in row) return row[a];
  return '';
}

// ── Coordinate parser ────────────────────────────────────────────────────────

function parseCoord(row, cfg) {
  return {
    x: parseUnit(resolveCol(row, COL.east),  cfg),
    y: parseUnit(resolveCol(row, COL.north), cfg),
    z: parseUnit(resolveCol(row, COL.up),    cfg)
  };
}

// ── Strip = prefix from RefNo ────────────────────────────────────────────────

function cleanRefNo(raw) {
  return raw ? raw.replace(/^=/, '').trim() : '';
}

// ── PIPELINE-REFERENCE is explicit only ───────────────────────────────────────

function derivePipelineRef() {
  return '';
}

// ── Compute BRLEN from BP and CP ─────────────────────────────────────────────

function computeBrlen(bp, cp) {
  if (!bp || !cp) return 0;
  const d = vecSub(bp, cp);
  return vecMag(d);
}

const SKEW_GUARD_DEFAULTS = {
  maxDiagonalGap: 2000,
  maxPipeRun: 30000,
  singleAxisSlopeTolerance: 0.01
};

function getSkewGuard(validationCfg) {
  const common = validationCfg?.coordinateSettings?.common3DLogic || {};
  return {
    maxDiagonalGap: Number(common.maxDiagonalGap ?? SKEW_GUARD_DEFAULTS.maxDiagonalGap),
    maxPipeRun: Number(common.maxPipeRun ?? SKEW_GUARD_DEFAULTS.maxPipeRun),
    slopeTol: Number(validationCfg?.coordinateSettings?.singleAxisSlopeTolerance ?? SKEW_GUARD_DEFAULTS.singleAxisSlopeTolerance)
  };
}

function analyzeSkew(ep1, ep2, validationCfg) {
  if (!ep1 || !ep2) return null;

  const guard = getSkewGuard(validationCfg);
  const dx = Math.abs(ep2.x - ep1.x);
  const dy = Math.abs(ep2.y - ep1.y);
  const dz = Math.abs(ep2.z - ep1.z);
  const len = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
  const primMag = Math.max(dx, dy, dz);

  const effDx = (primMag > 0 && dx / primMag > guard.slopeTol) ? dx : 0;
  const effDy = (primMag > 0 && dy / primMag > guard.slopeTol) ? dy : 0;
  const effDz = (primMag > 0 && dz / primMag > guard.slopeTol) ? dz : 0;
  const effAxes = [effDx, effDy, effDz].filter(v => v > 0).length;

  const largeSkew = effAxes > 1 && (len > guard.maxDiagonalGap || len > guard.maxPipeRun);
  return {
    len,
    effAxes,
    largeSkew,
    maxDiagonalGap: guard.maxDiagonalGap,
    maxPipeRun: guard.maxPipeRun
  };
}

// ── Map canonical type → SKEY ────────────────────────────────────────────────

function resolveSkey(type, cfg) {
  return cfg.skeyMap[type] ?? '';
}

// ── 2D CSV header ─────────────────────────────────────────────────────────────

const CSV2D_HEADERS = [
  'CSV SEQ NO', 'Type', 'REF NO.', 'BORE', 'BRANCH BORE',
  'EP1 X', 'EP1 Y', 'EP1 Z',
  'EP2 X', 'EP2 Y', 'EP2 Z',
  'CP X', 'CP Y', 'CP Z',
  'BP X', 'BP Y', 'BP Z',
  'SUPPORT COOR X', 'SUPPORT COOR Y', 'SUPPORT COOR Z',
  'SUPPORT NAME', 'SUPPORT GUID',
  'SKEY',
  'LEN 1', 'AXIS 1', 'LEN 2', 'AXIS 2', 'LEN 3', 'AXIS 3',
  'BRLEN', 'PIPELINE-REFERENCE', 'CA97 (Ref No.)', 'CA98 (Seq No.)',
  'CA1 (Des Pr.)', 'CA2 (Des Temp.)', 'CA3 (Material)', 'CA4 (Wall Thk.)',
  'CA5 (Ins Thk.)', 'CA6 (Ins Den.)', 'CA7 (Corr. Allow.)', 'CA8 (Comp Wt.)',
  'CA9 (Fluid Den.)', 'CA10 (Hydro Pr.)',
  'PIPING CLASS', 'RATING', 'LINENO KEY'
];

// ── Main Stage 1 function ────────────────────────────────────────────────────

/**
 * Parse raw CSV text → 2D component array + 2D CSV text.
 * @param {string} rawCsvText
 * @param {function} logFn  — debug log callback (stageId, event, refNo, data)
 * @returns {{ components: object[], csvText: string }}
 */
export function runStage1(rawCsvText, logFn = () => {}, validationCfg = null) {
  const cfg = getRayConfig();
  const { rows: rawRows } = parseCSV(rawCsvText);

  // ── Group raw rows by RefNo ─────────────────────────────────────────────
  const groups = new Map();
  const groupOrder = [];

  for (const row of rawRows) {
    const rawRef = resolveCol(row, COL.refNo);
    const key    = rawRef || `__NOREF_${resolveCol(row, COL.sequence)}`;

    if (!groups.has(key)) {
      groups.set(key, { rawRef, rows: [] });
      groupOrder.push(key);
    }
    groups.get(key).rows.push(row);
  }

  const components = [];

  for (const key of groupOrder) {
    const { rawRef, rows } = groups.get(key);
    const refNo       = cleanRefNo(rawRef);
    const firstRow    = rows[0];
    const rawType     = resolveCol(firstRow, COL.type).toUpperCase();
    const canonType   = cfg.typeMap[rawType] ?? rawType;
    const skey        = resolveSkey(canonType, cfg);
    const pipelineRef = derivePipelineRef();

    logFn('S1', 'row-grouped', refNo, { rawType, rowCount: rows.length });

    // ── Resolve points by Point column value ────────────────────────────
    const byPoint = {};
    for (const r of rows) {
      const pt = resolveCol(r, COL.point);
      byPoint[pt] = r;
    }

    // ── Parse bore from P=1 row (or first available) ──────────────────
    const boreRow    = byPoint['1'] ?? byPoint['0'] ?? firstRow;
    const bore       = parseUnit(resolveCol(boreRow, COL.bore), cfg);
    const od         = parseFloat(resolveCol(boreRow, COL.od)) || null;
    const radVal     = parseFloat(resolveCol(boreRow, COL.radius)) || 0;

    // ── Parse geometry by role ────────────────────────────────────────
    const ep1  = byPoint['1'] ? parseCoord(byPoint['1'], cfg) : null;
    const ep2  = byPoint['2'] ? parseCoord(byPoint['2'], cfg) : null;
    const cp   = byPoint['0'] ? parseCoord(byPoint['0'], cfg) : null;
    const bp   = byPoint['3'] ? parseCoord(byPoint['3'], cfg) : null;

    // Branch bore from P=3 row
    const branchBore = byPoint['3']
      ? parseUnit(resolveCol(byPoint['3'], COL.bore), cfg)
      : null;

    // ── NodeName → SUPPORT GUID + name mapping ───────────────────────
    const nodeNameRow      = byPoint['0'] ?? firstRow;
    const nodeName         = resolveCol(nodeNameRow, COL.nodeName) || '';
    const supportGuid      = nodeName ? `UCI:${nodeName}` : '';
    const restraintType    = resolveCol(nodeNameRow, COL.restraintType) || '';
    const restrFriction    = resolveCol(nodeNameRow, COL.restrFriction) || '';
    const restrGap         = resolveCol(nodeNameRow, COL.restrGap) || '';
    const derivedSupName   = canonType === 'SUPPORT'
      ? deriveSupportName(restrFriction, restrGap, cfg)
      : '';

    // ── Rigid → START/END ────────────────────────────────────────────
    const rigidP1 = resolveCol(byPoint['1'] ?? firstRow, COL.rigid);
    const rigidP2 = resolveCol(byPoint['2'] ?? firstRow, COL.rigid);

    // ── LEN / AXIS from EP1→EP2 ──────────────────────────────────────
    const lenAxis = (ep1 && ep2) ? computeLenAxis(ep1, ep2, cfg) : {};

    // ── BRLEN ─────────────────────────────────────────────────────────
    let brlen = '';
    if (canonType === 'TEE' && cp && bp) {
      const brl = lookupTeeBreln(bore, branchBore ?? bore, cfg);
      brlen = brl != null ? fmtNum(brl, cfg) : fmtNum(computeBrlen(bp, cp), cfg);
    } else if (canonType === 'OLET' && cp && bp) {
      const brl = lookupOletBrlen(bore, branchBore ?? 50, cfg);
      brlen = brl != null ? fmtNum(brl, cfg) : fmtNum(computeBrlen(bp, cp), cfg);
    }

    // ── CA97, CA98 ───────────────────────────────────────────────────
    const ca97 = (canonType !== 'PIPE' && canonType !== 'SUPPORT' && refNo)
      ? `=${refNo}` : '';

    // ── Build component object ────────────────────────────────────────
    // SUPPORT coord: ANCI rows may have any Point value (0,1,2, or blank).
    // Try all byPoint buckets in priority order, then fall back to firstRow.
    let supportCoord = null;
    if (canonType === 'SUPPORT') {
      const supportRow = byPoint['0'] ?? byPoint['1'] ?? byPoint['2']
        ?? Object.values(byPoint)[0] ?? firstRow;
      if (supportRow) {
        const raw = parseCoord(supportRow, cfg);
        // Accept only if coordinates are valid numbers (not NaN)
        if (!isNaN(raw.x) && !isNaN(raw.y) && !isNaN(raw.z)) {
          supportCoord = raw;
        }
      }
    }

    const comp = {
      seqNo:        components.length + 1,
      type:         canonType,
      refNo:        canonType !== 'PIPE' ? refNo : '',
      bore,
      branchBore:   branchBore ?? '',
      ep1, ep2, cp, bp,
      supportCoor:  supportCoord,
      supportName:  canonType === 'SUPPORT' ? (derivedSupName || cfg.supportMapping.fallbackName) : '',
      supportGuid,
      skey,
      lenAxis,
      brlen,
      pipelineRef,
      ca97,
      compName: resolveCol(firstRow, COL.compName),
      description: resolveCol(firstRow, COL.description),
      // Component attributes CA1–CA10
      ca1:  resolveCol(firstRow, COL.ca1),
      ca2:  resolveCol(firstRow, COL.ca2),
      ca3:  resolveCol(firstRow, COL.ca3),
      ca4:  resolveCol(firstRow, COL.ca4),
      ca5:  resolveCol(firstRow, COL.ca5),
      ca6:  resolveCol(firstRow, COL.ca6),
      ca7:  resolveCol(firstRow, COL.ca7),
      ca8:  resolveCol(firstRow, COL.ca8),
      ca9:  resolveCol(firstRow, COL.ca9),
      ca10: resolveCol(firstRow, COL.ca10),
      // Piping metadata
      pipingClass: resolveCol(firstRow, COL.pipingClass),
      rating:      resolveCol(firstRow, COL.rating),
      lineNoKey:   resolveCol(firstRow, COL.lineNoKey),
      // raw metadata
      od, radius: radVal, rigidP1, rigidP2, rawType, rawRef
    };

    const skew = canonType === 'PIPE' ? analyzeSkew(ep1, ep2, validationCfg) : null;
    if (skew?.largeSkew) {
      logFn('S1', 'excluded', refNo, {
        reason: `3D skew ${fmtNum(skew.len, cfg)}mm > ${fmtNum(Math.min(skew.maxDiagonalGap, skew.maxPipeRun), cfg)}mm`,
        effAxes: skew.effAxes,
        maxDiagonalGap: skew.maxDiagonalGap,
        maxPipeRun: skew.maxPipeRun
      });
      continue;
    }

    components.push(comp);
    logFn('S1', 'component-built', refNo, { canonType, bore, ep1, ep2, cp, bp });
  }

  // ── Re-number seqNo ─────────────────────────────────────────────────────
  components.forEach((c, i) => { c.seqNo = i + 1; });

  // ── Emit 2D CSV text ─────────────────────────────────────────────────────
  const csvText = emit2DCSV(components, cfg);

  return { components, csvText };
}

// ── CSV emitter ──────────────────────────────────────────────────────────────

function fmtCell(v, cfg) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return fmtNum(v, cfg);
  return String(v);
}

function coordCell(pt, axis, cfg) {
  if (!pt) return '';
  const val = pt[axis];
  return isNaN(val) ? '' : fmtNum(val, cfg);
}

export function emit2DCSV(components, cfg) {
  const lines = [CSV2D_HEADERS.join(',')];

  for (const c of components) {
    const la = c.lenAxis || {};
    const cells = [
      c.seqNo,
      c.type,
      c.refNo,
      isNaN(c.bore) ? '' : fmtNum(c.bore, cfg),
      (c.branchBore !== '' && !isNaN(c.branchBore)) ? fmtNum(Number(c.branchBore), cfg) : '',
      coordCell(c.ep1, 'x', cfg),
      coordCell(c.ep1, 'y', cfg),
      coordCell(c.ep1, 'z', cfg),
      coordCell(c.ep2, 'x', cfg),
      coordCell(c.ep2, 'y', cfg),
      coordCell(c.ep2, 'z', cfg),
      coordCell(c.cp,  'x', cfg),
      coordCell(c.cp,  'y', cfg),
      coordCell(c.cp,  'z', cfg),
      coordCell(c.bp,  'x', cfg),
      coordCell(c.bp,  'y', cfg),
      coordCell(c.bp,  'z', cfg),
      coordCell(c.supportCoor, 'x', cfg),
      coordCell(c.supportCoor, 'y', cfg),
      coordCell(c.supportCoor, 'z', cfg),
      c.supportName,
      c.supportGuid,
      c.skey,
      la.len1  ?? '', la.axis1 ?? '',
      la.len2  ?? '', la.axis2 ?? '',
      la.len3  ?? '', la.axis3 ?? '',
      c.brlen ?? '',
      c.pipelineRef,
      c.ca97,
      c.seqNo,
      c.ca1  ?? '', c.ca2  ?? '', c.ca3  ?? '', c.ca4  ?? '', c.ca5  ?? '',
      c.ca6  ?? '', c.ca7  ?? '', c.ca8  ?? '', c.ca9  ?? '', c.ca10 ?? '',
      (c.pipingClass || (c.type !== 'SUPPORT' ? (cfg?.defaultPipingClass || '') : '')) ?? '',
      c.rating ?? '', c.lineNoKey ?? ''
    ];
    lines.push(cells.join(','));
  }

  return lines.join('\n');
}
