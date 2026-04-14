/**
 * coord-support-probe.js
 * Red-dot probe logic ported from MAIN JS.
 *
 * Flow:
 *   1. User provides support-coordinate points (x, y).
 *   2. Each point emits rays in ±X and ±Y to find the nearest pipe.
 *   3. The nearest hit becomes a SUPPORT entry in the PCF.
 *
 * The topology components from coord-topology-analyzer.js use
 * { type, ep1: {x,y,z}, ep2: {x,y,z} }.  This module converts them
 * to the internal 2-D format used by the probe functions, then
 * converts results back.
 */

// ── Geometry helpers ──────────────────────────────────────────────────────────

function isClose(a, b, tol = 1e-9) {
  return Math.abs(a - b) <= tol;
}

function dist2(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pipeIsVertical(pipe, tol = 1e-9) {
  return isClose(pipe.start[0], pipe.end[0], tol) &&
        !isClose(pipe.start[1], pipe.end[1], tol);
}

function pipeIsHorizontal(pipe, tol = 1e-9) {
  return isClose(pipe.start[1], pipe.end[1], tol) &&
        !isClose(pipe.start[0], pipe.end[0], tol);
}

function pointOnPipeInterior(pipe, pt, tol = 1e-9) {
  const [x, y] = pt;
  const [x1, y1] = pipe.start;
  const [x2, y2] = pipe.end;
  if (pipeIsVertical(pipe, tol)) {
    return isClose(x, x1, tol) &&
           y > Math.min(y1, y2) + tol &&
           y < Math.max(y1, y2) - tol;
  }
  if (pipeIsHorizontal(pipe, tol)) {
    return isClose(y, y1, tol) &&
           x > Math.min(x1, x2) + tol &&
           x < Math.max(x1, x2) - tol;
  }
  return false;
}

function pointParamOnPipe(pipe, pt) {
  const [x1, y1] = pipe.start;
  const [x2, y2] = pipe.end;
  const [x, y]   = pt;
  const dx = x2 - x1, dy = y2 - y1;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return Math.abs(dx) < 1e-12 ? 0 : (x - x1) / dx;
  }
  return Math.abs(dy) < 1e-12 ? 0 : (y - y1) / dy;
}

// ── Core probe function (ported exactly from MAIN JS) ────────────────────────

/**
 * From a single red point, probe ±X and ±Y to find the nearest pipe hit.
 * @param {[number,number]} redPoint
 * @param {Array<{kind:string, start:[number,number], end:[number,number]}>} orderedElements
 * @param {number} probeLen
 * @returns {{ red_point, hit_point, distance, direction, pipe_order_index, pipe_source } | null}
 */
function findNearestHitForRed(redPoint, orderedElements, probeLen, tol = 1e-9) {
  const [rx, ry] = redPoint;
  let best = null;

  for (let orderIdx = 0; orderIdx < orderedElements.length; orderIdx++) {
    const elem = orderedElements[orderIdx];
    if (elem.kind !== 'PIPE') continue;

    const [x1, y1] = elem.start;
    const [x2, y2] = elem.end;

    if (pipeIsVertical(elem)) {
      const px = x1;
      if (Math.min(y1, y2) - tol <= ry && ry <= Math.max(y1, y2) + tol) {
        let d = px - rx;
        if (tol < d && d <= probeLen + tol) {
          const cand = [d, orderIdx, [px, ry], '+X', elem.source];
          if (!best || cand[0] < best[0]) best = cand;
        }
        d = rx - px;
        if (tol < d && d <= probeLen + tol) {
          const cand = [d, orderIdx, [px, ry], '-X', elem.source];
          if (!best || cand[0] < best[0]) best = cand;
        }
      }
    } else if (pipeIsHorizontal(elem)) {
      const py = y1;
      if (Math.min(x1, x2) - tol <= rx && rx <= Math.max(x1, x2) + tol) {
        let d = py - ry;
        if (tol < d && d <= probeLen + tol) {
          const cand = [d, orderIdx, [rx, py], '+Y', elem.source];
          if (!best || cand[0] < best[0]) best = cand;
        }
        d = ry - py;
        if (tol < d && d <= probeLen + tol) {
          const cand = [d, orderIdx, [rx, py], '-Y', elem.source];
          if (!best || cand[0] < best[0]) best = cand;
        }
      }
    }
  }

  if (!best) return null;
  const [distance, pipeOrderIndex, hitPoint, direction, pipeSource] = best;
  return { red_point: redPoint, hit_point: hitPoint, distance, direction, pipe_order_index: pipeOrderIndex, pipe_source: pipeSource };
}

// ── Pipe splitting (ported exactly from MAIN JS) ──────────────────────────────

