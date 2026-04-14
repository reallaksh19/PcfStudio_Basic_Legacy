import React, { useState, useRef, useEffect, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewcube, GizmoViewport } from '@react-three/drei';
import { useEditorStore } from './store.js';
import { Viewer3D, ComponentInfoPanel } from './components/Viewer3D.jsx';
import { PropertyPanel } from './components/PropertyPanel.jsx';
import * as THREE from 'three';


// ── Camera bridge syncs cube+gizmo every frame + handles smooth transitions ──
function CameraBridge() {
    const { camera, controls, scene } = useThree();

    // Smooth-lerp state (mirrors comparison tool CameraSystem)
    const transRef = useRef({
        active: false,
        targetPos: new THREE.Vector3(),
        targetLookAt: new THREE.Vector3(),
        targetUp: new THREE.Vector3(0, 1, 0),
        targetZoom: null,
    });

    useFrame((_state, delta) => {
        // ── 1. Smooth camera lerp (comparison-tool style) ──────────────
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

            // Snap once close enough to prevent float drift
            if (
                camera.position.distanceToSquared(t.targetPos) < 0.5 &&
                controls.target.distanceToSquared(t.targetLookAt) < 0.5 &&
                (t.targetZoom === null || Math.abs(camera.zoom - t.targetZoom) < 0.01)
            ) {
                camera.position.copy(t.targetPos);
                camera.up.copy(t.targetUp);
                controls.target.copy(t.targetLookAt);
                if (t.targetZoom !== null && camera.isOrthographicCamera) {
                    camera.zoom = t.targetZoom;
                    camera.updateProjectionMatrix();
                }
                controls.update();
                t.active = false;
            }
        }

    });

    useEffect(() => {
        if (controls) {
            window.__pcfOrbitControls = controls;
            return () => { if (window.__pcfOrbitControls === controls) delete window.__pcfOrbitControls; };
        }
    }, [controls]);

    useEffect(() => {
        // Helper: compute bounding box from VISIBLE meshes only
        const _visibleBox = () => {
            const box = new THREE.Box3();
            scene.traverse(obj => {
                // Only consider visible meshes that are strictly flagged as PCF components
                // to avoid calculating bounds off grids, viewcubes, or coordinate planes
                if (!obj.visible || !obj.isMesh || !obj.geometry) return;

                // Usually components will have userData populated from the ComponentMesh
                if (obj.userData?.isComponentHitbox) return; // Skip our hitboxes if they exist
                if (obj.geometry.type === "SphereGeometry" && obj.geometry.parameters.radius > 90000) return; // Skip infinite click sphere
                if (obj.geometry.type === "PlaneGeometry" || obj.parent?.name?.includes("Grid")) return; // Skip generic grids

                // Include in bounds
                const tmp = new THREE.Box3().setFromObject(obj);
                if (!tmp.isEmpty()) box.union(tmp);
            });
            return box;
        };

        // ── Smooth snap — lerps camera to a standard view direction ──────
        window.__pcfCameraSnap = (snapDir, up) => {
            const box = _visibleBox();
            const centre = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
            const size = box.isEmpty() ? 5000 : Math.max(...box.getSize(new THREE.Vector3()).toArray()) * 1.6;

            const t = transRef.current;
            t.targetPos.set(
                centre.x + snapDir[0] * size,
                centre.y + snapDir[1] * size,
                centre.z + snapDir[2] * size
            );
            t.targetLookAt.copy(centre);
            t.targetUp.set(up[0], up[1], up[2]);
            t.targetZoom = null; // Don't touch zoom for directional snaps
            t.active = true;
        };

        // ── Smooth center — fits all geometry, keeps camera direction ─────
        window.__pcfCameraCenter = () => {
            const box = _visibleBox();
            if (box.isEmpty()) {
                const fbBox = new THREE.Box3().setFromObject(scene);
                if (fbBox.isEmpty()) return;
                box.copy(fbBox);
            }
            const centre = box.getCenter(new THREE.Vector3());

            // Force isometric view
            const dir = new THREE.Vector3(1, 1, 1).normalize();

            // Calculate max dimension of the scene
            const boxSize = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z);

            const t = transRef.current;
            t.targetLookAt.copy(centre);
            t.targetUp.set(0, 1, 0);

            if (camera.isOrthographicCamera) {
                // Orthographic cameras don't change scale with distance, only zoom and frustum bounds.
                // Pull back far enough to ensure nothing clips the near/far planes.
                t.targetPos.copy(centre.clone().addScaledVector(dir, Math.max(maxDim * 2, 5000)));

                // Calculate correct zoom.
                // Camera visible height = (camera.top - camera.bottom) / camera.zoom
                const viewHeight = camera.top - camera.bottom;
                const viewWidth = camera.right - camera.left;

                // We want maxDim * 1.5 (for padding) to fit within both width and height.
                const fitSize = maxDim > 0 ? maxDim * 1.5 : 5000;
                const zoomX = viewWidth / fitSize;
                const zoomY = viewHeight / fitSize;

                const targetZoom = Math.min(zoomX, zoomY);
                t.targetZoom = Math.min(Math.max(targetZoom, 0.001), 100);
            } else {
                // Perspective fallback
                const dist = maxDim > 0 ? maxDim * 1.5 : 5000;
                t.targetPos.copy(centre.clone().addScaledVector(dir, dist));
                t.targetZoom = null;
            }

            t.active = true;
        };

        // ── Smooth center on point ─────
        window.__pcfCameraCenterOnPoint = (point, zoomLevel = 4.0) => {
            const t = transRef.current;
            const dir = new THREE.Vector3(1, 1, 1).normalize();
            t.targetLookAt.copy(point);
            t.targetUp.set(0, 1, 0);
            t.targetPos.copy(point.clone().addScaledVector(dir, 1000));
            if (camera.isOrthographicCamera) {
                t.targetZoom = zoomLevel;
            }
            // Explicitly set the controls target so OrbitControls revolves around the new point
            if (controls) {
                controls.target.copy(point);
            }
            t.active = true;
        };
    }, [camera, controls, scene]);

    return null;
}

