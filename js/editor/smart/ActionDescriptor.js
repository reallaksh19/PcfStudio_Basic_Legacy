/**
 * ActionDescriptor.js — Generate human-readable fixing action descriptions (< 100 lines)
 * Creates detailed descriptions for data table "Fixing Action" column
 */

/**
 * Generate fixing action description for an issue
 */
export function generateActionDescription(issue, components, nodes) {
    if (!issue) return '';

    switch (issue.type) {
        case 'BROKEN_CONNECTION':
            return describeBrokenConnectionFix(issue, components, nodes);
        case 'MODEL_ERROR':
            return describeModelErrorFix(issue, components, nodes);
        case 'OVERLAP':
            return describeOverlapFix(issue, components, nodes);
        default:
            return 'Unknown action';
    }
}

/**
 * Describe broken connection fix action
 */
function describeBrokenConnectionFix(issue, components, nodes) {
    const comp1 = findComponentAtPoint(components, issue.position1);
    const comp2 = findComponentAtPoint(components, issue.position2);
    const gap = issue.gap.toFixed(2);

    if (issue.gap <= 6.0) {
        // Snap action - exactly matching required syntax
        const midX = ((issue.position1[0] + issue.position2[0]) / 2).toFixed(2);
        const midY = ((issue.position1[1] + issue.position2[1]) / 2).toFixed(2);
        const midZ = ((issue.position1[2] + issue.position2[2]) / 2).toFixed(2);
        const halfGap = (issue.gap / 2).toFixed(2);

        return `SNAP: Merge endpoints to midpoint\n` +
               `  ${comp1?.type || 'PIPE'} EP2: Move ${halfGap}mm → (${midX}, ${midY}, ${midZ})\n` +
               `  ${comp2?.type || 'PIPE'} EP1: Move ${halfGap}mm → (${midX}, ${midY}, ${midZ})`;
    } else {
        // Insert pipe action - exactly matching required syntax
        const [x1, y1, z1] = issue.position1;
        const [x2, y2, z2] = issue.position2;

        return `INSERT PIPE: Fill ${gap}mm gap\n` +
               `  New component: PIPE\n` +
               `  EP1: (${x1.toFixed(2)}, ${y1.toFixed(2)}, ${z1.toFixed(2)})\n` +
               `  EP2: (${x2.toFixed(2)}, ${y2.toFixed(2)}, ${z2.toFixed(2)})\n` +
               `  Length: ${gap}mm, Bore: ${issue.bore1?.toFixed(2) || '100.00'}mm`;
    }
}

/**
 * Describe model error fix action
 */
function describeModelErrorFix(issue, components, nodes) {
    const gap = issue.gap.toFixed(2);
    const comp1 = findComponentAtPoint(components, issue.position1);
    const comp2 = findComponentAtPoint(components, issue.position2);

    if (issue.gap <= 6.0) {
        // EXTEND action - exactly matching required syntax
        const halfGap = (issue.gap / 2).toFixed(2);
        return `SNAP: Close ${gap}mm gap (below tolerance)\n` +
               `  ${comp1?.type || 'PIPE'} EP2: Extend ${halfGap}mm\n` +
               `  ${comp2?.type || 'PIPE'} EP1: Extend ${halfGap}mm`;
    } else {
        // FILL GAP action - exactly matching required syntax
        const [x1, y1, z1] = issue.position1;
        const [x2, y2, z2] = issue.position2;

        return `FILL GAP: Insert connector for ${gap}mm gap\n` +
               `  Gap exceeds 2×bore threshold\n` +
               `  From: (${x1.toFixed(2)}, ${y1.toFixed(2)}, ${z1.toFixed(2)})\n` +
               `  To: (${x2.toFixed(2)}, ${y2.toFixed(2)}, ${z2.toFixed(2)})`;
    }
}

/**
 * Describe overlap fix action
 */
function describeOverlapFix(issue, components, nodes) {
    const depth = issue.overlapDepth.toFixed(2);
    const comp1 = components.find(c => c.id === issue.stick1);
    const comp2 = components.find(c => c.id === issue.stick2);
    const [intX, intY, intZ] = issue.intersectionPoint;

    // REVIEW REQUIRED action - exactly matching required syntax
    if (!issue.boresMatch) {
        return `REVIEW REQUIRED: ${depth}mm overlap detected\n` +
               `  ${comp1?.type || 'PIPE'} (bore ${issue.bore1?.toFixed(2) || '0.00'}mm)\n` +
               `  ${comp2?.type || 'PIPE'} (bore ${issue.bore2?.toFixed(2) || '0.00'}mm)\n` +
               `  Different bores - manual review needed`;
    }

    // Find which component to trim
    const comp1Eps = comp1?.endpoints || [];
    const comp2Eps = comp2?.endpoints || [];

    const dist1 = comp1Eps.map(ep =>
        Math.sqrt((ep.x - intX)**2 + (ep.y - intY)**2 + (ep.z - intZ)**2)
    );
    const dist2 = comp2Eps.map(ep =>
        Math.sqrt((ep.x - intX)**2 + (ep.y - intY)**2 + (ep.z - intZ)**2)
    );

    const minDist1 = Math.min(...dist1);
    const minDist2 = Math.min(...dist2);
    const epIndex1 = dist1.indexOf(minDist1);
    const epIndex2 = dist2.indexOf(minDist2);

    // TRIM action - exactly matching required syntax with "by XXmm" format
    if (minDist1 < minDist2) {
        return `TRIM: Reduce by ${depth}mm\n` +
               `  Endpoint ${epIndex1 + 1}: Move to intersection\n` +
               `  New coord: (${intX.toFixed(2)}, ${intY.toFixed(2)}, ${intZ.toFixed(2)})\n` +
               `  Overlap with ${comp2?.type || 'PIPE'} resolved`;
    } else {
        return `TRIM: Reduce by ${depth}mm\n` +
               `  Endpoint ${epIndex2 + 1}: Move to intersection\n` +
               `  New coord: (${intX.toFixed(2)}, ${intY.toFixed(2)}, ${intZ.toFixed(2)})\n` +
               `  Overlap with ${comp1?.type || 'PIPE'} resolved`;
    }
}

/**
 * Find component that has endpoint at given position
 */
function findComponentAtPoint(components, position, tolerance = 1.0) {
    if (!position || !components) return null;
    const [x, y, z] = position;

    return components.find(comp => {
        return comp.endpoints?.some(ep =>
            Math.abs(ep.x - x) < tolerance &&
            Math.abs(ep.y - y) < tolerance &&
            Math.abs(ep.z - z) < tolerance
        );
    });
}
