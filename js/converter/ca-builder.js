/**
 * ca-builder.js — Build COMPONENT-ATTRIBUTE lines from config.caDefinitions
 * Driven entirely by config — no hardcoded slot names or values.
 *
 * Exports:
 *   buildCABlock(pts, pcfType, config)       → string[]
 *   buildCALine(slot, value, unit, indent)   → string
 */

import { gate } from "../services/gate-logger.js";
import { warn } from '../logger.js';
import { fmtValue } from '../geometry/coord-engine.js';

import { linelistService } from '../services/linelist-service.js';
import { dataManager } from '../services/data-manager.js';
import { materialService } from '../services/material-service.js';
import { getState } from '../state.js';

const MOD = 'ca-builder';
const INDENT = '    '; // 4 spaces per PCF spec

/**
 * Determine if a CA slot should be written for a given PCF component type.
 * @param {object} caDef     - config.caDefinitions[slot]
 * @param {string} pcfType   - e.g. 'PIPE', 'FLANGE', 'SUPPORT'
 * @returns {boolean}
 */
const _shouldWrite = (caDef, pcfType) => {
  if (!caDef?.writeOn) return false;
  if (caDef.writeOn === 'all-except-support') return pcfType !== 'SUPPORT';
  if (Array.isArray(caDef.writeOn)) return caDef.writeOn.includes(pcfType);
  if (caDef.writeOn === 'all') return true;
  if (caDef.writeOn === 'none') return false;
  return false;
};

/**
 * Resolve the value to write for a CA slot.
 * Handles: zeroValue override, null → default, numeric formatting.
 * @param {string}  slot    - e.g. 'CA1'
 * @param {object}  primary - primary point data from pts
 * @param {object}  caDef
 * @returns {string}  formatted value string (no unit)
 */
const _resolveValue = (slot, primary, caDef) => {
  // Get raw value from primary point data
  let raw = null;
  if (caDef.csvField && primary) {
    const fieldMap = {
      'Pressure': primary.pressure,
      'Material': primary.material,
      'Wall Thickness': primary.wall,
      'Corrosion Allowance': primary.corr,
      'Insulation thickness': primary.insul,
      'Weight': primary.weight,
      'Hydro test pressure': primary.hydro,
    };
    raw = fieldMap[caDef.csvField] ?? null;
  }

  // If no CSV data, return null so the caller skips this line (spec §6.2: omit empty CAs)
  const hasRawData = (raw !== null && raw !== undefined && raw !== '');
  if (!hasRawData) return null;

  const value = raw;

  // Apply zeroValue override (e.g. 0 → "Undefined MM" for CA4)
  if (caDef.zeroValue !== null && caDef.zeroValue !== undefined) {
    const numVal = typeof value === 'number' ? value : parseFloat(value);
    if (!isNaN(numVal) && numVal === 0) return null; // signal to write zeroValue directly
  }

  // CA3 (Material) — enforce numeric value
  if (caDef.unit === null) {
    const strVal = String(value ?? caDef.default ?? '');
    const numVal = parseFloat(strVal);
    return isNaN(numVal) ? strVal : String(numVal);
  }

  // Numeric with unit
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) return String(caDef.default ?? value);
  return fmtValue(num);
};

/**
 * Format a single CA attribute line.
 * @param {string}      slot   - e.g. 'CA1'
 * @param {string}      value  - formatted value string
 * @param {string|null} unit   - e.g. 'KPA', 'MM', or null
 * @param {string}      [indent]
 * @returns {string}
 */
export const buildCALine = (slot, value, unit, indent = INDENT) => {
  const slotName = `COMPONENT-ATTRIBUTE${slot.replace('CA', '')}`;
  const valueStr = unit ? `${value} ${unit}` : value;
  return `${indent}${slotName}  ${valueStr}`;
};

/**
 * Build all CA attribute lines for a component block.
 * Uses config.pcfRules[pcfType].caSlots to determine which slots to write.
 * Uses config.caDefinitions for value, unit, default, zeroValue logic.
 * Also injects mapped attributes from LinelistService.
 *
 * @param {object} pts       - PointDict
 * @param {string} pcfType   - e.g. 'PIPE', 'BEND', 'FLANGE'
 * @param {object} config    - full config
 * @param {object} [branchPts] - branch point data for TEE branch CA override
 * @returns {string[]}
 */
