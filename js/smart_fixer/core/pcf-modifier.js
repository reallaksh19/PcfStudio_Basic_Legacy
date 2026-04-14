/**
 * js/smart_fixer/core/pcf-modifier.js
 * Applies approved fixes from the Data Table to the component sequence.
 * DEPRECATED: With the new PcfTopologyGraph, this logic is natively handled
 * within graph.applyApprovedMutations(). This file acts as a wrapper for
 * backwards compatibility if anything still directly calls applyApprovedFixes.
 */

import { PcfTopologyGraph_2 } from './PcfTopologyGraph_2.js';

export function applyApprovedFixes(components) {
    if (!components || components.length === 0) return { revisedComponents: [], visualGaps: [] };

    // Pass the global application config to the graph to ensure Common3DLogic rules apply
    const appConfig = window.appConfig || {};

    // We instantiate a new graph with the components (which already contain
    // the mutation proposals like comp._fixes set by the UI or the previous pass).
    const graph = new PcfTopologyGraph_2(components, appConfig);

    // Applying the mutations re-links the graph and applies the exact x,y,z fixes
    // or inserts new PIPEs safely based on the objects
    const result = graph.applyApprovedMutations();

    // The previous code expected an array of updated components returned, but we
    // must return both to allow the UI to correctly sync the visual state.
    // Since some legacy callers might expect an array, we handle that upstream, but
    // returning the full result object here is necessary for proper decoupling.
    return result;
}
