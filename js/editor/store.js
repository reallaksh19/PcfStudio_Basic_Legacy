import { create } from 'zustand';
import { setState } from '../state.js';

let updateCallback = null;

export const registerUpdateCallback = (cb) => {
    updateCallback = cb;
};

const notifyUpdate = (components) => {
    if (updateCallback) {
        updateCallback(components);
    } else {
        if (window.pcfConverter && window.pcfConverter.updateComponents) {
            window.pcfConverter.updateComponents(components);
        } else {
            setState('groups', components);
        }
    }
};

export const useEditorStore = create((set, get) => ({
    components: [],
    renderId: 0,
    setRenderId: (id) => set({ renderId: id }),

    supportRatio: 0.5,
    setSupportRatio: (r) => set({ supportRatio: r }),

    // Extracted architecture: distinct nodes and sticks
    nodes: [],
    sticks: [],

    selectedId: null,
    selectedType: null, // 'NODE' or 'STICK'
    isLoaded: false,
    issues: [], // Validator issues
    focusTarget: null,

    setComponents: (comps) => {
        const mapped = comps.map((c, idx) => ({
            ...c,
            id: c.uuid || c.id || `comp-${idx}`,
            userData: c.userData || {}
        }));

        set({ components: mapped, isLoaded: true });
        get().extractArchitecture(mapped);
    },

    select: (id, type = null) => set({ selectedId: id, selectedType: type }),
    deselect: () => set({ selectedId: null, selectedType: null }),
    setFocus: (target) => set({ focusTarget: target }),
    setIssues: (issues) => set({ issues }),
    clearIssues: () => set({ issues: [] }),

    extractArchitecture: (comps) => {
        const newNodes = [];
        const newSticks = [];

        // Renderable component types for the 3D stick model
        const STICK_TYPES = new Set([
            'PIPE', 'ELBOW', 'TEE', 'FLANGE', 'VALVE',
            'BEND', 'REDUCER', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC',
            'OLET', 'CAP', 'GASKET', 'BOLT', 'SUPPORT',
        ]);

        comps.forEach((c, compIdx) => {
            // c.type is set by pcf-parser at the root level.
            // c.userData may be empty {} when coming from viewer-tab (safeComponents),
            // so we must read c.type directly — NOT via (c.userData || c).type which
            // would always evaluate to c.userData (truthy empty object) and miss the type.
            const compType = (c.type || c.userData?.type || '').toUpperCase();

            if (STICK_TYPES.has(compType)) {
                newSticks.push({
                    id: c.id,
                    type: compType,
                    data: c,
                });
            }

            const pts = [];
            const srcPoints = c.points || c.userData?.points;
            if (Array.isArray(srcPoints)) pts.push(...srcPoints);
            else if (srcPoints) {
                if (srcPoints['1']) pts.push(srcPoints['1']);
                if (srcPoints['2']) pts.push(srcPoints['2']);
                if (srcPoints.EP1) pts.push(srcPoints.EP1);
                if (srcPoints.EP2) pts.push(srcPoints.EP2);
                if (srcPoints.Start) pts.push(srcPoints.Start);
                if (srcPoints.End) pts.push(srcPoints.End);
            }

            pts.forEach((p, ptIdx) => {
                if (!p) return;
                const roundedKey = `${Math.round(p.x || 0)},${Math.round(p.y || 0)},${Math.round(p.z || 0)}`;
                const existingNode = newNodes.find(n => n.key === roundedKey);

                if (!existingNode) {
                    newNodes.push({
                        id: `node-${roundedKey}`,
                        key: roundedKey,
                        x: p.x || 0,
                        y: p.y || 0,
                        z: p.z || 0,
                        connectedSticks: [c.id],
                        // Add sequence metadata for validator
                        componentIndex: compIdx,
                        endpointIndex: ptIdx,
                        componentId: c.id
                    });
                } else {
                    if (!existingNode.connectedSticks.includes(c.id)) {
                        existingNode.connectedSticks.push(c.id);
                    }
                    // If this is a shared node, update sequence info to the later component
                    // This helps track connection points between sequential components
                    if (compIdx > (existingNode.componentIndex || -1)) {
                        existingNode.componentIndex = compIdx;
                        existingNode.endpointIndex = ptIdx;
                        existingNode.componentId = c.id;
                    }
                }
            });
        });

        set({ nodes: newNodes, sticks: newSticks });
    },

    addNode: (node) => {
        set((state) => ({ nodes: [...state.nodes, node] }));
    },

    addStick: (stick) => {
        set((state) => ({ sticks: [...state.sticks, stick] }));
    },

    deleteStick: (id) => {
        set((state) => ({
            sticks: state.sticks.filter(s => s.id !== id),
            components: state.components.filter(c => c.id !== id),
            selectedId: state.selectedId === id ? null : state.selectedId
        }));
        notifyUpdate(get().components);
    },

    deleteNode: (id) => {
        set((state) => ({
            nodes: state.nodes.filter(n => n.id !== id),
            selectedId: state.selectedId === id ? null : state.selectedId
        }));
    },

    updateComponent: (id, updates) => {
        const newComponents = get().components.map(c =>
            c.id === id ? { ...c, ...updates } : c
        );
        const newSticks = get().sticks.map(s =>
            s.id === id ? { ...s, data: { ...s.data, ...updates } } : s
        );

        set({ components: newComponents, sticks: newSticks });
        notifyUpdate(newComponents);
    },

    updateUserData: (id, key, value) => {
        const newComponents = get().components.map(c => {
            if (c.id === id) {
                return {
                    ...c,
                    userData: { ...c.userData, [key]: value }
                };
            }
            return c;
        });
        set({ components: newComponents });
        get().extractArchitecture(newComponents);
        notifyUpdate(newComponents);
    },

    // Smart Validator integration
    updateNode: (nodeId, updates) => {
        set((state) => ({
            nodes: state.nodes.map(n =>
                n.id === nodeId ? { ...n, ...updates } : n
            )
        }));
    },

    updateStick: (stickId, updates) => {
        set((state) => ({
            sticks: state.sticks.map(s =>
                s.id === stickId ? { ...s, ...updates } : s
            )
        }));
    },

    // Rebuild components from modified geometry
    rebuildFromGeometry: async () => {
        const { nodes, sticks } = get();
        try {
            const { rebuildPCF } = await import('./smart/pcf-rebuilder.js');
            const newComponents = rebuildPCF(nodes, sticks);
            get().setComponents(newComponents);

            // Notify data table to refresh
            if (typeof window.pcfTableController?.refresh === 'function') {
                window.pcfTableController.refresh();
            }

            return newComponents;
        } catch (error) {
            console.error('[EditorStore] Failed to rebuild from geometry:', error);
            return [];
        }
    }
}));

// Expose React store setter specifically for Support Graphics Ratio UI control
window.__pcfSetSupportRatio = useEditorStore.getState().setSupportRatio;
