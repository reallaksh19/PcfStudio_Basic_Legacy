/**
 * pte-engine.js — Point-to-Element Conversion Engine
 */

import { PTE_CONFIG } from './pte-config.js';

function fuzzyMatch(target, headers) {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nTarget = norm(target);
    for (const h of headers) {
        if (norm(h) === nTarget || norm(h).includes(nTarget)) return h;
    }
    return null;
}

function checkSequential(rows) {
    // Basic heuristic: check if sequence numbers are strictly increasing
    // Or if coordinates progress logically. Here we just assume true if they have sequences.
    if (PTE_CONFIG.sequentialData !== "auto") return PTE_CONFIG.sequentialData;
    let seqOk = true;
    for(let i=1; i<Math.min(rows.length, 100); i++) {
        if (parseInt(rows[i].Sequence) < parseInt(rows[i-1].Sequence)) seqOk = false;
    }
    return seqOk;
}

export function detectDataMode(headers, rows) {
    const hasRef = fuzzyMatch("RefNo", headers) !== null;
    const hasPoint = fuzzyMatch("Point", headers) !== null;
    const hasPPoint = fuzzyMatch("PPoint", headers) !== null;
    const lkConfig = window.__pteLineKeyColumn || PTE_CONFIG.lineKeyColumn;
    const hasLineKey = fuzzyMatch(lkConfig, headers) !== null && (window.__pteLineKeyEnabled !== false);

    const refPtAvailable = hasRef && hasPoint && hasPPoint;
    const isSequential = checkSequential(rows);

    if (refPtAvailable && isSequential) return "CASE_A";
    if (!refPtAvailable && isSequential && hasLineKey) return "CASE_B_a";
    if (!refPtAvailable && isSequential && !hasLineKey) return "CASE_B_b";
    if (!isSequential && hasLineKey) return "CASE_D_a";
    return "CASE_D_b";
}

function vecSub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function vecMag(v) { return Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z); }
function distance(a, b) { return vecMag(vecSub(a, b)); }

export function convertPointsToElements(rows, headers) {
    if (!rows || rows.length === 0) return [];

    // Ensure window overrides are used if set from UI
    const lkCol = window.__pteLineKeyColumn || PTE_CONFIG.lineKeyColumn;
    const actualLkCol = fuzzyMatch(lkCol, headers) || lkCol;

    // Attach Line_Key if available
    rows.forEach(r => {
        r.Line_Key = r[actualLkCol] || null;
    });

    // Check if ANY component is missing Line_Key. If so, fallback to without Line_Key
    const anyMissingLk = rows.some(r => !r.Line_Key || r.Line_Key.trim() === '');
    if (anyMissingLk) {
        window.__pteLineKeyEnabled = false; // Fallback
    }

    const mode = detectDataMode(headers, rows);
    console.log(`[PTE Engine] Operating in mode: ${mode}`);

    if (mode === "CASE_A") {
        return caseA(rows);
    } else if (mode === "CASE_B_a" || mode === "CASE_B_b") {
        return caseB(rows, mode === "CASE_B_a");
    } else if (mode === "CASE_D_a" || mode === "CASE_D_b") {
        return caseD(rows, mode === "CASE_D_a");
    }

    return rows;
}

function caseA(rows) {
    // Enrich with Real_Type
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const pt = parseInt(row.Point);
        if (pt === 1) {
            row.Real_Type = row.Type;
        } else if (pt === 2) {
            let nextHead = null;
            for (let j = i + 1; j < rows.length; j++) {
                if (parseInt(rows[j].Point) === 1) { nextHead = rows[j]; break; }
            }
            row.Real_Type = nextHead ? nextHead.Type : "END";
        } else if (pt === 0) {
            row.Real_Type = row.Type;
            if (["ANCI", "RSTR"].includes(row.Type?.toUpperCase())) {
                let nextNonZero = null;
                for (let j = i + 1; j < rows.length; j++) {
                    if (parseInt(rows[j].Point) !== 0) { nextNonZero = rows[j]; break; }
                }
                row.Real_Type = nextNonZero ? nextNonZero.Type : row.Type;
            }
        } else if (pt === 3) {
            row.Real_Type = row.Type;
        } else {
            row.Real_Type = row.Type;
        }
    }
    return rows;
}

function caseB(rows, useLineKey) {
    const refCounter = {};
    let currentLine = null;

    const out = [];

    // First assign Real_Type if missing
    rows.forEach(r => { if (!r.Real_Type) r.Real_Type = r.Type; });

    for (let i = 0; i < rows.length; i++) {
        const curr = rows[i];
        const next = i + 1 < rows.length ? rows[i + 1] : null;
        const prev = i > 0 ? rows[i - 1] : null;

        const rtype = (curr.Real_Type || '').toUpperCase();
        const line = useLineKey ? curr.Line_Key : "SYS";

        const genRef = (typeCode) => {
            const key = `${line}_${typeCode}`;
            refCounter[key] = (refCounter[key] || 0) + 1;
            return useLineKey ? `=${line}/${typeCode}_${String(refCounter[key]).padStart(4, '0')}` : `=${typeCode}_${String(refCounter[key]).padStart(4, '0')}`;
        };

        if (rtype === 'BRAN') {
            curr.RefNo = genRef("BRAN");
            curr.Point = 1; curr.PPoint = 1;
            curr.Type = "BRAN";
            out.push(curr);
            continue;
        }

        if (['ANCI', 'RSTR', 'SUPPORT'].includes(rtype)) {
            curr.RefNo = genRef("ANCI");
            curr.Point = 0; curr.PPoint = 0;
            curr.Type = "ANCI";
            out.push(curr);
            continue;
        }

        if (rtype === 'OLET' || rtype === 'TEE' || rtype === 'ELBO' || rtype === 'BEND') {
            // Complex points generation
            curr.RefNo = genRef(rtype);
            curr.Type = rtype;
            out.push(curr);
            continue;
        }

        // 2-point
        curr.RefNo = genRef(rtype);
        curr.Point = 1;
        curr.Type = rtype;
        curr.PPoint = 1; // Simplify PPoint
        out.push(curr);

        // Virtual point 2
        if (next && next.coord) {
            const vp2 = { ...curr, Point: 2, PPoint: 2, coord: next.coord };
            out.push(vp2);
        }
    }
    return out;
}

function caseD(rows, useLineKey) {
    // Placeholder for Orphan Sweep.
    // Given the complexity of Station G, we'll implement a basic topological sort
    // that connects nearest neighbors if within stage radii.
    console.log("[PTE Engine] Running Orphan Sweep (Case D)");
    // Fall back to sequential processing after a rough sort
    return caseB(rows, useLineKey);
}
