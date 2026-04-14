import { SmartFixerConfig } from './smartFixerConfig.js';
import { Common3DLogic } from '../../geometry/common-3d-logic.js';

export class PcfTopologyGraph_2 {
    constructor(components, config = {}) {
        if (!components || !Array.isArray(components)) {
            throw new Error("PcfTopologyGraph_2 requires an array of components.");
        }
        this.components = JSON.parse(JSON.stringify(components));
        this.config = config;
        this.nodes = [];
        this.edges = [];
        this.visualGaps = [];
        this.executionLog = [];

        this._buildGraph();
    }

    _buildGraph() {
        this.nodes = [];
        this.edges = [];

        let nodeIdCounter = 0;

        this.components.forEach((comp, idx) => {
            const edge = {
                id: comp.id || `comp_${idx}`,
                type: (comp.type || '').toUpperCase(),
                ref: comp,
                endpoints: [],
                immutable: ['FLANGE', 'BEND', 'VALVE', 'TEE', 'OLET', 'SUPPORT'].includes((comp.type || '').toUpperCase())
            };

            const points = [];
            ['ep1', 'ep2', 'cp', 'bp', 'centrePoint', 'branch1Point'].forEach(ptKey => {
                if (comp[ptKey] && typeof comp[ptKey].x === 'number') {
                    points.push({ ...comp[ptKey], ptType: ptKey.toUpperCase(), pointKey: ptKey });
                }
            });

            // Note: points from parser might exist
            if (comp.points && Array.isArray(comp.points)) {
                comp.points.forEach((pt, ptIdx) => {
                     points.push({ ...pt, ptType: pt.type || 'END', sourceIndex: ptIdx, fromArray: true });
                });
            }

            // Note: points from parser might exist

            // Extract Bore
            let compBore = comp.bore || comp.branchBore || 0;
            if (!compBore && comp.points && comp.points[0]) compBore = comp.points[0].bore || 0;

            points.forEach(pt => {
                const ptBore = pt.bore || compBore;
                const node = {
                    id: `n_${nodeIdCounter++}`,
                    x: pt.x,
                    y: pt.y,
                    z: pt.z,
                    parentEdgeId: edge.id,
                    ptType: pt.ptType,
                    rawPointRef: pt,
                    bore: ptBore
                };
                this.nodes.push(node);
                edge.endpoints.push(node.id);
            });

            this.edges.push(edge);
        });

        this._log(`Graph built with ${this.nodes.length} nodes and ${this.edges.length} edges.`);
    }

    _log(msg) {
        this.executionLog.push(msg);
        console.log(`[PcfTopologyGraph_2] ${msg}`);
    }

    _distSq(n1, n2) {
        const dx = n1.x - n2.x;
        const dy = n1.y - n2.y;
        const dz = n1.z - n2.z;
        return (dx*dx + dy*dy + dz*dz);
    }

    _dist(n1, n2) {
        return Math.sqrt(this._distSq(n1, n2));
    }

