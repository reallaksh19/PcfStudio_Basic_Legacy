/**
 * pcf-model-emitter.js — Common PCF Builder Phase 2 text emitter
 *
 * Emits PCF text from the canonical model created by common-pcf-builder.js.
 * This file is intentionally independent from rc-stage4-emitter.js so that the
 * Common Builder becomes a true downstream emitter instead of a legacy delegate.
 */

import { emitCABlock } from './pcf-block-schema.js';

const INDENT = '    ';
const NON_EMIT_SOURCE_COMPONENT_PIPE = 'original-pipe-replaced-by-bridges';

function clean(v) {
  return String(v ?? '').replace(/=/g, '').trim();
}

function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function fixed(v, cfg) {
  const p = Number.isInteger(cfg?.decimalPrecision) ? cfg.decimalPrecision : 4;
  return Number(v).toFixed(p);
}

function coordLine(pt, bore, cfg) {
  return `${fixed(pt?.x ?? 0, cfg)} ${fixed(pt?.y ?? 0, cfg)} ${fixed(pt?.z ?? 0, cfg)} ${fixed(bore ?? 0, cfg)}`;
}

function lengthAxis(ep1, ep2, cfg) {
  if (!ep1 || !ep2) return {};
  const dx = n(ep2.x) - n(ep1.x);
  const dy = n(ep2.y) - n(ep1.y);
  const dz = n(ep2.z) - n(ep1.z);
  const axisLabel = (delta, pos, neg) => Math.abs(delta) < 1e-6 ? '' : (delta > 0 ? pos : neg);
  return {
    len1: Math.abs(dx) > 1e-6 ? fixed(Math.abs(dx), cfg) : '',
    axis1: axisLabel(dx, 'EAST', 'WEST'),
    len2: Math.abs(dy) > 1e-6 ? fixed(Math.abs(dy), cfg) : '',
    axis2: axisLabel(dy, 'NORTH', 'SOUTH'),
    len3: Math.abs(dz) > 1e-6 ? fixed(Math.abs(dz), cfg) : '',
    axis3: axisLabel(dz, 'UP', 'DOWN'),
  };
}

function dominantLengthText(ep1, ep2, cfg) {
  const la = lengthAxis(ep1, ep2, cfg);
  const parts = [
    la.len1 ? `${la.len1}MM ${la.axis1}` : '',
    la.len2 ? `${la.len2}MM ${la.axis2}` : '',
    la.len3 ? `${la.len3}MM ${la.axis3}` : '',
  ].filter(Boolean);
  return parts.join(' + ');
}

function primaryLengthText(ep1, ep2, cfg) {
  const la = lengthAxis(ep1, ep2, cfg);
  if (la.len1) return `${la.len1}MM ${la.axis1}`;
  if (la.len2) return `${la.len2}MM ${la.axis2}`;
  if (la.len3) return `${la.len3}MM ${la.axis3}`;
  return '';
}

function msg(lines, parts, enabled = true) {
  if (!enabled) return;
  lines.push('MESSAGE-SQUARE');
  lines.push(`${INDENT}${parts.filter(Boolean).join(', ')}`);
}

function skeyLines(block) {
  const skey = clean(block?.skey);
  return skey ? [`${INDENT}<SKEY> ${skey}`] : [];
}

function caLines(block, blockType, seqNo) {
  return emitCABlock(block?.ca || {}, blockType, block?.refNo || null, seqNo);
}

function ensureSeq(state, block) {
  state.seq += 1;
  return block?.seqOverride || state.seq;
}

function emitHeader(model, cfg) {
  return [
    'ISOGEN-FILES ISOGEN.FLS',
    'UNITS-BORE MM',
    'UNITS-CO-ORDS MM',
    'UNITS-WEIGHT KGS',
    'UNITS-BOLT-DIA MM',
    'UNITS-BOLT-LENGTH MM',
    `PIPELINE-REFERENCE ${clean(model?.pipelineRef)}`,
    '    PROJECT-IDENTIFIER P1',
    '    AREA A1',
    ''
  ];
}

function emitPipe(block, state, cfg, out, options = {}) {
  if (!block?.ep1 || !block?.ep2) {
    state.diagnostics.errors.push({ id: 'EMIT-PIPE-001', type: 'PIPE', message: 'PIPE skipped: missing endpoint geometry', refNo: block?.refNo || '' });
    return;
  }
  const seq = ensureSeq(state, block);
  const ref = clean(options.refNoOverride || block.refNo);
  const len = dominantLengthText(block.ep1, block.ep2, cfg);
  msg(out, [
    'PIPE',
    ref ? `RefNo:=${ref}` : '',
    len ? `LENGTH=${len}` : '',
    `SeqNo:${seq}`
  ], cfg?.messageSquareEnabled !== false);
  out.push('PIPE');
  out.push(`${INDENT}END-POINT    ${coordLine(block.ep1, block.bore, cfg)}`);
  out.push(`${INDENT}END-POINT    ${coordLine(block.ep2, block.bore, cfg)}`);
  if (clean(state.pipelineRef)) out.push(`${INDENT}PIPELINE-REFERENCE ${clean(state.pipelineRef)}`);
  out.push(...skeyLines(block));
  out.push(...caLines({ ...block, refNo: ref }, 'PIPE', seq));
  out.push('');
}

