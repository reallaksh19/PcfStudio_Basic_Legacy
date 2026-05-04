/**
 * pcf-diff-gate.js — Phase 3E Legacy/Common certification gate
 *
 * Converts a diffPcfOutputs(...) result into a deterministic pass/fail gate.
 * Intended for:
 * - Browser console checks
 * - Future Playwright tests
 * - Future benchmark runner / CI
 */

const DEFAULT_GATE = Object.freeze({
  maxCritical: 0,
  maxMajor: 0,
  maxMinor: Infinity,
  requireLegacyCommonDiff: true,
  requireCommonBlocks: true,
});

function n(value, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function mergeOptions(options = {}) {
  return { ...DEFAULT_GATE, ...(options || {}) };
}

function emptySummary() {
  return {
    legacyBlockCount: 0,
    commonBlockCount: 0,
    total: 0,
    critical: 0,
    major: 0,
    minor: 0,
  };
}

export function evaluatePcfDiffGate(diff, options = {}) {
  const gate = mergeOptions(options);
  const summary = diff?.summary || emptySummary();
  const reasons = [];

  if (gate.requireLegacyCommonDiff && !diff) {
    reasons.push('Legacy/Common diff result is missing.');
  }

  if (gate.requireCommonBlocks && n(summary.commonBlockCount) <= 0) {
    reasons.push('Common output has zero parsed PCF blocks.');
  }

  if (n(summary.critical) > gate.maxCritical) {
    reasons.push(`Critical diffs ${summary.critical} exceed allowed ${gate.maxCritical}.`);
  }

  if (n(summary.major) > gate.maxMajor) {
    reasons.push(`Major diffs ${summary.major} exceed allowed ${gate.maxMajor}.`);
  }

  if (Number.isFinite(gate.maxMinor) && n(summary.minor) > gate.maxMinor) {
    reasons.push(`Minor diffs ${summary.minor} exceed allowed ${gate.maxMinor}.`);
  }

  const pass = reasons.length === 0;

  return {
    pass,
    status: pass ? 'PASS' : 'FAIL',
    reasons,
    thresholds: gate,
    summary: {
      legacyBlockCount: n(summary.legacyBlockCount),
      commonBlockCount: n(summary.commonBlockCount),
      total: n(summary.total),
      critical: n(summary.critical),
      major: n(summary.major),
      minor: n(summary.minor),
    },
  };
}

export function summarizeDiffsForReport(diff, limit = 50) {
  const rows = Array.isArray(diff?.diffs) ? diff.diffs : [];
  return rows.slice(0, limit).map((d, i) => ({
    '#': i + 1,
    severity: d.severity || '',
    path: d.path || '',
    legacy: d.legacy == null ? '' : String(d.legacy),
    common: d.common == null ? '' : String(d.common),
    message: d.message || '',
  }));
}

export function evaluateLastCommonRun(options = {}) {
  const run = typeof window !== 'undefined' ? window.__COMMON_PCF_BUILDER_LAST_RUN__ : null;
  const gate = evaluatePcfDiffGate(run?.diff || null, options);
  return {
    ...gate,
    meta: run?.meta || null,
    emitMeta: run?.emitResult?.meta || null,
    diffPreview: summarizeDiffsForReport(run?.diff || null, options.previewLimit ?? 50),
  };
}

export function printLastCommonGate(options = {}) {
  const result = evaluateLastCommonRun(options);
  if (typeof console !== 'undefined') {
    console.log(`[Common PCF Gate] ${result.status}`, result.summary, result.reasons);
    if (result.diffPreview?.length) console.table(result.diffPreview);
  }
  return result;
}

try {
  if (typeof window !== 'undefined') {
    window.evaluatePcfDiffGate = evaluatePcfDiffGate;
    window.evaluateLastCommonRun = evaluateLastCommonRun;
    window.printLastCommonGate = printLastCommonGate;
  }
} catch (_) {
  // non-browser execution
}
