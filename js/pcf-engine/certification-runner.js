/**
 * certification-runner.js — Phase 5F Common PCF certification runner
 *
 * Combines:
 * - Common builder metadata/diff gate
 * - SKEY validator
 * - Formula validator
 * - Fallback validator
 * - ASME table certification
 * - PCF output syntax validator
 */

import { evaluatePcfDiffGate } from './pcf-diff-gate.js';
import { validateSkeyRows, validateSkeyInPcfText } from './validators/skey-validator.js';
import { validateFormulaRows } from './validators/formula-validator.js';
import { validateFallbackRows } from './validators/fallback-validator.js';
import { validateAsmeCertification } from './validators/asme-table-validator.js';
import { validatePcfOutputText } from './validators/pcf-output-validator.js';

function errors(result){ return result?.summary?.errors ?? result?.gate?.summary?.errors ?? 0; }
function countErrors(results){ return results.reduce((a,r)=>a+Number(errors(r)||0),0); }
function synthesizeDiffWhenAllowed(diff, meta, options) {
  if (diff || options.requireLegacyCommonDiff !== false) return diff;
  const commonBlockCount = Number(meta?.blockCount ?? 0);
  return {
    pass: true,
    synthetic: true,
    summary: {
      legacyBlockCount: 0,
      commonBlockCount,
      total: 0,
      critical: 0,
      major: 0,
      minor: 0,
    },
    diffs: [],
  };
}

export function runCommonPcfCertification(input = {}, options = {}) {
  const rows = input.rows || input.model?.blocks || [];
  const pcfText = input.pcfText || input.commonText || input.meta?.commonText || '';
  const meta = input.meta || {};
  const diff = synthesizeDiffWhenAllowed(input.diff || null, meta, options);

  const gate = evaluatePcfDiffGate(diff, {
    maxCritical: options.maxCritical ?? 0,
    maxMajor: options.maxMajor ?? 0,
    maxMinor: options.maxMinor ?? Infinity,
    requireLegacyCommonDiff: options.requireLegacyCommonDiff !== false,
    requireCommonBlocks: true,
  });

  const skeyRows = validateSkeyRows(rows, options.skey || {});
  const skeyText = pcfText ? validateSkeyInPcfText(pcfText, options.skey || {}) : { pass:true, diagnostics:[], summary:{errors:0,warnings:0} };
  const formulas = validateFormulaRows(rows, options.formula || {});
  const fallbacks = validateFallbackRows(rows, options.fallback || {});
  const asme = options.skipAsme === true ? { pass:true, diagnostics:[], summary:{errors:0,warnings:0} } : validateAsmeCertification(options.asme || {});
  const output = pcfText ? validatePcfOutputText(pcfText, options.output || {}) : { pass:false, diagnostics:[{severity:'error',code:'CERT-NO-PCF-TEXT',message:'No Common PCF text supplied.'}], summary:{errors:1,warnings:0,blocks:0} };

  const results = [skeyRows, skeyText, formulas, fallbacks, asme, output];
  const validatorErrors = countErrors(results);
  const commonPathOk = meta?.emittedBy === 'pcf-model-emitter' || input?.emitResult?.meta?.emittedBy === 'pcf-model-emitter';
  const diagnosticsErrors = Number(meta?.diagnostics?.errors ?? 0);

  const reasons = [];
  if (!commonPathOk) reasons.push('Common path proof missing: expected emittedBy=pcf-model-emitter.');
  if (diagnosticsErrors > 0) reasons.push(`Common diagnostics has ${diagnosticsErrors} errors.`);
  if (!gate.pass) reasons.push(...gate.reasons.map(r => `Diff gate: ${r}`));
  if (validatorErrors > 0) reasons.push(`Validators reported ${validatorErrors} errors.`);

  const pass = reasons.length === 0;
  return {
    pass,
    status: pass ? 'PASS' : 'FAIL',
    reasons,
    summary: {
      commonPathOk,
      diagnosticsErrors,
      diffCritical: gate.summary.critical,
      diffMajor: gate.summary.major,
      diffMinor: gate.summary.minor,
      validatorErrors,
      skeyErrors: skeyRows.summary.errors + skeyText.summary.errors,
      formulaErrors: formulas.summary.errors,
      fallbackErrors: fallbacks.summary.errors,
      asmeErrors: asme.summary.errors,
      outputErrors: output.summary.errors,
    },
    sections: { gate, skeyRows, skeyText, formulas, fallbacks, asme, output },
  };
}

export function runLastCommonPcfCertification(options = {}) {
  const run = typeof window !== 'undefined' ? window.__COMMON_PCF_BUILDER_LAST_RUN__ : null;
  if (!run) return { pass:false, status:'FAIL', reasons:['No __COMMON_PCF_BUILDER_LAST_RUN__ object found.'], summary:{ validatorErrors:1 }, sections:{} };
  return runCommonPcfCertification({ rows: run.model?.blocks || [], pcfText: run.commonText || run.pcfText || '', diff: run.diff || null, meta: run.meta || {}, emitResult: run.emitResult || null }, options);
}

export function printLastCommonPcfCertification(options = {}) {
  const result = runLastCommonPcfCertification(options);
  if (typeof console !== 'undefined') {
    console.log(`[Common PCF Certification] ${result.status}`, result.summary, result.reasons);
    for (const [name, section] of Object.entries(result.sections || {})) {
      const diags = section?.diagnostics || [];
      if (diags.length) {
        console.groupCollapsed(`${name}: ${diags.length} diagnostics`);
        console.table(diags.slice(0, options.previewLimit ?? 50));
        console.groupEnd();
      }
    }
  }
  return result;
}

try { if (typeof window !== 'undefined') { window.runCommonPcfCertification = runCommonPcfCertification; window.runLastCommonPcfCertification = runLastCommonPcfCertification; window.printLastCommonPcfCertification = printLastCommonPcfCertification; } } catch (_) {}
