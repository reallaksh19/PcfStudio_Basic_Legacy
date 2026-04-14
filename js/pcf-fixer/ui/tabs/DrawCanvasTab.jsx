import React, { useState, useEffect, useReducer, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useStore } from '../../store/useStore';
import { useAppContext } from '../../store/AppContext';
import { drawCanvasReducer, initialState } from '../../store/drawCanvasReducer';
import { dbg } from '../../utils/debugGate';
import { emitDrawMetric } from '../../utils/drawMetrics';
import { OrbitControls, OrthographicCamera, PerspectiveCamera, GizmoHelper, GizmoViewport, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import { ViewCube } from '../components/ViewCube';
import { NavigationPanel } from '../components/NavigationPanel';

// Helper to draw the accumulated user geometry
const DrawCanvas_DrawnComponents = ({ pipes, appSettings, selectedIndices, hiddenIndices, dcDispatch, activeTool }) => {
    const colors = appSettings?.componentColors || {};
    const toFinitePoint = (p) => {
        if (!p || typeof p !== 'object') return null;
        const x = Number.parseFloat(p.x);
        const y = Number.parseFloat(p.y);
        const z = Number.parseFloat(p.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
        return { x, y, z };
    };

    const handlePointerDown = (e, i) => {
        if (activeTool !== 'VIEW') return;
        e.stopPropagation();

        const isMultiSelect = e.ctrlKey || e.metaKey;
        if (isMultiSelect) {
            dcDispatch({ type: 'TOGGLE_SELECT', payload: i });
        } else {
            dcDispatch({ type: 'SELECT', payload: i });
        }
    };

    return (
        <group>
            {pipes.map((pipe, i) => {
                if (hiddenIndices.includes(i)) return null;

                // SUPPORT uses supportCoor as its geometry anchor, not ep1/ep2
                if (pipe.type === 'SUPPORT') {
                    const coorSafe = toFinitePoint(pipe?.supportCoor);
                    if (!coorSafe) return null;
                    const r = Math.max((pipe.bore || 100) / 2, 50);
                    const isSelected = selectedIndices.includes(i);
                    const isRest = Object.values(pipe).some(v => typeof v === 'string' && ['CA150', 'REST'].includes(v.toUpperCase()));
                    const isGui = Object.values(pipe).some(v => typeof v === 'string' && ['CA100', 'GUI'].includes(v.toUpperCase()));
                    const supColor = isSelected ? appSettings.selectionColor : (isRest || isGui ? '#22c55e' : (colors['SUPPORT'] || '#10b981'));
                    return (
                        <group key={`dp-${i}`} position={[coorSafe.x, coorSafe.y, coorSafe.z]} onPointerDown={(e) => handlePointerDown(e, i)}>
                            <mesh position={[0, r * 0.5, 0]}>
                                <cylinderGeometry args={[0, r * 2, r, 8]} />
                                <meshStandardMaterial color={supColor} transparent={translucentMode} opacity={translucentMode ? 0.3 : 1} depthWrite={!translucentMode} />
                            </mesh>
                            <mesh position={[0, -r * 0.25, 0]}>
                                <cylinderGeometry args={[r, r, r * 0.5, 8]} />
                                <meshStandardMaterial color={supColor} transparent={translucentMode} opacity={translucentMode ? 0.3 : 1} depthWrite={!translucentMode} />
                            </mesh>
                            {isGui && (
                                <group position={[r * 1.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                                    <mesh position={[0, r * 0.5, 0]}>
                                        <cylinderGeometry args={[0, r * 1.5, r, 8]} />
                                        <meshStandardMaterial color={supColor} transparent={translucentMode} opacity={translucentMode ? 0.3 : 1} depthWrite={!translucentMode} />
                                    </mesh>
                                    <mesh position={[0, -r * 0.25, 0]}>
                                        <cylinderGeometry args={[r * 0.8, r * 0.8, r * 0.5, 8]} />
                                        <meshStandardMaterial color={supColor} transparent={translucentMode} opacity={translucentMode ? 0.3 : 1} depthWrite={!translucentMode} />
                                    </mesh>
                                </group>
                            )}
                        </group>
                    );
                }

                const ep1Safe = toFinitePoint(pipe?.ep1);
                const ep2Safe = toFinitePoint(pipe?.ep2);
                if (!ep1Safe || !ep2Safe) return null;

                const ep1 = new THREE.Vector3(ep1Safe.x, ep1Safe.y, ep1Safe.z);
                const ep2 = new THREE.Vector3(ep2Safe.x, ep2Safe.y, ep2Safe.z);
                const dist = ep1.distanceTo(ep2);
                const mid = new THREE.Vector3().addVectors(ep1, ep2).multiplyScalar(0.5);

                const dir = ep2.clone().sub(ep1).normalize();
                const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

                const isSelected = selectedIndices.includes(i);
                const getCol = (def) => isSelected ? appSettings.selectionColor : (colors[pipe.type] || def);

                if (pipe.type === 'BEND') {
                    return (
                        <group key={`dp-${i}`} onPointerDown={(e) => handlePointerDown(e, i)}>
                            <mesh position={mid} quaternion={quat}>
                                <cylinderGeometry args={[(pipe.bore/2)*1.1, (pipe.bore/2)*1.1, dist, 16]} />
                                <meshStandardMaterial color={getCol("#94a3b8")} roughness={0.6} metalness={0.2} />
                            </mesh>
                        </group>
                    );
                }
                if (pipe.type === 'REDUCER') {
                    return (
                        <group key={`dp-${i}`} onPointerDown={(e) => handlePointerDown(e, i)}>
                            <mesh position={mid} quaternion={quat}>
                                <cylinderGeometry args={[pipe.bore/2, (pipe.bore/2)*0.5, dist, 16]} />
                                <meshStandardMaterial color={getCol("#64748b")} roughness={0.6} metalness={0.2} />
                            </mesh>
                        </group>
                    );
                }
                if (pipe.type === 'TEE') {
                    return (
                        <group key={`dp-${i}`} onPointerDown={(e) => handlePointerDown(e, i)}>
                            <mesh position={mid} quaternion={quat}>
                                <cylinderGeometry args={[pipe.bore/2, pipe.bore/2, dist, 8]} />
                                <meshStandardMaterial color={getCol("#94a3b8")} roughness={0.6} metalness={0.2} />
                            </mesh>
                        </group>
                    );
                }
                if (pipe.type === 'FLANGE') {
                    return (
                        <group key={`dp-${i}`} onPointerDown={(e) => handlePointerDown(e, i)}>
                            <mesh position={mid} quaternion={quat}>
                                <cylinderGeometry args={[(pipe.bore/2)*1.6, (pipe.bore/2)*1.6, Math.max(dist*0.15, 10), 24]} />
                                <meshStandardMaterial color={getCol("#60a5fa")} roughness={0.6} metalness={0.2} />
                            </mesh>
                        </group>
                    );
                }
                if (pipe.type === 'VALVE') {
                    const r = pipe.bore / 2;
                    return (
                        <group key={`dp-${i}`} position={mid} quaternion={quat} onPointerDown={(e) => handlePointerDown(e, i)}>
                            <mesh position={[0, -dist/4, 0]}>
                                <cylinderGeometry args={[0, r*1.8, dist/2, 16]} />
                                <meshStandardMaterial color={getCol("#3b82f6")} roughness={0.6} metalness={0.2} />
                            </mesh>
                            <mesh position={[0, dist/4, 0]}>
                                <cylinderGeometry args={[r*1.8, 0, dist/2, 16]} />
                                <meshStandardMaterial color={getCol("#3b82f6")} roughness={0.6} metalness={0.2} />
                            </mesh>
                            <group position={[r*2, 0, 0]} rotation={[0, 0, Math.PI/2]}>
                                <mesh position={[0, dist/2, 0]}>
                                    <cylinderGeometry args={[r*0.2, r*0.2, dist, 8]} />
                                    <meshStandardMaterial color={getCol("#3b82f6")} roughness={0.6} metalness={0.2} />
                                </mesh>
                                <mesh position={[0, dist, 0]} rotation={[Math.PI/2, 0, 0]}>
                                     <torusGeometry args={[r, r*0.2, 8, 24]} />
                                     <meshStandardMaterial color={getCol("#3b82f6")} roughness={0.6} metalness={0.2} />
                                </mesh>
                                <mesh position={[0, dist, 0]}>
                                     <cylinderGeometry args={[r*0.4, r*0.4, r*0.2, 16]} />
                                     <meshStandardMaterial color={getCol("#3b82f6")} roughness={0.6} metalness={0.2} />
                                </mesh>
                            </group>
                        </group>
                    );
                }
                return (
                    <group key={`dp-${i}`} onPointerDown={(e) => handlePointerDown(e, i)}>
                        <mesh position={mid} quaternion={quat}>
                            <cylinderGeometry args={[pipe.bore/2, pipe.bore/2, dist, 8]} />
                            <meshStandardMaterial color={getCol("#3b82f6")} roughness={0.6} metalness={0.2} />
                        </mesh>
                    </group>
                );
            })}
        </group>
    );
};

const DrawCanvas_DrawTool = ({ activeTool, drawnPipes, dcDispatch, gridConfig, onCursorMove }) => {
    const [startPt, setStartPt] = useState(null);
    const [currPt, setCurrPt] = useState(null);
    const snapResolution = gridConfig.snapResolution;
    const defaultBore = 200;

    // Handle Esc to cancel drawing
    useEffect(() => {
        const handleKeyDown = (e) => {
            const activeTab = useStore.getState().activeTab;
            if (activeTab && activeTab !== 'draw') return;

            if (e.key === 'Escape') {
                if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;

                if (startPt) {
                    dbg.event('DRAW_ESCAPE', 'Drawing cancelled', { hadStartPt: !!startPt });
                    dcDispatch({ type: 'INCREMENT_METRIC', payload: 'cancelCount' });
                    emitDrawMetric({ tool: activeTool, phase: 'CANCEL', result: 'ESC' });
                    setStartPt(null);
                    setCurrPt(null);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [startPt, activeTool]);

    const handlePointerDown = (e) => {
        if (!['DRAW_PIPE', 'DRAW_BEND', 'DRAW_TEE', 'FLANGE', 'VALVE', 'REDUCER', 'SUPPORT'].includes(activeTool)) return;
        e.stopPropagation();

        const t0 = performance.now();
        try {

        // Snap to existing geometry if hovered, otherwise grid snap
        let nearestSnap = null;
        let minDist = 200; // Snap radius in world units

        drawnPipes.forEach(pipe => {
            ['ep1', 'ep2'].forEach(key => {
                if (pipe[key]) {
                    const pt = new THREE.Vector3(pipe[key].x, pipe[key].y, pipe[key].z);
                    const dist = pt.distanceTo(e.point);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestSnap = pt.clone();
                    }
                }
            });
        });

        let snappedPt;
        if (nearestSnap) {
            snappedPt = nearestSnap;
        } else {
            // Grid snap fallback
            const x = Math.round(e.point.x / snapResolution) * snapResolution;
            const y = 0; // Lock to floor plane for now
            const z = Math.round(e.point.z / snapResolution) * snapResolution;
            snappedPt = new THREE.Vector3(x, y, z);
        }

        if (activeTool === 'SUPPORT') {
            // Find if clicking on an existing pipe to snap properly
            let targetPipe = null;
            let clickDist = Infinity;
            drawnPipes.forEach((pipe, i) => {
                if ((pipe.type || '').toUpperCase() === 'PIPE') {
                    const v1 = new THREE.Vector3(pipe.ep1.x, pipe.ep1.y, pipe.ep1.z);
                    const v2 = new THREE.Vector3(pipe.ep2.x, pipe.ep2.y, pipe.ep2.z);
                    const line = new THREE.Line3(v1, v2);
                    const closest = new THREE.Vector3();
                    line.closestPointToPoint(e.point, true, closest);
                    const d = closest.distanceTo(e.point);
                    if (d < 100 && d < clickDist) {
                        clickDist = d;
                        targetPipe = { ...pipe, _index: i };
                    }
                }
            });

            if (targetPipe) {
                // Synthesize support
                const supportRow = insertSupportAtPipe({ ...targetPipe, _rowIndex: targetPipe._index }, e.point.clone());
                if (supportRow) {
                    const newPipes = [...drawnPipes];
                    newPipes.splice(targetPipe._index + 1, 0, supportRow);
                    dcDispatch({ type: 'SET_ALL_COMPONENTS', payload: newPipes });
                    dcDispatch({ type: 'INCREMENT_METRIC', payload: 'successCount' });
                    emitDrawMetric({ tool: 'SUPPORT', phase: 'COMMIT', result: 'SUCCESS', latencyMs: performance.now() - t0 });
                }
                return;
            }
        }

        if (['FLANGE', 'VALVE', 'REDUCER'].includes(activeTool)) {
            if (!nearestSnap) {
                alert('Non-pipe components must be snapped to an existing pipeline endpoint.');
                dcDispatch({ type: 'INCREMENT_METRIC', payload: 'failCount' });
                emitDrawMetric({ tool: activeTool, phase: 'ERROR', result: 'MISSING_SNAP', latencyMs: performance.now() - t0 });
                return;
            }

            // Find the pipe we snapped to, to infer direction
            let targetPipe = null;
            let isEp1 = false;
            drawnPipes.forEach(pipe => {
                if (pipe.ep1 && new THREE.Vector3(pipe.ep1.x, pipe.ep1.y, pipe.ep1.z).distanceTo(snappedPt) < 1) {
                    targetPipe = pipe;
                    isEp1 = true;
                } else if (pipe.ep2 && new THREE.Vector3(pipe.ep2.x, pipe.ep2.y, pipe.ep2.z).distanceTo(snappedPt) < 1) {
                    targetPipe = pipe;
                    isEp1 = false;
                }
            });

            // Length defaults based on component type, optionally remembered from state
            const typeMap = {
                'FLANGE': 'FLANGE',
                'VALVE': 'VALVE',
                'REDUCER': 'REDUCER'
            };

            let len = 100;
            if (activeTool === 'FLANGE') len = 100;
            if (activeTool === 'VALVE') len = 400;
            if (activeTool === 'REDUCER') len = 300;

            // Look for a previously modified length for this component type in the drawnPipes history
            const prevMatches = drawnPipes.filter(p => p.type === typeMap[activeTool]);
            if (prevMatches.length > 0) {
                const last = prevMatches[prevMatches.length - 1];
                len = new THREE.Vector3(last.ep1.x, last.ep1.y, last.ep1.z).distanceTo(new THREE.Vector3(last.ep2.x, last.ep2.y, last.ep2.z));
            }

            let dir = new THREE.Vector3(1, 0, 0); // fallback direction
            let inheritedBore = defaultBore;
            let skey = 'FLWN';

            if (targetPipe) {
                const p1 = new THREE.Vector3(targetPipe.ep1.x, targetPipe.ep1.y, targetPipe.ep1.z);
                const p2 = new THREE.Vector3(targetPipe.ep2.x, targetPipe.ep2.y, targetPipe.ep2.z);

                // Direction continues OUTWARD from the pipe
                if (isEp1) {
                    dir = p1.clone().sub(p2).normalize();
                } else {
                    dir = p2.clone().sub(p1).normalize();
                }
                inheritedBore = targetPipe.bore || defaultBore;
            }

            const ep2 = snappedPt.clone().add(dir.multiplyScalar(len));

            if (activeTool === 'VALVE') skey = 'VBFL';
            if (activeTool === 'REDUCER') skey = 'RECON';

            dcDispatch({ type: 'ADD_COMPONENT', payload: {
                type: typeMap[activeTool],
                skey: skey,
                bore: inheritedBore,
                ep1: { x: snappedPt.x, y: snappedPt.y, z: snappedPt.z },
                ep2: { x: ep2.x, y: ep2.y, z: ep2.z },
                pipelineRef: targetPipe ? targetPipe.pipelineRef : 'UNKNOWN',
                ca1: targetPipe ? targetPipe.ca1 : '',
                ca2: targetPipe ? targetPipe.ca2 : '',
                ca3: targetPipe ? targetPipe.ca3 : '',
                ca4: targetPipe ? targetPipe.ca4 : '',
                ca5: targetPipe ? targetPipe.ca5 : '',
                ca6: targetPipe ? targetPipe.ca6 : '',
                ca7: targetPipe ? targetPipe.ca7 : '',
                ca8: targetPipe ? targetPipe.ca8 : '',
                ca9: targetPipe ? targetPipe.ca9 : '',
                ca10: targetPipe ? targetPipe.ca10 : ''
            }});
            dcDispatch({ type: 'INCREMENT_METRIC', payload: 'successCount' });
            emitDrawMetric({ tool: activeTool, phase: 'COMMIT', result: 'SUCCESS', latencyMs: performance.now() - t0 });
            return;
        }

        if (['DRAW_BEND', 'DRAW_TEE'].includes(activeTool)) {
            alert('To insert Bends or Tees, draw overlapping pipes and use the "Convert to Bend/Tee" tools instead.');
            dcDispatch({ type: 'SET_TOOL', payload: 'VIEW' });
            return;
        }

        if (!startPt) {
            setStartPt(snappedPt);
            setCurrPt(snappedPt.clone());
            emitDrawMetric({ tool: activeTool, phase: 'STEP1', result: 'ARMED', latencyMs: performance.now() - t0 });
        } else {
            if (snappedPt.distanceTo(startPt) > 0) {
                let actualStart = startPt;
                const defaultBendRadius = defaultBore * 1.5;

                let newComponents = [];

                // Simple auto-routing: check if we are changing direction relative to the last pipe drawn
                if (drawnPipes.length > 0 && activeTool === 'DRAW_PIPE') {
                    const lastComponent = drawnPipes[drawnPipes.length - 1];
                    if (lastComponent.type === 'PIPE') {
                        const lA = new THREE.Vector3(lastComponent.ep1.x, lastComponent.ep1.y, lastComponent.ep1.z);
                        const lB = new THREE.Vector3(lastComponent.ep2.x, lastComponent.ep2.y, lastComponent.ep2.z);

                        if (lB.distanceTo(startPt) < 1) {
                            const dir1 = lB.clone().sub(lA).normalize();
                            const dir2 = snappedPt.clone().sub(startPt).normalize();

                            // If direction changes, insert BEND
                            if (Math.abs(dir1.dot(dir2)) < 0.99) {
                                if (useStore.getState().appSettings.autoBendEnabled) {
                                    // Trim last pipe
                                    const trimDist = defaultBendRadius;
                                    const newLastEp2 = lB.clone().sub(dir1.clone().multiplyScalar(trimDist));

                                    // Update last pipe in array
                                    const updatedPipes = [...drawnPipes];
                                    updatedPipes[updatedPipes.length - 1].ep2 = { x: newLastEp2.x, y: newLastEp2.y, z: newLastEp2.z };

                                    // Create bend
                                    const bendEp1 = newLastEp2;
                                    const bendEp2 = startPt.clone().add(dir2.clone().multiplyScalar(trimDist));

                                    newComponents.push({
                                        type: 'BEND',
                                        bore: defaultBore,
                                        ep1: { x: bendEp1.x, y: bendEp1.y, z: bendEp1.z },
                                        ep2: { x: bendEp2.x, y: bendEp2.y, z: bendEp2.z }
                                    });

                                    // New pipe starts after bend
                                    actualStart = bendEp2;

                                    newComponents.forEach(c => dcDispatch({ type: 'ADD_COMPONENT', payload: c }));
                                    dcDispatch({ type: 'ADD_COMPONENT', payload: {
                                        type: 'PIPE',
                                        bore: defaultBore,
                                        ep1: { x: actualStart.x, y: actualStart.y, z: actualStart.z },
                                        ep2: { x: snappedPt.x, y: snappedPt.y, z: snappedPt.z }
                                    }});

                                    setStartPt(snappedPt);
                                    return;
                                }
                            }
                        }
                    }
                }

                // Normal straight pipe append
                dcDispatch({ type: 'ADD_COMPONENT', payload: {
                    type: 'PIPE',
                    bore: defaultBore,
                    ep1: { x: actualStart.x, y: actualStart.y, z: actualStart.z },
                    ep2: { x: snappedPt.x, y: snappedPt.y, z: snappedPt.z }
                }});
            }

            // Continuous draw
            setStartPt(snappedPt);
            dcDispatch({ type: 'INCREMENT_METRIC', payload: 'successCount' });
            emitDrawMetric({ tool: activeTool, phase: 'COMMIT', result: 'SUCCESS', latencyMs: performance.now() - t0 });
        }
        } catch (err) {
            dbg.error('DRAW_TOOL', 'Fatal error during drawing operation', { error: err.message });
            setStartPt(null);
            dcDispatch({ type: 'INCREMENT_METRIC', payload: 'failCount' });
            emitDrawMetric({ tool: activeTool, phase: 'ERROR', result: 'FATAL', errorClass: err.message, latencyMs: performance.now() - t0 });
        }
    };

    const [hoverSnap, setHoverSnap] = useState(null);

    const handlePointerMove = (e) => {
        if (!['DRAW_PIPE', 'DRAW_BEND', 'DRAW_TEE', 'FLANGE', 'VALVE', 'REDUCER', 'SUPPORT'].includes(activeTool)) return;

        let nearestSnap = null;
        let minDist = 200; // Snap radius in world units

        drawnPipes.forEach(pipe => {
            ['ep1', 'ep2'].forEach(key => {
                if (pipe[key]) {
                    const pt = new THREE.Vector3(pipe[key].x, pipe[key].y, pipe[key].z);
                    const dist = pt.distanceTo(e.point);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestSnap = pt.clone();
                    }
                }
            });
        });

        setHoverSnap(nearestSnap);

        if (!startPt || activeTool !== 'DRAW_PIPE') return;

        let p;
        if (nearestSnap) {
            p = nearestSnap;
        } else {
            const x = Math.round(e.point.x / snapResolution) * snapResolution;
            const y = 0;
            const z = Math.round(e.point.z / snapResolution) * snapResolution;

            // Ortho tracking helper - lock to major axes if moving mostly straight
            p = new THREE.Vector3(x, y, z);
            const dx = Math.abs(p.x - startPt.x);
            const dz = Math.abs(p.z - startPt.z);

            if (dx > dz * 2) p.z = startPt.z;
            else if (dz > dx * 2) p.x = startPt.x;
        }

        setCurrPt(p);
        onCursorMove && onCursorMove(p);
    };

    const handleContextMenu = (e) => {
        e.preventDefault();
        setStartPt(null);
        setCurrPt(null);
    };


    return (
        <group>
            <mesh
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onContextMenu={handleContextMenu}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0, 0]}
                renderOrder={-1}
            >
                <planeGeometry args={[100000, 100000]} />
                <meshBasicMaterial visible={false} />
            </mesh>

            {/* Visual Snap Indicator */}
            {hoverSnap && (
                <mesh position={hoverSnap} renderOrder={999}>
                    <sphereGeometry args={[25, 16, 16]} />
                    <meshBasicMaterial color="#10b981" transparent opacity={0.8} depthTest={false} />
                </mesh>
            )}

            {/* Preview Line */}
            {startPt && currPt && startPt.distanceTo(currPt) > 0 && (
                <group>
                    <Line points={[startPt, currPt]} color="#f59e0b" lineWidth={3} dashed />
                    <Text
                        position={[
                            (startPt.x + currPt.x) / 2,
                            200,
                            (startPt.z + currPt.z) / 2
                        ]}
                        color={useStore.getState().appSettings.selectionColor}
                        fontSize={80}
                        outlineWidth={2}
                        outlineColor="#000"
                    >
                        {`${startPt.distanceTo(currPt).toFixed(0)}mm`}
                    </Text>
                </group>
            )}

            {/* Snap point indicator */}
            {currPt && activeTool === 'DRAW_PIPE' && (
                <mesh position={currPt}>
                    <sphereGeometry args={[15]} />
                    <meshBasicMaterial color="#3b82f6" />
                </mesh>
            )}
        </group>
    );
};

import { breakPipeAtPoint, insertSupportAtPipe, fix6mmGaps } from '../../engine/GapFixEngine';
import { autoAssignPipelineRefs } from '../../engine/TopologyEngine';

// ═══════════════════════════════════════════════════════════════
// SHARED TOOL: MEASURE
// This tool also exists in src/ui/tabs/CanvasTab.jsx.
// If modifying logic, update BOTH files and run Checkpoint F.
// ═══════════════════════════════════════════════════════════════
const DrawCanvas_MeasureTool = ({ activeTool, appSettings }) => {
    const [measurePts, setMeasurePts] = useState([]);

    // Clear measure points when tool changes
    useEffect(() => {
        if (activeTool !== 'MEASURE') setMeasurePts([]);
    }, [activeTool]);

    if (activeTool !== 'MEASURE') return null;

    const handlePointerDown = (e) => {
        e.stopPropagation();
        const pt = e.point.clone();
        setMeasurePts(prev => {
            if (prev.length >= 2) return [pt]; // reset on 3rd click
            return [...prev, pt];
        });
    };

    return (
        <group>
            <mesh onPointerDown={handlePointerDown} renderOrder={-1}>
                 <planeGeometry args={[200000, 200000]} />
                 <meshBasicMaterial visible={false} depthWrite={false} transparent opacity={0} />
            </mesh>

            {measurePts.length >= 1 && (
                <mesh position={measurePts[0]}>
                    <sphereGeometry args={[20, 16, 16]} />
                    <meshBasicMaterial color={appSettings.selectionColor} />
                </mesh>
            )}

            {measurePts.length === 2 && (
                <>
                    <mesh position={measurePts[1]}>
                        <sphereGeometry args={[20, 16, 16]} />
                        <meshBasicMaterial color={appSettings.selectionColor} />
                    </mesh>
                    <Line points={[measurePts[0], measurePts[1]]} color={appSettings.selectionColor} lineWidth={3} />

                    {(() => {
                        const mid = measurePts[0].clone().lerp(measurePts[1], 0.5);
                        const dist = measurePts[0].distanceTo(measurePts[1]);
                        mid.y += 100;

                        const dx = Math.abs(measurePts[0].x - measurePts[1].x);
                        const dy = Math.abs(measurePts[0].y - measurePts[1].y);
                        const dz = Math.abs(measurePts[0].z - measurePts[1].z);
                        return (
                            <group position={mid}>
                                <mesh position={[0, 0, 0]}>
                                    <planeGeometry args={[1000, 400]} />
                                    <meshBasicMaterial color="#1e293b" side={THREE.DoubleSide} opacity={0.8} transparent depthTest={false} />
                                </mesh>
                                <Text position={[0, 50, 1]} color={appSettings.selectionColor} fontSize={100} anchorX="center" anchorY="middle" outlineWidth={2} outlineColor="#0f172a" depthTest={false}>
                                    Dist: {dist.toFixed(1)}mm
                                </Text>
                                <Text position={[0, -50, 1]} color="#cbd5e1" fontSize={60} anchorX="center" anchorY="middle" outlineWidth={2} outlineColor="#0f172a" depthTest={false}>
                                    X:{dx.toFixed(1)} Y:{dy.toFixed(1)} Z:{dz.toFixed(1)}
                                </Text>
                            </group>
                        );
                    })()}
                </>
            )}
        </group>
    );
};

// ═══════════════════════════════════════════════════════════════
// SHARED TOOL: BREAK/CUT
// This tool also exists in src/ui/tabs/CanvasTab.jsx.
// If modifying logic, update BOTH files and run Checkpoint F.
// ═══════════════════════════════════════════════════════════════
const DrawCanvas_BreakPipeLayer = ({ activeTool, drawnPipes, dcDispatch, appSettings }) => {
    const [hoverPos, setHoverPos] = useState(null);

    if (activeTool !== 'BREAK') return null;

    const handlePointerMove = (e) => {
        if (e.point) setHoverPos(e.point);
    };

    const handlePointerOut = () => {
        setHoverPos(null);
    };

    const handlePointerDown = (e, pipeIndex, pipeRow) => {
        e.stopPropagation();

        if (pipeRow) {
            const breakPt = e.point.clone();
            const breakResults = breakPipeAtPoint(pipeRow, breakPt);

            if (breakResults) {
                const [rowA, rowB] = breakResults;

                // Remove the old pipe and add the two new segments
                const updatedPipes = [...drawnPipes];
                updatedPipes.splice(pipeIndex, 1, rowA, rowB);

                dcDispatch({ type: 'SET_ALL_COMPONENTS', payload: updatedPipes });
                dcDispatch({ type: 'SET_TOOL', payload: 'VIEW' });
            }
        }
    };

    return (
        <group>
             <group onPointerMove={handlePointerMove} onPointerOut={handlePointerOut}>
                {drawnPipes.map((pipe, i) => {
                    if ((pipe.type||'').toUpperCase() !== 'PIPE' || !pipe.ep1 || !pipe.ep2) return null;
                    const v1 = new THREE.Vector3(pipe.ep1.x, pipe.ep1.y, pipe.ep1.z);
                    const v2 = new THREE.Vector3(pipe.ep2.x, pipe.ep2.y, pipe.ep2.z);
                    const mid = v1.clone().lerp(v2, 0.5);
                    const dist = v1.distanceTo(v2);
                    if (dist === 0) return null;
                    const dir = v2.clone().sub(v1).normalize();
                    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
                    const r = pipe.bore ? pipe.bore / 2 : 5;
                    return (
                        <mesh key={`bp-${i}`} position={mid} quaternion={quat} onPointerDown={(e) => handlePointerDown(e, i, pipe)}>
                            <cylinderGeometry args={[r*1.5, r*1.5, dist, 8]} />
                            <meshBasicMaterial color="red" transparent opacity={0} depthWrite={false} />
                        </mesh>
                    );
                })}
             </group>

             {hoverPos && (
                 <mesh position={hoverPos}>
                     <sphereGeometry args={[20, 16, 16]} />
                     <meshBasicMaterial color={appSettings.selectionColor} transparent opacity={0.6} depthTest={false} />
                 </mesh>
             )}
        </group>
    );
};

// ═══════════════════════════════════════════════════════════════
// CONVERSION TOOLS (BEND / TEE)
// ═══════════════════════════════════════════════════════════════
const DrawCanvas_ConversionTools = ({ activeTool, drawnPipes, dcDispatch, appSettings }) => {
    const [selectedIndices, setSelectedIndices] = useState([]);

    useEffect(() => {
        if (activeTool !== 'CONVERT_BEND' && activeTool !== 'CONVERT_TEE') {
            setSelectedIndices([]);
        }
    }, [activeTool]);

    if (activeTool !== 'CONVERT_BEND' && activeTool !== 'CONVERT_TEE') return null;

    const handlePointerDown = (e, index) => {
        e.stopPropagation();

        try {
            let newSel = [...selectedIndices];
            if (newSel.includes(index)) {
                newSel = newSel.filter(i => i !== index);
            } else {
                newSel.push(index);
            }

            setSelectedIndices(newSel);

            // Check if we meet requirements
            if (activeTool === 'CONVERT_BEND' && newSel.length === 2) {
                const p1 = drawnPipes[newSel[0]];
                const p2 = drawnPipes[newSel[1]];

                // Simple intersection assumed at endpoints for bend
                const pts = [
                    new THREE.Vector3(p1.ep1.x, p1.ep1.y, p1.ep1.z),
                    new THREE.Vector3(p1.ep2.x, p1.ep2.y, p1.ep2.z),
                    new THREE.Vector3(p2.ep1.x, p2.ep1.y, p2.ep1.z),
                    new THREE.Vector3(p2.ep2.x, p2.ep2.y, p2.ep2.z)
                ];

            let cp = null;
            let d1 = null, d2 = null;

            for (let i = 0; i < 2; i++) {
                for (let j = 2; j < 4; j++) {
                    if (pts[i].distanceTo(pts[j]) < 1) {
                        cp = pts[i];
                        d1 = pts[1-i].clone().sub(cp).normalize();
                        d2 = pts[5-j].clone().sub(cp).normalize(); // 5-j is the other end of p2 (j=2 -> 3, j=3 -> 2)
                        break;
                    }
                }
            }

            if (cp && d1 && d2) {
                // Trim logic and bend generation
                const defaultBore = p1.bore || 100;
                const trimDist = defaultBore * 1.5;

                const bendEp1 = cp.clone().add(d1.clone().multiplyScalar(trimDist));
                const bendEp2 = cp.clone().add(d2.clone().multiplyScalar(trimDist));

                const newBend = {
                    type: 'BEND',
                    bore: defaultBore,
                    ep1: { x: bendEp1.x, y: bendEp1.y, z: bendEp1.z },
                    ep2: { x: bendEp2.x, y: bendEp2.y, z: bendEp2.z }
                };

                const updatedPipes = [...drawnPipes];

                // update pipe 1
                const np1 = { ...p1 };
                if (new THREE.Vector3(np1.ep1.x, np1.ep1.y, np1.ep1.z).distanceTo(cp) < 1) np1.ep1 = { x: bendEp1.x, y: bendEp1.y, z: bendEp1.z };
                else np1.ep2 = { x: bendEp1.x, y: bendEp1.y, z: bendEp1.z };
                updatedPipes[newSel[0]] = np1;

                // update pipe 2
                const np2 = { ...p2 };
                if (new THREE.Vector3(np2.ep1.x, np2.ep1.y, np2.ep1.z).distanceTo(cp) < 1) np2.ep1 = { x: bendEp2.x, y: bendEp2.y, z: bendEp2.z };
                else np2.ep2 = { x: bendEp2.x, y: bendEp2.y, z: bendEp2.z };
                updatedPipes[newSel[1]] = np2;

                updatedPipes.push(newBend);
                dcDispatch({ type: 'SET_ALL_COMPONENTS', payload: updatedPipes });
                dcDispatch({ type: 'SET_TOOL', payload: 'VIEW' });
            } else {
                alert('Pipes must share an endpoint to convert to Bend.');
                setSelectedIndices([]);
            }
        } else if (activeTool === 'CONVERT_TEE' && newSel.length === 3) {
            // Need 3 pipes that share a center point
            const pipes = newSel.map(i => drawnPipes[i]);
            const pts = pipes.flatMap(p => [
                new THREE.Vector3(p.ep1.x, p.ep1.y, p.ep1.z),
                new THREE.Vector3(p.ep2.x, p.ep2.y, p.ep2.z)
            ]);

            // Find CP (the point that appears at least 3 times)
            let cp = null;
            for (let i = 0; i < pts.length; i++) {
                let matches = 0;
                for (let j = 0; j < pts.length; j++) {
                    if (pts[i].distanceTo(pts[j]) < 1) matches++;
                }
                if (matches >= 3) {
                    cp = pts[i];
                    break;
                }
            }

            if (cp) {
                // Find main run (collinear pipes)
                let main1 = null, main2 = null, branch = null;
                const dirs = pipes.map(p => {
                    const ep1 = new THREE.Vector3(p.ep1.x, p.ep1.y, p.ep1.z);
                    const ep2 = new THREE.Vector3(p.ep2.x, p.ep2.y, p.ep2.z);
                    return ep1.distanceTo(cp) < 1 ? ep2.clone().sub(cp).normalize() : ep1.clone().sub(cp).normalize();
                });

                for (let i = 0; i < 3; i++) {
                    for (let j = i+1; j < 3; j++) {
                        if (Math.abs(dirs[i].dot(dirs[j]) + 1) < 0.05) {
                            main1 = { idx: newSel[i], pipe: pipes[i], dir: dirs[i] };
                            main2 = { idx: newSel[j], pipe: pipes[j], dir: dirs[j] };
                            const branchIdx = [0,1,2].find(x => x !== i && x !== j);
                            branch = { idx: newSel[branchIdx], pipe: pipes[branchIdx], dir: dirs[branchIdx] };
                            break;
                        }
                    }
                    if (main1) break;
                }

                if (main1 && main2 && branch) {
                    const defaultBore = main1.pipe.bore || 100;
                    const runTrim = defaultBore;
                    const branchTrim = defaultBore;

                    const tEp1 = cp.clone().add(main1.dir.clone().multiplyScalar(runTrim));
                    const tEp2 = cp.clone().add(main2.dir.clone().multiplyScalar(runTrim));
                    const tBp = cp.clone().add(branch.dir.clone().multiplyScalar(branchTrim));

                    const newTee = {
                        type: 'TEE',
                        bore: defaultBore,
                        branchBore: branch.pipe.bore || defaultBore,
                        ep1: { x: tEp1.x, y: tEp1.y, z: tEp1.z },
                        ep2: { x: tEp2.x, y: tEp2.y, z: tEp2.z },
                        cp: { x: cp.x, y: cp.y, z: cp.z },
                        bp: { x: tBp.x, y: tBp.y, z: tBp.z }
                    };

                    const updatedPipes = [...drawnPipes];

                    // Trim pipes
                    [
                        { pData: main1, pt: tEp1 },
                        { pData: main2, pt: tEp2 },
                        { pData: branch, pt: tBp }
                    ].forEach(({ pData, pt }) => {
                        const np = { ...pData.pipe };
                        if (new THREE.Vector3(np.ep1.x, np.ep1.y, np.ep1.z).distanceTo(cp) < 1) np.ep1 = { x: pt.x, y: pt.y, z: pt.z };
                        else np.ep2 = { x: pt.x, y: pt.y, z: pt.z };
                        updatedPipes[pData.idx] = np;
                    });

                    updatedPipes.push(newTee);
                    dcDispatch({ type: 'SET_ALL_COMPONENTS', payload: updatedPipes });
                    dcDispatch({ type: 'SET_TOOL', payload: 'VIEW' });
                } else {
                    alert('Could not find a valid TEE configuration. Make sure two pipes form a straight line and the third is the branch.');
                    setSelectedIndices([]);
                }
            } else {
                alert('Pipes must all share a common center point.');
                setSelectedIndices([]);
            }
        }
        } catch (err) {
            dbg.error('CONVERT_TOOL', 'Fatal error during bend/tee conversion', { error: err.message, index });
            setSelectedIndices([]);
            dcDispatch({ type: 'SET_TOOL', payload: 'VIEW' });
        }
    };

    return (
        <group>
            {drawnPipes.map((pipe, i) => {
                if ((pipe.type||'').toUpperCase() !== 'PIPE' || !pipe.ep1 || !pipe.ep2) return null;
                const v1 = new THREE.Vector3(pipe.ep1.x, pipe.ep1.y, pipe.ep1.z);
                const v2 = new THREE.Vector3(pipe.ep2.x, pipe.ep2.y, pipe.ep2.z);
                const mid = v1.clone().lerp(v2, 0.5);
                const dist = v1.distanceTo(v2);
                if (dist === 0) return null;
                const dir = v2.clone().sub(v1).normalize();
                const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
                const r = pipe.bore ? pipe.bore / 2 : 5;
                const isSelected = selectedIndices.includes(i);

                return (
                    <mesh key={`conv-${i}`} position={mid} quaternion={quat} onPointerDown={(e) => handlePointerDown(e, i)}>
                        <cylinderGeometry args={[r*1.5, r*1.5, dist, 8]} />
                        <meshBasicMaterial color={isSelected ? "#a855f7" : "white"} transparent opacity={isSelected ? 0.8 : 0.1} depthWrite={false} />
                    </mesh>
                );
            })}
        </group>
    );
};


// ═══════════════════════════════════════════════════════════════
// SHARED TOOL: CONNECT & STRETCH
// This tool also exists in src/ui/tabs/CanvasTab.jsx.
// If modifying logic, update BOTH files and run Checkpoint F.
// ═══════════════════════════════════════════════════════════════
const DrawCanvas_EndpointSnapLayer = ({ activeTool, drawnPipes, dcDispatch, appSettings }) => {
    const [connectDraft, setConnectDraft] = useState(null);
    const [cursorPos, setCursorPos] = useState(new THREE.Vector3());

    if (activeTool !== 'CONNECT' && activeTool !== 'STRETCH') return null;

    const snapRadius = 50;

    const handlePointerMove = (e) => {
        let pt = e.point.clone();

        if (connectDraft) {
            // Basic ortho locking for draft connection
            const rawDelta = pt.clone().sub(connectDraft.fromPosition);
            const absX = Math.abs(rawDelta.x);
            const absY = Math.abs(rawDelta.y);
            const absZ = Math.abs(rawDelta.z);
            if (absX >= absY && absX >= absZ) { rawDelta.y = 0; rawDelta.z = 0; }
            else if (absY >= absX && absY >= absZ) { rawDelta.x = 0; rawDelta.z = 0; }
            else { rawDelta.x = 0; rawDelta.y = 0; }
            pt = connectDraft.fromPosition.clone().add(rawDelta);
        }

        setCursorPos(pt);
    };

    const handlePointerUp = (e) => {
        e.stopPropagation();

        let nearest = null;
        let minDist = snapRadius;

        drawnPipes.forEach((row, i) => {
            ['ep1', 'ep2'].forEach(epKey => {
                const ep = row[epKey];
                if (ep) {
                    const pt = new THREE.Vector3(parseFloat(ep.x), parseFloat(ep.y), parseFloat(ep.z));
                    const d = pt.distanceTo(e.point);
                    if (d < minDist) {
                        minDist = d;
                        nearest = { rowIndex: i, epKey, position: pt };
                    }
                }
            });
        });

        if (!connectDraft) {
            if (nearest) {
                setConnectDraft({ fromRowIndex: nearest.rowIndex, fromEP: nearest.epKey, fromPosition: nearest.position });
            }
            return;
        }

        if (nearest && (nearest.rowIndex !== connectDraft.fromRowIndex || nearest.epKey !== connectDraft.fromEP)) {
            const sourceRow = drawnPipes[connectDraft.fromRowIndex];
            if (sourceRow) {
                const targetPos = nearest.position;
                const sourcePos = connectDraft.fromPosition;

                if (activeTool === 'STRETCH') {
                    const updatedPipes = [...drawnPipes];
                    const updatedRow = { ...updatedPipes[connectDraft.fromRowIndex] };
                    updatedRow[connectDraft.fromEP] = { x: targetPos.x, y: targetPos.y, z: targetPos.z };
                    updatedPipes[connectDraft.fromRowIndex] = updatedRow;
                    dcDispatch({ type: 'SET_ALL_COMPONENTS', payload: updatedPipes });
                } else {
                    const newBridgePipe = {
                        type: 'PIPE',
                        ep1: { x: sourcePos.x, y: sourcePos.y, z: sourcePos.z },
                        ep2: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
                        bore: sourceRow.bore || 100,
                    };
                    const updatedPipes = [...drawnPipes];
                    updatedPipes.splice(connectDraft.fromRowIndex + 1, 0, newBridgePipe);
                    dcDispatch({ type: 'SET_ALL_COMPONENTS', payload: updatedPipes });
                }
            }
        }

        setConnectDraft(null);
        dcDispatch({ type: 'SET_TOOL', payload: 'VIEW' });
    };

    return (
        <group>
            <mesh
                scale={100000}
                rotation={[-Math.PI / 2, 0, 0]}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                renderOrder={-1}
            >
                <planeGeometry />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>

            {drawnPipes.map((row, i) => {
                const pts = [];
                if (row.ep1) pts.push(new THREE.Vector3(parseFloat(row.ep1.x), parseFloat(row.ep1.y), parseFloat(row.ep1.z)));
                if (row.ep2) pts.push(new THREE.Vector3(parseFloat(row.ep2.x), parseFloat(row.ep2.y), parseFloat(row.ep2.z)));
                return (
                    <React.Fragment key={`snapgroup-${i}`}>
                        {pts.map((pt, ptIdx) => (
                            <mesh key={`snap-${i}-${ptIdx}`} position={pt} renderOrder={999}>
                                <sphereGeometry args={[20, 16, 16]} />
                                <meshBasicMaterial color={appSettings.selectionColor} transparent opacity={0.5} depthTest={false} />
                            </mesh>
                        ))}
                    </React.Fragment>
                );
            })}

            {connectDraft && (() => {
                const start = connectDraft.fromPosition;
                const end = cursorPos;
                const vec = new THREE.Vector3().subVectors(end, start);
                const len = vec.length();
                if (len < 0.1) return null;
                const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
                const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec.clone().normalize());
                const color = activeTool === 'STRETCH' ? '#10b981' : '#f59e0b';

                return (
                    <mesh position={mid} quaternion={q} renderOrder={998}>
                        <cylinderGeometry args={[15, 15, len, 8]} />
                        <meshStandardMaterial color={color} transparent opacity={0.6} depthTest={false} />
                    </mesh>
                );
            })()}
        </group>
    );
};

// Independent View Controls for Draw Canvas
const DrawCanvas_DrawCanvasControls = ({ orthoMode, drawnPipes }) => {
    const { camera, gl } = useThree();

    useEffect(() => {
        const collectBounds = () => {
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

            drawnPipes.forEach((pipe) => {
                [pipe?.ep1, pipe?.ep2, pipe?.cp, pipe?.bp].forEach((pt) => {
                    if (!pt) return;
                    const x = Number.parseFloat(pt.x);
                    const y = Number.parseFloat(pt.y);
                    const z = Number.parseFloat(pt.z);
                    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
                    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
                    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
                });
            });

            if (minX === Infinity) return null;
            return {
                center: new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
                size: new THREE.Vector3(Math.max(maxX - minX, 1), Math.max(maxY - minY, 1), Math.max(maxZ - minZ, 1)),
            };
        };

        const frameScene = (viewType = 'FIT') => {
            const bounds = collectBounds();
            const center = bounds?.center || new THREE.Vector3(0, 0, 0);
            const size = bounds?.size || new THREE.Vector3(1000, 1000, 1000);
            const maxDim = Math.max(size.x, size.y, size.z, 1000);
            const dist = orthoMode ? maxDim * 1.6 : maxDim * 1.8;

            let position = new THREE.Vector3(center.x + dist, center.y + dist, center.z + dist);

            switch(viewType) {
                case 'TOP':
                    position = new THREE.Vector3(center.x, center.y + dist, center.z);
                    break;
                case 'FRONT':
                    position = new THREE.Vector3(center.x, center.y, center.z + dist);
                    break;
                case 'RIGHT':
                    position = new THREE.Vector3(center.x + dist, center.y, center.z);
                    break;
                case 'HOME':
                case 'ISO':
                case 'FIT':
                default:
                    break;
            }

            if (camera.isOrthographicCamera) {
                const width = gl.domElement.clientWidth || window.innerWidth || 1;
                const height = gl.domElement.clientHeight || window.innerHeight || 1;
                const zoomX = width / (Math.max(size.x, 1) * 1.6);
                const zoomY = height / (Math.max(size.y, 1) * 1.6);
                camera.zoom = Math.max(0.05, Math.min(zoomX, zoomY));
            }

            camera.position.copy(position);
            camera.up.set(0, 1, 0);
            camera.lookAt(center);
            camera.updateProjectionMatrix();
        };

        const handleSetView = (e) => {
            const { viewType } = e.detail || {};
            frameScene(viewType || 'FIT');
        };
        window.addEventListener('draw-canvas-set-view', handleSetView);
        return () => window.removeEventListener('draw-canvas-set-view', handleSetView);
    }, [camera, drawnPipes, gl, orthoMode]);

    return null;
};

export function DrawCanvasTab() {
  return <div style={{padding:'2rem',color:'gray'}}>Draw canvas tool is disabled in this App.</div>;

    const { setDrawMode, appSettings } = useStore();
    const { dispatch } = useAppContext();
    const [state, dcDispatch] = useReducer(drawCanvasReducer, initialState);
    const { drawnPipes, selectedIndex, activeTool } = state;
    const [isPanelOpen, setIsPanelOpen] = useState(true);
    const [cursorWorldPos, setCursorWorldPos] = useState({ x: 0, y: 0, z: 0 });
    const [isListOpen, setIsListOpen] = useState(true);
    const [localOrthoMode, setLocalOrthoMode] = useState(true);
    const [showGridSettings, setShowGridSettings] = useState(false);

    const [gridConfig, setGridConfig] = useState({
        density: 100,
        opacity: 0.5,
        snapResolution: 100
    });

    // Dynamic axes helper size — scales with scene extent so it's always visible
    const axesSize = useMemo(() => {
        if (!drawnPipes || drawnPipes.length === 0) return 1000;
        let maxExtent = 0;
        for (const p of drawnPipes) {
            for (const pt of [p.ep1, p.ep2, p.supportCoor, p.cp]) {
                if (pt) maxExtent = Math.max(maxExtent, Math.abs(pt.x), Math.abs(pt.y), Math.abs(pt.z));
            }
        }
        return maxExtent > 1000 ? maxExtent * 0.05 : 1000;
    }, [drawnPipes]);

    // Handle Esc globally inside Draw Canvas to cancel tool selection
    useEffect(() => {
        const handleKeyDown = (e) => {
            const activeTab = useStore.getState().activeTab;
            if (activeTab && activeTab !== 'draw') return;

            if (e.key === 'Escape') {
                if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
                dcDispatch({ type: 'SET_TOOL', payload: 'VIEW' });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Also support native Pan mode
    const interactionMode = useStore(state => state.interactionMode);

    const controlsEnabled = activeTool === 'VIEW' || activeTool === 'PAN' || activeTool === 'ORBIT';
    const mouseButtons = {
        LEFT: activeTool === 'PAN' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: activeTool === 'PAN' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN
    };

    return (
        <div className="relative w-full overflow-hidden bg-slate-950 flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
            {/* Top Minimal Toolbar */}
            <div className="flex justify-between items-center px-4 py-2 bg-slate-900 border-b border-slate-700">
                <div className="flex items-center gap-4 text-slate-200 font-bold text-sm tracking-wide">
                    DRAW CANVAS
                </div>
                <div className="flex gap-2">
                    <button onClick={() => {
                        const data = useStore.getState().dataTable;
                        if (data && data.length > 0) {
                            if (window.confirm('Pulling from 3D Topo will overwrite the current drawing. Continue?')) {
                                const payloadData = JSON.parse(JSON.stringify(data))
                                    .filter(r => r && r.ep1 && r.ep2)
                                    .map(r => ({
                                        ...r,
                                        ep1: {
                                            x: Number.parseFloat(r.ep1.x),
                                            y: Number.parseFloat(r.ep1.y),
                                            z: Number.parseFloat(r.ep1.z)
                                        },
                                        ep2: {
                                            x: Number.parseFloat(r.ep2.x),
                                            y: Number.parseFloat(r.ep2.y),
                                            z: Number.parseFloat(r.ep2.z)
                                        },
                                        bore: Number.parseFloat(r.bore) || 200,
                                        rowUid: r.rowUid || `topo_${r._rowIndex}_${Date.now()}`,
                                        sourceDomain: r.sourceDomain || 'main3D'
                                    }))
                                    .filter(r =>
                                        Number.isFinite(r.ep1.x) && Number.isFinite(r.ep1.y) && Number.isFinite(r.ep1.z) &&
                                        Number.isFinite(r.ep2.x) && Number.isFinite(r.ep2.y) && Number.isFinite(r.ep2.z)
                                    );
                                if (payloadData.length === 0) {
                                    alert('No valid EP1/EP2 rows found in 3D Topo.');
                                    return;
                                }
                                dcDispatch({ type: 'SET_ALL_COMPONENTS', payload: payloadData });
                            }
                        } else {
                            alert('No data in 3D Topo to pull.');
                        }
                    }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors">
                        Pull from 3D Topo
                    </button>
                    <button onClick={() => {
                        if (drawnPipes.length > 0) {
                            const { updatedTable, fixLog } = fix6mmGaps(drawnPipes);
                            dcDispatch({ type: 'SET_ALL_COMPONENTS', payload: updatedTable });
                            fixLog.forEach(log => dispatch({ type: "ADD_LOG", payload: log }));
                        }
                    }} className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors" title="Weld endpoints within 6mm">
                        Clean Gaps (6mm)
                    </button>
                    <button onClick={() => {
                        if (drawnPipes.length > 0) {
                            import('../../engine/OverlapSolver.js').then(({ resolveOverlaps }) => {
                                const { updatedTable, fixLog } = resolveOverlaps(drawnPipes);
                                dcDispatch({ type: 'SET_ALL_COMPONENTS', payload: updatedTable });
                                fixLog.forEach(log => dispatch({ type: "ADD_LOG", payload: log }));
                            });
                        }
                    }} className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors" title="Trim pipes overlapping with rigid fittings">
                        Overlap Solver
                    </button>
                    <button onClick={() => {
                        if (drawnPipes.length > 0) {
                            if (window.confirm('Pushing to 3D Topo will overwrite the main canvas. Continue?')) {
                                try {
                                    useStore.getState().pushHistory('Push from Draw Canvas');

                                    let newTable = JSON.parse(JSON.stringify(drawnPipes)).map((r, i) => ({
                                        ...r,
                                        rowUid: r.rowUid || `draw_${i}_${Date.now()}`,
                                        sourceDomain: 'drawCanvas',
                                        lastMutationAt: Date.now()
                                    }));

                                    // Auto assign pipeline refs immediately before pushing
                                    const { updatedTable: autoTable, fixLog } = autoAssignPipelineRefs(newTable);
                                    newTable = autoTable;
                                    fixLog.forEach(log => dispatch({ type: "ADD_LOG", payload: log }));

                                    useStore.getState().setDataTable(newTable);
                                    dispatch({ type: 'APPLY_GAP_FIX', payload: { updatedTable: newTable } });
                                    dispatch({ type: 'ADD_LOG', payload: { stage: 'INTERACTIVE', type: 'Info', message: 'Data pushed from Draw Canvas successfully.' } });

                                    if (typeof dbg !== 'undefined') dbg.state('DRAW_CANVAS', 'Pushed to 3D Topo', { components: newTable.length });
                                    alert('Data pushed to main 3D canvas successfully.');
                                } catch (e) {
                                    if (typeof dbg !== 'undefined') dbg.error('DRAW_CANVAS', 'Push to Topo failed', e);
                                    dispatch({ type: 'ADD_LOG', payload: { stage: 'INTERACTIVE', type: 'Error', message: `Failed to push Draw Canvas data: ${e.message}` } });
                                    alert('Error pushing data. See log for details.');
                                }
                            }
                        } else {
                            alert('No drawn components to push.');
                        }
                    }} className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors">
                        Push to 3D Topo
                    </button>
                    {/* Minimize just collapses panels instead of vanishing window */}
                    <button onClick={() => { setIsPanelOpen(!isPanelOpen); setIsListOpen(!isListOpen); }} className="text-slate-400 hover:text-white px-2 rounded text-xs transition-colors border-l border-slate-700 pl-4 ml-2">Toggle Panels</button>
                    <button onClick={() => setShowGridSettings(!showGridSettings)} className={`text-slate-400 hover:text-white px-2 rounded transition-colors ${showGridSettings ? 'text-white bg-slate-800' : ''}`} title="Draw Settings">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    </button>
                    <button onClick={() => setDrawMode(false)} className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors ml-2">Close</button>
                </div>
            </div>

            {/* Draw Settings moved to right sidebar — see inside flex container below */}

            <div className="flex flex-1 overflow-hidden relative">

                {/* Left Vertical Toolbar (48px wide) */}
                <div className="w-12 bg-slate-900 border-r border-slate-700 flex flex-col items-center py-2 gap-2 z-10 shrink-0">
                    <button data-testid="drawbtn-ortho" className={`w-8 h-8 rounded flex items-center justify-center ${localOrthoMode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => setLocalOrthoMode(!localOrthoMode)} title="Toggle Ortho/Perspective">
                        <span className="font-bold text-xs uppercase">{localOrthoMode ? 'ORT' : 'PER'}</span>
                    </button>
                    <div className="w-6 h-px bg-slate-700 my-1"></div>
                    <button data-testid="drawbtn-view" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'VIEW' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'VIEW' })} title="Select (Orbit)">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l-7-7 7-7"/><path d="M19 12H5"/></svg>
                    </button>
                    <button data-testid="drawbtn-pan" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'PAN' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'PAN' })} title="Pan">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.44 2.05L21.95 5.56L18.44 9.07"/><path d="M5.56 21.95L2.05 18.44L5.56 14.93"/><path d="M2.05 18.44L21.95 5.56"/></svg>
                    </button>
                    <button data-testid="drawbtn-orbit" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'ORBIT' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'ORBIT' })} title="Orbit">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    </button>
                    <div className="w-6 h-px bg-slate-700 my-1"></div>
                    <button data-testid="drawbtn-pipe" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'DRAW_PIPE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'DRAW_PIPE' })} title="Draw Pipe">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="2" y1="22" x2="22" y2="2"/></svg>
                    </button>
                    <button data-testid="drawbtn-bend" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'DRAW_BEND' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'DRAW_BEND' })} title="Draw Bend">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 22h14a2 2 0 0 0 2-2V6l-3-4H6L3 6v14a2 2 0 0 0 2 2z"/></svg>
                    </button>
                    <button data-testid="drawbtn-tee" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'DRAW_TEE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'DRAW_TEE' })} title="Draw Tee">
                        <span className="font-bold text-xs uppercase text-center w-full block">T</span>
                    </button>
                    <div className="w-6 h-px bg-slate-700 my-1"></div>
                    <button data-testid="drawbtn-convert-bend" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'CONVERT_BEND' ? 'bg-purple-600 text-white' : 'text-purple-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'CONVERT_BEND' })} title="Convert intersection to Bend (Select 2 pipes)">
                        <span className="font-bold text-[10px] uppercase text-center w-full block">CB</span>
                    </button>
                    <button data-testid="drawbtn-convert-tee" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'CONVERT_TEE' ? 'bg-purple-600 text-white' : 'text-purple-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'CONVERT_TEE' })} title="Convert intersection to Tee (Select 3 pipes)">
                        <span className="font-bold text-[10px] uppercase text-center w-full block">CT</span>
                    </button>
                    <button data-testid="drawbtn-auto-fittings" className={`w-8 h-8 rounded flex items-center justify-center text-purple-400 hover:bg-slate-700 hover:text-white`} onClick={() => {
                        import('../../engine/OverlapSolver.js').then(({ autoFittingSolver }) => {
                            const { updatedTable } = autoFittingSolver(drawnPipes);
                            dcDispatch({ type: 'SET_ALL_COMPONENTS', payload: updatedTable });
                        });
                    }} title="Auto-Insert Fittings (Bends, Tees, Reducers)">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>
                    </button>
                    <div className="w-6 h-px bg-slate-700 my-1"></div>
                    <button data-testid="drawbtn-flange" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'FLANGE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'FLANGE' })} title="Flange">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
                    </button>
                    <button data-testid="drawbtn-valve" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'VALVE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'VALVE' })} title="Valve">
                         <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 3 21 21 21 3 3 21"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
                    </button>
                    <button data-testid="drawbtn-reducer" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'REDUCER' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'REDUCER' })} title="Reducer">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 4 21 8 21 16 3 20 3 4"/></svg>
                    </button>
                    <button data-testid="drawbtn-support" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'SUPPORT' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'SUPPORT' })} title="Support">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V12"/><path d="m5 12 7-7 7 7"/></svg>
                    </button>
                    <div className="w-6 h-px bg-slate-700 my-1"></div>
                    {/* ═══════════════════════════════════════════════════════════════
                    // SHARED TOOL: CONNECT
                    // This tool also exists in src/ui/tabs/CanvasTab.jsx.
                    // If modifying logic, update BOTH files and run Checkpoint F.
                    // ═══════════════════════════════════════════════════════════════ */}
                    <button data-testid="drawbtn-connect" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'CONNECT' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'CONNECT' })} title="Connect Elements">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    </button>
                    {/* ═══════════════════════════════════════════════════════════════
                    // SHARED TOOL: STRETCH
                    // This tool also exists in src/ui/tabs/CanvasTab.jsx.
                    // If modifying logic, update BOTH files and run Checkpoint F.
                    // ═══════════════════════════════════════════════════════════════ */}
                    <button data-testid="drawbtn-stretch" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'STRETCH' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'STRETCH' })} title="Stretch Element">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></svg>
                    </button>
                    {/* ═══════════════════════════════════════════════════════════════
                    // SHARED TOOL: BREAK/CUT
                    // This tool also exists in src/ui/tabs/CanvasTab.jsx.
                    // If modifying logic, update BOTH files and run Checkpoint F.
                    // ═══════════════════════════════════════════════════════════════ */}
                    <button data-testid="drawbtn-break" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'BREAK' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'BREAK' })} title="Break Element">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg>
                    </button>
                    {/* ═══════════════════════════════════════════════════════════════
                    // SHARED TOOL: MEASURE
                    // This tool also exists in src/ui/tabs/CanvasTab.jsx.
                    // If modifying logic, update BOTH files and run Checkpoint F.
                    // ═══════════════════════════════════════════════════════════════ */}
                    <button data-testid="drawbtn-measure" className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'MEASURE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => dcDispatch({ type: 'SET_TOOL', payload: 'MEASURE' })} title="Measure Distance">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="8" x="2" y="8" rx="2" ry="2"/><path d="M6 8v4"/><path d="M10 8v4"/><path d="M14 8v4"/><path d="M18 8v4"/></svg>
                    </button>
                    <div className="w-6 h-px bg-slate-700 my-1"></div>
                    <button className={`w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white`} onClick={() => dcDispatch({ type: 'UNDO' })} title="Undo Last Element">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                    </button>
                    <button className={`w-8 h-8 rounded flex items-center justify-center ${state.multiSelectedIndices.length > 0 || selectedIndex !== null ? 'text-red-400 hover:bg-red-900/50' : 'text-slate-600 cursor-not-allowed'}`} disabled={state.multiSelectedIndices.length === 0 && selectedIndex === null} onClick={() => dcDispatch({ type: 'DELETE_SELECTED' })} title="Delete Selected Element(s)">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                    <button className={`w-8 h-8 rounded flex items-center justify-center ${state.multiSelectedIndices.length > 0 || selectedIndex !== null ? 'text-slate-400 hover:bg-slate-700 hover:text-white' : 'text-slate-600 cursor-not-allowed'}`} disabled={state.multiSelectedIndices.length === 0 && selectedIndex === null} onClick={() => dcDispatch({ type: 'HIDE_SELECTED' })} title="Hide Selected Element(s)">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                    </button>
                    <button className={`w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white`} onClick={() => dcDispatch({ type: 'UNHIDE_ALL' })} title="Unhide All">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                </div>

                {/* Main Canvas Area */}
                <div className="flex-1 relative bg-slate-950">
                    <Canvas
                        dpr={appSettings.limitPixelRatio ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio}
                        gl={{ antialias: !appSettings.disableAA }}
                    >
                        {localOrthoMode ? (
                            <OrthographicCamera makeDefault position={[5000, 5000, 5000]} zoom={0.2} near={0.1} far={500000} />
                        ) : (
                            <PerspectiveCamera makeDefault position={[5000, 5000, 5000]} fov={appSettings.cameraFov} near={appSettings.cameraNear || 1} far={appSettings.cameraFar || 500000} />
                        )}

                        <DrawCanvas_DrawCanvasControls orthoMode={localOrthoMode} drawnPipes={drawnPipes} />

                        <color attach="background" args={[appSettings.backgroundColor || '#0d1117']} />
                        <ambientLight intensity={0.6} />
                        <directionalLight position={[1000, 1000, 500]} intensity={1.5} />

                        <gridHelper
                            args={[
                                100000,
                                Math.round(100000 / gridConfig.density),
                                new THREE.Color('#3a4255').multiplyScalar(gridConfig.opacity * 2),
                                new THREE.Color('#252a3a').multiplyScalar(gridConfig.opacity * 2)
                            ]}
                            position={[0, -1, 0]}
                        />
                        <axesHelper args={[axesSize]} />

                        <DrawCanvas_DrawnComponents pipes={drawnPipes} appSettings={appSettings} selectedIndices={state.multiSelectedIndices.length > 0 ? state.multiSelectedIndices : (selectedIndex !== null ? [selectedIndex] : [])} hiddenIndices={state.hiddenIndices} dcDispatch={dcDispatch} activeTool={activeTool} />
                        <DrawCanvas_DrawTool activeTool={activeTool} drawnPipes={drawnPipes} dcDispatch={dcDispatch} gridConfig={gridConfig} onCursorMove={setCursorWorldPos} />
                        <DrawCanvas_MeasureTool activeTool={activeTool} appSettings={appSettings} />
                        <DrawCanvas_BreakPipeLayer activeTool={activeTool} drawnPipes={drawnPipes} dcDispatch={dcDispatch} appSettings={appSettings} />
                        <DrawCanvas_EndpointSnapLayer activeTool={activeTool} drawnPipes={drawnPipes} dcDispatch={dcDispatch} appSettings={appSettings} />
                        <DrawCanvas_ConversionTools activeTool={activeTool} drawnPipes={drawnPipes} dcDispatch={dcDispatch} appSettings={appSettings} />

                        <OrbitControls
                            enabled={controlsEnabled}
                            makeDefault
                            enableDamping
                            dampingFactor={0.1}
                            mouseButtons={mouseButtons}
                        />

                        <ViewCube customEventName="draw-canvas-set-view" />
                        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
                            <GizmoViewport axisColors={['#ef4444', '#10b981', '#3b82f6']} labelColor="white" />
                        </GizmoHelper>
                    </Canvas>

                    {/* Bottom Status Bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-slate-900 border-t border-slate-700 flex items-center px-4 text-xs text-slate-400 justify-between">
                        <div className="flex gap-4">
                            <span>Tool: <strong>{activeTool.replace('_', ' ')}</strong></span>
                            <span>Snap: Grid+Endpoint</span>
                        </div>
                        <div className="flex gap-4">
                            <span>X: {cursorWorldPos.x.toFixed(1)} Y: {cursorWorldPos.y.toFixed(1)} Z: {cursorWorldPos.z.toFixed(1)}</span>
                            <span>Components: {drawnPipes.length}</span>
                        </div>
                    </div>
                    <NavigationPanel
                        customEventName="draw-canvas-set-view"
                        interactionMode={activeTool === 'PAN' ? 'PAN' : 'ROTATE'}
                        onInteractionModeChange={(mode) => dcDispatch({ type: 'SET_TOOL', payload: mode === 'PAN' ? 'PAN' : 'ORBIT' })}
                        className="top-4 right-[320px]"
                    />
                </div>

                {/* Draw Settings Sidebar */}
                {showGridSettings && (
                    <div className="w-64 flex-shrink-0 bg-slate-800 border-l border-slate-700 flex flex-col overflow-y-auto z-10">
                        <div className="flex justify-between items-center px-4 py-2 border-b border-slate-700">
                            <h3 className="text-sm font-bold text-slate-200">Draw Settings</h3>
                            <button onClick={() => setShowGridSettings(false)} className="text-slate-400 hover:text-white text-lg leading-none">✕</button>
                        </div>
                        <div className="flex flex-col gap-4 p-4">
                            <label className="flex justify-between items-center cursor-pointer group">
                                <div>
                                    <div className="text-xs font-medium text-slate-200">Auto Bend</div>
                                    <div className="text-[10px] text-slate-400">Insert bend on dir change</div>
                                </div>
                                <div className="relative">
                                    <input type="checkbox" className="sr-only" checked={appSettings.autoBendEnabled} onChange={(e) => useStore.getState().updateAppSettings({ autoBendEnabled: e.target.checked })} />
                                    <div className={`block w-8 h-5 rounded-full transition-colors ${appSettings.autoBendEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform ${appSettings.autoBendEnabled ? 'translate-x-3' : ''}`}></div>
                                </div>
                            </label>
                            <div className="border-t border-slate-700 pt-2">
                                <h4 className="text-xs font-bold text-slate-400 mb-2">Grid</h4>
                                <div className="flex flex-col gap-2">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-slate-400">Grid Density</label>
                                        <input type="range" min="10" max="1000" step="10" value={gridConfig.density} onChange={(e) => setGridConfig({...gridConfig, density: parseInt(e.target.value)})} className="w-full accent-blue-500" />
                                        <div className="text-right text-[10px] text-slate-500">{gridConfig.density}mm</div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-slate-400">Grid Opacity</label>
                                        <input type="range" min="0" max="1" step="0.1" value={gridConfig.opacity} onChange={(e) => setGridConfig({...gridConfig, opacity: parseFloat(e.target.value)})} className="w-full accent-blue-500" />
                                        <div className="text-right text-[10px] text-slate-500">{gridConfig.opacity}</div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-slate-400">Snap Resolution</label>
                                        <select value={gridConfig.snapResolution} onChange={(e) => setGridConfig({...gridConfig, snapResolution: parseInt(e.target.value)})} className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded p-1">
                                            <option value="1">1 mm</option>
                                            <option value="10">10 mm</option>
                                            <option value="50">50 mm</option>
                                            <option value="100">100 mm</option>
                                            <option value="500">500 mm</option>
                                            <option value="1000">1000 mm</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Right Properties Panel (300px) */}
                {isPanelOpen && (() => {
                    function getPanelMode() {
                        if (activeTool && ['BREAK', 'MEASURE', 'CONNECT', 'STRETCH'].includes(activeTool)) return 'READ_ONLY';
                        if (state.multiSelectedIndices?.length > 1) return 'MULTI_RESTRICTED';
                        if (selectedIndex === null) return 'HIDDEN';
                        return 'SINGLE_EDIT';
                    }
                    const panelMode = getPanelMode();

                    return (
                        <div className="w-[300px] bg-slate-900 border-l border-slate-700 flex flex-col z-10 shrink-0">
                            <div className="flex justify-between items-center p-3 border-b border-slate-700 bg-slate-800">
                                <span className="font-bold text-xs text-slate-200">PROPERTIES</span>
                                <button onClick={() => setIsPanelOpen(false)} className="text-slate-400 hover:text-white">✕</button>
                            </div>
                            <div className="p-4 flex flex-col gap-4 overflow-y-auto">
                                {panelMode === 'HIDDEN' && (
                                    <div className="text-slate-400 text-sm italic text-center">Select a single component to edit properties.</div>
                                )}
                                {panelMode === 'MULTI_RESTRICTED' && (
                                    <div className="text-purple-400 text-sm font-bold text-center bg-purple-900/30 p-2 rounded border border-purple-800/50">Multiple items selected. Bulk edit not supported in Draw Canvas.</div>
                                )}
                                {panelMode === 'READ_ONLY' && selectedIndex !== null && (
                                    <div className="text-amber-400 text-sm italic text-center mb-2">Properties are read-only while using destructive tools ({activeTool}).</div>
                                )}
                                {(panelMode === 'SINGLE_EDIT' || (panelMode === 'READ_ONLY' && selectedIndex !== null)) && (
                                    <>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-slate-500 uppercase">Length (mm)</label>
                                            <input
                                                type="text"
                                                className="bg-slate-950 border border-slate-700 rounded p-1 text-sm text-slate-200 outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                value={drawnPipes[selectedIndex].ep1 && drawnPipes[selectedIndex].ep2 ? new THREE.Vector3(drawnPipes[selectedIndex].ep1.x, drawnPipes[selectedIndex].ep1.y, drawnPipes[selectedIndex].ep1.z).distanceTo(new THREE.Vector3(drawnPipes[selectedIndex].ep2.x, drawnPipes[selectedIndex].ep2.y, drawnPipes[selectedIndex].ep2.z)).toFixed(1) : '-'}
                                                disabled={panelMode === 'READ_ONLY'}
                                                onChange={(e) => {
                                                    const raw = String(e.target.value).trim();
                                                    const newLen = Number(raw);
                                                    if (!Number.isFinite(newLen) || newLen <= 0) return;

                                                    const p = drawnPipes[selectedIndex];
                                                    const p1 = new THREE.Vector3(p.ep1.x, p.ep1.y, p.ep1.z);
                                                    const p2 = new THREE.Vector3(p.ep2.x, p.ep2.y, p.ep2.z);
                                                    const dir = p2.clone().sub(p1).normalize();
                                                    const newP2 = p1.clone().add(dir.multiplyScalar(newLen));
                                                    dcDispatch({ type: 'UPDATE_COMPONENT', payload: { index: selectedIndex, component: { ...p, ep2: { x: newP2.x, y: newP2.y, z: newP2.z } } } });
                                                }}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-slate-500 uppercase">Bore (mm)</label>
                                            <input
                                                type="text"
                                                className="bg-slate-950 border border-slate-700 rounded p-1 text-sm text-slate-200 outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                value={drawnPipes[selectedIndex].bore || '-'}
                                                disabled={panelMode === 'READ_ONLY'}
                                                onChange={(e) => {
                                                    const raw = String(e.target.value).trim();
                                                    const newBore = Number(raw);
                                                    if (!Number.isFinite(newBore) || newBore <= 0) return;

                                                    dcDispatch({ type: 'UPDATE_COMPONENT', payload: { index: selectedIndex, component: { ...drawnPipes[selectedIndex], bore: newBore } } });
                                                }}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-slate-500 uppercase">Schedule</label>
                                            <input disabled={panelMode === 'READ_ONLY'} type="text" className="bg-slate-950 border border-slate-700 rounded p-1 text-sm text-slate-200 outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed" value="-" onChange={() => {}} />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })()}
                {!isPanelOpen && (
                    <button onClick={() => setIsPanelOpen(true)} className="absolute top-14 right-3 bg-slate-800 text-slate-300 border border-slate-700 px-2 py-1 rounded z-20 hover:text-white hover:bg-slate-700 text-[11px] font-semibold">
                        Open Properties
                    </button>
                )}
            </div>

            {/* Bottom Component List (Collapsible, 150px) */}
            {isListOpen && (
                <div className="h-[150px] bg-slate-900 border-t border-slate-700 flex flex-col z-10 shrink-0 relative">
                    <div className="flex justify-between items-center px-4 py-1 bg-slate-800 border-b border-slate-700">
                        <span className="font-bold text-xs text-slate-200">COMPONENT LIST</span>
                        <button onClick={() => setIsListOpen(false)} className="text-slate-400 hover:text-white text-xs">▼ Hide</button>
                    </div>
                    <div className="flex-1 overflow-auto bg-slate-950 p-2">
                        <table className="w-full text-left text-xs text-slate-400 border-collapse">
                            <thead>
                                <tr className="border-b border-slate-800">
                                    <th className="py-1 px-2 font-medium">#</th>
                                    <th className="py-1 px-2 font-medium">Type</th>
                                    <th className="py-1 px-2 font-medium">Length</th>
                                    <th className="py-1 px-2 font-medium">Bore</th>
                                    <th className="py-1 px-2 font-medium">EP1</th>
                                    <th className="py-1 px-2 font-medium">EP2</th>
                                </tr>
                            </thead>
                            <tbody>
                                {drawnPipes.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="py-4 text-center text-slate-600 italic">No components drawn yet.</td>
                                    </tr>
                                ) : (
                                    drawnPipes.map((p, i) => (
                                        <tr key={i} className={`border-b border-slate-800 cursor-pointer ${selectedIndex === i ? 'bg-blue-900/30' : 'hover:bg-slate-900'}`} onClick={() => dcDispatch({ type: 'SELECT', payload: i })}>
                                            <td className="py-1 px-2">{i+1}</td>
                                            <td className="py-1 px-2 text-blue-400 font-bold">{p.type}</td>
                                            <td className="py-1 px-2">
                                                {p.type === 'PIPE' ? (
                                                    <input
                                                        type="number"
                                                        value={new THREE.Vector3(p.ep1.x, p.ep1.y, p.ep1.z).distanceTo(new THREE.Vector3(p.ep2.x, p.ep2.y, p.ep2.z)).toFixed(1)}
                                                        onChange={(e) => {
                                                            const newLen = parseFloat(e.target.value) || 0;
                                                            const p1 = new THREE.Vector3(p.ep1.x, p.ep1.y, p.ep1.z);
                                                            const p2 = new THREE.Vector3(p.ep2.x, p.ep2.y, p.ep2.z);
                                                            const dir = p2.clone().sub(p1).normalize();
                                                            const newP2 = p1.clone().add(dir.multiplyScalar(newLen));
                                                        dcDispatch({ type: 'UPDATE_COMPONENT', payload: { index: i, component: { ...p, ep2: { x: newP2.x, y: newP2.y, z: newP2.z } } } });
                                                        }}
                                                        className="w-24 bg-slate-950 border border-slate-700 px-1 py-0.5 rounded text-slate-300 outline-none focus:border-blue-500"
                                                    />
                                                ) : '-'}
                                            </td>
                                            <td className="py-1 px-2">
                                                <input
                                                    type="number"
                                                    value={p.bore}
                                                    onChange={(e) => {
                                                        const newVal = parseFloat(e.target.value) || 0;
                                                        dcDispatch({ type: 'UPDATE_COMPONENT', payload: { index: i, component: { ...p, bore: newVal } } });
                                                    }}
                                                    className="w-16 bg-slate-950 border border-slate-700 px-1 py-0.5 rounded text-slate-300 outline-none focus:border-blue-500"
                                                />
                                            </td>
                                            <td className="py-1 px-2">
                                                <input
                                                    type="text"
                                                    value={`${p.ep1.x.toFixed(0)}, ${p.ep1.y.toFixed(0)}, ${p.ep1.z.toFixed(0)}`}
                                                    onChange={(e) => {
                                                        const parts = e.target.value.split(',').map(n => parseFloat(n.trim()));
                                                        if (parts.length === 3 && parts.every(n => !isNaN(n))) {
                                                            dcDispatch({ type: 'UPDATE_COMPONENT', payload: { index: i, component: { ...p, ep1: { x: parts[0], y: parts[1], z: parts[2] } } } });
                                                        }
                                                    }}
                                                    className="w-32 bg-slate-950 border border-slate-700 px-1 py-0.5 rounded text-slate-300 outline-none focus:border-blue-500"
                                                />
                                            </td>
                                            <td className="py-1 px-2">
                                                <input
                                                    type="text"
                                                    value={`${p.ep2.x.toFixed(0)}, ${p.ep2.y.toFixed(0)}, ${p.ep2.z.toFixed(0)}`}
                                                    onChange={(e) => {
                                                        const parts = e.target.value.split(',').map(n => parseFloat(n.trim()));
                                                        if (parts.length === 3 && parts.every(n => !isNaN(n))) {
                                                            dcDispatch({ type: 'UPDATE_COMPONENT', payload: { index: i, component: { ...p, ep2: { x: parts[0], y: parts[1], z: parts[2] } } } });
                                                        }
                                                    }}
                                                    className="w-32 bg-slate-950 border border-slate-700 px-1 py-0.5 rounded text-slate-300 outline-none focus:border-blue-500"
                                                />
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {!isListOpen && (
                <button onClick={() => setIsListOpen(true)} className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-400 border border-b-0 border-slate-700 px-4 py-1 rounded-t z-20 hover:text-white hover:bg-slate-700 text-xs font-bold shadow-lg">
                    ▲ SHOW COMPONENT LIST
                </button>
            )}
        </div>
    );
}
