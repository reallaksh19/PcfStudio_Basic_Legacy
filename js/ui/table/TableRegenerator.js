/**
 * TableRegenerator.js
 * Handles the logic for regenerating PCF content from edited table data.
 */

import { getState, setState } from "../../state.js";
import { getConfig } from "../../config/config-store.js";
import { parsePcf } from "../../viewer/pcf-parser.js";
import { runSequencer } from "../../graph/sequencer.js";
import { buildHeader } from "../../converter/header-writer.js"; // Helper to rebuild header if missing
import { updateDebugTable } from "../debug-tab.js";
import { materialService } from "../../services/material-service.js";

export class TableRegenerator {
    constructor(logger) {
        this.logger = logger;
    }

    /**
     * Main entry point to regenerate PCF lines from table data.
     * @param {Array} tableData - Raw 2D array from table
     * @param {Object} headerMap - Map of header name to column index
     * @param {Map} groups - (Optional) Groups map from state, used as fallback if pcfLines missing
     */
    regenerate(tableData, headerMap, groups) {
        console.log("[TableRegenerator] Starting regeneration...");

        if (!tableData || tableData.length === 0) {
            console.warn("No table data.");
            return;
        }

        // 1. Get Base Data (Prefer Groups state as source of truth to avoid data loss from PCF cleaning)
        // Only fallback to PCF lines if Groups is missing (rare).
        let components = [];
        let isReconstruction = true; // Default to reconstruction

        if (groups && groups.size > 0) {
            console.log("[TableRegenerator] Using Groups state as source.");
            components = this.reconstructComponentsFromGroups(groups);
        } else {
            console.warn("[TableRegenerator] No Groups state. Fallback to parsing pcfLines.");
            const originalLines = getState("pcfLines") || [];
            if (originalLines.length > 0) {
                components = parsePcf(originalLines.join("\n"));
                isReconstruction = false; // Parsed from lines
            }
        }

        if (components.length === 0) {
            console.error("[TableRegenerator] No components found. Cannot regenerate.");
            alert("Cannot regenerate: No source data found.");
            return;
        }

        console.log(`[TableRegenerator] Processing ${components.length} base components.`);

        // 2. Map Table Edits
        const hIdx = headerMap;
        const refNoIdx = hIdx["RefNo"];

        // Final Route Columns (for Strict Sequencer)
        const prevFIdx = hIdx["Prev(EP1)"];
        const nextFIdx = hIdx["Next(EP2)"];

        const editsByRef = new Map();
        const strictEdges = [];
        const seqToRef = new Map();
        const seqToStartCoords = new Map();

        // Pass 1: Build Sequence Map
        tableData.forEach(row => {
            if (!row) return;
            const seq = String(row[0] || "").trim();
            const ref = row[refNoIdx];
            if (seq && ref) {
                seqToRef.set(seq, ref);

                // Coordinates
                const x = parseFloat(row[hIdx["Start X"]]);
                const y = parseFloat(row[hIdx["Start Y"]]);
                const z = parseFloat(row[hIdx["Start Z"]]);
                if (!isNaN(x)) seqToStartCoords.set(seq, { x, y, z });
            }
        });

        // Pass 2: Collect Edits & Edges
        tableData.forEach(row => {
            if (!row) return;
            const ref = row[refNoIdx];
            if (ref) {
                editsByRef.set(ref, row);

                // Strict Edges from Final Route Columns
                if (prevFIdx !== undefined) {
                    const val = row[prevFIdx];
                    if (val && val !== "N/A") {
                        val.split(',').forEach(s => {
                            const targetSeq = s.trim().split(' ')[0]; // Remove (Br) etc
                            if (targetSeq && seqToRef.has(targetSeq)) {
                                strictEdges.push({ from: ref, to: seqToRef.get(targetSeq) });
                            }
                        });
                    }
                }
                if (nextFIdx !== undefined) {
                    const val = row[nextFIdx];
                    if (val && val !== "N/A") {
                        val.split(',').forEach(s => {
                            const targetSeq = s.trim().split(' ')[0];
                            if (targetSeq && seqToRef.has(targetSeq)) {
                                strictEdges.push({ from: ref, to: seqToRef.get(targetSeq) });
                            }
                        });
                    }
                }
            }
        });

        // 3. Apply Edits to Components & Update Geometry
        const groupMap = new Map();
        const phase1Groups = getState("groups") || groups; // Prefer fresh state

        components.forEach(comp => {
            const ref = comp.attributes["REFNO"] || comp.attributes["COMPONENT-ATTRIBUTE97"] ||
                        comp.attributes["PIPELINE-REFERENCE"] || comp.attributes["COMPONENT-ATTRIBUTE99"] || '';

            if (ref) {
                // Ensure group structure
                let group = groupMap.get(ref);
                if (!group) {
                    const p1g = phase1Groups ? phase1Groups.get(ref) : null;
                    // Preserve all properties from state group to ensure table rendering works
                    group = p1g ? { ...p1g } : {
                        refNo: ref,
                        firstRowIndex: -1,
                        items: [],
                        pcfType: comp.type,
                        pts: {},
                        rows: []
                    };
                    group.items = []; // Reset items for this pass
                    groupMap.set(ref, group);
                }
                group.items.push(comp);

                // Apply Edits
                if (editsByRef.has(ref)) {
                    const row = editsByRef.get(ref);
                    this.applyRowToComponent(comp, row, hIdx, seqToStartCoords);

                    // Sync geometry back to Group Pts for Table Refresh
                    if (!group.pts) group.pts = {};
                    if (comp.points[0]) group.pts['1'] = { E: comp.points[0].x, N: comp.points[0].y, U: comp.points[0].z, bore: comp.points[0].bore || comp.bore };
                    if (comp.points[1]) group.pts['2'] = { E: comp.points[1].x, N: comp.points[1].y, U: comp.points[1].z, bore: comp.points[1].bore || comp.bore };
                    if (comp.centrePoint) group.pts['0'] = { E: comp.centrePoint.x, N: comp.centrePoint.y, U: comp.centrePoint.z, bore: comp.centrePoint.bore };
                    if (comp.branch1Point) group.pts['3'] = { E: comp.branch1Point.x, N: comp.branch1Point.y, U: comp.branch1Point.z, bore: comp.branch1Point.bore };
                }
            }
        });

        // IMPORTANT: Do NOT overwrite state 'groups' with groupMap!
        // groupMap only contains table-visible components. Overwriting would drop
        // pipes/supports that are skipped from the table but still valid in the PCF.
        // Instead, merge edits back into the original groups:
        const origGroups = getState("groups");
        if (origGroups) {
            groupMap.forEach((tableGroup, ref) => {
                const origGroup = origGroups.get(ref);
                if (origGroup && tableGroup.items?.[0]) {
                    // Copy CA attributes from table edits back to original group
                    Object.assign(origGroup.attributes = origGroup.attributes || {}, tableGroup.items[0].attributes || {});
                }
            });
        }

        // 4. Handle Synthetic Components (Gaps)
        // If reconstructing, gaps might already be in 'components' if they were in the group list
        if (phase1Groups) {
            phase1Groups.forEach((group, ref) => {
                if (!groupMap.has(ref) && (ref.includes("_gap") || ref.includes("_Sp"))) {
                    // Force inject if missing
                    const comp = this.createComponentFromGroup(group, ref);
                    groupMap.set(ref, { ...group, items: [comp] });
                }
            });
        }

        // 5. Sequence ordering — start from table data, fill in any missing refs from original traversal order
        let orderedRefs = [];
        const refWithSeq = [];
        const csvSeqIdx = hIdx["CSV Seq No"] !== undefined ? hIdx["CSV Seq No"] : 0;

        tableData.forEach(row => {
            if (!row) return;
            const ref = row[refNoIdx];
            const seqStr = row[csvSeqIdx];
            if (ref) {
                const seqNum = parseFloat(seqStr);
                refWithSeq.push({
                    ref: ref,
                    seq: isNaN(seqNum) ? 999999 : seqNum
                });
            }
        });

        const uniqueRefs = new Map();
        refWithSeq.forEach(o => {
            if (!uniqueRefs.has(o.ref)) uniqueRefs.set(o.ref, o.seq);
        });

        orderedRefs = Array.from(uniqueRefs.entries())
            .sort((a, b) => a[1] - b[1])
            .map(entry => entry[0]);

        // Append any groups that exist in original groups but were NOT in tableData
        // (e.g. _Gap synthetics, skip-flagged items that should still appear in output)
        const allGroupMap = origGroups || getState("groups");
        const traversalOrder = getState("traversalOrder") || [];
        const tableRefSet = new Set(orderedRefs);
        traversalOrder.forEach(ref => {
            if (!tableRefSet.has(ref) && allGroupMap?.has(ref)) {
                const g = allGroupMap.get(ref);
                // Only append non-skipped groups that have pts
                if (!g.skip && g.pts && Object.keys(g.pts).length > 0) {
                    orderedRefs.push(ref);
                    tableRefSet.add(ref);
                }
            }
        });

        if (groupMap.has('=67130482/1666')) {
            const debugComp = groupMap.get('=67130482/1666').items[0];
            console.log(`[DEBUG END OF LOOP] ref 1666 EP1 Y=${debugComp.points[0]?.y}`);
        }

        // 6. Serialize
        // Resolve pipeline reference from state meta (CSV filename) or config
        const meta = getState('meta');
        const fallbackRef = meta?.filename
            ? String(meta.filename).replace(/\.[^.]+$/, '')
            : null;
        const pipelineRef = fallbackRef || getConfig()?.outputSettings?.pipelineReference || 'UNKNOWN';

        // Always generate a fresh header for the final serialized output (Stage 5B / Final PCF)
        // This guarantees Project Details and Units blocks are correctly populated from Config.
        const baseLines = buildHeader(pipelineRef);

        const finalLines = this.serialize(baseLines, orderedRefs, groupMap);

        // STAGE 4B OUTPUT: Display AST Dictionary properties for Debug Table
        const debugData = [];
        (orderedRefs.length > 0 ? orderedRefs : Array.from(groupMap.keys())).forEach(ref => {
            const group = groupMap.get(ref);
            if (group && group.items) {
                group.items.forEach((comp, idx) => {
                    const rowObj = {
                        "RefNo": ref,
                        "Type": comp.type
                    };

                    // Flatten coordinates
                    if (comp.points && comp.points[0]) {
                        rowObj["Start_X"] = comp.points[0].x?.toFixed(1);
                        rowObj["Start_Y"] = comp.points[0].y?.toFixed(1);
                        rowObj["Start_Z"] = comp.points[0].z?.toFixed(1);
                    }
                    if (comp.points && comp.points[1]) {
                        rowObj["End_X"] = comp.points[1].x?.toFixed(1);
                        rowObj["End_Y"] = comp.points[1].y?.toFixed(1);
                        rowObj["End_Z"] = comp.points[1].z?.toFixed(1);
                    }

                    // Map all AST attributes
                    if (comp.attributes) {
                        for (const [key, value] of Object.entries(comp.attributes)) {
                            rowObj[key] = value;
                        }
                    }

                    debugData.push(rowObj);
                });
            }
        });
        updateDebugTable("Stage 4B — Regenerator AST Mapping", debugData);

        // STAGE 5B OUTPUT: Final serialized lines mapped to objects
        const s5bRows = finalLines.map((line, i) => ({
            'Line #': i + 1,
            'Content': line
        }));
        updateDebugTable("Stage 5B — Final Serialized Output", s5bRows);

        // STAGE 6 OUTPUT: Final PCF Output (Preview for Debug Window)
        const s6Rows = finalLines.slice(0, 1000).map((line, i) => ({
            'Line #': i + 1,
            'Content': line
        }));
        updateDebugTable("Stage 6 — Final PCF Output (First 1000 lines)", s6Rows);

        // Update State
        setState("pcfLines", finalLines);
        console.log(`[TableRegenerator] Complete. ${finalLines.length} lines generated from ${orderedRefs.length} sequenced + remaining groups.`);
    }

