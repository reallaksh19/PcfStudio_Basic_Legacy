import { dataManager } from './data-manager.js';
import { gate, flushAllGates } from "./gate-logger.js";

/**
 * MappingEngine — Links PCF components to Linelist and Weight data.
 * Uses memoized Map indexes for O(1) lookups instead of O(n) .find().
 */
export class MappingEngine {
    constructor(dataStore = dataManager) {
        this.store = dataStore;
        // Memoized indexes (rebuilt when data changes)
        this._lineIndex = null;
        this._weightIndex = null;
        this._lineIndexVersion = -1;
        this._weightIndexVersion = -1;

        // Auto-invalidate indexes when DataManager data changes
        if (this.store.onChange) {
            this.store.onChange((dataType) => {
                if (dataType === 'linelist' || dataType === 'reset') {
                    this._lineIndex = null;
                    this._lineIndexVersion = -1;
                }
                if (dataType === 'weights' || dataType === 'reset') {
                    this._weightIndex = null;
                    this._weightIndexVersion = -1;
                }
            });
        }
    }

    /**
     * Normalize a value for numeric comparison.
     * '16.0' → '16', '40.00' → '40', 'abc' → 'abc' (unchanged).
     * Range handling: '50-60' → '60' (max positive), '-60--50' → '-60' (min negative).
     */
    static _rangeLogCount = 0;
    static _RANGE_LOG_LIMIT = 3;

