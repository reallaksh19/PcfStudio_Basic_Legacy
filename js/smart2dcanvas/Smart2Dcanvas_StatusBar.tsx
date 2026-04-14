import React from 'react';
import { useSceneStore } from './Smart2Dcanvas_SceneStore';

import { useShallow } from "zustand/react/shallow";

const Smart2Dcanvas_StatusBar: React.FC = () => {
  const { activeTool, scale, isOrtho, isOsnap, selectedCount, revision } = useSceneStore(useShallow((state) => ({
    activeTool: state.activeTool,
    scale: state.scale,
    isOrtho: state.isOrtho,
    isOsnap: state.isOsnap,
    selectedCount: state.selectedIds.size,
    revision: state.revision,
  })));

  return (
    <div className="px-3 py-1.5 text-[11px] border-t border-slate-800 bg-slate-950 text-slate-400 flex items-center gap-4">
      <span>Tool: <span className="text-slate-200">{activeTool}</span></span>
      <span>Scale: <span className="text-slate-200">{scale.toFixed(2)}</span></span>
      <span>Selection: <span className="text-slate-200">{selectedCount}</span></span>
      <span>Ortho: <span className="text-slate-200">{String(isOrtho)}</span></span>
      <span>Osnap: <span className="text-slate-200">{String(isOsnap)}</span></span>
      <span>Rev: <span className="text-slate-200">{revision}</span></span>
    </div>
  );
};

export default Smart2Dcanvas_StatusBar;
