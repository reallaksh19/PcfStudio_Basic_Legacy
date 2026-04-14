/**
 * syntax-validator.js — Phase 4: Post-generation PCF syntax validation
 * Scans generated PCF lines[] for rule violations.
 * Each rule reads from config.pcfRules.
 *
 * Exports:
 *   validateSyntax(pcfLines, config) → Issue[]
 */

import { warn } from '../logger.js';

const MOD = 'syntax-validator';

const _issue = (id, severity, refno, lineNo, message, detail, fixHint) => ({
  id, phase: 'SYNTAX', severity, refno: refno || null,
  rowIndex: lineNo ?? null, message, detail: detail || '',
  fixable: false, fix: null, fixHint: fixHint || '',
});

// Parse PCF lines into blocks for analysis
export const parseBlocks = (lines) => {
  const blocks = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const trimmed = line.trimStart();

    // Block keyword = line that starts without leading spaces and is a PCF keyword
    const isKeyword = !/^\s/.test(line) && line.trim() !== '' && !line.startsWith('#');
    if (isKeyword) {
      if (current) blocks.push(current);
      current = { keyword: line.trim(), attributes: [], startLine: i };
    } else if (current) {
      current.attributes.push({ line: trimmed, lineNo: i });
    }
  }
  if (current) blocks.push(current);
  return blocks;
};

/**
 * Validate generated PCF lines for syntax compliance.
 * @param {string[]} pcfLines
 * @param {object}   config
 * @returns {Issue[]}
 */
