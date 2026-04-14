import React, { useMemo, useState } from 'react';
import { useEditorStore } from '../store.js';
import * as THREE from 'three';

const COLORS = {
    PIPE: '#1e90ff',
    FLANGE: '#ff4500',
    VALVE: '#32cd32',
    TEE: '#ffd700',
    ELBOW: '#8a2be2',
    SUPPORT: '#808080',
    BEND: '#8a2be2',
    REDUCER: '#ff69b4',
    UNKNOWN: '#d3d3d3',
};

const mapCoord = (p) => {
    if (!p) return new THREE.Vector3(0,0,0);
    const x = Number(p.x) || 0;
    const y = Number(p.y) || 0;
    const z = Number(p.z) || 0;
    return new THREE.Vector3(-y, z, -x);
};

export const StickMesh = ({ stick }) => {
    const isSelected = useEditorStore(state => state.selectedId === stick.id);
    const select = useEditorStore(state => state.select);
    const [hovered, setHover] = useState(false);

    const { data, type } = stick;

    let p1Raw, p2Raw, cpRaw;

    if (Array.isArray(data.points)) {
        p1Raw = data.points[0];
        p2Raw = data.points[1];
    } else if (data.points && typeof data.points === 'object') {
        p1Raw = data.points['1'] || data.points.EP1 || data.points.Start;
        p2Raw = data.points['2'] || data.points.EP2 || data.points.End;
        cpRaw = data.points['0'] || data.points.Centre;
    }

    if (!p1Raw && data.userData?.points) {
        const up = data.userData.points;
         if (Array.isArray(up)) {
            p1Raw = up[0];
            p2Raw = up[1];
        } else {
            p1Raw = up['1'] || up.EP1 || up.Start;
            p2Raw = up['2'] || up.EP2 || up.End;
        }
    }

    if (!cpRaw && data.centrePoint) cpRaw = data.centrePoint;
    if (!cpRaw && data.userData?.centrePoint) cpRaw = data.userData.centrePoint;

    const bore = Number(data.bore || data.userData?.bore || 50);
    const radius = Math.max(bore / 2, 10);
    const color = COLORS[type.toUpperCase()] || COLORS.UNKNOWN;

    const handleClick = (e) => {
        e.stopPropagation();
        select(stick.id, 'STICK');
    };

    const geometryNode = useMemo(() => {
        if (!p1Raw) return null;
        const v1 = mapCoord(p1Raw);
        const v2 = p2Raw ? mapCoord(p2Raw) : null;

        if (isNaN(v1.x) || isNaN(v1.y) || isNaN(v1.z)) return null;

        if (v2) {
            // Guard against degenerate (zero-length) tubes — they produce NaN vertices
            // and render as invisible or appear as a single point in the viewport.
            const dist = v1.distanceTo(v2);
            if (dist < 1) {
                return (
                    <mesh position={v1}>
                        <sphereGeometry args={[radius * 1.5]} />
                        <meshStandardMaterial color={isSelected ? '#ffff00' : color} emissive={hovered ? '#222222' : '#000000'} />
                    </mesh>
                );
            }

            if (type.toUpperCase().includes('REDUCER')) {
                const b1 = Number(p1Raw?.bore || bore);
                const b2 = Number(p2Raw?.bore || bore);
                const rad1 = Math.max(b1 / 2, 10);
                const rad2 = Math.max(b2 / 2, 10);

                const center = v1.clone().lerp(v2, 0.5);
                const direction = new THREE.Vector3().subVectors(v2, v1).normalize();
                const quaternion = new THREE.Quaternion().setFromUnitVectors(
                    new THREE.Vector3(0, 1, 0),
                    direction
                );

                return (
                    <mesh position={center} quaternion={quaternion}>
                        <cylinderGeometry args={[rad2, rad1, dist, 16]} />
                        <meshStandardMaterial
                            color={isSelected ? '#ffff00' : color}
                            emissive={isSelected ? '#444400' : (hovered ? '#222222' : '#000000')}
                        />
                    </mesh>
                );
            }

            const curve = new THREE.LineCurve3(v1, v2);
             return (
                <mesh>
                    <tubeGeometry args={[curve, 1, radius, 8, false]} />
                    <meshStandardMaterial
                        color={isSelected ? '#ffff00' : color}
                        emissive={isSelected ? '#444400' : (hovered ? '#222222' : '#000000')}
                    />
                </mesh>
            );
        } else {
             return (
                 <mesh position={v1}>
                     <sphereGeometry args={[radius * 1.5]} />
                     <meshStandardMaterial
                         color={isSelected ? '#ffff00' : color}
                         emissive={hovered ? '#222222' : '#000000'}
                     />
                 </mesh>
             );
        }
    }, [p1Raw, p2Raw, isSelected, hovered, radius, color]);

    if (!geometryNode) return null;

    return (
        <group
            onClick={handleClick}
            onPointerOver={(e) => { e.stopPropagation(); setHover(true); }}
            onPointerOut={(e) => { e.stopPropagation(); setHover(false); }}
        >
            {geometryNode}
        </group>
    );
};