function emitTwoPointBlock(block, state, cfg, out, blockType) {
  if (!block?.ep1 || !block?.ep2) {
    state.diagnostics.errors.push({ id: `EMIT-${blockType}-001`, type: blockType, message: `${blockType} skipped: missing endpoint geometry`, refNo: block?.refNo || '' });
    return;
  }
  const seq = ensureSeq(state, block);
  const len = primaryLengthText(block.ep1, block.ep2, cfg);
  msg(out, [
    blockType,
    len ? `LENGTH=${len}` : '',
    block.refNo ? `RefNo:=${clean(block.refNo)}` : '',
    `SeqNo:${seq}`
  ], cfg?.messageSquareEnabled !== false);
  out.push(blockType);
  out.push(`${INDENT}END-POINT    ${coordLine(block.ep1, block.bore, cfg)}`);
  out.push(`${INDENT}END-POINT    ${coordLine(block.ep2, block.bore, cfg)}`);
  out.push(...skeyLines(block));
  out.push(...caLines(block, blockType, seq));
  out.push('');
}

function emitBend(block, state, cfg, out) {
  if (!block?.ep1 || !block?.ep2 || !block?.cp) {
    state.diagnostics.errors.push({ id: 'EMIT-BEND-001', type: 'BEND', message: 'BEND skipped: missing EP1/EP2/CP geometry', refNo: block?.refNo || '' });
    return;
  }
  const seq = ensureSeq(state, block);
  msg(out, ['BEND', block.refNo ? `RefNo:=${clean(block.refNo)}` : '', `SeqNo:${seq}`], cfg?.messageSquareEnabled !== false);
  out.push('BEND');
  out.push(`${INDENT}END-POINT    ${coordLine(block.ep1, block.bore, cfg)}`);
  out.push(`${INDENT}END-POINT    ${coordLine(block.ep2, block.bore, cfg)}`);
  out.push(`${INDENT}CENTRE-POINT  ${coordLine(block.cp, block.bore, cfg)}`);
  out.push(...skeyLines(block));
  const angle = Number.isFinite(Number(block.angleDeg)) ? Number(block.angleDeg) : 90;
  out.push(`${INDENT}ANGLE ${fixed(angle, cfg)}`);
  if (block.radius || block.bendRadius) out.push(`${INDENT}BEND-RADIUS ${fixed(block.radius || block.bendRadius, cfg)}`);
  out.push(...caLines(block, 'BEND', seq));
  out.push('');
}

function emitTee(block, state, cfg, out) {
  if (!block?.ep1 || !block?.ep2 || !block?.cp || !block?.bp) {
    state.diagnostics.errors.push({ id: 'EMIT-TEE-001', type: 'TEE', message: 'TEE skipped: missing EP1/EP2/CP/BP geometry', refNo: block?.refNo || '' });
    return;
  }
  const seq = ensureSeq(state, block);
  const brLen = block.brlen || block.brLen || '';
  msg(out, [
    'TEE',
    brLen ? `LENGTH=${brLen}MM` : '',
    block.refNo ? `RefNo:=${clean(block.refNo)}` : '',
    `SeqNo:${seq}`,
    brLen ? `BrLen=${brLen}MM` : ''
  ], cfg?.messageSquareEnabled !== false);
  out.push('TEE');
  out.push(`${INDENT}END-POINT    ${coordLine(block.ep1, block.bore, cfg)}`);
  out.push(`${INDENT}END-POINT    ${coordLine(block.ep2, block.bore, cfg)}`);
  out.push(`${INDENT}CENTRE-POINT  ${coordLine(block.cp, block.bore, cfg)}`);
  out.push(`${INDENT}BRANCH1-POINT ${coordLine(block.bp, block.branchBore || block.bore, cfg)}`);
  out.push(...skeyLines(block));
  out.push(...caLines(block, 'TEE', seq));
  out.push('');
}

function emitOlet(block, state, cfg, out) {
  if (!block?.cp || !block?.bp) {
    state.diagnostics.errors.push({ id: 'EMIT-OLET-001', type: 'OLET', message: 'OLET skipped: missing CP/BP geometry', refNo: block?.refNo || '' });
    return;
  }
  const seq = ensureSeq(state, block);
  const brLen = block.brlen || block.brLen || '';
  msg(out, ['OLET', brLen ? `BrLen=${brLen}MM` : '', block.refNo ? `RefNo:=${clean(block.refNo)}` : '', `SeqNo:${seq}`], cfg?.messageSquareEnabled !== false);
  out.push('OLET');
  out.push(`${INDENT}CENTRE-POINT  ${coordLine(block.cp, block.bore, cfg)}`);
  out.push(`${INDENT}BRANCH1-POINT ${coordLine(block.bp, block.branchBore || 50, cfg)}`);
  out.push(...skeyLines(block));
  out.push(...caLines(block, 'OLET', seq));
  out.push('');
}

