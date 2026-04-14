/**
 * rc-stage4-emitter.js — Stage 4: Connection map + Component list → Isometric PCF
 * Takes Stage 1 component order + Stage 3 injected pipes → full PCF
 * 100% independent — only imports from rc-config.js
 */

import { getRayConfig, fmtNum, computeLenAxis, vecSub, vecMag } from './rc-config.js';
import { emitCABlock } from '../pcf-engine/pcf-block-schema.js';

/** Build the ca sub-object { '1': val, ..., '10': val } from comp.ca1..comp.ca10 */
function buildCompCa(comp) {
  if (comp.weight != null && comp.weight !== '' && (comp.ca8 == null || comp.ca8 === '')) {
    comp.ca8 = comp.weight;
  }
  const ca = {};
  for (let i = 1; i <= 10; i++) {
    const val = comp[`ca${i}`];
    if (val != null && val !== '') ca[String(i)] = val;
  }
  return ca;
}

// ── PCF line helpers ──────────────────────────────────────────────────────────

function pad(n) { return ' '.repeat(n); }

function fmtCoord(pt, bore, cfg) {
  const p = cfg.decimalPrecision;
  return [
    Number(pt.x).toFixed(p), Number(pt.y).toFixed(p),
    Number(pt.z).toFixed(p), Number(bore).toFixed(p)
  ].join(' ');
}

function emitMsgSq(parts) {
  return ['MESSAGE-SQUARE', `${pad(4)}${parts.join(', ')}`];
}

/** Strip '=' characters from attribute values to prevent PCF syntax corruption */
function sanitizeAttrValue(val) {
  return String(val ?? '').replace(/=/g, '').trim();
}

function emitSkeyLine(comp) {
  const skey = sanitizeAttrValue(comp?.skey);
  return skey ? [`${pad(4)}<SKEY> ${skey}`] : [];
}

function emitCAFor(comp, blockType, seqNo, refNoOverride = null) {
  const refNo = comp?.ca97 || refNoOverride || comp?.refNo || null;
  return emitCABlock(buildCompCa(comp), blockType, refNo, seqNo);
}

// ── Component PCF emitters ────────────────────────────────────────────────────

function emitPipe(comp, pipelineRef, seqNo, cfg, refNoOverride = null) {
  const ep1 = comp.ep1;
  const ep2 = comp.ep2;
  const bore = comp.bore;
  const refNo = comp?.ca97 || refNoOverride || comp?.refNo || null;
  const la  = computeLenAxis(ep1, ep2, cfg);
  const lines = [];
  // MESSAGE-SQUARE
  const lenStr = [
    la.len1 ? `${la.len1}MM ${la.axis1}` : null,
    la.len2 ? `${la.len2}MM ${la.axis2}` : null,
    la.len3 ? `${la.len3}MM ${la.axis3}` : null
  ].filter(Boolean).join(' + ');
  lines.push(...emitMsgSq([
    'PIPE',
    ...(refNo ? [`RefNo:=${refNo}`] : []),
    ...(lenStr ? [`LENGTH=${lenStr}`] : []),
    `SeqNo:${seqNo}`
  ]));
  lines.push('PIPE');
  lines.push(`${pad(4)}END-POINT    ${fmtCoord(ep1, bore, cfg)}`);
  lines.push(`${pad(4)}END-POINT    ${fmtCoord(ep2, bore, cfg)}`);
  if (pipelineRef) lines.push(`${pad(4)}PIPELINE-REFERENCE ${pipelineRef}`);
  lines.push(...emitSkeyLine(comp));
  lines.push(...emitCAFor(comp, 'PIPE', seqNo, refNo));
  lines.push('');
  return lines;
}

function emitFlange(comp, seqNo, cfg) {
  const lines = [];
  const la = comp.lenAxis || {};
  const lenStr = [la.len1, la.axis1, la.len2, la.axis2, la.len3, la.axis3]
    .filter(Boolean).join(' ');
  lines.push(...emitMsgSq([
    'FLANGE',
    ...(lenStr ? [`LENGTH=${la.len3 || la.len1 || la.len2}MM ${la.axis3 || la.axis1 || la.axis2}`] : []),
    `RefNo:=${comp.refNo}`,
    `SeqNo:${seqNo}`
  ]));
  lines.push('FLANGE');
  lines.push(`${pad(4)}END-POINT    ${fmtCoord(comp.ep1, comp.bore, cfg)}`);
  lines.push(`${pad(4)}END-POINT    ${fmtCoord(comp.ep2, comp.bore, cfg)}`);
  lines.push(...emitSkeyLine(comp));
  lines.push(...emitCAFor(comp, 'FLANGE', seqNo));
  lines.push('');
  return lines;
}

