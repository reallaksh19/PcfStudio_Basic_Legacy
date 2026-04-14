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
import { isSkew, inferCorner } from "../geometry/direction-calc.js";
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

    // Merge Row Validator anomalies + store phase05Snapshot for Ray PCF
    {
      const report = getState("validationReport") ?? {};
      if (vr.anomalies && vr.anomalies.length) {
        report.anomaly = [...(report.anomaly ?? []), ...vr.anomalies];
      }
      report.phase05Snapshot = vr.phase05Snapshot ?? [];
      report.sourceRows      = vr.sourceRows      ?? [];
      setState("validationReport", report);
    }

    // Store validated count for use in runConvert tally
    setState("validatedRowCount", validatedRows.length);

    // ── Lookup maps for cross-stage _Static columns ───────────────────────────
    // Each map is keyed by String(Sequence) and holds the value FROM THAT SNAPSHOT.
    // A later stage's _Static column looks up the PREVIOUS stage's value so you
    // can see what changed (e.g. Stage 2 Len_Calc_Static = Stage 1 raw CSV value).
    const _getLenCalc = (r) => {
      const lenKey = Object.keys(r).find(k => k.trim().toUpperCase() === 'LEN_CALC');
      return lenKey ? (parseFloat(r[lenKey]) || 0).toFixed(2) : '0.00';
    };
    // Stage 1 → used as _Static in Stage 2
    const _s1LenMap = new Map((vr.sourceRows || []).map(r => [String(r.Sequence), _getLenCalc(r)]));
    // Stage 2 → used as _Static in Stage 3
    const _s2LenMap = new Map((vr.phase05Snapshot || []).map(r => [String(r.Sequence), r.Len_Calc != null ? parseFloat(r.Len_Calc).toFixed(2) : '0.00']));
    const _s2VecMap = new Map((vr.phase05Snapshot || []).map(r => [String(r.Sequence), r.Len_Vec ?? '']));
    // Stage 3 → used as _Static in Stage 4 / 4(7+)
    const _s3LenMap = new Map((vr.phase09Snapshot || []).map(r => [String(r.Sequence), r.Len_Calc != null ? parseFloat(r.Len_Calc).toFixed(2) : '0.00']));

    // DEBUG TAB: Stage 1 (JS call 1) — sourceRows after Phase 0 / 0.25 / 0.5
    {
      const s0Rows = (vr.sourceRows || []).map((r, i) => {
        const rowObj = { Row: i + 1 };
        rowObj['CSV Row'] = r.__csvRow ?? (i + 1);

        let phase0Status = 'OK';
        if (r.__unpaired_final)         phase0Status = 'Unpaired-Final';
        else if (r.__unpaired_resolved) phase0Status = 'Unpaired-Resolved';
        else if (r.__unpaired)          phase0Status = 'Unpaired';
        const spSuffix = /_Sp\d+$/.test(String(r.RefNo || ''));
        if (spSuffix && phase0Status === 'OK') phase0Status = 'Phase0-Split';
        rowObj['Phase 0 Status'] = phase0Status;

        ['Sequence', 'RefNo', 'Type', 'LineNo', 'Component Name', 'East', 'North', 'Up'].forEach(k => {
          if (r[k] !== undefined) rowObj[k] = r[k];
        });
        rowObj['Real_Type'] = r.Real_Type  || '—';
        rowObj['DE/BO']     = r['DE/BO']   || '—';

        const lenKey = Object.keys(r).find(k => k.trim().toUpperCase() === 'LEN_CALC');
        rowObj['Len_Calc'] = lenKey ? (parseFloat(r[lenKey]) || 0).toFixed(2) : '0.00';

        if (r.__unpaired_reason) rowObj['Unpaired Reason'] = r.__unpaired_reason;
        Object.keys(r).forEach(k => {
          if (!k.startsWith('__') && !(k in rowObj)) rowObj[k] = r[k];
        });
        return rowObj;
      });
      updateDebugTable(
        `Stage 1 — Pre-Processor Output (Phase 0 → 0.5) — ${s0Rows.length} rows`,
        s0Rows.length ? s0Rows : [{ Note: 'No rows produced by pre-processor' }],
        1,
        `JS call 1 of 12 — mapping-tab.js → runGrouping() → updateDebugTable("Stage 1")\nSource: row-validator.js vr.sourceRows — built during Phase 0 (coord fixups), Phase 0.25 (unpaired re-pairing), Phase 0.5 (PSI detection).\nPoints are raw CSV rows — not yet converted to pipe elements. No 3D Len_Calc computed yet.\nNew rows at this stage: rows with _Sp suffix (Phase 0 coordinate-gap splits added to sourceRows).`
      );
    }

    // DEBUG TAB: Stage 1.5 — Real_Type & DE/BO map (sourceRows, pre-Phase-1)
    {
      const sRTRows = (vr.rtMapSnapshot || []).map((r, i) => ({
        'Row':       i + 1,
        'Sequence':  r.Sequence ?? '',
        'RefNo':     r.RefNo    ?? '',
        'Type':      r.Type     ?? '',
        'Point':     r.Point    ?? '',
        'East':      r.East     ?? '',
        'North':     r.North    ?? '',
        'Up':        r.Up       ?? '',
        'Real_Type': r.Real_Type || '—',
        'DE/BO':     r['DE/BO'] || '—',
      }));
      updateDebugTable(
        `Stage 1.5 — Real_Type & DE/BO Map — ${sRTRows.length} rows`,
        sRTRows.length ? sRTRows : [{ Note: 'No sourceRows available' }],
        1.5,
        `Supplementary to Stage 1 — same sourceRows, focused view of Phase 0.6/0.7 enrichment.\nReal_Type = component type this row belongs to (ANCI/RSTR look ahead to next non-zero point).\nDE/BO: NIL = inline or 90° (or 45° for BEND/ELBOW); BO = first row or TEE/OLET branch; DE = dead end; DE/BO resolved by Real_Type.`
      );
    }

    // DEBUG TAB: Stage 2 — Phase 1 output (Len_Vec computed, push gate applied, _Sp1 rows created)
    // Snapshot taken BEFORE PSI Phase 2 mutation + Final Pass.
    {
      const s05Rows = (vr.phase05Snapshot || []).map((r, i) => {
        const row = { Row: i + 1 };
        ['Sequence','RefNo','Type','Bore','East','North','Up'].forEach(k => { if (r[k] !== undefined) row[k] = r[k]; });
        row['Len_Calc']        = r.Len_Calc  != null ? parseFloat(r.Len_Calc).toFixed(2)  : '0.00';
        row['Len_Calc_Static'] = _s1LenMap.get(String(r.Sequence)) ?? '—';  // Stage 1 raw CSV value
        row['Len_Vec']         = r.Len_Vec   ?? '';
        row['EndX']      = r.EndX      ?? '';
        row['EndY']      = r.EndY      ?? '';
        row['EndZ']      = r.EndZ      ?? '';
        row['Gate?']     = r.__gateCollapsed  ? 'Yes' : '';
        row['Sp1?']      = r.__sp1Preserved   ? 'Yes' : '';
        row['NeedsBridge?'] = r.__needsBridge ? 'Yes' : '';
        // Remaining non-internal columns
        Object.keys(r).forEach(k => { if (!k.startsWith('__') && !(k in row)) row[k] = r[k]; });
        return row;
      });
      updateDebugTable(
        `Stage 2 — Phase 1 Output (Len_Vec / Push Gate / Sp1) — ${s05Rows.length} rows`,
        s05Rows.length ? s05Rows : [{ Note: 'No Phase 1 snapshot available' }],
        2,
        `JS call 2 of 12 — mapping-tab.js → runGrouping() → updateDebugTable("Stage 2")\nSource: row-validator.js vr.phase05Snapshot — deep copy taken after Phase 1 loop, before PSI Phase 2 mutation.\nLen_Calc is now 3D-computed distance (√(dE²+dN²+dU²)). Len_Vec direction vector assigned. Push Gate applied to multi-axis bores.\nNew rows at this stage: _Sp1 rows inserted when bore crosses a support/fitting (Phase 1 gap detection).\nLen_Calc_Static = Stage 1 raw CSV value — compare to Len_Calc to see Phase 1 recompute delta.`
      );
    }

    // DEBUG TAB: Stage 2-OUT — Phase 1 rows after filtering (no PIPE/BRAN, no zero-lenCalc except supports, no config-excluded types)
    {
      const s2OutRows = _s2OutFilterRows(vr.phase05Snapshot || [], config)
        .map((r, i) => {
          const row = { Row: i + 1 };
          ['Sequence','RefNo','Type','Real_Type','Bore','East','North','Up'].forEach(k => { if (r[k] !== undefined) row[k] = r[k]; });
          row['Len_Calc'] = r.Len_Calc != null ? parseFloat(r.Len_Calc).toFixed(2) : '0.00';
          row['Len_Vec']  = r.Len_Vec ?? '';
          row['EndX'] = r.EndX ?? '';
          row['EndY'] = r.EndY ?? '';
          row['EndZ'] = r.EndZ ?? '';
          row['Gate?'] = r.__gateCollapsed ? 'Yes' : '';
          row['Sp1?']  = r.__sp1Preserved  ? 'Yes' : '';
          return row;
        });
      updateDebugTable(
        `⚡ Stage 2-OUT — Phase 1 Filtered (no PIPE/BRAN, no zero-len except supports) — ${s2OutRows.length} rows`,
        s2OutRows.length ? s2OutRows : [{ Note: 'No rows after filtering' }],
        2.5,
        `Stage 2-OUT: Phase 1 snapshot (same source as Stage 2) with three filters applied.\n` +
        `1. PIPE, BRAN, and config-excluded types (SKIP/UNKNOWN/MISC-COMPONENT per componentTypeMap, e.g. GASK, PCOM) removed.\n` +
        `2. Rows with Len_Calc=0 removed EXCEPT ANCI/RSTR/SUPPORT (point supports kept at zero-length).\n` +
        `This is the input set that drives the Ray PCF assembly.`
      );
    }

    // DEBUG TAB: Stage 3 — Pre-Final-Pass state (post-PSI-Phase2, post-segmentation)
    // _pipe rows visible, __needsBridge flags set. pairStatus not yet assigned by Final Pass.
    {
      const s09Rows = (vr.phase09Snapshot || []).map((r, i) => {
        const row = { Row: i + 1 };
        ['Sequence','RefNo','Type','Bore','East','North','Up'].forEach(k => { if (r[k] !== undefined) row[k] = r[k]; });
        row['Len_Calc']        = r.Len_Calc  != null ? parseFloat(r.Len_Calc).toFixed(2)  : '0.00';
        row['Len_Calc_Static'] = _s2LenMap.get(String(r.Sequence)) ?? '—';  // Stage 2 Phase-1 value
        row['Len_Vec']         = r.Len_Vec   ?? '';
        row['Len_Vec_Static']  = _s2VecMap.get(String(r.Sequence)) ?? '—';  // Stage 2 Phase-1 Len_Vec
        row['EndX']      = r.EndX      ?? '';
        row['EndY']      = r.EndY      ?? '';
        row['EndZ']      = r.EndZ      ?? '';
        row['Gate?']     = r.__gateCollapsed  ? 'Yes' : '';
        row['Sp1?']      = r.__sp1Preserved   ? 'Yes' : '';
        row['NeedsBridge?'] = r.__needsBridge ? 'Yes' : '';
        row['Synthetic?']   = String(r.RefNo || '').includes('_pipe') || String(r.RefNo || '').includes('_Injected') || String(r.RefNo || '').includes('_bridged') || String(r.RefNo || '').includes('_Support') || String(r.RefNo || '').includes('_Sp') ? 'Yes' : '';
        Object.keys(r).forEach(k => { if (!k.startsWith('__') && !(k in row)) row[k] = r[k]; });
        return row;
      });
      updateDebugTable(
        `Stage 3 — Pre-Final-Pass (Post-PSI / Post-Segmentation) — ${s09Rows.length} rows`,
        s09Rows.length ? s09Rows : [{ Note: 'No Stage 3 snapshot available' }],
        3,
        `JS call 3 of 12 — mapping-tab.js → runGrouping() → updateDebugTable("Stage 3")\nSource: row-validator.js vr.phase09Snapshot — deep copy taken just before the Final Pass loop.\nPSI Phase 2 has run: cross-line _pipe bridge rows exist, __needsBridge flags set on zero-length markers.\nSegmentation has run: additional _Sp coordinate-gap splits visible. pairStatus not yet assigned.\nNew rows at this stage: _pipe bridge markers (PSI Phase 2), additional _Sp splits (segmentation phase).\nLen_Calc_Static = Stage 2 Phase-1 value — compare to see PSI Phase 2 corrections (e.g. cross-line rows zeroed).\nLen_Vec_Static = Stage 2 Len_Vec — compare to see if direction changed after PSI Phase 2.`
      );
    }

    // DEBUG TAB: Stage 1A / 1B — Validated CSV Data split by run stage
    // 1A = Global/chain run (Paired-Seq)  |  1B = Orphan/spatial run (Pair-Geo / Unpaired)
    //
    // Engine mode label (mirrors Global Engine Behavior spec):
    //   sequential              → "Sequential"
    //   repair  + multiPass     → "Fuzzy (Multi)"
    //   repair  + !multiPass    → "Fuzzy (Single)"
    const pMode    = config.coordinateSettings?.pipelineMode ?? 'repair';
    const isMulti  = config.coordinateSettings?.multiPass === true;
    const chainOn  = config.coordinateSettings?.chainBasedOrder !== false;
    let engineLabel;
    if (pMode === 'sequential') {
      engineLabel = 'Sequential';
    } else if (isMulti) {
      engineLabel = 'Fuzzy (Multi)';
    } else {
      engineLabel = chainOn ? 'Fuzzy (Single) + Chain ON' : 'Fuzzy (Single) + Chain OFF';
    }

    // Shared row-builder: converts a validated row + its index into a debug object
    const buildS1Row = (r, i) => {
      const rowObj = { Row: i + 1 };

      // Line No.(Derived) — from row or fallback chain
      let derivedLineNo = r['Line No.(Derived)'] || r['Line Number'] || r['Line'] || r['Pipeline Ref'] || '';
      rowObj['Line No.(Derived)'] = derivedLineNo;

      // Paired Rows — stamped by row-validator.js Phase 5 (_pnt1Seq / _pnt2Seq)
      const pnt1 = r._pnt1Seq;
      const pnt2 = r._pnt2Seq;

      const getRaySkip = (seq) => {
          if (!seq) return 'F';
          // Search raw sourceRows since deleted bindings (like GASKETS) may not exist in validated array
          const cand = vr.sourceRows.find(x => String(x.Sequence) === String(seq));
          if (!cand) return 'F';

          // __raySkip is authoritatively computed by row-validator.js (which correctly
          // excludes support-type CPs from being skipped). Trust it when set.
          if (cand.__raySkip !== undefined) return cand.__raySkip ? 'T' : 'F';

          // Fallback for rows removed before validation (e.g. deleted GASKETs)
          if (cand.__gateCollapsed) return 'T';
          const _t = String(cand.Type || '').trim().toUpperCase();
          const _eff = (window.mappingSystem?.config?.componentTypeMap?.[_t]) || _t;
          if (['GASKET', 'MISC', 'PCOM'].includes(_eff)) return 'T';
          if (String(cand.Point ?? '').trim() === '0') return 'T';

          return 'F';
      };

      const rs1 = getRaySkip(pnt1);
      const rs2 = getRaySkip(pnt2);

      if (pnt2 != null) {
          rowObj['Paired Rows'] = `${pnt1}(RaySkip:${rs1})-${pnt2}(RaySkip:${rs2})`;
      } else {
          rowObj['Paired Rows'] = `${pnt1}(RaySkip:${rs1})-end`;
      }

      // Pair method label (for 1B rows where it matters most)
      rowObj['Pair Method'] = r.pairStatus || 'Paired-Seq';

      ['Sequence', 'RefNo', 'Type', 'LineNo', 'Component Name', 'East', 'North', 'Up', 'Len_Calc', 'Len_Vec'].forEach(k => {
        if (r[k] !== undefined) rowObj[k] = r[k];
      });

      // Node Class Mapping (EP1/EP2/CP/BP) immediately after Len_Vec
      const ptStr = String(r.Point ?? '').trim();
      if (ptStr === '1') rowObj['Node Class'] = 'EP1';
      else if (ptStr === '2') rowObj['Node Class'] = 'EP2';
      else if (ptStr === '0') rowObj['Node Class'] = 'CP';
      else if (ptStr === '3' || ptStr === '4') rowObj['Node Class'] = `BP(${ptStr})`;
      else rowObj['Node Class'] = 'n/a';

      // Coordinate Snapshots
      rowObj['EP1 (Origin)'] = `(${Number(r.East||0).toFixed(1)}, ${Number(r.North||0).toFixed(1)}, ${Number(r.Up||0).toFixed(1)})`;
      rowObj['EP2 (Target)'] = `(${Number(r.EndX||r.East||0).toFixed(1)}, ${Number(r.EndY||r.North||0).toFixed(1)}, ${Number(r.EndZ||r.Up||0).toFixed(1)})`;

      Object.keys(r).forEach(k => {
        if (k !== '_rowIndex' && k !== 'pairStatus' && k !== '_pnt1Seq' && k !== '_pnt2Seq' && k !== '__axisCount' && k !== '__gateCollapsed' && !(k in rowObj)) rowObj[k] = r[k];
      });

      if (r.Len_Calc) rowObj['Len_Calc'] = parseFloat(r.Len_Calc).toFixed(2);
      else rowObj['Len_Calc'] = '0.00';
      rowObj['Len_Calc_Static'] = _s3LenMap.get(String(r.Sequence)) ?? '—';  // Stage 3 pre-FinalPass value
      return rowObj;
    };

    // DEBUG TAB: Stage 3.5 — Pre-Ray-Shooter (Final Pass Resolved)
    if (typeof window !== 'undefined' && window.__RAY_MODE) {
      const s35Rows = (vr.phase10Snapshot || []).map((r, i) => buildS1Row(r, i));
      updateDebugTable(
        `⚡ Stage 3.5 — Pre-Ray-Shooter (Final Pass Resolved) — ${s35Rows.length} rows`,
        s35Rows.length ? s35Rows : [{ Note: 'No Stage 3.5 snapshot available' }],
        3.5,
        `JS call 3.5 of 12 — mapping-tab.js → runGrouping() → updateDebugTable("Stage 3.5")\nSource: row-validator.js vr.phase10Snapshot — deep copy taken EXACTLY before runRayShooter().\nThis represents the true, absolute target pool of geometries handed to the Ray physics engine.\npairStatus markers are finalized. Synthetic splits are present. __raySkip markers are mathematically bound.`,
        true
      );
    }

    // Split by pairStatus — Stage 1B will be re-rendered post-geometry below
    const s1aRows = [];
    validatedRows.forEach((r, i) => {
      if ((r.pairStatus ?? 'Paired-Seq') === 'Paired-Seq') {
        s1aRows.push(buildS1Row(r, i));
      }
    });

    // Determine whether 1B run is active for this engine mode
    // Sequential + Chain ON  → orphans not re-processed (1B empty by design)
    // Fuzzy Multi             → global spatial graph, everything in 1A
    const orphanRunActive = !(pMode === 'sequential' && chainOn) && !isMulti;

    updateDebugTable(
      `Stage 4 — Validation Pass / Global Run (${engineLabel}) — ${s1aRows.length} rows`,
      s1aRows.length ? s1aRows : [{ Note: 'No rows produced by global run' }],
      4,
      `JS call 4 of 12 — mapping-tab.js → runGrouping() → updateDebugTable("Stage 4")\nSource: row-validator.js vr.validated — Final Pass output after Paired-Seq resolution.\nShows rows with pairStatus=Paired-Seq only (sequential chain pairing succeeded via P-1/P-2/P-3).\nAll rows have EndX/Y/Z set and Len_Calc recomputed from 3D endpoints.`
    );
    // NOTE: Stage 4(7+) is rendered AFTER processGeometry so it reflects the post-orphan-pairing state.

    // 1. Grouping
    let groups = groupByRefNo(validatedRows, config);

    // DEBUG TAB: Stage 5 - After Grouping
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
    updateDebugTable(
      `Stage 5 — After Grouping (Raw CSV) — ${s2Rows.length} groups`,
      s2Rows,
      5,
      `JS call 5 of 12 — mapping-tab.js → runGrouping() → updateDebugTable("Stage 5")\nSource: groupByRefNo() output — CSV rows grouped by RefNo into component groups.\nEach row = one component group. Grp_E/N/U = absolute axis displacement (|End − Start|) per axis.\nNo geometry computed yet — coordinates come directly from CSV row values, not 3D transforms.`
    );

    // 2. Geometry Pipeline
    const { groups: processed, anomalies, groupsPass1 } = processGeometry(groups, config);
    groups = processed;

    // DEBUG TAB: Stage 6 - After Geometry
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
        'Synthetic?': g.refno.includes('_Sp') || g.refno.includes('_Injected') || g.refno.includes('_bridged') || g.refno.includes('_Support') ? 'Yes' : 'No'
      };
    });
    updateDebugTable(
      `Stage 6 — After Geometry Processing — ${s3Rows.length} groups`,
      s3Rows,
      6,
      `JS call 6 of 12 — mapping-tab.js → runGrouping() → updateDebugTable("Stage 6")\nSource: processGeometry() output — geometry pipeline applies 3D transforms, elbow routing, orphan pairing.\nEach row = one component group. LenCalc = straight-line 3D length EP1→EP2. Pts[0..4] = computed endpoints.\nSynthetic? = Yes for _Sp / _Injected rows added by PSI or ray shooter injection.\nOrphans paired here by spatial ray casting — those results appear in Stage 4(7+) and Stage 8.`
    );

    // DEBUG TAB: Stage 4(7+) — rendered HERE (after orphan spatial pairing in processGeometry)
    // Revisits Stage 4 (vr.validated) data AFTER processGeometry() has run (JS call 7).
    // Orphan pairing in processGeometry may change group.skip / lenCalc for rows that were
    // spatially re-paired. We re-read pairStatus from validatedRows (updated by Final Pass gate
    // and immutable guards) so the table reflects post-geometry state.
    {
      // Rebuild s1bRows now that processGeometry has run
      const s1bRowsPost = [];
      validatedRows.forEach((r, i) => {
        if ((r.pairStatus ?? 'Paired-Seq') !== 'Paired-Seq') {
          // Check if the group for this row was resolved by geometry (not skipped, has lenCalc)
          const refNo = String(r.RefNo ?? '').trim();
          const grp   = groups.get(refNo);
          const row   = buildS1Row(r, i);
          // Annotate with post-geometry outcome
          if (grp && !grp.skip && grp.lenCalc > 0 && r.pairStatus !== 'Gate-Collapsed') {
            row['Post-Geo'] = 'Resolved';
          } else if (grp && grp.skip) {
            row['Post-Geo'] = 'Skipped';
          } else {
            row['Post-Geo'] = '—';
          }
          s1bRowsPost.push(row);
        }
      });
      updateDebugTable(
        `Stage 4 (7+) — Orphan/Spatial Run (${engineLabel}) — ${s1bRowsPost.length} rows${!orphanRunActive ? ' [inactive for this mode]' : ''}`,
        s1bRowsPost.length ? s1bRowsPost : [{ Note: orphanRunActive ? 'No orphan rows — all rows resolved in global run' : 'Orphan spatial pass disabled for this engine mode' }],
        7,
        `JS call 7 of 12 — mapping-tab.js → runGrouping() → updateDebugTable("Stage 4(7+)")\nSource: same vr.validated dataset as Stage 4, re-read AFTER processGeometry() has run (call 7).\nShows only non-Paired-Seq rows: Pair-Geo, Unpaired, Gate-Collapsed — the orphan/spatial pass results.\nPost-Geo = Resolved if processGeometry gave the group a non-zero lenCalc; Skipped if group.skip=true.`
      );
    }

    // DEBUG TAB: Stage 8 — Ray Shooter results
    if (vr.stage1cLog && vr.stage1cLog.length > 0) {
      updateDebugTable(
        `⚡ Stage 8 — Ray Shooter Results — ${vr.stage1cLog.length} resolved`,
        vr.stage1cLog,
        8,
        `JS call 8 of 12 — mapping-tab.js → runGrouping() → updateDebugTable("Stage 8")\nSource: vr.stage1cLog — ray shooter results emitted by Final Pass for Unpaired orphans.\nEach row = one resolved orphan. Shows which axis/direction was used, hit RefNo, and computed Len_Calc.\nRay shooter fires for Unpaired rows after P-1/P-2/P-3 fail. P4-LenVec = ±Len_Vec tried first; P4-AxisFallback = 6 principal axes.\nFLANGE/VALVE hits produce _Injected PIPE rows (immutable fitting stays zero-length with Pair-Geo status).`,
        true
      );
    }

    // DEBUG TAB: Stage 8.5 — Final PCF Basis
    if (typeof window !== 'undefined' && window.__RAY_MODE) {
      const s85Rows = validatedRows.map((r, i) => buildS1Row(r, i));
      updateDebugTable(
        `⚡ Stage 8.5 — Final PCF Basis (Complete Geometric Array) — ${s85Rows.length} rows`,
        s85Rows.length ? s85Rows : [{ Note: 'No rows available' }],
        8.5,
        `JS call 8.5 of 12 — mapping-tab.js → runGrouping() → updateDebugTable("Stage 8.5")\nSource: validatedRows — The absolute final state of the array after all sequential pairing, spatial pairing, and Ray Shooter physics injections have completed.\nThis identical structural array is the basis for PCF export.`,
        true
      );
    }

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

