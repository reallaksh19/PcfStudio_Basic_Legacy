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
    const { mountBrowserPcfFixer } = await import('../pcf-fixer-runtime/bootstrap.js');
    await mountBrowserPcfFixer(container);
    console.info('[RayPcfFixerTab] PCF-Fixer browser entry mounted successfully');
  } catch (err) {
    console.error('[RayPcfFixerTab] Failed to mount PCF-Fixer browser entry:', err);
    container.innerHTML = `<div style="padding:2rem;color:var(--text-muted);text-align:center">
      <div style="font-size:1.5rem;margin-bottom:1rem">❌</div>
      <p style="margin-bottom:0.5rem;font-family:var(--font-code)">Failed to load PCF-Fixer app</p>
      <p style="font-size:0.85rem;color:var(--text-muted)">${err?.message || err}</p>
      <p style="font-size:0.75rem;color:var(--text-muted);margin-top:1rem">Check browser console for details</p>
    </div>`;
  }
}
