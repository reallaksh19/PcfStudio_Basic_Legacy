import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useSmartFixerStore } from '../store.js';

export const GapFillerCylinders = () => {
    const components = useSmartFixerStore(state => state.components);
    const select = useSmartFixerStore(state => state.select);
    const selectedId = useSmartFixerStore(state => state.selectedId);

    const anomalousCylinders = useMemo(() => {
        return components.filter(c => c.fixingAction && (c.fixingAction.includes('GAP_FILL') || c.fixingAction.includes('OVERLAP_FIX')));
    }, [components]);

    if (!anomalousCylinders.length) return null;

    return (
        <group>
            {anomalousCylinders.flatMap(comp => {
                const fixes = comp._fixes || [];

                return fixes.map((fix, idx) => {
                    const isGap = fix.type === 'GAP_FILL';
                    const target = fix.target;

                    if (!target) return null;

                    let ep1 = comp.points[fix.sourceIndex];
                    if (!ep1) return null;
                    const ep2 = target;

                    const p1 = new THREE.Vector3(ep1.x, ep1.y, ep1.z);
                    const p2 = new THREE.Vector3(ep2.x, ep2.y, ep2.z);

                    const distance = p1.distanceTo(p2);
                    if (distance < 1) return null; // Too small

                    const center = p1.clone().lerp(p2, 0.5);
                    const direction = new THREE.Vector3().subVectors(p2, p1).normalize();

                    // Align cylinder with the direction vector
                    const quaternion = new THREE.Quaternion().setFromUnitVectors(
                        new THREE.Vector3(0, 1, 0), // Default cylinder is along Y
                        direction
                    );

                    const isSelected = selectedId === comp.id;
                    const isRejected = fix.action.includes('IGNORE') || fix.action.includes('REJECT');
                    const isApproved = fix.action.includes('[Fix approved]') || (!isRejected && fix.action.includes('GAP_FILL') && !fix.action.includes('[No Auto fix]'));

                    // Color Logic
                    let mainColor = isGap ? '#ff0000' : '#D00080'; // transparent red for gap as requested
                    if (isApproved) mainColor = '#28a745'; // Green when approved
                    if (isRejected) mainColor = '#888888'; // Grey when rejected

                    return (
                        <mesh
                            key={`anomaly-${comp.id}-${idx}`}
                            position={center}
                            quaternion={quaternion}
                            onClick={(e) => { e.stopPropagation(); select(comp.id); }}
                        >
                            <cylinderGeometry args={[(comp.points[0]?.bore || 50)/2, (comp.points[0]?.bore || 50)/2, distance, 16]} />
                            <meshStandardMaterial
                                color={mainColor}
                                transparent={true}
                                opacity={isRejected ? 0.3 : (isSelected ? 1.0 : 0.7)}
                                emissive={isSelected ? mainColor : '#000000'}
                                emissiveIntensity={0.5}
                            />
                        </mesh>
                    );
                });
            })}
        </group>
    );
};
