import React from 'react';
import { useSmartFixerStore } from '../store.js';

/**
 * js/smart_fixer/ui/3d_smart_fixer_datatable.jsx
 * The 3DV_2 Data Table - Source of Truth
 *
 * Renders the parsed components and their editable "Fixing Action" properties.
 */
export const Datatable3D_Smart_Fixer = () => {
    const components = useSmartFixerStore(state => state.components);
    const updateComponent = useSmartFixerStore(state => state.updateComponent);
    const selectedId = useSmartFixerStore(state => state.selectedId);
    const select = useSmartFixerStore(state => state.select);

    const handleActionChange = (id, newAction) => {
        updateComponent(id, { fixingAction: newAction, _hasUnappliedFix: true });
    };

    if (!components || components.length === 0) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Paste PCF text and click Generate 3D to populate table.
            </div>
        );
    }

    // Dynamically find all attribute keys across all components, split into CA and extra columns
    const caSet = new Set();
    const extraSet = new Set();
    components.forEach(comp => {
        if (comp.attributes) {
            Object.keys(comp.attributes).forEach(key => {
                if (key.startsWith('COMPONENT-ATTRIBUTE')) {
                    caSet.add(key);
                } else {
                    extraSet.add(key);
                }
            });
        }
    });
    const caColumns = Array.from(caSet).sort((a, b) => parseInt(a.replace('COMPONENT-ATTRIBUTE', '')) - parseInt(b.replace('COMPONENT-ATTRIBUTE', '')));
    const extraColumns = Array.from(extraSet).sort();

    return (
        <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '10px' }}>
            <table style={{ minWidth: '150%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: 'monospace' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-2)', zIndex: 10 }}>
                <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Length</th>
                    <th style={thStyle}>EP1</th>
                    <th style={thStyle}>EP2</th>
                    <th style={thStyle}>CP/BP/COORDS</th>
                    {caColumns.map(col => (
                        <th key={col} style={thStyle}>{col.replace('COMPONENT-ATTRIBUTE', 'CA ')}</th>
                    ))}
                    {extraColumns.map(col => (
                        <th key={col} style={thStyle}>{col}</th>
                    ))}
                    <th style={{ ...thStyle, width: '400px', minWidth: '400px' }}>Fixing Action</th>
                </tr>
            </thead>
            <tbody>
                {components.map((comp, idx) => {
                    const isSelected = selectedId === comp.id;
                    const hasAction = !!comp.fixingAction;
                    const unapplied = comp._hasUnappliedFix;

                    return (
                        <tr
                            key={comp.id}
                            onClick={() => select(comp.id)}
                            style={{
                                ...trStyle,
                                background: isSelected ? 'var(--accent-muted)' : (unapplied ? 'rgba(255,165,0,0.1)' : 'transparent'),
                                borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent'
                            }}
                        >
                            <td style={tdStyle}>{idx + 1}</td>
                            <td style={tdStyle}>{comp.type}</td>
                            <td style={tdStyle}>
                                {/* Calc rough length for display if 2 points exist */}
                                {comp.points?.length >= 2
                                    ? calculateLength(comp.points[0], comp.points[comp.points.length-1]).toFixed(1) + ' mm'
                                    : '—'
                                }
                            </td>
                            {/* Render EP1 */}
                            <td style={tdStyle}>
                                {comp.points?.length >= 1 ? `[${comp.points[0].x.toFixed(1)}, ${comp.points[0].y.toFixed(1)}, ${comp.points[0].z.toFixed(1)}]` : '—'}
                            </td>
                            {/* Render EP2 */}
                            <td style={tdStyle}>
                                {comp.points?.length >= 2 ? `[${comp.points[comp.points.length-1].x.toFixed(1)}, ${comp.points[comp.points.length-1].y.toFixed(1)}, ${comp.points[comp.points.length-1].z.toFixed(1)}]` : '—'}
                            </td>
                            {/* Render CP/BP/COORDS */}
                            <td style={tdStyle}>
                                {comp.centrePoint ? `CP: [${comp.centrePoint.x.toFixed(1)}, ${comp.centrePoint.y.toFixed(1)}, ${comp.centrePoint.z.toFixed(1)}]` : (comp.branch1Point ? `BP: [${comp.branch1Point.x.toFixed(1)}, ${comp.branch1Point.y.toFixed(1)}, ${comp.branch1Point.z.toFixed(1)}]` : '—')}
                            </td>
                            {caColumns.map(col => (
                                <td key={col} style={tdStyle}>
                                    {comp.attributes && comp.attributes[col] ? comp.attributes[col] : '—'}
                                </td>
                            ))}
                            {extraColumns.map(col => (
                                <td key={col} style={tdStyle}>
                                    {comp.attributes && comp.attributes[col] ? comp.attributes[col] : '—'}
                                </td>
                            ))}
                            <td style={{ ...tdStyle, width: '400px', minWidth: '400px' }}>
                                <input
                                    type="text"
                                    value={comp.fixingAction || ''}
                                    onChange={(e) => handleActionChange(comp.id, e.target.value)}
                                    placeholder={hasAction ? '' : 'No action'}
                                    style={{
                                        width: '100%',
                                        background: hasAction ? (unapplied ? 'var(--amber-dim)' : 'var(--emerald-dim)') : 'transparent',
                                        color: hasAction ? (unapplied ? 'var(--amber)' : 'var(--emerald)') : 'var(--text-muted)',
                                        border: '1px solid var(--border)',
                                        padding: '4px',
                                        borderRadius: '3px'
                                    }}
                                />
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        </div>
    );
};

const thStyle = { padding: '8px', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' };
const tdStyle = { padding: '6px 8px', borderBottom: '1px solid var(--border-light)' };
const trStyle = { cursor: 'pointer', transition: 'background 0.2s' };

function calculateLength(p1, p2) {
    if (!p1 || !p2) return 0;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
}