export const buildCABlock = (pts, pcfType, config, branchPts = null) => {
  // Mode 1 (Phase 1): suppress all CA output - raw PCF, coords/SKEY/angles only
  if (config?.suppressCA) return [];

  const rule = config?.pcfRules?.[pcfType];
  const primary = pts['1'] ?? pts['0'] ?? Object.values(pts)[0] ?? {};
  const lines = [];
  const writtenAttrs = new Set(); // Track attrs written by linelist injection to prevent double-write in caSlots loop

  try {
    // 0. Smart Material Mapping (CA3, CA4, CA7) via Piping Class Master
    // (Must precede Weight Mapping because Weight might depend on Rating found here)
    let smartAttrs = {};
    let pipeRating = null;

    if (primary && primary.raw) {
      const pipeStr = primary.raw?.['PIPE'] || primary.raw?.['Pipe'] || '';
      if (pipeStr) {
        const pipingClass = materialService.extractPipingClass(pipeStr);
        if (pipingClass) {
          smartAttrs = materialService.resolveAttributes(pipingClass);
          pipeRating = smartAttrs.rating; // Assume resolveAttributes extracts rating too
        }
      }
    }

    // 1. Linelist Attributes (SmartProcessMap & Custom Mapping)
    if (primary && primary.raw) {
      const rowData = linelistService.findMatchedRow(primary);

      if (rowData) {
        const state = getState("linelist") || {};
        const injected = [];

        // ── A. Smart Process Mapping ──
        const sm = state.smartMapping || {};
        const opts = state.smartOptions || {};

        const addSmart = (key, val) => {
          if (val !== undefined && val !== null && val !== "") {
            lines.push(`${INDENT}${key}  ${val}`);
            injected.push({ attr: key, val });
            writtenAttrs.add(key); // Prevent duplicate in caSlots loop
          }
        };

        // P1 -> ATTRIBUTE1
        if (sm.P1 && rowData[sm.P1]) addSmart('COMPONENT-ATTRIBUTE1', rowData[sm.P1]);

        // T1 -> ATTRIBUTE2
        if (sm.T1 && rowData[sm.T1]) addSmart('COMPONENT-ATTRIBUTE2', rowData[sm.T1]);

        // InsThk -> ATTRIBUTE5
        let hasInsThk = false;
        if (sm.InsThk && rowData[sm.InsThk]) {
          addSmart('COMPONENT-ATTRIBUTE5', rowData[sm.InsThk]);
          const insVal = parseFloat(rowData[sm.InsThk]);
          if (!isNaN(insVal) && insVal > 0) hasInsThk = true;
        }

        // Ins Den -> ATTRIBUTE6 (Default 210 if InsThk > 0)
        if (hasInsThk) {
          addSmart('COMPONENT-ATTRIBUTE6', '210');
        }

        // HP -> COMPONENT-ATTRIBUTE10
        if (sm.HP && rowData[sm.HP]) addSmart('COMPONENT-ATTRIBUTE10', rowData[sm.HP]);

        // Piping Class -> COMPONENT-ATTRIBUTE20
        if (sm.PipingClass && rowData[sm.PipingClass]) addSmart('COMPONENT-ATTRIBUTE20', rowData[sm.PipingClass]);

        // Density Logic -> ATTRIBUTE9
        // (Liquid/Mixed logic based on Phase)
        const dGas = sm.DensityGas ? rowData[sm.DensityGas] : null;
        const dLiq = sm.DensityLiq ? rowData[sm.DensityLiq] : null;
        const dMix = sm.DensityMixed ? rowData[sm.DensityMixed] : null;
        const phaseVal = sm.Phase ? String(rowData[sm.Phase] || "").trim().toUpperCase() : "";

        let finalDensity = null;
        if (phaseVal.startsWith('G')) {
          finalDensity = dGas;
        } else if (phaseVal.startsWith('L')) {
          finalDensity = dLiq;
        } else if (phaseVal.startsWith('M')) {
          // Mixed Phase: check preference
          if (opts.densityMixedPreference === 'Mixed' && dMix) {
            finalDensity = dMix;
          } else {
            finalDensity = dLiq; // Default fallback
          }
        } else {
          // Fallback if Phase unknown/empty: use Liquid if available
          finalDensity = dLiq;
        }

        if (finalDensity) {
          addSmart('COMPONENT-ATTRIBUTE9', finalDensity);
          // Log specific density decision as requested
          gate(MOD, 'buildCABlock', 'Density Logic Applied', {
            lineRef: rowData[sm.LineRef] || 'UNKNOWN',
            density: finalDensity,
            phase: phaseVal
          });
          // Specific log format requested
          console.info(`[Density] Line sq no..${rowData[sm.LineRef] || '?'}, Liq. Density= ${finalDensity}`);
        }

        // ── B. Custom Attribute Mapping ──
        const mapping = state.mapping || {};
        Object.entries(mapping).forEach(([colName, pcfAttr]) => {
          const val = rowData[colName];
          if (val !== undefined && val !== "") {
            lines.push(`${INDENT}${pcfAttr}  ${val}`);
            injected.push({ attr: pcfAttr, val });
          }
        });

        if (injected.length > 0) {
          gate('CABuilder', 'buildCABlock', 'Linelist Attributes Injected', {
            pcfType,
            refno: primary.RefNo,
            injectedCount: injected.length,
            injected
          });
        }
      }
    }

    // 2. Traceability reference — CA99/PIPELINE-REFERENCE injection removed (consumers now use CA97)

    // 3. Standard CA Slots (Configured)
    if (!rule || !rule.caSlots || rule.caSlots.length === 0) return lines;

    const caDefs = config.caDefinitions ?? {};
    // For TEE: use branch row (pt '3') for CA3/CA4 if material/wall differs
    const branchPrimary = branchPts ?? pts['3'] ?? null;

    for (const slot of rule.caSlots) {
      const caDef = caDefs[slot];
      if (!caDef) {
        warn(MOD, 'buildCABlock', `CA definition missing for slot: ${slot}`, { slot, pcfType });
        continue;
      }
      // Explicit CA8 guard: CA8 (weight) only on FLANGE, VALVE, REDUCER-CONCENTRIC, REDUCER-ECCENTRIC
      if (slot === 'CA8' && !['FLANGE', 'VALVE', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC', 'MISC-COMPONENT'].includes(pcfType)) continue;
      if (!_shouldWrite(caDef, pcfType)) continue;
      // Skip if already written by linelist injection (prevents duplicate CA lines)
      const attrName = `COMPONENT-ATTRIBUTE${slot.replace('CA', '')}`;
      if (writtenAttrs.has(attrName)) continue;

      // Use branch data for CA3/CA4 on TEE if branch differs
      let sourcePrimary = primary;
      if (branchPrimary && (slot === 'CA3' || slot === 'CA4')) {
        const branchMat = branchPrimary.material;
        const runMat = primary.material;
        if (slot === 'CA3' && branchMat && branchMat !== runMat) {
          sourcePrimary = branchPrimary;
        }
        if (slot === 'CA4' && branchPrimary.wall !== primary.wall) {
          sourcePrimary = branchPrimary;
        }
      }

      const resolvedValue = _resolveValue(slot, sourcePrimary, caDef);

      // Override with Smart Material Attributes if available
      let finalValue = resolvedValue;
      if (slot === 'CA3' && smartAttrs.materialCode) finalValue = smartAttrs.materialCode;
      if (slot === 'CA4' && smartAttrs.wallThickness) finalValue = String(smartAttrs.wallThickness);
      if (slot === 'CA7' && smartAttrs.corrosion) finalValue = String(smartAttrs.corrosion);

      if (finalValue === null && caDef.zeroValue) {
        // zeroValue writes the replacement string directly (e.g. "Undefined MM")
        lines.push(`${INDENT}COMPONENT-ATTRIBUTE${slot.replace('CA', '')}  ${caDef.zeroValue}`);
      } else if (finalValue !== null) {
        lines.push(buildCALine(slot, finalValue, caDef.unit));
      }
    }

    // ── Tracking attributes: CA98 = SeqNo, CA99 = RefNo ────────────────
    // Written unconditionally so the Data Table can read them directly
    // without relying on MESSAGE-SQUARE backward scan.
    const trackSeqNo = String(config?.seqNo || primary?.raw?.['Seq No.'] || primary?.raw?.Sequence || primary?.raw?.Seq || '').trim();
    const trackRefNo = String(config?.refno || primary?.raw?.RefNo || primary?.raw?.['Ref No.'] || primary?.raw?.['Ref No'] || '').trim();
    if (trackSeqNo) lines.push(`${INDENT}COMPONENT-ATTRIBUTE98  ${trackSeqNo}`);
    if (trackRefNo) lines.push(`${INDENT}COMPONENT-ATTRIBUTE97  ${trackRefNo}`);

  } catch (err) {
    warn(MOD, 'buildCABlock', `CA generation failed for ${pcfType}`, {
      error: err.message,
      refno: primary?.RefNo,
      stack: err.stack?.split('\n').slice(0, 3).join(' | ')
    });
    // Return partial lines generated before error
  }

  return lines;
};
