/**
 * Web Worker: Topology Engine
 *
 * Runs PcfTopologyGraph2 off the main thread so the UI stays responsive
 * during heavy spatial searches on large PCF files (10,000+ components).
 *
 * Message API
 * -----------
 * Incoming:
 *   { type: 'RUN_TOPOLOGY', rows: ComponentRow[], config: Config, currentPass: number }
 *
 * Outgoing:
 *   { type: 'TOPOLOGY_PROGRESS', message: string }
 *   { type: 'TOPOLOGY_COMPLETE', proposals: Proposal[], logs: LogEntry[] }
 *   { type: 'TOPOLOGY_ERROR',    message: string }
 */

import { PcfTopologyGraph2 } from '/js/pcf-fixer-runtime/engine/PcfTopologyGraph2.js';
import { createLogger } from '/js/pcf-fixer-runtime/utils/Logger.js';

self.onmessage = (event) => {
  const { type, rows, config, currentPass } = event.data;

  if (type !== 'RUN_TOPOLOGY') return;

  try {
    self.postMessage({ type: 'TOPOLOGY_PROGRESS', message: 'Worker: Starting topology analysis…' });

    const logger = createLogger();

    const onProgress = (msg) => {
        self.postMessage({ type: 'TOPOLOGY_PROGRESS', message: msg });
    };

    const effectiveConfig = currentPass ? { ...config, currentPass, onProgress } : { ...config, onProgress };


    const result = PcfTopologyGraph2(rows, effectiveConfig, logger);

    // Serialise proposals (strip any non-transferable references)
    const proposals = (result.proposals || []).map(p => ({
      ...p,
      // Keep elementA/elementB as plain data (they already are POJOs)
    }));

    self.postMessage({
      type: 'TOPOLOGY_COMPLETE',
      proposals,
      logs: logger.getLog(),
    });
  } catch (err) {
    self.postMessage({ type: 'TOPOLOGY_ERROR', message: err?.message || String(err) });
  }
};
