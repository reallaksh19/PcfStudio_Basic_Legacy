/**
 * pcf-cleaner.js
 * Utility to filter and sanitize PCF lines before output/display.
 * Strictly removes blank attributes and internal tracking keys.
 */

// Regex patterns for lines to REMOVE
const BLACKLIST_PATTERNS = [
    // Internal injected refs INSIDE component blocks (indented with 4 spaces) — strip these
    /^\s{4}PIPELINE-REFERENCE\s+=[0-9]+\/[0-9]+_/,  // Indented internal ref: =67130482/1666_pipe
    /^\s{4}PIPELINE-REFERENCE\s+_bridged/i,           // Indented bridged tag (ray-shooter)
    /^\s{4}PIPELINE-REFERENCE\s+_Support/i,           // Indented _Support tag (ray-shooter Stage 1)
    /^\s{4}PIPELINE-REFERENCE\s+_Injected/i,          // Indented injected tag (ray-shooter)
    /^COMPONENT-ATTRIBUTE99/i,                         // Internal attribute (Removed as requested)
    /_Injected/i,                                      // Any injected tracking tag
    /_Sp[0-9]+/i,                                      // Split tracking tags
    /^Attribute[0-9]+\s*$/i,                           // Empty generic attributes
    /^COMPONENT-ATTRIBUTE[0-9]+\s*$/i,                 // Empty component attributes
    /^PIPING-SPEC\s*$/i,                               // Empty piping spec
    /^PIPING-CLASS\s*$/i                               // Empty piping class
];

// Specific keys that must have a value (non-whitespace) to be kept
const REQUIRED_VALUE_KEYS = new Set([
    'PIPING-SPEC',
    'PIPING-CLASS',
    'COMPONENT-ATTRIBUTE1',
    'COMPONENT-ATTRIBUTE2',
    'COMPONENT-ATTRIBUTE3',
    'COMPONENT-ATTRIBUTE4',
    'COMPONENT-ATTRIBUTE5',
    'COMPONENT-ATTRIBUTE6',
    'COMPONENT-ATTRIBUTE7',
    'COMPONENT-ATTRIBUTE8',
    'COMPONENT-ATTRIBUTE9',
    'COMPONENT-ATTRIBUTE10'
]);

/**
 * Filter an array of PCF lines.
 * @param {string[]} lines
 * @returns {string[]} cleaned lines
 */
export function filterPcfLines(lines) {
    if (!Array.isArray(lines)) return [];

    return lines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return true; // Keep existing blank lines for structure

        // 1. Check Blacklist Regex
        if (BLACKLIST_PATTERNS.some(regex => regex.test(trimmed))) {
            return false;
        }

        // 2. Check Specific Keys for Empty Values or "Undefined"
        // Split by first whitespace
        const match = trimmed.match(/^([A-Za-z0-9-]+)(?:\s+(.*))?$/);
        if (match) {
            const key = match[1].toUpperCase();
            const value = match[2] ? match[2].trim() : '';

            // Skip if value is "Undefined" or "Undefined MM" etc.
            if (value.toUpperCase().startsWith('UNDEFINED')) {
                return false;
            }

            if (REQUIRED_VALUE_KEYS.has(key) && !value) {
                return false; // Remove key if value is empty
            }
        }

        return true;
    });
}
