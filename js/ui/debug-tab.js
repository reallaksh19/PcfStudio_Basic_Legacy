/**
 * debug-tab.js — Debugging Interface
 * Displays internal state tables for each processing stage.
 */

let _dom = {};

export function initDebugTab() {
    _dom = {
        container:  document.getElementById('debug-tables-container'),
        clearBtn:   document.getElementById('btn-clear-debug'),
        copyAllBtn: document.getElementById('btn-copy-all-debug'),
        copyRayBtn: document.getElementById('btn-copy-ray-debug'),
    };

    if (_dom.clearBtn) {
        _dom.clearBtn.addEventListener('click', clearDebugTab);
    }

    if (_dom.copyAllBtn) {
        _dom.copyAllBtn.addEventListener('click', _copyAllTables);
    }

    if (_dom.copyRayBtn) {
        _dom.copyRayBtn.addEventListener('click', _copyRayTables);
    }
}

/**
 * Copy only ray-mode panels (those stamped with data-ray="true") as TSV blocks.
 */
function _copyRayTables() {
    if (!_dom.container) return;

    const panels = Array.from(_dom.container.querySelectorAll('.panel[data-ray="true"]'));
    if (panels.length === 0) {
        _dom.copyRayBtn.textContent = 'No ray tables';
        setTimeout(() => { _dom.copyRayBtn.textContent = '⎘ Copy Ray'; }, 1500);
        return;
    }

    const blocks = [];

    for (const panel of panels) {
        const titleEl = panel.querySelector('.panel-title');
        const stageName = titleEl ? titleEl.textContent.trim() : 'Table';

        const table = panel.querySelector('table');
        if (!table) continue;

        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length === 0) continue;

        const tsv = rows.map(r =>
            Array.from(r.querySelectorAll('th, td'))
                .map(c => c.innerText.replace(/\t/g, ' ').replace(/\n/g, ' '))
                .join('\t')
        ).join('\n');

        blocks.push(`## ${stageName}\n${tsv}`);
    }

    if (blocks.length === 0) {
        _dom.copyRayBtn.textContent = 'No tables found';
        setTimeout(() => { _dom.copyRayBtn.textContent = '⎘ Copy Ray'; }, 1500);
        return;
    }

    navigator.clipboard.writeText(blocks.join('\n\n')).then(() => {
        _dom.copyRayBtn.textContent = '✓ Copied!';
        setTimeout(() => { _dom.copyRayBtn.textContent = '⎘ Copy Ray'; }, 1800);
    }).catch(() => {
        _dom.copyRayBtn.textContent = 'Failed';
        setTimeout(() => { _dom.copyRayBtn.textContent = '⎘ Copy Ray'; }, 1500);
    });
}

/**
 * Copy every debug table as TSV blocks separated by a blank line.
 * Each block starts with a header row "## <stage name>" so stages are
 * distinguishable after pasting into Excel / a text editor.
 */
function _copyAllTables() {
    if (!_dom.container) return;

    const panels = Array.from(_dom.container.querySelectorAll('.panel'));
    if (panels.length === 0) {
        _dom.copyAllBtn.textContent = 'Nothing to copy';
        setTimeout(() => { _dom.copyAllBtn.textContent = '⎘ Copy All'; }, 1500);
        return;
    }

    const blocks = [];

    for (const panel of panels) {
        const titleEl = panel.querySelector('.panel-title');
        const stageName = titleEl ? titleEl.textContent.trim() : 'Table';

        const table = panel.querySelector('table');
        if (!table) continue;

        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length === 0) continue;

        const tsv = rows.map(r =>
            Array.from(r.querySelectorAll('th, td'))
                .map(c => c.innerText.replace(/\t/g, ' ').replace(/\n/g, ' '))
                .join('\t')
        ).join('\n');

        blocks.push(`## ${stageName}\n${tsv}`);
    }

    if (blocks.length === 0) {
        _dom.copyAllBtn.textContent = 'No tables found';
        setTimeout(() => { _dom.copyAllBtn.textContent = '⎘ Copy All'; }, 1500);
        return;
    }

    navigator.clipboard.writeText(blocks.join('\n\n')).then(() => {
        _dom.copyAllBtn.textContent = '✓ Copied!';
        setTimeout(() => { _dom.copyAllBtn.textContent = '⎘ Copy All'; }, 1800);
    }).catch(() => {
        _dom.copyAllBtn.textContent = 'Failed';
        setTimeout(() => { _dom.copyAllBtn.textContent = '⎘ Copy All'; }, 1500);
    });
}

