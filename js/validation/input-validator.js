/**
 * input-validator.js — Phase 1: Data quality checks on normalized rows
 * Validates: required fields, coordinate parseability, type known, RefNo present.
 *
 * Exports:
 *   validateInput(normalizedRows, config) → Issue[]
 */

import { warn } from '../logger.js';

const MOD = 'input-validator';

/** @returns {Issue} */
const _issue = (id, severity, refno, rowIndex, message, detail, fixHint) => ({
  id, phase: 'INPUT', severity, refno: refno || null,
  rowIndex: rowIndex ?? null, message, detail: detail || '',
  fixable: false, fix: null, fixHint: fixHint || '',
});

/**
 * Validate all normalized rows for data quality.
 * @param {object[]} normalizedRows
 * @param {object}   config
 * @returns {Issue[]}
 */
export const validateInput = (normalizedRows, config) => {
  if (!Array.isArray(normalizedRows)) return [];
  const issues = [];
  const typeMap = config?.componentTypeMap ?? {};
  const seen = new Map(); // refno+point → rowIndex (for duplicate detection)

  for (let i = 0; i < normalizedRows.length; i++) {
    const row = normalizedRows[i];
    const refno = String(row.RefNo ?? '').trim();
    const type  = String(row.Type  ?? '').trim().toUpperCase();
    const pcfType = typeMap[type];

    // V-IN-01: Missing RefNo
    if (!refno) {
      issues.push(_issue('V-IN-01', 'ERROR', null, i,
        `Row ${i+1} has no RefNo`,
        `Type=${type}`,
        'Fill RefNo column for all rows'));
      continue;
    }

    // Skip validation for SKIP types
    if (pcfType === 'SKIP') continue;

    // V-IN-02: Unknown component type
    if (!type) {
      issues.push(_issue('V-IN-02', 'ERROR', refno, i,
        `Row ${i+1} (${refno}): missing component Type`,
        '', 'Fill Type column'));
    } else if (!pcfType) {
      issues.push(_issue('V-IN-02', 'WARNING', refno, i,
        `Unknown Type "${type}" for ${refno}`,
        `Available types: ${Object.keys(typeMap).join(', ')}`,
        'Add to config.componentTypeMap or correct the Type value'));
    }

    // V-IN-03: Missing/invalid coordinates
    const coordCols = ['East', 'North', 'Up'];
    for (const col of coordCols) {
      if (row[col] === null || row[col] === undefined) {
        issues.push(_issue('V-IN-03', 'ERROR', refno, i,
          `Row ${i+1} (${refno}): ${col} coordinate is null`,
          `Raw value: "${row[`_orig_${col}`] ?? 'not present'}"`,
          `Check CSV for non-numeric or missing ${col} value`));
      }
    }

    // V-IN-04: Missing/invalid bore
    if (row.Bore === null || row.Bore === 0) {
      issues.push(_issue('V-IN-04', 'WARNING', refno, i,
        `Row ${i+1} (${refno}): Bore is ${row.Bore === 0 ? 'zero' : 'missing'}`,
        `Raw: "${row._orig_Bore ?? ''}"`,
        'Check Bore column format (expected e.g. "400mm")'));
    }

    // V-IN-05: Missing Point number
    const ptStr = String(row.Point ?? '').trim();
    if (ptStr === '' && ptStr !== '0') {
      issues.push(_issue('V-IN-05', 'WARNING', refno, i,
        `Row ${i+1} (${refno}): missing Point number`,
        '', 'Fill Point column (0/1/2/3)'));
    }

    // V-IN-06: Duplicate RefNo + Point
    const dpKey = `${refno}__${ptStr}`;
    if (seen.has(dpKey)) {
      issues.push(_issue('V-IN-06', 'WARNING', refno, i,
        `Duplicate Point "${ptStr}" for RefNo "${refno}"`,
        `First at row ${seen.get(dpKey)+1}, duplicate at row ${i+1}`,
        'Last value will be used — verify CSV for data entry error'));
    }
    seen.set(dpKey, i);
  }

  warn(MOD, 'validateInput', `Input validation: ${issues.length} issues found`, {
    errors:   issues.filter(x => x.severity === 'ERROR').length,
    warnings: issues.filter(x => x.severity === 'WARNING').length,
  });

  return issues;
};
