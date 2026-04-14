
/**
 * js/smart_fixer/core/geometry-fixer.js
 * Scratch-built detection logic for gaps and overlaps.
 * Sequential processing.
 */

const TOLERANCE = 6.0;
const MAX_FILLABLE_GAP = 5000.0; // max range we will attempt to fill

function distanceBetween(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

export function detectGapsAndOverlaps(components) {
    let newComponents = JSON.parse(JSON.stringify(components)); // deep clone to avoid modifying original safely

    // 1. Gather all potential connection points (nodes)
    const endPoints = [];

    newComponents.forEach((comp, idx) => {
        if (comp.type === 'MESSAGE-SQUARE' || !comp.points || comp.points.length === 0) return;

        // Add start point
        endPoints.push({
            compIdx: idx,
            pt: comp.points[0],
            isStart: true
        });

        // Add end point (or branch point for TEES, center for BENDS)
        if (comp.points.length > 1) {
            let endPt = comp.points[comp.points.length - 1];
            if (comp.type === 'BEND' && comp.points.length >= 2) {
                 endPt = comp.points[1];
            } else if (comp.type === 'TEE' && comp.points.length >= 3) {
                 endPt = comp.points[2]; // branch
                 // Also add run end for tee
                 endPoints.push({
                     compIdx: idx,
                     pt: comp.points[1],
                     isStart: false
                 });
            }

            endPoints.push({
                compIdx: idx,
                pt: endPt,
                isStart: false
            });
        }
    });

    // 2. Pair up endpoints that are close to each other
    // If an endpoint has no partner within TOLERANCE, it's an "open" terminal
    const terminals = [];
    const used = new Set();

    for (let i = 0; i < endPoints.length; i++) {
        if (used.has(i)) continue;

        let foundMatch = false;
        for (let j = i + 1; j < endPoints.length; j++) {
            if (used.has(j)) continue;

            const dist = distanceBetween(endPoints[i].pt, endPoints[j].pt);
            if (dist <= TOLERANCE) {
                // They connect. Mark both as used.
                used.add(i);
                used.add(j);
                foundMatch = true;
                break;
            }
        }

        if (!foundMatch) {
            terminals.push({
                ...endPoints[i],
                originalId: i
            });
        }
    }

    // 3. Match terminals to find Gaps
    // For each open end, look for the closest open start within MAX_FILLABLE_GAP
    const matchedTerminals = new Set();

    terminals.forEach((t1, i) => {
        if (matchedTerminals.has(i)) return;

        let bestMatchIdx = -1;
        let minGapDist = MAX_FILLABLE_GAP + 1;

        for (let j = 0; j < terminals.length; j++) {
            if (i === j || matchedTerminals.has(j)) continue;

            const t2 = terminals[j];
            if (t1.compIdx === t2.compIdx) continue; // Don't connect a component to itself

            const dist = distanceBetween(t1.pt, t2.pt);
            if (dist > TOLERANCE && dist < minGapDist) {
                minGapDist = dist;
                bestMatchIdx = j;
            }
        }

        if (bestMatchIdx !== -1) {
            // Found a gap to fill!
            matchedTerminals.add(i);
            matchedTerminals.add(bestMatchIdx);

            const t2 = terminals[bestMatchIdx];
            const c1 = newComponents[t1.compIdx];

            const dx = t2.pt.x - t1.pt.x;
            const dy = t2.pt.y - t1.pt.y;
            const dz = t2.pt.z - t1.pt.z;

            const isSingleAxis = (Math.abs(dx) > 0.1 && Math.abs(dy) < 0.1 && Math.abs(dz) < 0.1) ||
                                 (Math.abs(dx) < 0.1 && Math.abs(dy) > 0.1 && Math.abs(dz) < 0.1) ||
                                 (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1 && Math.abs(dz) > 0.1);

            c1._gapTarget = { ...t2.pt };
            c1._hasUnappliedFix = true;

            if (isSingleAxis) {
                c1.fixingAction = `GAP_FILL: Stretch ${minGapDist.toFixed(2)}mm`;
            } else {
                c1.fixingAction = `GAP_FILL: Insert PIPE ${minGapDist.toFixed(2)}mm`;
            }
        }
    });

    return newComponents;
}
