/**
 * coord-bend-calc.js — Bend geometry calculations
 * Given 3 consecutive points: classify angle, compute EP1/EP2 tangent points + CP.
 *
 * Angle classification:
 *   - collinear (< 1.5°): straight-through, no bend
 *   - 90°: right-angle bend
 *   - 45°: 45° bend
 *   - custom: other angles
 *
 * Tangent offset rule:
 *   EP = vertex + normalize(away from vertex) × tangentOffset
 *   90°: offset = bendRadius × tan(45°)   = bendRadius × 1.0
 *   45°: offset = bendRadius × tan(22.5°) = bendRadius × 0.4142
 *
 * Exports:
 *   classifyAngle(pPrev, pVertex, pNext)                     → { angleDeg, bendClass }
 *   computeBendGeometry(pPrev, pVertex, pNext, bendRadius)   → { ep1, ep2, cp, angleDeg, bendClass, tangentOffset }
 *   classifyBulgeAngle(bulge)                                → '90'|'45'|'arc'|null
 */

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

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Classify the turn angle at a vertex given its predecessor and successor.
 * Uses explicit float casting throughout (Strict Archetypal Casting doctrine).
 *
 * Strategy:
 *   incoming = direction FROM vertex BACK to pPrev
 *   outgoing = direction FROM vertex FORWARD to pNext
 *   Both rays point AWAY from the vertex.
 *   cos(included_angle) = dot(incoming, outgoing)
 *   turn_angle = 180° − included_angle
 *     → straight-through = 0° turn (both point in opposite directions → included = 180°)
 *     → 90° bend         = 90° turn
 *     → 45° bend         = 45° turn
 *
 * @param {{ x:number, y:number, z:number }} pPrev
 * @param {{ x:number, y:number, z:number }} pVertex
 * @param {{ x:number, y:number, z:number }} pNext
 * @returns {{ angleDeg: number, bendClass: 'collinear'|'90'|'45'|'custom' }}
 */
export function classifyAngle(pPrev, pVertex, pNext) {
  const incoming = normalize(vec3(pVertex, pPrev)); // away → prev
  const outgoing = normalize(vec3(pVertex, pNext)); // away → next

  // Clamp cos to [-1, 1] to guard against floating-point overshoot
  const cosIncluded = Math.max(-1.0, Math.min(1.0, dot(incoming, outgoing)));
  const includedDeg = parseFloat((Math.acos(cosIncluded) * DEG).toFixed(8));
  const angleDeg    = parseFloat((180.0 - includedDeg).toFixed(6)); // turn angle

  let bendClass = 'custom';
  if (angleDeg < 1.5)                          bendClass = 'collinear';
  else if (Math.abs(angleDeg - 90.0) < 2.5)   bendClass = '90';
  else if (Math.abs(angleDeg - 45.0) < 2.5)   bendClass = '45';

  return { angleDeg, bendClass };
}

/**
 * Classify a bulge value (from AutoCAD LWPOLYLINE) to a bend angle.
 * Bulge = tan(arc_included_angle / 4):
 *   90° arc → tan(22.5°) ≈ 0.4142
 *   45° arc → tan(11.25°) ≈ 0.1989
 *
 * Bulge is the PRIMARY classification trigger; adjacent-segment angle is verification.
 *
 * @param {number} bulge
 * @returns {'90'|'45'|'arc'|null}
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
 *
 * @param {{ x,y,z }} pPrev
 * @param {{ x,y,z }} pVertex
 * @param {{ x,y,z }} pNext
 * @param {number}    bendRadius   mm (e.g. bore × 1.5)
 * @param {string}    [forcedClass] Override bend class (from bulge detection)
 * @returns {{ ep1, ep2, cp, angleDeg, bendClass, tangentOffset, effectiveRadius }}
 */
export function computeBendGeometry(pPrev, pVertex, pNext, bendRadius, forcedClass) {
  const { angleDeg, bendClass: detected } = classifyAngle(pPrev, pVertex, pNext);
  const bendClass = forcedClass || detected;
  const r = parseFloat(bendRadius);

  // Tangent offset: distance from vertex to tangent point
  let tangentOffset;
  if (bendClass === '90')       tangentOffset = r * 1.0;
  else if (bendClass === '45')  tangentOffset = r * 0.4142;
  else if (bendClass === 'collinear') tangentOffset = 0;
  else {
    const halfRad = (angleDeg / 2.0) * RAD;
    tangentOffset = r * Math.tan(halfRad);
  }

  const inDir  = normalize(vec3(pVertex, pPrev)); // toward pPrev
  const outDir = normalize(vec3(pVertex, pNext)); // toward pNext

  // Safety clamp: tangent offset must not exceed half the arm length.
  // This prevents EP1/EP2 from overshooting past the adjacent point.
  const armIn  = mag(vec3(pVertex, pPrev));
  const armOut = mag(vec3(pVertex, pNext));
  const maxOffset = Math.min(armIn, armOut) * 0.49; // 49% of shorter arm
  if (maxOffset > 0 && tangentOffset > maxOffset) {
    tangentOffset = maxOffset;
  }

  const ep1 = scaleAdd(pVertex, inDir,  tangentOffset);
  const ep2 = scaleAdd(pVertex, outDir, tangentOffset);
  const cp  = { x: Number(pVertex.x), y: Number(pVertex.y), z: Number(pVertex.z) };

  // Calculate the effective bend radius based on the final (potentially clamped) offset
  let effectiveRadius = r;
  if (bendClass === '90') effectiveRadius = tangentOffset;
  else if (bendClass === '45') effectiveRadius = tangentOffset / 0.4142;
  else if (bendClass !== 'collinear') {
    const halfRad = (angleDeg / 2.0) * RAD;
    effectiveRadius = tangentOffset / Math.tan(halfRad);
  }

  return { ep1, ep2, cp, angleDeg, bendClass, tangentOffset, effectiveRadius };
}
