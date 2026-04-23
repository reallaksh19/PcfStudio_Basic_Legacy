import React, { useState, useEffect, useReducer, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useStore } from '../../store/useStore.js';
import { useAppContext } from '../../store/AppContext.js';
import { drawCanvasReducer, initialState } from '../../store/drawCanvasReducer.js';
import { dbg } from '../../utils/debugGate.js';
import { emitDrawMetric } from '../../utils/drawMetrics.js';
import { OrbitControls, OrthographicCamera, PerspectiveCamera, GizmoHelper, GizmoViewport, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import { ViewCube } from '../components/ViewCube.js';
import { NavigationPanel } from '../components/NavigationPanel.js';

// Helper to draw the accumulated user geometry
const DrawCanvas_DrawnComponents = ({
  pipes,
  appSettings,
  selectedIndices,
  hiddenIndices,
  dcDispatch,
  activeTool
}) => {
  const colors = appSettings?.componentColors || {};
  const toFinitePoint = p => {
    if (!p || typeof p !== 'object') return null;
    const x = Number.parseFloat(p.x);
    const y = Number.parseFloat(p.y);
    const z = Number.parseFloat(p.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return {
      x,
      y,
      z
    };
  };
  const handlePointerDown = (e, i) => {
    if (activeTool !== 'VIEW') return;
    e.stopPropagation();
    const isMultiSelect = e.ctrlKey || e.metaKey;
    if (isMultiSelect) {
      dcDispatch({
        type: 'TOGGLE_SELECT',
        payload: i
      });
    } else {
      dcDispatch({
        type: 'SELECT',
        payload: i
      });
    }
  };
  return _jsx("group", {
    children: pipes.map((pipe, i) => {
      if (hiddenIndices.includes(i)) return null;

      // SUPPORT uses supportCoor as geometry anchor, not ep1/ep2
      if (pipe.type === 'SUPPORT') {
        const coorSafe = toFinitePoint(pipe?.supportCoor);
        if (!coorSafe) return null;
        const r = Math.max((pipe.bore || 100) / 2, 50);
        const supColor = selectedIndices.includes(i) ? appSettings.selectionColor : (colors['SUPPORT'] || '#10b981');
        return _jsxs("group", {
          position: [coorSafe.x, coorSafe.y, coorSafe.z],
          onPointerDown: e => handlePointerDown(e, i),
          children: [_jsxs("mesh", {
            position: [0, r * 0.5, 0],
            children: [_jsx("cylinderGeometry", { args: [0, r * 2, r, 8] }),
              _jsx("meshStandardMaterial", { color: supColor })]
          }), _jsxs("mesh", {
            position: [0, -r * 0.25, 0],
            children: [_jsx("cylinderGeometry", { args: [r, r, r * 0.5, 8] }),
              _jsx("meshStandardMaterial", { color: supColor })]
          })]
        }, `dp-${i}`);
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
      const getCol = def => isSelected ? appSettings.selectionColor : colors[pipe.type] || def;
      if (pipe.type === 'BEND') {
        return _jsx("group", {
          onPointerDown: e => handlePointerDown(e, i),
          children: _jsxs("mesh", {
            position: mid,
            quaternion: quat,
            children: [_jsx("cylinderGeometry", {
              args: [pipe.bore / 2 * 1.1, pipe.bore / 2 * 1.1, dist, 16]
            }), _jsx("meshStandardMaterial", {
              color: getCol("#94a3b8"),
              roughness: 0.6,
              metalness: 0.2
            })]
          })
        }, `dp-${i}`);
      }
      if (pipe.type === 'REDUCER') {
        return _jsx("group", {
          onPointerDown: e => handlePointerDown(e, i),
          children: _jsxs("mesh", {
            position: mid,
            quaternion: quat,
            children: [_jsx("cylinderGeometry", {
              args: [pipe.bore / 2, pipe.bore / 2 * 0.5, dist, 16]
            }), _jsx("meshStandardMaterial", {
              color: getCol("#64748b"),
              roughness: 0.6,
              metalness: 0.2
            })]
          })
        }, `dp-${i}`);
      }
      if (pipe.type === 'TEE') {
        return _jsx("group", {
          onPointerDown: e => handlePointerDown(e, i),
          children: _jsxs("mesh", {
            position: mid,
            quaternion: quat,
            children: [_jsx("cylinderGeometry", {
              args: [pipe.bore / 2, pipe.bore / 2, dist, 8]
            }), _jsx("meshStandardMaterial", {
              color: getCol("#94a3b8"),
              roughness: 0.6,
              metalness: 0.2
            })]
          })
        }, `dp-${i}`);
      }
      if (pipe.type === 'FLANGE') {
        return _jsx("group", {
          onPointerDown: e => handlePointerDown(e, i),
          children: _jsxs("mesh", {
            position: mid,
            quaternion: quat,
            children: [_jsx("cylinderGeometry", {
              args: [pipe.bore / 2 * 1.6, pipe.bore / 2 * 1.6, Math.max(dist * 0.15, 10), 24]
            }), _jsx("meshStandardMaterial", {
              color: getCol("#60a5fa"),
              roughness: 0.6,
              metalness: 0.2
            })]
          })
        }, `dp-${i}`);
      }
      if (pipe.type === 'VALVE') {
        const r = pipe.bore / 2;
        return _jsxs("group", {
          position: mid,
          quaternion: quat,
          onPointerDown: e => handlePointerDown(e, i),
          children: [_jsxs("mesh", {
            position: [0, -dist / 4, 0],
            children: [_jsx("cylinderGeometry", {
              args: [0, r * 1.8, dist / 2, 16]
            }), _jsx("meshStandardMaterial", {
              color: getCol("#3b82f6"),
              roughness: 0.6,
              metalness: 0.2
            })]
          }), _jsxs("mesh", {
            position: [0, dist / 4, 0],
            children: [_jsx("cylinderGeometry", {
              args: [r * 1.8, 0, dist / 2, 16]
            }), _jsx("meshStandardMaterial", {
              color: getCol("#3b82f6"),
              roughness: 0.6,
              metalness: 0.2
            })]
          }), _jsxs("group", {
            position: [r * 2, 0, 0],
            rotation: [0, 0, Math.PI / 2],
            children: [_jsxs("mesh", {
              position: [0, dist / 2, 0],
              children: [_jsx("cylinderGeometry", {
                args: [r * 0.2, r * 0.2, dist, 8]
              }), _jsx("meshStandardMaterial", {
                color: getCol("#3b82f6"),
                roughness: 0.6,
                metalness: 0.2
              })]
            }), _jsxs("mesh", {
              position: [0, dist, 0],
              rotation: [Math.PI / 2, 0, 0],
              children: [_jsx("torusGeometry", {
                args: [r, r * 0.2, 8, 24]
              }), _jsx("meshStandardMaterial", {
                color: getCol("#3b82f6"),
                roughness: 0.6,
                metalness: 0.2
              })]
            }), _jsxs("mesh", {
              position: [0, dist, 0],
              children: [_jsx("cylinderGeometry", {
                args: [r * 0.4, r * 0.4, r * 0.2, 16]
              }), _jsx("meshStandardMaterial", {
                color: getCol("#3b82f6"),
                roughness: 0.6,
                metalness: 0.2
              })]
            })]
          })]
        }, `dp-${i}`);
      }
      return _jsx("group", {
        onPointerDown: e => handlePointerDown(e, i),
        children: _jsxs("mesh", {
          position: mid,
          quaternion: quat,
          children: [_jsx("cylinderGeometry", {
            args: [pipe.bore / 2, pipe.bore / 2, dist, 8]
          }), _jsx("meshStandardMaterial", {
            color: getCol("#3b82f6"),
            roughness: 0.6,
            metalness: 0.2
          })]
        })
      }, `dp-${i}`);
    })
  });
};
const DrawCanvas_DrawTool = ({
  activeTool,
  drawnPipes,
  dcDispatch,
  gridConfig,
  onCursorMove
}) => {
  const [startPt, setStartPt] = useState(null);
  const [currPt, setCurrPt] = useState(null);
  const snapResolution = gridConfig.snapResolution;
  const defaultBore = 200;

  // Handle Esc to cancel drawing
  useEffect(() => {
    const handleKeyDown = e => {
      const activeTab = useStore.getState().activeTab;
      if (activeTab && activeTab !== 'draw') return;
      if (e.key === 'Escape') {
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
        if (startPt) {
          dbg.event('DRAW_ESCAPE', 'Drawing cancelled', {
            hadStartPt: !!startPt
          });
          dcDispatch({
            type: 'INCREMENT_METRIC',
            payload: 'cancelCount'
          });
          emitDrawMetric({
            tool: activeTool,
            phase: 'CANCEL',
            result: 'ESC'
          });
          setStartPt(null);
          setCurrPt(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [startPt, activeTool]);
  const handlePointerDown = e => {
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
              targetPipe = {
                ...pipe,
                _index: i
              };
            }
          }
        });
        if (targetPipe) {
          // Synthesize support
          const supportRow = insertSupportAtPipe({
            ...targetPipe,
            _rowIndex: targetPipe._index
          }, e.point.clone());
          if (supportRow) {
            const newPipes = [...drawnPipes];
            newPipes.splice(targetPipe._index + 1, 0, supportRow);
            dcDispatch({
              type: 'SET_ALL_COMPONENTS',
              payload: newPipes
            });
            dcDispatch({
              type: 'INCREMENT_METRIC',
              payload: 'successCount'
            });
            emitDrawMetric({
              tool: 'SUPPORT',
              phase: 'COMMIT',
              result: 'SUCCESS',
              latencyMs: performance.now() - t0
            });
          }
          return;
        }
      }
      if (['FLANGE', 'VALVE', 'REDUCER'].includes(activeTool)) {
        if (!nearestSnap) {
          alert('Non-pipe components must be snapped to an existing pipeline endpoint.');
          dcDispatch({
            type: 'INCREMENT_METRIC',
            payload: 'failCount'
          });
          emitDrawMetric({
            tool: activeTool,
            phase: 'ERROR',
            result: 'MISSING_SNAP',
            latencyMs: performance.now() - t0
          });
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
        dcDispatch({
          type: 'ADD_COMPONENT',
          payload: {
            type: typeMap[activeTool],
            skey: skey,
            bore: inheritedBore,
            ep1: {
              x: snappedPt.x,
              y: snappedPt.y,
              z: snappedPt.z
            },
            ep2: {
              x: ep2.x,
              y: ep2.y,
              z: ep2.z
            },
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
          }
        });
        dcDispatch({
          type: 'INCREMENT_METRIC',
          payload: 'successCount'
        });
        emitDrawMetric({
          tool: activeTool,
          phase: 'COMMIT',
          result: 'SUCCESS',
          latencyMs: performance.now() - t0
        });
        return;
      }
      if (['DRAW_BEND', 'DRAW_TEE'].includes(activeTool)) {
        alert('To insert Bends or Tees, draw overlapping pipes and use the "Convert to Bend/Tee" tools instead.');
        dcDispatch({
          type: 'SET_TOOL',
          payload: 'VIEW'
        });
        return;
      }
      if (!startPt) {
        setStartPt(snappedPt);
        setCurrPt(snappedPt.clone());
        emitDrawMetric({
          tool: activeTool,
          phase: 'STEP1',
          result: 'ARMED',
          latencyMs: performance.now() - t0
        });
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
                    updatedPipes[updatedPipes.length - 1].ep2 = {
                      x: newLastEp2.x,
                      y: newLastEp2.y,
                      z: newLastEp2.z
                    };

                    // Create bend
                    const bendEp1 = newLastEp2;
                    const bendEp2 = startPt.clone().add(dir2.clone().multiplyScalar(trimDist));
                    newComponents.push({
                      type: 'BEND',
                      bore: defaultBore,
                      ep1: {
                        x: bendEp1.x,
                        y: bendEp1.y,
                        z: bendEp1.z
                      },
                      ep2: {
                        x: bendEp2.x,
                        y: bendEp2.y,
                        z: bendEp2.z
                      }
                    });

                    // New pipe starts after bend
                    actualStart = bendEp2;
                    newComponents.forEach(c => dcDispatch({
                      type: 'ADD_COMPONENT',
                      payload: c
                    }));
                    dcDispatch({
                      type: 'ADD_COMPONENT',
                      payload: {
                        type: 'PIPE',
                        bore: defaultBore,
                        ep1: {
                          x: actualStart.x,
                          y: actualStart.y,
                          z: actualStart.z
                        },
                        ep2: {
                          x: snappedPt.x,
                          y: snappedPt.y,
                          z: snappedPt.z
                        }
                      }
                    });
                    setStartPt(snappedPt);
                    return;
                  }
                }
              }
            }
          }

          // Normal straight pipe append
          dcDispatch({
            type: 'ADD_COMPONENT',
            payload: {
              type: 'PIPE',
              bore: defaultBore,
              ep1: {
                x: actualStart.x,
                y: actualStart.y,
                z: actualStart.z
              },
              ep2: {
                x: snappedPt.x,
                y: snappedPt.y,
                z: snappedPt.z
              }
            }
          });
        }

        // Continuous draw
        setStartPt(snappedPt);
        dcDispatch({
          type: 'INCREMENT_METRIC',
          payload: 'successCount'
        });
        emitDrawMetric({
          tool: activeTool,
          phase: 'COMMIT',
          result: 'SUCCESS',
          latencyMs: performance.now() - t0
        });
      }
    } catch (err) {
      dbg.error('DRAW_TOOL', 'Fatal error during drawing operation', {
        error: err.message
      });
      setStartPt(null);
      dcDispatch({
        type: 'INCREMENT_METRIC',
        payload: 'failCount'
      });
      emitDrawMetric({
        tool: activeTool,
        phase: 'ERROR',
        result: 'FATAL',
        errorClass: err.message,
        latencyMs: performance.now() - t0
      });
    }
  };
  const [hoverSnap, setHoverSnap] = useState(null);
  const handlePointerMove = e => {
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
      if (dx > dz * 2) p.z = startPt.z;else if (dz > dx * 2) p.x = startPt.x;
    }
    setCurrPt(p);
    onCursorMove && onCursorMove(p);
  };
  const handleContextMenu = e => {
    e.preventDefault();
    setStartPt(null);
    setCurrPt(null);
  };
  return _jsxs("group", {
    children: [_jsxs("mesh", {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onContextMenu: handleContextMenu,
      rotation: [-Math.PI / 2, 0, 0],
      position: [0, 0, 0],
      renderOrder: -1,
      children: [_jsx("planeGeometry", {
        args: [100000, 100000]
      }), _jsx("meshBasicMaterial", {
        visible: false
      })]
    }), hoverSnap && _jsxs("mesh", {
      position: hoverSnap,
      renderOrder: 999,
      children: [_jsx("sphereGeometry", {
        args: [25, 16, 16]
      }), _jsx("meshBasicMaterial", {
        color: "#10b981",
        transparent: true,
        opacity: 0.8,
        depthTest: false
      })]
    }), startPt && currPt && startPt.distanceTo(currPt) > 0 && _jsxs("group", {
      children: [_jsx(Line, {
        points: [startPt, currPt],
        color: "#f59e0b",
        lineWidth: 3,
        dashed: true
      }), _jsx(Text, {
        position: [(startPt.x + currPt.x) / 2, 200, (startPt.z + currPt.z) / 2],
        color: useStore.getState().appSettings.selectionColor,
        fontSize: 80,
        outlineWidth: 2,
        outlineColor: "#000",
        children: `${startPt.distanceTo(currPt).toFixed(0)}mm`
      })]
    }), currPt && activeTool === 'DRAW_PIPE' && _jsxs("mesh", {
      position: currPt,
      children: [_jsx("sphereGeometry", {
        args: [15]
      }), _jsx("meshBasicMaterial", {
        color: "#3b82f6"
      })]
    })]
  });
};
import { breakPipeAtPoint, insertSupportAtPipe, fix6mmGaps } from '../../engine/GapFixEngine.js';
import { autoAssignPipelineRefs } from '../../engine/TopologyEngine.js';

// ═══════════════════════════════════════════════════════════════
// SHARED TOOL: MEASURE
// This tool also exists in src/ui/tabs/CanvasTab.jsx.
// If modifying logic, update BOTH files and run Checkpoint F.
// ═══════════════════════════════════════════════════════════════
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "../../jsx-runtime.js";
const DrawCanvas_MeasureTool = ({
  activeTool,
  appSettings
}) => {
  const [measurePts, setMeasurePts] = useState([]);

  // Clear measure points when tool changes
  useEffect(() => {
    if (activeTool !== 'MEASURE') setMeasurePts([]);
  }, [activeTool]);
  if (activeTool !== 'MEASURE') return null;
  const handlePointerDown = e => {
    e.stopPropagation();
    const pt = e.point.clone();
    setMeasurePts(prev => {
      if (prev.length >= 2) return [pt]; // reset on 3rd click
      return [...prev, pt];
    });
  };
  return _jsxs("group", {
    children: [_jsxs("mesh", {
      onPointerDown: handlePointerDown,
      renderOrder: -1,
      children: [_jsx("planeGeometry", {
        args: [200000, 200000]
      }), _jsx("meshBasicMaterial", {
        visible: false,
        depthWrite: false,
        transparent: true,
        opacity: 0
      })]
    }), measurePts.length >= 1 && _jsxs("mesh", {
      position: measurePts[0],
      children: [_jsx("sphereGeometry", {
        args: [20, 16, 16]
      }), _jsx("meshBasicMaterial", {
        color: appSettings.selectionColor
      })]
    }), measurePts.length === 2 && _jsxs(_Fragment, {
      children: [_jsxs("mesh", {
        position: measurePts[1],
        children: [_jsx("sphereGeometry", {
          args: [20, 16, 16]
        }), _jsx("meshBasicMaterial", {
          color: appSettings.selectionColor
        })]
      }), _jsx(Line, {
        points: [measurePts[0], measurePts[1]],
        color: appSettings.selectionColor,
        lineWidth: 3
      }), (() => {
        const mid = measurePts[0].clone().lerp(measurePts[1], 0.5);
        const dist = measurePts[0].distanceTo(measurePts[1]);
        mid.y += 100;
        const dx = Math.abs(measurePts[0].x - measurePts[1].x);
        const dy = Math.abs(measurePts[0].y - measurePts[1].y);
        const dz = Math.abs(measurePts[0].z - measurePts[1].z);
        return _jsxs("group", {
          position: mid,
          children: [_jsxs("mesh", {
            position: [0, 0, 0],
            children: [_jsx("planeGeometry", {
              args: [1000, 400]
            }), _jsx("meshBasicMaterial", {
              color: "#1e293b",
              side: THREE.DoubleSide,
              opacity: 0.8,
              transparent: true,
              depthTest: false
            })]
          }), _jsxs(Text, {
            position: [0, 50, 1],
            color: appSettings.selectionColor,
            fontSize: 100,
            anchorX: "center",
            anchorY: "middle",
            outlineWidth: 2,
            outlineColor: "#0f172a",
            depthTest: false,
            children: ["Dist: ", dist.toFixed(1), "mm"]
          }), _jsxs(Text, {
            position: [0, -50, 1],
            color: "#cbd5e1",
            fontSize: 60,
            anchorX: "center",
            anchorY: "middle",
            outlineWidth: 2,
            outlineColor: "#0f172a",
            depthTest: false,
            children: ["X:", dx.toFixed(1), " Y:", dy.toFixed(1), " Z:", dz.toFixed(1)]
          })]
        });
      })()]
    })]
  });
};

// ═══════════════════════════════════════════════════════════════
// SHARED TOOL: BREAK/CUT
// This tool also exists in src/ui/tabs/CanvasTab.jsx.
// If modifying logic, update BOTH files and run Checkpoint F.
// ═══════════════════════════════════════════════════════════════
const DrawCanvas_BreakPipeLayer = ({
  activeTool,
  drawnPipes,
  dcDispatch,
  appSettings
}) => {
  const [hoverPos, setHoverPos] = useState(null);
  if (activeTool !== 'BREAK') return null;
  const handlePointerMove = e => {
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
        dcDispatch({
          type: 'SET_ALL_COMPONENTS',
          payload: updatedPipes
        });
        dcDispatch({
          type: 'SET_TOOL',
          payload: 'VIEW'
        });
      }
    }
  };
  return _jsxs("group", {
    children: [_jsx("group", {
      onPointerMove: handlePointerMove,
      onPointerOut: handlePointerOut,
      children: drawnPipes.map((pipe, i) => {
        if ((pipe.type || '').toUpperCase() !== 'PIPE' || !pipe.ep1 || !pipe.ep2) return null;
        const v1 = new THREE.Vector3(pipe.ep1.x, pipe.ep1.y, pipe.ep1.z);
        const v2 = new THREE.Vector3(pipe.ep2.x, pipe.ep2.y, pipe.ep2.z);
        const mid = v1.clone().lerp(v2, 0.5);
        const dist = v1.distanceTo(v2);
        if (dist === 0) return null;
        const dir = v2.clone().sub(v1).normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const r = pipe.bore ? pipe.bore / 2 : 5;
        return _jsxs("mesh", {
          position: mid,
          quaternion: quat,
          onPointerDown: e => handlePointerDown(e, i, pipe),
          children: [_jsx("cylinderGeometry", {
            args: [r * 1.5, r * 1.5, dist, 8]
          }), _jsx("meshBasicMaterial", {
            color: "red",
            transparent: true,
            opacity: 0,
            depthWrite: false
          })]
        }, `bp-${i}`);
      })
    }), hoverPos && _jsxs("mesh", {
      position: hoverPos,
      children: [_jsx("sphereGeometry", {
        args: [20, 16, 16]
      }), _jsx("meshBasicMaterial", {
        color: appSettings.selectionColor,
        transparent: true,
        opacity: 0.6,
        depthTest: false
      })]
    })]
  });
};

// ═══════════════════════════════════════════════════════════════
// CONVERSION TOOLS (BEND / TEE)
// ═══════════════════════════════════════════════════════════════
const DrawCanvas_ConversionTools = ({
  activeTool,
  drawnPipes,
  dcDispatch,
  appSettings
}) => {
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
        const pts = [new THREE.Vector3(p1.ep1.x, p1.ep1.y, p1.ep1.z), new THREE.Vector3(p1.ep2.x, p1.ep2.y, p1.ep2.z), new THREE.Vector3(p2.ep1.x, p2.ep1.y, p2.ep1.z), new THREE.Vector3(p2.ep2.x, p2.ep2.y, p2.ep2.z)];
        let cp = null;
        let d1 = null,
          d2 = null;
        for (let i = 0; i < 2; i++) {
          for (let j = 2; j < 4; j++) {
            if (pts[i].distanceTo(pts[j]) < 1) {
              cp = pts[i];
              d1 = pts[1 - i].clone().sub(cp).normalize();
              d2 = pts[5 - j].clone().sub(cp).normalize(); // 5-j is the other end of p2 (j=2 -> 3, j=3 -> 2)
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
            ep1: {
              x: bendEp1.x,
              y: bendEp1.y,
              z: bendEp1.z
            },
            ep2: {
              x: bendEp2.x,
              y: bendEp2.y,
              z: bendEp2.z
            }
          };
          const updatedPipes = [...drawnPipes];

          // update pipe 1
          const np1 = {
            ...p1
          };
          if (new THREE.Vector3(np1.ep1.x, np1.ep1.y, np1.ep1.z).distanceTo(cp) < 1) np1.ep1 = {
            x: bendEp1.x,
            y: bendEp1.y,
            z: bendEp1.z
          };else np1.ep2 = {
            x: bendEp1.x,
            y: bendEp1.y,
            z: bendEp1.z
          };
          updatedPipes[newSel[0]] = np1;

          // update pipe 2
          const np2 = {
            ...p2
          };
          if (new THREE.Vector3(np2.ep1.x, np2.ep1.y, np2.ep1.z).distanceTo(cp) < 1) np2.ep1 = {
            x: bendEp2.x,
            y: bendEp2.y,
            z: bendEp2.z
          };else np2.ep2 = {
            x: bendEp2.x,
            y: bendEp2.y,
            z: bendEp2.z
          };
          updatedPipes[newSel[1]] = np2;
          updatedPipes.push(newBend);
          dcDispatch({
            type: 'SET_ALL_COMPONENTS',
            payload: updatedPipes
          });
          dcDispatch({
            type: 'SET_TOOL',
            payload: 'VIEW'
          });
        } else {
          alert('Pipes must share an endpoint to convert to Bend.');
          setSelectedIndices([]);
        }
      } else if (activeTool === 'CONVERT_TEE' && newSel.length === 3) {
        // Need 3 pipes that share a center point
        const pipes = newSel.map(i => drawnPipes[i]);
        const pts = pipes.flatMap(p => [new THREE.Vector3(p.ep1.x, p.ep1.y, p.ep1.z), new THREE.Vector3(p.ep2.x, p.ep2.y, p.ep2.z)]);

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
          let main1 = null,
            main2 = null,
            branch = null;
          const dirs = pipes.map(p => {
            const ep1 = new THREE.Vector3(p.ep1.x, p.ep1.y, p.ep1.z);
            const ep2 = new THREE.Vector3(p.ep2.x, p.ep2.y, p.ep2.z);
            return ep1.distanceTo(cp) < 1 ? ep2.clone().sub(cp).normalize() : ep1.clone().sub(cp).normalize();
          });
          for (let i = 0; i < 3; i++) {
            for (let j = i + 1; j < 3; j++) {
              if (Math.abs(dirs[i].dot(dirs[j]) + 1) < 0.05) {
                main1 = {
                  idx: newSel[i],
                  pipe: pipes[i],
                  dir: dirs[i]
                };
                main2 = {
                  idx: newSel[j],
                  pipe: pipes[j],
                  dir: dirs[j]
                };
                const branchIdx = [0, 1, 2].find(x => x !== i && x !== j);
                branch = {
                  idx: newSel[branchIdx],
                  pipe: pipes[branchIdx],
                  dir: dirs[branchIdx]
                };
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
              ep1: {
                x: tEp1.x,
                y: tEp1.y,
                z: tEp1.z
              },
              ep2: {
                x: tEp2.x,
                y: tEp2.y,
                z: tEp2.z
              },
              cp: {
                x: cp.x,
                y: cp.y,
                z: cp.z
              },
              bp: {
                x: tBp.x,
                y: tBp.y,
                z: tBp.z
              }
            };
            const updatedPipes = [...drawnPipes];

            // Trim pipes
            [{
              pData: main1,
              pt: tEp1
            }, {
              pData: main2,
              pt: tEp2
            }, {
              pData: branch,
              pt: tBp
            }].forEach(({
              pData,
              pt
            }) => {
              const np = {
                ...pData.pipe
              };
              if (new THREE.Vector3(np.ep1.x, np.ep1.y, np.ep1.z).distanceTo(cp) < 1) np.ep1 = {
                x: pt.x,
                y: pt.y,
                z: pt.z
              };else np.ep2 = {
                x: pt.x,
                y: pt.y,
                z: pt.z
              };
              updatedPipes[pData.idx] = np;
            });
            updatedPipes.push(newTee);
            dcDispatch({
              type: 'SET_ALL_COMPONENTS',
              payload: updatedPipes
            });
            dcDispatch({
              type: 'SET_TOOL',
              payload: 'VIEW'
            });
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
      dbg.error('CONVERT_TOOL', 'Fatal error during bend/tee conversion', {
        error: err.message,
        index
      });
      setSelectedIndices([]);
      dcDispatch({
        type: 'SET_TOOL',
        payload: 'VIEW'
      });
    }
  };
  return _jsx("group", {
    children: drawnPipes.map((pipe, i) => {
      if ((pipe.type || '').toUpperCase() !== 'PIPE' || !pipe.ep1 || !pipe.ep2) return null;
      const v1 = new THREE.Vector3(pipe.ep1.x, pipe.ep1.y, pipe.ep1.z);
      const v2 = new THREE.Vector3(pipe.ep2.x, pipe.ep2.y, pipe.ep2.z);
      const mid = v1.clone().lerp(v2, 0.5);
      const dist = v1.distanceTo(v2);
      if (dist === 0) return null;
      const dir = v2.clone().sub(v1).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const r = pipe.bore ? pipe.bore / 2 : 5;
      const isSelected = selectedIndices.includes(i);
      return _jsxs("mesh", {
        position: mid,
        quaternion: quat,
        onPointerDown: e => handlePointerDown(e, i),
        children: [_jsx("cylinderGeometry", {
          args: [r * 1.5, r * 1.5, dist, 8]
        }), _jsx("meshBasicMaterial", {
          color: isSelected ? "#a855f7" : "white",
          transparent: true,
          opacity: isSelected ? 0.8 : 0.1,
          depthWrite: false
        })]
      }, `conv-${i}`);
    })
  });
};

// ═══════════════════════════════════════════════════════════════
// SHARED TOOL: CONNECT & STRETCH
// This tool also exists in src/ui/tabs/CanvasTab.jsx.
// If modifying logic, update BOTH files and run Checkpoint F.
// ═══════════════════════════════════════════════════════════════
const DrawCanvas_EndpointSnapLayer = ({
  activeTool,
  drawnPipes,
  dcDispatch,
  appSettings
}) => {
  const [connectDraft, setConnectDraft] = useState(null);
  const [cursorPos, setCursorPos] = useState(new THREE.Vector3());
  if (activeTool !== 'CONNECT' && activeTool !== 'STRETCH') return null;
  const snapRadius = 50;
  const handlePointerMove = e => {
    let pt = e.point.clone();
    if (connectDraft) {
      // Basic ortho locking for draft connection
      const rawDelta = pt.clone().sub(connectDraft.fromPosition);
      const absX = Math.abs(rawDelta.x);
      const absY = Math.abs(rawDelta.y);
      const absZ = Math.abs(rawDelta.z);
      if (absX >= absY && absX >= absZ) {
        rawDelta.y = 0;
        rawDelta.z = 0;
      } else if (absY >= absX && absY >= absZ) {
        rawDelta.x = 0;
        rawDelta.z = 0;
      } else {
        rawDelta.x = 0;
        rawDelta.y = 0;
      }
      pt = connectDraft.fromPosition.clone().add(rawDelta);
    }
    setCursorPos(pt);
  };
  const handlePointerUp = e => {
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
            nearest = {
              rowIndex: i,
              epKey,
              position: pt
            };
          }
        }
      });
    });
    if (!connectDraft) {
      if (nearest) {
        setConnectDraft({
          fromRowIndex: nearest.rowIndex,
          fromEP: nearest.epKey,
          fromPosition: nearest.position
        });
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
          const updatedRow = {
            ...updatedPipes[connectDraft.fromRowIndex]
          };
          updatedRow[connectDraft.fromEP] = {
            x: targetPos.x,
            y: targetPos.y,
            z: targetPos.z
          };
          updatedPipes[connectDraft.fromRowIndex] = updatedRow;
          dcDispatch({
            type: 'SET_ALL_COMPONENTS',
            payload: updatedPipes
          });
        } else {
          const newBridgePipe = {
            type: 'PIPE',
            ep1: {
              x: sourcePos.x,
              y: sourcePos.y,
              z: sourcePos.z
            },
            ep2: {
              x: targetPos.x,
              y: targetPos.y,
              z: targetPos.z
            },
            bore: sourceRow.bore || 100
          };
          const updatedPipes = [...drawnPipes];
          updatedPipes.splice(connectDraft.fromRowIndex + 1, 0, newBridgePipe);
          dcDispatch({
            type: 'SET_ALL_COMPONENTS',
            payload: updatedPipes
          });
        }
      }
    }
    setConnectDraft(null);
    dcDispatch({
      type: 'SET_TOOL',
      payload: 'VIEW'
    });
  };
  return _jsxs("group", {
    children: [_jsxs("mesh", {
      scale: 100000,
      rotation: [-Math.PI / 2, 0, 0],
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      renderOrder: -1,
      children: [_jsx("planeGeometry", {}), _jsx("meshBasicMaterial", {
        transparent: true,
        opacity: 0,
        depthWrite: false
      })]
    }), drawnPipes.map((row, i) => {
      const pts = [];
      if (row.ep1) pts.push(new THREE.Vector3(parseFloat(row.ep1.x), parseFloat(row.ep1.y), parseFloat(row.ep1.z)));
      if (row.ep2) pts.push(new THREE.Vector3(parseFloat(row.ep2.x), parseFloat(row.ep2.y), parseFloat(row.ep2.z)));
      return pts.map((pt, ptIdx) => _jsxs("mesh", {
        position: pt,
        renderOrder: 999,
        children: [_jsx("sphereGeometry", {
          args: [20, 16, 16]
        }), _jsx("meshBasicMaterial", {
          color: appSettings.selectionColor,
          transparent: true,
          opacity: 0.5,
          depthTest: false
        })]
      }, `snap-${i}-${ptIdx}`));
    }), connectDraft && (() => {
      const start = connectDraft.fromPosition;
      const end = cursorPos;
      const vec = new THREE.Vector3().subVectors(end, start);
      const len = vec.length();
      if (len < 0.1) return null;
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec.clone().normalize());
      const color = activeTool === 'STRETCH' ? '#10b981' : '#f59e0b';
      return _jsxs("mesh", {
        position: mid,
        quaternion: q,
        renderOrder: 998,
        children: [_jsx("cylinderGeometry", {
          args: [15, 15, len, 8]
        }), _jsx("meshStandardMaterial", {
          color: color,
          transparent: true,
          opacity: 0.6,
          depthTest: false
        })]
      });
    })()]
  });
};

