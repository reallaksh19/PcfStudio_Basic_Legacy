import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Html, Text, GizmoHelper, GizmoViewport, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../../store/useStore';
import { useAppContext } from '../../store/AppContext';
import { applyFixes } from '../../engine/FixApplicator';
import { createLogger } from '../../utils/Logger';
import { fix6mmGaps, fix25mmGapsWithPipe, breakPipeAtPoint, insertSupportAtPipe } from '../../engine/GapFixEngine';
import { autoAssignPipelineRefs } from '../../engine/TopologyEngine';
import { SideInspector } from '../components/SideInspector';
import { LogDrawer } from '../components/LogDrawer';
import { SceneHealthHUD } from '../components/SceneHealthHUD';
import { SupportPropertyPanel } from '../components/SupportPropertyPanel';
import { GapSidebar } from '../components/GapSidebar';
import { PipelinePropertyPanel } from '../components/PipelinePropertyPanel';
import { NavigationPanel } from '../components/NavigationPanel';
import { SettingsModal } from '../components/SettingsModal';
import { ClippingPlanesLayer, ClippingPanelUI } from '../components/ClippingPlanesLayer';
import { ToolbarRibbon } from '../components/ToolbarRibbon';
import { dbg } from '../../utils/debugGate';
import { DebugConsole } from '../components/DebugConsole';

// ----------------------------------------------------
// Colour & geometry helpers per component type
// ----------------------------------------------------
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
const getCAColor = (str) => {
    if (!str) return '#64748b';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
};

