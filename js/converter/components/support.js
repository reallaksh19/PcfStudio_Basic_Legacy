/**
 * components/support.js — Write SUPPORT PCF block
 * CO-ORDS only (4 tokens). NO CA attributes.
 * <SUPPORT_NAME> from Restraint Type column.
 * <SUPPORT_GUID> from NodeName column with UCI: prefix.
 */
import { fmtPointToken } from '../../geometry/coord-engine.js';
import { buildMsgSquare } from '../message-square.js';
import { warn } from '../../logger.js';

const INDENT = '    ';

/**
 * Resolve the <SUPPORT_NAME> token from friction, gap, and restraint type data.
 * Maps to CA150 (REST), CA100 (GUIDE), RST (rest with gap), or TBA/VG100 (complex cases).
 */
function resolveSupportName(friction, gap, restTypeUpper, config) {
  const f = String(friction ?? '').trim();
  const g = String(gap ?? '').trim();
  const gapNum = parseFloat(g);
  const fallback = config.coordinateSettings?.supportSettings?.nameRules?.fallback || 'CA150';

  // Block 1: friction empty/NULL/0.3 AND gap empty/NULL → REST type
  const isBlock1Friction = f === '' || f === 'NULL' || f === '0.3';
  const isGapEmpty = g === '' || g === 'NULL';

  if (isBlock1Friction && isGapEmpty) {
    if (restTypeUpper.includes('LIM') && restTypeUpper.includes('GUI')) return 'TBA';
    if (restTypeUpper.includes('LIM')) return 'TBA';
    if (restTypeUpper.includes('GUI')) return 'VG100';
    return 'CA150';  // REST default
  }

  // Block 2: friction = 0.15 → GUIDE type
  if (f === '0.15') {
    if (restTypeUpper.includes('LIM') && restTypeUpper.includes('GUI')) return 'TBA';
    if (restTypeUpper.includes('LIM')) return 'TBA';
    if (restTypeUpper.includes('GUI')) return 'TBA';
    if (restTypeUpper.includes('DATUM')) return 'CA100';
    return 'CA100';  // GUIDE default
  }

  // Block 3: friction = 0.3 AND gap > 0 → REST with gap
  if (f === '0.3' && !isNaN(gapNum) && gapNum > 0) return 'RST';

  return fallback;
}

export const writeSupport = (group, config) => {
  const { pts, refno } = group;
  const coords = pts['0'];
  const primary = pts['0'] ?? Object.values(pts)[0] ?? {};
  const dp = config.outputSettings?.decimalPlaces ?? 3;

  if (!coords) {
    warn('support', 'writeSupport', 'Missing COORDS point (Point=0) for SUPPORT', {
      refno, hint: 'ANCI component needs Point=0 row in CSV',
    });
    return [];
  }

  const supportName = primary.restraintType || '';
  const nodeName = primary.nodeName || '';

  if (!supportName) {
    warn('support', 'writeSupport', 'SUPPORT has no restraint type', {
      refno, hint: 'Fill "Restraint Type" column in CSV for ANCI components',
    });
  }
  if (!nodeName) {
    warn('support', 'writeSupport', 'SUPPORT has no NodeName for GUID', {
      refno, hint: 'Fill "NodeName" column in CSV for ANCI components',
    });
  }

  const friction = String(primary['Restraint Friction'] || '').trim();
  const gap = String(primary['Restraint Gap'] || '').trim();
  const restTypeUpper = String(supportName).toUpperCase();
  const derivedSupportName = resolveSupportName(friction, gap, restTypeUpper, config);

  // Extract SeqNo for traceability (same pattern as pipe.js)
  const seqNo = String(group.rows?.[0]?.['Seq No.'] || group.rows?.[0]?.Sequence || group.rows?.[0]?.Seq || group.rows?.[0]?.SeqNo || '-').trim();

  const cleanRef = String(group.refno || '').replace(/^=+/, '');

  // SUPPORT bore is always 0.0000 per spec §12 — never use actual bore
  const bore = 0;

  // MESSAGE-SQUARE followed by SUPPORT block per spec §12
  // CA1-CA10: intentionally omitted (SUPPORT never has CA1-CA10)
  // CA97 (RefNo): omitted from block body — captured in MESSAGE-SQUARE only
  const finalLines = [
    'MESSAGE-SQUARE',
    `    SUPPORT, RefNo:=${cleanRef}, ${derivedSupportName}${seqNo && seqNo !== '-' ? `, SeqNo:${seqNo}` : ''}`,
    'SUPPORT',
    `${INDENT}CO-ORDS  ${fmtPointToken(coords, bore, dp, 4)}`,
    `${INDENT}<SUPPORT_NAME> ${derivedSupportName}`,
  ];

  if (nodeName) finalLines.push(`${INDENT}<SUPPORT_GUID> UCI:${nodeName}`);

  // NO CA attributes on SUPPORT — spec §12 compliance confirmed

  return finalLines;
};
