/**
 * js/services/linelist-service.js
 * Manages Linelist data state, smart mapping, and attribute derivation.
 * Rewrite: v3 with Robust Fallback Lookup (Composite + Simple)
 */
import { setState, getState } from "../state.js";
import { getConfig } from "../config/config-store.js";
import { dataManager } from "./data-manager.js";

const LOG_PREFIX = "[LinelistService]";

class LinelistService {
    constructor() {
        this.initialState = {
            filename: "",
            rawRows: [],
            headerRowIndex: 0,
            headers: [],

            // Generic mapping { "Linelist Col": "PCF Attr" }
            mapping: {},
            keys: {          // Columns used for joining
                serviceCol: "",
                sequenceCol: ""
            },

            // Smart Mapping: specific columns we care about for PCF injection
            smartMap: {
                LineRef: null, // The column containing the Line Number (e.g., "Line No", "ISO")
                P1: null,
                T1: null,
                InsThk: null,
                InsType: null,
                HP: null,
                PipingClass: null,
                DensityDirect: null, // Direct density column (takes priority over phase-based gas/liquid/mixed)
                DensityGas: null,
                DensityLiquid: null,
                DensityMixed: null,
                Phase: null
            },

            // Options
            smartOptions: {
                densityMixedPreference: "Liquid"
            }
        };

        // Runtime Cache for Indexes
        this._compositeMap = null;
        this._simpleMap = null;
        this._cacheVersion = -1;
    }

    init() {
        const currentState = getState("linelist");
        if (!currentState) {
            let saved = {};
            try {
                const raw = localStorage.getItem("pcf_linelist_config");
                if (raw) saved = JSON.parse(raw);
            } catch (e) { console.warn("Failed to load linelist config", e); }

            setState("linelist", {
                ...this.initialState,
                ...saved,
                mapping: saved.mapping || {},
                keys: saved.keys || { serviceCol: "", sequenceCol: "" },
                headers: saved.headers || [],
                smartMap: { ...this.initialState.smartMap, ...(saved.smartMap || {}) }
            });
        }
    }

    reset() {
        setState("linelist", { ...this.initialState });
        this._invalidateCache();
        localStorage.removeItem("pcf_linelist_config");
    }

    /**
     * Clear only the smart mapping configuration.
     */
    resetMapping() {
        const state = getState("linelist");
        setState("linelist", {
            ...state,
            smartMap: { ...this.initialState.smartMap }
        });
        this._saveConfig();
        console.info(`${LOG_PREFIX} Smart mapping reset.`);
    }

    /**
     * Derive Line No from a Component Name string based on config (Helper).
     * Used for fallback or direct derivation scenarios.
     */
    deriveLineNo(compName) {
        if (!compName) return "";
        const config = getConfig();
        const logic = config.smartData?.lineNoLogic || {};

        // 1. Token Strategy
        if (logic.strategy === "token") {
            const delim = logic.tokenDelimiter || "-";
            const parts = compName.split(delim);
            const idx = logic.tokenIndex !== undefined ? logic.tokenIndex : 2;
            if (parts[idx]) return parts[idx].trim();
        }
        // 2. Regex Strategy
        else if (logic.strategy === "regex" && logic.regexPattern) {
            try {
                const re = new RegExp(logic.regexPattern);
                const match = compName.match(re);
                const grp = logic.regexGroup || 1;
                if (match && match[grp]) return match[grp].trim();
            } catch (e) {
                console.warn(`${LOG_PREFIX} Invalid Regex: ${logic.regexPattern}`, e);
            }
        }
        return "";
    }

    _invalidateCache() {
        this._compositeMap = null;
        this._simpleMap = null;
    }

    processRawData(filename, rawRows) {
        console.info(`${LOG_PREFIX} Processing file: ${filename} with ${rawRows.length} rows.`);
        const headerRowIndex = this.detectHeaderRow(rawRows);
        const headers = rawRows[headerRowIndex]?.map(String) || [];

        const currentState = getState("linelist") || {};
        setState("linelist", {
            ...currentState,
            filename,
            rawRows,
            headerRowIndex,
            headers
        });

        this._invalidateCache();

        // Trigger Auto-Map immediately after processing
        this.autoMapHeaders(headers);
        this._saveConfig();
    }

