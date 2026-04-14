import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Grid, Text, Bounds } from '@react-three/drei';
import { useEditorStore } from '../store.js';
import * as THREE from 'three';
import { NodeMesh } from './Node.jsx';
import { StickMesh } from './Stick.jsx';

// ── Color palette ─────────────────────────────────────────────────────
const COLORS = {
    PIPE: '#1e90ff',
    FLANGE: '#ff4500',
    VALVE: '#32cd32',
    TEE: '#ffd700',
    ELBOW: '#8a2be2',
    SUPPORT: '#808080',
    BEND: '#8a2be2',
    REDUCER: '#ff69b4',
    'MESSAGE-SQUARE': '#f59e0b',
    UNKNOWN: '#d3d3d3',
};

// Coordinate Mapping: PCF (East/North/Up) → Three.js
const mapCoord = (p) => {
    if (!p) return new THREE.Vector3(0, 0, 0);
    return new THREE.Vector3(-(Number(p.y) || 0), (Number(p.z) || 0), -(Number(p.x) || 0));
};

// ── Compute scene bounds for centering/grid placement ───────────────
const computeBounds = (components = [], nodes = [], sticks = []) => {
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    const addPoint = (pt) => {
        if (!pt) return;
        const v = mapCoord(pt.position || pt);
        if (Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) {
            tmp.set(v, v);
            box.union(tmp);
        }
    };
    for (const c of components) {
        const pts = [];
        if (Array.isArray(c.points)) pts.push(...c.points);
        if (c.centrePoint) pts.push(c.centrePoint);
        if (c.branch1Point) pts.push(c.branch1Point);
        if (c.coOrds) pts.push(c.coOrds);
        pts.forEach(addPoint);
    }
    // Include explicit node/stick geometry if present (non-blocking)
    nodes.forEach(addPoint);
    sticks.forEach(s => {
        if (s?.start) addPoint(s.start);
        if (s?.end) addPoint(s.end);
    });
    if (box.isEmpty()) return { box, centre: new THREE.Vector3(), minY: 0, empty: true };
    return { box, centre: box.getCenter(new THREE.Vector3()), minY: box.min.y, empty: false };
};

// ── Attribute friendly labels ─────────────────────────────────────────
const ATTR_LABELS = {
    'COMPONENT-ATTRIBUTE1': 'CA 1',
    'COMPONENT-ATTRIBUTE2': 'CA 2',
    'COMPONENT-ATTRIBUTE3': 'CA 3',
    'COMPONENT-ATTRIBUTE4': 'CA 4',
    'COMPONENT-ATTRIBUTE5': 'CA 5',
    'COMPONENT-ATTRIBUTE6': 'CA 6',
    'COMPONENT-ATTRIBUTE7': 'CA 7',
    'COMPONENT-ATTRIBUTE8': 'CA 8',
    'COMPONENT-ATTRIBUTE9': 'CA 9',
    'COMPONENT-ATTRIBUTE10': 'CA 10',
    'PIPELINE-REFERENCE': 'Pipeline',
    'PIPING-CLASS': 'Piping Class',
    'SKEY': 'SKEY',
    'WEIGHT': 'Weight',
    'HEAT-TRACING-SPEC': 'Heat Trace',
    'INSULATION-SPEC': 'Insulation',
    'PAINTED': 'Painted',
    'FABRICATION': 'Fabrication',
    'DESCRIPTION': 'Description',
};

// ── Parse RefNo:= from ANY attribute value ────────────────────────
const _scanAttrsForRefNo = (attrs) => {
    if (!attrs) return null;
    for (const v of Object.values(attrs)) {
        const m = String(v || '').match(/RefNo:=\s*([^\s,]+)/i);
        if (m) return m[1];
    }
    return attrs['REFNO'] || attrs['COMPONENT-ATTRIBUTE97'] || attrs['PIPELINE-REFERENCE'] || null;
};

