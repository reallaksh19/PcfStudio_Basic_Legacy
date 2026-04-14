/**
 * ValidatorPanel.js — Vanilla JS UI for validator (< 100 lines)
 * Plug-and-play: No React dependency, works anywhere
 */

import { SmartValidatorCore } from './SmartValidatorCore.js';
import { SmartFixerCore } from './SmartFixerCore.js';
import { VALIDATOR_CONFIG } from './validator-config.js';

export class ValidatorPanel {
    constructor(containerId, editorStore) {
        this.container = document.getElementById(containerId);
        this.store = editorStore;
        this.validator = new SmartValidatorCore(VALIDATOR_CONFIG);
        this.fixer = new SmartFixerCore(VALIDATOR_CONFIG);
        this.issues = [];
        this.selectedIssue = null;

        if (this.container) this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="validator-panel" style="display:flex;flex-direction:column;height:100%;background:#1a1a1a;color:#eee;padding:1rem">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;border-bottom:2px solid #333;padding-bottom:0.5rem">
                    <h3 style="margin:0;color:#ffaa00">🔍 Smart Validator</h3>
                    <button id="run-validation-btn" style="padding:6px 12px;background:#00aaff;border:none;border-radius:4px;color:white;font-weight:600;cursor:pointer">▶ Run Validation</button>
                </div>
                <div style="display:flex;gap:0.5rem;margin-bottom:1rem">
                    <button class="filter-btn" data-filter="ALL">ALL (<span id="count-all">0</span>)</button>
                    <button class="filter-btn" data-filter="ERROR">ERROR (<span id="count-error">0</span>)</button>
                    <button class="filter-btn" data-filter="WARNING">WARNING (<span id="count-warning">0</span>)</button>
                </div>
                <div id="issues-table" style="flex:1;overflow-y:auto;border:1px solid #333;border-radius:4px"></div>
                <div id="stats-footer" style="margin-top:1rem;padding:0.5rem;background:#222;border-radius:4px;font-size:0.75rem;display:flex;justify-content:space-between"></div>
            </div>
        `;

        this.bindEvents();
    }

    bindEvents() {
        const runBtn = this.container.querySelector('#run-validation-btn');
        runBtn?.addEventListener('click', () => this.runValidation());

        this.container.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.filterIssues(e.target.dataset.filter));
        });
    }

    runValidation() {
        const data = this.store.getState();
        this.issues = this.validator.validate(data);
        this.renderIssues();
        this.updateStats();
    }

    renderIssues(filter = 'ALL') {
        const tableEl = this.container.querySelector('#issues-table');
        if (!tableEl) return;

        const filtered = filter === 'ALL' ? this.issues : this.issues.filter(i => i.severity === filter);

        tableEl.innerHTML = filtered.length === 0
            ? '<div style="padding:2rem;text-align:center;color:#666">No issues found</div>'
            : `<table style="width:100%;border-collapse:collapse;font-size:0.8rem">
                <thead style="position:sticky;top:0;background:#222">
                    <tr><th style="padding:8px;text-align:left">#</th><th style="padding:8px;text-align:left">Type</th><th style="padding:8px;text-align:left">Description</th><th style="padding:8px;text-align:left">Actions</th></tr>
                </thead>
                <tbody>${filtered.map((issue, idx) => this.renderIssueRow(issue, idx)).join('')}</tbody>
            </table>`;

        this.bindIssueActions();
    }

    renderIssueRow(issue, idx) {
        const color = { ERROR: '#ff3366', WARNING: '#ffaa00', INFO: '#00aaff' }[issue.severity];
        return `<tr style="border-left:3px solid ${color};cursor:pointer" data-issue-id="${issue.id}">
            <td style="padding:8px">${idx + 1}</td>
            <td style="padding:8px"><span style="background:${color};color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem">${issue.severity}</span></td>
            <td style="padding:8px;font-family:monospace;font-size:0.75rem">${issue.description}</td>
            <td style="padding:8px"><button class="focus-btn" data-issue-id="${issue.id}" style="padding:4px 8px;font-size:0.7rem;background:#444;border:none;border-radius:3px;color:#fff;cursor:pointer;margin-right:4px">🎯 Focus</button>${issue.autoFixable ? `<button class="fix-btn" data-issue-id="${issue.id}" style="padding:4px 8px;font-size:0.7rem;background:#00aa00;border:none;border-radius:3px;color:#fff;cursor:pointer">✓ Fix</button>` : ''}</td>
        </tr>`;
    }

    bindIssueActions() {
        this.container.querySelectorAll('.focus-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const issue = this.issues.find(i => i.id === btn.dataset.issueId);
                if (issue) this.focusIssue(issue);
            });
        });

        this.container.querySelectorAll('.fix-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const issue = this.issues.find(i => i.id === btn.dataset.issueId);
                if (issue) this.fixIssue(issue);
            });
        });
    }

    focusIssue(issue) {
        this.store.setState?.({ focusTarget: { position: issue.position1, highlightColor: VALIDATOR_CONFIG.visual.focusColor } });
    }

    async fixIssue(issue) {
        const result = this.fixer.fixIssue(issue, this.store.getState());
        if (result.success) {
            await this.applyModifications(result.modifications);
            this.runValidation();
            this.showToast(`✓ ${result.action}`, 'success');
        } else {
            this.showToast(`✗ ${result.error}`, 'error');
        }
    }

    async applyModifications(modifications) {
        const state = this.store.getState();

        modifications.forEach(mod => {
            if (mod.type === 'updateNode') {
                const node = state.nodes.find(n => n.id === mod.nodeId);
                if (node) Object.assign(node, mod.updates);
            }
            if (mod.type === 'addNode') {
                state.nodes.push(mod.node);
            }
            if (mod.type === 'addStick') {
                state.sticks.push(mod.stick);
            }
        });

        // Rebuild PCF components from modified geometry
        if (typeof state.rebuildFromGeometry === 'function') {
            await state.rebuildFromGeometry();
        }

        // Notify data table to refresh
        if (typeof window.pcfTableController?.refresh === 'function') {
            window.pcfTableController.refresh();
        }
    }

    updateStats() {
        const all = this.issues.length;
        const errors = this.issues.filter(i => i.severity === 'ERROR').length;
        const warnings = this.issues.filter(i => i.severity === 'WARNING').length;
        const fixable = this.issues.filter(i => i.autoFixable).length;

        this.container.querySelector('#count-all').textContent = all;
        this.container.querySelector('#count-error').textContent = errors;
        this.container.querySelector('#count-warning').textContent = warnings;

        const footer = this.container.querySelector('#stats-footer');
        if (footer) footer.innerHTML = `<span>Total: <strong>${all}</strong></span><span>Auto-Fixable: <strong style="color:#00ff00">${fixable}</strong></span><span>Errors: <strong style="color:#ff3366">${errors}</strong></span>`;
    }

    filterIssues(filter) {
        this.renderIssues(filter);
    }

    showToast(msg, type) {
        console.log(`[Validator ${type}] ${msg}`);
    }
}
