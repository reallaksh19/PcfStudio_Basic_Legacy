/**
 * ray-app.js — Bootstrap for ray.html (standalone Ray Tool landing page)
 * Initialises: New Ray tab, 3D Viewer tab, Master Data tab, Topology placeholder.
 */

import { initRayConceptTab }   from './ray-concept/rc-tab.js';
import { initRayViewerTab }    from './ray-tabs/ray-viewer-tab.js';
import { initRayMasterData }   from './ray-tabs/ray-masterdata-tab.js';
import { themeManager }        from './ui/theme-manager.js';
import { APP_REVISION } from './ui/status-bar.js';

const TABS = ['ray', 'viewer', 'masterdata', 'pcf-fixer'];

function switchTab(target) {
  const panelMap = {
    'ray': 'new-ray',
    'viewer': 'viewer',
    'masterdata': 'masterdata',
    'pcf-fixer': 'pcf-fixer'
  };
  TABS.forEach(id => {
    document.getElementById(`rtab-${id}`)?.classList.toggle('active', id === target);
    const panelId = panelMap[id];
    document.getElementById(`panel-${panelId}`)?.classList.toggle('active', id === target);
  });
  // Hide main status bar when pcf-fixer tab is active
  const statusBar = document.getElementById('status-bar');
  if (statusBar) {
    statusBar.style.display = target === 'pcf-fixer' ? 'none' : '';
  }

  // Remove padding from main container so PCF Fixer React status bar mounts flush
  const appMain = document.getElementById('app-main');
  if (appMain) {
    appMain.style.paddingBottom = target === 'pcf-fixer' ? '0' : '';
  }
}

function initTabRouter() {
  TABS.forEach(id => {
    document.getElementById(`rtab-${id}`)
      ?.addEventListener('click', () => switchTab(id));
  });
  switchTab('ray');
}

async function boot() {
  try {
    // Theme
    themeManager.init();
    document.getElementById('btn-theme-toggle')
      ?.addEventListener('click', () => themeManager.toggle?.() ?? themeManager.init());

    // Tab routing
    initTabRouter();

    // Tabs
    initRayConceptTab();   // ① New Ray
    initRayViewerTab();    // ② 3D Viewer
    initRayMasterData();   // ③ Master Data + CA Config
    try {
      const { initRayPcfFixerTab } = await import('./ray-tabs/ray-pcf-fixer-tab.js');
      initRayPcfFixerTab();  // ④ PCF Fixer
    } catch (err) {
      console.warn('[RayApp] PCF Fixer browser entry failed:', err?.message || err);
      const fixerRoot = document.getElementById('pcf-fixer-react-root');
      if (fixerRoot && !fixerRoot.textContent.trim()) {
        fixerRoot.innerHTML = `<div style="padding:1rem;color:var(--text-muted)">PCF Fixer failed to load in browser mode.</div>`;
      }
    }

    // Status bar revision
    const revEl = document.getElementById('app-revision');
    if (revEl) revEl.textContent = 'PCF Studio — ' + APP_REVISION;

    console.info('[RayApp] Boot complete.');
  } catch (err) {
    console.error('[RayApp] Boot failed:', err);
  }
}

document.addEventListener('DOMContentLoaded', boot);
