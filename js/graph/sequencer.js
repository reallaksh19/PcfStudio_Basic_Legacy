/**
 * sequencer.js — Traversal Strategy Factory
 * Decides whether to use Topological Sort (DFS) or Linear Scan
 * based on the active pipeline mode.
 */

import { buildTopology } from './topology-builder.js';
import { detectStartNodes, traverse } from './branch-traverser.js';
import { info } from '../logger.js';

const MOD = 'sequencer';

/**
 * Run the appropriate sequencing strategy.
 * @param {Map<string, ComponentGroup>} groups
 * @param {object} config
 * @returns {{ ordered: string[], orphans: string[], topology: object|null }}
 */
export const runSequencer = (groups, config, customTopology = null) => {
  const mode = config?.coordinateSettings?.pipelineMode ?? 'repair';
  const chainBased = config?.coordinateSettings?.chainBasedOrder !== false; // default ON
  const tolerance = config?.coordinateSettings?.continuityTolerance ?? 25;

  // ── Universal Stage 5 P2 Gap Closure (Local Stretch) ──────────────
  // Now that a sequence sequence is definitively locked in, we iterate through
  // the ordered groups and physically stretch the P2 of the previous component
  // forward to seamlessly touch the P1 of the current component.
  const applyLocalStretch = (orderedList) => {
    for (let i = 1; i < orderedList.length; i++) {
      const prevRef = orderedList[i - 1];
      const currRef = orderedList[i];
      const prevG = groups.get(prevRef);
      const currG = groups.get(currRef);

      if (prevG?.pts?.['2'] && currG?.pts?.['1']) {
        const pEP2 = prevG.pts['2'];
        const cEP1 = currG.pts['1'];
        if (pEP2.E !== undefined && cEP1.E !== undefined) {
          const dx = cEP1.E - pEP2.E;
          const dy = cEP1.N - pEP2.N;
          const dz = cEP1.U - pEP2.U;
          const gap = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (currRef.includes('1670') || prevRef.includes('1668')) {
            window[`__DEBUG_1668_GAP_${gap.toFixed(3)}`] = `Prev: ${prevRef} Curr: ${currRef} d=${gap.toFixed(2)}`;
          }

          // If it's a micro-gap within tolerance, literally stretch P2 forward
          // We ignore Sequence Number boundaries here because if they are routed adjacent,
          // they physically touch.
          if (gap > 0.001 && gap <= tolerance) {
            prevG.pts['2'] = { ...pEP2, E: cEP1.E, N: cEP1.N, U: cEP1.U };
            info(MOD, 'runSequencer', `Stage 5: Gap-filled ${prevRef}→${currRef} (${gap.toFixed(2)}mm) by stretching P2.`);
          }
        }
      }
    }
  };

  // ── Chain-Based Order (Based on Prev/Next in PCF Table) ──────────────────
  if (chainBased && mode !== 'sequential') {
    info(MOD, 'runSequencer', 'Using CHAIN-BASED traversal (chainBasedOrder=true).');

    const visited = new Set();
    const ordered = [];

    // Build a lookup: Next(Target) field value → refno
    // Next(Target) can be a refno or seq no string
    const nextTargetMap = new Map(); // refno → nextRefno
    for (const [refno, g] of groups) {
      const r = g?.rows?.[0] || {};
      const nextTarget = String(r['Next(Target)'] || r['Next Target'] || r.NextTarget || '').trim();
      if (nextTarget && nextTarget !== 'N/A' && nextTarget !== '-') {
        nextTargetMap.set(refno, nextTarget);
      }
    }

    // Build reverse map: nextTarget value → refno of the component that IS that target
    // This lets us resolve "next target" strings (which may be seq nos) to refnos
    const targetToRefno = new Map();
    for (const [refno, g] of groups) {
      const r = g?.rows?.[0] || {};
      const seq = String(r['Seq No.'] || r.Sequence || r.Seq || '').trim();
      if (seq) targetToRefno.set(seq, refno);
      targetToRefno.set(refno, refno); // also map refno → refno
    }

    // Find starting node: Rigid=START or first non-skip
    let startRef = null;
    for (const [refno, g] of groups) {
      if (g.skip) continue;
      if (g.rows?.some(r => String(r.rigid ?? r.Rigid ?? '').toUpperCase() === 'START')) {
        startRef = refno;
        break;
      }
    }
    if (!startRef) {
      for (const [refno, g] of groups) {
        if (!g.skip) { startRef = refno; break; }
      }
    }

    // Walk chains
    const _walkChain = (ref) => {
      let current = ref;
      while (current && !visited.has(current)) {
        const g = groups.get(current);
        if (!g || g.skip) break;
        visited.add(current);
        ordered.push(current);

        // Follow Next(Target)
        const nextTargetVal = nextTargetMap.get(current);
        const nextRef = nextTargetVal ? (targetToRefno.get(nextTargetVal) || null) : null;
        current = nextRef && !visited.has(nextRef) ? nextRef : null;
      }
    };

    // Start with first chain
    if (startRef) _walkChain(startRef);

    // Start new chains for unvisited components (dead-end recovery)
    for (const [refno, g] of groups) {
      if (!g.skip && !visited.has(refno)) _walkChain(refno);
    }

    // Build topology for validation (Stage 4)
    const topology = buildTopology(groups, config);

    // Orphans: non-skip nodes not reached by any chain
    const orphans = [...groups.keys()].filter(r => {
      const g = groups.get(r);
      return !g.skip && !visited.has(r);
    });

    // Globally seal gaps across entire route array before returning
    applyLocalStretch(ordered);

    return { ordered, orphans, topology, groups };
  }

  // GATE 3: If a custom topology is provided (Phase 2), strictly follow it and ignore Phase 1 modes.
  if (mode === 'sequential' && !customTopology) {
    info(MOD, 'runSequencer', 'Using LINEAR traversal (Sequential Mode).');

    // Just return keys in insertion order.
    // Filter out skipped items? Usually skipped items are not in final PCF,
    // but traverse() result usually includes everything visited.
    // assemble() filters by !skip.

    const ordered = [...groups.keys()];

    // Globally seal gaps across entire route array before returning
    applyLocalStretch(ordered);

    return {
      ordered,
      orphans: [], // In linear mode, nothing is "orphaned" because we force visit everything
      topology: null, // No graph built
      groups // Added for Stage 5 Table UI Render
    };
  }

  // Default: Graph Mode (Strict / Repair)
  info(MOD, 'runSequencer', 'Using GRAPH traversal (Topology Mode) with enhanced geometry data.');

  // Check for Strict Sequencer Mode Override
  let topology = customTopology;

  if (!topology) {
    topology = buildTopology(groups, config);
  } else {
    info(MOD, 'runSequencer', 'Using CUSTOM connectivity graph (Strict Sequencer Mode).');
  }

  // Detect Start Nodes based on Graph
  try {
    const startNodes = detectStartNodes(groups, topology);
    const result = traverse(topology, startNodes, groups);

    // Globally seal gaps across entire route array before returning
    applyLocalStretch(result.ordered);

    return {
      ordered: result.ordered,
      orphans: result.orphans,
      topology,
      groups // Added for Stage 5 Table UI Render
    };
  } catch (e) {
    console.error('[Sequencer] Traversal failed:', e);
    // Fallback to sequential
    const ordered = [...groups.keys()];
    applyLocalStretch(ordered);
    return {
      ordered,
      orphans: [],
      topology
    };
  }

};
