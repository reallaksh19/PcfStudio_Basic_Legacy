import React, { useState, useCallback } from 'react';
import { useAppContext } from '/js/pcf-fixer-runtime/store/AppContext.js';
import { Tooltip } from '/js/pcf-fixer-runtime/ui/components/Tooltip.js';
import { jsx as _jsx, jsxs as _jsxs } from "/js/pcf-fixer-runtime/jsx-runtime.js";
export function ConfigTab() {
  const {
    state,
    dispatch
  } = useAppContext();
  const [localConfig, setLocalConfig] = useState(state.config);
  const handleSave = () => {
    dispatch({
      type: "SET_CONFIG",
      payload: localConfig
    });

    // Explicitly persist enabled validation checks
    if (localConfig.enabledChecks) {
      localStorage.setItem('enabledValidationChecks', JSON.stringify(localConfig.enabledChecks));
    }

    // Push a log for transparency
    dispatch({
      type: "ADD_LOG",
      payload: {
        type: "Info",
        message: "Configuration updated successfully."
      }
    });
  };
  const updateSmartFixer = (key, val) => {
    setLocalConfig(prev => ({
      ...prev,
      smartFixer: {
        ...prev.smartFixer,
        [key]: parseFloat(val) || 0
      }
    }));
  };
  const [specDbText, setSpecDbText] = useState(() => {
    const db = state.config?.specDatabase;
    return db && Object.keys(db).length > 0 ? JSON.stringify(db, null, 2) : '';
  });
  const [specDbError, setSpecDbError] = useState('');
  const applySpecDb = useCallback(() => {
    if (!specDbText.trim()) {
      setLocalConfig(prev => ({
        ...prev,
        specDatabase: {}
      }));
      setSpecDbError('');
      return;
    }
    try {
      const parsed = JSON.parse(specDbText);
      if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Must be a JSON object.');
      setLocalConfig(prev => ({
        ...prev,
        specDatabase: parsed
      }));
      setSpecDbError('');
    } catch (e) {
      setSpecDbError(e.message);
    }
  }, [specDbText]);
  return _jsxs("div", {
    className: "p-6 h-[calc(100vh-12rem)] overflow-y-auto overflow-x-hidden bg-white rounded shadow-sm border border-slate-200 custom-scrollbar relative",
    children: [_jsxs("div", {
      className: "flex justify-between items-center mb-6 border-b pb-4 sticky top-0 bg-white z-10 pt-2",
      children: [_jsx("h2", {
        className: "text-xl font-bold text-slate-800",
        children: "Engine Configuration"
      }), _jsx("button", {
        onClick: handleSave,
        className: "bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm transition",
        children: "Save Configuration"
      })]
    }), _jsxs("div", {
      className: "bg-white p-4 rounded border border-slate-200 shadow-sm mb-6",
      children: [_jsx("h3", {
        className: "font-semibold text-slate-700 mb-3 border-b pb-2",
        children: "Validation Rules Checklist (V1-V24)"
      }), _jsx("div", {
        className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2",
        children: [{
          id: 'V1',
          desc: 'Attempt to calculate (0,0,0) coordinates',
          tip: 'Detects components where all three coordinate fields are exactly zero, which usually indicates a parsing failure or placeholder value. The engine attempts to back-calculate the correct coordinates from neighboring components.'
        }, {
          id: 'V2',
          desc: 'Decimal consistency',
          tip: 'Checks that the number of decimal places used across EP1/EP2/CP coordinates is consistent with the configured precision (1 or 4 decimal places). Mixed precision often causes tolerance mismatches downstream.'
        }, {
          id: 'V3',
          desc: 'Bore consistency',
          tip: 'Flags components whose nominal bore differs from the adjacent piping run bore by more than the configured bore ratio range. Prevents reducers being silently skipped.'
        }, {
          id: 'V4',
          desc: 'BEND CP != EP1',
          tip: 'The Centre Point of a BEND must not coincide with End Point 1. If they are equal, the bend has zero tangent length on one side and will produce a degenerate geometry in stress analysis tools.'
        }, {
          id: 'V5',
          desc: 'BEND CP != EP2',
          tip: 'Symmetric check to V4 for End Point 2. A zero-length tangent on either leg of a bend is physically impossible.'
        }, {
          id: 'V6',
          desc: 'BEND CP not collinear',
          tip: 'Verifies that the CP of a BEND is NOT on the straight line joining EP1 and EP2. If the CP is collinear, the bend angle is effectively 180° or undefined.'
        }, {
          id: 'V7',
          desc: 'BEND equidistant legs',
          tip: 'Checks that dist(CP→EP1) ≈ dist(CP→EP2) within tolerance. Both tangent legs of a standard long-radius bend should be equal.'
        }, {
          id: 'V8',
          desc: 'TEE CP at midpoint',
          tip: 'The Centre Point of a TEE should lie at the midpoint of EP1-EP2 (i.e. on the header centreline). An offset CP indicates an incorrectly placed split point.'
        }, {
          id: 'V9',
          desc: 'TEE CP bore matches',
          tip: 'Ensures the header bore at the TEE CP matches the bore field. A mismatch usually means the wrong component SKEYs are referenced, producing a spurious reducer insertion.'
        }, {
          id: 'V10',
          desc: 'TEE Branch perpendicular',
          tip: 'Verifies that the Branch Point vector (CP→BP) is perpendicular to the header axis (EP1→EP2) within the configured angularity threshold. Non-perpendicular branches cause stress analysis failures.'
        }, {
          id: 'V11',
          desc: 'OLET has no end-points',
          tip: 'OLETs in ISOGEN PCF format define their position using CP and BP only — EP1/EP2 are not used. This rule flags any OLET that incorrectly carries end-point data.'
        }, {
          id: 'V12',
          desc: 'SUPPORT has no CAs',
          tip: 'SUPPORT component attributes (CA fields) should only be populated with specific data (position, GUID). Generic CAs inherited from piping runs often indicate a mis-parse.'
        }, {
          id: 'V13',
          desc: 'SUPPORT bore is 0',
          tip: 'Pipe supports do not carry a nominal bore — they are attached to the pipe, not in-line. A non-zero bore on a SUPPORT row is a data entry error.'
        }, {
          id: 'V14',
          desc: 'Missing <SKEY>',
          tip: 'Every physical component must have an ISOGEN SKEY (Shape KEY) that maps to a valid symbol shape in the piping spec. A missing SKEY will cause ISOGEN to skip the component silently.'
        }, {
          id: 'V15',
          desc: 'Coordinate continuity',
          tip: 'Checks that the end point of each component connects to the start point of the next component within the connection tolerance. Gaps/overlaps larger than the tolerance trigger a smart-fix proposal.'
        }, {
          id: 'V16',
          desc: 'CA8 usage scope',
          tip: 'CA8 is a special ISOGEN attribute that must only appear on specific component types (VALVE, FLANGE). This rule flags CA8 usage on components where it is not valid per the ISOGEN spec.'
        }, {
          id: 'V17',
          desc: 'No EP should be blank or -',
          tip: 'A coordinate field containing an empty string or literal hyphen "-" indicates the PCF was exported with unpopulated fields. These will cause null-reference errors in the topology engine.'
        }, {
          id: 'V18',
          desc: 'Bore unit (MM/Inch check)',
          tip: 'Detects bores that appear to be in imperial inches rather than millimetres (values <= the maxBoreForInchDetection threshold). Cross-unit mixing in a single file causes all bore-ratio calculations to be wrong.'
        }, {
          id: 'V19',
          desc: 'SUPPORT MSG-SQ tokens',
          tip: 'Validates that the MESSAGE-SQUARE text on SUPPORT rows uses the prescribed token format. Non-standard tokens are not parsed by downstream AVEVA tools.'
        }, {
          id: 'V20',
          desc: 'SUPPORT GUID Prefix (UCI:)',
          tip: 'Support component GUIDs must carry the "UCI:" prefix to be recognized by the AVEVA support placement pipeline. Missing prefix means the support will not be linked to its structural attachment.'
        }, {
          id: 'V21',
          desc: 'TEE BP Definition/Distance',
          tip: 'Checks that the Branch Point (BP) is defined and that its distance from the Centre Point (CP) is within a physically plausible range based on the nominal bore. An extreme BP distance usually points to a wrong coordinate frame.'
        }, {
          id: 'V22',
          desc: 'BEND minimum radius',
          tip: 'Verifies that the calculated bend radius is at least 1×D (nominally 1.5×D for long-radius bends) based on the nominal bore. Radii below this threshold cannot be manufactured and will be rejected by the stress system.'
        }, {
          id: 'V23',
          desc: 'OLET CP/BP definition',
          tip: 'An OLET must have both a Centre Point (the weld point on the header) and a Branch Point (the stub outlet). Missing either causes the ISOGEN symbol to render incorrectly.'
        }, {
          id: 'V24',
          desc: 'BEND valid angle calculation',
          tip: 'Back-calculates the bend angle from the three points (EP1, CP, EP2) and checks it is a valid ISOGEN bend angle (e.g. 22.5°, 45°, 90°). Non-standard angles indicate coordinate or model errors.'
        }].map(({
          id,
          desc,
          tip
        }) => {
          const checked = localConfig.enabledChecks ? localConfig.enabledChecks[id] !== false : true;
          return _jsxs("div", {
            className: "flex items-start space-x-2 py-1",
            children: [_jsx("input", {
              type: "checkbox",
              id: `chk-${id}`,
              className: "w-4 h-4 mt-0.5 text-blue-600 rounded border-gray-300",
              checked: checked,
              onChange: e => {
                const newChecks = {
                  ...(localConfig.enabledChecks || {})
                };
                newChecks[id] = e.target.checked;
                setLocalConfig(prev => ({
                  ...prev,
                  enabledChecks: newChecks
                }));
              }
            }), _jsx("label", {
              htmlFor: `chk-${id}`,
              className: "text-sm text-slate-700 cursor-pointer leading-tight",
              children: _jsxs(Tooltip, {
                text: tip,
                position: "right",
                children: [_jsxs("span", {
                  className: "font-semibold w-8 inline-block",
                  children: [id, ":"]
                }), " ", desc]
              })
            })]
          }, id);
        })
      }), _jsxs("div", {
        className: "mt-4 pt-4 border-t border-slate-200",
        children: [_jsx("h3", {
          className: "font-semibold text-slate-700 mb-3",
          children: "Topological Rules (R-XX) Execution Pipeline"
        }), _jsxs("div", {
          className: "grid grid-cols-1 md:grid-cols-2 gap-6 text-sm",
          children: [_jsxs("div", {
            className: "bg-blue-50 p-3 rounded border border-blue-200",
            children: [_jsx("h4", {
              className: "font-bold text-blue-800 mb-2 border-b border-blue-200 pb-1",
              children: "Phase 1 (Pipe Trimming & Filling)"
            }), _jsxs("ul", {
              className: "list-disc pl-5 text-blue-900 space-y-1",
              children: [_jsxs("li", {
                children: [_jsx("span", {
                  className: "font-semibold",
                  children: "R1:"
                }), " Pipe Segment Micro-Gap Deletion"]
              }), _jsxs("li", {
                children: [_jsx("span", {
                  className: "font-semibold",
                  children: "R2:"
                }), " Pipe Segment Micro-Overlap Trimming"]
              }), _jsxs("li", {
                children: [_jsx("span", {
                  className: "font-semibold",
                  children: "V15:"
                }), " Coordinate Continuity Enforcement"]
              })]
            })]
          }), _jsxs("div", {
            className: "bg-purple-50 p-3 rounded border border-purple-200",
            children: [_jsx("h4", {
              className: "font-bold text-purple-800 mb-2 border-b border-purple-200 pb-1",
              children: "Phase 2 (Topology & Fixes)"
            }), _jsxs("ul", {
              className: "list-disc pl-5 text-purple-900 space-y-1",
              children: [_jsxs("li", {
                children: [_jsx("span", {
                  className: "font-semibold",
                  children: "R3:"
                }), " Fitting Off-Axis Snapping"]
              }), _jsxs("li", {
                children: [_jsx("span", {
                  className: "font-semibold",
                  children: "R4:"
                }), " Orphaned Component Translation"]
              }), _jsxs("li", {
                children: [_jsx("span", {
                  className: "font-semibold",
                  children: "R5:"
                }), " Flow Direction Reversal (BEND/FLANGE)"]
              }), _jsxs("li", {
                children: [_jsx("span", {
                  className: "font-semibold",
                  children: "R6:"
                }), " Global Axis Topology Search"]
              })]
            })]
          })]
        })]
      })]
    }), _jsxs("div", {
      className: "bg-blue-50 p-4 rounded border border-blue-200 shadow-sm mb-6",
      children: [_jsx("h3", {
        className: "font-bold text-blue-800 mb-3",
        children: "Multi-Pass PTE Mode & Line Key Routing"
      }), _jsxs("div", {
        className: "grid grid-cols-1 md:grid-cols-3 gap-4",
        children: [_jsxs("div", {
          className: "flex items-center space-x-3",
          children: [_jsx("input", {
            type: "checkbox",
            checked: localConfig.pteMode?.autoMultiPassMode ?? true,
            onChange: e => setLocalConfig(p => ({
              ...p,
              pteMode: {
                ...p.pteMode,
                autoMultiPassMode: e.target.checked
              }
            })),
            className: "w-4 h-4 text-blue-600 rounded border-gray-300"
          }), _jsx("label", {
            className: "text-sm font-medium text-slate-700",
            children: "Auto Multi-Pass Mode"
          })]
        }), _jsxs("div", {
          className: "flex items-center space-x-3",
          children: [_jsx("input", {
            type: "checkbox",
            checked: localConfig.pteMode?.sequentialMode ?? true,
            onChange: e => setLocalConfig(p => ({
              ...p,
              pteMode: {
                ...p.pteMode,
                sequentialMode: e.target.checked
              }
            })),
            className: "w-4 h-4 text-blue-600 rounded border-gray-300"
          }), _jsx("label", {
            className: "text-sm font-medium text-slate-700",
            children: "Sequential Walk ON"
          })]
        }), _jsxs("div", {
          className: "flex items-center space-x-3",
          children: [_jsx("input", {
            type: "checkbox",
            checked: localConfig.pteMode?.lineKeyMode ?? true,
            onChange: e => setLocalConfig(p => ({
              ...p,
              pteMode: {
                ...p.pteMode,
                lineKeyMode: e.target.checked
              }
            })),
            className: "w-4 h-4 text-blue-600 rounded border-gray-300"
          }), _jsx("label", {
            className: "text-sm font-medium text-slate-700",
            children: "Line_Key Constraints (if avialable) ON"
          })]
        })]
      }), _jsxs("div", {
        className: "mt-4 pt-4 border-t border-blue-100 flex items-center space-x-4",
        children: [_jsx("label", {
          className: "text-sm font-semibold text-slate-700",
          children: "Line_Key Target Column:"
        }), _jsxs("select", {
          className: "p-1.5 border border-slate-300 rounded text-sm w-48",
          value: localConfig.pteMode?.lineKeyColumn ?? "pipelineRef",
          onChange: e => setLocalConfig(p => ({
            ...p,
            pteMode: {
              ...p.pteMode,
              lineKeyColumn: e.target.value
            }
          })),
          children: [_jsx("option", {
            value: "pipelineRef",
            children: "PIPELINE-REFERENCE"
          }), _jsx("option", {
            value: "text",
            children: "MESSAGE-SQUARE Text"
          }), _jsx("option", {
            value: "ca97",
            children: "CA97 (RefNo)"
          }), _jsx("option", {
            value: "ca98",
            children: "CA98 (SeqNo)"
          })]
        }), _jsx("span", {
          className: "text-xs text-slate-500 italic",
          children: "Determines the boundary for multi-pass segment logic."
        })]
      }), _jsxs("div", {
        className: "mt-4 pt-4 border-t border-blue-100 grid grid-cols-1 md:grid-cols-4 gap-4",
        children: [_jsxs("div", {
          className: "flex flex-col",
          children: [_jsx("label", {
            className: "text-xs text-slate-600 mb-1",
            children: "Bore Ratio Min"
          }), _jsx("input", {
            type: "number",
            step: "0.1",
            value: localConfig.pteMode?.boreRatioMin ?? 0.7,
            onChange: e => setLocalConfig(p => ({
              ...p,
              pteMode: {
                ...p.pteMode,
                boreRatioMin: parseFloat(e.target.value)
              }
            })),
            className: "p-1 border rounded text-sm font-mono w-full"
          })]
        }), _jsxs("div", {
          className: "flex flex-col",
          children: [_jsx("label", {
            className: "text-xs text-slate-600 mb-1",
            children: "Bore Ratio Max"
          }), _jsx("input", {
            type: "number",
            step: "0.1",
            value: localConfig.pteMode?.boreRatioMax ?? 1.5,
            onChange: e => setLocalConfig(p => ({
              ...p,
              pteMode: {
                ...p.pteMode,
                boreRatioMax: parseFloat(e.target.value)
              }
            })),
            className: "p-1 border rounded text-sm font-mono w-full"
          })]
        }), _jsxs("div", {
          className: "flex flex-col",
          children: [_jsx("label", {
            className: "text-xs text-slate-600 mb-1",
            children: "Sweep Radii Min (xNB)"
          }), _jsx("input", {
            type: "number",
            step: "0.1",
            value: localConfig.pteMode?.sweepRadiusMinMultiplier ?? 0.2,
            onChange: e => setLocalConfig(p => ({
              ...p,
              pteMode: {
                ...p.pteMode,
                sweepRadiusMinMultiplier: parseFloat(e.target.value)
              }
            })),
            className: "p-1 border rounded text-sm font-mono w-full"
          })]
        }), _jsxs("div", {
          className: "flex flex-col",
          children: [_jsx("label", {
            className: "text-xs text-slate-600 mb-1",
            children: "Sweep Radii Max (mm)"
          }), _jsx("input", {
            type: "number",
            step: "10",
            value: localConfig.pteMode?.sweepRadiusMax ?? 13000,
            onChange: e => setLocalConfig(p => ({
              ...p,
              pteMode: {
                ...p.pteMode,
                sweepRadiusMax: parseFloat(e.target.value)
              }
            })),
            className: "p-1 border rounded text-sm font-mono w-full"
          })]
        })]
      })]
    }), _jsxs("div", {
      className: "bg-amber-50 p-4 rounded border border-amber-200 shadow-sm mb-6",
      children: [_jsx("h3", {
        className: "font-semibold text-amber-800 mb-3",
        children: "Bore Conversion Harmonization"
      }), _jsxs("label", {
        className: "flex items-center space-x-3",
        children: [_jsx("input", {
          type: "checkbox",
          checked: localConfig.enableBoreInchToMm === true,
          onChange: e => setLocalConfig(prev => ({
            ...prev,
            enableBoreInchToMm: e.target.checked
          })),
          className: "w-4 h-4 text-blue-600 rounded border-gray-300"
        }), _jsx("span", {
          className: "text-sm text-slate-700",
          children: "Enable Bore Inch \u2192 MM conversion"
        })]
      })]
    }), _jsxs("div", {
      className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
      children: [_jsxs("div", {
        className: "bg-slate-50 p-4 rounded border border-slate-200 shadow-sm",
        children: [_jsx("h3", {
          className: "font-semibold text-slate-700 mb-3",
          children: "Geometry & Heuristics Thresholds"
        }), _jsxs("div", {
          className: "space-y-3",
          children: [_jsx("div", {
            className: "flex flex-col bg-blue-50/50 p-2 rounded gap-1",
            children: _jsxs("div", {
              className: "flex justify-between items-center",
              children: [_jsx(Tooltip, {
                text: "Pass 3A runs a global fuzzy spatial search after the sequential pass. It attempts to resolve orphaned components that could not be connected during the directional walk by searching the entire model space. This is the most computationally expensive pass \u2014 disable on very large files if performance is an issue.",
                position: "right",
                children: _jsx("label", {
                  className: "text-sm text-blue-800 font-medium",
                  children: "Enable Pass 3A (Complex Synthesis)"
                })
              }), _jsx("input", {
                type: "checkbox",
                checked: localConfig.smartFixer.enablePass3A !== false,
                onChange: e => updateSmartFixer('enablePass3A', e.target.checked),
                className: "w-5 h-5 text-blue-600 bg-white border-slate-300 rounded"
              })]
            })
          }), _jsxs("div", {
            className: "flex flex-col bg-blue-50/50 p-2 rounded gap-1",
            children: [_jsxs("div", {
              className: "flex justify-between items-center",
              children: [_jsx(Tooltip, {
                text: "Proposals with a confidence score below this threshold are silently dropped. Score 0\u2013100: a high score means the engine is very confident about the spatial connection. Increase this value to only see high-confidence proposals; decrease it to surface more speculative matches.",
                position: "right",
                children: _jsx("label", {
                  className: "text-sm text-blue-800 font-medium",
                  children: "Min Topology Approval Score"
                })
              }), _jsx("input", {
                type: "number",
                step: "1",
                value: localConfig.smartFixer.minApprovalScore ?? 10,
                onChange: e => updateSmartFixer('minApprovalScore', parseFloat(e.target.value)),
                className: "w-24 p-1 border rounded text-right text-sm font-mono",
                title: "Threshold for proposing fixes. Drops below this score."
              })]
            }), _jsxs("div", {
              className: "bg-slate-50 p-3 rounded border border-slate-200 mt-2 space-y-2",
              children: [_jsxs("label", {
                className: "flex items-center justify-between cursor-pointer",
                children: [_jsx("span", {
                  className: "text-sm font-semibold text-slate-700",
                  children: "Use Dynamic Logarithmic Scoring"
                }), _jsx("input", {
                  type: "checkbox",
                  checked: localConfig.smartFixer.dynamicScoring ?? false,
                  onChange: e => updateSmartFixer('dynamicScoring', e.target.checked),
                  className: "form-checkbox h-4 w-4 text-blue-600 rounded"
                })]
              }), _jsxs("p", {
                className: "text-xs text-slate-500 leading-relaxed",
                children: ["When enabled, the ", _jsx("code", {
                  children: "Size Ratio"
                }), " score scales dynamically using a logarithmic curve based on actual pipe bore absolute sizes, rather than assigning a flat bonus. It severely penalizes mismatches on small bore piping while being forgiving on main headers."]
              })]
            }), _jsxs("p", {
              className: "text-[10px] text-slate-500 italic mt-1 leading-tight",
              children: [_jsx("strong", {
                children: "Score Basis:"
              }), " The engine scores proposals from 0-100 based on weighted metrics: Line_Key Match (30%), Element Axis Alignment (25%), Pipeline Bore Ratio Continuity (25%), Global Sweeping Radius (10%), and Immutable Bounds (10%). Proposals scoring below this threshold are automatically dropped."]
            })]
          }), _jsxs("div", {
            className: "flex justify-between items-center",
            children: [_jsx(Tooltip, {
              text: "Pipe segments shorter than this length (mm) are automatically flagged for deletion. These micro-pipes usually arise from rounding errors in CAD exports and cause issues in flexibility analysis tools. Set to 0 to disable automatic micro-pipe deletion.",
              position: "right",
              children: _jsx("label", {
                className: "text-sm text-slate-600",
                children: "Micro-Pipe Deletion Threshold (mm)"
              })
            }), _jsx("input", {
              type: "number",
              step: "0.1",
              value: localConfig.smartFixer.microPipeThreshold,
              onChange: e => updateSmartFixer('microPipeThreshold', e.target.value),
              className: "w-24 p-1 border rounded text-right text-sm font-mono"
            })]
          }), _jsxs("div", {
            className: "flex justify-between items-center",
            children: [_jsx(Tooltip, {
              text: "Non-pipe fittings (BEND, FLANGE, VALVE) with a face-to-face length below this value (mm) generate a warning. Very short fittings are usually caused by a data translation error and may not be manufacturable.",
              position: "right",
              children: _jsx("label", {
                className: "text-sm text-slate-600",
                children: "Micro-Fitting Warning"
              })
            }), _jsx("input", {
              type: "number",
              step: "0.1",
              value: localConfig.smartFixer.microFittingThreshold,
              onChange: e => updateSmartFixer('microFittingThreshold', e.target.value),
              className: "w-24 p-1 border rounded text-right text-sm font-mono"
            })]
          }), _jsxs("div", {
            className: "flex justify-between items-center",
            children: [_jsx(Tooltip, {
              text: "If a fitting's minor axis offset (the component is slightly off the pipe centreline) is smaller than this value (mm), the engine automatically snaps it back onto the centreline without requiring user approval. A higher threshold is more aggressive \u2014 only increase if your data has known systematic off-axis offsets.",
              position: "right",
              children: _jsx("label", {
                className: "text-sm text-slate-600",
                children: "Off-Axis Snapping"
              })
            }), _jsx("input", {
              type: "number",
              step: "0.1",
              value: localConfig.smartFixer.diagonalMinorThreshold,
              onChange: e => updateSmartFixer('diagonalMinorThreshold', e.target.value),
              className: "w-24 p-1 border rounded text-right text-sm font-mono"
            })]
          })]
        })]
      }), _jsxs("div", {
        className: "bg-slate-50 p-4 rounded border border-slate-200 shadow-sm",
        children: [_jsxs("h3", {
          className: "font-semibold text-slate-700 mb-3 flex items-center justify-between",
          children: [_jsx("span", {
            children: "Ray Shooter Integration (Stage 1C)"
          }), _jsxs("label", {
            className: "flex items-center cursor-pointer",
            children: [_jsx("span", {
              className: "text-xs text-slate-500 mr-2 font-normal",
              children: "Enable Ray Shooter"
            }), _jsx("input", {
              type: "checkbox",
              checked: localConfig.smartFixer.rayShooter?.enabled ?? true,
              onChange: e => updateSmartFixer('rayShooter', {
                ...localConfig.smartFixer.rayShooter,
                enabled: e.target.checked
              }),
              className: "form-checkbox h-4 w-4 text-blue-600 rounded"
            })]
          })]
        }), _jsxs("div", {
          className: `space-y-3 ${!(localConfig.smartFixer.rayShooter?.enabled ?? true) ? 'opacity-50 pointer-events-none' : ''}`,
          children: [_jsxs("div", {
            className: "flex justify-between items-center",
            children: [_jsx("label", {
              className: "text-sm text-slate-600",
              title: "Max perpendicular distance from candidate endpoint to ray line",
              children: "Tube Tolerance (mm)"
            }), _jsx("input", {
              type: "number",
              step: "0.1",
              value: localConfig.smartFixer.rayShooter?.tubeTolerance ?? 50.0,
              onChange: e => updateSmartFixer('rayShooter', {
                ...localConfig.smartFixer.rayShooter,
                tubeTolerance: parseFloat(e.target.value)
              }),
              className: "w-24 p-1 border rounded text-right text-sm font-mono"
            })]
          }), _jsxs("div", {
            className: "pt-2 border-t border-slate-200",
            children: [_jsxs("label", {
              className: "flex items-center justify-between cursor-pointer mb-2",
              children: [_jsx("span", {
                className: "text-sm text-slate-600",
                children: "Pass 1: Same-Bore Candidates"
              }), _jsx("input", {
                type: "checkbox",
                checked: localConfig.smartFixer.rayShooter?.pass1SameBore ?? true,
                onChange: e => updateSmartFixer('rayShooter', {
                  ...localConfig.smartFixer.rayShooter,
                  pass1SameBore: e.target.checked
                }),
                className: "form-checkbox h-4 w-4 text-blue-600 rounded"
              })]
            }), _jsxs("label", {
              className: "flex items-center justify-between cursor-pointer mb-2",
              children: [_jsx("span", {
                className: "text-sm text-slate-600",
                children: "Pass 2: Any-Bore Candidates (Injects Reducers)"
              }), _jsx("input", {
                type: "checkbox",
                checked: localConfig.smartFixer.rayShooter?.pass2AnyBore ?? true,
                onChange: e => updateSmartFixer('rayShooter', {
                  ...localConfig.smartFixer.rayShooter,
                  pass2AnyBore: e.target.checked
                }),
                className: "form-checkbox h-4 w-4 text-blue-600 rounded"
              })]
            }), _jsxs("label", {
              className: "flex items-center justify-between cursor-pointer mb-2",
              children: [_jsx("span", {
                className: "text-sm text-slate-600",
                title: "Shoot into already-resolved Stage 1A components",
                children: "Pass 3: Resolved (Stage 1A) Candidates"
              }), _jsx("input", {
                type: "checkbox",
                checked: localConfig.smartFixer.rayShooter?.pass3Resolved ?? false,
                onChange: e => updateSmartFixer('rayShooter', {
                  ...localConfig.smartFixer.rayShooter,
                  pass3Resolved: e.target.checked
                }),
                className: "form-checkbox h-4 w-4 text-blue-600 rounded"
              })]
            }), _jsxs("label", {
              className: "flex items-center justify-between cursor-pointer",
              children: [_jsx("span", {
                className: "text-sm text-slate-600",
                title: "Shoot along cardinal axes if sequential vector fails",
                children: "Pass 4: Global Axis Fallback"
              }), _jsx("input", {
                type: "checkbox",
                checked: localConfig.smartFixer.rayShooter?.pass4GlobalAxis ?? true,
                onChange: e => updateSmartFixer('rayShooter', {
                  ...localConfig.smartFixer.rayShooter,
                  pass4GlobalAxis: e.target.checked
                }),
                className: "form-checkbox h-4 w-4 text-blue-600 rounded"
              })]
            })]
          })]
        })]
      }), _jsxs("div", {
        className: "bg-slate-50 p-4 rounded border border-slate-200 shadow-sm md:col-span-2",
        children: [_jsxs("div", {
          className: "flex justify-between items-center mb-3",
          children: [_jsx("h3", {
            className: "font-semibold text-slate-700 text-orange-500",
            children: "Common 3D Cleanup Rules"
          }), _jsxs("label", {
            className: "flex items-center space-x-2 cursor-pointer",
            children: [_jsx("input", {
              type: "checkbox",
              checked: localConfig.smartFixer.enable3DRules !== false,
              onChange: e => updateSmartFixer('enable3DRules', e.target.checked),
              className: "w-4 h-4 text-orange-500 border-slate-300 rounded focus:ring-orange-500"
            }), _jsx("span", {
              className: "text-sm font-medium text-slate-700",
              children: "Enable 3D Rules"
            })]
          })]
        }), _jsxs("div", {
          className: `grid grid-cols-1 md:grid-cols-2 gap-4 ${localConfig.smartFixer.enable3DRules === false ? 'opacity-50 pointer-events-none' : ''}`,
          children: [_jsxs("div", {
            children: [_jsx("div", {
              className: "flex justify-between items-center mb-1",
              children: _jsx("label", {
                className: "text-sm font-medium text-slate-700",
                children: "Max single plane Run (mm)"
              })
            }), _jsx("input", {
              type: "number",
              step: "1",
              value: localConfig.smartFixer.maxSinglePlaneRun ?? 12000,
              onChange: e => updateSmartFixer('maxSinglePlaneRun', parseFloat(e.target.value)),
              className: "w-full p-2 border border-slate-300 rounded text-sm mb-1 bg-white font-mono"
            }), _jsx("p", {
              className: "text-xs text-slate-500 italic",
              children: "Maximum allowed continuous straight length without a break or support."
            })]
          }), _jsxs("div", {
            children: [_jsx("div", {
              className: "flex justify-between items-center mb-1",
              children: _jsx("label", {
                className: "text-sm font-medium text-slate-700",
                children: "Max Overlap (mm)"
              })
            }), _jsx("input", {
              type: "number",
              step: "1",
              value: localConfig.smartFixer.maxOverlap ?? 1000,
              onChange: e => updateSmartFixer('maxOverlap', parseFloat(e.target.value)),
              className: "w-full p-2 border border-slate-300 rounded text-sm mb-1 bg-white font-mono"
            }), _jsx("p", {
              className: "text-xs text-slate-500 italic",
              children: "Maximum allowed distance two components can physically intersect."
            })]
          }), _jsxs("div", {
            children: [_jsx("div", {
              className: "flex justify-between items-center mb-1",
              children: _jsx("label", {
                className: "text-sm font-medium text-slate-700",
                children: "Min Pipe Size (mm)"
              })
            }), _jsx("input", {
              type: "number",
              step: "1",
              value: localConfig.smartFixer.minPipeSize ?? 0,
              onChange: e => updateSmartFixer('minPipeSize', parseFloat(e.target.value)),
              className: "w-full p-2 border border-slate-300 rounded text-sm mb-1 bg-white font-mono"
            }), _jsx("p", {
              className: "text-xs text-slate-500 italic",
              children: "Minimum Nominal Bore. Skips advanced merging logic for tubing below this size."
            })]
          }), _jsxs("div", {
            children: [_jsx("div", {
              className: "flex justify-between items-center mb-1",
              children: _jsx("label", {
                className: "text-sm font-medium text-slate-700",
                children: "Min Component Size (mm)"
              })
            }), _jsx("input", {
              type: "number",
              step: "1",
              value: localConfig.smartFixer.minComponentSize ?? 3,
              onChange: e => updateSmartFixer('minComponentSize', parseFloat(e.target.value)),
              className: "w-full p-2 border border-slate-300 rounded text-sm mb-1 bg-white font-mono"
            }), _jsx("p", {
              className: "text-xs text-slate-500 italic",
              children: "Prevents synthesizing impossible, paper-thin structural components."
            })]
          }), _jsxs("div", {
            children: [_jsx("div", {
              className: "flex justify-between items-center mb-1",
              children: _jsx("label", {
                className: "text-sm font-medium text-slate-700",
                children: "3-Plane Skew Limit (mm)"
              })
            }), _jsx("input", {
              type: "number",
              step: "1",
              value: localConfig.smartFixer.threePlaneSkewLimit ?? 2000,
              onChange: e => updateSmartFixer('threePlaneSkewLimit', parseFloat(e.target.value)),
              className: "w-full p-2 border border-slate-300 rounded text-sm mb-1 bg-white font-mono"
            }), _jsx("p", {
              className: "text-xs text-slate-500 italic",
              children: "Limits length of synthesized gaps skewed across all three X, Y, and Z axes."
            })]
          }), _jsxs("div", {
            children: [_jsx("div", {
              className: "flex justify-between items-center mb-1",
              children: _jsx("label", {
                className: "text-sm font-medium text-slate-700",
                children: "2-Plane Skew Limit (mm)"
              })
            }), _jsx("input", {
              type: "number",
              step: "1",
              value: localConfig.smartFixer.twoPlaneSkewLimit ?? 3000,
              onChange: e => updateSmartFixer('twoPlaneSkewLimit', parseFloat(e.target.value)),
              className: "w-full p-2 border border-slate-300 rounded text-sm mb-1 bg-white font-mono"
            }), _jsx("p", {
              className: "text-xs text-slate-500 italic",
              children: "Limits length of synthesized gaps skewed across two axes."
            })]
          }), _jsxs("div", {
            children: [_jsx("div", {
              className: "flex justify-between items-center mb-1",
              children: _jsx("label", {
                className: "text-sm font-medium text-slate-700",
                children: "Max Diagonal Gap (mm)"
              })
            }), _jsx("input", {
              type: "number",
              step: "1",
              value: localConfig.smartFixer.maxDiagonalGap ?? 6000,
              onChange: e => updateSmartFixer('maxDiagonalGap', parseFloat(e.target.value)),
              className: "w-full p-2 border border-slate-300 rounded text-sm mb-1 bg-white font-mono"
            }), _jsx("p", {
              className: "text-xs text-slate-500 italic",
              children: "Failsafe limit for bridging gaps strictly involving turning components."
            })]
          }), _jsxs("div", {
            children: [_jsx("div", {
              className: "flex justify-between items-center mb-1",
              children: _jsx("label", {
                className: "text-sm font-medium text-slate-700",
                children: "Single Axis Slope Tolerance"
              })
            }), _jsx("input", {
              type: "number",
              step: "0.001",
              value: localConfig.smartFixer.singleAxisSlopeTolerance ?? 0.01,
              onChange: e => updateSmartFixer('singleAxisSlopeTolerance', parseFloat(e.target.value)),
              className: "w-full p-2 border border-slate-300 rounded text-sm mb-1 bg-white font-mono"
            }), _jsx("p", {
              className: "text-xs text-slate-500 italic",
              children: "Ratio (e.g. 0.01) to ignore mild slopes on horizontal runs."
            })]
          })]
        })]
      }), _jsxs("div", {
        className: "bg-slate-50 p-4 rounded border border-slate-200 shadow-sm",
        children: [_jsx("h3", {
          className: "font-semibold text-slate-700 mb-3",
          children: "Gap & Overlap Limits (mm)"
        }), _jsxs("div", {
          className: "space-y-3",
          children: [_jsxs("div", {
            className: "flex justify-between items-center",
            children: [_jsx("label", {
              className: "text-sm text-slate-600",
              children: "Silent Snap Micro-Gap"
            }), _jsx("input", {
              type: "number",
              step: "0.1",
              value: localConfig.smartFixer.negligibleGap,
              onChange: e => updateSmartFixer('negligibleGap', e.target.value),
              className: "w-24 p-1 border rounded text-right text-sm font-mono"
            })]
          }), _jsxs("div", {
            className: "flex justify-between items-center",
            children: [_jsx("label", {
              className: "text-sm text-slate-600",
              children: "Auto-Fill Pipe Max Gap"
            }), _jsx("input", {
              type: "number",
              step: "0.1",
              value: localConfig.smartFixer.autoFillMaxGap,
              onChange: e => updateSmartFixer('autoFillMaxGap', e.target.value),
              className: "w-24 p-1 border rounded text-right text-sm font-mono"
            })]
          }), _jsxs("div", {
            className: "flex justify-between items-center",
            children: [_jsx("label", {
              className: "text-sm text-slate-600",
              children: "Auto-Trim Max Overlap"
            }), _jsx("input", {
              type: "number",
              step: "0.1",
              value: localConfig.smartFixer.autoTrimMaxOverlap,
              onChange: e => updateSmartFixer('autoTrimMaxOverlap', e.target.value),
              className: "w-24 p-1 border rounded text-right text-sm font-mono"
            })]
          }), _jsxs("div", {
            className: "flex justify-between items-center",
            children: [_jsx("label", {
              className: "text-sm text-slate-600",
              children: "Gap Review Warning"
            }), _jsx("input", {
              type: "number",
              step: "0.1",
              value: localConfig.smartFixer.reviewGapMax,
              onChange: e => updateSmartFixer('reviewGapMax', e.target.value),
              className: "w-24 p-1 border rounded text-right text-sm font-mono"
            })]
          })]
        })]
      }), _jsxs("div", {
        className: "bg-slate-50 p-4 rounded border border-slate-200 shadow-sm",
        children: [_jsx("h3", {
          className: "font-semibold text-slate-700 mb-3",
          children: "Topological Rules"
        }), _jsxs("div", {
          className: "space-y-3",
          children: [_jsxs("div", {
            className: "flex justify-between items-center",
            children: [_jsx("label", {
              className: "text-sm text-slate-600",
              children: "Topological Route Closure Alert (mm)"
            }), _jsx("input", {
              type: "number",
              step: "0.1",
              value: localConfig.smartFixer.closureWarningThreshold,
              onChange: e => updateSmartFixer('closureWarningThreshold', e.target.value),
              className: "w-24 p-1 border rounded text-right text-sm font-mono"
            })]
          }), _jsxs("div", {
            className: "flex justify-between items-center",
            children: [_jsx("label", {
              className: "text-sm text-slate-600",
              children: "Topological Route Closure Max Gap (mm)"
            }), _jsx("input", {
              type: "number",
              step: "0.1",
              value: localConfig.smartFixer.closureErrorThreshold,
              onChange: e => updateSmartFixer('closureErrorThreshold', e.target.value),
              className: "w-24 p-1 border rounded text-right text-sm font-mono"
            })]
          }), _jsxs("div", {
            className: "flex justify-between items-center",
            children: [_jsx("label", {
              className: "text-sm text-slate-600",
              children: "OLET Max Branch Ratio"
            }), _jsx("input", {
              type: "number",
              step: "0.01",
              value: localConfig.smartFixer.oletMaxRatioError,
              onChange: e => updateSmartFixer('oletMaxRatioError', e.target.value),
              className: "w-24 p-1 border rounded text-right text-sm font-mono"
            })]
          }), _jsxs("div", {
            className: "flex justify-between items-center",
            children: [_jsx("label", {
              className: "text-sm text-slate-600",
              children: "Connection Tolerance (mm)"
            }), _jsx("input", {
              type: "number",
              step: "0.1",
              value: localConfig.smartFixer.connectionTolerance,
              onChange: e => updateSmartFixer('connectionTolerance', e.target.value),
              className: "w-24 p-1 border rounded text-right text-sm font-mono"
            })]
          })]
        })]
      }), _jsxs("div", {
        className: "bg-indigo-50 p-4 rounded border border-indigo-200 shadow-sm",
        children: [_jsxs("h3", {
          className: "font-semibold text-indigo-900 mb-3 flex items-center justify-between",
          children: [_jsx("span", {
            children: "Draw Canvas Tool"
          }), _jsxs("label", {
            className: "flex items-center cursor-pointer gap-2",
            children: [_jsx("span", {
              className: "text-xs text-slate-500 font-normal",
              children: "Enable Icon"
            }), _jsx("input", {
              type: "checkbox",
              checked: localConfig.enableDrawCanvas !== false,
              onChange: e => setLocalConfig(prev => ({
                ...prev,
                enableDrawCanvas: e.target.checked
              })),
              className: "w-4 h-4 text-indigo-600 rounded border-gray-300"
            })]
          })]
        }), _jsx("p", {
          className: "text-xs text-indigo-800 mb-3 leading-relaxed",
          children: "Show the \"Open Draw Canvas\" button in the TOOLS ribbon to access the standalone drafting environment."
        })]
      }), _jsxs("div", {
        className: "bg-green-50 p-4 rounded border border-green-200 shadow-sm",
        children: [_jsxs("h3", {
          className: "font-semibold text-green-900 mb-3 flex items-center justify-between",
          children: [_jsx("span", {
            children: "A* Obstacle-Aware Gap Routing"
          }), _jsxs("label", {
            className: "flex items-center cursor-pointer gap-2",
            children: [_jsx("span", {
              className: "text-xs text-slate-500 font-normal",
              children: "Enable"
            }), _jsx("input", {
              type: "checkbox",
              checked: localConfig.smartFixer.pathfindingEnabled !== false,
              onChange: e => updateSmartFixer('pathfindingEnabled', e.target.checked),
              className: "w-4 h-4 text-green-600 rounded border-gray-300"
            })]
          })]
        }), _jsx("p", {
          className: "text-xs text-green-800 mb-3 leading-relaxed",
          children: "When a multi-axis gap cannot be filled with a single straight pipe, A* searches for an obstacle-avoiding axis-aligned route and proposes a multi-segment PATHFIND fix (R-GAP-07)."
        }), _jsxs("div", {
          className: `space-y-2 ${localConfig.smartFixer.pathfindingEnabled === false ? 'opacity-50 pointer-events-none' : ''}`,
          children: [_jsxs("div", {
            className: "flex justify-between items-center",
            children: [_jsx("label", {
              className: "text-sm text-slate-600",
              children: "Grid Resolution (mm/cell)"
            }), _jsx("input", {
              type: "number",
              step: "10",
              value: localConfig.smartFixer.pathfindingGridResolution ?? 100,
              onChange: e => updateSmartFixer('pathfindingGridResolution', e.target.value),
              className: "w-24 p-1 border rounded text-right text-sm font-mono"
            })]
          }), _jsxs("div", {
            className: "flex justify-between items-center",
            children: [_jsx("label", {
              className: "text-sm text-slate-600",
              children: "Max Search Cells"
            }), _jsx("input", {
              type: "number",
              step: "500",
              value: localConfig.smartFixer.pathfindingMaxCells ?? 6000,
              onChange: e => updateSmartFixer('pathfindingMaxCells', e.target.value),
              className: "w-24 p-1 border rounded text-right text-sm font-mono"
            })]
          }), _jsxs("div", {
            className: "flex justify-between items-center",
            children: [_jsx("label", {
              className: "text-sm text-slate-600",
              children: "Max Routing Distance (mm)"
            }), _jsx("input", {
              type: "number",
              step: "500",
              value: localConfig.smartFixer.pathfindingMaxDistance ?? 15000,
              onChange: e => updateSmartFixer('pathfindingMaxDistance', e.target.value),
              className: "w-24 p-1 border rounded text-right text-sm font-mono"
            })]
          })]
        })]
      })]
    }), _jsxs("div", {
      className: "bg-amber-50 p-4 rounded border border-amber-200 shadow-sm mt-6",
      children: [_jsxs("div", {
        className: "flex items-center justify-between mb-3",
        children: [_jsx("h3", {
          className: "font-bold text-amber-900",
          children: "Material & Spec Database (SKEY Cross-Reference)"
        }), _jsxs("label", {
          className: "flex items-center gap-2 cursor-pointer",
          children: [_jsx("span", {
            className: "text-sm text-slate-600",
            children: "Enable Spec Validation"
          }), _jsx("input", {
            type: "checkbox",
            checked: localConfig.specValidationEnabled ?? false,
            onChange: e => setLocalConfig(prev => ({
              ...prev,
              specValidationEnabled: e.target.checked
            })),
            className: "w-4 h-4 text-amber-600 rounded border-gray-300"
          })]
        })]
      }), _jsx("p", {
        className: "text-xs text-amber-800 mb-3 leading-relaxed",
        children: "Paste a JSON object mapping SKEY codes to spec entries. When enabled, SPEC-01 through SPEC-04 rules will cross-reference each component against this database and warn on unknown SKEYs, type mismatches, bore mismatches, and material mismatches."
      }), _jsx("p", {
        className: "text-xs text-slate-500 mb-2 font-mono",
        children: `{ "FL-WNRF-300": { "type": "FLANGE", "bore": 300, "description": "WN RF Flange 300nb", "material": "ASTM A105" }, ... }`
      }), _jsx("textarea", {
        className: "w-full h-40 p-2 border border-amber-300 rounded font-mono text-xs bg-white resize-y",
        placeholder: '{\n  "FL-WNRF-0300": { "type": "FLANGE", "bore": 300, "description": "WN RF 300nb", "material": "ASTM A105" }\n}',
        value: specDbText,
        onChange: e => setSpecDbText(e.target.value),
        spellCheck: false
      }), specDbError && _jsxs("p", {
        className: "text-xs text-red-600 mt-1 font-semibold",
        children: ["JSON error: ", specDbError]
      }), _jsxs("div", {
        className: "flex items-center gap-3 mt-2",
        children: [_jsx("button", {
          onClick: applySpecDb,
          className: "px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded transition font-medium",
          children: "Apply Spec DB"
        }), _jsx("span", {
          className: "text-xs text-slate-500",
          children: localConfig.specDatabase ? `${Object.keys(localConfig.specDatabase).length} entries loaded` : '0 entries loaded'
        })]
      })]
    })]
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsInVzZVN0YXRlIiwidXNlQ2FsbGJhY2siLCJ1c2VBcHBDb250ZXh0IiwiVG9vbHRpcCIsImpzeCIsIl9qc3giLCJqc3hzIiwiX2pzeHMiLCJDb25maWdUYWIiLCJzdGF0ZSIsImRpc3BhdGNoIiwibG9jYWxDb25maWciLCJzZXRMb2NhbENvbmZpZyIsImNvbmZpZyIsImhhbmRsZVNhdmUiLCJ0eXBlIiwicGF5bG9hZCIsImVuYWJsZWRDaGVja3MiLCJsb2NhbFN0b3JhZ2UiLCJzZXRJdGVtIiwiSlNPTiIsInN0cmluZ2lmeSIsIm1lc3NhZ2UiLCJ1cGRhdGVTbWFydEZpeGVyIiwia2V5IiwidmFsIiwicHJldiIsInNtYXJ0Rml4ZXIiLCJwYXJzZUZsb2F0Iiwic3BlY0RiVGV4dCIsInNldFNwZWNEYlRleHQiLCJkYiIsInNwZWNEYXRhYmFzZSIsIk9iamVjdCIsImtleXMiLCJsZW5ndGgiLCJzcGVjRGJFcnJvciIsInNldFNwZWNEYkVycm9yIiwiYXBwbHlTcGVjRGIiLCJ0cmltIiwicGFyc2VkIiwicGFyc2UiLCJBcnJheSIsImlzQXJyYXkiLCJFcnJvciIsImUiLCJjbGFzc05hbWUiLCJjaGlsZHJlbiIsIm9uQ2xpY2siLCJpZCIsImRlc2MiLCJ0aXAiLCJtYXAiLCJjaGVja2VkIiwib25DaGFuZ2UiLCJuZXdDaGVja3MiLCJ0YXJnZXQiLCJodG1sRm9yIiwidGV4dCIsInBvc2l0aW9uIiwicHRlTW9kZSIsImF1dG9NdWx0aVBhc3NNb2RlIiwicCIsInNlcXVlbnRpYWxNb2RlIiwibGluZUtleU1vZGUiLCJ2YWx1ZSIsImxpbmVLZXlDb2x1bW4iLCJzdGVwIiwiYm9yZVJhdGlvTWluIiwiYm9yZVJhdGlvTWF4Iiwic3dlZXBSYWRpdXNNaW5NdWx0aXBsaWVyIiwic3dlZXBSYWRpdXNNYXgiLCJlbmFibGVCb3JlSW5jaFRvTW0iLCJlbmFibGVQYXNzM0EiLCJtaW5BcHByb3ZhbFNjb3JlIiwidGl0bGUiLCJkeW5hbWljU2NvcmluZyIsIm1pY3JvUGlwZVRocmVzaG9sZCIsIm1pY3JvRml0dGluZ1RocmVzaG9sZCIsImRpYWdvbmFsTWlub3JUaHJlc2hvbGQiLCJyYXlTaG9vdGVyIiwiZW5hYmxlZCIsInR1YmVUb2xlcmFuY2UiLCJwYXNzMVNhbWVCb3JlIiwicGFzczJBbnlCb3JlIiwicGFzczNSZXNvbHZlZCIsInBhc3M0R2xvYmFsQXhpcyIsImVuYWJsZTNEUnVsZXMiLCJtYXhTaW5nbGVQbGFuZVJ1biIsIm1heE92ZXJsYXAiLCJtaW5QaXBlU2l6ZSIsIm1pbkNvbXBvbmVudFNpemUiLCJ0aHJlZVBsYW5lU2tld0xpbWl0IiwidHdvUGxhbmVTa2V3TGltaXQiLCJtYXhEaWFnb25hbEdhcCIsInNpbmdsZUF4aXNTbG9wZVRvbGVyYW5jZSIsIm5lZ2xpZ2libGVHYXAiLCJhdXRvRmlsbE1heEdhcCIsImF1dG9UcmltTWF4T3ZlcmxhcCIsInJldmlld0dhcE1heCIsImNsb3N1cmVXYXJuaW5nVGhyZXNob2xkIiwiY2xvc3VyZUVycm9yVGhyZXNob2xkIiwib2xldE1heFJhdGlvRXJyb3IiLCJjb25uZWN0aW9uVG9sZXJhbmNlIiwiZW5hYmxlRHJhd0NhbnZhcyIsInBhdGhmaW5kaW5nRW5hYmxlZCIsInBhdGhmaW5kaW5nR3JpZFJlc29sdXRpb24iLCJwYXRoZmluZGluZ01heENlbGxzIiwicGF0aGZpbmRpbmdNYXhEaXN0YW5jZSIsInNwZWNWYWxpZGF0aW9uRW5hYmxlZCIsInBsYWNlaG9sZGVyIiwic3BlbGxDaGVjayJdLCJzb3VyY2VzIjpbIkNvbmZpZ1RhYi5qc3giXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFJlYWN0LCB7IHVzZVN0YXRlLCB1c2VDYWxsYmFjayB9IGZyb20gJ3JlYWN0JztcbmltcG9ydCB7IHVzZUFwcENvbnRleHQgfSBmcm9tICcuLi8uLi9zdG9yZS9BcHBDb250ZXh0JztcbmltcG9ydCB7IFRvb2x0aXAgfSBmcm9tICcuLi9jb21wb25lbnRzL1Rvb2x0aXAnO1xuXG5leHBvcnQgZnVuY3Rpb24gQ29uZmlnVGFiKCkge1xuICBjb25zdCB7IHN0YXRlLCBkaXNwYXRjaCB9ID0gdXNlQXBwQ29udGV4dCgpO1xuICBjb25zdCBbbG9jYWxDb25maWcsIHNldExvY2FsQ29uZmlnXSA9IHVzZVN0YXRlKHN0YXRlLmNvbmZpZyk7XG5cbiAgY29uc3QgaGFuZGxlU2F2ZSA9ICgpID0+IHtcbiAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU0VUX0NPTkZJR1wiLCBwYXlsb2FkOiBsb2NhbENvbmZpZyB9KTtcblxuICAgIC8vIEV4cGxpY2l0bHkgcGVyc2lzdCBlbmFibGVkIHZhbGlkYXRpb24gY2hlY2tzXG4gICAgaWYgKGxvY2FsQ29uZmlnLmVuYWJsZWRDaGVja3MpIHtcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2VuYWJsZWRWYWxpZGF0aW9uQ2hlY2tzJywgSlNPTi5zdHJpbmdpZnkobG9jYWxDb25maWcuZW5hYmxlZENoZWNrcykpO1xuICAgIH1cblxuICAgIC8vIFB1c2ggYSBsb2cgZm9yIHRyYW5zcGFyZW5jeVxuICAgIGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IHsgdHlwZTogXCJJbmZvXCIsIG1lc3NhZ2U6IFwiQ29uZmlndXJhdGlvbiB1cGRhdGVkIHN1Y2Nlc3NmdWxseS5cIiB9fSk7XG4gIH07XG5cbiAgY29uc3QgdXBkYXRlU21hcnRGaXhlciA9IChrZXksIHZhbCkgPT4ge1xuICAgIHNldExvY2FsQ29uZmlnKHByZXYgPT4gKHtcbiAgICAgIC4uLnByZXYsXG4gICAgICBzbWFydEZpeGVyOiB7XG4gICAgICAgIC4uLnByZXYuc21hcnRGaXhlcixcbiAgICAgICAgW2tleV06IHBhcnNlRmxvYXQodmFsKSB8fCAwXG4gICAgICB9XG4gICAgfSkpO1xuICB9O1xuXG4gIGNvbnN0IFtzcGVjRGJUZXh0LCBzZXRTcGVjRGJUZXh0XSA9IHVzZVN0YXRlKCgpID0+IHtcbiAgICBjb25zdCBkYiA9IHN0YXRlLmNvbmZpZz8uc3BlY0RhdGFiYXNlO1xuICAgIHJldHVybiBkYiAmJiBPYmplY3Qua2V5cyhkYikubGVuZ3RoID4gMCA/IEpTT04uc3RyaW5naWZ5KGRiLCBudWxsLCAyKSA6ICcnO1xuICB9KTtcbiAgY29uc3QgW3NwZWNEYkVycm9yLCBzZXRTcGVjRGJFcnJvcl0gPSB1c2VTdGF0ZSgnJyk7XG5cbiAgY29uc3QgYXBwbHlTcGVjRGIgPSB1c2VDYWxsYmFjaygoKSA9PiB7XG4gICAgaWYgKCFzcGVjRGJUZXh0LnRyaW0oKSkge1xuICAgICAgc2V0TG9jYWxDb25maWcocHJldiA9PiAoeyAuLi5wcmV2LCBzcGVjRGF0YWJhc2U6IHt9IH0pKTtcbiAgICAgIHNldFNwZWNEYkVycm9yKCcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2Uoc3BlY0RiVGV4dCk7XG4gICAgICBpZiAodHlwZW9mIHBhcnNlZCAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShwYXJzZWQpKSB0aHJvdyBuZXcgRXJyb3IoJ011c3QgYmUgYSBKU09OIG9iamVjdC4nKTtcbiAgICAgIHNldExvY2FsQ29uZmlnKHByZXYgPT4gKHsgLi4ucHJldiwgc3BlY0RhdGFiYXNlOiBwYXJzZWQgfSkpO1xuICAgICAgc2V0U3BlY0RiRXJyb3IoJycpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHNldFNwZWNEYkVycm9yKGUubWVzc2FnZSk7XG4gICAgfVxuICB9LCBbc3BlY0RiVGV4dF0pO1xuXG4gIHJldHVybiAoXG4gICAgPGRpdiBjbGFzc05hbWU9XCJwLTYgaC1bY2FsYygxMDB2aC0xMnJlbSldIG92ZXJmbG93LXktYXV0byBvdmVyZmxvdy14LWhpZGRlbiBiZy13aGl0ZSByb3VuZGVkIHNoYWRvdy1zbSBib3JkZXIgYm9yZGVyLXNsYXRlLTIwMCBjdXN0b20tc2Nyb2xsYmFyIHJlbGF0aXZlXCI+XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgganVzdGlmeS1iZXR3ZWVuIGl0ZW1zLWNlbnRlciBtYi02IGJvcmRlci1iIHBiLTQgc3RpY2t5IHRvcC0wIGJnLXdoaXRlIHotMTAgcHQtMlwiPlxuICAgICAgICA8aDIgY2xhc3NOYW1lPVwidGV4dC14bCBmb250LWJvbGQgdGV4dC1zbGF0ZS04MDBcIj5FbmdpbmUgQ29uZmlndXJhdGlvbjwvaDI+XG4gICAgICAgIDxidXR0b25cbiAgICAgICAgICBvbkNsaWNrPXtoYW5kbGVTYXZlfVxuICAgICAgICAgIGNsYXNzTmFtZT1cImJnLWJsdWUtNjAwIGhvdmVyOmJnLWJsdWUtNzAwIHRleHQtd2hpdGUgcHgtNCBweS0yIHJvdW5kZWQgc2hhZG93LXNtIHRyYW5zaXRpb25cIlxuICAgICAgICA+XG4gICAgICAgICAgU2F2ZSBDb25maWd1cmF0aW9uXG4gICAgICAgIDwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG5cbiAgICAgIHsvKiBWMS1WMjAgQ2hlY2tzIExpc3QgKi99XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImJnLXdoaXRlIHAtNCByb3VuZGVkIGJvcmRlciBib3JkZXItc2xhdGUtMjAwIHNoYWRvdy1zbSBtYi02XCI+XG4gICAgICAgIDxoMyBjbGFzc05hbWU9XCJmb250LXNlbWlib2xkIHRleHQtc2xhdGUtNzAwIG1iLTMgYm9yZGVyLWIgcGItMlwiPlZhbGlkYXRpb24gUnVsZXMgQ2hlY2tsaXN0IChWMS1WMjQpPC9oMz5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJncmlkIGdyaWQtY29scy0xIG1kOmdyaWQtY29scy0yIGxnOmdyaWQtY29scy0zIGdhcC14LTYgZ2FwLXktMlwiPlxuICAgICAgICAgICAge1tcbiAgICAgICAgICAgICAgeyBpZDogJ1YxJywgIGRlc2M6ICdBdHRlbXB0IHRvIGNhbGN1bGF0ZSAoMCwwLDApIGNvb3JkaW5hdGVzJywgdGlwOiAnRGV0ZWN0cyBjb21wb25lbnRzIHdoZXJlIGFsbCB0aHJlZSBjb29yZGluYXRlIGZpZWxkcyBhcmUgZXhhY3RseSB6ZXJvLCB3aGljaCB1c3VhbGx5IGluZGljYXRlcyBhIHBhcnNpbmcgZmFpbHVyZSBvciBwbGFjZWhvbGRlciB2YWx1ZS4gVGhlIGVuZ2luZSBhdHRlbXB0cyB0byBiYWNrLWNhbGN1bGF0ZSB0aGUgY29ycmVjdCBjb29yZGluYXRlcyBmcm9tIG5laWdoYm9yaW5nIGNvbXBvbmVudHMuJyB9LFxuICAgICAgICAgICAgICB7IGlkOiAnVjInLCAgZGVzYzogJ0RlY2ltYWwgY29uc2lzdGVuY3knLCB0aXA6ICdDaGVja3MgdGhhdCB0aGUgbnVtYmVyIG9mIGRlY2ltYWwgcGxhY2VzIHVzZWQgYWNyb3NzIEVQMS9FUDIvQ1AgY29vcmRpbmF0ZXMgaXMgY29uc2lzdGVudCB3aXRoIHRoZSBjb25maWd1cmVkIHByZWNpc2lvbiAoMSBvciA0IGRlY2ltYWwgcGxhY2VzKS4gTWl4ZWQgcHJlY2lzaW9uIG9mdGVuIGNhdXNlcyB0b2xlcmFuY2UgbWlzbWF0Y2hlcyBkb3duc3RyZWFtLicgfSxcbiAgICAgICAgICAgICAgeyBpZDogJ1YzJywgIGRlc2M6ICdCb3JlIGNvbnNpc3RlbmN5JywgdGlwOiAnRmxhZ3MgY29tcG9uZW50cyB3aG9zZSBub21pbmFsIGJvcmUgZGlmZmVycyBmcm9tIHRoZSBhZGphY2VudCBwaXBpbmcgcnVuIGJvcmUgYnkgbW9yZSB0aGFuIHRoZSBjb25maWd1cmVkIGJvcmUgcmF0aW8gcmFuZ2UuIFByZXZlbnRzIHJlZHVjZXJzIGJlaW5nIHNpbGVudGx5IHNraXBwZWQuJyB9LFxuICAgICAgICAgICAgICB7IGlkOiAnVjQnLCAgZGVzYzogJ0JFTkQgQ1AgIT0gRVAxJywgdGlwOiAnVGhlIENlbnRyZSBQb2ludCBvZiBhIEJFTkQgbXVzdCBub3QgY29pbmNpZGUgd2l0aCBFbmQgUG9pbnQgMS4gSWYgdGhleSBhcmUgZXF1YWwsIHRoZSBiZW5kIGhhcyB6ZXJvIHRhbmdlbnQgbGVuZ3RoIG9uIG9uZSBzaWRlIGFuZCB3aWxsIHByb2R1Y2UgYSBkZWdlbmVyYXRlIGdlb21ldHJ5IGluIHN0cmVzcyBhbmFseXNpcyB0b29scy4nIH0sXG4gICAgICAgICAgICAgIHsgaWQ6ICdWNScsICBkZXNjOiAnQkVORCBDUCAhPSBFUDInLCB0aXA6ICdTeW1tZXRyaWMgY2hlY2sgdG8gVjQgZm9yIEVuZCBQb2ludCAyLiBBIHplcm8tbGVuZ3RoIHRhbmdlbnQgb24gZWl0aGVyIGxlZyBvZiBhIGJlbmQgaXMgcGh5c2ljYWxseSBpbXBvc3NpYmxlLicgfSxcbiAgICAgICAgICAgICAgeyBpZDogJ1Y2JywgIGRlc2M6ICdCRU5EIENQIG5vdCBjb2xsaW5lYXInLCB0aXA6ICdWZXJpZmllcyB0aGF0IHRoZSBDUCBvZiBhIEJFTkQgaXMgTk9UIG9uIHRoZSBzdHJhaWdodCBsaW5lIGpvaW5pbmcgRVAxIGFuZCBFUDIuIElmIHRoZSBDUCBpcyBjb2xsaW5lYXIsIHRoZSBiZW5kIGFuZ2xlIGlzIGVmZmVjdGl2ZWx5IDE4MMKwIG9yIHVuZGVmaW5lZC4nIH0sXG4gICAgICAgICAgICAgIHsgaWQ6ICdWNycsICBkZXNjOiAnQkVORCBlcXVpZGlzdGFudCBsZWdzJywgdGlwOiAnQ2hlY2tzIHRoYXQgZGlzdChDUOKGkkVQMSkg4omIIGRpc3QoQ1DihpJFUDIpIHdpdGhpbiB0b2xlcmFuY2UuIEJvdGggdGFuZ2VudCBsZWdzIG9mIGEgc3RhbmRhcmQgbG9uZy1yYWRpdXMgYmVuZCBzaG91bGQgYmUgZXF1YWwuJyB9LFxuICAgICAgICAgICAgICB7IGlkOiAnVjgnLCAgZGVzYzogJ1RFRSBDUCBhdCBtaWRwb2ludCcsIHRpcDogJ1RoZSBDZW50cmUgUG9pbnQgb2YgYSBURUUgc2hvdWxkIGxpZSBhdCB0aGUgbWlkcG9pbnQgb2YgRVAxLUVQMiAoaS5lLiBvbiB0aGUgaGVhZGVyIGNlbnRyZWxpbmUpLiBBbiBvZmZzZXQgQ1AgaW5kaWNhdGVzIGFuIGluY29ycmVjdGx5IHBsYWNlZCBzcGxpdCBwb2ludC4nIH0sXG4gICAgICAgICAgICAgIHsgaWQ6ICdWOScsICBkZXNjOiAnVEVFIENQIGJvcmUgbWF0Y2hlcycsIHRpcDogJ0Vuc3VyZXMgdGhlIGhlYWRlciBib3JlIGF0IHRoZSBURUUgQ1AgbWF0Y2hlcyB0aGUgYm9yZSBmaWVsZC4gQSBtaXNtYXRjaCB1c3VhbGx5IG1lYW5zIHRoZSB3cm9uZyBjb21wb25lbnQgU0tFWXMgYXJlIHJlZmVyZW5jZWQsIHByb2R1Y2luZyBhIHNwdXJpb3VzIHJlZHVjZXIgaW5zZXJ0aW9uLicgfSxcbiAgICAgICAgICAgICAgeyBpZDogJ1YxMCcsIGRlc2M6ICdURUUgQnJhbmNoIHBlcnBlbmRpY3VsYXInLCB0aXA6ICdWZXJpZmllcyB0aGF0IHRoZSBCcmFuY2ggUG9pbnQgdmVjdG9yIChDUOKGkkJQKSBpcyBwZXJwZW5kaWN1bGFyIHRvIHRoZSBoZWFkZXIgYXhpcyAoRVAx4oaSRVAyKSB3aXRoaW4gdGhlIGNvbmZpZ3VyZWQgYW5ndWxhcml0eSB0aHJlc2hvbGQuIE5vbi1wZXJwZW5kaWN1bGFyIGJyYW5jaGVzIGNhdXNlIHN0cmVzcyBhbmFseXNpcyBmYWlsdXJlcy4nIH0sXG4gICAgICAgICAgICAgIHsgaWQ6ICdWMTEnLCBkZXNjOiAnT0xFVCBoYXMgbm8gZW5kLXBvaW50cycsIHRpcDogJ09MRVRzIGluIElTT0dFTiBQQ0YgZm9ybWF0IGRlZmluZSB0aGVpciBwb3NpdGlvbiB1c2luZyBDUCBhbmQgQlAgb25seSDigJQgRVAxL0VQMiBhcmUgbm90IHVzZWQuIFRoaXMgcnVsZSBmbGFncyBhbnkgT0xFVCB0aGF0IGluY29ycmVjdGx5IGNhcnJpZXMgZW5kLXBvaW50IGRhdGEuJyB9LFxuICAgICAgICAgICAgICB7IGlkOiAnVjEyJywgZGVzYzogJ1NVUFBPUlQgaGFzIG5vIENBcycsIHRpcDogJ1NVUFBPUlQgY29tcG9uZW50IGF0dHJpYnV0ZXMgKENBIGZpZWxkcykgc2hvdWxkIG9ubHkgYmUgcG9wdWxhdGVkIHdpdGggc3BlY2lmaWMgZGF0YSAocG9zaXRpb24sIEdVSUQpLiBHZW5lcmljIENBcyBpbmhlcml0ZWQgZnJvbSBwaXBpbmcgcnVucyBvZnRlbiBpbmRpY2F0ZSBhIG1pcy1wYXJzZS4nIH0sXG4gICAgICAgICAgICAgIHsgaWQ6ICdWMTMnLCBkZXNjOiAnU1VQUE9SVCBib3JlIGlzIDAnLCB0aXA6ICdQaXBlIHN1cHBvcnRzIGRvIG5vdCBjYXJyeSBhIG5vbWluYWwgYm9yZSDigJQgdGhleSBhcmUgYXR0YWNoZWQgdG8gdGhlIHBpcGUsIG5vdCBpbi1saW5lLiBBIG5vbi16ZXJvIGJvcmUgb24gYSBTVVBQT1JUIHJvdyBpcyBhIGRhdGEgZW50cnkgZXJyb3IuJyB9LFxuICAgICAgICAgICAgICB7IGlkOiAnVjE0JywgZGVzYzogJ01pc3NpbmcgPFNLRVk+JywgdGlwOiAnRXZlcnkgcGh5c2ljYWwgY29tcG9uZW50IG11c3QgaGF2ZSBhbiBJU09HRU4gU0tFWSAoU2hhcGUgS0VZKSB0aGF0IG1hcHMgdG8gYSB2YWxpZCBzeW1ib2wgc2hhcGUgaW4gdGhlIHBpcGluZyBzcGVjLiBBIG1pc3NpbmcgU0tFWSB3aWxsIGNhdXNlIElTT0dFTiB0byBza2lwIHRoZSBjb21wb25lbnQgc2lsZW50bHkuJyB9LFxuICAgICAgICAgICAgICB7IGlkOiAnVjE1JywgZGVzYzogJ0Nvb3JkaW5hdGUgY29udGludWl0eScsIHRpcDogJ0NoZWNrcyB0aGF0IHRoZSBlbmQgcG9pbnQgb2YgZWFjaCBjb21wb25lbnQgY29ubmVjdHMgdG8gdGhlIHN0YXJ0IHBvaW50IG9mIHRoZSBuZXh0IGNvbXBvbmVudCB3aXRoaW4gdGhlIGNvbm5lY3Rpb24gdG9sZXJhbmNlLiBHYXBzL292ZXJsYXBzIGxhcmdlciB0aGFuIHRoZSB0b2xlcmFuY2UgdHJpZ2dlciBhIHNtYXJ0LWZpeCBwcm9wb3NhbC4nIH0sXG4gICAgICAgICAgICAgIHsgaWQ6ICdWMTYnLCBkZXNjOiAnQ0E4IHVzYWdlIHNjb3BlJywgdGlwOiAnQ0E4IGlzIGEgc3BlY2lhbCBJU09HRU4gYXR0cmlidXRlIHRoYXQgbXVzdCBvbmx5IGFwcGVhciBvbiBzcGVjaWZpYyBjb21wb25lbnQgdHlwZXMgKFZBTFZFLCBGTEFOR0UpLiBUaGlzIHJ1bGUgZmxhZ3MgQ0E4IHVzYWdlIG9uIGNvbXBvbmVudHMgd2hlcmUgaXQgaXMgbm90IHZhbGlkIHBlciB0aGUgSVNPR0VOIHNwZWMuJyB9LFxuICAgICAgICAgICAgICB7IGlkOiAnVjE3JywgZGVzYzogJ05vIEVQIHNob3VsZCBiZSBibGFuayBvciAtJywgdGlwOiAnQSBjb29yZGluYXRlIGZpZWxkIGNvbnRhaW5pbmcgYW4gZW1wdHkgc3RyaW5nIG9yIGxpdGVyYWwgaHlwaGVuIFwiLVwiIGluZGljYXRlcyB0aGUgUENGIHdhcyBleHBvcnRlZCB3aXRoIHVucG9wdWxhdGVkIGZpZWxkcy4gVGhlc2Ugd2lsbCBjYXVzZSBudWxsLXJlZmVyZW5jZSBlcnJvcnMgaW4gdGhlIHRvcG9sb2d5IGVuZ2luZS4nIH0sXG4gICAgICAgICAgICAgIHsgaWQ6ICdWMTgnLCBkZXNjOiAnQm9yZSB1bml0IChNTS9JbmNoIGNoZWNrKScsIHRpcDogJ0RldGVjdHMgYm9yZXMgdGhhdCBhcHBlYXIgdG8gYmUgaW4gaW1wZXJpYWwgaW5jaGVzIHJhdGhlciB0aGFuIG1pbGxpbWV0cmVzICh2YWx1ZXMgPD0gdGhlIG1heEJvcmVGb3JJbmNoRGV0ZWN0aW9uIHRocmVzaG9sZCkuIENyb3NzLXVuaXQgbWl4aW5nIGluIGEgc2luZ2xlIGZpbGUgY2F1c2VzIGFsbCBib3JlLXJhdGlvIGNhbGN1bGF0aW9ucyB0byBiZSB3cm9uZy4nIH0sXG4gICAgICAgICAgICAgIHsgaWQ6ICdWMTknLCBkZXNjOiAnU1VQUE9SVCBNU0ctU1EgdG9rZW5zJywgdGlwOiAnVmFsaWRhdGVzIHRoYXQgdGhlIE1FU1NBR0UtU1FVQVJFIHRleHQgb24gU1VQUE9SVCByb3dzIHVzZXMgdGhlIHByZXNjcmliZWQgdG9rZW4gZm9ybWF0LiBOb24tc3RhbmRhcmQgdG9rZW5zIGFyZSBub3QgcGFyc2VkIGJ5IGRvd25zdHJlYW0gQVZFVkEgdG9vbHMuJyB9LFxuICAgICAgICAgICAgICB7IGlkOiAnVjIwJywgZGVzYzogJ1NVUFBPUlQgR1VJRCBQcmVmaXggKFVDSTopJywgdGlwOiAnU3VwcG9ydCBjb21wb25lbnQgR1VJRHMgbXVzdCBjYXJyeSB0aGUgXCJVQ0k6XCIgcHJlZml4IHRvIGJlIHJlY29nbml6ZWQgYnkgdGhlIEFWRVZBIHN1cHBvcnQgcGxhY2VtZW50IHBpcGVsaW5lLiBNaXNzaW5nIHByZWZpeCBtZWFucyB0aGUgc3VwcG9ydCB3aWxsIG5vdCBiZSBsaW5rZWQgdG8gaXRzIHN0cnVjdHVyYWwgYXR0YWNobWVudC4nIH0sXG4gICAgICAgICAgICAgIHsgaWQ6ICdWMjEnLCBkZXNjOiAnVEVFIEJQIERlZmluaXRpb24vRGlzdGFuY2UnLCB0aXA6ICdDaGVja3MgdGhhdCB0aGUgQnJhbmNoIFBvaW50IChCUCkgaXMgZGVmaW5lZCBhbmQgdGhhdCBpdHMgZGlzdGFuY2UgZnJvbSB0aGUgQ2VudHJlIFBvaW50IChDUCkgaXMgd2l0aGluIGEgcGh5c2ljYWxseSBwbGF1c2libGUgcmFuZ2UgYmFzZWQgb24gdGhlIG5vbWluYWwgYm9yZS4gQW4gZXh0cmVtZSBCUCBkaXN0YW5jZSB1c3VhbGx5IHBvaW50cyB0byBhIHdyb25nIGNvb3JkaW5hdGUgZnJhbWUuJyB9LFxuICAgICAgICAgICAgICB7IGlkOiAnVjIyJywgZGVzYzogJ0JFTkQgbWluaW11bSByYWRpdXMnLCB0aXA6ICdWZXJpZmllcyB0aGF0IHRoZSBjYWxjdWxhdGVkIGJlbmQgcmFkaXVzIGlzIGF0IGxlYXN0IDHDl0QgKG5vbWluYWxseSAxLjXDl0QgZm9yIGxvbmctcmFkaXVzIGJlbmRzKSBiYXNlZCBvbiB0aGUgbm9taW5hbCBib3JlLiBSYWRpaSBiZWxvdyB0aGlzIHRocmVzaG9sZCBjYW5ub3QgYmUgbWFudWZhY3R1cmVkIGFuZCB3aWxsIGJlIHJlamVjdGVkIGJ5IHRoZSBzdHJlc3Mgc3lzdGVtLicgfSxcbiAgICAgICAgICAgICAgeyBpZDogJ1YyMycsIGRlc2M6ICdPTEVUIENQL0JQIGRlZmluaXRpb24nLCB0aXA6ICdBbiBPTEVUIG11c3QgaGF2ZSBib3RoIGEgQ2VudHJlIFBvaW50ICh0aGUgd2VsZCBwb2ludCBvbiB0aGUgaGVhZGVyKSBhbmQgYSBCcmFuY2ggUG9pbnQgKHRoZSBzdHViIG91dGxldCkuIE1pc3NpbmcgZWl0aGVyIGNhdXNlcyB0aGUgSVNPR0VOIHN5bWJvbCB0byByZW5kZXIgaW5jb3JyZWN0bHkuJyB9LFxuICAgICAgICAgICAgICB7IGlkOiAnVjI0JywgZGVzYzogJ0JFTkQgdmFsaWQgYW5nbGUgY2FsY3VsYXRpb24nLCB0aXA6ICdCYWNrLWNhbGN1bGF0ZXMgdGhlIGJlbmQgYW5nbGUgZnJvbSB0aGUgdGhyZWUgcG9pbnRzIChFUDEsIENQLCBFUDIpIGFuZCBjaGVja3MgaXQgaXMgYSB2YWxpZCBJU09HRU4gYmVuZCBhbmdsZSAoZS5nLiAyMi41wrAsIDQ1wrAsIDkwwrApLiBOb24tc3RhbmRhcmQgYW5nbGVzIGluZGljYXRlIGNvb3JkaW5hdGUgb3IgbW9kZWwgZXJyb3JzLicgfSxcbiAgICAgICAgICAgIF0ubWFwKCh7IGlkLCBkZXNjLCB0aXAgfSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNoZWNrZWQgPSBsb2NhbENvbmZpZy5lbmFibGVkQ2hlY2tzID8gbG9jYWxDb25maWcuZW5hYmxlZENoZWNrc1tpZF0gIT09IGZhbHNlIDogdHJ1ZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGtleT17aWR9IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtc3RhcnQgc3BhY2UteC0yIHB5LTFcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU9XCJjaGVja2JveFwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ9e2BjaGstJHtpZH1gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cInctNCBoLTQgbXQtMC41IHRleHQtYmx1ZS02MDAgcm91bmRlZCBib3JkZXItZ3JheS0zMDBcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrZWQ9e2NoZWNrZWR9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld0NoZWNrcyA9IHsgLi4uKGxvY2FsQ29uZmlnLmVuYWJsZWRDaGVja3MgfHwge30pIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ld0NoZWNrc1tpZF0gPSBlLnRhcmdldC5jaGVja2VkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXRMb2NhbENvbmZpZyhwcmV2ID0+ICh7IC4uLnByZXYsIGVuYWJsZWRDaGVja3M6IG5ld0NoZWNrcyB9KSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgaHRtbEZvcj17YGNoay0ke2lkfWB9IGNsYXNzTmFtZT1cInRleHQtc20gdGV4dC1zbGF0ZS03MDAgY3Vyc29yLXBvaW50ZXIgbGVhZGluZy10aWdodFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxUb29sdGlwIHRleHQ9e3RpcH0gcG9zaXRpb249XCJyaWdodFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZm9udC1zZW1pYm9sZCB3LTggaW5saW5lLWJsb2NrXCI+e2lkfTo8L3NwYW4+IHtkZXNjfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbHRpcD5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9KX1cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgey8qIFItUnVsZSBEb2N1bWVudGF0aW9uICovfVxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIm10LTQgcHQtNCBib3JkZXItdCBib3JkZXItc2xhdGUtMjAwXCI+XG4gICAgICAgICAgICAgPGgzIGNsYXNzTmFtZT1cImZvbnQtc2VtaWJvbGQgdGV4dC1zbGF0ZS03MDAgbWItM1wiPlRvcG9sb2dpY2FsIFJ1bGVzIChSLVhYKSBFeGVjdXRpb24gUGlwZWxpbmU8L2gzPlxuICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZ3JpZCBncmlkLWNvbHMtMSBtZDpncmlkLWNvbHMtMiBnYXAtNiB0ZXh0LXNtXCI+XG4gICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYmctYmx1ZS01MCBwLTMgcm91bmRlZCBib3JkZXIgYm9yZGVyLWJsdWUtMjAwXCI+XG4gICAgICAgICAgICAgICAgICAgICA8aDQgY2xhc3NOYW1lPVwiZm9udC1ib2xkIHRleHQtYmx1ZS04MDAgbWItMiBib3JkZXItYiBib3JkZXItYmx1ZS0yMDAgcGItMVwiPlBoYXNlIDEgKFBpcGUgVHJpbW1pbmcgJiBGaWxsaW5nKTwvaDQ+XG4gICAgICAgICAgICAgICAgICAgICA8dWwgY2xhc3NOYW1lPVwibGlzdC1kaXNjIHBsLTUgdGV4dC1ibHVlLTkwMCBzcGFjZS15LTFcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICA8bGk+PHNwYW4gY2xhc3NOYW1lPVwiZm9udC1zZW1pYm9sZFwiPlIxOjwvc3Bhbj4gUGlwZSBTZWdtZW50IE1pY3JvLUdhcCBEZWxldGlvbjwvbGk+XG4gICAgICAgICAgICAgICAgICAgICAgICAgPGxpPjxzcGFuIGNsYXNzTmFtZT1cImZvbnQtc2VtaWJvbGRcIj5SMjo8L3NwYW4+IFBpcGUgU2VnbWVudCBNaWNyby1PdmVybGFwIFRyaW1taW5nPC9saT5cbiAgICAgICAgICAgICAgICAgICAgICAgICA8bGk+PHNwYW4gY2xhc3NOYW1lPVwiZm9udC1zZW1pYm9sZFwiPlYxNTo8L3NwYW4+IENvb3JkaW5hdGUgQ29udGludWl0eSBFbmZvcmNlbWVudDwvbGk+XG4gICAgICAgICAgICAgICAgICAgICA8L3VsPlxuICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJiZy1wdXJwbGUtNTAgcC0zIHJvdW5kZWQgYm9yZGVyIGJvcmRlci1wdXJwbGUtMjAwXCI+XG4gICAgICAgICAgICAgICAgICAgICA8aDQgY2xhc3NOYW1lPVwiZm9udC1ib2xkIHRleHQtcHVycGxlLTgwMCBtYi0yIGJvcmRlci1iIGJvcmRlci1wdXJwbGUtMjAwIHBiLTFcIj5QaGFzZSAyIChUb3BvbG9neSAmIEZpeGVzKTwvaDQ+XG4gICAgICAgICAgICAgICAgICAgICA8dWwgY2xhc3NOYW1lPVwibGlzdC1kaXNjIHBsLTUgdGV4dC1wdXJwbGUtOTAwIHNwYWNlLXktMVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgIDxsaT48c3BhbiBjbGFzc05hbWU9XCJmb250LXNlbWlib2xkXCI+UjM6PC9zcGFuPiBGaXR0aW5nIE9mZi1BeGlzIFNuYXBwaW5nPC9saT5cbiAgICAgICAgICAgICAgICAgICAgICAgICA8bGk+PHNwYW4gY2xhc3NOYW1lPVwiZm9udC1zZW1pYm9sZFwiPlI0Ojwvc3Bhbj4gT3JwaGFuZWQgQ29tcG9uZW50IFRyYW5zbGF0aW9uPC9saT5cbiAgICAgICAgICAgICAgICAgICAgICAgICA8bGk+PHNwYW4gY2xhc3NOYW1lPVwiZm9udC1zZW1pYm9sZFwiPlI1Ojwvc3Bhbj4gRmxvdyBEaXJlY3Rpb24gUmV2ZXJzYWwgKEJFTkQvRkxBTkdFKTwvbGk+XG4gICAgICAgICAgICAgICAgICAgICAgICAgPGxpPjxzcGFuIGNsYXNzTmFtZT1cImZvbnQtc2VtaWJvbGRcIj5SNjo8L3NwYW4+IEdsb2JhbCBBeGlzIFRvcG9sb2d5IFNlYXJjaDwvbGk+XG4gICAgICAgICAgICAgICAgICAgICA8L3VsPlxuICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cblxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJiZy1ibHVlLTUwIHAtNCByb3VuZGVkIGJvcmRlciBib3JkZXItYmx1ZS0yMDAgc2hhZG93LXNtIG1iLTZcIj5cbiAgICAgICAgPGgzIGNsYXNzTmFtZT1cImZvbnQtYm9sZCB0ZXh0LWJsdWUtODAwIG1iLTNcIj5NdWx0aS1QYXNzIFBURSBNb2RlICYgTGluZSBLZXkgUm91dGluZzwvaDM+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZ3JpZCBncmlkLWNvbHMtMSBtZDpncmlkLWNvbHMtMyBnYXAtNFwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBzcGFjZS14LTNcIj5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGNoZWNrZWQ9e2xvY2FsQ29uZmlnLnB0ZU1vZGU/LmF1dG9NdWx0aVBhc3NNb2RlID8/IHRydWV9IG9uQ2hhbmdlPXsoZSkgPT4gc2V0TG9jYWxDb25maWcocCA9PiAoey4uLnAsIHB0ZU1vZGU6IHsuLi5wLnB0ZU1vZGUsIGF1dG9NdWx0aVBhc3NNb2RlOiBlLnRhcmdldC5jaGVja2VkfX0pKX0gY2xhc3NOYW1lPVwidy00IGgtNCB0ZXh0LWJsdWUtNjAwIHJvdW5kZWQgYm9yZGVyLWdyYXktMzAwXCIgLz5cbiAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cInRleHQtc20gZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS03MDBcIj5BdXRvIE11bHRpLVBhc3MgTW9kZTwvbGFiZWw+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgc3BhY2UteC0zXCI+XG4gICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBjaGVja2VkPXtsb2NhbENvbmZpZy5wdGVNb2RlPy5zZXF1ZW50aWFsTW9kZSA/PyB0cnVlfSBvbkNoYW5nZT17KGUpID0+IHNldExvY2FsQ29uZmlnKHAgPT4gKHsuLi5wLCBwdGVNb2RlOiB7Li4ucC5wdGVNb2RlLCBzZXF1ZW50aWFsTW9kZTogZS50YXJnZXQuY2hlY2tlZH19KSl9IGNsYXNzTmFtZT1cInctNCBoLTQgdGV4dC1ibHVlLTYwMCByb3VuZGVkIGJvcmRlci1ncmF5LTMwMFwiIC8+XG4gICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtNzAwXCI+U2VxdWVudGlhbCBXYWxrIE9OPC9sYWJlbD5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBzcGFjZS14LTNcIj5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGNoZWNrZWQ9e2xvY2FsQ29uZmlnLnB0ZU1vZGU/LmxpbmVLZXlNb2RlID8/IHRydWV9IG9uQ2hhbmdlPXsoZSkgPT4gc2V0TG9jYWxDb25maWcocCA9PiAoey4uLnAsIHB0ZU1vZGU6IHsuLi5wLnB0ZU1vZGUsIGxpbmVLZXlNb2RlOiBlLnRhcmdldC5jaGVja2VkfX0pKX0gY2xhc3NOYW1lPVwidy00IGgtNCB0ZXh0LWJsdWUtNjAwIHJvdW5kZWQgYm9yZGVyLWdyYXktMzAwXCIgLz5cbiAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cInRleHQtc20gZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS03MDBcIj5MaW5lX0tleSBDb25zdHJhaW50cyAoaWYgYXZpYWxhYmxlKSBPTjwvbGFiZWw+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibXQtNCBwdC00IGJvcmRlci10IGJvcmRlci1ibHVlLTEwMCBmbGV4IGl0ZW1zLWNlbnRlciBzcGFjZS14LTRcIj5cbiAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXNtIGZvbnQtc2VtaWJvbGQgdGV4dC1zbGF0ZS03MDBcIj5MaW5lX0tleSBUYXJnZXQgQ29sdW1uOjwvbGFiZWw+XG4gICAgICAgICAgICA8c2VsZWN0XG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwicC0xLjUgYm9yZGVyIGJvcmRlci1zbGF0ZS0zMDAgcm91bmRlZCB0ZXh0LXNtIHctNDhcIlxuICAgICAgICAgICAgICAgIHZhbHVlPXtsb2NhbENvbmZpZy5wdGVNb2RlPy5saW5lS2V5Q29sdW1uID8/IFwicGlwZWxpbmVSZWZcIn1cbiAgICAgICAgICAgICAgICBvbkNoYW5nZT17KGUpID0+IHNldExvY2FsQ29uZmlnKHAgPT4gKHsuLi5wLCBwdGVNb2RlOiB7Li4ucC5wdGVNb2RlLCBsaW5lS2V5Q29sdW1uOiBlLnRhcmdldC52YWx1ZX19KSl9XG4gICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInBpcGVsaW5lUmVmXCI+UElQRUxJTkUtUkVGRVJFTkNFPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInRleHRcIj5NRVNTQUdFLVNRVUFSRSBUZXh0PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNhOTdcIj5DQTk3IChSZWZObyk8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY2E5OFwiPkNBOTggKFNlcU5vKTwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtc2xhdGUtNTAwIGl0YWxpY1wiPkRldGVybWluZXMgdGhlIGJvdW5kYXJ5IGZvciBtdWx0aS1wYXNzIHNlZ21lbnQgbG9naWMuPC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJtdC00IHB0LTQgYm9yZGVyLXQgYm9yZGVyLWJsdWUtMTAwIGdyaWQgZ3JpZC1jb2xzLTEgbWQ6Z3JpZC1jb2xzLTQgZ2FwLTRcIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBmbGV4LWNvbFwiPlxuICAgICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwidGV4dC14cyB0ZXh0LXNsYXRlLTYwMCBtYi0xXCI+Qm9yZSBSYXRpbyBNaW48L2xhYmVsPlxuICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIwLjFcIiB2YWx1ZT17bG9jYWxDb25maWcucHRlTW9kZT8uYm9yZVJhdGlvTWluID8/IDAuN30gb25DaGFuZ2U9eyhlKSA9PiBzZXRMb2NhbENvbmZpZyhwID0+ICh7Li4ucCwgcHRlTW9kZTogey4uLnAucHRlTW9kZSwgYm9yZVJhdGlvTWluOiBwYXJzZUZsb2F0KGUudGFyZ2V0LnZhbHVlKX19KSl9IGNsYXNzTmFtZT1cInAtMSBib3JkZXIgcm91bmRlZCB0ZXh0LXNtIGZvbnQtbW9ubyB3LWZ1bGxcIiAvPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC1jb2xcIj5cbiAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS02MDAgbWItMVwiPkJvcmUgUmF0aW8gTWF4PC9sYWJlbD5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMC4xXCIgdmFsdWU9e2xvY2FsQ29uZmlnLnB0ZU1vZGU/LmJvcmVSYXRpb01heCA/PyAxLjV9IG9uQ2hhbmdlPXsoZSkgPT4gc2V0TG9jYWxDb25maWcocCA9PiAoey4uLnAsIHB0ZU1vZGU6IHsuLi5wLnB0ZU1vZGUsIGJvcmVSYXRpb01heDogcGFyc2VGbG9hdChlLnRhcmdldC52YWx1ZSl9fSkpfSBjbGFzc05hbWU9XCJwLTEgYm9yZGVyIHJvdW5kZWQgdGV4dC1zbSBmb250LW1vbm8gdy1mdWxsXCIgLz5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGZsZXgtY29sXCI+XG4gICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtc2xhdGUtNjAwIG1iLTFcIj5Td2VlcCBSYWRpaSBNaW4gKHhOQik8L2xhYmVsPlxuICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIwLjFcIiB2YWx1ZT17bG9jYWxDb25maWcucHRlTW9kZT8uc3dlZXBSYWRpdXNNaW5NdWx0aXBsaWVyID8/IDAuMn0gb25DaGFuZ2U9eyhlKSA9PiBzZXRMb2NhbENvbmZpZyhwID0+ICh7Li4ucCwgcHRlTW9kZTogey4uLnAucHRlTW9kZSwgc3dlZXBSYWRpdXNNaW5NdWx0aXBsaWVyOiBwYXJzZUZsb2F0KGUudGFyZ2V0LnZhbHVlKX19KSl9IGNsYXNzTmFtZT1cInAtMSBib3JkZXIgcm91bmRlZCB0ZXh0LXNtIGZvbnQtbW9ubyB3LWZ1bGxcIiAvPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC1jb2xcIj5cbiAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS02MDAgbWItMVwiPlN3ZWVwIFJhZGlpIE1heCAobW0pPC9sYWJlbD5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMTBcIiB2YWx1ZT17bG9jYWxDb25maWcucHRlTW9kZT8uc3dlZXBSYWRpdXNNYXggPz8gMTMwMDB9IG9uQ2hhbmdlPXsoZSkgPT4gc2V0TG9jYWxDb25maWcocCA9PiAoey4uLnAsIHB0ZU1vZGU6IHsuLi5wLnB0ZU1vZGUsIHN3ZWVwUmFkaXVzTWF4OiBwYXJzZUZsb2F0KGUudGFyZ2V0LnZhbHVlKX19KSl9IGNsYXNzTmFtZT1cInAtMSBib3JkZXIgcm91bmRlZCB0ZXh0LXNtIGZvbnQtbW9ubyB3LWZ1bGxcIiAvPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG5cblxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJiZy1hbWJlci01MCBwLTQgcm91bmRlZCBib3JkZXIgYm9yZGVyLWFtYmVyLTIwMCBzaGFkb3ctc20gbWItNlwiPlxuICAgICAgICA8aDMgY2xhc3NOYW1lPVwiZm9udC1zZW1pYm9sZCB0ZXh0LWFtYmVyLTgwMCBtYi0zXCI+Qm9yZSBDb252ZXJzaW9uIEhhcm1vbml6YXRpb248L2gzPlxuICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgc3BhY2UteC0zXCI+XG4gICAgICAgICAgPGlucHV0XG4gICAgICAgICAgICB0eXBlPVwiY2hlY2tib3hcIlxuICAgICAgICAgICAgY2hlY2tlZD17bG9jYWxDb25maWcuZW5hYmxlQm9yZUluY2hUb01tID09PSB0cnVlfVxuICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiBzZXRMb2NhbENvbmZpZyhwcmV2ID0+ICh7IC4uLnByZXYsIGVuYWJsZUJvcmVJbmNoVG9NbTogZS50YXJnZXQuY2hlY2tlZCB9KSl9XG4gICAgICAgICAgICBjbGFzc05hbWU9XCJ3LTQgaC00IHRleHQtYmx1ZS02MDAgcm91bmRlZCBib3JkZXItZ3JheS0zMDBcIlxuICAgICAgICAgIC8+XG4gICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1zbSB0ZXh0LXNsYXRlLTcwMFwiPkVuYWJsZSBCb3JlIEluY2gg4oaSIE1NIGNvbnZlcnNpb248L3NwYW4+XG4gICAgICAgIDwvbGFiZWw+XG4gICAgICA8L2Rpdj5cblxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJncmlkIGdyaWQtY29scy0xIG1kOmdyaWQtY29scy0yIGxnOmdyaWQtY29scy0zIGdhcC02XCI+XG5cbiAgICAgICAgey8qIENvcmUgR2VvbWV0cnkgVGhyZXNob2xkcyAqL31cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJiZy1zbGF0ZS01MCBwLTQgcm91bmRlZCBib3JkZXIgYm9yZGVyLXNsYXRlLTIwMCBzaGFkb3ctc21cIj5cbiAgICAgICAgICA8aDMgY2xhc3NOYW1lPVwiZm9udC1zZW1pYm9sZCB0ZXh0LXNsYXRlLTcwMCBtYi0zXCI+R2VvbWV0cnkgJiBIZXVyaXN0aWNzIFRocmVzaG9sZHM8L2gzPlxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic3BhY2UteS0zXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC1jb2wgYmctYmx1ZS01MC81MCBwLTIgcm91bmRlZCBnYXAtMVwiPlxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgganVzdGlmeS1iZXR3ZWVuIGl0ZW1zLWNlbnRlclwiPlxuICAgICAgICAgICAgICAgICAgPFRvb2x0aXAgdGV4dD1cIlBhc3MgM0EgcnVucyBhIGdsb2JhbCBmdXp6eSBzcGF0aWFsIHNlYXJjaCBhZnRlciB0aGUgc2VxdWVudGlhbCBwYXNzLiBJdCBhdHRlbXB0cyB0byByZXNvbHZlIG9ycGhhbmVkIGNvbXBvbmVudHMgdGhhdCBjb3VsZCBub3QgYmUgY29ubmVjdGVkIGR1cmluZyB0aGUgZGlyZWN0aW9uYWwgd2FsayBieSBzZWFyY2hpbmcgdGhlIGVudGlyZSBtb2RlbCBzcGFjZS4gVGhpcyBpcyB0aGUgbW9zdCBjb21wdXRhdGlvbmFsbHkgZXhwZW5zaXZlIHBhc3Mg4oCUIGRpc2FibGUgb24gdmVyeSBsYXJnZSBmaWxlcyBpZiBwZXJmb3JtYW5jZSBpcyBhbiBpc3N1ZS5cIiBwb3NpdGlvbj1cInJpZ2h0XCI+XG4gICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXNtIHRleHQtYmx1ZS04MDAgZm9udC1tZWRpdW1cIj5FbmFibGUgUGFzcyAzQSAoQ29tcGxleCBTeW50aGVzaXMpPC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgIDwvVG9vbHRpcD5cbiAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBjaGVja2VkPXtsb2NhbENvbmZpZy5zbWFydEZpeGVyLmVuYWJsZVBhc3MzQSAhPT0gZmFsc2V9IG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlU21hcnRGaXhlcignZW5hYmxlUGFzczNBJywgZS50YXJnZXQuY2hlY2tlZCl9IGNsYXNzTmFtZT1cInctNSBoLTUgdGV4dC1ibHVlLTYwMCBiZy13aGl0ZSBib3JkZXItc2xhdGUtMzAwIHJvdW5kZWRcIiAvPlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGZsZXgtY29sIGJnLWJsdWUtNTAvNTAgcC0yIHJvdW5kZWQgZ2FwLTFcIj5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXJcIj5cbiAgICAgICAgICAgICAgICAgIDxUb29sdGlwIHRleHQ9XCJQcm9wb3NhbHMgd2l0aCBhIGNvbmZpZGVuY2Ugc2NvcmUgYmVsb3cgdGhpcyB0aHJlc2hvbGQgYXJlIHNpbGVudGx5IGRyb3BwZWQuIFNjb3JlIDDigJMxMDA6IGEgaGlnaCBzY29yZSBtZWFucyB0aGUgZW5naW5lIGlzIHZlcnkgY29uZmlkZW50IGFib3V0IHRoZSBzcGF0aWFsIGNvbm5lY3Rpb24uIEluY3JlYXNlIHRoaXMgdmFsdWUgdG8gb25seSBzZWUgaGlnaC1jb25maWRlbmNlIHByb3Bvc2FsczsgZGVjcmVhc2UgaXQgdG8gc3VyZmFjZSBtb3JlIHNwZWN1bGF0aXZlIG1hdGNoZXMuXCIgcG9zaXRpb249XCJyaWdodFwiPlxuICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwidGV4dC1zbSB0ZXh0LWJsdWUtODAwIGZvbnQtbWVkaXVtXCI+TWluIFRvcG9sb2d5IEFwcHJvdmFsIFNjb3JlPC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgIDwvVG9vbHRpcD5cbiAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjFcIiB2YWx1ZT17bG9jYWxDb25maWcuc21hcnRGaXhlci5taW5BcHByb3ZhbFNjb3JlID8/IDEwfSBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZVNtYXJ0Rml4ZXIoJ21pbkFwcHJvdmFsU2NvcmUnLCBwYXJzZUZsb2F0KGUudGFyZ2V0LnZhbHVlKSl9IGNsYXNzTmFtZT1cInctMjQgcC0xIGJvcmRlciByb3VuZGVkIHRleHQtcmlnaHQgdGV4dC1zbSBmb250LW1vbm9cIiB0aXRsZT1cIlRocmVzaG9sZCBmb3IgcHJvcG9zaW5nIGZpeGVzLiBEcm9wcyBiZWxvdyB0aGlzIHNjb3JlLlwiLz5cbiAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJiZy1zbGF0ZS01MCBwLTMgcm91bmRlZCBib3JkZXIgYm9yZGVyLXNsYXRlLTIwMCBtdC0yIHNwYWNlLXktMlwiPlxuICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gY3Vyc29yLXBvaW50ZXJcIj5cbiAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQtc20gZm9udC1zZW1pYm9sZCB0ZXh0LXNsYXRlLTcwMFwiPlVzZSBEeW5hbWljIExvZ2FyaXRobWljIFNjb3Jpbmc8L3NwYW4+XG4gICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2hlY2tlZD17bG9jYWxDb25maWcuc21hcnRGaXhlci5keW5hbWljU2NvcmluZyA/PyBmYWxzZX0gb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVTbWFydEZpeGVyKCdkeW5hbWljU2NvcmluZycsIGUudGFyZ2V0LmNoZWNrZWQpfSBjbGFzc05hbWU9XCJmb3JtLWNoZWNrYm94IGgtNCB3LTQgdGV4dC1ibHVlLTYwMCByb3VuZGVkXCIvPlxuICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwidGV4dC14cyB0ZXh0LXNsYXRlLTUwMCBsZWFkaW5nLXJlbGF4ZWRcIj5cbiAgICAgICAgICAgICAgICAgIFdoZW4gZW5hYmxlZCwgdGhlIDxjb2RlPlNpemUgUmF0aW88L2NvZGU+IHNjb3JlIHNjYWxlcyBkeW5hbWljYWxseSB1c2luZyBhIGxvZ2FyaXRobWljIGN1cnZlIGJhc2VkIG9uIGFjdHVhbCBwaXBlIGJvcmUgYWJzb2x1dGUgc2l6ZXMsIHJhdGhlciB0aGFuIGFzc2lnbmluZyBhIGZsYXQgYm9udXMuIEl0IHNldmVyZWx5IHBlbmFsaXplcyBtaXNtYXRjaGVzIG9uIHNtYWxsIGJvcmUgcGlwaW5nIHdoaWxlIGJlaW5nIGZvcmdpdmluZyBvbiBtYWluIGhlYWRlcnMuXG4gICAgICAgICAgICAgICAgPC9wPlxuICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICA8cCBjbGFzc05hbWU9XCJ0ZXh0LVsxMHB4XSB0ZXh0LXNsYXRlLTUwMCBpdGFsaWMgbXQtMSBsZWFkaW5nLXRpZ2h0XCI+XG4gICAgICAgICAgICAgICAgPHN0cm9uZz5TY29yZSBCYXNpczo8L3N0cm9uZz4gVGhlIGVuZ2luZSBzY29yZXMgcHJvcG9zYWxzIGZyb20gMC0xMDAgYmFzZWQgb24gd2VpZ2h0ZWQgbWV0cmljczogTGluZV9LZXkgTWF0Y2ggKDMwJSksIEVsZW1lbnQgQXhpcyBBbGlnbm1lbnQgKDI1JSksIFBpcGVsaW5lIEJvcmUgUmF0aW8gQ29udGludWl0eSAoMjUlKSwgR2xvYmFsIFN3ZWVwaW5nIFJhZGl1cyAoMTAlKSwgYW5kIEltbXV0YWJsZSBCb3VuZHMgKDEwJSkuIFByb3Bvc2FscyBzY29yaW5nIGJlbG93IHRoaXMgdGhyZXNob2xkIGFyZSBhdXRvbWF0aWNhbGx5IGRyb3BwZWQuXG4gICAgICAgICAgICAgIDwvcD5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXJcIj5cbiAgICAgICAgICAgICAgPFRvb2x0aXAgdGV4dD1cIlBpcGUgc2VnbWVudHMgc2hvcnRlciB0aGFuIHRoaXMgbGVuZ3RoIChtbSkgYXJlIGF1dG9tYXRpY2FsbHkgZmxhZ2dlZCBmb3IgZGVsZXRpb24uIFRoZXNlIG1pY3JvLXBpcGVzIHVzdWFsbHkgYXJpc2UgZnJvbSByb3VuZGluZyBlcnJvcnMgaW4gQ0FEIGV4cG9ydHMgYW5kIGNhdXNlIGlzc3VlcyBpbiBmbGV4aWJpbGl0eSBhbmFseXNpcyB0b29scy4gU2V0IHRvIDAgdG8gZGlzYWJsZSBhdXRvbWF0aWMgbWljcm8tcGlwZSBkZWxldGlvbi5cIiBwb3NpdGlvbj1cInJpZ2h0XCI+XG4gICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cInRleHQtc20gdGV4dC1zbGF0ZS02MDBcIj5NaWNyby1QaXBlIERlbGV0aW9uIFRocmVzaG9sZCAobW0pPC9sYWJlbD5cbiAgICAgICAgICAgICAgPC9Ub29sdGlwPlxuICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIwLjFcIiB2YWx1ZT17bG9jYWxDb25maWcuc21hcnRGaXhlci5taWNyb1BpcGVUaHJlc2hvbGR9IG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlU21hcnRGaXhlcignbWljcm9QaXBlVGhyZXNob2xkJywgZS50YXJnZXQudmFsdWUpfSBjbGFzc05hbWU9XCJ3LTI0IHAtMSBib3JkZXIgcm91bmRlZCB0ZXh0LXJpZ2h0IHRleHQtc20gZm9udC1tb25vXCIgLz5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXJcIj5cbiAgICAgICAgICAgICAgPFRvb2x0aXAgdGV4dD1cIk5vbi1waXBlIGZpdHRpbmdzIChCRU5ELCBGTEFOR0UsIFZBTFZFKSB3aXRoIGEgZmFjZS10by1mYWNlIGxlbmd0aCBiZWxvdyB0aGlzIHZhbHVlIChtbSkgZ2VuZXJhdGUgYSB3YXJuaW5nLiBWZXJ5IHNob3J0IGZpdHRpbmdzIGFyZSB1c3VhbGx5IGNhdXNlZCBieSBhIGRhdGEgdHJhbnNsYXRpb24gZXJyb3IgYW5kIG1heSBub3QgYmUgbWFudWZhY3R1cmFibGUuXCIgcG9zaXRpb249XCJyaWdodFwiPlxuICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXNtIHRleHQtc2xhdGUtNjAwXCI+TWljcm8tRml0dGluZyBXYXJuaW5nPC9sYWJlbD5cbiAgICAgICAgICAgICAgPC9Ub29sdGlwPlxuICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIwLjFcIiB2YWx1ZT17bG9jYWxDb25maWcuc21hcnRGaXhlci5taWNyb0ZpdHRpbmdUaHJlc2hvbGR9IG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlU21hcnRGaXhlcignbWljcm9GaXR0aW5nVGhyZXNob2xkJywgZS50YXJnZXQudmFsdWUpfSBjbGFzc05hbWU9XCJ3LTI0IHAtMSBib3JkZXIgcm91bmRlZCB0ZXh0LXJpZ2h0IHRleHQtc20gZm9udC1tb25vXCIgLz5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXJcIj5cbiAgICAgICAgICAgICAgPFRvb2x0aXAgdGV4dD1cIklmIGEgZml0dGluZydzIG1pbm9yIGF4aXMgb2Zmc2V0ICh0aGUgY29tcG9uZW50IGlzIHNsaWdodGx5IG9mZiB0aGUgcGlwZSBjZW50cmVsaW5lKSBpcyBzbWFsbGVyIHRoYW4gdGhpcyB2YWx1ZSAobW0pLCB0aGUgZW5naW5lIGF1dG9tYXRpY2FsbHkgc25hcHMgaXQgYmFjayBvbnRvIHRoZSBjZW50cmVsaW5lIHdpdGhvdXQgcmVxdWlyaW5nIHVzZXIgYXBwcm92YWwuIEEgaGlnaGVyIHRocmVzaG9sZCBpcyBtb3JlIGFnZ3Jlc3NpdmUg4oCUIG9ubHkgaW5jcmVhc2UgaWYgeW91ciBkYXRhIGhhcyBrbm93biBzeXN0ZW1hdGljIG9mZi1heGlzIG9mZnNldHMuXCIgcG9zaXRpb249XCJyaWdodFwiPlxuICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXNtIHRleHQtc2xhdGUtNjAwXCI+T2ZmLUF4aXMgU25hcHBpbmc8L2xhYmVsPlxuICAgICAgICAgICAgICA8L1Rvb2x0aXA+XG4gICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjAuMVwiIHZhbHVlPXtsb2NhbENvbmZpZy5zbWFydEZpeGVyLmRpYWdvbmFsTWlub3JUaHJlc2hvbGR9IG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlU21hcnRGaXhlcignZGlhZ29uYWxNaW5vclRocmVzaG9sZCcsIGUudGFyZ2V0LnZhbHVlKX0gY2xhc3NOYW1lPVwidy0yNCBwLTEgYm9yZGVyIHJvdW5kZWQgdGV4dC1yaWdodCB0ZXh0LXNtIGZvbnQtbW9ub1wiIC8+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgey8qIFJheSBTaG9vdGVyIExvZ2ljICovfVxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJnLXNsYXRlLTUwIHAtNCByb3VuZGVkIGJvcmRlciBib3JkZXItc2xhdGUtMjAwIHNoYWRvdy1zbVwiPlxuICAgICAgICAgIDxoMyBjbGFzc05hbWU9XCJmb250LXNlbWlib2xkIHRleHQtc2xhdGUtNzAwIG1iLTMgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuXCI+XG4gICAgICAgICAgICA8c3Bhbj5SYXkgU2hvb3RlciBJbnRlZ3JhdGlvbiAoU3RhZ2UgMUMpPC9zcGFuPlxuICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGN1cnNvci1wb2ludGVyXCI+XG4gICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtc2xhdGUtNTAwIG1yLTIgZm9udC1ub3JtYWxcIj5FbmFibGUgUmF5IFNob290ZXI8L3NwYW4+XG4gICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2hlY2tlZD17bG9jYWxDb25maWcuc21hcnRGaXhlci5yYXlTaG9vdGVyPy5lbmFibGVkID8/IHRydWV9IG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlU21hcnRGaXhlcigncmF5U2hvb3RlcicsIHsgLi4ubG9jYWxDb25maWcuc21hcnRGaXhlci5yYXlTaG9vdGVyLCBlbmFibGVkOiBlLnRhcmdldC5jaGVja2VkIH0pfSBjbGFzc05hbWU9XCJmb3JtLWNoZWNrYm94IGgtNCB3LTQgdGV4dC1ibHVlLTYwMCByb3VuZGVkXCIvPlxuICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICA8L2gzPlxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgc3BhY2UteS0zICR7IShsb2NhbENvbmZpZy5zbWFydEZpeGVyLnJheVNob290ZXI/LmVuYWJsZWQgPz8gdHJ1ZSkgPyAnb3BhY2l0eS01MCBwb2ludGVyLWV2ZW50cy1ub25lJyA6ICcnfWB9PlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXJcIj5cbiAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cInRleHQtc20gdGV4dC1zbGF0ZS02MDBcIiB0aXRsZT1cIk1heCBwZXJwZW5kaWN1bGFyIGRpc3RhbmNlIGZyb20gY2FuZGlkYXRlIGVuZHBvaW50IHRvIHJheSBsaW5lXCI+VHViZSBUb2xlcmFuY2UgKG1tKTwvbGFiZWw+XG4gICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjAuMVwiIHZhbHVlPXtsb2NhbENvbmZpZy5zbWFydEZpeGVyLnJheVNob290ZXI/LnR1YmVUb2xlcmFuY2UgPz8gNTAuMH0gb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVTbWFydEZpeGVyKCdyYXlTaG9vdGVyJywgeyAuLi5sb2NhbENvbmZpZy5zbWFydEZpeGVyLnJheVNob290ZXIsIHR1YmVUb2xlcmFuY2U6IHBhcnNlRmxvYXQoZS50YXJnZXQudmFsdWUpIH0pfSBjbGFzc05hbWU9XCJ3LTI0IHAtMSBib3JkZXIgcm91bmRlZCB0ZXh0LXJpZ2h0IHRleHQtc20gZm9udC1tb25vXCIgLz5cbiAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInB0LTIgYm9yZGVyLXQgYm9yZGVyLXNsYXRlLTIwMFwiPlxuICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBjdXJzb3ItcG9pbnRlciBtYi0yXCI+XG4gICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQtc20gdGV4dC1zbGF0ZS02MDBcIj5QYXNzIDE6IFNhbWUtQm9yZSBDYW5kaWRhdGVzPC9zcGFuPlxuICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2hlY2tlZD17bG9jYWxDb25maWcuc21hcnRGaXhlci5yYXlTaG9vdGVyPy5wYXNzMVNhbWVCb3JlID8/IHRydWV9IG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlU21hcnRGaXhlcigncmF5U2hvb3RlcicsIHsgLi4ubG9jYWxDb25maWcuc21hcnRGaXhlci5yYXlTaG9vdGVyLCBwYXNzMVNhbWVCb3JlOiBlLnRhcmdldC5jaGVja2VkIH0pfSBjbGFzc05hbWU9XCJmb3JtLWNoZWNrYm94IGgtNCB3LTQgdGV4dC1ibHVlLTYwMCByb3VuZGVkXCIvPlxuICAgICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gY3Vyc29yLXBvaW50ZXIgbWItMlwiPlxuICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXNtIHRleHQtc2xhdGUtNjAwXCI+UGFzcyAyOiBBbnktQm9yZSBDYW5kaWRhdGVzIChJbmplY3RzIFJlZHVjZXJzKTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGNoZWNrZWQ9e2xvY2FsQ29uZmlnLnNtYXJ0Rml4ZXIucmF5U2hvb3Rlcj8ucGFzczJBbnlCb3JlID8/IHRydWV9IG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlU21hcnRGaXhlcigncmF5U2hvb3RlcicsIHsgLi4ubG9jYWxDb25maWcuc21hcnRGaXhlci5yYXlTaG9vdGVyLCBwYXNzMkFueUJvcmU6IGUudGFyZ2V0LmNoZWNrZWQgfSl9IGNsYXNzTmFtZT1cImZvcm0tY2hlY2tib3ggaC00IHctNCB0ZXh0LWJsdWUtNjAwIHJvdW5kZWRcIi8+XG4gICAgICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBjdXJzb3ItcG9pbnRlciBtYi0yXCI+XG4gICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQtc20gdGV4dC1zbGF0ZS02MDBcIiB0aXRsZT1cIlNob290IGludG8gYWxyZWFkeS1yZXNvbHZlZCBTdGFnZSAxQSBjb21wb25lbnRzXCI+UGFzcyAzOiBSZXNvbHZlZCAoU3RhZ2UgMUEpIENhbmRpZGF0ZXM8L3NwYW4+XG4gICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBjaGVja2VkPXtsb2NhbENvbmZpZy5zbWFydEZpeGVyLnJheVNob290ZXI/LnBhc3MzUmVzb2x2ZWQgPz8gZmFsc2V9IG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlU21hcnRGaXhlcigncmF5U2hvb3RlcicsIHsgLi4ubG9jYWxDb25maWcuc21hcnRGaXhlci5yYXlTaG9vdGVyLCBwYXNzM1Jlc29sdmVkOiBlLnRhcmdldC5jaGVja2VkIH0pfSBjbGFzc05hbWU9XCJmb3JtLWNoZWNrYm94IGgtNCB3LTQgdGV4dC1ibHVlLTYwMCByb3VuZGVkXCIvPlxuICAgICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gY3Vyc29yLXBvaW50ZXJcIj5cbiAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1zbSB0ZXh0LXNsYXRlLTYwMFwiIHRpdGxlPVwiU2hvb3QgYWxvbmcgY2FyZGluYWwgYXhlcyBpZiBzZXF1ZW50aWFsIHZlY3RvciBmYWlsc1wiPlBhc3MgNDogR2xvYmFsIEF4aXMgRmFsbGJhY2s8L3NwYW4+XG4gICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBjaGVja2VkPXtsb2NhbENvbmZpZy5zbWFydEZpeGVyLnJheVNob290ZXI/LnBhc3M0R2xvYmFsQXhpcyA/PyB0cnVlfSBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZVNtYXJ0Rml4ZXIoJ3JheVNob290ZXInLCB7IC4uLmxvY2FsQ29uZmlnLnNtYXJ0Rml4ZXIucmF5U2hvb3RlciwgcGFzczRHbG9iYWxBeGlzOiBlLnRhcmdldC5jaGVja2VkIH0pfSBjbGFzc05hbWU9XCJmb3JtLWNoZWNrYm94IGgtNCB3LTQgdGV4dC1ibHVlLTYwMCByb3VuZGVkXCIvPlxuICAgICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cblxuICAgICAgICB7LyogQ29tbW9uIDNEIENsZWFudXAgUnVsZXMgKi99XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYmctc2xhdGUtNTAgcC00IHJvdW5kZWQgYm9yZGVyIGJvcmRlci1zbGF0ZS0yMDAgc2hhZG93LXNtIG1kOmNvbC1zcGFuLTJcIj5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgganVzdGlmeS1iZXR3ZWVuIGl0ZW1zLWNlbnRlciBtYi0zXCI+XG4gICAgICAgICAgICA8aDMgY2xhc3NOYW1lPVwiZm9udC1zZW1pYm9sZCB0ZXh0LXNsYXRlLTcwMCB0ZXh0LW9yYW5nZS01MDBcIj5Db21tb24gM0QgQ2xlYW51cCBSdWxlczwvaDM+XG4gICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgc3BhY2UteC0yIGN1cnNvci1wb2ludGVyXCI+XG4gICAgICAgICAgICAgIDxpbnB1dFxuICAgICAgICAgICAgICAgIHR5cGU9XCJjaGVja2JveFwiXG4gICAgICAgICAgICAgICAgY2hlY2tlZD17bG9jYWxDb25maWcuc21hcnRGaXhlci5lbmFibGUzRFJ1bGVzICE9PSBmYWxzZX1cbiAgICAgICAgICAgICAgICBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZVNtYXJ0Rml4ZXIoJ2VuYWJsZTNEUnVsZXMnLCBlLnRhcmdldC5jaGVja2VkKX1cbiAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJ3LTQgaC00IHRleHQtb3JhbmdlLTUwMCBib3JkZXItc2xhdGUtMzAwIHJvdW5kZWQgZm9jdXM6cmluZy1vcmFuZ2UtNTAwXCJcbiAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTcwMFwiPkVuYWJsZSAzRCBSdWxlczwvc3Bhbj5cbiAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9e2BncmlkIGdyaWQtY29scy0xIG1kOmdyaWQtY29scy0yIGdhcC00ICR7bG9jYWxDb25maWcuc21hcnRGaXhlci5lbmFibGUzRFJ1bGVzID09PSBmYWxzZSA/ICdvcGFjaXR5LTUwIHBvaW50ZXItZXZlbnRzLW5vbmUnIDogJyd9YH0+XG4gICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgganVzdGlmeS1iZXR3ZWVuIGl0ZW1zLWNlbnRlciBtYi0xXCI+XG4gICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cInRleHQtc20gZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS03MDBcIj5NYXggc2luZ2xlIHBsYW5lIFJ1biAobW0pPC9sYWJlbD5cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjFcIiB2YWx1ZT17bG9jYWxDb25maWcuc21hcnRGaXhlci5tYXhTaW5nbGVQbGFuZVJ1biA/PyAxMjAwMH0gb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVTbWFydEZpeGVyKCdtYXhTaW5nbGVQbGFuZVJ1bicsIHBhcnNlRmxvYXQoZS50YXJnZXQudmFsdWUpKX0gY2xhc3NOYW1lPVwidy1mdWxsIHAtMiBib3JkZXIgYm9yZGVyLXNsYXRlLTMwMCByb3VuZGVkIHRleHQtc20gbWItMSBiZy13aGl0ZSBmb250LW1vbm9cIiAvPlxuICAgICAgICAgICAgICA8cCBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtc2xhdGUtNTAwIGl0YWxpY1wiPk1heGltdW0gYWxsb3dlZCBjb250aW51b3VzIHN0cmFpZ2h0IGxlbmd0aCB3aXRob3V0IGEgYnJlYWsgb3Igc3VwcG9ydC48L3A+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyIG1iLTFcIj5cbiAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwidGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTcwMFwiPk1heCBPdmVybGFwIChtbSk8L2xhYmVsPlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMVwiIHZhbHVlPXtsb2NhbENvbmZpZy5zbWFydEZpeGVyLm1heE92ZXJsYXAgPz8gMTAwMH0gb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVTbWFydEZpeGVyKCdtYXhPdmVybGFwJywgcGFyc2VGbG9hdChlLnRhcmdldC52YWx1ZSkpfSBjbGFzc05hbWU9XCJ3LWZ1bGwgcC0yIGJvcmRlciBib3JkZXItc2xhdGUtMzAwIHJvdW5kZWQgdGV4dC1zbSBtYi0xIGJnLXdoaXRlIGZvbnQtbW9ub1wiIC8+XG4gICAgICAgICAgICAgIDxwIGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS01MDAgaXRhbGljXCI+TWF4aW11bSBhbGxvd2VkIGRpc3RhbmNlIHR3byBjb21wb25lbnRzIGNhbiBwaHlzaWNhbGx5IGludGVyc2VjdC48L3A+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyIG1iLTFcIj5cbiAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwidGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTcwMFwiPk1pbiBQaXBlIFNpemUgKG1tKTwvbGFiZWw+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIxXCIgdmFsdWU9e2xvY2FsQ29uZmlnLnNtYXJ0Rml4ZXIubWluUGlwZVNpemUgPz8gMH0gb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVTbWFydEZpeGVyKCdtaW5QaXBlU2l6ZScsIHBhcnNlRmxvYXQoZS50YXJnZXQudmFsdWUpKX0gY2xhc3NOYW1lPVwidy1mdWxsIHAtMiBib3JkZXIgYm9yZGVyLXNsYXRlLTMwMCByb3VuZGVkIHRleHQtc20gbWItMSBiZy13aGl0ZSBmb250LW1vbm9cIiAvPlxuICAgICAgICAgICAgICA8cCBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtc2xhdGUtNTAwIGl0YWxpY1wiPk1pbmltdW0gTm9taW5hbCBCb3JlLiBTa2lwcyBhZHZhbmNlZCBtZXJnaW5nIGxvZ2ljIGZvciB0dWJpbmcgYmVsb3cgdGhpcyBzaXplLjwvcD5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXIgbWItMVwiPlxuICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtNzAwXCI+TWluIENvbXBvbmVudCBTaXplIChtbSk8L2xhYmVsPlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMVwiIHZhbHVlPXtsb2NhbENvbmZpZy5zbWFydEZpeGVyLm1pbkNvbXBvbmVudFNpemUgPz8gM30gb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVTbWFydEZpeGVyKCdtaW5Db21wb25lbnRTaXplJywgcGFyc2VGbG9hdChlLnRhcmdldC52YWx1ZSkpfSBjbGFzc05hbWU9XCJ3LWZ1bGwgcC0yIGJvcmRlciBib3JkZXItc2xhdGUtMzAwIHJvdW5kZWQgdGV4dC1zbSBtYi0xIGJnLXdoaXRlIGZvbnQtbW9ub1wiIC8+XG4gICAgICAgICAgICAgIDxwIGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS01MDAgaXRhbGljXCI+UHJldmVudHMgc3ludGhlc2l6aW5nIGltcG9zc2libGUsIHBhcGVyLXRoaW4gc3RydWN0dXJhbCBjb21wb25lbnRzLjwvcD5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXIgbWItMVwiPlxuICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtNzAwXCI+My1QbGFuZSBTa2V3IExpbWl0IChtbSk8L2xhYmVsPlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMVwiIHZhbHVlPXtsb2NhbENvbmZpZy5zbWFydEZpeGVyLnRocmVlUGxhbmVTa2V3TGltaXQgPz8gMjAwMH0gb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVTbWFydEZpeGVyKCd0aHJlZVBsYW5lU2tld0xpbWl0JywgcGFyc2VGbG9hdChlLnRhcmdldC52YWx1ZSkpfSBjbGFzc05hbWU9XCJ3LWZ1bGwgcC0yIGJvcmRlciBib3JkZXItc2xhdGUtMzAwIHJvdW5kZWQgdGV4dC1zbSBtYi0xIGJnLXdoaXRlIGZvbnQtbW9ub1wiIC8+XG4gICAgICAgICAgICAgIDxwIGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS01MDAgaXRhbGljXCI+TGltaXRzIGxlbmd0aCBvZiBzeW50aGVzaXplZCBnYXBzIHNrZXdlZCBhY3Jvc3MgYWxsIHRocmVlIFgsIFksIGFuZCBaIGF4ZXMuPC9wPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgganVzdGlmeS1iZXR3ZWVuIGl0ZW1zLWNlbnRlciBtYi0xXCI+XG4gICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cInRleHQtc20gZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS03MDBcIj4yLVBsYW5lIFNrZXcgTGltaXQgKG1tKTwvbGFiZWw+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIxXCIgdmFsdWU9e2xvY2FsQ29uZmlnLnNtYXJ0Rml4ZXIudHdvUGxhbmVTa2V3TGltaXQgPz8gMzAwMH0gb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVTbWFydEZpeGVyKCd0d29QbGFuZVNrZXdMaW1pdCcsIHBhcnNlRmxvYXQoZS50YXJnZXQudmFsdWUpKX0gY2xhc3NOYW1lPVwidy1mdWxsIHAtMiBib3JkZXIgYm9yZGVyLXNsYXRlLTMwMCByb3VuZGVkIHRleHQtc20gbWItMSBiZy13aGl0ZSBmb250LW1vbm9cIiAvPlxuICAgICAgICAgICAgICA8cCBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtc2xhdGUtNTAwIGl0YWxpY1wiPkxpbWl0cyBsZW5ndGggb2Ygc3ludGhlc2l6ZWQgZ2FwcyBza2V3ZWQgYWNyb3NzIHR3byBheGVzLjwvcD5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXIgbWItMVwiPlxuICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtNzAwXCI+TWF4IERpYWdvbmFsIEdhcCAobW0pPC9sYWJlbD5cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjFcIiB2YWx1ZT17bG9jYWxDb25maWcuc21hcnRGaXhlci5tYXhEaWFnb25hbEdhcCA/PyA2MDAwfSBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZVNtYXJ0Rml4ZXIoJ21heERpYWdvbmFsR2FwJywgcGFyc2VGbG9hdChlLnRhcmdldC52YWx1ZSkpfSBjbGFzc05hbWU9XCJ3LWZ1bGwgcC0yIGJvcmRlciBib3JkZXItc2xhdGUtMzAwIHJvdW5kZWQgdGV4dC1zbSBtYi0xIGJnLXdoaXRlIGZvbnQtbW9ub1wiIC8+XG4gICAgICAgICAgICAgIDxwIGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS01MDAgaXRhbGljXCI+RmFpbHNhZmUgbGltaXQgZm9yIGJyaWRnaW5nIGdhcHMgc3RyaWN0bHkgaW52b2x2aW5nIHR1cm5pbmcgY29tcG9uZW50cy48L3A+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyIG1iLTFcIj5cbiAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwidGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTcwMFwiPlNpbmdsZSBBeGlzIFNsb3BlIFRvbGVyYW5jZTwvbGFiZWw+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIwLjAwMVwiIHZhbHVlPXtsb2NhbENvbmZpZy5zbWFydEZpeGVyLnNpbmdsZUF4aXNTbG9wZVRvbGVyYW5jZSA/PyAwLjAxfSBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZVNtYXJ0Rml4ZXIoJ3NpbmdsZUF4aXNTbG9wZVRvbGVyYW5jZScsIHBhcnNlRmxvYXQoZS50YXJnZXQudmFsdWUpKX0gY2xhc3NOYW1lPVwidy1mdWxsIHAtMiBib3JkZXIgYm9yZGVyLXNsYXRlLTMwMCByb3VuZGVkIHRleHQtc20gbWItMSBiZy13aGl0ZSBmb250LW1vbm9cIiAvPlxuICAgICAgICAgICAgICA8cCBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtc2xhdGUtNTAwIGl0YWxpY1wiPlJhdGlvIChlLmcuIDAuMDEpIHRvIGlnbm9yZSBtaWxkIHNsb3BlcyBvbiBob3Jpem9udGFsIHJ1bnMuPC9wPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuXG4gICAgICAgIHsvKiBHYXAgJiBPdmVybGFwIExvZ2ljICovfVxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJnLXNsYXRlLTUwIHAtNCByb3VuZGVkIGJvcmRlciBib3JkZXItc2xhdGUtMjAwIHNoYWRvdy1zbVwiPlxuICAgICAgICAgIDxoMyBjbGFzc05hbWU9XCJmb250LXNlbWlib2xkIHRleHQtc2xhdGUtNzAwIG1iLTNcIj5HYXAgJiBPdmVybGFwIExpbWl0cyAobW0pPC9oMz5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInNwYWNlLXktM1wiPlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXJcIj5cbiAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cInRleHQtc20gdGV4dC1zbGF0ZS02MDBcIj5TaWxlbnQgU25hcCBNaWNyby1HYXA8L2xhYmVsPlxuICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIwLjFcIiB2YWx1ZT17bG9jYWxDb25maWcuc21hcnRGaXhlci5uZWdsaWdpYmxlR2FwfSBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZVNtYXJ0Rml4ZXIoJ25lZ2xpZ2libGVHYXAnLCBlLnRhcmdldC52YWx1ZSl9IGNsYXNzTmFtZT1cInctMjQgcC0xIGJvcmRlciByb3VuZGVkIHRleHQtcmlnaHQgdGV4dC1zbSBmb250LW1vbm9cIiAvPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgganVzdGlmeS1iZXR3ZWVuIGl0ZW1zLWNlbnRlclwiPlxuICAgICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwidGV4dC1zbSB0ZXh0LXNsYXRlLTYwMFwiPkF1dG8tRmlsbCBQaXBlIE1heCBHYXA8L2xhYmVsPlxuICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIHN0ZXA9XCIwLjFcIiB2YWx1ZT17bG9jYWxDb25maWcuc21hcnRGaXhlci5hdXRvRmlsbE1heEdhcH0gb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVTbWFydEZpeGVyKCdhdXRvRmlsbE1heEdhcCcsIGUudGFyZ2V0LnZhbHVlKX0gY2xhc3NOYW1lPVwidy0yNCBwLTEgYm9yZGVyIHJvdW5kZWQgdGV4dC1yaWdodCB0ZXh0LXNtIGZvbnQtbW9ub1wiIC8+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyXCI+XG4gICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXNtIHRleHQtc2xhdGUtNjAwXCI+QXV0by1UcmltIE1heCBPdmVybGFwPC9sYWJlbD5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMC4xXCIgdmFsdWU9e2xvY2FsQ29uZmlnLnNtYXJ0Rml4ZXIuYXV0b1RyaW1NYXhPdmVybGFwfSBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZVNtYXJ0Rml4ZXIoJ2F1dG9UcmltTWF4T3ZlcmxhcCcsIGUudGFyZ2V0LnZhbHVlKX0gY2xhc3NOYW1lPVwidy0yNCBwLTEgYm9yZGVyIHJvdW5kZWQgdGV4dC1yaWdodCB0ZXh0LXNtIGZvbnQtbW9ub1wiIC8+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyXCI+XG4gICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXNtIHRleHQtc2xhdGUtNjAwXCI+R2FwIFJldmlldyBXYXJuaW5nPC9sYWJlbD5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMC4xXCIgdmFsdWU9e2xvY2FsQ29uZmlnLnNtYXJ0Rml4ZXIucmV2aWV3R2FwTWF4fSBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZVNtYXJ0Rml4ZXIoJ3Jldmlld0dhcE1heCcsIGUudGFyZ2V0LnZhbHVlKX0gY2xhc3NOYW1lPVwidy0yNCBwLTEgYm9yZGVyIHJvdW5kZWQgdGV4dC1yaWdodCB0ZXh0LXNtIGZvbnQtbW9ub1wiIC8+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgey8qIFRvcG9sb2dpY2FsIENvbnN0cmFpbnRzICovfVxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJnLXNsYXRlLTUwIHAtNCByb3VuZGVkIGJvcmRlciBib3JkZXItc2xhdGUtMjAwIHNoYWRvdy1zbVwiPlxuICAgICAgICAgIDxoMyBjbGFzc05hbWU9XCJmb250LXNlbWlib2xkIHRleHQtc2xhdGUtNzAwIG1iLTNcIj5Ub3BvbG9naWNhbCBSdWxlczwvaDM+XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzcGFjZS15LTNcIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyXCI+XG4gICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXNtIHRleHQtc2xhdGUtNjAwXCI+VG9wb2xvZ2ljYWwgUm91dGUgQ2xvc3VyZSBBbGVydCAobW0pPC9sYWJlbD5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMC4xXCIgdmFsdWU9e2xvY2FsQ29uZmlnLnNtYXJ0Rml4ZXIuY2xvc3VyZVdhcm5pbmdUaHJlc2hvbGR9IG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlU21hcnRGaXhlcignY2xvc3VyZVdhcm5pbmdUaHJlc2hvbGQnLCBlLnRhcmdldC52YWx1ZSl9IGNsYXNzTmFtZT1cInctMjQgcC0xIGJvcmRlciByb3VuZGVkIHRleHQtcmlnaHQgdGV4dC1zbSBmb250LW1vbm9cIiAvPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgganVzdGlmeS1iZXR3ZWVuIGl0ZW1zLWNlbnRlclwiPlxuICAgICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwidGV4dC1zbSB0ZXh0LXNsYXRlLTYwMFwiPlRvcG9sb2dpY2FsIFJvdXRlIENsb3N1cmUgTWF4IEdhcCAobW0pPC9sYWJlbD5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMC4xXCIgdmFsdWU9e2xvY2FsQ29uZmlnLnNtYXJ0Rml4ZXIuY2xvc3VyZUVycm9yVGhyZXNob2xkfSBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZVNtYXJ0Rml4ZXIoJ2Nsb3N1cmVFcnJvclRocmVzaG9sZCcsIGUudGFyZ2V0LnZhbHVlKX0gY2xhc3NOYW1lPVwidy0yNCBwLTEgYm9yZGVyIHJvdW5kZWQgdGV4dC1yaWdodCB0ZXh0LXNtIGZvbnQtbW9ub1wiIC8+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyXCI+XG4gICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXNtIHRleHQtc2xhdGUtNjAwXCI+T0xFVCBNYXggQnJhbmNoIFJhdGlvPC9sYWJlbD5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiMC4wMVwiIHZhbHVlPXtsb2NhbENvbmZpZy5zbWFydEZpeGVyLm9sZXRNYXhSYXRpb0Vycm9yfSBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZVNtYXJ0Rml4ZXIoJ29sZXRNYXhSYXRpb0Vycm9yJywgZS50YXJnZXQudmFsdWUpfSBjbGFzc05hbWU9XCJ3LTI0IHAtMSBib3JkZXIgcm91bmRlZCB0ZXh0LXJpZ2h0IHRleHQtc20gZm9udC1tb25vXCIgLz5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyXCI+XG4gICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXNtIHRleHQtc2xhdGUtNjAwXCI+Q29ubmVjdGlvbiBUb2xlcmFuY2UgKG1tKTwvbGFiZWw+XG4gICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjAuMVwiIHZhbHVlPXtsb2NhbENvbmZpZy5zbWFydEZpeGVyLmNvbm5lY3Rpb25Ub2xlcmFuY2V9IG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlU21hcnRGaXhlcignY29ubmVjdGlvblRvbGVyYW5jZScsIGUudGFyZ2V0LnZhbHVlKX0gY2xhc3NOYW1lPVwidy0yNCBwLTEgYm9yZGVyIHJvdW5kZWQgdGV4dC1yaWdodCB0ZXh0LXNtIGZvbnQtbW9ub1wiIC8+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgey8qIERyYXcgQ2FudmFzIFVJIFNldHRpbmdzICovfVxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJnLWluZGlnby01MCBwLTQgcm91bmRlZCBib3JkZXIgYm9yZGVyLWluZGlnby0yMDAgc2hhZG93LXNtXCI+XG4gICAgICAgICAgPGgzIGNsYXNzTmFtZT1cImZvbnQtc2VtaWJvbGQgdGV4dC1pbmRpZ28tOTAwIG1iLTMgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuXCI+XG4gICAgICAgICAgICA8c3Bhbj5EcmF3IENhbnZhcyBUb29sPC9zcGFuPlxuICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGN1cnNvci1wb2ludGVyIGdhcC0yXCI+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS01MDAgZm9udC1ub3JtYWxcIj5FbmFibGUgSWNvbjwvc3Bhbj5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGNoZWNrZWQ9e2xvY2FsQ29uZmlnLmVuYWJsZURyYXdDYW52YXMgIT09IGZhbHNlfSBvbkNoYW5nZT17KGUpID0+IHNldExvY2FsQ29uZmlnKHByZXYgPT4gKHsgLi4ucHJldiwgZW5hYmxlRHJhd0NhbnZhczogZS50YXJnZXQuY2hlY2tlZCB9KSl9IGNsYXNzTmFtZT1cInctNCBoLTQgdGV4dC1pbmRpZ28tNjAwIHJvdW5kZWQgYm9yZGVyLWdyYXktMzAwXCIgLz5cbiAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgPC9oMz5cbiAgICAgICAgICA8cCBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtaW5kaWdvLTgwMCBtYi0zIGxlYWRpbmctcmVsYXhlZFwiPlxuICAgICAgICAgICAgU2hvdyB0aGUgXCJPcGVuIERyYXcgQ2FudmFzXCIgYnV0dG9uIGluIHRoZSBUT09MUyByaWJib24gdG8gYWNjZXNzIHRoZSBzdGFuZGFsb25lIGRyYWZ0aW5nIGVudmlyb25tZW50LlxuICAgICAgICAgIDwvcD5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgey8qIEEqIFBhdGhmaW5kaW5nICovfVxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJnLWdyZWVuLTUwIHAtNCByb3VuZGVkIGJvcmRlciBib3JkZXItZ3JlZW4tMjAwIHNoYWRvdy1zbVwiPlxuICAgICAgICAgIDxoMyBjbGFzc05hbWU9XCJmb250LXNlbWlib2xkIHRleHQtZ3JlZW4tOTAwIG1iLTMgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuXCI+XG4gICAgICAgICAgICA8c3Bhbj5BKiBPYnN0YWNsZS1Bd2FyZSBHYXAgUm91dGluZzwvc3Bhbj5cbiAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBjdXJzb3ItcG9pbnRlciBnYXAtMlwiPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtc2xhdGUtNTAwIGZvbnQtbm9ybWFsXCI+RW5hYmxlPC9zcGFuPlxuICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2hlY2tlZD17bG9jYWxDb25maWcuc21hcnRGaXhlci5wYXRoZmluZGluZ0VuYWJsZWQgIT09IGZhbHNlfSBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZVNtYXJ0Rml4ZXIoJ3BhdGhmaW5kaW5nRW5hYmxlZCcsIGUudGFyZ2V0LmNoZWNrZWQpfSBjbGFzc05hbWU9XCJ3LTQgaC00IHRleHQtZ3JlZW4tNjAwIHJvdW5kZWQgYm9yZGVyLWdyYXktMzAwXCIgLz5cbiAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgPC9oMz5cbiAgICAgICAgICA8cCBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtZ3JlZW4tODAwIG1iLTMgbGVhZGluZy1yZWxheGVkXCI+XG4gICAgICAgICAgICBXaGVuIGEgbXVsdGktYXhpcyBnYXAgY2Fubm90IGJlIGZpbGxlZCB3aXRoIGEgc2luZ2xlIHN0cmFpZ2h0IHBpcGUsIEEqIHNlYXJjaGVzIGZvciBhblxuICAgICAgICAgICAgb2JzdGFjbGUtYXZvaWRpbmcgYXhpcy1hbGlnbmVkIHJvdXRlIGFuZCBwcm9wb3NlcyBhIG11bHRpLXNlZ21lbnQgUEFUSEZJTkQgZml4IChSLUdBUC0wNykuXG4gICAgICAgICAgPC9wPlxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgc3BhY2UteS0yICR7bG9jYWxDb25maWcuc21hcnRGaXhlci5wYXRoZmluZGluZ0VuYWJsZWQgPT09IGZhbHNlID8gJ29wYWNpdHktNTAgcG9pbnRlci1ldmVudHMtbm9uZScgOiAnJ31gfT5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyXCI+XG4gICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXNtIHRleHQtc2xhdGUtNjAwXCI+R3JpZCBSZXNvbHV0aW9uIChtbS9jZWxsKTwvbGFiZWw+XG4gICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjEwXCIgdmFsdWU9e2xvY2FsQ29uZmlnLnNtYXJ0Rml4ZXIucGF0aGZpbmRpbmdHcmlkUmVzb2x1dGlvbiA/PyAxMDB9IG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlU21hcnRGaXhlcigncGF0aGZpbmRpbmdHcmlkUmVzb2x1dGlvbicsIGUudGFyZ2V0LnZhbHVlKX0gY2xhc3NOYW1lPVwidy0yNCBwLTEgYm9yZGVyIHJvdW5kZWQgdGV4dC1yaWdodCB0ZXh0LXNtIGZvbnQtbW9ub1wiIC8+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyXCI+XG4gICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXNtIHRleHQtc2xhdGUtNjAwXCI+TWF4IFNlYXJjaCBDZWxsczwvbGFiZWw+XG4gICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgc3RlcD1cIjUwMFwiIHZhbHVlPXtsb2NhbENvbmZpZy5zbWFydEZpeGVyLnBhdGhmaW5kaW5nTWF4Q2VsbHMgPz8gNjAwMH0gb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVTbWFydEZpeGVyKCdwYXRoZmluZGluZ01heENlbGxzJywgZS50YXJnZXQudmFsdWUpfSBjbGFzc05hbWU9XCJ3LTI0IHAtMSBib3JkZXIgcm91bmRlZCB0ZXh0LXJpZ2h0IHRleHQtc20gZm9udC1tb25vXCIgLz5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXJcIj5cbiAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cInRleHQtc20gdGV4dC1zbGF0ZS02MDBcIj5NYXggUm91dGluZyBEaXN0YW5jZSAobW0pPC9sYWJlbD5cbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBzdGVwPVwiNTAwXCIgdmFsdWU9e2xvY2FsQ29uZmlnLnNtYXJ0Rml4ZXIucGF0aGZpbmRpbmdNYXhEaXN0YW5jZSA/PyAxNTAwMH0gb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVTbWFydEZpeGVyKCdwYXRoZmluZGluZ01heERpc3RhbmNlJywgZS50YXJnZXQudmFsdWUpfSBjbGFzc05hbWU9XCJ3LTI0IHAtMSBib3JkZXIgcm91bmRlZCB0ZXh0LXJpZ2h0IHRleHQtc20gZm9udC1tb25vXCIgLz5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cblxuICAgICAgPC9kaXY+XG5cbiAgICAgIHsvKiBNYXRlcmlhbCAmIFNwZWMgRGF0YWJhc2UgKi99XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImJnLWFtYmVyLTUwIHAtNCByb3VuZGVkIGJvcmRlciBib3JkZXItYW1iZXItMjAwIHNoYWRvdy1zbSBtdC02XCI+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIG1iLTNcIj5cbiAgICAgICAgICA8aDMgY2xhc3NOYW1lPVwiZm9udC1ib2xkIHRleHQtYW1iZXItOTAwXCI+TWF0ZXJpYWwgJmFtcDsgU3BlYyBEYXRhYmFzZSAoU0tFWSBDcm9zcy1SZWZlcmVuY2UpPC9oMz5cbiAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTIgY3Vyc29yLXBvaW50ZXJcIj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQtc20gdGV4dC1zbGF0ZS02MDBcIj5FbmFibGUgU3BlYyBWYWxpZGF0aW9uPC9zcGFuPlxuICAgICAgICAgICAgPGlucHV0XG4gICAgICAgICAgICAgIHR5cGU9XCJjaGVja2JveFwiXG4gICAgICAgICAgICAgIGNoZWNrZWQ9e2xvY2FsQ29uZmlnLnNwZWNWYWxpZGF0aW9uRW5hYmxlZCA/PyBmYWxzZX1cbiAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiBzZXRMb2NhbENvbmZpZyhwcmV2ID0+ICh7IC4uLnByZXYsIHNwZWNWYWxpZGF0aW9uRW5hYmxlZDogZS50YXJnZXQuY2hlY2tlZCB9KSl9XG4gICAgICAgICAgICAgIGNsYXNzTmFtZT1cInctNCBoLTQgdGV4dC1hbWJlci02MDAgcm91bmRlZCBib3JkZXItZ3JheS0zMDBcIlxuICAgICAgICAgICAgLz5cbiAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPHAgY2xhc3NOYW1lPVwidGV4dC14cyB0ZXh0LWFtYmVyLTgwMCBtYi0zIGxlYWRpbmctcmVsYXhlZFwiPlxuICAgICAgICAgIFBhc3RlIGEgSlNPTiBvYmplY3QgbWFwcGluZyBTS0VZIGNvZGVzIHRvIHNwZWMgZW50cmllcy4gV2hlbiBlbmFibGVkLCBTUEVDLTAxIHRocm91Z2ggU1BFQy0wNCBydWxlc1xuICAgICAgICAgIHdpbGwgY3Jvc3MtcmVmZXJlbmNlIGVhY2ggY29tcG9uZW50IGFnYWluc3QgdGhpcyBkYXRhYmFzZSBhbmQgd2FybiBvbiB1bmtub3duIFNLRVlzLCB0eXBlIG1pc21hdGNoZXMsXG4gICAgICAgICAgYm9yZSBtaXNtYXRjaGVzLCBhbmQgbWF0ZXJpYWwgbWlzbWF0Y2hlcy5cbiAgICAgICAgPC9wPlxuICAgICAgICA8cCBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtc2xhdGUtNTAwIG1iLTIgZm9udC1tb25vXCI+XG4gICAgICAgICAge2B7IFwiRkwtV05SRi0zMDBcIjogeyBcInR5cGVcIjogXCJGTEFOR0VcIiwgXCJib3JlXCI6IDMwMCwgXCJkZXNjcmlwdGlvblwiOiBcIldOIFJGIEZsYW5nZSAzMDBuYlwiLCBcIm1hdGVyaWFsXCI6IFwiQVNUTSBBMTA1XCIgfSwgLi4uIH1gfVxuICAgICAgICA8L3A+XG4gICAgICAgIDx0ZXh0YXJlYVxuICAgICAgICAgIGNsYXNzTmFtZT1cInctZnVsbCBoLTQwIHAtMiBib3JkZXIgYm9yZGVyLWFtYmVyLTMwMCByb3VuZGVkIGZvbnQtbW9ubyB0ZXh0LXhzIGJnLXdoaXRlIHJlc2l6ZS15XCJcbiAgICAgICAgICBwbGFjZWhvbGRlcj17J3tcXG4gIFwiRkwtV05SRi0wMzAwXCI6IHsgXCJ0eXBlXCI6IFwiRkxBTkdFXCIsIFwiYm9yZVwiOiAzMDAsIFwiZGVzY3JpcHRpb25cIjogXCJXTiBSRiAzMDBuYlwiLCBcIm1hdGVyaWFsXCI6IFwiQVNUTSBBMTA1XCIgfVxcbn0nfVxuICAgICAgICAgIHZhbHVlPXtzcGVjRGJUZXh0fVxuICAgICAgICAgIG9uQ2hhbmdlPXsoZSkgPT4gc2V0U3BlY0RiVGV4dChlLnRhcmdldC52YWx1ZSl9XG4gICAgICAgICAgc3BlbGxDaGVjaz17ZmFsc2V9XG4gICAgICAgIC8+XG4gICAgICAgIHtzcGVjRGJFcnJvciAmJiAoXG4gICAgICAgICAgPHAgY2xhc3NOYW1lPVwidGV4dC14cyB0ZXh0LXJlZC02MDAgbXQtMSBmb250LXNlbWlib2xkXCI+SlNPTiBlcnJvcjoge3NwZWNEYkVycm9yfTwvcD5cbiAgICAgICAgKX1cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMyBtdC0yXCI+XG4gICAgICAgICAgPGJ1dHRvblxuICAgICAgICAgICAgb25DbGljaz17YXBwbHlTcGVjRGJ9XG4gICAgICAgICAgICBjbGFzc05hbWU9XCJweC0zIHB5LTEuNSB0ZXh0LXNtIGJnLWFtYmVyLTYwMCBob3ZlcjpiZy1hbWJlci03MDAgdGV4dC13aGl0ZSByb3VuZGVkIHRyYW5zaXRpb24gZm9udC1tZWRpdW1cIlxuICAgICAgICAgID5cbiAgICAgICAgICAgIEFwcGx5IFNwZWMgREJcbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtc2xhdGUtNTAwXCI+XG4gICAgICAgICAgICB7bG9jYWxDb25maWcuc3BlY0RhdGFiYXNlID8gYCR7T2JqZWN0LmtleXMobG9jYWxDb25maWcuc3BlY0RhdGFiYXNlKS5sZW5ndGh9IGVudHJpZXMgbG9hZGVkYCA6ICcwIGVudHJpZXMgbG9hZGVkJ31cbiAgICAgICAgICA8L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG5cbiAgICA8L2Rpdj5cbiAgKTtcbn1cbiJdLCJtYXBwaW5ncyI6IkFBQUEsT0FBT0EsS0FBSyxJQUFJQyxRQUFRLEVBQUVDLFdBQVcsUUFBUSxPQUFPO0FBQ3BELFNBQVNDLGFBQWEsUUFBUSx3QkFBd0I7QUFDdEQsU0FBU0MsT0FBTyxRQUFRLHVCQUF1QjtBQUFDLFNBQUFDLEdBQUEsSUFBQUMsSUFBQSxFQUFBQyxJQUFBLElBQUFDLEtBQUE7QUFFaEQsT0FBTyxTQUFTQyxTQUFTQSxDQUFBLEVBQUc7RUFDMUIsTUFBTTtJQUFFQyxLQUFLO0lBQUVDO0VBQVMsQ0FBQyxHQUFHUixhQUFhLENBQUMsQ0FBQztFQUMzQyxNQUFNLENBQUNTLFdBQVcsRUFBRUMsY0FBYyxDQUFDLEdBQUdaLFFBQVEsQ0FBQ1MsS0FBSyxDQUFDSSxNQUFNLENBQUM7RUFFNUQsTUFBTUMsVUFBVSxHQUFHQSxD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