    static normalizeNumeric(val) {
        const s = String(val ?? '').trim();

        // Detect range pattern: "50-60", "-10--5", "50 - 60", "50–60" (en-dash)
        const rangeMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)$/);
        if (rangeMatch) {
            const a = parseFloat(rangeMatch[1]);
            const b = parseFloat(rangeMatch[2]);
            let result;
            if (a >= 0 || b >= 0) {
                result = Math.max(a, b); // Max for positive values
            } else {
                result = Math.min(a, b); // Min (most extreme) for all-negative
            }

            // Throttled logging: limit similar warnings to 3
            if (MappingEngine._rangeLogCount < MappingEngine._RANGE_LOG_LIMIT) {
                gate('MappingEngine', 'normalizeNumeric', 'Range Value Detected', {
                    input: s, low: a, high: b, resolved: result, method: 'max-positive/min-negative'
                });
                MappingEngine._rangeLogCount++;
            } else if (MappingEngine._rangeLogCount === MappingEngine._RANGE_LOG_LIMIT) {
                gate('MappingEngine', 'normalizeNumeric', 'Range Value Detected', {
                    input: s, note: `Further range warnings limited (>${MappingEngine._RANGE_LOG_LIMIT} similar)`
                });
                MappingEngine._rangeLogCount++; // prevent this message from repeating
            }

            return result.toString();
        }

        const n = parseFloat(s);
        if (!isNaN(n) && isFinite(n)) return n.toString();
        return s;
    }

    // ── Index Builders ───────────────────────────────────────────────

    /**
     * Build a Map<lineNo, row> index from linelist data.
     * Called lazily on first lookup or when data version changes.
     */
    _buildLineIndex(linelist) {
        const key = this.store.headerMap.linelist.lineNo;
        const index = new Map();
        for (const row of linelist) {
            const val = row[key];
            if (val != null) {
                // Normalize: trim whitespace for safer matching
                const normVal = String(val).trim();
                if (!index.has(normVal)) {
                    index.set(normVal, row);
                }
            }
        }
        gate('MappingEngine', '_buildLineIndex', 'Linelist Index Built', {
            key, entries: index.size, sourceRows: linelist.length
        });
        return index;
    }

    /**
     * Build a Map<"size|schedule", row> index from weight data.
     * Composite key allows O(1) lookup by size + schedule.
     */
    _buildWeightIndex(weights) {
        const sizeKey = this.store.headerMap.weights.size;
        const schedKey = this.store.headerMap.weights.schedule;
        const index = new Map();
        const sizeOnlyIndex = new Map(); // Fallback: size-only matches

        for (const row of weights) {
            const size = MappingEngine.normalizeNumeric(row[sizeKey]);
            const sched = MappingEngine.normalizeNumeric(row[schedKey]);
            const compositeKey = `${size}|${sched}`;

            if (!index.has(compositeKey)) {
                index.set(compositeKey, row);
            }
            if (!sizeOnlyIndex.has(size)) {
                sizeOnlyIndex.set(size, row);
            }
        }
        gate('MappingEngine', '_buildWeightIndex', 'Weight Index Built', {
            compositeEntries: index.size, sizeOnlyEntries: sizeOnlyIndex.size,
            sourceRows: weights.length
        });
        return { composite: index, sizeOnly: sizeOnlyIndex };
    }

    // ── Main Mapping ─────────────────────────────────────────────────

    /**
     * Links PCF components with Linelist and Weight data.
     * Builds indexes on first call, reuses on subsequent calls.
     * @param {Array} pcfComponents
     * @returns {Array} Components with linked data
     */
    mapComponents(pcfComponents) {
        const linelist = this.store.getLinelist();
        const weights = this.store.getWeights();

        // Rebuild indexes if data changed (version check by length — simple heuristic)
        if (this._lineIndex === null || this._lineIndexVersion !== linelist.length) {
            this._lineIndex = this._buildLineIndex(linelist);
            this._lineIndexVersion = linelist.length;
        }
        if (this._weightIndex === null || this._weightIndexVersion !== weights.length) {
            this._weightIndex = this._buildWeightIndex(weights);
            this._weightIndexVersion = weights.length;
        }

        const result = pcfComponents.map(comp => {
            // 1. Link Linelist Data
            const matchedLine = this.findMatchingLine(comp);
            if (matchedLine) {
                comp.linelistRef = matchedLine;
                comp.service = matchedLine[this.store.headerMap.linelist.service] || comp.service;
                comp.spCode = matchedLine[this.store.headerMap.linelist.spCode] || comp.spCode;
            }

            // 2. Link Weight Data
            const weightEntry = this.findMatchingWeight(comp);
            if (weightEntry) {
                comp.weightRef = weightEntry;
                comp.weightPerMeter = weightEntry[this.store.headerMap.weights.weight];
            } else {
                comp.weightRef = null;
            }

            return comp;
        });

        flushAllGates();
        return result;
    }

    // ── Lookup Methods (O(1) via Map) ────────────────────────────────

    /**
     * Find matching Linelist row via memoized index.
     * Falls back to null if no match.
     */
    findMatchingLine(comp, linelist) {
        // Support legacy call signature (comp, linelist)
        if (linelist && Array.isArray(linelist) && this._lineIndex === null) {
            this._lineIndex = this._buildLineIndex(linelist);
            this._lineIndexVersion = linelist.length;
        }

        if (!this._lineIndex || this._lineIndex.size === 0) return null;

        const ref = String(comp.pipelineReference ?? '').trim();
        const match = this._lineIndex.get(ref) || null;

        gate('MappingEngine', 'findMatchingLine', 'Linelist Search', {
            searchValue: ref, found: !!match
        });

        return match;
    }

    /**
     * Find matching Weight row via memoized index.
     * Tries composite key (size|schedule) first, falls back to size-only.
     */
    findMatchingWeight(comp, weights) {
        // Support legacy call signature (comp, weights)
        if (weights && Array.isArray(weights) && this._weightIndex === null) {
            this._weightIndex = this._buildWeightIndex(weights);
            this._weightIndexVersion = weights.length;
        }

        if (!this._weightIndex) return null;

        const size = MappingEngine.normalizeNumeric(comp.size1);
        const sched = MappingEngine.normalizeNumeric(comp.schedule);

        // Primary: composite key match
        let match = this._weightIndex.composite.get(`${size}|${sched}`) || null;

        // Fallback: size-only match (when schedule not specified)
        if (!match && !sched) {
            match = this._weightIndex.sizeOnly.get(size) || null;
        }

        gate('MappingEngine', 'findMatchingWeight', 'Weight Search', {
            size, schedule: sched, found: !!match
        });

        return match;
    }

    /**
     * Invalidate cached indexes (call when underlying data changes).
     */
    invalidateIndexes() {
        this._lineIndex = null;
        this._weightIndex = null;
        this._lineIndexVersion = -1;
        this._weightIndexVersion = -1;
    }
}

export const mappingEngine = new MappingEngine();
