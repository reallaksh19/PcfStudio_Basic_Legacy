import { parsePcf } from "../viewer/pcf-parser.js";
import { getState, setState, subscribe } from "../state.js";
import { globalLogger } from "../utils/diagnostic-logger.js";
import { runConvert } from "./mapping-tab.js";
import { runSequencer } from "../graph/sequencer.js";
import { TableDataBuilder } from "./table/TableDataBuilder.js";
import { TableRenderer } from "./table/TableRenderer.js";
import { TableInteraction } from "./table/TableInteraction.js";
import { TableRegenerator } from "./table/TableRegenerator.js";
import { showMaterialCodePopup } from "./material-code-popup.js";
import { getConfig } from "../config/config-store.js";
import { buildLineGroups, renderCAMatrix, applyMatrixToTable, overwriteMatrixToTable } from "./ca-matrix-popup.js";
import { updateDebugTable } from "./debug-tab.js";
import { detectRating } from "../services/rating-detector.js";
import { materialService } from "../services/material-service.js";

/**
 * PcfTableController (Refactored)
 * Coordinates data building, rendering, and interaction for the PCF Table Tab.
 */
export class PcfTableController {
    constructor() {
        this.container = document.getElementById("pcf-table-container");
        this.refreshBtn = document.getElementById("btn-refresh-table");
        this.refreshPhase1Btn = document.getElementById("btn-refresh-phase1");
        this.exportBtn = document.getElementById("btn-export-table");
        this.regenerateBtn = document.getElementById("btn-regenerate-pcf");
        this.exportPhase1Btn = document.getElementById("btn-export-phase1");
        this.nextBtn = document.getElementById("btn-next-phase2");
        this.toleranceInput = document.getElementById("pcf-table-tolerance");
        this.logContainer = document.getElementById("mapping-diagnostic-log");
        this.clearLogBtn = document.getElementById("btn-clear-mapping-log");
        this.copyLogBtn = document.getElementById("btn-copy-mapping-log");

        this.logger = globalLogger;
        this.builder = new TableDataBuilder(this.logger);
        this.interaction = new TableInteraction(this);
        this.regenerator = new TableRegenerator(this.logger);

        // Define Headers (Standardized)
        this.headers = [
            "CSV Seq No", "Sequence", "RefNo", "Component", "Start X", "Start Y", "Start Z", "DN (Bore)",
            "Len_Calc", // Index 8
            "Axis 1", "Grp L1", "Axis 2", "Grp L2", "Axis 3", "Grp L3",
            // SeqNo Logic (8 Cols)
            "Prev(SeqNo)", "Next(SeqNo)", "Prev(mm)", "Next(mm)", "Prev", "Next", "Prev(Gap)", "Next(Gap)",
            // Final Route (4 Cols)
            "Prev(Target)", "Next(Target)", "Prev(EP1)", "Next(EP2)",
            "Line No. (Derived)",
            "P1 (ATTR1)", "T1 (ATTR2)", "Ins Thk (ATTR5)", "Ins Den (ATTR6)", "Density (ATTR9)", "HP (ATTR10)",
            "Piping Class", "Rating", "Rigid Type", "Weight (ATTR8)", "Material (ATTR3)", "Wall Thk (ATTR4)", "Corr (ATTR7)",
            "Support_GUID"  // Support only
        ];

        this.renderer = new TableRenderer(this.container, this.headers);
        this.tableData = []; // Master data store (array of arrays)
        this.rowObjects = []; // Store full row objects including group reference
        // Map<"RefNo:colIdx", value> — persists ALL manual cell edits across re-renders
        this._cellEdits = new Map();
        this._materialOverrides = new Map();
        this._materialPopupOpen = false;
        this._materialPopupDismissedSignature = '';
        this._lastGroupsRef = null;

        this.bindEvents();

        // Auto-render only when Phase 1 PCF is (re)generated — NOT on groups or topology
        // to avoid wiping CA edits when Phase 2 runs.
        subscribe("pcfPass1Lines", () => {
            if (!this._regenerating) this.render();
        });

        // Task 5 Check: Make Controller an active observer of late-arriving DataManager events
        import("../services/data-manager.js").then(({ dataManager }) => {
            dataManager.onChange((type) => {
                if (type === 'weights' || type === 'materialmap' || type === 'pipingclass') {
                    console.info(`[PcfTableController] Detected DataManager update (${type}), re-rendering table...`);
                    // Debounce rendering slightly
                    if (this._renderTimeout) clearTimeout(this._renderTimeout);
                    this._renderTimeout = setTimeout(() => this.render(), 100);
                }
            });
        }).catch(e => console.error("Failed to load dataManager in PcfTableController", e));

        // External Regen
        document.addEventListener("pcf:regenerate-request", () => {
            window.PCF_DISABLE_SANITIZER = false;
            this.regeneratePCF();
        });

        document.addEventListener("pcf:regenerate-request-no-sanitizer", () => {
            window.PCF_DISABLE_SANITIZER = true;
            this.regeneratePCF();
        });

        const lines = getState("pcfLines");
        if (lines && lines.length > 0) this.render();
    }

