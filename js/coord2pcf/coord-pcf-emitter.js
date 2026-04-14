/**
 * coord-pcf-emitter.js — Classified components → PCF text
 * Mirrors rc-stage4-emitter.js patterns. CRLF line endings per PCF §0.
 *
 * Exports:
 *   generatePCF(components, options) → { pcfText: string, stats: object }
 *
 * Options: { bore, pipelineRef, ca: {CA1..CA10}, decimalPrecision, windowsLineEndings }
 */

const INDENT = '    ';

function fmt(n, dp) { return Number(n).toFixed(parseInt(dp)); }

function fmtCoord(pt, bore, dp) {
  return `${fmt(pt.x, dp)} ${fmt(pt.y, dp)} ${fmt(pt.z, dp)} ${fmt(bore, dp)}`;
}

function msgSq(parts) {
  return ['MESSAGE-SQUARE', `${INDENT}${parts.filter(Boolean).join(', ')}`];
}

// ── Header ──────────────────────────────────────────────────────────────────
function buildHeader(pipelineRef) {
  const lines = [
    'ISOGEN-FILES ISOGEN.FLS',
    'UNITS-BORE MM',
    'UNITS-CO-ORDS MM',
    'UNITS-WEIGHT KGS',
    'UNITS-BOLT-DIA MM',
    'UNITS-BOLT-LENGTH MM',
  ];
  if (pipelineRef && pipelineRef.trim()) {
    lines.push(`PIPELINE-REFERENCE ${pipelineRef.trim()}`);
    lines.push(`${INDENT}PROJECT-IDENTIFIER P1`);
    lines.push(`${INDENT}AREA A1`);
  }
  lines.push('');
  return lines;
}

// ── CA block ────────────────────────────────────────────────────────────────
function buildCA(ca, includeWeight) {
  const lines = [];
  const add = (n, val) => {
    const s = String(val || '').trim();
    if (s) lines.push(`${INDENT}COMPONENT-ATTRIBUTE${n}  ${s}`);
  };
  add(1,  ca.CA1);
  add(2,  ca.CA2);
  add(3,  ca.CA3);
  add(4,  ca.CA4);
  add(5,  ca.CA5);
  add(6,  ca.CA6);
  add(7,  ca.CA7);
  if (includeWeight) add(8, ca.CA8);
  add(9,  ca.CA9);
  add(10, ca.CA10);
  return lines;
}

// ── PIPE ────────────────────────────────────────────────────────────────────
function emitPipe(comp, seqNo, pipelineRef, ca, dp) {
  const b = parseFloat(comp.bore) || 250;
  
  // Calculate euclidean distance between ep1 and ep2
  const dx = comp.ep2.x - comp.ep1.x;
  const dy = comp.ep2.y - comp.ep1.y;
  const dz = comp.ep2.z - comp.ep1.z;
  const length = Math.sqrt(dx*dx + dy*dy + dz*dz);

  const lines = [
    ...msgSq(['PIPE', `RefNo:=COORD_${seqNo}`, `SeqNo:${seqNo}`, `LENGTH=${fmt(length, 2)}MM`]),
    'PIPE',
    `${INDENT}END-POINT  ${fmtCoord(comp.ep1, b, dp)}`,
    `${INDENT}END-POINT  ${fmtCoord(comp.ep2, b, dp)}`,
  ];
  if (pipelineRef?.trim()) lines.push(`${INDENT}PIPELINE-REFERENCE ${pipelineRef}`);
  lines.push(...buildCA(ca, false));
  lines.push('');
  return lines;
}

// ── BEND ────────────────────────────────────────────────────────────────────
function emitBend(comp, seqNo, ca, dp) {
  const b      = parseFloat(comp.bore) || 250;
  const radius = comp.effectiveRadius != null ? comp.effectiveRadius : b * 1.5;
  const angle  = comp.angleDeg != null ? fmt(comp.angleDeg, 4) : '90.0000';
  return [
    ...msgSq(['BEND', `RefNo:=COORD_${seqNo}`, `SeqNo:${seqNo}`]),
    'BEND',
    `${INDENT}END-POINT  ${fmtCoord(comp.ep1, b, dp)}`,
    `${INDENT}END-POINT  ${fmtCoord(comp.ep2, b, dp)}`,
    `${INDENT}CENTRE-POINT  ${fmtCoord(comp.cp, b, dp)}`,
    `${INDENT}<SKEY>  BEBW`,
    `${INDENT}ANGLE ${angle}`,
    `${INDENT}BEND-RADIUS ${fmt(radius, 4)}`,
    ...buildCA(ca, false),
    '',
  ];
}

