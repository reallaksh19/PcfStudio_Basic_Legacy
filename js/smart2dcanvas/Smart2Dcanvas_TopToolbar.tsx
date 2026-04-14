import React from 'react';
import { useSceneStore } from './Smart2Dcanvas_SceneStore';
import type { ToolType } from './Smart2Dcanvas_SceneStore';
import {
  MousePointer2, Move, Minus, Activity, Spline,
  Undo2, Redo2, Download, Trash2, ChevronLeft, ChevronRight, Plus, CornerUpRight, Layers,
  Magnet, Lock
} from 'lucide-react';
import { Smart2Dcanvas_ExportCSV } from './Smart2Dcanvas_ExportService';
import { processAutoFittings } from './Smart2Dcanvas_AutoFittings';
import { processAutoPropagate } from './Smart2Dcanvas_AutoPropagate';
import { v4 as uuidv4 } from 'uuid';

const drawTools: { id: ToolType; icon: React.ReactNode; label: string }[] = [
  { id: 'select',   icon: <MousePointer2 size={18} />, label: 'Select (S)' },
  { id: 'pan',      icon: <Move size={18} />,          label: 'Pan (P)' },
  { id: 'line',     icon: <Minus size={18} />,         label: 'Line (L)' },
  { id: 'polyline', icon: <Activity size={18} />,      label: 'Polyline' },
  { id: 'spline',   icon: <Spline size={18} />,        label: 'Spline' },
];

const inlineTools: { id: ToolType; label: string; color: string }[] = [
  { id: 'support', label: 'Sup', color: 'text-green-300 hover:bg-green-700' },
  { id: 'valve',   label: 'VLV', color: 'text-yellow-300 hover:bg-yellow-700' },
  { id: 'flange',  label: 'FLG', color: 'text-orange-300 hover:bg-orange-700' },
  { id: 'fvf',     label: 'FVF', color: 'text-pink-300 hover:bg-pink-700' },
  { id: 'reducer', label: 'RED', color: 'text-indigo-300 hover:bg-indigo-700' },
];

const Divider = () => <div className="w-px h-6 bg-gray-700 mx-2 shrink-0" />;
const GroupLabel = ({ children }: { children: string }) => (
  <span className="text-[10px] text-gray-600 uppercase tracking-wide mr-1 select-none">{children}</span>
);

