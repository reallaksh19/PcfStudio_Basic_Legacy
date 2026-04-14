/**
 * components/pipe.js — Write PIPE PCF block
 * Inputs: pts (PointDict), config
 * Output: string[] lines
 */
import { fmtPointToken } from '../../geometry/coord-engine.js';
import { buildCABlock } from '../ca-builder.js';
import { buildMsgSquare } from '../message-square.js';
import { warn } from '../../logger.js';

const INDENT = '    ';

export const writePipe = (group, config) => {
  const { pts, refno } = group;
  const rule = config.pcfRules['PIPE'];
  const ep1 = pts['1'];
  const ep2 = pts['2'];
  const dp = config.outputSettings?.decimalPlaces ?? 3;

  if (!ep1 || !ep2) {
    warn('pipe', 'writePipe', 'Missing EP1 or EP2 — cannot write PIPE block', {
      refno, hasEP1: !!ep1, hasEP2: !!ep2,
      hint: 'Check CSV Point column — BRAN needs Point=1 and Point=2 rows',
    });
    return [];
  }

  // Zero-Length Pipe Filtering — threshold matches 'Tolerance (mm)' input in PCF Table Form
  const zeroTol = config.coordinateSettings?.zeroLengthTolerance ?? 6;
  const suppressZero = config.coordinateSettings?.suppressZeroLengthPipes !== false;
  if (suppressZero) {
    const dx = (ep2.E ?? ep2.x ?? 0) - (ep1.E ?? ep1.x ?? 0);
    const dy = (ep2.N ?? ep2.y ?? 0) - (ep1.N ?? ep1.y ?? 0);
    const dz = (ep2.U ?? ep2.z ?? 0) - (ep1.U ?? ep1.z ?? 0);
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < zeroTol) {
      warn('pipe', 'writePipe', `Skipping Zero-Length Pipe (<${zeroTol}mm)`, { refno, len: len.toFixed(4) });
      return [];
    }
  }

  // Ensure bore fallback if 0
  const bore = (ep1.bore && ep1.bore > 0) ? ep1.bore : (group.rows?.[0]?.Bore ?? 0);
  const bore2 = (ep2.bore && ep2.bore > 0) ? ep2.bore : bore;

  // Extract SeqNo for MESSAGE-SQUARE injection
  const seqNo = String(group.rows?.[0]?.['Seq No.'] || group.rows?.[0]?.Sequence || group.rows?.[0]?.Seq || group.rows?.[0]?.SeqNo || '-').trim();

  const lines = [
    ...buildMsgSquare(pts, 'PIPE', { ...config, refno, seqNo }),
    'PIPE',
    `${INDENT}END-POINT  ${fmtPointToken(ep1, bore, dp, 4)}`,
    `${INDENT}END-POINT  ${fmtPointToken(ep2, bore2, dp, 4)}`,
  ];

  // (5c) PIPELINE-REFERENCE — only output if Line No.(Derived) is non-blank
  // Read from group.attributes first (populated by TableRegenerator), then fall back to CSV rows
  const lineNo = String(
    group.attributes?.['PIPELINE-REFERENCE'] ||
    group.rows?.[0]?.['Line No.(Derived)'] ||
    group.rows?.[0]?.['Line Number'] ||
    ''
  ).trim();
  if (lineNo) {
    lines.push(`${INDENT}PIPELINE-REFERENCE ${lineNo}`);
  }

  lines.push(...buildCABlock(pts, 'PIPE', { ...config, refno, seqNo }));

  return lines;
};