export function clearDebugTab() {
    if (_dom.container) {
        _dom.container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted)">Running conversion will populate tables here.</div>';
    }
}

/**
 * Render a table for a specific stage.
 * @param {string}        stageName   - e.g. "Stage 1A — Global Run"
 * @param {Array<Object>} data        - Array of row objects
 * @param {number}        [order]     - Sort order (lower = higher in list). Default 999.
 * @param {string}        [description] - Multi-line description rendered above the table.
 *                                        Use \n to separate bullet points.
 * @param {boolean}       [isRay]     - Mark this panel as a ray-mode table (enables "Copy Ray").
 */
export function updateDebugTable(stageName, data, order = 999, description = '', isRay = false) {
    if (!_dom.container) return;

    // Clear placeholder if present
    if (_dom.container.querySelector('div')?.textContent.includes('Running conversion')) {
        _dom.container.innerHTML = '';
    }

    // Remove existing panel with same name if it exists
    const existingPanels = Array.from(_dom.container.querySelectorAll('.panel-title'));
    const existingSection = existingPanels.find(span => span.textContent === stageName)?.closest('.panel');

    const section = document.createElement('div');
    section.className = 'panel';
    section.style.marginBottom = '0';
    section.dataset.order = String(order);
    if (isRay) section.dataset.ray = 'true';

    // ── Header ──────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'panel-header';
    const _hasCount = /\d+ (rows|groups|resolved|components)/.test(stageName);
    header.innerHTML = `<span class="panel-title">${stageName}</span>${_hasCount ? '' : `<span class="text-muted text-xs">${data.length} rows</span>`}`;

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.title = 'Copy table as TSV (paste into Excel)';
    copyBtn.style.cssText = 'margin-left:auto;padding:2px 10px;font-size:0.75rem;cursor:pointer;border:1px solid var(--border);border-radius:3px;background:var(--bg-2);color:var(--text-primary);';
    copyBtn.addEventListener('click', () => {
        if (!data || data.length === 0) return;
        const keys = Object.keys(data[0]);
        const tsv = [keys.join('\t'), ...data.map(row =>
            keys.map(k => {
                let v = row[k];
                if (typeof v === 'boolean') v = v ? 'True' : 'False';
                if (v === undefined || v === null) v = '';
                return String(v).replace(/\t/g, ' ');
            }).join('\t')
        )].join('\n');
        navigator.clipboard.writeText(tsv).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        }).catch(() => {
            copyBtn.textContent = 'Failed';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        });
    });
    header.appendChild(copyBtn);
    section.appendChild(header);

    // ── Description block ────────────────────────────────────────────
    if (description) {
        const desc = document.createElement('div');
        desc.style.cssText = [
            'padding:6px 12px 8px',
            'background:var(--bg-1)',
            'border-bottom:1px solid var(--border)',
            'font-size:0.78rem',
            'line-height:1.55',
            'color:var(--text-muted)',
        ].join(';');

        // Split on \n — first line is the "what" summary, rest are bullets
        const lines = description.split('\n').map(l => l.trim()).filter(Boolean);
        let html = '';
        if (lines.length > 0) {
            html += `<span style="color:var(--text-primary);font-weight:600">${lines[0]}</span>`;
        }
        if (lines.length > 1) {
            html += '<ul style="margin:4px 0 0 1.1em;padding:0">';
            lines.slice(1).forEach(l => {
                // Highlight _Static, _pipe, _Sp keywords inline
                const formatted = l
                    .replace(/(`[^`]+`)/g, '<code style="background:var(--bg-2);padding:0 3px;border-radius:2px;font-size:0.75rem">$1</code>')
                    .replace(/(\b\w*_Static\b)/g, '<span style="color:var(--amber);font-weight:600">$1</span>')
                    .replace(/(\b\w*_pipe\b|\b\w*_Sp\d*\b|\b\w*_Injected\b|\b\w*_bridged\b|\b\w*_Support\b)/g, '<span style="color:var(--amber)">$1</span>');
                html += `<li>${formatted}</li>`;
            });
            html += '</ul>';
        }
        desc.innerHTML = html;
        section.appendChild(desc);
    }

    // ── Table body ───────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'panel-body';
    body.style.padding = '0';
    body.style.overflow = 'auto';
    body.style.maxHeight = '420px';

    if (!data || data.length === 0) {
        body.innerHTML = '<div style="padding:1rem;color:var(--text-muted)">No data</div>';
    } else {
        const table = document.createElement('table');
        table.className = 'data-table';
        table.style.width = 'max-content';
        table.style.minWidth = '100%';
        table.style.borderCollapse = 'collapse';

        const keys = Object.keys(data[0]);

        // ── Headers ──
        const thead = document.createElement('thead');
        const trh = document.createElement('tr');
        keys.forEach(k => {
            const th = document.createElement('th');
            th.textContent = k;
            th.style.textAlign = 'left';
            th.style.padding = '4px 8px';
            th.style.borderBottom = '1px solid var(--steel)';
            th.style.position = 'sticky';
            th.style.top = '0';
            th.style.whiteSpace = 'nowrap';
            th.style.zIndex = '1';
            if (k.endsWith('_Static')) {
                th.style.background = '#3a2e00';   // dark amber tint
                th.style.color = 'var(--amber)';
                th.title = 'Frozen snapshot value at this stage — not updated by downstream processing';
            } else {
                th.style.background = 'var(--bg-2)';
            }
            trh.appendChild(th);
        });
        thead.appendChild(trh);
        table.appendChild(thead);

        // ── Rows ──
        const tbody = document.createElement('tbody');
        data.forEach(row => {
            const tr = document.createElement('tr');
            keys.forEach(k => {
                const td = document.createElement('td');
                let val = row[k];
                if (typeof val === 'boolean') val = val ? 'True' : 'False';
                if (val === undefined || val === null) val = '-';
                td.textContent = String(val);
                td.style.padding = '2px 8px';
                td.style.borderBottom = '1px solid var(--border)';
                td.style.whiteSpace = 'nowrap';

                // _Static column — subtle amber cell background
                if (k.endsWith('_Static')) {
                    td.style.background = 'rgba(200,140,0,0.07)';
                    td.style.color = 'var(--amber)';
                    td.style.fontFamily = 'var(--font-code)';
                    td.style.fontSize = '0.8rem';
                }

                // RefNo mono font
                if (k === 'RefNo' || k === 'Issue') td.style.fontFamily = 'var(--font-code)';

                // Pair status colour
                if (k === 'Pair Method' || k === 'Pair Status') {
                    td.style.fontWeight = '600';
                    td.style.fontFamily = 'var(--font-code)';
                    if      (val === 'Paired-Target')  { td.style.color = 'var(--green-ok)'; td.title = 'Resolved via Next(Target) from PCF table'; }
                    else if (val === 'Pair-Geo')        { td.style.color = 'var(--amber)'; }
                    else if (val === 'Gate-Collapsed')  { td.style.color = 'var(--red-err)'; td.title = 'Collapsed by push gate (multi-axis bore/3D rule)'; }
                    else if (val === 'Unpaired')        { td.style.color = 'var(--red-err)'; }
                    else                                { td.style.color = 'var(--green-ok)'; }
                }

                // Gate / bridge / synthetic flags
                if ((k === 'Gate?' || k === 'NeedsBridge?' || k === 'Synthetic?' || k === 'Sp1?') && val === 'Yes') {
                    td.style.color = 'var(--amber)';
                    td.style.fontWeight = '600';
                }

                // Large Len_Calc warning
                if ((k === 'Len_Calc' || k === 'LEN_CALC' || k.startsWith('Len_Calc')) && parseFloat(val) > 20000) {
                    td.style.color = 'var(--red-err)';
                    td.style.fontWeight = '700';
                    td.title = `${val}mm exceeds 20 m — possible cross-line jump`;
                }

                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        body.appendChild(table);
    }

    section.appendChild(body);

    if (existingSection) {
        _dom.container.replaceChild(section, existingSection);
    } else {
        _dom.container.appendChild(section);
    }

    // Re-sort all panels by data-order so tables always appear in stage order
    const panels = Array.from(_dom.container.querySelectorAll('.panel'));
    panels.sort((a, b) => Number(a.dataset.order ?? 999) - Number(b.dataset.order ?? 999));
    _dom.container.innerHTML = '';
    panels.forEach((p, idx) => {
        if (idx > 0) {
            const div = document.createElement('div');
            div.style.cssText = 'height:1px;background:var(--border);margin:0.75rem 0;';
            _dom.container.appendChild(div);
        }
        _dom.container.appendChild(p);
    });
}
