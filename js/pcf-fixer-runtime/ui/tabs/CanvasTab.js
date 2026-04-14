import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Html, Text, GizmoHelper, GizmoViewport, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '/js/pcf-fixer-runtime/store/useStore.js';
import { useAppContext } from '/js/pcf-fixer-runtime/store/AppContext.js';
import { applyFixes } from '/js/pcf-fixer-runtime/engine/FixApplicator.js';
import { createLogger } from '/js/pcf-fixer-runtime/utils/Logger.js';
import { fix6mmGaps, fix25mmGapsWithPipe, breakPipeAtPoint, insertSupportAtPipe } from '/js/pcf-fixer-runtime/engine/GapFixEngine.js';
import { autoAssignPipelineRefs } from '/js/pcf-fixer-runtime/engine/TopologyEngine.js';
import { SideInspector } from '/js/pcf-fixer-runtime/ui/components/SideInspector.js';
import { LogDrawer } from '/js/pcf-fixer-runtime/ui/components/LogDrawer.js';
import { SceneHealthHUD } from '/js/pcf-fixer-runtime/ui/components/SceneHealthHUD.js';
import { SupportPropertyPanel } from '/js/pcf-fixer-runtime/ui/components/SupportPropertyPanel.js';
import { GapSidebar } from '/js/pcf-fixer-runtime/ui/components/GapSidebar.js';
import { PipelinePropertyPanel } from '/js/pcf-fixer-runtime/ui/components/PipelinePropertyPanel.js';
import { NavigationPanel } from '/js/pcf-fixer-runtime/ui/components/NavigationPanel.js';
import { SettingsModal } from '/js/pcf-fixer-runtime/ui/components/SettingsModal.js';
import { ClippingPlanesLayer, ClippingPanelUI } from '/js/pcf-fixer-runtime/ui/components/ClippingPlanesLayer.js';
import { ToolbarRibbon } from '/js/pcf-fixer-runtime/ui/components/ToolbarRibbon.js';
import { dbg } from '/js/pcf-fixer-runtime/utils/debugGate.js';
import { DebugConsole } from '/js/pcf-fixer-runtime/ui/components/DebugConsole.js';

// ----------------------------------------------------
// Colour & geometry helpers per component type
// ----------------------------------------------------
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "/js/pcf-fixer-runtime/jsx-runtime.js";
const typeColor = (type, appSettings) => {
  const defaultColors = {
    PIPE: '#cbd5e1',
    BEND: '#94a3b8',
    TEE: '#94a3b8',
    OLET: '#64748b',
    REDUCER: '#64748b',
    VALVE: '#3b82f6',
    FLANGE: '#60a5fa',
    SUPPORT: '#10b981'
  };
  const colors = appSettings?.componentColors || defaultColors;
  return colors[(type || '').toUpperCase()] || '#64748b';
};

// Helper to extract nested attribute
const getColorModeValue = (el, mode) => {
  if (mode.startsWith('CA')) return el.componentAttrs?.[mode] || '';
  if (mode === 'PIPELINE_REF') return el.pipelineRef || '';
  if (mode === 'ERROR') return el.validationError ? 'Error' : 'Valid';
  if (mode === 'LINENO_KEY') return el.lineNoKey || '';
  if (mode === 'RATING') return el.rating || '';
  if (mode === 'PIPING_CLASS') return el.pipingClass || '';
  return '';
};

// Spool logic
const getCAColor = str => {
  if (!str) return '#64748b';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
};
const computeSpools = dataTable => {
  const spools = {}; // rowIndex -> spoolId
  let spoolCounter = 1;

  // Adjacency map
  const endpoints = {}; // "x,y,z" -> [rowIndex]
  dataTable.forEach(r => {
    if ((r.type || '').toUpperCase() === 'SUPPORT') return; // Supports don't route spools
    if (r.ep1) {
      const key = `${parseFloat(r.ep1.x).toFixed(1)},${parseFloat(r.ep1.y).toFixed(1)},${parseFloat(r.ep1.z).toFixed(1)}`;
      if (!endpoints[key]) endpoints[key] = [];
      endpoints[key].push(r._rowIndex);
    }
    if (r.ep2) {
      const key = `${parseFloat(r.ep2.x).toFixed(1)},${parseFloat(r.ep2.y).toFixed(1)},${parseFloat(r.ep2.z).toFixed(1)}`;
      if (!endpoints[key]) endpoints[key] = [];
      endpoints[key].push(r._rowIndex);
    }
  });
  const visited = new Set();
  const rows = new Map(dataTable.map(r => [r._rowIndex, r]));
  const floodFill = (startId, sId) => {
    const queue = [startId];
    let iterations = 0;
    while (queue.length > 0) {
      if (iterations++ > 10000) {
        console.warn('floodFill aborted: exceeded 10000 iterations (possible cycle or massive network).');
        break;
      }
      const currId = queue.shift();
      if (visited.has(currId)) continue;
      const curr = rows.get(currId);
      if (!curr) continue;
      visited.add(currId);
      spools[currId] = sId;

      // Stop spool flood across flanges, valves, or pipeline ref changes
      const currType = (curr.type || '').toUpperCase();
      if (currType === 'FLANGE' || currType === 'VALVE' || currType === 'SUPPORT') continue;
      const neighbors = new Set();
      if (curr.ep1) {
        const key = `${parseFloat(curr.ep1.x).toFixed(1)},${parseFloat(curr.ep1.y).toFixed(1)},${parseFloat(curr.ep1.z).toFixed(1)}`;
        (endpoints[key] || []).forEach(n => neighbors.add(n));
      }
      if (curr.ep2) {
        const key = `${parseFloat(curr.ep2.x).toFixed(1)},${parseFloat(curr.ep2.y).toFixed(1)},${parseFloat(curr.ep2.z).toFixed(1)}`;
        (endpoints[key] || []).forEach(n => neighbors.add(n));
      }
      neighbors.forEach(nId => {
        if (!visited.has(nId) && nId !== currId) {
          const neighbor = rows.get(nId);
          if (neighbor) {
            const nType = (neighbor.type || '').toUpperCase();
            // Only flood into pipes, bends, tees, olets. We stop *after* hitting a flange/valve, but do we include the flange?
            // Yes, the first flange belongs to the spool. But we don't route *past* it.
            // So if neighbor is flange/valve, we add it, but its own floodFill loop will terminate immediately (see `if currType === FLANGE continue` above).

            // We also break if pipeline refs differ (assuming both exist)
            if (curr.pipelineRef && neighbor.pipelineRef && curr.pipelineRef !== neighbor.pipelineRef) return;
            queue.push(nId);
          }
        }
      });
    }
  };
  dataTable.forEach(r => {
    if (!visited.has(r._rowIndex)) {
      floodFill(r._rowIndex, spoolCounter++);
    }
  });
  return spools;
};

// Generates distinct colors based on ID
const spoolColor = spoolId => {
  const colors = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#60a5fa', '#818cf8', '#c084fc', '#f472b6'];
  if (!spoolId) return '#64748b';
  return colors[spoolId % colors.length];
};

// ----------------------------------------------------
// Performance Optimized Instanced Pipes Rendering
// ----------------------------------------------------
const InstancedPipes = () => {
  const getPipes = useStore(state => state.getPipes);
  const colorMode = useStore(state => state.colorMode);
  const dataTable = useStore(state => state.dataTable);
  const multiSelectedIds = useStore(state => state.multiSelectedIds); // Listen for selection changes
  const appSettings = useStore(state => state.appSettings);
  const translucentMode = useStore(state => state.translucentMode);
  const showRowLabels = useStore(state => state.showRowLabels);
  const showRefLabels = useStore(state => state.showRefLabels);
  const pipes = getPipes();
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);

  // Compute spools globally if needed
  const spools = useMemo(() => computeSpools(dataTable), [dataTable]);
  useEffect(() => {
    if (typeof dbg !== 'undefined') dbg.render('INSTANCED_PIPES', `Rendering ${pipes.length} pipes`, {
      translucentMode,
      colorMode,
      multiSelectedCount: multiSelectedIds?.length || 0
    });
    if (!meshRef.current || pipes.length === 0) return;
    pipes.forEach((element, i) => {
      const {
        ep1,
        ep2,
        bore
      } = element;
      if (!ep1 || !ep2) return;
      const vecA = new THREE.Vector3(ep1.x, ep1.y, ep1.z);
      const vecB = new THREE.Vector3(ep2.x, ep2.y, ep2.z);
      const distance = vecA.distanceTo(vecB);
      if (distance === 0) return;

      // Position: Midpoint
      const midPoint = vecA.clone().lerp(vecB, 0.5);
      dummy.position.copy(midPoint);

      // Scale: Y-axis is length in Three.js cylinders
      // For visual clarity, scale the X and Z by bore/2
      const radius = bore ? bore / 2 : 5;
      dummy.scale.set(radius, distance, radius);

      // Orientation: Point from A to B
      const direction = vecB.clone().sub(vecA).normalize();
      // Three.js cylinders point UP (Y-axis) by default
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
      dummy.quaternion.copy(quaternion);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Color
      let colStr = typeColor(element.type, appSettings);
      if (colorMode === 'SPOOL') {
        colStr = spoolColor(spools[element._rowIndex]);
      } else if (colorMode !== 'TYPE' && colorMode !== '') {
        const val = getColorModeValue(element, colorMode);
        if (val) {
          colStr = getCAColor(val);
        } else {
          colStr = '#475569'; // slate-600 for missing attr
        }
      }

      // Handle multi-select highlighting for pipes
      const isSelected = multiSelectedIds.includes(element._rowIndex);
      if (isSelected) {
        colStr = appSettings.selectionColor; // yellow for selection
      }
      c.set(colStr);
      meshRef.current.setColorAt(i, c);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    meshRef.current.computeBoundingSphere();
  }, [pipes, dummy, colorMode, spools, c, multiSelectedIds]);
  const selectedElementId = useStore(state => state.selectedElementId);
  const handlePointerDown = e => {
    const canvasMode = useStore.getState().canvasMode;

    // Prevent selection if in a tool mode like MEASURE, BREAK, CONNECT, INSERT_SUPPORT. Let the event bubble to global snap plane.
    if (canvasMode !== 'VIEW') {
      return;
    }
    e.stopPropagation();
    const instanceId = e.instanceId;
    if (instanceId !== undefined && pipes[instanceId]) {
      const pipe = pipes[instanceId];
      if (e.button === 2) {
        // Extract native event coordinates, which should be absolute viewport coords.
        const nx = e.nativeEvent?.clientX ?? e.clientX;
        const ny = e.nativeEvent?.clientY ?? e.clientY;
        useStore.getState().setContextMenu({
          x: nx,
          y: ny,
          rowIndex: pipe._rowIndex
        });
        return;
      }
      if (pipe.ep1 && pipe.ep2) {
        const isMultiSelect = e.ctrlKey || e.metaKey;
        if (isMultiSelect) {
          useStore.getState().toggleMultiSelect(pipe._rowIndex);
        } else {
          useStore.getState().clearMultiSelect();
          useStore.getState().setSelected(pipe._rowIndex);
          useStore.getState().setMultiSelect([pipe._rowIndex]);
        }

        // Do not dispatch canvas-focus-point automatically anymore.
        // Instead, we just set the selection for the property panel.
      }
    }
  };
  const handlePointerMissed = e => {
    // Check if click originated from the HTML UI overlay. e.target is typically the canvas if valid.
    // e.type is typically 'pointerdown' or 'click' from R3F, but we can also check e.eventObject.
    // Often, R3F's onPointerMissed fires for UI clicks if they aren't stopped.
    // We can check if e.nativeEvent?.target is a DOM element outside the canvas or if there's no nativeEvent.
    if (e.nativeEvent?.__handled3D) {
      dbg.event('POINTER_MISSED', 'Suppressed — click handled by ImmutableComponent');
      return;
    }
    if (typeof dbg !== 'undefined') dbg.event('POINTER_MISSED', 'Fired', {
      target: e.nativeEvent?.target?.tagName,
      handled3D: !!e.nativeEvent?.__handled3D,
      currentSelection: useStore.getState().selectedElementId,
      multiSelected: useStore.getState().multiSelectedIds?.length || 0
    });
    if (e.nativeEvent) {
      const target = e.nativeEvent.target;
      // If the click is on an input, button, or something that is clearly UI, ignore it.
      // The canvas itself is usually a `<canvas>` element.
      if (target && target.tagName !== 'CANVAS') {
        return;
      }
    }

    // Don't clear if Ctrl is held down, allows multi-select to stay persistent across blank clicks
    if (e && (e.ctrlKey || e.metaKey)) return;
    useStore.getState().setSelected(null);
    useStore.getState().clearMultiSelect();
  };
  if (pipes.length === 0) return null;
  return _jsxs("group", {
    onPointerMissed: handlePointerMissed,
    children: [_jsxs("instancedMesh", {
      ref: meshRef,
      args: [null, null, pipes.length],
      onPointerDown: handlePointerDown,
      children: [_jsx("cylinderGeometry", {
        args: [1, 1, 1, 16]
      }), _jsx("meshStandardMaterial", {
        color: "#3b82f6",
        transparent: translucentMode,
        opacity: translucentMode ? 0.3 : 1,
        depthWrite: !translucentMode
      })]
    }), (multiSelectedIds || []).map(id => {
      const pipe = dataTable.find(r => r._rowIndex === id);
      if (!pipe || (pipe.type || '').toUpperCase() !== 'PIPE' || !pipe.ep1 || !pipe.ep2) return null;
      const midX = (pipe.ep1.x + pipe.ep2.x) / 2;
      const midY = (pipe.ep1.y + pipe.ep2.y) / 2;
      const midZ = (pipe.ep1.z + pipe.ep2.z) / 2;
      const vecA = new THREE.Vector3(pipe.ep1.x, pipe.ep1.y, pipe.ep1.z);
      const vecB = new THREE.Vector3(pipe.ep2.x, pipe.ep2.y, pipe.ep2.z);
      const distance = vecA.distanceTo(vecB);
      if (distance === 0) return null;
      const radius = pipe.bore ? pipe.bore / 2 : 5;
      const direction = vecB.clone().sub(vecA).normalize();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      return _jsxs("mesh", {
        position: [midX, midY, midZ],
        quaternion: quaternion,
        children: [_jsx("cylinderGeometry", {
          args: [radius * 1.2, radius * 1.2, distance, 16]
        }), _jsx("meshBasicMaterial", {
          color: appSettings.selectionColor,
          transparent: true,
          opacity: appSettings.selectionOpacity,
          depthTest: false
        })]
      }, `hl-${id}`);
    })]
  });
};

// ----------------------------------------------------
// Distinct geometry for non-PIPE components
// ----------------------------------------------------
const ImmutableComponents = () => {
  const getImmutables = useStore(state => state.getImmutables);
  const elements = getImmutables();
  const colorMode = useStore(state => state.colorMode);
  const dataTable = useStore(state => state.dataTable);
  const multiSelectedIds = useStore(state => state.multiSelectedIds);
  const appSettings = useStore(state => state.appSettings);
  const translucentMode = useStore(state => state.translucentMode);
  const showRowLabels = useStore(state => state.showRowLabels);
  const showRefLabels = useStore(state => state.showRefLabels);
  const isTranslucent = translucentMode;

  // Re-use compute spools if needed here
  const spools = useMemo(() => computeSpools(dataTable), [dataTable]);
  if (elements.length === 0) return null;
  return _jsx("group", {
    children: elements.map((el, i) => {
      // SUPPORT: positioned by supportCoor, not ep1/ep2
      if ((el.type || '').toUpperCase() === 'SUPPORT') {
        const coor = el.supportCoor;
        if (!coor) return null;
        const r = Math.max((el.bore || 100) / 2, 50);
        const isSelected = multiSelectedIds.includes(el._rowIndex);
        const isRest = Object.values(el).some(v => typeof v === 'string' && ['CA150', 'REST'].includes(v.toUpperCase()));
        const isGui  = Object.values(el).some(v => typeof v === 'string' && ['CA100', 'GUI'].includes(v.toUpperCase()));
        const finalColor = isSelected ? appSettings.selectionColor : (isRest || isGui ? '#22c55e' : typeColor(el.type, appSettings));
        const onSuppClick = e => {
          if (e.nativeEvent) e.nativeEvent.__handled3D = true;
          if (useStore.getState().canvasMode !== 'VIEW') return;
          e.stopPropagation();
          if (e.ctrlKey || e.metaKey) { useStore.getState().toggleMultiSelect(el._rowIndex); }
          else { useStore.getState().clearMultiSelect(); useStore.getState().setSelected(el._rowIndex); useStore.getState().setMultiSelect([el._rowIndex]); }
        };
        return _jsxs("group", {
          position: [coor.x, coor.y, coor.z],
          onPointerDown: onSuppClick,
          children: [
            _jsxs("mesh", { position: [0, r * 0.5, 0], children: [
              _jsx("cylinderGeometry", { args: [0, r * 2, r, 8] }),
              _jsx("meshStandardMaterial", { color: finalColor, transparent: isTranslucent, opacity: isTranslucent ? 0.3 : 1, depthWrite: !isTranslucent })
            ]}),
            _jsxs("mesh", { position: [0, -r * 0.25, 0], children: [
              _jsx("cylinderGeometry", { args: [r, r, r * 0.5, 8] }),
              _jsx("meshStandardMaterial", { color: finalColor, transparent: isTranslucent, opacity: isTranslucent ? 0.3 : 1, depthWrite: !isTranslucent })
            ]}),
            isGui ? _jsxs("group", { position: [r * 1.5, 0, 0], rotation: [0, 0, Math.PI / 2], children: [
              _jsxs("mesh", { position: [0, r * 0.5, 0], children: [_jsx("cylinderGeometry", { args: [0, r * 1.5, r, 8] }), _jsx("meshStandardMaterial", { color: finalColor })] }),
              _jsxs("mesh", { position: [0, -r * 0.25, 0], children: [_jsx("cylinderGeometry", { args: [r * 0.8, r * 0.8, r * 0.5, 8] }), _jsx("meshStandardMaterial", { color: finalColor })] })
            ]}) : null
          ]
        }, `supp-${i}`);
      }
      if (!el.ep1 || !el.ep2) return null;
      const vecA = new THREE.Vector3(el.ep1.x, el.ep1.y, el.ep1.z);
      const vecB = new THREE.Vector3(el.ep2.x, el.ep2.y, el.ep2.z);
      const dist = vecA.distanceTo(vecB);
      if (dist < 0.001) return null;
      const mid = vecA.clone().lerp(vecB, 0.5);
      const dir = vecB.clone().sub(vecA).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
      const r = el.bore ? el.bore / 2 : 5;
      let color = typeColor(el.type, appSettings);
      if (colorMode === 'SPOOL') {
        color = spoolColor(spools[el._rowIndex]);
      } else if (colorMode !== 'TYPE' && colorMode !== '') {
        const val = getColorModeValue(el, colorMode);
        if (val) {
          color = getCAColor(val);
        } else {
          color = '#475569';
        }
      }
      const isSelected = multiSelectedIds.includes(el._rowIndex);
      if (isSelected) color = appSettings.selectionColor;
      const type = (el.type || '').toUpperCase();
      const handleSelect = e => {
        if (e.nativeEvent) e.nativeEvent.__handled3D = true;
        const canvasMode = useStore.getState().canvasMode;
        if (canvasMode !== 'VIEW') return;
        e.stopPropagation();
        try {
          if (e.button === 2) {
            const nx = e.nativeEvent?.clientX ?? e.clientX;
            const ny = e.nativeEvent?.clientY ?? e.clientY;
            useStore.getState().setContextMenu({
              x: nx,
              y: ny,
              rowIndex: el._rowIndex
            });
            return;
          }
          const isMultiSelect = e.ctrlKey || e.metaKey;
          if (isMultiSelect) {
            useStore.getState().toggleMultiSelect(el._rowIndex);
          } else {
            useStore.getState().clearMultiSelect();
            useStore.getState().setSelected(el._rowIndex);
            useStore.getState().setMultiSelect([el._rowIndex]);
          }
        } catch (err) {
          dbg.error('IMM_SELECT', 'Fatal error during component selection', {
            error: err.message,
            rowIndex: el._rowIndex
          });
        }
      };
      if (type === 'FLANGE') {
        // Disc — short, wide cylinder
        return _jsxs("mesh", {
          position: mid,
          quaternion: quat,
          onPointerDown: handleSelect,
          children: [_jsx("cylinderGeometry", {
            args: [r * 1.6, r * 1.6, Math.max(dist * 0.15, 10), 24]
          }), _jsx("meshStandardMaterial", {
            color: isSelected ? appSettings.selectionColor : color,
            transparent: isTranslucent,
            opacity: isTranslucent ? 0.3 : 1,
            depthWrite: !isTranslucent
          })]
        }, `fl-${i}`);
      }
      if (type === 'VALVE') {
        // Double Cone (hourglass) body + small stem/wheel
        return _jsxs("group", {
          position: mid,
          quaternion: quat,
          onPointerDown: handleSelect,
          children: [_jsxs("mesh", {
            position: [0, -dist / 4, 0],
            children: [_jsx("cylinderGeometry", {
              args: [0, r * 1.8, dist / 2, 16]
            }), _jsx("meshStandardMaterial", {
              color: isSelected ? appSettings.selectionColor : color,
              transparent: isTranslucent,
              opacity: isTranslucent ? 0.3 : 1,
              depthWrite: !isTranslucent
            })]
          }), _jsxs("mesh", {
            position: [0, dist / 4, 0],
            children: [_jsx("cylinderGeometry", {
              args: [r * 1.8, 0, dist / 2, 16]
            }), _jsx("meshStandardMaterial", {
              color: isSelected ? appSettings.selectionColor : color,
              transparent: isTranslucent,
              opacity: isTranslucent ? 0.3 : 1,
              depthWrite: !isTranslucent
            })]
          }), _jsxs("group", {
            position: [r * 2, 0, 0],
            rotation: [0, 0, Math.PI / 2],
            children: [_jsxs("mesh", {
              position: [0, dist / 2, 0],
              children: [_jsx("cylinderGeometry", {
                args: [r * 0.2, r * 0.2, dist, 8]
              }), _jsx("meshStandardMaterial", {
                color: isSelected ? appSettings.selectionColor : color,
                transparent: isTranslucent,
                opacity: isTranslucent ? 0.3 : 1,
                depthWrite: !isTranslucent
              })]
            }), _jsxs("mesh", {
              position: [0, dist, 0],
              rotation: [Math.PI / 2, 0, 0],
              children: [_jsx("torusGeometry", {
                args: [r, r * 0.2, 8, 24]
              }), _jsx("meshStandardMaterial", {
                color: isSelected ? appSettings.selectionColor : color,
                transparent: isTranslucent,
                opacity: isTranslucent ? 0.3 : 1,
                depthWrite: !isTranslucent
              })]
            }), _jsxs("mesh", {
              position: [0, dist, 0],
              children: [_jsx("cylinderGeometry", {
                args: [r * 0.4, r * 0.4, r * 0.2, 16]
              }), _jsx("meshStandardMaterial", {
                color: isSelected ? appSettings.selectionColor : color,
                transparent: isTranslucent,
                opacity: isTranslucent ? 0.3 : 1,
                depthWrite: !isTranslucent
              })]
            })]
          })]
        }, `vv-${i}`);
      }
      if (type === 'BEND') {
        // Slightly thicker cylinder in amber — no torus without 3 points; keep cylinder with distinct colour
        return _jsxs("mesh", {
          position: mid,
          quaternion: quat,
          onPointerDown: handleSelect,
          children: [_jsx("cylinderGeometry", {
            args: [r * 1.1, r * 1.1, dist, 16]
          }), _jsx("meshStandardMaterial", {
            color: isSelected ? appSettings.selectionColor : color,
            transparent: isTranslucent,
            opacity: isTranslucent ? 0.3 : 1,
            depthWrite: !isTranslucent
          })]
        }, `bn-${i}`);
      }
      if (type === 'TEE') {
        // Main run cylinder + branch stub
        const branchDir = el.cp && el.bp ? new THREE.Vector3(el.bp.x - el.cp.x, el.bp.y - el.cp.y, el.bp.z - el.cp.z).normalize() : new THREE.Vector3(0, 0, 1);
        const branchLen = el.cp && el.bp ? new THREE.Vector3(el.bp.x - el.cp.x, el.bp.y - el.cp.y, el.bp.z - el.cp.z).length() : r * 3;
        const branchMid = el.cp ? new THREE.Vector3(el.cp.x + branchDir.x * branchLen / 2, el.cp.y + branchDir.y * branchLen / 2, el.cp.z + branchDir.z * branchLen / 2) : mid.clone().addScaledVector(branchDir, branchLen / 2);
        const branchQuat = new THREE.Quaternion().setFromUnitVectors(up, branchDir);
        const branchR = el.branchBore ? el.branchBore / 2 : r * 0.6;
        return _jsxs("group", {
          onPointerDown: handleSelect,
          children: [_jsxs("mesh", {
            position: mid,
            quaternion: quat,
            children: [_jsx("cylinderGeometry", {
              args: [r, r, dist, 16]
            }), _jsx("meshStandardMaterial", {
              color: isSelected ? appSettings.selectionColor : color,
              transparent: isTranslucent,
              opacity: isTranslucent ? 0.3 : 1,
              depthWrite: !isTranslucent
            })]
          }), _jsxs("mesh", {
            position: branchMid,
            quaternion: branchQuat,
            children: [_jsx("cylinderGeometry", {
              args: [branchR, branchR, branchLen, 12]
            }), _jsx("meshStandardMaterial", {
              color: isSelected ? appSettings.selectionColor : color,
              transparent: isTranslucent,
              opacity: isTranslucent ? 0.3 : 1,
              depthWrite: !isTranslucent
            })]
          })]
        }, `tee-${i}`);
      }
      if (type === 'OLET') {
        // Small sphere at CP position
        const pos = el.cp ? [el.cp.x, el.cp.y, el.cp.z] : [mid.x, mid.y, mid.z];
        return _jsxs("mesh", {
          position: pos,
          onPointerDown: handleSelect,
          children: [_jsx("sphereGeometry", {
            args: [r * 1.3, 12, 12]
          }), _jsx("meshStandardMaterial", {
            color: isSelected ? appSettings.selectionColor : color,
            transparent: isTranslucent,
            opacity: isTranslucent ? 0.3 : 1,
            depthWrite: !isTranslucent
          })]
        }, `ol-${i}`);
      }
      // Fallback: generic cylinder
      return _jsxs("mesh", {
        position: mid,
        quaternion: quat,
        onPointerDown: handleSelect,
        children: [_jsx("cylinderGeometry", {
          args: [r, r, dist, 16]
        }), _jsx("meshStandardMaterial", {
          color: isSelected ? appSettings.selectionColor : color,
          transparent: isTranslucent,
          opacity: isTranslucent ? 0.3 : 1,
          depthWrite: !isTranslucent
        })]
      }, `im-${i}`);
    })
  });
};

// ----------------------------------------------------
// Ghost overlay: wireframe of the element(s) affected
// by the currently-active proposal
// ----------------------------------------------------
const GhostOverlay = ({
  activeProposal
}) => {
  const appSettings = useStore(state => state.appSettings);
  if (!activeProposal) return null;
  const elements = [activeProposal.elementA, activeProposal.elementB].filter(Boolean);
  return _jsx("group", {
    children: elements.map((el, i) => {
      if (!el.ep1 || !el.ep2) return null;
      const vecA = new THREE.Vector3(el.ep1.x, el.ep1.y, el.ep1.z);
      const vecB = new THREE.Vector3(el.ep2.x, el.ep2.y, el.ep2.z);
      const dist = vecA.distanceTo(vecB);
      if (dist < 0.001) return null;
      const mid = vecA.clone().lerp(vecB, 0.5);
      const dir = vecB.clone().sub(vecA).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const r = el.bore ? el.bore / 2 : 5;
      return _jsxs("mesh", {
        position: mid,
        quaternion: quat,
        children: [_jsx("cylinderGeometry", {
          args: [r * 1.05, r * 1.05, dist, 16]
        }), _jsx("meshBasicMaterial", {
          color: appSettings.selectionColor,
          opacity: 0.3,
          transparent: true,
          depthWrite: false
        })]
      }, `ghost-${i}`);
    })
  });
};

// ----------------------------------------------------
// Gap/Proposal Map Pin Visualization
// ----------------------------------------------------

// ----------------------------------------------------
// Active Issue Map Pin Visualization
// ----------------------------------------------------
const IssueMapPin = ({
  activeIssue
}) => {
  if (!activeIssue) return null;
  let pos = null;
  let label = "";
  let color = "#ef4444"; // red for validation

  if (activeIssue.type === 'validation' && activeIssue.data.ep1) {
    pos = [activeIssue.data.ep1.x, activeIssue.data.ep1.y, activeIssue.data.ep1.z];
    label = `Row ${activeIssue.data._rowIndex}`;
  } else if (activeIssue.type === 'proposal') {
    const prop = activeIssue.data;
    if (prop.ptA && prop.ptB) {
      pos = [(prop.ptA.x + prop.ptB.x) / 2, (prop.ptA.y + prop.ptB.y) / 2, (prop.ptA.z + prop.ptB.z) / 2];
    } else if (prop.elementA && prop.elementA.ep1) {
      pos = [prop.elementA.ep1.x, prop.elementA.ep1.y, prop.elementA.ep1.z];
    }
    label = `Row ${prop.elementA?._rowIndex}`;
    color = "#3b82f6"; // blue for proposal
  }
  if (!pos) return null;
  return _jsxs("group", {
    position: pos,
    children: [_jsxs("mesh", {
      position: [0, 150, 0],
      children: [_jsx("sphereGeometry", {
        args: [50, 16, 16]
      }), _jsx("meshBasicMaterial", {
        color: color
      })]
    }), _jsxs("mesh", {
      position: [0, 75, 0],
      children: [_jsx("coneGeometry", {
        args: [50, 150, 16],
        rotation: [Math.PI, 0, 0]
      }), _jsx("meshBasicMaterial", {
        color: color
      })]
    }), _jsxs("mesh", {
      position: [0, 250, 0],
      children: [_jsx("planeGeometry", {
        args: [300, 100]
      }), _jsx("meshBasicMaterial", {
        color: "white",
        side: THREE.DoubleSide
      })]
    }), _jsx(Text, {
      position: [0, 250, 1],
      color: "black",
      fontSize: 60,
      anchorX: "center",
      anchorY: "middle",
      outlineWidth: 2,
      outlineColor: "white",
      fontWeight: "bold",
      children: label
    })]
  });
};

// ----------------------------------------------------
// Smart Fix Proposal Rendering
// ----------------------------------------------------
const ProposalOverlay = ({
  proposal
}) => {
  if (!proposal || !proposal.ptA || !proposal.ptB) return null;
  const vecA = new THREE.Vector3(proposal.ptA.x, proposal.ptA.y, proposal.ptA.z);
  const vecB = new THREE.Vector3(proposal.ptB.x, proposal.ptB.y, proposal.ptB.z);
  const mid = new THREE.Vector3().addVectors(vecA, vecB).multiplyScalar(0.5);
  const dist = vecA.distanceTo(vecB);

  // Color based on action
  const action = proposal.fixType || proposal.action || '';

  // User requested: GAP_FILL (Pipe Fill) = Red translucent, TRIM (Pipe Trim) = Blue translucent
  let color = '#f59e0b'; // amber default
  if (action === 'GAP_FILL') color = '#ef4444'; // red
  if (action.includes('TRIM')) color = '#3b82f6'; // blue
  if (action === 'GAP_STRETCH_PIPE' || action === 'GAP_SNAP_IMMUTABLE_BLOCK') color = '#10b981'; // green

  // Cylinder orientation
  const dir = new THREE.Vector3().subVectors(vecB, vecA).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir);
  const bore = proposal.elementA?.bore || proposal.elementB?.bore || 50;
  return _jsxs("group", {
    children: [_jsx(Line, {
      points: [vecA, vecB],
      color: color,
      lineWidth: 3,
      dashed: true,
      dashScale: 10,
      dashSize: 10,
      gapSize: 10
    }), _jsxs("mesh", {
      position: mid,
      quaternion: quaternion,
      children: [_jsx("cylinderGeometry", {
        args: [bore / 2, bore / 2, dist, 16]
      }), _jsx("meshStandardMaterial", {
        color: color,
        opacity: 0.5,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      })]
    }), _jsxs("mesh", {
      position: vecA,
      children: [_jsx("sphereGeometry", {
        args: [bore / 2 + 2, 8, 8]
      }), _jsx("meshBasicMaterial", {
        color: color
      })]
    }), _jsxs("mesh", {
      position: vecB,
      children: [_jsx("sphereGeometry", {
        args: [bore / 2 + 2, 8, 8]
      }), _jsx("meshBasicMaterial", {
        color: color
      })]
    }), _jsxs("mesh", {
      position: mid,
      children: [_jsx("planeGeometry", {
        args: [300, 80]
      }), _jsx("meshBasicMaterial", {
        color: "#1e293b",
        side: THREE.DoubleSide,
        opacity: 0.8,
        transparent: true
      })]
    }), _jsxs(Text, {
      position: [mid.x, mid.y, mid.z + 1],
      color: color,
      fontSize: 35,
      anchorX: "center",
      anchorY: "middle",
      outlineWidth: 1,
      outlineColor: "#0f172a",
      children: [action, " (", dist.toFixed(1), "mm)"]
    })]
  });
};

// ----------------------------------------------------
// Single Issue Navigation Panel
// ----------------------------------------------------
const SingleIssuePanel = ({
  proposals,
  validationIssues,
  currentIssueIndex,
  setCurrentIssueIndex,
  onAutoCenter,
  onApprove,
  onReject
}) => {
  const allIssues = [...(validationIssues || []).map(i => ({
    type: 'validation',
    data: i
  })), ...(proposals || []).map(p => ({
    type: 'proposal',
    data: p
  }))];
  const safeIndex = Math.max(0, Math.min(currentIssueIndex, allIssues.length - 1));
  const currentItem = allIssues[safeIndex];

  // Draggable state using simple absolute positioning
  const [pos, setPos] = useState({
    x: 0,
    y: 0
  }); // Note: We handle setting this dynamically
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({
    x: 0,
    y: 0
  });
  const panelRef = useRef(null);
  useEffect(() => {
    if (allIssues.length > 0 && onAutoCenter) {
      onAutoCenter();
    }
  }, [safeIndex, allIssues.length, onAutoCenter]);

  // Initialize position to bottom center once
  useEffect(() => {
    if (panelRef.current && pos.x === 0 && pos.y === 0) {
      const parent = panelRef.current.parentElement;
      if (parent) {
        const pRect = parent.getBoundingClientRect();
        const cRect = panelRef.current.getBoundingClientRect();
        setPos({
          x: pRect.width / 2 - cRect.width / 2,
          y: pRect.height - cRect.height - 32 // 32px from bottom (bottom-8)
        });
      }
    }
  }, [pos.x, pos.y]);
  if (allIssues.length === 0) return null;
  const handlePrev = () => setCurrentIssueIndex(Math.max(0, currentIssueIndex - 1));
  const handleNext = () => setCurrentIssueIndex(Math.min(allIssues.length - 1, currentIssueIndex + 1));
  const handlePointerDown = e => {
    setIsDragging(true);
    const rect = panelRef.current.getBoundingClientRect();
    // Calculate offset from the top-left of the panel
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    e.target.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = e => {
    if (!isDragging || !panelRef.current) return;
    const parent = panelRef.current.parentElement;
    if (!parent) return;
    const pRect = parent.getBoundingClientRect();

    // Calculate new X, Y relative to the parent container
    let newX = e.clientX - pRect.left - dragOffset.x;
    let newY = e.clientY - pRect.top - dragOffset.y;

    // Optional bounding box
    newX = Math.max(0, Math.min(newX, pRect.width - panelRef.current.offsetWidth));
    newY = Math.max(0, Math.min(newY, pRect.height - panelRef.current.offsetHeight));
    setPos({
      x: newX,
      y: newY
    });
  };
  const handlePointerUp = e => {
    setIsDragging(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  // If pos is still 0,0, apply a CSS class for centering, otherwise use absolute top/left
  const style = pos.x !== 0 || pos.y !== 0 ? {
    left: pos.x,
    top: pos.y
  } : {
    bottom: '2rem',
    left: '50%',
    transform: 'translateX(-50%)'
  };
  return _jsxs("div", {
    ref: panelRef,
    style: style,
    className: "absolute z-20 w-96 bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden",
    children: [_jsxs("div", {
      className: "flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-700 cursor-move",
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
      children: [_jsx("div", {
        className: "flex items-center gap-2 pointer-events-none",
        children: _jsxs("span", {
          className: "text-slate-300 font-bold text-sm",
          children: ["Issue ", safeIndex + 1, " of ", allIssues.length]
        })
      }), _jsxs("div", {
        className: "flex gap-1",
        children: [_jsx("button", {
          onClick: handlePrev,
          disabled: currentIssueIndex === 0,
          className: "p-1 rounded hover:bg-slate-700 disabled:opacity-30 transition",
          children: _jsx("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            width: "18",
            height: "18",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            className: "text-slate-300",
            children: _jsx("path", {
              d: "m15 18-6-6 6-6"
            })
          })
        }), _jsx("button", {
          onClick: onAutoCenter,
          className: "p-1 rounded hover:bg-slate-700 transition",
          title: "Focus Camera",
          children: _jsxs("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            width: "16",
            height: "16",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            className: "text-blue-400",
            children: [_jsx("circle", {
              cx: "11",
              cy: "11",
              r: "8"
            }), _jsx("path", {
              d: "m21 21-4.3-4.3"
            })]
          })
        }), _jsx("button", {
          onClick: handleNext,
          disabled: currentIssueIndex === allIssues.length - 1,
          className: "p-1 rounded hover:bg-slate-700 disabled:opacity-30 transition",
          children: _jsx("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            width: "18",
            height: "18",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            className: "text-slate-300",
            children: _jsx("path", {
              d: "m9 18 6-6-6-6"
            })
          })
        })]
      })]
    }), _jsx("div", {
      className: "p-4",
      children: currentItem.type === 'validation' ? _jsxs("div", {
        children: [_jsxs("div", {
          className: "flex items-center justify-between mb-2",
          children: [_jsx("span", {
            className: "text-xs font-bold text-red-400 uppercase tracking-widest px-2 py-0.5 bg-red-900/30 rounded border border-red-800/50",
            children: "Validation Issue"
          }), _jsxs("span", {
            className: "text-slate-400 text-xs",
            children: ["Row ", currentItem.data._rowIndex]
          })]
        }), _jsx("p", {
          className: "text-sm text-slate-200 mb-1",
          children: currentItem.data.type || 'Unknown Component'
        }), _jsx("p", {
          className: "text-xs text-slate-400 p-2 bg-slate-950 rounded border border-slate-800",
          children: currentItem.data.fixingAction
        })]
      }) : _jsxs("div", {
        children: [_jsxs("div", {
          className: "flex items-center justify-between mb-2",
          children: [_jsx("span", {
            className: "text-xs font-bold text-amber-400 uppercase tracking-widest px-2 py-0.5 bg-amber-900/30 rounded border border-amber-800/50",
            children: "Fix Proposal"
          }), _jsxs("span", {
            className: "text-slate-400 text-xs",
            children: ["Row ", currentItem.data.elementA?._rowIndex]
          })]
        }), _jsxs("div", {
          className: "p-2 bg-slate-950 rounded border border-slate-800",
          children: [_jsx("p", {
            className: "text-sm text-slate-200 font-medium",
            children: currentItem.data.description
          }), (() => {
            const prop = currentItem.data;
            return _jsxs("div", {
              className: "mt-2 pt-2 border-t border-slate-800 flex justify-between items-end",
              children: [_jsxs("div", {
                children: [_jsxs("div", {
                  className: "text-[10px] text-slate-500",
                  children: ["Action: ", prop.action]
                }), prop.dist !== undefined && _jsxs("div", {
                  className: "text-[10px] text-slate-500",
                  children: ["Delta: ", prop.dist.toFixed(1), "mm"]
                })]
              }), prop.score !== undefined && _jsx("div", {
                className: "flex items-center",
                children: _jsxs("span", {
                  className: `text-[10px] px-1.5 py-0.5 rounded border ${prop.score >= 10 ? 'text-green-400 bg-green-900/30 border-green-800' : 'text-orange-400 bg-orange-900/30 border-orange-800'}`,
                  children: ["Score ", prop.score]
                })
              })]
            });
          })(), _jsx("div", {
            className: "mt-4 flex gap-2",
            children: currentItem.data._fixApproved === true ? _jsx("div", {
              className: "w-full text-center text-green-500 font-bold text-sm py-1 bg-green-900/20 rounded border border-green-800/30",
              children: "\u2713 Approved"
            }) : currentItem.data._fixApproved === false ? _jsx("div", {
              className: "w-full text-center text-red-500 font-bold text-sm py-1 bg-red-900/20 rounded border border-red-800/30",
              children: "\u2717 Rejected"
            }) : _jsxs(_Fragment, {
              children: [_jsx("button", {
                className: "flex-1 bg-green-800 hover:bg-green-700 text-white text-sm py-1.5 rounded transition",
                onClick: e => onApprove(e, currentItem.data),
                children: "\u2713 Approve"
              }), _jsx("button", {
                className: "flex-1 bg-slate-700 hover:bg-slate-600 text-white text-sm py-1.5 rounded transition flex justify-center items-center gap-1",
                onClick: e => onReject(e, currentItem.data),
                children: "\u2717 Reject"
              })]
            })
          })]
        })]
      })
    })]
  });
};

// ----------------------------------------------------
// Global Snap Layer
// Provides a unified snapping point for Measure, Break, etc.
// ----------------------------------------------------
const GlobalSnapLayer = () => {
  const appSettings = useStore(state => state.appSettings);
  const canvasMode = useStore(state => state.canvasMode);
  const dataTable = useStore(state => state.dataTable);
  const setCursorSnapPoint = useStore(state => state.setCursorSnapPoint);
  const cursorSnapPoint = useStore(state => state.cursorSnapPoint);

  // Only active during tools that need picking
  const isActive = ['MEASURE', 'BREAK', 'CONNECT', 'STRETCH', 'INSERT_SUPPORT'].includes(canvasMode);
  useEffect(() => {
    if (!isActive) {
      setCursorSnapPoint(null);
    }
  }, [isActive, setCursorSnapPoint]);
  if (!isActive) return null;
  const snapRadius = 50; // mm

  const handlePointerMove = e => {
    let nearest = null;
    let minDist = snapRadius;

    // Find closest ep1, ep2, or midpoint
    dataTable.forEach(row => {
      const ptsToTest = [];
      if (row.ep1) ptsToTest.push(new THREE.Vector3(row.ep1.x, row.ep1.y, row.ep1.z));
      if (row.ep2) ptsToTest.push(new THREE.Vector3(row.ep2.x, row.ep2.y, row.ep2.z));
      if (row.ep1 && row.ep2) {
        const mid = new THREE.Vector3(row.ep1.x, row.ep1.y, row.ep1.z).lerp(new THREE.Vector3(row.ep2.x, row.ep2.y, row.ep2.z), 0.5);
        ptsToTest.push(mid);
      }
      ptsToTest.forEach(pt => {
        const dist = pt.distanceTo(e.point);
        if (dist < minDist) {
          minDist = dist;
          nearest = pt;
        }
      });
    });
    if (nearest) {
      // Update state ONLY if point changed to avoid re-renders
      if (!cursorSnapPoint || cursorSnapPoint.distanceTo(nearest) > 0.1) {
        setCursorSnapPoint(nearest);
      }
    } else if (cursorSnapPoint) {
      setCursorSnapPoint(null);
    }
  };
  return _jsxs("group", {
    onPointerMove: handlePointerMove,
    children: [_jsx("mesh", {
      visible: false,
      children: _jsx("planeGeometry", {
        args: [200000, 200000]
      })
    }), cursorSnapPoint && _jsxs("mesh", {
      position: cursorSnapPoint,
      renderOrder: 999,
      children: [_jsx("sphereGeometry", {
        args: [15, 16, 16]
      }), _jsx("meshBasicMaterial", {
        color: appSettings.selectionColor,
        transparent: true,
        opacity: 0.8,
        depthTest: false
      })]
    })]
  });
};

// ----------------------------------------------------
// Custom Legend Layer
// ----------------------------------------------------
const LegendLayer = () => {
  const colorMode = useStore(state => state.colorMode);
  const dataTable = useStore(state => state.dataTable);
  const appSettings = useStore(state => state.appSettings);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const uniqueValues = useMemo(() => {
    if (colorMode === 'SPOOL' || colorMode === 'TYPE' || !colorMode) return [];
    const vals = new Set();
    dataTable.forEach(r => {
      const val = getColorModeValue(r, colorMode);
      if (val) vals.add(val);
    });
    return Array.from(vals).sort();
  }, [dataTable, colorMode]);
  const uniqueTypes = useMemo(() => {
    if (colorMode !== 'TYPE') return [];
    const vals = new Set();
    dataTable.forEach(r => {
      if (r.type) vals.add(r.type.toUpperCase());
    });
    return Array.from(vals).sort();
  }, [dataTable, colorMode]);
  if (colorMode === 'TYPE') {
    return _jsxs("div", {
      className: "flex flex-col gap-1 bg-slate-900/90 p-3 rounded border border-slate-700 backdrop-blur pointer-events-auto shadow-xl shrink-0",
      children: [_jsxs("div", {
        className: "flex items-center gap-2 border-b border-slate-700 pb-1 mb-1",
        children: [_jsx("button", {
          onClick: () => setIsCollapsed(!isCollapsed),
          className: "text-red-500 hover:text-red-400 text-xs",
          children: isCollapsed ? '▶' : '▼'
        }), _jsx("h4", {
          className: "text-xs font-bold text-slate-300",
          children: "Type Legend"
        })]
      }), !isCollapsed && uniqueTypes.map(val => _jsxs("div", {
        className: "flex items-center gap-2",
        children: [_jsx("div", {
          className: "w-3 h-3 rounded-full",
          style: {
            backgroundColor: typeColor(val, appSettings)
          }
        }), _jsx("span", {
          className: "text-xs text-slate-400",
          children: val
        })]
      }, val))]
    });
  }
  if (colorMode === 'SPOOL') {
    const spools = computeSpools(dataTable);
    const uniqueSpoolIds = Array.from(new Set(Object.values(spools))).sort((a, b) => a - b);
    return _jsxs("div", {
      className: "flex flex-col gap-1 bg-slate-900/90 p-3 rounded border border-slate-700 backdrop-blur pointer-events-auto shadow-xl shrink-0 max-h-64 overflow-y-auto",
      children: [_jsxs("div", {
        className: "flex items-center gap-2 border-b border-slate-700 pb-1 mb-1",
        children: [_jsx("button", {
          onClick: () => setIsCollapsed(!isCollapsed),
          className: "text-red-500 hover:text-red-400 text-xs",
          children: isCollapsed ? '▶' : '▼'
        }), _jsx("h4", {
          className: "text-xs font-bold text-slate-300",
          children: "Spool Legend"
        })]
      }), !isCollapsed && uniqueSpoolIds.map(val => _jsxs("div", {
        className: "flex items-center gap-2",
        children: [_jsx("div", {
          className: "w-3 h-3 rounded-full",
          style: {
            backgroundColor: spoolColor(val)
          }
        }), _jsxs("span", {
          className: "text-xs text-slate-400",
          children: ["Spool ", val]
        })]
      }, val))]
    });
  }
  if (uniqueValues.length === 0) return null;
  return _jsxs("div", {
    className: "flex flex-col gap-1 bg-slate-900/90 p-3 rounded border border-slate-700 backdrop-blur pointer-events-auto shadow-xl shrink-0 max-h-64 overflow-y-auto",
    children: [_jsxs("div", {
      className: "flex items-center gap-2 border-b border-slate-700 pb-1 mb-1",
      children: [_jsx("button", {
        onClick: () => setIsCollapsed(!isCollapsed),
        className: "text-red-500 hover:text-red-400 text-xs",
        children: isCollapsed ? '▶' : '▼'
      }), _jsxs("h4", {
        className: "text-xs font-bold text-slate-300",
        children: [colorMode, " Legend"]
      })]
    }), !isCollapsed && _jsxs(_Fragment, {
      children: [uniqueValues.map(val => _jsxs("div", {
        className: "flex items-center gap-2",
        children: [_jsx("div", {
          className: "w-3 h-3 rounded-full",
          style: {
            backgroundColor: getCAColor(val)
          }
        }), _jsx("span", {
          className: "text-xs text-slate-400",
          children: val
        })]
      }, val)), _jsxs("div", {
        className: "flex items-center gap-2 mt-1",
        children: [_jsx("div", {
          className: "w-3 h-3 rounded-full bg-slate-600"
        }), _jsx("span", {
          className: "text-xs text-slate-500 italic",
          children: "None / Missing"
        })]
      })]
    })]
  });
};

// ----------------------------------------------------
// Marquee Overlay (Professional Implementation)
// ----------------------------------------------------
const MarqueeLayer = () => {
  const canvasMode = useStore(state => state.canvasMode);
  const setCanvasMode = useStore(state => state.setCanvasMode);
  const dataTable = useStore(state => state.dataTable);
  const setMultiSelect = useStore(state => state.setMultiSelect);
  const pushHistory = useStore(state => state.pushHistory);
  const {
    dispatch
  } = useAppContext();
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({
    x: 0,
    y: 0
  });
  const [currentPos, setCurrentPos] = useState({
    x: 0,
    y: 0
  });
  const overlayRef = useRef(null);
  const pointerIdRef = useRef(null);
  const {
    camera,
    size
  } = useThree();
  const isActive = canvasMode === 'MARQUEE_SELECT' || canvasMode === 'MARQUEE_ZOOM' || canvasMode === 'MARQUEE_DELETE';
  const MIN_DRAG_DISTANCE = 5;
  if (!isActive) return null;

  /**
   * Check if a component (via its bounding box) intersects the marquee.
   * Maps all 8 corners of the 3D bounding box to 2D screen space
   * using exact HTML canvas offset bounds to support both ortho & persp.
   */
  const isComponentInMarquee = (el, rectScreen) => {
    const pts = [];

    // Collect all relevant 3D points for the component
    if (el.ep1) pts.push(new THREE.Vector3(el.ep1.x, el.ep1.y, el.ep1.z));
    if (el.ep2) pts.push(new THREE.Vector3(el.ep2.x, el.ep2.y, el.ep2.z));
    if (el.cp) pts.push(new THREE.Vector3(el.cp.x, el.cp.y, el.cp.z));
    if (el.bp) pts.push(new THREE.Vector3(el.bp.x, el.bp.y, el.bp.z));
    if (el.supportCoor) pts.push(new THREE.Vector3(el.supportCoor.x, el.supportCoor.y, el.supportCoor.z));
    if (pts.length === 0) return false;

    // Build bounding box from all points
    const box = new THREE.Box3();
    pts.forEach(p => box.expandByPoint(p));
    const corners = [new THREE.Vector3(box.min.x, box.min.y, box.min.z), new THREE.Vector3(box.max.x, box.min.y, box.min.z), new THREE.Vector3(box.min.x, box.max.y, box.min.z), new THREE.Vector3(box.max.x, box.max.y, box.min.z), new THREE.Vector3(box.min.x, box.min.y, box.max.z), new THREE.Vector3(box.max.x, box.min.y, box.max.z), new THREE.Vector3(box.min.x, box.max.y, box.max.z), new THREE.Vector3(box.max.x, box.max.y, box.max.z)];
    const canvasRect = document.querySelector('canvas')?.getBoundingClientRect();
    const canvasOffsetLeft = canvasRect ? canvasRect.left : 0;
    const canvasOffsetTop = canvasRect ? canvasRect.top : 0;
    let anyInside = false;
    for (const corner of corners) {
      const projected = corner.clone().project(camera);

      // Behind camera check
      if (projected.z > 1 || projected.z < -1) continue;
      const px = (projected.x * 0.5 + 0.5) * size.width + canvasOffsetLeft;
      const py = (projected.y * -0.5 + 0.5) * size.height + canvasOffsetTop;
      const inside = px >= rectScreen.left && px <= rectScreen.right && py >= rectScreen.top && py <= rectScreen.bottom;
      if (inside) anyInside = true;
    }
    return anyInside;
  };
  const handlePointerDown = e => {
    if (e.button !== 0) return; // Only left mouse button

    e.stopPropagation();
    pointerIdRef.current = e.pointerId;
    if (overlayRef.current) {
      overlayRef.current.setPointerCapture(e.pointerId);
    }
    setIsDragging(true);
    setStartPos({
      x: e.clientX,
      y: e.clientY
    });
    setCurrentPos({
      x: e.clientX,
      y: e.clientY
    });
  };
  const handlePointerMove = e => {
    if (!isDragging || pointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    setCurrentPos({
      x: e.clientX,
      y: e.clientY
    });
  };
  const handlePointerUp = e => {
    if (!isDragging || pointerIdRef.current !== e.pointerId) return;
    e.stopPropagation();
    setIsDragging(false);
    if (overlayRef.current) {
      try {
        overlayRef.current.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Pointer already released
      }
    }
    try {
      // Calculate drag distance
      const dragDist = Math.sqrt(Math.pow(currentPos.x - startPos.x, 2) + Math.pow(currentPos.y - startPos.y, 2));
      if (dragDist < MIN_DRAG_DISTANCE) {
        setCanvasMode('VIEW');
        return;
      }
      const rectScreen = {
        left: Math.min(startPos.x, currentPos.x),
        right: Math.max(startPos.x, currentPos.x),
        top: Math.min(startPos.y, currentPos.y),
        bottom: Math.max(startPos.y, currentPos.y)
      };
      const selected = dataTable.filter(el => {
        if (useStore.getState().hiddenElementIds.includes(el._rowIndex)) return false;
        return isComponentInMarquee(el, rectScreen);
      });
      if (canvasMode === 'MARQUEE_SELECT') {
        setMultiSelect(selected.map(e => e._rowIndex));
      } else if (canvasMode === 'MARQUEE_ZOOM') {
        // Calculate bounding box of selected elements
        let minX = Infinity,
          minY = Infinity,
          minZ = Infinity;
        let maxX = -Infinity,
          maxY = -Infinity,
          maxZ = -Infinity;
        const pts = [];
        selected.forEach(el => {
          if (el.ep1) pts.push(el.ep1);
          if (el.ep2) pts.push(el.ep2);
          if (el.cp) pts.push(el.cp);
        });
        // If no elements selected, use the drag rectangle center as zoom target
        if (pts.length === 0) {
          // Unproject the center of the rectangle to world space
          const canvasRect = document.querySelector('canvas')?.getBoundingClientRect();
          const canvasOffsetLeft = canvasRect ? canvasRect.left : 0;
          const canvasOffsetTop = canvasRect ? canvasRect.top : 0;
          const cx = ((rectScreen.left + rectScreen.right) / 2 - canvasOffsetLeft) / size.width * 2 - 1;
          const cy = -((rectScreen.top + rectScreen.bottom) / 2 - canvasOffsetTop) / size.height * 2 + 1;
          const worldPt = new THREE.Vector3(cx, cy, 0.5).unproject(camera);
          if (typeof dbg !== 'undefined') dbg.tool('MARQUEE_ZOOM', 'No elements in rect — zooming to center', {
            cx,
            cy
          });
          window.dispatchEvent(new CustomEvent('canvas-focus-point', {
            detail: {
              x: worldPt.x,
              y: worldPt.y,
              z: worldPt.z,
              dist: 3000
            }
          }));
        } else {
          pts.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
            minZ = Math.min(minZ, p.z);
            maxZ = Math.max(maxZ, p.z);
          });
          const center = {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2,
            z: (minZ + maxZ) / 2
          };
          const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 500);
          if (typeof dbg !== 'undefined') dbg.tool('MARQUEE_ZOOM', `Zooming to ${selected.length} elements`, {
            center,
            extent,
            elementCount: selected.length
          });
          window.dispatchEvent(new CustomEvent('canvas-focus-point', {
            detail: {
              ...center,
              dist: extent * 1.5
            }
          }));
        }
        // NOTE: Do NOT call setMultiSelect — zoom is a view operation, not selection
      } else if (canvasMode === 'MARQUEE_DELETE' && selected.length > 0) {
        if (window.confirm(`Delete ${selected.length} elements?`)) {
          pushHistory('Delete via Marquee');
          const rowIndices = selected.map(e => e._rowIndex);
          dispatch({
            type: 'DELETE_ELEMENTS',
            payload: {
              rowIndices
            }
          });
          const updatedTable = useStore.getState().dataTable.filter(r => !rowIndices.includes(r._rowIndex));
          useStore.getState().setDataTable(updatedTable);
          dispatch({
            type: "ADD_LOG",
            payload: {
              stage: "INTERACTIVE",
              type: "Applied/Fix",
              message: `Deleted ${selected.length} elements via marquee.`
            }
          });
        }
      }
    } catch (err) {
      if (typeof dbg !== 'undefined') dbg.error('MARQUEE', 'Fatal error during marquee operation', {
        error: err.message
      });
    }
    setCanvasMode('VIEW');
  };
  const handlePointerLeave = e => {
    if (isDragging && pointerIdRef.current === e.pointerId) {
      handlePointerUp(e);
    }
  };
  const getMarqueeStyle = () => {
    const isZoom = canvasMode === 'MARQUEE_ZOOM';
    const isDelete = canvasMode === 'MARQUEE_DELETE';
    const isCrossing = currentPos.x < startPos.x;
    const borderColor = isDelete ? '#ef4444' : isZoom ? '#818cf8' : isCrossing ? '#10b981' : '#3b82f6';
    const bgColor = isDelete ? 'rgba(239,68,68,0.08)' : isZoom ? 'rgba(129,140,248,0.08)' : isCrossing ? 'rgba(16,185,129,0.08)' : 'rgba(59,130,246,0.08)';
    const borderStyle = isCrossing && !isZoom && !isDelete ? 'dashed' : 'solid';
    return {
      position: 'absolute',
      left: Math.min(startPos.x, currentPos.x),
      top: Math.min(startPos.y, currentPos.y),
      width: Math.abs(currentPos.x - startPos.x),
      height: Math.abs(currentPos.y - startPos.y),
      borderWidth: '2px',
      borderStyle: borderStyle,
      borderColor: borderColor,
      backgroundColor: bgColor,
      borderRadius: '2px',
      boxShadow: `0 0 12px ${borderColor}40`,
      pointerEvents: 'none',
      zIndex: 1000,
      transition: 'border-color 0.1s'
    };
  };
  const getCursor = () => {
    switch (canvasMode) {
      case 'MARQUEE_SELECT':
        return 'crosshair';
      case 'MARQUEE_ZOOM':
        return 'zoom-in';
      case 'MARQUEE_DELETE':
        return 'not-allowed';
      default:
        return 'default';
    }
  };
  return _jsx(Html, {
    fullscreen: true,
    zIndexRange: [100, 0],
    style: {
      pointerEvents: 'none'
    },
    children: _jsx("div", {
      ref: overlayRef,
      style: {
        width: '100vw',
        height: '100vh',
        pointerEvents: 'auto',
        cursor: getCursor(),
        userSelect: 'none'
      },
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerLeave: handlePointerLeave,
      children: isDragging && _jsx("div", {
        style: getMarqueeStyle()
      })
    })
  });
};

// ═══════════════════════════════════════════════════════════════
// SHARED TOOL: MEASURE
// This tool also exists in src/ui/tabs/DrawCanvasTab.jsx.
// If modifying logic, update BOTH files and run Checkpoint F.
// ═══════════════════════════════════════════════════════════════
const MeasureTool = () => {
  const appSettings = useStore(state => state.appSettings);
  const measurePts = useStore(state => state.measurePts);
  const addMeasurePt = useStore(state => state.addMeasurePt);
  const canvasMode = useStore(state => state.canvasMode);
  const cursorSnapPoint = useStore(state => state.cursorSnapPoint);
  if (canvasMode !== 'MEASURE') return null;
  const handlePointerDown = e => {
    // Only run when directly hitting the global plane OR if handled by a specific mesh event handler that explicitly bubbles.
    // Actually, for robust measurement, relying on the global click plane is fine as long as depthWrite=false so it intercepts.
    // But since we want to snap to objects, we'll let `InstancedPipes` handle the click bubbling or use this capture plane.
    e.stopPropagation();
    try {
      addMeasurePt(cursorSnapPoint ? cursorSnapPoint.clone() : e.point.clone());
    } catch (err) {
      dbg.error('MEASURE_TOOL', 'Fatal error during measure operation', {
        error: err.message
      });
      setCanvasMode('VIEW');
    }
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

        // Push text up by half bore based on selected element (approx 50-100 units)
        const storeData = useStore.getState().parsedData || [];
        const selectedId = useStore.getState().selectedElementId;
        const multiIds = useStore.getState().multiSelectedIds || [];
        const selectedElem = storeData.find(d => d.id === selectedId || multiIds.includes(d.id));
        const boreOffset = selectedElem && selectedElem.bore ? selectedElem.bore / 2 : 100;
        mid.y += boreOffset;
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
// This tool also exists in src/ui/tabs/DrawCanvasTab.jsx.
// If modifying logic, update BOTH files and run Checkpoint F.
// ═══════════════════════════════════════════════════════════════
const BreakPipeLayer = () => {
  const appSettings = useStore(state => state.appSettings);
  const canvasMode = useStore(state => state.canvasMode);
  const dataTable = useStore(state => state.dataTable);
  const {
    dispatch
  } = useAppContext();
  const pushHistory = useStore(state => state.pushHistory);
  const cursorSnapPoint = useStore(state => state.cursorSnapPoint);
  const [hoverPos, setHoverPos] = useState(null);
  if (canvasMode !== 'BREAK') return null;
  const handlePointerMove = e => {
    // e.object is the instanceMesh, but we need world point
    if (e.point) {
      setHoverPos(e.point);
    }
  };
  const handlePointerOut = () => {
    setHoverPos(null);
  };
  const handlePointerDown = (e, pipeRow) => {
    e.stopPropagation();

    // Ensure it's a pipe
    if (pipeRow) {
      try {
        pushHistory('Break Pipe');
        const breakPt = cursorSnapPoint ? cursorSnapPoint.clone() : e.point.clone();
        const breakResults = breakPipeAtPoint(pipeRow, breakPt);
        if (breakResults) {
          const [rowA, rowB] = breakResults;

          // Dispatch to AppContext
          dispatch({
            type: 'BREAK_PIPE',
            payload: {
              rowIndex: pipeRow._rowIndex,
              rowA,
              rowB
            }
          });

          // Mirror to Zustand
          const updatedTable = dataTable.flatMap(r => r._rowIndex === pipeRow._rowIndex ? [rowA, rowB] : [r]).map((r, i) => ({
            ...r,
            _rowIndex: i + 1
          })); // Re-index

          useStore.getState().setDataTable(updatedTable);
          dispatch({
            type: "ADD_LOG",
            payload: {
              stage: "INTERACTIVE",
              type: "Applied/Fix",
              message: `Row ${pipeRow._rowIndex} broken at (${breakPt.x.toFixed(1)}, ${breakPt.y.toFixed(1)}, ${breakPt.z.toFixed(1)}).`
            }
          });

          // One-shot action
          useStore.getState().setCanvasMode('VIEW');
        } else {
          dispatch({
            type: "ADD_LOG",
            payload: {
              stage: "INTERACTIVE",
              type: "Error",
              message: `Cannot break pipe Row ${pipeRow._rowIndex}. Segment too short.`
            }
          });
        }
      } catch (err) {
        if (typeof dbg !== 'undefined') dbg.error('BREAK_PIPE', 'Fatal error during break operation', {
          error: err.message
        });
        dispatch({
          type: "ADD_LOG",
          payload: {
            stage: "INTERACTIVE",
            type: "Error",
            message: `Failed to break pipe: ${err.message}`
          }
        });
      }
    }
  };
  return _jsxs("group", {
    children: [_jsx("group", {
      onPointerMove: handlePointerMove,
      onPointerOut: handlePointerOut,
      children: dataTable.filter(r => (r.type || '').toUpperCase() === 'PIPE' && !useStore.getState().hiddenElementIds.includes(r._rowIndex)).map((pipe, i) => {
        if (!pipe.ep1 || !pipe.ep2) return null;
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
          onPointerDown: e => handlePointerDown(e, pipe),
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
// SHARED TOOL: CONNECT
// This tool also exists in src/ui/tabs/DrawCanvasTab.jsx.
// If modifying logic, update BOTH files and run Checkpoint F.
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// SHARED TOOL: STRETCH
// This tool also exists in src/ui/tabs/DrawCanvasTab.jsx.
// If modifying logic, update BOTH files and run Checkpoint F.
// ═══════════════════════════════════════════════════════════════
const EndpointSnapLayer = () => {
  const appSettings = useStore(state => state.appSettings);
  const canvasMode = useStore(state => state.canvasMode);
  const setCanvasMode = useStore(state => state.setCanvasMode);
  const dataTable = useStore(state => state.dataTable);
  const updateDataTable = useStore(state => state.updateDataTable);
  const pushHistory = useStore(state => state.pushHistory);
  const {
    dispatch
  } = useAppContext();
  const [connectDraft, setConnectDraft] = useState(null);
  const [cursorPos, setCursorPos] = useState(new THREE.Vector3());

  // Active in CONNECT or STRETCH mode
  if (canvasMode !== 'CONNECT' && canvasMode !== 'STRETCH') return null;
  const snapRadius = 50; // mm

  const handlePointerMove = e => {
    let pt = e.point.clone();
    if (connectDraft && useStore.getState().orthoMode) {
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
    let nearest = null;
    let minDist = snapRadius;
    dataTable.forEach(row => {
      ['ep1', 'ep2'].forEach(epKey => {
        const ep = row[epKey];
        if (ep) {
          const pt = new THREE.Vector3(parseFloat(ep.x), parseFloat(ep.y), parseFloat(ep.z));
          const d = pt.distanceTo(e.point);
          if (d < minDist) {
            minDist = d;
            nearest = {
              row,
              epKey,
              position: pt
            };
          }
        }
      });
    });

    // We already use useStore(cursorSnapPoint) globally but here we need
    // to manage click/drag specifically for stretching endpoints.
    // We'll rely on the global snap point for visuals, but we handle the dragging here.
  };
  const handlePointerDown = e => {
    // We handle logic in PointerUp for click-to-connect now
  };
  const handlePointerUp = e => {
    e.stopPropagation();
    try {
      let nearest = null;
      let minDist = snapRadius;
      dataTable.forEach(row => {
        ['ep1', 'ep2'].forEach(epKey => {
          const ep = row[epKey];
          if (ep) {
            const pt = new THREE.Vector3(parseFloat(ep.x), parseFloat(ep.y), parseFloat(ep.z));
            const d = pt.distanceTo(e.point);
            if (d < minDist) {
              minDist = d;
              nearest = {
                rowIndex: row._rowIndex,
                epKey,
                position: pt
              };
            }
          }
        });
      });

      // If we don't have a draft yet, set the draft (First Click)
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

      // Second click: If dropped on another valid snap point
      if (nearest && (nearest.rowIndex !== connectDraft.fromRowIndex || nearest.epKey !== connectDraft.fromEP)) {
        pushHistory(canvasMode === 'STRETCH' ? 'Stretch Pipe' : 'Snap Connect');
        const sourceRow = dataTable.find(r => r._rowIndex === connectDraft.fromRowIndex);
        if (sourceRow) {
          const targetPos = nearest.position;
          const sourcePos = connectDraft.fromPosition;
          const updatedTable = [...dataTable];
          const sourceIdxInArray = updatedTable.findIndex(r => r._rowIndex === connectDraft.fromRowIndex);
          if (canvasMode === 'STRETCH') {
            // STRETCH MODE: Update the endpoint of the existing pipe
            if (sourceIdxInArray !== -1) {
              const updatedRow = {
                ...updatedTable[sourceIdxInArray]
              };
              updatedRow[connectDraft.fromEP] = {
                x: targetPos.x,
                y: targetPos.y,
                z: targetPos.z
              };
              updatedTable[sourceIdxInArray] = updatedRow;
              dispatch({
                type: 'APPLY_GAP_FIX',
                payload: {
                  updatedTable
                }
              });
              useStore.getState().setDataTable(updatedTable);
              dispatch({
                type: 'ADD_LOG',
                payload: {
                  type: 'Applied/Fix',
                  stage: 'STRETCH_TOOL',
                  message: `Stretched Row ${sourceRow._rowIndex} to Row ${nearest.rowIndex}.`
                }
              });
            }
          } else {
            // CONNECT MODE: Synthesize new bridge pipe instead of stretching
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
              bore: sourceRow.bore || 100,
              pipelineRef: `${sourceRow.pipelineRef || 'UNKNOWN'}_bridge`,
              skey: 'PIPE',
              ca1: sourceRow.ca1 || sourceRow.CA1 || '',
              ca2: sourceRow.ca2 || sourceRow.CA2 || '',
              ca3: sourceRow.ca3 || sourceRow.CA3 || '',
              ca4: sourceRow.ca4 || sourceRow.CA4 || '',
              ca5: sourceRow.ca5 || sourceRow.CA5 || '',
              ca6: sourceRow.ca6 || sourceRow.CA6 || '',
              ca7: sourceRow.ca7 || sourceRow.CA7 || '',
              ca8: sourceRow.ca8 || sourceRow.CA8 || '',
              ca9: sourceRow.ca9 || sourceRow.CA9 || '',
              ca10: sourceRow.ca10 || sourceRow.CA10 || '',
              tag: `${sourceRow.pipelineRef || 'UNKNOWN'}_3DTopoBridge`
            };

            // Find the highest existing _rowIndex to ensure uniqueness without corrupting others
            const maxRowIndex = Math.max(...updatedTable.map(r => r._rowIndex || 0));
            newBridgePipe._rowIndex = maxRowIndex + 1;

            // Splice the new bridge pipe into the table, inserted between the source and target rows.
            // Insert after source row (or append if not found)
            if (sourceIdxInArray !== -1) {
              updatedTable.splice(sourceIdxInArray + 1, 0, newBridgePipe);
            } else {
              updatedTable.push(newBridgePipe);
            }

            // Re-index all elements sequentially
            const sequentialTable = updatedTable.map((r, i) => ({
              ...r,
              _rowIndex: i + 1
            }));

            // Dispatch APPLY_GAP_FIX which replaces the full table in AppContext
            dispatch({
              type: 'APPLY_GAP_FIX',
              payload: {
                updatedTable: sequentialTable
              }
            });

            // Mirror to Zustand store
            useStore.getState().setDataTable(sequentialTable);
            dispatch({
              type: 'ADD_LOG',
              payload: {
                type: 'Applied/Fix',
                stage: 'CONNECT_TOOL',
                message: `Bridged Row ${sourceRow._rowIndex} and Row ${nearest.rowIndex} with a new PIPE.`
              }
            });
          }
        }
      }
      setConnectDraft(null);
      setCanvasMode('VIEW');
    } catch (err) {
      dbg.error('ENDPOINT_SNAP', 'Fatal error during connect/stretch operation', {
        error: err.message
      });
      dispatch({
        type: 'ADD_LOG',
        payload: {
          type: 'Error',
          stage: 'ENDPOINT_SNAP',
          message: `Connect/Stretch failed: ${err.message}`
        }
      });
      setConnectDraft(null);
      setCanvasMode('VIEW');
    }
  };
  return _jsxs("group", {
    children: [_jsxs("mesh", {
      scale: 100000,
      rotation: [-Math.PI / 2, 0, 0],
      onPointerMove: handlePointerMove,
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      renderOrder: -1,
      children: [_jsx("planeGeometry", {}), _jsx("meshBasicMaterial", {
        transparent: true,
        opacity: 0,
        depthWrite: false
      })]
    }), dataTable.map(row => {
      const pts = [];
      if (row.ep1) pts.push(new THREE.Vector3(parseFloat(row.ep1.x), parseFloat(row.ep1.y), parseFloat(row.ep1.z)));
      if (row.ep2) pts.push(new THREE.Vector3(parseFloat(row.ep2.x), parseFloat(row.ep2.y), parseFloat(row.ep2.z)));
      return pts.map((pt, i) => _jsxs("mesh", {
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
      }, `snap-${row._rowIndex}-${i}`));
    }), connectDraft && (() => {
      const start = connectDraft.fromPosition;
      const end = cursorPos;
      const vec = new THREE.Vector3().subVectors(end, start);
      const len = vec.length();
      if (len < 0.1) return null; // Avoid rendering 0-length cylinders
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec.clone().normalize());
      const color = canvasMode === 'STRETCH' ? '#10b981' : '#f59e0b'; // Emerald for stretch, Amber for connect

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

// ----------------------------------------------------
// Gap Radar Layer
// ----------------------------------------------------
const GapRadarLayer = () => {
  const showGapRadar = useStore(state => state.showGapRadar);
  const dataTable = useStore(state => state.dataTable);

  // For pulsing animation
  const materialRef = useRef();
  const sphereRef = useRef();
  useFrame(({
    clock
  }) => {
    if (showGapRadar) {
      const time = clock.getElapsedTime();
      const scale = 1 + Math.sin(time * 3) * 0.2; // pulse between 0.8 and 1.2
      const opacity = 0.6 + Math.sin(time * 3) * 0.3; // pulse between 0.3 and 0.9

      // Only update if materials/meshes exist. Since we might have multiple gaps,
      // we animate a global material or just rely on CSS-like scale?
      // Actually, we can just apply it to a shared value or let useFrame map over refs.
      // A simpler way: we'll animate a shared scale/opacity uniform/property on the group level
      // but for simplicity, let's just create a pulsing component for each gap.
    }
  });
  const gaps = useMemo(() => {
    if (!showGapRadar || dataTable.length === 0) return [];
    const found = [];
    const topologyRows = dataTable.filter(r => (r.type || '').toUpperCase() !== 'SUPPORT' && (r.ep1 || r.ep2));
    for (let i = 0; i < topologyRows.length - 1; i++) {
      const elA = topologyRows[i];
      const elB = topologyRows[i + 1];
      if (elA.ep2 && elB.ep1) {
        const ptA = new THREE.Vector3(elA.ep2.x, elA.ep2.y, elA.ep2.z);
        const ptB = new THREE.Vector3(elB.ep1.x, elB.ep1.y, elB.ep1.z);
        const dist = ptA.distanceTo(ptB);
        if (dist > 0 && dist <= 25.0) {
          found.push({
            ptA,
            ptB,
            dist,
            mid: ptA.clone().lerp(ptB, 0.5)
          });
        }
      }
    }
    return found;
  }, [showGapRadar, dataTable]);
  if (!showGapRadar || gaps.length === 0) return null;
  return _jsx("group", {
    children: gaps.map((gap, i) => {
      const color = gap.dist <= 6.0 ? '#f97316' : '#ef4444'; // Orange for fixable, Red for insert pipe
      return _jsx(PulsingGap, {
        gap: gap,
        color: color
      }, `gap-${i}`);
    })
  });
};
const PulsingGap = ({
  gap,
  color
}) => {
  const meshRefA = useRef();
  const matRefA = useRef();
  const meshRefB = useRef();
  const matRefB = useRef();
  useFrame(({
    clock
  }) => {
    if (!meshRefA.current || !matRefA.current || !meshRefB.current || !matRefB.current) return;
    const time = clock.getElapsedTime();
    const s = 1 + Math.sin(time * 5) * 0.35; // Pulse scale
    meshRefA.current.scale.set(s, s, s);
    meshRefB.current.scale.set(s, s, s);
    const opacity = 0.5 + Math.abs(Math.sin(time * 5)) * 0.4;
    matRefA.current.opacity = opacity;
    matRefB.current.opacity = opacity;
  });
  return _jsxs("group", {
    children: [_jsx(Line, {
      points: [gap.ptA, gap.ptB],
      color: color,
      lineWidth: 12,
      transparent: true,
      opacity: 0.3,
      depthTest: false
    }), _jsx(Line, {
      points: [gap.ptA, gap.ptB],
      color: color,
      lineWidth: 4,
      dashed: true,
      dashSize: 5,
      gapSize: 2,
      depthTest: false
    }), _jsxs("mesh", {
      position: gap.ptA,
      ref: meshRefA,
      children: [_jsx("sphereGeometry", {
        args: [20, 16, 16]
      }), _jsx("meshBasicMaterial", {
        ref: matRefA,
        color: color,
        transparent: true,
        opacity: 0.7,
        depthTest: false
      })]
    }), _jsxs("mesh", {
      position: gap.ptB,
      ref: meshRefB,
      children: [_jsx("sphereGeometry", {
        args: [20, 16, 16]
      }), _jsx("meshBasicMaterial", {
        ref: matRefB,
        color: color,
        transparent: true,
        opacity: 0.7,
        depthTest: false
      })]
    }), _jsxs(Text, {
      position: [gap.mid.x, gap.mid.y + 15, gap.mid.z],
      color: color,
      fontSize: 20,
      fontWeight: "bold",
      anchorX: "center",
      outlineWidth: 2,
      outlineColor: "#000",
      depthTest: false,
      children: ["\u26A0 ", gap.dist.toFixed(1), "mm Gap"]
    })]
  });
};

// ----------------------------------------------------
// EP Labels
// ----------------------------------------------------
const EPLabelsLayer = () => {
  const appSettings = useStore(state => state.appSettings);
  const showRowLabels = useStore(state => state.showRowLabels);
  const showRefLabels = useStore(state => state.showRefLabels);
  const dataTable = useStore(state => state.dataTable);
  const {
    dispatch
  } = useAppContext();
  useEffect(() => {
    if ((showRowLabels || showRefLabels) && dataTable.length > 500) {
      dispatch({
        type: "ADD_LOG",
        payload: {
          stage: "UI",
          type: "Warning",
          message: "Labels disabled: >500 elements causes performance issues."
        }
      });
      if (showRowLabels) useStore.getState().setShowRowLabels(false);
      if (showRefLabels) useStore.getState().setShowRefLabels(false);
    }
  }, [showRowLabels, showRefLabels, dataTable.length, dispatch]);
  if (!showRowLabels && !showRefLabels || dataTable.length > 500) return null;
  return _jsx("group", {
    children: dataTable.map((el, i) => {
      if (!el.ep1 && !el.ep2) return null;
      const pt = el.ep1 || el.ep2;
      return _jsxs(React.Fragment, {
        children: [showRowLabels && _jsxs(Text, {
          position: [pt.x, pt.y + 30, pt.z],
          color: appSettings.selectionColor,
          fontSize: 50,
          outlineWidth: 2,
          outlineColor: "#0f172a",
          children: ["R", el._rowIndex]
        }), showRefLabels && el.pipelineRef && _jsx(Text, {
          position: [pt.x, pt.y + 80, pt.z],
          color: "#38bdf8",
          fontSize: 50,
          outlineWidth: 2,
          outlineColor: "#0f172a",
          children: el.pipelineRef
        })]
      }, `eplabels-${i}`);
    })
  });
};

// ----------------------------------------------------
// Insert Support Layer
// ----------------------------------------------------
const InsertSupportLayer = () => {
  const appSettings = useStore(state => state.appSettings);
  const canvasMode = useStore(state => state.canvasMode);
  const dataTable = useStore(state => state.dataTable);
  const {
    dispatch
  } = useAppContext();
  const pushHistory = useStore(state => state.pushHistory);
  const cursorSnapPoint = useStore(state => state.cursorSnapPoint);
  const [hoverPos, setHoverPos] = useState(null);
  if (canvasMode !== 'INSERT_SUPPORT') return null;
  const handlePointerMove = e => {
    if (e.point) setHoverPos(e.point);
  };
  const handlePointerOut = () => {
    setHoverPos(null);
  };
  const handlePointerDown = (e, pipeRow) => {
    e.stopPropagation();
    if (pipeRow) {
      try {
        pushHistory('Insert Support');
        const insertPt = cursorSnapPoint ? cursorSnapPoint.clone() : e.point.clone();
        const supportRow = insertSupportAtPipe(pipeRow, insertPt);
        if (supportRow) {
          // Determine new index and update
          const newRowIndex = Math.max(...dataTable.map(r => r._rowIndex || 0)) + 1;
          supportRow._rowIndex = newRowIndex;
          dispatch({
            type: 'INSERT_SUPPORT',
            payload: {
              afterRowIndex: pipeRow._rowIndex,
              supportRow
            }
          });

          // Add right after the pipe
          const idx = dataTable.findIndex(r => r._rowIndex === pipeRow._rowIndex);
          const updatedTable = [...dataTable];
          updatedTable.splice(idx + 1, 0, supportRow);
          const reindexedTable = updatedTable.map((r, i) => ({
            ...r,
            _rowIndex: i + 1
          }));
          useStore.getState().setDataTable(reindexedTable);
          dispatch({
            type: "ADD_LOG",
            payload: {
              stage: "INTERACTIVE",
              type: "Applied/Fix",
              message: `Inserted Support at Row ${supportRow._rowIndex}.`
            }
          });

          // Keep mode active to insert more, or return to VIEW?
          // The requirements say one-shot for break, let's keep it for insert or make it one-shot.
          // Assuming continuous insertion is helpful.
        }
      } catch (err) {
        dbg.error('INSERT_SUPPORT', 'Fatal error during support insertion', {
          error: err.message
        });
        dispatch({
          type: 'ADD_LOG',
          payload: {
            type: 'Error',
            stage: 'INSERT_SUPPORT',
            message: `Support insertion failed: ${err.message}`
          }
        });
        setCanvasMode('VIEW');
      }
    }
  };
  return _jsxs("group", {
    children: [_jsx("group", {
      onPointerMove: handlePointerMove,
      onPointerOut: handlePointerOut,
      children: dataTable.filter(r => (r.type || '').toUpperCase() === 'PIPE').map((pipe, i) => {
        if (!pipe.ep1 || !pipe.ep2) return null;
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
          onPointerDown: e => handlePointerDown(e, pipe),
          children: [_jsx("cylinderGeometry", {
            args: [r * 2, r * 2, dist, 8]
          }), _jsx("meshBasicMaterial", {
            color: "green",
            transparent: true,
            opacity: 0,
            depthWrite: false
          })]
        }, `is-${i}`);
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

// ----------------------------------------------------
// Context Menu
// ----------------------------------------------------
const ContextMenu = () => {
  const contextMenu = useStore(state => state.contextMenu);
  const closeContextMenu = useStore(state => state.closeContextMenu);
  const setSelected = useStore(state => state.setSelected);
  const hideSelected = useStore(state => state.hideSelected);
  const isolateSelected = useStore(state => state.isolateSelected);
  const setMultiSelect = useStore(state => state.setMultiSelect);
  const {
    dispatch
  } = useAppContext();
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu) closeContextMenu();
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [contextMenu, closeContextMenu]);
  if (!contextMenu) return null;
  const handleAction = action => {
    // Ensure the clicked element is selected for these actions
    setSelected(contextMenu.rowIndex);
    setMultiSelect([contextMenu.rowIndex]);
    if (action === 'HIDE') {
      hideSelected();
    } else if (action === 'ISOLATE') {
      isolateSelected();
    } else if (action === 'DELETE') {
      dispatch({
        type: 'DELETE_ELEMENTS',
        payload: {
          rowIndices: [contextMenu.rowIndex]
        }
      });
    } else if (action === 'PROPERTIES') {
      // Usually, selecting an element automatically shows the side inspector,
      // so we just need to ensure it's open if it's currently closed.
      window.dispatchEvent(new CustomEvent('open-side-inspector'));
    }
    closeContextMenu();
  };
  return _jsxs("div", {
    className: "fixed z-[100] bg-slate-900 border border-slate-700 shadow-xl rounded py-1 w-44",
    style: {
      top: contextMenu.y,
      left: contextMenu.x
    },
    onContextMenu: e => e.preventDefault(),
    children: [_jsxs("div", {
      className: "px-3 py-1 text-xs font-bold text-slate-500 border-b border-slate-800 mb-1",
      children: ["Row ", contextMenu.rowIndex]
    }), _jsxs("button", {
      onClick: () => handleAction('PROPERTIES'),
      className: "w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center gap-2",
      children: [_jsxs("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        width: "14",
        height: "14",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        className: "text-blue-400",
        children: [_jsx("path", {
          d: "M12 20h9"
        }), _jsx("path", {
          d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
        })]
      }), "Property Panel"]
    }), _jsxs("button", {
      onClick: () => handleAction('ISOLATE'),
      className: "w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center gap-2",
      children: [_jsxs("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        width: "14",
        height: "14",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        className: "text-amber-400",
        children: [_jsx("path", {
          d: "M5 12s2.545-5 7-5c4.928 0 7 5 7 5s-2.072 5-7 5c-4.455 0-7-5-7-5z"
        }), _jsx("path", {
          d: "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
        })]
      }), "Isolate"]
    }), _jsxs("button", {
      onClick: () => handleAction('HIDE'),
      className: "w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center gap-2",
      children: [_jsxs("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        width: "14",
        height: "14",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        className: "text-slate-400",
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
      }), "Hide"]
    }), _jsxs("button", {
      onClick: () => handleAction('DELETE'),
      className: "w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/40 hover:text-red-300 transition-colors mt-1 border-t border-slate-800 flex items-center gap-2",
      children: [_jsxs("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        width: "14",
        height: "14",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        className: "text-red-400",
        children: [_jsx("path", {
          d: "M3 6h18"
        }), _jsx("path", {
          d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
        }), _jsx("path", {
          d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
        }), _jsx("line", {
          x1: "10",
          x2: "10",
          y1: "11",
          y2: "17"
        }), _jsx("line", {
          x1: "14",
          x2: "14",
          y1: "11",
          y2: "17"
        })]
      }), "Delete"]
    })]
  });
};

// ----------------------------------------------------
// Hover Tooltip
// ----------------------------------------------------
const HoverTooltip = () => {
  const hoveredElementId = useStore(state => state.hoveredElementId);
  const dataTable = useStore(state => state.dataTable);
  const [tooltipPos, setTooltipPos] = useState({
    x: 0,
    y: 0
  });
  const timerRef = useRef(null);

  // Global listener for pointer move to track cursor
  useEffect(() => {
    const handleMouseMove = e => {
      setTooltipPos({
        x: e.clientX,
        y: e.clientY
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);
  if (!hoveredElementId) return null;
  const el = dataTable.find(r => r._rowIndex === hoveredElementId);
  if (!el) return null;
  let len = 0;
  if (el.ep1 && el.ep2) {
    len = Math.sqrt(Math.pow(el.ep1.x - el.ep2.x, 2) + Math.pow(el.ep1.y - el.ep2.y, 2) + Math.pow(el.ep1.z - el.ep2.z, 2));
  }
  return _jsxs("div", {
    className: "fixed z-50 pointer-events-none bg-slate-900/90 border border-slate-700 shadow-xl rounded p-2 text-xs",
    style: {
      left: tooltipPos.x + 15,
      top: tooltipPos.y + 15
    },
    children: [_jsxs("div", {
      className: "flex items-center gap-2 mb-1",
      children: [_jsx("span", {
        className: "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
        style: {
          backgroundColor: typeColor(el.type),
          color: 'white'
        },
        children: el.type
      }), _jsxs("span", {
        className: "text-slate-300 font-bold",
        children: ["Row ", el._rowIndex]
      })]
    }), _jsxs("div", {
      className: "text-slate-400 grid grid-cols-2 gap-x-3 gap-y-1",
      children: [_jsx("span", {
        children: "Bore:"
      }), _jsx("span", {
        className: "text-slate-200",
        children: el.bore
      }), _jsx("span", {
        children: "Len:"
      }), _jsxs("span", {
        className: "text-slate-200",
        children: [len.toFixed(1), "mm"]
      }), el.ep1 && _jsxs(_Fragment, {
        children: [_jsx("span", {
          children: "EP1 X:"
        }), _jsx("span", {
          className: "text-slate-200",
          children: el.ep1.x.toFixed(1)
        })]
      }), el.ep1 && _jsxs(_Fragment, {
        children: [_jsx("span", {
          children: "EP1 Y:"
        }), _jsx("span", {
          className: "text-slate-200",
          children: el.ep1.y.toFixed(1)
        })]
      }), el.ep1 && _jsxs(_Fragment, {
        children: [_jsx("span", {
          children: "EP1 Z:"
        }), _jsx("span", {
          className: "text-slate-200",
          children: el.ep1.z.toFixed(1)
        })]
      })]
    })]
  });
};

// Main Tab Component
// ----------------------------------------------------

const ControlsAutoCenter = ({
  externalRef
}) => {
  const controlsRef = useRef();
  const getPipes = useStore(state => state.getPipes);
  const [targetPos, setTargetPos] = useState(null);
  const [camPos, setCamPos] = useState(null);
  const isAnimating = useRef(false);
  const applyViewerFitPolicy = (camera, target, maxDim) => {
    if (!camera || !target) return;
    const safeDim = Math.max(maxDim || 1, 1);
    if (camera.isOrthographicCamera) {
      const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
      const half = safeDim * 0.8;
      camera.left = -half * aspect;
      camera.right = half * aspect;
      camera.top = half;
      camera.bottom = -half;
      camera.near = -safeDim * 20;
      camera.far = safeDim * 20;
      camera.updateProjectionMatrix();
    } else if (camera.isPerspectiveCamera) {
      camera.near = Math.max(0.1, safeDim * 0.001);
      camera.far = Math.max(camera.near + 1000, safeDim * 50);
      camera.updateProjectionMatrix();
    }
  };

  // Smooth camera interpolation
  useFrame((state, delta) => {
    if (!controlsRef.current || !isAnimating.current || !targetPos || !camPos) return;

    // Lerp OrbitControls target
    controlsRef.current.target.lerp(targetPos, 5 * delta);
    // Lerp Camera position
    state.camera.position.lerp(camPos, 5 * delta);

    // Stop animating when close
    if (controlsRef.current.target.distanceTo(targetPos) < 1 && state.camera.position.distanceTo(camPos) < 1) {
      isAnimating.current = false;
    }
    controlsRef.current.update();
  });

  // Add custom event listener for auto-center
  useEffect(() => {
    const handleFocus = e => {
      if (!controlsRef.current) return;
      const {
        x,
        y,
        z,
        dist
      } = e.detail;
      const tPos = new THREE.Vector3(x, y, z);
      // Move camera closer to object based on its length/dist
      // Make sure the zoom distance isn't excessively far or close
      const zoomDist = Math.max(dist * 1.5, 300);

      // Current camera direction to object
      const dir = new THREE.Vector3().subVectors(controlsRef.current.object.position, tPos).normalize();
      if (dir.lengthSq() < 0.1) dir.set(1, 1, 1).normalize(); // Default offset if dead center

      const cPos = new THREE.Vector3().copy(tPos).addScaledVector(dir, zoomDist);
      setTargetPos(tPos);
      setCamPos(cPos);
      isAnimating.current = true;
    };
    const handleCenter = e => {
      const pipes = getPipes();
      const immutables = useStore.getState().getImmutables();
      const allEls = [...pipes, ...immutables];
      if (allEls.length === 0 || !controlsRef.current) return;
      let minX = Infinity,
        minY = Infinity,
        minZ = Infinity;
      let maxX = -Infinity,
        maxY = -Infinity,
        maxZ = -Infinity;

      // Optional explicit list of elements to frame
      const elsToFrame = e?.detail?.elements || allEls;
      elsToFrame.forEach(p => {
        if (p.ep1) {
          minX = Math.min(minX, p.ep1.x);
          minY = Math.min(minY, p.ep1.y);
          minZ = Math.min(minZ, p.ep1.z);
          maxX = Math.max(maxX, p.ep1.x);
          maxY = Math.max(maxY, p.ep1.y);
          maxZ = Math.max(maxZ, p.ep1.z);
        }
        if (p.ep2) {
          minX = Math.min(minX, p.ep2.x);
          minY = Math.min(minY, p.ep2.y);
          minZ = Math.min(minZ, p.ep2.z);
          maxX = Math.max(maxX, p.ep2.x);
          maxY = Math.max(maxY, p.ep2.y);
          maxZ = Math.max(maxZ, p.ep2.z);
        }
      });
      if (minX !== Infinity) {
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;
        const tPos = new THREE.Vector3(centerX, centerY, centerZ);
        const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
        // Align with viewer fit behavior, but keep Z-up for reset/home framing.
        const cPos = new THREE.Vector3(centerX + maxDim, centerY - maxDim, centerZ + maxDim);
        controlsRef.current.object.up.set(0, 0, 1);
        applyViewerFitPolicy(controlsRef.current.object, tPos, maxDim);
        setTargetPos(tPos);
        setCamPos(cPos);
        isAnimating.current = true;
      }
    };
    const handleSetView = e => {
      if (!controlsRef.current) return;
      const viewType = e.detail.viewType;
      if (viewType === 'HOME' || viewType === 'FIT') {
        handleCenter(e);
        return;
      }
      const tPos = controlsRef.current.target.clone();
      const currentDist = controlsRef.current.target.distanceTo(controlsRef.current.object.position);
      const dist = Math.max(currentDist, 1000);
      let cPos = new THREE.Vector3();
      switch (viewType) {
        case 'TOP':
          cPos.set(tPos.x, tPos.y + dist, tPos.z);
          break;
        case 'FRONT':
          cPos.set(tPos.x, tPos.y, tPos.z + dist);
          break;
        case 'RIGHT':
          cPos.set(tPos.x + dist, tPos.y, tPos.z);
          break;
        case 'ISO':
          cPos.set(tPos.x + dist, tPos.y + dist, tPos.z + dist);
          break;
        default:
          return;
      }
      setTargetPos(tPos);
      setCamPos(cPos);
      isAnimating.current = true;
    };
    const handleSaveCamera = e => {
      if (!controlsRef.current) return;
      const preset = e.detail.preset;
      const data = {
        camPos: controlsRef.current.object.position.clone(),
        camTarget: controlsRef.current.target.clone()
      };
      localStorage.setItem(`pcf-camera-preset-${preset}`, JSON.stringify(data));
    };
    const handleLoadCamera = e => {
      if (!controlsRef.current) return;
      const preset = e.detail.preset;
      const saved = localStorage.getItem(`pcf-camera-preset-${preset}`);
      if (saved) {
        const data = JSON.parse(saved);
        setTargetPos(new THREE.Vector3().copy(data.camTarget));
        setCamPos(new THREE.Vector3().copy(data.camPos));
        isAnimating.current = true;
      }
    };
    window.addEventListener('canvas-save-camera', handleSaveCamera);
    window.addEventListener('canvas-load-camera', handleLoadCamera);
    window.addEventListener('canvas-auto-center', handleCenter);
    window.addEventListener('canvas-focus-point', handleFocus);
    window.addEventListener('canvas-set-view', handleSetView);
    window.addEventListener('canvas-reset-view', handleCenter);
    return () => {
      window.removeEventListener('canvas-save-camera', handleSaveCamera);
      window.removeEventListener('canvas-load-camera', handleLoadCamera);
      window.removeEventListener('canvas-auto-center', handleCenter);
      window.removeEventListener('canvas-focus-point', handleFocus);
      window.removeEventListener('canvas-set-view', handleSetView);
      window.removeEventListener('canvas-reset-view', handleCenter);
    };
  }, [getPipes]);

  // Session Camera Persistence
  useEffect(() => {
    if (!controlsRef.current) return;
    try {
      const saved = sessionStorage.getItem('pcf-canvas-session');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.camPos) controlsRef.current.object.position.copy(data.camPos);
        if (data.camTarget) controlsRef.current.target.copy(data.camTarget);
        controlsRef.current.update();
        if (data.showRowLabels !== undefined) useStore.getState().setShowRowLabels(data.showRowLabels);
        if (data.showRefLabels !== undefined) useStore.getState().setShowRefLabels(data.showRefLabels);
        if (data.showGapRadar !== undefined) useStore.getState().setShowGapRadar(data.showGapRadar);
      }
    } catch (e) {
      console.error("Failed to restore camera session", e);
    }
    return () => {
      if (controlsRef.current) {
        const data = {
          camPos: controlsRef.current.object.position,
          camTarget: controlsRef.current.target,
          showRowLabels: useStore.getState().showRowLabels,
          showRefLabels: useStore.getState().showRefLabels,
          showGapRadar: useStore.getState().showGapRadar
        };
        sessionStorage.setItem('pcf-canvas-session', JSON.stringify(data));
      }
    };
  }, []);
  const canvasMode = useStore(state => state.canvasMode);
  const interactionMode = useStore(state => state.interactionMode);
  const appSettings = useStore(state => state.appSettings);
  // Allow panning/zooming during CONNECT, STRETCH, MEASURE, BREAK now that they are click-based.
  const controlsEnabled = !['MARQUEE_SELECT', 'MARQUEE_ZOOM', 'MARQUEE_DELETE'].includes(canvasMode);
  const handlePointerDown = e => {
    // Disabled center on click by default
  };

  // Attach listener to window so we can grab raycast points globally from canvas
  useEffect(() => {
    const handler = e => {
      // In R3F, click events natively return the intersected point.
      // To globally center orbit on ANY click on the 3D scene, we could use the mesh onClick events.
      // We will implement this centrally via the 'canvas-focus-point' custom event or natively in mesh pointer down.
    };
  }, []);
  const mouseButtons = {
    LEFT: interactionMode === 'PAN' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: interactionMode === 'PAN' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN
  };

  // When CTRL is pressed, override mouse buttons to null
  // so that OrbitControls doesn't hijack the drag
  const [ctrlPressed, setCtrlPressed] = useState(false);
  useEffect(() => {
    const down = e => {
      if (e.key === 'Control' || e.key === 'Meta') setCtrlPressed(true);
    };
    const up = e => {
      if (e.key === 'Control' || e.key === 'Meta') setCtrlPressed(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  const currentMouseButtons = ctrlPressed ? {
    LEFT: null,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: null
  } : mouseButtons;
  return _jsx(OrbitControls, {
    ref: c => {
      controlsRef.current = c;
      if (externalRef) externalRef.current = c;
    },
    enabled: controlsEnabled,
    makeDefault: true,
    enableDamping: true,
    dampingFactor: 0.1,
    mouseButtons: currentMouseButtons
  });
};
export function CanvasTab() {
  const {
    state: appState,
    dispatch
  } = useAppContext();
  const orthoMode = useStore(state => state.orthoMode);
  const gridCenter = useMemo(() => {
    const rows = appState.stage2Data || [];
    if (!rows.length) return {
      x: 0,
      y: 0,
      z: 0
    };
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    rows.forEach(r => {
      [r.ep1, r.ep2, r.cp, r.bp].forEach(p => {
        if (!p) return;
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        minZ = Math.min(minZ, p.z);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
        maxZ = Math.max(maxZ, p.z);
      });
    });
    if (minX === Infinity) return {
      x: 0,
      y: 0,
      z: 0
    };
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2
    };
  }, [appState.stage2Data]);
  const showSideInspector = useStore(state => state.showSideInspector);
  const setShowSideInspector = useStore(state => state.setShowSideInspector);
  useEffect(() => {
    const handleOpenSideInspector = () => setShowSideInspector(true);
    window.addEventListener('open-side-inspector', handleOpenSideInspector);
    return () => window.removeEventListener('open-side-inspector', handleOpenSideInspector);
  }, [setShowSideInspector]);
  const proposals = useStore(state => state.proposals);
  const [currentIssueIndex, setCurrentIssueIndex] = useState(0);
  const dragOrbitRef = useRef(null); // shared ref for orbit controls disable during drag

  // Store Connections
  const canvasMode = useStore(state => state.canvasMode);
  const setCanvasMode = useStore(state => state.setCanvasMode);
  const showGapRadar = useStore(state => state.showGapRadar);
  const setShowGapRadar = useStore(state => state.setShowGapRadar);
  const showRowLabels = useStore(state => state.showRowLabels);
  const setShowRowLabels = useStore(state => state.setShowRowLabels);
  const showRefLabels = useStore(state => state.showRefLabels);
  const setShowRefLabels = useStore(state => state.setShowRefLabels);
  const colorMode = useStore(state => state.colorMode);
  const setColorMode = useStore(state => state.setColorMode);
  const dragAxisLock = useStore(state => state.dragAxisLock);
  const setDragAxisLock = useStore(state => state.setDragAxisLock);
  const undo = useStore(state => state.undo);
  const clippingPlaneEnabled = useStore(state => state.clippingPlaneEnabled);
  const showSettings = useStore(state => state.showSettings);
  const setShowSettings = useStore(state => state.setShowSettings);
  const appSettings = useStore(state => state.appSettings);
  const setClippingPlaneEnabled = useStore(state => state.setClippingPlaneEnabled);
  const clearMultiSelect = useStore(state => state.clearMultiSelect);
  const multiSelectedIds = useStore(state => state.multiSelectedIds);
  const deleteElements = useStore(state => state.deleteElements);
  const dataTable = useStore(state => state.dataTable);
  const pushHistory = useStore(state => state.pushHistory);
  const [toolbarPos, setToolbarPos] = useState({
    x: 16,
    y: 16
  });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [dragOffset, setDragOffset] = useState({
    x: 0,
    y: 0
  });
  const handleToolbarPointerDown = e => {
    setIsDraggingToolbar(true);
    setDragOffset({
      x: e.clientX - toolbarPos.x,
      y: e.clientY - toolbarPos.y
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleToolbarPointerMove = e => {
    if (!isDraggingToolbar) return;
    setToolbarPos({
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y
    });
  };
  const handleToolbarPointerUp = e => {
    setIsDraggingToolbar(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const snapResolution = appState.config?.smartFixer?.gridSnapResolution ?? 100;

  // Hover tracking for tooltips
  const setHovered = useStore(state => state.setHovered);
  const hoverTimer = useRef(null);
  const handlePointerEnterMesh = useCallback(rowIndex => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(rowIndex), 150);
  }, [setHovered]);
  const handlePointerLeaveMesh = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(null);
  }, [setHovered]);

  // Global Key Handler
  useEffect(() => {
    const handleKeyDown = e => {
      // Ignore if this tab is not active
      if (appState.activeTab !== 'canvas') return;
      // Ignore if typing in an input
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      switch (e.key.toLowerCase()) {
        case '`':
          const debugEnabled = !useStore.getState().appSettings.debugConsoleEnabled;
          useStore.getState().updateAppSettings({
            debugConsoleEnabled: debugEnabled
          });
          if (debugEnabled) dbg.enable();else dbg.disable();
          break;
        case 'escape':
          setCanvasMode('VIEW');
          clearMultiSelect();
          useStore.getState().setSelected(null);
          useStore.getState().setClippingPlaneEnabled(false);
          useStore.getState().setShowRowLabels(false);
          useStore.getState().setShowRefLabels(false);
          break;
        case 'r':
          const isLabelsOn = useStore.getState().showRowLabels;
          useStore.getState().setShowRowLabels(!isLabelsOn);
          if (!isLabelsOn) useStore.getState().setTranslucentMode(true);
          break;
        case 'c':
          if (!e.ctrlKey && !e.metaKey) {
            setCanvasMode(canvasMode === 'CONNECT' ? 'VIEW' : 'CONNECT');
          }
          break;
        case 't':
          setCanvasMode(canvasMode === 'STRETCH' ? 'VIEW' : 'STRETCH');
          break;
        case 'b':
          setCanvasMode(canvasMode === 'BREAK' ? 'VIEW' : 'BREAK');
          break;
        case 'm':
          setCanvasMode(canvasMode === 'MEASURE' ? 'VIEW' : 'MEASURE');
          break;
        case 'i':
          setCanvasMode(canvasMode === 'INSERT_SUPPORT' ? 'VIEW' : 'INSERT_SUPPORT');
          break;
        case 'x':
          setDragAxisLock('X');
          break;
        case 'y':
          setDragAxisLock('Y');
          break;
        case 'z':
          setDragAxisLock('Z');
          break;
        case 'o':
          useStore.getState().toggleOrthoMode();
          break;
        case 'f':
          if (useStore.getState().selectedElementId) {
            const el = dataTable.find(r => r._rowIndex === useStore.getState().selectedElementId);
            if (el && el.ep1) {
              window.dispatchEvent(new CustomEvent('canvas-focus-point', {
                detail: {
                  x: el.ep1.x,
                  y: el.ep1.y,
                  z: el.ep1.z,
                  dist: 2000
                }
              }));
            }
          }
          break;
        case 'delete':
        case 'backspace':
          if ((multiSelectedIds || []).length > 0) {
            if (window.confirm(`Delete ${(multiSelectedIds || []).length} elements?`)) {
              pushHistory('Delete Keyboard');
              dispatch({
                type: 'DELETE_ELEMENTS',
                payload: {
                  rowIndices: multiSelectedIds
                }
              });
              deleteElements(multiSelectedIds);
              dispatch({
                type: "ADD_LOG",
                payload: {
                  stage: "INTERACTIVE",
                  type: "Applied/Fix",
                  message: `Deleted ${(multiSelectedIds || []).length} elements via keyboard.`
                }
              });
            }
          } else if (useStore.getState().selectedElementId) {
            const selId = useStore.getState().selectedElementId;
            if (window.confirm(`Delete Row ${selId}?`)) {
              pushHistory('Delete Keyboard');
              dispatch({
                type: 'DELETE_ELEMENTS',
                payload: {
                  rowIndices: [selId]
                }
              });
              deleteElements([selId]);
              useStore.getState().setSelected(null);
              dispatch({
                type: "ADD_LOG",
                payload: {
                  stage: "INTERACTIVE",
                  type: "Applied/Fix",
                  message: `Deleted Row ${selId} via keyboard.`
                }
              });
            }
          }
          break;
        case 'h':
          if (e.shiftKey) {
            useStore.getState().hideSelected();
          } else if (e.altKey) {
            useStore.getState().unhideAll();
          } else {
            useStore.getState().isolateSelected();
          }
          break;
        case 'u':
          useStore.getState().unhideAll();
          break;
        default:
          // Ctrl+Z
          if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            undo();
          }
          break;
      }
    };
    const handleKeyUp = e => {
      if (['x', 'y', 'z'].includes(e.key.toLowerCase())) {
        setDragAxisLock(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const handleZustandUndo = () => {
      // Sync Zustand's newly restored state back to AppContext
      const restoredTable = useStore.getState().dataTable;
      dispatch({
        type: "APPLY_GAP_FIX",
        payload: {
          updatedTable: restoredTable
        }
      });
      dispatch({
        type: "ADD_LOG",
        payload: {
          stage: "INTERACTIVE",
          type: "Info",
          message: "Undo completed."
        }
      });
    };
    window.addEventListener('zustand-undo', handleZustandUndo);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('zustand-undo', handleZustandUndo);
    };
  }, [canvasMode, setCanvasMode, clearMultiSelect, setDragAxisLock, undo, multiSelectedIds, dispatch, pushHistory, deleteElements, dataTable]);
  const handleDragCommit = useCallback((rowIndex, coords) => {
    // Filter out null coord fields
    const cleanCoords = Object.fromEntries(Object.entries(coords).filter(([, v]) => v !== null));
    dispatch({
      type: "UPDATE_STAGE2_ROW_COORDS",
      payload: {
        rowIndex,
        coords: cleanCoords
      }
    });
    // Mirror to Zustand so 3D view updates immediately
    const updated = useStore.getState().dataTable.map(r => r._rowIndex === rowIndex ? {
      ...r,
      ...cleanCoords
    } : r);
    useStore.getState().setDataTable(updated);
    dispatch({
      type: "ADD_LOG",
      payload: {
        stage: "DRAG_EDIT",
        type: "Info",
        message: `Drag-edited row ${rowIndex} (snap=${snapResolution}mm).`
      }
    });
  }, [dispatch, snapResolution]);
  const validationIssues = (appState.stage2Data || []).filter(r => typeof r.fixingAction === 'string' && (r.fixingAction.includes('ERROR') || r.fixingAction.includes('WARNING')));
  const handleAutoCenter = () => {
    window.dispatchEvent(new CustomEvent('canvas-auto-center'));
  };
  const handleApprove = (e, prop) => {
    e.stopPropagation();
    const updatedTable = [...appState.stage2Data];
    const row = updatedTable.find(r => r._rowIndex === prop.elementA._rowIndex);
    if (row) {
      row._fixApproved = true;
      dispatch({
        type: "SET_STAGE_2_DATA",
        payload: updatedTable
      });
      dispatch({
        type: "ADD_LOG",
        payload: {
          stage: "FIXING",
          type: "Info",
          message: "Approved fix proposal for row " + row._rowIndex
        }
      });
      useStore.getState().setProposalStatus(row._rowIndex, true);
    }
  };
  const handleReject = (e, prop) => {
    e.stopPropagation();
    const updatedTable = [...appState.stage2Data];
    const row = updatedTable.find(r => r._rowIndex === prop.elementA._rowIndex);
    if (row) {
      row._fixApproved = false;
      dispatch({
        type: "SET_STAGE_2_DATA",
        payload: updatedTable
      });
      dispatch({
        type: "ADD_LOG",
        payload: {
          stage: "FIXING",
          type: "Info",
          message: "Rejected fix proposal for row " + row._rowIndex
        }
      });
      useStore.getState().setProposalStatus(row._rowIndex, false);
    }
  };
  const triggerZoomToCurrent = () => {
    // Logic is handled in the effect inside SingleIssuePanel,
    // but we can force re-trigger by re-setting index or just letting the user click the button.
    // Easiest is to dispatch a dummy event that the effect listens to, or just update state.
    // A trick: set index to itself. React might not re-render, so we can dispatch the event directly here if needed,
    // but SingleIssuePanel already handles auto-center via the onAutoCenter prop. Wait, SingleIssuePanel doesn't have the logic inside onAutoCenter.
    // Let's pass a function that gets the current item and triggers the focus event.

    const allIssues = [...(validationIssues || []).map(i => ({
      type: 'validation',
      data: i
    })), ...(proposals || []).map(p => ({
      type: 'proposal',
      data: p
    }))];
    if (allIssues.length === 0) return;
    const safeIndex = Math.max(0, Math.min(currentIssueIndex, allIssues.length - 1));
    const currentItem = allIssues[safeIndex];
    let focusPt = null;
    let focusDist = 2000;
    if (currentItem.type === 'validation' && currentItem.data.ep1) {
      focusPt = currentItem.data.ep1;
    } else if (currentItem.type === 'proposal') {
      const prop = currentItem.data;
      if (prop.ptA && prop.ptB) {
        focusPt = {
          x: (prop.ptA.x + prop.ptB.x) / 2,
          y: (prop.ptA.y + prop.ptB.y) / 2,
          z: (prop.ptA.z + prop.ptB.z) / 2
        };
        focusDist = Math.max(prop.dist * 3, 2000);
      } else if (prop.elementA && prop.elementA.ep1) {
        focusPt = prop.elementA.ep1;
      }
    }
    if (focusPt) {
      window.dispatchEvent(new CustomEvent('canvas-focus-point', {
        detail: {
          ...focusPt,
          dist: focusDist
        }
      }));
    }
  };
  const executeFix6mm = () => {
    try {
      pushHistory('Fix 6mm Gaps');
      const {
        updatedTable,
        fixLog
      } = fix6mmGaps(dataTable);
      useStore.getState().setDataTable(updatedTable);
      dispatch({
        type: 'APPLY_GAP_FIX',
        payload: {
          updatedTable
        }
      });
      fixLog.forEach(log => dispatch({
        type: "ADD_LOG",
        payload: log
      }));
    } catch (err) {
      dbg.error('ENGINE_EXEC', 'Fix 6mm Gaps crashed', {
        error: err.message
      });
      dispatch({
        type: 'ADD_LOG',
        payload: {
          type: 'Error',
          stage: 'ENGINE',
          message: `Fix 6mm failed: ${err.message}`
        }
      });
    }
  };
  const executeAutoPipelineRef = () => {
    try {
      pushHistory('Auto Pipeline Ref');
      const {
        updatedTable,
        fixLog
      } = autoAssignPipelineRefs(dataTable);
      useStore.getState().setDataTable(updatedTable);
      dispatch({
        type: 'APPLY_GAP_FIX',
        payload: {
          updatedTable
        }
      }); // Reuses table replace action
      fixLog.forEach(log => dispatch({
        type: "ADD_LOG",
        payload: log
      }));
    } catch (err) {
      dbg.error('ENGINE_EXEC', 'Auto Pipeline Ref crashed', {
        error: err.message
      });
      dispatch({
        type: 'ADD_LOG',
        payload: {
          type: 'Error',
          stage: 'ENGINE',
          message: `Auto Pipeline Ref failed: ${err.message}`
        }
      });
    }
  };
  const executeFix25mm = () => {
    try {
      pushHistory('Fix 25mm Gaps');
      const {
        updatedTable,
        fixLog
      } = fix25mmGapsWithPipe(dataTable);
      useStore.getState().setDataTable(updatedTable);
      dispatch({
        type: 'APPLY_GAP_FIX',
        payload: {
          updatedTable
        }
      });
      fixLog.forEach(log => dispatch({
        type: "ADD_LOG",
        payload: log
      }));
    } catch (err) {
      dbg.error('ENGINE_EXEC', 'Fix 25mm Gaps crashed', {
        error: err.message
      });
      dispatch({
        type: 'ADD_LOG',
        payload: {
          type: 'Error',
          stage: 'ENGINE',
          message: `Fix 25mm failed: ${err.message}`
        }
      });
    }
  };
  const executeOverlapSolver = () => {
    try {
      pushHistory('Overlap Solver');
      import('/js/pcf-fixer-runtime/engine/OverlapSolver.js').then(({
        resolveOverlaps
      }) => {
        const {
          updatedTable,
          fixLog
        } = resolveOverlaps(dataTable);
        useStore.getState().setDataTable(updatedTable);
        dispatch({
          type: 'APPLY_GAP_FIX',
          payload: {
            updatedTable
          }
        });
        fixLog.forEach(log => dispatch({
          type: "ADD_LOG",
          payload: log
        }));
      }).catch(err => {
        dbg.error('ENGINE_EXEC', 'Overlap Solver failed during execution', {
          error: err.message
        });
        dispatch({
          type: 'ADD_LOG',
          payload: {
            type: 'Error',
            stage: 'ENGINE',
            message: `Overlap Solver failed: ${err.message}`
          }
        });
      });
    } catch (err) {
      dbg.error('ENGINE_EXEC', 'Overlap Solver crashed', {
        error: err.message
      });
      dispatch({
        type: 'ADD_LOG',
        payload: {
          type: 'Error',
          stage: 'ENGINE',
          message: `Overlap Solver failed: ${err.message}`
        }
      });
    }
  };
  return _jsxs("div", {
    className: "flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden bg-slate-950 rounded-lg border border-slate-800 shadow-inner relative mt-[-2rem]",
    children: [_jsx(SceneHealthHUD, {}), _jsx("div", {
      className: "absolute top-24 left-4 z-20 flex flex-col gap-4 items-start pointer-events-none h-[calc(100vh-10rem)] overflow-y-auto w-80 pr-2",
      children: _jsxs("div", {
        className: "pointer-events-auto flex flex-col gap-4 w-full",
        children: [_jsx(LegendLayer, {}), _jsx(SideInspector, {}), _jsx(SupportPropertyPanel, {})]
      })
    }), _jsx("div", {
      className: "absolute top-24 right-4 z-20 flex flex-col gap-4 items-end pointer-events-none h-[calc(100vh-10rem)] overflow-y-auto w-80 pl-2",
      children: _jsx("div", {
        className: "pointer-events-auto flex flex-col gap-4 w-full items-end",
        children: _jsx(GapSidebar, {})
      })
    }), _jsx(ClippingPanelUI, {}), _jsx(PipelinePropertyPanel, {}), _jsx(LogDrawer, {}), _jsx(HoverTooltip, {}), _jsx(SettingsModal, {}), _jsx(ContextMenu, {}), _jsx(NavigationPanel, {}), _jsx(DebugConsole, {}), _jsx("div", {
      className: "absolute z-40 pointer-events-auto shadow-lg",
      style: {
        left: toolbarPos.x,
        top: toolbarPos.y
      },
      onPointerMove: handleToolbarPointerMove,
      onPointerUp: handleToolbarPointerUp,
      onPointerDown: e => {
        // Only start dragging if clicking the top header bar of the ribbon
        if (e.target.closest('.cursor-move')) {
          handleToolbarPointerDown(e);
        }
      },
      children: _jsx(ToolbarRibbon, {
        onFix6mm: executeFix6mm,
        onFix25mm: executeFix25mm,
        onAutoRef: executeAutoPipelineRef,
        onOverlapSolver: executeOverlapSolver,
        onAutoCenter: handleAutoCenter,
        onToggleSideInspector: () => setShowSideInspector(!showSideInspector),
        showSideInspector: showSideInspector,
        onPointerDown: handleToolbarPointerDown
      })
    }), _jsx("div", {
      className: "absolute z-50 flex flex-col gap-2 items-center pointer-events-none bottom-8 left-1/2 -translate-x-1/2",
      children: canvasMode !== 'VIEW' && _jsxs("div", {
        className: "flex flex-col gap-1 items-center pointer-events-auto",
        children: [_jsxs("div", {
          className: "bg-slate-800/90 text-slate-200 text-xs px-3 py-1.5 rounded border border-slate-600 shadow-md flex items-center justify-center",
          children: [_jsxs("span", {
            children: ["MODE: ", _jsx("strong", {
              children: canvasMode.replace('_', ' ')
            })]
          }), _jsx("span", {
            className: "ml-2 text-slate-400",
            children: "Esc to cancel"
          })]
        }), (canvasMode === 'CONNECT' || canvasMode === 'STRETCH') && _jsxs("div", {
          className: "bg-slate-800/90 text-amber-400 text-[10px] px-3 py-1.5 rounded border border-amber-900/50 shadow-md max-w-md text-center",
          children: [_jsx("strong", {
            children: "Tip:"
          }), " Click first endpoint, then click second endpoint. Panning is allowed."]
        })]
      })
    }), _jsx(SingleIssuePanel, {
      proposals: proposals,
      validationIssues: validationIssues,
      currentIssueIndex: currentIssueIndex,
      setCurrentIssueIndex: setCurrentIssueIndex,
      onAutoCenter: triggerZoomToCurrent,
      onApprove: handleApprove,
      onReject: handleReject
    }), _jsxs(Canvas, {
      children: [orthoMode ? _jsx(OrthographicCamera, {
        makeDefault: true,
        position: [5000, 5000, 5000],
        zoom: 0.2,
        near: 0.1,
        far: 500000
      }, "ortho") : _jsx(PerspectiveCamera, {
        makeDefault: true,
        position: [5000, 5000, 5000],
        fov: appSettings.cameraFov,
        near: appSettings.cameraNear || 1,
        far: appSettings.cameraFar || 500000
      }, "persp"), _jsx("color", {
        attach: "background",
        args: [appSettings.backgroundColor || '#020617']
      }), _jsx("ambientLight", {
        intensity: 0.6
      }), _jsx("directionalLight", {
        position: [1000, 1000, 500],
        intensity: 1.5
      }), _jsx("directionalLight", {
        position: [-1000, -1000, -500],
        intensity: 0.5
      }), appSettings.showGrid && _jsx("gridHelper", {
        args: [10000, 100],
        position: [gridCenter.x, gridCenter.y, gridCenter.floorZ ?? gridCenter.z],
        rotation: [Math.PI / 2, 0, 0]
      }), appSettings.showAxes && _jsx("axesHelper", {
        args: [2000]
      }), appState.stage2Data && appState.stage2Data.length > 0 && _jsxs(_Fragment, {
        children: [_jsx(InstancedPipes, {}), _jsx(ImmutableComponents, {}), _jsx(EndpointSnapLayer, {}), _jsx(GapRadarLayer, {}), _jsx(GlobalSnapLayer, {}), _jsx(MeasureTool, {}), _jsx(BreakPipeLayer, {}), _jsx(InsertSupportLayer, {}), _jsx(EPLabelsLayer, {}), _jsx(MarqueeLayer, {}), _jsx(ClippingPlanesLayer, {})]
      }), (() => {
        const allIssues = [...(validationIssues || []).map(i => ({
          type: 'validation',
          data: i
        })), ...(proposals || []).map(p => ({
          type: 'proposal',
          data: p
        }))];
        const safeIndex = Math.max(0, Math.min(currentIssueIndex, allIssues.length - 1));
        const activeItem = allIssues[safeIndex];
        const activeProposal = activeItem?.type === 'proposal' ? activeItem.data : null;
        return _jsx(GhostOverlay, {
          activeProposal: activeProposal
        });
      })(), (proposals || []).map((prop, idx) => {
        // Calculate global index to check if active
        const allIssues = [...(validationIssues || []).map(i => ({
          type: 'validation',
          data: i
        })), ...(proposals || []).map(p => ({
          type: 'proposal',
          data: p
        }))];
        const safeIndex = Math.max(0, Math.min(currentIssueIndex, allIssues.length - 1));
        const isActive = allIssues[safeIndex]?.type === 'proposal' && allIssues[safeIndex]?.data === prop;
        return isActive ? _jsx(ProposalOverlay, {
          proposal: prop
        }, `prop-${idx}`) : null;
      }), _jsx(GizmoHelper, {
        alignment: "bottom-right",
        margin: [80, 80],
        children: _jsx(GizmoViewport, {
          axisColors: ['#ef4444', '#10b981', '#3b82f6'],
          labelColor: "white"
        })
      }), (() => {
        const allIssues = [...(validationIssues || []).map(i => ({
          type: 'validation',
          data: i
        })), ...(proposals || []).map(p => ({
          type: 'proposal',
          data: p
        }))];
        const safeIndex = Math.max(0, Math.min(currentIssueIndex, allIssues.length - 1));
        return _jsx(IssueMapPin, {
          activeIssue: allIssues[safeIndex]
        });
      })(), _jsx(ControlsAutoCenter, {
        externalRef: dragOrbitRef
      })]
    })]
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsInVzZU1lbW8iLCJ1c2VSZWYiLCJ1c2VTdGF0ZSIsInVzZUVmZmVjdCIsInVzZUNhbGxiYWNrIiwiQ2FudmFzIiwidXNlRnJhbWUiLCJ1c2VUaHJlZSIsIk9yYml0Q29udHJvbHMiLCJMaW5lIiwiSHRtbCIsIlRleHQiLCJHaXptb0hlbHBlciIsIkdpem1vVmlld3BvcnQiLCJPcnRob2dyYXBoaWNDYW1lcmEiLCJQZXJzcGVjdGl2ZUNhbWVyYSIsIlRIUkVFIiwidXNlU3RvcmUiLCJ1c2VBcHBDb250ZXh0IiwiYXBwbHlGaXhlcyIsImNyZWF0ZUxvZ2dlciIsImZpeDZtbUdhcHMiLCJmaXgyNW1tR2Fwc1dpdGhQaXBlIiwiYnJlYWtQaXBlQXRQb2ludCIsImluc2VydFN1cHBvcnRBdFBpcGUiLCJhdXRvQXNzaWduUGlwZWxpbmVSZWZzIiwiU2lkZUluc3BlY3RvciIsIkxvZ0RyYXdlciIsIlNjZW5lSGVhbHRoSFVEIiwiU3VwcG9ydFByb3BlcnR5UGFuZWwiLCJHYXBTaWRlYmFyIiwiUGlwZWxpbmVQcm9wZXJ0eVBhbmVsIiwiTmF2aWdhdGlvblBhbmVsIiwiU2V0dGluZ3NNb2RhbCIsIkNsaXBwaW5nUGxhbmVzTGF5ZXIiLCJDbGlwcGluZ1BhbmVsVUkiLCJUb29sYmFyUmliYm9uIiwiZGJnIiwiRGVidWdDb25zb2xlIiwianN4IiwiX2pzeCIsImpzeHMiLCJfanN4cyIsIkZyYWdtZW50IiwiX0ZyYWdtZW50IiwidHlwZUNvbG9yIiwidHlwZSIsImFwcFNldHRpbmdzIiwiZGVmYXVsdENvbG9ycyIsIlBJUEUiLCJCRU5EIiwiVEVFIiwiT0xFVCIsIlJFRFVDRVIiLCJWQUxWRSIsIkZMQU5HRSIsIlNVUFBPUlQiLCJjb2xvcnMiLCJjb21wb25lbnRDb2xvcnMiLCJ0b1VwcGVyQ2FzZSIsImdldENvbG9yTW9kZVZhbHVlIiwiZWwiLCJtb2RlIiwic3RhcnRzV2l0aCIsImNvbXBvbmVudEF0dHJzIiwicGlwZWxpbmVSZWYiLCJ2YWxpZGF0aW9uRXJyb3IiLCJsaW5lTm9LZXkiLCJyYXRpbmciLCJwaXBpbmdDbGFzcyIsImdldENBQ29sb3IiLCJzdHIiLCJoYXNoIiwiaSIsImxlbmd0aCIsImNoYXJDb2RlQXQiLCJjIiwidG9TdHJpbmciLCJzdWJzdHJpbmciLCJjb21wdXRlU3Bvb2xzIiwiZGF0YVRhYmxlIiwic3Bvb2xzIiwic3Bvb2xDb3VudGVyIiwiZW5kcG9pbnRzIiwiZm9yRWFjaCIsInIiLCJlcDEiLCJrZXkiLCJwYXJzZUZsb2F0IiwieCIsInRvRml4ZWQiLCJ5IiwieiIsInB1c2giLCJfcm93SW5kZXgiLCJlcDIiLCJ2aXNpdGVkIiwiU2V0Iiwicm93cyIsIk1hcCIsIm1hcCIsImZsb29kRmlsbCIsInN0YXJ0SWQiLCJzSWQiLCJxdWV1ZSIsIml0ZXJhdGlvbnMiLCJjb25zb2xlIiwid2FybiIsImN1cnJJZCIsInNoaWZ0IiwiaGFzIiwiY3VyciIsImdldCIsImFkZCIsImN1cnJUeXBlIiwibmVpZ2hib3JzIiwibiIsIm5JZCIsIm5laWdoYm9yIiwiblR5cGUiLCJzcG9vbENvbG9yIiwic3Bvb2xJZCIsIkluc3RhbmNlZFBpcGVzIiwiZ2V0UGlwZXMiLCJzdGF0ZSIsImNvbG9yTW9kZSIsIm11bHRpU2VsZWN0ZWRJZHMiLCJ0cmFuc2x1Y2VudE1vZGUiLCJzaG93Um93TGFiZWxzIiwic2hvd1JlZkxhYmVscyIsInBpcGVzIiwibWVzaFJlZiIsImR1bW15IiwiT2JqZWN0M0QiLCJDb2xvciIsInJlbmRlciIsIm11bHRpU2VsZWN0ZWRDb3VudCIsImN1cnJlbnQiLCJlbGVtZW50IiwiYm9yZSIsInZlY0EiLCJWZWN0b3IzIiwidmVjQiIsImRpc3RhbmNlIiwiZGlzdGFuY2VUbyIsIm1pZFBvaW50IiwiY2xvbmUiLCJsZXJwIiwicG9zaXRpb24iLCJjb3B5IiwicmFkaXVzIiwic2NhbGUiLCJzZXQiLCJkaXJlY3Rpb24iLCJzdWIiLCJub3JtYWxpemUiLCJ1cCIsInF1YXRlcm5pb24iLCJRdWF0ZXJuaW9uIiwic2V0RnJvbVVuaXRWZWN0b3JzIiwidXBkYXRlTWF0cml4Iiwic2V0TWF0cml4QXQiLCJtYXRyaXgiLCJjb2xTdHIiLCJ2YWwiLCJpc1NlbGVjdGVkIiwiaW5jbHVkZXMiLCJzZWxlY3Rpb25Db2xvciIsInNldENvbG9yQXQiLCJpbnN0YW5jZU1hdHJpeCIsIm5lZWRzVXBkYXRlIiwiaW5zdGFuY2VDb2xvciIsImNvbXB1dGVCb3VuZGluZ1NwaGVyZSIsInNlbGVjdGVkRWxlbWVudElkIiwiaGFuZGxlUG9pbnRlckRvd24iLCJlIiwiY2FudmFzTW9kZSIsImdldFN0YXRlIiwic3RvcFByb3BhZ2F0aW9uIiwiaW5zdGFuY2VJZCIsInVuZGVmaW5lZCIsInBpcGUiLCJidXR0b24iLCJueCIsIm5hdGl2ZUV2ZW50IiwiY2xpZW50WCIsIm55IiwiY2xpZW50WSIsInNldENvbnRleHRNZW51Iiwicm93SW5kZXgiLCJpc011bHRpU2VsZWN0IiwiY3RybEtleSIsIm1ldGFLZXkiLCJ0b2dnbGVNdWx0aVNlbGVjdCIsImNsZWFyTXVsdGlTZWxlY3QiLCJzZXRTZWxlY3RlZCIsInNldE11bHRpU2VsZWN0IiwiaGFuZGxlUG9pbnRlck1pc3NlZCIsIl9faGFuZGxlZDNEIiwiZXZlbnQiLCJ0YXJnZXQiLCJ0YWdOYW1lIiwiaGFuZGxlZDNEIiwiY3VycmVudFNlbGVjdGlvbiIsIm11bHRpU2VsZWN0ZWQiLCJvblBvaW50ZXJNaXNzZWQiLCJjaGlsZHJlbiIsInJlZiIsImFyZ3MiLCJvblBvaW50ZXJEb3duIiwiY29sb3IiLCJ0cmFuc3BhcmVudCIsIm9wYWNpdHkiLCJkZXB0aFdyaXRlIiwiaWQiLCJmaW5kIiwibWlkWCIsIm1pZFkiLCJtaWRaIiwic2VsZWN0aW9uT3BhY2l0eSIsImRlcHRoVGVzdCIsIkltbXV0YWJsZUNvbXBvbmVudHMiLCJnZXRJbW11dGFibGVzIiwiZWxlbWVudHMiLCJpc1RyYW5zbHVjZW50IiwiZGlzdCIsIm1pZCIsImRpciIsInF1YXQiLCJoYW5kbGVTZWxlY3QiLCJlcnIiLCJlcnJvciIsIm1lc3NhZ2UiLCJNYXRoIiwibWF4Iiwicm90YXRpb24iLCJQSSIsImJyYW5jaERpciIsImNwIiwiYnAiLCJicmFuY2hMZW4iLCJicmFuY2hNaWQiLCJhZGRTY2FsZWRWZWN0b3IiLCJicmFuY2hRdWF0IiwiYnJhbmNoUiIsImJyYW5jaEJvcmUiLCJwb3MiLCJpc1Jlc3QiLCJPYmplY3QiLCJ2YWx1ZXMiLCJzb21lIiwidiIsImlzR3VpIiwiZmluYWxDb2xvciIsIkdob3N0T3ZlcmxheSIsImFjdGl2ZVByb3Bvc2FsIiwiZWxlbWVudEEiLCJlbGVtZW50QiIsImZpbHRlciIsIkJvb2xlYW4iLCJJc3N1ZU1hcFBpbiIsImFjdGl2ZUlzc3VlIiwibGFiZWwiLCJkYXRhIiwicHJvcCIsInB0QSIsInB0QiIsInNpZGUiLCJEb3VibGVTaWRlIiwiZm9udFNpemUiLCJhbmNob3JYIiwiYW5jaG9yWSIsIm91dGxpbmVXaWR0aCIsIm91dGxpbmVDb2xvciIsImZvbnRXZWlnaHQiLCJQcm9wb3NhbE92ZXJsYXkiLCJwcm9wb3NhbCIsImFkZFZlY3RvcnMiLCJtdWx0aXBseVNjYWxhciIsImFjdGlvbiIsImZpeFR5cGUiLCJzdWJWZWN0b3JzIiwicG9pbnRzIiwibGluZVdpZHRoIiwiZGFzaGVkIiwiZGFzaFNjYWxlIiwiZGFzaFNpemUiLCJnYXBTaXplIiwiU2luZ2xlSXNzdWVQYW5lbCIsInByb3Bvc2FscyIsInZhbGlkYXRpb25Jc3N1ZXMiLCJjdXJyZW50SXNzdWVJbmRleCIsInNldEN1cnJlbnRJc3N1ZUluZGV4Iiwib25BdXRvQ2VudGVyIiwib25BcHByb3ZlIiwib25SZWplY3QiLCJhbGxJc3N1ZXMiLCJwIiwic2FmZUluZGV4IiwibWluIiwiY3VycmVudEl0ZW0iLCJzZXRQb3MiLCJpc0RyYWdnaW5nIiwic2V0SXNEcmFnZ2luZyIsImRyYWdPZmZzZXQiLCJzZXREcmFnT2Zmc2V0IiwicGFuZWxSZWYiLCJwYXJlbnQiLCJwYXJlbnRFbGVtZW50IiwicFJlY3QiLCJnZXRCb3VuZGluZ0NsaWVudFJlY3QiLCJjUmVjdCIsIndpZHRoIiwiaGVpZ2h0IiwiaGFuZGxlUHJldiIsImhhbmRsZU5leHQiLCJyZWN0IiwibGVmdCIsInRvcCIsInNldFBvaW50ZXJDYXB0dXJlIiwicG9pbnRlcklkIiwiaGFuZGxlUG9pbnRlck1vdmUiLCJuZXdYIiwibmV3WSIsIm9mZnNldFdpZHRoIiwib2Zmc2V0SGVpZ2h0IiwiaGFuZGxlUG9pbnRlclVwIiwicmVsZWFzZVBvaW50ZXJDYXB0dXJlIiwic3R5bGUiLCJib3R0b20iLCJ0cmFuc2Zvcm0iLCJjbGFzc05hbWUiLCJvblBvaW50ZXJNb3ZlIiwib25Qb2ludGVyVXAiLCJvblBvaW50ZXJDYW5jZWwiLCJvbkNsaWNrIiwiZGlzYWJsZWQiLCJ4bWxucyIsInZpZXdCb3giLCJmaWxsIiwic3Ryb2tlIiwic3Ryb2tlV2lkdGgiLCJzdHJva2VMaW5lY2FwIiwic3Ryb2tlTGluZWpvaW4iLCJkIiwidGl0bGUiLCJjeCIsImN5IiwiZml4aW5nQWN0aW9uIiwiZGVzY3JpcHRpb24iLCJzY29yZSIsIl9maXhBcHByb3ZlZCIsIkdsb2JhbFNuYXBMYXllciIsInNldEN1cnNvclNuYXBQb2ludCIsImN1cnNvclNuYXBQb2ludCIsImlzQWN0aXZlIiwic25hcFJhZGl1cyIsIm5lYXJlc3QiLCJtaW5EaXN0Iiwicm93IiwicHRzVG9UZXN0IiwicHQiLCJwb2ludCIsInZpc2libGUiLCJyZW5kZXJPcmRlciIsIkxlZ2VuZExheWVyIiwiaXNDb2xsYXBzZWQiLCJzZXRJc0NvbGxhcHNlZCIsInVuaXF1ZVZhbHVlcyIsInZhbHMiLCJBcnJheSIsImZyb20iLCJzb3J0IiwidW5pcXVlVHlwZXMiLCJiYWNrZ3JvdW5kQ29sb3IiLCJ1bmlxdWVTcG9vbElkcyIsImEiLCJiIiwiTWFycXVlZUxheWVyIiwic2V0Q2FudmFzTW9kZSIsInB1c2hIaXN0b3J5IiwiZGlzcGF0Y2giLCJzdGFydFBvcyIsInNldFN0YXJ0UG9zIiwiY3VycmVudFBvcyIsInNldEN1cnJlbnRQb3MiLCJvdmVybGF5UmVmIiwicG9pbnRlcklkUmVmIiwiY2FtZXJhIiwic2l6ZSIsIk1JTl9EUkFHX0RJU1RBTkNFIiwiaXNDb21wb25lbnRJbk1hcnF1ZWUiLCJyZWN0U2NyZWVuIiwicHRzIiwic3VwcG9ydENvb3IiLCJib3giLCJCb3gzIiwiZXhwYW5kQnlQb2ludCIsImNvcm5lcnMiLCJjYW52YXNSZWN0IiwiZG9jdW1lbnQiLCJxdWVyeVNlbGVjdG9yIiwiY2FudmFzT2Zmc2V0TGVmdCIsImNhbnZhc09mZnNldFRvcCIsImFueUluc2lkZSIsImNvcm5lciIsInByb2plY3RlZCIsInByb2plY3QiLCJweCIsInB5IiwiaW5zaWRlIiwicmlnaHQiLCJwcmV2ZW50RGVmYXVsdCIsImRyYWdEaXN0Iiwic3FydCIsInBvdyIsInNlbGVjdGVkIiwiaGlkZGVuRWxlbWVudElkcyIsIm1pblgiLCJJbmZpbml0eSIsIm1pblkiLCJtaW5aIiwibWF4WCIsIm1heFkiLCJtYXhaIiwid29ybGRQdCIsInVucHJvamVjdCIsInRvb2wiLCJ3aW5kb3ciLCJkaXNwYXRjaEV2ZW50IiwiQ3VzdG9tRXZlbnQiLCJkZXRhaWwiLCJjZW50ZXIiLCJleHRlbnQiLCJlbGVtZW50Q291bnQiLCJjb25maXJtIiwicm93SW5kaWNlcyIsInBheWxvYWQiLCJ1cGRhdGVkVGFibGUiLCJzZXREYXRhVGFibGUiLCJzdGFnZSIsImhhbmRsZVBvaW50ZXJMZWF2ZSIsImdldE1hcnF1ZWVTdHlsZSIsImlzWm9vbSIsImlzRGVsZXRlIiwiaXNDcm9zc2luZyIsImJvcmRlckNvbG9yIiwiYmdDb2xvciIsImJvcmRlclN0eWxlIiwiYWJzIiwiYm9yZGVyV2lkdGgiLCJib3JkZXJSYWRpdXMiLCJib3hTaGFkb3ciLCJwb2ludGVyRXZlbnRzIiwiekluZGV4IiwidHJhbnNpdGlvbiIsImdldEN1cnNvciIsImZ1bGxzY3JlZW4iLCJ6SW5kZXhSYW5nZSIsImN1cnNvciIsInVzZXJTZWxlY3QiLCJvblBvaW50ZXJMZWF2ZSIsIk1lYXN1cmVUb29sIiwibWVhc3VyZVB0cyIsImFkZE1lYXN1cmVQdCIsInN0b3JlRGF0YSIsInBhcnNlZERhdGEiLCJzZWxlY3RlZElkIiwibXVsdGlJZHMiLCJzZWxlY3RlZEVsZW0iLCJib3JlT2Zmc2V0IiwiZHgiLCJkeSIsImR6IiwiQnJlYWtQaXBlTGF5ZXIiLCJob3ZlclBvcyIsInNldEhvdmVyUG9zIiwiaGFuZGxlUG9pbnRlck91dCIsInBpcGVSb3ciLCJicmVha1B0IiwiYnJlYWtSZXN1bHRzIiwicm93QSIsInJvd0IiLCJmbGF0TWFwIiwib25Qb2ludGVyT3V0IiwidjEiLCJ2MiIsIkVuZHBvaW50U25hcExheWVyIiwidXBkYXRlRGF0YVRhYmxlIiwiY29ubmVjdERyYWZ0Iiwic2V0Q29ubmVjdERyYWZ0IiwiY3Vyc29yUG9zIiwic2V0Q3Vyc29yUG9zIiwib3J0aG9Nb2RlIiwicmF3RGVsdGEiLCJmcm9tUG9zaXRpb24iLCJhYnNYIiwiYWJzWSIsImFic1oiLCJlcEtleSIsImVwIiwiZnJvbVJvd0luZGV4IiwiZnJvbUVQIiwic291cmNlUm93IiwidGFyZ2V0UG9zIiwic291cmNlUG9zIiwic291cmNlSWR4SW5BcnJheSIsImZpbmRJbmRleCIsInVwZGF0ZWRSb3ciLCJuZXdCcmlkZ2VQaXBlIiwic2tleSIsImNhMSIsIkNBMSIsImNhMiIsIkNBMiIsImNhMyIsIkNBMyIsImNhNCIsIkNBNCIsImNhNSIsIkNBNSIsImNhNiIsIkNBNiIsImNhNyIsIkNBNyIsImNhOCIsIkNBOCIsImNhOSIsIkNBOSIsImNhMTAiLCJDQTEwIiwidGFnIiwibWF4Um93SW5kZXgiLCJzcGxpY2UiLCJzZXF1ZW50aWFsVGFibGUiLCJzdGFydCIsImVuZCIsInZlYyIsImxlbiIsInEiLCJHYXBSYWRhckxheWVyIiwic2hvd0dhcFJhZGFyIiwibWF0ZXJpYWxSZWYiLCJzcGhlcmVSZWYiLCJjbG9jayIsInRpbWUiLCJnZXRFbGFwc2VkVGltZSIsInNpbiIsImdhcHMiLCJmb3VuZCIsInRvcG9sb2d5Um93cyIsImVsQSIsImVsQiIsImdhcCIsIlB1bHNpbmdHYXAiLCJtZXNoUmVmQSIsIm1hdFJlZkEiLCJtZXNoUmVmQiIsIm1hdFJlZkIiLCJzIiwiRVBMYWJlbHNMYXllciIsInNldFNob3dSb3dMYWJlbHMiLCJzZXRTaG93UmVmTGFiZWxzIiwiSW5zZXJ0U3VwcG9ydExheWVyIiwiaW5zZXJ0UHQiLCJzdXBwb3J0Um93IiwibmV3Um93SW5kZXgiLCJhZnRlclJvd0luZGV4IiwiaWR4IiwicmVpbmRleGVkVGFibGUiLCJDb250ZXh0TWVudSIsImNvbnRleHRNZW51IiwiY2xvc2VDb250ZXh0TWVudSIsImhpZGVTZWxlY3RlZCIsImlzb2xhdGVTZWxlY3RlZCIsImhhbmRsZUNsaWNrT3V0c2lkZSIsImFkZEV2ZW50TGlzdGVuZXIiLCJyZW1vdmVFdmVudExpc3RlbmVyIiwiaGFuZGxlQWN0aW9uIiwib25Db250ZXh0TWVudSIsIngxIiwieDIiLCJ5MSIsInkyIiwiSG92ZXJUb29sdGlwIiwiaG92ZXJlZEVsZW1lbnRJZCIsInRvb2x0aXBQb3MiLCJzZXRUb29sdGlwUG9zIiwidGltZXJSZWYiLCJoYW5kbGVNb3VzZU1vdmUiLCJDb250cm9sc0F1dG9DZW50ZXIiLCJleHRlcm5hbFJlZiIsImNvbnRyb2xzUmVmIiwic2V0VGFyZ2V0UG9zIiwiY2FtUG9zIiwic2V0Q2FtUG9zIiwiaXNBbmltYXRpbmciLCJhcHBseVZpZXdlckZpdFBvbGljeSIsIm1heERpbSIsInNhZmVEaW0iLCJpc09ydGhvZ3JhcGhpY0NhbWVyYSIsImFzcGVjdCIsImlubmVyV2lkdGgiLCJpbm5lckhlaWdodCIsImhhbGYiLCJuZWFyIiwiZmFyIiwidXBkYXRlUHJvamVjdGlvbk1hdHJpeCIsImlzUGVyc3BlY3RpdmVDYW1lcmEiLCJkZWx0YSIsInVwZGF0ZSIsImhhbmRsZUZvY3VzIiwidFBvcyIsInpvb21EaXN0Iiwib2JqZWN0IiwibGVuZ3RoU3EiLCJjUG9zIiwiaGFuZGxlQ2VudGVyIiwiaW1tdXRhYmxlcyIsImFsbEVscyIsImVsc1RvRnJhbWUiLCJjZW50ZXJYIiwiY2VudGVyWSIsImNlbnRlcloiLCJoYW5kbGVTZXRWaWV3Iiwidmlld1R5cGUiLCJjdXJyZW50RGlzdCIsImhhbmRsZVNhdmVDYW1lcmEiLCJwcmVzZXQiLCJjYW1UYXJnZXQiLCJsb2NhbFN0b3JhZ2UiLCJzZXRJdGVtIiwiSlNPTiIsInN0cmluZ2lmeSIsImhhbmRsZUxvYWRDYW1lcmEiLCJzYXZlZCIsImdldEl0ZW0iLCJwYXJzZSIsInNlc3Npb25TdG9yYWdlIiwic2V0U2hvd0dhcFJhZGFyIiwiaW50ZXJhY3Rpb25Nb2RlIiwiY29udHJvbHNFbmFibGVkIiwiaGFuZGxlciIsIm1vdXNlQnV0dG9ucyIsIkxFRlQiLCJNT1VTRSIsIlBBTiIsIlJPVEFURSIsIk1JRERMRSIsIkRPTExZIiwiUklHSFQiLCJjdHJsUHJlc3NlZCIsInNldEN0cmxQcmVzc2VkIiwiZG93biIsImN1cnJlbnRNb3VzZUJ1dHRvbnMiLCJlbmFibGVkIiwibWFrZURlZmF1bHQiLCJlbmFibGVEYW1waW5nIiwiZGFtcGluZ0ZhY3RvciIsIkNhbnZhc1RhYiIsImFwcFN0YXRlIiwiZ3JpZENlbnRlciIsInN0YWdlMkRhdGEiLCJzaG93U2lkZUluc3BlY3RvciIsInNldFNob3dTaWRlSW5zcGVjdG9yIiwiaGFuZGxlT3BlblNpZGVJbnNwZWN0b3IiLCJkcmFnT3JiaXRSZWYiLCJzZXRDb2xvck1vZGUiLCJkcmFnQXhpc0xvY2siLCJzZXREcmFnQXhpc0xvY2siLCJ1bmRvIiwiY2xpcHBpbmdQbGFuZUVuYWJsZWQiLCJzaG93U2V0dGluZ3MiLCJzZXRTaG93U2V0dGluZ3MiLCJzZXRDbGlwcGluZ1BsYW5lRW5hYmxlZCIsImRlbGV0ZUVsZW1lbnRzIiwidG9vbGJhclBvcyIsInNldFRvb2xiYXJQb3MiLCJpc0RyYWdnaW5nVG9vbGJhciIsInNldElzRHJhZ2dpbmdUb29sYmFyIiwiaGFuZGxlVG9vbGJhclBvaW50ZXJEb3duIiwiY3VycmVudFRhcmdldCIsImhhbmRsZVRvb2xiYXJQb2ludGVyTW92ZSIsImhhbmRsZVRvb2xiYXJQb2ludGVyVXAiLCJzbmFwUmVzb2x1dGlvbiIsImNvbmZpZyIsInNtYXJ0Rml4ZXIiLCJncmlkU25hcFJlc29sdXRpb24iLCJzZXRIb3ZlcmVkIiwiaG92ZXJUaW1lciIsImhhbmRsZVBvaW50ZXJFbnRlck1lc2giLCJjbGVhclRpbWVvdXQiLCJzZXRUaW1lb3V0IiwiaGFuZGxlUG9pbnRlckxlYXZlTWVzaCIsImhhbmRsZUtleURvd24iLCJhY3RpdmVUYWIiLCJhY3RpdmVFbGVtZW50IiwidG9Mb3dlckNhc2UiLCJkZWJ1Z0VuYWJsZWQiLCJkZWJ1Z0NvbnNvbGVFbmFibGVkIiwidXBkYXRlQXBwU2V0dGluZ3MiLCJlbmFibGUiLCJkaXNhYmxlIiwiaXNMYWJlbHNPbiIsInNldFRyYW5zbHVjZW50TW9kZSIsInRvZ2dsZU9ydGhvTW9kZSIsInNlbElkIiwic2hpZnRLZXkiLCJhbHRLZXkiLCJ1bmhpZGVBbGwiLCJoYW5kbGVLZXlVcCIsImhhbmRsZVp1c3RhbmRVbmRvIiwicmVzdG9yZWRUYWJsZSIsImhhbmRsZURyYWdDb21taXQiLCJjb29yZHMiLCJjbGVhbkNvb3JkcyIsImZyb21FbnRyaWVzIiwiZW50cmllcyIsInVwZGF0ZWQiLCJoYW5kbGVBdXRvQ2VudGVyIiwiaGFuZGxlQXBwcm92ZSIsInNldFByb3Bvc2FsU3RhdHVzIiwiaGFuZGxlUmVqZWN0IiwidHJpZ2dlclpvb21Ub0N1cnJlbnQiLCJmb2N1c1B0IiwiZm9jdXNEaXN0IiwiZXhlY3V0ZUZpeDZtbSIsImZpeExvZyIsImxvZyIsImV4ZWN1dGVBdXRvUGlwZWxpbmVSZWYiLCJleGVjdXRlRml4MjVtbSIsImV4ZWN1dGVPdmVybGFwU29sdmVyIiwidGhlbiIsInJlc29sdmVPdmVybGFwcyIsImNhdGNoIiwiY2xvc2VzdCIsIm9uRml4Nm1tIiwib25GaXgyNW1tIiwib25BdXRvUmVmIiwib25PdmVybGFwU29sdmVyIiwib25Ub2dnbGVTaWRlSW5zcGVjdG9yIiwicmVwbGFjZSIsInpvb20iLCJmb3YiLCJjYW1lcmFGb3YiLCJjYW1lcmFOZWFyIiwiY2FtZXJhRmFyIiwiYXR0YWNoIiwiaW50ZW5zaXR5Iiwic2hvd0dyaWQiLCJzaG93QXhlcyIsImFjdGl2ZUl0ZW0iLCJhbGlnbm1lbnQiLCJtYXJnaW4iLCJheGlzQ29sb3JzIiwibGFiZWxDb2xvciJdLCJzb3VyY2VzIjpbIkNhbnZhc1RhYi5qc3giXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFJlYWN0LCB7IHVzZU1lbW8sIHVzZVJlZiwgdXNlU3RhdGUsIHVzZUVmZmVjdCwgdXNlQ2FsbGJhY2sgfSBmcm9tICdyZWFjdCc7XG5pbXBvcnQgeyBDYW52YXMsIHVzZUZyYW1lLCB1c2VUaHJlZSB9IGZyb20gJ0ByZWFjdC10aHJlZS9maWJlcic7XG5pbXBvcnQgeyBPcmJpdENvbnRyb2xzLCBMaW5lLCBIdG1sLCBUZXh0LCBHaXptb0hlbHBlciwgR2l6bW9WaWV3cG9ydCwgT3J0aG9ncmFwaGljQ2FtZXJhLCBQZXJzcGVjdGl2ZUNhbWVyYSB9IGZyb20gJ0ByZWFjdC10aHJlZS9kcmVpJztcbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcbmltcG9ydCB7IHVzZVN0b3JlIH0gZnJvbSAnLi4vLi4vc3RvcmUvdXNlU3RvcmUnO1xuaW1wb3J0IHsgdXNlQXBwQ29udGV4dCB9IGZyb20gJy4uLy4uL3N0b3JlL0FwcENvbnRleHQnO1xuaW1wb3J0IHsgYXBwbHlGaXhlcyB9IGZyb20gJy4uLy4uL2VuZ2luZS9GaXhBcHBsaWNhdG9yJztcbmltcG9ydCB7IGNyZWF0ZUxvZ2dlciB9IGZyb20gJy4uLy4uL3V0aWxzL0xvZ2dlcic7XG5pbXBvcnQgeyBmaXg2bW1HYXBzLCBmaXgyNW1tR2Fwc1dpdGhQaXBlLCBicmVha1BpcGVBdFBvaW50LCBpbnNlcnRTdXBwb3J0QXRQaXBlIH0gZnJvbSAnLi4vLi4vZW5naW5lL0dhcEZpeEVuZ2luZSc7XG5pbXBvcnQgeyBhdXRvQXNzaWduUGlwZWxpbmVSZWZzIH0gZnJvbSAnLi4vLi4vZW5naW5lL1RvcG9sb2d5RW5naW5lJztcbmltcG9ydCB7IFNpZGVJbnNwZWN0b3IgfSBmcm9tICcuLi9jb21wb25lbnRzL1NpZGVJbnNwZWN0b3InO1xuaW1wb3J0IHsgTG9nRHJhd2VyIH0gZnJvbSAnLi4vY29tcG9uZW50cy9Mb2dEcmF3ZXInO1xuaW1wb3J0IHsgU2NlbmVIZWFsdGhIVUQgfSBmcm9tICcuLi9jb21wb25lbnRzL1NjZW5lSGVhbHRoSFVEJztcbmltcG9ydCB7IFN1cHBvcnRQcm9wZXJ0eVBhbmVsIH0gZnJvbSAnLi4vY29tcG9uZW50cy9TdXBwb3J0UHJvcGVydHlQYW5lbCc7XG5pbXBvcnQgeyBHYXBTaWRlYmFyIH0gZnJvbSAnLi4vY29tcG9uZW50cy9HYXBTaWRlYmFyJztcbmltcG9ydCB7IFBpcGVsaW5lUHJvcGVydHlQYW5lbCB9IGZyb20gJy4uL2NvbXBvbmVudHMvUGlwZWxpbmVQcm9wZXJ0eVBhbmVsJztcbmltcG9ydCB7IE5hdmlnYXRpb25QYW5lbCB9IGZyb20gJy4uL2NvbXBvbmVudHMvTmF2aWdhdGlvblBhbmVsJztcbmltcG9ydCB7IFNldHRpbmdzTW9kYWwgfSBmcm9tICcuLi9jb21wb25lbnRzL1NldHRpbmdzTW9kYWwnO1xuaW1wb3J0IHsgQ2xpcHBpbmdQbGFuZXNMYXllciwgQ2xpcHBpbmdQYW5lbFVJIH0gZnJvbSAnLi4vY29tcG9uZW50cy9DbGlwcGluZ1BsYW5lc0xheWVyJztcbmltcG9ydCB7IFRvb2xiYXJSaWJib24gfSBmcm9tICcuLi9jb21wb25lbnRzL1Rvb2xiYXJSaWJib24nO1xuaW1wb3J0IHsgZGJnIH0gZnJvbSAnLi4vLi4vdXRpbHMvZGVidWdHYXRlJztcbmltcG9ydCB7IERlYnVnQ29uc29sZSB9IGZyb20gJy4uL2NvbXBvbmVudHMvRGVidWdDb25zb2xlJztcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gQ29sb3VyICYgZ2VvbWV0cnkgaGVscGVycyBwZXIgY29tcG9uZW50IHR5cGVcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbmNvbnN0IHR5cGVDb2xvciA9ICh0eXBlLCBhcHBTZXR0aW5ncykgPT4ge1xuICAgIGNvbnN0IGRlZmF1bHRDb2xvcnMgPSB7XG4gICAgICAgIFBJUEU6ICcjY2JkNWUxJyxcbiAgICAgICAgQkVORDogJyM5NGEzYjgnLFxuICAgICAgICBURUU6ICcjOTRhM2I4JyxcbiAgICAgICAgT0xFVDogJyM2NDc0OGInLFxuICAgICAgICBSRURVQ0VSOiAnIzY0NzQ4YicsXG4gICAgICAgIFZBTFZFOiAnIzNiODJmNicsXG4gICAgICAgIEZMQU5HRTogJyM2MGE1ZmEnLFxuICAgICAgICBTVVBQT1JUOiAnIzEwYjk4MSdcbiAgICB9O1xuICAgIGNvbnN0IGNvbG9ycyA9IGFwcFNldHRpbmdzPy5jb21wb25lbnRDb2xvcnMgfHwgZGVmYXVsdENvbG9ycztcbiAgICByZXR1cm4gY29sb3JzWyh0eXBlIHx8ICcnKS50b1VwcGVyQ2FzZSgpXSB8fCAnIzY0NzQ4Yic7XG59O1xuXG4vLyBIZWxwZXIgdG8gZXh0cmFjdCBuZXN0ZWQgYXR0cmlidXRlXG5jb25zdCBnZXRDb2xvck1vZGVWYWx1ZSA9IChlbCwgbW9kZSkgPT4ge1xuICAgIGlmIChtb2RlLnN0YXJ0c1dpdGgoJ0NBJykpIHJldHVybiBlbC5jb21wb25lbnRBdHRycz8uW21vZGVdIHx8ICcnO1xuICAgIGlmIChtb2RlID09PSAnUElQRUxJTkVfUkVGJykgcmV0dXJuIGVsLnBpcGVsaW5lUmVmIHx8ICcnO1xuICAgIGlmIChtb2RlID09PSAnRVJST1InKSByZXR1cm4gZWwudmFsaWRhdGlvbkVycm9yID8gJ0Vycm9yJyA6ICdWYWxpZCc7XG4gICAgaWYgKG1vZGUgPT09ICdMSU5FTk9fS0VZJykgcmV0dXJuIGVsLmxpbmVOb0tleSB8fCAnJztcbiAgICBpZiAobW9kZSA9PT0gJ1JBVElORycpIHJldHVybiBlbC5yYXRpbmcgfHwgJyc7XG4gICAgaWYgKG1vZGUgPT09ICdQSVBJTkdfQ0xBU1MnKSByZXR1cm4gZWwucGlwaW5nQ2xhc3MgfHwgJyc7XG4gICAgcmV0dXJuICcnO1xufTtcblxuLy8gU3Bvb2wgbG9naWNcbmNvbnN0IGdldENBQ29sb3IgPSAoc3RyKSA9PiB7XG4gICAgaWYgKCFzdHIpIHJldHVybiAnIzY0NzQ4Yic7XG4gICAgbGV0IGhhc2ggPSAwO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGhhc2ggPSBzdHIuY2hhckNvZGVBdChpKSArICgoaGFzaCA8PCA1KSAtIGhhc2gpO1xuICAgIH1cbiAgICBjb25zdCBjID0gKGhhc2ggJiAweDAwRkZGRkZGKS50b1N0cmluZygxNikudG9VcHBlckNhc2UoKTtcbiAgICByZXR1cm4gJyMnICsgJzAwMDAwJy5zdWJzdHJpbmcoMCwgNiAtIGMubGVuZ3RoKSArIGM7XG59O1xuXG5jb25zdCBjb21wdXRlU3Bvb2xzID0gKGRhdGFUYWJsZSkgPT4ge1xuICAgIGNvbnN0IHNwb29scyA9IHt9OyAvLyByb3dJbmRleCAtPiBzcG9vbElkXG4gICAgbGV0IHNwb29sQ291bnRlciA9IDE7XG5cbiAgICAvLyBBZGphY2VuY3kgbWFwXG4gICAgY29uc3QgZW5kcG9pbnRzID0ge307IC8vIFwieCx5LHpcIiAtPiBbcm93SW5kZXhdXG4gICAgZGF0YVRhYmxlLmZvckVhY2gociA9PiB7XG4gICAgICAgIGlmICgoci50eXBlfHwnJykudG9VcHBlckNhc2UoKSA9PT0gJ1NVUFBPUlQnKSByZXR1cm47IC8vIFN1cHBvcnRzIGRvbid0IHJvdXRlIHNwb29sc1xuICAgICAgICBpZiAoci5lcDEpIHsgY29uc3Qga2V5ID0gYCR7cGFyc2VGbG9hdChyLmVwMS54KS50b0ZpeGVkKDEpfSwke3BhcnNlRmxvYXQoci5lcDEueSkudG9GaXhlZCgxKX0sJHtwYXJzZUZsb2F0KHIuZXAxLnopLnRvRml4ZWQoMSl9YDsgaWYgKCFlbmRwb2ludHNba2V5XSkgZW5kcG9pbnRzW2tleV0gPSBbXTsgZW5kcG9pbnRzW2tleV0ucHVzaChyLl9yb3dJbmRleCk7IH1cbiAgICAgICAgaWYgKHIuZXAyKSB7IGNvbnN0IGtleSA9IGAke3BhcnNlRmxvYXQoci5lcDIueCkudG9GaXhlZCgxKX0sJHtwYXJzZUZsb2F0KHIuZXAyLnkpLnRvRml4ZWQoMSl9LCR7cGFyc2VGbG9hdChyLmVwMi56KS50b0ZpeGVkKDEpfWA7IGlmICghZW5kcG9pbnRzW2tleV0pIGVuZHBvaW50c1trZXldID0gW107IGVuZHBvaW50c1trZXldLnB1c2goci5fcm93SW5kZXgpOyB9XG4gICAgfSk7XG5cbiAgICBjb25zdCB2aXNpdGVkID0gbmV3IFNldCgpO1xuICAgIGNvbnN0IHJvd3MgPSBuZXcgTWFwKGRhdGFUYWJsZS5tYXAociA9PiBbci5fcm93SW5kZXgsIHJdKSk7XG5cbiAgICBjb25zdCBmbG9vZEZpbGwgPSAoc3RhcnRJZCwgc0lkKSA9PiB7XG4gICAgICAgIGNvbnN0IHF1ZXVlID0gW3N0YXJ0SWRdO1xuICAgICAgICBsZXQgaXRlcmF0aW9ucyA9IDA7XG4gICAgICAgIHdoaWxlIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBpZiAoaXRlcmF0aW9ucysrID4gMTAwMDApIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ2Zsb29kRmlsbCBhYm9ydGVkOiBleGNlZWRlZCAxMDAwMCBpdGVyYXRpb25zIChwb3NzaWJsZSBjeWNsZSBvciBtYXNzaXZlIG5ldHdvcmspLicpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY3VycklkID0gcXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgIGlmICh2aXNpdGVkLmhhcyhjdXJySWQpKSBjb250aW51ZTtcblxuICAgICAgICAgICAgY29uc3QgY3VyciA9IHJvd3MuZ2V0KGN1cnJJZCk7XG4gICAgICAgICAgICBpZiAoIWN1cnIpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICB2aXNpdGVkLmFkZChjdXJySWQpO1xuICAgICAgICAgICAgc3Bvb2xzW2N1cnJJZF0gPSBzSWQ7XG5cbiAgICAgICAgICAgIC8vIFN0b3Agc3Bvb2wgZmxvb2QgYWNyb3NzIGZsYW5nZXMsIHZhbHZlcywgb3IgcGlwZWxpbmUgcmVmIGNoYW5nZXNcbiAgICAgICAgICAgIGNvbnN0IGN1cnJUeXBlID0gKGN1cnIudHlwZSB8fCAnJykudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIGlmIChjdXJyVHlwZSA9PT0gJ0ZMQU5HRScgfHwgY3VyclR5cGUgPT09ICdWQUxWRScgfHwgY3VyclR5cGUgPT09ICdTVVBQT1JUJykgY29udGludWU7XG5cbiAgICAgICAgICAgIGNvbnN0IG5laWdoYm9ycyA9IG5ldyBTZXQoKTtcbiAgICAgICAgICAgIGlmIChjdXJyLmVwMSkgeyBjb25zdCBrZXkgPSBgJHtwYXJzZUZsb2F0KGN1cnIuZXAxLngpLnRvRml4ZWQoMSl9LCR7cGFyc2VGbG9hdChjdXJyLmVwMS55KS50b0ZpeGVkKDEpfSwke3BhcnNlRmxvYXQoY3Vyci5lcDEueikudG9GaXhlZCgxKX1gOyAoZW5kcG9pbnRzW2tleV0gfHwgW10pLmZvckVhY2gobiA9PiBuZWlnaGJvcnMuYWRkKG4pKTsgfVxuICAgICAgICAgICAgaWYgKGN1cnIuZXAyKSB7IGNvbnN0IGtleSA9IGAke3BhcnNlRmxvYXQoY3Vyci5lcDIueCkudG9GaXhlZCgxKX0sJHtwYXJzZUZsb2F0KGN1cnIuZXAyLnkpLnRvRml4ZWQoMSl9LCR7cGFyc2VGbG9hdChjdXJyLmVwMi56KS50b0ZpeGVkKDEpfWA7IChlbmRwb2ludHNba2V5XSB8fCBbXSkuZm9yRWFjaChuID0+IG5laWdoYm9ycy5hZGQobikpOyB9XG5cbiAgICAgICAgICAgIG5laWdoYm9ycy5mb3JFYWNoKG5JZCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCF2aXNpdGVkLmhhcyhuSWQpICYmIG5JZCAhPT0gY3VycklkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5laWdoYm9yID0gcm93cy5nZXQobklkKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5laWdoYm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuVHlwZSA9IChuZWlnaGJvci50eXBlIHx8ICcnKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gT25seSBmbG9vZCBpbnRvIHBpcGVzLCBiZW5kcywgdGVlcywgb2xldHMuIFdlIHN0b3AgKmFmdGVyKiBoaXR0aW5nIGEgZmxhbmdlL3ZhbHZlLCBidXQgZG8gd2UgaW5jbHVkZSB0aGUgZmxhbmdlP1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gWWVzLCB0aGUgZmlyc3QgZmxhbmdlIGJlbG9uZ3MgdG8gdGhlIHNwb29sLiBCdXQgd2UgZG9uJ3Qgcm91dGUgKnBhc3QqIGl0LlxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gU28gaWYgbmVpZ2hib3IgaXMgZmxhbmdlL3ZhbHZlLCB3ZSBhZGQgaXQsIGJ1dCBpdHMgb3duIGZsb29kRmlsbCBsb29wIHdpbGwgdGVybWluYXRlIGltbWVkaWF0ZWx5IChzZWUgYGlmIGN1cnJUeXBlID09PSBGTEFOR0UgY29udGludWVgIGFib3ZlKS5cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2UgYWxzbyBicmVhayBpZiBwaXBlbGluZSByZWZzIGRpZmZlciAoYXNzdW1pbmcgYm90aCBleGlzdClcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjdXJyLnBpcGVsaW5lUmVmICYmIG5laWdoYm9yLnBpcGVsaW5lUmVmICYmIGN1cnIucGlwZWxpbmVSZWYgIT09IG5laWdoYm9yLnBpcGVsaW5lUmVmKSByZXR1cm47XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXVlLnB1c2gobklkKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGRhdGFUYWJsZS5mb3JFYWNoKHIgPT4ge1xuICAgICAgICBpZiAoIXZpc2l0ZWQuaGFzKHIuX3Jvd0luZGV4KSkge1xuICAgICAgICAgICAgZmxvb2RGaWxsKHIuX3Jvd0luZGV4LCBzcG9vbENvdW50ZXIrKyk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBzcG9vbHM7XG59O1xuXG4vLyBHZW5lcmF0ZXMgZGlzdGluY3QgY29sb3JzIGJhc2VkIG9uIElEXG5jb25zdCBzcG9vbENvbG9yID0gKHNwb29sSWQpID0+IHtcbiAgICBjb25zdCBjb2xvcnMgPSBbJyNmODcxNzEnLCAnI2ZiOTIzYycsICcjZmFjYzE1JywgJyM0YWRlODAnLCAnIzJkZDRiZicsICcjNjBhNWZhJywgJyM4MThjZjgnLCAnI2MwODRmYycsICcjZjQ3MmI2J107XG4gICAgaWYgKCFzcG9vbElkKSByZXR1cm4gJyM2NDc0OGInO1xuICAgIHJldHVybiBjb2xvcnNbc3Bvb2xJZCAlIGNvbG9ycy5sZW5ndGhdO1xufTtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gUGVyZm9ybWFuY2UgT3B0aW1pemVkIEluc3RhbmNlZCBQaXBlcyBSZW5kZXJpbmdcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbmNvbnN0IEluc3RhbmNlZFBpcGVzID0gKCkgPT4ge1xuICBjb25zdCBnZXRQaXBlcyA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmdldFBpcGVzKTtcbiAgY29uc3QgY29sb3JNb2RlID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuY29sb3JNb2RlKTtcbiAgY29uc3QgZGF0YVRhYmxlID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuZGF0YVRhYmxlKTtcbiAgY29uc3QgbXVsdGlTZWxlY3RlZElkcyA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLm11bHRpU2VsZWN0ZWRJZHMpOyAvLyBMaXN0ZW4gZm9yIHNlbGVjdGlvbiBjaGFuZ2VzXG4gIGNvbnN0IGFwcFNldHRpbmdzID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuYXBwU2V0dGluZ3MpO1xuICBjb25zdCB0cmFuc2x1Y2VudE1vZGUgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS50cmFuc2x1Y2VudE1vZGUpO1xuICBjb25zdCBzaG93Um93TGFiZWxzID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuc2hvd1Jvd0xhYmVscyk7XG4gIGNvbnN0IHNob3dSZWZMYWJlbHMgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5zaG93UmVmTGFiZWxzKTtcbiAgY29uc3QgcGlwZXMgPSBnZXRQaXBlcygpO1xuICBjb25zdCBtZXNoUmVmID0gdXNlUmVmKCk7XG5cbiAgY29uc3QgZHVtbXkgPSB1c2VNZW1vKCgpID0+IG5ldyBUSFJFRS5PYmplY3QzRCgpLCBbXSk7XG4gIGNvbnN0IGMgPSB1c2VNZW1vKCgpID0+IG5ldyBUSFJFRS5Db2xvcigpLCBbXSk7XG5cbiAgLy8gQ29tcHV0ZSBzcG9vbHMgZ2xvYmFsbHkgaWYgbmVlZGVkXG4gIGNvbnN0IHNwb29scyA9IHVzZU1lbW8oKCkgPT4gY29tcHV0ZVNwb29scyhkYXRhVGFibGUpLCBbZGF0YVRhYmxlXSk7XG5cbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAodHlwZW9mIGRiZyAhPT0gJ3VuZGVmaW5lZCcpIGRiZy5yZW5kZXIoJ0lOU1RBTkNFRF9QSVBFUycsIGBSZW5kZXJpbmcgJHtwaXBlcy5sZW5ndGh9IHBpcGVzYCwge1xuICAgICAgICB0cmFuc2x1Y2VudE1vZGUsXG4gICAgICAgIGNvbG9yTW9kZSxcbiAgICAgICAgbXVsdGlTZWxlY3RlZENvdW50OiBtdWx0aVNlbGVjdGVkSWRzPy5sZW5ndGggfHwgMFxuICAgIH0pO1xuICAgIGlmICghbWVzaFJlZi5jdXJyZW50IHx8IHBpcGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gICAgcGlwZXMuZm9yRWFjaCgoZWxlbWVudCwgaSkgPT4ge1xuICAgICAgY29uc3QgeyBlcDEsIGVwMiwgYm9yZSB9ID0gZWxlbWVudDtcbiAgICAgIGlmICghZXAxIHx8ICFlcDIpIHJldHVybjtcblxuICAgICAgY29uc3QgdmVjQSA9IG5ldyBUSFJFRS5WZWN0b3IzKGVwMS54LCBlcDEueSwgZXAxLnopO1xuICAgICAgY29uc3QgdmVjQiA9IG5ldyBUSFJFRS5WZWN0b3IzKGVwMi54LCBlcDIueSwgZXAyLnopO1xuICAgICAgY29uc3QgZGlzdGFuY2UgPSB2ZWNBLmRpc3RhbmNlVG8odmVjQik7XG4gICAgICBpZiAoZGlzdGFuY2UgPT09IDApIHJldHVybjtcblxuICAgICAgLy8gUG9zaXRpb246IE1pZHBvaW50XG4gICAgICBjb25zdCBtaWRQb2ludCA9IHZlY0EuY2xvbmUoKS5sZXJwKHZlY0IsIDAuNSk7XG4gICAgICBkdW1teS5wb3NpdGlvbi5jb3B5KG1pZFBvaW50KTtcblxuICAgICAgLy8gU2NhbGU6IFktYXhpcyBpcyBsZW5ndGggaW4gVGhyZWUuanMgY3lsaW5kZXJzXG4gICAgICAvLyBGb3IgdmlzdWFsIGNsYXJpdHksIHNjYWxlIHRoZSBYIGFuZCBaIGJ5IGJvcmUvMlxuICAgICAgY29uc3QgcmFkaXVzID0gYm9yZSA/IGJvcmUgLyAyIDogNTtcbiAgICAgIGR1bW15LnNjYWxlLnNldChyYWRpdXMsIGRpc3RhbmNlLCByYWRpdXMpO1xuXG4gICAgICAvLyBPcmllbnRhdGlvbjogUG9pbnQgZnJvbSBBIHRvIEJcbiAgICAgIGNvbnN0IGRpcmVjdGlvbiA9IHZlY0IuY2xvbmUoKS5zdWIodmVjQSkubm9ybWFsaXplKCk7XG4gICAgICAvLyBUaHJlZS5qcyBjeWxpbmRlcnMgcG9pbnQgVVAgKFktYXhpcykgYnkgZGVmYXVsdFxuICAgICAgY29uc3QgdXAgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAxLCAwKTtcbiAgICAgIGNvbnN0IHF1YXRlcm5pb24gPSBuZXcgVEhSRUUuUXVhdGVybmlvbigpLnNldEZyb21Vbml0VmVjdG9ycyh1cCwgZGlyZWN0aW9uKTtcbiAgICAgIGR1bW15LnF1YXRlcm5pb24uY29weShxdWF0ZXJuaW9uKTtcblxuICAgICAgZHVtbXkudXBkYXRlTWF0cml4KCk7XG4gICAgICBtZXNoUmVmLmN1cnJlbnQuc2V0TWF0cml4QXQoaSwgZHVtbXkubWF0cml4KTtcblxuICAgICAgLy8gQ29sb3JcbiAgICAgIGxldCBjb2xTdHIgPSB0eXBlQ29sb3IoZWxlbWVudC50eXBlLCBhcHBTZXR0aW5ncyk7XG4gICAgICBpZiAoY29sb3JNb2RlID09PSAnU1BPT0wnKSB7XG4gICAgICAgICAgY29sU3RyID0gc3Bvb2xDb2xvcihzcG9vbHNbZWxlbWVudC5fcm93SW5kZXhdKTtcbiAgICAgIH0gZWxzZSBpZiAoY29sb3JNb2RlICE9PSAnVFlQRScgJiYgY29sb3JNb2RlICE9PSAnJykge1xuICAgICAgICAgIGNvbnN0IHZhbCA9IGdldENvbG9yTW9kZVZhbHVlKGVsZW1lbnQsIGNvbG9yTW9kZSk7XG4gICAgICAgICAgaWYgKHZhbCkge1xuICAgICAgICAgICAgICBjb2xTdHIgPSBnZXRDQUNvbG9yKHZhbCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgY29sU3RyID0gJyM0NzU1NjknOyAvLyBzbGF0ZS02MDAgZm9yIG1pc3NpbmcgYXR0clxuICAgICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gSGFuZGxlIG11bHRpLXNlbGVjdCBoaWdobGlnaHRpbmcgZm9yIHBpcGVzXG4gICAgICBjb25zdCBpc1NlbGVjdGVkID0gbXVsdGlTZWxlY3RlZElkcy5pbmNsdWRlcyhlbGVtZW50Ll9yb3dJbmRleCk7XG4gICAgICBpZiAoaXNTZWxlY3RlZCkge1xuICAgICAgICAgIGNvbFN0ciA9IGFwcFNldHRpbmdzLnNlbGVjdGlvbkNvbG9yOyAvLyB5ZWxsb3cgZm9yIHNlbGVjdGlvblxuICAgICAgfVxuXG4gICAgICBjLnNldChjb2xTdHIpO1xuICAgICAgbWVzaFJlZi5jdXJyZW50LnNldENvbG9yQXQoaSwgYyk7XG4gICAgfSk7XG5cbiAgICBtZXNoUmVmLmN1cnJlbnQuaW5zdGFuY2VNYXRyaXgubmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgIGlmIChtZXNoUmVmLmN1cnJlbnQuaW5zdGFuY2VDb2xvcikgbWVzaFJlZi5jdXJyZW50Lmluc3RhbmNlQ29sb3IubmVlZHNVcGRhdGUgPSB0cnVlO1xuICAgIG1lc2hSZWYuY3VycmVudC5jb21wdXRlQm91bmRpbmdTcGhlcmUoKTtcbiAgfSwgW3BpcGVzLCBkdW1teSwgY29sb3JNb2RlLCBzcG9vbHMsIGMsIG11bHRpU2VsZWN0ZWRJZHNdKTtcblxuICBjb25zdCBzZWxlY3RlZEVsZW1lbnRJZCA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLnNlbGVjdGVkRWxlbWVudElkKTtcblxuICBjb25zdCBoYW5kbGVQb2ludGVyRG93biA9IChlKSA9PiB7XG4gICAgICBjb25zdCBjYW52YXNNb2RlID0gdXNlU3RvcmUuZ2V0U3RhdGUoKS5jYW52YXNNb2RlO1xuXG4gICAgICAvLyBQcmV2ZW50IHNlbGVjdGlvbiBpZiBpbiBhIHRvb2wgbW9kZSBsaWtlIE1FQVNVUkUsIEJSRUFLLCBDT05ORUNULCBJTlNFUlRfU1VQUE9SVC4gTGV0IHRoZSBldmVudCBidWJibGUgdG8gZ2xvYmFsIHNuYXAgcGxhbmUuXG4gICAgICBpZiAoY2FudmFzTW9kZSAhPT0gJ1ZJRVcnKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuXG4gICAgICBjb25zdCBpbnN0YW5jZUlkID0gZS5pbnN0YW5jZUlkO1xuICAgICAgaWYgKGluc3RhbmNlSWQgIT09IHVuZGVmaW5lZCAmJiBwaXBlc1tpbnN0YW5jZUlkXSkge1xuICAgICAgICAgIGNvbnN0IHBpcGUgPSBwaXBlc1tpbnN0YW5jZUlkXTtcblxuICAgICAgICAgIGlmIChlLmJ1dHRvbiA9PT0gMikge1xuICAgICAgICAgICAgICAvLyBFeHRyYWN0IG5hdGl2ZSBldmVudCBjb29yZGluYXRlcywgd2hpY2ggc2hvdWxkIGJlIGFic29sdXRlIHZpZXdwb3J0IGNvb3Jkcy5cbiAgICAgICAgICAgICAgY29uc3QgbnggPSBlLm5hdGl2ZUV2ZW50Py5jbGllbnRYID8/IGUuY2xpZW50WDtcbiAgICAgICAgICAgICAgY29uc3QgbnkgPSBlLm5hdGl2ZUV2ZW50Py5jbGllbnRZID8/IGUuY2xpZW50WTtcbiAgICAgICAgICAgICAgdXNlU3RvcmUuZ2V0U3RhdGUoKS5zZXRDb250ZXh0TWVudSh7XG4gICAgICAgICAgICAgICAgICB4OiBueCxcbiAgICAgICAgICAgICAgICAgIHk6IG55LFxuICAgICAgICAgICAgICAgICAgcm93SW5kZXg6IHBpcGUuX3Jvd0luZGV4XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHBpcGUuZXAxICYmIHBpcGUuZXAyKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGlzTXVsdGlTZWxlY3QgPSBlLmN0cmxLZXkgfHwgZS5tZXRhS2V5O1xuICAgICAgICAgICAgICBpZiAoaXNNdWx0aVNlbGVjdCkge1xuICAgICAgICAgICAgICAgICAgdXNlU3RvcmUuZ2V0U3RhdGUoKS50b2dnbGVNdWx0aVNlbGVjdChwaXBlLl9yb3dJbmRleCk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLmNsZWFyTXVsdGlTZWxlY3QoKTtcbiAgICAgICAgICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0U2VsZWN0ZWQocGlwZS5fcm93SW5kZXgpO1xuICAgICAgICAgICAgICAgICAgdXNlU3RvcmUuZ2V0U3RhdGUoKS5zZXRNdWx0aVNlbGVjdChbcGlwZS5fcm93SW5kZXhdKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIC8vIERvIG5vdCBkaXNwYXRjaCBjYW52YXMtZm9jdXMtcG9pbnQgYXV0b21hdGljYWxseSBhbnltb3JlLlxuICAgICAgICAgICAgICAvLyBJbnN0ZWFkLCB3ZSBqdXN0IHNldCB0aGUgc2VsZWN0aW9uIGZvciB0aGUgcHJvcGVydHkgcGFuZWwuXG4gICAgICAgICAgfVxuICAgICAgfVxuICB9O1xuXG4gIGNvbnN0IGhhbmRsZVBvaW50ZXJNaXNzZWQgPSAoZSkgPT4ge1xuICAgICAgLy8gQ2hlY2sgaWYgY2xpY2sgb3JpZ2luYXRlZCBmcm9tIHRoZSBIVE1MIFVJIG92ZXJsYXkuIGUudGFyZ2V0IGlzIHR5cGljYWxseSB0aGUgY2FudmFzIGlmIHZhbGlkLlxuICAgICAgLy8gZS50eXBlIGlzIHR5cGljYWxseSAncG9pbnRlcmRvd24nIG9yICdjbGljaycgZnJvbSBSM0YsIGJ1dCB3ZSBjYW4gYWxzbyBjaGVjayBlLmV2ZW50T2JqZWN0LlxuICAgICAgLy8gT2Z0ZW4sIFIzRidzIG9uUG9pbnRlck1pc3NlZCBmaXJlcyBmb3IgVUkgY2xpY2tzIGlmIHRoZXkgYXJlbid0IHN0b3BwZWQuXG4gICAgICAvLyBXZSBjYW4gY2hlY2sgaWYgZS5uYXRpdmVFdmVudD8udGFyZ2V0IGlzIGEgRE9NIGVsZW1lbnQgb3V0c2lkZSB0aGUgY2FudmFzIG9yIGlmIHRoZXJlJ3Mgbm8gbmF0aXZlRXZlbnQuXG4gICAgICBpZiAoZS5uYXRpdmVFdmVudD8uX19oYW5kbGVkM0QpIHtcbiAgICAgICAgICBkYmcuZXZlbnQoJ1BPSU5URVJfTUlTU0VEJywgJ1N1cHByZXNzZWQg4oCUIGNsaWNrIGhhbmRsZWQgYnkgSW1tdXRhYmxlQ29tcG9uZW50Jyk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIGRiZyAhPT0gJ3VuZGVmaW5lZCcpIGRiZy5ldmVudCgnUE9JTlRFUl9NSVNTRUQnLCAnRmlyZWQnLCB7XG4gICAgICAgICAgdGFyZ2V0OiBlLm5hdGl2ZUV2ZW50Py50YXJnZXQ/LnRhZ05hbWUsXG4gICAgICAgICAgaGFuZGxlZDNEOiAhIWUubmF0aXZlRXZlbnQ/Ll9faGFuZGxlZDNELFxuICAgICAgICAgIGN1cnJlbnRTZWxlY3Rpb246IHVzZVN0b3JlLmdldFN0YXRlKCkuc2VsZWN0ZWRFbGVtZW50SWQsXG4gICAgICAgICAgbXVsdGlTZWxlY3RlZDogdXNlU3RvcmUuZ2V0U3RhdGUoKS5tdWx0aVNlbGVjdGVkSWRzPy5sZW5ndGggfHwgMFxuICAgICAgfSk7XG5cbiAgICAgIGlmIChlLm5hdGl2ZUV2ZW50KSB7XG4gICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZS5uYXRpdmVFdmVudC50YXJnZXQ7XG4gICAgICAgICAgLy8gSWYgdGhlIGNsaWNrIGlzIG9uIGFuIGlucHV0LCBidXR0b24sIG9yIHNvbWV0aGluZyB0aGF0IGlzIGNsZWFybHkgVUksIGlnbm9yZSBpdC5cbiAgICAgICAgICAvLyBUaGUgY2FudmFzIGl0c2VsZiBpcyB1c3VhbGx5IGEgYDxjYW52YXM+YCBlbGVtZW50LlxuICAgICAgICAgIGlmICh0YXJnZXQgJiYgdGFyZ2V0LnRhZ05hbWUgIT09ICdDQU5WQVMnKSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIERvbid0IGNsZWFyIGlmIEN0cmwgaXMgaGVsZCBkb3duLCBhbGxvd3MgbXVsdGktc2VsZWN0IHRvIHN0YXkgcGVyc2lzdGVudCBhY3Jvc3MgYmxhbmsgY2xpY2tzXG4gICAgICBpZiAoZSAmJiAoZS5jdHJsS2V5IHx8IGUubWV0YUtleSkpIHJldHVybjtcbiAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0U2VsZWN0ZWQobnVsbCk7XG4gICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLmNsZWFyTXVsdGlTZWxlY3QoKTtcbiAgfTtcblxuICBpZiAocGlwZXMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICByZXR1cm4gKFxuICAgIDxncm91cCBvblBvaW50ZXJNaXNzZWQ9e2hhbmRsZVBvaW50ZXJNaXNzZWR9PlxuICAgICAgICA8aW5zdGFuY2VkTWVzaCByZWY9e21lc2hSZWZ9IGFyZ3M9e1tudWxsLCBudWxsLCBwaXBlcy5sZW5ndGhdfSBvblBvaW50ZXJEb3duPXtoYW5kbGVQb2ludGVyRG93bn0+XG4gICAgICAgICAgPGN5bGluZGVyR2VvbWV0cnkgYXJncz17WzEsIDEsIDEsIDE2XX0gLz5cbiAgICAgICAgICA8bWVzaFN0YW5kYXJkTWF0ZXJpYWwgY29sb3I9XCIjM2I4MmY2XCIgdHJhbnNwYXJlbnQ9e3RyYW5zbHVjZW50TW9kZX0gb3BhY2l0eT17dHJhbnNsdWNlbnRNb2RlID8gMC4zIDogMX0gZGVwdGhXcml0ZT17IXRyYW5zbHVjZW50TW9kZX0gLz5cbiAgICAgICAgPC9pbnN0YW5jZWRNZXNoPlxuXG4gICAgICAgIHsvKiBIaWdobGlnaHQgT3ZlcmxheXMgKi99XG4gICAgICAgIHsobXVsdGlTZWxlY3RlZElkcyB8fCBbXSkubWFwKGlkID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBpcGUgPSBkYXRhVGFibGUuZmluZChyID0+IHIuX3Jvd0luZGV4ID09PSBpZCk7XG4gICAgICAgICAgICBpZiAoIXBpcGUgfHwgKHBpcGUudHlwZSB8fCAnJykudG9VcHBlckNhc2UoKSAhPT0gJ1BJUEUnIHx8ICFwaXBlLmVwMSB8fCAhcGlwZS5lcDIpIHJldHVybiBudWxsO1xuXG4gICAgICAgICAgICBjb25zdCBtaWRYID0gKHBpcGUuZXAxLnggKyBwaXBlLmVwMi54KSAvIDI7XG4gICAgICAgICAgICBjb25zdCBtaWRZID0gKHBpcGUuZXAxLnkgKyBwaXBlLmVwMi55KSAvIDI7XG4gICAgICAgICAgICBjb25zdCBtaWRaID0gKHBpcGUuZXAxLnogKyBwaXBlLmVwMi56KSAvIDI7XG5cbiAgICAgICAgICAgIGNvbnN0IHZlY0EgPSBuZXcgVEhSRUUuVmVjdG9yMyhwaXBlLmVwMS54LCBwaXBlLmVwMS55LCBwaXBlLmVwMS56KTtcbiAgICAgICAgICAgIGNvbnN0IHZlY0IgPSBuZXcgVEhSRUUuVmVjdG9yMyhwaXBlLmVwMi54LCBwaXBlLmVwMi55LCBwaXBlLmVwMi56KTtcbiAgICAgICAgICAgIGNvbnN0IGRpc3RhbmNlID0gdmVjQS5kaXN0YW5jZVRvKHZlY0IpO1xuICAgICAgICAgICAgaWYgKGRpc3RhbmNlID09PSAwKSByZXR1cm4gbnVsbDtcblxuICAgICAgICAgICAgY29uc3QgcmFkaXVzID0gcGlwZS5ib3JlID8gcGlwZS5ib3JlIC8gMiA6IDU7XG4gICAgICAgICAgICBjb25zdCBkaXJlY3Rpb24gPSB2ZWNCLmNsb25lKCkuc3ViKHZlY0EpLm5vcm1hbGl6ZSgpO1xuICAgICAgICAgICAgY29uc3QgcXVhdGVybmlvbiA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCkuc2V0RnJvbVVuaXRWZWN0b3JzKG5ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApLCBkaXJlY3Rpb24pO1xuXG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgICA8bWVzaCBrZXk9e2BobC0ke2lkfWB9IHBvc2l0aW9uPXtbbWlkWCwgbWlkWSwgbWlkWl19IHF1YXRlcm5pb249e3F1YXRlcm5pb259PlxuICAgICAgICAgICAgICAgICAgICAgPGN5bGluZGVyR2VvbWV0cnkgYXJncz17W3JhZGl1cyAqIDEuMiwgcmFkaXVzICogMS4yLCBkaXN0YW5jZSwgMTZdfSAvPlxuICAgICAgICAgICAgICAgICAgICAgPG1lc2hCYXNpY01hdGVyaWFsIGNvbG9yPXthcHBTZXR0aW5ncy5zZWxlY3Rpb25Db2xvcn0gdHJhbnNwYXJlbnQgb3BhY2l0eT17YXBwU2V0dGluZ3Muc2VsZWN0aW9uT3BhY2l0eX0gZGVwdGhUZXN0PXtmYWxzZX0gLz5cbiAgICAgICAgICAgICAgICAgPC9tZXNoPlxuICAgICAgICAgICAgKTtcbiAgICAgICAgfSl9XG4gICAgPC9ncm91cD5cbiAgKTtcbn07XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIERpc3RpbmN0IGdlb21ldHJ5IGZvciBub24tUElQRSBjb21wb25lbnRzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jb25zdCBJbW11dGFibGVDb21wb25lbnRzID0gKCkgPT4ge1xuICBjb25zdCBnZXRJbW11dGFibGVzID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuZ2V0SW1tdXRhYmxlcyk7XG4gIGNvbnN0IGVsZW1lbnRzID0gZ2V0SW1tdXRhYmxlcygpO1xuICBjb25zdCBjb2xvck1vZGUgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5jb2xvck1vZGUpO1xuICBjb25zdCBkYXRhVGFibGUgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5kYXRhVGFibGUpO1xuICBjb25zdCBtdWx0aVNlbGVjdGVkSWRzID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUubXVsdGlTZWxlY3RlZElkcyk7XG4gIGNvbnN0IGFwcFNldHRpbmdzID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuYXBwU2V0dGluZ3MpO1xuICBjb25zdCB0cmFuc2x1Y2VudE1vZGUgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS50cmFuc2x1Y2VudE1vZGUpO1xuICBjb25zdCBzaG93Um93TGFiZWxzID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuc2hvd1Jvd0xhYmVscyk7XG4gIGNvbnN0IHNob3dSZWZMYWJlbHMgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5zaG93UmVmTGFiZWxzKTtcbiAgY29uc3QgaXNUcmFuc2x1Y2VudCA9IHRyYW5zbHVjZW50TW9kZTtcblxuICAvLyBSZS11c2UgY29tcHV0ZSBzcG9vbHMgaWYgbmVlZGVkIGhlcmVcbiAgY29uc3Qgc3Bvb2xzID0gdXNlTWVtbygoKSA9PiBjb21wdXRlU3Bvb2xzKGRhdGFUYWJsZSksIFtkYXRhVGFibGVdKTtcblxuICBpZiAoZWxlbWVudHMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICByZXR1cm4gKFxuICAgIDxncm91cD5cbiAgICAgIHtlbGVtZW50cy5tYXAoKGVsLCBpKSA9PiB7XG4gICAgICAgIGlmICghZWwuZXAxIHx8ICFlbC5lcDIpIHJldHVybiBudWxsO1xuXG4gICAgICAgIGNvbnN0IHZlY0EgPSBuZXcgVEhSRUUuVmVjdG9yMyhlbC5lcDEueCwgZWwuZXAxLnksIGVsLmVwMS56KTtcbiAgICAgICAgY29uc3QgdmVjQiA9IG5ldyBUSFJFRS5WZWN0b3IzKGVsLmVwMi54LCBlbC5lcDIueSwgZWwuZXAyLnopO1xuICAgICAgICBjb25zdCBkaXN0ID0gdmVjQS5kaXN0YW5jZVRvKHZlY0IpO1xuICAgICAgICBpZiAoZGlzdCA8IDAuMDAxKSByZXR1cm4gbnVsbDtcblxuICAgICAgICBjb25zdCBtaWQgPSB2ZWNBLmNsb25lKCkubGVycCh2ZWNCLCAwLjUpO1xuICAgICAgICBjb25zdCBkaXIgPSB2ZWNCLmNsb25lKCkuc3ViKHZlY0EpLm5vcm1hbGl6ZSgpO1xuICAgICAgICBjb25zdCB1cCAgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAxLCAwKTtcbiAgICAgICAgY29uc3QgcXVhdCA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCkuc2V0RnJvbVVuaXRWZWN0b3JzKHVwLCBkaXIpO1xuICAgICAgICBjb25zdCByID0gZWwuYm9yZSA/IGVsLmJvcmUgLyAyIDogNTtcbiAgICAgICAgbGV0IGNvbG9yID0gdHlwZUNvbG9yKGVsLnR5cGUsIGFwcFNldHRpbmdzKTtcbiAgICAgICAgaWYgKGNvbG9yTW9kZSA9PT0gJ1NQT09MJykge1xuICAgICAgICAgICAgY29sb3IgPSBzcG9vbENvbG9yKHNwb29sc1tlbC5fcm93SW5kZXhdKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb2xvck1vZGUgIT09ICdUWVBFJyAmJiBjb2xvck1vZGUgIT09ICcnKSB7XG4gICAgICAgICAgICBjb25zdCB2YWwgPSBnZXRDb2xvck1vZGVWYWx1ZShlbCwgY29sb3JNb2RlKTtcbiAgICAgICAgICAgIGlmICh2YWwpIHtcbiAgICAgICAgICAgICAgICBjb2xvciA9IGdldENBQ29sb3IodmFsKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29sb3IgPSAnIzQ3NTU2OSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBpc1NlbGVjdGVkID0gbXVsdGlTZWxlY3RlZElkcy5pbmNsdWRlcyhlbC5fcm93SW5kZXgpO1xuICAgICAgICBpZiAoaXNTZWxlY3RlZCkgY29sb3IgPSBhcHBTZXR0aW5ncy5zZWxlY3Rpb25Db2xvcjtcblxuICAgICAgICBjb25zdCB0eXBlID0gKGVsLnR5cGUgfHwgJycpLnRvVXBwZXJDYXNlKCk7XG5cbiAgICAgICAgY29uc3QgaGFuZGxlU2VsZWN0ID0gKGUpID0+IHtcbiAgICAgICAgICBpZiAoZS5uYXRpdmVFdmVudCkgZS5uYXRpdmVFdmVudC5fX2hhbmRsZWQzRCA9IHRydWU7XG4gICAgICAgICAgY29uc3QgY2FudmFzTW9kZSA9IHVzZVN0b3JlLmdldFN0YXRlKCkuY2FudmFzTW9kZTtcbiAgICAgICAgICBpZiAoY2FudmFzTW9kZSAhPT0gJ1ZJRVcnKSByZXR1cm47XG5cbiAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgaWYgKGUuYnV0dG9uID09PSAyKSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBueCA9IGUubmF0aXZlRXZlbnQ/LmNsaWVudFggPz8gZS5jbGllbnRYO1xuICAgICAgICAgICAgICAgICAgY29uc3QgbnkgPSBlLm5hdGl2ZUV2ZW50Py5jbGllbnRZID8/IGUuY2xpZW50WTtcbiAgICAgICAgICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0Q29udGV4dE1lbnUoe1xuICAgICAgICAgICAgICAgICAgICAgIHg6IG54LFxuICAgICAgICAgICAgICAgICAgICAgIHk6IG55LFxuICAgICAgICAgICAgICAgICAgICAgIHJvd0luZGV4OiBlbC5fcm93SW5kZXhcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgY29uc3QgaXNNdWx0aVNlbGVjdCA9IGUuY3RybEtleSB8fCBlLm1ldGFLZXk7XG4gICAgICAgICAgICAgIGlmIChpc011bHRpU2VsZWN0KSB7XG4gICAgICAgICAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLnRvZ2dsZU11bHRpU2VsZWN0KGVsLl9yb3dJbmRleCk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLmNsZWFyTXVsdGlTZWxlY3QoKTtcbiAgICAgICAgICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0U2VsZWN0ZWQoZWwuX3Jvd0luZGV4KTtcbiAgICAgICAgICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0TXVsdGlTZWxlY3QoW2VsLl9yb3dJbmRleF0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgIGRiZy5lcnJvcignSU1NX1NFTEVDVCcsICdGYXRhbCBlcnJvciBkdXJpbmcgY29tcG9uZW50IHNlbGVjdGlvbicsIHsgZXJyb3I6IGVyci5tZXNzYWdlLCByb3dJbmRleDogZWwuX3Jvd0luZGV4IH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBpZiAodHlwZSA9PT0gJ0ZMQU5HRScpIHtcbiAgICAgICAgICAvLyBEaXNjIOKAlCBzaG9ydCwgd2lkZSBjeWxpbmRlclxuICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8bWVzaCBrZXk9e2BmbC0ke2l9YH0gcG9zaXRpb249e21pZH0gcXVhdGVybmlvbj17cXVhdH0gb25Qb2ludGVyRG93bj17aGFuZGxlU2VsZWN0fT5cbiAgICAgICAgICAgICAgPGN5bGluZGVyR2VvbWV0cnkgYXJncz17W3IgKiAxLjYsIHIgKiAxLjYsIE1hdGgubWF4KGRpc3QgKiAwLjE1LCAxMCksIDI0XX0gLz5cbiAgICAgICAgICAgICAgPG1lc2hTdGFuZGFyZE1hdGVyaWFsIGNvbG9yPXtpc1NlbGVjdGVkID8gYXBwU2V0dGluZ3Muc2VsZWN0aW9uQ29sb3IgOiBjb2xvcn0gdHJhbnNwYXJlbnQ9e2lzVHJhbnNsdWNlbnR9IG9wYWNpdHk9e2lzVHJhbnNsdWNlbnQgPyAwLjMgOiAxfSBkZXB0aFdyaXRlPXshaXNUcmFuc2x1Y2VudH0gLz5cbiAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGUgPT09ICdWQUxWRScpIHtcbiAgICAgICAgICAvLyBEb3VibGUgQ29uZSAoaG91cmdsYXNzKSBib2R5ICsgc21hbGwgc3RlbS93aGVlbFxuICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8Z3JvdXAga2V5PXtgdnYtJHtpfWB9IHBvc2l0aW9uPXttaWR9IHF1YXRlcm5pb249e3F1YXR9IG9uUG9pbnRlckRvd249e2hhbmRsZVNlbGVjdH0+XG4gICAgICAgICAgICAgICAgey8qIEJvdHRvbSBDb25lICovfVxuICAgICAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXtbMCwgLWRpc3QvNCwgMF19PlxuICAgICAgICAgICAgICAgICAgICA8Y3lsaW5kZXJHZW9tZXRyeSBhcmdzPXtbMCwgcioxLjgsIGRpc3QvMiwgMTZdfSAvPlxuICAgICAgICAgICAgICAgICAgICA8bWVzaFN0YW5kYXJkTWF0ZXJpYWwgY29sb3I9e2lzU2VsZWN0ZWQgPyBhcHBTZXR0aW5ncy5zZWxlY3Rpb25Db2xvciA6IGNvbG9yfSB0cmFuc3BhcmVudD17aXNUcmFuc2x1Y2VudH0gb3BhY2l0eT17aXNUcmFuc2x1Y2VudCA/IDAuMyA6IDF9IGRlcHRoV3JpdGU9eyFpc1RyYW5zbHVjZW50fSAvPlxuICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgICB7LyogVG9wIENvbmUgKi99XG4gICAgICAgICAgICAgICAgPG1lc2ggcG9zaXRpb249e1swLCBkaXN0LzQsIDBdfT5cbiAgICAgICAgICAgICAgICAgICAgPGN5bGluZGVyR2VvbWV0cnkgYXJncz17W3IqMS44LCAwLCBkaXN0LzIsIDE2XX0gLz5cbiAgICAgICAgICAgICAgICAgICAgPG1lc2hTdGFuZGFyZE1hdGVyaWFsIGNvbG9yPXtpc1NlbGVjdGVkID8gYXBwU2V0dGluZ3Muc2VsZWN0aW9uQ29sb3IgOiBjb2xvcn0gdHJhbnNwYXJlbnQ9e2lzVHJhbnNsdWNlbnR9IG9wYWNpdHk9e2lzVHJhbnNsdWNlbnQgPyAwLjMgOiAxfSBkZXB0aFdyaXRlPXshaXNUcmFuc2x1Y2VudH0gLz5cbiAgICAgICAgICAgICAgICA8L21lc2g+XG4gICAgICAgICAgICAgICAgey8qIFN0ZW0gYW5kIHdoZWVsICovfVxuICAgICAgICAgICAgICAgIDxncm91cCBwb3NpdGlvbj17W3IqMiwgMCwgMF19IHJvdGF0aW9uPXtbMCwgMCwgTWF0aC5QSS8yXX0+XG4gICAgICAgICAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXtbMCwgZGlzdC8yLCAwXX0+XG4gICAgICAgICAgICAgICAgICAgICAgICA8Y3lsaW5kZXJHZW9tZXRyeSBhcmdzPXtbciowLjIsIHIqMC4yLCBkaXN0LCA4XX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxtZXNoU3RhbmRhcmRNYXRlcmlhbCBjb2xvcj17aXNTZWxlY3RlZCA/IGFwcFNldHRpbmdzLnNlbGVjdGlvbkNvbG9yIDogY29sb3J9IHRyYW5zcGFyZW50PXtpc1RyYW5zbHVjZW50fSBvcGFjaXR5PXtpc1RyYW5zbHVjZW50ID8gMC4zIDogMX0gZGVwdGhXcml0ZT17IWlzVHJhbnNsdWNlbnR9IC8+XG4gICAgICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgICAgICAgPG1lc2ggcG9zaXRpb249e1swLCBkaXN0LCAwXX0gcm90YXRpb249e1tNYXRoLlBJLzIsIDAsIDBdfT5cbiAgICAgICAgICAgICAgICAgICAgICAgICA8dG9ydXNHZW9tZXRyeSBhcmdzPXtbciwgciowLjIsIDgsIDI0XX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaFN0YW5kYXJkTWF0ZXJpYWwgY29sb3I9e2lzU2VsZWN0ZWQgPyBhcHBTZXR0aW5ncy5zZWxlY3Rpb25Db2xvciA6IGNvbG9yfSB0cmFuc3BhcmVudD17aXNUcmFuc2x1Y2VudH0gb3BhY2l0eT17aXNUcmFuc2x1Y2VudCA/IDAuMyA6IDF9IGRlcHRoV3JpdGU9eyFpc1RyYW5zbHVjZW50fSAvPlxuICAgICAgICAgICAgICAgICAgICA8L21lc2g+XG4gICAgICAgICAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXtbMCwgZGlzdCwgMF19PlxuICAgICAgICAgICAgICAgICAgICAgICAgIDxjeWxpbmRlckdlb21ldHJ5IGFyZ3M9e1tyKjAuNCwgciowLjQsIHIqMC4yLCAxNl19IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgPG1lc2hTdGFuZGFyZE1hdGVyaWFsIGNvbG9yPXtpc1NlbGVjdGVkID8gYXBwU2V0dGluZ3Muc2VsZWN0aW9uQ29sb3IgOiBjb2xvcn0gdHJhbnNwYXJlbnQ9e2lzVHJhbnNsdWNlbnR9IG9wYWNpdHk9e2lzVHJhbnNsdWNlbnQgPyAwLjMgOiAxfSBkZXB0aFdyaXRlPXshaXNUcmFuc2x1Y2VudH0gLz5cbiAgICAgICAgICAgICAgICAgICAgPC9tZXNoPlxuICAgICAgICAgICAgICAgIDwvZ3JvdXA+XG4gICAgICAgICAgICA8L2dyb3VwPlxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZSA9PT0gJ0JFTkQnKSB7XG4gICAgICAgICAgLy8gU2xpZ2h0bHkgdGhpY2tlciBjeWxpbmRlciBpbiBhbWJlciDigJQgbm8gdG9ydXMgd2l0aG91dCAzIHBvaW50czsga2VlcCBjeWxpbmRlciB3aXRoIGRpc3RpbmN0IGNvbG91clxuICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8bWVzaCBrZXk9e2Bibi0ke2l9YH0gcG9zaXRpb249e21pZH0gcXVhdGVybmlvbj17cXVhdH0gb25Qb2ludGVyRG93bj17aGFuZGxlU2VsZWN0fT5cbiAgICAgICAgICAgICAgPGN5bGluZGVyR2VvbWV0cnkgYXJncz17W3IgKiAxLjEsIHIgKiAxLjEsIGRpc3QsIDE2XX0gLz5cbiAgICAgICAgICAgICAgPG1lc2hTdGFuZGFyZE1hdGVyaWFsIGNvbG9yPXtpc1NlbGVjdGVkID8gYXBwU2V0dGluZ3Muc2VsZWN0aW9uQ29sb3IgOiBjb2xvcn0gdHJhbnNwYXJlbnQ9e2lzVHJhbnNsdWNlbnR9IG9wYWNpdHk9e2lzVHJhbnNsdWNlbnQgPyAwLjMgOiAxfSBkZXB0aFdyaXRlPXshaXNUcmFuc2x1Y2VudH0gLz5cbiAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGUgPT09ICdURUUnKSB7XG4gICAgICAgICAgLy8gTWFpbiBydW4gY3lsaW5kZXIgKyBicmFuY2ggc3R1YlxuICAgICAgICAgIGNvbnN0IGJyYW5jaERpciA9IGVsLmNwICYmIGVsLmJwXG4gICAgICAgICAgICA/IG5ldyBUSFJFRS5WZWN0b3IzKGVsLmJwLnggLSBlbC5jcC54LCBlbC5icC55IC0gZWwuY3AueSwgZWwuYnAueiAtIGVsLmNwLnopLm5vcm1hbGl6ZSgpXG4gICAgICAgICAgICA6IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIDEpO1xuICAgICAgICAgIGNvbnN0IGJyYW5jaExlbiA9IGVsLmNwICYmIGVsLmJwXG4gICAgICAgICAgICA/IG5ldyBUSFJFRS5WZWN0b3IzKGVsLmJwLnggLSBlbC5jcC54LCBlbC5icC55IC0gZWwuY3AueSwgZWwuYnAueiAtIGVsLmNwLnopLmxlbmd0aCgpXG4gICAgICAgICAgICA6IHIgKiAzO1xuICAgICAgICAgIGNvbnN0IGJyYW5jaE1pZCA9IGVsLmNwXG4gICAgICAgICAgICA/IG5ldyBUSFJFRS5WZWN0b3IzKFxuICAgICAgICAgICAgICAgIGVsLmNwLnggKyBicmFuY2hEaXIueCAqIGJyYW5jaExlbiAvIDIsXG4gICAgICAgICAgICAgICAgZWwuY3AueSArIGJyYW5jaERpci55ICogYnJhbmNoTGVuIC8gMixcbiAgICAgICAgICAgICAgICBlbC5jcC56ICsgYnJhbmNoRGlyLnogKiBicmFuY2hMZW4gLyAyXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgIDogbWlkLmNsb25lKCkuYWRkU2NhbGVkVmVjdG9yKGJyYW5jaERpciwgYnJhbmNoTGVuIC8gMik7XG4gICAgICAgICAgY29uc3QgYnJhbmNoUXVhdCA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCkuc2V0RnJvbVVuaXRWZWN0b3JzKHVwLCBicmFuY2hEaXIpO1xuICAgICAgICAgIGNvbnN0IGJyYW5jaFIgPSBlbC5icmFuY2hCb3JlID8gZWwuYnJhbmNoQm9yZSAvIDIgOiByICogMC42O1xuICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8Z3JvdXAga2V5PXtgdGVlLSR7aX1gfSBvblBvaW50ZXJEb3duPXtoYW5kbGVTZWxlY3R9PlxuICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17bWlkfSBxdWF0ZXJuaW9uPXtxdWF0fT5cbiAgICAgICAgICAgICAgICA8Y3lsaW5kZXJHZW9tZXRyeSBhcmdzPXtbciwgciwgZGlzdCwgMTZdfSAvPlxuICAgICAgICAgICAgICAgIDxtZXNoU3RhbmRhcmRNYXRlcmlhbCBjb2xvcj17aXNTZWxlY3RlZCA/IGFwcFNldHRpbmdzLnNlbGVjdGlvbkNvbG9yIDogY29sb3J9IHRyYW5zcGFyZW50PXtpc1RyYW5zbHVjZW50fSBvcGFjaXR5PXtpc1RyYW5zbHVjZW50ID8gMC4zIDogMX0gZGVwdGhXcml0ZT17IWlzVHJhbnNsdWNlbnR9IC8+XG4gICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgPG1lc2ggcG9zaXRpb249e2JyYW5jaE1pZH0gcXVhdGVybmlvbj17YnJhbmNoUXVhdH0+XG4gICAgICAgICAgICAgICAgPGN5bGluZGVyR2VvbWV0cnkgYXJncz17W2JyYW5jaFIsIGJyYW5jaFIsIGJyYW5jaExlbiwgMTJdfSAvPlxuICAgICAgICAgICAgICAgIDxtZXNoU3RhbmRhcmRNYXRlcmlhbCBjb2xvcj17aXNTZWxlY3RlZCA/IGFwcFNldHRpbmdzLnNlbGVjdGlvbkNvbG9yIDogY29sb3J9IHRyYW5zcGFyZW50PXtpc1RyYW5zbHVjZW50fSBvcGFjaXR5PXtpc1RyYW5zbHVjZW50ID8gMC4zIDogMX0gZGVwdGhXcml0ZT17IWlzVHJhbnNsdWNlbnR9IC8+XG4gICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgIDwvZ3JvdXA+XG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlID09PSAnT0xFVCcpIHtcbiAgICAgICAgICAvLyBTbWFsbCBzcGhlcmUgYXQgQ1AgcG9zaXRpb25cbiAgICAgICAgICBjb25zdCBwb3MgPSBlbC5jcFxuICAgICAgICAgICAgPyBbZWwuY3AueCwgZWwuY3AueSwgZWwuY3Auel1cbiAgICAgICAgICAgIDogW21pZC54LCBtaWQueSwgbWlkLnpdO1xuICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8bWVzaCBrZXk9e2BvbC0ke2l9YH0gcG9zaXRpb249e3Bvc30gb25Qb2ludGVyRG93bj17aGFuZGxlU2VsZWN0fT5cbiAgICAgICAgICAgICAgPHNwaGVyZUdlb21ldHJ5IGFyZ3M9e1tyICogMS4zLCAxMiwgMTJdfSAvPlxuICAgICAgICAgICAgICA8bWVzaFN0YW5kYXJkTWF0ZXJpYWwgY29sb3I9e2lzU2VsZWN0ZWQgPyBhcHBTZXR0aW5ncy5zZWxlY3Rpb25Db2xvciA6IGNvbG9yfSB0cmFuc3BhcmVudD17aXNUcmFuc2x1Y2VudH0gb3BhY2l0eT17aXNUcmFuc2x1Y2VudCA/IDAuMyA6IDF9IGRlcHRoV3JpdGU9eyFpc1RyYW5zbHVjZW50fSAvPlxuICAgICAgICAgICAgPC9tZXNoPlxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZSA9PT0gJ1NVUFBPUlQnKSB7XG4gICAgICAgICAgY29uc3QgaXNSZXN0ID0gWydDQTE1MCcsICdSRVNUJ10uaW5jbHVkZXMoKGVsLnR5cGUgfHwgJycpLnRvVXBwZXJDYXNlKCkpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAgT2JqZWN0LnZhbHVlcyhlbCkuc29tZSh2ID0+IHR5cGVvZiB2ID09PSAnc3RyaW5nJyAmJiBbJ0NBMTUwJywgJ1JFU1QnXS5pbmNsdWRlcyh2LnRvVXBwZXJDYXNlKCkpKTtcbiAgICAgICAgICBjb25zdCBpc0d1aSA9IFsnQ0ExMDAnLCAnR1VJJ10uaW5jbHVkZXMoKGVsLnR5cGUgfHwgJycpLnRvVXBwZXJDYXNlKCkpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBPYmplY3QudmFsdWVzKGVsKS5zb21lKHYgPT4gdHlwZW9mIHYgPT09ICdzdHJpbmcnICYmIFsnQ0ExMDAnLCAnR1VJJ10uaW5jbHVkZXModi50b1VwcGVyQ2FzZSgpKSk7XG5cbiAgICAgICAgICBjb25zdCBmaW5hbENvbG9yID0gaXNTZWxlY3RlZCA/IGFwcFNldHRpbmdzLnNlbGVjdGlvbkNvbG9yIDogKGlzUmVzdCB8fCBpc0d1aSA/ICcjMjJjNTVlJyA6IChjb2xvciA9PT0gJyMzYjgyZjYnID8gJyM5NGEzYjgnIDogY29sb3IpKTtcblxuICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8Z3JvdXAga2V5PXtgc3VwcC0ke2l9YH0gcG9zaXRpb249e21pZH0gcXVhdGVybmlvbj17cXVhdH0gb25Qb2ludGVyRG93bj17aGFuZGxlU2VsZWN0fT5cbiAgICAgICAgICAgICAgey8qIFN1cHBvcnQgcmVuZGVyaW5nOiBVcCBhcnJvdywgcG9zaXRpb25lZCBiZWxvdyB0aGUgcGlwZSAoQm9yZS8yICsgaGFsZiBzdXBwb3J0IGhlaWdodCkgKi99XG4gICAgICAgICAgICAgIDxncm91cCBwb3NpdGlvbj17WzAsIC0ociArIGRpc3QgLyAyKSwgMF19PlxuICAgICAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXtbMCwgZGlzdCAvIDQsIDBdfT5cbiAgICAgICAgICAgICAgICAgIDxjeWxpbmRlckdlb21ldHJ5IGFyZ3M9e1swLCByICogMiwgZGlzdCAvIDIsIDhdfSAvPlxuICAgICAgICAgICAgICAgICAgPG1lc2hTdGFuZGFyZE1hdGVyaWFsIGNvbG9yPXtmaW5hbENvbG9yfSB0cmFuc3BhcmVudD17aXNUcmFuc2x1Y2VudH0gb3BhY2l0eT17aXNUcmFuc2x1Y2VudCA/IDAuMyA6IDF9IGRlcHRoV3JpdGU9eyFpc1RyYW5zbHVjZW50fSAvPlxuICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17WzAsIC1kaXN0IC8gNCwgMF19PlxuICAgICAgICAgICAgICAgICAgIDxjeWxpbmRlckdlb21ldHJ5IGFyZ3M9e1tyLCByLCBkaXN0IC8gMiwgOF19IC8+XG4gICAgICAgICAgICAgICAgICAgPG1lc2hTdGFuZGFyZE1hdGVyaWFsIGNvbG9yPXtmaW5hbENvbG9yfSB0cmFuc3BhcmVudD17aXNUcmFuc2x1Y2VudH0gb3BhY2l0eT17aXNUcmFuc2x1Y2VudCA/IDAuMyA6IDF9IGRlcHRoV3JpdGU9eyFpc1RyYW5zbHVjZW50fSAvPlxuICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgPC9ncm91cD5cblxuICAgICAgICAgICAgICB7LyogTGF0ZXJhbCBBcnJvd3MgZm9yIENBMTAwIC8gR3VpICovfVxuICAgICAgICAgICAgICB7aXNHdWkgJiYgKFxuICAgICAgICAgICAgICAgIDw+XG4gICAgICAgICAgICAgICAgICB7LyogTGVmdCBsYXRlcmFsIGFycm93ICovfVxuICAgICAgICAgICAgICAgICAgPGdyb3VwIHBvc2l0aW9uPXtbciArIGRpc3QvNCwgMCwgMF19IHJvdGF0aW9uPXtbMCwgMCwgTWF0aC5QSSAvIDJdfT5cbiAgICAgICAgICAgICAgICAgICAgPG1lc2ggcG9zaXRpb249e1swLCBkaXN0LzQsIDBdfT5cbiAgICAgICAgICAgICAgICAgICAgICAgPGN5bGluZGVyR2VvbWV0cnkgYXJncz17WzAsIHIgKiAxLjUsIGRpc3QgLyAyLCA4XX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgPG1lc2hTdGFuZGFyZE1hdGVyaWFsIGNvbG9yPXtmaW5hbENvbG9yfSB0cmFuc3BhcmVudD17aXNUcmFuc2x1Y2VudH0gb3BhY2l0eT17aXNUcmFuc2x1Y2VudCA/IDAuMyA6IDF9IGRlcHRoV3JpdGU9eyFpc1RyYW5zbHVjZW50fSAvPlxuICAgICAgICAgICAgICAgICAgICA8L21lc2g+XG4gICAgICAgICAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXtbMCwgLWRpc3QvNCwgMF19PlxuICAgICAgICAgICAgICAgICAgICAgICA8Y3lsaW5kZXJHZW9tZXRyeSBhcmdzPXtbciwgciwgZGlzdCAvIDIsIDhdfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICA8bWVzaFN0YW5kYXJkTWF0ZXJpYWwgY29sb3I9e2ZpbmFsQ29sb3J9IHRyYW5zcGFyZW50PXtpc1RyYW5zbHVjZW50fSBvcGFjaXR5PXtpc1RyYW5zbHVjZW50ID8gMC4zIDogMX0gZGVwdGhXcml0ZT17IWlzVHJhbnNsdWNlbnR9IC8+XG4gICAgICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgICAgIDwvZ3JvdXA+XG5cbiAgICAgICAgICAgICAgICAgIHsvKiBSaWdodCBsYXRlcmFsIGFycm93ICovfVxuICAgICAgICAgICAgICAgICAgPGdyb3VwIHBvc2l0aW9uPXtbLShyICsgZGlzdC80KSwgMCwgMF19IHJvdGF0aW9uPXtbMCwgMCwgLU1hdGguUEkgLyAyXX0+XG4gICAgICAgICAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXtbMCwgZGlzdC80LCAwXX0+XG4gICAgICAgICAgICAgICAgICAgICAgIDxjeWxpbmRlckdlb21ldHJ5IGFyZ3M9e1swLCByICogMS41LCBkaXN0IC8gMiwgOF19IC8+XG4gICAgICAgICAgICAgICAgICAgICAgIDxtZXNoU3RhbmRhcmRNYXRlcmlhbCBjb2xvcj17ZmluYWxDb2xvcn0gdHJhbnNwYXJlbnQ9e2lzVHJhbnNsdWNlbnR9IG9wYWNpdHk9e2lzVHJhbnNsdWNlbnQgPyAwLjMgOiAxfSBkZXB0aFdyaXRlPXshaXNUcmFuc2x1Y2VudH0gLz5cbiAgICAgICAgICAgICAgICAgICAgPC9tZXNoPlxuICAgICAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17WzAsIC1kaXN0LzQsIDBdfT5cbiAgICAgICAgICAgICAgICAgICAgICAgPGN5bGluZGVyR2VvbWV0cnkgYXJncz17W3IsIHIsIGRpc3QgLyAyLCA4XX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgPG1lc2hTdGFuZGFyZE1hdGVyaWFsIGNvbG9yPXtmaW5hbENvbG9yfSB0cmFuc3BhcmVudD17aXNUcmFuc2x1Y2VudH0gb3BhY2l0eT17aXNUcmFuc2x1Y2VudCA/IDAuMyA6IDF9IGRlcHRoV3JpdGU9eyFpc1RyYW5zbHVjZW50fSAvPlxuICAgICAgICAgICAgICAgICAgICA8L21lc2g+XG4gICAgICAgICAgICAgICAgICA8L2dyb3VwPlxuICAgICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgPC9ncm91cD5cbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmFsbGJhY2s6IGdlbmVyaWMgY3lsaW5kZXJcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICA8bWVzaCBrZXk9e2BpbS0ke2l9YH0gcG9zaXRpb249e21pZH0gcXVhdGVybmlvbj17cXVhdH0gb25Qb2ludGVyRG93bj17aGFuZGxlU2VsZWN0fT5cbiAgICAgICAgICAgIDxjeWxpbmRlckdlb21ldHJ5IGFyZ3M9e1tyLCByLCBkaXN0LCAxNl19IC8+XG4gICAgICAgICAgICA8bWVzaFN0YW5kYXJkTWF0ZXJpYWwgY29sb3I9e2lzU2VsZWN0ZWQgPyBhcHBTZXR0aW5ncy5zZWxlY3Rpb25Db2xvciA6IGNvbG9yfSB0cmFuc3BhcmVudD17aXNUcmFuc2x1Y2VudH0gb3BhY2l0eT17aXNUcmFuc2x1Y2VudCA/IDAuMyA6IDF9IGRlcHRoV3JpdGU9eyFpc1RyYW5zbHVjZW50fSAvPlxuICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgKTtcbiAgICAgIH0pfVxuICAgIDwvZ3JvdXA+XG4gICk7XG59O1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBHaG9zdCBvdmVybGF5OiB3aXJlZnJhbWUgb2YgdGhlIGVsZW1lbnQocykgYWZmZWN0ZWRcbi8vIGJ5IHRoZSBjdXJyZW50bHktYWN0aXZlIHByb3Bvc2FsXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jb25zdCBHaG9zdE92ZXJsYXkgPSAoeyBhY3RpdmVQcm9wb3NhbCB9KSA9PiB7XG4gIGNvbnN0IGFwcFNldHRpbmdzID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuYXBwU2V0dGluZ3MpO1xuICBpZiAoIWFjdGl2ZVByb3Bvc2FsKSByZXR1cm4gbnVsbDtcblxuICBjb25zdCBlbGVtZW50cyA9IFthY3RpdmVQcm9wb3NhbC5lbGVtZW50QSwgYWN0aXZlUHJvcG9zYWwuZWxlbWVudEJdLmZpbHRlcihCb29sZWFuKTtcblxuICByZXR1cm4gKFxuICAgIDxncm91cD5cbiAgICAgIHtlbGVtZW50cy5tYXAoKGVsLCBpKSA9PiB7XG4gICAgICAgIGlmICghZWwuZXAxIHx8ICFlbC5lcDIpIHJldHVybiBudWxsO1xuICAgICAgICBjb25zdCB2ZWNBID0gbmV3IFRIUkVFLlZlY3RvcjMoZWwuZXAxLngsIGVsLmVwMS55LCBlbC5lcDEueik7XG4gICAgICAgIGNvbnN0IHZlY0IgPSBuZXcgVEhSRUUuVmVjdG9yMyhlbC5lcDIueCwgZWwuZXAyLnksIGVsLmVwMi56KTtcbiAgICAgICAgY29uc3QgZGlzdCA9IHZlY0EuZGlzdGFuY2VUbyh2ZWNCKTtcbiAgICAgICAgaWYgKGRpc3QgPCAwLjAwMSkgcmV0dXJuIG51bGw7XG4gICAgICAgIGNvbnN0IG1pZCAgPSB2ZWNBLmNsb25lKCkubGVycCh2ZWNCLCAwLjUpO1xuICAgICAgICBjb25zdCBkaXIgID0gdmVjQi5jbG9uZSgpLnN1Yih2ZWNBKS5ub3JtYWxpemUoKTtcbiAgICAgICAgY29uc3QgcXVhdCA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCkuc2V0RnJvbVVuaXRWZWN0b3JzKG5ldyBUSFJFRS5WZWN0b3IzKDAsMSwwKSwgZGlyKTtcbiAgICAgICAgY29uc3QgciAgICA9IGVsLmJvcmUgPyBlbC5ib3JlIC8gMiA6IDU7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgPG1lc2gga2V5PXtgZ2hvc3QtJHtpfWB9IHBvc2l0aW9uPXttaWR9IHF1YXRlcm5pb249e3F1YXR9PlxuICAgICAgICAgICAgPGN5bGluZGVyR2VvbWV0cnkgYXJncz17W3IgKiAxLjA1LCByICogMS4wNSwgZGlzdCwgMTZdfSAvPlxuICAgICAgICAgICAgey8qIEZhaW50IGhpZ2hsaWdodCB0byBzaG93IG9yaWdpbmFsIHBvc2l0aW9uICovfVxuICAgICAgICAgICAgPG1lc2hCYXNpY01hdGVyaWFsIGNvbG9yPXthcHBTZXR0aW5ncy5zZWxlY3Rpb25Db2xvcn0gb3BhY2l0eT17MC4zfSB0cmFuc3BhcmVudCBkZXB0aFdyaXRlPXtmYWxzZX0gLz5cbiAgICAgICAgICA8L21lc2g+XG4gICAgICAgICk7XG4gICAgICB9KX1cbiAgICA8L2dyb3VwPlxuICApO1xufTtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gR2FwL1Byb3Bvc2FsIE1hcCBQaW4gVmlzdWFsaXphdGlvblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBBY3RpdmUgSXNzdWUgTWFwIFBpbiBWaXN1YWxpemF0aW9uXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jb25zdCBJc3N1ZU1hcFBpbiA9ICh7IGFjdGl2ZUlzc3VlIH0pID0+IHtcbiAgaWYgKCFhY3RpdmVJc3N1ZSkgcmV0dXJuIG51bGw7XG5cbiAgbGV0IHBvcyA9IG51bGw7XG4gIGxldCBsYWJlbCA9IFwiXCI7XG4gIGxldCBjb2xvciA9IFwiI2VmNDQ0NFwiOyAvLyByZWQgZm9yIHZhbGlkYXRpb25cblxuICBpZiAoYWN0aXZlSXNzdWUudHlwZSA9PT0gJ3ZhbGlkYXRpb24nICYmIGFjdGl2ZUlzc3VlLmRhdGEuZXAxKSB7XG4gICAgICBwb3MgPSBbYWN0aXZlSXNzdWUuZGF0YS5lcDEueCwgYWN0aXZlSXNzdWUuZGF0YS5lcDEueSwgYWN0aXZlSXNzdWUuZGF0YS5lcDEuel07XG4gICAgICBsYWJlbCA9IGBSb3cgJHthY3RpdmVJc3N1ZS5kYXRhLl9yb3dJbmRleH1gO1xuICB9IGVsc2UgaWYgKGFjdGl2ZUlzc3VlLnR5cGUgPT09ICdwcm9wb3NhbCcpIHtcbiAgICAgIGNvbnN0IHByb3AgPSBhY3RpdmVJc3N1ZS5kYXRhO1xuICAgICAgaWYgKHByb3AucHRBICYmIHByb3AucHRCKSB7XG4gICAgICAgICAgcG9zID0gWyhwcm9wLnB0QS54ICsgcHJvcC5wdEIueCkvMiwgKHByb3AucHRBLnkgKyBwcm9wLnB0Qi55KS8yLCAocHJvcC5wdEEueiArIHByb3AucHRCLnopLzJdO1xuICAgICAgfSBlbHNlIGlmIChwcm9wLmVsZW1lbnRBICYmIHByb3AuZWxlbWVudEEuZXAxKSB7XG4gICAgICAgICAgcG9zID0gW3Byb3AuZWxlbWVudEEuZXAxLngsIHByb3AuZWxlbWVudEEuZXAxLnksIHByb3AuZWxlbWVudEEuZXAxLnpdO1xuICAgICAgfVxuICAgICAgbGFiZWwgPSBgUm93ICR7cHJvcC5lbGVtZW50QT8uX3Jvd0luZGV4fWA7XG4gICAgICBjb2xvciA9IFwiIzNiODJmNlwiOyAvLyBibHVlIGZvciBwcm9wb3NhbFxuICB9XG5cbiAgaWYgKCFwb3MpIHJldHVybiBudWxsO1xuXG4gIHJldHVybiAoXG4gICAgPGdyb3VwIHBvc2l0aW9uPXtwb3N9PlxuICAgICAgICB7LyogUGluIEdlb21ldHJ5ICovfVxuICAgICAgICA8bWVzaCBwb3NpdGlvbj17WzAsIDE1MCwgMF19PlxuICAgICAgICAgICAgPHNwaGVyZUdlb21ldHJ5IGFyZ3M9e1s1MCwgMTYsIDE2XX0gLz5cbiAgICAgICAgICAgIDxtZXNoQmFzaWNNYXRlcmlhbCBjb2xvcj17Y29sb3J9IC8+XG4gICAgICAgIDwvbWVzaD5cbiAgICAgICAgPG1lc2ggcG9zaXRpb249e1swLCA3NSwgMF19PlxuICAgICAgICAgICAgPGNvbmVHZW9tZXRyeSBhcmdzPXtbNTAsIDE1MCwgMTZdfSByb3RhdGlvbj17W01hdGguUEksIDAsIDBdfSAvPlxuICAgICAgICAgICAgPG1lc2hCYXNpY01hdGVyaWFsIGNvbG9yPXtjb2xvcn0gLz5cbiAgICAgICAgPC9tZXNoPlxuXG4gICAgICAgIHsvKiBMYWJlbCBCYWNrZ3JvdW5kICovfVxuICAgICAgICA8bWVzaCBwb3NpdGlvbj17WzAsIDI1MCwgMF19PlxuICAgICAgICAgICAgPHBsYW5lR2VvbWV0cnkgYXJncz17WzMwMCwgMTAwXX0gLz5cbiAgICAgICAgICAgIDxtZXNoQmFzaWNNYXRlcmlhbCBjb2xvcj1cIndoaXRlXCIgc2lkZT17VEhSRUUuRG91YmxlU2lkZX0gLz5cbiAgICAgICAgPC9tZXNoPlxuXG4gICAgICAgIHsvKiBMYWJlbCBUZXh0ICovfVxuICAgICAgICA8VGV4dFxuICAgICAgICAgICAgcG9zaXRpb249e1swLCAyNTAsIDFdfVxuICAgICAgICAgICAgY29sb3I9XCJibGFja1wiXG4gICAgICAgICAgICBmb250U2l6ZT17NjB9XG4gICAgICAgICAgICBhbmNob3JYPVwiY2VudGVyXCJcbiAgICAgICAgICAgIGFuY2hvclk9XCJtaWRkbGVcIlxuICAgICAgICAgICAgb3V0bGluZVdpZHRoPXsyfVxuICAgICAgICAgICAgb3V0bGluZUNvbG9yPVwid2hpdGVcIlxuICAgICAgICAgICAgZm9udFdlaWdodD1cImJvbGRcIlxuICAgICAgICA+XG4gICAgICAgICAgICB7bGFiZWx9XG4gICAgICAgIDwvVGV4dD5cbiAgICA8L2dyb3VwPlxuICApO1xufTtcblxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBTbWFydCBGaXggUHJvcG9zYWwgUmVuZGVyaW5nXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jb25zdCBQcm9wb3NhbE92ZXJsYXkgPSAoeyBwcm9wb3NhbCB9KSA9PiB7XG4gICAgaWYgKCFwcm9wb3NhbCB8fCAhcHJvcG9zYWwucHRBIHx8ICFwcm9wb3NhbC5wdEIpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgdmVjQSA9IG5ldyBUSFJFRS5WZWN0b3IzKHByb3Bvc2FsLnB0QS54LCBwcm9wb3NhbC5wdEEueSwgcHJvcG9zYWwucHRBLnopO1xuICAgIGNvbnN0IHZlY0IgPSBuZXcgVEhSRUUuVmVjdG9yMyhwcm9wb3NhbC5wdEIueCwgcHJvcG9zYWwucHRCLnksIHByb3Bvc2FsLnB0Qi56KTtcbiAgICBjb25zdCBtaWQgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmFkZFZlY3RvcnModmVjQSwgdmVjQikubXVsdGlwbHlTY2FsYXIoMC41KTtcbiAgICBjb25zdCBkaXN0ID0gdmVjQS5kaXN0YW5jZVRvKHZlY0IpO1xuXG4gICAgLy8gQ29sb3IgYmFzZWQgb24gYWN0aW9uXG4gICAgY29uc3QgYWN0aW9uID0gcHJvcG9zYWwuZml4VHlwZSB8fCBwcm9wb3NhbC5hY3Rpb24gfHwgJyc7XG5cbiAgICAvLyBVc2VyIHJlcXVlc3RlZDogR0FQX0ZJTEwgKFBpcGUgRmlsbCkgPSBSZWQgdHJhbnNsdWNlbnQsIFRSSU0gKFBpcGUgVHJpbSkgPSBCbHVlIHRyYW5zbHVjZW50XG4gICAgbGV0IGNvbG9yID0gJyNmNTllMGInOyAvLyBhbWJlciBkZWZhdWx0XG4gICAgaWYgKGFjdGlvbiA9PT0gJ0dBUF9GSUxMJykgY29sb3IgPSAnI2VmNDQ0NCc7IC8vIHJlZFxuICAgIGlmIChhY3Rpb24uaW5jbHVkZXMoJ1RSSU0nKSkgY29sb3IgPSAnIzNiODJmNic7IC8vIGJsdWVcbiAgICBpZiAoYWN0aW9uID09PSAnR0FQX1NUUkVUQ0hfUElQRScgfHwgYWN0aW9uID09PSAnR0FQX1NOQVBfSU1NVVRBQkxFX0JMT0NLJykgY29sb3IgPSAnIzEwYjk4MSc7IC8vIGdyZWVuXG5cbiAgICAvLyBDeWxpbmRlciBvcmllbnRhdGlvblxuICAgIGNvbnN0IGRpciA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuc3ViVmVjdG9ycyh2ZWNCLCB2ZWNBKS5ub3JtYWxpemUoKTtcbiAgICBjb25zdCB1cCA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApO1xuICAgIGNvbnN0IHF1YXRlcm5pb24gPSBuZXcgVEhSRUUuUXVhdGVybmlvbigpLnNldEZyb21Vbml0VmVjdG9ycyh1cCwgZGlyKTtcbiAgICBjb25zdCBib3JlID0gcHJvcG9zYWwuZWxlbWVudEE/LmJvcmUgfHwgcHJvcG9zYWwuZWxlbWVudEI/LmJvcmUgfHwgNTA7XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8Z3JvdXA+XG4gICAgICAgICAgICA8TGluZSBwb2ludHM9e1t2ZWNBLCB2ZWNCXX0gY29sb3I9e2NvbG9yfSBsaW5lV2lkdGg9ezN9IGRhc2hlZCBkYXNoU2NhbGU9ezEwfSBkYXNoU2l6ZT17MTB9IGdhcFNpemU9ezEwfSAvPlxuXG4gICAgICAgICAgICB7LyogVHJhbnNsdWNlbnQgQ3lsaW5kZXIgZm9yIFBpcGUgRmlsbC9UcmltICovfVxuICAgICAgICAgICAgPG1lc2ggcG9zaXRpb249e21pZH0gcXVhdGVybmlvbj17cXVhdGVybmlvbn0+XG4gICAgICAgICAgICAgICAgPGN5bGluZGVyR2VvbWV0cnkgYXJncz17W2JvcmUgLyAyLCBib3JlIC8gMiwgZGlzdCwgMTZdfSAvPlxuICAgICAgICAgICAgICAgIDxtZXNoU3RhbmRhcmRNYXRlcmlhbCBjb2xvcj17Y29sb3J9IG9wYWNpdHk9ezAuNX0gdHJhbnNwYXJlbnQgZGVwdGhXcml0ZT17ZmFsc2V9IHNpZGU9e1RIUkVFLkRvdWJsZVNpZGV9IC8+XG4gICAgICAgICAgICA8L21lc2g+XG5cbiAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXt2ZWNBfT5cbiAgICAgICAgICAgICAgICA8c3BoZXJlR2VvbWV0cnkgYXJncz17W2JvcmUgLyAyICsgMiwgOCwgOF19IC8+XG4gICAgICAgICAgICAgICAgPG1lc2hCYXNpY01hdGVyaWFsIGNvbG9yPXtjb2xvcn0gLz5cbiAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXt2ZWNCfT5cbiAgICAgICAgICAgICAgICA8c3BoZXJlR2VvbWV0cnkgYXJncz17W2JvcmUgLyAyICsgMiwgOCwgOF19IC8+XG4gICAgICAgICAgICAgICAgPG1lc2hCYXNpY01hdGVyaWFsIGNvbG9yPXtjb2xvcn0gLz5cbiAgICAgICAgICAgIDwvbWVzaD5cblxuICAgICAgICAgICAgPG1lc2ggcG9zaXRpb249e21pZH0+XG4gICAgICAgICAgICAgICAgPHBsYW5lR2VvbWV0cnkgYXJncz17WzMwMCwgODBdfSAvPlxuICAgICAgICAgICAgICAgIDxtZXNoQmFzaWNNYXRlcmlhbCBjb2xvcj1cIiMxZTI5M2JcIiBzaWRlPXtUSFJFRS5Eb3VibGVTaWRlfSBvcGFjaXR5PXswLjh9IHRyYW5zcGFyZW50IC8+XG4gICAgICAgICAgICA8L21lc2g+XG4gICAgICAgICAgICA8VGV4dFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uPXtbbWlkLngsIG1pZC55LCBtaWQueiArIDFdfVxuICAgICAgICAgICAgICAgIGNvbG9yPXtjb2xvcn1cbiAgICAgICAgICAgICAgICBmb250U2l6ZT17MzV9XG4gICAgICAgICAgICAgICAgYW5jaG9yWD1cImNlbnRlclwiXG4gICAgICAgICAgICAgICAgYW5jaG9yWT1cIm1pZGRsZVwiXG4gICAgICAgICAgICAgICAgb3V0bGluZVdpZHRoPXsxfVxuICAgICAgICAgICAgICAgIG91dGxpbmVDb2xvcj1cIiMwZjE3MmFcIlxuICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgIHthY3Rpb259ICh7ZGlzdC50b0ZpeGVkKDEpfW1tKVxuICAgICAgICAgICAgPC9UZXh0PlxuICAgICAgICA8L2dyb3VwPlxuICAgICk7XG59O1xuXG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFNpbmdsZSBJc3N1ZSBOYXZpZ2F0aW9uIFBhbmVsXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jb25zdCBTaW5nbGVJc3N1ZVBhbmVsID0gKHsgcHJvcG9zYWxzLCB2YWxpZGF0aW9uSXNzdWVzLCBjdXJyZW50SXNzdWVJbmRleCwgc2V0Q3VycmVudElzc3VlSW5kZXgsIG9uQXV0b0NlbnRlciwgb25BcHByb3ZlLCBvblJlamVjdCB9KSA9PiB7XG4gICAgY29uc3QgYWxsSXNzdWVzID0gW1xuICAgICAgICAuLi4odmFsaWRhdGlvbklzc3VlcyB8fCBbXSkubWFwKGkgPT4gKHsgdHlwZTogJ3ZhbGlkYXRpb24nLCBkYXRhOiBpIH0pKSxcbiAgICAgICAgLi4uKHByb3Bvc2FscyB8fCBbXSkubWFwKHAgPT4gKHsgdHlwZTogJ3Byb3Bvc2FsJywgZGF0YTogcCB9KSlcbiAgICBdO1xuXG4gICAgY29uc3Qgc2FmZUluZGV4ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oY3VycmVudElzc3VlSW5kZXgsIGFsbElzc3Vlcy5sZW5ndGggLSAxKSk7XG4gICAgY29uc3QgY3VycmVudEl0ZW0gPSBhbGxJc3N1ZXNbc2FmZUluZGV4XTtcblxuICAgIC8vIERyYWdnYWJsZSBzdGF0ZSB1c2luZyBzaW1wbGUgYWJzb2x1dGUgcG9zaXRpb25pbmdcbiAgICBjb25zdCBbcG9zLCBzZXRQb3NdID0gdXNlU3RhdGUoeyB4OiAwLCB5OiAwIH0pOyAvLyBOb3RlOiBXZSBoYW5kbGUgc2V0dGluZyB0aGlzIGR5bmFtaWNhbGx5XG4gICAgY29uc3QgW2lzRHJhZ2dpbmcsIHNldElzRHJhZ2dpbmddID0gdXNlU3RhdGUoZmFsc2UpO1xuICAgIGNvbnN0IFtkcmFnT2Zmc2V0LCBzZXREcmFnT2Zmc2V0XSA9IHVzZVN0YXRlKHsgeDogMCwgeTogMCB9KTtcbiAgICBjb25zdCBwYW5lbFJlZiA9IHVzZVJlZihudWxsKTtcblxuICAgIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgICAgIGlmIChhbGxJc3N1ZXMubGVuZ3RoID4gMCAmJiBvbkF1dG9DZW50ZXIpIHtcbiAgICAgICAgICAgIG9uQXV0b0NlbnRlcigpO1xuICAgICAgICB9XG4gICAgfSwgW3NhZmVJbmRleCwgYWxsSXNzdWVzLmxlbmd0aCwgb25BdXRvQ2VudGVyXSk7XG5cbiAgICAvLyBJbml0aWFsaXplIHBvc2l0aW9uIHRvIGJvdHRvbSBjZW50ZXIgb25jZVxuICAgIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgICAgIGlmIChwYW5lbFJlZi5jdXJyZW50ICYmIHBvcy54ID09PSAwICYmIHBvcy55ID09PSAwKSB7XG4gICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gcGFuZWxSZWYuY3VycmVudC5wYXJlbnRFbGVtZW50O1xuICAgICAgICAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgICAgICAgICAgY29uc3QgcFJlY3QgPSBwYXJlbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgICAgICAgICAgIGNvbnN0IGNSZWN0ID0gcGFuZWxSZWYuY3VycmVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgICAgICAgICAgc2V0UG9zKHtcbiAgICAgICAgICAgICAgICAgICAgIHg6IChwUmVjdC53aWR0aCAvIDIpIC0gKGNSZWN0LndpZHRoIC8gMiksXG4gICAgICAgICAgICAgICAgICAgICB5OiBwUmVjdC5oZWlnaHQgLSBjUmVjdC5oZWlnaHQgLSAzMiAvLyAzMnB4IGZyb20gYm90dG9tIChib3R0b20tOClcbiAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSwgW3Bvcy54LCBwb3MueV0pO1xuXG4gICAgaWYgKGFsbElzc3Vlcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgaGFuZGxlUHJldiA9ICgpID0+IHNldEN1cnJlbnRJc3N1ZUluZGV4KE1hdGgubWF4KDAsIGN1cnJlbnRJc3N1ZUluZGV4IC0gMSkpO1xuICAgIGNvbnN0IGhhbmRsZU5leHQgPSAoKSA9PiBzZXRDdXJyZW50SXNzdWVJbmRleChNYXRoLm1pbihhbGxJc3N1ZXMubGVuZ3RoIC0gMSwgY3VycmVudElzc3VlSW5kZXggKyAxKSk7XG5cbiAgICBjb25zdCBoYW5kbGVQb2ludGVyRG93biA9IChlKSA9PiB7XG4gICAgICAgIHNldElzRHJhZ2dpbmcodHJ1ZSk7XG4gICAgICAgIGNvbnN0IHJlY3QgPSBwYW5lbFJlZi5jdXJyZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICAvLyBDYWxjdWxhdGUgb2Zmc2V0IGZyb20gdGhlIHRvcC1sZWZ0IG9mIHRoZSBwYW5lbFxuICAgICAgICBzZXREcmFnT2Zmc2V0KHtcbiAgICAgICAgICAgIHg6IGUuY2xpZW50WCAtIHJlY3QubGVmdCxcbiAgICAgICAgICAgIHk6IGUuY2xpZW50WSAtIHJlY3QudG9wXG4gICAgICAgIH0pO1xuICAgICAgICBlLnRhcmdldC5zZXRQb2ludGVyQ2FwdHVyZShlLnBvaW50ZXJJZCk7XG4gICAgfTtcblxuICAgIGNvbnN0IGhhbmRsZVBvaW50ZXJNb3ZlID0gKGUpID0+IHtcbiAgICAgICAgaWYgKCFpc0RyYWdnaW5nIHx8ICFwYW5lbFJlZi5jdXJyZW50KSByZXR1cm47XG4gICAgICAgIGNvbnN0IHBhcmVudCA9IHBhbmVsUmVmLmN1cnJlbnQucGFyZW50RWxlbWVudDtcbiAgICAgICAgaWYgKCFwYXJlbnQpIHJldHVybjtcblxuICAgICAgICBjb25zdCBwUmVjdCA9IHBhcmVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblxuICAgICAgICAvLyBDYWxjdWxhdGUgbmV3IFgsIFkgcmVsYXRpdmUgdG8gdGhlIHBhcmVudCBjb250YWluZXJcbiAgICAgICAgbGV0IG5ld1ggPSBlLmNsaWVudFggLSBwUmVjdC5sZWZ0IC0gZHJhZ09mZnNldC54O1xuICAgICAgICBsZXQgbmV3WSA9IGUuY2xpZW50WSAtIHBSZWN0LnRvcCAtIGRyYWdPZmZzZXQueTtcblxuICAgICAgICAvLyBPcHRpb25hbCBib3VuZGluZyBib3hcbiAgICAgICAgbmV3WCA9IE1hdGgubWF4KDAsIE1hdGgubWluKG5ld1gsIHBSZWN0LndpZHRoIC0gcGFuZWxSZWYuY3VycmVudC5vZmZzZXRXaWR0aCkpO1xuICAgICAgICBuZXdZID0gTWF0aC5tYXgoMCwgTWF0aC5taW4obmV3WSwgcFJlY3QuaGVpZ2h0IC0gcGFuZWxSZWYuY3VycmVudC5vZmZzZXRIZWlnaHQpKTtcblxuICAgICAgICBzZXRQb3MoeyB4OiBuZXdYLCB5OiBuZXdZIH0pO1xuICAgIH07XG5cbiAgICBjb25zdCBoYW5kbGVQb2ludGVyVXAgPSAoZSkgPT4ge1xuICAgICAgICBzZXRJc0RyYWdnaW5nKGZhbHNlKTtcbiAgICAgICAgZS50YXJnZXQucmVsZWFzZVBvaW50ZXJDYXB0dXJlKGUucG9pbnRlcklkKTtcbiAgICB9O1xuXG4gICAgLy8gSWYgcG9zIGlzIHN0aWxsIDAsMCwgYXBwbHkgYSBDU1MgY2xhc3MgZm9yIGNlbnRlcmluZywgb3RoZXJ3aXNlIHVzZSBhYnNvbHV0ZSB0b3AvbGVmdFxuICAgIGNvbnN0IHN0eWxlID0gKHBvcy54ICE9PSAwIHx8IHBvcy55ICE9PSAwKVxuICAgICAgICA/IHsgbGVmdDogcG9zLngsIHRvcDogcG9zLnkgfVxuICAgICAgICA6IHsgYm90dG9tOiAnMnJlbScsIGxlZnQ6ICc1MCUnLCB0cmFuc2Zvcm06ICd0cmFuc2xhdGVYKC01MCUpJyB9O1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGRpdlxuICAgICAgICAgICAgcmVmPXtwYW5lbFJlZn1cbiAgICAgICAgICAgIHN0eWxlPXtzdHlsZX1cbiAgICAgICAgICAgIGNsYXNzTmFtZT1cImFic29sdXRlIHotMjAgdy05NiBiZy1zbGF0ZS05MDAvOTUgYm9yZGVyIGJvcmRlci1zbGF0ZS03MDAgcm91bmRlZC14bCBzaGFkb3ctMnhsIGJhY2tkcm9wLWJsdXItbWQgb3ZlcmZsb3ctaGlkZGVuXCJcbiAgICAgICAgPlxuICAgICAgICAgICAgey8qIEhlYWRlciAvIERyYWcgSGFuZGxlICovfVxuICAgICAgICAgICAgPGRpdlxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBweC00IHB5LTIgYmctc2xhdGUtODAwLzgwIGJvcmRlci1iIGJvcmRlci1zbGF0ZS03MDAgY3Vyc29yLW1vdmVcIlxuICAgICAgICAgICAgICAgIG9uUG9pbnRlckRvd249e2hhbmRsZVBvaW50ZXJEb3dufVxuICAgICAgICAgICAgICAgIG9uUG9pbnRlck1vdmU9e2hhbmRsZVBvaW50ZXJNb3ZlfVxuICAgICAgICAgICAgICAgIG9uUG9pbnRlclVwPXtoYW5kbGVQb2ludGVyVXB9XG4gICAgICAgICAgICAgICAgb25Qb2ludGVyQ2FuY2VsPXtoYW5kbGVQb2ludGVyVXB9XG4gICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMiBwb2ludGVyLWV2ZW50cy1ub25lXCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQtc2xhdGUtMzAwIGZvbnQtYm9sZCB0ZXh0LXNtXCI+SXNzdWUge3NhZmVJbmRleCArIDF9IG9mIHthbGxJc3N1ZXMubGVuZ3RofTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZ2FwLTFcIj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXtoYW5kbGVQcmV2fSBkaXNhYmxlZD17Y3VycmVudElzc3VlSW5kZXggPT09IDB9IGNsYXNzTmFtZT1cInAtMSByb3VuZGVkIGhvdmVyOmJnLXNsYXRlLTcwMCBkaXNhYmxlZDpvcGFjaXR5LTMwIHRyYW5zaXRpb25cIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHdpZHRoPVwiMThcIiBoZWlnaHQ9XCIxOFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiIHN0cm9rZUxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZUxpbmVqb2luPVwicm91bmRcIiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTMwMFwiPjxwYXRoIGQ9XCJtMTUgMTgtNi02IDYtNlwiLz48L3N2Zz5cbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gb25DbGljaz17b25BdXRvQ2VudGVyfSBjbGFzc05hbWU9XCJwLTEgcm91bmRlZCBob3ZlcjpiZy1zbGF0ZS03MDAgdHJhbnNpdGlvblwiIHRpdGxlPVwiRm9jdXMgQ2FtZXJhXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2VXaWR0aD1cIjJcIiBzdHJva2VMaW5lY2FwPVwicm91bmRcIiBzdHJva2VMaW5lam9pbj1cInJvdW5kXCIgY2xhc3NOYW1lPVwidGV4dC1ibHVlLTQwMFwiPjxjaXJjbGUgY3g9XCIxMVwiIGN5PVwiMTFcIiByPVwiOFwiLz48cGF0aCBkPVwibTIxIDIxLTQuMy00LjNcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e2hhbmRsZU5leHR9IGRpc2FibGVkPXtjdXJyZW50SXNzdWVJbmRleCA9PT0gYWxsSXNzdWVzLmxlbmd0aCAtIDF9IGNsYXNzTmFtZT1cInAtMSByb3VuZGVkIGhvdmVyOmJnLXNsYXRlLTcwMCBkaXNhYmxlZDpvcGFjaXR5LTMwIHRyYW5zaXRpb25cIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHdpZHRoPVwiMThcIiBoZWlnaHQ9XCIxOFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiIHN0cm9rZUxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZUxpbmVqb2luPVwicm91bmRcIiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTMwMFwiPjxwYXRoIGQ9XCJtOSAxOCA2LTYtNi02XCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICB7LyogQ29udGVudCBCb2R5ICovfVxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJwLTRcIj5cbiAgICAgICAgICAgICAgICB7Y3VycmVudEl0ZW0udHlwZSA9PT0gJ3ZhbGlkYXRpb24nID8gKFxuICAgICAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gbWItMlwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQteHMgZm9udC1ib2xkIHRleHQtcmVkLTQwMCB1cHBlcmNhc2UgdHJhY2tpbmctd2lkZXN0IHB4LTIgcHktMC41IGJnLXJlZC05MDAvMzAgcm91bmRlZCBib3JkZXIgYm9yZGVyLXJlZC04MDAvNTBcIj5WYWxpZGF0aW9uIElzc3VlPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQtc2xhdGUtNDAwIHRleHQteHNcIj5Sb3cge2N1cnJlbnRJdGVtLmRhdGEuX3Jvd0luZGV4fTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwidGV4dC1zbSB0ZXh0LXNsYXRlLTIwMCBtYi0xXCI+e2N1cnJlbnRJdGVtLmRhdGEudHlwZSB8fCAnVW5rbm93biBDb21wb25lbnQnfTwvcD5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxwIGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS00MDAgcC0yIGJnLXNsYXRlLTk1MCByb3VuZGVkIGJvcmRlciBib3JkZXItc2xhdGUtODAwXCI+e2N1cnJlbnRJdGVtLmRhdGEuZml4aW5nQWN0aW9ufTwvcD5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgKSA6IChcbiAgICAgICAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIG1iLTJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXhzIGZvbnQtYm9sZCB0ZXh0LWFtYmVyLTQwMCB1cHBlcmNhc2UgdHJhY2tpbmctd2lkZXN0IHB4LTIgcHktMC41IGJnLWFtYmVyLTkwMC8zMCByb3VuZGVkIGJvcmRlciBib3JkZXItYW1iZXItODAwLzUwXCI+Rml4IFByb3Bvc2FsPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQtc2xhdGUtNDAwIHRleHQteHNcIj5Sb3cge2N1cnJlbnRJdGVtLmRhdGEuZWxlbWVudEE/Ll9yb3dJbmRleH08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicC0yIGJnLXNsYXRlLTk1MCByb3VuZGVkIGJvcmRlciBib3JkZXItc2xhdGUtODAwXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwidGV4dC1zbSB0ZXh0LXNsYXRlLTIwMCBmb250LW1lZGl1bVwiPntjdXJyZW50SXRlbS5kYXRhLmRlc2NyaXB0aW9ufTwvcD5cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHsvKiBEZXRhaWxlZCBQcm9wb3NhbCBJbmZvICovfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHsoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9wID0gY3VycmVudEl0ZW0uZGF0YTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibXQtMiBwdC0yIGJvcmRlci10IGJvcmRlci1zbGF0ZS04MDAgZmxleCBqdXN0aWZ5LWJldHdlZW4gaXRlbXMtZW5kXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtWzEwcHhdIHRleHQtc2xhdGUtNTAwXCI+QWN0aW9uOiB7cHJvcC5hY3Rpb259PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAge3Byb3AuZGlzdCAhPT0gdW5kZWZpbmVkICYmIDxkaXYgY2xhc3NOYW1lPVwidGV4dC1bMTBweF0gdGV4dC1zbGF0ZS01MDBcIj5EZWx0YToge3Byb3AuZGlzdC50b0ZpeGVkKDEpfW1tPC9kaXY+fVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtwcm9wLnNjb3JlICE9PSB1bmRlZmluZWQgJiYgKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPXtgdGV4dC1bMTBweF0gcHgtMS41IHB5LTAuNSByb3VuZGVkIGJvcmRlciAke3Byb3Auc2NvcmUgPj0gMTAgPyAndGV4dC1ncmVlbi00MDAgYmctZ3JlZW4tOTAwLzMwIGJvcmRlci1ncmVlbi04MDAnIDogJ3RleHQtb3JhbmdlLTQwMCBiZy1vcmFuZ2UtOTAwLzMwIGJvcmRlci1vcmFuZ2UtODAwJ31gfT5TY29yZSB7cHJvcC5zY29yZX08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KSgpfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgey8qIEFjdGlvbnMgKi99XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJtdC00IGZsZXggZ2FwLTJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAge2N1cnJlbnRJdGVtLmRhdGEuX2ZpeEFwcHJvdmVkID09PSB0cnVlID8gKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ3LWZ1bGwgdGV4dC1jZW50ZXIgdGV4dC1ncmVlbi01MDAgZm9udC1ib2xkIHRleHQtc20gcHktMSBiZy1ncmVlbi05MDAvMjAgcm91bmRlZCBib3JkZXIgYm9yZGVyLWdyZWVuLTgwMC8zMFwiPuKckyBBcHByb3ZlZDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApIDogY3VycmVudEl0ZW0uZGF0YS5fZml4QXBwcm92ZWQgPT09IGZhbHNlID8gKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ3LWZ1bGwgdGV4dC1jZW50ZXIgdGV4dC1yZWQtNTAwIGZvbnQtYm9sZCB0ZXh0LXNtIHB5LTEgYmctcmVkLTkwMC8yMCByb3VuZGVkIGJvcmRlciBib3JkZXItcmVkLTgwMC8zMFwiPuKclyBSZWplY3RlZDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApIDogKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPD5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzTmFtZT1cImZsZXgtMSBiZy1ncmVlbi04MDAgaG92ZXI6YmctZ3JlZW4tNzAwIHRleHQtd2hpdGUgdGV4dC1zbSBweS0xLjUgcm91bmRlZCB0cmFuc2l0aW9uXCIgb25DbGljaz17KGUpID0+IG9uQXBwcm92ZShlLCBjdXJyZW50SXRlbS5kYXRhKX0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIOKckyBBcHByb3ZlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9XCJmbGV4LTEgYmctc2xhdGUtNzAwIGhvdmVyOmJnLXNsYXRlLTYwMCB0ZXh0LXdoaXRlIHRleHQtc20gcHktMS41IHJvdW5kZWQgdHJhbnNpdGlvbiBmbGV4IGp1c3RpZnktY2VudGVyIGl0ZW1zLWNlbnRlciBnYXAtMVwiIG9uQ2xpY2s9eyhlKSA9PiBvblJlamVjdChlLCBjdXJyZW50SXRlbS5kYXRhKX0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIOKclyBSZWplY3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgKTtcbn07XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEdsb2JhbCBTbmFwIExheWVyXG4vLyBQcm92aWRlcyBhIHVuaWZpZWQgc25hcHBpbmcgcG9pbnQgZm9yIE1lYXN1cmUsIEJyZWFrLCBldGMuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jb25zdCBHbG9iYWxTbmFwTGF5ZXIgPSAoKSA9PiB7XG4gICAgY29uc3QgYXBwU2V0dGluZ3MgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5hcHBTZXR0aW5ncyk7XG4gICAgY29uc3QgY2FudmFzTW9kZSA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmNhbnZhc01vZGUpO1xuICAgIGNvbnN0IGRhdGFUYWJsZSA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmRhdGFUYWJsZSk7XG4gICAgY29uc3Qgc2V0Q3Vyc29yU25hcFBvaW50ID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuc2V0Q3Vyc29yU25hcFBvaW50KTtcbiAgICBjb25zdCBjdXJzb3JTbmFwUG9pbnQgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5jdXJzb3JTbmFwUG9pbnQpO1xuXG4gICAgLy8gT25seSBhY3RpdmUgZHVyaW5nIHRvb2xzIHRoYXQgbmVlZCBwaWNraW5nXG4gICAgY29uc3QgaXNBY3RpdmUgPSBbJ01FQVNVUkUnLCAnQlJFQUsnLCAnQ09OTkVDVCcsICdTVFJFVENIJywgJ0lOU0VSVF9TVVBQT1JUJ10uaW5jbHVkZXMoY2FudmFzTW9kZSk7XG5cbiAgICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgICAgICBpZiAoIWlzQWN0aXZlKSB7XG4gICAgICAgICAgICBzZXRDdXJzb3JTbmFwUG9pbnQobnVsbCk7XG4gICAgICAgIH1cbiAgICB9LCBbaXNBY3RpdmUsIHNldEN1cnNvclNuYXBQb2ludF0pO1xuXG4gICAgaWYgKCFpc0FjdGl2ZSkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBzbmFwUmFkaXVzID0gNTA7IC8vIG1tXG5cbiAgICBjb25zdCBoYW5kbGVQb2ludGVyTW92ZSA9IChlKSA9PiB7XG4gICAgICAgIGxldCBuZWFyZXN0ID0gbnVsbDtcbiAgICAgICAgbGV0IG1pbkRpc3QgPSBzbmFwUmFkaXVzO1xuXG4gICAgICAgIC8vIEZpbmQgY2xvc2VzdCBlcDEsIGVwMiwgb3IgbWlkcG9pbnRcbiAgICAgICAgZGF0YVRhYmxlLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHB0c1RvVGVzdCA9IFtdO1xuICAgICAgICAgICAgaWYgKHJvdy5lcDEpIHB0c1RvVGVzdC5wdXNoKG5ldyBUSFJFRS5WZWN0b3IzKHJvdy5lcDEueCwgcm93LmVwMS55LCByb3cuZXAxLnopKTtcbiAgICAgICAgICAgIGlmIChyb3cuZXAyKSBwdHNUb1Rlc3QucHVzaChuZXcgVEhSRUUuVmVjdG9yMyhyb3cuZXAyLngsIHJvdy5lcDIueSwgcm93LmVwMi56KSk7XG4gICAgICAgICAgICBpZiAocm93LmVwMSAmJiByb3cuZXAyKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbWlkID0gbmV3IFRIUkVFLlZlY3RvcjMocm93LmVwMS54LCByb3cuZXAxLnksIHJvdy5lcDEueilcbiAgICAgICAgICAgICAgICAgICAgLmxlcnAobmV3IFRIUkVFLlZlY3RvcjMocm93LmVwMi54LCByb3cuZXAyLnksIHJvdy5lcDIueiksIDAuNSk7XG4gICAgICAgICAgICAgICAgcHRzVG9UZXN0LnB1c2gobWlkKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcHRzVG9UZXN0LmZvckVhY2gocHQgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRpc3QgPSBwdC5kaXN0YW5jZVRvKGUucG9pbnQpO1xuICAgICAgICAgICAgICAgIGlmIChkaXN0IDwgbWluRGlzdCkge1xuICAgICAgICAgICAgICAgICAgICBtaW5EaXN0ID0gZGlzdDtcbiAgICAgICAgICAgICAgICAgICAgbmVhcmVzdCA9IHB0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAobmVhcmVzdCkge1xuICAgICAgICAgICAgLy8gVXBkYXRlIHN0YXRlIE9OTFkgaWYgcG9pbnQgY2hhbmdlZCB0byBhdm9pZCByZS1yZW5kZXJzXG4gICAgICAgICAgICBpZiAoIWN1cnNvclNuYXBQb2ludCB8fCBjdXJzb3JTbmFwUG9pbnQuZGlzdGFuY2VUbyhuZWFyZXN0KSA+IDAuMSkge1xuICAgICAgICAgICAgICAgIHNldEN1cnNvclNuYXBQb2ludChuZWFyZXN0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChjdXJzb3JTbmFwUG9pbnQpIHtcbiAgICAgICAgICAgIHNldEN1cnNvclNuYXBQb2ludChudWxsKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8Z3JvdXAgb25Qb2ludGVyTW92ZT17aGFuZGxlUG9pbnRlck1vdmV9PlxuICAgICAgICAgICAgey8qIENsaWNrIHBsYW5lIGZvciBnZW5lcmljIG1vdmUgZXZlbnRzICovfVxuICAgICAgICAgICAgPG1lc2ggdmlzaWJsZT17ZmFsc2V9PlxuICAgICAgICAgICAgICAgIDxwbGFuZUdlb21ldHJ5IGFyZ3M9e1syMDAwMDAsIDIwMDAwMF19IC8+XG4gICAgICAgICAgICA8L21lc2g+XG5cbiAgICAgICAgICAgIHtjdXJzb3JTbmFwUG9pbnQgJiYgKFxuICAgICAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXtjdXJzb3JTbmFwUG9pbnR9IHJlbmRlck9yZGVyPXs5OTl9PlxuICAgICAgICAgICAgICAgICAgICA8c3BoZXJlR2VvbWV0cnkgYXJncz17WzE1LCAxNiwgMTZdfSAvPlxuICAgICAgICAgICAgICAgICAgICA8bWVzaEJhc2ljTWF0ZXJpYWwgY29sb3I9e2FwcFNldHRpbmdzLnNlbGVjdGlvbkNvbG9yfSB0cmFuc3BhcmVudCBvcGFjaXR5PXswLjh9IGRlcHRoVGVzdD17ZmFsc2V9IC8+XG4gICAgICAgICAgICAgICAgPC9tZXNoPlxuICAgICAgICAgICAgKX1cbiAgICAgICAgPC9ncm91cD5cbiAgICApO1xufTtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gQ3VzdG9tIExlZ2VuZCBMYXllclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuY29uc3QgTGVnZW5kTGF5ZXIgPSAoKSA9PiB7XG4gICAgY29uc3QgY29sb3JNb2RlID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuY29sb3JNb2RlKTtcbiAgICBjb25zdCBkYXRhVGFibGUgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5kYXRhVGFibGUpO1xuICAgIGNvbnN0IGFwcFNldHRpbmdzID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuYXBwU2V0dGluZ3MpO1xuICAgIGNvbnN0IFtpc0NvbGxhcHNlZCwgc2V0SXNDb2xsYXBzZWRdID0gdXNlU3RhdGUoZmFsc2UpO1xuXG4gICAgY29uc3QgdW5pcXVlVmFsdWVzID0gdXNlTWVtbygoKSA9PiB7XG4gICAgICAgIGlmIChjb2xvck1vZGUgPT09ICdTUE9PTCcgfHwgY29sb3JNb2RlID09PSAnVFlQRScgfHwgIWNvbG9yTW9kZSkgcmV0dXJuIFtdO1xuICAgICAgICBjb25zdCB2YWxzID0gbmV3IFNldCgpO1xuICAgICAgICBkYXRhVGFibGUuZm9yRWFjaChyID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHZhbCA9IGdldENvbG9yTW9kZVZhbHVlKHIsIGNvbG9yTW9kZSk7XG4gICAgICAgICAgICBpZiAodmFsKSB2YWxzLmFkZCh2YWwpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIEFycmF5LmZyb20odmFscykuc29ydCgpO1xuICAgIH0sIFtkYXRhVGFibGUsIGNvbG9yTW9kZV0pO1xuXG4gICAgY29uc3QgdW5pcXVlVHlwZXMgPSB1c2VNZW1vKCgpID0+IHtcbiAgICAgICAgaWYgKGNvbG9yTW9kZSAhPT0gJ1RZUEUnKSByZXR1cm4gW107XG4gICAgICAgIGNvbnN0IHZhbHMgPSBuZXcgU2V0KCk7XG4gICAgICAgIGRhdGFUYWJsZS5mb3JFYWNoKHIgPT4ge1xuICAgICAgICAgICAgaWYgKHIudHlwZSkgdmFscy5hZGQoci50eXBlLnRvVXBwZXJDYXNlKCkpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIEFycmF5LmZyb20odmFscykuc29ydCgpO1xuICAgIH0sIFtkYXRhVGFibGUsIGNvbG9yTW9kZV0pO1xuXG4gICAgaWYgKGNvbG9yTW9kZSA9PT0gJ1RZUEUnKSB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC1jb2wgZ2FwLTEgYmctc2xhdGUtOTAwLzkwIHAtMyByb3VuZGVkIGJvcmRlciBib3JkZXItc2xhdGUtNzAwIGJhY2tkcm9wLWJsdXIgcG9pbnRlci1ldmVudHMtYXV0byBzaGFkb3cteGwgc2hyaW5rLTBcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGdhcC0yIGJvcmRlci1iIGJvcmRlci1zbGF0ZS03MDAgcGItMSBtYi0xXCI+XG4gICAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IHNldElzQ29sbGFwc2VkKCFpc0NvbGxhcHNlZCl9IGNsYXNzTmFtZT1cInRleHQtcmVkLTUwMCBob3Zlcjp0ZXh0LXJlZC00MDAgdGV4dC14c1wiPlxuICAgICAgICAgICAgICAgICAgICB7aXNDb2xsYXBzZWQgPyAn4pa2JyA6ICfilrwnfVxuICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICA8aDQgY2xhc3NOYW1lPVwidGV4dC14cyBmb250LWJvbGQgdGV4dC1zbGF0ZS0zMDBcIj5UeXBlIExlZ2VuZDwvaDQ+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgeyFpc0NvbGxhcHNlZCAmJiB1bmlxdWVUeXBlcy5tYXAodmFsID0+IChcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBrZXk9e3ZhbH0gY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidy0zIGgtMyByb3VuZGVkLWZ1bGxcIiBzdHlsZT17eyBiYWNrZ3JvdW5kQ29sb3I6IHR5cGVDb2xvcih2YWwsIGFwcFNldHRpbmdzKSB9fT48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS00MDBcIj57dmFsfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgKSl9XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAoY29sb3JNb2RlID09PSAnU1BPT0wnKSB7XG4gICAgICAgIGNvbnN0IHNwb29scyA9IGNvbXB1dGVTcG9vbHMoZGF0YVRhYmxlKTtcbiAgICAgICAgY29uc3QgdW5pcXVlU3Bvb2xJZHMgPSBBcnJheS5mcm9tKG5ldyBTZXQoT2JqZWN0LnZhbHVlcyhzcG9vbHMpKSkuc29ydCgoYSwgYikgPT4gYSAtIGIpO1xuXG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC1jb2wgZ2FwLTEgYmctc2xhdGUtOTAwLzkwIHAtMyByb3VuZGVkIGJvcmRlciBib3JkZXItc2xhdGUtNzAwIGJhY2tkcm9wLWJsdXIgcG9pbnRlci1ldmVudHMtYXV0byBzaGFkb3cteGwgc2hyaW5rLTAgbWF4LWgtNjQgb3ZlcmZsb3cteS1hdXRvXCI+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMiBib3JkZXItYiBib3JkZXItc2xhdGUtNzAwIHBiLTEgbWItMVwiPlxuICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXsoKSA9PiBzZXRJc0NvbGxhcHNlZCghaXNDb2xsYXBzZWQpfSBjbGFzc05hbWU9XCJ0ZXh0LXJlZC01MDAgaG92ZXI6dGV4dC1yZWQtNDAwIHRleHQteHNcIj5cbiAgICAgICAgICAgICAgICAgICAge2lzQ29sbGFwc2VkID8gJ+KWticgOiAn4pa8J31cbiAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgPGg0IGNsYXNzTmFtZT1cInRleHQteHMgZm9udC1ib2xkIHRleHQtc2xhdGUtMzAwXCI+U3Bvb2wgTGVnZW5kPC9oND5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICB7IWlzQ29sbGFwc2VkICYmIHVuaXF1ZVNwb29sSWRzLm1hcCh2YWwgPT4gKFxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGtleT17dmFsfSBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMlwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ3LTMgaC0zIHJvdW5kZWQtZnVsbFwiIHN0eWxlPXt7IGJhY2tncm91bmRDb2xvcjogc3Bvb2xDb2xvcih2YWwpIH19PjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC14cyB0ZXh0LXNsYXRlLTQwMFwiPlNwb29sIHt2YWx9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICApKX1cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICApO1xuICAgIH1cblxuICAgIGlmICh1bmlxdWVWYWx1ZXMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBmbGV4LWNvbCBnYXAtMSBiZy1zbGF0ZS05MDAvOTAgcC0zIHJvdW5kZWQgYm9yZGVyIGJvcmRlci1zbGF0ZS03MDAgYmFja2Ryb3AtYmx1ciBwb2ludGVyLWV2ZW50cy1hdXRvIHNoYWRvdy14bCBzaHJpbmstMCBtYXgtaC02NCBvdmVyZmxvdy15LWF1dG9cIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTIgYm9yZGVyLWIgYm9yZGVyLXNsYXRlLTcwMCBwYi0xIG1iLTFcIj5cbiAgICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXsoKSA9PiBzZXRJc0NvbGxhcHNlZCghaXNDb2xsYXBzZWQpfSBjbGFzc05hbWU9XCJ0ZXh0LXJlZC01MDAgaG92ZXI6dGV4dC1yZWQtNDAwIHRleHQteHNcIj5cbiAgICAgICAgICAgICAgICB7aXNDb2xsYXBzZWQgPyAn4pa2JyA6ICfilrwnfVxuICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgPGg0IGNsYXNzTmFtZT1cInRleHQteHMgZm9udC1ib2xkIHRleHQtc2xhdGUtMzAwXCI+e2NvbG9yTW9kZX0gTGVnZW5kPC9oND5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgeyFpc0NvbGxhcHNlZCAmJiAoXG4gICAgICAgICAgICAgIDw+XG4gICAgICAgICAgICAgICAge3VuaXF1ZVZhbHVlcy5tYXAodmFsID0+IChcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBrZXk9e3ZhbH0gY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidy0zIGgtMyByb3VuZGVkLWZ1bGxcIiBzdHlsZT17eyBiYWNrZ3JvdW5kQ29sb3I6IGdldENBQ29sb3IodmFsKSB9fT48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS00MDBcIj57dmFsfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgKSl9XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMiBtdC0xXCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidy0zIGgtMyByb3VuZGVkLWZ1bGwgYmctc2xhdGUtNjAwXCI+PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQteHMgdGV4dC1zbGF0ZS01MDAgaXRhbGljXCI+Tm9uZSAvIE1pc3Npbmc8L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgIDwvPlxuICAgICAgICAgICAgKX1cbiAgICAgICAgPC9kaXY+XG4gICAgKTtcbn07XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIE1hcnF1ZWUgT3ZlcmxheSAoUHJvZmVzc2lvbmFsIEltcGxlbWVudGF0aW9uKVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuY29uc3QgTWFycXVlZUxheWVyID0gKCkgPT4ge1xuICAgIGNvbnN0IGNhbnZhc01vZGUgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5jYW52YXNNb2RlKTtcbiAgICBjb25zdCBzZXRDYW52YXNNb2RlID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuc2V0Q2FudmFzTW9kZSk7XG4gICAgY29uc3QgZGF0YVRhYmxlID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuZGF0YVRhYmxlKTtcbiAgICBjb25zdCBzZXRNdWx0aVNlbGVjdCA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLnNldE11bHRpU2VsZWN0KTtcbiAgICBjb25zdCBwdXNoSGlzdG9yeSA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLnB1c2hIaXN0b3J5KTtcbiAgICBjb25zdCB7IGRpc3BhdGNoIH0gPSB1c2VBcHBDb250ZXh0KCk7XG4gICAgY29uc3QgW2lzRHJhZ2dpbmcsIHNldElzRHJhZ2dpbmddID0gdXNlU3RhdGUoZmFsc2UpO1xuICAgIGNvbnN0IFtzdGFydFBvcywgc2V0U3RhcnRQb3NdID0gdXNlU3RhdGUoeyB4OiAwLCB5OiAwIH0pO1xuICAgIGNvbnN0IFtjdXJyZW50UG9zLCBzZXRDdXJyZW50UG9zXSA9IHVzZVN0YXRlKHsgeDogMCwgeTogMCB9KTtcbiAgICBjb25zdCBvdmVybGF5UmVmID0gdXNlUmVmKG51bGwpO1xuICAgIGNvbnN0IHBvaW50ZXJJZFJlZiA9IHVzZVJlZihudWxsKTtcblxuICAgIGNvbnN0IHsgY2FtZXJhLCBzaXplIH0gPSB1c2VUaHJlZSgpO1xuICAgIGNvbnN0IGlzQWN0aXZlID0gY2FudmFzTW9kZSA9PT0gJ01BUlFVRUVfU0VMRUNUJyB8fCBjYW52YXNNb2RlID09PSAnTUFSUVVFRV9aT09NJyB8fCBjYW52YXNNb2RlID09PSAnTUFSUVVFRV9ERUxFVEUnO1xuXG4gICAgY29uc3QgTUlOX0RSQUdfRElTVEFOQ0UgPSA1O1xuXG4gICAgaWYgKCFpc0FjdGl2ZSkgcmV0dXJuIG51bGw7XG5cbiAgICAvKipcbiAgICAgKiBDaGVjayBpZiBhIGNvbXBvbmVudCAodmlhIGl0cyBib3VuZGluZyBib3gpIGludGVyc2VjdHMgdGhlIG1hcnF1ZWUuXG4gICAgICogTWFwcyBhbGwgOCBjb3JuZXJzIG9mIHRoZSAzRCBib3VuZGluZyBib3ggdG8gMkQgc2NyZWVuIHNwYWNlXG4gICAgICogdXNpbmcgZXhhY3QgSFRNTCBjYW52YXMgb2Zmc2V0IGJvdW5kcyB0byBzdXBwb3J0IGJvdGggb3J0aG8gJiBwZXJzcC5cbiAgICAgKi9cbiAgICBjb25zdCBpc0NvbXBvbmVudEluTWFycXVlZSA9IChlbCwgcmVjdFNjcmVlbikgPT4ge1xuICAgICAgICBjb25zdCBwdHMgPSBbXTtcblxuICAgICAgICAvLyBDb2xsZWN0IGFsbCByZWxldmFudCAzRCBwb2ludHMgZm9yIHRoZSBjb21wb25lbnRcbiAgICAgICAgaWYgKGVsLmVwMSkgcHRzLnB1c2gobmV3IFRIUkVFLlZlY3RvcjMoZWwuZXAxLngsIGVsLmVwMS55LCBlbC5lcDEueikpO1xuICAgICAgICBpZiAoZWwuZXAyKSBwdHMucHVzaChuZXcgVEhSRUUuVmVjdG9yMyhlbC5lcDIueCwgZWwuZXAyLnksIGVsLmVwMi56KSk7XG4gICAgICAgIGlmIChlbC5jcCkgcHRzLnB1c2gobmV3IFRIUkVFLlZlY3RvcjMoZWwuY3AueCwgZWwuY3AueSwgZWwuY3AueikpO1xuICAgICAgICBpZiAoZWwuYnApIHB0cy5wdXNoKG5ldyBUSFJFRS5WZWN0b3IzKGVsLmJwLngsIGVsLmJwLnksIGVsLmJwLnopKTtcbiAgICAgICAgaWYgKGVsLnN1cHBvcnRDb29yKSBwdHMucHVzaChuZXcgVEhSRUUuVmVjdG9yMyhlbC5zdXBwb3J0Q29vci54LCBlbC5zdXBwb3J0Q29vci55LCBlbC5zdXBwb3J0Q29vci56KSk7XG5cbiAgICAgICAgaWYgKHB0cy5sZW5ndGggPT09IDApIHJldHVybiBmYWxzZTtcblxuICAgICAgICAvLyBCdWlsZCBib3VuZGluZyBib3ggZnJvbSBhbGwgcG9pbnRzXG4gICAgICAgIGNvbnN0IGJveCA9IG5ldyBUSFJFRS5Cb3gzKCk7XG4gICAgICAgIHB0cy5mb3JFYWNoKHAgPT4gYm94LmV4cGFuZEJ5UG9pbnQocCkpO1xuXG4gICAgICAgIGNvbnN0IGNvcm5lcnMgPSBbXG4gICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMyhib3gubWluLngsIGJveC5taW4ueSwgYm94Lm1pbi56KSxcbiAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKGJveC5tYXgueCwgYm94Lm1pbi55LCBib3gubWluLnopLFxuICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMoYm94Lm1pbi54LCBib3gubWF4LnksIGJveC5taW4ueiksXG4gICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMyhib3gubWF4LngsIGJveC5tYXgueSwgYm94Lm1pbi56KSxcbiAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKGJveC5taW4ueCwgYm94Lm1pbi55LCBib3gubWF4LnopLFxuICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMoYm94Lm1heC54LCBib3gubWluLnksIGJveC5tYXgueiksXG4gICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMyhib3gubWluLngsIGJveC5tYXgueSwgYm94Lm1heC56KSxcbiAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKGJveC5tYXgueCwgYm94Lm1heC55LCBib3gubWF4LnopXG4gICAgICAgIF07XG5cbiAgICAgICAgY29uc3QgY2FudmFzUmVjdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2NhbnZhcycpPy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgY29uc3QgY2FudmFzT2Zmc2V0TGVmdCA9IGNhbnZhc1JlY3QgPyBjYW52YXNSZWN0LmxlZnQgOiAwO1xuICAgICAgICBjb25zdCBjYW52YXNPZmZzZXRUb3AgPSBjYW52YXNSZWN0ID8gY2FudmFzUmVjdC50b3AgOiAwO1xuXG4gICAgICAgIGxldCBhbnlJbnNpZGUgPSBmYWxzZTtcblxuICAgICAgICBmb3IgKGNvbnN0IGNvcm5lciBvZiBjb3JuZXJzKSB7XG4gICAgICAgICAgICBjb25zdCBwcm9qZWN0ZWQgPSBjb3JuZXIuY2xvbmUoKS5wcm9qZWN0KGNhbWVyYSk7XG5cbiAgICAgICAgICAgIC8vIEJlaGluZCBjYW1lcmEgY2hlY2tcbiAgICAgICAgICAgIGlmIChwcm9qZWN0ZWQueiA+IDEgfHwgcHJvamVjdGVkLnogPCAtMSkgY29udGludWU7XG5cbiAgICAgICAgICAgIGNvbnN0IHB4ID0gKHByb2plY3RlZC54ICogMC41ICsgMC41KSAqIHNpemUud2lkdGggKyBjYW52YXNPZmZzZXRMZWZ0O1xuICAgICAgICAgICAgY29uc3QgcHkgPSAocHJvamVjdGVkLnkgKiAtMC41ICsgMC41KSAqIHNpemUuaGVpZ2h0ICsgY2FudmFzT2Zmc2V0VG9wO1xuXG4gICAgICAgICAgICBjb25zdCBpbnNpZGUgPSBweCA+PSByZWN0U2NyZWVuLmxlZnQgJiYgcHggPD0gcmVjdFNjcmVlbi5yaWdodCAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcHkgPj0gcmVjdFNjcmVlbi50b3AgJiYgcHkgPD0gcmVjdFNjcmVlbi5ib3R0b207XG5cbiAgICAgICAgICAgIGlmIChpbnNpZGUpIGFueUluc2lkZSA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYW55SW5zaWRlO1xuICAgIH07XG5cbiAgICBjb25zdCBoYW5kbGVQb2ludGVyRG93biA9IChlKSA9PiB7XG4gICAgICAgIGlmIChlLmJ1dHRvbiAhPT0gMCkgcmV0dXJuOyAvLyBPbmx5IGxlZnQgbW91c2UgYnV0dG9uXG5cbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgcG9pbnRlcklkUmVmLmN1cnJlbnQgPSBlLnBvaW50ZXJJZDtcblxuICAgICAgICBpZiAob3ZlcmxheVJlZi5jdXJyZW50KSB7XG4gICAgICAgICAgICBvdmVybGF5UmVmLmN1cnJlbnQuc2V0UG9pbnRlckNhcHR1cmUoZS5wb2ludGVySWQpO1xuICAgICAgICB9XG5cbiAgICAgICAgc2V0SXNEcmFnZ2luZyh0cnVlKTtcbiAgICAgICAgc2V0U3RhcnRQb3MoeyB4OiBlLmNsaWVudFgsIHk6IGUuY2xpZW50WSB9KTtcbiAgICAgICAgc2V0Q3VycmVudFBvcyh7IHg6IGUuY2xpZW50WCwgeTogZS5jbGllbnRZIH0pO1xuICAgIH07XG5cbiAgICBjb25zdCBoYW5kbGVQb2ludGVyTW92ZSA9IChlKSA9PiB7XG4gICAgICAgIGlmICghaXNEcmFnZ2luZyB8fCBwb2ludGVySWRSZWYuY3VycmVudCAhPT0gZS5wb2ludGVySWQpIHJldHVybjtcblxuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIHNldEN1cnJlbnRQb3MoeyB4OiBlLmNsaWVudFgsIHk6IGUuY2xpZW50WSB9KTtcbiAgICB9O1xuXG4gICAgY29uc3QgaGFuZGxlUG9pbnRlclVwID0gKGUpID0+IHtcbiAgICAgICAgaWYgKCFpc0RyYWdnaW5nIHx8IHBvaW50ZXJJZFJlZi5jdXJyZW50ICE9PSBlLnBvaW50ZXJJZCkgcmV0dXJuO1xuXG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIHNldElzRHJhZ2dpbmcoZmFsc2UpO1xuXG4gICAgICAgIGlmIChvdmVybGF5UmVmLmN1cnJlbnQpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgb3ZlcmxheVJlZi5jdXJyZW50LnJlbGVhc2VQb2ludGVyQ2FwdHVyZShlLnBvaW50ZXJJZCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAvLyBQb2ludGVyIGFscmVhZHkgcmVsZWFzZWRcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgZHJhZyBkaXN0YW5jZVxuICAgICAgICAgICAgY29uc3QgZHJhZ0Rpc3QgPSBNYXRoLnNxcnQoXG4gICAgICAgICAgICAgICAgTWF0aC5wb3coY3VycmVudFBvcy54IC0gc3RhcnRQb3MueCwgMikgK1xuICAgICAgICAgICAgICAgIE1hdGgucG93KGN1cnJlbnRQb3MueSAtIHN0YXJ0UG9zLnksIDIpXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICBpZiAoZHJhZ0Rpc3QgPCBNSU5fRFJBR19ESVNUQU5DRSkge1xuICAgICAgICAgICAgICAgIHNldENhbnZhc01vZGUoJ1ZJRVcnKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHJlY3RTY3JlZW4gPSB7XG4gICAgICAgICAgICAgICAgbGVmdDogTWF0aC5taW4oc3RhcnRQb3MueCwgY3VycmVudFBvcy54KSxcbiAgICAgICAgICAgICAgICByaWdodDogTWF0aC5tYXgoc3RhcnRQb3MueCwgY3VycmVudFBvcy54KSxcbiAgICAgICAgICAgICAgICB0b3A6IE1hdGgubWluKHN0YXJ0UG9zLnksIGN1cnJlbnRQb3MueSksXG4gICAgICAgICAgICAgICAgYm90dG9tOiBNYXRoLm1heChzdGFydFBvcy55LCBjdXJyZW50UG9zLnkpXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBzZWxlY3RlZCA9IGRhdGFUYWJsZS5maWx0ZXIoZWwgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh1c2VTdG9yZS5nZXRTdGF0ZSgpLmhpZGRlbkVsZW1lbnRJZHMuaW5jbHVkZXMoZWwuX3Jvd0luZGV4KSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIHJldHVybiBpc0NvbXBvbmVudEluTWFycXVlZShlbCwgcmVjdFNjcmVlbik7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgaWYgKGNhbnZhc01vZGUgPT09ICdNQVJRVUVFX1NFTEVDVCcpIHtcbiAgICAgICAgICAgICAgICBzZXRNdWx0aVNlbGVjdChzZWxlY3RlZC5tYXAoZSA9PiBlLl9yb3dJbmRleCkpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjYW52YXNNb2RlID09PSAnTUFSUVVFRV9aT09NJykge1xuICAgICAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBib3VuZGluZyBib3ggb2Ygc2VsZWN0ZWQgZWxlbWVudHNcbiAgICAgICAgICAgICAgICBsZXQgbWluWCA9IEluZmluaXR5LCBtaW5ZID0gSW5maW5pdHksIG1pblogPSBJbmZpbml0eTtcbiAgICAgICAgICAgICAgICBsZXQgbWF4WCA9IC1JbmZpbml0eSwgbWF4WSA9IC1JbmZpbml0eSwgbWF4WiA9IC1JbmZpbml0eTtcbiAgICAgICAgICAgICAgICBjb25zdCBwdHMgPSBbXTtcbiAgICAgICAgICAgICAgICBzZWxlY3RlZC5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVsLmVwMSkgcHRzLnB1c2goZWwuZXAxKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVsLmVwMikgcHRzLnB1c2goZWwuZXAyKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVsLmNwKSBwdHMucHVzaChlbC5jcCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgLy8gSWYgbm8gZWxlbWVudHMgc2VsZWN0ZWQsIHVzZSB0aGUgZHJhZyByZWN0YW5nbGUgY2VudGVyIGFzIHpvb20gdGFyZ2V0XG4gICAgICAgICAgICAgICAgaWYgKHB0cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVW5wcm9qZWN0IHRoZSBjZW50ZXIgb2YgdGhlIHJlY3RhbmdsZSB0byB3b3JsZCBzcGFjZVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjYW52YXNSZWN0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignY2FudmFzJyk/LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjYW52YXNPZmZzZXRMZWZ0ID0gY2FudmFzUmVjdCA/IGNhbnZhc1JlY3QubGVmdCA6IDA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNhbnZhc09mZnNldFRvcCA9IGNhbnZhc1JlY3QgPyBjYW52YXNSZWN0LnRvcCA6IDA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN4ID0gKChyZWN0U2NyZWVuLmxlZnQgKyByZWN0U2NyZWVuLnJpZ2h0KSAvIDIgLSBjYW52YXNPZmZzZXRMZWZ0KSAvIHNpemUud2lkdGggKiAyIC0gMTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3kgPSAtKChyZWN0U2NyZWVuLnRvcCArIHJlY3RTY3JlZW4uYm90dG9tKSAvIDIgLSBjYW52YXNPZmZzZXRUb3ApIC8gc2l6ZS5oZWlnaHQgKiAyICsgMTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgd29ybGRQdCA9IG5ldyBUSFJFRS5WZWN0b3IzKGN4LCBjeSwgMC41KS51bnByb2plY3QoY2FtZXJhKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBkYmcgIT09ICd1bmRlZmluZWQnKSBkYmcudG9vbCgnTUFSUVVFRV9aT09NJywgJ05vIGVsZW1lbnRzIGluIHJlY3Qg4oCUIHpvb21pbmcgdG8gY2VudGVyJywgeyBjeCwgY3kgfSk7XG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudCgnY2FudmFzLWZvY3VzLXBvaW50Jywge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGV0YWlsOiB7IHg6IHdvcmxkUHQueCwgeTogd29ybGRQdC55LCB6OiB3b3JsZFB0LnosIGRpc3Q6IDMwMDAgfVxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcHRzLmZvckVhY2gocCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtaW5YID0gTWF0aC5taW4obWluWCwgcC54KTsgbWF4WCA9IE1hdGgubWF4KG1heFgsIHAueCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBtaW5ZID0gTWF0aC5taW4obWluWSwgcC55KTsgbWF4WSA9IE1hdGgubWF4KG1heFksIHAueSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBtaW5aID0gTWF0aC5taW4obWluWiwgcC56KTsgbWF4WiA9IE1hdGgubWF4KG1heFosIHAueik7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjZW50ZXIgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiAobWluWCArIG1heFgpIC8gMixcbiAgICAgICAgICAgICAgICAgICAgICAgIHk6IChtaW5ZICsgbWF4WSkgLyAyLFxuICAgICAgICAgICAgICAgICAgICAgICAgejogKG1pblogKyBtYXhaKSAvIDJcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXh0ZW50ID0gTWF0aC5tYXgobWF4WCAtIG1pblgsIG1heFkgLSBtaW5ZLCBtYXhaIC0gbWluWiwgNTAwKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBkYmcgIT09ICd1bmRlZmluZWQnKSBkYmcudG9vbCgnTUFSUVVFRV9aT09NJywgYFpvb21pbmcgdG8gJHtzZWxlY3RlZC5sZW5ndGh9IGVsZW1lbnRzYCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2VudGVyLCBleHRlbnQsIGVsZW1lbnRDb3VudDogc2VsZWN0ZWQubGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ2NhbnZhcy1mb2N1cy1wb2ludCcsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRldGFpbDogeyAuLi5jZW50ZXIsIGRpc3Q6IGV4dGVudCAqIDEuNSB9XG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gTk9URTogRG8gTk9UIGNhbGwgc2V0TXVsdGlTZWxlY3Qg4oCUIHpvb20gaXMgYSB2aWV3IG9wZXJhdGlvbiwgbm90IHNlbGVjdGlvblxuICAgICAgICAgICAgfSBlbHNlIGlmIChjYW52YXNNb2RlID09PSAnTUFSUVVFRV9ERUxFVEUnICYmIHNlbGVjdGVkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBpZiAod2luZG93LmNvbmZpcm0oYERlbGV0ZSAke3NlbGVjdGVkLmxlbmd0aH0gZWxlbWVudHM/YCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcHVzaEhpc3RvcnkoJ0RlbGV0ZSB2aWEgTWFycXVlZScpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByb3dJbmRpY2VzID0gc2VsZWN0ZWQubWFwKGUgPT4gZS5fcm93SW5kZXgpO1xuICAgICAgICAgICAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6ICdERUxFVEVfRUxFTUVOVFMnLCBwYXlsb2FkOiB7IHJvd0luZGljZXMgfSB9KTtcblxuICAgICAgICAgICAgICAgICAgICBjb25zdCB1cGRhdGVkVGFibGUgPSB1c2VTdG9yZS5nZXRTdGF0ZSgpLmRhdGFUYWJsZS5maWx0ZXIociA9PiAhcm93SW5kaWNlcy5pbmNsdWRlcyhyLl9yb3dJbmRleCkpO1xuICAgICAgICAgICAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldERhdGFUYWJsZSh1cGRhdGVkVGFibGUpO1xuICAgICAgICAgICAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiQUREX0xPR1wiLCBwYXlsb2FkOiB7IHN0YWdlOiBcIklOVEVSQUNUSVZFXCIsIHR5cGU6IFwiQXBwbGllZC9GaXhcIiwgbWVzc2FnZTogYERlbGV0ZWQgJHtzZWxlY3RlZC5sZW5ndGh9IGVsZW1lbnRzIHZpYSBtYXJxdWVlLmAgfSB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBkYmcgIT09ICd1bmRlZmluZWQnKSBkYmcuZXJyb3IoJ01BUlFVRUUnLCAnRmF0YWwgZXJyb3IgZHVyaW5nIG1hcnF1ZWUgb3BlcmF0aW9uJywgeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBzZXRDYW52YXNNb2RlKCdWSUVXJyk7XG4gICAgfTtcblxuICAgIGNvbnN0IGhhbmRsZVBvaW50ZXJMZWF2ZSA9IChlKSA9PiB7XG4gICAgICAgIGlmIChpc0RyYWdnaW5nICYmIHBvaW50ZXJJZFJlZi5jdXJyZW50ID09PSBlLnBvaW50ZXJJZCkge1xuICAgICAgICAgICAgaGFuZGxlUG9pbnRlclVwKGUpO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IGdldE1hcnF1ZWVTdHlsZSA9ICgpID0+IHtcbiAgICAgICAgY29uc3QgaXNab29tID0gY2FudmFzTW9kZSA9PT0gJ01BUlFVRUVfWk9PTSc7XG4gICAgICAgIGNvbnN0IGlzRGVsZXRlID0gY2FudmFzTW9kZSA9PT0gJ01BUlFVRUVfREVMRVRFJztcbiAgICAgICAgY29uc3QgaXNDcm9zc2luZyA9IGN1cnJlbnRQb3MueCA8IHN0YXJ0UG9zLng7XG4gICAgICAgIGNvbnN0IGJvcmRlckNvbG9yID0gaXNEZWxldGUgPyAnI2VmNDQ0NCcgOiBpc1pvb20gPyAnIzgxOGNmOCcgOiAoaXNDcm9zc2luZyA/ICcjMTBiOTgxJyA6ICcjM2I4MmY2Jyk7XG4gICAgICAgIGNvbnN0IGJnQ29sb3IgPSBpc0RlbGV0ZSA/ICdyZ2JhKDIzOSw2OCw2OCwwLjA4KScgOiBpc1pvb20gPyAncmdiYSgxMjksMTQwLDI0OCwwLjA4KScgOiAoaXNDcm9zc2luZyA/ICdyZ2JhKDE2LDE4NSwxMjksMC4wOCknIDogJ3JnYmEoNTksMTMwLDI0NiwwLjA4KScpO1xuICAgICAgICBjb25zdCBib3JkZXJTdHlsZSA9IGlzQ3Jvc3NpbmcgJiYgIWlzWm9vbSAmJiAhaXNEZWxldGUgPyAnZGFzaGVkJyA6ICdzb2xpZCc7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcbiAgICAgICAgICAgIGxlZnQ6IE1hdGgubWluKHN0YXJ0UG9zLngsIGN1cnJlbnRQb3MueCksXG4gICAgICAgICAgICB0b3A6IE1hdGgubWluKHN0YXJ0UG9zLnksIGN1cnJlbnRQb3MueSksXG4gICAgICAgICAgICB3aWR0aDogTWF0aC5hYnMoY3VycmVudFBvcy54IC0gc3RhcnRQb3MueCksXG4gICAgICAgICAgICBoZWlnaHQ6IE1hdGguYWJzKGN1cnJlbnRQb3MueSAtIHN0YXJ0UG9zLnkpLFxuICAgICAgICAgICAgYm9yZGVyV2lkdGg6ICcycHgnLFxuICAgICAgICAgICAgYm9yZGVyU3R5bGU6IGJvcmRlclN0eWxlLFxuICAgICAgICAgICAgYm9yZGVyQ29sb3I6IGJvcmRlckNvbG9yLFxuICAgICAgICAgICAgYmFja2dyb3VuZENvbG9yOiBiZ0NvbG9yLFxuICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnMnB4JyxcbiAgICAgICAgICAgIGJveFNoYWRvdzogYDAgMCAxMnB4ICR7Ym9yZGVyQ29sb3J9NDBgLFxuICAgICAgICAgICAgcG9pbnRlckV2ZW50czogJ25vbmUnLFxuICAgICAgICAgICAgekluZGV4OiAxMDAwLFxuICAgICAgICAgICAgdHJhbnNpdGlvbjogJ2JvcmRlci1jb2xvciAwLjFzJyxcbiAgICAgICAgfTtcbiAgICB9O1xuXG4gICAgY29uc3QgZ2V0Q3Vyc29yID0gKCkgPT4ge1xuICAgICAgICBzd2l0Y2ggKGNhbnZhc01vZGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ01BUlFVRUVfU0VMRUNUJzogcmV0dXJuICdjcm9zc2hhaXInO1xuICAgICAgICAgICAgY2FzZSAnTUFSUVVFRV9aT09NJzogcmV0dXJuICd6b29tLWluJztcbiAgICAgICAgICAgIGNhc2UgJ01BUlFVRUVfREVMRVRFJzogcmV0dXJuICdub3QtYWxsb3dlZCc7XG4gICAgICAgICAgICBkZWZhdWx0OiByZXR1cm4gJ2RlZmF1bHQnO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxIdG1sIGZ1bGxzY3JlZW4gekluZGV4UmFuZ2U9e1sxMDAsIDBdfSBzdHlsZT17eyBwb2ludGVyRXZlbnRzOiAnbm9uZScgfX0+XG4gICAgICAgICAgICA8ZGl2XG4gICAgICAgICAgICAgICAgcmVmPXtvdmVybGF5UmVmfVxuICAgICAgICAgICAgICAgIHN0eWxlPXt7XG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiAnMTAwdncnLFxuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6ICcxMDB2aCcsXG4gICAgICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudHM6ICdhdXRvJyxcbiAgICAgICAgICAgICAgICAgICAgY3Vyc29yOiBnZXRDdXJzb3IoKSxcbiAgICAgICAgICAgICAgICAgICAgdXNlclNlbGVjdDogJ25vbmUnXG4gICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICBvblBvaW50ZXJEb3duPXtoYW5kbGVQb2ludGVyRG93bn1cbiAgICAgICAgICAgICAgICBvblBvaW50ZXJNb3ZlPXtoYW5kbGVQb2ludGVyTW92ZX1cbiAgICAgICAgICAgICAgICBvblBvaW50ZXJVcD17aGFuZGxlUG9pbnRlclVwfVxuICAgICAgICAgICAgICAgIG9uUG9pbnRlckxlYXZlPXtoYW5kbGVQb2ludGVyTGVhdmV9XG4gICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAge2lzRHJhZ2dpbmcgJiYgKFxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXtnZXRNYXJxdWVlU3R5bGUoKX0gLz5cbiAgICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvSHRtbD5cbiAgICApO1xufTtcblxuLy8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXG4vLyBTSEFSRUQgVE9PTDogTUVBU1VSRVxuLy8gVGhpcyB0b29sIGFsc28gZXhpc3RzIGluIHNyYy91aS90YWJzL0RyYXdDYW52YXNUYWIuanN4LlxuLy8gSWYgbW9kaWZ5aW5nIGxvZ2ljLCB1cGRhdGUgQk9USCBmaWxlcyBhbmQgcnVuIENoZWNrcG9pbnQgRi5cbi8vIOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxuY29uc3QgTWVhc3VyZVRvb2wgPSAoKSA9PiB7XG4gICAgY29uc3QgYXBwU2V0dGluZ3MgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5hcHBTZXR0aW5ncyk7XG4gICAgY29uc3QgbWVhc3VyZVB0cyA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLm1lYXN1cmVQdHMpO1xuICAgIGNvbnN0IGFkZE1lYXN1cmVQdCA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmFkZE1lYXN1cmVQdCk7XG4gICAgY29uc3QgY2FudmFzTW9kZSA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmNhbnZhc01vZGUpO1xuICAgIGNvbnN0IGN1cnNvclNuYXBQb2ludCA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmN1cnNvclNuYXBQb2ludCk7XG5cbiAgICBpZiAoY2FudmFzTW9kZSAhPT0gJ01FQVNVUkUnKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IGhhbmRsZVBvaW50ZXJEb3duID0gKGUpID0+IHtcbiAgICAgICAgLy8gT25seSBydW4gd2hlbiBkaXJlY3RseSBoaXR0aW5nIHRoZSBnbG9iYWwgcGxhbmUgT1IgaWYgaGFuZGxlZCBieSBhIHNwZWNpZmljIG1lc2ggZXZlbnQgaGFuZGxlciB0aGF0IGV4cGxpY2l0bHkgYnViYmxlcy5cbiAgICAgICAgLy8gQWN0dWFsbHksIGZvciByb2J1c3QgbWVhc3VyZW1lbnQsIHJlbHlpbmcgb24gdGhlIGdsb2JhbCBjbGljayBwbGFuZSBpcyBmaW5lIGFzIGxvbmcgYXMgZGVwdGhXcml0ZT1mYWxzZSBzbyBpdCBpbnRlcmNlcHRzLlxuICAgICAgICAvLyBCdXQgc2luY2Ugd2Ugd2FudCB0byBzbmFwIHRvIG9iamVjdHMsIHdlJ2xsIGxldCBgSW5zdGFuY2VkUGlwZXNgIGhhbmRsZSB0aGUgY2xpY2sgYnViYmxpbmcgb3IgdXNlIHRoaXMgY2FwdHVyZSBwbGFuZS5cbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGFkZE1lYXN1cmVQdChjdXJzb3JTbmFwUG9pbnQgPyBjdXJzb3JTbmFwUG9pbnQuY2xvbmUoKSA6IGUucG9pbnQuY2xvbmUoKSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgZGJnLmVycm9yKCdNRUFTVVJFX1RPT0wnLCAnRmF0YWwgZXJyb3IgZHVyaW5nIG1lYXN1cmUgb3BlcmF0aW9uJywgeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICBzZXRDYW52YXNNb2RlKCdWSUVXJyk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGdyb3VwPlxuICAgICAgICAgICAgey8qIFByb3ZpZGUgYSBsYXJnZSBjYXB0dXJlIHBsYW5lIHNvIGNsaWNraW5nIFwiZW1wdHlcIiBzcGFjZSBzdGlsbCByZWdpc3RlcnMgYSBwb2ludCxcbiAgICAgICAgICAgICAgICBidXQgZW5zdXJlIGl0IHJlbmRlcnMgYmVoaW5kIGV2ZXJ5dGhpbmcgZWxzZSBhbmQgZG9lc24ndCB3cml0ZSB0byBkZXB0aCBzbyBvYmplY3QgY2xpY2tzIGNhbiBoaXQgZmlyc3QgaWYgbmVlZGVkLFxuICAgICAgICAgICAgICAgIE9SIHdlIGp1c3QgcmVseSBvbiB0aGlzIGludGVyY2VwdGluZyBldmVyeXRoaW5nIGFuZCB1c2luZyBjdXJzb3JTbmFwUG9pbnQhICovfVxuICAgICAgICAgICAgPG1lc2ggb25Qb2ludGVyRG93bj17aGFuZGxlUG9pbnRlckRvd259IHJlbmRlck9yZGVyPXstMX0+XG4gICAgICAgICAgICAgICAgIDxwbGFuZUdlb21ldHJ5IGFyZ3M9e1syMDAwMDAsIDIwMDAwMF19IC8+XG4gICAgICAgICAgICAgICAgIDxtZXNoQmFzaWNNYXRlcmlhbCB2aXNpYmxlPXtmYWxzZX0gZGVwdGhXcml0ZT17ZmFsc2V9IHRyYW5zcGFyZW50IG9wYWNpdHk9ezB9IC8+XG4gICAgICAgICAgICA8L21lc2g+XG5cbiAgICAgICAgICAgIHttZWFzdXJlUHRzLmxlbmd0aCA+PSAxICYmIChcbiAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17bWVhc3VyZVB0c1swXX0+XG4gICAgICAgICAgICAgICAgICAgIDxzcGhlcmVHZW9tZXRyeSBhcmdzPXtbMjAsIDE2LCAxNl19IC8+XG4gICAgICAgICAgICAgICAgICAgIDxtZXNoQmFzaWNNYXRlcmlhbCBjb2xvcj17YXBwU2V0dGluZ3Muc2VsZWN0aW9uQ29sb3J9IC8+XG4gICAgICAgICAgICAgICAgPC9tZXNoPlxuICAgICAgICAgICAgKX1cblxuICAgICAgICAgICAge21lYXN1cmVQdHMubGVuZ3RoID09PSAyICYmIChcbiAgICAgICAgICAgICAgICA8PlxuICAgICAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17bWVhc3VyZVB0c1sxXX0+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3BoZXJlR2VvbWV0cnkgYXJncz17WzIwLCAxNiwgMTZdfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgPG1lc2hCYXNpY01hdGVyaWFsIGNvbG9yPXthcHBTZXR0aW5ncy5zZWxlY3Rpb25Db2xvcn0gLz5cbiAgICAgICAgICAgICAgICAgICAgPC9tZXNoPlxuICAgICAgICAgICAgICAgICAgICA8TGluZSBwb2ludHM9e1ttZWFzdXJlUHRzWzBdLCBtZWFzdXJlUHRzWzFdXX0gY29sb3I9e2FwcFNldHRpbmdzLnNlbGVjdGlvbkNvbG9yfSBsaW5lV2lkdGg9ezN9IC8+XG5cbiAgICAgICAgICAgICAgICAgICAgeygoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtaWQgPSBtZWFzdXJlUHRzWzBdLmNsb25lKCkubGVycChtZWFzdXJlUHRzWzFdLCAwLjUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlzdCA9IG1lYXN1cmVQdHNbMF0uZGlzdGFuY2VUbyhtZWFzdXJlUHRzWzFdKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gUHVzaCB0ZXh0IHVwIGJ5IGhhbGYgYm9yZSBiYXNlZCBvbiBzZWxlY3RlZCBlbGVtZW50IChhcHByb3ggNTAtMTAwIHVuaXRzKVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RvcmVEYXRhID0gdXNlU3RvcmUuZ2V0U3RhdGUoKS5wYXJzZWREYXRhIHx8IFtdO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRJZCA9IHVzZVN0b3JlLmdldFN0YXRlKCkuc2VsZWN0ZWRFbGVtZW50SWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtdWx0aUlkcyA9IHVzZVN0b3JlLmdldFN0YXRlKCkubXVsdGlTZWxlY3RlZElkcyB8fCBbXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkRWxlbSA9IHN0b3JlRGF0YS5maW5kKGQgPT4gZC5pZCA9PT0gc2VsZWN0ZWRJZCB8fCBtdWx0aUlkcy5pbmNsdWRlcyhkLmlkKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBib3JlT2Zmc2V0ID0gc2VsZWN0ZWRFbGVtICYmIHNlbGVjdGVkRWxlbS5ib3JlID8gc2VsZWN0ZWRFbGVtLmJvcmUgLyAyIDogMTAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgbWlkLnkgKz0gYm9yZU9mZnNldDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZHggPSBNYXRoLmFicyhtZWFzdXJlUHRzWzBdLnggLSBtZWFzdXJlUHRzWzFdLngpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZHkgPSBNYXRoLmFicyhtZWFzdXJlUHRzWzBdLnkgLSBtZWFzdXJlUHRzWzFdLnkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZHogPSBNYXRoLmFicyhtZWFzdXJlUHRzWzBdLnogLSBtZWFzdXJlUHRzWzFdLnopO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Z3JvdXAgcG9zaXRpb249e21pZH0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXtbMCwgMCwgMF19PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHBsYW5lR2VvbWV0cnkgYXJncz17WzEwMDAsIDQwMF19IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaEJhc2ljTWF0ZXJpYWwgY29sb3I9XCIjMWUyOTNiXCIgc2lkZT17VEhSRUUuRG91YmxlU2lkZX0gb3BhY2l0eT17MC44fSB0cmFuc3BhcmVudCBkZXB0aFRlc3Q9e2ZhbHNlfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L21lc2g+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxUZXh0IHBvc2l0aW9uPXtbMCwgNTAsIDFdfSBjb2xvcj17YXBwU2V0dGluZ3Muc2VsZWN0aW9uQ29sb3J9IGZvbnRTaXplPXsxMDB9IGFuY2hvclg9XCJjZW50ZXJcIiBhbmNob3JZPVwibWlkZGxlXCIgb3V0bGluZVdpZHRoPXsyfSBvdXRsaW5lQ29sb3I9XCIjMGYxNzJhXCIgZGVwdGhUZXN0PXtmYWxzZX0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBEaXN0OiB7ZGlzdC50b0ZpeGVkKDEpfW1tXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvVGV4dD5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPFRleHQgcG9zaXRpb249e1swLCAtNTAsIDFdfSBjb2xvcj1cIiNjYmQ1ZTFcIiBmb250U2l6ZT17NjB9IGFuY2hvclg9XCJjZW50ZXJcIiBhbmNob3JZPVwibWlkZGxlXCIgb3V0bGluZVdpZHRoPXsyfSBvdXRsaW5lQ29sb3I9XCIjMGYxNzJhXCIgZGVwdGhUZXN0PXtmYWxzZX0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBYOntkeC50b0ZpeGVkKDEpfSBZOntkeS50b0ZpeGVkKDEpfSBaOntkei50b0ZpeGVkKDEpfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L1RleHQ+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9ncm91cD5cbiAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIH0pKCl9XG4gICAgICAgICAgICAgICAgPC8+XG4gICAgICAgICAgICApfVxuXG4gICAgICAgICAgICB7LyogQnV0dG9uIHRvIGNsZWFyIG1lYXN1cmUgKG9wdGlvbmFsLCB1c3VhbGx5IHVzZXJzIGhpdCBFc2Mgb3IgJ20nIGFnYWluIHRvIGV4aXQpICovfVxuICAgICAgICA8L2dyb3VwPlxuICAgICk7XG59O1xuXG4vLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbi8vIFNIQVJFRCBUT09MOiBCUkVBSy9DVVRcbi8vIFRoaXMgdG9vbCBhbHNvIGV4aXN0cyBpbiBzcmMvdWkvdGFicy9EcmF3Q2FudmFzVGFiLmpzeC5cbi8vIElmIG1vZGlmeWluZyBsb2dpYywgdXBkYXRlIEJPVEggZmlsZXMgYW5kIHJ1biBDaGVja3BvaW50IEYuXG4vLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbmNvbnN0IEJyZWFrUGlwZUxheWVyID0gKCkgPT4ge1xuICAgIGNvbnN0IGFwcFNldHRpbmdzID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuYXBwU2V0dGluZ3MpO1xuICAgIGNvbnN0IGNhbnZhc01vZGUgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5jYW52YXNNb2RlKTtcbiAgICBjb25zdCBkYXRhVGFibGUgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5kYXRhVGFibGUpO1xuICAgIGNvbnN0IHsgZGlzcGF0Y2ggfSA9IHVzZUFwcENvbnRleHQoKTtcbiAgICBjb25zdCBwdXNoSGlzdG9yeSA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLnB1c2hIaXN0b3J5KTtcbiAgICBjb25zdCBjdXJzb3JTbmFwUG9pbnQgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5jdXJzb3JTbmFwUG9pbnQpO1xuXG4gICAgY29uc3QgW2hvdmVyUG9zLCBzZXRIb3ZlclBvc10gPSB1c2VTdGF0ZShudWxsKTtcblxuICAgIGlmIChjYW52YXNNb2RlICE9PSAnQlJFQUsnKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IGhhbmRsZVBvaW50ZXJNb3ZlID0gKGUpID0+IHtcbiAgICAgICAgLy8gZS5vYmplY3QgaXMgdGhlIGluc3RhbmNlTWVzaCwgYnV0IHdlIG5lZWQgd29ybGQgcG9pbnRcbiAgICAgICAgaWYgKGUucG9pbnQpIHtcbiAgICAgICAgICAgIHNldEhvdmVyUG9zKGUucG9pbnQpO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IGhhbmRsZVBvaW50ZXJPdXQgPSAoKSA9PiB7XG4gICAgICAgIHNldEhvdmVyUG9zKG51bGwpO1xuICAgIH07XG5cbiAgICBjb25zdCBoYW5kbGVQb2ludGVyRG93biA9IChlLCBwaXBlUm93KSA9PiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cbiAgICAgICAgLy8gRW5zdXJlIGl0J3MgYSBwaXBlXG4gICAgICAgIGlmIChwaXBlUm93KSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHB1c2hIaXN0b3J5KCdCcmVhayBQaXBlJyk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBicmVha1B0ID0gY3Vyc29yU25hcFBvaW50ID8gY3Vyc29yU25hcFBvaW50LmNsb25lKCkgOiBlLnBvaW50LmNsb25lKCk7XG4gICAgICAgICAgICAgICAgY29uc3QgYnJlYWtSZXN1bHRzID0gYnJlYWtQaXBlQXRQb2ludChwaXBlUm93LCBicmVha1B0KTtcblxuICAgICAgICAgICAgICAgIGlmIChicmVha1Jlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgW3Jvd0EsIHJvd0JdID0gYnJlYWtSZXN1bHRzO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIERpc3BhdGNoIHRvIEFwcENvbnRleHRcbiAgICAgICAgICAgICAgICAgICAgZGlzcGF0Y2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0JSRUFLX1BJUEUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF5bG9hZDogeyByb3dJbmRleDogcGlwZVJvdy5fcm93SW5kZXgsIHJvd0EsIHJvd0IgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBNaXJyb3IgdG8gWnVzdGFuZFxuICAgICAgICAgICAgICAgICAgICBjb25zdCB1cGRhdGVkVGFibGUgPSBkYXRhVGFibGUuZmxhdE1hcChyID0+XG4gICAgICAgICAgICAgICAgICAgICAgICByLl9yb3dJbmRleCA9PT0gcGlwZVJvdy5fcm93SW5kZXggPyBbcm93QSwgcm93Ql0gOiBbcl1cbiAgICAgICAgICAgICAgICAgICAgKS5tYXAoKHIsIGkpID0+ICh7IC4uLnIsIF9yb3dJbmRleDogaSArIDEgfSkpOyAvLyBSZS1pbmRleFxuXG4gICAgICAgICAgICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0RGF0YVRhYmxlKHVwZGF0ZWRUYWJsZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIkFERF9MT0dcIiwgcGF5bG9hZDogeyBzdGFnZTogXCJJTlRFUkFDVElWRVwiLCB0eXBlOiBcIkFwcGxpZWQvRml4XCIsIG1lc3NhZ2U6IGBSb3cgJHtwaXBlUm93Ll9yb3dJbmRleH0gYnJva2VuIGF0ICgke2JyZWFrUHQueC50b0ZpeGVkKDEpfSwgJHticmVha1B0LnkudG9GaXhlZCgxKX0sICR7YnJlYWtQdC56LnRvRml4ZWQoMSl9KS5gIH0gfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gT25lLXNob3QgYWN0aW9uXG4gICAgICAgICAgICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0Q2FudmFzTW9kZSgnVklFVycpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IHsgc3RhZ2U6IFwiSU5URVJBQ1RJVkVcIiwgdHlwZTogXCJFcnJvclwiLCBtZXNzYWdlOiBgQ2Fubm90IGJyZWFrIHBpcGUgUm93ICR7cGlwZVJvdy5fcm93SW5kZXh9LiBTZWdtZW50IHRvbyBzaG9ydC5gIH0gfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBkYmcgIT09ICd1bmRlZmluZWQnKSBkYmcuZXJyb3IoJ0JSRUFLX1BJUEUnLCAnRmF0YWwgZXJyb3IgZHVyaW5nIGJyZWFrIG9wZXJhdGlvbicsIHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IHsgc3RhZ2U6IFwiSU5URVJBQ1RJVkVcIiwgdHlwZTogXCJFcnJvclwiLCBtZXNzYWdlOiBgRmFpbGVkIHRvIGJyZWFrIHBpcGU6ICR7ZXJyLm1lc3NhZ2V9YCB9IH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxncm91cD5cbiAgICAgICAgICAgICB7LyogSW52aXNpYmxlIHBsYW5lL21lc2ggaW50ZXJjZXB0cyBkb3duIGV2ZW50cz9cbiAgICAgICAgICAgICAgICAgQWN0dWFsbHkgd2UgYXR0YWNoIGV2ZW50cyB0byB0aGUgSW5zdGFuY2VkUGlwZXMgdmlhIHRoZSBncm91cCBpZiB3ZSBjb3VsZCxcbiAgICAgICAgICAgICAgICAgYnV0IHRoZXkgYXJlIGFscmVhZHkgcmVuZGVyZWQuIFdlIGNhbiByZW5kZXIgYSB0cmFuc3BhcmVudCBvdmVybGF5IG9mIHBpcGVzIGhlcmUuXG4gICAgICAgICAgICAgKi99XG4gICAgICAgICAgICAgPGdyb3VwIG9uUG9pbnRlck1vdmU9e2hhbmRsZVBvaW50ZXJNb3ZlfSBvblBvaW50ZXJPdXQ9e2hhbmRsZVBvaW50ZXJPdXR9PlxuICAgICAgICAgICAgICAgIHtkYXRhVGFibGUuZmlsdGVyKHIgPT4gKHIudHlwZXx8JycpLnRvVXBwZXJDYXNlKCkgPT09ICdQSVBFJyAmJiAhdXNlU3RvcmUuZ2V0U3RhdGUoKS5oaWRkZW5FbGVtZW50SWRzLmluY2x1ZGVzKHIuX3Jvd0luZGV4KSkubWFwKChwaXBlLCBpKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghcGlwZS5lcDEgfHwgIXBpcGUuZXAyKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdjEgPSBuZXcgVEhSRUUuVmVjdG9yMyhwaXBlLmVwMS54LCBwaXBlLmVwMS55LCBwaXBlLmVwMS56KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdjIgPSBuZXcgVEhSRUUuVmVjdG9yMyhwaXBlLmVwMi54LCBwaXBlLmVwMi55LCBwaXBlLmVwMi56KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWlkID0gdjEuY2xvbmUoKS5sZXJwKHYyLCAwLjUpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkaXN0ID0gdjEuZGlzdGFuY2VUbyh2Mik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkaXN0ID09PSAwKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlyID0gdjIuY2xvbmUoKS5zdWIodjEpLm5vcm1hbGl6ZSgpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBxdWF0ID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oKS5zZXRGcm9tVW5pdFZlY3RvcnMobmV3IFRIUkVFLlZlY3RvcjMoMCwxLDApLCBkaXIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByID0gcGlwZS5ib3JlID8gcGlwZS5ib3JlIC8gMiA6IDU7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgICAgICAgICAgICA8bWVzaCBrZXk9e2BicC0ke2l9YH0gcG9zaXRpb249e21pZH0gcXVhdGVybmlvbj17cXVhdH0gb25Qb2ludGVyRG93bj17KGUpID0+IGhhbmRsZVBvaW50ZXJEb3duKGUsIHBpcGUpfT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Y3lsaW5kZXJHZW9tZXRyeSBhcmdzPXtbcioxLjUsIHIqMS41LCBkaXN0LCA4XX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bWVzaEJhc2ljTWF0ZXJpYWwgY29sb3I9XCJyZWRcIiB0cmFuc3BhcmVudCBvcGFjaXR5PXswfSBkZXB0aFdyaXRlPXtmYWxzZX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9KX1cbiAgICAgICAgICAgICA8L2dyb3VwPlxuXG4gICAgICAgICAgICAge2hvdmVyUG9zICYmIChcbiAgICAgICAgICAgICAgICAgPG1lc2ggcG9zaXRpb249e2hvdmVyUG9zfT5cbiAgICAgICAgICAgICAgICAgICAgIDxzcGhlcmVHZW9tZXRyeSBhcmdzPXtbMjAsIDE2LCAxNl19IC8+XG4gICAgICAgICAgICAgICAgICAgICA8bWVzaEJhc2ljTWF0ZXJpYWwgY29sb3I9e2FwcFNldHRpbmdzLnNlbGVjdGlvbkNvbG9yfSB0cmFuc3BhcmVudCBvcGFjaXR5PXswLjZ9IGRlcHRoVGVzdD17ZmFsc2V9IC8+XG4gICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICApfVxuICAgICAgICA8L2dyb3VwPlxuICAgICk7XG59O1xuXG4vLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbi8vIFNIQVJFRCBUT09MOiBDT05ORUNUXG4vLyBUaGlzIHRvb2wgYWxzbyBleGlzdHMgaW4gc3JjL3VpL3RhYnMvRHJhd0NhbnZhc1RhYi5qc3guXG4vLyBJZiBtb2RpZnlpbmcgbG9naWMsIHVwZGF0ZSBCT1RIIGZpbGVzIGFuZCBydW4gQ2hlY2twb2ludCBGLlxuLy8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXG4vLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbi8vIFNIQVJFRCBUT09MOiBTVFJFVENIXG4vLyBUaGlzIHRvb2wgYWxzbyBleGlzdHMgaW4gc3JjL3VpL3RhYnMvRHJhd0NhbnZhc1RhYi5qc3guXG4vLyBJZiBtb2RpZnlpbmcgbG9naWMsIHVwZGF0ZSBCT1RIIGZpbGVzIGFuZCBydW4gQ2hlY2twb2ludCBGLlxuLy8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXG5jb25zdCBFbmRwb2ludFNuYXBMYXllciA9ICgpID0+IHtcbiAgICBjb25zdCBhcHBTZXR0aW5ncyA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmFwcFNldHRpbmdzKTtcbiAgICBjb25zdCBjYW52YXNNb2RlID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuY2FudmFzTW9kZSk7XG4gICAgY29uc3Qgc2V0Q2FudmFzTW9kZSA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLnNldENhbnZhc01vZGUpO1xuICAgIGNvbnN0IGRhdGFUYWJsZSA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmRhdGFUYWJsZSk7XG4gICAgY29uc3QgdXBkYXRlRGF0YVRhYmxlID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUudXBkYXRlRGF0YVRhYmxlKTtcbiAgICBjb25zdCBwdXNoSGlzdG9yeSA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLnB1c2hIaXN0b3J5KTtcbiAgICBjb25zdCB7IGRpc3BhdGNoIH0gPSB1c2VBcHBDb250ZXh0KCk7XG5cbiAgICBjb25zdCBbY29ubmVjdERyYWZ0LCBzZXRDb25uZWN0RHJhZnRdID0gdXNlU3RhdGUobnVsbCk7XG4gICAgY29uc3QgW2N1cnNvclBvcywgc2V0Q3Vyc29yUG9zXSA9IHVzZVN0YXRlKG5ldyBUSFJFRS5WZWN0b3IzKCkpO1xuXG4gICAgLy8gQWN0aXZlIGluIENPTk5FQ1Qgb3IgU1RSRVRDSCBtb2RlXG4gICAgaWYgKGNhbnZhc01vZGUgIT09ICdDT05ORUNUJyAmJiBjYW52YXNNb2RlICE9PSAnU1RSRVRDSCcpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3Qgc25hcFJhZGl1cyA9IDUwOyAvLyBtbVxuXG4gICAgY29uc3QgaGFuZGxlUG9pbnRlck1vdmUgPSAoZSkgPT4ge1xuICAgICAgICBsZXQgcHQgPSBlLnBvaW50LmNsb25lKCk7XG5cbiAgICAgICAgaWYgKGNvbm5lY3REcmFmdCAmJiB1c2VTdG9yZS5nZXRTdGF0ZSgpLm9ydGhvTW9kZSkge1xuICAgICAgICAgICAgY29uc3QgcmF3RGVsdGEgPSBwdC5jbG9uZSgpLnN1Yihjb25uZWN0RHJhZnQuZnJvbVBvc2l0aW9uKTtcbiAgICAgICAgICAgIGNvbnN0IGFic1ggPSBNYXRoLmFicyhyYXdEZWx0YS54KTtcbiAgICAgICAgICAgIGNvbnN0IGFic1kgPSBNYXRoLmFicyhyYXdEZWx0YS55KTtcbiAgICAgICAgICAgIGNvbnN0IGFic1ogPSBNYXRoLmFicyhyYXdEZWx0YS56KTtcbiAgICAgICAgICAgIGlmIChhYnNYID49IGFic1kgJiYgYWJzWCA+PSBhYnNaKSB7IHJhd0RlbHRhLnkgPSAwOyByYXdEZWx0YS56ID0gMDsgfVxuICAgICAgICAgICAgZWxzZSBpZiAoYWJzWSA+PSBhYnNYICYmIGFic1kgPj0gYWJzWikgeyByYXdEZWx0YS54ID0gMDsgcmF3RGVsdGEueiA9IDA7IH1cbiAgICAgICAgICAgIGVsc2UgeyByYXdEZWx0YS54ID0gMDsgcmF3RGVsdGEueSA9IDA7IH1cbiAgICAgICAgICAgIHB0ID0gY29ubmVjdERyYWZ0LmZyb21Qb3NpdGlvbi5jbG9uZSgpLmFkZChyYXdEZWx0YSk7XG4gICAgICAgIH1cblxuICAgICAgICBzZXRDdXJzb3JQb3MocHQpO1xuICAgICAgICBsZXQgbmVhcmVzdCA9IG51bGw7XG4gICAgICAgIGxldCBtaW5EaXN0ID0gc25hcFJhZGl1cztcblxuICAgICAgICBkYXRhVGFibGUuZm9yRWFjaCgocm93KSA9PiB7XG4gICAgICAgICAgICBbJ2VwMScsICdlcDInXS5mb3JFYWNoKGVwS2V5ID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBlcCA9IHJvd1tlcEtleV07XG4gICAgICAgICAgICAgICAgaWYgKGVwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHB0ID0gbmV3IFRIUkVFLlZlY3RvcjMocGFyc2VGbG9hdChlcC54KSwgcGFyc2VGbG9hdChlcC55KSwgcGFyc2VGbG9hdChlcC56KSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGQgPSBwdC5kaXN0YW5jZVRvKGUucG9pbnQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZCA8IG1pbkRpc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1pbkRpc3QgPSBkO1xuICAgICAgICAgICAgICAgICAgICAgICAgbmVhcmVzdCA9IHsgcm93LCBlcEtleSwgcG9zaXRpb246IHB0IH07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gV2UgYWxyZWFkeSB1c2UgdXNlU3RvcmUoY3Vyc29yU25hcFBvaW50KSBnbG9iYWxseSBidXQgaGVyZSB3ZSBuZWVkXG4gICAgICAgIC8vIHRvIG1hbmFnZSBjbGljay9kcmFnIHNwZWNpZmljYWxseSBmb3Igc3RyZXRjaGluZyBlbmRwb2ludHMuXG4gICAgICAgIC8vIFdlJ2xsIHJlbHkgb24gdGhlIGdsb2JhbCBzbmFwIHBvaW50IGZvciB2aXN1YWxzLCBidXQgd2UgaGFuZGxlIHRoZSBkcmFnZ2luZyBoZXJlLlxuICAgIH07XG5cbiAgICBjb25zdCBoYW5kbGVQb2ludGVyRG93biA9IChlKSA9PiB7XG4gICAgICAgIC8vIFdlIGhhbmRsZSBsb2dpYyBpbiBQb2ludGVyVXAgZm9yIGNsaWNrLXRvLWNvbm5lY3Qgbm93XG4gICAgfTtcblxuICAgIGNvbnN0IGhhbmRsZVBvaW50ZXJVcCA9IChlKSA9PiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cbiAgICAgICAgdHJ5IHtcblxuICAgICAgICBsZXQgbmVhcmVzdCA9IG51bGw7XG4gICAgICAgIGxldCBtaW5EaXN0ID0gc25hcFJhZGl1cztcblxuICAgICAgICBkYXRhVGFibGUuZm9yRWFjaCgocm93KSA9PiB7XG4gICAgICAgICAgICBbJ2VwMScsICdlcDInXS5mb3JFYWNoKGVwS2V5ID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBlcCA9IHJvd1tlcEtleV07XG4gICAgICAgICAgICAgICAgaWYgKGVwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHB0ID0gbmV3IFRIUkVFLlZlY3RvcjMocGFyc2VGbG9hdChlcC54KSwgcGFyc2VGbG9hdChlcC55KSwgcGFyc2VGbG9hdChlcC56KSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGQgPSBwdC5kaXN0YW5jZVRvKGUucG9pbnQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZCA8IG1pbkRpc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1pbkRpc3QgPSBkO1xuICAgICAgICAgICAgICAgICAgICAgICAgbmVhcmVzdCA9IHsgcm93SW5kZXg6IHJvdy5fcm93SW5kZXgsIGVwS2V5LCBwb3NpdGlvbjogcHQgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBJZiB3ZSBkb24ndCBoYXZlIGEgZHJhZnQgeWV0LCBzZXQgdGhlIGRyYWZ0IChGaXJzdCBDbGljaylcbiAgICAgICAgaWYgKCFjb25uZWN0RHJhZnQpIHtcbiAgICAgICAgICAgIGlmIChuZWFyZXN0KSB7XG4gICAgICAgICAgICAgICAgc2V0Q29ubmVjdERyYWZ0KHsgZnJvbVJvd0luZGV4OiBuZWFyZXN0LnJvd0luZGV4LCBmcm9tRVA6IG5lYXJlc3QuZXBLZXksIGZyb21Qb3NpdGlvbjogbmVhcmVzdC5wb3NpdGlvbiB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNlY29uZCBjbGljazogSWYgZHJvcHBlZCBvbiBhbm90aGVyIHZhbGlkIHNuYXAgcG9pbnRcbiAgICAgICAgaWYgKG5lYXJlc3QgJiYgKG5lYXJlc3Qucm93SW5kZXggIT09IGNvbm5lY3REcmFmdC5mcm9tUm93SW5kZXggfHwgbmVhcmVzdC5lcEtleSAhPT0gY29ubmVjdERyYWZ0LmZyb21FUCkpIHtcbiAgICAgICAgICAgIHB1c2hIaXN0b3J5KGNhbnZhc01vZGUgPT09ICdTVFJFVENIJyA/ICdTdHJldGNoIFBpcGUnIDogJ1NuYXAgQ29ubmVjdCcpO1xuXG4gICAgICAgICAgICBjb25zdCBzb3VyY2VSb3cgPSBkYXRhVGFibGUuZmluZChyID0+IHIuX3Jvd0luZGV4ID09PSBjb25uZWN0RHJhZnQuZnJvbVJvd0luZGV4KTtcbiAgICAgICAgICAgIGlmIChzb3VyY2VSb3cpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRQb3MgPSBuZWFyZXN0LnBvc2l0aW9uO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZVBvcyA9IGNvbm5lY3REcmFmdC5mcm9tUG9zaXRpb247XG5cbiAgICAgICAgICAgICAgICBjb25zdCB1cGRhdGVkVGFibGUgPSBbLi4uZGF0YVRhYmxlXTtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2VJZHhJbkFycmF5ID0gdXBkYXRlZFRhYmxlLmZpbmRJbmRleChyID0+IHIuX3Jvd0luZGV4ID09PSBjb25uZWN0RHJhZnQuZnJvbVJvd0luZGV4KTtcblxuICAgICAgICAgICAgICAgIGlmIChjYW52YXNNb2RlID09PSAnU1RSRVRDSCcpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gU1RSRVRDSCBNT0RFOiBVcGRhdGUgdGhlIGVuZHBvaW50IG9mIHRoZSBleGlzdGluZyBwaXBlXG4gICAgICAgICAgICAgICAgICAgIGlmIChzb3VyY2VJZHhJbkFycmF5ICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdXBkYXRlZFJvdyA9IHsgLi4udXBkYXRlZFRhYmxlW3NvdXJjZUlkeEluQXJyYXldIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVkUm93W2Nvbm5lY3REcmFmdC5mcm9tRVBdID0geyB4OiB0YXJnZXRQb3MueCwgeTogdGFyZ2V0UG9zLnksIHo6IHRhcmdldFBvcy56IH07XG4gICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVkVGFibGVbc291cmNlSWR4SW5BcnJheV0gPSB1cGRhdGVkUm93O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBkaXNwYXRjaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0FQUExZX0dBUF9GSVgnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgdXBkYXRlZFRhYmxlIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgdXNlU3RvcmUuZ2V0U3RhdGUoKS5zZXREYXRhVGFibGUodXBkYXRlZFRhYmxlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BhdGNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnQUREX0xPRycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF5bG9hZDogeyB0eXBlOiAnQXBwbGllZC9GaXgnLCBzdGFnZTogJ1NUUkVUQ0hfVE9PTCcsIG1lc3NhZ2U6IGBTdHJldGNoZWQgUm93ICR7c291cmNlUm93Ll9yb3dJbmRleH0gdG8gUm93ICR7bmVhcmVzdC5yb3dJbmRleH0uYCB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIENPTk5FQ1QgTU9ERTogU3ludGhlc2l6ZSBuZXcgYnJpZGdlIHBpcGUgaW5zdGVhZCBvZiBzdHJldGNoaW5nXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld0JyaWRnZVBpcGUgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnUElQRScsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcDE6IHsgeDogc291cmNlUG9zLngsIHk6IHNvdXJjZVBvcy55LCB6OiBzb3VyY2VQb3MueiB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgZXAyOiB7IHg6IHRhcmdldFBvcy54LCB5OiB0YXJnZXRQb3MueSwgejogdGFyZ2V0UG9zLnogfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGJvcmU6IHNvdXJjZVJvdy5ib3JlIHx8IDEwMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBpcGVsaW5lUmVmOiBgJHtzb3VyY2VSb3cucGlwZWxpbmVSZWYgfHwgJ1VOS05PV04nfV9icmlkZ2VgLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2tleTogJ1BJUEUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2ExOiBzb3VyY2VSb3cuY2ExIHx8IHNvdXJjZVJvdy5DQTEgfHwgJycsXG4gICAgICAgICAgICAgICAgICAgICAgICBjYTI6IHNvdXJjZVJvdy5jYTIgfHwgc291cmNlUm93LkNBMiB8fCAnJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhMzogc291cmNlUm93LmNhMyB8fCBzb3VyY2VSb3cuQ0EzIHx8ICcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2E0OiBzb3VyY2VSb3cuY2E0IHx8IHNvdXJjZVJvdy5DQTQgfHwgJycsXG4gICAgICAgICAgICAgICAgICAgICAgICBjYTU6IHNvdXJjZVJvdy5jYTUgfHwgc291cmNlUm93LkNBNSB8fCAnJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhNjogc291cmNlUm93LmNhNiB8fCBzb3VyY2VSb3cuQ0E2IHx8ICcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2E3OiBzb3VyY2VSb3cuY2E3IHx8IHNvdXJjZVJvdy5DQTcgfHwgJycsXG4gICAgICAgICAgICAgICAgICAgICAgICBjYTg6IHNvdXJjZVJvdy5jYTggfHwgc291cmNlUm93LkNBOCB8fCAnJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhOTogc291cmNlUm93LmNhOSB8fCBzb3VyY2VSb3cuQ0E5IHx8ICcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2ExMDogc291cmNlUm93LmNhMTAgfHwgc291cmNlUm93LkNBMTAgfHwgJycsXG4gICAgICAgICAgICAgICAgICAgICAgICB0YWc6IGAke3NvdXJjZVJvdy5waXBlbGluZVJlZiB8fCAnVU5LTk9XTid9XzNEVG9wb0JyaWRnZWBcbiAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBGaW5kIHRoZSBoaWdoZXN0IGV4aXN0aW5nIF9yb3dJbmRleCB0byBlbnN1cmUgdW5pcXVlbmVzcyB3aXRob3V0IGNvcnJ1cHRpbmcgb3RoZXJzXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1heFJvd0luZGV4ID0gTWF0aC5tYXgoLi4udXBkYXRlZFRhYmxlLm1hcChyID0+IHIuX3Jvd0luZGV4IHx8IDApKTtcbiAgICAgICAgICAgICAgICAgICAgbmV3QnJpZGdlUGlwZS5fcm93SW5kZXggPSBtYXhSb3dJbmRleCArIDE7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gU3BsaWNlIHRoZSBuZXcgYnJpZGdlIHBpcGUgaW50byB0aGUgdGFibGUsIGluc2VydGVkIGJldHdlZW4gdGhlIHNvdXJjZSBhbmQgdGFyZ2V0IHJvd3MuXG4gICAgICAgICAgICAgICAgICAgIC8vIEluc2VydCBhZnRlciBzb3VyY2Ugcm93IChvciBhcHBlbmQgaWYgbm90IGZvdW5kKVxuICAgICAgICAgICAgICAgICAgICBpZiAoc291cmNlSWR4SW5BcnJheSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlZFRhYmxlLnNwbGljZShzb3VyY2VJZHhJbkFycmF5ICsgMSwgMCwgbmV3QnJpZGdlUGlwZSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZWRUYWJsZS5wdXNoKG5ld0JyaWRnZVBpcGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gUmUtaW5kZXggYWxsIGVsZW1lbnRzIHNlcXVlbnRpYWxseVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBzZXF1ZW50aWFsVGFibGUgPSB1cGRhdGVkVGFibGUubWFwKChyLCBpKSA9PiAoeyAuLi5yLCBfcm93SW5kZXg6IGkgKyAxIH0pKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBEaXNwYXRjaCBBUFBMWV9HQVBfRklYIHdoaWNoIHJlcGxhY2VzIHRoZSBmdWxsIHRhYmxlIGluIEFwcENvbnRleHRcbiAgICAgICAgICAgICAgICAgICAgZGlzcGF0Y2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0FQUExZX0dBUF9GSVgnLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF5bG9hZDogeyB1cGRhdGVkVGFibGU6IHNlcXVlbnRpYWxUYWJsZSB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIE1pcnJvciB0byBadXN0YW5kIHN0b3JlXG4gICAgICAgICAgICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0RGF0YVRhYmxlKHNlcXVlbnRpYWxUYWJsZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgZGlzcGF0Y2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0FERF9MT0cnLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF5bG9hZDogeyB0eXBlOiAnQXBwbGllZC9GaXgnLCBzdGFnZTogJ0NPTk5FQ1RfVE9PTCcsIG1lc3NhZ2U6IGBCcmlkZ2VkIFJvdyAke3NvdXJjZVJvdy5fcm93SW5kZXh9IGFuZCBSb3cgJHtuZWFyZXN0LnJvd0luZGV4fSB3aXRoIGEgbmV3IFBJUEUuYCB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHNldENvbm5lY3REcmFmdChudWxsKTtcbiAgICAgICAgc2V0Q2FudmFzTW9kZSgnVklFVycpO1xuXG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgZGJnLmVycm9yKCdFTkRQT0lOVF9TTkFQJywgJ0ZhdGFsIGVycm9yIGR1cmluZyBjb25uZWN0L3N0cmV0Y2ggb3BlcmF0aW9uJywgeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6ICdBRERfTE9HJywgcGF5bG9hZDogeyB0eXBlOiAnRXJyb3InLCBzdGFnZTogJ0VORFBPSU5UX1NOQVAnLCBtZXNzYWdlOiBgQ29ubmVjdC9TdHJldGNoIGZhaWxlZDogJHtlcnIubWVzc2FnZX1gIH0gfSk7XG4gICAgICAgICAgICBzZXRDb25uZWN0RHJhZnQobnVsbCk7XG4gICAgICAgICAgICBzZXRDYW52YXNNb2RlKCdWSUVXJyk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGdyb3VwPlxuICAgICAgICAgICAgey8qIFRyYW5zcGFyZW50IGNhcHR1cmUgcGxhbmUgZm9yIENPTk5FQ1Qgb3IgU1RSRVRDSCBtb2RlICovfVxuICAgICAgICAgICAgPG1lc2hcbiAgICAgICAgICAgICAgICBzY2FsZT17MTAwMDAwfVxuICAgICAgICAgICAgICAgIHJvdGF0aW9uPXtbLU1hdGguUEkgLyAyLCAwLCAwXX1cbiAgICAgICAgICAgICAgICBvblBvaW50ZXJNb3ZlPXtoYW5kbGVQb2ludGVyTW92ZX1cbiAgICAgICAgICAgICAgICBvblBvaW50ZXJEb3duPXtoYW5kbGVQb2ludGVyRG93bn1cbiAgICAgICAgICAgICAgICBvblBvaW50ZXJVcD17aGFuZGxlUG9pbnRlclVwfVxuICAgICAgICAgICAgICAgIHJlbmRlck9yZGVyPXstMX1cbiAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICA8cGxhbmVHZW9tZXRyeSAvPlxuICAgICAgICAgICAgICAgIDxtZXNoQmFzaWNNYXRlcmlhbCB0cmFuc3BhcmVudCBvcGFjaXR5PXswfSBkZXB0aFdyaXRlPXtmYWxzZX0gLz5cbiAgICAgICAgICAgIDwvbWVzaD5cblxuICAgICAgICAgICAgey8qIERyYXcgc25hcCB0YXJnZXRzIG9uIGV2ZXJ5IEVQICovfVxuICAgICAgICAgICAge2RhdGFUYWJsZS5tYXAocm93ID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwdHMgPSBbXTtcbiAgICAgICAgICAgICAgICBpZiAocm93LmVwMSkgcHRzLnB1c2gobmV3IFRIUkVFLlZlY3RvcjMocGFyc2VGbG9hdChyb3cuZXAxLngpLCBwYXJzZUZsb2F0KHJvdy5lcDEueSksIHBhcnNlRmxvYXQocm93LmVwMS56KSkpO1xuICAgICAgICAgICAgICAgIGlmIChyb3cuZXAyKSBwdHMucHVzaChuZXcgVEhSRUUuVmVjdG9yMyhwYXJzZUZsb2F0KHJvdy5lcDIueCksIHBhcnNlRmxvYXQocm93LmVwMi55KSwgcGFyc2VGbG9hdChyb3cuZXAyLnopKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHB0cy5tYXAoKHB0LCBpKSA9PiAoXG4gICAgICAgICAgICAgICAgICAgIDxtZXNoIGtleT17YHNuYXAtJHtyb3cuX3Jvd0luZGV4fS0ke2l9YH0gcG9zaXRpb249e3B0fSByZW5kZXJPcmRlcj17OTk5fT5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGhlcmVHZW9tZXRyeSBhcmdzPXtbMjAsIDE2LCAxNl19IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICA8bWVzaEJhc2ljTWF0ZXJpYWwgY29sb3I9e2FwcFNldHRpbmdzLnNlbGVjdGlvbkNvbG9yfSB0cmFuc3BhcmVudCBvcGFjaXR5PXswLjV9IGRlcHRoVGVzdD17ZmFsc2V9IC8+XG4gICAgICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgICApKTtcbiAgICAgICAgICAgIH0pfVxuXG4gICAgICAgICAgICB7LyogRHJhdyBhY3RpdmUgY29ubmVjdGlvbiBwcmV2aWV3IGxpbmUgKi99XG4gICAgICAgICAgICB7Y29ubmVjdERyYWZ0ICYmICgoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RhcnQgPSBjb25uZWN0RHJhZnQuZnJvbVBvc2l0aW9uO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuZCA9IGN1cnNvclBvcztcbiAgICAgICAgICAgICAgICBjb25zdCB2ZWMgPSBuZXcgVEhSRUUuVmVjdG9yMygpLnN1YlZlY3RvcnMoZW5kLCBzdGFydCk7XG4gICAgICAgICAgICAgICAgY29uc3QgbGVuID0gdmVjLmxlbmd0aCgpO1xuICAgICAgICAgICAgICAgIGlmIChsZW4gPCAwLjEpIHJldHVybiBudWxsOyAvLyBBdm9pZCByZW5kZXJpbmcgMC1sZW5ndGggY3lsaW5kZXJzXG4gICAgICAgICAgICAgICAgY29uc3QgbWlkID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5hZGRWZWN0b3JzKHN0YXJ0LCBlbmQpLm11bHRpcGx5U2NhbGFyKDAuNSk7XG4gICAgICAgICAgICAgICAgY29uc3QgcSA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCkuc2V0RnJvbVVuaXRWZWN0b3JzKG5ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApLCB2ZWMuY2xvbmUoKS5ub3JtYWxpemUoKSk7XG4gICAgICAgICAgICAgICAgY29uc3QgY29sb3IgPSBjYW52YXNNb2RlID09PSAnU1RSRVRDSCcgPyAnIzEwYjk4MScgOiAnI2Y1OWUwYic7IC8vIEVtZXJhbGQgZm9yIHN0cmV0Y2gsIEFtYmVyIGZvciBjb25uZWN0XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17bWlkfSBxdWF0ZXJuaW9uPXtxfSByZW5kZXJPcmRlcj17OTk4fT5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxjeWxpbmRlckdlb21ldHJ5IGFyZ3M9e1sxNSwgMTUsIGxlbiwgOF19IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICA8bWVzaFN0YW5kYXJkTWF0ZXJpYWwgY29sb3I9e2NvbG9yfSB0cmFuc3BhcmVudCBvcGFjaXR5PXswLjZ9IGRlcHRoVGVzdD17ZmFsc2V9IC8+XG4gICAgICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSkoKX1cbiAgICAgICAgPC9ncm91cD5cbiAgICApO1xufTtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gR2FwIFJhZGFyIExheWVyXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jb25zdCBHYXBSYWRhckxheWVyID0gKCkgPT4ge1xuICAgIGNvbnN0IHNob3dHYXBSYWRhciA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLnNob3dHYXBSYWRhcik7XG4gICAgY29uc3QgZGF0YVRhYmxlID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuZGF0YVRhYmxlKTtcblxuICAgIC8vIEZvciBwdWxzaW5nIGFuaW1hdGlvblxuICAgIGNvbnN0IG1hdGVyaWFsUmVmID0gdXNlUmVmKCk7XG4gICAgY29uc3Qgc3BoZXJlUmVmID0gdXNlUmVmKCk7XG5cbiAgICB1c2VGcmFtZSgoeyBjbG9jayB9KSA9PiB7XG4gICAgICAgIGlmIChzaG93R2FwUmFkYXIpIHtcbiAgICAgICAgICAgIGNvbnN0IHRpbWUgPSBjbG9jay5nZXRFbGFwc2VkVGltZSgpO1xuICAgICAgICAgICAgY29uc3Qgc2NhbGUgPSAxICsgTWF0aC5zaW4odGltZSAqIDMpICogMC4yOyAvLyBwdWxzZSBiZXR3ZWVuIDAuOCBhbmQgMS4yXG4gICAgICAgICAgICBjb25zdCBvcGFjaXR5ID0gMC42ICsgTWF0aC5zaW4odGltZSAqIDMpICogMC4zOyAvLyBwdWxzZSBiZXR3ZWVuIDAuMyBhbmQgMC45XG5cbiAgICAgICAgICAgIC8vIE9ubHkgdXBkYXRlIGlmIG1hdGVyaWFscy9tZXNoZXMgZXhpc3QuIFNpbmNlIHdlIG1pZ2h0IGhhdmUgbXVsdGlwbGUgZ2FwcyxcbiAgICAgICAgICAgIC8vIHdlIGFuaW1hdGUgYSBnbG9iYWwgbWF0ZXJpYWwgb3IganVzdCByZWx5IG9uIENTUy1saWtlIHNjYWxlP1xuICAgICAgICAgICAgLy8gQWN0dWFsbHksIHdlIGNhbiBqdXN0IGFwcGx5IGl0IHRvIGEgc2hhcmVkIHZhbHVlIG9yIGxldCB1c2VGcmFtZSBtYXAgb3ZlciByZWZzLlxuICAgICAgICAgICAgLy8gQSBzaW1wbGVyIHdheTogd2UnbGwgYW5pbWF0ZSBhIHNoYXJlZCBzY2FsZS9vcGFjaXR5IHVuaWZvcm0vcHJvcGVydHkgb24gdGhlIGdyb3VwIGxldmVsXG4gICAgICAgICAgICAvLyBidXQgZm9yIHNpbXBsaWNpdHksIGxldCdzIGp1c3QgY3JlYXRlIGEgcHVsc2luZyBjb21wb25lbnQgZm9yIGVhY2ggZ2FwLlxuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBnYXBzID0gdXNlTWVtbygoKSA9PiB7XG4gICAgICAgIGlmICghc2hvd0dhcFJhZGFyIHx8IGRhdGFUYWJsZS5sZW5ndGggPT09IDApIHJldHVybiBbXTtcbiAgICAgICAgY29uc3QgZm91bmQgPSBbXTtcbiAgICAgICAgY29uc3QgdG9wb2xvZ3lSb3dzID0gZGF0YVRhYmxlLmZpbHRlcihyID0+IChyLnR5cGUgfHwgJycpLnRvVXBwZXJDYXNlKCkgIT09ICdTVVBQT1JUJyAmJiAoci5lcDEgfHwgci5lcDIpKTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRvcG9sb2d5Um93cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGVsQSA9IHRvcG9sb2d5Um93c1tpXTtcbiAgICAgICAgICAgIGNvbnN0IGVsQiA9IHRvcG9sb2d5Um93c1tpICsgMV07XG4gICAgICAgICAgICBpZiAoZWxBLmVwMiAmJiBlbEIuZXAxKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHRBID0gbmV3IFRIUkVFLlZlY3RvcjMoZWxBLmVwMi54LCBlbEEuZXAyLnksIGVsQS5lcDIueik7XG4gICAgICAgICAgICAgICAgY29uc3QgcHRCID0gbmV3IFRIUkVFLlZlY3RvcjMoZWxCLmVwMS54LCBlbEIuZXAxLnksIGVsQi5lcDEueik7XG4gICAgICAgICAgICAgICAgY29uc3QgZGlzdCA9IHB0QS5kaXN0YW5jZVRvKHB0Qik7XG4gICAgICAgICAgICAgICAgaWYgKGRpc3QgPiAwICYmIGRpc3QgPD0gMjUuMCkge1xuICAgICAgICAgICAgICAgICAgICBmb3VuZC5wdXNoKHsgcHRBLCBwdEIsIGRpc3QsIG1pZDogcHRBLmNsb25lKCkubGVycChwdEIsIDAuNSkgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmb3VuZDtcbiAgICB9LCBbc2hvd0dhcFJhZGFyLCBkYXRhVGFibGVdKTtcblxuICAgIGlmICghc2hvd0dhcFJhZGFyIHx8IGdhcHMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxncm91cD5cbiAgICAgICAgICAgIHtnYXBzLm1hcCgoZ2FwLCBpKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29sb3IgPSBnYXAuZGlzdCA8PSA2LjAgPyAnI2Y5NzMxNicgOiAnI2VmNDQ0NCc7IC8vIE9yYW5nZSBmb3IgZml4YWJsZSwgUmVkIGZvciBpbnNlcnQgcGlwZVxuICAgICAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgICAgICAgIDxQdWxzaW5nR2FwIGtleT17YGdhcC0ke2l9YH0gZ2FwPXtnYXB9IGNvbG9yPXtjb2xvcn0gLz5cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSl9XG4gICAgICAgIDwvZ3JvdXA+XG4gICAgKTtcbn07XG5cbmNvbnN0IFB1bHNpbmdHYXAgPSAoeyBnYXAsIGNvbG9yIH0pID0+IHtcbiAgICBjb25zdCBtZXNoUmVmQSA9IHVzZVJlZigpO1xuICAgIGNvbnN0IG1hdFJlZkEgPSB1c2VSZWYoKTtcbiAgICBjb25zdCBtZXNoUmVmQiA9IHVzZVJlZigpO1xuICAgIGNvbnN0IG1hdFJlZkIgPSB1c2VSZWYoKTtcblxuICAgIHVzZUZyYW1lKCh7IGNsb2NrIH0pID0+IHtcbiAgICAgICAgaWYgKCFtZXNoUmVmQS5jdXJyZW50IHx8ICFtYXRSZWZBLmN1cnJlbnQgfHwgIW1lc2hSZWZCLmN1cnJlbnQgfHwgIW1hdFJlZkIuY3VycmVudCkgcmV0dXJuO1xuICAgICAgICBjb25zdCB0aW1lID0gY2xvY2suZ2V0RWxhcHNlZFRpbWUoKTtcbiAgICAgICAgY29uc3QgcyA9IDEgKyBNYXRoLnNpbih0aW1lICogNSkgKiAwLjM1OyAvLyBQdWxzZSBzY2FsZVxuICAgICAgICBtZXNoUmVmQS5jdXJyZW50LnNjYWxlLnNldChzLCBzLCBzKTtcbiAgICAgICAgbWVzaFJlZkIuY3VycmVudC5zY2FsZS5zZXQocywgcywgcyk7XG4gICAgICAgIGNvbnN0IG9wYWNpdHkgPSAwLjUgKyBNYXRoLmFicyhNYXRoLnNpbih0aW1lICogNSkpICogMC40O1xuICAgICAgICBtYXRSZWZBLmN1cnJlbnQub3BhY2l0eSA9IG9wYWNpdHk7XG4gICAgICAgIG1hdFJlZkIuY3VycmVudC5vcGFjaXR5ID0gb3BhY2l0eTtcbiAgICB9KTtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxncm91cD5cbiAgICAgICAgICAgIHsvKiBHbG93IGVmZmVjdCAqL31cbiAgICAgICAgICAgIDxMaW5lIHBvaW50cz17W2dhcC5wdEEsIGdhcC5wdEJdfSBjb2xvcj17Y29sb3J9IGxpbmVXaWR0aD17MTJ9IHRyYW5zcGFyZW50IG9wYWNpdHk9ezAuM30gZGVwdGhUZXN0PXtmYWxzZX0gLz5cbiAgICAgICAgICAgIHsvKiBDb3JlIGxpbmUgKi99XG4gICAgICAgICAgICA8TGluZSBwb2ludHM9e1tnYXAucHRBLCBnYXAucHRCXX0gY29sb3I9e2NvbG9yfSBsaW5lV2lkdGg9ezR9IGRhc2hlZCBkYXNoU2l6ZT17NX0gZ2FwU2l6ZT17Mn0gZGVwdGhUZXN0PXtmYWxzZX0gLz5cblxuICAgICAgICAgICAgey8qIFB1bHNpbmcgU3BoZXJlcyBhdCBlbmRwb2ludHMgZm9yIHZpc2liaWxpdHkgKi99XG4gICAgICAgICAgICA8bWVzaCBwb3NpdGlvbj17Z2FwLnB0QX0gcmVmPXttZXNoUmVmQX0+XG4gICAgICAgICAgICAgICAgPHNwaGVyZUdlb21ldHJ5IGFyZ3M9e1syMCwgMTYsIDE2XX0gLz5cbiAgICAgICAgICAgICAgICA8bWVzaEJhc2ljTWF0ZXJpYWwgcmVmPXttYXRSZWZBfSBjb2xvcj17Y29sb3J9IHRyYW5zcGFyZW50IG9wYWNpdHk9ezAuN30gZGVwdGhUZXN0PXtmYWxzZX0gLz5cbiAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgIDxtZXNoIHBvc2l0aW9uPXtnYXAucHRCfSByZWY9e21lc2hSZWZCfT5cbiAgICAgICAgICAgICAgICA8c3BoZXJlR2VvbWV0cnkgYXJncz17WzIwLCAxNiwgMTZdfSAvPlxuICAgICAgICAgICAgICAgIDxtZXNoQmFzaWNNYXRlcmlhbCByZWY9e21hdFJlZkJ9IGNvbG9yPXtjb2xvcn0gdHJhbnNwYXJlbnQgb3BhY2l0eT17MC43fSBkZXB0aFRlc3Q9e2ZhbHNlfSAvPlxuICAgICAgICAgICAgPC9tZXNoPlxuXG4gICAgICAgICAgICB7LyogQmlsbGJvYXJkIHRleHQgKi99XG4gICAgICAgICAgICA8VGV4dCBwb3NpdGlvbj17W2dhcC5taWQueCwgZ2FwLm1pZC55ICsgMTUsIGdhcC5taWQuel19IGNvbG9yPXtjb2xvcn0gZm9udFNpemU9ezIwfSBmb250V2VpZ2h0PVwiYm9sZFwiIGFuY2hvclg9XCJjZW50ZXJcIiBvdXRsaW5lV2lkdGg9ezJ9IG91dGxpbmVDb2xvcj1cIiMwMDBcIiBkZXB0aFRlc3Q9e2ZhbHNlfT5cbiAgICAgICAgICAgICAgICDimqAge2dhcC5kaXN0LnRvRml4ZWQoMSl9bW0gR2FwXG4gICAgICAgICAgICA8L1RleHQ+XG4gICAgICAgIDwvZ3JvdXA+XG4gICAgKTtcbn07XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEVQIExhYmVsc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuY29uc3QgRVBMYWJlbHNMYXllciA9ICgpID0+IHtcbiAgICBjb25zdCBhcHBTZXR0aW5ncyA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmFwcFNldHRpbmdzKTtcbiAgICBjb25zdCBzaG93Um93TGFiZWxzID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuc2hvd1Jvd0xhYmVscyk7XG4gICAgY29uc3Qgc2hvd1JlZkxhYmVscyA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLnNob3dSZWZMYWJlbHMpO1xuICAgIGNvbnN0IGRhdGFUYWJsZSA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmRhdGFUYWJsZSk7XG4gICAgY29uc3QgeyBkaXNwYXRjaCB9ID0gdXNlQXBwQ29udGV4dCgpO1xuXG4gICAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICAgICAgaWYgKChzaG93Um93TGFiZWxzIHx8IHNob3dSZWZMYWJlbHMpICYmIGRhdGFUYWJsZS5sZW5ndGggPiA1MDApIHtcbiAgICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IHsgc3RhZ2U6IFwiVUlcIiwgdHlwZTogXCJXYXJuaW5nXCIsIG1lc3NhZ2U6IFwiTGFiZWxzIGRpc2FibGVkOiA+NTAwIGVsZW1lbnRzIGNhdXNlcyBwZXJmb3JtYW5jZSBpc3N1ZXMuXCIgfSB9KTtcbiAgICAgICAgICAgIGlmIChzaG93Um93TGFiZWxzKSB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldFNob3dSb3dMYWJlbHMoZmFsc2UpO1xuICAgICAgICAgICAgaWYgKHNob3dSZWZMYWJlbHMpIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0U2hvd1JlZkxhYmVscyhmYWxzZSk7XG4gICAgICAgIH1cbiAgICB9LCBbc2hvd1Jvd0xhYmVscywgc2hvd1JlZkxhYmVscywgZGF0YVRhYmxlLmxlbmd0aCwgZGlzcGF0Y2hdKTtcblxuICAgIGlmICgoIXNob3dSb3dMYWJlbHMgJiYgIXNob3dSZWZMYWJlbHMpIHx8IGRhdGFUYWJsZS5sZW5ndGggPiA1MDApIHJldHVybiBudWxsO1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGdyb3VwPlxuICAgICAgICAgICAge2RhdGFUYWJsZS5tYXAoKGVsLCBpKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFlbC5lcDEgJiYgIWVsLmVwMikgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgY29uc3QgcHQgPSBlbC5lcDEgfHwgZWwuZXAyO1xuICAgICAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgICAgICAgIDxSZWFjdC5GcmFnbWVudCBrZXk9e2BlcGxhYmVscy0ke2l9YH0+XG4gICAgICAgICAgICAgICAgICAgICAgICB7c2hvd1Jvd0xhYmVscyAmJiAoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPFRleHQgcG9zaXRpb249e1twdC54LCBwdC55ICsgMzAsIHB0LnpdfSBjb2xvcj17YXBwU2V0dGluZ3Muc2VsZWN0aW9uQ29sb3J9IGZvbnRTaXplPXs1MH0gb3V0bGluZVdpZHRoPXsyfSBvdXRsaW5lQ29sb3I9XCIjMGYxNzJhXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFJ7ZWwuX3Jvd0luZGV4fVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvVGV4dD5cbiAgICAgICAgICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgICAgICAgICAgICB7c2hvd1JlZkxhYmVscyAmJiBlbC5waXBlbGluZVJlZiAmJiAoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPFRleHQgcG9zaXRpb249e1twdC54LCBwdC55ICsgODAsIHB0LnpdfSBjb2xvcj1cIiMzOGJkZjhcIiBmb250U2l6ZT17NTB9IG91dGxpbmVXaWR0aD17Mn0gb3V0bGluZUNvbG9yPVwiIzBmMTcyYVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7ZWwucGlwZWxpbmVSZWZ9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9UZXh0PlxuICAgICAgICAgICAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgICAgICAgICAgPC9SZWFjdC5GcmFnbWVudD5cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSl9XG4gICAgICAgIDwvZ3JvdXA+XG4gICAgKTtcbn07XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEluc2VydCBTdXBwb3J0IExheWVyXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jb25zdCBJbnNlcnRTdXBwb3J0TGF5ZXIgPSAoKSA9PiB7XG4gICAgY29uc3QgYXBwU2V0dGluZ3MgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5hcHBTZXR0aW5ncyk7XG4gICAgY29uc3QgY2FudmFzTW9kZSA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmNhbnZhc01vZGUpO1xuICAgIGNvbnN0IGRhdGFUYWJsZSA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmRhdGFUYWJsZSk7XG4gICAgY29uc3QgeyBkaXNwYXRjaCB9ID0gdXNlQXBwQ29udGV4dCgpO1xuICAgIGNvbnN0IHB1c2hIaXN0b3J5ID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUucHVzaEhpc3RvcnkpO1xuICAgIGNvbnN0IGN1cnNvclNuYXBQb2ludCA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmN1cnNvclNuYXBQb2ludCk7XG5cbiAgICBjb25zdCBbaG92ZXJQb3MsIHNldEhvdmVyUG9zXSA9IHVzZVN0YXRlKG51bGwpO1xuXG4gICAgaWYgKGNhbnZhc01vZGUgIT09ICdJTlNFUlRfU1VQUE9SVCcpIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgaGFuZGxlUG9pbnRlck1vdmUgPSAoZSkgPT4ge1xuICAgICAgICBpZiAoZS5wb2ludCkgc2V0SG92ZXJQb3MoZS5wb2ludCk7XG4gICAgfTtcblxuICAgIGNvbnN0IGhhbmRsZVBvaW50ZXJPdXQgPSAoKSA9PiB7XG4gICAgICAgIHNldEhvdmVyUG9zKG51bGwpO1xuICAgIH07XG5cbiAgICBjb25zdCBoYW5kbGVQb2ludGVyRG93biA9IChlLCBwaXBlUm93KSA9PiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cbiAgICAgICAgaWYgKHBpcGVSb3cpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcHVzaEhpc3RvcnkoJ0luc2VydCBTdXBwb3J0Jyk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBpbnNlcnRQdCA9IGN1cnNvclNuYXBQb2ludCA/IGN1cnNvclNuYXBQb2ludC5jbG9uZSgpIDogZS5wb2ludC5jbG9uZSgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHN1cHBvcnRSb3cgPSBpbnNlcnRTdXBwb3J0QXRQaXBlKHBpcGVSb3csIGluc2VydFB0KTtcblxuICAgICAgICAgICAgICAgIGlmIChzdXBwb3J0Um93KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIERldGVybWluZSBuZXcgaW5kZXggYW5kIHVwZGF0ZVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdSb3dJbmRleCA9IE1hdGgubWF4KC4uLmRhdGFUYWJsZS5tYXAociA9PiByLl9yb3dJbmRleCB8fCAwKSkgKyAxO1xuICAgICAgICAgICAgICAgICAgICBzdXBwb3J0Um93Ll9yb3dJbmRleCA9IG5ld1Jvd0luZGV4O1xuXG4gICAgICAgICAgICAgICAgICAgIGRpc3BhdGNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdJTlNFUlRfU1VQUE9SVCcsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXlsb2FkOiB7IGFmdGVyUm93SW5kZXg6IHBpcGVSb3cuX3Jvd0luZGV4LCBzdXBwb3J0Um93IH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQWRkIHJpZ2h0IGFmdGVyIHRoZSBwaXBlXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlkeCA9IGRhdGFUYWJsZS5maW5kSW5kZXgociA9PiByLl9yb3dJbmRleCA9PT0gcGlwZVJvdy5fcm93SW5kZXgpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB1cGRhdGVkVGFibGUgPSBbLi4uZGF0YVRhYmxlXTtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlZFRhYmxlLnNwbGljZShpZHggKyAxLCAwLCBzdXBwb3J0Um93KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVpbmRleGVkVGFibGUgPSB1cGRhdGVkVGFibGUubWFwKChyLCBpKSA9PiAoeyAuLi5yLCBfcm93SW5kZXg6IGkgKyAxIH0pKTtcblxuICAgICAgICAgICAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldERhdGFUYWJsZShyZWluZGV4ZWRUYWJsZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIkFERF9MT0dcIiwgcGF5bG9hZDogeyBzdGFnZTogXCJJTlRFUkFDVElWRVwiLCB0eXBlOiBcIkFwcGxpZWQvRml4XCIsIG1lc3NhZ2U6IGBJbnNlcnRlZCBTdXBwb3J0IGF0IFJvdyAke3N1cHBvcnRSb3cuX3Jvd0luZGV4fS5gIH0gfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gS2VlcCBtb2RlIGFjdGl2ZSB0byBpbnNlcnQgbW9yZSwgb3IgcmV0dXJuIHRvIFZJRVc/XG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZSByZXF1aXJlbWVudHMgc2F5IG9uZS1zaG90IGZvciBicmVhaywgbGV0J3Mga2VlcCBpdCBmb3IgaW5zZXJ0IG9yIG1ha2UgaXQgb25lLXNob3QuXG4gICAgICAgICAgICAgICAgICAgIC8vIEFzc3VtaW5nIGNvbnRpbnVvdXMgaW5zZXJ0aW9uIGlzIGhlbHBmdWwuXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgZGJnLmVycm9yKCdJTlNFUlRfU1VQUE9SVCcsICdGYXRhbCBlcnJvciBkdXJpbmcgc3VwcG9ydCBpbnNlcnRpb24nLCB7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6ICdBRERfTE9HJywgcGF5bG9hZDogeyB0eXBlOiAnRXJyb3InLCBzdGFnZTogJ0lOU0VSVF9TVVBQT1JUJywgbWVzc2FnZTogYFN1cHBvcnQgaW5zZXJ0aW9uIGZhaWxlZDogJHtlcnIubWVzc2FnZX1gIH0gfSk7XG4gICAgICAgICAgICAgICAgc2V0Q2FudmFzTW9kZSgnVklFVycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxncm91cD5cbiAgICAgICAgICAgICA8Z3JvdXAgb25Qb2ludGVyTW92ZT17aGFuZGxlUG9pbnRlck1vdmV9IG9uUG9pbnRlck91dD17aGFuZGxlUG9pbnRlck91dH0+XG4gICAgICAgICAgICAgICAge2RhdGFUYWJsZS5maWx0ZXIociA9PiAoci50eXBlfHwnJykudG9VcHBlckNhc2UoKSA9PT0gJ1BJUEUnKS5tYXAoKHBpcGUsIGkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFwaXBlLmVwMSB8fCAhcGlwZS5lcDIpIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2MSA9IG5ldyBUSFJFRS5WZWN0b3IzKHBpcGUuZXAxLngsIHBpcGUuZXAxLnksIHBpcGUuZXAxLnopO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2MiA9IG5ldyBUSFJFRS5WZWN0b3IzKHBpcGUuZXAyLngsIHBpcGUuZXAyLnksIHBpcGUuZXAyLnopO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtaWQgPSB2MS5jbG9uZSgpLmxlcnAodjIsIDAuNSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpc3QgPSB2MS5kaXN0YW5jZVRvKHYyKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRpc3QgPT09IDApIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkaXIgPSB2Mi5jbG9uZSgpLnN1Yih2MSkubm9ybWFsaXplKCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHF1YXQgPSBuZXcgVEhSRUUuUXVhdGVybmlvbigpLnNldEZyb21Vbml0VmVjdG9ycyhuZXcgVEhSRUUuVmVjdG9yMygwLDEsMCksIGRpcik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHIgPSBwaXBlLmJvcmUgPyBwaXBlLmJvcmUgLyAyIDogNTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAgICAgICAgIDxtZXNoIGtleT17YGlzLSR7aX1gfSBwb3NpdGlvbj17bWlkfSBxdWF0ZXJuaW9uPXtxdWF0fSBvblBvaW50ZXJEb3duPXsoZSkgPT4gaGFuZGxlUG9pbnRlckRvd24oZSwgcGlwZSl9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxjeWxpbmRlckdlb21ldHJ5IGFyZ3M9e1tyKjIsIHIqMiwgZGlzdCwgOF19IC8+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPG1lc2hCYXNpY01hdGVyaWFsIGNvbG9yPVwiZ3JlZW5cIiB0cmFuc3BhcmVudCBvcGFjaXR5PXswfSBkZXB0aFdyaXRlPXtmYWxzZX0gLz5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9KX1cbiAgICAgICAgICAgICA8L2dyb3VwPlxuXG4gICAgICAgICAgICAge2hvdmVyUG9zICYmIChcbiAgICAgICAgICAgICAgICAgPG1lc2ggcG9zaXRpb249e2hvdmVyUG9zfT5cbiAgICAgICAgICAgICAgICAgICAgIDxzcGhlcmVHZW9tZXRyeSBhcmdzPXtbMjAsIDE2LCAxNl19IC8+XG4gICAgICAgICAgICAgICAgICAgICA8bWVzaEJhc2ljTWF0ZXJpYWwgY29sb3I9e2FwcFNldHRpbmdzLnNlbGVjdGlvbkNvbG9yfSB0cmFuc3BhcmVudCBvcGFjaXR5PXswLjZ9IGRlcHRoVGVzdD17ZmFsc2V9IC8+XG4gICAgICAgICAgICAgICAgIDwvbWVzaD5cbiAgICAgICAgICAgICApfVxuICAgICAgICA8L2dyb3VwPlxuICAgICk7XG59O1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBDb250ZXh0IE1lbnVcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbmNvbnN0IENvbnRleHRNZW51ID0gKCkgPT4ge1xuICAgIGNvbnN0IGNvbnRleHRNZW51ID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuY29udGV4dE1lbnUpO1xuICAgIGNvbnN0IGNsb3NlQ29udGV4dE1lbnUgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5jbG9zZUNvbnRleHRNZW51KTtcbiAgICBjb25zdCBzZXRTZWxlY3RlZCA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLnNldFNlbGVjdGVkKTtcbiAgICBjb25zdCBoaWRlU2VsZWN0ZWQgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5oaWRlU2VsZWN0ZWQpO1xuICAgIGNvbnN0IGlzb2xhdGVTZWxlY3RlZCA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmlzb2xhdGVTZWxlY3RlZCk7XG4gICAgY29uc3Qgc2V0TXVsdGlTZWxlY3QgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5zZXRNdWx0aVNlbGVjdCk7XG4gICAgY29uc3QgeyBkaXNwYXRjaCB9ID0gdXNlQXBwQ29udGV4dCgpO1xuXG4gICAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICAgICAgY29uc3QgaGFuZGxlQ2xpY2tPdXRzaWRlID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKGNvbnRleHRNZW51KSBjbG9zZUNvbnRleHRNZW51KCk7XG4gICAgICAgIH07XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGhhbmRsZUNsaWNrT3V0c2lkZSk7XG4gICAgICAgIHJldHVybiAoKSA9PiB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCBoYW5kbGVDbGlja091dHNpZGUpO1xuICAgIH0sIFtjb250ZXh0TWVudSwgY2xvc2VDb250ZXh0TWVudV0pO1xuXG4gICAgaWYgKCFjb250ZXh0TWVudSkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBoYW5kbGVBY3Rpb24gPSAoYWN0aW9uKSA9PiB7XG4gICAgICAgIC8vIEVuc3VyZSB0aGUgY2xpY2tlZCBlbGVtZW50IGlzIHNlbGVjdGVkIGZvciB0aGVzZSBhY3Rpb25zXG4gICAgICAgIHNldFNlbGVjdGVkKGNvbnRleHRNZW51LnJvd0luZGV4KTtcbiAgICAgICAgc2V0TXVsdGlTZWxlY3QoW2NvbnRleHRNZW51LnJvd0luZGV4XSk7XG5cbiAgICAgICAgaWYgKGFjdGlvbiA9PT0gJ0hJREUnKSB7XG4gICAgICAgICAgICBoaWRlU2VsZWN0ZWQoKTtcbiAgICAgICAgfSBlbHNlIGlmIChhY3Rpb24gPT09ICdJU09MQVRFJykge1xuICAgICAgICAgICAgaXNvbGF0ZVNlbGVjdGVkKCk7XG4gICAgICAgIH0gZWxzZSBpZiAoYWN0aW9uID09PSAnREVMRVRFJykge1xuICAgICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiAnREVMRVRFX0VMRU1FTlRTJywgcGF5bG9hZDogeyByb3dJbmRpY2VzOiBbY29udGV4dE1lbnUucm93SW5kZXhdIH0gfSk7XG4gICAgICAgIH0gZWxzZSBpZiAoYWN0aW9uID09PSAnUFJPUEVSVElFUycpIHtcbiAgICAgICAgICAgIC8vIFVzdWFsbHksIHNlbGVjdGluZyBhbiBlbGVtZW50IGF1dG9tYXRpY2FsbHkgc2hvd3MgdGhlIHNpZGUgaW5zcGVjdG9yLFxuICAgICAgICAgICAgLy8gc28gd2UganVzdCBuZWVkIHRvIGVuc3VyZSBpdCdzIG9wZW4gaWYgaXQncyBjdXJyZW50bHkgY2xvc2VkLlxuICAgICAgICAgICAgd2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KCdvcGVuLXNpZGUtaW5zcGVjdG9yJykpO1xuICAgICAgICB9XG4gICAgICAgIGNsb3NlQ29udGV4dE1lbnUoKTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGRpdlxuICAgICAgICAgICAgY2xhc3NOYW1lPVwiZml4ZWQgei1bMTAwXSBiZy1zbGF0ZS05MDAgYm9yZGVyIGJvcmRlci1zbGF0ZS03MDAgc2hhZG93LXhsIHJvdW5kZWQgcHktMSB3LTQ0XCJcbiAgICAgICAgICAgIHN0eWxlPXt7IHRvcDogY29udGV4dE1lbnUueSwgbGVmdDogY29udGV4dE1lbnUueCB9fVxuICAgICAgICAgICAgb25Db250ZXh0TWVudT17KGUpID0+IGUucHJldmVudERlZmF1bHQoKX1cbiAgICAgICAgPlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJweC0zIHB5LTEgdGV4dC14cyBmb250LWJvbGQgdGV4dC1zbGF0ZS01MDAgYm9yZGVyLWIgYm9yZGVyLXNsYXRlLTgwMCBtYi0xXCI+Um93IHtjb250ZXh0TWVudS5yb3dJbmRleH08L2Rpdj5cbiAgICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4gaGFuZGxlQWN0aW9uKCdQUk9QRVJUSUVTJyl9IGNsYXNzTmFtZT1cInctZnVsbCB0ZXh0LWxlZnQgcHgtMyBweS0xLjUgdGV4dC1zbSB0ZXh0LXNsYXRlLTMwMCBob3ZlcjpiZy1zbGF0ZS04MDAgaG92ZXI6dGV4dC13aGl0ZSB0cmFuc2l0aW9uLWNvbG9ycyBmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMlwiPlxuICAgICAgICAgICAgICAgIDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHdpZHRoPVwiMTRcIiBoZWlnaHQ9XCIxNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiIHN0cm9rZUxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZUxpbmVqb2luPVwicm91bmRcIiBjbGFzc05hbWU9XCJ0ZXh0LWJsdWUtNDAwXCI+PHBhdGggZD1cIk0xMiAyMGg5XCIvPjxwYXRoIGQ9XCJNMTYuNSAzLjVhMi4xMiAyLjEyIDAgMCAxIDMgM0w3IDE5bC00IDEgMS00WlwiLz48L3N2Zz5cbiAgICAgICAgICAgICAgICBQcm9wZXJ0eSBQYW5lbFxuICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IGhhbmRsZUFjdGlvbignSVNPTEFURScpfSBjbGFzc05hbWU9XCJ3LWZ1bGwgdGV4dC1sZWZ0IHB4LTMgcHktMS41IHRleHQtc20gdGV4dC1zbGF0ZS0zMDAgaG92ZXI6Ymctc2xhdGUtODAwIGhvdmVyOnRleHQtd2hpdGUgdHJhbnNpdGlvbi1jb2xvcnMgZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTJcIj5cbiAgICAgICAgICAgICAgICA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2VXaWR0aD1cIjJcIiBzdHJva2VMaW5lY2FwPVwicm91bmRcIiBzdHJva2VMaW5lam9pbj1cInJvdW5kXCIgY2xhc3NOYW1lPVwidGV4dC1hbWJlci00MDBcIj48cGF0aCBkPVwiTTUgMTJzMi41NDUtNSA3LTVjNC45MjggMCA3IDUgNyA1cy0yLjA3MiA1LTcgNWMtNC40NTUgMC03LTUtNy01elwiLz48cGF0aCBkPVwiTTEyIDEzYTEgMSAwIDEgMCAwLTIgMSAxIDAgMCAwIDAgMnpcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgSXNvbGF0ZVxuICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IGhhbmRsZUFjdGlvbignSElERScpfSBjbGFzc05hbWU9XCJ3LWZ1bGwgdGV4dC1sZWZ0IHB4LTMgcHktMS41IHRleHQtc20gdGV4dC1zbGF0ZS0zMDAgaG92ZXI6Ymctc2xhdGUtODAwIGhvdmVyOnRleHQtd2hpdGUgdHJhbnNpdGlvbi1jb2xvcnMgZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTJcIj5cbiAgICAgICAgICAgICAgICA8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2VXaWR0aD1cIjJcIiBzdHJva2VMaW5lY2FwPVwicm91bmRcIiBzdHJva2VMaW5lam9pbj1cInJvdW5kXCIgY2xhc3NOYW1lPVwidGV4dC1zbGF0ZS00MDBcIj48cGF0aCBkPVwiTTkuODggOS44OGEzIDMgMCAxIDAgNC4yNCA0LjI0XCIvPjxwYXRoIGQ9XCJNMTAuNzMgNS4wOEExMC40MyAxMC40MyAwIDAgMSAxMiA1YzcgMCAxMCA3IDEwIDdhMTMuMTYgMTMuMTYgMCAwIDEtMS42NyAyLjY4XCIvPjxwYXRoIGQ9XCJNNi42MSA2LjYxQTEzLjUyNiAxMy41MjYgMCAwIDAgMiAxMnMzIDcgMTAgN2E5Ljc0IDkuNzQgMCAwIDAgNS4zOS0xLjYxXCIvPjxsaW5lIHgxPVwiMlwiIHgyPVwiMjJcIiB5MT1cIjJcIiB5Mj1cIjIyXCIvPjwvc3ZnPlxuICAgICAgICAgICAgICAgIEhpZGVcbiAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXsoKSA9PiBoYW5kbGVBY3Rpb24oJ0RFTEVURScpfSBjbGFzc05hbWU9XCJ3LWZ1bGwgdGV4dC1sZWZ0IHB4LTMgcHktMS41IHRleHQtc20gdGV4dC1yZWQtNDAwIGhvdmVyOmJnLXJlZC05MDAvNDAgaG92ZXI6dGV4dC1yZWQtMzAwIHRyYW5zaXRpb24tY29sb3JzIG10LTEgYm9yZGVyLXQgYm9yZGVyLXNsYXRlLTgwMCBmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMlwiPlxuICAgICAgICAgICAgICAgIDxzdmcgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIHdpZHRoPVwiMTRcIiBoZWlnaHQ9XCIxNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZVdpZHRoPVwiMlwiIHN0cm9rZUxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZUxpbmVqb2luPVwicm91bmRcIiBjbGFzc05hbWU9XCJ0ZXh0LXJlZC00MDBcIj48cGF0aCBkPVwiTTMgNmgxOFwiLz48cGF0aCBkPVwiTTE5IDZ2MTRjMCAxLTEgMi0yIDJIN2MtMSAwLTItMS0yLTJWNlwiLz48cGF0aCBkPVwiTTggNlY0YzAtMSAxLTIgMi0yaDRjMSAwIDIgMSAyIDJ2MlwiLz48bGluZSB4MT1cIjEwXCIgeDI9XCIxMFwiIHkxPVwiMTFcIiB5Mj1cIjE3XCIvPjxsaW5lIHgxPVwiMTRcIiB4Mj1cIjE0XCIgeTE9XCIxMVwiIHkyPVwiMTdcIi8+PC9zdmc+XG4gICAgICAgICAgICAgICAgRGVsZXRlXG4gICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgKTtcbn07XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEhvdmVyIFRvb2x0aXBcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbmNvbnN0IEhvdmVyVG9vbHRpcCA9ICgpID0+IHtcbiAgICBjb25zdCBob3ZlcmVkRWxlbWVudElkID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuaG92ZXJlZEVsZW1lbnRJZCk7XG4gICAgY29uc3QgZGF0YVRhYmxlID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuZGF0YVRhYmxlKTtcbiAgICBjb25zdCBbdG9vbHRpcFBvcywgc2V0VG9vbHRpcFBvc10gPSB1c2VTdGF0ZSh7IHg6IDAsIHk6IDAgfSk7XG4gICAgY29uc3QgdGltZXJSZWYgPSB1c2VSZWYobnVsbCk7XG5cbiAgICAvLyBHbG9iYWwgbGlzdGVuZXIgZm9yIHBvaW50ZXIgbW92ZSB0byB0cmFjayBjdXJzb3JcbiAgICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgICAgICBjb25zdCBoYW5kbGVNb3VzZU1vdmUgPSAoZSkgPT4ge1xuICAgICAgICAgICAgc2V0VG9vbHRpcFBvcyh7IHg6IGUuY2xpZW50WCwgeTogZS5jbGllbnRZIH0pO1xuICAgICAgICB9O1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgaGFuZGxlTW91c2VNb3ZlKTtcbiAgICAgICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBoYW5kbGVNb3VzZU1vdmUpO1xuICAgIH0sIFtdKTtcblxuICAgIGlmICghaG92ZXJlZEVsZW1lbnRJZCkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBlbCA9IGRhdGFUYWJsZS5maW5kKHIgPT4gci5fcm93SW5kZXggPT09IGhvdmVyZWRFbGVtZW50SWQpO1xuICAgIGlmICghZWwpIHJldHVybiBudWxsO1xuXG4gICAgbGV0IGxlbiA9IDA7XG4gICAgaWYgKGVsLmVwMSAmJiBlbC5lcDIpIHtcbiAgICAgICAgbGVuID0gTWF0aC5zcXJ0KE1hdGgucG93KGVsLmVwMS54IC0gZWwuZXAyLngsIDIpICsgTWF0aC5wb3coZWwuZXAxLnkgLSBlbC5lcDIueSwgMikgKyBNYXRoLnBvdyhlbC5lcDEueiAtIGVsLmVwMi56LCAyKSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGRpdlxuICAgICAgICAgICAgY2xhc3NOYW1lPVwiZml4ZWQgei01MCBwb2ludGVyLWV2ZW50cy1ub25lIGJnLXNsYXRlLTkwMC85MCBib3JkZXIgYm9yZGVyLXNsYXRlLTcwMCBzaGFkb3cteGwgcm91bmRlZCBwLTIgdGV4dC14c1wiXG4gICAgICAgICAgICBzdHlsZT17eyBsZWZ0OiB0b29sdGlwUG9zLnggKyAxNSwgdG9wOiB0b29sdGlwUG9zLnkgKyAxNSB9fVxuICAgICAgICA+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGdhcC0yIG1iLTFcIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJweC0xLjUgcHktMC41IHJvdW5kZWQgdGV4dC1bMTBweF0gZm9udC1ib2xkIHVwcGVyY2FzZVwiIHN0eWxlPXt7IGJhY2tncm91bmRDb2xvcjogdHlwZUNvbG9yKGVsLnR5cGUpLCBjb2xvcjogJ3doaXRlJyB9fT57ZWwudHlwZX08L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1zbGF0ZS0zMDAgZm9udC1ib2xkXCI+Um93IHtlbC5fcm93SW5kZXh9PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInRleHQtc2xhdGUtNDAwIGdyaWQgZ3JpZC1jb2xzLTIgZ2FwLXgtMyBnYXAteS0xXCI+XG4gICAgICAgICAgICAgICAgPHNwYW4+Qm9yZTo8L3NwYW4+PHNwYW4gY2xhc3NOYW1lPVwidGV4dC1zbGF0ZS0yMDBcIj57ZWwuYm9yZX08L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNwYW4+TGVuOjwvc3Bhbj48c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LXNsYXRlLTIwMFwiPntsZW4udG9GaXhlZCgxKX1tbTwvc3Bhbj5cbiAgICAgICAgICAgICAgICB7ZWwuZXAxICYmIDw+PHNwYW4+RVAxIFg6PC9zcGFuPjxzcGFuIGNsYXNzTmFtZT1cInRleHQtc2xhdGUtMjAwXCI+e2VsLmVwMS54LnRvRml4ZWQoMSl9PC9zcGFuPjwvPn1cbiAgICAgICAgICAgICAgICB7ZWwuZXAxICYmIDw+PHNwYW4+RVAxIFk6PC9zcGFuPjxzcGFuIGNsYXNzTmFtZT1cInRleHQtc2xhdGUtMjAwXCI+e2VsLmVwMS55LnRvRml4ZWQoMSl9PC9zcGFuPjwvPn1cbiAgICAgICAgICAgICAgICB7ZWwuZXAxICYmIDw+PHNwYW4+RVAxIFo6PC9zcGFuPjxzcGFuIGNsYXNzTmFtZT1cInRleHQtc2xhdGUtMjAwXCI+e2VsLmVwMS56LnRvRml4ZWQoMSl9PC9zcGFuPjwvPn1cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICApO1xufTtcblxuXG4vLyBNYWluIFRhYiBDb21wb25lbnRcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY29uc3QgQ29udHJvbHNBdXRvQ2VudGVyID0gKHsgZXh0ZXJuYWxSZWYgfSkgPT4ge1xuICAgIGNvbnN0IGNvbnRyb2xzUmVmID0gdXNlUmVmKCk7XG4gICAgY29uc3QgZ2V0UGlwZXMgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5nZXRQaXBlcyk7XG4gICAgY29uc3QgW3RhcmdldFBvcywgc2V0VGFyZ2V0UG9zXSA9IHVzZVN0YXRlKG51bGwpO1xuICAgIGNvbnN0IFtjYW1Qb3MsIHNldENhbVBvc10gPSB1c2VTdGF0ZShudWxsKTtcbiAgICBjb25zdCBpc0FuaW1hdGluZyA9IHVzZVJlZihmYWxzZSk7XG4gICAgY29uc3QgYXBwbHlWaWV3ZXJGaXRQb2xpY3kgPSAoY2FtZXJhLCB0YXJnZXQsIG1heERpbSkgPT4ge1xuICAgICAgICBpZiAoIWNhbWVyYSB8fCAhdGFyZ2V0KSByZXR1cm47XG4gICAgICAgIGNvbnN0IHNhZmVEaW0gPSBNYXRoLm1heChtYXhEaW0gfHwgMSwgMSk7XG5cbiAgICAgICAgaWYgKGNhbWVyYS5pc09ydGhvZ3JhcGhpY0NhbWVyYSkge1xuICAgICAgICAgICAgY29uc3QgYXNwZWN0ID0gd2luZG93LmlubmVyV2lkdGggLyBNYXRoLm1heCh3aW5kb3cuaW5uZXJIZWlnaHQsIDEpO1xuICAgICAgICAgICAgY29uc3QgaGFsZiA9IHNhZmVEaW0gKiAwLjg7XG4gICAgICAgICAgICBjYW1lcmEubGVmdCA9IC1oYWxmICogYXNwZWN0O1xuICAgICAgICAgICAgY2FtZXJhLnJpZ2h0ID0gaGFsZiAqIGFzcGVjdDtcbiAgICAgICAgICAgIGNhbWVyYS50b3AgPSBoYWxmO1xuICAgICAgICAgICAgY2FtZXJhLmJvdHRvbSA9IC1oYWxmO1xuICAgICAgICAgICAgY2FtZXJhLm5lYXIgPSAtc2FmZURpbSAqIDIwO1xuICAgICAgICAgICAgY2FtZXJhLmZhciA9IHNhZmVEaW0gKiAyMDtcbiAgICAgICAgICAgIGNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgIH0gZWxzZSBpZiAoY2FtZXJhLmlzUGVyc3BlY3RpdmVDYW1lcmEpIHtcbiAgICAgICAgICAgIGNhbWVyYS5uZWFyID0gTWF0aC5tYXgoMC4xLCBzYWZlRGltICogMC4wMDEpO1xuICAgICAgICAgICAgY2FtZXJhLmZhciA9IE1hdGgubWF4KGNhbWVyYS5uZWFyICsgMTAwMCwgc2FmZURpbSAqIDUwKTtcbiAgICAgICAgICAgIGNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gU21vb3RoIGNhbWVyYSBpbnRlcnBvbGF0aW9uXG4gICAgdXNlRnJhbWUoKHN0YXRlLCBkZWx0YSkgPT4ge1xuICAgICAgICBpZiAoIWNvbnRyb2xzUmVmLmN1cnJlbnQgfHwgIWlzQW5pbWF0aW5nLmN1cnJlbnQgfHwgIXRhcmdldFBvcyB8fCAhY2FtUG9zKSByZXR1cm47XG5cbiAgICAgICAgLy8gTGVycCBPcmJpdENvbnRyb2xzIHRhcmdldFxuICAgICAgICBjb250cm9sc1JlZi5jdXJyZW50LnRhcmdldC5sZXJwKHRhcmdldFBvcywgNSAqIGRlbHRhKTtcbiAgICAgICAgLy8gTGVycCBDYW1lcmEgcG9zaXRpb25cbiAgICAgICAgc3RhdGUuY2FtZXJhLnBvc2l0aW9uLmxlcnAoY2FtUG9zLCA1ICogZGVsdGEpO1xuXG4gICAgICAgIC8vIFN0b3AgYW5pbWF0aW5nIHdoZW4gY2xvc2VcbiAgICAgICAgaWYgKGNvbnRyb2xzUmVmLmN1cnJlbnQudGFyZ2V0LmRpc3RhbmNlVG8odGFyZ2V0UG9zKSA8IDEgJiYgc3RhdGUuY2FtZXJhLnBvc2l0aW9uLmRpc3RhbmNlVG8oY2FtUG9zKSA8IDEpIHtcbiAgICAgICAgICAgIGlzQW5pbWF0aW5nLmN1cnJlbnQgPSBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnRyb2xzUmVmLmN1cnJlbnQudXBkYXRlKCk7XG4gICAgfSk7XG5cbiAgICAvLyBBZGQgY3VzdG9tIGV2ZW50IGxpc3RlbmVyIGZvciBhdXRvLWNlbnRlclxuICAgIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgICAgIGNvbnN0IGhhbmRsZUZvY3VzID0gKGUpID0+IHtcbiAgICAgICAgICAgIGlmICghY29udHJvbHNSZWYuY3VycmVudCkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgeyB4LCB5LCB6LCBkaXN0IH0gPSBlLmRldGFpbDtcbiAgICAgICAgICAgIGNvbnN0IHRQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMyh4LCB5LCB6KTtcbiAgICAgICAgICAgIC8vIE1vdmUgY2FtZXJhIGNsb3NlciB0byBvYmplY3QgYmFzZWQgb24gaXRzIGxlbmd0aC9kaXN0XG4gICAgICAgICAgICAvLyBNYWtlIHN1cmUgdGhlIHpvb20gZGlzdGFuY2UgaXNuJ3QgZXhjZXNzaXZlbHkgZmFyIG9yIGNsb3NlXG4gICAgICAgICAgICBjb25zdCB6b29tRGlzdCA9IE1hdGgubWF4KGRpc3QgKiAxLjUsIDMwMCk7XG5cbiAgICAgICAgICAgIC8vIEN1cnJlbnQgY2FtZXJhIGRpcmVjdGlvbiB0byBvYmplY3RcbiAgICAgICAgICAgIGNvbnN0IGRpciA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuc3ViVmVjdG9ycyhjb250cm9sc1JlZi5jdXJyZW50Lm9iamVjdC5wb3NpdGlvbiwgdFBvcykubm9ybWFsaXplKCk7XG4gICAgICAgICAgICBpZiAoZGlyLmxlbmd0aFNxKCkgPCAwLjEpIGRpci5zZXQoMSwgMSwgMSkubm9ybWFsaXplKCk7IC8vIERlZmF1bHQgb2Zmc2V0IGlmIGRlYWQgY2VudGVyXG5cbiAgICAgICAgICAgIGNvbnN0IGNQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNvcHkodFBvcykuYWRkU2NhbGVkVmVjdG9yKGRpciwgem9vbURpc3QpO1xuXG4gICAgICAgICAgICBzZXRUYXJnZXRQb3ModFBvcyk7XG4gICAgICAgICAgICBzZXRDYW1Qb3MoY1Bvcyk7XG4gICAgICAgICAgICBpc0FuaW1hdGluZy5jdXJyZW50ID0gdHJ1ZTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBoYW5kbGVDZW50ZXIgPSAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGlwZXMgPSBnZXRQaXBlcygpO1xuICAgICAgICAgICAgY29uc3QgaW1tdXRhYmxlcyA9IHVzZVN0b3JlLmdldFN0YXRlKCkuZ2V0SW1tdXRhYmxlcygpO1xuICAgICAgICAgICAgY29uc3QgYWxsRWxzID0gWy4uLnBpcGVzLCAuLi5pbW11dGFibGVzXTtcblxuICAgICAgICAgICAgaWYgKGFsbEVscy5sZW5ndGggPT09IDAgfHwgIWNvbnRyb2xzUmVmLmN1cnJlbnQpIHJldHVybjtcblxuICAgICAgICAgICAgbGV0IG1pblggPSBJbmZpbml0eSwgbWluWSA9IEluZmluaXR5LCBtaW5aID0gSW5maW5pdHk7XG4gICAgICAgICAgICBsZXQgbWF4WCA9IC1JbmZpbml0eSwgbWF4WSA9IC1JbmZpbml0eSwgbWF4WiA9IC1JbmZpbml0eTtcblxuICAgICAgICAgICAgLy8gT3B0aW9uYWwgZXhwbGljaXQgbGlzdCBvZiBlbGVtZW50cyB0byBmcmFtZVxuICAgICAgICAgICAgY29uc3QgZWxzVG9GcmFtZSA9IGU/LmRldGFpbD8uZWxlbWVudHMgfHwgYWxsRWxzO1xuXG4gICAgICAgICAgICBlbHNUb0ZyYW1lLmZvckVhY2gocCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHAuZXAxKSB7XG4gICAgICAgICAgICAgICAgICAgIG1pblggPSBNYXRoLm1pbihtaW5YLCBwLmVwMS54KTsgbWluWSA9IE1hdGgubWluKG1pblksIHAuZXAxLnkpOyBtaW5aID0gTWF0aC5taW4obWluWiwgcC5lcDEueik7XG4gICAgICAgICAgICAgICAgICAgIG1heFggPSBNYXRoLm1heChtYXhYLCBwLmVwMS54KTsgbWF4WSA9IE1hdGgubWF4KG1heFksIHAuZXAxLnkpOyBtYXhaID0gTWF0aC5tYXgobWF4WiwgcC5lcDEueik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChwLmVwMikge1xuICAgICAgICAgICAgICAgICAgICBtaW5YID0gTWF0aC5taW4obWluWCwgcC5lcDIueCk7IG1pblkgPSBNYXRoLm1pbihtaW5ZLCBwLmVwMi55KTsgbWluWiA9IE1hdGgubWluKG1pblosIHAuZXAyLnopO1xuICAgICAgICAgICAgICAgICAgICBtYXhYID0gTWF0aC5tYXgobWF4WCwgcC5lcDIueCk7IG1heFkgPSBNYXRoLm1heChtYXhZLCBwLmVwMi55KTsgbWF4WiA9IE1hdGgubWF4KG1heFosIHAuZXAyLnopO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAobWluWCAhPT0gSW5maW5pdHkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjZW50ZXJYID0gKG1pblggKyBtYXhYKSAvIDI7XG4gICAgICAgICAgICAgICAgY29uc3QgY2VudGVyWSA9IChtaW5ZICsgbWF4WSkgLyAyO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNlbnRlclogPSAobWluWiArIG1heFopIC8gMjtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHRQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMyhjZW50ZXJYLCBjZW50ZXJZLCBjZW50ZXJaKTtcbiAgICAgICAgICAgICAgICBjb25zdCBtYXhEaW0gPSBNYXRoLm1heChtYXhYIC0gbWluWCwgbWF4WSAtIG1pblksIG1heFogLSBtaW5aKSB8fCAxO1xuICAgICAgICAgICAgICAgIC8vIEFsaWduIHdpdGggdmlld2VyIGZpdCBiZWhhdmlvcjogZGlhZ29uYWwgb2Zmc2V0IGZyb20gY2VudGVyIGJ5IG1heCBkaW1lbnNpb24uXG4gICAgICAgICAgICAgICAgY29uc3QgY1BvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKGNlbnRlclggKyBtYXhEaW0sIGNlbnRlclkgKyBtYXhEaW0sIGNlbnRlclogKyBtYXhEaW0pO1xuICAgICAgICAgICAgICAgIGFwcGx5Vmlld2VyRml0UG9saWN5KGNvbnRyb2xzUmVmLmN1cnJlbnQub2JqZWN0LCB0UG9zLCBtYXhEaW0pO1xuXG4gICAgICAgICAgICAgICAgc2V0VGFyZ2V0UG9zKHRQb3MpO1xuICAgICAgICAgICAgICAgIHNldENhbVBvcyhjUG9zKTtcbiAgICAgICAgICAgICAgICBpc0FuaW1hdGluZy5jdXJyZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBoYW5kbGVTZXRWaWV3ID0gKGUpID0+IHtcbiAgICAgICAgICAgIGlmICghY29udHJvbHNSZWYuY3VycmVudCkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3Qgdmlld1R5cGUgPSBlLmRldGFpbC52aWV3VHlwZTtcblxuICAgICAgICAgICAgaWYgKHZpZXdUeXBlID09PSAnSE9NRScgfHwgdmlld1R5cGUgPT09ICdGSVQnKSB7XG4gICAgICAgICAgICAgICAgaGFuZGxlQ2VudGVyKGUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgdFBvcyA9IGNvbnRyb2xzUmVmLmN1cnJlbnQudGFyZ2V0LmNsb25lKCk7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50RGlzdCA9IGNvbnRyb2xzUmVmLmN1cnJlbnQudGFyZ2V0LmRpc3RhbmNlVG8oY29udHJvbHNSZWYuY3VycmVudC5vYmplY3QucG9zaXRpb24pO1xuICAgICAgICAgICAgY29uc3QgZGlzdCA9IE1hdGgubWF4KGN1cnJlbnREaXN0LCAxMDAwKTtcblxuICAgICAgICAgICAgbGV0IGNQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuXG4gICAgICAgICAgICBzd2l0Y2godmlld1R5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdUT1AnOlxuICAgICAgICAgICAgICAgICAgICBjUG9zLnNldCh0UG9zLngsIHRQb3MueSArIGRpc3QsIHRQb3Mueik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ0ZST05UJzpcbiAgICAgICAgICAgICAgICAgICAgY1Bvcy5zZXQodFBvcy54LCB0UG9zLnksIHRQb3MueiArIGRpc3QpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdSSUdIVCc6XG4gICAgICAgICAgICAgICAgICAgIGNQb3Muc2V0KHRQb3MueCArIGRpc3QsIHRQb3MueSwgdFBvcy56KTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnSVNPJzpcbiAgICAgICAgICAgICAgICAgICAgY1Bvcy5zZXQodFBvcy54ICsgZGlzdCwgdFBvcy55ICsgZGlzdCwgdFBvcy56ICsgZGlzdCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc2V0VGFyZ2V0UG9zKHRQb3MpO1xuICAgICAgICAgICAgc2V0Q2FtUG9zKGNQb3MpO1xuICAgICAgICAgICAgaXNBbmltYXRpbmcuY3VycmVudCA9IHRydWU7XG4gICAgICAgIH07XG5cblxuICAgICAgICBjb25zdCBoYW5kbGVTYXZlQ2FtZXJhID0gKGUpID0+IHtcbiAgICAgICAgICAgIGlmICghY29udHJvbHNSZWYuY3VycmVudCkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgcHJlc2V0ID0gZS5kZXRhaWwucHJlc2V0O1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHtcbiAgICAgICAgICAgICAgICBjYW1Qb3M6IGNvbnRyb2xzUmVmLmN1cnJlbnQub2JqZWN0LnBvc2l0aW9uLmNsb25lKCksXG4gICAgICAgICAgICAgICAgY2FtVGFyZ2V0OiBjb250cm9sc1JlZi5jdXJyZW50LnRhcmdldC5jbG9uZSgpXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oYHBjZi1jYW1lcmEtcHJlc2V0LSR7cHJlc2V0fWAsIEpTT04uc3RyaW5naWZ5KGRhdGEpKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBoYW5kbGVMb2FkQ2FtZXJhID0gKGUpID0+IHtcbiAgICAgICAgICAgIGlmICghY29udHJvbHNSZWYuY3VycmVudCkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgcHJlc2V0ID0gZS5kZXRhaWwucHJlc2V0O1xuICAgICAgICAgICAgY29uc3Qgc2F2ZWQgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShgcGNmLWNhbWVyYS1wcmVzZXQtJHtwcmVzZXR9YCk7XG4gICAgICAgICAgICBpZiAoc2F2ZWQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkYXRhID0gSlNPTi5wYXJzZShzYXZlZCk7XG4gICAgICAgICAgICAgICAgc2V0VGFyZ2V0UG9zKG5ldyBUSFJFRS5WZWN0b3IzKCkuY29weShkYXRhLmNhbVRhcmdldCkpO1xuICAgICAgICAgICAgICAgIHNldENhbVBvcyhuZXcgVEhSRUUuVmVjdG9yMygpLmNvcHkoZGF0YS5jYW1Qb3MpKTtcbiAgICAgICAgICAgICAgICBpc0FuaW1hdGluZy5jdXJyZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignY2FudmFzLXNhdmUtY2FtZXJhJywgaGFuZGxlU2F2ZUNhbWVyYSk7XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjYW52YXMtbG9hZC1jYW1lcmEnLCBoYW5kbGVMb2FkQ2FtZXJhKTtcblxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignY2FudmFzLWF1dG8tY2VudGVyJywgaGFuZGxlQ2VudGVyKTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2NhbnZhcy1mb2N1cy1wb2ludCcsIGhhbmRsZUZvY3VzKTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2NhbnZhcy1zZXQtdmlldycsIGhhbmRsZVNldFZpZXcpO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignY2FudmFzLXJlc2V0LXZpZXcnLCBoYW5kbGVDZW50ZXIpO1xuICAgICAgICByZXR1cm4gKCkgPT4ge1xuXG4gICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2FudmFzLXNhdmUtY2FtZXJhJywgaGFuZGxlU2F2ZUNhbWVyYSk7XG4gICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2FudmFzLWxvYWQtY2FtZXJhJywgaGFuZGxlTG9hZENhbWVyYSk7XG5cbiAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdjYW52YXMtYXV0by1jZW50ZXInLCBoYW5kbGVDZW50ZXIpO1xuICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NhbnZhcy1mb2N1cy1wb2ludCcsIGhhbmRsZUZvY3VzKTtcbiAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdjYW52YXMtc2V0LXZpZXcnLCBoYW5kbGVTZXRWaWV3KTtcbiAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdjYW52YXMtcmVzZXQtdmlldycsIGhhbmRsZUNlbnRlcik7XG4gICAgICAgIH07XG4gICAgfSwgW2dldFBpcGVzXSk7XG5cbiAgICAvLyBTZXNzaW9uIENhbWVyYSBQZXJzaXN0ZW5jZVxuICAgIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgICAgIGlmICghY29udHJvbHNSZWYuY3VycmVudCkgcmV0dXJuO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBzYXZlZCA9IHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oJ3BjZi1jYW52YXMtc2Vzc2lvbicpO1xuICAgICAgICAgICAgaWYgKHNhdmVkKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2Uoc2F2ZWQpO1xuICAgICAgICAgICAgICAgIGlmIChkYXRhLmNhbVBvcykgY29udHJvbHNSZWYuY3VycmVudC5vYmplY3QucG9zaXRpb24uY29weShkYXRhLmNhbVBvcyk7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEuY2FtVGFyZ2V0KSBjb250cm9sc1JlZi5jdXJyZW50LnRhcmdldC5jb3B5KGRhdGEuY2FtVGFyZ2V0KTtcbiAgICAgICAgICAgICAgICBjb250cm9sc1JlZi5jdXJyZW50LnVwZGF0ZSgpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGRhdGEuc2hvd1Jvd0xhYmVscyAhPT0gdW5kZWZpbmVkKSB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldFNob3dSb3dMYWJlbHMoZGF0YS5zaG93Um93TGFiZWxzKTtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5zaG93UmVmTGFiZWxzICE9PSB1bmRlZmluZWQpIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0U2hvd1JlZkxhYmVscyhkYXRhLnNob3dSZWZMYWJlbHMpO1xuICAgICAgICAgICAgICAgIGlmIChkYXRhLnNob3dHYXBSYWRhciAhPT0gdW5kZWZpbmVkKSB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldFNob3dHYXBSYWRhcihkYXRhLnNob3dHYXBSYWRhcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcmVzdG9yZSBjYW1lcmEgc2Vzc2lvblwiLCBlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoY29udHJvbHNSZWYuY3VycmVudCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbVBvczogY29udHJvbHNSZWYuY3VycmVudC5vYmplY3QucG9zaXRpb24sXG4gICAgICAgICAgICAgICAgICAgIGNhbVRhcmdldDogY29udHJvbHNSZWYuY3VycmVudC50YXJnZXQsXG4gICAgICAgICAgICAgICAgICAgIHNob3dSb3dMYWJlbHM6IHVzZVN0b3JlLmdldFN0YXRlKCkuc2hvd1Jvd0xhYmVscyxcbiAgICAgICAgICAgICAgICAgICAgc2hvd1JlZkxhYmVsczogdXNlU3RvcmUuZ2V0U3RhdGUoKS5zaG93UmVmTGFiZWxzLFxuICAgICAgICAgICAgICAgICAgICBzaG93R2FwUmFkYXI6IHVzZVN0b3JlLmdldFN0YXRlKCkuc2hvd0dhcFJhZGFyXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uU3RvcmFnZS5zZXRJdGVtKCdwY2YtY2FudmFzLXNlc3Npb24nLCBKU09OLnN0cmluZ2lmeShkYXRhKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfSwgW10pO1xuXG4gICAgY29uc3QgY2FudmFzTW9kZSA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmNhbnZhc01vZGUpO1xuICAgIGNvbnN0IGludGVyYWN0aW9uTW9kZSA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmludGVyYWN0aW9uTW9kZSk7XG4gICAgY29uc3QgYXBwU2V0dGluZ3MgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5hcHBTZXR0aW5ncyk7XG4gICAgLy8gQWxsb3cgcGFubmluZy96b29taW5nIGR1cmluZyBDT05ORUNULCBTVFJFVENILCBNRUFTVVJFLCBCUkVBSyBub3cgdGhhdCB0aGV5IGFyZSBjbGljay1iYXNlZC5cbiAgICBjb25zdCBjb250cm9sc0VuYWJsZWQgPSAhWydNQVJRVUVFX1NFTEVDVCcsICdNQVJRVUVFX1pPT00nLCAnTUFSUVVFRV9ERUxFVEUnXS5pbmNsdWRlcyhjYW52YXNNb2RlKTtcblxuICAgIGNvbnN0IGhhbmRsZVBvaW50ZXJEb3duID0gKGUpID0+IHtcbiAgICAgICAgLy8gRGlzYWJsZWQgY2VudGVyIG9uIGNsaWNrIGJ5IGRlZmF1bHRcbiAgICB9O1xuXG4gICAgLy8gQXR0YWNoIGxpc3RlbmVyIHRvIHdpbmRvdyBzbyB3ZSBjYW4gZ3JhYiByYXljYXN0IHBvaW50cyBnbG9iYWxseSBmcm9tIGNhbnZhc1xuICAgIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgICAgIGNvbnN0IGhhbmRsZXIgPSAoZSkgPT4ge1xuICAgICAgICAgICAgIC8vIEluIFIzRiwgY2xpY2sgZXZlbnRzIG5hdGl2ZWx5IHJldHVybiB0aGUgaW50ZXJzZWN0ZWQgcG9pbnQuXG4gICAgICAgICAgICAgLy8gVG8gZ2xvYmFsbHkgY2VudGVyIG9yYml0IG9uIEFOWSBjbGljayBvbiB0aGUgM0Qgc2NlbmUsIHdlIGNvdWxkIHVzZSB0aGUgbWVzaCBvbkNsaWNrIGV2ZW50cy5cbiAgICAgICAgICAgICAvLyBXZSB3aWxsIGltcGxlbWVudCB0aGlzIGNlbnRyYWxseSB2aWEgdGhlICdjYW52YXMtZm9jdXMtcG9pbnQnIGN1c3RvbSBldmVudCBvciBuYXRpdmVseSBpbiBtZXNoIHBvaW50ZXIgZG93bi5cbiAgICAgICAgfTtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCBtb3VzZUJ1dHRvbnMgPSB7XG4gICAgICAgIExFRlQ6IGludGVyYWN0aW9uTW9kZSA9PT0gJ1BBTicgPyBUSFJFRS5NT1VTRS5QQU4gOiBUSFJFRS5NT1VTRS5ST1RBVEUsXG4gICAgICAgIE1JRERMRTogVEhSRUUuTU9VU0UuRE9MTFksXG4gICAgICAgIFJJR0hUOiBpbnRlcmFjdGlvbk1vZGUgPT09ICdQQU4nID8gVEhSRUUuTU9VU0UuUk9UQVRFIDogVEhSRUUuTU9VU0UuUEFOXG4gICAgfTtcblxuICAvLyBXaGVuIENUUkwgaXMgcHJlc3NlZCwgb3ZlcnJpZGUgbW91c2UgYnV0dG9ucyB0byBudWxsXG4gIC8vIHNvIHRoYXQgT3JiaXRDb250cm9scyBkb2Vzbid0IGhpamFjayB0aGUgZHJhZ1xuICBjb25zdCBbY3RybFByZXNzZWQsIHNldEN0cmxQcmVzc2VkXSA9IHVzZVN0YXRlKGZhbHNlKTtcbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICAgIGNvbnN0IGRvd24gPSAoZSkgPT4ge1xuICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0NvbnRyb2wnIHx8IGUua2V5ID09PSAnTWV0YScpIHNldEN0cmxQcmVzc2VkKHRydWUpO1xuICAgICAgfTtcbiAgICAgIGNvbnN0IHVwID0gKGUpID0+IHtcbiAgICAgICAgICBpZiAoZS5rZXkgPT09ICdDb250cm9sJyB8fCBlLmtleSA9PT0gJ01ldGEnKSBzZXRDdHJsUHJlc3NlZChmYWxzZSk7XG4gICAgICB9O1xuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBkb3duKTtcbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHVwKTtcbiAgICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBkb3duKTtcbiAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB1cCk7XG4gICAgICB9XG4gIH0sIFtdKTtcblxuICBjb25zdCBjdXJyZW50TW91c2VCdXR0b25zID0gY3RybFByZXNzZWQgPyB7IExFRlQ6IG51bGwsIE1JRERMRTogVEhSRUUuTU9VU0UuRE9MTFksIFJJR0hUOiBudWxsIH0gOiBtb3VzZUJ1dHRvbnM7XG5cbiAgICByZXR1cm4gPE9yYml0Q29udHJvbHNcbiAgICAgICAgICAgICAgICByZWY9eyhjKSA9PiB7IGNvbnRyb2xzUmVmLmN1cnJlbnQgPSBjOyBpZiAoZXh0ZXJuYWxSZWYpIGV4dGVybmFsUmVmLmN1cnJlbnQgPSBjOyB9fVxuICAgICAgICAgICAgICAgIGVuYWJsZWQ9e2NvbnRyb2xzRW5hYmxlZH1cbiAgICAgICAgICAgICAgICBtYWtlRGVmYXVsdFxuICAgICAgICAgICAgICAgIGVuYWJsZURhbXBpbmdcbiAgICAgICAgICAgICAgICBkYW1waW5nRmFjdG9yPXswLjF9XG4gICAgICAgICAgICAgICAgbW91c2VCdXR0b25zPXtjdXJyZW50TW91c2VCdXR0b25zfVxuICAgICAgICAgICAgLz47XG59O1xuXG5cbmV4cG9ydCBmdW5jdGlvbiBDYW52YXNUYWIoKSB7XG4gIGNvbnN0IHsgc3RhdGU6IGFwcFN0YXRlLCBkaXNwYXRjaCB9ID0gdXNlQXBwQ29udGV4dCgpO1xuICBjb25zdCBvcnRob01vZGUgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5vcnRob01vZGUpO1xuICBjb25zdCBncmlkQ2VudGVyID0gdXNlTWVtbygoKSA9PiB7XG4gICAgICBjb25zdCByb3dzID0gYXBwU3RhdGUuc3RhZ2UyRGF0YSB8fCBbXTtcbiAgICAgIGlmICghcm93cy5sZW5ndGgpIHJldHVybiB7IHg6IDAsIHk6IDAsIHo6IDAgfTtcbiAgICAgIGxldCBtaW5YID0gSW5maW5pdHksIG1pblkgPSBJbmZpbml0eSwgbWluWiA9IEluZmluaXR5O1xuICAgICAgbGV0IG1heFggPSAtSW5maW5pdHksIG1heFkgPSAtSW5maW5pdHksIG1heFogPSAtSW5maW5pdHk7XG4gICAgICByb3dzLmZvckVhY2goKHIpID0+IHtcbiAgICAgICAgICBbci5lcDEsIHIuZXAyLCByLmNwLCByLmJwXS5mb3JFYWNoKChwKSA9PiB7XG4gICAgICAgICAgICAgIGlmICghcCkgcmV0dXJuO1xuICAgICAgICAgICAgICBtaW5YID0gTWF0aC5taW4obWluWCwgcC54KTsgbWluWSA9IE1hdGgubWluKG1pblksIHAueSk7IG1pblogPSBNYXRoLm1pbihtaW5aLCBwLnopO1xuICAgICAgICAgICAgICBtYXhYID0gTWF0aC5tYXgobWF4WCwgcC54KTsgbWF4WSA9IE1hdGgubWF4KG1heFksIHAueSk7IG1heFogPSBNYXRoLm1heChtYXhaLCBwLnopO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgICBpZiAobWluWCA9PT0gSW5maW5pdHkpIHJldHVybiB7IHg6IDAsIHk6IDAsIHo6IDAgfTtcbiAgICAgIHJldHVybiB7IHg6IChtaW5YICsgbWF4WCkgLyAyLCB5OiAobWluWSArIG1heFkpIC8gMiwgejogKG1pblogKyBtYXhaKSAvIDIgfTtcbiAgfSwgW2FwcFN0YXRlLnN0YWdlMkRhdGFdKTtcblxuXG4gIGNvbnN0IHNob3dTaWRlSW5zcGVjdG9yID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuc2hvd1NpZGVJbnNwZWN0b3IpO1xuICBjb25zdCBzZXRTaG93U2lkZUluc3BlY3RvciA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLnNldFNob3dTaWRlSW5zcGVjdG9yKTtcblxuICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgICAgY29uc3QgaGFuZGxlT3BlblNpZGVJbnNwZWN0b3IgPSAoKSA9PiBzZXRTaG93U2lkZUluc3BlY3Rvcih0cnVlKTtcbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdvcGVuLXNpZGUtaW5zcGVjdG9yJywgaGFuZGxlT3BlblNpZGVJbnNwZWN0b3IpO1xuICAgICAgcmV0dXJuICgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdvcGVuLXNpZGUtaW5zcGVjdG9yJywgaGFuZGxlT3BlblNpZGVJbnNwZWN0b3IpO1xuICB9LCBbc2V0U2hvd1NpZGVJbnNwZWN0b3JdKTtcbiAgY29uc3QgcHJvcG9zYWxzID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUucHJvcG9zYWxzKTtcbiAgY29uc3QgW2N1cnJlbnRJc3N1ZUluZGV4LCBzZXRDdXJyZW50SXNzdWVJbmRleF0gPSB1c2VTdGF0ZSgwKTtcbiAgY29uc3QgZHJhZ09yYml0UmVmID0gdXNlUmVmKG51bGwpOyAvLyBzaGFyZWQgcmVmIGZvciBvcmJpdCBjb250cm9scyBkaXNhYmxlIGR1cmluZyBkcmFnXG5cbiAgLy8gU3RvcmUgQ29ubmVjdGlvbnNcbiAgY29uc3QgY2FudmFzTW9kZSA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmNhbnZhc01vZGUpO1xuICBjb25zdCBzZXRDYW52YXNNb2RlID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuc2V0Q2FudmFzTW9kZSk7XG4gIGNvbnN0IHNob3dHYXBSYWRhciA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLnNob3dHYXBSYWRhcik7XG4gIGNvbnN0IHNldFNob3dHYXBSYWRhciA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLnNldFNob3dHYXBSYWRhcik7XG4gIGNvbnN0IHNob3dSb3dMYWJlbHMgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5zaG93Um93TGFiZWxzKTtcbiAgY29uc3Qgc2V0U2hvd1Jvd0xhYmVscyA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLnNldFNob3dSb3dMYWJlbHMpO1xuICBjb25zdCBzaG93UmVmTGFiZWxzID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuc2hvd1JlZkxhYmVscyk7XG4gIGNvbnN0IHNldFNob3dSZWZMYWJlbHMgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5zZXRTaG93UmVmTGFiZWxzKTtcbiAgY29uc3QgY29sb3JNb2RlID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuY29sb3JNb2RlKTtcbiAgY29uc3Qgc2V0Q29sb3JNb2RlID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuc2V0Q29sb3JNb2RlKTtcbiAgY29uc3QgZHJhZ0F4aXNMb2NrID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuZHJhZ0F4aXNMb2NrKTtcbiAgY29uc3Qgc2V0RHJhZ0F4aXNMb2NrID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuc2V0RHJhZ0F4aXNMb2NrKTtcbiAgY29uc3QgdW5kbyA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLnVuZG8pO1xuICBjb25zdCBjbGlwcGluZ1BsYW5lRW5hYmxlZCA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmNsaXBwaW5nUGxhbmVFbmFibGVkKTtcbiAgY29uc3Qgc2hvd1NldHRpbmdzID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuc2hvd1NldHRpbmdzKTtcbiAgY29uc3Qgc2V0U2hvd1NldHRpbmdzID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuc2V0U2hvd1NldHRpbmdzKTtcbiAgY29uc3QgYXBwU2V0dGluZ3MgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5hcHBTZXR0aW5ncyk7XG4gIGNvbnN0IHNldENsaXBwaW5nUGxhbmVFbmFibGVkID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuc2V0Q2xpcHBpbmdQbGFuZUVuYWJsZWQpO1xuICBjb25zdCBjbGVhck11bHRpU2VsZWN0ID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUuY2xlYXJNdWx0aVNlbGVjdCk7XG4gIGNvbnN0IG11bHRpU2VsZWN0ZWRJZHMgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5tdWx0aVNlbGVjdGVkSWRzKTtcbiAgY29uc3QgZGVsZXRlRWxlbWVudHMgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5kZWxldGVFbGVtZW50cyk7XG4gIGNvbnN0IGRhdGFUYWJsZSA9IHVzZVN0b3JlKHN0YXRlID0+IHN0YXRlLmRhdGFUYWJsZSk7XG4gIGNvbnN0IHB1c2hIaXN0b3J5ID0gdXNlU3RvcmUoc3RhdGUgPT4gc3RhdGUucHVzaEhpc3RvcnkpO1xuXG4gIGNvbnN0IFt0b29sYmFyUG9zLCBzZXRUb29sYmFyUG9zXSA9IHVzZVN0YXRlKHsgeDogMTYsIHk6IDE2IH0pO1xuICBjb25zdCBbaXNEcmFnZ2luZ1Rvb2xiYXIsIHNldElzRHJhZ2dpbmdUb29sYmFyXSA9IHVzZVN0YXRlKGZhbHNlKTtcbiAgY29uc3QgW2RyYWdPZmZzZXQsIHNldERyYWdPZmZzZXRdID0gdXNlU3RhdGUoeyB4OiAwLCB5OiAwIH0pO1xuXG4gIGNvbnN0IGhhbmRsZVRvb2xiYXJQb2ludGVyRG93biA9IChlKSA9PiB7XG4gICAgc2V0SXNEcmFnZ2luZ1Rvb2xiYXIodHJ1ZSk7XG4gICAgc2V0RHJhZ09mZnNldCh7XG4gICAgICAgIHg6IGUuY2xpZW50WCAtIHRvb2xiYXJQb3MueCxcbiAgICAgICAgeTogZS5jbGllbnRZIC0gdG9vbGJhclBvcy55XG4gICAgfSk7XG4gICAgZS5jdXJyZW50VGFyZ2V0LnNldFBvaW50ZXJDYXB0dXJlKGUucG9pbnRlcklkKTtcbiAgfTtcblxuICBjb25zdCBoYW5kbGVUb29sYmFyUG9pbnRlck1vdmUgPSAoZSkgPT4ge1xuICAgIGlmICghaXNEcmFnZ2luZ1Rvb2xiYXIpIHJldHVybjtcbiAgICBzZXRUb29sYmFyUG9zKHtcbiAgICAgICAgeDogZS5jbGllbnRYIC0gZHJhZ09mZnNldC54LFxuICAgICAgICB5OiBlLmNsaWVudFkgLSBkcmFnT2Zmc2V0LnlcbiAgICB9KTtcbiAgfTtcblxuICBjb25zdCBoYW5kbGVUb29sYmFyUG9pbnRlclVwID0gKGUpID0+IHtcbiAgICBzZXRJc0RyYWdnaW5nVG9vbGJhcihmYWxzZSk7XG4gICAgZS5jdXJyZW50VGFyZ2V0LnJlbGVhc2VQb2ludGVyQ2FwdHVyZShlLnBvaW50ZXJJZCk7XG4gIH07XG5cbiAgY29uc3Qgc25hcFJlc29sdXRpb24gPSBhcHBTdGF0ZS5jb25maWc/LnNtYXJ0Rml4ZXI/LmdyaWRTbmFwUmVzb2x1dGlvbiA/PyAxMDA7XG5cbiAgLy8gSG92ZXIgdHJhY2tpbmcgZm9yIHRvb2x0aXBzXG4gIGNvbnN0IHNldEhvdmVyZWQgPSB1c2VTdG9yZShzdGF0ZSA9PiBzdGF0ZS5zZXRIb3ZlcmVkKTtcbiAgY29uc3QgaG92ZXJUaW1lciA9IHVzZVJlZihudWxsKTtcblxuICBjb25zdCBoYW5kbGVQb2ludGVyRW50ZXJNZXNoID0gdXNlQ2FsbGJhY2soKHJvd0luZGV4KSA9PiB7XG4gICAgICBpZiAoaG92ZXJUaW1lci5jdXJyZW50KSBjbGVhclRpbWVvdXQoaG92ZXJUaW1lci5jdXJyZW50KTtcbiAgICAgIGhvdmVyVGltZXIuY3VycmVudCA9IHNldFRpbWVvdXQoKCkgPT4gc2V0SG92ZXJlZChyb3dJbmRleCksIDE1MCk7XG4gIH0sIFtzZXRIb3ZlcmVkXSk7XG5cbiAgY29uc3QgaGFuZGxlUG9pbnRlckxlYXZlTWVzaCA9IHVzZUNhbGxiYWNrKCgpID0+IHtcbiAgICAgIGlmIChob3ZlclRpbWVyLmN1cnJlbnQpIGNsZWFyVGltZW91dChob3ZlclRpbWVyLmN1cnJlbnQpO1xuICAgICAgc2V0SG92ZXJlZChudWxsKTtcbiAgfSwgW3NldEhvdmVyZWRdKTtcblxuICAvLyBHbG9iYWwgS2V5IEhhbmRsZXJcbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICAgIGNvbnN0IGhhbmRsZUtleURvd24gPSAoZSkgPT4ge1xuICAgICAgICAgIC8vIElnbm9yZSBpZiB0aGlzIHRhYiBpcyBub3QgYWN0aXZlXG4gICAgICAgICAgaWYgKGFwcFN0YXRlLmFjdGl2ZVRhYiAhPT0gJ2NhbnZhcycpIHJldHVybjtcbiAgICAgICAgICAvLyBJZ25vcmUgaWYgdHlwaW5nIGluIGFuIGlucHV0XG4gICAgICAgICAgaWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgJiYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQudGFnTmFtZSA9PT0gJ0lOUFVUJyB8fCBkb2N1bWVudC5hY3RpdmVFbGVtZW50LnRhZ05hbWUgPT09ICdURVhUQVJFQScpKSByZXR1cm47XG5cbiAgICAgICAgICBzd2l0Y2ggKGUua2V5LnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgICAgICAgICAgY2FzZSAnYCc6XG4gICAgICAgICAgICAgICAgICBjb25zdCBkZWJ1Z0VuYWJsZWQgPSAhdXNlU3RvcmUuZ2V0U3RhdGUoKS5hcHBTZXR0aW5ncy5kZWJ1Z0NvbnNvbGVFbmFibGVkO1xuICAgICAgICAgICAgICAgICAgdXNlU3RvcmUuZ2V0U3RhdGUoKS51cGRhdGVBcHBTZXR0aW5ncyh7IGRlYnVnQ29uc29sZUVuYWJsZWQ6IGRlYnVnRW5hYmxlZCB9KTtcbiAgICAgICAgICAgICAgICAgIGlmIChkZWJ1Z0VuYWJsZWQpIGRiZy5lbmFibGUoKTsgZWxzZSBkYmcuZGlzYWJsZSgpO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgJ2VzY2FwZSc6XG4gICAgICAgICAgICAgICAgICBzZXRDYW52YXNNb2RlKCdWSUVXJyk7XG4gICAgICAgICAgICAgICAgICBjbGVhck11bHRpU2VsZWN0KCk7XG4gICAgICAgICAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldFNlbGVjdGVkKG51bGwpO1xuICAgICAgICAgICAgICAgICAgdXNlU3RvcmUuZ2V0U3RhdGUoKS5zZXRDbGlwcGluZ1BsYW5lRW5hYmxlZChmYWxzZSk7XG4gICAgICAgICAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldFNob3dSb3dMYWJlbHMoZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgdXNlU3RvcmUuZ2V0U3RhdGUoKS5zZXRTaG93UmVmTGFiZWxzKGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICdyJzpcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGlzTGFiZWxzT24gPSB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNob3dSb3dMYWJlbHM7XG4gICAgICAgICAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldFNob3dSb3dMYWJlbHMoIWlzTGFiZWxzT24pO1xuICAgICAgICAgICAgICAgICAgaWYgKCFpc0xhYmVsc09uKSB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldFRyYW5zbHVjZW50TW9kZSh0cnVlKTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICdjJzpcbiAgICAgICAgICAgICAgICAgIGlmICghZS5jdHJsS2V5ICYmICFlLm1ldGFLZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgICBzZXRDYW52YXNNb2RlKGNhbnZhc01vZGUgPT09ICdDT05ORUNUJyA/ICdWSUVXJyA6ICdDT05ORUNUJyk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgY2FzZSAndCc6IHNldENhbnZhc01vZGUoY2FudmFzTW9kZSA9PT0gJ1NUUkVUQ0gnID8gJ1ZJRVcnIDogJ1NUUkVUQ0gnKTsgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgJ2InOiBzZXRDYW52YXNNb2RlKGNhbnZhc01vZGUgPT09ICdCUkVBSycgPyAnVklFVycgOiAnQlJFQUsnKTsgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgJ20nOiBzZXRDYW52YXNNb2RlKGNhbnZhc01vZGUgPT09ICdNRUFTVVJFJyA/ICdWSUVXJyA6ICdNRUFTVVJFJyk7IGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICdpJzogc2V0Q2FudmFzTW9kZShjYW52YXNNb2RlID09PSAnSU5TRVJUX1NVUFBPUlQnID8gJ1ZJRVcnIDogJ0lOU0VSVF9TVVBQT1JUJyk7IGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICd4Jzogc2V0RHJhZ0F4aXNMb2NrKCdYJyk7IGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICd5Jzogc2V0RHJhZ0F4aXNMb2NrKCdZJyk7IGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICd6Jzogc2V0RHJhZ0F4aXNMb2NrKCdaJyk7IGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICdvJzogdXNlU3RvcmUuZ2V0U3RhdGUoKS50b2dnbGVPcnRob01vZGUoKTsgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgJ2YnOlxuICAgICAgICAgICAgICAgICAgaWYgKHVzZVN0b3JlLmdldFN0YXRlKCkuc2VsZWN0ZWRFbGVtZW50SWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICBjb25zdCBlbCA9IGRhdGFUYWJsZS5maW5kKHIgPT4gci5fcm93SW5kZXggPT09IHVzZVN0b3JlLmdldFN0YXRlKCkuc2VsZWN0ZWRFbGVtZW50SWQpO1xuICAgICAgICAgICAgICAgICAgICAgIGlmIChlbCAmJiBlbC5lcDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KCdjYW52YXMtZm9jdXMtcG9pbnQnLCB7IGRldGFpbDogeyB4OiBlbC5lcDEueCwgeTogZWwuZXAxLnksIHo6IGVsLmVwMS56LCBkaXN0OiAyMDAwIH0gfSkpO1xuICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlICdkZWxldGUnOlxuICAgICAgICAgICAgICBjYXNlICdiYWNrc3BhY2UnOlxuICAgICAgICAgICAgICAgICAgaWYgKChtdWx0aVNlbGVjdGVkSWRzIHx8IFtdKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgaWYgKHdpbmRvdy5jb25maXJtKGBEZWxldGUgJHsobXVsdGlTZWxlY3RlZElkcyB8fCBbXSkubGVuZ3RofSBlbGVtZW50cz9gKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICBwdXNoSGlzdG9yeSgnRGVsZXRlIEtleWJvYXJkJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogJ0RFTEVURV9FTEVNRU5UUycsIHBheWxvYWQ6IHsgcm93SW5kaWNlczogbXVsdGlTZWxlY3RlZElkcyB9IH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxldGVFbGVtZW50cyhtdWx0aVNlbGVjdGVkSWRzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIkFERF9MT0dcIiwgcGF5bG9hZDogeyBzdGFnZTogXCJJTlRFUkFDVElWRVwiLCB0eXBlOiBcIkFwcGxpZWQvRml4XCIsIG1lc3NhZ2U6IGBEZWxldGVkICR7KG11bHRpU2VsZWN0ZWRJZHMgfHwgW10pLmxlbmd0aH0gZWxlbWVudHMgdmlhIGtleWJvYXJkLmAgfSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHVzZVN0b3JlLmdldFN0YXRlKCkuc2VsZWN0ZWRFbGVtZW50SWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzZWxJZCA9IHVzZVN0b3JlLmdldFN0YXRlKCkuc2VsZWN0ZWRFbGVtZW50SWQ7XG4gICAgICAgICAgICAgICAgICAgICAgaWYgKHdpbmRvdy5jb25maXJtKGBEZWxldGUgUm93ICR7c2VsSWR9P2ApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIHB1c2hIaXN0b3J5KCdEZWxldGUgS2V5Ym9hcmQnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiAnREVMRVRFX0VMRU1FTlRTJywgcGF5bG9hZDogeyByb3dJbmRpY2VzOiBbc2VsSWRdIH0gfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZUVsZW1lbnRzKFtzZWxJZF0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldFNlbGVjdGVkKG51bGwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiQUREX0xPR1wiLCBwYXlsb2FkOiB7IHN0YWdlOiBcIklOVEVSQUNUSVZFXCIsIHR5cGU6IFwiQXBwbGllZC9GaXhcIiwgbWVzc2FnZTogYERlbGV0ZWQgUm93ICR7c2VsSWR9IHZpYSBrZXlib2FyZC5gIH0gfSk7XG4gICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgJ2gnOlxuICAgICAgICAgICAgICAgICAgaWYgKGUuc2hpZnRLZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLmhpZGVTZWxlY3RlZCgpO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChlLmFsdEtleSkge1xuICAgICAgICAgICAgICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkudW5oaWRlQWxsKCk7XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuaXNvbGF0ZVNlbGVjdGVkKCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgY2FzZSAndSc6XG4gICAgICAgICAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLnVuaGlkZUFsbCgpO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAvLyBDdHJsK1pcbiAgICAgICAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ3onICYmIChlLmN0cmxLZXkgfHwgZS5tZXRhS2V5KSkge1xuICAgICAgICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICAgICAgICB1bmRvKCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICBjb25zdCBoYW5kbGVLZXlVcCA9IChlKSA9PiB7XG4gICAgICAgICAgaWYgKFsneCcsICd5JywgJ3onXS5pbmNsdWRlcyhlLmtleS50b0xvd2VyQ2FzZSgpKSkge1xuICAgICAgICAgICAgICBzZXREcmFnQXhpc0xvY2sobnVsbCk7XG4gICAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVLZXlEb3duKTtcbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIGhhbmRsZUtleVVwKTtcblxuICAgICAgY29uc3QgaGFuZGxlWnVzdGFuZFVuZG8gPSAoKSA9PiB7XG4gICAgICAgICAgLy8gU3luYyBadXN0YW5kJ3MgbmV3bHkgcmVzdG9yZWQgc3RhdGUgYmFjayB0byBBcHBDb250ZXh0XG4gICAgICAgICAgY29uc3QgcmVzdG9yZWRUYWJsZSA9IHVzZVN0b3JlLmdldFN0YXRlKCkuZGF0YVRhYmxlO1xuICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJBUFBMWV9HQVBfRklYXCIsIHBheWxvYWQ6IHsgdXBkYXRlZFRhYmxlOiByZXN0b3JlZFRhYmxlIH0gfSk7XG4gICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIkFERF9MT0dcIiwgcGF5bG9hZDogeyBzdGFnZTogXCJJTlRFUkFDVElWRVwiLCB0eXBlOiBcIkluZm9cIiwgbWVzc2FnZTogXCJVbmRvIGNvbXBsZXRlZC5cIiB9IH0pO1xuICAgICAgfTtcblxuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3p1c3RhbmQtdW5kbycsIGhhbmRsZVp1c3RhbmRVbmRvKTtcblxuICAgICAgcmV0dXJuICgpID0+IHtcbiAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGhhbmRsZUtleURvd24pO1xuICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXl1cCcsIGhhbmRsZUtleVVwKTtcbiAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignenVzdGFuZC11bmRvJywgaGFuZGxlWnVzdGFuZFVuZG8pO1xuICAgICAgfTtcbiAgfSwgW2NhbnZhc01vZGUsIHNldENhbnZhc01vZGUsIGNsZWFyTXVsdGlTZWxlY3QsIHNldERyYWdBeGlzTG9jaywgdW5kbywgbXVsdGlTZWxlY3RlZElkcywgZGlzcGF0Y2gsIHB1c2hIaXN0b3J5LCBkZWxldGVFbGVtZW50cywgZGF0YVRhYmxlXSk7XG5cblxuICBjb25zdCBoYW5kbGVEcmFnQ29tbWl0ID0gdXNlQ2FsbGJhY2soKHJvd0luZGV4LCBjb29yZHMpID0+IHtcbiAgICAvLyBGaWx0ZXIgb3V0IG51bGwgY29vcmQgZmllbGRzXG4gICAgY29uc3QgY2xlYW5Db29yZHMgPSBPYmplY3QuZnJvbUVudHJpZXMoXG4gICAgICBPYmplY3QuZW50cmllcyhjb29yZHMpLmZpbHRlcigoWywgdl0pID0+IHYgIT09IG51bGwpXG4gICAgKTtcbiAgICBkaXNwYXRjaCh7IHR5cGU6IFwiVVBEQVRFX1NUQUdFMl9ST1dfQ09PUkRTXCIsIHBheWxvYWQ6IHsgcm93SW5kZXgsIGNvb3JkczogY2xlYW5Db29yZHMgfSB9KTtcbiAgICAvLyBNaXJyb3IgdG8gWnVzdGFuZCBzbyAzRCB2aWV3IHVwZGF0ZXMgaW1tZWRpYXRlbHlcbiAgICBjb25zdCB1cGRhdGVkID0gdXNlU3RvcmUuZ2V0U3RhdGUoKS5kYXRhVGFibGUubWFwKHIgPT5cbiAgICAgIHIuX3Jvd0luZGV4ID09PSByb3dJbmRleCA/IHsgLi4uciwgLi4uY2xlYW5Db29yZHMgfSA6IHJcbiAgICApO1xuICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0RGF0YVRhYmxlKHVwZGF0ZWQpO1xuICAgIGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IHsgc3RhZ2U6IFwiRFJBR19FRElUXCIsIHR5cGU6IFwiSW5mb1wiLCBtZXNzYWdlOiBgRHJhZy1lZGl0ZWQgcm93ICR7cm93SW5kZXh9IChzbmFwPSR7c25hcFJlc29sdXRpb259bW0pLmAgfSB9KTtcbiAgfSwgW2Rpc3BhdGNoLCBzbmFwUmVzb2x1dGlvbl0pO1xuXG4gIGNvbnN0IHZhbGlkYXRpb25Jc3N1ZXMgPSAoYXBwU3RhdGUuc3RhZ2UyRGF0YSB8fCBbXSkuZmlsdGVyKHIgPT5cbiAgICAgIHR5cGVvZiByLmZpeGluZ0FjdGlvbiA9PT0gJ3N0cmluZycgJiYgKHIuZml4aW5nQWN0aW9uLmluY2x1ZGVzKCdFUlJPUicpIHx8IHIuZml4aW5nQWN0aW9uLmluY2x1ZGVzKCdXQVJOSU5HJykpXG4gICk7XG5cbiAgY29uc3QgaGFuZGxlQXV0b0NlbnRlciA9ICgpID0+IHtcbiAgICAgIHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudCgnY2FudmFzLWF1dG8tY2VudGVyJykpO1xuICB9O1xuXG4gIGNvbnN0IGhhbmRsZUFwcHJvdmUgPSAoZSwgcHJvcCkgPT4ge1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcblxuICAgICAgY29uc3QgdXBkYXRlZFRhYmxlID0gWy4uLmFwcFN0YXRlLnN0YWdlMkRhdGFdO1xuICAgICAgY29uc3Qgcm93ID0gdXBkYXRlZFRhYmxlLmZpbmQociA9PiByLl9yb3dJbmRleCA9PT0gcHJvcC5lbGVtZW50QS5fcm93SW5kZXgpO1xuICAgICAgaWYgKHJvdykge1xuICAgICAgICAgIHJvdy5fZml4QXBwcm92ZWQgPSB0cnVlO1xuICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJTRVRfU1RBR0VfMl9EQVRBXCIsIHBheWxvYWQ6IHVwZGF0ZWRUYWJsZSB9KTtcbiAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiQUREX0xPR1wiLCBwYXlsb2FkOiB7IHN0YWdlOiBcIkZJWElOR1wiLCB0eXBlOiBcIkluZm9cIiwgbWVzc2FnZTogXCJBcHByb3ZlZCBmaXggcHJvcG9zYWwgZm9yIHJvdyBcIiArIHJvdy5fcm93SW5kZXggfX0pO1xuICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0UHJvcG9zYWxTdGF0dXMocm93Ll9yb3dJbmRleCwgdHJ1ZSk7XG4gICAgICB9XG4gIH07XG5cbiAgY29uc3QgaGFuZGxlUmVqZWN0ID0gKGUsIHByb3ApID0+IHtcbiAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cbiAgICAgIGNvbnN0IHVwZGF0ZWRUYWJsZSA9IFsuLi5hcHBTdGF0ZS5zdGFnZTJEYXRhXTtcbiAgICAgIGNvbnN0IHJvdyA9IHVwZGF0ZWRUYWJsZS5maW5kKHIgPT4gci5fcm93SW5kZXggPT09IHByb3AuZWxlbWVudEEuX3Jvd0luZGV4KTtcbiAgICAgIGlmIChyb3cpIHtcbiAgICAgICAgICByb3cuX2ZpeEFwcHJvdmVkID0gZmFsc2U7XG4gICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIlNFVF9TVEFHRV8yX0RBVEFcIiwgcGF5bG9hZDogdXBkYXRlZFRhYmxlIH0pO1xuICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IHsgc3RhZ2U6IFwiRklYSU5HXCIsIHR5cGU6IFwiSW5mb1wiLCBtZXNzYWdlOiBcIlJlamVjdGVkIGZpeCBwcm9wb3NhbCBmb3Igcm93IFwiICsgcm93Ll9yb3dJbmRleCB9fSk7XG4gICAgICAgICAgdXNlU3RvcmUuZ2V0U3RhdGUoKS5zZXRQcm9wb3NhbFN0YXR1cyhyb3cuX3Jvd0luZGV4LCBmYWxzZSk7XG4gICAgICB9XG4gIH07XG5cbiAgY29uc3QgdHJpZ2dlclpvb21Ub0N1cnJlbnQgPSAoKSA9PiB7XG4gICAgICAvLyBMb2dpYyBpcyBoYW5kbGVkIGluIHRoZSBlZmZlY3QgaW5zaWRlIFNpbmdsZUlzc3VlUGFuZWwsXG4gICAgICAvLyBidXQgd2UgY2FuIGZvcmNlIHJlLXRyaWdnZXIgYnkgcmUtc2V0dGluZyBpbmRleCBvciBqdXN0IGxldHRpbmcgdGhlIHVzZXIgY2xpY2sgdGhlIGJ1dHRvbi5cbiAgICAgIC8vIEVhc2llc3QgaXMgdG8gZGlzcGF0Y2ggYSBkdW1teSBldmVudCB0aGF0IHRoZSBlZmZlY3QgbGlzdGVucyB0bywgb3IganVzdCB1cGRhdGUgc3RhdGUuXG4gICAgICAvLyBBIHRyaWNrOiBzZXQgaW5kZXggdG8gaXRzZWxmLiBSZWFjdCBtaWdodCBub3QgcmUtcmVuZGVyLCBzbyB3ZSBjYW4gZGlzcGF0Y2ggdGhlIGV2ZW50IGRpcmVjdGx5IGhlcmUgaWYgbmVlZGVkLFxuICAgICAgLy8gYnV0IFNpbmdsZUlzc3VlUGFuZWwgYWxyZWFkeSBoYW5kbGVzIGF1dG8tY2VudGVyIHZpYSB0aGUgb25BdXRvQ2VudGVyIHByb3AuIFdhaXQsIFNpbmdsZUlzc3VlUGFuZWwgZG9lc24ndCBoYXZlIHRoZSBsb2dpYyBpbnNpZGUgb25BdXRvQ2VudGVyLlxuICAgICAgLy8gTGV0J3MgcGFzcyBhIGZ1bmN0aW9uIHRoYXQgZ2V0cyB0aGUgY3VycmVudCBpdGVtIGFuZCB0cmlnZ2VycyB0aGUgZm9jdXMgZXZlbnQuXG5cbiAgICAgIGNvbnN0IGFsbElzc3VlcyA9IFtcbiAgICAgICAgICAuLi4odmFsaWRhdGlvbklzc3VlcyB8fCBbXSkubWFwKGkgPT4gKHsgdHlwZTogJ3ZhbGlkYXRpb24nLCBkYXRhOiBpIH0pKSxcbiAgICAgICAgICAuLi4ocHJvcG9zYWxzIHx8IFtdKS5tYXAocCA9PiAoeyB0eXBlOiAncHJvcG9zYWwnLCBkYXRhOiBwIH0pKVxuICAgICAgXTtcbiAgICAgIGlmIChhbGxJc3N1ZXMubGVuZ3RoID09PSAwKSByZXR1cm47XG4gICAgICBjb25zdCBzYWZlSW5kZXggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihjdXJyZW50SXNzdWVJbmRleCwgYWxsSXNzdWVzLmxlbmd0aCAtIDEpKTtcbiAgICAgIGNvbnN0IGN1cnJlbnRJdGVtID0gYWxsSXNzdWVzW3NhZmVJbmRleF07XG5cbiAgICAgIGxldCBmb2N1c1B0ID0gbnVsbDtcbiAgICAgIGxldCBmb2N1c0Rpc3QgPSAyMDAwO1xuICAgICAgaWYgKGN1cnJlbnRJdGVtLnR5cGUgPT09ICd2YWxpZGF0aW9uJyAmJiBjdXJyZW50SXRlbS5kYXRhLmVwMSkge1xuICAgICAgICAgIGZvY3VzUHQgPSBjdXJyZW50SXRlbS5kYXRhLmVwMTtcbiAgICAgIH0gZWxzZSBpZiAoY3VycmVudEl0ZW0udHlwZSA9PT0gJ3Byb3Bvc2FsJykge1xuICAgICAgICAgIGNvbnN0IHByb3AgPSBjdXJyZW50SXRlbS5kYXRhO1xuICAgICAgICAgIGlmIChwcm9wLnB0QSAmJiBwcm9wLnB0Qikge1xuICAgICAgICAgICAgICAgZm9jdXNQdCA9IHsgeDogKHByb3AucHRBLnggKyBwcm9wLnB0Qi54KS8yLCB5OiAocHJvcC5wdEEueSArIHByb3AucHRCLnkpLzIsIHo6IChwcm9wLnB0QS56ICsgcHJvcC5wdEIueikvMiB9O1xuICAgICAgICAgICAgICAgZm9jdXNEaXN0ID0gTWF0aC5tYXgocHJvcC5kaXN0ICogMywgMjAwMCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChwcm9wLmVsZW1lbnRBICYmIHByb3AuZWxlbWVudEEuZXAxKSB7XG4gICAgICAgICAgICAgICBmb2N1c1B0ID0gcHJvcC5lbGVtZW50QS5lcDE7XG4gICAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGZvY3VzUHQpIHtcbiAgICAgICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ2NhbnZhcy1mb2N1cy1wb2ludCcsIHsgZGV0YWlsOiB7IC4uLmZvY3VzUHQsIGRpc3Q6IGZvY3VzRGlzdCB9IH0pKTtcbiAgICAgIH1cbiAgfTtcblxuICBjb25zdCBleGVjdXRlRml4Nm1tID0gKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgICBwdXNoSGlzdG9yeSgnRml4IDZtbSBHYXBzJyk7XG4gICAgICAgICAgY29uc3QgeyB1cGRhdGVkVGFibGUsIGZpeExvZyB9ID0gZml4Nm1tR2FwcyhkYXRhVGFibGUpO1xuICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0RGF0YVRhYmxlKHVwZGF0ZWRUYWJsZSk7XG4gICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiAnQVBQTFlfR0FQX0ZJWCcsIHBheWxvYWQ6IHsgdXBkYXRlZFRhYmxlIH0gfSk7XG4gICAgICAgICAgZml4TG9nLmZvckVhY2gobG9nID0+IGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IGxvZyB9KSk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBkYmcuZXJyb3IoJ0VOR0lORV9FWEVDJywgJ0ZpeCA2bW0gR2FwcyBjcmFzaGVkJywgeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiAnQUREX0xPRycsIHBheWxvYWQ6IHsgdHlwZTogJ0Vycm9yJywgc3RhZ2U6ICdFTkdJTkUnLCBtZXNzYWdlOiBgRml4IDZtbSBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9YCB9IH0pO1xuICAgICAgfVxuICB9O1xuXG4gIGNvbnN0IGV4ZWN1dGVBdXRvUGlwZWxpbmVSZWYgPSAoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICAgIHB1c2hIaXN0b3J5KCdBdXRvIFBpcGVsaW5lIFJlZicpO1xuICAgICAgICAgIGNvbnN0IHsgdXBkYXRlZFRhYmxlLCBmaXhMb2cgfSA9IGF1dG9Bc3NpZ25QaXBlbGluZVJlZnMoZGF0YVRhYmxlKTtcbiAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldERhdGFUYWJsZSh1cGRhdGVkVGFibGUpO1xuICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogJ0FQUExZX0dBUF9GSVgnLCBwYXlsb2FkOiB7IHVwZGF0ZWRUYWJsZSB9IH0pOyAvLyBSZXVzZXMgdGFibGUgcmVwbGFjZSBhY3Rpb25cbiAgICAgICAgICBmaXhMb2cuZm9yRWFjaChsb2cgPT4gZGlzcGF0Y2goeyB0eXBlOiBcIkFERF9MT0dcIiwgcGF5bG9hZDogbG9nIH0pKTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIGRiZy5lcnJvcignRU5HSU5FX0VYRUMnLCAnQXV0byBQaXBlbGluZSBSZWYgY3Jhc2hlZCcsIHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogJ0FERF9MT0cnLCBwYXlsb2FkOiB7IHR5cGU6ICdFcnJvcicsIHN0YWdlOiAnRU5HSU5FJywgbWVzc2FnZTogYEF1dG8gUGlwZWxpbmUgUmVmIGZhaWxlZDogJHtlcnIubWVzc2FnZX1gIH0gfSk7XG4gICAgICB9XG4gIH07XG5cbiAgY29uc3QgZXhlY3V0ZUZpeDI1bW0gPSAoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICAgIHB1c2hIaXN0b3J5KCdGaXggMjVtbSBHYXBzJyk7XG4gICAgICAgICAgY29uc3QgeyB1cGRhdGVkVGFibGUsIGZpeExvZyB9ID0gZml4MjVtbUdhcHNXaXRoUGlwZShkYXRhVGFibGUpO1xuICAgICAgICAgIHVzZVN0b3JlLmdldFN0YXRlKCkuc2V0RGF0YVRhYmxlKHVwZGF0ZWRUYWJsZSk7XG4gICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiAnQVBQTFlfR0FQX0ZJWCcsIHBheWxvYWQ6IHsgdXBkYXRlZFRhYmxlIH0gfSk7XG4gICAgICAgICAgZml4TG9nLmZvckVhY2gobG9nID0+IGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IGxvZyB9KSk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBkYmcuZXJyb3IoJ0VOR0lORV9FWEVDJywgJ0ZpeCAyNW1tIEdhcHMgY3Jhc2hlZCcsIHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgIGRpc3BhdGNoKHsgdHlwZTogJ0FERF9MT0cnLCBwYXlsb2FkOiB7IHR5cGU6ICdFcnJvcicsIHN0YWdlOiAnRU5HSU5FJywgbWVzc2FnZTogYEZpeCAyNW1tIGZhaWxlZDogJHtlcnIubWVzc2FnZX1gIH0gfSk7XG4gICAgICB9XG4gIH07XG5cbiAgY29uc3QgZXhlY3V0ZU92ZXJsYXBTb2x2ZXIgPSAoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICAgIHB1c2hIaXN0b3J5KCdPdmVybGFwIFNvbHZlcicpO1xuICAgICAgICAgIGltcG9ydCgnLi4vLi4vZW5naW5lL092ZXJsYXBTb2x2ZXIuanMnKS50aGVuKCh7IHJlc29sdmVPdmVybGFwcyB9KSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IHsgdXBkYXRlZFRhYmxlLCBmaXhMb2cgfSA9IHJlc29sdmVPdmVybGFwcyhkYXRhVGFibGUpO1xuICAgICAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldERhdGFUYWJsZSh1cGRhdGVkVGFibGUpO1xuICAgICAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6ICdBUFBMWV9HQVBfRklYJywgcGF5bG9hZDogeyB1cGRhdGVkVGFibGUgfSB9KTtcbiAgICAgICAgICAgICAgZml4TG9nLmZvckVhY2gobG9nID0+IGRpc3BhdGNoKHsgdHlwZTogXCJBRERfTE9HXCIsIHBheWxvYWQ6IGxvZyB9KSk7XG4gICAgICAgICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgZGJnLmVycm9yKCdFTkdJTkVfRVhFQycsICdPdmVybGFwIFNvbHZlciBmYWlsZWQgZHVyaW5nIGV4ZWN1dGlvbicsIHsgZXJyb3I6IGVyci5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6ICdBRERfTE9HJywgcGF5bG9hZDogeyB0eXBlOiAnRXJyb3InLCBzdGFnZTogJ0VOR0lORScsIG1lc3NhZ2U6IGBPdmVybGFwIFNvbHZlciBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9YCB9IH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgZGJnLmVycm9yKCdFTkdJTkVfRVhFQycsICdPdmVybGFwIFNvbHZlciBjcmFzaGVkJywgeyBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiAnQUREX0xPRycsIHBheWxvYWQ6IHsgdHlwZTogJ0Vycm9yJywgc3RhZ2U6ICdFTkdJTkUnLCBtZXNzYWdlOiBgT3ZlcmxhcCBTb2x2ZXIgZmFpbGVkOiAke2Vyci5tZXNzYWdlfWAgfSB9KTtcbiAgICAgIH1cbiAgfTtcblxuICByZXR1cm4gKFxuICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBmbGV4LWNvbCBoLVtjYWxjKDEwMHZoLTRyZW0pXSB3LWZ1bGwgb3ZlcmZsb3ctaGlkZGVuIGJnLXNsYXRlLTk1MCByb3VuZGVkLWxnIGJvcmRlciBib3JkZXItc2xhdGUtODAwIHNoYWRvdy1pbm5lciByZWxhdGl2ZSBtdC1bLTJyZW1dXCI+XG5cbiAgICAgIHsvKiBOZXcgVUkgT3ZlcmxheXMgKi99XG4gICAgICA8U2NlbmVIZWFsdGhIVUQgLz5cblxuICAgICAgey8qIExlZnQgU2lkZWJhciBTdGFjayAqL31cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYWJzb2x1dGUgdG9wLTI0IGxlZnQtNCB6LTIwIGZsZXggZmxleC1jb2wgZ2FwLTQgaXRlbXMtc3RhcnQgcG9pbnRlci1ldmVudHMtbm9uZSBoLVtjYWxjKDEwMHZoLTEwcmVtKV0gb3ZlcmZsb3cteS1hdXRvIHctODAgcHItMlwiPlxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicG9pbnRlci1ldmVudHMtYXV0byBmbGV4IGZsZXgtY29sIGdhcC00IHctZnVsbFwiPlxuICAgICAgICAgICAgICA8TGVnZW5kTGF5ZXIgLz5cbiAgICAgICAgICAgICAgPFNpZGVJbnNwZWN0b3IgLz5cbiAgICAgICAgICAgICAgPFN1cHBvcnRQcm9wZXJ0eVBhbmVsIC8+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cblxuICAgICAgey8qIFJpZ2h0IFNpZGViYXIgU3RhY2sgKi99XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImFic29sdXRlIHRvcC0yNCByaWdodC00IHotMjAgZmxleCBmbGV4LWNvbCBnYXAtNCBpdGVtcy1lbmQgcG9pbnRlci1ldmVudHMtbm9uZSBoLVtjYWxjKDEwMHZoLTEwcmVtKV0gb3ZlcmZsb3cteS1hdXRvIHctODAgcGwtMlwiPlxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicG9pbnRlci1ldmVudHMtYXV0byBmbGV4IGZsZXgtY29sIGdhcC00IHctZnVsbCBpdGVtcy1lbmRcIj5cbiAgICAgICAgICAgICAgPEdhcFNpZGViYXIgLz5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuXG4gICAgICB7LyogRmxvYXRpbmcgT3ZlcmxheXMgKi99XG4gICAgICA8Q2xpcHBpbmdQYW5lbFVJIC8+XG5cbiAgICAgIDxQaXBlbGluZVByb3BlcnR5UGFuZWwgLz5cbiAgICAgIDxMb2dEcmF3ZXIgLz5cbiAgICAgIDxIb3ZlclRvb2x0aXAgLz5cbiAgICAgIDxTZXR0aW5nc01vZGFsIC8+XG4gICAgICA8Q29udGV4dE1lbnUgLz5cbiAgICAgIDxOYXZpZ2F0aW9uUGFuZWwgLz5cblxuICAgICAgPERlYnVnQ29uc29sZSAvPlxuXG4gICAgICA8ZGl2XG4gICAgICAgIGNsYXNzTmFtZT1cImFic29sdXRlIHotNDAgcG9pbnRlci1ldmVudHMtYXV0byBzaGFkb3ctbGdcIlxuICAgICAgICBzdHlsZT17eyBsZWZ0OiB0b29sYmFyUG9zLngsIHRvcDogdG9vbGJhclBvcy55IH19XG4gICAgICAgIG9uUG9pbnRlck1vdmU9e2hhbmRsZVRvb2xiYXJQb2ludGVyTW92ZX1cbiAgICAgICAgb25Qb2ludGVyVXA9e2hhbmRsZVRvb2xiYXJQb2ludGVyVXB9XG4gICAgICAgIG9uUG9pbnRlckRvd249eyhlKSA9PiB7XG4gICAgICAgICAgICAvLyBPbmx5IHN0YXJ0IGRyYWdnaW5nIGlmIGNsaWNraW5nIHRoZSB0b3AgaGVhZGVyIGJhciBvZiB0aGUgcmliYm9uXG4gICAgICAgICAgICBpZiAoZS50YXJnZXQuY2xvc2VzdCgnLmN1cnNvci1tb3ZlJykpIHtcbiAgICAgICAgICAgICAgICBoYW5kbGVUb29sYmFyUG9pbnRlckRvd24oZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH19XG4gICAgICA+XG4gICAgICAgIDxUb29sYmFyUmliYm9uXG4gICAgICAgICAgICBvbkZpeDZtbT17ZXhlY3V0ZUZpeDZtbX1cbiAgICAgICAgICAgIG9uRml4MjVtbT17ZXhlY3V0ZUZpeDI1bW19XG4gICAgICAgICAgICBvbkF1dG9SZWY9e2V4ZWN1dGVBdXRvUGlwZWxpbmVSZWZ9XG4gICAgICAgICAgICBvbk92ZXJsYXBTb2x2ZXI9e2V4ZWN1dGVPdmVybGFwU29sdmVyfVxuICAgICAgICAgICAgb25BdXRvQ2VudGVyPXtoYW5kbGVBdXRvQ2VudGVyfVxuICAgICAgICAgICAgb25Ub2dnbGVTaWRlSW5zcGVjdG9yPXsoKSA9PiBzZXRTaG93U2lkZUluc3BlY3Rvcighc2hvd1NpZGVJbnNwZWN0b3IpfVxuICAgICAgICAgICAgc2hvd1NpZGVJbnNwZWN0b3I9e3Nob3dTaWRlSW5zcGVjdG9yfVxuICAgICAgICAgICAgb25Qb2ludGVyRG93bj17aGFuZGxlVG9vbGJhclBvaW50ZXJEb3dufVxuICAgICAgICAvPlxuICAgICAgPC9kaXY+XG5cbiAgICAgIHsvKiBNb2RlIE92ZXJsYXkgKi99XG4gICAgICA8ZGl2XG4gICAgICAgIGNsYXNzTmFtZT1cImFic29sdXRlIHotNTAgZmxleCBmbGV4LWNvbCBnYXAtMiBpdGVtcy1jZW50ZXIgcG9pbnRlci1ldmVudHMtbm9uZSBib3R0b20tOCBsZWZ0LTEvMiAtdHJhbnNsYXRlLXgtMS8yXCJcbiAgICAgID5cbiAgICAgICAge2NhbnZhc01vZGUgIT09ICdWSUVXJyAmJiAoXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC1jb2wgZ2FwLTEgaXRlbXMtY2VudGVyIHBvaW50ZXItZXZlbnRzLWF1dG9cIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJnLXNsYXRlLTgwMC85MCB0ZXh0LXNsYXRlLTIwMCB0ZXh0LXhzIHB4LTMgcHktMS41IHJvdW5kZWQgYm9yZGVyIGJvcmRlci1zbGF0ZS02MDAgc2hhZG93LW1kIGZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyXCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPk1PREU6IDxzdHJvbmc+e2NhbnZhc01vZGUucmVwbGFjZSgnXycsICcgJyl9PC9zdHJvbmc+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJtbC0yIHRleHQtc2xhdGUtNDAwXCI+RXNjIHRvIGNhbmNlbDwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICB7KGNhbnZhc01vZGUgPT09ICdDT05ORUNUJyB8fCBjYW52YXNNb2RlID09PSAnU1RSRVRDSCcpICYmIChcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJiZy1zbGF0ZS04MDAvOTAgdGV4dC1hbWJlci00MDAgdGV4dC1bMTBweF0gcHgtMyBweS0xLjUgcm91bmRlZCBib3JkZXIgYm9yZGVyLWFtYmVyLTkwMC81MCBzaGFkb3ctbWQgbWF4LXctbWQgdGV4dC1jZW50ZXJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzdHJvbmc+VGlwOjwvc3Ryb25nPiBDbGljayBmaXJzdCBlbmRwb2ludCwgdGhlbiBjbGljayBzZWNvbmQgZW5kcG9pbnQuIFBhbm5pbmcgaXMgYWxsb3dlZC5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICApfVxuICAgICAgPC9kaXY+XG5cblxuICAgICAgPFNpbmdsZUlzc3VlUGFuZWxcbiAgICAgICAgICBwcm9wb3NhbHM9e3Byb3Bvc2Fsc31cbiAgICAgICAgICB2YWxpZGF0aW9uSXNzdWVzPXt2YWxpZGF0aW9uSXNzdWVzfVxuICAgICAgICAgIGN1cnJlbnRJc3N1ZUluZGV4PXtjdXJyZW50SXNzdWVJbmRleH1cbiAgICAgICAgICBzZXRDdXJyZW50SXNzdWVJbmRleD17c2V0Q3VycmVudElzc3VlSW5kZXh9XG4gICAgICAgICAgb25BdXRvQ2VudGVyPXt0cmlnZ2VyWm9vbVRvQ3VycmVudH1cbiAgICAgICAgICBvbkFwcHJvdmU9e2hhbmRsZUFwcHJvdmV9XG4gICAgICAgICAgb25SZWplY3Q9e2hhbmRsZVJlamVjdH1cbiAgICAgIC8+XG5cblxuICAgICAgPENhbnZhcz5cbiAgICAgICAge29ydGhvTW9kZSA/IChcbiAgICAgICAgICAgIDxPcnRob2dyYXBoaWNDYW1lcmEgbWFrZURlZmF1bHQgcG9zaXRpb249e1s1MDAwLCA1MDAwLCA1MDAwXX0gem9vbT17MC4yfSBuZWFyPXswLjF9IGZhcj17NTAwMDAwfSAvPlxuICAgICAgICApIDogKFxuICAgICAgICAgICAgPFBlcnNwZWN0aXZlQ2FtZXJhIG1ha2VEZWZhdWx0IHBvc2l0aW9uPXtbNTAwMCwgNTAwMCwgNTAwMF19IGZvdj17YXBwU2V0dGluZ3MuY2FtZXJhRm92fSBuZWFyPXthcHBTZXR0aW5ncy5jYW1lcmFOZWFyIHx8IDF9IGZhcj17YXBwU2V0dGluZ3MuY2FtZXJhRmFyIHx8IDUwMDAwMH0gLz5cbiAgICAgICAgKX1cbiAgICAgICAgPGNvbG9yIGF0dGFjaD1cImJhY2tncm91bmRcIiBhcmdzPXtbYXBwU2V0dGluZ3MuYmFja2dyb3VuZENvbG9yIHx8ICcjMDIwNjE3J119IC8+XG4gICAgICAgIDxhbWJpZW50TGlnaHQgaW50ZW5zaXR5PXswLjZ9IC8+XG4gICAgICAgIDxkaXJlY3Rpb25hbExpZ2h0IHBvc2l0aW9uPXtbMTAwMCwgMTAwMCwgNTAwXX0gaW50ZW5zaXR5PXsxLjV9IC8+XG4gICAgICAgIDxkaXJlY3Rpb25hbExpZ2h0IHBvc2l0aW9uPXtbLTEwMDAsIC0xMDAwLCAtNTAwXX0gaW50ZW5zaXR5PXswLjV9IC8+XG4gICAgICAgIHthcHBTZXR0aW5ncy5zaG93R3JpZCAmJiA8Z3JpZEhlbHBlciBhcmdzPXtbMTAwMDAsIDEwMF19IHBvc2l0aW9uPXtbZ3JpZENlbnRlci54LCBncmlkQ2VudGVyLnksIGdyaWRDZW50ZXIuel19IC8+fVxuICAgICAgICB7YXBwU2V0dGluZ3Muc2hvd0F4ZXMgJiYgPGF4ZXNIZWxwZXIgYXJncz17WzIwMDBdfSAvPn1cblxuICAgICAgICB7YXBwU3RhdGUuc3RhZ2UyRGF0YSAmJiBhcHBTdGF0ZS5zdGFnZTJEYXRhLmxlbmd0aCA+IDAgJiYgKFxuICAgICAgICAgICAgPD5cbiAgICAgICAgICAgICAgICA8SW5zdGFuY2VkUGlwZXMgLz5cbiAgICAgICAgICAgICAgICA8SW1tdXRhYmxlQ29tcG9uZW50cyAvPlxuXG4gICAgICAgICAgICAgICAgPEVuZHBvaW50U25hcExheWVyIC8+XG4gICAgICAgICAgICAgICAgPEdhcFJhZGFyTGF5ZXIgLz5cbiAgICAgICAgICAgICAgICA8R2xvYmFsU25hcExheWVyIC8+XG4gICAgICAgICAgICAgICAgPE1lYXN1cmVUb29sIC8+XG4gICAgICAgICAgICAgICAgPEJyZWFrUGlwZUxheWVyIC8+XG4gICAgICAgICAgICAgICAgPEluc2VydFN1cHBvcnRMYXllciAvPlxuICAgICAgICAgICAgICAgIDxFUExhYmVsc0xheWVyIC8+XG4gICAgICAgICAgICAgICAgPE1hcnF1ZWVMYXllciAvPlxuICAgICAgICAgICAgICAgIDxDbGlwcGluZ1BsYW5lc0xheWVyIC8+XG4gICAgICAgICAgICA8Lz5cbiAgICAgICAgKX1cblxuICAgICAgICB7KCgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGFsbElzc3VlcyA9IFtcbiAgICAgICAgICAgICAgICAuLi4odmFsaWRhdGlvbklzc3VlcyB8fCBbXSkubWFwKGkgPT4gKHsgdHlwZTogJ3ZhbGlkYXRpb24nLCBkYXRhOiBpIH0pKSxcbiAgICAgICAgICAgICAgICAuLi4ocHJvcG9zYWxzIHx8IFtdKS5tYXAocCA9PiAoeyB0eXBlOiAncHJvcG9zYWwnLCBkYXRhOiBwIH0pKVxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGNvbnN0IHNhZmVJbmRleCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGN1cnJlbnRJc3N1ZUluZGV4LCBhbGxJc3N1ZXMubGVuZ3RoIC0gMSkpO1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlSXRlbSA9IGFsbElzc3Vlc1tzYWZlSW5kZXhdO1xuICAgICAgICAgICAgY29uc3QgYWN0aXZlUHJvcG9zYWwgPSBhY3RpdmVJdGVtPy50eXBlID09PSAncHJvcG9zYWwnID8gYWN0aXZlSXRlbS5kYXRhIDogbnVsbDtcbiAgICAgICAgICAgIHJldHVybiA8R2hvc3RPdmVybGF5IGFjdGl2ZVByb3Bvc2FsPXthY3RpdmVQcm9wb3NhbH0gLz47XG4gICAgICAgIH0pKCl9XG5cbiAgICAgICAgeyhwcm9wb3NhbHMgfHwgW10pLm1hcCgocHJvcCwgaWR4KSA9PiB7XG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgZ2xvYmFsIGluZGV4IHRvIGNoZWNrIGlmIGFjdGl2ZVxuICAgICAgICAgICAgY29uc3QgYWxsSXNzdWVzID0gW1xuICAgICAgICAgICAgICAgIC4uLih2YWxpZGF0aW9uSXNzdWVzIHx8IFtdKS5tYXAoaSA9PiAoeyB0eXBlOiAndmFsaWRhdGlvbicsIGRhdGE6IGkgfSkpLFxuICAgICAgICAgICAgICAgIC4uLihwcm9wb3NhbHMgfHwgW10pLm1hcChwID0+ICh7IHR5cGU6ICdwcm9wb3NhbCcsIGRhdGE6IHAgfSkpXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgY29uc3Qgc2FmZUluZGV4ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oY3VycmVudElzc3VlSW5kZXgsIGFsbElzc3Vlcy5sZW5ndGggLSAxKSk7XG4gICAgICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IGFsbElzc3Vlc1tzYWZlSW5kZXhdPy50eXBlID09PSAncHJvcG9zYWwnICYmIGFsbElzc3Vlc1tzYWZlSW5kZXhdPy5kYXRhID09PSBwcm9wO1xuXG4gICAgICAgICAgICByZXR1cm4gaXNBY3RpdmUgPyA8UHJvcG9zYWxPdmVybGF5IGtleT17YHByb3AtJHtpZHh9YH0gcHJvcG9zYWw9e3Byb3B9IC8+IDogbnVsbDtcbiAgICAgICAgfSl9XG5cbiAgICAgICAgPEdpem1vSGVscGVyIGFsaWdubWVudD1cImJvdHRvbS1yaWdodFwiIG1hcmdpbj17WzgwLCA4MF19PlxuICAgICAgICAgIDxHaXptb1ZpZXdwb3J0IGF4aXNDb2xvcnM9e1snI2VmNDQ0NCcsICcjMTBiOTgxJywgJyMzYjgyZjYnXX0gbGFiZWxDb2xvcj1cIndoaXRlXCIgLz5cbiAgICAgICAgPC9HaXptb0hlbHBlcj5cblxuXG5cbiAgICAgICAgeygoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBhbGxJc3N1ZXMgPSBbXG4gICAgICAgICAgICAgICAgLi4uKHZhbGlkYXRpb25Jc3N1ZXMgfHwgW10pLm1hcChpID0+ICh7IHR5cGU6ICd2YWxpZGF0aW9uJywgZGF0YTogaSB9KSksXG4gICAgICAgICAgICAgICAgLi4uKHByb3Bvc2FscyB8fCBbXSkubWFwKHAgPT4gKHsgdHlwZTogJ3Byb3Bvc2FsJywgZGF0YTogcCB9KSlcbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICBjb25zdCBzYWZlSW5kZXggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihjdXJyZW50SXNzdWVJbmRleCwgYWxsSXNzdWVzLmxlbmd0aCAtIDEpKTtcbiAgICAgICAgICAgIHJldHVybiA8SXNzdWVNYXBQaW4gYWN0aXZlSXNzdWU9e2FsbElzc3Vlc1tzYWZlSW5kZXhdfSAvPjtcbiAgICAgICAgfSkoKX1cblxuXG4gICAgICAgIDxDb250cm9sc0F1dG9DZW50ZXIgZXh0ZXJuYWxSZWY9e2RyYWdPcmJpdFJlZn0gLz5cblxuICAgICAgICB7LyogV29ybGQgUmVmZXJlbmNlICovfVxuICAgICAgICA8Z3JpZEhlbHBlciBhcmdzPXtbMjAwMDAsIDIwLCAnIzFlMjkzYicsICcjMGYxNzJhJ119IHBvc2l0aW9uPXtbZ3JpZENlbnRlci54LCBncmlkQ2VudGVyLnkgLSAxMDAwLCBncmlkQ2VudGVyLnpdfSAvPlxuICAgICAgPC9DYW52YXM+XG5cbiAgICA8L2Rpdj5cbiAgKTtcbn1cbiJdLCJtYXBwaW5ncyI6IkFBQUEsT0FBT0EsS0FBSyxJQUFJQyxPQUFPLEVBQUVDLE1BQU0sRUFBRUMsUUFBUSxFQUFFQyxTQUFTLEVBQUVDLFdBQVcsUUFBUSxPQUFPO0FBQ2hGLFNBQVNDLE1BQU0sRUFBRUMsUUFBUSxFQUFFQyxRQUFRLFFBQVEsb0JBQW9CO0FBQy9ELFNBQVNDLGFBQWEsRUFBRUMsSUFBSSxFQUFFQyxJQUFJLEVBQUVDLElBQUksRUFBRUMsV0FB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QUE5QixRQUFRZ1QsR0FBRyxFQUFxQixDQUFDLEdBQUcsSUFBSTtNQUNwRixDQUFDLENBQUMsRUFFRmhoQixJQUFBLENBQUM1QixXQUFXO1FBQUNvdUIsU0FBUyxFQUFDLGNBQWM7UUFBQ0MsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBRTtRQUFBbmlCLFFBQUEsRUFDckR0SyxJQUFBLENBQUMzQixhQUFhO1VBQUNxdUIsVUFBVSxFQUFFLENBQUMsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUU7VUFBQ0MsVUFBVSxFQUFDO1FBQU8sQ0FBRTtNQUFDLENBQ3hFLENBQUMsRUFJYixDQUFDLE1BQU07UUFDSixNQUFNM2MsU0FBUyxHQUFHLENBQ2QsR0FBRyxDQUFDTixnQkFBZ0IsSUFBSSxFQUFFLEVBQUU5TCxHQUFHLENBQUMzQixDQUFDLEtBQUs7VUFBRTNCLElBQUksRUFBRSxZQUFZO1VBQUV5TixJQUFJLEVBQUU5TDtRQUFFLENBQUMsQ0FBQyxDQUFDLEVBQ3ZFLEdBQUcsQ0FBQ3dOLFNBQVMsSUFBSSxFQUFFLEVBQUU3TCxHQUFHLENBQUNxTSxDQUFDLEtBQUs7VUFBRTNQLElBQUksRUFBRSxVQUFVO1VBQUV5TixJQUFJLEVBQUVrQztRQUFFLENBQUMsQ0FBQyxDQUFDLENBQ2pFO1FBQ0QsTUFBTUMsU0FBUyxHQUFHakUsSUFBSSxDQUFDQyxHQUFHLENBQUMsQ0FBQyxFQUFFRCxJQUFJLENBQUNrRSxHQUFHLENBQUNSLGlCQUFpQixFQUFFSyxTQUFTLENBQUM5TixNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDaEYsT0FBT2xDLElBQUEsQ0FBQzROLFdBQVc7VUFBQ0MsV0FBVyxFQUFFbUMsU0FBUyxDQUFDRSxTQUFTO1FBQUUsQ0FBRSxDQUFDO01BQzdELENBQUMsRUFBRSxDQUFDLEVBR0psUSxJQUFBLENBQUNzaUIsa0JBQWtCO1FBQUNDLFdBQVcsRUFBRTJFO01BQWEsQ0FBRSxDQUFDLEVBR2pEbG5CLElBQUE7UUFBWXdLLElBQUksRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBRTtRQUFDNUQsUUFBUSxFQUFFLENBQUNpZ0IsVUFBVSxDQUFDNWpCLENBQUMsRUFBRTRqQixVQUFVLENBQUMxakIsQ0FBQyxHQUFHLElBQUksRUFBRTBqQixVQUFVLENBQUN6akIsQ0FBQztNQUFFLENBQUUsQ0FBQztJQUFBLENBQzlHLENBQUM7RUFBQSxDQUVOLENBQUM7QUFFViIsImlnbm9yZUxpc3QiOltdfQ==
