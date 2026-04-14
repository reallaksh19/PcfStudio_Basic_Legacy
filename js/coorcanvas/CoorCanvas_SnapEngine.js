/**
 * CoorCanvas_SnapEngine.js
 * Snap-to-pipe logic for the CoorCanvas pipeline.
 *
 * Snap types returned by findPipeSnap:
 *   "endpoint"  – snapped to a pipe start/end vertex (green square □)
 *   "midpoint"  – snapped to the midpoint of a pipe segment (yellow triangle △)
 *   "nearest"   – snapped to the closest point on the pipe (cyan cross ×)
 *
 * The snapType is used by CoorCanvas_AppShell.jsx to render the correct OSnap marker.
 */

import { dist, isVertical, isHorizontal, nearestPointOnPipe } from './CoorCanvas_GeometryUtils.js';

/** Round a single numeric value for PCF output. */
export function snap(v, roundToMm) {
  return roundToMm ? Math.round(v) : Number(v.toFixed(4));
}

/** Round a 2-D point for PCF output. */
export function snapPoint(p, roundToMm) {
  return [snap(p[0], roundToMm), snap(p[1], roundToMm)];
}

/**
 * Find the closest snap point on any PIPE element within toleranceWorld.
 * Returns `{ point, distance, pipeIndex, pipeSource, snapType }` or null.
 *
 * Priority: endpoint > midpoint > nearest-on-pipe
 */
export function findPipeSnap(worldPoint, baseElements, toleranceWorld) {
  let best = null;

  baseElements.forEach((elem, idx) => {
    if (elem.kind !== "PIPE") return;

    // 1. Endpoint snap (highest priority)
    for (const endpoint of [elem.start, elem.end]) {
      const d = dist(worldPoint, endpoint);
      if (d <= toleranceWorld * 0.7 && (!best || d < best.distance || best.snapType === "nearest")) {
        best = { point: endpoint, distance: d, pipeIndex: idx, pipeSource: elem.source, snapType: "endpoint" };
      }
    }

    // 2. Midpoint snap
    const mid = [(elem.start[0] + elem.end[0]) / 2, (elem.start[1] + elem.end[1]) / 2];
    const dm = dist(worldPoint, mid);
    if (dm <= toleranceWorld * 0.8 && (!best || dm < best.distance || (best.snapType === "nearest" && dm <= best.distance))) {
      best = { point: mid, distance: dm, pipeIndex: idx, pipeSource: elem.source, snapType: "midpoint" };
    }

    // 3. Nearest-on-pipe snap (fallback, only if no better snap yet)
    if (!best || best.snapType === "nearest") {
      const point = nearestPointOnPipe(worldPoint, elem);
      const d = dist(worldPoint, point);
      if (d <= toleranceWorld && (!best || d < best.distance)) {
        best = { point, distance: d, pipeIndex: idx, pipeSource: elem.source, snapType: "nearest" };
      }
    }
  });

  return best;
}
