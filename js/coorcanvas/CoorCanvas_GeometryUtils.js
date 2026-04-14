/**
 * CoorCanvas_GeometryUtils.js
 * Pure geometry / math helpers for the CoorCanvas pipeline.
 * No JSX, no React – safe to import anywhere.
 */

const elbowCLR = {
  15: 38.1,
  20: 38.1,
  25: 38.1,
  32: 47.6,
  40: 57.2,
  50: 76.2,
  65: 95.3,
  80: 114.3,
  100: 152.4,
  150: 228.6,
  200: 304.8,
  250: 381.0,
  300: 457.2,
};

// ── Vector primitives ─────────────────────────────────────────────────────────
export function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}
export function unit(v) {
  const L = Math.hypot(v[0], v[1]);
  if (L <= 1e-9) return [0, 0];
  return [v[0] / L, v[1] / L];
}
export function cross(a, b) {
  return a[0] * b[1] - a[1] * b[0];
}
export function isClose(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}

// ── Segment intersection ──────────────────────────────────────────────────────
export function segmentIntersection(p, p2, q, q2) {
  const r = [p2[0] - p[0], p2[1] - p[1]];
  const s = [q2[0] - q[0], q2[1] - q[1]];
  const rxs = cross(r, s);
  const qp = [q[0] - p[0], q[1] - p[1]];
  const qpxr = cross(qp, r);
  if (Math.abs(rxs) < 1e-9 && Math.abs(qpxr) < 1e-9) return null;
  if (Math.abs(rxs) < 1e-9) return null;
  const t = cross(qp, s) / rxs;
  const u = cross(qp, r) / rxs;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { point: [p[0] + t * r[0], p[1] + t * r[1]], t, u };
}

// ── Pipe classification ───────────────────────────────────────────────────────
export function isVertical(pipe) {
  return isClose(pipe.start[0], pipe.end[0]) && !isClose(pipe.start[1], pipe.end[1]);
}
export function isHorizontal(pipe) {
  return isClose(pipe.start[1], pipe.end[1]) && !isClose(pipe.start[0], pipe.end[0]);
}
export function pointOnPipeInterior(pipe, pt) {
  const [x, y] = pt;
  const [x1, y1] = pipe.start;
  const [x2, y2] = pipe.end;
  if (isVertical(pipe))   return isClose(x, x1) && y > Math.min(y1, y2) + 1e-6 && y < Math.max(y1, y2) - 1e-6;
  if (isHorizontal(pipe)) return isClose(y, y1) && x > Math.min(x1, x2) + 1e-6 && x < Math.max(x1, x2) - 1e-6;
  return false;
}
export function pipeParam(pipe, pt) {
  const [x1, y1] = pipe.start;
  const [x2, y2] = pipe.end;
  const [x, y] = pt;
  if (Math.abs(x2 - x1) >= Math.abs(y2 - y1))
    return Math.abs(x2 - x1) < 1e-9 ? 0 : (x - x1) / (x2 - x1);
  return Math.abs(y2 - y1) < 1e-9 ? 0 : (y - y1) / (y2 - y1);
}

// ── Pipe building / splitting ─────────────────────────────────────────────────
export function splitPipe(pipe, cutPoints) {
  if (!cutPoints.length) return [pipe];
  const pts = [pipe.start, ...cutPoints, pipe.end]
    .sort((a, b) => pipeParam(pipe, a) - pipeParam(pipe, b));
  const unique = [];
  for (const p of pts)
    if (!unique.length || dist(unique[unique.length - 1], p) > 1e-6) unique.push(p);
  const out = [];
  for (let i = 0; i < unique.length - 1; i++)
    if (dist(unique[i], unique[i + 1]) > 1e-6)
      out.push({ kind: "PIPE", start: unique[i], end: unique[i + 1], source: pipe.source });
  return out;
}

export function buildBaseElements(route, bore, skey = "BEBW") {
  const radius = elbowCLR[bore] ?? 381;
  const elems = [];
  let current = route[0];
  for (let i = 1; i < route.length - 1; i++) {
    const prev   = route[i - 1];
    const corner = route[i];
    const next   = route[i + 1];
    const din    = unit(sub(corner, prev));
    const dout   = unit(sub(next, corner));
    const turn   = cross(din, dout);
    const lenUp  = dist(prev, corner);
    const lenDn  = dist(corner, next);
    if (Math.abs(Math.abs(turn) - 1) > 1e-6 || lenUp < radius || lenDn < radius) {
      if (dist(current, corner) > 1e-6)
        elems.push({ kind: "PIPE", start: current, end: corner, source: `S${i}` });
      current = corner;
      continue;
    }
    const ep1 = [corner[0] - din[0] * radius, corner[1] - din[1] * radius];
    const ep2 = [corner[0] + dout[0] * radius, corner[1] + dout[1] * radius];
    if (dist(current, ep1) > 1e-6)
      elems.push({ kind: "PIPE", start: current, end: ep1, source: `S${i}` });
    elems.push({ kind: "BEND", ep1, ep2, cp: corner, radius, angle_deg: 90, skey });
    current = ep2;
  }
  if (dist(current, route[route.length - 1]) > 1e-6)
    elems.push({ kind: "PIPE", start: current, end: route[route.length - 1], source: `S${route.length - 1}` });
  return elems;
}

