/**
 * pcf-output-diff.js — Legacy/Common PCF output comparator
 *
 * Parses PCF text into normalized blocks and compares block-by-block.
 */

const COMPONENT_KEYWORDS = new Set(['PIPE','FLANGE','BEND','TEE','OLET','VALVE','REDUCER-CONCENTRIC','REDUCER-ECCENTRIC','SUPPORT','MISC-COMPONENT']);
function cleanLine(line) { return String(line ?? '').replace(/\r/g, '').trimEnd(); }
function normText(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }
function num(v) { const n = Number.parseFloat(String(v ?? '').trim()); return Number.isFinite(n) ? n : null; }
function parseCoordLine(line) {
  const parts = normText(line).split(/\s+/);
  const values = parts.slice(1).map(num);
  if (values.length < 4 || values.some(v => v == null)) return null;
  return { x: values[0], y: values[1], z: values[2], bore: values[3] };
}
function parseCA(line) {
  const m = normText(line).match(/^COMPONENT-ATTRIBUTE(\d+)\s+(.+)$/i);
  if (!m) return null;
  return { slot: m[1], value: normText(m[2]) };
}
function parseBlockAttributes(lines) {
  const out = { endpoints: [], centrePoint: null, branchPoint: null, coOrds: null, skey: '', supportName: '', supportGuid: '', angle: '', bendRadius: '', ca: {}, rawAttributes: [] };
  for (const raw of lines) {
    const line = cleanLine(raw).trim();
    if (!line) continue;
    out.rawAttributes.push(line);
    if (line.startsWith('END-POINT')) { const c = parseCoordLine(line); if (c) out.endpoints.push(c); continue; }
    if (line.startsWith('CENTRE-POINT')) { out.centrePoint = parseCoordLine(line); continue; }
    if (line.startsWith('BRANCH1-POINT')) { out.branchPoint = parseCoordLine(line); continue; }
    if (line.startsWith('CO-ORDS')) { out.coOrds = parseCoordLine(line) || normText(line.replace(/^CO-ORDS/i, '')); continue; }
    if (line.startsWith('<SKEY>')) { out.skey = normText(line.replace(/^<SKEY>/i, '')); continue; }
    if (line.startsWith('<SUPPORT_NAME>')) { out.supportName = normText(line.replace(/^<SUPPORT_NAME>/i, '')); continue; }
    if (line.startsWith('<SUPPORT_GUID>')) { out.supportGuid = normText(line.replace(/^<SUPPORT_GUID>/i, '')); continue; }
    if (line.startsWith('ANGLE')) { out.angle = normText(line.replace(/^ANGLE/i, '')); continue; }
    if (line.startsWith('BEND-RADIUS')) { out.bendRadius = normText(line.replace(/^BEND-RADIUS/i, '')); continue; }
    const ca = parseCA(line);
    if (ca) { out.ca[ca.slot] = ca.value; continue; }
  }
  return out;
}
export function parsePcfBlocks(pcfText) {
  const lines = String(pcfText || '').split(/\r?\n/);
  const blocks = [];
  let pendingMessage = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const attrs = parseBlockAttributes(current.attrLines);
    blocks.push({ type: current.type, messageSquare: current.messageSquare, attrLines: current.attrLines, ...attrs, refNo: attrs.ca['97'] || '', seqNo: attrs.ca['98'] || '' });
    current = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = cleanLine(lines[i]);
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed === 'MESSAGE-SQUARE') {
      pendingMessage = [];
      const next = cleanLine(lines[i + 1] || '').trim();
      if (next && !COMPONENT_KEYWORDS.has(next)) { pendingMessage.push(next); i += 1; }
      continue;
    }
    if (COMPONENT_KEYWORDS.has(trimmed)) {
      flush();
      current = { type: trimmed, messageSquare: pendingMessage.join('\n'), attrLines: [] };
      pendingMessage = [];
      continue;
    }
    if (current) current.attrLines.push(trimmed);
  }
  flush();
  return blocks;
}
function approxEqual(a, b, tol) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) <= tol;
}
function compareCoord(path, a, b, diffs, tol) {
  if (!a && !b) return;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    diffs.push({ severity: 'critical', path, legacy: a, common: b, message: `${path} presence/type differs` });
    return;
  }
  for (const k of ['x','y','z','bore']) {
    if (!approxEqual(a[k], b[k], tol.coord)) diffs.push({ severity: 'critical', path: `${path}.${k}`, legacy: a[k], common: b[k], message: `${path}.${k} differs beyond tolerance ${tol.coord}` });
  }
}
function compareCA(blockPath, aCa, bCa, diffs) {
  const slots = new Set([...Object.keys(aCa || {}), ...Object.keys(bCa || {})]);
  for (const slot of [...slots].sort((a, b) => Number(a) - Number(b))) {
    const a = normText(aCa?.[slot]);
    const b = normText(bCa?.[slot]);
    if (a !== b) diffs.push({ severity: ['97','98'].includes(slot) ? 'critical' : 'major', path: `${blockPath}.CA${slot}`, legacy: a, common: b, message: `CA${slot} differs` });
  }
}
function compareEndpoints(blockPath, a, b, diffs, tol) {
  const max = Math.max(a.endpoints.length, b.endpoints.length);
  if (a.endpoints.length !== b.endpoints.length) diffs.push({ severity: 'critical', path: `${blockPath}.END-POINT.count`, legacy: a.endpoints.length, common: b.endpoints.length, message: 'END-POINT count differs' });
  for (let i = 0; i < max; i++) compareCoord(`${blockPath}.END-POINT[${i}]`, a.endpoints[i], b.endpoints[i], diffs, tol);
}
function compareBlock(index, legacy, common, tol) {
  const diffs = [];
  const path = `block[${index}]`;
  if (!legacy || !common) { diffs.push({ severity: 'critical', path, legacy: legacy?.type || null, common: common?.type || null, message: 'Block missing in one output' }); return diffs; }
  if (legacy.type !== common.type) diffs.push({ severity: 'critical', path: `${path}.type`, legacy: legacy.type, common: common.type, message: 'Block type differs' });
  compareEndpoints(path, legacy, common, diffs, tol);
  compareCoord(`${path}.CENTRE-POINT`, legacy.centrePoint, common.centrePoint, diffs, tol);
  compareCoord(`${path}.BRANCH1-POINT`, legacy.branchPoint, common.branchPoint, diffs, tol);
  if (typeof legacy.coOrds === 'object' || typeof common.coOrds === 'object') compareCoord(`${path}.CO-ORDS`, legacy.coOrds, common.coOrds, diffs, tol);
  else if (normText(legacy.coOrds) !== normText(common.coOrds)) diffs.push({ severity: 'major', path: `${path}.CO-ORDS`, legacy: legacy.coOrds, common: common.coOrds, message: 'CO-ORDS differs' });
  for (const key of ['skey','supportName','supportGuid','angle','bendRadius']) {
    const a = normText(legacy[key]);
    const b = normText(common[key]);
    if (a !== b) diffs.push({ severity: key === 'skey' ? 'major' : 'minor', path: `${path}.${key}`, legacy: a, common: b, message: `${key} differs` });
  }
  compareCA(path, legacy.ca, common.ca, diffs);
  return diffs;
}
export function diffPcfOutputs(legacyText, commonText, options = {}) {
  const tol = { coord: Number(options.coordTolerance ?? 0.001) };
  const legacyBlocks = parsePcfBlocks(legacyText);
  const commonBlocks = parsePcfBlocks(commonText);
  const diffs = [];
  if (legacyBlocks.length !== commonBlocks.length) diffs.push({ severity: 'critical', path: 'blocks.count', legacy: legacyBlocks.length, common: commonBlocks.length, message: 'Block count differs' });
  const max = Math.max(legacyBlocks.length, commonBlocks.length);
  for (let i = 0; i < max; i++) diffs.push(...compareBlock(i, legacyBlocks[i], commonBlocks[i], tol));
  const summary = { legacyBlockCount: legacyBlocks.length, commonBlockCount: commonBlocks.length, total: diffs.length, critical: diffs.filter(d => d.severity === 'critical').length, major: diffs.filter(d => d.severity === 'major').length, minor: diffs.filter(d => d.severity === 'minor').length };
  return { summary, diffs, legacyBlocks, commonBlocks, pass: summary.critical === 0 && summary.major === 0 };
}
