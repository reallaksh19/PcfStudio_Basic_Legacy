/**
 * pcf-emitter.js — Shared PCF component emitters (Common Engine)
 *
 * Replaces duplicated emit functions in rc-stage4-emitter.js and coord-pcf-emitter.js.
 * All emitters use emitCABlock() from pcf-block-schema.js for CA attribute emission.
 *
 * Component shape expected:
 *   { type, ep1, ep2, cp, bp, bore, branchBore, angleDeg, radius, effectiveRadius,
 *     skey, refNo, seqNo, supportName, supportCoor, ca: { '1':v, ..., '8':v, '9':v, '10':v } }
 *
 * Exports:
 *   fmtCoord(val, precision)
 *   emitPipe(comp, cfg)
 *   emitBend(comp, cfg)
 *   emitTee(comp, cfg)
 *   emitOlet(comp, cfg)
 *   emitFlange(comp, cfg)
 *   emitValve(comp, cfg)
 *   emitReducer(comp, cfg)
 *   emitSupport(comp, cfg)
 *   emitComponent(comp, cfg)
 */

import { ENGINE_CONFIG } from './engine-config.js';
import { emitCABlock } from './pcf-block-schema.js';

const INDENT = '    ';

// ── Formatting helpers ────────────────────────────────────────────────────────

export function fmtCoord(val, precision = 4) {
  return Number(val).toFixed(precision);
}

function fmtPt(pt, bore, dp) {
  return `${fmtCoord(pt.x, dp)} ${fmtCoord(pt.y, dp)} ${fmtCoord(pt.z, dp)} ${fmtCoord(bore, dp)}`;
}

function sanitizeAttrValue(val) {
  return String(val ?? '').replace(/=/g, '').trim();
}

function msgSq(parts) {
  return ['MESSAGE-SQUARE', `${INDENT}${parts.filter(Boolean).join(', ')}`];
}

function dp(cfg) {
  return cfg?.decimalPrecision ?? ENGINE_CONFIG.decimalPrecision;
}

// ── PIPE ──────────────────────────────────────────────────────────────────────

export function emitPipe(comp, cfg = {}) {
  const precision = dp(cfg);
  const b = parseFloat(comp.bore) || 250;
  const refNo = sanitizeAttrValue(comp.refNo || '');
  const seqNo = comp.seqNo || '';

  const dx = (comp.ep2.x - comp.ep1.x);
  const dy = (comp.ep2.y - comp.ep1.y);
  const dz = (comp.ep2.z - comp.ep1.z);
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const lines = [
    ...msgSq(['PIPE', refNo ? `RefNo:=${refNo}` : null, seqNo ? `SeqNo:${seqNo}` : null, `LENGTH=${fmtCoord(length, 2)}MM`]),
    'PIPE',
    `${INDENT}END-POINT  ${fmtPt(comp.ep1, b, precision)}`,
    `${INDENT}END-POINT  ${fmtPt(comp.ep2, b, precision)}`,
    ...emitCABlock(comp.ca || {}, 'PIPE', refNo || null, seqNo || null),
    '',
  ];
  return lines;
}

// ── BEND ──────────────────────────────────────────────────────────────────────

export function emitBend(comp, cfg = {}) {
  const precision = dp(cfg);
  const b      = parseFloat(comp.bore) || 250;
  const radius = comp.effectiveRadius ?? comp.radius ?? comp.bendRadius ?? (b * 1.5);
  const angle  = comp.angleDeg != null ? fmtCoord(comp.angleDeg, 4) : '90.0000';
  const skey   = sanitizeAttrValue(comp.skey || 'BEBW');
  const refNo  = sanitizeAttrValue(comp.refNo || '');
  const seqNo  = comp.seqNo || '';

  return [
    ...msgSq(['BEND', refNo ? `RefNo:=${refNo}` : null, seqNo ? `SeqNo:${seqNo}` : null]),
    'BEND',
    `${INDENT}END-POINT  ${fmtPt(comp.ep1, b, precision)}`,
    `${INDENT}END-POINT  ${fmtPt(comp.ep2, b, precision)}`,
    `${INDENT}CENTRE-POINT  ${fmtPt(comp.cp, b, precision)}`,
    `${INDENT}<SKEY>  ${skey}`,
    `${INDENT}ANGLE ${angle}`,
    `${INDENT}BEND-RADIUS ${fmtCoord(radius, 4)}`,
    ...emitCABlock(comp.ca || {}, 'BEND', refNo || null, seqNo || null),
    '',
  ];
}

// ── TEE ───────────────────────────────────────────────────────────────────────

