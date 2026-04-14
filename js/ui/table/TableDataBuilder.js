/**
 * TableDataBuilder.js
 * Handles data preparation, smart column mapping, and row generation logic.
 */

import { getState } from "../../state.js";
import { getConfig } from "../../config/config-store.js";
import { mappingService } from "../../services/mapping-service.js";
import { weightService } from "../../services/weight-service.js";
import { linelistService } from "../../services/linelist-service.js";
import { dataManager } from "../../services/data-manager.js";
import { getTopologyData } from "../../services/topology-service.js";
import { detectRating } from "../../services/rating-detector.js";
import { materialService } from "../../services/material-service.js";
import { resolveWeightForCa8 } from "../../services/fallbackcontract.js";

export class TableDataBuilder {
    constructor(logger) {
        this.logger = logger;
    }

    /**
     * Build table rows from groups state.
     * @returns {Array} Array of row arrays
     */
    buildData(groups, tolerance, materialOverrides = new Map()) {
        const config = getConfig(); // Move to top scope to fix ReferenceError
        const sortedGroups = Array.from(groups.values())
            .filter((g) => !g.skip)
            .sort((a, b) => (a.firstRowIndex || 0) - (b.firstRowIndex || 0));

        const table1Groups = [];
        const table2Groups = [];
        const mappedTol = parseFloat(tolerance) || 0;

        // Bifurcate Groups
        // NEW LOGIC: Follow "Sort Skipped/Zero Length" toggle.
        // If ON, push "Skipped/Zerolength" items to Table 2.
        // If OFF, everything goes to Table 1.
        const sortSkippedZero = config.coordinateSettings?.sortSkippedZero !== false; // Default ON

        // Use same sort logic as Stage 4 (Mapping Tab)
        const sortFn = (a, b) => {
            if (sortSkippedZero) {
                const isA = a.skip || (a.lenCalc || 0) === 0;
                const isB = b.skip || (b.lenCalc || 0) === 0;
                if (isA && !isB) return 1;
                if (!isA && isB) return -1;
            }
            return (a.firstRowIndex || 0) - (b.firstRowIndex || 0);
        };

        const reSorted = sortedGroups.sort(sortFn);

        reSorted.forEach((g) => {
            const t = String(g.pcfType || '').trim().toUpperCase();
            const stage4Len = g.lenCalc !== undefined ? g.lenCalc : (parseFloat(g.rows?.[0]?.Len_Calc) || 0);

            // If Sort ON: Items sorted to bottom (Skipped or ZeroLen) go to Table 2
            // If Sort OFF: Everything to Table 1
            let isTable2 = false;

            if (sortSkippedZero) {
                if (g.skip || Math.abs(stage4Len) === 0) {
                    isTable2 = true;
                }
            } else {
                // If sort OFF, user wants everything in sequence (Table 1)
                isTable2 = false;
            }

            if (isTable2) table2Groups.push(g);
            else table1Groups.push(g);

            g._isPointComponent = isTable2;
        });

        const rows = [];
        const groupsMap = getState("groups"); // Needed for Sequence Lookup
        const topologyMap = getState("topology");
        // const config = getConfig(); // Already defined at top
        const linelistData = linelistService.getData();
        const smartMapping = (getState("linelist") || {}).smartMapping || {};
        const smartOptions = (getState("linelist") || {}).smartOptions || {};
        const lineDumpData = dataManager.getLineDump() || [];
        const dumpCoordTolerance = 25.0; // Fixed tolerance for Line Dump lookup

        // Helper: Get Sequence Number from RefNo
        const getRowIdx = (f) => {
            if (!f || f === "N/A" || f === "") return "";
            // Split by comma, then take the first part (RefNo), removing any suffix like "(Br)"
            // Example: "=67130482/1666 (Br)" -> "=67130482/1666"
            let ref = f.split(',')[0].trim();
            ref = ref.split(' ')[0].trim();
            const g = groupsMap.get(ref);
            // Fallback: If not found, check if 'f' itself is the sequence? No, 'f' is RefNo.
            // If RefNo not found, return original string for debugging? No, keep clean.
            return (g && g.firstRowIndex !== undefined) ? g.firstRowIndex + 1 : "";
        };

        sortedGroups.forEach((group, idx) => {
            const firstRow = group.rows && group.rows[0] ? group.rows[0] : {};
            const type = group.pcfType;
            const isSynthetic = !group.rows || group.rows.length === 0;

            // Geometry & IDs
            let rawE, rawN, rawU, dn, refNo;

            // Prioritize the processed geometry engine points (which includes True Coordinate Snapping)
            const pts = group.pts || {};
            const p1 = pts["1"] || Object.values(pts)[0];

            if (p1 && p1.E !== undefined) {
                rawE = p1.E;
                rawN = p1.N;
                rawU = p1.U;
                dn = p1.bore || parseFloat(firstRow.Bore) || 0;
            } else {
                rawE = firstRow.StartX ?? firstRow.East;
                rawN = firstRow.StartY ?? firstRow.North;
                rawU = firstRow.StartZ ?? firstRow.Up;
                dn = parseFloat(firstRow.Bore) || 0;
            }

            refNo = group.refno || firstRow?.RefNo || ("Synthetic_" + Math.random());

            const startX = (typeof rawE === 'number' ? rawE : parseFloat(rawE) || 0).toFixed(1);
            const startY = (typeof rawN === 'number' ? rawN : parseFloat(rawN) || 0).toFixed(1);
            const startZ = (typeof rawU === 'number' ? rawU : parseFloat(rawU) || 0).toFixed(1);
            const lenCalc = parseFloat(firstRow.Len_Calc || firstRow.LENCALC || 0);
            const sequence = group.firstRowIndex !== undefined ? group.firstRowIndex + 1 : "-";

            // Line No Derived
            const geoLineNo = this.matchLineDump({ x: parseFloat(startX), y: parseFloat(startY), z: parseFloat(startZ), refNo: refNo }, lineDumpData, dumpCoordTolerance);
            const finalLineNo = geoLineNo || "";

            // Topology Data
            const isPointComponent = group._isPointComponent;
            const contextualArray = isPointComponent ? table2Groups : table1Groups;
            const contextualIdx = contextualArray.indexOf(group);

            const topData = getTopologyData(
                group, contextualIdx, contextualArray,
                topologyMap, groupsMap, config, tolerance, finalLineNo
            );

            // Override Smart Logic if pre-calculated
            if (group.nextSmart) topData.smart.nextSmart = group.nextSmart;
            if (group.prevSmart) topData.smart.prevSmart = group.prevSmart;

            const { axis1, len1, axis2, len2, axis3, len3 } = topData.geometry;

            // Derived Data
            // Helper to clean tick and ensure lookup
            const resolveToSeq = (val) => {
                if (!val || val === 'N/A') return val;
                const cleanVal = val.replace(' ✓', '').trim();
                // If it looks like a number, assume it's already a Sequence
                if (/^\d+$/.test(cleanVal)) return cleanVal;
                // Else try to look up as RefNo; leave blank when no match exists
                return getRowIdx(cleanVal) || '';
            };

            // Stage 4 Validation Overrides
            // Use static validation results if available (populated by validateConnectivity)
            const valStats = group.validation || {};
            // Prev(SeqNo) -> valStats.prevValid (which is just icon) + SeqNo?
            // Actually getTopologyData returns seq No. validateConnectivity returns icon.
            // User requested "directly used from stage 4".
            // Stage 4 shows: "SeqNo (Dist) Icon".
            // Table columns are separate: Prev(SeqNo), Prev(mm)...

            // If validation exists, use its distance calculations for consistency
            // Note: validation.prevValid is '✅' or '❌'. topData.seq.prevValid is "4 ✓".
            // We'll trust topData for the Sequence Number reference, but use validation for gap/dist?
            // Actually, getTopologyData logic is consistent with validateConnectivity logic.
            // But let's check validation.prevDist if available.
            const prevSeqDist = valStats.prevDist ? valStats.prevDist.split(' ')[0] : topData.seq.prevDistStr;
            const nextSeqDist = valStats.nextDist ? valStats.nextDist.split(' ')[0] : topData.seq.nextDistStr;

            // Mapped Columns per user request:
            // Prev(Target) / Next(Target) -> Based on Mode (Strict/Repair/Seq)
            // Prev(EP1) / Next(EP2) -> Actual connectivity (Smart/Hybrid)
            const prevTarget = topData.final.prevF === 'N/A' ? 'N/A' : resolveToSeq(topData.final.prevF);
            const nextTarget = topData.final.nextF === 'N/A' ? 'N/A' : resolveToSeq(topData.final.nextF);

            const prevEP1 = topData.smart.prevSmart ? resolveToSeq(topData.smart.prevSmart) : "";
            const nextEP2 = topData.smart.nextSmart ? resolveToSeq(topData.smart.nextSmart) : "";

            // Attributes & Weights
            const attrs = this.resolveAttributes(group, firstRow, finalLineNo, dn, len1, type, smartMapping, smartOptions, tolerance, materialOverrides);

            // Row Array Construction  index 0: CSV Seq No, rest shift +1
            // 0: CSV Seq No (from firstRow), 1: Sequence, 2: RefNo, 3: Component
            const csvSeqNo = !isSynthetic
                ? (firstRow['Seq No.'] || firstRow['Seq No'] || firstRow.Sequence || firstRow.SeqNo || 'N/A')
                : 'N/A';

            const row = [
                csvSeqNo,
                sequence, refNo, type, startX, startY, startZ, dn,
                lenCalc.toFixed(2),
                axis1, topData.geometry.groupL1?.toFixed(1) || "",
                axis2, topData.geometry.groupL2?.toFixed(1) || "",
                axis3, topData.geometry.groupL3?.toFixed(1) || "",
                // SeqNo Logic (4 cols)
                topData.seq.prevValid, topData.seq.nextValid, prevSeqDist, nextSeqDist,
                // Smart Logic (4 cols)
                topData.smart.prevSmart, topData.smart.nextSmart, topData.smart.prevSmartDist, topData.smart.nextSmartDist,
                // Final Route (4 cols)
                prevTarget, nextTarget, prevEP1, nextEP2,
                finalLineNo,
                attrs.p1, attrs.t1, attrs.insThk, attrs.insDen, attrs.density, attrs.hp,
                attrs.pipingClass, attrs.rating, attrs.rigidType, attrs.weight, attrs.material, attrs.wall,
                // Support GUID (last column)
                attrs.supportName
            ];

            rows.push({
                data: row,
                isPoint: isPointComponent,
                group: group,
                materialResolution: attrs.materialNeedsSelection ? {
                    description: attrs.materialDesc,
                    key: attrs.materialKey
                } : null
            });

            if (type === 'TEE') {
                console.log(`[TEE TRACKER] [Phase 2: Data Table Gen] TEE ${refNo}: Grp L3 resolved to => "${topData.geometry.groupL3?.toFixed(1) || ""}"`);
            }
        });

        return rows;
    }