    _validateWithGatekeeper(n1, n2, e1, e2, passName) {
        // 1. Absolute Coordinate Match Override (0mm Gap)
        const d = this._dist(n1, n2);
        if (d <= 0.1) {
            return { valid: true, dist: d }; // Auto-approve, perfectly connected
        }

        // 2. Fetch UI rules (or defaults)
        const commonLogic = this.config?.coordinateSettings?.common3DLogic || Common3DLogic.DEFAULTS;
        const maxOverlap = commonLogic.maxOverlap ?? Common3DLogic.DEFAULTS.MAX_OVERLAP;

        // 3. Bore constraints based on Gap Length
        const bore1 = n1.bore || 0;
        const bore2 = n2.bore || 0;

        // Pass 2 & 3 strict BORE matching
        if (passName !== "Pass 1") {
            // New Configuration Rules (Bypassing legacy smartFixerConfig)
            const BORE_RATIO_MIN = 0.7;
            const BORE_RATIO_MAX = 1.5;

            if (bore1 > 0 && bore2 > 0) {
                if (d <= maxOverlap) {
                    // Micro/Small Gaps: allow ratio
                    const minB = Math.min(bore1, bore2);
                    const maxB = Math.max(bore1, bore2);
                    const ratio = minB / maxB;
                    if (ratio < BORE_RATIO_MIN || ratio > BORE_RATIO_MAX) {
                        this._log(`${passName}: Rejected gap of ${d.toFixed(2)}mm between ${e1.type} and ${e2.type} (Bore ratio ${ratio.toFixed(2)} outside bounds 0.7-1.5)`);
                        return { valid: false };
                    }
                } else {
                    // Massive Gaps: Strict bore match required
                    if (bore1 !== bore2) {
                        this._log(`${passName}: Rejected gap of ${d.toFixed(2)}mm between ${e1.type} and ${e2.type} (Strict bore match failed: ${bore1} vs ${bore2})`);
                        return { valid: false };
                    }
                }
            }
        } else {
            // Pass 1: For backward compatibility, apply strict bore match if gap > maxOverlap
            if (bore1 > 0 && bore2 > 0 && bore1 !== bore2 && d > maxOverlap) {
                 this._log(`${passName}: Rejected gap of ${d.toFixed(2)}mm between ${e1.type} and ${e2.type} (Strict bore match failed)`);
                 return { valid: false };
            }
        }

        // 4. Common3DLogic Rule Validation (Skew Limits, Max Run)
        const p1 = { E: n1.x, N: n1.y, U: n1.z };
        const p2 = { E: n2.x, N: n2.y, U: n2.z };
        // Common3DLogic expects bore to be passed, take the max as the limiting factor
        const valRes = Common3DLogic.validateConnection(p1, p2, Math.max(bore1, bore2), this.config);

        if (!valRes.valid) {
            this._log(`${passName}: Rejected connection between ${e1.type} and ${e2.type}. Reason: ${valRes.reason}`);
            return { valid: false };
        }

        // 5. Min Component Size Check
        const minCompSize = commonLogic.minComponentSize ?? Common3DLogic.DEFAULTS.MIN_COMPONENT_SIZE;
        if (d > 0.1 && d < minCompSize) {
             this._log(`${passName}: Rejected gap of ${d.toFixed(2)}mm (Below Min Component Size of ${minCompSize}mm)`);
             return { valid: false };
        }

        return { valid: true, dist: d };
    }

    runSequentialPass(targetLineKey = "") {
        this._log("Starting Pass 1: Topological / Sequential Array Flow (V2)");
        this.visualGaps = [];

        // Respect UI Configuration Flag: chainBasedOrder
        const isChainBased = this.config?.coordinateSettings?.chainBasedOrder !== false;
        if (!isChainBased) {
             this._log("Pass 1 Skipped: Chain-Based PCF Build Order is OFF. Deferring to Pass 2/3 (Graph DFS).");
             return {
                 revisedComponents: this.components,
                 executionLog: this.executionLog,
                 visualGaps: this.visualGaps
             };
        }

        const handledEdges = new Set();
        const sequence = this.edges.filter(e => e.endpoints && e.endpoints.length > 0);
        let gapsFound = 0;

        for (let i = 0; i < sequence.length - 1; i++) {
            const e1 = sequence[i];
            const e2 = sequence[i + 1];

            if (handledEdges.has(e1.id) || handledEdges.has(e2.id)) continue;
            if (e1.endpoints.length === 0 || e2.endpoints.length === 0) continue;

            const getAttr = (comp, key) => comp.attributes ? comp.attributes[key] : undefined;

            // Attempt to get Line_Key or Line No from standard PCF parsing or from the translated datatable properties
            const lk1 = e1.ref.Line_Key || e1.ref['Line No'] || e1.ref['Line_No'] || e1.ref.pipelineReference || getAttr(e1.ref, 'Line_Key') || getAttr(e1.ref, 'Line No') || '';
            const lk2 = e2.ref.Line_Key || e2.ref['Line No'] || e2.ref['Line_No'] || e2.ref.pipelineReference || getAttr(e2.ref, 'Line_Key') || getAttr(e2.ref, 'Line No') || '';

            // Check Bore Ratio constraints (0.5 to 2.0)
            let b1 = e1.ref.bore || e1.ref.branchBore || 0;
            let b2 = e2.ref.bore || e2.ref.branchBore || 0;

            // Best effort bore logic if not explicitly found on top level
            if (!b1 && e1.ref.points && e1.ref.points[0]) b1 = e1.ref.points[0].bore || 0;
            if (!b2 && e2.ref.points && e2.ref.points[0]) b2 = e2.ref.points[0].bore || 0;

            let validBoreRatio = true;
            if (b1 > 0 && b2 > 0) {
                const ratio = b1 / b2;
                if (ratio < 0.5 || ratio > 2.0) validBoreRatio = false;
            }

            let validLineKey = true;
            if (targetLineKey && targetLineKey !== "") {
                // If a specific line key is requested, BOTH components must match it
                if (lk1 !== targetLineKey || lk2 !== targetLineKey) {
                    validLineKey = false;
                }
            } else {
                // Default: Relaxed constraint. We don't care if lk1 !== lk2 as long as spatial proximity is met.
                // We let the MAX_FILLABLE_GAP and distance logic handle structural breaks.
            }

            if (!validLineKey) continue;

            let minD = Infinity;
            let bestN1 = null;
            let bestN2 = null;

            e1.endpoints.forEach(nid1 => {
                const n1 = this.nodes.find(n => n.id === nid1);
                e2.endpoints.forEach(nid2 => {
                    const n2 = this.nodes.find(n => n.id === nid2);
                    const d = this._dist(n1, n2);
                    if (d < minD) {
                        minD = d;
                        bestN1 = n1;
                        bestN2 = n2;
                    }
                });
            });

            if (minD > SmartFixerConfig.MIN_DISTANCE_TOLERANCE) {
                const validation = this._validateWithGatekeeper(bestN1, bestN2, e1, e2, "Pass 1");
                if (validation.valid) {
                    this._log(`Pass 1: Found valid sequential gap of ${minD.toFixed(2)}mm between ${e1.type} and ${e2.type}`);
                    this._prepareMutation(e1, e2, bestN1, bestN2, minD);
                    handledEdges.add(e1.id);
                    handledEdges.add(e2.id);
                    gapsFound++;
                } else {
                    this._log(`Pass 1: Ignored invalid jump of ${minD.toFixed(2)}mm between ${e1.type} and ${e2.type}.`);
                }
            }
        }

        this._log(`Pass 1 complete. Found ${gapsFound} sequential gaps.`);

        return {
            revisedComponents: this.components,
            executionLog: this.executionLog,
            visualGaps: this.visualGaps
        };
    }

