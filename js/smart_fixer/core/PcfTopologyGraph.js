export class PcfTopologyGraph {
    constructor(components) {
        if (!components || !Array.isArray(components)) {
            throw new Error("PcfTopologyGraph requires an array of components.");
        }
        this.components = JSON.parse(JSON.stringify(components));
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
            ['ep1', 'ep2', 'cp', 'bp'].forEach(ptKey => {
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

            points.forEach(pt => {
                const node = {
                    id: `n_${nodeIdCounter++}`,
                    x: pt.x,
                    y: pt.y,
                    z: pt.z,
                    parentEdgeId: edge.id,
                    ptType: pt.ptType,
                    rawPointRef: pt
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
        console.log(`[PcfTopologyGraph] ${msg}`);
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

    runSequentialPass() {
        this._log("Starting Pass 1: Topological / Sequential Array Flow");
        this.visualGaps = [];

        // Pass 1 now strictly iterates through the logical array sequence [A, B, C]
        // and measures the physical gap between A and B, B and C to fix topological breaks.
        const handledEdges = new Set();

        // Create an ordered list of components that are not non-physical metadata.
        const sequence = this.edges.filter(e =>
            !['MESSAGE-SQUARE', 'SUPPORT', 'ISOGEN-FILES', 'UNITS-BORE', 'UNITS-CO-ORDS', 'UNITS-WEIGHT', 'UNITS-BOLT-DIA', 'UNITS-BOLT-LENGTH', 'PIPELINE-REFERENCE'].includes(e.type)
        );

        let gapsFound = 0;

        for (let i = 0; i < sequence.length - 1; i++) {
            const e1 = sequence[i];
            const e2 = sequence[i + 1];

            if (handledEdges.has(e1.id) || handledEdges.has(e2.id)) continue;
            if (e1.endpoints.length === 0 || e2.endpoints.length === 0) continue;

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

            // If there's a sequential break (> 0.1mm gap), prepare mutation
            // Note: Cap at 15000mm to prevent false positive jumps across branches in the sequential array
            if (minD > 0.1 && minD <= 15000.0) {
                const lk = e1.ref.Line_Key || e1.ref.pipelineReference || 'DEFAULT_LK';
                this._log(`Pass 1: Found sequential gap of ${minD.toFixed(2)}mm between ${e1.type} and ${e2.type} in line ${lk}`);

                this._prepareMutation(e1, e2, bestN1, bestN2, minD);

                handledEdges.add(e1.id);
                handledEdges.add(e2.id);
                gapsFound++;
            } else if (minD > 15000.0) {
                this._log(`Pass 1: Ignored massive jump of ${minD.toFixed(2)}mm between ${e1.type} and ${e2.type} (Branch/Origin jump).`);
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
        const IMMUTABLE_THRESHOLD = 15.0;

        const isE1Pipe = e1.type === 'PIPE';
        const isE2Pipe = e2.type === 'PIPE';

        let actionStr = '';
        let typeStr = '';
        let targetComp = null;
        let sourceNode = null;
        let targetNode = null;
        let translationVector = null;

        // "If an immutable component is already connected on one side... insert a micro-pipe to bridge it."
        // We can check if e1 or e2 has other connections.
        const e1Connected = e1.endpoints.some(nid => nid !== n1.id && this.nodes.some(n => n.id !== nid && this._dist(this.nodes.find(nx=>nx.id===nid), n) < 0.1));
        const e2Connected = e2.endpoints.some(nid => nid !== n2.id && this.nodes.some(n => n.id !== nid && this._dist(this.nodes.find(nx=>nx.id===nid), n) < 0.1));

        if (!isE1Pipe && !isE2Pipe) {
            if (gapDist > IMMUTABLE_THRESHOLD || e1Connected || e2Connected) {
                // Insert Pipe if > 15mm OR if we can't safely translate because it's anchored.
                actionStr = `[Auto fix] Proposal: Insert Pipe (Length=${gapDist.toFixed(2)}mm)`;
                typeStr = 'GAP_FILL';
                targetComp = e1;
                sourceNode = n1;
                targetNode = n2;
            } else {
                // Free floating immutable component - safe to translate
                actionStr = `GAP_FILL: Snap ${gapDist.toFixed(2)}mm`;
                typeStr = 'GAP_SNAP_IMMUTABLE';
                targetComp = e1;
                sourceNode = n1;
                targetNode = n2;

                translationVector = {
                    dx: targetNode.x - sourceNode.x,
                    dy: targetNode.y - sourceNode.y,
                    dz: targetNode.z - sourceNode.z
                };
            }
        } else {
            actionStr = `GAP_FILL: Stretch ${gapDist.toFixed(2)}mm`;
            typeStr = 'GAP_FILL';
            if (isE1Pipe) {
                targetComp = e1;
                sourceNode = n1;
                targetNode = n2;
            } else {
                targetComp = e2;
                sourceNode = n2;
                targetNode = n1;
            }
        }

        if (!targetComp.ref._fixes) targetComp.ref._fixes = [];

        if (gapDist <= 25.0) {
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
            approved: gapDist <= 25.0,
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

    runFuzzyTopologicalPass() {
        this._log("Starting Pass 2: Fuzzy Topological (Global Search)");
        this.visualGaps = [];

        const isConnected = (n1) => {
            return this.nodes.some(n2 => n1.id !== n2.id && this._dist(n1, n2) <= 0.1);
        };

        const openNodes = this.nodes.filter(n => !isConnected(n));
        this._log(`Pass 2: Found ${openNodes.length} topologically open endpoints globally.`);

        const handledNodes = new Set();
        const handledEdges = new Set();

        // Collect all permutations globally, ignoring Line_Key
        const pairs = [];

        for (let i = 0; i < openNodes.length; i++) {
            for (let j = i + 1; j < openNodes.length; j++) {
                const n1 = openNodes[i];
                const n2 = openNodes[j];
                // Must be different components
                if (n1.parentEdgeId !== n2.parentEdgeId) {
                    pairs.push({
                        n1,
                        n2,
                        d: this._dist(n1, n2)
                    });
                }
            }
        }

        // Sort pairs by distance (shortest first)
        pairs.sort((a, b) => a.d - b.d);

        for (const pair of pairs) {
            if (handledEdges.has(pair.n1.parentEdgeId) || handledEdges.has(pair.n2.parentEdgeId)) continue;
            if (handledNodes.has(pair.n1.id) || handledNodes.has(pair.n2.id)) continue;

            // Fuzzy search limit up to 15000mm as per requirements
            if (pair.d > 0.1 && pair.d < 15000) {
                const e1 = this.edges.find(e => e.id === pair.n1.parentEdgeId);
                const e2 = this.edges.find(e => e.id === pair.n2.parentEdgeId);

                // Extra check for Pass 2: Bore matching rules or component logic could go here,
                // but for now we just snap/insert pipe the closest open ends regardless of Line_Key.

                this._log(`Pass 2: Found global fuzzy gap of ${pair.d.toFixed(2)}mm between ${e1.type} and ${e2.type}`);
                this._prepareMutation(e1, e2, pair.n1, pair.n2, pair.d);

                handledEdges.add(pair.n1.parentEdgeId);
                handledEdges.add(pair.n2.parentEdgeId);
                handledNodes.add(pair.n1.id);
                handledNodes.add(pair.n2.id);
            }
        }

        return {
            revisedComponents: this.components,
            executionLog: this.executionLog,
            visualGaps: this.visualGaps
        };
    }

    applyApprovedMutations() {
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
        this.runSequentialPass();

        return {
            revisedComponents: this.components,
            executionLog: this.executionLog,
            visualGaps: this.visualGaps
        };
    }
}
