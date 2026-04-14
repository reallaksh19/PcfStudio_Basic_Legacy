/**
 * output-tab.js — OUTPUT Tab UI (Rewritten for Two-Mode Architecture)
 *
 * btn-generate       → Phase 1 PCF (raw CSV, no CA) → pcfPass1Lines
 * btn-generate-final → Phase 2 PCF (Table Form edits, with CA) → pcfLines
 * btn-download-pcf   → Download pcfLines
 */

import { getConfig } from '../config/config-store.js';
import { getState, setState, subscribe } from '../state.js';
import { buildPhase1PCF } from '../output/pcf-builder.js';
import { downloadPCF } from '../output/pcf-writer.js';

const LOG_PREFIX = '[OutputTab]';

let _dom = {};

export function initOutputTab() {
  _dom = {
    generateBtn: document.getElementById('btn-generate'),
    generateFinalBtn: document.getElementById('btn-generate-final'),
    showOutputPcfBtn: document.getElementById('btn-show-output-pcf'),
    runSanitizerBtn: document.getElementById('btn-run-sanitizer'),
    downloadBtn: document.getElementById('btn-download-pcf'),
    statusSpan: document.getElementById('validation-summary'),
    errorDiv: document.getElementById('output-error'),
    logEl: document.getElementById('log-output'),
    pcfPreview: document.getElementById('pcf-preview-output'),
    sanitizerLogs: document.getElementById('pcf-sanitizer-logs'),
    copyBtn: document.getElementById('btn-copy-output-pcf'),
  };

  const missing = Object.entries(_dom).filter(([, v]) => !v && v !== _dom.logEl).map(([k]) => k);
  if (missing.length) console.warn(`${LOG_PREFIX} Missing DOM: ${missing.join(', ')}`);

  _dom.generateBtn?.addEventListener('click', _runPhase1);
  _dom.generateFinalBtn?.addEventListener('click', _runPhase2);
  _dom.showOutputPcfBtn?.addEventListener('click', _showOutputPcf);
  _dom.runSanitizerBtn?.addEventListener('click', _runSanitizer);
  _dom.copyBtn?.addEventListener('click', _copyPreview);
  _dom.downloadBtn?.addEventListener('click', _runDownload);

  // Hide "Download (Filtered)" if it still exists in DOM
  const filteredBtn = document.getElementById('btn-download-pcf-filtered');
  if (filteredBtn) filteredBtn.style.display = 'none';

  // Reactively enable download when pcfLines changes
  subscribe('pcfLines', lines => {
    if (_dom.downloadBtn) {
       _dom.downloadBtn.disabled = !lines?.length;
       if (lines?.length) _dom.downloadBtn.style.display = 'inline-block';
    }
    _renderPreview();
  });

  // Reflect existing pcfLines if already generated
  const existing = getState('pcfLines');
  if (existing?.length) {
    if (_dom.downloadBtn) {
        _dom.downloadBtn.disabled = false;
        _dom.downloadBtn.style.display = 'inline-block';
    }
    _showStatus(`✓ PCF ready (${existing.length} lines). Click Download to save.`, 'ok');
    _renderPreview();
  }

  console.info(`${LOG_PREFIX} Output tab initialised.`);
}

// ── Phase 1 — CSV → raw PCF (no CA) ───────────────────────────────

