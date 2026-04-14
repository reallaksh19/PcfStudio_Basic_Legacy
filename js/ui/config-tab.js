/**
 * config-tab.js — CONFIG Tab UI
 * Phase 1: Output settings, pipeline reference, and alias overview.
 * Full config editor built in Phase 6.
 */

import { getConfig, saveConfig, resetConfig, exportConfig, importConfig } from "../config/config-store.js";
import { setState } from "../state.js";
import { gate } from "../services/gate-logger.js";

const LOG_PREFIX = "[ConfigTab]";

export function initConfigTab() {
  renderHelpSection(); // New
  renderOutputSettings();
  renderTypeMapTable();
  renderAliasEditor();
  renderCAEditor();
  renderAnomalyRules();
  renderTopologySettings();
  renderPipelineMode();
  renderOverlapResolution();
  renderCommon3DLogic();
  renderRayShooterSettings();
  renderFinalPassGapFillingSettings();
  renderSmartValidatorSettings();
  renderPCFSanitizerSettings();
  renderSupportSettings();
  wireImportExport();
  wireResetBtn();
  wireAccordions();
  wireToggles();
  console.info(`${LOG_PREFIX} Config tab initialised.`);
}

function renderSupportSettings() {
  const container = document.getElementById("cfg-support-settings-container");

  const config = getConfig();
  const supportSettings = config.coordinateSettings?.supportSettings;
  if (!supportSettings) return;

  const html = `
    <div class="config-section">
      <div class="config-section-header">
        <span class="config-section-title">Support Mapping Logic</span>
        <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
      </div>
      <div class="config-section-body">
        <p class="text-muted text-sm mb-2">Controls how Support Names and GUIDs are derived from Friction and Gap properties.</p>

        <div class="config-row" style="margin-top:0.5rem">
            <label class="config-label" style="width:200px;">GUID Source Column</label>
            <input class="config-input" id="cfg-support-guid-source" value="${supportSettings.guidSourceColumn || 'NodeName'}" style="width: 200px;">
        </div>

        <div style="margin-top: 1rem; padding: 0.5rem; background: var(--bg-1); border-radius: 4px; font-family: var(--font-code); font-size: 0.85rem;">
            <div style="color: var(--amber); margin-bottom: 0.5rem; font-weight: bold;">Support Syntax</div>
            <div>    CO-ORDS    ....</div>
            <div>    &lt;SUPPORT_NAME&gt;    ...</div>
            <div>    &lt;SUPPORT_TAG&gt; ("GUID:" & "NodeName")</div>
        </div>

        <div style="margin-top: 1rem; padding: 0.5rem; background: var(--bg-1); border-radius: 4px;">
            <p style="font-size: 0.85rem; font-weight: bold; margin-bottom: 0.5rem;">Block 1: Friction Empty/0.3 & Gap Empty</p>
            <textarea class="config-input" id="cfg-support-block1" style="width: 100%; height: 80px; font-family: var(--font-code); font-size: 0.8rem;" readonly>${JSON.stringify(supportSettings.nameRules?.block1?.mappings, null, 2)}</textarea>
        </div>

        <div style="margin-top: 1rem; padding: 0.5rem; background: var(--bg-1); border-radius: 4px;">
            <p style="font-size: 0.85rem; font-weight: bold; margin-bottom: 0.5rem;">Block 2: Friction 0.15</p>
            <textarea class="config-input" id="cfg-support-block2" style="width: 100%; height: 100px; font-family: var(--font-code); font-size: 0.8rem;" readonly>${JSON.stringify(supportSettings.nameRules?.block2?.mappings, null, 2)}</textarea>
        </div>

        <div class="config-row" style="margin-top:1rem">
            <label class="config-label" style="width:200px;">Fallback Name</label>
            <input class="config-input" id="cfg-support-fallback" value="${supportSettings.nameRules?.fallback || 'CA150'}" style="width: 200px;">
        </div>

      </div>
    </div>
  `;

  // If there's no specific container, append to the first bucket
  if (!container) {
    const bucketA = document.querySelector("#panel-config .config-bucket");
    if (bucketA) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      bucketA.appendChild(wrapper.firstElementChild);
    }
  } else {
    container.innerHTML = html;
  }

  // Wire events
  document.getElementById("cfg-support-guid-source")?.addEventListener("change", (e) => {
    const cfg = getConfig();
    if (!cfg.coordinateSettings.supportSettings) cfg.coordinateSettings.supportSettings = {};
    cfg.coordinateSettings.supportSettings.guidSourceColumn = e.target.value;
    saveConfig(cfg); setState("config", cfg);
  });

  document.getElementById("cfg-support-fallback")?.addEventListener("change", (e) => {
    const cfg = getConfig();
    if (!cfg.coordinateSettings.supportSettings) cfg.coordinateSettings.supportSettings = {};
    if (!cfg.coordinateSettings.supportSettings.nameRules) cfg.coordinateSettings.supportSettings.nameRules = {};
    cfg.coordinateSettings.supportSettings.nameRules.fallback = e.target.value;
    saveConfig(cfg); setState("config", cfg);
  });
}

