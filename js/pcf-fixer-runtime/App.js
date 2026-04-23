import React, { useState, useEffect } from 'react';
import { StatusBar } from './ui/components/StatusBar.js';
import { DataTableTab } from './ui/tabs/DataTableTab.js';
import { CoreProcessorTab } from './ui/tabs/CoreProcessorTab.js';
import { ConfigTab } from './ui/tabs/ConfigTab.js';
import { OutputTab } from './ui/tabs/OutputTab.js';
import { CanvasTab } from './ui/tabs/CanvasTab.js';
import { DrawCanvasTab } from './ui/tabs/DrawCanvasTab.js';
import { AppProvider, useAppContext } from './store/AppContext.js';
import { useStore } from './store/useStore.js';
import { jsx as _jsx, jsxs as _jsxs } from "./jsx-runtime.js";
function MainApp() {
  const [activeTab, setActiveTab] = useState('data');
  const [activeStage, setActiveStage] = useState('1');
  const {
    state,
    dispatch
  } = useAppContext();
  const setZustandData = useStore(s => s.setDataTable);
  const isDrawMode = useStore(s => s.isDrawMode);

  // Auto-sync: whenever stage2Data changes in AppContext, mirror it to Zustand.
  // This removes the need for every call-site to manually call setZustandData().
  // StatusBar still calls setZustandData() for immediate-render purposes; this
  // effect acts as a safety net so the 3D canvas never falls behind.
React.useEffect(() => {
    if (state.stage2Data && state.stage2Data.length > 0) {
      setZustandData(prev => {
        if (prev && prev.length === state.stage2Data.length) return prev;
        return state.stage2Data;
      });
    }
  }, [state.stage2Data, setZustandData]);

  // Hook for external applications to inject data directly into the fixer.
  React.useEffect(() => {
    window.__pcfSetDataTable = rows => {
      useStore.getState().setExternalDataTable(rows);
    };
    const handleExternalData = e => {
      // When external data is loaded via window.__pcfSetDataTable, sync it to AppContext as well
      const components = e.detail.components;
      dispatch({
        type: "SET_DATA_TABLE",
        payload: components
      });
      dispatch({
        type: "SET_STAGE_2_DATA",
        payload: components
      });
      setActiveTab('data'); // Show Data Table tab (valid key in this app)
    };
    window.addEventListener('external-data-loaded', handleExternalData);

    // Late-mount recovery: if external rows were pushed before PCF Fixer mounted,
    // consume the pending payload now so Data Table is populated.
    if (Array.isArray(window.__pcfPendingDataTable) && window.__pcfPendingDataTable.length > 0) {
      const pending = window.__pcfPendingDataTable;
      window.__pcfPendingDataTable = null;
      window.__pcfSetDataTable(pending);
    }
    return () => {
      delete window.__pcfSetDataTable;
      window.removeEventListener('external-data-loaded', handleExternalData);
    };
  }, [dispatch]);
  return _jsxs("div", {
    className: "min-h-screen bg-slate-100 font-sans flex flex-col pb-12",
    children: [_jsxs("main", {
      className: `flex-1 w-full max-w-none ${activeTab === 'canvas' ? 'px-1 py-2' : 'px-3 py-4'}`,
      children: [_jsxs("div", {
        className: "flex space-x-1 border-b border-slate-300 mb-6",
        children: [_jsx("button", {
          onClick: () => setActiveTab('data'),
          className: `px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'data' ? 'border-blue-600 text-blue-700 bg-white rounded-t' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`,
          children: "Data Table"
        }), _jsx("button", {
          onClick: () => setActiveTab('core'),
          className: `px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'core' ? 'border-blue-600 text-blue-700 bg-white rounded-t' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`,
          children: "Core processor"
        }), _jsxs("button", {
          onClick: () => setActiveTab('canvas'),
          className: `px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-1 ${activeTab === 'canvas' ? 'border-blue-600 text-blue-700 bg-white rounded-t' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`,
          children: [_jsx("span", {
            children: "3D Topology"
          }), _jsx("span", {
            className: "bg-blue-100 text-blue-700 py-0.5 px-1.5 rounded text-[10px] uppercase font-bold",
            children: "New"
          })]
        }), _jsx("button", {
          onClick: () => setActiveTab('config'),
          className: `px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'config' ? 'border-blue-600 text-blue-700 bg-white rounded-t' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`,
          children: "Config"
        }), _jsx("button", {
          onClick: () => setActiveTab('output'),
          className: `px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'output' ? 'border-blue-600 text-blue-700 bg-white rounded-t' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`,
          children: "Output"
        })]
      }), _jsxs("div", {
        className: `bg-white rounded shadow-sm border border-slate-200 ${activeTab === 'canvas' ? 'min-h-[calc(100vh-160px)]' : 'min-h-[500px]'}`,
        children: [activeTab === 'data' && _jsxs("div", {
          className: "flex flex-col",
          children: [_jsxs("div", {
            className: "bg-slate-100 p-2 border-b border-slate-200 flex space-x-2",
            children: [_jsx("button", {
              onClick: () => setActiveStage('1'),
              className: `px-3 py-1 text-sm font-medium rounded ${activeStage === '1' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`,
              children: "Stage 1: Syntax & Base Data"
            }), _jsx("button", {
              onClick: () => setActiveStage('2'),
              className: `px-3 py-1 text-sm font-medium rounded ${activeStage === '2' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`,
              children: "Stage 2: Topology & Fixing"
            }), _jsx("button", {
              onClick: () => setActiveStage('3'),
              className: `px-3 py-1 text-sm font-medium rounded ${activeStage === '3' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`,
              children: "Stage 3: Final Checks (Pending)"
            })]
          }), _jsx("div", {
            className: "p-2",
            children: _jsx(DataTableTab, {
              stage: activeStage
            })
          })]
        }), activeTab === 'core' && _jsx("div", {
          className: "p-4",
          children: _jsx(CoreProcessorTab, {})
        }), activeTab === 'canvas' && _jsx("div", {
          className: "p-0 h-full",
          children: isDrawMode ? _jsx(DrawCanvasTab, {}) : _jsx(CanvasTab, {})
        }), activeTab === 'config' && _jsx(ConfigTab, {}), activeTab === 'output' && _jsx(OutputTab, {})]
      })]
    }), _jsx(StatusBar, {
      activeTab: activeTab,
      activeStage: activeStage
    })]
  });
}
export default function App() {
  return _jsx(AppProvider, {
    children: _jsx(MainApp, {})
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsInVzZVN0YXRlIiwidXNlRWZmZWN0IiwiU3RhdHVzQmFyIiwiRGF0YVRhYmxlVGFiIiwiQ29yZVByb2Nlc3NvclRhYiIsIkNvbmZpZ1RhYiIsIk91dHB1dFRhYiIsIkNhbnZhc1RhYiIsIkRyYXdDYW52YXNUYWIiLCJBcHBQcm92aWRlciIsInVzZUFwcENvbnRleHQiLCJ1c2VTdG9yZSIsImpzeCIsIl9qc3giLCJqc3hzIiwiX2pzeHMiLCJNYWluQXBwIiwiYWN0aXZlVGFiIiwic2V0QWN0aXZlVGFiIiwiYWN0aXZlU3RhZ2UiLCJzZXRBY3RpdmVTdGFnZSIsInN0YXRlIiwiZGlzcGF0Y2giLCJzZXRadXN0YW5kRGF0YSIsInMiLCJzZXREYXRhVGFibGUiLCJpc0RyYXdNb2RlIiwic3RhZ2UyRGF0YSIsImxlbmd0aCIsIndpbmRvdyIsIl9fcGNmU2V0RGF0YVRhYmxlIiwicm93cyIsImdldFN0YXRlIiwic2V0RXh0ZXJuYWxEYXRhVGFibGUiLCJoYW5kbGVFeHRlcm5hbERhdGEiLCJlIiwiY29tcG9uZW50cyIsImRldGFpbCIsInR5cGUiLCJwYXlsb2FkIiwiYWRkRXZlbnRMaXN0ZW5lciIsIkFycmF5IiwiaXNBcnJheSIsIl9fcGNmUGVuZGluZ0RhdGFUYWJsZSIsInBlbmRpbmciLCJyZW1vdmVFdmVudExpc3RlbmVyIiwiY2xhc3NOYW1lIiwiY2hpbGRyZW4iLCJvbkNsaWNrIiwic3RhZ2UiLCJBcHAiXSwic291cmNlcyI6WyJBcHAuanN4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBSZWFjdCwgeyB1c2VTdGF0ZSwgdXNlRWZmZWN0IH0gZnJvbSAncmVhY3QnO1xuaW1wb3J0IHsgU3RhdHVzQmFyIH0gZnJvbSAnLi91aS9jb21wb25lbnRzL1N0YXR1c0Jhcic7XG5pbXBvcnQgeyBEYXRhVGFibGVUYWIgfSBmcm9tICcuL3VpL3RhYnMvRGF0YVRhYmxlVGFiJztcbmltcG9ydCB7IENvcmVQcm9jZXNzb3JUYWIgfSBmcm9tICcuL3VpL3RhYnMvQ29yZVByb2Nlc3NvclRhYic7XG5pbXBvcnQgeyBDb25maWdUYWIgfSBmcm9tICcuL3VpL3RhYnMvQ29uZmlnVGFiJztcbmltcG9ydCB7IE91dHB1dFRhYiB9IGZyb20gJy4vdWkvdGFicy9PdXRwdXRUYWInO1xuaW1wb3J0IHsgQ2FudmFzVGFiIH0gZnJvbSAnLi91aS90YWJzL0NhbnZhc1RhYic7XG5pbXBvcnQgeyBEcmF3Q2FudmFzVGFiIH0gZnJvbSAnLi91aS90YWJzL0RyYXdDYW52YXNUYWInO1xuXG5pbXBvcnQgeyBBcHBQcm92aWRlciwgdXNlQXBwQ29udGV4dCB9IGZyb20gJy4vc3RvcmUvQXBwQ29udGV4dCc7XG5pbXBvcnQgeyB1c2VTdG9yZSB9IGZyb20gJy4vc3RvcmUvdXNlU3RvcmUnO1xuXG5mdW5jdGlvbiBNYWluQXBwKCkge1xuICBjb25zdCBbYWN0aXZlVGFiLCBzZXRBY3RpdmVUYWJdID0gdXNlU3RhdGUoJ2RhdGEnKTtcbiAgY29uc3QgW2FjdGl2ZVN0YWdlLCBzZXRBY3RpdmVTdGFnZV0gPSB1c2VTdGF0ZSgnMScpO1xuICBjb25zdCB7IHN0YXRlLCBkaXNwYXRjaCB9ID0gdXNlQXBwQ29udGV4dCgpO1xuICBjb25zdCBzZXRadXN0YW5kRGF0YSA9IHVzZVN0b3JlKHMgPT4gcy5zZXREYXRhVGFibGUpO1xuICBjb25zdCBpc0RyYXdNb2RlID0gdXNlU3RvcmUocyA9PiBzLmlzRHJhd01vZGUpO1xuXG4gIC8vIEF1dG8tc3luYzogd2hlbmV2ZXIgc3RhZ2UyRGF0YSBjaGFuZ2VzIGluIEFwcENvbnRleHQsIG1pcnJvciBpdCB0byBadXN0YW5kLlxuICAvLyBUaGlzIHJlbW92ZXMgdGhlIG5lZWQgZm9yIGV2ZXJ5IGNhbGwtc2l0ZSB0byBtYW51YWxseSBjYWxsIHNldFp1c3RhbmREYXRhKCkuXG4gIC8vIFN0YXR1c0JhciBzdGlsbCBjYWxscyBzZXRadXN0YW5kRGF0YSgpIGZvciBpbW1lZGlhdGUtcmVuZGVyIHB1cnBvc2VzOyB0aGlzXG4gIC8vIGVmZmVjdCBhY3RzIGFzIGEgc2FmZXR5IG5ldCBzbyB0aGUgM0QgY2FudmFzIG5ldmVyIGZhbGxzIGJlaGluZC5cbiAgUmVhY3QudXNlRWZmZWN0KCgpID0+IHtcbiAgICBpZiAoc3RhdGUuc3RhZ2UyRGF0YSAmJiBzdGF0ZS5zdGFnZTJEYXRhLmxlbmd0aCA+IDApIHtcbiAgICAgIHNldFp1c3RhbmREYXRhKHN0YXRlLnN0YWdlMkRhdGEpO1xuICAgIH1cbiAgfSwgW3N0YXRlLnN0YWdlMkRhdGEsIHNldFp1c3RhbmREYXRhXSk7XG5cbiAgLy8gSG9vayBmb3IgZXh0ZXJuYWwgYXBwbGljYXRpb25zIHRvIGluamVjdCBkYXRhIGRpcmVjdGx5IGludG8gdGhlIGZpeGVyLlxuICBSZWFjdC51c2VFZmZlY3QoKCkgPT4ge1xuICAgICAgd2luZG93Ll9fcGNmU2V0RGF0YVRhYmxlID0gKHJvd3MpID0+IHtcbiAgICAgICAgICB1c2VTdG9yZS5nZXRTdGF0ZSgpLnNldEV4dGVybmFsRGF0YVRhYmxlKHJvd3MpO1xuICAgICAgfTtcblxuICAgICAgY29uc3QgaGFuZGxlRXh0ZXJuYWxEYXRhID0gKGUpID0+IHtcbiAgICAgICAgICAvLyBXaGVuIGV4dGVybmFsIGRhdGEgaXMgbG9hZGVkIHZpYSB3aW5kb3cuX19wY2ZTZXREYXRhVGFibGUsIHN5bmMgaXQgdG8gQXBwQ29udGV4dCBhcyB3ZWxsXG4gICAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IGUuZGV0YWlsLmNvbXBvbmVudHM7XG4gICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIlNFVF9EQVRBX1RBQkxFXCIsIHBheWxvYWQ6IGNvbXBvbmVudHMgfSk7XG4gICAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIlNFVF9TVEFHRV8yX0RBVEFcIiwgcGF5bG9hZDogY29tcG9uZW50cyB9KTtcbiAgICAgICAgICBzZXRBY3RpdmVUYWIoJ2RhdGEnKTsgLy8gU2hvdyBEYXRhIFRhYmxlIHRhYiAodmFsaWQga2V5IGluIHRoaXMgYXBwKVxuICAgICAgfTtcbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdleHRlcm5hbC1kYXRhLWxvYWRlZCcsIGhhbmRsZUV4dGVybmFsRGF0YSk7XG5cbiAgICAgIC8vIExhdGUtbW91bnQgcmVjb3Zlcnk6IGlmIGV4dGVybmFsIHJvd3Mgd2VyZSBwdXNoZWQgYmVmb3JlIFBDRiBGaXhlciBtb3VudGVkLFxuICAgICAgLy8gY29uc3VtZSB0aGUgcGVuZGluZyBwYXlsb2FkIG5vdyBzbyBEYXRhIFRhYmxlIGlzIHBvcHVsYXRlZC5cbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHdpbmRvdy5fX3BjZlBlbmRpbmdEYXRhVGFibGUpICYmIHdpbmRvdy5fX3BjZlBlbmRpbmdEYXRhVGFibGUubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHBlbmRpbmcgPSB3aW5kb3cuX19wY2ZQZW5kaW5nRGF0YVRhYmxlO1xuICAgICAgICAgIHdpbmRvdy5fX3BjZlBlbmRpbmdEYXRhVGFibGUgPSBudWxsO1xuICAgICAgICAgIHdpbmRvdy5fX3BjZlNldERhdGFUYWJsZShwZW5kaW5nKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuICgpID0+IHtcbiAgICAgICAgICBkZWxldGUgd2luZG93Ll9fcGNmU2V0RGF0YVRhYmxlO1xuICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdleHRlcm5hbC1kYXRhLWxvYWRlZCcsIGhhbmRsZUV4dGVybmFsRGF0YSk7XG4gICAgICB9O1xuICB9LCBbZGlzcGF0Y2hdKTtcblxuICByZXR1cm4gKFxuICAgIDxkaXYgY2xhc3NOYW1lPVwibWluLWgtc2NyZWVuIGJnLXNsYXRlLTEwMCBmb250LXNhbnMgZmxleCBmbGV4LWNvbCBwYi0xMlwiPlxuICAgICAgPG1haW4gY2xhc3NOYW1lPXtgZmxleC0xIHctZnVsbCBtYXgtdy1ub25lICR7YWN0aXZlVGFiID09PSAnY2FudmFzJyA/ICdweC0xIHB5LTInIDogJ3B4LTMgcHktNCd9YH0+XG5cbiAgICAgICAgey8qIFRhYiBOYXZpZ2F0aW9uICovfVxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggc3BhY2UteC0xIGJvcmRlci1iIGJvcmRlci1zbGF0ZS0zMDAgbWItNlwiPlxuICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHNldEFjdGl2ZVRhYignZGF0YScpfVxuICAgICAgICAgICAgY2xhc3NOYW1lPXtgcHgtNCBweS0yIGZvbnQtbWVkaXVtIHRleHQtc20gYm9yZGVyLWItMiB0cmFuc2l0aW9uLWNvbG9ycyAke2FjdGl2ZVRhYiA9PT0gJ2RhdGEnID8gJ2JvcmRlci1ibHVlLTYwMCB0ZXh0LWJsdWUtNzAwIGJnLXdoaXRlIHJvdW5kZWQtdCcgOiAnYm9yZGVyLXRyYW5zcGFyZW50IHRleHQtc2xhdGUtNTAwIGhvdmVyOnRleHQtc2xhdGUtNzAwIGhvdmVyOmJnLXNsYXRlLTUwJ31gfVxuICAgICAgICAgID5cbiAgICAgICAgICAgIERhdGEgVGFibGVcbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICA8YnV0dG9uXG4gICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiBzZXRBY3RpdmVUYWIoJ2NvcmUnKX1cbiAgICAgICAgICAgIGNsYXNzTmFtZT17YHB4LTQgcHktMiBmb250LW1lZGl1bSB0ZXh0LXNtIGJvcmRlci1iLTIgdHJhbnNpdGlvbi1jb2xvcnMgJHthY3RpdmVUYWIgPT09ICdjb3JlJyA/ICdib3JkZXItYmx1ZS02MDAgdGV4dC1ibHVlLTcwMCBiZy13aGl0ZSByb3VuZGVkLXQnIDogJ2JvcmRlci10cmFuc3BhcmVudCB0ZXh0LXNsYXRlLTUwMCBob3Zlcjp0ZXh0LXNsYXRlLTcwMCBob3ZlcjpiZy1zbGF0ZS01MCd9YH1cbiAgICAgICAgICA+XG4gICAgICAgICAgICBDb3JlIHByb2Nlc3NvclxuICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHNldEFjdGl2ZVRhYignY2FudmFzJyl9XG4gICAgICAgICAgICBjbGFzc05hbWU9e2BweC00IHB5LTIgZm9udC1tZWRpdW0gdGV4dC1zbSBib3JkZXItYi0yIHRyYW5zaXRpb24tY29sb3JzIGZsZXggaXRlbXMtY2VudGVyIGdhcC0xICR7YWN0aXZlVGFiID09PSAnY2FudmFzJyA/ICdib3JkZXItYmx1ZS02MDAgdGV4dC1ibHVlLTcwMCBiZy13aGl0ZSByb3VuZGVkLXQnIDogJ2JvcmRlci10cmFuc3BhcmVudCB0ZXh0LXNsYXRlLTUwMCBob3Zlcjp0ZXh0LXNsYXRlLTcwMCBob3ZlcjpiZy1zbGF0ZS01MCd9YH1cbiAgICAgICAgICA+XG4gICAgICAgICAgICA8c3Bhbj4zRCBUb3BvbG9neTwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImJnLWJsdWUtMTAwIHRleHQtYmx1ZS03MDAgcHktMC41IHB4LTEuNSByb3VuZGVkIHRleHQtWzEwcHhdIHVwcGVyY2FzZSBmb250LWJvbGRcIj5OZXc8L3NwYW4+XG4gICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgPGJ1dHRvblxuICAgICAgICAgICAgb25DbGljaz17KCkgPT4gc2V0QWN0aXZlVGFiKCdjb25maWcnKX1cbiAgICAgICAgICAgIGNsYXNzTmFtZT17YHB4LTQgcHktMiBmb250LW1lZGl1bSB0ZXh0LXNtIGJvcmRlci1iLTIgdHJhbnNpdGlvbi1jb2xvcnMgJHthY3RpdmVUYWIgPT09ICdjb25maWcnID8gJ2JvcmRlci1ibHVlLTYwMCB0ZXh0LWJsdWUtNzAwIGJnLXdoaXRlIHJvdW5kZWQtdCcgOiAnYm9yZGVyLXRyYW5zcGFyZW50IHRleHQtc2xhdGUtNTAwIGhvdmVyOnRleHQtc2xhdGUtNzAwIGhvdmVyOmJnLXNsYXRlLTUwJ31gfVxuICAgICAgICAgID5cbiAgICAgICAgICAgIENvbmZpZ1xuICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHNldEFjdGl2ZVRhYignb3V0cHV0Jyl9XG4gICAgICAgICAgICBjbGFzc05hbWU9e2BweC00IHB5LTIgZm9udC1tZWRpdW0gdGV4dC1zbSBib3JkZXItYi0yIHRyYW5zaXRpb24tY29sb3JzICR7YWN0aXZlVGFiID09PSAnb3V0cHV0JyA/ICdib3JkZXItYmx1ZS02MDAgdGV4dC1ibHVlLTcwMCBiZy13aGl0ZSByb3VuZGVkLXQnIDogJ2JvcmRlci10cmFuc3BhcmVudCB0ZXh0LXNsYXRlLTUwMCBob3Zlcjp0ZXh0LXNsYXRlLTcwMCBob3ZlcjpiZy1zbGF0ZS01MCd9YH1cbiAgICAgICAgICA+XG4gICAgICAgICAgICBPdXRwdXRcbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgey8qIFRhYiBDb250ZW50ICovfVxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT17YGJnLXdoaXRlIHJvdW5kZWQgc2hhZG93LXNtIGJvcmRlciBib3JkZXItc2xhdGUtMjAwICR7YWN0aXZlVGFiID09PSAnY2FudmFzJyA/ICdtaW4taC1bY2FsYygxMDB2aC0xNjBweCldJyA6ICdtaW4taC1bNTAwcHhdJ31gfT5cbiAgICAgICAgICB7YWN0aXZlVGFiID09PSAnZGF0YScgJiYgKFxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGZsZXgtY29sXCI+XG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYmctc2xhdGUtMTAwIHAtMiBib3JkZXItYiBib3JkZXItc2xhdGUtMjAwIGZsZXggc3BhY2UteC0yXCI+XG4gICAgICAgICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4gc2V0QWN0aXZlU3RhZ2UoJzEnKX0gY2xhc3NOYW1lPXtgcHgtMyBweS0xIHRleHQtc20gZm9udC1tZWRpdW0gcm91bmRlZCAke2FjdGl2ZVN0YWdlID09PSAnMScgPyAnYmctYmx1ZS02MDAgdGV4dC13aGl0ZScgOiAnYmctd2hpdGUgdGV4dC1zbGF0ZS02MDAgaG92ZXI6Ymctc2xhdGUtNTAgYm9yZGVyIGJvcmRlci1zbGF0ZS0yMDAnfWB9PlN0YWdlIDE6IFN5bnRheCAmIEJhc2UgRGF0YTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IHNldEFjdGl2ZVN0YWdlKCcyJyl9IGNsYXNzTmFtZT17YHB4LTMgcHktMSB0ZXh0LXNtIGZvbnQtbWVkaXVtIHJvdW5kZWQgJHthY3RpdmVTdGFnZSA9PT0gJzInID8gJ2JnLWJsdWUtNjAwIHRleHQtd2hpdGUnIDogJ2JnLXdoaXRlIHRleHQtc2xhdGUtNjAwIGhvdmVyOmJnLXNsYXRlLTUwIGJvcmRlciBib3JkZXItc2xhdGUtMjAwJ31gfT5TdGFnZSAyOiBUb3BvbG9neSAmIEZpeGluZzwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9eygpID0+IHNldEFjdGl2ZVN0YWdlKCczJyl9IGNsYXNzTmFtZT17YHB4LTMgcHktMSB0ZXh0LXNtIGZvbnQtbWVkaXVtIHJvdW5kZWQgJHthY3RpdmVTdGFnZSA9PT0gJzMnID8gJ2JnLWJsdWUtNjAwIHRleHQtd2hpdGUnIDogJ2JnLXdoaXRlIHRleHQtc2xhdGUtNjAwIGhvdmVyOmJnLXNsYXRlLTUwIGJvcmRlciBib3JkZXItc2xhdGUtMjAwJ31gfT5TdGFnZSAzOiBGaW5hbCBDaGVja3MgKFBlbmRpbmcpPC9idXR0b24+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInAtMlwiPlxuICAgICAgICAgICAgICAgIDxEYXRhVGFibGVUYWIgc3RhZ2U9e2FjdGl2ZVN0YWdlfSAvPlxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICl9XG4gICAgICAgICAge2FjdGl2ZVRhYiA9PT0gJ2NvcmUnICYmIDxkaXYgY2xhc3NOYW1lPVwicC00XCI+PENvcmVQcm9jZXNzb3JUYWIgLz48L2Rpdj59XG4gICAgICAgICAge2FjdGl2ZVRhYiA9PT0gJ2NhbnZhcycgJiYgPGRpdiBjbGFzc05hbWU9XCJwLTAgaC1mdWxsXCI+e2lzRHJhd01vZGUgPyA8RHJhd0NhbnZhc1RhYiAvPiA6IDxDYW52YXNUYWIgLz59PC9kaXY+fVxuICAgICAgICAgIHthY3RpdmVUYWIgPT09ICdjb25maWcnICYmIDxDb25maWdUYWIgLz59XG4gICAgICAgICAge2FjdGl2ZVRhYiA9PT0gJ291dHB1dCcgJiYgPE91dHB1dFRhYiAvPn1cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L21haW4+XG5cbiAgICAgIHsvKiBTaG93IHN0YXR1cyBiYXIgZXZlcnl3aGVyZSBzbyB0aGUgbW9jayBkYXRhIGJ1dHRvbiBpcyBhbHdheXMgYWNjZXNzaWJsZSAqL31cbiAgICAgIDxTdGF0dXNCYXIgYWN0aXZlVGFiPXthY3RpdmVUYWJ9IGFjdGl2ZVN0YWdlPXthY3RpdmVTdGFnZX0gLz5cbiAgICA8L2Rpdj5cbiAgKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gQXBwKCkge1xuICByZXR1cm4gKFxuICAgIDxBcHBQcm92aWRlcj5cbiAgICAgIDxNYWluQXBwIC8+XG4gICAgPC9BcHBQcm92aWRlcj5cbiAgKTtcbn1cbiJdLCJtYXBwaW5ncyI6IkFBQUEsT0FBT0EsS0FBSyxJQUFJQyxRQUFRLEVBQUVDLFNBQVMsUUFBUSxPQUFPO0FBQ2xELFNBQVNDLFNBQVMsUUFBUSwyQkFBMkI7QUFDckQsU0FBU0MsWUFBWSxRQUFRLHdCQUF3QjtBQUNyRCxTQUFTQyxnQkFBZ0IsUUFBUSw0QkFBNEI7QUFDN0QsU0FBU0MsU0FBUyxRQUFRLHFCQUFxQjtBQUMvQyxTQUFTQyxTQUFTLFFBQVEscUJBQXFCO0FBQy9DLFNBQVNDLFNBQVMsUUFBUSxxQkFBcUI7QUFDL0MsU0FBU0MsYUFBYSxRQUFRLHlCQUF5QjtBQUV2RCxTQUFTQyxXQUFXLEVBQUVDLGFBQWEsUUFBUSxvQkFBb0I7QUFDL0QsU0FBU0MsUUFBUSxRQUFRLGtCQUFrQjtBQUFDLFNBQUFDLEdBQUEsSUFBQUMsSUFBQSxFQUFBQyxJQUFBLElBQUFDLEtBQUE7QUFFNUMsU0FBU0MsT0FBT0EsQ0FBQSxFQUFH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