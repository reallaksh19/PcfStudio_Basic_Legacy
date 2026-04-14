import { masterTableService } from './master-table-service.js';

const ALLOWED_CA8_TYPES = new Set(['FLANGE', 'VALVE']);
const APPROVED_FITTINGS = new Set(['TEE', 'OLET', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC']);

function normalizeType(type) {
  return String(type || '').trim().toUpperCase();
}

export function canEmitCa8(type, includeApprovedFittings = false) {
  const t = normalizeType(type);
  if (ALLOWED_CA8_TYPES.has(t)) return true;
  if (includeApprovedFittings && APPROVED_FITTINGS.has(t)) return true;
  return false;
}

export function getTeeBrlen(headerBore, branchBore) {
  return masterTableService.getTeeBrlen(headerBore, branchBore);
}

export function getOletBrlen(headerBore, branchBore) {
  return masterTableService.getOletBrlen(headerBore, branchBore);
}

export function resolveWeightForCa8(component, options = {}) {
  const t = normalizeType(component?.type);
  const allowFittings = options.includeApprovedFittings === true;
  if (!canEmitCa8(t, allowFittings)) {
    return { weight: null, trace: ['blocked:ca8-scope'] };
  }

  return masterTableService.resolveComponentWeight({
    type: t,
    directWeight: component?.directWeight,
    boreMm: component?.boreMm,
    ratingClass: component?.ratingClass,
    valveType: component?.valveType,
    lengthMm: component?.lengthMm
  });
}
