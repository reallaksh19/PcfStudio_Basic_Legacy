/**
 * components/reducer.js — Write REDUCER-CONCENTRIC or REDUCER-ECCENTRIC block
 * Bore MUST differ between EP1 and EP2.
 * ECCENTRIC adds FLAT-DIRECTION from config.
 */
import { fmtPointToken } from '../../geometry/coord-engine.js';
import { buildCABlock } from '../ca-builder.js';
import { buildMsgSquare } from '../message-square.js';
import { warn } from '../../logger.js';

const INDENT = '    ';

const _writeReducer = (group, config, pcfType) => {
  const { pts, refno } = group;
  const rule = config.pcfRules[pcfType];
  const ep1 = pts['1'];
  const ep2 = pts['2'];
  const dp = config.outputSettings?.decimalPlaces ?? 3;

  if (!ep1 || !ep2) {
    warn('reducer', '_writeReducer', `Missing EP1 or EP2 for ${pcfType}`, {
      refno, hasEP1: !!ep1, hasEP2: !!ep2,
    });
    return [];
  }

  if (ep1.bore === ep2.bore && ep1.bore > 0) {
    warn('reducer', '_writeReducer', `EP1 bore equals EP2 bore — not a reducer`, {
      refno, bore: ep1.bore, pcfType,
      hint: 'Reducer requires different bore at each endpoint',
    });
  }

  const bore1 = (ep1.bore && ep1.bore > 0) ? ep1.bore : (group.rows?.[0]?.Bore ?? 0);
  const bore2 = (ep2.bore && ep2.bore > 0) ? ep2.bore : (group.rows?.[0]?.Bore ?? bore1);

  const lines = [
    ...buildMsgSquare(pts, pcfType, { ...config, refno: group.refno }),
    pcfType,
    `${INDENT}END-POINT  ${fmtPointToken(ep1, bore1, dp, 4)}`,
    `${INDENT}END-POINT  ${fmtPointToken(ep2, bore2, dp, 4)}`,
  ];

  if (pcfType === 'REDUCER-ECCENTRIC') {
    const flatDir = rule?.flatDirection ?? 'DOWN';
    lines.push(`${INDENT}FLAT-DIRECTION ${flatDir}`);
  }

  lines.push(`${INDENT}${rule?.skeyStyle ?? 'Skey'} ${rule?.defaultSKEY ?? (pcfType === 'REDUCER-ECCENTRIC' ? 'REBW' : 'RCBW')}`);
  const seqNo = String(group.rows?.[0]?.['Seq No.'] || group.rows?.[0]?.Sequence || group.rows?.[0]?.Seq || group.rows?.[0]?.SeqNo || '').trim();
  lines.push(...buildCABlock(pts, pcfType, { ...config, refno, seqNo }));

  return lines;
};

export const writeReducerConcentric = (group, config) =>
  _writeReducer(group, config, 'REDUCER-CONCENTRIC');

export const writeReducerEccentric = (group, config) =>
  _writeReducer(group, config, 'REDUCER-ECCENTRIC');