// Scan backwards from idx, collecting MESSAGE-SQUARE attrs until a real component is hit.
// Nearest MESSAGE-SQUARE wins for duplicate keys.
const extractRefNo = (attrs, components = [], idx = -1) => {
    // 1. Own attrs
    const own = _scanAttrsForRefNo(attrs);
    if (own) return own;

    // 2. Backward scan through MESSAGE-SQUARE siblings
    const merged = {};
    for (let back = 1; back <= 20; back++) {
        const adjIdx = idx - back;
        if (adjIdx < 0) break;
        const adj = components[adjIdx];
        if (!adj) break;
        if ((adj.type || '').toUpperCase() !== 'MESSAGE-SQUARE') break;
        for (const [k, v] of Object.entries(adj.attributes || {})) {
            if (!(k in merged)) merged[k] = v;
        }
    }
    const fromMsg = _scanAttrsForRefNo(merged);
    if (fromMsg) return fromMsg;

    // 3. Forward scan (MSG-SQ immediately after the component)
    for (let fwd = 1; fwd <= 3; fwd++) {
        const adjIdx = idx + fwd;
        if (adjIdx >= components.length) break;
        const adj = components[adjIdx];
        if (!adj || (adj.type || '').toUpperCase() !== 'MESSAGE-SQUARE') break;
        const found = _scanAttrsForRefNo(adj.attributes);
        if (found) return found;
    }
    return null;
};

// ── CSV Seq No lookup — MSG-SQ first, then normalizedRows fallback ─
// Only look at the IMMEDIATELY PRECEDING MESSAGE-SQUARE (idx-1)
// to avoid picking up SeqNo from a neighbouring component's block.
const _extractSeqNoFromMsgSq = (components, idx) => {
    const adj = components[idx - 1];
    if (!adj || (adj.type || '').toUpperCase() !== 'MESSAGE-SQUARE') return null;
    for (const v of Object.values(adj.attributes || {})) {
        const m = String(v || '').match(/SeqNo:=?\s*([^\s,]+)/i);
        if (m) return m[1];
    }
    return null;
};

const _findCsvSeqNo = (refNo) => {
    if (!refNo) return null;
    // Strip synthetic suffixes (_Injected, _pipe, _Sp, _Seg) and try base refNo too
    const SYNTH_RE = /(_Injected|_pipe|_Sp\d*|_Seg\d*|_gap\d*)$/i;
    const stripped = String(refNo).trim().replace(SYNTH_RE, '');
    const candidates = [String(refNo).trim(), stripped].filter(Boolean);
    try {
        const rows = window.__PCF_NORMALIZED_ROWS__ || [];
        for (const needle of candidates) {
            const lc = needle.toLowerCase();
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rRef = String(row['RefNo'] || row['Ref No'] || row['Ref'] || row['Ref No.'] || '').trim().toLowerCase();
                if (rRef === lc) {
                    return row['Seq No.'] || row['Sequence'] || row['Seq'] || row['SeqNo'] || `Row ${i + 1}`;
                }
            }
        }
    } catch (_) { }
    return null;
};

