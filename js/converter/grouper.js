/**
 * grouper.js — Group normalizedRows by RefNo into ComponentGroup map
 * Preserves insertion order (Map in JS 3.7+ is ordered).
 * Resolves PCF keyword from config.componentTypeMap.
 * Marks SKIP types.
 *
 * Exports:
 *   groupByRefNo(normalizedRows, config) → Map<refno, ComponentGroup>
 *   getPipelineRef(normalizedRows)       → string
 *
 * ComponentGroup shape:
 *   { refno, csvType, pcfType, rows[], skip, firstRowIndex }
 */

import { gate } from "../services/gate-logger.js";
import { info, warn } from "../logger.js";

const MOD = "grouper";



/**
 * Extract pipeline reference from RefNo column.
 * RefNo format: "=67130482/1664" → pipeline ref is "67130482"
 * Or plain string "67130482" → returned as-is.
 * @param {object[]} rows
 * @returns {string}
 */
export const getPipelineRef = (rows) => {
  for (const row of rows) {
    const ref = String(row.RefNo ?? '').trim();
    if (!ref) continue;
    // Strip leading "=" (Excel formula artifacts)
    const clean = ref.startsWith('=') ? ref.slice(1) : ref;
    // Take the part before "/" if present
    const slash = clean.indexOf('/');
    if (slash > 0) return clean.slice(0, slash);
    return clean;
  }
  return '';
};

/**
 * Resolve a CSV type code to a PCF keyword using config.componentTypeMap.
 * Returns 'UNKNOWN' if not found, logs a warning.
 * @param {string} csvType
 * @param {object} componentTypeMap
 * @returns {string}
 */
const _resolvePcfType = (csvType, componentTypeMap) => {
  if (!csvType) return 'SKIP';
  const upper = csvType.toUpperCase().trim();
  const mapped = componentTypeMap[upper];
  if (!mapped) {
    warn(MOD, '_resolvePcfType', `Unknown CSV component type: "${csvType}"`, {
      csvType, availableTypes: Object.keys(componentTypeMap),
      hint: 'Add this type to config.componentTypeMap',
    });
    return 'UNKNOWN';
  }
  return mapped;
};

/**
 * Check if the input rows have mostly missing RefNos.
 * @param {object[]} rows
 * @returns {boolean}
 */
const _checkMissingRefNos = (rows) => {
  if (!rows || rows.length === 0) return false;
  // Check first 100 rows or all
  const sample = rows.slice(0, 100);
  const emptyCount = sample.filter(r => !r.RefNo || String(r.RefNo).trim() === '').length;
  // If >50% missing, trigger auto-gen
  return (emptyCount / sample.length) > 0.5;
};

/**
 * Auto-generate RefNos for rows lacking them, respecting sequential logic.
 * @param {object[]} rows
 */
const _autoGenerateRefNos = (rows) => {
  let counter = 1;
  let currentRef = `Ref_1`;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i > 0) {
      const prevRow = rows[i-1];
      const prevPt = String(prevRow.Point ?? '').trim();
      const currPt = String(row.Point ?? '').trim();
      const type = String(row.Type || row.Component || '').toUpperCase();
      const prevType = String(prevRow.Type || prevRow.Component || '').toUpperCase();

      const isSequence = (prevPt === '1' && currPt === '2') ||
                         (prevPt && currPt && !isNaN(currPt) && !isNaN(prevPt) && parseInt(currPt) === parseInt(prevPt) + 1);

      // If NOT a sequence and NOT a trivial continuation of same type without explicit points...
      // Actually, simplest logic for auto-gen:
      // New Component if:
      // 1. It's not a P1->P2 sequence.
      // 2. OR Point is '1' (Start of new).

      let newComponent = false;
      if (currPt === '1') {
        newComponent = true;
      } else if (isSequence) {
        newComponent = false;
      } else if (type !== prevType) {
        newComponent = true;
      } else {
        // Same type, no points... assume new component? Or same?
        // Safe default: New component for every row unless strictly sequential P1->P2.
        newComponent = true;
      }

      if (newComponent) {
        counter++;
        currentRef = `Ref_${counter}`;
      }
    }

    // Only overwrite if empty
    if (!row.RefNo || String(row.RefNo).trim() === '') {
      row.RefNo = currentRef;
      // Mark as synthetic so we know? Not strictly necessary for grouper.
    }
  }
  info(MOD, 'autoGenerateRefNos', `Auto-generated RefNos up to Ref_${counter}`);
};

