/**
 * components/valve.js — Write VALVE PCF block
 * CA8 (weight) included. componentName → ITEM-DESCRIPTION.
 */
import { fmtPointToken } from '../../geometry/coord-engine.js';
import { buildCABlock } from '../ca-builder.js';
import { buildMsgSquare } from '../message-square.js';
import { warn } from '../../logger.js';

import { linelistService } from '../../services/linelist-service.js';
import { weightService } from '../../services/weight-service.js';

const INDENT = '    ';

export const writeValve = (group, config) => {
  const { pts, refno } = group;
  const rule = config.pcfRules['VALVE'];
  const ep1 = pts['1'];
  const ep2 = pts['2'];
  const primary = pts['1'] ?? pts['0'] ?? Object.values(pts)[0] ?? {};
  const dp = config.outputSettings?.decimalPlaces ?? 3;

  if (!ep1 || !ep2) {
    warn('valve', 'writeValve', 'Missing EP1 or EP2 for VALVE', {
      refno, hasEP1: !!ep1, hasEP2: !!ep2,
    });
    return [];
  }

  // Calculate Weight (Deep Architect Mode Integration)
  // 1. Find Linelist Match
  const linelistRow = linelistService.findMatchedRow(primary);

  // 2. Build Mock Component Object for WeightService
  // Needs: attributes['RATING'], bore, type ('VALVE'), eps
  const compForWeight = {
    attributes: {
      "RATING": primary.rating || primary.raw?.['Rating'] || primary.raw?.['Class'] // Adjust based on point-builder
    },
    bore: primary.bore,
    type: 'VALVE',
    eps: [ep1, ep2],
    valveType: primary.description || primary.compName || primary.raw?.['Description'] || primary.raw?.['Type Description'] || ''
  };

  const weight = weightService.calculateWeight(compForWeight, linelistRow);

  const bore1 = (ep1.bore && ep1.bore > 0) ? ep1.bore : (group.rows?.[0]?.Bore ?? 0);
  const bore2 = (ep2.bore && ep2.bore > 0) ? ep2.bore : bore1;

  // Extract SeqNo for MESSAGE-SQUARE injection (same pattern as pipe.js)
  const seqNo = String(group.rows?.[0]?.['Seq No.'] || group.rows?.[0]?.Sequence || group.rows?.[0]?.Seq || group.rows?.[0]?.SeqNo || '-').trim();

  const lines = [
    ...buildMsgSquare(pts, 'VALVE', { ...config, refno: group.refno, seqNo }),
    'VALVE',
    `${INDENT}END-POINT  ${fmtPointToken(ep1, bore1, dp, 4)}`,
    `${INDENT}END-POINT  ${fmtPointToken(ep2, bore2, dp, 4)}`,
  ];

  // Inject WEIGHT if calculated
  if (weight !== null) {
    lines.push(`${INDENT}WEIGHT ${weight.toFixed(2)}`);
  }

  lines.push(`${INDENT}${rule?.skeyStyle ?? 'SKEY'} ${rule?.defaultSKEY ?? 'VBFL'}`);

  // ITEM-DESCRIPTION from componentName if configured
  const itemDescField = rule?.itemDescSource;
  if (itemDescField === 'componentName' && primary.compName) {
    lines.push(`${INDENT}ITEM-DESCRIPTION ${primary.compName}`);
  }

  lines.push(...buildCABlock(pts, 'VALVE', { ...config, refno, seqNo }));
  return lines;
};