function splitPipeAtPoints(pipe, cutPoints) {
  if (!cutPoints.length) return [pipe];
  // Filter cut points too close to pipe endpoints (within 2mm) to avoid zero-length segments
  const filtered = cutPoints.filter(cp =>
    dist2(cp, pipe.start) > 4 && dist2(cp, pipe.end) > 4
  );
  if (!filtered.length) return [pipe];
  const pts = [pipe.start, ...filtered, pipe.end].sort(
    (a, b) => pointParamOnPipe(pipe, a) - pointParamOnPipe(pipe, b)
  );
  const deduped = [];
  for (const p of pts) {
    if (!deduped.length || dist2(deduped[deduped.length - 1], p) > 1e-9) deduped.push(p);
  }
  const out = [];
  for (let i = 0; i < deduped.length - 1; i++) {
    // Only emit segment if length > 1mm (dist2 is squared distance, so >1.0 means >1mm)
    if (dist2(deduped[i], deduped[i + 1]) > 1.0) {
      out.push({ kind: 'PIPE', start: deduped[i], end: deduped[i + 1], source: pipe.source, _orig: pipe._orig });
    }
  }
  return out.length ? out : [pipe];
}

// ── Apply red cuts (ported exactly from MAIN JS) ──────────────────────────────

function applyRedCutsToOrderedElements(orderedElements, redPoints, probeLen) {
  const cutsByPipeOrderIdx = new Map();
  const hits = [];

  for (const red of redPoints) {
    const hit = findNearestHitForRed(red, orderedElements, probeLen);
    if (!hit) continue;
    hits.push(hit);
    const pipe = orderedElements[hit.pipe_order_index];
    if (pipe.kind === 'PIPE' && pointOnPipeInterior(pipe, hit.hit_point)) {
      if (!cutsByPipeOrderIdx.has(hit.pipe_order_index)) cutsByPipeOrderIdx.set(hit.pipe_order_index, []);
      cutsByPipeOrderIdx.get(hit.pipe_order_index).push(hit.hit_point);
    }
  }

  const finalElements = [];
  for (let i = 0; i < orderedElements.length; i++) {
    const elem = orderedElements[i];
    if (elem.kind === 'BEND') {
      finalElements.push(elem);
    } else {
      finalElements.push(...splitPipeAtPoints(elem, cutsByPipeOrderIdx.get(i) || []));
    }
  }

  return { final_elements: finalElements, hits };
}

// ── Adapter: topology components → probe-friendly ordered elements ────────────

/**
 * Converts ClassifiedComponent[] (from analyzeTopology) into the 2-D
 * ordered-element format expected by the probe functions.
 *
 * Only PIPE and BEND components carry through; TEE/SUPPORT are ignored
 * because the probe works on straight pipe runs only.
 *
 * @param {Array<{type:string, ep1:{x,y,z}, ep2:{x,y,z}}>} components
 * @returns {Array<{kind:string, start:[number,number], end:[number,number], source:string}>}
 */
export function componentsToOrderedElements(components) {
  return components
    .filter(c => c.type === 'PIPE' || c.type === 'BEND')
    .map((c, i) => {
      if (c.type === 'PIPE') {
        return {
          kind: 'PIPE',
          start: [c.ep1.x, c.ep1.y],
          end:   [c.ep2.x, c.ep2.y],
          source: `S${i + 1}`,
          _orig: c,
        };
      }
      // BEND
      return {
        kind: 'BEND',
        ep1:  [c.ep1.x, c.ep1.y],
        ep2:  [c.ep2.x, c.ep2.y],
        cp:   c.cp ? [c.cp.x, c.cp.y] : [c.ep1.x, c.ep1.y],
        source: `S${i + 1}`,
        _orig: c,
      };
    });
}

// ── Text coordinate parser ────────────────────────────────────────────────────

/**
 * Parses freeform text into [x, y] coordinate pairs.
 *
 * Accepted formats (one per line or JSON array):
 *   x, y
 *   x y
 *   [x, y]
 *   [[x1,y1],[x2,y2],...]   (full JSON array)
 *   Lines starting with # are treated as comments.
 *
 * @param {string} text
 * @returns {{ points: [number,number][], errors: string[] }}
 */
