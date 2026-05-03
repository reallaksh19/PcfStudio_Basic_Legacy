/**
 * common-pcf-builder.js — Phase 1 Common PCF Builder
 *
 * Purpose:
 *   Create a real, callable Common PCF Builder path without deleting or rewriting
 *   the legacy Stage 4 emitter. Phase 1 deliberately delegates final text emission
 *   to the existing legacy emitter after building a canonical model and running
 *   common-engine diagnostics. This proves the common path is active and gives the
 *   project a stable boundary for Phase 2/3 replacement of individual block emitters.
 *
 * Contract:
 *   buildCommonPcf({ components, injectedPipes, pipelineRef, cfg, logFn, legacyEmitter })
 *     -> { pcfText, model, diagnostics, meta }
 */

import { runSyntaxCheck } from './syntax-checker.js';

const COMMON_BUILDER_VERSION = 'phase1.0.0';

const EMIT_TYPES = new Set([
  'PIPE',
  'FLANGE',
  'FBLI',
  'BEND',
  'TEE',
  'OLET',
  'VALVE',
  'REDU',
  'REDUCER-CONCENTRIC',
  'REDUCER-ECCENTRIC',
  'SUPPORT'
]);

const SKIP_TYPES = new Set(['GASK', 'PCOM', 'MISC', 'WELD', 'ATTA', 'INST']);

function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function cleanText(v) {
  return String(v ?? '').replace(/=/g, '').trim();
}

