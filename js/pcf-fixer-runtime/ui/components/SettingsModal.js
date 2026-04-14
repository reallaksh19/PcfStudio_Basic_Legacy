import React from 'react';
import { useStore, THEME_PRESETS } from '/js/pcf-fixer-runtime/store/useStore.js';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "/js/pcf-fixer-runtime/jsx-runtime.js";
export const SettingsModal = () => {
  const showSettings = useStore(state => state.showSettings);
  const setShowSettings = useStore(state => state.setShowSettings);
  const appSettings = useStore(state => state.appSettings);
  const updateAppSettings = useStore(state => state.updateAppSettings);
  const [activeTab, setActiveTab] = React.useState('VIEW');
  if (!showSettings) return null;
  return _jsx("div", {
    className: "fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4",
    children: _jsxs("div", {
      className: "bg-slate-900 border border-slate-700 shadow-2xl rounded-lg w-full max-w-md overflow-hidden flex flex-col h-[80vh]",
      children: [_jsxs("div", {
        className: "flex justify-between items-center bg-slate-800 p-4 border-b border-slate-700 shrink-0",
        children: [_jsxs("h2", {
          className: "text-slate-100 font-bold text-lg flex items-center gap-2",
          children: [_jsxs("svg", {
            width: "20",
            height: "20",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            children: [_jsx("circle", {
              cx: "12",
              cy: "12",
              r: "3"
            }), _jsx("path", {
              d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
            })]
          }), "Preferences"]
        }), _jsx("button", {
          onClick: () => setShowSettings(false),
          className: "text-slate-400 hover:text-white transition-colors",
          title: "Close",
          children: _jsxs("svg", {
            width: "24",
            height: "24",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            children: [_jsx("path", {
              d: "M18 6 6 18"
            }), _jsx("path", {
              d: "m6 6 12 12"
            })]
          })
        })]
      }), _jsxs("div", {
        className: "flex border-b border-slate-700 bg-slate-900 shrink-0",
        children: [_jsx("button", {
          onClick: () => setActiveTab('VIEW'),
          className: `flex-1 py-2 text-xs font-bold ${activeTab === 'VIEW' ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200'} transition-colors`,
          children: "View & Graphics"
        }), _jsx("button", {
          onClick: () => setActiveTab('THEME'),
          className: `flex-1 py-2 text-xs font-bold ${activeTab === 'THEME' ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200'} transition-colors`,
          children: "Theming"
        })]
      }), _jsxs("div", {
        className: "p-6 space-y-6 flex-1 overflow-y-auto",
        children: [activeTab === 'VIEW' && _jsx(_Fragment, {
          children: _jsxs("div", {
            children: [_jsx("h3", {
              className: "text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-700 pb-2",
              children: "Interaction & Tools"
            }), _jsxs("div", {
              className: "space-y-4",
              children: [_jsxs("div", {
                className: "flex justify-between items-center",
                children: [_jsxs("div", {
                  children: [_jsx("div", {
                    className: "text-sm font-medium text-slate-200",
                    children: "Grid Snap Resolution"
                  }), _jsx("div", {
                    className: "text-xs text-slate-400",
                    children: "Tolerance for snapping tools (mm)"
                  })]
                }), _jsx("input", {
                  type: "number",
                  min: "1",
                  value: appSettings.gridSnapResolution,
                  onChange: e => updateAppSettings({
                    gridSnapResolution: parseInt(e.target.value) || 100
                  }),
                  className: "bg-slate-950 text-slate-200 text-sm p-2 w-24 rounded border border-slate-700 text-right focus:border-blue-500 outline-none transition-colors"
                })]
              }), _jsxs("div", {
                className: "flex justify-between items-center",
                children: [_jsxs("div", {
                  children: [_jsx("div", {
                    className: "text-sm font-medium text-slate-200",
                    children: "Perspective FOV"
                  }), _jsx("div", {
                    className: "text-xs text-slate-400",
                    children: "Camera field of view angle"
                  })]
                }), _jsxs("div", {
                  className: "flex items-center gap-3",
                  children: [_jsx("input", {
                    type: "range",
                    min: "20",
                    max: "90",
                    value: appSettings.cameraFov,
                    onChange: e => updateAppSettings({
                      cameraFov: parseInt(e.target.value) || 45
                    }),
                    className: "accent-blue-500 w-24"
                  }), _jsxs("span", {
                    className: "text-xs font-mono text-slate-400 w-6",
                    children: [appSettings.cameraFov, "\xB0"]
                  })]
                })]
              }), _jsxs("div", {
                className: "flex justify-between items-center",
                children: [_jsx("div", {
                  children: _jsx("div", {
                    className: "text-sm font-medium text-slate-200",
                    children: "Camera Near Plane"
                  })
                }), _jsx("input", {
                  type: "number",
                  min: "0.1",
                  value: appSettings.cameraNear,
                  onChange: e => updateAppSettings({
                    cameraNear: parseFloat(e.target.value) || 1
                  }),
                  className: "bg-slate-950 text-slate-200 text-sm p-2 w-24 rounded border border-slate-700 text-right focus:border-blue-500 outline-none transition-colors"
                })]
              }), _jsxs("div", {
                className: "flex justify-between items-center",
                children: [_jsx("div", {
                  children: _jsx("div", {
                    className: "text-sm font-medium text-slate-200",
                    children: "Camera Far Plane"
                  })
                }), _jsx("input", {
                  type: "number",
                  min: "1000",
                  value: appSettings.cameraFar,
                  onChange: e => updateAppSettings({
                    cameraFar: parseInt(e.target.value) || 500000
                  }),
                  className: "bg-slate-950 text-slate-200 text-sm p-2 w-24 rounded border border-slate-700 text-right focus:border-blue-500 outline-none transition-colors"
                })]
              })]
            })]
          })
        }), activeTab === 'THEME' && _jsxs(_Fragment, {
          children: [_jsxs("div", {
            children: [_jsx("h3", {
              className: "text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-700 pb-2",
              children: "Performance / Graphics"
            }), _jsxs("div", {
              className: "space-y-4",
              children: [_jsxs("label", {
                className: "flex justify-between items-center cursor-pointer group",
                children: [_jsxs("div", {
                  children: [_jsx("div", {
                    className: "text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors",
                    children: "Debug Console"
                  }), _jsx("div", {
                    className: "text-xs text-slate-400",
                    children: "Show debug overlay for tool events and state changes"
                  })]
                }), _jsxs("div", {
                  className: "relative",
                  children: [_jsx("input", {
                    "data-testid": "settings-debug-console",
                    type: "checkbox",
                    className: "sr-only",
                    checked: appSettings.debugConsoleEnabled,
                    onChange: e => updateAppSettings({
                      debugConsoleEnabled: e.target.checked
                    })
                  }), _jsx("div", {
                    className: `block w-10 h-6 rounded-full transition-colors ${appSettings.debugConsoleEnabled ? 'bg-blue-600' : 'bg-slate-700'}`
                  }), _jsx("div", {
                    className: `dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${appSettings.debugConsoleEnabled ? 'translate-x-4' : ''}`
                  })]
                })]
              }), _jsxs("label", {
                className: "flex justify-between items-center cursor-pointer group",
                children: [_jsxs("div", {
                  children: [_jsx("div", {
                    className: "text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors",
                    children: "Limit Pixel Ratio"
                  }), _jsx("div", {
                    className: "text-xs text-slate-400",
                    children: "Caps rendering at 1.5x resolution to boost FPS on Mac/High-DPI screens"
                  })]
                }), _jsxs("div", {
                  className: "relative",
                  children: [_jsx("input", {
                    type: "checkbox",
                    className: "sr-only",
                    checked: appSettings.limitPixelRatio,
                    onChange: e => updateAppSettings({
                      limitPixelRatio: e.target.checked
                    })
                  }), _jsx("div", {
                    className: `block w-10 h-6 rounded-full transition-colors ${appSettings.limitPixelRatio ? 'bg-blue-600' : 'bg-slate-700'}`
                  }), _jsx("div", {
                    className: `dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${appSettings.limitPixelRatio ? 'translate-x-4' : ''}`
                  })]
                })]
              }), _jsxs("label", {
                className: "flex justify-between items-center cursor-pointer group",
                children: [_jsxs("div", {
                  children: [_jsx("div", {
                    className: "text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors",
                    children: "Disable Anti-Aliasing"
                  }), _jsx("div", {
                    className: "text-xs text-slate-400",
                    children: "Turn off MSAA (Massive performance boost on weak GPUs)"
                  })]
                }), _jsxs("div", {
                  className: "relative",
                  children: [_jsx("input", {
                    type: "checkbox",
                    className: "sr-only",
                    checked: appSettings.disableAA,
                    onChange: e => updateAppSettings({
                      disableAA: e.target.checked
                    })
                  }), _jsx("div", {
                    className: `block w-10 h-6 rounded-full transition-colors ${appSettings.disableAA ? 'bg-blue-600' : 'bg-slate-700'}`
                  }), _jsx("div", {
                    className: `dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${appSettings.disableAA ? 'translate-x-4' : ''}`
                  })]
                })]
              }), _jsxs("div", {
                className: "flex justify-between items-center",
                children: [_jsxs("div", {
                  children: [_jsx("div", {
                    className: "text-sm font-medium text-slate-200",
                    children: "Label Culling Distance"
                  }), _jsx("div", {
                    className: "text-xs text-slate-400",
                    children: "Hide 3D labels if camera is further than this (0 to disable)"
                  })]
                }), _jsx("input", {
                  type: "number",
                  min: "0",
                  step: "1000",
                  value: appSettings.labelCullDistance,
                  onChange: e => updateAppSettings({
                    labelCullDistance: parseInt(e.target.value) || 0
                  }),
                  className: "bg-slate-950 text-slate-200 text-sm p-2 w-24 rounded border border-slate-700 text-right focus:border-blue-500 outline-none transition-colors"
                })]
              })]
            })]
          }), _jsxs("div", {
            children: [_jsx("h3", {
              className: "text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-700 pb-2",
              children: "Scene Theme"
            }), _jsx("div", {
              className: "grid grid-cols-2 gap-3",
              children: Object.entries(THEME_PRESETS || {}).map(([key, preset]) => _jsxs("button", {
                "data-testid": `theme-preset-${key}`,
                onClick: () => useStore.getState().applyTheme(key),
                className: `p-3 rounded-lg border-2 transition-all ${appSettings.theme === key ? 'border-blue-500 bg-slate-800 shadow-lg shadow-blue-500/20' : 'border-slate-700 hover:border-slate-500 bg-slate-800/50'}`,
                children: [_jsxs("div", {
                  className: "flex gap-1 mb-2",
                  children: [_jsx("div", {
                    className: "flex-1 h-6 rounded",
                    style: {
                      backgroundColor: preset.backgroundColor
                    },
                    children: _jsx("div", {
                      className: "flex h-full items-center justify-center gap-0.5 px-1",
                      children: Object.values(preset.componentColors).slice(0, 4).map((c, i) => _jsx("div", {
                        className: "w-2 h-3 rounded-sm",
                        style: {
                          backgroundColor: c
                        }
                      }, i))
                    })
                  }), _jsx("div", {
                    className: "w-4 h-6 rounded",
                    style: {
                      backgroundColor: preset.selectionColor
                    }
                  })]
                }), _jsx("span", {
                  className: "text-xs font-medium text-slate-300",
                  children: preset.label
                })]
              }, key))
            })]
          }), _jsxs("div", {
            children: [_jsx("h3", {
              className: "text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-700 pb-2",
              children: "Component Colors"
            }), _jsx("div", {
              className: "grid grid-cols-2 gap-4",
              children: Object.entries(appSettings.componentColors).map(([type, color]) => _jsxs("div", {
                className: "flex justify-between items-center",
                children: [_jsx("span", {
                  className: "text-sm font-medium text-slate-200",
                  children: type
                }), _jsx("div", {
                  className: "relative w-8 h-8 rounded overflow-hidden border border-slate-600",
                  children: _jsx("input", {
                    type: "color",
                    value: color,
                    onChange: e => updateAppSettings({
                      componentColors: {
                        ...appSettings.componentColors,
                        [type]: e.target.value
                      }
                    }),
                    className: "absolute -top-2 -left-2 w-12 h-12 cursor-pointer"
                  })
                })]
              }, type))
            })]
          }), _jsxs("div", {
            children: [_jsx("h3", {
              className: "text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-700 pb-2",
              children: "Visualization"
            }), _jsxs("div", {
              className: "space-y-3",
              children: [_jsxs("label", {
                className: "flex justify-between items-center cursor-pointer group",
                children: [_jsxs("div", {
                  children: [_jsx("div", {
                    className: "text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors",
                    children: "Center Orbit on Select"
                  }), _jsx("div", {
                    className: "text-xs text-slate-400",
                    children: "Orbit camera around clicked point"
                  })]
                }), _jsxs("div", {
                  className: "relative",
                  children: [_jsx("input", {
                    type: "checkbox",
                    className: "sr-only",
                    checked: appSettings.centerOrbitOnSelect,
                    onChange: e => updateAppSettings({
                      centerOrbitOnSelect: e.target.checked
                    })
                  }), _jsx("div", {
                    className: `block w-10 h-6 rounded-full transition-colors ${appSettings.centerOrbitOnSelect ? 'bg-blue-600' : 'bg-slate-700'}`
                  }), _jsx("div", {
                    className: `dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${appSettings.centerOrbitOnSelect ? 'translate-x-4' : ''}`
                  })]
                })]
              }), _jsxs("label", {
                className: "flex justify-between items-center cursor-pointer group",
                children: [_jsxs("div", {
                  children: [_jsx("div", {
                    className: "text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors",
                    children: "Show Ground Grid"
                  }), _jsx("div", {
                    className: "text-xs text-slate-400",
                    children: "Display reference grid plane at Y=0"
                  })]
                }), _jsxs("div", {
                  className: "relative",
                  children: [_jsx("input", {
                    type: "checkbox",
                    className: "sr-only",
                    checked: appSettings.showGrid,
                    onChange: e => updateAppSettings({
                      showGrid: e.target.checked
                    })
                  }), _jsx("div", {
                    className: `block w-10 h-6 rounded-full transition-colors ${appSettings.showGrid ? 'bg-blue-600' : 'bg-slate-700'}`
                  }), _jsx("div", {
                    className: `dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${appSettings.showGrid ? 'translate-x-4' : ''}`
                  })]
                })]
              }), _jsxs("label", {
                className: "flex justify-between items-center cursor-pointer group",
                children: [_jsxs("div", {
                  children: [_jsx("div", {
                    className: "text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors",
                    children: "Show Axis Helper"
                  }), _jsx("div", {
                    className: "text-xs text-slate-400",
                    children: "Display global RGB coordinate axes"
                  })]
                }), _jsxs("div", {
                  className: "relative",
                  children: [_jsx("input", {
                    type: "checkbox",
                    className: "sr-only",
                    checked: appSettings.showAxes,
                    onChange: e => updateAppSettings({
                      showAxes: e.target.checked
                    })
                  }), _jsx("div", {
                    className: `block w-10 h-6 rounded-full transition-colors ${appSettings.showAxes ? 'bg-blue-600' : 'bg-slate-700'}`
                  }), _jsx("div", {
                    className: `dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${appSettings.showAxes ? 'translate-x-4' : ''}`
                  })]
                })]
              })]
            })]
          })]
        })]
      }), _jsx("div", {
        className: "bg-slate-800 p-4 border-t border-slate-700 flex justify-end shrink-0",
        children: _jsx("button", {
          onClick: () => setShowSettings(false),
          className: "bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-6 rounded text-sm transition-colors shadow-lg",
          children: "Done"
        })
      })]
    })
  });
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsInVzZVN0b3JlIiwiVEhFTUVfUFJFU0VUUyIsImpzeCIsIl9qc3giLCJqc3hzIiwiX2pzeHMiLCJGcmFnbWVudCIsIl9GcmFnbWVudCIsIlNldHRpbmdzTW9kYWwiLCJzaG93U2V0dGluZ3MiLCJzdGF0ZSIsInNldFNob3dTZXR0aW5ncyIsImFwcFNldHRpbmdzIiwidXBkYXRlQXBwU2V0dGluZ3MiLCJhY3RpdmVUYWIiLCJzZXRBY3RpdmVUYWIiLCJ1c2VTdGF0ZSIsImNsYXNzTmFtZSIsImNoaWxkcmVuIiwid2lkdGgiLCJoZWlnaHQiLCJ2aWV3Qm94IiwiZmlsbCIsInN0cm9rZSIsInN0cm9rZVdpZHRoIiwic3Ryb2tlTGluZWNhcCIsInN0cm9rZUxpbmVqb2luIiwiY3giLCJjeSIsInIiLCJkIiwib25DbGljayIsInRpdGxlIiwidHlwZSIsIm1pbiIsInZhbHVlIiwiZ3JpZFNuYXBSZXNvbHV0aW9uIiwib25DaGFuZ2UiLCJlIiwicGFyc2VJbnQiLCJ0YXJnZXQiLCJtYXgiLCJjYW1lcmFGb3YiLCJjYW1lcmFOZWFyIiwicGFyc2VGbG9hdCIsImNhbWVyYUZhciIsImNoZWNrZWQiLCJkZWJ1Z0NvbnNvbGVFbmFibGVkIiwibGltaXRQaXhlbFJhdGlvIiwiZGlzYWJsZUFBIiwic3RlcCIsImxhYmVsQ3VsbERpc3RhbmNlIiwiT2JqZWN0IiwiZW50cmllcyIsIm1hcCIsImtleSIsInByZXNldCIsImdldFN0YXRlIiwiYXBwbHlUaGVtZSIsInRoZW1lIiwic3R5bGUiLCJiYWNrZ3JvdW5kQ29sb3IiLCJ2YWx1ZXMiLCJjb21wb25lbnRDb2xvcnMiLCJzbGljZSIsImMiLCJpIiwic2VsZWN0aW9uQ29sb3IiLCJsYWJlbCIsImNvbG9yIiwiY2VudGVyT3JiaXRPblNlbGVjdCIsInNob3dHcmlkIiwic2hvd0F4ZXMiXSwic291cmNlcyI6WyJTZXR0aW5nc01vZGFsLmpzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUmVhY3QgZnJvbSAncmVhY3QnO1xuaW1wb3J0IHsgdXNlU3RvcmUsIFRIRU1FX1BSRVNFVFMgfSBmcm9tICcuLi8uLi9zdG9yZS91c2VTdG9yZSc7XG5cbmV4cG9ydCBjb25zdCBTZXR0aW5nc01vZGFsID0gKCkgPT4ge1xuICBjb25zdCBzaG93U2V0dGluZ3MgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5zaG93U2V0dGluZ3MpO1xuICBjb25zdCBzZXRTaG93U2V0dGluZ3MgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5zZXRTaG93U2V0dGluZ3MpO1xuICBjb25zdCBhcHBTZXR0aW5ncyA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmFwcFNldHRpbmdzKTtcbiAgY29uc3QgdXBkYXRlQXBwU2V0dGluZ3MgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS51cGRhdGVBcHBTZXR0aW5ncyk7XG5cbiAgY29uc3QgW2FjdGl2ZVRhYiwgc2V0QWN0aXZlVGFiXSA9IFJlYWN0LnVzZVN0YXRlKCdWSUVXJyk7XG5cbiAgaWYgKCFzaG93U2V0dGluZ3MpIHJldHVybiBudWxsO1xuXG4gIHJldHVybiAoXG4gICAgPGRpdiBjbGFzc05hbWU9XCJmaXhlZCBpbnNldC0wIGJnLXNsYXRlLTk1MC84MCBiYWNrZHJvcC1ibHVyLXNtIHotWzEwMF0gZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgcC00XCI+XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImJnLXNsYXRlLTkwMCBib3JkZXIgYm9yZGVyLXNsYXRlLTcwMCBzaGFkb3ctMnhsIHJvdW5kZWQtbGcgdy1mdWxsIG1heC13LW1kIG92ZXJmbG93LWhpZGRlbiBmbGV4IGZsZXgtY29sIGgtWzgwdmhdXCI+XG4gICAgICAgIHsvKiBIZWFkZXIgKi99XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyIGJnLXNsYXRlLTgwMCBwLTQgYm9yZGVyLWIgYm9yZGVyLXNsYXRlLTcwMCBzaHJpbmstMFwiPlxuICAgICAgICAgIDxoMiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTEwMCBmb250LWJvbGQgdGV4dC1sZyBmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMlwiPlxuICAgICAgICAgICAgPHN2ZyB3aWR0aD1cIjIwXCIgaGVpZ2h0PVwiMjBcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2VXaWR0aD1cIjJcIiBzdHJva2VMaW5lY2FwPVwicm91bmRcIiBzdHJva2VMaW5lam9pbj1cInJvdW5kXCI+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIzXCIvPjxwYXRoIGQ9XCJNMTkuNCAxNWExLjY1IDEuNjUgMCAwIDAgLjMzIDEuODJsLjA2LjA2YTIgMiAwIDAgMSAwIDIuODMgMiAyIDAgMCAxLTIuODMgMGwtLjA2LS4wNmExLjY1IDEuNjUgMCAwIDAtMS44Mi0uMzMgMS42NSAxLjY1IDAgMCAwLTEgMS41MVYyMWEyIDIgMCAwIDEtMiAyIDIgMiAwIDAgMS0yLTJ2LS4wOUExLjY1IDEuNjUgMCAwIDAgOSAxOS40YTEuNjUgMS42NSAwIDAgMC0xLjgyLjMzbC0uMDYuMDZhMiAyIDAgMCAxLTIuODMgMCAyIDIgMCAwIDEgMC0yLjgzbC4wNi0uMDZhMS42NSAxLjY1IDAgMCAwIC4zMy0xLjgyIDEuNjUgMS42NSAwIDAgMC0xLjUxLTFIM2EyIDIgMCAwIDEtMi0yIDIgMiAwIDAgMSAyLTJoLjA5QTEuNjUgMS42NSAwIDAgMCA0LjYgOWExLjY1IDEuNjUgMCAwIDAtLjMzLTEuODJsLS4wNi0uMDZhMiAyIDAgMCAxIDAtMi44MyAyIDIgMCAwIDEgMi44MyAwbC4wNi4wNmExLjY1IDEuNjUgMCAwIDAgMS44Mi4zM0g5YTEuNjUgMS42NSAwIDAgMCAxLTEuNTFWM2EyIDIgMCAwIDEgMi0yIDIgMiAwIDAgMSAyIDJ2LjA5YTEuNjUgMS42NSAwIDAgMCAxIDEuNTEgMS42NSAxLjY1IDAgMCAwIDEuODItLjMzbC4wNi0uMDZhMiAyIDAgMCAxIDIuODMgMCAyIDIgMCAwIDEgMCAyLjgzbC0uMDYuMDZhMS42NSAxLjY1IDAgMCAwLS4zMyAxLjgyVjlhMS42NSAxLjY1IDAgMCAwIDEuNTEgMUgyMWEyIDIgMCAwIDEgMiAyIDIgMiAwIDAgMS0yIDJoLS4wOWExLjY1IDEuNjUgMCAwIDAtMS41MSAxelwiLz48L3N2Zz5cbiAgICAgICAgICAgIFByZWZlcmVuY2VzXG4gICAgICAgICAgPC9oMj5cbiAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IHNldFNob3dTZXR0aW5ncyhmYWxzZSl9IGNsYXNzTmFtZT1cInRleHQtc2xhdGUtNDAwIGhvdmVyOnRleHQtd2hpdGUgdHJhbnNpdGlvbi1jb2xvcnNcIiB0aXRsZT1cIkNsb3NlXCI+XG4gICAgICAgICAgICA8c3ZnIHdpZHRoPVwiMjRcIiBoZWlnaHQ9XCIyNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiIHN0cm9rZUxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZUxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTE4IDYgNiAxOFwiLz48cGF0aCBkPVwibTYgNiAxMiAxMlwiLz48L3N2Zz5cbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgey8qIFRhYnMgKi99XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBib3JkZXItYiBib3JkZXItc2xhdGUtNzAwIGJnLXNsYXRlLTkwMCBzaHJpbmstMFwiPlxuICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4gc2V0QWN0aXZlVGFiKCdWSUVXJyl9IGNsYXNzTmFtZT17YGZsZXgtMSBweS0yIHRleHQteHMgZm9udC1ib2xkICR7YWN0aXZlVGFiID09PSAnVklFVycgPyAndGV4dC1ibHVlLTQwMCBib3JkZXItYi0yIGJvcmRlci1ibHVlLTUwMCcgOiAndGV4dC1zbGF0ZS00MDAgaG92ZXI6dGV4dC1zbGF0ZS0yMDAnfSB0cmFuc2l0aW9uLWNvbG9yc2B9PlZpZXcgJiBHcmFwaGljczwvYnV0dG9uPlxuICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4gc2V0QWN0aXZlVGFiKCdUSEVNRScpfSBjbGFzc05hbWU9e2BmbGV4LTEgcHktMiB0ZXh0LXhzIGZvbnQtYm9sZCAke2FjdGl2ZVRhYiA9PT0gJ1RIRU1FJyA/ICd0ZXh0LWJsdWUtNDAwIGJvcmRlci1iLTIgYm9yZGVyLWJsdWUtNTAwJyA6ICd0ZXh0LXNsYXRlLTQwMCBob3Zlcjp0ZXh0LXNsYXRlLTIwMCd9IHRyYW5zaXRpb24tY29sb3JzYH0+VGhlbWluZzwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cblxuICAgICAgICB7LyogQm9keSAqL31cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJwLTYgc3BhY2UteS02IGZsZXgtMSBvdmVyZmxvdy15LWF1dG9cIj5cbiAgICAgICAgICAgIHthY3RpdmVUYWIgPT09ICdWSUVXJyAmJiAoXG4gICAgICAgICAgICAgIDw+XG4gICAgICAgICAgICB7LyogSW50ZXJhY3Rpb24gU2V0dGluZ3MgKi99XG4gICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgIDxoMyBjbGFzc05hbWU9XCJ0ZXh0LXhzIGZvbnQtYm9sZCB0ZXh0LXNsYXRlLTUwMCB1cHBlcmNhc2UgdHJhY2tpbmctd2lkZXIgbWItNCBib3JkZXItYiBib3JkZXItc2xhdGUtNzAwIHBiLTJcIj5JbnRlcmFjdGlvbiAmIFRvb2xzPC9oMz5cblxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic3BhY2UteS00XCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTIwMFwiPkdyaWQgU25hcCBSZXNvbHV0aW9uPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtc2xhdGUtNDAwXCI+VG9sZXJhbmNlIGZvciBzbmFwcGluZyB0b29scyAobW0pPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU9XCJudW1iZXJcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1pbj1cIjFcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlPXthcHBTZXR0aW5ncy5ncmlkU25hcFJlc29sdXRpb259XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVBcHBTZXR0aW5ncyh7IGdyaWRTbmFwUmVzb2x1dGlvbjogcGFyc2VJbnQoZS50YXJnZXQudmFsdWUpIHx8IDEwMCB9KX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJiZy1zbGF0ZS05NTAgdGV4dC1zbGF0ZS0yMDAgdGV4dC1zbSBwLTIgdy0yNCByb3VuZGVkIGJvcmRlciBib3JkZXItc2xhdGUtNzAwIHRleHQtcmlnaHQgZm9jdXM6Ym9yZGVyLWJsdWUtNTAwIG91dGxpbmUtbm9uZSB0cmFuc2l0aW9uLWNvbG9yc1wiXG4gICAgICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgganVzdGlmeS1iZXR3ZWVuIGl0ZW1zLWNlbnRlclwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtc20gZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS0yMDBcIj5QZXJzcGVjdGl2ZSBGT1Y8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS00MDBcIj5DYW1lcmEgZmllbGQgb2YgdmlldyBhbmdsZTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGdhcC0zXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU9XCJyYW5nZVwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1pbj1cIjIwXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF4PVwiOTBcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZT17YXBwU2V0dGluZ3MuY2FtZXJhRm92fVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZUFwcFNldHRpbmdzKHsgY2FtZXJhRm92OiBwYXJzZUludChlLnRhcmdldC52YWx1ZSkgfHwgNDUgfSl9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cImFjY2VudC1ibHVlLTUwMCB3LTI0XCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQteHMgZm9udC1tb25vIHRleHQtc2xhdGUtNDAwIHctNlwiPnthcHBTZXR0aW5ncy5jYW1lcmFGb3Z9wrA8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtMjAwXCI+Q2FtZXJhIE5lYXIgUGxhbmU8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZT1cIm51bWJlclwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWluPVwiMC4xXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZT17YXBwU2V0dGluZ3MuY2FtZXJhTmVhcn1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZUFwcFNldHRpbmdzKHsgY2FtZXJhTmVhcjogcGFyc2VGbG9hdChlLnRhcmdldC52YWx1ZSkgfHwgMSB9KX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJiZy1zbGF0ZS05NTAgdGV4dC1zbGF0ZS0yMDAgdGV4dC1zbSBwLTIgdy0yNCByb3VuZGVkIGJvcmRlciBib3JkZXItc2xhdGUtNzAwIHRleHQtcmlnaHQgZm9jdXM6Ym9yZGVyLWJsdWUtNTAwIG91dGxpbmUtbm9uZSB0cmFuc2l0aW9uLWNvbG9yc1wiXG4gICAgICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgganVzdGlmeS1iZXR3ZWVuIGl0ZW1zLWNlbnRlclwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtc20gZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS0yMDBcIj5DYW1lcmEgRmFyIFBsYW5lPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU9XCJudW1iZXJcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1pbj1cIjEwMDBcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlPXthcHBTZXR0aW5ncy5jYW1lcmFGYXJ9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVBcHBTZXR0aW5ncyh7IGNhbWVyYUZhcjogcGFyc2VJbnQoZS50YXJnZXQudmFsdWUpIHx8IDUwMDAwMCB9KX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJiZy1zbGF0ZS05NTAgdGV4dC1zbGF0ZS0yMDAgdGV4dC1zbSBwLTIgdy0yNCByb3VuZGVkIGJvcmRlciBib3JkZXItc2xhdGUtNzAwIHRleHQtcmlnaHQgZm9jdXM6Ym9yZGVyLWJsdWUtNTAwIG91dGxpbmUtbm9uZSB0cmFuc2l0aW9uLWNvbG9yc1wiXG4gICAgICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuXG5cbiAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICApfVxuXG4gICAgICAgICAgICB7YWN0aXZlVGFiID09PSAnVEhFTUUnICYmIChcbiAgICAgICAgICAgICAgPD5cbiAgICAgICAgICAgIHsvKiBQZXJmb3JtYW5jZSBTZXR0aW5ncyAqL31cbiAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgPGgzIGNsYXNzTmFtZT1cInRleHQteHMgZm9udC1ib2xkIHRleHQtc2xhdGUtNTAwIHVwcGVyY2FzZSB0cmFja2luZy13aWRlciBtYi00IGJvcmRlci1iIGJvcmRlci1zbGF0ZS03MDAgcGItMlwiPlBlcmZvcm1hbmNlIC8gR3JhcGhpY3M8L2gzPlxuXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJzcGFjZS15LTRcIj5cbiAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cImZsZXgganVzdGlmeS1iZXR3ZWVuIGl0ZW1zLWNlbnRlciBjdXJzb3ItcG9pbnRlciBncm91cFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtc20gZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS0yMDAgZ3JvdXAtaG92ZXI6dGV4dC1ibHVlLTQwMCB0cmFuc2l0aW9uLWNvbG9yc1wiPkRlYnVnIENvbnNvbGU8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS00MDBcIj5TaG93IGRlYnVnIG92ZXJsYXkgZm9yIHRvb2wgZXZlbnRzIGFuZCBzdGF0ZSBjaGFuZ2VzPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicmVsYXRpdmVcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgZGF0YS10ZXN0aWQ9XCJzZXR0aW5ncy1kZWJ1Zy1jb25zb2xlXCIgdHlwZT1cImNoZWNrYm94XCIgY2xhc3NOYW1lPVwic3Itb25seVwiIGNoZWNrZWQ9e2FwcFNldHRpbmdzLmRlYnVnQ29uc29sZUVuYWJsZWR9IG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlQXBwU2V0dGluZ3MoeyBkZWJ1Z0NvbnNvbGVFbmFibGVkOiBlLnRhcmdldC5jaGVja2VkIH0pfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgYmxvY2sgdy0xMCBoLTYgcm91bmRlZC1mdWxsIHRyYW5zaXRpb24tY29sb3JzICR7YXBwU2V0dGluZ3MuZGVidWdDb25zb2xlRW5hYmxlZCA/ICdiZy1ibHVlLTYwMCcgOiAnYmctc2xhdGUtNzAwJ31gfT48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17YGRvdCBhYnNvbHV0ZSBsZWZ0LTEgdG9wLTEgYmctd2hpdGUgdy00IGgtNCByb3VuZGVkLWZ1bGwgdHJhbnNpdGlvbi10cmFuc2Zvcm0gJHthcHBTZXR0aW5ncy5kZWJ1Z0NvbnNvbGVFbmFibGVkID8gJ3RyYW5zbGF0ZS14LTQnIDogJyd9YH0+PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9sYWJlbD5cblxuICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyIGN1cnNvci1wb2ludGVyIGdyb3VwXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTIwMCBncm91cC1ob3Zlcjp0ZXh0LWJsdWUtNDAwIHRyYW5zaXRpb24tY29sb3JzXCI+TGltaXQgUGl4ZWwgUmF0aW88L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS00MDBcIj5DYXBzIHJlbmRlcmluZyBhdCAxLjV4IHJlc29sdXRpb24gdG8gYm9vc3QgRlBTIG9uIE1hYy9IaWdoLURQSSBzY3JlZW5zPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicmVsYXRpdmVcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2xhc3NOYW1lPVwic3Itb25seVwiIGNoZWNrZWQ9e2FwcFNldHRpbmdzLmxpbWl0UGl4ZWxSYXRpb30gb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVBcHBTZXR0aW5ncyh7IGxpbWl0UGl4ZWxSYXRpbzogZS50YXJnZXQuY2hlY2tlZCB9KX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17YGJsb2NrIHctMTAgaC02IHJvdW5kZWQtZnVsbCB0cmFuc2l0aW9uLWNvbG9ycyAke2FwcFNldHRpbmdzLmxpbWl0UGl4ZWxSYXRpbyA/ICdiZy1ibHVlLTYwMCcgOiAnYmctc2xhdGUtNzAwJ31gfT48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17YGRvdCBhYnNvbHV0ZSBsZWZ0LTEgdG9wLTEgYmctd2hpdGUgdy00IGgtNCByb3VuZGVkLWZ1bGwgdHJhbnNpdGlvbi10cmFuc2Zvcm0gJHthcHBTZXR0aW5ncy5saW1pdFBpeGVsUmF0aW8gPyAndHJhbnNsYXRlLXgtNCcgOiAnJ31gfT48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2xhYmVsPlxuXG4gICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXIgY3Vyc29yLXBvaW50ZXIgZ3JvdXBcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtMjAwIGdyb3VwLWhvdmVyOnRleHQtYmx1ZS00MDAgdHJhbnNpdGlvbi1jb2xvcnNcIj5EaXNhYmxlIEFudGktQWxpYXNpbmc8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS00MDBcIj5UdXJuIG9mZiBNU0FBIChNYXNzaXZlIHBlcmZvcm1hbmNlIGJvb3N0IG9uIHdlYWsgR1BVcyk8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJyZWxhdGl2ZVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBjbGFzc05hbWU9XCJzci1vbmx5XCIgY2hlY2tlZD17YXBwU2V0dGluZ3MuZGlzYWJsZUFBfSBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZUFwcFNldHRpbmdzKHsgZGlzYWJsZUFBOiBlLnRhcmdldC5jaGVja2VkIH0pfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgYmxvY2sgdy0xMCBoLTYgcm91bmRlZC1mdWxsIHRyYW5zaXRpb24tY29sb3JzICR7YXBwU2V0dGluZ3MuZGlzYWJsZUFBID8gJ2JnLWJsdWUtNjAwJyA6ICdiZy1zbGF0ZS03MDAnfWB9PjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgZG90IGFic29sdXRlIGxlZnQtMSB0b3AtMSBiZy13aGl0ZSB3LTQgaC00IHJvdW5kZWQtZnVsbCB0cmFuc2l0aW9uLXRyYW5zZm9ybSAke2FwcFNldHRpbmdzLmRpc2FibGVBQSA/ICd0cmFuc2xhdGUteC00JyA6ICcnfWB9PjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtMjAwXCI+TGFiZWwgQ3VsbGluZyBEaXN0YW5jZTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC14cyB0ZXh0LXNsYXRlLTQwMFwiPkhpZGUgM0QgbGFiZWxzIGlmIGNhbWVyYSBpcyBmdXJ0aGVyIHRoYW4gdGhpcyAoMCB0byBkaXNhYmxlKTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlPVwibnVtYmVyXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtaW49XCIwXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGVwPVwiMTAwMFwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU9e2FwcFNldHRpbmdzLmxhYmVsQ3VsbERpc3RhbmNlfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlQXBwU2V0dGluZ3MoeyBsYWJlbEN1bGxEaXN0YW5jZTogcGFyc2VJbnQoZS50YXJnZXQudmFsdWUpIHx8IDAgfSl9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwiYmctc2xhdGUtOTUwIHRleHQtc2xhdGUtMjAwIHRleHQtc20gcC0yIHctMjQgcm91bmRlZCBib3JkZXIgYm9yZGVyLXNsYXRlLTcwMCB0ZXh0LXJpZ2h0IGZvY3VzOmJvcmRlci1ibHVlLTUwMCBvdXRsaW5lLW5vbmUgdHJhbnNpdGlvbi1jb2xvcnNcIlxuICAgICAgICAgICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgey8qIFRoZW1lIFByZXNldHMgKi99XG4gICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgIDxoMyBjbGFzc05hbWU9XCJ0ZXh0LXhzIGZvbnQtYm9sZCB0ZXh0LXNsYXRlLTUwMCB1cHBlcmNhc2UgdHJhY2tpbmctd2lkZXIgbWItNCBib3JkZXItYiBib3JkZXItc2xhdGUtNzAwIHBiLTJcIj5cbiAgICAgICAgICAgICAgICAgICAgU2NlbmUgVGhlbWVcbiAgICAgICAgICAgICAgICA8L2gzPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZ3JpZCBncmlkLWNvbHMtMiBnYXAtM1wiPlxuICAgICAgICAgICAgICAgICAgICB7T2JqZWN0LmVudHJpZXMoVEhFTUVfUFJFU0VUUyB8fCB7fSkubWFwKChba2V5LCBwcmVzZXRdKSA9PiAoXG4gICAgICAgICAgICAgICAgICAgICAgICA8YnV0dG9uXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAga2V5PXtrZXl9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGF0YS10ZXN0aWQ9e2B0aGVtZS1wcmVzZXQtJHtrZXl9YH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB1c2VTdG9yZS5nZXRTdGF0ZSgpLmFwcGx5VGhlbWUoa2V5KX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU9e2BwLTMgcm91bmRlZC1sZyBib3JkZXItMiB0cmFuc2l0aW9uLWFsbCAke1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcHBTZXR0aW5ncy50aGVtZSA9PT0ga2V5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA/ICdib3JkZXItYmx1ZS01MDAgYmctc2xhdGUtODAwIHNoYWRvdy1sZyBzaGFkb3ctYmx1ZS01MDAvMjAnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6ICdib3JkZXItc2xhdGUtNzAwIGhvdmVyOmJvcmRlci1zbGF0ZS01MDAgYmctc2xhdGUtODAwLzUwJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1gfVxuICAgICAgICAgICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHsvKiBUaGVtZSBwcmV2aWV3IHN3YXRjaCAqL31cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZ2FwLTEgbWItMlwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgtMSBoLTYgcm91bmRlZFwiIHN0eWxlPXt7IGJhY2tncm91bmRDb2xvcjogcHJlc2V0LmJhY2tncm91bmRDb2xvciB9fT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBoLWZ1bGwgaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIGdhcC0wLjUgcHgtMVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtPYmplY3QudmFsdWVzKHByZXNldC5jb21wb25lbnRDb2xvcnMpLnNsaWNlKDAsIDQpLm1hcCgoYywgaSkgPT4gKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGtleT17aX0gY2xhc3NOYW1lPVwidy0yIGgtMyByb3VuZGVkLXNtXCIgc3R5bGU9e3sgYmFja2dyb3VuZENvbG9yOiBjIH19IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSl9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidy00IGgtNiByb3VuZGVkXCIgc3R5bGU9e3sgYmFja2dyb3VuZENvbG9yOiBwcmVzZXQuc2VsZWN0aW9uQ29sb3IgfX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXhzIGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtMzAwXCI+e3ByZXNldC5sYWJlbH08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgKSl9XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgey8qIENvbXBvbmVudCBDb2xvcnMgKi99XG4gICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgIDxoMyBjbGFzc05hbWU9XCJ0ZXh0LXhzIGZvbnQtYm9sZCB0ZXh0LXNsYXRlLTUwMCB1cHBlcmNhc2UgdHJhY2tpbmctd2lkZXIgbWItNCBib3JkZXItYiBib3JkZXItc2xhdGUtNzAwIHBiLTJcIj5Db21wb25lbnQgQ29sb3JzPC9oMz5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImdyaWQgZ3JpZC1jb2xzLTIgZ2FwLTRcIj5cbiAgICAgICAgICAgICAgICAgICAge09iamVjdC5lbnRyaWVzKGFwcFNldHRpbmdzLmNvbXBvbmVudENvbG9ycykubWFwKChbdHlwZSwgY29sb3JdKSA9PiAoXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGtleT17dHlwZX0gY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTIwMFwiPnt0eXBlfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInJlbGF0aXZlIHctOCBoLTggcm91bmRlZCBvdmVyZmxvdy1oaWRkZW4gYm9yZGVyIGJvcmRlci1zbGF0ZS02MDBcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlPVwiY29sb3JcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU9e2NvbG9yfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVBcHBTZXR0aW5ncyh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50Q29sb3JzOiB7IC4uLmFwcFNldHRpbmdzLmNvbXBvbmVudENvbG9ycywgW3R5cGVdOiBlLnRhcmdldC52YWx1ZSB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cImFic29sdXRlIC10b3AtMiAtbGVmdC0yIHctMTIgaC0xMiBjdXJzb3ItcG9pbnRlclwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgKSl9XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgey8qIFZpc3VhbGl6YXRpb24gU2V0dGluZ3MgKi99XG4gICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgIDxoMyBjbGFzc05hbWU9XCJ0ZXh0LXhzIGZvbnQtYm9sZCB0ZXh0LXNsYXRlLTUwMCB1cHBlcmNhc2UgdHJhY2tpbmctd2lkZXIgbWItNCBib3JkZXItYiBib3JkZXItc2xhdGUtNzAwIHBiLTJcIj5WaXN1YWxpemF0aW9uPC9oMz5cblxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwic3BhY2UteS0zXCI+XG4gICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXIgY3Vyc29yLXBvaW50ZXIgZ3JvdXBcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtc2xhdGUtMjAwIGdyb3VwLWhvdmVyOnRleHQtYmx1ZS00MDAgdHJhbnNpdGlvbi1jb2xvcnNcIj5DZW50ZXIgT3JiaXQgb24gU2VsZWN0PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtc2xhdGUtNDAwXCI+T3JiaXQgY2FtZXJhIGFyb3VuZCBjbGlja2VkIHBvaW50PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicmVsYXRpdmVcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2xhc3NOYW1lPVwic3Itb25seVwiIGNoZWNrZWQ9e2FwcFNldHRpbmdzLmNlbnRlck9yYml0T25TZWxlY3R9IG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlQXBwU2V0dGluZ3MoeyBjZW50ZXJPcmJpdE9uU2VsZWN0OiBlLnRhcmdldC5jaGVja2VkIH0pfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgYmxvY2sgdy0xMCBoLTYgcm91bmRlZC1mdWxsIHRyYW5zaXRpb24tY29sb3JzICR7YXBwU2V0dGluZ3MuY2VudGVyT3JiaXRPblNlbGVjdCA/ICdiZy1ibHVlLTYwMCcgOiAnYmctc2xhdGUtNzAwJ31gfT48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17YGRvdCBhYnNvbHV0ZSBsZWZ0LTEgdG9wLTEgYmctd2hpdGUgdy00IGgtNCByb3VuZGVkLWZ1bGwgdHJhbnNpdGlvbi10cmFuc2Zvcm0gJHthcHBTZXR0aW5ncy5jZW50ZXJPcmJpdE9uU2VsZWN0ID8gJ3RyYW5zbGF0ZS14LTQnIDogJyd9YH0+PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9sYWJlbD5cblxuICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyIGN1cnNvci1wb2ludGVyIGdyb3VwXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LXNsYXRlLTIwMCBncm91cC1ob3Zlcjp0ZXh0LWJsdWUtNDAwIHRyYW5zaXRpb24tY29sb3JzXCI+U2hvdyBHcm91bmQgR3JpZDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC14cyB0ZXh0LXNsYXRlLTQwMFwiPkRpc3BsYXkgcmVmZXJlbmNlIGdyaWQgcGxhbmUgYXQgWT0wPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicmVsYXRpdmVcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2xhc3NOYW1lPVwic3Itb25seVwiIGNoZWNrZWQ9e2FwcFNldHRpbmdzLnNob3dHcmlkfSBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZUFwcFNldHRpbmdzKHsgc2hvd0dyaWQ6IGUudGFyZ2V0LmNoZWNrZWQgfSl9IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e2BibG9jayB3LTEwIGgtNiByb3VuZGVkLWZ1bGwgdHJhbnNpdGlvbi1jb2xvcnMgJHthcHBTZXR0aW5ncy5zaG93R3JpZCA/ICdiZy1ibHVlLTYwMCcgOiAnYmctc2xhdGUtNzAwJ31gfT48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17YGRvdCBhYnNvbHV0ZSBsZWZ0LTEgdG9wLTEgYmctd2hpdGUgdy00IGgtNCByb3VuZGVkLWZ1bGwgdHJhbnNpdGlvbi10cmFuc2Zvcm0gJHthcHBTZXR0aW5ncy5zaG93R3JpZCA/ICd0cmFuc2xhdGUteC00JyA6ICcnfWB9PjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG5cbiAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cImZsZXgganVzdGlmeS1iZXR3ZWVuIGl0ZW1zLWNlbnRlciBjdXJzb3ItcG9pbnRlciBncm91cFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtc20gZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS0yMDAgZ3JvdXAtaG92ZXI6dGV4dC1ibHVlLTQwMCB0cmFuc2l0aW9uLWNvbG9yc1wiPlNob3cgQXhpcyBIZWxwZXI8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS00MDBcIj5EaXNwbGF5IGdsb2JhbCBSR0IgY29vcmRpbmF0ZSBheGVzPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicmVsYXRpdmVcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2xhc3NOYW1lPVwic3Itb25seVwiIGNoZWNrZWQ9e2FwcFNldHRpbmdzLnNob3dBeGVzfSBvbkNoYW5nZT17KGUpID0+IHVwZGF0ZUFwcFNldHRpbmdzKHsgc2hvd0F4ZXM6IGUudGFyZ2V0LmNoZWNrZWQgfSl9IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e2BibG9jayB3LTEwIGgtNiByb3VuZGVkLWZ1bGwgdHJhbnNpdGlvbi1jb2xvcnMgJHthcHBTZXR0aW5ncy5zaG93QXhlcyA/ICdiZy1ibHVlLTYwMCcgOiAnYmctc2xhdGUtNzAwJ31gfT48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17YGRvdCBhYnNvbHV0ZSBsZWZ0LTEgdG9wLTEgYmctd2hpdGUgdy00IGgtNCByb3VuZGVkLWZ1bGwgdHJhbnNpdGlvbi10cmFuc2Zvcm0gJHthcHBTZXR0aW5ncy5zaG93QXhlcyA/ICd0cmFuc2xhdGUteC00JyA6ICcnfWB9PjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICApfVxuICAgICAgICA8L2Rpdj5cblxuICAgICAgICB7LyogRm9vdGVyICovfVxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJnLXNsYXRlLTgwMCBwLTQgYm9yZGVyLXQgYm9yZGVyLXNsYXRlLTcwMCBmbGV4IGp1c3RpZnktZW5kIHNocmluay0wXCI+XG4gICAgICAgICAgICA8YnV0dG9uXG4gICAgICAgICAgICAgICAgb25DbGljaz17KCkgPT4gc2V0U2hvd1NldHRpbmdzKGZhbHNlKX1cbiAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJiZy1ibHVlLTYwMCBob3ZlcjpiZy1ibHVlLTUwMCB0ZXh0LXdoaXRlIGZvbnQtbWVkaXVtIHB5LTIgcHgtNiByb3VuZGVkIHRleHQtc20gdHJhbnNpdGlvbi1jb2xvcnMgc2hhZG93LWxnXCJcbiAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICBEb25lXG4gICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgKTtcbn07XG4iXSwibWFwcGluZ3MiOiJBQUFBLE9BQU9BLEtBQUssTUFBTSxPQUFPO0FBQ3pCLFNBQVNDLFFBQVEsRUFBRUMsYUFBYSxRQUFRLHNCQUFzQjtBQUFDLFNBQUFDLEdBQUEsSUFBQUMsSUFBQSxFQUFBQyxJQUFBLElBQUFDLEtBQUEsRUFBQUMsUUFBQSxJQUFBQyxTQUFBO0FBRS9ELE9BQU8sTUFBTUMsYUFBYSxHQUFHQSxDQUFBLEtBQU07RUFDakMsTUFBTUMsWUFBWSxHQUFHVCxRQUFRLENBQUNVLEtBQUssSUFBSUEsS0FBSyxDQUFDRCxZQUFZLENBQUM7RUFDMUQsTUFBTUUsZUFBZSxHQUFHWCxRQUFRLENBQUNVLEtBQUssSUFBSUEsS0FBSyxDQUFDQyxlQUFlLENBQUM7RUFDaEUsTUFBTUMsV0FBVyxHQUFHWixRQUFRLENBQUNVLEtBQUssSUFBSUEsS0FBSyxDQUFDRSxXQUFXLENBQUM7RUFDeEQsTUFBTUMsaUJBQWlCLEdBQUdiLFFBQVEsQ0FBQ1UsS0FBSyxJQUFJQSxLQUFLLENBQUNHLGlCQUFpQixDQUFDO0VBRXBFLE1BQU0sQ0FBQ0MsU0FBUyxFQUFFQyxZQUFZLENBQUMsR0FBR2hCLEtBQUssQ0FBQ2lCLFFBQVEsQ0FBQyxNQUFNLENBQUM7RUFFeEQsSUFBSSxDQUFDUCxZQUFZLEVBQUUsT0FBTyxJQUFJO0VBRTlCLE9BQ0VOLElBQUE7SUFBS2MsU0FBUyxFQUFDLDZGQUE2RjtJQUFBQyxRQUFBLEVBQzFHYixLQUFBO01BQUtZLFNBQVMsRUFBQyxtSEFBbUg7TUFB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