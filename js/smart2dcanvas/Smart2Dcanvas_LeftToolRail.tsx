import React, { useRef } from 'react';
import { useSceneStore } from './Smart2Dcanvas_SceneStore';
import type { ToolType } from './Smart2Dcanvas_SceneStore';
import { ImagePlus, Anchor, Beaker, AlignJustify, GripHorizontal } from 'lucide-react';

const ValveIcon = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
    <polygon points="1,3 8,8 1,13" />
    <polygon points="15,3 8,8 15,13" />
  </svg>
);
const FlangeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
    <rect x="6" y="2" width="4" height="12" />
  </svg>
);
const FvfIcon = () => (
  <svg width="24" height="20" viewBox="0 0 24 16" fill="currentColor">
    <rect x="1" y="3" width="3" height="10" />
    <polygon points="5,3 11,8 5,13" />
    <polygon points="19,3 13,8 19,13" />
    <rect x="20" y="3" width="3" height="10" />
  </svg>
);
import { v4 as uuidv4 } from 'uuid';

const Smart2Dcanvas_LeftToolRail: React.FC = () => {
  const activeTool = useSceneStore((state) => state.activeTool);
  const setActiveTool = useSceneStore((state) => state.setActiveTool);
  const addUnderlayImage = useSceneStore((state) => state.addUnderlayImage);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          addUnderlayImage({
            id: uuidv4(),
            source: result,
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            opacity: 0.5,
            locked: false,
            width: img.width,
            height: img.height,
          });
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const smartTools: { id: ToolType; icon: React.ReactNode; label: string }[] = [
    { id: 'support', icon: <Anchor size={20} />,         label: 'Support' },
    { id: 'valve',   icon: <ValveIcon />,                label: 'Valve' },
    { id: 'flange',  icon: <FlangeIcon />,               label: 'Flange' },
    { id: 'fvf',     icon: <FvfIcon />,                  label: 'Flange-Valve-Flange' },
  ];

  return (
    <div className="w-14 bg-gray-800 border-r border-gray-700 flex flex-col items-center py-2 space-y-2 shrink-0 z-10">
      {smartTools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          className={`p-2.5 rounded-lg hover:bg-gray-700 transition-colors ${
            activeTool === tool.id ? 'bg-blue-600 hover:bg-blue-600 text-white' : 'text-gray-300'
          }`}
          title={tool.label}
        >
          {tool.icon}
        </button>
      ))}

      <div className="w-8 h-px bg-gray-700 my-2" />

      <button
        onClick={() => fileInputRef.current?.click()}
        className="p-2.5 rounded-lg hover:bg-gray-700 text-gray-300 transition-colors"
        title="Import Image Underlay"
      >
        <ImagePlus size={20} />
      </button>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageImport}
        accept="image/*"
        className="hidden"
      />
    </div>
  );
};

export default Smart2Dcanvas_LeftToolRail;
