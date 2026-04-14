/**
 * PCFSyncEngine.js — Bidirectional PCF Synchronization Engine (< 100 lines)
 * Maintains consistency between PCF text, data table, and 3D geometry
 */

import { PCFComponent, DataTableRow } from './pcf-models.js';

export class PCFSyncEngine {
    constructor() {
        this.components = [];
        this.dataTable = [];
        this.dirtyFlags = { text: false, table: false, geometry: false };
    }

    /**
     * Load from PCF text (primary source)
     */
    loadFromText(pcfText) {
        const parsedComponents = this.parsePCFText(pcfText);
        this.components = parsedComponents.map(p => PCFComponent.fromParsedComponent(p));
        this.resequence();
        this.markDirty('table', 'geometry');
        return this.components;
    }

    /**
     * Load from parsed components array
     */
    loadFromComponents(parsedComponents) {
        this.components = parsedComponents.map(p =>
            p instanceof PCFComponent ? p : PCFComponent.fromParsedComponent(p)
        );
        this.resequence();
        this.markDirty('text', 'table', 'geometry');
        return this.components;
    }

    /**
     * Apply modifications from smart fixer
     */
    applyModifications(modifications) {
        modifications.forEach(mod => {
            if (mod.type === 'updateEndpoint') this.updateEndpoint(mod);
            else if (mod.type === 'addComponent') this.addComponent(mod);
            else if (mod.type === 'deleteComponent') this.deleteComponent(mod);
            else if (mod.type === 'mergeEndpoints') this.mergeEndpoints(mod);
        });

        this.resequence();
        this.markDirty('text', 'table', 'geometry');
        return this.components;
    }

    /**
     * Update component endpoint
     */
    updateEndpoint(mod) {
        const comp = this.findComponentByEndpoint(mod.endpointId);
        if (!comp) return;

        const epIndex = comp.endpoints.findIndex(ep =>
            Math.abs(ep.x - mod.oldX) < 1 && Math.abs(ep.y - mod.oldY) < 1 && Math.abs(ep.z - mod.oldZ) < 1
        );

        if (epIndex >= 0) {
            comp.endpoints[epIndex] = { x: mod.newX, y: mod.newY, z: mod.newZ, bore: comp.getBore() };
            comp.isModified = true;
        }
    }

    /**
     * Add new component
     */
    addComponent(mod) {
        const newComp = new PCFComponent({
            type: mod.componentType || 'PIPE',
            endpoints: mod.endpoints || [],
            attributes: mod.attributes || {},
            isGenerated: true,
            isModified: true
        });
        this.components.push(newComp);
    }

    /**
     * Delete component
     */
    deleteComponent(mod) {
        this.components = this.components.filter(c => c.id !== mod.componentId);
    }

    /**
     * Merge two endpoints (snap fix)
     */
    mergeEndpoints(mod) {
        const midX = (mod.ep1.x + mod.ep2.x) / 2;
        const midY = (mod.ep1.y + mod.ep2.y) / 2;
        const midZ = (mod.ep1.z + mod.ep2.z) / 2;

        this.components.forEach(comp => {
            comp.endpoints.forEach(ep => {
                if (this.pointsMatch(ep, mod.ep1) || this.pointsMatch(ep, mod.ep2)) {
                    ep.x = midX; ep.y = midY; ep.z = midZ;
                    comp.isModified = true;
                }
            });
        });
    }

    /**
     * Generate PCF text output
     */
    toPCFText() {
        const lines = ['ISOGEN-FILES', 'UNITS-MILLIMETERS', ''];
        this.components.forEach(comp => {
            lines.push(comp.toPCFText(), '');
        });
        this.dirtyFlags.text = false;
        return lines.join('\n');
    }

    /**
     * Generate data table
     */
    toDataTable() {
        this.dataTable = this.components.map(c => new DataTableRow(c));
        this.dirtyFlags.table = false;
        return this.dataTable;
    }

    // Helper methods
    resequence() { this.components.forEach((c, i) => c.sequence = i + 1); }
    markDirty(...targets) { targets.forEach(t => this.dirtyFlags[t] = true); }
    pointsMatch(p1, p2, tol = 0.1) { return Math.abs(p1.x - p2.x) < tol && Math.abs(p1.y - p2.y) < tol && Math.abs(p1.z - p2.z) < tol; }
    findComponentByEndpoint(epId) { return this.components.find(c => c.endpoints.some(ep => ep.id === epId)); }
    parsePCFText(text) { return []; } // Delegate to existing parser
}
