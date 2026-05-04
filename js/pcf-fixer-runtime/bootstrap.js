import './exposeStore.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './index.css.js';

const TAILWIND_SCRIPT_ID = 'pcf-fixer-tailwind-runtime';

function ensureTailwindRuntime() {
  if (window.tailwind) return Promise.resolve();
  const existing = document.getElementById(TAILWIND_SCRIPT_ID);
  if (existing) return new Promise(resolve => existing.addEventListener('load', resolve, { once: true }));
  return new Promise(resolve => {
    const script = document.createElement('script');
    script.id = TAILWIND_SCRIPT_ID;
    script.src = 'https://cdn.tailwindcss.com';
    script.onload = resolve;
    script.onerror = resolve;
    document.head.appendChild(script);
  });
}

export async function mountBrowserPcfFixer(container) {
  if (!container) throw new Error('PCF Fixer mount container not found');

  window.__PCF_FIXER_MOUNT_STATUS__ = {
    status: 'loading',
    reactVersion: React.version,
    mountedAt: null,
    error: null,
  };

  container.innerHTML = '<div style="padding:1.5rem;color:var(--text-muted);font-family:var(--font-code);text-align:center">Loading PCF Fixer...</div>';

  try {
    await ensureTailwindRuntime();

    if (!container.__pcfFixerRoot) {
      container.__pcfFixerRoot = createRoot(container);
    }

    container.__pcfFixerRoot.render(React.createElement(App));

    window.__PCF_FIXER_MOUNT_STATUS__ = {
      status: 'mounted',
      reactVersion: React.version,
      mountedAt: Date.now(),
      error: null,
    };
  } catch (err) {
    window.__PCF_FIXER_MOUNT_STATUS__ = {
      status: 'failed',
      reactVersion: React.version,
      mountedAt: null,
      error: err?.message || String(err),
    };
    throw err;
  }
}
