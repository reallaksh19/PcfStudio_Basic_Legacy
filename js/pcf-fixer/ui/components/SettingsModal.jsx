import React from 'react';
import { useStore, THEME_PRESETS } from '../../store/useStore';

export const SettingsModal = () => {
  const showSettings = useStore(state => state.showSettings);
  const setShowSettings = useStore(state => state.setShowSettings);
  const appSettings = useStore(state => state.appSettings);
  const updateAppSettings = useStore(state => state.updateAppSettings);

  const [activeTab, setActiveTab] = React.useState('VIEW');

  if (!showSettings) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 shadow-2xl rounded-lg w-full max-w-md overflow-hidden flex flex-col h-[80vh]">
        {/* Header */}
        <div className="flex justify-between items-center bg-slate-800 p-4 border-b border-slate-700 shrink-0">
          <h2 className="text-slate-100 font-bold text-lg flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Preferences
          </h2>
          <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white transition-colors" title="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700 bg-slate-900 shrink-0">
          <button onClick={() => setActiveTab('VIEW')} className={`flex-1 py-2 text-xs font-bold ${activeTab === 'VIEW' ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200'} transition-colors`}>View & Graphics</button>
          <button onClick={() => setActiveTab('THEME')} className={`flex-1 py-2 text-xs font-bold ${activeTab === 'THEME' ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200'} transition-colors`}>Theming</button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
            {activeTab === 'VIEW' && (
              <>
            {/* Interaction Settings */}
            <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-700 pb-2">Interaction & Tools</h3>

                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <div className="text-sm font-medium text-slate-200">Grid Snap Resolution</div>
                            <div className="text-xs text-slate-400">Tolerance for snapping tools (mm)</div>
                        </div>
                        <input
                            type="number"
                            min="1"
                            value={appSettings.gridSnapResolution}
                            onChange={(e) => updateAppSettings({ gridSnapResolution: parseInt(e.target.value) || 100 })}
                            className="bg-slate-950 text-slate-200 text-sm p-2 w-24 rounded border border-slate-700 text-right focus:border-blue-500 outline-none transition-colors"
                        />
                    </div>

                    <div className="flex justify-between items-center">
                        <div>
                            <div className="text-sm font-medium text-slate-200">Perspective FOV</div>
                            <div className="text-xs text-slate-400">Camera field of view angle</div>
                        </div>
                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                min="20"
                                max="90"
                                value={appSettings.cameraFov}
                                onChange={(e) => updateAppSettings({ cameraFov: parseInt(e.target.value) || 45 })}
                                className="accent-blue-500 w-24"
                            />
                            <span className="text-xs font-mono text-slate-400 w-6">{appSettings.cameraFov}°</span>
                        </div>
                    </div>

                    <div className="flex justify-between items-center">
                        <div>
                            <div className="text-sm font-medium text-slate-200">Camera Near Plane</div>
                        </div>
                        <input
                            type="number"
                            min="0.1"
                            value={appSettings.cameraNear}
                            onChange={(e) => updateAppSettings({ cameraNear: parseFloat(e.target.value) || 1 })}
                            className="bg-slate-950 text-slate-200 text-sm p-2 w-24 rounded border border-slate-700 text-right focus:border-blue-500 outline-none transition-colors"
                        />
                    </div>

                    <div className="flex justify-between items-center">
                        <div>
                            <div className="text-sm font-medium text-slate-200">Camera Far Plane</div>
                        </div>
                        <input
                            type="number"
                            min="1000"
                            value={appSettings.cameraFar}
                            onChange={(e) => updateAppSettings({ cameraFar: parseInt(e.target.value) || 500000 })}
                            className="bg-slate-950 text-slate-200 text-sm p-2 w-24 rounded border border-slate-700 text-right focus:border-blue-500 outline-none transition-colors"
                        />
                    </div>
                </div>
            </div>


              </>
            )}

            {activeTab === 'THEME' && (
              <>
            {/* Performance Settings */}
            <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-700 pb-2">Performance / Graphics</h3>

                <div className="space-y-4">
                    <label className="flex justify-between items-center cursor-pointer group">
                        <div>
                            <div className="text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors">Debug Console</div>
                            <div className="text-xs text-slate-400">Show debug overlay for tool events and state changes</div>
                        </div>
                        <div className="relative">
                            <input data-testid="settings-debug-console" type="checkbox" className="sr-only" checked={appSettings.debugConsoleEnabled} onChange={(e) => updateAppSettings({ debugConsoleEnabled: e.target.checked })} />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${appSettings.debugConsoleEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${appSettings.debugConsoleEnabled ? 'translate-x-4' : ''}`}></div>
                        </div>
                    </label>

                    <label className="flex justify-between items-center cursor-pointer group">
                        <div>
                            <div className="text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors">Limit Pixel Ratio</div>
                            <div className="text-xs text-slate-400">Caps rendering at 1.5x resolution to boost FPS on Mac/High-DPI screens</div>
                        </div>
                        <div className="relative">
                            <input type="checkbox" className="sr-only" checked={appSettings.limitPixelRatio} onChange={(e) => updateAppSettings({ limitPixelRatio: e.target.checked })} />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${appSettings.limitPixelRatio ? 'bg-blue-600' : 'bg-slate-700'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${appSettings.limitPixelRatio ? 'translate-x-4' : ''}`}></div>
                        </div>
                    </label>

                    <label className="flex justify-between items-center cursor-pointer group">
                        <div>
                            <div className="text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors">Disable Anti-Aliasing</div>
                            <div className="text-xs text-slate-400">Turn off MSAA (Massive performance boost on weak GPUs)</div>
                        </div>
                        <div className="relative">
                            <input type="checkbox" className="sr-only" checked={appSettings.disableAA} onChange={(e) => updateAppSettings({ disableAA: e.target.checked })} />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${appSettings.disableAA ? 'bg-blue-600' : 'bg-slate-700'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${appSettings.disableAA ? 'translate-x-4' : ''}`}></div>
                        </div>
                    </label>

                    <div className="flex justify-between items-center">
                        <div>
                            <div className="text-sm font-medium text-slate-200">Label Culling Distance</div>
                            <div className="text-xs text-slate-400">Hide 3D labels if camera is further than this (0 to disable)</div>
                        </div>
                        <input
                            type="number"
                            min="0"
                            step="1000"
                            value={appSettings.labelCullDistance}
                            onChange={(e) => updateAppSettings({ labelCullDistance: parseInt(e.target.value) || 0 })}
                            className="bg-slate-950 text-slate-200 text-sm p-2 w-24 rounded border border-slate-700 text-right focus:border-blue-500 outline-none transition-colors"
                        />
                    </div>
                </div>
            </div>

            {/* Theme Presets */}
            <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-700 pb-2">
                    Scene Theme
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    {Object.entries(THEME_PRESETS || {}).map(([key, preset]) => (
                        <button
                            key={key}
                            data-testid={`theme-preset-${key}`}
                            onClick={() => useStore.getState().applyTheme(key)}
                            className={`p-3 rounded-lg border-2 transition-all ${
                                appSettings.theme === key
                                    ? 'border-blue-500 bg-slate-800 shadow-lg shadow-blue-500/20'
                                    : 'border-slate-700 hover:border-slate-500 bg-slate-800/50'
                            }`}
                        >
                            {/* Theme preview swatch */}
                            <div className="flex gap-1 mb-2">
                                <div className="flex-1 h-6 rounded" style={{ backgroundColor: preset.backgroundColor }}>
                                    <div className="flex h-full items-center justify-center gap-0.5 px-1">
                                        {Object.values(preset.componentColors).slice(0, 4).map((c, i) => (
                                            <div key={i} className="w-2 h-3 rounded-sm" style={{ backgroundColor: c }} />
                                        ))}
                                    </div>
                                </div>
                                <div className="w-4 h-6 rounded" style={{ backgroundColor: preset.selectionColor }} />
                            </div>
                            <span className="text-xs font-medium text-slate-300">{preset.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Component Colors */}
            <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-700 pb-2">Component Colors</h3>
                <div className="grid grid-cols-2 gap-4">
                    {Object.entries(appSettings.componentColors).map(([type, color]) => (
                        <div key={type} className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-200">{type}</span>
                            <div className="relative w-8 h-8 rounded overflow-hidden border border-slate-600">
                                <input
                                    type="color"
                                    value={color}
                                    onChange={(e) => updateAppSettings({
                                        componentColors: { ...appSettings.componentColors, [type]: e.target.value }
                                    })}
                                    className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Visualization Settings */}
            <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-700 pb-2">Visualization</h3>

                <div className="space-y-3">
                    <label className="flex justify-between items-center cursor-pointer group">
                        <div>
                            <div className="text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors">Center Orbit on Select</div>
                            <div className="text-xs text-slate-400">Orbit camera around clicked point</div>
                        </div>
                        <div className="relative">
                            <input type="checkbox" className="sr-only" checked={appSettings.centerOrbitOnSelect} onChange={(e) => updateAppSettings({ centerOrbitOnSelect: e.target.checked })} />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${appSettings.centerOrbitOnSelect ? 'bg-blue-600' : 'bg-slate-700'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${appSettings.centerOrbitOnSelect ? 'translate-x-4' : ''}`}></div>
                        </div>
                    </label>

                    <label className="flex justify-between items-center cursor-pointer group">
                        <div>
                            <div className="text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors">Show Ground Grid</div>
                            <div className="text-xs text-slate-400">Display reference grid plane at Y=0</div>
                        </div>
                        <div className="relative">
                            <input type="checkbox" className="sr-only" checked={appSettings.showGrid} onChange={(e) => updateAppSettings({ showGrid: e.target.checked })} />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${appSettings.showGrid ? 'bg-blue-600' : 'bg-slate-700'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${appSettings.showGrid ? 'translate-x-4' : ''}`}></div>
                        </div>
                    </label>

                    <label className="flex justify-between items-center cursor-pointer group">
                        <div>
                            <div className="text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors">Show Axis Helper</div>
                            <div className="text-xs text-slate-400">Display global RGB coordinate axes</div>
                        </div>
                        <div className="relative">
                            <input type="checkbox" className="sr-only" checked={appSettings.showAxes} onChange={(e) => updateAppSettings({ showAxes: e.target.checked })} />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${appSettings.showAxes ? 'bg-blue-600' : 'bg-slate-700'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${appSettings.showAxes ? 'translate-x-4' : ''}`}></div>
                        </div>
                    </label>
                </div>
            </div>
              </>
            )}
        </div>

        {/* Footer */}
        <div className="bg-slate-800 p-4 border-t border-slate-700 flex justify-end shrink-0">
            <button
                onClick={() => setShowSettings(false)}
                className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-6 rounded text-sm transition-colors shadow-lg"
            >
                Done
            </button>
        </div>
      </div>
    </div>
  );
};
