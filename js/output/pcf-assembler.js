/**
 * pcf-assembler.js — Assemble complete PCF lines array
 * Iterates traversal order, dispatches each group to writer, joins with blank lines.
 * Orphans appended at end with comment.
 *
 * Exports:
 *   assemble(traversalResult, groups, config, pipelineRef) → string[]
 */

import { buildHeader } from '../converter/header-writer.js';
import { buildPts } from '../converter/point-builder.js';
import { dispatch } from '../converter/components/dispatcher.js';
import { buildTopology } from '../graph/topology-builder.js';
import { info, warn } from '../logger.js';
import { gate } from '../services/gate-logger.js';
import { filterPcfLines } from './pcf-cleaner.js';
import { getState } from '../state.js';

const MOD = 'pcf-assembler';



/**
 * Assemble complete PCF file lines.
 * @param {{ ordered: string[], orphans: string[] }} traversalResult
 * @param {Map<string, ComponentGroup>} groups
 * @param {object} config
 * @param {string} [pipelineRef]
 * @returns {string[]}
 */
export const assemble = (traversalResult, groups, config, pipelineRef) => {
  const { ordered, orphans } = traversalResult;
  const lines = [];

  // Derive PIPELINE-REFERENCE: prefer the passed param (from RefNo prefix via getPipelineRef),
  // fall back to filename-without-extension from meta state
  const meta = getState('meta') || {};
  const rawFilename = meta.filename || '';
  const fileRef = rawFilename ? rawFilename.replace(/\.[^.]+$/, '') : '';
  const derivedPipelineRef = pipelineRef || fileRef || '';

  // File header (Unified format: ISOGEN-FILES, UNITS, PIPELINE-REFERENCE, MESSAGE-SQUARE)
  lines.push(...buildHeader(derivedPipelineRef));
  lines.push('');

  let written = 0;
  let skipped = 0;

  // ── TEE Branch Point Inference ──────────────────────────────────────────
  // For TEE groups that have no pts['3'], scan ALL groups to find a component
  // whose EP1 or EP2 lies ON the TEE run segment (between EP1 and EP2).
  // That component is the branch connector; its FAR endpoint is EP3 (BP).
  try {
    const snapTol = config?.coordinateSettings?.continuityTolerance ?? 1.0;

    // Helper: true if point P is close to another point A
    const near = (a, b) =>
      b && a &&
      Math.abs(a.E - b.E) < snapTol &&
      Math.abs(a.N - b.N) < snapTol &&
      Math.abs(a.U - b.U) < snapTol;

    // Helper: true if point P lies between A and B on the TEE run axis
    // (i.e., it is collinear with A-B and between them with some tolerance)
    const onSegment = (p, a, b) => {
      if (!p || !a || !b) return false;
      // Vector AB
      const abE = b.E - a.E, abN = b.N - a.N, abU = b.U - a.U;
      const len2 = abE * abE + abN * abN + abU * abU;
      if (len2 < 0.01) return false;
      // Project AP onto AB → t in [0,1] means between A and B
      const apE = p.E - a.E, apN = p.N - a.N, apU = p.U - a.U;
      const t = (apE * abE + apN * abN + apU * abU) / len2;
      if (t < 0 || t > 1) return false;
      // Perpendicular distance from p to the infinite line AB
      const projE = a.E + t * abE, projN = a.N + t * abN, projU = a.U + t * abU;
      const dist = Math.hypot(p.E - projE, p.N - projN, p.U - projU);
      return dist < snapTol * 3; // generous tolerance for on-segment check
    };

    for (const [teeRef, teeGroup] of groups) {
      if (teeGroup.pcfType !== 'TEE') continue;
      if (!teeGroup.pts) teeGroup.pts = buildPts(teeGroup, config);
      const ep1 = teeGroup.pts['1'];
      const ep2 = teeGroup.pts['2'];
      // Skip topology scan if pts['3'] is already set AND it's not at EP1/EP2
      // (pts['3'] at EP1/EP2 means processGeometry placed the branch point on the run — invalid)
      if (teeGroup.pts['3'] && !near(teeGroup.pts['3'], ep1) && !near(teeGroup.pts['3'], ep2)) continue;
      if (!ep1 || !ep2) continue;

      // Scan all other groups for the branch connector
      for (const [candidateRef, candidateGroup] of groups) {
        if (candidateRef === teeRef) continue;
        if (!candidateGroup.pts) candidateGroup.pts = buildPts(candidateGroup, config);

        const cEP1 = candidateGroup.pts['1'];
        const cEP2 = candidateGroup.pts['2'];

        // The branch connector's near-end should be ON the TEE run (but NOT at EP1 or EP2)
        // and should NOT match EP1 or EP2 exactly (those are the run neighbors)
        let branchConnectPt = null;
        let branchFarPt = null;

        if (cEP1 && onSegment(cEP1, ep1, ep2) && !near(cEP1, ep1) && !near(cEP1, ep2)) {
          branchConnectPt = cEP1;
          branchFarPt = cEP2;
        } else if (cEP2 && onSegment(cEP2, ep1, ep2) && !near(cEP2, ep1) && !near(cEP2, ep2)) {
          branchConnectPt = cEP2;
          branchFarPt = cEP1;
        }

        // Guard: branchFarPt must not land at the TEE's own EP1 or EP2 —
        // that would mean a run-connected fitting was mis-identified as a branch.
        if (branchFarPt && !near(branchFarPt, ep1) && !near(branchFarPt, ep2)) {
          // branchFarPt is Stage 5's EP3 — the far end of the branch connector
          const bore = branchFarPt.bore > 0 ? branchFarPt.bore
            : (candidateGroup.pts['1']?.bore || ep2?.bore || ep1?.bore || 0);
          teeGroup.pts['3'] = { ...branchFarPt, bore };
          info(MOD, 'assemble',
            `TEE ${teeRef}: Inferred pts['3'] from branch connector ${candidateRef}`, {
            connectPt: branchConnectPt,
            ep3: { E: branchFarPt.E, N: branchFarPt.N, U: branchFarPt.U },
          });
          break;
        }
      }
    }
  } catch (topoErr) {
    warn(MOD, 'assemble', 'TEE branch inference failed (non-fatal)', { error: topoErr.message });
  }

  // Main traversal order
  info(MOD, 'assemble', 'Assembling PCF blocks from traversed geometry...');
  for (const refno of ordered) {
    const group = groups.get(refno);
    if (!group) {
      warn(MOD, 'assemble', `Refno in traversal not found in groups`, { refno });
      continue;
    }
    if (group.skip) { skipped++; continue; }

    // Ensure pts are built
    if (!group.pts || Object.keys(group.pts).length === 0) {
      group.pts = buildPts(group, config);
    }

    if (group.pcfType === 'BEND' || group.pcfType === 'ELBOW' || group.pcfType === 'TEE') {
      console.log(`[DEBUG-PTS] ${group.pcfType} ${refno} -> Points parsed from CSV:`, Object.keys(group.pts));
    }

    const blockLines = dispatch(group, config) || [];
    if (blockLines.length > 0) {
      lines.push(...blockLines);
      lines.push(''); // blank line between components
      written++;
    } else {
      skipped++;
    }
  }

  // Orphans at end with annotation
  if (orphans.length > 0) {
    lines.push('MESSAGE-SQUARE');
    lines.push(`    *** ORPHAN COMPONENTS — no coordinate match found ***`);
    lines.push('');
    for (const refno of orphans) {
      const group = groups.get(refno);
      if (!group || group.skip) continue;
      if (!group.pts || Object.keys(group.pts).length === 0) {
        group.pts = buildPts(group, config);
      }
      const blockLines = dispatch(group, config) || [];
      if (blockLines.length > 0) {
        lines.push(...blockLines);
        lines.push('');
        written++;
      }
    }
  }

  gate('PCFAssembler', 'assemble', 'Assembly Complete', {
    totalLines: lines.length, written, skipped, orphans: orphans.length
  });

  info(MOD, 'assemble', 'PCF assembly complete', {
    totalLines: lines.length, written, skipped, orphans: orphans.length,
  });

  return filterPcfLines(lines);
};
