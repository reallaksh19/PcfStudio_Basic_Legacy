import { dataManager } from './data-manager.js';
import { mappingEngine } from './mapping-engine.js';
import { gate } from './gate-logger.js';
import { getState } from '../state.js';
import { detectRating } from './rating-detector.js';

/**
 * Bridge adapter to make PCFINTEG logic compatible with existing
 * component writers that expect linelistService and weightService.
 */

export const linelistServiceBridge = {
    findMatchedRow: (primary) => {
        // Adapter: find row based on primary attributes (Service, LineNo)
        const comp = {
            pipelineReference: primary.lineNo || primary.pipelineRef,
            service: primary.service,
        };

        const linelist = dataManager.getLinelist();
        return mappingEngine.findMatchingLine(comp, linelist);
    },

    init: () => { },
};

export const weightServiceBridge = {

    /**
     * Smart Rating Detection — delegated to shared rating-detector.js
     * Uses configurable pressureRatingMap from defaults.js.
     */
    detectRating(pipingClass) {
        return detectRating(pipingClass);
    },

    calculateWeight(compForWeight, linelistRow) {
        // compForWeight: { attributes: { RATING }, bore, type, eps: [{E,N,U}, {E,N,U}], size1... }

        // 1. Determine Rating
        let rating = this.detectRating(compForWeight.attributes?.["RATING"]);

        // Try Linelist if not found in component attributes
        if (!rating && linelistRow) {
            // Check common rating columns or values
            const ratingKeys = Object.keys(linelistRow).filter(k => /rating|class|pressure/i.test(k));
            for (const k of ratingKeys) {
                const val = linelistRow[k];
                rating = this.detectRating(val);
                if (rating) break;
            }
        }
        if (!rating) rating = 150; // Default fallback

        // 2. Determine Size (DN)
        let sizeDN = parseFloat(compForWeight.bore);
        if (isNaN(sizeDN) && compForWeight.eps && compForWeight.eps.length > 0) {
            sizeDN = parseFloat(compForWeight.eps[0].bore);
        }
        if (isNaN(sizeDN)) return null;

        // 3. Smart Valve Logic (Length-based)
        // Check if smart valve detection is enabled (default true)
        // We can assume it is enabled for this integration or check config if available
        // For now, let's assume always ON for this "Smart" update.

        if (compForWeight.type === 'VALVE' && compForWeight.eps && compForWeight.eps.length >= 2) {
            const p1 = compForWeight.eps[0];
            const p2 = compForWeight.eps[1];

            // Calculate Euclidean distance (Length)
            // Check if using E,N,U or x,y,z
            const x1 = p1.E ?? p1.x ?? 0;
            const y1 = p1.N ?? p1.y ?? 0;
            const z1 = p1.U ?? p1.z ?? 0;

            const x2 = p2.E ?? p2.x ?? 0;
            const y2 = p2.N ?? p2.y ?? 0;
            const z2 = p2.U ?? p2.z ?? 0;

            const dx = x1 - x2;
            const dy = y1 - y2;
            const dz = z1 - z2;
            const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

            const weight = this._findValveWeight(sizeDN, rating, length);
            if (weight !== null) return weight;
        }

        // 4. Fallback to simple mapping if length match fails
        const comp = {
            size1: sizeDN,
            class: rating,
        };

        const weights = dataManager.getWeights();
        const weightEntry = mappingEngine.findMatchingWeight(comp, weights);

        if (weightEntry) {
            const unitWeight = weightEntry[dataManager.headerMap.weights.weight];
            const result = unitWeight ? parseFloat(unitWeight) : null;

            gate('IntegrationBridge', 'calculateWeight', 'Weight Calculated', {
                dn: sizeDN,
                rating: rating,
                result: result,
                path: 'fallback-map'
            });
            return result;
        }
        return null;
    },

    _findValveWeight(dn, rating, length) {
        const weights = dataManager.getWeights();
        if (!weights || weights.length === 0) return null;

        const TOLERANCE = 6.0; // mm

        // Let's try to find keys dynamically if not mapped
        let bestMatch = null;
        let minDiff = Infinity;

        for (const row of weights) {
            // Helper to get val by key substring
            const getVal = (pattern) => {
                const key = Object.keys(row).find(k => new RegExp(pattern, 'i').test(k));
                return key ? parseFloat(row[key]) : NaN;
            };

            const rDN = getVal('DN|Size.*mm');
            const rRating = getVal('Rating|Class');
            const rLen = getVal('Length');
            const rWeight = getVal('Weight');

            if (isNaN(rDN) || isNaN(rRating) || isNaN(rLen)) continue;

            if (rDN === dn && rRating === rating) {
                const diff = Math.abs(rLen - length);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestMatch = rWeight;
                }
            }
        }

        if (minDiff <= TOLERANCE && !isNaN(bestMatch)) {
            return bestMatch;
        }
        return null;
    }
};