    _prepareMutation(e1, e2, n1, n2, gapDist) {
        const AUTO_APPROVE_THRESHOLD = SmartFixerConfig.AUTO_APPROVE_THRESHOLD;
        const IMMUTABLE_TRANSLATE_LIMIT = SmartFixerConfig.IMMUTABLE_TRANSLATE_LIMIT;
        const INSERT_PIPE_LIMIT = SmartFixerConfig.AUTO_APPROVE_THRESHOLD;

        const isE1Pipe = e1.type === 'PIPE';
        const isE2Pipe = e2.type === 'PIPE';

        let actionStr = '';
        let typeStr = '';
        let targetComp = null;
        let sourceNode = null;
        let targetNode = null;
        let translationVector = null;

        const e1Connected = e1.endpoints.some(nid => nid !== n1.id && this.nodes.some(n => n.id !== nid && this._dist(this.nodes.find(nx=>nx.id===nid), n) < SmartFixerConfig.MIN_DISTANCE_TOLERANCE));
        const e2Connected = e2.endpoints.some(nid => nid !== n2.id && this.nodes.some(n => n.id !== nid && this._dist(this.nodes.find(nx=>nx.id===nid), n) < SmartFixerConfig.MIN_DISTANCE_TOLERANCE));

        // Final Pass Settings
        const fpSettings = this.config?.coordinateSettings?.finalPassGapFilling || {
            enabled: true, pipeStretchLimit: 25.0, immutableStretchLimit: 6.0
        };

        const allowPipeStretch = fpSettings.enabled ? fpSettings.pipeStretchLimit : 0.1;
        const allowImmutableStretch = fpSettings.enabled ? fpSettings.immutableStretchLimit : AUTO_APPROVE_THRESHOLD;

        let autoApprove = false;

        if (isE1Pipe || isE2Pipe) {
            if (gapDist <= allowPipeStretch) {
                autoApprove = true;
                actionStr = `GAP_FILL: Stretch ${gapDist.toFixed(2)}mm`;
                typeStr = 'GAP_FILL';
                if (isE1Pipe) {
                    targetComp = e1; sourceNode = n1; targetNode = n2;
                } else {
                    targetComp = e2; sourceNode = n2; targetNode = n1;
                }
            } else {
                 actionStr = `[Auto fix] Proposal: Insert Pipe (Length=${gapDist.toFixed(2)}mm)`;
                 typeStr = 'GAP_FILL';
                 targetComp = e1; sourceNode = n1; targetNode = n2;
            }
        } else {
            if (gapDist <= allowImmutableStretch) {
                 autoApprove = true;
                 actionStr = `GAP_FILL: Snap ${gapDist.toFixed(2)}mm`;
                 typeStr = 'GAP_SNAP_IMMUTABLE';
                 targetComp = e1; sourceNode = n1; targetNode = n2;
                 translationVector = { dx: targetNode.x - sourceNode.x, dy: targetNode.y - sourceNode.y, dz: targetNode.z - sourceNode.z };
            } else {
                // If between immutables and > limit, inject pipe
                actionStr = `[Auto fix] Proposal: Insert Pipe (Length=${gapDist.toFixed(2)}mm)`;
                typeStr = 'GAP_FILL';
                targetComp = e1; sourceNode = n1; targetNode = n2;
            }
        }

        if (!targetComp.ref._fixes) targetComp.ref._fixes = [];

        if (autoApprove) {
            actionStr += ' [Fix approved]';
        }

        targetComp.ref._fixes.push({
            type: typeStr,
            target: { x: targetNode.x, y: targetNode.y, z: targetNode.z },
            sourcePoint: { x: sourceNode.x, y: sourceNode.y, z: sourceNode.z },
            sourceIndex: sourceNode.rawPointRef.sourceIndex,
            pointKey: sourceNode.rawPointRef.pointKey,
            action: actionStr,
            pass: 1,
            approved: autoApprove,
            translationVector: translationVector
        });

        targetComp.ref._hasUnappliedFix = true;
        targetComp.ref.fixingAction = targetComp.ref._fixes.map(f => f.action).join(' | ');

        this.visualGaps.push({
            p1: { x: n1.x, y: n1.y, z: n1.z },
            p2: { x: n2.x, y: n2.y, z: n2.z },
            dist: gapDist,
            type: typeStr
        });
    }