function emitSupport(block, state, cfg, out) {
  const seq = ensureSeq(state, block);
  const supName = clean(block.supportName || cfg?.supportMapping?.fallbackName || cfg?.supportDefaultCoor || 'CA150');
  const rawGuid = clean(block.supportGuid || '');
  const guid = rawGuid ? (rawGuid.startsWith('UCI:') ? rawGuid : `UCI:${rawGuid}`) : '';
  msg(out, ['SUPPORT', `RefNo:=${clean(block.refNo)}`, `SeqNo:${seq}`, supName, guid], cfg?.messageSquareEnabled !== false);
  out.push('SUPPORT');
  if (block.supportCoor) {
    out.push(`${INDENT}CO-ORDS    ${coordLine(block.supportCoor, 0, cfg)}`);
  } else if (block.cp) {
    out.push(`${INDENT}CO-ORDS    ${coordLine(block.cp, 0, cfg)}`);
  } else {
    out.push(`${INDENT}CO-ORDS    ${cfg?.supportDefaultCoor || 'CA150'}`);
  }
  out.push(`${INDENT}<SUPPORT_NAME>    ${supName}`);
  if (guid) out.push(`${INDENT}<SUPPORT_GUID>    ${guid}`);
  out.push('');
}

function emitBlock(block, state, cfg, out) {
  if (!block || block.skipReason) return;

  // Original Stage 1 PIPE rows represent source pipe sections. In the Ray flow,
  // Stage 3 bridge pipes are the emitted pipe geometry. Emitting both creates
  // duplicate pipe runs, so Common skips source component PIPE blocks and emits
  // bridge PIPE blocks.
  if (state.hasBridgePipes && block.sourceKind === 'component' && block.type === 'PIPE') {
    state.diagnostics.infos.push({ id: 'EMIT-PIPE-ORIGINAL-SKIP', type: 'PIPE', message: 'Original Stage 1 PIPE skipped; bridge pipes are emitted instead', refNo: block.refNo || '', reason: NON_EMIT_SOURCE_COMPONENT_PIPE });
    return;
  }

  switch (block.type) {
    case 'PIPE': emitPipe(block, state, cfg, out); break;
    case 'FLANGE': emitTwoPointBlock(block, state, cfg, out, 'FLANGE'); break;
    case 'VALVE': emitTwoPointBlock(block, state, cfg, out, 'VALVE'); break;
    case 'REDUCER-CONCENTRIC': emitTwoPointBlock(block, state, cfg, out, 'REDUCER-CONCENTRIC'); break;
    case 'REDUCER-ECCENTRIC': emitTwoPointBlock(block, state, cfg, out, 'REDUCER-ECCENTRIC'); break;
    case 'BEND': emitBend(block, state, cfg, out); break;
    case 'TEE': emitTee(block, state, cfg, out); break;
    case 'OLET': emitOlet(block, state, cfg, out); break;
    case 'SUPPORT': emitSupport(block, state, cfg, out); break;
    default:
      state.diagnostics.warnings.push({ id: 'EMIT-UNKNOWN-TYPE', type: block.type || 'UNKNOWN', message: `Unknown block type skipped: ${block.type || 'UNKNOWN'}`, refNo: block.refNo || '' });
  }
}

function buildEmissionOrder(model) {
  const componentBlocks = Array.isArray(model?.componentBlocks) ? model.componentBlocks : [];
  const bridgeBlocks = Array.isArray(model?.bridgeBlocks) ? model.bridgeBlocks : [];
  const bridgesByFrom = new Map();

  for (const br of bridgeBlocks) {
    const key = clean(br?.source?.fromRefNo || br?.fromRefNo || '');
    if (!bridgesByFrom.has(key)) bridgesByFrom.set(key, []);
    bridgesByFrom.get(key).push(br);
  }

  const out = [];
  const emittedBridgeIds = new Set();

  for (const c of componentBlocks) {
    out.push(c);
    const ref = clean(c.refNo || c.source?.originalRefNo || '');
    const list = bridgesByFrom.get(ref) || [];
    for (const br of list) {
      out.push(br);
      emittedBridgeIds.add(br.id);
    }
  }

  for (const br of bridgeBlocks) {
    if (!emittedBridgeIds.has(br.id)) out.push(br);
  }

  return out;
}

export function emitPcfModel(model, cfg = {}) {
  const lines = emitHeader(model, cfg);
  const ordered = buildEmissionOrder(model);
  const state = {
    seq: 0,
    pipelineRef: model?.pipelineRef || '',
    hasBridgePipes: ordered.some(block => block?.sourceKind === 'bridge' && block?.type === 'PIPE'),
    diagnostics: { errors: [], warnings: [], infos: [] },
  };

  for (const block of ordered) emitBlock(block, state, cfg, lines);

  const eol = cfg?.windowsLineEndings === false ? '\n' : '\r\n';
  const pcfText = lines.join(eol);

  return {
    pcfText,
    diagnostics: state.diagnostics,
    meta: {
      engine: 'common',
      emittedBy: 'pcf-model-emitter',
      blockCount: ordered.length,
      emittedSeqCount: state.seq,
      lineCount: pcfText ? pcfText.split(/\r?\n/).length : 0,
    }
  };
}
