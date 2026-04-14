import React, { useState } from 'react';
import { useEditorStore } from '../store.js';
import { NodeEditorModal } from './NodeEditorModal.jsx';
import * as THREE from 'three';

export const NodeMesh = ({ data }) => {
    const { x, y, z, id } = data;
    const isSelected = useEditorStore(state => state.selectedId === id);
    const select = useEditorStore(state => state.select);
    const [hovered, setHover] = useState(false);
    const [showModal, setShowModal] = useState(false);

    // Convert to 3D coordinate mapping
    const pos = new THREE.Vector3(-y, z, -x);

    const handleClick = (e) => {
        e.stopPropagation();
        select(id, 'NODE');
    };

    const handleContextMenu = (e) => {
        e.stopPropagation();
        e.preventDefault();
        select(id, 'NODE');
        setShowModal(true);
    };

    return (
        <>
            {showModal && <NodeEditorModal sourceNode={data} onClose={() => setShowModal(false)} />}
            <mesh
                position={pos}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
                onPointerOver={(e) => { e.stopPropagation(); setHover(true); }}
                onPointerOut={(e) => { e.stopPropagation(); setHover(false); }}
            >
                <sphereGeometry args={[15, 16, 16]} />
                <meshStandardMaterial color={isSelected ? '#ffff00' : hovered ? '#ffffff' : '#aaaaaa'} />
            </mesh>
        </>
    );
};
