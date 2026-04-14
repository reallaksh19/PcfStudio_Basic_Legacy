import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { useThree, useFrame } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import * as THREE from 'three';

export const ClippingPlanesLayer = () => {
    const { gl, scene, camera } = useThree();
    const boxRef = useRef();
    const clippingPlaneEnabled = useStore(state => state.clippingPlaneEnabled);
    const dataTable = useStore(state => state.dataTable);
    const selectedElementId = useStore(state => state.selectedElementId);
    const [sectionMode, setSectionMode] = useState('BOX'); // 'BOX' or 'PLANE_UP'

    // Six clipping planes for a true section box (Max and Min for X, Y, Z)
    const [planes] = useState(() => [
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10000),   // Max X
        new THREE.Plane(new THREE.Vector3(1, 0, 0), 10000),    // Min X
        new THREE.Plane(new THREE.Vector3(0, -1, 0), 10000),   // Max Y
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 10000),    // Min Y
        new THREE.Plane(new THREE.Vector3(0, 0, -1), 10000),   // Max Z
        new THREE.Plane(new THREE.Vector3(0, 0, 1), 10000)     // Min Z
    ]);

    useEffect(() => {
        // Safe access for WebGLRenderer state changes
        try {
            if (gl && 'localClippingEnabled' in gl) {
                gl.localClippingEnabled = clippingPlaneEnabled;
            }
        } catch (e) {
            // Ignore strict mode mutability errors if wrapped in a hook system
        }

        const applyPlanes = () => {
            scene.traverse((child) => {
                if (child.isMesh && child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        // Skip text/UI layers that don't need clipping
                        if (mat.type !== 'MeshBasicMaterial' || !mat.transparent) {
                            // If PLANE_UP, only use the 3rd plane (Max Y)
                            mat.clippingPlanes = clippingPlaneEnabled ? (sectionMode === 'PLANE_UP' ? [planes[2]] : planes) : [];
                            mat.clipIntersection = false;
                            mat.needsUpdate = true;
                        }
                    });
                }
            });
        };

        applyPlanes();
    }, [clippingPlaneEnabled, sectionMode, gl, scene, planes]);

    // Initial setup based on selected element
    useEffect(() => {
        if (!clippingPlaneEnabled || !boxRef.current) return;

        let center = new THREE.Vector3(0, 0, 0);
        let size = new THREE.Vector3(5000, 5000, 5000);

        if (selectedElementId) {
            const el = dataTable.find(r => r._rowIndex === selectedElementId);
            if (el) {
                let minX = Infinity, minY = Infinity, minZ = Infinity;
                let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
                if (el.ep1) {
                    minX = Math.min(minX, el.ep1.x); minY = Math.min(minY, el.ep1.y); minZ = Math.min(minZ, el.ep1.z);
                    maxX = Math.max(maxX, el.ep1.x); maxY = Math.max(maxY, el.ep1.y); maxZ = Math.max(maxZ, el.ep1.z);
                }
                if (el.ep2) {
                    minX = Math.min(minX, el.ep2.x); minY = Math.min(minY, el.ep2.y); minZ = Math.min(minZ, el.ep2.z);
                    maxX = Math.max(maxX, el.ep2.x); maxY = Math.max(maxY, el.ep2.y); maxZ = Math.max(maxZ, el.ep2.z);
                }
                if (minX !== Infinity) {
                    center.set((minX + maxX)/2, (minY + maxY)/2, (minZ + maxZ)/2);
                    size.set(Math.max(maxX - minX, 1000) * 2, Math.max(maxY - minY, 1000) * 2, Math.max(maxZ - minZ, 1000) * 2);
                }
            }
        }

        boxRef.current.position.copy(center);
        boxRef.current.scale.copy(size);

    }, [clippingPlaneEnabled, selectedElementId, dataTable]);

    useFrame(() => {
        if (clippingPlaneEnabled && boxRef.current) {
            const pos = boxRef.current.position;
            const scale = boxRef.current.scale;

            // Update planes to match the box geometry bounds
            // The boxGeometry is 1x1x1, scaled by `scale`
            const halfW = Math.abs(scale.x) / 2;
            const halfH = Math.abs(scale.y) / 2;
            const halfD = Math.abs(scale.z) / 2;

            planes[0].constant = pos.x + halfW;
            planes[1].constant = -(pos.x - halfW);
            planes[2].constant = pos.y + halfH;
            planes[3].constant = -(pos.y - halfH);
            planes[4].constant = pos.z + halfD;
            planes[5].constant = -(pos.z - halfD);
        }
    });

    // Expose UI functions
    useEffect(() => {
        window.setSectionMode = (mode) => setSectionMode(mode);
        return () => { delete window.setSectionMode; };
    }, []);

    if (!clippingPlaneEnabled) return null;

    return (
        <group>
            {/* The draggable box */}
            <mesh ref={boxRef} renderOrder={999}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial
                    color="#3b82f6"
                    transparent
                    opacity={sectionMode === 'BOX' ? 0.15 : 0.05}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    wireframe={sectionMode === 'PLANE_UP'}
                />
            </mesh>

            {sectionMode === 'BOX' && (
                <TransformControls object={boxRef} mode="scale" size={0.5} />
            )}
            {sectionMode === 'PLANE_UP' && (
                <TransformControls object={boxRef} mode="translate" showX={false} showZ={false} size={0.5} />
            )}
        </group>
    );
};

export const ClippingPanelUI = () => {
    const clippingPlaneEnabled = useStore(state => state.clippingPlaneEnabled);
    const setClippingPlaneEnabled = useStore(state => state.setClippingPlaneEnabled);
    const [mode, setMode] = useState('BOX');
    const [pos, setPos] = useState({ x: window.innerWidth - 320, y: window.innerHeight / 2 - 100 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const handleModeChange = (newMode) => {
        setMode(newMode);
        if (window.setSectionMode) window.setSectionMode(newMode);
    };

    const handlePointerDown = (e) => {
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - pos.x,
            y: e.clientY - pos.y
        });
        e.currentTarget.setPointerCapture(e.pointerId);
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
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    if (!clippingPlaneEnabled) return null;

    return (
        <div
            className="w-64 bg-slate-900/95 backdrop-blur border border-slate-700 shadow-2xl rounded-lg overflow-hidden fixed z-50 shrink-0 pointer-events-auto"
            style={{ left: pos.x, top: pos.y }}
        >
            <div
                className="flex justify-between items-center bg-slate-800 p-3 border-b border-slate-700 cursor-move"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <span className="text-slate-200 font-bold text-xs uppercase pointer-events-none">SECTION BOX</span>
                <button onClick={() => setClippingPlaneEnabled(false)} className="text-slate-400 hover:text-white" title="Close">✕</button>
            </div>
            <div className="p-4">

            <div className="flex gap-2">
                <button
                    onClick={() => handleModeChange('BOX')}
                    className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${mode === 'BOX' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                >
                    3D Box
                </button>
                <button
                    onClick={() => handleModeChange('PLANE_UP')}
                    className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${mode === 'PLANE_UP' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                >
                    Plane (Up)
                </button>
            </div>

            <p className="text-[10px] text-slate-500 mt-3 leading-tight">
                {mode === 'BOX'
                    ? "Drag the 3D handles in the scene to scale the section box bounds."
                    : "Drag the Y-axis handle in the scene to move the top clipping plane."}
            </p>
            </div>
        </div>
    );
};
