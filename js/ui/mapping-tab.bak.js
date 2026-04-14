/**
 * mapping-tab.js — MAPPING Tab UI
 * Subscribes to normalizedRows state. Groups rows by RefNo, renders component table.
 * Hides the "Load CSV first" placeholder once data is available.
 * Convert button runs topology → traversal → PCF assembly → stores pcfLines in state.
 */

import { getConfig } from "../config/config-store.js";
import { getState, setState, subscribe } from "../state.js";
import { setTabEnabled, switchTab } from "./tab-manager.js";
import { groupByRefNo, getPipelineRef } from "../converter/grouper.js";
import { validateRows } from "../input/row-validator.js";
import { processGeometry } from "../geometry/pipeline.js";
import { runSequencer } from "../graph/sequencer.js";
import { assemble } from "../output/pcf-assembler.js";
import { buildPts } from "../converter/point-builder.js";
import { validateConnectivity } from "../validation/connectivity-validator.js";
import { updateDebugTable, clearDebugTab } from "./debug-tab.js";
import { getSmartNeighbors } from "../services/topology-service.js";
import { dataManager } from "../services/data-manager.js"; // Static import to resolve race conditions

const LOG_PREFIX = "[MappingTab]";

let _dom = {};

export function initMappingTab() {
  _dom = {
    empty: document.getElementById("mapping-empty"),
    tableWrap: document.getElementById("mapping-table-wrap"),
    tbody: document.querySelector("#mapping-table tbody"),
    refreshBtn: document.getElementById("btn-refresh-mapping"),
    regroupBtn: document.getElementById("btn-regroup"),
    convertBtn: document.getElementById("btn-convert"),
  };

  const missing = Object.entries(_dom).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.warn(`${LOG_PREFIX} Missing DOM elements: ${missing.join(", ")}`);
  }

  // Refresh button — re-pull revised data based on changed mapping or imported data
  _dom.refreshBtn?.addEventListener("click", () => {
    const rows = getState("normalizedRows");
    if (!rows?.length) {
      console.warn(`${LOG_PREFIX} Refresh: No normalized rows in state.`);
      return;
    }
    console.info(`${LOG_PREFIX} Refresh triggered. Re-running grouping with ${rows.length} rows.`);
    runGrouping(rows);
  });

  // Re-group on button click
  _dom.regroupBtn?.addEventListener("click", () => {
    const rows = getState("normalizedRows");
    if (!rows?.length) return;
    runGrouping(rows);
  });

  // Convert button — runs full topology → traversal → assembly pipeline
  _dom.convertBtn?.addEventListener("click", runConvert);
  if (_dom.convertBtn) {
    _dom.convertBtn.disabled = true;
    _dom.convertBtn.title = "Group data first by loading a CSV";
  }

  // Delegate change event for PCF Keyword dropdowns
  _dom.tbody?.addEventListener("change", (e) => {
    if (e.target.classList.contains("pcf-type-select")) {
      const select = e.target;
      const refNo = select.dataset.ref;
      const newType = select.value;
      updateGroupType(refNo, newType);
    }
  });

  // React to normalizedRows changes (set by input-tab after parse)
  subscribe("normalizedRows", rows => {
    if (rows && rows.length > 0) {
      // Task 1 & 2 Check: Ensure MasterDataReady, trigger lazy load if needed
      dataManager.onReady(() => {
        _triggerLazyPipingClassHydration(rows, dataManager).finally(() => {
          runGrouping(rows);
        });
      });
    } else {
      showEmpty();
    }
  });

  // If rows already exist on init (e.g. hot-reload), render immediately
  const existing = getState("normalizedRows");
  if (existing?.length) {
    dataManager.onReady(() => {
      _triggerLazyPipingClassHydration(existing, dataManager).finally(() => {
        runGrouping(existing);
      });
    });
  }

  console.info(`${LOG_PREFIX} Mapping tab initialised.`);
}

/**
 * Task 2: Targeted Mapping Triggers
 * Scans parsed rows for required bore sizes and loads them if auto-load is enabled.
 */
