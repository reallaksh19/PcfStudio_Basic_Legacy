/**
 * 3D Smart Fix Tolerance Settings
 * Centralized configuration for the deterministic topological graph solver.
 * All numeric thresholds (distances, ratios) used for gap detection and
 * mutation approvals are defined here to avoid hardcoded logic.
 */
export const SmartFixerConfig = {
    // PASS 1 (Sequential) Settings
    MAX_FILLABLE_GAP: 15000.0, // Maximum mm jump before it is considered a branch/origin jump rather than a missing pipe.
    AUTO_APPROVE_THRESHOLD: 6.0, // Gaps < 6mm are considered micro-gaps and auto-approved for fixing.
    IMMUTABLE_TRANSLATE_LIMIT: 25.0, // Max mm an immutable component (Flange/Bend/Valve) can be translated.
    MIN_DISTANCE_TOLERANCE: 0.1, // Minimum mm distance to be considered a physical gap (handles float rounding).

    // BORE CONSTRAINTS
    BORE_RATIO_MIN: 0.5,
    BORE_RATIO_MAX: 2.0,

    // PASS 2 (Fuzzy Major Axis) Settings
    FUZZY_MAJOR_AXIS_LIMIT: 6000.0, // Maximum global search radius for components aligned strictly on X, Y, or Z.
    MAJOR_AXIS_TOLERANCE: 5.0, // Allowable variance in mm off-axis for a vector to still be considered "Major Axis".

    // PASS 3 (Fuzzy Any Axis) Settings
    FUZZY_ANY_AXIS_LIMIT: 15000.0, // Maximum global search radius for any unaligned open endpoints.

    // SWEEP RADII LIMITS (Used for Bends/Elbow evaluations)
    SWEEP_RADII_MIN_NB: 0.2, // Multiplier for Nominal Bore (e.g. 0.2 * 100mm = 20mm min radius)
    SWEEP_RADII_MAX: 3000.0 // Maximum absolute mm radius for a synthetic bend curve
};