// ── Ray Mode helpers ──────────────────────────────────────────────────────────

/**
 * Stage 2-OUT row filter: returns only the Phase 1 rows that should drive the Ray PCF.
 *   - Removes PIPE, BRAN
 *   - Removes types that the config maps to SKIP / UNKNOWN / MISC-COMPONENT (e.g. GASK, PCOM)
 *   - Removes rows with Len_Calc=0 EXCEPT supports (ANCI/RSTR/SUPPORT — kept as point supports)
 * @param {object[]} rows  phase05Snapshot rows
 * @param {object}   config  full app config
 * @returns {object[]}
 */
function _s2OutFilterRows(rows, config) {
  const _typeMap = config.componentTypeMap ?? {};
  const _nonMappedPcf = new Set(['SKIP', 'UNKNOWN', 'MISC-COMPONENT']);
  const _configExclude = new Set(
    Object.entries(_typeMap)
      .filter(([, pcf]) => _nonMappedPcf.has(String(pcf).toUpperCase()))
      .map(([csv]) => csv.toUpperCase())
  );
  const _alwaysExclude = new Set(['PIPE', 'BRAN', ..._configExclude]);
  const _supportTypes  = new Set(['ANCI', 'RSTR', 'SUPPORT']);

  return rows.filter(r => {
    const typ = String(r.Type || '').trim().toUpperCase();
    if (_alwaysExclude.has(typ)) return false;
    const len = parseFloat(r.Len_Calc) || 0;
    if (len === 0 && !_supportTypes.has(typ)) return false;
    return true;
  });
}

