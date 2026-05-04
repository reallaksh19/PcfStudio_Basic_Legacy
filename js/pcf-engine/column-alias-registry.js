/**
 * column-alias-registry.js — Phase 4A Smart Parser foundation
 *
 * Canonical column registry + fuzzy header matcher.
 *
 * This module is intentionally standalone so it can be used by:
 * - future Smart Parser import path
 * - browser diagnostics
 * - benchmark/fixture tests
 *
 * Matching order:
 *  1. exact normalized alias
 *  2. substring containment
 *  3. fuzzy ratio >= threshold
 */

export const CANONICAL_COLUMNS = Object.freeze({
  ROW: '#',
  CSV_SEQ_NO: 'CSV SEQ NO',
  TYPE: 'Type',
  TEXT: 'TEXT',
  PIPELINE_REFERENCE: 'PIPELINE-REFERENCE',
  REF_NO: 'REF NO.',
  BORE: 'BORE',
  BRANCH_BORE: 'BRANCH BORE',
  EP1_COORDS: 'EP1 COORDS',
  EP2_COORDS: 'EP2 COORDS',
  CP_COORDS: 'CP COORDS',
  BP_COORDS: 'BP COORDS',
  SKEY: 'SKEY',
  SUPPORT_COOR: 'SUPPORT COOR',
  SUPPORT_GUID: 'SUPPORT GUID',
  SUPPORT_NAME: 'SUPPORT NAME',
  CA1: 'CA1',
  CA2: 'CA2',
  CA3: 'CA3',
  CA4: 'CA4',
  CA5: 'CA5',
  CA6: 'CA6',
  CA7: 'CA7',
  CA8: 'CA8',
  CA9: 'CA9',
  CA10: 'CA10',
  CA97: 'CA97',
  CA98: 'CA98',
  FIXING_ACTION: 'Fixing Action',
  LEN1: 'LEN 1',
  AXIS1: 'AXIS 1',
  LEN2: 'LEN 2',
  AXIS2: 'AXIS 2',
  LEN3: 'LEN 3',
  AXIS3: 'AXIS 3',
  BRLEN: 'BRLEN',
  DELTA_X: 'DELTA_X',
  DELTA_Y: 'DELTA_Y',
  DELTA_Z: 'DELTA_Z',
  DIAMETER: 'DIAMETER',
  WALL_THICK: 'WALL_THICK',
  BEND_PTR: 'BEND_PTR',
  RIGID_PTR: 'RIGID_PTR',
  INT_PTR: 'INT_PTR',
});

