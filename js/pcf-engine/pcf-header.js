/**
 * pcf-header.js — Shared PCF header builder
 * Replaces three duplicated header implementations in rc-stage4-emitter.js,
 * coord-pcf-emitter.js, and converter/header-writer.js.
 *
 * Exports:
 *   buildPcfHeader(pipelineRef, opts) → string
 */

import { ENGINE_CONFIG } from './engine-config.js';

/**
 * Build the ISOGEN PCF header block.
 *
 * @param {string} pipelineRef — filename of source CSV or imported PCF
 *                               (e.g. "MyLine.csv" → "MyLine")
 * @param {object} [opts]
 * @param {string} [opts.projectIdentifier]
 * @param {string} [opts.area]
 * @param {boolean} [opts.windowsLineEndings]
 * @returns {string}  Header text ready to prepend to PCF body
 */
export function buildPcfHeader(pipelineRef, opts = {}) {
  const projectId = opts.projectIdentifier ?? ENGINE_CONFIG.header.projectIdentifier;
  const area      = opts.area             ?? ENGINE_CONFIG.header.area;
  const crlf      = opts.windowsLineEndings ?? ENGINE_CONFIG.windowsLineEndings;
  const nl        = crlf ? '\r\n' : '\n';

  // Strip file extension from pipeline reference
  const ref = String(pipelineRef ?? 'UNKNOWN').replace(/\.[^.]+$/, '');

  return [
    'ISOGEN-FILES ISOGEN.FLS',
    'UNITS-BORE MM',
    'UNITS-CO-ORDS MM',
    'UNITS-WEIGHT KGS',
    'UNITS-BOLT-DIA MM',
    'UNITS-BOLT-LENGTH MM',
    `PIPELINE-REFERENCE ${ref}`,
    `    PROJECT-IDENTIFIER ${projectId}`,
    `    AREA ${area}`,
    '',
  ].join(nl);
}
