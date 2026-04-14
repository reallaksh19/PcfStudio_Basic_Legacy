import { create } from 'zustand';

/**
 * js/smart_fixer/store.js
 * Source of truth for 3Dv2 Datatable and React Viewer.
 */

export const useSmartFixerStore = create((set, get) => ({
    components: [], // Parsed components
    visualGaps: [], // Array of visual gaps identified by solver
    isLoaded: false,
    selectedId: null,

    // PCF Builder Config & Logs
    pcfPrecision: 4, // default 4 for .4f, can be 1 for .1f
    pcfBuildLogs: [],

    // Set complete component list (from parsing PCF text)
    setComponents: (comps, gaps = []) => set({ components: comps, visualGaps: gaps, isLoaded: true }),

    setPcfPrecision: (precision) => set({ pcfPrecision: precision }),
    setPcfBuildLogs: (logs) => set({ pcfBuildLogs: logs }),

    // Update specific component (e.g. changing Fixing Action)
    updateComponent: (id, updates) => set(state => ({
        components: state.components.map(c => c.id === id ? { ...c, ...updates } : c)
    })),

    // Set datatable from RC tab (converts RC rows to Smart Fixer components)
    setDataTable: (rows) => {
        const components = rows.map((row, idx) => {
            // Convert RC datatable row to Smart Fixer component format
            const points = [];
            if (row.ep1) points.push(row.ep1);
            if (row.ep2) points.push(row.ep2);

            return {
                id: `rc-comp-${idx}`,
                type: row.type || 'UNKNOWN',
                bore: row.bore ?? null,
                branchBore: row.branchBore ?? null,
                points: points,
                centrePoint: row.cp || null,
                branch1Point: row.bp || null,
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
        set({ components, isLoaded: true });
    },

    // Selection logic
    select: (id) => set({ selectedId: id }),
    deselect: () => set({ selectedId: null })
}));
