import React from 'react';
import Smart2Dcanvas_TopToolbar from './Smart2Dcanvas_TopToolbar';
import Smart2Dcanvas_LeftToolRail from './Smart2Dcanvas_LeftToolRail';
import Smart2Dcanvas_PropertyPanel from './Smart2Dcanvas_PropertyPanel';
import Smart2Dcanvas_StatusBar from './Smart2Dcanvas_StatusBar';
import Smart2Dcanvas_CanvasViewport from './Smart2Dcanvas_CanvasViewport';
import Smart2Dcanvas_Minimap from './Smart2Dcanvas_Minimap';

/**
 * AppShell is embedded inside a PCF-Studio sub-tab pane.
 * Uses h-full / w-full instead of h-screen / w-screen so it fills
 * the pane container without overflowing the app layout.
 */
const Smart2Dcanvas_AppShell: React.FC = () => {
  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-gray-900 text-white select-none">
      <Smart2Dcanvas_TopToolbar />

      <div className="flex flex-1 overflow-hidden relative">
        <Smart2Dcanvas_LeftToolRail />

        <div className="flex-1 relative bg-gray-800 overflow-hidden">
          <Smart2Dcanvas_Minimap />
          <Smart2Dcanvas_CanvasViewport />
        </div>

        <Smart2Dcanvas_PropertyPanel />
      </div>

      <Smart2Dcanvas_StatusBar />
    </div>
  );
};

export default Smart2Dcanvas_AppShell;
