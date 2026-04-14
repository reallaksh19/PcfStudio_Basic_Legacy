/**
 * header-writer.js — Write PCF file header section
 * Fixed ISOGEN-FILES + UNITS block, then pipeline reference and optional project fields.
 */

import { info } from '../logger.js';

const MOD = 'header-writer';

/**
 * Build PCF header lines.
 * @param {string} [pipelineRef] — derived from the CSV filename (without extension)
 * @returns {string[]}
 */
export const buildHeader = (pipelineRef) => {
  info(MOD, 'buildHeader', 'Building unified PCF header');

  const lines = [
    'ISOGEN-FILES ISOGEN.FLS',
    'UNITS-BORE MM',
    'UNITS-CO-ORDS MM',
    'UNITS-WEIGHT KGS',
    'UNITS-BOLT-DIA MM',
    'UNITS-BOLT-LENGTH MM',
  ];

  if (pipelineRef) {
    lines.push(`PIPELINE-REFERENCE export ${pipelineRef}`);
    lines.push('    PROJECT-IDENTIFIER P1');
    lines.push('    AREA A1');
  } else {
    console.log('[DEBUG-Header] buildHeader() — no pipelineRef, skipping PIPELINE-REFERENCE');
  }

  return lines;
};
