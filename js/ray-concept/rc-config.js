/**
 * rc-config.js — RayConfig: Single source of truth for all Ray Concept variables.
 * NO hardcoded values in algorithm modules — every threshold reads from here.
 * 100% independent — zero imports from main app.
 */

import { getOletBrlen, getTeeBrlen } from '../services/fallbackcontract.js';

const _defaults = {

  // ── Stage 1: Parsing ──────────────────────────────────────────────────────
  unitSuffix:        'mm',   // suffix stripped from bore/coord strings
  decimalPrecision:  4,      // decimal places in all numeric output

  // Raw CSV point number → geometry role
  pointRoleMap: { '0': 'cp', '1': 'ep1', '2': 'ep2', '3': 'bp' },

  // Raw CSV Type code → canonical PCF type
  typeMap: {
    BRAN: 'PIPE',   ELBO: 'BEND',  FLAN: 'FLANGE',
    VALV: 'VALVE',  TEE:  'TEE',   OLET: 'OLET',
    ANCI: 'SUPPORT', ATTA: 'SUPPORT'  // ATTA = attachment point → treated as support
  },

  // Canonical type → PCF SKEY (blank = no SKEY)
  skeyMap: {
    FLANGE:               'FLWN',
    BEND:                 'BEBW',
    TEE:                  'TEBW',
    VALVE:                'VBFL',
    OLET:                 'OLWL',
    'REDUCER-CONCENTRIC': 'RCBW',
    'REDUCER-ECCENTRIC':  'REBW',
    REDU:                 'RCBW',   // Reducer → concentric butt weld
    FBLI:                 'BLFL',   // Blind Flange
    PIPE:    '',
    SUPPORT: '',
    GASK:    '',   // Gasket — typically no SKEY
    PCOM:    ''    // Pipe Component — no SKEY
  },

  // Raw CSV coordinate columns (column header name → axis)
  coordColMap: { East: 'x', North: 'y', Up: 'z' },

  // Delta sign → axis label
  axisLabelMap: {
    x: { pos: 'EAST',  neg: 'WEST'  },
    y: { pos: 'NORTH', neg: 'SOUTH' },
    z: { pos: 'UP',    neg: 'DOWN'  }
  },

  // PIPELINE-REFERENCE prefix word
  pipelineRefPrefix: '',

  // Default piping class for 2D CSV when none is resolved from data
  defaultPipingClass: '',
  enableBoreInchToMm: false,

  // ── PCF Fixer datatable mapping (Final 2D CSV field → dataTable field) ─────
  // Reference documentation for the Push to Datatable feature.
  // The actual mapper (_mapToDatatableRow in rc-tab.js) uses these mappings structurally.
  // csv: Final 2D CSV header name, dt: PCF Fixer dataTable field path
  pcfFixerMapping: [
    { csv: 'Type',             dt: 'type' },
    { csv: 'BORE',             dt: 'bore' },
    { csv: 'BRANCH BORE',      dt: 'branchBore' },
    { csv: 'EP1 X',            dt: 'ep1.x' },
    { csv: 'EP1 Y',            dt: 'ep1.y' },
    { csv: 'EP1 Z',            dt: 'ep1.z' },
    { csv: 'EP2 X',            dt: 'ep2.x' },
    { csv: 'EP2 Y',            dt: 'ep2.y' },
    { csv: 'EP2 Z',            dt: 'ep2.z' },
    { csv: 'CP X',             dt: 'cp.x' },
    { csv: 'CP Y',             dt: 'cp.y' },
    { csv: 'CP Z',             dt: 'cp.z' },
    { csv: 'BP X',             dt: 'bp.x' },
    { csv: 'BP Y',             dt: 'bp.y' },
    { csv: 'BP Z',             dt: 'bp.z' },
    { csv: 'SUPPORT COOR X',   dt: 'supportCoor.x' },
    { csv: 'SUPPORT COOR Y',   dt: 'supportCoor.y' },
    { csv: 'SUPPORT COOR Z',   dt: 'supportCoor.z' },
    { csv: 'SUPPORT NAME',     dt: 'supportName' },
    { csv: 'SUPPORT GUID',     dt: 'supportGuid' },
    { csv: 'SKEY',             dt: 'skey' },
    { csv: 'PIPELINE-REFERENCE', dt: 'pipelineRef' },
    { csv: 'CA1',              dt: 'ca[1]' },
    { csv: 'CA2',              dt: 'ca[2]' },
    { csv: 'CA3',              dt: 'ca[3]' },
    { csv: 'CA4',              dt: 'ca[4]' },
    { csv: 'CA5',              dt: 'ca[5]' },
    { csv: 'CA6',              dt: 'ca[6]' },
    { csv: 'CA7',              dt: 'ca[7]' },
    { csv: 'CA8',              dt: 'ca[8]' },
    { csv: 'CA9',              dt: 'ca[9]' },
    { csv: 'CA10',             dt: 'ca[10]' }
  ],

  // ── Stage 2: Fittings Extraction ─────────────────────────────────────────
  stubPipeLength:    1.0,      // mm — length of PIPE stub appended to SUPPORT

  // Support mapping — controls <SUPPORT_NAME> and <SUPPORT_GUID> derivation
  supportMapping: {
    guidPrefix:   'UCI:',   // mandatory GUID prefix; cannot be blank
    fallbackName: 'CA150',  // used when no block matches
    blocks: [
      // Block 1: Friction = empty/0.3  AND  Gap = empty  →  CA150 (rest)
      { id: 1, frictionMatch: ['', '0.3'], gapCondition: 'empty', name: 'CA150', desc: 'Rest / Anchor' },
      // Block 2: Friction = 0.15  (any gap)              →  CA100 (guide)
      { id: 2, frictionMatch: ['0.15'],    gapCondition: 'any',   name: 'CA100', desc: 'Guide' },
      // Block 3: Friction = 0.3   AND  Gap > 0            →  CA150 (rest with gap)
      { id: 3, frictionMatch: ['0.3'],     gapCondition: '>0',    name: 'CA150', desc: 'Rest with Gap' }
    ]
  },

  // Types to KEEP in fittings PCF (PIPE/BRAN is excluded → becomes bridge)
  // GASK and PCOM excluded from PCF but still participate in S3 coordinate connectivity
  fittingTypes: ['FLANGE', 'BEND', 'TEE', 'VALVE', 'OLET', 'SUPPORT', 'REDU', 'FBLI'],

  // ── Stage 3: Ray Engine — Pass 0 (Gap Fill) ───────────────────────────────
  gapFillTolerance:  6.0,        // mm — max gap a FLAN can stretch to fill
  gapFillTypes:     ['FLANGE'],  // types eligible for gap-fill stretching

  // ── Stage 3: Ray Engine — Pass 1 (Bridging) ──────────────────────────────
  rayMaxDistance:      1e6,    // mm — maximum ray travel distance
  boreTolMultiplier:   0.5,    // fraction of bore → perpendicular miss tolerance
  minBoreTol:          25.0,   // mm — absolute floor for perpendicular tolerance
  deadZoneMin:         0.5,    // mm — minimum t; avoids self-hit
  axisSnapAngle:       1.0,    // degrees — classify a vector as axis-aligned

  // Types treated as Dead End (Early Exit if one face already connected)
  deTypes: ['FLANGE'],

  // ── Stage 3: Ray Engine — Pass 2 (Branch) ────────────────────────────────
  branchTypes: ['TEE', 'OLET'],  // types that expose a branch point (BP)
  proximityMaxDist:  1500,   // mm — hard max distance for P2 proximity fallback
  proximityMinDot:   0.85,   // min dot product (≈32°) for P2 proximity alignment gate

  // ── Stage 3: Ray Engine — 6-axis fallback (P1 + P3) ─────────────────────
  // Two-pass helper: Pass 1 = ±X/±Y only (horizontal), tight diameter;
  // Pass 2 = all 6 axes, wider diameter (REDU gets extra-wide).
  // "Diameter" = perpendicular cylinder diameter; tolerance radius = diameter / 2.
  sixAxP1Diameter:  6,      // mm — Pass 1 cylinder diameter (radius 3 mm); ±X, ±Y only
  sixAxP1MaxDist:   20000,  // mm — Pass 1 max ray distance
  sixAxP2Diameter:  25,     // mm — Pass 2 cylinder diameter (radius 12.5 mm); all 6 axes
  sixAxP2DiamREDU:  100,    // mm — Pass 2 cylinder diameter for REDU source face (radius 50 mm)
  sixAxP2MaxDist:   20000,  // mm — Pass 2 max ray distance

  // ── Stage 3: Pass control ─────────────────────────────────────────────────
  passEnabled: { p0: true, p1: true, p2: true },

  // ── Stage 4: PCF Emitter ─────────────────────────────────────────────────
  messageSquareEnabled: true,  // emit MESSAGE-SQUARE before every component
  windowsLineEndings:   true,  // use CRLF (\r\n) for output

  // Coordinate overflow guard: if any EP/CP/BP value exceeds this (mm), offer ÷1000
  maxEpCoordValue:        999999999,

  // ISOPCF CSV: component types to drop + stretch-priority for gap bridging
  isopcfDrop:            ['GASK', 'INST', 'PCOM', 'MISC'],
  isopcfStretchPriority: ['PIPE', 'FLANGE', 'TEE', 'BEND'],

  // Fallback SUPPORT name when no coordinate probe data is available
  supportDefaultCoor:    'CA150',

  // Engine mode: 'legacy' = existing per-module emitters; 'common' = pcf-engine/ shared modules
  engineMode:            'legacy',

  // ── Lookup tables (all from PCF Syntax Master v2.0) ──────────────────────

  // ASME B36.10 nominal bore (mm) → OD (mm)
  odTable: {
    15: 21.3,  20: 26.7,  25: 33.4,  32: 42.2,  40: 48.3,
    50: 60.3,  65: 73.0,  80: 88.9,  100: 114.3, 125: 141.3,
    150: 168.3, 200: 219.1, 250: 273.1, 300: 323.9, 350: 355.6,
    400: 406.4, 450: 457.2, 500: 508.0, 600: 610.0,
    750: 762.0, 900: 914.0
  },

  // ASME B16.9 Equal Tee BRLEN (M) by bore (mm)
  equalTeeTable: {
    15: 25,  20: 29,  25: 38,  32: 48,  40: 57,  50: 64,
    65: 76,  80: 86,  100: 105, 125: 124, 150: 143,
    200: 178, 250: 216, 300: 254, 350: 279, 400: 305,
    450: 343, 500: 381, 600: 432
  },

  // ASME B16.9 Reducing Tee BRLEN — array of { h, b, m }
  // h = header bore mm, b = branch bore mm, m = BRLEN mm
  reducingTeeTable: [
    { h: 100, b: 80,  m: 102 }, { h: 100, b: 50,  m: 95  },
    { h: 150, b: 100, m: 130 }, { h: 150, b: 80,  m: 124 },
    { h: 200, b: 150, m: 168 }, { h: 200, b: 100, m: 156 },
    { h: 250, b: 200, m: 206 }, { h: 250, b: 150, m: 194 },
    { h: 300, b: 250, m: 244 }, { h: 300, b: 200, m: 232 },
    { h: 300, b: 150, m: 219 }, { h: 350, b: 250, m: 264 },
    { h: 350, b: 200, m: 254 }, { h: 400, b: 300, m: 295 },
    { h: 400, b: 250, m: 283 }, { h: 450, b: 350, m: 330 },
    { h: 450, b: 300, m: 321 }, { h: 500, b: 400, m: 368 },
    { h: 500, b: 350, m: 356 }, { h: 600, b: 500, m: 419 },
    { h: 600, b: 400, m: 406 }
  ],

  // MSS SP-97 Weldolet — array of { h, b, A, hOD }
  // BRLEN formula: A + 0.5 * hOD
  weldoletTable: [
    { h: 50,  b: 20,  A: 38.1,  hOD: 60.3  },
    { h: 50,  b: 25,  A: 38.1,  hOD: 60.3  },
    { h: 80,  b: 25,  A: 44.4,  hOD: 88.9  },
    { h: 80,  b: 40,  A: 44.4,  hOD: 88.9  },
    { h: 80,  b: 50,  A: 50.8,  hOD: 88.9  },
    { h: 100, b: 25,  A: 50.8,  hOD: 114.3 },
    { h: 100, b: 40,  A: 50.8,  hOD: 114.3 },
    { h: 100, b: 50,  A: 57.2,  hOD: 114.3 },
    { h: 100, b: 80,  A: 63.5,  hOD: 114.3 },
    { h: 150, b: 25,  A: 57.2,  hOD: 168.3 },
    { h: 150, b: 50,  A: 63.5,  hOD: 168.3 },
    { h: 150, b: 80,  A: 76.2,  hOD: 168.3 },
    { h: 150, b: 100, A: 82.6,  hOD: 168.3 },
    { h: 200, b: 50,  A: 69.8,  hOD: 219.1 },
    { h: 200, b: 80,  A: 82.6,  hOD: 219.1 },
    { h: 200, b: 100, A: 88.9,  hOD: 219.1 },
    { h: 200, b: 150, A: 101.6, hOD: 219.1 },
    { h: 250, b: 50,  A: 76.2,  hOD: 273.1 },
    { h: 250, b: 80,  A: 88.9,  hOD: 273.1 },
    { h: 250, b: 100, A: 95.2,  hOD: 273.1 },
    { h: 250, b: 150, A: 108.0, hOD: 273.1 },
    { h: 250, b: 200, A: 127.0, hOD: 273.1 },
    { h: 300, b: 50,  A: 82.6,  hOD: 323.9 },
    { h: 300, b: 80,  A: 95.2,  hOD: 323.9 },
    { h: 300, b: 100, A: 101.6, hOD: 323.9 },
    { h: 300, b: 150, A: 114.3, hOD: 323.9 },
    { h: 300, b: 200, A: 133.4, hOD: 323.9 },
    { h: 300, b: 250, A: 152.4, hOD: 323.9 }
  ]
};

