import { globalLogger } from '../utils/diagnostic-logger.js';

/**
 * topology-service.js — Intelligent Routing & Gap Calculation
 * Implements the "Hybrid 2-Stage System" for P2/EP2 Connectivity.
 */

// --- Helpers ---

const getStartPoint = (group) => {
    if (!group) return null;
    if (group.pts) {
        const p1 = group.pts['1'];
        if (p1 && p1.E !== undefined) return p1;
        const p0 = group.pts['0'];
        if (p0 && p0.E !== undefined) return p0;
        const anyPt = Object.values(group.pts).find(p => p && p.E !== undefined);
        if (anyPt) return anyPt;
    }
    // Fallback to rows
    if (group.rows && group.rows.length > 0) {
        const r = group.rows.find(row => String(row.Point) === '1') || group.rows[0];
        const e = parseFloat(r.East) !== undefined ? parseFloat(r.East) : parseFloat(r.StartX);
        const n = parseFloat(r.North) !== undefined ? parseFloat(r.North) : parseFloat(r.StartY);
        const u = parseFloat(r.Up) !== undefined ? parseFloat(r.Up) : parseFloat(r.StartZ);
        if (!isNaN(e)) return { E: e, N: n, U: u };
    }
    return null;
};

const getVector = (p1, p2) => {
    if (!p1 || !p2) return { E: 0, N: 0, U: 0 };
    return { E: p2.E - p1.E, N: p2.N - p1.N, U: p2.U - p1.U };
};

const normalizeVec = (v) => {
    const len = Math.sqrt(v.E * v.E + v.N * v.N + v.U * v.U);
    if (len === 0) return { E: 0, N: 0, U: 0 };
    return { E: v.E / len, N: v.N / len, U: v.U / len };
};

const calcAxisAndLengthFromPts = (group) => {
    let pts = group.pts || {};
    // ... (Existing fallback logic to ensure pts exist) ...
    if (Object.keys(pts).length === 0 && group.rows && group.rows.length > 0) {
        group.rows.forEach(r => {
            const e = parseFloat(r.East) || parseFloat(r.StartX);
            const n = parseFloat(r.North) || parseFloat(r.StartY);
            const u = parseFloat(r.Up) || parseFloat(r.StartZ);
            if (!isNaN(e)) {
                const ptNum = String(r.Point) || '1';
                pts[ptNum] = { E: e, N: n, U: u };
            }
        });
        if (group.rows.length > 0) {
            const sorted = [...group.rows].sort((a, b) => (parseFloat(a.Sequence) || 0) - (parseFloat(b.Sequence) || 0));
            const minRow = sorted[0];
            const maxRow = sorted[sorted.length - 1];
            const sE = parseFloat(minRow.East || minRow.StartX || 0), sN = parseFloat(minRow.North || minRow.StartY || 0), sU = parseFloat(minRow.Up || minRow.StartZ || 0);
            const eE = parseFloat(maxRow.EndX) !== undefined ? parseFloat(maxRow.EndX) : parseFloat(maxRow.East || maxRow.StartX || 0);
            const eN = parseFloat(maxRow.EndY) !== undefined ? parseFloat(maxRow.EndY) : parseFloat(maxRow.North || maxRow.StartY || 0);
            const eU = parseFloat(maxRow.EndZ) !== undefined ? parseFloat(maxRow.EndZ) : parseFloat(maxRow.Up || maxRow.StartZ || 0);

            if (!pts['1'] && pts['2']) pts['1'] = { E: eE, N: eN, U: eU };
            else if (pts['1'] && !pts['2']) pts['2'] = { E: eE, N: eN, U: eU };
            else if (!pts['1'] && !pts['2']) { pts['1'] = { E: sE, N: sN, U: sU }; pts['2'] = { E: eE, N: eN, U: eU }; }
            group.pts = pts;
        }
    }

    let axis1 = '', len1 = 0, axis2 = '', len2 = 0, axis3 = '', len3 = 0;
    const p1 = pts['1'], p2 = pts['2'];

    // Strict Component Mapping (X/Y/Z)
    if (p1 && p2) {
        const dX = Math.abs(p2.E - p1.E);
        const dY = Math.abs(p2.N - p1.N);
        const dZ = Math.abs(p2.U - p1.U);

        if (dX > 0.1) { axis1 = (p2.E > p1.E) ? 'EAST' : 'WEST'; len1 = dX; }
        if (dY > 0.1) { axis2 = (p2.N > p1.N) ? 'NORTH' : 'SOUTH'; len2 = dY; }
        if (dZ > 0.1) { axis3 = (p2.U > p1.U) ? 'UP' : 'DOWN'; len3 = dZ; }
    }

    // Absolute Bounding Box fallback
    let groupL1 = 0, groupL2 = 0, groupL3 = 0;
    if (group.rows && group.rows.length > 0) {
        const sorted = [...group.rows].sort((a, b) => (parseFloat(a.Sequence) || 0) - (parseFloat(b.Sequence) || 0));
        const s = sorted[0], e = sorted[sorted.length - 1];
        const sE = parseFloat(s.East || s.StartX || 0), sN = parseFloat(s.North || s.StartY || 0), sU = parseFloat(s.Up || s.StartZ || 0);
        const eE = parseFloat(e.EndX) !== undefined ? parseFloat(e.EndX) : parseFloat(e.East || e.StartX || 0);
        const eN = parseFloat(e.EndY) !== undefined ? parseFloat(e.EndY) : parseFloat(e.North || e.StartY || 0);
        const eU = parseFloat(e.EndZ) !== undefined ? parseFloat(e.EndZ) : parseFloat(e.Up || e.StartZ || 0);

        groupL1 = Math.round(Math.abs(eE - sE) * 10) / 10;
        groupL2 = Math.round(Math.abs(eN - sN) * 10) / 10;
        groupL3 = Math.round(Math.abs(eU - sU) * 10) / 10;

        if (!axis1) axis1 = groupL1 > 0.1 ? (eE > sE ? 'EAST' : 'WEST') : '';
        if (!axis2) axis2 = groupL2 > 0.1 ? (eN > sN ? 'NORTH' : 'SOUTH') : '';
        if (!axis3) axis3 = groupL3 > 0.1 ? (eU > sU ? 'UP' : 'DOWN') : '';
        if (!len1) len1 = groupL1;
        if (!len2) len2 = groupL2;
        if (!len3) len3 = groupL3;
    } else if (p1 && p2) {
        groupL1 = Math.round(Math.abs(p2.E - p1.E) * 10) / 10;
        groupL2 = Math.round(Math.abs(p2.N - p1.N) * 10) / 10;
        groupL3 = Math.round(Math.abs(p2.U - p1.U) * 10) / 10;
    }

    return { axis1, len1, axis2, len2, axis3, len3, groupL1, groupL2, groupL3, pts };
};