/** Render the Help & Documentation Section */
function renderHelpSection() {
  const container = document.getElementById("cfg-help-container");
  if (!container) return; // Add placeholder in index.html if needed, or inject here.
  // We'll assume the container exists or we prepend to panel-config

  const docs = [
    { title: "Golden Rules", file: "GOLDEN_RULES.md", icon: "⭐" },
    { title: "Mode Explainer", file: "MODE_EXPLAINER.md", icon: "🧠" },
    { title: "Tolerance Explainer", file: "TOLERANCE_EXPLAINER.md", icon: "📐" },
    { title: "Mapping Explainer", file: "MAPPING_EXPLAINER.md", icon: "🗺️" },
    { title: "Smart Modules", file: "SMART_MODULES.md", icon: "🤖" },
    { title: "3D Viewer Guide", file: "3D_VIEWER_EXPLAINER.md", icon: "🧊" },
    { title: "Keywords for Explainer", file: "KEYWORD_FOR_EXPLAINER.md", icon: "🗣️" },
    { title: "Test & Benchmark", file: "TESTRUN_AND_BENCHMARK.md", icon: "🧪" },
    { title: "Debug Console Best Practices", file: "DEBUG_CONSOLE_BEST_PRACTICES.md", icon: "🐞" },
    { title: "Expert Agent Personas", file: "EXPERT_AGENT.md", icon: "👨‍💻" },
    { title: "PCF Format Reference", file: "PCF format.md", icon: "📄" },
  ];

  const html = `
    <div class="config-section">
      <div class="config-section-header">
        <span class="config-section-title">Help & Documentation</span>
        <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
      </div>
      <div class="config-section-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem;">
          ${docs.map(doc => `
            <button class="btn btn-secondary help-doc-btn" data-file="${doc.file}" style="justify-content:flex-start;text-align:left;">
              <span style="margin-right:0.5rem">${doc.icon}</span> ${doc.title}
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `;

  // Inject at top of bucket A if container missing
  const bucketA = document.querySelector("#panel-config .config-bucket");
  if (bucketA) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    bucketA.prepend(wrapper.firstElementChild);
  }

  // Wire click handlers
  document.querySelectorAll(".help-doc-btn").forEach(btn => {
    btn.addEventListener("click", () => showDocModal(btn.dataset.file));
  });
}

async function showDocModal(filename) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.display = "flex";

  const dialog = document.createElement("div");
  dialog.className = "modal-dialog";
  dialog.style.maxWidth = "800px";
  dialog.style.width = "90vw";
  dialog.style.height = "80vh";
  dialog.style.display = "flex";
  dialog.style.flexDirection = "column";

  const header = document.createElement("div");
  header.className = "modal-header";
  header.innerHTML = `<h3 style="margin:0">${filename}</h3><button class="modal-close">×</button>`;

  const body = document.createElement("div");
  body.className = "modal-body";
  body.style.flex = "1";
  body.style.overflow = "auto";
  body.style.padding = "1.5rem";
  body.style.background = "var(--bg-0)";
  body.style.whiteSpace = "pre-wrap";
  body.style.fontFamily = "var(--font-code)";
  body.style.fontSize = "0.85rem";
  body.textContent = "Loading...";

  dialog.appendChild(header);
  dialog.appendChild(body);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Close handlers
  const close = () => { document.body.removeChild(overlay); };
  header.querySelector(".modal-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  // Fetch content
  try {
    // Vite copies 'public' folder contents to root of dist.
    // So we fetch directly from root.
    const res = await fetch(filename);
    if (!res.ok) throw new Error(`Failed to load ${filename}`);
    const text = await res.text();
    // Simple markdown rendering (headers and bold)
    body.innerHTML = text
      .replace(/^# (.*$)/gim, '<h1 style="color:var(--amber);margin-top:0">$1</h1>')
      .replace(/^## (.*$)/gim, '<h2 style="color:var(--text-primary);border-bottom:1px solid var(--steel);padding-bottom:0.3rem;margin-top:1.5rem">$1</h2>')
      .replace(/^### (.*$)/gim, '<h3 style="color:var(--text-secondary);margin-top:1rem">$1</h3>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/^\* (.*$)/gim, '• $1')
      .replace(/\n/g, '<br>');
  } catch (err) {
    body.textContent = `Error loading document: ${err.message}. \n\nEnsure files are in the /Public directory.`;
  }
}

function wireToggles() {
  // Message Square toggle
  const msBtn = document.getElementById("cfg-msgSquare");
  const msLbl = document.getElementById("cfg-msgSquare-lbl");
  if (msBtn) {
    const cfg = getConfig();
    const on = cfg.outputSettings.includeMessageSquare;
    msBtn.classList.toggle("on", on);
    if (msLbl) msLbl.textContent = on ? "Enabled" : "Disabled";
    msBtn.addEventListener("click", () => {
      const cfg = getConfig();
      const next = !msBtn.classList.contains("on");
      cfg.outputSettings.includeMessageSquare = next;
      msBtn.classList.toggle("on", next);
      if (msLbl) msLbl.textContent = next ? "Enabled" : "Disabled";
      saveConfig(cfg); setState("config", cfg);
    });
  }
  // Tolerance + Decimals + Max Segment Length + Flange PCF Thickness
  ["cfg-tolerance", "cfg-decimals", "cfg-maxSegmentLength", "cfg-flangePcfThickness"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    let path;
    if (id === "cfg-tolerance") path = "continuityTolerance";
    else if (id === "cfg-decimals") path = "decimalPlaces";
    else if (id === "cfg-maxSegmentLength") path = "maxSegmentLength";
    else if (id === "cfg-flangePcfThickness") path = "flangePcfThickness";

    const cfg = getConfig();
    // Ensure defaults
    if (path === "maxSegmentLength" && cfg.coordinateSettings[path] === undefined) {
      cfg.coordinateSettings[path] = 0;
    }
    if (path === "flangePcfThickness" && cfg.coordinateSettings[path] === undefined) {
      cfg.coordinateSettings[path] = 6;
    }

    el.value = cfg.coordinateSettings[path] ?? (path === "flangePcfThickness" ? 6 : undefined);
    el.addEventListener("change", () => {
      const cfg = getConfig();
      cfg.coordinateSettings[path] = parseFloat(el.value);
      saveConfig(cfg); setState("config", cfg);
      console.info(`[ConfigTab] coordinateSettings.${path} = ${el.value}`);
    });
  });

  // ── Overlap Resolution settings ──────────────────────────────────────────────
  // Now dynamically rendered via renderOverlapResolution()

  // Model Gap Limit (New)
  const mdlGapEl = document.getElementById("cfg-modelGapLimit");
  if (mdlGapEl) {
    const cfg = getConfig();
    mdlGapEl.value = cfg.coordinateSettings?.modelGapLimit ?? 15000.0;
    mdlGapEl.addEventListener("change", () => {
      const c = getConfig();
      c.coordinateSettings.modelGapLimit = parseFloat(mdlGapEl.value);
      saveConfig(c); setState("config", c);
      console.info(`[ConfigTab] coordinateSettings.modelGapLimit = ${mdlGapEl.value}`);
    });
  }

  // Sort Skipped/Zero Length Toggle
  const sortBtn = document.getElementById("cfg-sortSkippedZero");
  const sortLbl = document.getElementById("cfg-sortSkippedZero-lbl");
  if (sortBtn) {
    const cfg = getConfig();
    const on = cfg.coordinateSettings?.sortSkippedZero !== false; // Default true
    sortBtn.classList.toggle("on", on);
    if (sortLbl) sortLbl.textContent = on ? "Sorted to Bottom" : "Original Sequence";
    sortBtn.addEventListener("click", () => {
      const c = getConfig();
      const next = !sortBtn.classList.contains("on");
      c.coordinateSettings.sortSkippedZero = next;
      sortBtn.classList.toggle("on", next);
      if (sortLbl) sortLbl.textContent = next ? "Sorted to Bottom" : "Original Sequence";
      saveConfig(c); setState("config", c);
      console.info(`[ConfigTab] sortSkippedZero = ${next}`);
    });
  }

  // Chain-Based PCF Build Order toggle
  const chainBtn = document.getElementById("cfg-chainBasedOrder");
  const chainLbl = document.getElementById("cfg-chainBasedOrder-lbl");
  if (chainBtn) {
    const cfg = getConfig();
    const on = cfg.coordinateSettings?.chainBasedOrder !== false; // Default true
    chainBtn.classList.toggle("on", on);
    if (chainLbl) chainLbl.textContent = on ? "Chain-Based (ON)" : "Graph DFS (ON)";
    chainBtn.addEventListener("click", () => {
      const c = getConfig();
      const next = !chainBtn.classList.contains("on");
      c.coordinateSettings.chainBasedOrder = next;
      chainBtn.classList.toggle("on", next);
      if (chainLbl) chainLbl.textContent = next ? "Chain-Based (ON)" : "Graph DFS (ON)";
      saveConfig(c); setState("config", c);
      console.info(`[ConfigTab] chainBasedOrder = ${next}`);
    });
  }

  // Core Logic show/hide toggle (no config save — purely UI)
  const clBtn = document.getElementById("cfg-overlapRes-coreLogic");
  const clPanel = document.getElementById("cfg-overlapRes-coreLogic-panel");
  if (clBtn && clPanel) {
    clBtn.addEventListener("click", () => {
      const open = clPanel.style.display !== "none";
      clPanel.style.display = open ? "none" : "block";
      clBtn.textContent = open ? "Show" : "Hide";
      clBtn.setAttribute("aria-expanded", String(!open));
    });
  }

  // ── Input & Parse Settings ──────────────────────────────────────────────────

  // Streaming Parse toggle
  wireToggle("cfg-streamingParse", "cfg-streamingParse-lbl",
    () => getConfig().inputSettings?.streamingParse === true,
    (next) => { const c = getConfig(); c.inputSettings.streamingParse = next; saveConfig(c); setState("config", c); }
  );

  // Auto Load Piping Class Masters toggle
  wireToggle("cfg-autoLoadPipingClassMasters", "cfg-autoLoadPipingClassMasters-lbl",
    () => getConfig().smartData?.autoLoadPipingClassMasters === true,
    (next) => { const c = getConfig(); c.smartData.autoLoadPipingClassMasters = next; saveConfig(c); setState("config", c); }
  );

  // Auto Load Weights and Mat Map toggle
  wireToggle("cfg-autoLoadWeightsAndMatMap", "cfg-autoLoadWeightsAndMatMap-lbl",
    () => getConfig().smartData?.autoLoadWeightsAndMatMap === true,
    (next) => { const c = getConfig(); c.smartData.autoLoadWeightsAndMatMap = next; saveConfig(c); setState("config", c); }
  );

  // Chunk Size
  const chunkEl = document.getElementById("cfg-streamingChunkSize");
  if (chunkEl) {
    chunkEl.value = getConfig().inputSettings?.streamingChunkSize ?? 500;
    chunkEl.addEventListener("change", () => {
      const c = getConfig();
      c.inputSettings.streamingChunkSize = parseInt(chunkEl.value, 10) || 500;
      saveConfig(c); setState("config", c);
    });
  }

  // Sanitization toggles
  const sanToggles = [
    { id: "cfg-san-trim", lbl: "cfg-san-trim-lbl", key: "trimWhitespace" },
    { id: "cfg-san-bom", lbl: "cfg-san-bom-lbl", key: "stripBOM" },
    { id: "cfg-san-unicode", lbl: "cfg-san-unicode-lbl", key: "normalizeUnicode" },
    { id: "cfg-san-collapse", lbl: "cfg-san-collapse-lbl", key: "collapseSpaces" },
    { id: "cfg-san-lowercase", lbl: "cfg-san-lowercase-lbl", key: "lowercaseHeaders" },
  ];

  for (const { id, lbl, key } of sanToggles) {
    wireToggle(id, lbl,
      () => getConfig().inputSettings?.sanitize?.[key] === true,
      (next) => {
        const c = getConfig();
        if (!c.inputSettings.sanitize) c.inputSettings.sanitize = {};
        c.inputSettings.sanitize[key] = next;
        saveConfig(c); setState("config", c);
      }
    );
  }
}

/** Helper: Wire a generic toggle button. */
function wireToggle(btnId, lblId, getState, onToggle) {
  const btn = document.getElementById(btnId);
  const lbl = document.getElementById(lblId);
  if (!btn) return;

  const on = getState();
  btn.classList.toggle("on", on);
  if (lbl) lbl.textContent = on ? "Enabled" : "Disabled";

  btn.addEventListener("click", () => {
    const next = !btn.classList.contains("on");
    btn.classList.toggle("on", next);
    if (lbl) lbl.textContent = next ? "Enabled" : "Disabled";
    onToggle(next);
    gate('ConfigTab', btnId, 'Setting Toggled', { value: next });
  });
}

function renderOutputSettings() {
  const config = getConfig();
  const os = config.outputSettings;
  const bind = (id, val) => {
    const el = document.getElementById(id);
    if (!el) { console.warn(`${LOG_PREFIX} Element not found: ${id}`); return; }
    el.value = val ?? "";
    el.addEventListener("change", () => {
      const field = id.replace("cfg-", "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      // map to outputSettings path
      const pathMap = {
        "pipelineRef": "outputSettings.pipelineReference",
        "pcfCanonicalName": "outputSettings.pcfCanonicalName",
        "projectId": "outputSettings.projectIdentifier",
        "area": "outputSettings.area",
        "lineEnding": "outputSettings.lineEnding",
      };
      const path = pathMap[field];
      if (path) {
        const parts = path.split(".");
        const cfg = getConfig();
        cfg[parts[0]][parts[1]] = el.value;
        saveConfig(cfg);
        setState("config", cfg);
        console.info(`${LOG_PREFIX} Config updated: ${path} = "${el.value}"`);
      }
    });
  };

  bind("cfg-pipelineRef", os.pipelineReference);
  bind("cfg-pcfCanonicalName", os.pcfCanonicalName ?? "");
  bind("cfg-projectId", os.projectIdentifier);
  bind("cfg-area", os.area);
  bind("cfg-lineEnding", os.lineEnding);
}

function wireImportExport() {
  document.getElementById("btn-export-config")?.addEventListener("click", () => {
    const json = exportConfig();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "pcf-converter-config.json";
    a.click(); URL.revokeObjectURL(url);
    console.info(`${LOG_PREFIX} Config exported.`);
  });

  document.getElementById("btn-import-config")?.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      const text = await file.text();
      const result = importConfig(text);
      if (result.ok) {
        setState("config", getConfig());
        renderOutputSettings();
        alert("Config imported successfully. Page will reload to apply all settings.");
        location.reload();
      } else {
        alert(`Import failed: ${result.error}`);
        console.error(`${LOG_PREFIX} Import failed: ${result.error}`);
      }
    };
    input.click();
  });
}

function wireResetBtn() {
  document.getElementById("btn-reset-config")?.addEventListener("click", () => {
    if (!confirm("Reset all settings to defaults? This cannot be undone.")) return;
    resetConfig();
    setState("config", getConfig());
    renderOutputSettings();
    console.info(`${LOG_PREFIX} Config reset to defaults.`);
    alert("Settings reset to defaults.");
  });
}

function wireAccordions() {
  document.querySelectorAll(".config-section-header").forEach(header => {
    header.addEventListener("click", () => {
      const section = header.closest(".config-section");
      section?.classList.toggle("open");
    });
  });

  // Wire accordion-header / accordion-body pattern (used by Ray Shooter section)
  document.querySelectorAll(".accordion-header").forEach(header => {
    header.addEventListener("click", () => {
      const body = header.nextElementSibling;
      if (!body || !body.classList.contains("accordion-body")) return;
      const isOpen = body.style.display !== "none";
      body.style.display = isOpen ? "none" : "block";
      const icon = header.querySelector(".accordion-icon");
      if (icon) icon.textContent = isOpen ? "▶" : "▼";
    });
  });
}

function renderPipelineMode() {
  const container = document.getElementById("cfg-pipeline-mode-container");
  if (!container) return;

  const config = getConfig();
  // Get existing state or default to Fuzzy(Single) aka repair without multi
  const currentMode = config.coordinateSettings?.pipelineMode || 'repair';
  const isMulti = config.coordinateSettings?.multiPass === true;

  let uiValue = 'fuzzy-single';
  if (currentMode === 'sequential' || currentMode === 'strict') uiValue = 'sequential';
  else if (currentMode === 'repair' && isMulti) uiValue = 'fuzzy-multi';
  else if (currentMode === 'repair' && !isMulti) uiValue = 'fuzzy-single';

  container.innerHTML = `
    <div class="config-section open">
      <div class="config-section-header">
        <span class="config-section-title">Connectivity Routing Mode</span>
        <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
      </div>
      <div class="config-section-body">
        <p class="text-muted text-sm mb-2">Controls how endpoints prioritize connections when resolving pipeline sequence.</p>
        <div class="config-row">
            <label class="config-label">Sequencer Logic Mode</label>
            <select class="config-select" id="cfg-pipeline-dropdown-mode">
                <option value="sequential" ${uiValue === 'sequential' ? 'selected' : ''}>Sequential (Strict CSV Order)</option>
                <option value="fuzzy-single" ${uiValue === 'fuzzy-single' ? 'selected' : ''}>Fuzzy (Single Pass - Math Only)</option>
                <option value="fuzzy-multi" ${uiValue === 'fuzzy-multi' ? 'selected' : ''}>Fuzzy (Multi Pass - Math Only)</option>
            </select>
        </div>

        <div class="text-muted text-xs mt-2 mb-3 p-2 bg-1" style="border-radius:4px; line-height: 1.4;">
            <strong>Global Engine Behavior:</strong><br>
            • <b>Sequential + Chain ON:</b> No global/orphan spatial graph. Orphans (<1mm) are not processed a second time.<br>
            • <b>Sequential + Chain OFF:</b> Global no spatial graph. Orphans are processed via spatial graph.<br>
            • <b>Fuzzy (Single) + Chain ON:</b> Multi-axis uses bore ratio/3D rules. Global no spatial graph, Orphans are not processed.<br>
            • <b>Fuzzy (Single) + Chain OFF:</b> Multi-axis uses bore ratio/3D rules. Global no spatial graph, Orphans processed via spatial graph.<br>
            • <b>Fuzzy (Multi):</b> Global spatial graph enforced. Chain ON/OFF has no effect.
        </div>

        <div class="config-row" style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
            <label class="config-label">Table View: Sort Skipped/Zero Length</label>
            <div style="display:flex;align-items:center;gap:0.5rem">
                <button id="cfg-sortSkippedZero" class="toggle"></button>
                <span id="cfg-sortSkippedZero-lbl" style="font-size:0.8rem;color:var(--text-secondary)"></span>
            </div>
        </div>
        <div class="config-row" style="margin-top:0.75rem">
            <label class="config-label" data-tip="When ON, the PCF output order follows Prev/Next chain links from the Data Table. When OFF, coordinate-graph DFS is used.">Chain Mode for Orphan Sweep (Prev/Next)</label>
            <div style="display:flex;align-items:center;gap:0.5rem">
                <button id="cfg-chainBasedOrder" class="toggle"></button>
                <span id="cfg-chainBasedOrder-lbl" style="font-size:0.8rem;color:var(--text-secondary)"></span>
            </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("cfg-pipeline-dropdown-mode").addEventListener("change", (e) => {
    const val = e.target.value;
    const c = getConfig();
    if (!c.coordinateSettings) c.coordinateSettings = {};

    // Legacy support: We use 'repair' as the engine mode for Fuzzy, and rely on multipass flag
    if (val === 'sequential') {
      c.coordinateSettings.pipelineMode = 'sequential';
      c.coordinateSettings.multiPass = false;
      c.coordinateSettings.sequencerMode = 'STRICT';
    } else if (val === 'fuzzy-single') {
      c.coordinateSettings.pipelineMode = 'repair';
      c.coordinateSettings.multiPass = false;
      c.coordinateSettings.sequencerMode = 'FUZZY';
    } else if (val === 'fuzzy-multi') {
      c.coordinateSettings.pipelineMode = 'repair';
      c.coordinateSettings.multiPass = true;
      c.coordinateSettings.sequencerMode = 'FUZZY';
    }

    saveConfig(c);
    setState("config", c);
    console.info(`[ConfigTab] Routing Mode updated to: ${val}`);
  });
}

