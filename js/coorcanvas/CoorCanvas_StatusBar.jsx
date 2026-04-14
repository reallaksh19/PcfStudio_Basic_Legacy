/**
 * CoorCanvas_StatusBar.jsx
 * Dynamic command-line hints bar at the bottom of the CoorCanvas workspace.
 */
import React from "react";

const HINTS = {
  select:  "Select objects or drag to pan",
  emit:    "Click start point, then end point of emit line",
  support: "Hover pipe until snap appears, click to place support",
  valve:   "Click pipe to insert Valve",
  flange:  "Click pipe to insert Flange",
  fvf:     "Click pipe to insert FVF (Flange-Valve-Flange)",
  reducer: "Click pipe to insert Reducer — set upstream/downstream bore",
  marquee: "Drag to zoom into marquee area",
  pan:     "Drag to pan the view",
};

export default function CoorCanvas_StatusBar({ mode, statusText, snapTarget }) {
  const snapTypeLabel =
    snapTarget?.snapType === "endpoint" ? " [endpoint]" :
    snapTarget?.snapType === "midpoint" ? " [midpoint]" :
    snapTarget?.snapType === "nearest"  ? " [nearest]"  : "";

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t bg-slate-950 px-4 py-2 text-xs text-slate-200">
      <div className="flex items-center gap-4 overflow-hidden">
        <span className="font-medium text-white">Status</span>
        <span className="truncate">{statusText}</span>
        {snapTarget && (
          <span className="text-cyan-300">
            Snap {snapTarget.point[0].toFixed(1)}, {snapTarget.point[1].toFixed(1)}
            {snapTypeLabel}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-slate-400 italic max-w-[300px] truncate">{HINTS[mode] || ""}</span>
        <span>F fit</span>
        <span>Z zoom sel</span>
        <span>C center</span>
        <span>Del remove</span>
      </div>
    </div>
  );
}
