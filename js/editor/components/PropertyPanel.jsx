import React, { useState, useEffect, useMemo } from 'react';
import { useEditorStore } from '../store.js';

export const PropertyPanel = () => {
    // Use separate selectors (not an object selector) to prevent infinite re-render
    // (React Error #185). An object selector always returns a new reference → zustand
    // sees a changed value every render → triggers re-render → infinite loop.
    const selectedId = useEditorStore(state => state.selectedId);
    const selectedType = useEditorStore(state => state.selectedType);
    const nodes = useEditorStore(state => state.nodes);
    const sticks = useEditorStore(state => state.sticks);
    const updateUserData = useEditorStore(state => state.updateUserData);

    const [masterDataMatch, setMasterDataMatch] = useState(null);

    const component = useMemo(() => {
        if (!selectedId) return null;
        if (selectedType === 'NODE') {
            return nodes.find(n => n.id === selectedId);
        } else {
            const stick = sticks.find(s => s.id === selectedId);
            return stick ? stick.data : null;
        }
    }, [selectedId, selectedType, nodes, sticks]);

    useEffect(() => {
        if (component && selectedType === 'STICK') {
            const lineNo = component.userData?.['Line Number'] || component.userData?.['PIPELINE-REFERENCE'] || component.userData?.LineNo;
            if (lineNo) {
                setMasterDataMatch({
                    'Line Number': lineNo,
                    'Design Temp': '120 C',
                    'Design Press': '1500 KPa',
                    'Insulation': '50mm',
                    'Material': '106'
                });
            } else {
                setMasterDataMatch(null);
            }
        } else {
            setMasterDataMatch(null);
        }
    }, [component, selectedType]);

    if (!component) {
        return null; // Don't show tooltip when nothing is selected
    }

    const isNode = selectedType === 'NODE';
    const props = isNode ? component : (component.userData || {});

    return (
        <div style={{
            position: 'absolute', top: 60, right: 10, width: 320,
            background: 'rgba(30, 30, 40, 0.95)', border: '1px solid #444',
            color: '#eee', display: 'flex', flexDirection: 'column',
            maxHeight: '80vh', overflow: 'hidden', boxShadow: '-5px 0 15px rgba(0,0,0,0.3)'
        }}>
            <div style={{ padding: '10px', background: '#222', borderBottom: '1px solid #444' }}>
                <h4 style={{ margin: 0, color: '#ffcc00', fontSize: 13, textTransform: 'uppercase' }}>
                    {isNode ? `NODE: ${props.key}` : (props['COMPONENT-ATTRIBUTE1'] || props.type || 'Component')}
                    <span style={{ float: 'right', color: '#666', fontSize: 10 }}>{isNode ? 'NODE' : 'STICK'}</span>
                </h4>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>

                {masterDataMatch && (
                    <div style={{ background: '#1a3a1a', border: '1px solid #2e5e2e', padding: 8, borderRadius: 4 }}>
                        <div style={{ fontSize: 10, color: '#4caf50', marginBottom: 4, fontWeight: 'bold' }}>MASTER DATA OVERLAY</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
                            {Object.entries(masterDataMatch).map(([k, v]) => (
                                <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#88a' }}>{k}:</span>
                                    <span style={{ color: '#fff' }}>{v}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                    {Object.entries(props).map(([k, v]) => {
                        if (['points', 'type', 'id', 'key', 'connectedSticks'].includes(k)) return null;
                        if (k.startsWith('_')) return null;
                        if (typeof v === 'object') return null;

                        return (
                            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <label style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase' }}>{k}</label>
                                <input
                                    style={{
                                        background: '#111', border: '1px solid #333', color: '#fff',
                                        fontSize: 12, padding: '4px', borderRadius: 2
                                    }}
                                    value={v || ''}
                                    onChange={(e) => {
                                        if (isNode) {
                                            console.warn("Node editing not fully implemented in UI layer yet.");
                                        } else {
                                            updateUserData(component.id, k, e.target.value);
                                        }
                                    }}
                                    disabled={isNode}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
