import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line, Group } from 'react-konva';
import { useSceneStore } from './Smart2Dcanvas_SceneStore';
import { Maximize2, Minimize2, Expand, SlidersHorizontal, RotateCcw } from 'lucide-react';

const Smart2Dcanvas_Minimap: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Independent internal state
  const [localPan, setLocalPan] = useState({ x: 0, y: 0 });
  const [localScale, setLocalScale] = useState(0.1);
  const [localRotation, setLocalRotation] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const stageContainerRef = useRef<HTMLDivElement>(null);

  const segments = useSceneStore((state) => state.segments);
  const selectedIds = useSceneStore((state) => state.selectedIds);
  
  // Master canvas properties to render the red viewport box
  const masterPanX = useSceneStore((state) => state.panX);
  const masterPanY = useSceneStore((state) => state.panY);
  const masterScale = useSceneStore((state) => state.scale);

  // Dimensions
  const width = isFullscreen ? window.innerWidth - 64 : 250;
  const height = isFullscreen ? window.innerHeight - 150 : 200;

  useEffect(() => {
    const el = stageContainerRef.current;
    if (!el) return;
    const nativeHandler = (e: WheelEvent) => {
      e.preventDefault();
      const stage = (el.querySelector('canvas') as any)?.__konvaNode?.getStage?.();
      if (!stage) return;
      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      };
      const newScale = e.deltaY < 0 ? oldScale * 1.1 : oldScale / 1.1;
      setLocalScale(newScale);
      setLocalPan({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
    };
    el.addEventListener('wheel', nativeHandler, { passive: false });
    return () => el.removeEventListener('wheel', nativeHandler);
  }, []);

  const handleWheel = (e: any) => {
    // preventDefault handled by native listener above
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * 1.1 : oldScale / 1.1;
    setLocalScale(newScale);

    setLocalPan({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const handlePointerDown = (e: any) => {
    setIsPanning(true);
    setDragStart({ x: e.evt.clientX, y: e.evt.clientY });
  };

  const handlePointerMove = (e: any) => {
    if (!isPanning) return;
    const dx = e.evt.clientX - dragStart.x;
    const dy = e.evt.clientY - dragStart.y;
    setLocalPan({ x: localPan.x + dx, y: localPan.y + dy });
    setDragStart({ x: e.evt.clientX, y: e.evt.clientY });
  };

  const handlePointerUp = () => setIsPanning(false);

  if (!isExpanded) {
    return (
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={() => setIsExpanded(true)}
          className="p-2 bg-gray-800 border border-gray-700 rounded shadow hover:bg-gray-700 text-gray-400 hover:text-white"
          title="Show Extended Viewport"
        >
          <SlidersHorizontal size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className={`absolute z-30 bg-gray-900 border border-gray-700 rounded shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${isFullscreen ? 'top-12 right-12 bottom-12 left-12' : 'top-4 right-4'}`}>
      
      {/* Header Controller */}
      <div className="flex justify-between items-center bg-gray-800 px-3 py-2 border-b border-gray-600">
        <span className="text-sm font-bold text-gray-300 tracking-wide">Radar Tracking Map</span>
        <div className="flex space-x-3 items-center">
          <button
            onClick={() => setLocalRotation((r) => r - 15)}
            className="text-gray-400 hover:text-blue-400"
            title="Rotate Left (-15deg)"
          >
            <RotateCcw size={16} />
          </button>
          <div className="w-px h-4 bg-gray-600" />
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="text-gray-400 hover:text-green-400"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Expand size={16} />}
          </button>
          <button
            onClick={() => setIsExpanded(false)}
            className="text-gray-400 hover:text-red-400"
            title="Minimize"
          >
            <Minimize2 size={16} />
          </button>
        </div>
      </div>

      <div ref={stageContainerRef} className="flex-1 bg-[#0f172a] relative cursor-move">
        <Stage
           width={width} 
           height={height}
           onWheel={handleWheel}
           onPointerDown={handlePointerDown}
           onPointerMove={handlePointerMove}
           onPointerUp={handlePointerUp}
           onMouseLeave={handlePointerUp}
        >
          <Layer>
            <Group 
              x={localPan.x + width/2} 
              y={localPan.y + height/2} 
              scaleX={localScale} 
              scaleY={localScale}
              rotation={localRotation}
            >
              {Object.values(segments).map((seg) => (
                <Line
                  key={seg.id}
                  points={seg.points.flatMap((p) => [p.x, p.y])}
                  stroke={selectedIds.has(seg.id) ? '#3b82f6' : '#64748b'}
                  strokeWidth={selectedIds.has(seg.id) ? 4 / localScale : 2 / localScale}
                />
              ))}

              {/* Master Viewport Box Indicator */}
              <Line
                points={[
                  -masterPanX / masterScale, -masterPanY / masterScale,
                  (-masterPanX + 1000) / masterScale, -masterPanY / masterScale,
                  (-masterPanX + 1000) / masterScale, (-masterPanY + 800) / masterScale,
                  -masterPanX / masterScale, (-masterPanY + 800) / masterScale,
                  -masterPanX / masterScale, -masterPanY / masterScale,
                ]}
                stroke="red"
                strokeWidth={1.5 / localScale}
                dash={[5 / localScale, 5 / localScale]}
              />
            </Group>
          </Layer>
        </Stage>
      </div>
    </div>
  );
};

export default Smart2Dcanvas_Minimap;