async function _runPhase1() {
  const normalizedRows = getState('normalizedRows');
  if (!normalizedRows?.length) {
    _showError('Load and parse a CSV file in the INPUT tab first.');
    return;
  }
  _hideError();
  _setBtn(_dom.generateBtn, true, '⏳ Generating Phase 1…', '⚙ Generate Phase 1 PCF');

  try {
    const config = getConfig();
    const tolerance = parseFloat(
      document.getElementById('pcf-table-tolerance')?.value || '6'
    );

    const { lines, groups, seqResult, anomalies } = buildPhase1PCF(
      normalizedRows, config, tolerance
    );

    // Persist results to state
    setState('pcfPass1Lines', lines);
    setState('pcfLines', lines);  // Also update pcfLines so preview/download reflects Phase 1
    setState('groups', groups);
    setState('topology', seqResult?.topology);
    setState('traversalOrder', seqResult?.ordered);

    // Merge anomalies into validation report
    if (anomalies?.length) {
      const report = getState('validationReport') ?? {};
      report.anomaly = [...(report.anomaly ?? []), ...anomalies];
      setState('validationReport', report);
    }

    const n = seqResult?.ordered?.length ?? 0;
    const o = seqResult?.orphans?.length ?? 0;
    const note = o ? ` (${o} orphan${o > 1 ? 's' : ''})` : '';
    _showStatus(`✓ Phase 1: ${n} component${n !== 1 ? 's' : ''}${note}. Phase 1 PCF stored.`, 'ok');
    console.info(`${LOG_PREFIX} Phase 1 done. ${lines.length} lines.`);
    _renderLog();

  } catch (err) {
    console.error(`${LOG_PREFIX} Phase 1 error:`, err);
    _showError(`Phase 1 failed: ${err.message}`);
    _showStatus('✗ Phase 1 failed.', 'error');
  } finally {
    _setBtn(_dom.generateBtn, false, '', '⚙ Generate Phase 1 PCF');
  }
}

// ── Phase 2 — Table Form → full PCF (with CA) ─────────────────────

function _showOutputPcf() {
    _setBtn(_dom.showOutputPcfBtn, true, '📄 Loading...', '📄 Show Output PCF');
    document.dispatchEvent(new Event('pcf:regenerate-request-no-sanitizer'));
    setTimeout(() => {
      const pcfLines = getState('pcfLines');
      if (pcfLines?.length) {
        _showStatus(`✓ Raw Output PCF ready (${pcfLines.length} lines). Click Download to save.`, 'ok');
        _dom.downloadBtn.style.display = 'inline-block';
        if (_dom.sanitizerLogs) {
            _dom.sanitizerLogs.textContent = "Sanitizer bypassed. Showing raw PCF output.";
            _dom.sanitizerLogs.style.color = "var(--text-muted)";
        }
      } else {
        _showError('Generation failed or produced no output.');
      }
      _setBtn(_dom.showOutputPcfBtn, false, '', '📄 Show Output PCF');
    }, 300);
}

function _runSanitizer() {
  _setBtn(_dom.runSanitizerBtn, true, '🛡️ Sanitizing...', '🛡️ Run Sanitizer');

  if (_dom.sanitizerLogs) {
      _dom.sanitizerLogs.textContent = "Running PCF Sanitizer Engine...\n";
      _dom.sanitizerLogs.style.color = "#0f0";
  }

  // Set a flag or use event detail if we need to pass data,
  // but since we are relying on custom events, we just trigger it.
  document.dispatchEvent(new Event('pcf:regenerate-request'));
  setTimeout(() => {
    const pcfLines = getState('pcfLines');
    const logs = window.SanitizerActionLogs || []; // We'll need to hook this up in pcf-sanitizer.js

    if (pcfLines?.length) {
      _showStatus(`✓ Sanitizer Complete. Final PCF ready (${pcfLines.length} lines). Click Download to save.`, 'ok');
      _dom.downloadBtn.style.display = 'inline-block';

      if (_dom.sanitizerLogs) {
          if (logs.length > 0) {
              _dom.sanitizerLogs.textContent += logs.join('\n');
          } else {
              _dom.sanitizerLogs.textContent += "\n✓ No sanitation rules triggered. PCF is clean.";
          }
      }
    } else {
      _showError('Sanitizer failed or produced no output.');
    }
    _setBtn(_dom.runSanitizerBtn, false, '', '🛡️ Run Sanitizer');
  }, 300);
}

