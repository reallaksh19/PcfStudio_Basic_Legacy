/**
 * IntegratedValidator.js — Complete validation & fix pipeline with PCF sync
 * Orchestrates: Detect → Fix → Translate → Update PCF/Table (< 100 lines)
 */

import { SmartValidatorCore } from './SmartValidatorCore.js';
import { SmartFixerCore } from './SmartFixerCore.js';
import { PCFSyncEngine } from './PCFSyncEngine.js';
import { FixTranslator } from './FixTranslator.js';
import { VALIDATOR_CONFIG } from './validator-config.js';
import { generateActionDescription } from './ActionDescriptor.js';

export class IntegratedValidator {
    constructor(config = VALIDATOR_CONFIG) {
        this.validator = new SmartValidatorCore(config);
        this.fixer = new SmartFixerCore(config);
        this.syncEngine = new PCFSyncEngine();
        this.config = config;
    }

    /**
     * Initialize from PCF text (primary entry point)
     */
    loadFromPCFText(pcfText, existingParser) {
        // Use existing PCF parser if provided
        if (existingParser) {
            const parsed = existingParser(pcfText);
            this.syncEngine.loadFromComponents(parsed);
        } else {
            this.syncEngine.loadFromText(pcfText);
        }

        return this.syncEngine.components;
    }

    /**
     * Run complete validation and populate fixing actions
     */
    validate() {
        const components = this.syncEngine.components;

        // Extract nodes and sticks from components for validation
        const { nodes, sticks } = this.extractGeometry(components);

        // Run validation
        const issues = this.validator.validate({ nodes, sticks });

        // Populate fixing actions on affected components
        this.populateFixingActions(issues, components, nodes);

        return issues;
    }

    /**
     * Populate fixing action descriptions on components
     */
    populateFixingActions(issues, components, nodes) {
        // Clear existing actions
        components.forEach(comp => comp.fixingAction = '');

        // Map issues to affected components
        issues.forEach(issue => {
            const actionDesc = generateActionDescription(issue, components, nodes);

            // Find affected components by proximity to issue positions
            if (issue.position1) {
                const comp1 = this.findComponentAtPoint(components, issue.position1);
                if (comp1 && !comp1.fixingAction) {
                    comp1.fixingAction = actionDesc;
                }
            }

            if (issue.position2) {
                const comp2 = this.findComponentAtPoint(components, issue.position2);
                if (comp2 && !comp2.fixingAction && comp2.id !== this.findComponentAtPoint(components, issue.position1)?.id) {
                    comp2.fixingAction = actionDesc;
                }
            }

            // For overlaps, mark both components
            if (issue.stick1 && issue.stick2) {
                const comp1 = components.find(c => c.id === issue.stick1);
                const comp2 = components.find(c => c.id === issue.stick2);
                if (comp1) comp1.fixingAction = actionDesc;
                if (comp2 && comp2.id !== comp1?.id) comp2.fixingAction = actionDesc;
            }
        });
    }

    /**
     * Find component at given point
     */
    findComponentAtPoint(components, position, tolerance = 1.0) {
        if (!position) return null;
        const [x, y, z] = position;

        return components.find(comp => {
            return comp.endpoints?.some(ep =>
                Math.abs(ep.x - x) < tolerance &&
                Math.abs(ep.y - y) < tolerance &&
                Math.abs(ep.z - z) < tolerance
            );
        });
    }

    /**
     * Apply fix and update all representations
     */
    async applyFix(issue) {
        const components = this.syncEngine.components;
        const { nodes, sticks } = this.extractGeometry(components);

        // Apply fix to geometry
        const fixResult = this.fixer.fixIssue(issue, { nodes, sticks });

        if (!fixResult.success) {
            return { success: false, error: fixResult.error };
        }

        // Translate geometry changes to PCF modifications
        const translator = new FixTranslator(components, nodes, sticks);
        const pcfModifications = translator.translate(fixResult);

        // Apply modifications to sync engine
        this.syncEngine.applyModifications(pcfModifications);

        // Generate updated outputs
        const updatedPCF = this.syncEngine.toPCFText();
        const updatedTable = this.syncEngine.toDataTable();

        return {
            success: true,
            action: fixResult.action,
            pcfText: updatedPCF,
            dataTable: updatedTable,
            components: this.syncEngine.components
        };
    }

    /**
     * Apply multiple fixes at once
     */
    async applyMultipleFixes(issues) {
        const results = [];

        for (const issue of issues) {
            const result = await this.applyFix(issue);
            results.push(result);
        }

        return {
            total: issues.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        };
    }

    /**
     * Get current state
     */
    getCurrentState() {
        return {
            pcfText: this.syncEngine.toPCFText(),
            dataTable: this.syncEngine.toDataTable(),
            components: this.syncEngine.components
        };
    }

    /**
     * Extract geometry (nodes/sticks) from PCF components
     */
    extractGeometry(components) {
        console.log(`[extractGeometry] Processing ${components.length} components`);
        const nodes = [];
        const sticks = [];
        const nodeMap = new Map();

        let nodeIdCounter = 0;

        components.forEach((comp, compIndex) => {
            const compNodes = [];

            // Log endpoints to trace missing data
            if (!comp.endpoints && !comp.points) {
                // If the app uses points instead of endpoints
            }

            // In the 3d smart fixer, endpoints are often stored in 'points' array.
            const eps = comp.endpoints || comp.points || [];

            eps.forEach((ep, epIndex) => {
                const key = `${ep.x.toFixed(1)},${ep.y.toFixed(1)},${ep.z.toFixed(1)}`;

                if (!nodeMap.has(key)) {
                    const nodeId = `node-${nodeIdCounter++}`;
                    const node = {
                        id: nodeId,
                        x: ep.x,
                        y: ep.y,
                        z: ep.z,
                        bore: ep.bore || (comp.attributes && comp.attributes.bore) || (comp.points && comp.points[0] && comp.points[0].bore) || 0,
                        connectedSticks: [],
                        // SEQUENCE INFO: Track which component/endpoint this belongs to
                        componentIndex: compIndex,
                        endpointIndex: epIndex, // 0 = EP1, 1 = EP2
                        componentId: comp.id
                    };
                    nodes.push(node);
                    nodeMap.set(key, node);
                }

                const node = nodeMap.get(key);
                compNodes.push(node.id);
            });

            if (compNodes.length >= 2) {
                const stick = {
                    id: comp.id,
                    type: comp.type,
                    connectedNodes: compNodes,
                    data: { bore: (comp.attributes && comp.attributes.bore) || (comp.points && comp.points[0] && comp.points[0].bore) || 0, ...comp },
                    // SEQUENCE INFO: Track component index
                    componentIndex: compIndex
                };
                sticks.push(stick);

                compNodes.forEach(nodeId => {
                    const node = nodes.find(n => n.id === nodeId);
                    if (node) node.connectedSticks.push(stick.id);
                });
            }
        });

        return { nodes, sticks };
    }
}
