import * as THREE from 'three';
import React, { useState, useMemo } from 'react';
import { useSmartFixerStore } from '../store.js';

export const ControlPanel3D_Smart_Fixer = () => {
    const selectedId = useSmartFixerStore(state => state.selectedId);
    const components = useSmartFixerStore(state => state.components);
    const updateComponent = useSmartFixerStore(state => state.updateComponent);
    const select = useSmartFixerStore(state => state.select);

    const [propsExpanded, setPropsExpanded] = useState(true);
    const [gapsExpanded, setGapsExpanded] = useState(true);

    const comp = components.find(c => c.id === selectedId);

    const proposedGaps = useMemo(() => {
        return components.filter(c => c.fixingAction && (c.fixingAction.includes('GAP_FILL') || c.fixingAction.includes('GAP_SNAP_IMMUTABLE') || c.fixingAction.includes('Insert Pipe')));
    }, [components]);

    const handleApprove = (id, currentAction) => {
        updateComponent(id, {
            fixingAction: currentAction.replace(/REJECT:\s*|IGNORE:\s*/g, '').replace(/\[No Auto fix\]/g, '[Fix approved]').trim() || 'GAP_FILL: Approve',
            _hasUnappliedFix: true
        });
    };

    const handleReject = (id, currentAction) => {
        updateComponent(id, {
            fixingAction: 'REJECT: ' + currentAction.replace(/REJECT:\s*|IGNORE:\s*/g, ''),
            _hasUnappliedFix: false
        });
    };

    const handleApproveAll = () => {
        proposedGaps.forEach(gapComp => {
            // Only auto-approve items that are NOT restricted by [No Auto fix]
            const actionStr = gapComp.fixingAction || '';
            if (!actionStr.includes('[No Auto fix]')) {
                handleApprove(gapComp.id, gapComp.fixingAction);
            }
        });
    };

    const handleFocus = (id) => {
        select(id);
        const comp = components.find(c => c.id === id);
        if (comp && comp.points && comp.points.length > 0) {
            const pt = comp.points[0];
            if (window.__pcfCameraCenterOnPoint) {
                window.__pcfCameraCenterOnPoint(new THREE.Vector3(pt.x, pt.y, pt.z), 8.0);
            }
        }
    };

    const handleAttributeChange = (key, value) => {
        if (!comp) return;
        const newAttributes = { ...comp.attributes, [key]: value };
        updateComponent(comp.id, { attributes: newAttributes });
    };

    return (
        <div style={panelStyle}>
            {comp && (
                <div style={{ marginBottom: proposedGaps.length > 0 ? '10px' : '0' }}>
                    <div style={headerStyle} onClick={() => setPropsExpanded(!propsExpanded)}>
                        <span>⚙ Properties: {comp.type}</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <span style={{ cursor: 'pointer', color: '#888' }}>{propsExpanded ? '▼' : '▲'}</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); select(null); }}
                                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 0 }}
                            >✕</button>
                        </div>
                    </div>

                    {propsExpanded && (
                        <div style={{ padding: '10px' }}>
                            <div style={{ marginBottom: '8px', fontSize: '11px', color: '#aaa' }}>ID: {comp.id}</div>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={labelStyle}>Fixing Action</label>
                                <input
                                    type="text"
                                    value={comp.fixingAction || ''}
                                    onChange={(e) => updateComponent(comp.id, { fixingAction: e.target.value, _hasUnappliedFix: true })}
                                    style={inputStyle}
                                />
                            </div>

                            {comp.attributes && Object.keys(comp.attributes).filter(k => k.startsWith('COMPONENT-ATTRIBUTE')).length > 0 && (
                                <div style={{ marginBottom: '10px', borderTop: '1px solid #444', paddingTop: '10px' }}>
                                    <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '8px' }}>Component Attributes:</div>
                                    <div style={{ maxHeight: '150px', overflowY: 'auto', paddingRight: '5px' }}>
                                        {Object.entries(comp.attributes)
                                            .filter(([k]) => k.startsWith('COMPONENT-ATTRIBUTE'))
                                            .sort(([a], [b]) => parseInt(a.replace('COMPONENT-ATTRIBUTE', '')) - parseInt(b.replace('COMPONENT-ATTRIBUTE', '')))
                                            .map(([key, val]) => (
                                                <div key={key} style={{ marginBottom: '6px' }}>
                                                    <label style={labelStyle}>{key.replace('COMPONENT-ATTRIBUTE', 'CA ')}</label>
                                                    <input
                                                        type="text"
                                                        value={val}
                                                        onChange={(e) => handleAttributeChange(key, e.target.value)}
                                                        style={inputStyle}
                                                    />
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {proposedGaps.length > 0 && (
                <div>
                    <div style={headerStyle} onClick={() => setGapsExpanded(!gapsExpanded)}>
                        <span>⚠️ Proposed Gaps ({proposedGaps.length})</span>
                        <span style={{ cursor: 'pointer', color: '#888' }}>{gapsExpanded ? '▼' : '▲'}</span>
                    </div>

                    {gapsExpanded && (
                        <div style={{ padding: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                                {/* Legend */}
                                <div style={{ display: 'flex', gap: '6px', fontSize: '9px', flexWrap: 'wrap', opacity: 0.8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <div style={{ width: 8, height: 8, background: '#ff69b4', borderRadius: '50%' }}></div> Multi-axis (Pink)
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <div style={{ width: 8, height: 8, background: '#3b82f6', borderRadius: '50%' }}></div> Component Info (Blue)
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <div style={{ width: 8, height: 8, background: '#f97316', borderRadius: '50%' }}></div> Non-pipe stretch (Orange)
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        onClick={handleApproveAll}
                                        style={{...btnStyle, background: '#28a745', color: '#fff', padding: '4px 8px', flex: 'none'}}
                                        title="Only approves gaps without [No Auto fix] restrictions"
                                    >
                                        ✓ Approve All
                                    </button>
                                </div>
                            </div>


                            {proposedGaps.map((gapComp, idx) => {
                                const actionStr = gapComp.fixingAction || '';
                                const isRejected = actionStr.includes('REJECT') || actionStr.includes('IGNORE');
                                const isApproved = actionStr.includes('[Fix approved]') || (!isRejected && actionStr.includes('GAP_FILL') && !actionStr.includes('[No Auto fix]'));
                                const isSelected = selectedId === gapComp.id;

                                // Color logic
                                let bgColor = isSelected ? 'rgba(251, 191, 36, 0.1)' : 'rgba(0, 0, 0, 0.2)';
                                let borderColor = isSelected ? '#fbbf24' : '#333';

                                if (actionStr.includes('Proposal: Add Node')) {
                                    bgColor = isSelected ? 'rgba(255, 105, 180, 0.2)' : 'rgba(255, 105, 180, 0.1)'; // Pink
                                    borderColor = '#ff69b4';
                                } else if (actionStr.includes('As Information')) {
                                    bgColor = isSelected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)'; // Blue
                                    borderColor = '#3b82f6';
                                } else if (actionStr.includes('[No Auto fix]')) {
                                    bgColor = isSelected ? 'rgba(249, 115, 22, 0.2)' : 'rgba(249, 115, 22, 0.1)'; // Orange
                                    borderColor = '#f97316';
                                }

                                return (
                                    <div key={gapComp.id} style={{
                                        marginBottom: '10px',
                                        padding: '8px',
                                        background: bgColor,
                                        border: '1px solid ' + borderColor,
                                        borderRadius: '4px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: isRejected ? '#888' : '#e2e8f0' }}>
                                                Gap #{idx + 1} ({gapComp.type})
                                            </span>
                                            <button
                                                onClick={() => handleFocus(gapComp.id)}
                                                style={{...btnStyle, padding: '2px 6px', background: '#3b82f6', color: 'white', flex: 0 }}
                                            >
                                                🎯 Focus
                                            </button>
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '8px', wordBreak: 'break-all' }}>
                                            Action: {gapComp.fixingAction}
                                        </div>
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <button
                                                onClick={() => handleApprove(gapComp.id, gapComp.fixingAction)}
                                                style={{ ...btnStyle, background: isApproved ? '#28a745' : '#444', color: isApproved ? '#fff' : '#aaa', border: isApproved ? '1px solid #28a745' : '1px solid transparent' }}
                                            >
                                                ✓ Approve
                                            </button>
                                            <button
                                                onClick={() => handleReject(gapComp.id, gapComp.fixingAction)}
                                                style={{ ...btnStyle, background: isRejected ? '#dc3545' : '#444', color: isRejected ? '#fff' : '#aaa', border: isRejected ? '1px solid #dc3545' : '1px solid transparent' }}
                                            >
                                                ✕ Reject
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const panelStyle = {
    position: 'absolute',
    top: '10px',
    right: '10px',
    width: '320px',
    background: 'rgba(25, 30, 40, 0.95)',
    border: '1px solid #4a5568',
    borderRadius: '4px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    fontFamily: 'monospace',
    color: '#e2e8f0',
    zIndex: 100,
    backdropFilter: 'blur(4px)',
    display: 'flex',
    flexDirection: 'column'
};

const headerStyle = {
    padding: '8px 10px',
    background: '#1a202c',
    borderBottom: '1px solid #4a5568',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontWeight: 'bold',
    fontSize: '12px',
    cursor: 'pointer'
};

const labelStyle = {
    display: 'block',
    fontSize: '10px',
    color: '#a0aec0',
    marginBottom: '4px'
};

const inputStyle = {
    width: '100%',
    padding: '6px',
    background: '#0d1117',
    border: '1px solid #4a5568',
    color: '#e2e8f0',
    borderRadius: '2px',
    fontSize: '11px',
    fontFamily: 'monospace'
};

const btnStyle = {
    flex: 1,
    padding: '6px',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '11px',
    transition: 'background 0.2s, color 0.2s'
};
