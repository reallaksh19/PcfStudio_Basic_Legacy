/**
 * components/generic.js — Write Generic PCF block (e.g. MISC-COMPONENT)
 * Writes standard 2-point component with SKEY.
 */
import { fmtPointToken } from '../../geometry/coord-engine.js';
import { buildCABlock } from '../ca-builder.js';
import { buildMsgSquare } from '../message-square.js';
import { warn } from '../../logger.js';

const INDENT = '    ';

export const writeGeneric = (group, config) => {
  const { pts, refno, pcfType } = group;
  // Use specific rule or fall back to FLANGE-like structure
  const rule = config.pcfRules[pcfType] || config.pcfRules['FLANGE'];
  const ep1 = pts['1'];
  const ep2 = pts['2'];
  const dp = config.outputSettings?.decimalPlaces ?? 3;

  if (!ep1 || !ep2) {
    warn('generic', 'writeGeneric', `Missing EP1 or EP2 for ${pcfType}`, {
      refno, hasEP1: !!ep1, hasEP2: !!ep2,
    });
    return [];
  }

  // Determine Keyword: PCOM usually -> COMPONENT or MISC-COMPONENT
  // But group.pcfType is what we set in defaults.js (MISC-COMPONENT).
  // ISOGEN usually expects "COMPONENT" or "MISC-COMPONENT" or custom.
  const keyword = rule.keyword || pcfType;

  return [
    ...buildMsgSquare(pts, pcfType, { ...config, refno: group.refno }),
    keyword,
    `${INDENT}END-POINT  ${fmtPointToken(ep1, ep1.bore, dp, 4)}`,
    `${INDENT}END-POINT  ${fmtPointToken(ep2, ep2.bore, dp, 4)}`,
    `${INDENT}${rule?.skeyStyle ?? '<SKEY>'} ${rule?.defaultSKEY ?? 'COMP'}`,
    ...buildCABlock(pts, pcfType, { ...config, refno, seqNo: String(group.rows?.[0]?.['Seq No.'] || group.rows?.[0]?.Sequence || group.rows?.[0]?.SeqNo || '').trim() }),
  ];
};
