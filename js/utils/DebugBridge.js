/**
 * DebugBridge.js
 * A facade for the logging system that specifically handles Editor events.
 * Integrates with Global Logger and Debug Tab.
 */

import { globalLogger } from '../utils/diagnostic-logger.js';

export const DebugBridge = {

    logEditorEvent(action, details) {
        // Log to global logger (which might show in console/table)
        globalLogger.info(`[Editor] ${action}`, details);

        // TODO: Dispatch to Debug Tab UI specific section
        this._updateDebugTab('editor', action, details);
    },

    logSmartRule(ruleName, status, details) {
        const level = status === 'PASS' ? 'INFO' : 'WARN';
        globalLogger[level.toLowerCase()](`[SmartRule] ${ruleName}: ${status}`, details);
        this._updateDebugTab('smart', ruleName, details);
    },

    _updateDebugTab(category, title, data) {
        // This would update a specific DOM element in the Debug Tab
        // For now, we rely on the global logger's HTML output.
        // Future: dispatchEvent(new CustomEvent('debug-update', ...));
    }
};
