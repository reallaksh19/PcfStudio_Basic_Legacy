// Basic helpers for traversing lines to find shared pipeline references
const getDist = (p1, p2) => {
  if (!p1 || !p2) return Infinity;
  const dx = parseFloat(p1.x) - parseFloat(p2.x);
  const dy = parseFloat(p1.y) - parseFloat(p2.y);
  const dz = parseFloat(p1.z) - parseFloat(p2.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export const autoAssignPipelineRefs = (dataTable) => {
    if (!Array.isArray(dataTable)) return { updatedTable: [], fixLog: [] };

    // We treat the table as a graph. Two components are connected if they share endpoints (within a small tolerance, say 25mm).
    // OLETs/TEEs connect via cp/bp but to keep it robust and simple for standard sequentially-ish or well-connected PCF,
    // we'll build an adjacency list based on euclidean proximity of ANY of their endpoints (ep1, ep2, cp, bp).

    const updatedTable = dataTable.map(r => ({ ...r }));
    const fixLog = [];

    const getPoints = (row) => {
        const pts = [];
        if (row.ep1) pts.push(row.ep1);
        if (row.ep2) pts.push(row.ep2);
        if (row.cp) pts.push(row.cp);
        if (row.bp) pts.push(row.bp);
        return pts;
    };

    const adjacency = new Map();
    updatedTable.forEach((r, i) => adjacency.set(i, []));

    // Build adjacency (O(N^2) but data is usually < 10,000, so it's fine for client-side a few times)
    for(let i = 0; i < updatedTable.length; i++) {
        const ptsA = getPoints(updatedTable[i]);
        if(ptsA.length === 0) continue;

        for(let j = i + 1; j < updatedTable.length; j++) {
            const ptsB = getPoints(updatedTable[j]);
            if(ptsB.length === 0) continue;

            let connected = false;
            for(const pA of ptsA) {
                for(const pB of ptsB) {
                    if (getDist(pA, pB) <= 25.0) {
                        connected = true;
                        break;
                    }
                }
                if (connected) break;
            }

            if (connected) {
                adjacency.get(i).push(j);
                adjacency.get(j).push(i);
            }
        }
    }

    // Find connected components (islands/branches)
    const visited = new Set();
    const islands = [];

    for (let i = 0; i < updatedTable.length; i++) {
        if (!visited.has(i)) {
            const island = [];
            const queue = [i];
            visited.add(i);

            while(queue.length > 0) {
                const curr = queue.shift();
                island.push(curr);

                for(const neighbor of adjacency.get(curr)) {
                    if(!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }
            islands.push(island);
        }
    }

    // Process each island
    let assignmentCount = 0;

    for (const island of islands) {
        // Collect all non-blank pipelineRefs in this island
        const refs = new Set();
        island.forEach(idx => {
            const ref = updatedTable[idx].pipelineRef;
            if (ref && ref.trim() !== '' && ref.trim().toUpperCase() !== 'UNKNOWN') {
                refs.add(ref.trim());
            }
        });

        // If island has exactly ONE unique valid pipelineRef
        if (refs.size === 1) {
            const targetRef = Array.from(refs)[0];

            // Assign to all blank ones
            island.forEach(idx => {
                const ref = updatedTable[idx].pipelineRef;
                if (!ref || ref.trim() === '' || ref.trim().toUpperCase() === 'UNKNOWN') {
                    updatedTable[idx].pipelineRef = targetRef;
                    assignmentCount++;
                }
            });
        }
    }

    if (assignmentCount > 0) {
        fixLog.push({ type: 'Applied/Fix', stage: 'AUTO_PIPELINE', message: `Assigned Pipeline Ref to ${assignmentCount} components based on branch aware logic.` });
    } else {
        fixLog.push({ type: 'Info', stage: 'AUTO_PIPELINE', message: 'No auto-assignable Pipeline Refs found (either fully populated or ambiguous).' });
    }

    return { updatedTable, fixLog };
};