function renderTopologySettings() {
  const container = document.getElementById("cfg-topology-settings-container");
  if (!container) return;

  const html = `
    <div class="config-section">
      <div class="config-section-header">
        <span class="config-section-title">Topology settings</span>
        <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
      </div>
      <div class="config-section-body">
        <p class="text-muted text-sm mb-3">Controls the logic, parameters, and matching capabilities of the 3D topology generation passes.</p>

        <div class="config-row align-items-center">
            <div>
              <label class="config-label mb-0">Bore Ratio</label>
              <div class="text-muted text-xs">min, max</div>
            </div>
            <div style="display:flex;gap:0.5rem">
              <input type="number" step="0.1" class="config-input" id="cfg-topology-bore-min" value="0.7" style="width:70px">
              <input type="number" step="0.1" class="config-input" id="cfg-topology-bore-max" value="1.5" style="width:70px">
            </div>
        </div>

        <div class="config-row align-items-center mt-2">
            <div>
              <label class="config-label mb-0">Radii Sweep (mm)</label>
              <div class="text-muted text-xs">min (x Bore), max</div>
            </div>
            <div style="display:flex;gap:0.5rem">
              <input type="number" step="0.1" class="config-input" id="cfg-topology-radii-min" value="0.2" style="width:70px">
              <input type="number" step="0.1" class="config-input" id="cfg-topology-radii-max" value="3000" style="width:70px">
            </div>
        </div>

        <div class="config-row align-items-center mt-2">
            <div>
              <label class="config-label mb-0">Line_Key Toggle</label>
              <div class="text-muted text-xs">Restrict routing and connections strictly within the same Line Key.</div>
            </div>
            <label class="toggle-switch ms-auto">
              <input type="checkbox" id="cfg-topology-linekey" disabled>
              <span class="slider round" style="opacity:0.5"></span>
            </label>
        </div>

        <div style="margin-top: 1rem; border-top: 1px solid var(--border); padding-top: 0.5rem;">
            <div style="display:flex; align-items:center; gap:0.5rem;">
                <button class="toggle" id="cfg-topology-core-toggle"></button>
                <strong>Core Logic</strong>
            </div>
            <div id="cfg-topology-core-panel" style="display:none; margin-top:0.5rem; padding: 0.75rem; background: var(--bg-1); border: 1px solid var(--steel); font-family: var(--font-code); font-size: 0.75rem; color: var(--emerald); overflow-y:auto; max-height:200px;">
Configuration Logic (Pass 2 & Pass 3 Gatekeeper)
When evaluating two endpoints n1 and n2 in Pass 2 (Fuzzy Major Axis) or Pass 3 (Fuzzy Any Axis):

Absolute Coordinate Match Override (0mm Gap)
If distance(n1, n2) <= 0.1mm, instantly APPROVE. Bypass all limits, ratios, and limits. They are physically connected.

Micro/Small Gaps (<= MAX_OVERLAP / 1000mm)
Allowed Bores: If the gap is less than or equal to MAX_OVERLAP (1000mm default from UI config), we allow a discrepancy in bore sizes.
Condition: The bore ratio (minBore / maxBore) MUST be strictly between BORE_RATIO_MIN (0.7) and BORE_RATIO_MAX (1.5).
Example: Snapping a 100mm flange to a 125mm pipe across a 50mm gap is valid (Ratio = 0.8). Snapping a 50mm to a 400mm across a 50mm gap is INVALID (Ratio = 0.125).

Massive Gaps (> MAX_OVERLAP / 1000mm)
Allowed Bores: If the gap is massive, it requires strict continuation of the same pipeline.
Condition: Bores MUST match EXACTLY (n1.bore === n2.bore).
Example: Snapping a 400mm pipe to another 400mm pipe 14000mm away is valid (if axes align). Snapping a 400mm to a 300mm pipe 14000mm away is explicitly REJECTED.

Sweep Radii (For Bends/Elbows Check)
When evaluating if a component is a bend or calculating its internal structural curve, the radius must fall between SWEEP_RADII_MIN_NB (0.2 x Nominal Bore) and SWEEP_RADII_MAX (3000mm absolute).
            </div>
        </div>

      </div>
    </div>
  `;

  container.innerHTML = html;

  const tgl = document.getElementById("cfg-topology-core-toggle");
  const pnl = document.getElementById("cfg-topology-core-panel");
  if (tgl && pnl) {
    tgl.addEventListener("click", () => {
      const isNowOn = !tgl.classList.contains("on");
      tgl.classList.toggle("on", isNowOn);
      pnl.style.display = isNowOn ? "block" : "none";
    });
  }
}