// ── Emit intersection ─────────────────────────────────────────────────────────
export function computeEmitHits(emits, baseElements) {
  return emits.map((emit) => {
    let best = null;
    baseElements.forEach((elem, idx) => {
      if (elem.kind !== "PIPE") return;
      const hit = segmentIntersection(emit.p1, emit.p2, elem.start, elem.end);
      if (!hit || !pointOnPipeInterior(elem, hit.point)) return;
      if (!best || hit.t < best.t)
        best = { emitId: emit.id, pipeIndex: idx, pipeSource: elem.source, hitPoint: hit.point, t: hit.t };
    });
    return best;
  });
}

export function applyEmitCuts(baseElements, emitHits) {
  const cutsByPipe = new Map();
  emitHits.forEach((hit) => {
    if (!hit) return;
    if (!cutsByPipe.has(hit.pipeIndex)) cutsByPipe.set(hit.pipeIndex, []);
    cutsByPipe.get(hit.pipeIndex).push(hit.hitPoint);
  });
  const out = [];
  baseElements.forEach((elem, idx) => {
    if (elem.kind === "BEND") out.push(elem);
    else out.push(...splitPipe(elem, cutsByPipe.get(idx) || []));
  });
  return out;
}

// ── Support building ──────────────────────────────────────────────────────────
export function buildAutoSupports(emitHits, supportName, supportGuidPrefix = "UCI:PS") {
  return emitHits.filter(Boolean).map((hit, idx) => ({
    id: `auto-${hit.emitId}`,
    refNo: `${hit.pipeSource}/${supportName}${String(idx + 1).padStart(3, "0")}`,
    point: hit.hitPoint,
    name: supportName,
    guid: `${supportGuidPrefix}${String(idx + 1).padStart(5, "0")}.1`,
    source: "emit",
    emitId: hit.emitId,
  }));
}

export function mergeSupports(autoSupports, manualSupports) {
  return [...autoSupports, ...manualSupports];
}

export function nearestPointOnPipe(pt, pipe) {
  const [x, y] = pt;
  const [x1, y1] = pipe.start;
  const [x2, y2] = pipe.end;
  if (isVertical(pipe))   return [x1, Math.max(Math.min(y, Math.max(y1, y2)), Math.min(y1, y2))];
  if (isHorizontal(pipe)) return [Math.max(Math.min(x, Math.max(x1, x2)), Math.min(x1, x2)), y1];
  return pipe.start;
}

// ── Bounds helpers ────────────────────────────────────────────────────────────
export function boundsFromPoints(points) {
  if (!points.length) return null;
  let minX = points[0][0], maxX = points[0][0], minY = points[0][1], maxY = points[0][1];
  points.forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}
export function expandBounds(b, pad = 0) {
  if (!b) return null;
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad, width: b.width + pad * 2, height: b.height + pad * 2 };
}
export function combineBounds(boundsList) {
  const valid = boundsList.filter(Boolean);
  if (!valid.length) return null;
  let minX = valid[0].minX, minY = valid[0].minY, maxX = valid[0].maxX, maxY = valid[0].maxY;
  valid.forEach((b) => {
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  });
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

// ── Element helpers ───────────────────────────────────────────────────────────
export function getElementPoints(elem) {
  if (elem.kind === "PIPE") return [elem.start, elem.end];
  return [elem.ep1, elem.ep2, elem.cp];
}
export function getEmitBounds(emit, hit) {
  return boundsFromPoints([emit.p1, emit.p2, ...(hit ? [hit.hitPoint] : [])]);
}

// ── Hit-testing helpers ───────────────────────────────────────────────────────
export function pointToSegmentDistance(pt, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1]];
  const ap = [pt[0] - a[0], pt[1] - a[1]];
  const ab2 = ab[0] * ab[0] + ab[1] * ab[1];
  if (ab2 <= 1e-9) return dist(pt, a);
  let t = (ap[0] * ab[0] + ap[1] * ab[1]) / ab2;
  t = Math.max(0, Math.min(1, t));
  const proj = [a[0] + ab[0] * t, a[1] + ab[1] * t];
  return dist(pt, proj);
}
export function pointNearEmit(pt, emit, toleranceWorld) {
  return pointToSegmentDistance(pt, emit.p1, emit.p2) <= toleranceWorld;
}
export function pointNearPipe(pt, pipe, toleranceWorld) {
  return pointToSegmentDistance(pt, pipe.start, pipe.end) <= toleranceWorld;
}
export function pointNearBend(pt, bend, toleranceWorld) {
  return (
    dist(pt, bend.cp) <= toleranceWorld * 1.3 ||
    pointToSegmentDistance(pt, bend.ep1, bend.cp) <= toleranceWorld ||
    pointToSegmentDistance(pt, bend.cp, bend.ep2) <= toleranceWorld
  );
}
export function pointNearSupport(pt, support, toleranceWorld) {
  return dist(pt, support.point) <= toleranceWorld;
}
export function inferHoverId(worldPoint, emits, finalElements, supports, toleranceWorld) {
  for (let i = supports.length - 1; i >= 0; i--)
    if (pointNearSupport(worldPoint, supports[i], toleranceWorld)) return `support:${supports[i].id}`;
  for (let i = emits.length - 1; i >= 0; i--)
    if (pointNearEmit(worldPoint, emits[i], toleranceWorld)) return `emit:${emits[i].id}`;
  for (let i = finalElements.length - 1; i >= 0; i--) {
    const elem = finalElements[i];
    if (elem.kind === "PIPE" && pointNearPipe(worldPoint, elem, toleranceWorld)) return `pipe:${i}`;
    if (elem.kind === "BEND" && pointNearBend(worldPoint, elem, toleranceWorld)) return `bend:${i}`;
  }
  return null;
}
