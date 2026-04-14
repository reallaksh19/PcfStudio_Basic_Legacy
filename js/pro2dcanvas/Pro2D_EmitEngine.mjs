import { Pro2D_mockRoute, Pro2D_mockEmits } from './Pro2D_MockData.mjs';

function dist(a, b) { return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0)); }

export function Pro2D_extractPipelineInput(doc) {
  const route = [];
  const emits = [];
  const pipeEntities = Object.values(doc?.entities || {}).filter((e) => e.type === 'PIPE');
  pipeEntities.forEach((pipe) => {
    (pipe.geometry?.nodeIds || []).forEach((nodeId) => {
      const node = doc.nodes?.[nodeId];
      if (node) route.push({ x: node.pt.x, y: node.pt.y });
    });
  });
  Object.values(doc?.entities || {}).filter((e) => e.type === 'EMIT').forEach((emit) => {
    emits.push({ id: emit.id, p1: emit.geometry?.start, p2: emit.geometry?.end });
  });
  return { route: route.length ? route : Pro2D_mockRoute, emits: emits.length ? emits : Pro2D_mockEmits, bore: pipeEntities[0]?.engineering?.nd || 250 };
}

export function Pro2D_runEmitPipeline({ route, emits, bore } = {}) {
  const safeRoute = Array.isArray(route) && route.length >= 2 ? route : Pro2D_mockRoute;
  const safeEmits = Array.isArray(emits) && emits.length ? emits : Pro2D_mockEmits;
  const totalLength = safeRoute.slice(1).reduce((acc, pt, idx) => acc + dist(safeRoute[idx], pt), 0);
  return {
    metrics: {
      routePointCount: safeRoute.length,
      emitCount: safeEmits.length,
      autoSupportCount: safeEmits.length,
      finalElementCount: Math.max(0, safeRoute.length - 1) + safeEmits.length,
      totalRouteLength: Number(totalLength.toFixed(2)),
      bore,
    }
  };
}