    detectHeaderRow(rows) {
        // Simple heuristic: Row with most "keywords"
        const KEYWORDS = ["LINE", "SERVICE", "PID", "PRESSURE", "TEMP", "CLASS", "PIPING", "SPEC", "UNIT"];
        const MAX_SCAN = Math.min(rows.length, 25);
        let bestIdx = 0;
        let bestScore = -1;

        for (let i = 0; i < MAX_SCAN; i++) {
            const row = rows[i];
            if (!Array.isArray(row)) continue;
            let score = 0;
            row.forEach(cell => {
                if (cell && KEYWORDS.some(k => String(cell).toUpperCase().includes(k))) score++;
            });
            if (score > bestScore) {
                bestScore = score;
                bestIdx = i;
            }
        }
        return bestIdx;
    }

    getData() {
        let state = getState("linelist");
        if (!state) {
            this.init();
            state = getState("linelist");
        }
        if (!state || !state.rawRows || !state.rawRows.length) return [];
        const { rawRows, headerRowIndex, headers } = state;
        const dataRows = [];
        for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.length === 0) continue;
            const rowObj = {};
            headers.forEach((h, colIdx) => {
                if (h) rowObj[h] = row[colIdx];
            });
            dataRows.push(rowObj);
        }
        return dataRows;
    }

    /**
     * Build Lookup Maps (Composite and Simple)
     * Lazy loading with caching.
     */
    _buildLookupMaps() {
        let state = getState("linelist");
        if (!state) {
            this.init();
            state = getState("linelist");
        }
        if (!state || !state.rawRows) return;

        // Check if cache is valid (simple check on row count or just rebuilt if null)
        if (this._compositeMap && this._simpleMap) return;

        console.info(`${LOG_PREFIX} Building lookup indexes...`);
        const composite = new Map();
        const simple = new Map();

        const { keys, smartMap } = state;
        let data = this.getData();

        // Fallback: rawRows is empty (common after page reload or when the upload handler
        // stored data only in dataManager). Use dataManager.getLinelist() directly — it
        // holds the same row objects and is persisted to localStorage across sessions.
        if (!data.length) {
            const dmRows = dataManager.getLinelist();
            if (dmRows.length) {
                console.info(`${LOG_PREFIX} rawRows empty — falling back to dataManager.getLinelist() (${dmRows.length} rows)`);
                data = dmRows;
            }
        }

        // Key Columns
        const serviceKey = keys.serviceCol; // User mapped "Service"
        const seqKey = keys.sequenceCol;    // User mapped "Sequence" (often Line No)

        // Fallback Key: Use SmartMap "LineRef" if Sequence col not explicitly mapped
        const lineRefKey = smartMap.LineRef;

        data.forEach(row => {
            // 1. Composite Key: Service + Sequence
            if (serviceKey && seqKey) {
                const sVal = String(row[serviceKey] || "").trim();
                const qVal = String(row[seqKey] || "").trim();
                if (sVal && qVal) {
                    composite.set(`${sVal}-${qVal}`, row);
                }
            }

            // 2. Simple Key: Line No / Sequence / LineRef
            // Priority: Sequence Col -> Smart LineRef
            const lineVal = row[seqKey] || row[lineRefKey];
            if (lineVal) {
                const cleanLine = String(lineVal).trim();
                if (cleanLine && !simple.has(cleanLine)) {
                    simple.set(cleanLine, row);
                }
            }
        });

        this._compositeMap = composite;
        this._simpleMap = simple;
        console.info(`${LOG_PREFIX} Indexes built. Composite: ${composite.size}, Simple: ${simple.size}`);
    }

    // deriveLineNo was removed from linelistService. Master data uses its own logic now.

    autoMapHeaders(headers) {
        if (!headers) headers = getState("linelist").headers;
        console.log(`[LinelistService] autoMapHeaders called with:`, headers);
        if (!headers || !headers.length) {
            console.warn('[LinelistService] No headers to map.');
            return {}; // Return empty object instead of undefined
        }

        const config = getConfig();
        const keywords = config.smartData?.smartProcessKeywords || {};
        const currentMap = getState("linelist").smartMap;
        const newMap = { ...currentMap };

        const findHeader = (tags) => {
            if (!tags) return null;
            // 1. EXACT MATCH PASS (Highest Priority)
            for (const tag of tags) {
                const exact = headers.find(h => h.trim().toUpperCase() === tag.trim().toUpperCase());
                if (exact) return exact;
            }

            // 2. FUZZY MATCH PASS
            // Strict mode: Only exact matches for short keywords like "P1", "T1"
            // IMPROVEMENT: Sort alias tags by length (longest to shortest) to prevent partial matching
            // e.g., "Design Temperature" (18 chars) should match before "Temp" (4 chars)
            const sortedTags = [...tags].sort((a, b) => b.length - a.length);

            for (const tag of sortedTags) {
                // Case-insensitive check
                const fuzzy = headers.find(h => h.trim().toUpperCase().includes(tag.trim().toUpperCase()));
                // Avoid matching "Construction Class" for "Class" unless the tag is exactly "Class" or "Construction Class" is expected
                if (fuzzy) {
                    if (tag.length <= 3 && fuzzy.length > 10) continue;
                    // Strict protection for Piping Class
                    if (fuzzy.trim().toUpperCase() === "CONSTRUCTION CLASS" && tag.trim().toUpperCase() === "CLASS") continue;
                    return fuzzy;
                }
            }
            return null;
        };

        // Align with new keys in defaults.js
        if (!newMap.P1) newMap.P1 = findHeader(keywords.P1);
        if (!newMap.T1) newMap.T1 = findHeader(keywords.T1);
        if (!newMap.InsThk) newMap.InsThk = findHeader(keywords.InsThk);
        if (!newMap.InsType) newMap.InsType = findHeader(keywords.InsType);
        if (!newMap.HP) newMap.HP = findHeader(keywords.HP);

        // Special Case: Piping Class (Case Insensitive Exact Match Preferred)
        if (!newMap.PipingClass) {
            const pcKeywords = keywords.PipingClass || ["Piping Class", "Class", "Spec"];
            // Try exact case-insensitive match first
            const exactPC = headers.find(h => pcKeywords.some(k => h.toUpperCase() === k.toUpperCase()));
            newMap.PipingClass = exactPC || findHeader(pcKeywords);
        }

        if (!newMap.DensityDirect) newMap.DensityDirect = findHeader(keywords.DensityDirect || ["Fluid Density", "Density"]);
        if (!newMap.DensityGas) newMap.DensityGas = findHeader(keywords.DensityGas);
        if (!newMap.DensityLiquid) newMap.DensityLiquid = findHeader(keywords.DensityLiquid);
        if (!newMap.DensityMixed) newMap.DensityMixed = findHeader(keywords.DensityMixed);
        if (!newMap.Phase) newMap.Phase = findHeader(keywords.Phase);

        const lineKeywords = ["Line No", "Line Number", "ISO", "Line Ref", "Line", "Pipeline Ref"];
        if (!newMap.LineRef) newMap.LineRef = findHeader(lineKeywords);

        setState("linelist", {
            ...getState("linelist"),
            smartMap: newMap
        });

        return newMap;

        // Also try to auto-map Keys if empty
        const currentKeys = getState("linelist").keys || {};
        if (!currentKeys.serviceCol) {
            const sCol = findHeader(["Service", "System"]);
            if (sCol) this.updateKeys({ ...currentKeys, serviceCol: sCol });
        }
        if (!currentKeys.sequenceCol && newMap.LineRef) {
            this.updateKeys({ ...currentKeys, sequenceCol: newMap.LineRef });
        }
    }

    updateKeys(keys) {
        const s = getState("linelist");
        setState("linelist", { ...s, keys });
        this._invalidateCache(); // Keys changed, rebuild index
        this._saveConfig();
    }

    /**
     * Find matching Linelist row with Robust Fallback.
     * 1. Try Composite Key (Service + LineNo)
     * 2. Try Simple Key (LineNo)
     *
     * @param {Object} primary Input object
     * @param {Object} primary.raw Raw input data containing { Service, LineNo }
     * @returns {Object|null} Matched row object or null
     */
    findMatchedRow(primary) {
        if (!primary || !primary.raw) return null;

        this._buildLookupMaps(); // Ensure indexes are ready

        const pRaw = primary.raw;
        // Normalize Inputs
        const sVal = String(pRaw['Service'] || pRaw['SERVICE'] || pRaw['service'] || "").trim();
        const lVal = String(pRaw['LineNo'] || pRaw['LINENO'] || pRaw['Line Number'] || pRaw['ISO'] || "").trim();

        let match = null;

        // 1. Try Composite Key
        if (sVal && lVal && this._compositeMap) {
            const key = `${sVal}-${lVal}`;
            match = this._compositeMap.get(key);
            // console.debug(`${LOG_PREFIX} Lookup Composite [${key}] -> Found: ${!!match}`);
        }

        // 2. Fallback: Simple Key
        if (!match && lVal && this._simpleMap) {
            match = this._simpleMap.get(lVal);
            // console.debug(`${LOG_PREFIX} Lookup Simple [${lVal}] -> Found: ${!!match}`);
        }

        return match || null;
    }

    /**
     * Retrieve Smart Attributes.
     * Uses `findMatchedRow` internally if LineNo is an object, or simple lookup if string.
     * @param {string|Object} query LineNo string OR Query object { raw: { Service, LineNo } }
     */
    getSmartAttributes(query) {
        const result = {
            P1: null, T1: null, InsThk: null, InsType: null, HP: null,
            Density: null, Phase: null, Found: false,
            Row: null
        };

        let row = null;

        if (typeof query === 'string') {
            // Legacy/Simple String Lookup
            this._buildLookupMaps();
            row = this._simpleMap ? this._simpleMap.get(query.trim()) : null;
        } else if (typeof query === 'object') {
            // Robust Lookup
            row = this.findMatchedRow(query);
        }

        if (!row) return result;

        result.Found = true;
        result.Row = row;

        const map = getState("linelist").smartMap;

        // Extract Basic Attributes (Using updated keys)
        if (map.P1) result.P1 = row[map.P1];
        if (map.T1) result.T1 = row[map.T1];
        if (map.InsThk) result.InsThk = row[map.InsThk];
        if (map.InsType) result.InsType = row[map.InsType];
        if (map.HP) result.HP = row[map.HP];
        if (map.PipingClass) result.PipingClass = row[map.PipingClass];

        // Density / Phase Logic
        const config = getConfig();
        const densityLogic = config.smartData?.densityLogic || {};

        let phase = map.Phase ? row[map.Phase] : null;
        result.Phase = phase;

        // Priority 1: Direct density column — use it as-is when mapped.
        // Phase-based gas/liquid/mixed logic is invoked only when DensityDirect is NOT mapped.
        if (map.DensityDirect && row[map.DensityDirect] != null && row[map.DensityDirect] !== "") {
            result.Density = row[map.DensityDirect];
        } else {
            let dGas = map.DensityGas ? row[map.DensityGas] : null;
            let dLiq = map.DensityLiquid ? row[map.DensityLiquid] : null;
            let dMix = map.DensityMixed ? row[map.DensityMixed] : null;

            let selectedDensity = null;
            const phaseStr = String(phase || "").toUpperCase();

            if (phaseStr.startsWith("G")) {
                selectedDensity = dGas;
            } else if (phaseStr.startsWith("M")) {
                const pref = densityLogic.mixedPreference || "Liquid";
                selectedDensity = (pref === "Mixed") ? (dMix || dLiq) : (dLiq || dMix);
            } else {
                selectedDensity = dLiq;
            }

            if (selectedDensity == null || selectedDensity === "") {
                if (phaseStr.startsWith("G")) selectedDensity = densityLogic.defaultGas;
                else selectedDensity = densityLogic.defaultLiquid;
            }

            result.Density = selectedDensity;
        }

        return result;
    }

    // Helper to allow updating options/mapping (from UI)
    updateSmartMapping(key, value) {
        const s = getState("linelist");
        const smartMapping = { ...s.smartMap, [key]: value };
        setState("linelist", { ...s, smartMap: smartMapping });
        this._invalidateCache(); // Maps might rely on these keys
        this._saveConfig();
    }

    updateSmartOptions(key, value) {
        const s = getState("linelist");
        const smartOptions = { ...s.smartOptions, [key]: value };
        setState("linelist", { ...s, smartOptions });
        this._saveConfig();
    }

    _saveConfig() {
        const state = getState("linelist");
        localStorage.setItem("pcf_linelist_config", JSON.stringify({
            smartMap: state.smartMap,
            keys: state.keys,
            smartOptions: state.smartOptions,
            headers: state.headers
        }));
    }
}

export const linelistService = new LinelistService();
