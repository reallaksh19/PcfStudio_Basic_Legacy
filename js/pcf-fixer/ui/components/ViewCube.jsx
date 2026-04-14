import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

export const ViewCube = ({ customEventName = 'canvas-set-view' }) => {
    const cubeRef = useRef();
    const { camera } = useThree();

    useFrame(() => {
        if (!cubeRef.current) return;

        camera.updateMatrixWorld();

        // A mathematically robust way to map Three.js camera rotation to CSS 3D
        // is to extract the camera's world matrix, invert the rotation part,
        // and apply it via CSS matrix3d.

        const matrix = new THREE.Matrix4();
        matrix.extractRotation(camera.matrixWorld);

        // CSS uses a different coordinate system (Y is down).
        // We flip the Y and Z axes to match CSS space.
        const flipY = new THREE.Matrix4().makeScale(1, -1, 1);
        const flipZ = new THREE.Matrix4().makeScale(1, 1, -1);

        matrix.premultiply(flipY);
        matrix.multiply(flipY);

        matrix.premultiply(flipZ);
        matrix.multiply(flipZ);

        // Invert to apply to the cube
        matrix.invert();

        const e = matrix.elements;
        // CSS matrix3d uses column-major order, exactly like Three.js Matrix4.elements
        cubeRef.current.style.transform = `matrix3d(
            ${e[0]}, ${e[1]}, ${e[2]}, ${e[3]},
            ${e[4]}, ${e[5]}, ${e[6]}, ${e[7]},
            ${e[8]}, ${e[9]}, ${e[10]}, ${e[11]},
            ${e[12]}, ${e[13]}, ${e[14]}, ${e[15]}
        )`;
    });

    const setView = (viewType) => {
        window.dispatchEvent(new CustomEvent(customEventName, { detail: { viewType } }));
    };

    return (
        <Html
            center={false}
            fullscreen={true}
            style={{
                pointerEvents: 'none',
                width: '100%',
                height: '100%'
            }}
        >
            <div style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                width: '100px',
                height: '100px',
                zIndex: 50,
                perspective: '400px'
            }}>
                <div
                    ref={cubeRef}
                    style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        transformStyle: 'preserve-3d',
                        transition: 'transform 0.1s ease-out',
                        pointerEvents: 'auto'
                    }}
                >
                    <CubeFace face="FRONT"  onClick={() => setView('FRONT')}  style={{ transform: 'rotateY(0deg) translateZ(50px)' }} />
                    <CubeFace face="BACK"   onClick={() => setView('BACK')}   style={{ transform: 'rotateY(180deg) translateZ(50px)' }} />
                    <CubeFace face="RIGHT"  onClick={() => setView('RIGHT')}  style={{ transform: 'rotateY(90deg) translateZ(50px)' }} />
                    <CubeFace face="LEFT"   onClick={() => setView('LEFT')}   style={{ transform: 'rotateY(-90deg) translateZ(50px)' }} />
                    <CubeFace face="TOP"    onClick={() => setView('TOP')}    style={{ transform: 'rotateX(90deg) translateZ(50px)' }} />
                    <CubeFace face="BOTTOM" onClick={() => setView('BOTTOM')} style={{ transform: 'rotateX(-90deg) translateZ(50px)' }} />
                </div>
            </div>
        </Html>
    );
}

function CubeFace({ face, style, onClick }) {
    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            style={{
                position: 'absolute',
                width: '100px',
                height: '100px',
                background: 'rgba(51, 65, 85, 0.8)',
                border: '1px solid rgba(148, 163, 184, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: 'pointer',
                userSelect: 'none',
                backfaceVisibility: 'hidden',
                ...style
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.8)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(51, 65, 85, 0.8)'}
        >
            {face}
        </div>
    );
}
