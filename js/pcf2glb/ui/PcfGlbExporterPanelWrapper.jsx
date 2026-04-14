import React from 'react';
import { createRoot } from 'react-dom/client';
import { PcfGlbExporterPanel } from './PcfGlbExporterPanel.jsx';

export function initPcfGlbExporterPanel(container) {
  if (!container) return;
  const root = createRoot(container);
  root.render(<PcfGlbExporterPanel />);
}
