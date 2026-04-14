import { create } from 'zustand';

// Decoupled, Atomic Zustand store primarily aimed at driving high-performance
// visual updates for the 3D Canvas without forcing global React Context re-renders.

export const THEME_PRESETS = {
    DARK_INDUSTRIAL: {
        label: 'Dark Industrial',
        backgroundColor: '#020617',
        selectionColor: '#22d3ee',
        selectionOpacity: 0.35,
        hoverColor: '#a78bfa',
        gridColor1: '#1e293b',
        gridColor2: '#0f172a',
        componentColors: {
            PIPE: '#cbd5e1', BEND: '#94a3b8', TEE: '#94a3b8',
            OLET: '#64748b', REDUCER: '#64748b', VALVE: '#3b82f6',
            FLANGE: '#60a5fa', SUPPORT: '#10b981'
        }
    },
    LIGHT_STUDIO: {
        label: 'Light Studio',
        backgroundColor: '#f1f5f9',
        selectionColor: '#2563eb',
        selectionOpacity: 0.4,
        hoverColor: '#7c3aed',
        gridColor1: '#94a3b8',
        gridColor2: '#cbd5e1',
        componentColors: {
            PIPE: '#475569', BEND: '#334155', TEE: '#334155',
            OLET: '#1e293b', REDUCER: '#1e293b', VALVE: '#1d4ed8',
            FLANGE: '#2563eb', SUPPORT: '#059669'
        }
    },
    MIDNIGHT: {
        label: 'Midnight',
        backgroundColor: '#0c0a09',
        selectionColor: '#f472b6',
        selectionOpacity: 0.35,
        hoverColor: '#fbbf24',
        gridColor1: '#1c1917',
        gridColor2: '#0c0a09',
        componentColors: {
            PIPE: '#a8a29e', BEND: '#78716c', TEE: '#78716c',
            OLET: '#57534e', REDUCER: '#57534e', VALVE: '#6366f1',
            FLANGE: '#818cf8', SUPPORT: '#34d399'
        }
    },
    BLUEPRINT: {
        label: 'Blueprint',
        backgroundColor: '#172554',
        selectionColor: '#fbbf24',
        selectionOpacity: 0.4,
        hoverColor: '#34d399',
        gridColor1: '#1e3a5f',
        gridColor2: '#1e3a8a',
        componentColors: {
            PIPE: '#93c5fd', BEND: '#60a5fa', TEE: '#60a5fa',
            OLET: '#3b82f6', REDUCER: '#3b82f6', VALVE: '#f9a8d4',
            FLANGE: '#f472b6', SUPPORT: '#a7f3d0'
        }
    }
};

