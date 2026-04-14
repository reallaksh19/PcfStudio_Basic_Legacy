import { create } from 'zustand';
import { enableMapSet } from 'immer';
import { immer } from 'zustand/middleware/immer';
import type {
  Node,
  Segment,
  InlineItem,
  Support,
  Fitting,
  UnderlayImage,
} from './Smart2Dcanvas_GeometryTypes';

enableMapSet();

export type ToolType = 'select' | 'marquee' | 'measure' | 'pan' | 'line' | 'bend' | 'tee' | 'polyline' | 'spline' | 'support' | 'valve' | 'flange' | 'fvf' | 'reducer' | 'break' | 'connect' | 'stretch' | 'gapClean' | 'overlapSolver' | 'underlay' | 'annotations' | 'minimap';

interface SceneSnapshot {
  nodes: Record<string, Node>;
  segments: Record<string, Segment>;
  inlineItems: Record<string, InlineItem>;
  supports: Record<string, Support>;
  fittings: Record<string, Fitting>;
  underlayImages: Record<string, UnderlayImage>;
}

interface SceneBundle extends Partial<SceneSnapshot> {}

const MAX_HISTORY = 50;

interface SceneState {
  scale: number;
  panX: number;
  panY: number;
  cursorX: number;
  cursorY: number;
  activeTool: ToolType;
  currentElevation: number;
  selectedIds: Set<string>;
  nodes: Record<string, Node>;
  segments: Record<string, Segment>;
  inlineItems: Record<string, InlineItem>;
  supports: Record<string, Support>;
  fittings: Record<string, Fitting>;
  underlayImages: Record<string, UnderlayImage>;
  currentDraftingSegment?: Partial<Segment>;
  isOrtho: boolean;
  isOsnap: boolean;
  revision: number;
  history: SceneSnapshot[];
  future: SceneSnapshot[];
  setOrtho: (val: boolean) => void;
  setOsnap: (val: boolean) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  setScale: (scale: number) => void;
  setPan: (x: number, y: number) => void;
  setCursor: (x: number, y: number) => void;
  setActiveTool: (tool: ToolType) => void;
  setCurrentElevation: (elevation: number) => void;
  selectObject: (id: string, additive?: boolean) => void;
  selectNext: () => void;
  selectPrev: () => void;
  clearSelection: () => void;
  deleteSelected: () => void;
  addNode: (node: Node) => void;
  updateNode: (id: string, updates: Partial<Node>) => void;
  removeNode: (id: string) => void;
  addSegment: (segment: Segment) => void;
  updateSegment: (id: string, updates: Partial<Segment>) => void;
  removeSegment: (id: string) => void;
  addInlineItem: (item: InlineItem) => void;
  updateInlineItem: (id: string, updates: Partial<InlineItem>) => void;
  addSupport: (support: Support) => void;
  updateSupport: (id: string, updates: Partial<Support>) => void;
  addFitting: (fitting: Fitting) => void;
  updateFitting: (id: string, updates: Partial<Fitting>) => void;
  addUnderlayImage: (image: UnderlayImage) => void;
  updateUnderlayImage: (id: string, updates: Partial<UnderlayImage>) => void;
  resetScene: () => void;
  loadSceneBundle: (bundle: SceneBundle) => void;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function takeSnapshot(state: SceneState): SceneSnapshot {
  return {
    nodes: clone(state.nodes),
    segments: clone(state.segments),
    inlineItems: clone(state.inlineItems),
    supports: clone(state.supports),
    fittings: clone(state.fittings),
    underlayImages: clone(state.underlayImages),
  };
}

function pushHistoryDraft(state: SceneState) {
  state.history.push(takeSnapshot(state));
  if (state.history.length > MAX_HISTORY) state.history.shift();
  state.future = [];
}

function restoreSnapshotDraft(state: SceneState, snap: SceneSnapshot) {
  state.nodes = snap.nodes;
  state.segments = snap.segments;
  state.inlineItems = snap.inlineItems;
  state.supports = snap.supports;
  state.fittings = snap.fittings;
  state.underlayImages = snap.underlayImages;
  state.selectedIds.clear();
  state.revision += 1;
}

function allSelectableIds(state: SceneState): string[] {
  return [
    ...Object.keys(state.segments),
    ...Object.keys(state.inlineItems),
    ...Object.keys(state.supports),
    ...Object.keys(state.fittings),
    ...Object.keys(state.underlayImages),
  ];
}

export const useSceneStore = create<SceneState>()(
  immer((set, get) => ({
    scale: 1,
    panX: 0,
    panY: 0,
    cursorX: 0,
    cursorY: 0,
    activeTool: 'select',
    currentElevation: 0,
    selectedIds: new Set(),
    nodes: {},
    segments: {},
    inlineItems: {},
    supports: {},
    fittings: {},
    underlayImages: {},
    isOrtho: false,
    isOsnap: true,
    revision: 0,
    history: [],
    future: [],
    setScale: (scale) => set((state) => { state.scale = scale; }),
    setPan: (x, y) => set((state) => { state.panX = x; state.panY = y; }),
    setCursor: (x, y) => set((state) => { state.cursorX = x; state.cursorY = y; }),
    setActiveTool: (tool) => set((state) => { state.activeTool = tool; }),
    setCurrentElevation: (elevation) => set((state) => { state.currentElevation = elevation; }),
    setOrtho: (val) => set((state) => { state.isOrtho = val; }),
    setOsnap: (val) => set((state) => { state.isOsnap = val; }),
    pushHistory: () => set((state) => { pushHistoryDraft(state as unknown as SceneState); }),
    undo: () => set((state) => {
      if (state.history.length === 0) return;
      const snap = state.history.pop()!;
      state.future.push(takeSnapshot(state as unknown as SceneState));
      restoreSnapshotDraft(state as unknown as SceneState, snap);
    }),
    redo: () => set((state) => {
      if (state.future.length === 0) return;
      const snap = state.future.pop()!;
      state.history.push(takeSnapshot(state as unknown as SceneState));
      restoreSnapshotDraft(state as unknown as SceneState, snap);
    }),
    selectObject: (id, additive = false) => set((state) => {
      if (!additive) state.selectedIds.clear();
      if (state.selectedIds.has(id)) state.selectedIds.delete(id); else state.selectedIds.add(id);
    }),
    selectNext: () => set((state) => {
      const ids = allSelectableIds(state as unknown as SceneState);
      if (ids.length === 0) return;
      const current = Array.from(state.selectedIds)[0];
      const idx = current ? ids.indexOf(current) : -1;
      state.selectedIds.clear();
      state.selectedIds.add(ids[(idx + 1 + ids.length) % ids.length]);
    }),
    selectPrev: () => set((state) => {
      const ids = allSelectableIds(state as unknown as SceneState);
      if (ids.length === 0) return;
      const current = Array.from(state.selectedIds)[0];
      const idx = current ? ids.indexOf(current) : 0;
      state.selectedIds.clear();
      state.selectedIds.add(ids[(idx - 1 + ids.length) % ids.length]);
    }),
    clearSelection: () => set((state) => { state.selectedIds.clear(); }),
    deleteSelected: () => set((state) => {
      pushHistoryDraft(state as unknown as SceneState);
      state.selectedIds.forEach((id) => {
        delete state.segments[id];
        delete state.inlineItems[id];
        delete state.supports[id];
        delete state.fittings[id];
        delete state.underlayImages[id];
        delete state.nodes[id];
      });
      state.selectedIds.clear();
      state.revision += 1;
    }),
    addNode: (node) => set((state) => { pushHistoryDraft(state as unknown as SceneState); state.nodes[node.id] = node; state.revision += 1; }),
    updateNode: (id, updates) => set((state) => { if (!state.nodes[id]) return; pushHistoryDraft(state as unknown as SceneState); state.nodes[id] = { ...state.nodes[id], ...updates }; state.revision += 1; }),
    removeNode: (id) => set((state) => { if (!state.nodes[id]) return; pushHistoryDraft(state as unknown as SceneState); delete state.nodes[id]; state.revision += 1; }),
    addSegment: (segment) => set((state) => { pushHistoryDraft(state as unknown as SceneState); state.segments[segment.id] = segment; state.revision += 1; }),
    updateSegment: (id, updates) => set((state) => { if (!state.segments[id]) return; pushHistoryDraft(state as unknown as SceneState); state.segments[id] = { ...state.segments[id], ...updates }; state.revision += 1; }),
    removeSegment: (id) => set((state) => { if (!state.segments[id]) return; pushHistoryDraft(state as unknown as SceneState); delete state.segments[id]; state.revision += 1; }),
    addInlineItem: (item) => set((state) => { pushHistoryDraft(state as unknown as SceneState); state.inlineItems[item.id] = item; state.revision += 1; }),
    updateInlineItem: (id, updates) => set((state) => { if (!state.inlineItems[id]) return; pushHistoryDraft(state as unknown as SceneState); state.inlineItems[id] = { ...state.inlineItems[id], ...updates }; state.revision += 1; }),
    addSupport: (support) => set((state) => { pushHistoryDraft(state as unknown as SceneState); state.supports[support.id] = support; state.revision += 1; }),
    updateSupport: (id, updates) => set((state) => { if (!state.supports[id]) return; pushHistoryDraft(state as unknown as SceneState); state.supports[id] = { ...state.supports[id], ...updates }; state.revision += 1; }),
    addFitting: (fitting) => set((state) => { pushHistoryDraft(state as unknown as SceneState); state.fittings[fitting.id] = fitting; state.revision += 1; }),
    updateFitting: (id, updates) => set((state) => { if (!state.fittings[id]) return; pushHistoryDraft(state as unknown as SceneState); state.fittings[id] = { ...state.fittings[id], ...updates }; state.revision += 1; }),
    addUnderlayImage: (image) => set((state) => { pushHistoryDraft(state as unknown as SceneState); state.underlayImages[image.id] = image; state.revision += 1; }),
    updateUnderlayImage: (id, updates) => set((state) => { if (!state.underlayImages[id]) return; pushHistoryDraft(state as unknown as SceneState); state.underlayImages[id] = { ...state.underlayImages[id], ...updates }; state.revision += 1; }),
    resetScene: () => set((state) => {
      state.nodes = {};
      state.segments = {};
      state.inlineItems = {};
      state.supports = {};
      state.fittings = {};
      state.underlayImages = {};
      state.selectedIds.clear();
      state.history = [];
      state.future = [];
      state.revision += 1;
    }),
    loadSceneBundle: (bundle) => set((state) => {
      state.nodes = bundle.nodes || {};
      state.segments = bundle.segments || {};
      state.inlineItems = bundle.inlineItems || {};
      state.supports = bundle.supports || {};
      state.fittings = bundle.fittings || {};
      state.underlayImages = bundle.underlayImages || {};
      state.selectedIds.clear();
      state.history = [];
      state.future = [];
      state.revision += 1;
    }),
  }))
);