/**
 * Group all normalized rows by RefNo.
 * Enhanced to handle interleaved rows (Map-based accumulation)
 * and missing RefNos (Auto-generation).
 *
 * @param {object[]} normalizedRows
 * @param {object}   config
 * @returns {Map<string, ComponentGroup>}
 */
export const groupByRefNo = (normalizedRows, config) => {
  if (!Array.isArray(normalizedRows) || normalizedRows.length === 0) {
    warn(MOD, 'groupByRefNo', 'No rows to group');
    return new Map();
  }

  // 1. Auto-Generate RefNos if mostly missing
  if (_checkMissingRefNos(normalizedRows)) {
    info(MOD, 'groupByRefNo', 'Detected missing RefNos. Triggering auto-generation.');
    _autoGenerateRefNos(normalizedRows);
  }

  const typeMap = config?.componentTypeMap ?? {};
  const groups = new Map(); // Key: RefNo, Value: Group Object

  // Distance Logic
  const _maxPipeRunEnabled = config?.coordinateSettings?.common3DLogic?.enableMaxPipeRun ?? false;
  const _maxPipeRunVal = config?.coordinateSettings?.common3DLogic?.maxPipeRun ?? 30000;
  // FIX: Use configured value instead of hardcoded 12000. Fallback to maxSegmentLength if common3D disabled.
  const _fallbackLimit = config?.coordinateSettings?.maxSegmentLength ?? 30000;
  const groupLimit = _maxPipeRunEnabled ? _maxPipeRunVal : _fallbackLimit;

  // Split Counter for forced splits (distance/duplicates)
  const splitCounter = {};

  for (let i = 0; i < normalizedRows.length; i++) {
    const row = normalizedRows[i];
    const refnoRaw = String(row.RefNo ?? '').trim();

    if (!refnoRaw) {
      warn(MOD, 'groupByRefNo', `Row ${i} has empty RefNo (post-gen) — skipping`, { rowIndex: i });
      continue;
    }

    // 2. Retrieve Existing Group (Map Accumulation Strategy)
    // This allows non-contiguous (interleaved) rows to merge into the same group.
    let targetGroup = groups.get(refnoRaw);
    let mustSplit = false;

    // 3. Distance / Logic Check
    if (targetGroup) {
      // Check against the LAST row of this group (not necessarily the previous row in CSV)
      const lastRow = targetGroup.rows[targetGroup.rows.length - 1];

      const dE = parseFloat(row.East ?? 0) - parseFloat(lastRow.East ?? 0);
      const dN = parseFloat(row.North ?? 0) - parseFloat(lastRow.North ?? 0);
      const dU = parseFloat(row.Up ?? 0) - parseFloat(lastRow.Up ?? 0);
      const dist = Math.sqrt(dE * dE + dN * dN + dU * dU);

      const lastPt = String(lastRow.Point ?? '').trim();
      const currPt = String(row.Point ?? '').trim();
      const type = String(row.Type || row.Component || '').toUpperCase();

      const isExplicitSeq = (lastPt === '1' && currPt === '2') ||
                            (lastPt && currPt && !isNaN(currPt) && !isNaN(lastPt) && parseInt(currPt) === parseInt(lastPt) + 1);

      // Deep Architect Safeguard: Allow multi-point BEND/OLET/TEE to exist non-sequentially
      const isComponentMultiPoint = type === 'BEND' || type === 'ELBO' || type === 'OLET' || type === 'TEE';
      const safelySequential = isExplicitSeq || (isComponentMultiPoint && ['0', '1', '2', '3'].includes(currPt));

      // Strictly evaluate inputs as Numbers to prevent Javascript string-coercion memory faults against the slider config.
      const numericDist = Number(dist) || 0;
      const numericLimit = Number(groupLimit) || 12000;

      // If distance exceeds limit AND it's not a valid sequence -> SPLIT
      if (numericDist > numericLimit && !safelySequential) {
        mustSplit = true;
        info(MOD, 'groupByRefNo', `RefNo ${refnoRaw} exceeds limit ${groupLimit}mm (dist=${dist.toFixed(1)}) — splitting as _SpX`);
      }

      // Additional Split Check: Duplicate Point Numbers?
      // If we see Point 1 again in the same group, it's likely a duplicate component with same RefNo.
      // EXCEPTION: Some components have multiple points (3, 4, etc).
      // But P1 -> P1 is definitely a split.
      if (currPt === '1' && targetGroup.rows.some(r => String(r.Point).trim() === '1')) {
         mustSplit = true;
         // info(MOD, 'groupByRefNo', `RefNo ${refnoRaw} duplicate Start Point — splitting.`);
      }
    }

    // 4. Assign to Group
    let finalRefNo = refnoRaw;

    if (mustSplit) {
      // Create a new split group
      splitCounter[refnoRaw] = (splitCounter[refnoRaw] || 0) + 1;
      finalRefNo = `${refnoRaw}_Sp${splitCounter[refnoRaw]}`;

      // If the split group already exists (interleaved split parts?), use it.
      // FIX: Reuse existing split group instead of overwriting it (causing data loss).
      targetGroup = groups.get(finalRefNo);
      if (targetGroup) {
         mustSplit = false; // Prevent creating a new group
      }
      
      // Update the row so that it reflects the split RefNo/Sequence in Stage 1 diagnostics
      row.RefNo = finalRefNo;
      row.Sequence = row.Sequence ? `${row.Sequence}_Sp${splitCounter[refnoRaw]}` : finalRefNo;
    } else {
        // Use the original refno (which might be a previously created _SpX if we are tracking split state externally?
        // No, split state is local logic. If we split, we make a NEW refno.
        // Wait. If we have interleaved rows:
        // Row 10: Ref A (Group A)
        // Row 20: Ref A (Distance OK) -> Group A.
        // Row 30: Ref A (Distance FAIL) -> Group A_Sp1.
        // Row 40: Ref A (Distance OK relative to A_Sp1?? No, relative to LAST row).

        // Complex case: If we already split Ref A into A_Sp1, and now we see another Ref A row...
        // Should it go to A? Or A_Sp1? Or A_Sp2?
        // Standard logic: Try to fit into the base group (A) first?
        // Or track the "active" split for this RefNo?

        // For simplicity/robustness:
        // If we split A -> A_Sp1, A_Sp1 becomes the "Active" A for sequential logic?
        // No, usually splits are disparate pieces.
        // Let's stick to: Try to append to base RefNo. If fail, check splits?
        // Actually, the simplest Interleaved logic is: Always check against the BASE group.
        // If that fails distance, make a NEW split.
        // We won't try to merge into previous splits (complex geometry matching).
    }

    if (!targetGroup || mustSplit) {
      // Create New Group
      const csvType = String(row.Type ?? '').trim().toUpperCase();
      let pcfType = _resolvePcfType(csvType, typeMap);

      // FIX: Ensure synthetic/injected components (often missing Type in CSV) are not skipped.
      if ((pcfType === 'SKIP' || pcfType === 'UNKNOWN') && (finalRefNo.includes('_Injected') || finalRefNo.includes('_bridged') || finalRefNo.includes('_Support') || finalRefNo.includes('_Sp'))) {
          // Fallback to PIPE if type is missing or unknown but RefNo suggests synthetic pipe
          if (!csvType || csvType === '' || pcfType === 'UNKNOWN') {
              pcfType = 'PIPE';
          }
      }

      const newGroup = {
        refno: finalRefNo,
        uniqueKey: finalRefNo,
        csvType,
        pcfType,
        rows: [],
        skip: pcfType === 'SKIP' || pcfType === 'UNKNOWN',
        firstRowIndex: i,
        skipEngulfSplit: !_maxPipeRunEnabled,
        nextSmart: null,
        prevSmart: null
      };

      groups.set(finalRefNo, newGroup);
      targetGroup = newGroup;
    }

    // Task 9: P2 Derivation Alignment
    if (row['Next(Smart)']) targetGroup.nextSmart = row['Next(Smart)'];
    if (row['Prev(Smart)']) targetGroup.prevSmart = row['Prev(Smart)'];

    targetGroup.rows.push({ ...row, _rowIndex: i });
  }

  // Log summary
  const total = groups.size;
  const skipped = [...groups.values()].filter(g => g.skip).length;
  const byType = {};
  for (const g of groups.values()) {
    byType[g.pcfType] = (byType[g.pcfType] ?? 0) + 1;
  }

  info(MOD, 'groupByRefNo', 'Grouping complete', {
    totalGroups: total, skipped, active: total - skipped, byPCFType: byType,
  });

  console.log(`[Grouper] Total Input Rows: ${normalizedRows.length}. Total Groups: ${total}. Groups Skipped (Type): ${skipped}.`);

  return groups;
};
