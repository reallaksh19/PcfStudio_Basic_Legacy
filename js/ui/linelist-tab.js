/**
 * js/ui/linelist-tab.js
 * Handles Linelist tab UI events and rendering.
 */
import { excelParser } from "../services/excel-parser.js";
import { linelistService } from "../services/linelist-service.js";
import { getState, setState, subscribe } from "../state.js";
import { updateStatusBar } from "../app.js";

const MAX_PREVIEW_ROWS = 50;

export function initLinelistTab() {
    console.log("Initializing Linelist Tab...");

    // File Upload Handlers
    const dropZone = document.getElementById("linelist-drop-zone");
    const fileInput = document.getElementById("linelist-file-input");

    if (dropZone && fileInput) {
        dropZone.addEventListener("click", () => fileInput.click());

        dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropZone.classList.add("drag-over");
        });

        dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));

        dropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropZone.classList.remove("drag-over");
            if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });

        fileInput.addEventListener("change", (e) => {
            if (e.target.files.length) handleFile(e.target.files[0]);
        });
    }

    // Button Handlers
    document.getElementById("btn-linelist-clear")?.addEventListener("click", clearData);
    document.getElementById("btn-save-linelist-map")?.addEventListener("click", saveMapping);
    document.getElementById("btn-add-linelist-map-row")?.addEventListener("click", addMappingRow);

    // Subscribe to state changes
    subscribe("linelist", render);
}

async function handleFile(file) {
    try {
        updateStatusBar("parsing", "Reading Excel...");
        const rawData = await excelParser.parseExcelFile(file);

        updateStatusBar("processing", "Analyzing Headers...");
        linelistService.processRawData(file.name, rawData);

        updateStatusBar("done", "Linelist Loaded");
    } catch (err) {
        console.error("Linelist Load Error:", err);
        updateStatusBar("error", err.message);
        alert("Failed to load Linelist: " + err.message);
    }
}

function clearData() {
    linelistService.reset();
    // Clear file input
    const fileInput = document.getElementById("linelist-file-input");
    if (fileInput) fileInput.value = "";
    updateStatusBar("idle");
}

function render(state) {
    if (!state) return;

    const { filename, rawRows, headerRowIndex, headers, mapping } = state;
    const hasData = rawRows && rawRows.length > 0;

    // 1. Toggle Views
    document.getElementById("linelist-drop-zone").style.display = hasData ? "none" : "flex";
    document.getElementById("linelist-grid-wrap").style.display = hasData ? "block" : "none";
    document.getElementById("linelist-header-status").style.display = hasData ? "block" : "none";
    document.getElementById("linelist-mapping-wrap").style.display = hasData ? "flex" : "none"; // Make sure it's flex or block
    document.getElementById("linelist-mapping-wrap").style.display = hasData ? "block" : "none";

    if (!hasData) return;

    // 2. Render Preview Grid
    renderGrid(rawRows, headerRowIndex);

    // 3. Render Header Status
    const statusEl = document.getElementById("linelist-header-info");
    if (statusEl) {
        statusEl.innerHTML = `Detected Header at <strong>Row ${headerRowIndex + 1}</strong>. Found ${headers.length} columns.`;
    }

    // 4. Populate Mapping Dropdowns
    populateColumnSelectors(headers);
}

function renderGrid(rows, headerIdx) {
    const table = document.getElementById("linelist-preview-table");
    if (!table) return;

    table.innerHTML = "";
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    // Header
    const headerRow = document.createElement("tr");
    const headers = rows[headerIdx] || [];
    headers.forEach(h => {
        const th = document.createElement("th");
        th.textContent = h || "(empty)";
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // Body (First 50 rows)
    const start = headerIdx + 1;
    const end = Math.min(rows.length, start + MAX_PREVIEW_ROWS);

    for (let i = start; i < end; i++) {
        const tr = document.createElement("tr");
        const rowData = rows[i] || [];
        // Ensure we render empty cells to maintain alignment
        for (let j = 0; j < headers.length; j++) {
            const td = document.createElement("td");
            td.textContent = rowData[j] !== undefined ? rowData[j] : "";
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
}

function populateColumnSelectors(headers) {
    const selects = [
        document.getElementById("sel-linelist-service"),
        document.getElementById("sel-linelist-sequence")
    ];

    selects.forEach(sel => {
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">(Select Column)</option>';
        headers.forEach((h, idx) => {
            if (!h) return;
            const opt = document.createElement("option");
            opt.value = idx; // Store index as value
            opt.textContent = h;
            sel.appendChild(opt);
        });
        // Restore value if still valid
        if (currentVal && headers[currentVal]) sel.value = currentVal;
    });
}

function addMappingRow() {
    const tbody = document.querySelector("#linelist-mapping-table tbody");
    if (!tbody) return;

    const tr = document.createElement("tr");

    // Source Column (Linelist)
    const tdSource = document.createElement("td");
    const selSource = document.createElement("select");
    selSource.className = "config-select";
    selSource.innerHTML = '<option value="">(Select Column)</option>';

    // Populate from state
    const state = getState("linelist");
    if (state && state.headers) {
        state.headers.forEach((h, idx) => {
            const opt = document.createElement("option");
            opt.value = h; // Use name for mapping
            opt.textContent = h;
            selSource.appendChild(opt);
        });
    }
    tdSource.appendChild(selSource);

    // Target Attribute (PCF)
    const tdTarget = document.createElement("td");
    const inpTarget = document.createElement("input");
    inpTarget.type = "text";
    inpTarget.className = "config-input";
    inpTarget.placeholder = "e.g. ATTRIBUTE1";
    tdTarget.appendChild(inpTarget);

    // Action (Remove)
    const tdAction = document.createElement("td");
    const btnRemove = document.createElement("button");
    btnRemove.className = "btn btn-secondary btn-sm";
    btnRemove.textContent = "✕";
    btnRemove.onclick = () => tr.remove();
    tdAction.appendChild(btnRemove);

    tr.appendChild(tdSource);
    tr.appendChild(tdTarget);
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
}

function saveMapping() {
    const serviceIdx = document.getElementById("sel-linelist-service")?.value;
    const sequenceIdx = document.getElementById("sel-linelist-sequence")?.value;

    const state = getState("linelist");
    const headers = state.headers || [];

    const keys = {
        serviceCol: headers[serviceIdx],
        sequenceCol: headers[sequenceIdx]
    };

    const mapping = {};
    const rows = document.querySelectorAll("#linelist-mapping-table tbody tr");
    rows.forEach(tr => {
        const source = tr.querySelector("td:nth-child(1) select")?.value;
        const target = tr.querySelector("td:nth-child(2) input")?.value;
        if (source && target) {
            mapping[source] = target;
        }
    });

    linelistService.updateKeys(keys);
    linelistService.updateMapping(mapping);

    alert("Mapping Saved!");
}
