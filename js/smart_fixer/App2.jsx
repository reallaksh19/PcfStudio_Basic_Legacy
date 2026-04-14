import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Bounds, GizmoHelper, GizmoViewport, useBounds } from '@react-three/drei';
import { useSmartFixerStore } from './store.js';
import { ComponentMesh } from './components/Viewer3D.jsx';
import { GapFillerCylinders } from './components/GapFillerCylinders.jsx';
import { ControlPanel3D_Smart_Fixer } from './ui/3d_smart_fixer_controlpanel.jsx';
import * as THREE from 'three';

// ── Animation/Camera Controller ────────────────────────────────────────────────
function CameraController() {
    const { camera, scene, controls } = useThree();

    const transRef = React.useRef({
        active: false,
        startTime: 0,
        duration: 800,
        startPos: new THREE.Vector3(),
        startLookAt: new THREE.Vector3(),
        startUp: new THREE.Vector3(),
        targetPos: new THREE.Vector3(),
        targetLookAt: new THREE.Vector3(),
        targetUp: new THREE.Vector3(),
        startZoom: 1,
        targetZoom: 1,
        initLookAt: new THREE.Vector3()
    });

    useFrame((state, delta) => {
        const t = transRef.current;
        if (!t.active) return;

        const now = performance.now();
        if (t.startTime === 0) {
            t.startTime = now;
            t.startPos.copy(camera.position);
            t.startUp.copy(camera.up);
            if (controls) {
                t.startLookAt.copy(controls.target);
            } else {
                camera.getWorldDirection(t.initLookAt);
                t.startLookAt.copy(camera.position).add(t.initLookAt);
            }
            if (camera.isOrthographicCamera) {
                t.startZoom = camera.zoom;
            }
        }

        const elapsed = now - t.startTime;
        let p = elapsed / t.duration;
        if (p >= 1.0) p = 1.0;

        const easeOutQuart = 1 - Math.pow(1 - p, 4);

        camera.position.lerpVectors(t.startPos, t.targetPos, easeOutQuart);
        camera.up.lerpVectors(t.startUp, t.targetUp, easeOutQuart).normalize();

        const currentLookAt = new THREE.Vector3().lerpVectors(t.startLookAt, t.targetLookAt, easeOutQuart);
        camera.lookAt(currentLookAt);

        if (controls) {
            controls.target.copy(currentLookAt);
            controls.update();
        }

        if (camera.isOrthographicCamera) {
            camera.zoom = t.startZoom + (t.targetZoom - t.startZoom) * easeOutQuart;
            camera.updateProjectionMatrix();
        }

        if (p === 1.0) {
            t.active = false;
            t.startTime = 0;
        }
    });

    React.useEffect(() => {
        window.__pcfCameraCenterOnPoint = (point, zoomLevel = 4.0) => {
            const t = transRef.current;
            const dir = new THREE.Vector3(1, 1, 1).normalize();

            // Ensure point is a Vector3 to prevent clone() errors
            const targetPt = point instanceof THREE.Vector3 ? point : new THREE.Vector3(point.x || 0, point.y || 0, point.z || 0);

            t.targetLookAt.copy(targetPt);
            t.targetUp.set(0, 1, 0);
            t.targetPos.copy(targetPt.clone().addScaledVector(dir, 1000));
            if (camera.isOrthographicCamera) {
                t.targetZoom = zoomLevel;
            }
            if (controls) {
                controls.target.copy(targetPt);
            }
            t.active = true;
        };
    }, [camera, controls, scene]);

    React.useEffect(() => {
        window.__pcfSetDataTable = (rows) => {
            useSmartFixerStore.getState().setDataTable(rows);
        };
    }, []);

    return null;
}


import { Html } from '@react-three/drei';

