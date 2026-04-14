import { gate } from "./gate-logger.js";
import { log } from "../logger.js";
import { ExcelParser } from "./excel-parser.js"; // Import ExcelParser
import { materialService } from "./material-service.js"; // Import MaterialService

const MOD = 'DataManager';

/**
 * Central Data Store for the Integration Module.
 * Manages State for Linelist, Weights, Piping Class, Material Map, and PCF Data.
 * Includes schema validation on all setters.
 */
export class DataManager {
    constructor() {
        this.linelistData = [];
        this.weightData = [];
        this.pipingClassMaster = [];
        this.materialMap = [];  // Array of {code, desc}
        this.pcfData = [];
        this.lineDumpData = [];

        // Task 1: Conditional Ingestion Layer
        this.MasterDataReady = false;
        this._readyCallbacks = [];

        // Piping Class size-wise base URL (user configurable via UI)
        this._pipingClassBaseUrl = localStorage.getItem('pcf_piping_class_url') || './Docs/Masters/piping_class/size_wise/';

        // Default Header mappings (user configurable)
        this.headerMap = {
            linelist: {
                lineNo: 'Line Number',
                service: 'Service',
            },
            weights: {
                size: 'Size (NPS)', // Default used for fuzzy matching. User data might be "Size (NPS)" or "DN"
                length: 'Length (RF-F/F)',
                description: 'Type Description',
                weight: 'RF/RTJ KG', // Default used for fuzzy matching
                rating: 'Rating'
            },
            pipingclass: {
                size: 'Size',
                class: 'Piping Class',
                material: 'Material_Name',
                wall: 'Wall Thickness',
                corrosion: 'Corrosion Allowance'
            },
            linedump: {
                lineNo: 'Line No. (Derived)',
                position: 'Position',
                x: 'East',
                y: 'North',
                z: 'Up'
            }
        };

        // Dynamic Attribute Mappings
        this.attributeMap = {};

        // Change listeners (for index invalidation)
        this._onChangeCallbacks = [];

        // Start Boot Sequence
        this._bootSequence();
    }

    /**
     * Executes the strict boot sequence for data loading.
     */
    async _bootSequence() {
        console.info('[DataManager] Starting boot sequence...');

        // Load global configs to check lazy-load toggles
        let autoLoadPipingClass = false;
        try {
            const { getConfig } = await import('../config/config-store.js');
            const config = getConfig();
            autoLoadPipingClass = config.smartData?.autoLoadPipingClassMasters === true;
        } catch (e) {
            console.warn('[DataManager] Could not read config for piping class auto-load toggle.');
        }

        // Priority 2: Load explicitly saved data from LocalStorage
        this.loadFromStorage(autoLoadPipingClass);

        // Priority 3: Fallback to Public Defaults
        try {
            await this.loadPublicDefaults();
        } catch (e) {
            console.error('[DataManager] Boot sequence error during fallback loading:', e);
        } finally {
            // Lock Release
            this.MasterDataReady = true;
            console.info('[DataManager] MasterDataReady flag set to true.');
            this._notifyReady();
        }
    }

    /**
     * Register a callback to execute when MasterDataReady is true.
     */
    onReady(callback) {
        if (this.MasterDataReady) {
            try { callback(); } catch (e) { console.error(e); }
        } else {
            this._readyCallbacks.push(callback);
        }
    }

    _notifyReady() {
        for (const cb of this._readyCallbacks) {
            try { cb(); } catch (e) { console.error(e); }
        }
        this._readyCallbacks = [];
    }

    // ── Persistence ──────────────────────────────────────────────────