const Smart2Dcanvas_TopToolbar: React.FC = () => {
  const activeTool      = useSceneStore((state) => state.activeTool);
  const setActiveTool   = useSceneStore((state) => state.setActiveTool);
  const isOrtho         = useSceneStore((state) => state.isOrtho);
  const setOrtho        = useSceneStore((state) => state.setOrtho);
  const isOsnap         = useSceneStore((state) => state.isOsnap);
  const setOsnap        = useSceneStore((state) => state.setOsnap);
  const undo            = useSceneStore((state) => state.undo);
  const redo            = useSceneStore((state) => state.redo);
  const history         = useSceneStore((state) => state.history);
  const future          = useSceneStore((state) => state.future);
  const currentElevation = useSceneStore((state) => state.currentElevation);
  const setCurrentElevation = useSceneStore((state) => state.setCurrentElevation);
  const selectNext      = useSceneStore((state) => state.selectNext);
  const selectPrev      = useSceneStore((state) => state.selectPrev);
  const deleteSelected  = useSceneStore((state) => state.deleteSelected);
  const selectedIds     = useSceneStore((state) => state.selectedIds);
  const segments        = useSceneStore((state) => state.segments);
  const addSegment      = useSceneStore((state) => state.addSegment);

  const handleElevationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) setCurrentElevation(val);
  };

  const handleAddRiser = () => {
    if (selectedIds.size === 1) {
      const segId = Array.from(selectedIds)[0];
      const seg = segments[segId];
      if (seg && seg.points.length > 0) {
        const lastPt = seg.points[seg.points.length - 1];
        addSegment({
          id: uuidv4(),
          startNodeId: uuidv4(),
          endNodeId: uuidv4(),
          geometryKind: 'line',
          points: [
            { id: uuidv4(), x: lastPt.x, y: lastPt.y, z: lastPt.z || 0 },
            { id: uuidv4(), x: lastPt.x, y: lastPt.y, z: currentElevation },
          ],
        });
      }
    }
  };

  const toolBtn = (id: ToolType, icon: React.ReactNode, label: string) => (
    <button
      key={id}
      onClick={() => setActiveTool(id)}
      className={`p-2 rounded hover:bg-gray-700 transition-colors ${
        activeTool === id ? 'bg-blue-600 hover:bg-blue-600 text-white' : 'text-gray-300'
      }`}
      title={label}
    >
      {icon}
    </button>
  );

  const toggleBtn = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string) => (
    <button
      onClick={onClick}
      className={`p-2 rounded transition-colors ${
        active ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'text-gray-400 hover:bg-gray-700'
      }`}
      title={label}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex items-center h-12 bg-gray-800 border-b border-gray-700 px-3 shrink-0 flex-wrap gap-y-1 overflow-x-auto">
      <div className="text-sm font-bold text-blue-400 mr-3 shrink-0">Smart 2D</div>

      {/* Draw group */}
      <GroupLabel>Draw</GroupLabel>
      <div className="flex items-center space-x-0.5">
        {drawTools.map((t) => toolBtn(t.id, t.icon, t.label))}
      </div>

      <Divider />

      {/* Inline fittings group */}
      <GroupLabel>Inline</GroupLabel>
      <div className="flex items-center space-x-0.5">
        {inlineTools.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTool(t.id)}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
              activeTool === t.id
                ? 'bg-blue-600 text-white'
                : `${t.color} hover:text-white`
            }`}
            title={t.id.charAt(0).toUpperCase() + t.id.slice(1)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Divider />

      {/* Auto group */}
      <GroupLabel>Auto</GroupLabel>
      <div className="flex items-center space-x-0.5">
        <button
          onClick={() => processAutoFittings()}
          className="p-2 rounded hover:bg-indigo-600 text-indigo-300 hover:text-white transition-colors"
          title="Auto Pipe Fittings (Detect 90/45 Bends & Tees)"
        >
          <CornerUpRight size={18} />
        </button>
        <button
          onClick={() => processAutoPropagate()}
          className="p-2 rounded hover:bg-fuchsia-600 text-fuchsia-300 hover:text-white transition-colors"
          title="Auto Propagate (Bore/WT/Temp/Pressure down branches)"
        >
          <Layers size={18} />
        </button>
      </div>

      <Divider />

      {/* Aids group */}
      <GroupLabel>Aids</GroupLabel>
      <div className="flex items-center space-x-0.5">
        {toggleBtn(isOrtho, () => setOrtho(!isOrtho), <Lock size={16} />, `Ortho (F8) — ${isOrtho ? 'ON' : 'OFF'}`)}
        {toggleBtn(isOsnap, () => setOsnap(!isOsnap), <Magnet size={16} />, `OSnap (F3) — ${isOsnap ? 'ON' : 'OFF'}`)}
      </div>

      <Divider />

      {/* History group */}
      <GroupLabel>History</GroupLabel>
      <div className="flex items-center space-x-0.5">
        <button
          onClick={undo}
          disabled={history.length === 0}
          className="p-2 rounded hover:bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={`Undo (Ctrl+Z) — ${history.length} step${history.length !== 1 ? 's' : ''}`}
        >
          <Undo2 size={18} />
        </button>
        <button
          onClick={redo}
          disabled={future.length === 0}
          className="p-2 rounded hover:bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={`Redo (Ctrl+Y) — ${future.length} step${future.length !== 1 ? 's' : ''}`}
        >
          <Redo2 size={18} />
        </button>
      </div>

      <Divider />

      {/* Selection/Edit group */}
      <div className="flex items-center space-x-0.5">
        <button onClick={selectPrev} className="p-2 rounded hover:bg-gray-700 text-gray-300" title="Select Previous">
          <ChevronLeft size={18} />
        </button>
        <button onClick={selectNext} className="p-2 rounded hover:bg-gray-700 text-gray-300" title="Select Next">
          <ChevronRight size={18} />
        </button>
        <button onClick={deleteSelected} className="p-2 rounded hover:bg-red-900/50 text-red-400 transition-colors" title="Delete Selected">
          <Trash2 size={18} />
        </button>
      </div>

      <Divider />

      {/* View group */}
      <GroupLabel>View</GroupLabel>
      <div className="flex items-center space-x-1">
        <span className="text-xs text-gray-400">EL (Z):</span>
        <input
          type="number"
          value={currentElevation}
          onChange={handleElevationChange}
          className="w-16 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleAddRiser}
          className="p-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          title="Add Vertical Riser to Selected"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1" />

      {/* Export */}
      <button
        onClick={Smart2Dcanvas_ExportCSV}
        className="flex items-center space-x-1 px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors shrink-0"
        title="Export CSV"
      >
        <Download size={15} />
        <span>Export CSV</span>
      </button>
    </div>
  );
};

export default Smart2Dcanvas_TopToolbar;
