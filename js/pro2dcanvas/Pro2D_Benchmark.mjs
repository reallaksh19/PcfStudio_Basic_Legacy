// Use browser's window.performance or fallback if needed
const perf = typeof window !== 'undefined' && window.performance ? window.performance : { now: () => Date.now() };

import { Pro2D_buildMockState, Pro2D_toSceneBundle } from './Pro2D_Canonical.mjs';
import { Pro2D_validateState } from './Pro2D_ValidationEngine.mjs';
import { Pro2D_runEmitPipeline, Pro2D_extractPipelineInput } from './Pro2D_EmitEngine.mjs';

export function Pro2D_runBenchmark(doc = null) {
  const t0 = perf.now();
  const state = doc || Pro2D_buildMockState();
  const t1 = perf.now();
  Pro2D_validateState(state);
  const t2 = perf.now();
  Pro2D_toSceneBundle(state);
  const t3 = perf.now();
  Pro2D_runEmitPipeline(Pro2D_extractPipelineInput(state));
  const t4 = perf.now();
  const big = Pro2D_buildMockState();
  for (let i = 0; i < 2000; i += 1) {
    const baseId = `seg_b_${i}`;
    big.nodes[`n_b_${i}_1`] = { id: `n_b_${i}_1`, pt: { x: i, y: i }, entityIds: [baseId] };
    big.nodes[`n_b_${i}_2`] = { id: `n_b_${i}_2`, pt: { x: i + 10, y: i }, entityIds: [baseId] };
    big.entities[baseId] = { id: baseId, type: 'PIPE', layerId: 'Default', routeId: 'route_big', geometry: { nodeIds: [`n_b_${i}_1`,`n_b_${i}_2`] }, topology: { connectionNodeIds: [`n_b_${i}_1`,`n_b_${i}_2`] }, engineering: { nd: 250 }, display: { visible: true }, metadata: {}, provenance: [], dynamic: {} };
  }
  const t5 = perf.now();
  Pro2D_validateState(big);
  const t6 = perf.now();
  return {
    phase1LoadMs: +(t1 - t0).toFixed(3),
    phase1ValidateMs: +(t2 - t1).toFixed(3),
    phase1SceneBundleMs: +(t3 - t2).toFixed(3),
    phase2EmitPipelineMs: +(t4 - t3).toFixed(3),
    phase3Load10kMs: +(t5 - t4).toFixed(3),
    phase3Validate10kMs: +(t6 - t5).toFixed(3),
  };
}
