export function Pro2D_createHeaderRegistry() {
  return {
    fixed: [
      { key: 'id', label: 'ID', valueType: 'string', group: 'core', entityTypes: ['*'], editable: false },
      { key: 'type', label: 'Type', valueType: 'enum', group: 'core', entityTypes: ['*'], editable: false },
      { key: 'routeId', label: 'Route', valueType: 'string', group: 'core', entityTypes: ['*'], editable: false },
      { key: 'layerId', label: 'Layer', valueType: 'string', group: 'display', entityTypes: ['*'], editable: true },
      { key: 'engineering.nd', label: 'ND', valueType: 'number', group: 'engineering', entityTypes: ['PIPE','BEND','TEE','REDUCER','VALVE','FLANGE'], editable: true },
      { key: 'engineering.specKey', label: 'Spec Key', valueType: 'string', group: 'engineering', entityTypes: ['PIPE','BEND','TEE','REDUCER','VALVE','FLANGE','SUPPORT'], editable: true },
    ],
    byEntityType: {
      PIPE: [
        { key: 'geometry.nodeIds', label: 'Node IDs', valueType: 'json', group: 'geometry', entityTypes: ['PIPE'], editable: false },
        { key: 'engineering.wallThickness', label: 'Wall Thickness', valueType: 'number', group: 'engineering', entityTypes: ['PIPE'], editable: true },
      ],
      SUPPORT: [
        { key: 'engineering.supportType', label: 'Support Type', valueType: 'string', group: 'engineering', entityTypes: ['SUPPORT'], editable: true },
        { key: 'topology.attachedToEntityId', label: 'Host Entity', valueType: 'string', group: 'topology', entityTypes: ['SUPPORT'], editable: false },
      ],
      VALVE: [
        { key: 'engineering.valveType', label: 'Valve Type', valueType: 'string', group: 'engineering', entityTypes: ['VALVE'], editable: true },
      ],
      REDUCER: [
        { key: 'engineering.reducerType', label: 'Reducer Type', valueType: 'enum', group: 'engineering', entityTypes: ['REDUCER'], editable: true },
        { key: 'engineering.boreA', label: 'Upstream Bore', valueType: 'number', group: 'engineering', entityTypes: ['REDUCER'], editable: true },
        { key: 'engineering.boreB', label: 'Downstream Bore', valueType: 'number', group: 'engineering', entityTypes: ['REDUCER'], editable: true },
      ],
      BEND: [
        { key: 'geometry.center', label: 'Center', valueType: 'json', group: 'geometry', entityTypes: ['BEND'], editable: false },
        { key: 'geometry.radius', label: 'Radius', valueType: 'number', group: 'geometry', entityTypes: ['BEND'], editable: false },
        { key: 'engineering.angle_deg', label: 'Angle (deg)', valueType: 'number', group: 'engineering', entityTypes: ['BEND'], editable: false },
        { key: 'engineering.specKey', label: 'Spec Key', valueType: 'string', group: 'engineering', entityTypes: ['BEND'], editable: true },
      ],
      TEE: [
        { key: 'geometry.center', label: 'Center', valueType: 'json', group: 'geometry', entityTypes: ['TEE'], editable: false },
        { key: 'engineering.boreRun', label: 'Run Bore', valueType: 'number', group: 'engineering', entityTypes: ['TEE'], editable: true },
        { key: 'engineering.boreBranch', label: 'Branch Bore', valueType: 'number', group: 'engineering', entityTypes: ['TEE'], editable: true },
        { key: 'topology.attachedToEntityId', label: 'Host Entity', valueType: 'string', group: 'topology', entityTypes: ['TEE'], editable: false },
        { key: 'engineering.specKey', label: 'Spec Key', valueType: 'string', group: 'engineering', entityTypes: ['TEE'], editable: true },
      ],
    },
    dynamic: {},
  };
}

export function Pro2D_registerDynamicHeaders(registry, sourceKind, metadata = {}) {
  for (const key of Object.keys(metadata || {})) {
    const namespaced = `${sourceKind}.${key}`;
    if (!registry.dynamic[namespaced]) {
      const value = metadata[key];
      let valueType = 'string';
      if (typeof value === 'number') valueType = 'number';
      else if (typeof value === 'boolean') valueType = 'boolean';
      else if (value && typeof value === 'object') valueType = 'json';
      registry.dynamic[namespaced] = {
        key: namespaced,
        label: `${sourceKind.toUpperCase()} ${key}`,
        valueType,
        group: 'dynamic',
        entityTypes: ['*'],
        editable: false,
        sourceKind,
      };
    }
  }
  return registry;
}