// ── Live config (copy of defaults, mutated by UI) ────────────────────────────
let _live = JSON.parse(JSON.stringify(_defaults));

/**
 * Read a config value.  getRayConfig().gapFillTolerance etc.
 */
export function getRayConfig() { return _live; }

/**
 * Update one or more config keys.  setRayConfig({ gapFillTolerance: 8 })
 */
export function setRayConfig(patch) {
  Object.assign(_live, patch);
}

/**
 * Deep-reset to defaults.
 */
export function resetRayConfig() {
  _live = JSON.parse(JSON.stringify(_defaults));
}

/**
 * Helpers used by multiple stage modules.
 */

/** Strip unit suffix ('mm') and parse float.  ' 254mm' → 254 */
export function parseUnit(str, cfg) {
  if (str == null) return NaN;
  return parseFloat(String(str).trim().replace(cfg.unitSuffix, ''));
}

/** Format a number to decimalPrecision fixed decimals. */
export function fmtNum(n, cfg) {
  return Number(n).toFixed(cfg.decimalPrecision);
}

/** Delta sign → axis label. */
export function axisLabel(delta, axisKey, cfg) {
  if (Math.abs(delta) < 1e-6) return '';
  const map = cfg.axisLabelMap[axisKey];
  return delta > 0 ? map.pos : map.neg;
}

