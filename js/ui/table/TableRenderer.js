import { masterTableService } from '../../services/master-table-service.js';

/**
 * TableRenderer.js
 * Handles DOM manipulation, table structure creation, and cell updates.
 */

export class TableRenderer {
    constructor(container, headers) {
        this.container = container;
        this.headers = headers;
        this.tableData = [];
        this._allTableData = [];   // unfiltered snapshot for filter dropdowns
        this._columnFilters = {};  // colIdx → Set<string> (empty Set = show all)
        this._mainTbody = null;
        this._suppTbody = null;
    }

    _n(value) {
        const n = Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
        return Number.isFinite(n) ? n : null;
    }

    _text(value) {
        return String(value ?? '').trim();
    }

    _isValveRow(rowData) {
        const component = this._text(rowData[this.headers.indexOf('Component')]).toUpperCase();
        const rigid = this._text(rowData[this.headers.indexOf('Rigid Type')]).toUpperCase();
        return component.includes('VALVE') || rigid.includes('VALVE') || component === 'V' || rigid === 'V';
    }

    _getValveWeightCandidates(rowData) {
        if (!this._isValveRow(rowData)) return [];
        const bore = this._n(rowData[this.headers.indexOf('DN (Bore)')]);
        const rating = this._n(rowData[this.headers.indexOf('Rating')]);
        const length = this._n(rowData[this.headers.indexOf('Len_Calc')]);
        if (bore == null || rating == null || length == null) return [];
        try {
            return masterTableService.findValveWeightCandidates({
                boreMm: bore,
                ratingClass: rating,
                lengthMm: length,
            });
        } catch (err) {
            console.warn('[TableRenderer] Valve weight candidate lookup failed:', err?.message || err);
            return [];
        }
    }

    _candidateLabel(row, index) {
        const type = this._text(row?.valve_type) || `Valve option ${index + 1}`;
        const weight = this._text(row?.valve_weight);
        const len = this._text(row?.length_mm);
        const rating = this._text(row?.rating_class);
        return `${type} — ${weight || 'no weight'} kg${len ? ` · L=${len}` : ''}${rating ? ` · CL=${rating}` : ''}`;
    }

    _renderCa8ValveDropdown(td, rowData, rowIdx, colIdx, value, candidates, onCellBlur) {
        td.contentEditable = 'false';
        td.classList.add('ca8-valve-ambiguous-cell');
        td.title = 'Multiple valve weight rows match DN + rating + length. Select the correct CA8 weight.';

        const select = document.createElement('select');
        select.className = 'ca8-valve-weight-select';
        select.style.cssText = [
            'min-width:145px',
            'max-width:230px',
            'font-size:0.74rem',
            'font-family:var(--font-code)',
            'background:var(--bg-0)',
            'color:var(--text-primary)',
            'border:1px solid var(--amber)',
            'border-radius:4px',
            'padding:2px 5px',
            'outline:none'
        ].join(';');

        const current = this._text(value);
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = 'Select valve weight…';
        select.appendChild(blank);

        candidates.forEach((candidate, optionIdx) => {
            const opt = document.createElement('option');
            opt.value = this._text(candidate?.valve_weight);
            opt.textContent = this._candidateLabel(candidate, optionIdx);
            opt.dataset.valveType = this._text(candidate?.valve_type);
            opt.dataset.lengthMm = this._text(candidate?.length_mm);
            opt.dataset.ratingClass = this._text(candidate?.rating_class);
            if (current && opt.value === current) opt.selected = true;
            select.appendChild(opt);
        });

        select.addEventListener('change', (event) => {
            const nextValue = this._text(event.target.value);
            rowData[colIdx] = nextValue;
            td.classList.add('cell-edited');
            onCellBlur(rowIdx, colIdx, nextValue);
        });

        td.innerHTML = '';
        td.appendChild(select);
    }