const computeSpools = (dataTable) => {
    const spools = {}; // rowIndex -> spoolId
    let spoolCounter = 1;

    // Adjacency map
    const endpoints = {}; // "x,y,z" -> [rowIndex]
    dataTable.forEach(r => {
        if ((r.type||'').toUpperCase() === 'SUPPORT') return; // Supports don't route spools
        if (r.ep1) { const key = `${parseFloat(r.ep1.x).toFixed(1)},${parseFloat(r.ep1.y).toFixed(1)},${parseFloat(r.ep1.z).toFixed(1)}`; if (!endpoints[key]) endpoints[key] = []; endpoints[key].push(r._rowIndex); }
        if (r.ep2) { const key = `${parseFloat(r.ep2.x).toFixed(1)},${parseFloat(r.ep2.y).toFixed(1)},${parseFloat(r.ep2.z).toFixed(1)}`; if (!endpoints[key]) endpoints[key] = []; endpoints[key].push(r._rowIndex); }
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
            if (curr.ep1) { const key = `${parseFloat(curr.ep1.x).toFixed(1)},${parseFloat(curr.ep1.y).toFixed(1)},${parseFloat(curr.ep1.z).toFixed(1)}`; (endpoints[key] || []).forEach(n => neighbors.add(n)); }
            if (curr.ep2) { const key = `${parseFloat(curr.ep2.x).toFixed(1)},${parseFloat(curr.ep2.y).toFixed(1)},${parseFloat(curr.ep2.z).toFixed(1)}`; (endpoints[key] || []).forEach(n => neighbors.add(n)); }

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
const spoolColor = (spoolId) => {
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
      const { ep1, ep2, bore } = element;
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

  const handlePointerDown = (e) => {
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

  const handlePointerMissed = (e) => {
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

  return (
    <group onPointerMissed={handlePointerMissed}>
        <instancedMesh ref={meshRef} args={[null, null, pipes.length]} onPointerDown={handlePointerDown}>
          <cylinderGeometry args={[1, 1, 1, 16]} />
          <meshStandardMaterial color="#3b82f6" transparent={translucentMode} opacity={translucentMode ? 0.3 : 1} depthWrite={!translucentMode} />
        </instancedMesh>

        {/* Highlight Overlays */}
        {(multiSelectedIds || []).map(id => {
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

            return (
                 <mesh key={`hl-${id}`} position={[midX, midY, midZ]} quaternion={quaternion}>
                     <cylinderGeometry args={[radius * 1.2, radius * 1.2, distance, 16]} />
                     <meshBasicMaterial color={appSettings.selectionColor} transparent opacity={appSettings.selectionOpacity} depthTest={false} />
                 </mesh>
            );
        })}
    </group>
  );
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

  return (
    <group>
      {elements.map((el, i) => {
        // SUPPORT: positioned by supportCoor, not ep1/ep2
        if ((el.type || '').toUpperCase() === 'SUPPORT') {
          const coor = el.supportCoor;
          if (!coor) return null;
          const r = Math.max((el.bore || 100) / 2, 50);
          const isSelected = multiSelectedIds.includes(el._rowIndex);
          const isRest = Object.values(el).some(v => typeof v === 'string' && ['CA150', 'REST'].includes(v.toUpperCase()));
          const isGui  = Object.values(el).some(v => typeof v === 'string' && ['CA100', 'GUI'].includes(v.toUpperCase()));
          const finalColor = isSelected ? appSettings.selectionColor : (isRest || isGui ? '#22c55e' : typeColor(el.type, appSettings));
          const onSuppClick = (e) => {
            if (e.nativeEvent) e.nativeEvent.__handled3D = true;
            if (useStore.getState().canvasMode !== 'VIEW') return;
            e.stopPropagation();
            if (e.ctrlKey || e.metaKey) { useStore.getState().toggleMultiSelect(el._rowIndex); }
            else { useStore.getState().clearMultiSelect(); useStore.getState().setSelected(el._rowIndex); useStore.getState().setMultiSelect([el._rowIndex]); }
          };
          return (
            <group key={`supp-${i}`} position={[coor.x, coor.y, coor.z]} onPointerDown={onSuppClick}>
              <mesh position={[0, r * 0.5, 0]}>
                <cylinderGeometry args={[0, r * 2, r, 8]} />
                <meshStandardMaterial color={finalColor} transparent={isTranslucent} opacity={isTranslucent ? 0.3 : 1} depthWrite={!isTranslucent} />
              </mesh>
              <mesh position={[0, -r * 0.25, 0]}>
                <cylinderGeometry args={[r, r, r * 0.5, 8]} />
                <meshStandardMaterial color={finalColor} transparent={isTranslucent} opacity={isTranslucent ? 0.3 : 1} depthWrite={!isTranslucent} />
              </mesh>
              {isGui && (
                <group position={[r * 1.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <mesh position={[0, r * 0.5, 0]}><cylinderGeometry args={[0, r * 1.5, r, 8]} /><meshStandardMaterial color={finalColor} /></mesh>
                  <mesh position={[0, -r * 0.25, 0]}><cylinderGeometry args={[r * 0.8, r * 0.8, r * 0.5, 8]} /><meshStandardMaterial color={finalColor} /></mesh>
                </group>
              )}
            </group>
          );
        }

        if (!el.ep1 || !el.ep2) return null;

        const vecA = new THREE.Vector3(el.ep1.x, el.ep1.y, el.ep1.z);
        const vecB = new THREE.Vector3(el.ep2.x, el.ep2.y, el.ep2.z);
        const dist = vecA.distanceTo(vecB);
        if (dist < 0.001) return null;

        const mid = vecA.clone().lerp(vecB, 0.5);
        const dir = vecB.clone().sub(vecA).normalize();
        const up  = new THREE.Vector3(0, 1, 0);
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

        const handleSelect = (e) => {
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
              dbg.error('IMM_SELECT', 'Fatal error during component selection', { error: err.message, rowIndex: el._rowIndex });
          }
        };

        if (type === 'FLANGE') {
          // Disc — short, wide cylinder
          return (
            <mesh key={`fl-${i}`} position={mid} quaternion={quat} onPointerDown={handleSelect}>
              <cylinderGeometry args={[r * 1.6, r * 1.6, Math.max(dist * 0.15, 10), 24]} />
              <meshStandardMaterial color={isSelected ? appSettings.selectionColor : color} transparent={isTranslucent} opacity={isTranslucent ? 0.3 : 1} depthWrite={!isTranslucent} />
            </mesh>
          );
        }

        if (type === 'VALVE') {
          // Double Cone (hourglass) body + small stem/wheel
          return (
            <group key={`vv-${i}`} position={mid} quaternion={quat} onPointerDown={handleSelect}>
                {/* Bottom Cone */}
                <mesh position={[0, -dist/4, 0]}>
                    <cylinderGeometry args={[0, r*1.8, dist/2, 16]} />
                    <meshStandardMaterial color={isSelected ? appSettings.selectionColor : color} transparent={isTranslucent} opacity={isTranslucent ? 0.3 : 1} depthWrite={!isTranslucent} />
                </mesh>
                {/* Top Cone */}
                <mesh position={[0, dist/4, 0]}>
                    <cylinderGeometry args={[r*1.8, 0, dist/2, 16]} />
                    <meshStandardMaterial color={isSelected ? appSettings.selectionColor : color} transparent={isTranslucent} opacity={isTranslucent ? 0.3 : 1} depthWrite={!isTranslucent} />
                </mesh>
                {/* Stem and wheel */}
                <group position={[r*2, 0, 0]} rotation={[0, 0, Math.PI/2]}>
                    <mesh position={[0, dist/2, 0]}>
                        <cylinderGeometry args={[r*0.2, r*0.2, dist, 8]} />
                        <meshStandardMaterial color={isSelected ? appSettings.selectionColor : color} transparent={isTranslucent} opacity={isTranslucent ? 0.3 : 1} depthWrite={!isTranslucent} />
                    </mesh>
                    <mesh position={[0, dist, 0]} rotation={[Math.PI/2, 0, 0]}>
                         <torusGeometry args={[r, r*0.2, 8, 24]} />
                         <meshStandardMaterial color={isSelected ? appSettings.selectionColor : color} transparent={isTranslucent} opacity={isTranslucent ? 0.3 : 1} depthWrite={!isTranslucent} />
                    </mesh>
                    <mesh position={[0, dist, 0]}>
                         <cylinderGeometry args={[r*0.4, r*0.4, r*0.2, 16]} />
                         <meshStandardMaterial color={isSelected ? appSettings.selectionColor : color} transparent={isTranslucent} opacity={isTranslucent ? 0.3 : 1} depthWrite={!isTranslucent} />
                    </mesh>
                </group>
            </group>
          );
        }

        if (type === 'BEND') {
          // Slightly thicker cylinder in amber — no torus without 3 points; keep cylinder with distinct colour
          return (
            <mesh key={`bn-${i}`} position={mid} quaternion={quat} onPointerDown={handleSelect}>
              <cylinderGeometry args={[r * 1.1, r * 1.1, dist, 16]} />
              <meshStandardMaterial color={isSelected ? appSettings.selectionColor : color} transparent={isTranslucent} opacity={isTranslucent ? 0.3 : 1} depthWrite={!isTranslucent} />
            </mesh>
          );
        }

        if (type === 'TEE') {
          // Main run cylinder + branch stub
          const branchDir = el.cp && el.bp
            ? new THREE.Vector3(el.bp.x - el.cp.x, el.bp.y - el.cp.y, el.bp.z - el.cp.z).normalize()
            : new THREE.Vector3(0, 0, 1);
          const branchLen = el.cp && el.bp
            ? new THREE.Vector3(el.bp.x - el.cp.x, el.bp.y - el.cp.y, el.bp.z - el.cp.z).length()
            : r * 3;
          const branchMid = el.cp
            ? new THREE.Vector3(
                el.cp.x + branchDir.x * branchLen / 2,
                el.cp.y + branchDir.y * branchLen / 2,
                el.cp.z + branchDir.z * branchLen / 2
              )
            : mid.clone().addScaledVector(branchDir, branchLen / 2);
          const branchQuat = new THREE.Quaternion().setFromUnitVectors(up, branchDir);
          const branchR = el.branchBore ? el.branchBore / 2 : r * 0.6;
          return (
            <group key={`tee-${i}`} onPointerDown={handleSelect}>
              <mesh position={mid} quaternion={quat}>
                <cylinderGeometry args={[r, r, dist, 16]} />
                <meshStandardMaterial color={isSelected ? appSettings.selectionColor : color} transparent={isTranslucent} opacity={isTranslucent ? 0.3 : 1} depthWrite={!isTranslucent} />
              </mesh>
              <mesh position={branchMid} quaternion={branchQuat}>
                <cylinderGeometry args={[branchR, branchR, branchLen, 12]} />
                <meshStandardMaterial color={isSelected ? appSettings.selectionColor : color} transparent={isTranslucent} opacity={isTranslucent ? 0.3 : 1} depthWrite={!isTranslucent} />
              </mesh>
            </group>
          );
        }

        if (type === 'OLET') {
          // Small sphere at CP position
          const pos = el.cp
            ? [el.cp.x, el.cp.y, el.cp.z]
            : [mid.x, mid.y, mid.z];
          return (
            <mesh key={`ol-${i}`} position={pos} onPointerDown={handleSelect}>
              <sphereGeometry args={[r * 1.3, 12, 12]} />
              <meshStandardMaterial color={isSelected ? appSettings.selectionColor : color} transparent={isTranslucent} opacity={isTranslucent ? 0.3 : 1} depthWrite={!isTranslucent} />
            </mesh>
          );
        }

        // Fallback: generic cylinder
        return (
          <mesh key={`im-${i}`} position={mid} quaternion={quat} onPointerDown={handleSelect}>
            <cylinderGeometry args={[r, r, dist, 16]} />
            <meshStandardMaterial color={isSelected ? appSettings.selectionColor : color} transparent={isTranslucent} opacity={isTranslucent ? 0.3 : 1} depthWrite={!isTranslucent} />
          </mesh>
        );
      })}
    </group>
  );
};

// ----------------------------------------------------
// Ghost overlay: wireframe of the element(s) affected
// by the currently-active proposal
// ----------------------------------------------------
const GhostOverlay = ({ activeProposal }) => {
  const appSettings = useStore(state => state.appSettings);
  if (!activeProposal) return null;

  const elements = [activeProposal.elementA, activeProposal.elementB].filter(Boolean);

  return (
    <group>
      {elements.map((el, i) => {
        if (!el.ep1 || !el.ep2) return null;
        const vecA = new THREE.Vector3(el.ep1.x, el.ep1.y, el.ep1.z);
        const vecB = new THREE.Vector3(el.ep2.x, el.ep2.y, el.ep2.z);
        const dist = vecA.distanceTo(vecB);
        if (dist < 0.001) return null;
        const mid  = vecA.clone().lerp(vecB, 0.5);
        const dir  = vecB.clone().sub(vecA).normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
        const r    = el.bore ? el.bore / 2 : 5;
        return (
          <mesh key={`ghost-${i}`} position={mid} quaternion={quat}>
            <cylinderGeometry args={[r * 1.05, r * 1.05, dist, 16]} />
            {/* Faint highlight to show original position */}
            <meshBasicMaterial color={appSettings.selectionColor} opacity={0.3} transparent depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
};

// ----------------------------------------------------
// Gap/Proposal Map Pin Visualization
// ----------------------------------------------------

// ----------------------------------------------------
// Active Issue Map Pin Visualization
// ----------------------------------------------------
const IssueMapPin = ({ activeIssue }) => {
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
          pos = [(prop.ptA.x + prop.ptB.x)/2, (prop.ptA.y + prop.ptB.y)/2, (prop.ptA.z + prop.ptB.z)/2];
      } else if (prop.elementA && prop.elementA.ep1) {
          pos = [prop.elementA.ep1.x, prop.elementA.ep1.y, prop.elementA.ep1.z];
      }
      label = `Row ${prop.elementA?._rowIndex}`;
      color = "#3b82f6"; // blue for proposal
  }

  if (!pos) return null;

  return (
    <group position={pos}>
        {/* Pin Geometry */}
        <mesh position={[0, 150, 0]}>
            <sphereGeometry args={[50, 16, 16]} />
            <meshBasicMaterial color={color} />
        </mesh>
        <mesh position={[0, 75, 0]}>
            <coneGeometry args={[50, 150, 16]} rotation={[Math.PI, 0, 0]} />
            <meshBasicMaterial color={color} />
        </mesh>

        {/* Label Background */}
        <mesh position={[0, 250, 0]}>
            <planeGeometry args={[300, 100]} />
            <meshBasicMaterial color="white" side={THREE.DoubleSide} />
        </mesh>

        {/* Label Text */}
        <Text
            position={[0, 250, 1]}
            color="black"
            fontSize={60}
            anchorX="center"
            anchorY="middle"
            outlineWidth={2}
            outlineColor="white"
            fontWeight="bold"
        >
            {label}
        </Text>
    </group>
  );
};


// ----------------------------------------------------
// Smart Fix Proposal Rendering
// ----------------------------------------------------
const ProposalOverlay = ({ proposal }) => {
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

    return (
        <group>
            <Line points={[vecA, vecB]} color={color} lineWidth={3} dashed dashScale={10} dashSize={10} gapSize={10} />

            {/* Translucent Cylinder for Pipe Fill/Trim */}
            <mesh position={mid} quaternion={quaternion}>
                <cylinderGeometry args={[bore / 2, bore / 2, dist, 16]} />
                <meshStandardMaterial color={color} opacity={0.5} transparent depthWrite={false} side={THREE.DoubleSide} />
            </mesh>

            <mesh position={vecA}>
                <sphereGeometry args={[bore / 2 + 2, 8, 8]} />
                <meshBasicMaterial color={color} />
            </mesh>
            <mesh position={vecB}>
                <sphereGeometry args={[bore / 2 + 2, 8, 8]} />
                <meshBasicMaterial color={color} />
            </mesh>

            <mesh position={mid}>
                <planeGeometry args={[300, 80]} />
                <meshBasicMaterial color="#1e293b" side={THREE.DoubleSide} opacity={0.8} transparent />
            </mesh>
            <Text
                position={[mid.x, mid.y, mid.z + 1]}
                color={color}
                fontSize={35}
                anchorX="center"
                anchorY="middle"
                outlineWidth={1}
                outlineColor="#0f172a"
            >
                {action} ({dist.toFixed(1)}mm)
            </Text>
        </group>
    );
};


// ----------------------------------------------------
// Single Issue Navigation Panel
// ----------------------------------------------------
const SingleIssuePanel = ({ proposals, validationIssues, currentIssueIndex, setCurrentIssueIndex, onAutoCenter, onApprove, onReject }) => {
    const allIssues = [
        ...(validationIssues || []).map(i => ({ type: 'validation', data: i })),
        ...(proposals || []).map(p => ({ type: 'proposal', data: p }))
    ];

    const safeIndex = Math.max(0, Math.min(currentIssueIndex, allIssues.length - 1));
    const currentItem = allIssues[safeIndex];

    // Draggable state using simple absolute positioning
    const [pos, setPos] = useState({ x: 0, y: 0 }); // Note: We handle setting this dynamically
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
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
                     x: (pRect.width / 2) - (cRect.width / 2),
                     y: pRect.height - cRect.height - 32 // 32px from bottom (bottom-8)
                 });
             }
        }
    }, [pos.x, pos.y]);

    if (allIssues.length === 0) return null;

    const handlePrev = () => setCurrentIssueIndex(Math.max(0, currentIssueIndex - 1));
    const handleNext = () => setCurrentIssueIndex(Math.min(allIssues.length - 1, currentIssueIndex + 1));

    const handlePointerDown = (e) => {
        setIsDragging(true);
        const rect = panelRef.current.getBoundingClientRect();
        // Calculate offset from the top-left of the panel
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
        e.target.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
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

        setPos({ x: newX, y: newY });
    };

    const handlePointerUp = (e) => {
        setIsDragging(false);
        e.target.releasePointerCapture(e.pointerId);
    };

    // If pos is still 0,0, apply a CSS class for centering, otherwise use absolute top/left
    const style = (pos.x !== 0 || pos.y !== 0)
        ? { left: pos.x, top: pos.y }
        : { bottom: '2rem', left: '50%', transform: 'translateX(-50%)' };

    return (
        <div
            ref={panelRef}
            style={style}
            className="absolute z-20 w-96 bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden"
        >
            {/* Header / Drag Handle */}
            <div
                className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-700 cursor-move"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <div className="flex items-center gap-2 pointer-events-none">
                    <span className="text-slate-300 font-bold text-sm">Issue {safeIndex + 1} of {allIssues.length}</span>
                </div>
                <div className="flex gap-1">
                    <button onClick={handlePrev} disabled={currentIssueIndex === 0} className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><path d="m15 18-6-6 6-6"/></svg>
                    </button>
                    <button onClick={onAutoCenter} className="p-1 rounded hover:bg-slate-700 transition" title="Focus Camera">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    </button>
                    <button onClick={handleNext} disabled={currentIssueIndex === allIssues.length - 1} className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                </div>
            </div>

            {/* Content Body */}
            <div className="p-4">
                {currentItem.type === 'validation' ? (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-red-400 uppercase tracking-widest px-2 py-0.5 bg-red-900/30 rounded border border-red-800/50">Validation Issue</span>
                            <span className="text-slate-400 text-xs">Row {currentItem.data._rowIndex}</span>
                        </div>
                        <p className="text-sm text-slate-200 mb-1">{currentItem.data.type || 'Unknown Component'}</p>
                        <p className="text-xs text-slate-400 p-2 bg-slate-950 rounded border border-slate-800">{currentItem.data.fixingAction}</p>
                    </div>
                ) : (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest px-2 py-0.5 bg-amber-900/30 rounded border border-amber-800/50">Fix Proposal</span>
                            <span className="text-slate-400 text-xs">Row {currentItem.data.elementA?._rowIndex}</span>
                        </div>
                        <div className="p-2 bg-slate-950 rounded border border-slate-800">
                            <p className="text-sm text-slate-200 font-medium">{currentItem.data.description}</p>

                            {/* Detailed Proposal Info */}
                            {(() => {
                                const prop = currentItem.data;
                                return (
                                    <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between items-end">
                                        <div>
                                           <div className="text-[10px] text-slate-500">Action: {prop.action}</div>
                                           {prop.dist !== undefined && <div className="text-[10px] text-slate-500">Delta: {prop.dist.toFixed(1)}mm</div>}
                                        </div>
                                        {prop.score !== undefined && (
                                            <div className="flex items-center">
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${prop.score >= 10 ? 'text-green-400 bg-green-900/30 border-green-800' : 'text-orange-400 bg-orange-900/30 border-orange-800'}`}>Score {prop.score}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Actions */}
                            <div className="mt-4 flex gap-2">
                                {currentItem.data._fixApproved === true ? (
                                    <div className="w-full text-center text-green-500 font-bold text-sm py-1 bg-green-900/20 rounded border border-green-800/30">✓ Approved</div>
                                ) : currentItem.data._fixApproved === false ? (
                                    <div className="w-full text-center text-red-500 font-bold text-sm py-1 bg-red-900/20 rounded border border-red-800/30">✗ Rejected</div>
                                ) : (
                                    <>
                                        <button className="flex-1 bg-green-800 hover:bg-green-700 text-white text-sm py-1.5 rounded transition" onClick={(e) => onApprove(e, currentItem.data)}>
                                            ✓ Approve
                                        </button>
                                        <button className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-sm py-1.5 rounded transition flex justify-center items-center gap-1" onClick={(e) => onReject(e, currentItem.data)}>
                                            ✗ Reject
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
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

    const handlePointerMove = (e) => {
        let nearest = null;
        let minDist = snapRadius;

        // Find closest ep1, ep2, or midpoint
        dataTable.forEach(row => {
            const ptsToTest = [];
            if (row.ep1) ptsToTest.push(new THREE.Vector3(row.ep1.x, row.ep1.y, row.ep1.z));
            if (row.ep2) ptsToTest.push(new THREE.Vector3(row.ep2.x, row.ep2.y, row.ep2.z));
            if (row.ep1 && row.ep2) {
                const mid = new THREE.Vector3(row.ep1.x, row.ep1.y, row.ep1.z)
                    .lerp(new THREE.Vector3(row.ep2.x, row.ep2.y, row.ep2.z), 0.5);
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

    return (
        <group onPointerMove={handlePointerMove}>
            {/* Click plane for generic move events */}
            <mesh visible={false}>
                <planeGeometry args={[200000, 200000]} />
            </mesh>

            {cursorSnapPoint && (
                <mesh position={cursorSnapPoint} renderOrder={999}>
                    <sphereGeometry args={[15, 16, 16]} />
                    <meshBasicMaterial color={appSettings.selectionColor} transparent opacity={0.8} depthTest={false} />
                </mesh>
            )}
        </group>
    );
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
        return (
            <div className="flex flex-col gap-1 bg-slate-900/90 p-3 rounded border border-slate-700 backdrop-blur pointer-events-auto shadow-xl shrink-0">
                <div className="flex items-center gap-2 border-b border-slate-700 pb-1 mb-1">
                  <button onClick={() => setIsCollapsed(!isCollapsed)} className="text-red-500 hover:text-red-400 text-xs">
                    {isCollapsed ? '▶' : '▼'}
                  </button>
                  <h4 className="text-xs font-bold text-slate-300">Type Legend</h4>
                </div>
                {!isCollapsed && uniqueTypes.map(val => (
                    <div key={val} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: typeColor(val, appSettings) }}></div>
                        <span className="text-xs text-slate-400">{val}</span>
                    </div>
                ))}
            </div>
        );
    }

    if (colorMode === 'SPOOL') {
        const spools = computeSpools(dataTable);
        const uniqueSpoolIds = Array.from(new Set(Object.values(spools))).sort((a, b) => a - b);

        return (
            <div className="flex flex-col gap-1 bg-slate-900/90 p-3 rounded border border-slate-700 backdrop-blur pointer-events-auto shadow-xl shrink-0 max-h-64 overflow-y-auto">
                <div className="flex items-center gap-2 border-b border-slate-700 pb-1 mb-1">
                  <button onClick={() => setIsCollapsed(!isCollapsed)} className="text-red-500 hover:text-red-400 text-xs">
                    {isCollapsed ? '▶' : '▼'}
                  </button>
                  <h4 className="text-xs font-bold text-slate-300">Spool Legend</h4>
                </div>
                {!isCollapsed && uniqueSpoolIds.map(val => (
                    <div key={val} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: spoolColor(val) }}></div>
                        <span className="text-xs text-slate-400">Spool {val}</span>
                    </div>
                ))}
            </div>
        );
    }

    if (uniqueValues.length === 0) return null;

    return (
        <div className="flex flex-col gap-1 bg-slate-900/90 p-3 rounded border border-slate-700 backdrop-blur pointer-events-auto shadow-xl shrink-0 max-h-64 overflow-y-auto">
            <div className="flex items-center gap-2 border-b border-slate-700 pb-1 mb-1">
              <button onClick={() => setIsCollapsed(!isCollapsed)} className="text-red-500 hover:text-red-400 text-xs">
                {isCollapsed ? '▶' : '▼'}
              </button>
              <h4 className="text-xs font-bold text-slate-300">{colorMode} Legend</h4>
            </div>
            {!isCollapsed && (
              <>
                {uniqueValues.map(val => (
                    <div key={val} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getCAColor(val) }}></div>
                        <span className="text-xs text-slate-400">{val}</span>
                    </div>
                ))}
                <div className="flex items-center gap-2 mt-1">
                    <div className="w-3 h-3 rounded-full bg-slate-600"></div>
                    <span className="text-xs text-slate-500 italic">None / Missing</span>
                </div>
              </>
            )}
        </div>
    );
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
    const { dispatch } = useAppContext();
    const [isDragging, setIsDragging] = useState(false);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
    const overlayRef = useRef(null);
    const pointerIdRef = useRef(null);

    const { camera, size } = useThree();
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

        const corners = [
            new THREE.Vector3(box.min.x, box.min.y, box.min.z),
            new THREE.Vector3(box.max.x, box.min.y, box.min.z),
            new THREE.Vector3(box.min.x, box.max.y, box.min.z),
            new THREE.Vector3(box.max.x, box.max.y, box.min.z),
            new THREE.Vector3(box.min.x, box.min.y, box.max.z),
            new THREE.Vector3(box.max.x, box.min.y, box.max.z),
            new THREE.Vector3(box.min.x, box.max.y, box.max.z),
            new THREE.Vector3(box.max.x, box.max.y, box.max.z)
        ];

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

            const inside = px >= rectScreen.left && px <= rectScreen.right &&
                           py >= rectScreen.top && py <= rectScreen.bottom;

            if (inside) anyInside = true;
        }

        return anyInside;
    };

    const handlePointerDown = (e) => {
        if (e.button !== 0) return; // Only left mouse button

        e.stopPropagation();
        pointerIdRef.current = e.pointerId;

        if (overlayRef.current) {
            overlayRef.current.setPointerCapture(e.pointerId);
        }

        setIsDragging(true);
        setStartPos({ x: e.clientX, y: e.clientY });
        setCurrentPos({ x: e.clientX, y: e.clientY });
    };

    const handlePointerMove = (e) => {
        if (!isDragging || pointerIdRef.current !== e.pointerId) return;

        e.preventDefault();
        e.stopPropagation();
        setCurrentPos({ x: e.clientX, y: e.clientY });
    };

    const handlePointerUp = (e) => {
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
            const dragDist = Math.sqrt(
                Math.pow(currentPos.x - startPos.x, 2) +
                Math.pow(currentPos.y - startPos.y, 2)
            );

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
                let minX = Infinity, minY = Infinity, minZ = Infinity;
                let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
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
                    if (typeof dbg !== 'undefined') dbg.tool('MARQUEE_ZOOM', 'No elements in rect — zooming to center', { cx, cy });
                    window.dispatchEvent(new CustomEvent('canvas-focus-point', {
                        detail: { x: worldPt.x, y: worldPt.y, z: worldPt.z, dist: 3000 }
                    }));
                } else {
                    pts.forEach(p => {
                        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
                    });
                    const center = {
                        x: (minX + maxX) / 2,
                        y: (minY + maxY) / 2,
                        z: (minZ + maxZ) / 2
                    };
                    const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 500);
                    if (typeof dbg !== 'undefined') dbg.tool('MARQUEE_ZOOM', `Zooming to ${selected.length} elements`, {
                        center, extent, elementCount: selected.length
                    });
                    window.dispatchEvent(new CustomEvent('canvas-focus-point', {
                        detail: { ...center, dist: extent * 1.5 }
                    }));
                }
                // NOTE: Do NOT call setMultiSelect — zoom is a view operation, not selection
            } else if (canvasMode === 'MARQUEE_DELETE' && selected.length > 0) {
                if (window.confirm(`Delete ${selected.length} elements?`)) {
                    pushHistory('Delete via Marquee');
                    const rowIndices = selected.map(e => e._rowIndex);
                    dispatch({ type: 'DELETE_ELEMENTS', payload: { rowIndices } });

                    const updatedTable = useStore.getState().dataTable.filter(r => !rowIndices.includes(r._rowIndex));
                    useStore.getState().setDataTable(updatedTable);
                    dispatch({ type: "ADD_LOG", payload: { stage: "INTERACTIVE", type: "Applied/Fix", message: `Deleted ${selected.length} elements via marquee.` } });
                }
            }
        } catch (err) {
            if (typeof dbg !== 'undefined') dbg.error('MARQUEE', 'Fatal error during marquee operation', { error: err.message });
        }

        setCanvasMode('VIEW');
    };

    const handlePointerLeave = (e) => {
        if (isDragging && pointerIdRef.current === e.pointerId) {
            handlePointerUp(e);
        }
    };

    const getMarqueeStyle = () => {
        const isZoom = canvasMode === 'MARQUEE_ZOOM';
        const isDelete = canvasMode === 'MARQUEE_DELETE';
        const isCrossing = currentPos.x < startPos.x;
        const borderColor = isDelete ? '#ef4444' : isZoom ? '#818cf8' : (isCrossing ? '#10b981' : '#3b82f6');
        const bgColor = isDelete ? 'rgba(239,68,68,0.08)' : isZoom ? 'rgba(129,140,248,0.08)' : (isCrossing ? 'rgba(16,185,129,0.08)' : 'rgba(59,130,246,0.08)');
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
            transition: 'border-color 0.1s',
        };
    };

    const getCursor = () => {
        switch (canvasMode) {
            case 'MARQUEE_SELECT': return 'crosshair';
            case 'MARQUEE_ZOOM': return 'zoom-in';
            case 'MARQUEE_DELETE': return 'not-allowed';
            default: return 'default';
        }
    };

    return (
        <Html fullscreen zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
            <div
                ref={overlayRef}
                style={{
                    width: '100vw',
                    height: '100vh',
                    pointerEvents: 'auto',
                    cursor: getCursor(),
                    userSelect: 'none'
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
            >
                {isDragging && (
                    <div style={getMarqueeStyle()} />
                )}
            </div>
        </Html>
    );
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

    const handlePointerDown = (e) => {
        // Only run when directly hitting the global plane OR if handled by a specific mesh event handler that explicitly bubbles.
        // Actually, for robust measurement, relying on the global click plane is fine as long as depthWrite=false so it intercepts.
        // But since we want to snap to objects, we'll let `InstancedPipes` handle the click bubbling or use this capture plane.
        e.stopPropagation();
        try {
            addMeasurePt(cursorSnapPoint ? cursorSnapPoint.clone() : e.point.clone());
        } catch (err) {
            dbg.error('MEASURE_TOOL', 'Fatal error during measure operation', { error: err.message });
            setCanvasMode('VIEW');
        }
    };

    return (
        <group>
            {/* Provide a large capture plane so clicking "empty" space still registers a point,
                but ensure it renders behind everything else and doesn't write to depth so object clicks can hit first if needed,
                OR we just rely on this intercepting everything and using cursorSnapPoint! */}
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
                        return (
                            <group position={mid}>
                                <mesh position={[0, 0, 0]}>
                                    <planeGeometry args={[1000, 400]} />
                                    <meshBasicMaterial color="#1e293b" side={THREE.DoubleSide} opacity={0.8} transparent depthTest={false} />
                                </mesh>
                                <Text position={[0, 50, 1]} color={appSettings.selectionColor} fontSize={100} anchorX="center" anchorY="middle" outlineWidth={2} outlineColor="#0f172a" depthTest={false}>
                                    Dist: {dist.toFixed(1)}mm
                                </Text>
                                <Text position={[0, -50, 1]} color="#f8fafc" fontSize={60} anchorX="center" anchorY="middle" outlineWidth={2} outlineColor="#0f172a" depthTest={false}>
                                    X:{dx.toFixed(1)} Y:{dy.toFixed(1)} Z:{dz.toFixed(1)}
                                </Text>
                            </group>
                        );
                    })()}
                </>
            )}

            {/* Button to clear measure (optional, usually users hit Esc or 'm' again to exit) */}
        </group>
    );
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
    const { dispatch } = useAppContext();
    const pushHistory = useStore(state => state.pushHistory);
    const cursorSnapPoint = useStore(state => state.cursorSnapPoint);

    const [hoverPos, setHoverPos] = useState(null);

    if (canvasMode !== 'BREAK') return null;

    const handlePointerMove = (e) => {
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
                        payload: { rowIndex: pipeRow._rowIndex, rowA, rowB }
                    });

                    // Mirror to Zustand
                    const updatedTable = dataTable.flatMap(r =>
                        r._rowIndex === pipeRow._rowIndex ? [rowA, rowB] : [r]
                    ).map((r, i) => ({ ...r, _rowIndex: i + 1 })); // Re-index

                    useStore.getState().setDataTable(updatedTable);

                    dispatch({ type: "ADD_LOG", payload: { stage: "INTERACTIVE", type: "Applied/Fix", message: `Row ${pipeRow._rowIndex} broken at (${breakPt.x.toFixed(1)}, ${breakPt.y.toFixed(1)}, ${breakPt.z.toFixed(1)}).` } });

                    // One-shot action
                    useStore.getState().setCanvasMode('VIEW');
                } else {
                    dispatch({ type: "ADD_LOG", payload: { stage: "INTERACTIVE", type: "Error", message: `Cannot break pipe Row ${pipeRow._rowIndex}. Segment too short.` } });
                }
            } catch (err) {
                if (typeof dbg !== 'undefined') dbg.error('BREAK_PIPE', 'Fatal error during break operation', { error: err.message });
                dispatch({ type: "ADD_LOG", payload: { stage: "INTERACTIVE", type: "Error", message: `Failed to break pipe: ${err.message}` } });
            }
        }
    };

    return (
        <group>
             {/* Invisible plane/mesh intercepts down events?
                 Actually we attach events to the InstancedPipes via the group if we could,
                 but they are already rendered. We can render a transparent overlay of pipes here.
             */}
             <group onPointerMove={handlePointerMove} onPointerOut={handlePointerOut}>
                {dataTable.filter(r => (r.type||'').toUpperCase() === 'PIPE' && !useStore.getState().hiddenElementIds.includes(r._rowIndex)).map((pipe, i) => {
                    if (!pipe.ep1 || !pipe.ep2) return null;
                    const v1 = new THREE.Vector3(pipe.ep1.x, pipe.ep1.y, pipe.ep1.z);
                    const v2 = new THREE.Vector3(pipe.ep2.x, pipe.ep2.y, pipe.ep2.z);
                    const mid = v1.clone().lerp(v2, 0.5);
                    const dist = v1.distanceTo(v2);
                    if (dist === 0) return null;
                    const dir = v2.clone().sub(v1).normalize();
                    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
                    const r = pipe.bore ? pipe.bore / 2 : 5;
                    return (
                        <mesh key={`bp-${i}`} position={mid} quaternion={quat} onPointerDown={(e) => handlePointerDown(e, pipe)}>
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
    const { dispatch } = useAppContext();

    const [connectDraft, setConnectDraft] = useState(null);
    const [cursorPos, setCursorPos] = useState(new THREE.Vector3());

    // Active in CONNECT or STRETCH mode
    if (canvasMode !== 'CONNECT' && canvasMode !== 'STRETCH') return null;

    const snapRadius = 50; // mm

    const handlePointerMove = (e) => {
        let pt = e.point.clone();

        if (connectDraft && useStore.getState().orthoMode) {
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
        let nearest = null;
        let minDist = snapRadius;

        dataTable.forEach((row) => {
            ['ep1', 'ep2'].forEach(epKey => {
                const ep = row[epKey];
                if (ep) {
                    const pt = new THREE.Vector3(parseFloat(ep.x), parseFloat(ep.y), parseFloat(ep.z));
                    const d = pt.distanceTo(e.point);
                    if (d < minDist) {
                        minDist = d;
                        nearest = { row, epKey, position: pt };
                    }
                }
            });
        });

        // We already use useStore(cursorSnapPoint) globally but here we need
        // to manage click/drag specifically for stretching endpoints.
        // We'll rely on the global snap point for visuals, but we handle the dragging here.
    };

    const handlePointerDown = (e) => {
        // We handle logic in PointerUp for click-to-connect now
    };

    const handlePointerUp = (e) => {
        e.stopPropagation();

        try {

        let nearest = null;
        let minDist = snapRadius;

        dataTable.forEach((row) => {
            ['ep1', 'ep2'].forEach(epKey => {
                const ep = row[epKey];
                if (ep) {
                    const pt = new THREE.Vector3(parseFloat(ep.x), parseFloat(ep.y), parseFloat(ep.z));
                    const d = pt.distanceTo(e.point);
                    if (d < minDist) {
                        minDist = d;
                        nearest = { rowIndex: row._rowIndex, epKey, position: pt };
                    }
                }
            });
        });

        // If we don't have a draft yet, set the draft (First Click)
        if (!connectDraft) {
            if (nearest) {
                setConnectDraft({ fromRowIndex: nearest.rowIndex, fromEP: nearest.epKey, fromPosition: nearest.position });
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
                        const updatedRow = { ...updatedTable[sourceIdxInArray] };
                        updatedRow[connectDraft.fromEP] = { x: targetPos.x, y: targetPos.y, z: targetPos.z };
                        updatedTable[sourceIdxInArray] = updatedRow;

                        dispatch({
                            type: 'APPLY_GAP_FIX',
                            payload: { updatedTable }
                        });
                        useStore.getState().setDataTable(updatedTable);
                        dispatch({
                            type: 'ADD_LOG',
                            payload: { type: 'Applied/Fix', stage: 'STRETCH_TOOL', message: `Stretched Row ${sourceRow._rowIndex} to Row ${nearest.rowIndex}.` }
                        });
                    }
                } else {
                    // CONNECT MODE: Synthesize new bridge pipe instead of stretching
                    const newBridgePipe = {
                        type: 'PIPE',
                        ep1: { x: sourcePos.x, y: sourcePos.y, z: sourcePos.z },
                        ep2: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
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
                    const sequentialTable = updatedTable.map((r, i) => ({ ...r, _rowIndex: i + 1 }));

                    // Dispatch APPLY_GAP_FIX which replaces the full table in AppContext
                    dispatch({
                        type: 'APPLY_GAP_FIX',
                        payload: { updatedTable: sequentialTable }
                    });

                    // Mirror to Zustand store
                    useStore.getState().setDataTable(sequentialTable);

                    dispatch({
                        type: 'ADD_LOG',
                        payload: { type: 'Applied/Fix', stage: 'CONNECT_TOOL', message: `Bridged Row ${sourceRow._rowIndex} and Row ${nearest.rowIndex} with a new PIPE.` }
                    });
                }
            }
        }

        setConnectDraft(null);
        setCanvasMode('VIEW');

        } catch (err) {
            dbg.error('ENDPOINT_SNAP', 'Fatal error during connect/stretch operation', { error: err.message });
            dispatch({ type: 'ADD_LOG', payload: { type: 'Error', stage: 'ENDPOINT_SNAP', message: `Connect/Stretch failed: ${err.message}` } });
            setConnectDraft(null);
            setCanvasMode('VIEW');
        }
    };

    return (
        <group>
            {/* Transparent capture plane for CONNECT or STRETCH mode */}
            <mesh
                scale={100000}
                rotation={[-Math.PI / 2, 0, 0]}
                onPointerMove={handlePointerMove}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                renderOrder={-1}
            >
                <planeGeometry />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>

            {/* Draw snap targets on every EP */}
            {dataTable.map((row, i) => {
                const pts = [];
                if (row.ep1) pts.push(new THREE.Vector3(parseFloat(row.ep1.x), parseFloat(row.ep1.y), parseFloat(row.ep1.z)));
                if (row.ep2) pts.push(new THREE.Vector3(parseFloat(row.ep2.x), parseFloat(row.ep2.y), parseFloat(row.ep2.z)));
                return (
                    <React.Fragment key={`group-${row._rowIndex}`}>
                        {pts.map((pt, j) => (
                            <mesh key={`snap-${row._rowIndex}-${j}`} position={pt} renderOrder={999}>
                                <sphereGeometry args={[20, 16, 16]} />
                                <meshBasicMaterial color={appSettings.selectionColor} transparent opacity={0.5} depthTest={false} />
                            </mesh>
                        ))}
                    </React.Fragment>
                );
            })}

            {/* Draw active connection preview line */}
            {connectDraft && (() => {
                const start = connectDraft.fromPosition;
                const end = cursorPos;
                const vec = new THREE.Vector3().subVectors(end, start);
                const len = vec.length();
                if (len < 0.1) return null; // Avoid rendering 0-length cylinders
                const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
                const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec.clone().normalize());
                const color = canvasMode === 'STRETCH' ? '#10b981' : '#f59e0b'; // Emerald for stretch, Amber for connect

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

// ----------------------------------------------------
// Gap Radar Layer
// ----------------------------------------------------
const GapRadarLayer = () => {
    const showGapRadar = useStore(state => state.showGapRadar);
    const dataTable = useStore(state => state.dataTable);

    // For pulsing animation
    const materialRef = useRef();
    const sphereRef = useRef();

    useFrame(({ clock }) => {
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
                    found.push({ ptA, ptB, dist, mid: ptA.clone().lerp(ptB, 0.5) });
                }
            }
        }
        return found;
    }, [showGapRadar, dataTable]);

    if (!showGapRadar || gaps.length === 0) return null;

    return (
        <group>
            {gaps.map((gap, i) => {
                const color = gap.dist <= 6.0 ? '#f97316' : '#ef4444'; // Orange for fixable, Red for insert pipe
                return (
                    <PulsingGap key={`gap-${i}`} gap={gap} color={color} />
                );
            })}
        </group>
    );
};

const PulsingGap = ({ gap, color }) => {
    const meshRefA = useRef();
    const matRefA = useRef();
    const meshRefB = useRef();
    const matRefB = useRef();

    useFrame(({ clock }) => {
        if (!meshRefA.current || !matRefA.current || !meshRefB.current || !matRefB.current) return;
        const time = clock.getElapsedTime();
        const s = 1 + Math.sin(time * 5) * 0.35; // Pulse scale
        meshRefA.current.scale.set(s, s, s);
        meshRefB.current.scale.set(s, s, s);
        const opacity = 0.5 + Math.abs(Math.sin(time * 5)) * 0.4;
        matRefA.current.opacity = opacity;
        matRefB.current.opacity = opacity;
    });

    return (
        <group>
            {/* Glow effect */}
            <Line points={[gap.ptA, gap.ptB]} color={color} lineWidth={12} transparent opacity={0.3} depthTest={false} />
            {/* Core line */}
            <Line points={[gap.ptA, gap.ptB]} color={color} lineWidth={4} dashed dashSize={5} gapSize={2} depthTest={false} />

            {/* Pulsing Spheres at endpoints for visibility */}
            <mesh position={gap.ptA} ref={meshRefA}>
                <sphereGeometry args={[20, 16, 16]} />
                <meshBasicMaterial ref={matRefA} color={color} transparent opacity={0.7} depthTest={false} />
            </mesh>
            <mesh position={gap.ptB} ref={meshRefB}>
                <sphereGeometry args={[20, 16, 16]} />
                <meshBasicMaterial ref={matRefB} color={color} transparent opacity={0.7} depthTest={false} />
            </mesh>

            {/* Billboard text */}
            <Text position={[gap.mid.x, gap.mid.y + 15, gap.mid.z]} color={color} fontSize={20} fontWeight="bold" anchorX="center" outlineWidth={2} outlineColor="#000" depthTest={false}>
                ⚠ {gap.dist.toFixed(1)}mm Gap
            </Text>
        </group>
    );
};

// ----------------------------------------------------
// EP Labels
// ----------------------------------------------------
const EPLabelsLayer = () => {
    const appSettings = useStore(state => state.appSettings);
    const showRowLabels = useStore(state => state.showRowLabels);
    const showRefLabels = useStore(state => state.showRefLabels);
    const dataTable = useStore(state => state.dataTable);
    const { dispatch } = useAppContext();

    useEffect(() => {
        if ((showRowLabels || showRefLabels) && dataTable.length > 500) {
            dispatch({ type: "ADD_LOG", payload: { stage: "UI", type: "Warning", message: "Labels disabled: >500 elements causes performance issues." } });
            if (showRowLabels) useStore.getState().setShowRowLabels(false);
            if (showRefLabels) useStore.getState().setShowRefLabels(false);
        }
    }, [showRowLabels, showRefLabels, dataTable.length, dispatch]);

    if ((!showRowLabels && !showRefLabels) || dataTable.length > 500) return null;

    return (
        <group>
            {dataTable.map((el, i) => {
                if (!el.ep1 && !el.ep2) return null;
                const pt = el.ep1 || el.ep2;
                return (
                    <React.Fragment key={`eplabels-${i}`}>
                        {showRowLabels && (
                            <Text position={[pt.x, pt.y + 30, pt.z]} color={appSettings.selectionColor} fontSize={50} outlineWidth={2} outlineColor="#0f172a">
                                R{el._rowIndex}
                            </Text>
                        )}
                        {showRefLabels && el.pipelineRef && (
                            <Text position={[pt.x, pt.y + 80, pt.z]} color="#38bdf8" fontSize={50} outlineWidth={2} outlineColor="#0f172a">
                                {el.pipelineRef}
                            </Text>
                        )}
                    </React.Fragment>
                );
            })}
        </group>
    );
};

// ----------------------------------------------------
// Insert Support Layer
// ----------------------------------------------------
const InsertSupportLayer = () => {
    const appSettings = useStore(state => state.appSettings);
    const canvasMode = useStore(state => state.canvasMode);
    const dataTable = useStore(state => state.dataTable);
    const { dispatch } = useAppContext();
    const pushHistory = useStore(state => state.pushHistory);
    const cursorSnapPoint = useStore(state => state.cursorSnapPoint);

    const [hoverPos, setHoverPos] = useState(null);

    if (canvasMode !== 'INSERT_SUPPORT') return null;

    const handlePointerMove = (e) => {
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
                        payload: { afterRowIndex: pipeRow._rowIndex, supportRow }
                    });

                    // Add right after the pipe
                    const idx = dataTable.findIndex(r => r._rowIndex === pipeRow._rowIndex);
                    const updatedTable = [...dataTable];
                    updatedTable.splice(idx + 1, 0, supportRow);
                    const reindexedTable = updatedTable.map((r, i) => ({ ...r, _rowIndex: i + 1 }));

                    useStore.getState().setDataTable(reindexedTable);

                    dispatch({ type: "ADD_LOG", payload: { stage: "INTERACTIVE", type: "Applied/Fix", message: `Inserted Support at Row ${supportRow._rowIndex}.` } });

                    // Keep mode active to insert more, or return to VIEW?
                    // The requirements say one-shot for break, let's keep it for insert or make it one-shot.
                    // Assuming continuous insertion is helpful.
                }
            } catch (err) {
                dbg.error('INSERT_SUPPORT', 'Fatal error during support insertion', { error: err.message });
                dispatch({ type: 'ADD_LOG', payload: { type: 'Error', stage: 'INSERT_SUPPORT', message: `Support insertion failed: ${err.message}` } });
                setCanvasMode('VIEW');
            }
        }
    };

    return (
        <group>
             <group onPointerMove={handlePointerMove} onPointerOut={handlePointerOut}>
                {dataTable.filter(r => (r.type||'').toUpperCase() === 'PIPE').map((pipe, i) => {
                    if (!pipe.ep1 || !pipe.ep2) return null;
                    const v1 = new THREE.Vector3(pipe.ep1.x, pipe.ep1.y, pipe.ep1.z);
                    const v2 = new THREE.Vector3(pipe.ep2.x, pipe.ep2.y, pipe.ep2.z);
                    const mid = v1.clone().lerp(v2, 0.5);
                    const dist = v1.distanceTo(v2);
                    if (dist === 0) return null;
                    const dir = v2.clone().sub(v1).normalize();
                    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
                    const r = pipe.bore ? pipe.bore / 2 : 5;
                    return (
                        <mesh key={`is-${i}`} position={mid} quaternion={quat} onPointerDown={(e) => handlePointerDown(e, pipe)}>
                            <cylinderGeometry args={[r*2, r*2, dist, 8]} />
                            <meshBasicMaterial color="green" transparent opacity={0} depthWrite={false} />
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
    const { dispatch } = useAppContext();

    useEffect(() => {
        const handleClickOutside = () => {
            if (contextMenu) closeContextMenu();
        };
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, [contextMenu, closeContextMenu]);

    if (!contextMenu) return null;

    const handleAction = (action) => {
        // Ensure the clicked element is selected for these actions
        setSelected(contextMenu.rowIndex);
        setMultiSelect([contextMenu.rowIndex]);

        if (action === 'HIDE') {
            hideSelected();
        } else if (action === 'ISOLATE') {
            isolateSelected();
        } else if (action === 'DELETE') {
            dispatch({ type: 'DELETE_ELEMENTS', payload: { rowIndices: [contextMenu.rowIndex] } });
        } else if (action === 'PROPERTIES') {
            // Usually, selecting an element automatically shows the side inspector,
            // so we just need to ensure it's open if it's currently closed.
            window.dispatchEvent(new CustomEvent('open-side-inspector'));
        }
        closeContextMenu();
    };

    return (
        <div
            className="fixed z-[100] bg-slate-900 border border-slate-700 shadow-xl rounded py-1 w-44"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className="px-3 py-1 text-xs font-bold text-slate-500 border-b border-slate-800 mb-1">Row {contextMenu.rowIndex}</div>
            <button onClick={() => handleAction('PROPERTIES')} className="w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                Property Panel
            </button>
            <button onClick={() => handleAction('ISOLATE')} className="w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400"><path d="M5 12s2.545-5 7-5c4.928 0 7 5 7 5s-2.072 5-7 5c-4.455 0-7-5-7-5z"/><path d="M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>
                Isolate
            </button>
            <button onClick={() => handleAction('HIDE')} className="w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                Hide
            </button>
            <button onClick={() => handleAction('DELETE')} className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/40 hover:text-red-300 transition-colors mt-1 border-t border-slate-800 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                Delete
            </button>
        </div>
    );
};

// ----------------------------------------------------
// Hover Tooltip
// ----------------------------------------------------
const HoverTooltip = () => {
    const hoveredElementId = useStore(state => state.hoveredElementId);
    const dataTable = useStore(state => state.dataTable);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const timerRef = useRef(null);

    // Global listener for pointer move to track cursor
    useEffect(() => {
        const handleMouseMove = (e) => {
            setTooltipPos({ x: e.clientX, y: e.clientY });
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

    return (
        <div
            className="fixed z-50 pointer-events-none bg-slate-900/90 border border-slate-700 shadow-xl rounded p-2 text-xs"
            style={{ left: tooltipPos.x + 15, top: tooltipPos.y + 15 }}
        >
            <div className="flex items-center gap-2 mb-1">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase" style={{ backgroundColor: typeColor(el.type), color: 'white' }}>{el.type}</span>
                <span className="text-slate-300 font-bold">Row {el._rowIndex}</span>
            </div>
            <div className="text-slate-400 grid grid-cols-2 gap-x-3 gap-y-1">
                <span>Bore:</span><span className="text-slate-200">{el.bore}</span>
                <span>Len:</span><span className="text-slate-200">{len.toFixed(1)}mm</span>
                {el.ep1 && <><span>EP1 X:</span><span className="text-slate-200">{el.ep1.x.toFixed(1)}</span></>}
                {el.ep1 && <><span>EP1 Y:</span><span className="text-slate-200">{el.ep1.y.toFixed(1)}</span></>}
                {el.ep1 && <><span>EP1 Z:</span><span className="text-slate-200">{el.ep1.z.toFixed(1)}</span></>}
            </div>
        </div>
    );
};


// Main Tab Component
// ----------------------------------------------------

const ControlsAutoCenter = ({ externalRef }) => {
    const controlsRef = useRef();
    const getPipes = useStore(state => state.getPipes);
    const dataTable = useStore(state => state.dataTable);
    const [targetPos, setTargetPos] = useState(null);
    const [camPos, setCamPos] = useState(null);
    const isAnimating = useRef(false);
    const savedSessionRef = useRef(null);
    const didInitViewRef = useRef(false);

    const applyViewerFitPolicy = (camera, maxDim) => {
        if (!camera) return;
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

    const collectBounds = useCallback((elements) => {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        elements.forEach((element) => {
            [element?.ep1, element?.ep2, element?.cp, element?.bp, element?.supportCoor].forEach((pt) => {
                if (!pt) return;
                const x = Number(pt.x);
                const y = Number(pt.y);
                const z = Number(pt.z);
                if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
                minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
                maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
            });
        });

        if (minX == Infinity) return null;
        return {
            center: new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
            maxDim: Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1),
        };
    }, []);

    const isFiniteVectorLike = useCallback((value) => (
        value &&
        Number.isFinite(Number(value.x)) &&
        Number.isFinite(Number(value.y)) &&
        Number.isFinite(Number(value.z))
    ), []);

    const isSavedCameraSessionUsable = useCallback((saved, bounds) => {
        if (!saved || !bounds || !isFiniteVectorLike(saved.camPos) || !isFiniteVectorLike(saved.camTarget)) {
            return false;
        }
        const savedTarget = new THREE.Vector3(Number(saved.camTarget.x), Number(saved.camTarget.y), Number(saved.camTarget.z));
        const savedPos = new THREE.Vector3(Number(saved.camPos.x), Number(saved.camPos.y), Number(saved.camPos.z));
        const maxAllowedOffset = Math.max(bounds.maxDim * 20, 5000);

        return (
            savedTarget.distanceTo(bounds.center) <= maxAllowedOffset &&
            savedPos.distanceTo(bounds.center) <= maxAllowedOffset
        );
    }, [isFiniteVectorLike]);

    const frameElements = useCallback((viewType = 'FIT', elements = null) => {
        if (!controlsRef.current) return false;

        const pipes = getPipes();
        const immutables = useStore.getState().getImmutables();
        const allEls = elements || [...pipes, ...immutables];
        const bounds = collectBounds(allEls);
        if (!bounds) return false;

        const tPos = bounds.center.clone();
        const dist = Math.max(bounds.maxDim * 1.6, 1000);
        const up = new THREE.Vector3(0, 0, 1);
        let cPos = new THREE.Vector3(tPos.x + dist, tPos.y - dist, tPos.z + dist);

        switch (viewType) {
            case 'TOP':
                cPos = new THREE.Vector3(tPos.x, tPos.y, tPos.z + dist);
                up.set(0, 1, 0);
                break;
            case 'BOTTOM':
                cPos = new THREE.Vector3(tPos.x, tPos.y, tPos.z - dist);
                up.set(0, 1, 0);
                break;
            case 'FRONT':
                cPos = new THREE.Vector3(tPos.x, tPos.y - dist, tPos.z);
                break;
            case 'BACK':
                cPos = new THREE.Vector3(tPos.x, tPos.y + dist, tPos.z);
                break;
            case 'RIGHT':
                cPos = new THREE.Vector3(tPos.x + dist, tPos.y, tPos.z);
                break;
            case 'LEFT':
                cPos = new THREE.Vector3(tPos.x - dist, tPos.y, tPos.z);
                break;
            case 'HOME':
            case 'ISO':
            case 'FIT':
            default:
                cPos = new THREE.Vector3(tPos.x + dist, tPos.y - dist, tPos.z + dist);
                break;
        }

        controlsRef.current.object.up.copy(up);
        applyViewerFitPolicy(controlsRef.current.object, bounds.maxDim);
        setTargetPos(tPos);
        setCamPos(cPos);
        isAnimating.current = true;
        return true;
    }, [collectBounds, getPipes]);

    useFrame((state, delta) => {
        if (!controlsRef.current || !isAnimating.current || !targetPos || !camPos) return;

        controlsRef.current.target.lerp(targetPos, 5 * delta);
        state.camera.position.lerp(camPos, 5 * delta);

        if (controlsRef.current.target.distanceTo(targetPos) < 1 && state.camera.position.distanceTo(camPos) < 1) {
            isAnimating.current = false;
        }

        controlsRef.current.update();
    });

    useEffect(() => {
        const handleFocus = (e) => {
            if (!controlsRef.current) return;
            const { x, y, z, dist } = e.detail;
            const tPos = new THREE.Vector3(x, y, z);
            const zoomDist = Math.max(dist * 1.5, 300);

            const dir = new THREE.Vector3().subVectors(controlsRef.current.object.position, tPos).normalize();
            if (dir.lengthSq() < 0.1) dir.set(1, -1, 1).normalize();

            controlsRef.current.object.up.set(0, 0, 1);
            setTargetPos(tPos);
            setCamPos(new THREE.Vector3().copy(tPos).addScaledVector(dir, zoomDist));
            isAnimating.current = true;
        };

        const handleCenter = (e) => {
            const elsToFrame = e?.detail?.elements || null;
            frameElements('ISO', elsToFrame);
        };

        const handleSetView = (e) => {
            if (!controlsRef.current) return;
            const viewType = e.detail.viewType;
            frameElements(viewType === 'HOME' ? 'ISO' : viewType);
        };

        const handleSaveCamera = (e) => {
            if (!controlsRef.current) return;
            const preset = e.detail.preset;
            const data = {
                camPos: controlsRef.current.object.position.clone(),
                camTarget: controlsRef.current.target.clone(),
                camUp: controlsRef.current.object.up.clone(),
            };
            localStorage.setItem(`pcf-camera-preset-${preset}`, JSON.stringify(data));
        };

        const handleLoadCamera = (e) => {
            if (!controlsRef.current) return;
            const preset = e.detail.preset;
            const saved = localStorage.getItem(`pcf-camera-preset-${preset}`);
            if (saved) {
                const data = JSON.parse(saved);
                if (data.camUp) controlsRef.current.object.up.copy(data.camUp);
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
    }, [frameElements]);

    useEffect(() => {
        try {
            savedSessionRef.current = JSON.parse(sessionStorage.getItem('pcf-canvas-session') || 'null');
        } catch (e) {
            console.error('Failed to restore camera session', e);
        }

        return () => {
            if (controlsRef.current) {
                const data = {
                    camPos: controlsRef.current.object.position,
                    camTarget: controlsRef.current.target,
                    camUp: controlsRef.current.object.up,
                    dataTableCount: useStore.getState().dataTable.length,
                    showRowLabels: useStore.getState().showRowLabels,
                    showRefLabels: useStore.getState().showRefLabels,
                    showGapRadar: useStore.getState().showGapRadar
                };
                sessionStorage.setItem('pcf-canvas-session', JSON.stringify(data));
            }
        };
    }, []);

    useEffect(() => {
        if (!controlsRef.current || didInitViewRef.current || !dataTable.length) return;

        const pipes = getPipes();
        const immutables = useStore.getState().getImmutables();
        const allEls = [...pipes, ...immutables];
        const currentBounds = collectBounds(allEls);
        const saved = savedSessionRef.current;
        if (saved && saved.dataTableCount === dataTable.length && isSavedCameraSessionUsable(saved, currentBounds)) {
            if (saved.camPos) controlsRef.current.object.position.copy(saved.camPos);
            if (saved.camTarget) controlsRef.current.target.copy(saved.camTarget);
            if (saved.camUp && isFiniteVectorLike(saved.camUp)) {
                controlsRef.current.object.up.copy(saved.camUp);
            } else {
                controlsRef.current.object.up.set(0, 0, 1);
            }
            controlsRef.current.update();

            if (saved.showRowLabels !== undefined) useStore.getState().setShowRowLabels(saved.showRowLabels);
            if (saved.showRefLabels !== undefined) useStore.getState().setShowRefLabels(saved.showRefLabels);
            if (saved.showGapRadar !== undefined) useStore.getState().setShowGapRadar(saved.showGapRadar);
        } else {
            frameElements('ISO', allEls);
        }

        didInitViewRef.current = true;
    }, [collectBounds, dataTable.length, frameElements, getPipes, isFiniteVectorLike, isSavedCameraSessionUsable]);

    const canvasMode = useStore(state => state.canvasMode);
    const interactionMode = useStore(state => state.interactionMode);
    const appSettings = useStore(state => state.appSettings);
    const controlsEnabled = !['MARQUEE_SELECT', 'MARQUEE_ZOOM', 'MARQUEE_DELETE'].includes(canvasMode);

    const handlePointerDown = (e) => {
        // Disabled center on click by default
    };

    useEffect(() => {
        const handler = (e) => {
            // In R3F, click events natively return the intersected point.
            // To globally center orbit on any click on the 3D scene, use canvas-focus-point.
        };
    }, []);

    const mouseButtons = {
        LEFT: interactionMode === 'PAN' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: interactionMode === 'PAN' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN
    };

    const [ctrlPressed, setCtrlPressed] = useState(false);
    useEffect(() => {
        const down = (e) => {
            if (e.key === 'Control' || e.key === 'Meta') setCtrlPressed(true);
        };
        const up = (e) => {
            if (e.key === 'Control' || e.key === 'Meta') setCtrlPressed(false);
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
        };
    }, []);

    const currentMouseButtons = ctrlPressed ? { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null } : mouseButtons;

    return <OrbitControls
                ref={(c) => { controlsRef.current = c; if (externalRef) externalRef.current = c; }}
                enabled={controlsEnabled}
                makeDefault
                enableDamping
                dampingFactor={0.1}
                mouseButtons={currentMouseButtons}
            />;
};


export function CanvasTab() {
  const { state: appState, dispatch } = useAppContext();
  const orthoMode = useStore(state => state.orthoMode);
  const gridCenter = useMemo(() => {
      const rows = appState.stage2Data || [];
      if (!rows.length) return { x: 0, y: 0, z: 0 };
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      rows.forEach((r) => {
          [r.ep1, r.ep2, r.cp, r.bp, r.supportCoor].forEach((p) => {
              if (!p) return;
              minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z);
              maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); maxZ = Math.max(maxZ, p.z);
          });
      });
      if (minX === Infinity) return { x: 0, y: 0, z: 0 };
      return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2, floorZ: minZ };
  }, [appState.stage2Data]);

  const axesSize = useMemo(() => {
      const rows = appState.stage2Data || [];
      if (!rows.length) return 2000;
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      rows.forEach((r) => {
          [r.ep1, r.ep2, r.cp, r.bp, r.supportCoor].forEach((p) => {
              if (!p) return;
              minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z);
              maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); maxZ = Math.max(maxZ, p.z);
          });
      });
      if (minX === Infinity) return 2000;
      const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
      return size > 0 ? size * 1.5 : 2000;
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

  const [toolbarPos, setToolbarPos] = useState({ x: 16, y: 16 });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleToolbarPointerDown = (e) => {
    setIsDraggingToolbar(true);
    setDragOffset({
        x: e.clientX - toolbarPos.x,
        y: e.clientY - toolbarPos.y
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleToolbarPointerMove = (e) => {
    if (!isDraggingToolbar) return;
    setToolbarPos({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
    });
  };

  const handleToolbarPointerUp = (e) => {
    setIsDraggingToolbar(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const snapResolution = appState.config?.smartFixer?.gridSnapResolution ?? 100;

  // Hover tracking for tooltips
  const setHovered = useStore(state => state.setHovered);
  const hoverTimer = useRef(null);

  const handlePointerEnterMesh = useCallback((rowIndex) => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => setHovered(rowIndex), 150);
  }, [setHovered]);

  const handlePointerLeaveMesh = useCallback(() => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      setHovered(null);
  }, [setHovered]);

  // Global Key Handler
  useEffect(() => {
      const handleKeyDown = (e) => {
          // Ignore if this tab is not active
          if (appState.activeTab !== 'canvas') return;
          // Ignore if typing in an input
          if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;

          switch (e.key.toLowerCase()) {
              case '`':
                  const debugEnabled = !useStore.getState().appSettings.debugConsoleEnabled;
                  useStore.getState().updateAppSettings({ debugConsoleEnabled: debugEnabled });
                  if (debugEnabled) dbg.enable(); else dbg.disable();
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
              case 't': setCanvasMode(canvasMode === 'STRETCH' ? 'VIEW' : 'STRETCH'); break;
              case 'b': setCanvasMode(canvasMode === 'BREAK' ? 'VIEW' : 'BREAK'); break;
              case 'm': setCanvasMode(canvasMode === 'MEASURE' ? 'VIEW' : 'MEASURE'); break;
              case 'i': setCanvasMode(canvasMode === 'INSERT_SUPPORT' ? 'VIEW' : 'INSERT_SUPPORT'); break;
              case 'x': setDragAxisLock('X'); break;
              case 'y': setDragAxisLock('Y'); break;
              case 'z': setDragAxisLock('Z'); break;
              case 'o': useStore.getState().toggleOrthoMode(); break;
              case 'f':
                  if (useStore.getState().selectedElementId) {
                      const el = dataTable.find(r => r._rowIndex === useStore.getState().selectedElementId);
                      if (el && el.ep1) {
                          window.dispatchEvent(new CustomEvent('canvas-focus-point', { detail: { x: el.ep1.x, y: el.ep1.y, z: el.ep1.z, dist: 2000 } }));
                      }
                  }
                  break;
              case 'delete':
              case 'backspace':
                  if ((multiSelectedIds || []).length > 0) {
                      if (window.confirm(`Delete ${(multiSelectedIds || []).length} elements?`)) {
                          pushHistory('Delete Keyboard');
                          dispatch({ type: 'DELETE_ELEMENTS', payload: { rowIndices: multiSelectedIds } });
                          deleteElements(multiSelectedIds);
                          dispatch({ type: "ADD_LOG", payload: { stage: "INTERACTIVE", type: "Applied/Fix", message: `Deleted ${(multiSelectedIds || []).length} elements via keyboard.` } });
                      }
                  } else if (useStore.getState().selectedElementId) {
                      const selId = useStore.getState().selectedElementId;
                      if (window.confirm(`Delete Row ${selId}?`)) {
                          pushHistory('Delete Keyboard');
                          dispatch({ type: 'DELETE_ELEMENTS', payload: { rowIndices: [selId] } });
                          deleteElements([selId]);
                          useStore.getState().setSelected(null);
                          dispatch({ type: "ADD_LOG", payload: { stage: "INTERACTIVE", type: "Applied/Fix", message: `Deleted Row ${selId} via keyboard.` } });
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

      const handleKeyUp = (e) => {
          if (['x', 'y', 'z'].includes(e.key.toLowerCase())) {
              setDragAxisLock(null);
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);

      const handleZustandUndo = () => {
          // Sync Zustand's newly restored state back to AppContext
          const restoredTable = useStore.getState().dataTable;
          dispatch({ type: "APPLY_GAP_FIX", payload: { updatedTable: restoredTable } });
          dispatch({ type: "ADD_LOG", payload: { stage: "INTERACTIVE", type: "Info", message: "Undo completed." } });
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
    const cleanCoords = Object.fromEntries(
      Object.entries(coords).filter(([, v]) => v !== null)
    );
    dispatch({ type: "UPDATE_STAGE2_ROW_COORDS", payload: { rowIndex, coords: cleanCoords } });
    // Mirror to Zustand so 3D view updates immediately
    const updated = useStore.getState().dataTable.map(r =>
      r._rowIndex === rowIndex ? { ...r, ...cleanCoords } : r
    );
    useStore.getState().setDataTable(updated);
    dispatch({ type: "ADD_LOG", payload: { stage: "DRAG_EDIT", type: "Info", message: `Drag-edited row ${rowIndex} (snap=${snapResolution}mm).` } });
  }, [dispatch, snapResolution]);

  const validationIssues = (appState.stage2Data || []).filter(r =>
      typeof r.fixingAction === 'string' && (r.fixingAction.includes('ERROR') || r.fixingAction.includes('WARNING'))
  );

  const handleAutoCenter = () => {
      window.dispatchEvent(new CustomEvent('canvas-auto-center'));
  };

  const handleApprove = (e, prop) => {
      e.stopPropagation();

      const updatedTable = [...appState.stage2Data];
      const row = updatedTable.find(r => r._rowIndex === prop.elementA._rowIndex);
      if (row) {
          row._fixApproved = true;
          dispatch({ type: "SET_STAGE_2_DATA", payload: updatedTable });
          dispatch({ type: "ADD_LOG", payload: { stage: "FIXING", type: "Info", message: "Approved fix proposal for row " + row._rowIndex }});
          useStore.getState().setProposalStatus(row._rowIndex, true);
      }
  };

  const handleReject = (e, prop) => {
      e.stopPropagation();

      const updatedTable = [...appState.stage2Data];
      const row = updatedTable.find(r => r._rowIndex === prop.elementA._rowIndex);
      if (row) {
          row._fixApproved = false;
          dispatch({ type: "SET_STAGE_2_DATA", payload: updatedTable });
          dispatch({ type: "ADD_LOG", payload: { stage: "FIXING", type: "Info", message: "Rejected fix proposal for row " + row._rowIndex }});
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

      const allIssues = [
          ...(validationIssues || []).map(i => ({ type: 'validation', data: i })),
          ...(proposals || []).map(p => ({ type: 'proposal', data: p }))
      ];
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
               focusPt = { x: (prop.ptA.x + prop.ptB.x)/2, y: (prop.ptA.y + prop.ptB.y)/2, z: (prop.ptA.z + prop.ptB.z)/2 };
               focusDist = Math.max(prop.dist * 3, 2000);
          } else if (prop.elementA && prop.elementA.ep1) {
               focusPt = prop.elementA.ep1;
          }
      }
      if (focusPt) {
          window.dispatchEvent(new CustomEvent('canvas-focus-point', { detail: { ...focusPt, dist: focusDist } }));
      }
  };

  const executeFix6mm = () => {
      try {
          pushHistory('Fix 6mm Gaps');
          const { updatedTable, fixLog } = fix6mmGaps(dataTable);
          useStore.getState().setDataTable(updatedTable);
          dispatch({ type: 'APPLY_GAP_FIX', payload: { updatedTable } });
          fixLog.forEach(log => dispatch({ type: "ADD_LOG", payload: log }));
      } catch (err) {
          dbg.error('ENGINE_EXEC', 'Fix 6mm Gaps crashed', { error: err.message });
          dispatch({ type: 'ADD_LOG', payload: { type: 'Error', stage: 'ENGINE', message: `Fix 6mm failed: ${err.message}` } });
      }
  };

  const executeAutoPipelineRef = () => {
      try {
          pushHistory('Auto Pipeline Ref');
          const { updatedTable, fixLog } = autoAssignPipelineRefs(dataTable);
          useStore.getState().setDataTable(updatedTable);
          dispatch({ type: 'APPLY_GAP_FIX', payload: { updatedTable } }); // Reuses table replace action
          fixLog.forEach(log => dispatch({ type: "ADD_LOG", payload: log }));
      } catch (err) {
          dbg.error('ENGINE_EXEC', 'Auto Pipeline Ref crashed', { error: err.message });
          dispatch({ type: 'ADD_LOG', payload: { type: 'Error', stage: 'ENGINE', message: `Auto Pipeline Ref failed: ${err.message}` } });
      }
  };

  const executeFix25mm = () => {
      try {
          pushHistory('Fix 25mm Gaps');
          const { updatedTable, fixLog } = fix25mmGapsWithPipe(dataTable);
          useStore.getState().setDataTable(updatedTable);
          dispatch({ type: 'APPLY_GAP_FIX', payload: { updatedTable } });
          fixLog.forEach(log => dispatch({ type: "ADD_LOG", payload: log }));
      } catch (err) {
          dbg.error('ENGINE_EXEC', 'Fix 25mm Gaps crashed', { error: err.message });
          dispatch({ type: 'ADD_LOG', payload: { type: 'Error', stage: 'ENGINE', message: `Fix 25mm failed: ${err.message}` } });
      }
  };

  const executeOverlapSolver = () => {
      try {
          pushHistory('Overlap Solver');
          import('../../engine/OverlapSolver.js').then(({ resolveOverlaps }) => {
              const { updatedTable, fixLog } = resolveOverlaps(dataTable);
              useStore.getState().setDataTable(updatedTable);
              dispatch({ type: 'APPLY_GAP_FIX', payload: { updatedTable } });
              fixLog.forEach(log => dispatch({ type: "ADD_LOG", payload: log }));
          }).catch(err => {
              dbg.error('ENGINE_EXEC', 'Overlap Solver failed during execution', { error: err.message });
              dispatch({ type: 'ADD_LOG', payload: { type: 'Error', stage: 'ENGINE', message: `Overlap Solver failed: ${err.message}` } });
          });
      } catch (err) {
          dbg.error('ENGINE_EXEC', 'Overlap Solver crashed', { error: err.message });
          dispatch({ type: 'ADD_LOG', payload: { type: 'Error', stage: 'ENGINE', message: `Overlap Solver failed: ${err.message}` } });
      }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden bg-slate-950 rounded-lg border border-slate-800 shadow-inner relative mt-[-2rem]">

      {/* New UI Overlays */}
      <SceneHealthHUD />

      {/* Left Sidebar Stack */}
      <div className="absolute top-24 left-4 z-20 flex flex-col gap-4 items-start pointer-events-none h-[calc(100vh-10rem)] overflow-y-auto w-80 pr-2">
          <div className="pointer-events-auto flex flex-col gap-4 w-full">
              <LegendLayer />
              <SideInspector />
              <SupportPropertyPanel />
          </div>
      </div>

      {/* Right Sidebar Stack */}
      <div className="absolute top-24 right-4 z-20 flex flex-col gap-4 items-end pointer-events-none h-[calc(100vh-10rem)] overflow-y-auto w-80 pl-2">
          <div className="pointer-events-auto flex flex-col gap-4 w-full items-end">
              <GapSidebar />
          </div>
      </div>

      {/* Floating Overlays */}
      <ClippingPanelUI />

      <PipelinePropertyPanel />
      <LogDrawer />
      <HoverTooltip />
      <SettingsModal />
      <ContextMenu />
      <NavigationPanel />

      <DebugConsole />

      <div
        className="absolute z-40 pointer-events-auto shadow-lg"
        style={{ left: toolbarPos.x, top: toolbarPos.y }}
        onPointerMove={handleToolbarPointerMove}
        onPointerUp={handleToolbarPointerUp}
        onPointerDown={(e) => {
            // Only start dragging if clicking the top header bar of the ribbon
            if (e.target.closest('.cursor-move')) {
                handleToolbarPointerDown(e);
            }
        }}
      >
        <ToolbarRibbon
            onFix6mm={executeFix6mm}
            onFix25mm={executeFix25mm}
            onAutoRef={executeAutoPipelineRef}
            onOverlapSolver={executeOverlapSolver}
            onAutoCenter={handleAutoCenter}
            onToggleSideInspector={() => setShowSideInspector(!showSideInspector)}
            showSideInspector={showSideInspector}
            onPointerDown={handleToolbarPointerDown}
        />
      </div>

      {/* Mode Overlay */}
      <div
        className="absolute z-50 flex flex-col gap-2 items-center pointer-events-none bottom-8 left-1/2 -translate-x-1/2"
      >
        {canvasMode !== 'VIEW' && (
            <div className="flex flex-col gap-1 items-center pointer-events-auto">
                <div className="bg-slate-800/90 text-slate-200 text-xs px-3 py-1.5 rounded border border-slate-600 shadow-md flex items-center justify-center">
                    <span>MODE: <strong>{canvasMode.replace('_', ' ')}</strong></span>
                    <span className="ml-2 text-slate-400">Esc to cancel</span>
                </div>
                {(canvasMode === 'CONNECT' || canvasMode === 'STRETCH') && (
                    <div className="bg-slate-800/90 text-amber-400 text-[10px] px-3 py-1.5 rounded border border-amber-900/50 shadow-md max-w-md text-center">
                        <strong>Tip:</strong> Click first endpoint, then click second endpoint. Panning is allowed.
                    </div>
                )}
            </div>
        )}
      </div>


      <SingleIssuePanel
          proposals={proposals}
          validationIssues={validationIssues}
          currentIssueIndex={currentIssueIndex}
          setCurrentIssueIndex={setCurrentIssueIndex}
          onAutoCenter={triggerZoomToCurrent}
          onApprove={handleApprove}
          onReject={handleReject}
      />


      <Canvas>
        {orthoMode ? (
            <OrthographicCamera key="ortho" makeDefault position={[gridCenter.x + 2000, gridCenter.y - 2000, (gridCenter.z ?? 0) + 2000]} up={[0, 0, 1]} zoom={0.2} near={0.1} far={500000} />
        ) : (
            <PerspectiveCamera key="persp" makeDefault position={[gridCenter.x + 2000, gridCenter.y - 2000, (gridCenter.z ?? 0) + 2000]} up={[0, 0, 1]} fov={appSettings.cameraFov} near={appSettings.cameraNear || 1} far={appSettings.cameraFar || 500000} />
        )}
        <color attach="background" args={[appSettings.backgroundColor || '#020617']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[1000, 1000, 500]} intensity={1.5} />
        <directionalLight position={[-1000, -1000, -500]} intensity={0.5} />
        {appSettings.showGrid && <gridHelper args={[10000, 100]} position={[gridCenter.x, gridCenter.y, gridCenter.floorZ ?? gridCenter.z]} rotation={[Math.PI / 2, 0, 0]} />}
        {appSettings.showAxes && <axesHelper args={[axesSize]} />}

        {appState.stage2Data && appState.stage2Data.length > 0 && (
            <>
                <InstancedPipes />
                <ImmutableComponents />

                <EndpointSnapLayer />
                <GapRadarLayer />
                <GlobalSnapLayer />
                <MeasureTool />
                <BreakPipeLayer />
                <InsertSupportLayer />
                <EPLabelsLayer />
                <MarqueeLayer />
                <ClippingPlanesLayer />
            </>
        )}

        {(() => {
            const allIssues = [
                ...(validationIssues || []).map(i => ({ type: 'validation', data: i })),
                ...(proposals || []).map(p => ({ type: 'proposal', data: p }))
            ];
            const safeIndex = Math.max(0, Math.min(currentIssueIndex, allIssues.length - 1));
            const activeItem = allIssues[safeIndex];
            const activeProposal = activeItem?.type === 'proposal' ? activeItem.data : null;
            return <GhostOverlay activeProposal={activeProposal} />;
        })()}

        {(proposals || []).map((prop, idx) => {
            // Calculate global index to check if active
            const allIssues = [
                ...(validationIssues || []).map(i => ({ type: 'validation', data: i })),
                ...(proposals || []).map(p => ({ type: 'proposal', data: p }))
            ];
            const safeIndex = Math.max(0, Math.min(currentIssueIndex, allIssues.length - 1));
            const isActive = allIssues[safeIndex]?.type === 'proposal' && allIssues[safeIndex]?.data === prop;

            return isActive ? <ProposalOverlay key={`prop-${idx}`} proposal={prop} /> : null;
        })}

        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport axisColors={['#ef4444', '#10b981', '#3b82f6']} labelColor="white" />
        </GizmoHelper>



        {(() => {
            const allIssues = [
                ...(validationIssues || []).map(i => ({ type: 'validation', data: i })),
                ...(proposals || []).map(p => ({ type: 'proposal', data: p }))
            ];
            const safeIndex = Math.max(0, Math.min(currentIssueIndex, allIssues.length - 1));
            return <IssueMapPin activeIssue={allIssues[safeIndex]} />;
        })()}


        <ControlsAutoCenter externalRef={dragOrbitRef} />
      </Canvas>

    </div>
  );
}
