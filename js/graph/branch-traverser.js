/**
 * branch-traverser.js — DFS traversal for correct PCF output ordering
 * Main run is followed first; branch runs are queued and output after.
 * Handles multiple disconnected segments (multiple START nodes).
 *
 * Exports:
 *   detectStartNodes(groups)              → refno[]
 *   traverse(topology, startNodes, groups) → { ordered: refno[], orphans: refno[] }
 */

import { info, warn } from '../logger.js';

const MOD = 'branch-traverser';

/**
 * Detect start nodes from groups.
 * Priority: (1) rows with Rigid='START', (2) first refno in map (insertion order).
 * @param {Map<string, ComponentGroup>} groups
 * @returns {string[]}
 */
export const detectStartNodes = (groups) => {
  const starts = [];
  for (const [refno, group] of groups) {
    if (group.skip) continue;
    let hasStart = false;
    if (group.rows) {
      hasStart = group.rows.some(r => String(r.rigid ?? r.Rigid ?? '').toUpperCase() === 'START');
    } else if (group.items) {
      hasStart = group.items.some(comp => {
        const attrs = Object.values(comp.attributes || {});
        return attrs.some(a => String(a).toUpperCase() === 'START');
      });
    }

    if (hasStart) starts.push(refno);
  }
  if (starts.length > 0) {
    info(MOD, 'detectStartNodes', `Found ${starts.length} START-marked nodes`, { starts });
    return starts;
  }
  // Fallback: first non-skip node
  for (const [refno, group] of groups) {
    if (!group.skip) {
      warn(MOD, 'detectStartNodes', 'No Rigid=START found — using first component as start', {
        refno, hint: 'Mark the pipeline start node with Rigid=START in CSV',
      });
      return [refno];
    }
  }
  return [];
};

/**
 * Classify TEE neighbours into main-run continuation and branch.
 * For Phase 2 Strict Mode, we trust the topological Graph unconditionally.
 * @param {string}  teeRefno
 * @param {object}  topology
 * @param {Map}     groups
 * @returns {{ mainContinuation: string[], branchStarts: string[] }}
 */
const _classifyTeeNeighbours = (teeRefno, topology, groups) => {
  const neighbours = Array.from(topology.adj.get(teeRefno) ?? []);
  const mainContinuation = [];
  const branchStarts = [];

  // In Phase 2 Strict Mode, the Table Graph ALREADY perfectly defines the topology.
  // Synthetic Gap pipes do not have coordinates, so Euclidean checks will crash or drop them.
  // We just push the first two connections to main, and the 3rd to branch.
  for (let i = 0; i < neighbours.length; i++) {
    if (i < 2) {
      mainContinuation.push(neighbours[i]);
    } else {
      branchStarts.push(neighbours[i]);
    }
  }

  return { mainContinuation, branchStarts };
};


/**
 * DFS traversal from start nodes.
 * Main run: depth-first inline. Branches: queued to process after main run.
 * @param {object} topology          - { nodes, adj }
 * @param {string[]} startNodes
 * @param {Map<string, ComponentGroup>} groups
 * @returns {{ ordered: string[], orphans: string[] }}
 */
export const traverse = (topology, startNodes, groups) => {
  const ordered = [];
  const visited = new Set();
  // Stack entries: { refno, isBranch }
  const stack = startNodes.map(r => ({ refno: r, isBranch: false }));
  const branchQueue = [];

  const _visit = (refno) => {
    if (visited.has(refno)) return;
    visited.add(refno);
    ordered.push(refno);

    const group = groups.get(refno);
    const neighbours = Array.from(topology.adj.get(refno) ?? []);

    const isTee = group?.pcfType === 'TEE' || (group?.items && group.items[0]?.type === 'TEE');

    if (isTee) {
      const { mainContinuation, branchStarts } =
        _classifyTeeNeighbours(refno, topology, groups);
      // Visit main run first (push to front of stack)
      for (const r of mainContinuation.filter(r => !visited.has(r))) stack.unshift({ refno: r });
      // Queue branches for later
      for (const r of branchStarts.filter(r => !visited.has(r))) branchQueue.push(r);
    } else {
      for (const r of neighbours.filter(r => !visited.has(r))) stack.unshift({ refno: r });
    }
  };

  while (stack.length > 0 || branchQueue.length > 0) {
    if (stack.length > 0) {
      _visit(stack.shift().refno);
    } else if (branchQueue.length > 0) {
      _visit(branchQueue.shift());
    }
  }

  // Orphans: non-skip nodes never visited
  const orphans = [...groups.keys()].filter(r => {
    const g = groups.get(r);
    return !g.skip && !visited.has(r);
  });

  if (orphans.length > 0) {
    warn(MOD, 'traverse', `${orphans.length} orphan components detected`, {
      orphans,
      hint: 'These components have no coordinate match to any other component — check for coordinate gaps',
    });
  }

  info(MOD, 'traverse', 'Traversal complete', {
    ordered: ordered.length, orphans: orphans.length, startNodes,
  });

  return { ordered, orphans };
};
