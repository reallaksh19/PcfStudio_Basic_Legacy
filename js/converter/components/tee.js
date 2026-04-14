/**
 * components/tee.js — Write TEE PCF block
 * Run: EP1(1) → CP(computed midpoint of EP1+EP2) → EP2(2). Branch: BP(3).
 *
 * Rules:
 *   CP = midpoint of EP2 − EP1. Bore = EP2.bore (always written as 4th token).
 *   BP = pts['3'] (Stage 5 EP3). Bore = pts['3'].bore. Bore always last.
 *   For any CP/BP where bore === 0, fallback to the CSV row's Bore column value.
 *   SeqNo on BP encodes: "{Stage5SeqNo} / {Stage1SeqNo}" for traceability.
 */
import { fmtPointToken } from '../../geometry/coord-engine.js';
import { buildCABlock } from '../ca-builder.js';
import { buildMsgSquare } from '../message-square.js';
import { warn } from '../../logger.js';

const INDENT = '    ';

export const writeTee = (group, config) => {
  const { pts, refno } = group;
  const rule = config.pcfRules['TEE'];
  const ep1 = pts['1'];
  const ep2 = pts['2'];
  const bp = pts['3'];
  const dp = config.outputSettings?.decimalPlaces ?? 3;

  if (!ep1 || !ep2) {
    warn('tee', 'writeTee', 'Missing run geometry for TEE', {
      refno, hasEP1: !!ep1, hasEP2: !!ep2,
      hint: 'TEE needs Point=1 (run start) and Point=2 (run end)',
    });
    return [];
  }
  if (!bp) {
    warn('tee', 'writeTee', 'Missing branch point (Point=3) for TEE', {
      refno, hint: 'TEE needs Point=3 for branch direction and bore',
    });
  }

  // ── RULE 1: CP = midpoint of EP1 and EP2 ──────────────────────────────
  const cp = {
    E: (ep1.E + ep2.E) / 2,
    N: (ep1.N + ep2.N) / 2,
    U: (ep1.U + ep2.U) / 2,
  };

  // ── BORE RESOLUTION ───────────────────────────────────────────────────
  // CP bore = EP2's bore (Rule 1). Fallback: EP1, then any row in the group.
  const rowBore = parseFloat(
    (group.rows || []).map(r => parseFloat(r.Bore ?? 0)).find(b => b > 0) ?? 0
  ) || 0;
  const ep2BoreRaw = (ep2.bore && ep2.bore > 0) ? ep2.bore : rowBore;
  const bore = ep2BoreRaw > 0 ? ep2BoreRaw : ((ep1.bore && ep1.bore > 0) ? ep1.bore : rowBore);

  // BP bore = pts['3'] bore (Rule 2). Fallback to CP bore.
  const bpRow = group.rows?.find(r => String(r.Point ?? '').trim() === '3');
  const bpBoreRaw = (bp?.bore && bp.bore > 0) ? bp.bore : (bpRow?.Bore ?? 0);
  const branchBore = bpBoreRaw > 0 ? bpBoreRaw : bore;

  // ── SEQ NO RESOLUTION ─────────────────────────────────────────────────
  // Stage 1 SeqNo = first row of the group.
  const stage1SeqNo = String(
    group.rows?.[0]?.['Seq No.'] || group.rows?.[0]?.Sequence ||
    group.rows?.[0]?.Seq || group.rows?.[0]?.SeqNo || '-'
  ).trim();

  // Stage 5 SeqNo = the row that has Point=3 (branch row, i.e., the BP row from Stage 5).
  const stage5SeqNo = String(
    bpRow?.['Seq No.'] || bpRow?.Sequence ||
    bpRow?.Seq || bpRow?.SeqNo || '-'
  ).trim();

  // Combined SeqNo for MESSAGE-SQUARE (use Stage1 as the "primary" for the run header)
  const seqNo = stage1SeqNo;

  const lines = [
    ...buildMsgSquare(pts, 'TEE', { ...config, refno: group.refno, seqNo }),
    'TEE',
    // EP1 — run start, bore from EP1 (or fallback to CP bore)
    `${INDENT}END-POINT  ${fmtPointToken(ep1, (ep1.bore > 0 ? ep1.bore : bore), dp, 4)}`,
    // EP2 — run end, bore from EP2
    `${INDENT}END-POINT  ${fmtPointToken(ep2, bore, dp, 4)}`,
    // CP — computed midpoint, bore = EP2 bore, always 4 tokens (bore last) ──── RULE 1
    `${INDENT}CENTRE-POINT  ${fmtPointToken(cp, bore, dp, 4)}`,
  ];

  // BP — Vector-sense corrected branch point ────────────────────────────── RULE 2
  // pts['3'] may come from:
  //   a) CSV Point=3 raw E/N/U (branch connection point or center)
  //   b) Phase 0.5 EndX stamped on the P3 row (far branch endpoint) via buildPts fix
  //   c) pcf-assembler topology scan (branch connector far end)
  // Apply vector sense: project BP onto the plane perpendicular to the run at CP.
  // This removes any along-run drift caused by data imprecision or wrong raw coords.
  let bpOut = bp ? { ...bp } : null;
  if (bpOut) {
    const runE = ep2.E - ep1.E, runN = ep2.N - ep1.N, runU = ep2.U - ep1.U;
    const runLen2 = runE * runE + runN * runN + runU * runU;
    if (runLen2 > 1e-6) {
      const bE = bpOut.E - cp.E, bN = bpOut.N - cp.N, bU = bpOut.U - cp.U;
      const dot = (bE * runE + bN * runN + bU * runU) / runLen2;
      const perpE = bE - dot * runE, perpN = bN - dot * runN, perpU = bU - dot * runU;
      const perpLen = Math.sqrt(perpE * perpE + perpN * perpN + perpU * perpU);
      // Only apply if the perpendicular component is meaningful (> 1 mm)
      if (perpLen > 1.0) {
        bpOut = { ...bpOut, E: cp.E + perpE, N: cp.N + perpN, U: cp.U + perpU };
      }
    }
    lines.push(`${INDENT}BRANCH1-POINT  ${fmtPointToken(bpOut, branchBore, dp, 4)}`);
  }

  lines.push(`${INDENT}${rule?.skeyStyle ?? 'SKEY'}  ${rule?.defaultSKEY ?? 'TEBW'}`);

  // CA block uses Stage1 seqNo for run, but also encodes Stage5/Stage1 traceability
  const caLines = buildCABlock(pts, 'TEE', { ...config, refno, seqNo }, bp ? { ...bp } : null);
  lines.push(...caLines);

  // ── RULE 2 (Stage 5 + Stage 1 SeqNo traceability on BP) ─────────────────
  // Override the auto-generated CA98 if Stage5 SeqNo differs from Stage1
  if (bp && stage5SeqNo !== '-' && stage5SeqNo !== stage1SeqNo) {
    // Insert a branch-specific attribute right after the main CA block
    lines.push(`${INDENT}COMPONENT-ATTRIBUTE98-BP  ${stage5SeqNo} / ${stage1SeqNo}`);
  }

  return lines;
};
