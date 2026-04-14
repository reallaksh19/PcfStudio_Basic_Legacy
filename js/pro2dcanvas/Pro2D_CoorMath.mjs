export const Pro2D_elbowCLR = {
  15: 38.1, 20: 38.1, 25: 38.1, 32: 47.6, 40: 57.2, 50: 76.2, 65: 95.3,
  80: 114.3, 100: 152.4, 150: 228.6, 200: 304.8, 250: 381.0, 300: 457.2,
};

export function Pro2D_dist(a, b) { return Math.hypot(a[0]-b[0], a[1]-b[1]); }
export function Pro2D_sub(a, b) { return [a[0]-b[0], a[1]-b[1]]; }
export function Pro2D_unit(v) {
  const L = Math.hypot(v[0], v[1]);
  return L <= 1e-9 ? [0,0] : [v[0]/L, v[1]/L];
}
export function Pro2D_cross(a, b) { return a[0]*b[1] - a[1]*b[0]; }
export function Pro2D_isClose(a, b, tol = 1e-6) { return Math.abs(a - b) <= tol; }
export function Pro2D_isVertical(pipe) { return Pro2D_isClose(pipe.start[0], pipe.end[0]) && !Pro2D_isClose(pipe.start[1], pipe.end[1]); }
export function Pro2D_isHorizontal(pipe) { return Pro2D_isClose(pipe.start[1], pipe.end[1]) && !Pro2D_isClose(pipe.start[0], pipe.end[0]); }
export function Pro2D_pipeParam(pipe, pt) {
  const [x1, y1] = pipe.start, [x2, y2] = pipe.end, [x, y] = pt;
  if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) return Math.abs(x2 - x1) < 1e-9 ? 0 : (x - x1) / (x2 - x1);
  return Math.abs(y2 - y1) < 1e-9 ? 0 : (y - y1) / (y2 - y1);
}
export function Pro2D_pointOnPipeInterior(pipe, pt) {
  const [x, y] = pt, [x1, y1] = pipe.start, [x2, y2] = pipe.end;
  if (Pro2D_isVertical(pipe)) return Pro2D_isClose(x, x1) && y > Math.min(y1, y2)+1e-6 && y < Math.max(y1, y2)-1e-6;
  if (Pro2D_isHorizontal(pipe)) return Pro2D_isClose(y, y1) && x > Math.min(x1, x2)+1e-6 && x < Math.max(x1, x2)-1e-6;
  return false;
}
export function Pro2D_segmentIntersection(p, p2, q, q2) {
  const r = [p2[0]-p[0], p2[1]-p[1]];
  const s = [q2[0]-q[0], q2[1]-q[1]];
  const rxs = Pro2D_cross(r, s);
  const qp = [q[0]-p[0], q[1]-p[1]];
  const qpxr = Pro2D_cross(qp, r);
  if (Math.abs(rxs) < 1e-9 && Math.abs(qpxr) < 1e-9) return null;
  if (Math.abs(rxs) < 1e-9) return null;
  const t = Pro2D_cross(qp, s) / rxs;
  const u = Pro2D_cross(qp, r) / rxs;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { point: [p[0] + t*r[0], p[1] + t*r[1]], t, u };
}
export function Pro2D_splitPipe(pipe, cutPoints) {
  if (!cutPoints.length) return [pipe];
  const pts = [pipe.start, ...cutPoints, pipe.end].sort((a,b) => Pro2D_pipeParam(pipe,a)-Pro2D_pipeParam(pipe,b));
  const unique = [];
  for (const p of pts) {
    if (!unique.length || Pro2D_dist(unique[unique.length-1], p) > 1e-6) unique.push(p);
  }
  const out = [];
  for (let i=0;i<unique.length-1;i++) {
    if (Pro2D_dist(unique[i], unique[i+1]) > 1e-6) out.push({ kind:'PIPE', start: unique[i], end: unique[i+1], source: pipe.source });
  }
  return out;
}
export function Pro2D_buildBaseElements(route, bore, skey='BEBW') {
  const radius = Pro2D_elbowCLR[bore] ?? 381;
  const elems = [];
  let current = route[0];
  for (let i=1;i<route.length-1;i++) {
    const prev = route[i-1], corner = route[i], next = route[i+1];
    const din = Pro2D_unit(Pro2D_sub(corner, prev));
    const dout = Pro2D_unit(Pro2D_sub(next, corner));
    const turn = Pro2D_cross(din, dout);
    const lenUp = Pro2D_dist(prev, corner);
    const lenDn = Pro2D_dist(corner, next);
    if (Math.abs(Math.abs(turn)-1) > 1e-6 || lenUp < radius || lenDn < radius) {
      if (Pro2D_dist(current, corner) > 1e-6) elems.push({ kind:'PIPE', start: current, end: corner, source:`S${i}` });
      current = corner;
      continue;
    }
    const ep1 = [corner[0]-din[0]*radius, corner[1]-din[1]*radius];
    const ep2 = [corner[0]+dout[0]*radius, corner[1]+dout[1]*radius];
    if (Pro2D_dist(current, ep1) > 1e-6) elems.push({ kind:'PIPE', start: current, end: ep1, source:`S${i}` });
    elems.push({ kind:'BEND', ep1, ep2, cp: corner, radius, angle_deg: 90, skey });
    current = ep2;
  }
  if (Pro2D_dist(current, route[route.length-1]) > 1e-6) elems.push({ kind:'PIPE', start: current, end: route[route.length-1], source:`S${route.length-1}` });
  return elems;
}
export function Pro2D_computeEmitHits(emits, baseElements) {
  return emits.map((emit) => {
    let best = null;
    baseElements.forEach((elem, idx) => {
      if (elem.kind !== 'PIPE') return;
      const hit = Pro2D_segmentIntersection(emit.p1, emit.p2, elem.start, elem.end);
      if (!hit || !Pro2D_pointOnPipeInterior(elem, hit.point)) return;
      if (!best || hit.t < best.t) best = { emitId: emit.id, pipeIndex: idx, pipeSource: elem.source, hitPoint: hit.point, t: hit.t };
    });
    return best;
  });
}
export function Pro2D_applyEmitCuts(baseElements, emitHits) {
  const cutsByPipe = new Map();
  emitHits.forEach((hit) => {
    if (!hit) return;
    if (!cutsByPipe.has(hit.pipeIndex)) cutsByPipe.set(hit.pipeIndex, []);
    cutsByPipe.get(hit.pipeIndex).push(hit.hitPoint);
  });
  const out = [];
  baseElements.forEach((elem, idx) => {
    if (elem.kind === 'BEND') out.push(elem);
    else out.push(...Pro2D_splitPipe(elem, cutsByPipe.get(idx) || []));
  });
  return out;
}
export function Pro2D_buildAutoSupports(emitHits, supportName='CA150', supportGuidPrefix='UCI:PS') {
  return emitHits.filter(Boolean).map((hit, idx) => ({
    id: `auto-${hit.emitId}`,
    refNo: `${hit.pipeSource}/${supportName}${String(idx+1).padStart(3,'0')}`,
    point: hit.hitPoint,
    name: supportName,
    guid: `${supportGuidPrefix}${String(idx+1).padStart(5,'0')}.1`,
    source: 'emit',
    emitId: hit.emitId,
  }));
}
export function Pro2D_mergeSupports(autoSupports, manualSupports) {
  const seen = new Set();
  const out = [];
  for (const s of [...autoSupports, ...manualSupports]) {
    const key = `${Math.round(s.point[0])},${Math.round(s.point[1])}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// ── Advanced geometry helpers ───────────────────────────────────────────────
// In addition to basic emit computations the professional editor needs the ability
// to locate the nearest point on a pipe segment and compute bounding boxes for
// arbitrary collections of points. These helpers are exported but not used in the
// current smoke tests; they support future tooling such as snapping, collision
// detection and viewport fitting without imposing additional runtime cost when
// unused.

/**
 * Compute the nearest point on a pipe segment to a given point. If the pipe is
 * axis‑aligned the projection will clamp to the pipe extents. For diagonal
 * segments (not currently generated in the base emit engine) the start point
 * is returned as a safe fallback. All inputs are two‑element numeric arrays
 * `[x, y]`.
 * @param {[number,number]} pt Arbitrary query point
 * @param {{ start:[number,number], end:[number,number] }} pipe Segment description
 * @returns {[number,number]} Nearest point on the pipe to the query point
 */
export function Pro2D_nearestPointOnPipe(pt, pipe) {
  const [x, y] = pt;
  const [x1, y1] = pipe.start;
  const [x2, y2] = pipe.end;
  // If vertical, clamp in Y and fix X
  if (Pro2D_isVertical(pipe)) {
    return [x1, Math.max(Math.min(y, Math.max(y1, y2)), Math.min(y1, y2))];
  }
  // If horizontal, clamp in X and fix Y
  if (Pro2D_isHorizontal(pipe)) {
    return [Math.max(Math.min(x, Math.max(x1, x2)), Math.min(x1, x2)), y1];
  }
  // For non‑orthogonal segments we do not yet support projection – return the
  // start point as a reasonable placeholder. Future implementations may
  // implement full point–line projection.
  return pipe.start;
}

/**
 * Compute axis‑aligned bounds from an array of points. The returned object
 * contains `minX`, `minY`, `maxX`, `maxY` as well as computed `width` and
 * `height` properties. Empty inputs yield `null`.
 * @param {Array<[number,number]>} points
 * @returns {{minX:number,minY:number,maxX:number,maxY:number,width:number,height:number}|null}
 */
export function Pro2D_boundsFromPoints(points) {
  if (!points || points.length === 0) return null;
  let minX = points[0][0];
  let maxX = points[0][0];
  let minY = points[0][1];
  let maxY = points[0][1];
  for (const [px, py] of points) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}
