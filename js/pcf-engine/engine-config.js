/**
 * engine-config.js — Centralised PCF Engine constants
 * Shared across all emitters, validators, and fixers.
 */

export const ENGINE_CONFIG = {
  // Formatting
  decimalPrecision: 4,
  windowsLineEndings: true,          // CRLF output

  // Geometry tolerances (mm)
  tolerances: {
    snap: 6.0,            // gap ≤ 6mm → snap endpoints to midpoint
    stretch: 25.0,        // gap ≤ 25mm → stretch adjacent segment
    midpoint: 1.0,        // TEE CP midpoint check
    equidistant: 0.01,    // BEND CP equidistance check
    perpendicular: 0.01,  // TEE BP perpendicularity dot product
    continuity: 0.5,      // EP1 ≈ prev.EP2 check
    zeroLength: 0.5,      // EP1 ≈ EP2 → zero-length warning
    oletOffset: 6.0,      // OLET BP within bore/2 ± 6mm
  },

  // Coordinate scaling
  coordMaxDigits: 999999999,   // > this → offer /1000

  // PCF header defaults
  header: {
    projectIdentifier: 'P1',
    area: 'A1',
  },

  // Support names
  supportNames: {
    rest: 'CA150',
    guide: 'CA100',
    fallback: 'CA150',
  },

  // Bore geometry
  bendRadiusMultiplier: 1.5,    // bore × 1.5 = default elbow radius
};