    bindEvents() {
        // ↺ Refresh Phase 1
        if (this.refreshPhase1Btn) this.refreshPhase1Btn.addEventListener("click", async () => {
            this.refreshPhase1Btn.disabled = true;
            this.refreshPhase1Btn.textContent = '⏳ Running Phase 1…';
            try { await runConvert(); this.render(); }
            catch (e) { console.error('[PcfTableController] Refresh Phase 1 failed:', e); }
            finally { this.refreshPhase1Btn.disabled = false; this.refreshPhase1Btn.textContent = '⚡ Refresh Phase 1'; }
        });

        if (this.exportPhase1Btn) this.exportPhase1Btn.style.display = 'none';
        if (this.exportBtn) this.exportBtn.addEventListener("click", () => this.interaction.exportCSV(this.headers, this.tableData));
        if (this.regenerateBtn) this.regenerateBtn.addEventListener("click", () => this.showCAMatrixPopup());
        if (this.nextBtn) this.nextBtn.addEventListener("click", () => this._handleNextPhase2());

        // ↺ Refresh Line Key — re-derive ColumnX1 line no. from line dump coordinates
        const refreshLineKeyBtn = document.getElementById("btn-refresh-line-key");
        if (refreshLineKeyBtn) {
            refreshLineKeyBtn.addEventListener("click", async () => {
                refreshLineKeyBtn.disabled = true;
                refreshLineKeyBtn.textContent = '⏳…';
                try { await this._refreshLineKeys(); this.render(); }
                finally { refreshLineKeyBtn.disabled = false; refreshLineKeyBtn.textContent = '↺ Refresh Line Key'; }
            });
        }

        // ↺ Refresh — fetch master attributes for all rows
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener("click", async () => {
                const overwrite = document.getElementById("chk-overwrite")?.checked ?? false;
                this.refreshBtn.disabled = true;
                this.refreshBtn.textContent = '⏳…';
                try {
                    for (let i = 0; i < this.tableData.length; i++) {
                        const attrs = this._fetchRowAttrs(i);
                        if (attrs) this._applyFetchedAttrs(i, attrs, { overwrite, cols: null });
                    }
                    this.render();
                } finally {
                    this.refreshBtn.disabled = false;
                    this.refreshBtn.textContent = '↺ Refresh';
                }
            });
        }