const isTeeOlet = (g) => {
    const t = (g.pcfType || "").toUpperCase();
    return t.includes("TEE") || t.includes("OLET");
};

// --- Hybrid Logic Implementation ---

/**
 * findNeighborHybridPass
 * Implements the Nested 2-Stage System (Hybrid) for connectivity.
 * Returns best match { ref, gap } or null.
 */
const findNeighborHybridPass = (sourceGroup, groupsMap, config, lineNo, sourceBore, directionMode) => {
    const bore = sourceBore || 0;
    const minDist = (bore / 2) + bore;
    const maxDist = (bore / 2) + (bore * 2);
    const tolerance = 25.0; // Hardcoded tolerance limit for "Tick" check logic, but search uses Cone.

    let sourcePt = null;
    let dirVec = null;
    let mainAxisVec = null;
    let branchAxisVec = null; // For Tee/Olet Stage 2

    // Points
    const p1 = sourceGroup.pts ? sourceGroup.pts['1'] : null;
    const p2 = sourceGroup.pts ? sourceGroup.pts['2'] : null;
    const cp = sourceGroup.pts ? sourceGroup.pts['0'] : null;
    const bp = sourceGroup.pts ? sourceGroup.pts['3'] : null;

    if (directionMode === 'NEXT') {
        // P2 + Vector (P1->P2)
        // For OLET: CP->BP ? Or CP? Olets usually connect at BP (Branch) or CP (Header).
        // If type OLET, standard "Next" might be from BP?
        // But for generic P2 logic:
        sourcePt = p2;
        if (p1 && p2) dirVec = getVector(p1, p2);

        // For Tee/Olet Stage 2 Perpendiculars:
        if (isTeeOlet(sourceGroup)) {
            // Main Axis: P1->P2 (Run)
            if (p1 && p2) mainAxisVec = getVector(p1, p2);
            // Branch Axis: CP->BP
            if (cp && bp) branchAxisVec = getVector(cp, bp);
        }
    } else {
        // PREV: P1 + Vector (P2->P1)
        sourcePt = p1;
        if (p1 && p2) dirVec = getVector(p2, p1);

        if (isTeeOlet(sourceGroup)) {
            if (p1 && p2) mainAxisVec = getVector(p2, p1); // Reverse Run
            if (cp && bp) branchAxisVec = getVector(bp, cp); // Reverse Branch? Or usually Branch connects TO header?
            // Simplification: Use same axis logic reversely.
        }
    }

    if (!sourcePt) return null;

    const allGroups = Array.from(groupsMap.values());

    // SCAN HELPER
    const scan = (vecOrAxis, criteriaFn) => {
        let best = null;
        let bestDist = Infinity;

        for (const g of allGroups) {
            if (g === sourceGroup) continue;

            // Check ALL points of neighbor — but only if g.pts is defined
            if (!g.pts) continue;
            const nPts = [g.pts['1'], g.pts['2'], g.pts['3'], g.pts['0']].filter(p => p && p.E !== undefined);

            for (const np of nPts) {
                const dx = np.E - sourcePt.E;
                const dy = np.N - sourcePt.N;
                const dz = np.U - sourcePt.U;
                const d = Math.sqrt(dx * dx + dy * dy + dz * dz);

                // Direction / Cone Check
                let matchesDir = false;

                if (d < 1.0) {
                    matchesDir = true; // Always match co-located points
                } else if (typeof vecOrAxis === 'string') {
                    // Axis Scan
                    const axis = vecOrAxis;
                    const small = 50.0;
                    if (axis === '+E') matchesDir = (dx > 0) && Math.abs(dy) < small && Math.abs(dz) < small;
                    else if (axis === '-E') matchesDir = (dx < 0) && Math.abs(dy) < small && Math.abs(dz) < small;
                    else if (axis === '+N') matchesDir = (dy > 0) && Math.abs(dx) < small && Math.abs(dz) < small;
                    else if (axis === '-N') matchesDir = (dy < 0) && Math.abs(dx) < small && Math.abs(dz) < small;
                    else if (axis === '+UP') matchesDir = (dz > 0) && Math.abs(dx) < small && Math.abs(dy) < small;
                    else if (axis === '-UP') matchesDir = (dz < 0) && Math.abs(dx) < small && Math.abs(dy) < small;
                } else if (vecOrAxis) {
                    // Vector Cone
                    const v = normalizeVec(vecOrAxis);
                    const dot = (dx * v.E + dy * v.N + dz * v.U);
                    if (dot > 0) {
                        const perpDist = Math.sqrt(Math.max(0, d * d - dot * dot));
                        if (perpDist < (bore || 50)) {
                            matchesDir = true;
                        }
                    }
                }

                if (matchesDir) {
                    // Distance Logic: < Tolerance OR within Cone Range
                    const inRange = (d < tolerance) || (d >= minDist && d <= maxDist);

                    if (inRange) {
                        // Apply Filter
                        let pass = true;
                        if (criteriaFn) pass = criteriaFn(g);

                        if (pass && d < bestDist) {
                            bestDist = d;
                            // Format Ref: SeqNo if available, else RefNo
                            const ref = (g.firstRowIndex !== undefined) ? String(g.firstRowIndex + 1) : g.refno;
                            best = { ref: ref, gap: d.toFixed(1) };
                        }
                    }
                }
            }
        }
        return best;
    };

    // Helper: Iterates criteria (LineNo+Bore, Bore, None) with Null Skips
    const checkCriteria = (vec, mode) => {
        if (!vec) return null;
        if (mode === 'STRICT') {
            // 1. LineNo + Bore
            if (lineNo && bore) {
                const match = scan(vec, g => {
                    const r = g.rows?.[0] || {};
                    const nLine = r['Line No.(Derived)'] || r['Line Number'] || r['Line'] || r['Pipeline Ref'] || "";
                    const nBore = g.dn || 0;
                    return nLine === lineNo && Math.abs(nBore - bore) < 1;
                });
                if (match) return match;
            }
            // 2. Bore Only
            if (bore) {
                const match = scan(vec, g => {
                    const nBore = g.dn || 0;
                    return Math.abs(nBore - bore) < 1;
                });
                if (match) return match;
            }
            // 3. None
            return scan(vec, null);
        } else {
            // FUZZY: Coordinate Only
            return scan(vec, null);
        }
    };

    // STAGE 1: Standard Components (Non-Tee/Olet)
    if (!isTeeOlet(sourceGroup)) {
        // Inner Pass 1: Collinear Vector (Strict)
        let match = checkCriteria(dirVec, 'STRICT');
        if (match) return match;

        // Inner Pass 2: Axis Scan (Fuzzy)
        const axisOrder = ['+E', '-E', '+N', '-N', '+UP', '-UP'];
        for (const axis of axisOrder) {
            match = checkCriteria(axis, 'FUZZY');
            if (match) return match;
        }
    }
    // STAGE 2: Complex Components (Tee/Olet)
    else {
        // Inner Pass 1: Collinear + Perpendicular (Strict)
        // Main Axis
        let match = checkCriteria(mainAxisVec || dirVec, 'STRICT');
        if (match) return match;
        // Branch Axis
        if (branchAxisVec) {
            match = checkCriteria(branchAxisVec, 'STRICT');
            if (match) return match;
        }

        // Inner Pass 2: Axis Scan (Fuzzy) - Vertical Priority
        const axisOrder = ['+UP', '-UP', '+E', '-E', '+N', '-N'];
        for (const axis of axisOrder) {
            match = checkCriteria(axis, 'FUZZY');
            if (match) return match;
        }
    }

    return null;
};