function emitBend(comp, seqNo, cfg) {
  const lines = [];
  const la = comp.lenAxis || {};
  lines.push(...emitMsgSq([
    'BEND',
    `RefNo:=${comp.refNo}`,
    `SeqNo:${seqNo}`
  ]));
  lines.push('BEND');
  lines.push(`${pad(4)}END-POINT    ${fmtCoord(comp.ep1, comp.bore, cfg)}`);
  lines.push(`${pad(4)}END-POINT    ${fmtCoord(comp.ep2, comp.bore, cfg)}`);
  lines.push(`${pad(4)}CENTRE-POINT  ${fmtCoord(comp.cp,  comp.bore, cfg)}`);
  lines.push(`${pad(4)}<SKEY> ${sanitizeAttrValue(comp.skey)}`);
  if (comp.radius) lines.push(`${pad(4)}ANGLE 90.0000`);
  lines.push(...emitCAFor(comp, 'BEND', seqNo));
  lines.push('');
  return lines;
}

function emitTee(comp, seqNo, cfg) {
  const lines = [];
  lines.push(...emitMsgSq([
    'TEE',
    `LENGTH=${comp.brlen}MM`,
    `RefNo:=${comp.refNo}`,
    `SeqNo:${seqNo}`,
    `BrLen=${comp.brlen}MM`
  ]));
  lines.push('TEE');
  lines.push(`${pad(4)}END-POINT    ${fmtCoord(comp.ep1, comp.bore, cfg)}`);
  lines.push(`${pad(4)}END-POINT    ${fmtCoord(comp.ep2, comp.bore, cfg)}`);
  lines.push(`${pad(4)}CENTRE-POINT  ${fmtCoord(comp.cp, comp.bore, cfg)}`);
  lines.push(`${pad(4)}BRANCH1-POINT ${fmtCoord(comp.bp, Number(comp.branchBore || comp.bore), cfg)}`);
  lines.push(...emitSkeyLine(comp));
  lines.push(...emitCAFor(comp, 'TEE', seqNo));
  lines.push('');
  return lines;
}

function emitOlet(comp, seqNo, cfg) {
  const lines = [];
  lines.push(...emitMsgSq([
    'OLET',
    `BrLen=${comp.brlen}MM`,
    `RefNo:=${comp.refNo}`,
    `SeqNo:${seqNo}`
  ]));
  lines.push('OLET');
  lines.push(`${pad(4)}CENTRE-POINT  ${fmtCoord(comp.cp, comp.bore, cfg)}`);
  lines.push(`${pad(4)}BRANCH1-POINT ${fmtCoord(comp.bp, Number(comp.branchBore || 50), cfg)}`);
  lines.push(...emitSkeyLine(comp));
  lines.push(...emitCAFor(comp, 'OLET', seqNo));
  lines.push('');
  return lines;
}

function emitValve(comp, seqNo, cfg) {
  const lines = [];
  const la = comp.lenAxis || {};
  const lenV = la.len1 || la.len2 || la.len3 || '';
  const axV  = la.axis1 || la.axis2 || la.axis3 || '';
  lines.push(...emitMsgSq([
    'VALVE',
    ...(lenV ? [`LENGTH=${lenV}MM ${axV}`] : []),
    `RefNo:=${comp.refNo}`,
    `SeqNo:${seqNo}`
  ]));
  lines.push('VALVE');
  lines.push(`${pad(4)}END-POINT    ${fmtCoord(comp.ep1, comp.bore, cfg)}`);
  lines.push(`${pad(4)}END-POINT    ${fmtCoord(comp.ep2, comp.bore, cfg)}`);
  lines.push(...emitSkeyLine(comp));
  lines.push(...emitCAFor(comp, 'VALVE', seqNo));
  lines.push('');
  return lines;
}

