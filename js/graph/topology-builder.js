/**
 * topology-builder.js — Build adjacency graph from component endpoints
 * Nodes = components (by refno). Edges = shared endpoint coordinates.
 * Matching uses coordKey snapping within continuityTolerance.
 *
 * Exports:
 *   buildTopology(groups, config) → { nodes, adj, endpointIndex }
 */

import { coordKey }    from '../geometry/coord-engine.js';
import { buildPts }    from '../converter/point-builder.js';
import { info, warn }  from '../logger.js';

const MOD = 'topology-builder';

/** Get the "output" endpoint coordinates for topology matching */
const _getEndpointCoords = (group) => {
  const pts = group.pts;
  const type = group.pcfType;
  const coords = [];

  if (type === 'SUPPORT') {
    if (pts['0']) coords.push({ E: pts['0'].E, N: pts['0'].N, U: pts['0'].U });
    return coords;
  }
  if (type === 'OLET') {
    if (pts['0']) coords.push({ E: pts['0'].E, N: pts['0'].N, U: pts['0'].U });
    if (pts['3']) coords.push({ E: pts['3'].E, N: pts['3'].N, U: pts['3'].U });
    return coords;
  }
  // All others: use EP1 and EP2
  if (pts['1']) coords.push({ E: pts['1'].E, N: pts['1'].N, U: pts['1'].U });
  if (pts['2']) coords.push({ E: pts['2'].E, N: pts['2'].N, U: pts['2'].U });
  // TEE also has branch point
  if (type === 'TEE' && pts['3']) {
    coords.push({ E: pts['3'].E, N: pts['3'].N, U: pts['3'].U });
  }
  return coords;
};

/**
 * Build topology graph.
 * @param {Map<string, ComponentGroup>} groups
 * @param {object} config
 * @returns {{ nodes: Map, adj: Map, endpointIndex: Map }}
 */
export const buildTopology = (groups, config) => {
  const tolerance = config?.coordinateSettings?.continuityTolerance ?? 0.5;

  // Ensure pts are built (using coreData or fallback)
  for (const [, g] of groups) {
    if (!g.pts) {
        g.pts = buildPts(g, config);
        // Trace if pts are missing after build (implies coreData failure)
        if (!g.pts || Object.keys(g.pts).length === 0) {
            warn(MOD, 'buildTopology', `Failed to build points for ${g.refno}`, { refno: g.refno });
        }
    }
  }

  // Build endpoint index: coordKey → [refno, ...]
  const endpointIndex = new Map();
  const nodes = new Map();

  for (const [refno, group] of groups) {
    if (group.skip) continue;
    const coords = _getEndpointCoords(group);
    nodes.set(refno, { group, coords });
    for (const coord of coords) {
      const key = coordKey(coord, tolerance);
      if (!endpointIndex.has(key)) endpointIndex.set(key, []);
      endpointIndex.get(key).push(refno);
    }
  }

  // Build adjacency from shared endpoint keys
  const adj = new Map();
  for (const [refno] of nodes) adj.set(refno, new Set());

  for (const [, connectedRefnos] of endpointIndex) {
    if (connectedRefnos.length < 2) continue;
    for (let i = 0; i < connectedRefnos.length; i++) {
      for (let j = i + 1; j < connectedRefnos.length; j++) {
        const a = connectedRefnos[i];
        const b = connectedRefnos[j];
        if (a !== b) {
          adj.get(a)?.add(b);
          adj.get(b)?.add(a);
        }
      }
    }
  }

  // Convert Sets to Arrays for serialisability
  const adjArray = new Map([...adj].map(([k, v]) => [k, [...v]]));

  info(MOD, 'buildTopology', 'Topology built', {
    nodeCount: nodes.size,
    edgeCount: [...adjArray.values()].reduce((s, v) => s + v.length, 0) / 2,
    tolerance,
  });

  return { nodes, adj: adjArray, endpointIndex };
};