export function parseCoordText(text) {
  const points = [];
  const errors = [];

  if (!text || !text.trim()) return { points, errors };

  // Step 1: Sanitize — normalize line endings, strip invisible chars, remove AutoCAD prompts
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/Press ENTER to continue:/gi, '')
    .replace(/[\u200B\uFEFF\u00A0]/g, ' ');

  // Step 2: Parse AutoCAD LIST output format: "at point  X = 1234.5  Y = 5678.9  Z = 0.0"
  const atPointRegex = /at\s+point\s+X\s*=\s*([-+]?\d*\.?\d+)\s+Y\s*=\s*([-+]?\d*\.?\d+)(?:\s+Z\s*=\s*([-+]?\d*\.?\d+))?/gi;
  const atPoints = [];
  let m;
  while ((m = atPointRegex.exec(text)) !== null) {
    atPoints.push([parseFloat(m[1]), parseFloat(m[2])]);
  }
  if (atPoints.length > 0) return { points: atPoints, errors };

  // Try full JSON array first
  const stripped = text.trim();
  if (stripped.startsWith('[') && stripped.includes('[')) {
    try {
      const arr = JSON.parse(stripped);
      if (Array.isArray(arr)) {
        arr.forEach((item, i) => {
          if (Array.isArray(item) && item.length >= 2) {
            const x = Number(item[0]), y = Number(item[1]);
            if (isFinite(x) && isFinite(y)) {
              points.push([x, y]);
            } else {
              errors.push(`Item ${i + 1}: non-numeric values`);
            }
          } else {
            errors.push(`Item ${i + 1}: expected [x, y]`);
          }
        });
        return { points, errors };
      }
    } catch (_) {
      // Not valid JSON — fall through to line-by-line
    }
  }

  // Line-by-line parsing
  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, lineIdx) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;

    // Strip optional [ ] brackets
    const clean = line.replace(/^\[|\]$/g, '').trim();

    // Split on comma or whitespace
    const parts = clean.split(/[,\s]+/).filter(Boolean);
    if (parts.length < 2) {
      errors.push(`Line ${lineIdx + 1}: expected at least 2 values, got "${line}"`);
      return;
    }

    const x = Number(parts[0]);
    const y = Number(parts[1]);

    if (!isFinite(x) || !isFinite(y)) {
      errors.push(`Line ${lineIdx + 1}: non-numeric values in "${line}"`);
      return;
    }

    points.push([x, y]);
  });

  return { points, errors };
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Runs the full support-probe pipeline.
 *
 * @param {Array} topologyComponents   — from analyzeTopology()
 * @param {[number,number][]} redPoints — probe origins
 * @param {number} probeLen            — max probe distance in model units
 * @param {string} supportName         — e.g. 'CA150'
 * @returns {{
 *   supportComponents: Array<{type:'SUPPORT', supportName:string, coords:{x,y,z}}>,
 *   hits: Array,
 *   log: string[]
 * }}
 */
export function runSupportProbe(topologyComponents, redPoints, probeLen, supportName = 'CA150') {
  const ordered = componentsToOrderedElements(topologyComponents);
  const { final_elements, hits } = applyRedCutsToOrderedElements(ordered, redPoints, probeLen);

  const log = [`[Support Probe] ${redPoints.length} probe point(s), ${hits.length} hit(s)`];

  // Collect all existing pipe endpoints for proximity guard
  const pipeEndpoints = topologyComponents
    .filter(c => c.type === 'PIPE')
    .flatMap(c => [[c.ep1.x, c.ep1.y], [c.ep2.x, c.ep2.y]]);

  const supportComponents = hits
    .filter((h, i) => {
      // Skip hit if within 2mm of an existing pipe endpoint (would produce zero-length split)
      const tooClose = pipeEndpoints.some(ep => dist2(h.hit_point, ep) <= 4);
      if (tooClose) {
        log.push(`  skip: hit=(${h.hit_point[0].toFixed(2)}, ${h.hit_point[1].toFixed(2)}) — within 2mm of pipe endpoint`);
      }
      return !tooClose;
    })
    .map((h, i) => {
      log.push(`  ${i + 1}. red=(${h.red_point}) → hit=(${h.hit_point[0].toFixed(2)}, ${h.hit_point[1].toFixed(2)}) dir=${h.direction} dist=${h.distance.toFixed(2)}`);
      return {
        type: 'SUPPORT',
        supportName,
        coords: { x: h.hit_point[0], y: h.hit_point[1], z: 0 },
      };
    });

  // Convert final_elements (split pipes) back to topology component format
  const segmentedComponents = final_elements.map(elem => {
    if (elem.kind === 'BEND') {
      return elem._orig;  // keep all original BEND properties (bore, radius, angleDeg, cp…)
    }
    // PIPE — may be a split sub-segment; override ep1/ep2 with split endpoints
    return {
      ...(elem._orig || {}),
      type: 'PIPE',
      ep1: { x: elem.start[0], y: elem.start[1], z: elem._orig?.ep1?.z ?? 0 },
      ep2: { x: elem.end[0],   y: elem.end[1],   z: elem._orig?.ep2?.z ?? 0 },
    };
  });

  log.push(`[Support Probe] ${segmentedComponents.filter(c => c.type === 'PIPE').length} pipe segment(s) after split (was ${topologyComponents.filter(c => c.type === 'PIPE').length})`);

  return { supportComponents, segmentedComponents, hits, log };
}
