/**
 * ray-pcf-fixer-tab.js — PCF Fixer integration for the Ray shell.
 * In static-host mode, this loads the browser-safe runtime entry instead of
 * importing the Vite-only JSX/CSS bundle directly.
 */

export async function initRayPcfFixerTab() {
  const container = document.getElementById('pcf-fixer-react-root');
  if (!container) {
    console.warn('[RayPcfFixerTab] React root element (pcf-fixer-react-root) not found');
    return;
  }

  try {
    let mountBrowserPcfFixer;
    // Only attempt to load raw JSX if we are in Vite dev mode, to avoid strict MIME type console errors
    const isViteDev = !!(import.meta.env && import.meta.env.MODE === 'development') || 
                      document.querySelector('script[src*="@vite/client"]') !== null;
    if (isViteDev) {
      try {
        const React = await import('react');
        const { createRoot } = await import('react-dom/client');
        await import('../pcf-fixer/index.css');
        const appMod = await import('../pcf-fixer/App.jsx');
        const App = appMod.default || appMod.App;
        container.innerHTML = '';
        if (!container.__pcfFixerRoot) container.__pcfFixerRoot = createRoot(container);
        container.__pcfFixerRoot.render(React.createElement(App));
        console.info('[RayPcfFixerTab] Mounted src/js/pcf-fixer/App.jsx');
        return;
      } catch (srcErr) {
        console.warn('[RayPcfFixerTab] direct pcf-fixer mount failed, fallback runtime:', srcErr);
      }
    }
    try {
      ({ mountBrowserPcfFixer } = await import('../pcf-fixer-runtime/bootstrap.js'));
    } catch (bootstrapErr) {
      console.warn('[RayPcfFixerTab] bootstrap load failed, retrying browser-entry:', bootstrapErr);
      ({ mountBrowserPcfFixer } = await import('../pcf-fixer-runtime/browser-entry.js'));
    }
    await Promise.race([
      mountBrowserPcfFixer(container),
      new Promise((_, reject) => setTimeout(() => reject(new Error('PCF Fixer mount timed out after 15s')), 15000))
    ]);
    console.info('[RayPcfFixerTab] PCF-Fixer browser entry mounted successfully');
  } catch (err) {
    console.error('[RayPcfFixerTab] Failed to mount PCF-Fixer browser entry:', err);
    try {
      const { flashStatusNotice } = await import('../ui/status-bar.js');
      flashStatusNotice('⚠ PCF Fixer unavailable in this host; continuing without it', 'warn', 3500);
    } catch {}
    container.innerHTML = `<div style="padding:2rem;color:var(--text-muted);text-align:center">
      <div style="font-size:1.5rem;margin-bottom:1rem">❌</div>
      <p style="margin-bottom:0.5rem;font-family:var(--font-code)">Failed to load PCF-Fixer app</p>
      <p style="font-size:0.85rem;color:var(--text-muted)">${err?.message || err}</p>
      <p style="font-size:0.75rem;color:var(--text-muted);margin-top:1rem">Check browser console for details</p>
    </div>`;
  }
}
