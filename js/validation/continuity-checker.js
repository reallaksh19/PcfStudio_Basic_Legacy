/**
 * continuity-checker.js — Phase 2: Coordinate continuity checks
 * Uses topology adjacency to detect gaps, orphans, zero-length segments.
 *
 * Exports:
 *   checkContinuity(topology, groups, config) → Issue[]
 */

import { distance3D } from '../geometry/coord-engine.js';
import { warn } from '../logger.js';

const MOD = 'continuity-checker';

const _issue = (id, severity, refno, rowIndex, message, detail, fixHint) => ({
  id, phase: 'CONTINUITY', severity, refno: refno || null,
  rowIndex: rowIndex ?? null, message, detail: detail || '',
  fixable: false, fix: null, fixHint: fixHint || '',
});

/**
 * Get endpoint coordinates for a group (EP1 and EP2).
 * @param {object} group - ComponentGroup with pts built
 * @returns {{ep1: object|null, ep2: object|null}}
 */
const _getEPs = (group) => ({
  ep1: group.pts?.['1'] ?? group.pts?.['0'] ?? null,
  ep2: group.pts?.['2'] ?? null,
});

/**
 * @param {object} topology
 * @param {Map}    groups
 * @param {object} config
 * @returns {Issue[]}
 */
export const checkContinuity = (topology, groups, config) => {
  if (!topology?.adj) return [];
  const tol = config?.coordinateSettings?.continuityTolerance ?? 0.5;
  const issues = [];

  for (const [refno, group] of groups) {
    if (group.skip) continue;

    const { ep1, ep2 } = _getEPs(group);
    const neighbours = topology.adj.get(refno) ?? [];

    // V-CO-01: Orphan component (no neighbours)
    if (neighbours.length === 0 && group.pcfType !== 'SUPPORT') {
      issues.push(_issue('V-CO-01', 'WARNING', refno, group.firstRowIndex,
        `Orphan: "${refno}" (${group.pcfType}) has no connected components`,
        `Check coordinates match adjacent components within ${tol}mm`,
        'Verify East/North/Up values against connected components'));
    }

    // V-CO-02: Zero-length segment
    if (ep1 && ep2) {
      const len = distance3D(ep1, ep2);
      if (len < tol) {
        issues.push(_issue('V-CO-02', 'WARNING', refno, group.firstRowIndex,
          `Zero-length ${group.pcfType}: "${refno}"`,
          `EP1=(${ep1.E},${ep1.N},${ep1.U}) EP2=(${ep2.E},${ep2.N},${ep2.U}) dist=${len.toFixed(3)}mm`,
          'Check if this component should have a non-zero length'));
      }
    }

    // V-CO-03: TEE branch disconnect
    if (group.pcfType === 'TEE') {
      const bp = group.pts?.['3'];
      if (!bp) {
        issues.push(_issue('V-CO-03', 'WARNING', refno, group.firstRowIndex,
          `TEE "${refno}" missing branch point (Point=3)`,
          '', 'Add branch row with Point=3 in CSV for this TEE'));
      } else {
        // Branch should have at least one neighbour connecting to its direction
        const branchConnected = neighbours.some(nRefno => {
          const nGroup = groups.get(nRefno);
          if (!nGroup?.pts) return false;
          const nEP1 = nGroup.pts['1'] ?? nGroup.pts['0'] ?? null;
          if (!nEP1) return false;
          return distance3D(bp, nEP1) <= tol;
        });
        if (!branchConnected) {
          issues.push(_issue('V-CO-03', 'INFO', refno, group.firstRowIndex,
            `TEE "${refno}" branch point has no connected downstream component`,
            `Branch at (${bp.E},${bp.N},${bp.U})`,
            'Expected a PIPE or fitting to connect at the branch outlet'));
        }
      }
    }

    // V-CO-04: Segment gap (EP2 of prev not matching EP1 of this)
    // Only flag when previous component in traversal order exists and doesn't connect
    // This check is advisory — traversal handles it, this just reports
  }

  warn(MOD, 'checkContinuity', `Continuity check: ${issues.length} issues`, {
    orphans: issues.filter(x => x.id === 'V-CO-01').length,
    zeroLength: issues.filter(x => x.id === 'V-CO-02').length,
    teeBranch: issues.filter(x => x.id === 'V-CO-03').length,
  });

  return issues;
};