async function _triggerLazyPipingClassHydration(rows, dataManager) {
  const config = getConfig();
  if (config.smartData?.autoLoadPipingClassMasters !== true) {
    return; // Size-Wise mapping toggle is OFF, default to global attributes
  }

  try {
    console.info(`${LOG_PREFIX} Scanning rows for required piping class bore sizes...`);
    const requiredSizes = new Set();

    // Find Bore columns using aliases
    const boreAliases = config.headerAliases?.Bore || ["bore", "dn", "size"];

    for (const r of rows) {
      // Check keys in row against aliases
      for (const key of Object.keys(r)) {
        if (boreAliases.includes(key.toLowerCase())) {
          const sizeVal = String(r[key]).trim();
          if (sizeVal && sizeVal !== '-') {
            requiredSizes.add(sizeVal);
          }
          break;
        }
      }
    }

    const sizeArray = Array.from(requiredSizes);
    if (sizeArray.length > 0) {
      console.info(`${LOG_PREFIX} Triggering parallel lazy load for ${sizeArray.length} bore sizes:`, sizeArray);
      await dataManager.loadPipingClassSizes(sizeArray);
    }
  } catch (e) {
    console.error(`${LOG_PREFIX} Failed to hydrate piping class sizes:`, e);
  }
}

// ── Core logic ────────────────────────────────────────────────────