function renderRayShooterSettings() {
  const container = document.getElementById("cfg-ray-shooter-container");
  if (!container) return;
  const config = getConfig();
  const rs = config.coordinateSettings?.rayShooter ?? {};

  container.innerHTML = `
    <div class="config-section accordion-section">
      <div class="accordion-header" style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
        <span class="accordion-icon">▶</span>
        <h3 class="section-title" style="margin:0">Stage 1C — Ray Shooter</h3>
        <span class="text-muted text-xs" style="margin-left:auto">Resolves orphaned elements via topology-based ray casting</span>
      </div>
      <div class="accordion-body" style="display:none; padding-top:0.5rem">
        <div style="margin-bottom:1rem;display:flex;align-items:center;gap:1rem;padding-bottom:1rem;border-bottom:1px solid var(--steel);">
          <button id="rs-enabled-toggle" class="toggle ${rs.enabled !== false ? 'on' : ''}"></button>
          <label id="rs-enabled-lbl" style="font-size:0.9rem;font-weight:500">
            ${rs.enabled !== false ? 'Master Switch: Enabled' : 'Master Switch: Disabled'}
          </label>
          <span class="text-muted text-xs" style="margin-left:auto">Orphaned rows after Stage 1B resolved via 4-pass parametric ray casting.</span>
        </div>
        <div id="rs-body" style="opacity:${rs.enabled !== false ? 1 : 0.5};pointer-events:${rs.enabled !== false ? 'all' : 'none'}">
          <div class="config-row" style="display:flex;align-items:center;gap:1rem;margin-bottom:0.75rem">
            <label style="font-size:0.8rem;min-width:160px">Max Ray Length (mm):</label>
            <input type="number" id="rs-maxRayLength" value="${rs.maxRayLength ?? 20000}" min="1000" max="100000" step="1000" class="config-input" style="width:120px">
            <span class="text-muted text-xs">Maximum parametric ray length. Default 20 000 mm (20 m).</span>
          </div>
          <div class="config-row" style="display:flex;align-items:center;gap:1rem;margin-bottom:0.75rem">
            <label style="font-size:0.8rem;min-width:160px">ANCI Convert Mode:</label>
            <select id="rs-anciConvertMode" class="config-input" style="width:120px">
              <option value="ON" ${rs.anciConvertMode !== 'OFF' ? 'selected' : ''}>ON</option>
              <option value="OFF" ${rs.anciConvertMode === 'OFF' ? 'selected' : ''}>OFF</option>
            </select>
            <span class="text-muted text-xs">ON: Collapse ANCI to 6mm PIPE. OFF: Keep ANCI full length.</span>
          </div>
          <div class="config-row" style="display:flex;align-items:center;gap:0.5rem">
            <input type="checkbox" id="rs-passP3" ${rs.passP3Stage1A ? 'checked' : ''} style="margin:0">
            <label for="rs-passP3" style="font-size:0.85rem;cursor:pointer">P3: Include gate-collapsed (Stage 1A) rows as candidates</label>
            <span class="text-muted text-xs" style="margin-left:0.5rem">— useful if valid geometry was incorrectly collapsed.</span>
          </div>
        </div>
      </div>
    </div>
  `;

  const saveRs = () => {
    const cfg = getConfig();
    if (!cfg.coordinateSettings) cfg.coordinateSettings = {};
    if (!cfg.coordinateSettings.rayShooter) cfg.coordinateSettings.rayShooter = {};
    cfg.coordinateSettings.rayShooter.enabled      = document.getElementById("rs-enabled-toggle").classList.contains("on");
    cfg.coordinateSettings.rayShooter.maxRayLength = parseInt(document.getElementById("rs-maxRayLength").value) || 20000;
    cfg.coordinateSettings.rayShooter.passP3Stage1A = document.getElementById("rs-passP3").checked;
    cfg.coordinateSettings.rayShooter.anciConvertMode = document.getElementById("rs-anciConvertMode").value;
    saveConfig(cfg);
  };

  // Wire master toggle button
  container.querySelector("#rs-enabled-toggle")?.addEventListener("click", function() {
    this.classList.toggle("on");
    const on = this.classList.contains("on");
    document.getElementById("rs-enabled-lbl").textContent = on ? "Master Switch: Enabled" : "Master Switch: Disabled";
    const body = document.getElementById("rs-body");
    if (body) { body.style.opacity = on ? 1 : 0.5; body.style.pointerEvents = on ? "all" : "none"; }
    saveRs();
  });
  container.querySelectorAll("#rs-maxRayLength, #rs-passP3, #rs-anciConvertMode").forEach(inp => inp.addEventListener("change", saveRs));
}

function renderCommon3DLogic() {
  const config = getConfig();
  const c3d = config.coordinateSettings?.common3DLogic;
  if (!c3d) return;

  const container = document.getElementById("cfg-common-3d-container");
  if (!container) return;

  // Define Fields with Labels, Keys, and Defaults
  const fields = [
    { label: "Max single plane Run (mm)", key: "maxPipeRun", def: 30000, enabledKey: "enableMaxPipeRun", tooltip: "Maximum allowed continuous straight length without a break or support. (Modules: Common3DLogic, PcfTopologyGraph_2)" },
    { label: "Max Overlap (mm)", key: "maxOverlap", def: 1000, enabledKey: "enableMaxOverlap", tooltip: "Maximum allowed distance two components can physically intersect. (Modules: overlap-resolver, PcfTopologyGraph_2)" },
    { label: "Min Pipe Size (mm)", key: "minPipeSize", def: 0, enabledKey: "enableMinPipeSize", tooltip: "Minimum Nominal Bore. Skips advanced merging logic for tubing below this size. (Modules: overlap-resolver)" },
    { label: "Min Component Size (mm)", key: "minComponentSize", def: 3, enabledKey: "enableMinComponentSize", tooltip: "Prevents synthesizing impossible, paper-thin structural components. (Modules: PcfTopologyGraph_2)" },
    { label: "3-Plane Skew Limit (mm)", key: "skew3PlaneLimit", def: 2000, enabledKey: "enableSkew3PlaneLimit", tooltip: "Limits length of synthesized gaps skewed across all three X, Y, and Z axes. (Modules: Common3DLogic, PcfTopologyGraph_2)" },
    { label: "2-Plane Skew Limit (mm)", key: "skew2PlaneLimit", def: 15000, enabledKey: "enableSkew2PlaneLimit", tooltip: "Limits length of synthesized gaps skewed across two axes. (Modules: Common3DLogic, PcfTopologyGraph_2)" },
    { label: "Max Diagonal Gap (mm)", key: "maxDiagonalGap", def: 6000, enabledKey: "enableMaxDiagonalGap", tooltip: "Failsafe limit for bridging gaps strictly involving turning components. (Modules: overlap-resolver)" }
  ];

  // Initialize missing enable flags in config if not present
  let configChanged = false;
  fields.forEach(f => {
    if (c3d[f.enabledKey] === undefined) {
      c3d[f.enabledKey] = true; // Default to enabled
      configChanged = true;
    }
  });
  if (configChanged) {
    saveConfig(config);
    setState("config", config);
  }

  // Render Master Toggle + Fields Grid
  let fieldsHtml = "";
  fields.forEach(f => {
    const isEnabled = c3d[f.enabledKey];
    fieldsHtml += `
        <div style="display:flex; flex-direction:column; gap:0.2rem; margin-bottom: 0.5rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:2px;">
                <label style="font-size:0.85rem; font-weight: 500; color:var(--text-secondary);">${f.label}</label>
                <button class="toggle sm ${isEnabled ? 'on' : ''}" data-key="${f.enabledKey}" style="transform:scale(0.8);"></button>
            </div>
            <input class="config-input" type="number" id="cfg-c3d-${f.key}" data-key="${f.key}" value="${c3d[f.key] ?? f.def}" ${isEnabled ? '' : 'disabled'} style="opacity:${isEnabled ? 1 : 0.5}">
            <div style="font-size: 0.75rem; color: #888; line-height: 1.2; margin-top: 2px; font-style: italic;">
                ${f.tooltip}
            </div>
        </div>
      `;
  });

  const html = `
    <div class="config-section">
      <div class="config-section-header">
        <span class="config-section-title">Common 3D Cleanup Rules</span>
        <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
      </div>
      <div class="config-section-body">
        <div style="margin-bottom:1rem;display:flex;align-items:center;gap:1rem;padding-bottom:1rem;border-bottom:1px solid var(--steel);">
            <button id="cfg-c3d-enabled" class="toggle ${c3d.enabled ? 'on' : ''}"></button>
            <label id="cfg-c3d-enabled-lbl">${c3d.enabled ? 'Master Switch: Enabled' : 'Master Switch: Disabled'}</label>
        </div>
        <div id="cfg-c3d-fields" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;opacity:${c3d.enabled ? 1 : 0.5};pointer-events:${c3d.enabled ? 'all' : 'none'}">
            ${fieldsHtml}
        </div>
      </div>
    </div>
  `;
  container.innerHTML = html;

  // Wire Master Toggle
  const masterBtn = document.getElementById("cfg-c3d-enabled");
  const masterLbl = document.getElementById("cfg-c3d-enabled-lbl");
  const fieldsContainer = document.getElementById("cfg-c3d-fields");

  masterBtn.addEventListener("click", () => {
    const cfg = getConfig();
    const next = !masterBtn.classList.contains("on");
    cfg.coordinateSettings.common3DLogic.enabled = next;

    masterBtn.classList.toggle("on", next);
    masterLbl.textContent = next ? "Master Switch: Enabled" : "Master Switch: Disabled";
    fieldsContainer.style.opacity = next ? "1" : "0.5";
    fieldsContainer.style.pointerEvents = next ? "all" : "none";

    saveConfig(cfg); setState("config", cfg);
    console.info(`${LOG_PREFIX} Common3DLogic master enabled = ${next}`);
  });

  // Wire Individual Toggles & Inputs
  const fieldContainer = document.getElementById("cfg-c3d-fields");

  // Event Delegation for Toggles
  fieldContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("toggle")) {
      const btn = e.target;
      const key = btn.dataset.key;
      if (!key) return;

      const cfg = getConfig();
      const next = !btn.classList.contains("on");
      cfg.coordinateSettings.common3DLogic[key] = next; // Update config

      btn.classList.toggle("on", next);

      // Find associated input and toggle disable state
      // Key mapping logic: enableMaxPipeRun -> maxPipeRun
      const valueKey = key.replace("enable", "");
      // convert "MaxPipeRun" -> "maxPipeRun" (lowercase first letter)
      const lowerValueKey = valueKey.charAt(0).toLowerCase() + valueKey.slice(1);

      const input = fieldContainer.querySelector(`input[data-key="${lowerValueKey}"]`);
      if (input) {
        input.disabled = !next;
        input.style.opacity = next ? "1" : "0.5";
      }

      saveConfig(cfg); setState("config", cfg);
      console.info(`${LOG_PREFIX} Common3DLogic.${key} = ${next}`);
    }
  });

  // Event Delegation for Inputs
  fieldContainer.addEventListener("change", (e) => {
    if (e.target.classList.contains("config-input")) {
      const input = e.target;
      const key = input.dataset.key;
      if (!key) return;

      const cfg = getConfig();
      cfg.coordinateSettings.common3DLogic[key] = parseFloat(input.value);
      saveConfig(cfg); setState("config", cfg);
      console.info(`${LOG_PREFIX} Common3DLogic.${key} = ${input.value}`);
    }
  });
}

