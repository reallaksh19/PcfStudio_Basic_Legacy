/**
 * coord-tee-calc.js — Tee / Olet geometry at branch nodes (degree >= 3)
 *
 * Algorithm:
 *   1. For all edge pairs at the node, find the most collinear (anti-parallel) pair → header run
 *   2. Remaining edge(s) → branch direction
 *   3. CP  = junction node itself
 *   4. EP1 = CP + BRLEN × dirToHeaderA
 *   5. EP2 = CP + BRLEN × dirToHeaderB
 *   6. BP  = CP + branchBRLEN × dirToBranch
 *   Cross-check: (EP1 + EP2) / 2 ≈ CP  (logged for debug)
 *
 * Exports:
 *   computeTeeGeometry(node, neighbors, bore, branchBore, rcConfig)
 *     → { ep1, ep2, cp, bp, brlen, branchBore, headerBore, type, cpMidpointError }
 */

import { lookupTeeBreln } from '../ray-concept/rc-config.js';

// ── Vector helpers ───────────────────────────────────────────────────────────

function vec3(from, to) {
  return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
}

function dot(u, v) { return u.x * v.x + u.y * v.y + u.z * v.z; }

function mag(v) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }

function normalize(v) {
  const m = mag(v);
  if (m < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

function scaleAdd(base, dir, dist) {
  return {
    x: Number(base.x) + Number(dir.x) * Number(dist),
    y: Number(base.y) + Number(dir.y) * Number(dist),
    z: Number(base.z) + Number(dir.z) * Number(dist),
  };
}

/**
 * Find the most collinear pair of edges at a node.
 * Returns indices { idxA, idxB } into neighbors array, plus branch indexes.
 */
function findHeaderRun(node, neighbors) {
  let bestScore = Infinity; // lower = more anti-parallel = more collinear
  let bestA = 0, bestB = 1;

  for (let a = 0; a < neighbors.length; a++) {
    for (let b = a + 1; b < neighbors.length; b++) {
      const vA = normalize(vec3(node, neighbors[a]));
      const vB = normalize(vec3(node, neighbors[b]));
      // dot = -1 for perfectly anti-parallel (straight through), 0 for 90°, +1 for same dir
      const score = dot(vA, vB) + 1.0; // 0 = best (collinear), 2 = worst (same dir)
      if (score < bestScore) {
        bestScore = score;
        bestA = a;
        bestB = b;
      }
    }
  }

  const branchIdxes = neighbors
    .map((_, i) => i)
    .filter(i => i !== bestA && i !== bestB);

  return {
    headerA:     neighbors[bestA],
    headerB:     neighbors[bestB],
    branchNeighbors: branchIdxes.map(i => neighbors[i]),
    collinearityScore: bestScore,
  };
}

/**
 * Compute TEE geometry at a branch junction node.
 *
 * @param {{ x,y,z }}   node          — the junction coordinate
 * @param {{ x,y,z }[]} neighbors     — all directly connected neighbor points (>= 3 for TEE)
 * @param {number}      bore          — header pipe bore (mm)
 * @param {number}      branchBore    — branch bore (mm); use same as bore for equal tee
 * @param {object}      rcConfig      — full rc-config object (for BRLEN lookup tables)
 * @returns {{ ep1, ep2, cp, bp, brlen, branchBore, headerBore, type, cpMidpointError } | null}
 */
export function computeTeeGeometry(node, neighbors, bore, branchBore, rcConfig) {
  if (!neighbors || neighbors.length < 3) return null;

  const headBore = parseFloat(bore)        || 250;
  const brBore   = parseFloat(branchBore)  || headBore;

  const { headerA, headerB, branchNeighbors, collinearityScore } = findHeaderRun(node, neighbors);

  // BRLEN lookup (equal tee or reducing tee from ASME B16.9 table)
  let brlen = lookupTeeBreln(headBore, headBore, rcConfig); // Equal-tee BRLEN for run
  if (!brlen) brlen = headBore * 0.5; // Last-resort fallback

  // CP = the junction node
  const cp = { x: Number(node.x), y: Number(node.y), z: Number(node.z) };

  // EP1, EP2 — offset from CP along header run directions by BRLEN
  const dirA = normalize(vec3(node, headerA));
  const dirB = normalize(vec3(node, headerB));
  const ep1 = scaleAdd(cp, dirA, brlen);
  const ep2 = scaleAdd(cp, dirB, brlen);

  // Branch BRLEN (for reducing tee, lookup branch-specific M value)
  let branchBrlen = brlen;
  if (Math.abs(headBore - brBore) > 1.0) {
    const redBrlen = lookupTeeBreln(headBore, brBore, rcConfig);
    if (redBrlen) branchBrlen = redBrlen;
  }

  // BP — offset from CP along primary branch direction
  const branchNeighbor = branchNeighbors[0] || null;
  const branchDir = branchNeighbor
    ? normalize(vec3(node, branchNeighbor))
    : { x: 0, y: 1, z: 0 }; // fallback: north
  const bp = scaleAdd(cp, branchDir, branchBrlen);

  // Cross-check: (EP1 + EP2) / 2 should equal CP
  const midX = (ep1.x + ep2.x) / 2;
  const midY = (ep1.y + ep2.y) / 2;
  const midZ = (ep1.z + ep2.z) / 2;
  const cpMidpointError = Math.sqrt(
    (midX - cp.x) ** 2 + (midY - cp.y) ** 2 + (midZ - cp.z) ** 2
  );

  return {
    ep1, ep2, cp, bp,
    brlen,
    branchBore:      brBore,
    headerBore:      headBore,
    type:            'TEE',
    cpMidpointError,
    collinearityScore,
  };
}
