/**
 * common-pcf-builder.js — Common PCF Builder
 *
 * Purpose:
 *   Build a canonical model, run Phase 4 smart preprocessing, run common
 *   diagnostics, emit PCF using the Common model emitter, optionally diff against
 *   legacy output, and evaluate the certification gate.
 */

import { runSyntaxCheck } from './syntax-checker.js';
import { emitPcfModel } from './pcf-model-emitter.js';
import { diffPcfOutputs } from './pcf-output-diff.js';
import { evaluatePcfDiffGate } from './pcf-diff-gate.js';
import { syncGeometryRows } from './geometry-sync.js';
import { applyCpBpFallbacks } from './cp-bp-fallbacks.js';
import { resolveBrlenRows } from './brlen-resolver.js';
import { applyCalculatedColumns } from './calculated-columns.js';
import { applySupportMappings } from './support-mapper.js';

const COMMON_BUILDER_VERSION = 'phase4g.0.0';

const EMIT_TYPES = new Set(['PIPE','FLANGE','FBLI','BEND','TEE','OLET','VALVE','REDU','REDUCER-CONCENTRIC','REDUCER-ECCENTRIC','SUPPORT']);
const SKIP_TYPES = new Set(['GASK', 'PCOM', 'MISC', 'WELD', 'ATTA', 'INST']);
function n(v, fallback = 0) { const x = Number(v); return Number.isFinite(x) ? x : fallback; }
function cleanText(v) { return String(v ?? '').replace(/=/g, '').trim(); }
function clonePoint(pt) { if (!pt || typeof pt !== 'object') return null; const x = n(pt.x, NaN), y = n(pt.y, NaN), z = n(pt.z, NaN); return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null; }
function buildCa(comp) {
  const ca = {};
  for (let i = 1; i <= 10; i++) {
    const direct = comp?.[`ca${i}`];
    const nested = comp?.ca?.[String(i)] ?? comp?.ca?.[i];
    const val = direct ?? nested;
    if (val != null && val !== '') ca[String(i)] = String(val).trim();
  }
  if (comp?.weight != null && comp.weight !== '' && (ca['8'] == null || ca['8'] === '')) ca['8'] = String(comp.weight).trim();
  return ca;
}
function normalizeType(type) { const t = String(type || '').trim().toUpperCase(); if (t === 'REDU') return 'REDUCER-CONCENTRIC'; if (t === 'FBLI') return 'FLANGE'; return t; }
function blockTypeForDiagnostics(comp) { return normalizeType(comp?.type); }
function normalizeComponent(comp, sourceKind = 'component', index = 0) {
  const rawType = String(comp?.type || '').trim().toUpperCase();
  const type = normalizeType(rawType);
  const ca = buildCa(comp || {});
  const refNo = cleanText(comp?.ca97 || comp?.refNo || comp?.fromRefNo || '');
  const seqNo = comp?.seqNo ?? index + 1;
  return {
    ...comp,
    id: comp?.id || `${sourceKind}:${refNo || rawType || 'UNKNOWN'}:${index + 1}`,
    sourceKind, rawType, type,
    emitEligible: EMIT_TYPES.has(rawType) || EMIT_TYPES.has(type),
    skipReason: SKIP_TYPES.has(rawType) ? 'non-fitting passthrough' : '',
    refNo, seqNo,
    csvSeqNo: comp?.csvSeqNo ?? comp?.seqNo ?? seqNo,
    bore: n(comp?.bore, 0),
    branchBore: comp?.branchBore == null || comp.branchBore === '' ? null : n(comp.branchBore, 0),
    ep1: clonePoint(comp?.ep1), ep2: clonePoint(comp?.ep2), cp: clonePoint(comp?.cp), bp: clonePoint(comp?.bp),
    supportCoor: clonePoint(comp?.supportCoor || comp?.supportCoord || comp?.cp),
    skey: cleanText(comp?.skey || ''),
    supportName: cleanText(comp?.supportName || ''),
    supportGuid: cleanText(comp?.supportGuid || ''),
    angleDeg: comp?.angleDeg ?? (rawType === 'BEND' || type === 'BEND' ? 90 : null),
    radius: comp?.radius ?? comp?.bendRadius ?? null,
    brlen: comp?.brlen ?? comp?.branchLength ?? '',
    weight: comp?.weight ?? comp?.directWeight ?? '',
    ca,
    ca97: comp?.ca97 ?? refNo,
    ca98: comp?.ca98 ?? seqNo,
    source: { originalRefNo: cleanText(comp?.refNo || ''), ca97: cleanText(comp?.ca97 || ''), fromRefNo: cleanText(comp?.fromRefNo || ''), toRefNo: cleanText(comp?.toRefNo || '') }
  };
}
function countByType(blocks) { const out = {}; for (const b of blocks) out[b.type] = (out[b.type] || 0) + 1; return out; }
function collectModuleDiagnostics(rows, key) { return (rows || []).flatMap(r => Array.isArray(r?.[key]) ? r[key] : []); }
function preprocessRows(rows, cfg, label) {
  const geometry = syncGeometryRows(rows);
  const cpbp = applyCpBpFallbacks(geometry.rows, { cfg });
  const brlen = resolveBrlenRows(cpbp.rows, { cfg });
  const calculated = applyCalculatedColumns(brlen.rows, { cfg });
  const supports = applySupportMappings(calculated.rows, cfg);
  const out = supports.rows.map((r, i) => ({
    ...r,
    id: r.id || `${label}:${r.refNo || r.rawType || r.type || 'UNKNOWN'}:${i + 1}`,
    phase4g: {
      geometry: r.geometrySync || null,
      brlen: r.brlenResolution || null,
      support: r.supportMapping || null,
      calculated: r.calculatedColumns || null,
    }
  }));
  return {
    rows: out,
    summary: {
      label,
      geometry: geometry.summary,
      cpbp: cpbp.summary,
      brlen: brlen.summary,
      calculated: calculated.summary,
      supports: supports.summary,
    },
    diagnostics: [
      ...collectModuleDiagnostics(cpbp.rows, 'cpBpFallbackDiagnostics'),
      ...collectModuleDiagnostics(brlen.rows, 'brlenResolution').flatMap(x => x?.diagnostics || []),
      ...collectModuleDiagnostics(supports.rows, 'supportMapping').flatMap(x => x?.diagnostics || []),
    ]
  };
}
function makeModel({ components = [], injectedPipes = [], pipelineRef = '', cfg = {} }) {
  const rawComponentBlocks = (Array.isArray(components) ? components : []).map((c, i) => normalizeComponent(c, 'component', i));
  const rawBridgeBlocks = (Array.isArray(injectedPipes) ? injectedPipes : []).map((c, i) => normalizeComponent({ ...c, type: 'PIPE' }, 'bridge', i));
  const componentPrep = preprocessRows(rawComponentBlocks, cfg, 'component');
  const bridgePrep = preprocessRows(rawBridgeBlocks, cfg, 'bridge');
  const componentBlocks = componentPrep.rows;
  const bridgeBlocks = bridgePrep.rows;
  const blocks = [...componentBlocks, ...bridgeBlocks];
  const phase4g = { component: componentPrep.summary, bridge: bridgePrep.summary, diagnostics: [...componentPrep.diagnostics, ...bridgePrep.diagnostics] };
  return { engine: 'common', version: COMMON_BUILDER_VERSION, pipelineRef: cleanText(pipelineRef), cfgSnapshot: { decimalPrecision: cfg?.decimalPrecision, windowsLineEndings: cfg?.windowsLineEndings, maxEpCoordValue: cfg?.maxEpCoordValue, supportDefaultCoor: cfg?.supportDefaultCoor }, blocks, componentBlocks, bridgeBlocks, phase4g, summary: { inputComponents: componentBlocks.length, injectedPipes: bridgeBlocks.length, emitEligible: blocks.filter(b => b.emitEligible).length, skipped: blocks.filter(b => b.skipReason).length, byType: countByType(blocks) } };
}
function preflightModel(model) {
  const errors = [], warnings = [], infos = [];
  if (!model.pipelineRef) warnings.push({ id: 'CB-001', severity: 'WARNING', type: 'HEADER', message: 'PIPELINE-REFERENCE is blank', detail: 'Common builder received an empty pipelineRef', fixHint: 'Run Pipeline Ref lookup or ensure Stage 1 derives PIPELINE-REFERENCE' });
  for (const d of model.phase4g?.diagnostics || []) {
    const sev = String(d.severity || '').toLowerCase();
    const item = { id: d.code || 'CB-4G', severity: sev === 'error' ? 'ERROR' : sev === 'warning' ? 'WARNING' : 'INFO', type: d.type || 'PHASE4G', message: d.message || 'Phase 4G preprocessing diagnostic', detail: JSON.stringify(d), fixHint: '' };
    if (item.severity === 'ERROR') errors.push(item); else if (item.severity === 'WARNING') warnings.push(item); else infos.push(item);
  }
  for (const block of model.blocks) {
    if (block.skipReason) { infos.push({ id: 'CB-010', severity: 'INFO', type: block.type, message: `${block.rawType} skipped from PCF emission`, detail: block.skipReason, fixHint: '' }); continue; }
    if (!block.emitEligible) warnings.push({ id: 'CB-011', severity: 'WARNING', type: block.rawType || block.type, message: `Unknown component type: ${block.rawType || block.type}`, detail: `RefNo: ${block.refNo || '?'}`, fixHint: 'Add the type to Common Builder mapping or upstream typeMap' });
    if (['PIPE','FLANGE','VALVE','REDUCER-CONCENTRIC','REDUCER-ECCENTRIC'].includes(block.type) && (!block.ep1 || !block.ep2)) errors.push({ id: 'CB-020', severity: 'ERROR', type: block.type, message: `${block.type} missing END-POINT geometry`, detail: `RefNo: ${block.refNo || '?'}`, fixHint: 'Check EP1/EP2 in Stage 1/Stage 3 before emitting PCF' });
    if (block.type === 'BEND' && (!block.ep1 || !block.ep2 || !block.cp)) errors.push({ id: 'CB-021', severity: 'ERROR', type: 'BEND', message: 'BEND missing EP1/EP2/CP geometry', detail: `RefNo: ${block.refNo || '?'}`, fixHint: 'BEND requires two END-POINTs and one CENTRE-POINT' });
    if (block.type === 'TEE' && (!block.ep1 || !block.ep2 || !block.cp || !block.bp)) errors.push({ id: 'CB-022', severity: 'ERROR', type: 'TEE', message: 'TEE missing EP1/EP2/CP/BP geometry', detail: `RefNo: ${block.refNo || '?'}`, fixHint: 'TEE requires END-POINTs, CENTRE-POINT and BRANCH1-POINT' });
    if (block.type === 'OLET' && (!block.cp || !block.bp)) errors.push({ id: 'CB-023', severity: 'ERROR', type: 'OLET', message: 'OLET missing CP/BP geometry', detail: `RefNo: ${block.refNo || '?'}`, fixHint: 'OLET requires CENTRE-POINT and BRANCH1-POINT' });
  }
  return { errors, warnings, infos };
}
function checkerComponents(model) { return model.blocks.filter(b => !b.skipReason && b.emitEligible).map(b => ({ ...b, type: blockTypeForDiagnostics(b), ca: b.ca, refNo: b.refNo, seqNo: b.seqNo })); }
function mergeDiagnostics(preflight, syntax) { return { errors: [...(preflight.errors || []), ...(syntax.errors || [])], warnings: [...(preflight.warnings || []), ...(syntax.warnings || [])], infos: [...(preflight.infos || []), ...(syntax.infos || [])] }; }
function gateOptionsFromConfig(cfg = {}) { return { maxCritical: cfg.commonBuilderGateMaxCritical ?? 0, maxMajor: cfg.commonBuilderGateMaxMajor ?? 0, maxMinor: cfg.commonBuilderGateMaxMinor ?? Infinity, requireLegacyCommonDiff: cfg.commonBuilderRunLegacyDiff !== false, requireCommonBlocks: true }; }
export function buildCommonPcf({ components = [], injectedPipes = [], pipelineRef = '', cfg = {}, logFn = () => {}, legacyEmitter = null } = {}) {
  const startedAt = Date.now();
  const model = makeModel({ components, injectedPipes, pipelineRef, cfg });
  const preflight = preflightModel(model);
  const syntax = runSyntaxCheck(checkerComponents(model), cfg);
  const diagnostics = mergeDiagnostics(preflight, syntax);
  logFn('S4', 'common-builder-model-built', '', { version: COMMON_BUILDER_VERSION, blocks: model.blocks.length, components: model.summary.inputComponents, bridges: model.summary.injectedPipes, errors: diagnostics.errors.length, warnings: diagnostics.warnings.length, infos: diagnostics.infos.length, phase4g: model.phase4g?.component });
  const emitResult = emitPcfModel(model, cfg);
  const pcfText = emitResult.pcfText || '';
  let legacyText = '';
  let diff = null;
  if (typeof legacyEmitter === 'function' && cfg?.commonBuilderRunLegacyDiff !== false) {
    try {
      const legacyResult = legacyEmitter(components, injectedPipes, pipelineRef, logFn);
      legacyText = legacyResult?.pcfText || '';
      diff = diffPcfOutputs(legacyText, pcfText, { coordTolerance: cfg?.commonBuilderDiffTolerance ?? 0.001 });
    } catch (err) {
      diff = { pass: false, summary: { legacyBlockCount: 0, commonBlockCount: emitResult.meta.blockCount, total: 1, critical: 1, major: 0, minor: 0 }, diffs: [{ severity: 'critical', path: 'legacyEmitter', legacy: '', common: '', message: err?.message || String(err) }] };
    }
  }
  const gate = evaluatePcfDiffGate(diff, gateOptionsFromConfig(cfg));
  const meta = { engine: 'common', phase: 'phase4g-smart-preprocessed-common-emitter', builderVersion: COMMON_BUILDER_VERSION, emittedBy: 'pcf-model-emitter', startedAt, finishedAt: Date.now(), lineCount: pcfText ? pcfText.split(/\r?\n/).length : 0, blockCount: emitResult.meta.blockCount, diagnostics: { errors: diagnostics.errors.length, warnings: diagnostics.warnings.length, infos: diagnostics.infos.length }, phase4g: model.phase4g, diffSummary: diff?.summary || null, diffPass: diff?.pass ?? null, gate, gatePass: gate.pass, gateStatus: gate.status, summary: model.summary };
  try { window.__COMMON_PCF_BUILDER_LAST_RUN__ = { meta, model, diagnostics, legacyText, commonText: pcfText, diff, gate, emitResult }; } catch (_) {}
  logFn('S4', 'common-builder-emitted', '', meta);
  logFn('S4', 'common-builder-gate', '', { status: gate.status, summary: gate.summary, reasons: gate.reasons });
  return { pcfText, model, diagnostics, emitResult, legacyText, diff, gate, meta };
}
export function normalizeToPcfModel(args = {}) { return makeModel(args); }
