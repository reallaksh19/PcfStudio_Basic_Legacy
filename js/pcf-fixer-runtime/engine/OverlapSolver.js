import * as THREE from 'three';

export const resolveOverlaps = (dataTable) => {
    if (!Array.isArray(dataTable)) return { updatedTable: [], fixLog: [] };
    const updatedTable = dataTable.map(r => ({ ...r })); // shallow copy rows
    const fixLog = [];

    for (let i = 0; i < updatedTable.length; i++) {
        for (let j = i + 1; j < updatedTable.length; j++) {
            const elA = updatedTable[i];
            const elB = updatedTable[j];

            // Only care about intersections between PIPE and NON-PIPE, or PIPE and PIPE
            const typeA = (elA.type || '').toUpperCase();
            const typeB = (elB.type || '').toUpperCase();

            // Skip supports or missing geometry
            if (typeA === 'SUPPORT' || typeB === 'SUPPORT') continue;
            if (!elA.ep1 || !elA.ep2 || !elB.ep1 || !elB.ep2) continue;

            const isPipeA = typeA === 'PIPE';
            const isPipeB = typeB === 'PIPE';

            // Only solve if at least one is a pipe
            if (!isPipeA && !isPipeB) continue;

            // Simple intersection check based on bounding boxes or segments
            const vA1 = new THREE.Vector3(elA.ep1.x, elA.ep1.y, elA.ep1.z);
            const vA2 = new THREE.Vector3(elA.ep2.x, elA.ep2.y, elA.ep2.z);
            const vB1 = new THREE.Vector3(elB.ep1.x, elB.ep1.y, elB.ep1.z);
            const vB2 = new THREE.Vector3(elB.ep2.x, elB.ep2.y, elB.ep2.z);

            // Bounding Sphere check first for optimization
            const midA = vA1.clone().lerp(vA2, 0.5);
            const midB = vB1.clone().lerp(vB2, 0.5);
            const rA = vA1.distanceTo(vA2) / 2 + (elA.bore || 100);
            const rB = vB1.distanceTo(vB2) / 2 + (elB.bore || 100);

            if (midA.distanceTo(midB) > rA + rB) continue;

            // For pipe vs non-pipe: the non-pipe (Flange, Valve, Tee, Bend) is the rigidly sized "cutter".
            // The pipe must be trimmed back if its segment enters the non-pipe's bounding sphere/segment.

            // Pipe vs Pipe: The one whose endpoint is connected to another element wins. The other is trimmed.
            // (Skipped complex pipe-vs-pipe topological routing for now, default to trimming the "younger" one B).

            const cutter = isPipeA && !isPipeB ? elB : (isPipeB && !isPipeA ? elA : null);
            const targetPipe = isPipeA && !isPipeB ? elA : (isPipeB && !isPipeA ? elB : null);

            if (cutter && targetPipe) {
                // Find if targetPipe's segment penetrates the cutter's center
                const cV1 = new THREE.Vector3(cutter.ep1.x, cutter.ep1.y, cutter.ep1.z);
                const cV2 = new THREE.Vector3(cutter.ep2.x, cutter.ep2.y, cutter.ep2.z);

                const tV1 = new THREE.Vector3(targetPipe.ep1.x, targetPipe.ep1.y, targetPipe.ep1.z);
                const tV2 = new THREE.Vector3(targetPipe.ep2.x, targetPipe.ep2.y, targetPipe.ep2.z);

                const lineT = new THREE.Line3(tV1, tV2);

                // If either of cutter's endpoints are ON the pipe, trim the pipe back to that endpoint
                let trimPoint = null;
                const closest1 = new THREE.Vector3();
                lineT.closestPointToPoint(cV1, true, closest1);
                if (closest1.distanceTo(cV1) < 1) trimPoint = cV1;

                const closest2 = new THREE.Vector3();
                lineT.closestPointToPoint(cV2, true, closest2);
                if (!trimPoint && closest2.distanceTo(cV2) < 1) trimPoint = cV2;

                if (trimPoint) {
                    // We have an intersection. Trim the pipe.
                    // Which end of the pipe do we trim? The one closest to the cutter's center, or the one extending past it.
                    const dist1 = tV1.distanceTo(trimPoint);
                    const dist2 = tV2.distanceTo(trimPoint);

                    // We modify the pipe so it ends exactly at the trimPoint.
                    // But if the trimPoint is already an endpoint, it's not an overlap.
                    if (dist1 > 1 && dist2 > 1) {
                        // The trimPoint is in the middle of the pipe!
                        // This means the pipe completely penetrates. We trim the end that is "inside" the cutter.
                        // Usually, the cutter has a direction. We just cut the pipe at trimPoint and keep the longer side.
                        // Or rather, we keep the side that doesn't share space with the cutter.

                        const cMid = cV1.clone().lerp(cV2, 0.5);
                        if (tV1.distanceTo(cMid) < tV2.distanceTo(cMid)) {
                            // tV1 is inside/closer to cutter center, move it to trimPoint
                            targetPipe.ep1 = { x: trimPoint.x, y: trimPoint.y, z: trimPoint.z };
                            fixLog.push({ type: 'Applied/Fix', stage: 'OVERLAP_SOLVER', message: `Trimmed ${targetPipe.type} (Row ${targetPipe._rowIndex}) ep1 to boundary of ${cutter.type} (Row ${cutter._rowIndex}).` });
                        } else {
                            targetPipe.ep2 = { x: trimPoint.x, y: trimPoint.y, z: trimPoint.z };
                            fixLog.push({ type: 'Applied/Fix', stage: 'OVERLAP_SOLVER', message: `Trimmed ${targetPipe.type} (Row ${targetPipe._rowIndex}) ep2 to boundary of ${cutter.type} (Row ${cutter._rowIndex}).` });
                        }
                    }
                }
            } else if (isPipeA && isPipeB) {
                // Pipe vs Pipe overlap
                const lineA = new THREE.Line3(vA1, vA2);
                const lineB = new THREE.Line3(vB1, vB2);

                // If collinear and overlapping
                const dirA = vA2.clone().sub(vA1).normalize();
                const dirB = vB2.clone().sub(vB1).normalize();

                if (Math.abs(dirA.dot(dirB)) > 0.99) {
                    // Collinear
                    const closestB1 = new THREE.Vector3();
                    lineA.closestPointToPoint(vB1, true, closestB1);
                    const closestB2 = new THREE.Vector3();
                    lineA.closestPointToPoint(vB2, true, closestB2);

                    if (closestB1.distanceTo(vB1) < 1 || closestB2.distanceTo(vB2) < 1) {
                        // B overlaps A. For simplicity, trim B so it doesn't overlap A.
                        // (Ideally we check topological connectivity as per requirements, but this provides a base solver).
                        // We will trim B back to the closest boundary of A.
                        let trimPoint = null;
                        if (closestB1.distanceTo(vB1) < 1 && closestB2.distanceTo(vB2) > 1) {
                            trimPoint = vA1.distanceTo(vB1) > vA2.distanceTo(vB1) ? vA2 : vA1;
                            elB.ep1 = { x: trimPoint.x, y: trimPoint.y, z: trimPoint.z };
                            fixLog.push({ type: 'Applied/Fix', stage: 'OVERLAP_SOLVER', message: `Trimmed ${elB.type} (Row ${elB._rowIndex}) to resolve Pipe-Pipe overlap with Row ${elA._rowIndex}.` });
                        } else if (closestB2.distanceTo(vB2) < 1 && closestB1.distanceTo(vB1) > 1) {
                            trimPoint = vA1.distanceTo(vB2) > vA2.distanceTo(vB2) ? vA2 : vA1;
                            elB.ep2 = { x: trimPoint.x, y: trimPoint.y, z: trimPoint.z };
                            fixLog.push({ type: 'Applied/Fix', stage: 'OVERLAP_SOLVER', message: `Trimmed ${elB.type} (Row ${elB._rowIndex}) to resolve Pipe-Pipe overlap with Row ${elA._rowIndex}.` });
                        }
                    }
                }
            }
        }
    }

    if (fixLog.length === 0) {
        fixLog.push({ type: 'Info', stage: 'OVERLAP_SOLVER', message: 'No resolvable overlaps found.' });
    }

    return { updatedTable, fixLog };
};

