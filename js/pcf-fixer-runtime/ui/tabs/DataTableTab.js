import React from 'react';
import { useAppContext } from '../../store/AppContext.js';
import { useStore } from '../../store/useStore.js';
import { runValidationChecklist } from '../../engine/Validator.js';
import { createLogger } from '../../utils/Logger.js';
import { exportToExcel, generatePCFText, parsePCF } from '../../utils/ImportExport.js';

// ---------------------------------------------------------------------------
// Diff View helpers
// ---------------------------------------------------------------------------
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "../../jsx-runtime.js";
const fmtCoordShort = c => c ? `(${c.x?.toFixed(1)}, ${c.y?.toFixed(1)}, ${c.z?.toFixed(1)})` : '—';
const DIFF_FIELDS = ['type', 'bore', 'branchBore', 'ep1', 'ep2', 'cp', 'bp', 'skey'];
function coordEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Math.abs((a.x || 0) - (b.x || 0)) < 0.001 && Math.abs((a.y || 0) - (b.y || 0)) < 0.001 && Math.abs((a.z || 0) - (b.z || 0)) < 0.001;
}
function fieldEqual(a, b, field) {
  const av = a?.[field];
  const bv = b?.[field];
  if (['ep1', 'ep2', 'cp', 'bp'].includes(field)) return coordEqual(av, bv);
  if (av == null && bv == null) return true;
  return String(av ?? '') === String(bv ?? '');
}
function formatFieldValue(row, field) {
  const v = row?.[field];
  if (['ep1', 'ep2', 'cp', 'bp'].includes(field)) return fmtCoordShort(v);
  return v != null ? String(v) : '—';
}
function formatCaDisplayValue(value) {
  if (value === undefined || value === null || value === '') return '—';
  const text = String(value).trim();
  const numericMatch = text.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))/);
  return numericMatch ? numericMatch[1] : text;
}

const IMPORT_TOP_LEVEL_PREFIXES = [
  "ISOGEN-FILES",
  "UNITS-BORE",
  "UNITS-CO-ORDS",
  "UNITS-WEIGHT",
  "UNITS-BOLT-DIA",
  "UNITS-BOLT-LENGTH",
  "PIPELINE-REFERENCE",
  "PROJECT-IDENTIFIER",
  "AREA",
  "DATE-DMY",
  "DATE-MDY",
  "DRAWING-NUMBER",
  "DRAWING-NAME",
  "PROJECT-NAME",
  "ORIGINATING-SYSTEM",
  "PIPING-SPEC",
  "PIPING-CLASS",
  "PIPING_CLASS",
  "RATING",
  "LINENO_KEY",
  "LINE-NO-KEY",
  "LINEKEY",
  "SPOOL",
  "ITEM-CODE",
  "ITEM-DESCRIPTION",
  "FABRICATION-ITEM"
];
function sanitizeImportPcfText(rawText) {
  return String(rawText || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => {
    if (!line.trim()) return true;
    if (/^[\t ]/.test(line)) return true;
    const upper = line.trim().toUpperCase();
    return !IMPORT_TOP_LEVEL_PREFIXES.some(prefix => upper.startsWith(prefix));
  }).join('\n');
}
function extractImportHeaderValue(rawText, prefixes) {
  const lines = String(rawText || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const upper = trimmed.toUpperCase();
    if (!prefixes.some(prefix => upper.startsWith(prefix))) continue;
    const parts = trimmed.split(/\s+/).slice(1);
    if (parts.length === 0) return '';
    if (parts[0].toLowerCase() === 'export') return parts.slice(1).join(' ').trim();
    return parts.join(' ').trim();
  }
  return '';
}
function normalizeImportPoint(point) {
  if (!point || typeof point !== 'object') return point ?? undefined;
  const x = Number(point.x);
  const y = Number(point.y);
  const z = Number(point.z);
  if (!Number.isFinite(x) && !Number.isFinite(y) && !Number.isFinite(z)) return undefined;
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    z: Number.isFinite(z) ? z : 0
  };
}
function normalizeImportCa(row) {
  const ca = {};
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 97, 98].forEach(n => {
    const value = row?.ca?.[n] ?? row?.ca?.[String(n)] ?? row?.[`CA${n}`] ?? row?.[`ca${n}`];
    if (value !== undefined && value !== null && value !== '') {
      ca[n] = value;
    }
  });
  return ca;
}
function parseImportMessageSquare(text, fallbackIndex) {
  const refMatch = String(text || '').match(/RefNo\s*[:=]\s*([^,]+)/i);
  const seqMatch = String(text || '').match(/SeqNo\s*[:=]\s*([^,]+)/i);
  return {
    refNo: refMatch ? refMatch[1].trim() : '',
    csvSeqNo: seqMatch ? seqMatch[1].trim() : String(fallbackIndex)
  };
}
function normalizeImportedRows(rows, metadata, sourceName) {
  return rows.map((row, idx) => {
    const ca = normalizeImportCa(row);
    const caAliases = {};
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 97, 98].forEach(n => {
      if (ca[n] !== undefined) {
        caAliases[`CA${n}`] = ca[n];
        caAliases[`ca${n}`] = ca[n];
      }
    });
    const messageSquare = parseImportMessageSquare(row.text, idx + 1);
    return {
      ...row,
      ...caAliases,
      _rowIndex: idx + 1,
      csvSeqNo: row.csvSeqNo ?? messageSquare.csvSeqNo,
      text: row.text || '',
      refNo: row.refNo ?? messageSquare.refNo,
      pipelineRef: row.pipelineRef ?? metadata.pipelineRef ?? '',
      projectIdentifier: row.projectIdentifier ?? metadata.projectIdentifier ?? '',
      area: row.area ?? metadata.area ?? '',
      PIPING_CLASS: row.PIPING_CLASS ?? metadata.pipingClass ?? row.pipingClass ?? '',
      pipingClass: row.pipingClass ?? metadata.pipingClass ?? row.PIPING_CLASS ?? '',
      RATING: row.RATING ?? metadata.rating ?? row.rating ?? '',
      rating: row.rating ?? metadata.rating ?? row.RATING ?? '',
      LINENO_KEY: row.LINENO_KEY ?? metadata.lineNoKey ?? row.lineNoKey ?? '',
      lineNoKey: row.lineNoKey ?? metadata.lineNoKey ?? row.LINENO_KEY ?? '',
      type: String(row.type || 'UNKNOWN').toUpperCase().trim(),
      bore: Number.isFinite(Number(row.bore)) ? Number(row.bore) : 0,
      branchBore: row.branchBore != null && Number.isFinite(Number(row.branchBore)) ? Number(row.branchBore) : null,
      ep1: normalizeImportPoint(row.ep1),
      ep2: normalizeImportPoint(row.ep2),
      cp: normalizeImportPoint(row.cp),
      bp: normalizeImportPoint(row.bp),
      supportCoor: normalizeImportPoint(row.supportCoor),
      skey: row.skey || '',
      supportName: row.supportName || '',
      supportGuid: row.supportGuid || '',
      wallThick: row.wallThick ?? row.wallThk ?? '',
      wallThk: row.wallThk ?? row.wallThick ?? '',
      diameter: row.diameter ?? undefined,
      bendPtr: row.bendPtr ?? '',
      rigidPtr: row.rigidPtr ?? '',
      intPtr: row.intPtr ?? '',
      ca,
      fixingAction: row.fixingAction || '',
      fixingActionTier: row.fixingActionTier ?? 0,
      fixingActionRuleId: row.fixingActionRuleId || '',
      fixingActionOriginalError: row.fixingActionOriginalError || '',
      _fixApproved: row._fixApproved,
      _passApplied: row._passApplied ?? 0,
      _currentPass: row._currentPass ?? 1,
      _isPassiveFix: row._isPassiveFix ?? false,
      _modified: row._modified ? { ...row._modified } : {},
      _logTags: Array.isArray(row._logTags) ? [...row._logTags] : [],
      _importSource: sourceName
    };
  });
}
function DiffView({
  stage1Data,
  stage2Data
}) {
  const changes = React.useMemo(() => {
    if (!stage1Data?.length || !stage2Data?.length) return [];
    const map1 = Object.fromEntries(stage1Data.map(r => [r._rowIndex, r]));
    const results = [];
    stage2Data.forEach(row2 => {
      const row1 = map1[row2._rowIndex];
      if (!row1) return;
      const changedFields = DIFF_FIELDS.filter(f => !fieldEqual(row1, row2, f));
      if (changedFields.length > 0) {
        results.push({
          row: row2,
          original: row1,
          changedFields
        });
      }
    });
    return results;
  }, [stage1Data, stage2Data]);
  if (changes.length === 0) {
    const renderSortHeader = (key, label, className = "") => _jsx("th", {
      className: `px-3 py-2 text-left font-semibold text-slate-700 border-r border-slate-300 bg-slate-100 cursor-pointer hover:bg-slate-200 select-none ${className}`,
      onClick: () => handleSort(key),
      children: _jsxs("div", {
        className: "flex items-center justify-between",
        children: [_jsx("span", {
          children: label
        }), sortConfig.key === key ? sortConfig.direction === 'asc' ? _jsx("span", {
          className: "text-[10px] ml-1 text-blue-600",
          children: "\u25B2"
        }) : _jsx("span", {
          className: "text-[10px] ml-1 text-blue-600",
          children: "\u25BC"
        }) : _jsx("span", {
          className: "text-[10px] ml-1 text-slate-400 opacity-0 group-hover:opacity-100",
          children: "\u2195"
        })]
      })
    });
    return _jsxs("div", {
      className: "flex flex-col items-center justify-center py-16 text-slate-400",
      children: [_jsx("span", {
        className: "text-4xl mb-3",
        children: "\u2713"
      }), _jsx("p", {
        className: "text-sm",
        children: "No coordinate or attribute changes detected between Stage 1 and Stage 2."
      })]
    });
  }
  const renderSortHeader = (key, label, className = "") => {
    const hasFilter = !!columnFilters[label];
    const canFillDown = FILL_DOWN_HEADERS.has(label);

    return _jsx("th", {
      className: `px-3 py-2 text-left font-semibold text-slate-700 border-r border-slate-300 bg-slate-100 select-none relative ${className}`,
      children: _jsxs("div", {
        className: "flex flex-col items-start gap-1",
        children: [
          _jsxs("div", {
            className: "flex items-center gap-1",
            children: [
              _jsx("span", { className: "cursor-pointer hover:text-blue-600", onClick: () => handleSort(key), children: label }),
              sortConfig.key === key ? sortConfig.direction === 'asc' ? _jsx("span", { className: "text-[10px] ml-1 text-blue-600", children: "\u25B2" }) : _jsx("span", { className: "text-[10px] ml-1 text-blue-600", children: "\u25BC" }) : null,
              _jsx("button", {
                type: "button",
                onClick: (e) => openFilterDropdown(label, e),
                title: "Filter / sort column",
                className: `rounded px-1 text-[10px] ml-2 ${hasFilter ? 'bg-amber-500 text-black' : 'bg-slate-300 text-slate-700 hover:bg-slate-400'}`,
                children: "▼"
              }),
              hasFilter && _jsx("button", {
                type: "button",
                onClick: () => clearFilter(label),
                title: "Clear filter",
                className: "rounded bg-slate-400 px-1 text-[10px] text-white hover:bg-slate-500",
                children: "✕"
              })
            ]
          }),
          canFillDown && _jsx("button", {
            type: "button",
            onClick: () => handleFillDown(label),
            title: "Copy focused/first non-empty value downward into blank visible rows",
            className: "rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-black hover:bg-amber-600",
            children: "Fill Down"
          })
        ]
      })
    });
  };
  return _jsx("div", {
    className: "overflow-auto h-[calc(100vh-18rem)] border rounded shadow-sm bg-white",
    children: _jsxs("table", {
      className: "min-w-max text-xs divide-y divide-slate-200",
      children: [_jsx("thead", {
        className: "bg-slate-100 sticky top-0 z-20 text-slate-600 uppercase text-[10px] tracking-wider",
        children: _jsxs("tr", {
          children: [_jsx("th", {
            className: "px-3 py-2 font-semibold border-r border-slate-300 sticky left-0 bg-slate-100",
            children: "#"
          }), _jsx("th", {
            className: "px-3 py-2 font-semibold border-r border-slate-300 sticky left-[50px] bg-slate-100",
            children: "Type"
          }), _jsx("th", {
            className: "px-3 py-2 font-semibold border-r border-slate-300",
            children: "Field"
          }), _jsx("th", {
            className: "px-3 py-2 font-semibold border-r border-slate-300 bg-red-50/40",
            children: "Original (Stage 1)"
          }), _jsx("th", {
            className: "px-3 py-2 font-semibold border-r border-slate-300 bg-green-50/40",
            children: "Current (Stage 2)"
          }), _jsx("th", {
            className: "px-3 py-2 font-semibold",
            children: "Fixing Action"
          })]
        })
      }), _jsx("tbody", {
        className: "divide-y divide-slate-100",
        children: changes.map(({
          row,
          original,
          changedFields
        }, rowIdx) => changedFields.map((field, fi) => _jsxs("tr", {
          className: "hover:bg-slate-50",
          children: [fi === 0 && _jsxs(_Fragment, {
            children: [_jsx("td", {
              rowSpan: changedFields.length,
              className: "px-3 py-1.5 font-mono border-r border-slate-200 sticky left-0 bg-white font-bold text-slate-700 align-top",
              children: row._rowIndex
            }), _jsx("td", {
              rowSpan: changedFields.length,
              className: "px-3 py-1.5 border-r border-slate-200 sticky left-[50px] bg-white align-top",
              children: _jsx("span", {
                className: "font-semibold px-1.5 py-0.5 rounded text-white text-[10px]",
                style: {
                  backgroundColor: {
                    PIPE: '#3b82f6',
                    VALVE: '#ef4444',
                    FLANGE: '#a855f7',
                    BEND: '#f59e0b',
                    TEE: '#10b981',
                    OLET: '#06b6d4',
                    SUPPORT: '#94a3b8'
                  }[(row.type || '').toUpperCase()] || '#64748b'
                },
                children: row.type || 'UNKNOWN'
              })
            })]
          }), _jsx("td", {
            className: "px-3 py-1.5 border-r border-slate-200 font-mono font-semibold text-slate-500 uppercase",
            children: field
          }), _jsx("td", {
            className: "px-3 py-1.5 border-r border-slate-200 bg-red-50/40 font-mono text-red-700 line-through",
            children: formatFieldValue(original, field)
          }), _jsx("td", {
            className: "px-3 py-1.5 border-r border-slate-200 bg-green-50/40 font-mono text-green-800 font-semibold",
            children: formatFieldValue(row, field)
          }), fi === 0 && _jsx("td", {
            rowSpan: changedFields.length,
            className: "px-3 py-1.5 text-xs text-slate-500 max-w-xs truncate align-top",
            title: row.fixingAction || '',
            children: row.fixingAction ? _jsx("span", {
              className: `inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${row._passApplied ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`,
              children: row._passApplied ? 'Applied' : row.fixingAction.substring(0, 60) + (row.fixingAction.length > 60 ? '…' : '')
            }) : '—'
          })]
        }, `${String(row._rowIndex ?? rowIdx)}-${fi}-${field}`)))
      })]
    })
  });
}