    render(rows, onCellBlur) {
        this.container.innerHTML = "";
        this.tableData = [];
        this._allTableData = [];
        this._columnFilters = {};  // reset filters on re-render

        const mainStruct = this.createTableStruct("pcf-table-main", "1. Pipe & Components (Sequenced)");
        const suppStruct = this.createTableStruct("pcf-table-supports", "2. Supports / Zero-Length Items (Appended)");
        this._mainTbody = mainStruct.tbody;
        this._suppTbody = suppStruct.tbody;

        const ca8Col = this.headers.indexOf('Weight (ATTR8)');

        rows.forEach((rowObj, idx) => {
            const tr = document.createElement("tr");
            const rowData = rowObj.data;
            this.tableData.push(rowData);
            this._allTableData.push(rowData);

            // Apply highlighting logic (Missing Connections / Loops)
            const pF = String(rowData[25] || "").trim();
            const nF = String(rowData[26] || "").trim();
            const l1 = parseFloat(rowData[10]) || 0;
            const l2 = parseFloat(rowData[12]) || 0;
            const l3 = parseFloat(rowData[14]) || 0;
            const tL = l1 + l2 + l3;

            const missingP = !pF || pF === "N/A";
            const missingN = !nF || nF === "N/A";
            const localLoop = (tL >= 0.1) && (pF === nF) && (!missingP && !missingN);

            let rowStyleClass = "";
            if (!rowObj.isPoint) {
                if (localLoop) rowStyleClass = "row-loop-error";
                else if (missingP || missingN) rowStyleClass = "row-missing-conn";
            }

            const valveWeightCandidates = ca8Col >= 0 ? this._getValveWeightCandidates(rowData) : [];

            rowData.forEach((val, colIdx) => {
                const td = document.createElement("td");
                td.textContent = val;
                td.dataset.row = idx;
                td.dataset.col = colIdx;
                td.spellcheck = false;

                if (colIdx >= 23 || colIdx === 0) {
                    td.contentEditable = "true";
                } else {
                    td.contentEditable = "false";
                    td.classList.add("locked-cell");
                }

                if (colIdx === 27 && val) td.classList.add("text-success"); // Line No (Derived)
                if (colIdx >= 19 && colIdx <= 22) td.classList.add("smart-cell");

                if (rowStyleClass === "row-loop-error") td.classList.add("bg-pink-error");
                else if (rowStyleClass === "row-missing-conn") td.classList.add("bg-blue-light");

                if (!rowObj.isPoint && colIdx === ca8Col && valveWeightCandidates.length > 1) {
                    this._renderCa8ValveDropdown(td, rowData, idx, colIdx, val, valveWeightCandidates, onCellBlur);
                } else {
                    td.addEventListener("blur", (e) => {
                        const newVal = e.target.textContent.trim();
                        if (newVal !== String(val)) {
                            onCellBlur(idx, colIdx, newVal);
                            e.target.classList.add("cell-edited");
                        }
                    });
                }

                tr.appendChild(td);
            });

            if (rowObj.isPoint) suppStruct.tbody.appendChild(tr);
            else mainStruct.tbody.appendChild(tr);
        });

        this.container.appendChild(mainStruct.wrap);
        if (suppStruct.tbody.children.length > 0) {
            this.container.appendChild(suppStruct.wrap);
        }

        // ─ Fill-Down click handler (delegated) ───────────────────────────────
        this.container.addEventListener('click', (e) => {
            const btn = e.target.closest('.fill-down-btn');
            if (!btn) return;
            e.stopPropagation();

            const colName = btn.dataset.col;
            const COL_IDX = this.headers.indexOf(colName);
            if (COL_IDX < 0) return;

            const tbl = btn.closest('table');
            if (!tbl) return;

            const allRows = Array.from(tbl.querySelectorAll('tbody tr'));

            const focusedTd = tbl.querySelector(`td[data-col="${COL_IDX}"]:focus, td[data-col="${COL_IDX}"].cell-edited`);
            const sourceTd = focusedTd || allRows.reduce((found, tr) => {
                if (found) return found;
                const td = tr.querySelector(`td[data-col="${COL_IDX}"]`);
                return (td && td.textContent.trim()) ? td : null;
            }, null);

            if (!sourceTd) { alert(`No ${colName} value found to fill down from.`); return; }

            const sourceVal = sourceTd.textContent.trim();
            const sourceRowIdx = parseInt(sourceTd.dataset.row, 10);

            let filled = 0;
            for (let tr of allRows) {
                const td = tr.querySelector(`td[data-col="${COL_IDX}"]`);
                if (!td) continue;
                const rowIdx = parseInt(td.dataset.row, 10);
                if (rowIdx <= sourceRowIdx) continue;   // only rows below the source
                if (td.textContent.trim()) continue;    // skip non-empty cells, do not stop

                td.textContent = sourceVal;
                td.classList.add('cell-edited', 'fill-down-applied');
                onCellBlur(rowIdx, COL_IDX, sourceVal);
                filled++;
            }

            console.log(`[FillDown] Filled ${filled} cells below row ${sourceRowIdx} with "${sourceVal}"`);
        }, { capture: false });

        this.injectStyles();
    }