/** Always-excluded in Ray Mode — pure connectors / boundary markers with no physical body. */
const _RAY_ALWAYS_EXCLUDE = new Set(['PIPE', 'BRAN']);

/** Support types: included in Ray Mode but converted to SUPPORT with EP1=EP2. */
const _RAY_SUPPORT_TYPES = new Set(['ANCI', 'RSTR', 'SUPPORT']);

/**
 * Build a shallow-cloned support group from an ANCI/RSTR/SUPPORT group:
 *  - pcfType  → 'SUPPORT'
 *  - skip     → false
 *  - pts      → EP1 = EP2 = the component's single coordinate (point support)
 */
function _toSupportGroup(group) {
  const clone = { ...group, pcfType: 'SUPPORT', skip: false };

  // Derive coordinate from existing pts (already built by processGeometry) or raw row.
  // Priority: pts['0'] (non-zero) → pts['1'] (non-zero) → raw row → any pts value.
  const _hasCoord = (p) => p && (p.E !== 0 || p.N !== 0 || p.U !== 0);
  let coord = null;
  if (_hasCoord(group.pts?.['0'])) {
    coord = { ...group.pts['0'] };
  } else if (_hasCoord(group.pts?.['1'])) {
    coord = { ...group.pts['1'] };
  } else {
    // Fall back to raw row East/North/Up (avoids zero-coord from processGeometry)
    const row = group.rows?.[0];
    if (row && (parseFloat(row.East) || parseFloat(row.North) || parseFloat(row.Up))) {
      coord = {
        E:    parseFloat(row.East)  || 0,
        N:    parseFloat(row.North) || 0,
        U:    parseFloat(row.Up)    || 0,
        bore: parseFloat(row.Bore || row['O/D'] || 0) || 0,
      };
    } else {
      // Last resort: any non-zero point from pts
      const anyPt = Object.values(group.pts || {}).find(_hasCoord);
      if (anyPt) coord = { ...anyPt };
    }
  }

  // writeSupport reads pts['0'].  EP1=EP2 (point support — zero length).
  clone.pts = coord
    ? { '0': coord, '1': coord, '2': { ...coord } }
    : (group.pts || {});
  return clone;
}

