/**
 * rc-stage4-dispatcher.js — Phase 3A Common/Legacy Stage 4 router
 *
 * Keeps the large legacy emitter untouched and routes Stage 4 by engineMode.
 *
 * Usage:
 *   import { runStage4 } from './rc-stage4-dispatcher.js';
 *
 * Engine source priority:
 *   1. options.engineMode
 *   2. localStorage('pcfStudio.engineMode')
 *   3. getRayConfig().engineMode
 *   4. 'legacy'
 */

import { getRayConfig } from './rc-config.js';
import { runStage4 as runStage4Legacy } from './rc-stage4-emitter.js';
import { buildCommonPcf } from '../pcf-engine/common-pcf-builder.js';

function resolveEngineMode(options = {}, cfg = {}) {
  let storageMode = '';
  try {
    storageMode = localStorage.getItem('pcfStudio.engineMode') || '';
  } catch (_) {
    storageMode = '';
  }

  return String(
    options.engineMode ||
    storageMode ||
    cfg.engineMode ||
    'legacy'
  ).trim().toLowerCase();
}

function exposeLastStage4Run(result, mode) {
  try {
    window.__RAY_STAGE4_LAST_RUN__ = {
      mode,
      resultMeta: result?.meta || null,
      commonMeta: window.__COMMON_PCF_BUILDER_LAST_RUN__?.meta || null,
      timestamp: Date.now(),
    };
  } catch (_) {
    // non-browser execution
  }
}

export function runStage4(components, injectedPipes, pipelineRef, logFn = () => {}, options = {}) {
  const cfg = getRayConfig();
  const mode = resolveEngineMode(options, cfg);

  if (mode === 'common') {
    const result = buildCommonPcf({
      components,
      injectedPipes,
      pipelineRef,
      cfg: { ...cfg, engineMode: 'common' },
      logFn,
      legacyEmitter: runStage4Legacy,
    });

    exposeLastStage4Run(result, 'common');
    return result;
  }

  const result = runStage4Legacy(components, injectedPipes, pipelineRef, logFn);
  exposeLastStage4Run(result, 'legacy');
  return {
    ...result,
    meta: {
      ...(result?.meta || {}),
      engine: 'legacy',
      emittedBy: 'rc-stage4-emitter',
    },
  };
}

export { runStage4Legacy };
