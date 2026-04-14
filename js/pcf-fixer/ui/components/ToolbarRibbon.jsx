import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { useAppContext } from '../../store/AppContext';
import { dbg } from '../../utils/debugGate';
import { exportTableRowsToPcfx } from '../../../pcfx/adapters/Pcfx_PcfStudioAdapter.js';

const ToolGroup = ({ title, shortTitle, children }) => {
    const [collapsed, setCollapsed] = useState(false);
    if (collapsed) {
        return (
            <div className="flex flex-col border-r border-slate-700/50 pr-3 mr-3 last:border-0 last:mr-0 justify-center">
                <button onClick={() => setCollapsed(false)} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded border border-slate-600 transition-colors h-full flex items-center justify-center" title={`Expand ${title}`}>
                    {shortTitle}
                </button>
            </div>
        );
    }
    return (
        <div className="flex flex-col border-r border-slate-700/50 pr-3 mr-3 last:border-0 last:mr-0">
            <div className="flex items-center gap-1 mb-1 justify-center">{children}</div>
            <div className="flex items-center justify-center gap-1 mt-auto">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center font-semibold">{title}</span>
                <button onClick={() => setCollapsed(true)} className="text-slate-500 hover:text-slate-300 transition-colors" title="Collapse Group">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
            </div>
        </div>
    );
};

const ToolBtn = ({ active, onClick, title, children, color = 'slate' }) => {
    const base = "w-8 h-8 flex items-center justify-center rounded transition-colors duration-200 relative group";
    const colors = {
        slate: active ? "bg-slate-600 text-white shadow-inner" : "text-slate-400 hover:bg-slate-700 hover:text-slate-200",
        amber: active ? "bg-amber-600 text-white shadow-inner" : "text-amber-500 hover:bg-amber-900/50 hover:text-amber-400",
        emerald: active ? "bg-emerald-600 text-white shadow-inner" : "text-emerald-500 hover:bg-emerald-900/50 hover:text-emerald-400",
        red: active ? "bg-red-600 text-white shadow-inner" : "text-red-500 hover:bg-red-900/50 hover:text-red-400",
        blue: active ? "bg-blue-600 text-white shadow-inner" : "text-blue-500 hover:bg-blue-900/50 hover:text-blue-400",
        indigo: active ? "bg-indigo-600 text-white shadow-inner" : "text-indigo-500 hover:bg-indigo-900/50 hover:text-indigo-400",
    };
    return (
        <button onClick={onClick} className={`${base} ${colors[color]}`} title={title} data-testid={`toolbtn-${title.replace(/[^a-zA-Z]/g, '').toLowerCase()}`}>
            {children}
        </button>
    );
};

const TextBtn = ({ onClick, title, label, color = 'slate' }) => {
    const colors = {
        slate: "bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600",
        orange: "bg-orange-900/50 hover:bg-orange-800 text-orange-400 border-orange-800",
        red: "bg-red-900/50 hover:bg-red-800 text-red-400 border-red-800",
        blue: "bg-blue-900/50 hover:bg-blue-800 text-blue-400 border-blue-800",
    };
    return (
        <button onClick={onClick} className={`px-2 py-1 text-[11px] font-medium rounded border transition ${colors[color]}`} title={title}>
            {label}
        </button>
    );
};



