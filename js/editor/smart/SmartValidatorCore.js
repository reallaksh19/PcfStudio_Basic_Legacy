/**
 * SmartValidatorCore.js — Main validator orchestrator (< 100 lines)
 * Plug-and-play: import, instantiate, call validate()
 */

import { detectBrokenConnections, detectModelErrors, detectOverlaps, detectBenchmarkVRules, detectBenchmarkSFRules } from './detection-rules.js';
import { VALIDATOR_CONFIG } from './validator-config.js';

export class SmartValidatorCore {
    constructor(config = VALIDATOR_CONFIG) {
        this.config = config;
    }

    /**
     * Main validation entry point
     * @param {Object} data - { nodes, sticks }
     * @returns {Array} Array of issues
     */
    validate(data) {
        const { nodes, sticks } = data;
        if (!nodes || !sticks) return [];

        const endpoints = this.extractEndpoints(nodes, sticks);
        const nodeMap = this.createNodeMap(nodes);
        const issues = [];

        // Run detection rules
        issues.push(...detectBrokenConnections(endpoints, this.config));
        issues.push(...detectModelErrors(endpoints, this.config));
        // issues.push(...detectOverlaps(sticks, nodeMap, this.config));
        issues.push(...detectBenchmarkVRules(sticks, nodes, this.config));
        issues.push(...detectBenchmarkSFRules(sticks, nodes, this.config));

        return issues;
    }

    /**
     * Extract endpoint nodes (nodes with < 2 connections)
     * CRITICAL: Preserve sequence info for connectivity checking
     */
    extractEndpoints(nodes, sticks) {
        return nodes
            .filter(node => (node.connectedSticks?.length || 0) < 2)
            .map(node => ({
                id: node.id,
                position: [node.x, node.y, node.z],
                bore: this.getNodeBore(node, sticks),
                connections: node.connectedSticks?.length || 0,
                // PRESERVE SEQUENCE INFO from geometry extraction
                componentIndex: node.componentIndex,
                endpointIndex: node.endpointIndex,
                componentId: node.componentId
            }));
    }

    /**
     * Create fast lookup map for nodes
     */
    createNodeMap(nodes) {
        const map = {};
        nodes.forEach(n => {
            map[n.id] = [n.x, n.y, n.z];
        });
        return map;
    }

    /**
     * Get bore value for a node
     */
    getNodeBore(node, sticks) {
        if (node.bore) return node.bore;

        // Get bore from connected stick
        const connectedStick = sticks.find(s =>
            s.connectedNodes?.includes(node.id)
        );

        return connectedStick?.data?.bore || 100; // Default 100mm
    }

    /**
     * Update configuration
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}

/**
 * Factory function for easy instantiation
 */
export function createValidator(config) {
    return new SmartValidatorCore(config);
}
