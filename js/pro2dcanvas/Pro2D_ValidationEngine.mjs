export function Pro2D_validateState(doc) {
  const issues = [];
  const entityIds = Object.keys(doc?.entities || {});
  const nodeIds = Object.keys(doc?.nodes || {});
  const routeIds = Object.keys(doc?.routes || {});
  entityIds.forEach((id) => {
    const e = doc.entities[id];
    if (!e.layerId) issues.push({ severity: 'warning', code: 'LAYER_MISSING', message: `${id} has no layerId` });
    if (e.type === 'PIPE') {
      const refs = e.geometry?.nodeIds || [];
      if (refs.length !== 2) issues.push({ severity: 'error', code: 'PIPE_NODE_COUNT', message: `${id} must reference exactly 2 nodes` });
      refs.forEach((nodeId) => { if (!doc.nodes?.[nodeId]) issues.push({ severity: 'error', code: 'NODE_REF_MISSING', message: `${id} references missing node ${nodeId}` }); });
    }
    if (e.type === 'SUPPORT' && !e.topology?.attachedToEntityId) issues.push({ severity: 'warning', code: 'SUPPORT_HOST_UNKNOWN', message: `${id} is not attached to a host entity` });
  });
  return {
    issues,
    summary: {
      errors: issues.filter((x) => x.severity === 'error').length,
      warnings: issues.filter((x) => x.severity !== 'error').length,
      totalEntities: entityIds.length,
      totalNodes: nodeIds.length,
      totalRoutes: routeIds.length,
    }
  };
}