/**
 * Return a filtered Map of groups for Ray Mode PCF:
 *  - Excludes PIPE and BRAN (always)
 *  - Excludes non-mapped items (pcfType=SKIP/UNKNOWN) per config — catches GASK, PCOM, MISC, etc.
 *  - Converts ANCI/RSTR/SUPPORT → SUPPORT with EP1=EP2 (point supports stay in the model)
 *  - Excludes single-axis BENDs (data artefacts, not real direction changes)
 */
function _nonPipeGroups(groups) {
  const out = new Map();
  for (const [refno, group] of groups) {
    const csvType = String(group.csvType || '').trim().toUpperCase();

    // 1. Always exclude PIPE and BRAN
    if (_RAY_ALWAYS_EXCLUDE.has(csvType)) continue;

    // 2. Support types → convert to SUPPORT point component, include
    if (_RAY_SUPPORT_TYPES.has(csvType)) {
      out.set(refno, _toSupportGroup(group));
      continue;
    }

    // 3. Non-mapped per config (SKIP/UNKNOWN pcfType) → exclude (handles GASK, PCOM, MISC, etc.)
    if (group.pcfType === 'SKIP' || group.pcfType === 'UNKNOWN') continue;

    // 3. BEND/ELBOW: skip rows where EP1→EP2 vector lies along a single principal axis —
    //    these are data artefacts (straight-line "bend"), not real direction changes.
    if (group.pcfType === 'BEND') {
      const ep1 = group.pts?.['1'], ep2 = group.pts?.['2'];
      if (ep1 && ep2) {
        const TOL = 1.0; // mm — components smaller than this are treated as zero
        const nonZeroAxes = [
          Math.abs((ep2.E || 0) - (ep1.E || 0)),
          Math.abs((ep2.N || 0) - (ep1.N || 0)),
          Math.abs((ep2.U || 0) - (ep1.U || 0)),
        ].filter(d => d > TOL).length;
        if (nonZeroAxes <= 1) continue; // single-axis vector → not a real bend
      }
    }

    // 4. TEE: ensure pts['1'] and pts['2'] are present (writeTee returns [] without them).
    //    Force-build pts from rows if processGeometry didn't set them.
    if (group.pcfType === 'TEE') {
      if (!group.pts?.['1'] || !group.pts?.['2']) {
        group.pts = buildPts(group, {});
      }
      if (!group.pts?.['1'] || !group.pts?.['2']) continue; // still missing → skip
    }

    // 5. Everything else (FLAN, TEE, VALVE, REDU, OLET, …) → include as-is
    out.set(refno, group);
  }
  return out;
}