// --- Exports ---

/**
 * Legacy Adapter for Mapping Tab Stage 4 Debugging
 */
export const getSmartNeighbors = (group, topologyGraph, groupsMap, config) => {
    // Attempt to infer LineNo/Bore from group
    const r = group.rows?.[0] || {};
    const lineNo = r['Line No.(Derived)'] || r['Line Number'] || r['Line'] || r['Pipeline Ref'] || "";
    const bore = group.dn || 0;

    const prev = findNeighborHybridPass(group, groupsMap, config, lineNo, bore, 'PREV');
    const next = findNeighborHybridPass(group, groupsMap, config, lineNo, bore, 'NEXT');

    return {
        prev: prev ? [prev] : [],
        next: next ? [next] : []
    };
};

/**
 * Main Topology Calculator
 */
export const getTopologyData = (group, idx, sortedGroups, topologyGraph, groupsMap, config, tolerance, lineNo) => {
    let prevValid = 'N/A';
    let nextValid = 'N/A';
    let prevDistStr = '';
    let nextDistStr = '';

    const type = group.pcfType;
    const { len1, len2, len3 } = calcAxisAndLengthFromPts(group);

    // Sequential CSV Gaps
    if (idx > 0) {
        const prevGroup = sortedGroups[idx - 1];
        if (prevGroup.firstRowIndex !== undefined) prevValid = String(prevGroup.firstRowIndex + 1);

        const p1 = getStartPoint(prevGroup);
        const p2 = getStartPoint(group);
        if (p1 && p2) {
            const dist = Math.sqrt(Math.pow(p1.E - p2.E, 2) + Math.pow(p1.N - p2.N, 2) + Math.pow(p1.U - p2.U, 2));
            const prevLens = calcAxisAndLengthFromPts(prevGroup);
            const prevTotalLen = prevGroup.pcfType === 'TEE' ? ((prevLens.len1 || 0) + (prevLens.len3 || 0)) : ((prevLens.len1 || 0) + (prevLens.len2 || 0) + (prevLens.len3 || 0));

            const gap = dist - prevTotalLen;
            prevDistStr = gap.toFixed(1);

            const tickTol = config?.coordinateSettings?.continuityTolerance || 0.5;
            if (Math.abs(gap) < tickTol && prevValid !== 'N/A') {
                prevValid += ' ✓';
            }
        }
    }

    if (idx < sortedGroups.length - 1) {
        const nextGroup = sortedGroups[idx + 1];
        if (nextGroup.firstRowIndex !== undefined) nextValid = String(nextGroup.firstRowIndex + 1);

        const p1 = getStartPoint(group);
        const p2 = getStartPoint(nextGroup);
        if (p1 && p2) {
            const dist = Math.sqrt(Math.pow(p1.E - p2.E, 2) + Math.pow(p1.N - p2.N, 2) + Math.pow(p1.U - p2.U, 2));
            const currTotalLen = type === 'TEE' ? ((len1 || 0) + (len3 || 0)) : ((len1 || 0) + (len2 || 0) + (len3 || 0));

            const gap = dist - currTotalLen;
            nextDistStr = gap.toFixed(1);

            const tickTol = config?.coordinateSettings?.continuityTolerance || 0.5;
            if (Math.abs(gap) < tickTol && nextValid !== 'N/A') {
                nextValid += ' ✓';
            }
        }
    }

    // Smart Connectivity (Hybrid)
    const bore = group.dn || 0;
    const prevSmartMatch = findNeighborHybridPass(group, groupsMap, config, lineNo, bore, 'PREV');
    const nextSmartMatch = findNeighborHybridPass(group, groupsMap, config, lineNo, bore, 'NEXT');

    // Add Tick if Gap < Tolerance (Dynamic)
    const gapTol = config?.coordinateSettings?.continuityTolerance ?? 25.0;
    const formatSmart = (m) => {
        if (!m) return { ref: 'N/A', dist: '' };
        let s = m.ref;
        if (parseFloat(m.gap) < gapTol) s += ' ✓';
        return { ref: s, dist: m.gap };
    };

    const pM = formatSmart(prevSmartMatch);
    const nM = formatSmart(nextSmartMatch);

    const prevSmart = pM.ref;
    const nextSmart = nM.ref;
    const prevSmartDist = pM.dist;
    const nextSmartDist = nM.dist;

    // Final Connectivity (Target Logic)
    const pipelineMode = config?.coordinateSettings?.pipelineMode || 'repair';
    // User Requirements:
    // Strict: Next(Seq) if Tick, else N/A
    // Fuzzy-Single: Next(Seq) if Tick, else Next(Smart) if Tick
    // Fuzzy-Multi: Next(Smart) if Tick, else Next(Seq) if Tick

    const calcTarget = (seqVal, smartVal) => {
        const seqHasTick = seqVal && seqVal.includes('✓');
        const smartHasTick = smartVal && smartVal.includes('✓');
        const cleanSeq = seqVal ? seqVal.replace(' ✓', '') : '';
        const cleanSmart = smartVal ? smartVal.replace(' ✓', '') : '';

        if (pipelineMode === 'strict') {
            return seqHasTick ? cleanSeq : 'N/A';
        } else if (pipelineMode === 'sequential') {
            // Fuzzy Multi
            if (smartHasTick) return cleanSmart;
            if (seqHasTick) return cleanSeq;
            return 'N/A';
        } else {
            // Fuzzy Single (Repair)
            if (seqHasTick) return cleanSeq;
            if (smartHasTick) return cleanSmart;
            return 'N/A';
        }
    };

    let finalPrevF = calcTarget(prevValid, prevSmart);
    let finalNextF = calcTarget(nextValid, nextSmart);

    // Zero Length Fallback (Gate 2) - preserved
    const totalLen = (len1 || 0) + (len2 || 0) + (len3 || 0);
    if (totalLen === 0) {
        if (finalPrevF === 'N/A' && finalNextF !== 'N/A') finalPrevF = finalNextF;
        else if (finalNextF === 'N/A' && finalPrevF !== 'N/A') finalNextF = finalPrevF;
    }

    if (finalPrevF === 'N/A') globalLogger.logRoutingDropNA(group.refno, 'Prev_F');
    if (finalNextF === 'N/A') globalLogger.logRoutingDropNA(group.refno, 'Next_F');

    return {
        seq: { prevValid, nextValid, prevDistStr, nextDistStr },
        smart: { prevSmart, nextSmart, prevSmartDist, nextSmartDist },
        final: { prevF: finalPrevF, nextF: finalNextF },
        geometry: calcAxisAndLengthFromPts(group)
    };
};