    saveToStorage(type = null) {
        try {
            if (!type || type === 'weights')
                localStorage.setItem('pcf_master_weights', JSON.stringify(this.weightData));
            if (!type || type === 'pipingclass')
                localStorage.setItem('pcf_master_pipingclass', JSON.stringify(this.pipingClassMaster));
            if (!type || type === 'linedump')
                localStorage.setItem('pcf_master_linedump', JSON.stringify(this.lineDumpData));
            if (!type || type === 'linelist')
                localStorage.setItem('pcf_master_linelist', JSON.stringify(this.linelistData));
            if (!type || type === 'materialmap')
                localStorage.setItem('pcf_master_materialmap', JSON.stringify(this.materialMap));
            if (!type || type === 'headermap')
                localStorage.setItem('pcf_master_headermap', JSON.stringify(this.headerMap));
        } catch (e) {
            console.warn('[DataManager] Failed to save to localStorage (likely quota exceeded):', e);
        }
    }

    loadFromStorage(autoLoadPipingClass = false) {
        const SAFE_LENGTH_LIMIT = 5000000; // 5MB char limit

        const safeParse = (key, fallback) => {
            try {
                const str = localStorage.getItem(key);
                if (!str) return fallback;
                // Log warning but DO NOT delete user data. It might be legitimately large.
                if (str.length > SAFE_LENGTH_LIMIT) {
                    console.warn(`[DataManager] ${key} is very large (${str.length} chars). Parsing may block main thread.`);
                }
                return JSON.parse(str);
            } catch (e) {
                console.warn(`[DataManager] Corrupt data for ${key}`, e);
                localStorage.removeItem(key);
                return fallback;
            }
        };

        try {
            this.weightData = safeParse('pcf_master_weights', []);

            // Logic Fix: Only parse the massive piping class into active memory if the user's config explicitly asks for it.
            // Otherwise, leave it safely dormant in localStorage.
            if (autoLoadPipingClass) {
                this.pipingClassMaster = safeParse('pcf_master_pipingclass', []);
                console.info(`[DataManager] Piping Class Master auto-loaded into memory (${this.pipingClassMaster.length} rows) because toggle is ON.`);
            } else {
                this.pipingClassMaster = [];
                console.info('[DataManager] Piping Class Master left in localStorage (not parsed into memory) because auto-load toggle is OFF.');
            }

            this.lineDumpData = safeParse('pcf_master_linedump', []);
            this.linelistData = safeParse('pcf_master_linelist', []);
            this.materialMap = safeParse('pcf_master_materialmap', []);

            const hMap = localStorage.getItem('pcf_master_headermap');
            if (hMap) {
                try {
                    const parsed = JSON.parse(hMap);
                    // Deep merge to ensure defaults are preserved if missing in storage
                    this.headerMap = {
                        linelist: { ...this.headerMap.linelist, ...parsed.linelist },
                        weights: { ...this.headerMap.weights, ...parsed.weights },
                        pipingclass: { ...this.headerMap.pipingclass, ...parsed.pipingclass },
                        linedump: { ...this.headerMap.linedump, ...parsed.linedump }
                    };
                }
                catch (e) { console.warn('[DataManager] Corrupt header map', e); }
            }

            // Ensure arrays are initialized even if parse fails
            this.weightData = this.weightData || [];
            this.pipingClassMaster = this.pipingClassMaster || [];
            this.lineDumpData = this.lineDumpData || [];
            this.linelistData = this.linelistData || [];
            this.materialMap = this.materialMap || [];

            console.info('[DataManager] Loaded master data from storage.', {
                weights: this.weightData.length,
                pipingClass: this.pipingClassMaster.length,
                lineDump: this.lineDumpData.length,
                linelist: this.linelistData.length
            });

            // Prime the loaded piping sizes set so loadPipingClassSizes() skips already-loaded sizes.
            // Without this, re-calling loadPipingClassSizes() after a page reload would re-fetch
            // all sizes that are already in localStorage (delta append only applies to new sizes).
            if (this.pipingClassMaster.length > 0) {
                this._loadedPipingSizes = this._loadedPipingSizes || new Set();
                const sizeKey = this.headerMap.pipingclass.size || 'Size';
                for (const row of this.pipingClassMaster) {
                    const sz = String(row[sizeKey] || '').trim().replace(/[^a-zA-Z0-9]/g, '_');
                    if (sz) this._loadedPipingSizes.add(sz);
                }
            }

        } catch (e) {
            console.error('[DataManager] Failed to load from localStorage:', e);
            // Initialize empty as fallback
            this.weightData = [];
            this.pipingClassMaster = [];
            this.lineDumpData = [];
            this.linelistData = [];
            this.materialMap = [];
        }
    }