// ── Single component mesh ─────────────────────────────────────────────
const ComponentMesh = ({ data, defaultBore = 50 }) => {
    const isSelected = useEditorStore(state => state.selectedId === data.id);
    const select = useEditorStore(state => state.select);
    const supportRatio = useEditorStore(state => state.supportRatio) || 0.5;

    // Resolve points
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
        if (Array.isArray(up)) { p1Raw = up[0]; p2Raw = up[1]; }
        else { p1Raw = up['1'] || up.EP1; p2Raw = up['2'] || up.EP2; }
    }
    if (!cpRaw && data.centrePoint) cpRaw = data.centrePoint;
    // SUPPORT uses CO-ORDS (parsed to data.coOrds), not END-POINTs — use it as position source
    if (!p1Raw && data.coOrds) p1Raw = data.coOrds;

    const type = (data.type || 'UNKNOWN').toUpperCase();

    // Fix: Supports often have bore=0. Inherit global pipe size to render it *outside* the pipe.
    let bore = Number(data.bore || data.userData?.bore || 0);
    if (bore === 0 && (type === 'SUPPORT' || type === 'ANCI')) bore = defaultBore;
    if (bore === 0) bore = 50;

    const radius = Math.max(bore / 2, 10);
    const color = isSelected ? '#ffff00' : (COLORS[type] || COLORS.UNKNOWN);

    const handleClick = useCallback((e) => {
        e.stopPropagation();
        select(data.id);
    }, [data.id, select]);

    const geometryNode = useMemo(() => {
        try {
            if (!p1Raw) return null;
            const v1 = mapCoord(p1Raw);
            const v2 = p2Raw ? mapCoord(p2Raw) : null;
            const vc = cpRaw ? mapCoord(cpRaw) : null;
            if (isNaN(v1.x) || isNaN(v1.y) || isNaN(v1.z)) return null;

            if (type === 'PIPE' || type === 'TUBE') {
                if (!v2) return <mesh position={v1}><sphereGeometry args={[radius]} /><meshStandardMaterial color={color} /></mesh>;
                return <mesh><tubeGeometry args={[new THREE.LineCurve3(v1, v2), 1, radius, 8, false]} /><meshStandardMaterial color={color} emissive={isSelected ? '#333300' : '#000000'} /></mesh>;
            }

            if (type === 'ELBOW' || type === 'BEND') {
                if (v1 && v2 && vc) {
                    // Curved bend using QuadraticBezierCurve3 through centre point
                    const curve = new THREE.QuadraticBezierCurve3(v1, vc, v2);
                    return (
                        <mesh>
                            <tubeGeometry args={[curve, 20, radius, 12, false]} />
                            <meshStandardMaterial color={color} />
                        </mesh>
                    );
                }
                if (v2) {
                    return <mesh><tubeGeometry args={[new THREE.LineCurve3(v1, v2), 1, radius, 12, false]} /><meshStandardMaterial color={color} /></mesh>;
                }
                return v1 ? <mesh position={v1}><sphereGeometry args={[radius * 1.5]} /><meshStandardMaterial color={color} /></mesh> : null;
            }

            if (type === 'TEE') {
                const vBranch = data.branch1Point ? mapCoord(data.branch1Point) : null;
                const centre = vc || (v2 ? v1.clone().add(v2).multiplyScalar(0.5) : v1);
                return (
                    <group>
                        {v2 && <mesh><tubeGeometry args={[new THREE.LineCurve3(v1, v2), 1, radius, 8, false]} /><meshStandardMaterial color={color} /></mesh>}
                        {vBranch && <mesh><tubeGeometry args={[new THREE.LineCurve3(centre, vBranch), 1, radius * 0.8, 8, false]} /><meshStandardMaterial color={color} /></mesh>}
                        <mesh position={centre}><sphereGeometry args={[radius * 1.2]} /><meshStandardMaterial color={color} /></mesh>
                    </group>
                );
            }

            if (type === 'FLANGE') {
                const r = radius * 2;
                if (v2) {
                    const zeroLen = v1.distanceTo(v2) < 1;
                    if (zeroLen) {
                        return (
                            <group position={v1}>
                                <mesh rotation={[Math.PI / 2, 0, 0]}>
                                    <cylinderGeometry args={[r, r, radius * 1.2, 20]} />
                                    <meshStandardMaterial color={color} />
                                </mesh>
                                <mesh rotation={[Math.PI / 2, 0, 0]}>
                                    <torusGeometry args={[r * 0.75, radius * 0.15, 8, 16]} />
                                    <meshStandardMaterial color={color} opacity={0.7} transparent />
                                </mesh>
                            </group>
                        );
                    }
                    const dir = v2.clone().sub(v1).normalize();
                    // Guard zero-length direction
                    if (dir.length() < 0.5) {
                        return <group position={v1}><mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[r, r, radius * 1.2, 20]} /><meshStandardMaterial color={color} /></mesh></group>;
                    }
                    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                    const euler = new THREE.Euler().setFromQuaternion(quat);
                    return (
                        <group>
                            <mesh><tubeGeometry args={[new THREE.LineCurve3(v1, v2), 1, radius * 1.2, 16, false]} /><meshStandardMaterial color={color} /></mesh>
                            <mesh position={v1} rotation={euler}><cylinderGeometry args={[r, r, radius * 0.5, 16]} /><meshStandardMaterial color={color} /></mesh>
                            <mesh position={v2} rotation={euler}><cylinderGeometry args={[r, r, radius * 0.5, 16]} /><meshStandardMaterial color={color} /></mesh>
                        </group>
                    );
                }
                return <group position={v1}><mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[r, r, radius * 1.2, 20]} /><meshStandardMaterial color={color} /></mesh></group>;
            }

            if (type === 'VALVE') {
                const r = radius * 1.5;
                if (v1 && v2) {
                    const dist = v1.distanceTo(v2);
                    // Guard: only render tapered body if there's a real length
                    if (dist < 1) {
                        return <mesh position={v1}><sphereGeometry args={[r]} /><meshStandardMaterial color={color} /></mesh>;
                    }
                    const centre = v1.clone().add(v2).multiplyScalar(0.5);
                    const dir = v2.clone().sub(v1).normalize();
                    const bodyLen = dist * 0.5;
                    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                    const euler = new THREE.Euler().setFromQuaternion(quat);
                    return (
                        <group>
                            <mesh position={v1} rotation={euler}><cylinderGeometry args={[r * 1.3, r * 1.3, radius * 0.5, 16]} /><meshStandardMaterial color={color} /></mesh>
                            <mesh position={v2} rotation={euler}><cylinderGeometry args={[r * 1.3, r * 1.3, radius * 0.5, 16]} /><meshStandardMaterial color={color} /></mesh>
                            <mesh position={centre} rotation={euler}><cylinderGeometry args={[r * 0.7, r * 1.6, bodyLen, 8]} /><meshStandardMaterial color={color} /></mesh>
                            <mesh position={centre}><cylinderGeometry args={[radius * 0.15, radius * 0.15, r * 3, 6]} /><meshStandardMaterial color={color} /></mesh>
                            <mesh position={[centre.x, centre.y + r * 3, centre.z]}><torusGeometry args={[radius * 0.8, radius * 0.12, 8, 16]} /><meshStandardMaterial color={color} /></mesh>
                        </group>
                    );
                }
                return <mesh position={v1}><sphereGeometry args={[r]} /><meshStandardMaterial color={color} /></mesh>;
            }

            if (type === 'SUPPORT') {
                const cp = vc || v1;
                if (!cp) return null;
                const sName = (data.attributes?.['<SUPPORT_NAME>'] || '').toUpperCase();

                // Scale the visual dimensions using the user ratio (pipe radius itself remains untouched for correct bounding)
                const sR = radius * supportRatio;
                const stemH = sR * 5;
                const plateW = sR * 4;

                // Support needs to drop below the pipe. 
                // The base pipe Radius pushes it outside the tube, and stemH/2 centers the arrow there.
                // Depending on the Y axis of coordinates mapCoord (which maps PCF Z to Three Y), 
                // we drop it downward subtracting `radius + stemH/2` from its local Y.
                // Assuming pipe runs horizontal, this positions it directly beneath.
                const offsetDown = -(radius + stemH / 2);

                // GUIDE / VG100 — U-channel bracket
                if (sName.includes('GUIDE') || sName.includes('VG')) {
                    return (
                        <group position={cp}>
                            <group position={[0, offsetDown, 0]}>
                                <mesh position={[-sR * 1.5, 0, 0]}><boxGeometry args={[sR * 0.4, stemH, sR * 0.4]} /><meshStandardMaterial color={'#22c55e'} /></mesh>
                                <mesh position={[sR * 1.5, 0, 0]}><boxGeometry args={[sR * 0.4, stemH, sR * 0.4]} /><meshStandardMaterial color={'#22c55e'} /></mesh>
                                <mesh position={[0, -stemH / 2, 0]}><boxGeometry args={[plateW, sR * 0.4, sR * 0.4]} /><meshStandardMaterial color={'#22c55e'} /></mesh>
                                <mesh position={[0, -stemH / 2 - sR * 0.3, 0]}><boxGeometry args={[plateW * 1.3, sR * 0.3, plateW * 1.3]} /><meshStandardMaterial color={'#16a34a'} /></mesh>
                            </group>
                        </group>
                    );
                }

                // ANCHOR / FIX — Solid cube with crossed bars
                if (sName.includes('FIX') || sName.includes('ANC') || sName.includes('DATUM')) {
                    const ancOffset = -(radius + plateW / 2);
                    return (
                        <group position={cp}>
                            <group position={[0, ancOffset, 0]}>
                                <mesh><boxGeometry args={[plateW, plateW, plateW]} /><meshStandardMaterial color={'#22c55e'} opacity={0.6} transparent /></mesh>
                                <mesh rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[sR * 0.3, plateW * 1.6, sR * 0.3]} /><meshStandardMaterial color={'#15803d'} /></mesh>
                                <mesh rotation={[0, 0, -Math.PI / 4]}><boxGeometry args={[sR * 0.3, plateW * 1.6, sR * 0.3]} /><meshStandardMaterial color={'#15803d'} /></mesh>
                            </group>
                        </group>
                    );
                }

                // REST / CA150 / Default — Upward arrow + base plate
                return (
                    <group position={cp}>
                        <group position={[0, offsetDown, 0]}>
                            <mesh><cylinderGeometry args={[sR * 0.3, sR * 0.3, stemH, 8]} /><meshStandardMaterial color={'#22c55e'} /></mesh>
                            <mesh position={[0, stemH / 2 + sR, 0]}><coneGeometry args={[sR * 1.5, sR * 3, 8]} /><meshStandardMaterial color={'#22c55e'} /></mesh>
                            <mesh position={[0, -stemH / 2 - sR * 0.2, 0]}><boxGeometry args={[plateW * 1.3, sR * 0.3, plateW * 1.3]} /><meshStandardMaterial color={'#16a34a'} /></mesh>
                        </group>
                    </group>
                );
            }

            // Generic fallback — sphere at p1
            return <mesh position={v1}><sphereGeometry args={[radius * 1.5]} /><meshStandardMaterial color={color} /></mesh>;
        } catch (err) {
            console.warn('[Viewer3D] geometry error for', type, err.message);
            return null;
        }
    }, [p1Raw, p2Raw, cpRaw, type, color, isSelected, radius, data.branch1Point, data.attributes, supportRatio]);

    if (!geometryNode) return null;

    return (
        <group onClick={handleClick}>
            {geometryNode}
            {isSelected && p1Raw && (
                <Text
                    position={mapCoord(p1Raw).add(new THREE.Vector3(0, radius * 2.5, 0))}
                    fontSize={radius * 0.9}
                    color="white"
                    anchorX="center"
                    anchorY="bottom"
                >
                    {data.userData?.refNo || type}
                </Text>
            )}
        </group>
    );
};