function clonePoint(pt) {
  if (!pt || typeof pt !== 'object') return null;
  const x = n(pt.x, NaN);
  const y = n(pt.y, NaN);
  const z = n(pt.z, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}

function buildCa(comp) {
  const ca = {};
  for (let i = 1; i <= 10; i++) {
    const direct = comp?.[`ca${i}`];
    const nested = comp?.ca?.[String(i)] ?? comp?.ca?.[i];
    const val = direct ?? nested;
    if (val != null && val !== '') ca[String(i)] = String(val).trim();
  }
  if (comp?.weight != null && comp.weight !== '' && (ca['8'] == null || ca['8'] === '')) {
    ca['8'] = String(comp.weight).trim();
  }
  return ca;
}

function normalizeType(type) {
  const t = String(type || '').trim().toUpperCase();
  if (t === 'REDU') return 'REDUCER-CONCENTRIC';
  if (t === 'FBLI') return 'FLANGE';
  return t;
}

function blockTypeForDiagnostics(comp) {
  return normalizeType(comp?.type);
}

function normalizeComponent(comp, sourceKind = 'component', index = 0) {
  const rawType = String(comp?.type || '').trim().toUpperCase();
  const type = normalizeType(rawType);
  const ca = buildCa(comp || {});
  const refNo = cleanText(comp?.ca97 || comp?.refNo || comp?.fromRefNo || '');
  const seqNo = comp?.seqNo ?? index + 1;

  return {
    id: `${sourceKind}:${refNo || rawType || 'UNKNOWN'}:${index + 1}`,
    sourceKind,
    rawType,
    type,
    emitEligible: EMIT_TYPES.has(rawType) || EMIT_TYPES.has(type),
    skipReason: SKIP_TYPES.has(rawType) ? 'non-fitting passthrough' : '',
    refNo,
    seqNo,
    bore: n(comp?.bore, 0),
    branchBore: comp?.branchBore == null || comp.branchBore === '' ? null : n(comp.branchBore, 0),
    ep1: clonePoint(comp?.ep1),
    ep2: clonePoint(comp?.ep2),
    cp: clonePoint(comp?.cp),
    bp: clonePoint(comp?.bp),
    supportCoor: clonePoint(comp?.supportCoor || comp?.supportCoord || comp?.cp),
    skey: cleanText(comp?.skey || ''),
    supportName: cleanText(comp?.supportName || ''),
    supportGuid: cleanText(comp?.supportGuid || ''),
    angleDeg: comp?.angleDeg ?? (rawType === 'BEND' || type === 'BEND' ? 90 : null),
    radius: comp?.radius ?? comp?.bendRadius ?? null,
    ca,
    source: {
      originalRefNo: cleanText(comp?.refNo || ''),
      ca97: cleanText(comp?.ca97 || ''),
      fromRefNo: cleanText(comp?.fromRefNo || ''),
      toRefNo: cleanText(comp?.toRefNo || ''),
    }
  };
}

function countByType(blocks) {
  const out = {};
  for (const b of blocks) out[b.type] = (out[b.type] || 0) + 1;
  return out;
}

function makeModel({ components = [], injectedPipes = [], pipelineRef = '', cfg = {} }) {
  const componentBlocks = (Array.isArray(components) ? components : [])
    .map((c, i) => normalizeComponent(c, 'component', i));
  const bridgeBlocks = (Array.isArray(injectedPipes) ? injectedPipes : [])
    .map((c, i) => normalizeComponent({ ...c, type: 'PIPE' }, 'bridge', i));

  return {
    engine: 'common',
    version: COMMON_BUILDER_VERSION,
    pipelineRef: cleanText(pipelineRef),
    cfgSnapshot: {
      decimalPrecision: cfg?.decimalPrecision,
      windowsLineEndings: cfg?.windowsLineEndings,
      maxEpCoordValue: cfg?.maxEpCoordValue,
      supportDefaultCoor: cfg?.supportDefaultCoor,
    },
    blocks: [...componentBlocks, ...bridgeBlocks],
    componentBlocks,
    bridgeBlocks,
    summary: {
      inputComponents: componentBlocks.length,
      injectedPipes: bridgeBlocks.length,
      emitEligible: [...componentBlocks, ...bridgeBlocks].filter(b => b.emitEligible).length,
      skipped: [...componentBlocks, ...bridgeBlocks].filter(b => b.skipReason).length,
      byType: countByType([...componentBlocks, ...bridgeBlocks]),
    }
  };
}

function preflightModel(model) {
  const errors = [];
  const warnings = [];
  const infos = [];

  if (!model.pipelineRef) {
    warnings.push({
      id: 'CB-001',
      severity: 'WARNING',
      type: 'HEADER',
      message: 'PIPELINE-REFERENCE is blank',
      detail: 'Common builder received an empty pipelineRef',
      fixHint: 'Run Pipeline Ref lookup or ensure Stage 1 derives PIPELINE-REFERENCE'
    });
  }

  for (const block of model.blocks) {
    if (block.skipReason) {
      infos.push({
        id: 'CB-010',
        severity: 'INFO',
        type: block.type,
        message: `${block.rawType} skipped from PCF emission`,
        detail: block.skipReason,
        fixHint: ''
      });
      continue;
    }

    if (!block.emitEligible) {
      warnings.push({
        id: 'CB-011',
        severity: 'WARNING',
        type: block.rawType || block.type,
        message: `Unknown component type: ${block.rawType || block.type}`,
        detail: `RefNo: ${block.refNo || '?'}`,
        fixHint: 'Add the type to Common Builder mapping or upstream typeMap'
      });
    }

    if (['PIPE', 'FLANGE', 'VALVE', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC'].includes(block.type)) {
      if (!block.ep1 || !block.ep2) {
        errors.push({
          id: 'CB-020',
          severity: 'ERROR',
          type: block.type,
          message: `${block.type} missing END-POINT geometry`,
          detail: `RefNo: ${block.refNo || '?'}`,
          fixHint: 'Check EP1/EP2 in Stage 1/Stage 3 before emitting PCF'
        });
      }
    }

    if (block.type === 'BEND' && (!block.ep1 || !block.ep2 || !block.cp)) {
      errors.push({
        id: 'CB-021',
        severity: 'ERROR',
        type: 'BEND',
        message: 'BEND missing EP1/EP2/CP geometry',
        detail: `RefNo: ${block.refNo || '?'}`,
        fixHint: 'BEND requires two END-POINTs and one CENTRE-POINT'
      });
    }

    if (block.type === 'TEE' && (!block.ep1 || !block.ep2 || !block.cp || !block.bp)) {
      errors.push({
        id: 'CB-022',
        severity: 'ERROR',
        type: 'TEE',
        message: 'TEE missing EP1/EP2/CP/BP geometry',
        detail: `RefNo: ${block.refNo || '?'}`,
        fixHint: 'TEE requires END-POINTs, CENTRE-POINT and BRANCH1-POINT'
      });
    }

    if (block.type === 'OLET' && (!block.cp || !block.bp)) {
      errors.push({
        id: 'CB-023',
        severity: 'ERROR',
        type: 'OLET',
        message: 'OLET missing CP/BP geometry',
        detail: `RefNo: ${block.refNo || '?'}`,
        fixHint: 'OLET requires CENTRE-POINT and BRANCH1-POINT'
      });
    }
  }

  return { errors, warnings, infos };
}

function checkerComponents(model) {
  return model.blocks
    .filter(b => !b.skipReason && b.emitEligible)
    .map(b => ({
      ...b,
      type: blockTypeForDiagnostics(b),
      ca: b.ca,
      refNo: b.refNo,
      seqNo: b.seqNo,
    }));
}

function mergeDiagnostics(preflight, syntax) {
  return {
    errors: [...(preflight.errors || []), ...(syntax.errors || [])],
    warnings: [...(preflight.warnings || []), ...(syntax.warnings || [])],
    infos: [...(preflight.infos || []), ...(syntax.infos || [])],
  };
}

export function buildCommonPcf({
  components = [],
  injectedPipes = [],
  pipelineRef = '',
  cfg = {},
  logFn = () => {},
  legacyEmitter = null,
} = {}) {
  const startedAt = Date.now();
  const model = makeModel({ components, injectedPipes, pipelineRef, cfg });
  const preflight = preflightModel(model);
  const syntax = runSyntaxCheck(checkerComponents(model), cfg);
  const diagnostics = mergeDiagnostics(preflight, syntax);

  logFn('S4', 'common-builder-model-built', '', {
    version: COMMON_BUILDER_VERSION,
    blocks: model.blocks.length,
    components: model.summary.inputComponents,
    bridges: model.summary.injectedPipes,
    errors: diagnostics.errors.length,
    warnings: diagnostics.warnings.length,
    infos: diagnostics.infos.length,
  });

  if (typeof legacyEmitter !== 'function') {
    throw new Error('Common PCF Builder Phase 1 requires a legacyEmitter callback for text emission.');
  }

  // Phase 1: legacy text emission is intentionally delegated after Common model
  // normalization/diagnostics. Phase 2 replaces this with emitPcfModel(model, cfg).
  const legacyResult = legacyEmitter(components, injectedPipes, pipelineRef, logFn);
  const pcfText = legacyResult?.pcfText || '';

  const meta = {
    engine: 'common',
    phase: 'phase1-delegates-to-legacy-emitter',
    builderVersion: COMMON_BUILDER_VERSION,
    emittedBy: 'legacy-emitter-delegate',
    startedAt,
    finishedAt: Date.now(),
    lineCount: pcfText ? pcfText.split(/\r?\n/).length : 0,
    diagnostics: {
      errors: diagnostics.errors.length,
      warnings: diagnostics.warnings.length,
      infos: diagnostics.infos.length,
    },
    summary: model.summary,
  };

  try {
    window.__COMMON_PCF_BUILDER_LAST_RUN__ = { meta, model, diagnostics };
  } catch (_) {
    // non-browser execution
  }

  logFn('S4', 'common-builder-emitted', '', meta);

  return {
    pcfText,
    model,
    diagnostics,
    meta,
  };
}

export function normalizeToPcfModel(args = {}) {
  return makeModel(args);
}
