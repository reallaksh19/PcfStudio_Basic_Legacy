import { dataManager } from './data-manager.js';

/**
 * Material Service
 * Encapsulates logic for Piping Class Extraction, Material Mapping (Smart Match),
 * and Attribute Resolution (CA3, CA4, CA7).
 */
export class MaterialService {

    /**
     * Extracts Piping Class from the "PIPE" string.
     * Rule: 4th token (index 3) when split by '-'.
     * Example: FCSEE-16"-P0511260-11440A1-01 -> 11440A1
     * @param {string} pipeStr
     * @returns {string|null}
     */
    extractPipingClass(pipeStr) {
        if (!pipeStr) return null;
        const parts = pipeStr.split('-');
        if (parts.length > 3) {
            // Index 0: FCSEE
            // Index 1: 16"
            // Index 2: P0511260 (Line No)
            // Index 3: 11440A1 (Class)
            return parts[3];
        }
        return null;
    }

    /**
     * Parses the PCF Material Map text file.
     * Format: Code Description (space/tab separated)
     * e.g. "106 106"
     * @param {string} text 
     * @returns {Array} [{code: "106", desc: "106"}]
     */
    parseMaterialMap(text) {
        const lines = text.split('\n');
        return lines.map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 2) return null;
            return {
                code: parts[0],
                desc: parts.slice(1).join(' ')
            };
        }).filter(x => x);
    }

    /**
     * Fuzzy-match a material name against PCF Material Map entries.
     * Supports exact, contains, and token overlap matching.
     * @param {string} raw
     * @param {Array} matMap
     * @returns {{code: string, desc: string, score: number, method: string}|null}
     */
    _fuzzyMatchMaterial(raw, matMap) {
        if (!raw || !Array.isArray(matMap) || !matMap.length) return null;

        const norm = (s) => String(s || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const toks = (s) => new Set(norm(s).split(' ').filter(Boolean));

        const rawNorm = norm(raw);
        const rawToks = toks(raw);

        let best = null;
        let bestScore = 0;

        for (const entry of matMap) {
            const desc = entry.desc || entry.Desc || entry.description || entry.Description || '';
            const code = entry.code || entry.Code || '';
            if (!desc || !code) continue;

            const descNorm = norm(desc);
            if (rawNorm === descNorm) return { code, desc, score: 1, method: 'exact' };

            if (rawNorm.includes(descNorm) || descNorm.includes(rawNorm)) {
                if (0.9 > bestScore) {
                    bestScore = 0.9;
                    best = { code, desc, score: 0.9, method: 'contains' };
                }
                continue;
            }

            const descToks = toks(desc);
            const shared = [...rawToks].filter(t => descToks.has(t)).length;
            const unionSize = new Set([...rawToks, ...descToks]).size;
            const jaccard = unionSize > 0 ? shared / unionSize : 0;
            if (jaccard >= 0.35 && jaccard > bestScore) {
                bestScore = jaccard;
                best = { code, desc, score: jaccard, method: 'token-jaccard' };
            }
        }

        return best;
    }

    _normalizeMaterialKey(raw) {
        return String(raw || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '')
            .trim();
    }

    _resolveMaterialOverride(raw, overrides) {
        if (!raw || !overrides) return '';
        const key = this._normalizeMaterialKey(raw);
        if (!key) return '';
        if (overrides instanceof Map) {
            return String(overrides.get(key) || '').trim();
        }
        if (typeof overrides === 'object') {
            return String(overrides[key] || overrides[raw] || '').trim();
        }
        return '';
    }

    resolveMaterialCode(raw, matMap = null, overrides = null) {
        const override = this._resolveMaterialOverride(raw, overrides);
        if (override) return override;
        const entries = Array.isArray(matMap) ? matMap : (dataManager.getMaterialMap() || []);
        const best = this._fuzzyMatchMaterial(raw, entries);
        return best?.code ? String(best.code).trim() : '';
    }

    /**
     * Smart Match: Piping Class -> Material Name -> Material Code
     * @param {string} pipingClass Extracted class e.g. "11440A1"
     * @returns {Object} { materialCode, wallThickness, corrosion }
     */
    resolveAttributes(pipingClass, materialOverrides = null) {
        const result = {
            materialCode: null, // CA3
            materialName: null,
            wallThickness: null, // CA4
            corrosion: null     // CA7
        };

        if (!pipingClass) return result;

        const master = dataManager.getPipingClassMaster();
        const matMap = dataManager.getMaterialMap();

        if (!master || master.length === 0) return result;

        // 1. Find Entry in Piping Class Master
        const classCol = dataManager.headerMap.pipingclass.class || 'Piping Class';

        let match = master.find(row => row[classCol] === pipingClass);

        if (!match) {
            // Try fuzzy / startsWith
            match = master.find(row => pipingClass.startsWith(row[classCol]) || row[classCol]?.startsWith(pipingClass));
        }

        if (match) {
            // 2. Extract Details
            const wallCol = dataManager.headerMap.pipingclass.wall || 'Wall thickness';
            const corrCol = dataManager.headerMap.pipingclass.corrosion || 'Corrosion';
            const matNameCol = dataManager.headerMap.pipingclass.material || 'Material_Name';

            result.wallThickness = match[wallCol];
            result.corrosion = match[corrCol];

            const materialName = match[matNameCol]; // e.g. "ASTM A-106 B"
            result.materialName = materialName || null;

            // 3. Smart Match with Material Map
            if (materialName) {
                result.materialCode = this.resolveMaterialCode(materialName, matMap, materialOverrides) || null;
            }
        }

        return result;
    }
}

export const materialService = new MaterialService();
