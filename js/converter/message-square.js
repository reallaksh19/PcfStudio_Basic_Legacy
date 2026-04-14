/**
 * message-square.js — Build MESSAGE-SQUARE comment blocks
 * Template variables are interpolated from component data.
 * Config-driven: templates stored in config.msgTemplates.
 *
 * Exports:
 *   buildMsgSquare(pts, pcfType, config) → string[]
 *   interpolate(template, vars)          → string
 */

import { fmtCoord, fmtValue } from '../geometry/coord-engine.js';
import { directionText, componentLength } from '../geometry/direction-calc.js';

const MOD = 'message-square';

/**
 * Interpolate a template string with variable values.
 * Variables are {varName}. Unknown vars become empty string.
 * @param {string} template
 * @param {object} vars
 * @returns {string}
 */
export const interpolate = (template, vars) => {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : ''
  );
};

/**
 * Build the MESSAGE-SQUARE block for a component.
 * Returns 2 lines: "MESSAGE-SQUARE" and "    {text}"
 * Returns [] if config.outputSettings.includeMessageSquare is false.
 *
 * @param {object} pts      - PointDict
 * @param {string} pcfType  - e.g. 'PIPE', 'BEND'
 * @param {object} config   - full config
 * @returns {string[]}
 */
export const buildMsgSquare = (pts, pcfType, config) => {
  if (!config?.outputSettings?.includeMessageSquare) return [];

  const template = config?.msgTemplates?.[pcfType];
  if (!template) return [];

  const primary = pts['1'] ?? pts['0'] ?? Object.values(pts)[0] ?? {};
  const branch = pts['3'] ?? null;
  const ep1 = pts['1'] ?? pts['0'] ?? null;
  const ep2 = pts['2'] ?? null;

  // Compute length if both endpoints available
  let length = '';
  if (ep1 && ep2) {
    const lenMm = componentLength(
      { E: ep1.E, N: ep1.N, U: ep1.U },
      { E: ep2.E, N: ep2.N, U: ep2.U }
    );
    length = fmtValue(lenMm, 0);
  }

  // Compute direction
  let direction = '';
  if (ep1 && ep2) {
    direction = directionText(
      { E: ep1.E, N: ep1.N, U: ep1.U },
      { E: ep2.E, N: ep2.N, U: ep2.U }
    );
  }

  const vars = {
    material: primary.material ?? '',
    bore: primary.bore ? fmtCoord(primary.bore, 0) : '',
    branchBore: branch ? fmtCoord(branch.bore, 0) : (primary.bore ? fmtCoord(primary.bore, 0) : ''),
    length,
    direction,
    angle: '',   // filled in by bend writer
    radius: primary.radius ? fmtValue(primary.radius, 1) : '',
    compName: primary.compName ?? '',
    restraintType: primary.restraintType ?? '',
    nodeName: primary.nodeName ?? '',
    flatDirection: config?.pcfRules?.[pcfType]?.flatDirection ?? '',
    refno: config.refno || '', // We need to pass refno in some way.
  };

  let text = interpolate(template, vars).replace(/,\s*,/g, ',').replace(/,\s*$/, '').replace(/^,\s*/, '').trim();

  // Inject RefNo and SeqNo with consistent comma separator
  // Strip leading = from refno (it's part of the RefNo field value format)
  if (config.refno) {
    const cleanRef = String(config.refno).replace(/^=+/, '');
    text += `, RefNo:=${cleanRef}`;
  }
  if (config.seqNo && config.seqNo !== '-') {
    text += `, SeqNo:${config.seqNo}`;
  }

  // Final cleanup of any stray commas
  text = text.replace(/,\s*,/g, ',').replace(/^,\s*/, '').replace(/,\s*$/, '').trim();

  return [
    'MESSAGE-SQUARE',
    `    ${text}`,
  ];
};

/**
 * Build MESSAGE-SQUARE for a BEND with pre-computed angle.
 * Called by bend writer with computed angle injected.
 * @param {object} pts
 * @param {string} angleStr   - formatted angle string e.g. "90"
 * @param {object} config
 * @returns {string[]}
 */
export const buildBendMsgSquare = (pts, angleStr, config) => {
  if (!config?.outputSettings?.includeMessageSquare) return [];
  const template = config?.msgTemplates?.BEND;
  if (!template) return [];

  const primary = pts['1'] ?? pts['0'] ?? Object.values(pts)[0] ?? {};
  const ep1 = pts['1'] ?? null;
  const ep2 = pts['2'] ?? null;

  let length = '';
  if (ep1 && ep2) {
    const lenMm = componentLength({ E: ep1.E, N: ep1.N, U: ep1.U }, { E: ep2.E, N: ep2.N, U: ep2.U });
    length = fmtValue(lenMm, 0);
  }

  let direction = '';
  if (ep1 && ep2) direction = directionText({ E: ep1.E, N: ep1.N, U: ep1.U }, { E: ep2.E, N: ep2.N, U: ep2.U });

  const vars = {
    material: primary.material ?? '',
    angle: angleStr,
    radius: primary.radius ? fmtValue(primary.radius, 1) : '',
    length,
    direction,
    bore: primary.bore ? fmtCoord(primary.bore, 0) : '',
    branchBore: '',
    compName: '', restraintType: '', nodeName: '', flatDirection: '',
    refno: config.refno || '',
  };

  let text = interpolate(template, vars).replace(/,\s*,/g, ',').replace(/^,\s*/, '').replace(/,\s*$/, '').trim();
  if (config.refno) {
    const cleanRef = String(config.refno).replace(/^=+/, '');
    text += `, RefNo:=${cleanRef}`;
  }
  if (config.seqNo && config.seqNo !== '-') {
    text += `, SeqNo:${config.seqNo}`;
  }
  text = text.replace(/,\s*,/g, ',').replace(/^,\s*/, '').replace(/,\s*$/, '').trim();

  return ['MESSAGE-SQUARE', `    ${text}`];
};
