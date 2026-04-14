import React from 'react';
import { useSceneStore } from '../smart2dcanvas/Smart2Dcanvas_SceneStore';
import { Pro2D_getLeftRailTools } from './Pro2D_ToolRegistry.mjs';

const TOOLS = Pro2D_getLeftRailTools();

const Pro2D_LeftRail: React.FC = () => {
  const activeTool = useSceneStore((state) => state.activeTool);
  const setActiveTool = useSceneStore((state) => state.setActiveTool);
  return (
    <div className="w-24 border-r border-slate-800 bg-slate-950/80 p-2 flex flex-col gap-2 overflow-auto">
      {TOOLS.map((tool: any) => {
        const disabled = tool.implemented === false;
        return (
          <button
            key={tool.id}
            className={`rounded-lg border px-2 py-2 text-xs text-center ${disabled ? 'border-slate-900 bg-slate-950 text-slate-600 cursor-not-allowed opacity-60' : activeTool === tool.id ? 'border-amber-500 bg-amber-500/10 text-amber-200' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'}`}
            onClick={() => disabled ? null : setActiveTool(tool.id as any)}
            title={disabled ? `${tool.label} — ${tool.note || 'Planned, not implemented yet.'}` : tool.label}
            disabled={disabled}
          >
            <div className="text-base">{tool.icon}</div>
            <div className="mt-1 leading-tight">{tool.label}</div>
          </button>
        );
      })}
    </div>
  );
};

export default Pro2D_LeftRail;