    async loadPublicDefaults() {
        let autoLoad = false;
        try {
            const { getConfig } = await import('../config/config-store.js');
            const config = getConfig();
            autoLoad = config.smartData?.autoLoadWeightsAndMatMap === true;
        } catch (e) {
            console.warn('[DataManager] Could not read config for autoLoad defaults.');
        }

        // Changed logic: As per new spec, always auto-load if missing/empty
        if (!autoLoad) {
            console.info('[DataManager] AutoLoad is false in config, but overriding to ALWAYS load as per spec.');
            // We ignore the config.smartData.autoLoadWeightsAndMatMap and force load it anyway.
        }

        if (this._isLoadingDefaults) return;
        this._isLoadingDefaults = true;

        console.info('[DataManager] Checking for default master data to load in parallel...');

        const fetchPromises = [];

        // 1. Material Map
        if (this.materialMap.length === 0) {
            fetchPromises.push(
                fetch('./Docs/Masters/PCF_MAT_MAP.json')
                    .then(res => res.ok ? res.json() : Promise.reject(`Status ${res.status}`))
                    .then(result => {
                        if (result && result.length > 0) {
                            // Don't trigger change events here to strictly enforce MasterDataReady sync
                            this.materialMap = result;
                            console.info(`[DataManager] Auto-loaded Material Map: ${result.length} entries`);
                        }
                    })
                    .catch(e => console.warn('[DataManager] Default Material Map fetch failed:', e))
            );
        }

        // 2. Weight Master
        if (this.weightData.length === 0) {
            fetchPromises.push(
                fetch('./Docs/Masters/wtValveweights.json')
                    .then(res => res.ok ? res.json() : Promise.reject(`Status ${res.status}`))
                    .then(result => {
                        if (result && result.length > 0) {
                            // Don't trigger change events here to strictly enforce MasterDataReady sync
                            this.weightData = result;
                            console.info(`[DataManager] Auto-loaded Weight Master: ${result.length} rows`);
                        }
                    })
                    .catch(e => console.warn('[DataManager] Default Weight Master fetch failed:', e))
            );
        }

        if (fetchPromises.length > 0) {
            await Promise.allSettled(fetchPromises);
            // Save newly fetched defaults to local storage to skip fetch next time
            this.saveToStorage();
            // Now that all promises are settled, safely notify subscribers
            this._notifyChange('materialmap');
            this._notifyChange('weights');
        }

        this._isLoadingDefaults = false;
    }

    /**
     * Lazily loads specific bore sizes for the Piping Class Master to save memory.
     * Appends to existing pipingClassMaster data.
     * @param {string[]} sizes Array of size strings (e.g. ["1", "0.5", "10"])
     */
    async loadPipingClassSizes(sizes) {
        if (!sizes || sizes.length === 0) return;

        let newRowsAdded = 0;
        // Keep track of loaded sizes to avoid refetching
        this._loadedPipingSizes = this._loadedPipingSizes || new Set();

        const fetchPromises = sizes.map(async (sizeStr) => {
            const cleanSize = String(sizeStr).trim().replace(/[^a-zA-Z0-9]/g, '_');
            if (!cleanSize || this._loadedPipingSizes.has(cleanSize)) return;

            try {
                const baseUrl = this._pipingClassBaseUrl.endsWith('/') ? this._pipingClassBaseUrl : this._pipingClassBaseUrl + '/';
                const res = await fetch(`${baseUrl}${cleanSize}.json`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.length > 0) {
                        // Append without replacing existing items
                        this.pipingClassMaster.push(...data);
                        this._loadedPipingSizes.add(cleanSize);
                        newRowsAdded += data.length;
                        console.info(`[DataManager] Lazily loaded Piping Class Master for size ${sizeStr}: ${data.length} rows`);
                    }
                }
            } catch (e) {
                // Not all sizes will have a file, that's fine.
            }
        });