/** Render Smart Validator & Fixer Settings */
function renderSmartValidatorSettings() {
  const container = document.getElementById("cfg-smart-validator-container");
  if (!container) return;

  // Get Smart Validator config from main config or use defaults
  const config = getConfig();
  const validatorConfig = config.smartValidator || {
    tolerance: 6.0,
    brokenConnection: {
      enabled: true,
      minGap: 6.0,
      maxGapMultiplier: 2.0,
      severity: 'ERROR',
      autoFixable: true
    },
    modelError: {
      enabled: true,
      minGapMultiplier: 2.0,
      maxGap: 15000,
      severity: 'WARNING',
      autoFixable: false
    },
    overlap: {
      enabled: true,
      minOverlap: 6.0,
      severity: 'ERROR',
      autoFixable: true,
      boreTolerance: 1.0
    },
    fixer: {
      maxSkewLength: 12500,
      snapThreshold: 6.0,
      oletOffsetMultiplier: 2.0,
      boreTolerance: 1.0
    },
    visual: {
      errorColor: '#ff3366',
      warningColor: '#ffaa00',
      infoColor: '#00aaff',
      focusColor: '#00ff00',
      highlightOpacity: 0.5
    }
  };

  const html = `
    <div class="config-section">
      <div class="config-section-header">
        <span class="config-section-title">🤖 Smart Validator & Fixer</span>
        <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      <div class="config-section-body">
        <p class="text-muted text-sm mb-2">Configure validation rules and auto-fix behavior for the Smart Validator.</p>

        <!-- Global Tolerance -->
        <div class="config-row" style="margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid var(--steel)">
          <label class="config-label">Connection Tolerance (mm)</label>
          <input class="config-input" type="number" id="cfg-validator-tolerance" value="${validatorConfig.tolerance}" step="0.1" style="width:120px">
          <span class="text-muted text-sm" style="margin-left:0.5rem">Used for snap-to-connect operations</span>
        </div>

        <!-- Rule 1: Broken Connections -->
        <div style="margin-bottom:1.5rem;padding:1rem;background:var(--bg-1);border-radius:6px">
          <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem">
            <button class="toggle ${validatorConfig.brokenConnection.enabled ? 'on' : ''}" id="cfg-validator-broken-enabled"></button>
            <strong style="font-size:0.95rem">Rule 1: Broken Connections (Gaps)</strong>
          </div>
          <div id="cfg-validator-broken-fields" style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;opacity:${validatorConfig.brokenConnection.enabled ? 1 : 0.5};pointer-events:${validatorConfig.brokenConnection.enabled ? 'all' : 'none'}">
            <div>
              <label class="config-label" style="font-size:0.8rem">Min Gap (mm)</label>
              <input class="config-input" type="number" id="cfg-validator-broken-minGap" value="${validatorConfig.brokenConnection.minGap}" step="0.1" style="width:100%">
              <span class="text-muted" style="font-size:0.7rem">Gaps smaller than tolerance are snapped</span>
            </div>
            <div>
              <label class="config-label" style="font-size:0.8rem">Max Gap Multiplier (×bore)</label>
              <input class="config-input" type="number" id="cfg-validator-broken-maxGapMultiplier" value="${validatorConfig.brokenConnection.maxGapMultiplier}" step="0.1" style="width:100%">
              <span class="text-muted" style="font-size:0.7rem">Maximum gap = multiplier × bore</span>
            </div>
            <div>
              <label class="config-label" style="font-size:0.8rem">Severity</label>
              <select class="config-select" id="cfg-validator-broken-severity" style="width:100%">
                <option value="ERROR" ${validatorConfig.brokenConnection.severity === 'ERROR' ? 'selected' : ''}>ERROR</option>
                <option value="WARNING" ${validatorConfig.brokenConnection.severity === 'WARNING' ? 'selected' : ''}>WARNING</option>
                <option value="INFO" ${validatorConfig.brokenConnection.severity === 'INFO' ? 'selected' : ''}>INFO</option>
              </select>
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem">
              <button class="toggle sm ${validatorConfig.brokenConnection.autoFixable ? 'on' : ''}" id="cfg-validator-broken-autoFixable"></button>
              <label style="font-size:0.8rem">Auto-Fixable</label>
            </div>
          </div>
        </div>

        <!-- Rule 2: Model Errors -->
        <div style="margin-bottom:1.5rem;padding:1rem;background:var(--bg-1);border-radius:6px">
          <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem">
            <button class="toggle ${validatorConfig.modelError.enabled ? 'on' : ''}" id="cfg-validator-model-enabled"></button>
            <strong style="font-size:0.95rem">Rule 2: Model Errors (Open Ends)</strong>
          </div>
          <div id="cfg-validator-model-fields" style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;opacity:${validatorConfig.modelError.enabled ? 1 : 0.5};pointer-events:${validatorConfig.modelError.enabled ? 'all' : 'none'}">
            <div>
              <label class="config-label" style="font-size:0.8rem">Min Gap Multiplier (×bore)</label>
              <input class="config-input" type="number" id="cfg-validator-model-minGapMultiplier" value="${validatorConfig.modelError.minGapMultiplier}" step="0.1" style="width:100%">
              <span class="text-muted" style="font-size:0.7rem">Gaps > multiplier × bore flagged as open ends</span>
            </div>
            <div>
              <label class="config-label" style="font-size:0.8rem">Max Gap (mm)</label>
              <input class="config-input" type="number" id="cfg-validator-model-maxGap" value="${validatorConfig.modelError.maxGap}" step="1" style="width:100%">
              <span class="text-muted" style="font-size:0.7rem">Maximum detectable gap distance</span>
            </div>
            <div>
              <label class="config-label" style="font-size:0.8rem">Severity</label>
              <select class="config-select" id="cfg-validator-model-severity" style="width:100%">
                <option value="ERROR" ${validatorConfig.modelError.severity === 'ERROR' ? 'selected' : ''}>ERROR</option>
                <option value="WARNING" ${validatorConfig.modelError.severity === 'WARNING' ? 'selected' : ''}>WARNING</option>
                <option value="INFO" ${validatorConfig.modelError.severity === 'INFO' ? 'selected' : ''}>INFO</option>
              </select>
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem">
              <button class="toggle sm ${validatorConfig.modelError.autoFixable ? 'on' : ''}" id="cfg-validator-model-autoFixable"></button>
              <label style="font-size:0.8rem">Auto-Fixable</label>
            </div>
          </div>
        </div>

        <!-- Rule 3: Overlaps -->
        <div style="margin-bottom:1.5rem;padding:1rem;background:var(--bg-1);border-radius:6px">
          <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem">
            <button class="toggle ${validatorConfig.overlap.enabled ? 'on' : ''}" id="cfg-validator-overlap-enabled"></button>
            <strong style="font-size:0.95rem">Rule 3: Overlaps (Component Intersections)</strong>
          </div>
          <div id="cfg-validator-overlap-fields" style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;opacity:${validatorConfig.overlap.enabled ? 1 : 0.5};pointer-events:${validatorConfig.overlap.enabled ? 'all' : 'none'}">
            <div>
              <label class="config-label" style="font-size:0.8rem">Min Overlap (mm)</label>
              <input class="config-input" type="number" id="cfg-validator-overlap-minOverlap" value="${validatorConfig.overlap.minOverlap}" step="0.1" style="width:100%">
              <span class="text-muted" style="font-size:0.7rem">Ignore overlaps smaller than this</span>
            </div>
            <div>
              <label class="config-label" style="font-size:0.8rem">Bore Tolerance (mm)</label>
              <input class="config-input" type="number" id="cfg-validator-overlap-boreTolerance" value="${validatorConfig.overlap.boreTolerance}" step="0.1" style="width:100%">
              <span class="text-muted" style="font-size:0.7rem">Allowed bore difference for auto-fix</span>
            </div>
            <div>
              <label class="config-label" style="font-size:0.8rem">Severity</label>
              <select class="config-select" id="cfg-validator-overlap-severity" style="width:100%">
                <option value="ERROR" ${validatorConfig.overlap.severity === 'ERROR' ? 'selected' : ''}>ERROR</option>
                <option value="WARNING" ${validatorConfig.overlap.severity === 'WARNING' ? 'selected' : ''}>WARNING</option>
                <option value="INFO" ${validatorConfig.overlap.severity === 'INFO' ? 'selected' : ''}>INFO</option>
              </select>
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem">
              <button class="toggle sm ${validatorConfig.overlap.autoFixable ? 'on' : ''}" id="cfg-validator-overlap-autoFixable"></button>
              <label style="font-size:0.8rem">Auto-Fixable (same bore only)</label>
            </div>
          </div>
        </div>

        <!-- Fixer Settings -->
        <div style="margin-bottom:1rem;padding:1rem;background:var(--bg-subtle);border-radius:6px;border-left:3px solid var(--amber)">
          <strong style="font-size:0.95rem;display:block;margin-bottom:0.75rem">⚙️ Fixer Settings</strong>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
            <div>
              <label class="config-label" style="font-size:0.8rem">Max Skew Length (mm)</label>
              <input class="config-input" type="number" id="cfg-validator-fixer-maxSkewLength" value="${validatorConfig.fixer.maxSkewLength}" step="1" style="width:100%">
            </div>
            <div>
              <label class="config-label" style="font-size:0.8rem">Snap Threshold (mm)</label>
              <input class="config-input" type="number" id="cfg-validator-fixer-snapThreshold" value="${validatorConfig.fixer.snapThreshold}" step="0.1" style="width:100%">
            </div>
            <div>
              <label class="config-label" style="font-size:0.8rem">OLET Offset Multiplier</label>
              <input class="config-input" type="number" id="cfg-validator-fixer-oletOffsetMultiplier" value="${validatorConfig.fixer.oletOffsetMultiplier}" step="0.1" style="width:100%">
              <span class="text-muted" style="font-size:0.7rem">Pipe OD ÷ multiplier</span>
            </div>
            <div>
              <label class="config-label" style="font-size:0.8rem">Bore Tolerance (mm)</label>
              <input class="config-input" type="number" id="cfg-validator-fixer-boreTolerance" value="${validatorConfig.fixer.boreTolerance}" step="0.1" style="width:100%">
            </div>
          </div>
        </div>

        <!-- Visual Settings -->
        <div style="padding:1rem;background:var(--bg-subtle);border-radius:6px">
          <strong style="font-size:0.95rem;display:block;margin-bottom:0.75rem">🎨 Visual Highlighting</strong>
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:0.75rem">
            <div>
              <label class="config-label" style="font-size:0.8rem">Error Color</label>
              <input class="config-input" type="color" id="cfg-validator-visual-errorColor" value="${validatorConfig.visual.errorColor}" style="width:100%;height:36px">
            </div>
            <div>
              <label class="config-label" style="font-size:0.8rem">Warning Color</label>
              <input class="config-input" type="color" id="cfg-validator-visual-warningColor" value="${validatorConfig.visual.warningColor}" style="width:100%;height:36px">
            </div>
            <div>
              <label class="config-label" style="font-size:0.8rem">Info Color</label>
              <input class="config-input" type="color" id="cfg-validator-visual-infoColor" value="${validatorConfig.visual.infoColor}" style="width:100%;height:36px">
            </div>
            <div>
              <label class="config-label" style="font-size:0.8rem">Focus Color</label>
              <input class="config-input" type="color" id="cfg-validator-visual-focusColor" value="${validatorConfig.visual.focusColor}" style="width:100%;height:36px">
            </div>
            <div>
              <label class="config-label" style="font-size:0.8rem">Highlight Opacity</label>
              <input class="config-input" type="range" id="cfg-validator-visual-highlightOpacity" value="${validatorConfig.visual.highlightOpacity}" min="0" max="1" step="0.05" style="width:100%">
              <span id="cfg-validator-visual-highlightOpacity-value" style="font-size:0.75rem;color:var(--text-muted)">${validatorConfig.visual.highlightOpacity}</span>
            </div>
          </div>
        </div>

        <div style="margin-top:1rem;display:flex;gap:0.5rem">
          <button id="btn-validator-reset" class="btn btn-secondary">Reset to Defaults</button>
          <button id="btn-validator-export" class="btn btn-secondary">Export Rules</button>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Wire all event listeners
  wireValidatorSettings(validatorConfig);
}

/** Wire all event listeners for Smart Validator settings */
function wireValidatorSettings(validatorConfig) {
  const saveValidatorConfig = () => {
    const cfg = getConfig();
    cfg.smartValidator = validatorConfig;
    saveConfig(cfg);
    setState("config", cfg);
    console.info(`${LOG_PREFIX} Smart Validator config saved.`);
  };

  // Global tolerance
  document.getElementById("cfg-validator-tolerance")?.addEventListener("change", (e) => {
    validatorConfig.tolerance = parseFloat(e.target.value);
    saveValidatorConfig();
  });

  // Rule 1: Broken Connections
  wireRuleToggle("broken", validatorConfig.brokenConnection, saveValidatorConfig);
  wireRuleFields("broken", validatorConfig.brokenConnection, saveValidatorConfig, [
    { id: "minGap", type: "float" },
    { id: "maxGapMultiplier", type: "float" },
    { id: "severity", type: "string" },
    { id: "autoFixable", type: "boolean" }
  ]);

  // Rule 2: Model Errors
  wireRuleToggle("model", validatorConfig.modelError, saveValidatorConfig);
  wireRuleFields("model", validatorConfig.modelError, saveValidatorConfig, [
    { id: "minGapMultiplier", type: "float" },
    { id: "maxGap", type: "float" },
    { id: "severity", type: "string" },
    { id: "autoFixable", type: "boolean" }
  ]);

  // Rule 3: Overlaps
  wireRuleToggle("overlap", validatorConfig.overlap, saveValidatorConfig);
  wireRuleFields("overlap", validatorConfig.overlap, saveValidatorConfig, [
    { id: "minOverlap", type: "float" },
    { id: "boreTolerance", type: "float" },
    { id: "severity", type: "string" },
    { id: "autoFixable", type: "boolean" }
  ]);

  // Fixer Settings
  ["maxSkewLength", "snapThreshold", "oletOffsetMultiplier", "boreTolerance"].forEach(key => {
    document.getElementById(`cfg-validator-fixer-${key}`)?.addEventListener("change", (e) => {
      validatorConfig.fixer[key] = parseFloat(e.target.value);
      saveValidatorConfig();
    });
  });

  // Visual Settings
  ["errorColor", "warningColor", "infoColor", "focusColor"].forEach(key => {
    document.getElementById(`cfg-validator-visual-${key}`)?.addEventListener("change", (e) => {
      validatorConfig.visual[key] = e.target.value;
      saveValidatorConfig();
    });
  });

  const opacitySlider = document.getElementById("cfg-validator-visual-highlightOpacity");
  const opacityLabel = document.getElementById("cfg-validator-visual-highlightOpacity-value");
  opacitySlider?.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    validatorConfig.visual.highlightOpacity = val;
    if (opacityLabel) opacityLabel.textContent = val.toFixed(2);
    saveValidatorConfig();
  });

  // Reset button
  document.getElementById("btn-validator-reset")?.addEventListener("click", () => {
    if (!confirm("Reset Smart Validator settings to defaults?")) return;
    const cfg = getConfig();
    delete cfg.smartValidator;
    saveConfig(cfg);
    setState("config", cfg);
    renderSmartValidatorSettings();
  renderPCFSanitizerSettings(); // Re-render with defaults
    console.info(`${LOG_PREFIX} Smart Validator config reset to defaults.`);
  });

  // Export button
  document.getElementById("btn-validator-export")?.addEventListener("click", () => {
    const json = JSON.stringify(validatorConfig, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "smart-validator-config.json";
    a.click();
    URL.revokeObjectURL(url);
    console.info(`${LOG_PREFIX} Smart Validator config exported.`);
  });
}

/** Wire a rule enable/disable toggle */
function wireRuleToggle(rulePrefix, ruleConfig, onSave) {
  const toggleBtn = document.getElementById(`cfg-validator-${rulePrefix}-enabled`);
  const fieldsContainer = document.getElementById(`cfg-validator-${rulePrefix}-fields`);

  toggleBtn?.addEventListener("click", () => {
    const next = !toggleBtn.classList.contains("on");
    ruleConfig.enabled = next;
    toggleBtn.classList.toggle("on", next);
    if (fieldsContainer) {
      fieldsContainer.style.opacity = next ? "1" : "0.5";
      fieldsContainer.style.pointerEvents = next ? "all" : "none";
    }
    onSave();
  });
}

/** Wire rule input fields */
function wireRuleFields(rulePrefix, ruleConfig, onSave, fields) {
  fields.forEach(({ id, type }) => {
    const elementId = `cfg-validator-${rulePrefix}-${id}`;
    const el = document.getElementById(elementId);
    if (!el) return;

    if (type === "boolean") {
      el.addEventListener("click", () => {
        const next = !el.classList.contains("on");
        ruleConfig[id] = next;
        el.classList.toggle("on", next);
        onSave();
      });
    } else if (type === "float") {
      el.addEventListener("change", (e) => {
        ruleConfig[id] = parseFloat(e.target.value);
        onSave();
      });
    } else if (type === "string") {
      el.addEventListener("change", (e) => {
        ruleConfig[id] = e.target.value;
        onSave();
      });
    }
  });
}

/** Render the component type map table from config. */
export function renderTypeMapTable() {
  const config = getConfig();
  const tbody = document.getElementById("type-map-body");
  if (!tbody) return;

  const PCF_KEYWORDS = ["PIPE", "BEND", "TEE", "FLANGE", "VALVE", "OLET", "SUPPORT",
    "REDUCER-CONCENTRIC", "REDUCER-ECCENTRIC", "SKIP"];

  tbody.innerHTML = Object.entries(config.componentTypeMap).map(([csv, pcf]) => `
    <tr data-csv="${csv}">
      <td><input class="alias-input" value="${csv}" style="width:90px" data-field="csv"></td>
      <td><select class="config-select" data-field="pcf" style="width:180px">
        ${PCF_KEYWORDS.map(k => `<option value="${k}" ${k === pcf ? 'selected' : ''}>${k}</option>`).join("")}
      </select></td>
      <td><button class="btn btn-danger btn-sm" data-action="del-type">✕</button></td>
    </tr>`).join("");

  // Wire changes
  tbody.querySelectorAll("input[data-field='csv'], select[data-field='pcf']").forEach(el => {
    el.addEventListener("change", () => saveTypeMap());
  });
  tbody.querySelectorAll("[data-action='del-type']").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.closest("tr").remove();
      saveTypeMap();
    });
  });

  document.getElementById("btn-add-type")?.addEventListener("click", () => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input class="alias-input" value="NEW" style="width:90px" data-field="csv"></td>
      <td><select class="config-select" data-field="pcf" style="width:180px">
        ${PCF_KEYWORDS.map(k => `<option>${k}</option>`).join("")}
      </select></td>
      <td><button class="btn btn-danger btn-sm" data-action="del-type">✕</button></td>`;
    tbody.appendChild(tr);
    tr.querySelector("input").focus();
    tr.querySelectorAll("input,select").forEach(el => el.addEventListener("change", saveTypeMap));
    tr.querySelector("[data-action='del-type']").addEventListener("click", () => { tr.remove(); saveTypeMap(); });
  });
}