// ── Right-side collapsible Component Info Panel ───────────────────────
export const ComponentInfoPanel = ({ onCollapseChange } = {}) => {
    const [collapsed, setCollapsed] = useState(false);
    const components = useEditorStore(state => state.components);
    const selectedId = useEditorStore(state => state.selectedId);
    const deselect = useEditorStore(state => state.deselect);

    const toggleCollapse = () => {
        const next = !collapsed;
        setCollapsed(next);
        if (onCollapseChange) onCollapseChange(next);
    };

    // Listen for table-row click events (fired by table-log.js vanilla JS)
    const select = useEditorStore(state => state.select);
    useEffect(() => {
        const handler = (e) => {
            const { id } = e.detail || {};
            if (id) { select(id); setCollapsed(false); }
        };
        document.addEventListener('pcf-table-select', handler);
        return () => document.removeEventListener('pcf-table-select', handler);
    }, [select]);

    // Find selected component
    const compIdx = components.findIndex(c => c.id === selectedId);
    const comp = compIdx >= 0 ? components[compIdx] : null;
    const hasData = !!comp;

    // Ref No — CA97 direct first, then MSG-SQ scan fallback
    const directRefNo = comp?.attributes?.['COMPONENT-ATTRIBUTE97'] || null;
    const directSeqNo = comp?.attributes?.['COMPONENT-ATTRIBUTE98'] || null;
    const refNoVal = directRefNo || (comp ? extractRefNo(comp.attributes, components, compIdx) : null);
    const csvSeqNo = directSeqNo || (comp
        ? (_extractSeqNoFromMsgSq(components, compIdx) || _findCsvSeqNo(refNoVal) || null)
        : null);

    // Next/Prev component (non-MSG-SQ)
    const nextComp = (() => {
        for (let i = compIdx + 1; i < components.length; i++) {
            if ((components[i]?.type || '').toUpperCase() !== 'MESSAGE-SQUARE') return components[i];
        }
        return null;
    })();

    const type = comp ? (comp.type || 'UNKNOWN').toUpperCase() : null;
    const attrs = comp?.attributes || {};
    const isMsgSq = type === 'MESSAGE-SQUARE';
    const accentColor = type ? (COLORS[type] || '#94a3b8') : '#3a4255';

    // Build attribute rows — suppress CA97/CA98 (already shown as Ref No. and CSV Seq No.)
    const HIDDEN_ATTRS = new Set(['COMPONENT-ATTRIBUTE97', 'COMPONENT-ATTRIBUTE98']);
    const knownKeys = Object.keys(ATTR_LABELS);
    const extraKeys = Object.keys(attrs).filter(k => !knownKeys.includes(k) && !HIDDEN_ATTRS.has(k));
    const allKeys = [
        ...knownKeys.filter(k => k in attrs && attrs[k] !== '' && !HIDDEN_ATTRS.has(k)),
        ...extraKeys.filter(k => attrs[k] !== ''),
    ];

    const panelW = 280;

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            height: '100%',
            width: collapsed ? 32 : panelW,
            background: 'rgba(14, 18, 30, 0.92)',
            borderLeft: `2px solid ${accentColor}44`,
            display: 'flex',
            flexDirection: 'column',
            transition: 'width 0.22s ease',
            overflow: 'hidden',
            zIndex: 50,
            backdropFilter: 'blur(6px)',
        }}>
            {/* Collapse toggle strip */}
            <div
                onClick={toggleCollapse}
                style={{
                    width: 32,
                    height: '100%',
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 10,
                    background: 'transparent',
                    borderRight: collapsed ? 'none' : `1px solid #3a4255`,
                }}
                title={collapsed ? 'Expand info panel' : 'Collapse info panel'}
            >
                <span style={{ fontSize: 14, color: '#64748b', userSelect: 'none', writingMode: 'vertical-rl', transform: collapsed ? 'rotate(180deg)' : 'none' }}>
                    {collapsed ? '◀' : '▶'}
                </span>
            </div>

            {/* Panel content */}
            {!collapsed && (
                <div style={{
                    marginLeft: 32,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    padding: '0.6rem 0.75rem 0.75rem 0.6rem',
                    fontFamily: '"JetBrains Mono", "Courier New", monospace',
                    fontSize: '0.82rem',
                    color: '#e8eaf0',
                }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', gap: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            Component Info
                        </div>
                        {hasData && (
                            <button
                                onClick={deselect}
                                title="Deselect"
                                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
                            >✕</button>
                        )}
                    </div>

                    {/* No selection state */}
                    {!hasData && (
                        <div style={{ color: '#475569', fontStyle: 'italic', marginTop: '1rem', textAlign: 'center', lineHeight: 1.7 }}>
                            Click a component<br />to see its info
                        </div>
                    )}

                    {/* Component data */}
                    {hasData && (
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {/* Type badge */}
                            <div style={{
                                background: `${accentColor}22`,
                                border: `1px solid ${accentColor}66`,
                                borderLeft: `4px solid ${accentColor}`,
                                borderRadius: 4,
                                padding: '0.35rem 0.5rem',
                                fontWeight: 700,
                                fontSize: '0.84rem',
                                color: accentColor,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                            }}>
                                <span>{isMsgSq ? '📋' : '⬡'}</span>
                                <span>{type}</span>
                            </div>

                            {/* ID + Data# + Ref No + CSV Seq No + Bore + Length */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                <Row label="Data #" value={compIdx >= 0 ? String(compIdx + 1) : '—'} code />
                                <Row label="Ref No." value={refNoVal} />
                                <Row label="CSV Seq No." value={csvSeqNo} highlight />
                                {comp.bore > 0 && <Row label="Bore" value={`${comp.bore} mm`} code />}
                                {(() => {
                                    const pts = comp.points;
                                    const cp = comp.centrePoint;
                                    const ep1 = pts?.[0];
                                    const ep2 = pts?.[1] || cp;
                                    if (!ep1 || !ep2) return null;
                                    const dx = Number(ep2.x) - Number(ep1.x);
                                    const dy = Number(ep2.y) - Number(ep1.y);
                                    const dz = Number(ep2.z) - Number(ep1.z);
                                    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
                                    if (len < 0.01) return null;
                                    return <Row label="Length" value={`${len.toFixed(1)} mm`} code />;
                                })()}
                                {nextComp && (
                                    <div style={{ marginTop: '0.2rem', paddingTop: '0.3rem', borderTop: '1px solid #252a3a' }}>
                                        <Row label="Next →" value={`${(nextComp.type || '').toUpperCase()} ${extractRefNo(nextComp.attributes, components, components.indexOf(nextComp)) || ''}`} muted />
                                    </div>
                                )}
                            </div>

                            {/* Divider */}
                            {allKeys.length > 0 && (
                                <div style={{ borderTop: '1px solid #252a3a', margin: '0.1rem 0' }} />
                            )}

                            {/* Attributes */}
                            {allKeys.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    {allKeys.map(k => (
                                        <Row
                                            key={k}
                                            label={ATTR_LABELS[k] || k}
                                            value={attrs[k]}
                                            highlight={isMsgSq}
                                        />
                                    ))}
                                </div>
                            )}

                            {allKeys.length === 0 && (
                                <div style={{ color: '#475569', fontStyle: 'italic', fontSize: '0.67rem' }}>No attributes</div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// Tiny row helper
const Row = ({ label, value, muted, code, highlight }) => (
    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'flex-start', lineHeight: 1.5 }}>
        <span style={{ color: '#64748b', minWidth: 68, flexShrink: 0, fontSize: '0.79rem' }}>{label}</span>
        <span style={{
            color: muted ? '#475569' : highlight ? '#fbbf24' : code ? '#a8d8a8' : '#e8eaf0',
            fontWeight: highlight ? 600 : 400,
            wordBreak: 'break-all',
            flex: 1,
            fontSize: '0.8rem',
        }}>{value || '—'}</span>
    </div>
);

// ── Main Viewer3D scene (Three.js / R3F Canvas content) ───────────────
export const Viewer3D = () => {
    const components = useEditorStore(state => state.components);
    const nodes = useEditorStore(state => state.nodes);
    const sticks = useEditorStore(state => state.sticks);
    const deselect = useEditorStore(state => state.deselect);
    const { centre, minY, empty } = useMemo(() => computeBounds(components, nodes, sticks), [components, nodes, sticks]);
    const offset = useMemo(() => new THREE.Vector3(-centre.x, -centre.y, -centre.z), [centre]);
    const gridY = useMemo(() => empty ? 0 : (minY - centre.y - 50), [empty, minY, centre]);
    const firstSnapRef = useRef(false);
    const snapTokenRef = useRef(0);

    const maxGlobalBore = useMemo(() => {
        let max = 50;
        components.forEach(c => {
            const b = Number(c.bore || c.userData?.bore || 0);
            if (b > max) max = b;
        });
        return max;
    }, [components]);

    useEffect(() => {
        if (!components || components.length === 0) return;
        const token = Date.now();
        snapTokenRef.current = token;
        // Defer two frames to ensure meshes are mounted
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (snapTokenRef.current !== token) return;
                if (window.__pcfCameraSnap) window.__pcfCameraSnap([1, 1, 1], [0, 1, 0]);
                if (window.__pcfCameraCenter) window.__pcfCameraCenter();
                firstSnapRef.current = true;
            });
        });
        return () => { if (snapTokenRef.current === token) snapTokenRef.current = 0; };
    }, [components]);

    const renderContent = () => (
        <group position={offset.toArray()}>
            {components.map(c => <ComponentMesh key={c.id || Math.random()} data={c} defaultBore={maxGlobalBore} />)}
        </group>
    );

    return (
        <>
            <ambientLight intensity={0.8} />
            <pointLight position={[5000, 5000, 5000]} intensity={1} />
            <directionalLight position={[-5000, 5000, -2000]} intensity={1} />
            <Grid infiniteGrid sectionColor="#555" cellColor="#333" fadeDistance={50000} position={[0, gridY, 0]} />
            {/* Click on empty space to deselect */}
            <mesh visible={false} onClick={(e) => { e.stopPropagation(); deselect(); }}>
                <sphereGeometry args={[999999]} />
                <meshBasicMaterial />
            </mesh>
            <Bounds fit clip margin={1.2}>
                {renderContent()}
            </Bounds>
        </>
    );
};
