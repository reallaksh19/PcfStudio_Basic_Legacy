/**
 * pcf-continuity-validator.js — Validates coordinate continuity in generated PCF lines.
 * Ensures that components are sequentially connected or validly branching.
 * Detects gaps > tolerance (default 6mm).
 */

import { parseCoord, distance3D } from '../geometry/coord-engine.js';
import { warn, info } from '../logger.js';

const MOD = 'pcf-continuity-validator';

/**
 * Parse a single coordinate line.
 * @param {string} line
 * @returns {{E:number, N:number, U:number}|null}
 */
const _parsePoint = (line) => {
  const parts = line.trim().split(/\s+/);
  // Expected format: KEYWORD E N U [bore]
  // We need to find the numbers.
  // Usually parts[1], parts[2], parts[3].
  if (parts.length < 4) return null;
  return {
    E: parseCoord(parts[1]),
    N: parseCoord(parts[2]),
    U: parseCoord(parts[3]),
  };
};

/**
 * Extract block information from lines.
 * @param {string[]} lines
 * @returns {object[]} blocks
 */
const _parseBlocks = (lines) => {
  const blocks = [];
  let currentBlock = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = null;
      continue;
    }

    if (!currentBlock) {
      // Start of new block
      // Determine type
      const firstToken = line.split(/\s+/)[0];
      // If it's a known component keyword
      if (['PIPE', 'BEND', 'TEE', 'FLANGE', 'VALVE', 'OLET', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC', 'SUPPORT', 'INSTRUMENT', 'CAP', 'CROSS'].includes(firstToken)) {
        currentBlock = {
          type: firstToken,
          startLine: i,
          lines: [line],
          eps: [],
          bps: [],
          cp: null,
          coords: null
        };
      } else if (line.startsWith('MESSAGE-SQUARE')) {
        // Ignore message square headers for continuity
      }
    } else {
      currentBlock.lines.push(line);
      // Extract coordinates
      if (line.startsWith('END-POINT')) {
        const pt = _parsePoint(line);
        if (pt) currentBlock.eps.push(pt);
      } else if (line.startsWith('CENTRE-POINT')) {
        const pt = _parsePoint(line);
        if (pt) currentBlock.cp = pt;
      } else if (line.startsWith('BRANCH1-POINT') || line.startsWith('BRANCH2-POINT')) {
        const pt = _parsePoint(line);
        if (pt) currentBlock.bps.push(pt);
      } else if (line.startsWith('CO-ORDS')) {
        const pt = _parsePoint(line);
        if (pt) currentBlock.coords = pt;
      }
    }
  }
  if (currentBlock) blocks.push(currentBlock);
  return blocks;
};

/**
 * Validate PCF continuity.
 * @param {string[]} pcfLines
 * @param {object} config
 * @returns {object[]} issues
 */
export const validatePCFContinuity = (pcfLines, config) => {
  const issues = [];
  const tol = 6.0; // User specified 6mm tolerance

  const blocks = _parseBlocks(pcfLines);
  if (blocks.length === 0) return [];

  // Stack of open connection points (for branches)
  // Each entry: { coord, sourceBlockIndex, type: 'BRANCH'|'START' }
  const openPoints = [];

  // Track previous exit point
  let prevExit = null;
  let prevBlockIdx = -1;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // Determine Entry and Exit candidates
    let entry = null;
    let exit = null;
    let branches = [];

    // SUPPORT: Entry=CO-ORDS, Exit=CO-ORDS
    if (block.type === 'SUPPORT') {
      entry = block.coords;
      exit = block.coords;
    }
    // OLET: Entry=CP, Exit=CP, Branch=BP
    else if (block.type === 'OLET') {
      entry = block.cp; // Or EP1? Olet usually has CP.
      // If OLET has EP1/EP2, use them.
      if (block.eps.length >= 2) {
          entry = block.eps[0];
          exit = block.eps[1];
      } else {
          entry = block.cp;
          exit = block.cp; // Pass-through
      }
      if (block.bps.length > 0) branches.push(...block.bps);
    }
    // TEE: Entry=EP1, Exit=EP2, Branch=BP
    else if (block.type === 'TEE') {
      if (block.eps.length >= 1) entry = block.eps[0];
      if (block.eps.length >= 2) exit = block.eps[1];
      if (block.bps.length > 0) branches.push(...block.bps);
    }
    // Standard (PIPE, BEND, FLANGE, etc): Entry=EP1, Exit=EP2
    else {
      if (block.eps.length >= 1) entry = block.eps[0];
      if (block.eps.length >= 2) exit = block.eps[1];
    }

    // Check Connectivity
    if (i === 0) {
      // First block: strictly speaking, we don't check entry unless we have multiple start points.
      // But we just initialize.
    } else {
      let isConnected = false;
      let gap = 0;

      // 1. Try connecting to previous exit (Main Run)
      if (prevExit && entry) {
        gap = distance3D(prevExit, entry);
        if (gap <= tol) {
          isConnected = true;
        }
      }

      // 2. If not connected, try Open Points (Branches)
      if (!isConnected && entry) {
        // Find closest open point
        let bestIdx = -1;
        let bestDist = Infinity;

        for (let j = 0; j < openPoints.length; j++) {
          const d = distance3D(openPoints[j].coord, entry);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = j;
          }
        }

        if (bestDist <= tol) {
          isConnected = true;
          // Consume this open point?
          // Usually yes, a branch point connects to one branch.
          openPoints.splice(bestIdx, 1);
        } else {
            // Gap is relative to *previous exit* if we were following main run,
            // or relative to *closest branch* if we jumped.
            // If we jumped, the gap might be huge.
            // We report the gap from the *expected* connection (previous exit).
        }
      }

      if (!isConnected && entry) {
        // Report Gap
        // Logic to determine if it's a visual gap or a logic gap
        const msg = `Gap detected: ${gap.toFixed(1)}mm > ${tol}mm`;
        const detail = `Between Block ${i-1} (${blocks[i-1].type}) and Block ${i} (${block.type})`;

        issues.push({
          id: 'PCF-GAP',
          severity: 'ERROR',
          message: msg,
          detail: detail,
          rowIndex: block.startLine
        });

        warn(MOD, 'validatePCFContinuity', msg, {
            prevType: blocks[i-1].type,
            currType: block.type,
            gap
        });
      }
    }

    // Register branches for future connection
    branches.forEach(bp => {
        openPoints.push({ coord: bp, sourceBlockIndex: i });
    });

    // Update prevExit
    prevExit = exit;
    prevBlockIdx = i;
  }

  // Check for Overlaps (Backtracking)?
  // Logic: If Block N is contained within Block N-1?
  // Already handled by overlap-resolver during generation.
  // Here we just check continuity sequence.

  return issues;
};
