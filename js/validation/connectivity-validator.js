/**
 * connectivity-validator.js — Validate connectivity of the sequenced pipeline
 * Iterates through the ordered component list (after sequencing/snapping)
 * and calculates connection validity metrics.
 *
 * Stores the result directly on the ComponentGroup object under `group.validation`.
 * These results are consumed by PcfTableController.
 */

const _dist = (p1, p2) => {
    if (!p1 || !p2) return Infinity;
    const dx = p1.E - p2.E;
    const dy = p1.N - p2.N;
    const dz = p1.U - p2.U;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const _getStart = (g) => {
    if (!g || !g.pts) return null;
    return g.pts['1'] || g.pts['0']; // Point 1 (Start) or Point 0 (Center/Support)
};

const _getEnd = (g) => {
    if (!g || !g.pts) return null;
    if (g.pcfType === 'TEE' && g.pts['3']) return g.pts['3']; // Special case? No, TEE run ends at 2. Branch is 3.
    // Usually standard flow is 1 -> 2.
    return g.pts['2'] || g.pts['0'];
};

/**
 * Run connectivity validation on the sequenced groups.
 * @param {Map<string, ComponentGroup>} groups
 * @param {string[]} orderedRefnos
 * @param {object} config
 */
export const validateConnectivity = (groups, orderedRefnos, config) => {
    const tolerance = config?.coordinateSettings?.continuityTolerance ?? 0.5;

    for (let i = 0; i < orderedRefnos.length; i++) {
        const ref = orderedRefnos[i];
        const group = groups.get(ref);
        if (!group) continue;

        const prevRef = i > 0 ? orderedRefnos[i - 1] : null;
        const nextRef = i < orderedRefnos.length - 1 ? orderedRefnos[i + 1] : null;

        const prevGroup = prevRef ? groups.get(prevRef) : null;
        const nextGroup = nextRef ? groups.get(nextRef) : null;

        const myStart = _getStart(group);
        const myEnd = _getEnd(group);

        // Init validation object
        const validation = {
            prevValid: 'N/A',
            nextValid: 'N/A',
            prevDist: '',
            nextDist: '',
            otherMatches: []
        };

        // Prev Check
        if (prevGroup) {
            const prevEnd = _getEnd(prevGroup);
            const d = _dist(myStart, prevEnd);
            validation.prevDist = d.toFixed(1);
            if (d <= tolerance) {
                validation.prevValid = '✅';
            } else {
                validation.prevValid = '❌';
                validation.prevDist += ` (> ${tolerance}mm)`;
            }
        }

        // Next Check
        if (nextGroup) {
            const nextStart = _getStart(nextGroup);
            const d = _dist(myEnd, nextStart);
            validation.nextDist = d.toFixed(1);
            if (d <= tolerance) {
                validation.nextValid = '✅';
            } else {
                validation.nextValid = '❌';
                validation.nextDist += ` (> ${tolerance}mm)`;
            }
        }

        // Other Matches Scan (if sequential continuity failed)
        // Find if my Start/End connects to ANY other component in the list
        if (validation.prevValid !== '✅' && validation.prevValid !== 'N/A') {
            for (const otherRef of orderedRefnos) {
                if (otherRef === ref || otherRef === prevRef) continue;
                const otherG = groups.get(otherRef);
                const otherEnd = _getEnd(otherG);
                if (_dist(myStart, otherEnd) <= tolerance) {
                    validation.otherMatches.push(`[Prev=Ref ${otherRef}]`);
                }
            }
        }

        if (validation.nextValid !== '✅' && validation.nextValid !== 'N/A') {
            for (const otherRef of orderedRefnos) {
                if (otherRef === ref || otherRef === nextRef) continue;
                const otherG = groups.get(otherRef);
                const otherStart = _getStart(otherG);
                if (_dist(myEnd, otherStart) <= tolerance) {
                    validation.otherMatches.push(`[Next=Ref ${otherRef}]`);
                }
            }
        }

        // Store on group
        group.validation = validation;
    }
};
