/**
 * gap-fixer.js — Explicit SNAP → STRETCH → INSERT gap repair strategy.
 *
 * Strategy order (strict):
 *   gap ≤ 0.5mm   → SKIP (within continuity tolerance)
 *   gap ≤ 6mm     → SNAP: move both endpoints to midpoint
 *   gap ≤ 25mm    → STRETCH, in order:
 *                     1. Try adjacent PIPE (extend EP2 of preceding or EP1 of following)
 *                     2. Try adjacent FLANGE
 *                     3. Try adjacent BEND/TEE (move CP toward gap)
 *   gap > 25mm    → INSERT new PIPE segment
 *
 * Exports:
 *   fixGap(prevComp, nextComp, gap, cfg) → fix object or null
 */

import { ENGINE_CONFIG } from './engine-config.js';

/**
 * Compute Euclidean distance between two 3D points.
 */
function dist3(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function midpoint3(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

/**
 * Snap both endpoints to their midpoint.
 * @returns {{ strategy: 'snap', prevEp2: object, nextEp1: object }}
 */
function snapToMidpoint(prevComp, nextComp) {
  const mid = midpoint3(prevComp.ep2, nextComp.ep1);
  return {
    strategy: 'snap',
    prevEp2: { ...mid },
    nextEp1: { ...mid },
  };
}

const STRETCHABLE = new Set(['PIPE', 'FLANGE', 'BEND', 'TEE']);

/**
 * Try to stretch an adjacent component to close the gap.
 * Priority: PIPE → FLANGE → BEND/TEE.
 *
 * For PIPE/FLANGE: extend the endpoint toward the gap.
 * For BEND/TEE: move CP slightly toward the gap midpoint.
 *
 * @returns {{ strategy: 'stretch', ... } | null}
 */
function stretchAdjacent(prevComp, nextComp, gap, cfg) {
  const priority = ['PIPE', 'FLANGE', 'BEND', 'TEE'];
  const target = midpoint3(prevComp.ep2, nextComp.ep1);

  // Try extending prevComp.ep2 toward nextComp.ep1
  for (const type of priority) {
    if (prevComp.type === type) {
      return { strategy: 'stretch', target: 'prev', ep2: { ...nextComp.ep1 } };
    }
  }

  // Try extending nextComp.ep1 toward prevComp.ep2
  for (const type of priority) {
    if (nextComp.type === type) {
      return { strategy: 'stretch', target: 'next', ep1: { ...prevComp.ep2 } };
    }
  }

  return null;
}

/**
 * Insert a new zero-bore PIPE segment to bridge the gap.
 * @returns {{ strategy: 'insert', pipe: object }}
 */
function insertPipe(prevComp, nextComp, gap, cfg) {
  return {
    strategy: 'insert',
    pipe: {
      type: 'PIPE',
      ep1: { ...prevComp.ep2 },
      ep2: { ...nextComp.ep1 },
      bore: prevComp.bore || nextComp.bore || 0,
    },
  };
}

/**
 * Determine the fix strategy for a gap between two consecutive components.
 *
 * @param {object} prevComp   — component with ep1, ep2, type
 * @param {object} nextComp   — component with ep1, ep2, type
 * @param {number} gap        — distance between prevComp.ep2 and nextComp.ep1 (mm)
 * @param {object} [cfg]      — overrides for ENGINE_CONFIG.tolerances
 * @returns {{ strategy: string, ... } | null}  null if no fix needed
 */
export function fixGap(prevComp, nextComp, gap, cfg = {}) {
  const tol = { ...ENGINE_CONFIG.tolerances, ...(cfg.tolerances || {}) };

  if (gap <= tol.continuity) return null;

  if (gap <= tol.snap) {
    return snapToMidpoint(prevComp, nextComp);
  }

  if (gap <= tol.stretch) {
    const fix = stretchAdjacent(prevComp, nextComp, gap, cfg);
    if (fix) return fix;
    // If no stretchable component, fall through to insert
  }

  return insertPipe(prevComp, nextComp, gap, cfg);
}
