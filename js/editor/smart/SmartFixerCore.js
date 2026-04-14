/**
 * SmartFixerCore.js — Main fixer orchestrator (< 100 lines)
 * Plug-and-play: import, instantiate, call fixIssue()
 */

import { snapNodes, insertPipe, insertElbow, trimOverlap } from './fixer-strategies.js';
import { getMajorAxis } from './geometry-utils.js';
import { VALIDATOR_CONFIG } from './validator-config.js';

export class SmartFixerCore {
    constructor(config = VALIDATOR_CONFIG) {
        this.config = config;
        this.modifications = [];
    }

    /**
     * Fix a specific issue
     * @param {Object} issue - Issue from validator
     * @param {Object} data - { nodes, sticks }
     * @returns {Object} Fix result with modifications
     */
    fixIssue(issue, data) {
        const { nodes, sticks } = data;
        let result = null;

        switch (issue.type) {
            case 'BROKEN_CONNECTION':
                result = this.fixBrokenConnection(issue, nodes);
                break;
            case 'MODEL_ERROR':
                result = this.fixModelError(issue, nodes);
                break;
            case 'OVERLAP':
                result = this.fixOverlap(issue, nodes);
                break;
            default:
                return { success: false, error: 'Unknown issue type' };
        }

        if (result?.success) {
            this.modifications.push({
                issueId: issue.id,
                timestamp: new Date().toISOString(),
                ...result
            });
        }

        return result;
    }

    /**
     * Fix broken connection
     */
    fixBrokenConnection(issue, nodes) {
        if (issue.gap <= this.config.fixer.snapThreshold) {
            return snapNodes(issue, nodes, this.config);
        }

        // Determine if direction changes
        const node1 = nodes.find(n => n.id === issue.node1);
        const node2 = nodes.find(n => n.id === issue.node2);
        const axis = getMajorAxis([node1.x, node1.y, node1.z], [node2.x, node2.y, node2.z]);

        // Check if multiple axes involved (direction change)
        const hasDirectionChange = this.checkDirectionChange([node1.x, node1.y, node1.z], [node2.x, node2.y, node2.z]);

        if (hasDirectionChange) {
            return insertElbow(issue, nodes, this.config);
        } else {
            return insertPipe(issue, nodes, this.config);
        }
    }

    /**
     * Fix model error
     */
    fixModelError(issue, nodes) {
        if (issue.gap <= this.config.tolerance) {
            return snapNodes(issue, nodes, this.config);
        }
        return this.fixBrokenConnection(issue, nodes);
    }

    /**
     * Fix overlap
     */
    fixOverlap(issue, nodes) {
        if (!issue.boresMatch) {
            return { success: false, error: 'Bores do not match - manual review required' };
        }
        return trimOverlap(issue, nodes);
    }

    /**
     * Check if direction changes between two points
     */
    checkDirectionChange(p1, p2) {
        const dx = Math.abs(p2[0] - p1[0]);
        const dy = Math.abs(p2[1] - p1[1]);
        const dz = Math.abs(p2[2] - p1[2]);
        const nonZeroAxes = [dx > 1, dy > 1, dz > 1].filter(Boolean).length;
        return nonZeroAxes > 1;
    }

    /**
     * Get all modifications
     */
    getModifications() {
        return [...this.modifications];
    }

    /**
     * Clear modifications history
     */
    clearModifications() {
        this.modifications = [];
    }
}

/**
 * Factory function
 */
export function createFixer(config) {
    return new SmartFixerCore(config);
}