function _runPhase2() {
  // Delegate to pcf-table-controller via custom event (avoids circular refs)
  _setBtn(_dom.generateFinalBtn, true, '⏳ Generating Final…', '⚙ Generate Final PCF with all Attributes');
  document.dispatchEvent(new Event('pcf:regenerate-request'));

  setTimeout(() => {
    const pcfLines = getState('pcfLines');
    if (pcfLines?.length) {
      _showStatus(`✓ Final PCF ready (${pcfLines.length} lines). Click Download to save.`, 'ok');
      _dom.downloadBtn.style.display = 'inline-block';
    } else {
      _showError('Final generation failed or produced no output.');
    }
    _setBtn(_dom.generateFinalBtn, false, '', '⚙ Generate Final PCF with all Attributes');
  }, 300);
}

// ── Download ───────────────────────────────────────────────────────

function _runDownload() {
  const pcfLines = getState('pcfLines');
  if (!pcfLines?.length) {
    _showError('Generate the PCF first before downloading.');
    return;
  }
  const config = getConfig();
  const meta = getState('meta');
  const baseName = (meta?.filename || 'output').replace(/\.[^.]+$/, '');
  downloadPCF(pcfLines, `${baseName}.pcf`, config);
  console.info(`${LOG_PREFIX} Download triggered: ${baseName}.pcf`);
}

// ── Log rendering ─────────────────────────────────────────────────

function _renderLog() {
  if (!_dom.logEl) return;
  const report = getState('validationReport');
  const issues = report
    ? [
      ...(report.input || []).map(i => ({ ...i, _label: 'INPUT' })),
      ...(report.continuity || []).map(i => ({ ...i, _label: 'CONTINUITY' })),
      ...(report.anomaly || []).map(i => ({ ...i, _label: 'ANOMALY' })),
    ]
    : [];
  _dom.logEl.textContent = issues.length
    ? issues.map(i => `[${i.severity}] [${i._label}] ${i.id}: ${i.message}`).join('\n')
    : '— no validation issues —';
}

// ── Preview rendering ─────────────────────────────────────────────

function _renderPreview() {
  if (!_dom.pcfPreview) return;
  const lines = getState('pcfLines');
  if (!lines?.length) {
    _dom.pcfPreview.innerHTML = '<span style="color:var(--text-muted)">Generate Final PCF to see preview…</span>';
    if (_dom.copyBtn) _dom.copyBtn.style.display = 'none';
    return;
  }
  _dom.pcfPreview.textContent = lines.join('\n');
  if (_dom.copyBtn) _dom.copyBtn.style.display = 'block';
}

async function _copyPreview() {
  const lines = getState('pcfLines');
  if (!lines?.length) return;
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    if (_dom.copyBtn) {
      const orig = _dom.copyBtn.innerHTML;
      _dom.copyBtn.innerHTML = '✅';
      setTimeout(() => _dom.copyBtn.innerHTML = orig, 1500);
    }
  } catch { alert('Failed to copy to clipboard'); }
}

// ── UI helpers ────────────────────────────────────────────────────

function _setBtn(el, loading, loadingText, idleText) {
  if (!el) return;
  el.disabled = loading;
  if (loading && loadingText) el.textContent = loadingText;
  else el.textContent = idleText;
}

function _showStatus(msg, type) {
  if (!_dom.statusSpan) return;
  const colors = { ok: 'var(--green-ok)', error: 'var(--red-err)', warn: 'var(--yellow-warn)' };
  _dom.statusSpan.textContent = msg;
  _dom.statusSpan.style.color = colors[type] || 'var(--text-muted)';
}

function _showError(msg) {
  if (!_dom.errorDiv) return;
  _dom.errorDiv.textContent = msg;
  _dom.errorDiv.style.display = 'block';
}

function _hideError() {
  if (_dom.errorDiv) _dom.errorDiv.style.display = 'none';
}