// ── TEE ─────────────────────────────────────────────────────────────────────
function emitTee(comp, seqNo, ca, dp) {
  const b  = parseFloat(comp.headerBore || comp.bore) || 250;
  const bb = parseFloat(comp.branchBore) || b;
  return [
    ...msgSq(['TEE', `BrLen=${fmt(comp.brlen, 4)}MM`, `RefNo:=COORD_${seqNo}`, `SeqNo:${seqNo}`]),
    'TEE',
    `${INDENT}END-POINT  ${fmtCoord(comp.ep1, b, dp)}`,
    `${INDENT}END-POINT  ${fmtCoord(comp.ep2, b, dp)}`,
    `${INDENT}CENTRE-POINT  ${fmtCoord(comp.cp, b, dp)}`,
    `${INDENT}BRANCH1-POINT  ${fmtCoord(comp.bp, bb, dp)}`,
    `${INDENT}<SKEY>  TEBW`,
    ...buildCA(ca, false),
    '',
  ];
}

// ── FLANGE ───────────────────────────────────────────────────────────────────
function emitFlange(comp, seqNo, ca, dp) {
  const b    = parseFloat(comp.bore) || 250;
  const skey = comp.skey || 'FLWN';
  return [
    ...msgSq(['FLANGE', `RefNo:=COORD_${seqNo}`, `SeqNo:${seqNo}`]),
    'FLANGE',
    `${INDENT}END-POINT  ${fmtCoord(comp.ep1, b, dp)}`,
    `${INDENT}END-POINT  ${fmtCoord(comp.ep2, b, dp)}`,
    `${INDENT}<SKEY>  ${skey}`,
    ...buildCA({ ...ca, CA8: comp.weight || ca.CA8 }, true),
    '',
  ];
}

// ── VALVE ────────────────────────────────────────────────────────────────────
function emitValve(comp, seqNo, ca, dp) {
  const b    = parseFloat(comp.bore) || 250;
  const skey = comp.skey || 'VLBT';
  return [
    ...msgSq(['VALVE', `RefNo:=COORD_${seqNo}`, `SeqNo:${seqNo}`]),
    'VALVE',
    `${INDENT}END-POINT  ${fmtCoord(comp.ep1, b, dp)}`,
    `${INDENT}END-POINT  ${fmtCoord(comp.ep2, b, dp)}`,
    `${INDENT}<SKEY>  ${skey}`,
    ...buildCA({ ...ca, CA8: comp.weight || ca.CA8 }, true),
    '',
  ];
}

// ── SUPPORT ─────────────────────────────────────────────────────────────────
function emitSupport(comp, seqNo, dp) {
  const supName = comp.supportName || 'CA150';
  const coords  = comp.coords || comp.ep1 || { x: 0, y: 0, z: 0 };
  return [
    'MESSAGE-SQUARE',
    `${INDENT}SUPPORT, RefNo:=COORD_${seqNo}, SeqNo:${seqNo}, ${supName}`,
    'SUPPORT',
    `${INDENT}CO-ORDS  ${fmtCoord(coords, 0, dp)}`,
    `${INDENT}<SUPPORT_NAME>  ${supName}`,
    ...(comp.supportGuid ? [`${INDENT}<SUPPORT_GUID>  UCI:${String(comp.supportGuid).replace(/^UCI:/i, '')}`] : []),
    '',
  ];
}

// ── Main entry ───────────────────────────────────────────────────────────────
/**
 * @param {ClassifiedComponent[]} components — from analyzeTopology()
 * @param {{ bore, pipelineRef, ca, decimalPrecision, windowsLineEndings }} options
 * @returns {{ pcfText: string, stats: { pipe, bend, tee, support, skipped } }}
 */
export function generatePCF(components, options = {}) {
  const dp  = parseInt(options.decimalPrecision ?? 4);
  const eol = options.windowsLineEndings !== false ? '\r\n' : '\n';
  const pipelineRef = options.pipelineRef || '';
  const ca  = options.ca || {};

  const lines = buildHeader(pipelineRef);
  let seqNo = 0;
  const stats = { pipe: 0, bend: 0, tee: 0, support: 0, skipped: 0 };

  for (const comp of components) {
    seqNo++;
    switch (comp.type) {
      case 'PIPE':
        lines.push(...emitPipe(comp, seqNo, pipelineRef, ca, dp));
        stats.pipe++;
        break;
      case 'BEND':
        lines.push(...emitBend(comp, seqNo, ca, dp));
        stats.bend++;
        break;
      case 'TEE':
        lines.push(...emitTee(comp, seqNo, ca, dp));
        stats.tee++;
        break;
      case 'FLANGE':
        lines.push(...emitFlange(comp, seqNo, ca, dp));
        stats.flange = (stats.flange || 0) + 1;
        break;
      case 'VALVE':
        lines.push(...emitValve(comp, seqNo, ca, dp));
        stats.valve = (stats.valve || 0) + 1;
        break;
      case 'SUPPORT':
        lines.push(...emitSupport(comp, seqNo, dp));
        stats.support++;
        break;
      default:
        stats.skipped++;
    }
  }

  return { pcfText: lines.join(eol), stats };
}
