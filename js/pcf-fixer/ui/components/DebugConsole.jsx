import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { dbg } from '../../utils/debugGate';
import { useStore } from '../../store/useStore';

const DebugEntry = memo(({ entry, isExpanded, onToggle }) => {
    return (
        <div className="font-mono text-[10px] leading-relaxed border-b border-slate-800/50 py-1 px-2 hover:bg-slate-800/30 transition-colors">
            <div className="flex gap-2 cursor-pointer" onClick={() => onToggle(entry.id)}>
                <span className="text-slate-500 w-12 shrink-0">{(entry.timestamp / 1000).toFixed(3)}</span>
                <span className="w-5 text-center shrink-0" title={entry.channel}>{entry.channelMeta.prefix}</span>
                <span style={{ color: entry.channelMeta.color }} className="w-24 shrink-0 font-bold truncate" title={entry.source}>
                    {entry.source}
                </span>
                <span className="text-slate-300 break-all">{entry.message}</span>
                {entry.data && (
                    <span className="text-slate-500 ml-auto pl-2">
                        {isExpanded ? '▼' : '▶'}
                    </span>
                )}
            </div>
            {isExpanded && entry.data && (
                <div className="mt-1 pl-20 pr-2 pb-1 text-slate-400 overflow-x-auto">
                    <pre className="m-0 p-2 bg-slate-900/50 rounded border border-slate-700/50">{JSON.stringify(entry.data, null, 2)}</pre>
                </div>
            )}
        </div>
    );
});

export const DebugConsole = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [entries, setEntries] = useState([]);
    const [filter, setFilter] = useState('');
    const [activeChannels, setActiveChannels] = useState(new Set(['*']));
    const [isPaused, setIsPaused] = useState(false);
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [pos, setPos] = useState({ x: 20, y: window.innerHeight - 340 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const scrollRef = useRef(null);
    const isAutoScroll = useRef(true);

    useEffect(() => {
        const unsub = dbg.subscribe((entry) => {
            if (!isPaused && entry) {
                setEntries(prev => [...prev.slice(-499), entry]);
            }
        });
        return unsub;
    }, [isPaused]);

    useEffect(() => {
        if (isOpen && isAutoScroll.current && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [entries, isOpen]);

    const handleScroll = (e) => {
        const target = e.target;
        const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 10;
        isAutoScroll.current = isAtBottom;
    };

    const handleToggleChannel = (channel) => {
        setActiveChannels(prev => {
            const next = new Set(prev);
            if (next.has('*')) {
                next.clear();
                Object.keys(dbg.CHANNELS).forEach(c => c !== channel && next.add(c));
            } else if (next.has(channel)) {
                next.delete(channel);
                if (next.size === 0) next.add('*');
            } else {
                next.add(channel);
                if (next.size === Object.keys(dbg.CHANNELS).length) {
                    next.clear();
                    next.add('*');
                }
            }
            return next;
        });
    };

    const handleClear = () => {
        dbg.clear();
        setEntries([]);
        setExpandedIds(new Set());
    };

    const handleExport = () => {
        const blob = new Blob([JSON.stringify(dbg.getEntries(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debug_log_${Date.now()}.json`;
        a.click();
    };

    const handleToggleExpand = useCallback((id) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handlePointerDown = (e) => {
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - pos.x,
            y: e.clientY - pos.y
        });
        e.target.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
        if (!isDragging) return;
        setPos({
            x: e.clientX - dragOffset.x,
            y: e.clientY - dragOffset.y
        });
    };

    const handlePointerUp = (e) => {
        setIsDragging(false);
        e.target.releasePointerCapture(e.pointerId);
    };

    const filteredEntries = entries.filter(e => {
        if (!activeChannels.has('*') && !activeChannels.has(e.channel)) return false;
        if (filter && !e.source.toLowerCase().includes(filter.toLowerCase()) && !e.message.toLowerCase().includes(filter.toLowerCase())) return false;
        return true;
    });

    const { appSettings } = useStore();

    if (!appSettings.debugConsoleEnabled) return null;

    if (!isOpen) {
        return (
            <button
                data-debug-console
                onClick={() => setIsOpen(true)}
                className="absolute bottom-10 left-4 z-[9999] bg-slate-900 border border-slate-700 text-xl p-2 rounded-full shadow-lg hover:bg-slate-800 transition-colors flex items-center justify-center pointer-events-auto"
                title="Open Debug Console"
            >
                🐛
                {entries.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                        {entries.length}
                    </span>
                )}
            </button>
        );
    }

    return (
        <div
            className="absolute z-[9999] bg-slate-950/95 border border-slate-700 rounded-lg shadow-2xl flex flex-col pointer-events-auto overflow-hidden"
            style={{ width: 450, height: 340, left: pos.x, top: pos.y }}
        >
            {/* Header */}
            <div
                className="bg-slate-900 border-b border-slate-700 p-2 flex items-center justify-between cursor-move select-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <div className="flex items-center gap-2 pointer-events-none">
                    <span className="text-sm">🐛</span>
                    <span className="font-bold text-xs text-slate-200">DEBUG CONSOLE</span>
                </div>
                <div className="flex gap-1" onPointerDown={e => e.stopPropagation()}>
                    {Object.entries(dbg.CHANNELS).map(([key, meta]) => {
                        const isActive = activeChannels.has('*') || activeChannels.has(key);
                        return (
                            <button
                                key={key}
                                data-debug-channel-pill
                                onClick={() => handleToggleChannel(key)}
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${isActive ? 'bg-slate-800 text-white' : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800'}`}
                                style={{ borderColor: isActive ? meta.color : 'transparent', color: isActive ? meta.color : undefined }}
                                title={key}
                            >
                                {meta.prefix}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Toolbar */}
            <div className="bg-slate-900 border-b border-slate-800 p-2 flex gap-2 items-center">
                <input
                    type="text"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder="Filter logs..."
                    className="flex-1 bg-slate-950 text-slate-200 text-xs px-2 py-1 rounded border border-slate-700 focus:border-blue-500 outline-none"
                />
                <button onClick={handleClear} className="text-[10px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700">Clear</button>
                <button onClick={handleExport} className="text-[10px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700">Export</button>
                <button onClick={() => setIsPaused(!isPaused)} className={`text-[10px] px-2 py-1 rounded border ${isPaused ? 'bg-amber-900/50 text-amber-500 border-amber-800' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}>
                    {isPaused ? '▶ Resume' : '⏸ Pause'}
                </button>
                <button onClick={() => setIsOpen(false)} className="text-[10px] px-2 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded border border-red-900/50 ml-1">✕</button>
            </div>

            {/* Log List */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto custom-scrollbar"
            >
                {filteredEntries.map(entry => (
                    <DebugEntry key={entry.id} entry={entry} isExpanded={expandedIds.has(entry.id)} onToggle={handleToggleExpand} />
                ))}
                {filteredEntries.length === 0 && (
                    <div className="text-center text-slate-500 text-xs mt-4 italic">No entries match the current filters.</div>
                )}
            </div>

            {/* Footer */}
            <div className="bg-slate-900 border-t border-slate-800 px-2 py-1 flex justify-between text-[10px] text-slate-500">
                <span>Entries: {filteredEntries.length} / {entries.length}</span>
                <span>Channels: {activeChannels.has('*') ? 'All' : activeChannels.size} active</span>
            </div>
        </div>
    );
};