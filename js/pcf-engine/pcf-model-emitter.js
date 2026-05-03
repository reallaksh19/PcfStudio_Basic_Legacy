/**
 * pcf-model-emitter.js — Common PCF Builder Phase 2/3
 *
 * Converts canonical Common PCF model blocks into PCF text.
 * Phase 3B adds bridge ordering parity: bridge PIPE blocks are emitted
 * immediately after their originating component, matching legacy Stage 4.
 * Phase 3C adds support-on-bridge split parity: supports located on a bridge
 * split the bridge into pipe segments and are emitted inline.
 */

import { emitCABlock } from './pcf-block-schema.js';

const INDENT = '    ';
const NON_EMIT_TYPES = new Set(['GASK', 'PCOM', 'MISC', 'WELD', 'ATTA', 'INST']);

function n(value, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}
function cleanText(value) { return String(value ?? '').replace(/=/g, '').trim(); }
function p(cfg) { return Number.isInteger(cfg?.decimalPrecision) ? cfg.decimalPrecision : 4; }
function fmtNum(value, cfg) { return n(value, 0).toFixed(p(cfg)); }
function fmtCoord(pt, bore, cfg) {
  return `${fmtNum(pt?.x, cfg)} ${fmtNum(pt?.y, cfg)} ${fmtNum(pt?.z, cfg)} ${fmtNum(bore, cfg)}`;
}
function emitMsgSq(parts, cfg) {
  if (cfg?.messageSquareEnabled === false) return [];
  return ['MESSAGE-SQUARE', `${INDENT}${parts.filter(Boolean).join(', ')}`];
}
function emitSkey(block, fallback = '') {
  const skey = cleanText(block?.skey || fallback);
  return skey ? [`${INDENT}<SKEY> ${skey}`] : [];
}
function caFor(block) {
  const ca = { ...(block?.ca || {}) };
  if (block?.weight != null && block.weight !== '' && !ca['8']) ca['8'] = String(block.weight);
  return ca;
}
function refFor(block, fallback = '') { return cleanText(block?.refNo || block?.source?.originalRefNo || fallback); }
function vecSub(a, b) { return { x: n(a?.x) - n(b?.x), y: n(a?.y) - n(b?.y), z: n(a?.z) - n(b?.z) }; }
function vecMag(v) { return Math.sqrt(n(v?.x) * n(v?.x) + n(v?.y) * n(v?.y) + n(v?.z) * n(v?.z)); }
function lengthAxis(ep1, ep2, cfg) {
  if (!ep1 || !ep2) return {};
  const dx = n(ep2.x) - n(ep1.x), dy = n(ep2.y) - n(ep1.y), dz = n(ep2.z) - n(ep1.z);
  const axis = (delta, pos, neg) => Math.abs(delta) < 1e-6 ? '' : (delta > 0 ? pos : neg);
  return {
    len1: Math.abs(dx) > 1e-6 ? fmtNum(dx, cfg) : '', axis1: axis(dx, 'EAST', 'WEST'),
    len2: Math.abs(dy) > 1e-6 ? fmtNum(dy, cfg) : '', axis2: axis(dy, 'NORTH', 'SOUTH'),
    len3: Math.abs(dz) > 1e-6 ? fmtNum(dz, cfg) : '', axis3: axis(dz, 'UP', 'DOWN'),
  };
}
function primaryLengthText(block, cfg) {
  const la = lengthAxis(block.ep1, block.ep2, cfg);
  return [la.len1 ? `${la.len1}MM ${la.axis1}` : '', la.len2 ? `${la.len2}MM ${la.axis2}` : '', la.len3 ? `${la.len3}MM ${la.axis3}` : ''].filter(Boolean).join(' + ');
}
function firstLengthText(block, cfg) {
  const la = lengthAxis(block.ep1, block.ep2, cfg);
  if (la.len1) return `${la.len1}MM ${la.axis1}`;
  if (la.len2) return `${la.len2}MM ${la.axis2}`;
  if (la.len3) return `${la.len3}MM ${la.axis3}`;
  return '';
}
function buildHeader(model) {
  const pipelineRef = cleanText(model?.pipelineRef || '');
  return ['ISOGEN-FILES ISOGEN.FLS','UNITS-BORE MM','UNITS-CO-ORDS MM','UNITS-WEIGHT KGS','UNITS-BOLT-DIA MM','UNITS-BOLT-LENGTH MM',`PIPELINE-REFERENCE ${pipelineRef}`,`${INDENT}PROJECT-IDENTIFIER P1`,`${INDENT}AREA A1`,''];
}
function emitCA(block, blockType, seq) { return emitCABlock(caFor(block), blockType, refFor(block), String(seq)); }
function emitPipe(block, seq, model, cfg) {
  if (!block.ep1 || !block.ep2) return [];
  const refNo = refFor(block), lenText = primaryLengthText(block, cfg), lines = [];
  lines.push(...emitMsgSq(['PIPE', refNo ? `RefNo:=${refNo}` : '', lenText ? `LENGTH=${lenText}` : '', `SeqNo:${seq}`], cfg));
  lines.push('PIPE', `${INDENT}END-POINT    ${fmtCoord(block.ep1, block.bore, cfg)}`, `${INDENT}END-POINT    ${fmtCoord(block.ep2, block.bore, cfg)}`);
  if (model?.pipelineRef) lines.push(`${INDENT}PIPELINE-REFERENCE ${cleanText(model.pipelineRef)}`);
  lines.push(...emitSkey(block), ...emitCA(block, 'PIPE', seq), '');
  return lines;
}
function emitFlange(block, seq, cfg) {
  if (!block.ep1 || !block.ep2) return [];
  const refNo = refFor(block), lenText = firstLengthText(block, cfg), lines = [];
  lines.push(...emitMsgSq(['FLANGE', lenText ? `LENGTH=${lenText}` : '', refNo ? `RefNo:=${refNo}` : '', `SeqNo:${seq}`], cfg));
  lines.push('FLANGE', `${INDENT}END-POINT    ${fmtCoord(block.ep1, block.bore, cfg)}`, `${INDENT}END-POINT    ${fmtCoord(block.ep2, block.bore, cfg)}`);
  lines.push(...emitSkey(block, block.rawType === 'FBLI' ? 'BLFL' : ''), ...emitCA(block, 'FLANGE', seq), '');
  return lines;
}
function emitBend(block, seq, cfg) {
  if (!block.ep1 || !block.ep2 || !block.cp) return [];
  const refNo = refFor(block), lines = [];
  lines.push(...emitMsgSq(['BEND', refNo ? `RefNo:=${refNo}` : '', `SeqNo:${seq}`], cfg));
  lines.push('BEND', `${INDENT}END-POINT    ${fmtCoord(block.ep1, block.bore, cfg)}`, `${INDENT}END-POINT    ${fmtCoord(block.ep2, block.bore, cfg)}`, `${INDENT}CENTRE-POINT  ${fmtCoord(block.cp, block.bore, cfg)}`);
  lines.push(...emitSkey(block), `${INDENT}ANGLE ${fmtNum(block.angleDeg ?? 90, cfg)}`);
  if (block.radius || block.bendRadius) lines.push(`${INDENT}BEND-RADIUS ${fmtNum(block.radius || block.bendRadius, cfg)}`);
  lines.push(...emitCA(block, 'BEND', seq), '');
  return lines;
}
function emitTee(block, seq, cfg) {
  if (!block.ep1 || !block.ep2 || !block.cp || !block.bp) return [];
  const refNo = refFor(block), brlen = block.brlen ?? block.branchLength ?? '', lines = [];
  lines.push(...emitMsgSq(['TEE', brlen !== '' ? `LENGTH=${brlen}MM` : '', refNo ? `RefNo:=${refNo}` : '', `SeqNo:${seq}`, brlen !== '' ? `BrLen=${brlen}MM` : ''], cfg));
  lines.push('TEE', `${INDENT}END-POINT    ${fmtCoord(block.ep1, block.bore, cfg)}`, `${INDENT}END-POINT    ${fmtCoord(block.ep2, block.bore, cfg)}`, `${INDENT}CENTRE-POINT  ${fmtCoord(block.cp, block.bore, cfg)}`, `${INDENT}BRANCH1-POINT ${fmtCoord(block.bp, block.branchBore || block.bore, cfg)}`);
  lines.push(...emitSkey(block), ...emitCA(block, 'TEE', seq), '');
  return lines;
}
function emitOlet(block, seq, cfg) {
  if (!block.cp || !block.bp) return [];
  const refNo = refFor(block), brlen = block.brlen ?? block.branchLength ?? '', lines = [];
  lines.push(...emitMsgSq(['OLET', brlen !== '' ? `BrLen=${brlen}MM` : '', refNo ? `RefNo:=${refNo}` : '', `SeqNo:${seq}`], cfg));
  lines.push('OLET', `${INDENT}CENTRE-POINT  ${fmtCoord(block.cp, block.bore, cfg)}`, `${INDENT}BRANCH1-POINT ${fmtCoord(block.bp, block.branchBore || 50, cfg)}`);
  lines.push(...emitSkey(block), ...emitCA(block, 'OLET', seq), '');
  return lines;
}
function emitValve(block, seq, cfg) {
  if (!block.ep1 || !block.ep2) return [];
  const refNo = refFor(block), lenText = firstLengthText(block, cfg), lines = [];
  lines.push(...emitMsgSq(['VALVE', lenText ? `LENGTH=${lenText}` : '', refNo ? `RefNo:=${refNo}` : '', `SeqNo:${seq}`], cfg));
  lines.push('VALVE', `${INDENT}END-POINT    ${fmtCoord(block.ep1, block.bore, cfg)}`, `${INDENT}END-POINT    ${fmtCoord(block.ep2, block.bore, cfg)}`);
  lines.push(...emitSkey(block), ...emitCA(block, 'VALVE', seq), '');
  return lines;
}
function emitReducer(block, seq, cfg) {
  if (!block.ep1 || !block.ep2) return [];
  const refNo = refFor(block), lenText = firstLengthText(block, cfg), lines = [];
  lines.push(...emitMsgSq([block.type, lenText ? `LENGTH=${lenText}` : '', refNo ? `RefNo:=${refNo}` : '', `SeqNo:${seq}`], cfg));
  lines.push(block.type, `${INDENT}END-POINT    ${fmtCoord(block.ep1, block.bore, cfg)}`, `${INDENT}END-POINT    ${fmtCoord(block.ep2, block.branchBore || block.bore, cfg)}`);
  lines.push(...emitSkey(block, block.type === 'REDUCER-ECCENTRIC' ? 'REBW' : 'RCBW'), ...emitCA(block, block.type, seq), '');
  return lines;
}
function emitSupport(block, seq, cfg) {
  const supportName = cleanText(block.supportName) || cleanText(cfg?.supportMapping?.fallbackName) || cleanText(cfg?.supportDefaultCoor) || 'CA150';
  const rawGuid = cleanText(block.supportGuid);
  const guidOut = rawGuid ? (rawGuid.startsWith('UCI:') ? rawGuid : `UCI:${rawGuid}`) : '';
  const lines = [];
  lines.push(...emitMsgSq(['SUPPORT', `RefNo:=${refFor(block)}`, `SeqNo:${seq}`, supportName, guidOut], cfg));
  lines.push('SUPPORT');
  if (block.supportCoor) lines.push(`${INDENT}CO-ORDS    ${fmtCoord(block.supportCoor, 0, cfg)}`);
  else lines.push(`${INDENT}CO-ORDS    ${cleanText(cfg?.supportDefaultCoor || supportName)}`);
  lines.push(`${INDENT}<SUPPORT_NAME>    ${supportName}`);
  if (guidOut) lines.push(`${INDENT}<SUPPORT_GUID>    ${guidOut}`);
  lines.push('');
  return lines;
}
function emitBlock(block, seq, model, cfg) {
  if (!block || block.skipReason || NON_EMIT_TYPES.has(block.rawType) || NON_EMIT_TYPES.has(block.type)) return [];
  switch (block.type) {
    case 'PIPE': return emitPipe(block, seq, model, cfg);
    case 'FLANGE': return emitFlange(block, seq, cfg);
    case 'BEND': return emitBend(block, seq, cfg);
    case 'TEE': return emitTee(block, seq, cfg);
    case 'OLET': return emitOlet(block, seq, cfg);
    case 'VALVE': return emitValve(block, seq, cfg);
    case 'REDUCER-CONCENTRIC':
    case 'REDUCER-ECCENTRIC': return emitReducer(block, seq, cfg);
    case 'SUPPORT': return emitSupport(block, seq, cfg);
    default: return [];
  }
}
function blockKey(block) { return cleanText(block?.refNo || block?.id || ''); }
function bridgeOriginKey(block) { return cleanText(block?.source?.fromRefNo || block?.fromRefNo || ''); }
function buildBridgeGroups(model) {
  const groups = new Map();
  for (const bridge of model?.bridgeBlocks || []) {
    const key = bridgeOriginKey(bridge) || '__unkeyed';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(bridge);
  }
  return groups;
}
function supportPoint(block) { return block?.supportCoor || block?.cp || null; }
function supportsOnBridge(bridge, supportBlocks, cfg) {
  if (!bridge?.ep1 || !bridge?.ep2) return [];
  const seg = vecSub(bridge.ep2, bridge.ep1);
  const segLen = vecMag(seg);
  if (segLen < 1e-6) return [];
  const sd = { x: seg.x / segLen, y: seg.y / segLen, z: seg.z / segLen };
  const tol = Math.max((bridge.bore || 0) * (cfg?.boreTolMultiplier || 0.5), (cfg?.minBoreTol || 25), 1000);
  const hits = [];
  for (const sp of supportBlocks || []) {
    const pt = supportPoint(sp);
    if (!pt) continue;
    const tv = vecSub(pt, bridge.ep1);
    const t = tv.x * sd.x + tv.y * sd.y + tv.z * sd.z;
    if (t <= 0 || t >= segLen) continue;
    const snap = { x: bridge.ep1.x + sd.x * t, y: bridge.ep1.y + sd.y * t, z: bridge.ep1.z + sd.z * t };
    const perpDist = vecMag(vecSub(pt, snap));
    if (perpDist <= tol) hits.push({ comp: sp, t, snap });
  }
  hits.sort((a, b) => a.t - b.t);
  return hits;
}
function shouldSkipOriginalPipe(block, model) { return block?.type === 'PIPE' && Array.isArray(model?.bridgeBlocks) && model.bridgeBlocks.length > 0; }
export function emitPcfModel(model, cfg = {}) {
  const eol = cfg?.windowsLineEndings === false ? '\n' : '\r\n';
  const lines = buildHeader(model, cfg);
  const emittedBlocks = [];
  const bridgeGroups = buildBridgeGroups(model);
  const emittedBridgeIds = new Set();
  const inlineSupportKeys = new Set();
  const supportBlocks = (model?.componentBlocks || []).filter(b => b.type === 'SUPPORT');
  let splitBridgeCount = 0;
  let inlineSupportCount = 0;
  let seq = 0;
  const pushBlock = (block, options = {}) => {
    if (!options.force && block?.type === 'SUPPORT' && inlineSupportKeys.has(blockKey(block))) return;
    if (shouldSkipOriginalPipe(block, model)) return;
    const previewLines = emitBlock(block, seq + 1, model, cfg);
    if (!previewLines.length) return;
    seq += 1;
    block.emitSeq = seq;
    lines.push(...emitBlock(block, seq, model, cfg));
    emittedBlocks.push({ id: block.id, type: block.type, rawType: block.rawType, refNo: block.refNo, seqNo: seq, sourceKind: block.sourceKind, splitKind: block.splitKind || '' });
  };
  const pushBridgeSplit = (bridge, originRefNo) => {
    const originRef = cleanText(originRefNo || bridgeOriginKey(bridge));
    const ep1RefNo = originRef ? `${originRef}_bridged` : '';
    const hits = supportsOnBridge(bridge, supportBlocks, cfg);
    if (!hits.length) {
      pushBlock({ ...bridge, refNo: ep1RefNo, splitKind: 'bridge-unsplit' }, { force: true });
      return;
    }
    splitBridgeCount += 1;
    let cursor = bridge.ep1;
    let idx = 0;
    for (const hit of hits) {
      idx += 1;
      const supportRef = cleanText(hit.comp.refNo || hit.comp.source?.originalRefNo || `SUPPORT_${idx}`);
      const segRefNo = `${supportRef}_bridged`;
      pushBlock({ ...bridge, id: `${bridge.id}:split:${idx}`, ep1: cursor, ep2: hit.snap, refNo: segRefNo, splitKind: 'bridge-to-support' }, { force: true });
      const supportKey = blockKey(hit.comp);
      inlineSupportKeys.add(supportKey);
      inlineSupportCount += 1;
      pushBlock({ ...hit.comp, supportCoor: hit.snap, splitKind: 'inline-bridge-support' }, { force: true });
      cursor = hit.snap;
    }
    pushBlock({ ...bridge, id: `${bridge.id}:tail`, ep1: cursor, ep2: bridge.ep2, refNo: ep1RefNo, splitKind: 'bridge-tail' }, { force: true });
  };
  const pushBridgesFrom = (refNo) => {
    const key = cleanText(refNo);
    const list = bridgeGroups.get(key) || [];
    for (const bridge of list) {
      if (emittedBridgeIds.has(bridge.id)) continue;
      emittedBridgeIds.add(bridge.id);
      pushBridgeSplit(bridge, key);
    }
  };
  for (const block of model?.componentBlocks || []) {
    pushBlock(block);
    pushBridgesFrom(block.refNo || block.source?.originalRefNo);
  }
  // Safety net for bridges whose fromRefNo was not found in component list.
  for (const bridge of model?.bridgeBlocks || []) {
    if (emittedBridgeIds.has(bridge.id)) continue;
    emittedBridgeIds.add(bridge.id);
    pushBridgeSplit(bridge, bridgeOriginKey(bridge));
  }
  return {
    pcfText: lines.join(eol),
    emittedBlocks,
    meta: {
      engine: 'common',
      emittedBy: 'pcf-model-emitter',
      lineCount: lines.length,
      blockCount: emittedBlocks.length,
      bridgeOrdering: 'legacy-origin-after-component',
      supportBridgeSplit: 'legacy-inline-projection',
      splitBridgeCount,
      inlineSupportCount,
    }
  };
}