function runGrouping(rows) {
  try {
    const config = getConfig();

    // Clear debug tab on new run
    clearDebugTab();

    // 0. Row Validation (Pre-Processor)
    const vr = validateRows(rows, config);
    const validatedRows = vr.validated;

    // Merge Row Validator anomalies
    if (vr.anomalies && vr.anomalies.length) {
      const report = getState("validationReport") ?? {};
      report.anomaly = [...(report.anomaly ?? []), ...vr.anomalies];
      setState("validationReport", report);
    }

    // Store validated count for use in runConvert tally
    setState("validatedRowCount", validatedRows.length);

    // DEBUG TAB: Stage 1 - Validated CSV Data
    // Task 4: Add "Line No.(Derived)" column here.
    const s1Rows = validatedRows.map((r, i) => {
      const rowObj = { Row: i + 1 };

      // Calculate Derived Line No (Mock logic or reuse existing match logic if available)
      // Since this is Stage 1 (Raw Row), we don't have PcfTableController's matchLineDump logic readily available
      // without instantiating it.
      // However, we can use the row's existing 'Line Number' or similar if present.
      // Or simply pass through what was validated.

      // Implement light-weight match for Line No.(Derived)
      // We assume dataManager has loaded the line dump.
      // We need to import dataManager if not already available in this scope, but it is not imported.
      // We will assume 'r' might have it if validated, OR we leave it as passed-through.
      // Since we can't easily import PcfTableController logic here without circular deps,
      // we will rely on what 'validateRows' or upstream parsing provides.

      // However, the user specifically asked for "Derived".
      // Let's check if 'validateRows' populated it. If not, we might need to expose the matching logic as a service.
      // For now, we will use the same logic: Look for 'Line Number', 'Line', 'Pipeline Ref'.

      let derivedLineNo = r['Line No.(Derived)'] || r['Line Number'] || r['Line'] || r['Pipeline Ref'] || '';
      rowObj['Line No.(Derived)'] = derivedLineNo;

      ['Sequence', 'RefNo', 'Type', 'LineNo', 'Component Name', 'East', 'North', 'Up', 'Len_Calc'].forEach(k => {
        if (r[k] !== undefined) rowObj[k] = r[k];
      });
      Object.keys(r).forEach(k => {
        if (k !== '_rowIndex' && !(k in rowObj)) rowObj[k] = r[k];
      });
      if (r.Len_Calc) rowObj['Len_Calc'] = parseFloat(r.Len_Calc).toFixed(2);
      else rowObj['Len_Calc'] = '0.00';
      return rowObj;
    });
    updateDebugTable(`Stage 1 — ValidatedCSVdata (Pre-grouped)`, s1Rows);

    // 1. Grouping
    let groups = groupByRefNo(validatedRows, config);

    // DEBUG TAB: Stage 2 - After Grouping
    const s2 = Array.from(groups.values()).sort((a, b) => ((a.firstRowIndex || 0) - (b.firstRowIndex || 0)));
    const s2Rows = s2.map(g => {
      const uniquePts = [...new Set(g.rows.map(r => r.Point))].filter(Boolean).sort().join(", ");
      const compNames = [...new Set(g.rows.map(r => r["Component Name"] || r.componentName))].filter(Boolean).join(", ");

      const r = g.rows && g.rows.length > 0 ? g.rows[0] : {};
      const seqNo = r.Sequence || r.Seq || '-';
      const le = r.East ?? r.StartX ?? '-';
      const ln = r.North ?? r.StartY ?? '-';
      const lu = r.Up ?? r.StartZ ?? '-';
      const b = r.Bore ?? '-';

      // User Request: GroupLenCalc = abs(End - Start)
      const lastR = g.rows && g.rows.length > 0 ? g.rows[g.rows.length - 1] : {};
      const endE = lastR.EndX ?? lastR.East ?? '-';
      const endN = lastR.EndY ?? lastR.North ?? '-';
      const endU = lastR.EndZ ?? lastR.Up ?? '-';

      const dE = (le !== '-' && endE !== '-') ? Math.abs(parseFloat(endE) - parseFloat(le)).toFixed(1) : '0.0';
      const dN = (ln !== '-' && endN !== '-') ? Math.abs(parseFloat(endN) - parseFloat(ln)).toFixed(1) : '0.0';
      const dU = (lu !== '-' && endU !== '-') ? Math.abs(parseFloat(endU) - parseFloat(lu)).toFixed(1) : '0.0';

      let derivedLineNo = r['Line No.(Derived)'] || r['Line Number'] || r['Line'] || r['Pipeline Ref'] || '';

      return {
        'Seq No.': seqNo, // Added as first column
        RefNo: g.refno,
        'Line No.(Derived)': derivedLineNo,
        Type: `${g.pcfType}${g.csvType ? ` (${g.csvType})` : ''}`,
        'Component Name': compNames,
        'Rows': g.rows?.length,
        'Start Coord': `${le}, ${ln}, ${lu}`,
        'End Coord': `${endE}, ${endN}, ${endU}`,
        'Grp_E': dE,
        'Grp_N': dN,
        'Grp_U': dU,
        'FirstRowIndex': g.firstRowIndex
      };
    });
    updateDebugTable(`Stage 2 — After Grouping (Raw CSV)`, s2Rows);

    // 2. Geometry Pipeline
    const { groups: processed, anomalies, groupsPass1 } = processGeometry(groups, config);
    groups = processed;

    // DEBUG TAB: Stage 3 - After Geometry
    // Handle Sorting Config
    const sortSkippedZero = config.coordinateSettings?.sortSkippedZero !== false; // Default ON
    const sortFn = (a, b) => {
      if (sortSkippedZero) {
        const isA = a.skip || (a.lenCalc || 0) === 0;
        const isB = b.skip || (b.lenCalc || 0) === 0;
        if (isA && !isB) return 1;
        if (!isA && isB) return -1;
      }
      return (a.firstRowIndex || 0) - (b.firstRowIndex || 0);
    };

    const s3 = Array.from(groups.values()).sort(sortFn);
    const s3Rows = s3.map(g => {
      const r = g.rows && g.rows.length > 0 ? g.rows[0] : {};
      const seqNo = r.Sequence || r.Seq || '-';

      // Calculate Length: Priority = g.lenCalc > row.Len_Calc > pts-distance
      let lenCalcVal = g.lenCalc;
      if (lenCalcVal === undefined && r.Len_Calc !== undefined) lenCalcVal = parseFloat(r.Len_Calc);
      if (lenCalcVal === undefined && g.pts && g.pts['1'] && g.pts['2']) {
        const dx = g.pts['2'].E - g.pts['1'].E;
        const dy = g.pts['2'].N - g.pts['1'].N;
        const dz = g.pts['2'].U - g.pts['1'].U;
        lenCalcVal = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      const lenCalc = (Number(lenCalcVal) || 0).toFixed(2);

      // Geometry Calc for Debug
      const geo = calcDebugGeometry(g);

      return {
        'Seq No.': seqNo,
        RefNo: g.refno,
        Type: g.pcfType,
        'LenCalc (mm)': lenCalc,
        'Axis 1': geo.ax1, 'Grp L1': geo.grpL1,
        'Axis 2': geo.ax2, 'Grp L2': geo.grpL2,
        'Axis 3': geo.ax3, 'Grp L3': geo.grpL3,
        'Pts["0"] (Center)': fmtPt(g.pts?.[0]),
        'Pts["1"] (P1)': fmtPt(g.pts?.[1]),
        'Pts["2"] (P2)': fmtPt(g.pts?.[2]),
        'Pts["3"] (Branch)': fmtPt(g.pts?.[3]),
        'Pts["4"] (Branch2)': fmtPt(g.pts?.[4]),
        'Synthetic?': g.refno.includes('_Sp') || g.refno.includes('_Injected') ? 'Yes' : 'No'
      };
    });
    updateDebugTable(`Stage 3 — After Geometry Processing`, s3Rows);

    // Merge any anomalies into the validation report
    if (anomalies.length) {
      const report = getState("validationReport") ?? {};
      report.anomaly = [...(report.anomaly ?? []), ...anomalies];
      setState("validationReport", report);
    }

    setState("groups", groups);
    setState("groupsPass1", groupsPass1 || null); // Store Pass 1 groups if available

    renderMappingTable(groups);
    console.info(`${LOG_PREFIX} Grouped ${groups.size} components (after geometry processing).`);

  } catch (err) {
    console.error(`${LOG_PREFIX} runGrouping failed: ${err.message}`, err);
    showConvertError(`Grouping failed: ${err.message}`);
  }
}

/** Expose conversion logic for other modules */
export async function runConvert() {
  const groups = getState("groups");
  const groupsPass1 = getState("groupsPass1");

  if (!groups?.size) {
    console.warn(`${LOG_PREFIX} Convert: no groups in state.`);
    return;
  }

  setConvertLoading(true);
  try {
    const config = getConfig();
    const normalizedRows = getState("normalizedRows");
    const pipelineRef = getPipelineRef(normalizedRows ?? []);

    // ── Primary Pass Conversion ──
    const seqResult = runSequencer(groups, config);
    setState("topology", seqResult.topology);
    setState("traversalOrder", seqResult.ordered);

    // Run Post-Processing Validation (Populates group.validation)
    console.info(`${LOG_PREFIX} Running connectivity validation on sequenced groups...`);
    validateConnectivity(groups, seqResult.ordered, config);
    setState("groups", groups); // Update state with validation data

    // DEBUG TAB: Stage 4 - Group Inspector (Validation/Connectivity)
    const topologyGraph = seqResult.topology;
    const groupsMap = groups;

    // Handle Sorting Config (Re-create sortFn as it's not shared scope from runGrouping)
    const sortSkippedZero = config.coordinateSettings?.sortSkippedZero !== false; // Default ON
    const sortFn = (a, b) => {
      if (sortSkippedZero) {
        const isA = a.skip || (a.lenCalc || 0) === 0;
        const isB = b.skip || (b.lenCalc || 0) === 0;
        if (isA && !isB) return 1;
        if (!isA && isB) return -1;
      }
      return (a.firstRowIndex || 0) - (b.firstRowIndex || 0);
    };

    const s4 = Array.from(groups.values()).sort(sortFn);
    const s4Rows = s4.map(g => {
      const smartConn = getSmartNeighbors(g, topologyGraph, groupsMap, config);
      const prevSmartStr = smartConn.prev.map(n => `${n.ref} (${n.gap}mm)`).join(', ') || 'None';
      const nextSmartStr = smartConn.next.map(n => `${n.ref} (${n.gap}mm)`).join(', ') || 'None';

      const r = g.rows && g.rows.length > 0 ? g.rows[0] : {};

      // Calculate Length: Priority = g.lenCalc > row.Len_Calc > pts-distance
      let lenCalcVal = g.lenCalc;
      if (lenCalcVal === undefined && r.Len_Calc !== undefined) lenCalcVal = parseFloat(r.Len_Calc);
      if (lenCalcVal === undefined && g.pts && g.pts['1'] && g.pts['2']) {
        const dx = g.pts['2'].E - g.pts['1'].E;
        const dy = g.pts['2'].N - g.pts['1'].N;
        const dz = g.pts['2'].U - g.pts['1'].U;
        lenCalcVal = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      const lenCalc = (Number(lenCalcVal) || 0).toFixed(2);

      const rawType = r.Type || g.csvType;
      const seqNo = r.Sequence || r.Seq || '-';

      // Resolve Prev/Next Ref Nos for Display
      let prevRefStr = 'Start';
      let nextRefStr = 'End';

      // We need to look up the actual RefNo from the ordered list to match the "Seq Prev/Next" concept
      // Or use the g.validation.prevRef if we added it? No, validateConnectivity only gives bools and distances.
      // But we can infer it:
      // The `seqResult.ordered` array has the sequence. We can find index of `g.refno`.
      const myIdx = seqResult.ordered.indexOf(g.refno);
      if (myIdx > 0) {
        const pRef = seqResult.ordered[myIdx - 1];
        const pGrp = groupsMap.get(pRef);
        const pSeq = pGrp?.rows?.[0]?.Sequence || pGrp?.rows?.[0]?.Seq || '-';
        prevRefStr = `${pSeq}`;
      }
      if (myIdx >= 0 && myIdx < seqResult.ordered.length - 1) {
        const nRef = seqResult.ordered[myIdx + 1];
        const nGrp = groupsMap.get(nRef);
        const nSeq = nGrp?.rows?.[0]?.Sequence || nGrp?.rows?.[0]?.Seq || '-';
        nextRefStr = `${nSeq}`;
      }

      // Format: "SeqNo (Dist mm) Icon"
      const prevIcon = g.validation?.prevValid === '✅' ? '✅' : '❌';
      const prevDist = g.validation?.prevDist || '-';
      const prevSeqGap = g.validation?.prevValid !== 'N/A' ? `${prevRefStr} (${prevDist}mm) ${prevIcon}` : 'N/A';

      const nextIcon = g.validation?.nextValid === '✅' ? '✅' : '❌';
      const nextDist = g.validation?.nextDist || '-';
      const nextSeqGap = g.validation?.nextValid !== 'N/A' ? `${nextRefStr} (${nextDist}mm) ${nextIcon}` : 'N/A';

      // Independent Geometry Calc
      const geo = calcDebugGeometry(g);

      return {
        'Seq No.': seqNo, // Added as first column
        RefNo: g.refno,
        'Raw Type': rawType,
        'Data Count': `${g.rows?.length || 0} Rows`,
        'LenCalc (mm)': lenCalc,
        'Axis 1': geo.ax1, 'Grp L1': geo.grpL1,
        'Axis 2': geo.ax2, 'Grp L2': geo.grpL2,
        'Axis 3': geo.ax3, 'Grp L3': geo.grpL3,
        'Seq Prev(gap)': prevSeqGap, // Updated Format
        'Seq Next(gap)': nextSeqGap, // Updated Format
        'Smart Prev (Gap)': prevSmartStr,
        'Smart Next (Gap)': nextSmartStr,
        'Skipped/Zerolength': (g.skip || (g.lenCalc || 0) === 0) ? 'TRUE' : '-',
        'Processed P1': fmtPt(g.pts?.[1]),
        'Processed P2': fmtPt(g.pts?.[2]),
        'Processed P3': fmtPt(g.pts?.[3]),
        'Processed P4': fmtPt(g.pts?.[4])
      };
    });
    updateDebugTable(`Stage 4 — Group Inspector (Validation)`, s4Rows);

    // DEBUG TAB: Stage 5 - Sequencer Output
    // Read zero-length tolerance from UI (matches "Tolerance (mm) for zero length component")
    const uiTolInput = document.getElementById('pcf-table-tolerance');
    const zeroTol = parseFloat(uiTolInput?.value || '6');
    console.log(`[DEBUG-ZeroLen] zeroLengthTolerance = ${zeroTol}mm`);

    // Helper: calculate distance between EP1 and EP2 for a group
    // IMPORTANT: pts may not be built yet before assemble() — build on demand
    const calcGroupLen = (g) => {
      if (!g.pts || Object.keys(g.pts).length === 0) {
        try { g.pts = buildPts(g, config); } catch (e) { return -1; }
      }
      const p1 = g?.pts?.['1'];
      const p2 = g?.pts?.['2'];
      if (!p1 || !p2) return -1; // no endpoints, not a pipe/olet issue
      const dx = (p2.E ?? p2.x ?? 0) - (p1.E ?? p1.x ?? 0);
      const dy = (p2.N ?? p2.y ?? 0) - (p1.N ?? p1.y ?? 0);
      const dz = (p2.U ?? p2.z ?? 0) - (p1.U ?? p1.z ?? 0);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    // Filter out zero-length PIPE/OLET from the ordered list BEFORE assembling
    let zeroLenDropped = 0;
    const filteredOrdered = seqResult.ordered.filter(ref => {
      const g = groups.get(ref);
      if (!g) return false;
      const type = (g.pcfType || '').toUpperCase();
      if (type === 'PIPE' || type.includes('OLET')) {
        const len = calcGroupLen(g);
        if (len >= 0 && len < zeroTol) {
          zeroLenDropped++;
          console.log(`[DEBUG-ZeroLen] Dropped ${type} ref=${ref} len=${len.toFixed(4)}mm (< ${zeroTol}mm)`);
          return false;
        }
      }
      return true;
    });
    console.log(`[DEBUG-ZeroLen] Dropped ${zeroLenDropped} zero-length PIPE/OLET components before assembly`);
    // Replace ordered with filtered list
    seqResult.ordered = filteredOrdered;

    const s5Rows = seqResult.ordered.map((ref, i) => {
      const g = groups.get(ref);
      const r = g?.rows?.[0] || {};

      let vecLenStr = '-';
      if (g?.pts?.['1'] && g?.pts?.['2']) {
        const dx = g.pts['2'].E - g.pts['1'].E;
        const dy = g.pts['2'].N - g.pts['1'].N;
        const dz = g.pts['2'].U - g.pts['1'].U;
        vecLenStr = `(${dx.toFixed(1)}, ${dy.toFixed(1)}, ${dz.toFixed(1)})`;
      }

      return {
        'Seqno.': r['Seq No.'] || r.Sequence || r.Seq || '-',
        'RefNo': ref,
        'Type': g?.pcfType || 'Unknown',
        'Status': 'Included',
        'Vec Len': vecLenStr,
        'EP1': fmtPt(g?.pts?.['1']),
        'EP2': fmtPt(g?.pts?.['2']),
        'EP3': fmtPt(g?.pts?.['3']),
        'EP4': fmtPt(g?.pts?.['4'])
      };
    });
    if (seqResult.orphans && seqResult.orphans.length > 0) {
      seqResult.orphans.forEach(ref => {
        const g = groups.get(ref);
        const r = g?.rows?.[0] || {};
        s5Rows.push({
          'Seqno.': r['Seq No.'] || r.Sequence || r.Seq || '-',
          'RefNo': ref,
          'Type': g?.pcfType || 'Unknown',
          'Status': 'Orphan',
          'EP1': fmtPt(g?.pts?.['1']),
          'EP2': fmtPt(g?.pts?.['2'])
        });
      });
    }

    updateDebugTable(`Stage 5 — Sequencer Output`, s5Rows);

    // PCF Health
    const validatedRows = getState("normalizedRows") || []; // Use cached if possible, or validatedRowCount
    // We need logic to count types in input vs output
    const countType = (list, type) => list.filter(i => (i.Type || i.pcfType || "").toUpperCase().includes(type)).length;
    // Input: validatedRows. Output: seqResult.ordered (refs)
    // Actually we need to look up refs in groups for output types
    const outputRefs = seqResult.ordered;
    const countOut = (type) => outputRefs.filter(ref => (groups.get(ref)?.pcfType || "").toUpperCase().includes(type)).length;

    // Total Length
    // Input: Sum of Len_Calc in rows
    let totalLenIn = 0;
    // We can use the validated rows passed to runGrouping? But they are not in scope here unless we use getState('normalizedRows')
    // Wait, runGrouping receives 'rows'. But we are in runConvert. 'normalizedRows' is in state.
    // But 'normalizedRows' is Raw. 'validatedRows' was in runGrouping scope.
    // We can use groups to sum input? Group rows have 'Len_Calc'.
    let totalLenOut = 0;

    Array.from(groups.values()).forEach(g => {
      // Input sum (from rows)
      g.rows.forEach(r => totalLenIn += parseFloat(r.Len_Calc || 0));
      // Output sum (from geometry)
      if (g.pts && g.pts['1'] && g.pts['2']) {
        const dx = g.pts['2'].E - g.pts['1'].E, dy = g.pts['2'].N - g.pts['1'].N, dz = g.pts['2'].U - g.pts['1'].U;
        totalLenOut += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
    });

    // We need input counts. groups.values() represents grouped input.
    // So counting groups is roughly counting components.
    const groupsArr = Array.from(groups.values());
    const countIn = (type) => groupsArr.filter(g => (g.pcfType || "").toUpperCase().includes(type)).length;

    const healthData = [
      { Metric: 'Total Length (mm)', Input: totalLenIn.toFixed(1), Output: totalLenOut.toFixed(1) },
      { Metric: 'Count: BEND', Input: countIn('BEND'), Output: countOut('BEND') },
      { Metric: 'Count: TEE', Input: countIn('TEE'), Output: countOut('TEE') },
      { Metric: 'Count: FLANGE', Input: countIn('FLANGE'), Output: countOut('FLANGE') },
      { Metric: 'Count: VALVE', Input: countIn('VALVE'), Output: countOut('VALVE') }
    ];
    updateDebugTable(`PCF Health`, healthData);

    // Sync zero-length tolerance from the PCF table form UI input into config
    if (!isNaN(zeroTol) && zeroTol > 0) {
      config.coordinateSettings = { ...(config.coordinateSettings || {}), zeroLengthTolerance: zeroTol };
    }

    // Debug: PIPELINE-REFERENCE being passed to assemble
    console.log(`[DEBUG-Header] pipelineRef passed to assemble() = "${pipelineRef}"`);

    const pcfLines = assemble(seqResult, groups, config, pipelineRef);
    setState("pcfLines", pcfLines);

    // DEBUG TAB: Stage 6 - Final PCF Output (Preview)
    const s6Rows = pcfLines.slice(0, 1000).map((line, i) => ({
      'Line #': i + 1,
      'Content': line
    }));
    updateDebugTable(`Stage 6 — Final PCF Output (First 1000 lines)`, s6Rows);

    // ── Pass 1 Conversion (if multi-pass occurred) ──
    if (groupsPass1 && groupsPass1.size > 0) {
      console.info(`${LOG_PREFIX} Generating Pass 1 PCF...`);
      const seq1 = runSequencer(groupsPass1, config);
      // Apply same zero-length filter to Pass 1
      seq1.ordered = seq1.ordered.filter(ref => {
        const g = groupsPass1.get(ref);
        if (!g) return false;
        const type = (g.pcfType || '').toUpperCase();
        if (type === 'PIPE' || type.includes('OLET')) {
          const len = calcGroupLen(g);
          if (len >= 0 && len < zeroTol) return false;
        }
        return true;
      });
      const pcf1 = assemble(seq1, groupsPass1, config, pipelineRef);
      setState("pcfPass1Lines", pcf1);
    } else {
      setState("pcfPass1Lines", null);
    }

    console.info(`${LOG_PREFIX} Conversion complete. ${pcfLines.length} lines generated.`);

    // Navigate to PCF in Table Form tab
    switchTab('table-view');

    // Enable downstream tabs that require conversion data
    setTabEnabled('validate', true);
    setTabEnabled('preview', true);
    setTabEnabled('sequence', true);

    showConvertSuccess(seqResult.ordered.length, (seqResult.orphans || []).length);
  } catch (err) {
    console.error(`${LOG_PREFIX} Convert error: ${err.message}`, err);
    showConvertError(err.message);
  } finally {
    setConvertLoading(false);
  }
}

// ── Render ────────────────────────────────────────────────────────

function renderMappingTable(groups) {
  if (!_dom.tbody) {
    console.warn(`${LOG_PREFIX} renderMappingTable: tbody missing`);
    return;
  }

  if (!groups || !groups.size) {
    showEmpty();
    return;
  }

  const config = getConfig();
  const validTypes = Object.keys(config.pcfRules || {});
  // Add "SKIP" and "UNKNOWN" if not present
  if (!validTypes.includes("SKIP")) validTypes.push("SKIP");

  const rows = [];
  for (const [refno, g] of groups) {
    const isUnknown = g.pcfType === "UNKNOWN";
    const statusBadge = isUnknown
      ? `<span class="hdr-badge unmapped" style="color:var(--text-muted);background:var(--bg-3)">Awaiting</span>`
      : (g.skip
        ? `<span class="hdr-badge unmapped">SKIP</span>`
        : `<span class="hdr-badge mapped">MAPPED</span>`);

    // Build dropdown options
    const options = validTypes.map(t =>
      `<option value="${t}" ${t === g.pcfType ? "selected" : ""}>${t}</option>`
    ).join("");

    // Dropdown enabled to allow manual correction of mapping errors (e.g. UNKNOWN types)
    const dropdown = `<select class="config-select pcf-type-select" data-ref="${escHtml(refno)}" style="width:100%;padding:2px 4px;font-size:0.75rem">
      ${options}
    </select>`;

    rows.push(`<tr>
      <td><code>${escHtml(refno)}</code></td>
      <td><code>${escHtml(g.csvType)}</code></td>
      <td>${dropdown}</td>
      <td style="text-align:center">${g.rows.length}</td>
      <td>${statusBadge}</td>
    </tr>`);
  }

  _dom.tbody.innerHTML = rows.join("");
  showTable();

  // Enable convert button now that groups are ready
  if (_dom.convertBtn) {
    _dom.convertBtn.disabled = false;
    _dom.convertBtn.title = "";
  }
}

function updateGroupType(refNo, newType) {
  const groups = getState("groups");
  if (!groups || !groups.has(refNo)) return;

  const group = groups.get(refNo);

  // Update group properties
  group.pcfType = newType;
  group.skip = (newType === "SKIP" || newType === "UNKNOWN");

  // Update state (groups map is a reference, but we should setState to trigger any subscriptions if needed, though mostly shallow)
  setState("groups", groups);

  // Re-render table to update status badges
  renderMappingTable(groups);
  console.info(`${LOG_PREFIX} Manually updated ${refNo} to ${newType}`);
}

function setConvertLoading(on) {
  if (!_dom.convertBtn) return;
  _dom.convertBtn.disabled = on;
  _dom.convertBtn.textContent = on ? "⏳ Converting…" : "▶ Convert →";
}

function showConvertSuccess(componentCount, orphanCount) {
  const msg = document.getElementById("mapping-convert-msg");
  if (!msg) return;
  const orphanNote = orphanCount ? ` (${orphanCount} orphan${orphanCount > 1 ? "s" : ""})` : "";
  msg.textContent = `✓ ${componentCount} component${componentCount !== 1 ? "s" : ""} converted${orphanNote}. PCF ready — go to OUTPUT tab.`;
  msg.className = "issue-item INFO mt-1";
  msg.style.display = "flex";
}

function showConvertError(msg) {
  const el = document.getElementById("mapping-convert-msg");
  if (!el) return;
  el.textContent = `✗ Conversion failed: ${msg}`;
  el.className = "issue-item ERROR mt-1";
  el.style.display = "flex";
}

function showEmpty() {
  if (_dom.empty) _dom.empty.style.display = "";
  if (_dom.tableWrap) _dom.tableWrap.style.display = "none";
  if (_dom.convertBtn) _dom.convertBtn.disabled = true;
  const msg = document.getElementById("mapping-convert-msg");
  if (msg) msg.style.display = "none";
}

function showTable() {
  if (_dom.empty) _dom.empty.style.display = "none";
  if (_dom.tableWrap) _dom.tableWrap.style.display = "";
}

// ── Utility ───────────────────────────────────────────────────────

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const fmtPt = (p) => p ? `(${p.E?.toFixed(1) ?? 0}, ${p.N?.toFixed(1) ?? 0}, ${p.U?.toFixed(1) ?? 0})` : "-";

// Independent Axis Calc for Stage 3 & 4 (Dynamic Recalculation)
function calcDebugGeometry(g) {
  let ax1 = '', grpL1 = 0, ax2 = '', grpL2 = 0, ax3 = '', grpL3 = 0;
  const p1 = g.pts ? g.pts['1'] : null;
  const p2 = g.pts ? g.pts['2'] : null;
  if (p1 && p2) {
    const dE = Math.abs(p2.E - p1.E);
    const dN = Math.abs(p2.N - p1.N);
    const dU = Math.abs(p2.U - p1.U);

    // Simplified Logic for Debug Display
    if (dE > 0.1) { ax1 = (p2.E > p1.E ? 'EAST' : 'WEST'); grpL1 = dE.toFixed(1); }
    if (dN > 0.1) { ax2 = (p2.N > p1.N ? 'NORTH' : 'SOUTH'); grpL2 = dN.toFixed(1); }
    if (dU > 0.1) { ax3 = (p2.U > p1.U ? 'UP' : 'DOWN'); grpL3 = dU.toFixed(1); }
  }
  return { ax1, grpL1, ax2, grpL2, ax3, grpL3 };
}