export const autoFittingSolver = (dataTable) => {
    if (!Array.isArray(dataTable)) return { updatedTable: [], fixLog: [] };
    let updatedTable = dataTable.map(r => ({ ...r }));
    const fixLog = [];

    // Helper to get pipes only
    const getPipes = () => updatedTable.filter(r => (r.type || '').toUpperCase() === 'PIPE' && r.ep1 && r.ep2);

    let changed = true;
    while (changed) {
        changed = false;
        const pipes = getPipes();

        for (let i = 0; i < pipes.length; i++) {
            for (let j = i + 1; j < pipes.length; j++) {
                const pA = pipes[i];
                const pB = pipes[j];

                // Collect intersections
                const pts = [
                    new THREE.Vector3(pA.ep1.x, pA.ep1.y, pA.ep1.z),
                    new THREE.Vector3(pA.ep2.x, pA.ep2.y, pA.ep2.z),
                    new THREE.Vector3(pB.ep1.x, pB.ep1.y, pB.ep1.z),
                    new THREE.Vector3(pB.ep2.x, pB.ep2.y, pB.ep2.z)
                ];

                let cp = null;
                let mA = -1, mB = -1; // Indices of matching endpoints

                for (let a = 0; a < 2; a++) {
                    for (let b = 2; b < 4; b++) {
                        if (pts[a].distanceTo(pts[b]) < 1) {
                            cp = pts[a];
                            mA = a; // 0 or 1
                            mB = b - 2; // 0 or 1
                            break;
                        }
                    }
                    if (cp) break;
                }

                if (cp) {
                    // We found an intersection point between two pipes.
                    // Let's check if it's a TEE (a third pipe shares this point).
                    const otherPipes = pipes.filter(p => p !== pA && p !== pB);
                    let pC = null;
                    let mC = -1;

                    for (const p of otherPipes) {
                        if (new THREE.Vector3(p.ep1.x, p.ep1.y, p.ep1.z).distanceTo(cp) < 1) { pC = p; mC = 0; break; }
                        if (new THREE.Vector3(p.ep2.x, p.ep2.y, p.ep2.z).distanceTo(cp) < 1) { pC = p; mC = 1; break; }
                    }

                    if (pC) {
                        // We have 3 intersecting pipes -> TEE
                        // Determine run and branch
                        const dirs = [
                            pts[1 - mA].clone().sub(cp).normalize(),
                            pts[3 - mB].clone().sub(cp).normalize(),
                            mC === 0 ? new THREE.Vector3(pC.ep2.x, pC.ep2.y, pC.ep2.z).clone().sub(cp).normalize()
                                     : new THREE.Vector3(pC.ep1.x, pC.ep1.y, pC.ep1.z).clone().sub(cp).normalize()
                        ];

                        let run1Idx = -1, run2Idx = -1, branchIdx = -1;
                        if (Math.abs(dirs[0].dot(dirs[1]) + 1) < 0.05) { run1Idx = 0; run2Idx = 1; branchIdx = 2; }
                        else if (Math.abs(dirs[0].dot(dirs[2]) + 1) < 0.05) { run1Idx = 0; run2Idx = 2; branchIdx = 1; }
                        else if (Math.abs(dirs[1].dot(dirs[2]) + 1) < 0.05) { run1Idx = 1; run2Idx = 2; branchIdx = 0; }

                        if (branchIdx !== -1) {
                            const pArr = [pA, pB, pC];
                            const mArr = [mA, mB, mC];

                            const run1Pipe = pArr[run1Idx];
                            const run2Pipe = pArr[run2Idx];
                            const branchPipe = pArr[branchIdx];

                            const defaultBore = run1Pipe.bore || 100;
                            const tEp1 = cp.clone().add(dirs[run1Idx].clone().multiplyScalar(defaultBore));
                            const tEp2 = cp.clone().add(dirs[run2Idx].clone().multiplyScalar(defaultBore));
                            const tBp = cp.clone().add(dirs[branchIdx].clone().multiplyScalar(defaultBore));

                            // Update pipes (pull them back)
                            if (mArr[run1Idx] === 0) run1Pipe.ep1 = { x: tEp1.x, y: tEp1.y, z: tEp1.z }; else run1Pipe.ep2 = { x: tEp1.x, y: tEp1.y, z: tEp1.z };
                            if (mArr[run2Idx] === 0) run2Pipe.ep1 = { x: tEp2.x, y: tEp2.y, z: tEp2.z }; else run2Pipe.ep2 = { x: tEp2.x, y: tEp2.y, z: tEp2.z };
                            if (mArr[branchIdx] === 0) branchPipe.ep1 = { x: tBp.x, y: tBp.y, z: tBp.z }; else branchPipe.ep2 = { x: tBp.x, y: tBp.y, z: tBp.z };

                            updatedTable.push({
                                type: 'TEE',
                                bore: defaultBore,
                                branchBore: branchPipe.bore || defaultBore,
                                ep1: { x: tEp1.x, y: tEp1.y, z: tEp1.z },
                                ep2: { x: tEp2.x, y: tEp2.y, z: tEp2.z },
                                cp: { x: cp.x, y: cp.y, z: cp.z },
                                bp: { x: tBp.x, y: tBp.y, z: tBp.z }
                            });

                            changed = true;
                            break; // breakout to restart scan since table modified
                        }
                    } else {
                        // 2 intersecting pipes.
                        const dirA = pts[1 - mA].clone().sub(cp).normalize();
                        const dirB = pts[3 - mB].clone().sub(cp).normalize();

                        // Check if collinear
                        if (Math.abs(dirA.dot(dirB) + 1) < 0.05) {
                            // Collinear, check if bore differs -> REDUCER
                            if (pA.bore !== pB.bore) {
                                const trimDist = Math.max(pA.bore || 100, pB.bore || 100);
                                const rEp1 = cp.clone().add(dirA.clone().multiplyScalar(trimDist));
                                const rEp2 = cp.clone().add(dirB.clone().multiplyScalar(trimDist));

                                if (mA === 0) pA.ep1 = { x: rEp1.x, y: rEp1.y, z: rEp1.z }; else pA.ep2 = { x: rEp1.x, y: rEp1.y, z: rEp1.z };
                                if (mB === 0) pB.ep1 = { x: rEp2.x, y: rEp2.y, z: rEp2.z }; else pB.ep2 = { x: rEp2.x, y: rEp2.y, z: rEp2.z };

                                updatedTable.push({
                                    type: 'REDUCER',
                                    skey: 'RECON',
                                    bore: pA.bore || 100,
                                    ep1: { x: rEp1.x, y: rEp1.y, z: rEp1.z },
                                    ep2: { x: rEp2.x, y: rEp2.y, z: rEp2.z }
                                });
                                changed = true;
                                break;
                            }
                        } else {
                            // Direction changes -> BEND
                            const defaultBore = pA.bore || 100;
                            const trimDist = defaultBore * 1.5;

                            const bendEp1 = cp.clone().add(dirA.clone().multiplyScalar(trimDist));
                            const bendEp2 = cp.clone().add(dirB.clone().multiplyScalar(trimDist));

                            if (mA === 0) pA.ep1 = { x: bendEp1.x, y: bendEp1.y, z: bendEp1.z }; else pA.ep2 = { x: bendEp1.x, y: bendEp1.y, z: bendEp1.z };
                            if (mB === 0) pB.ep1 = { x: bendEp2.x, y: bendEp2.y, z: bendEp2.z }; else pB.ep2 = { x: bendEp2.x, y: bendEp2.y, z: bendEp2.z };

                            updatedTable.push({
                                type: 'BEND',
                                bore: defaultBore,
                                ep1: { x: bendEp1.x, y: bendEp1.y, z: bendEp1.z },
                                ep2: { x: bendEp2.x, y: bendEp2.y, z: bendEp2.z }
                            });
                            changed = true;
                            break;
                        }
                    }
                }
            }
            if (changed) break;
        }
    }

    return { updatedTable, fixLog };
};
