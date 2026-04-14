/**
 * pte-config.js — Configuration for Point-to-Element Conversion
 */

export const PTE_CONFIG = {
  // Mode selection
  sequentialData: "auto",        // "auto" | true | false
  lineKeyEnabled: "auto",        // "auto" | true | false
  lineKeyColumn: "Line No",      // Column name in CSV/Excel to use as Line_Key
  refPtPptAvailable: "auto",     // "auto" | true | false

  // Pass 1 Constraints
  boreRatioMin: 0.7,
  boreRatioMax: 1.5,

  // Fix Auto-Approval Constraints
  autoApproveMaxGap: 25.0,       // mm
  autoRejectMaxGap: 20000.0,     // mm

  // Orphan sweep parameters
  sweep: {
    microTolerance: 0.2,         // × NB (mm)
    stage1: 1.0,                 // × NB
    stage2: 5.0,                 // × NB
    stage3: 10.0,                // × NB (first major sweep)
    stage4: 20.0,                // × NB (second major sweep)
    stage5: 7000,                // mm (absolute)
    stage6: 13000,               // mm (maximum)
  },

  // Scoring weights
  scoring: {
    sameAxisSameDir: 0.3,        // 70% bonus
    sameAxisReverseDir: 5.0,     // 5× penalty (fold-back)
    differentAxis: 1.5,          // 50% penalty (bend/branch)
    singleAxisBonus: 0.5,        // 50% bonus
    twoAxisBonus: 0.9,           // 10% bonus
    diagonalPenalty: 2.0,        // 2× penalty
  },

  // PPoint heuristics
  invertPPointAtFlangePairs: true,
  invertPPointAtFlangedValves: true,
};
