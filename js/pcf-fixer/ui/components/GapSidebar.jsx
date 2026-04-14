import React, { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import * as THREE from 'three';

export const GapSidebar = () => {
    const showGapRadar = useStore(state => state.showGapRadar);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const dataTable = useStore(state => state.dataTable);
    const [filterText, setFilterText] = useState('');


    const gaps = useMemo(() => {
        if (!showGapRadar || dataTable.length === 0) return [];
        const found = [];
        const topologyRows = dataTable.filter(r => (r.type || '').toUpperCase() !== 'SUPPORT' && (r.ep1 || r.ep2));

        for (let i = 0; i < topologyRows.length - 1; i++) {
            const elA = topologyRows[i];
            const elB = topologyRows[i + 1];
            if (elA.ep2 && elB.ep1) {
                const ptA = new THREE.Vector3(elA.ep2.x, elA.ep2.y, elA.ep2.z);
                const ptB = new THREE.Vector3(elB.ep1.x, elB.ep1.y, elB.ep1.z);
                const dist = ptA.distanceTo(ptB);
                if (dist > 0 && dist <= 25.0) {
                    found.push({ elA, elB, ptA, ptB, dist, mid: ptA.clone().lerp(ptB, 0.5) });
                }
            }
        }
        return found;
    }, [showGapRadar, dataTable]);


    const filteredGaps = useMemo(() => {
        if (!filterText) return gaps;
        const lower = filterText.toLowerCase();
        return gaps.filter(g =>
            String(g.elA._rowIndex).includes(lower) ||
            String(g.elB._rowIndex).includes(lower) ||
            g.elA.type?.toLowerCase().includes(lower) ||
            g.elB.type?.toLowerCase().includes(lower)
        );
    }, [gaps, filterText]);

    const handleZoomToGap = (gap) => {
        // Use the existing window event listener for focusing
        window.dispatchEvent(new CustomEvent('canvas-focus-point', {
            detail: {
                x: gap.mid.x,
                y: gap.mid.y,
                z: gap.mid.z,
                dist: 1000
            }
        }));
    };

    if (!showGapRadar || gaps.length === 0) return null;


    return (
        <div className={`bg-slate-900/90 border border-slate-700 shadow-xl rounded backdrop-blur flex flex-col pointer-events-auto transition-all ${isCollapsed ? 'w-48' : 'w-80 resize-x overflow-hidden max-w-[500px] min-w-[250px]'}`} style={{ maxHeight: 'calc(100vh - 12rem)' }}>
            <div className="flex items-center justify-between p-3 border-b border-slate-700/50 bg-slate-800/80 cursor-pointer" onClick={() => setIsCollapsed(!isCollapsed)}>
                <div className="flex items-center gap-2">
                    <span className="text-amber-500">⚠</span>
                    <h3 className="text-sm font-bold text-slate-200">Gap Radar ({filteredGaps.length})</h3>
                </div>
                <button className="text-slate-400 hover:text-white">
                    {isCollapsed ? '▼' : '▲'}
                </button>
            </div>

            {!isCollapsed && (
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="p-2 border-b border-slate-700/50 bg-slate-800/40">
                        <input
                            type="text"
                            placeholder="Filter gaps..."
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
                        />
                    </div>
                    <div className="overflow-y-auto p-2 flex flex-col gap-2 custom-scrollbar">
                        {filteredGaps.map((gap, i) => (
                            <div key={i} className="bg-slate-800/60 border border-slate-700 hover:border-amber-500/50 rounded p-2 cursor-pointer transition-colors group" onClick={() => handleZoomToGap(gap)}>
                                <div className="flex justify-between items-start mb-1">
                                    <div className="text-[10px] font-bold text-amber-500">Gap: {gap.dist.toFixed(1)}mm</div>
                                    <button className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity bg-slate-700 px-1.5 py-0.5 rounded">Zoom</button>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-300">R{gap.elA._rowIndex} <span className="text-slate-500 text-[10px]">{gap.elA.type}</span></span>
                                    <span className="text-slate-500 text-[10px]">➔</span>
                                    <span className="text-slate-300">R{gap.elB._rowIndex} <span className="text-slate-500 text-[10px]">{gap.elB.type}</span></span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
