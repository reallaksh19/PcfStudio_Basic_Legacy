import React, { useState } from 'react';
import { useEditorStore } from '../store.js';
import * as THREE from 'three';

export const NodeEditorModal = ({ onClose, sourceNode }) => {
    const [dx, setDx] = useState(0);
    const [dy, setDy] = useState(0);
    const [dz, setDz] = useState(0);

    const { addNode, addStick } = useEditorStore();

    const handleCreate = () => {
        const x = sourceNode.x + Number(dx);
        const y = sourceNode.y + Number(dy);
        const z = sourceNode.z + Number(dz);
        const key = `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;

        const newNodeId = `node-${key}`;
        const newStickId = `new-stick-${Date.now()}`;

        // 1. Add new Node
        addNode({
            id: newNodeId,
            key: key,
            x, y, z,
            connectedSticks: [newStickId]
        });

        // 2. Add connecting Stick (Pipe)
        addStick({
            id: newStickId,
            type: 'PIPE',
            data: {
                id: newStickId,
                type: 'PIPE',
                userData: {
                    type: 'PIPE',
                    bore: sourceNode?.connectedSticks?.[0]?.data?.bore || sourceNode?.connectedSticks?.[0]?.data?.userData?.bore || 50,
                    points: {
                        '1': new THREE.Vector3(sourceNode.x, sourceNode.y, sourceNode.z),
                        '2': new THREE.Vector3(x, y, z)
                    }
                },
                points: {
                    '1': new THREE.Vector3(sourceNode.x, sourceNode.y, sourceNode.z),
                    '2': new THREE.Vector3(x, y, z)
                }
            }
        });

        onClose();
    };

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <h3 style={{margin:0, color:'#ffcc00'}}>Spawn Node & Pipe</h3>
                <p style={{fontSize:10, color:'#aaa'}}>Relative to {sourceNode.key}</p>

                <div style={inputGroup}>
                    <label>dX (East):</label>
                    <input type="number" value={dx} onChange={e => setDx(e.target.value)} style={input} />
                </div>
                <div style={inputGroup}>
                    <label>dY (North):</label>
                    <input type="number" value={dy} onChange={e => setDy(e.target.value)} style={input} />
                </div>
                <div style={inputGroup}>
                    <label>dZ (Up):</label>
                    <input type="number" value={dz} onChange={e => setDz(e.target.value)} style={input} />
                </div>

                <div style={{display:'flex', gap:10, marginTop:10}}>
                    <button onClick={handleCreate} style={btn('#28a745')}>CREATE</button>
                    <button onClick={onClose} style={btn('#555')}>CANCEL</button>
                </div>
            </div>
        </div>
    );
};

// Styles
const overlayStyle = {
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    background: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex',
    alignItems: 'center', justifyContent: 'center'
};
const modalStyle = {
    background: '#222', padding: 20, border: '1px solid #444', borderRadius: 4,
    color: '#eee', fontFamily: 'monospace', width: 250, boxShadow: '0 5px 15px rgba(0,0,0,0.5)'
};
const inputGroup = { display: 'flex', justifyContent: 'space-between', marginBottom: 8 };
const input = { width: 80, background: '#111', color: '#fff', border: '1px solid #555', padding: '2px 4px' };
const btn = (bg) => ({ flex: 1, background: bg, color: '#fff', border: 'none', padding: '5px', cursor: 'pointer', fontWeight:'bold' });
