/**
 * pcf-model-emitter.js — Common PCF Builder Phase 2
 *
 * Converts canonical Common PCF model blocks into PCF text.
 */

import { emitCABlock } from './pcf-block-schema.js';

const INDENT = '    ';
const NON_EMIT_TYPES = new Set(['GASK', 'PCOM', 'MISC', 'WELD', 'ATTA', 'INST']);

function n(value, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function cleanText(value) {
  return String(value ?? '').replace(/=/g, '').trim();
}

function p(cfg) {
  return Number.isInteger(cfg?.decimalPrecision) ? cfg.decimalPrecision : 4;
}

function fmtNum(value, cfg) {
  return n(value, 0).toFixed(p(cfg));
}

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

function refFor(block, fallback = '') {
  return cleanText(block?.refNo || block?.source?.originalRefNo || fallback);
}

function lengthAxis(ep1, ep2, cfg) {
  if (!ep1 || !ep2) return {};
  const dx = n(ep2.x) - n(ep1.x);
  const dy = n(ep2.y) - n(ep1.y);
  const dz = n(ep2.z) - n(ep1.z);
  const axis = (delta, pos, neg) => Math.abs(delta) < 1e-6 ? '' : (delta > 0 ? pos : neg);
  return {
    len1: Math.abs(dx) > 1e-6 ? fmtNum(dx, cfg) : '', axis1: axis(dx, 'EAST', 'WEST'),
    len2: Math.abs(dy) > 1e-6 ? fmtNum(dy, cfg) : '', axis2: axis(dy, 'NORTH', 'SOUTH'),
    len3: Math.abs(dz) > 1e-6 ? fmtNum(dz, cfg) : '', axis3: axis(dz, 'UP', 'DOWN'),
  };
}

function primaryLengthText(block, cfg) {
  const la = lengthAxis(block.ep1, block.ep2, cfg);
  return [
    la.len1 ? `${la.len1}MM ${la.axis1}` : '',
    la.len2 ? `${la.len2}MM ${la.axis2}` : '',
    la.len3 ? `${la.len3}MM ${la.axis3}` : '',
  ].filter(Boolean).join(' + ');
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
  return [
    'ISOGEN-FILES ISOGEN.FLS',
    'UNITS-BORE MM',
    'UNITS-CO-ORDS MM',
    'UNITS-WEIGHT KGS',
    'UNITS-BOLT-DIA MM',
    'UNITS-BOLT-LENGTH MM',
    `PIPELINE-REFERENCE ${pipelineRef}`,
    `${INDENT}PROJECT-IDENTIFIER P1`,
    `${INDENT}AREA A1`,
    ''
  ];
}

function emitCA(block, blockType, seq) {
  return emitCABlock(caFor(block), blockType, refFor(block), seq);
}

function emitPipe(block, seq, model, cfg) {
  if (!block.ep1 || !block.ep2) return [];
  const refNo = refFor(block);
  const lenText = primaryLengthText(block, cfg);
  const lines = [];
  lines.push(...emitMsgSq(['PIPE', refNo ? `RefNo:=${refNo}` : '', lenText ? `LENGTH=${lenText}` : '', `SeqNo:${seq}`], cfg));
  lines.push('PIPE');
  lines.push(`${INDENT}END-POINT    ${fmtCoord(block.ep1, block.bore, cfg)}`);
  lines.push(`${INDENT}END-POINT    ${fmtCoord(block.ep2, block.bore, cfg)}`);
  if (model?.pipelineRef) lines.push(`${INDENT}PIPELINE-REFERENCE ${cleanText(model.pipelineRef)}`);
  lines.push(...emitSkey(block));
  lines.push(...emitCA(block, 'PIPE', seq));
  lines.push('');
  return lines;
}

function emitFlange(block, seq, cfg) {
  if (!block.ep1 || !block.ep2) return [];
  const refNo = refFor(block);
  const lenText = firstLengthText(block, cfg);
  const lines = [];
  lines.push(...emitMsgSq(['FLANGE', lenText ? `LENGTH=${lenText}` : '', refNo ? `RefNo:=${refNo}` : '', `SeqNo:${seq}`], cfg));
  lines.push('FLANGE');
  lines.push(`${INDENT}END-POINT    ${fmtCoord(block.ep1, block.bore, cfg)}`);
  lines.push(`${INDENT}END-POINT    ${fmtCoord(block.ep2, block.bore, cfg)}`);
  lines.push(...emitSkey(block, block.rawType === 'FBLI' ? 'BLFL' : ''));
  lines.push(...emitCA(block, 'FLANGE', seq));
  lines.push('');
  return lines;
}

function emitBend(block, seq, cfg) {
  if (!block.ep1 || !block.ep2 || !block.cp) return [];
  const refNo = refFor(block);
  const lines = [];
  lines.push(...emitMsgSq(['BEND', refNo ? `RefNo:=${refNo}` : '', `SeqNo:${seq}`], cfg));
  lines.push('BEND');
  lines.push(`${INDENT}END-POINT    ${fmtCoord(block.ep1, block.bore, cfg)}`);
  lines.push(`${INDENT}END-POINT    ${fmtCoord(block.ep2, block.bore, cfg)}`);
  lines.push(`${INDENT}CENTRE-POINT  ${fmtCoord(block.cp, block.bore, cfg)}`);
  lines.push(...emitSkey(block));
  lines.push(`${INDENT}ANGLE ${fmtNum(block.angleDeg ?? 90, cfg)}`);
  if (block.radius || block.bendRadius) lines.push(`${INDENT}BEND-RADIUS ${fmtNum(block.radius || block.bendRadius, cfg)}`);
  lines.push(...emitCA(block, 'BEND', seq));
  lines.push('');
  return lines;
}

function emitTee(block, seq, cfg) {
  if (!block.ep1 || !block.ep2 || !block.cp || !block.bp) return [];
  const refNo = refFor(block);
  const brlen = block.brlen ?? block.branchLength ?? '';
  const lines = [];
  lines.push(...emitMsgSq(['TEE', brlen !== '' ? `LENGTH=${brlen}MM` : '', refNo ? `RefNo:=${refNo}` : '', `SeqNo:${seq}`, brlen !== '' ? `BrLen=${brlen}MM` : ''], cfg));
  lines.push('TEE');
  lines.push(`${INDENT}END-POINT    ${fmtCoord(block.ep1, block.bore, cfg)}`);
  lines.push(`${INDENT}END-POINT    ${fmtCoord(block.ep2, block.bore, cfg)}`);
  lines.push(`${INDENT}CENTRE-POINT  ${fmtCoord(block.cp, block.bore, cfg)}`);
  lines.push(`${INDENT}BRANCH1-POINT ${fmtCoord(block.bp, block.branchBore || block.bore, cfg)}`);
  lines.push(...emitSkey(block));
  lines.push(...emitCA(block, 'TEE', seq));
  lines.push('');
  return lines;
}

function emitOlet(block, seq, cfg) {
  if (!block.cp || !block.bp) return [];
  const refNo = refFor(block);
  const brlen = block.brlen ?? block.branchLength ?? '';
  const lines = [];
  lines.push(...emitMsgSq(['OLET', brlen !== '' ? `BrLen=${brlen}MM` : '', refNo ? `RefNo:=${refNo}` : '', `SeqNo:${seq}`], cfg));
  lines.push('OLET');
  lines.push(`${INDENT}CENTRE-POINT  ${fmtCoord(block.cp, block.bore, cfg)}`);
  lines.push(`${INDENT}BRANCH1-POINT ${fmtCoord(block.bp, block.branchBore || 50, cfg)}`);
  lines.push(...emitSkey(block));
  lines.push(...emitCA(block, 'OLET', seq));
  lines.push('');
  return lines;
}

function emitValve(block, seq, cfg) {
  if (!block.ep1 || !block.ep2) return [];
  const refNo = refFor(block);
  const lenText = firstLengthText(block, cfg);
  const lines = [];
  lines.push(...emitMsgSq(['VALVE', lenText ? `LENGTH=${lenText}` : '', refNo ? `RefNo:=${refNo}` : '', `SeqNo:${seq}`], cfg));
  lines.push('VALVE');
  lines.push(`${INDENT}END-POINT    ${fmtCoord(block.ep1, block.bore, cfg)}`);
  lines.push(`${INDENT}END-POINT    ${fmtCoord(block.ep2, block.bore, cfg)}`);
  lines.push(...emitSkey(block));
  lines.push(...emitCA(block, 'VALVE', seq));
  lines.push('');
  return lines;
}

function emitReducer(block, seq, cfg) {
  if (!block.ep1 || !block.ep2) return [];
  const refNo = refFor(block);
  const lenText = firstLengthText(block, cfg);
  const lines = [];
  lines.push(...emitMsgSq([block.type, lenText ? `LENGTH=${lenText}` : '', refNo ? `RefNo:=${refNo}` : '', `SeqNo:${seq}`], cfg));
  lines.push(block.type);
  lines.push(`${INDENT}END-POINT    ${fmtCoord(block.ep1, block.bore, cfg)}`);
  lines.push(`${INDENT}END-POINT    ${fmtCoord(block.ep2, block.branchBore || block.bore, cfg)}`);
  lines.push(...emitSkey(block, block.type === 'REDUCER-ECCENTRIC' ? 'REBW' : 'RCBW'));
  lines.push(...emitCA(block, block.type, seq));
  lines.push('');
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
  if (!block || block.skipReason) return [];
  if (NON_EMIT_TYPES.has(block.rawType) || NON_EMIT_TYPES.has(block.type)) return [];
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

export function emitPcfModel(model, cfg = {}) {
  const eol = cfg?.windowsLineEndings === false ? '\n' : '\r\n';
  const lines = buildHeader(model, cfg);
  const emittedBlocks = [];
  let seq = 0;

  for (const block of model?.blocks || []) {
    if (block?.skipReason) continue;
    const previewLines = emitBlock(block, seq + 1, model, cfg);
    if (!previewLines.length) continue;
    seq += 1;
    block.emitSeq = seq;
    const blockLines = emitBlock(block, seq, model, cfg);
    lines.push(...blockLines);
    emittedBlocks.push({
      id: block.id,
      type: block.type,
      rawType: block.rawType,
      refNo: block.refNo,
      seqNo: seq,
      sourceKind: block.sourceKind,
    });
  }

  return {
    pcfText: lines.join(eol),
    emittedBlocks,
    meta: {
      engine: 'common',
      emittedBy: 'pcf-model-emitter',
      lineCount: lines.length,
      blockCount: emittedBlocks.length,
    }
  };
}