function saveTypeMap() {
  const cfg = getConfig();
  const rows = document.querySelectorAll("#type-map-body tr");
  cfg.componentTypeMap = {};
  rows.forEach(tr => {
    const csv = tr.querySelector("input[data-field='csv']")?.value?.trim().toUpperCase();
    const pcf = tr.querySelector("select[data-field='pcf']")?.value;
    if (csv && pcf) cfg.componentTypeMap[csv] = pcf;
  });
  saveConfig(cfg);
  setState("config", cfg);
  console.info(`[ConfigTab] componentTypeMap saved.`, cfg.componentTypeMap);
}

/** Render alias editor: one row per canonical column, comma-list of aliases. */
export function renderAliasEditor() {
  const config = getConfig();
  const wrap = document.getElementById("alias-editor");
  if (!wrap) return;

  wrap.innerHTML = `<table class="alias-table" style="width:100%">
    <thead><tr><th style="width:200px">Canonical Name</th><th>Aliases (comma-separated, case-insensitive)</th></tr></thead>
    <tbody>${Object.entries(config.headerAliases).map(([canon, aliases]) => `
      <tr>
        <td><code style="color:var(--amber)">${canon}</code></td>
        <td><input class="alias-input" data-canon="${canon}" value="${aliases.join(", ")}" style="width:100%"></td>
      </tr>`).join("")}
    </tbody></table>`;

  wrap.querySelectorAll("input.alias-input").forEach(el => {
    el.addEventListener("change", () => {
      const cfg = getConfig();
      const aliases = el.value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      cfg.headerAliases[el.dataset.canon] = aliases;
      saveConfig(cfg); setState("config", cfg);
      console.info(`[ConfigTab] Header alias updated: ${el.dataset.canon}`);
    });
  });
}

