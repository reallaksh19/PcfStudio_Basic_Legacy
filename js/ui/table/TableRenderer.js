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

    render(rows, onCellBlur) {
        this.container.innerHTML = "";
        this.tableData = [];
        this._allTableData = [];
        this._columnFilters = {};  // reset filters on re-render

        const mainStruct = this.createTableStruct("pcf-table-main", "1. Pipe & Components (Sequenced)");
        const suppStruct = this.createTableStruct("pcf-table-supports", "2. Supports / Zero-Length Items (Appended)");
        this._mainTbody = mainStruct.tbody;
        this._suppTbody = suppStruct.tbody;

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

                td.addEventListener("blur", (e) => {
                    const newVal = e.target.textContent.trim();
                    if (newVal !== String(val)) {
                        onCellBlur(idx, colIdx, newVal);
                        e.target.classList.add("cell-edited");
                    }
                });

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
        wrap.innerHTML = `<h3>${title}</h3>`;

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
                       font-size:0.75rem;padding:0 2px;vertical-align:middle;">&#9660;</button>`;
            th.innerHTML = innerHtml;
            th.querySelector('.af-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this._openFilterDropdown(colIdx, e.currentTarget);
            });
            trTop.appendChild(th);
        }

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
            if (this._columnFilters[colIdx]) {
                afBtn.textContent = '●';
                afBtn.style.color = '#89b4fa';
            } else {
                afBtn.textContent = '▾';
                afBtn.style.color = '';
            }
            this._applyFilters();
            panel.remove();
        };
        btnCancel.onclick = () => panel.remove();
        btnRow.append(btnOk, btnCancel);
        panel.appendChild(btnRow);

        // Position the panel below the anchor
        anchorEl.style.position = 'relative';
        anchorEl.closest('th').appendChild(panel);

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
        `;
        document.head.appendChild(style);
    }
}
