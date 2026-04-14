function clone(v) { return JSON.parse(JSON.stringify(v)); }

const fixedHeaders = [
  { key: 'id', label: 'ID', group: 'core', editable: false },
  { key: 'type', label: 'Type', group: 'core', editable: false },
  { key: 'routeId', label: 'Route', group: 'core', editable: true },
  { key: 'layerId', label: 'Layer', group: 'display', editable: true },
  { key: 'display.label', label: 'Label', group: 'display', editable: true }
];

const entityHeaders = {
  PIPE: [
    { key: 'engineering.nd', label: 'ND', group: 'engineering', editable: true },
    { key: 'engineering.specKey', label: 'Spec Key', group: 'engineering', editable: true },
    { key: 'geometry.nodeIds', label: 'Node IDs', group: 'geometry', editable: false },
  ],
  VALVE: [
    { key: 'engineering.valveType', label: 'Valve Type', group: 'engineering', editable: true },
    { key: 'geometry.center', label: 'Center', group: 'geometry', editable: false },
  ],
  SUPPORT: [
    { key: 'engineering.supportType', label: 'Support Type', group: 'engineering', editable: true },
    { key: 'topology.attachedToEntityId', label: 'Host Entity', group: 'topology', editable: false },
  ],
  REDUCER: [
    { key: 'engineering.reducerType', label: 'Reducer Type', group: 'engineering', editable: true },
  ],
};

function createHeaders() {
  return { fixed: fixedHeaders, byEntityType: entityHeaders, dynamic: {} };
}

export function Pro2D_createEmptyState(name = 'Pro2D Document') {
  return {
    schemaVersion: '0.2.0',
    document: { documentId: `doc_${Date.now()}`, name, units: 'mm', coordinateSystem: '2d-world', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), sourceKinds: ['manual'] },
    nodes: {},
    entities: {},
    routes: {},
    layers: { Default: { id: 'Default', name: 'Default', color: '#94a3b8' } },
    headers: createHeaders(),
    provenance: [],
  };
}

export function Pro2D_buildMockState() {
  const state = Pro2D_createEmptyState('Pro2D Mock');
  state.document.sourceKinds = ['manual', 'app-state'];
  state.nodes = {
    n1: { id: 'n1', pt: { x: 80, y: 180 }, kind: 'PIPE_ENDPOINT', entityIds: ['seg_1'] },
    n2: { id: 'n2', pt: { x: 300, y: 180 }, kind: 'PIPE_ENDPOINT', entityIds: ['seg_1', 'valve_1'] },
    n3: { id: 'n3', pt: { x: 520, y: 180 }, kind: 'PIPE_ENDPOINT', entityIds: ['seg_2', 'valve_1', 'support_1'] },
  };
  state.entities = {
    seg_1: makePipe('seg_1', 'route_main', 'Default', ['n1','n2'], 250),
    seg_2: makePipe('seg_2', 'route_main', 'Default', ['n2','n3'], 250),
    valve_1: makeInline('valve_1', 'VALVE', 'route_main', 'Default', { x: 300, y: 180 }, { valveType: 'Gate' }),
    support_1: makeSupport('support_1', 'Default', 'seg_2', 'n3', { x: 520, y: 180 }),
  };
  state.routes = { route_main: { id: 'route_main', entityIds: ['seg_1', 'valve_1', 'seg_2'], startNodeId: 'n1', endNodeId: 'n3', routeKind: 'PRIMARY' } };
  state.headers.dynamic['metadata.imported.dxf.layer'] = { key: 'metadata.imported.dxf.layer', label: 'DXF Layer', group: 'dynamic', editable: false, sourceKind: 'dxf' };
  state.entities.seg_1.metadata.imported = { dxf: { layer: 'PIPING_MAIN' } };
  return state;
}

