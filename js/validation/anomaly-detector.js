/**
 * anomaly-detector.js — Phase 3: Process parameter consistency checks
 * Runs over ordered traversal — detects unexpected changes.
 * All rules configurable via config.anomalyRules.
 *
 * Exports:
 *   detectAnomalies(groups, traversalOrder, config) → Issue[]
 */

import { warn } from '../logger.js';

const MOD = 'anomaly-detector';

const _issue = (id, severity, refno, rowIndex, message, detail, fixHint) => ({
  id, phase: 'ANOMALY', severity, refno: refno || null,
  rowIndex: rowIndex ?? null, message, detail: detail || '',
  fixable: false, fix: null, fixHint: fixHint || '',
});

const _enabled = (rules, key) => rules?.[key]?.enabled !== false;
const _severity = (rules, key, fallback = 'WARNING') => rules?.[key]?.severity ?? fallback;
const _threshold = (rules, key, fallback = 0.05) => rules?.[key]?.threshold ?? fallback;

export const detectAnomalies = (groups, traversalOrder, config) => {
  if (!Array.isArray(traversalOrder) || traversalOrder.length === 0) return [];
  const rules = config?.anomalyRules ?? {};
  const issues = [];

  let prevPressure = null;
  let prevWall = null;
  let prevBore = null;
  let prevRefPrefix = null;

  for (const refno of traversalOrder) {
    const group = groups.get(refno);
    if (!group || group.skip) continue;
    const primary = group.pts?.['1'] ?? group.pts?.['0'] ?? null;
    if (!primary) continue;

    const pressure = typeof primary.pressure === 'number' ? primary.pressure : null;
    const wall = typeof primary.wall === 'number' ? primary.wall : null;
    const bore = typeof primary.bore === 'number' ? primary.bore : null;
    const refPrefix = refno.includes('/') ? refno.split('/')[0] : refno;

    // V-AN-01: Pressure change within header
    if (_enabled(rules, 'pressureChangeWithinHeader') && prevPressure !== null && pressure !== null) {
      const relChange = Math.abs(pressure - prevPressure) / (prevPressure || 1);
      if (relChange > _threshold(rules, 'pressureChangeWithinHeader')) {
        issues.push(_issue('V-AN-01', _severity(rules, 'pressureChangeWithinHeader'),
          refno, group.firstRowIndex, `Pressure changed: ${prevPressure} → ${pressure} KPA`,
          `Relative change ${(relChange * 100).toFixed(1)}%`,
          'Verify design pressure for this component is correct'));
      }
    }

    // V-AN-02: Wall thickness change without bore change
    if (_enabled(rules, 'wallThicknessChangeOnSameSize')
      && prevWall !== null && wall !== null && wall !== prevWall
      && prevBore !== null && bore !== null && Math.abs(bore - prevBore) < 1) {
      issues.push(_issue('V-AN-02', _severity(rules, 'wallThicknessChangeOnSameSize'),
        refno, group.firstRowIndex, `Wall thickness changed (${prevWall} → ${wall} MM) without bore change`,
        `Bore: ${bore}mm`, 'Confirm wall thickness spec is intentional'));
    }

    // V-AN-03: Bore change at non-reducer/tee
    if (_enabled(rules, 'boreSizeChangeNoReducer')
      && prevBore !== null && bore !== null && Math.abs(bore - prevBore) > 1
      && !['REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC', 'TEE'].includes(group.pcfType)) {
      issues.push(_issue('V-AN-03', _severity(rules, 'boreSizeChangeNoReducer'),
        refno, group.firstRowIndex, `Bore changed (${prevBore} → ${bore}mm) at ${group.pcfType} "${refno}"`,
        '', 'Consider inserting a REDUCER component or check CSV bore values'));
    }

    // V-AN-04: Wall/bore ratio anomaly
    if (_enabled(rules, 'wallBoreRatioAbnormal') && bore && bore > 0 && wall !== null) {
      const ratio = wall / bore;
      const minR = rules.wallBoreRatioAbnormal?.minRatio ?? 0.01;
      const maxR = rules.wallBoreRatioAbnormal?.maxRatio ?? 0.20;
      if (ratio < minR || ratio > maxR) {
        issues.push(_issue('V-AN-04', _severity(rules, 'wallBoreRatioAbnormal'),
          refno, group.firstRowIndex, `Wall/bore ratio ${ratio.toFixed(4)} outside normal [${minR}–${maxR}]`,
          `wall=${wall}mm bore=${bore}mm`, 'Check wall thickness and bore values'));
      }
    }

    // V-AN-05: TEE branch bore >= run bore
    if (_enabled(rules, 'branchBoreExceedsRun') && group.pcfType === 'TEE') {
      const branchBore = group.pts?.['3']?.bore ?? null;
      if (branchBore !== null && bore !== null && branchBore >= bore) {
        issues.push(_issue('V-AN-05', _severity(rules, 'branchBoreExceedsRun'),
          refno, group.firstRowIndex, `TEE branch bore (${branchBore}mm) ≥ run bore (${bore}mm)`,
          '', 'Branch bore should normally be smaller than run bore'));
      }
    }

    prevPressure = pressure;
    prevWall = wall;
    prevBore = bore;
    prevRefPrefix = refPrefix;
  }

  warn(MOD, 'detectAnomalies', `Anomaly detection: ${issues.length} issues`, {
    breakdown: issues.reduce((acc, x) => { acc[x.id] = (acc[x.id] || 0) + 1; return acc; }, {}),
  });

  return issues;
};
