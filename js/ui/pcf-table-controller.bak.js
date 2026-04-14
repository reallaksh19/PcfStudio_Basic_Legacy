import { parsePcf } from "../viewer/pcf-parser.js";
import { getState, setState, subscribe } from "../state.js";
import { globalLogger } from "../utils/diagnostic-logger.js";
import { runConvert } from "./mapping-tab.js";
import { runSequencer } from "../graph/sequencer.js";
import { TableDataBuilder } from "./table/TableDataBuilder.js";
import { TableRenderer } from "./table/TableRenderer.js";
import { TableInteraction } from "./table/TableInteraction.js";
import { TableRegenerator } from "./table/TableRegenerator.js";
import { getConfig } from "../config/config-store.js";
import { buildLineGroups, renderCAMatrix, applyMatrixToTable } from "./ca-matrix-popup.js";
import { updateDebugTable } from "./debug-tab.js";

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
            "Piping Class", "Rigid Type", "Weight (ATTR8)", "Material (ATTR3)", "Wall Thk (ATTR4)",
            "Support_GUID"  // Support only
        ];

        this.renderer = new TableRenderer(this.container, this.headers);
        this.tableData = []; // Master data store (array of arrays)
        this.rowObjects = []; // Store full row objects including group reference
        // Map<"RefNo:colIdx", value> — persists ALL manual cell edits across re-renders
        this._cellEdits = new Map();

        this.bindEvents();

        // Auto-render
        subscribe("pcfLines", () => this.render());
        subscribe("groups", () => this.render());

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
            this.regeneratePCF();
        });

        const lines = getState("pcfLines");
        if (lines && lines.length > 0) this.render();
    }

    bindEvents() {
        if (this.refreshBtn) this.refreshBtn.addEventListener("click", () => this.render());
        if (this.exportBtn) this.exportBtn.addEventListener("click", () => this.interaction.exportCSV(this.headers, this.tableData));
        if (this.regenerateBtn) this.regenerateBtn.addEventListener("click", () => {
            this.showCAMatrixPopup();
        });
        if (this.nextBtn) this.nextBtn.addEventListener("click", () => this._handleNextPhase2());
        // ... (other buttons)
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
                <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:1rem;">Review and assign Component Attributes grouped by Line No. and Bore. Click "Load to Empty Cells Only" to apply.</p>
                
                <div style="max-height: 60vh; overflow-y: auto; background: var(--bg-2); border: 1px solid var(--border); border-radius: 4px; padding: 0.5rem; scrollbar-width: thin;">
                    ${matrixHtml}
                </div>

                <div class="modal-actions" style="margin-top:1.5rem; text-align:right; display:flex; justify-content:flex-end; gap:0.5rem">
                    <button id="btn-cancel-matrix" class="btn btn-secondary">Cancel</button>
                    <button id="btn-apply-matrix" class="btn btn-primary" style="background:#38bdf8; color:#0f172a; border:none; font-weight:600;">Load to Empty Cells Only</button>
                </div>
            </div>
        `;

        popup.style.display = "flex";
        popup.style.alignItems = "center";
        popup.style.justifyContent = "center";
        popup.style.zIndex = "1000";

        const close = () => { popup.style.display = "none"; };
        popup.querySelector("#btn-cancel-matrix").onclick = close;

        popup.querySelector("#btn-apply-matrix").onclick = () => {
            const inputs = popup.querySelectorAll("input[data-ca]");
            const matrixValues = {};

            // Gather inputs
            inputs.forEach(input => {
                const group = input.dataset.group;
                const ca = input.dataset.ca;
                const val = input.value;
                if (!matrixValues[group]) matrixValues[group] = {};
                matrixValues[group][ca] = val;
            });

            // 3. Apply to Table
            this.tableData = applyMatrixToTable(matrixValues, this.tableData, this.headers, lineGroups);

            // 4. Update PCF AST & Re-render
            const caMap = {
                'CA1': 'COMPONENT-ATTRIBUTE1', 'CA2': 'COMPONENT-ATTRIBUTE2', 'CA3': 'COMPONENT-ATTRIBUTE3',
                'CA4': 'COMPONENT-ATTRIBUTE4', 'CA5': 'COMPONENT-ATTRIBUTE5', 'CA6': 'COMPONENT-ATTRIBUTE6',
                'CA7': 'COMPONENT-ATTRIBUTE7', 'CA8': 'COMPONENT-ATTRIBUTE8', 'CA9': 'COMPONENT-ATTRIBUTE9',
                'CA10': 'COMPONENT-ATTRIBUTE10'
            };

            for (const [key, caValues] of Object.entries(matrixValues)) {
                const group = lineGroups.get(key);
                if (!group) continue;

                group.rows.forEach(rIdx => {
                    const rowObj = this.rowObjects[rIdx];
                    if (rowObj && rowObj.group) {
                        const grp = rowObj.group;
                        if (!grp.attributes) grp.attributes = {};

                        Object.entries(caValues).forEach(([ca, val]) => {
                            if (val && val !== '') {
                                // Important: We only overwrite the blank ones in applyMatrixToTable. 
                                // Here we need to make sure we don't clobber existing ones in AST if they were skipped.
                                // Actually, applying it directly to rowObjects might be safer to do inside applyMatrixToTable, 
                                // but doing it here is fine as long as we check if it was actually applied to tableData
                                const attrName = caMap[ca];
                                const tableColIdx = this.headers.indexOf(ca === 'CA1' ? 'P1 (ATTR1)' : ca === 'CA2' ? 'T1 (ATTR2)' : ca === 'CA3' ? 'Material (ATTR3)' : ca === 'CA4' ? 'Wall Thk (ATTR4)' : ca === 'CA5' ? 'Ins Thk (ATTR5)' : ca === 'CA6' ? 'Ins Den (ATTR6)' : ca === 'CA8' ? 'Weight (ATTR8)' : ca === 'CA9' ? 'Density (ATTR9)' : ca === 'CA10' ? 'HP (ATTR10)' : 'Corr (ATTR7)');
                                if (tableColIdx !== -1 && this.tableData[rIdx][tableColIdx] === val) {
                                    grp.attributes[attrName] = val;
                                }
                            }
                        });
                    }
                });
            }

            close();
            this.render(); // Re-render table UI with new populated blanks

            setTimeout(() => {
                this.regeneratePCF();
            }, 50);
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

        // Build Data
        const rowObjects = this.builder.buildData(groups, tolerance);
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
            }
        });

        // Setup Paste
        const tables = this.container.querySelectorAll("table");
        tables.forEach(t => this.interaction.setupPasteHandler(t));

        console.log("[PcfTableController] Rendered " + rowObjects.length + " rows.");
    }

    regeneratePCF() {
        // Create a header index map for the regenerator
        const headerMap = {};
        this.headers.forEach((h, i) => { headerMap[h] = i; });

        // Pass Groups as Fallback
        const groups = getState("groups");
        this.regenerator.regenerate(this.tableData, headerMap, groups);
    }

    _handleNextPhase2() {
        const tab = document.getElementById("tab-output");
        if (tab) tab.click();
    }
}