    _isMajorAxisSense(n1, n2) {
        const dx = Math.abs(n1.x - n2.x);
        const dy = Math.abs(n1.y - n2.y);
        const dz = Math.abs(n1.z - n2.z);

        // Sort to find the two smallest deltas
        const sorted = [dx, dy, dz].sort((a, b) => a - b);

        // If the two smallest deltas are very small (e.g. < 5mm), it means the vector is essentially 1D along the major axis.
        return (sorted[0] < SmartFixerConfig.MAJOR_AXIS_TOLERANCE && sorted[1] < SmartFixerConfig.MAJOR_AXIS_TOLERANCE);
    }

    runFuzzyTopologicalPass2(targetLineKey = "") {
        this._log("Starting Pass 2: Fuzzy Topological Major Axis (Global Search)");
        // Don't reset visualGaps here as we accumulate them

        const isConnected = (n1) => {
            return this.nodes.some(n2 => n1.id !== n2.id && this._dist(n1, n2) <= SmartFixerConfig.MIN_DISTANCE_TOLERANCE);
        };

        const openNodes = this.nodes.filter(n => !isConnected(n));
        this._log(`Pass 2: Found ${openNodes.length} topologically open endpoints globally.`);

        const handledNodes = new Set();
        const handledEdges = new Set();

        const pairs = [];

        for (let i = 0; i < openNodes.length; i++) {
            for (let j = i + 1; j < openNodes.length; j++) {
                const n1 = openNodes[i];
                const n2 = openNodes[j];
                if (n1.parentEdgeId !== n2.parentEdgeId) {
                    const e1 = this.edges.find(e => e.id === n1.parentEdgeId);
                    const e2 = this.edges.find(e => e.id === n2.parentEdgeId);

                    const getAttr = (comp, key) => comp.attributes ? comp.attributes[key] : undefined;
                    const lk1 = e1.ref.Line_Key || e1.ref['Line No'] || e1.ref['Line_No'] || e1.ref.pipelineReference || getAttr(e1.ref, 'Line_Key') || getAttr(e1.ref, 'Line No') || '';
                    const lk2 = e2.ref.Line_Key || e2.ref['Line No'] || e2.ref['Line_No'] || e2.ref.pipelineReference || getAttr(e2.ref, 'Line_Key') || getAttr(e2.ref, 'Line No') || '';

                    if (targetLineKey && targetLineKey !== "") {
                        if (lk1 !== targetLineKey || lk2 !== targetLineKey) continue;
                    }

                    // Check if they align on a major axis
                    if (this._isMajorAxisSense(n1, n2)) {
                        pairs.push({
                            n1,
                            n2,
                            d: this._dist(n1, n2)
                        });
                    }
                }
            }
        }

        pairs.sort((a, b) => a.d - b.d);

        let gapsFound = 0;
        for (const pair of pairs) {
            if (handledEdges.has(pair.n1.parentEdgeId) || handledEdges.has(pair.n2.parentEdgeId)) continue;
            if (handledNodes.has(pair.n1.id) || handledNodes.has(pair.n2.id)) continue;

            if (pair.d > SmartFixerConfig.MIN_DISTANCE_TOLERANCE) {
                const e1 = this.edges.find(e => e.id === pair.n1.parentEdgeId);
                const e2 = this.edges.find(e => e.id === pair.n2.parentEdgeId);

                const validation = this._validateWithGatekeeper(pair.n1, pair.n2, e1, e2, "Pass 2");
                if (validation.valid) {
                    this._log(`Pass 2: Found valid Major Axis gap of ${pair.d.toFixed(2)}mm between ${e1.type} and ${e2.type}`);
                    this._prepareMutation(e1, e2, pair.n1, pair.n2, pair.d);
                    handledEdges.add(pair.n1.parentEdgeId);
                    handledEdges.add(pair.n2.parentEdgeId);
                    handledNodes.add(pair.n1.id);
                    handledNodes.add(pair.n2.id);
                    gapsFound++;
                } else {
                    this._log(`Pass 2: Ignored invalid Major Axis jump of ${pair.d.toFixed(2)}mm between ${e1.type} and ${e2.type}.`);
                }
            }
        }

        this._log(`Pass 2 complete. Found ${gapsFound} gaps.`);

        return {
            revisedComponents: this.components,
            executionLog: this.executionLog,
            visualGaps: this.visualGaps
        };
    }

