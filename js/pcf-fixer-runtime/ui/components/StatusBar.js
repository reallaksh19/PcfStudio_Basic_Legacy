import React from 'react';
import { useAppContext } from '/js/pcf-fixer-runtime/store/AppContext.js';
import { runSmartFix } from '/js/pcf-fixer-runtime/engine/Orchestrator.js';
import { applyFixes } from '/js/pcf-fixer-runtime/engine/FixApplicator.js';
import { createLogger } from '/js/pcf-fixer-runtime/utils/Logger.js';
import { runValidationChecklist } from '/js/pcf-fixer-runtime/engine/Validator.js';
import { runDataProcessor } from '/js/pcf-fixer-runtime/engine/DataProcessor.js';
import { PcfTopologyGraph2, applyApprovedMutations } from '/js/pcf-fixer-runtime/engine/PcfTopologyGraph2.js';
import { useStore } from '/js/pcf-fixer-runtime/store/useStore.js';
import { useTopologyWorker } from '/js/pcf-fixer-runtime/workers/useTopologyWorker.js';

// Whether to offload Group 2 topology work to a Web Worker.
// Disable if your browser/environment doesn't support module workers.
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "/js/pcf-fixer-runtime/jsx-runtime.js";
const USE_WORKER = typeof Worker !== 'undefined';
export function StatusBar({
  activeTab,
  activeStage
}) {
  const [showModal, setShowModal] = React.useState(false);
  const [runGroup, setRunGroup] = React.useState('group1');
  const [isStatusExpanded, setIsStatusExpanded] = React.useState(false);
  const {
    state,
    dispatch
  } = useAppContext();
  const setZustandData = useStore(state => state.setDataTable);
  const setZustandProposals = useStore(state => state.setProposals);

  // ---- Worker integration ----
  // We keep a ref to the pending pass (1 or 2) so the callback knows which pass completed.
  const pendingPassRef = React.useRef(1);
  const pendingTableRef = React.useRef(null);
  const {
    runTopology,
    isRunning: isWorkerRunning
  } = useTopologyWorker({
    onProgress: msg => dispatch({
      type: "SET_STATUS_MESSAGE",
      payload: msg
    }),
    onComplete: ({
      proposals,
      logs
    }) => {
      const currentPass = pendingPassRef.current;
      const baseTable = pendingTableRef.current || state.stage2Data;
      logs.forEach(entry => dispatch({
        type: "ADD_LOG",
        payload: entry
      }));
      const activeProposals = currentPass === 2 ? proposals.filter(p => !p.elementA?._passApplied && !p.elementB?._passApplied && p.pass === 'Pass 2') : proposals.filter(p => p.pass === 'Pass 1');
      setZustandProposals(activeProposals);
      const updatedTable = baseTable.map(r => ({
        ...r
      }));
      logs.forEach(entry => {
        if (entry.row && entry.tier && entry.row !== '-') {
          const row = updatedTable.find(r => r._rowIndex === entry.row);
          if (row && !row._passApplied && (!row.fixingActionTier || entry.tier < row.fixingActionTier)) {
            row.fixingAction = entry.message;
            row.fixingActionTier = entry.tier;
            row.fixingActionRuleId = entry.ruleId;
            if (entry.score !== undefined) row.fixingActionScore = entry.score;
          }
        }
      });
      activeProposals.forEach(prop => {
        const row = updatedTable.find(r => r._rowIndex === prop.elementA?._rowIndex);
        if (row && !row._passApplied) {
          row.fixingAction = prop.description;
          row.fixingActionTier = (prop.dist ?? 999) < 25 ? 2 : 3;
          if (prop.score !== undefined) row.fixingActionScore = prop.score;
        }
      });
      dispatch({
        type: "SET_STAGE_2_DATA",
        payload: updatedTable
      });
      setZustandData(updatedTable);
      dispatch({
        type: "SMART_FIX_COMPLETE",
        payload: {
          pass: currentPass,
          summary: {}
        }
      });
      dispatch({
        type: "SET_STATUS_MESSAGE",
        payload: `[Worker] Pass ${currentPass} Complete: ${activeProposals.length} proposals generated.`
      });
    },
    onError: msg => {
      dispatch({
        type: "SET_STATUS_MESSAGE",
        payload: `[Worker] Topology error: ${msg}. Retrying on main thread…`
      });
      // Fallback: run synchronously on the main thread
      const logger = createLogger();
      const cfg = {
        ...state.config,
        currentPass: pendingPassRef.current
      };
      const {
        proposals
      } = PcfTopologyGraph2(pendingTableRef.current || state.stage2Data, cfg, logger);
      logger.getLog().forEach(e => dispatch({
        type: "ADD_LOG",
        payload: e
      }));
      setZustandProposals(proposals);
      dispatch({
        type: "SMART_FIX_COMPLETE",
        payload: {
          pass: pendingPassRef.current,
          summary: {}
        }
      });
    }
  });
  React.useEffect(() => {
    const handleSync = e => {
      const {
        rowIndex,
        status
      } = e.detail;
      // Just sync the approval flag — no geometry mutation here
      const updatedTable = state.stage2Data.map(r => r._rowIndex === rowIndex ? {
        ...r,
        _fixApproved: status
      } : r);
      dispatch({
        type: "SET_STAGE_2_DATA",
        payload: updatedTable
      });
    };
    window.addEventListener('zustand-fix-status-changed', handleSync);
    return () => window.removeEventListener('zustand-fix-status-changed', handleSync);
  }, [state.stage2Data, dispatch]);
  const handleSmartFix = () => {
    dispatch({
      type: "SET_SMART_FIX_STATUS",
      status: "running"
    });
    const logger = createLogger();
    if (runGroup === 'group2') {
      // Use Web Worker if supported; fall back to sync if not
      if (USE_WORKER) {
        pendingPassRef.current = 1;
        pendingTableRef.current = state.stage2Data;
        dispatch({
          type: "SET_STATUS_MESSAGE",
          payload: "Topology engine dispatched to Web Worker (Pass 1)…"
        });
        runTopology(state.stage2Data, state.config, 1);
        return;
      }

      // Enforce running Pass 1 explicitly by sending currentPass: 1
      const {
        proposals
      } = PcfTopologyGraph2(state.stage2Data, {
        ...state.config,
        currentPass: 1
      }, logger);

      // Clear previous proposals for Pass 1 from Zustland before setting new
      // and also filter them down just in case
      const pass1Proposals = proposals.filter(p => p.pass === "Pass 1");
      setZustandProposals(pass1Proposals);
      let errorFixes = 0;
      let warnFixes = 0;

      // We map so we clear out any previous pass results and start fresh
      const updatedTable = state.stage2Data.map(r => {
        const row = {
          ...r
        };
        if (!row._passApplied) {
          delete row.fixingAction;
          delete row.fixingActionTier;
          delete row.fixingActionScore;
          delete row.fixingActionRuleId;
          delete row._fixApproved;
        }
        return row;
      });
      logger.getLog().forEach(entry => {
        dispatch({
          type: "ADD_LOG",
          payload: entry
        });
        if (entry.tier && entry.tier <= 2) errorFixes++;
        if (entry.tier && entry.tier === 3) warnFixes++;
        if (entry.row && entry.tier && entry.row !== "-") {
          const row = updatedTable.find(r => r._rowIndex === entry.row);
          if (row && !row._passApplied && (!row.fixingActionTier || entry.tier < row.fixingActionTier)) {
            row.fixingAction = entry.message;
            row.fixingActionTier = entry.tier;
            row.fixingActionRuleId = entry.ruleId;
            if (entry.score !== undefined) row.fixingActionScore = entry.score;
          }
        }
      });
      pass1Proposals.forEach(prop => {
        const row = updatedTable.find(r => r._rowIndex === prop.elementA._rowIndex);
        if (row && !row._passApplied) {
          row.fixingAction = prop.description;
          row.fixingActionTier = prop.dist < 25 ? 2 : 3;
          if (prop.score !== undefined) row.fixingActionScore = prop.score;
        }
      });
      dispatch({
        type: "SET_STAGE_2_DATA",
        payload: updatedTable
      });
      setZustandData(updatedTable);
      dispatch({
        type: "SMART_FIX_COMPLETE",
        payload: {
          pass: 1,
          summary: {}
        }
      });
      dispatch({
        type: "SET_STATUS_MESSAGE",
        payload: `Analysis Complete (Group 2): Generated ${pass1Proposals.length} proposals.`
      });
    } else {
      const result = runSmartFix(state.stage2Data, state.config, logger);
      let errorFixes = 0;
      let warnFixes = 0;
      logger.getLog().forEach(entry => {
        dispatch({
          type: "ADD_LOG",
          payload: entry
        });
        if (entry.tier && entry.tier <= 2) errorFixes++;
        if (entry.tier && entry.tier === 3) warnFixes++;
      });
      dispatch({
        type: "SMART_FIX_COMPLETE",
        payload: result
      });
      dispatch({
        type: "SET_STATUS_MESSAGE",
        payload: `Analysis Complete: ${errorFixes} Auto-Fixes (T1/2), ${warnFixes} Warnings (T3)`
      });
    }
  };
  const handleApplyFixes = () => {
    dispatch({
      type: "SET_SMART_FIX_STATUS",
      status: "applying"
    });
    const logger = createLogger();

    // For Group 2 / proposals (from PcfTopologyGraph2), applying fixes means mutating the geometries that were approved.
    let tableToProcess = state.stage2Data;
    if (useStore.getState().proposals.length > 0) {
      tableToProcess = applyApprovedMutations(tableToProcess, useStore.getState().proposals, logger);
    }

    // `chains` may be undefined if we didn't run runSmartFix (Group 1), but applyFixes expects an iterable.
    const chainsToProcess = state.smartFix.chains || [];
    const result = applyFixes(tableToProcess, chainsToProcess, state.config, logger);
    logger.getLog().forEach(entry => dispatch({
      type: "ADD_LOG",
      payload: entry
    }));
    setZustandData(result.updatedTable);
    dispatch({
      type: "FIXES_APPLIED",
      payload: result
    });
  };
  const isDataLoaded = state.stage2Data && state.stage2Data.length > 0;
  const isValidationDone = state.smartFix.validationDone === true;
  const isRunning = state.smartFix.status === "running";
  const isApplying = state.smartFix.status === "applying";

  const hasRunSmartFix = (state.smartFix.smartFixPass || 0) > 0;

  // Second Pass ready once Phase 1 Validator is done, no need to wait for Smart Fix 1 or Apply Fixes.
  const isSecondPassReady = isValidationDone && !isRunning && !isApplying && !isWorkerRunning;
  // Run First Pass is always available as long as data is loaded and not currently running
  const canRunSmartFix = isDataLoaded && !isRunning && !isWorkerRunning;

  // Apply Fixes enabled if any row approved and not currently applying
  const hasApprovedFixes = state.stage2Data && state.stage2Data.some(r => r._fixApproved === true);
  const canApplyFixes = hasApprovedFixes && !isApplying;
  const handleSecondPass = () => {
    dispatch({
      type: "SET_SMART_FIX_STATUS",
      status: "running"
    });
    const logger = createLogger();
    // Clear out prior fixingAction warnings/proposals from Pass 1 to give a clean slate for Pass 2
    // User requested: "when 'Run second pass' is clicked do not reset _Issuelisted but reset _fixApproved"
    // So we clear _fixApproved globally, and clear fixingAction so Pass 1 items don't clutter the UI during Pass 2 evaluation.
    const pass2Table = state.stage2Data.map(r => {
      const cleanRow = {
        ...r,
        _currentPass: 2
      };

      // Remove old Pass 1 proposals that were not applied
      if (!cleanRow._passApplied) {
        delete cleanRow.fixingAction;
        delete cleanRow.fixingActionTier;
        delete cleanRow.fixingActionScore;
        delete cleanRow.fixingActionRuleId;
        delete cleanRow._fixApproved;
      }
      return cleanRow;
    });

    // We only pass the current Pass 2 config so the engine explicitly runs Pass 2
    if (runGroup === 'group2') {
      if (USE_WORKER) {
        pendingPassRef.current = 2;
        pendingTableRef.current = pass2Table;
        dispatch({
          type: "SET_STAGE_2_DATA",
          payload: pass2Table
        });
        setZustandData(pass2Table);
        dispatch({
          type: "SET_STATUS_MESSAGE",
          payload: "Topology engine dispatched to Web Worker (Pass 2)…"
        });
        runTopology(pass2Table, state.config, 2);
        return;
      }
      const {
        proposals
      } = PcfTopologyGraph2(pass2Table, {
        ...state.config,
        currentPass: 2
      }, logger);

      // Filter proposals down to only the un-applied ones and enforce Pass 2 specific
      const activeProposals = proposals.filter(p => !p.elementA._passApplied && !p.elementB._passApplied && p.pass === "Pass 2");
      setZustandProposals(activeProposals);
      let hasPass2Proposals = false;

      // Attach new proposals to rows so they render correctly in the DataTable
      activeProposals.forEach(prop => {
        if (prop.pass === 'Pass 2') {
          hasPass2Proposals = true;
        }
        const row = pass2Table.find(r => r._rowIndex === prop.elementA._rowIndex);
        if (row && !row._passApplied) {
          row.fixingAction = prop.description;
          row.fixingActionTier = prop.dist < 25 ? 2 : 3;
          if (prop.score !== undefined) row.fixingActionScore = prop.score;
        }
      });
      logger.getLog().forEach(entry => {
        dispatch({
          type: "ADD_LOG",
          payload: entry
        });
        if (entry.row && entry.tier && entry.row !== "-") {
          const row = pass2Table.find(r => r._rowIndex === entry.row);
          // Only overwrite if it's not a previously applied pass
          if (row && !row._passApplied && (!row.fixingActionTier || entry.tier < row.fixingActionTier)) {
            row.fixingAction = entry.message;
            row.fixingActionTier = entry.tier;
            row.fixingActionRuleId = entry.ruleId;
            if (entry.score !== undefined) row.fixingActionScore = entry.score;
          }
        }
      });
      if (!hasPass2Proposals) {
        dispatch({
          type: "ADD_LOG",
          payload: {
            stage: "FIXING",
            type: "Info",
            message: "Pass 2 did not yield any new proposals for existing gaps.",
            row: "-"
          }
        });
        dispatch({
          type: "SET_STATUS_MESSAGE",
          payload: "Pass 2 Analysis Complete: No new issues found."
        });
      } else {
        dispatch({
          type: "SET_STATUS_MESSAGE",
          payload: `Pass 2 Analysis Complete: Generated ${activeProposals.filter(p => p.pass === 'Pass 2').length} proposals.`
        });
      }
      dispatch({
        type: "SET_STAGE_2_DATA",
        payload: pass2Table
      });
      setZustandData(pass2Table);
      dispatch({
        type: "SMART_FIX_COMPLETE",
        payload: {
          pass: 2,
          summary: {}
        }
      });
    } else {
      const result = runSmartFix(pass2Table, {
        ...state.config,
        currentPass: 2
      }, logger);
      logger.getLog().forEach(entry => dispatch({
        type: "ADD_LOG",
        payload: entry
      }));
      dispatch({
        type: "SET_STAGE_2_DATA",
        payload: pass2Table
      });
      setZustandData(pass2Table);
      dispatch({
        type: "SMART_FIX_COMPLETE",
        payload: {
          ...result,
          pass: 2
        }
      });
      dispatch({
        type: "SET_STATUS_MESSAGE",
        payload: "Second Pass analysis complete — review proposals and Apply Fixes."
      });
    }
  };

  // ------------------------------------------------------------------
  // One-Click Auto-Fix: runs the full pipeline automatically,
  // stops before Tier 3 (review-required) proposals.
  // ------------------------------------------------------------------
  const [autoFixRunning, setAutoFixRunning] = React.useState(false);
  const handleOneClickAutoFix = async () => {
    if (!state.stage2Data || state.stage2Data.length === 0) {
      dispatch({
        type: "SET_STATUS_MESSAGE",
        payload: "Auto-Fix: No Stage 2 data. Pull data from Stage 1 first."
      });
      return;
    }
    setAutoFixRunning(true);
    dispatch({
      type: "CLEAR_LOG"
    });
    dispatch({
      type: "SET_STATUS_MESSAGE",
      payload: "Auto-Fix Pipeline: Step 1/4 — Running Data Processor…"
    });

    // Yield to React before heavy work
    await new Promise(r => setTimeout(r, 0));
    const logger = createLogger();

    // Step 1: Data Processor
    let processedTable = runDataProcessor(state.stage2Data, state.config, logger);
    await new Promise(r => setTimeout(r, 0));
    dispatch({
      type: "SET_STATUS_MESSAGE",
      payload: "Auto-Fix Pipeline: Step 2/4 — Running Validation…"
    });

    // Step 2: Validation
    runValidationChecklist(processedTable, state.config, logger, "2");
    logger.getLog().forEach(entry => dispatch({
      type: "ADD_LOG",
      payload: entry
    }));
    logger.getLog().forEach(entry => {
      if (entry.row && entry.tier) {
        const row = processedTable.find(r => r._rowIndex === entry.row);
        if (row && !row.fixingAction) {
          row.fixingAction = entry.message;
          row.fixingActionTier = entry.tier;
          row.fixingActionRuleId = entry.ruleId;
        }
      }
    });
    dispatch({
      type: "SET_STAGE_2_DATA",
      payload: processedTable
    });
    setZustandData(processedTable);
    dispatch({
      type: "SET_VALIDATION_DONE"
    });
    await new Promise(r => setTimeout(r, 0));
    dispatch({
      type: "SET_STATUS_MESSAGE",
      payload: "Auto-Fix Pipeline: Step 3/4 — Running Smart Fix (Group 2)…"
    });

    // Step 3: Smart Fix (Group 2 topology engine)
    const logger2 = createLogger();
    const {
      proposals
    } = PcfTopologyGraph2(processedTable, state.config, logger2);
    setZustandProposals(proposals);
    const tableWithProposals = processedTable.map(r => ({
      ...r
    }));
    logger2.getLog().forEach(entry => {
      dispatch({
        type: "ADD_LOG",
        payload: entry
      });
      if (entry.row && entry.tier && entry.row !== "-") {
        const row = tableWithProposals.find(r => r._rowIndex === entry.row);
        if (row && !row._passApplied && (!row.fixingActionTier || entry.tier < row.fixingActionTier)) {
          row.fixingAction = entry.message;
          row.fixingActionTier = entry.tier;
          row.fixingActionRuleId = entry.ruleId;
          if (entry.score !== undefined) row.fixingActionScore = entry.score;
        }
      }
    });
    proposals.forEach(prop => {
      const row = tableWithProposals.find(r => r._rowIndex === prop.elementA._rowIndex);
      if (row && !row._passApplied) {
        row.fixingAction = prop.description;
        row.fixingActionTier = prop.dist < 25 ? 2 : 3;
        if (prop.score !== undefined) row.fixingActionScore = prop.score;
      }
    });

    // Auto-approve Tier 1 & 2 — Tier 3 requires manual review
    const tier3Count = tableWithProposals.filter(r => r.fixingActionTier === 3 && !r._passApplied).length;
    tableWithProposals.forEach(r => {
      if (!r._passApplied && r.fixingActionTier && r.fixingActionTier <= 2) {
        r._fixApproved = true;
        useStore.getState().setProposalStatus(r._rowIndex, true);
      }
    });
    dispatch({
      type: "SET_STAGE_2_DATA",
      payload: tableWithProposals
    });
    setZustandData(tableWithProposals);
    dispatch({
      type: "SMART_FIX_COMPLETE",
      payload: {
        pass: 1,
        summary: {}
      }
    });
    await new Promise(r => setTimeout(r, 0));

    // Step 4: Apply approved (Tier 1 & 2) fixes immediately
    const hasApproved = tableWithProposals.some(r => r._fixApproved === true);
    if (hasApproved) {
      dispatch({
        type: "SET_STATUS_MESSAGE",
        payload: "Auto-Fix Pipeline: Step 4/4 — Applying Tier 1 & 2 fixes…"
      });
      const logger3 = createLogger();
      let tableToApply = tableWithProposals;
      if (proposals.length > 0) {
        tableToApply = applyApprovedMutations(tableToApply, proposals, logger3);
      }
      const result = applyFixes(tableToApply, state.smartFix.chains || [], state.config, logger3);
      logger3.getLog().forEach(e => dispatch({
        type: "ADD_LOG",
        payload: e
      }));
      setZustandData(result.updatedTable);
      dispatch({
        type: "FIXES_APPLIED",
        payload: result
      });
    }
    setAutoFixRunning(false);
    const msg = tier3Count > 0 ? `Auto-Fix Complete: Tier 1/2 fixes applied. ${tier3Count} Tier 3 items require manual review in Stage 2.` : "Auto-Fix Complete: All fixes applied automatically. Review Stage 2 and export from Stage 3.";
    dispatch({
      type: "SET_STATUS_MESSAGE",
      payload: msg
    });
  };
  const verString = "Ver 04-04-2026 (5)";
  const handleExecute = () => {
    setShowModal(false);
    const logger = createLogger();
    // Only process geometry parsing and V15 validation (Stage 2) here
    // DataProcessor: only fill derived fields (bore, CP, deltas, lengths) — no pipe trimming/filling
    let processedTable = runDataProcessor(state.stage2Data, state.config, logger);
    // Validation: populates fixingAction with ERROR/WARNING messages — read-only, no coord changes
    runValidationChecklist(processedTable, state.config, logger, "2");
    let finalProposals = [];
    if (runGroup === 'group2') {
      // Generate Zustand proposals only — do NOT apply mutations yet
      const {
        proposals
      } = PcfTopologyGraph2(processedTable, state.config, logger);
      finalProposals = proposals;
      setZustandProposals(proposals);
      // proposals will be applied ONLY when user clicks "Apply Fixes"
    }
    logger.getLog().forEach(entry => dispatch({
      type: "ADD_LOG",
      payload: entry
    }));

    // Attach validation messages to table rows (fixingAction)
    logger.getLog().forEach(entry => {
      if (entry.row && entry.tier) {
        const row = processedTable.find(r => r._rowIndex === entry.row);
        if (row && !row.fixingAction) {
          row.fixingAction = entry.message;
          row.fixingActionTier = entry.tier;
          row.fixingActionRuleId = entry.ruleId;
          if (entry.score !== undefined) row.fixingActionScore = entry.score;
        }
      }
    });

    // Override fixingAction with proposals from group2 so they show up
    if (runGroup === 'group2') {
      finalProposals.forEach(prop => {
        const row = processedTable.find(r => r._rowIndex === prop.elementA._rowIndex);
        if (row) {
          row.fixingAction = prop.description;
          row.fixingActionTier = prop.dist < 25 ? 2 : 3;
          if (prop.score !== undefined) row.fixingActionScore = prop.score;
        }
      });
    }
    dispatch({
      type: "SET_STAGE_2_DATA",
      payload: processedTable
    });
    setZustandData(processedTable);
    // Gate: unlock Smart Fix button
    dispatch({
      type: "SET_VALIDATION_DONE"
    });
    const errorCount = logger.getLog().filter(e => e.tier <= 2).length;
    const warnCount = logger.getLog().filter(e => e.tier === 3).length;
    dispatch({
      type: "SET_STATUS_MESSAGE",
      payload: `Validation complete: ${errorCount} Errors, ${warnCount} Warnings. Run Smart Fix to generate proposals.`
    });
  };
  return _jsxs(_Fragment, {
    children: [showModal && _jsx("div", {
      className: "fixed inset-0 bg-black/50 flex items-center justify-center z-[100]",
      children: _jsxs("div", {
        className: "bg-white p-6 rounded-lg shadow-xl w-[500px] text-slate-800",
        children: [_jsx("h2", {
          className: "text-xl font-bold mb-4",
          children: "Select Validation Engine"
        }), _jsxs("div", {
          className: "space-y-4 mb-6",
          children: [_jsxs("label", {
            className: "flex items-start space-x-3 p-3 border rounded hover:bg-slate-50 cursor-pointer",
            children: [_jsx("input", {
              type: "radio",
              name: "engineGroup",
              value: "group1",
              checked: runGroup === 'group1',
              onChange: () => setRunGroup('group1'),
              className: "mt-1"
            }), _jsxs("div", {
              children: [_jsx("div", {
                className: "font-semibold",
                children: "Group (1): Original Smart Fixer"
              }), _jsx("div", {
                className: "text-sm text-slate-500",
                children: "Standard First Pass and Second Pass logic tracking components and applying rules."
              })]
            })]
          }), _jsxs("label", {
            className: "flex items-start space-x-3 p-3 border rounded hover:bg-slate-50 cursor-pointer",
            children: [_jsx("input", {
              type: "radio",
              name: "engineGroup",
              value: "group2",
              checked: runGroup === 'group2',
              onChange: () => setRunGroup('group2'),
              className: "mt-1"
            }), _jsxs("div", {
              children: [_jsx("div", {
                className: "font-semibold",
                children: "Group (2): PcfTopologyGraph_2"
              }), _jsx("div", {
                className: "text-sm text-slate-500",
                children: "3-Pass System: Sequential Tracing, Global Sweep (Major Axis), Global Fuzzy Search. Includes Immutable Translations and Pipe Injection."
              })]
            })]
          })]
        }), _jsxs("div", {
          className: "flex justify-end space-x-3",
          children: [_jsx("button", {
            onClick: () => setShowModal(false),
            className: "px-4 py-2 border rounded hover:bg-slate-100 text-slate-700",
            children: "Cancel"
          }), _jsx("button", {
            onClick: handleExecute,
            className: "px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium",
            children: "Run Engine"
          })]
        })]
      })
    }), _jsxs("div", {
      className: "fixed bottom-0 left-0 right-0 h-12 bg-slate-800 text-white flex items-center justify-between px-4 text-sm z-50 shadow-lg",
      children: [_jsxs("div", {
        className: "flex items-center space-x-2 relative h-full",
        children: [_jsxs("div", {
          className: `absolute bottom-0 left-0 bg-slate-700 border-t border-r border-slate-600 rounded-tr-lg shadow-xl transition-all duration-300 ease-in-out flex flex-col ${isStatusExpanded ? 'h-48 w-[500px] p-4' : 'min-h-[3rem] w-[360px] px-3 py-2 flex-row items-start cursor-pointer hover:bg-slate-600'}`,
          onClick: () => !isStatusExpanded && setIsStatusExpanded(true),
          children: [_jsxs("div", {
            className: "flex justify-between items-center w-full mb-2",
            children: [_jsx("span", {
              className: `font-mono text-slate-300 ${isStatusExpanded ? 'text-sm' : 'text-xs break-words whitespace-pre-wrap'}`,
              children: state.statusMessage || "Ready"
            }), isStatusExpanded && _jsx("button", {
              onClick: e => {
                e.stopPropagation();
                setIsStatusExpanded(false);
              },
              className: "text-slate-400 hover:text-white",
              children: "\u2715"
            })]
          }), isStatusExpanded && _jsx("div", {
            className: "flex-1 overflow-y-auto mt-2 text-xs text-slate-400 space-y-1",
            children: _jsx("div", {
              className: "bg-slate-800/50 p-2 rounded whitespace-pre-wrap font-mono",
              children: state.statusMessage || "System is idle."
            })
          })]
        }), _jsxs("div", {
          className: "ml-[375px] flex items-center space-x-2",
          children: [(!state.dataTable || state.dataTable.length === 0) && _jsx("button", {
            onClick: () => {
              const mockData = [{
                _rowIndex: 1,
                type: "PIPE",
                ep1: {
                  x: 0,
                  y: 0,
                  z: 0
                },
                ep2: {
                  x: 1000,
                  y: 0,
                  z: 0
                },
                bore: 100
              }, {
                _rowIndex: 2,
                type: "PIPE",
                ep1: {
                  x: 1005,
                  y: 0,
                  z: 0
                },
                ep2: {
                  x: 2000,
                  y: 0,
                  z: 0
                },
                bore: 100
              }, {
                _rowIndex: 3,
                type: "TEE",
                ep1: {
                  x: 2000,
                  y: 0,
                  z: 0
                },
                ep2: {
                  x: 2300,
                  y: 0,
                  z: 0
                },
                cp: {
                  x: 2150,
                  y: 0,
                  z: 0
                },
                bp: {
                  x: 2150,
                  y: 150,
                  z: 0
                },
                bore: 100,
                branchBore: 50
              }, {
                _rowIndex: 4,
                type: "PIPE",
                ep1: {
                  x: 2300,
                  y: 0,
                  z: 0
                },
                ep2: {
                  x: 3000,
                  y: 0,
                  z: 0
                },
                bore: 100
              }, {
                _rowIndex: 5,
                type: "PIPE",
                ep1: {
                  x: 2980,
                  y: 0,
                  z: 0
                },
                ep2: {
                  x: 4000,
                  y: 0,
                  z: 0
                },
                bore: 100
              }, {
                _rowIndex: 6,
                type: "PIPE",
                ep1: {
                  x: 2150,
                  y: 150,
                  z: 0
                },
                ep2: {
                  x: 2150,
                  y: 154,
                  z: 0
                },
                bore: 50
              }, {
                _rowIndex: 7,
                type: "VALVE",
                ep1: {
                  x: 2150,
                  y: 154,
                  z: 0
                },
                ep2: {
                  x: 2150,
                  y: 354,
                  z: 0
                },
                bore: 50,
                skey: "VBFL"
              }];
              dispatch({
                type: "SET_DATA_TABLE",
                payload: mockData
              });
              useStore.getState().setDataTable(mockData);
            },
            title: "Load Mock Test Data",
            className: "w-8 h-8 flex items-center justify-center bg-indigo-900/50 hover:bg-indigo-800 text-indigo-300 rounded transition border border-indigo-700/50 text-base",
            children: "\uD83E\uDDEA"
          }), activeTab === 'data' && activeStage === '2' && _jsx("button", {
            onClick: () => setShowModal(true),
            disabled: !isDataLoaded,
            className: "px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50 h-8 flex items-center",
            children: "Run Phase 1 Validator (Only Pipe filling/Trimming) \u25B6"
          })]
        })]
      }), _jsxs("div", {
        className: "flex items-center space-x-2",
        children: [isDataLoaded && _jsx("button", {
          onClick: handleOneClickAutoFix,
          disabled: autoFixRunning || isRunning || isApplying,
          className: "px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded font-bold shadow-sm disabled:opacity-50 transition-all text-sm flex items-center gap-1.5 border border-violet-700/40",
          title: "Automatically run all stages: DataProcessor \u2192 Validation \u2192 Smart Fix \u2192 Apply Tier 1/2. Tier 3 items will need manual review.",
          children: autoFixRunning ? _jsxs(_Fragment, {
            children: [_jsx("span", {
              className: "animate-spin inline-block",
              children: "\u2699"
            }), " Running\u2026"]
          }) : _jsxs(_Fragment, {
            children: [_jsx("span", {
              children: "\u26A1"
            }), " One-Click Auto-Fix"]
          })
        }), activeTab === 'data' && activeStage === '2' && _jsxs(_Fragment, {
          children: [_jsx("button", {
            onClick: () => {
              dispatch({
                type: "UNDO_FIXES"
              });
              if (state.history.length > 0) {
                const prevTable = state.history[state.history.length - 1];
                setZustandData(prevTable);
              }
            },
            disabled: state.history.length === 0,
            className: "px-4 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded font-medium disabled:opacity-50 transition-colors text-white h-full",
            title: "Undo last applied fixes",
            children: "\u21B6 Undo"
          }), _jsx("button", {
            onClick: () => setShowModal(true),
            disabled: !canRunSmartFix,
            className: "px-4 py-1.5 bg-blue-700 hover:bg-blue-600 rounded font-medium disabled:opacity-50 transition-colors h-full border border-blue-500/40",
            title: "Open engine selector to run First Pass",
            children: "\u25B6 Run First Pass"
          }), _jsx("button", {
            onClick: handleSmartFix,
            disabled: !canRunSmartFix,
            className: "px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded font-medium disabled:opacity-50 transition-colors h-full",
            title: "Analyse data and generate fix proposals",
            children: isRunning ? "Analyzing..." : "Smart Fix 🔧"
          }), _jsx("button", {
            onClick: handleApplyFixes,
            disabled: !canApplyFixes,
            className: "px-4 py-1.5 bg-green-600 hover:bg-green-500 rounded font-medium disabled:opacity-50 transition-colors h-full",
            title: !hasApprovedFixes ? "Approve at least one proposal first" : "Apply all approved fixes to geometry",
            children: isApplying ? "Applying..." : "Apply Fixes ✓"
          }), _jsx("button", {
            onClick: handleSecondPass,
            disabled: !isSecondPassReady,
            className: "px-4 py-1.5 bg-purple-600 hover:bg-purple-500 rounded font-medium disabled:opacity-50 transition-colors h-full",
            title: !isSecondPassReady ? "Run Phase 1 Validator first" : "Run Second Pass for non-Pipe components",
            children: "\uD83D\uDE80 Run Second Pass"
          })]
        }), _jsx("span", {
          className: "text-slate-400 font-mono text-xs",
          children: verString
        })]
      })]
    })]
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsInVzZUFwcENvbnRleHQiLCJydW5TbWFydEZpeCIsImFwcGx5Rml4ZXMiLCJjcmVhdGVMb2dnZXIiLCJydW5WYWxpZGF0aW9uQ2hlY2tsaXN0IiwicnVuRGF0YVByb2Nlc3NvciIsIlBjZlRvcG9sb2d5R3JhcGgyIiwiYXBwbHlBcHByb3ZlZE11dGF0aW9ucyIsInVzZVN0b3JlIiwidXNlVG9wb2xvZ3lXb3JrZXIiLCJqc3giLCJfanN4IiwianN4cyIsIl9qc3hzIiwiRnJhZ21lbnQiLCJfRnJhZ21lbnQiLCJVU0VfV09SS0VSIiwiV29ya2VyIiwiU3RhdHVzQmFyIiwiYWN0aXZlVGFiIiwiYWN0aXZlU3RhZ2UiLCJzaG93TW9kYWwiLCJzZXRTaG93TW9kYWwiLCJ1c2VTdGF0ZSIsInJ1bkdyb3VwIiwic2V0UnVuR3JvdXAiLCJpc1N0YXR1c0V4cGFuZGVkIiwic2V0SXNTdGF0dXNFeHBhbmRlZCIsInN0YXRlIiwiZGlzcGF0Y2giLCJzZXRadXN0YW5kRGF0YSIsInNldERhdGFUYWJsZSIsInNldFp1c3RhbmRQcm9wb3NhbHMiLCJzZXRQcm9wb3NhbHMiLCJwZW5kaW5nUGFzc1JlZiIsInVzZVJlZiIsInBlbmRpbmdUYWJsZVJlZiIsInJ1blRvcG9sb2d5IiwiaXNSdW5uaW5nIiwiaXNXb3JrZXJSdW5uaW5nIiwib25Qcm9ncmVzcyIsIm1zZyIsInR5cGUiLCJwYXlsb2FkIiwib25Db21wbGV0ZSIsInByb3Bvc2FscyIsImxvZ3MiLCJjdXJyZW50UGFzcyIsImN1cnJlbnQiLCJiYXNlVGFibGUiLCJzdGFnZTJEYXRhIiwiZm9yRWFjaCIsImVudHJ5IiwiYWN0aXZlUHJvcG9zYWxzIiwiZmlsdGVyIiwicCIsImVsZW1lbnRBIiwiX3Bhc3NBcHBsaWVkIiwiZWxlbWVudEIiLCJwYXNzIiwidXBkYXRlZFRhYmxlIiwibWFwIiwiciIsInJvdyIsInRpZXIiLCJmaW5kIiwiX3Jvd0luZGV4IiwiZml4aW5nQWN0aW9uVGllciIsImZpeGluZ0FjdGlvbiIsIm1lc3NhZ2UiLCJmaXhpbmdBY3Rpb25SdWxlSWQiLCJydWxlSWQiLCJzY29yZSIsInVuZGVmaW5lZCIsImZpeGluZ0FjdGlvblNjb3JlIiwicHJvcCIsImRlc2NyaXB0aW9uIiwiZGlzdCIsInN1bW1hcnkiLCJsZW5ndGgiLCJvbkVycm9yIiwibG9nZ2VyIiwiY2ZnIiwiY29uZmlnIiwiZ2V0TG9nIiwiZSIsInVzZUVmZmVjdCIsImhhbmRsZVN5bmMiLCJyb3dJbmRleCIsInN0YXR1cyIsImRldGFpbCIsIl9maXhBcHByb3ZlZCIsIndpbmRvdyIsImFkZEV2ZW50TGlzdGVuZXIiLCJyZW1vdmVFdmVudExpc3RlbmVyIiwiaGFuZGxlU21hcnRGaXgiLCJwYXNzMVByb3Bvc2FscyIsImVycm9yRml4ZXMiLCJ3YXJuRml4ZXMiLCJyZXN1bHQiLCJoYW5kbGVBcHBseUZpeGVzIiwidGFibGVUb1Byb2Nlc3MiLCJnZXRTdGF0ZSIsImNoYWluc1RvUHJvY2VzcyIsInNtYXJ0Rml4IiwiY2hhaW5zIiwiaXNEYXRhTG9hZGVkIiwiaXNWYWxpZGF0aW9uRG9uZSIsInZhbGlkYXRpb25Eb25lIiwiaXNBcHBseWluZyIsImhhc1J1blNtYXJ0Rml4Iiwic21hcnRGaXhQYXNzIiwiaXNTZWNvbmRQYXNzUmVhZHkiLCJjYW5SdW5TbWFydEZpeCIsImhhc0FwcHJvdmVkRml4ZXMiLCJzb21lIiwiY2FuQXBwbHlGaXhlcyIsImhhbmRsZVNlY29uZFBhc3MiLCJwYXNzMlRhYmxlIiwiY2xlYW5Sb3ciLCJfY3VycmVudFBhc3MiLCJoYXNQYXNzMlByb3Bvc2FscyIsInN0YWdlIiwiYXV0b0ZpeFJ1bm5pbmciLCJzZXRBdXRvRml4UnVubmluZyIsImhhbmRsZU9uZUNsaWNrQXV0b0ZpeCIsIlByb21pc2UiLCJzZXRUaW1lb3V0IiwicHJvY2Vzc2VkVGFibGUiLCJsb2dnZXIyIiwidGFibGVXaXRoUHJvcG9zYWxzIiwidGllcjNDb3VudCIsInNldFByb3Bvc2FsU3RhdHVzIiwiaGFzQXBwcm92ZWQiLCJsb2dnZXIzIiwidGFibGVUb0FwcGx5IiwidmVyU3RyaW5nIiwiaGFuZGxlRXhlY3V0ZSIsImZpbmFsUHJvcG9zYWxzIiwiZXJyb3JDb3VudCIsIndhcm5Db3VudCIsImNoaWxkcmVuIiwiY2xhc3NOYW1lIiwibmFtZSIsInZhbHVlIiwiY2hlY2tlZCIsIm9uQ2hhbmdlIiwib25DbGljayIsInN0YXR1c01lc3NhZ2UiLCJzdG9wUHJvcGFnYXRpb24iLCJkYXRhVGFibGUiLCJtb2NrRGF0YSIsImVwMSIsIngiLCJ5IiwieiIsImVwMiIsImJvcmUiLCJjcCIsImJwIiwiYnJhbmNoQm9yZSIsInNrZXkiLCJ0aXRsZSIsImRpc2FibGVkIiwiaGlzdG9yeSIsInByZXZUYWJsZSJdLCJzb3VyY2VzIjpbIlN0YXR1c0Jhci5qc3giXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFJlYWN0IGZyb20gJ3JlYWN0JztcbmltcG9ydCB7IHVzZUFwcENvbnRleHQgfSBmcm9tICcuLi8uLi9zdG9yZS9BcHBDb250ZXh0JztcbmltcG9ydCB7IHJ1blNtYXJ0Rml4IH0gZnJvbSAnLi4vLi4vZW5naW5lL09yY2hlc3RyYXRvcic7XG5pbXBvcnQgeyBhcHBseUZpeGVzIH0gZnJvbSAnLi4vLi4vZW5naW5lL0ZpeEFwcGxpY2F0b3InO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vLi4vdXRpbHMvTG9nZ2VyJztcbmltcG9ydCB7IHJ1blZhbGlkYXRpb25DaGVja2xpc3QgfSBmcm9tICcuLi8uLi9lbmdpbmUvVmFsaWRhdG9yJztcbmltcG9ydCB7IHJ1bkRhdGFQcm9jZXNzb3IgfSBmcm9tICcuLi8uLi9lbmdpbmUvRGF0YVByb2Nlc3Nvcic7XG5cbmltcG9ydCB7IFBjZlRvcG9sb2d5R3JhcGgyLCBhcHBseUFwcHJvdmVkTXV0YXRpb25zIH0gZnJvbSAnLi4vLi4vZW5naW5lL1BjZlRvcG9sb2d5R3JhcGgyJztcbmltcG9ydCB7IHVzZVN0b3JlIH0gZnJvbSAnLi4vLi4vc3RvcmUvdXNlU3RvcmUnO1xuaW1wb3J0IHsgdXNlVG9wb2xvZ3lXb3JrZXIgfSBmcm9tICcuLi8uLi93b3JrZXJzL3VzZVRvcG9sb2d5V29ya2VyJztcblxuLy8gV2hldGhlciB0byBvZmZsb2FkIEdyb3VwIDIgdG9wb2xvZ3kgd29yayB0byBhIFdlYiBXb3JrZXIuXG4vLyBEaXNhYmxlIGlmIHlvdXIgYnJvd3Nlci9lbnZpcm9ubWVudCBkb2Vzbid0IHN1cHBvcnQgbW9kdWxlIHdvcmtlcnMuXG5jb25zdCBVU0VfV09SS0VSID0gdHlwZW9mIFdvcmtlciAhPT0gJ3VuZGVmaW5lZCc7XG5cbmV4cG9ydCBmdW5jdGlvbiBTdGF0dXNCYXIoeyBhY3RpdmVUYWIsIGFjdGl2ZVN0YWdlIH0pIHtcbiAgY29uc3QgW3Nob3dNb2RhbCwgc2V0U2hvd01vZGFsXSA9IFJlYWN0LnVzZVN0YXRlKGZhbHNlKTtcbiAgY29uc3QgW3J1bkdyb3VwLCBzZXRSdW5Hcm91cF0gPSBSZWFjdC51c2VTdGF0ZSgnZ3JvdXAxJyk7XG4gIGNvbnN0IFtpc1N0YXR1c0V4cGFuZGVkLCBzZXRJc1N0YXR1c0V4cGFuZGVkXSA9IFJlYWN0LnVzZVN0YXRlKGZhbHNlKTtcbiAgY29uc3QgeyBzdGF0ZSwgZGlzcGF0Y2ggfSA9IHVzZUFwcENvbnRleHQoKTtcbiAgY29uc3Qgc2V0WnVzdGFuZERhdGEgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5zZXREYXRhVGFibGUpO1xuICBjb25zdCBzZXRadXN0YW5kUHJvcG9zYWxzID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuc2V0UHJvcG9zYWxzKTtcblxuICAvLyAtLS0tIFdvcmtlciBpbnRlZ3JhdGlvbiAtLS0tXG4gIC8vIFdlIGtlZXAgYSByZWYgdG8gdGhlIHBlbmRpbmcgcGFzcyAoMSBvciAyKSBzbyB0aGUgY2FsbGJhY2sga25vd3Mgd2hpY2ggcGFzcyBjb21wbGV0ZWQuXG4gIGNvbnN0IHBlbmRpbmdQYXNzUmVmID0gUmVhY3QudXNlUmVmKDEpO1xuICBjb25zdCBwZW5kaW5nVGFibGVSZWYgPSBSZWFjdC51c2VSZWYobnVsbCk7XG5cbiAgY29uc3QgeyBydW5Ub3BvbG9neSwgaXNSdW5uaW5nOiBpc1dvcmtlclJ1bm5pbmcgfSA9IHVzZVRvcG9sb2d5V29ya2VyKHtcbiAgICBvblByb2dyZXNzOiAobXNnKSA9PiBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX1NUQVRVU19NRVNTQUdFXCIsIHBheWxvYWQ6IG1zZyB9KSxcblxuICAgIG9uQ29tcGxldGU6ICh7IHByb3Bvc2FscywgbG9ncyB9KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50UGFzcyA9IHBlbmRpbmdQYXNzUmVmLmN1cnJlbnQ7XG4gICAgICBjb25zdCBiYXNlVGFibGUgID0gcGVuZGluZ1RhYmxlUmVmLmN1cnJlbnQgfHwgc3RhdGUuc3RhZ2UyRGF0YTtcblxuICAgICAgbG9ncy5mb3JFYWNoKGVudHJ5ID0+IGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IGVudHJ5IH0pKTtcblxuICAgICAgY29uc3QgYWN0aXZlUHJvcG9zYWxzID0gY3VycmVudFBhc3MgPT09IDJcbiAgICAgICAgPyBwcm9wb3NhbHMuZmlsdGVyKHAgPT4gIXAuZWxlbWVudEE/Ll9wYXNzQXBwbGllZCAmJiAhcC5lbGVtZW50Qj8uX3Bhc3NBcHBsaWVkICYmIHAucGFzcyA9PT0gJ1Bhc3MgMicpXG4gICAgICAgIDogcHJvcG9zYWxzLmZpbHRlcihwID0+IHAucGFzcyA9PT0gJ1Bhc3MgMScpO1xuXG4gICAgICBzZXRadXN0YW5kUHJvcG9zYWxzKGFjdGl2ZVByb3Bvc2Fscyk7XG5cbiAgICAgIGNvbnN0IHVwZGF0ZWRUYWJsZSA9IGJhc2VUYWJsZS5tYXAociA9PiAoeyAuLi5yIH0pKTtcbiAgICAgIGxvZ3MuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICAgIGlmIChlbnRyeS5yb3cgJiYgZW50cnkudGllciAmJiBlbnRyeS5yb3cgIT09ICctJykge1xuICAgICAgICAgIGNvbnN0IHJvdyA9IHVwZGF0ZWRUYWJsZS5maW5kKHIgPT4gci5fcm93SW5kZXggPT09IGVudHJ5LnJvdyk7XG4gICAgICAgICAgaWYgKHJvdyAmJiAhcm93Ll9wYXNzQXBwbGllZCAmJiAoIXJvdy5maXhpbmdBY3Rpb25UaWVyIHx8IGVudHJ5LnRpZXIgPCByb3cuZml4aW5nQWN0aW9uVGllcikpIHtcbiAgICAgICAgICAgIHJvdy5maXhpbmdBY3Rpb24gPSBlbnRyeS5tZXNzYWdlO1xuICAgICAgICAgICAgcm93LmZpeGluZ0FjdGlvblRpZXIgPSBlbnRyeS50aWVyO1xuICAgICAgICAgICAgcm93LmZpeGluZ0FjdGlvblJ1bGVJZCA9IGVudHJ5LnJ1bGVJZDtcbiAgICAgICAgICAgIGlmIChlbnRyeS5zY29yZSAhPT0gdW5kZWZpbmVkKSByb3cuZml4aW5nQWN0aW9uU2NvcmUgPSBlbnRyeS5zY29yZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgYWN0aXZlUHJvcG9zYWxzLmZvckVhY2gocHJvcCA9PiB7XG4gICAgICAgIGNvbnN0IHJvdyA9IHVwZGF0ZWRUYWJsZS5maW5kKHIgPT4gci5fcm93SW5kZXggPT09IHByb3AuZWxlbWVudEE/Ll9yb3dJbmRleCk7XG4gICAgICAgIGlmIChyb3cgJiYgIXJvdy5fcGFzc0FwcGxpZWQpIHtcbiAgICAgICAgICByb3cuZml4aW5nQWN0aW9uID0gcHJvcC5kZXNjcmlwdGlvbjtcbiAgICAgICAgICByb3cuZml4aW5nQWN0aW9uVGllciA9IChwcm9wLmRpc3QgPz8gOTk5KSA8IDI1ID8gMiA6IDM7XG4gICAgICAgICAgaWYgKHByb3Auc2NvcmUgIT09IHVuZGVmaW5lZCkgcm93LmZpeGluZ0FjdGlvblNjb3JlID0gcHJvcC5zY29yZTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBR0VfMl9EQVRBXCIsIHBheWxvYWQ6IHVwZGF0ZWRUYWJsZSB9KTtcbiAgICAgIHNldFp1c3RhbmREYXRhKHVwZGF0ZWRUYWJsZSk7XG4gICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU01BUlRfRklYX0NPTVBMRVRFXCIsIHBheWxvYWQ6IHsgcGFzczogY3VycmVudFBhc3MsIHN1bW1hcnk6IHt9IH0gfSk7XG4gICAgICBkaXNwYXRjaCh7XG4gICAgICAgIHR5cGU6IFwiU0VUX1NUQVRVU19NRVNTQUdFXCIsXG4gICAgICAgIHBheWxvYWQ6IGBbV29ya2VyXSBQYXNzICR7Y3VycmVudFBhc3N9IENvbXBsZXRlOiAke2FjdGl2ZVByb3Bvc2Fscy5sZW5ndGh9IHByb3Bvc2FscyBnZW5lcmF0ZWQuYCxcbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICBvbkVycm9yOiAobXNnKSA9PiB7XG4gICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX1NUQVRVU19NRVNTQUdFXCIsIHBheWxvYWQ6IGBbV29ya2VyXSBUb3BvbG9neSBlcnJvcjogJHttc2d9LiBSZXRyeWluZyBvbiBtYWluIHRocmVhZOKApmAgfSk7XG4gICAgICAvLyBGYWxsYmFjazogcnVuIHN5bmNocm9ub3VzbHkgb24gdGhlIG1haW4gdGhyZWFkXG4gICAgICBjb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoKTtcbiAgICAgIGNvbnN0IGNmZyA9IHsgLi4uc3RhdGUuY29uZmlnLCBjdXJyZW50UGFzczogcGVuZGluZ1Bhc3NSZWYuY3VycmVudCB9O1xuICAgICAgY29uc3QgeyBwcm9wb3NhbHMgfSA9IFBjZlRvcG9sb2d5R3JhcGgyKHBlbmRpbmdUYWJsZVJlZi5jdXJyZW50IHx8IHN0YXRlLnN0YWdlMkRhdGEsIGNmZywgbG9nZ2VyKTtcbiAgICAgIGxvZ2dlci5nZXRMb2coKS5mb3JFYWNoKGUgPT4gZGlzcGF0Y2goeyB0eXBlOiBcIkFERF9MT0dcIiwgcGF5bG9hZDogZSB9KSk7XG4gICAgICBzZXRadXN0YW5kUHJvcG9zYWxzKHByb3Bvc2Fscyk7XG4gICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU01BUlRfRklYX0NPTVBMRVRFXCIsIHBheWxvYWQ6IHsgcGFzczogcGVuZGluZ1Bhc3NSZWYuY3VycmVudCwgc3VtbWFyeToge30gfSB9KTtcbiAgICB9LFxuICB9KTtcblxuICBSZWFjdC51c2VFZmZlY3QoKCkgPT4ge1xuICAgIGNvbnN0IGhhbmRsZVN5bmMgPSAoZSkgPT4ge1xuICAgICAgICBjb25zdCB7IHJvd0luZGV4LCBzdGF0dXMgfSA9IGUuZGV0YWlsO1xuICAgICAgICAvLyBKdXN0IHN5bmMgdGhlIGFwcHJvdmFsIGZsYWcg4oCUIG5vIGdlb21ldHJ5IG11dGF0aW9uIGhlcmVcbiAgICAgICAgY29uc3QgdXBkYXRlZFRhYmxlID0gc3RhdGUuc3RhZ2UyRGF0YS5tYXAociA9PlxuICAgICAgICAgICAgci5fcm93SW5kZXggPT09IHJvd0luZGV4ID8geyAuLi5yLCBfZml4QXBwcm92ZWQ6IHN0YXR1cyB9IDogclxuICAgICAgICApO1xuICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX1NUQUdFXzJfREFUQVwiLCBwYXlsb2FkOiB1cGRhdGVkVGFibGUgfSk7XG4gICAgfTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignenVzdGFuZC1maXgtc3RhdHVzLWNoYW5nZWQnLCBoYW5kbGVTeW5jKTtcbiAgICByZXR1cm4gKCkgPT4gd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3p1c3RhbmQtZml4LXN0YXR1cy1jaGFuZ2VkJywgaGFuZGxlU3luYyk7XG4gIH0sIFtzdGF0ZS5zdGFnZTJEYXRhLCBkaXNwYXRjaF0pO1xuXG4gIGNvbnN0IGhhbmRsZVNtYXJ0Rml4ID0gKCkgPT4ge1xuICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU01BUlRfRklYX1NUQVRVU1wiLCBzdGF0dXM6IFwicnVubmluZ1wiIH0pO1xuICAgIGNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcigpO1xuXG4gICAgaWYgKHJ1bkdyb3VwID09PSAnZ3JvdXAyJykge1xuICAgICAgICAvLyBVc2UgV2ViIFdvcmtlciBpZiBzdXBwb3J0ZWQ7IGZhbGwgYmFjayB0byBzeW5jIGlmIG5vdFxuICAgICAgICBpZiAoVVNFX1dPUktFUikge1xuICAgICAgICAgIHBlbmRpbmdQYXNzUmVmLmN1cnJlbnQgPSAxO1xuICAgICAgICAgIHBlbmRpbmdUYWJsZVJlZi5jdXJyZW50ID0gc3RhdGUuc3RhZ2UyRGF0YTtcbiAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX1NUQVRVU19NRVNTQUdFXCIsIHBheWxvYWQ6IFwiVG9wb2xvZ3kgZW5naW5lIGRpc3BhdGNoZWQgdG8gV2ViIFdvcmtlciAoUGFzcyAxKeKAplwiIH0pO1xuICAgICAgICAgIHJ1blRvcG9sb2d5KHN0YXRlLnN0YWdlMkRhdGEsIHN0YXRlLmNvbmZpZywgMSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRW5mb3JjZSBydW5uaW5nIFBhc3MgMSBleHBsaWNpdGx5IGJ5IHNlbmRpbmcgY3VycmVudFBhc3M6IDFcbiAgICAgICAgY29uc3QgeyBwcm9wb3NhbHMgfSA9IFBjZlRvcG9sb2d5R3JhcGgyKHN0YXRlLnN0YWdlMkRhdGEsIHsgLi4uc3RhdGUuY29uZmlnLCBjdXJyZW50UGFzczogMSB9LCBsb2dnZXIpO1xuXG4gICAgICAgIC8vIENsZWFyIHByZXZpb3VzIHByb3Bvc2FscyBmb3IgUGFzcyAxIGZyb20gWnVzdGxhbmQgYmVmb3JlIHNldHRpbmcgbmV3XG4gICAgICAgIC8vIGFuZCBhbHNvIGZpbHRlciB0aGVtIGRvd24ganVzdCBpbiBjYXNlXG4gICAgICAgIGNvbnN0IHBhc3MxUHJvcG9zYWxzID0gcHJvcG9zYWxzLmZpbHRlcihwID0+IHAucGFzcyA9PT0gXCJQYXNzIDFcIik7XG4gICAgICAgIHNldFp1c3RhbmRQcm9wb3NhbHMocGFzczFQcm9wb3NhbHMpO1xuXG4gICAgICAgIGxldCBlcnJvckZpeGVzID0gMDtcbiAgICAgICAgbGV0IHdhcm5GaXhlcyA9IDA7XG5cbiAgICAgICAgLy8gV2UgbWFwIHNvIHdlIGNsZWFyIG91dCBhbnkgcHJldmlvdXMgcGFzcyByZXN1bHRzIGFuZCBzdGFydCBmcmVzaFxuICAgICAgICBjb25zdCB1cGRhdGVkVGFibGUgPSBzdGF0ZS5zdGFnZTJEYXRhLm1hcChyID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IHsgLi4uciB9O1xuICAgICAgICAgICAgaWYgKCFyb3cuX3Bhc3NBcHBsaWVkKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlIHJvdy5maXhpbmdBY3Rpb247XG4gICAgICAgICAgICAgICAgZGVsZXRlIHJvdy5maXhpbmdBY3Rpb25UaWVyO1xuICAgICAgICAgICAgICAgIGRlbGV0ZSByb3cuZml4aW5nQWN0aW9uU2NvcmU7XG4gICAgICAgICAgICAgICAgZGVsZXRlIHJvdy5maXhpbmdBY3Rpb25SdWxlSWQ7XG4gICAgICAgICAgICAgICAgZGVsZXRlIHJvdy5fZml4QXBwcm92ZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcm93O1xuICAgICAgICB9KTtcblxuICAgICAgICBsb2dnZXIuZ2V0TG9nKCkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIkFERF9MT0dcIiwgcGF5bG9hZDogZW50cnkgfSk7XG4gICAgICAgICAgICAgaWYgKGVudHJ5LnRpZXIgJiYgZW50cnkudGllciA8PSAyKSBlcnJvckZpeGVzKys7XG4gICAgICAgICAgICAgaWYgKGVudHJ5LnRpZXIgJiYgZW50cnkudGllciA9PT0gMykgd2FybkZpeGVzKys7XG4gICAgICAgICAgICAgaWYgKGVudHJ5LnJvdyAmJiBlbnRyeS50aWVyICYmIGVudHJ5LnJvdyAhPT0gXCItXCIpIHtcbiAgICAgICAgICAgICAgICAgY29uc3Qgcm93ID0gdXBkYXRlZFRhYmxlLmZpbmQociA9PiByLl9yb3dJbmRleCA9PT0gZW50cnkucm93KTtcbiAgICAgICAgICAgICAgICAgaWYgKHJvdyAmJiAhcm93Ll9wYXNzQXBwbGllZCAmJiAoIXJvdy5maXhpbmdBY3Rpb25UaWVyIHx8IGVudHJ5LnRpZXIgPCByb3cuZml4aW5nQWN0aW9uVGllcikpIHtcbiAgICAgICAgICAgICAgICAgICAgIHJvdy5maXhpbmdBY3Rpb24gPSBlbnRyeS5tZXNzYWdlO1xuICAgICAgICAgICAgICAgICAgICAgcm93LmZpeGluZ0FjdGlvblRpZXIgPSBlbnRyeS50aWVyO1xuICAgICAgICAgICAgICAgICAgICAgcm93LmZpeGluZ0FjdGlvblJ1bGVJZCA9IGVudHJ5LnJ1bGVJZDtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChlbnRyeS5zY29yZSAhPT0gdW5kZWZpbmVkKSByb3cuZml4aW5nQWN0aW9uU2NvcmUgPSBlbnRyeS5zY29yZTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFzczFQcm9wb3NhbHMuZm9yRWFjaChwcm9wID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IHVwZGF0ZWRUYWJsZS5maW5kKHIgPT4gci5fcm93SW5kZXggPT09IHByb3AuZWxlbWVudEEuX3Jvd0luZGV4KTtcbiAgICAgICAgICAgIGlmIChyb3cgJiYgIXJvdy5fcGFzc0FwcGxpZWQpIHtcbiAgICAgICAgICAgICAgICByb3cuZml4aW5nQWN0aW9uID0gcHJvcC5kZXNjcmlwdGlvbjtcbiAgICAgICAgICAgICAgICByb3cuZml4aW5nQWN0aW9uVGllciA9IHByb3AuZGlzdCA8IDI1ID8gMiA6IDM7XG4gICAgICAgICAgICAgICAgaWYgKHByb3Auc2NvcmUgIT09IHVuZGVmaW5lZCkgcm93LmZpeGluZ0FjdGlvblNjb3JlID0gcHJvcC5zY29yZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBR0VfMl9EQVRBXCIsIHBheWxvYWQ6IHVwZGF0ZWRUYWJsZSB9KTtcbiAgICAgICAgc2V0WnVzdGFuZERhdGEodXBkYXRlZFRhYmxlKTtcbiAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIlNNQVJUX0ZJWF9DT01QTEVURVwiLCBwYXlsb2FkOiB7IHBhc3M6IDEsIHN1bW1hcnk6IHt9IH0gfSk7XG4gICAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBVFVTX01FU1NBR0VcIiwgcGF5bG9hZDogYEFuYWx5c2lzIENvbXBsZXRlIChHcm91cCAyKTogR2VuZXJhdGVkICR7cGFzczFQcm9wb3NhbHMubGVuZ3RofSBwcm9wb3NhbHMuYCB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBydW5TbWFydEZpeChzdGF0ZS5zdGFnZTJEYXRhLCBzdGF0ZS5jb25maWcsIGxvZ2dlcik7XG4gICAgICAgIGxldCBlcnJvckZpeGVzID0gMDtcbiAgICAgICAgbGV0IHdhcm5GaXhlcyA9IDA7XG4gICAgICAgIGxvZ2dlci5nZXRMb2coKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiQUREX0xPR1wiLCBwYXlsb2FkOiBlbnRyeSB9KTtcbiAgICAgICAgICAgICBpZiAoZW50cnkudGllciAmJiBlbnRyeS50aWVyIDw9IDIpIGVycm9yRml4ZXMrKztcbiAgICAgICAgICAgICBpZiAoZW50cnkudGllciAmJiBlbnRyeS50aWVyID09PSAzKSB3YXJuRml4ZXMrKztcbiAgICAgICAgfSk7XG4gICAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTTUFSVF9GSVhfQ09NUExFVEVcIiwgcGF5bG9hZDogcmVzdWx0IH0pO1xuICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX1NUQVRVU19NRVNTQUdFXCIsIHBheWxvYWQ6IGBBbmFseXNpcyBDb21wbGV0ZTogJHtlcnJvckZpeGVzfSBBdXRvLUZpeGVzIChUMS8yKSwgJHt3YXJuRml4ZXN9IFdhcm5pbmdzIChUMylgIH0pO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBoYW5kbGVBcHBseUZpeGVzID0gKCkgPT4ge1xuICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU01BUlRfRklYX1NUQVRVU1wiLCBzdGF0dXM6IFwiYXBwbHlpbmdcIiB9KTtcbiAgICBjb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoKTtcblxuICAgIC8vIEZvciBHcm91cCAyIC8gcHJvcG9zYWxzIChmcm9tIFBjZlRvcG9sb2d5R3JhcGgyKSwgYXBwbHlpbmcgZml4ZXMgbWVhbnMgbXV0YXRpbmcgdGhlIGdlb21ldHJpZXMgdGhhdCB3ZXJlIGFwcHJvdmVkLlxuICAgIGxldCB0YWJsZVRvUHJvY2VzcyA9IHN0YXRlLnN0YWdlMkRhdGE7XG4gICAgaWYgKHVzZVN0b3JlLmdldFN0YXRlKCkucHJvcG9zYWxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGFibGVUb1Byb2Nlc3MgPSBhcHBseUFwcHJvdmVkTXV0YXRpb25zKHRhYmxlVG9Qcm9jZXNzLCB1c2VTdG9yZS5nZXRTdGF0ZSgpLnByb3Bvc2FscywgbG9nZ2VyKTtcbiAgICB9XG5cbiAgICAvLyBgY2hhaW5zYCBtYXkgYmUgdW5kZWZpbmVkIGlmIHdlIGRpZG4ndCBydW4gcnVuU21hcnRGaXggKEdyb3VwIDEpLCBidXQgYXBwbHlGaXhlcyBleHBlY3RzIGFuIGl0ZXJhYmxlLlxuICAgIGNvbnN0IGNoYWluc1RvUHJvY2VzcyA9IHN0YXRlLnNtYXJ0Rml4LmNoYWlucyB8fCBbXTtcbiAgICBjb25zdCByZXN1bHQgPSBhcHBseUZpeGVzKHRhYmxlVG9Qcm9jZXNzLCBjaGFpbnNUb1Byb2Nlc3MsIHN0YXRlLmNvbmZpZywgbG9nZ2VyKTtcblxuICAgIGxvZ2dlci5nZXRMb2coKS5mb3JFYWNoKGVudHJ5ID0+IGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IGVudHJ5IH0pKTtcblxuICAgIHNldFp1c3RhbmREYXRhKHJlc3VsdC51cGRhdGVkVGFibGUpO1xuICAgIGRpc3BhdGNoKHsgdHlwZTogXCJGSVhFU19BUFBMSUVEXCIsIHBheWxvYWQ6IHJlc3VsdCB9KTtcbiAgfTtcblxuICBjb25zdCBpc0RhdGFMb2FkZWQgPSBzdGF0ZS5zdGFnZTJEYXRhICYmIHN0YXRlLnN0YWdlMkRhdGEubGVuZ3RoID4gMDtcbiAgY29uc3QgaXNWYWxpZGF0aW9uRG9uZSA9IHN0YXRlLnNtYXJ0Rml4LnZhbGlkYXRpb25Eb25lID09PSB0cnVlO1xuICBjb25zdCBpc1J1bm5pbmcgPSBzdGF0ZS5zbWFydEZpeC5zdGF0dXMgPT09IFwicnVubmluZ1wiO1xuICBjb25zdCBpc0FwcGx5aW5nID0gc3RhdGUuc21hcnRGaXguc3RhdHVzID09PSBcImFwcGx5aW5nXCI7XG5cbiAgLy8gU21hcnQgRml4IHNob3VsZCBiZSBkaXNhYmxlZCBvbmNlIGNsaWNrZWQsIHVubGVzcyB3ZSByZXNldCBpdC5cbiAgLy8gV2UgY2FuIHRyYWNrIGlmIHRoZSBzbWFydEZpeFBhc3MgPiAwIChtZWFuaW5nIGEgcGFzcyB3YXMgcnVuKSBhbmQgZGlzYWJsZSB0aGUgbWFpbiBTbWFydCBGaXggYnV0dG9uLlxuICBjb25zdCBoYXNSdW5TbWFydEZpeCA9IChzdGF0ZS5zbWFydEZpeC5zbWFydEZpeFBhc3MgfHwgMCkgPiAwO1xuXG4gIC8vIFNlY29uZCBQYXNzIHJlYWR5IG9uY2UgUGhhc2UgMSBWYWxpZGF0b3IgaXMgZG9uZSwgbm8gbmVlZCB0byB3YWl0IGZvciBTbWFydCBGaXggMSBvciBBcHBseSBGaXhlcy5cbiAgY29uc3QgaXNTZWNvbmRQYXNzUmVhZHkgPSBpc1ZhbGlkYXRpb25Eb25lICYmICFpc1J1bm5pbmcgJiYgIWlzQXBwbHlpbmcgJiYgIWlzV29ya2VyUnVubmluZztcblxuICBjb25zdCBjYW5SdW5TbWFydEZpeCA9IGlzRGF0YUxvYWRlZCAmJiAhaXNSdW5uaW5nICYmICFpc1dvcmtlclJ1bm5pbmcgJiYgaXNWYWxpZGF0aW9uRG9uZSAmJiAhaGFzUnVuU21hcnRGaXg7XG5cbiAgLy8gQXBwbHkgRml4ZXMgZW5hYmxlZCBpZiBhbnkgcm93IGFwcHJvdmVkIGFuZCBub3QgY3VycmVudGx5IGFwcGx5aW5nXG4gIGNvbnN0IGhhc0FwcHJvdmVkRml4ZXMgPSBzdGF0ZS5zdGFnZTJEYXRhICYmIHN0YXRlLnN0YWdlMkRhdGEuc29tZShyID0+IHIuX2ZpeEFwcHJvdmVkID09PSB0cnVlKTtcbiAgY29uc3QgY2FuQXBwbHlGaXhlcyA9IGhhc0FwcHJvdmVkRml4ZXMgJiYgIWlzQXBwbHlpbmc7XG5cbiAgY29uc3QgaGFuZGxlU2Vjb25kUGFzcyA9ICgpID0+IHtcbiAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX1NNQVJUX0ZJWF9TVEFUVVNcIiwgc3RhdHVzOiBcInJ1bm5pbmdcIiB9KTtcbiAgICBjb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoKTtcbiAgICAvLyBDbGVhciBvdXQgcHJpb3IgZml4aW5nQWN0aW9uIHdhcm5pbmdzL3Byb3Bvc2FscyBmcm9tIFBhc3MgMSB0byBnaXZlIGEgY2xlYW4gc2xhdGUgZm9yIFBhc3MgMlxuICAgIC8vIFVzZXIgcmVxdWVzdGVkOiBcIndoZW4gJ1J1biBzZWNvbmQgcGFzcycgaXMgY2xpY2tlZCBkbyBub3QgcmVzZXQgX0lzc3VlbGlzdGVkIGJ1dCByZXNldCBfZml4QXBwcm92ZWRcIlxuICAgIC8vIFNvIHdlIGNsZWFyIF9maXhBcHByb3ZlZCBnbG9iYWxseSwgYW5kIGNsZWFyIGZpeGluZ0FjdGlvbiBzbyBQYXNzIDEgaXRlbXMgZG9uJ3QgY2x1dHRlciB0aGUgVUkgZHVyaW5nIFBhc3MgMiBldmFsdWF0aW9uLlxuICAgIGNvbnN0IHBhc3MyVGFibGUgPSBzdGF0ZS5zdGFnZTJEYXRhLm1hcChyID0+IHtcbiAgICAgICAgY29uc3QgY2xlYW5Sb3cgPSB7IC4uLnIsIF9jdXJyZW50UGFzczogMiB9O1xuXG4gICAgICAgIC8vIFJlbW92ZSBvbGQgUGFzcyAxIHByb3Bvc2FscyB0aGF0IHdlcmUgbm90IGFwcGxpZWRcbiAgICAgICAgaWYgKCFjbGVhblJvdy5fcGFzc0FwcGxpZWQpIHtcbiAgICAgICAgICAgIGRlbGV0ZSBjbGVhblJvdy5maXhpbmdBY3Rpb247XG4gICAgICAgICAgICBkZWxldGUgY2xlYW5Sb3cuZml4aW5nQWN0aW9uVGllcjtcbiAgICAgICAgICAgIGRlbGV0ZSBjbGVhblJvdy5maXhpbmdBY3Rpb25TY29yZTtcbiAgICAgICAgICAgIGRlbGV0ZSBjbGVhblJvdy5maXhpbmdBY3Rpb25SdWxlSWQ7XG4gICAgICAgICAgICBkZWxldGUgY2xlYW5Sb3cuX2ZpeEFwcHJvdmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNsZWFuUm93O1xuICAgIH0pO1xuICAgIFxuICAgIC8vIFdlIG9ubHkgcGFzcyB0aGUgY3VycmVudCBQYXNzIDIgY29uZmlnIHNvIHRoZSBlbmdpbmUgZXhwbGljaXRseSBydW5zIFBhc3MgMlxuICAgIGlmIChydW5Hcm91cCA9PT0gJ2dyb3VwMicpIHtcbiAgICAgICAgaWYgKFVTRV9XT1JLRVIpIHtcbiAgICAgICAgICBwZW5kaW5nUGFzc1JlZi5jdXJyZW50ID0gMjtcbiAgICAgICAgICBwZW5kaW5nVGFibGVSZWYuY3VycmVudCA9IHBhc3MyVGFibGU7XG4gICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIlNFVF9TVEFHRV8yX0RBVEFcIiwgcGF5bG9hZDogcGFzczJUYWJsZSB9KTtcbiAgICAgICAgICBzZXRadXN0YW5kRGF0YShwYXNzMlRhYmxlKTtcbiAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX1NUQVRVU19NRVNTQUdFXCIsIHBheWxvYWQ6IFwiVG9wb2xvZ3kgZW5naW5lIGRpc3BhdGNoZWQgdG8gV2ViIFdvcmtlciAoUGFzcyAyKeKAplwiIH0pO1xuICAgICAgICAgIHJ1blRvcG9sb2d5KHBhc3MyVGFibGUsIHN0YXRlLmNvbmZpZywgMik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgeyBwcm9wb3NhbHMgfSA9IFBjZlRvcG9sb2d5R3JhcGgyKHBhc3MyVGFibGUsIHsgLi4uc3RhdGUuY29uZmlnLCBjdXJyZW50UGFzczogMiB9LCBsb2dnZXIpO1xuXG4gICAgICAgIC8vIEZpbHRlciBwcm9wb3NhbHMgZG93biB0byBvbmx5IHRoZSB1bi1hcHBsaWVkIG9uZXMgYW5kIGVuZm9yY2UgUGFzcyAyIHNwZWNpZmljXG4gICAgICAgIGNvbnN0IGFjdGl2ZVByb3Bvc2FscyA9IHByb3Bvc2Fscy5maWx0ZXIocCA9PiAhcC5lbGVtZW50QS5fcGFzc0FwcGxpZWQgJiYgIXAuZWxlbWVudEIuX3Bhc3NBcHBsaWVkICYmIHAucGFzcyA9PT0gXCJQYXNzIDJcIik7XG4gICAgICAgIHNldFp1c3RhbmRQcm9wb3NhbHMoYWN0aXZlUHJvcG9zYWxzKTtcblxuICAgICAgICBsZXQgaGFzUGFzczJQcm9wb3NhbHMgPSBmYWxzZTtcblxuICAgICAgICAvLyBBdHRhY2ggbmV3IHByb3Bvc2FscyB0byByb3dzIHNvIHRoZXkgcmVuZGVyIGNvcnJlY3RseSBpbiB0aGUgRGF0YVRhYmxlXG4gICAgICAgIGFjdGl2ZVByb3Bvc2Fscy5mb3JFYWNoKHByb3AgPT4ge1xuICAgICAgICAgICAgaWYgKHByb3AucGFzcyA9PT0gJ1Bhc3MgMicpIHtcbiAgICAgICAgICAgICAgICBoYXNQYXNzMlByb3Bvc2FscyA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByb3cgPSBwYXNzMlRhYmxlLmZpbmQociA9PiByLl9yb3dJbmRleCA9PT0gcHJvcC5lbGVtZW50QS5fcm93SW5kZXgpO1xuICAgICAgICAgICAgaWYgKHJvdyAmJiAhcm93Ll9wYXNzQXBwbGllZCkge1xuICAgICAgICAgICAgICAgIHJvdy5maXhpbmdBY3Rpb24gPSBwcm9wLmRlc2NyaXB0aW9uO1xuICAgICAgICAgICAgICAgIHJvdy5maXhpbmdBY3Rpb25UaWVyID0gcHJvcC5kaXN0IDwgMjUgPyAyIDogMztcbiAgICAgICAgICAgICAgICBpZiAocHJvcC5zY29yZSAhPT0gdW5kZWZpbmVkKSByb3cuZml4aW5nQWN0aW9uU2NvcmUgPSBwcm9wLnNjb3JlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBsb2dnZXIuZ2V0TG9nKCkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIkFERF9MT0dcIiwgcGF5bG9hZDogZW50cnkgfSk7XG4gICAgICAgICAgICAgaWYgKGVudHJ5LnJvdyAmJiBlbnRyeS50aWVyICYmIGVudHJ5LnJvdyAhPT0gXCItXCIpIHtcbiAgICAgICAgICAgICAgICAgY29uc3Qgcm93ID0gcGFzczJUYWJsZS5maW5kKHIgPT4gci5fcm93SW5kZXggPT09IGVudHJ5LnJvdyk7XG4gICAgICAgICAgICAgICAgIC8vIE9ubHkgb3ZlcndyaXRlIGlmIGl0J3Mgbm90IGEgcHJldmlvdXNseSBhcHBsaWVkIHBhc3NcbiAgICAgICAgICAgICAgICAgaWYgKHJvdyAmJiAhcm93Ll9wYXNzQXBwbGllZCAmJiAoIXJvdy5maXhpbmdBY3Rpb25UaWVyIHx8IGVudHJ5LnRpZXIgPCByb3cuZml4aW5nQWN0aW9uVGllcikpIHtcbiAgICAgICAgICAgICAgICAgICAgIHJvdy5maXhpbmdBY3Rpb24gPSBlbnRyeS5tZXNzYWdlO1xuICAgICAgICAgICAgICAgICAgICAgcm93LmZpeGluZ0FjdGlvblRpZXIgPSBlbnRyeS50aWVyO1xuICAgICAgICAgICAgICAgICAgICAgcm93LmZpeGluZ0FjdGlvblJ1bGVJZCA9IGVudHJ5LnJ1bGVJZDtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChlbnRyeS5zY29yZSAhPT0gdW5kZWZpbmVkKSByb3cuZml4aW5nQWN0aW9uU2NvcmUgPSBlbnRyeS5zY29yZTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKCFoYXNQYXNzMlByb3Bvc2Fscykge1xuICAgICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IHsgc3RhZ2U6IFwiRklYSU5HXCIsIHR5cGU6IFwiSW5mb1wiLCBtZXNzYWdlOiBcIlBhc3MgMiBkaWQgbm90IHlpZWxkIGFueSBuZXcgcHJvcG9zYWxzIGZvciBleGlzdGluZyBnYXBzLlwiLCByb3c6IFwiLVwiIH0gfSk7XG4gICAgICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIlNFVF9TVEFUVVNfTUVTU0FHRVwiLCBwYXlsb2FkOiBcIlBhc3MgMiBBbmFseXNpcyBDb21wbGV0ZTogTm8gbmV3IGlzc3VlcyBmb3VuZC5cIiB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX1NUQVRVU19NRVNTQUdFXCIsIHBheWxvYWQ6IGBQYXNzIDIgQW5hbHlzaXMgQ29tcGxldGU6IEdlbmVyYXRlZCAke2FjdGl2ZVByb3Bvc2Fscy5maWx0ZXIocD0+cC5wYXNzPT09J1Bhc3MgMicpLmxlbmd0aH0gcHJvcG9zYWxzLmAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX1NUQUdFXzJfREFUQVwiLCBwYXlsb2FkOiBwYXNzMlRhYmxlIH0pO1xuICAgICAgICBzZXRadXN0YW5kRGF0YShwYXNzMlRhYmxlKTtcbiAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIlNNQVJUX0ZJWF9DT01QTEVURVwiLCBwYXlsb2FkOiB7IHBhc3M6IDIsIHN1bW1hcnk6IHt9IH0gfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gcnVuU21hcnRGaXgocGFzczJUYWJsZSwgeyAuLi5zdGF0ZS5jb25maWcsIGN1cnJlbnRQYXNzOiAyIH0sIGxvZ2dlcik7XG4gICAgICAgIGxvZ2dlci5nZXRMb2coKS5mb3JFYWNoKGVudHJ5ID0+IGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IGVudHJ5IH0pKTtcbiAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIlNFVF9TVEFHRV8yX0RBVEFcIiwgcGF5bG9hZDogcGFzczJUYWJsZSB9KTtcbiAgICAgICAgc2V0WnVzdGFuZERhdGEocGFzczJUYWJsZSk7XG4gICAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTTUFSVF9GSVhfQ09NUExFVEVcIiwgcGF5bG9hZDogeyAuLi5yZXN1bHQsIHBhc3M6IDIgfSB9KTtcbiAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIlNFVF9TVEFUVVNfTUVTU0FHRVwiLCBwYXlsb2FkOiBcIlNlY29uZCBQYXNzIGFuYWx5c2lzIGNvbXBsZXRlIOKAlCByZXZpZXcgcHJvcG9zYWxzIGFuZCBBcHBseSBGaXhlcy5cIiB9KTtcbiAgICB9XG4gIH07XG5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIE9uZS1DbGljayBBdXRvLUZpeDogcnVucyB0aGUgZnVsbCBwaXBlbGluZSBhdXRvbWF0aWNhbGx5LFxuICAvLyBzdG9wcyBiZWZvcmUgVGllciAzIChyZXZpZXctcmVxdWlyZWQpIHByb3Bvc2Fscy5cbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIGNvbnN0IFthdXRvRml4UnVubmluZywgc2V0QXV0b0ZpeFJ1bm5pbmddID0gUmVhY3QudXNlU3RhdGUoZmFsc2UpO1xuXG4gIGNvbnN0IGhhbmRsZU9uZUNsaWNrQXV0b0ZpeCA9IGFzeW5jICgpID0+IHtcbiAgICBpZiAoIXN0YXRlLnN0YWdlMkRhdGEgfHwgc3RhdGUuc3RhZ2UyRGF0YS5sZW5ndGggPT09IDApIHtcbiAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBVFVTX01FU1NBR0VcIiwgcGF5bG9hZDogXCJBdXRvLUZpeDogTm8gU3RhZ2UgMiBkYXRhLiBQdWxsIGRhdGEgZnJvbSBTdGFnZSAxIGZpcnN0LlwiIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzZXRBdXRvRml4UnVubmluZyh0cnVlKTtcbiAgICBkaXNwYXRjaCh7IHR5cGU6IFwiQ0xFQVJfTE9HXCIgfSk7XG4gICAgZGlzcGF0Y2goeyB0eXBlOiBcIlNFVF9TVEFUVVNfTUVTU0FHRVwiLCBwYXlsb2FkOiBcIkF1dG8tRml4IFBpcGVsaW5lOiBTdGVwIDEvNCDigJQgUnVubmluZyBEYXRhIFByb2Nlc3NvcuKAplwiIH0pO1xuXG4gICAgLy8gWWllbGQgdG8gUmVhY3QgYmVmb3JlIGhlYXZ5IHdvcmtcbiAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXG4gICAgY29uc3QgbG9nZ2VyID0gY3JlYXRlTG9nZ2VyKCk7XG5cbiAgICAvLyBTdGVwIDE6IERhdGEgUHJvY2Vzc29yXG4gICAgbGV0IHByb2Nlc3NlZFRhYmxlID0gcnVuRGF0YVByb2Nlc3NvcihzdGF0ZS5zdGFnZTJEYXRhLCBzdGF0ZS5jb25maWcsIGxvZ2dlcik7XG5cbiAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBVFVTX01FU1NBR0VcIiwgcGF5bG9hZDogXCJBdXRvLUZpeCBQaXBlbGluZTogU3RlcCAyLzQg4oCUIFJ1bm5pbmcgVmFsaWRhdGlvbuKAplwiIH0pO1xuXG4gICAgLy8gU3RlcCAyOiBWYWxpZGF0aW9uXG4gICAgcnVuVmFsaWRhdGlvbkNoZWNrbGlzdChwcm9jZXNzZWRUYWJsZSwgc3RhdGUuY29uZmlnLCBsb2dnZXIsIFwiMlwiKTtcbiAgICBsb2dnZXIuZ2V0TG9nKCkuZm9yRWFjaChlbnRyeSA9PiBkaXNwYXRjaCh7IHR5cGU6IFwiQUREX0xPR1wiLCBwYXlsb2FkOiBlbnRyeSB9KSk7XG4gICAgbG9nZ2VyLmdldExvZygpLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgaWYgKGVudHJ5LnJvdyAmJiBlbnRyeS50aWVyKSB7XG4gICAgICAgIGNvbnN0IHJvdyA9IHByb2Nlc3NlZFRhYmxlLmZpbmQociA9PiByLl9yb3dJbmRleCA9PT0gZW50cnkucm93KTtcbiAgICAgICAgaWYgKHJvdyAmJiAhcm93LmZpeGluZ0FjdGlvbikge1xuICAgICAgICAgIHJvdy5maXhpbmdBY3Rpb24gPSBlbnRyeS5tZXNzYWdlO1xuICAgICAgICAgIHJvdy5maXhpbmdBY3Rpb25UaWVyID0gZW50cnkudGllcjtcbiAgICAgICAgICByb3cuZml4aW5nQWN0aW9uUnVsZUlkID0gZW50cnkucnVsZUlkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGlzcGF0Y2goeyB0eXBlOiBcIlNFVF9TVEFHRV8yX0RBVEFcIiwgcGF5bG9hZDogcHJvY2Vzc2VkVGFibGUgfSk7XG4gICAgc2V0WnVzdGFuZERhdGEocHJvY2Vzc2VkVGFibGUpO1xuICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfVkFMSURBVElPTl9ET05FXCIgfSk7XG5cbiAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBVFVTX01FU1NBR0VcIiwgcGF5bG9hZDogXCJBdXRvLUZpeCBQaXBlbGluZTogU3RlcCAzLzQg4oCUIFJ1bm5pbmcgU21hcnQgRml4IChHcm91cCAyKeKAplwiIH0pO1xuXG4gICAgLy8gU3RlcCAzOiBTbWFydCBGaXggKEdyb3VwIDIgdG9wb2xvZ3kgZW5naW5lKVxuICAgIGNvbnN0IGxvZ2dlcjIgPSBjcmVhdGVMb2dnZXIoKTtcbiAgICBjb25zdCB7IHByb3Bvc2FscyB9ID0gUGNmVG9wb2xvZ3lHcmFwaDIocHJvY2Vzc2VkVGFibGUsIHN0YXRlLmNvbmZpZywgbG9nZ2VyMik7XG4gICAgc2V0WnVzdGFuZFByb3Bvc2Fscyhwcm9wb3NhbHMpO1xuXG4gICAgY29uc3QgdGFibGVXaXRoUHJvcG9zYWxzID0gcHJvY2Vzc2VkVGFibGUubWFwKHIgPT4gKHsgLi4uciB9KSk7XG4gICAgbG9nZ2VyMi5nZXRMb2coKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IGVudHJ5IH0pO1xuICAgICAgaWYgKGVudHJ5LnJvdyAmJiBlbnRyeS50aWVyICYmIGVudHJ5LnJvdyAhPT0gXCItXCIpIHtcbiAgICAgICAgY29uc3Qgcm93ID0gdGFibGVXaXRoUHJvcG9zYWxzLmZpbmQociA9PiByLl9yb3dJbmRleCA9PT0gZW50cnkucm93KTtcbiAgICAgICAgaWYgKHJvdyAmJiAhcm93Ll9wYXNzQXBwbGllZCAmJiAoIXJvdy5maXhpbmdBY3Rpb25UaWVyIHx8IGVudHJ5LnRpZXIgPCByb3cuZml4aW5nQWN0aW9uVGllcikpIHtcbiAgICAgICAgICByb3cuZml4aW5nQWN0aW9uID0gZW50cnkubWVzc2FnZTtcbiAgICAgICAgICByb3cuZml4aW5nQWN0aW9uVGllciA9IGVudHJ5LnRpZXI7XG4gICAgICAgICAgcm93LmZpeGluZ0FjdGlvblJ1bGVJZCA9IGVudHJ5LnJ1bGVJZDtcbiAgICAgICAgICBpZiAoZW50cnkuc2NvcmUgIT09IHVuZGVmaW5lZCkgcm93LmZpeGluZ0FjdGlvblNjb3JlID0gZW50cnkuc2NvcmU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICBwcm9wb3NhbHMuZm9yRWFjaChwcm9wID0+IHtcbiAgICAgIGNvbnN0IHJvdyA9IHRhYmxlV2l0aFByb3Bvc2Fscy5maW5kKHIgPT4gci5fcm93SW5kZXggPT09IHByb3AuZWxlbWVudEEuX3Jvd0luZGV4KTtcbiAgICAgIGlmIChyb3cgJiYgIXJvdy5fcGFzc0FwcGxpZWQpIHtcbiAgICAgICAgcm93LmZpeGluZ0FjdGlvbiA9IHByb3AuZGVzY3JpcHRpb247XG4gICAgICAgIHJvdy5maXhpbmdBY3Rpb25UaWVyID0gcHJvcC5kaXN0IDwgMjUgPyAyIDogMztcbiAgICAgICAgaWYgKHByb3Auc2NvcmUgIT09IHVuZGVmaW5lZCkgcm93LmZpeGluZ0FjdGlvblNjb3JlID0gcHJvcC5zY29yZTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEF1dG8tYXBwcm92ZSBUaWVyIDEgJiAyIOKAlCBUaWVyIDMgcmVxdWlyZXMgbWFudWFsIHJldmlld1xuICAgIGNvbnN0IHRpZXIzQ291bnQgPSB0YWJsZVdpdGhQcm9wb3NhbHMuZmlsdGVyKHIgPT4gci5maXhpbmdBY3Rpb25UaWVyID09PSAzICYmICFyLl9wYXNzQXBwbGllZCkubGVuZ3RoO1xuICAgIHRhYmxlV2l0aFByb3Bvc2Fscy5mb3JFYWNoKHIgPT4ge1xuICAgICAgaWYgKCFyLl9wYXNzQXBwbGllZCAmJiByLmZpeGluZ0FjdGlvblRpZXIgJiYgci5maXhpbmdBY3Rpb25UaWVyIDw9IDIpIHtcbiAgICAgICAgci5fZml4QXBwcm92ZWQgPSB0cnVlO1xuICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldFByb3Bvc2FsU3RhdHVzKHIuX3Jvd0luZGV4LCB0cnVlKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBR0VfMl9EQVRBXCIsIHBheWxvYWQ6IHRhYmxlV2l0aFByb3Bvc2FscyB9KTtcbiAgICBzZXRadXN0YW5kRGF0YSh0YWJsZVdpdGhQcm9wb3NhbHMpO1xuICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTTUFSVF9GSVhfQ09NUExFVEVcIiwgcGF5bG9hZDogeyBwYXNzOiAxLCBzdW1tYXJ5OiB7fSB9IH0pO1xuXG4gICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuICAgIC8vIFN0ZXAgNDogQXBwbHkgYXBwcm92ZWQgKFRpZXIgMSAmIDIpIGZpeGVzIGltbWVkaWF0ZWx5XG4gICAgY29uc3QgaGFzQXBwcm92ZWQgPSB0YWJsZVdpdGhQcm9wb3NhbHMuc29tZShyID0+IHIuX2ZpeEFwcHJvdmVkID09PSB0cnVlKTtcbiAgICBpZiAoaGFzQXBwcm92ZWQpIHtcbiAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBVFVTX01FU1NBR0VcIiwgcGF5bG9hZDogXCJBdXRvLUZpeCBQaXBlbGluZTogU3RlcCA0LzQg4oCUIEFwcGx5aW5nIFRpZXIgMSAmIDIgZml4ZXPigKZcIiB9KTtcbiAgICAgIGNvbnN0IGxvZ2dlcjMgPSBjcmVhdGVMb2dnZXIoKTtcbiAgICAgIGxldCB0YWJsZVRvQXBwbHkgPSB0YWJsZVdpdGhQcm9wb3NhbHM7XG4gICAgICBpZiAocHJvcG9zYWxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGFibGVUb0FwcGx5ID0gYXBwbHlBcHByb3ZlZE11dGF0aW9ucyh0YWJsZVRvQXBwbHksIHByb3Bvc2FscywgbG9nZ2VyMyk7XG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHQgPSBhcHBseUZpeGVzKHRhYmxlVG9BcHBseSwgc3RhdGUuc21hcnRGaXguY2hhaW5zIHx8IFtdLCBzdGF0ZS5jb25maWcsIGxvZ2dlcjMpO1xuICAgICAgbG9nZ2VyMy5nZXRMb2coKS5mb3JFYWNoKGUgPT4gZGlzcGF0Y2goeyB0eXBlOiBcIkFERF9MT0dcIiwgcGF5bG9hZDogZSB9KSk7XG4gICAgICBzZXRadXN0YW5kRGF0YShyZXN1bHQudXBkYXRlZFRhYmxlKTtcbiAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJGSVhFU19BUFBMSUVEXCIsIHBheWxvYWQ6IHJlc3VsdCB9KTtcbiAgICB9XG5cbiAgICBzZXRBdXRvRml4UnVubmluZyhmYWxzZSk7XG4gICAgY29uc3QgbXNnID0gdGllcjNDb3VudCA+IDBcbiAgICAgID8gYEF1dG8tRml4IENvbXBsZXRlOiBUaWVyIDEvMiBmaXhlcyBhcHBsaWVkLiAke3RpZXIzQ291bnR9IFRpZXIgMyBpdGVtcyByZXF1aXJlIG1hbnVhbCByZXZpZXcgaW4gU3RhZ2UgMi5gXG4gICAgICA6IFwiQXV0by1GaXggQ29tcGxldGU6IEFsbCBmaXhlcyBhcHBsaWVkIGF1dG9tYXRpY2FsbHkuIFJldmlldyBTdGFnZSAyIGFuZCBleHBvcnQgZnJvbSBTdGFnZSAzLlwiO1xuICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBVFVTX01FU1NBR0VcIiwgcGF5bG9hZDogbXNnIH0pO1xuICB9O1xuXG4gIGNvbnN0IHZlclN0cmluZyA9IFwiVmVyIDI0LTAzLTIwMjYgKDEpXCI7XG5cbiAgY29uc3QgaGFuZGxlRXhlY3V0ZSA9ICgpID0+IHtcbiAgICAgIHNldFNob3dNb2RhbChmYWxzZSk7XG4gICAgICBjb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoKTtcbiAgICAgIC8vIE9ubHkgcHJvY2VzcyBnZW9tZXRyeSBwYXJzaW5nIGFuZCBWMTUgdmFsaWRhdGlvbiAoU3RhZ2UgMikgaGVyZVxuICAgICAgLy8gRGF0YVByb2Nlc3Nvcjogb25seSBmaWxsIGRlcml2ZWQgZmllbGRzIChib3JlLCBDUCwgZGVsdGFzLCBsZW5ndGhzKSDigJQgbm8gcGlwZSB0cmltbWluZy9maWxsaW5nXG4gICAgICBsZXQgcHJvY2Vzc2VkVGFibGUgPSBydW5EYXRhUHJvY2Vzc29yKHN0YXRlLnN0YWdlMkRhdGEsIHN0YXRlLmNvbmZpZywgbG9nZ2VyKTtcbiAgICAgIC8vIFZhbGlkYXRpb246IHBvcHVsYXRlcyBmaXhpbmdBY3Rpb24gd2l0aCBFUlJPUi9XQVJOSU5HIG1lc3NhZ2VzIOKAlCByZWFkLW9ubHksIG5vIGNvb3JkIGNoYW5nZXNcbiAgICAgIHJ1blZhbGlkYXRpb25DaGVja2xpc3QocHJvY2Vzc2VkVGFibGUsIHN0YXRlLmNvbmZpZywgbG9nZ2VyLCBcIjJcIik7XG5cbiAgICAgIGxldCBmaW5hbFByb3Bvc2FscyA9IFtdO1xuICAgICAgaWYgKHJ1bkdyb3VwID09PSAnZ3JvdXAyJykge1xuICAgICAgICAgIC8vIEdlbmVyYXRlIFp1c3RhbmQgcHJvcG9zYWxzIG9ubHkg4oCUIGRvIE5PVCBhcHBseSBtdXRhdGlvbnMgeWV0XG4gICAgICAgICAgY29uc3QgeyBwcm9wb3NhbHMgfSA9IFBjZlRvcG9sb2d5R3JhcGgyKHByb2Nlc3NlZFRhYmxlLCBzdGF0ZS5jb25maWcsIGxvZ2dlcik7XG4gICAgICAgICAgZmluYWxQcm9wb3NhbHMgPSBwcm9wb3NhbHM7XG4gICAgICAgICAgc2V0WnVzdGFuZFByb3Bvc2Fscyhwcm9wb3NhbHMpO1xuICAgICAgICAgIC8vIHByb3Bvc2FscyB3aWxsIGJlIGFwcGxpZWQgT05MWSB3aGVuIHVzZXIgY2xpY2tzIFwiQXBwbHkgRml4ZXNcIlxuICAgICAgfVxuXG4gICAgICBsb2dnZXIuZ2V0TG9nKCkuZm9yRWFjaChlbnRyeSA9PiBkaXNwYXRjaCh7IHR5cGU6IFwiQUREX0xPR1wiLCBwYXlsb2FkOiBlbnRyeSB9KSk7XG5cbiAgICAgIC8vIEF0dGFjaCB2YWxpZGF0aW9uIG1lc3NhZ2VzIHRvIHRhYmxlIHJvd3MgKGZpeGluZ0FjdGlvbilcbiAgICAgIGxvZ2dlci5nZXRMb2coKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgICAgaWYgKGVudHJ5LnJvdyAmJiBlbnRyeS50aWVyKSB7XG4gICAgICAgICAgY29uc3Qgcm93ID0gcHJvY2Vzc2VkVGFibGUuZmluZChyID0+IHIuX3Jvd0luZGV4ID09PSBlbnRyeS5yb3cpO1xuICAgICAgICAgIGlmIChyb3cgJiYgIXJvdy5maXhpbmdBY3Rpb24pIHtcbiAgICAgICAgICAgIHJvdy5maXhpbmdBY3Rpb24gPSBlbnRyeS5tZXNzYWdlO1xuICAgICAgICAgICAgcm93LmZpeGluZ0FjdGlvblRpZXIgPSBlbnRyeS50aWVyO1xuICAgICAgICAgICAgcm93LmZpeGluZ0FjdGlvblJ1bGVJZCA9IGVudHJ5LnJ1bGVJZDtcbiAgICAgICAgICAgIGlmIChlbnRyeS5zY29yZSAhPT0gdW5kZWZpbmVkKSByb3cuZml4aW5nQWN0aW9uU2NvcmUgPSBlbnRyeS5zY29yZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBPdmVycmlkZSBmaXhpbmdBY3Rpb24gd2l0aCBwcm9wb3NhbHMgZnJvbSBncm91cDIgc28gdGhleSBzaG93IHVwXG4gICAgICBpZiAocnVuR3JvdXAgPT09ICdncm91cDInKSB7XG4gICAgICAgICAgZmluYWxQcm9wb3NhbHMuZm9yRWFjaChwcm9wID0+IHtcbiAgICAgICAgICAgICAgY29uc3Qgcm93ID0gcHJvY2Vzc2VkVGFibGUuZmluZChyID0+IHIuX3Jvd0luZGV4ID09PSBwcm9wLmVsZW1lbnRBLl9yb3dJbmRleCk7XG4gICAgICAgICAgICAgIGlmIChyb3cpIHtcbiAgICAgICAgICAgICAgICAgIHJvdy5maXhpbmdBY3Rpb24gPSBwcm9wLmRlc2NyaXB0aW9uO1xuICAgICAgICAgICAgICAgICAgcm93LmZpeGluZ0FjdGlvblRpZXIgPSBwcm9wLmRpc3QgPCAyNSA/IDIgOiAzO1xuICAgICAgICAgICAgICAgICAgaWYgKHByb3Auc2NvcmUgIT09IHVuZGVmaW5lZCkgcm93LmZpeGluZ0FjdGlvblNjb3JlID0gcHJvcC5zY29yZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX1NUQUdFXzJfREFUQVwiLCBwYXlsb2FkOiBwcm9jZXNzZWRUYWJsZSB9KTtcbiAgICAgIHNldFp1c3RhbmREYXRhKHByb2Nlc3NlZFRhYmxlKTtcbiAgICAgIC8vIEdhdGU6IHVubG9jayBTbWFydCBGaXggYnV0dG9uXG4gICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX1ZBTElEQVRJT05fRE9ORVwiIH0pO1xuICAgICAgY29uc3QgZXJyb3JDb3VudCA9IGxvZ2dlci5nZXRMb2coKS5maWx0ZXIoZSA9PiBlLnRpZXIgPD0gMikubGVuZ3RoO1xuICAgICAgY29uc3Qgd2FybkNvdW50ICA9IGxvZ2dlci5nZXRMb2coKS5maWx0ZXIoZSA9PiBlLnRpZXIgPT09IDMpLmxlbmd0aDtcbiAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBVFVTX01FU1NBR0VcIiwgcGF5bG9hZDogYFZhbGlkYXRpb24gY29tcGxldGU6ICR7ZXJyb3JDb3VudH0gRXJyb3JzLCAke3dhcm5Db3VudH0gV2FybmluZ3MuIFJ1biBTbWFydCBGaXggdG8gZ2VuZXJhdGUgcHJvcG9zYWxzLmAgfSk7XG4gIH07XG5cbiAgcmV0dXJuIChcbiAgICA8PlxuICAgICAge3Nob3dNb2RhbCAmJiAoXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZml4ZWQgaW5zZXQtMCBiZy1ibGFjay81MCBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciB6LVsxMDBdXCI+XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJiZy13aGl0ZSBwLTYgcm91bmRlZC1sZyBzaGFkb3cteGwgdy1bNTAwcHhdIHRleHQtc2xhdGUtODAwXCI+XG4gICAgICAgICAgICA8aDIgY2xhc3NOYW1lPVwidGV4dC14bCBmb250LWJvbGQgbWItNFwiPlNlbGVjdCBWYWxpZGF0aW9uIEVuZ2luZTwvaDI+XG5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic3BhY2UteS00IG1iLTZcIj5cbiAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cImZsZXggaXRlbXMtc3RhcnQgc3BhY2UteC0zIHAtMyBib3JkZXIgcm91bmRlZCBob3ZlcjpiZy1zbGF0ZS01MCBjdXJzb3ItcG9pbnRlclwiPlxuICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwicmFkaW9cIiBuYW1lPVwiZW5naW5lR3JvdXBcIiB2YWx1ZT1cImdyb3VwMVwiIGNoZWNrZWQ9e3J1bkdyb3VwID09PSAnZ3JvdXAxJ30gb25DaGFuZ2U9eygpID0+IHNldFJ1bkdyb3VwKCdncm91cDEnKX0gY2xhc3NOYW1lPVwibXQtMVwiIC8+XG4gICAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZm9udC1zZW1pYm9sZFwiPkdyb3VwICgxKTogT3JpZ2luYWwgU21hcnQgRml4ZXI8L2Rpdj5cbiAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC1zbSB0ZXh0LXNsYXRlLTUwMFwiPlN0YW5kYXJkIEZpcnN0IFBhc3MgYW5kIFNlY29uZCBQYXNzIGxvZ2ljIHRyYWNraW5nIGNvbXBvbmVudHMgYW5kIGFwcGx5aW5nIHJ1bGVzLjwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICA8L2xhYmVsPlxuXG4gICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLXN0YXJ0IHNwYWNlLXgtMyBwLTMgYm9yZGVyIHJvdW5kZWQgaG92ZXI6Ymctc2xhdGUtNTAgY3Vyc29yLXBvaW50ZXJcIj5cbiAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInJhZGlvXCIgbmFtZT1cImVuZ2luZUdyb3VwXCIgdmFsdWU9XCJncm91cDJcIiBjaGVja2VkPXtydW5Hcm91cCA9PT0gJ2dyb3VwMid9IG9uQ2hhbmdlPXsoKSA9PiBzZXRSdW5Hcm91cCgnZ3JvdXAyJyl9IGNsYXNzTmFtZT1cIm10LTFcIiAvPlxuICAgICAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZvbnQtc2VtaWJvbGRcIj5Hcm91cCAoMik6IFBjZlRvcG9sb2d5R3JhcGhfMjwvZGl2PlxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LXNtIHRleHQtc2xhdGUtNTAwXCI+My1QYXNzIFN5c3RlbTogU2VxdWVudGlhbCBUcmFjaW5nLCBHbG9iYWwgU3dlZXAgKE1ham9yIEF4aXMpLCBHbG9iYWwgRnV6enkgU2VhcmNoLiBJbmNsdWRlcyBJbW11dGFibGUgVHJhbnNsYXRpb25zIGFuZCBQaXBlIEluamVjdGlvbi48L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgganVzdGlmeS1lbmQgc3BhY2UteC0zXCI+XG4gICAgICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4gc2V0U2hvd01vZGFsKGZhbHNlKX0gY2xhc3NOYW1lPVwicHgtNCBweS0yIGJvcmRlciByb3VuZGVkIGhvdmVyOmJnLXNsYXRlLTEwMCB0ZXh0LXNsYXRlLTcwMFwiPkNhbmNlbDwvYnV0dG9uPlxuICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e2hhbmRsZUV4ZWN1dGV9IGNsYXNzTmFtZT1cInB4LTQgcHktMiBiZy1ibHVlLTYwMCB0ZXh0LXdoaXRlIHJvdW5kZWQgaG92ZXI6YmctYmx1ZS03MDAgZm9udC1tZWRpdW1cIj5SdW4gRW5naW5lPC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICApfVxuXG4gICAgPGRpdiBjbGFzc05hbWU9XCJmaXhlZCBib3R0b20tMCBsZWZ0LTAgcmlnaHQtMCBoLTEyIGJnLXNsYXRlLTgwMCB0ZXh0LXdoaXRlIGZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBweC00IHRleHQtc20gei01MCBzaGFkb3ctbGdcIj5cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgc3BhY2UteC0yIHJlbGF0aXZlIGgtZnVsbFwiPlxuICAgICAgICB7LyogQ29sbGFwc2libGUgU3RhdHVzIENvbnRhaW5lciAqL31cbiAgICAgICAgPGRpdlxuICAgICAgICAgICAgY2xhc3NOYW1lPXtgYWJzb2x1dGUgYm90dG9tLTAgbGVmdC0wIGJnLXNsYXRlLTcwMCBib3JkZXItdCBib3JkZXItciBib3JkZXItc2xhdGUtNjAwIHJvdW5kZWQtdHItbGcgc2hhZG93LXhsIHRyYW5zaXRpb24tYWxsIGR1cmF0aW9uLTMwMCBlYXNlLWluLW91dCBmbGV4IGZsZXgtY29sICR7aXNTdGF0dXNFeHBhbmRlZCA/ICdoLTQ4IHctWzUwMHB4XSBwLTQnIDogJ21pbi1oLVszcmVtXSB3LVszNjBweF0gcHgtMyBweS0yIGZsZXgtcm93IGl0ZW1zLXN0YXJ0IGN1cnNvci1wb2ludGVyIGhvdmVyOmJnLXNsYXRlLTYwMCd9YH1cbiAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+ICFpc1N0YXR1c0V4cGFuZGVkICYmIHNldElzU3RhdHVzRXhwYW5kZWQodHJ1ZSl9XG4gICAgICAgID5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyIHctZnVsbCBtYi0yXCI+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPXtgZm9udC1tb25vIHRleHQtc2xhdGUtMzAwICR7aXNTdGF0dXNFeHBhbmRlZCA/ICd0ZXh0LXNtJyA6ICd0ZXh0LXhzIGJyZWFrLXdvcmRzIHdoaXRlc3BhY2UtcHJlLXdyYXAnfWB9PlxuICAgICAgICAgICAgICAgICAgICB7c3RhdGUuc3RhdHVzTWVzc2FnZSB8fCBcIlJlYWR5XCJ9XG4gICAgICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgICAgIHtpc1N0YXR1c0V4cGFuZGVkICYmIChcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvblxuICAgICAgICAgICAgICAgICAgICAgICAgb25DbGljaz17KGUpID0+IHsgZS5zdG9wUHJvcGFnYXRpb24oKTsgc2V0SXNTdGF0dXNFeHBhbmRlZChmYWxzZSk7IH19XG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTQwMCBob3Zlcjp0ZXh0LXdoaXRlXCJcbiAgICAgICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICAgICAg4pyVXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIHtpc1N0YXR1c0V4cGFuZGVkICYmIChcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgtMSBvdmVyZmxvdy15LWF1dG8gbXQtMiB0ZXh0LXhzIHRleHQtc2xhdGUtNDAwIHNwYWNlLXktMVwiPlxuICAgICAgICAgICAgICAgICAgICB7LyogSWYgd2UgaGFkIGEgbWVzc2FnZSBoaXN0b3J5LCB3ZSdkIG1hcCBpdCBoZXJlLiBGb3Igbm93IGp1c3Qgc2hvdyB0aGUgY3VycmVudCBtZXNzYWdlIHdyYXBwZWQuICovfVxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJnLXNsYXRlLTgwMC81MCBwLTIgcm91bmRlZCB3aGl0ZXNwYWNlLXByZS13cmFwIGZvbnQtbW9ub1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAge3N0YXRlLnN0YXR1c01lc3NhZ2UgfHwgXCJTeXN0ZW0gaXMgaWRsZS5cIn1cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICApfVxuICAgICAgICA8L2Rpdj5cblxuICAgICAgICB7LyogUHVzaCBjb250ZW50IHBhc3QgdGhlIHN0YXR1cyBib3ggd2hlbiBjb2xsYXBzZWQgKi99XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibWwtWzM3NXB4XSBmbGV4IGl0ZW1zLWNlbnRlciBzcGFjZS14LTJcIj5cbiAgICAgICAgeyghc3RhdGUuZGF0YVRhYmxlIHx8IHN0YXRlLmRhdGFUYWJsZS5sZW5ndGggPT09IDApICYmIChcbiAgICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBtb2NrRGF0YSA9IFtcbiAgICAgICAgICAgICAgICAgICAgeyBfcm93SW5kZXg6IDEsIHR5cGU6IFwiUElQRVwiLCBlcDE6IHt4OiAwLCB5OiAwLCB6OiAwfSwgZXAyOiB7eDogMTAwMCwgeTogMCwgejogMH0sIGJvcmU6IDEwMCB9LFxuICAgICAgICAgICAgICAgICAgICB7IF9yb3dJbmRleDogMiwgdHlwZTogXCJQSVBFXCIsIGVwMToge3g6IDEwMDUsIHk6IDAsIHo6IDB9LCBlcDI6IHt4OiAyMDAwLCB5OiAwLCB6OiAwfSwgYm9yZTogMTAwIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgX3Jvd0luZGV4OiAzLCB0eXBlOiBcIlRFRVwiLCBlcDE6IHt4OiAyMDAwLCB5OiAwLCB6OiAwfSwgZXAyOiB7eDogMjMwMCwgeTogMCwgejogMH0sIGNwOiB7eDogMjE1MCwgeTogMCwgejogMH0sIGJwOiB7eDogMjE1MCwgeTogMTUwLCB6OiAwfSwgYm9yZTogMTAwLCBicmFuY2hCb3JlOiA1MCB9LFxuICAgICAgICAgICAgICAgICAgICB7IF9yb3dJbmRleDogNCwgdHlwZTogXCJQSVBFXCIsIGVwMToge3g6IDIzMDAsIHk6IDAsIHo6IDB9LCBlcDI6IHt4OiAzMDAwLCB5OiAwLCB6OiAwfSwgYm9yZTogMTAwIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgX3Jvd0luZGV4OiA1LCB0eXBlOiBcIlBJUEVcIiwgZXAxOiB7eDogMjk4MCwgeTogMCwgejogMH0sIGVwMjoge3g6IDQwMDAsIHk6IDAsIHo6IDB9LCBib3JlOiAxMDAgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBfcm93SW5kZXg6IDYsIHR5cGU6IFwiUElQRVwiLCBlcDE6IHt4OiAyMTUwLCB5OiAxNTAsIHo6IDB9LCBlcDI6IHt4OiAyMTUwLCB5OiAxNTQsIHo6IDB9LCBib3JlOiA1MCB9LFxuICAgICAgICAgICAgICAgICAgICB7IF9yb3dJbmRleDogNywgdHlwZTogXCJWQUxWRVwiLCBlcDE6IHt4OiAyMTUwLCB5OiAxNTQsIHo6IDB9LCBlcDI6IHt4OiAyMTUwLCB5OiAzNTQsIHo6IDB9LCBib3JlOiA1MCwgc2tleTogXCJWQkZMXCIgfSxcbiAgICAgICAgICAgICAgICAgIF07XG4gICAgICAgICAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX0RBVEFfVEFCTEVcIiwgcGF5bG9hZDogbW9ja0RhdGEgfSk7XG4gICAgICAgICAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldERhdGFUYWJsZShtb2NrRGF0YSk7XG4gICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICB0aXRsZT1cIkxvYWQgTW9jayBUZXN0IERhdGFcIlxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cInctOCBoLTggZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgYmctaW5kaWdvLTkwMC81MCBob3ZlcjpiZy1pbmRpZ28tODAwIHRleHQtaW5kaWdvLTMwMCByb3VuZGVkIHRyYW5zaXRpb24gYm9yZGVyIGJvcmRlci1pbmRpZ28tNzAwLzUwIHRleHQtYmFzZVwiXG4gICAgICAgICAgICA+XG4gICAgICAgICAgICAgIPCfp6pcbiAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICApfVxuXG4gICAgICAgIHsoYWN0aXZlVGFiID09PSAnZGF0YScgJiYgYWN0aXZlU3RhZ2UgPT09ICcyJykgJiYgKFxuICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHNldFNob3dNb2RhbCh0cnVlKX1cbiAgICAgICAgICAgIGRpc2FibGVkPXshaXNEYXRhTG9hZGVkfVxuICAgICAgICAgICAgY2xhc3NOYW1lPVwicHgtMyBweS0xIGJnLXNsYXRlLTcwMCBob3ZlcjpiZy1zbGF0ZS02MDAgcm91bmRlZCBkaXNhYmxlZDpvcGFjaXR5LTUwIGgtOCBmbGV4IGl0ZW1zLWNlbnRlclwiXG4gICAgICAgICAgPlxuICAgICAgICAgICAgUnVuIFBoYXNlIDEgVmFsaWRhdG9yIChPbmx5IFBpcGUgZmlsbGluZy9UcmltbWluZykg4pa2XG4gICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICl9XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgc3BhY2UteC0yXCI+XG5cbiAgICAgICAgey8qIE9uZS1DbGljayBBdXRvLUZpeCDigJQgYWx3YXlzIHZpc2libGUgd2hlbiBTdGFnZSAyIGRhdGEgaXMgbG9hZGVkICovfVxuICAgICAgICB7aXNEYXRhTG9hZGVkICYmIChcbiAgICAgICAgICA8YnV0dG9uXG4gICAgICAgICAgICBvbkNsaWNrPXtoYW5kbGVPbmVDbGlja0F1dG9GaXh9XG4gICAgICAgICAgICBkaXNhYmxlZD17YXV0b0ZpeFJ1bm5pbmcgfHwgaXNSdW5uaW5nIHx8IGlzQXBwbHlpbmd9XG4gICAgICAgICAgICBjbGFzc05hbWU9XCJweC0zIHB5LTEuNSBiZy1ncmFkaWVudC10by1yIGZyb20tdmlvbGV0LTYwMCB0by1pbmRpZ28tNjAwIGhvdmVyOmZyb20tdmlvbGV0LTUwMCBob3Zlcjp0by1pbmRpZ28tNTAwIHRleHQtd2hpdGUgcm91bmRlZCBmb250LWJvbGQgc2hhZG93LXNtIGRpc2FibGVkOm9wYWNpdHktNTAgdHJhbnNpdGlvbi1hbGwgdGV4dC1zbSBmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMS41IGJvcmRlciBib3JkZXItdmlvbGV0LTcwMC80MFwiXG4gICAgICAgICAgICB0aXRsZT1cIkF1dG9tYXRpY2FsbHkgcnVuIGFsbCBzdGFnZXM6IERhdGFQcm9jZXNzb3Ig4oaSIFZhbGlkYXRpb24g4oaSIFNtYXJ0IEZpeCDihpIgQXBwbHkgVGllciAxLzIuIFRpZXIgMyBpdGVtcyB3aWxsIG5lZWQgbWFudWFsIHJldmlldy5cIlxuICAgICAgICAgID5cbiAgICAgICAgICAgIHthdXRvRml4UnVubmluZyA/IChcbiAgICAgICAgICAgICAgPD48c3BhbiBjbGFzc05hbWU9XCJhbmltYXRlLXNwaW4gaW5saW5lLWJsb2NrXCI+4pqZPC9zcGFuPiBSdW5uaW5n4oCmPC8+XG4gICAgICAgICAgICApIDogKFxuICAgICAgICAgICAgICA8PjxzcGFuPuKaoTwvc3Bhbj4gT25lLUNsaWNrIEF1dG8tRml4PC8+XG4gICAgICAgICAgICApfVxuICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICApfVxuXG4gICAgICAgIHsvKiBPbmx5IHNob3cgdGhlc2UgYWN0aW9uIGJ1dHRvbnMgaW4gU3RhZ2UgMiAqL31cbiAgICAgICAgeyhhY3RpdmVUYWIgPT09ICdkYXRhJyAmJiBhY3RpdmVTdGFnZSA9PT0gJzInKSAmJiAoXG4gICAgICAgICAgICA8PlxuXG4gICAgICAgICAgICAgICAgPGJ1dHRvblxuICAgICAgICAgICAgICAgICAgb25DbGljaz17KCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiVU5ET19GSVhFU1wiIH0pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUuaGlzdG9yeS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJldlRhYmxlID0gc3RhdGUuaGlzdG9yeVtzdGF0ZS5oaXN0b3J5Lmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICAgIHNldFp1c3RhbmREYXRhKHByZXZUYWJsZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgICBkaXNhYmxlZD17c3RhdGUuaGlzdG9yeS5sZW5ndGggPT09IDB9XG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJweC00IHB5LTEuNSBiZy15ZWxsb3ctNjAwIGhvdmVyOmJnLXllbGxvdy01MDAgcm91bmRlZCBmb250LW1lZGl1bSBkaXNhYmxlZDpvcGFjaXR5LTUwIHRyYW5zaXRpb24tY29sb3JzIHRleHQtd2hpdGUgaC1mdWxsXCJcbiAgICAgICAgICAgICAgICAgIHRpdGxlPVwiVW5kbyBsYXN0IGFwcGxpZWQgZml4ZXNcIlxuICAgICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICAgIOKGtiBVbmRvXG4gICAgICAgICAgICAgICAgPC9idXR0b24+XG5cbiAgICAgICAgICAgICAgICA8YnV0dG9uXG4gICAgICAgICAgICAgICAgICBvbkNsaWNrPXtoYW5kbGVTbWFydEZpeH1cbiAgICAgICAgICAgICAgICAgIGRpc2FibGVkPXshY2FuUnVuU21hcnRGaXh9XG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJweC00IHB5LTEuNSBiZy1ibHVlLTYwMCBob3ZlcjpiZy1ibHVlLTUwMCByb3VuZGVkIGZvbnQtbWVkaXVtIGRpc2FibGVkOm9wYWNpdHktNTAgdHJhbnNpdGlvbi1jb2xvcnMgaC1mdWxsXCJcbiAgICAgICAgICAgICAgICAgIHRpdGxlPXshaXNWYWxpZGF0aW9uRG9uZSA/IFwiUnVuIFBoYXNlIDEgVmFsaWRhdG9yIGZpcnN0XCIgOiBoYXNSdW5TbWFydEZpeCA/IFwiU21hcnQgRml4IGFscmVhZHkgZXhlY3V0ZWRcIiA6IFwiQW5hbHlzZSBkYXRhIGFuZCBnZW5lcmF0ZSBmaXggcHJvcG9zYWxzXCJ9XG4gICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAge2lzUnVubmluZyA/IFwiQW5hbHl6aW5nLi4uXCIgOiBcIlNtYXJ0IEZpeCDwn5SnXCJ9XG4gICAgICAgICAgICAgICAgPC9idXR0b24+XG5cbiAgICAgICAgICAgICAgICA8YnV0dG9uXG4gICAgICAgICAgICAgICAgICBvbkNsaWNrPXtoYW5kbGVBcHBseUZpeGVzfVxuICAgICAgICAgICAgICAgICAgZGlzYWJsZWQ9eyFjYW5BcHBseUZpeGVzfVxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwicHgtNCBweS0xLjUgYmctZ3JlZW4tNjAwIGhvdmVyOmJnLWdyZWVuLTUwMCByb3VuZGVkIGZvbnQtbWVkaXVtIGRpc2FibGVkOm9wYWNpdHktNTAgdHJhbnNpdGlvbi1jb2xvcnMgaC1mdWxsXCJcbiAgICAgICAgICAgICAgICAgIHRpdGxlPXshaGFzQXBwcm92ZWRGaXhlcyA/IFwiQXBwcm92ZSBhdCBsZWFzdCBvbmUgcHJvcG9zYWwgZmlyc3RcIiA6IFwiQXBwbHkgYWxsIGFwcHJvdmVkIGZpeGVzIHRvIGdlb21ldHJ5XCJ9XG4gICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAge2lzQXBwbHlpbmcgPyBcIkFwcGx5aW5nLi4uXCIgOiBcIkFwcGx5IEZpeGVzIOKck1wifVxuICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuXG4gICAgICAgICAgICAgICAgPGJ1dHRvblxuICAgICAgICAgICAgICAgICAgb25DbGljaz17aGFuZGxlU2Vjb25kUGFzc31cbiAgICAgICAgICAgICAgICAgIGRpc2FibGVkPXshaXNTZWNvbmRQYXNzUmVhZHl9XG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJweC00IHB5LTEuNSBiZy1wdXJwbGUtNjAwIGhvdmVyOmJnLXB1cnBsZS01MDAgcm91bmRlZCBmb250LW1lZGl1bSBkaXNhYmxlZDpvcGFjaXR5LTUwIHRyYW5zaXRpb24tY29sb3JzIGgtZnVsbFwiXG4gICAgICAgICAgICAgICAgICB0aXRsZT17IWlzU2Vjb25kUGFzc1JlYWR5ID8gXCJSdW4gUGhhc2UgMSBWYWxpZGF0b3IgZmlyc3RcIiA6IFwiUnVuIFNlY29uZCBQYXNzIGZvciBub24tUGlwZSBjb21wb25lbnRzXCJ9XG4gICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAg8J+agCBSdW4gU2Vjb25kIFBhc3NcbiAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgIDwvPlxuICAgICAgICApfVxuXG4gICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQtc2xhdGUtNDAwIGZvbnQtbW9ubyB0ZXh0LXhzXCI+e3ZlclN0cmluZ308L3NwYW4+XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgICA8Lz5cbiAgKTtcbn1cbiJdLCJtYXBwaW5ncyI6IkFBQUEsT0FBT0EsS0FBSyxNQUFNLE9BQU87QUFDekIsU0FBU0MsYUFBYSxRQUFRLHdCQUF3QjtBQUN0RCxTQUFTQyxXQUFXLFFBQVEsMkJBQTJCO0FBQ3ZELFNBQVNDLFVBQVUsUUFBUSw0QkFBNEI7QUFDdkQsU0FBU0MsWUFBWSxRQUFRLG9CQUFvQjtBQUNqRCxTQUFTQyxzQkFBc0IsUUFBUSx3QkFBd0I7QUFDL0QsU0FBU0MsZ0JBQWdCLFFBQVEsNEJBQTRCO0FBRTdELFNBQVNDLGlCQUFpQixFQUFFQyxzQkFBc0IsUUFBUSxnQ0FBZ0M7QUFDMUYsU0FBU0MsUUFBUSxRQUFRLHNCQUFzQjtBQUMvQyxTQUFTQyxpQkFBaUIsUUFBUSxpQ0FBaUM7O0FBRW5FO0FBQ0E7QUFBQSxTQUFBQyxHQUFBLElBQUFDLElBQUEsRUFBQUMsSUFBQSxJQUFBQyxLQUFBLEVBQUFDLFFBQUEsSUFBQUMsU0FBQTtBQUNBLE1BQU1DLFVBQVUsR0FBRyxPQUFPQyxNQUFNLEtBQUssV0FBVztBQUVoRCxPQUFPLFNBQVNDLFNBQVNBLENBQUM7RUFBRUMsU0FBUztF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
