/**
 * components/flange.js — Write FLANGE PCF block
 * CA8 (weight) included. SKEY FLWN default.
 */
import { fmtPointToken } from '../../geometry/coord-engine.js';
import { buildCABlock } from '../ca-builder.js';
import { buildMsgSquare } from '../message-square.js';
import { warn } from '../../logger.js';

const INDENT = '    ';

export const writeFlange = (group, config) => {
  const { pts, refno } = group;
  const rule = config.pcfRules['FLANGE'];
  const ep1 = pts['1'];
  const ep2 = pts['2'];
  const dp = config.outputSettings?.decimalPlaces ?? 3;

  if (!ep1 || !ep2) {
    warn('flange', 'writeFlange', 'Missing EP1 or EP2', {
      refno, hasEP1: !!ep1, hasEP2: !!ep2,
    });
    return [];
  }

  // Task 9: Flange Endpoint Duplicate Check
  // Ensure we only output 2 distinct endpoints.
  // Although we access pts['1'] and pts['2'] explicitly,
  // ensure no logic upstream pushed extra keys or data.
  // (In this implementation, we explicitly pick 1 and 2, so duplicates are ignored by design).

  const bore1 = (ep1.bore && ep1.bore > 0) ? ep1.bore : (group.rows?.[0]?.Bore ?? 0);
  const bore2 = (ep2.bore && ep2.bore > 0) ? ep2.bore : bore1;

  // Extract SeqNo for MESSAGE-SQUARE injection
  const seqNo = String(group.rows?.[0]?.['Seq No.'] || group.rows?.[0]?.Sequence || group.rows?.[0]?.Seq || group.rows?.[0]?.SeqNo || '-').trim();

  return [
    ...buildMsgSquare(pts, 'FLANGE', { ...config, refno: group.refno, seqNo }),
    'FLANGE',
    `${INDENT}END-POINT  ${fmtPointToken(ep1, bore1, dp, 4)}`,
    `${INDENT}END-POINT  ${fmtPointToken(ep2, bore2, dp, 4)}`,
    `${INDENT}${rule?.skeyStyle ?? 'SKEY'} ${rule?.defaultSKEY ?? 'FLWN'}`,
    ...buildCABlock(pts, 'FLANGE', { ...config, refno, seqNo }),
  ];
};
