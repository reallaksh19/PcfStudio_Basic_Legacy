/**
 * EditorState.js
 * Manages the Two-Way binding between the 3D Editor and the Global Application State.
 */

import { getState, setState } from '../../state.js';

export class EditorState {
    constructor() {
        this.LOG_PREFIX = '[EditorState]';
    }

    /**
     * Update a component property in the global state.
     * @param {string} refNo - Component Reference Number
     * @param {string} key - Property Key (e.g., 'type', 'COMPONENT-ATTRIBUTE1')
     * @param {any} value - New Value
     */
    updateComponent(refNo, key, value) {
        const groups = getState('groups');
        if (!groups || !groups.has(refNo)) {
            console.warn(`${this.LOG_PREFIX} RefNo ${refNo} not found in state.`);
            return;
        }

        const group = groups.get(refNo);

        // Handle different property types
        if (key === 'type') {
            group.pcfType = value;
        } else if (key.match(/^(E|N|U)$/)) {
            // Coordinate update (experimental)
            console.warn(`${this.LOG_PREFIX} Coordinate updates via panel not fully supported yet.`);
        } else {
            // Assume Attribute
            if (!group.attributes) group.attributes = {};
            group.attributes[key] = value;
        }

        // Trigger State Update to notify listeners (like Table View)
        setState('groups', groups);
        console.log(`${this.LOG_PREFIX} State updated for ${refNo}: ${key} = ${value}`);
    }
}