        await Promise.all(fetchPromises);

        if (newRowsAdded > 0) {
            console.info(`[DataManager] Lazy load complete. Total Piping Class Master rows: ${this.pipingClassMaster.length}`);
            setTimeout(() => this.saveToStorage('pipingclass'), 0);
            this._notifyChange('pipingclass');
        }
    }

    // ── Schema Validation ────────────────────────────────────────────

    /**
     * Validate rows against expected schema.
     * @param {Array} data - Array of row objects
     * @param {string[]} requiredKeys - Keys that must exist on each row
     * @param {string} source - Label for logging
     * @returns {{ valid: Array, rejected: number, warnings: string[] }}
     */
    _validateSchema(data, requiredKeys, source) {
        if (!Array.isArray(data)) {
            log('ERROR', MOD, '_validateSchema', `${source}: Expected array, got ${typeof data}`);
            return { valid: [], rejected: 0, warnings: [`${source}: Input is not an array`] };
        }

        const valid = [];
        const warnings = [];
        let rejected = 0;

        // Check if headers exist at all (first row)
        if (data.length > 0) {
            const firstRowKeys = Object.keys(data[0]);
            const missingHeaders = requiredKeys.filter(k =>
                !firstRowKeys.some(h => h.trim().toLowerCase() === k.trim().toLowerCase())
            );
            if (missingHeaders.length > 0) {
                warnings.push(`${source}: Missing expected columns: ${missingHeaders.join(', ')}`);
                log('WARN', MOD, '_validateSchema', `${source}: Missing columns`, { missingHeaders });
            }

            // Check for near-matches (whitespace issues)
            for (const required of requiredKeys) {
                const exactMatch = firstRowKeys.find(h => h === required);
                const fuzzyMatch = firstRowKeys.find(h => h.trim() === required && h !== required);
                if (!exactMatch && fuzzyMatch) {
                    warnings.push(`${source}: Column "${fuzzyMatch}" has extra whitespace (expected "${required}")`);
                    log('WARN', MOD, '_validateSchema', `${source}: Whitespace mismatch`, {
                        expected: required, actual: fuzzyMatch
                    });
                }
            }
        }

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (row == null || typeof row !== 'object') {
                rejected++;
                continue;
            }
            // Row must have at least 1 non-empty value
            const values = Object.values(row);
            const hasContent = values.some(v => v != null && String(v).trim() !== '');
            if (!hasContent) {
                rejected++;
                continue;
            }
            valid.push(row);
        }

        return { valid, rejected, warnings };
    }

    // ── Setters (with validation) ────────────────────────────────────

    setLinelist(data) {
        const requiredKeys = [this.headerMap.linelist.lineNo];
        const { valid, rejected, warnings } = this._validateSchema(data, requiredKeys, 'Linelist');

        this.linelistData = valid;
        setTimeout(() => this.saveToStorage('linelist'), 0);
        this._notifyChange('linelist');

        gate(MOD, 'setLinelist', 'Linelist data loaded', {
            inputRows: data?.length ?? 0,
            validRows: valid.length,
            rejectedRows: rejected,
            warnings: warnings.length > 0 ? warnings : undefined,
            sampleHeaders: valid.length > 0 ? Object.keys(valid[0]) : []
        });
    }

    setWeights(data) {
        // No strict required-key validation — weight files vary widely in column naming.
        // Accept any row with at least one non-empty value.
        const { valid, rejected, warnings } = this._validateSchema(data, [], 'Weights');

        this.weightData = valid;
        setTimeout(() => this.saveToStorage('weights'), 0);
        this._notifyChange('weights');

        gate(MOD, 'setWeights', 'Weight data loaded', {
            inputRows: data?.length ?? 0,
            validRows: valid.length,
            rejectedRows: rejected,
            warnings: warnings.length > 0 ? warnings : undefined,
            sampleHeaders: valid.length > 0 ? Object.keys(valid[0]) : []
        });
    }

    setPipingClassMaster(data) {
        const requiredKeys = [this.headerMap.pipingclass.class];
        const { valid, rejected, warnings } = this._validateSchema(data, requiredKeys, 'PipingClassMaster');

        this.pipingClassMaster = valid;
        setTimeout(() => this.saveToStorage('pipingclass'), 0);
        this._notifyChange('pipingclass');

        gate(MOD, 'setPipingClassMaster', 'Piping Class Master loaded', {
            inputRows: data?.length ?? 0,
            validRows: valid.length,
            rejectedRows: rejected,
            warnings: warnings.length > 0 ? warnings : undefined,
            sampleHeaders: valid.length > 0 ? Object.keys(valid[0]) : []
        });
    }

    setPipingClassBaseUrl(url) {
        this._pipingClassBaseUrl = url || './Docs/Masters/piping_class/size_wise/';
        localStorage.setItem('pcf_piping_class_url', this._pipingClassBaseUrl);
        // Clear loaded sizes cache so sizes will be re-fetched from new URL
        this._loadedPipingSizes = new Set();
    }

    setMaterialMap(data) {
        this.materialMap = Array.isArray(data) ? data : [];
        setTimeout(() => this.saveToStorage('materialmap'), 0);
        this._notifyChange('materialmap');

        gate(MOD, 'setMaterialMap', 'Material Map loaded', {
            entries: this.materialMap.length
        });
    }

    setPCF(data) {
        this.pcfData = data;
        this._notifyChange('pcf');
    }

    setLineDump(data) {
        const { valid, rejected } = this._validateSchema(
            data, [], 'LineDump'
        );
        this.lineDumpData = valid;
        setTimeout(() => this.saveToStorage('linedump'), 0);
        this._notifyChange('linedump');

        const uniqueLines = new Set(this.lineDumpData.map(r => r['Line No. (Derived)']).filter(Boolean));
        gate(MOD, 'setLineDump', 'LineDump data loaded', {
            inputRows: data?.length ?? 0,
            validRows: valid.length,
            rejectedRows: rejected,
            derivedLineNosCount: uniqueLines.size
        });
    }

    // ── Getters ──────────────────────────────────────────────────────

    getLinelist() { return this.linelistData; }
    getWeights() { return this.weightData; }
    getPipingClassMaster() { return this.pipingClassMaster; }
    getMaterialMap() { return this.materialMap; }
    getPCF() { return this.pcfData; }
    getLineDump() { return this.lineDumpData; }

    // ── Header Map ───────────────────────────────────────────────────

    updateHeaderMap(type, newMap) {
        if (this.headerMap[type]) {
            this.headerMap[type] = { ...this.headerMap[type], ...newMap };
            setTimeout(() => this.saveToStorage('headermap'), 0);
            this._notifyChange(type);
        }
    }

    // ── Attribute Mappings ───────────────────────────────────────────

    setAttributeMapping(sourceCol, targetAttr) {
        this.attributeMap[sourceCol] = targetAttr;
    }

    removeAttributeMapping(sourceCol) {
        delete this.attributeMap[sourceCol];
    }

    // ── Change Notification ──────────────────────────────────────────

    /**
     * Register a callback for data changes.
     * Used by MappingEngine to invalidate indexes.
     */
    onChange(callback) {
        this._onChangeCallbacks.push(callback);
    }

    _notifyChange(dataType) {
        for (const cb of this._onChangeCallbacks) {
            try { cb(dataType); } catch (_) { /* swallow */ }
        }
    }

    // ── Reset ────────────────────────────────────────────────────────

    reset() {
        this.linelistData = [];
        this.weightData = [];
        this.pipingClassMaster = [];
        this.materialMap = [];
        this.pcfData = [];
        this.lineDumpData = [];
        this.attributeMap = {};
        this._notifyChange('reset');
    }
}

export const dataManager = new DataManager();