// Independent View Controls for Draw Canvas
const DrawCanvas_DrawCanvasControls = ({
  orthoMode,
  drawnPipes
}) => {
  const {
    camera,
    gl
  } = useThree();
  useEffect(() => {
    const collectBounds = () => {
      let minX = Infinity,
        minY = Infinity,
        minZ = Infinity;
      let maxX = -Infinity,
        maxY = -Infinity,
        maxZ = -Infinity;
      drawnPipes.forEach(pipe => {
        [pipe?.ep1, pipe?.ep2, pipe?.cp, pipe?.bp].forEach(pt => {
          if (!pt) return;
          const x = Number.parseFloat(pt.x);
          const y = Number.parseFloat(pt.y);
          const z = Number.parseFloat(pt.z);
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          minZ = Math.min(minZ, z);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          maxZ = Math.max(maxZ, z);
        });
      });
      if (minX === Infinity) return null;
      return {
        center: new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
        size: new THREE.Vector3(Math.max(maxX - minX, 1), Math.max(maxY - minY, 1), Math.max(maxZ - minZ, 1))
      };
    };
    const frameScene = (viewType = 'FIT') => {
      const bounds = collectBounds();
      const center = bounds?.center || new THREE.Vector3(0, 0, 0);
      const size = bounds?.size || new THREE.Vector3(1000, 1000, 1000);
      const maxDim = Math.max(size.x, size.y, size.z, 1000);
      const dist = orthoMode ? maxDim * 1.6 : maxDim * 1.8;
      let position = new THREE.Vector3(center.x + dist, center.y + dist, center.z + dist);
      switch (viewType) {
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
    const handleSetView = e => {
      const {
        viewType
      } = e.detail || {};
      frameScene(viewType || 'FIT');
    };
    window.addEventListener('draw-canvas-set-view', handleSetView);
    return () => window.removeEventListener('draw-canvas-set-view', handleSetView);
  }, [camera, drawnPipes, gl, orthoMode]);
  return null;
};
export function DrawCanvasTab() {
  return React.createElement('div', {style:{padding:'2rem',color:'gray'}}, 'Draw canvas tool is disabled in this App.');

  const {
    setDrawMode,
    appSettings
  } = useStore();
  const {
    dispatch
  } = useAppContext();
  const [state, dcDispatch] = useReducer(drawCanvasReducer, initialState);
  const {
    drawnPipes,
    selectedIndex,
    activeTool
  } = state;
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [cursorWorldPos, setCursorWorldPos] = useState({
    x: 0,
    y: 0,
    z: 0
  });
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
    const handleKeyDown = e => {
      const activeTab = useStore.getState().activeTab;
      if (activeTab && activeTab !== 'draw') return;
      if (e.key === 'Escape') {
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
        dcDispatch({
          type: 'SET_TOOL',
          payload: 'VIEW'
        });
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
  return _jsxs("div", {
    className: "flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden bg-slate-950 rounded-lg shadow-inner relative mt-[-2rem]",
    children: [_jsxs("div", {
      className: "flex justify-between items-center px-4 py-2 bg-slate-900 border-b border-slate-700",
      children: [_jsx("div", {
        className: "flex items-center gap-4 text-slate-200 font-bold text-sm tracking-wide",
        children: "DRAW CANVAS"
      }), _jsxs("div", {
        className: "flex gap-2",
        children: [_jsx("button", {
          onClick: () => {
            const data = useStore.getState().dataTable;
            if (data && data.length > 0) {
              if (window.confirm('Pulling from 3D Topo will overwrite the current drawing. Continue?')) {
                const payloadData = JSON.parse(JSON.stringify(data)).filter(r => r && r.ep1 && r.ep2).map(r => ({
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
                })).filter(r => Number.isFinite(r.ep1.x) && Number.isFinite(r.ep1.y) && Number.isFinite(r.ep1.z) && Number.isFinite(r.ep2.x) && Number.isFinite(r.ep2.y) && Number.isFinite(r.ep2.z));
                if (payloadData.length === 0) {
                  alert('No valid EP1/EP2 rows found in 3D Topo.');
                  return;
                }
                dcDispatch({
                  type: 'SET_ALL_COMPONENTS',
                  payload: payloadData
                });
              }
            } else {
              alert('No data in 3D Topo to pull.');
            }
          },
          className: "bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors",
          children: "Pull from 3D Topo"
        }), _jsx("button", {
          onClick: () => {
            if (drawnPipes.length > 0) {
              const {
                updatedTable,
                fixLog
              } = fix6mmGaps(drawnPipes);
              dcDispatch({
                type: 'SET_ALL_COMPONENTS',
                payload: updatedTable
              });
              fixLog.forEach(log => dispatch({
                type: "ADD_LOG",
                payload: log
              }));
            }
          },
          className: "bg-orange-600 hover:bg-orange-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors",
          title: "Weld endpoints within 6mm",
          children: "Clean Gaps (6mm)"
        }), _jsx("button", {
          onClick: () => {
            if (drawnPipes.length > 0) {
              import('../../engine/OverlapSolver.js').then(({
                resolveOverlaps
              }) => {
                const {
                  updatedTable,
                  fixLog
                } = resolveOverlaps(drawnPipes);
                dcDispatch({
                  type: 'SET_ALL_COMPONENTS',
                  payload: updatedTable
                });
                fixLog.forEach(log => dispatch({
                  type: "ADD_LOG",
                  payload: log
                }));
              });
            }
          },
          className: "bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors",
          title: "Trim pipes overlapping with rigid fittings",
          children: "Overlap Solver"
        }), _jsx("button", {
          onClick: () => {
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
                  const {
                    updatedTable: autoTable,
                    fixLog
                  } = autoAssignPipelineRefs(newTable);
                  newTable = autoTable;
                  fixLog.forEach(log => dispatch({
                    type: "ADD_LOG",
                    payload: log
                  }));
                  useStore.getState().setDataTable(newTable);
                  dispatch({
                    type: 'APPLY_GAP_FIX',
                    payload: {
                      updatedTable: newTable
                    }
                  });
                  dispatch({
                    type: 'ADD_LOG',
                    payload: {
                      stage: 'INTERACTIVE',
                      type: 'Info',
                      message: 'Data pushed from Draw Canvas successfully.'
                    }
                  });
                  if (typeof dbg !== 'undefined') dbg.state('DRAW_CANVAS', 'Pushed to 3D Topo', {
                    components: newTable.length
                  });
                  alert('Data pushed to main 3D canvas successfully.');
                } catch (e) {
                  if (typeof dbg !== 'undefined') dbg.error('DRAW_CANVAS', 'Push to Topo failed', e);
                  dispatch({
                    type: 'ADD_LOG',
                    payload: {
                      stage: 'INTERACTIVE',
                      type: 'Error',
                      message: `Failed to push Draw Canvas data: ${e.message}`
                    }
                  });
                  alert('Error pushing data. See log for details.');
                }
              }
            } else {
              alert('No drawn components to push.');
            }
          },
          className: "bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors",
          children: "Push to 3D Topo"
        }), _jsx("button", {
          onClick: () => {
            setIsPanelOpen(!isPanelOpen);
            setIsListOpen(!isListOpen);
          },
          className: "text-slate-400 hover:text-white px-2 rounded text-xs transition-colors border-l border-slate-700 pl-4 ml-2",
          children: "Toggle Panels"
        }), _jsx("button", {
          onClick: () => setShowGridSettings(!showGridSettings),
          className: `text-slate-400 hover:text-white px-2 rounded transition-colors ${showGridSettings ? 'text-white bg-slate-800' : ''}`,
          title: "Draw Settings",
          children: _jsxs("svg", {
            width: "18",
            height: "18",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            children: [_jsx("circle", {
              cx: "12",
              cy: "12",
              r: "3"
            }), _jsx("path", {
              d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
            })]
          })
        }), _jsx("button", {
          onClick: () => setDrawMode(false),
          className: "bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors ml-2",
          children: "Close"
        })]
      })]

    }), _jsxs("div", {
      className: "flex flex-1 overflow-hidden relative",
      children: [_jsxs("div", {
        className: "w-12 bg-slate-900 border-r border-slate-700 flex flex-col items-center py-2 gap-2 z-10 shrink-0",
        children: [_jsx("button", {
          "data-testid": "drawbtn-ortho",
          className: `w-8 h-8 rounded flex items-center justify-center ${localOrthoMode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`,
          onClick: () => setLocalOrthoMode(!localOrthoMode),
          title: "Toggle Ortho/Perspective",
          children: _jsx("span", {
            className: "font-bold text-xs uppercase",
            children: localOrthoMode ? 'ORT' : 'PER'
          })
        }), _jsx("div", {
          className: "w-6 h-px bg-slate-700 my-1"
        }), _jsx("button", {
          "data-testid": "drawbtn-view",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'VIEW' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'VIEW'
          }),
          title: "Select (Orbit)",
          children: _jsxs("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            children: [_jsx("path", {
              d: "M12 19l-7-7 7-7"
            }), _jsx("path", {
              d: "M19 12H5"
            })]
          })
        }), _jsx("button", {
          "data-testid": "drawbtn-pan",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'PAN' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'PAN'
          }),
          title: "Pan",
          children: _jsxs("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            children: [_jsx("path", {
              d: "M18.44 2.05L21.95 5.56L18.44 9.07"
            }), _jsx("path", {
              d: "M5.56 21.95L2.05 18.44L5.56 14.93"
            }), _jsx("path", {
              d: "M2.05 18.44L21.95 5.56"
            })]
          })
        }), _jsx("button", {
          "data-testid": "drawbtn-orbit",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'ORBIT' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'ORBIT'
          }),
          title: "Orbit",
          children: _jsxs("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            children: [_jsx("path", {
              d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
            }), _jsx("path", {
              d: "M3 3v5h5"
            })]
          })
        }), _jsx("div", {
          className: "w-6 h-px bg-slate-700 my-1"
        }), _jsx("button", {
          "data-testid": "drawbtn-pipe",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'DRAW_PIPE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'DRAW_PIPE'
          }),
          title: "Draw Pipe",
          children: _jsx("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            children: _jsx("line", {
              x1: "2",
              y1: "22",
              x2: "22",
              y2: "2"
            })
          })
        }), _jsx("button", {
          "data-testid": "drawbtn-bend",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'DRAW_BEND' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'DRAW_BEND'
          }),
          title: "Draw Bend",
          children: _jsx("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            children: _jsx("path", {
              d: "M5 22h14a2 2 0 0 0 2-2V6l-3-4H6L3 6v14a2 2 0 0 0 2 2z"
            })
          })
        }), _jsx("button", {
          "data-testid": "drawbtn-tee",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'DRAW_TEE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'DRAW_TEE'
          }),
          title: "Draw Tee",
          children: _jsx("span", {
            className: "font-bold text-xs uppercase text-center w-full block",
            children: "T"
          })
        }), _jsx("div", {
          className: "w-6 h-px bg-slate-700 my-1"
        }), _jsx("button", {
          "data-testid": "drawbtn-convert-bend",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'CONVERT_BEND' ? 'bg-purple-600 text-white' : 'text-purple-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'CONVERT_BEND'
          }),
          title: "Convert intersection to Bend (Select 2 pipes)",
          children: _jsx("span", {
            className: "font-bold text-[10px] uppercase text-center w-full block",
            children: "CB"
          })
        }), _jsx("button", {
          "data-testid": "drawbtn-convert-tee",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'CONVERT_TEE' ? 'bg-purple-600 text-white' : 'text-purple-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'CONVERT_TEE'
          }),
          title: "Convert intersection to Tee (Select 3 pipes)",
          children: _jsx("span", {
            className: "font-bold text-[10px] uppercase text-center w-full block",
            children: "CT"
          })
        }), _jsx("button", {
          "data-testid": "drawbtn-auto-fittings",
          className: `w-8 h-8 rounded flex items-center justify-center text-purple-400 hover:bg-slate-700 hover:text-white`,
          onClick: () => {
            import('../../engine/OverlapSolver.js').then(({
              autoFittingSolver
            }) => {
              const {
                updatedTable
              } = autoFittingSolver(drawnPipes);
              dcDispatch({
                type: 'SET_ALL_COMPONENTS',
                payload: updatedTable
              });
            });
          },
          title: "Auto-Insert Fittings (Bends, Tees, Reducers)",
          children: _jsxs("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            children: [_jsx("path", {
              d: "m18 16 4-4-4-4"
            }), _jsx("path", {
              d: "m6 8-4 4 4 4"
            }), _jsx("path", {
              d: "m14.5 4-5 16"
            })]
          })
        }), _jsx("div", {
          className: "w-6 h-px bg-slate-700 my-1"
        }), _jsx("button", {
          "data-testid": "drawbtn-flange",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'FLANGE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'FLANGE'
          }),
          title: "Flange",
          children: _jsxs("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            children: [_jsx("circle", {
              cx: "12",
              cy: "12",
              r: "10"
            }), _jsx("circle", {
              cx: "12",
              cy: "12",
              r: "4"
            })]
          })
        }), _jsx("button", {
          "data-testid": "drawbtn-valve",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'VALVE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'VALVE'
          }),
          title: "Valve",
          children: _jsxs("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            children: [_jsx("polygon", {
              points: "3 3 21 21 21 3 3 21"
            }), _jsx("line", {
              x1: "12",
              y1: "3",
              x2: "12",
              y2: "21"
            })]
          })
        }), _jsx("button", {
          "data-testid": "drawbtn-reducer",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'REDUCER' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'REDUCER'
          }),
          title: "Reducer",
          children: _jsx("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            children: _jsx("polygon", {
              points: "3 4 21 8 21 16 3 20 3 4"
            })
          })
        }), _jsx("button", {
          "data-testid": "drawbtn-support",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'SUPPORT' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'SUPPORT'
          }),
          title: "Support",
          children: _jsxs("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            children: [_jsx("path", {
              d: "M12 22V12"
            }), _jsx("path", {
              d: "m5 12 7-7 7 7"
            })]
          })
        }), _jsx("div", {
          className: "w-6 h-px bg-slate-700 my-1"
        }), _jsx("button", {
          "data-testid": "drawbtn-connect",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'CONNECT' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'CONNECT'
          }),
          title: "Connect Elements",
          children: _jsxs("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            children: [_jsx("path", {
              d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
            }), _jsx("path", {
              d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
            })]
          })
        }), _jsx("button", {
          "data-testid": "drawbtn-stretch",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'STRETCH' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'STRETCH'
          }),
          title: "Stretch Element",
          children: _jsxs("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            children: [_jsx("polyline", {
              points: "15 3 21 3 21 9"
            }), _jsx("polyline", {
              points: "9 21 3 21 3 15"
            }), _jsx("line", {
              x1: "21",
              x2: "14",
              y1: "3",
              y2: "10"
            }), _jsx("line", {
              x1: "3",
              x2: "10",
              y1: "21",
              y2: "14"
            })]
          })
        }), _jsx("button", {
          "data-testid": "drawbtn-break",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'BREAK' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'BREAK'
          }),
          title: "Break Element",
          children: _jsxs("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            children: [_jsx("circle", {
              cx: "6",
              cy: "6",
              r: "3"
            }), _jsx("path", {
              d: "M8.12 8.12 12 12"
            }), _jsx("path", {
              d: "M20 4 8.12 15.88"
            }), _jsx("circle", {
              cx: "6",
              cy: "18",
              r: "3"
            }), _jsx("path", {
              d: "M14.8 14.8 20 20"
            })]
          })
        }), _jsx("button", {
          "data-testid": "drawbtn-measure",
          className: `w-8 h-8 rounded flex items-center justify-center ${activeTool === 'MEASURE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`,
          onClick: () => dcDispatch({
            type: 'SET_TOOL',
            payload: 'MEASURE'
          }),
          title: "Measure Distance",
          children: _jsxs("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            children: [_jsx("rect", {
              width: "20",
              height: "8",
              x: "2",
              y: "8",
              rx: "2",
              ry: "2"
            }), _jsx("path", {
              d: "M6 8v4"
            }), _jsx("path", {
              d: "M10 8v4"
            }), _jsx("path", {
              d: "M14 8v4"
            }), _jsx("path", {
              d: "M18 8v4"
            })]
          })
        }), _jsx("div", {
          className: "w-6 h-px bg-slate-700 my-1"
        }), _jsx("button", {
          className: `w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white`,
          onClick: () => dcDispatch({
            type: 'UNDO'
          }),
          title: "Undo Last Element",
          children: _jsxs("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            children: [_jsx("path", {
              d: "M3 7v6h6"
            }), _jsx("path", {
              d: "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"
            })]
          })
        }), _jsx("button", {
          className: `w-8 h-8 rounded flex items-center justify-center ${state.multiSelectedIndices.length > 0 || selectedIndex !== null ? 'text-red-400 hover:bg-red-900/50' : 'text-slate-600 cursor-not-allowed'}`,
          disabled: state.multiSelectedIndices.length === 0 && selectedIndex === null,
          onClick: () => dcDispatch({
            type: 'DELETE_SELECTED'
          }),
          title: "Delete Selected Element(s)",
          children: _jsxs("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            children: [_jsx("path", {
              d: "M3 6h18"
            }), _jsx("path", {
              d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
            }), _jsx("line", {
              x1: "10",
              y1: "11",
              x2: "10",
              y2: "17"
            }), _jsx("line", {
              x1: "14",
              y1: "11",
              x2: "14",
              y2: "17"
            })]
          })
        }), _jsx("button", {
          className: `w-8 h-8 rounded flex items-center justify-center ${state.multiSelectedIndices.length > 0 || selectedIndex !== null ? 'text-slate-400 hover:bg-slate-700 hover:text-white' : 'text-slate-600 cursor-not-allowed'}`,
          disabled: state.multiSelectedIndices.length === 0 && selectedIndex === null,
          onClick: () => dcDispatch({
            type: 'HIDE_SELECTED'
          }),
          title: "Hide Selected Element(s)",
          children: _jsxs("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            children: [_jsx("path", {
              d: "M9.88 9.88a3 3 0 1 0 4.24 4.24"
            }), _jsx("path", {
              d: "M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"
            }), _jsx("path", {
              d: "M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"
            }), _jsx("line", {
              x1: "2",
              x2: "22",
              y1: "2",
              y2: "22"
            })]
          })
        }), _jsx("button", {
          className: `w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white`,
          onClick: () => dcDispatch({
            type: 'UNHIDE_ALL'
          }),
          title: "Unhide All",
          children: _jsxs("svg", {
            className: "w-4 h-4",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            children: [_jsx("path", {
              d: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"
            }), _jsx("circle", {
              cx: "12",
              cy: "12",
              r: "3"
            })]
          })
        })]
      }), _jsxs("div", {
        className: "flex-1 relative bg-slate-950",
        children: [_jsxs(Canvas, {
          dpr: appSettings.limitPixelRatio ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio,
          gl: {
            antialias: !appSettings.disableAA
          },
          children: [localOrthoMode ? _jsx(OrthographicCamera, {
            makeDefault: true,
            position: [5000, 5000, 5000],
            zoom: 0.2,
            near: 0.1,
            far: 500000
          }) : _jsx(PerspectiveCamera, {
            makeDefault: true,
            position: [5000, 5000, 5000],
            fov: appSettings.cameraFov,
            near: appSettings.cameraNear || 1,
            far: appSettings.cameraFar || 500000
          }), _jsx(DrawCanvas_DrawCanvasControls, {
            orthoMode: localOrthoMode,
            drawnPipes
          }), _jsx("color", {
            attach: "background",
            args: [appSettings.backgroundColor || '#0d1117']
          }), _jsx("ambientLight", {
            intensity: 0.6
          }), _jsx("directionalLight", {
            position: [1000, 1000, 500],
            intensity: 1.5
          }), _jsx("gridHelper", {
            args: [100000, Math.round(100000 / gridConfig.density), new THREE.Color('#3a4255').multiplyScalar(gridConfig.opacity * 2), new THREE.Color('#252a3a').multiplyScalar(gridConfig.opacity * 2)],
            position: [0, -1, 0]
          }), _jsx("axesHelper", {
            args: [axesSize]
          }), _jsx(DrawCanvas_DrawnComponents, {
            pipes: drawnPipes,
            appSettings: appSettings,
            selectedIndices: state.multiSelectedIndices.length > 0 ? state.multiSelectedIndices : selectedIndex !== null ? [selectedIndex] : [],
            hiddenIndices: state.hiddenIndices,
            dcDispatch: dcDispatch,
            activeTool: activeTool
          }), _jsx(DrawCanvas_DrawTool, {
            activeTool: activeTool,
            drawnPipes: drawnPipes,
            dcDispatch: dcDispatch,
            gridConfig: gridConfig,
            onCursorMove: setCursorWorldPos
          }), _jsx(DrawCanvas_MeasureTool, {
            activeTool: activeTool,
            appSettings: appSettings
          }), _jsx(DrawCanvas_BreakPipeLayer, {
            activeTool: activeTool,
            drawnPipes: drawnPipes,
            dcDispatch: dcDispatch,
            appSettings: appSettings
          }), _jsx(DrawCanvas_EndpointSnapLayer, {
            activeTool: activeTool,
            drawnPipes: drawnPipes,
            dcDispatch: dcDispatch,
            appSettings: appSettings
          }), _jsx(DrawCanvas_ConversionTools, {
            activeTool: activeTool,
            drawnPipes: drawnPipes,
            dcDispatch: dcDispatch,
            appSettings: appSettings
          }), _jsx(OrbitControls, {
            enabled: controlsEnabled,
            makeDefault: true,
            enableDamping: true,
            dampingFactor: 0.1,
            mouseButtons: mouseButtons
          }), _jsx(ViewCube, {
            customEventName: "draw-canvas-set-view"
          }), _jsx(GizmoHelper, {
            alignment: "bottom-right",
            margin: [60, 60],
            children: _jsx(GizmoViewport, {
              axisColors: ['#ef4444', '#10b981', '#3b82f6'],
              labelColor: "white"
            })
          })]
          })]
        }), _jsxs("div", {
          className: "absolute bottom-0 left-0 right-0 h-8 bg-slate-900 border-t border-slate-700 flex items-center px-4 text-xs text-slate-400 justify-between",
          children: [_jsxs("div", {
            className: "flex gap-4",
            children: [_jsxs("span", {
              children: ["Tool: ", _jsx("strong", {
                children: activeTool.replace('_', ' ')
              })]
            }), _jsx("span", {
              children: "Snap: Grid+Endpoint"
            })]
          }), _jsxs("div", {
            className: "flex gap-4",
            children: [_jsxs("span", {
              children: ["X: ", cursorWorldPos.x.toFixed(1), " Y: ", cursorWorldPos.y.toFixed(1), " Z: ", cursorWorldPos.z.toFixed(1)]
            }), _jsxs("span", {
              children: ["Components: ", drawnPipes.length]
            })]
          })]
        }), _jsx(NavigationPanel, {
          customEventName: "draw-canvas-set-view",
          interactionMode: activeTool === 'PAN' ? 'PAN' : 'ROTATE',
          onInteractionModeChange: mode => dcDispatch({
            type: 'SET_TOOL',
            payload: mode === 'PAN' ? 'PAN' : 'ORBIT'
          }),
          className: "right-32"
        })]
      }), isPanelOpen && (() => {
        function getPanelMode() {
          if (activeTool && ['BREAK', 'MEASURE', 'CONNECT', 'STRETCH'].includes(activeTool)) return 'READ_ONLY';
          if (state.multiSelectedIndices?.length > 1) return 'MULTI_RESTRICTED';
          if (selectedIndex === null) return 'HIDDEN';
          return 'SINGLE_EDIT';
        }
        const panelMode = getPanelMode();
        return _jsxs("div", {
          className: "w-[300px] bg-slate-900 border-l border-slate-700 flex flex-col z-10 shrink-0",
          children: [_jsxs("div", {
            className: "flex justify-between items-center p-3 border-b border-slate-700 bg-slate-800",
            children: [_jsx("span", {
              className: "font-bold text-xs text-slate-200",
              children: "PROPERTIES"
            }), _jsx("button", {
              onClick: () => setIsPanelOpen(false),
              className: "text-slate-400 hover:text-white",
              children: "\u2715"
            })]
          }), _jsxs("div", {
            className: "p-4 flex flex-col gap-4 overflow-y-auto",
            children: [panelMode === 'HIDDEN' && _jsx("div", {
              className: "text-slate-400 text-sm italic text-center",
              children: "Select a single component to edit properties."
            }), panelMode === 'MULTI_RESTRICTED' && _jsx("div", {
              className: "text-purple-400 text-sm font-bold text-center bg-purple-900/30 p-2 rounded border border-purple-800/50",
              children: "Multiple items selected. Bulk edit not supported in Draw Canvas."
            }), panelMode === 'READ_ONLY' && selectedIndex !== null && _jsxs("div", {
              className: "text-amber-400 text-sm italic text-center mb-2",
              children: ["Properties are read-only while using destructive tools (", activeTool, ")."]
            }), (panelMode === 'SINGLE_EDIT' || panelMode === 'READ_ONLY' && selectedIndex !== null) && _jsxs(_Fragment, {
              children: [_jsxs("div", {
                className: "flex flex-col gap-1",
                children: [_jsx("label", {
                  className: "text-xs text-slate-500 uppercase",
                  children: "Length (mm)"
                }), _jsx("input", {
                  type: "text",
                  className: "bg-slate-950 border border-slate-700 rounded p-1 text-sm text-slate-200 outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed",
                  value: drawnPipes[selectedIndex].ep1 && drawnPipes[selectedIndex].ep2 ? new THREE.Vector3(drawnPipes[selectedIndex].ep1.x, drawnPipes[selectedIndex].ep1.y, drawnPipes[selectedIndex].ep1.z).distanceTo(new THREE.Vector3(drawnPipes[selectedIndex].ep2.x, drawnPipes[selectedIndex].ep2.y, drawnPipes[selectedIndex].ep2.z)).toFixed(1) : '-',
                  disabled: panelMode === 'READ_ONLY',
                  onChange: e => {
                    const raw = String(e.target.value).trim();
                    const newLen = Number(raw);
                    if (!Number.isFinite(newLen) || newLen <= 0) return;
                    const p = drawnPipes[selectedIndex];
                    const p1 = new THREE.Vector3(p.ep1.x, p.ep1.y, p.ep1.z);
                    const p2 = new THREE.Vector3(p.ep2.x, p.ep2.y, p.ep2.z);
                    const dir = p2.clone().sub(p1).normalize();
                    const newP2 = p1.clone().add(dir.multiplyScalar(newLen));
                    dcDispatch({
                      type: 'UPDATE_COMPONENT',
                      payload: {
                        index: selectedIndex,
                        component: {
                          ...p,
                          ep2: {
                            x: newP2.x,
                            y: newP2.y,
                            z: newP2.z
                          }
                        }
                      }
                    });
                  }
                })]
              }), _jsxs("div", {
                className: "flex flex-col gap-1",
                children: [_jsx("label", {
                  className: "text-xs text-slate-500 uppercase",
                  children: "Bore (mm)"
                }), _jsx("input", {
                  type: "text",
                  className: "bg-slate-950 border border-slate-700 rounded p-1 text-sm text-slate-200 outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed",
                  value: drawnPipes[selectedIndex].bore || '-',
                  disabled: panelMode === 'READ_ONLY',
                  onChange: e => {
                    const raw = String(e.target.value).trim();
                    const newBore = Number(raw);
                    if (!Number.isFinite(newBore) || newBore <= 0) return;
                    dcDispatch({
                      type: 'UPDATE_COMPONENT',
                      payload: {
                        index: selectedIndex,
                        component: {
                          ...drawnPipes[selectedIndex],
                          bore: newBore
                        }
                      }
                    });
                  }
                })]
              }), _jsxs("div", {
                className: "flex flex-col gap-1",
                children: [_jsx("label", {
                  className: "text-xs text-slate-500 uppercase",
                  children: "Schedule"
                }), _jsx("input", {
                  disabled: panelMode === 'READ_ONLY',
                  type: "text",
                  className: "bg-slate-950 border border-slate-700 rounded p-1 text-sm text-slate-200 outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed",
                  value: "-",
                  onChange: () => {}
                })]
              })]
            })]
          })]
        });
      })(), !isPanelOpen && _jsx("button", {
        onClick: () => setIsPanelOpen(true),
        className: "absolute top-14 right-3 bg-slate-800 text-slate-300 border border-slate-700 px-2 py-1 rounded z-20 hover:text-white hover:bg-slate-700 text-[11px] font-semibold",
        children: "Open Properties"
      }), showGridSettings && _jsxs("div", {
      className: "w-[330px] flex-shrink-0 bg-slate-800 border-l border-slate-700 flex flex-col z-10",
      children: [_jsxs("div", {
        className: "flex justify-between items-center mb-3 border-b border-slate-700 pb-2",
        children: [_jsx("h3", {
          className: "text-sm font-bold text-slate-200",
          children: "Draw Settings"
        }), _jsx("button", {
          onClick: () => setShowGridSettings(false),
          className: "text-slate-400 hover:text-white",
          children: "\u2715"
        })]
      }), _jsxs("div", {
        className: "flex flex-col gap-4",
        children: [_jsxs("label", {
          className: "flex justify-between items-center cursor-pointer group",
          children: [_jsxs("div", {
            children: [_jsx("div", {
              className: "text-xs font-medium text-slate-200",
              children: "Auto Bend"
            }), _jsx("div", {
              className: "text-[10px] text-slate-400",
              children: "Insert bend on dir change"
            })]
          }), _jsxs("div", {
            className: "relative",
            children: [_jsx("input", {
              type: "checkbox",
              className: "sr-only",
              checked: appSettings.autoBendEnabled,
              onChange: e => useStore.getState().updateAppSettings({
                autoBendEnabled: e.target.checked
              })
            }), _jsx("div", {
              className: `block w-8 h-5 rounded-full transition-colors ${appSettings.autoBendEnabled ? 'bg-blue-600' : 'bg-slate-700'}`
            }), _jsx("div", {
              className: `dot absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform ${appSettings.autoBendEnabled ? 'translate-x-3' : ''}`
          })]
        }), _jsxs("div", {
          className: "border-t border-slate-700 pt-2",
          children: [_jsx("h4", {
            className: "text-xs font-bold text-slate-400 mb-2",
            children: "Grid"
          }), _jsxs("div", {
            className: "flex flex-col gap-2",
            children: [_jsxs("div", {
              className: "flex flex-col gap-1",
              children: [_jsx("label", {
                className: "text-xs text-slate-400",
                children: "Grid Density"
              }), _jsx("input", {
                type: "range",
                min: "10",
                max: "1000",
                step: "10",
                value: gridConfig.density,
                onChange: e => setGridConfig({
                  ...gridConfig,
                  density: parseInt(e.target.value)
                }),
                className: "w-full accent-blue-500"
              }), _jsxs("div", {
                className: "text-right text-[10px] text-slate-500",
                children: [gridConfig.density, "mm"]
              })]
            }), _jsxs("div", {
              className: "flex flex-col gap-1",
              children: [_jsx("label", {
                className: "text-xs text-slate-400",
                children: "Grid Opacity"
              }), _jsx("input", {
                type: "range",
                min: "0",
                max: "1",
                step: "0.1",
                value: gridConfig.opacity,
                onChange: e => setGridConfig({
                  ...gridConfig,
                  opacity: parseFloat(e.target.value)
                }),
                className: "w-full accent-blue-500"
              }), _jsx("div", {
                className: "text-right text-[10px] text-slate-500",
                children: gridConfig.opacity
              })]
            }), _jsxs("div", {
              className: "flex flex-col gap-1",
              children: [_jsx("label", {
                className: "text-xs text-slate-400",
                children: "Snap Resolution"
              }), _jsxs("select", {
                value: gridConfig.snapResolution,
                onChange: e => setGridConfig({
                  ...gridConfig,
                  snapResolution: parseInt(e.target.value)
                }),
                className: "bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded p-1",
                children: [_jsx("option", {
                  value: "1",
                  children: "1 mm"
                }), _jsx("option", {
                  value: "10",
                  children: "10 mm"
                }), _jsx("option", {
                  value: "50",
                  children: "50 mm"
                }), _jsx("option", {
                  value: "100",
                  children: "100 mm"
                }), _jsx("option", {
                  value: "500",
                  children: "500 mm"
                }), _jsx("option", {
                  value: "1000",
                  children: "1000 mm"
                })]
              })]
            })]
          })]
        })]
      })]      })]
    }), isListOpen && _jsxs("div", {
      className: "h-[150px] bg-slate-900 border-t border-slate-700 flex flex-col z-10 shrink-0 relative",
      children: [_jsxs("div", {
        className: "flex justify-between items-center px-4 py-1 bg-slate-800 border-b border-slate-700",
        children: [_jsx("span", {
          className: "font-bold text-xs text-slate-200",
          children: "COMPONENT LIST"
        }), _jsx("button", {
          onClick: () => setIsListOpen(false),
          className: "text-slate-400 hover:text-white text-xs",
          children: "\u25BC Hide"
        })]
      }), _jsx("div", {
        className: "flex-1 overflow-auto bg-slate-950 p-2",
        children: _jsxs("table", {
          className: "w-full text-left text-xs text-slate-400 border-collapse",
          children: [_jsx("thead", {
            children: _jsxs("tr", {
              className: "border-b border-slate-800",
              children: [_jsx("th", {
                className: "py-1 px-2 font-medium",
                children: "#"
              }), _jsx("th", {
                className: "py-1 px-2 font-medium",
                children: "Type"
              }), _jsx("th", {
                className: "py-1 px-2 font-medium",
                children: "Length"
              }), _jsx("th", {
                className: "py-1 px-2 font-medium",
                children: "Bore"
              }), _jsx("th", {
                className: "py-1 px-2 font-medium",
                children: "EP1"
              }), _jsx("th", {
                className: "py-1 px-2 font-medium",
                children: "EP2"
              })]
            })
          }), _jsx("tbody", {
            children: drawnPipes.length === 0 ? _jsx("tr", {
              children: _jsx("td", {
                colSpan: "6",
                className: "py-4 text-center text-slate-600 italic",
                children: "No components drawn yet."
              })
            }) : drawnPipes.map((p, i) => _jsxs("tr", {
              className: `border-b border-slate-800 cursor-pointer ${selectedIndex === i ? 'bg-blue-900/30' : 'hover:bg-slate-900'}`,
              onClick: () => dcDispatch({
                type: 'SELECT',
                payload: i
              }),
              children: [_jsx("td", {
                className: "py-1 px-2",
                children: i + 1
              }), _jsx("td", {
                className: "py-1 px-2 text-blue-400 font-bold",
                children: p.type
              }), _jsx("td", {
                className: "py-1 px-2",
                children: p.type === 'PIPE' ? _jsx("input", {
                  type: "number",
                  value: new THREE.Vector3(p.ep1.x, p.ep1.y, p.ep1.z).distanceTo(new THREE.Vector3(p.ep2.x, p.ep2.y, p.ep2.z)).toFixed(1),
                  onChange: e => {
                    const newLen = parseFloat(e.target.value) || 0;
                    const p1 = new THREE.Vector3(p.ep1.x, p.ep1.y, p.ep1.z);
                    const p2 = new THREE.Vector3(p.ep2.x, p.ep2.y, p.ep2.z);
                    const dir = p2.clone().sub(p1).normalize();
                    const newP2 = p1.clone().add(dir.multiplyScalar(newLen));
                    dcDispatch({
                      type: 'UPDATE_COMPONENT',
                      payload: {
                        index: i,
                        component: {
                          ...p,
                          ep2: {
                            x: newP2.x,
                            y: newP2.y,
                            z: newP2.z
                          }
                        }
                      }
                    });
                  },
                  className: "w-24 bg-slate-950 border border-slate-700 px-1 py-0.5 rounded text-slate-300 outline-none focus:border-blue-500"
                }) : '-'
              }), _jsx("td", {
                className: "py-1 px-2",
                children: _jsx("input", {
                  type: "number",
                  value: p.bore,
                  onChange: e => {
                    const newVal = parseFloat(e.target.value) || 0;
                    dcDispatch({
                      type: 'UPDATE_COMPONENT',
                      payload: {
                        index: i,
                        component: {
                          ...p,
                          bore: newVal
                        }
                      }
                    });
                  },
                  className: "w-16 bg-slate-950 border border-slate-700 px-1 py-0.5 rounded text-slate-300 outline-none focus:border-blue-500"
                })
              }), _jsx("td", {
                className: "py-1 px-2",
                children: _jsx("input", {
                  type: "text",
                  value: `${p.ep1.x.toFixed(0)}, ${p.ep1.y.toFixed(0)}, ${p.ep1.z.toFixed(0)}`,
                  onChange: e => {
                    const parts = e.target.value.split(',').map(n => parseFloat(n.trim()));
                    if (parts.length === 3 && parts.every(n => !isNaN(n))) {
                      dcDispatch({
                        type: 'UPDATE_COMPONENT',
                        payload: {
                          index: i,
                          component: {
                            ...p,
                            ep1: {
                              x: parts[0],
                              y: parts[1],
                              z: parts[2]
                            }
                          }
                        }
                      });
                    }
                  },
                  className: "w-32 bg-slate-950 border border-slate-700 px-1 py-0.5 rounded text-slate-300 outline-none focus:border-blue-500"
                })
              }), _jsx("td", {
                className: "py-1 px-2",
                children: _jsx("input", {
                  type: "text",
                  value: `${p.ep2.x.toFixed(0)}, ${p.ep2.y.toFixed(0)}, ${p.ep2.z.toFixed(0)}`,
                  onChange: e => {
                    const parts = e.target.value.split(',').map(n => parseFloat(n.trim()));
                    if (parts.length === 3 && parts.every(n => !isNaN(n))) {
                      dcDispatch({
                        type: 'UPDATE_COMPONENT',
                        payload: {
                          index: i,
                          component: {
                            ...p,
                            ep2: {
                              x: parts[0],
                              y: parts[1],
                              z: parts[2]
                            }
                          }
                        }
                      });
                    }
                  },
                  className: "w-32 bg-slate-950 border border-slate-700 px-1 py-0.5 rounded text-slate-300 outline-none focus:border-blue-500"
                })
              })]
            }, i))
          })]
        })
      })]
    }), !isListOpen && _jsx("button", {
      onClick: () => setIsListOpen(true),
      className: "absolute bottom-0 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-400 border border-b-0 border-slate-700 px-4 py-1 rounded-t z-20 hover:text-white hover:bg-slate-700 text-xs font-bold shadow-lg",
      children: "\u25B2 SHOW COMPONENT LIST"
    })]
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsInVzZVN0YXRlIiwidXNlRWZmZWN0IiwidXNlUmVkdWNlciIsIkNhbnZhcyIsInVzZVRocmVlIiwidXNlU3RvcmUiLCJ1c2VBcHBDb250ZXh0IiwiZHJhd0NhbnZhc1JlZHVjZXIiLCJpbml0aWFsU3RhdGUiLCJkYmciLCJlbWl0RHJhd01ldHJpYyIsIk9yYml0Q29udHJvbHMiLCJPcnRob2dyYXBoaWNDYW1lcmEiLCJQZXJzcGVjdGl2ZUNhbWVyYSIsIkdpem1vSGVscGVyIiwiR2l6bW9WaWV3cG9ydCIsIkxpbmUiLCJUZXh0IiwiVEhSRUUiLCJWaWV3Q3ViZSIsIkRyYXdDYW52YXNfRHJhd25Db21wb25lbnRzIiwicGlwZXMiLCJhcHBTZXR0aW5ncyIsInNlbGVjdGVkSW5kaWNlcyIsImhpZGRlbkluZGljZXMiLCJkY0Rpc3BhdGNoIiwiYWN0aXZlVG9vbCIsImNvbG9ycyIsImNvbXBvbmVudENvbG9ycyIsInRvRmluaXRlUG9pbnQiLCJwIiwieCIsIk51bWJlciIsInBhcnNlRmxvYXQiLCJ5IiwieiIsImlzRmluaXRlIiwiaGFuZGxlUG9pbnRlckRvd24iLCJlIiwiaSIsInN0b3BQcm9wYWdhdGlvbiIsImlzTXVsdGlTZWxlY3QiLCJjdHJsS2V5IiwibWV0YUtleSIsInR5cGUiLCJwYXlsb2FkIiwiX2pzeCIsImNoaWxkcmVuIiwibWFwIiwicGlwZSIsImluY2x1ZGVzIiwiZXAxU2FmZSIsImVwMSIsImVwMlNhZmUiLCJlcDIiLCJWZWN0b3IzIiwiZGlzdCIsImRpc3RhbmNlVG8iLCJtaWQiLCJhZGRWZWN0b3JzIiwibXVsdGlwbHlTY2FsYXIiLCJkaXIiLCJjbG9uZSIsInN1YiIsIm5vcm1hbGl6ZSIsInF1YXQiLCJRdWF0ZXJuaW9uIiwic2V0RnJvbVVuaXRWZWN0b3JzIiwiaXNTZWxlY3RlZCIsImdldENvbCIsImRlZiIsInNlbGVjdGlvbkNvbG9yIiwib25Qb2ludGVyRG93biIsIl9qc3hzIiwicG9zaXRpb24iLCJxdWF0ZXJuaW9uIiwiYXJncyIsImJvcmUiLCJjb2xvciIsInJvdWdobmVzcyIsIm1ldGFsbmVzcyIsIk1hdGgiLCJtYXgiLCJyIiwicm90YXRpb24iLCJQSSIsIkRyYXdDYW52YXNfRHJhd1Rvb2wiLCJkcmF3blBpcGVzIiwiZ3JpZENvbmZpZyIsIm9uQ3Vyc29yTW92ZSIsInN0YXJ0UHQiLCJzZXRTdGFydFB0IiwiY3VyclB0Iiwic2V0Q3VyclB0Iiwic25hcFJlc29sdXRpb24iLCJkZWZhdWx0Qm9yZSIsImhhbmRsZUtleURvd24iLCJhY3RpdmVUYWIiLCJnZXRTdGF0ZSIsImtleSIsImRvY3VtZW50IiwiYWN0aXZlRWxlbWVudCIsInRhZ05hbWUiLCJldmVudCIsImhhZFN0YXJ0UHQiLCJ0b29sIiwicGhhc2UiLCJyZXN1bHQiLCJ3aW5kb3ciLCJhZGRFdmVudExpc3RlbmVyIiwicmVtb3ZlRXZlbnRMaXN0ZW5lciIsInQwIiwicGVyZm9ybWFuY2UiLCJub3ciLCJuZWFyZXN0U25hcCIsIm1pbkRpc3QiLCJmb3JFYWNoIiwicHQiLCJwb2ludCIsInNuYXBwZWRQdCIsInJvdW5kIiwidGFyZ2V0UGlwZSIsImNsaWNrRGlzdCIsIkluZmluaXR5IiwidG9VcHBlckNhc2UiLCJ2MSIsInYyIiwibGluZSIsIkxpbmUzIiwiY2xvc2VzdCIsImNsb3Nlc3RQb2ludFRvUG9pbnQiLCJkIiwiX2luZGV4Iiwic3VwcG9ydFJvdyIsImluc2VydFN1cHBvcnRBdFBpcGUiLCJfcm93SW5kZXgiLCJuZXdQaXBlcyIsInNwbGljZSIsImxhdGVuY3lNcyIsImFsZXJ0IiwiaXNFcDEiLCJ0eXBlTWFwIiwibGVuIiwicHJldk1hdGNoZXMiLCJmaWx0ZXIiLCJsZW5ndGgiLCJsYXN0IiwiaW5oZXJpdGVkQm9yZSIsInNrZXkiLCJwMSIsInAyIiwiYWRkIiwicGlwZWxpbmVSZWYiLCJjYTEiLCJjYTIiLCJjYTMiLCJjYTQiLCJjYTUiLCJjYTYiLCJjYTciLCJjYTgiLCJjYTkiLCJjYTEwIiwiYWN0dWFsU3RhcnQiLCJkZWZhdWx0QmVuZFJhZGl1cyIsIm5ld0NvbXBvbmVudHMiLCJsYXN0Q29tcG9uZW50IiwibEEiLCJsQiIsImRpcjEiLCJkaXIyIiwiYWJzIiwiZG90IiwiYXV0b0JlbmRFbmFibGVkIiwidHJpbURpc3QiLCJuZXdMYXN0RXAyIiwidXBkYXRlZFBpcGVzIiwiYmVuZEVwMSIsImJlbmRFcDIiLCJwdXNoIiwiYyIsImVyciIsImVycm9yIiwibWVzc2FnZSIsImVycm9yQ2xhc3MiLCJob3ZlclNuYXAiLCJzZXRIb3ZlclNuYXAiLCJoYW5kbGVQb2ludGVyTW92ZSIsImR4IiwiZHoiLCJoYW5kbGVDb250ZXh0TWVudSIsInByZXZlbnREZWZhdWx0Iiwib25Qb2ludGVyTW92ZSIsIm9uQ29udGV4dE1lbnUiLCJyZW5kZXJPcmRlciIsInZpc2libGUiLCJ0cmFuc3BhcmVudCIsIm9wYWNpdHkiLCJkZXB0aFRlc3QiLCJwb2ludHMiLCJsaW5lV2lkdGgiLCJkYXNoZWQiLCJmb250U2l6ZSIsIm91dGxpbmVXaWR0aCIsIm91dGxpbmVDb2xvciIsInRvRml4ZWQiLCJicmVha1BpcGVBdFBvaW50IiwiZml4Nm1tR2FwcyIsImF1dG9Bc3NpZ25QaXBlbGluZVJlZnMiLCJqc3giLCJqc3hzIiwiRnJhZ21lbnQiLCJfRnJhZ21lbnQiLCJEcmF3Q2FudmFzX01lYXN1cmVUb29sIiwibWVhc3VyZVB0cyIsInNldE1lYXN1cmVQdHMiLCJwcmV2IiwiZGVwdGhXcml0ZSIsImxlcnAiLCJkeSIsInNpZGUiLCJEb3VibGVTaWRlIiwiYW5jaG9yWCIsImFuY2hvclkiLCJEcmF3Q2FudmFzX0JyZWFrUGlwZUxheWVyIiwiaG92ZXJQb3MiLCJzZXRIb3ZlclBvcyIsImhhbmRsZVBvaW50ZXJPdXQiLCJwaXBlSW5kZXgiLCJwaXBlUm93IiwiYnJlYWtQdCIsImJyZWFrUmVzdWx0cyIsInJvd0EiLCJyb3dCIiwib25Qb2ludGVyT3V0IiwiRHJhd0NhbnZhc19Db252ZXJzaW9uVG9vbHMiLCJzZXRTZWxlY3RlZEluZGljZXMiLCJpbmRleCIsIm5ld1NlbCIsInB0cyIsImNwIiwiZDEiLCJkMiIsImoiLCJuZXdCZW5kIiwibnAxIiwibnAyIiwiZmxhdE1hcCIsIm1hdGNoZXMiLCJtYWluMSIsIm1haW4yIiwiYnJhbmNoIiwiZGlycyIsImlkeCIsImJyYW5jaElkeCIsImZpbmQiLCJydW5UcmltIiwiYnJhbmNoVHJpbSIsInRFcDEiLCJ0RXAyIiwidEJwIiwibmV3VGVlIiwiYnJhbmNoQm9yZSIsImJwIiwicERhdGEiLCJucCIsIkRyYXdDYW52YXNfRW5kcG9pbnRTbmFwTGF5ZXIiLCJjb25uZWN0RHJhZnQiLCJzZXRDb25uZWN0RHJhZnQiLCJjdXJzb3JQb3MiLCJzZXRDdXJzb3JQb3MiLCJzbmFwUmFkaXVzIiwicmF3RGVsdGEiLCJmcm9tUG9zaXRpb24iLCJhYnNYIiwiYWJzWSIsImFic1oiLCJoYW5kbGVQb2ludGVyVXAiLCJuZWFyZXN0Iiwicm93IiwiZXBLZXkiLCJlcCIsInJvd0luZGV4IiwiZnJvbVJvd0luZGV4IiwiZnJvbUVQIiwic291cmNlUm93IiwidGFyZ2V0UG9zIiwic291cmNlUG9zIiwidXBkYXRlZFJvdyIsIm5ld0JyaWRnZVBpcGUiLCJzY2FsZSIsIm9uUG9pbnRlclVwIiwicHRJZHgiLCJzdGFydCIsImVuZCIsInZlYyIsInN1YlZlY3RvcnMiLCJxIiwiRHJhd0NhbnZhc19EcmF3Q2FudmFzQ29udHJvbHMiLCJvcnRob01vZGUiLCJjYW1lcmEiLCJnbCIsImhhbmRsZVNldFZpZXciLCJ2aWV3VHlwZSIsImRldGFpbCIsInNldCIsImxvb2tBdCIsIkRyYXdDYW52YXNUYWIiLCJzZXREcmF3TW9kZSIsImRpc3BhdGNoIiwic3RhdGUiLCJzZWxlY3RlZEluZGV4IiwiaXNQYW5lbE9wZW4iLCJzZXRJc1BhbmVsT3BlbiIsImN1cnNvcldvcmxkUG9zIiwic2V0Q3Vyc29yV29ybGRQb3MiLCJpc0xpc3RPcGVuIiwic2V0SXNMaXN0T3BlbiIsImxvY2FsT3J0aG9Nb2RlIiwic2V0TG9jYWxPcnRob01vZGUiLCJzaG93R3JpZFNldHRpbmdzIiwic2V0U2hvd0dyaWRTZXR0aW5ncyIsInNldEdyaWRDb25maWciLCJkZW5zaXR5IiwiaW50ZXJhY3Rpb25Nb2RlIiwiY29udHJvbHNFbmFibGVkIiwibW91c2VCdXR0b25zIiwiTEVGVCIsIk1PVVNFIiwiUEFOIiwiUk9UQVRFIiwiTUlERExFIiwiRE9MTFkiLCJSSUdIVCIsImNsYXNzTmFtZSIsIm9uQ2xpY2siLCJkYXRhIiwiZGF0YVRhYmxlIiwiY29uZmlybSIsInBheWxvYWREYXRhIiwiSlNPTiIsInBhcnNlIiwic3RyaW5naWZ5Iiwicm93VWlkIiwiRGF0ZSIsInNvdXJjZURvbWFpbiIsInVwZGF0ZWRUYWJsZSIsImZpeExvZyIsImxvZyIsInRpdGxlIiwidGhlbiIsInJlc29sdmVPdmVybGFwcyIsInB1c2hIaXN0b3J5IiwibmV3VGFibGUiLCJsYXN0TXV0YXRpb25BdCIsImF1dG9UYWJsZSIsInNldERhdGFUYWJsZSIsInN0YWdlIiwiY29tcG9uZW50cyIsIndpZHRoIiwiaGVpZ2h0Iiwidmlld0JveCIsImZpbGwiLCJzdHJva2UiLCJzdHJva2VXaWR0aCIsInN0cm9rZUxpbmVjYXAiLCJzdHJva2VMaW5lam9pbiIsImN4IiwiY3kiLCJjaGVja2VkIiwib25DaGFuZ2UiLCJ1cGRhdGVBcHBTZXR0aW5ncyIsInRhcmdldCIsIm1pbiIsInN0ZXAiLCJ2YWx1ZSIsInBhcnNlSW50IiwieDEiLCJ5MSIsIngyIiwieTIiLCJhdXRvRml0dGluZ1NvbHZlciIsInJ4IiwicnkiLCJtdWx0aVNlbGVjdGVkSW5kaWNlcyIsImRpc2FibGVkIiwiZHByIiwibGltaXRQaXhlbFJhdGlvIiwiZGV2aWNlUGl4ZWxSYXRpbyIsImFudGlhbGlhcyIsImRpc2FibGVBQSIsIm1ha2VEZWZhdWx0Iiwiem9vbSIsIm5lYXIiLCJmYXIiLCJmb3YiLCJjYW1lcmFGb3YiLCJjYW1lcmFOZWFyIiwiY2FtZXJhRmFyIiwiYXR0YWNoIiwiYmFja2dyb3VuZENvbG9yIiwiaW50ZW5zaXR5IiwiQ29sb3IiLCJlbmFibGVkIiwiZW5hYmxlRGFtcGluZyIsImRhbXBpbmdGYWN0b3IiLCJjdXN0b21FdmVudE5hbWUiLCJhbGlnbm1lbnQiLCJtYXJnaW4iLCJheGlzQ29sb3JzIiwibGFiZWxDb2xvciIsInJlcGxhY2UiLCJnZXRQYW5lbE1vZGUiLCJwYW5lbE1vZGUiLCJyYXciLCJTdHJpbmciLCJ0cmltIiwibmV3TGVuIiwibmV3UDIiLCJjb21wb25lbnQiLCJuZXdCb3JlIiwiY29sU3BhbiIsIm5ld1ZhbCIsInBhcnRzIiwic3BsaXQiLCJuIiwiZXZlcnkiLCJpc05hTiJdLCJzb3VyY2VzIjpbIkRyYXdDYW52YXNUYWIuanN4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBSZWFjdCwgeyB1c2VTdGF0ZSwgdXNlRWZmZWN0LCB1c2VSZWR1Y2VyIH0gZnJvbSAncmVhY3QnO1xuaW1wb3J0IHsgQ2FudmFzLCB1c2VUaHJlZSB9IGZyb20gJ0ByZWFjdC10aHJlZS9maWJlcic7XG5pbXBvcnQgeyB1c2VTdG9yZSB9IGZyb20gJy4uLy4uL3N0b3JlL3VzZVN0b3JlJztcbmltcG9ydCB7IHVzZUFwcENvbnRleHQgfSBmcm9tICcuLi8uLi9zdG9yZS9BcHBDb250ZXh0JztcbmltcG9ydCB7IGRyYXdDYW52YXNSZWR1Y2VyLCBpbml0aWFsU3RhdGUgfSBmcm9tICcuLi8uLi9zdG9yZS9kcmF3Q2FudmFzUmVkdWNlcic7XG5pbXBvcnQgeyBkYmcgfSBmcm9tICcuLi8uLi91dGlscy9kZWJ1Z0dhdGUnO1xuaW1wb3J0IHsgZW1pdERyYXdNZXRyaWMgfSBmcm9tICcuLi8uLi91dGlscy9kcmF3TWV0cmljcyc7XG5pbXBvcnQgeyBPcmJpdENvbnRyb2xzLCBPcnRob2dyYXBoaWNDYW1lcmEsIFBlcnNwZWN0aXZlQ2FtZXJhLCBHaXptb0hlbHBlciwgR2l6bW9WaWV3cG9ydCwgTGluZSwgVGV4dCB9IGZyb20gJ0ByZWFjdC10aHJlZS9kcmVpJztcbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcbmltcG9ydCB7IFZpZXdDdWJlIH0gZnJvbSAnLi4vY29tcG9uZW50cy9WaWV3Q3ViZSc7XG5cbi8vIEhlbHBlciB0byBkcmF3IHRoZSBhY2N1bXVsYXRlZCB1c2VyIGdlb21ldHJ5XG5jb25zdCBEcmF3Q2FudmFzX0RyYXduQ29tcG9uZW50cyA9ICh7IHBpcGVzLCBhcHBTZXR0aW5ncywgc2VsZWN0ZWRJbmRpY2VzLCBoaWRkZW5JbmRpY2VzLCBkY0Rpc3BhdGNoLCBhY3RpdmVUb29sIH0pID0+IHtcbiAgICBjb25zdCBjb2xvcnMgPSBhcHBTZXR0aW5ncz8uY29tcG9uZW50Q29sb3JzIHx8IHt9O1xuICAgIGNvbnN0IHRvRmluaXRlUG9pbnQgPSAocCkgPT4ge1xuICAgICAgICBpZiAoIXAgfHwgdHlwZW9mIHAgIT09ICdvYmplY3QnKSByZXR1cm4gbnVsbDtcbiAgICAgICAgY29uc3QgeCA9IE51bWJlci5wYXJzZUZsb2F0KHAueCk7XG4gICAgICAgIGNvbnN0IHkgPSBOdW1iZXIucGFyc2VGbG9hdChwLnkpO1xuICAgICAgICBjb25zdCB6ID0gTnVtYmVyLnBhcnNlRmxvYXQocC56KTtcbiAgICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoeCkgfHwgIU51bWJlci5pc0Zpbml0ZSh5KSB8fCAhTnVtYmVyLmlzRmluaXRlKHopKSByZXR1cm4gbnVsbDtcbiAgICAgICAgcmV0dXJuIHsgeCwgeSwgeiB9O1xuICAgIH07XG5cbiAgICBjb25zdCBoYW5kbGVQb2ludGVyRG93biA9IChlLCBpKSA9PiB7XG4gICAgICAgIGlmIChhY3RpdmVUb29sICE9PSAnVklFVycpIHJldHVybjtcbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcblxuICAgICAgICBjb25zdCBpc011bHRpU2VsZWN0ID0gZS5jdHJsS2V5IHx8IGUubWV0YUtleTtcbiAgICAgICAgaWYgKGlzTXVsdGlTZWxlY3QpIHtcbiAgICAgICAgICAgIGRjRGlzcGF0Y2goeyB0eXBlOiAnVE9HR0xFX1NFTEVDVCcsIHBheWxvYWQ6IGkgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkY0Rpc3BhdGNoKHsgdHlwZTogJ1NFTEVDVCcsIHBheWxvYWQ6IGkgfSk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGdyb3VwPlxuICAgICAgICAgICAge3BpcGVzLm1hcCgocGlwZSwgaSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChoaWRkZW5JbmRpY2VzLmluY2x1ZGVzKGkpKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCBlcDFTYWZlID0gdG9GaW5pdGVQb2ludChwaXBlPy5lcDEpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVwMlNhZmUgPSB0b0Zpbml0ZVBvaW50KHBpcGU/LmVwMik7XG4gICAgICAgICAgICAgICAgaWYgKCFlcDFTYWZlIHx8ICFlcDJTYWZlKSByZXR1cm4gbnVsbDtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGVwMSA9IG5ldyBUSFJFRS5WZWN0b3IzKGVwMVNhZmUueCwgZXAxU2FmZS55LCBlcDFTYWZlLnopO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVwMiA9IG5ldyBUSFJFRS5WZWN0b3IzKGVwMlNhZmUueCwgZXAyU2FmZS55LCBlcDJTYWZlLnopO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRpc3QgPSBlcDEuZGlzdGFuY2VUbyhlcDIpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1pZCA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuYWRkVmVjdG9ycyhlcDEsIGVwMikubXVsdGlwbHlTY2FsYXIoMC41KTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGRpciA9IGVwMi5jbG9uZSgpLnN1YihlcDEpLm5vcm1hbGl6ZSgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHF1YXQgPSBuZXcgVEhSRUUuUXVhdGVybmlvbigpLnNldEZyb21Vbml0VmVjdG9ycyhuZXcgVEhSRUUuVmVjdG9yMygwLCAxLCAwKSwgZGlyKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSBzZWxlY3RlZEluZGljZXMuaW5jbHVkZXMoaSk7XG4gICAgICAgICAgICAgICAgY29uc3QgZ2V0Q29sID0gKGRlZikgPT4gaXNTZWxlY3RlZCA/IGFwcFNldHRpbmdzLnNlbGVjdGlvbkNvbG9yIDogKGNvbG9yc1twaXBlLnR5cGVdIHx8IGRlZik7XG5cbiAgICAgICAgICAgICAgICBpZiAocGlwZS50eXBlID09PSAnQkVORCcpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAgICAgICAgIDxncm91cCBrZXk9e2BkcC0ke2l9YH0gb25Qb2ludGVyRG93bj17KGUpID0+IGhhbmRsZVBvaW50ZXJEb3duKGUsIGkpfT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17bWlkfSBxdWF0ZXJuaW9uPXtxdWF0fT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGN5bGluZGVyR2VvbWV0cnkgYXJncz17WyhwaXBlLmJvcmUvMikqMS4xLCAocGlwZS5ib3JlLzIpKjEuMSwgZGlzdCwgMTZdfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaFN0YW5kYXJkTWF0ZXJpYWwgY29sb3I9e2dldENvbChcIiM5NGEzYjhcIil9IHJvdWdobmVzcz17MC42fSBtZXRhbG5lc3M9ezAuMn0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L21lc2g+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2dyb3VwPlxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocGlwZS50eXBlID09PSAnUkVEVUNFUicpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAgICAgICAgIDxncm91cCBrZXk9e2BkcC0ke2l9YH0gb25Qb2ludGVyRG93bj17KGUpID0+IGhhbmRsZVBvaW50ZXJEb3duKGUsIGkpfT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17bWlkfSBxdWF0ZXJuaW9uPXtxdWF0fT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGN5bGluZGVyR2VvbWV0cnkgYXJncz17W3BpcGUuYm9yZS8yLCAocGlwZS5ib3JlLzIpKjAuNSwgZGlzdCwgMTZdfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaFN0YW5kYXJkTWF0ZXJpYWwgY29sb3I9e2dldENvbChcIiM2NDc0OGJcIil9IHJvdWdobmVzcz17MC42fSBtZXRhbG5lc3M9ezAuMn0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L21lc2g+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2dyb3VwPlxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocGlwZS50eXBlID09PSAnVEVFJykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgICAgICAgICAgPGdyb3VwIGtleT17YGRwLSR7aX1gfSBvblBvaW50ZXJEb3duPXsoZSkgPT4gaGFuZGxlUG9pbnRlckRvd24oZSwgaSl9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXttaWR9IHF1YXRlcm5pb249e3F1YXR9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Y3lsaW5kZXJHZW9tZXRyeSBhcmdzPXtbcGlwZS5ib3JlLzIsIHBpcGUuYm9yZS8yLCBkaXN0LCA4XX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG1lc2hTdGFuZGFyZE1hdGVyaWFsIGNvbG9yPXtnZXRDb2woXCIjOTRhM2I4XCIpfSByb3VnaG5lc3M9ezAuNn0gbWV0YWxuZXNzPXswLjJ9IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9tZXNoPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9ncm91cD5cbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHBpcGUudHlwZSA9PT0gJ0ZMQU5HRScpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAgICAgICAgIDxncm91cCBrZXk9e2BkcC0ke2l9YH0gb25Qb2ludGVyRG93bj17KGUpID0+IGhhbmRsZVBvaW50ZXJEb3duKGUsIGkpfT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17bWlkfSBxdWF0ZXJuaW9uPXtxdWF0fT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGN5bGluZGVyR2VvbWV0cnkgYXJncz17WyhwaXBlLmJvcmUvMikqMS42LCAocGlwZS5ib3JlLzIpKjEuNiwgTWF0aC5tYXgoZGlzdCowLjE1LCAxMCksIDI0XX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG1lc2hTdGFuZGFyZE1hdGVyaWFsIGNvbG9yPXtnZXRDb2woXCIjNjBhNWZhXCIpfSByb3VnaG5lc3M9ezAuNn0gbWV0YWxuZXNzPXswLjJ9IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9tZXNoPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9ncm91cD5cbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHBpcGUudHlwZSA9PT0gJ1ZBTFZFJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByID0gcGlwZS5ib3JlIC8gMjtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAgICAgICAgIDxncm91cCBrZXk9e2BkcC0ke2l9YH0gcG9zaXRpb249e21pZH0gcXVhdGVybmlvbj17cXVhdH0gb25Qb2ludGVyRG93bj17KGUpID0+IGhhbmRsZVBvaW50ZXJEb3duKGUsIGkpfT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17WzAsIC1kaXN0LzQsIDBdfT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGN5bGluZGVyR2VvbWV0cnkgYXJncz17WzAsIHIqMS44LCBkaXN0LzIsIDE2XX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG1lc2hTdGFuZGFyZE1hdGVyaWFsIGNvbG9yPXtnZXRDb2woXCIjM2I4MmY2XCIpfSByb3VnaG5lc3M9ezAuNn0gbWV0YWxuZXNzPXswLjJ9IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9tZXNoPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXtbMCwgZGlzdC80LCAwXX0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxjeWxpbmRlckdlb21ldHJ5IGFyZ3M9e1tyKjEuOCwgMCwgZGlzdC8yLCAxNl19IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxtZXNoU3RhbmRhcmRNYXRlcmlhbCBjb2xvcj17Z2V0Q29sKFwiIzNiODJmNlwiKX0gcm91Z2huZXNzPXswLjZ9IG1ldGFsbmVzcz17MC4yfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Z3JvdXAgcG9zaXRpb249e1tyKjIsIDAsIDBdfSByb3RhdGlvbj17WzAsIDAsIE1hdGguUEkvMl19PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17WzAsIGRpc3QvMiwgMF19PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGN5bGluZGVyR2VvbWV0cnkgYXJncz17W3IqMC4yLCByKjAuMiwgZGlzdCwgOF19IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaFN0YW5kYXJkTWF0ZXJpYWwgY29sb3I9e2dldENvbChcIiMzYjgyZjZcIil9IHJvdWdobmVzcz17MC42fSBtZXRhbG5lc3M9ezAuMn0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9tZXNoPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17WzAsIGRpc3QsIDBdfSByb3RhdGlvbj17W01hdGguUEkvMiwgMCwgMF19PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDx0b3J1c0dlb21ldHJ5IGFyZ3M9e1tyLCByKjAuMiwgOCwgMjRdfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxtZXNoU3RhbmRhcmRNYXRlcmlhbCBjb2xvcj17Z2V0Q29sKFwiIzNiODJmNlwiKX0gcm91Z2huZXNzPXswLjZ9IG1ldGFsbmVzcz17MC4yfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L21lc2g+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXtbMCwgZGlzdCwgMF19PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxjeWxpbmRlckdlb21ldHJ5IGFyZ3M9e1tyKjAuNCwgciowLjQsIHIqMC4yLCAxNl19IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG1lc2hTdGFuZGFyZE1hdGVyaWFsIGNvbG9yPXtnZXRDb2woXCIjM2I4MmY2XCIpfSByb3VnaG5lc3M9ezAuNn0gbWV0YWxuZXNzPXswLjJ9IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2dyb3VwPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9ncm91cD5cbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHBpcGUudHlwZSA9PT0gJ1NVUFBPUlQnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHIgPSBwaXBlLmJvcmUgLyAyO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgICAgICAgICAgPGdyb3VwIGtleT17YGRwLSR7aX1gfSBwb3NpdGlvbj17bWlkfSBxdWF0ZXJuaW9uPXtxdWF0fSBvblBvaW50ZXJEb3duPXsoZSkgPT4gaGFuZGxlUG9pbnRlckRvd24oZSwgaSl9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxncm91cCBwb3NpdGlvbj17WzAsIC0ociArIGRpc3QgLyAyKSwgMF19PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17WzAsIGRpc3QgLyA0LCAwXX0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Y3lsaW5kZXJHZW9tZXRyeSBhcmdzPXtbMCwgciAqIDIsIGRpc3QgLyAyLCA4XX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxtZXNoU3RhbmRhcmRNYXRlcmlhbCBjb2xvcj17Z2V0Q29sKFwiIzEwYjk4MVwiKX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9tZXNoPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17WzAsIC1kaXN0IC8gNCwgMF19PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Y3lsaW5kZXJHZW9tZXRyeSBhcmdzPXtbciwgciwgZGlzdCAvIDIsIDhdfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaFN0YW5kYXJkTWF0ZXJpYWwgY29sb3I9e2dldENvbChcIiMxMGI5ODFcIil9IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2dyb3VwPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9ncm91cD5cbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgICAgICA8Z3JvdXAga2V5PXtgZHAtJHtpfWB9IG9uUG9pbnRlckRvd249eyhlKSA9PiBoYW5kbGVQb2ludGVyRG93bihlLCBpKX0+XG4gICAgICAgICAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17bWlkfSBxdWF0ZXJuaW9uPXtxdWF0fT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Y3lsaW5kZXJHZW9tZXRyeSBhcmdzPXtbcGlwZS5ib3JlLzIsIHBpcGUuYm9yZS8yLCBkaXN0LCA4XX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaFN0YW5kYXJkTWF0ZXJpYWwgY29sb3I9e2dldENvbChcIiMzYjgyZjZcIil9IHJvdWdobmVzcz17MC42fSBtZXRhbG5lc3M9ezAuMn0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgICAgICAgPC9ncm91cD5cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSl9XG4gICAgICAgIDwvZ3JvdXA+XG4gICAgKTtcbn07XG5cbmNvbnN0IERyYXdDYW52YXNfRHJhd1Rvb2wgPSAoeyBhY3RpdmVUb29sLCBkcmF3blBpcGVzLCBkY0Rpc3BhdGNoLCBncmlkQ29uZmlnLCBvbkN1cnNvck1vdmUgfSkgPT4ge1xuICAgIGNvbnN0IFtzdGFydFB0LCBzZXRTdGFydFB0XSA9IHVzZVN0YXRlKG51bGwpO1xuICAgIGNvbnN0IFtjdXJyUHQsIHNldEN1cnJQdF0gPSB1c2VTdGF0ZShudWxsKTtcbiAgICBjb25zdCBzbmFwUmVzb2x1dGlvbiA9IGdyaWRDb25maWcuc25hcFJlc29sdXRpb247XG4gICAgY29uc3QgZGVmYXVsdEJvcmUgPSAyMDA7XG5cbiAgICAvLyBIYW5kbGUgRXNjIHRvIGNhbmNlbCBkcmF3aW5nXG4gICAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICAgICAgY29uc3QgaGFuZGxlS2V5RG93biA9IChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBhY3RpdmVUYWIgPSB1c2VTdG9yZS5nZXRTdGF0ZSgpLmFjdGl2ZVRhYjtcbiAgICAgICAgICAgIGlmIChhY3RpdmVUYWIgJiYgYWN0aXZlVGFiICE9PSAnZHJhdycpIHJldHVybjtcblxuICAgICAgICAgICAgaWYgKGUua2V5ID09PSAnRXNjYXBlJykge1xuICAgICAgICAgICAgICAgIGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50ICYmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50LnRhZ05hbWUgPT09ICdJTlBVVCcgfHwgZG9jdW1lbnQuYWN0aXZlRWxlbWVudC50YWdOYW1lID09PSAnVEVYVEFSRUEnKSkgcmV0dXJuO1xuXG4gICAgICAgICAgICAgICAgaWYgKHN0YXJ0UHQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGJnLmV2ZW50KCdEUkFXX0VTQ0FQRScsICdEcmF3aW5nIGNhbmNlbGxlZCcsIHsgaGFkU3RhcnRQdDogISFzdGFydFB0IH0pO1xuICAgICAgICAgICAgICAgICAgICBkY0Rpc3BhdGNoKHsgdHlwZTogJ0lOQ1JFTUVOVF9NRVRSSUMnLCBwYXlsb2FkOiAnY2FuY2VsQ291bnQnIH0pO1xuICAgICAgICAgICAgICAgICAgICBlbWl0RHJhd01ldHJpYyh7IHRvb2w6IGFjdGl2ZVRvb2wsIHBoYXNlOiAnQ0FOQ0VMJywgcmVzdWx0OiAnRVNDJyB9KTtcbiAgICAgICAgICAgICAgICAgICAgc2V0U3RhcnRQdChudWxsKTtcbiAgICAgICAgICAgICAgICAgICAgc2V0Q3VyclB0KG51bGwpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVLZXlEb3duKTtcbiAgICAgICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlS2V5RG93bik7XG4gICAgfSwgW3N0YXJ0UHQsIGFjdGl2ZVRvb2xdKTtcblxuICAgIGNvbnN0IGhhbmRsZVBvaW50ZXJEb3duID0gKGUpID0+IHtcbiAgICAgICAgaWYgKCFbJ0RSQVdfUElQRScsICdEUkFXX0JFTkQnLCAnRFJBV19URUUnLCAnRkxBTkdFJywgJ1ZBTFZFJywgJ1JFRFVDRVInLCAnU1VQUE9SVCddLmluY2x1ZGVzKGFjdGl2ZVRvb2wpKSByZXR1cm47XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cbiAgICAgICAgY29uc3QgdDAgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICAgICAgdHJ5IHtcblxuICAgICAgICAvLyBTbmFwIHRvIGV4aXN0aW5nIGdlb21ldHJ5IGlmIGhvdmVyZWQsIG90aGVyd2lzZSBncmlkIHNuYXBcbiAgICAgICAgbGV0IG5lYXJlc3RTbmFwID0gbnVsbDtcbiAgICAgICAgbGV0IG1pbkRpc3QgPSAyMDA7IC8vIFNuYXAgcmFkaXVzIGluIHdvcmxkIHVuaXRzXG5cbiAgICAgICAgZHJhd25QaXBlcy5mb3JFYWNoKHBpcGUgPT4ge1xuICAgICAgICAgICAgWydlcDEnLCAnZXAyJ10uZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChwaXBlW2tleV0pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHQgPSBuZXcgVEhSRUUuVmVjdG9yMyhwaXBlW2tleV0ueCwgcGlwZVtrZXldLnksIHBpcGVba2V5XS56KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlzdCA9IHB0LmRpc3RhbmNlVG8oZS5wb2ludCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkaXN0IDwgbWluRGlzdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWluRGlzdCA9IGRpc3Q7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZWFyZXN0U25hcCA9IHB0LmNsb25lKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV0IHNuYXBwZWRQdDtcbiAgICAgICAgaWYgKG5lYXJlc3RTbmFwKSB7XG4gICAgICAgICAgICBzbmFwcGVkUHQgPSBuZWFyZXN0U25hcDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEdyaWQgc25hcCBmYWxsYmFja1xuICAgICAgICAgICAgY29uc3QgeCA9IE1hdGgucm91bmQoZS5wb2ludC54IC8gc25hcFJlc29sdXRpb24pICogc25hcFJlc29sdXRpb247XG4gICAgICAgICAgICBjb25zdCB5ID0gMDsgLy8gTG9jayB0byBmbG9vciBwbGFuZSBmb3Igbm93XG4gICAgICAgICAgICBjb25zdCB6ID0gTWF0aC5yb3VuZChlLnBvaW50LnogLyBzbmFwUmVzb2x1dGlvbikgKiBzbmFwUmVzb2x1dGlvbjtcbiAgICAgICAgICAgIHNuYXBwZWRQdCA9IG5ldyBUSFJFRS5WZWN0b3IzKHgsIHksIHopO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGFjdGl2ZVRvb2wgPT09ICdTVVBQT1JUJykge1xuICAgICAgICAgICAgLy8gRmluZCBpZiBjbGlja2luZyBvbiBhbiBleGlzdGluZyBwaXBlIHRvIHNuYXAgcHJvcGVybHlcbiAgICAgICAgICAgIGxldCB0YXJnZXRQaXBlID0gbnVsbDtcbiAgICAgICAgICAgIGxldCBjbGlja0Rpc3QgPSBJbmZpbml0eTtcbiAgICAgICAgICAgIGRyYXduUGlwZXMuZm9yRWFjaCgocGlwZSwgaSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICgocGlwZS50eXBlIHx8ICcnKS50b1VwcGVyQ2FzZSgpID09PSAnUElQRScpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdjEgPSBuZXcgVEhSRUUuVmVjdG9yMyhwaXBlLmVwMS54LCBwaXBlLmVwMS55LCBwaXBlLmVwMS56KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdjIgPSBuZXcgVEhSRUUuVmVjdG9yMyhwaXBlLmVwMi54LCBwaXBlLmVwMi55LCBwaXBlLmVwMi56KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbGluZSA9IG5ldyBUSFJFRS5MaW5lMyh2MSwgdjIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjbG9zZXN0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcbiAgICAgICAgICAgICAgICAgICAgbGluZS5jbG9zZXN0UG9pbnRUb1BvaW50KGUucG9pbnQsIHRydWUsIGNsb3Nlc3QpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkID0gY2xvc2VzdC5kaXN0YW5jZVRvKGUucG9pbnQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZCA8IDEwMCAmJiBkIDwgY2xpY2tEaXN0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjbGlja0Rpc3QgPSBkO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0UGlwZSA9IHsgLi4ucGlwZSwgX2luZGV4OiBpIH07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgaWYgKHRhcmdldFBpcGUpIHtcbiAgICAgICAgICAgICAgICAvLyBTeW50aGVzaXplIHN1cHBvcnRcbiAgICAgICAgICAgICAgICBjb25zdCBzdXBwb3J0Um93ID0gaW5zZXJ0U3VwcG9ydEF0UGlwZSh7IC4uLnRhcmdldFBpcGUsIF9yb3dJbmRleDogdGFyZ2V0UGlwZS5faW5kZXggfSwgZS5wb2ludC5jbG9uZSgpKTtcbiAgICAgICAgICAgICAgICBpZiAoc3VwcG9ydFJvdykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdQaXBlcyA9IFsuLi5kcmF3blBpcGVzXTtcbiAgICAgICAgICAgICAgICAgICAgbmV3UGlwZXMuc3BsaWNlKHRhcmdldFBpcGUuX2luZGV4ICsgMSwgMCwgc3VwcG9ydFJvdyk7XG4gICAgICAgICAgICAgICAgICAgIGRjRGlzcGF0Y2goeyB0eXBlOiAnU0VUX0FMTF9DT01QT05FTlRTJywgcGF5bG9hZDogbmV3UGlwZXMgfSk7XG4gICAgICAgICAgICAgICAgICAgIGRjRGlzcGF0Y2goeyB0eXBlOiAnSU5DUkVNRU5UX01FVFJJQycsIHBheWxvYWQ6ICdzdWNjZXNzQ291bnQnIH0pO1xuICAgICAgICAgICAgICAgICAgICBlbWl0RHJhd01ldHJpYyh7IHRvb2w6ICdTVVBQT1JUJywgcGhhc2U6ICdDT01NSVQnLCByZXN1bHQ6ICdTVUNDRVNTJywgbGF0ZW5jeU1zOiBwZXJmb3JtYW5jZS5ub3coKSAtIHQwIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoWydGTEFOR0UnLCAnVkFMVkUnLCAnUkVEVUNFUiddLmluY2x1ZGVzKGFjdGl2ZVRvb2wpKSB7XG4gICAgICAgICAgICBpZiAoIW5lYXJlc3RTbmFwKSB7XG4gICAgICAgICAgICAgICAgYWxlcnQoJ05vbi1waXBlIGNvbXBvbmVudHMgbXVzdCBiZSBzbmFwcGVkIHRvIGFuIGV4aXN0aW5nIHBpcGVsaW5lIGVuZHBvaW50LicpO1xuICAgICAgICAgICAgICAgIGRjRGlzcGF0Y2goeyB0eXBlOiAnSU5DUkVNRU5UX01FVFJJQycsIHBheWxvYWQ6ICdmYWlsQ291bnQnIH0pO1xuICAgICAgICAgICAgICAgIGVtaXREcmF3TWV0cmljKHsgdG9vbDogYWN0aXZlVG9vbCwgcGhhc2U6ICdFUlJPUicsIHJlc3VsdDogJ01JU1NJTkdfU05BUCcsIGxhdGVuY3lNczogcGVyZm9ybWFuY2Uubm93KCkgLSB0MCB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEZpbmQgdGhlIHBpcGUgd2Ugc25hcHBlZCB0bywgdG8gaW5mZXIgZGlyZWN0aW9uXG4gICAgICAgICAgICBsZXQgdGFyZ2V0UGlwZSA9IG51bGw7XG4gICAgICAgICAgICBsZXQgaXNFcDEgPSBmYWxzZTtcbiAgICAgICAgICAgIGRyYXduUGlwZXMuZm9yRWFjaChwaXBlID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocGlwZS5lcDEgJiYgbmV3IFRIUkVFLlZlY3RvcjMocGlwZS5lcDEueCwgcGlwZS5lcDEueSwgcGlwZS5lcDEueikuZGlzdGFuY2VUbyhzbmFwcGVkUHQpIDwgMSkge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRQaXBlID0gcGlwZTtcbiAgICAgICAgICAgICAgICAgICAgaXNFcDEgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocGlwZS5lcDIgJiYgbmV3IFRIUkVFLlZlY3RvcjMocGlwZS5lcDIueCwgcGlwZS5lcDIueSwgcGlwZS5lcDIueikuZGlzdGFuY2VUbyhzbmFwcGVkUHQpIDwgMSkge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRQaXBlID0gcGlwZTtcbiAgICAgICAgICAgICAgICAgICAgaXNFcDEgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gTGVuZ3RoIGRlZmF1bHRzIGJhc2VkIG9uIGNvbXBvbmVudCB0eXBlLCBvcHRpb25hbGx5IHJlbWVtYmVyZWQgZnJvbSBzdGF0ZVxuICAgICAgICAgICAgY29uc3QgdHlwZU1hcCA9IHtcbiAgICAgICAgICAgICAgICAnRkxBTkdFJzogJ0ZMQU5HRScsXG4gICAgICAgICAgICAgICAgJ1ZBTFZFJzogJ1ZBTFZFJyxcbiAgICAgICAgICAgICAgICAnUkVEVUNFUic6ICdSRURVQ0VSJ1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgbGV0IGxlbiA9IDEwMDtcbiAgICAgICAgICAgIGlmIChhY3RpdmVUb29sID09PSAnRkxBTkdFJykgbGVuID0gMTAwO1xuICAgICAgICAgICAgaWYgKGFjdGl2ZVRvb2wgPT09ICdWQUxWRScpIGxlbiA9IDQwMDtcbiAgICAgICAgICAgIGlmIChhY3RpdmVUb29sID09PSAnUkVEVUNFUicpIGxlbiA9IDMwMDtcblxuICAgICAgICAgICAgLy8gTG9vayBmb3IgYSBwcmV2aW91c2x5IG1vZGlmaWVkIGxlbmd0aCBmb3IgdGhpcyBjb21wb25lbnQgdHlwZSBpbiB0aGUgZHJhd25QaXBlcyBoaXN0b3J5XG4gICAgICAgICAgICBjb25zdCBwcmV2TWF0Y2hlcyA9IGRyYXduUGlwZXMuZmlsdGVyKHAgPT4gcC50eXBlID09PSB0eXBlTWFwW2FjdGl2ZVRvb2xdKTtcbiAgICAgICAgICAgIGlmIChwcmV2TWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbGFzdCA9IHByZXZNYXRjaGVzW3ByZXZNYXRjaGVzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgIGxlbiA9IG5ldyBUSFJFRS5WZWN0b3IzKGxhc3QuZXAxLngsIGxhc3QuZXAxLnksIGxhc3QuZXAxLnopLmRpc3RhbmNlVG8obmV3IFRIUkVFLlZlY3RvcjMobGFzdC5lcDIueCwgbGFzdC5lcDIueSwgbGFzdC5lcDIueikpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsZXQgZGlyID0gbmV3IFRIUkVFLlZlY3RvcjMoMSwgMCwgMCk7IC8vIGZhbGxiYWNrIGRpcmVjdGlvblxuICAgICAgICAgICAgbGV0IGluaGVyaXRlZEJvcmUgPSBkZWZhdWx0Qm9yZTtcbiAgICAgICAgICAgIGxldCBza2V5ID0gJ0ZMV04nO1xuXG4gICAgICAgICAgICBpZiAodGFyZ2V0UGlwZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHAxID0gbmV3IFRIUkVFLlZlY3RvcjModGFyZ2V0UGlwZS5lcDEueCwgdGFyZ2V0UGlwZS5lcDEueSwgdGFyZ2V0UGlwZS5lcDEueik7XG4gICAgICAgICAgICAgICAgY29uc3QgcDIgPSBuZXcgVEhSRUUuVmVjdG9yMyh0YXJnZXRQaXBlLmVwMi54LCB0YXJnZXRQaXBlLmVwMi55LCB0YXJnZXRQaXBlLmVwMi56KTtcblxuICAgICAgICAgICAgICAgIC8vIERpcmVjdGlvbiBjb250aW51ZXMgT1VUV0FSRCBmcm9tIHRoZSBwaXBlXG4gICAgICAgICAgICAgICAgaWYgKGlzRXAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGRpciA9IHAxLmNsb25lKCkuc3ViKHAyKS5ub3JtYWxpemUoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBkaXIgPSBwMi5jbG9uZSgpLnN1YihwMSkubm9ybWFsaXplKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGluaGVyaXRlZEJvcmUgPSB0YXJnZXRQaXBlLmJvcmUgfHwgZGVmYXVsdEJvcmU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGVwMiA9IHNuYXBwZWRQdC5jbG9uZSgpLmFkZChkaXIubXVsdGlwbHlTY2FsYXIobGVuKSk7XG5cbiAgICAgICAgICAgIGlmIChhY3RpdmVUb29sID09PSAnVkFMVkUnKSBza2V5ID0gJ1ZCRkwnO1xuICAgICAgICAgICAgaWYgKGFjdGl2ZVRvb2wgPT09ICdSRURVQ0VSJykgc2tleSA9ICdSRUNPTic7XG5cbiAgICAgICAgICAgIGRjRGlzcGF0Y2goeyB0eXBlOiAnQUREX0NPTVBPTkVOVCcsIHBheWxvYWQ6IHtcbiAgICAgICAgICAgICAgICB0eXBlOiB0eXBlTWFwW2FjdGl2ZVRvb2xdLFxuICAgICAgICAgICAgICAgIHNrZXk6IHNrZXksXG4gICAgICAgICAgICAgICAgYm9yZTogaW5oZXJpdGVkQm9yZSxcbiAgICAgICAgICAgICAgICBlcDE6IHsgeDogc25hcHBlZFB0LngsIHk6IHNuYXBwZWRQdC55LCB6OiBzbmFwcGVkUHQueiB9LFxuICAgICAgICAgICAgICAgIGVwMjogeyB4OiBlcDIueCwgeTogZXAyLnksIHo6IGVwMi56IH0sXG4gICAgICAgICAgICAgICAgcGlwZWxpbmVSZWY6IHRhcmdldFBpcGUgPyB0YXJnZXRQaXBlLnBpcGVsaW5lUmVmIDogJ1VOS05PV04nLFxuICAgICAgICAgICAgICAgIGNhMTogdGFyZ2V0UGlwZSA/IHRhcmdldFBpcGUuY2ExIDogJycsXG4gICAgICAgICAgICAgICAgY2EyOiB0YXJnZXRQaXBlID8gdGFyZ2V0UGlwZS5jYTIgOiAnJyxcbiAgICAgICAgICAgICAgICBjYTM6IHRhcmdldFBpcGUgPyB0YXJnZXRQaXBlLmNhMyA6ICcnLFxuICAgICAgICAgICAgICAgIGNhNDogdGFyZ2V0UGlwZSA/IHRhcmdldFBpcGUuY2E0IDogJycsXG4gICAgICAgICAgICAgICAgY2E1OiB0YXJnZXRQaXBlID8gdGFyZ2V0UGlwZS5jYTUgOiAnJyxcbiAgICAgICAgICAgICAgICBjYTY6IHRhcmdldFBpcGUgPyB0YXJnZXRQaXBlLmNhNiA6ICcnLFxuICAgICAgICAgICAgICAgIGNhNzogdGFyZ2V0UGlwZSA/IHRhcmdldFBpcGUuY2E3IDogJycsXG4gICAgICAgICAgICAgICAgY2E4OiB0YXJnZXRQaXBlID8gdGFyZ2V0UGlwZS5jYTggOiAnJyxcbiAgICAgICAgICAgICAgICBjYTk6IHRhcmdldFBpcGUgPyB0YXJnZXRQaXBlLmNhOSA6ICcnLFxuICAgICAgICAgICAgICAgIGNhMTA6IHRhcmdldFBpcGUgPyB0YXJnZXRQaXBlLmNhMTAgOiAnJ1xuICAgICAgICAgICAgfX0pO1xuICAgICAgICAgICAgZGNEaXNwYXRjaCh7IHR5cGU6ICdJTkNSRU1FTlRfTUVUUklDJywgcGF5bG9hZDogJ3N1Y2Nlc3NDb3VudCcgfSk7XG4gICAgICAgICAgICBlbWl0RHJhd01ldHJpYyh7IHRvb2w6IGFjdGl2ZVRvb2wsIHBoYXNlOiAnQ09NTUlUJywgcmVzdWx0OiAnU1VDQ0VTUycsIGxhdGVuY3lNczogcGVyZm9ybWFuY2Uubm93KCkgLSB0MCB9KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChbJ0RSQVdfQkVORCcsICdEUkFXX1RFRSddLmluY2x1ZGVzKGFjdGl2ZVRvb2wpKSB7XG4gICAgICAgICAgICBhbGVydCgnVG8gaW5zZXJ0IEJlbmRzIG9yIFRlZXMsIGRyYXcgb3ZlcmxhcHBpbmcgcGlwZXMgYW5kIHVzZSB0aGUgXCJDb252ZXJ0IHRvIEJlbmQvVGVlXCIgdG9vbHMgaW5zdGVhZC4nKTtcbiAgICAgICAgICAgIGRjRGlzcGF0Y2goeyB0eXBlOiAnU0VUX1RPT0wnLCBwYXlsb2FkOiAnVklFVycgfSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXN0YXJ0UHQpIHtcbiAgICAgICAgICAgIHNldFN0YXJ0UHQoc25hcHBlZFB0KTtcbiAgICAgICAgICAgIHNldEN1cnJQdChzbmFwcGVkUHQuY2xvbmUoKSk7XG4gICAgICAgICAgICBlbWl0RHJhd01ldHJpYyh7IHRvb2w6IGFjdGl2ZVRvb2wsIHBoYXNlOiAnU1RFUDEnLCByZXN1bHQ6ICdBUk1FRCcsIGxhdGVuY3lNczogcGVyZm9ybWFuY2Uubm93KCkgLSB0MCB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChzbmFwcGVkUHQuZGlzdGFuY2VUbyhzdGFydFB0KSA+IDApIHtcbiAgICAgICAgICAgICAgICBsZXQgYWN0dWFsU3RhcnQgPSBzdGFydFB0O1xuICAgICAgICAgICAgICAgIGNvbnN0IGRlZmF1bHRCZW5kUmFkaXVzID0gZGVmYXVsdEJvcmUgKiAxLjU7XG5cbiAgICAgICAgICAgICAgICBsZXQgbmV3Q29tcG9uZW50cyA9IFtdO1xuXG4gICAgICAgICAgICAgICAgLy8gU2ltcGxlIGF1dG8tcm91dGluZzogY2hlY2sgaWYgd2UgYXJlIGNoYW5naW5nIGRpcmVjdGlvbiByZWxhdGl2ZSB0byB0aGUgbGFzdCBwaXBlIGRyYXduXG4gICAgICAgICAgICAgICAgaWYgKGRyYXduUGlwZXMubGVuZ3RoID4gMCAmJiBhY3RpdmVUb29sID09PSAnRFJBV19QSVBFJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsYXN0Q29tcG9uZW50ID0gZHJhd25QaXBlc1tkcmF3blBpcGVzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICBpZiAobGFzdENvbXBvbmVudC50eXBlID09PSAnUElQRScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGxBID0gbmV3IFRIUkVFLlZlY3RvcjMobGFzdENvbXBvbmVudC5lcDEueCwgbGFzdENvbXBvbmVudC5lcDEueSwgbGFzdENvbXBvbmVudC5lcDEueik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBsQiA9IG5ldyBUSFJFRS5WZWN0b3IzKGxhc3RDb21wb25lbnQuZXAyLngsIGxhc3RDb21wb25lbnQuZXAyLnksIGxhc3RDb21wb25lbnQuZXAyLnopO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobEIuZGlzdGFuY2VUbyhzdGFydFB0KSA8IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkaXIxID0gbEIuY2xvbmUoKS5zdWIobEEpLm5vcm1hbGl6ZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpcjIgPSBzbmFwcGVkUHQuY2xvbmUoKS5zdWIoc3RhcnRQdCkubm9ybWFsaXplKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiBkaXJlY3Rpb24gY2hhbmdlcywgaW5zZXJ0IEJFTkRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoTWF0aC5hYnMoZGlyMS5kb3QoZGlyMikpIDwgMC45OSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodXNlU3RvcmUuZ2V0U3RhdGUoKS5hcHBTZXR0aW5ncy5hdXRvQmVuZEVuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRyaW0gbGFzdCBwaXBlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0cmltRGlzdCA9IGRlZmF1bHRCZW5kUmFkaXVzO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV3TGFzdEVwMiA9IGxCLmNsb25lKCkuc3ViKGRpcjEuY2xvbmUoKS5tdWx0aXBseVNjYWxhcih0cmltRGlzdCkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBVcGRhdGUgbGFzdCBwaXBlIGluIGFycmF5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB1cGRhdGVkUGlwZXMgPSBbLi4uZHJhd25QaXBlc107XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVkUGlwZXNbdXBkYXRlZFBpcGVzLmxlbmd0aCAtIDFdLmVwMiA9IHsgeDogbmV3TGFzdEVwMi54LCB5OiBuZXdMYXN0RXAyLnksIHo6IG5ld0xhc3RFcDIueiB9O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBDcmVhdGUgYmVuZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYmVuZEVwMSA9IG5ld0xhc3RFcDI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBiZW5kRXAyID0gc3RhcnRQdC5jbG9uZSgpLmFkZChkaXIyLmNsb25lKCkubXVsdGlwbHlTY2FsYXIodHJpbURpc3QpKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3Q29tcG9uZW50cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnQkVORCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYm9yZTogZGVmYXVsdEJvcmUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXAxOiB7IHg6IGJlbmRFcDEueCwgeTogYmVuZEVwMS55LCB6OiBiZW5kRXAxLnogfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcDI6IHsgeDogYmVuZEVwMi54LCB5OiBiZW5kRXAyLnksIHo6IGJlbmRFcDIueiB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gTmV3IHBpcGUgc3RhcnRzIGFmdGVyIGJlbmRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFjdHVhbFN0YXJ0ID0gYmVuZEVwMjtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3Q29tcG9uZW50cy5mb3JFYWNoKGMgPT4gZGNEaXNwYXRjaCh7IHR5cGU6ICdBRERfQ09NUE9ORU5UJywgcGF5bG9hZDogYyB9KSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkY0Rpc3BhdGNoKHsgdHlwZTogJ0FERF9DT01QT05FTlQnLCBwYXlsb2FkOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ1BJUEUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJvcmU6IGRlZmF1bHRCb3JlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVwMTogeyB4OiBhY3R1YWxTdGFydC54LCB5OiBhY3R1YWxTdGFydC55LCB6OiBhY3R1YWxTdGFydC56IH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXAyOiB7IHg6IHNuYXBwZWRQdC54LCB5OiBzbmFwcGVkUHQueSwgejogc25hcHBlZFB0LnogfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfX0pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXRTdGFydFB0KHNuYXBwZWRQdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBOb3JtYWwgc3RyYWlnaHQgcGlwZSBhcHBlbmRcbiAgICAgICAgICAgICAgICBkY0Rpc3BhdGNoKHsgdHlwZTogJ0FERF9DT01QT05FTlQnLCBwYXlsb2FkOiB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdQSVBFJyxcbiAgICAgICAgICAgICAgICAgICAgYm9yZTogZGVmYXVsdEJvcmUsXG4gICAgICAgICAgICAgICAgICAgIGVwMTogeyB4OiBhY3R1YWxTdGFydC54LCB5OiBhY3R1YWxTdGFydC55LCB6OiBhY3R1YWxTdGFydC56IH0sXG4gICAgICAgICAgICAgICAgICAgIGVwMjogeyB4OiBzbmFwcGVkUHQueCwgeTogc25hcHBlZFB0LnksIHo6IHNuYXBwZWRQdC56IH1cbiAgICAgICAgICAgICAgICB9fSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIENvbnRpbnVvdXMgZHJhd1xuICAgICAgICAgICAgc2V0U3RhcnRQdChzbmFwcGVkUHQpO1xuICAgICAgICAgICAgZGNEaXNwYXRjaCh7IHR5cGU6ICdJTkNSRU1FTlRfTUVUUklDJywgcGF5bG9hZDogJ3N1Y2Nlc3NDb3VudCcgfSk7XG4gICAgICAgICAgICBlbWl0RHJhd01ldHJpYyh7IHRvb2w6IGFjdGl2ZVRvb2wsIHBoYXNlOiAnQ09NTUlUJywgcmVzdWx0OiAnU1VDQ0VTUycsIGxhdGVuY3lNczogcGVyZm9ybWFuY2Uubm93KCkgLSB0MCB9KTtcbiAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGRiZy5lcnJvcignRFJBV19UT09MJywgJ0ZhdGFsIGVycm9yIGR1cmluZyBkcmF3aW5nIG9wZXJhdGlvbicsIHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgc2V0U3RhcnRQdChudWxsKTtcbiAgICAgICAgICAgIGRjRGlzcGF0Y2goeyB0eXBlOiAnSU5DUkVNRU5UX01FVFJJQycsIHBheWxvYWQ6ICdmYWlsQ291bnQnIH0pO1xuICAgICAgICAgICAgZW1pdERyYXdNZXRyaWMoeyB0b29sOiBhY3RpdmVUb29sLCBwaGFzZTogJ0VSUk9SJywgcmVzdWx0OiAnRkFUQUwnLCBlcnJvckNsYXNzOiBlcnIubWVzc2FnZSwgbGF0ZW5jeU1zOiBwZXJmb3JtYW5jZS5ub3coKSAtIHQwIH0pO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IFtob3ZlclNuYXAsIHNldEhvdmVyU25hcF0gPSB1c2VTdGF0ZShudWxsKTtcblxuICAgIGNvbnN0IGhhbmRsZVBvaW50ZXJNb3ZlID0gKGUpID0+IHtcbiAgICAgICAgaWYgKCFbJ0RSQVdfUElQRScsICdEUkFXX0JFTkQnLCAnRFJBV19URUUnLCAnRkxBTkdFJywgJ1ZBTFZFJywgJ1JFRFVDRVInLCAnU1VQUE9SVCddLmluY2x1ZGVzKGFjdGl2ZVRvb2wpKSByZXR1cm47XG5cbiAgICAgICAgbGV0IG5lYXJlc3RTbmFwID0gbnVsbDtcbiAgICAgICAgbGV0IG1pbkRpc3QgPSAyMDA7IC8vIFNuYXAgcmFkaXVzIGluIHdvcmxkIHVuaXRzXG5cbiAgICAgICAgZHJhd25QaXBlcy5mb3JFYWNoKHBpcGUgPT4ge1xuICAgICAgICAgICAgWydlcDEnLCAnZXAyJ10uZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChwaXBlW2tleV0pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHQgPSBuZXcgVEhSRUUuVmVjdG9yMyhwaXBlW2tleV0ueCwgcGlwZVtrZXldLnksIHBpcGVba2V5XS56KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlzdCA9IHB0LmRpc3RhbmNlVG8oZS5wb2ludCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkaXN0IDwgbWluRGlzdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWluRGlzdCA9IGRpc3Q7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZWFyZXN0U25hcCA9IHB0LmNsb25lKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc2V0SG92ZXJTbmFwKG5lYXJlc3RTbmFwKTtcblxuICAgICAgICBpZiAoIXN0YXJ0UHQgfHwgYWN0aXZlVG9vbCAhPT0gJ0RSQVdfUElQRScpIHJldHVybjtcblxuICAgICAgICBsZXQgcDtcbiAgICAgICAgaWYgKG5lYXJlc3RTbmFwKSB7XG4gICAgICAgICAgICBwID0gbmVhcmVzdFNuYXA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCB4ID0gTWF0aC5yb3VuZChlLnBvaW50LnggLyBzbmFwUmVzb2x1dGlvbikgKiBzbmFwUmVzb2x1dGlvbjtcbiAgICAgICAgICAgIGNvbnN0IHkgPSAwO1xuICAgICAgICAgICAgY29uc3QgeiA9IE1hdGgucm91bmQoZS5wb2ludC56IC8gc25hcFJlc29sdXRpb24pICogc25hcFJlc29sdXRpb247XG5cbiAgICAgICAgICAgIC8vIE9ydGhvIHRyYWNraW5nIGhlbHBlciAtIGxvY2sgdG8gbWFqb3IgYXhlcyBpZiBtb3ZpbmcgbW9zdGx5IHN0cmFpZ2h0XG4gICAgICAgICAgICBwID0gbmV3IFRIUkVFLlZlY3RvcjMoeCwgeSwgeik7XG4gICAgICAgICAgICBjb25zdCBkeCA9IE1hdGguYWJzKHAueCAtIHN0YXJ0UHQueCk7XG4gICAgICAgICAgICBjb25zdCBkeiA9IE1hdGguYWJzKHAueiAtIHN0YXJ0UHQueik7XG5cbiAgICAgICAgICAgIGlmIChkeCA+IGR6ICogMikgcC56ID0gc3RhcnRQdC56O1xuICAgICAgICAgICAgZWxzZSBpZiAoZHogPiBkeCAqIDIpIHAueCA9IHN0YXJ0UHQueDtcbiAgICAgICAgfVxuXG4gICAgICAgIHNldEN1cnJQdChwKTtcbiAgICAgICAgb25DdXJzb3JNb3ZlICYmIG9uQ3Vyc29yTW92ZShwKTtcbiAgICB9O1xuXG4gICAgY29uc3QgaGFuZGxlQ29udGV4dE1lbnUgPSAoZSkgPT4ge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHNldFN0YXJ0UHQobnVsbCk7XG4gICAgICAgIHNldEN1cnJQdChudWxsKTtcbiAgICB9O1xuXG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8Z3JvdXA+XG4gICAgICAgICAgICA8bWVzaFxuICAgICAgICAgICAgICAgIG9uUG9pbnRlckRvd249e2hhbmRsZVBvaW50ZXJEb3dufVxuICAgICAgICAgICAgICAgIG9uUG9pbnRlck1vdmU9e2hhbmRsZVBvaW50ZXJNb3ZlfVxuICAgICAgICAgICAgICAgIG9uQ29udGV4dE1lbnU9e2hhbmRsZUNvbnRleHRNZW51fVxuICAgICAgICAgICAgICAgIHJvdGF0aW9uPXtbLU1hdGguUEkgLyAyLCAwLCAwXX1cbiAgICAgICAgICAgICAgICBwb3NpdGlvbj17WzAsIDAsIDBdfVxuICAgICAgICAgICAgICAgIHJlbmRlck9yZGVyPXstMX1cbiAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICA8cGxhbmVHZW9tZXRyeSBhcmdzPXtbMTAwMDAwLCAxMDAwMDBdfSAvPlxuICAgICAgICAgICAgICAgIDxtZXNoQmFzaWNNYXRlcmlhbCB2aXNpYmxlPXtmYWxzZX0gLz5cbiAgICAgICAgICAgIDwvbWVzaD5cblxuICAgICAgICAgICAgey8qIFZpc3VhbCBTbmFwIEluZGljYXRvciAqL31cbiAgICAgICAgICAgIHtob3ZlclNuYXAgJiYgKFxuICAgICAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXtob3ZlclNuYXB9IHJlbmRlck9yZGVyPXs5OTl9PlxuICAgICAgICAgICAgICAgICAgICA8c3BoZXJlR2VvbWV0cnkgYXJncz17WzI1LCAxNiwgMTZdfSAvPlxuICAgICAgICAgICAgICAgICAgICA8bWVzaEJhc2ljTWF0ZXJpYWwgY29sb3I9XCIjMTBiOTgxXCIgdHJhbnNwYXJlbnQgb3BhY2l0eT17MC44fSBkZXB0aFRlc3Q9e2ZhbHNlfSAvPlxuICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICl9XG5cbiAgICAgICAgICAgIHsvKiBQcmV2aWV3IExpbmUgKi99XG4gICAgICAgICAgICB7c3RhcnRQdCAmJiBjdXJyUHQgJiYgc3RhcnRQdC5kaXN0YW5jZVRvKGN1cnJQdCkgPiAwICYmIChcbiAgICAgICAgICAgICAgICA8Z3JvdXA+XG4gICAgICAgICAgICAgICAgICAgIDxMaW5lIHBvaW50cz17W3N0YXJ0UHQsIGN1cnJQdF19IGNvbG9yPVwiI2Y1OWUwYlwiIGxpbmVXaWR0aD17M30gZGFzaGVkIC8+XG4gICAgICAgICAgICAgICAgICAgIDxUZXh0XG4gICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbj17W1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIChzdGFydFB0LnggKyBjdXJyUHQueCkgLyAyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDIwMCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAoc3RhcnRQdC56ICsgY3VyclB0LnopIC8gMlxuICAgICAgICAgICAgICAgICAgICAgICAgXX1cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yPXt1c2VTdG9yZS5nZXRTdGF0ZSgpLmFwcFNldHRpbmdzLnNlbGVjdGlvbkNvbG9yfVxuICAgICAgICAgICAgICAgICAgICAgICAgZm9udFNpemU9ezgwfVxuICAgICAgICAgICAgICAgICAgICAgICAgb3V0bGluZVdpZHRoPXsyfVxuICAgICAgICAgICAgICAgICAgICAgICAgb3V0bGluZUNvbG9yPVwiIzAwMFwiXG4gICAgICAgICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICAgICAgICAgIHtgJHtzdGFydFB0LmRpc3RhbmNlVG8oY3VyclB0KS50b0ZpeGVkKDApfW1tYH1cbiAgICAgICAgICAgICAgICAgICAgPC9UZXh0PlxuICAgICAgICAgICAgICAgIDwvZ3JvdXA+XG4gICAgICAgICAgICApfVxuXG4gICAgICAgICAgICB7LyogU25hcCBwb2ludCBpbmRpY2F0b3IgKi99XG4gICAgICAgICAgICB7Y3VyclB0ICYmIGFjdGl2ZVRvb2wgPT09ICdEUkFXX1BJUEUnICYmIChcbiAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17Y3VyclB0fT5cbiAgICAgICAgICAgICAgICAgICAgPHNwaGVyZUdlb21ldHJ5IGFyZ3M9e1sxNV19IC8+XG4gICAgICAgICAgICAgICAgICAgIDxtZXNoQmFzaWNNYXRlcmlhbCBjb2xvcj1cIiMzYjgyZjZcIiAvPlxuICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICl9XG4gICAgICAgIDwvZ3JvdXA+XG4gICAgKTtcbn07XG5cbmltcG9ydCB7IGJyZWFrUGlwZUF0UG9pbnQsIGluc2VydFN1cHBvcnRBdFBpcGUsIGZpeDZtbUdhcHMgfSBmcm9tICcuLi8uLi9lbmdpbmUvR2FwRml4RW5naW5lJztcbmltcG9ydCB7IGF1dG9Bc3NpZ25QaXBlbGluZVJlZnMgfSBmcm9tICcuLi8uLi9lbmdpbmUvVG9wb2xvZ3lFbmdpbmUnO1xuXG4vLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbi8vIFNIQVJFRCBUT09MOiBNRUFTVVJFXG4vLyBUaGlzIHRvb2wgYWxzbyBleGlzdHMgaW4gc3JjL3VpL3RhYnMvQ2FudmFzVGFiLmpzeC5cbi8vIElmIG1vZGlmeWluZyBsb2dpYywgdXBkYXRlIEJPVEggZmlsZXMgYW5kIHJ1biBDaGVja3BvaW50IEYuXG4vLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbmNvbnN0IERyYXdDYW52YXNfTWVhc3VyZVRvb2wgPSAoeyBhY3RpdmVUb29sLCBhcHBTZXR0aW5ncyB9KSA9PiB7XG4gICAgY29uc3QgW21lYXN1cmVQdHMsIHNldE1lYXN1cmVQdHNdID0gdXNlU3RhdGUoW10pO1xuXG4gICAgLy8gQ2xlYXIgbWVhc3VyZSBwb2ludHMgd2hlbiB0b29sIGNoYW5nZXNcbiAgICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgICAgICBpZiAoYWN0aXZlVG9vbCAhPT0gJ01FQVNVUkUnKSBzZXRNZWFzdXJlUHRzKFtdKTtcbiAgICB9LCBbYWN0aXZlVG9vbF0pO1xuXG4gICAgaWYgKGFjdGl2ZVRvb2wgIT09ICdNRUFTVVJFJykgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBoYW5kbGVQb2ludGVyRG93biA9IChlKSA9PiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIGNvbnN0IHB0ID0gZS5wb2ludC5jbG9uZSgpO1xuICAgICAgICBzZXRNZWFzdXJlUHRzKHByZXYgPT4ge1xuICAgICAgICAgICAgaWYgKHByZXYubGVuZ3RoID49IDIpIHJldHVybiBbcHRdOyAvLyByZXNldCBvbiAzcmQgY2xpY2tcbiAgICAgICAgICAgIHJldHVybiBbLi4ucHJldiwgcHRdO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGdyb3VwPlxuICAgICAgICAgICAgPG1lc2ggb25Qb2ludGVyRG93bj17aGFuZGxlUG9pbnRlckRvd259IHJlbmRlck9yZGVyPXstMX0+XG4gICAgICAgICAgICAgICAgIDxwbGFuZUdlb21ldHJ5IGFyZ3M9e1syMDAwMDAsIDIwMDAwMF19IC8+XG4gICAgICAgICAgICAgICAgIDxtZXNoQmFzaWNNYXRlcmlhbCB2aXNpYmxlPXtmYWxzZX0gZGVwdGhXcml0ZT17ZmFsc2V9IHRyYW5zcGFyZW50IG9wYWNpdHk9ezB9IC8+XG4gICAgICAgICAgICA8L21lc2g+XG5cbiAgICAgICAgICAgIHttZWFzdXJlUHRzLmxlbmd0aCA+PSAxICYmIChcbiAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17bWVhc3VyZVB0c1swXX0+XG4gICAgICAgICAgICAgICAgICAgIDxzcGhlcmVHZW9tZXRyeSBhcmdzPXtbMjAsIDE2LCAxNl19IC8+XG4gICAgICAgICAgICAgICAgICAgIDxtZXNoQmFzaWNNYXRlcmlhbCBjb2xvcj17YXBwU2V0dGluZ3Muc2VsZWN0aW9uQ29sb3J9IC8+XG4gICAgICAgICAgICAgICAgPC9tZXNoPlxuICAgICAgICAgICAgKX1cblxuICAgICAgICAgICAge21lYXN1cmVQdHMubGVuZ3RoID09PSAyICYmIChcbiAgICAgICAgICAgICAgICA8PlxuICAgICAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17bWVhc3VyZVB0c1sxXX0+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3BoZXJlR2VvbWV0cnkgYXJncz17WzIwLCAxNiwgMTZdfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgPG1lc2hCYXNpY01hdGVyaWFsIGNvbG9yPXthcHBTZXR0aW5ncy5zZWxlY3Rpb25Db2xvcn0gLz5cbiAgICAgICAgICAgICAgICAgICAgPC9tZXNoPlxuICAgICAgICAgICAgICAgICAgICA8TGluZSBwb2ludHM9e1ttZWFzdXJlUHRzWzBdLCBtZWFzdXJlUHRzWzFdXX0gY29sb3I9e2FwcFNldHRpbmdzLnNlbGVjdGlvbkNvbG9yfSBsaW5lV2lkdGg9ezN9IC8+XG5cbiAgICAgICAgICAgICAgICAgICAgeygoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtaWQgPSBtZWFzdXJlUHRzWzBdLmNsb25lKCkubGVycChtZWFzdXJlUHRzWzFdLCAwLjUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlzdCA9IG1lYXN1cmVQdHNbMF0uZGlzdGFuY2VUbyhtZWFzdXJlUHRzWzFdKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1pZC55ICs9IDEwMDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZHggPSBNYXRoLmFicyhtZWFzdXJlUHRzWzBdLnggLSBtZWFzdXJlUHRzWzFdLngpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZHkgPSBNYXRoLmFicyhtZWFzdXJlUHRzWzBdLnkgLSBtZWFzdXJlUHRzWzFdLnkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZHogPSBNYXRoLmFicyhtZWFzdXJlUHRzWzBdLnogLSBtZWFzdXJlUHRzWzFdLnopO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Z3JvdXAgcG9zaXRpb249e21pZH0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXtbMCwgMCwgMF19PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHBsYW5lR2VvbWV0cnkgYXJncz17WzEwMDAsIDQwMF19IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaEJhc2ljTWF0ZXJpYWwgY29sb3I9XCIjMWUyOTNiXCIgc2lkZT17VEhSRUUuRG91YmxlU2lkZX0gb3BhY2l0eT17MC44fSB0cmFuc3BhcmVudCBkZXB0aFRlc3Q9e2ZhbHNlfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L21lc2g+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxUZXh0IHBvc2l0aW9uPXtbMCwgNTAsIDFdfSBjb2xvcj17YXBwU2V0dGluZ3Muc2VsZWN0aW9uQ29sb3J9IGZvbnRTaXplPXsxMDB9IGFuY2hvclg9XCJjZW50ZXJcIiBhbmNob3JZPVwibWlkZGxlXCIgb3V0bGluZVdpZHRoPXsyfSBvdXRsaW5lQ29sb3I9XCIjMGYxNzJhXCIgZGVwdGhUZXN0PXtmYWxzZX0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBEaXN0OiB7ZGlzdC50b0ZpeGVkKDEpfW1tXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvVGV4dD5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPFRleHQgcG9zaXRpb249e1swLCAtNTAsIDFdfSBjb2xvcj1cIiNjYmQ1ZTFcIiBmb250U2l6ZT17NjB9IGFuY2hvclg9XCJjZW50ZXJcIiBhbmNob3JZPVwibWlkZGxlXCIgb3V0bGluZVdpZHRoPXsyfSBvdXRsaW5lQ29sb3I9XCIjMGYxNzJhXCIgZGVwdGhUZXN0PXtmYWxzZX0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBYOntkeC50b0ZpeGVkKDEpfSBZOntkeS50b0ZpeGVkKDEpfSBaOntkei50b0ZpeGVkKDEpfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L1RleHQ+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9ncm91cD5cbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH0pKCl9XG4gICAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICApfVxuICAgICAgICA8L2dyb3VwPlxuICAgICk7XG59O1xuXG4vLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbi8vIFNIQVJFRCBUT09MOiBCUkVBSy9DVVRcbi8vIFRoaXMgdG9vbCBhbHNvIGV4aXN0cyBpbiBzcmMvdWkvdGFicy9DYW52YXNUYWIuanN4LlxuLy8gSWYgbW9kaWZ5aW5nIGxvZ2ljLCB1cGRhdGUgQk9USCBmaWxlcyBhbmQgcnVuIENoZWNrcG9pbnQgRi5cbi8vIOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxuY29uc3QgRHJhd0NhbnZhc19CcmVha1BpcGVMYXllciA9ICh7IGFjdGl2ZVRvb2wsIGRyYXduUGlwZXMsIGRjRGlzcGF0Y2gsIGFwcFNldHRpbmdzIH0pID0+IHtcbiAgICBjb25zdCBbaG92ZXJQb3MsIHNldEhvdmVyUG9zXSA9IHVzZVN0YXRlKG51bGwpO1xuXG4gICAgaWYgKGFjdGl2ZVRvb2wgIT09ICdCUkVBSycpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgaGFuZGxlUG9pbnRlck1vdmUgPSAoZSkgPT4ge1xuICAgICAgICBpZiAoZS5wb2ludCkgc2V0SG92ZXJQb3MoZS5wb2ludCk7XG4gICAgfTtcblxuICAgIGNvbnN0IGhhbmRsZVBvaW50ZXJPdXQgPSAoKSA9PiB7XG4gICAgICAgIHNldEhvdmVyUG9zKG51bGwpO1xuICAgIH07XG5cbiAgICBjb25zdCBoYW5kbGVQb2ludGVyRG93biA9IChlLCBwaXBlSW5kZXgsIHBpcGVSb3cpID0+IHtcbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcblxuICAgICAgICBpZiAocGlwZVJvdykge1xuICAgICAgICAgICAgY29uc3QgYnJlYWtQdCA9IGUucG9pbnQuY2xvbmUoKTtcbiAgICAgICAgICAgIGNvbnN0IGJyZWFrUmVzdWx0cyA9IGJyZWFrUGlwZUF0UG9pbnQocGlwZVJvdywgYnJlYWtQdCk7XG5cbiAgICAgICAgICAgIGlmIChicmVha1Jlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBbcm93QSwgcm93Ql0gPSBicmVha1Jlc3VsdHM7XG5cbiAgICAgICAgICAgICAgICAvLyBSZW1vdmUgdGhlIG9sZCBwaXBlIGFuZCBhZGQgdGhlIHR3byBuZXcgc2VnbWVudHNcbiAgICAgICAgICAgICAgICBjb25zdCB1cGRhdGVkUGlwZXMgPSBbLi4uZHJhd25QaXBlc107XG4gICAgICAgICAgICAgICAgdXBkYXRlZFBpcGVzLnNwbGljZShwaXBlSW5kZXgsIDEsIHJvd0EsIHJvd0IpO1xuXG4gICAgICAgICAgICAgICAgZGNEaXNwYXRjaCh7IHR5cGU6ICdTRVRfQUxMX0NPTVBPTkVOVFMnLCBwYXlsb2FkOiB1cGRhdGVkUGlwZXMgfSk7XG4gICAgICAgICAgICAgICAgZGNEaXNwYXRjaCh7IHR5cGU6ICdTRVRfVE9PTCcsIHBheWxvYWQ6ICdWSUVXJyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8Z3JvdXA+XG4gICAgICAgICAgICAgPGdyb3VwIG9uUG9pbnRlck1vdmU9e2hhbmRsZVBvaW50ZXJNb3ZlfSBvblBvaW50ZXJPdXQ9e2hhbmRsZVBvaW50ZXJPdXR9PlxuICAgICAgICAgICAgICAgIHtkcmF3blBpcGVzLm1hcCgocGlwZSwgaSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoKHBpcGUudHlwZXx8JycpLnRvVXBwZXJDYXNlKCkgIT09ICdQSVBFJyB8fCAhcGlwZS5lcDEgfHwgIXBpcGUuZXAyKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdjEgPSBuZXcgVEhSRUUuVmVjdG9yMyhwaXBlLmVwMS54LCBwaXBlLmVwMS55LCBwaXBlLmVwMS56KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdjIgPSBuZXcgVEhSRUUuVmVjdG9yMyhwaXBlLmVwMi54LCBwaXBlLmVwMi55LCBwaXBlLmVwMi56KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWlkID0gdjEuY2xvbmUoKS5sZXJwKHYyLCAwLjUpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkaXN0ID0gdjEuZGlzdGFuY2VUbyh2Mik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkaXN0ID09PSAwKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlyID0gdjIuY2xvbmUoKS5zdWIodjEpLm5vcm1hbGl6ZSgpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBxdWF0ID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oKS5zZXRGcm9tVW5pdFZlY3RvcnMobmV3IFRIUkVFLlZlY3RvcjMoMCwxLDApLCBkaXIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByID0gcGlwZS5ib3JlID8gcGlwZS5ib3JlIC8gMiA6IDU7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgICAgICAgICAgICA8bWVzaCBrZXk9e2BicC0ke2l9YH0gcG9zaXRpb249e21pZH0gcXVhdGVybmlvbj17cXVhdH0gb25Qb2ludGVyRG93bj17KGUpID0+IGhhbmRsZVBvaW50ZXJEb3duKGUsIGksIHBpcGUpfT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Y3lsaW5kZXJHZW9tZXRyeSBhcmdzPXtbcioxLjUsIHIqMS41LCBkaXN0LCA4XX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaEJhc2ljTWF0ZXJpYWwgY29sb3I9XCJyZWRcIiB0cmFuc3BhcmVudCBvcGFjaXR5PXswfSBkZXB0aFdyaXRlPXtmYWxzZX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9KX1cbiAgICAgICAgICAgICA8L2dyb3VwPlxuXG4gICAgICAgICAgICAge2hvdmVyUG9zICYmIChcbiAgICAgICAgICAgICAgICAgPG1lc2ggcG9zaXRpb249e2hvdmVyUG9zfT5cbiAgICAgICAgICAgICAgICAgICAgIDxzcGhlcmVHZW9tZXRyeSBhcmdzPXtbMjAsIDE2LCAxNl19IC8+XG4gICAgICAgICAgICAgICAgICAgICA8bWVzaEJhc2ljTWF0ZXJpYWwgY29sb3I9e2FwcFNldHRpbmdzLnNlbGVjdGlvbkNvbG9yfSB0cmFuc3BhcmVudCBvcGFjaXR5PXswLjZ9IGRlcHRoVGVzdD17ZmFsc2V9IC8+XG4gICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICApfVxuICAgICAgICA8L2dyb3VwPlxuICAgICk7XG59O1xuXG4vLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbi8vIENPTlZFUlNJT04gVE9PTFMgKEJFTkQgLyBURUUpXG4vLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbmNvbnN0IERyYXdDYW52YXNfQ29udmVyc2lvblRvb2xzID0gKHsgYWN0aXZlVG9vbCwgZHJhd25QaXBlcywgZGNEaXNwYXRjaCwgYXBwU2V0dGluZ3MgfSkgPT4ge1xuICAgIGNvbnN0IFtzZWxlY3RlZEluZGljZXMsIHNldFNlbGVjdGVkSW5kaWNlc10gPSB1c2VTdGF0ZShbXSk7XG5cbiAgICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgICAgICBpZiAoYWN0aXZlVG9vbCAhPT0gJ0NPTlZFUlRfQkVORCcgJiYgYWN0aXZlVG9vbCAhPT0gJ0NPTlZFUlRfVEVFJykge1xuICAgICAgICAgICAgc2V0U2VsZWN0ZWRJbmRpY2VzKFtdKTtcbiAgICAgICAgfVxuICAgIH0sIFthY3RpdmVUb29sXSk7XG5cbiAgICBpZiAoYWN0aXZlVG9vbCAhPT0gJ0NPTlZFUlRfQkVORCcgJiYgYWN0aXZlVG9vbCAhPT0gJ0NPTlZFUlRfVEVFJykgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBoYW5kbGVQb2ludGVyRG93biA9IChlLCBpbmRleCkgPT4ge1xuICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsZXQgbmV3U2VsID0gWy4uLnNlbGVjdGVkSW5kaWNlc107XG4gICAgICAgICAgICBpZiAobmV3U2VsLmluY2x1ZGVzKGluZGV4KSkge1xuICAgICAgICAgICAgICAgIG5ld1NlbCA9IG5ld1NlbC5maWx0ZXIoaSA9PiBpICE9PSBpbmRleCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG5ld1NlbC5wdXNoKGluZGV4KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc2V0U2VsZWN0ZWRJbmRpY2VzKG5ld1NlbCk7XG5cbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHdlIG1lZXQgcmVxdWlyZW1lbnRzXG4gICAgICAgICAgICBpZiAoYWN0aXZlVG9vbCA9PT0gJ0NPTlZFUlRfQkVORCcgJiYgbmV3U2VsLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHAxID0gZHJhd25QaXBlc1tuZXdTZWxbMF1dO1xuICAgICAgICAgICAgICAgIGNvbnN0IHAyID0gZHJhd25QaXBlc1tuZXdTZWxbMV1dO1xuXG4gICAgICAgICAgICAgICAgLy8gU2ltcGxlIGludGVyc2VjdGlvbiBhc3N1bWVkIGF0IGVuZHBvaW50cyBmb3IgYmVuZFxuICAgICAgICAgICAgICAgIGNvbnN0IHB0cyA9IFtcbiAgICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMocDEuZXAxLngsIHAxLmVwMS55LCBwMS5lcDEueiksXG4gICAgICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKHAxLmVwMi54LCBwMS5lcDIueSwgcDEuZXAyLnopLFxuICAgICAgICAgICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMyhwMi5lcDEueCwgcDIuZXAxLnksIHAyLmVwMS56KSxcbiAgICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMocDIuZXAyLngsIHAyLmVwMi55LCBwMi5lcDIueilcbiAgICAgICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBsZXQgY3AgPSBudWxsO1xuICAgICAgICAgICAgbGV0IGQxID0gbnVsbCwgZDIgPSBudWxsO1xuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDI7IGkrKykge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSAyOyBqIDwgNDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwdHNbaV0uZGlzdGFuY2VUbyhwdHNbal0pIDwgMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3AgPSBwdHNbaV07XG4gICAgICAgICAgICAgICAgICAgICAgICBkMSA9IHB0c1sxLWldLmNsb25lKCkuc3ViKGNwKS5ub3JtYWxpemUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGQyID0gcHRzWzUtal0uY2xvbmUoKS5zdWIoY3ApLm5vcm1hbGl6ZSgpOyAvLyA1LWogaXMgdGhlIG90aGVyIGVuZCBvZiBwMiAoaj0yIC0+IDMsIGo9MyAtPiAyKVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjcCAmJiBkMSAmJiBkMikge1xuICAgICAgICAgICAgICAgIC8vIFRyaW0gbG9naWMgYW5kIGJlbmQgZ2VuZXJhdGlvblxuICAgICAgICAgICAgICAgIGNvbnN0IGRlZmF1bHRCb3JlID0gcDEuYm9yZSB8fCAxMDA7XG4gICAgICAgICAgICAgICAgY29uc3QgdHJpbURpc3QgPSBkZWZhdWx0Qm9yZSAqIDEuNTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGJlbmRFcDEgPSBjcC5jbG9uZSgpLmFkZChkMS5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKHRyaW1EaXN0KSk7XG4gICAgICAgICAgICAgICAgY29uc3QgYmVuZEVwMiA9IGNwLmNsb25lKCkuYWRkKGQyLmNsb25lKCkubXVsdGlwbHlTY2FsYXIodHJpbURpc3QpKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IG5ld0JlbmQgPSB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdCRU5EJyxcbiAgICAgICAgICAgICAgICAgICAgYm9yZTogZGVmYXVsdEJvcmUsXG4gICAgICAgICAgICAgICAgICAgIGVwMTogeyB4OiBiZW5kRXAxLngsIHk6IGJlbmRFcDEueSwgejogYmVuZEVwMS56IH0sXG4gICAgICAgICAgICAgICAgICAgIGVwMjogeyB4OiBiZW5kRXAyLngsIHk6IGJlbmRFcDIueSwgejogYmVuZEVwMi56IH1cbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgY29uc3QgdXBkYXRlZFBpcGVzID0gWy4uLmRyYXduUGlwZXNdO1xuXG4gICAgICAgICAgICAgICAgLy8gdXBkYXRlIHBpcGUgMVxuICAgICAgICAgICAgICAgIGNvbnN0IG5wMSA9IHsgLi4ucDEgfTtcbiAgICAgICAgICAgICAgICBpZiAobmV3IFRIUkVFLlZlY3RvcjMobnAxLmVwMS54LCBucDEuZXAxLnksIG5wMS5lcDEueikuZGlzdGFuY2VUbyhjcCkgPCAxKSBucDEuZXAxID0geyB4OiBiZW5kRXAxLngsIHk6IGJlbmRFcDEueSwgejogYmVuZEVwMS56IH07XG4gICAgICAgICAgICAgICAgZWxzZSBucDEuZXAyID0geyB4OiBiZW5kRXAxLngsIHk6IGJlbmRFcDEueSwgejogYmVuZEVwMS56IH07XG4gICAgICAgICAgICAgICAgdXBkYXRlZFBpcGVzW25ld1NlbFswXV0gPSBucDE7XG5cbiAgICAgICAgICAgICAgICAvLyB1cGRhdGUgcGlwZSAyXG4gICAgICAgICAgICAgICAgY29uc3QgbnAyID0geyAuLi5wMiB9O1xuICAgICAgICAgICAgICAgIGlmIChuZXcgVEhSRUUuVmVjdG9yMyhucDIuZXAxLngsIG5wMi5lcDEueSwgbnAyLmVwMS56KS5kaXN0YW5jZVRvKGNwKSA8IDEpIG5wMi5lcDEgPSB7IHg6IGJlbmRFcDIueCwgeTogYmVuZEVwMi55LCB6OiBiZW5kRXAyLnogfTtcbiAgICAgICAgICAgICAgICBlbHNlIG5wMi5lcDIgPSB7IHg6IGJlbmRFcDIueCwgeTogYmVuZEVwMi55LCB6OiBiZW5kRXAyLnogfTtcbiAgICAgICAgICAgICAgICB1cGRhdGVkUGlwZXNbbmV3U2VsWzFdXSA9IG5wMjtcblxuICAgICAgICAgICAgICAgIHVwZGF0ZWRQaXBlcy5wdXNoKG5ld0JlbmQpO1xuICAgICAgICAgICAgICAgIGRjRGlzcGF0Y2goeyB0eXBlOiAnU0VUX0FMTF9DT01QT05FTlRTJywgcGF5bG9hZDogdXBkYXRlZFBpcGVzIH0pO1xuICAgICAgICAgICAgICAgIGRjRGlzcGF0Y2goeyB0eXBlOiAnU0VUX1RPT0wnLCBwYXlsb2FkOiAnVklFVycgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGFsZXJ0KCdQaXBlcyBtdXN0IHNoYXJlIGFuIGVuZHBvaW50IHRvIGNvbnZlcnQgdG8gQmVuZC4nKTtcbiAgICAgICAgICAgICAgICBzZXRTZWxlY3RlZEluZGljZXMoW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGFjdGl2ZVRvb2wgPT09ICdDT05WRVJUX1RFRScgJiYgbmV3U2VsLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgICAgLy8gTmVlZCAzIHBpcGVzIHRoYXQgc2hhcmUgYSBjZW50ZXIgcG9pbnRcbiAgICAgICAgICAgIGNvbnN0IHBpcGVzID0gbmV3U2VsLm1hcChpID0+IGRyYXduUGlwZXNbaV0pO1xuICAgICAgICAgICAgY29uc3QgcHRzID0gcGlwZXMuZmxhdE1hcChwID0+IFtcbiAgICAgICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMyhwLmVwMS54LCBwLmVwMS55LCBwLmVwMS56KSxcbiAgICAgICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMyhwLmVwMi54LCBwLmVwMi55LCBwLmVwMi56KVxuICAgICAgICAgICAgXSk7XG5cbiAgICAgICAgICAgIC8vIEZpbmQgQ1AgKHRoZSBwb2ludCB0aGF0IGFwcGVhcnMgYXQgbGVhc3QgMyB0aW1lcylcbiAgICAgICAgICAgIGxldCBjcCA9IG51bGw7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHB0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGxldCBtYXRjaGVzID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IHB0cy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAocHRzW2ldLmRpc3RhbmNlVG8ocHRzW2pdKSA8IDEpIG1hdGNoZXMrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoZXMgPj0gMykge1xuICAgICAgICAgICAgICAgICAgICBjcCA9IHB0c1tpXTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoY3ApIHtcbiAgICAgICAgICAgICAgICAvLyBGaW5kIG1haW4gcnVuIChjb2xsaW5lYXIgcGlwZXMpXG4gICAgICAgICAgICAgICAgbGV0IG1haW4xID0gbnVsbCwgbWFpbjIgPSBudWxsLCBicmFuY2ggPSBudWxsO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRpcnMgPSBwaXBlcy5tYXAocCA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVwMSA9IG5ldyBUSFJFRS5WZWN0b3IzKHAuZXAxLngsIHAuZXAxLnksIHAuZXAxLnopO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlcDIgPSBuZXcgVEhSRUUuVmVjdG9yMyhwLmVwMi54LCBwLmVwMi55LCBwLmVwMi56KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGVwMS5kaXN0YW5jZVRvKGNwKSA8IDEgPyBlcDIuY2xvbmUoKS5zdWIoY3ApLm5vcm1hbGl6ZSgpIDogZXAxLmNsb25lKCkuc3ViKGNwKS5ub3JtYWxpemUoKTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSBpKzE7IGogPCAzOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChNYXRoLmFicyhkaXJzW2ldLmRvdChkaXJzW2pdKSArIDEpIDwgMC4wNSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1haW4xID0geyBpZHg6IG5ld1NlbFtpXSwgcGlwZTogcGlwZXNbaV0sIGRpcjogZGlyc1tpXSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1haW4yID0geyBpZHg6IG5ld1NlbFtqXSwgcGlwZTogcGlwZXNbal0sIGRpcjogZGlyc1tqXSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJyYW5jaElkeCA9IFswLDEsMl0uZmluZCh4ID0+IHggIT09IGkgJiYgeCAhPT0gaik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJhbmNoID0geyBpZHg6IG5ld1NlbFticmFuY2hJZHhdLCBwaXBlOiBwaXBlc1ticmFuY2hJZHhdLCBkaXI6IGRpcnNbYnJhbmNoSWR4XSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYWluMSkgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKG1haW4xICYmIG1haW4yICYmIGJyYW5jaCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkZWZhdWx0Qm9yZSA9IG1haW4xLnBpcGUuYm9yZSB8fCAxMDA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJ1blRyaW0gPSBkZWZhdWx0Qm9yZTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYnJhbmNoVHJpbSA9IGRlZmF1bHRCb3JlO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRFcDEgPSBjcC5jbG9uZSgpLmFkZChtYWluMS5kaXIuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihydW5UcmltKSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRFcDIgPSBjcC5jbG9uZSgpLmFkZChtYWluMi5kaXIuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihydW5UcmltKSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRCcCA9IGNwLmNsb25lKCkuYWRkKGJyYW5jaC5kaXIuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihicmFuY2hUcmltKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV3VGVlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ1RFRScsXG4gICAgICAgICAgICAgICAgICAgICAgICBib3JlOiBkZWZhdWx0Qm9yZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyYW5jaEJvcmU6IGJyYW5jaC5waXBlLmJvcmUgfHwgZGVmYXVsdEJvcmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcDE6IHsgeDogdEVwMS54LCB5OiB0RXAxLnksIHo6IHRFcDEueiB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgZXAyOiB7IHg6IHRFcDIueCwgeTogdEVwMi55LCB6OiB0RXAyLnogfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNwOiB7IHg6IGNwLngsIHk6IGNwLnksIHo6IGNwLnogfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGJwOiB7IHg6IHRCcC54LCB5OiB0QnAueSwgejogdEJwLnogfVxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHVwZGF0ZWRQaXBlcyA9IFsuLi5kcmF3blBpcGVzXTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBUcmltIHBpcGVzXG4gICAgICAgICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgcERhdGE6IG1haW4xLCBwdDogdEVwMSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBwRGF0YTogbWFpbjIsIHB0OiB0RXAyIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7IHBEYXRhOiBicmFuY2gsIHB0OiB0QnAgfVxuICAgICAgICAgICAgICAgICAgICBdLmZvckVhY2goKHsgcERhdGEsIHB0IH0pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5wID0geyAuLi5wRGF0YS5waXBlIH07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobmV3IFRIUkVFLlZlY3RvcjMobnAuZXAxLngsIG5wLmVwMS55LCBucC5lcDEueikuZGlzdGFuY2VUbyhjcCkgPCAxKSBucC5lcDEgPSB7IHg6IHB0LngsIHk6IHB0LnksIHo6IHB0LnogfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgbnAuZXAyID0geyB4OiBwdC54LCB5OiBwdC55LCB6OiBwdC56IH07XG4gICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVkUGlwZXNbcERhdGEuaWR4XSA9IG5wO1xuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICB1cGRhdGVkUGlwZXMucHVzaChuZXdUZWUpO1xuICAgICAgICAgICAgICAgICAgICBkY0Rpc3BhdGNoKHsgdHlwZTogJ1NFVF9BTExfQ09NUE9ORU5UUycsIHBheWxvYWQ6IHVwZGF0ZWRQaXBlcyB9KTtcbiAgICAgICAgICAgICAgICAgICAgZGNEaXNwYXRjaCh7IHR5cGU6ICdTRVRfVE9PTCcsIHBheWxvYWQ6ICdWSUVXJyB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBhbGVydCgnQ291bGQgbm90IGZpbmQgYSB2YWxpZCBURUUgY29uZmlndXJhdGlvbi4gTWFrZSBzdXJlIHR3byBwaXBlcyBmb3JtIGEgc3RyYWlnaHQgbGluZSBhbmQgdGhlIHRoaXJkIGlzIHRoZSBicmFuY2guJyk7XG4gICAgICAgICAgICAgICAgICAgIHNldFNlbGVjdGVkSW5kaWNlcyhbXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhbGVydCgnUGlwZXMgbXVzdCBhbGwgc2hhcmUgYSBjb21tb24gY2VudGVyIHBvaW50LicpO1xuICAgICAgICAgICAgICAgIHNldFNlbGVjdGVkSW5kaWNlcyhbXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBkYmcuZXJyb3IoJ0NPTlZFUlRfVE9PTCcsICdGYXRhbCBlcnJvciBkdXJpbmcgYmVuZC90ZWUgY29udmVyc2lvbicsIHsgZXJyb3I6IGVyci5tZXNzYWdlLCBpbmRleCB9KTtcbiAgICAgICAgICAgIHNldFNlbGVjdGVkSW5kaWNlcyhbXSk7XG4gICAgICAgICAgICBkY0Rpc3BhdGNoKHsgdHlwZTogJ1NFVF9UT09MJywgcGF5bG9hZDogJ1ZJRVcnIH0pO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxncm91cD5cbiAgICAgICAgICAgIHtkcmF3blBpcGVzLm1hcCgocGlwZSwgaSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICgocGlwZS50eXBlfHwnJykudG9VcHBlckNhc2UoKSAhPT0gJ1BJUEUnIHx8ICFwaXBlLmVwMSB8fCAhcGlwZS5lcDIpIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgIGNvbnN0IHYxID0gbmV3IFRIUkVFLlZlY3RvcjMocGlwZS5lcDEueCwgcGlwZS5lcDEueSwgcGlwZS5lcDEueik7XG4gICAgICAgICAgICAgICAgY29uc3QgdjIgPSBuZXcgVEhSRUUuVmVjdG9yMyhwaXBlLmVwMi54LCBwaXBlLmVwMi55LCBwaXBlLmVwMi56KTtcbiAgICAgICAgICAgICAgICBjb25zdCBtaWQgPSB2MS5jbG9uZSgpLmxlcnAodjIsIDAuNSk7XG4gICAgICAgICAgICAgICAgY29uc3QgZGlzdCA9IHYxLmRpc3RhbmNlVG8odjIpO1xuICAgICAgICAgICAgICAgIGlmIChkaXN0ID09PSAwKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCBkaXIgPSB2Mi5jbG9uZSgpLnN1Yih2MSkubm9ybWFsaXplKCk7XG4gICAgICAgICAgICAgICAgY29uc3QgcXVhdCA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCkuc2V0RnJvbVVuaXRWZWN0b3JzKG5ldyBUSFJFRS5WZWN0b3IzKDAsMSwwKSwgZGlyKTtcbiAgICAgICAgICAgICAgICBjb25zdCByID0gcGlwZS5ib3JlID8gcGlwZS5ib3JlIC8gMiA6IDU7XG4gICAgICAgICAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHNlbGVjdGVkSW5kaWNlcy5pbmNsdWRlcyhpKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgICAgICAgIDxtZXNoIGtleT17YGNvbnYtJHtpfWB9IHBvc2l0aW9uPXttaWR9IHF1YXRlcm5pb249e3F1YXR9IG9uUG9pbnRlckRvd249eyhlKSA9PiBoYW5kbGVQb2ludGVyRG93bihlLCBpKX0+XG4gICAgICAgICAgICAgICAgICAgICAgICA8Y3lsaW5kZXJHZW9tZXRyeSBhcmdzPXtbcioxLjUsIHIqMS41LCBkaXN0LCA4XX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxtZXNoQmFzaWNNYXRlcmlhbCBjb2xvcj17aXNTZWxlY3RlZCA/IFwiI2E4NTVmN1wiIDogXCJ3aGl0ZVwifSB0cmFuc3BhcmVudCBvcGFjaXR5PXtpc1NlbGVjdGVkID8gMC44IDogMC4xfSBkZXB0aFdyaXRlPXtmYWxzZX0gLz5cbiAgICAgICAgICAgICAgICAgICAgPC9tZXNoPlxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9KX1cbiAgICAgICAgPC9ncm91cD5cbiAgICApO1xufTtcblxuXG4vLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbi8vIFNIQVJFRCBUT09MOiBDT05ORUNUICYgU1RSRVRDSFxuLy8gVGhpcyB0b29sIGFsc28gZXhpc3RzIGluIHNyYy91aS90YWJzL0NhbnZhc1RhYi5qc3guXG4vLyBJZiBtb2RpZnlpbmcgbG9naWMsIHVwZGF0ZSBCT1RIIGZpbGVzIGFuZCBydW4gQ2hlY2twb2ludCBGLlxuLy8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXG5jb25zdCBEcmF3Q2FudmFzX0VuZHBvaW50U25hcExheWVyID0gKHsgYWN0aXZlVG9vbCwgZHJhd25QaXBlcywgZGNEaXNwYXRjaCwgYXBwU2V0dGluZ3MgfSkgPT4ge1xuICAgIGNvbnN0IFtjb25uZWN0RHJhZnQsIHNldENvbm5lY3REcmFmdF0gPSB1c2VTdGF0ZShudWxsKTtcbiAgICBjb25zdCBbY3Vyc29yUG9zLCBzZXRDdXJzb3JQb3NdID0gdXNlU3RhdGUobmV3IFRIUkVFLlZlY3RvcjMoKSk7XG5cbiAgICBpZiAoYWN0aXZlVG9vbCAhPT0gJ0NPTk5FQ1QnICYmIGFjdGl2ZVRvb2wgIT09ICdTVFJFVENIJykgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBzbmFwUmFkaXVzID0gNTA7XG5cbiAgICBjb25zdCBoYW5kbGVQb2ludGVyTW92ZSA9IChlKSA9PiB7XG4gICAgICAgIGxldCBwdCA9IGUucG9pbnQuY2xvbmUoKTtcblxuICAgICAgICBpZiAoY29ubmVjdERyYWZ0KSB7XG4gICAgICAgICAgICAvLyBCYXNpYyBvcnRobyBsb2NraW5nIGZvciBkcmFmdCBjb25uZWN0aW9uXG4gICAgICAgICAgICBjb25zdCByYXdEZWx0YSA9IHB0LmNsb25lKCkuc3ViKGNvbm5lY3REcmFmdC5mcm9tUG9zaXRpb24pO1xuICAgICAgICAgICAgY29uc3QgYWJzWCA9IE1hdGguYWJzKHJhd0RlbHRhLngpO1xuICAgICAgICAgICAgY29uc3QgYWJzWSA9IE1hdGguYWJzKHJhd0RlbHRhLnkpO1xuICAgICAgICAgICAgY29uc3QgYWJzWiA9IE1hdGguYWJzKHJhd0RlbHRhLnopO1xuICAgICAgICAgICAgaWYgKGFic1ggPj0gYWJzWSAmJiBhYnNYID49IGFic1opIHsgcmF3RGVsdGEueSA9IDA7IHJhd0RlbHRhLnogPSAwOyB9XG4gICAgICAgICAgICBlbHNlIGlmIChhYnNZID49IGFic1ggJiYgYWJzWSA+PSBhYnNaKSB7IHJhd0RlbHRhLnggPSAwOyByYXdEZWx0YS56ID0gMDsgfVxuICAgICAgICAgICAgZWxzZSB7IHJhd0RlbHRhLnggPSAwOyByYXdEZWx0YS55ID0gMDsgfVxuICAgICAgICAgICAgcHQgPSBjb25uZWN0RHJhZnQuZnJvbVBvc2l0aW9uLmNsb25lKCkuYWRkKHJhd0RlbHRhKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHNldEN1cnNvclBvcyhwdCk7XG4gICAgfTtcblxuICAgIGNvbnN0IGhhbmRsZVBvaW50ZXJVcCA9IChlKSA9PiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cbiAgICAgICAgbGV0IG5lYXJlc3QgPSBudWxsO1xuICAgICAgICBsZXQgbWluRGlzdCA9IHNuYXBSYWRpdXM7XG5cbiAgICAgICAgZHJhd25QaXBlcy5mb3JFYWNoKChyb3csIGkpID0+IHtcbiAgICAgICAgICAgIFsnZXAxJywgJ2VwMiddLmZvckVhY2goZXBLZXkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVwID0gcm93W2VwS2V5XTtcbiAgICAgICAgICAgICAgICBpZiAoZXApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHQgPSBuZXcgVEhSRUUuVmVjdG9yMyhwYXJzZUZsb2F0KGVwLngpLCBwYXJzZUZsb2F0KGVwLnkpLCBwYXJzZUZsb2F0KGVwLnopKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZCA9IHB0LmRpc3RhbmNlVG8oZS5wb2ludCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkIDwgbWluRGlzdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWluRGlzdCA9IGQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZWFyZXN0ID0geyByb3dJbmRleDogaSwgZXBLZXksIHBvc2l0aW9uOiBwdCB9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmICghY29ubmVjdERyYWZ0KSB7XG4gICAgICAgICAgICBpZiAobmVhcmVzdCkge1xuICAgICAgICAgICAgICAgIHNldENvbm5lY3REcmFmdCh7IGZyb21Sb3dJbmRleDogbmVhcmVzdC5yb3dJbmRleCwgZnJvbUVQOiBuZWFyZXN0LmVwS2V5LCBmcm9tUG9zaXRpb246IG5lYXJlc3QucG9zaXRpb24gfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobmVhcmVzdCAmJiAobmVhcmVzdC5yb3dJbmRleCAhPT0gY29ubmVjdERyYWZ0LmZyb21Sb3dJbmRleCB8fCBuZWFyZXN0LmVwS2V5ICE9PSBjb25uZWN0RHJhZnQuZnJvbUVQKSkge1xuICAgICAgICAgICAgY29uc3Qgc291cmNlUm93ID0gZHJhd25QaXBlc1tjb25uZWN0RHJhZnQuZnJvbVJvd0luZGV4XTtcbiAgICAgICAgICAgIGlmIChzb3VyY2VSb3cpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRQb3MgPSBuZWFyZXN0LnBvc2l0aW9uO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZVBvcyA9IGNvbm5lY3REcmFmdC5mcm9tUG9zaXRpb247XG5cbiAgICAgICAgICAgICAgICBpZiAoYWN0aXZlVG9vbCA9PT0gJ1NUUkVUQ0gnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHVwZGF0ZWRQaXBlcyA9IFsuLi5kcmF3blBpcGVzXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdXBkYXRlZFJvdyA9IHsgLi4udXBkYXRlZFBpcGVzW2Nvbm5lY3REcmFmdC5mcm9tUm93SW5kZXhdIH07XG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZWRSb3dbY29ubmVjdERyYWZ0LmZyb21FUF0gPSB7IHg6IHRhcmdldFBvcy54LCB5OiB0YXJnZXRQb3MueSwgejogdGFyZ2V0UG9zLnogfTtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlZFBpcGVzW2Nvbm5lY3REcmFmdC5mcm9tUm93SW5kZXhdID0gdXBkYXRlZFJvdztcbiAgICAgICAgICAgICAgICAgICAgZGNEaXNwYXRjaCh7IHR5cGU6ICdTRVRfQUxMX0NPTVBPTkVOVFMnLCBwYXlsb2FkOiB1cGRhdGVkUGlwZXMgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV3QnJpZGdlUGlwZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdQSVBFJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVwMTogeyB4OiBzb3VyY2VQb3MueCwgeTogc291cmNlUG9zLnksIHo6IHNvdXJjZVBvcy56IH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBlcDI6IHsgeDogdGFyZ2V0UG9zLngsIHk6IHRhcmdldFBvcy55LCB6OiB0YXJnZXRQb3MueiB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgYm9yZTogc291cmNlUm93LmJvcmUgfHwgMTAwLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB1cGRhdGVkUGlwZXMgPSBbLi4uZHJhd25QaXBlc107XG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZWRQaXBlcy5zcGxpY2UoY29ubmVjdERyYWZ0LmZyb21Sb3dJbmRleCArIDEsIDAsIG5ld0JyaWRnZVBpcGUpO1xuICAgICAgICAgICAgICAgICAgICBkY0Rpc3BhdGNoKHsgdHlwZTogJ1NFVF9BTExfQ09NUE9ORU5UUycsIHBheWxvYWQ6IHVwZGF0ZWRQaXBlcyB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzZXRDb25uZWN0RHJhZnQobnVsbCk7XG4gICAgICAgIGRjRGlzcGF0Y2goeyB0eXBlOiAnU0VUX1RPT0wnLCBwYXlsb2FkOiAnVklFVycgfSk7XG4gICAgfTtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxncm91cD5cbiAgICAgICAgICAgIDxtZXNoXG4gICAgICAgICAgICAgICAgc2NhbGU9ezEwMDAwMH1cbiAgICAgICAgICAgICAgICByb3RhdGlvbj17Wy1NYXRoLlBJIC8gMiwgMCwgMF19XG4gICAgICAgICAgICAgICAgb25Qb2ludGVyTW92ZT17aGFuZGxlUG9pbnRlck1vdmV9XG4gICAgICAgICAgICAgICAgb25Qb2ludGVyVXA9e2hhbmRsZVBvaW50ZXJVcH1cbiAgICAgICAgICAgICAgICByZW5kZXJPcmRlcj17LTF9XG4gICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgPHBsYW5lR2VvbWV0cnkgLz5cbiAgICAgICAgICAgICAgICA8bWVzaEJhc2ljTWF0ZXJpYWwgdHJhbnNwYXJlbnQgb3BhY2l0eT17MH0gZGVwdGhXcml0ZT17ZmFsc2V9IC8+XG4gICAgICAgICAgICA8L21lc2g+XG5cbiAgICAgICAgICAgIHtkcmF3blBpcGVzLm1hcCgocm93LCBpKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHRzID0gW107XG4gICAgICAgICAgICAgICAgaWYgKHJvdy5lcDEpIHB0cy5wdXNoKG5ldyBUSFJFRS5WZWN0b3IzKHBhcnNlRmxvYXQocm93LmVwMS54KSwgcGFyc2VGbG9hdChyb3cuZXAxLnkpLCBwYXJzZUZsb2F0KHJvdy5lcDEueikpKTtcbiAgICAgICAgICAgICAgICBpZiAocm93LmVwMikgcHRzLnB1c2gobmV3IFRIUkVFLlZlY3RvcjMocGFyc2VGbG9hdChyb3cuZXAyLngpLCBwYXJzZUZsb2F0KHJvdy5lcDIueSksIHBhcnNlRmxvYXQocm93LmVwMi56KSkpO1xuICAgICAgICAgICAgICAgIHJldHVybiBwdHMubWFwKChwdCwgcHRJZHgpID0+IChcbiAgICAgICAgICAgICAgICAgICAgPG1lc2gga2V5PXtgc25hcC0ke2l9LSR7cHRJZHh9YH0gcG9zaXRpb249e3B0fSByZW5kZXJPcmRlcj17OTk5fT5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGhlcmVHZW9tZXRyeSBhcmdzPXtbMjAsIDE2LCAxNl19IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICA8bWVzaEJhc2ljTWF0ZXJpYWwgY29sb3I9e2FwcFNldHRpbmdzLnNlbGVjdGlvbkNvbG9yfSB0cmFuc3BhcmVudCBvcGFjaXR5PXswLjV9IGRlcHRoVGVzdD17ZmFsc2V9IC8+XG4gICAgICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgICApKTtcbiAgICAgICAgICAgIH0pfVxuXG4gICAgICAgICAgICB7Y29ubmVjdERyYWZ0ICYmICgoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RhcnQgPSBjb25uZWN0RHJhZnQuZnJvbVBvc2l0aW9uO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuZCA9IGN1cnNvclBvcztcbiAgICAgICAgICAgICAgICBjb25zdCB2ZWMgPSBuZXcgVEhSRUUuVmVjdG9yMygpLnN1YlZlY3RvcnMoZW5kLCBzdGFydCk7XG4gICAgICAgICAgICAgICAgY29uc3QgbGVuID0gdmVjLmxlbmd0aCgpO1xuICAgICAgICAgICAgICAgIGlmIChsZW4gPCAwLjEpIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1pZCA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuYWRkVmVjdG9ycyhzdGFydCwgZW5kKS5tdWx0aXBseVNjYWxhcigwLjUpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHEgPSBuZXcgVEhSRUUuUXVhdGVybmlvbigpLnNldEZyb21Vbml0VmVjdG9ycyhuZXcgVEhSRUUuVmVjdG9yMygwLCAxLCAwKSwgdmVjLmNsb25lKCkubm9ybWFsaXplKCkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbG9yID0gYWN0aXZlVG9vbCA9PT0gJ1NUUkVUQ0gnID8gJyMxMGI5ODEnIDogJyNmNTllMGInO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAgICAgPG1lc2ggcG9zaXRpb249e21pZH0gcXVhdGVybmlvbj17cX0gcmVuZGVyT3JkZXI9ezk5OH0+XG4gICAgICAgICAgICAgICAgICAgICAgICA8Y3lsaW5kZXJHZW9tZXRyeSBhcmdzPXtbMTUsIDE1LCBsZW4sIDhdfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgPG1lc2hTdGFuZGFyZE1hdGVyaWFsIGNvbG9yPXtjb2xvcn0gdHJhbnNwYXJlbnQgb3BhY2l0eT17MC42fSBkZXB0aFRlc3Q9e2ZhbHNlfSAvPlxuICAgICAgICAgICAgICAgICAgICA8L21lc2g+XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0pKCl9XG4gICAgICAgIDwvZ3JvdXA+XG4gICAgKTtcbn07XG5cbi8vIEluZGVwZW5kZW50IFZpZXcgQ29udHJvbHMgZm9yIERyYXcgQ2FudmFzXG5jb25zdCBEcmF3Q2FudmFzX0RyYXdDYW52YXNDb250cm9scyA9ICh7IG9ydGhvTW9kZSB9KSA9PiB7XG4gICAgY29uc3QgeyBjYW1lcmEsIGdsIH0gPSB1c2VUaHJlZSgpO1xuXG4gICAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICAgICAgY29uc3QgaGFuZGxlU2V0VmlldyA9IChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IHZpZXdUeXBlIH0gPSBlLmRldGFpbCB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IGRpc3QgPSBvcnRob01vZGUgPyAxMDAwMCA6IDUwMDA7XG4gICAgICAgICAgICBzd2l0Y2godmlld1R5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdUT1AnOiBjYW1lcmEucG9zaXRpb24uc2V0KDAsIGRpc3QsIDApOyBjYW1lcmEubG9va0F0KDAsMCwwKTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnRlJPTlQnOiBjYW1lcmEucG9zaXRpb24uc2V0KDAsIDAsIGRpc3QpOyBjYW1lcmEubG9va0F0KDAsMCwwKTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnUklHSFQnOiBjYW1lcmEucG9zaXRpb24uc2V0KGRpc3QsIDAsIDApOyBjYW1lcmEubG9va0F0KDAsMCwwKTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnSE9NRSc6XG4gICAgICAgICAgICAgICAgY2FzZSAnSVNPJzogY2FtZXJhLnBvc2l0aW9uLnNldChkaXN0LCBkaXN0LCBkaXN0KTsgY2FtZXJhLmxvb2tBdCgwLDAsMCk7IGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhdy1jYW52YXMtc2V0LXZpZXcnLCBoYW5kbGVTZXRWaWV3KTtcbiAgICAgICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdkcmF3LWNhbnZhcy1zZXQtdmlldycsIGhhbmRsZVNldFZpZXcpO1xuICAgIH0sIFtjYW1lcmEsIG9ydGhvTW9kZV0pO1xuXG4gICAgcmV0dXJuIG51bGw7XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gRHJhd0NhbnZhc1RhYigpIHtcbiAgICBjb25zdCB7IHNldERyYXdNb2RlLCBhcHBTZXR0aW5ncyB9ID0gdXNlU3RvcmUoKTtcbiAgICBjb25zdCB7IGRpc3BhdGNoIH0gPSB1c2VBcHBDb250ZXh0KCk7XG4gICAgY29uc3QgW3N0YXRlLCBkY0Rpc3BhdGNoXSA9IHVzZVJlZHVjZXIoZHJhd0NhbnZhc1JlZHVjZXIsIGluaXRpYWxTdGF0ZSk7XG4gICAgY29uc3QgeyBkcmF3blBpcGVzLCBzZWxlY3RlZEluZGV4LCBhY3RpdmVUb29sIH0gPSBzdGF0ZTtcbiAgICBjb25zdCBbaXNQYW5lbE9wZW4sIHNldElzUGFuZWxPcGVuXSA9IHVzZVN0YXRlKHRydWUpO1xuICAgIGNvbnN0IFtjdXJzb3JXb3JsZFBvcywgc2V0Q3Vyc29yV29ybGRQb3NdID0gdXNlU3RhdGUoeyB4OiAwLCB5OiAwLCB6OiAwIH0pO1xuICAgIGNvbnN0IFtpc0xpc3RPcGVuLCBzZXRJc0xpc3RPcGVuXSA9IHVzZVN0YXRlKHRydWUpO1xuICAgIGNvbnN0IFtsb2NhbE9ydGhvTW9kZSwgc2V0TG9jYWxPcnRob01vZGVdID0gdXNlU3RhdGUodHJ1ZSk7XG4gICAgY29uc3QgW3Nob3dHcmlkU2V0dGluZ3MsIHNldFNob3dHcmlkU2V0dGluZ3NdID0gdXNlU3RhdGUoZmFsc2UpO1xuXG4gICAgY29uc3QgW2dyaWRDb25maWcsIHNldEdyaWRDb25maWddID0gdXNlU3RhdGUoe1xuICAgICAgICBkZW5zaXR5OiAxMDAsXG4gICAgICAgIG9wYWNpdHk6IDAuNSxcbiAgICAgICAgc25hcFJlc29sdXRpb246IDEwMFxuICAgIH0pO1xuXG4gICAgLy8gSGFuZGxlIEVzYyBnbG9iYWxseSBpbnNpZGUgRHJhdyBDYW52YXMgdG8gY2FuY2VsIHRvb2wgc2VsZWN0aW9uXG4gICAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICAgICAgY29uc3QgaGFuZGxlS2V5RG93biA9IChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBhY3RpdmVUYWIgPSB1c2VTdG9yZS5nZXRTdGF0ZSgpLmFjdGl2ZVRhYjtcbiAgICAgICAgICAgIGlmIChhY3RpdmVUYWIgJiYgYWN0aXZlVGFiICE9PSAnZHJhdycpIHJldHVybjtcblxuICAgICAgICAgICAgaWYgKGUua2V5ID09PSAnRXNjYXBlJykge1xuICAgICAgICAgICAgICAgIGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50ICYmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50LnRhZ05hbWUgPT09ICdJTlBVVCcgfHwgZG9jdW1lbnQuYWN0aXZlRWxlbWVudC50YWdOYW1lID09PSAnVEVYVEFSRUEnKSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGRjRGlzcGF0Y2goeyB0eXBlOiAnU0VUX1RPT0wnLCBwYXlsb2FkOiAnVklFVycgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlS2V5RG93bik7XG4gICAgICAgIHJldHVybiAoKSA9PiB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGhhbmRsZUtleURvd24pO1xuICAgIH0sIFtdKTtcblxuICAgIC8vIEFsc28gc3VwcG9ydCBuYXRpdmUgUGFuIG1vZGVcbiAgICBjb25zdCBpbnRlcmFjdGlvbk1vZGUgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5pbnRlcmFjdGlvbk1vZGUpO1xuXG4gICAgY29uc3QgY29udHJvbHNFbmFibGVkID0gYWN0aXZlVG9vbCA9PT0gJ1ZJRVcnIHx8IGFjdGl2ZVRvb2wgPT09ICdQQU4nIHx8IGFjdGl2ZVRvb2wgPT09ICdPUkJJVCc7XG4gICAgY29uc3QgbW91c2VCdXR0b25zID0ge1xuICAgICAgICBMRUZUOiBhY3RpdmVUb29sID09PSAnUEFOJyA/IFRIUkVFLk1PVVNFLlBBTiA6IFRIUkVFLk1PVVNFLlJPVEFURSxcbiAgICAgICAgTUlERExFOiBUSFJFRS5NT1VTRS5ET0xMWSxcbiAgICAgICAgUklHSFQ6IGFjdGl2ZVRvb2wgPT09ICdQQU4nID8gVEhSRUUuTU9VU0UuUk9UQVRFIDogVEhSRUUuTU9VU0UuUEFOXG4gICAgfTtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBmbGV4LWNvbCBoLVtjYWxjKDEwMHZoLTRyZW0pXSB3LWZ1bGwgb3ZlcmZsb3ctaGlkZGVuIGJnLXNsYXRlLTk1MCByb3VuZGVkLWxnIHNoYWRvdy1pbm5lciByZWxhdGl2ZSBtdC1bLTJyZW1dXCI+XG4gICAgICAgICAgICB7LyogVG9wIE1pbmltYWwgVG9vbGJhciAqL31cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtY2VudGVyIHB4LTQgcHktMiBiZy1zbGF0ZS05MDAgYm9yZGVyLWIgYm9yZGVyLXNsYXRlLTcwMFwiPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTQgdGV4dC1zbGF0ZS0yMDAgZm9udC1ib2xkIHRleHQtc20gdHJhY2tpbmctd2lkZVwiPlxuICAgICAgICAgICAgICAgICAgICBEUkFXIENBTlZBU1xuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBnYXAtMlwiPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB1c2VTdG9yZS5nZXRTdGF0ZSgpLmRhdGFUYWJsZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkYXRhICYmIGRhdGEubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh3aW5kb3cuY29uZmlybSgnUHVsbGluZyBmcm9tIDNEIFRvcG8gd2lsbCBvdmVyd3JpdGUgdGhlIGN1cnJlbnQgZHJhd2luZy4gQ29udGludWU/JykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcGF5bG9hZERhdGEgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGRhdGEpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihyID0+IHIgJiYgci5lcDEgJiYgci5lcDIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAubWFwKHIgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuLi5yLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVwMToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB4OiBOdW1iZXIucGFyc2VGbG9hdChyLmVwMS54KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeTogTnVtYmVyLnBhcnNlRmxvYXQoci5lcDEueSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHo6IE51bWJlci5wYXJzZUZsb2F0KHIuZXAxLnopXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcDI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeDogTnVtYmVyLnBhcnNlRmxvYXQoci5lcDIueCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHk6IE51bWJlci5wYXJzZUZsb2F0KHIuZXAyLnkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB6OiBOdW1iZXIucGFyc2VGbG9hdChyLmVwMi56KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYm9yZTogTnVtYmVyLnBhcnNlRmxvYXQoci5ib3JlKSB8fCAyMDAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcm93VWlkOiByLnJvd1VpZCB8fCBgdG9wb18ke3IuX3Jvd0luZGV4fV8ke0RhdGUubm93KCl9YCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VEb21haW46IHIuc291cmNlRG9tYWluIHx8ICdtYWluM0QnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5maWx0ZXIociA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIE51bWJlci5pc0Zpbml0ZShyLmVwMS54KSAmJiBOdW1iZXIuaXNGaW5pdGUoci5lcDEueSkgJiYgTnVtYmVyLmlzRmluaXRlKHIuZXAxLnopICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgTnVtYmVyLmlzRmluaXRlKHIuZXAyLngpICYmIE51bWJlci5pc0Zpbml0ZShyLmVwMi55KSAmJiBOdW1iZXIuaXNGaW5pdGUoci5lcDIueilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwYXlsb2FkRGF0YS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFsZXJ0KCdObyB2YWxpZCBFUDEvRVAyIHJvd3MgZm91bmQgaW4gM0QgVG9wby4nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkY0Rpc3BhdGNoKHsgdHlwZTogJ1NFVF9BTExfQ09NUE9ORU5UUycsIHBheWxvYWQ6IHBheWxvYWREYXRhIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYWxlcnQoJ05vIGRhdGEgaW4gM0QgVG9wbyB0byBwdWxsLicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9fSBjbGFzc05hbWU9XCJiZy1pbmRpZ28tNjAwIGhvdmVyOmJnLWluZGlnby01MDAgdGV4dC13aGl0ZSBweC0zIHB5LTEgcm91bmRlZCB0ZXh0LXhzIGZvbnQtYm9sZCB0cmFuc2l0aW9uLWNvbG9yc1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgUHVsbCBmcm9tIDNEIFRvcG9cbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRyYXduUGlwZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgdXBkYXRlZFRhYmxlLCBmaXhMb2cgfSA9IGZpeDZtbUdhcHMoZHJhd25QaXBlcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGNEaXNwYXRjaCh7IHR5cGU6ICdTRVRfQUxMX0NPTVBPTkVOVFMnLCBwYXlsb2FkOiB1cGRhdGVkVGFibGUgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZml4TG9nLmZvckVhY2gobG9nID0+IGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IGxvZyB9KSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH19IGNsYXNzTmFtZT1cImJnLW9yYW5nZS02MDAgaG92ZXI6Ymctb3JhbmdlLTUwMCB0ZXh0LXdoaXRlIHB4LTMgcHktMSByb3VuZGVkIHRleHQteHMgZm9udC1ib2xkIHRyYW5zaXRpb24tY29sb3JzXCIgdGl0bGU9XCJXZWxkIGVuZHBvaW50cyB3aXRoaW4gNm1tXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICBDbGVhbiBHYXBzICg2bW0pXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkcmF3blBpcGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbXBvcnQoJy4uLy4uL2VuZ2luZS9PdmVybGFwU29sdmVyLmpzJykudGhlbigoeyByZXNvbHZlT3ZlcmxhcHMgfSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB7IHVwZGF0ZWRUYWJsZSwgZml4TG9nIH0gPSByZXNvbHZlT3ZlcmxhcHMoZHJhd25QaXBlcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRjRGlzcGF0Y2goeyB0eXBlOiAnU0VUX0FMTF9DT01QT05FTlRTJywgcGF5bG9hZDogdXBkYXRlZFRhYmxlIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaXhMb2cuZm9yRWFjaChsb2cgPT4gZGlzcGF0Y2goeyB0eXBlOiBcIkFERF9MT0dcIiwgcGF5bG9hZDogbG9nIH0pKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfX0gY2xhc3NOYW1lPVwiYmctcHVycGxlLTYwMCBob3ZlcjpiZy1wdXJwbGUtNTAwIHRleHQtd2hpdGUgcHgtMyBweS0xIHJvdW5kZWQgdGV4dC14cyBmb250LWJvbGQgdHJhbnNpdGlvbi1jb2xvcnNcIiB0aXRsZT1cIlRyaW0gcGlwZXMgb3ZlcmxhcHBpbmcgd2l0aCByaWdpZCBmaXR0aW5nc1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgT3ZlcmxhcCBTb2x2ZXJcbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRyYXduUGlwZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh3aW5kb3cuY29uZmlybSgnUHVzaGluZyB0byAzRCBUb3BvIHdpbGwgb3ZlcndyaXRlIHRoZSBtYWluIGNhbnZhcy4gQ29udGludWU/JykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkucHVzaEhpc3RvcnkoJ1B1c2ggZnJvbSBEcmF3IENhbnZhcycpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgbmV3VGFibGUgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGRyYXduUGlwZXMpKS5tYXAoKHIsIGkpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLi4ucixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3dVaWQ6IHIucm93VWlkIHx8IGBkcmF3XyR7aX1fJHtEYXRlLm5vdygpfWAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlRG9tYWluOiAnZHJhd0NhbnZhcycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFzdE11dGF0aW9uQXQ6IERhdGUubm93KClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQXV0byBhc3NpZ24gcGlwZWxpbmUgcmVmcyBpbW1lZGlhdGVseSBiZWZvcmUgcHVzaGluZ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgeyB1cGRhdGVkVGFibGU6IGF1dG9UYWJsZSwgZml4TG9nIH0gPSBhdXRvQXNzaWduUGlwZWxpbmVSZWZzKG5ld1RhYmxlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ld1RhYmxlID0gYXV0b1RhYmxlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZml4TG9nLmZvckVhY2gobG9nID0+IGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IGxvZyB9KSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0RGF0YVRhYmxlKG5ld1RhYmxlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogJ0FQUExZX0dBUF9GSVgnLCBwYXlsb2FkOiB7IHVwZGF0ZWRUYWJsZTogbmV3VGFibGUgfSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogJ0FERF9MT0cnLCBwYXlsb2FkOiB7IHN0YWdlOiAnSU5URVJBQ1RJVkUnLCB0eXBlOiAnSW5mbycsIG1lc3NhZ2U6ICdEYXRhIHB1c2hlZCBmcm9tIERyYXcgQ2FudmFzIHN1Y2Nlc3NmdWxseS4nIH0gfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZGJnICE9PSAndW5kZWZpbmVkJykgZGJnLnN0YXRlKCdEUkFXX0NBTlZBUycsICdQdXNoZWQgdG8gM0QgVG9wbycsIHsgY29tcG9uZW50czogbmV3VGFibGUubGVuZ3RoIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWxlcnQoJ0RhdGEgcHVzaGVkIHRvIG1haW4gM0QgY2FudmFzIHN1Y2Nlc3NmdWxseS4nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBkYmcgIT09ICd1bmRlZmluZWQnKSBkYmcuZXJyb3IoJ0RSQVdfQ0FOVkFTJywgJ1B1c2ggdG8gVG9wbyBmYWlsZWQnLCBlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogJ0FERF9MT0cnLCBwYXlsb2FkOiB7IHN0YWdlOiAnSU5URVJBQ1RJVkUnLCB0eXBlOiAnRXJyb3InLCBtZXNzYWdlOiBgRmFpbGVkIHRvIHB1c2ggRHJhdyBDYW52YXMgZGF0YTogJHtlLm1lc3NhZ2V9YCB9IH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWxlcnQoJ0Vycm9yIHB1c2hpbmcgZGF0YS4gU2VlIGxvZyBmb3IgZGV0YWlscy4nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYWxlcnQoJ05vIGRyYXduIGNvbXBvbmVudHMgdG8gcHVzaC4nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfX0gY2xhc3NOYW1lPVwiYmctZ3JlZW4tNjAwIGhvdmVyOmJnLWdyZWVuLTUwMCB0ZXh0LXdoaXRlIHB4LTMgcHktMSByb3VuZGVkIHRleHQteHMgZm9udC1ib2xkIHRyYW5zaXRpb24tY29sb3JzXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICBQdXNoIHRvIDNEIFRvcG9cbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIHsvKiBNaW5pbWl6ZSBqdXN0IGNvbGxhcHNlcyBwYW5lbHMgaW5zdGVhZCBvZiB2YW5pc2hpbmcgd2luZG93ICovfVxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IHsgc2V0SXNQYW5lbE9wZW4oIWlzUGFuZWxPcGVuKTsgc2V0SXNMaXN0T3BlbighaXNMaXN0T3Blbik7IH19IGNsYXNzTmFtZT1cInRleHQtc2xhdGUtNDAwIGhvdmVyOnRleHQtd2hpdGUgcHgtMiByb3VuZGVkIHRleHQteHMgdHJhbnNpdGlvbi1jb2xvcnMgYm9yZGVyLWwgYm9yZGVyLXNsYXRlLTcwMCBwbC00IG1sLTJcIj5Ub2dnbGUgUGFuZWxzPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4gc2V0U2hvd0dyaWRTZXR0aW5ncyghc2hvd0dyaWRTZXR0aW5ncyl9IGNsYXNzTmFtZT17YHRleHQtc2xhdGUtNDAwIGhvdmVyOnRleHQtd2hpdGUgcHgtMiByb3VuZGVkIHRyYW5zaXRpb24tY29sb3JzICR7c2hvd0dyaWRTZXR0aW5ncyA/ICd0ZXh0LXdoaXRlIGJnLXNsYXRlLTgwMCcgOiAnJ31gfSB0aXRsZT1cIkRyYXcgU2V0dGluZ3NcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgd2lkdGg9XCIxOFwiIGhlaWdodD1cIjE4XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIyXCIgc3Ryb2tlTGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlTGluZWpvaW49XCJyb3VuZFwiPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiM1wiLz48cGF0aCBkPVwiTTE5LjQgMTVhMS42NSAxLjY1IDAgMCAwIC4zMyAxLjgybC4wNi4wNmEyIDIgMCAwIDEgMCAyLjgzIDIgMiAwIDAgMS0yLjgzIDBsLS4wNi0uMDZhMS42NSAxLjY1IDAgMCAwLTEuODItLjMzIDEuNjUgMS42NSAwIDAgMC0xIDEuNTFWMjFhMiAyIDAgMCAxLTIgMiAyIDIgMCAwIDEtMi0ydi0uMDlBMS42NSAxLjY1IDAgMCAwIDkgMTkuNGExLjY1IDEuNjUgMCAwIDAtMS44Mi4zM2wtLjA2LjA2YTIgMiAwIDAgMS0yLjgzIDAgMiAyIDAgMCAxIDAtMi44M2wuMDYtLjA2YTEuNjUgMS42NSAwIDAgMCAuMzMtMS44MiAxLjY1IDEuNjUgMCAwIDAtMS41MS0xSDNhMiAyIDAgMCAxLTItMiAyIDIgMCAwIDEgMi0yaC4wOUExLjY1IDEuNjUgMCAwIDAgNC42IDlhMS42NSAxLjY1IDAgMCAwLS4zMy0xLjgybC0uMDYtLjA2YTIgMiAwIDAgMSAwLTIuODMgMiAyIDAgMCAxIDIuODMgMGwuMDYuMDZhMS42NSAxLjY1IDAgMCAwIDEuODIuMzNIOWExLjY1IDEuNjUgMCAwIDAgMS0xLjUxVjNhMiAyIDAgMCAxIDItMiAyIDIgMCAwIDEgMiAydi4wOWExLjY1IDEuNjUgMCAwIDAgMSAxLjUxIDEuNjUgMS42NSAwIDAgMCAxLjgyLS4zM2wuMDYtLjA2YTIgMiAwIDAgMSAyLjgzIDAgMiAyIDAgMCAxIDAgMi44M2wtLjA2LjA2YTEuNjUgMS42NSAwIDAgMC0uMzMgMS44MlY5YTEuNjUgMS42NSAwIDAgMCAxLjUxIDFIMjFhMiAyIDAgMCAxIDIgMiAyIDIgMCAwIDEtMiAyaC0uMDlhMS42NSAxLjY1IDAgMCAwLTEuNTEgMXpcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IHNldERyYXdNb2RlKGZhbHNlKX0gY2xhc3NOYW1lPVwiYmctcmVkLTYwMCBob3ZlcjpiZy1yZWQtNTAwIHRleHQtd2hpdGUgcHgtMyBweS0xIHJvdW5kZWQgdGV4dC14cyBmb250LWJvbGQgdHJhbnNpdGlvbi1jb2xvcnMgbWwtMlwiPkNsb3NlPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAge3Nob3dHcmlkU2V0dGluZ3MgJiYgKFxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYWJzb2x1dGUgdG9wLTEyIHJpZ2h0LTE0IHotNTAgYmctc2xhdGUtODAwIGJvcmRlciBib3JkZXItc2xhdGUtNzAwIHJvdW5kZWQtbGcgcC00IHNoYWRvdy0yeGwgdy02NFwiPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgganVzdGlmeS1iZXR3ZWVuIGl0ZW1zLWNlbnRlciBtYi0zIGJvcmRlci1iIGJvcmRlci1zbGF0ZS03MDAgcGItMlwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGgzIGNsYXNzTmFtZT1cInRleHQtc20gZm9udC1ib2xkIHRleHQtc2xhdGUtMjAwXCI+RHJhdyBTZXR0aW5nczwvaDM+XG4gICAgICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IHNldFNob3dHcmlkU2V0dGluZ3MoZmFsc2UpfSBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTQwMCBob3Zlcjp0ZXh0LXdoaXRlXCI+4pyVPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC1jb2wgZ2FwLTRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXIgY3Vyc29yLXBvaW50ZXIgZ3JvdXBcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQteHMgZm9udC1tZWRpdW0gdGV4dC1zbGF0ZS0yMDBcIj5BdXRvIEJlbmQ8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LVsxMHB4XSB0ZXh0LXNsYXRlLTQwMFwiPkluc2VydCBiZW5kIG9uIGRpciBjaGFuZ2U8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInJlbGF0aXZlXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBjbGFzc05hbWU9XCJzci1vbmx5XCIgY2hlY2tlZD17YXBwU2V0dGluZ3MuYXV0b0JlbmRFbmFibGVkfSBvbkNoYW5nZT17KGUpID0+IHVzZVN0b3JlLmdldFN0YXRlKCkudXBkYXRlQXBwU2V0dGluZ3MoeyBhdXRvQmVuZEVuYWJsZWQ6IGUudGFyZ2V0LmNoZWNrZWQgfSl9IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgYmxvY2sgdy04IGgtNSByb3VuZGVkLWZ1bGwgdHJhbnNpdGlvbi1jb2xvcnMgJHthcHBTZXR0aW5ncy5hdXRvQmVuZEVuYWJsZWQgPyAnYmctYmx1ZS02MDAnIDogJ2JnLXNsYXRlLTcwMCd9YH0+PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgZG90IGFic29sdXRlIGxlZnQtMSB0b3AtMSBiZy13aGl0ZSB3LTMgaC0zIHJvdW5kZWQtZnVsbCB0cmFuc2l0aW9uLXRyYW5zZm9ybSAke2FwcFNldHRpbmdzLmF1dG9CZW5kRW5hYmxlZCA/ICd0cmFuc2xhdGUteC0zJyA6ICcnfWB9PjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9sYWJlbD5cblxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJib3JkZXItdCBib3JkZXItc2xhdGUtNzAwIHB0LTJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aDQgY2xhc3NOYW1lPVwidGV4dC14cyBmb250LWJvbGQgdGV4dC1zbGF0ZS00MDAgbWItMlwiPkdyaWQ8L2g0PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBmbGV4LWNvbCBnYXAtMlwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC1jb2wgZ2FwLTFcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtc2xhdGUtNDAwXCI+R3JpZCBEZW5zaXR5PC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwicmFuZ2VcIiBtaW49XCIxMFwiIG1heD1cIjEwMDBcIiBzdGVwPVwiMTBcIiB2YWx1ZT17Z3JpZENvbmZpZy5kZW5zaXR5fSBvbkNoYW5nZT17KGUpID0+IHNldEdyaWRDb25maWcoey4uLmdyaWRDb25maWcsIGRlbnNpdHk6IHBhcnNlSW50KGUudGFyZ2V0LnZhbHVlKX0pfSBjbGFzc05hbWU9XCJ3LWZ1bGwgYWNjZW50LWJsdWUtNTAwXCIgLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC1yaWdodCB0ZXh0LVsxMHB4XSB0ZXh0LXNsYXRlLTUwMFwiPntncmlkQ29uZmlnLmRlbnNpdHl9bW08L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBmbGV4LWNvbCBnYXAtMVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS00MDBcIj5HcmlkIE9wYWNpdHk8L2xhYmVsPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJyYW5nZVwiIG1pbj1cIjBcIiBtYXg9XCIxXCIgc3RlcD1cIjAuMVwiIHZhbHVlPXtncmlkQ29uZmlnLm9wYWNpdHl9IG9uQ2hhbmdlPXsoZSkgPT4gc2V0R3JpZENvbmZpZyh7Li4uZ3JpZENvbmZpZywgb3BhY2l0eTogcGFyc2VGbG9hdChlLnRhcmdldC52YWx1ZSl9KX0gY2xhc3NOYW1lPVwidy1mdWxsIGFjY2VudC1ibHVlLTUwMFwiIC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtcmlnaHQgdGV4dC1bMTBweF0gdGV4dC1zbGF0ZS01MDBcIj57Z3JpZENvbmZpZy5vcGFjaXR5fTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGZsZXgtY29sIGdhcC0xXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwidGV4dC14cyB0ZXh0LXNsYXRlLTQwMFwiPlNuYXAgUmVzb2x1dGlvbjwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c2VsZWN0IHZhbHVlPXtncmlkQ29uZmlnLnNuYXBSZXNvbHV0aW9ufSBvbkNoYW5nZT17KGUpID0+IHNldEdyaWRDb25maWcoey4uLmdyaWRDb25maWcsIHNuYXBSZXNvbHV0aW9uOiBwYXJzZUludChlLnRhcmdldC52YWx1ZSl9KX0gY2xhc3NOYW1lPVwiYmctc2xhdGUtOTAwIGJvcmRlciBib3JkZXItc2xhdGUtNzAwIHRleHQtc2xhdGUtMzAwIHRleHQteHMgcm91bmRlZCBwLTFcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiMVwiPjEgbW08L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiMTBcIj4xMCBtbTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCI1MFwiPjUwIG1tPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIjEwMFwiPjEwMCBtbTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCI1MDBcIj41MDAgbW08L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiMTAwMFwiPjEwMDAgbW08L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICl9XG5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBmbGV4LTEgb3ZlcmZsb3ctaGlkZGVuIHJlbGF0aXZlXCI+XG5cbiAgICAgICAgICAgICAgICB7LyogTGVmdCBWZXJ0aWNhbCBUb29sYmFyICg0OHB4IHdpZGUpICovfVxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidy0xMiBiZy1zbGF0ZS05MDAgYm9yZGVyLXIgYm9yZGVyLXNsYXRlLTcwMCBmbGV4IGZsZXgtY29sIGl0ZW1zLWNlbnRlciBweS0yIGdhcC0yIHotMTAgc2hyaW5rLTBcIj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBkYXRhLXRlc3RpZD1cImRyYXdidG4tb3J0aG9cIiBjbGFzc05hbWU9e2B3LTggaC04IHJvdW5kZWQgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgJHtsb2NhbE9ydGhvTW9kZSA/ICdiZy1pbmRpZ28tNjAwIHRleHQtd2hpdGUnIDogJ3RleHQtc2xhdGUtNDAwIGhvdmVyOmJnLXNsYXRlLTcwMCd9YH0gb25DbGljaz17KCkgPT4gc2V0TG9jYWxPcnRob01vZGUoIWxvY2FsT3J0aG9Nb2RlKX0gdGl0bGU9XCJUb2dnbGUgT3J0aG8vUGVyc3BlY3RpdmVcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtYm9sZCB0ZXh0LXhzIHVwcGVyY2FzZVwiPntsb2NhbE9ydGhvTW9kZSA/ICdPUlQnIDogJ1BFUid9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ3LTYgaC1weCBiZy1zbGF0ZS03MDAgbXktMVwiPjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGRhdGEtdGVzdGlkPVwiZHJhd2J0bi12aWV3XCIgY2xhc3NOYW1lPXtgdy04IGgtOCByb3VuZGVkIGZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyICR7YWN0aXZlVG9vbCA9PT0gJ1ZJRVcnID8gJ2JnLWJsdWUtNjAwIHRleHQtd2hpdGUnIDogJ3RleHQtc2xhdGUtNDAwIGhvdmVyOmJnLXNsYXRlLTcwMCd9YH0gb25DbGljaz17KCkgPT4gZGNEaXNwYXRjaCh7IHR5cGU6ICdTRVRfVE9PTCcsIHBheWxvYWQ6ICdWSUVXJyB9KX0gdGl0bGU9XCJTZWxlY3QgKE9yYml0KVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHN2ZyBjbGFzc05hbWU9XCJ3LTQgaC00XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIyXCI+PHBhdGggZD1cIk0xMiAxOWwtNy03IDctN1wiLz48cGF0aCBkPVwiTTE5IDEySDVcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGRhdGEtdGVzdGlkPVwiZHJhd2J0bi1wYW5cIiBjbGFzc05hbWU9e2B3LTggaC04IHJvdW5kZWQgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgJHthY3RpdmVUb29sID09PSAnUEFOJyA/ICdiZy1ibHVlLTYwMCB0ZXh0LXdoaXRlJyA6ICd0ZXh0LXNsYXRlLTQwMCBob3ZlcjpiZy1zbGF0ZS03MDAnfWB9IG9uQ2xpY2s9eygpID0+IGRjRGlzcGF0Y2goeyB0eXBlOiAnU0VUX1RPT0wnLCBwYXlsb2FkOiAnUEFOJyB9KX0gdGl0bGU9XCJQYW5cIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiIHN0cm9rZUxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZUxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTE4LjQ0IDIuMDVMMjEuOTUgNS41NkwxOC40NCA5LjA3XCIvPjxwYXRoIGQ9XCJNNS41NiAyMS45NUwyLjA1IDE4LjQ0TDUuNTYgMTQuOTNcIi8+PHBhdGggZD1cIk0yLjA1IDE4LjQ0TDIxLjk1IDUuNTZcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGRhdGEtdGVzdGlkPVwiZHJhd2J0bi1vcmJpdFwiIGNsYXNzTmFtZT17YHctOCBoLTggcm91bmRlZCBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciAke2FjdGl2ZVRvb2wgPT09ICdPUkJJVCcgPyAnYmctYmx1ZS02MDAgdGV4dC13aGl0ZScgOiAndGV4dC1zbGF0ZS00MDAgaG92ZXI6Ymctc2xhdGUtNzAwJ31gfSBvbkNsaWNrPXsoKSA9PiBkY0Rpc3BhdGNoKHsgdHlwZTogJ1NFVF9UT09MJywgcGF5bG9hZDogJ09SQklUJyB9KX0gdGl0bGU9XCJPcmJpdFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHN2ZyBjbGFzc05hbWU9XCJ3LTQgaC00XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIyXCIgc3Ryb2tlTGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlTGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMyAxMmE5IDkgMCAxIDAgOS05IDkuNzUgOS43NSAwIDAgMC02Ljc0IDIuNzRMMyA4XCIvPjxwYXRoIGQ9XCJNMyAzdjVoNVwiLz48L3N2Zz5cbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidy02IGgtcHggYmctc2xhdGUtNzAwIG15LTFcIj48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBkYXRhLXRlc3RpZD1cImRyYXdidG4tcGlwZVwiIGNsYXNzTmFtZT17YHctOCBoLTggcm91bmRlZCBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciAke2FjdGl2ZVRvb2wgPT09ICdEUkFXX1BJUEUnID8gJ2JnLWJsdWUtNjAwIHRleHQtd2hpdGUnIDogJ3RleHQtc2xhdGUtNDAwIGhvdmVyOmJnLXNsYXRlLTcwMCd9YH0gb25DbGljaz17KCkgPT4gZGNEaXNwYXRjaCh7IHR5cGU6ICdTRVRfVE9PTCcsIHBheWxvYWQ6ICdEUkFXX1BJUEUnIH0pfSB0aXRsZT1cIkRyYXcgUGlwZVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHN2ZyBjbGFzc05hbWU9XCJ3LTQgaC00XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIyXCI+PGxpbmUgeDE9XCIyXCIgeTE9XCIyMlwiIHgyPVwiMjJcIiB5Mj1cIjJcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGRhdGEtdGVzdGlkPVwiZHJhd2J0bi1iZW5kXCIgY2xhc3NOYW1lPXtgdy04IGgtOCByb3VuZGVkIGZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyICR7YWN0aXZlVG9vbCA9PT0gJ0RSQVdfQkVORCcgPyAnYmctYmx1ZS02MDAgdGV4dC13aGl0ZScgOiAndGV4dC1zbGF0ZS00MDAgaG92ZXI6Ymctc2xhdGUtNzAwJ31gfSBvbkNsaWNrPXsoKSA9PiBkY0Rpc3BhdGNoKHsgdHlwZTogJ1NFVF9UT09MJywgcGF5bG9hZDogJ0RSQVdfQkVORCcgfSl9IHRpdGxlPVwiRHJhdyBCZW5kXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3ZnIGNsYXNzTmFtZT1cInctNCBoLTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2VXaWR0aD1cIjJcIj48cGF0aCBkPVwiTTUgMjJoMTRhMiAyIDAgMCAwIDItMlY2bC0zLTRINkwzIDZ2MTRhMiAyIDAgMCAwIDIgMnpcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGRhdGEtdGVzdGlkPVwiZHJhd2J0bi10ZWVcIiBjbGFzc05hbWU9e2B3LTggaC04IHJvdW5kZWQgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgJHthY3RpdmVUb29sID09PSAnRFJBV19URUUnID8gJ2JnLWJsdWUtNjAwIHRleHQtd2hpdGUnIDogJ3RleHQtc2xhdGUtNDAwIGhvdmVyOmJnLXNsYXRlLTcwMCd9YH0gb25DbGljaz17KCkgPT4gZGNEaXNwYXRjaCh7IHR5cGU6ICdTRVRfVE9PTCcsIHBheWxvYWQ6ICdEUkFXX1RFRScgfSl9IHRpdGxlPVwiRHJhdyBUZWVcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtYm9sZCB0ZXh0LXhzIHVwcGVyY2FzZSB0ZXh0LWNlbnRlciB3LWZ1bGwgYmxvY2tcIj5UPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ3LTYgaC1weCBiZy1zbGF0ZS03MDAgbXktMVwiPjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGRhdGEtdGVzdGlkPVwiZHJhd2J0bi1jb252ZXJ0LWJlbmRcIiBjbGFzc05hbWU9e2B3LTggaC04IHJvdW5kZWQgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgJHthY3RpdmVUb29sID09PSAnQ09OVkVSVF9CRU5EJyA/ICdiZy1wdXJwbGUtNjAwIHRleHQtd2hpdGUnIDogJ3RleHQtcHVycGxlLTQwMCBob3ZlcjpiZy1zbGF0ZS03MDAnfWB9IG9uQ2xpY2s9eygpID0+IGRjRGlzcGF0Y2goeyB0eXBlOiAnU0VUX1RPT0wnLCBwYXlsb2FkOiAnQ09OVkVSVF9CRU5EJyB9KX0gdGl0bGU9XCJDb252ZXJ0IGludGVyc2VjdGlvbiB0byBCZW5kIChTZWxlY3QgMiBwaXBlcylcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtYm9sZCB0ZXh0LVsxMHB4XSB1cHBlcmNhc2UgdGV4dC1jZW50ZXIgdy1mdWxsIGJsb2NrXCI+Q0I8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGRhdGEtdGVzdGlkPVwiZHJhd2J0bi1jb252ZXJ0LXRlZVwiIGNsYXNzTmFtZT17YHctOCBoLTggcm91bmRlZCBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciAke2FjdGl2ZVRvb2wgPT09ICdDT05WRVJUX1RFRScgPyAnYmctcHVycGxlLTYwMCB0ZXh0LXdoaXRlJyA6ICd0ZXh0LXB1cnBsZS00MDAgaG92ZXI6Ymctc2xhdGUtNzAwJ31gfSBvbkNsaWNrPXsoKSA9PiBkY0Rpc3BhdGNoKHsgdHlwZTogJ1NFVF9UT09MJywgcGF5bG9hZDogJ0NPTlZFUlRfVEVFJyB9KX0gdGl0bGU9XCJDb252ZXJ0IGludGVyc2VjdGlvbiB0byBUZWUgKFNlbGVjdCAzIHBpcGVzKVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZm9udC1ib2xkIHRleHQtWzEwcHhdIHVwcGVyY2FzZSB0ZXh0LWNlbnRlciB3LWZ1bGwgYmxvY2tcIj5DVDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gZGF0YS10ZXN0aWQ9XCJkcmF3YnRuLWF1dG8tZml0dGluZ3NcIiBjbGFzc05hbWU9e2B3LTggaC04IHJvdW5kZWQgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgdGV4dC1wdXJwbGUtNDAwIGhvdmVyOmJnLXNsYXRlLTcwMCBob3Zlcjp0ZXh0LXdoaXRlYH0gb25DbGljaz17KCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW1wb3J0KCcuLi8uLi9lbmdpbmUvT3ZlcmxhcFNvbHZlci5qcycpLnRoZW4oKHsgYXV0b0ZpdHRpbmdTb2x2ZXIgfSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgdXBkYXRlZFRhYmxlIH0gPSBhdXRvRml0dGluZ1NvbHZlcihkcmF3blBpcGVzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkY0Rpc3BhdGNoKHsgdHlwZTogJ1NFVF9BTExfQ09NUE9ORU5UUycsIHBheWxvYWQ6IHVwZGF0ZWRUYWJsZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9fSB0aXRsZT1cIkF1dG8tSW5zZXJ0IEZpdHRpbmdzIChCZW5kcywgVGVlcywgUmVkdWNlcnMpXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3ZnIGNsYXNzTmFtZT1cInctNCBoLTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2VXaWR0aD1cIjJcIj48cGF0aCBkPVwibTE4IDE2IDQtNC00LTRcIi8+PHBhdGggZD1cIm02IDgtNCA0IDQgNFwiLz48cGF0aCBkPVwibTE0LjUgNC01IDE2XCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ3LTYgaC1weCBiZy1zbGF0ZS03MDAgbXktMVwiPjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGRhdGEtdGVzdGlkPVwiZHJhd2J0bi1mbGFuZ2VcIiBjbGFzc05hbWU9e2B3LTggaC04IHJvdW5kZWQgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgJHthY3RpdmVUb29sID09PSAnRkxBTkdFJyA/ICdiZy1ibHVlLTYwMCB0ZXh0LXdoaXRlJyA6ICd0ZXh0LXNsYXRlLTQwMCBob3ZlcjpiZy1zbGF0ZS03MDAnfWB9IG9uQ2xpY2s9eygpID0+IGRjRGlzcGF0Y2goeyB0eXBlOiAnU0VUX1RPT0wnLCBwYXlsb2FkOiAnRkxBTkdFJyB9KX0gdGl0bGU9XCJGbGFuZ2VcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMTBcIi8+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCI0XCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBkYXRhLXRlc3RpZD1cImRyYXdidG4tdmFsdmVcIiBjbGFzc05hbWU9e2B3LTggaC04IHJvdW5kZWQgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgJHthY3RpdmVUb29sID09PSAnVkFMVkUnID8gJ2JnLWJsdWUtNjAwIHRleHQtd2hpdGUnIDogJ3RleHQtc2xhdGUtNDAwIGhvdmVyOmJnLXNsYXRlLTcwMCd9YH0gb25DbGljaz17KCkgPT4gZGNEaXNwYXRjaCh7IHR5cGU6ICdTRVRfVE9PTCcsIHBheWxvYWQ6ICdWQUxWRScgfSl9IHRpdGxlPVwiVmFsdmVcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICA8c3ZnIGNsYXNzTmFtZT1cInctNCBoLTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2VXaWR0aD1cIjJcIj48cG9seWdvbiBwb2ludHM9XCIzIDMgMjEgMjEgMjEgMyAzIDIxXCIvPjxsaW5lIHgxPVwiMTJcIiB5MT1cIjNcIiB4Mj1cIjEyXCIgeTI9XCIyMVwiLz48L3N2Zz5cbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gZGF0YS10ZXN0aWQ9XCJkcmF3YnRuLXJlZHVjZXJcIiBjbGFzc05hbWU9e2B3LTggaC04IHJvdW5kZWQgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgJHthY3RpdmVUb29sID09PSAnUkVEVUNFUicgPyAnYmctYmx1ZS02MDAgdGV4dC13aGl0ZScgOiAndGV4dC1zbGF0ZS00MDAgaG92ZXI6Ymctc2xhdGUtNzAwJ31gfSBvbkNsaWNrPXsoKSA9PiBkY0Rpc3BhdGNoKHsgdHlwZTogJ1NFVF9UT09MJywgcGF5bG9hZDogJ1JFRFVDRVInIH0pfSB0aXRsZT1cIlJlZHVjZXJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiPjxwb2x5Z29uIHBvaW50cz1cIjMgNCAyMSA4IDIxIDE2IDMgMjAgMyA0XCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBkYXRhLXRlc3RpZD1cImRyYXdidG4tc3VwcG9ydFwiIGNsYXNzTmFtZT17YHctOCBoLTggcm91bmRlZCBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciAke2FjdGl2ZVRvb2wgPT09ICdTVVBQT1JUJyA/ICdiZy1ibHVlLTYwMCB0ZXh0LXdoaXRlJyA6ICd0ZXh0LXNsYXRlLTQwMCBob3ZlcjpiZy1zbGF0ZS03MDAnfWB9IG9uQ2xpY2s9eygpID0+IGRjRGlzcGF0Y2goeyB0eXBlOiAnU0VUX1RPT0wnLCBwYXlsb2FkOiAnU1VQUE9SVCcgfSl9IHRpdGxlPVwiU3VwcG9ydFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHN2ZyBjbGFzc05hbWU9XCJ3LTQgaC00XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIyXCIgc3Ryb2tlTGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlTGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMTIgMjJWMTJcIi8+PHBhdGggZD1cIm01IDEyIDctNyA3IDdcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInctNiBoLXB4IGJnLXNsYXRlLTcwMCBteS0xXCI+PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIHsvKiDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbiAgICAgICAgICAgICAgICAgICAgLy8gU0hBUkVEIFRPT0w6IENPTk5FQ1RcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyB0b29sIGFsc28gZXhpc3RzIGluIHNyYy91aS90YWJzL0NhbnZhc1RhYi5qc3guXG4gICAgICAgICAgICAgICAgICAgIC8vIElmIG1vZGlmeWluZyBsb2dpYywgdXBkYXRlIEJPVEggZmlsZXMgYW5kIHJ1biBDaGVja3BvaW50IEYuXG4gICAgICAgICAgICAgICAgICAgIC8vIOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkCAqL31cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBkYXRhLXRlc3RpZD1cImRyYXdidG4tY29ubmVjdFwiIGNsYXNzTmFtZT17YHctOCBoLTggcm91bmRlZCBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciAke2FjdGl2ZVRvb2wgPT09ICdDT05ORUNUJyA/ICdiZy1ibHVlLTYwMCB0ZXh0LXdoaXRlJyA6ICd0ZXh0LXNsYXRlLTQwMCBob3ZlcjpiZy1zbGF0ZS03MDAnfWB9IG9uQ2xpY2s9eygpID0+IGRjRGlzcGF0Y2goeyB0eXBlOiAnU0VUX1RPT0wnLCBwYXlsb2FkOiAnQ09OTkVDVCcgfSl9IHRpdGxlPVwiQ29ubmVjdCBFbGVtZW50c1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHN2ZyBjbGFzc05hbWU9XCJ3LTQgaC00XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIyXCI+PHBhdGggZD1cIk0xMCAxM2E1IDUgMCAwIDAgNy41NC41NGwzLTNhNSA1IDAgMCAwLTcuMDctNy4wN2wtMS43MiAxLjcxXCIvPjxwYXRoIGQ9XCJNMTQgMTFhNSA1IDAgMCAwLTcuNTQtLjU0bC0zIDNhNSA1IDAgMCAwIDcuMDcgNy4wN2wxLjcxLTEuNzFcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICB7Lyog4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXG4gICAgICAgICAgICAgICAgICAgIC8vIFNIQVJFRCBUT09MOiBTVFJFVENIXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgdG9vbCBhbHNvIGV4aXN0cyBpbiBzcmMvdWkvdGFicy9DYW52YXNUYWIuanN4LlxuICAgICAgICAgICAgICAgICAgICAvLyBJZiBtb2RpZnlpbmcgbG9naWMsIHVwZGF0ZSBCT1RIIGZpbGVzIGFuZCBydW4gQ2hlY2twb2ludCBGLlxuICAgICAgICAgICAgICAgICAgICAvLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZAgKi99XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gZGF0YS10ZXN0aWQ9XCJkcmF3YnRuLXN0cmV0Y2hcIiBjbGFzc05hbWU9e2B3LTggaC04IHJvdW5kZWQgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgJHthY3RpdmVUb29sID09PSAnU1RSRVRDSCcgPyAnYmctYmx1ZS02MDAgdGV4dC13aGl0ZScgOiAndGV4dC1zbGF0ZS00MDAgaG92ZXI6Ymctc2xhdGUtNzAwJ31gfSBvbkNsaWNrPXsoKSA9PiBkY0Rpc3BhdGNoKHsgdHlwZTogJ1NFVF9UT09MJywgcGF5bG9hZDogJ1NUUkVUQ0gnIH0pfSB0aXRsZT1cIlN0cmV0Y2ggRWxlbWVudFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHN2ZyBjbGFzc05hbWU9XCJ3LTQgaC00XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIyXCI+PHBvbHlsaW5lIHBvaW50cz1cIjE1IDMgMjEgMyAyMSA5XCIvPjxwb2x5bGluZSBwb2ludHM9XCI5IDIxIDMgMjEgMyAxNVwiLz48bGluZSB4MT1cIjIxXCIgeDI9XCIxNFwiIHkxPVwiM1wiIHkyPVwiMTBcIi8+PGxpbmUgeDE9XCIzXCIgeDI9XCIxMFwiIHkxPVwiMjFcIiB5Mj1cIjE0XCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgey8qIOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxuICAgICAgICAgICAgICAgICAgICAvLyBTSEFSRUQgVE9PTDogQlJFQUsvQ1VUXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgdG9vbCBhbHNvIGV4aXN0cyBpbiBzcmMvdWkvdGFicy9DYW52YXNUYWIuanN4LlxuICAgICAgICAgICAgICAgICAgICAvLyBJZiBtb2RpZnlpbmcgbG9naWMsIHVwZGF0ZSBCT1RIIGZpbGVzIGFuZCBydW4gQ2hlY2twb2ludCBGLlxuICAgICAgICAgICAgICAgICAgICAvLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZAgKi99XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gZGF0YS10ZXN0aWQ9XCJkcmF3YnRuLWJyZWFrXCIgY2xhc3NOYW1lPXtgdy04IGgtOCByb3VuZGVkIGZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyICR7YWN0aXZlVG9vbCA9PT0gJ0JSRUFLJyA/ICdiZy1ibHVlLTYwMCB0ZXh0LXdoaXRlJyA6ICd0ZXh0LXNsYXRlLTQwMCBob3ZlcjpiZy1zbGF0ZS03MDAnfWB9IG9uQ2xpY2s9eygpID0+IGRjRGlzcGF0Y2goeyB0eXBlOiAnU0VUX1RPT0wnLCBwYXlsb2FkOiAnQlJFQUsnIH0pfSB0aXRsZT1cIkJyZWFrIEVsZW1lbnRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiPjxjaXJjbGUgY3g9XCI2XCIgY3k9XCI2XCIgcj1cIjNcIi8+PHBhdGggZD1cIk04LjEyIDguMTIgMTIgMTJcIi8+PHBhdGggZD1cIk0yMCA0IDguMTIgMTUuODhcIi8+PGNpcmNsZSBjeD1cIjZcIiBjeT1cIjE4XCIgcj1cIjNcIi8+PHBhdGggZD1cIk0xNC44IDE0LjggMjAgMjBcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICB7Lyog4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXG4gICAgICAgICAgICAgICAgICAgIC8vIFNIQVJFRCBUT09MOiBNRUFTVVJFXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgdG9vbCBhbHNvIGV4aXN0cyBpbiBzcmMvdWkvdGFicy9DYW52YXNUYWIuanN4LlxuICAgICAgICAgICAgICAgICAgICAvLyBJZiBtb2RpZnlpbmcgbG9naWMsIHVwZGF0ZSBCT1RIIGZpbGVzIGFuZCBydW4gQ2hlY2twb2ludCBGLlxuICAgICAgICAgICAgICAgICAgICAvLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZAgKi99XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gZGF0YS10ZXN0aWQ9XCJkcmF3YnRuLW1lYXN1cmVcIiBjbGFzc05hbWU9e2B3LTggaC04IHJvdW5kZWQgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgJHthY3RpdmVUb29sID09PSAnTUVBU1VSRScgPyAnYmctYmx1ZS02MDAgdGV4dC13aGl0ZScgOiAndGV4dC1zbGF0ZS00MDAgaG92ZXI6Ymctc2xhdGUtNzAwJ31gfSBvbkNsaWNrPXsoKSA9PiBkY0Rpc3BhdGNoKHsgdHlwZTogJ1NFVF9UT09MJywgcGF5bG9hZDogJ01FQVNVUkUnIH0pfSB0aXRsZT1cIk1lYXN1cmUgRGlzdGFuY2VcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiPjxyZWN0IHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCI4XCIgeD1cIjJcIiB5PVwiOFwiIHJ4PVwiMlwiIHJ5PVwiMlwiLz48cGF0aCBkPVwiTTYgOHY0XCIvPjxwYXRoIGQ9XCJNMTAgOHY0XCIvPjxwYXRoIGQ9XCJNMTQgOHY0XCIvPjxwYXRoIGQ9XCJNMTggOHY0XCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ3LTYgaC1weCBiZy1zbGF0ZS03MDAgbXktMVwiPjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzTmFtZT17YHctOCBoLTggcm91bmRlZCBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciB0ZXh0LXNsYXRlLTQwMCBob3ZlcjpiZy1zbGF0ZS03MDAgaG92ZXI6dGV4dC13aGl0ZWB9IG9uQ2xpY2s9eygpID0+IGRjRGlzcGF0Y2goeyB0eXBlOiAnVU5ETycgfSl9IHRpdGxlPVwiVW5kbyBMYXN0IEVsZW1lbnRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiIHN0cm9rZUxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZUxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTMgN3Y2aDZcIi8+PHBhdGggZD1cIk0yMSAxN2E5IDkgMCAwIDAtOS05IDkgOSAwIDAgMC02IDIuM0wzIDEzXCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9e2B3LTggaC04IHJvdW5kZWQgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgJHtzdGF0ZS5tdWx0aVNlbGVjdGVkSW5kaWNlcy5sZW5ndGggPiAwIHx8IHNlbGVjdGVkSW5kZXggIT09IG51bGwgPyAndGV4dC1yZWQtNDAwIGhvdmVyOmJnLXJlZC05MDAvNTAnIDogJ3RleHQtc2xhdGUtNjAwIGN1cnNvci1ub3QtYWxsb3dlZCd9YH0gZGlzYWJsZWQ9e3N0YXRlLm11bHRpU2VsZWN0ZWRJbmRpY2VzLmxlbmd0aCA9PT0gMCAmJiBzZWxlY3RlZEluZGV4ID09PSBudWxsfSBvbkNsaWNrPXsoKSA9PiBkY0Rpc3BhdGNoKHsgdHlwZTogJ0RFTEVURV9TRUxFQ1RFRCcgfSl9IHRpdGxlPVwiRGVsZXRlIFNlbGVjdGVkIEVsZW1lbnQocylcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgY2xhc3NOYW1lPVwidy00IGgtNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiPjxwYXRoIGQ9XCJNMyA2aDE4XCIvPjxwYXRoIGQ9XCJNMTkgNnYxNGEyIDIgMCAwIDEtMiAySDdhMiAyIDAgMCAxLTItMlY2bTMgMFY0YTIgMiAwIDAgMSAyLTJoNGEyIDIgMCAwIDEgMiAydjJcIi8+PGxpbmUgeDE9XCIxMFwiIHkxPVwiMTFcIiB4Mj1cIjEwXCIgeTI9XCIxN1wiLz48bGluZSB4MT1cIjE0XCIgeTE9XCIxMVwiIHgyPVwiMTRcIiB5Mj1cIjE3XCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9e2B3LTggaC04IHJvdW5kZWQgZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgJHtzdGF0ZS5tdWx0aVNlbGVjdGVkSW5kaWNlcy5sZW5ndGggPiAwIHx8IHNlbGVjdGVkSW5kZXggIT09IG51bGwgPyAndGV4dC1zbGF0ZS00MDAgaG92ZXI6Ymctc2xhdGUtNzAwIGhvdmVyOnRleHQtd2hpdGUnIDogJ3RleHQtc2xhdGUtNjAwIGN1cnNvci1ub3QtYWxsb3dlZCd9YH0gZGlzYWJsZWQ9e3N0YXRlLm11bHRpU2VsZWN0ZWRJbmRpY2VzLmxlbmd0aCA9PT0gMCAmJiBzZWxlY3RlZEluZGV4ID09PSBudWxsfSBvbkNsaWNrPXsoKSA9PiBkY0Rpc3BhdGNoKHsgdHlwZTogJ0hJREVfU0VMRUNURUQnIH0pfSB0aXRsZT1cIkhpZGUgU2VsZWN0ZWQgRWxlbWVudChzKVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHN2ZyBjbGFzc05hbWU9XCJ3LTQgaC00XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlV2lkdGg9XCIyXCI+PHBhdGggZD1cIk05Ljg4IDkuODhhMyAzIDAgMSAwIDQuMjQgNC4yNFwiLz48cGF0aCBkPVwiTTEwLjczIDUuMDhBMTAuNDMgMTAuNDMgMCAwIDEgMTIgNWM3IDAgMTAgNyAxMCA3YTEzLjE2IDEzLjE2IDAgMCAxLTEuNjcgMi42OFwiLz48cGF0aCBkPVwiTTYuNjEgNi42MUExMy41MjYgMTMuNTI2IDAgMCAwIDIgMTJzMyA3IDEwIDdhOS43NCA5Ljc0IDAgMCAwIDUuMzktMS42MVwiLz48bGluZSB4MT1cIjJcIiB4Mj1cIjIyXCIgeTE9XCIyXCIgeTI9XCIyMlwiLz48L3N2Zz5cbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPXtgdy04IGgtOCByb3VuZGVkIGZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIHRleHQtc2xhdGUtNDAwIGhvdmVyOmJnLXNsYXRlLTcwMCBob3Zlcjp0ZXh0LXdoaXRlYH0gb25DbGljaz17KCkgPT4gZGNEaXNwYXRjaCh7IHR5cGU6ICdVTkhJREVfQUxMJyB9KX0gdGl0bGU9XCJVbmhpZGUgQWxsXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3ZnIGNsYXNzTmFtZT1cInctNCBoLTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2VXaWR0aD1cIjJcIj48cGF0aCBkPVwiTTIgMTJzMy03IDEwLTcgMTAgNyAxMCA3LTMgNy0xMCA3LTEwLTctMTAtN1pcIi8+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIzXCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgIHsvKiBNYWluIENhbnZhcyBBcmVhICovfVxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleC0xIHJlbGF0aXZlIGJnLXNsYXRlLTk1MFwiPlxuICAgICAgICAgICAgICAgICAgICA8Q2FudmFzXG4gICAgICAgICAgICAgICAgICAgICAgICBkcHI9e2FwcFNldHRpbmdzLmxpbWl0UGl4ZWxSYXRpbyA/IE1hdGgubWluKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvLCAxLjUpIDogd2luZG93LmRldmljZVBpeGVsUmF0aW99XG4gICAgICAgICAgICAgICAgICAgICAgICBnbD17eyBhbnRpYWxpYXM6ICFhcHBTZXR0aW5ncy5kaXNhYmxlQUEgfX1cbiAgICAgICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICAgICAge2xvY2FsT3J0aG9Nb2RlID8gKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxPcnRob2dyYXBoaWNDYW1lcmEgbWFrZURlZmF1bHQgcG9zaXRpb249e1s1MDAwLCA1MDAwLCA1MDAwXX0gem9vbT17MC4yfSBuZWFyPXswLjF9IGZhcj17NTAwMDAwfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgKSA6IChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8UGVyc3BlY3RpdmVDYW1lcmEgbWFrZURlZmF1bHQgcG9zaXRpb249e1s1MDAwLCA1MDAwLCA1MDAwXX0gZm92PXthcHBTZXR0aW5ncy5jYW1lcmFGb3Z9IG5lYXI9e2FwcFNldHRpbmdzLmNhbWVyYU5lYXIgfHwgMX0gZmFyPXthcHBTZXR0aW5ncy5jYW1lcmFGYXIgfHwgNTAwMDAwfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgKX1cblxuICAgICAgICAgICAgICAgICAgICAgICAgPERyYXdDYW52YXNfRHJhd0NhbnZhc0NvbnRyb2xzIG9ydGhvTW9kZT17bG9jYWxPcnRob01vZGV9IC8+XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxjb2xvciBhdHRhY2g9XCJiYWNrZ3JvdW5kXCIgYXJncz17W2FwcFNldHRpbmdzLmJhY2tncm91bmRDb2xvciB8fCAnIzBkMTExNyddfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGFtYmllbnRMaWdodCBpbnRlbnNpdHk9ezAuNn0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXJlY3Rpb25hbExpZ2h0IHBvc2l0aW9uPXtbMTAwMCwgMTAwMCwgNTAwXX0gaW50ZW5zaXR5PXsxLjV9IC8+XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxncmlkSGVscGVyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXJncz17W1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAxMDAwMDAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIE1hdGgucm91bmQoMTAwMDAwIC8gZ3JpZENvbmZpZy5kZW5zaXR5KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLkNvbG9yKCcjM2E0MjU1JykubXVsdGlwbHlTY2FsYXIoZ3JpZENvbmZpZy5vcGFjaXR5ICogMiksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5Db2xvcignIzI1MmEzYScpLm11bHRpcGx5U2NhbGFyKGdyaWRDb25maWcub3BhY2l0eSAqIDIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbj17WzAsIC0xLCAwXX1cbiAgICAgICAgICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgICAgICAgICA8YXhlc0hlbHBlciBhcmdzPXtbNTAwXX0gLz5cblxuICAgICAgICAgICAgICAgICAgICAgICAgPERyYXdDYW52YXNfRHJhd25Db21wb25lbnRzIHBpcGVzPXtkcmF3blBpcGVzfSBhcHBTZXR0aW5ncz17YXBwU2V0dGluZ3N9IHNlbGVjdGVkSW5kaWNlcz17c3RhdGUubXVsdGlTZWxlY3RlZEluZGljZXMubGVuZ3RoID4gMCA/IHN0YXRlLm11bHRpU2VsZWN0ZWRJbmRpY2VzIDogKHNlbGVjdGVkSW5kZXggIT09IG51bGwgPyBbc2VsZWN0ZWRJbmRleF0gOiBbXSl9IGhpZGRlbkluZGljZXM9e3N0YXRlLmhpZGRlbkluZGljZXN9IGRjRGlzcGF0Y2g9e2RjRGlzcGF0Y2h9IGFjdGl2ZVRvb2w9e2FjdGl2ZVRvb2x9IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICA8RHJhd0NhbnZhc19EcmF3VG9vbCBhY3RpdmVUb29sPXthY3RpdmVUb29sfSBkcmF3blBpcGVzPXtkcmF3blBpcGVzfSBkY0Rpc3BhdGNoPXtkY0Rpc3BhdGNofSBncmlkQ29uZmlnPXtncmlkQ29uZmlnfSBvbkN1cnNvck1vdmU9e3NldEN1cnNvcldvcmxkUG9zfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgPERyYXdDYW52YXNfTWVhc3VyZVRvb2wgYWN0aXZlVG9vbD17YWN0aXZlVG9vbH0gYXBwU2V0dGluZ3M9e2FwcFNldHRpbmdzfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgPERyYXdDYW52YXNfQnJlYWtQaXBlTGF5ZXIgYWN0aXZlVG9vbD17YWN0aXZlVG9vbH0gZHJhd25QaXBlcz17ZHJhd25QaXBlc30gZGNEaXNwYXRjaD17ZGNEaXNwYXRjaH0gYXBwU2V0dGluZ3M9e2FwcFNldHRpbmdzfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgPERyYXdDYW52YXNfRW5kcG9pbnRTbmFwTGF5ZXIgYWN0aXZlVG9vbD17YWN0aXZlVG9vbH0gZHJhd25QaXBlcz17ZHJhd25QaXBlc30gZGNEaXNwYXRjaD17ZGNEaXNwYXRjaH0gYXBwU2V0dGluZ3M9e2FwcFNldHRpbmdzfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgPERyYXdDYW52YXNfQ29udmVyc2lvblRvb2xzIGFjdGl2ZVRvb2w9e2FjdGl2ZVRvb2x9IGRyYXduUGlwZXM9e2RyYXduUGlwZXN9IGRjRGlzcGF0Y2g9e2RjRGlzcGF0Y2h9IGFwcFNldHRpbmdzPXthcHBTZXR0aW5nc30gLz5cblxuICAgICAgICAgICAgICAgICAgICAgICAgPE9yYml0Q29udHJvbHNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVkPXtjb250cm9sc0VuYWJsZWR9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWFrZURlZmF1bHRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVEYW1waW5nXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGFtcGluZ0ZhY3Rvcj17MC4xfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vdXNlQnV0dG9ucz17bW91c2VCdXR0b25zfVxuICAgICAgICAgICAgICAgICAgICAgICAgLz5cblxuICAgICAgICAgICAgICAgICAgICAgICAgPFZpZXdDdWJlIGN1c3RvbUV2ZW50TmFtZT1cImRyYXctY2FudmFzLXNldC12aWV3XCIgLz5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxHaXptb0hlbHBlciBhbGlnbm1lbnQ9XCJib3R0b20tcmlnaHRcIiBtYXJnaW49e1s2MCwgNjBdfT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8R2l6bW9WaWV3cG9ydCBheGlzQ29sb3JzPXtbJyNlZjQ0NDQnLCAnIzEwYjk4MScsICcjM2I4MmY2J119IGxhYmVsQ29sb3I9XCJ3aGl0ZVwiIC8+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L0dpem1vSGVscGVyPlxuICAgICAgICAgICAgICAgICAgICA8L0NhbnZhcz5cblxuICAgICAgICAgICAgICAgICAgICB7LyogQm90dG9tIFN0YXR1cyBCYXIgKi99XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYWJzb2x1dGUgYm90dG9tLTAgbGVmdC0wIHJpZ2h0LTAgaC04IGJnLXNsYXRlLTkwMCBib3JkZXItdCBib3JkZXItc2xhdGUtNzAwIGZsZXggaXRlbXMtY2VudGVyIHB4LTQgdGV4dC14cyB0ZXh0LXNsYXRlLTQwMCBqdXN0aWZ5LWJldHdlZW5cIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBnYXAtNFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuPlRvb2w6IDxzdHJvbmc+e2FjdGl2ZVRvb2wucmVwbGFjZSgnXycsICcgJyl9PC9zdHJvbmc+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuPlNuYXA6IEdyaWQrRW5kcG9pbnQ8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBnYXAtNFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuPlg6IHtjdXJzb3JXb3JsZFBvcy54LnRvRml4ZWQoMSl9IFk6IHtjdXJzb3JXb3JsZFBvcy55LnRvRml4ZWQoMSl9IFo6IHtjdXJzb3JXb3JsZFBvcy56LnRvRml4ZWQoMSl9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuPkNvbXBvbmVudHM6IHtkcmF3blBpcGVzLmxlbmd0aH08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICB7LyogUmlnaHQgUHJvcGVydGllcyBQYW5lbCAoMzAwcHgpICovfVxuICAgICAgICAgICAgICAgIHtpc1BhbmVsT3BlbiAmJiAoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBnZXRQYW5lbE1vZGUoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYWN0aXZlVG9vbCAmJiBbJ0JSRUFLJywgJ01FQVNVUkUnLCAnQ09OTkVDVCcsICdTVFJFVENIJ10uaW5jbHVkZXMoYWN0aXZlVG9vbCkpIHJldHVybiAnUkVBRF9PTkxZJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5tdWx0aVNlbGVjdGVkSW5kaWNlcz8ubGVuZ3RoID4gMSkgcmV0dXJuICdNVUxUSV9SRVNUUklDVEVEJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzZWxlY3RlZEluZGV4ID09PSBudWxsKSByZXR1cm4gJ0hJRERFTic7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gJ1NJTkdMRV9FRElUJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYW5lbE1vZGUgPSBnZXRQYW5lbE1vZGUoKTtcblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ3LVszMDBweF0gYmctc2xhdGUtOTAwIGJvcmRlci1sIGJvcmRlci1zbGF0ZS03MDAgZmxleCBmbGV4LWNvbCB6LTEwIHNocmluay0wXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXIgcC0zIGJvcmRlci1iIGJvcmRlci1zbGF0ZS03MDAgYmctc2xhdGUtODAwXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtYm9sZCB0ZXh0LXhzIHRleHQtc2xhdGUtMjAwXCI+UFJPUEVSVElFUzwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXsoKSA9PiBzZXRJc1BhbmVsT3BlbihmYWxzZSl9IGNsYXNzTmFtZT1cInRleHQtc2xhdGUtNDAwIGhvdmVyOnRleHQtd2hpdGVcIj7inJU8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInAtNCBmbGV4IGZsZXgtY29sIGdhcC00IG92ZXJmbG93LXktYXV0b1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7cGFuZWxNb2RlID09PSAnSElEREVOJyAmJiAoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtc2xhdGUtNDAwIHRleHQtc20gaXRhbGljIHRleHQtY2VudGVyXCI+U2VsZWN0IGEgc2luZ2xlIGNvbXBvbmVudCB0byBlZGl0IHByb3BlcnRpZXMuPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtwYW5lbE1vZGUgPT09ICdNVUxUSV9SRVNUUklDVEVEJyAmJiAoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtcHVycGxlLTQwMCB0ZXh0LXNtIGZvbnQtYm9sZCB0ZXh0LWNlbnRlciBiZy1wdXJwbGUtOTAwLzMwIHAtMiByb3VuZGVkIGJvcmRlciBib3JkZXItcHVycGxlLTgwMC81MFwiPk11bHRpcGxlIGl0ZW1zIHNlbGVjdGVkLiBCdWxrIGVkaXQgbm90IHN1cHBvcnRlZCBpbiBEcmF3IENhbnZhcy48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAge3BhbmVsTW9kZSA9PT0gJ1JFQURfT05MWScgJiYgc2VsZWN0ZWRJbmRleCAhPT0gbnVsbCAmJiAoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtYW1iZXItNDAwIHRleHQtc20gaXRhbGljIHRleHQtY2VudGVyIG1iLTJcIj5Qcm9wZXJ0aWVzIGFyZSByZWFkLW9ubHkgd2hpbGUgdXNpbmcgZGVzdHJ1Y3RpdmUgdG9vbHMgKHthY3RpdmVUb29sfSkuPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHsocGFuZWxNb2RlID09PSAnU0lOR0xFX0VESVQnIHx8IChwYW5lbE1vZGUgPT09ICdSRUFEX09OTFknICYmIHNlbGVjdGVkSW5kZXggIT09IG51bGwpKSAmJiAoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBmbGV4LWNvbCBnYXAtMVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPVwidGV4dC14cyB0ZXh0LXNsYXRlLTUwMCB1cHBlcmNhc2VcIj5MZW5ndGggKG1tKTwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZT1cInRleHRcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwiYmctc2xhdGUtOTUwIGJvcmRlciBib3JkZXItc2xhdGUtNzAwIHJvdW5kZWQgcC0xIHRleHQtc20gdGV4dC1zbGF0ZS0yMDAgb3V0bGluZS1ub25lIGZvY3VzOmJvcmRlci1ibHVlLTUwMCBkaXNhYmxlZDpvcGFjaXR5LTUwIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZFwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZT17ZHJhd25QaXBlc1tzZWxlY3RlZEluZGV4XS5lcDEgJiYgZHJhd25QaXBlc1tzZWxlY3RlZEluZGV4XS5lcDIgPyBuZXcgVEhSRUUuVmVjdG9yMyhkcmF3blBpcGVzW3NlbGVjdGVkSW5kZXhdLmVwMS54LCBkcmF3blBpcGVzW3NlbGVjdGVkSW5kZXhdLmVwMS55LCBkcmF3blBpcGVzW3NlbGVjdGVkSW5kZXhdLmVwMS56KS5kaXN0YW5jZVRvKG5ldyBUSFJFRS5WZWN0b3IzKGRyYXduUGlwZXNbc2VsZWN0ZWRJbmRleF0uZXAyLngsIGRyYXduUGlwZXNbc2VsZWN0ZWRJbmRleF0uZXAyLnksIGRyYXduUGlwZXNbc2VsZWN0ZWRJbmRleF0uZXAyLnopKS50b0ZpeGVkKDEpIDogJy0nfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGlzYWJsZWQ9e3BhbmVsTW9kZSA9PT0gJ1JFQURfT05MWSd9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByYXcgPSBTdHJpbmcoZS50YXJnZXQudmFsdWUpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdMZW4gPSBOdW1iZXIocmF3KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuZXdMZW4pIHx8IG5ld0xlbiA8PSAwKSByZXR1cm47XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwID0gZHJhd25QaXBlc1tzZWxlY3RlZEluZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwMSA9IG5ldyBUSFJFRS5WZWN0b3IzKHAuZXAxLngsIHAuZXAxLnksIHAuZXAxLnopO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHAyID0gbmV3IFRIUkVFLlZlY3RvcjMocC5lcDIueCwgcC5lcDIueSwgcC5lcDIueik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlyID0gcDIuY2xvbmUoKS5zdWIocDEpLm5vcm1hbGl6ZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld1AyID0gcDEuY2xvbmUoKS5hZGQoZGlyLm11bHRpcGx5U2NhbGFyKG5ld0xlbikpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRjRGlzcGF0Y2goeyB0eXBlOiAnVVBEQVRFX0NPTVBPTkVOVCcsIHBheWxvYWQ6IHsgaW5kZXg6IHNlbGVjdGVkSW5kZXgsIGNvbXBvbmVudDogeyAuLi5wLCBlcDI6IHsgeDogbmV3UDIueCwgeTogbmV3UDIueSwgejogbmV3UDIueiB9IH0gfSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGZsZXgtY29sIGdhcC0xXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzc05hbWU9XCJ0ZXh0LXhzIHRleHQtc2xhdGUtNTAwIHVwcGVyY2FzZVwiPkJvcmUgKG1tKTwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZT1cInRleHRcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwiYmctc2xhdGUtOTUwIGJvcmRlciBib3JkZXItc2xhdGUtNzAwIHJvdW5kZWQgcC0xIHRleHQtc20gdGV4dC1zbGF0ZS0yMDAgb3V0bGluZS1ub25lIGZvY3VzOmJvcmRlci1ibHVlLTUwMCBkaXNhYmxlZDpvcGFjaXR5LTUwIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZFwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZT17ZHJhd25QaXBlc1tzZWxlY3RlZEluZGV4XS5ib3JlIHx8ICctJ31cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpc2FibGVkPXtwYW5lbE1vZGUgPT09ICdSRUFEX09OTFknfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmF3ID0gU3RyaW5nKGUudGFyZ2V0LnZhbHVlKS50cmltKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV3Qm9yZSA9IE51bWJlcihyYXcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG5ld0JvcmUpIHx8IG5ld0JvcmUgPD0gMCkgcmV0dXJuO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGNEaXNwYXRjaCh7IHR5cGU6ICdVUERBVEVfQ09NUE9ORU5UJywgcGF5bG9hZDogeyBpbmRleDogc2VsZWN0ZWRJbmRleCwgY29tcG9uZW50OiB7IC4uLmRyYXduUGlwZXNbc2VsZWN0ZWRJbmRleF0sIGJvcmU6IG5ld0JvcmUgfSB9IH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC1jb2wgZ2FwLTFcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS01MDAgdXBwZXJjYXNlXCI+U2NoZWR1bGU8L2xhYmVsPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgZGlzYWJsZWQ9e3BhbmVsTW9kZSA9PT0gJ1JFQURfT05MWSd9IHR5cGU9XCJ0ZXh0XCIgY2xhc3NOYW1lPVwiYmctc2xhdGUtOTUwIGJvcmRlciBib3JkZXItc2xhdGUtNzAwIHJvdW5kZWQgcC0xIHRleHQtc20gdGV4dC1zbGF0ZS0yMDAgb3V0bGluZS1ub25lIGZvY3VzOmJvcmRlci1ibHVlLTUwMCBkaXNhYmxlZDpvcGFjaXR5LTUwIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZFwiIHZhbHVlPVwiLVwiIG9uQ2hhbmdlPXsoKSA9PiB7fX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfSkoKX1cbiAgICAgICAgICAgICAgICB7IWlzUGFuZWxPcGVuICYmIChcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXsoKSA9PiBzZXRJc1BhbmVsT3Blbih0cnVlKX0gY2xhc3NOYW1lPVwiYWJzb2x1dGUgdG9wLTE0IHJpZ2h0LTMgYmctc2xhdGUtODAwIHRleHQtc2xhdGUtMzAwIGJvcmRlciBib3JkZXItc2xhdGUtNzAwIHB4LTIgcHktMSByb3VuZGVkIHotMjAgaG92ZXI6dGV4dC13aGl0ZSBob3ZlcjpiZy1zbGF0ZS03MDAgdGV4dC1bMTFweF0gZm9udC1zZW1pYm9sZFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgT3BlbiBQcm9wZXJ0aWVzXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgey8qIEJvdHRvbSBDb21wb25lbnQgTGlzdCAoQ29sbGFwc2libGUsIDE1MHB4KSAqL31cbiAgICAgICAgICAgIHtpc0xpc3RPcGVuICYmIChcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImgtWzE1MHB4XSBiZy1zbGF0ZS05MDAgYm9yZGVyLXQgYm9yZGVyLXNsYXRlLTcwMCBmbGV4IGZsZXgtY29sIHotMTAgc2hyaW5rLTAgcmVsYXRpdmVcIj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGp1c3RpZnktYmV0d2VlbiBpdGVtcy1jZW50ZXIgcHgtNCBweS0xIGJnLXNsYXRlLTgwMCBib3JkZXItYiBib3JkZXItc2xhdGUtNzAwXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJmb250LWJvbGQgdGV4dC14cyB0ZXh0LXNsYXRlLTIwMFwiPkNPTVBPTkVOVCBMSVNUPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXsoKSA9PiBzZXRJc0xpc3RPcGVuKGZhbHNlKX0gY2xhc3NOYW1lPVwidGV4dC1zbGF0ZS00MDAgaG92ZXI6dGV4dC13aGl0ZSB0ZXh0LXhzXCI+4pa8IEhpZGU8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleC0xIG92ZXJmbG93LWF1dG8gYmctc2xhdGUtOTUwIHAtMlwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHRhYmxlIGNsYXNzTmFtZT1cInctZnVsbCB0ZXh0LWxlZnQgdGV4dC14cyB0ZXh0LXNsYXRlLTQwMCBib3JkZXItY29sbGFwc2VcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8dGhlYWQ+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDx0ciBjbGFzc05hbWU9XCJib3JkZXItYiBib3JkZXItc2xhdGUtODAwXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8dGggY2xhc3NOYW1lPVwicHktMSBweC0yIGZvbnQtbWVkaXVtXCI+IzwvdGg+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8dGggY2xhc3NOYW1lPVwicHktMSBweC0yIGZvbnQtbWVkaXVtXCI+VHlwZTwvdGg+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8dGggY2xhc3NOYW1lPVwicHktMSBweC0yIGZvbnQtbWVkaXVtXCI+TGVuZ3RoPC90aD5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDx0aCBjbGFzc05hbWU9XCJweS0xIHB4LTIgZm9udC1tZWRpdW1cIj5Cb3JlPC90aD5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDx0aCBjbGFzc05hbWU9XCJweS0xIHB4LTIgZm9udC1tZWRpdW1cIj5FUDE8L3RoPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHRoIGNsYXNzTmFtZT1cInB5LTEgcHgtMiBmb250LW1lZGl1bVwiPkVQMjwvdGg+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvdHI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC90aGVhZD5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8dGJvZHk+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtkcmF3blBpcGVzLmxlbmd0aCA9PT0gMCA/IChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDx0cj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8dGQgY29sU3Bhbj1cIjZcIiBjbGFzc05hbWU9XCJweS00IHRleHQtY2VudGVyIHRleHQtc2xhdGUtNjAwIGl0YWxpY1wiPk5vIGNvbXBvbmVudHMgZHJhd24geWV0LjwvdGQ+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L3RyPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApIDogKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZHJhd25QaXBlcy5tYXAoKHAsIGkpID0+IChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8dHIga2V5PXtpfSBjbGFzc05hbWU9e2Bib3JkZXItYiBib3JkZXItc2xhdGUtODAwIGN1cnNvci1wb2ludGVyICR7c2VsZWN0ZWRJbmRleCA9PT0gaSA/ICdiZy1ibHVlLTkwMC8zMCcgOiAnaG92ZXI6Ymctc2xhdGUtOTAwJ31gfSBvbkNsaWNrPXsoKSA9PiBkY0Rpc3BhdGNoKHsgdHlwZTogJ1NFTEVDVCcsIHBheWxvYWQ6IGkgfSl9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8dGQgY2xhc3NOYW1lPVwicHktMSBweC0yXCI+e2krMX08L3RkPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8dGQgY2xhc3NOYW1lPVwicHktMSBweC0yIHRleHQtYmx1ZS00MDAgZm9udC1ib2xkXCI+e3AudHlwZX08L3RkPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8dGQgY2xhc3NOYW1lPVwicHktMSBweC0yXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7cC50eXBlID09PSAnUElQRScgPyAoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU9XCJudW1iZXJcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZT17bmV3IFRIUkVFLlZlY3RvcjMocC5lcDEueCwgcC5lcDEueSwgcC5lcDEueikuZGlzdGFuY2VUbyhuZXcgVEhSRUUuVmVjdG9yMyhwLmVwMi54LCBwLmVwMi55LCBwLmVwMi56KSkudG9GaXhlZCgxKX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdMZW4gPSBwYXJzZUZsb2F0KGUudGFyZ2V0LnZhbHVlKSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcDEgPSBuZXcgVEhSRUUuVmVjdG9yMyhwLmVwMS54LCBwLmVwMS55LCBwLmVwMS56KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHAyID0gbmV3IFRIUkVFLlZlY3RvcjMocC5lcDIueCwgcC5lcDIueSwgcC5lcDIueik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkaXIgPSBwMi5jbG9uZSgpLnN1YihwMSkubm9ybWFsaXplKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdQMiA9IHAxLmNsb25lKCkuYWRkKGRpci5tdWx0aXBseVNjYWxhcihuZXdMZW4pKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGNEaXNwYXRjaCh7IHR5cGU6ICdVUERBVEVfQ09NUE9ORU5UJywgcGF5bG9hZDogeyBpbmRleDogaSwgY29tcG9uZW50OiB7IC4uLnAsIGVwMjogeyB4OiBuZXdQMi54LCB5OiBuZXdQMi55LCB6OiBuZXdQMi56IH0gfSB9IH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJ3LTI0IGJnLXNsYXRlLTk1MCBib3JkZXIgYm9yZGVyLXNsYXRlLTcwMCBweC0xIHB5LTAuNSByb3VuZGVkIHRleHQtc2xhdGUtMzAwIG91dGxpbmUtbm9uZSBmb2N1czpib3JkZXItYmx1ZS01MDBcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApIDogJy0nfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L3RkPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8dGQgY2xhc3NOYW1lPVwicHktMSBweC0yXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlPVwibnVtYmVyXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZT17cC5ib3JlfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdWYWwgPSBwYXJzZUZsb2F0KGUudGFyZ2V0LnZhbHVlKSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkY0Rpc3BhdGNoKHsgdHlwZTogJ1VQREFURV9DT01QT05FTlQnLCBwYXlsb2FkOiB7IGluZGV4OiBpLCBjb21wb25lbnQ6IHsgLi4ucCwgYm9yZTogbmV3VmFsIH0gfSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cInctMTYgYmctc2xhdGUtOTUwIGJvcmRlciBib3JkZXItc2xhdGUtNzAwIHB4LTEgcHktMC41IHJvdW5kZWQgdGV4dC1zbGF0ZS0zMDAgb3V0bGluZS1ub25lIGZvY3VzOmJvcmRlci1ibHVlLTUwMFwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L3RkPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8dGQgY2xhc3NOYW1lPVwicHktMSBweC0yXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlPVwidGV4dFwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU9e2Ake3AuZXAxLngudG9GaXhlZCgwKX0sICR7cC5lcDEueS50b0ZpeGVkKDApfSwgJHtwLmVwMS56LnRvRml4ZWQoMCl9YH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFydHMgPSBlLnRhcmdldC52YWx1ZS5zcGxpdCgnLCcpLm1hcChuID0+IHBhcnNlRmxvYXQobi50cmltKCkpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMyAmJiBwYXJ0cy5ldmVyeShuID0+ICFpc05hTihuKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRjRGlzcGF0Y2goeyB0eXBlOiAnVVBEQVRFX0NPTVBPTkVOVCcsIHBheWxvYWQ6IHsgaW5kZXg6IGksIGNvbXBvbmVudDogeyAuLi5wLCBlcDE6IHsgeDogcGFydHNbMF0sIHk6IHBhcnRzWzFdLCB6OiBwYXJ0c1syXSB9IH0gfSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwidy0zMiBiZy1zbGF0ZS05NTAgYm9yZGVyIGJvcmRlci1zbGF0ZS03MDAgcHgtMSBweS0wLjUgcm91bmRlZCB0ZXh0LXNsYXRlLTMwMCBvdXRsaW5lLW5vbmUgZm9jdXM6Ym9yZGVyLWJsdWUtNTAwXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvdGQ+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDx0ZCBjbGFzc05hbWU9XCJweS0xIHB4LTJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU9XCJ0ZXh0XCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZT17YCR7cC5lcDIueC50b0ZpeGVkKDApfSwgJHtwLmVwMi55LnRvRml4ZWQoMCl9LCAke3AuZXAyLnoudG9GaXhlZCgwKX1gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJ0cyA9IGUudGFyZ2V0LnZhbHVlLnNwbGl0KCcsJykubWFwKG4gPT4gcGFyc2VGbG9hdChuLnRyaW0oKSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID09PSAzICYmIHBhcnRzLmV2ZXJ5KG4gPT4gIWlzTmFOKG4pKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGNEaXNwYXRjaCh7IHR5cGU6ICdVUERBVEVfQ09NUE9ORU5UJywgcGF5bG9hZDogeyBpbmRleDogaSwgY29tcG9uZW50OiB7IC4uLnAsIGVwMjogeyB4OiBwYXJ0c1swXSwgeTogcGFydHNbMV0sIHo6IHBhcnRzWzJdIH0gfSB9IH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJ3LTMyIGJnLXNsYXRlLTk1MCBib3JkZXIgYm9yZGVyLXNsYXRlLTcwMCBweC0xIHB5LTAuNSByb3VuZGVkIHRleHQtc2xhdGUtMzAwIG91dGxpbmUtbm9uZSBmb2N1czpib3JkZXItYmx1ZS01MDBcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC90ZD5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L3RyPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L3Rib2R5PlxuICAgICAgICAgICAgICAgICAgICAgICAgPC90YWJsZT5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICApfVxuICAgICAgICAgICAgeyFpc0xpc3RPcGVuICYmIChcbiAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IHNldElzTGlzdE9wZW4odHJ1ZSl9IGNsYXNzTmFtZT1cImFic29sdXRlIGJvdHRvbS0wIGxlZnQtMS8yIC10cmFuc2xhdGUteC0xLzIgYmctc2xhdGUtODAwIHRleHQtc2xhdGUtNDAwIGJvcmRlciBib3JkZXItYi0wIGJvcmRlci1zbGF0ZS03MDAgcHgtNCBweS0xIHJvdW5kZWQtdCB6LTIwIGhvdmVyOnRleHQtd2hpdGUgaG92ZXI6Ymctc2xhdGUtNzAwIHRleHQteHMgZm9udC1ib2xkIHNoYWRvdy1sZ1wiPlxuICAgICAgICAgICAgICAgICAgICDilrIgU0hPVyBDT01QT05FTlQgTElTVFxuICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgKX1cbiAgICAgICAgPC9kaXY+XG4gICAgKTtcbn1cbiJdLCJtYXBwaW5ncyI6IkFBQUEsT0FBT0EsS0FBSyxJQUFJQyxRQUFRLEVBQUVDLFNBQVMsRUFBRUMsVUFBVSxRQUFRLE9BQU87QUFDOUQsU0FBU0MsTUFBTSxFQUFFQyxRQUFRLFFBQVEsb0JBQW9CO0FBQ3JELFNBQVNDLFFBQVEsUUFBUSxzQkFBc0I7QUFDL0MsU0FBU0MsYUFBYSxRQUFRLHdCQUF3QjtBQUN0RCxTQUFTQyxpQkFBaUIsRUFBRUMsWUFBWSxRQUFRLCtCQUErQjtB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
