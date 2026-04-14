/**
 * index.js — Smart Validator & Fixer - Main Export
 * Plug-and-play entry point for easy integration
 *
 * Usage:
 *   import { SmartValidator, SmartFixer, ValidatorPanel, VALIDATOR_CONFIG } from './smart/index.js';
 */

// 🚀 V2 - Integrated Validator (RECOMMENDED)
export { IntegratedValidator } from './IntegratedValidator.js';
export { PCFSyncEngine } from './PCFSyncEngine.js';
export { FixTranslator } from './FixTranslator.js';
export { PCFComponent, DataTableRow } from './pcf-models.js';
export { generateActionDescription } from './ActionDescriptor.js';

// V1 - Core engines (legacy)
export { SmartValidatorCore, createValidator } from './SmartValidatorCore.js';
export { SmartFixerCore, createFixer } from './SmartFixerCore.js';

// UI Component
export { ValidatorPanel } from './ValidatorPanel.js';

// Configuration
export { VALIDATOR_CONFIG, getConfig, setConfig, resetConfig } from './validator-config.js';

// Utilities
export { rebuildPCF, exportPCFText } from './pcf-rebuilder.js';
export * as GeometryUtils from './geometry-utils.js';

// Rules (for custom implementations)
export { detectBrokenConnections, detectModelErrors, detectOverlaps } from './detection-rules.js';
export { snapNodes, insertPipe, insertElbow, trimOverlap } from './fixer-strategies.js';

// Test utilities
export * as MockData from './test-mock-data.js';

/**
 * Quick-start factory: Create fully configured validator
 */
export function createSmartValidator(customConfig = {}) {
    const config = { ...VALIDATOR_CONFIG, ...customConfig };
    const validator = createValidator(config);
    const fixer = createFixer(config);

    return {
        validator,
        fixer,
        config,

        // Convenience method: validate and get fixable issues
        validateAndGetFixable: (data) => {
            const issues = validator.validate(data);
            return {
                all: issues,
                fixable: issues.filter(i => i.autoFixable),
                errors: issues.filter(i => i.severity === 'ERROR'),
                warnings: issues.filter(i => i.severity === 'WARNING')
            };
        },

        // Convenience method: auto-fix all fixable issues
        autoFixAll: (data) => {
            const issues = validator.validate(data);
            const fixable = issues.filter(i => i.autoFixable);
            const results = [];

            fixable.forEach(issue => {
                const result = fixer.fixIssue(issue, data);
                if (result.success) results.push(result);
            });

            return {
                fixed: results.length,
                total: fixable.length,
                results,
                modifications: fixer.getModifications()
            };
        }
    };
}

/**
 * Example usage:
 *
 * // Basic usage
 * const { validator, fixer } = createSmartValidator();
 * const issues = validator.validate({ nodes, sticks });
 * const result = fixer.fixIssue(issues[0], { nodes, sticks });
 *
 * // With UI
 * const panel = new ValidatorPanel('container-id', editorStore);
 *
 * // Custom config
 * const custom = createSmartValidator({
 *   tolerance: 10.0,
 *   brokenConnection: { enabled: false }
 * });
 */