        // ↺ Refresh entire Col. (overwrite) — refresh only the selected column
        const refreshColBtn = document.getElementById("btn-refresh-col-overwrite");
        const selectCaCol = document.getElementById("select-ca-col");
        if (refreshColBtn && selectCaCol) {
            refreshColBtn.addEventListener("click", async () => {
                const colName = selectCaCol.value;
                if (!colName) { alert("Please select a column from 'Select CA ▼' first."); return; }
                refreshColBtn.disabled = true;
                refreshColBtn.textContent = '⏳…';
                try {
                    // Always also refresh Rating as a dependency
                    const targetCols = new Set([colName, 'Rating']);
                    for (let i = 0; i < this.tableData.length; i++) {
                        const attrs = this._fetchRowAttrs(i);
                        if (attrs) this._applyFetchedAttrs(i, attrs, { overwrite: true, cols: targetCols });
                    }
                    this.render();
                } finally {
                    refreshColBtn.disabled = false;
                    refreshColBtn.textContent = '↺ Refresh entire Col. (overwrite)';
                }
            });
        }
    }

    // ── Refresh Line Key: re-derive ColumnX1 line no. from line dump ──────
    async _refreshLineKeys() {
        const dm = window.dataManager;
        if (!dm) return;
        const lineDumpData = dm.getLineDump() || [];
        if (!lineDumpData.length) { alert("No Line Dump data loaded."); return; }

        const builder = this.builder;
        const LINE_NO_COL = this.headers.indexOf('Line No. (Derived)');
        const START_X = this.headers.indexOf('Start X');
        const START_Y = this.headers.indexOf('Start Y');
        const START_Z = this.headers.indexOf('Start Z');
        const REFNO_COL = this.headers.indexOf('RefNo');

        for (let i = 0; i < this.tableData.length; i++) {
            const row = this.tableData[i];
            if (!row) continue;
            const x = parseFloat(row[START_X]);
            const y = parseFloat(row[START_Y]);
            const z = parseFloat(row[START_Z]);
            const refNo = String(row[REFNO_COL] || '');
            if (isNaN(x) || isNaN(y)) continue;
            const lineNo = builder.matchLineDump({ x, y, z, refNo }, lineDumpData, 25.0);
            if (lineNo) row[LINE_NO_COL] = lineNo;
        }
    }

    // ── Common: fetch master attributes for one table row ──────────────────
    _fetchRowAttrs(rowIdx) {
        const row = this.tableData[rowIdx];
        if (!row) return null;
        const dm = window.dataManager;
        if (!dm) return null;

        const H = (name) => this.headers.indexOf(name);
        const linelistData  = dm.getLinelist()          || [];
        const pipingMaster  = dm.getPipingClassMaster() || [];
        const weightMaster  = dm.getWeights()           || [];

        const lineNoKey  = dm.headerMap?.linelist?.lineNo   || 'Line Number';
        const pcClassKey = dm.headerMap?.pipingclass?.class    || 'Piping Class';
        const pcSizeKey  = dm.headerMap?.pipingclass?.size     || 'Size';
        const pcWallKey  = dm.headerMap?.pipingclass?.wall     || 'Wall Thickness';
        const pcCorrKey  = dm.headerMap?.pipingclass?.corrosion|| 'Corrosion Allowance';
        const pcMatKey   = dm.headerMap?.pipingclass?.material || 'Material_Name';
        const wSizeKey   = dm.headerMap?.weights?.size         || 'Size (NPS)';
        const wRatingKey = dm.headerMap?.weights?.rating       || 'Rating';
        const wWeightKey = dm.headerMap?.weights?.weight       || 'RF/RTJ KG';
        const wDescKey   = dm.headerMap?.weights?.description  || 'Type Description';

        const state    = window.linelistService?.getState?.('linelist') || {};
        const smartMap = state.smartMap || state.smartMapping || {};

        const getVal = (r, keys) => {
            for (const k of keys) {
                const v = r[k];
                if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
            }
            return null;
        };

        // Read row fields
        const lineNo     = String(row[H('Line No. (Derived)')] || '').trim();
        const bore       = parseFloat(row[H('DN (Bore)')] || 0) || 0;
        const compType   = String(row[H('Component')]    || '').trim().toUpperCase();
        let   pipingClass = String(row[H('Piping Class')] || '').trim();
        let   rigidType  = String(row[H('Rigid Type')]   || '').trim();

        const result = {};

        // Step 1: linelist lookup
        const llRow = lineNo ? linelistData.find(r => String(r[lineNoKey] ?? '').trim() === lineNo) || null : null;
        if (llRow) {
            const set = (key, mainKeys) => {
                const smKey = { p1:'P1', t1:'T1', insThk:'InsThk', density:'Density', hp:'HP' }[key];
                const extraKeys = smKey && smartMap[smKey] ? [smartMap[smKey]] : [];
                result[key] = getVal(llRow, [...extraKeys, ...mainKeys]);
            };
            set('p1',      ["Design Pressure", "Design Pr", "Op. Pr", "Operating Pressure", "Pressure"]);
            set('t1',      ["Design Temp", "Design Temperature", "Op. Temp", "Operating Temperature", "Temperature", "Temp"]);
            set('insThk',  ["Insulation Thickness", "Ins Thk", "InsThk", "Ins. Thk"]);
            set('insDen',  ["Insulation Density", "Ins Den", "InsDen"]);
            set('density', ["Fluid Density", "Density", "Den"]);
            set('hp',      ["Hydrotest Pressure", "Test Pressure", "HP"]);
        }

        // Step 2: piping class (from linelist or existing row value)
        if (llRow && !pipingClass) {
            const pcSmKey = smartMap['PipingClass'];
            pipingClass = getVal(llRow, [...(pcSmKey ? [pcSmKey] : []), "Piping Class", "Piping Spec", "Spec", "Class"]) || '';
        }
        if (pipingClass) result.pipingClass = pipingClass;

        // Step 3: rating
        const ratingNum = pipingClass ? detectRating(pipingClass) : null;
        if (ratingNum !== null) result.rating = String(ratingNum);

        // Step 4: piping class master → material, wall, corrosion
        if (pipingClass) {
            const boreStr = String(bore);
            let pcRow = pipingMaster.find(r =>
                String(r[pcClassKey] || '').trim() === pipingClass &&
                String(r[pcSizeKey]  || '').trim() === boreStr
            ) || pipingMaster.find(r => String(r[pcClassKey] || '').trim() === pipingClass)
              || pipingMaster.find(r => { const rc = String(r[pcClassKey] || '').trim(); return pipingClass.startsWith(rc) || rc.startsWith(pipingClass); })
              || null;

            if (pcRow) {
                result.wall = String(pcRow[pcWallKey] || '').trim() || undefined;
                result.corr = String(pcRow[pcCorrKey] || '').trim() || undefined;
                const materialAttrs = materialService.resolveAttributes(pipingClass);
                result.material = materialAttrs.materialCode || "";
            }
        }

        // Step 5: weight by Rigid Type (flange, valve, elbow, etc.) + rating + bore
        // Rigid Type drives the description filter in the weight master
        const lookupRigidType = rigidType || compType;
        if (lookupRigidType && ratingNum !== null && bore > 0 && weightMaster.length) {
            const rtUpper = lookupRigidType.toUpperCase();
            // Build keyword list from rigid type for matching weight master descriptions
            const keywords = [];
            if (rtUpper.includes('FLANGE') || rtUpper === 'F') keywords.push('FLANGE', 'FLG');
            else if (rtUpper.includes('VALVE') || rtUpper === 'V') keywords.push('VALVE', 'VLV');
            else if (rtUpper.includes('ELBOW') || rtUpper === 'E') keywords.push('ELBOW', 'ELB');
            else if (rtUpper.includes('TEE') || rtUpper === 'T') keywords.push('TEE');
            else if (rtUpper.includes('RED') || rtUpper.includes('REDUCER')) keywords.push('REDUCER', 'RED');
            else if (rtUpper.includes('CAP')) keywords.push('CAP');
            else keywords.push(rtUpper.split(/[\s_-]/)[0]); // first word fallback

            const candidateRows = keywords.length
                ? weightMaster.filter(r => {
                    const desc = String(r[wDescKey] || '').toUpperCase();
                    return keywords.some(kw => desc.includes(kw));
                })
                : weightMaster;

            if (candidateRows.length) {
                let best = null, bestDiff = Infinity;
                for (const r of candidateRows) {
                    const rRaw  = parseFloat(String(r[wRatingKey] || '').replace(/[#LB]/gi, ''));
                    const rSize = parseFloat(String(r[wSizeKey]   || '').replace(/[^\d.]/g, ''));
                    if (isNaN(rRaw) || isNaN(rSize)) continue;
                    if (Math.abs(rRaw - ratingNum) > 0.1) continue;
                    const diff = Math.abs(rSize - bore);
                    if (diff < bestDiff) { bestDiff = diff; best = r; }
                }
                if (best) result.weight = String(best[wWeightKey] || '').trim();
            }
        }

        return result;
    }

    // ── Apply fetched attrs to a row array ─────────────────────────────────
    _applyFetchedAttrs(rowIdx, attrs, { overwrite = true, cols = null }) {
        const row = this.tableData[rowIdx];
        if (!row) return;
        const H = (name) => this.headers.indexOf(name);

        const apply = (colName, val) => {
            if (val === undefined || val === null || val === '') return;
            if (cols && !cols.has(colName)) return;
            const idx = H(colName);
            if (idx === -1) return;
            const cur = String(row[idx] || '').trim();
            if (!overwrite && cur && cur !== '0' && cur !== 'Undefined MM') return;
            row[idx] = val;
        };

        apply('P1 (ATTR1)',      attrs.p1);
        apply('T1 (ATTR2)',      attrs.t1);
        apply('Ins Thk (ATTR5)', attrs.insThk);
        apply('Ins Den (ATTR6)', attrs.insDen);
        apply('Density (ATTR9)', attrs.density);
        apply('HP (ATTR10)',     attrs.hp);
        apply('Piping Class',    attrs.pipingClass);
        apply('Rating',          attrs.rating);
        apply('Material (ATTR3)',attrs.material);
        apply('Wall Thk (ATTR4)',attrs.wall);
        apply('Corr (ATTR7)',    attrs.corr);
        apply('Weight (ATTR8)',  attrs.weight);
        apply('Rigid Type',      attrs.rigidType);
    }

    _syncTableToState() {
        const table = document.getElementById("pcf-table-body");
        if (!table) return;
        const rows = table.querySelectorAll('tr');
        const state = getState("pcfData") || [];
        if (!state.grouped) return;

        const LINE_NO_COL = this.headers.indexOf('Line No. (Derived)');
        if (LINE_NO_COL === -1) return;

        let syncCount = 0;
        rows.forEach((tr) => {
            const td = tr.querySelector(`td[data-col="${LINE_NO_COL}"]`);
            if (!td) return;
            const rowIndex = parseInt(td.dataset.row, 10);
            const newVal = td.textContent.trim();

            if (this.tableData && this.tableData[rowIndex]) {
                const groupRef = this.tableData[rowIndex].group;
                if (groupRef) {
                    groupRef.attributes = groupRef.attributes || {};
                    groupRef.attributes['Line No. (Derived)'] = newVal;
                    groupRef.attributes['PIPELINE-REFERENCE'] = newVal;
                    syncCount++;
                }
            }
        });
        console.log(`[PcfTableController] Synced ${syncCount} edited Line Nos back to state for Refresh.`);
    }

    showCAMatrixPopup() {
        const config = getConfig();
        const caDefs = config.caDefinitions || {};

        // 1. Build Line Groups
        const lineGroups = buildLineGroups(this.tableData, this.headers);

        if (lineGroups.size === 0) {
            // No data, just regenerate directly
            this.regeneratePCF();
            alert("PCF Regenerated from Table.");
            return;
        }

        // 2. Render UI
        let popup = document.getElementById("ca-matrix-popup-container");
        if (!popup) {
            popup = document.createElement("div");
            popup.id = "ca-matrix-popup-container";
            popup.className = "modal-overlay";
            document.body.appendChild(popup);
        }

        const matrixHtml = renderCAMatrix(lineGroups, caDefs);

        popup.innerHTML = `
            <div class="modal-content" style="max-width:90vw; width:90vw; background:var(--bg-1); padding:1.5rem; border:1px solid var(--border); border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.5)">
                <h3 style="margin-top:0; color:var(--text-primary);">CA Attribute Matrix</h3>
                <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:1rem;">Review and assign Component Attributes grouped by Line No. and Bore. Click "Load to Empty Cells in PCF data table" to apply.</p>
                
                <div style="max-height: 60vh; overflow-y: auto; background: var(--bg-2); border: 1px solid var(--border); border-radius: 4px; padding: 0.5rem; scrollbar-width: thin;">
                    ${matrixHtml}
                </div>

                <div class="modal-actions" style="margin-top:1.5rem; display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                    <div style="display:flex;gap:0.5rem">
                        <button id="btn-load-master-matrix" class="btn btn-secondary" style="background:var(--amber);color:#000;border:none;font-weight:600;" title="Load data from master linelist + piping class master + weight master into empty cells only">⟳ Load from Master (Fill Blanks)</button>
                    </div>
                    <div style="display:flex;gap:0.5rem">
                        <button id="btn-cancel-matrix" class="btn btn-secondary">Cancel</button>
                        <button id="btn-load-defaults-matrix" class="btn btn-secondary" title="Fill empty cells with config default values (CA definitions from Config tab)">Load defaults to empty cells Only</button>
                        <button id="btn-apply-matrix" class="btn btn-primary" style="background:#38bdf8; color:#0f172a; border:none; font-weight:600;">Load to Empty Cells in PCF data table</button>
                    </div>
                </div>
            </div>
        `;

        popup.style.display = "flex";
        popup.style.alignItems = "center";
        popup.style.justifyContent = "center";
        popup.style.zIndex = "1000";

        const close = () => { popup.style.display = "none"; };
        popup.querySelector("#btn-cancel-matrix").onclick = close;

        // Load config defaults into empty cells only
        popup.querySelector("#btn-load-defaults-matrix").onclick = () => {
            const caList = ['CA1','CA2','CA3','CA4','CA5','CA6','CA7','CA8','CA9','CA10'];
            caList.forEach(ca => {
                const defVal = caDefs[ca]?.default;
                if (!defVal && defVal !== 0) return;  // no default defined, skip
                popup.querySelectorAll(`input[data-ca="${ca}"]`).forEach(inp => {
                    if (!inp.value.trim()) inp.value = String(defVal);
                });
            });
        };

        // ── Shared: load master data into a single table row ──────────
        const loadMasterForRow = (tr) => {
            const dm = window.dataManager;
            if (!dm) return;

            const linelistData  = dm.getLinelist()           || [];
            const pipingMaster  = dm.getPipingClassMaster()  || [];
            const weightMaster  = dm.getWeights()            || [];

            const lineNoKey  = dm.headerMap?.linelist?.lineNo   || 'Line Number';
            const pcClassKey = dm.headerMap?.pipingclass?.class    || 'Piping Class';
            const pcSizeKey  = dm.headerMap?.pipingclass?.size     || 'Size';
            const pcWallKey  = dm.headerMap?.pipingclass?.wall     || 'Wall Thickness';
            const pcCorrKey  = dm.headerMap?.pipingclass?.corrosion|| 'Corrosion Allowance';
            const pcMatKey   = dm.headerMap?.pipingclass?.material || 'Material_Name';
            const wSizeKey   = dm.headerMap?.weights?.size         || 'Size (NPS)';
            const wRatingKey = dm.headerMap?.weights?.rating       || 'Rating';
            const wWeightKey = dm.headerMap?.weights?.weight       || 'RF/RTJ KG';
            const wDescKey   = dm.headerMap?.weights?.description  || 'Type Description';

            const state    = window.linelistService?.getState?.('linelist') || {};
            const smartMap = state.smartMap || state.smartMapping || {};

            const getVal = (row, keys) => {
                for (const k of keys) {
                    const v = row[k];
                    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
                }
                return null;
            };

            const lineNoInp = tr.querySelector('.matrix-line-no');
            if (!lineNoInp) return;
            const lineNo = lineNoInp.value.trim();
            const boreCell = tr.children[2];
            const bore = boreCell ? boreCell.textContent.trim() : '';

            // Step 1: linelist lookup — keyed on ColumnX1 (dynamic headerMap.linelist.lineNo)
            const llRow = lineNo
                ? linelistData.find(r => String(r[lineNoKey] ?? '').trim() === lineNo) || null
                : null;

            if (llRow) {
                const set = (ca, keys) => {
                    const inp = tr.querySelector(`input[data-ca="${ca}"]`);
                    if (!inp) return;
                    const smKey = { CA1:'P1', CA2:'T1', CA5:'InsThk', CA9:'Density', CA10:'HP' }[ca];
                    const extraKeys = smKey && smartMap[smKey] ? [smartMap[smKey]] : [];
                    const v = getVal(llRow, [...extraKeys, ...keys]);
                    if (v !== null && (!inp.value || String(inp.value).trim() === '')) inp.value = v;
                };
                set('CA1',  ["Design Pressure", "Design Pr", "Op. Pr", "Operating Pressure", "Pressure"]);
                set('CA2',  ["Design Temp", "Design Temperature", "Op. Temp", "Operating Temperature", "Temperature", "Temp"]);
                set('CA5',  ["Insulation Thickness", "Ins Thk", "InsThk", "Ins. Thk"]);
                set('CA6',  ["Insulation Density", "Ins Den", "InsDen"]);
                set('CA9',  ["Fluid Density", "Density", "Den"]);
                set('CA10', ["Hydrotest Pressure", "Test Pressure", "HP"]);
            }

            // Step 2: resolve piping class
            let pipingClass = null;
            if (llRow) {
                const pcSmKey = smartMap['PipingClass'];
                pipingClass = getVal(llRow, [...(pcSmKey ? [pcSmKey] : []), "Piping Class", "Piping Spec", "Spec", "Class"]);
            }
            const pcInp = tr.querySelector('input[data-pc]');
            if (pcInp && pipingClass && (!pcInp.value || String(pcInp.value).trim() === '')) pcInp.value = pipingClass;
            else if (pcInp) pipingClass = pcInp.value.trim() || pipingClass || null;

            // Step 3: rating from piping class
            let ratingNum = null;
            if (pipingClass) ratingNum = detectRating(pipingClass);
            const ratingInp = tr.querySelector('input[data-rating]');
            if (ratingInp && ratingNum !== null && (!ratingInp.value || String(ratingInp.value).trim() === '')) ratingInp.value = String(ratingNum);

            // Step 4: piping class master → wall, corrosion, material
            if (pipingClass) {
                const boreStr = String(bore).trim();
                let pcRow = pipingMaster.find(r =>
                    String(r[pcClassKey] || '').trim() === pipingClass &&
                    String(r[pcSizeKey]  || '').trim() === boreStr
                ) || pipingMaster.find(r =>
                    String(r[pcClassKey] || '').trim() === pipingClass
                ) || pipingMaster.find(r => {
                    const rc = String(r[pcClassKey] || '').trim();
                    return pipingClass.startsWith(rc) || rc.startsWith(pipingClass);
                }) || null;

                if (pcRow) {
                    const setCA = (ca, col) => {
                        const inp = tr.querySelector(`input[data-ca="${ca}"]`);
                        const v   = String(pcRow[col] || '').trim();
                        if (inp && v && (!inp.value || String(inp.value).trim() === '')) inp.value = v;
                    };
                    setCA('CA4', pcWallKey);
                    setCA('CA7', pcCorrKey);
                    const materialAttrs = materialService.resolveAttributes(pipingClass);
                    const ca3Inp = tr.querySelector('input[data-ca="CA3"]');
                    if (ca3Inp && materialAttrs.materialCode && (!ca3Inp.value || String(ca3Inp.value).trim() === '')) ca3Inp.value = materialAttrs.materialCode;
                }
            }

            // Step 5: flange weight → CA8
            if (ratingNum !== null) {
                const boreNum = parseFloat(bore) || 0;
                const flangeRows = weightMaster.filter(r => {
                    const desc = String(r[wDescKey] || '').toUpperCase();
                    return desc.includes('FLANGE') || desc.includes('FLG');
                });
                let bestRow = null, bestDiff = Infinity;
                for (const r of flangeRows) {
                    const rRaw  = parseFloat(String(r[wRatingKey] || '').replace(/[#LB]/gi, ''));
                    const rSize = parseFloat(String(r[wSizeKey]  || '').replace(/[^\d.]/g, ''));
                    if (isNaN(rRaw) || isNaN(rSize)) continue;
                    if (Math.abs(rRaw - ratingNum) > 0.1) continue;
                    const diff = Math.abs(rSize - boreNum);
                    if (diff < bestDiff) { bestDiff = diff; bestRow = r; }
                }
                if (bestRow) {
                    const wt = String(bestRow[wWeightKey] || '').trim();
                    const ca8Inp = tr.querySelector('input[data-ca="CA8"]');
                    if (ca8Inp && wt && (!ca8Inp.value || String(ca8Inp.value).trim() === '')) ca8Inp.value = wt;
                }
            }

            // Flash row to indicate refresh done
            tr.style.transition = 'background 0.3s';
            tr.style.background = 'var(--green-muted, #14532d)';
            setTimeout(() => { tr.style.background = ''; }, 600);
        };

        // ── Per-row refresh buttons ────────────────────────────────────
        popup.querySelectorAll(".btn-row-load-master").forEach(btn => {
            btn.addEventListener("click", () => {
                const groupKey = btn.dataset.group;
                const tr = popup.querySelector(`tr[data-group-row="${groupKey}"]`);
                if (tr) loadMasterForRow(tr);
            });
        });

        // ── Fill Down for CA / Piping Class / Rating columns ──
        popup.querySelectorAll(".ca-fill-down-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                // data-ca, data-pc, or data-rating attribute drives the selector
                let attr, selector;
                if (btn.dataset.ca)     { attr = 'ca';     selector = `input[data-ca="${btn.dataset.ca}"]`; }
                else if (btn.dataset.pc)     { attr = 'pc';     selector = `input[data-pc]`; }
                else if (btn.dataset.rating) { attr = 'rating'; selector = `input[data-rating]`; }
                else return;

                const allInputs = Array.from(popup.querySelectorAll(selector));
                const sourceInput = allInputs.find(inp => inp.value.trim());
                if (!sourceInput) return;
                const sourceVal = sourceInput.value.trim();
                allInputs.forEach(inp => { if (!inp.value.trim()) inp.value = sourceVal; });
            });
        });

        // ── Load from Master (Overwrite) — applies to all rows ─────────
        popup.querySelector("#btn-load-master-matrix").onclick = () => {
            if (!window.dataManager) { alert("DataManager not available."); return; }
            popup.querySelectorAll('tr[data-group-row]').forEach(tr => loadMasterForRow(tr));
        };

        popup.querySelector("#btn-apply-matrix").onclick = () => {
            const matrixValues = {};

            // Gather CA inputs
            popup.querySelectorAll("input[data-ca]").forEach(input => {
                const group = input.dataset.group;
                const ca    = input.dataset.ca;
                const val   = input.value;
                if (!matrixValues[group]) matrixValues[group] = {};
                matrixValues[group][ca] = val;
            });

            // Gather Piping Class inputs
            popup.querySelectorAll("input[data-pc]").forEach(input => {
                const group = input.dataset.group;
                const val   = input.value;
                if (!matrixValues[group]) matrixValues[group] = {};
                matrixValues[group]['pc'] = val;
            });

            // Gather Rating inputs
            popup.querySelectorAll("input[data-rating]").forEach(input => {
                const group = input.dataset.group;
                const val   = input.value;
                if (!matrixValues[group]) matrixValues[group] = {};
                matrixValues[group]['rating'] = val;
            });

            // Apply to table data (blank cells only)
            this.tableData = applyMatrixToTable(matrixValues, this.tableData, this.headers, lineGroups);

            // Sync back to PCF AST groups
            const caAttrMap = {
                'CA1':'COMPONENT-ATTRIBUTE1', 'CA2':'COMPONENT-ATTRIBUTE2', 'CA3':'COMPONENT-ATTRIBUTE3',
                'CA4':'COMPONENT-ATTRIBUTE4', 'CA5':'COMPONENT-ATTRIBUTE5', 'CA6':'COMPONENT-ATTRIBUTE6',
                'CA7':'COMPONENT-ATTRIBUTE7', 'CA8':'COMPONENT-ATTRIBUTE8', 'CA9':'COMPONENT-ATTRIBUTE9',
                'CA10':'COMPONENT-ATTRIBUTE10', 'pc':'PIPING-CLASS', 'rating':'COMPONENT-ATTRIBUTE-RATING'
            };
            const headerColMap = {
                'CA1':'P1 (ATTR1)', 'CA2':'T1 (ATTR2)', 'CA3':'Material (ATTR3)', 'CA4':'Wall Thk (ATTR4)',
                'CA5':'Ins Thk (ATTR5)', 'CA6':'Ins Den (ATTR6)', 'CA7':'Corr (ATTR7)',
                'CA8':'Weight (ATTR8)', 'CA9':'Density (ATTR9)', 'CA10':'HP (ATTR10)',
                'pc':'Piping Class', 'rating':'Rating'
            };

            for (const [key, caValues] of Object.entries(matrixValues)) {
                const group = lineGroups.get(key);
                if (!group) continue;

                group.rows.forEach(rIdx => {
                    const rowObj = this.rowObjects[rIdx];
                    if (!rowObj?.group) return;
                    const grp = rowObj.group;
                    if (!grp.attributes) grp.attributes = {};

                    Object.entries(caValues).forEach(([ca, val]) => {
                        if (!val || val === '') return;
                        const colIdx = this.headers.indexOf(headerColMap[ca] || '');
                        if (colIdx !== -1 && this.tableData[rIdx]?.[colIdx] === val) {
                            grp.attributes[caAttrMap[ca]] = val;
                        }
                    });
                });
            }

            close();
            this.render();
            setTimeout(() => { this.regeneratePCF(); }, 50);
        };
    }

    render() {
        if (this._regenerating) return;
        this.logger.reset();

        const groups = getState("groups");
        if (!groups) {
            this.container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted)">No data.</div>';
            return;
        }

        const tolerance = parseFloat(this.toleranceInput?.value || "6");

        if (this._lastGroupsRef !== groups) {
            this._materialOverrides = new Map();
            this._materialPopupDismissedSignature = '';
        }
        this._lastGroupsRef = groups;

        // Build Data
        const rowObjects = this.builder.buildData(groups, tolerance, this._materialOverrides);
        this.rowObjects = rowObjects;

        const REFNO_COL = 2;

        // Reapply ALL user-edited cell values so they survive re-render (Regenerate PCF / Generate PCF)
        rowObjects.forEach(r => {
            const refNo = String(r.data[REFNO_COL] || '').trim();
            if (!refNo) return;
            r.data.forEach((_, cIdx) => {
                const key = `${refNo}:${cIdx}`;
                if (this._cellEdits.has(key)) {
                    r.data[cIdx] = this._cellEdits.get(key);
                }
            });
        });

        // Store raw data for editing
        this.tableData = rowObjects.map(r => r.data);

        // Render DOM
        this.renderer.render(rowObjects, (rIdx, cIdx, val) => {
            if (this.tableData[rIdx]) {
                this.tableData[rIdx][cIdx] = val;
                // Persist ALL editable cell values by RefNo+col so they survive re-renders
                const refNo = String(this.tableData[rIdx][REFNO_COL] || '').trim();
                if (refNo) this._cellEdits.set(`${refNo}:${cIdx}`, val);

                // Auto-calculate weight if Piping Class or Rating is changed
                const pcIdx = this.headers.indexOf("Piping Class");
                const ratIdx = this.headers.indexOf("Rating");
                const wtIdx = this.headers.indexOf("Weight (ATTR8)");
                const dnIdx = this.headers.indexOf("DN (Bore)");
                const lenIdx = this.headers.indexOf("Len_Calc");
                const typeIdx = this.headers.indexOf("Component");

                if (cIdx === pcIdx || cIdx === ratIdx) {
                    const row = this.tableData[rIdx];
                    const pClass = row[pcIdx];
                    const rRating = row[ratIdx];
                    const dn = row[dnIdx];
                    const len = row[lenIdx];
                    const compType = row[typeIdx];

                    // Use WeightService to get the new weight
                    import("../services/weight-service.js").then(({ weightService }) => {
                        const newWt = weightService.calculateWeight({
                            type: compType,
                            bore: dn,
                            attributes: { "PIPING-CLASS": pClass || rRating },
                            length: len
                        }, null);

                        if (newWt) {
                            const wtStr = newWt.toFixed(2) + " KG";
                            this.tableData[rIdx][wtIdx] = wtStr;
                            if (refNo) this._cellEdits.set(`${refNo}:${wtIdx}`, wtStr);

                            // Visual update for the weight cell
                            const trs = this.container.querySelectorAll(`tr`);
                            trs.forEach(tr => {
                                const td = tr.querySelector(`td[data-row="${rIdx}"][data-col="${wtIdx}"]`);
                                if (td) {
                                    td.textContent = wtStr;
                                    td.classList.add("text-success", "cell-edited");
                                }
                            });
                        }
                    });
                }
            }
        });

        // Setup Paste
        const tables = this.container.querySelectorAll("table");
        tables.forEach(t => this.interaction.setupPasteHandler(t));

        this._maybeShowMaterialPopup(rowObjects);

        console.log("[PcfTableController] Rendered " + rowObjects.length + " rows.");
    }

    _materialKey(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    _maybeShowMaterialPopup(rowObjects) {
        if (this._materialPopupOpen) return;

        const unresolved = [];
        const seen = new Set();
        for (const rowObj of rowObjects) {
            const res = rowObj.materialResolution;
            if (!res?.description) continue;
            const key = res.key || this._materialKey(res.description);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            unresolved.push({ key, description: res.description, code: '' });
        }

        if (!unresolved.length) {
            this._materialPopupDismissedSignature = '';
            return;
        }

        const signature = unresolved.map(item => item.key).sort().join('|');
        if (signature === this._materialPopupDismissedSignature) return;

        this._materialPopupOpen = true;
        showMaterialCodePopup({
            items: unresolved,
            materialMap: window.dataManager?.getMaterialMap?.() || [],
            onApply: (selections) => {
                this._materialOverrides = new Map(Object.entries(selections || {}));
                this._materialPopupOpen = false;
                this._materialPopupDismissedSignature = '';
                this.render();
            },
            onCancel: () => {
                this._materialPopupOpen = false;
                this._materialPopupDismissedSignature = signature;
            }
        });
    }

    regeneratePCF() {
        this._regenerating = true; // block subscriptions from triggering re-render
        try {
            const headerMap = {};
            this.headers.forEach((h, i) => { headerMap[h] = i; });
            const groups = getState("groups");
            this.regenerator.regenerate(this.tableData, headerMap, groups);
        } finally {
            this._regenerating = false;
        }
    }

    _handleNextPhase2() {
        const tab = document.getElementById("tab-output");
        if (tab) tab.click();
    }
}