function emitSupport(comp, seqNo, cfg) {
  const lines = [];
  const guidFull = comp.supportGuid || '';
  const guidOut  = guidFull.startsWith('UCI:') ? guidFull : (guidFull ? `UCI:${guidFull}` : '');
  // Bore is always 0.0000 for SUPPORT blocks per spec §12
  const bore     = 0;
  const supName  = comp.supportName || cfg.supportMapping.fallbackName || cfg.supportDefaultCoor || 'CA150';
  // MESSAGE-SQUARE: SUPPORT, RefNo:=<RefNo>, SeqNo:<SeqNo>, <SupportName>, <GUID>
  lines.push('MESSAGE-SQUARE');
  lines.push(`${pad(4)}SUPPORT, RefNo:=${comp.refNo || ''}, SeqNo:${seqNo}, ${supName}, ${guidOut}`);
  lines.push('SUPPORT');
  // CO-ORDS: use coordinate point when available, otherwise fall back to supportDefaultCoor name
  if (comp.supportCoor && typeof comp.supportCoor === 'object') {
    lines.push(`${pad(4)}CO-ORDS    ${fmtCoord(comp.supportCoor, bore, cfg)}`);
  } else {
    // No coordinates — emit fallback name as CO-ORDS placeholder (spec §12 allows this)
    const fallbackCoor = cfg.supportDefaultCoor || 'CA150';
    lines.push(`${pad(4)}CO-ORDS    ${fallbackCoor}`);
  }
  lines.push(`${pad(4)}<SUPPORT_NAME>    ${supName}`);
  if (guidOut) lines.push(`${pad(4)}<SUPPORT_GUID>    ${guidOut}`);
  // CA1-CA10 intentionally omitted per spec §12 (no CA attributes on SUPPORT)
  lines.push('');
  return lines;
}

// B3: Reducer emitter — maps REDU → REDUCER-CONCENTRIC PCF block
function emitReducer(comp, seqNo, cfg) {
  const lines = [];
  const la = comp.lenAxis || {};
  const lenV = la.len1 || la.len2 || la.len3 || '';
  const axV  = la.axis1 || la.axis2 || la.axis3 || '';
  lines.push(...emitMsgSq([
    'REDUCER-CONCENTRIC',
    ...(lenV ? [`LENGTH=${lenV}MM ${axV}`] : []),
    `RefNo:=${comp.refNo}`,
    `SeqNo:${seqNo}`
  ]));
  lines.push('REDUCER-CONCENTRIC');
  lines.push(`${pad(4)}END-POINT    ${fmtCoord(comp.ep1, comp.bore, cfg)}`);
  lines.push(`${pad(4)}END-POINT    ${fmtCoord(comp.ep2, comp.bore, cfg)}`);
  lines.push(...emitSkeyLine({ ...comp, skey: comp.skey || 'RCBW' }));
  lines.push(...emitCAFor(comp, 'REDUCER-CONCENTRIC', seqNo));
  lines.push('');
  return lines;
}

// B3: Blind Flange emitter — maps FBLI → FLANGE PCF block with blind SKEY
function emitBlindFlange(comp, seqNo, cfg) {
  const lines = [];
  const la = comp.lenAxis || {};
  const lenV = la.len1 || la.len2 || la.len3 || '';
  const axV  = la.axis1 || la.axis2 || la.axis3 || '';
  lines.push(...emitMsgSq([
    'FLANGE',
    ...(lenV ? [`LENGTH=${lenV}MM ${axV}`] : []),
    `RefNo:=${comp.refNo}`,
    `SeqNo:${seqNo}`
  ]));
  lines.push('FLANGE');
  lines.push(`${pad(4)}END-POINT    ${fmtCoord(comp.ep1, comp.bore, cfg)}`);
  lines.push(`${pad(4)}END-POINT    ${fmtCoord(comp.ep2, comp.bore, cfg)}`);
  lines.push(...emitSkeyLine({ ...comp, skey: comp.skey || 'BLFL' }));
  lines.push(...emitCAFor(comp, 'FLANGE', seqNo));
  lines.push('');
  return lines;
}

// Non-fitting types that must be suppressed from the isometric PCF output.
// GASK/PCOM/MISC/WELD/ATTA/INST are dropped from ray-engine faces (stage3)
// and must also be skipped here so they never appear in the PCF text.
const NON_FITTING_EMIT = new Set(['GASK', 'PCOM', 'MISC', 'WELD', 'ATTA', 'INST']);