function makePipe(id, routeId, layerId, nodeIds, nd) {
  return {
    id, type: 'PIPE', routeId, layerId,
    geometry: { nodeIds },
    topology: { connectionNodeIds: nodeIds, prevEntityId: null, nextEntityId: null },
    engineering: { nd, specKey: 'BEBW' },
    display: { visible: true, label: id },
    metadata: {}, provenance: [], dynamic: {}
  };
}
function makeInline(id, type, routeId, layerId, center, extraEngineering = {}) {
  return {
    id, type, routeId, layerId,
    geometry: { nodeIds: [], center },
    topology: { connectionNodeIds: [], attachmentRole: 'INLINE' },
    engineering: { ...extraEngineering },
    display: { visible: true, label: id },
    metadata: {}, provenance: [], dynamic: {}
  };
}
function makeSupport(id, layerId, hostEntityId, hostNodeId, center) {
  return {
    id, type: 'SUPPORT', layerId,
    geometry: { nodeIds: [hostNodeId], center, anchorRefs: [{ hostEntityId, hostNodeId }] },
    topology: { connectionNodeIds: [hostNodeId], attachedToEntityId: hostEntityId, attachedAtNodeId: hostNodeId, attachmentRole: 'POINT' },
    engineering: { supportType: 'REST' },
    display: { visible: true, label: id },
    metadata: {}, provenance: [], dynamic: {}
  };
}

export function Pro2D_safeCoordSnapshot(input) {
  const src = (input && typeof input === 'object') ? input : {};
  return {
    parsedRuns: Array.isArray(src.parsedRuns) ? src.parsedRuns : [],
    supportPoints: Array.isArray(src.supportPoints) ? src.supportPoints : [],
    canvasFittings: Array.isArray(src.canvasFittings) ? src.canvasFittings : [],
    options: (src.options && typeof src.options === 'object') ? src.options : {}
  };
}

export function Pro2D_fromCoord2PcfSnapshot(snapshot) {
  const safe = Pro2D_safeCoordSnapshot(snapshot);
  const state = Pro2D_createEmptyState('Coord2PCF Import');
  state.document.sourceKinds = ['app-state'];
  const run = safe.parsedRuns[0];
  const points = Array.isArray(run?.route) ? run.route : [{ x: 80, y: 180 }, { x: 300, y: 180 }, { x: 520, y: 180 }];
  const nodeIds = [];
  points.forEach((pt, idx) => {
    const nodeId = `node_${idx+1}`;
    nodeIds.push(nodeId);
    state.nodes[nodeId] = { id: nodeId, pt: { x: Number(pt.x) || 0, y: Number(pt.y) || 0 }, kind: 'PIPE_ENDPOINT', entityIds: [] };
  });
  for (let i = 0; i < nodeIds.length - 1; i += 1) {
    const id = `seg_${i+1}`;
    state.entities[id] = makePipe(id, 'route_main', 'Default', [nodeIds[i], nodeIds[i+1]], Number(safe.options?.bore || 250));
    state.nodes[nodeIds[i]].entityIds.push(id); state.nodes[nodeIds[i+1]].entityIds.push(id);
  }
  safe.canvasFittings.forEach((fit, idx) => {
    const type = String(fit.type || 'VALVE').toUpperCase();
    const id = `fit_${idx+1}`;
    state.entities[id] = makeInline(id, type, 'route_main', 'Default', { x: Number(fit.x) || 0, y: Number(fit.y) || 0 }, { valveType: fit.valveType });
  });
  safe.supportPoints.forEach((sp, idx) => {
    const id = `support_${idx+1}`;
    const hostNodeId = nodeIds[Math.min(idx, nodeIds.length - 1)] || 'node_1';
    state.entities[id] = makeSupport(id, 'Default', 'seg_1', hostNodeId, { x: Number(sp.x) || 0, y: Number(sp.y) || 0 });
  });
  state.routes.route_main = { id: 'route_main', entityIds: Object.keys(state.entities), startNodeId: nodeIds[0], endNodeId: nodeIds[nodeIds.length - 1], routeKind: 'PRIMARY' };
  return state;
}

