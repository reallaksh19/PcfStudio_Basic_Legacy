/**
 * js/smart_fixer/core/3d_smart_fixer_pcf_exporter.js
 * Generates PCF exactly matching source file structure using retained `_originalLines`.
 */

export function generatePCFText(components) {
    if (!components || components.length === 0) return '';
    const outputLines = [];

    const formatNumber = (num) => Number(num).toFixed(4);

    components.forEach((comp) => {
        // If the component was dynamically inserted (doesn't have _originalLines)
        if (!comp._originalLines) {
            outputLines.push(comp.type + (comp.name ? ` ${comp.name}` : ''));
            if (comp.points && Array.isArray(comp.points)) {
                comp.points.forEach(pt => {
                    outputLines.push(`    END-POINT ${formatNumber(pt.x)} ${formatNumber(pt.y)} ${formatNumber(pt.z)} ${pt.bore || 0}`);
                });
            }
            if (comp.attributes) {
                Object.entries(comp.attributes).forEach(([key, value]) => {
                    outputLines.push(`    ${key} ${value}`);
                });
            }
            outputLines.push('');
            return;
        }

        // Otherwise, write out its original lines exactly, but patch ONLY modified points.
        let pointIndex = 0;

        for (let i = 0; i < comp._originalLines.length; i++) {
            let rawLine = comp._originalLines[i];
            const trimmed = rawLine.trim();

            if (trimmed.toUpperCase().startsWith('END-POINT')) {
                if (comp.points && comp.points[pointIndex]) {
                    const pt = comp.points[pointIndex];

                    // CRITICAL: Only overwrite if this specific point was modified!
                    if (pt._isModified) {
                        const indentMatch = rawLine.match(/^(\s*)/);
                        const indent = indentMatch ? indentMatch[1] : '    ';

                        // Reconstruct matching the typical spacing, using the exact original bore string if possible
                        // Or just output the new values.
                        const boreStr = pt.bore || 0;
                        rawLine = `${indent}END-POINT    ${formatNumber(pt.x)} ${formatNumber(pt.y)} ${formatNumber(pt.z)} ${boreStr}`;
                    }
                }
                pointIndex++;
            }

            outputLines.push(rawLine);
        }
    });

    return outputLines.join('\n');
}