// B4: Fixed bridge matching — match only when BOTH ep1 AND ep2 are close
// to the original pipe's ep1 and ep2 (bidirectional pair check).
// The old code matched on comp.ep2 ≈ bridge.ep1 which caused wrong assignments.
function findBridgeForPipe(comp, injected, usedIdx, cfg) {
  const tol = cfg.minBoreTol;
  if (!comp.ep1 || !comp.ep2) return null;

  let bestScore = Infinity;
  let bestIdx   = -1;

  for (let i = 0; i < injected.length; i++) {
    if (usedIdx.has(i)) continue;
    const b = injected[i];

    // Forward match: bridge ep1→ep2 aligns with pipe ep1→ep2
    const d1fwd = vecMag(vecSub(b.ep1, comp.ep1));
    const d2fwd = vecMag(vecSub(b.ep2, comp.ep2));
    const fwdScore = d1fwd + d2fwd;

    // Reverse match: bridge ep2→ep1 aligns with pipe ep1→ep2
    const d1rev = vecMag(vecSub(b.ep2, comp.ep1));
    const d2rev = vecMag(vecSub(b.ep1, comp.ep2));
    const revScore = d1rev + d2rev;

    const score = Math.min(fwdScore, revScore);
    // Both endpoints must be within tolerance (not just one)
    const minD = Math.min(
      Math.max(d1fwd, d2fwd),
      Math.max(d1rev, d2rev)
    );

    if (minD < tol && score < bestScore) {
      bestScore = score;
      bestIdx   = i;
    }
  }

  if (bestIdx >= 0) {
    usedIdx.add(bestIdx);
    return injected[bestIdx];
  }
  return null;
}

// ── PCF header ────────────────────────────────────────────────────────────────

function buildHeader(pipelineRef, cfg) {
  return [
    'ISOGEN-FILES ISOGEN.FLS',
    'UNITS-BORE MM',
    'UNITS-CO-ORDS MM',
    'UNITS-WEIGHT KGS',
    'UNITS-BOLT-DIA MM',
    'UNITS-BOLT-LENGTH MM',
    `PIPELINE-REFERENCE ${pipelineRef}`,
    '    PROJECT-IDENTIFIER P1',
    '    AREA A1',
    ''
  ];
}

// ── Support-on-bridge projection helper ────────────────────────────────
// Projects each SUPPORT cp onto ep1→ep2 segment.
// Returns sorted array of { comp, t, snapPt } for supports that lie ON the segment.
function supportsOnBridge(br, supportComps, cfg) {
  const seg    = vecSub(br.ep2, br.ep1);
  const segLen = vecMag(seg);
  if (segLen < 1e-6) return [];
  const sd = { x: seg.x / segLen, y: seg.y / segLen, z: seg.z / segLen };
  // Use a generous tolerance for support projection — supports should lie exactly
  // on the pipe centerline (perpDist ≈ 0) so any reasonable tolerance works.
  // Using max(bore*0.5, 1000mm) to handle any minor coordinate drift.
  const tol = Math.max(
    (br.bore || 0) * (cfg.boreTolMultiplier || 0.5),
    (cfg.minBoreTol || 25),
    1000   // generous floor — supports are always on centerline
  );

  const hits = [];
  for (const sp of supportComps) {
    if (!sp.cp) continue;
    const tv = vecSub(sp.cp, br.ep1);
    const t  = tv.x * sd.x + tv.y * sd.y + tv.z * sd.z;
    if (t <= 0 || t >= segLen) continue;
    const snap = { x: br.ep1.x + sd.x * t, y: br.ep1.y + sd.y * t, z: br.ep1.z + sd.z * t };
    const perpDist = vecMag(vecSub(sp.cp, snap));
    // Debug trace — remove after verified
    console.log('[supportsOnBridge]', sp.refNo, 't=', t.toFixed(1), 'perp=', perpDist.toFixed(3), 'tol=', tol);
    if (perpDist <= tol) {
      hits.push({ comp: sp, t, snap });
    }
  }
  hits.sort((a, b) => a.t - b.t);
  return hits;
}

// ── Main Stage 4 function ─────────────────────────────────────────────────────

/**
 * @param {object[]} components   — Stage 1 ordered list (includes PIPEs)
 * @param {object[]} injectedPipes — Stage 3 bridges
 * @param {string}   pipelineRef
 * @param {function} logFn
 * @returns {{ pcfText: string }}
 */
/** Scale a single point object by 1/divisor */
function scalePoint(pt, divisor) {
  if (!pt || typeof pt !== 'object') return pt;
  return { x: pt.x / divisor, y: pt.y / divisor, z: pt.z / divisor };
}