/** Generate and store Ray Mode PCF (non-pipe fittings skeleton).
 *  Uses Stage 2 — Phase 1 Output (Len_Vec / Push Gate / Sp1) as the source rows,
 *  re-grouped independently from the Final Pass groups. */
function _generateRayPCF(config, pipelineRef) {
  try {
    const vr = getState('validationReport') ?? {};
    const phase05Rows = vr.phase05Snapshot ?? [];
    if (!phase05Rows.length) {
      setState('rayPcfLines', []);
      return;
    }

    // Stage 1 sourceRows — used below to resolve TEE Branch1-Point when Phase 1
    // EndX is not stamped on the Point=3 row (branch far endpoint not computed).
    // Keyed by RefNo string for O(1) lookup.
    const _srcByRefNo = new Map();
    for (const r of (vr.sourceRows ?? [])) {
      const ref = String(r.RefNo ?? '').trim();
      if (!ref) continue;
      const pt = String(r.Point ?? '').trim();
      if (!_srcByRefNo.has(ref)) _srcByRefNo.set(ref, {});
      _srcByRefNo.get(ref)[pt] = r;
    }

    // ── Step 1: group ALL Phase 1 rows (no pre-filter) ──────────────────────
    // Deep-copy rows so groupByRefNo cannot mutate RefNo fields in state
    // (grouper writes _SpX suffixes in-place; without a copy subsequent calls
    //  would receive already-modified refnos and create double-splits).
    //
    // Ray-mode: rename Phase-1 ANCI _SpN PIPE clones to _bridged before grouping.
    // These synthetic rows (created by the SUPPORT clone logic in row-validator
    // Phase 1) represent the physical pipe segment from a support attachment point
    // to the next fitting. Renaming them to _bridged makes them appear in the Ray
    // PCF output as proper PIPE blocks with a recognisable suffix, rather than
    // being silently discarded.
    const rowsCopy = phase05Rows.map(r => {
      const copy = { ...r };
      const ref = String(copy.RefNo ?? '');
      const m = ref.match(/^(.+?)_Sp\d+$/);
      if (m) copy.RefNo = m[1] + '_bridged';
      return copy;
    });
    const allGroups = groupByRefNo(rowsCopy, config);

    // ── Relabel any _SpN groups created by the grouper as _bridged ───────────
    // groupByRefNo uses _Sp1/_Sp2 etc. for splits. In Ray mode we want a distinct
    // suffix so the split artefacts are clearly identifiable and caught by the
    // existing _bridged filter in Step 2 (and by pcf-cleaner).
    for (const [refno] of [...allGroups]) {
      const refStr = String(refno);
      const spMatch = refStr.match(/^(.+?)(_Sp\d+)$/);
      if (!spMatch) continue;
      const bridgedKey = spMatch[1] + '_bridged';
      const g = allGroups.get(refno);
      g.refno = bridgedKey;
      g.uniqueKey = bridgedKey;
      for (const r of g.rows) r.RefNo = bridgedKey;
      allGroups.delete(refno);
      allGroups.set(bridgedKey, g);
    }

    for (const [refno, g] of allGroups) {
      if (!g.pts) g.pts = buildPts(g, config);

      // ── Ray-mode CP recovery ──────────────────────────────────────────────
      // PSI Phase 0.5 blindly splits the LAST row of a 3-row ELBO into a
      // `RefNo_pipe` companion.  When the CSV order is [P1, P2, P0] the CP row
      // (Point=0) is the last row and gets incorrectly promoted to _pipe, leaving
      // the ELBO group without pts['0'].  That forces writeBend to fall back to
      // inferCorner(), which picks the wrong corner when |dE| ≈ |dN|.
      //
      // Fix: if a BEND group has both endpoints but no CP, look for the companion
      // `_pipe` group; its first row still carries the original CP East/North/Up.
      if (g.pcfType === 'BEND' && g.pts['1'] && g.pts['2'] && !g.pts['0']) {
        const pipeGrp = allGroups.get(String(refno) + '_pipe');
        if (pipeGrp?.rows?.length > 0) {
          const cpRow = pipeGrp.rows[0];
          const cpE = parseFloat(cpRow.East)  || 0;
          const cpN = parseFloat(cpRow.North) || 0;
          const cpU = parseFloat(cpRow.Up)    || 0;
          const ep1 = g.pts['1'], ep2 = g.pts['2'];
          const d1 = Math.sqrt((cpE-ep1.E)**2 + (cpN-ep1.N)**2 + (cpU-ep1.U)**2);
          const d2 = Math.sqrt((cpE-ep2.E)**2 + (cpN-ep2.N)**2 + (cpU-ep2.U)**2);
          if (d1 > 1.0 && d2 > 1.0) {
            g.pts['0'] = {
              E: cpE, N: cpN, U: cpU,
              bore:     ep1.bore     ?? 0,
              radius:   ep1.radius   ?? 0,
              wall:     ep1.wall     ?? 0,
              corr:     ep1.corr     ?? 0,
              weight:   ep1.weight   ?? 0,
              insul:    ep1.insul    ?? 0,
              pressure: ep1.pressure,
              hydro:    ep1.hydro,
              material: ep1.material ?? '',
            };
            console.log(`[RayMode] Recovered BEND CP for ${refno} from _pipe companion: E=${cpE.toFixed(1)} N=${cpN.toFixed(1)} U=${cpU.toFixed(1)}`);
          }
        }
      }

      // ── Ray-mode TEE pts['3'] (BP) recovery ──────────────────────────────
      // Strategy (3 layers):
      //  1. _pipe companion: Phase 0.5 splits the last row of a 4-row TEE into
      //     RefNo_pipe.  Prefer EndX/EndY/EndZ (TEE-BP enrichment) over raw E/N/U.
      //  2. rowsCopy scan: scan Phase 1 rows for any row sharing the same base
      //     RefNo with Point=3 that may have been split to a _SpX group.
      //  3. DE/BO scan: find the first adjacent row in rowsCopy with DE/BO='BO'
      //     to infer the branch direction when CSV Point=3 is entirely absent.
      if (g.pcfType === 'TEE' && g.pts['1'] && g.pts['2'] && !g.pts['3']) {
        const ep1 = g.pts['1'], ep2 = g.pts['2'];
        const cpE = (ep1.E + ep2.E) / 2, cpN = (ep1.N + ep2.N) / 2, cpU = (ep1.U + ep2.U) / 2;
        const _makeBP = (bpE, bpN, bpU) => ({
          E: bpE, N: bpN, U: bpU,
          bore:     ep1.bore     ?? 0,
          radius:   ep1.radius   ?? 0,
          wall:     ep1.wall     ?? 0,
          corr:     ep1.corr     ?? 0,
          weight:   ep1.weight   ?? 0,
          insul:    ep1.insul    ?? 0,
          pressure: ep1.pressure,
          hydro:    ep1.hydro,
          material: ep1.material ?? '',
        });

        // Layer 1: _pipe companion (Phase 0.5 4-row TEE split)
        const pipeGrp = allGroups.get(String(refno) + '_pipe');
        if (!g.pts['3'] && pipeGrp?.rows?.length > 0) {
          const bpRow = pipeGrp.rows[0];
          // Prefer EndX/EndY/EndZ (TEE-BP enrichment result) over raw coords
          const bpE = parseFloat(bpRow.EndX ?? bpRow.East)  || 0;
          const bpN = parseFloat(bpRow.EndY ?? bpRow.North) || 0;
          const bpU = parseFloat(bpRow.EndZ ?? bpRow.Up)    || 0;
          if (Math.sqrt((bpE-cpE)**2 + (bpN-cpN)**2 + (bpU-cpU)**2) > 1.0) {
            g.pts['3'] = _makeBP(bpE, bpN, bpU);
            console.log(`[RayMode] Recovered TEE BP for ${refno} from _pipe companion: E=${bpE.toFixed(1)} N=${bpN.toFixed(1)} U=${bpU.toFixed(1)}`);
          }
        }

        // Layer 2: scan rowsCopy for any Phase 1 row with Point=3 and matching base RefNo
        if (!g.pts['3']) {
          const baseRef = String(refno).split('_')[0];  // strip _Sp/_pipe suffixes
          for (const row of rowsCopy) {
            const rowRef  = String(row.RefNo || '').split('_')[0];
            const rowPt   = String(row.Point ?? '').trim();
            if (rowRef !== baseRef || rowPt !== '3') continue;
            const bpE = parseFloat(row.EndX ?? row.East)  || 0;
            const bpN = parseFloat(row.EndY ?? row.North) || 0;
            const bpU = parseFloat(row.EndZ ?? row.Up)    || 0;
            if (Math.sqrt((bpE-cpE)**2 + (bpN-cpN)**2 + (bpU-cpU)**2) > 1.0) {
              g.pts['3'] = _makeBP(bpE, bpN, bpU);
              console.log(`[RayMode] Recovered TEE BP for ${refno} by rowsCopy scan (P3): E=${bpE.toFixed(1)} N=${bpN.toFixed(1)} U=${bpU.toFixed(1)}`);
              break;
            }
          }
        }

        // Layer 3: DE/BO='BO' adjacent scan — find branch-off row near TEE EP1/EP2
        if (!g.pts['3']) {
          const ep1Idx = g.rows.find(r => String(r.Point ?? '').trim() === '1')?._rowIndex ?? -1;
          const ep2Idx = g.rows.find(r => String(r.Point ?? '').trim() === '2')?._rowIndex ?? ep1Idx;
          for (let di = -3; di <= 3; di++) {
            const i = (ep2Idx >= 0 ? ep2Idx : ep1Idx) + di;
            if (i < 0 || i >= rowsCopy.length) continue;
            const row = rowsCopy[i];
            if (String(row['DE/BO'] || '').trim() !== 'BO') continue;
            const rt = String(row.Real_Type || row.Type || '').trim().toUpperCase();
            if (!rt.includes('TEE')) continue;  // must be a TEE branch row
            const bpE = parseFloat(row.East)  || 0;
            const bpN = parseFloat(row.North) || 0;
            const bpU = parseFloat(row.Up)    || 0;
            if (Math.sqrt((bpE-cpE)**2 + (bpN-cpN)**2 + (bpU-cpU)**2) > 1.0) {
              g.pts['3'] = _makeBP(bpE, bpN, bpU);
              console.log(`[RayMode] Recovered TEE BP for ${refno} via DE/BO scan: E=${bpE.toFixed(1)} N=${bpN.toFixed(1)} U=${bpU.toFixed(1)}`);
              break;
            }
          }
        }
      }

      // ── Ray-mode OLET pts['3'] (BP) recovery ─────────────────────────────
      // OLET has only 2 rows [P0, P3] — PSI Phase 0.5 does not split OLETs.
      // This is a defensive fallback in case pts['3'] is missing for any reason.
      if (g.pcfType === 'OLET' && g.pts['0'] && !g.pts['3']) {
        const pipeGrp = allGroups.get(String(refno) + '_pipe');
        if (pipeGrp?.rows?.length > 0) {
          const bpRow = pipeGrp.rows[0];
          const bpE   = parseFloat(bpRow.East)  || 0;
          const bpN   = parseFloat(bpRow.North) || 0;
          const bpU   = parseFloat(bpRow.Up)    || 0;
          const cp    = g.pts['0'];
          const dist  = Math.sqrt((bpE-cp.E)**2 + (bpN-cp.N)**2 + (bpU-cp.U)**2);
          if (dist > 1.0) {
            g.pts['3'] = {
              E: bpE, N: bpN, U: bpU,
              bore:     cp.bore     ?? 0,
              radius:   cp.radius   ?? 0,
              wall:     cp.wall     ?? 0,
              corr:     cp.corr     ?? 0,
              weight:   cp.weight   ?? 0,
              insul:    cp.insul    ?? 0,
              pressure: cp.pressure,
              hydro:    cp.hydro,
              material: cp.material ?? '',
            };
            console.log(`[RayMode] Recovered OLET BP for ${refno} from _pipe companion: E=${bpE.toFixed(1)} N=${bpN.toFixed(1)} U=${bpU.toFixed(1)}`);
          }
        }
      }

      // ── Ray-mode BEND vector-sense CP inference ───────────────────────────
      // If pts['0'] is still missing after _pipe companion recovery, infer the
      // corner using EP1's Phase-1 __axisVec (Len_Vec direction).
      // This correctly resolves diagonal elbows where |dE| ≈ |dN|.
      if (g.pcfType === 'BEND' && g.pts['1'] && g.pts['2'] && !g.pts['0']) {
        const ep1 = g.pts['1'], ep2 = g.pts['2'];
        if (isSkew(ep1, ep2)) {
          const axisVec = ep1.raw?.__axisVec ?? null;
          const inferredCP = inferCorner(ep1, ep2, axisVec);
          g.pts['0'] = {
            ...inferredCP,
            bore:     ep1.bore     ?? 0,
            radius:   ep1.radius   ?? 0,
            wall:     ep1.wall     ?? 0,
            corr:     ep1.corr     ?? 0,
            weight:   ep1.weight   ?? 0,
            insul:    ep1.insul    ?? 0,
            pressure: ep1.pressure,
            hydro:    ep1.hydro,
            material: ep1.material ?? '',
          };
          console.log(`[RayMode] BEND CP inferred via vector-sense for ${refno}: E=${inferredCP.E.toFixed(1)} N=${inferredCP.N.toFixed(1)} U=${inferredCP.U.toFixed(1)}`);
        }
      }

      // ── Ray-mode OLET BP perpendicular projection ─────────────────────────
      // OLET has no EP1/EP2 run rows. The run direction is inferred from adjacent
      // rows in rowsCopy using DE/BO field ('NIL'=inline run, 'BO'=skip).
      // Project CP→P3 branch vector perpendicular to the run, then update pts['3'].
      if (g.pcfType === 'OLET' && g.pts['0'] && g.pts['3']) {
        const cp = g.pts['0'];
        const bp = g.pts['3'];
        const cpRow = g.rows.find(r => String(r.Point ?? '').trim() === '0');
        const bpRow = g.rows.find(r => String(r.Point ?? '').trim() === '3');
        const cpIdx = cpRow?._rowIndex ?? -1;
        const bpIdx = bpRow?._rowIndex >= 0 ? bpRow._rowIndex : cpIdx;
        if (cpIdx >= 0) {
          const bE = bp.E - cp.E, bN = bp.N - cp.N, bU = bp.U - cp.U;
          if (Math.sqrt(bE*bE + bN*bN + bU*bU) >= 1.0) {
            const _pickRunVec = (indices) => {
              for (const i of indices) {
                if (i < 0 || i >= rowsCopy.length) continue;
                const row = rowsCopy[i];
                const rt = String(row.Real_Type || row.Type || '').trim().toUpperCase();
                if (rt.includes('OLET') || rt.includes('TEE')) continue;
                if (String(row['DE/BO'] || '').trim() === 'BO') continue;
                if (row.__axisVec) return row.__axisVec;
              }
              return null;
            };
            const runVec = _pickRunVec([cpIdx-1, cpIdx-2, cpIdx-3]) ??
                           _pickRunVec([bpIdx+1, bpIdx+2, bpIdx+3]);
            if (runVec) {
              const runE = runVec.dE ?? 0, runN = runVec.dN ?? 0, runU = runVec.dU ?? 0;
              const runLen2 = runE*runE + runN*runN + runU*runU;
              if (runLen2 >= 1e-6) {
                const dot   = (bE*runE + bN*runN + bU*runU) / runLen2;
                const perpE = bE - dot*runE, perpN = bN - dot*runN, perpU = bU - dot*runU;
                const perpLen = Math.sqrt(perpE*perpE + perpN*perpN + perpU*perpU);
                if (perpLen >= 1.0) {
                  g.pts['3'] = { ...bp, E: cp.E + perpE, N: cp.N + perpN, U: cp.U + perpU };
                  console.log(`[RayMode] OLET BP perpendicular projected for ${refno}: E=${g.pts['3'].E.toFixed(1)} N=${g.pts['3'].N.toFixed(1)} U=${g.pts['3'].U.toFixed(1)} perpLen=${perpLen.toFixed(1)}mm`);
                }
              }
            }
          }
        }
      }
    }

    // ── Step 2: apply Stage 2-OUT filter at GROUP level ─────────────────────
    const _typeMap  = config.componentTypeMap ?? {};
    const _nonPcf   = new Set(['SKIP', 'UNKNOWN', 'MISC-COMPONENT']);
    const _cfgExcl  = new Set(
      Object.entries(_typeMap)
        .filter(([, pcf]) => _nonPcf.has(String(pcf).toUpperCase()))
        .map(([csv]) => csv.toUpperCase())
    );
    const _excl     = new Set(['PIPE', 'BRAN', ..._cfgExcl]);
    const _suppCsv  = new Set(['ANCI', 'RSTR', 'SUPPORT']);

    const rayGroups = new Map();
    for (const [refno, g] of allGroups) {
      const csvType = String(g.csvType || '').trim().toUpperCase();
      // Allow _bridged PIPE groups (support reach pipes renamed from _Sp1) through;
      // raw CSV PIPE rows are still excluded.
      const refStr = String(refno);
      const isBridgedPipe = csvType === 'PIPE' && (refStr.includes('_bridged') || refStr.includes('_Support') || g.rows?.some(r => r.__supportPipe));
      if (!isBridgedPipe && _excl.has(csvType)) continue;

      // Exclude _Sp split artefacts and _Injected fragments — the grouper creates
      // _Sp groups when component rows are non-sequential. _bridged groups are
      // intentional (support reach pipes) and must NOT be excluded here.
      if (refStr.includes('_Sp') || refStr.includes('_Injected')) continue;

      // Compute group length from pts (accurate) or max row Len_Calc (fallback)
      let len = 0;
      if (g.pts?.['1'] && g.pts?.['2']) {
        const p1 = g.pts['1'], p2 = g.pts['2'];
        len = Math.sqrt((p1.E - p2.E) ** 2 + (p1.N - p2.N) ** 2 + (p1.U - p2.U) ** 2);
      }
      if (len === 0) {
        len = Math.max(0, ...(g.rows || []).map(r => parseFloat(r.Len_Calc) || 0));
      }

      if (len === 0 && !_suppCsv.has(csvType)) continue;
      rayGroups.set(refno, g);
    }

    // ── Step 3: group-level transforms (ANCI→SUPPORT, single-axis BEND, TEE pts) ─
    const nonPipe = _nonPipeGroups(rayGroups);
    const ordered = [...nonPipe.keys()].sort(
      (a, b) => (nonPipe.get(a).firstRowIndex ?? 0) - (nonPipe.get(b).firstRowIndex ?? 0)
    );
    const lines = assemble({ ordered, orphans: [] }, nonPipe, config, pipelineRef);
    setState('rayPcfLines', lines);
    console.info(`${LOG_PREFIX} [RayMode] ${nonPipe.size} non-pipe groups (Phase1 snapshot, group-filtered) → ${lines.length} lines`);
  } catch (err) {
    console.warn(`${LOG_PREFIX} [RayMode] Generation failed (non-fatal): ${err.message}`);
    setState('rayPcfLines', []);
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
    // PIPELINE-REFERENCE = filename without extension (as per spec)
    const meta = getState('meta') || {};
    const pipelineRef = meta.filename
      ? String(meta.filename).replace(/\.[^.]+$/, '')
      : getPipelineRef(normalizedRows ?? []);

    // ── Primary Pass Conversion ──
    const seqResult = runSequencer(groups, config);
    setState("topology", seqResult.topology);
    setState("traversalOrder", seqResult.ordered);

    // Run Post-Processing Validation (Populates group.validation)
    console.info(`${LOG_PREFIX} Running connectivity validation on sequenced groups...`);
    validateConnectivity(groups, seqResult.ordered, config);
    setState("groups", groups); // Update state with validation data

    // DEBUG TAB: Stage 9 - Group Inspector (Validation/Connectivity)
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
    updateDebugTable(
      `Stage 9 — Group Inspector (Sequencer + Connectivity) — ${s4Rows.length} groups`,
      s4Rows,
      9,
      `JS call 9 of 12 — mapping-tab.js → runConvert() → updateDebugTable("Stage 9")\nSource: runSequencer() + validateConnectivity() output — topology graph built, traversal order assigned.\nEach row = one component group. Seq Prev/Next = sequential neighbors by traversal order with gap distance.\nSmart Prev/Next = spatial neighbors from topology-service (gap-based nearest-component lookup).\nSkipped/Zero-length = TRUE if group.skip=true or lenCalc=0 — these are excluded from PCF output.`
    );

    // DEBUG TAB: Stage 10 - Sequencer Output
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

    // Filter out zero-length PIPE/OLET — mark g.skip=true so ALL consumers (Mode 1 + Mode 2) skip them
    let zeroLenDropped = 0;
    const filteredOrdered = seqResult.ordered.filter(ref => {
      const g = groups.get(ref);
      if (!g) return false;
      const type = (g.pcfType || '').toUpperCase();
      if (type === 'PIPE' || type.includes('OLET')) {
        const len = calcGroupLen(g);
        if (len >= 0 && len < zeroTol) {
          zeroLenDropped++;
          g.skip = true;  // ← persist skip flag so TableRegenerator (Mode 2) also omits it
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

    updateDebugTable(
      `Stage 10 — Sequencer Output — ${s5Rows.length} components`,
      s5Rows,
      10,
      `JS call 10 of 12 — mapping-tab.js → runConvert() → updateDebugTable("Stage 10")\nSource: seqResult.ordered after zero-length PIPE/OLET filter applied (tolerance from UI input).\nEach row = one component in final traversal order. Orphans appended at end with Status=Orphan.\nVec Len = (dE, dN, dU) displacement from EP1→EP2. Zero-length PIPEs excluded before this stage.\nEP1/EP2/EP3/EP4 = final computed endpoints that will be written to PCF output.`
    );

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
    updateDebugTable(
      `Stage 11 — PCF Health (Input vs Output Summary)`,
      healthData,
      11,
      `JS call 11 of 12 — mapping-tab.js → runConvert() → updateDebugTable("Stage 11")\nSource: groups map + seqResult.ordered — summary metrics comparing input groups vs sequenced output.\nTotal Length = sum of 3D EP1→EP2 distances across all groups (input) vs all sequenced components (output).\nComponent counts (BEND/TEE/FLANGE/VALVE) = input group count vs count in final ordered sequence.\nDiscrepancy between Input and Output counts indicates skipped/zero-length/orphan components.`
    );

    // Sync zero-length tolerance into config
    if (!isNaN(zeroTol) && zeroTol > 0) {
      config.coordinateSettings = { ...(config.coordinateSettings || {}), zeroLengthTolerance: zeroTol };
    }

    // Phase 1 PCF — suppress CA, only coordinates/SKEY/angles
    console.log(`[DEBUG-Header] pipelineRef for Phase 1 = "${pipelineRef}"`);
    const cfg1 = { ...config, suppressCA: true };
    const pcfPass1 = assemble(seqResult, groups, cfg1, pipelineRef);
    setState("pcfPass1Lines", pcfPass1);
    console.info(`${LOG_PREFIX} Phase 1 done. ${pcfPass1.length} lines.`);

    // Phase 2 PCF — full CA attributes, TEE branch inference, complete component data
    console.log(`[DEBUG-Header] pipelineRef for Phase 2 = "${pipelineRef}"`);
    const cfg2 = { ...config }; // no suppressCA → full CA output
    const pcfPhase2 = assemble(seqResult, groups, cfg2, pipelineRef);
    setState("pcfLines", pcfPhase2);
    console.info(`${LOG_PREFIX} Phase 2 done. ${pcfPhase2.length} lines.`);

    // DEBUG TAB: Stage 12 - Phase 2 PCF Output (Preview)
    const s6Rows = pcfPhase2.slice(0, 1000).map((line, i) => ({
      'Line #': i + 1,
      'Content': line
    }));
    updateDebugTable(
      `Stage 12 — Phase 2 PCF Output (First 1000 lines)`,
      s6Rows,
      12,
      `JS call 12 of 12 — mapping-tab.js → runConvert() → updateDebugTable("Stage 12")\nSource: assemble() Phase 2 output — full PCF with CA attributes, TEE branch inference, complete component data.\nFirst 1000 lines shown. Complete output available in the OUTPUT tab.\nPhase 1 PCF (suppressCA=true, coordinates/SKEY/angles only) generated separately and stored in state.`
    );

    // ── Pass 1 Conversion (multi-pass) — also suppress CA ──
    if (groupsPass1 && groupsPass1.size > 0) {
      console.info(`${LOG_PREFIX} Generating Pass 1 PCF (multi-pass)...`);
      const seq1 = runSequencer(groupsPass1, config);
      seq1.ordered = seq1.ordered.filter(ref => {
        const g = groupsPass1.get(ref);
        if (!g) return false;
        const type = (g.pcfType || '').toUpperCase();
        const len = calcGroupLen(g);
        return !((type === 'PIPE' || type.includes('OLET')) && len >= 0 && len < zeroTol);
      });
      const pcf1 = assemble(seq1, groupsPass1, { ...config, suppressCA: true }, pipelineRef);
      setState("pcfPass1Lines", pcf1);
    }

    // ── Ray Mode PCF — non-pipe skeleton (runs alongside full PCF, no extra cost) ──
    _generateRayPCF(cfg2, pipelineRef);

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