export function ToolbarRibbon({ onFix6mm, onFix25mm, onAutoRef, onAutoCenter, onToggleSideInspector, showSideInspector, onPointerDown, onOverlapSolver }) {
    const { canvasMode, setCanvasMode, orthoMode, toggleOrthoMode, multiSelectedIds, translucentMode, setTranslucentMode, colorMode, setColorMode, setDrawMode } = useStore();
    const { state, dispatch } = useAppContext();
    const showDrawCanvasIcon = state.config?.enableDrawCanvas !== false;
    const [activeTab, setActiveTab] = useState('TOOLS');

    const handleHide = () => {
        useStore.getState().hideSelected();
    };

    const handleIsolate = () => {
        useStore.getState().isolateSelected();
    };

    const handleDelete = () => {
        const { multiSelectedIds, selectedElementId, pushHistory, deleteElements } = useStore.getState();
        const idsToDelete = multiSelectedIds.length > 0 ? multiSelectedIds : (selectedElementId ? [selectedElementId] : []);

        if (idsToDelete.length > 0) {
            if (window.confirm(`Delete ${idsToDelete.length} elements?`)) {
                pushHistory('Delete from Ribbon');
                dispatch({ type: "DELETE_ELEMENTS", payload: { rowIndices: idsToDelete } });
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

    return (
        <div className="z-40 bg-slate-900/95 backdrop-blur border border-slate-700 rounded shadow-xl flex flex-col pointer-events-auto">
            {/* Quick Access Toolbar & Tabs */}
            <div className="flex items-center justify-between px-2 bg-slate-800/80 border-b border-slate-700/50 cursor-move" onPointerDown={(e) => { e.stopPropagation(); onPointerDown && onPointerDown(e); }}>
                <div className="flex gap-2 text-[10px] font-bold text-slate-400">
                    {tabs.map(tab => (
                        <button
                            key={tab}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setActiveTab(tab); }}
                            className={`px-3 py-1.5 transition-colors border-b-2 ${activeTab === tab ? 'text-blue-400 border-blue-500 bg-slate-800' : 'border-transparent hover:text-slate-200 hover:bg-slate-700'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
                {/* Mode indicators / QAT could go here */}
            </div>

            {/* Ribbon Body */}
            <div className="flex items-start px-2 py-2 gap-2 overflow-x-auto custom-scrollbar min-h-[70px] w-full max-w-full" onPointerDown={(e) => e.stopPropagation()}>

                {activeTab === 'FILE' && (
                    <div className="flex shrink-0">
                         <ToolGroup title="Config" shortTitle="CFG">
                            <ToolBtn onClick={() => useStore.getState().setShowSettings(true)} title="Settings">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                            </ToolBtn>
                        </ToolGroup>
                    </div>
                )}

                {activeTab === 'ANALYSIS' && (
                    <div className="flex shrink-0">
                        <ToolGroup title="Auto Fixes" shortTitle="FIX">
                            <div className="flex gap-2">
                                <TextBtn onClick={onFix6mm} color="orange" label="Fix 6mm" title="Auto-close all gaps ≤ 6mm" />
                                <TextBtn onClick={onFix25mm} color="red" label="Fix 25mm" title="Insert pipe spool for gaps 6-25mm" />
                                <TextBtn onClick={onAutoRef} color="blue" label="Auto Pipe Ref" title="Auto-assign Pipeline Refs to blank components on branch" />
                                <TextBtn onClick={onOverlapSolver} color="purple" label="Overlap Solver" title="Trim pipes overlapping with rigid fittings" />
                            </div>
                        </ToolGroup>
                        <ToolGroup title="Visuals" shortTitle="VIS">
                            <ToolBtn active={useStore.getState().showGapRadar} onClick={() => useStore.getState().setShowGapRadar(!useStore.getState().showGapRadar)} color="amber" title="Toggle Gap Radar">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <circle cx="12" cy="12" r="6"/>
                                    <circle cx="12" cy="12" r="2"/>
                                </svg>
                            </ToolBtn>
                        </ToolGroup>
                    </div>
                )}

                {activeTab === 'VIEW' && (
                    <div className="flex shrink-0">
                        <ToolGroup title="Navigation" shortTitle="NAV">
                            <ToolBtn onClick={handleResetView} title="Home / Reset View">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                            </ToolBtn>
                            <ToolBtn onClick={() => window.dispatchEvent(new CustomEvent('canvas-auto-center'))} title="Zoom to Fit">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14v4a2 2 0 0 0 2 2h4"/><path d="M20 10V6a2 2 0 0 0-2-2h-4"/><path d="M14 20h4a2 2 0 0 0 2-2v-4"/><path d="M4 10V6a2 2 0 0 1 2-2h4"/><circle cx="12" cy="12" r="2"/></svg>
                            </ToolBtn>
                            <ToolBtn active={!useStore.getState().orthoMode} onClick={() => useStore.getState().toggleOrthoMode()} color="blue" title="Toggle Perspective / Orthographic (O)">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                            </ToolBtn>
                        </ToolGroup>

                        <ToolGroup title="Visibility" shortTitle="VIS">
                            <ToolBtn active={useStore.getState().hiddenElementIds.length > 0} onClick={() => useStore.getState().unhideAll()} color="emerald" title="Show All Components (U)">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </ToolBtn>
                            <ToolBtn active={false} onClick={() => useStore.getState().isolateSelected()} color="amber" title="Isolate Selected (H)">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12H3"/><path d="M12 21V3"/></svg>
                            </ToolBtn>
                            <div className="w-px h-6 bg-slate-700 mx-1 self-center"></div>
                            <ToolBtn active={useStore.getState().translucentMode} onClick={() => useStore.getState().setTranslucentMode(!useStore.getState().translucentMode)} color="blue" title="Toggle Translucent View">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
                            </ToolBtn>
                        </ToolGroup>

                        <ToolGroup title="Shading" shortTitle="SHADE">
                            <select
                                value={colorMode}
                                onChange={(e) => setColorMode(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                        setColorMode('');
                                        e.target.blur();
                                    }
                                }}
                                className="h-7 bg-slate-700 text-slate-300 text-[11px] rounded border border-slate-600 px-2 outline-none focus:border-indigo-500 cursor-pointer w-32"
                            >
                                <option value="">None (Default)</option>
                                <option value="TYPE">Color by Type</option>
                                <option value="SPOOL">Color by Spool</option>
                                <option value="PIPELINE_REF">Color by Pipeline Ref</option>
                                <option value="ERROR">Color by Error</option>
                                <option value="LINENO_KEY">Color by LineNo Key</option>
                                <option value="RATING">Color by Rating</option>
                                <option value="PIPING_CLASS">Color by Piping Class</option>
                                {[97,98,1,2,3,4,5,6,7,8,9,10].map(n => (
                                    <option key={`ca${n}`} value={`CA${n}`}>Color by CA{n}</option>
                                ))}
                            </select>
                        </ToolGroup>

                        <ToolGroup title="Labels" shortTitle="LBL">
                            <ToolBtn active={useStore.getState().showRowLabels} onClick={() => {
                                const current = useStore.getState().showRowLabels;
                                useStore.getState().setShowRowLabels(!current);
                                if (!current) useStore.getState().setTranslucentMode(true);
                            }} color="amber" title="Toggle Row No. (R)">
                                <div className="font-bold text-xs">R</div>
                            </ToolBtn>
                            <ToolBtn active={useStore.getState().showRefLabels} onClick={() => {
                                const current = useStore.getState().showRefLabels;
                                useStore.getState().setShowRefLabels(!current);
                                if (!current) useStore.getState().setTranslucentMode(true);
                            }} color="blue" title="Toggle Pipeline Ref">
                                <div className="font-bold text-[10px]">Ref</div>
                            </ToolBtn>
                        </ToolGroup>
                    </div>
                )}

                {activeTab === 'TOOLS' && (
                    <div className="flex shrink-0">
                        <ToolGroup title="Select / Modify">
                            {showDrawCanvasIcon && (
                                <>
                                    <ToolBtn onClick={() => setDrawMode(true)} color="indigo" title="Open Draw Canvas">
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                    </ToolBtn>
                                    <div className="w-px h-6 bg-slate-700 mx-1 self-center"></div>
                                </>
                            )}
                            <ToolBtn active={canvasMode === 'MARQUEE_SELECT'} onClick={() => {
                                const next = canvasMode === 'MARQUEE_SELECT' ? 'VIEW' : 'MARQUEE_SELECT';
                                dbg.tool('MARQUEE_SELECT', `Button clicked → ${next}`);
                                setCanvasMode(next);
                            }} color="blue" title="Box Select">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeDasharray="4 4" /></svg>
                            </ToolBtn>
                            <ToolBtn active={canvasMode === 'MARQUEE_ZOOM'} onClick={() => {
                                const next = canvasMode === 'MARQUEE_ZOOM' ? 'VIEW' : 'MARQUEE_ZOOM';
                                dbg.tool('MARQUEE_ZOOM', `Button clicked → ${next}`);
                                setCanvasMode(next);
                            }} color="indigo" title="Box Zoom">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><rect x="8" y="8" width="6" height="6" strokeDasharray="2 2"/></svg>
                            </ToolBtn>
                            <div className="w-px h-6 bg-slate-700 mx-1 self-center"></div>
                            <ToolBtn onClick={handleDelete} color="red" title="Delete Selected (Del)">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                            </ToolBtn>
                        </ToolGroup>

                        <ToolGroup title="Edit Modes" shortTitle="EDIT">
                            <ToolBtn active={canvasMode === 'CONNECT'} onClick={() => {
                                const next = canvasMode === 'CONNECT' ? 'VIEW' : 'CONNECT';
                                dbg.tool('CONNECT', `Button clicked → ${next}`);
                                setCanvasMode(next);
                            }} color="amber" title="Connect (C)">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                            </ToolBtn>
                            <ToolBtn active={canvasMode === 'STRETCH'} onClick={() => {
                                const next = canvasMode === 'STRETCH' ? 'VIEW' : 'STRETCH';
                                dbg.tool('STRETCH', `Button clicked → ${next}`);
                                setCanvasMode(next);
                            }} color="emerald" title="Stretch (T)">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M15 16l4-4-4-4"/><path d="M9 8l-4 4 4 4"/></svg>
                            </ToolBtn>
                            <ToolBtn active={canvasMode === 'BREAK'} onClick={() => {
                                const next = canvasMode === 'BREAK' ? 'VIEW' : 'BREAK';
                                dbg.tool('BREAK', `Button clicked → ${next}`);
                                setCanvasMode(next);
                            }} color="red" title="Break (B)">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                            </ToolBtn>
                            <ToolBtn active={canvasMode === 'MEASURE'} onClick={() => {
                                const next = canvasMode === 'MEASURE' ? 'VIEW' : 'MEASURE';
                                dbg.tool('MEASURE', `Button clicked → ${next}`);
                                setCanvasMode(next);
                            }} color="amber" title="Measure (M)">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 1 0 2.829 2.828z"/><path d="m6.3 14.5-4 4"/><path d="m16 5.3-4 4"/></svg>
                            </ToolBtn>
                            <div className="w-px h-6 bg-slate-700 mx-1 self-center"></div>
                            <ToolBtn active={useStore.getState().clippingPlaneEnabled} onClick={() => {
                                dbg.tool('CLIPPING_PLANE', `Button clicked → ${!useStore.getState().clippingPlaneEnabled}`);
                                useStore.getState().setClippingPlaneEnabled(!useStore.getState().clippingPlaneEnabled)
                            }} color="slate" title="Toggle Section Box">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18"/><path d="M3 12h18"/><path d="M3 3h18v18H3z"/></svg>
                            </ToolBtn>
                            <ToolBtn active={canvasMode === 'INSERT_SUPPORT'} onClick={() => {
                                const next = canvasMode === 'INSERT_SUPPORT' ? 'VIEW' : 'INSERT_SUPPORT';
                                dbg.tool('INSERT_SUPPORT', `Button clicked → ${next}`);
                                setCanvasMode(next);
                            }} color="emerald" title="Insert Support (I)">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22V8"/><path d="M8 8h8"/><path d="M12 8l-3 -6h6z"/></svg>
                            </ToolBtn>
                            <ToolBtn active={canvasMode === 'ASSIGN_PIPELINE'} onClick={() => {
                                const next = canvasMode === 'ASSIGN_PIPELINE' ? 'VIEW' : 'ASSIGN_PIPELINE';
                                dbg.tool('ASSIGN_PIPELINE', `Button clicked → ${next}`);
                                setCanvasMode(next);
                            }} color="blue" title="Assign Pipeline Ref">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            </ToolBtn>
                        </ToolGroup>

                        <ToolGroup title="Panels" shortTitle="PANELS">
                            <ToolBtn active={useStore.getState().showSideInspector} onClick={() => useStore.getState().setShowSideInspector(!useStore.getState().showSideInspector)} title="Toggle Side Panel">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                            </ToolBtn>
                        </ToolGroup>
                    </div>
                )}

                {activeTab === 'EXPORT' && (
                    <div className="flex shrink-0">
                        <ToolGroup title="Export Data" shortTitle="EXP">
                             {/* Placeholder for future export actions */}
                             <TextBtn onClick={() => {}} color="slate" label="Export PCF" title="Export current model to PCF format" />
                             <TextBtn onClick={() => {
                                const dataTable = useStore.getState().dataTable;
                                if (!dataTable || dataTable.length === 0) return;
                                const pcfxJson = exportTableRowsToPcfx(dataTable);
                                const blob = new Blob([JSON.stringify(pcfxJson, null, 2)], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'pcfx-export.pcfx';
                                a.click();
                                URL.revokeObjectURL(url);
                             }} color="emerald" label="Export PCFX" title="Export current model to PCFX format" />
                        </ToolGroup>
                    </div>
                )}
            </div>
        </div>
    );
}