    createTableStruct(id, title) {
        const wrap = document.createElement("div");
        wrap.className = "table-section";

        // Title row with reset-all-filters button
        const titleBar = document.createElement('div');
        titleBar.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const h3 = document.createElement('h3');
        h3.style.cssText = 'margin:0;flex:1;';
        h3.textContent = title;
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'af-reset-btn';
        resetBtn.title = 'Clear all column filters';
        resetBtn.style.cssText = 'display:none;cursor:pointer;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:4px;color:#f87171;padding:2px 7px;font-size:0.72rem;line-height:1.5;align-items:center;gap:4px;';
        resetBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="vertical-align:middle"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Reset Filters`;
        titleBar.append(h3, resetBtn);
        wrap.appendChild(titleBar);
        this._resetBtn = resetBtn;

        const tbl = document.createElement("table");
        tbl.className = "data-table editable-table";
        tbl.id = id;

        const thead = document.createElement("thead");
        const trTop = document.createElement("tr");
        const trSub = document.createElement("tr");

        // Base Columns (0-13)
        for (let i = 0; i <= 13; i++) {
            const th = document.createElement("th");
            th.rowSpan = 2;
            th.textContent = this.headers[i];
            trTop.appendChild(th);
        }

        // Group 1: SeqNo Logic (14-17)
        this.addHeaderGroup(trTop, trSub, "SeqNo Logic", 14, 18);

        // Group 2: Smart Logic (18-21)
        this.addHeaderGroup(trTop, trSub, "Smart Logic", 18, 22);

        // Group 3: Final Route (22-25) - 4 Columns
        this.addHeaderGroup(trTop, trSub, "Final Route", 22, 26);

        // Remaining (26+) — Certain columns get a ▼ fill-down button in their header
        const fillDownCols = [
            'Line No. (Derived)', 'Piping Class', 'Rating',
            'Material (ATTR3)', 'Wall Thk (ATTR4)', 'Ins Thk (ATTR5)', 'Ins Den (ATTR6)',
            'Corr (ATTR7)', 'Weight (ATTR8)', 'Density (ATTR9)', 'HP (ATTR10)',
        ];
        for (let i = 26; i < this.headers.length; i++) {
            const th = document.createElement("th");
            th.rowSpan = 2;
            th.style.position = 'relative';
            const colIdx = i;
            let innerHtml = `<span style="display:block;white-space:nowrap">${this.headers[i]}</span>`;
            if (fillDownCols.includes(this.headers[i])) {
                innerHtml += `<button
                    class="fill-down-btn"
                    data-col="${this.headers[i]}"
                    title="Fill-Down: copies the focused/first non-empty value downward into blank cells"
                    style="margin-top:3px;cursor:pointer;background:var(--amber);color:#000;border:none;
                           border-radius:3px;padding:1px 5px;font-size:0.7rem;font-weight:700;
                           line-height:1.4;transition:opacity .15s"
                    onmouseover="this.style.opacity='0.75'"
                    onmouseout="this.style.opacity='1'"
                >&#9660; Fill Down</button>`;
            }
            innerHtml += `<button class="af-btn" data-col="${i}" title="Filter / sort column"
                style="margin-left:3px;cursor:pointer;background:none;border:none;color:var(--text-secondary);
                       padding:0 2px;vertical-align:middle;opacity:0.6;line-height:1;transition:opacity .15s"
                onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity=this.dataset.active?'1':'0.6'">
                <svg width="9" height="7" viewBox="0 0 9 7" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 9,0 4.5,7"/></svg>
              </button>`;
            th.innerHTML = innerHtml;
            th.querySelector('.af-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this._openFilterDropdown(colIdx, e.currentTarget);
            });
            trTop.appendChild(th);
        }

        // Wire reset button (created above in createTableStruct title bar)
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._columnFilters = {};
            trTop.querySelectorAll('.af-btn svg polygon').forEach(p => p.setAttribute('fill', 'currentColor'));
            trTop.querySelectorAll('.af-btn').forEach(b => { b.dataset.active = ''; b.style.opacity = '0.6'; });
            this._applyFilters();
        });

        thead.appendChild(trTop);
        thead.appendChild(trSub);
        tbl.appendChild(thead);
        const tbody = document.createElement("tbody");
        tbl.appendChild(tbody);

        wrap.appendChild(tbl);
        return { wrap, tbody };
    }

    addHeaderGroup(trTop, trSub, title, startIdx, endIdx) {
        const th = document.createElement("th");
        th.colSpan = endIdx - startIdx;
        th.textContent = title;
        th.className = "header-group";
        trTop.appendChild(th);

        for (let i = startIdx; i < endIdx; i++) {
            const subTh = document.createElement("th");
            subTh.textContent = this.headers[i];
            trSub.appendChild(subTh);
        }
    }

    // ── AutoFilter ────────────────────────────────────────────────────────────

    _openFilterDropdown(colIdx, anchorEl) {
        // Remove any existing panel
        document.querySelectorAll('.af-panel').forEach(p => p.remove());

        const colName = this.headers[colIdx];
        const activeFilter = this._columnFilters[colIdx]; // Set or undefined

        // Collect unique values from unfiltered data
        const uniqueVals = [...new Set(
            this._allTableData.map(row => String(row[colIdx] ?? ''))
        )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        const panel = document.createElement('div');
        panel.className = 'af-panel';
        panel.style.cssText = `
            position:absolute;z-index:9999;background:#1e2533;border:1px solid #3a4460;
            border-radius:6px;padding:8px;min-width:200px;max-height:320px;
            overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.5);
            font-size:0.8rem;color:#cdd6f4;
        `;

        // Sort buttons
        const sortRow = document.createElement('div');
        sortRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;';
        const btnAZ = document.createElement('button');
        btnAZ.textContent = 'A→Z';
        btnAZ.style.cssText = 'flex:1;padding:2px 6px;background:#313552;border:1px solid #3a4460;border-radius:4px;cursor:pointer;color:#cdd6f4;font-size:0.75rem;';
        btnAZ.onclick = () => { this._sortTableBy(colIdx, true); panel.remove(); };
        const btnZA = document.createElement('button');
        btnZA.textContent = 'Z→A';
        btnZA.style.cssText = btnAZ.style.cssText;
        btnZA.onclick = () => { this._sortTableBy(colIdx, false); panel.remove(); };
        sortRow.append(btnAZ, btnZA);
        panel.appendChild(sortRow);

        // Search box
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search…';
        searchInput.style.cssText = 'width:100%;box-sizing:border-box;padding:3px 6px;margin-bottom:6px;background:#0f172a;border:1px solid #3a4460;border-radius:4px;color:#cdd6f4;font-size:0.8rem;';
        panel.appendChild(searchInput);

        // Select All / Clear
        const allRow = document.createElement('div');
        allRow.style.cssText = 'display:flex;gap:6px;margin-bottom:4px;';
        const btnAll = document.createElement('button');
        btnAll.textContent = 'Select All';
        btnAll.style.cssText = 'font-size:0.7rem;background:none;border:none;color:#89b4fa;cursor:pointer;padding:0;';
        const btnClear = document.createElement('button');
        btnClear.textContent = 'Clear';
        btnClear.style.cssText = btnAll.style.cssText;
        allRow.append(btnAll, btnClear);
        panel.appendChild(allRow);

        // Checkboxes
        const listDiv = document.createElement('div');
        listDiv.style.cssText = 'max-height:160px;overflow-y:auto;';
        const renderList = (filter) => {
            listDiv.innerHTML = '';
            const filtered = uniqueVals.filter(v => !filter || v.toLowerCase().includes(filter.toLowerCase())).slice(0, 250);
            filtered.forEach(val => {
                const label = document.createElement('label');
                label.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = val;
                cb.checked = !activeFilter || activeFilter.has(val);
                label.append(cb, document.createTextNode(val || '(blank)'));
                listDiv.appendChild(label);
            });
        };
        renderList('');
        panel.appendChild(listDiv);

        searchInput.addEventListener('input', () => renderList(searchInput.value));
        btnAll.onclick = () => listDiv.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
        btnClear.onclick = () => listDiv.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);

        // OK / Cancel
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:4px;margin-top:8px;';
        const btnOk = document.createElement('button');
        btnOk.textContent = 'OK';
        btnOk.style.cssText = 'flex:1;padding:3px;background:#89b4fa;color:#1e2533;border:none;border-radius:4px;cursor:pointer;font-weight:700;';
        const btnCancel = document.createElement('button');
        btnCancel.textContent = 'Cancel';
        btnCancel.style.cssText = 'flex:1;padding:3px;background:#313552;color:#cdd6f4;border:1px solid #3a4460;border-radius:4px;cursor:pointer;';
        btnOk.onclick = () => {
            const checked = [...listDiv.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value);
            const unchecked = [...listDiv.querySelectorAll('input[type=checkbox]:not(:checked)')].map(cb => cb.value);
            if (unchecked.length === 0) {
                delete this._columnFilters[colIdx];  // no filter active
            } else {
                this._columnFilters[colIdx] = new Set(checked);
            }
            // Update button indicator
            const afBtn = anchorEl;
            const isActive = !!this._columnFilters[colIdx];
            afBtn.dataset.active = isActive ? '1' : '';
            afBtn.style.opacity = '1';
            afBtn.querySelector('svg polygon').setAttribute('fill', isActive ? '#89b4fa' : 'currentColor');
            this._applyFilters();
            panel.remove();
        };
        btnCancel.onclick = () => panel.remove();
        btnRow.append(btnOk, btnCancel);
        panel.appendChild(btnRow);

        // Position the panel below the anchor button using fixed coords
        document.body.appendChild(panel);
        const rect = anchorEl.getBoundingClientRect();
        panel.style.position = 'fixed';
        panel.style.top = (rect.bottom + 2) + 'px';
        panel.style.left = rect.left + 'px';

        // Close on outside click
        const closeHandler = (e) => {
            if (!panel.contains(e.target) && e.target !== anchorEl) {
                panel.remove();
                document.removeEventListener('click', closeHandler, true);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler, true), 10);
        searchInput.focus();
    }

    _applyFilters() {
        const filters = this._columnFilters;
        const hasFilters = Object.keys(filters).length > 0;
        const tbodies = [this._mainTbody, this._suppTbody].filter(Boolean);
        let visCount = 0, totalCount = 0;

        tbodies.forEach(tbody => {
            if (!tbody) return;
            Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
                totalCount++;
                if (!hasFilters) { tr.style.display = ''; visCount++; return; }
                const cells = tr.querySelectorAll('td');
                const show = Object.entries(filters).every(([colIdx, allowed]) => {
                    const cell = cells[Number(colIdx)];
                    if (!cell) return true;
                    return allowed.has(cell.textContent ?? '');
                });
                tr.style.display = show ? '' : 'none';
                if (show) visCount++;
            });
        });

        // Update filter status in status bar if present
        const statusEl = document.querySelector('.pcf-table-filter-status');
        if (statusEl) {
            statusEl.textContent = hasFilters ? `Filtered: ${visCount} of ${totalCount} rows` : '';
        }
        if (this._resetBtn) this._resetBtn.style.display = hasFilters ? 'inline-flex' : 'none';
    }

    _sortTableBy(colIdx, ascending) {
        const tbodies = [this._mainTbody, this._suppTbody].filter(Boolean);
        tbodies.forEach(tbody => {
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('tr'));
            rows.sort((a, b) => {
                const aVal = a.querySelectorAll('td')[colIdx]?.textContent ?? '';
                const bVal = b.querySelectorAll('td')[colIdx]?.textContent ?? '';
                const aNum = parseFloat(aVal);
                const bNum = parseFloat(bVal);
                if (!isNaN(aNum) && !isNaN(bNum)) return ascending ? aNum - bNum : bNum - aNum;
                return ascending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            });
            rows.forEach(r => tbody.appendChild(r));
        });
    }

    injectStyles() {
        if (document.getElementById("pcf-table-styles")) return;
        const style = document.createElement("style");
        style.id = "pcf-table-styles";
        style.textContent = `
            .editable-table td { min-width: 50px; white-space: nowrap; max-width: 300px; overflow: hidden; text-overflow: ellipsis; padding: 4px 8px; font-size: 0.8rem; border-right: 1px solid var(--border-color); }
            .editable-table th { white-space: nowrap; padding: 8px; background: var(--bg-2); position: sticky; top: 0; z-index: 10; font-size: 0.75rem; }
            .header-group { text-align: center; background: var(--bg-4) !important; color: var(--text-secondary); }
            .locked-cell { background: var(--bg-subtle); color: var(--text-muted); cursor: default; }
            .smart-cell { background: var(--bg-3); color: var(--text-muted); }
            .text-success { color: var(--green-ok); font-weight: 600; }
            .bg-pink-error { background-color: rgba(255, 99, 71, 0.2) !important; }
            .bg-blue-light { background-color: rgba(135, 206, 250, 0.2) !important; }
            .cell-edited { border-bottom: 2px solid var(--amber) !important; }
            .fill-down-applied { background-color: rgba(245, 158, 11, 0.12) !important; }
            .table-section h3 { font-size: 1rem; color: var(--text-primary); margin-bottom: 0.5rem; border-bottom: 2px solid var(--steel); padding-bottom: 4px; }
            .ca8-valve-ambiguous-cell { background-color: rgba(245, 158, 11, 0.10) !important; }
            .ca8-valve-weight-select:focus { box-shadow: 0 0 0 2px rgba(245,158,11,0.22); }
        `;
        document.head.appendChild(style);
    }
}
