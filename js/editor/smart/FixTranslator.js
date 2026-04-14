/**
 * FixTranslator.js — Translate Smart Fixer actions to PCF modifications (< 100 lines)
 * Converts node/stick operations into component-level PCF changes
 */

import { distance3D } from './geometry-utils.js';

export class FixTranslator {
    constructor(components, nodes, sticks) {
        this.components = components;
        this.nodes = nodes;
        this.sticks = sticks;
        this.modifications = [];
    }

    /**
     * Translate fixer result to PCF modifications
     */
    translate(fixResult) {
        if (!fixResult.success) return [];

        fixResult.modifications.forEach(mod => {
            if (mod.type === 'updateNode') this.translateNodeUpdate(mod);
            else if (mod.type === 'addNode') this.translateNodeAdd(mod);
            else if (mod.type === 'addStick') this.translateStickAdd(mod);
        });

        return this.modifications;
    }

    /**
     * Translate node position update to endpoint update
     */
    translateNodeUpdate(mod) {
        const node = this.nodes.find(n => n.id === mod.nodeId);
        if (!node) return;

        const oldPos = { x: node.x, y: node.y, z: node.z };
        const newPos = { x: mod.updates.x, y: mod.updates.y, z: mod.updates.z };

        // Find all components using this node
        const affectedComps = this.findComponentsAtPoint(oldPos);

        affectedComps.forEach(comp => {
            this.modifications.push({
                type: 'updateEndpoint',
                componentId: comp.id,
                endpointId: this.getEndpointId(comp, oldPos),
                oldX: oldPos.x, oldY: oldPos.y, oldZ: oldPos.z,
                newX: newPos.x, newY: newPos.y, newZ: newPos.z
            });
        });
    }

    /**
     * Translate stick addition to component addition
     */
    translateStickAdd(mod) {
        const stick = mod.stick;
        if (!stick.connectedNodes || stick.connectedNodes.length < 2) return;

        const node1 = this.nodes.find(n => n.id === stick.connectedNodes[0]);
        const node2 = this.nodes.find(n => n.id === stick.connectedNodes[1]);

        if (!node1 || !node2) return;

        this.modifications.push({
            type: 'addComponent',
            componentType: stick.type || 'PIPE',
            endpoints: [
                { x: node1.x, y: node1.y, z: node1.z, bore: stick.data?.bore || 100 },
                { x: node2.x, y: node2.y, z: node2.z, bore: stick.data?.bore || 100 }
            ],
            attributes: this.buildAttributes(stick, node1, node2)
        });
    }

    /**
     * Translate node addition to component split or elbow
     */
    translateNodeAdd(mod) {
        const node = mod.node;

        // Check if this is an intermediate node (ELBOW)
        if (node.isGenerated && node.connectedSticks?.length === 2) {
            // This will be handled by the associated stick additions
            return;
        }

        // Handle other node additions if needed
    }

    /**
     * Build component attributes
     */
    buildAttributes(stick, node1, node2) {
        const attrs = {};
        const length = distance3D([node1.x, node1.y, node1.z], [node2.x, node2.y, node2.z]);

        if (stick.type === 'PIPE') {
            attrs['PIPE-LENGTH'] = length.toFixed(2);
        }

        attrs['BORE'] = (stick.data?.bore || 100).toFixed(2);

        // Copy existing attributes
        if (stick.data?.attributes) {
            Object.assign(attrs, stick.data.attributes);
        }

        return attrs;
    }

    /**
     * Find components that have endpoint at given position
     */
    findComponentsAtPoint(point, tolerance = 1.0) {
        return this.components.filter(comp => {
            return comp.endpoints?.some(ep =>
                Math.abs(ep.x - point.x) < tolerance &&
                Math.abs(ep.y - point.y) < tolerance &&
                Math.abs(ep.z - point.z) < tolerance
            );
        });
    }

    /**
     * Get endpoint identifier for a component at given position
     */
    getEndpointId(comp, point, tolerance = 1.0) {
        const index = comp.endpoints.findIndex(ep =>
            Math.abs(ep.x - point.x) < tolerance &&
            Math.abs(ep.y - point.y) < tolerance &&
            Math.abs(ep.z - point.z) < tolerance
        );
        return index >= 0 ? `${comp.id}-ep${index}` : null;
    }
}