/** Compute LEN/AXIS from two points. Returns { len1,axis1, len2,axis2, len3,axis3 } */
export function computeLenAxis(ep1, ep2, cfg) {
  const dx = ep2.x - ep1.x;
  const dy = ep2.y - ep1.y;
  const dz = ep2.z - ep1.z;
  return {
    len1:  Math.abs(dx) > 1e-6 ? fmtNum(dx, cfg) : '',
    axis1: axisLabel(dx, 'x', cfg),
    len2:  Math.abs(dy) > 1e-6 ? fmtNum(dy, cfg) : '',
    axis2: axisLabel(dy, 'y', cfg),
    len3:  Math.abs(dz) > 1e-6 ? fmtNum(dz, cfg) : '',
    axis3: axisLabel(dz, 'z', cfg)
  };
}

/** Magnitude of a 3-vector. */
export function vecMag(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/** Normalize a 3-vector. Returns {x,y,z}. */
export function vecNorm(v) {
  const m = vecMag(v);
  if (m < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

/** Dot product. */
export function vecDot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

/** Subtract: a - b → {x,y,z}. */
export function vecSub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }

/** Add. */
export function vecAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }

/** Scale. */
export function vecScale(v, s) { return { x: v.x * s, y: v.y * s, z: v.z * s }; }

/** Point equality within tolerance. */
export function ptEq(a, b, tol = 1e-3) {
  return Math.abs(a.x - b.x) < tol &&
         Math.abs(a.y - b.y) < tol &&
         Math.abs(a.z - b.z) < tol;
}

/** Look up BRLEN for a TEE (equal or reducing). */
export function lookupTeeBreln(headerBore, branchBore, cfg) {
  const fromService = getTeeBrlen(headerBore, branchBore);
  if (fromService != null) return fromService;

  if (Math.abs(headerBore - branchBore) < 1e-3) {
    return cfg.equalTeeTable[headerBore] ?? null;
  }
  const row = cfg.reducingTeeTable.find(
    r => Math.abs(r.h - headerBore) < 1e-3 && Math.abs(r.b - branchBore) < 1e-3
  );
  return row ? row.m : null;
}

/** Compute BRLEN for an OLET using formula A + 0.5 * headerOD. */
export function lookupOletBrlen(headerBore, branchBore, cfg) {
  const fromService = getOletBrlen(headerBore, branchBore);
  if (fromService != null) return fromService;

  const row = cfg.weldoletTable.find(
    r => Math.abs(r.h - headerBore) < 1e-3 && Math.abs(r.b - branchBore) < 1e-3
  );
  if (!row) return null;
  return row.A + 0.5 * row.hOD;
}

/** Look up OD for a bore. */
export function lookupOD(bore, cfg) {
  return cfg.odTable[bore] ?? bore; // fallback to bore if unknown
}

/** 6 cardinal axis direction vectors. */
export function cardinalAxes() {
  return [
    { x:  1, y:  0, z:  0 },
    { x: -1, y:  0, z:  0 },
    { x:  0, y:  1, z:  0 },
    { x:  0, y: -1, z:  0 },
    { x:  0, y:  0, z:  1 },
    { x:  0, y:  0, z: -1 }
  ];
}
