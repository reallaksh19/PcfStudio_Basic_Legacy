/**
 * js/ui/weight-tab.js
 * Handles Weight Config tab UI events and rendering.
 */
import { weightService } from "../services/weight-service.js";
import { getState, subscribe } from "../state.js";
import { updateStatusBar } from "../app.js";

const MAX_PREVIEW_ROWS = 50;

export function initWeightTab() {
    console.log("Initializing Weight Tab...");

    // Toggle Handler
    const toggle = document.getElementById("cfg-smartValve");
    if (toggle) {
        toggle.addEventListener("click", () => {
            const s = getState("weight");
            const enabled = !s.config.smartValveDetection;
            weightService.toggleSmartValve(enabled);
        });
    }

    // Subscribe to state changes
    subscribe("weight", render);

    // Load reference data automatically on init (if not already loaded)
    // We can try to load from Docs folder if we were in a node environment, 
    // but in browser we might need user drop or pre-loaded JSON.
    // Wait, the plan says "Reference Data View: Read-only display of the loaded wtValveweights.xlsx".
    // Since we can't access filesystem from browser without user interaction, 
    // maybe we should provide a "Load Reference Data" button or just let them drag/drop it too?
    // Or fetch it if it's served statically?
    // "Docs" folder is in the project root. If http-server is running, we can fetch it!
    loadDefaultReferenceData();
}

async function loadDefaultReferenceData() {
    try {
        // As per spec: load localdata if not available look at public
        let data = [];
        const stored = localStorage.getItem("pcf_weight_data");
        if (stored) {
            data = JSON.parse(stored);
        } else {
            const response = await fetch("Docs/Masters/wtValveweights.json");
            if (response.ok) {
                data = await response.json();
                localStorage.setItem("pcf_weight_data", JSON.stringify(data));
            } else {
                console.warn("Could not auto-load weight reference data (404).");
            }
        }

        if (data && data.length > 0) {
            const { getState, setState } = await import("../state.js");
            const state = getState("weight") || { refData: [], config: { smartValveDetection: true } };
            state.refData = data;
            setState("weight", state);

            const statusEl = document.getElementById("weight-ref-status");
            if (statusEl) statusEl.innerText = `Loaded ${data.length} rows`;
        } else {
            const statusEl = document.getElementById("weight-ref-status");
            if (statusEl) statusEl.innerText = "Blank (Upload manually or check Docs/Masters/)";
        }
    } catch (e) {
        console.warn("Auto-load weight reference data failed", e);
    }
}

function render(state) {
    if (!state) return;
    const { refData, config } = state;

    if (!config) {
        console.warn("Weight tab render called with invalid state (missing config).");
        return;
    }

    // 1. Render Toggle
    const toggle = document.getElementById("cfg-smartValve");
    const label = document.getElementById("cfg-smartValve-lbl");
    if (toggle && label) {
        if (config.smartValveDetection) {
            toggle.classList.add("on");
            label.textContent = "Enabled";
        } else {
            toggle.classList.remove("on");
            label.textContent = "Disabled";
        }
    }

    // 2. Render Reference Data Grid
    const hasData = refData && refData.length > 0;
    document.getElementById("weight-ref-empty").style.display = hasData ? "none" : "block";
    document.getElementById("weight-ref-grid").style.display = hasData ? "block" : "none";
    document.getElementById("weight-ref-status").textContent = hasData ? `${refData.length} rows loaded` : "Not Loaded";

    if (hasData) {
        renderGrid(refData);
    }
}

function renderGrid(rows) {
    const table = document.getElementById("weight-ref-table");
    if (!table) return;

    // Debounce or check if already rendered? 
    // For now just re-render first 50 rows
    table.innerHTML = "";
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    // Assume row 0 is header from our inspection? 
    // Actually inspection showed row 0 is data-like.
    // "Docs/wtValveweights.xlsx"
    // Row 0: ["Type","Size(Inch)","Size(DN)","Weight(kg)","?","?","Length(mm)","?","Rating","?","Description","?"]
    // That looks like a header!
    // Inspector showed:
    // Row 0: ["Type","Size(Inch)","Size(DN)","Weight(kg)","?","?","Length(mm)","?","Rating","?","Description","?"]
    // So row 0 IS header.

    const headerRow = document.createElement("tr");
    const headers = rows[0] || [];
    headers.forEach(h => {
        const th = document.createElement("th");
        th.textContent = h || "";
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const end = Math.min(rows.length, MAX_PREVIEW_ROWS);
    for (let i = 1; i < end; i++) {
        const tr = document.createElement("tr");
        const rowData = rows[i] || [];
        headers.forEach((_, idx) => {
            const td = document.createElement("td");
            td.textContent = rowData[idx] !== undefined ? rowData[idx] : "";
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
}
