import React from "react";
import { createRoot } from "react-dom/client";
import { PcfGlbExporterPanel } from "./PcfGlbExporterPanel.js";
function initPcfGlbExporterPanel(container) {
  if (!container) return;
  const root = createRoot(container);
  root.render(/* @__PURE__ */ React.createElement(PcfGlbExporterPanel, null));
}
export {
  initPcfGlbExporterPanel
};
