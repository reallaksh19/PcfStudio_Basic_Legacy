/**
 * components/bend.js — Write BEND PCF block
 * Computes angle from EP1, CP, EP2 vectors.
 * BEND-RADIUS from CSV Radius column.
 * FIX: Infers Centre Point for 90° elbows with diagonal (skew) travel.
 */
import { fmtPointToken, fmtValue } from '../../geometry/coord-engine.js';
import { computeAngle, formatAngle } from '../../geometry/angle-calc.js';
import { isSkew, inferCorner } from '../../geometry/direction-calc.js';
import { buildCABlock } from '../ca-builder.js';
import { buildBendMsgSquare } from '../message-square.js';
import { warn } from '../../logger.js';

const INDENT = '    ';

export const writeBend = (group, config) => {
  const { pts, refno } = group;
  const rule = config.pcfRules['BEND'];
  const ep1 = pts['1'];
  const ep2 = pts['2'];
  let cp = pts['0'];
  const dp = config.outputSettings?.decimalPlaces ?? 3;
  const tokens = rule?.centrePointTokens ?? 4;

  // Fallback: if Centre Point is missing but EP1/EP2 exist with skew travel,
  // infer the corner using the largest-delta heuristic.
  if (!cp && ep1 && ep2 && isSkew(ep1, ep2)) {
    cp = inferCorner(ep1, ep2);
    // Carry over bore and design values from EP1 for formatting
    cp.bore = ep1.bore ?? 0;
    cp.radius = ep1.radius ?? 0;
    cp.wall = ep1.wall ?? 0;
    cp.material = ep1.material ?? '';
    warn('bend', 'writeBend', 'Centre Point (Point=0) missing — inferred from EP1/EP2 diagonal travel', {
      refno,
      inferredCP: `E=${cp.E.toFixed(1)} N=${cp.N.toFixed(1)} U=${cp.U.toFixed(1)}`,
      hint: 'Provide Point=0 in CSV for accurate centre placement',
    });
  }

  if (!ep1 || !ep2 || !cp) {
    warn('bend', 'writeBend', 'Missing geometry points for BEND', {
      refno, hasEP1: !!ep1, hasEP2: !!ep2, hasCP: !!cp,
      hint: 'ELBO needs Point=1, Point=2, Point=0 in CSV',
    });
    return [];
  }

  const angleDeg = computeAngle(ep1, cp, ep2);
  const angleStr = formatAngle(angleDeg, rule?.angleFormat ?? 'degrees');
  const primary = ep1;
  let radius = primary.radius ?? 0;

  // Attempt to recover radius from group attributes if missing in point geometry
  if (radius <= 0 && group.attributes && group.attributes['BEND-RADIUS']) {
    const attrRad = parseFloat(group.attributes['BEND-RADIUS']);
    if (!isNaN(attrRad) && attrRad > 0) radius = attrRad;
  }

  // Fallback: 1.5 * Nominal Bore (Long Radius default)
  if (radius <= 0) {
    const bore = parseFloat(primary.bore || 0);
    if (bore > 0) {
      radius = bore * 1.5;
      // Task 7: Reduce spam for default fallback. 1.5D is standard.
      // Changing log level to debug or suppressing if common.
      // warn('bend', 'writeBend', `BEND-RADIUS missing. Defaulting to 1.5D (${radius.toFixed(1)})`, { refno });
    } else {
      warn('bend', 'writeBend', 'BEND-RADIUS is zero or missing', {
        refno, radius, hint: 'Set Radius column in CSV for bend components',
      });
    }
  }

  // Ensure bore fallback if 0
  const bore = (ep1.bore && ep1.bore > 0) ? ep1.bore : (group.rows?.[0]?.Bore ?? 0);

  // Extract SeqNo for MESSAGE-SQUARE injection (same pattern as pipe.js)
  const seqNo = String(group.rows?.[0]?.['Seq No.'] || group.rows?.[0]?.Sequence || group.rows?.[0]?.Seq || group.rows?.[0]?.SeqNo || '-').trim();

  const lines = [
    ...buildBendMsgSquare(pts, angleStr, { ...config, refno: group.refno, seqNo }),
    'BEND',
    `${INDENT}END-POINT  ${fmtPointToken(ep1, bore, dp, 4)}`,
    `${INDENT}END-POINT  ${fmtPointToken(ep2, bore, dp, 4)}`,
    `${INDENT}CENTRE-POINT  ${fmtPointToken(cp, bore, dp, tokens)}`,
    `${INDENT}${rule?.skeyStyle ?? 'SKEY'}  ${rule?.defaultSKEY ?? 'BEBW'}`,
    `${INDENT}ANGLE ${angleStr}`,
    `${INDENT}BEND-RADIUS ${fmtValue(radius, 4)}`, // BEND-RADIUS decimal places
    ...buildCABlock(pts, 'BEND', { ...config, refno, seqNo }),
  ];

  return lines;
};