export const validateSyntax = (pcfLines, config) => {
  if (!Array.isArray(pcfLines) || pcfLines.length === 0) return [];
  const pcfRules = config?.pcfRules ?? {};
  const issues = [];
  const blocks = parseBlocks(pcfLines);

  // Skip non-component keywords
  const HEADER_KEYWORDS = new Set(['ISOGEN-FILES', 'UNITS-BORE', 'UNITS-CO-ORDS',
    'UNITS-WEIGHT', 'UNITS-BOLT-DIA', 'UNITS-BOLT-LENGTH', 'PIPELINE-REFERENCE', 'MESSAGE-SQUARE']);

  for (const block of blocks) {
    const kw = block.keyword;
    if (HEADER_KEYWORDS.has(kw)) continue;
    const rule = pcfRules[kw];

    // Debug log to see if rules are missing
    if (!rule) {
      // console.log(`[SV] No rule for ${kw}`);
      continue;
    }

    const attrNames = block.attributes.map(a => a.line.split(/\s+/)[0]);

    // GENERIC FORMAT CHECK: Flag any attribute with "Undefined" value
    // This runs regardless of config rules to catch all placeholders
    for (const attr of block.attributes) {
      if (attr.line.includes('Undefined') || attr.line.includes('undefined')) {
        const parts = attr.line.split(/\s+/);
        const key = parts[0];
        const val = parts.slice(1).join(' ').trim();
        if (val === 'Undefined' || val === 'undefined') {
          issues.push(_issue('SV-001', 'WARNING', kw, attr.lineNo,
            `${kw}: ${key} is '${val}'`,
            `Line ${attr.lineNo + 1}`,
            `Remove placeholder value`));
        }
      }
    }

    // SV-001: Required CA slots present
    for (const slot of rule.caSlots ?? []) {
      const attrNum = slot.replace('CA', '');
      const attrKey = `COMPONENT-ATTRIBUTE${attrNum}`;

      const attrLine = block.attributes.find(a => a.line.startsWith(attrKey));

      if (!attrLine) {
        issues.push(_issue('SV-001', 'ERROR', kw, block.startLine,
          `${kw}: missing ${attrKey} (${slot})`,
          `Block at line ${block.startLine + 1}`,
          `Add ${attrKey} with value from config.caDefinitions.${slot}.default`));
      } else {
        // Check for placeholder/undefined values
        const val = attrLine.line.split(/\s+/).slice(1).join(' ').trim();
        // console.log(`[SV] Checking ${kw}.${attrKey} value: '${val}'`); // Debug Log

        if (val === 'Undefined' || val === 'undefined') {
          issues.push(_issue('SV-001', 'WARNING', kw, attrLine.lineNo,
            `${kw}: ${attrKey} value is 'Undefined'`,
            `Line ${attrLine.lineNo + 1}`,
            `Set default value for ${slot} in Config or fix input data`));
        }
      }
    }

    // SV-002: BEND has ANGLE and BEND-RADIUS
    if (kw === 'BEND') {
      if (!attrNames.includes('ANGLE')) {
        issues.push(_issue('SV-002', 'ERROR', kw, block.startLine,
          'BEND block missing ANGLE', '', 'Check bend angle computation'));
      }
      if (!attrNames.includes('BEND-RADIUS')) {
        issues.push(_issue('SV-002', 'WARNING', kw, block.startLine,
          'BEND block missing BEND-RADIUS', '', 'Set Radius column in CSV'));
      }
      const angleLine = block.attributes.find(a => a.line.startsWith('ANGLE'));
      if (angleLine) {
        const angleVal = parseFloat(angleLine.line.split(/\s+/)[1]);
        if (isNaN(angleVal) || angleVal <= 0 || angleVal >= 180) {
          issues.push(_issue('SV-002', 'WARNING', kw, angleLine.lineNo,
            `BEND ANGLE value suspicious: "${angleLine.line}"`,
            `Expected 0 < angle < 180`, 'Verify centre-point coordinates'));
        }
      }
    }

    // SV-003: SUPPORT has <SUPPORT_NAME>
    if (kw === 'SUPPORT') {
      if (!attrNames.includes('<SUPPORT_NAME>')) {
        issues.push(_issue('SV-003', 'WARNING', kw, block.startLine,
          'SUPPORT block missing <SUPPORT_NAME>',
          '', 'Fill Restraint Type column in CSV'));
      }
    }

    // SV-005: BEND CENTRE-POINT geometric validation
    // The correct CP for a 90° axis-aligned bend is the corner intersection
    // of the two perpendicular legs (not a bisector midpoint).
    if (kw === 'BEND') {
      const ep1Line = block.attributes.find(a => a.line.startsWith('END-POINT'));
      const ep2Line = block.attributes.filter(a => a.line.startsWith('END-POINT'))[1];
      const cpLine  = block.attributes.find(a => a.line.startsWith('CENTRE-POINT'));
      if (ep1Line && ep2Line && cpLine) {
        const parseCoord = (l) => {
          const parts = l.line.split(/\s+/);
          return { x: parseFloat(parts[1]), y: parseFloat(parts[2]), z: parseFloat(parts[3]) };
        };
        const ep1 = parseCoord(ep1Line);
        const ep2 = parseCoord(ep2Line);
        const cp  = parseCoord(cpLine);
        // Try both corner candidates
        const c1 = { x: ep1.x, y: ep2.y, z: ep1.z };
        const c2 = { x: ep2.x, y: ep1.y, z: ep1.z };
        const dist = (a, b) => Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
        const d1 = dist(cp, c1);
        const d2 = dist(cp, c2);
        const expected = d1 < d2 ? c1 : c2;
        const deviation = Math.min(d1, d2);
        if (deviation > 1.0) {
          issues.push(_issue('SV-005', 'ERROR', kw, cpLine.lineNo,
            `BEND CP geometric error: deviation ${deviation.toFixed(2)}mm from expected corner`,
            `Expected CP: ${expected.x.toFixed(4)} ${expected.y.toFixed(4)} ${expected.z.toFixed(4)}`,
            `Move CENTRE-POINT to the corner intersection of the two perpendicular legs`));
        }
      }
    }

    // SV-004: END-POINTs count
    const epCount = attrNames.filter(a => a === 'END-POINT').length;
    if (['PIPE', 'FLANGE', 'VALVE', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC'].includes(kw)) {
      if (epCount !== 2) {
        issues.push(_issue('SV-004', 'ERROR', kw, block.startLine,
          `${kw}: expected 2 END-POINTs, found ${epCount}`,
          '', 'Check CSV Point columns for this component'));
      }
    }
    if (kw === 'OLET' && epCount > 0) {
      issues.push(_issue('SV-004', 'ERROR', kw, block.startLine,
        `OLET must not have END-POINT lines (found ${epCount})`,
        '', 'OLET uses CENTRE-POINT + BRANCH1-POINT only'));
    }
  }

  warn(MOD, 'validateSyntax', `Syntax validation: ${issues.length} issues`, {
    errors: issues.filter(x => x.severity === 'ERROR').length,
    warnings: issues.filter(x => x.severity === 'WARNING').length,
  });

  return issues;
};

/**
 * Dispatch entry point: routes to legacy or Common PCF Builder syntax check
 * based on config.engineMode.
 *
 * Legacy mode:  operates on pcfLines (string[]) via validateSyntax()
 * Common mode:  operates on components (object[]) via runSyntaxCheck() from syntax-checker.js
 *
 * @param {string[]|object[]} input  — pcfLines in legacy mode, components[] in common mode
 * @param {object}            config
 * @returns {Promise<Issue[]>}
 */
export const runValidation = async (input, config) => {
  if (config?.engineMode === 'common') {
    const { runSyntaxCheck } = await import('../pcf-engine/syntax-checker.js');
    const { errors, warnings, infos } = runSyntaxCheck(input, config);
    // Normalise to Issue[] shape expected by callers
    return [
      ...errors.map(i => ({ ...i, phase: 'SYNTAX', fixable: false, fix: null })),
      ...warnings.map(i => ({ ...i, phase: 'SYNTAX', fixable: false, fix: null })),
      ...infos.map(i => ({ ...i, severity: 'INFO', phase: 'SYNTAX', fixable: false, fix: null })),
    ];
  }
  return validateSyntax(input, config);
};