export const useStore = create((set, get) => ({
  // The global source of truth for raw pipe geometries
  dataTable: [],

  // Proposals emitted from the SmartFixer
  proposals: [],

  // Method to approve/reject a proposal directly from Canvas
  setProposalStatus: (rowIndex, status) => set((state) => {
      // Find proposal matching the row and update its status
      const updatedProposals = state.proposals.map(prop => {
          if (prop.elementA?._rowIndex === rowIndex || prop.elementB?._rowIndex === rowIndex) {
              return { ...prop, _fixApproved: status };
          }
          return prop;
      });
      // Also sync back to dataTable so it is reflected globally when re-synced
      const updatedTable = state.dataTable.map(r =>
          r._rowIndex === rowIndex ? { ...r, _fixApproved: status } : r
      );

      // Need a way to tell the app context to sync from zustand.
      // We will dispatch a custom window event that StatusBar/AppContext can listen to.
      window.dispatchEvent(new CustomEvent('zustand-fix-status-changed', {
          detail: { rowIndex, status }
      }));

      return { proposals: updatedProposals, dataTable: updatedTable };
  }),

  // Draw Canvas State
  isDrawMode: false,

  translucentMode: false,
  setTranslucentMode: (val) => set({ translucentMode: val }),
  setDrawMode: (val) => { get().logTestEvent('DRAW_MODE_CHANGE', { isDrawMode: val }); set({ isDrawMode: val }); },


  // Playwright Event Logger
  logTestEvent: (type, payload) => {
    if (typeof window !== 'undefined') {
      window.__TEST_LOGS__ = window.__TEST_LOGS__ || [];
      window.__TEST_LOGS__.push({ type, payload, timestamp: Date.now() });
    }
  },

  // Canvas Mode Machine

  showSideInspector: false,
  setShowSideInspector: (val) => set({ showSideInspector: val }),
  showSettings: false,
  setShowSettings: (val) => set({ showSettings: val }),

  canvasMode: 'VIEW', // 'VIEW' | 'CONNECT' | 'STRETCH' | 'BREAK' | 'INSERT_SUPPORT' | 'MEASURE' | 'MARQUEE_SELECT' | 'MARQUEE_ZOOM' | 'MARQUEE_DELETE'
  setCanvasMode: (mode) => {
      const prev = get().canvasMode;
      if (get().logTestEvent) get().logTestEvent('MODE_CHANGE', { from: prev, to: mode });
      // Clean up previous mode's state
      const cleanup = {};
      if (prev === 'MEASURE' || mode !== prev) {
          cleanup.measurePts = [];
      }
      if (prev !== mode) {
          cleanup.cursorSnapPoint = null;
      }
      set({ ...cleanup, canvasMode: mode });
      // Debug gate
      if (typeof dbg !== 'undefined') dbg.tool(mode, `Mode: ${prev} → ${mode}`);
  },


  // Global Undo/Redo stack for UI actions
  pastStates: [],
  futureStates: [],
  pushHistory: (actionName) => set((state) => {
      const newPast = [...state.pastStates, state.dataTable].slice(-20);
      return { pastStates: newPast, futureStates: [] };
  }),
  undo: () => set((state) => {
      if (state.pastStates.length === 0) return state;
      const prev = state.pastStates[state.pastStates.length - 1];
      const newPast = state.pastStates.slice(0, -1);
      const newFuture = [state.dataTable, ...state.futureStates];
      setTimeout(() => window.dispatchEvent(new CustomEvent('zustand-undo')), 0);
      return { dataTable: prev, pastStates: newPast, futureStates: newFuture };
  }),
  redo: () => set((state) => {
      if (state.futureStates.length === 0) return state;
      const next = state.futureStates[0];
      const newFuture = state.futureStates.slice(1);
      const newPast = [...state.pastStates, state.dataTable];
      setTimeout(() => window.dispatchEvent(new CustomEvent('zustand-redo')), 0);
      return { dataTable: next, pastStates: newPast, futureStates: newFuture };
  }),

  interactionMode: 'ROTATE', // 'ROTATE' | 'PAN'
  setInteractionMode: (mode) => set({ interactionMode: mode }),

  // Undo Stack
  history: [],
  historyIdx: -1,
  pushHistory: (label) => set((state) => {
    // Take a deep snapshot of the current dataTable
    const snapshot = state.dataTable.map(r => ({
      ...r,
      ep1: r.ep1 ? { ...r.ep1 } : null,
      ep2: r.ep2 ? { ...r.ep2 } : null,
      cp: r.cp ? { ...r.cp } : null,
      bp: r.bp ? { ...r.bp } : null,
    }));

    // Slice off any redo history
    const newHistory = state.history.slice(0, state.historyIdx + 1);
    newHistory.push({ label, data: snapshot });

    // Buffer depth: 20
    if (newHistory.length > 20) {
      newHistory.shift();
    }
    return { history: newHistory, historyIdx: newHistory.length - 1 };
  }),


  // Selection & Toggles
  orthoMode: false,
  toggleOrthoMode: () => set((state) => ({ orthoMode: !state.orthoMode })),

  hiddenElementIds: [],
  setHiddenElementIds: (ids) => set({ hiddenElementIds: ids }),
  hideSelected: () => set((state) => {
    const toHide = [...state.multiSelectedIds];
    if (state.selectedElementId) toHide.push(state.selectedElementId);
    return {
      hiddenElementIds: [...new Set([...state.hiddenElementIds, ...toHide])],
      multiSelectedIds: [],
      selectedElementId: null
    };
  }),
  isolateSelected: () => set((state) => {
    const allIds = state.dataTable.map(r => r._rowIndex);
    const selectedIds = state.multiSelectedIds.length > 0 ? state.multiSelectedIds : (state.selectedElementId ? [state.selectedElementId] : []);
    const toHide = allIds.filter(id => !selectedIds.includes(id));
    return { hiddenElementIds: toHide };
  }),
  unhideAll: () => set({ hiddenElementIds: [] }),

  colorMode: 'TYPE', // 'TYPE' | 'SPOOL' | 'PIPELINE_REF'
  setColorMode: (mode) => set({ colorMode: mode }),

  multiSelectedIds: [],
  toggleMultiSelect: (id) => set((state) => {
    const isSelected = state.multiSelectedIds.includes(id);
    if (isSelected) {
      return { multiSelectedIds: state.multiSelectedIds.filter(selectedId => selectedId !== id) };
    } else {
      return { multiSelectedIds: [...state.multiSelectedIds, id] };
    }
  }),
  setMultiSelect: (ids) => set({ multiSelectedIds: ids }),
  clearMultiSelect: () => set({ multiSelectedIds: [] }),
  deleteElements: (ids) => set((state) => {
    const updatedTable = state.dataTable
      .filter(r => !ids.includes(r._rowIndex))
      .map((row, idx) => ({ ...row, _rowIndex: idx + 1 })); // Re-index after delete
    // Important: we also dispatch to AppContext in the CanvasTab
    return { dataTable: updatedTable, multiSelectedIds: [] };
  }),
  dragAxisLock: null, // 'X' | 'Y' | 'Z' | null
  setDragAxisLock: (axis) => set({ dragAxisLock: axis }),
  showRowLabels: false,
  setShowRowLabels: (show) => set({ showRowLabels: show }),
  showRefLabels: false,
  setShowRefLabels: (show) => set({ showRefLabels: show }),
  showGapRadar: false,
  setShowGapRadar: (show) => set({ showGapRadar: show }),

  showSettings: false,
  setShowSettings: (show) => set({ showSettings: show }),

  appSettings: {
    theme: 'DARK_INDUSTRIAL',
    selectionColor: '#22d3ee',
    selectionOpacity: 0.35,
    hoverColor: '#a78bfa',
    backgroundColor: '#020617',
    debugConsoleEnabled: false,
    gridSnapResolution: 100,
    cameraFov: 45,
    cameraNear: 1,
    cameraFar: 500000,
    autoBendEnabled: false,
    centerOrbitOnSelect: true,
    showGrid: true,
    showAxes: true,
    limitPixelRatio: true,
    disableAA: false,
    labelCullDistance: 5000,
    componentColors: {
      PIPE: '#cbd5e1',     // Light slate (subtle)
      BEND: '#94a3b8',     // Slate (subtle contrast)
      TEE: '#94a3b8',      // Slate
      OLET: '#64748b',     // Darker slate
      REDUCER: '#64748b',  // Darker slate
      VALVE: '#3b82f6',    // Blue
      FLANGE: '#60a5fa',   // Lighter blue
      SUPPORT: '#10b981'   // Emerald/Green (unique)
    }
  },
  updateAppSettings: (newSettings) => set(state => ({ appSettings: { ...state.appSettings, ...newSettings } })),

  applyTheme: (themeKey) => {
      const preset = THEME_PRESETS[themeKey];
      if (!preset) {
          if (typeof window !== 'undefined' && window.__dbg_enabled) {
              console.log(`%c[ERROR] THEME: Unknown theme: ${themeKey}`, 'color: #f87171; font-weight: bold');
          }
          return;
      }
      if (typeof window !== 'undefined' && window.__dbg_enabled) {
          console.log(`%c[STATE] 📊 THEME: Applying theme: ${themeKey}`, 'color: #34d399; font-weight: bold', preset);
      }
      set(state => ({
          appSettings: {
              ...state.appSettings,
              theme: themeKey,
              selectionColor: preset.selectionColor,
              selectionOpacity: preset.selectionOpacity,
              hoverColor: preset.hoverColor,
              backgroundColor: preset.backgroundColor,
              componentColors: { ...preset.componentColors },
          }
      }));
  },

  // Measure tool
  contextMenu: null, // { x, y, rowIndex } or null
  setContextMenu: (menu) => set({ contextMenu: menu }),
  closeContextMenu: () => set({ contextMenu: null }),

  measurePts: [],
  addMeasurePt: (pt) => set((state) => {
    if (state.measurePts.length >= 2) return { measurePts: [pt] }; // reset on 3rd click
    return { measurePts: [...state.measurePts, pt] };
  }),
  clearMeasure: () => set({ measurePts: [] }),

  // Global snapping state
  cursorSnapPoint: null,
  setCursorSnapPoint: (pt) => set({ cursorSnapPoint: pt }),

  // Highlighting/Interaction state for the canvas
  selectedElementId: null,
  hoveredElementId: null,

  // Section Box / Clipping
  clippingPlaneEnabled: false,
  setClippingPlaneEnabled: (enabled) => set({ clippingPlaneEnabled: enabled }),

  // Sync function to mirror AppContext if required,
  // or act as the standalone state manager.
  setDataTable: (table) => { get().logTestEvent('DATA_TABLE_CHANGE', { length: table.length }); set({ dataTable: table }); },

  // Set datatable from external RC tab (converts RC rows to Smart Fixer components)
  setExternalDataTable: (rows) => {
      const components = rows.map((row, idx) => {
          // Convert RC datatable row to Smart Fixer component format
          const points = [];
          if (row.ep1) points.push(row.ep1);
          if (row.ep2) points.push(row.ep2);

          return {
              id: `rc-comp-${idx}`,
              _rowIndex: idx + 1,
              refNo: row.refNo || '',
              type: row.type || 'UNKNOWN',
              bore: row.bore ?? null,
              branchBore: row.branchBore ?? null,
              pipelineRef: row.pipelineRef || '',
              lineNoKey: row.lineNoKey || '',
              pipingClass: row.pipingClass || '',
              rating: row.rating ?? '',
              points: points,
              ep1: row.ep1,
              ep2: row.ep2,
              cp: row.cp || null,
              bp: row.bp || null,
              attributes: {
                  'COMPONENT-ATTRIBUTE1': row.ca?.[1] || '',
                  'COMPONENT-ATTRIBUTE2': row.ca?.[2] || '',
                  'COMPONENT-ATTRIBUTE3': row.ca?.[3] || '',
                  'COMPONENT-ATTRIBUTE4': row.ca?.[4] || '',
                  'COMPONENT-ATTRIBUTE5': row.ca?.[5] || '',
                  'COMPONENT-ATTRIBUTE6': row.ca?.[6] || '',
                  'COMPONENT-ATTRIBUTE7': row.ca?.[7] || '',
                  'COMPONENT-ATTRIBUTE8': row.ca?.[8] || '',
                  'COMPONENT-ATTRIBUTE9': row.ca?.[9] || '',
                  'COMPONENT-ATTRIBUTE10': row.ca?.[10] || '',
                  'SUPPORT_NAME': row.supportName || '',
                  'SUPPORT_GUID': row.supportGuid || '',
                  'SKEY': row.skey || '',
                  'PIPELINE_REFERENCE': row.pipelineRef || ''
              },
              fixingAction: '',
              _hasUnappliedFix: false
          };
      });
      get().setDataTable(components);
      window.dispatchEvent(new CustomEvent('external-data-loaded', { detail: { components } }));
  },

  setProposals: (proposals) => set({ proposals }),

  // Interaction handlers
  setSelected: (id) => set({ selectedElementId: id }),
  setHovered: (id) => set({ hoveredElementId: id }),

  // A helper method that safely retrieves pipes only
  getPipes: () => {
    const s = get();
    return s.dataTable.filter(r => (r.type || "").toUpperCase() === 'PIPE' && !s.hiddenElementIds.includes(r._rowIndex));
  },

  // A helper method that safely retrieves all non-PIPE components for distinct 3D rendering
  // Note: We now include SUPPORT components in immutables so they render visibly.
  getImmutables: () => {
    const s = get();
    return s.dataTable.filter(r => (r.type || "").toUpperCase() !== 'PIPE' && !s.hiddenElementIds.includes(r._rowIndex));
  },

}));