export function emitTee(comp, cfg = {}) {
  const precision = dp(cfg);
  const b  = parseFloat(comp.headerBore || comp.bore) || 250;
  const bb = parseFloat(comp.branchBore) || b;
  const skey  = sanitizeAttrValue(comp.skey || 'TEBW');
  const refNo = sanitizeAttrValue(comp.refNo || '');
  const seqNo = comp.seqNo || '';

  return [
    ...msgSq(['TEE', comp.brlen ? `BrLen=${fmtCoord(comp.brlen, 4)}MM` : null, refNo ? `RefNo:=${refNo}` : null, seqNo ? `SeqNo:${seqNo}` : null]),
    'TEE',
    `${INDENT}END-POINT  ${fmtPt(comp.ep1, b, precision)}`,
    `${INDENT}END-POINT  ${fmtPt(comp.ep2, b, precision)}`,
    `${INDENT}CENTRE-POINT  ${fmtPt(comp.cp, b, precision)}`,
    `${INDENT}BRANCH1-POINT  ${fmtPt(comp.bp, bb, precision)}`,
    `${INDENT}<SKEY>  ${skey}`,
    ...emitCABlock(comp.ca || {}, 'TEE', refNo || null, seqNo || null),
    '',
  ];
}

// ── OLET ──────────────────────────────────────────────────────────────────────

export function emitOlet(comp, cfg = {}) {
  const precision = dp(cfg);
  const b  = parseFloat(comp.bore) || 250;
  const bb = parseFloat(comp.branchBore) || b;
  const skey  = sanitizeAttrValue(comp.skey || 'OLWL');
  const refNo = sanitizeAttrValue(comp.refNo || '');
  const seqNo = comp.seqNo || '';

  return [
    ...msgSq(['OLET', refNo ? `RefNo:=${refNo}` : null, seqNo ? `SeqNo:${seqNo}` : null]),
    'OLET',
    `${INDENT}CENTRE-POINT  ${fmtPt(comp.cp, b, precision)}`,
    `${INDENT}BRANCH1-POINT  ${fmtPt(comp.bp, bb, precision)}`,
    `${INDENT}<SKEY>  ${skey}`,
    ...emitCABlock(comp.ca || {}, 'OLET', refNo || null, seqNo || null),
    '',
  ];
}

// ── FLANGE ────────────────────────────────────────────────────────────────────

export function emitFlange(comp, cfg = {}) {
  const precision = dp(cfg);
  const b    = parseFloat(comp.bore) || 250;
  const skey = sanitizeAttrValue(comp.skey || 'FLWN');
  const refNo = sanitizeAttrValue(comp.refNo || '');
  const seqNo = comp.seqNo || '';

  return [
    ...msgSq(['FLANGE', refNo ? `RefNo:=${refNo}` : null, seqNo ? `SeqNo:${seqNo}` : null]),
    'FLANGE',
    `${INDENT}END-POINT  ${fmtPt(comp.ep1, b, precision)}`,
    `${INDENT}END-POINT  ${fmtPt(comp.ep2, b, precision)}`,
    `${INDENT}<SKEY>  ${skey}`,
    ...emitCABlock(comp.ca || {}, 'FLANGE', refNo || null, seqNo || null),
    '',
  ];
}

// ── VALVE ─────────────────────────────────────────────────────────────────────

export function emitValve(comp, cfg = {}) {
  const precision = dp(cfg);
  const b    = parseFloat(comp.bore) || 250;
  const skey = sanitizeAttrValue(comp.skey || 'VLBT');
  const refNo = sanitizeAttrValue(comp.refNo || '');
  const seqNo = comp.seqNo || '';

  return [
    ...msgSq(['VALVE', refNo ? `RefNo:=${refNo}` : null, seqNo ? `SeqNo:${seqNo}` : null]),
    'VALVE',
    `${INDENT}END-POINT  ${fmtPt(comp.ep1, b, precision)}`,
    `${INDENT}END-POINT  ${fmtPt(comp.ep2, b, precision)}`,
    `${INDENT}<SKEY>  ${skey}`,
    ...emitCABlock(comp.ca || {}, 'VALVE', refNo || null, seqNo || null),
    '',
  ];
}

// ── REDUCER ───────────────────────────────────────────────────────────────────

export function emitReducer(comp, cfg = {}) {
  const precision = dp(cfg);
  const b    = parseFloat(comp.bore) || 250;
  const skey = sanitizeAttrValue(comp.skey || 'RCON');
  const refNo = sanitizeAttrValue(comp.refNo || '');
  const seqNo = comp.seqNo || '';
  const kwType = comp.type === 'REDUCER-ECCENTRIC' ? 'REDUCER-ECCENTRIC' : 'REDUCER-CONCENTRIC';

  return [
    ...msgSq([kwType, refNo ? `RefNo:=${refNo}` : null, seqNo ? `SeqNo:${seqNo}` : null]),
    kwType,
    `${INDENT}END-POINT  ${fmtPt(comp.ep1, b, precision)}`,
    `${INDENT}END-POINT  ${fmtPt(comp.ep2, parseFloat(comp.branchBore || comp.bore) || b, precision)}`,
    `${INDENT}<SKEY>  ${skey}`,
    ...emitCABlock(comp.ca || {}, kwType, refNo || null, seqNo || null),
    '',
  ];
}