function CameraBridge() {
    const { camera, controls, scene } = useThree();

    // Smooth-lerp state
    const transRef = React.useRef({
        active: false,
        targetPos: new THREE.Vector3(),
        targetLookAt: new THREE.Vector3(),
        targetUp: new THREE.Vector3(0, 1, 0),
        targetZoom: null,
    });

    useFrame((_state, delta) => {
        const t = transRef.current;
        if (t.active && controls) {
            const damping = 4.0;
            const step = Math.min(damping * delta, 1);
            camera.position.lerp(t.targetPos, step);
            camera.up.lerp(t.targetUp, step).normalize();
            controls.target.lerp(t.targetLookAt, step);

            if (t.targetZoom !== null && camera.isOrthographicCamera) {
                camera.zoom = THREE.MathUtils.lerp(camera.zoom, t.targetZoom, step);
                camera.updateProjectionMatrix();
            }
            controls.update();

            if (
                camera.position.distanceToSquared(t.targetPos) < 0.5 &&
                controls.target.distanceToSquared(t.targetLookAt) < 0.5 &&
                (t.targetZoom === null || Math.abs(camera.zoom - t.targetZoom) < 0.01)
            ) {
                t.active = false;
            }
        }
    });

    React.useEffect(() => {
        window.zoomSelected3D_Smart_Fixer = () => {
            const selectedId = useSmartFixerStore.getState().selectedId;
            if (!selectedId) return;

            const comp = useSmartFixerStore.getState().components.find(c => c.id === selectedId);
            if (!comp || !comp.points || comp.points.length === 0) return;

            // Calculate center of selected component
            const box = new THREE.Box3();
            comp.points.forEach(p => box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z)));
            const centre = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z, 2000); // 2000 fallback to prevent overly tight zoom

            const t = transRef.current;
            const dir = new THREE.Vector3(1, 1, 1).normalize();

            t.targetLookAt.copy(centre);
            t.targetUp.set(0, 1, 0);

            if (camera.isOrthographicCamera) {
                t.targetPos.copy(centre.clone().addScaledVector(dir, Math.max(maxDim * 2, 5000)));
                const viewHeight = camera.top - camera.bottom;
                const viewWidth = camera.right - camera.left;
                const fitSize = maxDim * 1.5;
                const zoomX = viewWidth / fitSize;
                const zoomY = viewHeight / fitSize;
                t.targetZoom = Math.max(Math.min(zoomX, zoomY), 0.001);

                // Update clipping planes to ensure geometry doesn't disappear when zoomed
                camera.near = -maxDim * 20;
                camera.far = maxDim * 20;
                camera.updateProjectionMatrix();
            } else {
                t.targetPos.copy(centre.clone().addScaledVector(dir, maxDim * 1.5));
                t.targetZoom = null;
            }

            if (controls) {
                controls.target.copy(centre);
                controls.update();
            }
            t.active = true;
        };

        window.autoCenter3D_Smart_Fixer = () => {
            const comps = useSmartFixerStore.getState().components;
            if (!comps || comps.length === 0) return;

            const box = new THREE.Box3();
            comps.forEach(c => {
                if (c.points) {
                    c.points.forEach(p => box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z)));
                }
            });
            if (box.isEmpty()) return;

            const centre = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z, 100);

            const t = transRef.current;
            const dir = new THREE.Vector3(1, 1, 1).normalize();

            t.targetLookAt.copy(centre);
            t.targetUp.set(0, 1, 0);

            if (camera.isOrthographicCamera) {
                t.targetPos.copy(centre.clone().addScaledVector(dir, Math.max(maxDim * 2, 5000)));
                const aspect = window.innerWidth / window.innerHeight;
                const viewHeight = maxDim * 1.2;
                const viewWidth = viewHeight * aspect;

                // Set native frustum directly for Auto-center to mimic Drei Bounds
                camera.left = -viewWidth / 2;
                camera.right = viewWidth / 2;
                camera.top = viewHeight / 2;
                camera.bottom = -viewHeight / 2;
                camera.near = -maxDim * 20;
                camera.far = maxDim * 20;

                // Instantly apply position & lookAt
                camera.position.copy(t.targetPos);
                camera.zoom = 1; // Reset zoom
                camera.updateProjectionMatrix();

                if (controls) {
                    controls.target.copy(centre);
                    controls.update();
                }

                t.active = false; // Bypass lerping for initial auto-center
            }
        };
    }, [camera, controls, scene]);

    // Give the geometry a frame to mount before centering initially
    React.useEffect(() => {
        const unsubscribe = useSmartFixerStore.subscribe(
            (state) => state.components,
            (components) => {
                if (components.length > 0) {
                    setTimeout(() => {
                        if (window.autoCenter3D_Smart_Fixer) window.autoCenter3D_Smart_Fixer();
                    }, 100);
                }
            }
        );
        return () => unsubscribe();
    }, []);

    return null;
}

const Scene = () => {
    const components = useSmartFixerStore(state => state.components);

    return (
        <group>
            {components.map((c, i) => <ComponentMesh key={`${c.id}-${i}`} data={c} />)}
            <GapFillerCylinders />
        </group>
    );
};

export const App2 = () => {
    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', background: '#ffffff' }}>
            <Canvas
                orthographic
                camera={{ position: [5000, 5000, 5000], near: -50000, far: 50000, zoom: 1 }}
                onPointerMissed={() => useSmartFixerStore.getState().deselect()}
            >
                <color attach="background" args={['#ffffff']} />
                <Suspense fallback={null}>
                    <ambientLight intensity={0.6} />
                    <pointLight position={[2000, 4000, 2000]} intensity={0.8} />
                    <directionalLight position={[-1000, 5000, -2000]} intensity={1.0} />

                    <Bounds fit clip observe margin={1.5}>
                        <Scene />
                    </Bounds>
                    <CameraBridge />

                    <OrbitControls makeDefault enableDamping dampingFactor={0.05} enablePan={true} screenSpacePanning={true} minZoom={0.01} maxZoom={1000} zoomSpeed={1.5} panSpeed={1.5} />

                    <GizmoHelper
                        alignment="bottom-right"
                        margin={[80, 80]}
                        renderPriority={1}
                    >
                        <GizmoViewport axisColors={['#ff3653', '#0abd76', '#3ea8ff']} labelColor="white" />
                    </GizmoHelper>
                </Suspense>
            </Canvas>

            {/* UI Overlays */}
            <ControlPanel3D_Smart_Fixer />
            <div style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                display: 'flex',
                gap: '8px',
                zIndex: 10
            }}>
                <button
                    onClick={(e) => { e.stopPropagation(); if (window.autoCenter3D_Smart_Fixer) window.autoCenter3D_Smart_Fixer(); }}
                    style={{
                        background: 'rgba(25, 30, 40, 0.95)',
                        border: '1px solid #4a5568',
                        color: '#e2e8f0',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                    }}
                >
                    ⊙ Auto Center
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (window.zoomSelected3D_Smart_Fixer) window.zoomSelected3D_Smart_Fixer();
                    }}
                    style={{
                        background: 'rgba(25, 30, 40, 0.95)',
                        border: '1px solid #4a5568',
                        color: '#e2e8f0',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                    }}
                >
                    ⌕ Zoom selected
                </button>
            </div>
        </div>
    );
};

let root = null;
export const mountViewer2App = (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!root) {
        root = createRoot(container);
        root.render(<App2 />);
    }
};