/** Render CA definitions editor. */
export function renderCAEditor() {
  const config = getConfig();
  const wrap = document.getElementById("ca-editor");
  if (!wrap) return;

  wrap.innerHTML = `<table class="data-table" style="width:100%">
    <thead><tr><th>CA Slot</th><th>Label</th><th>CSV Field</th><th>Unit</th><th>Default</th><th>Write On</th></tr></thead>
    <tbody>${Object.entries(config.caDefinitions).map(([slot, def]) => `
      <tr>
        <td><code style="color:var(--amber)">${slot}</code></td>
        <td>${def.label}</td>
        <td><code style="color:var(--text-code)">${def.csvField || '—'}</code></td>
        <td><input class="alias-input" data-ca="${slot}" data-field="unit" value="${def.unit || ''}" placeholder="(none)" style="width:60px"></td>
        <td><input class="alias-input" data-ca="${slot}" data-field="default" value="${def.default}" style="width:80px"></td>
        <td style="font-size:0.72rem;color:var(--text-muted)">${Array.isArray(def.writeOn) ? def.writeOn.join(", ") : def.writeOn}</td>
      </tr>`).join("")}
    </tbody></table>`;

  wrap.querySelectorAll("input[data-ca]").forEach(el => {
    el.addEventListener("change", () => {
      const cfg = getConfig();
      const slot = el.dataset.ca;
      const field = el.dataset.field; // 'default' or 'unit'
      if (cfg.caDefinitions[slot]) {
        cfg.caDefinitions[slot][field] = el.value;
        saveConfig(cfg); setState("config", cfg);
        console.info(`[ConfigTab] CA ${field} updated: ${slot} = ${el.value}`);
      }
    });
  });
}

/** Render anomaly rules with toggle + threshold. */
export function renderAnomalyRules() {
  const config = getConfig();
  const wrap = document.getElementById("anomaly-rules-editor");
  if (!wrap) return;

  wrap.innerHTML = Object.entries(config.anomalyRules).map(([id, rule]) => `
    <div style="display:grid;grid-template-columns:auto 1fr auto auto;gap:0.75rem;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--steel)">
      <button class="toggle ${rule.enabled ? 'on' : ''}" data-rule="${id}" role="switch" aria-checked="${rule.enabled}"></button>
      <span style="font-size:0.8rem;color:var(--text-secondary)">${rule.description}</span>
      ${rule.threshold !== undefined ? `<input class="config-input" data-rule="${id}" data-field="threshold" value="${rule.threshold}" style="width:70px" type="number" step="0.01">` : '<span></span>'}
      <select class="config-select" data-rule="${id}" data-field="severity" style="width:100px">
        ${['ERROR', 'WARNING', 'INFO'].map(s => `<option ${s === rule.severity ? 'selected' : ''}>${s}</option>`).join("")}
      </select>
    </div>`).join("");

  wrap.querySelectorAll(".toggle[data-rule]").forEach(btn => {
    btn.addEventListener("click", () => {
      const cfg = getConfig();
      const on = !btn.classList.contains("on");
      cfg.anomalyRules[btn.dataset.rule].enabled = on;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-checked", on);
      saveConfig(cfg); setState("config", cfg);
    });
  });

  wrap.querySelectorAll("input[data-rule][data-field='threshold']").forEach(el => {
    el.addEventListener("change", () => {
      const cfg = getConfig();
      cfg.anomalyRules[el.dataset.rule].threshold = parseFloat(el.value);
      saveConfig(cfg); setState("config", cfg);
    });
  });

  wrap.querySelectorAll("select[data-rule][data-field='severity']").forEach(el => {
    el.addEventListener("change", () => {
      const cfg = getConfig();
      cfg.anomalyRules[el.dataset.rule].severity = el.value;
      saveConfig(cfg); setState("config", cfg);
    });
  });
}


/** Render PCF Output Sanitizer Settings */
function renderPCFSanitizerSettings() {
  const container = document.getElementById("cfg-pcf-sanitizer-container");
  if (!container) return;

  const config = getConfig();
  const sanitizerConfig = config.exportSettings || {
    removeZeroLengthElements: true,
    fixTees: true,
    fixBends: true,
    fixSupports: true,
    removeOrphans: true
  };

  const html = `
    <div class="config-section">
      <div class="config-section-header">
        <span class="config-section-title">🛡️ PCF Output Sanitizer</span>
        <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      <div class="config-section-body">
        <p class="text-muted text-sm mb-3">These rules are applied to the final components array immediately before downloading the PCF. They ensure architectural integrity regardless of the validation errors shown in the UI.</p>

        <div class="config-row align-items-center">
          <div>
            <label class="config-label mb-0">Eliminate Zero-Length Pipes</label>
            <div class="text-muted text-xs">Deletes components with a total length of 0.00mm.</div>
          </div>
          <label class="toggle-switch ms-auto">
            <input type="checkbox" id="cfg-sanitizer-zero" ${sanitizerConfig.removeZeroLengthElements ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>

        <div class="config-row align-items-center">
          <div>
            <label class="config-label mb-0">Fix TEEs (CP, BP, Bore)</label>
            <div class="text-muted text-xs">Calculates missing Centre/Branch Points and caps branch bore.</div>
          </div>
          <label class="toggle-switch ms-auto">
            <input type="checkbox" id="cfg-sanitizer-tees" ${sanitizerConfig.fixTees ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>

        <div class="config-row align-items-center">
          <div>
            <label class="config-label mb-0">Fix BENDs (CP / Bore)</label>
            <div class="text-muted text-xs">Generates an intersection Centre Point if missing or 0,0,0. Inherits bore from End Points.</div>
          </div>
          <label class="toggle-switch ms-auto">
            <input type="checkbox" id="cfg-sanitizer-bends" ${sanitizerConfig.fixBends ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>

        <div class="config-row align-items-center">
          <div>
            <label class="config-label mb-0">Enforce SUPPORT Integrity</label>
            <div class="text-muted text-xs">Adds default names (e.g. SUP-AUTO-XXX&nbsp;&nbsp;&nbsp;CA150) and assigns co-ordinates.</div>
          </div>
          <label class="toggle-switch ms-auto">
            <input type="checkbox" id="cfg-sanitizer-supports" ${sanitizerConfig.fixSupports ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>

        <div class="config-row align-items-center">
          <div>
            <label class="config-label mb-0">Purge Orphans</label>
            <div class="text-muted text-xs">Deletes elements floating > 10m away from the rest of the piping.</div>
          </div>
          <label class="toggle-switch ms-auto">
            <input type="checkbox" id="cfg-sanitizer-orphans" ${sanitizerConfig.removeOrphans ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>

      </div>
    </div>
  `;

  container.innerHTML = html;

  // Wire Events
  const saveSanitizerConfig = () => {
    const cfg = getConfig();
    cfg.exportSettings = {
      removeZeroLengthElements: document.getElementById('cfg-sanitizer-zero')?.checked ?? true,
      fixTees: document.getElementById('cfg-sanitizer-tees')?.checked ?? true,
      fixBends: document.getElementById('cfg-sanitizer-bends')?.checked ?? true,
      fixSupports: document.getElementById('cfg-sanitizer-supports')?.checked ?? true,
      removeOrphans: document.getElementById('cfg-sanitizer-orphans')?.checked ?? true,
    };
    saveConfig(cfg);
    setState("config", cfg);
    console.info("PCF Sanitizer config saved.");
  };

  document.getElementById('cfg-sanitizer-zero')?.addEventListener('change', saveSanitizerConfig);
  document.getElementById('cfg-sanitizer-tees')?.addEventListener('change', saveSanitizerConfig);
  document.getElementById('cfg-sanitizer-bends')?.addEventListener('change', saveSanitizerConfig);
  document.getElementById('cfg-sanitizer-supports')?.addEventListener('change', saveSanitizerConfig);
  document.getElementById('cfg-sanitizer-orphans')?.addEventListener('change', saveSanitizerConfig);
}