    runFuzzyTopologicalPass3(targetLineKey = "") {
        this._log("Starting Pass 3: Fuzzy Topological Any Axis (Global Search)");

        const isConnected = (n1) => {
            return this.nodes.some(n2 => n1.id !== n2.id && this._dist(n1, n2) <= SmartFixerConfig.MIN_DISTANCE_TOLERANCE);
        };

        const openNodes = this.nodes.filter(n => !isConnected(n));
        this._log(`Pass 3: Found ${openNodes.length} topologically open endpoints globally.`);

        const handledNodes = new Set();
        const handledEdges = new Set();

        const pairs = [];

        for (let i = 0; i < openNodes.length; i++) {
            for (let j = i + 1; j < openNodes.length; j++) {
                const n1 = openNodes[i];
                const n2 = openNodes[j];
                if (n1.parentEdgeId !== n2.parentEdgeId) {
                    const e1 = this.edges.find(e => e.id === n1.parentEdgeId);
                    const e2 = this.edges.find(e => e.id === n2.parentEdgeId);

                    const getAttr = (comp, key) => comp.attributes ? comp.attributes[key] : undefined;
                    const lk1 = e1.ref.Line_Key || e1.ref['Line No'] || e1.ref['Line_No'] || e1.ref.pipelineReference || getAttr(e1.ref, 'Line_Key') || getAttr(e1.ref, 'Line No') || '';
                    const lk2 = e2.ref.Line_Key || e2.ref['Line No'] || e2.ref['Line_No'] || e2.ref.pipelineReference || getAttr(e2.ref, 'Line_Key') || getAttr(e2.ref, 'Line No') || '';

                    if (targetLineKey && targetLineKey !== "") {
                        if (lk1 !== targetLineKey || lk2 !== targetLineKey) continue;
                    }

                    pairs.push({
                        n1,
                        n2,
                        d: this._dist(n1, n2)
                    });
                }
            }
        }

        pairs.sort((a, b) => a.d - b.d);

        let gapsFound = 0;
        for (const pair of pairs) {
            if (handledEdges.has(pair.n1.parentEdgeId) || handledEdges.has(pair.n2.parentEdgeId)) continue;
            if (handledNodes.has(pair.n1.id) || handledNodes.has(pair.n2.id)) continue;

            if (pair.d > SmartFixerConfig.MIN_DISTANCE_TOLERANCE) {
                const e1 = this.edges.find(e => e.id === pair.n1.parentEdgeId);
                const e2 = this.edges.find(e => e.id === pair.n2.parentEdgeId);

                const validation = this._validateWithGatekeeper(pair.n1, pair.n2, e1, e2, "Pass 3");
                if (validation.valid) {
                    this._log(`Pass 3: Found valid Any Axis gap of ${pair.d.toFixed(2)}mm between ${e1.type} and ${e2.type}`);
                    this._prepareMutation(e1, e2, pair.n1, pair.n2, pair.d);
                    handledEdges.add(pair.n1.parentEdgeId);
                    handledEdges.add(pair.n2.parentEdgeId);
                    handledNodes.add(pair.n1.id);
                    handledNodes.add(pair.n2.id);
                    gapsFound++;
                } else {
                    this._log(`Pass 3: Ignored invalid Any Axis jump of ${pair.d.toFixed(2)}mm between ${e1.type} and ${e2.type}.`);
                }
            }
        }

        this._log(`Pass 3 complete. Found ${gapsFound} gaps.`);

        return {
            revisedComponents: this.components,
            executionLog: this.executionLog,
            visualGaps: this.visualGaps
        };
    }