// Column group definitions — each entry is { key, label, cols[] }
const COL_GROUPS = [{
  key: 'identity',
  label: 'Identity',
  cols: ['csvSeqNo', 'text', 'pipelineRef', 'refNo']
}, {
  key: 'geometry',
  label: 'Geometry',
  cols: ['bore', 'ep1', 'ep2', 'cp', 'bp']
}, {
  key: 'support',
  label: 'Support / SKEY',
  cols: ['skey', 'supportCoor', 'supportGuid']
}, {
  key: 'calc',
  label: 'Calculated',
  cols: ['len1', 'axis1', 'len2', 'axis2', 'len3', 'axis3', 'brlen', 'deltaX', 'deltaY', 'deltaZ']
}, {
  key: 'derived',
  label: 'Derived / Ptrs',
  cols: ['diameter', 'wallThick', 'bendPtr', 'rigidPtr', 'intPtr', 'LINENO_KEY', 'RATING', 'PIPING_CLASS']
}, {
  key: 'cas',
  label: 'CA Attrs',
  cols: ['ca']
}];
export function DataTableTab({
  stage = "1"
}) {
  const {
    state,
    dispatch
  } = useAppContext();
  const [filterAction, setFilterAction] = React.useState('ALL');
  const [diffMode, setDiffMode] = React.useState(false);
  const [searchText, setSearchText] = React.useState('');
  // Groups hidden by default: derived, ptrs. CAs are now visible by default.
  const [hiddenGroups, setHiddenGroups] = React.useState(() => new Set());
  const [showColPanel, setShowColPanel] = React.useState(false);
  const [sortConfig, setSortConfig] = React.useState({
    key: '_rowIndex',
    direction: 'asc'
  });
  const [columnFilters, setColumnFilters] = React.useState({});
  const [filterUi, setFilterUi] = React.useState(null);
  const [activeCell, setActiveCell] = React.useState(null);

  const isBlank = (value) => String(value ?? '').trim() === '';

  const FILL_DOWN_HEADERS = new Set([
    'PIPING CLASS', 'RATING', 'LINENO KEY', 'CA1', 'CA2', 'CA3', 'CA4', 'CA5', 'CA6', 'CA7', 'CA8', 'CA9', 'CA10'
  ]);

  function getColVal(row, colName) {
     let val = String(row[colName] ?? '').trim();
     if (colName.startsWith('CA')) {
        const caIndex = colName.replace('CA', '');
        val = String(row[`ca${caIndex}`] ?? row.ca?.[caIndex] ?? '').trim();
     } else if (colName === 'PIPING CLASS') {
        val = String(row.pipingClass ?? '').trim();
     } else if (colName === 'RATING') {
        val = String(row.rating ?? '').trim();
     } else if (colName === 'LINENO KEY') {
        val = String(row.lineNoKey ?? '').trim();
     }
     return val;
  }

  function openFilterDropdown(colName, event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const allValues = Array.from(new Set(dataTable.map(r => getColVal(r, colName)))).sort((a,b) => a.localeCompare(b));
    const existing = columnFilters[colName];
    setFilterUi({
      colName,
      anchorLeft: rect.left,
      anchorTop: rect.bottom + 4,
      search: '',
      selectedValues: new Set(existing ? Array.from(existing) : allValues)
    });
  }

  function applyFilter() {
    if (!filterUi) return;
    setColumnFilters(prev => ({
      ...prev,
      [filterUi.colName]: new Set(filterUi.selectedValues)
    }));
    setFilterUi(null);
  }

  function clearFilter(colName) {
    setColumnFilters(prev => {
      const next = { ...prev };
      delete next[colName];
      return next;
    });
    if (filterUi?.colName === colName) setFilterUi(null);
  }

  function handleFillDown(colName) {
    const filteredVisible = dataTable.map((row, idx) => ({row, originalIndex: idx}))
      .filter(({row}) => {
         return Object.entries(columnFilters).every(([colKey, allowedSet]) => {
           if (!allowedSet || allowedSet.size === 0) return true;
           return allowedSet.has(getColVal(row, colKey));
         });
      });

    if (filteredVisible.length === 0) return;

    let source = null;
    if (activeCell && activeCell.colName === colName) {
      source = filteredVisible.find(e => e.originalIndex === activeCell.rowIndex && !isBlank(getColVal(e.row, colName)));
    }
    if (!source) {
      source = filteredVisible.find(e => !isBlank(getColVal(e.row, colName)));
    }
    if (!source) {
      alert("No value found to fill down from.");
      return;
    }

    const sourceValue = getColVal(source.row, colName);
    let pastSource = false;

    const updatedTable = dataTable.map((row, rowIdx) => {
       const vis = filteredVisible.find(e => e.originalIndex === rowIdx);
       if (!vis) return row; // hidden
       if (rowIdx === source.originalIndex) {
         pastSource = true;
         return row;
       }
       if (!pastSource) return row;
       if (!isBlank(getColVal(row, colName))) return row;

       const updated = { ...row };
       if (colName.startsWith('CA')) {
          const caIndex = colName.replace('CA', '');
          updated[`ca${caIndex}`] = sourceValue;
       } else if (colName === 'PIPING CLASS') {
          updated.pipingClass = sourceValue;
       } else if (colName === 'RATING') {
          updated.rating = sourceValue;
       } else if (colName === 'LINENO KEY') {
          updated.lineNoKey = sourceValue;
       }
       return updated;
    });

    dispatch({ type: "SET_DATA_TABLE", payload: updatedTable });
  }
  const pcfInputRef = React.useRef(null);
  const handleImportPcfClick = () => {
    if (pcfInputRef.current) pcfInputRef.current.click();
  };
  const handleImportPcfChange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rawText = await file.text();
      const metadata = {
        pipelineRef: extractImportHeaderValue(rawText, ["PIPELINE-REFERENCE"]),
        projectIdentifier: extractImportHeaderValue(rawText, ["PROJECT-IDENTIFIER"]),
        area: extractImportHeaderValue(rawText, ["AREA"]),
        pipingClass: extractImportHeaderValue(rawText, ["PIPING-CLASS", "PIPING_CLASS"]),
        rating: extractImportHeaderValue(rawText, ["RATING"]),
        lineNoKey: extractImportHeaderValue(rawText, ["LINENO_KEY", "LINE-NO-KEY", "LINEKEY"])
      };
      const cleanedText = sanitizeImportPcfText(rawText);
      const importFile = cleanedText === rawText ? file : new File([cleanedText], file.name, {
        type: file.type || 'text/plain'
      });
      const parsedRows = await parsePCF(importFile, state.config);
      const importedRows = normalizeImportedRows(parsedRows, metadata, file.name);
      if (!importedRows.length) {
        throw new Error('No component rows were found in the selected PCF.');
      }
      dispatch({
        type: "RESET_ALL"
      });
      useStore.setState({
        pastStates: [],
        futureStates: [],
        history: [],
        historyIdx: -1,
        hiddenElementIds: [],
        multiSelectedIds: [],
        measurePts: [],
        cursorSnapPoint: null,
        selectedElementId: null,
        hoveredElementId: null,
        contextMenu: null
      });
      const store = useStore.getState();
      store.setProposals([]);
      store.setDataTable(importedRows);
      dispatch({
        type: "SET_DATA_TABLE",
        payload: importedRows
      });
      dispatch({
        type: "ADD_LOG",
        payload: {
          type: "Info",
          message: `Imported ${importedRows.length} rows from ${file.name}.`
        }
      });
      dispatch({
        type: "SET_STATUS_MESSAGE",
        payload: `Imported ${importedRows.length} rows from ${file.name}`
      });
      setFilterAction('ALL');
      setSearchText('');
      setDiffMode(false);
      setHiddenGroups(new Set());
      setShowColPanel(false);
      setColumnFilters({});
      setSortConfig({
        key: '_rowIndex',
        direction: 'asc'
      });
    } catch (err) {
      dispatch({
        type: "ADD_LOG",
        payload: {
          type: "Error",
          message: `Failed to import PCF: ${err.message}`
        }
      });
      dispatch({
        type: "SET_STATUS_MESSAGE",
        payload: `Error importing PCF: ${err.message}`
      });
    } finally {
      e.target.value = '';
    }
  };
  const renderImportControls = (buttonClassName, label = 'Import PCF') => _jsxs(_Fragment, {
    children: [_jsxs("button", {
      type: "button",
      onClick: handleImportPcfClick,
      className: buttonClassName,
      children: [_jsx("span", {
        className: "mr-1",
        children: "\u2B07"
      }), label]
    }), _jsx("input", {
      type: "file",
      accept: ".pcf,.txt,text/plain",
      ref: pcfInputRef,
      onChange: handleImportPcfChange,
      style: {
        display: 'none'
      }
    })]
  });
  const handleSort = key => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({
      key,
      direction
    });
  };
  const colVisible = groupKey => !hiddenGroups.has(groupKey);
  const toggleGroup = key => setHiddenGroups(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  let currentData;
  if (stage === "1") currentData = state.dataTable;else if (stage === "2") currentData = state.stage2Data;else if (stage === "3") currentData = state.stage3Data;
  const dataTable = currentData;
  const handleApprove = (rowIndex, approve) => {
    const updatedTable = [...dataTable];
    const rowIdx = updatedTable.findIndex(r => r._rowIndex === rowIndex);
    if (rowIdx > -1) {
      updatedTable[rowIdx] = {
        ...updatedTable[rowIdx],
        _fixApproved: approve
      };
      if (stage === "1") dispatch({
        type: "SET_DATA_TABLE",
        payload: updatedTable
      });
      if (stage === "2") dispatch({
        type: "SET_STAGE_2_DATA",
        payload: updatedTable
      });
      if (stage === "3") dispatch({
        type: "SET_STAGE_3_DATA",
        payload: updatedTable
      });
      const actionText = approve ? 'Approved' : 'Rejected';
      const rowDescription = updatedTable[rowIdx].fixingAction ? updatedTable[rowIdx].fixingAction.substring(0, 50) + "..." : "";
      dispatch({
        type: "ADD_LOG",
        payload: {
          stage: "FIXING",
          type: approve ? "Applied" : "Warning",
          row: rowIndex,
          message: `User ${actionText} Fix: ${rowDescription}`
        }
      });

      // Ensure Zustand proposals match this state so 3D canvas popups turn green
      if (stage === "2") useStore.getState().setProposalStatus(rowIndex, approve);
    }
  };
  const handleAutoApproveAll = (actionType = 'ALL') => {
    const updatedTable = dataTable.map(r => {
      if (actionType === 'REJECT_ALL') {
        if (r.fixingAction && !r.fixingAction.includes('ERROR') && r._fixApproved === undefined) {
          if (stage === "2") useStore.getState().setProposalStatus(r._rowIndex, false);
          return {
            ...r,
            _fixApproved: false
          };
        }
        return r;
      }
      if (r.fixingActionTier && r.fixingActionTier <= 2) {
        const actionMatch = actionType === 'ALL' || r.fixingAction && r.fixingAction.includes(actionType);
        if (actionMatch && r._fixApproved === undefined) {
          if (stage === "2") useStore.getState().setProposalStatus(r._rowIndex, true);
          return {
            ...r,
            _fixApproved: true
          };
        }
      }
      return r;
    });
    const msg = actionType === 'REJECT_ALL' ? "Rejected all pending proposals." : `Approved ${actionType === 'ALL' ? 'all Tier 1/2' : actionType} proposals.`;
    dispatch({
      type: "ADD_LOG",
      payload: {
        stage: "FIXING",
        type: "Info",
        message: msg
      }
    });
    if (stage === "1") dispatch({
      type: "SET_DATA_TABLE",
      payload: updatedTable
    });
    if (stage === "2") dispatch({
      type: "SET_STAGE_2_DATA",
      payload: updatedTable
    });
    if (stage === "3") dispatch({
      type: "SET_STAGE_3_DATA",
      payload: updatedTable
    });
  };
  const handleCalculateMissingGeometry = () => {
    let bendPtr = 0,
      rigidPtr = 0,
      intPtr = 0;
    let updatedItems = {
      bore: 0,
      boreFb: 0,
      cp: 0,
      delta: 0,
      len: 0,
      ptr: 0
    };
    const getAxis = (ep1, ep2) => {
      const dx = ep2.x - ep1.x;
      const dy = ep2.y - ep1.y;
      const dz = ep2.z - ep1.z;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const absZ = Math.abs(dz);
      if (absX > absY && absX > absZ) return dx > 0 ? 'East' : 'West';
      if (absY > absX && absY > absZ) return dy > 0 ? 'Up' : 'Down';
      if (absZ > absX && absZ > absY) return dz > 0 ? 'North' : 'South';
      return 'U';
    };
    const dist = (ep1, ep2) => Math.sqrt((ep2.x - ep1.x) ** 2 + (ep2.y - ep1.y) ** 2 + (ep2.z - ep1.z) ** 2);
    const updatedTable = dataTable.map((row, index, arr) => {
      const r = {
        ...row
      };
      const t = r.type || "";

      // Auto inherit bore from previous row if missing
      if ((!r.bore || r.bore === "") && index > 0) {
        const prev = arr[index - 1];
        if (prev.bore) {
          r.bore = prev.bore;
          r._modified = r._modified || {};
          r._modified.bore = "Inherited";
          updatedItems.bore++;
        }
      }
      // Missing Bore fallback for PIPES
      if ((!r.bore || r.bore === "") && t === "PIPE" && r.ep1 && r.ep2) {
        r.bore = 100;
        r._modified = r._modified || {};
        r._modified.bore = "Fallback";
        updatedItems.boreFb++;
      }
      // Missing CP for TEES
      if (t === "TEE" && (!r.cp || r.cp.x === undefined && r.cp.y === undefined && r.cp.z === undefined || r.cp.x === 0 && r.cp.y === 0 && r.cp.z === 0) && r.ep1 && r.ep2) {
        r.cp = {
          x: (r.ep1.x + r.ep2.x) / 2,
          y: (r.ep1.y + r.ep2.y) / 2,
          z: (r.ep1.z + r.ep2.z) / 2
        };
        r._modified = r._modified || {};
        r._modified.cp = "Calculated Midpoint";
        updatedItems.cp++;
      }

      // Calculate Vector Deltas (Axis) if missing
      if (r.ep1 && r.ep2 && (r.deltaX === undefined || r.deltaY === undefined || r.deltaZ === undefined)) {
        r.deltaX = r.ep2.x - r.ep1.x;
        r.deltaY = r.ep2.y - r.ep1.y;
        r.deltaZ = r.ep2.z - r.ep1.z;
        r._modified = r._modified || {};
        r._modified.deltaX = "Calc";
        updatedItems.delta++;
      }

      // Calculate LEN/AXIS
      if (r.ep1 && r.ep2) {
        if (r.len1 === undefined) {
          r.len1 = dist(r.ep1, r.ep2);
          r.axis1 = getAxis(r.ep1, r.ep2);
          r._modified = r._modified || {};
          r._modified.len1 = "Calc";
          updatedItems.len++;
        }
      }
      if (t === "TEE" && r.cp && r.bp) {
        if (r.brlen === undefined) {
          r.brlen = dist(r.cp, r.bp);
          r._modified = r._modified || {};
          r._modified.brlen = "Calc";
          updatedItems.len++;
        }
      }
      if (t === "BEND" && r.ep1 && r.ep2 && r.cp) {
        if (r.len1 === undefined) {
          r.len1 = dist(r.cp, r.ep1);
          r.axis1 = getAxis(r.cp, r.ep1);
          r._modified = r._modified || {};
          r._modified.len1 = "Calc";
          updatedItems.len++;
        }
        if (r.len2 === undefined) {
          r.len2 = dist(r.cp, r.ep2);
          r.axis2 = getAxis(r.cp, r.ep2);
          r._modified = r._modified || {};
          r._modified.len2 = "Calc";
          updatedItems.len++;
        }
      }

      // Pointers
      if (t === "BEND") {
        if (!r.bendPtr) {
          r.bendPtr = ++bendPtr;
          r._modified = r._modified || {};
          r._modified.bendPtr = "Calc";
          updatedItems.ptr++;
        }
      } else if (t === "FLANGE" || t === "VALVE") {
        if (!r.rigidPtr) {
          r.rigidPtr = ++rigidPtr;
          r._modified = r._modified || {};
          r._modified.rigidPtr = "Calc";
          updatedItems.ptr++;
        }
      } else if (t === "TEE" || t === "OLET") {
        if (!r.intPtr) {
          r.intPtr = ++intPtr;
          r._modified = r._modified || {};
          r._modified.intPtr = "Calc";
          updatedItems.ptr++;
        }
      }

      // Dimensions lookup (mocked or fallback to ca data)
      if (!r.diameter && r.bore) {
        r.diameter = r.bore; // basic approx
        r._modified = r._modified || {};
        r._modified.diameter = "Calc";
      }
      return r;
    });
    if (stage === "1") dispatch({
      type: "SET_DATA_TABLE",
      payload: updatedTable
    });
    if (stage === "2") dispatch({
      type: "SET_STAGE_2_DATA",
      payload: updatedTable
    });
    if (stage === "3") dispatch({
      type: "SET_STAGE_3_DATA",
      payload: updatedTable
    });

    // Trigger a sync so StatusBar knows table changed if needed
    if (stage === "2") window.dispatchEvent(new CustomEvent('zustand-force-sync'));
    const alertLines = [];
    if (updatedItems.bore > 0) alertLines.push(`Bores: ${updatedItems.bore}`);
    if (updatedItems.boreFb > 0) alertLines.push(`Pipe Fallbacks: ${updatedItems.boreFb}`);
    if (updatedItems.cp > 0) alertLines.push(`TEE CPs: ${updatedItems.cp}`);
    if (updatedItems.delta > 0) alertLines.push(`Deltas: ${updatedItems.delta}`);
    if (updatedItems.len > 0) alertLines.push(`Lengths/Axis: ${updatedItems.len}`);
    if (updatedItems.ptr > 0) alertLines.push(`Ptrs: ${updatedItems.ptr}`);
    const msg = alertLines.length > 0 ? `Missing Geo Check: Calculated ${alertLines.join(', ')}` : "Missing Geo Check: No missing geometry found.";
    dispatch({
      type: "SET_STATUS_MESSAGE",
      payload: msg
    });
  };
  const handlePullStage1 = () => {
    // Pulls Data Table from Stage 1 into Stage 2 minus fixingAction
    const stage1Data = state.dataTable.map(r => {
      const newRow = {
        ...r
      };
      delete newRow.fixingAction;
      delete newRow.fixingActionTier;
      delete newRow.fixingActionRuleId;
      delete newRow._fixApproved;
      delete newRow._passApplied;
      return newRow;
    });
    dispatch({
      type: "SET_STAGE_2_DATA",
      payload: stage1Data
    });
    dispatch({
      type: "SET_STATUS_MESSAGE",
      payload: "Successfully pulled Stage 1 data into Stage 2."
    });
  };
  const handleSyntaxFix = () => {
    let capsFixed = 0;
    let zeroFixed = 0;
    const updatedTable = dataTable.map(r => {
      const newRow = {
        ...r
      };
      let actionsTaken = [];
      if (newRow.type && newRow.type !== newRow.type.toUpperCase().trim()) {
        newRow.type = newRow.type.toUpperCase().trim();
        capsFixed++;
        actionsTaken.push("Type Caps");
      }
      if (newRow.skey && newRow.skey !== newRow.skey.toUpperCase().trim()) {
        newRow.skey = newRow.skey.toUpperCase().trim();
        capsFixed++;
        actionsTaken.push("SKEY Caps");
      }
      const isZero = pt => pt && pt.x === 0 && pt.y === 0 && pt.z === 0;
      if (isZero(newRow.ep1)) {
        newRow.ep1 = null;
        zeroFixed++;
        actionsTaken.push("EP1 (0,0,0)");
      }
      if (isZero(newRow.ep2)) {
        newRow.ep2 = null;
        zeroFixed++;
        actionsTaken.push("EP2 (0,0,0)");
      }
      if (isZero(newRow.cp)) {
        newRow.cp = null;
        zeroFixed++;
        actionsTaken.push("CP (0,0,0)");
      }
      if (isZero(newRow.bp)) {
        newRow.bp = null;
        zeroFixed++;
        actionsTaken.push("BP (0,0,0)");
      }
      if (actionsTaken.length > 0) {
        if (r.fixingAction && !r.fixingAction.includes('[Cleared]')) {
          newRow.fixingAction = `${r.fixingAction} — [Cleared] ${actionsTaken.join(', ')}`;
          newRow.fixingActionTier = 1;
        } else if (!r.fixingAction) {
          newRow.fixingAction = `[Cleared] ${actionsTaken.join(', ')}`;
          newRow.fixingActionTier = 1;
        }
      }
      return newRow;
    });
    dispatch({
      type: "SET_DATA_TABLE",
      payload: updatedTable
    });
    dispatch({
      type: "SET_STATUS_MESSAGE",
      payload: `Syntax Fix Complete: Caps Fixed (${capsFixed}), (0,0,0) cleared (${zeroFixed})`
    });
  };
  const handleValidateSyntax = () => {
    const logger = createLogger();
    const results = runValidationChecklist(dataTable, state.config, logger, stage);
    logger.getLog().forEach(entry => dispatch({
      type: "ADD_LOG",
      payload: entry
    }));
    const ruleCounts = {};
    let updatedTable = [...dataTable];
    logger.getLog().forEach(entry => {
      if (entry.ruleId) {
        ruleCounts[entry.ruleId] = (ruleCounts[entry.ruleId] || 0) + 1;
      }
      if (entry.row && entry.tier) {
        const row = updatedTable.find(r => r._rowIndex === entry.row);
        if (row) {
          // Preserve existing proposals if any, otherwise set validation message
          if (!row.fixingAction || row.fixingAction.includes('ERROR') || row.fixingAction.includes('WARNING')) {
            row.fixingAction = entry.message;
            row.fixingActionTier = entry.tier;
            row.fixingActionRuleId = entry.ruleId;
          }
        }
      }
    });
    if (stage === "1") {
      updatedTable = updatedTable.map(r => {
        const row = {
          ...r
        };
        let expectedFixes = [];
        if (row.type && row.type !== row.type.toUpperCase().trim()) expectedFixes.push("Type Caps");
        if (row.skey && row.skey !== row.skey.toUpperCase().trim()) expectedFixes.push("SKEY Caps");
        const isZero = pt => pt && pt.x === 0 && pt.y === 0 && pt.z === 0;
        if (isZero(row.ep1)) expectedFixes.push("EP1 (0,0,0)");
        if (isZero(row.ep2)) expectedFixes.push("EP2 (0,0,0)");
        if (isZero(row.cp)) expectedFixes.push("CP (0,0,0)");
        if (isZero(row.bp)) expectedFixes.push("BP (0,0,0)");
        if (expectedFixes.length > 0) {
          const fixStr = `Clear ${expectedFixes.join(', ')}`;
          if (row.fixingAction && !row.fixingAction.includes('—')) {
            row.fixingAction = `${row.fixingAction} — ${fixStr}`;
          } else if (!row.fixingAction) {
            row.fixingAction = `Syntax Check — ${fixStr}`;
            row.fixingActionTier = 2;
          }
        }
        return row;
      });
    }
    if (stage === "1") dispatch({
      type: "SET_DATA_TABLE",
      payload: updatedTable
    });
    if (stage === "2") dispatch({
      type: "SET_STAGE_2_DATA",
      payload: updatedTable
    });
    if (stage === "3") dispatch({
      type: "SET_STAGE_3_DATA",
      payload: updatedTable
    });
    const summaryText = Object.entries(ruleCounts).map(([rule, count]) => `${rule}(${count})`).join(', ');
    dispatch({
      type: "SET_STATUS_MESSAGE",
      payload: `Validation Complete: ${results.errorCount} Errors, ${results.warnCount} Warnings. Rules: ${summaryText || 'None'}`
    });
  };
  const fixingActionStats = React.useMemo(() => {
    let approvedP1 = 0,
      rejectedP1 = 0,
      pendingP1 = 0;
    let approvedP2 = 0,
      rejectedP2 = 0,
      pendingP2 = 0;
    let errPass1 = 0,
      warnPass1 = 0;
    let errPass2 = 0,
      warnPass2 = 0;
    if (dataTable) {
      dataTable.forEach(r => {
        if (r.fixingAction) {
          const isP2 = r._passApplied === 2 || r._currentPass === 2 || r.fixingAction.includes('[2nd Pass]');
          const isErr = r.fixingActionTier === 4 || r.fixingAction.includes('ERROR');
          const isWarn = r.fixingActionTier === 3 || r.fixingAction.includes('WARNING');

          // Check Validation stats
          if (isP2) {
            if (isErr) errPass2++;
            if (isWarn) warnPass2++;
          } else {
            if (isErr) errPass1++;
            if (isWarn) warnPass1++;
          }

          // Check Action stats
          if (!isErr && !isWarn) {
            if (isP2) {
              if (r._fixApproved === true || r._passApplied === 2) approvedP2++;else if (r._fixApproved === false) rejectedP2++;else pendingP2++;
            } else {
              if (r._fixApproved === true || r._passApplied === 1) approvedP1++;else if (r._fixApproved === false) rejectedP1++;else pendingP1++;
            }
          }
        }
      });
    }
    return {
      approvedP1,
      rejectedP1,
      pendingP1,
      errPass1,
      warnPass1,
      approvedP2,
      rejectedP2,
      pendingP2,
      errPass2,
      warnPass2
    };
  }, [state.dataTable]);
  const filteredDataTable = React.useMemo(() => {
    if (!dataTable) return [];
    let rows = dataTable;
    if (filterAction === 'ERRORS_WARNINGS') rows = rows.filter(r => r.fixingAction && (r.fixingAction.includes('ERROR') || r.fixingAction.includes('WARNING')));else if (filterAction === 'PROPOSALS') rows = rows.filter(r => r.fixingAction && !r.fixingAction.includes('ERROR') && !r.fixingAction.includes('WARNING'));else if (filterAction === 'PENDING') rows = rows.filter(r => r.fixingAction && r._fixApproved === undefined);else if (filterAction === 'APPROVED') rows = rows.filter(r => r._fixApproved === true);else if (filterAction === 'REJECTED') rows = rows.filter(r => r._fixApproved === false);else if (filterAction === 'HAS_FIXING_ACTION') rows = rows.filter(r => r.fixingAction);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      rows = rows.filter(r => {
        // Check plain string fields
        const strFields = [r.type, r.text, r.pipelineRef, r.refNo, r.skey, r.supportGuid, r.fixingAction];
        if (strFields.some(v => v && String(v).toLowerCase().includes(q))) return true;
        // Check bore + numeric
        if (String(r.bore ?? '').includes(q)) return true;
        // Check row index
        if (String(r._rowIndex).includes(q)) return true;
        // Check coords
        const fmtC = c => c ? `${c.x} ${c.y} ${c.z}` : '';
        if ([r.ep1, r.ep2, r.cp, r.bp].some(c => fmtC(c).includes(q))) return true;
        // Check CA values
        if (r.ca && Object.values(r.ca).some(v => String(v ?? '').toLowerCase().includes(q))) return true;
        return false;
      });
    }

    // Column filters
    if (Object.keys(columnFilters).length > 0) {
      rows = rows.filter(r => {
        return Object.entries(columnFilters).every(([colKey, allowedSet]) => {
          if (!allowedSet || allowedSet.size === 0) return true;
          return allowedSet.has(getColVal(r, colKey));
        });
      });
    }

    // Column filters
    if (Object.keys(columnFilters).length > 0) {
      rows = rows.filter(r => {
        for (const [col, val] of Object.entries(columnFilters)) {
          if (!val) continue;
          const cellVal = String(r[col] || '').toLowerCase();
          if (!cellVal.includes(val.toLowerCase())) return false;
        }
        return true;
      });
    }

    // Sort logic
    if (sortConfig.key) {
      rows = [...rows].sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        if (valA == null) valA = '';
        if (valB == null) valB = '';
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        }
        return sortConfig.direction === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
      });
    }
    return rows;
  }, [dataTable, filterAction, searchText]);
  if (stage === "3" && (!currentData || currentData.length === 0)) {
    const renderSortHeader = (key, label, className = "") => _jsx("th", {
      className: `px-3 py-2 text-left font-semibold text-slate-700 border-r border-slate-300 bg-slate-100 cursor-pointer hover:bg-slate-200 select-none ${className}`,
      onClick: () => handleSort(key),
      children: _jsxs("div", {
        className: "flex items-center justify-between",
        children: [_jsx("span", {
          children: label
        }), sortConfig.key === key ? sortConfig.direction === 'asc' ? _jsx("span", {
          className: "text-[10px] ml-1 text-blue-600",
          children: "\u25B2"
        }) : _jsx("span", {
          className: "text-[10px] ml-1 text-blue-600",
          children: "\u25BC"
        }) : _jsx("span", {
          className: "text-[10px] ml-1 text-slate-400 opacity-0 group-hover:opacity-100",
          children: "\u2195"
        })]
      })
    });
    return _jsxs("div", {
      className: "flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-slate-500 p-8",
      children: [_jsx("h2", {
        className: "text-xl font-bold mb-2 text-slate-700",
        children: "Stage 3: Final Checking"
      }), _jsx("p", {
        className: "max-w-xl text-center",
        children: "This is the final validation stage where VXX syntax rules and RXX topological rules are executed one last time before export to ensure no regressions were introduced during Stage 2 fixing."
      }), _jsxs("div", {
        className: "mt-4 flex flex-wrap items-center justify-center gap-2",
        children: [renderImportControls("px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium shadow"), _jsx("button", {
          onClick: () => {
            dispatch({
              type: "SET_STAGE_3_DATA",
              payload: state.stage2Data
            });
          },
          className: "px-4 py-2 bg-blue-600 text-white rounded font-medium shadow",
          children: "Pull Data from Stage 2"
        })]
      })]
    });
  }
  if (!dataTable || dataTable.length === 0) {
    if (stage === "2") {
      const renderSortHeader = (key, label, className = "") => _jsx("th", {
        className: `px-3 py-2 text-left font-semibold text-slate-700 border-r border-slate-300 bg-slate-100 cursor-pointer hover:bg-slate-200 select-none ${className}`,
        onClick: () => handleSort(key),
        children: _jsxs("div", {
          className: "flex items-center justify-between",
          children: [_jsx("span", {
            children: label
          }), sortConfig.key === key ? sortConfig.direction === 'asc' ? _jsx("span", {
            className: "text-[10px] ml-1 text-blue-600",
            children: "\u25B2"
          }) : _jsx("span", {
            className: "text-[10px] ml-1 text-blue-600",
            children: "\u25BC"
          }) : _jsx("span", {
            className: "text-[10px] ml-1 text-slate-400 opacity-0 group-hover:opacity-100",
            children: "\u2195"
          })]
        })
      });
      return _jsxs("div", {
        className: "flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-slate-500 p-8",
        children: [_jsx("h2", {
          className: "text-xl font-bold mb-2 text-slate-700",
          children: "Stage 2: Topology & Fixing"
        }), _jsx("p", {
          className: "max-w-xl text-center mb-6",
          children: "Data for Stage 2 (Topology & Fixing) must be explicitly pulled from Stage 1 after syntax checks are complete."
        }), _jsxs("div", {
          className: "mt-4 flex flex-wrap items-center justify-center gap-2",
          children: [renderImportControls("px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium shadow"), _jsx("button", {
            onClick: handlePullStage1,
            disabled: !state.dataTable || state.dataTable.length === 0,
            className: "px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded font-bold shadow disabled:opacity-50",
            children: "Pull Data from Stage 1"
          })]
        }), (!state.dataTable || state.dataTable.length === 0) && _jsx("p", {
          className: "text-xs mt-2 text-red-500",
          children: "Stage 1 has no data."
        })]
      });
    }
    const renderSortHeader = (key, label, className = "") => _jsx("th", {
      className: `px-3 py-2 text-left font-semibold text-slate-700 border-r border-slate-300 bg-slate-100 cursor-pointer hover:bg-slate-200 select-none ${className}`,
      onClick: () => handleSort(key),
      children: _jsxs("div", {
        className: "flex items-center justify-between",
        children: [_jsx("span", {
          children: label
        }), sortConfig.key === key ? sortConfig.direction === 'asc' ? _jsx("span", {
          className: "text-[10px] ml-1 text-blue-600",
          children: "\u25B2"
        }) : _jsx("span", {
          className: "text-[10px] ml-1 text-blue-600",
          children: "\u25BC"
        }) : _jsx("span", {
          className: "text-[10px] ml-1 text-slate-400 opacity-0 group-hover:opacity-100",
          children: "\u2195"
        })]
      })
    });
    return _jsxs("div", {
      className: "flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-slate-500",
      children: [_jsxs("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        width: "64",
        height: "64",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        className: "mb-4 text-slate-400",
        children: [_jsx("path", {
          d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        }), _jsx("polyline", {
          points: "14 2 14 8 20 8"
        }), _jsx("line", {
          x1: "16",
          y1: "13",
          x2: "8",
          y2: "13"
        }), _jsx("line", {
          x1: "16",
          y1: "17",
          x2: "8",
          y2: "17"
        }), _jsx("polyline", {
          points: "10 9 9 9 8 9"
        })]
      }), _jsx("h2", {
        className: "text-xl font-medium mb-2",
        children: "No Data Loaded"
      }), _jsx("p", {
        className: "max-w-md text-center",
        children: "Import a PCF, CSV, or Excel file using the Import PCF button to populate the Data Table."
      }), _jsxs("div", {
        className: "mt-4",
        children: [renderImportControls("px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium shadow")]
      })]
    });
  }
  const renderFixingAction = row => {
    if (!row.fixingAction) return _jsx("span", {
      className: "text-slate-400",
      children: "\u2014"
    });
    const tierColors = {
      1: {
        bg: "bg-green-50",
        text: "text-green-800",
        border: "border-green-500",
        label: "AUTO T1"
      },
      2: {
        bg: "bg-amber-50",
        text: "text-amber-800",
        border: "border-amber-500",
        label: "FIX T2"
      },
      3: {
        bg: "bg-orange-50",
        text: "text-orange-800",
        border: "border-orange-500",
        label: "REVIEW T3"
      },
      4: {
        bg: "bg-red-50",
        text: "text-red-800",
        border: "border-red-500",
        label: "ERROR T4"
      }
    };
    let colors = tierColors[row.fixingActionTier] || tierColors[3];
    if (row._passApplied > 0) {
      colors = {
        bg: "bg-green-100",
        text: "text-green-900",
        border: "border-green-600",
        label: "FIX APPLIED"
      };
    }

    // Attempt to split into validation warning and proposal/action.
    // E.g., Validator puts "[V2] ERROR...", SmartFixer appends action.
    let validationMsg = row.fixingActionOriginalError || "";
    let actionMsg = row.fixingAction;
    let passPrefix = null;
    if (actionMsg && actionMsg.includes('[1st Pass]')) passPrefix = "[1st Pass]";
    if (actionMsg && actionMsg.includes('[2nd Pass]')) passPrefix = "[2nd Pass]";
    if (actionMsg && actionMsg.includes('[3rd Pass]')) passPrefix = "[3rd Pass]";
    if (actionMsg && actionMsg.includes('[Pass 1]')) passPrefix = "[1st Pass]";
    if (actionMsg && actionMsg.includes('[Pass 2]')) passPrefix = "[2nd Pass]";
    if (actionMsg && actionMsg.includes('[Pass 3A]')) passPrefix = "[3rd Pass]";

    // Check for our explicit multiline format: [Pass X] [Issue] ... \n[Proposal] ...
    const hasExplicitTags = actionMsg.includes('[Issue]') && actionMsg.includes('[Proposal]');
    if (hasExplicitTags) {
      const parts = actionMsg.split('\n[Proposal]');
      validationMsg = parts[0].replace(/^\[(\d+(st|nd|rd)?\s*Pass|Pass\s*\w+)\]\s*/i, '').replace('[Issue]', '').trim();
      actionMsg = parts[1] ? parts[1].trim() : "";
    } else if (!row.fixingActionOriginalError && (row.fixingAction.includes('ERROR') || row.fixingAction.includes('WARNING') || row.fixingAction.includes('Syntax Check'))) {
      // It's primarily a validation message or it hasn't been split yet
      if (row.fixingAction.includes('—')) {
        const parts = row.fixingAction.split('—');
        validationMsg = parts[0].trim();
        actionMsg = parts.slice(1).join('—').trim();

        // Check if actionMsg duplicates validationMsg (e.g. Cleared message)
        if (validationMsg.includes(actionMsg) || actionMsg.includes(validationMsg) || validationMsg.replace(/[^a-zA-Z0-9]/g, '') === actionMsg.replace(/[^a-zA-Z0-9]/g, '')) {
          actionMsg = ""; // Prevent duplication
        }
      } else {
        validationMsg = row.fixingAction;
        actionMsg = "";
      }
    }
    if (actionMsg) {
      // Remove existing standard score patterns e.g. (Score: 10)
      actionMsg = actionMsg.replace(/\(Score:\s*[\d.]+\)/g, '').trim();
      // Catch inline 'Score 8 < 10' format that was persisting
      actionMsg = actionMsg.replace(/Score\s*[\d.]+(\s*<\s*\d+)?/gi, '').trim();
      // Catch trailing [Pass X] that could be left over
      actionMsg = actionMsg.replace(/\[Pass\s*\d+A?\]/gi, '').trim();
      // Catch cases where [Pass X] was right next to the score (e.g. Score 8[Pass 1])
      actionMsg = actionMsg.replace(/\(?(Score|score)?\s*:?\s*\d+(\.\d+)?\s*(<\s*\d+)?\s*\[Pass\s*\d+A?\]\)?/gi, '').trim();
      // Catch any trailing dots or dashes from previous replaces
      actionMsg = actionMsg.replace(/^[-\s]+|[-\s]+$/g, '').trim();
      if (!hasExplicitTags) {
        actionMsg = actionMsg.replace(/^\[(\d+(st|nd|rd)?\s*Pass|Pass\s*\w+)\]\s*/i, '').trim();
        const splitIdx = actionMsg.indexOf(':');
        if (splitIdx > -1 && splitIdx < 30) {
          actionMsg = actionMsg.substring(splitIdx + 1).trim();
        }
      }
    }
    if (!passPrefix) {
      passPrefix = row._passApplied === 2 || row.fixingAction && row.fixingAction.includes('[Pass 2]') ? "[2nd Pass]" : "[1st Pass]";
    }

    // Final clean up for validationMsg
    if (validationMsg) {
      validationMsg = validationMsg.replace(/^\[(\d+(st|nd|rd)?\s*Pass|Pass\s*\w+)\]\s*/i, '').replace('[Issue]', '').trim();
      // Catch trailing pass identifiers
      validationMsg = validationMsg.replace(/\[(\d+(st|nd|rd)?\s*Pass|Pass\s*\d+A?)\]/gi, '').trim();
    }
    const renderSortHeader = (key, label, className = "") => _jsx("th", {
      className: `px-3 py-2 text-left font-semibold text-slate-700 border-r border-slate-300 bg-slate-100 cursor-pointer hover:bg-slate-200 select-none ${className}`,
      onClick: () => handleSort(key),
      children: _jsxs("div", {
        className: "flex items-center justify-between",
        children: [_jsx("span", {
          children: label
        }), sortConfig.key === key ? sortConfig.direction === 'asc' ? _jsx("span", {
          className: "text-[10px] ml-1 text-blue-600",
          children: "\u25B2"
        }) : _jsx("span", {
          className: "text-[10px] ml-1 text-blue-600",
          children: "\u25BC"
        }) : _jsx("span", {
          className: "text-[10px] ml-1 text-slate-400 opacity-0 group-hover:opacity-100",
          children: "\u2195"
        })]
      })
    });
    return _jsxs("div", {
      className: `${colors.bg} ${colors.text} border-l-4 ${colors.border} p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap rounded-r shadow-sm min-w-[280px]`,
      children: [_jsxs("div", {
        className: "font-semibold mb-1 flex items-start flex-col",
        children: [stage !== "1" && _jsx("span", {
          className: "text-slate-600 mb-1 whitespace-nowrap",
          children: passPrefix
        }), _jsxs("div", {
          className: "flex-1 w-full",
          children: [validationMsg && stage !== "1" && _jsx("span", {
            className: "text-slate-500 mr-1 font-bold",
            children: "[Issue]"
          }), _jsx("span", {
            className: "font-normal",
            children: validationMsg
          })]
        })]
      }), actionMsg && _jsxs("div", {
        className: `mt-1`,
        children: [_jsx("span", {
          className: "font-bold mr-1 text-slate-500",
          children: row._passApplied > 0 ? "[Action Taken]" : "[Proposal]"
        }), _jsx("span", {
          className: `font-normal ${row._fixApproved === false ? "line-through opacity-70 text-blue-600" : ""}`,
          children: actionMsg
        })]
      }), stage !== "1" && row._passApplied === undefined && !row._isPassiveFix && actionMsg && _jsx("div", {
        className: "flex space-x-2 mt-2 items-center flex-wrap gap-y-1",
        children: row._fixApproved === true ? _jsx("span", {
          className: "text-green-600 font-bold flex items-center bg-green-50 px-2 py-1 rounded border border-green-200",
          children: "\u2713 Approved"
        }) : row._fixApproved === false ? _jsx("span", {
          className: "text-red-600 font-bold flex items-center bg-red-50 px-2 py-1 rounded border border-red-200",
          children: "\u2717 Rejected"
        }) : _jsxs(_Fragment, {
          children: [_jsxs("button", {
            onClick: () => handleApprove(row._rowIndex, true),
            className: `px-2 py-1 text-xs rounded shadow-sm transition-colors bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 flex items-center font-medium`,
            children: [_jsx("span", {
              className: "text-green-600 mr-1 font-bold",
              children: "\u2713"
            }), " Approve"]
          }), _jsxs("button", {
            onClick: () => handleApprove(row._rowIndex, false),
            className: `px-2 py-1 text-xs rounded shadow-sm transition-colors bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 flex items-center font-medium`,
            children: [_jsx("span", {
              className: "text-red-600 mr-1 font-bold",
              children: "\u2717"
            }), " Reject ", row.fixingActionScore !== undefined && `(Score ${Math.round(row.fixingActionScore)}${row.fixingActionScore < 10 ? ' < 10' : ''})`]
          })]
        })
      })]
    });
  };
  const fmtCoord = c => c ? `${c.x?.toFixed(1)}, ${c.y?.toFixed(1)}, ${c.z?.toFixed(1)}` : '—';
  const getCellClass = (row, field) => {
    if (row._modified && row._modified[field]) {
      // Color coding based on pass
      if (row._passApplied === 1) return 'bg-cyan-50 text-cyan-800 font-semibold';
      if (row._passApplied === 2) return 'bg-purple-50 text-purple-800 font-semibold';
      return 'bg-cyan-50 text-cyan-800 font-semibold';
    }
    if (row._modified && row._modified[field]) return 'bg-cyan-50 text-cyan-800 font-semibold';
    return 'text-slate-600';
  };
  const renderSortHeader = (key, label, className = "") => _jsx("th", {
    className: `px-3 py-2 text-left font-semibold text-slate-700 border-r border-slate-300 bg-slate-100 cursor-pointer hover:bg-slate-200 select-none ${className}`,
    onClick: () => handleSort(key),
    children: _jsxs("div", {
      className: "flex items-center justify-between",
      children: [_jsx("span", {
        children: label
      }), sortConfig.key === key ? sortConfig.direction === 'asc' ? _jsx("span", {
        className: "text-[10px] ml-1 text-blue-600",
        children: "\u25B2"
      }) : _jsx("span", {
        className: "text-[10px] ml-1 text-blue-600",
        children: "\u25BC"
      }) : _jsx("span", {
        className: "text-[10px] ml-1 text-slate-400 opacity-0 group-hover:opacity-100",
        children: "\u2195"
      })]
    })
  });
  return _jsxs(_Fragment, {
    children: [filterUi && _jsxs("div", {
        className: "fixed z-50 w-64 rounded border border-slate-700 bg-slate-900 p-2 shadow-xl text-slate-200",
        style: { left: filterUi.anchorLeft, top: filterUi.anchorTop },
        children: [
          _jsxs("div", {
            className: "mb-2 flex items-center justify-between",
            children: [
              _jsxs("strong", { className: "text-xs", children: ["Filter: ", filterUi.colName] }),
              _jsx("button", { type: "button", onClick: () => setFilterUi(null), className: "text-xs text-slate-400 hover:text-white", children: "✕" })
            ]
          }),
          _jsx("input", {
            value: filterUi.search,
            onChange: e => setFilterUi(prev => ({ ...prev, search: e.target.value })),
            placeholder: "Search values...",
            className: "mb-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
          }),
          _jsxs("div", {
            className: "mb-2 flex gap-1",
            children: [
              _jsx("button", {
                type: "button",
                className: "rounded bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs",
                onClick: () => setFilterUi(prev => ({ ...prev, selectedValues: new Set(dataTable.map(row => getColVal(row, prev.colName))) })),
                children: "All"
              }),
              _jsx("button", {
                type: "button",
                className: "rounded bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs",
                onClick: () => setFilterUi(prev => ({ ...prev, selectedValues: new Set() })),
                children: "None"
              })
            ]
          }),
          _jsx("div", {
            className: "max-h-56 overflow-auto rounded border border-slate-800",
            children: Array.from(new Set(dataTable.map(r => getColVal(r, filterUi.colName))))
              .sort((a,b) => a.localeCompare(b))
              .filter(v => !filterUi.search.trim() || v.toLowerCase().includes(filterUi.search.trim().toLowerCase()))
              .map(value => {
                const label = value || '(blank)';
                const checked = filterUi.selectedValues.has(value);
                return _jsxs("label", {
                  key: value || '__blank__',
                  className: "flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-slate-800",
                  children: [
                    _jsx("input", {
                      type: "checkbox",
                      checked: checked,
                      onChange: e => setFilterUi(prev => {
                        const next = new Set(prev.selectedValues);
                        if (e.target.checked) next.add(value); else next.delete(value);
                        return { ...prev, selectedValues: next };
                      })
                    }),
                    _jsx("span", { children: label })
                  ]
                });
              })
          }),
          _jsxs("div", {
            className: "mt-2 flex justify-end gap-2",
            children: [
              _jsx("button", { type: "button", onClick: () => clearFilter(filterUi.colName), className: "rounded bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs", children: "Clear" }),
              _jsx("button", { type: "button", onClick: applyFilter, className: "rounded bg-amber-500 hover:bg-amber-600 px-2 py-1 text-xs font-semibold text-black", children: "Apply" })
            ]
          })
        ]
      }),
      _jsxs("div", {
      className: "mb-2 flex flex-col xl:flex-row justify-between xl:items-end gap-2",
      children: [_jsx("div", {
        className: "flex flex-col gap-1 text-xs font-medium w-full xl:w-auto",
        children: stage !== "1" && _jsxs(_Fragment, {
          children: [_jsxs("div", {
            className: "flex flex-wrap gap-2 mb-1",
            children: [_jsxs("div", {
              className: "text-slate-600 bg-slate-100 px-3 py-1 rounded border border-slate-200 shadow-sm flex items-center",
              children: ["Validation [Pass 1]:", _jsxs("span", {
                className: "text-red-600 ml-2 font-bold",
                children: ["Errors(", fixingActionStats.errPass1, ")"]
              }), ",", _jsxs("span", {
                className: "text-orange-500 ml-2 font-bold",
                children: ["Warnings(", fixingActionStats.warnPass1, ")"]
              })]
            }), _jsxs("div", {
              className: "text-slate-600 bg-indigo-50 px-3 py-1 rounded border border-indigo-200 shadow-sm flex items-center",
              children: ["Smart Fixing Action [Pass 1]:", _jsxs("span", {
                className: "text-green-600 ml-2 font-bold",
                children: ["Approved(", fixingActionStats.approvedP1, ")"]
              }), ",", _jsxs("span", {
                className: "text-slate-500 ml-2 font-bold",
                children: ["Rejected(", fixingActionStats.rejectedP1, ")"]
              }), ",", _jsxs("span", {
                className: "text-amber-600 ml-2 font-bold",
                children: ["Pending(", fixingActionStats.pendingP1, ")"]
              })]
            })]
          }), (fixingActionStats.errPass2 > 0 || fixingActionStats.warnPass2 > 0 || fixingActionStats.approvedP2 > 0 || fixingActionStats.pendingP2 > 0) && _jsxs("div", {
            className: "flex flex-wrap gap-2",
            children: [_jsxs("div", {
              className: "text-slate-600 bg-slate-100 px-3 py-1 rounded border border-slate-200 shadow-sm flex items-center",
              children: ["Validation [Pass 2]:", _jsxs("span", {
                className: "text-red-600 ml-2 font-bold",
                children: ["Errors(", fixingActionStats.errPass2, ")"]
              }), ",", _jsxs("span", {
                className: "text-orange-500 ml-2 font-bold",
                children: ["Warnings(", fixingActionStats.warnPass2, ")"]
              })]
            }), _jsxs("div", {
              className: "text-slate-600 bg-purple-50 px-3 py-1 rounded border border-purple-200 shadow-sm flex items-center",
              children: ["Smart Fixing Action [Pass 2]:", _jsxs("span", {
                className: "text-green-600 ml-2 font-bold",
                children: ["Approved(", fixingActionStats.approvedP2, ")"]
              }), ",", _jsxs("span", {
                className: "text-slate-500 ml-2 font-bold",
                children: ["Rejected(", fixingActionStats.rejectedP2, ")"]
              }), ",", _jsxs("span", {
                className: "text-amber-600 ml-2 font-bold",
                children: ["Pending(", fixingActionStats.pendingP2, ")"]
              })]
            })]
          })]
        })
      }), _jsxs("div", {
        className: "flex flex-wrap items-center gap-2 bg-white px-2 py-1 rounded border border-slate-300 shadow-sm",
        children: [renderImportControls("px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold border border-emerald-700 transition-all shadow-sm whitespace-nowrap"), stage === "2" && _jsx("button", {
          onClick: handlePullStage1,
          className: "px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded text-xs font-bold border border-amber-200 transition-all shadow-sm mr-2 whitespace-nowrap",
          children: "\uD83D\uDCE5 Pull from Stage 1"
        }), stage !== "1" && _jsxs("div", {
          className: "flex items-center space-x-2 border-r border-slate-200 pr-3 mr-1",
          children: [_jsx("span", {
            className: "text-xs font-semibold text-slate-500 uppercase tracking-wider",
            children: "FILTER:"
          }), _jsxs("select", {
            value: filterAction,
            onChange: e => setFilterAction(e.target.value),
            className: "text-sm bg-slate-50 text-slate-700 border-none outline-none cursor-pointer py-1 px-1 rounded font-medium",
            children: [_jsx("option", {
              value: "ALL",
              children: "All Rows"
            }), _jsx("option", {
              value: "HAS_FIXING_ACTION",
              children: "Has Fixing Action"
            }), _jsx("option", {
              value: "ERRORS_WARNINGS",
              children: "Errors & Warnings"
            }), _jsx("option", {
              value: "PROPOSALS",
              children: "Smart Fix Proposals"
            }), _jsx("option", {
              value: "PENDING",
              children: "Pending Approval"
            }), _jsx("option", {
              value: "APPROVED",
              children: "Approved"
            }), _jsx("option", {
              value: "REJECTED",
              children: "Rejected"
            })]
          })]
        }), _jsxs("div", {
          className: "flex items-center space-x-1",
          children: [_jsx("span", {
            className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1 hidden md:inline-block",
            children: "Tools:"
          }), stage === "1" && _jsxs(_Fragment, {
            children: [_jsxs("button", {
              onClick: handleCalculateMissingGeometry,
              className: "px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded text-xs font-semibold border border-transparent hover:border-blue-200 transition-all shadow-sm mr-1",
              title: "Calculate missing bores, midpoints, and vectors",
              children: [_jsx("span", {
                className: "mr-1",
                children: "\uD83D\uDCD0"
              }), "Calc Missing Geo"]
            }), _jsxs("button", {
              onClick: handleValidateSyntax,
              className: "px-2.5 py-1 bg-white hover:bg-teal-50 text-slate-600 hover:text-teal-700 rounded text-xs font-semibold border border-transparent hover:border-teal-200 transition-all shadow-sm mr-1",
              title: "Run strict Data Table validation checks",
              children: [_jsx("span", {
                className: "mr-1",
                children: "\uD83D\uDEE1\uFE0F"
              }), "Check Syntax"]
            }), _jsxs("button", {
              onClick: handleSyntaxFix,
              className: "px-2.5 py-1 bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 rounded text-xs font-semibold border border-transparent hover:border-indigo-200 transition-all shadow-sm",
              title: "Standardize strings and fix basic syntax errors",
              children: [_jsx("span", {
                className: "mr-1",
                children: "\uD83D\uDD27"
              }), "Syntax Fix"]
            })]
          }), (stage === "2" || stage === "3") && _jsxs(_Fragment, {
            children: [_jsxs("button", {
              disabled: true,
              className: "px-2.5 py-1 bg-slate-50 text-slate-400 rounded text-xs font-semibold border border-slate-200 shadow-sm opacity-50 cursor-not-allowed",
              title: "Run strict Data Table validation checks",
              children: [_jsx("span", {
                className: "mr-1 opacity-50",
                children: "\uD83D\uDEE1\uFE0F"
              }), "Validate Rules"]
            }), _jsxs("button", {
              disabled: true,
              className: "px-2.5 py-1 bg-slate-50 text-slate-400 rounded text-xs font-semibold border border-slate-200 shadow-sm opacity-50 cursor-not-allowed",
              title: "Acknowledge and dismiss all current warnings",
              children: [_jsx("span", {
                className: "mr-1 opacity-50",
                children: "\uD83D\uDC41\uFE0F\u200D\uD83D\uDDE8\uFE0F"
              }), "Ignore Warnings"]
            }), _jsxs("div", {
              className: "flex items-center ml-2 border border-indigo-200 rounded shadow-sm bg-indigo-50 h-6",
              children: [_jsxs("button", {
                onClick: () => handleAutoApproveAll('ALL'),
                className: "px-2.5 py-1 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all border-r border-indigo-200 h-full flex items-center",
                title: "Approve all Tier 1/2 automated fixes",
                children: [_jsx("span", {
                  className: "mr-1",
                  children: "\u26A1"
                }), "Approve All"]
              }), _jsxs("select", {
                onChange: e => {
                  if (e.target.value) {
                    handleAutoApproveAll(e.target.value);
                    e.target.value = ""; // reset after action
                  }
                },
                className: "bg-transparent text-indigo-700 text-[10px] font-bold px-1 outline-none cursor-pointer h-full border-0",
                children: [_jsx("option", {
                  value: "",
                  disabled: true,
                  children: "Batch Actions..."
                }), _jsx("option", {
                  value: "GAP_FILL",
                  children: "Approve GAP_FILL"
                }), _jsx("option", {
                  value: "GAP_SNAP_IMMUTABLE_BLOCK",
                  children: "Approve GAP_SNAP"
                }), _jsx("option", {
                  value: "SYNTHESIZE_VALVE",
                  children: "Approve Valves"
                }), _jsx("option", {
                  value: "REJECT_ALL",
                  children: "Reject All Proposals"
                })]
              })]
            }), _jsxs("button", {
              onClick: () => setDiffMode(d => !d),
              className: `px-2.5 py-1 rounded text-xs font-bold border transition-all shadow-sm ml-2 ${diffMode ? 'bg-violet-600 text-white border-violet-700' : 'bg-violet-50 hover:bg-violet-100 text-violet-700 border-violet-200'}`,
              title: "Toggle side-by-side diff view showing Stage 1 original vs Stage 2 changes",
              children: [_jsx("span", {
                className: "mr-1",
                children: "\u27FA"
              }), "Diff View"]
            }), _jsxs("button", {
              onClick: () => {
                const proposals = useStore.getState().proposals || [];
                const diagData = {
                  timestamp: new Date().toISOString(),
                  totalProposals: proposals.length,
                  proposals
                };
                const blob = new Blob([JSON.stringify(diagData, null, 2)], {
                  type: 'application/json'
                });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'smart_fixer_diagnostics.json';
                a.click();
                window.URL.revokeObjectURL(url);
              },
              className: "px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded text-[10px] font-bold border border-slate-300 transition-all shadow-sm ml-2",
              title: "Export Solver Diagnostics JSON",
              children: [_jsx("span", {
                children: "\uD83D\uDCC4"
              }), " Export Diag"]
            })]
          }), stage === "3" && _jsxs(_Fragment, {
            children: [_jsx("button", {
              onClick: async () => {
                try {
                  await exportToExcel(dataTable);
                  dispatch({
                    type: "ADD_LOG",
                    payload: {
                      type: "Info",
                      message: "Exported Data Table to Excel."
                    }
                  });
                } catch (err) {
                  dispatch({
                    type: "SET_STATUS_MESSAGE",
                    payload: "Error exporting Excel: " + err.message
                  });
                }
              },
              className: "px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded text-xs font-bold border border-slate-900 transition-all shadow-sm ml-2",
              children: "Export Data Table \u2193"
            }), _jsx("button", {
              onClick: () => {
                const text = generatePCFText(dataTable, state.config);
                const blob = new Blob([text], {
                  type: 'text/plain'
                });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'export.pcf';
                a.click();
                window.URL.revokeObjectURL(url);
                dispatch({
                  type: "ADD_LOG",
                  payload: {
                    type: "Info",
                    message: "Exported PCF file."
                  }
                });
              },
              className: "px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded text-xs font-bold border border-slate-900 transition-all shadow-sm ml-1",
              children: "Export PCF \u2193"
            }), _jsx("button", {
              onClick: () => {
                const evt = new CustomEvent('pcf-push-to-2dcsv', { detail: dataTable });
                window.dispatchEvent(evt);
                alert("Pushed " + dataTable.length + " rows to Ray Concept 2D CSV");
              },
              title: "Push current rows back to Ray Concept Tab as Final 2D CSV",
              className: "px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold transition-colors shadow ml-2",
              children: "Push to Final 2D CSV"
            })]
          })]
        })]
      }), _jsxs("div", {
        className: "flex items-center gap-2 flex-wrap mt-2 bg-slate-50 border border-slate-200 rounded px-2 py-1.5",
        children: [_jsxs("div", {
          className: "flex items-center gap-1.5 flex-1 min-w-[180px]",
          children: [_jsxs("svg", {
            className: "w-3.5 h-3.5 text-slate-400 shrink-0",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            children: [_jsx("circle", {
              cx: "11",
              cy: "11",
              r: "8"
            }), _jsx("path", {
              d: "m21 21-4.3-4.3"
            })]
          }), _jsx("input", {
            type: "text",
            value: searchText,
            onChange: e => setSearchText(e.target.value),
            placeholder: "Search rows\u2026",
            className: "flex-1 text-xs border-0 bg-transparent outline-none text-slate-700 placeholder-slate-400"
          }), searchText && _jsx("button", {
            onClick: () => setSearchText(''),
            className: "text-slate-400 hover:text-slate-600 text-xs font-bold",
            children: "\u2715"
          })]
        }), _jsxs("div", {
          className: "relative",
          children: [_jsxs("button", {
            onClick: () => setShowColPanel(v => !v),
            className: `flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${showColPanel ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`,
            children: [_jsxs("svg", {
              className: "w-3 h-3",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              strokeLinecap: "round",
              strokeLinejoin: "round",
              children: [_jsx("rect", {
                x: "3",
                y: "3",
                width: "7",
                height: "7"
              }), _jsx("rect", {
                x: "14",
                y: "3",
                width: "7",
                height: "7"
              }), _jsx("rect", {
                x: "3",
                y: "14",
                width: "7",
                height: "7"
              }), _jsx("rect", {
                x: "14",
                y: "14",
                width: "7",
                height: "7"
              })]
            }), "Columns"]
          }), showColPanel && _jsxs("div", {
            className: "absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-3 min-w-[200px]",
            children: [_jsx("div", {
              className: "text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2",
              children: "Toggle Column Groups"
            }), COL_GROUPS.map(g => _jsxs("label", {
              className: "flex items-center gap-2 py-1 cursor-pointer hover:bg-slate-50 rounded px-1",
              children: [_jsx("input", {
                type: "checkbox",
                checked: colVisible(g.key),
                onChange: () => toggleGroup(g.key),
                className: "w-3.5 h-3.5 accent-blue-600"
              }), _jsx("span", {
                className: "text-xs text-slate-700",
                children: g.label
              }), _jsxs("span", {
                className: "ml-auto text-[10px] text-slate-400",
                children: [g.cols.length, " col", g.cols.length !== 1 ? 's' : '']
              })]
            }, g.key)), _jsxs("div", {
              className: "mt-2 pt-2 border-t border-slate-200 flex gap-2",
              children: [_jsx("button", {
                onClick: () => setHiddenGroups(new Set()),
                className: "text-[10px] text-blue-600 hover:underline",
                children: "Show all"
              }), _jsx("button", {
                onClick: () => setHiddenGroups(new Set(COL_GROUPS.map(g => g.key))),
                className: "text-[10px] text-slate-400 hover:underline ml-auto",
                children: "Hide all"
              })]
            })]
          })]
        }), _jsxs("span", {
          className: "text-[10px] text-slate-400 whitespace-nowrap ml-auto",
          children: [filteredDataTable.length, " / ", dataTable?.length ?? 0, " rows"]
        })]
      })]
    }), stage === "2" && diffMode ? _jsx(DiffView, {
      stage1Data: state.dataTable,
      stage2Data: state.stage2Data
    }) : _jsx("div", {
      className: "overflow-auto h-[calc(100vh-16rem)] border rounded shadow-sm bg-white relative",
      children: _jsxs("table", {
        className: "min-w-max divide-y divide-slate-200 text-sm",
        children: [_jsx("thead", {
          className: "bg-slate-100 sticky top-0 z-20 shadow-sm whitespace-nowrap",
          children: _jsxs("tr", {
            children: [renderSortHeader('_rowIndex', '# Row', 'sticky left-0 z-30 bg-slate-100'), colVisible('identity') && _jsx("th", {
              className: "px-3 py-2 text-left font-semibold text-slate-700 border-r border-slate-300 sticky left-[60px] z-30 bg-slate-100",
              children: "CSV SEQ NO"
            }), renderSortHeader('type', 'Type', 'sticky left-[160px] z-30 bg-slate-100'), colVisible('identity') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200",
              children: "TEXT (MSG)"
            }), colVisible('identity') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200",
              children: "PIPELINE-REF"
            }), colVisible('identity') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200",
              children: "REF NO."
            }), colVisible('geometry') && renderSortHeader('bore', 'BORE', 'bg-blue-50/50'), colVisible('geometry') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-blue-50/50",
              children: "BRANCH BORE"
            }), colVisible('geometry') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-blue-50/50",
              children: "EP1 X"
            }), colVisible('geometry') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-blue-50/50",
              children: "EP1 Y"
            }), colVisible('geometry') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-blue-50/50",
              children: "EP1 Z"
            }), colVisible('geometry') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-blue-50/50",
              children: "EP2 X"
            }), colVisible('geometry') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-blue-50/50",
              children: "EP2 Y"
            }), colVisible('geometry') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-blue-50/50",
              children: "EP2 Z"
            }), colVisible('geometry') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-blue-50/50",
              children: "CP X"
            }), colVisible('geometry') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-blue-50/50",
              children: "CP Y"
            }), colVisible('geometry') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-blue-50/50",
              children: "CP Z"
            }), colVisible('geometry') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-blue-50/50",
              children: "BP X"
            }), colVisible('geometry') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-blue-50/50",
              children: "BP Y"
            }), colVisible('geometry') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-blue-50/50",
              children: "BP Z"
            }), colVisible('support') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200",
              children: "SUPPORT COOR X"
            }), colVisible('support') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200",
              children: "SUPPORT COOR Y"
            }), colVisible('support') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200",
              children: "SUPPORT COOR Z"
            }), colVisible('support') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200",
              children: "SUPPORT NAME"
            }), colVisible('support') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200",
              children: "SUPPORT GUID"
            }), colVisible('support') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200",
              children: "SKEY"
            }), _jsx("th", {
              className: "px-3 py-2 text-left font-semibold text-slate-700 border-r border-slate-300 bg-amber-50",
              children: "Fixing Action"
            }), colVisible('calc') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-slate-50",
              children: "LEN 1"
            }), colVisible('calc') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-slate-50",
              children: "AXIS 1"
            }), colVisible('calc') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-slate-50",
              children: "LEN 2"
            }), colVisible('calc') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-slate-50",
              children: "AXIS 2"
            }), colVisible('calc') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-slate-50",
              children: "LEN 3"
            }), colVisible('calc') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-slate-50",
              children: "AXIS 3"
            }), colVisible('calc') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200 bg-slate-50",
              children: "BRLEN"
            }), colVisible('derived') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200",
              children: "PIPING CLASS"
            }), colVisible('derived') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200",
              children: "RATING"
            }), colVisible('derived') && _jsx("th", {
              className: "px-3 py-2 text-left font-medium text-slate-500 border-r border-slate-200",
              children: "LINENO KEY"
            }), colVisible('cas') && [97, 98, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => _jsxs("th", {
              className: "px-3 py-2 text-left font-medium text-slate-400 border-r border-slate-200",
              children: ["CA", n]
            }, `ca${n}`))]
          })
        }), _jsx("tbody", {
          className: "bg-white divide-y divide-slate-200",
          children: filteredDataTable.map((row, rowIdx) => {
            const isDeleted = row._isDeleted || row.fixingAction && row.fixingAction.includes('DELETE') && row._passApplied > 0;
            const rowClass = isDeleted ? 'bg-red-50/50 opacity-60 line-through' : 'bg-white hover:bg-slate-50 transition-colors';
            const renderSortHeader = (key, label, className = "") => _jsx("th", {
              className: `px-3 py-2 text-left font-semibold text-slate-700 border-r border-slate-300 bg-slate-100 cursor-pointer hover:bg-slate-200 select-none ${className}`,
              onClick: () => handleSort(key),
              children: _jsxs("div", {
                className: "flex items-center justify-between",
                children: [_jsx("span", {
                  children: label
                }), sortConfig.key === key ? sortConfig.direction === 'asc' ? _jsx("span", {
                  className: "text-[10px] ml-1 text-blue-600",
                  children: "\u25B2"
                }) : _jsx("span", {
                  className: "text-[10px] ml-1 text-blue-600",
                  children: "\u25BC"
                }) : _jsx("span", {
                  className: "text-[10px] ml-1 text-slate-400 opacity-0 group-hover:opacity-100",
                  children: "\u2195"
                })]
              })
            });
            return _jsxs("tr", {
              className: `${rowClass} whitespace-nowrap`,
              children: [_jsx("td", {
                className: `px-3 py-2 text-slate-500 border-r border-slate-200 sticky left-0 z-10 font-mono ${isDeleted ? 'bg-red-50' : 'bg-white'}`,
                children: row._rowIndex
              }), colVisible('identity') && _jsx("td", {
                className: `px-3 py-2 border-r border-slate-200 sticky left-[60px] z-10 font-mono ${getCellClass(row, 'csvSeqNo')} ${isDeleted ? 'bg-red-50' : 'bg-white'}`,
                children: row.csvSeqNo || '—'
              }), _jsx("td", {
                className: `px-3 py-2 font-medium text-slate-900 border-r border-slate-300 sticky left-[160px] z-10 ${isDeleted ? 'bg-red-50' : 'bg-white'}`,
                children: row.type
              }), colVisible('identity') && _jsx("td", {
                className: "px-3 py-2 text-slate-500 border-r border-slate-200 truncate max-w-[200px]",
                title: row.text,
                children: row.text || '—'
              }), colVisible('identity') && _jsx("td", {
                className: "px-3 py-2 text-slate-500 border-r border-slate-200",
                children: row.pipelineRef || '—'
              }), colVisible('identity') && _jsx("td", {
                className: `px-3 py-2 border-r border-slate-200 ${getCellClass(row, 'refNo')}`,
                children: row.refNo || '—'
              }), colVisible('geometry') && _jsx("td", {
                className: `px-3 py-2 font-mono border-r border-slate-200 ${getCellClass(row, 'bore')}`,
                children: row.bore || '—'
              }), colVisible('geometry') && _jsx("td", {
                className: `px-3 py-2 font-mono border-r border-slate-200 ${getCellClass(row, 'branchBore')}`,
                children: row.branchBore || '—'
              }), colVisible('geometry') && _jsx("td", {
                className: `px-3 py-2 font-mono border-r border-slate-200 ${getCellClass(row, 'ep1')}`,
                children: row.ep1?.x !== undefined ? row.ep1.x.toFixed(1) : '—'
              }), colVisible('geometry') && _jsx("td", {
                className: `px-3 py-2 font-mono border-r border-slate-200 ${getCellClass(row, 'ep1')}`,
                children: row.ep1?.y !== undefined ? row.ep1.y.toFixed(1) : '—'
              }), colVisible('geometry') && _jsx("td", {
                className: `px-3 py-2 font-mono border-r border-slate-200 ${getCellClass(row, 'ep1')}`,
                children: row.ep1?.z !== undefined ? row.ep1.z.toFixed(1) : '—'
              }), colVisible('geometry') && _jsx("td", {
                className: `px-3 py-2 font-mono border-r border-slate-200 ${getCellClass(row, 'ep2')}`,
                children: row.ep2?.x !== undefined ? row.ep2.x.toFixed(1) : '—'
              }), colVisible('geometry') && _jsx("td", {
                className: `px-3 py-2 font-mono border-r border-slate-200 ${getCellClass(row, 'ep2')}`,
                children: row.ep2?.y !== undefined ? row.ep2.y.toFixed(1) : '—'
              }), colVisible('geometry') && _jsx("td", {
                className: `px-3 py-2 font-mono border-r border-slate-200 ${getCellClass(row, 'ep2')}`,
                children: row.ep2?.z !== undefined ? row.ep2.z.toFixed(1) : '—'
              }), colVisible('geometry') && _jsx("td", {
                className: `px-3 py-2 font-mono border-r border-slate-200 ${getCellClass(row, 'cp')}`,
                children: row.cp?.x !== undefined ? row.cp.x.toFixed(1) : '—'
              }), colVisible('geometry') && _jsx("td", {
                className: `px-3 py-2 font-mono border-r border-slate-200 ${getCellClass(row, 'cp')}`,
                children: row.cp?.y !== undefined ? row.cp.y.toFixed(1) : '—'
              }), colVisible('geometry') && _jsx("td", {
                className: `px-3 py-2 font-mono border-r border-slate-200 ${getCellClass(row, 'cp')}`,
                children: row.cp?.z !== undefined ? row.cp.z.toFixed(1) : '—'
              }), colVisible('geometry') && _jsx("td", {
                className: `px-3 py-2 font-mono border-r border-slate-200 ${getCellClass(row, 'bp')}`,
                children: row.bp?.x !== undefined ? row.bp.x.toFixed(1) : '—'
              }), colVisible('geometry') && _jsx("td", {
                className: `px-3 py-2 font-mono border-r border-slate-200 ${getCellClass(row, 'bp')}`,
                children: row.bp?.y !== undefined ? row.bp.y.toFixed(1) : '—'
              }), colVisible('geometry') && _jsx("td", {
                className: `px-3 py-2 font-mono border-r border-slate-200 ${getCellClass(row, 'bp')}`,
                children: row.bp?.z !== undefined ? row.bp.z.toFixed(1) : '—'
              }), colVisible('support') && _jsx("td", {
                className: "px-3 py-2 font-mono text-slate-600 border-r border-slate-200",
                children: row.supportCoor?.x !== undefined ? row.supportCoor.x.toFixed(1) : '—'
              }), colVisible('support') && _jsx("td", {
                className: "px-3 py-2 font-mono text-slate-600 border-r border-slate-200",
                children: row.supportCoor?.y !== undefined ? row.supportCoor.y.toFixed(1) : '—'
              }), colVisible('support') && _jsx("td", {
                className: "px-3 py-2 font-mono text-slate-600 border-r border-slate-200",
                children: row.supportCoor?.z !== undefined ? row.supportCoor.z.toFixed(1) : '—'
              }), colVisible('support') && _jsx("td", {
                className: "px-3 py-2 font-mono text-slate-600 border-r border-slate-200",
                children: row.supportName || '—'
              }), colVisible('support') && _jsx("td", {
                className: "px-3 py-2 font-mono text-slate-600 border-r border-slate-200",
                children: row.supportGuid || '—'
              }), colVisible('support') && _jsx("td", {
                className: "px-3 py-2 font-mono text-slate-600 border-r border-slate-200",
                children: row.skey || '—'
              }), _jsx("td", {
                className: "px-3 py-2 border-r border-slate-200 align-top",
                children: renderFixingAction(row)
              }), colVisible('calc') && _jsx("td", {
                className: "px-3 py-2 font-mono text-cyan-700 border-r border-slate-200 bg-slate-50/50",
                children: row.len1?.toFixed(1) || '—'
              }), colVisible('calc') && _jsx("td", {
                className: "px-3 py-2 text-cyan-700 border-r border-slate-200 bg-slate-50/50",
                children: row.axis1 || '—'
              }), colVisible('calc') && _jsx("td", {
                className: "px-3 py-2 font-mono text-cyan-700 border-r border-slate-200 bg-slate-50/50",
                children: row.len2?.toFixed(1) || '—'
              }), colVisible('calc') && _jsx("td", {
                className: "px-3 py-2 text-cyan-700 border-r border-slate-200 bg-slate-50/50",
                children: row.axis2 || '—'
              }), colVisible('calc') && _jsx("td", {
                className: "px-3 py-2 font-mono text-cyan-700 border-r border-slate-200 bg-slate-50/50",
                children: row.len3?.toFixed(1) || '—'
              }), colVisible('calc') && _jsx("td", {
                className: "px-3 py-2 text-cyan-700 border-r border-slate-200 bg-slate-50/50",
                children: row.axis3 || '—'
              }), colVisible('calc') && _jsx("td", {
                className: "px-3 py-2 font-mono text-cyan-700 border-r border-slate-200 bg-slate-50/50",
                children: row.brlen?.toFixed(1) || '—'
              }), colVisible('derived') && _jsx("td", {
                className: "px-3 py-2 font-mono text-slate-500 border-r border-slate-200",
                children: row.pipingClass || '—', onClick: () => setActiveCell({ rowIndex: dataTable.indexOf(row), colName: 'PIPING CLASS' })
              }), colVisible('derived') && _jsx("td", {
                className: "px-3 py-2 font-mono text-slate-500 border-r border-slate-200",
                children: row.rating || '—', onClick: () => setActiveCell({ rowIndex: dataTable.indexOf(row), colName: 'RATING' })
              }), colVisible('derived') && _jsx("td", {
                className: "px-3 py-2 font-mono text-slate-400 border-r border-slate-200",
                children: row.lineNoKey || '—', onClick: () => setActiveCell({ rowIndex: dataTable.indexOf(row), colName: 'LINENO KEY' })
              }), colVisible('cas') && [97, 98, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
                let caVal = row.ca && row.ca[n] ? row.ca[n] : row[`CA${n}`];
                return _jsx("td", {
                  className: "px-3 py-2 text-slate-500 border-r border-slate-200",
                  children: formatCaDisplayValue(caVal)
                }, `ca${n}`);
              })]
            }, String(row._rowIndex ?? rowIdx));
          })
        })]
      })
    })]
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsInVzZUFwcENvbnRleHQiLCJ1c2VTdG9yZSIsInJ1blZhbGlkYXRpb25DaGVja2xpc3QiLCJjcmVhdGVMb2dnZXIiLCJleHBvcnRUb0V4Y2VsIiwiZ2VuZXJhdGVQQ0ZUZXh0IiwianN4IiwiX2pzeCIsImpzeHMiLCJfanN4cyIsIkZyYWdtZW50IiwiX0ZyYWdtZW50IiwiZm10Q29vcmRTaG9ydCIsImMiLCJ4IiwidG9GaXhlZCIsInkiLCJ6IiwiRElGRl9GSUVMRFMiLCJjb29yZEVxdWFsIiwiYSIsImIiLCJNYXRoIiwiYWJzIiwiZmllbGRFcXVhbCIsImZpZWxkIiwiYXYiLCJidiIsImluY2x1ZGVzIiwiU3RyaW5nIiwiZm9ybWF0RmllbGRWYWx1ZSIsInJvdyIsInYiLCJEaWZmVmlldyIsInN0YWdlMURhdGEiLCJzdGFnZTJEYXRhIiwiY2hhbmdlcyIsInVzZU1lbW8iLCJsZW5ndGgiLCJtYXAxIiwiT2JqZWN0IiwiZnJvbUVudHJpZXMiLCJtYXAiLCJyIiwiX3Jvd0luZGV4IiwicmVzdWx0cyIsImZvckVhY2giLCJyb3cyIiwicm93MSIsImNoYW5nZWRGaWVsZHMiLCJmaWx0ZXIiLCJmIiwicHVzaCIsIm9yaWdpbmFsIiwicmVuZGVyU29ydEhlYWRlciIsImtleSIsImxhYmVsIiwiY2xhc3NOYW1lIiwib25DbGljayIsImhhbmRsZVNvcnQiLCJjaGlsZHJlbiIsInNvcnRDb25maWciLCJkaXJlY3Rpb24iLCJmaSIsInJvd1NwYW4iLCJzdHlsZSIsImJhY2tncm91bmRDb2xvciIsIlBJUEUiLCJWQUxWRSIsIkZMQU5HRSIsIkJFTkQiLCJURUUiLCJPTEVUIiwiU1VQUE9SVCIsInR5cGUiLCJ0b1VwcGVyQ2FzZSIsInRpdGxlIiwiZml4aW5nQWN0aW9uIiwiX3Bhc3NBcHBsaWVkIiwic3Vic3RyaW5nIiwiQ09MX0dST1VQUyIsImNvbHMiLCJEYXRhVGFibGVUYWIiLCJzdGFnZSIsInN0YXRlIiwiZGlzcGF0Y2giLCJmaWx0ZXJBY3Rpb24iLCJzZXRGaWx0ZXJBY3Rpb24iLCJ1c2VTdGF0ZSIsImRpZmZNb2RlIiwic2V0RGlmZk1vZGUiLCJzZWFyY2hUZXh0Iiwic2V0U2VhcmNoVGV4dCIsImhpZGRlbkdyb3VwcyIsInNldEhpZGRlbkdyb3VwcyIsIlNldCIsInNob3dDb2xQYW5lbCIsInNldFNob3dDb2xQYW5lbCIsInNldFNvcnRDb25maWciLCJjb2x1bW5GaWx0ZXJzIiwic2V0Q29sdW1uRmlsdGVycyIsImNvbFZpc2libGUiLCJncm91cEtleSIsImhhcyIsInRvZ2dsZUdyb3VwIiwicHJldiIsIm5leHQiLCJkZWxldGUiLCJhZGQiLCJjdXJyZW50RGF0YSIsImRhdGFUYWJsZSIsInN0YWdlM0RhdGEiLCJoYW5kbGVBcHByb3ZlIiwicm93SW5kZXgiLCJhcHByb3ZlIiwidXBkYXRlZFRhYmxlIiwicm93SWR4IiwiZmluZEluZGV4IiwiX2ZpeEFwcHJvdmVkIiwicGF5bG9hZCIsImFjdGlvblRleHQiLCJyb3dEZXNjcmlwdGlvbiIsIm1lc3NhZ2UiLCJnZXRTdGF0ZSIsInNldFByb3Bvc2FsU3RhdHVzIiwiaGFuZGxlQXV0b0FwcHJvdmVBbGwiLCJhY3Rpb25UeXBlIiwidW5kZWZpbmVkIiwiZml4aW5nQWN0aW9uVGllciIsImFjdGlvbk1hdGNoIiwibXNnIiwiaGFuZGxlQ2FsY3VsYXRlTWlzc2luZ0dlb21ldHJ5IiwiYmVuZFB0ciIsInJpZ2lkUHRyIiwiaW50UHRyIiwidXBkYXRlZEl0ZW1zIiwiYm9yZSIsImJvcmVGYiIsImNwIiwiZGVsdGEiLCJsZW4iLCJwdHIiLCJnZXRBeGlzIiwiZXAxIiwiZXAyIiwiZHgiLCJkeSIsImR6IiwiYWJzWCIsImFic1kiLCJhYnNaIiwiZGlzdCIsInNxcnQiLCJpbmRleCIsImFyciIsInQiLCJfbW9kaWZpZWQiLCJkZWx0YVgiLCJkZWx0YVkiLCJkZWx0YVoiLCJsZW4xIiwiYXhpczEiLCJicCIsImJybGVuIiwibGVuMiIsImF4aXMyIiwiZGlhbWV0ZXIiLCJ3aW5kb3ciLCJkaXNwYXRjaEV2ZW50IiwiQ3VzdG9tRXZlbnQiLCJhbGVydExpbmVzIiwiam9pbiIsImhhbmRsZVB1bGxTdGFnZTEiLCJuZXdSb3ciLCJmaXhpbmdBY3Rpb25SdWxlSWQiLCJoYW5kbGVTeW50YXhGaXgiLCJjYXBzRml4ZWQiLCJ6ZXJvRml4ZWQiLCJhY3Rpb25zVGFrZW4iLCJ0cmltIiwic2tleSIsImlzWmVybyIsInB0IiwiaGFuZGxlVmFsaWRhdGVTeW50YXgiLCJsb2dnZXIiLCJjb25maWciLCJnZXRMb2ciLCJlbnRyeSIsInJ1bGVDb3VudHMiLCJydWxlSWQiLCJ0aWVyIiwiZmluZCIsImV4cGVjdGVkRml4ZXMiLCJmaXhTdHIiLCJzdW1tYXJ5VGV4dCIsImVudHJpZXMiLCJydWxlIiwiY291bnQiLCJlcnJvckNvdW50Iiwid2FybkNvdW50IiwiZml4aW5nQWN0aW9uU3RhdHMiLCJhcHByb3ZlZFAxIiwicmVqZWN0ZWRQMSIsInBlbmRpbmdQMSIsImFwcHJvdmVkUDIiLCJyZWplY3RlZFAyIiwicGVuZGluZ1AyIiwiZXJyUGFzczEiLCJ3YXJuUGFzczEiLCJlcnJQYXNzMiIsIndhcm5QYXNzMiIsImlzUDIiLCJfY3VycmVudFBhc3MiLCJpc0VyciIsImlzV2FybiIsImZpbHRlcmVkRGF0YVRhYmxlIiwicm93cyIsInEiLCJ0b0xvd2VyQ2FzZSIsInN0ckZpZWxkcyIsInRleHQiLCJwaXBlbGluZVJlZiIsInJlZk5vIiwic3VwcG9ydEd1aWQiLCJzb21lIiwiZm10QyIsImNhIiwidmFsdWVzIiwia2V5cyIsImNvbCIsInZhbCIsImNlbGxWYWwiLCJzb3J0IiwidmFsQSIsInZhbEIiLCJsb2NhbGVDb21wYXJlIiwiZGlzYWJsZWQiLCJ4bWxucyIsIndpZHRoIiwiaGVpZ2h0Iiwidmlld0JveCIsImZpbGwiLCJzdHJva2UiLCJzdHJva2VXaWR0aCIsInN0cm9rZUxpbmVjYXAiLCJzdHJva2VMaW5lam9pbiIsImQiLCJwb2ludHMiLCJ4MSIsInkxIiwieDIiLCJ5MiIsInJlbmRlckZpeGluZ0FjdGlvbiIsInRpZXJDb2xvcnMiLCJiZyIsImJvcmRlciIsImNvbG9ycyIsInZhbGlkYXRpb25Nc2ciLCJmaXhpbmdBY3Rpb25PcmlnaW5hbEVycm9yIiwiYWN0aW9uTXNnIiwicGFzc1ByZWZpeCIsImhhc0V4cGxpY2l0VGFncyIsInBhcnRzIiwic3BsaXQiLCJyZXBsYWNlIiwic2xpY2UiLCJzcGxpdElkeCIsImluZGV4T2YiLCJfaXNQYXNzaXZlRml4IiwiZml4aW5nQWN0aW9uU2NvcmUiLCJyb3VuZCIsImZtdENvb3JkIiwiZ2V0Q2VsbENsYXNzIiwidmFsdWUiLCJvbkNoYW5nZSIsImUiLCJ0YXJnZXQiLCJwcm9wb3NhbHMiLCJkaWFnRGF0YSIsInRpbWVzdGFtcCIsIkRhdGUiLCJ0b0lTT1N0cmluZyIsInRvdGFsUHJvcG9zYWxzIiwiYmxvYiIsIkJsb2IiLCJKU09OIiwic3RyaW5naWZ5IiwidXJsIiwiVVJMIiwiY3JlYXRlT2JqZWN0VVJMIiwiZG9jdW1lbnQiLCJjcmVhdGVFbGVtZW50IiwiaHJlZiIsImRvd25sb2FkIiwiY2xpY2siLCJyZXZva2VPYmplY3RVUkwiLCJlcnIiLCJjeCIsImN5IiwicGxhY2Vob2xkZXIiLCJnIiwiY2hlY2tlZCIsIm4iLCJpc0RlbGV0ZWQiLCJfaXNEZWxldGVkIiwicm93Q2xhc3MiLCJjc3ZTZXFObyIsImJyYW5jaEJvcmUiLCJzdXBwb3J0Q29vciIsInN1cHBvcnROYW1lIiwibGVuMyIsImF4aXMzIiwiUElQSU5HX0NMQVNTIiwiUkFUSU5HIiwiTElORU5PX0tFWSIsImNhVmFsIl0sInNvdXJjZXMiOlsiRGF0YVRhYmxlVGFiLmpzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUmVhY3QgZnJvbSAncmVhY3QnO1xuaW1wb3J0IHsgdXNlQXBwQ29udGV4dCB9IGZyb20gJy4uLy4uL3N0b3JlL0FwcENvbnRleHQnO1xuaW1wb3J0IHsgdXNlU3RvcmUgfSBmcm9tICcuLi8uLi9zdG9yZS91c2VTdG9yZSc7XG5pbXBvcnQgeyBydW5WYWxpZGF0aW9uQ2hlY2tsaXN0IH0gZnJvbSAnLi4vLi4vZW5naW5lL1ZhbGlkYXRvcic7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuLi8uLi91dGlscy9Mb2dnZXInO1xuaW1wb3J0IHsgZXhwb3J0VG9FeGNlbCwgZ2VuZXJhdGVQQ0ZUZXh0IH0gZnJvbSAnLi4vLi4vdXRpbHMvSW1wb3J0RXhwb3J0JztcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBEaWZmIFZpZXcgaGVscGVyc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jb25zdCBmbXRDb29yZFNob3J0ID0gKGMpID0+IGMgPyBgKCR7Yy54Py50b0ZpeGVkKDEpfSwgJHtjLnk/LnRvRml4ZWQoMSl9LCAke2Muej8udG9GaXhlZCgxKX0pYCA6ICfigJQnO1xuXG5jb25zdCBESUZGX0ZJRUxEUyA9IFsndHlwZScsICdib3JlJywgJ2JyYW5jaEJvcmUnLCAnZXAxJywgJ2VwMicsICdjcCcsICdicCcsICdza2V5J107XG5cbmZ1bmN0aW9uIGNvb3JkRXF1YWwoYSwgYikge1xuICBpZiAoIWEgJiYgIWIpIHJldHVybiB0cnVlO1xuICBpZiAoIWEgfHwgIWIpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIE1hdGguYWJzKChhLnh8fDApIC0gKGIueHx8MCkpIDwgMC4wMDEgJiZcbiAgICAgICAgIE1hdGguYWJzKChhLnl8fDApIC0gKGIueXx8MCkpIDwgMC4wMDEgJiZcbiAgICAgICAgIE1hdGguYWJzKChhLnp8fDApIC0gKGIuenx8MCkpIDwgMC4wMDE7XG59XG5cbmZ1bmN0aW9uIGZpZWxkRXF1YWwoYSwgYiwgZmllbGQpIHtcbiAgY29uc3QgYXYgPSBhPy5bZmllbGRdO1xuICBjb25zdCBidiA9IGI/LltmaWVsZF07XG4gIGlmIChbJ2VwMScsJ2VwMicsJ2NwJywnYnAnXS5pbmNsdWRlcyhmaWVsZCkpIHJldHVybiBjb29yZEVxdWFsKGF2LCBidik7XG4gIGlmIChhdiA9PSBudWxsICYmIGJ2ID09IG51bGwpIHJldHVybiB0cnVlO1xuICByZXR1cm4gU3RyaW5nKGF2ID8/ICcnKSA9PT0gU3RyaW5nKGJ2ID8/ICcnKTtcbn1cblxuZnVuY3Rpb24gZm9ybWF0RmllbGRWYWx1ZShyb3csIGZpZWxkKSB7XG4gIGNvbnN0IHYgPSByb3c/LltmaWVsZF07XG4gIGlmIChbJ2VwMScsJ2VwMicsJ2NwJywnYnAnXS5pbmNsdWRlcyhmaWVsZCkpIHJldHVybiBmbXRDb29yZFNob3J0KHYpO1xuICByZXR1cm4gdiAhPSBudWxsID8gU3RyaW5nKHYpIDogJ+KAlCc7XG59XG5cbmZ1bmN0aW9uIERpZmZWaWV3KHsgc3RhZ2UxRGF0YSwgc3RhZ2UyRGF0YSB9KSB7XG4gIGNvbnN0IGNoYW5nZXMgPSBSZWFjdC51c2VNZW1vKCgpID0+IHtcbiAgICBpZiAoIXN0YWdlMURhdGE/Lmxlbmd0aCB8fCAhc3RhZ2UyRGF0YT8ubGVuZ3RoKSByZXR1cm4gW107XG4gICAgY29uc3QgbWFwMSA9IE9iamVjdC5mcm9tRW50cmllcyhzdGFnZTFEYXRhLm1hcChyID0+IFtyLl9yb3dJbmRleCwgcl0pKTtcbiAgICBjb25zdCByZXN1bHRzID0gW107XG4gICAgc3RhZ2UyRGF0YS5mb3JFYWNoKHJvdzIgPT4ge1xuICAgICAgY29uc3Qgcm93MSA9IG1hcDFbcm93Mi5fcm93SW5kZXhdO1xuICAgICAgaWYgKCFyb3cxKSByZXR1cm47XG4gICAgICBjb25zdCBjaGFuZ2VkRmllbGRzID0gRElGRl9GSUVMRFMuZmlsdGVyKGYgPT4gIWZpZWxkRXF1YWwocm93MSwgcm93MiwgZikpO1xuICAgICAgaWYgKGNoYW5nZWRGaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgICByZXN1bHRzLnB1c2goeyByb3c6IHJvdzIsIG9yaWdpbmFsOiByb3cxLCBjaGFuZ2VkRmllbGRzIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9LCBbc3RhZ2UxRGF0YSwgc3RhZ2UyRGF0YV0pO1xuXG4gIGlmIChjaGFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXG4gIGNvbnN0IHJlbmRlclNvcnRIZWFkZXIgPSAoa2V5LCBsYWJlbCwgY2xhc3NOYW1lID0gXCJcIikgPT4gKFxuICAgICAgPHRoIGNsYXNzTmFtZT17YHB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1zZW1pYm9sZCB0ZXh0LXNsYXRlLTcwMCBib3JkZXItciBib3JkZXItc2xhdGUtMzAwIGJnLXNsYXRlLTEwMCBjdXJzb3ItcG9pbnRlciBob3ZlcjpiZy1zbGF0ZS0yMDAgc2VsZWN0LW5vbmUgJHtjbGFzc05hbWV9YH0gb25DbGljaz17KCkgPT4gaGFuZGxlU29ydChrZXkpfT5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlblwiPlxuICAgICAgICAgICAgICA8c3Bhbj57bGFiZWx9PC9zcGFuPlxuICAgICAgICAgICAgICB7c29ydENvbmZpZy5rZXkgPT09IGtleSA/IChzb3J0Q29uZmlnLmRpcmVjdGlvbiA9PT0gJ2FzYycgPyA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LVsxMHB4XSBtbC0xIHRleHQtYmx1ZS02MDBcIj7ilrI8L3NwYW4+IDogPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gbWwtMSB0ZXh0LWJsdWUtNjAwXCI+4pa8PC9zcGFuPikgOiA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LVsxMHB4XSBtbC0xIHRleHQtc2xhdGUtNDAwIG9wYWNpdHktMCBncm91cC1ob3ZlcjpvcGFjaXR5LTEwMFwiPuKGlTwvc3Bhbj59XG4gICAgICAgICAgPC9kaXY+XG4gICAgICA8L3RoPlxuICApO1xuXG4gIHJldHVybiAoXG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC1jb2wgaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIHB5LTE2IHRleHQtc2xhdGUtNDAwXCI+XG4gICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQtNHhsIG1iLTNcIj7inJM8L3NwYW4+XG4gICAgICAgIDxwIGNsYXNzTmFtZT1cInRleHQtc21cIj5ObyBjb29yZGluYXRlIG9yIGF0dHJpYnV0ZSBjaGFuZ2VzIGRldGVjdGVkIGJldHdlZW4gU3RhZ2UgMSBhbmQgU3RhZ2UgMi48L3A+XG4gICAgICA8L2Rpdj5cbiAgICApO1xuICB9XG5cblxuICBjb25zdCByZW5kZXJTb3J0SGVhZGVyID0gKGtleSwgbGFiZWwsIGNsYXNzTmFtZSA9IFwiXCIpID0+IChcbiAgICAgIDx0aCBjbGFzc05hbWU9e2BweC0zIHB5LTIgdGV4dC1sZWZ0IGZvbnQtc2VtaWJvbGQgdGV4dC1zbGF0ZS03MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTMwMCBiZy1zbGF0ZS0xMDAgY3Vyc29yLXBvaW50ZXIgaG92ZXI6Ymctc2xhdGUtMjAwIHNlbGVjdC1ub25lICR7Y2xhc3NOYW1lfWB9IG9uQ2xpY2s9eygpID0+IGhhbmRsZVNvcnQoa2V5KX0+XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW5cIj5cbiAgICAgICAgICAgICAgPHNwYW4+e2xhYmVsfTwvc3Bhbj5cbiAgICAgICAgICAgICAge3NvcnRDb25maWcua2V5ID09PSBrZXkgPyAoc29ydENvbmZpZy5kaXJlY3Rpb24gPT09ICdhc2MnID8gPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gbWwtMSB0ZXh0LWJsdWUtNjAwXCI+4payPC9zcGFuPiA6IDxzcGFuIGNsYXNzTmFtZT1cInRleHQtWzEwcHhdIG1sLTEgdGV4dC1ibHVlLTYwMFwiPuKWvDwvc3Bhbj4pIDogPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gbWwtMSB0ZXh0LXNsYXRlLTQwMCBvcGFjaXR5LTAgZ3JvdXAtaG92ZXI6b3BhY2l0eS0xMDBcIj7ihpU8L3NwYW4+fVxuICAgICAgICAgIDwvZGl2PlxuICAgICAgPC90aD5cbiAgKTtcblxuICByZXR1cm4gKFxuICAgIDxkaXYgY2xhc3NOYW1lPVwib3ZlcmZsb3ctYXV0byBoLVtjYWxjKDEwMHZoLTE4cmVtKV0gYm9yZGVyIHJvdW5kZWQgc2hhZG93LXNtIGJnLXdoaXRlXCI+XG4gICAgICA8dGFibGUgY2xhc3NOYW1lPVwibWluLXctbWF4IHRleHQteHMgZGl2aWRlLXkgZGl2aWRlLXNsYXRlLTIwMFwiPlxuICAgICAgICA8dGhlYWQgY2xhc3NOYW1lPVwiYmctc2xhdGUtMTAwIHN0aWNreSB0b3AtMCB6LTIwIHRleHQtc2xhdGUtNjAwIHVwcGVyY2FzZSB0ZXh0LVsxMHB4XSB0cmFja2luZy13aWRlclwiPlxuICAgICAgICAgIDx0cj5cbiAgICAgICAgICAgIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTIgZm9udC1zZW1pYm9sZCBib3JkZXItciBib3JkZXItc2xhdGUtMzAwIHN0aWNreSBsZWZ0LTAgYmctc2xhdGUtMTAwXCI+IzwvdGg+XG4gICAgICAgICAgICA8dGggY2xhc3NOYW1lPVwicHgtMyBweS0yIGZvbnQtc2VtaWJvbGQgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTMwMCBzdGlja3kgbGVmdC1bNTBweF0gYmctc2xhdGUtMTAwXCI+VHlwZTwvdGg+XG4gICAgICAgICAgICA8dGggY2xhc3NOYW1lPVwicHgtMyBweS0yIGZvbnQtc2VtaWJvbGQgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTMwMFwiPkZpZWxkPC90aD5cbiAgICAgICAgICAgIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTIgZm9udC1zZW1pYm9sZCBib3JkZXItciBib3JkZXItc2xhdGUtMzAwIGJnLXJlZC01MC80MFwiPk9yaWdpbmFsIChTdGFnZSAxKTwvdGg+XG4gICAgICAgICAgICA8dGggY2xhc3NOYW1lPVwicHgtMyBweS0yIGZvbnQtc2VtaWJvbGQgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTMwMCBiZy1ncmVlbi01MC80MFwiPkN1cnJlbnQgKFN0YWdlIDIpPC90aD5cbiAgICAgICAgICAgIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTIgZm9udC1zZW1pYm9sZFwiPkZpeGluZyBBY3Rpb248L3RoPlxuICAgICAgICAgIDwvdHI+XG4gICAgICAgIDwvdGhlYWQ+XG4gICAgICAgIDx0Ym9keSBjbGFzc05hbWU9XCJkaXZpZGUteSBkaXZpZGUtc2xhdGUtMTAwXCI+XG4gICAgICAgICAge2NoYW5nZXMubWFwKCh7IHJvdywgb3JpZ2luYWwsIGNoYW5nZWRGaWVsZHMgfSkgPT5cbiAgICAgICAgICAgIGNoYW5nZWRGaWVsZHMubWFwKChmaWVsZCwgZmkpID0+IChcbiAgICAgICAgICAgICAgPHRyIGtleT17YCR7cm93Ll9yb3dJbmRleH0tJHtmaWVsZH1gfSBjbGFzc05hbWU9XCJob3ZlcjpiZy1zbGF0ZS01MFwiPlxuICAgICAgICAgICAgICAgIHtmaSA9PT0gMCAmJiAoXG4gICAgICAgICAgICAgICAgICA8PlxuICAgICAgICAgICAgICAgICAgICA8dGQgcm93U3Bhbj17Y2hhbmdlZEZpZWxkcy5sZW5ndGh9IGNsYXNzTmFtZT1cInB4LTMgcHktMS41IGZvbnQtbW9ubyBib3JkZXItciBib3JkZXItc2xhdGUtMjAwIHN0aWNreSBsZWZ0LTAgYmctd2hpdGUgZm9udC1ib2xkIHRleHQtc2xhdGUtNzAwIGFsaWduLXRvcFwiPlxuICAgICAgICAgICAgICAgICAgICAgIHtyb3cuX3Jvd0luZGV4fVxuICAgICAgICAgICAgICAgICAgICA8L3RkPlxuICAgICAgICAgICAgICAgICAgICA8dGQgcm93U3Bhbj17Y2hhbmdlZEZpZWxkcy5sZW5ndGh9IGNsYXNzTmFtZT1cInB4LTMgcHktMS41IGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgc3RpY2t5IGxlZnQtWzUwcHhdIGJnLXdoaXRlIGFsaWduLXRvcFwiPlxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtc2VtaWJvbGQgcHgtMS41IHB5LTAuNSByb3VuZGVkIHRleHQtd2hpdGUgdGV4dC1bMTBweF1cIlxuICAgICAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3sgYmFja2dyb3VuZENvbG9yOiB7IFBJUEU6JyMzYjgyZjYnLFZBTFZFOicjZWY0NDQ0JyxGTEFOR0U6JyNhODU1ZjcnLEJFTkQ6JyNmNTllMGInLFRFRTonIzEwYjk4MScsT0xFVDonIzA2YjZkNCcsU1VQUE9SVDonIzk0YTNiOCcgfVsocm93LnR5cGV8fCcnKS50b1VwcGVyQ2FzZSgpXSB8fCAnIzY0NzQ4YicgfX0+XG4gICAgICAgICAgICAgICAgICAgICAgICB7cm93LnR5cGUgfHwgJ1VOS05PV04nfVxuICAgICAgICAgICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC90ZD5cbiAgICAgICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgICAgPHRkIGNsYXNzTmFtZT1cInB4LTMgcHktMS41IGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgZm9udC1tb25vIGZvbnQtc2VtaWJvbGQgdGV4dC1zbGF0ZS01MDAgdXBwZXJjYXNlXCI+e2ZpZWxkfTwvdGQ+XG4gICAgICAgICAgICAgICAgPHRkIGNsYXNzTmFtZT1cInB4LTMgcHktMS41IGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgYmctcmVkLTUwLzQwIGZvbnQtbW9ubyB0ZXh0LXJlZC03MDAgbGluZS10aHJvdWdoXCI+XG4gICAgICAgICAgICAgICAgICB7Zm9ybWF0RmllbGRWYWx1ZShvcmlnaW5hbCwgZmllbGQpfVxuICAgICAgICAgICAgICAgIDwvdGQ+XG4gICAgICAgICAgICAgICAgPHRkIGNsYXNzTmFtZT1cInB4LTMgcHktMS41IGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgYmctZ3JlZW4tNTAvNDAgZm9udC1tb25vIHRleHQtZ3JlZW4tODAwIGZvbnQtc2VtaWJvbGRcIj5cbiAgICAgICAgICAgICAgICAgIHtmb3JtYXRGaWVsZFZhbHVlKHJvdywgZmllbGQpfVxuICAgICAgICAgICAgICAgIDwvdGQ+XG4gICAgICAgICAgICAgICAge2ZpID09PSAwICYmIChcbiAgICAgICAgICAgICAgICAgIDx0ZCByb3dTcGFuPXtjaGFuZ2VkRmllbGRzLmxlbmd0aH0gY2xhc3NOYW1lPVwicHgtMyBweS0xLjUgdGV4dC14cyB0ZXh0LXNsYXRlLTUwMCBtYXgtdy14cyB0cnVuY2F0ZSBhbGlnbi10b3BcIiB0aXRsZT17cm93LmZpeGluZ0FjdGlvbiB8fCAnJ30+XG4gICAgICAgICAgICAgICAgICAgIHtyb3cuZml4aW5nQWN0aW9uID8gKFxuICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT17YGlubGluZS1ibG9jayBweC0xLjUgcHktMC41IHJvdW5kZWQgdGV4dC1bMTBweF0gZm9udC1tZWRpdW0gJHtyb3cuX3Bhc3NBcHBsaWVkID8gJ2JnLWdyZWVuLTEwMCB0ZXh0LWdyZWVuLTgwMCcgOiAnYmctYW1iZXItMTAwIHRleHQtYW1iZXItODAwJ31gfT5cbiAgICAgICAgICAgICAgICAgICAgICAgIHtyb3cuX3Bhc3NBcHBsaWVkID8gJ0FwcGxpZWQnIDogcm93LmZpeGluZ0FjdGlvbi5zdWJzdHJpbmcoMCwgNjApICsgKHJvdy5maXhpbmdBY3Rpb24ubGVuZ3RoID4gNjAgPyAn4oCmJyA6ICcnKX1cbiAgICAgICAgICAgICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICkgOiAn4oCUJ31cbiAgICAgICAgICAgICAgICAgIDwvdGQ+XG4gICAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgICAgPC90cj5cbiAgICAgICAgICAgICkpXG4gICAgICAgICAgKX1cbiAgICAgICAgPC90Ym9keT5cbiAgICAgIDwvdGFibGU+XG4gICAgPC9kaXY+XG4gICk7XG59XG5cbi8vIENvbHVtbiBncm91cCBkZWZpbml0aW9ucyDigJQgZWFjaCBlbnRyeSBpcyB7IGtleSwgbGFiZWwsIGNvbHNbXSB9XG5jb25zdCBDT0xfR1JPVVBTID0gW1xuICB7IGtleTogJ2lkZW50aXR5JywgIGxhYmVsOiAnSWRlbnRpdHknLCAgICAgICBjb2xzOiBbJ2NzdlNlcU5vJywgJ3RleHQnLCAncGlwZWxpbmVSZWYnLCAncmVmTm8nXSB9LFxuICB7IGtleTogJ2dlb21ldHJ5JywgIGxhYmVsOiAnR2VvbWV0cnknLCAgICAgICAgY29sczogWydib3JlJywgJ2VwMScsICdlcDInLCAnY3AnLCAnYnAnXSB9LFxuICB7IGtleTogJ3N1cHBvcnQnLCAgIGxhYmVsOiAnU3VwcG9ydCAvIFNLRVknLCAgY29sczogWydza2V5JywgJ3N1cHBvcnRDb29yJywgJ3N1cHBvcnRHdWlkJ10gfSxcbiAgeyBrZXk6ICdjYWxjJywgICAgICBsYWJlbDogJ0NhbGN1bGF0ZWQnLCAgICAgIGNvbHM6IFsnbGVuMScsJ2F4aXMxJywnbGVuMicsJ2F4aXMyJywnbGVuMycsJ2F4aXMzJywnYnJsZW4nLCdkZWx0YVgnLCdkZWx0YVknLCdkZWx0YVonXSB9LFxuICB7IGtleTogJ2Rlcml2ZWQnLCAgIGxhYmVsOiAnRGVyaXZlZCAvIFB0cnMnLCAgY29sczogWydkaWFtZXRlcicsJ3dhbGxUaGljaycsJ2JlbmRQdHInLCdyaWdpZFB0cicsJ2ludFB0cicsICdMSU5FTk9fS0VZJywgJ1JBVElORycsICdQSVBJTkdfQ0xBU1MnXSB9LFxuICB7IGtleTogJ2NhcycsICAgICAgIGxhYmVsOiAnQ0EgQXR0cnMnLCAgICAgICAgY29sczogWydjYSddIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gRGF0YVRhYmxlVGFiKHsgc3RhZ2UgPSBcIjFcIiB9KSB7XG4gIGNvbnN0IHsgc3RhdGUsIGRpc3BhdGNoIH0gPSB1c2VBcHBDb250ZXh0KCk7XG4gIGNvbnN0IFtmaWx0ZXJBY3Rpb24sIHNldEZpbHRlckFjdGlvbl0gPSBSZWFjdC51c2VTdGF0ZSgnQUxMJyk7XG4gIGNvbnN0IFtkaWZmTW9kZSwgc2V0RGlmZk1vZGVdID0gUmVhY3QudXNlU3RhdGUoZmFsc2UpO1xuICBjb25zdCBbc2VhcmNoVGV4dCwgc2V0U2VhcmNoVGV4dF0gPSBSZWFjdC51c2VTdGF0ZSgnJyk7XG4gIC8vIEdyb3VwcyBoaWRkZW4gYnkgZGVmYXVsdDogZGVyaXZlZCwgcHRycy4gQ0FzIGFyZSBub3cgdmlzaWJsZSBieSBkZWZhdWx0LlxuICBjb25zdCBbaGlkZGVuR3JvdXBzLCBzZXRIaWRkZW5Hcm91cHNdID0gUmVhY3QudXNlU3RhdGUoKCkgPT4gbmV3IFNldCgpKTtcbiAgY29uc3QgW3Nob3dDb2xQYW5lbCwgc2V0U2hvd0NvbFBhbmVsXSA9IFJlYWN0LnVzZVN0YXRlKGZhbHNlKTtcblxuICBjb25zdCBbc29ydENvbmZpZywgc2V0U29ydENvbmZpZ10gPSBSZWFjdC51c2VTdGF0ZSh7IGtleTogJ19yb3dJbmRleCcsIGRpcmVjdGlvbjogJ2FzYycgfSk7XG4gIGNvbnN0IFtjb2x1bW5GaWx0ZXJzLCBzZXRDb2x1bW5GaWx0ZXJzXSA9IFJlYWN0LnVzZVN0YXRlKHt9KTtcblxuICBjb25zdCBoYW5kbGVTb3J0ID0gKGtleSkgPT4ge1xuICAgIGxldCBkaXJlY3Rpb24gPSAnYXNjJztcbiAgICBpZiAoc29ydENvbmZpZy5rZXkgPT09IGtleSAmJiBzb3J0Q29uZmlnLmRpcmVjdGlvbiA9PT0gJ2FzYycpIGRpcmVjdGlvbiA9ICdkZXNjJztcbiAgICBzZXRTb3J0Q29uZmlnKHsga2V5LCBkaXJlY3Rpb24gfSk7XG4gIH07XG5cblxuICBjb25zdCBjb2xWaXNpYmxlID0gKGdyb3VwS2V5KSA9PiAhaGlkZGVuR3JvdXBzLmhhcyhncm91cEtleSk7XG4gIGNvbnN0IHRvZ2dsZUdyb3VwID0gKGtleSkgPT4gc2V0SGlkZGVuR3JvdXBzKHByZXYgPT4ge1xuICAgIGNvbnN0IG5leHQgPSBuZXcgU2V0KHByZXYpO1xuICAgIG5leHQuaGFzKGtleSkgPyBuZXh0LmRlbGV0ZShrZXkpIDogbmV4dC5hZGQoa2V5KTtcbiAgICByZXR1cm4gbmV4dDtcbiAgfSk7XG5cbiAgbGV0IGN1cnJlbnREYXRhO1xuICBpZiAoc3RhZ2UgPT09IFwiMVwiKSBjdXJyZW50RGF0YSA9IHN0YXRlLmRhdGFUYWJsZTtcbiAgZWxzZSBpZiAoc3RhZ2UgPT09IFwiMlwiKSBjdXJyZW50RGF0YSA9IHN0YXRlLnN0YWdlMkRhdGE7XG4gIGVsc2UgaWYgKHN0YWdlID09PSBcIjNcIikgY3VycmVudERhdGEgPSBzdGF0ZS5zdGFnZTNEYXRhO1xuXG4gIGNvbnN0IGRhdGFUYWJsZSA9IGN1cnJlbnREYXRhO1xuXG4gIGNvbnN0IGhhbmRsZUFwcHJvdmUgPSAocm93SW5kZXgsIGFwcHJvdmUpID0+IHtcbiAgICAgIGNvbnN0IHVwZGF0ZWRUYWJsZSA9IFsuLi5kYXRhVGFibGVdO1xuICAgICAgY29uc3Qgcm93SWR4ID0gdXBkYXRlZFRhYmxlLmZpbmRJbmRleChyID0+IHIuX3Jvd0luZGV4ID09PSByb3dJbmRleCk7XG4gICAgICBpZiAocm93SWR4ID4gLTEpIHtcbiAgICAgICAgICB1cGRhdGVkVGFibGVbcm93SWR4XSA9IHsgLi4udXBkYXRlZFRhYmxlW3Jvd0lkeF0sIF9maXhBcHByb3ZlZDogYXBwcm92ZSB9O1xuICAgICAgICAgIGlmIChzdGFnZSA9PT0gXCIxXCIpIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfREFUQV9UQUJMRVwiLCBwYXlsb2FkOiB1cGRhdGVkVGFibGUgfSk7XG4gICAgICAgICAgaWYgKHN0YWdlID09PSBcIjJcIikgZGlzcGF0Y2goeyB0eXBlOiBcIlNFVF9TVEFHRV8yX0RBVEFcIiwgcGF5bG9hZDogdXBkYXRlZFRhYmxlIH0pO1xuICAgICAgICAgIGlmIChzdGFnZSA9PT0gXCIzXCIpIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBR0VfM19EQVRBXCIsIHBheWxvYWQ6IHVwZGF0ZWRUYWJsZSB9KTtcblxuICAgICAgICAgIGNvbnN0IGFjdGlvblRleHQgPSBhcHByb3ZlID8gJ0FwcHJvdmVkJyA6ICdSZWplY3RlZCc7XG4gICAgICAgICAgY29uc3Qgcm93RGVzY3JpcHRpb24gPSB1cGRhdGVkVGFibGVbcm93SWR4XS5maXhpbmdBY3Rpb24gPyB1cGRhdGVkVGFibGVbcm93SWR4XS5maXhpbmdBY3Rpb24uc3Vic3RyaW5nKDAsIDUwKSArIFwiLi4uXCIgOiBcIlwiO1xuXG4gICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIkFERF9MT0dcIiwgcGF5bG9hZDoge1xuICAgICAgICAgICAgIHN0YWdlOiBcIkZJWElOR1wiLFxuICAgICAgICAgICAgIHR5cGU6IGFwcHJvdmUgPyBcIkFwcGxpZWRcIiA6IFwiV2FybmluZ1wiLFxuICAgICAgICAgICAgIHJvdzogcm93SW5kZXgsXG4gICAgICAgICAgICAgbWVzc2FnZTogYFVzZXIgJHthY3Rpb25UZXh0fSBGaXg6ICR7cm93RGVzY3JpcHRpb259YFxuICAgICAgICAgIH19KTtcblxuICAgICAgICAgIC8vIEVuc3VyZSBadXN0YW5kIHByb3Bvc2FscyBtYXRjaCB0aGlzIHN0YXRlIHNvIDNEIGNhbnZhcyBwb3B1cHMgdHVybiBncmVlblxuICAgICAgICAgIGlmIChzdGFnZSA9PT0gXCIyXCIpIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0UHJvcG9zYWxTdGF0dXMocm93SW5kZXgsIGFwcHJvdmUpO1xuICAgICAgfVxuICB9O1xuXG4gIGNvbnN0IGhhbmRsZUF1dG9BcHByb3ZlQWxsID0gKGFjdGlvblR5cGUgPSAnQUxMJykgPT4ge1xuICAgICAgY29uc3QgdXBkYXRlZFRhYmxlID0gZGF0YVRhYmxlLm1hcChyID0+IHtcbiAgICAgICAgICBpZiAoYWN0aW9uVHlwZSA9PT0gJ1JFSkVDVF9BTEwnKSB7XG4gICAgICAgICAgICAgIGlmIChyLmZpeGluZ0FjdGlvbiAmJiAhci5maXhpbmdBY3Rpb24uaW5jbHVkZXMoJ0VSUk9SJykgJiYgci5fZml4QXBwcm92ZWQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgaWYgKHN0YWdlID09PSBcIjJcIikgdXNlU3RvcmUuZ2V0U3RhdGUoKS5zZXRQcm9wb3NhbFN0YXR1cyhyLl9yb3dJbmRleCwgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgLi4uciwgX2ZpeEFwcHJvdmVkOiBmYWxzZSB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiByO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChyLmZpeGluZ0FjdGlvblRpZXIgJiYgci5maXhpbmdBY3Rpb25UaWVyIDw9IDIpIHtcbiAgICAgICAgICAgICAgY29uc3QgYWN0aW9uTWF0Y2ggPSBhY3Rpb25UeXBlID09PSAnQUxMJyB8fCAoci5maXhpbmdBY3Rpb24gJiYgci5maXhpbmdBY3Rpb24uaW5jbHVkZXMoYWN0aW9uVHlwZSkpO1xuICAgICAgICAgICAgICBpZiAoYWN0aW9uTWF0Y2ggJiYgci5fZml4QXBwcm92ZWQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgaWYgKHN0YWdlID09PSBcIjJcIikgdXNlU3RvcmUuZ2V0U3RhdGUoKS5zZXRQcm9wb3NhbFN0YXR1cyhyLl9yb3dJbmRleCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICByZXR1cm4geyAuLi5yLCBfZml4QXBwcm92ZWQ6IHRydWUgfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gcjtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBtc2cgPSBhY3Rpb25UeXBlID09PSAnUkVKRUNUX0FMTCcgPyBcIlJlamVjdGVkIGFsbCBwZW5kaW5nIHByb3Bvc2Fscy5cIiA6IGBBcHByb3ZlZCAke2FjdGlvblR5cGUgPT09ICdBTEwnID8gJ2FsbCBUaWVyIDEvMicgOiBhY3Rpb25UeXBlfSBwcm9wb3NhbHMuYDtcbiAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IHsgc3RhZ2U6IFwiRklYSU5HXCIsIHR5cGU6IFwiSW5mb1wiLCBtZXNzYWdlOiBtc2cgfX0pO1xuXG4gICAgICBpZiAoc3RhZ2UgPT09IFwiMVwiKSBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX0RBVEFfVEFCTEVcIiwgcGF5bG9hZDogdXBkYXRlZFRhYmxlIH0pO1xuICAgICAgaWYgKHN0YWdlID09PSBcIjJcIikgZGlzcGF0Y2goeyB0eXBlOiBcIlNFVF9TVEFHRV8yX0RBVEFcIiwgcGF5bG9hZDogdXBkYXRlZFRhYmxlIH0pO1xuICAgICAgaWYgKHN0YWdlID09PSBcIjNcIikgZGlzcGF0Y2goeyB0eXBlOiBcIlNFVF9TVEFHRV8zX0RBVEFcIiwgcGF5bG9hZDogdXBkYXRlZFRhYmxlIH0pO1xuICB9O1xuXG5cbiAgY29uc3QgaGFuZGxlQ2FsY3VsYXRlTWlzc2luZ0dlb21ldHJ5ID0gKCkgPT4ge1xuICAgICAgIGxldCBiZW5kUHRyID0gMCwgcmlnaWRQdHIgPSAwLCBpbnRQdHIgPSAwO1xuICAgICAgIGxldCB1cGRhdGVkSXRlbXMgPSB7IGJvcmU6IDAsIGJvcmVGYjogMCwgY3A6IDAsIGRlbHRhOiAwLCBsZW46IDAsIHB0cjogMCB9O1xuXG4gICAgICAgY29uc3QgZ2V0QXhpcyA9IChlcDEsIGVwMikgPT4ge1xuICAgICAgICAgICAgY29uc3QgZHggPSBlcDIueCAtIGVwMS54O1xuICAgICAgICAgICAgY29uc3QgZHkgPSBlcDIueSAtIGVwMS55O1xuICAgICAgICAgICAgY29uc3QgZHogPSBlcDIueiAtIGVwMS56O1xuICAgICAgICAgICAgY29uc3QgYWJzWCA9IE1hdGguYWJzKGR4KTtcbiAgICAgICAgICAgIGNvbnN0IGFic1kgPSBNYXRoLmFicyhkeSk7XG4gICAgICAgICAgICBjb25zdCBhYnNaID0gTWF0aC5hYnMoZHopO1xuICAgICAgICAgICAgaWYgKGFic1ggPiBhYnNZICYmIGFic1ggPiBhYnNaKSByZXR1cm4gZHggPiAwID8gJ0Vhc3QnIDogJ1dlc3QnO1xuICAgICAgICAgICAgaWYgKGFic1kgPiBhYnNYICYmIGFic1kgPiBhYnNaKSByZXR1cm4gZHkgPiAwID8gJ1VwJyA6ICdEb3duJztcbiAgICAgICAgICAgIGlmIChhYnNaID4gYWJzWCAmJiBhYnNaID4gYWJzWSkgcmV0dXJuIGR6ID4gMCA/ICdOb3J0aCcgOiAnU291dGgnO1xuICAgICAgICAgICAgcmV0dXJuICdVJztcbiAgICAgICB9O1xuXG4gICAgICAgY29uc3QgZGlzdCA9IChlcDEsIGVwMikgPT4gTWF0aC5zcXJ0KChlcDIueC1lcDEueCkqKjIgKyAoZXAyLnktZXAxLnkpKioyICsgKGVwMi56LWVwMS56KSoqMik7XG5cbiAgICAgICBjb25zdCB1cGRhdGVkVGFibGUgPSBkYXRhVGFibGUubWFwKChyb3csIGluZGV4LCBhcnIpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHIgPSB7IC4uLnJvdyB9O1xuICAgICAgICAgICAgY29uc3QgdCA9IHIudHlwZSB8fCBcIlwiO1xuXG4gICAgICAgICAgICAvLyBBdXRvIGluaGVyaXQgYm9yZSBmcm9tIHByZXZpb3VzIHJvdyBpZiBtaXNzaW5nXG4gICAgICAgICAgICBpZiAoKCFyLmJvcmUgfHwgci5ib3JlID09PSBcIlwiKSAmJiBpbmRleCA+IDApIHtcbiAgICAgICAgICAgICAgICAgY29uc3QgcHJldiA9IGFycltpbmRleCAtIDFdO1xuICAgICAgICAgICAgICAgICBpZiAocHJldi5ib3JlKSB7XG4gICAgICAgICAgICAgICAgICAgICByLmJvcmUgPSBwcmV2LmJvcmU7XG4gICAgICAgICAgICAgICAgICAgICByLl9tb2RpZmllZCA9IHIuX21vZGlmaWVkIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICAgci5fbW9kaWZpZWQuYm9yZSA9IFwiSW5oZXJpdGVkXCI7XG4gICAgICAgICAgICAgICAgICAgICB1cGRhdGVkSXRlbXMuYm9yZSsrO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBNaXNzaW5nIEJvcmUgZmFsbGJhY2sgZm9yIFBJUEVTXG4gICAgICAgICAgICBpZiAoKCFyLmJvcmUgfHwgci5ib3JlID09PSBcIlwiKSAmJiB0ID09PSBcIlBJUEVcIiAmJiByLmVwMSAmJiByLmVwMikge1xuICAgICAgICAgICAgICAgIHIuYm9yZSA9IDEwMDtcbiAgICAgICAgICAgICAgICByLl9tb2RpZmllZCA9IHIuX21vZGlmaWVkIHx8IHt9O1xuICAgICAgICAgICAgICAgIHIuX21vZGlmaWVkLmJvcmUgPSBcIkZhbGxiYWNrXCI7XG4gICAgICAgICAgICAgICAgdXBkYXRlZEl0ZW1zLmJvcmVGYisrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gTWlzc2luZyBDUCBmb3IgVEVFU1xuICAgICAgICAgICAgaWYgKHQgPT09IFwiVEVFXCIgJiYgKCFyLmNwIHx8IChyLmNwLnggPT09IHVuZGVmaW5lZCAmJiByLmNwLnkgPT09IHVuZGVmaW5lZCAmJiByLmNwLnogPT09IHVuZGVmaW5lZCkgfHwgKHIuY3AueCA9PT0gMCAmJiByLmNwLnkgPT09IDAgJiYgci5jcC56ID09PSAwKSkgJiYgci5lcDEgJiYgci5lcDIpIHtcbiAgICAgICAgICAgICAgICByLmNwID0ge1xuICAgICAgICAgICAgICAgICAgICB4OiAoci5lcDEueCArIHIuZXAyLngpIC8gMixcbiAgICAgICAgICAgICAgICAgICAgeTogKHIuZXAxLnkgKyByLmVwMi55KSAvIDIsXG4gICAgICAgICAgICAgICAgICAgIHo6IChyLmVwMS56ICsgci5lcDIueikgLyAyXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByLl9tb2RpZmllZCA9IHIuX21vZGlmaWVkIHx8IHt9O1xuICAgICAgICAgICAgICAgIHIuX21vZGlmaWVkLmNwID0gXCJDYWxjdWxhdGVkIE1pZHBvaW50XCI7XG4gICAgICAgICAgICAgICAgdXBkYXRlZEl0ZW1zLmNwKys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBWZWN0b3IgRGVsdGFzIChBeGlzKSBpZiBtaXNzaW5nXG4gICAgICAgICAgICBpZiAoci5lcDEgJiYgci5lcDIgJiYgKHIuZGVsdGFYID09PSB1bmRlZmluZWQgfHwgci5kZWx0YVkgPT09IHVuZGVmaW5lZCB8fCByLmRlbHRhWiA9PT0gdW5kZWZpbmVkKSkge1xuICAgICAgICAgICAgICAgIHIuZGVsdGFYID0gci5lcDIueCAtIHIuZXAxLng7XG4gICAgICAgICAgICAgICAgci5kZWx0YVkgPSByLmVwMi55IC0gci5lcDEueTtcbiAgICAgICAgICAgICAgICByLmRlbHRhWiA9IHIuZXAyLnogLSByLmVwMS56O1xuICAgICAgICAgICAgICAgIHIuX21vZGlmaWVkID0gci5fbW9kaWZpZWQgfHwge307XG4gICAgICAgICAgICAgICAgci5fbW9kaWZpZWQuZGVsdGFYID0gXCJDYWxjXCI7XG4gICAgICAgICAgICAgICAgdXBkYXRlZEl0ZW1zLmRlbHRhKys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBMRU4vQVhJU1xuICAgICAgICAgICAgaWYgKHIuZXAxICYmIHIuZXAyKSB7XG4gICAgICAgICAgICAgICAgaWYgKHIubGVuMSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHIubGVuMSA9IGRpc3Qoci5lcDEsIHIuZXAyKTtcbiAgICAgICAgICAgICAgICAgICAgci5heGlzMSA9IGdldEF4aXMoci5lcDEsIHIuZXAyKTtcbiAgICAgICAgICAgICAgICAgICAgci5fbW9kaWZpZWQgPSByLl9tb2RpZmllZCB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgci5fbW9kaWZpZWQubGVuMSA9IFwiQ2FsY1wiO1xuICAgICAgICAgICAgICAgICAgICB1cGRhdGVkSXRlbXMubGVuKys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHQgPT09IFwiVEVFXCIgJiYgci5jcCAmJiByLmJwKSB7XG4gICAgICAgICAgICAgICAgaWYgKHIuYnJsZW4gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICByLmJybGVuID0gZGlzdChyLmNwLCByLmJwKTtcbiAgICAgICAgICAgICAgICAgICAgci5fbW9kaWZpZWQgPSByLl9tb2RpZmllZCB8fCB7fTtcbiAgICAgICAgICAgICAgICAgICAgci5fbW9kaWZpZWQuYnJsZW4gPSBcIkNhbGNcIjtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlZEl0ZW1zLmxlbisrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0ID09PSBcIkJFTkRcIiAmJiByLmVwMSAmJiByLmVwMiAmJiByLmNwKSB7XG4gICAgICAgICAgICAgICAgIGlmIChyLmxlbjEgPT09IHVuZGVmaW5lZCkgeyByLmxlbjEgPSBkaXN0KHIuY3AsIHIuZXAxKTsgci5heGlzMSA9IGdldEF4aXMoci5jcCwgci5lcDEpOyByLl9tb2RpZmllZCA9IHIuX21vZGlmaWVkIHx8IHt9OyByLl9tb2RpZmllZC5sZW4xID0gXCJDYWxjXCI7IHVwZGF0ZWRJdGVtcy5sZW4rKzsgfVxuICAgICAgICAgICAgICAgICBpZiAoci5sZW4yID09PSB1bmRlZmluZWQpIHsgci5sZW4yID0gZGlzdChyLmNwLCByLmVwMik7IHIuYXhpczIgPSBnZXRBeGlzKHIuY3AsIHIuZXAyKTsgci5fbW9kaWZpZWQgPSByLl9tb2RpZmllZCB8fCB7fTsgci5fbW9kaWZpZWQubGVuMiA9IFwiQ2FsY1wiOyB1cGRhdGVkSXRlbXMubGVuKys7IH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUG9pbnRlcnNcbiAgICAgICAgICAgIGlmICh0ID09PSBcIkJFTkRcIikge1xuICAgICAgICAgICAgICAgIGlmICghci5iZW5kUHRyKSB7IHIuYmVuZFB0ciA9ICsrYmVuZFB0cjsgci5fbW9kaWZpZWQgPSByLl9tb2RpZmllZCB8fCB7fTsgci5fbW9kaWZpZWQuYmVuZFB0ciA9IFwiQ2FsY1wiOyB1cGRhdGVkSXRlbXMucHRyKys7IH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodCA9PT0gXCJGTEFOR0VcIiB8fCB0ID09PSBcIlZBTFZFXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXIucmlnaWRQdHIpIHsgci5yaWdpZFB0ciA9ICsrcmlnaWRQdHI7IHIuX21vZGlmaWVkID0gci5fbW9kaWZpZWQgfHwge307IHIuX21vZGlmaWVkLnJpZ2lkUHRyID0gXCJDYWxjXCI7IHVwZGF0ZWRJdGVtcy5wdHIrKzsgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICh0ID09PSBcIlRFRVwiIHx8IHQgPT09IFwiT0xFVFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFyLmludFB0cikgeyByLmludFB0ciA9ICsraW50UHRyOyByLl9tb2RpZmllZCA9IHIuX21vZGlmaWVkIHx8IHt9OyByLl9tb2RpZmllZC5pbnRQdHIgPSBcIkNhbGNcIjsgdXBkYXRlZEl0ZW1zLnB0cisrOyB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIERpbWVuc2lvbnMgbG9va3VwIChtb2NrZWQgb3IgZmFsbGJhY2sgdG8gY2EgZGF0YSlcbiAgICAgICAgICAgIGlmICghci5kaWFtZXRlciAmJiByLmJvcmUpIHtcbiAgICAgICAgICAgICAgICByLmRpYW1ldGVyID0gci5ib3JlOyAvLyBiYXNpYyBhcHByb3hcbiAgICAgICAgICAgICAgICByLl9tb2RpZmllZCA9IHIuX21vZGlmaWVkIHx8IHt9O1xuICAgICAgICAgICAgICAgIHIuX21vZGlmaWVkLmRpYW1ldGVyID0gXCJDYWxjXCI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiByO1xuICAgICAgIH0pO1xuICAgICAgIGlmIChzdGFnZSA9PT0gXCIxXCIpIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfREFUQV9UQUJMRVwiLCBwYXlsb2FkOiB1cGRhdGVkVGFibGUgfSk7XG4gICAgICAgaWYgKHN0YWdlID09PSBcIjJcIikgZGlzcGF0Y2goeyB0eXBlOiBcIlNFVF9TVEFHRV8yX0RBVEFcIiwgcGF5bG9hZDogdXBkYXRlZFRhYmxlIH0pO1xuICAgICAgIGlmIChzdGFnZSA9PT0gXCIzXCIpIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBR0VfM19EQVRBXCIsIHBheWxvYWQ6IHVwZGF0ZWRUYWJsZSB9KTtcblxuICAgICAgIC8vIFRyaWdnZXIgYSBzeW5jIHNvIFN0YXR1c0JhciBrbm93cyB0YWJsZSBjaGFuZ2VkIGlmIG5lZWRlZFxuICAgICAgIGlmIChzdGFnZSA9PT0gXCIyXCIpIHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudCgnenVzdGFuZC1mb3JjZS1zeW5jJykpO1xuXG4gICAgICAgY29uc3QgYWxlcnRMaW5lcyA9IFtdO1xuICAgICAgIGlmICh1cGRhdGVkSXRlbXMuYm9yZSA+IDApIGFsZXJ0TGluZXMucHVzaChgQm9yZXM6ICR7dXBkYXRlZEl0ZW1zLmJvcmV9YCk7XG4gICAgICAgaWYgKHVwZGF0ZWRJdGVtcy5ib3JlRmIgPiAwKSBhbGVydExpbmVzLnB1c2goYFBpcGUgRmFsbGJhY2tzOiAke3VwZGF0ZWRJdGVtcy5ib3JlRmJ9YCk7XG4gICAgICAgaWYgKHVwZGF0ZWRJdGVtcy5jcCA+IDApIGFsZXJ0TGluZXMucHVzaChgVEVFIENQczogJHt1cGRhdGVkSXRlbXMuY3B9YCk7XG4gICAgICAgaWYgKHVwZGF0ZWRJdGVtcy5kZWx0YSA+IDApIGFsZXJ0TGluZXMucHVzaChgRGVsdGFzOiAke3VwZGF0ZWRJdGVtcy5kZWx0YX1gKTtcbiAgICAgICBpZiAodXBkYXRlZEl0ZW1zLmxlbiA+IDApIGFsZXJ0TGluZXMucHVzaChgTGVuZ3Rocy9BeGlzOiAke3VwZGF0ZWRJdGVtcy5sZW59YCk7XG4gICAgICAgaWYgKHVwZGF0ZWRJdGVtcy5wdHIgPiAwKSBhbGVydExpbmVzLnB1c2goYFB0cnM6ICR7dXBkYXRlZEl0ZW1zLnB0cn1gKTtcblxuICAgICAgIGNvbnN0IG1zZyA9IGFsZXJ0TGluZXMubGVuZ3RoID4gMCA/IGBNaXNzaW5nIEdlbyBDaGVjazogQ2FsY3VsYXRlZCAke2FsZXJ0TGluZXMuam9pbignLCAnKX1gIDogXCJNaXNzaW5nIEdlbyBDaGVjazogTm8gbWlzc2luZyBnZW9tZXRyeSBmb3VuZC5cIjtcbiAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX1NUQVRVU19NRVNTQUdFXCIsIHBheWxvYWQ6IG1zZyB9KTtcbiAgfTtcblxuICBjb25zdCBoYW5kbGVQdWxsU3RhZ2UxID0gKCkgPT4ge1xuICAgICAgLy8gUHVsbHMgRGF0YSBUYWJsZSBmcm9tIFN0YWdlIDEgaW50byBTdGFnZSAyIG1pbnVzIGZpeGluZ0FjdGlvblxuICAgICAgY29uc3Qgc3RhZ2UxRGF0YSA9IHN0YXRlLmRhdGFUYWJsZS5tYXAociA9PiB7XG4gICAgICAgICAgY29uc3QgbmV3Um93ID0geyAuLi5yIH07XG4gICAgICAgICAgZGVsZXRlIG5ld1Jvdy5maXhpbmdBY3Rpb247XG4gICAgICAgICAgZGVsZXRlIG5ld1Jvdy5maXhpbmdBY3Rpb25UaWVyO1xuICAgICAgICAgIGRlbGV0ZSBuZXdSb3cuZml4aW5nQWN0aW9uUnVsZUlkO1xuICAgICAgICAgIGRlbGV0ZSBuZXdSb3cuX2ZpeEFwcHJvdmVkO1xuICAgICAgICAgIGRlbGV0ZSBuZXdSb3cuX3Bhc3NBcHBsaWVkO1xuICAgICAgICAgIHJldHVybiBuZXdSb3c7XG4gICAgICB9KTtcbiAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBR0VfMl9EQVRBXCIsIHBheWxvYWQ6IHN0YWdlMURhdGEgfSk7XG4gICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX1NUQVRVU19NRVNTQUdFXCIsIHBheWxvYWQ6IFwiU3VjY2Vzc2Z1bGx5IHB1bGxlZCBTdGFnZSAxIGRhdGEgaW50byBTdGFnZSAyLlwiIH0pO1xuICB9O1xuXG4gIGNvbnN0IGhhbmRsZVN5bnRheEZpeCA9ICgpID0+IHtcbiAgICAgIGxldCBjYXBzRml4ZWQgPSAwO1xuICAgICAgbGV0IHplcm9GaXhlZCA9IDA7XG5cbiAgICAgIGNvbnN0IHVwZGF0ZWRUYWJsZSA9IGRhdGFUYWJsZS5tYXAociA9PiB7XG4gICAgICAgICAgY29uc3QgbmV3Um93ID0geyAuLi5yIH07XG4gICAgICAgICAgbGV0IGFjdGlvbnNUYWtlbiA9IFtdO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChuZXdSb3cudHlwZSAmJiBuZXdSb3cudHlwZSAhPT0gbmV3Um93LnR5cGUudG9VcHBlckNhc2UoKS50cmltKCkpIHtcbiAgICAgICAgICAgICAgbmV3Um93LnR5cGUgPSBuZXdSb3cudHlwZS50b1VwcGVyQ2FzZSgpLnRyaW0oKTtcbiAgICAgICAgICAgICAgY2Fwc0ZpeGVkKys7XG4gICAgICAgICAgICAgIGFjdGlvbnNUYWtlbi5wdXNoKFwiVHlwZSBDYXBzXCIpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAobmV3Um93LnNrZXkgJiYgbmV3Um93LnNrZXkgIT09IG5ld1Jvdy5za2V5LnRvVXBwZXJDYXNlKCkudHJpbSgpKSB7XG4gICAgICAgICAgICAgIG5ld1Jvdy5za2V5ID0gbmV3Um93LnNrZXkudG9VcHBlckNhc2UoKS50cmltKCk7XG4gICAgICAgICAgICAgIGNhcHNGaXhlZCsrO1xuICAgICAgICAgICAgICBhY3Rpb25zVGFrZW4ucHVzaChcIlNLRVkgQ2Fwc1wiKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBpc1plcm8gPSAocHQpID0+IHB0ICYmIHB0LnggPT09IDAgJiYgcHQueSA9PT0gMCAmJiBwdC56ID09PSAwO1xuICAgICAgICAgIGlmIChpc1plcm8obmV3Um93LmVwMSkpIHsgbmV3Um93LmVwMSA9IG51bGw7IHplcm9GaXhlZCsrOyBhY3Rpb25zVGFrZW4ucHVzaChcIkVQMSAoMCwwLDApXCIpOyB9XG4gICAgICAgICAgaWYgKGlzWmVybyhuZXdSb3cuZXAyKSkgeyBuZXdSb3cuZXAyID0gbnVsbDsgemVyb0ZpeGVkKys7IGFjdGlvbnNUYWtlbi5wdXNoKFwiRVAyICgwLDAsMClcIik7IH1cbiAgICAgICAgICBpZiAoaXNaZXJvKG5ld1Jvdy5jcCkpIHsgbmV3Um93LmNwID0gbnVsbDsgemVyb0ZpeGVkKys7IGFjdGlvbnNUYWtlbi5wdXNoKFwiQ1AgKDAsMCwwKVwiKTsgfVxuICAgICAgICAgIGlmIChpc1plcm8obmV3Um93LmJwKSkgeyBuZXdSb3cuYnAgPSBudWxsOyB6ZXJvRml4ZWQrKzsgYWN0aW9uc1Rha2VuLnB1c2goXCJCUCAoMCwwLDApXCIpOyB9XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKGFjdGlvbnNUYWtlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICBpZiAoci5maXhpbmdBY3Rpb24gJiYgIXIuZml4aW5nQWN0aW9uLmluY2x1ZGVzKCdbQ2xlYXJlZF0nKSkge1xuICAgICAgICAgICAgICAgICAgIG5ld1Jvdy5maXhpbmdBY3Rpb24gPSBgJHtyLmZpeGluZ0FjdGlvbn0g4oCUIFtDbGVhcmVkXSAke2FjdGlvbnNUYWtlbi5qb2luKCcsICcpfWA7XG4gICAgICAgICAgICAgICAgICAgbmV3Um93LmZpeGluZ0FjdGlvblRpZXIgPSAxO1xuICAgICAgICAgICAgICAgfSBlbHNlIGlmICghci5maXhpbmdBY3Rpb24pIHtcbiAgICAgICAgICAgICAgICAgICBuZXdSb3cuZml4aW5nQWN0aW9uID0gYFtDbGVhcmVkXSAke2FjdGlvbnNUYWtlbi5qb2luKCcsICcpfWA7XG4gICAgICAgICAgICAgICAgICAgbmV3Um93LmZpeGluZ0FjdGlvblRpZXIgPSAxO1xuICAgICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gbmV3Um93O1xuICAgICAgfSk7XG4gICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX0RBVEFfVEFCTEVcIiwgcGF5bG9hZDogdXBkYXRlZFRhYmxlIH0pO1xuICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIlNFVF9TVEFUVVNfTUVTU0FHRVwiLCBwYXlsb2FkOiBgU3ludGF4IEZpeCBDb21wbGV0ZTogQ2FwcyBGaXhlZCAoJHtjYXBzRml4ZWR9KSwgKDAsMCwwKSBjbGVhcmVkICgke3plcm9GaXhlZH0pYCB9KTtcbiAgfTtcblxuICBjb25zdCBoYW5kbGVWYWxpZGF0ZVN5bnRheCA9ICgpID0+IHtcbiAgICAgIGNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcigpO1xuICAgICAgY29uc3QgcmVzdWx0cyA9IHJ1blZhbGlkYXRpb25DaGVja2xpc3QoZGF0YVRhYmxlLCBzdGF0ZS5jb25maWcsIGxvZ2dlciwgc3RhZ2UpO1xuXG4gICAgICBsb2dnZXIuZ2V0TG9nKCkuZm9yRWFjaChlbnRyeSA9PiBkaXNwYXRjaCh7IHR5cGU6IFwiQUREX0xPR1wiLCBwYXlsb2FkOiBlbnRyeSB9KSk7XG5cbiAgICAgIGNvbnN0IHJ1bGVDb3VudHMgPSB7fTtcbiAgICAgIGxldCB1cGRhdGVkVGFibGUgPSBbLi4uZGF0YVRhYmxlXTtcbiAgICAgIGxvZ2dlci5nZXRMb2coKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgICAgaWYgKGVudHJ5LnJ1bGVJZCkge1xuICAgICAgICAgICAgIHJ1bGVDb3VudHNbZW50cnkucnVsZUlkXSA9IChydWxlQ291bnRzW2VudHJ5LnJ1bGVJZF0gfHwgMCkgKyAxO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlbnRyeS5yb3cgJiYgZW50cnkudGllcikge1xuICAgICAgICAgIGNvbnN0IHJvdyA9IHVwZGF0ZWRUYWJsZS5maW5kKHIgPT4gci5fcm93SW5kZXggPT09IGVudHJ5LnJvdyk7XG4gICAgICAgICAgaWYgKHJvdykge1xuICAgICAgICAgICAgIC8vIFByZXNlcnZlIGV4aXN0aW5nIHByb3Bvc2FscyBpZiBhbnksIG90aGVyd2lzZSBzZXQgdmFsaWRhdGlvbiBtZXNzYWdlXG4gICAgICAgICAgICAgaWYgKCFyb3cuZml4aW5nQWN0aW9uIHx8IHJvdy5maXhpbmdBY3Rpb24uaW5jbHVkZXMoJ0VSUk9SJykgfHwgcm93LmZpeGluZ0FjdGlvbi5pbmNsdWRlcygnV0FSTklORycpKSB7XG4gICAgICAgICAgICAgICAgcm93LmZpeGluZ0FjdGlvbiA9IGVudHJ5Lm1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgcm93LmZpeGluZ0FjdGlvblRpZXIgPSBlbnRyeS50aWVyO1xuICAgICAgICAgICAgICAgIHJvdy5maXhpbmdBY3Rpb25SdWxlSWQgPSBlbnRyeS5ydWxlSWQ7XG4gICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGlmIChzdGFnZSA9PT0gXCIxXCIpIHtcbiAgICAgICAgICB1cGRhdGVkVGFibGUgPSB1cGRhdGVkVGFibGUubWFwKHIgPT4ge1xuICAgICAgICAgICAgICBjb25zdCByb3cgPSB7IC4uLnIgfTtcbiAgICAgICAgICAgICAgbGV0IGV4cGVjdGVkRml4ZXMgPSBbXTtcbiAgICAgICAgICAgICAgaWYgKHJvdy50eXBlICYmIHJvdy50eXBlICE9PSByb3cudHlwZS50b1VwcGVyQ2FzZSgpLnRyaW0oKSkgZXhwZWN0ZWRGaXhlcy5wdXNoKFwiVHlwZSBDYXBzXCIpO1xuICAgICAgICAgICAgICBpZiAocm93LnNrZXkgJiYgcm93LnNrZXkgIT09IHJvdy5za2V5LnRvVXBwZXJDYXNlKCkudHJpbSgpKSBleHBlY3RlZEZpeGVzLnB1c2goXCJTS0VZIENhcHNcIik7XG5cbiAgICAgICAgICAgICAgY29uc3QgaXNaZXJvID0gKHB0KSA9PiBwdCAmJiBwdC54ID09PSAwICYmIHB0LnkgPT09IDAgJiYgcHQueiA9PT0gMDtcbiAgICAgICAgICAgICAgaWYgKGlzWmVybyhyb3cuZXAxKSkgZXhwZWN0ZWRGaXhlcy5wdXNoKFwiRVAxICgwLDAsMClcIik7XG4gICAgICAgICAgICAgIGlmIChpc1plcm8ocm93LmVwMikpIGV4cGVjdGVkRml4ZXMucHVzaChcIkVQMiAoMCwwLDApXCIpO1xuICAgICAgICAgICAgICBpZiAoaXNaZXJvKHJvdy5jcCkpIGV4cGVjdGVkRml4ZXMucHVzaChcIkNQICgwLDAsMClcIik7XG4gICAgICAgICAgICAgIGlmIChpc1plcm8ocm93LmJwKSkgZXhwZWN0ZWRGaXhlcy5wdXNoKFwiQlAgKDAsMCwwKVwiKTtcblxuICAgICAgICAgICAgICBpZiAoZXhwZWN0ZWRGaXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBmaXhTdHIgPSBgQ2xlYXIgJHtleHBlY3RlZEZpeGVzLmpvaW4oJywgJyl9YDtcbiAgICAgICAgICAgICAgICAgIGlmIChyb3cuZml4aW5nQWN0aW9uICYmICFyb3cuZml4aW5nQWN0aW9uLmluY2x1ZGVzKCfigJQnKSkge1xuICAgICAgICAgICAgICAgICAgICAgIHJvdy5maXhpbmdBY3Rpb24gPSBgJHtyb3cuZml4aW5nQWN0aW9ufSDigJQgJHtmaXhTdHJ9YDtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIXJvdy5maXhpbmdBY3Rpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICByb3cuZml4aW5nQWN0aW9uID0gYFN5bnRheCBDaGVjayDigJQgJHtmaXhTdHJ9YDtcbiAgICAgICAgICAgICAgICAgICAgICByb3cuZml4aW5nQWN0aW9uVGllciA9IDI7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHJvdztcbiAgICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgaWYgKHN0YWdlID09PSBcIjFcIikgZGlzcGF0Y2goeyB0eXBlOiBcIlNFVF9EQVRBX1RBQkxFXCIsIHBheWxvYWQ6IHVwZGF0ZWRUYWJsZSB9KTtcbiAgICAgIGlmIChzdGFnZSA9PT0gXCIyXCIpIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBR0VfMl9EQVRBXCIsIHBheWxvYWQ6IHVwZGF0ZWRUYWJsZSB9KTtcbiAgICAgIGlmIChzdGFnZSA9PT0gXCIzXCIpIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBR0VfM19EQVRBXCIsIHBheWxvYWQ6IHVwZGF0ZWRUYWJsZSB9KTtcblxuICAgICAgY29uc3Qgc3VtbWFyeVRleHQgPSBPYmplY3QuZW50cmllcyhydWxlQ291bnRzKS5tYXAoKFtydWxlLCBjb3VudF0pID0+IGAke3J1bGV9KCR7Y291bnR9KWApLmpvaW4oJywgJyk7XG4gICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX1NUQVRVU19NRVNTQUdFXCIsIHBheWxvYWQ6IGBWYWxpZGF0aW9uIENvbXBsZXRlOiAke3Jlc3VsdHMuZXJyb3JDb3VudH0gRXJyb3JzLCAke3Jlc3VsdHMud2FybkNvdW50fSBXYXJuaW5ncy4gUnVsZXM6ICR7c3VtbWFyeVRleHQgfHwgJ05vbmUnfWAgfSk7XG4gIH07XG5cbiAgY29uc3QgZml4aW5nQWN0aW9uU3RhdHMgPSBSZWFjdC51c2VNZW1vKCgpID0+IHtcbiAgICBsZXQgYXBwcm92ZWRQMSA9IDAsIHJlamVjdGVkUDEgPSAwLCBwZW5kaW5nUDEgPSAwO1xuICAgIGxldCBhcHByb3ZlZFAyID0gMCwgcmVqZWN0ZWRQMiA9IDAsIHBlbmRpbmdQMiA9IDA7XG4gICAgbGV0IGVyclBhc3MxID0gMCwgd2FyblBhc3MxID0gMDtcbiAgICBsZXQgZXJyUGFzczIgPSAwLCB3YXJuUGFzczIgPSAwO1xuXG4gICAgaWYgKGRhdGFUYWJsZSkge1xuICAgICAgICBkYXRhVGFibGUuZm9yRWFjaChyID0+IHtcbiAgICAgICAgICBpZiAoci5maXhpbmdBY3Rpb24pIHtcbiAgICAgICAgICAgIGNvbnN0IGlzUDIgPSByLl9wYXNzQXBwbGllZCA9PT0gMiB8fCByLl9jdXJyZW50UGFzcyA9PT0gMiB8fCByLmZpeGluZ0FjdGlvbi5pbmNsdWRlcygnWzJuZCBQYXNzXScpO1xuICAgICAgICAgICAgY29uc3QgaXNFcnIgPSByLmZpeGluZ0FjdGlvblRpZXIgPT09IDQgfHwgci5maXhpbmdBY3Rpb24uaW5jbHVkZXMoJ0VSUk9SJyk7XG4gICAgICAgICAgICBjb25zdCBpc1dhcm4gPSByLmZpeGluZ0FjdGlvblRpZXIgPT09IDMgfHwgci5maXhpbmdBY3Rpb24uaW5jbHVkZXMoJ1dBUk5JTkcnKTtcblxuICAgICAgICAgICAgLy8gQ2hlY2sgVmFsaWRhdGlvbiBzdGF0c1xuICAgICAgICAgICAgaWYgKGlzUDIpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNFcnIpIGVyclBhc3MyKys7XG4gICAgICAgICAgICAgICAgaWYgKGlzV2Fybikgd2FyblBhc3MyKys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChpc0VycikgZXJyUGFzczErKztcbiAgICAgICAgICAgICAgICBpZiAoaXNXYXJuKSB3YXJuUGFzczErKztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQ2hlY2sgQWN0aW9uIHN0YXRzXG4gICAgICAgICAgICBpZiAoIWlzRXJyICYmICFpc1dhcm4pIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNQMikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoci5fZml4QXBwcm92ZWQgPT09IHRydWUgfHwgci5fcGFzc0FwcGxpZWQgPT09IDIpIGFwcHJvdmVkUDIrKztcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoci5fZml4QXBwcm92ZWQgPT09IGZhbHNlKSByZWplY3RlZFAyKys7XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgcGVuZGluZ1AyKys7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHIuX2ZpeEFwcHJvdmVkID09PSB0cnVlIHx8IHIuX3Bhc3NBcHBsaWVkID09PSAxKSBhcHByb3ZlZFAxKys7XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHIuX2ZpeEFwcHJvdmVkID09PSBmYWxzZSkgcmVqZWN0ZWRQMSsrO1xuICAgICAgICAgICAgICAgICAgICBlbHNlIHBlbmRpbmdQMSsrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4geyBhcHByb3ZlZFAxLCByZWplY3RlZFAxLCBwZW5kaW5nUDEsIGVyclBhc3MxLCB3YXJuUGFzczEsIGFwcHJvdmVkUDIsIHJlamVjdGVkUDIsIHBlbmRpbmdQMiwgZXJyUGFzczIsIHdhcm5QYXNzMiB9O1xuICB9LCBbc3RhdGUuZGF0YVRhYmxlXSk7XG5cbiAgY29uc3QgZmlsdGVyZWREYXRhVGFibGUgPSBSZWFjdC51c2VNZW1vKCgpID0+IHtcbiAgICAgaWYgKCFkYXRhVGFibGUpIHJldHVybiBbXTtcbiAgICAgbGV0IHJvd3MgPSBkYXRhVGFibGU7XG4gICAgIGlmIChmaWx0ZXJBY3Rpb24gPT09ICdFUlJPUlNfV0FSTklOR1MnKSByb3dzID0gcm93cy5maWx0ZXIociA9PiByLmZpeGluZ0FjdGlvbiAmJiAoci5maXhpbmdBY3Rpb24uaW5jbHVkZXMoJ0VSUk9SJykgfHwgci5maXhpbmdBY3Rpb24uaW5jbHVkZXMoJ1dBUk5JTkcnKSkpO1xuICAgICBlbHNlIGlmIChmaWx0ZXJBY3Rpb24gPT09ICdQUk9QT1NBTFMnKSByb3dzID0gcm93cy5maWx0ZXIociA9PiByLmZpeGluZ0FjdGlvbiAmJiAhci5maXhpbmdBY3Rpb24uaW5jbHVkZXMoJ0VSUk9SJykgJiYgIXIuZml4aW5nQWN0aW9uLmluY2x1ZGVzKCdXQVJOSU5HJykpO1xuICAgICBlbHNlIGlmIChmaWx0ZXJBY3Rpb24gPT09ICdQRU5ESU5HJykgcm93cyA9IHJvd3MuZmlsdGVyKHIgPT4gci5maXhpbmdBY3Rpb24gJiYgci5fZml4QXBwcm92ZWQgPT09IHVuZGVmaW5lZCk7XG4gICAgIGVsc2UgaWYgKGZpbHRlckFjdGlvbiA9PT0gJ0FQUFJPVkVEJykgcm93cyA9IHJvd3MuZmlsdGVyKHIgPT4gci5fZml4QXBwcm92ZWQgPT09IHRydWUpO1xuICAgICBlbHNlIGlmIChmaWx0ZXJBY3Rpb24gPT09ICdSRUpFQ1RFRCcpIHJvd3MgPSByb3dzLmZpbHRlcihyID0+IHIuX2ZpeEFwcHJvdmVkID09PSBmYWxzZSk7XG4gICAgIGVsc2UgaWYgKGZpbHRlckFjdGlvbiA9PT0gJ0hBU19GSVhJTkdfQUNUSU9OJykgcm93cyA9IHJvd3MuZmlsdGVyKHIgPT4gci5maXhpbmdBY3Rpb24pO1xuXG4gICAgIGlmIChzZWFyY2hUZXh0LnRyaW0oKSkge1xuICAgICAgIGNvbnN0IHEgPSBzZWFyY2hUZXh0LnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgIHJvd3MgPSByb3dzLmZpbHRlcihyID0+IHtcbiAgICAgICAgIC8vIENoZWNrIHBsYWluIHN0cmluZyBmaWVsZHNcbiAgICAgICAgIGNvbnN0IHN0ckZpZWxkcyA9IFtyLnR5cGUsIHIudGV4dCwgci5waXBlbGluZVJlZiwgci5yZWZObywgci5za2V5LCByLnN1cHBvcnRHdWlkLCByLmZpeGluZ0FjdGlvbl07XG4gICAgICAgICBpZiAoc3RyRmllbGRzLnNvbWUodiA9PiB2ICYmIFN0cmluZyh2KS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHEpKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAvLyBDaGVjayBib3JlICsgbnVtZXJpY1xuICAgICAgICAgaWYgKFN0cmluZyhyLmJvcmUgPz8gJycpLmluY2x1ZGVzKHEpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgIC8vIENoZWNrIHJvdyBpbmRleFxuICAgICAgICAgaWYgKFN0cmluZyhyLl9yb3dJbmRleCkuaW5jbHVkZXMocSkpIHJldHVybiB0cnVlO1xuICAgICAgICAgLy8gQ2hlY2sgY29vcmRzXG4gICAgICAgICBjb25zdCBmbXRDID0gKGMpID0+IGMgPyBgJHtjLnh9ICR7Yy55fSAke2Muen1gIDogJyc7XG4gICAgICAgICBpZiAoW3IuZXAxLCByLmVwMiwgci5jcCwgci5icF0uc29tZShjID0+IGZtdEMoYykuaW5jbHVkZXMocSkpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgIC8vIENoZWNrIENBIHZhbHVlc1xuICAgICAgICAgaWYgKHIuY2EgJiYgT2JqZWN0LnZhbHVlcyhyLmNhKS5zb21lKHYgPT4gU3RyaW5nKHYgPz8gJycpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocSkpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICB9KTtcbiAgICAgfVxuXG4gICAgIC8vIENvbHVtbiBmaWx0ZXJzXG4gICAgIGlmIChPYmplY3Qua2V5cyhjb2x1bW5GaWx0ZXJzKS5sZW5ndGggPiAwKSB7XG4gICAgICAgIHJvd3MgPSByb3dzLmZpbHRlcihyID0+IHtcbiAgICAgICAgICAgZm9yIChjb25zdCBbY29sLCB2YWxdIG9mIE9iamVjdC5lbnRyaWVzKGNvbHVtbkZpbHRlcnMpKSB7XG4gICAgICAgICAgICAgICBpZiAoIXZhbCkgY29udGludWU7XG4gICAgICAgICAgICAgICBjb25zdCBjZWxsVmFsID0gU3RyaW5nKHJbY29sXSB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgIGlmICghY2VsbFZhbC5pbmNsdWRlcyh2YWwudG9Mb3dlckNhc2UoKSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgfVxuICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSk7XG4gICAgIH1cblxuICAgICAvLyBTb3J0IGxvZ2ljXG4gICAgIGlmIChzb3J0Q29uZmlnLmtleSkge1xuICAgICAgICByb3dzID0gWy4uLnJvd3NdLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgICAgIGxldCB2YWxBID0gYVtzb3J0Q29uZmlnLmtleV07XG4gICAgICAgICAgICBsZXQgdmFsQiA9IGJbc29ydENvbmZpZy5rZXldO1xuICAgICAgICAgICAgaWYgKHZhbEEgPT0gbnVsbCkgdmFsQSA9ICcnO1xuICAgICAgICAgICAgaWYgKHZhbEIgPT0gbnVsbCkgdmFsQiA9ICcnO1xuXG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbEEgPT09ICdudW1iZXInICYmIHR5cGVvZiB2YWxCID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICAgIHJldHVybiBzb3J0Q29uZmlnLmRpcmVjdGlvbiA9PT0gJ2FzYycgPyB2YWxBIC0gdmFsQiA6IHZhbEIgLSB2YWxBO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHNvcnRDb25maWcuZGlyZWN0aW9uID09PSAnYXNjJyA/IFN0cmluZyh2YWxBKS5sb2NhbGVDb21wYXJlKFN0cmluZyh2YWxCKSkgOiBTdHJpbmcodmFsQikubG9jYWxlQ29tcGFyZShTdHJpbmcodmFsQSkpO1xuICAgICAgICB9KTtcbiAgICAgfVxuXG4gICAgIHJldHVybiByb3dzO1xuICB9LCBbZGF0YVRhYmxlLCBmaWx0ZXJBY3Rpb24sIHNlYXJjaFRleHRdKTtcblxuICBpZiAoc3RhZ2UgPT09IFwiM1wiICYmICghY3VycmVudERhdGEgfHwgY3VycmVudERhdGEubGVuZ3RoID09PSAwKSkge1xuXG4gIGNvbnN0IHJlbmRlclNvcnRIZWFkZXIgPSAoa2V5LCBsYWJlbCwgY2xhc3NOYW1lID0gXCJcIikgPT4gKFxuICAgICAgPHRoIGNsYXNzTmFtZT17YHB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1zZW1pYm9sZCB0ZXh0LXNsYXRlLTcwMCBib3JkZXItciBib3JkZXItc2xhdGUtMzAwIGJnLXNsYXRlLTEwMCBjdXJzb3ItcG9pbnRlciBob3ZlcjpiZy1zbGF0ZS0yMDAgc2VsZWN0LW5vbmUgJHtjbGFzc05hbWV9YH0gb25DbGljaz17KCkgPT4gaGFuZGxlU29ydChrZXkpfT5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlblwiPlxuICAgICAgICAgICAgICA8c3Bhbj57bGFiZWx9PC9zcGFuPlxuICAgICAgICAgICAgICB7c29ydENvbmZpZy5rZXkgPT09IGtleSA/IChzb3J0Q29uZmlnLmRpcmVjdGlvbiA9PT0gJ2FzYycgPyA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LVsxMHB4XSBtbC0xIHRleHQtYmx1ZS02MDBcIj7ilrI8L3NwYW4+IDogPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gbWwtMSB0ZXh0LWJsdWUtNjAwXCI+4pa8PC9zcGFuPikgOiA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LVsxMHB4XSBtbC0xIHRleHQtc2xhdGUtNDAwIG9wYWNpdHktMCBncm91cC1ob3ZlcjpvcGFjaXR5LTEwMFwiPuKGlTwvc3Bhbj59XG4gICAgICAgICAgPC9kaXY+XG4gICAgICA8L3RoPlxuICApO1xuXG4gIHJldHVybiAoXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGZsZXgtY29sIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBoLVtjYWxjKDEwMHZoLTEycmVtKV0gdGV4dC1zbGF0ZS01MDAgcC04XCI+XG4gICAgICAgICAgICAgIDxoMiBjbGFzc05hbWU9XCJ0ZXh0LXhsIGZvbnQtYm9sZCBtYi0yIHRleHQtc2xhdGUtNzAwXCI+U3RhZ2UgMzogRmluYWwgQ2hlY2tpbmc8L2gyPlxuICAgICAgICAgICAgICA8cCBjbGFzc05hbWU9XCJtYXgtdy14bCB0ZXh0LWNlbnRlclwiPlRoaXMgaXMgdGhlIGZpbmFsIHZhbGlkYXRpb24gc3RhZ2Ugd2hlcmUgVlhYIHN5bnRheCBydWxlcyBhbmQgUlhYIHRvcG9sb2dpY2FsIHJ1bGVzIGFyZSBleGVjdXRlZCBvbmUgbGFzdCB0aW1lIGJlZm9yZSBleHBvcnQgdG8gZW5zdXJlIG5vIHJlZ3Jlc3Npb25zIHdlcmUgaW50cm9kdWNlZCBkdXJpbmcgU3RhZ2UgMiBmaXhpbmcuPC9wPlxuICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IHtcbiAgICAgICAgICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBR0VfM19EQVRBXCIsIHBheWxvYWQ6IHN0YXRlLnN0YWdlMkRhdGEgfSk7XG4gICAgICAgICAgICAgIH19IGNsYXNzTmFtZT1cIm10LTQgcHgtNCBweS0yIGJnLWJsdWUtNjAwIHRleHQtd2hpdGUgcm91bmRlZCBmb250LW1lZGl1bSBzaGFkb3dcIj5cbiAgICAgICAgICAgICAgICAgIFB1bGwgRGF0YSBmcm9tIFN0YWdlIDJcbiAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICApO1xuICB9XG5cbiAgaWYgKCFkYXRhVGFibGUgfHwgZGF0YVRhYmxlLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChzdGFnZSA9PT0gXCIyXCIpIHtcblxuICBjb25zdCByZW5kZXJTb3J0SGVhZGVyID0gKGtleSwgbGFiZWwsIGNsYXNzTmFtZSA9IFwiXCIpID0+IChcbiAgICAgIDx0aCBjbGFzc05hbWU9e2BweC0zIHB5LTIgdGV4dC1sZWZ0IGZvbnQtc2VtaWJvbGQgdGV4dC1zbGF0ZS03MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTMwMCBiZy1zbGF0ZS0xMDAgY3Vyc29yLXBvaW50ZXIgaG92ZXI6Ymctc2xhdGUtMjAwIHNlbGVjdC1ub25lICR7Y2xhc3NOYW1lfWB9IG9uQ2xpY2s9eygpID0+IGhhbmRsZVNvcnQoa2V5KX0+XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW5cIj5cbiAgICAgICAgICAgICAgPHNwYW4+e2xhYmVsfTwvc3Bhbj5cbiAgICAgICAgICAgICAge3NvcnRDb25maWcua2V5ID09PSBrZXkgPyAoc29ydENvbmZpZy5kaXJlY3Rpb24gPT09ICdhc2MnID8gPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gbWwtMSB0ZXh0LWJsdWUtNjAwXCI+4payPC9zcGFuPiA6IDxzcGFuIGNsYXNzTmFtZT1cInRleHQtWzEwcHhdIG1sLTEgdGV4dC1ibHVlLTYwMFwiPuKWvDwvc3Bhbj4pIDogPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gbWwtMSB0ZXh0LXNsYXRlLTQwMCBvcGFjaXR5LTAgZ3JvdXAtaG92ZXI6b3BhY2l0eS0xMDBcIj7ihpU8L3NwYW4+fVxuICAgICAgICAgIDwvZGl2PlxuICAgICAgPC90aD5cbiAgKTtcblxuICByZXR1cm4gKFxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBmbGV4LWNvbCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgaC1bY2FsYygxMDB2aC0xMnJlbSldIHRleHQtc2xhdGUtNTAwIHAtOFwiPlxuICAgICAgICAgICAgICA8aDIgY2xhc3NOYW1lPVwidGV4dC14bCBmb250LWJvbGQgbWItMiB0ZXh0LXNsYXRlLTcwMFwiPlN0YWdlIDI6IFRvcG9sb2d5ICYgRml4aW5nPC9oMj5cbiAgICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwibWF4LXcteGwgdGV4dC1jZW50ZXIgbWItNlwiPkRhdGEgZm9yIFN0YWdlIDIgKFRvcG9sb2d5ICYgRml4aW5nKSBtdXN0IGJlIGV4cGxpY2l0bHkgcHVsbGVkIGZyb20gU3RhZ2UgMSBhZnRlciBzeW50YXggY2hlY2tzIGFyZSBjb21wbGV0ZS48L3A+XG4gICAgICAgICAgICAgIDxidXR0b24gb25DbGljaz17aGFuZGxlUHVsbFN0YWdlMX0gZGlzYWJsZWQ9eyFzdGF0ZS5kYXRhVGFibGUgfHwgc3RhdGUuZGF0YVRhYmxlLmxlbmd0aCA9PT0gMH0gY2xhc3NOYW1lPVwibXQtNCBweC02IHB5LTMgYmctYW1iZXItNTAwIGhvdmVyOmJnLWFtYmVyLTYwMCB0ZXh0LXdoaXRlIHJvdW5kZWQgZm9udC1ib2xkIHNoYWRvdyBkaXNhYmxlZDpvcGFjaXR5LTUwXCI+XG4gICAgICAgICAgICAgICAgICBQdWxsIERhdGEgZnJvbSBTdGFnZSAxXG4gICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICB7KCFzdGF0ZS5kYXRhVGFibGUgfHwgc3RhdGUuZGF0YVRhYmxlLmxlbmd0aCA9PT0gMCkgJiYgPHAgY2xhc3NOYW1lPVwidGV4dC14cyBtdC0yIHRleHQtcmVkLTUwMFwiPlN0YWdlIDEgaGFzIG5vIGRhdGEuPC9wPn1cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICApO1xuICAgIH1cblxuICBjb25zdCByZW5kZXJTb3J0SGVhZGVyID0gKGtleSwgbGFiZWwsIGNsYXNzTmFtZSA9IFwiXCIpID0+IChcbiAgICAgIDx0aCBjbGFzc05hbWU9e2BweC0zIHB5LTIgdGV4dC1sZWZ0IGZvbnQtc2VtaWJvbGQgdGV4dC1zbGF0ZS03MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTMwMCBiZy1zbGF0ZS0xMDAgY3Vyc29yLXBvaW50ZXIgaG92ZXI6Ymctc2xhdGUtMjAwIHNlbGVjdC1ub25lICR7Y2xhc3NOYW1lfWB9IG9uQ2xpY2s9eygpID0+IGhhbmRsZVNvcnQoa2V5KX0+XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW5cIj5cbiAgICAgICAgICAgICAgPHNwYW4+e2xhYmVsfTwvc3Bhbj5cbiAgICAgICAgICAgICAge3NvcnRDb25maWcua2V5ID09PSBrZXkgPyAoc29ydENvbmZpZy5kaXJlY3Rpb24gPT09ICdhc2MnID8gPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gbWwtMSB0ZXh0LWJsdWUtNjAwXCI+4payPC9zcGFuPiA6IDxzcGFuIGNsYXNzTmFtZT1cInRleHQtWzEwcHhdIG1sLTEgdGV4dC1ibHVlLTYwMFwiPuKWvDwvc3Bhbj4pIDogPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gbWwtMSB0ZXh0LXNsYXRlLTQwMCBvcGFjaXR5LTAgZ3JvdXAtaG92ZXI6b3BhY2l0eS0xMDBcIj7ihpU8L3NwYW4+fVxuICAgICAgICAgIDwvZGl2PlxuICAgICAgPC90aD5cbiAgKTtcblxuICByZXR1cm4gKFxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGZsZXgtY29sIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBoLVtjYWxjKDEwMHZoLTEycmVtKV0gdGV4dC1zbGF0ZS01MDBcIj5cbiAgICAgICAgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgd2lkdGg9XCI2NFwiIGhlaWdodD1cIjY0XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIxXCIgc3Ryb2tlTGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlTGluZWpvaW49XCJyb3VuZFwiIGNsYXNzTmFtZT1cIm1iLTQgdGV4dC1zbGF0ZS00MDBcIj5cbiAgICAgICAgICA8cGF0aCBkPVwiTTE0IDJINmEyIDIgMCAwIDAtMiAydjE2YTIgMiAwIDAgMCAyIDJoMTJhMiAyIDAgMCAwIDItMlY4elwiPjwvcGF0aD5cbiAgICAgICAgICA8cG9seWxpbmUgcG9pbnRzPVwiMTQgMiAxNCA4IDIwIDhcIj48L3BvbHlsaW5lPlxuICAgICAgICAgIDxsaW5lIHgxPVwiMTZcIiB5MT1cIjEzXCIgeDI9XCI4XCIgeTI9XCIxM1wiPjwvbGluZT5cbiAgICAgICAgICA8bGluZSB4MT1cIjE2XCIgeTE9XCIxN1wiIHgyPVwiOFwiIHkyPVwiMTdcIj48L2xpbmU+XG4gICAgICAgICAgPHBvbHlsaW5lIHBvaW50cz1cIjEwIDkgOSA5IDggOVwiPjwvcG9seWxpbmU+XG4gICAgICAgIDwvc3ZnPlxuICAgICAgICA8aDIgY2xhc3NOYW1lPVwidGV4dC14bCBmb250LW1lZGl1bSBtYi0yXCI+Tm8gRGF0YSBMb2FkZWQ8L2gyPlxuICAgICAgICA8cCBjbGFzc05hbWU9XCJtYXgtdy1tZCB0ZXh0LWNlbnRlclwiPkltcG9ydCBhIFBDRiwgQ1NWLCBvciBFeGNlbCBmaWxlIHVzaW5nIHRoZSBidXR0b25zIGluIHRoZSBoZWFkZXIgdG8gcG9wdWxhdGUgdGhlIERhdGEgVGFibGUuPC9wPlxuICAgICAgPC9kaXY+XG4gICAgKTtcbiAgfVxuXG4gIGNvbnN0IHJlbmRlckZpeGluZ0FjdGlvbiA9IChyb3cpID0+IHtcbiAgICBpZiAoIXJvdy5maXhpbmdBY3Rpb24pIHJldHVybiA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTQwMFwiPuKAlDwvc3Bhbj47XG5cbiAgICBjb25zdCB0aWVyQ29sb3JzID0ge1xuICAgICAgMTogeyBiZzogXCJiZy1ncmVlbi01MFwiLCB0ZXh0OiBcInRleHQtZ3JlZW4tODAwXCIsIGJvcmRlcjogXCJib3JkZXItZ3JlZW4tNTAwXCIsIGxhYmVsOiBcIkFVVE8gVDFcIiB9LFxuICAgICAgMjogeyBiZzogXCJiZy1hbWJlci01MFwiLCB0ZXh0OiBcInRleHQtYW1iZXItODAwXCIsIGJvcmRlcjogXCJib3JkZXItYW1iZXItNTAwXCIsIGxhYmVsOiBcIkZJWCBUMlwiIH0sXG4gICAgICAzOiB7IGJnOiBcImJnLW9yYW5nZS01MFwiLCB0ZXh0OiBcInRleHQtb3JhbmdlLTgwMFwiLCBib3JkZXI6IFwiYm9yZGVyLW9yYW5nZS01MDBcIiwgbGFiZWw6IFwiUkVWSUVXIFQzXCIgfSxcbiAgICAgIDQ6IHsgYmc6IFwiYmctcmVkLTUwXCIsIHRleHQ6IFwidGV4dC1yZWQtODAwXCIsIGJvcmRlcjogXCJib3JkZXItcmVkLTUwMFwiLCBsYWJlbDogXCJFUlJPUiBUNFwiIH0sXG4gICAgfTtcblxuICAgIGxldCBjb2xvcnMgPSB0aWVyQ29sb3JzW3Jvdy5maXhpbmdBY3Rpb25UaWVyXSB8fCB0aWVyQ29sb3JzWzNdO1xuICAgIGlmIChyb3cuX3Bhc3NBcHBsaWVkID4gMCkge1xuICAgICAgY29sb3JzID0geyBiZzogXCJiZy1ncmVlbi0xMDBcIiwgdGV4dDogXCJ0ZXh0LWdyZWVuLTkwMFwiLCBib3JkZXI6IFwiYm9yZGVyLWdyZWVuLTYwMFwiLCBsYWJlbDogXCJGSVggQVBQTElFRFwiIH07XG4gICAgfVxuXG4gICAgLy8gQXR0ZW1wdCB0byBzcGxpdCBpbnRvIHZhbGlkYXRpb24gd2FybmluZyBhbmQgcHJvcG9zYWwvYWN0aW9uLlxuICAgIC8vIEUuZy4sIFZhbGlkYXRvciBwdXRzIFwiW1YyXSBFUlJPUi4uLlwiLCBTbWFydEZpeGVyIGFwcGVuZHMgYWN0aW9uLlxuICAgIGxldCB2YWxpZGF0aW9uTXNnID0gcm93LmZpeGluZ0FjdGlvbk9yaWdpbmFsRXJyb3IgfHwgXCJcIjtcbiAgICBsZXQgYWN0aW9uTXNnID0gcm93LmZpeGluZ0FjdGlvbjtcblxuICAgIGxldCBwYXNzUHJlZml4ID0gbnVsbDtcbiAgICBpZiAoYWN0aW9uTXNnICYmIGFjdGlvbk1zZy5pbmNsdWRlcygnWzFzdCBQYXNzXScpKSBwYXNzUHJlZml4ID0gXCJbMXN0IFBhc3NdXCI7XG4gICAgaWYgKGFjdGlvbk1zZyAmJiBhY3Rpb25Nc2cuaW5jbHVkZXMoJ1sybmQgUGFzc10nKSkgcGFzc1ByZWZpeCA9IFwiWzJuZCBQYXNzXVwiO1xuICAgIGlmIChhY3Rpb25Nc2cgJiYgYWN0aW9uTXNnLmluY2x1ZGVzKCdbM3JkIFBhc3NdJykpIHBhc3NQcmVmaXggPSBcIlszcmQgUGFzc11cIjtcbiAgICBpZiAoYWN0aW9uTXNnICYmIGFjdGlvbk1zZy5pbmNsdWRlcygnW1Bhc3MgMV0nKSkgcGFzc1ByZWZpeCA9IFwiWzFzdCBQYXNzXVwiO1xuICAgIGlmIChhY3Rpb25Nc2cgJiYgYWN0aW9uTXNnLmluY2x1ZGVzKCdbUGFzcyAyXScpKSBwYXNzUHJlZml4ID0gXCJbMm5kIFBhc3NdXCI7XG4gICAgaWYgKGFjdGlvbk1zZyAmJiBhY3Rpb25Nc2cuaW5jbHVkZXMoJ1tQYXNzIDNBXScpKSBwYXNzUHJlZml4ID0gXCJbM3JkIFBhc3NdXCI7XG5cbiAgICAvLyBDaGVjayBmb3Igb3VyIGV4cGxpY2l0IG11bHRpbGluZSBmb3JtYXQ6IFtQYXNzIFhdIFtJc3N1ZV0gLi4uIFxcbltQcm9wb3NhbF0gLi4uXG4gICAgY29uc3QgaGFzRXhwbGljaXRUYWdzID0gYWN0aW9uTXNnLmluY2x1ZGVzKCdbSXNzdWVdJykgJiYgYWN0aW9uTXNnLmluY2x1ZGVzKCdbUHJvcG9zYWxdJyk7XG5cbiAgICBpZiAoaGFzRXhwbGljaXRUYWdzKSB7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gYWN0aW9uTXNnLnNwbGl0KCdcXG5bUHJvcG9zYWxdJyk7XG4gICAgICAgIHZhbGlkYXRpb25Nc2cgPSBwYXJ0c1swXS5yZXBsYWNlKC9eXFxbKFxcZCsoc3R8bmR8cmQpP1xccypQYXNzfFBhc3NcXHMqXFx3KylcXF1cXHMqL2ksICcnKS5yZXBsYWNlKCdbSXNzdWVdJywgJycpLnRyaW0oKTtcbiAgICAgICAgYWN0aW9uTXNnID0gcGFydHNbMV0gPyBwYXJ0c1sxXS50cmltKCkgOiBcIlwiO1xuICAgIH0gZWxzZSBpZiAoIXJvdy5maXhpbmdBY3Rpb25PcmlnaW5hbEVycm9yICYmIChyb3cuZml4aW5nQWN0aW9uLmluY2x1ZGVzKCdFUlJPUicpIHx8IHJvdy5maXhpbmdBY3Rpb24uaW5jbHVkZXMoJ1dBUk5JTkcnKSB8fCByb3cuZml4aW5nQWN0aW9uLmluY2x1ZGVzKCdTeW50YXggQ2hlY2snKSkpIHtcbiAgICAgICAgIC8vIEl0J3MgcHJpbWFyaWx5IGEgdmFsaWRhdGlvbiBtZXNzYWdlIG9yIGl0IGhhc24ndCBiZWVuIHNwbGl0IHlldFxuICAgICAgICAgaWYgKHJvdy5maXhpbmdBY3Rpb24uaW5jbHVkZXMoJ+KAlCcpKSB7XG4gICAgICAgICAgICAgY29uc3QgcGFydHMgPSByb3cuZml4aW5nQWN0aW9uLnNwbGl0KCfigJQnKTtcbiAgICAgICAgICAgICB2YWxpZGF0aW9uTXNnID0gcGFydHNbMF0udHJpbSgpO1xuICAgICAgICAgICAgIGFjdGlvbk1zZyA9IHBhcnRzLnNsaWNlKDEpLmpvaW4oJ+KAlCcpLnRyaW0oKTtcblxuICAgICAgICAgICAgIC8vIENoZWNrIGlmIGFjdGlvbk1zZyBkdXBsaWNhdGVzIHZhbGlkYXRpb25Nc2cgKGUuZy4gQ2xlYXJlZCBtZXNzYWdlKVxuICAgICAgICAgICAgIGlmICh2YWxpZGF0aW9uTXNnLmluY2x1ZGVzKGFjdGlvbk1zZykgfHwgYWN0aW9uTXNnLmluY2x1ZGVzKHZhbGlkYXRpb25Nc2cpIHx8IHZhbGlkYXRpb25Nc2cucmVwbGFjZSgvW15hLXpBLVowLTldL2csICcnKSA9PT0gYWN0aW9uTXNnLnJlcGxhY2UoL1teYS16QS1aMC05XS9nLCAnJykpIHtcbiAgICAgICAgICAgICAgICAgYWN0aW9uTXNnID0gXCJcIjsgLy8gUHJldmVudCBkdXBsaWNhdGlvblxuICAgICAgICAgICAgIH1cbiAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgdmFsaWRhdGlvbk1zZyA9IHJvdy5maXhpbmdBY3Rpb247XG4gICAgICAgICAgICAgYWN0aW9uTXNnID0gXCJcIjtcbiAgICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoYWN0aW9uTXNnKSB7XG4gICAgICAgIC8vIFJlbW92ZSBleGlzdGluZyBzdGFuZGFyZCBzY29yZSBwYXR0ZXJucyBlLmcuIChTY29yZTogMTApXG4gICAgICAgIGFjdGlvbk1zZyA9IGFjdGlvbk1zZy5yZXBsYWNlKC9cXChTY29yZTpcXHMqW1xcZC5dK1xcKS9nLCAnJykudHJpbSgpO1xuICAgICAgICAvLyBDYXRjaCBpbmxpbmUgJ1Njb3JlIDggPCAxMCcgZm9ybWF0IHRoYXQgd2FzIHBlcnNpc3RpbmdcbiAgICAgICAgYWN0aW9uTXNnID0gYWN0aW9uTXNnLnJlcGxhY2UoL1Njb3JlXFxzKltcXGQuXSsoXFxzKjxcXHMqXFxkKyk/L2dpLCAnJykudHJpbSgpO1xuICAgICAgICAvLyBDYXRjaCB0cmFpbGluZyBbUGFzcyBYXSB0aGF0IGNvdWxkIGJlIGxlZnQgb3ZlclxuICAgICAgICBhY3Rpb25Nc2cgPSBhY3Rpb25Nc2cucmVwbGFjZSgvXFxbUGFzc1xccypcXGQrQT9cXF0vZ2ksICcnKS50cmltKCk7XG4gICAgICAgIC8vIENhdGNoIGNhc2VzIHdoZXJlIFtQYXNzIFhdIHdhcyByaWdodCBuZXh0IHRvIHRoZSBzY29yZSAoZS5nLiBTY29yZSA4W1Bhc3MgMV0pXG4gICAgICAgIGFjdGlvbk1zZyA9IGFjdGlvbk1zZy5yZXBsYWNlKC9cXCg/KFNjb3JlfHNjb3JlKT9cXHMqOj9cXHMqXFxkKyhcXC5cXGQrKT9cXHMqKDxcXHMqXFxkKyk/XFxzKlxcW1Bhc3NcXHMqXFxkK0E/XFxdXFwpPy9naSwgJycpLnRyaW0oKTtcbiAgICAgICAgLy8gQ2F0Y2ggYW55IHRyYWlsaW5nIGRvdHMgb3IgZGFzaGVzIGZyb20gcHJldmlvdXMgcmVwbGFjZXNcbiAgICAgICAgYWN0aW9uTXNnID0gYWN0aW9uTXNnLnJlcGxhY2UoL15bLVxcc10rfFstXFxzXSskL2csICcnKS50cmltKCk7XG4gICAgICAgIGlmICghaGFzRXhwbGljaXRUYWdzKSB7XG4gICAgICAgICAgICBhY3Rpb25Nc2cgPSBhY3Rpb25Nc2cucmVwbGFjZSgvXlxcWyhcXGQrKHN0fG5kfHJkKT9cXHMqUGFzc3xQYXNzXFxzKlxcdyspXFxdXFxzKi9pLCAnJykudHJpbSgpO1xuICAgICAgICAgICAgY29uc3Qgc3BsaXRJZHggPSBhY3Rpb25Nc2cuaW5kZXhPZignOicpO1xuICAgICAgICAgICAgaWYgKHNwbGl0SWR4ID4gLTEgJiYgc3BsaXRJZHggPCAzMCkge1xuICAgICAgICAgICAgICAgIGFjdGlvbk1zZyA9IGFjdGlvbk1zZy5zdWJzdHJpbmcoc3BsaXRJZHggKyAxKS50cmltKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIXBhc3NQcmVmaXgpIHtcbiAgICAgICAgcGFzc1ByZWZpeCA9IChyb3cuX3Bhc3NBcHBsaWVkID09PSAyIHx8IChyb3cuZml4aW5nQWN0aW9uICYmIHJvdy5maXhpbmdBY3Rpb24uaW5jbHVkZXMoJ1tQYXNzIDJdJykpKSA/IFwiWzJuZCBQYXNzXVwiIDogXCJbMXN0IFBhc3NdXCI7XG4gICAgfVxuXG4gICAgLy8gRmluYWwgY2xlYW4gdXAgZm9yIHZhbGlkYXRpb25Nc2dcbiAgICBpZiAodmFsaWRhdGlvbk1zZykge1xuICAgICAgICB2YWxpZGF0aW9uTXNnID0gdmFsaWRhdGlvbk1zZy5yZXBsYWNlKC9eXFxbKFxcZCsoc3R8bmR8cmQpP1xccypQYXNzfFBhc3NcXHMqXFx3KylcXF1cXHMqL2ksICcnKS5yZXBsYWNlKCdbSXNzdWVdJywgJycpLnRyaW0oKTtcbiAgICAgICAgLy8gQ2F0Y2ggdHJhaWxpbmcgcGFzcyBpZGVudGlmaWVyc1xuICAgICAgICB2YWxpZGF0aW9uTXNnID0gdmFsaWRhdGlvbk1zZy5yZXBsYWNlKC9cXFsoXFxkKyhzdHxuZHxyZCk/XFxzKlBhc3N8UGFzc1xccypcXGQrQT8pXFxdL2dpLCAnJykudHJpbSgpO1xuICAgIH1cblxuXG4gIGNvbnN0IHJlbmRlclNvcnRIZWFkZXIgPSAoa2V5LCBsYWJlbCwgY2xhc3NOYW1lID0gXCJcIikgPT4gKFxuICAgICAgPHRoIGNsYXNzTmFtZT17YHB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1zZW1pYm9sZCB0ZXh0LXNsYXRlLTcwMCBib3JkZXItciBib3JkZXItc2xhdGUtMzAwIGJnLXNsYXRlLTEwMCBjdXJzb3ItcG9pbnRlciBob3ZlcjpiZy1zbGF0ZS0yMDAgc2VsZWN0LW5vbmUgJHtjbGFzc05hbWV9YH0gb25DbGljaz17KCkgPT4gaGFuZGxlU29ydChrZXkpfT5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlblwiPlxuICAgICAgICAgICAgICA8c3Bhbj57bGFiZWx9PC9zcGFuPlxuICAgICAgICAgICAgICB7c29ydENvbmZpZy5rZXkgPT09IGtleSA/IChzb3J0Q29uZmlnLmRpcmVjdGlvbiA9PT0gJ2FzYycgPyA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LVsxMHB4XSBtbC0xIHRleHQtYmx1ZS02MDBcIj7ilrI8L3NwYW4+IDogPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gbWwtMSB0ZXh0LWJsdWUtNjAwXCI+4pa8PC9zcGFuPikgOiA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LVsxMHB4XSBtbC0xIHRleHQtc2xhdGUtNDAwIG9wYWNpdHktMCBncm91cC1ob3ZlcjpvcGFjaXR5LTEwMFwiPuKGlTwvc3Bhbj59XG4gICAgICAgICAgPC9kaXY+XG4gICAgICA8L3RoPlxuICApO1xuXG4gIHJldHVybiAoXG4gICAgICA8ZGl2IGNsYXNzTmFtZT17YCR7Y29sb3JzLmJnfSAke2NvbG9ycy50ZXh0fSBib3JkZXItbC00ICR7Y29sb3JzLmJvcmRlcn0gcC0yIGZvbnQtbW9ubyB0ZXh0LXhzIGxlYWRpbmctcmVsYXhlZCB3aGl0ZXNwYWNlLXByZS13cmFwIHJvdW5kZWQtciBzaGFkb3ctc20gbWluLXctWzI4MHB4XWB9PlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZvbnQtc2VtaWJvbGQgbWItMSBmbGV4IGl0ZW1zLXN0YXJ0IGZsZXgtY29sXCI+XG4gICAgICAgICAgICAge3N0YWdlICE9PSBcIjFcIiAmJiA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTYwMCBtYi0xIHdoaXRlc3BhY2Utbm93cmFwXCI+e3Bhc3NQcmVmaXh9PC9zcGFuPn1cbiAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgtMSB3LWZ1bGxcIj5cbiAgICAgICAgICAgICAgICAge3ZhbGlkYXRpb25Nc2cgJiYgc3RhZ2UgIT09IFwiMVwiICYmIDxzcGFuIGNsYXNzTmFtZT1cInRleHQtc2xhdGUtNTAwIG1yLTEgZm9udC1ib2xkXCI+W0lzc3VlXTwvc3Bhbj59XG4gICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtbm9ybWFsXCI+e3ZhbGlkYXRpb25Nc2d9PC9zcGFuPlxuICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAge2FjdGlvbk1zZyAmJiAoXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17YG10LTFgfT5cbiAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZm9udC1ib2xkIG1yLTEgdGV4dC1zbGF0ZS01MDBcIj57cm93Ll9wYXNzQXBwbGllZCA+IDAgPyBcIltBY3Rpb24gVGFrZW5dXCIgOiBcIltQcm9wb3NhbF1cIn08L3NwYW4+XG4gICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT17YGZvbnQtbm9ybWFsICR7cm93Ll9maXhBcHByb3ZlZCA9PT0gZmFsc2UgPyBcImxpbmUtdGhyb3VnaCBvcGFjaXR5LTcwIHRleHQtYmx1ZS02MDBcIiA6IFwiXCJ9YH0+e2FjdGlvbk1zZ308L3NwYW4+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgKX1cbiAgICAgICAge3N0YWdlICE9PSBcIjFcIiAmJiByb3cuX3Bhc3NBcHBsaWVkID09PSB1bmRlZmluZWQgJiYgIXJvdy5faXNQYXNzaXZlRml4ICYmIGFjdGlvbk1zZyAmJiAoXG4gICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IHNwYWNlLXgtMiBtdC0yIGl0ZW1zLWNlbnRlciBmbGV4LXdyYXAgZ2FwLXktMVwiPlxuICAgICAgICAgICAgICAgIHtyb3cuX2ZpeEFwcHJvdmVkID09PSB0cnVlID8gKFxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LWdyZWVuLTYwMCBmb250LWJvbGQgZmxleCBpdGVtcy1jZW50ZXIgYmctZ3JlZW4tNTAgcHgtMiBweS0xIHJvdW5kZWQgYm9yZGVyIGJvcmRlci1ncmVlbi0yMDBcIj7inJMgQXBwcm92ZWQ8L3NwYW4+XG4gICAgICAgICAgICAgICAgKSA6IHJvdy5fZml4QXBwcm92ZWQgPT09IGZhbHNlID8gKFxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXJlZC02MDAgZm9udC1ib2xkIGZsZXggaXRlbXMtY2VudGVyIGJnLXJlZC01MCBweC0yIHB5LTEgcm91bmRlZCBib3JkZXIgYm9yZGVyLXJlZC0yMDBcIj7inJcgUmVqZWN0ZWQ8L3NwYW4+XG4gICAgICAgICAgICAgICAgKSA6IChcbiAgICAgICAgICAgICAgICAgICAgPD5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4gaGFuZGxlQXBwcm92ZShyb3cuX3Jvd0luZGV4LCB0cnVlKX0gY2xhc3NOYW1lPXtgcHgtMiBweS0xIHRleHQteHMgcm91bmRlZCBzaGFkb3ctc20gdHJhbnNpdGlvbi1jb2xvcnMgYmctd2hpdGUgdGV4dC1zbGF0ZS03MDAgaG92ZXI6Ymctc2xhdGUtNTAgYm9yZGVyIGJvcmRlci1zbGF0ZS0zMDAgZmxleCBpdGVtcy1jZW50ZXIgZm9udC1tZWRpdW1gfT48c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LWdyZWVuLTYwMCBtci0xIGZvbnQtYm9sZFwiPuKckzwvc3Bhbj4gQXBwcm92ZTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXsoKSA9PiBoYW5kbGVBcHByb3ZlKHJvdy5fcm93SW5kZXgsIGZhbHNlKX0gY2xhc3NOYW1lPXtgcHgtMiBweS0xIHRleHQteHMgcm91bmRlZCBzaGFkb3ctc20gdHJhbnNpdGlvbi1jb2xvcnMgYmctd2hpdGUgdGV4dC1zbGF0ZS03MDAgaG92ZXI6Ymctc2xhdGUtNTAgYm9yZGVyIGJvcmRlci1zbGF0ZS0zMDAgZmxleCBpdGVtcy1jZW50ZXIgZm9udC1tZWRpdW1gfT48c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXJlZC02MDAgbXItMSBmb250LWJvbGRcIj7inJc8L3NwYW4+IFJlamVjdCB7cm93LmZpeGluZ0FjdGlvblNjb3JlICE9PSB1bmRlZmluZWQgJiYgYChTY29yZSAke01hdGgucm91bmQocm93LmZpeGluZ0FjdGlvblNjb3JlKX0ke3Jvdy5maXhpbmdBY3Rpb25TY29yZSA8IDEwID8gJyA8IDEwJyA6ICcnfSlgfTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8Lz5cbiAgICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICl9XG4gICAgICA8L2Rpdj5cbiAgICApO1xuICB9O1xuXG4gIGNvbnN0IGZtdENvb3JkID0gKGMpID0+IGMgPyBgJHtjLng/LnRvRml4ZWQoMSl9LCAke2MueT8udG9GaXhlZCgxKX0sICR7Yy56Py50b0ZpeGVkKDEpfWAgOiAn4oCUJztcbiAgY29uc3QgZ2V0Q2VsbENsYXNzID0gKHJvdywgZmllbGQpID0+IHtcbiAgICBpZiAocm93Ll9tb2RpZmllZCAmJiByb3cuX21vZGlmaWVkW2ZpZWxkXSkge1xuICAgICAgICAvLyBDb2xvciBjb2RpbmcgYmFzZWQgb24gcGFzc1xuICAgICAgICBpZiAocm93Ll9wYXNzQXBwbGllZCA9PT0gMSkgcmV0dXJuICdiZy1jeWFuLTUwIHRleHQtY3lhbi04MDAgZm9udC1zZW1pYm9sZCc7XG4gICAgICAgIGlmIChyb3cuX3Bhc3NBcHBsaWVkID09PSAyKSByZXR1cm4gJ2JnLXB1cnBsZS01MCB0ZXh0LXB1cnBsZS04MDAgZm9udC1zZW1pYm9sZCc7XG4gICAgICAgIHJldHVybiAnYmctY3lhbi01MCB0ZXh0LWN5YW4tODAwIGZvbnQtc2VtaWJvbGQnO1xuICAgIH1cbiAgICBpZiAocm93Ll9tb2RpZmllZCAmJiByb3cuX21vZGlmaWVkW2ZpZWxkXSkgcmV0dXJuICdiZy1jeWFuLTUwIHRleHQtY3lhbi04MDAgZm9udC1zZW1pYm9sZCc7XG4gICAgcmV0dXJuICd0ZXh0LXNsYXRlLTYwMCc7XG4gIH07XG5cblxuICBjb25zdCByZW5kZXJTb3J0SGVhZGVyID0gKGtleSwgbGFiZWwsIGNsYXNzTmFtZSA9IFwiXCIpID0+IChcbiAgICAgIDx0aCBjbGFzc05hbWU9e2BweC0zIHB5LTIgdGV4dC1sZWZ0IGZvbnQtc2VtaWJvbGQgdGV4dC1zbGF0ZS03MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTMwMCBiZy1zbGF0ZS0xMDAgY3Vyc29yLXBvaW50ZXIgaG92ZXI6Ymctc2xhdGUtMjAwIHNlbGVjdC1ub25lICR7Y2xhc3NOYW1lfWB9IG9uQ2xpY2s9eygpID0+IGhhbmRsZVNvcnQoa2V5KX0+XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW5cIj5cbiAgICAgICAgICAgICAgPHNwYW4+e2xhYmVsfTwvc3Bhbj5cbiAgICAgICAgICAgICAge3NvcnRDb25maWcua2V5ID09PSBrZXkgPyAoc29ydENvbmZpZy5kaXJlY3Rpb24gPT09ICdhc2MnID8gPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gbWwtMSB0ZXh0LWJsdWUtNjAwXCI+4payPC9zcGFuPiA6IDxzcGFuIGNsYXNzTmFtZT1cInRleHQtWzEwcHhdIG1sLTEgdGV4dC1ibHVlLTYwMFwiPuKWvDwvc3Bhbj4pIDogPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gbWwtMSB0ZXh0LXNsYXRlLTQwMCBvcGFjaXR5LTAgZ3JvdXAtaG92ZXI6b3BhY2l0eS0xMDBcIj7ihpU8L3NwYW4+fVxuICAgICAgICAgIDwvZGl2PlxuICAgICAgPC90aD5cbiAgKTtcblxuICByZXR1cm4gKFxuICAgIDw+XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cIm1iLTIgZmxleCBmbGV4LWNvbCB4bDpmbGV4LXJvdyBqdXN0aWZ5LWJldHdlZW4geGw6aXRlbXMtZW5kIGdhcC0yXCI+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBmbGV4LWNvbCBnYXAtMSB0ZXh0LXhzIGZvbnQtbWVkaXVtIHctZnVsbCB4bDp3LWF1dG9cIj5cbiAgICAgICAgICAgIHtzdGFnZSAhPT0gXCIxXCIgJiYgKFxuICAgICAgICAgICAgICAgIDw+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBmbGV4LXdyYXAgZ2FwLTIgbWItMVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTYwMCBiZy1zbGF0ZS0xMDAgcHgtMyBweS0xIHJvdW5kZWQgYm9yZGVyIGJvcmRlci1zbGF0ZS0yMDAgc2hhZG93LXNtIGZsZXggaXRlbXMtY2VudGVyXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVmFsaWRhdGlvbiBbUGFzcyAxXTpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXJlZC02MDAgbWwtMiBmb250LWJvbGRcIj5FcnJvcnMoe2ZpeGluZ0FjdGlvblN0YXRzLmVyclBhc3MxfSk8L3NwYW4+LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQtb3JhbmdlLTUwMCBtbC0yIGZvbnQtYm9sZFwiPldhcm5pbmdzKHtmaXhpbmdBY3Rpb25TdGF0cy53YXJuUGFzczF9KTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTYwMCBiZy1pbmRpZ28tNTAgcHgtMyBweS0xIHJvdW5kZWQgYm9yZGVyIGJvcmRlci1pbmRpZ28tMjAwIHNoYWRvdy1zbSBmbGV4IGl0ZW1zLWNlbnRlclwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFNtYXJ0IEZpeGluZyBBY3Rpb24gW1Bhc3MgMV06XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1ncmVlbi02MDAgbWwtMiBmb250LWJvbGRcIj5BcHByb3ZlZCh7Zml4aW5nQWN0aW9uU3RhdHMuYXBwcm92ZWRQMX0pPC9zcGFuPixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTUwMCBtbC0yIGZvbnQtYm9sZFwiPlJlamVjdGVkKHtmaXhpbmdBY3Rpb25TdGF0cy5yZWplY3RlZFAxfSk8L3NwYW4+LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQtYW1iZXItNjAwIG1sLTIgZm9udC1ib2xkXCI+UGVuZGluZyh7Zml4aW5nQWN0aW9uU3RhdHMucGVuZGluZ1AxfSk8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIHsoZml4aW5nQWN0aW9uU3RhdHMuZXJyUGFzczIgPiAwIHx8IGZpeGluZ0FjdGlvblN0YXRzLndhcm5QYXNzMiA+IDAgfHwgZml4aW5nQWN0aW9uU3RhdHMuYXBwcm92ZWRQMiA+IDAgfHwgZml4aW5nQWN0aW9uU3RhdHMucGVuZGluZ1AyID4gMCkgJiYgKFxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGZsZXgtd3JhcCBnYXAtMlwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC1zbGF0ZS02MDAgYmctc2xhdGUtMTAwIHB4LTMgcHktMSByb3VuZGVkIGJvcmRlciBib3JkZXItc2xhdGUtMjAwIHNoYWRvdy1zbSBmbGV4IGl0ZW1zLWNlbnRlclwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBWYWxpZGF0aW9uIFtQYXNzIDJdOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXJlZC02MDAgbWwtMiBmb250LWJvbGRcIj5FcnJvcnMoe2ZpeGluZ0FjdGlvblN0YXRzLmVyclBhc3MyfSk8L3NwYW4+LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LW9yYW5nZS01MDAgbWwtMiBmb250LWJvbGRcIj5XYXJuaW5ncyh7Zml4aW5nQWN0aW9uU3RhdHMud2FyblBhc3MyfSk8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTYwMCBiZy1wdXJwbGUtNTAgcHgtMyBweS0xIHJvdW5kZWQgYm9yZGVyIGJvcmRlci1wdXJwbGUtMjAwIHNoYWRvdy1zbSBmbGV4IGl0ZW1zLWNlbnRlclwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBTbWFydCBGaXhpbmcgQWN0aW9uIFtQYXNzIDJdOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LWdyZWVuLTYwMCBtbC0yIGZvbnQtYm9sZFwiPkFwcHJvdmVkKHtmaXhpbmdBY3Rpb25TdGF0cy5hcHByb3ZlZFAyfSk8L3NwYW4+LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTUwMCBtbC0yIGZvbnQtYm9sZFwiPlJlamVjdGVkKHtmaXhpbmdBY3Rpb25TdGF0cy5yZWplY3RlZFAyfSk8L3NwYW4+LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LWFtYmVyLTYwMCBtbC0yIGZvbnQtYm9sZFwiPlBlbmRpbmcoe2ZpeGluZ0FjdGlvblN0YXRzLnBlbmRpbmdQMn0pPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICApfVxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGZsZXgtd3JhcCBpdGVtcy1jZW50ZXIgZ2FwLTIgYmctd2hpdGUgcHgtMiBweS0xIHJvdW5kZWQgYm9yZGVyIGJvcmRlci1zbGF0ZS0zMDAgc2hhZG93LXNtXCI+XG4gICAgICAgICAgICB7c3RhZ2UgPT09IFwiMlwiICYmIChcbiAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e2hhbmRsZVB1bGxTdGFnZTF9IGNsYXNzTmFtZT1cInB4LTIuNSBweS0xIGJnLWFtYmVyLTUwIGhvdmVyOmJnLWFtYmVyLTEwMCB0ZXh0LWFtYmVyLTcwMCByb3VuZGVkIHRleHQteHMgZm9udC1ib2xkIGJvcmRlciBib3JkZXItYW1iZXItMjAwIHRyYW5zaXRpb24tYWxsIHNoYWRvdy1zbSBtci0yIHdoaXRlc3BhY2Utbm93cmFwXCI+XG4gICAgICAgICAgICAgICAgICAgIPCfk6UgUHVsbCBmcm9tIFN0YWdlIDFcbiAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICl9XG5cbiAgICAgICAgICAgIHtzdGFnZSAhPT0gXCIxXCIgJiYgKFxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgc3BhY2UteC0yIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgcHItMyBtci0xXCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQteHMgZm9udC1zZW1pYm9sZCB0ZXh0LXNsYXRlLTUwMCB1cHBlcmNhc2UgdHJhY2tpbmctd2lkZXJcIj5GSUxURVI6PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8c2VsZWN0IHZhbHVlPXtmaWx0ZXJBY3Rpb259IG9uQ2hhbmdlPXtlID0+IHNldEZpbHRlckFjdGlvbihlLnRhcmdldC52YWx1ZSl9IGNsYXNzTmFtZT1cInRleHQtc20gYmctc2xhdGUtNTAgdGV4dC1zbGF0ZS03MDAgYm9yZGVyLW5vbmUgb3V0bGluZS1ub25lIGN1cnNvci1wb2ludGVyIHB5LTEgcHgtMSByb3VuZGVkIGZvbnQtbWVkaXVtXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiQUxMXCI+QWxsIFJvd3M8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJIQVNfRklYSU5HX0FDVElPTlwiPkhhcyBGaXhpbmcgQWN0aW9uPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiRVJST1JTX1dBUk5JTkdTXCI+RXJyb3JzICYgV2FybmluZ3M8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJQUk9QT1NBTFNcIj5TbWFydCBGaXggUHJvcG9zYWxzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiUEVORElOR1wiPlBlbmRpbmcgQXBwcm92YWw8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJBUFBST1ZFRFwiPkFwcHJvdmVkPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiUkVKRUNURURcIj5SZWplY3RlZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICl9XG5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgc3BhY2UteC0xXCI+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gZm9udC1ib2xkIHRleHQtc2xhdGUtNDAwIHVwcGVyY2FzZSB0cmFja2luZy13aWRlc3QgbXItMSBoaWRkZW4gbWQ6aW5saW5lLWJsb2NrXCI+VG9vbHM6PC9zcGFuPlxuXG4gICAgICAgICAgICAgICAge3N0YWdlID09PSBcIjFcIiAmJiAoXG4gICAgICAgICAgICAgICAgICAgIDw+XG4gICAgICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e2hhbmRsZUNhbGN1bGF0ZU1pc3NpbmdHZW9tZXRyeX0gY2xhc3NOYW1lPVwicHgtMi41IHB5LTEgYmctd2hpdGUgaG92ZXI6YmctYmx1ZS01MCB0ZXh0LXNsYXRlLTYwMCBob3Zlcjp0ZXh0LWJsdWUtNzAwIHJvdW5kZWQgdGV4dC14cyBmb250LXNlbWlib2xkIGJvcmRlciBib3JkZXItdHJhbnNwYXJlbnQgaG92ZXI6Ym9yZGVyLWJsdWUtMjAwIHRyYW5zaXRpb24tYWxsIHNoYWRvdy1zbSBtci0xXCIgdGl0bGU9XCJDYWxjdWxhdGUgbWlzc2luZyBib3JlcywgbWlkcG9pbnRzLCBhbmQgdmVjdG9yc1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cIm1yLTFcIj7wn5OQPC9zcGFuPkNhbGMgTWlzc2luZyBHZW9cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXtoYW5kbGVWYWxpZGF0ZVN5bnRheH0gY2xhc3NOYW1lPVwicHgtMi41IHB5LTEgYmctd2hpdGUgaG92ZXI6YmctdGVhbC01MCB0ZXh0LXNsYXRlLTYwMCBob3Zlcjp0ZXh0LXRlYWwtNzAwIHJvdW5kZWQgdGV4dC14cyBmb250LXNlbWlib2xkIGJvcmRlciBib3JkZXItdHJhbnNwYXJlbnQgaG92ZXI6Ym9yZGVyLXRlYWwtMjAwIHRyYW5zaXRpb24tYWxsIHNoYWRvdy1zbSBtci0xXCIgdGl0bGU9XCJSdW4gc3RyaWN0IERhdGEgVGFibGUgdmFsaWRhdGlvbiBjaGVja3NcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJtci0xXCI+8J+boe+4jzwvc3Bhbj5DaGVjayBTeW50YXhcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXtoYW5kbGVTeW50YXhGaXh9IGNsYXNzTmFtZT1cInB4LTIuNSBweS0xIGJnLXdoaXRlIGhvdmVyOmJnLWluZGlnby01MCB0ZXh0LXNsYXRlLTYwMCBob3Zlcjp0ZXh0LWluZGlnby03MDAgcm91bmRlZCB0ZXh0LXhzIGZvbnQtc2VtaWJvbGQgYm9yZGVyIGJvcmRlci10cmFuc3BhcmVudCBob3Zlcjpib3JkZXItaW5kaWdvLTIwMCB0cmFuc2l0aW9uLWFsbCBzaGFkb3ctc21cIiB0aXRsZT1cIlN0YW5kYXJkaXplIHN0cmluZ3MgYW5kIGZpeCBiYXNpYyBzeW50YXggZXJyb3JzXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwibXItMVwiPvCflKc8L3NwYW4+U3ludGF4IEZpeFxuICAgICAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgICAgICl9XG5cbiAgICAgICAgICAgICAgICB7KHN0YWdlID09PSBcIjJcIiB8fCBzdGFnZSA9PT0gXCIzXCIpICYmIChcbiAgICAgICAgICAgICAgICAgICAgPD5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxidXR0b24gZGlzYWJsZWQgY2xhc3NOYW1lPVwicHgtMi41IHB5LTEgYmctc2xhdGUtNTAgdGV4dC1zbGF0ZS00MDAgcm91bmRlZCB0ZXh0LXhzIGZvbnQtc2VtaWJvbGQgYm9yZGVyIGJvcmRlci1zbGF0ZS0yMDAgc2hhZG93LXNtIG9wYWNpdHktNTAgY3Vyc29yLW5vdC1hbGxvd2VkXCIgdGl0bGU9XCJSdW4gc3RyaWN0IERhdGEgVGFibGUgdmFsaWRhdGlvbiBjaGVja3NcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJtci0xIG9wYWNpdHktNTBcIj7wn5uh77iPPC9zcGFuPlZhbGlkYXRlIFJ1bGVzXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxidXR0b24gZGlzYWJsZWQgY2xhc3NOYW1lPVwicHgtMi41IHB5LTEgYmctc2xhdGUtNTAgdGV4dC1zbGF0ZS00MDAgcm91bmRlZCB0ZXh0LXhzIGZvbnQtc2VtaWJvbGQgYm9yZGVyIGJvcmRlci1zbGF0ZS0yMDAgc2hhZG93LXNtIG9wYWNpdHktNTAgY3Vyc29yLW5vdC1hbGxvd2VkXCIgdGl0bGU9XCJBY2tub3dsZWRnZSBhbmQgZGlzbWlzcyBhbGwgY3VycmVudCB3YXJuaW5nc1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cIm1yLTEgb3BhY2l0eS01MFwiPvCfkYHvuI/igI3wn5eo77iPPC9zcGFuPklnbm9yZSBXYXJuaW5nc1xuICAgICAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIG1sLTIgYm9yZGVyIGJvcmRlci1pbmRpZ28tMjAwIHJvdW5kZWQgc2hhZG93LXNtIGJnLWluZGlnby01MCBoLTZcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IGhhbmRsZUF1dG9BcHByb3ZlQWxsKCdBTEwnKX0gY2xhc3NOYW1lPVwicHgtMi41IHB5LTEgaG92ZXI6YmctaW5kaWdvLTEwMCB0ZXh0LWluZGlnby03MDAgdGV4dC14cyBmb250LWJvbGQgdHJhbnNpdGlvbi1hbGwgYm9yZGVyLXIgYm9yZGVyLWluZGlnby0yMDAgaC1mdWxsIGZsZXggaXRlbXMtY2VudGVyXCIgdGl0bGU9XCJBcHByb3ZlIGFsbCBUaWVyIDEvMiBhdXRvbWF0ZWQgZml4ZXNcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwibXItMVwiPuKaoTwvc3Bhbj5BcHByb3ZlIEFsbFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzZWxlY3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZS50YXJnZXQudmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoYW5kbGVBdXRvQXBwcm92ZUFsbChlLnRhcmdldC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZS50YXJnZXQudmFsdWUgPSBcIlwiOyAvLyByZXNldCBhZnRlciBhY3Rpb25cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwiYmctdHJhbnNwYXJlbnQgdGV4dC1pbmRpZ28tNzAwIHRleHQtWzEwcHhdIGZvbnQtYm9sZCBweC0xIG91dGxpbmUtbm9uZSBjdXJzb3ItcG9pbnRlciBoLWZ1bGwgYm9yZGVyLTBcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIlwiIGRpc2FibGVkPkJhdGNoIEFjdGlvbnMuLi48L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIkdBUF9GSUxMXCI+QXBwcm92ZSBHQVBfRklMTDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiR0FQX1NOQVBfSU1NVVRBQkxFX0JMT0NLXCI+QXBwcm92ZSBHQVBfU05BUDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiU1lOVEhFU0laRV9WQUxWRVwiPkFwcHJvdmUgVmFsdmVzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJSRUpFQ1RfQUxMXCI+UmVqZWN0IEFsbCBQcm9wb3NhbHM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvblxuICAgICAgICAgICAgICAgICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiBzZXREaWZmTW9kZShkID0+ICFkKX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPXtgcHgtMi41IHB5LTEgcm91bmRlZCB0ZXh0LXhzIGZvbnQtYm9sZCBib3JkZXIgdHJhbnNpdGlvbi1hbGwgc2hhZG93LXNtIG1sLTIgJHtkaWZmTW9kZSA/ICdiZy12aW9sZXQtNjAwIHRleHQtd2hpdGUgYm9yZGVyLXZpb2xldC03MDAnIDogJ2JnLXZpb2xldC01MCBob3ZlcjpiZy12aW9sZXQtMTAwIHRleHQtdmlvbGV0LTcwMCBib3JkZXItdmlvbGV0LTIwMCd9YH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGl0bGU9XCJUb2dnbGUgc2lkZS1ieS1zaWRlIGRpZmYgdmlldyBzaG93aW5nIFN0YWdlIDEgb3JpZ2luYWwgdnMgU3RhZ2UgMiBjaGFuZ2VzXCJcbiAgICAgICAgICAgICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwibXItMVwiPuKfujwvc3Bhbj5EaWZmIFZpZXdcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuXG4gICAgICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9wb3NhbHMgPSB1c2VTdG9yZS5nZXRTdGF0ZSgpLnByb3Bvc2FscyB8fCBbXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkaWFnRGF0YSA9IHsgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksIHRvdGFsUHJvcG9zYWxzOiBwcm9wb3NhbHMubGVuZ3RoLCBwcm9wb3NhbHMgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW0pTT04uc3RyaW5naWZ5KGRpYWdEYXRhLCBudWxsLCAyKV0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHVybCA9IHdpbmRvdy5VUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYS5ocmVmID0gdXJsO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGEuZG93bmxvYWQgPSAnc21hcnRfZml4ZXJfZGlhZ25vc3RpY3MuanNvbic7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYS5jbGljaygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpbmRvdy5VUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9fSBjbGFzc05hbWU9XCJweC0yLjUgcHktMSBiZy1zbGF0ZS01MCBob3ZlcjpiZy1zbGF0ZS0xMDAgdGV4dC1zbGF0ZS03MDAgcm91bmRlZCB0ZXh0LVsxMHB4XSBmb250LWJvbGQgYm9yZGVyIGJvcmRlci1zbGF0ZS0zMDAgdHJhbnNpdGlvbi1hbGwgc2hhZG93LXNtIG1sLTJcIiB0aXRsZT1cIkV4cG9ydCBTb2x2ZXIgRGlhZ25vc3RpY3MgSlNPTlwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuPvCfk4Q8L3NwYW4+IEV4cG9ydCBEaWFnXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cblxuICAgICAgICAgICAgICAgICAgICA8Lz5cbiAgICAgICAgICAgICAgICApfVxuXG4gICAgICAgICAgICAgICAge3N0YWdlID09PSBcIjNcIiAmJiAoXG4gICAgICAgICAgICAgICAgICAgIDw+XG4gICAgICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e2FzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBleHBvcnRUb0V4Y2VsKGRhdGFUYWJsZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IHsgdHlwZTogXCJJbmZvXCIsIG1lc3NhZ2U6IFwiRXhwb3J0ZWQgRGF0YSBUYWJsZSB0byBFeGNlbC5cIiB9fSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBVFVTX01FU1NBR0VcIiwgcGF5bG9hZDogXCJFcnJvciBleHBvcnRpbmcgRXhjZWw6IFwiICsgZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfX0gY2xhc3NOYW1lPVwicHgtMi41IHB5LTEgYmctc2xhdGUtODAwIGhvdmVyOmJnLXNsYXRlLTcwMCB0ZXh0LXNsYXRlLTEwMCByb3VuZGVkIHRleHQteHMgZm9udC1ib2xkIGJvcmRlciBib3JkZXItc2xhdGUtOTAwIHRyYW5zaXRpb24tYWxsIHNoYWRvdy1zbSBtbC0yXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgRXhwb3J0IERhdGEgVGFibGUg4oaTXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHRleHQgPSBnZW5lcmF0ZVBDRlRleHQoZGF0YVRhYmxlLCBzdGF0ZS5jb25maWcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbdGV4dF0sIHsgdHlwZTogJ3RleHQvcGxhaW4nIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHVybCA9IHdpbmRvdy5VUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYS5ocmVmID0gdXJsO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGEuZG93bmxvYWQgPSAnZXhwb3J0LnBjZic7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYS5jbGljaygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpbmRvdy5VUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIkFERF9MT0dcIiwgcGF5bG9hZDogeyB0eXBlOiBcIkluZm9cIiwgbWVzc2FnZTogXCJFeHBvcnRlZCBQQ0YgZmlsZS5cIiB9fSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9fSBjbGFzc05hbWU9XCJweC0yLjUgcHktMSBiZy1zbGF0ZS04MDAgaG92ZXI6Ymctc2xhdGUtNzAwIHRleHQtc2xhdGUtMTAwIHJvdW5kZWQgdGV4dC14cyBmb250LWJvbGQgYm9yZGVyIGJvcmRlci1zbGF0ZS05MDAgdHJhbnNpdGlvbi1hbGwgc2hhZG93LXNtIG1sLTFcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBFeHBvcnQgUENGIOKGk1xuICAgICAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgey8qIFNlYXJjaCArIENvbHVtbiBWaXNpYmlsaXR5ICovfVxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGdhcC0yIGZsZXgtd3JhcCBtdC0yIGJnLXNsYXRlLTUwIGJvcmRlciBib3JkZXItc2xhdGUtMjAwIHJvdW5kZWQgcHgtMiBweS0xLjVcIj5cbiAgICAgICAgICB7LyogVGV4dCBTZWFyY2ggKi99XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMS41IGZsZXgtMSBtaW4tdy1bMTgwcHhdXCI+XG4gICAgICAgICAgICA8c3ZnIGNsYXNzTmFtZT1cInctMy41IGgtMy41IHRleHQtc2xhdGUtNDAwIHNocmluay0wXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIyXCIgc3Ryb2tlTGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlTGluZWpvaW49XCJyb3VuZFwiPjxjaXJjbGUgY3g9XCIxMVwiIGN5PVwiMTFcIiByPVwiOFwiLz48cGF0aCBkPVwibTIxIDIxLTQuMy00LjNcIi8+PC9zdmc+XG4gICAgICAgICAgICA8aW5wdXRcbiAgICAgICAgICAgICAgdHlwZT1cInRleHRcIlxuICAgICAgICAgICAgICB2YWx1ZT17c2VhcmNoVGV4dH1cbiAgICAgICAgICAgICAgb25DaGFuZ2U9e2UgPT4gc2V0U2VhcmNoVGV4dChlLnRhcmdldC52YWx1ZSl9XG4gICAgICAgICAgICAgIHBsYWNlaG9sZGVyPVwiU2VhcmNoIHJvd3PigKZcIlxuICAgICAgICAgICAgICBjbGFzc05hbWU9XCJmbGV4LTEgdGV4dC14cyBib3JkZXItMCBiZy10cmFuc3BhcmVudCBvdXRsaW5lLW5vbmUgdGV4dC1zbGF0ZS03MDAgcGxhY2Vob2xkZXItc2xhdGUtNDAwXCJcbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICB7c2VhcmNoVGV4dCAmJiAoXG4gICAgICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4gc2V0U2VhcmNoVGV4dCgnJyl9IGNsYXNzTmFtZT1cInRleHQtc2xhdGUtNDAwIGhvdmVyOnRleHQtc2xhdGUtNjAwIHRleHQteHMgZm9udC1ib2xkXCI+4pyVPC9idXR0b24+XG4gICAgICAgICAgICApfVxuICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgey8qIENvbHVtbiBWaXNpYmlsaXR5IFRvZ2dsZSAqL31cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInJlbGF0aXZlXCI+XG4gICAgICAgICAgICA8YnV0dG9uXG4gICAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHNldFNob3dDb2xQYW5lbCh2ID0+ICF2KX1cbiAgICAgICAgICAgICAgY2xhc3NOYW1lPXtgZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTEgcHgtMiBweS0xIHRleHQteHMgcm91bmRlZCBib3JkZXIgdHJhbnNpdGlvbi1jb2xvcnMgJHtzaG93Q29sUGFuZWwgPyAnYmctYmx1ZS02MDAgdGV4dC13aGl0ZSBib3JkZXItYmx1ZS03MDAnIDogJ2JnLXdoaXRlIHRleHQtc2xhdGUtNjAwIGJvcmRlci1zbGF0ZS0zMDAgaG92ZXI6Ymctc2xhdGUtNTAnfWB9XG4gICAgICAgICAgICA+XG4gICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy0zIGgtM1wiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiIHN0cm9rZUxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZUxpbmVqb2luPVwicm91bmRcIj48cmVjdCB4PVwiM1wiIHk9XCIzXCIgd2lkdGg9XCI3XCIgaGVpZ2h0PVwiN1wiLz48cmVjdCB4PVwiMTRcIiB5PVwiM1wiIHdpZHRoPVwiN1wiIGhlaWdodD1cIjdcIi8+PHJlY3QgeD1cIjNcIiB5PVwiMTRcIiB3aWR0aD1cIjdcIiBoZWlnaHQ9XCI3XCIvPjxyZWN0IHg9XCIxNFwiIHk9XCIxNFwiIHdpZHRoPVwiN1wiIGhlaWdodD1cIjdcIi8+PC9zdmc+XG4gICAgICAgICAgICAgIENvbHVtbnNcbiAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAge3Nob3dDb2xQYW5lbCAmJiAoXG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYWJzb2x1dGUgcmlnaHQtMCB0b3AtOCB6LTUwIGJnLXdoaXRlIGJvcmRlciBib3JkZXItc2xhdGUtMjAwIHJvdW5kZWQtbGcgc2hhZG93LXhsIHAtMyBtaW4tdy1bMjAwcHhdXCI+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LVsxMHB4XSBmb250LWJvbGQgdGV4dC1zbGF0ZS01MDAgdXBwZXJjYXNlIHRyYWNraW5nLXdpZGVzdCBtYi0yXCI+VG9nZ2xlIENvbHVtbiBHcm91cHM8L2Rpdj5cbiAgICAgICAgICAgICAgICB7Q09MX0dST1VQUy5tYXAoZyA9PiAoXG4gICAgICAgICAgICAgICAgICA8bGFiZWwga2V5PXtnLmtleX0gY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTIgcHktMSBjdXJzb3ItcG9pbnRlciBob3ZlcjpiZy1zbGF0ZS01MCByb3VuZGVkIHB4LTFcIj5cbiAgICAgICAgICAgICAgICAgICAgPGlucHV0XG4gICAgICAgICAgICAgICAgICAgICAgdHlwZT1cImNoZWNrYm94XCJcbiAgICAgICAgICAgICAgICAgICAgICBjaGVja2VkPXtjb2xWaXNpYmxlKGcua2V5KX1cbiAgICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KCkgPT4gdG9nZ2xlR3JvdXAoZy5rZXkpfVxuICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cInctMy41IGgtMy41IGFjY2VudC1ibHVlLTYwMFwiXG4gICAgICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS03MDBcIj57Zy5sYWJlbH08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cIm1sLWF1dG8gdGV4dC1bMTBweF0gdGV4dC1zbGF0ZS00MDBcIj57Zy5jb2xzLmxlbmd0aH0gY29se2cuY29scy5sZW5ndGggIT09IDEgPyAncycgOiAnJ308L3NwYW4+XG4gICAgICAgICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgICAgICkpfVxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibXQtMiBwdC0yIGJvcmRlci10IGJvcmRlci1zbGF0ZS0yMDAgZmxleCBnYXAtMlwiPlxuICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXsoKSA9PiBzZXRIaWRkZW5Hcm91cHMobmV3IFNldCgpKX0gY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gdGV4dC1ibHVlLTYwMCBob3Zlcjp1bmRlcmxpbmVcIj5TaG93IGFsbDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXsoKSA9PiBzZXRIaWRkZW5Hcm91cHMobmV3IFNldChDT0xfR1JPVVBTLm1hcChnID0+IGcua2V5KSkpfSBjbGFzc05hbWU9XCJ0ZXh0LVsxMHB4XSB0ZXh0LXNsYXRlLTQwMCBob3Zlcjp1bmRlcmxpbmUgbWwtYXV0b1wiPkhpZGUgYWxsPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgKX1cbiAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgIHsvKiBSb3cgY291bnQgKi99XG4gICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gdGV4dC1zbGF0ZS00MDAgd2hpdGVzcGFjZS1ub3dyYXAgbWwtYXV0b1wiPlxuICAgICAgICAgICAge2ZpbHRlcmVkRGF0YVRhYmxlLmxlbmd0aH0gLyB7ZGF0YVRhYmxlPy5sZW5ndGggPz8gMH0gcm93c1xuICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgey8qIERpZmYgVmlldyBtb2RlIOKAlCBvbmx5IGF2YWlsYWJsZSBpbiBTdGFnZSAyICovfVxuICB7c3RhZ2UgPT09IFwiMlwiICYmIGRpZmZNb2RlID8gKFxuICAgIDxEaWZmVmlldyBzdGFnZTFEYXRhPXtzdGF0ZS5kYXRhVGFibGV9IHN0YWdlMkRhdGE9e3N0YXRlLnN0YWdlMkRhdGF9IC8+XG4gICkgOiAoXG4gIDxkaXYgY2xhc3NOYW1lPVwib3ZlcmZsb3ctYXV0byBoLVtjYWxjKDEwMHZoLTE2cmVtKV0gYm9yZGVyIHJvdW5kZWQgc2hhZG93LXNtIGJnLXdoaXRlIHJlbGF0aXZlXCI+XG4gICAgICA8dGFibGUgY2xhc3NOYW1lPVwibWluLXctbWF4IGRpdmlkZS15IGRpdmlkZS1zbGF0ZS0yMDAgdGV4dC1zbVwiPlxuICAgICAgICA8dGhlYWQgY2xhc3NOYW1lPVwiYmctc2xhdGUtMTAwIHN0aWNreSB0b3AtMCB6LTIwIHNoYWRvdy1zbSB3aGl0ZXNwYWNlLW5vd3JhcFwiPlxuICAgICAgICAgIDx0cj5cbiAgICAgICAgICAgIHsvKiBBbHdheXMtdmlzaWJsZTogUm93ICsgVHlwZSAqL31cbiAgICAgICAgICAgIHtyZW5kZXJTb3J0SGVhZGVyKCdfcm93SW5kZXgnLCAnIyBSb3cnLCAnc3RpY2t5IGxlZnQtMCB6LTMwIGJnLXNsYXRlLTEwMCcpfVxuICAgICAgICAgICAge2NvbFZpc2libGUoJ2lkZW50aXR5JykgJiYgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1zZW1pYm9sZCB0ZXh0LXNsYXRlLTcwMCBib3JkZXItciBib3JkZXItc2xhdGUtMzAwIHN0aWNreSBsZWZ0LVs2MHB4XSB6LTMwIGJnLXNsYXRlLTEwMFwiPkNTViBTRVEgTk88L3RoPn1cbiAgICAgICAgICAgIHtyZW5kZXJTb3J0SGVhZGVyKCd0eXBlJywgJ1R5cGUnLCAnc3RpY2t5IGxlZnQtWzE2MHB4XSB6LTMwIGJnLXNsYXRlLTEwMCcpfVxuICAgICAgICAgICAge2NvbFZpc2libGUoJ2lkZW50aXR5JykgJiYgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMFwiPlRFWFQgKE1TRyk8L3RoPn1cbiAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdpZGVudGl0eScpICYmIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTIgdGV4dC1sZWZ0IGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtNTAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDBcIj5QSVBFTElORS1SRUY8L3RoPn1cbiAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdpZGVudGl0eScpICYmIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTIgdGV4dC1sZWZ0IGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtNTAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDBcIj5SRUYgTk8uPC90aD59XG5cbiAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdnZW9tZXRyeScpICYmIHJlbmRlclNvcnRIZWFkZXIoJ2JvcmUnLCAnQk9SRScsICdiZy1ibHVlLTUwLzUwJyl9XG4gICAgICAgICAgICB7Y29sVmlzaWJsZSgnZ2VvbWV0cnknKSAmJiA8dGggY2xhc3NOYW1lPVwicHgtMyBweS0yIHRleHQtbGVmdCBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTUwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwIGJnLWJsdWUtNTAvNTBcIj5CUkFOQ0ggQk9SRTwvdGg+fVxuXG4gICAgICAgICAgICB7Y29sVmlzaWJsZSgnZ2VvbWV0cnknKSAmJiA8dGggY2xhc3NOYW1lPVwicHgtMyBweS0yIHRleHQtbGVmdCBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTUwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwIGJnLWJsdWUtNTAvNTBcIj5FUDEgWDwvdGg+fVxuICAgICAgICAgICAge2NvbFZpc2libGUoJ2dlb21ldHJ5JykgJiYgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCBiZy1ibHVlLTUwLzUwXCI+RVAxIFk8L3RoPn1cbiAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdnZW9tZXRyeScpICYmIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTIgdGV4dC1sZWZ0IGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtNTAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgYmctYmx1ZS01MC81MFwiPkVQMSBaPC90aD59XG5cbiAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdnZW9tZXRyeScpICYmIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTIgdGV4dC1sZWZ0IGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtNTAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgYmctYmx1ZS01MC81MFwiPkVQMiBYPC90aD59XG4gICAgICAgICAgICB7Y29sVmlzaWJsZSgnZ2VvbWV0cnknKSAmJiA8dGggY2xhc3NOYW1lPVwicHgtMyBweS0yIHRleHQtbGVmdCBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTUwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwIGJnLWJsdWUtNTAvNTBcIj5FUDIgWTwvdGg+fVxuICAgICAgICAgICAge2NvbFZpc2libGUoJ2dlb21ldHJ5JykgJiYgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCBiZy1ibHVlLTUwLzUwXCI+RVAyIFo8L3RoPn1cblxuICAgICAgICAgICAge2NvbFZpc2libGUoJ2dlb21ldHJ5JykgJiYgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCBiZy1ibHVlLTUwLzUwXCI+Q1AgWDwvdGg+fVxuICAgICAgICAgICAge2NvbFZpc2libGUoJ2dlb21ldHJ5JykgJiYgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCBiZy1ibHVlLTUwLzUwXCI+Q1AgWTwvdGg+fVxuICAgICAgICAgICAge2NvbFZpc2libGUoJ2dlb21ldHJ5JykgJiYgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCBiZy1ibHVlLTUwLzUwXCI+Q1AgWjwvdGg+fVxuXG4gICAgICAgICAgICB7Y29sVmlzaWJsZSgnZ2VvbWV0cnknKSAmJiA8dGggY2xhc3NOYW1lPVwicHgtMyBweS0yIHRleHQtbGVmdCBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTUwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwIGJnLWJsdWUtNTAvNTBcIj5CUCBYPC90aD59XG4gICAgICAgICAgICB7Y29sVmlzaWJsZSgnZ2VvbWV0cnknKSAmJiA8dGggY2xhc3NOYW1lPVwicHgtMyBweS0yIHRleHQtbGVmdCBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTUwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwIGJnLWJsdWUtNTAvNTBcIj5CUCBZPC90aD59XG4gICAgICAgICAgICB7Y29sVmlzaWJsZSgnZ2VvbWV0cnknKSAmJiA8dGggY2xhc3NOYW1lPVwicHgtMyBweS0yIHRleHQtbGVmdCBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTUwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwIGJnLWJsdWUtNTAvNTBcIj5CUCBaPC90aD59XG5cbiAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdzdXBwb3J0JykgJiYgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMFwiPlNVUFBPUlQgQ09PUiBYPC90aD59XG4gICAgICAgICAgICB7Y29sVmlzaWJsZSgnc3VwcG9ydCcpICYmIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTIgdGV4dC1sZWZ0IGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtNTAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDBcIj5TVVBQT1JUIENPT1IgWTwvdGg+fVxuICAgICAgICAgICAge2NvbFZpc2libGUoJ3N1cHBvcnQnKSAmJiA8dGggY2xhc3NOYW1lPVwicHgtMyBweS0yIHRleHQtbGVmdCBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTUwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwXCI+U1VQUE9SVCBDT09SIFo8L3RoPn1cbiAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdzdXBwb3J0JykgJiYgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMFwiPlNVUFBPUlQgTkFNRTwvdGg+fVxuICAgICAgICAgICAge2NvbFZpc2libGUoJ3N1cHBvcnQnKSAmJiA8dGggY2xhc3NOYW1lPVwicHgtMyBweS0yIHRleHQtbGVmdCBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTUwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwXCI+U1VQUE9SVCBHVUlEPC90aD59XG4gICAgICAgICAgICB7Y29sVmlzaWJsZSgnc3VwcG9ydCcpICYmIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTIgdGV4dC1sZWZ0IGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtNTAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDBcIj5TS0VZPC90aD59XG5cbiAgICAgICAgICAgIHsvKiBTbWFydCBGaXgg4oCUIGFsd2F5cyB2aXNpYmxlICovfVxuICAgICAgICAgICAgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1zZW1pYm9sZCB0ZXh0LXNsYXRlLTcwMCBib3JkZXItciBib3JkZXItc2xhdGUtMzAwIGJnLWFtYmVyLTUwXCI+Rml4aW5nIEFjdGlvbjwvdGg+XG5cbiAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdjYWxjJykgJiYgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCBiZy1zbGF0ZS01MFwiPkxFTiAxPC90aD59XG4gICAgICAgICAgICB7Y29sVmlzaWJsZSgnY2FsYycpICYmIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTIgdGV4dC1sZWZ0IGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtNTAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgYmctc2xhdGUtNTBcIj5BWElTIDE8L3RoPn1cbiAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdjYWxjJykgJiYgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCBiZy1zbGF0ZS01MFwiPkxFTiAyPC90aD59XG4gICAgICAgICAgICB7Y29sVmlzaWJsZSgnY2FsYycpICYmIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTIgdGV4dC1sZWZ0IGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtNTAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgYmctc2xhdGUtNTBcIj5BWElTIDI8L3RoPn1cbiAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdjYWxjJykgJiYgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCBiZy1zbGF0ZS01MFwiPkxFTiAzPC90aD59XG4gICAgICAgICAgICB7Y29sVmlzaWJsZSgnY2FsYycpICYmIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTIgdGV4dC1sZWZ0IGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtNTAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgYmctc2xhdGUtNTBcIj5BWElTIDM8L3RoPn1cbiAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdjYWxjJykgJiYgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCBiZy1zbGF0ZS01MFwiPkJSTEVOPC90aD59XG5cbiAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdkZXJpdmVkJykgJiYgPHRoIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWxlZnQgZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMFwiPlBJUElORyBDTEFTUzwvdGg+fVxuICAgICAgICAgICAge2NvbFZpc2libGUoJ2Rlcml2ZWQnKSAmJiA8dGggY2xhc3NOYW1lPVwicHgtMyBweS0yIHRleHQtbGVmdCBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTUwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwXCI+UkFUSU5HPC90aD59XG4gICAgICAgICAgICB7Y29sVmlzaWJsZSgnZGVyaXZlZCcpICYmIDx0aCBjbGFzc05hbWU9XCJweC0zIHB5LTIgdGV4dC1sZWZ0IGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtNTAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDBcIj5MSU5FTk8gS0VZPC90aD59XG5cbiAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdjYXMnKSAmJiBbOTcsOTgsMSwyLDMsNCw1LDYsNyw4LDksMTBdLm1hcChuID0+IChcbiAgICAgICAgICAgICAgICA8dGgga2V5PXtgY2Eke259YH0gY2xhc3NOYW1lPVwicHgtMyBweS0yIHRleHQtbGVmdCBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTQwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwXCI+Q0F7bn08L3RoPlxuICAgICAgICAgICAgKSl9XG4gICAgICAgICAgPC90cj5cbiAgICAgICAgPC90aGVhZD5cbiAgICAgICAgPHRib2R5IGNsYXNzTmFtZT1cImJnLXdoaXRlIGRpdmlkZS15IGRpdmlkZS1zbGF0ZS0yMDBcIj5cbiAgICAgICAgICB7ZmlsdGVyZWREYXRhVGFibGUubWFwKChyb3cpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGlzRGVsZXRlZCA9IHJvdy5faXNEZWxldGVkIHx8IChyb3cuZml4aW5nQWN0aW9uICYmIHJvdy5maXhpbmdBY3Rpb24uaW5jbHVkZXMoJ0RFTEVURScpICYmIHJvdy5fcGFzc0FwcGxpZWQgPiAwKTtcbiAgICAgICAgICAgIGNvbnN0IHJvd0NsYXNzID0gaXNEZWxldGVkID8gJ2JnLXJlZC01MC81MCBvcGFjaXR5LTYwIGxpbmUtdGhyb3VnaCcgOiAnYmctd2hpdGUgaG92ZXI6Ymctc2xhdGUtNTAgdHJhbnNpdGlvbi1jb2xvcnMnO1xuXG5cbiAgY29uc3QgcmVuZGVyU29ydEhlYWRlciA9IChrZXksIGxhYmVsLCBjbGFzc05hbWUgPSBcIlwiKSA9PiAoXG4gICAgICA8dGggY2xhc3NOYW1lPXtgcHgtMyBweS0yIHRleHQtbGVmdCBmb250LXNlbWlib2xkIHRleHQtc2xhdGUtNzAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0zMDAgYmctc2xhdGUtMTAwIGN1cnNvci1wb2ludGVyIGhvdmVyOmJnLXNsYXRlLTIwMCBzZWxlY3Qtbm9uZSAke2NsYXNzTmFtZX1gfSBvbkNsaWNrPXsoKSA9PiBoYW5kbGVTb3J0KGtleSl9PlxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuXCI+XG4gICAgICAgICAgICAgIDxzcGFuPntsYWJlbH08L3NwYW4+XG4gICAgICAgICAgICAgIHtzb3J0Q29uZmlnLmtleSA9PT0ga2V5ID8gKHNvcnRDb25maWcuZGlyZWN0aW9uID09PSAnYXNjJyA/IDxzcGFuIGNsYXNzTmFtZT1cInRleHQtWzEwcHhdIG1sLTEgdGV4dC1ibHVlLTYwMFwiPuKWsjwvc3Bhbj4gOiA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LVsxMHB4XSBtbC0xIHRleHQtYmx1ZS02MDBcIj7ilrw8L3NwYW4+KSA6IDxzcGFuIGNsYXNzTmFtZT1cInRleHQtWzEwcHhdIG1sLTEgdGV4dC1zbGF0ZS00MDAgb3BhY2l0eS0wIGdyb3VwLWhvdmVyOm9wYWNpdHktMTAwXCI+4oaVPC9zcGFuPn1cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgIDwvdGg+XG4gICk7XG5cbiAgcmV0dXJuIChcbiAgICAgICAgICAgIDx0ciBrZXk9e3Jvdy5fcm93SW5kZXh9IGNsYXNzTmFtZT17YCR7cm93Q2xhc3N9IHdoaXRlc3BhY2Utbm93cmFwYH0+XG4gICAgICAgICAgICAgIDx0ZCBjbGFzc05hbWU9e2BweC0zIHB5LTIgdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCBzdGlja3kgbGVmdC0wIHotMTAgZm9udC1tb25vICR7aXNEZWxldGVkID8gJ2JnLXJlZC01MCcgOiAnYmctd2hpdGUnfWB9Pntyb3cuX3Jvd0luZGV4fTwvdGQ+XG4gICAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdpZGVudGl0eScpICYmIDx0ZCBjbGFzc05hbWU9e2BweC0zIHB5LTIgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCBzdGlja3kgbGVmdC1bNjBweF0gei0xMCBmb250LW1vbm8gJHtnZXRDZWxsQ2xhc3Mocm93LCAnY3N2U2VxTm8nKX0gJHtpc0RlbGV0ZWQgPyAnYmctcmVkLTUwJyA6ICdiZy13aGl0ZSd9YH0+e3Jvdy5jc3ZTZXFObyB8fCAn4oCUJ308L3RkPn1cbiAgICAgICAgICAgICAgPHRkIGNsYXNzTmFtZT17YHB4LTMgcHktMiBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTkwMCBib3JkZXItciBib3JkZXItc2xhdGUtMzAwIHN0aWNreSBsZWZ0LVsxNjBweF0gei0xMCAke2lzRGVsZXRlZCA/ICdiZy1yZWQtNTAnIDogJ2JnLXdoaXRlJ31gfT57cm93LnR5cGV9PC90ZD5cbiAgICAgICAgICAgICAge2NvbFZpc2libGUoJ2lkZW50aXR5JykgJiYgPHRkIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LXNsYXRlLTUwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwIHRydW5jYXRlIG1heC13LVsyMDBweF1cIiB0aXRsZT17cm93LnRleHR9Pntyb3cudGV4dCB8fCAn4oCUJ308L3RkPn1cbiAgICAgICAgICAgICAge2NvbFZpc2libGUoJ2lkZW50aXR5JykgJiYgPHRkIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LXNsYXRlLTUwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwXCI+e3Jvdy5waXBlbGluZVJlZiB8fCAn4oCUJ308L3RkPn1cbiAgICAgICAgICAgICAge2NvbFZpc2libGUoJ2lkZW50aXR5JykgJiYgPHRkIGNsYXNzTmFtZT17YHB4LTMgcHktMiBib3JkZXItciBib3JkZXItc2xhdGUtMjAwICR7Z2V0Q2VsbENsYXNzKHJvdywgJ3JlZk5vJyl9YH0+e3Jvdy5yZWZObyB8fCAn4oCUJ308L3RkPn1cblxuICAgICAgICAgICAgICB7Y29sVmlzaWJsZSgnZ2VvbWV0cnknKSAmJiA8dGQgY2xhc3NOYW1lPXtgcHgtMyBweS0yIGZvbnQtbW9ubyBib3JkZXItciBib3JkZXItc2xhdGUtMjAwICR7Z2V0Q2VsbENsYXNzKHJvdywgJ2JvcmUnKX1gfT57cm93LmJvcmUgfHwgJ+KAlCd9PC90ZD59XG4gICAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdnZW9tZXRyeScpICYmIDx0ZCBjbGFzc05hbWU9e2BweC0zIHB5LTIgZm9udC1tb25vIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgJHtnZXRDZWxsQ2xhc3Mocm93LCAnYnJhbmNoQm9yZScpfWB9Pntyb3cuYnJhbmNoQm9yZSB8fCAn4oCUJ308L3RkPn1cblxuICAgICAgICAgICAgICB7Y29sVmlzaWJsZSgnZ2VvbWV0cnknKSAmJiA8dGQgY2xhc3NOYW1lPXtgcHgtMyBweS0yIGZvbnQtbW9ubyBib3JkZXItciBib3JkZXItc2xhdGUtMjAwICR7Z2V0Q2VsbENsYXNzKHJvdywgJ2VwMScpfWB9Pntyb3cuZXAxPy54ICE9PSB1bmRlZmluZWQgPyByb3cuZXAxLngudG9GaXhlZCgxKSA6ICfigJQnfTwvdGQ+fVxuICAgICAgICAgICAgICB7Y29sVmlzaWJsZSgnZ2VvbWV0cnknKSAmJiA8dGQgY2xhc3NOYW1lPXtgcHgtMyBweS0yIGZvbnQtbW9ubyBib3JkZXItciBib3JkZXItc2xhdGUtMjAwICR7Z2V0Q2VsbENsYXNzKHJvdywgJ2VwMScpfWB9Pntyb3cuZXAxPy55ICE9PSB1bmRlZmluZWQgPyByb3cuZXAxLnkudG9GaXhlZCgxKSA6ICfigJQnfTwvdGQ+fVxuICAgICAgICAgICAgICB7Y29sVmlzaWJsZSgnZ2VvbWV0cnknKSAmJiA8dGQgY2xhc3NOYW1lPXtgcHgtMyBweS0yIGZvbnQtbW9ubyBib3JkZXItciBib3JkZXItc2xhdGUtMjAwICR7Z2V0Q2VsbENsYXNzKHJvdywgJ2VwMScpfWB9Pntyb3cuZXAxPy56ICE9PSB1bmRlZmluZWQgPyByb3cuZXAxLnoudG9GaXhlZCgxKSA6ICfigJQnfTwvdGQ+fVxuXG4gICAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdnZW9tZXRyeScpICYmIDx0ZCBjbGFzc05hbWU9e2BweC0zIHB5LTIgZm9udC1tb25vIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgJHtnZXRDZWxsQ2xhc3Mocm93LCAnZXAyJyl9YH0+e3Jvdy5lcDI/LnggIT09IHVuZGVmaW5lZCA/IHJvdy5lcDIueC50b0ZpeGVkKDEpIDogJ+KAlCd9PC90ZD59XG4gICAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdnZW9tZXRyeScpICYmIDx0ZCBjbGFzc05hbWU9e2BweC0zIHB5LTIgZm9udC1tb25vIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgJHtnZXRDZWxsQ2xhc3Mocm93LCAnZXAyJyl9YH0+e3Jvdy5lcDI/LnkgIT09IHVuZGVmaW5lZCA/IHJvdy5lcDIueS50b0ZpeGVkKDEpIDogJ+KAlCd9PC90ZD59XG4gICAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdnZW9tZXRyeScpICYmIDx0ZCBjbGFzc05hbWU9e2BweC0zIHB5LTIgZm9udC1tb25vIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgJHtnZXRDZWxsQ2xhc3Mocm93LCAnZXAyJyl9YH0+e3Jvdy5lcDI/LnogIT09IHVuZGVmaW5lZCA/IHJvdy5lcDIuei50b0ZpeGVkKDEpIDogJ+KAlCd9PC90ZD59XG5cbiAgICAgICAgICAgICAge2NvbFZpc2libGUoJ2dlb21ldHJ5JykgJiYgPHRkIGNsYXNzTmFtZT17YHB4LTMgcHktMiBmb250LW1vbm8gYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCAke2dldENlbGxDbGFzcyhyb3csICdjcCcpfWB9Pntyb3cuY3A/LnggIT09IHVuZGVmaW5lZCA/IHJvdy5jcC54LnRvRml4ZWQoMSkgOiAn4oCUJ308L3RkPn1cbiAgICAgICAgICAgICAge2NvbFZpc2libGUoJ2dlb21ldHJ5JykgJiYgPHRkIGNsYXNzTmFtZT17YHB4LTMgcHktMiBmb250LW1vbm8gYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCAke2dldENlbGxDbGFzcyhyb3csICdjcCcpfWB9Pntyb3cuY3A/LnkgIT09IHVuZGVmaW5lZCA/IHJvdy5jcC55LnRvRml4ZWQoMSkgOiAn4oCUJ308L3RkPn1cbiAgICAgICAgICAgICAge2NvbFZpc2libGUoJ2dlb21ldHJ5JykgJiYgPHRkIGNsYXNzTmFtZT17YHB4LTMgcHktMiBmb250LW1vbm8gYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCAke2dldENlbGxDbGFzcyhyb3csICdjcCcpfWB9Pntyb3cuY3A/LnogIT09IHVuZGVmaW5lZCA/IHJvdy5jcC56LnRvRml4ZWQoMSkgOiAn4oCUJ308L3RkPn1cblxuICAgICAgICAgICAgICB7Y29sVmlzaWJsZSgnZ2VvbWV0cnknKSAmJiA8dGQgY2xhc3NOYW1lPXtgcHgtMyBweS0yIGZvbnQtbW9ubyBib3JkZXItciBib3JkZXItc2xhdGUtMjAwICR7Z2V0Q2VsbENsYXNzKHJvdywgJ2JwJyl9YH0+e3Jvdy5icD8ueCAhPT0gdW5kZWZpbmVkID8gcm93LmJwLngudG9GaXhlZCgxKSA6ICfigJQnfTwvdGQ+fVxuICAgICAgICAgICAgICB7Y29sVmlzaWJsZSgnZ2VvbWV0cnknKSAmJiA8dGQgY2xhc3NOYW1lPXtgcHgtMyBweS0yIGZvbnQtbW9ubyBib3JkZXItciBib3JkZXItc2xhdGUtMjAwICR7Z2V0Q2VsbENsYXNzKHJvdywgJ2JwJyl9YH0+e3Jvdy5icD8ueSAhPT0gdW5kZWZpbmVkID8gcm93LmJwLnkudG9GaXhlZCgxKSA6ICfigJQnfTwvdGQ+fVxuICAgICAgICAgICAgICB7Y29sVmlzaWJsZSgnZ2VvbWV0cnknKSAmJiA8dGQgY2xhc3NOYW1lPXtgcHgtMyBweS0yIGZvbnQtbW9ubyBib3JkZXItciBib3JkZXItc2xhdGUtMjAwICR7Z2V0Q2VsbENsYXNzKHJvdywgJ2JwJyl9YH0+e3Jvdy5icD8ueiAhPT0gdW5kZWZpbmVkID8gcm93LmJwLnoudG9GaXhlZCgxKSA6ICfigJQnfTwvdGQ+fVxuXG4gICAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdzdXBwb3J0JykgJiYgPHRkIGNsYXNzTmFtZT1cInB4LTMgcHktMiBmb250LW1vbm8gdGV4dC1zbGF0ZS02MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMFwiPntyb3cuc3VwcG9ydENvb3I/LnggIT09IHVuZGVmaW5lZCA/IHJvdy5zdXBwb3J0Q29vci54LnRvRml4ZWQoMSkgOiAn4oCUJ308L3RkPn1cbiAgICAgICAgICAgICAge2NvbFZpc2libGUoJ3N1cHBvcnQnKSAmJiA8dGQgY2xhc3NOYW1lPVwicHgtMyBweS0yIGZvbnQtbW9ubyB0ZXh0LXNsYXRlLTYwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwXCI+e3Jvdy5zdXBwb3J0Q29vcj8ueSAhPT0gdW5kZWZpbmVkID8gcm93LnN1cHBvcnRDb29yLnkudG9GaXhlZCgxKSA6ICfigJQnfTwvdGQ+fVxuICAgICAgICAgICAgICB7Y29sVmlzaWJsZSgnc3VwcG9ydCcpICYmIDx0ZCBjbGFzc05hbWU9XCJweC0zIHB5LTIgZm9udC1tb25vIHRleHQtc2xhdGUtNjAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDBcIj57cm93LnN1cHBvcnRDb29yPy56ICE9PSB1bmRlZmluZWQgPyByb3cuc3VwcG9ydENvb3Iuei50b0ZpeGVkKDEpIDogJ+KAlCd9PC90ZD59XG4gICAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdzdXBwb3J0JykgJiYgPHRkIGNsYXNzTmFtZT1cInB4LTMgcHktMiBmb250LW1vbm8gdGV4dC1zbGF0ZS02MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMFwiPntyb3cuc3VwcG9ydE5hbWUgfHwgJ+KAlCd9PC90ZD59XG4gICAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdzdXBwb3J0JykgJiYgPHRkIGNsYXNzTmFtZT1cInB4LTMgcHktMiBmb250LW1vbm8gdGV4dC1zbGF0ZS02MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMFwiPntyb3cuc3VwcG9ydEd1aWQgfHwgJ+KAlCd9PC90ZD59XG4gICAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdzdXBwb3J0JykgJiYgPHRkIGNsYXNzTmFtZT1cInB4LTMgcHktMiBmb250LW1vbm8gdGV4dC1zbGF0ZS02MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMFwiPntyb3cuc2tleSB8fCAn4oCUJ308L3RkPn1cblxuICAgICAgICAgICAgICA8dGQgY2xhc3NOYW1lPVwicHgtMyBweS0yIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgYWxpZ24tdG9wXCI+e3JlbmRlckZpeGluZ0FjdGlvbihyb3cpfTwvdGQ+XG5cbiAgICAgICAgICAgICAge2NvbFZpc2libGUoJ2NhbGMnKSAmJiA8dGQgY2xhc3NOYW1lPVwicHgtMyBweS0yIGZvbnQtbW9ubyB0ZXh0LWN5YW4tNzAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgYmctc2xhdGUtNTAvNTBcIj57cm93LmxlbjE/LnRvRml4ZWQoMSkgfHwgJ+KAlCd9PC90ZD59XG4gICAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdjYWxjJykgJiYgPHRkIGNsYXNzTmFtZT1cInB4LTMgcHktMiB0ZXh0LWN5YW4tNzAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgYmctc2xhdGUtNTAvNTBcIj57cm93LmF4aXMxIHx8ICfigJQnfTwvdGQ+fVxuICAgICAgICAgICAgICB7Y29sVmlzaWJsZSgnY2FsYycpICYmIDx0ZCBjbGFzc05hbWU9XCJweC0zIHB5LTIgZm9udC1tb25vIHRleHQtY3lhbi03MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCBiZy1zbGF0ZS01MC81MFwiPntyb3cubGVuMj8udG9GaXhlZCgxKSB8fCAn4oCUJ308L3RkPn1cbiAgICAgICAgICAgICAge2NvbFZpc2libGUoJ2NhbGMnKSAmJiA8dGQgY2xhc3NOYW1lPVwicHgtMyBweS0yIHRleHQtY3lhbi03MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMCBiZy1zbGF0ZS01MC81MFwiPntyb3cuYXhpczIgfHwgJ+KAlCd9PC90ZD59XG4gICAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdjYWxjJykgJiYgPHRkIGNsYXNzTmFtZT1cInB4LTMgcHktMiBmb250LW1vbm8gdGV4dC1jeWFuLTcwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwIGJnLXNsYXRlLTUwLzUwXCI+e3Jvdy5sZW4zPy50b0ZpeGVkKDEpIHx8ICfigJQnfTwvdGQ+fVxuICAgICAgICAgICAgICB7Y29sVmlzaWJsZSgnY2FsYycpICYmIDx0ZCBjbGFzc05hbWU9XCJweC0zIHB5LTIgdGV4dC1jeWFuLTcwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwIGJnLXNsYXRlLTUwLzUwXCI+e3Jvdy5heGlzMyB8fCAn4oCUJ308L3RkPn1cbiAgICAgICAgICAgICAge2NvbFZpc2libGUoJ2NhbGMnKSAmJiA8dGQgY2xhc3NOYW1lPVwicHgtMyBweS0yIGZvbnQtbW9ubyB0ZXh0LWN5YW4tNzAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDAgYmctc2xhdGUtNTAvNTBcIj57cm93LmJybGVuPy50b0ZpeGVkKDEpIHx8ICfigJQnfTwvdGQ+fVxuXG4gICAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdkZXJpdmVkJykgJiYgPHRkIGNsYXNzTmFtZT1cInB4LTMgcHktMiBmb250LW1vbm8gdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMFwiPntyb3cuUElQSU5HX0NMQVNTIHx8ICfigJQnfTwvdGQ+fVxuICAgICAgICAgICAgICB7Y29sVmlzaWJsZSgnZGVyaXZlZCcpICYmIDx0ZCBjbGFzc05hbWU9XCJweC0zIHB5LTIgZm9udC1tb25vIHRleHQtc2xhdGUtNTAwIGJvcmRlci1yIGJvcmRlci1zbGF0ZS0yMDBcIj57cm93LlJBVElORyB8fCAn4oCUJ308L3RkPn1cbiAgICAgICAgICAgICAge2NvbFZpc2libGUoJ2Rlcml2ZWQnKSAmJiA8dGQgY2xhc3NOYW1lPVwicHgtMyBweS0yIGZvbnQtbW9ubyB0ZXh0LXNsYXRlLTQwMCBib3JkZXItciBib3JkZXItc2xhdGUtMjAwXCI+e3Jvdy5MSU5FTk9fS0VZIHx8ICfigJQnfTwvdGQ+fVxuXG4gICAgICAgICAgICAgIHtjb2xWaXNpYmxlKCdjYXMnKSAmJiBbOTcsOTgsMSwyLDMsNCw1LDYsNyw4LDksMTBdLm1hcChuID0+IHtcbiAgICAgICAgICAgICAgICAgIGxldCBjYVZhbCA9IHJvdy5jYSAmJiByb3cuY2Fbbl0gPyByb3cuY2Fbbl0gOiByb3dbYENBJHtufWBdO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIDx0ZCBrZXk9e2BjYSR7bn1gfSBjbGFzc05hbWU9XCJweC0zIHB5LTIgdGV4dC1zbGF0ZS01MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTIwMFwiPntjYVZhbCB8fCAn4oCUJ308L3RkPjtcbiAgICAgICAgICAgICAgfSl9XG4gICAgICAgICAgICA8L3RyPlxuICAgICAgICAgICl9KX1cbiAgICAgICAgPC90Ym9keT5cbiAgICAgICAgICA8L3RhYmxlPlxuICAgIDwvZGl2PlxuICApfVxuICAgIDwvPlxuICApO1xufVxuIl0sIm1hcHBpbmdzIjoiQUFBQSxPQUFPQSxLQUFLLE1BQU0sT0FBTztBQUN6QixTQUFTQyxhQUFhLFFBQVEsd0JBQXdCO0FBQ3RELFNBQVNDLFFBQVEsUUFBUSxzQkFBc0I7QUFDL0MsU0FBU0Msc0JBQXNCLFFBQVEsd0JBQXdCO0FBQy9ELFNBQVNDLFlBQVksUUFBUSxvQkFBb0I7QUFDakQsU0FBU0MsYUFBYSxFQUFFQyxlQUFlLFFBQVEsMEJBQTBCOztBQUV6RTtBQUNBO0FBQ0E7QUFBQSxTQUFBQyxHQUFBLElBQUFDLElBQUEsRUFBQUMsSUFBQSxJQUFBQyxLQUFBLEVBQUFDLFFBQUEsSUFBQUMsU0FBQTtBQUNBLE1BQU1DLGFBQWEsR0FBSUMsQ0FBQyxJQUFLQSxDQUFDLEdBQUcsSUFBSUEsQ0FBQyxDQUFDQyxDQUFDLEVBQUVDLE9BQU8sQ0FBQyxDQUFDLENBQUMsS0FBS0YsQ0FBQyxDQUFDRyxDQUFDLEVBQUVELE9BQU8sQ0FBQyxDQUFDLENBQUMsS0FBS0YsQ0FBQyxDQUFDSSxDQUFDLEVBQUVGLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUc7QUFFckcsTUFBTUcsV0FBVyxHQUFHLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLEtBQUss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