    reconstructComponentsFromGroups(groups) {
        const comps = [];
        groups.forEach((group, ref) => {
            if (group.skip || group.pcfType === 'SKIP') return;
            comps.push(this.createComponentFromGroup(group, ref));
        });
        return comps;
    }

    createComponentFromGroup(group, ref) {
        const type = group.pcfType || "PIPE";
        const pts = group.pts || {};
        const p1 = pts["1"] || Object.values(pts)[0] || { E: 0, N: 0, U: 0, bore: 0 };
        const p2 = pts["2"];
        const p0 = pts["0"]; // Centre
        const p3 = pts["3"]; // Branch

        // Build simple component object compatible with parser output
        const comp = {
            _group: group, // Attached for downstream access to math engine points
            type: type,
            points: [{ x: p1.E, y: p1.N, z: p1.U, bore: p1.bore }],
            attributes: {
                "REFNO": ref,
                ...(group.attributes || {}) // Copy existing attrs if any
            }
        };

        if (p2) {
            comp.points.push({ x: p2.E, y: p2.N, z: p2.U, bore: p2.bore });
        }
        if (p0) {
            comp.centrePoint = { x: p0.E, y: p0.N, z: p0.U, bore: p0.bore };
        }
        if (p3) {
            comp.branch1Point = { x: p3.E, y: p3.N, z: p3.U, bore: p3.bore };
        }

        return comp;
    }

