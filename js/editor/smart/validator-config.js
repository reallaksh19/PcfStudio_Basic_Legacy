/**
 * validator-config.js — Configuration for Smart Validator
 * Plug-and-play config module - no dependencies
 */

export const VALIDATOR_CONFIG = {
    // Connection tolerance (mm)
    tolerance: 6.0,

    // Rule 1: Broken Connections
    brokenConnection: {
        enabled: true,
        minGap: 6.0,           // tolerance < gap
        maxGapMultiplier: 2.0,  // gap <= maxGapMultiplier * bore
        severity: 'ERROR',
        autoFixable: true
    },

    // Rule 2: Model Errors (Open Ends)
    modelError: {
        enabled: true,
        minGapMultiplier: 2.0,  // minGapMultiplier * bore < gap
        maxGap: 15000,          // gap <= maxGap
        severity: 'WARNING',
        autoFixable: false      // Only auto-fix if gap <= tolerance
    },

    // Rule 3: Overlaps
    overlap: {
        enabled: true,
        minOverlap: 6.0,        // Ignore overlaps < tolerance
        severity: 'ERROR',
        autoFixable: true,      // Only if bores match
        boreTolerance: 1.0      // mm difference allowed for bore matching
    },

    // Fixer settings
    fixer: {
        // Maximum skew line length (mm)
        maxSkewLength: 12500,

        // Snap threshold (mm)
        snapThreshold: 6.0,

        // OLET spatial offset multiplier (Pipe OD / multiplier)
        oletOffsetMultiplier: 2.0,

        // Auto-connect bore tolerance
        boreTolerance: 1.0,

        // Configuration Options
        // a) Bore ratio Min 0.7 to max 1.5
        minBoreRatio: 0.7,
        maxBoreRatio: 1.5,

        // b) radii: min 0.2*NB to max 13000mm
        minRadiiMultiplier: 0.2, // Min radius = 0.2 * NB
        maxRadii: 13000.0        // Max radius = 13000mm
    },

    // Visual settings
    visual: {
        errorColor: '#ff3366',
        warningColor: '#ffaa00',
        infoColor: '#00aaff',
        focusColor: '#00ff00',
        highlightOpacity: 0.5
    }
};

/**
 * Get config value by path (e.g., 'brokenConnection.enabled')
 */
export function getConfig(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], VALIDATOR_CONFIG);
}

/**
 * Update config value by path
 */
export function setConfig(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key], VALIDATOR_CONFIG);
    if (target) target[lastKey] = value;
}

/**
 * Reset config to defaults
 */
export function resetConfig() {
    Object.assign(VALIDATOR_CONFIG, {
        tolerance: 6.0,
        brokenConnection: { enabled: true, minGap: 6.0, maxGapMultiplier: 2.0, severity: 'ERROR', autoFixable: true },
        modelError: { enabled: true, minGapMultiplier: 2.0, maxGap: 15000, severity: 'WARNING', autoFixable: false },
        overlap: { enabled: true, minOverlap: 6.0, severity: 'ERROR', autoFixable: true, boreTolerance: 1.0 },
        fixer: { maxSkewLength: 12500, snapThreshold: 6.0, oletOffsetMultiplier: 2.0, boreTolerance: 1.0 },
        visual: { errorColor: '#ff3366', warningColor: '#ffaa00', infoColor: '#00aaff', focusColor: '#00ff00', highlightOpacity: 0.5 }
    });
}