function renderOverlapResolution() {
  const container = document.getElementById("cfg-overlap-resolution-container");
  if (!container) return;

  const config = getConfig();
  const overlapRes = config.coordinateSettings?.overlapResolution || {};

  const fields = [
    { label: "Continuity Tolerance (mm)", key: "continuityTol", def: 25.0, enabledKey: "enableContinuityTol", tooltip: "Maximum distance between nodes to assume same line." },
    { label: "Max Segment Length (mm)", key: "maxSegmentLen", def: 30000, enabledKey: "enableMaxSegmentLen", tooltip: "Maximum length of a single pipe segment before flagged." },
    { label: "Bore Tolerance (mm)", key: "boreTolerance", def: 10.0, enabledKey: "enableBoreTol", tooltip: "Max bore difference (mm) to treat a component as on the same pipe run" },
    { label: "Min Sub-pipe Length (mm)", key: "minPipeLength", def: 10.0, enabledKey: "enableMinPipeLen", tooltip: "Minimum gap length (mm) to generate a sub-pipe. Gasket gaps (3mm) are skipped." },
    { label: "Min Name Length", key: "minComponentNameLength", def: 3, enabledKey: "enableMinNameLen", tooltip: "Minimum length for Component Name to be considered significant" }
  ];

  let configChanged = false;
  fields.forEach(f => {
    if (overlapRes[f.enabledKey] === undefined) {
      overlapRes[f.enabledKey] = true;
      configChanged = true;
    }
    if (overlapRes[f.key] === undefined) {
      overlapRes[f.key] = f.def;
      configChanged = true;
    }
  });

  if (configChanged) {
    config.coordinateSettings.overlapResolution = overlapRes;
    saveConfig(config);
    setState("config", config);
  }

  let fieldsHtml = "";
  fields.forEach(f => {
    const isEnabled = overlapRes[f.enabledKey];
    fieldsHtml += `
        <div style="display:flex; flex-direction:column; gap:0.2rem; margin-bottom: 0.5rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:2px;">
                <label style="font-size:0.85rem; font-weight: 500; color:var(--text-secondary);">${f.label}</label>
                <button class="toggle sm ${isEnabled ? 'on' : ''}" data-key="${f.enabledKey}" style="transform:scale(0.8);"></button>
            </div>
            <input class="config-input" type="number" step="0.1" id="cfg-overlap-${f.key}" data-key="${f.key}" value="${overlapRes[f.key]}" ${isEnabled ? '' : 'disabled'} style="opacity:${isEnabled ? 1 : 0.5}">
            <div style="font-size: 0.75rem; color: #888; line-height: 1.2; margin-top: 2px; font-style: italic;">
                ${f.tooltip}
            </div>
        </div>
      `;
  });

  const html = `
    <div class="config-section">
      <div class="config-section-header">
        <span class="config-section-title">Overlap Resolution</span>
        <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
      </div>
      <div class="config-section-body">
        <p class="text-muted text-sm mb-3">Detects PIPE components whose coordinates engulf inner components and splits them into shorter sub-pipes.</p>

        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem; padding-bottom:0.5rem; border-bottom:1px solid var(--border);">
            <div style="display:flex; align-items:center; gap:0.5rem;">
                <button class="toggle ${overlapRes.enabled !== false ? 'on' : ''}" id="cfg-overlapRes-masterToggle"></button>
                <strong>Master Switch: ${overlapRes.enabled !== false ? 'Enabled' : 'Disabled'}</strong>
            </div>
        </div>

        <div id="cfg-overlap-fields-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; opacity: ${overlapRes.enabled !== false ? 1 : 0.5}; pointer-events: ${overlapRes.enabled !== false ? 'auto' : 'none'};">
            ${fieldsHtml}
        </div>

        <div class="config-row" style="margin-top:12px;align-items:center;">
          <label class="config-label" style="font-weight:600;">Core Logic</label>
          <div class="toggle-wrap">
            <button class="toggle" id="cfg-overlapRes-coreLogic" role="switch" style="font-size:0.7rem;padding:2px 8px;" aria-expanded="false">Show</button>
          </div>
        </div>
        <div id="cfg-overlapRes-coreLogic-panel" style="display:none;margin-top:6px;">
          <pre style="font-size:0.72rem;line-height:1.5;white-space:pre-wrap;background:var(--bg-subtle,#f5f5f5);border-radius:6px;padding:10px;color:var(--text-muted);">When enabled, the Overlap Resolver physically measures point-to-point distances along shared X, Y, or Z axes. If a pipe segment (EP1 to EP2) mathematically encapsulates a distinct component (like a Valve or Tee), it will split the source pipe into two smaller sub-pipes that correctly attach to the inner component.</pre>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Wire events
  const masterToggle = document.getElementById("cfg-overlapRes-masterToggle");
  const fieldsGrid = document.getElementById("cfg-overlap-fields-grid");

  masterToggle.addEventListener("click", () => {
    const c = getConfig();
    const isNowOn = !masterToggle.classList.contains("on");
    c.coordinateSettings.overlapResolution.enabled = isNowOn;
    masterToggle.classList.toggle("on", isNowOn);
    masterToggle.nextElementSibling.textContent = `Master Switch: ${isNowOn ? 'Enabled' : 'Disabled'}`;
    fieldsGrid.style.opacity = isNowOn ? 1 : 0.5;
    fieldsGrid.style.pointerEvents = isNowOn ? "auto" : "none";
    saveConfig(c);
    setState("config", c);
  });

  const btnCore = document.getElementById("cfg-overlapRes-coreLogic");
  const pnlCore = document.getElementById("cfg-overlapRes-coreLogic-panel");
  if (btnCore && pnlCore) {
    btnCore.addEventListener("click", () => {
      const isVisible = pnlCore.style.display === "block";
      pnlCore.style.display = isVisible ? "none" : "block";
      btnCore.textContent = isVisible ? "Show" : "Hide";
      btnCore.setAttribute("aria-expanded", !isVisible);
    });
  }

  container.querySelectorAll(".toggle.sm").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const c = getConfig();
      const key = btn.dataset.key;
      const isNowOn = !btn.classList.contains("on");
      btn.classList.toggle("on", isNowOn);
      c.coordinateSettings.overlapResolution[key] = isNowOn;

      const inputId = btn.parentElement.nextElementSibling.id;
      const inputEl = document.getElementById(inputId);
      if (inputEl) {
        inputEl.disabled = !isNowOn;
        inputEl.style.opacity = isNowOn ? 1 : 0.5;
      }
      saveConfig(c);
      setState("config", c);
    });
  });

  container.querySelectorAll(".config-input").forEach(input => {
    input.addEventListener("change", () => {
      const c = getConfig();
      const key = input.dataset.key;
      c.coordinateSettings.overlapResolution[key] = parseFloat(input.value);
      saveConfig(c);
      setState("config", c);
    });
  });
}

function renderFinalPassGapFillingSettings() {
  const container = document.getElementById("cfg-final-pass-gap-filling-container");
  if (!container) return;

  const config = getConfig();
  const fpSettings = config.coordinateSettings?.finalPassGapFilling || {
    enabled: true,
    pipeStretchLimit: 25.0,
    immutableStretchLimit: 6.0
  };

  const html = `
    <div class="config-section">
      <div class="config-section-header">
        <span class="config-section-title">Final passes</span>
        <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      <div class="config-section-body">
        <p class="text-muted text-sm mb-3">Fallback gap filling for small remaining discontinuities after all other modules have run. These are relaxed constraints applied as a last resort.</p>

        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem; padding-bottom:0.5rem; border-bottom:1px solid var(--border);">
            <div style="display:flex; align-items:center; gap:0.5rem;">
                <button class="toggle ${fpSettings.enabled !== false ? 'on' : ''}" id="cfg-fp-enabled"></button>
                <strong>Master Switch: ${fpSettings.enabled !== false ? 'Enabled' : 'Disabled'}</strong>
            </div>
        </div>

        <div id="cfg-fp-fields" style="opacity: ${fpSettings.enabled !== false ? 1 : 0.5}; pointer-events: ${fpSettings.enabled !== false ? 'auto' : 'none'};">
            <div class="config-row align-items-center" style="margin-bottom: 0.5rem;">
              <div>
                <label class="config-label mb-0" style="font-weight: 500;">Max Pipe Stretch Limit (mm)</label>
                <div class="text-muted text-xs" style="font-style: italic;">Gaps involving at least one PIPE will stretch the PIPE to close.</div>
              </div>
              <input type="number" step="0.1" class="config-input ms-auto" id="cfg-fp-pipe" value="${fpSettings.pipeStretchLimit}" style="width: 100px;">
            </div>

            <div class="config-row align-items-center">
              <div>
                <label class="config-label mb-0" style="font-weight: 500;">Max Immutable Stretch Limit (mm)</label>
                <div class="text-muted text-xs" style="font-style: italic;">Gaps between non-pipes (e.g. Flange to Valve) will stretch/snap the component.</div>
              </div>
              <input type="number" step="0.1" class="config-input ms-auto" id="cfg-fp-immutable" value="${fpSettings.immutableStretchLimit}" style="width: 100px;">
            </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  const saveFpConfig = () => {
    const cfg = getConfig();
    const isEnabled = document.getElementById("cfg-fp-enabled").classList.contains("on");
    cfg.coordinateSettings.finalPassGapFilling = {
      enabled: isEnabled,
      pipeStretchLimit: parseFloat(document.getElementById("cfg-fp-pipe").value),
      immutableStretchLimit: parseFloat(document.getElementById("cfg-fp-immutable").value)
    };
    saveConfig(cfg);
    setState("config", cfg);
  };

  const masterBtn = document.getElementById("cfg-fp-enabled");
  masterBtn.addEventListener("click", () => {
    const next = !masterBtn.classList.contains("on");
    masterBtn.classList.toggle("on", next);
    masterBtn.nextElementSibling.textContent = `Master Switch: ${next ? 'Enabled' : 'Disabled'}`;
    const fields = document.getElementById("cfg-fp-fields");
    fields.style.opacity = next ? "1" : "0.5";
    fields.style.pointerEvents = next ? "auto" : "none";
    saveFpConfig();
  });

  document.getElementById("cfg-fp-pipe").addEventListener("change", saveFpConfig);
  document.getElementById("cfg-fp-immutable").addEventListener("change", saveFpConfig);
}