export const applyAlgebraicSequenceMath = (sortedGroups, tolerance = 6.0) => {
    if (!sortedGroups || sortedGroups.length === 0) return;
    let currentAnchor = null;
    let currentPipeline = null;

    for (let i = 0; i < sortedGroups.length; i++) {
        const g = sortedGroups[i];
        if (!g.pts) g.pts = {};

        const r = g.rows?.[0] || {};
        const gPipeline = r['Line No.(Derived)'] || r['Line Number'] || r['Line'] || r['Pipeline Ref'] || "";

        // Capture Original Geometry (topo) BEFORE mutation of P1
        // This prevents the "Gap Stretch" bug where P1 is moved to snap to previous P2,
        // and P2 is then calculated based on the NEW P1 and OLD P2 (which includes the gap).
        let topo = null;
        if (i !== 0 && i !== sortedGroups.length - 1) {
            topo = calcAxisAndLengthFromPts(g);
        }

        let isNewSequence = (i === 0);

        if (!isNewSequence && currentAnchor && g.pts['1']) {
            const dx = g.pts['1'].E - currentAnchor.E;
            const dy = g.pts['1'].N - currentAnchor.N;
            const dz = g.pts['1'].U - currentAnchor.U;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // If the gap exceeds tolerance, break the sequence chain!
            if (dist > tolerance) {
                isNewSequence = true;
                globalLogger?.logRoutingDropNA?.(g.refno, `Sequence break: physical gap ${dist.toFixed(1)}mm exceeds tolerance ${tolerance}mm`);
            } else if (dist > 0.001) {
                // LOCAL STRETCH GAP CLOSURE: 
                // Seamlessly seal the gap by stretching the PREVIOUS component's EP2 
                // forward to perfectly touch the CURRENT component's EP1.
                // We do NOT shift the current component, preventing cascading pipeline drift!
                const prevG = sortedGroups[i - 1];
                if (prevG && prevG.pts && prevG.pts['2']) {
                    prevG.pts['2'] = { ...g.pts['1'], bore: prevG.pts['2'].bore };
                }
            } else if (gPipeline && currentPipeline && gPipeline !== currentPipeline) {
                // If pipelines strictly mismatch AND distance is <= tolerance...
                // They are physically continuous but logically separate pipelines.
            }
        } else if (!isNewSequence && (!g.pts['1'] || !currentAnchor)) {
            // Safety fallback if points are completely missing
            if (gPipeline !== currentPipeline) isNewSequence = true;
        }

        if (isNewSequence) {
            const anchor = g.pts['1'] || g.pts['2'] || { E: 0, N: 0, U: 0, bore: g.dn || g.pts?.['0']?.bore || 0 };
            if (i === 0) {
                g.pts['2'] = g.pts['2'] || { ...anchor };
            }
            g.pts['1'] = g.pts['1'] || { ...anchor };
        } else {
            // In Local Stretch strategy, we do NOT overwrite g.pts['1']. 
            // It remains firmly anchored to its raw physical CSV coordinate.
        }

        // We also do NOT mathematically project P2 using topo vectors anymore,
        // because that was the root cause of the "Global Shift" divergence.
        // P2 simply stays at its raw physical CSV geometry, waiting to be 
        // stretched by the NEXT component if a micro-gap exists.
        if (!g.pts['2']) {
            if (i === sortedGroups.length - 1) {
                g.pts['2'] = { ...g.pts['1'] };
            } else if (i !== 0 && topo) {
                // Only project if P2 is completely missing from CSV (rare)
                let pt2E = g.pts['1'].E, pt2N = g.pts['1'].N, pt2U = g.pts['1'].U;
                if (topo.axis1 === 'EAST') pt2E += topo.len1;
                else if (topo.axis1 === 'WEST') pt2E -= topo.len1;
                if (topo.axis2 === 'NORTH') pt2N += topo.len2;
                else if (topo.axis2 === 'SOUTH') pt2N -= topo.len2;
                if (topo.axis3 === 'UP') pt2U += topo.len3;
                else if (topo.axis3 === 'DOWN') pt2U -= topo.len3;
                g.pts['2'] = { E: pt2E, N: pt2N, U: pt2U, bore: g.pts['1'].bore || g.dn || 0 };
            }
        }

        currentAnchor = { ...g.pts['2'] };
        currentPipeline = gPipeline;

        // Recalculate LenCalc after geometry adjustment
        if (g.pts['1'] && g.pts['2']) {
            const dx = g.pts['2'].E - g.pts['1'].E;
            const dy = g.pts['2'].N - g.pts['1'].N;
            const dz = g.pts['2'].U - g.pts['1'].U;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            g.lenCalc = dist;
            // Update row if available for legacy compatibility
            if (g.rows && g.rows.length > 0) {
                g.rows[0].Len_Calc = dist.toFixed(2);
            }
        }
    }
};
