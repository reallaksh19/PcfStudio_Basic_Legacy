/**
 * components/olet.js — Write OLET PCF block
 * NO END-POINTs. CENTRE-POINT (main pipe CL) + BRANCH1-POINT (branch end).
 * Points: CP=0 (centre on main), BP=3 (branch end).
 */
import { fmtPointToken } from '../../geometry/coord-engine.js';
import { buildCABlock } from '../ca-builder.js';
import { buildMsgSquare } from '../message-square.js';
import { warn } from '../../logger.js';

const INDENT = '    ';

export const writeOlet = (group, config) => {
  const { pts, refno } = group;
  const rule = config.pcfRules['OLET'];
  const cp = pts['0'];
  const bp = pts['3'];
  const dp = config.outputSettings?.decimalPlaces ?? 3;
  const tokens = rule?.centrePointTokens ?? 3;

  if (!cp) {
    warn('olet', 'writeOlet', 'Missing CENTRE-POINT (Point=0) for OLET', {
      refno, hint: 'OLET needs Point=0 on the main pipe centreline',
    });
    return [];
  }
  if (!bp) {
    warn('olet', 'writeOlet', 'Missing BRANCH1-POINT (Point=3) for OLET', {
      refno, hint: 'OLET needs Point=3 at the branch outlet end',
    });
    return [];
  }

  // Zero-length OLET filter — threshold matches 'Tolerance (mm)' input in PCF Table Form
  {
    const zeroTol = config.coordinateSettings?.zeroLengthTolerance ?? 6;
    const dx = (bp.E ?? bp.x ?? 0) - (cp.E ?? cp.x ?? 0);
    const dy = (bp.N ?? bp.y ?? 0) - (cp.N ?? cp.y ?? 0);
    const dz = (bp.U ?? bp.z ?? 0) - (cp.U ?? cp.z ?? 0);
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < zeroTol) {
      warn('olet', 'writeOlet', `Skipping Zero-Length OLET (<${zeroTol}mm)`, { refno, len: len.toFixed(4) });
      return [];
    }
  }

  // Ensure bore fallback if 0
  const cpBore = (cp.bore && cp.bore > 0) ? cp.bore : (group.rows?.[0]?.Bore ?? 0);
  const bpBore = (bp.bore && bp.bore > 0) ? bp.bore : (cpBore);

  // Extract SeqNo for MESSAGE-SQUARE injection (same pattern as pipe.js)
  const seqNo = String(group.rows?.[0]?.['Seq No.'] || group.rows?.[0]?.Sequence || group.rows?.[0]?.Seq || group.rows?.[0]?.SeqNo || '-').trim();

  return [
    ...buildMsgSquare(pts, 'OLET', { ...config, refno: group.refno, seqNo }),
    'OLET',
    `${INDENT}CENTRE-POINT  ${fmtPointToken(cp, cpBore, dp, tokens)}`,
    `${INDENT}BRANCH1-POINT  ${fmtPointToken(bp, bpBore, dp, 4)}`,
    `${INDENT}${rule?.skeyStyle ?? 'SKEY'}  ${rule?.defaultSKEY ?? 'CEBW'}`,
    ...buildCABlock(pts, 'OLET', { ...config, refno, seqNo }),
  ];
};