export function Pro2D_toSceneBundle(doc) {
  const bundle = { nodes: {}, segments: {}, inlineItems: {}, supports: {}, fittings: {}, underlayImages: {} };
  Object.values(doc?.nodes || {}).forEach((node) => {
    bundle.nodes[node.id] = { id: node.id, x: node.pt.x, y: node.pt.y, z: node.pt.z, kind: node.kind };
  });
  Object.values(doc?.entities || {}).forEach((entity) => {
    if (entity.type === 'PIPE') {
      const pts = (entity.geometry.nodeIds || []).map((nodeId) => ({ id: nodeId, x: doc.nodes[nodeId]?.pt.x || 0, y: doc.nodes[nodeId]?.pt.y || 0 }));
      bundle.segments[entity.id] = { id: entity.id, startNodeId: entity.geometry.nodeIds?.[0], endNodeId: entity.geometry.nodeIds?.[1], geometryKind: 'line', points: pts, sizeSpecFields: { bore: entity.engineering?.nd, specKey: entity.engineering?.specKey }, metadata: { layer: entity.layerId } };
    } else if (['VALVE','FLANGE','REDUCER'].includes(entity.type)) {
      bundle.inlineItems[entity.id] = { id: entity.id, type: entity.type.toLowerCase(), insertionStation: 0.5, occupiedLength: 100, x: entity.geometry.center?.x || 0, y: entity.geometry.center?.y || 0, angle: 0, reducerType: entity.engineering?.reducerType || 'concentric', metadata: { layer: entity.layerId } };
    } else if (entity.type === 'SUPPORT') {
      bundle.supports[entity.id] = { id: entity.id, nodeId: entity.topology?.attachedAtNodeId || '', supportType: entity.engineering?.supportType || 'REST', x: entity.geometry.center?.x || 0, y: entity.geometry.center?.y || 0, metadata: { layer: entity.layerId } };
    } else if (['BEND','TEE','OLET'].includes(entity.type)) {
      bundle.fittings[entity.id] = { id: entity.id, type: entity.type, x: entity.geometry.center?.x || 0, y: entity.geometry.center?.y || 0, radius: entity.geometry.radius, angleDeg: entity.geometry.angleDeg, centerPoint: entity.geometry.center };
    }
  });
  return bundle;
}

export function Pro2D_mergeSceneIntoState(doc, scene) {
  const next = clone(doc || Pro2D_createEmptyState());
  next.entities = {};
  Object.values(scene?.segments || {}).forEach((seg) => {
    next.entities[seg.id] = makePipe(seg.id, 'live_route', seg.metadata?.layer || 'Default', [seg.startNodeId, seg.endNodeId], Number(seg.sizeSpecFields?.bore || 0));
  });
  Object.values(scene?.inlineItems || {}).forEach((item) => {
    next.entities[item.id] = makeInline(item.id, String(item.type || 'VALVE').toUpperCase(), 'live_route', item.metadata?.layer || 'Default', { x: item.x, y: item.y }, { reducerType: item.reducerType, valveType: item.metadata?.valveType });
  });
  Object.values(scene?.supports || {}).forEach((support) => {
    next.entities[support.id] = makeSupport(support.id, support.metadata?.layer || 'Default', 'host_unknown', support.nodeId, { x: support.x, y: support.y });
  });
  Object.values(scene?.fittings || {}).forEach((fit) => {
    next.entities[fit.id] = { id: fit.id, type: fit.type, routeId: 'live_route', layerId: fit.metadata?.layer || 'Default', geometry: { nodeIds: [], center: { x: fit.x, y: fit.y }, radius: fit.radius, angleDeg: fit.angleDeg }, topology: { connectionNodeIds: [] }, engineering: {}, display: { visible: true, label: fit.id }, metadata: {}, provenance: [], dynamic: {} };
  });
  next.nodes = {};
  Object.values(scene?.nodes || {}).forEach((node) => {
    next.nodes[node.id] = { id: node.id, pt: { x: node.x, y: node.y, z: node.z }, kind: node.kind || 'FREE', entityIds: [] };
  });
  next.routes = { live_route: { id: 'live_route', entityIds: Object.keys(next.entities), routeKind: 'PRIMARY' } };
  return next;
}

export function Pro2D_patchState(doc, entityId, patch) {
  const next = clone(doc);
  const entity = next?.entities?.[entityId];
  if (!entity) return next;
  for (const [path, value] of Object.entries(patch || {})) {
    const keys = path.split('.');
    let target = entity;
    while (keys.length > 1) {
      const k = keys.shift();
      if (!target[k]) target[k] = {};
      target = target[k];
    }
    target[keys[0]] = value;
  }
  next.document.updatedAt = new Date().toISOString();
  return next;
}