/** Scale all coordinate fields of a component by 1/divisor */
function scaleComponent(comp, divisor) {
  return {
    ...comp,
    ep1: scalePoint(comp.ep1, divisor),
    ep2: scalePoint(comp.ep2, divisor),
    cp:  scalePoint(comp.cp,  divisor),
    bp:  scalePoint(comp.bp,  divisor),
    supportCoor: (comp.supportCoor && typeof comp.supportCoor === 'object')
      ? scalePoint(comp.supportCoor, divisor) : comp.supportCoor,
  };
}

/** Show a non-blocking notification about coordinate scaling */
function showCoordScaleNotification() {
  try {
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;background:#f59e0b;color:#1c1917;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.3)';
    banner.textContent = '⚠ Coordinates divided by 1000 (overflow guard)';
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 6000);
  } catch (_) { /* non-browser environment — ignore */ }
}

export function runStage4(components, injectedPipes, pipelineRef, logFn = () => {}) {
  const cfg = getRayConfig();
  const eol = cfg.windowsLineEndings ? '\r\n' : '\n';
  const maxCoord = cfg.maxEpCoordValue || 999999999;

  // Coordinate overflow guard: if any coordinate exceeds threshold, divide all by 1000
  const allComps = [...components, ...injectedPipes];
  const hasOverflow = allComps.some(c =>
    [c.ep1, c.ep2, c.cp, c.bp, c.supportCoor].some(pt =>
      pt && typeof pt === 'object' &&
      (Math.abs(pt.x || 0) > maxCoord || Math.abs(pt.y || 0) > maxCoord || Math.abs(pt.z || 0) > maxCoord)
    )
  );
  if (hasOverflow) {
    components    = components.map(c => scaleComponent(c, 1000));
    injectedPipes = injectedPipes.map(c => scaleComponent(c, 1000));
    showCoordScaleNotification();
    logFn('S4', 'coord-scale-applied', '', { divisor: 1000 });
  }

  const outputLines = buildHeader(pipelineRef, cfg);
  let seqCtr = 0;

  // Collect SUPPORT components for inline split detection
  const supportComps = components.filter(c => c.type === 'SUPPORT');
  // Track supports emitted inline inside a bridge split (skip in main loop)
  const inlineEmittedSupports = new Set();

  // ── Emit a bridge with support splitting ─────────────────────────────────
  // Bridge pipe naming rule:
  //   Each pipe segment ending AT a support → support.refNo + "_bridged"  (EP2 rule)
  //   Tail segment (no support at EP2) / no-support bridge → fromRefNo + "_bridged" (EP1 fallback)
  function emitBridgeSplit(br, fromRefNo) {
    const hits      = supportsOnBridge(br, supportComps, cfg);
    const ep1RefNo  = fromRefNo ? `${fromRefNo}_bridged` : null;  // EP1 fallback

    if (hits.length === 0) {
      // No supports on bridge — use EP1 fallback name
      seqCtr++;
      logFn('S4', 'bridge-pipe-emitted', fromRefNo,
        { ep1: br.ep1, ep2: br.ep2, bore: br.bore, to: br.toRefNo, refNo: ep1RefNo });
      outputLines.push(...emitPipe({ ...br, refNo: ep1RefNo }, pipelineRef, seqCtr, cfg, ep1RefNo));
      return;
    }

    // Split: cursor → S1.snap → S2.snap → ... → ep2
    let cursor = br.ep1;
    for (const hit of hits) {
      // Pipe segment whose EP2 lands on this support → named after support (EP2 rule)
      seqCtr++;
      const segRefNo = `${hit.comp.refNo}_bridged`;
      logFn('S4', 'bridge-split-pipe', fromRefNo,
        { ep1: cursor, ep2: hit.snap, bore: br.bore, toSupport: hit.comp.refNo, refNo: segRefNo });
      outputLines.push(...emitPipe({ ...br, ep1: cursor, ep2: hit.snap, refNo: segRefNo }, pipelineRef, seqCtr, cfg, segRefNo));
      // Inline support block
      seqCtr++;
      logFn('S4', 'support-inline-emitted', hit.comp.refNo, {});
      outputLines.push(...emitSupport(hit.comp, seqCtr, cfg));
      inlineEmittedSupports.add(hit.comp.refNo);
      cursor = hit.snap;
    }
    // Tail segment: EP2 is a fitting (no support) → EP1 fallback name
    seqCtr++;
    logFn('S4', 'bridge-split-tail', fromRefNo,
      { ep1: cursor, ep2: br.ep2, bore: br.bore, refNo: ep1RefNo });
    outputLines.push(...emitPipe({ ...br, ep1: cursor, ep2: br.ep2, refNo: ep1RefNo }, pipelineRef, seqCtr, cfg, ep1RefNo));
  }

  // ── Build bridge lookup by source component (fromRefNo) ──────────────────
  // Each bridge is emitted AFTER the fitting it originates from.
  // This replaces the broken findBridgeForPipe approach which tried to match
  // bridge coords to original PIPE ep1/ep2 (which span full pipe sections,
  // not just fitting-to-fitting gaps).
  const bridgesByFrom = new Map();
  for (const br of injectedPipes) {
    const key = br.fromRefNo || '__unkeyed';
    if (!bridgesByFrom.has(key)) bridgesByFrom.set(key, []);
    bridgesByFrom.get(key).push(br);
  }
  const emittedBridgeSet = new Set();

  function emitBridgesFrom(refNo) {
    const list = bridgesByFrom.get(refNo) || [];
    for (const br of list) {
      const bKey = `${br.ep1.x}_${br.ep1.y}_${br.ep1.z}__${br.ep2.x}_${br.ep2.y}_${br.ep2.z}`;
      if (emittedBridgeSet.has(bKey)) continue;
      emittedBridgeSet.add(bKey);
      emitBridgeSplit(br, refNo);
    }
  }

  // ── Walk S1 component list ────────────────────────────────────────────────
  for (const comp of components) {

    // Skip original PIPE/BRAN segments — their geometry is replaced by bridges.
    // Emit bridges after the fitting they originate from instead.
    if (comp.type === 'PIPE') {
      logFn('S4', 'pipe-skipped', comp.refNo, {});
      continue;
    }

    // Skip non-fitting passthrough types — dropped from ray engine and must
    // not appear in the PCF output (no seqNo consumed either).
    if (NON_FITTING_EMIT.has(comp.type)) {
      logFn('S4', 'non-fitting-skipped', comp.refNo, { type: comp.type });
      continue;
    }

    if (comp.type === 'SUPPORT') {
      // Skip if already emitted inline within a bridge split
      if (inlineEmittedSupports.has(comp.refNo)) {
        logFn('S4', 'support-inline-skip', comp.refNo, {});
        continue;
      }
      seqCtr++;
      logFn('S4', 'support-emitted', comp.refNo, {});
      outputLines.push(...emitSupport(comp, seqCtr, cfg));
      continue;
    }

    // Emit the fitting component
    seqCtr++;
    const seq = seqCtr;

    switch (comp.type) {
      case 'FLANGE': outputLines.push(...emitFlange(comp, seq, cfg));      break;
      case 'FBLI':   outputLines.push(...emitBlindFlange(comp, seq, cfg)); break;
      case 'BEND':   outputLines.push(...emitBend(comp, seq, cfg));        break;
      case 'TEE':    outputLines.push(...emitTee(comp, seq, cfg));         break;
      case 'OLET':   outputLines.push(...emitOlet(comp, seq, cfg));        break;
      case 'VALVE':  outputLines.push(...emitValve(comp, seq, cfg));       break;
      case 'REDU':   outputLines.push(...emitReducer(comp, seq, cfg));     break;
      default:
        logFn('S4', 'unknown-type', comp.refNo, { type: comp.type });
    }

    logFn('S4', 'component-emitted', comp.refNo, { type: comp.type, seq });

    // Emit any bridge pipes that originate from this component
    emitBridgesFrom(comp.refNo);
  }

  // Safety net: emit any bridges whose fromRefNo wasn't found in S1 component list
  // (e.g., bridges from OLET.bp or TEE.bp which have no separate S1 PIPE slot)
  for (const [key, list] of bridgesByFrom) {
    if (key === '__unkeyed') {
      for (const br of list) {
        const bKey = `${br.ep1.x}_${br.ep1.y}_${br.ep1.z}__${br.ep2.x}_${br.ep2.y}_${br.ep2.z}`;
        if (emittedBridgeSet.has(bKey)) continue;
        emittedBridgeSet.add(bKey);
        emitBridgeSplit(br, '');
      }
    }
  }

  const pcfText = outputLines.join(eol);
  return { pcfText };
}