    applyRowToComponent(comp, row, hIdx, seqToCoords) {
        const attrs = comp.attributes;

        // Preserve geometry relative to P1 before moving P1
        let p0Offset = null;
        if (comp.centrePoint && comp.points[0]) {
            p0Offset = {
                x: comp.centrePoint.x - comp.points[0].x,
                y: comp.centrePoint.y - comp.points[0].y,
                z: comp.centrePoint.z - comp.points[0].z
            };
        }

        // Coordinates (Start)
        // Table gives "Start X, Start Y, Start Z" but these might just be the raw CSV values.
        // We SHOULD NOT overwrite the mathematically snapped comp.points[0] unless the user explicitly edited the table!
        // The safest approach is to use the existing perfectly-snapped topology points,
        // unless they are completely missing.
        const sx = row[hIdx["Start X"]];
        const sy = row[hIdx["Start Y"]];
        const sz = row[hIdx["Start Z"]];

        // Did the user modify the coordinate in the UI directly?
        // We can't know for sure in regenerating pass without a dirtiness flag. 
        // We must trust the Topology Engine first! The GUI table values are largely visual.
        // comp.points already contains perfectly snapped Group Pts (from createComponentFromGroup -> comp._group.pts).

        // Update Centre Point (P0) based on new P1 (if P1 changed)
        if (p0Offset && comp.points[0]) {
            comp.centrePoint = {
                x: comp.points[0].x + p0Offset.x,
                y: comp.points[0].y + p0Offset.y,
                z: comp.points[0].z + p0Offset.z
            };
        }

        // Geometry Update Logic: P2 based on P1 + Axis/Len vectors
        const p1 = comp.points[0];

        // Helper to update point by axis/len
        const applyVector = (pt, axis, len) => {
            if (!axis || isNaN(len) || len === 0) return;
            const uAxis = axis.toUpperCase();
            if (uAxis.includes('EAST')) pt.x += len;
            else if (uAxis.includes('WEST')) pt.x -= len;
            if (uAxis.includes('NORTH')) pt.y += len;
            else if (uAxis.includes('SOUTH')) pt.y -= len;
            if (uAxis.includes('UP')) pt.z += len;
            else if (uAxis.includes('DOWN')) pt.z -= len;
        };

        // P2 Calculation: Prioritize True Mathematical Snapping from Topology Engine!
        // DO NOT indiscriminately recalculate P2 using Grp L1/Axis 1 from the table row, 
        // as this completely overwrites the 'Local Stretch' mathematically bridged gaps!
        if (p1) {
            const existingP2Bore = comp.points[1]?.bore || comp.points[0]?.bore || 0;

            const grpPts = comp._group?.pts || {};
            const rawP2 = grpPts['2'];

            if (rawP2 && rawP2.E !== undefined) {
                // Topology engine provided a mathematically perfect P2 coordinate. USE IT!
                const p2 = { x: rawP2.E, y: rawP2.N, z: rawP2.U, bore: rawP2.bore || existingP2Bore };
                if (comp.points.length < 2) comp.points.push(p2);
                else comp.points[1] = p2;
            } else {
                // Fallback to Table vector math ONLY IF topology engine didn't provide a P2
                const axis1 = String(row[hIdx["Axis 1"]] || '');
                const grpL1 = parseFloat(row[hIdx["Grp L1"]]);
                const axis2 = String(row[hIdx["Axis 2"]] || '');
                const grpL2 = parseFloat(row[hIdx["Grp L2"]]);
                const axis3 = String(row[hIdx["Axis 3"]] || '');
                const grpL3 = parseFloat(row[hIdx["Grp L3"]]);

                const hasTableVector = (!isNaN(grpL1) && grpL1 > 0) ||
                    (!isNaN(grpL2) && grpL2 > 0) ||
                    (!isNaN(grpL3) && grpL3 > 0);

                if (hasTableVector) {
                    const p2 = { x: p1.x, y: p1.y, z: p1.z, bore: existingP2Bore };
                    applyVector(p2, axis1, grpL1);
                    applyVector(p2, axis2, grpL2);
                    applyVector(p2, axis3, grpL3);
                    if (comp.points.length < 2) comp.points.push(p2);
                    else comp.points[1] = p2;
                } else if (comp.points[1]) {
                    comp.points[1].bore = comp.points[1].bore || existingP2Bore;
                }
            }
        }

        // TEE/OLET Branch Logic (P3)
        const rawGrpL3 = parseFloat(row[hIdx["Grp L3"]]);

        if (["TEE", "OLET", "INSTRUMENT"].includes(comp.type)) {
            if (!isNaN(rawGrpL3) && rawGrpL3 > 0) {
                // mathematical overwrite
                const start = comp.centrePoint || comp.points[0];
                if (start) {
                    const p3 = { x: start.x, y: start.y, z: start.z, bore: comp.branch1Point?.bore || 0 };
                    applyVector(p3, String(row[hIdx["Axis 3"]]), rawGrpL3);
                    comp.branch1Point = p3;
                    console.log(`[TEE TRACKER] [Phase 2: Regen Vector Override] TEE ${comp.attributes["REFNO"]}: Overrode BP using Grp L3 vector => X:${p3.x}, Y:${p3.y}, Z:${p3.z}`);
                }
            } else if (comp.branch1Point) {
                console.log(`[TEE TRACKER] [Phase 2: Regen Retained] TEE ${comp.attributes["REFNO"]}: Retained Phase 1 mathematically perfect BP => X:${comp.branch1Point.x}, Y:${comp.branch1Point.y}, Z:${comp.branch1Point.z}, Bore:${comp.branch1Point.bore}`);
            }
        }

        // Attributes - mapping case/space insensitively
        const colMap = {};
        for (const k in hIdx) {
            colMap[k.toLowerCase().replace(/\s+/g, '')] = hIdx[k];
        }

        const mapAttr = (col, key) => {
            const normalizedCol = col.toLowerCase().replace(/\s+/g, '');
            const idx = colMap[normalizedCol];
            if (idx !== undefined) {
                const val = row[idx];
                if (val !== undefined && val !== null) attrs[key] = String(val).trim();
            }
        };

        mapAttr("P1 (ATTR1)", "COMPONENT-ATTRIBUTE1");
        mapAttr("T1 (ATTR2)", "COMPONENT-ATTRIBUTE2");
        mapAttr("Ins Thk (ATTR5)", "COMPONENT-ATTRIBUTE5");
        mapAttr("Ins Den (ATTR6)", "COMPONENT-ATTRIBUTE6");
        mapAttr("Density (ATTR9)", "COMPONENT-ATTRIBUTE9");
        mapAttr("HP (ATTR10)", "COMPONENT-ATTRIBUTE10");
        mapAttr("Material (ATTR3)", "COMPONENT-ATTRIBUTE3");
        mapAttr("Wall Thk (ATTR4)", "COMPONENT-ATTRIBUTE4");
        mapAttr("Weight (ATTR8)", "COMPONENT-ATTRIBUTE8");
        mapAttr("Support GUID", "<SUPPORT_GUID>"); // New mapping

        // Tracking attributes — written to every component for Data Table lookup
        mapAttr("CSV Seq No", "COMPONENT-ATTRIBUTE98");   // CA98 = SeqNo
        mapAttr("RefNo", "COMPONENT-ATTRIBUTE97");   // CA97 = RefNo

        // Line No. (Derived) — used by pipe.js to write per-pipe PIPELINE-REFERENCE
        mapAttr("Line No. (Derived)", "PIPELINE-REFERENCE");

        // Piping Class
        const pc = row[hIdx["Piping Class"]];
        if (pc) {
            attrs["PIPING-SPEC"] = String(pc).trim();
            attrs["PIPING-CLASS"] = String(pc).trim();
        }
    }

