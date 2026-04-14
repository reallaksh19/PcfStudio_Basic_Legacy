import React, { useState } from 'react';
import { useStore } from '/js/pcf-fixer-runtime/store/useStore.js';
import { useAppContext } from '/js/pcf-fixer-runtime/store/AppContext.js';
import { dbg } from '/js/pcf-fixer-runtime/utils/debugGate.js';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "/js/pcf-fixer-runtime/jsx-runtime.js";
const ToolGroup = ({
  title,
  shortTitle,
  children
}) => {
  const [collapsed, setCollapsed] = useState(false);
  if (collapsed) {
    return _jsx("div", {
      className: "flex flex-col border-r border-slate-700/50 pr-3 mr-3 last:border-0 last:mr-0 justify-center",
      children: _jsx("button", {
        onClick: () => setCollapsed(false),
        className: "px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded border border-slate-600 transition-colors h-full flex items-center justify-center",
        title: `Expand ${title}`,
        children: shortTitle
      })
    });
  }
  return _jsxs("div", {
    className: "flex flex-col border-r border-slate-700/50 pr-3 mr-3 last:border-0 last:mr-0",
    children: [_jsx("div", {
      className: "flex items-center gap-1 mb-1 justify-center",
      children: children
    }), _jsxs("div", {
      className: "flex items-center justify-center gap-1 mt-auto",
      children: [_jsx("span", {
        className: "text-[10px] text-slate-500 uppercase tracking-wider text-center font-semibold",
        children: title
      }), _jsx("button", {
        onClick: () => setCollapsed(true),
        className: "text-slate-500 hover:text-slate-300 transition-colors",
        title: "Collapse Group",
        children: _jsx("svg", {
          className: "w-3 h-3",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "2",
          children: _jsx("path", {
            d: "M15 18l-6-6 6-6"
          })
        })
      })]
    })]
  });
};
const ToolBtn = ({
  active,
  onClick,
  title,
  children,
  color = 'slate'
}) => {
  const base = "w-8 h-8 flex items-center justify-center rounded transition-colors duration-200 relative group";
  const colors = {
    slate: active ? "bg-slate-600 text-white shadow-inner" : "text-slate-400 hover:bg-slate-700 hover:text-slate-200",
    amber: active ? "bg-amber-600 text-white shadow-inner" : "text-amber-500 hover:bg-amber-900/50 hover:text-amber-400",
    emerald: active ? "bg-emerald-600 text-white shadow-inner" : "text-emerald-500 hover:bg-emerald-900/50 hover:text-emerald-400",
    red: active ? "bg-red-600 text-white shadow-inner" : "text-red-500 hover:bg-red-900/50 hover:text-red-400",
    blue: active ? "bg-blue-600 text-white shadow-inner" : "text-blue-500 hover:bg-blue-900/50 hover:text-blue-400",
    indigo: active ? "bg-indigo-600 text-white shadow-inner" : "text-indigo-500 hover:bg-indigo-900/50 hover:text-indigo-400"
  };
  return _jsx("button", {
    onClick: onClick,
    className: `${base} ${colors[color]}`,
    title: title,
    "data-testid": `toolbtn-${title.replace(/[^a-zA-Z]/g, '').toLowerCase()}`,
    children: children
  });
};
const TextBtn = ({
  onClick,
  title,
  label,
  color = 'slate'
}) => {
  const colors = {
    slate: "bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600",
    orange: "bg-orange-900/50 hover:bg-orange-800 text-orange-400 border-orange-800",
    red: "bg-red-900/50 hover:bg-red-800 text-red-400 border-red-800",
    blue: "bg-blue-900/50 hover:bg-blue-800 text-blue-400 border-blue-800"
  };
  return _jsx("button", {
    onClick: onClick,
    className: `px-2 py-1 text-[11px] font-medium rounded border transition ${colors[color]}`,
    title: title,
    children: label
  });
};
export function ToolbarRibbon({
  onFix6mm,
  onFix25mm,
  onAutoRef,
  onAutoCenter,
  onToggleSideInspector,
  showSideInspector,
  onPointerDown,
  onOverlapSolver
}) {
  const {
    canvasMode,
    setCanvasMode,
    orthoMode,
    toggleOrthoMode,
    multiSelectedIds,
    translucentMode,
    setTranslucentMode,
    colorMode,
    setColorMode,
    setDrawMode
  } = useStore();
  const {
    state,
    dispatch
  } = useAppContext();
  const showDrawCanvasIcon = state.config?.enableDrawCanvas !== false;
  const [activeTab, setActiveTab] = useState('TOOLS');
  const handleHide = () => {
    useStore.getState().hideSelected();
  };
  const handleIsolate = () => {
    useStore.getState().isolateSelected();
  };
  const handleDelete = () => {
    const {
      multiSelectedIds,
      selectedElementId,
      pushHistory,
      deleteElements
    } = useStore.getState();
    const idsToDelete = multiSelectedIds.length > 0 ? multiSelectedIds : selectedElementId ? [selectedElementId] : [];
    if (idsToDelete.length > 0) {
      if (window.confirm(`Delete ${idsToDelete.length} elements?`)) {
        pushHistory('Delete from Ribbon');
        dispatch({
          type: "DELETE_ELEMENTS",
          payload: {
            rowIndices: idsToDelete
          }
        });
        deleteElements(idsToDelete);
      }
    }
  };
  const handleResetView = () => {
    const store = useStore.getState();
    store.setHiddenElementIds([]);
    // Isolate uses hiddenElementIds internally, so unhiding all effectively removes isolation
    window.dispatchEvent(new CustomEvent('canvas-reset-view'));
  };
  const handleUndo = () => {
    useStore.getState().undo();
  };
  const tabs = ['FILE', 'ANALYSIS', 'VIEW', 'TOOLS', 'EXPORT'];
  return _jsxs("div", {
    className: "z-40 bg-slate-900/95 backdrop-blur border border-slate-700 rounded shadow-xl flex flex-col pointer-events-auto",
    children: [_jsx("div", {
      className: "flex items-center justify-between px-2 bg-slate-800/80 border-b border-slate-700/50 cursor-move",
      onPointerDown: e => {
        e.stopPropagation();
        onPointerDown && onPointerDown(e);
      },
      children: _jsx("div", {
        className: "flex gap-2 text-[10px] font-bold text-slate-400",
        children: tabs.map(tab => _jsx("button", {
          onPointerDown: e => e.stopPropagation(),
          onClick: e => {
            e.stopPropagation();
            setActiveTab(tab);
          },
          className: `px-3 py-1.5 transition-colors border-b-2 ${activeTab === tab ? 'text-blue-400 border-blue-500 bg-slate-800' : 'border-transparent hover:text-slate-200 hover:bg-slate-700'}`,
          children: tab
        }, tab))
      })
    }), _jsxs("div", {
      className: "flex items-start px-2 py-2 gap-2 overflow-x-auto custom-scrollbar min-h-[70px] w-full max-w-full",
      onPointerDown: e => e.stopPropagation(),
      children: [activeTab === 'FILE' && _jsx("div", {
        className: "flex shrink-0",
        children: _jsx(ToolGroup, {
          title: "Config",
          shortTitle: "CFG",
          children: _jsx(ToolBtn, {
            onClick: () => useStore.getState().setShowSettings(true),
            title: "Settings",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("circle", {
                cx: "12",
                cy: "12",
                r: "3"
              }), _jsx("path", {
                d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
              })]
            })
          })
        })
      }), activeTab === 'ANALYSIS' && _jsxs("div", {
        className: "flex shrink-0",
        children: [_jsx(ToolGroup, {
          title: "Auto Fixes",
          shortTitle: "FIX",
          children: _jsxs("div", {
            className: "flex gap-2",
            children: [_jsx(TextBtn, {
              onClick: onFix6mm,
              color: "orange",
              label: "Fix 6mm",
              title: "Auto-close all gaps \u2264 6mm"
            }), _jsx(TextBtn, {
              onClick: onFix25mm,
              color: "red",
              label: "Fix 25mm",
              title: "Insert pipe spool for gaps 6-25mm"
            }), _jsx(TextBtn, {
              onClick: onAutoRef,
              color: "blue",
              label: "Auto Pipe Ref",
              title: "Auto-assign Pipeline Refs to blank components on branch"
            }), _jsx(TextBtn, {
              onClick: onOverlapSolver,
              color: "purple",
              label: "Overlap Solver",
              title: "Trim pipes overlapping with rigid fittings"
            })]
          })
        }), _jsx(ToolGroup, {
          title: "Visuals",
          shortTitle: "VIS",
          children: _jsx(ToolBtn, {
            active: useStore.getState().showGapRadar,
            onClick: () => useStore.getState().setShowGapRadar(!useStore.getState().showGapRadar),
            color: "amber",
            title: "Toggle Gap Radar",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("circle", {
                cx: "12",
                cy: "12",
                r: "10"
              }), _jsx("circle", {
                cx: "12",
                cy: "12",
                r: "6"
              }), _jsx("circle", {
                cx: "12",
                cy: "12",
                r: "2"
              })]
            })
          })
        })]
      }), activeTab === 'VIEW' && _jsxs("div", {
        className: "flex shrink-0",
        children: [_jsxs(ToolGroup, {
          title: "Navigation",
          shortTitle: "NAV",
          children: [_jsx(ToolBtn, {
            onClick: handleResetView,
            title: "Home / Reset View",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("path", {
                d: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
              }), _jsx("polyline", {
                points: "9 22 9 12 15 12 15 22"
              })]
            })
          }), _jsx(ToolBtn, {
            onClick: () => window.dispatchEvent(new CustomEvent('canvas-auto-center')),
            title: "Zoom to Fit",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("path", {
                d: "M4 14v4a2 2 0 0 0 2 2h4"
              }), _jsx("path", {
                d: "M20 10V6a2 2 0 0 0-2-2h-4"
              }), _jsx("path", {
                d: "M14 20h4a2 2 0 0 0 2-2v-4"
              }), _jsx("path", {
                d: "M4 10V6a2 2 0 0 1 2-2h4"
              }), _jsx("circle", {
                cx: "12",
                cy: "12",
                r: "2"
              })]
            })
          }), _jsx(ToolBtn, {
            active: !useStore.getState().orthoMode,
            onClick: () => useStore.getState().toggleOrthoMode(),
            color: "blue",
            title: "Toggle Perspective / Orthographic (O)",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("polygon", {
                points: "12 2 2 7 12 12 22 7 12 2"
              }), _jsx("polyline", {
                points: "2 17 12 22 22 17"
              }), _jsx("polyline", {
                points: "2 12 12 17 22 12"
              })]
            })
          })]
        }), _jsxs(ToolGroup, {
          title: "Visibility",
          shortTitle: "VIS",
          children: [_jsx(ToolBtn, {
            active: useStore.getState().hiddenElementIds.length > 0,
            onClick: () => useStore.getState().unhideAll(),
            color: "emerald",
            title: "Show All Components (U)",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("path", {
                d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
              }), _jsx("circle", {
                cx: "12",
                cy: "12",
                r: "3"
              })]
            })
          }), _jsx(ToolBtn, {
            active: false,
            onClick: () => useStore.getState().isolateSelected(),
            color: "amber",
            title: "Isolate Selected (H)",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("path", {
                d: "M21 12H3"
              }), _jsx("path", {
                d: "M12 21V3"
              })]
            })
          }), _jsx("div", {
            className: "w-px h-6 bg-slate-700 mx-1 self-center"
          }), _jsx(ToolBtn, {
            active: useStore.getState().translucentMode,
            onClick: () => useStore.getState().setTranslucentMode(!useStore.getState().translucentMode),
            color: "blue",
            title: "Toggle Translucent View",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              strokeLinecap: "round",
              strokeLinejoin: "round",
              children: [_jsx("path", {
                d: "m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"
              }), _jsx("path", {
                d: "M5 3v4"
              }), _jsx("path", {
                d: "M19 17v4"
              }), _jsx("path", {
                d: "M3 5h4"
              }), _jsx("path", {
                d: "M17 19h4"
              })]
            })
          })]
        }), _jsx(ToolGroup, {
          title: "Shading",
          shortTitle: "SHADE",
          children: _jsxs("select", {
            value: colorMode,
            onChange: e => setColorMode(e.target.value),
            onKeyDown: e => {
              if (e.key === 'Escape') {
                setColorMode('');
                e.target.blur();
              }
            },
            className: "h-7 bg-slate-700 text-slate-300 text-[11px] rounded border border-slate-600 px-2 outline-none focus:border-indigo-500 cursor-pointer w-32",
            children: [_jsx("option", {
              value: "",
              children: "None (Default)"
            }), _jsx("option", {
              value: "TYPE",
              children: "Color by Type"
            }), _jsx("option", {
              value: "SPOOL",
              children: "Color by Spool"
            }), _jsx("option", {
              value: "PIPELINE_REF",
              children: "Color by Pipeline Ref"
            }), _jsx("option", {
              value: "ERROR",
              children: "Color by Error"
            }), _jsx("option", {
              value: "LINENO_KEY",
              children: "Color by LineNo Key"
            }), _jsx("option", {
              value: "RATING",
              children: "Color by Rating"
            }), _jsx("option", {
              value: "PIPING_CLASS",
              children: "Color by Piping Class"
            }), [97, 98, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => _jsxs("option", {
              value: `CA${n}`,
              children: ["Color by CA", n]
            }, `ca${n}`))]
          })
        }), _jsxs(ToolGroup, {
          title: "Labels",
          shortTitle: "LBL",
          children: [_jsx(ToolBtn, {
            active: useStore.getState().showRowLabels,
            onClick: () => {
              const current = useStore.getState().showRowLabels;
              useStore.getState().setShowRowLabels(!current);
              if (!current) useStore.getState().setTranslucentMode(true);
            },
            color: "amber",
            title: "Toggle Row No. (R)",
            children: _jsx("div", {
              className: "font-bold text-xs",
              children: "R"
            })
          }), _jsx(ToolBtn, {
            active: useStore.getState().showRefLabels,
            onClick: () => {
              const current = useStore.getState().showRefLabels;
              useStore.getState().setShowRefLabels(!current);
              if (!current) useStore.getState().setTranslucentMode(true);
            },
            color: "blue",
            title: "Toggle Pipeline Ref",
            children: _jsx("div", {
              className: "font-bold text-[10px]",
              children: "Ref"
            })
          })]
        })]
      }), activeTab === 'TOOLS' && _jsxs("div", {
        className: "flex shrink-0",
        children: [_jsxs(ToolGroup, {
          title: "Select / Modify",
          children: [showDrawCanvasIcon && _jsxs(_Fragment, {
            children: [_jsx(ToolBtn, {
              onClick: () => setDrawMode(true),
              color: "indigo",
              title: "Open Draw Canvas",
              children: _jsxs("svg", {
                className: "w-4 h-4",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2",
                children: [_jsx("path", {
                  d: "M12 20h9"
                }), _jsx("path", {
                  d: "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                })]
              })
            }), _jsx("div", {
              className: "w-px h-6 bg-slate-700 mx-1 self-center"
            })]
          }), _jsx(ToolBtn, {
            active: canvasMode === 'MARQUEE_SELECT',
            onClick: () => {
              const next = canvasMode === 'MARQUEE_SELECT' ? 'VIEW' : 'MARQUEE_SELECT';
              dbg.tool('MARQUEE_SELECT', `Button clicked → ${next}`);
              setCanvasMode(next);
            },
            color: "blue",
            title: "Box Select",
            children: _jsx("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: _jsx("rect", {
                x: "3",
                y: "3",
                width: "18",
                height: "18",
                rx: "2",
                ry: "2",
                strokeDasharray: "4 4"
              })
            })
          }), _jsx(ToolBtn, {
            active: canvasMode === 'MARQUEE_ZOOM',
            onClick: () => {
              const next = canvasMode === 'MARQUEE_ZOOM' ? 'VIEW' : 'MARQUEE_ZOOM';
              dbg.tool('MARQUEE_ZOOM', `Button clicked → ${next}`);
              setCanvasMode(next);
            },
            color: "indigo",
            title: "Box Zoom",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("circle", {
                cx: "11",
                cy: "11",
                r: "8"
              }), _jsx("line", {
                x1: "21",
                y1: "21",
                x2: "16.65",
                y2: "16.65"
              }), _jsx("rect", {
                x: "8",
                y: "8",
                width: "6",
                height: "6",
                strokeDasharray: "2 2"
              })]
            })
          }), _jsx("div", {
            className: "w-px h-6 bg-slate-700 mx-1 self-center"
          }), _jsx(ToolBtn, {
            onClick: handleDelete,
            color: "red",
            title: "Delete Selected (Del)",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("path", {
                d: "M3 6h18"
              }), _jsx("path", {
                d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
              }), _jsx("line", {
                x1: "10",
                y1: "11",
                x2: "10",
                y2: "17"
              }), _jsx("line", {
                x1: "14",
                y1: "11",
                x2: "14",
                y2: "17"
              })]
            })
          })]
        }), _jsxs(ToolGroup, {
          title: "Edit Modes",
          shortTitle: "EDIT",
          children: [_jsx(ToolBtn, {
            active: canvasMode === 'CONNECT',
            onClick: () => {
              const next = canvasMode === 'CONNECT' ? 'VIEW' : 'CONNECT';
              dbg.tool('CONNECT', `Button clicked → ${next}`);
              setCanvasMode(next);
            },
            color: "amber",
            title: "Connect (C)",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("path", {
                d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
              }), _jsx("path", {
                d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
              })]
            })
          }), _jsx(ToolBtn, {
            active: canvasMode === 'STRETCH',
            onClick: () => {
              const next = canvasMode === 'STRETCH' ? 'VIEW' : 'STRETCH';
              dbg.tool('STRETCH', `Button clicked → ${next}`);
              setCanvasMode(next);
            },
            color: "emerald",
            title: "Stretch (T)",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("path", {
                d: "M5 12h14"
              }), _jsx("path", {
                d: "M15 16l4-4-4-4"
              }), _jsx("path", {
                d: "M9 8l-4 4 4 4"
              })]
            })
          }), _jsx(ToolBtn, {
            active: canvasMode === 'BREAK',
            onClick: () => {
              const next = canvasMode === 'BREAK' ? 'VIEW' : 'BREAK';
              dbg.tool('BREAK', `Button clicked → ${next}`);
              setCanvasMode(next);
            },
            color: "red",
            title: "Break (B)",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("circle", {
                cx: "6",
                cy: "6",
                r: "3"
              }), _jsx("circle", {
                cx: "6",
                cy: "18",
                r: "3"
              }), _jsx("line", {
                x1: "20",
                y1: "4",
                x2: "8.12",
                y2: "15.88"
              }), _jsx("line", {
                x1: "14.47",
                y1: "14.48",
                x2: "20",
                y2: "20"
              }), _jsx("line", {
                x1: "8.12",
                y1: "8.12",
                x2: "12",
                y2: "12"
              })]
            })
          }), _jsx(ToolBtn, {
            active: canvasMode === 'MEASURE',
            onClick: () => {
              const next = canvasMode === 'MEASURE' ? 'VIEW' : 'MEASURE';
              dbg.tool('MEASURE', `Button clicked → ${next}`);
              setCanvasMode(next);
            },
            color: "amber",
            title: "Measure (M)",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("path", {
                d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 1 0 2.829 2.828z"
              }), _jsx("path", {
                d: "m6.3 14.5-4 4"
              }), _jsx("path", {
                d: "m16 5.3-4 4"
              })]
            })
          }), _jsx("div", {
            className: "w-px h-6 bg-slate-700 mx-1 self-center"
          }), _jsx(ToolBtn, {
            active: useStore.getState().clippingPlaneEnabled,
            onClick: () => {
              dbg.tool('CLIPPING_PLANE', `Button clicked → ${!useStore.getState().clippingPlaneEnabled}`);
              useStore.getState().setClippingPlaneEnabled(!useStore.getState().clippingPlaneEnabled);
            },
            color: "slate",
            title: "Toggle Section Box",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("path", {
                d: "M12 3v18"
              }), _jsx("path", {
                d: "M3 12h18"
              }), _jsx("path", {
                d: "M3 3h18v18H3z"
              })]
            })
          }), _jsx(ToolBtn, {
            active: canvasMode === 'INSERT_SUPPORT',
            onClick: () => {
              const next = canvasMode === 'INSERT_SUPPORT' ? 'VIEW' : 'INSERT_SUPPORT';
              dbg.tool('INSERT_SUPPORT', `Button clicked → ${next}`);
              setCanvasMode(next);
            },
            color: "emerald",
            title: "Insert Support (I)",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("path", {
                d: "M12 22V8"
              }), _jsx("path", {
                d: "M8 8h8"
              }), _jsx("path", {
                d: "M12 8l-3 -6h6z"
              })]
            })
          }), _jsx(ToolBtn, {
            active: canvasMode === 'ASSIGN_PIPELINE',
            onClick: () => {
              const next = canvasMode === 'ASSIGN_PIPELINE' ? 'VIEW' : 'ASSIGN_PIPELINE';
              dbg.tool('ASSIGN_PIPELINE', `Button clicked → ${next}`);
              setCanvasMode(next);
            },
            color: "blue",
            title: "Assign Pipeline Ref",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("path", {
                d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
              }), _jsx("polyline", {
                points: "7 10 12 15 17 10"
              }), _jsx("line", {
                x1: "12",
                y1: "15",
                x2: "12",
                y2: "3"
              })]
            })
          })]
        }), _jsx(ToolGroup, {
          title: "Panels",
          shortTitle: "PANELS",
          children: _jsx(ToolBtn, {
            active: useStore.getState().showSideInspector,
            onClick: () => useStore.getState().setShowSideInspector(!useStore.getState().showSideInspector),
            title: "Toggle Side Panel",
            children: _jsxs("svg", {
              className: "w-4 h-4",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: [_jsx("rect", {
                x: "3",
                y: "3",
                width: "18",
                height: "18",
                rx: "2",
                ry: "2"
              }), _jsx("line", {
                x1: "15",
                y1: "3",
                x2: "15",
                y2: "21"
              })]
            })
          })
        })]
      }), activeTab === 'EXPORT' && _jsx("div", {
        className: "flex shrink-0",
        children: _jsx(ToolGroup, {
          title: "Export Data",
          shortTitle: "EXP",
          children: _jsx(TextBtn, {
            onClick: () => {},
            color: "slate",
            label: "Export PCF",
            title: "Export current model to PCF format"
          })
        })
      })]
    })]
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsInVzZVN0YXRlIiwidXNlU3RvcmUiLCJ1c2VBcHBDb250ZXh0IiwiZGJnIiwianN4IiwiX2pzeCIsImpzeHMiLCJfanN4cyIsIkZyYWdtZW50IiwiX0ZyYWdtZW50IiwiVG9vbEdyb3VwIiwidGl0bGUiLCJzaG9ydFRpdGxlIiwiY2hpbGRyZW4iLCJjb2xsYXBzZWQiLCJzZXRDb2xsYXBzZWQiLCJjbGFzc05hbWUiLCJvbkNsaWNrIiwidmlld0JveCIsImZpbGwiLCJzdHJva2UiLCJzdHJva2VXaWR0aCIsImQiLCJUb29sQnRuIiwiYWN0aXZlIiwiY29sb3IiLCJiYXNlIiwiY29sb3JzIiwic2xhdGUiLCJhbWJlciIsImVtZXJhbGQiLCJyZWQiLCJibHVlIiwiaW5kaWdvIiwicmVwbGFjZSIsInRvTG93ZXJDYXNlIiwiVGV4dEJ0biIsImxhYmVsIiwib3JhbmdlIiwiVG9vbGJhclJpYmJvbiIsIm9uRml4Nm1tIiwib25GaXgyNW1tIiwib25BdXRvUmVmIiwib25BdXRvQ2VudGVyIiwib25Ub2dnbGVTaWRlSW5zcGVjdG9yIiwic2hvd1NpZGVJbnNwZWN0b3IiLCJvblBvaW50ZXJEb3duIiwib25PdmVybGFwU29sdmVyIiwiY2FudmFzTW9kZSIsInNldENhbnZhc01vZGUiLCJvcnRob01vZGUiLCJ0b2dnbGVPcnRob01vZGUiLCJtdWx0aVNlbGVjdGVkSWRzIiwidHJhbnNsdWNlbnRNb2RlIiwic2V0VHJhbnNsdWNlbnRNb2RlIiwiY29sb3JNb2RlIiwic2V0Q29sb3JNb2RlIiwic2V0RHJhd01vZGUiLCJzdGF0ZSIsImRpc3BhdGNoIiwic2hvd0RyYXdDYW52YXNJY29uIiwiY29uZmlnIiwiZW5hYmxlRHJhd0NhbnZhcyIsImFjdGl2ZVRhYiIsInNldEFjdGl2ZVRhYiIsImhhbmRsZUhpZGUiLCJnZXRTdGF0ZSIsImhpZGVTZWxlY3RlZCIsImhhbmRsZUlzb2xhdGUiLCJpc29sYXRlU2VsZWN0ZWQiLCJoYW5kbGVEZWxldGUiLCJzZWxlY3RlZEVsZW1lbnRJZCIsInB1c2hIaXN0b3J5IiwiZGVsZXRlRWxlbWVudHMiLCJpZHNUb0RlbGV0ZSIsImxlbmd0aCIsIndpbmRvdyIsImNvbmZpcm0iLCJ0eXBlIiwicGF5bG9hZCIsInJvd0luZGljZXMiLCJoYW5kbGVSZXNldFZpZXciLCJzdG9yZSIsInNldEhpZGRlbkVsZW1lbnRJZHMiLCJkaXNwYXRjaEV2ZW50IiwiQ3VzdG9tRXZlbnQiLCJoYW5kbGVVbmRvIiwidW5kbyIsInRhYnMiLCJlIiwic3RvcFByb3BhZ2F0aW9uIiwibWFwIiwidGFiIiwic2V0U2hvd1NldHRpbmdzIiwiY3giLCJjeSIsInIiLCJzaG93R2FwUmFkYXIiLCJzZXRTaG93R2FwUmFkYXIiLCJwb2ludHMiLCJoaWRkZW5FbGVtZW50SWRzIiwidW5oaWRlQWxsIiwic3Ryb2tlTGluZWNhcCIsInN0cm9rZUxpbmVqb2luIiwidmFsdWUiLCJvbkNoYW5nZSIsInRhcmdldCIsIm9uS2V5RG93biIsImtleSIsImJsdXIiLCJuIiwic2hvd1Jvd0xhYmVscyIsImN1cnJlbnQiLCJzZXRTaG93Um93TGFiZWxzIiwic2hvd1JlZkxhYmVscyIsInNldFNob3dSZWZMYWJlbHMiLCJuZXh0IiwidG9vbCIsIngiLCJ5Iiwid2lkdGgiLCJoZWlnaHQiLCJyeCIsInJ5Iiwic3Ryb2tlRGFzaGFycmF5IiwieDEiLCJ5MSIsIngyIiwieTIiLCJjbGlwcGluZ1BsYW5lRW5hYmxlZCIsInNldENsaXBwaW5nUGxhbmVFbmFibGVkIiwic2V0U2hvd1NpZGVJbnNwZWN0b3IiXSwic291cmNlcyI6WyJUb29sYmFyUmliYm9uLmpzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUmVhY3QsIHsgdXNlU3RhdGUgfSBmcm9tICdyZWFjdCc7XG5pbXBvcnQgeyB1c2VTdG9yZSB9IGZyb20gJy4uLy4uL3N0b3JlL3VzZVN0b3JlJztcbmltcG9ydCB7IHVzZUFwcENvbnRleHQgfSBmcm9tICcuLi8uLi9zdG9yZS9BcHBDb250ZXh0JztcbmltcG9ydCB7IGRiZyB9IGZyb20gJy4uLy4uL3V0aWxzL2RlYnVnR2F0ZSc7XG5cbmNvbnN0IFRvb2xHcm91cCA9ICh7IHRpdGxlLCBzaG9ydFRpdGxlLCBjaGlsZHJlbiB9KSA9PiB7XG4gICAgY29uc3QgW2NvbGxhcHNlZCwgc2V0Q29sbGFwc2VkXSA9IHVzZVN0YXRlKGZhbHNlKTtcbiAgICBpZiAoY29sbGFwc2VkKSB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC1jb2wgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTcwMC81MCBwci0zIG1yLTMgbGFzdDpib3JkZXItMCBsYXN0Om1yLTAganVzdGlmeS1jZW50ZXJcIj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IHNldENvbGxhcHNlZChmYWxzZSl9IGNsYXNzTmFtZT1cInB4LTIgcHktMSBiZy1zbGF0ZS04MDAgaG92ZXI6Ymctc2xhdGUtNzAwIHRleHQtc2xhdGUtMzAwIHRleHQtWzEwcHhdIGZvbnQtYm9sZCByb3VuZGVkIGJvcmRlciBib3JkZXItc2xhdGUtNjAwIHRyYW5zaXRpb24tY29sb3JzIGgtZnVsbCBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlclwiIHRpdGxlPXtgRXhwYW5kICR7dGl0bGV9YH0+XG4gICAgICAgICAgICAgICAgICAgIHtzaG9ydFRpdGxlfVxuICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBmbGV4LWNvbCBib3JkZXItciBib3JkZXItc2xhdGUtNzAwLzUwIHByLTMgbXItMyBsYXN0OmJvcmRlci0wIGxhc3Q6bXItMFwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMSBtYi0xIGp1c3RpZnktY2VudGVyXCI+e2NoaWxkcmVufTwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBnYXAtMSBtdC1hdXRvXCI+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gdGV4dC1zbGF0ZS01MDAgdXBwZXJjYXNlIHRyYWNraW5nLXdpZGVyIHRleHQtY2VudGVyIGZvbnQtc2VtaWJvbGRcIj57dGl0bGV9PC9zcGFuPlxuICAgICAgICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4gc2V0Q29sbGFwc2VkKHRydWUpfSBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTUwMCBob3Zlcjp0ZXh0LXNsYXRlLTMwMCB0cmFuc2l0aW9uLWNvbG9yc1wiIHRpdGxlPVwiQ29sbGFwc2UgR3JvdXBcIj5cbiAgICAgICAgICAgICAgICAgICAgPHN2ZyBjbGFzc05hbWU9XCJ3LTMgaC0zXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIyXCI+PHBhdGggZD1cIk0xNSAxOGwtNi02IDYtNlwiLz48L3N2Zz5cbiAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICApO1xufTtcblxuY29uc3QgVG9vbEJ0biA9ICh7IGFjdGl2ZSwgb25DbGljaywgdGl0bGUsIGNoaWxkcmVuLCBjb2xvciA9ICdzbGF0ZScgfSkgPT4ge1xuICAgIGNvbnN0IGJhc2UgPSBcInctOCBoLTggZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgcm91bmRlZCB0cmFuc2l0aW9uLWNvbG9ycyBkdXJhdGlvbi0yMDAgcmVsYXRpdmUgZ3JvdXBcIjtcbiAgICBjb25zdCBjb2xvcnMgPSB7XG4gICAgICAgIHNsYXRlOiBhY3RpdmUgPyBcImJnLXNsYXRlLTYwMCB0ZXh0LXdoaXRlIHNoYWRvdy1pbm5lclwiIDogXCJ0ZXh0LXNsYXRlLTQwMCBob3ZlcjpiZy1zbGF0ZS03MDAgaG92ZXI6dGV4dC1zbGF0ZS0yMDBcIixcbiAgICAgICAgYW1iZXI6IGFjdGl2ZSA/IFwiYmctYW1iZXItNjAwIHRleHQtd2hpdGUgc2hhZG93LWlubmVyXCIgOiBcInRleHQtYW1iZXItNTAwIGhvdmVyOmJnLWFtYmVyLTkwMC81MCBob3Zlcjp0ZXh0LWFtYmVyLTQwMFwiLFxuICAgICAgICBlbWVyYWxkOiBhY3RpdmUgPyBcImJnLWVtZXJhbGQtNjAwIHRleHQtd2hpdGUgc2hhZG93LWlubmVyXCIgOiBcInRleHQtZW1lcmFsZC01MDAgaG92ZXI6YmctZW1lcmFsZC05MDAvNTAgaG92ZXI6dGV4dC1lbWVyYWxkLTQwMFwiLFxuICAgICAgICByZWQ6IGFjdGl2ZSA/IFwiYmctcmVkLTYwMCB0ZXh0LXdoaXRlIHNoYWRvdy1pbm5lclwiIDogXCJ0ZXh0LXJlZC01MDAgaG92ZXI6YmctcmVkLTkwMC81MCBob3Zlcjp0ZXh0LXJlZC00MDBcIixcbiAgICAgICAgYmx1ZTogYWN0aXZlID8gXCJiZy1ibHVlLTYwMCB0ZXh0LXdoaXRlIHNoYWRvdy1pbm5lclwiIDogXCJ0ZXh0LWJsdWUtNTAwIGhvdmVyOmJnLWJsdWUtOTAwLzUwIGhvdmVyOnRleHQtYmx1ZS00MDBcIixcbiAgICAgICAgaW5kaWdvOiBhY3RpdmUgPyBcImJnLWluZGlnby02MDAgdGV4dC13aGl0ZSBzaGFkb3ctaW5uZXJcIiA6IFwidGV4dC1pbmRpZ28tNTAwIGhvdmVyOmJnLWluZGlnby05MDAvNTAgaG92ZXI6dGV4dC1pbmRpZ28tNDAwXCIsXG4gICAgfTtcbiAgICByZXR1cm4gKFxuICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e29uQ2xpY2t9IGNsYXNzTmFtZT17YCR7YmFzZX0gJHtjb2xvcnNbY29sb3JdfWB9IHRpdGxlPXt0aXRsZX0gZGF0YS10ZXN0aWQ9e2B0b29sYnRuLSR7dGl0bGUucmVwbGFjZSgvW15hLXpBLVpdL2csICcnKS50b0xvd2VyQ2FzZSgpfWB9PlxuICAgICAgICAgICAge2NoaWxkcmVufVxuICAgICAgICA8L2J1dHRvbj5cbiAgICApO1xufTtcblxuY29uc3QgVGV4dEJ0biA9ICh7IG9uQ2xpY2ssIHRpdGxlLCBsYWJlbCwgY29sb3IgPSAnc2xhdGUnIH0pID0+IHtcbiAgICBjb25zdCBjb2xvcnMgPSB7XG4gICAgICAgIHNsYXRlOiBcImJnLXNsYXRlLTcwMCBob3ZlcjpiZy1zbGF0ZS02MDAgdGV4dC1zbGF0ZS0yMDAgYm9yZGVyLXNsYXRlLTYwMFwiLFxuICAgICAgICBvcmFuZ2U6IFwiYmctb3JhbmdlLTkwMC81MCBob3ZlcjpiZy1vcmFuZ2UtODAwIHRleHQtb3JhbmdlLTQwMCBib3JkZXItb3JhbmdlLTgwMFwiLFxuICAgICAgICByZWQ6IFwiYmctcmVkLTkwMC81MCBob3ZlcjpiZy1yZWQtODAwIHRleHQtcmVkLTQwMCBib3JkZXItcmVkLTgwMFwiLFxuICAgICAgICBibHVlOiBcImJnLWJsdWUtOTAwLzUwIGhvdmVyOmJnLWJsdWUtODAwIHRleHQtYmx1ZS00MDAgYm9yZGVyLWJsdWUtODAwXCIsXG4gICAgfTtcbiAgICByZXR1cm4gKFxuICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e29uQ2xpY2t9IGNsYXNzTmFtZT17YHB4LTIgcHktMSB0ZXh0LVsxMXB4XSBmb250LW1lZGl1bSByb3VuZGVkIGJvcmRlciB0cmFuc2l0aW9uICR7Y29sb3JzW2NvbG9yXX1gfSB0aXRsZT17dGl0bGV9PlxuICAgICAgICAgICAge2xhYmVsfVxuICAgICAgICA8L2J1dHRvbj5cbiAgICApO1xufTtcblxuXG5cbmV4cG9ydCBmdW5jdGlvbiBUb29sYmFyUmliYm9uKHsgb25GaXg2bW0sIG9uRml4MjVtbSwgb25BdXRvUmVmLCBvbkF1dG9DZW50ZXIsIG9uVG9nZ2xlU2lkZUluc3BlY3Rvciwgc2hvd1NpZGVJbnNwZWN0b3IsIG9uUG9pbnRlckRvd24sIG9uT3ZlcmxhcFNvbHZlciB9KSB7XG4gICAgY29uc3QgeyBjYW52YXNNb2RlLCBzZXRDYW52YXNNb2RlLCBvcnRob01vZGUsIHRvZ2dsZU9ydGhvTW9kZSwgbXVsdGlTZWxlY3RlZElkcywgdHJhbnNsdWNlbnRNb2RlLCBzZXRUcmFuc2x1Y2VudE1vZGUsIGNvbG9yTW9kZSwgc2V0Q29sb3JNb2RlLCBzZXREcmF3TW9kZSB9ID0gdXNlU3RvcmUoKTtcbiAgICBjb25zdCB7IHN0YXRlLCBkaXNwYXRjaCB9ID0gdXNlQXBwQ29udGV4dCgpO1xuICAgIGNvbnN0IHNob3dEcmF3Q2FudmFzSWNvbiA9IHN0YXRlLmNvbmZpZz8uZW5hYmxlRHJhd0NhbnZhcyAhPT0gZmFsc2U7XG4gICAgY29uc3QgW2FjdGl2ZVRhYiwgc2V0QWN0aXZlVGFiXSA9IHVzZVN0YXRlKCdUT09MUycpO1xuXG4gICAgY29uc3QgaGFuZGxlSGlkZSA9ICgpID0+IHtcbiAgICAgICAgdXNlU3RvcmUuZ2V0U3RhdGUoKS5oaWRlU2VsZWN0ZWQoKTtcbiAgICB9O1xuXG4gICAgY29uc3QgaGFuZGxlSXNvbGF0ZSA9ICgpID0+IHtcbiAgICAgICAgdXNlU3RvcmUuZ2V0U3RhdGUoKS5pc29sYXRlU2VsZWN0ZWQoKTtcbiAgICB9O1xuXG4gICAgY29uc3QgaGFuZGxlRGVsZXRlID0gKCkgPT4ge1xuICAgICAgICBjb25zdCB7IG11bHRpU2VsZWN0ZWRJZHMsIHNlbGVjdGVkRWxlbWVudElkLCBwdXNoSGlzdG9yeSwgZGVsZXRlRWxlbWVudHMgfSA9IHVzZVN0b3JlLmdldFN0YXRlKCk7XG4gICAgICAgIGNvbnN0IGlkc1RvRGVsZXRlID0gbXVsdGlTZWxlY3RlZElkcy5sZW5ndGggPiAwID8gbXVsdGlTZWxlY3RlZElkcyA6IChzZWxlY3RlZEVsZW1lbnRJZCA/IFtzZWxlY3RlZEVsZW1lbnRJZF0gOiBbXSk7XG5cbiAgICAgICAgaWYgKGlkc1RvRGVsZXRlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGlmICh3aW5kb3cuY29uZmlybShgRGVsZXRlICR7aWRzVG9EZWxldGUubGVuZ3RofSBlbGVtZW50cz9gKSkge1xuICAgICAgICAgICAgICAgIHB1c2hIaXN0b3J5KCdEZWxldGUgZnJvbSBSaWJib24nKTtcbiAgICAgICAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiREVMRVRFX0VMRU1FTlRTXCIsIHBheWxvYWQ6IHsgcm93SW5kaWNlczogaWRzVG9EZWxldGUgfSB9KTtcbiAgICAgICAgICAgICAgICBkZWxldGVFbGVtZW50cyhpZHNUb0RlbGV0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgY29uc3QgaGFuZGxlUmVzZXRWaWV3ID0gKCkgPT4ge1xuICAgICAgICBjb25zdCBzdG9yZSA9IHVzZVN0b3JlLmdldFN0YXRlKCk7XG4gICAgICAgIHN0b3JlLnNldEhpZGRlbkVsZW1lbnRJZHMoW10pO1xuICAgICAgICAvLyBJc29sYXRlIHVzZXMgaGlkZGVuRWxlbWVudElkcyBpbnRlcm5hbGx5LCBzbyB1bmhpZGluZyBhbGwgZWZmZWN0aXZlbHkgcmVtb3ZlcyBpc29sYXRpb25cbiAgICAgICAgd2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KCdjYW52YXMtcmVzZXQtdmlldycpKTtcbiAgICB9O1xuXG4gICAgY29uc3QgaGFuZGxlVW5kbyA9ICgpID0+IHtcbiAgICAgICAgdXNlU3RvcmUuZ2V0U3RhdGUoKS51bmRvKCk7XG4gICAgfTtcblxuICAgIGNvbnN0IHRhYnMgPSBbJ0ZJTEUnLCAnQU5BTFlTSVMnLCAnVklFVycsICdUT09MUycsICdFWFBPUlQnXTtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiei00MCBiZy1zbGF0ZS05MDAvOTUgYmFja2Ryb3AtYmx1ciBib3JkZXIgYm9yZGVyLXNsYXRlLTcwMCByb3VuZGVkIHNoYWRvdy14bCBmbGV4IGZsZXgtY29sIHBvaW50ZXItZXZlbnRzLWF1dG9cIj5cbiAgICAgICAgICAgIHsvKiBRdWljayBBY2Nlc3MgVG9vbGJhciAmIFRhYnMgKi99XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBweC0yIGJnLXNsYXRlLTgwMC84MCBib3JkZXItYiBib3JkZXItc2xhdGUtNzAwLzUwIGN1cnNvci1tb3ZlXCIgb25Qb2ludGVyRG93bj17KGUpID0+IHsgZS5zdG9wUHJvcGFnYXRpb24oKTsgb25Qb2ludGVyRG93biAmJiBvblBvaW50ZXJEb3duKGUpOyB9fT5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZ2FwLTIgdGV4dC1bMTBweF0gZm9udC1ib2xkIHRleHQtc2xhdGUtNDAwXCI+XG4gICAgICAgICAgICAgICAgICAgIHt0YWJzLm1hcCh0YWIgPT4gKFxuICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGtleT17dGFifVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9uUG9pbnRlckRvd249eyhlKSA9PiBlLnN0b3BQcm9wYWdhdGlvbigpfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9uQ2xpY2s9eyhlKSA9PiB7IGUuc3RvcFByb3BhZ2F0aW9uKCk7IHNldEFjdGl2ZVRhYih0YWIpOyB9fVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT17YHB4LTMgcHktMS41IHRyYW5zaXRpb24tY29sb3JzIGJvcmRlci1iLTIgJHthY3RpdmVUYWIgPT09IHRhYiA/ICd0ZXh0LWJsdWUtNDAwIGJvcmRlci1ibHVlLTUwMCBiZy1zbGF0ZS04MDAnIDogJ2JvcmRlci10cmFuc3BhcmVudCBob3Zlcjp0ZXh0LXNsYXRlLTIwMCBob3ZlcjpiZy1zbGF0ZS03MDAnfWB9XG4gICAgICAgICAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAge3RhYn1cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICApKX1cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICB7LyogTW9kZSBpbmRpY2F0b3JzIC8gUUFUIGNvdWxkIGdvIGhlcmUgKi99XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgey8qIFJpYmJvbiBCb2R5ICovfVxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLXN0YXJ0IHB4LTIgcHktMiBnYXAtMiBvdmVyZmxvdy14LWF1dG8gY3VzdG9tLXNjcm9sbGJhciBtaW4taC1bNzBweF0gdy1mdWxsIG1heC13LWZ1bGxcIiBvblBvaW50ZXJEb3duPXsoZSkgPT4gZS5zdG9wUHJvcGFnYXRpb24oKX0+XG5cbiAgICAgICAgICAgICAgICB7YWN0aXZlVGFiID09PSAnRklMRScgJiYgKFxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggc2hyaW5rLTBcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEdyb3VwIHRpdGxlPVwiQ29uZmlnXCIgc2hvcnRUaXRsZT1cIkNGR1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxUb29sQnRuIG9uQ2xpY2s9eygpID0+IHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0U2hvd1NldHRpbmdzKHRydWUpfSB0aXRsZT1cIlNldHRpbmdzXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiM1wiLz48cGF0aCBkPVwiTTE5LjQgMTVhMS42NSAxLjY1IDAgMCAwIC4zMyAxLjgybC4wNi4wNmEyIDIgMCAwIDEgMCAyLjgzIDIgMiAwIDAgMS0yLjgzIDBsLS4wNi0uMDZhMS42NSAxLjY1IDAgMCAwLTEuODItLjMzIDEuNjUgMS42NSAwIDAgMC0xIDEuNTFWMjFhMiAyIDAgMCAxLTIgMiAyIDIgMCAwIDEtMi0ydi0uMDlBMS42NSAxLjY1IDAgMCAwIDkgMTkuNGExLjY1IDEuNjUgMCAwIDAtMS44Mi4zM2wtLjA2LjA2YTIgMiAwIDAgMS0yLjgzIDAgMiAyIDAgMCAxIDAtMi44M2wuMDYtLjA2YTEuNjUgMS42NSAwIDAgMCAuMzMtMS44MiAxLjY1IDEuNjUgMCAwIDAtMS41MS0xSDNhMiAyIDAgMCAxLTItMiAyIDIgMCAwIDEgMi0yaC4wOUExLjY1IDEuNjUgMCAwIDAgNC42IDlhMS42NSAxLjY1IDAgMCAwLS4zMy0xLjgybC0uMDYtLjA2YTIgMiAwIDAgMSAwLTIuODMgMiAyIDAgMCAxIDIuODMgMGwuMDYuMDZhMS42NSAxLjY1IDAgMCAwIDEuODIuMzNIOWExLjY1IDEuNjUgMCAwIDAgMS0xLjUxVjNhMiAyIDAgMCAxIDItMiAyIDIgMCAwIDEgMiAydi4wOWExLjY1IDEuNjUgMCAwIDAgMSAxLjUxIDEuNjUgMS42NSAwIDAgMCAxLjgyLS4zM2wuMDYtLjA2YTIgMiAwIDAgMSAyLjgzIDAgMiAyIDAgMCAxIDAgMi44M2wtLjA2LjA2YTEuNjUgMS42NSAwIDAgMC0uMzMgMS44MlY5YTEuNjUgMS42NSAwIDAgMCAxLjUxIDFIMjFhMiAyIDAgMCAxIDIgMiAyIDIgMCAwIDEtMiAyaC0uMDlhMS42NSAxLjY1IDAgMCAwLTEuNTEgMXpcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9Ub29sQnRuPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9Ub29sR3JvdXA+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICl9XG5cbiAgICAgICAgICAgICAgICB7YWN0aXZlVGFiID09PSAnQU5BTFlTSVMnICYmIChcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IHNocmluay0wXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEdyb3VwIHRpdGxlPVwiQXV0byBGaXhlc1wiIHNob3J0VGl0bGU9XCJGSVhcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZ2FwLTJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPFRleHRCdG4gb25DbGljaz17b25GaXg2bW19IGNvbG9yPVwib3JhbmdlXCIgbGFiZWw9XCJGaXggNm1tXCIgdGl0bGU9XCJBdXRvLWNsb3NlIGFsbCBnYXBzIOKJpCA2bW1cIiAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8VGV4dEJ0biBvbkNsaWNrPXtvbkZpeDI1bW19IGNvbG9yPVwicmVkXCIgbGFiZWw9XCJGaXggMjVtbVwiIHRpdGxlPVwiSW5zZXJ0IHBpcGUgc3Bvb2wgZm9yIGdhcHMgNi0yNW1tXCIgLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPFRleHRCdG4gb25DbGljaz17b25BdXRvUmVmfSBjb2xvcj1cImJsdWVcIiBsYWJlbD1cIkF1dG8gUGlwZSBSZWZcIiB0aXRsZT1cIkF1dG8tYXNzaWduIFBpcGVsaW5lIFJlZnMgdG8gYmxhbmsgY29tcG9uZW50cyBvbiBicmFuY2hcIiAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8VGV4dEJ0biBvbkNsaWNrPXtvbk92ZXJsYXBTb2x2ZXJ9IGNvbG9yPVwicHVycGxlXCIgbGFiZWw9XCJPdmVybGFwIFNvbHZlclwiIHRpdGxlPVwiVHJpbSBwaXBlcyBvdmVybGFwcGluZyB3aXRoIHJpZ2lkIGZpdHRpbmdzXCIgLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEdyb3VwPlxuICAgICAgICAgICAgICAgICAgICAgICAgPFRvb2xHcm91cCB0aXRsZT1cIlZpc3VhbHNcIiBzaG9ydFRpdGxlPVwiVklTXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPFRvb2xCdG4gYWN0aXZlPXt1c2VTdG9yZS5nZXRTdGF0ZSgpLnNob3dHYXBSYWRhcn0gb25DbGljaz17KCkgPT4gdXNlU3RvcmUuZ2V0U3RhdGUoKS5zZXRTaG93R2FwUmFkYXIoIXVzZVN0b3JlLmdldFN0YXRlKCkuc2hvd0dhcFJhZGFyKX0gY29sb3I9XCJhbWJlclwiIHRpdGxlPVwiVG9nZ2xlIEdhcCBSYWRhclwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3ZnIGNsYXNzTmFtZT1cInctNCBoLTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2VXaWR0aD1cIjJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMTBcIi8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjZcIi8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjJcIi8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEJ0bj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEdyb3VwPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICApfVxuXG4gICAgICAgICAgICAgICAge2FjdGl2ZVRhYiA9PT0gJ1ZJRVcnICYmIChcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IHNocmluay0wXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEdyb3VwIHRpdGxlPVwiTmF2aWdhdGlvblwiIHNob3J0VGl0bGU9XCJOQVZcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEJ0biBvbkNsaWNrPXtoYW5kbGVSZXNldFZpZXd9IHRpdGxlPVwiSG9tZSAvIFJlc2V0IFZpZXdcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHN2ZyBjbGFzc05hbWU9XCJ3LTQgaC00XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIyXCI+PHBhdGggZD1cIk0zIDlsOS03IDkgN3YxMWEyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMnpcIi8+PHBvbHlsaW5lIHBvaW50cz1cIjkgMjIgOSAxMiAxNSAxMiAxNSAyMlwiLz48L3N2Zz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L1Rvb2xCdG4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPFRvb2xCdG4gb25DbGljaz17KCkgPT4gd2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KCdjYW52YXMtYXV0by1jZW50ZXInKSl9IHRpdGxlPVwiWm9vbSB0byBGaXRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHN2ZyBjbGFzc05hbWU9XCJ3LTQgaC00XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIyXCI+PHBhdGggZD1cIk00IDE0djRhMiAyIDAgMCAwIDIgMmg0XCIvPjxwYXRoIGQ9XCJNMjAgMTBWNmEyIDIgMCAwIDAtMi0yaC00XCIvPjxwYXRoIGQ9XCJNMTQgMjBoNGEyIDIgMCAwIDAgMi0ydi00XCIvPjxwYXRoIGQ9XCJNNCAxMFY2YTIgMiAwIDAgMSAyLTJoNFwiLz48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjJcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9Ub29sQnRuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxUb29sQnRuIGFjdGl2ZT17IXVzZVN0b3JlLmdldFN0YXRlKCkub3J0aG9Nb2RlfSBvbkNsaWNrPXsoKSA9PiB1c2VTdG9yZS5nZXRTdGF0ZSgpLnRvZ2dsZU9ydGhvTW9kZSgpfSBjb2xvcj1cImJsdWVcIiB0aXRsZT1cIlRvZ2dsZSBQZXJzcGVjdGl2ZSAvIE9ydGhvZ3JhcGhpYyAoTylcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHN2ZyBjbGFzc05hbWU9XCJ3LTQgaC00XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIyXCI+PHBvbHlnb24gcG9pbnRzPVwiMTIgMiAyIDcgMTIgMTIgMjIgNyAxMiAyXCIvPjxwb2x5bGluZSBwb2ludHM9XCIyIDE3IDEyIDIyIDIyIDE3XCIvPjxwb2x5bGluZSBwb2ludHM9XCIyIDEyIDEyIDE3IDIyIDEyXCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEJ0bj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEdyb3VwPlxuXG4gICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEdyb3VwIHRpdGxlPVwiVmlzaWJpbGl0eVwiIHNob3J0VGl0bGU9XCJWSVNcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEJ0biBhY3RpdmU9e3VzZVN0b3JlLmdldFN0YXRlKCkuaGlkZGVuRWxlbWVudElkcy5sZW5ndGggPiAwfSBvbkNsaWNrPXsoKSA9PiB1c2VTdG9yZS5nZXRTdGF0ZSgpLnVuaGlkZUFsbCgpfSBjb2xvcj1cImVtZXJhbGRcIiB0aXRsZT1cIlNob3cgQWxsIENvbXBvbmVudHMgKFUpXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiPjxwYXRoIGQ9XCJNMSAxMnM0LTggMTEtOCAxMSA4IDExIDgtNCA4LTExIDgtMTEtOC0xMS04elwiLz48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjNcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9Ub29sQnRuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxUb29sQnRuIGFjdGl2ZT17ZmFsc2V9IG9uQ2xpY2s9eygpID0+IHVzZVN0b3JlLmdldFN0YXRlKCkuaXNvbGF0ZVNlbGVjdGVkKCl9IGNvbG9yPVwiYW1iZXJcIiB0aXRsZT1cIklzb2xhdGUgU2VsZWN0ZWQgKEgpXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiPjxwYXRoIGQ9XCJNMjEgMTJIM1wiLz48cGF0aCBkPVwiTTEyIDIxVjNcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9Ub29sQnRuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidy1weCBoLTYgYmctc2xhdGUtNzAwIG14LTEgc2VsZi1jZW50ZXJcIj48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEJ0biBhY3RpdmU9e3VzZVN0b3JlLmdldFN0YXRlKCkudHJhbnNsdWNlbnRNb2RlfSBvbkNsaWNrPXsoKSA9PiB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldFRyYW5zbHVjZW50TW9kZSghdXNlU3RvcmUuZ2V0U3RhdGUoKS50cmFuc2x1Y2VudE1vZGUpfSBjb2xvcj1cImJsdWVcIiB0aXRsZT1cIlRvZ2dsZSBUcmFuc2x1Y2VudCBWaWV3XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiIHN0cm9rZUxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZUxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwibTEyIDMtMS45MTIgNS44MTNhMiAyIDAgMCAxLTEuMjc1IDEuMjc1TDMgMTJsNS44MTMgMS45MTJhMiAyIDAgMCAxIDEuMjc1IDEuMjc1TDEyIDIxbDEuOTEyLTUuODEzYTIgMiAwIDAgMSAxLjI3NS0xLjI3NUwyMSAxMmwtNS44MTMtMS45MTJhMiAyIDAgMCAxLTEuMjc1LTEuMjc1TDEyIDNaXCIvPjxwYXRoIGQ9XCJNNSAzdjRcIi8+PHBhdGggZD1cIk0xOSAxN3Y0XCIvPjxwYXRoIGQ9XCJNMyA1aDRcIi8+PHBhdGggZD1cIk0xNyAxOWg0XCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEJ0bj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEdyb3VwPlxuXG4gICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEdyb3VwIHRpdGxlPVwiU2hhZGluZ1wiIHNob3J0VGl0bGU9XCJTSEFERVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzZWxlY3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU9e2NvbG9yTW9kZX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiBzZXRDb2xvck1vZGUoZS50YXJnZXQudmFsdWUpfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvbktleURvd249eyhlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0Q29sb3JNb2RlKCcnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLnRhcmdldC5ibHVyKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cImgtNyBiZy1zbGF0ZS03MDAgdGV4dC1zbGF0ZS0zMDAgdGV4dC1bMTFweF0gcm91bmRlZCBib3JkZXIgYm9yZGVyLXNsYXRlLTYwMCBweC0yIG91dGxpbmUtbm9uZSBmb2N1czpib3JkZXItaW5kaWdvLTUwMCBjdXJzb3ItcG9pbnRlciB3LTMyXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJcIj5Ob25lIChEZWZhdWx0KTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiVFlQRVwiPkNvbG9yIGJ5IFR5cGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIlNQT09MXCI+Q29sb3IgYnkgU3Bvb2w8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIlBJUEVMSU5FX1JFRlwiPkNvbG9yIGJ5IFBpcGVsaW5lIFJlZjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiRVJST1JcIj5Db2xvciBieSBFcnJvcjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiTElORU5PX0tFWVwiPkNvbG9yIGJ5IExpbmVObyBLZXk8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIlJBVElOR1wiPkNvbG9yIGJ5IFJhdGluZzwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiUElQSU5HX0NMQVNTXCI+Q29sb3IgYnkgUGlwaW5nIENsYXNzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtbOTcsOTgsMSwyLDMsNCw1LDYsNyw4LDksMTBdLm1hcChuID0+IChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24ga2V5PXtgY2Eke259YH0gdmFsdWU9e2BDQSR7bn1gfT5Db2xvciBieSBDQXtufTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApKX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEdyb3VwPlxuXG4gICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEdyb3VwIHRpdGxlPVwiTGFiZWxzXCIgc2hvcnRUaXRsZT1cIkxCTFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxUb29sQnRuIGFjdGl2ZT17dXNlU3RvcmUuZ2V0U3RhdGUoKS5zaG93Um93TGFiZWxzfSBvbkNsaWNrPXsoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNob3dSb3dMYWJlbHM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0U2hvd1Jvd0xhYmVscyghY3VycmVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghY3VycmVudCkgdXNlU3RvcmUuZ2V0U3RhdGUoKS5zZXRUcmFuc2x1Y2VudE1vZGUodHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfX0gY29sb3I9XCJhbWJlclwiIHRpdGxlPVwiVG9nZ2xlIFJvdyBOby4gKFIpXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZm9udC1ib2xkIHRleHQteHNcIj5SPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9Ub29sQnRuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxUb29sQnRuIGFjdGl2ZT17dXNlU3RvcmUuZ2V0U3RhdGUoKS5zaG93UmVmTGFiZWxzfSBvbkNsaWNrPXsoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNob3dSZWZMYWJlbHM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0U2hvd1JlZkxhYmVscyghY3VycmVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghY3VycmVudCkgdXNlU3RvcmUuZ2V0U3RhdGUoKS5zZXRUcmFuc2x1Y2VudE1vZGUodHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfX0gY29sb3I9XCJibHVlXCIgdGl0bGU9XCJUb2dnbGUgUGlwZWxpbmUgUmVmXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZm9udC1ib2xkIHRleHQtWzEwcHhdXCI+UmVmPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9Ub29sQnRuPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9Ub29sR3JvdXA+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICl9XG5cbiAgICAgICAgICAgICAgICB7YWN0aXZlVGFiID09PSAnVE9PTFMnICYmIChcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IHNocmluay0wXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEdyb3VwIHRpdGxlPVwiU2VsZWN0IC8gTW9kaWZ5XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAge3Nob3dEcmF3Q2FudmFzSWNvbiAmJiAoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDw+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEJ0biBvbkNsaWNrPXsoKSA9PiBzZXREcmF3TW9kZSh0cnVlKX0gY29sb3I9XCJpbmRpZ29cIiB0aXRsZT1cIk9wZW4gRHJhdyBDYW52YXNcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3ZnIGNsYXNzTmFtZT1cInctNCBoLTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2VXaWR0aD1cIjJcIj48cGF0aCBkPVwiTTEyIDIwaDlcIi8+PHBhdGggZD1cIk0xNi41IDMuNWEyLjEyMSAyLjEyMSAwIDAgMSAzIDNMNyAxOWwtNCAxIDEtNEwxNi41IDMuNXpcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L1Rvb2xCdG4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInctcHggaC02IGJnLXNsYXRlLTcwMCBteC0xIHNlbGYtY2VudGVyXCI+PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPFRvb2xCdG4gYWN0aXZlPXtjYW52YXNNb2RlID09PSAnTUFSUVVFRV9TRUxFQ1QnfSBvbkNsaWNrPXsoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5leHQgPSBjYW52YXNNb2RlID09PSAnTUFSUVVFRV9TRUxFQ1QnID8gJ1ZJRVcnIDogJ01BUlFVRUVfU0VMRUNUJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGJnLnRvb2woJ01BUlFVRUVfU0VMRUNUJywgYEJ1dHRvbiBjbGlja2VkIOKGkiAke25leHR9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldENhbnZhc01vZGUobmV4dCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfX0gY29sb3I9XCJibHVlXCIgdGl0bGU9XCJCb3ggU2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiPjxyZWN0IHg9XCIzXCIgeT1cIjNcIiB3aWR0aD1cIjE4XCIgaGVpZ2h0PVwiMThcIiByeD1cIjJcIiByeT1cIjJcIiBzdHJva2VEYXNoYXJyYXk9XCI0IDRcIiAvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEJ0bj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEJ0biBhY3RpdmU9e2NhbnZhc01vZGUgPT09ICdNQVJRVUVFX1pPT00nfSBvbkNsaWNrPXsoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5leHQgPSBjYW52YXNNb2RlID09PSAnTUFSUVVFRV9aT09NJyA/ICdWSUVXJyA6ICdNQVJRVUVFX1pPT00nO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYmcudG9vbCgnTUFSUVVFRV9aT09NJywgYEJ1dHRvbiBjbGlja2VkIOKGkiAke25leHR9YCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldENhbnZhc01vZGUobmV4dCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfX0gY29sb3I9XCJpbmRpZ29cIiB0aXRsZT1cIkJveCBab29tXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiPjxjaXJjbGUgY3g9XCIxMVwiIGN5PVwiMTFcIiByPVwiOFwiLz48bGluZSB4MT1cIjIxXCIgeTE9XCIyMVwiIHgyPVwiMTYuNjVcIiB5Mj1cIjE2LjY1XCIvPjxyZWN0IHg9XCI4XCIgeT1cIjhcIiB3aWR0aD1cIjZcIiBoZWlnaHQ9XCI2XCIgc3Ryb2tlRGFzaGFycmF5PVwiMiAyXCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEJ0bj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInctcHggaC02IGJnLXNsYXRlLTcwMCBteC0xIHNlbGYtY2VudGVyXCI+PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPFRvb2xCdG4gb25DbGljaz17aGFuZGxlRGVsZXRlfSBjb2xvcj1cInJlZFwiIHRpdGxlPVwiRGVsZXRlIFNlbGVjdGVkIChEZWwpXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiPjxwYXRoIGQ9XCJNMyA2aDE4XCIvPjxwYXRoIGQ9XCJNMTkgNnYxNGEyIDIgMCAwIDEtMiAySDdhMiAyIDAgMCAxLTItMlY2bTMgMFY0YTIgMiAwIDAgMSAyLTJoNGEyIDIgMCAwIDEgMiAydjJcIi8+PGxpbmUgeDE9XCIxMFwiIHkxPVwiMTFcIiB4Mj1cIjEwXCIgeTI9XCIxN1wiLz48bGluZSB4MT1cIjE0XCIgeTE9XCIxMVwiIHgyPVwiMTRcIiB5Mj1cIjE3XCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEJ0bj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEdyb3VwPlxuXG4gICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEdyb3VwIHRpdGxlPVwiRWRpdCBNb2Rlc1wiIHNob3J0VGl0bGU9XCJFRElUXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPFRvb2xCdG4gYWN0aXZlPXtjYW52YXNNb2RlID09PSAnQ09OTkVDVCd9IG9uQ2xpY2s9eygpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV4dCA9IGNhbnZhc01vZGUgPT09ICdDT05ORUNUJyA/ICdWSUVXJyA6ICdDT05ORUNUJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGJnLnRvb2woJ0NPTk5FQ1QnLCBgQnV0dG9uIGNsaWNrZWQg4oaSICR7bmV4dH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0Q2FudmFzTW9kZShuZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9fSBjb2xvcj1cImFtYmVyXCIgdGl0bGU9XCJDb25uZWN0IChDKVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3ZnIGNsYXNzTmFtZT1cInctNCBoLTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2VXaWR0aD1cIjJcIj48cGF0aCBkPVwiTTEwIDEzYTUgNSAwIDAgMCA3LjU0LjU0bDMtM2E1IDUgMCAwIDAtNy4wNy03LjA3bC0xLjcyIDEuNzFcIi8+PHBhdGggZD1cIk0xNCAxMWE1IDUgMCAwIDAtNy41NC0uNTRsLTMgM2E1IDUgMCAwIDAgNy4wNyA3LjA3bDEuNzEtMS43MVwiLz48L3N2Zz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L1Rvb2xCdG4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPFRvb2xCdG4gYWN0aXZlPXtjYW52YXNNb2RlID09PSAnU1RSRVRDSCd9IG9uQ2xpY2s9eygpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV4dCA9IGNhbnZhc01vZGUgPT09ICdTVFJFVENIJyA/ICdWSUVXJyA6ICdTVFJFVENIJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGJnLnRvb2woJ1NUUkVUQ0gnLCBgQnV0dG9uIGNsaWNrZWQg4oaSICR7bmV4dH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0Q2FudmFzTW9kZShuZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9fSBjb2xvcj1cImVtZXJhbGRcIiB0aXRsZT1cIlN0cmV0Y2ggKFQpXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiPjxwYXRoIGQ9XCJNNSAxMmgxNFwiLz48cGF0aCBkPVwiTTE1IDE2bDQtNC00LTRcIi8+PHBhdGggZD1cIk05IDhsLTQgNCA0IDRcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9Ub29sQnRuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxUb29sQnRuIGFjdGl2ZT17Y2FudmFzTW9kZSA9PT0gJ0JSRUFLJ30gb25DbGljaz17KCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXh0ID0gY2FudmFzTW9kZSA9PT0gJ0JSRUFLJyA/ICdWSUVXJyA6ICdCUkVBSyc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRiZy50b29sKCdCUkVBSycsIGBCdXR0b24gY2xpY2tlZCDihpIgJHtuZXh0fWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXRDYW52YXNNb2RlKG5leHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH19IGNvbG9yPVwicmVkXCIgdGl0bGU9XCJCcmVhayAoQilcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHN2ZyBjbGFzc05hbWU9XCJ3LTQgaC00XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIyXCI+PGNpcmNsZSBjeD1cIjZcIiBjeT1cIjZcIiByPVwiM1wiLz48Y2lyY2xlIGN4PVwiNlwiIGN5PVwiMThcIiByPVwiM1wiLz48bGluZSB4MT1cIjIwXCIgeTE9XCI0XCIgeDI9XCI4LjEyXCIgeTI9XCIxNS44OFwiLz48bGluZSB4MT1cIjE0LjQ3XCIgeTE9XCIxNC40OFwiIHgyPVwiMjBcIiB5Mj1cIjIwXCIvPjxsaW5lIHgxPVwiOC4xMlwiIHkxPVwiOC4xMlwiIHgyPVwiMTJcIiB5Mj1cIjEyXCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEJ0bj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEJ0biBhY3RpdmU9e2NhbnZhc01vZGUgPT09ICdNRUFTVVJFJ30gb25DbGljaz17KCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXh0ID0gY2FudmFzTW9kZSA9PT0gJ01FQVNVUkUnID8gJ1ZJRVcnIDogJ01FQVNVUkUnO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYmcudG9vbCgnTUVBU1VSRScsIGBCdXR0b24gY2xpY2tlZCDihpIgJHtuZXh0fWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXRDYW52YXNNb2RlKG5leHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH19IGNvbG9yPVwiYW1iZXJcIiB0aXRsZT1cIk1lYXN1cmUgKE0pXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiPjxwYXRoIGQ9XCJNMjEuMTc0IDYuODEyYTEgMSAwIDAgMC0zLjk4Ni0zLjk4N0wzLjg0MiAxNi4xNzRhMiAyIDAgMSAwIDIuODI5IDIuODI4elwiLz48cGF0aCBkPVwibTYuMyAxNC41LTQgNFwiLz48cGF0aCBkPVwibTE2IDUuMy00IDRcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9Ub29sQnRuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidy1weCBoLTYgYmctc2xhdGUtNzAwIG14LTEgc2VsZi1jZW50ZXJcIj48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEJ0biBhY3RpdmU9e3VzZVN0b3JlLmdldFN0YXRlKCkuY2xpcHBpbmdQbGFuZUVuYWJsZWR9IG9uQ2xpY2s9eygpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGJnLnRvb2woJ0NMSVBQSU5HX1BMQU5FJywgYEJ1dHRvbiBjbGlja2VkIOKGkiAkeyF1c2VTdG9yZS5nZXRTdGF0ZSgpLmNsaXBwaW5nUGxhbmVFbmFibGVkfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldENsaXBwaW5nUGxhbmVFbmFibGVkKCF1c2VTdG9yZS5nZXRTdGF0ZSgpLmNsaXBwaW5nUGxhbmVFbmFibGVkKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH19IGNvbG9yPVwic2xhdGVcIiB0aXRsZT1cIlRvZ2dsZSBTZWN0aW9uIEJveFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3ZnIGNsYXNzTmFtZT1cInctNCBoLTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2VXaWR0aD1cIjJcIj48cGF0aCBkPVwiTTEyIDN2MThcIi8+PHBhdGggZD1cIk0zIDEyaDE4XCIvPjxwYXRoIGQ9XCJNMyAzaDE4djE4SDN6XCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEJ0bj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEJ0biBhY3RpdmU9e2NhbnZhc01vZGUgPT09ICdJTlNFUlRfU1VQUE9SVCd9IG9uQ2xpY2s9eygpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV4dCA9IGNhbnZhc01vZGUgPT09ICdJTlNFUlRfU1VQUE9SVCcgPyAnVklFVycgOiAnSU5TRVJUX1NVUFBPUlQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYmcudG9vbCgnSU5TRVJUX1NVUFBPUlQnLCBgQnV0dG9uIGNsaWNrZWQg4oaSICR7bmV4dH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0Q2FudmFzTW9kZShuZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9fSBjb2xvcj1cImVtZXJhbGRcIiB0aXRsZT1cIkluc2VydCBTdXBwb3J0IChJKVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3ZnIGNsYXNzTmFtZT1cInctNCBoLTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2VXaWR0aD1cIjJcIj48cGF0aCBkPVwiTTEyIDIyVjhcIi8+PHBhdGggZD1cIk04IDhoOFwiLz48cGF0aCBkPVwiTTEyIDhsLTMgLTZoNnpcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9Ub29sQnRuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxUb29sQnRuIGFjdGl2ZT17Y2FudmFzTW9kZSA9PT0gJ0FTU0lHTl9QSVBFTElORSd9IG9uQ2xpY2s9eygpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV4dCA9IGNhbnZhc01vZGUgPT09ICdBU1NJR05fUElQRUxJTkUnID8gJ1ZJRVcnIDogJ0FTU0lHTl9QSVBFTElORSc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRiZy50b29sKCdBU1NJR05fUElQRUxJTkUnLCBgQnV0dG9uIGNsaWNrZWQg4oaSICR7bmV4dH1gKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0Q2FudmFzTW9kZShuZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9fSBjb2xvcj1cImJsdWVcIiB0aXRsZT1cIkFzc2lnbiBQaXBlbGluZSBSZWZcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHN2ZyBjbGFzc05hbWU9XCJ3LTQgaC00XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIyXCI+PHBhdGggZD1cIk0yMSAxNXY0YTIgMiAwIDAgMS0yIDJINWEyIDIgMCAwIDEtMi0ydi00XCIvPjxwb2x5bGluZSBwb2ludHM9XCI3IDEwIDEyIDE1IDE3IDEwXCIvPjxsaW5lIHgxPVwiMTJcIiB5MT1cIjE1XCIgeDI9XCIxMlwiIHkyPVwiM1wiLz48L3N2Zz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L1Rvb2xCdG4+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L1Rvb2xHcm91cD5cblxuICAgICAgICAgICAgICAgICAgICAgICAgPFRvb2xHcm91cCB0aXRsZT1cIlBhbmVsc1wiIHNob3J0VGl0bGU9XCJQQU5FTFNcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8VG9vbEJ0biBhY3RpdmU9e3VzZVN0b3JlLmdldFN0YXRlKCkuc2hvd1NpZGVJbnNwZWN0b3J9IG9uQ2xpY2s9eygpID0+IHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0U2hvd1NpZGVJbnNwZWN0b3IoIXVzZVN0b3JlLmdldFN0YXRlKCkuc2hvd1NpZGVJbnNwZWN0b3IpfSB0aXRsZT1cIlRvZ2dsZSBTaWRlIFBhbmVsXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiPjxyZWN0IHg9XCIzXCIgeT1cIjNcIiB3aWR0aD1cIjE4XCIgaGVpZ2h0PVwiMThcIiByeD1cIjJcIiByeT1cIjJcIi8+PGxpbmUgeDE9XCIxNVwiIHkxPVwiM1wiIHgyPVwiMTVcIiB5Mj1cIjIxXCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEJ0bj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEdyb3VwPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICApfVxuXG4gICAgICAgICAgICAgICAge2FjdGl2ZVRhYiA9PT0gJ0VYUE9SVCcgJiYgKFxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggc2hyaW5rLTBcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxUb29sR3JvdXAgdGl0bGU9XCJFeHBvcnQgRGF0YVwiIHNob3J0VGl0bGU9XCJFWFBcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgey8qIFBsYWNlaG9sZGVyIGZvciBmdXR1cmUgZXhwb3J0IGFjdGlvbnMgKi99XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxUZXh0QnRuIG9uQ2xpY2s9eygpID0+IHt9fSBjb2xvcj1cInNsYXRlXCIgbGFiZWw9XCJFeHBvcnQgUENGXCIgdGl0bGU9XCJFeHBvcnQgY3VycmVudCBtb2RlbCB0byBQQ0YgZm9ybWF0XCIgLz5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvVG9vbEdyb3VwPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICk7XG59XG4iXSwibWFwcGluZ3MiOiJBQUFBLE9BQU9BLEtBQUssSUFBSUMsUUFBUSxRQUFRLE9BQU87QUFDdkMsU0FBU0MsUUFBUSxRQUFRLHNCQUFzQjtBQUMvQyxTQUFTQyxhQUFhLFFBQVEsd0JBQXdCO0FBQ3RELFNBQVNDLEdBQUcsUUFBUSx1QkFBdUI7QUFBQyxTQUFBQyxHQUFBLElBQUFDLElBQUEsRUFBQUMsSUFBQSxJQUFBQyxLQUFBLEVBQUFDLFFBQUEsSUFBQUMsU0FBQTtBQUU1QyxNQUFNQyxTQUFTLEdBQUdBLENBQUM7RUFBRUMsS0FBSztFQUFFQyxVQUFVO0VBQUVDO0FBQVMsQ0FBQyxLQUFLO0VBQ25ELE1BQU0sQ0FBQ0MsU0FBUyxFQUFFQyxZQUFZLENBQUMsR0FBR2YsUUFBUSxDQUFDLEtBQUssQ0FBQztFQUNqRCxJQUFJYyxTQUFTLEVBQUU7SUFDWCxPQUNJVCxJQUFBO01BQUtXLFNBQVMsRUFBQyw2RkFBNkY7TUFBQUgsUUFBQSxFQUN4R1IsSUFBQTtRQUFRWSxPQUFPLEVBQUVBLENBQUEsS0FBTUYsWUFBWSxDQUFDLEtBQUssQ0FBRTtRQUFDQyxTQUFTLEVBQUMsMEtBQTBLO1FBQUNMLEtBQUssRUFBRSxVQUFVQSxLQUFLLEVBQUc7UUFBQUUsUUFBQSxFQUNyUEQ7TUFBVSxDQUNQO0lBQUMsQ0FDUixDQUFDO0VBRWQ7RUFDQSxPQUNJTCxLQUFBO0lBQUtTLFNBQVMsRUFBQyw4RUFBOEU7SUFBQUgsUUFBQSxHQUN6RlIsSUFBQTtNQUFLVyxTQUFTLEVBQUMsNkNB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