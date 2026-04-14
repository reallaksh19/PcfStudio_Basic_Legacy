/**
 * js/smart_fixer/core/pcf-parser.js
 * Modular PCF parser. Translates raw text to robust JSON format,
 * retaining original source lines to allow exact output matching.
 */

export function parsePCFText(text) {
    if (!text) return [];

    const lines = text.split(/\r?\n/);
    const components = [];
    let currentComp = null;
    let sequenceIndex = 0;

    for (let i = 0; i < lines.length; i++) {
        // We keep the original raw line for generation to prevent formatting loss
        const rawLine = lines[i];
        const line = rawLine.trim();

        if (!line) {
            // If it's a blank line, append it to the current component if it exists
            if (currentComp) currentComp._originalLines.push(rawLine);
            continue;
        }

        // Detect new component (no indent and no leading star)
        // PCF specification usually defines components at the leftmost margin
        if (!rawLine.startsWith(' ') && !rawLine.startsWith('\t') && !rawLine.startsWith('*')) {
            if (currentComp) components.push(currentComp);

            const parts = line.split(/\s+/);
            const type = parts[0].toUpperCase();

            currentComp = {
                id: `v2-comp-${sequenceIndex++}`,
                type: type,
                name: parts.slice(1).join(' ').trim(),
                points: [],
                attributes: {},
                centrePoint: null,
                branch1Point: null,
                coOrds: null,
                fixingAction: '',
                _originalLines: [rawLine] // Start storing the exact source lines
            };
            continue;
        }

        // Inside component (indented or comments)
        if (currentComp) {
            currentComp._originalLines.push(rawLine);

            // Skip comments for geometry parsing
            if (line.startsWith('*')) continue;

            const parts = line.split(/\s+/);
            const key = parts[0].toUpperCase();

            // Handle component attributes
            if (key.startsWith('COMPONENT-ATTRIBUTE')) {
                currentComp.attributes[key] = parts.slice(1).join(' ').trim();
                continue;
            }

            if (key === 'END-POINT') {
                currentComp.points.push({
                    x: parseFloat(parts[1]),
                    y: parseFloat(parts[2]),
                    z: parseFloat(parts[3]),
                    bore: parseFloat(parts[4] || 0)
                });
            } else if (key === 'CENTRE-POINT') {
                currentComp.centrePoint = {
                    x: parseFloat(parts[1]),
                    y: parseFloat(parts[2]),
                    z: parseFloat(parts[3])
                };
            } else if (key === 'BRANCH1-POINT') {
                currentComp.branch1Point = {
                    x: parseFloat(parts[1]),
                    y: parseFloat(parts[2]),
                    z: parseFloat(parts[3]),
                    bore: parseFloat(parts[4] || 0)
                };
            } else if (key === 'CO-ORDS') {
                currentComp.coOrds = {
                    x: parseFloat(parts[1]),
                    y: parseFloat(parts[2]),
                    z: parseFloat(parts[3])
                };
            } else {
                currentComp.attributes[key] = parts.slice(1).join(' ');
            }
        }
    }

    if (currentComp) components.push(currentComp);

    return components;
}
