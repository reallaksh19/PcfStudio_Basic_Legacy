/**
 * geometry-calc.js — Shared CP/BP/EP geometry calculations
 * Absorbs coord-bend-calc.js + coord-tee-calc.js and adds computeOletBP.
 *
 * Exports:
 *   classifyAngle(pPrev, pVertex, pNext)
 *   classifyBulgeAngle(bulge)
 *   computeBendGeometry(pPrev, pVertex, pNext, bendRadius, forcedClass)
 *   computeTeeGeometry(node, neighbors, bore, branchBore, rcConfig)
 *   computeOletBP(cp, hostPipeDir, bore)
 */

import { lookupTeeBreln } from '../ray-concept/rc-config.js';

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

// ── Vector helpers ───────────────────────────────────────────────────────────

function vec3(from, to) {
  return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
}

function dot(u, v) {
  return u.x * v.x + u.y * v.y + u.z * v.z;
}

function mag(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

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

function cross3(u, v) {
  return {
    x: u.y * v.z - u.z * v.y,
    y: u.z * v.x - u.x * v.z,
    z: u.x * v.y - u.y * v.x,
  };
}

function add3(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale3(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

// ── Bend calculations ────────────────────────────────────────────────────────

/**
 * Classify the turn angle at a vertex given its predecessor and successor.
 */
export function classifyAngle(pPrev, pVertex, pNext) {
  const incoming = normalize(vec3(pVertex, pPrev));
  const outgoing = normalize(vec3(pVertex, pNext));

  const cosIncluded = Math.max(-1.0, Math.min(1.0, dot(incoming, outgoing)));
  const includedDeg = parseFloat((Math.acos(cosIncluded) * DEG).toFixed(8));
  const angleDeg    = parseFloat((180.0 - includedDeg).toFixed(6));

  let bendClass = 'custom';
  if (angleDeg < 1.5)                          bendClass = 'collinear';
  else if (Math.abs(angleDeg - 90.0) < 2.5)   bendClass = '90';
  else if (Math.abs(angleDeg - 45.0) < 2.5)   bendClass = '45';

  return { angleDeg, bendClass };
}

/**
 * Classify a bulge value (from AutoCAD LWPOLYLINE) to a bend angle.
 */
export function classifyBulgeAngle(bulge) {
  if (bulge === null || bulge === undefined) return null;
  const abs = Math.abs(Number(bulge));
  if (Math.abs(abs - 0.4142) < 0.015) return '90';
  if (Math.abs(abs - 0.1989) < 0.015) return '45';
  if (abs > 0.001) return 'arc';
  return null;
}

/**
 * Compute bend component geometry: EP1, EP2 tangent points and CP.
 */
export function computeBendGeometry(pPrev, pVertex, pNext, bendRadius, forcedClass) {
  const { angleDeg, bendClass: detected } = classifyAngle(pPrev, pVertex, pNext);
  const bendClass = forcedClass || detected;
  const r = parseFloat(bendRadius);

  let tangentOffset;
  if (bendClass === '90')       tangentOffset = r * 1.0;
  else if (bendClass === '45')  tangentOffset = r * 0.4142;
  else if (bendClass === 'collinear') tangentOffset = 0;
  else {
    const halfRad = (angleDeg / 2.0) * RAD;
    tangentOffset = r * Math.tan(halfRad);
  }

  const inDir  = normalize(vec3(pVertex, pPrev));
  const outDir = normalize(vec3(pVertex, pNext));

  const armIn  = mag(vec3(pVertex, pPrev));
  const armOut = mag(vec3(pVertex, pNext));
  const maxOffset = Math.min(armIn, armOut) * 0.49;
  if (maxOffset > 0 && tangentOffset > maxOffset) {
    tangentOffset = maxOffset;
  }

  const ep1 = scaleAdd(pVertex, inDir,  tangentOffset);
  const ep2 = scaleAdd(pVertex, outDir, tangentOffset);
  const cp  = { x: Number(pVertex.x), y: Number(pVertex.y), z: Number(pVertex.z) };

  let effectiveRadius = r;
  if (bendClass === '90') effectiveRadius = tangentOffset;
  else if (bendClass === '45') effectiveRadius = tangentOffset / 0.4142;
  else if (bendClass !== 'collinear') {
    const halfRad = (angleDeg / 2.0) * RAD;
    effectiveRadius = tangentOffset / Math.tan(halfRad);
  }

  return { ep1, ep2, cp, angleDeg, bendClass, tangentOffset, effectiveRadius };
}

// ── TEE calculations ─────────────────────────────────────────────────────────

function findHeaderRun(node, neighbors) {
  let bestScore = Infinity;
  let bestA = 0, bestB = 1;

  for (let a = 0; a < neighbors.length; a++) {
    for (let b = a + 1; b < neighbors.length; b++) {
      const vA = normalize(vec3(node, neighbors[a]));
      const vB = normalize(vec3(node, neighbors[b]));
      const score = dot(vA, vB) + 1.0;
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
    headerA:           neighbors[bestA],
    headerB:           neighbors[bestB],
    branchNeighbors:   branchIdxes.map(i => neighbors[i]),
    collinearityScore: bestScore,
  };
}

/**
 * Compute TEE geometry at a branch junction node.
 */
export function computeTeeGeometry(node, neighbors, bore, branchBore, rcConfig) {
  if (!neighbors || neighbors.length < 3) return null;

  const headBore = parseFloat(bore)       || 250;
  const brBore   = parseFloat(branchBore) || headBore;

  const { headerA, headerB, branchNeighbors, collinearityScore } = findHeaderRun(node, neighbors);

  let brlen = lookupTeeBreln(headBore, headBore, rcConfig);
  if (!brlen) brlen = headBore * 0.5;

  const cp = { x: Number(node.x), y: Number(node.y), z: Number(node.z) };

  const dirA = normalize(vec3(node, headerA));
  const dirB = normalize(vec3(node, headerB));
  const ep1 = scaleAdd(cp, dirA, brlen);
  const ep2 = scaleAdd(cp, dirB, brlen);

  let branchBrlen = brlen;
  if (Math.abs(headBore - brBore) > 1.0) {
    const redBrlen = lookupTeeBreln(headBore, brBore, rcConfig);
    if (redBrlen) branchBrlen = redBrlen;
  }

  const branchNeighbor = branchNeighbors[0] || null;
  const branchDir = branchNeighbor
    ? normalize(vec3(node, branchNeighbor))
    : { x: 0, y: 1, z: 0 };
  const bp = scaleAdd(cp, branchDir, branchBrlen);

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

// ── OLET BP fallback ─────────────────────────────────────────────────────────

/**
 * When OLET BRANCH-POINT is missing, project CP onto the nearest host pipe
 * and offset by bore/2 along the branch direction (perpendicular to host pipe).
 *
 * @param {{ x,y,z }} cp            — OLET centre point
 * @param {{ x,y,z }} hostPipeDir   — unit vector along host pipe axis
 * @param {number}    bore          — branch pipe bore (mm)
 * @returns {{ x,y,z }}
 */
export function computeOletBP(cp, hostPipeDir, bore) {
  const up = { x: 0, y: 0, z: 1 };
  const perp = normalize(cross3(hostPipeDir, cross3(hostPipeDir, up)));
  // If perp is zero-length (host pipe is vertical), fall back to north
  const dir = mag(perp) > 1e-9 ? perp : { x: 0, y: 1, z: 0 };
  return add3(cp, scale3(normalize(dir), bore / 2));
}
