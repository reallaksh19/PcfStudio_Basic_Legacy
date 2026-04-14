/**
 * validate-tab.js — VALIDATE tab: issue list with severity filter
 */
import { getState, setState, subscribe } from '../state.js';
import { validateInput } from '../validation/input-validator.js';
import { checkContinuity } from '../validation/continuity-checker.js';
import { detectAnomalies } from '../validation/anomaly-detector.js';
import { validateSyntax } from '../validation/syntax-validator.js';

export const initValidateTab = () => {
  const filterBtns = document.querySelectorAll('[data-filter]');
  filterBtns.forEach(btn => btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('filter-active'));
    btn.classList.add('filter-active');
    _renderIssues(btn.dataset.filter);
  }));

  const runBtn = document.getElementById('btn-run-validation');
  if (runBtn) {
    runBtn.addEventListener('click', runValidation);
  }

  subscribe('validationReport', () => _renderIssues('ALL'));
};

const runValidation = () => {
  const config = getState('config');
  const report = { input: [], continuity: [], anomaly: [], syntax: [] };
  let issueCount = 0;

  // 1. Input Validation
  const rows = getState('normalizedRows');
  if (rows?.length) {
    report.input = validateInput(rows, config);
    issueCount += report.input.length;
  }

  // 2. Continuity
  const groups = getState('groups');
  const topology = getState('topology');
  if (groups?.size && topology) {
    report.continuity = checkContinuity(topology, groups, config);
    issueCount += report.continuity.length;
  }

  // 3. Anomalies
  const traversalOrder = getState('traversalOrder');
  if (groups?.size && traversalOrder?.length) {
    report.anomaly = detectAnomalies(groups, traversalOrder, config);
    issueCount += report.anomaly.length;
  }

  // 4. Syntax
  const pcfLines = getState('pcfLines');
  if (pcfLines?.length) {
    report.syntax = validateSyntax(pcfLines, config);
    issueCount += report.syntax.length;
  }

  setState('validationReport', report);

  // Show/Hide empty state
  const empty = document.getElementById('validate-empty');
  const list = document.getElementById('issue-list');
  if (empty && list) {
    if (issueCount > 0) {
      empty.style.display = 'none';
      list.style.display = 'block';
    } else {
      empty.textContent = '✓ No issues found.';
      empty.style.display = 'block';
      list.style.display = 'none';
    }
  }

  console.info(`[Validation] Run complete. Issues: ${issueCount}`);
};

const _renderIssues = (filter = 'ALL') => {
  const report = getState('validationReport');
  if (!report) return;
  const container = document.getElementById('issue-list'); // Fixed ID
  if (!container) return;

  const all = [
    ...report.input, ...report.continuity,
    ...report.anomaly, ...report.syntax,
  ].filter(i => filter === 'ALL' || i.severity === filter)
   .sort((a, b) => { const o = {ERROR:0,WARNING:1,INFO:2}; return o[a.severity]-o[b.severity]; });

  // Update badge count if element exists
  const badge = document.getElementById('issue-count');
  if (badge) badge.textContent = all.length;

  // Also update tab badge via DOM lookup since tab-manager isn't imported
  const tabBadge = document.querySelector('#tab-validate .tab-badge');
  if (tabBadge) {
     tabBadge.textContent = all.length > 99 ? '99+' : all.length;
     tabBadge.style.display = all.length ? '' : 'none';
  }

  if (all.length === 0) {
    // If we just ran validation and found nothing, runValidation handles the empty state.
    // If this is a filter result yielding nothing:
    container.innerHTML = `<div style="color:var(--text-muted);padding:1rem;text-align:center">No issues match filter "${filter}"</div>`;
    return;
  }

  container.innerHTML = all.map(issue => {
    const colorClass = {ERROR:'issue-error',WARNING:'issue-warning',INFO:'issue-info'}[issue.severity] || 'issue-info';
    // Using inline styles for simplicity as tailwind classes were in original code but CSS seems custom
    const color = {ERROR:'var(--red-err)', WARNING:'var(--amber)', INFO:'var(--blue)'}[issue.severity];

    return `<div class="issue-item ${issue.severity} mb-1" style="border-left:4px solid ${color};background:var(--bg-0);padding:0.5rem;margin-bottom:0.5rem">
      <div class="flex items-center gap-1 mb-1">
        <span style="color:${color};font-weight:bold;font-size:0.75rem">${issue.severity}</span>
        <span style="font-size:0.75rem;color:var(--text-muted)">[${issue.id}] ${issue.phase}</span>
        ${issue.refno ? `<span style="font-size:0.75rem;font-family:var(--font-code);background:var(--bg-subtle);padding:0 2px">${_esc(issue.refno)}</span>` : ''}
      </div>
      <div style="font-size:0.85rem">${_esc(issue.message)}</div>
      ${issue.detail ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;font-family:var(--font-code)">${_esc(issue.detail)}</div>` : ''}
      ${issue.fixHint ? `<div style="font-size:0.75rem;color:var(--blue);margin-top:0.25rem">💡 ${_esc(issue.fixHint)}</div>` : ''}
    </div>`;
  }).join('');
};

const _esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
