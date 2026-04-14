/**
 * TopologyRules.js
 * Business Logic for Smart Connectivity and Validation.
 * Centralizes rules for Bore Matching, Axis Alignment, and Olet Offsets.
 */

import { getState } from '../../state.js';

export class TopologyRules {

    // Tolerance Constants
    static GAP_TOLERANCE = 6.0;      // mm (Standard connection)
    static GAP_BROKEN = 50.0;        // mm (Likely missing gasket or slight misalignment)

    // Configurable via State
    static get GAP_MODEL_ERROR() {
        const config = getState('config');
        return config?.coordinateSettings?.modelGapLimit ?? 15000.0;
    }

    static ANGLE_TOLERANCE = 5.0;    // degrees (Max skew)

    /**
     * Check if two components have compatible bores.
     * @param {number} boreA
     * @param {number} boreB
     * @param {boolean} isOlet - Olets attach to larger headers.
     * @returns {boolean}
     */
    static checkBoreMatch(boreA, boreB, isOlet = false) {
        if (!boreA || !boreB) return true; // Assume pass if unknown

        if (isOlet) {
            // Olet Rule: Header (B) must be >= Olet (A)
            // Actually, Olet connects TO a Header. Source=Olet, Target=Header.
            return boreB >= boreA;
        }

        // Pipe/Fitting Rule: Exact match (within small float tolerance)
        return Math.abs(boreA - boreB) < 2.0;
    }

    /**
     * Check if a vector aligns with a Major Axis (East, North, Up).
     * @param {Object} vec - {x, y, z}
     * @returns {boolean}
     */
    static checkAxisAlignment(vec) {
        const ax = Math.abs(vec.x);
        const ay = Math.abs(vec.y);
        const az = Math.abs(vec.z);

        // Check if one component dominates the others (e.g. > 95% of length)
        const len = Math.sqrt(ax*ax + ay*ay + az*az);
        if (len < 0.1) return true; // Zero length is aligned

        return (ax / len > 0.98) || (ay / len > 0.98) || (az / len > 0.98);
    }

    /**
     * Check Olet Offset rule (Surface weld).
     * @param {number} gap - Center-to-Center distance
     * @param {number} headerBore - Radius of header
     * @returns {boolean}
     */
    static checkOletOffset(gap, headerBore) {
        // Ideal gap is Radius (Header Bore / 2)
        const radius = headerBore / 2.0;

        // Use VALIDATOR_CONFIG settings if available
        let minRadiiMult = 0.2;
        let maxRadii = 13000.0;

        try {
            // Lazy load config to avoid circular dependencies
            const config = require('./validator-config.js').VALIDATOR_CONFIG;
            if (config?.fixer?.minRadiiMultiplier) minRadiiMult = config.fixer.minRadiiMultiplier;
            if (config?.fixer?.maxRadii) maxRadii = config.fixer.maxRadii;
        } catch(e) {}

        if (radius < headerBore * minRadiiMult || radius > maxRadii) {
            return false;
        }

        // Allow tolerance
        return Math.abs(gap - radius) < this.GAP_TOLERANCE;
    }
}