// ── App ───────────────────────────────────────────────────────────────
export const App = () => {
    const [panelCollapsed, setPanelCollapsed] = useState(false);
    const renderId = useEditorStore(state => state.renderId) || 0;

    // Panel width — affects offset of overlay controls
    const PANEL_W = 280; // Widened to match new Component Info panel width
    const PANEL_STRIP = 32;
    const panelWidth = panelCollapsed ? PANEL_STRIP : PANEL_W;
    const overlayRight = panelWidth + 10;


    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', background: '#1e1e1e' }}>

            <Canvas orthographic camera={{ position: [5000, 5000, 5000], zoom: 1, far: 1000000 }}>
                <Suspense fallback={null}>
                    <Viewer3D key={renderId} />
                    <OrbitControls makeDefault />
                    <CameraBridge />

                    {/* Axis Gizmo — bottom-right, matches comparison tool */}
                    <GizmoHelper alignment="bottom-right" margin={[overlayRight + 80, 80]}>
                        <GizmoViewport
                            axisColors={['#ff6b6b', '#4dabf7', '#51cf66']}
                            labelColor="white"
                            hideNegativeAxes={false}
                        />
                    </GizmoHelper>
                </Suspense>
            </Canvas>

            {/* Center button — fits all geometry in view */}
            <div style={{
                position: 'absolute',
                top: 12,
                right: overlayRight,
                zIndex: 100, // Above Component Info Panel (z-index 50)
                transition: 'right 0.22s ease',
            }}>
                <button
                    onClick={() => { if (window.__pcfCameraCenter) window.__pcfCameraCenter(); }}
                    title="Auto Center — fit all geometry in view"
                    style={{
                        background: 'rgba(30,50,80,0.85)',
                        border: '1px solid #4a6fa5',
                        color: '#a0c4ff',
                        borderRadius: 4,
                        padding: '2px 10px',
                        fontSize: 11,
                        cursor: 'pointer',
                        backdropFilter: 'blur(4px)',
                    }}
                >⊙ Center</button>
            </div>

            {/* Left nav rail for camera snaps */}
            <div style={{
                position: 'absolute',
                top: 90,
                left: 12,
                width: 64,
                padding: '10px 8px',
                background: 'rgba(15,20,32,0.92)',
                border: '1px solid #2f3a55',
                borderRadius: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                zIndex: 120,
                boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
                backdropFilter: 'blur(4px)'
            }}>
                <button title="Pan mode (toggle rotate off/on)" onClick={() => {
                    const c = window.__pcfOrbitControls;
                    if (!c) return;
                    const panOnly = c.enableRotate;
                    c.enableRotate = !panOnly ? true : false;
                    c.enablePan = true;
                }} style={{ padding: '8px', borderRadius: 8, background: '#1f2a44', color: '#cdd7f5', border: '1px solid #3a4a6a' }}>🖐</button>
                <button title="Reset orbit (ISO)" onClick={() => {
                    if (window.__pcfCameraSnap) window.__pcfCameraSnap([1, 1, 1], [0, 1, 0]);
                    if (window.__pcfCameraCenter) window.__pcfCameraCenter();
                }} style={{ padding: '8px', borderRadius: 8, background: '#2d4fcf', color: 'white', border: '1px solid #4d6df0' }}>⟳</button>
                <div style={{ height: 1, background: '#2a3347', margin: '4px 0' }} />
                <button title="Fit / Home" onClick={() => { if (window.__pcfCameraCenter) window.__pcfCameraCenter(); }} style={{ padding: '8px', borderRadius: 8, background: '#1f2a44', color: '#cdd7f5', border: '1px solid #3a4a6a' }}>⌂</button>
                <button title="Top" onClick={() => { if (window.__pcfCameraSnap) window.__pcfCameraSnap([0, 1, 0], [0, 0, -1]); }} style={{ padding: '6px', borderRadius: 8, background: '#0f1729', color: '#dce6ff', border: '1px solid #2b3953', fontSize: 11 }}>TOP</button>
                <button title="Front" onClick={() => { if (window.__pcfCameraSnap) window.__pcfCameraSnap([0, 0, 1], [0, 1, 0]); }} style={{ padding: '6px', borderRadius: 8, background: '#0f1729', color: '#dce6ff', border: '1px solid #2b3953', fontSize: 11 }}>FRNT</button>
                <button title="Right" onClick={() => { if (window.__pcfCameraSnap) window.__pcfCameraSnap([1, 0, 0], [0, 1, 0]); }} style={{ padding: '6px', borderRadius: 8, background: '#0f1729', color: '#dce6ff', border: '1px solid #2b3953', fontSize: 11 }}>RHT</button>
                <button title="Isometric" onClick={() => { if (window.__pcfCameraSnap) window.__pcfCameraSnap([1, 1, 1], [0, 1, 0]); }} style={{ padding: '6px', borderRadius: 8, background: '#0f1729', color: '#dce6ff', border: '1px solid #2b3953', fontSize: 11 }}>ISO</button>
                <div style={{ height: 1, background: '#2a3347', margin: '4px 0' }} />
                <button title="Fullscreen canvas" onClick={() => {
                    const el = document.getElementById('react-root');
                    const req = el?.requestFullscreen || el?.webkitRequestFullscreen || el?.mozRequestFullScreen;
                    if (req) req.call(el);
                }} style={{ padding: '8px', borderRadius: 8, background: '#1f2a44', color: '#cdd7f5', border: '1px solid #3a4a6a' }}>↗</button>
            </div>

            {/* Component Info Panel */}
            <ComponentInfoPanel onCollapseChange={setPanelCollapsed} />

        </div>
    );
};

// ── Singleton root ────────────────────────────────────────────────────
let root = null;

export const mountReactApp = (containerId, data) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    window.__REACT_BRIDGE_DATA = data;

    if (root) {
        if (useEditorStore?.getState) {
            useEditorStore.getState().setComponents(data.components);
            useEditorStore.getState().setRenderId?.(Date.now());
        }
        return root;
    }

    root = createRoot(container);
    root.render(<App />);
    // Load components immediately on first mount (same as subsequent calls)
    if (useEditorStore?.getState) {
        useEditorStore.getState().setComponents(data.components);
    }
    return root;
};
