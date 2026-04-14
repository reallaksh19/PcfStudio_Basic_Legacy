/**
 * Validator UI
 * A panel for running validation and applying fixes.
 */
import { SmartValidator } from '../smart/SmartValidator.js';
import { SmartFixer } from '../smart/SmartFixer.js';

export class ValidatorUI {
    constructor(container, editorCore) {
        this.container = container;
        this.editor = editorCore;
        this.fixer = new SmartFixer(editorCore);
        this.validator = null; // Init when needed (needs scene)

        this.panel = null;
        this._buildUI();
    }

    _buildUI() {
        this.panel = document.createElement('div');
        this.panel.className = 'pcf-validator-panel';
        this.panel.style.cssText = `
            position: absolute; bottom: 10px; left: 10px;
            width: 300px; max-height: 200px;
            background: rgba(30, 30, 40, 0.95);
            border: 1px solid #444; color: #eee;
            padding: 10px; font-family: sans-serif; font-size: 12px;
            display: none; flex-direction: column;
            z-index: 20;
        `;

        this.panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:5px;border-bottom:1px solid #555;padding-bottom:5px;">
                <span style="font-weight:bold;color:#4db8ff;">Smart Validator</span>
                <button id="val-close" style="background:none;border:none;color:#aaa;cursor:pointer;">✕</button>
            </div>
            <div id="val-list" style="flex:1;overflow-y:auto;margin-bottom:5px;"></div>
            <div style="display:flex;gap:5px;">
                <button id="val-run" style="flex:1;background:#007bff;border:none;color:white;padding:4px;border-radius:3px;cursor:pointer;">Run Check</button>
                <button id="val-fix-all" style="flex:1;background:#28a745;border:none;color:white;padding:4px;border-radius:3px;cursor:pointer;display:none;">Fix All</button>
            </div>
        `;

        this.container.appendChild(this.panel);

        // Events
        this.panel.querySelector('#val-close').addEventListener('click', () => this.hide());
        this.panel.querySelector('#val-run').addEventListener('click', () => this.runValidation());
        this.panel.querySelector('#val-fix-all').addEventListener('click', () => this.fixAll());
    }

    show() {
        this.panel.style.display = 'flex';
    }

    hide() {
        this.panel.style.display = 'none';
    }

    runValidation() {
        if (!this.validator) {
            this.validator = new SmartValidator(this.editor.viewer.scene);
        }

        const issues = this.validator.validate();
        this._renderIssues(issues);
    }

    _renderIssues(issues) {
        const list = this.panel.querySelector('#val-list');
        const fixAllBtn = this.panel.querySelector('#val-fix-all');
        list.innerHTML = '';

        if (issues.length === 0) {
            list.innerHTML = '<div style="color:#28a745;padding:10px;text-align:center;">No issues found!</div>';
            fixAllBtn.style.display = 'none';
            return;
        }

        this.currentIssues = issues;
        fixAllBtn.style.display = 'block';

        issues.forEach((issue, idx) => {
            const item = document.createElement('div');
            item.style.cssText = 'padding:4px;border-bottom:1px solid #444;display:flex;justify-content:space-between;align-items:center;';
            item.innerHTML = `
                <span>${issue.description}</span>
                <button data-idx="${idx}" style="background:#444;border:none;color:#fff;padding:2px 6px;border-radius:2px;cursor:pointer;">Fix</button>
            `;
            item.querySelector('button').addEventListener('click', () => {
                this.fixer.applyFix(issue);
                item.remove(); // Optimistic remove
            });
            list.appendChild(item);
        });
    }

    fixAll() {
        if (!this.currentIssues) return;
        this.currentIssues.forEach(issue => this.fixer.applyFix(issue));
        this.runValidation(); // Re-run to verify
    }
}
