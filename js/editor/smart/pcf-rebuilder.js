/**
 * pcf-rebuilder.js — Rebuild PCF from modified geometry (< 100 lines)
 * Plug-and-play: import, call rebuildPCF()
 */

import { distance3D } from './geometry-utils.js';

/**
 * Rebuild PCF components from modified nodes/sticks
 * @param {Array} nodes - Modified nodes
 * @param {Array} sticks - Modified sticks
 * @returns {Array} PCF components ready for export
 */
export function rebuildPCF(nodes, sticks) {
    const components = [];
    const processedSticks = new Set();

    // Sort sticks by connectivity (start from endpoints)
    const orderedSticks = topologicalSort(nodes, sticks);

    orderedSticks.forEach((stick, index) => {
        if (processedSticks.has(stick.id)) return;

        const component = buildComponent(stick, nodes);
        if (component) {
            component.sequence = index + 1;
            components.push(component);
            processedSticks.add(stick.id);
        }
    });

    return components;
}

/**
 * Build single PCF component from stick
 */
function buildComponent(stick, nodes) {
    const connectedNodes = stick.connectedNodes || [];
    if (connectedNodes.length < 2) return null;

    const node1 = nodes.find(n => n.id === connectedNodes[0]);
    const node2 = nodes.find(n => n.id === connectedNodes[1]);

    if (!node1 || !node2) return null;

    const p1 = [node1.x, node1.y, node1.z];
    const p2 = [node2.x, node2.y, node2.z];
    const length = distance3D(p1, p2);
    const bore = stick.data?.bore || 100;

    return {
        type: stick.type || 'PIPE',
        points: [
            { x: p1[0], y: p1[1], z: p1[2], bore },
            { x: p2[0], y: p2[1], z: p2[2], bore }
        ],
        bore,
        length,
        isModified: stick.data?.isModified || node1.isModified || node2.isModified || false,
        attributes: buildAttributes(stick, length, bore)
    };
}

/**
 * Build component attributes
 */
function buildAttributes(stick, length, bore) {
    const attrs = {};
    const type = stick.type || 'PIPE';

    if (type === 'PIPE') {
        attrs['PIPE-LENGTH'] = length.toFixed(2);
    }

    attrs['BORE'] = bore.toFixed(2);

    // Copy existing attributes
    if (stick.data?.attributes) {
        Object.assign(attrs, stick.data.attributes);
    }

    return attrs;
}

/**
 * Simple topological sort (by distance from origin)
 */
function topologicalSort(nodes, sticks) {
    return sticks.slice().sort((a, b) => {
        const aStart = nodes.find(n => n.id === a.connectedNodes?.[0]);
        const bStart = nodes.find(n => n.id === b.connectedNodes?.[0]);

        if (!aStart || !bStart) return 0;

        const distA = Math.sqrt(aStart.x ** 2 + aStart.y ** 2 + aStart.z ** 2);
        const distB = Math.sqrt(bStart.x ** 2 + bStart.y ** 2 + bStart.z ** 2);

        return distA - distB;
    });
}

/**
 * Export PCF text from components
 */
export function exportPCFText(components) {
    const lines = ['ISOGEN-FILES', 'UNITS-MILLIMETERS', ''];

    components.forEach(comp => {
        lines.push(comp.type);

        comp.points?.forEach((p, idx) => {
            lines.push(`END-POINT ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)} ${comp.bore.toFixed(2)}`);
        });

        Object.entries(comp.attributes || {}).forEach(([key, value]) => {
            lines.push(`COMPONENT-ATTRIBUTE-${key} ${value}`);
        });

        lines.push('');
    });

    return lines.join('\n');
}
