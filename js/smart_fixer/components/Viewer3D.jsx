import React, { useMemo } from 'react';
import { useSmartFixerStore } from '../store.js';
import * as THREE from 'three';

export const ComponentMesh = ({ data }) => {
    const selectedId = useSmartFixerStore(state => state.selectedId);
    const select = useSmartFixerStore(state => state.select);

    const isSelected = selectedId === data.id;

    const geometry = useMemo(() => {
        if (!data.points || data.points.length < 2) return null;

        // Simplify visualization to a cylinder for most components
        let p1, p2;
        if (data.type === 'BEND') {
            // Standardizing for bends using the centre point and lengths
            p1 = new THREE.Vector3(data.points[0].x, data.points[0].y, data.points[0].z);
            p2 = new THREE.Vector3(data.points[1].x, data.points[1].y, data.points[1].z);
        } else {
            p1 = new THREE.Vector3(data.points[0].x, data.points[0].y, data.points[0].z);
            p2 = new THREE.Vector3(data.points[data.points.length - 1].x, data.points[data.points.length - 1].y, data.points[data.points.length - 1].z);
        }

        const distance = p1.distanceTo(p2);
        if (distance < 0.1) return null;

        const center = p1.clone().lerp(p2, 0.5);
        const direction = new THREE.Vector3().subVectors(p2, p1).normalize();

        const quaternion = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction
        );

        // Standard bore size or fallback
        const bore = (data.points[0]?.bore || 50) / 2;
        const bore2 = (data.points[data.points.length - 1]?.bore || data.points[0]?.bore || 50) / 2;

        return { distance, center, quaternion, bore, bore2 };
    }, [data.points, data.type]);

    if (!geometry) return null;

    let color = '#3182ce'; // Default Blue for PIPEs
    if (data.type === 'PIPE') color = '#3182ce';
    if (data.type === 'FLANGE') color = '#e53e3e'; // bright red for flanges
    if (data.type === 'BEND') color = '#6b46c1'; // purple for bends
    if (data.type === 'VALVE') color = '#d69e2e'; // yellow for valves
    if (data.type === 'REDUCER-CONCENTRIC' || data.type === 'REDUCER-ECCENTRIC') color = '#a0aec0'; // gray for reducers
    if (data.type === 'TEE') color = '#d69e2e'; // yellow for tees
    if (data.type === 'SUPPORT') color = '#38a169'; // green for supports

    const renderMesh = () => {
        if (data.type === 'VALVE') {
            // Render a CAD-like Valve (two opposing cones)
            return (
                <group>
                    {/* Underlying pipe line segment to ensure continuity visually */}
                    <mesh position={[0, 0, 0]}>
                        <cylinderGeometry args={[geometry.bore, geometry.bore, geometry.distance, 16]} />
                        <meshStandardMaterial color={isSelected ? '#fbbf24' : '#3182ce'} roughness={0.8} metalness={0.2} emissive={isSelected ? '#d97706' : '#000000'} emissiveIntensity={isSelected ? 0.3 : 0} />
                    </mesh>

                    {/* Valve Body */}
                    <mesh position={[0, 0, 0]}>
                        <sphereGeometry args={[geometry.bore * 1.5, 16, 16]} />
                        <meshStandardMaterial color={isSelected ? '#fbbf24' : color} roughness={0.8} metalness={0.2} emissive={isSelected ? '#d97706' : '#000000'} emissiveIntensity={isSelected ? 0.3 : 0} />
                    </mesh>
                    <mesh position={[0, geometry.bore * 1.5, 0]} rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[geometry.bore * 0.4, geometry.bore * 0.4, geometry.bore * 3, 16]} />
                        <meshStandardMaterial color={isSelected ? '#fbbf24' : color} roughness={0.8} metalness={0.2} emissive={isSelected ? '#d97706' : '#000000'} emissiveIntensity={isSelected ? 0.3 : 0} />
                    </mesh>
                </group>
            );
        } else if (data.type === 'FLANGE') {
            // Render a CAD-like Flange (short cylinder with larger diameter)
            // But make it fixed thickness relative to bore so it looks like a disc
            const flangeThickness = Math.max(geometry.bore * 0.5, 10);
            return (
                <group>
                     <mesh position={[0, 0, 0]}>
                        <cylinderGeometry args={[geometry.bore, geometry.bore, geometry.distance, 16]} />
                        <meshStandardMaterial color={isSelected ? '#fbbf24' : '#3182ce'} roughness={0.8} metalness={0.2} emissive={isSelected ? '#d97706' : '#000000'} emissiveIntensity={isSelected ? 0.3 : 0} />
                    </mesh>
                    <mesh position={[0, 0, 0]}>
                        <cylinderGeometry args={[geometry.bore * 2.0, geometry.bore * 2.0, flangeThickness, 16]} />
                        <meshStandardMaterial color={isSelected ? '#fbbf24' : color} roughness={0.8} metalness={0.2} emissive={isSelected ? '#d97706' : '#000000'} emissiveIntensity={isSelected ? 0.3 : 0} />
                    </mesh>
                </group>
            );
        } else if (data.type === 'REDUCER-CONCENTRIC' || data.type === 'REDUCER-ECCENTRIC') {
            const rad1 = geometry.bore;
            const rad2 = geometry.bore2;

            // To properly orient the reducer cone, we just draw a single cylinder geometry
            // with different top and bottom radiuses. The underlying direction is already aligned
            // using the group rotation and position.
            return (
                <mesh position={[0, 0, 0]}>
                    <cylinderGeometry args={[rad2, rad1, geometry.distance, 16]} />
                    <meshStandardMaterial color={isSelected ? '#fbbf24' : color} roughness={0.8} metalness={0.2} emissive={isSelected ? '#d97706' : '#000000'} emissiveIntensity={isSelected ? 0.3 : 0} />
                </mesh>
            );
        } else if (data.type === 'SUPPORT') {
            // Extract support type from attributes
            let supportType = 'Rest'; // Default
            if (data.attributes) {
                // Check if any attribute has value 'Guide'
                const isGuide = Object.values(data.attributes).some(val =>
                    typeof val === 'string' && val.toLowerCase().includes('guide')
                );
                if (isGuide) supportType = 'Guide';
            }

            const arrowLen = geometry.bore * 4;
            const arrowHeadLen = geometry.bore * 1.5;
            const arrowHeadWid = geometry.bore * 1.5;

            // Render a Support symbol (Arrows)
            return (
                <group>
                    {/* The base pipe segment for the support */}
                    <mesh position={[0, 0, 0]}>
                        <cylinderGeometry args={[geometry.bore, geometry.bore, geometry.distance, 16]} />
                        <meshStandardMaterial color={isSelected ? '#fbbf24' : '#a0aec0'} roughness={0.8} metalness={0.2} emissive={isSelected ? '#d97706' : '#000000'} emissiveIntensity={isSelected ? 0.3 : 0} />
                    </mesh>

                    {/* Vertical (Rest) Arrow - pointing UP from below the pipe */}
                    <group position={[0, 0, -geometry.bore]}>
                        <mesh position={[0, 0, -arrowLen / 2]}>
                            <cylinderGeometry args={[geometry.bore * 0.3, geometry.bore * 0.3, arrowLen, 8]} />
                            <meshStandardMaterial color={isSelected ? '#fbbf24' : '#38a169'} />
                        </mesh>
                        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                            <coneGeometry args={[arrowHeadWid, arrowHeadLen, 8]} />
                            <meshStandardMaterial color={isSelected ? '#fbbf24' : '#38a169'} />
                        </mesh>
                    </group>

                    {/* Lateral (Guide) Arrows if applicable */}
                    {supportType === 'Guide' && (
                        <group>
                            {/* Arrow pointing Left */}
                            <group position={[-geometry.bore, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                                <mesh position={[0, -arrowLen / 2, 0]}>
                                    <cylinderGeometry args={[geometry.bore * 0.3, geometry.bore * 0.3, arrowLen, 8]} />
                                    <meshStandardMaterial color={isSelected ? '#fbbf24' : '#38a169'} />
                                </mesh>
                                <mesh position={[0, 0, 0]}>
                                    <coneGeometry args={[arrowHeadWid, arrowHeadLen, 8]} />
                                    <meshStandardMaterial color={isSelected ? '#fbbf24' : '#38a169'} />
                                </mesh>
                            </group>
                            {/* Arrow pointing Right */}
                            <group position={[geometry.bore, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                                <mesh position={[0, -arrowLen / 2, 0]}>
                                    <cylinderGeometry args={[geometry.bore * 0.3, geometry.bore * 0.3, arrowLen, 8]} />
                                    <meshStandardMaterial color={isSelected ? '#fbbf24' : '#38a169'} />
                                </mesh>
                                <mesh position={[0, 0, 0]}>
                                    <coneGeometry args={[arrowHeadWid, arrowHeadLen, 8]} />
                                    <meshStandardMaterial color={isSelected ? '#fbbf24' : '#38a169'} />
                                </mesh>
                            </group>
                        </group>
                    )}
                </group>
            );
        }

        // Default Pipe / Bend rendering
        return (
            <mesh>
                <cylinderGeometry args={[geometry.bore, geometry.bore, geometry.distance, 16]} />
                <meshStandardMaterial color={isSelected ? '#fbbf24' : color} roughness={0.8} metalness={0.2} emissive={isSelected ? '#d97706' : '#000000'} emissiveIntensity={isSelected ? 0.3 : 0} />
            </mesh>
        );
    };

    return (
        <group
            position={geometry.center}
            quaternion={geometry.quaternion}
            onClick={(e) => { e.stopPropagation(); select(data.id); }}
        >
            {renderMesh()}
        </group>
    );
};
