import { dbg } from '../utils/debugGate';

export const initialState = {
    drawnPipes: [],
    selectedIndex: null,
    multiSelectedIndices: [],
    hiddenIndices: [],
    activeTool: 'VIEW',
    metrics: {
        successCount: 0,
        failCount: 0,
        cancelCount: 0
    }
};

function validateAction(action) {
  if (!action || typeof action.type !== 'string') return 'INVALID_ACTION_SHAPE';

  if (action.type === 'UPDATE_COMPONENT') {
    const p = action.payload;
    if (!p || typeof p.index !== 'number' || !p.component) return 'INVALID_UPDATE_PAYLOAD';
  }

  if (action.type === 'ADD_COMPONENT') {
    const row = action.payload;
    if (!row) return 'MISSING_PAYLOAD';
    if (row.type === 'PIPE' || row.type === 'BEND' || row.type === 'TEE') {
        if (!row.ep1 || !row.ep2) return 'MISSING_ENDPOINTS';
    } else if (['FLANGE', 'VALVE', 'REDUCER', 'SUPPORT'].includes(row.type)) {
        if (!row.cp && !row.ep1) return 'MISSING_POSITION';
    }
  }

  return null;
}

export function drawCanvasReducer(state, action) {
    const err = validateAction(action);
    if (err) {
        dbg.error('DRAW_REDUCER', 'Rejected action', { error: err, action });
        console.warn('[drawCanvasReducer] rejected action', err, action);
        return state; // hard fail closed
    }

    const startTime = performance.now();
    let nextState = state;

    switch (action.type) {
        case 'INCREMENT_METRIC':
            nextState = {
                ...state,
                metrics: {
                    ...state.metrics,
                    [action.payload]: (state.metrics[action.payload] || 0) + 1
                }
            };
            break;
        case 'ADD_COMPONENT':
            const newComponent = {
                ...action.payload,
                rowUid: action.payload.rowUid || `draw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                sourceDomain: 'drawCanvas',
                lastMutationAt: Date.now()
            };
            nextState = {
                ...state,
                drawnPipes: [...state.drawnPipes, newComponent]
            };
            break;
        case 'DELETE_LAST':
            if (state.drawnPipes.length === 0) break;
            nextState = {
                ...state,
                drawnPipes: state.drawnPipes.slice(0, -1),
                selectedIndex: state.selectedIndex === state.drawnPipes.length - 1 ? null : state.selectedIndex
            };
            break;
        case 'UNDO':
            if (state.drawnPipes.length === 0) break;
            nextState = {
                ...state,
                drawnPipes: state.drawnPipes.slice(0, -1),
                selectedIndex: state.selectedIndex === state.drawnPipes.length - 1 ? null : state.selectedIndex
            };
            break;
        case 'SELECT':
            nextState = {
                ...state,
                selectedIndex: action.payload,
                multiSelectedIndices: action.payload !== null ? [action.payload] : []
            };
            break;
        case 'TOGGLE_SELECT':
            let newMulti = [...state.multiSelectedIndices];
            if (newMulti.includes(action.payload)) {
                newMulti = newMulti.filter(i => i !== action.payload);
            } else {
                newMulti.push(action.payload);
            }
            nextState = {
                ...state,
                multiSelectedIndices: newMulti,
                selectedIndex: newMulti.length > 0 ? newMulti[newMulti.length - 1] : null
            };
            break;
        case 'HIDE_SELECTED':
            nextState = {
                ...state,
                hiddenIndices: [...new Set([...state.hiddenIndices, ...state.multiSelectedIndices])],
                multiSelectedIndices: [],
                selectedIndex: null
            };
            break;
        case 'UNHIDE_ALL':
            nextState = {
                ...state,
                hiddenIndices: []
            };
            break;
        case 'SET_TOOL':
            nextState = {
                ...state,
                activeTool: action.payload
            };
            break;
        case 'UPDATE_COMPONENT':
            const updatedPipes = [...state.drawnPipes];
            updatedPipes[action.payload.index] = {
                ...action.payload.component,
                lastMutationAt: Date.now()
            };
            nextState = {
                ...state,
                drawnPipes: updatedPipes
            };
            break;
        case 'SET_ALL_COMPONENTS':
            nextState = {
                ...state,
                drawnPipes: action.payload,
                selectedIndex: null
            };
            break;
        case 'DELETE_SELECTED':
            if (state.multiSelectedIndices.length === 0 && state.selectedIndex === null) break;

            const toDelete = state.multiSelectedIndices.length > 0 ? state.multiSelectedIndices : [state.selectedIndex];
            const newPipes = state.drawnPipes.filter((_, i) => !toDelete.includes(i));

            nextState = {
                ...state,
                drawnPipes: newPipes,
                selectedIndex: null,
                multiSelectedIndices: []
            };
            break;
        default:
            break;
    }

    const duration = performance.now() - startTime;
    if (action.type !== 'INCREMENT_METRIC') {
        dbg.state('DRAW_REDUCER', action.type, {
            payload: action.payload,
            durationMs: duration.toFixed(2),
            pipesCount: nextState.drawnPipes.length
        });
    }

    return nextState;
}