export const DEFAULT_COLUMN_ALIASES = Object.freeze({
  '#': ['#', 'Row', 'Row No', 'RowNo', 'Row Number', 'SN', 'S.N.', 'S.No', 'S No'],
  'CSV SEQ NO': ['CSV SEQ NO', 'SEQ NO', 'Seq No', 'SL.NO', 'Sl No', 'SL NO', 'SeqNo', 'Seq', 'Sequence', 'Sequence No', 'Item No'],
  'Type': ['Type', 'Component', 'Comp Type', 'CompType', 'Component Type', 'Fitting', 'Item'],
  'TEXT': ['TEXT', 'Text', 'Description', 'Desc', 'Comment', 'MSG'],
  'PIPELINE-REFERENCE': ['PIPELINE-REFERENCE', 'Pipeline Ref', 'Pipeline Reference', 'Line No', 'Line Number', 'Line No.', 'LineNo', 'PIPE', 'Pipe Line'],
  'REF NO.': ['REF NO.', 'Ref No', 'RefNo', 'Reference No', 'Reference Number', 'Ref', 'Tag No', 'TagNo'],
  'BORE': ['BORE', 'Bore', 'NPS', 'Nominal Bore', 'NominalBore', 'Dia', 'Diameter', 'Size', 'Pipe Size', 'DN', 'NB'],
  'BRANCH BORE': ['BRANCH BORE', 'Branch Bore', 'BranchBore', 'Branch NPS', 'Branch DN', 'Branch Size', 'Bore Branch'],
  'EP1 COORDS': ['EP1 COORDS', 'EP1', 'Start Point', 'From', 'From Coord', 'Start Coord', 'EP1_X EP1_Y EP1_Z', 'EP1 X Y Z'],
  'EP2 COORDS': ['EP2 COORDS', 'EP2', 'End Point', 'To', 'To Coord', 'End Coord', 'EP2_X EP2_Y EP2_Z', 'EP2 X Y Z'],
  'CP COORDS': ['CP COORDS', 'CP', 'Centre Point', 'Center Point', 'Centre', 'Center', 'CenterPt', 'CentrePt'],
  'BP COORDS': ['BP COORDS', 'BP', 'Branch Point', 'Branch1 Point', 'Branch1', 'BranchPt', 'Branch'],
  'SKEY': ['SKEY', 'Skey', 'S-Key', 'Component Key', 'Fitting Key'],
  'SUPPORT COOR': ['SUPPORT COOR', 'Support Coord', 'Support Coords', 'Support Point', 'Restraint Coord', 'RestPt'],
  'SUPPORT GUID': ['SUPPORT GUID', 'Support GUID', 'GUID', 'Node Name', 'NodeName', 'UCI'],
  'SUPPORT NAME': ['SUPPORT NAME', 'Support Name', 'Support Type', 'Restraint Name', 'SupportCode'],
  'CA1': ['CA1', 'CA 1', 'Attr1', 'Attribute 1', 'Attribute1', 'COMPONENT-ATTRIBUTE1'],
  'CA2': ['CA2', 'CA 2', 'Attr2', 'Attribute 2', 'Attribute2', 'COMPONENT-ATTRIBUTE2'],
  'CA3': ['CA3', 'CA 3', 'Attr3', 'Attribute 3', 'Attribute3', 'COMPONENT-ATTRIBUTE3', 'Material', 'Material Name'],
  'CA4': ['CA4', 'CA 4', 'Attr4', 'Attribute 4', 'Attribute4', 'COMPONENT-ATTRIBUTE4', 'Wall Thickness', 'Wall Thick', 'WT', 'Thk'],
  'CA5': ['CA5', 'CA 5', 'Attr5', 'Attribute 5', 'Attribute5', 'COMPONENT-ATTRIBUTE5'],
  'CA6': ['CA6', 'CA 6', 'Attr6', 'Attribute 6', 'Attribute6', 'COMPONENT-ATTRIBUTE6'],
  'CA7': ['CA7', 'CA 7', 'Attr7', 'Attribute 7', 'Attribute7', 'COMPONENT-ATTRIBUTE7', 'Corrosion Allowance', 'Corr Allow'],
  'CA8': ['CA8', 'CA 8', 'Attr8', 'Attribute 8', 'Attribute8', 'COMPONENT-ATTRIBUTE8', 'Weight'],
  'CA9': ['CA9', 'CA 9', 'Attr9', 'Attribute 9', 'Attribute9', 'COMPONENT-ATTRIBUTE9'],
  'CA10': ['CA10', 'CA 10', 'Attr10', 'Attribute 10', 'Attribute10', 'COMPONENT-ATTRIBUTE10'],
  'CA97': ['CA97', 'CA 97', 'Ref No Attr', 'RefAttr', 'COMPONENT-ATTRIBUTE97'],
  'CA98': ['CA98', 'CA 98', 'Seq No Attr', 'SeqAttr', 'COMPONENT-ATTRIBUTE98'],
  'Fixing Action': ['Fixing Action', 'Fix', 'Action', 'FixAction', 'Overlap', 'Gap Fill'],
  'LEN 1': ['LEN 1', 'Len1', 'Length X', 'LenX', 'Dx', 'DX', 'Delta X', 'DeltaX'],
  'AXIS 1': ['AXIS 1', 'Axis1', 'Dir X', 'DirX', 'Direction X'],
  'LEN 2': ['LEN 2', 'Len2', 'Length Y', 'LenY', 'Dy', 'DY', 'Delta Y', 'DeltaY'],
  'AXIS 2': ['AXIS 2', 'Axis2', 'Dir Y', 'DirY', 'Direction Y'],
  'LEN 3': ['LEN 3', 'Len3', 'Length Z', 'LenZ', 'Dz', 'DZ', 'Delta Z', 'DeltaZ'],
  'AXIS 3': ['AXIS 3', 'Axis3', 'Dir Z', 'DirZ', 'Direction Z'],
  'BRLEN': ['BRLEN', 'BrLen', 'Branch Length', 'Branch Len', 'Br Len'],
  'DELTA_X': ['DELTA_X', 'DeltaX', 'Delta X', 'Dx', 'dX'],
  'DELTA_Y': ['DELTA_Y', 'DeltaY', 'Delta Y', 'Dy', 'dY'],
  'DELTA_Z': ['DELTA_Z', 'DeltaZ', 'Delta Z', 'Dz', 'dZ'],
  'DIAMETER': ['DIAMETER', 'Dia', 'OD', 'O/D', 'Outer Diameter', 'Outside Diameter'],
  'WALL_THICK': ['WALL_THICK', 'Wall Thick', 'WT', 'Wall Thickness', 'Thk', 'Thickness'],
  'BEND_PTR': ['BEND_PTR', 'Bend Ptr', 'BendPointer'],
  'RIGID_PTR': ['RIGID_PTR', 'Rigid Ptr', 'RigidPointer'],
  'INT_PTR': ['INT_PTR', 'Intersection Ptr', 'IntersectionPointer', 'Int Ptr'],
});

