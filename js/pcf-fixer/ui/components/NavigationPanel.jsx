import React from 'react';

import { useStore } from '../../store/useStore';

export const NavigationPanel = ({
    customEventName = 'canvas-set-view',
    interactionMode: controlledInteractionMode,
    onInteractionModeChange,
    className = 'top-4 right-4',
}) => {
    const storeInteractionMode = useStore(state => state.interactionMode);
    const setStoreInteractionMode = useStore(state => state.setInteractionMode);
    const interactionMode = controlledInteractionMode ?? storeInteractionMode;
    const setInteractionMode = onInteractionModeChange ?? setStoreInteractionMode;

    const setView = (viewType) => {
        window.dispatchEvent(new CustomEvent(customEventName, { detail: { viewType } }));
    };

    return (
        <div className={`absolute z-50 flex flex-col gap-1 bg-slate-900/80 backdrop-blur border border-slate-700 p-1 rounded shadow-lg pointer-events-auto ${className}`.trim()}>
            <button
                onClick={() => setInteractionMode(interactionMode === 'PAN' ? 'ROTATE' : 'PAN')}
                className={`w-8 h-8 flex items-center justify-center rounded transition ${interactionMode === 'PAN' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                title="Pan Tool"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>
            </button>
            <button
                onClick={() => setInteractionMode(interactionMode === 'ROTATE' ? 'PAN' : 'ROTATE')}
                className={`w-8 h-8 flex items-center justify-center rounded transition ${interactionMode === 'ROTATE' || !interactionMode ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                title="Orbit/Rotate Tool"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>

            <div className="w-6 h-px bg-slate-700 mx-auto my-1"></div>

            <button
                onClick={() => setView('HOME')}
                className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-700 transition"
                title="Reset/Home View"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </button>

            <button
                onClick={() => setView('TOP')}
                className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-700 transition font-bold text-[10px]"
                title="Top View"
            >
                TOP
            </button>
            <button
                onClick={() => setView('FRONT')}
                className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-700 transition font-bold text-[10px]"
                title="Front View"
            >
                FRNT
            </button>
            <button
                onClick={() => setView('RIGHT')}
                className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-700 transition font-bold text-[10px]"
                title="Right View"
            >
                RHT
            </button>
            <button
                onClick={() => setView('ISO')}
                className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-700 transition font-bold text-[10px]"
                title="Isometric View"
            >
                ISO
            </button>
            <div className="w-6 h-px bg-slate-700 mx-auto my-1"></div>
            <button
                onClick={() => setView('FIT')}
                className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-700 transition"
                title="Zoom to Fit"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            </button>
        </div>
    );
};
