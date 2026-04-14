/**
 * Fallback geometry contract for branch components.
 * Priority order is strict and shared by Stage1 parser, DataProcessor, emitters, and validators.
 */

export const FALLBACK_VALIDATION_CODES = Object.freeze({
  MISSING_DIRECT_GEOMETRY: 'FC-001',
  MISSING_DERIVED_GEOMETRY: 'FC-002',
  DB_9A_MISS: 'FC-003',
  TOLERANCE_VIOLATION: 'FC-004',
  UNSUPPORTED_AXIS: 'FC-005',
});

export const FALLBACK_GEOMETRY_CONTRACT = Object.freeze({
  priority: Object.freeze([
    'direct_geometry_from_input',
    'derived_from_related_points',
    'database_fallback_9A_tables',
    'hard_fail_with_validation_code',
  ]),
  tolerancesMm: Object.freeze({
    cpOnRunAxis: 1.0,
    bpBrlenMatch: 1.0,
    bendRadiusSymmetry: 1.0,
  }),
  formulas: Object.freeze({
    TEE: Object.freeze({
      CP: 'CP = (EP1 + EP2) / 2',
      BP: 'BP = CP + normalize(branchDirection) * BRLEN',
      branchDirection: 'branchDirection = normalize(BP_input - CP) OR normalize(EP3 - CP)',
    }),
    OLET: Object.freeze({
      CP: 'CP = EP1 + dot((BP - EP1), runDir) * runDir, runDir = normalize(EP2 - EP1)',
      BP: 'BP = CP + normalize(branchDirection) * BRLEN',
      branchDirection: 'branchDirection = normalize(BP_input - CP) OR 9A branch axis',
    }),
    BEND: Object.freeze({
      CP: 'CP from corner/radius geometry: C = intersection of normals from EP1/EP2 using radius R; midpoint heuristic forbidden',
      radiusRule: '|dist(CP,EP1) - R| <= 1.0 and |dist(CP,EP2) - R| <= 1.0',
    }),
  }),
  databaseFallback: Object.freeze({
    source: '9A tables',
    requiredKeys: Object.freeze(['componentType', 'bore', 'branchBore', 'endPrep', 'schedule']),
  }),
});