    matchLineDump(point, lineDumpData, tolerance) {
        if (!point || !lineDumpData || lineDumpData.length === 0) return "";
        const px = point.x, py = point.y, pz = point.z;
        const map = dataManager.headerMap.linedump || {};

        let bestMatch = null;
        let bestDist = Infinity;

        // Helper to find value from multiple possible headers
        const findVal = (r, keys) => {
            for (const k of keys) {
                // Ensure exact match logic is preferred if map.x is specific
                if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== "") return r[k];
            }
            return null;
        };

        const xKeys = [map.x, 'East', 'E', 'X', 'Easting', 'X-Coord'].filter(Boolean);
        const yKeys = [map.y, 'North', 'N', 'Y', 'Northing', 'Y-Coord'].filter(Boolean);
        const zKeys = [map.z, 'Up', 'U', 'Z', 'Elevation', 'Z-Coord'].filter(Boolean);

        for (const row of lineDumpData) {
            // First check RefNo text match if the row has a direct pipeline reference string
            // We'll see if the user passed 'refNo' in the point object (added below)
            if (point.refNo) {
                // If LineDump contains a Pipeline reference or RefNo that matches
                const refNoKey = findVal(row, ['RefNo', 'Pipeline Reference', 'Pipeline']);
                if (refNoKey && String(refNoKey).includes(point.refNo)) {
                    return row[map.lineNo] || row["Line Number (Derived)"] || row["Line Number"] || "";
                }
            }

            let coords = null;

            const rawX = findVal(row, xKeys);
            const rawY = findVal(row, yKeys);

            if (rawX !== null && rawY !== null) {
                const rx = parseFloat(String(rawX).replace(/[^\d.-]/g, ''));
                const ry = parseFloat(String(rawY).replace(/[^\d.-]/g, ''));
                // Exclude Z as per user instruction: "only Start X, Start Y vs E, N exclude z and Up"
                if (!isNaN(rx) && !isNaN(ry)) coords = { x: rx, y: ry };
            }

            if (!coords) {
                const posStr = row[map.position] || row["POSITION"] || row["Position"];
                if (posStr) {
                    const m = posStr.match(/[EWNS]?\s*([-\d.]+)\s*mm\s*[EWNS]?\s*([-\d.]+)\s*mm/i);
                    if (m) coords = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
                }
            }

            if (coords) {
                // Only use X and Y for distance calculation
                const dist = Math.sqrt((px - coords.x) ** 2 + (py - coords.y) ** 2);
                if (dist < tolerance && dist < bestDist) {
                    bestDist = dist;
                    bestMatch = row;
                }
            }
        }
        return bestMatch ? (bestMatch[map.lineNo] || bestMatch["Line Number (Derived)"] || bestMatch["Line Number"] || "") : "";
    }

    resolveAttributes(group, firstRow, lineNo, dn, len, type, smartMapping, smartOptions, tolerance, materialOverrides = new Map()) {
        const gAttrs = group.attributes || {};
        // Prefer spatially derived lineNo; if absent, fall back to raw row attributes or firstRow field
        let effectiveLineNo = lineNo;
        if (!effectiveLineNo) {
            // Try common line-number field names from the raw row data
            const lineNoFields = ['LineNo', 'Line No', 'Line Number', 'Line_No', 'LINENO', 'System'];
            for (const f of lineNoFields) {
                const v = firstRow[f] || gAttrs[f];
                if (v && String(v).trim()) { effectiveLineNo = String(v).trim(); break; }
            }
            // Also try via smart mapping key if available
            if (!effectiveLineNo && smartMapping.LineNo && firstRow[smartMapping.LineNo]) {
                effectiveLineNo = String(firstRow[smartMapping.LineNo]).trim();
            }
        }
        const lookupQuery = { LineNo: effectiveLineNo, Service: gAttrs["SERVICE"] || "" };
        const linelistRow = effectiveLineNo ? linelistService.findMatchedRow({ raw: lookupQuery }) : null;

        // Retrieve or Resolve
        let p1 = gAttrs['COMPONENT-ATTRIBUTE1'] || (linelistRow && linelistRow[smartMapping.P1]);
        let t1 = gAttrs['COMPONENT-ATTRIBUTE2'] || (linelistRow && linelistRow[smartMapping.T1]);
        let insThk = gAttrs['COMPONENT-ATTRIBUTE5'] || (linelistRow && linelistRow[smartMapping.InsThk]);
        let hp = gAttrs['COMPONENT-ATTRIBUTE10'] || (linelistRow && linelistRow[smartMapping.HP]);
        let pipingClass = gAttrs['PIPING-CLASS'] || gAttrs['PIPING-SPEC'] || (linelistRow && linelistRow[smartMapping.PipingClass]);

        let density = gAttrs['COMPONENT-ATTRIBUTE9'];
        if (!density && linelistRow) {
            // Density Logic
            const ph = (linelistRow[smartMapping.Phase] || "").toUpperCase();
            const dG = linelistRow[smartMapping.DensityGas];
            const dL = linelistRow[smartMapping.DensityLiq];
            const dM = linelistRow[smartMapping.DensityMixed];
            if (ph === 'G') density = dG;
            else if (ph === 'L') density = dL;
            else if (ph === 'M') density = (smartOptions.densityMixedPreference === "Mixed" ? dM : dL);
            else density = dL || dG || dM;
        }

        let insDen = gAttrs['COMPONENT-ATTRIBUTE6'];
        if (!insDen && parseFloat(insThk) > 0) insDen = "210";

        // Rigid Type & Weight
        const rigidResult = mappingService.resolveRigidType(dn, len || 0, tolerance);
        let rigidType = firstRow.Rigid || rigidResult.rigidType || "";
        let weight = gAttrs['COMPONENT-ATTRIBUTE8'];
        const valveType = type === 'VALVE'
            ? String(firstRow.Description || firstRow['Type Description'] || firstRow.TypeDesc || gAttrs['DESCRIPTION'] || gAttrs['Type Description'] || rigidType).trim()
            : '';

        if (!weight || weight === "" || weight === "0" || weight === "0 KG") {
        const resolved = resolveWeightForCa8({
            type,
            directWeight: weight,
            boreMm: dn,
            ratingClass: detectRating(pipingClass),
            valveType,
            lengthMm: len
        }, { includeApprovedFittings: true });
        gAttrs['CA8_TRACE'] = resolved.trace.join(' > ');
        if (resolved.weight != null) {
            weight = `${resolved.weight.toFixed(2)} KG`;
        } else if (!resolved.trace?.includes('blocked:ambiguous-valve-match')) {
            const wComp = { type, bore: dn, attributes: { ...gAttrs, "PIPING-CLASS": pipingClass }, eps: [] };
            if (valveType) wComp.valveType = valveType;
            if (group.pts && group.pts['1']) wComp.eps.push({ x: group.pts['1'].E, y: group.pts['1'].N, z: group.pts['1'].U });
            if (group.pts && group.pts['2']) wComp.eps.push({ x: group.pts['2'].E, y: group.pts['2'].N, z: group.pts['2'].U });
            if (len) wComp.length = len;

            const calcW = weightService.calculateWeight(wComp, linelistRow);
            if (calcW !== null && calcW > 0) {
                weight = calcW.toFixed(2) + " KG";
            } else if (type !== 'VALVE') {
                weight = rigidResult.weight || weight || "";
            } else {
                weight = weight || "";
            }
        } else {
            weight = weight || "";
        }
        }

        // Rating (derived from piping class)
        const ratingNum = detectRating(pipingClass);
        const rating = ratingNum !== null ? String(ratingNum) : "";

        // Material
        const existingMaterial = String(gAttrs['COMPONENT-ATTRIBUTE3'] || '').trim();
        let material = existingMaterial && !/\s/.test(existingMaterial) ? existingMaterial : '';
        let wall = gAttrs['COMPONENT-ATTRIBUTE4'];
        const matRes = materialService.resolveAttributes(pipingClass, materialOverrides);
        if (matRes.materialCode) material = matRes.materialCode;
        const materialDesc = matRes.materialName || '';
        const materialKey = materialDesc ? materialDesc.toLowerCase().replace(/[^a-z0-9]+/g, '') : '';
        const materialNeedsSelection = !!materialDesc && !material;
        if (!wall) {
            const matRes = mappingService.resolveMaterial(dn, pipingClass);
            if (!wall) wall = matRes.wall;
        }

        // Support Logic
        let supportGUID = "";
        let supportName = "";
        if (type === 'SUPPORT') {
            const config = getConfig();
            const guidCol = config.supportSettings?.guidSourceColumn || "NodeName";
            // Check raw CSV first (firstRow), then attributes
            supportGUID = firstRow[guidCol] || gAttrs['<SUPPORT_GUID>'] || "";
            if (supportGUID && !supportGUID.startsWith('UCI:')) supportGUID = `UCI:${supportGUID}`;

            // Calculate Support Name (Restraint Type Logic)
            // Use original row data + attributes
            supportName = mappingService.resolveSupportName({ ...firstRow, ...gAttrs });

            // Store calculated name in attributes for persistence/export
            // We do NOT show this in the table column (requested to show GUID only)
            if (!group.attributes) group.attributes = {};
            group.attributes['<SUPPORT_NAME>'] = supportName;
            group.attributes['<SUPPORT_GUID>'] = supportGUID;
        }

        return {
            p1: p1 || "", t1: t1 || "", insThk: insThk || "", insDen: insDen || "",
            density: density || "", hp: hp || "", pipingClass: pipingClass || "",
            rating: rating,
            rigidType: rigidType, weight: weight || "", material: material || "",
            wall: wall || "",
            valveType,
            materialDesc,
            materialKey,
            materialNeedsSelection,
            supportName: (supportName && supportName.toLowerCase() !== "unset") ? supportName : "" // Mapped to "Support GUID". Blank if 'unset'.
        };
    }
}
