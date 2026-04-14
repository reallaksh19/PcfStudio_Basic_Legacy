/**
 * tab-manager.js
 * Wire tab click handlers. Show/hide panels. Update active state.
 */

const LOG_PREFIX = "[TabManager]";

const TABS = ["input", "mapping", "table-view", "validate", "sequence", "preview", "output", "viewer", "smart_fixer", "config", "master-data", "debug", "new-ray", "pcf-fixer"];

/** Initialise tab click handlers. */
export function initTabManager() {
  TABS.forEach(id => {
    const btn = document.getElementById(`tab-${id}`);
    const panel = document.getElementById(`panel-${id}`);

    if (btn) {
        btn.addEventListener("click", () => switchTab(id));
    } else {
        console.warn(`${LOG_PREFIX} Tab button not found: tab-${id}`);
    }

    if (!panel) {
        console.warn(`${LOG_PREFIX} Tab panel not found: panel-${id}`);
    }
  });

  // Default: show input tab
  switchTab("input");
  console.info(`${LOG_PREFIX} Tab manager initialised. Tabs: ${TABS.join(", ")}`);
}

/** Switch to a tab by id. */
export function switchTab(targetId) {
  if (!TABS.includes(targetId)) {
    console.error(`${LOG_PREFIX} switchTab: unknown tab "${targetId}"`);
    return;
  }
  TABS.forEach(id => {
    const btn = document.getElementById(`tab-${id}`);
    const panel = document.getElementById(`panel-${id}`);
    const isTarget = id === targetId;
    btn?.classList.toggle("active", isTarget);
    panel?.classList.toggle("active", isTarget);
  });
  console.debug(`${LOG_PREFIX} Switched to tab: ${targetId}`);
}

/** Set a badge count on a tab. count=0 hides the badge. */
export function setTabBadge(tabId, count, severity = "") {
  const btn = document.getElementById(`tab-${tabId}`);
  if (!btn) return;
  let badge = btn.querySelector(".tab-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "tab-badge";
    btn.appendChild(badge);
  }
  if (count === 0) {
    badge.style.display = "none";
    btn.classList.remove("has-errors", "has-warnings", "has-success");
  } else {
    badge.style.display = "";
    badge.textContent = count > 99 ? "99+" : String(count);
    btn.classList.remove("has-errors", "has-warnings", "has-success");
    if (severity) btn.classList.add(`has-${severity}`);
  }
}

/** Enable or disable a tab. Disabled tabs are grayed out and unclickable. */
export function setTabEnabled(tabId, enabled) {
  const btn = document.getElementById(`tab-${tabId}`);
  if (!btn) {
    console.warn(`${LOG_PREFIX} setTabEnabled: tab button not found: tab-${tabId}`);
    return;
  }
  btn.classList.toggle("disabled", !enabled);
  console.debug(`${LOG_PREFIX} Tab "${tabId}" ${enabled ? "enabled" : "disabled"}.`);
}
