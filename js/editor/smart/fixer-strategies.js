/**
 * fixer-strategies.js — Modular fix strategies
 * Each strategy is independent and returns a modification object
 */

import { midpoint, distance3D, getMajorAxis, calculateElbowPosition } from './geometry-utils.js';
import { VALIDATOR_CONFIG } from './validator-config.js';

/**
 * Strategy: Snap two nodes together
 */
export function snapNodes(issue, nodes, config = VALIDATOR_CONFIG) {
    const node1 = nodes.find(n => n.id === issue.node1);
    const node2 = nodes.find(n => n.id === issue.node2);

    if (!node1 || !node2) return { success: false, error: 'Node not found' };

    // Check bore compatibility (unless bypassed for model errors)
    if (!issue.type.includes('MODEL_ERROR')) {
        if (Math.abs(issue.bore1 - issue.bore2) > config.fixer.boreTolerance) {
            return { success: false, error: 'Bore mismatch' };
        }
    }

    const mid = midpoint([node1.x, node1.y, node1.z], [node2.x, node2.y, node2.z]);

    return {
        success: true,
        action: 'snap',
        modifications: [
            { type: 'updateNode', nodeId: node1.id, updates: { x: mid[0], y: mid[1], z: mid[2], isModified: true } },
            { type: 'updateNode', nodeId: node2.id, updates: { x: mid[0], y: mid[1], z: mid[2], isModified: true } }
        ]
    };
}

/**
 * Strategy: Insert PIPE between nodes
 */
export function insertPipe(issue, nodes, config = VALIDATOR_CONFIG) {
    const node1 = nodes.find(n => n.id === issue.node1);
    const node2 = nodes.find(n => n.id === issue.node2);

    if (!node1 || !node2) return { success: false, error: 'Node not found' };

    const length = distance3D([node1.x, node1.y, node1.z], [node2.x, node2.y, node2.z]);

    if (length > config.fixer.maxSkewLength) {
        return { success: false, error: `Exceeds skew limit (${config.fixer.maxSkewLength}mm)` };
    }

    const bore = Math.max(issue.bore1, issue.bore2);

    return {
        success: true,
        action: 'insertPipe',
        modifications: [
            {
                type: 'addStick',
                stick: {
                    id: `PIPE_${Date.now()}`,
                    type: 'PIPE',
                    connectedNodes: [node1.id, node2.id],
                    data: { bore, length, type: 'PIPE', isGenerated: true, isModified: true }
                }
            }
        ]
    };
}

/**
 * Strategy: Insert ELBOW at direction change
 */
export function insertElbow(issue, nodes, config = VALIDATOR_CONFIG) {
    const node1 = nodes.find(n => n.id === issue.node1);
    const node2 = nodes.find(n => n.id === issue.node2);

    if (!node1 || !node2) return { success: false, error: 'Node not found' };

    const axis = getMajorAxis([node1.x, node1.y, node1.z], [node2.x, node2.y, node2.z]);
    const elbowPos = calculateElbowPosition([node1.x, node1.y, node1.z], [node2.x, node2.y, node2.z], axis);
    const bore = Math.max(issue.bore1, issue.bore2);

    const elbowNodeId = `ELBOW_${Date.now()}`;

    return {
        success: true,
        action: 'insertElbow',
        modifications: [
            { type: 'addNode', node: { id: elbowNodeId, x: elbowPos[0], y: elbowPos[1], z: elbowPos[2], bore, isGenerated: true, isModified: true, connectedSticks: [] } },
            { type: 'addStick', stick: { id: `PIPE_${Date.now()}_1`, type: 'PIPE', connectedNodes: [node1.id, elbowNodeId], data: { bore, type: 'PIPE', isGenerated: true } } },
            { type: 'addStick', stick: { id: `PIPE_${Date.now()}_2`, type: 'PIPE', connectedNodes: [elbowNodeId, node2.id], data: { bore, type: 'PIPE', isGenerated: true } } }
        ]
    };
}

/**
 * Strategy: Trim overlap by moving closest node to intersection
 */
export function trimOverlap(issue, nodes) {
    if (!issue.intersectionPoint) return { success: false, error: 'No intersection point' };

    // Find which node is closest to intersection
    const stick1Nodes = nodes.filter(n => issue.stick1 && n.connectedSticks?.includes(issue.stick1));
    const stick2Nodes = nodes.filter(n => issue.stick2 && n.connectedSticks?.includes(issue.stick2));

    let closestNode = null;
    let minDist = Infinity;

    [...stick1Nodes, ...stick2Nodes].forEach(node => {
        const dist = distance3D([node.x, node.y, node.z], issue.intersectionPoint);
        if (dist < minDist) {
            minDist = dist;
            closestNode = node;
        }
    });

    if (!closestNode) return { success: false, error: 'No node to trim' };

    return {
        success: true,
        action: 'trimOverlap',
        modifications: [
            {
                type: 'updateNode',
                nodeId: closestNode.id,
                updates: {
                    x: issue.intersectionPoint[0],
                    y: issue.intersectionPoint[1],
                    z: issue.intersectionPoint[2],
                    isModified: true
                }
            }
        ]
    };
}