    serialize(originalLines, orderedRefs, groupMap) {
        const header = [];
        let bodyStart = 0;

        // Component keywords — appear alone on their line (no spaces after)
        const COMP_KEYWORDS = new Set([
            'PIPE', 'BEND', 'ELBOW', 'TEE', 'FLANGE', 'VALVE', 'OLET', 'REDUCER-CONCENTRIC',
            'REDUCER-ECCENTRIC', 'SUPPORT', 'MISC-COMPONENT', 'COMPONENT'
        ]);

        // Extract Header if exists
        if (originalLines && originalLines.length > 0) {
            for (let i = 0; i < originalLines.length; i++) {
                const line = originalLines[i].trim();
                if (COMP_KEYWORDS.has(line)) { // exact match only — avoids "PIPELINE-REFERENCE".startsWith("PIPE")
                    bodyStart = i;
                    break;
                }
                header.push(originalLines[i]);
            }
        }

        const lines = [...header];
        const written = new Set();
        const config = getConfig();
        const caDefs = config.caDefinitions || {};

        // Helper: Resolve Token for Message Square
        const resolveMsg = (item, ref, group) => {
            const type = item.type;
            const pipingClass = item.attributes['PIPING-CLASS'] || item.attributes['PIPING-SPEC'] || item.attributes['PIPING_CLASS'] || '';
            const matCode = materialService.resolveAttributes(pipingClass).materialCode;
            const existingMat = String(item.attributes['COMPONENT-ATTRIBUTE3'] || '').trim();
            const mat = matCode || (existingMat && !/\s/.test(existingMat) ? existingMat : '');

            // Calc Length
            let lenStr = "";
            if (item.points?.[0] && item.points?.[1]) {
                const dx = item.points[1].x - item.points[0].x;
                const dy = item.points[1].y - item.points[0].y;
                const dz = item.points[1].z - item.points[0].z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz).toFixed(0);
                lenStr = `, LENGTH=${dist}MM`;
            }

            // Direction (Simple)
            let dirStr = "";
            if (item.points?.[0] && item.points?.[1]) {
                const dx = item.points[1].x - item.points[0].x;
                const dy = item.points[1].y - item.points[0].y;
                const dz = item.points[1].z - item.points[0].z;
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > Math.abs(dz)) dirStr = dx > 0 ? "EAST" : "WEST";
                else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > Math.abs(dz)) dirStr = dy > 0 ? "NORTH" : "SOUTH";
                else dirStr = dz > 0 ? "UP" : "DOWN";
            }

            // Strip leading = from ref to prevent RefNo:==...
            const cleanRef = String(ref).replace(/^=+/, '');

            // SeqNo from group rows
            const rows = group?.rows || [];
            const seqNo = String(rows[0]?.['Seq No.'] || rows[0]?.Sequence || rows[0]?.Seq || rows[0]?.SeqNo || '').trim();
            const seqStr = seqNo && seqNo !== '-' ? `, SeqNo:${seqNo}` : '';

            return `    ${type}, ${mat}${lenStr}, ${dirStr}, RefNo:=${cleanRef}${seqStr}`;
        };

        const writeGroup = (ref) => {
            let group = groupMap.get(ref);

            // Fallback: if ref comes from traversalOrder but not in groupMap,
            // serialize directly from origGroups (no CA overrides, just geometry)
            if (!group && origGroups?.has(ref)) {
                const og = origGroups.get(ref);
                if (og && !og.skip && og.pts) {
                    const comp = this.createComponentFromGroup(og, ref);
                    // Copy any CA attrs merged back into origGroup.attributes
                    if (og.attributes) Object.assign(comp.attributes, og.attributes);
                    group = { ...og, items: [comp] };
                }
            }

            if (group && group.items) {
                if (group.skip || group.pcfType === 'SKIP') return;

                group.items.forEach(item => {
                    if (item.type === 'SUPPORT') {
                        // Special SUPPORT Formatting
                        lines.push(item.type);

                        // Supports explicitly use CO-ORDS. In the regenerated 'item', check where the coordinate is stored.
                        if (item.coOrds) {
                            const cp = item.coOrds;
                            lines.push(`    CO-ORDS    ${cp.x.toFixed(4)} ${cp.y.toFixed(4)} ${cp.z.toFixed(4)} ${cp.bore || 0}`);
                        } else if (item.centrePoint) {
                            const cp = item.centrePoint;
                            lines.push(`    CO-ORDS    ${cp.x.toFixed(4)} ${cp.y.toFixed(4)} ${cp.z.toFixed(4)} ${cp.bore || 0}`);
                        } else if (item.points && item.points.length > 0) {
                            const p0 = item.points[0];
                            lines.push(`    CO-ORDS    ${p0.x.toFixed(4)} ${p0.y.toFixed(4)} ${p0.z.toFixed(4)} ${p0.bore || 0}`);
                        }

                        // Explicit Support Attributes
                        const sName = item.attributes['<SUPPORT_NAME>'] || "CA150";
                        const sGuid = item.attributes['<SUPPORT_GUID>'] || "";

                        lines.push(`    <SUPPORT_NAME>    ${sName}`);
                        if (sGuid) lines.push(`    <SUPPORT_GUID>    ${sGuid}`);

                        // Support specific attributes from CSV (if any mapped)?
                        // User request: "But applicable is only CO-ORDS, <SUPPORT_NAME>, <SUPPORT_GUID>"
                        // So skip other attributes?

                    } else {
                        // Standard Component Formatting
                        // 1. Message Square
                        lines.push("MESSAGE-SQUARE");
                        lines.push(resolveMsg(item, ref, group));

                        lines.push(item.type);
                        if (item.points) {
                            if (ref.includes('1666')) {
                                window.__DEBUG_1666_LOG = `[DEBUG WRITER] Ref ${ref} writing EP1: y=${item.points[0]?.y.toFixed(4)} and EP2: y=${item.points[1]?.y.toFixed(4)}`;
                            }
                            item.points.forEach(p => lines.push(`    END-POINT    ${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)} ${p.bore || item.bore || 0}`));
                        }

                        // Per-pipe PIPELINE-REFERENCE (written after END-POINTs, before SKEY/CA)
                        const pipelineRef = (item.attributes['PIPELINE-REFERENCE'] || '').trim();
                        if (pipelineRef) {
                            lines.push(`    PIPELINE-REFERENCE ${pipelineRef}`);
                        }

                        if (item.centrePoint) {
                            const cp = item.centrePoint;
                            lines.push(`    CENTRE-POINT    ${cp.x.toFixed(4)} ${cp.y.toFixed(4)} ${cp.z.toFixed(4)} ${cp.bore || item.bore || 0}`);
                        }

                        // BRANCH1-POINT: Use branch point if available, fallback to centre point for TEEs (Phase 1 match)
                        if (item.branch1Point) {
                            const bp = item.branch1Point;
                            lines.push(`    BRANCH1-POINT    ${bp.x.toFixed(4)} ${bp.y.toFixed(4)} ${bp.z.toFixed(4)} ${bp.bore || item.bore || 0}`);
                            if (item.type === 'TEE') console.log(`[TEE TRACKER] [Phase 2: Serializer] TEE ${ref}: Writing True Branch Point => X:${bp.x.toFixed(4)}, Y:${bp.y.toFixed(4)}, Z:${bp.z.toFixed(4)}, Bore:${bp.bore || item.bore || 0}`);
                        } else if (item.type === 'TEE' && item.centrePoint) {
                            const cp = item.centrePoint;
                            lines.push(`    BRANCH1-POINT    ${cp.x.toFixed(4)} ${cp.y.toFixed(4)} ${cp.z.toFixed(4)} ${cp.bore || item.bore || 0}`);
                            console.log(`[TEE TRACKER] [Phase 2: Serializer] TEE ${ref}: ERROR/FALLBACK - Writing Centre Point as Branch Point => X:${cp.x.toFixed(4)}, Y:${cp.y.toFixed(4)}, Z:${cp.z.toFixed(4)}`);
                        }

                        // SKEY — must appear before attributes; was entirely absent from serializer
                        const pcfRule = config.pcfRules?.[item.type];
                        if (pcfRule?.defaultSKEY) {
                            lines.push(`    ${pcfRule.skeyStyle ?? 'SKEY'}  ${pcfRule.defaultSKEY}`);
                        }

                        // Sort COMPONENT-ATTRIBUTEn by numeric index so CA1..CA10 appear in order
                        const sortedEntries = Object.entries(item.attributes).sort(([a], [b]) => {
                            const ma = a.match(/COMPONENT-ATTRIBUTE(\d+)/);
                            const mb = b.match(/COMPONENT-ATTRIBUTE(\d+)/);
                            if (ma && mb) return parseInt(ma[1]) - parseInt(mb[1]);
                            if (ma) return 1;
                            if (mb) return -1;
                            return 0;
                        });

                        sortedEntries.forEach(([k, v]) => {
                            // Skip internal attrs or RefNo (now in MsgSquare)
                            if (k.startsWith("END-POINT-") || k === 'REFNO' || k === 'PIPELINE-REFERENCE') return;
                            if (k.startsWith("<SUPPORT")) return; // Skip internal support tags in standard output
                            if (!v || String(v).trim() === "") return; // Skip blank

                            // Append Units
                            let finalVal = v;
                            const match = k.match(/COMPONENT-ATTRIBUTE(\d+)/);
                            if (match) {
                                const idx = match[1];
                                const caKey = `CA${idx}`;
                                const def = caDefs[caKey];
                                if (def && def.unit && !String(v).includes(def.unit)) {
                                    finalVal = `${v} ${def.unit}`;
                                }
                            }
                            // Special cases
                            if (k === 'COMPONENT-ATTRIBUTE8' && !String(v).includes('KG')) finalVal = `${v} KG`; // CA8 Weight fallback

                            lines.push(`    ${k}    ${finalVal}`);
                        });
                    }
                    lines.push("");
                });
                written.add(ref);
            }
        };

        // Write Ordered
        orderedRefs.forEach(writeGroup);

        // Write Remaining
        groupMap.forEach((g, ref) => {
            if (!written.has(ref)) writeGroup(ref);
        });

        return lines;
    }
}