export function normalizeHeaderText(text) {
  return String(text ?? '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

function similarity(a, b) {
  const s1 = normalizeHeaderText(a);
  const s2 = normalizeHeaderText(b);
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;

  const rows = s1.length + 1;
  const cols = s2.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const dist = dp[s1.length][s2.length];
  return 1 - dist / Math.max(s1.length, s2.length);
}

export function buildAliasRegistry(customAliases = {}) {
  const merged = {};
  for (const [canonical, aliases] of Object.entries(DEFAULT_COLUMN_ALIASES)) {
    merged[canonical] = [...aliases];
  }
  for (const [canonical, aliases] of Object.entries(customAliases || {})) {
    merged[canonical] = [...(merged[canonical] || []), ...(Array.isArray(aliases) ? aliases : [aliases])].filter(Boolean);
  }
  return merged;
}

export function fuzzyMatchHeader(headerText, aliasConfig = DEFAULT_COLUMN_ALIASES, options = {}) {
  const threshold = Number(options.threshold ?? 0.75);
  const normHeader = normalizeHeaderText(headerText);
  if (!normHeader) return null;

  // Pass 1: exact match on normalized aliases/canonical names.
  for (const [canonical, aliases] of Object.entries(aliasConfig || {})) {
    const candidates = [canonical, ...(aliases || [])];
    for (const alias of candidates) {
      if (normalizeHeaderText(alias) === normHeader) {
        return { canonical, score: 1, method: 'exact', alias };
      }
    }
  }

  // Pass 2: substring containment, but avoid too-short accidental matches.
  for (const [canonical, aliases] of Object.entries(aliasConfig || {})) {
    const candidates = [canonical, ...(aliases || [])];
    for (const alias of candidates) {
      const normAlias = normalizeHeaderText(alias);
      if (normAlias.length < 3 || normHeader.length < 3) continue;
      if (normAlias.includes(normHeader) || normHeader.includes(normAlias)) {
        return { canonical, score: 0.9, method: 'contains', alias };
      }
    }
  }

  // Pass 3: fuzzy edit similarity.
  let best = null;
  for (const [canonical, aliases] of Object.entries(aliasConfig || {})) {
    const candidates = [canonical, ...(aliases || [])];
    for (const alias of candidates) {
      const score = similarity(normHeader, alias);
      if (score >= threshold && (!best || score > best.score)) {
        best = { canonical, score, method: 'fuzzy', alias };
      }
    }
  }
  return best;
}

export function mapHeaders(headers = [], options = {}) {
  const aliasConfig = buildAliasRegistry(options.customAliases || {});
  const out = {};
  const diagnostics = [];
  for (const header of headers || []) {
    const match = fuzzyMatchHeader(header, aliasConfig, options);
    if (!match) {
      diagnostics.push({ severity: 'info', header, message: 'Header not matched to canonical column' });
      continue;
    }
    if (!out[match.canonical]) {
      out[match.canonical] = header;
    } else {
      diagnostics.push({
        severity: 'warning',
        header,
        canonical: match.canonical,
        existing: out[match.canonical],
        message: 'Multiple source headers matched one canonical column; keeping first match',
      });
    }
  }
  return { map: out, diagnostics };
}

try {
  if (typeof window !== 'undefined') {
    window.PCF_COLUMN_ALIASES = DEFAULT_COLUMN_ALIASES;
    window.mapPcfHeaders = mapHeaders;
    window.fuzzyMatchPcfHeader = fuzzyMatchHeader;
  }
} catch (_) {}
