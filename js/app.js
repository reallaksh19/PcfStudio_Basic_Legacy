/**
 * app.js — Application entry point
 * Initialise config, state, and all UI modules.
 * Wire up tab routing and global event bus.
 */

import { getConfig } from "./config/config-store.js";
import { setState, getState } from "./state.js";
import { initInputTab } from "./ui/input-tab.js";
import { initMappingTab } from "./ui/mapping-tab.js";
import { initValidateTab } from "./ui/validate-tab.js";
import { initOutputTab } from "./ui/output-tab.js";
import { initConfigTab } from "./ui/config-tab.js";
import { initViewerTab } from "./ui/viewer-tab.js";
import { initDebugTab } from "./ui/debug-tab.js";
import { initTabManager, setTabEnabled } from "./ui/tab-manager.js";
import { MasterDataController } from "./ui/master-data-controller.js";
import { linelistService } from "./services/linelist-service.js";
import { PcfTableController } from "./ui/pcf-table-controller.js";
import { initStatusBar, APP_REVISION } from "./ui/status-bar.js";
import { themeManager } from "./ui/theme-manager.js";
import { initRayConceptTab } from "./ray-concept/rc-tab.js";
import { initPcfFixerTab } from "./ui/pcf-fixer-tab.js";


const LOG_PREFIX = "[App]";
const APP_VERSION = "PCF CONVERTER V5.9b";

/** Main bootstrap — runs after DOM ready. */
async function boot() {
  try {
    console.info(`${LOG_PREFIX} PCF Converter booting... (Build: ${APP_VERSION})`);

    // Update Revision Footer
    const revEl = document.getElementById("app-revision");
    if (revEl) {
      revEl.textContent = `${APP_VERSION} - ${APP_REVISION}`;
    }

    // 0. Initialise Theme
    themeManager.init();
    const themeBtn = document.getElementById("btn-theme-toggle");
    if (themeBtn) themeManager.bindToggleBtn(themeBtn);

    // 1. Load config (merges defaults + localStorage)
    const config = getConfig();

    // Forced Reset for v1.2.1 transition to ensure Fuzzy Single is default
    if (config._version === "1.2.1" && config.coordinateSettings?.pipelineMode === "sequential") {
      console.warn(`${LOG_PREFIX} Forced Config Reset for v1.2.1 transition.`);
      localStorage.removeItem("pcf_converter_config");
      window.location.reload();
      return;
    }

    setState("config", config);
    console.info(`${LOG_PREFIX} Config loaded.`, { version: config._version });

    // 2. Initialise tab manager (wires click handlers)
    initTabManager();

    // Disable tabs that require data to be processed first
    // setTabEnabled('validate', false); // Enabled by user request
    setTabEnabled('preview', false);
    setTabEnabled('sequence', false);

    // 3. Initialise each tab's UI module
    initInputTab();
    initMappingTab();
    initValidateTab();
    initOutputTab();
    initConfigTab();
    initViewerTab();
    initDebugTab();
    initRayConceptTab();
    initPcfFixerTab();


    // 4. Initialise Master Data UI (Linelist + Weight + LineDump)
    new MasterDataController('integ-app-container');
    linelistService.init();

    // 5. Initialise PCF Table Controller
    new PcfTableController();

    // 6. Wire global keyboard shortcuts
    document.addEventListener("keydown", handleGlobalKey);

    // 7. Initialise Pipeline Status Bar
    initStatusBar();

    // 8. Update main status bar (legacy)
    updateStatusBar("idle");

    console.info(`${LOG_PREFIX} Boot complete.`);
  } catch (err) {
    console.error(`${LOG_PREFIX} Boot failed. Reason: ${err.message}`, err);
    showBootError(err.message);
  }
}

/** Global keyboard shortcuts. */
function handleGlobalKey(e) {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === "o") { e.preventDefault(); document.getElementById("file-input")?.click(); }
  if (ctrl && e.key === "v" && document.activeElement?.id !== "paste-textarea") {
    const pasteToggle = document.getElementById("btn-paste-toggle");
    if (pasteToggle) { e.preventDefault(); pasteToggle.click(); }
  }
}

/** Update the status bar dot and text. */
export function updateStatusBar(state, detail = "") {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  if (!dot || !text) return;
  dot.className = `status-dot ${state}`;
  const labels = { idle: "Ready", parsing: "Parsing…", converting: "Converting…", validating: "Validating…", done: "Complete", error: "Error" };
  text.textContent = (labels[state] || state) + (detail ? ` — ${detail}` : "");
}

/** Show a fatal boot error to the user. */
function showBootError(msg) {
  const el = document.getElementById("boot-error");
  if (el) { el.textContent = `Boot error: ${msg}. Please reload.`; el.style.display = "block"; }
}

// Kick off on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