    applyApprovedMutations(targetLineKey = "") {
        this._log("Applying approved mutations...");

        let newComponents = [];

        this.components.forEach(comp => {
            newComponents.push(comp);

            if (!comp.fixingAction || comp.fixingAction.includes('REJECT') || comp.fixingAction.includes('IGNORE')) {
                return;
            }

            if (comp._fixes && comp._fixes.length > 0 && comp._hasUnappliedFix) {
                let appliedActions = [];

                comp._fixes.forEach(fix => {
                    if (fix.action.includes('REJECT') || fix.action.includes('IGNORE')) {
                        appliedActions.push(fix.action);
                        return;
                    }

                    if (fix.action.includes('Insert Pipe')) {
                        const newPipe = {
                            type: 'PIPE',
                            id: 'AUTO-PIPE-' + Date.now() + Math.random().toString(36).substr(2, 5),
                            bore: comp.bore || comp.branchBore || 50,
                            Line_Key: comp.Line_Key || '',
                            Component_Name: 'PIPE',
                            ep1: { x: fix.sourcePoint.x, y: fix.sourcePoint.y, z: fix.sourcePoint.z },
                            ep2: { x: fix.target.x, y: fix.target.y, z: fix.target.z },
                            points: [
                                { x: fix.sourcePoint.x, y: fix.sourcePoint.y, z: fix.sourcePoint.z, type: 'END' },
                                { x: fix.target.x, y: fix.target.y, z: fix.target.z, type: 'END' }
                            ],
                            attributes: {
                                'MOCK-DATA-ROW': 'AUTO-INSERT',
                                'ITEM-CODE': 'AUTOFILLED'
                            },
                            fixingAction: 'Inserted to close gap'
                        };

                        newComponents.push(newPipe);
                        appliedActions.push('GAP_FILL: Pipe Inserted');
                        return;
                    }

                    if (fix.type === 'GAP_SNAP_IMMUTABLE' && fix.translationVector) {
                        // Translate entire component
                        const { dx, dy, dz } = fix.translationVector;

                        ['ep1', 'ep2', 'cp', 'bp'].forEach(ptKey => {
                            if (comp[ptKey] && typeof comp[ptKey].x === 'number') {
                                comp[ptKey].x += dx;
                                comp[ptKey].y += dy;
                                comp[ptKey].z += dz;
                            }
                        });

                        if (comp.points && Array.isArray(comp.points)) {
                            comp.points.forEach(pt => {
                                pt.x += dx;
                                pt.y += dy;
                                pt.z += dz;
                                pt._isModified = true;
                            });
                        }

                        appliedActions.push('GAP_SNAP_IMMUTABLE: Translated Applied');
                        return;
                    }

                    // Stretching logic for PIPEs
                    if (fix.pointKey && comp[fix.pointKey]) {
                        comp[fix.pointKey].x = fix.target.x;
                        comp[fix.pointKey].y = fix.target.y;
                        comp[fix.pointKey].z = fix.target.z;
                    }

                    if (comp.points && typeof fix.sourceIndex === 'number' && comp.points[fix.sourceIndex]) {
                        comp.points[fix.sourceIndex].x = fix.target.x;
                        comp.points[fix.sourceIndex].y = fix.target.y;
                        comp.points[fix.sourceIndex].z = fix.target.z;
                        comp.points[fix.sourceIndex]._isModified = true;
                    }

                    appliedActions.push('GAP_FILL: Stretched Applied');
                });

                comp.fixingAction = appliedActions.join(' | ');
                comp._hasUnappliedFix = false;
            }
        });

        this.components = newComponents;

        this._buildGraph();
        this.runSequentialPass(targetLineKey);

        return {
            revisedComponents: this.components,
            executionLog: this.executionLog,
            visualGaps: this.visualGaps
        };
    }
}