// ── SUPPORT ───────────────────────────────────────────────────────────────────

export function emitSupport(comp, cfg = {}) {
  const precision = dp(cfg);
  const bore = 0;  // SUPPORT CO-ORDS bore is always 0.0000 per spec §12
  const supName = comp.supportName || cfg.supportDefaultCoor || ENGINE_CONFIG.supportNames.fallback;
  const coords  = (typeof comp.supportCoor === 'object' && comp.supportCoor)
    ? comp.supportCoor
    : (comp.ep1 || { x: 0, y: 0, z: 0 });
  const refNo = sanitizeAttrValue(comp.refNo || '');
  const seqNo = comp.seqNo || '';

  const lines = [
    'MESSAGE-SQUARE',
    `${INDENT}SUPPORT, ${refNo ? `RefNo:=${refNo}, ` : ''}${supName}${seqNo ? `, SeqNo:${seqNo}` : ''}`,
    'SUPPORT',
    `${INDENT}CO-ORDS  ${fmtPt(coords, bore, precision)}`,
    `${INDENT}<SUPPORT_NAME>  ${supName}`,
  ];
  if (comp.nodeName) lines.push(`${INDENT}<SUPPORT_GUID>  UCI:${comp.nodeName}`);
  // NO CA1-CA10 lines on SUPPORT per spec §12
  // CA97/CA98 are optional — emit via emitCABlock if needed
  const caLines = emitCABlock({}, 'SUPPORT', refNo || null, seqNo || null);
  lines.push(...caLines);
  lines.push('');
  return lines;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Dispatch to the correct emitter based on comp.type.
 *
 * @param {object} comp
 * @param {object} cfg
 * @returns {string[]}
 */
export function emitComponent(comp, cfg = {}) {
  switch (comp.type) {
    case 'PIPE':                return emitPipe(comp, cfg);
    case 'BEND':                return emitBend(comp, cfg);
    case 'TEE':                 return emitTee(comp, cfg);
    case 'OLET':                return emitOlet(comp, cfg);
    case 'FLANGE':              return emitFlange(comp, cfg);
    case 'VALVE':               return emitValve(comp, cfg);
    case 'REDUCER-CONCENTRIC':
    case 'REDUCER-ECCENTRIC':   return emitReducer(comp, cfg);
    case 'SUPPORT':             return emitSupport(comp, cfg);
    // Non-structural items silently dropped per PCF spec (same as legacy mode)
    case 'GASK':
    case 'PCOM':
    case 'MISC':
    case 'WELD':
    case 'ATTA':
    case 'INST':
      return [];
    default:
      return [`/* unknown type: ${comp.type} */`, ''];
  }
}

/**
 * Interleave bridge pipes into the component list in the correct order,
 * replacing original PIPE/BRAN segments with their bridge equivalents.
 *
 * In legacy mode the Stage-4 emitter does this naturally by emitting
 * bridges immediately after their source fitting. Common mode previously
 * concatenated everything flat, producing wrong ordering when bridges exist.
 *
 * @param {object[]} components   - Stage-1 components with _isBridge=false
 * @param {object[]} injectedPipes - Bridge pipes with fromRefNo + _isBridge=true
 * @returns {object[]} Ordered array ready for emitComponent()
 */
export function applyBridgeInterleave(components, injectedPipes) {
  if (!injectedPipes || injectedPipes.length === 0) return components;

  // Build bridge lookup: fromRefNo → bridge[]
  const bridgesByFrom = new Map();
  for (const br of injectedPipes) {
    const key = br.fromRefNo || '__unkeyed';
    if (!bridgesByFrom.has(key)) bridgesByFrom.set(key, []);
    bridgesByFrom.get(key).push(br);
  }

  const result = [];
  const emittedKeys = new Set();

  const bridgeKey = (br) =>
    `${br.fromRefNo}__${br.ep1?.x}_${br.ep1?.y}_${br.ep1?.z}__${br.ep2?.x}_${br.ep2?.y}_${br.ep2?.z}`;

  for (const comp of components) {
    // Skip original PIPE/BRAN — their geometry is replaced by bridge pipes
    if (comp.type === 'PIPE' || comp.type === 'BRAN') continue;

    result.push(comp);

    // Inject bridges that originate from this fitting
    const bridges = bridgesByFrom.get(comp.refNo) || [];
    for (const br of bridges) {
      const k = bridgeKey(br);
      if (emittedKeys.has(k)) continue;
      emittedKeys.add(k);
      result.push({ ...br, type: 'PIPE' });
    }
  }

  // Safety net: emit any bridge whose fromRefNo didn't match a component
  for (const br of injectedPipes) {
    const k = bridgeKey(br);
    if (!emittedKeys.has(k)) result.push({ ...br, type: 'PIPE' });
  }

  return result;
}
