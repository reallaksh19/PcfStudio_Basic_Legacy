import React from 'react';
import { useSceneStore } from './Smart2Dcanvas_SceneStore';
import { calculateSnap } from './Smart2Dcanvas_SnapEngine';

const Pro2DColors: any = {
  segment: '#e2e8f0',
  inline: '#f59e0b',
  support: '#22c55e',
  fitting: '#38bdf8',
};

import { useShallow } from 'zustand/react/shallow';
import { useState } from 'react';

const Smart2Dcanvas_CanvasViewport: React.FC = () => {
  const [marqueeStart, setMarqueeStart] = useState<{x: number, y: number} | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<{x: number, y: number} | null>(null);
  const { segments, inlineItems, supports, fittings, underlayImages, selectedIds, activeTool, scale, selectObject } = useSceneStore(useShallow((state) => ({
    segments: state.segments,
    inlineItems: state.inlineItems,
    supports: state.supports,
    fittings: state.fittings,
    underlayImages: state.underlayImages,
    selectedIds: state.selectedIds,
    activeTool: state.activeTool,
    scale: state.scale,
    selectObject: state.selectObject,
  })));
  const snap = calculateSnap(300, 180, scale);
  const { clearSelection, nodes } = useSceneStore(state => ({ clearSelection: state.clearSelection, nodes: state.nodes }));

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'select' || activeTool === 'marquee') {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMarqueeStart({x, y});
      setMarqueeCurrent({x, y});
      if (!e.shiftKey) clearSelection();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (marqueeStart) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMarqueeCurrent({x, y});
    }
  };

  const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (marqueeStart && marqueeCurrent) {
      const rect = e.currentTarget.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;
      
      const minX = Math.min(marqueeStart.x, endX);
      const maxX = Math.max(marqueeStart.x, endX);
      const minY = Math.min(marqueeStart.y, endY);
      const maxY = Math.max(marqueeStart.y, endY);
      
      // Select items in bounds
      Object.values(segments).forEach((seg: any) => {
          const a = seg.points?.[0];
          const b = seg.points?.[seg.points.length - 1];
          if (a && b) {
              if (a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY) {
                  selectObject(seg.id, true);
              }
          }
      });
      Object.values(inlineItems).forEach((item: any) => {
          if (item.x >= minX && item.x <= maxX && item.y >= minY && item.y <= maxY) {
              selectObject(item.id, true);
          }
      });
      Object.values(supports).forEach((sup: any) => {
          if (sup.x >= minX && sup.x <= maxX && sup.y >= minY && sup.y <= maxY) {
              selectObject(sup.id, true);
          }
      });
      Object.values(nodes).forEach((node: any) => {
          if (node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY) {
              selectObject(node.id, true);
          }
      });
    }
    setMarqueeStart(null);
    setMarqueeCurrent(null);
  };

  return (
    <div className="absolute inset-0 bg-slate-950">
      <svg viewBox="0 0 800 520" className="w-full h-full" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        {marqueeStart && marqueeCurrent && (
            <rect 
                x={Math.min(marqueeStart.x, marqueeCurrent.x)} 
                y={Math.min(marqueeStart.y, marqueeCurrent.y)} 
                width={Math.abs(marqueeCurrent.x - marqueeStart.x)} 
                height={Math.abs(marqueeCurrent.y - marqueeStart.y)} 
                fill="rgba(59, 130, 246, 0.2)" 
                stroke="#3b82f6" 
                strokeDasharray="4 4"
            />
        )}
        {Object.values(underlayImages).map((img) => (
          <g key={img.id} opacity={img.opacity || 0.25}><rect x={img.x} y={img.y} width={120 * (img.scaleX || 1)} height={80 * (img.scaleY || 1)} fill="#334155" stroke="#64748b" /><text x={img.x + 8} y={img.y + 20} fontSize="11" fill="#cbd5e1">Underlay</text></g>
        ))}
        {Object.values(segments).map((seg: any) => {
          const pts = seg.points || [];
          const a = pts[0];
          const b = pts[pts.length - 1];
          if (!a || !b) return null;
          const selected = selectedIds.has(seg.id);
          return <line key={seg.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selected ? '#f59e0b' : Pro2DColors.segment} strokeWidth={selected ? 4 : 3} onClick={() => selectObject(seg.id)} />;
        })}
        {Object.values(inlineItems).map((item: any) => {
          const selected = selectedIds.has(item.id);
          return <g key={item.id} onClick={() => selectObject(item.id)}><circle cx={item.x} cy={item.y} r={selected ? 8 : 6} fill={Pro2DColors.inline} /><text x={item.x + 8} y={item.y - 8} fontSize="10" fill="#f8fafc">{item.type}</text></g>;
        })}
        {Object.values(supports).map((support: any) => {
          const selected = selectedIds.has(support.id);
          return <g key={support.id} onClick={() => selectObject(support.id)}><path d={`M ${support.x-6} ${support.y} L ${support.x+6} ${support.y} M ${support.x} ${support.y-6} L ${support.x} ${support.y+6}`} stroke={selected ? '#f59e0b' : Pro2DColors.support} strokeWidth="2" /><text x={support.x + 8} y={support.y - 8} fontSize="10" fill="#86efac">{support.supportType}</text></g>;
        })}
        {Object.values(fittings).map((fit: any) => {
          const selected = selectedIds.has(fit.id);
          return <g key={fit.id} onClick={() => selectObject(fit.id)}><rect x={fit.x - 6} y={fit.y - 6} width={12} height={12} fill={selected ? '#f59e0b' : Pro2DColors.fitting} /><text x={fit.x + 8} y={fit.y - 8} fontSize="10" fill="#7dd3fc">{fit.type}</text></g>;
        })}
        {snap ? <g><circle cx={snap.pt.x} cy={snap.pt.y} r="5" fill="none" stroke="#22d3ee" /><text x={snap.pt.x + 8} y={snap.pt.y + 8} fontSize="10" fill="#22d3ee">snap:{snap.kind}</text></g> : null}
        <text x="12" y="20" fontSize="12" fill="#94a3b8">Viewport placeholder · active tool: {activeTool}</text>
      </svg>
    </div>
  );
};

export default Smart2Dcanvas_CanvasViewport;
