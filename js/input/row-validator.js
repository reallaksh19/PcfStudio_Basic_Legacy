/**
 * row-validator.js
 * Runs immediately after unit normalization, explicitly outputting ValidatedCSVdata.
 * Performs linear row-by-row distance calculation (Len_Calc) and flat-row modifications
 * (e.g. injecting missing pipes after supports) before data is grouped into components.
 */

import { runRayShooter } from '../graph/ray-shooter.js';

// ── LINE NO. HELPER ───────────────────────────────────────────────────────────
/**
 * Derive the logical Line Number from a row using lineNoLogic config.
 * Priority: explicit 'Line Number' column > lineNoLogic strategy (token/regex) on RefNo.
 * @param {object} row
 * @param {object} config
 * @returns {string}
 */
function deriveLineNo(row, config) {
    // 1. Direct column (mapped from CSV)
    const direct = row['Line Number'] || row['LineNo'] || row['LineNumber'];
    if (direct) return String(direct).trim();

    // 2. Apply lineNoLogic on RefNo
    const logic = config.smartData?.lineNoLogic || {};
    const ref = String(row.RefNo || '').trim();
    if (!ref) return '';

    if (logic.strategy === 'regex') {
        const m = ref.match(new RegExp(logic.regexPattern || '(.+)'));
        return m?.[Number(logic.regexGroup ?? 1)] || ref;
    }
    // Default: token split
    const parts = ref.split(logic.tokenDelimiter || '-');
    return parts[Number(logic.tokenIndex ?? 2)] || ref;
}

export function validateRows(rows, config) {
    if (!rows || rows.length === 0) return { validated: [], anomalies: [] };

    // ── _Sp TRACKER ──────────────────────────────────────────────────────────────
    // Prints a compact table of every _Sp row at a given pipeline stage.
    // Copy the console output and paste back here to trace where lenCalc → 0.
    function _spTrack(stage, arr) {
        const spRows = arr.filter(r => String(r.RefNo || '').includes('_Sp'));
        if (spRows.length === 0) {
            console.log(`[SpTrack:${stage}] (no _Sp rows)`);
            return;
        }
        const lines = spRows.map(r => {
            const lc  = r.Len_Calc !== undefined ? Number(r.Len_Calc).toFixed(2) : 'undef';
            const ep1 = `(${Number(r.East||0).toFixed(1)},${Number(r.North||0).toFixed(1)},${Number(r.Up||0).toFixed(1)})`;
            const ep2 = `(${Number(r.EndX||0).toFixed(1)},${Number(r.EndY||0).toFixed(1)},${Number(r.EndZ||0).toFixed(1)})`;
            const flags = [
                r.__sp1Preserved   ? 'PRES'    : '',
                r.__gateCollapsed  ? 'GATE'    : '',
                r.__unpaired_resolved ? 'RESOL' : '',
                r.pairStatus       ? r.pairStatus : '',
            ].filter(Boolean).join('|');
            return `  ${String(r.RefNo).padEnd(30)} Seq=${String(r.Sequence||'').padEnd(8)} Len=${String(lc).padStart(10)}  EP1=${ep1}  EP2=${ep2}  [${flags}]`;
        });
        console.log(`[SpTrack:${stage}] ${spRows.length} _Sp rows:\n` + lines.join('\n'));
    }

    const anomalies = [];
    const validated = [];
    const psiTargetSeqs = new Map(); // Sequences mapped to their fixed Euclidean Length
    // Tracks base RefNos that have already triggered a support injection,
    // so _Sp1/_Sp2 siblings of the same support don't each inject their own pipe.
    const injectedBaseRefs = new Set();

    // --- PHASE 0: PRE-LENCALC INTERCEPTOR (Shatter massive gaps & duplicate starts) ---
    let maxSegmentLengthLimit = config.coordinateSettings?.common3DLogic?.maxPipeRun || 20000;
    const phase0Rows = [];
    const refNoSeenTypes = new Map();
    const spCounters = new Map(); // Per-refNo counter for numbered _Sp1/_Sp2/... suffixes

    for (let i = 0; i < rows.length; i++) {
        const row = { ...rows[i] };
        row.__csvRow = i + 1; // 1-based original CSV position (before any Phase 0 renaming)
        const refNoStr = String(row.RefNo || "");
        const seqStr = String(row.Sequence || i);

        let isDuplicateStart = false;
        const pcfType = config.componentTypeMap ? (config.componentTypeMap[String(row.Type || "").trim().toUpperCase()] || row.Type) : row.Type;

        if (pcfType === "PIPE") {
            const seenTypes = refNoSeenTypes.get(refNoStr) || new Set();
            if (seenTypes.has("PIPE")) {
                isDuplicateStart = true;
            }
            seenTypes.add("PIPE");
            refNoSeenTypes.set(refNoStr, seenTypes);
        }

        const rNext = i < rows.length - 1 ? rows[i + 1] : null;
        let rawDist = 0;

        if (rNext) {
            const e1 = parseFloat(row.East) || 0;
            const n1 = parseFloat(row.North) || 0;
            const u1 = parseFloat(row.Up) || 0;

            const e2 = parseFloat(rNext.East) || 0;
            const n2 = parseFloat(rNext.North) || 0;
            const u2 = parseFloat(rNext.Up) || 0;

            rawDist = Math.sqrt(Math.pow(e1 - e2, 2) + Math.pow(n1 - n2, 2) + Math.pow(u1 - u2, 2));
        }

        const isFuzzyMode = (config.coordinateSettings?.pipelineMode === 'repair');

        // SUPPORT (ANCI) rows must never be processed by the Phase 0 _Sp renaming or 3D Smart Fixer.
        // Their geometry is handled in Phase 1 (support _Sp1 clone). If Phase 0 renames an ANCI to
        // "_Sp1" AND collapses rNext.East/North/Up → Phase 1 sees lenCalc=0 → _Sp1 PIPE never created.
        const _ph0IsSupport = (() => {
            const _rt = String(row.Type || '').trim().toUpperCase();
            return _rt === 'ANCI' || _rt === 'SUPPORT';
        })();

        if (!_ph0IsSupport && (rawDist > maxSegmentLengthLimit || isDuplicateStart)) {
            // ── FUZZY-MODE: Check if distance is cross-LineNo (unordered CSV) ──
            if (isFuzzyMode && rawDist > maxSegmentLengthLimit && !isDuplicateStart && rNext) {
                const lineNoA = deriveLineNo(row, config);
                const lineNoB = deriveLineNo(rNext, config);
                if (lineNoA && lineNoB && lineNoA !== lineNoB) {
                    // Cross-line boundary: do NOT split RefNo — mark as unpaired
                    row.__unpaired = true;
                    row.__unpaired_lineNo = lineNoA;
                    row.__unpaired_reason = `Cross-line: ${lineNoA}→${lineNoB}, dist=${rawDist.toFixed(0)}mm`;
                    console.log(`[Phase 0 Fuzzy] Unpaired Seq ${seqStr} (${lineNoA}→${lineNoB}, ${rawDist.toFixed(0)}mm) — skipping _Sp split`);
                    phase0Rows.push(row);
                    continue;
                }
            }
            // Same line, truly long pipe OR duplicate start → existing _Sp split
            // Use a per-refNo counter so multiple splits become _Sp1, _Sp2, _Sp3...
            // instead of the incorrect literal "_SpX".
            const spCount = (spCounters.get(refNoStr) || 0) + 1;
            spCounters.set(refNoStr, spCount);
            row.RefNo = `${refNoStr}_Sp${spCount}`;
            const triggerReason = isDuplicateStart ? "Duplicate Start (PIPE/BRAN)" : `Massive gap ${rawDist.toFixed(2)}mm > ${maxSegmentLengthLimit}mm`;
            console.log(`[Phase 0 Trace] >>> ${triggerReason} detected. Split Seq ${seqStr} -> ${row.RefNo}`);

            // 3D Smart Fixer - Pre-Gate Skew Protection
            // If the resulting _SpX spool has an invalid length (e.g. > max diagonal gap or < 25mm),
            // forcefully collapse its EP2 to EP1 (0 length) to avoid massive structural skews
            if (rNext && (isDuplicateStart || rawDist > maxSegmentLengthLimit)) {
                const maxDiag = config.coordinateSettings?.common3DLogic?.maxDiagonalGap || 2000;
                const minComp = config.coordinateSettings?.common3DLogic?.minComponentSize || 25;
                if (rawDist > maxDiag || rawDist < minComp) {
                    console.log(`[Phase 0 Guard] _SpX skew intercepted! Length ${rawDist.toFixed(2)}mm falls outside valid limits (${minComp}-${maxDiag}mm). Collapsing EP2 to EP1.`);
                    rNext.East = row.East;
                    rNext.North = row.North;
                    rNext.Up = row.Up;
                    // The downstream process (PCFSanitizer) will naturally eliminate the resulting 0-length component.
                }
            }
        }

        // Multi-Axis (Diagonal) Skew Protection for Non-Sequential points.
        // Skip for SUPPORT rows — their multi-axis reach is handled in Phase 1 (_Sp1 clone).
        // Slope tolerance: a secondary axis ≤ 1:100 of the primary is treated as zero (single-axis).
        // Distance gate uses maxSegmentLength (not maxDiagonalGap) so mildly-sloped long pipes pass.
        if (!_ph0IsSupport && rNext && isFuzzyMode) {
            const e1 = parseFloat(row.East) || 0;
            const n1 = parseFloat(row.North) || 0;
            const u1 = parseFloat(row.Up) || 0;

            const e2 = parseFloat(rNext.East) || 0;
            const n2 = parseFloat(rNext.North) || 0;
            const u2 = parseFloat(rNext.Up) || 0;

            const dx = Math.abs(e1 - e2);
            const dy = Math.abs(n1 - n2);
            const dz = Math.abs(u1 - u2);

            const EPSILON = 0.5; // mm tolerance for "has movement"
            let changedAxes = 0;
            if (dx > EPSILON) changedAxes++;
            if (dy > EPSILON) changedAxes++;
            if (dz > EPSILON) changedAxes++;

            // Apply slope tolerance: zero out any axis whose displacement is ≤ 1:100 of primary.
            const _ph0SlopeTol = config.coordinateSettings?.singleAxisSlopeTolerance ?? 0.01;
            const _ph0PrimMag  = Math.max(dx, dy, dz);
            const _ph0EffDx = (dx > EPSILON && (_ph0PrimMag <= 0 || dx / _ph0PrimMag > _ph0SlopeTol)) ? dx : 0;
            const _ph0EffDy = (dy > EPSILON && (_ph0PrimMag <= 0 || dy / _ph0PrimMag > _ph0SlopeTol)) ? dy : 0;
            const _ph0EffDz = (dz > EPSILON && (_ph0PrimMag <= 0 || dz / _ph0PrimMag > _ph0SlopeTol)) ? dz : 0;
            const effectiveChangedAxes = (_ph0EffDx > 0 ? 1 : 0) + (_ph0EffDy > 0 ? 1 : 0) + (_ph0EffDz > 0 ? 1 : 0);

            if (effectiveChangedAxes > 1) {
                // Genuinely multi-axis diagonal — enforce distance limit.
                // Use maxSegmentLength so single-plane long runs are not mistakenly rejected.
                const rawDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                const maxAllowedDist = config.coordinateSettings?.maxSegmentLength
                    || config.coordinateSettings?.common3DLogic?.maxDiagonalGap
                    || 2000;

                if (rawDist > maxAllowedDist) {
                    console.log(`[Phase 0 Guard] Multi-Axis Skew Rejected! Distance ${rawDist.toFixed(2)}mm > ${maxAllowedDist}mm. Initiating PTE Sweep...`);

                    let pteFound = false;
                    const sweepLimit = Math.min(i + 100, rows.length);
                    const ln = deriveLineNo(row, config);

                    for (let sIdx = i + 2; sIdx < sweepLimit; sIdx++) {
                        const sRow = rows[sIdx];
                        if (deriveLineNo(sRow, config) !== ln) continue;
                        if (!sRow.East || !sRow.North || !sRow.Up) continue;

                        const sE = Number(sRow.East), sN = Number(sRow.North), sU = Number(sRow.Up);
                        const sdx = Math.abs(e1 - sE), sdy = Math.abs(n1 - sN), sdz = Math.abs(u1 - sU);

                        // Apply slope tolerance to sweep candidate too
                        const _sPrimMag = Math.max(sdx, sdy, sdz);
                        const _sEffDx = (sdx > EPSILON && (_sPrimMag <= 0 || sdx / _sPrimMag > _ph0SlopeTol)) ? sdx : 0;
                        const _sEffDy = (sdy > EPSILON && (_sPrimMag <= 0 || sdy / _sPrimMag > _ph0SlopeTol)) ? sdy : 0;
                        const _sEffDz = (sdz > EPSILON && (_sPrimMag <= 0 || sdz / _sPrimMag > _ph0SlopeTol)) ? sdz : 0;
                        const sEffAxes = (_sEffDx > 0 ? 1 : 0) + (_sEffDy > 0 ? 1 : 0) + (_sEffDz > 0 ? 1 : 0);

                        if (sEffAxes <= 1) {
                            const sweepDist = Math.sqrt(sdx*sdx + sdy*sdy + sdz*sdz);
                            if (sweepDist < maxAllowedDist) {
                                console.log(`[Phase 0 Guard] PTE Sweep Successful! Snapped EP2 to Seq ${sRow['Seq No.']} at dist ${sweepDist.toFixed(2)}mm.`);
                                rNext.East = sRow.East;
                                rNext.North = sRow.North;
                                rNext.Up = sRow.Up;
                                pteFound = true;
                                break;
                            }
                        }
                    }

                    if (!pteFound) {
                        console.log(`[Phase 0 Guard] PTE Sweep Failed. Breaking sequential connection.`);
                        rNext.East = row.East;
                        rNext.North = row.North;
                        rNext.Up = row.Up;
                    }
                }
            }
        }

        phase0Rows.push(row);
    }

    _spTrack('Phase0-rows', phase0Rows);

    // ── PHASE 0.25: MULTI-PASS UNPAIRED SeqNo RE-PAIRING (Fuzzy mode only) ─────
    // Collect unpaired rows, group by LineNo, then pair via 2 passes:
    // Pass 1: Euclidean nearest-neighbour within same LineNo.
    // Pass 2: Orthogonal-axis vector check (aligns with E/N/U axis).
    const unpairedRows = phase0Rows.filter(r => r.__unpaired);
    if (unpairedRows.length > 0) {
        const byLineNo = new Map();
        for (const r of phase0Rows) {
            const ln = deriveLineNo(r, config);
            if (!byLineNo.has(ln)) byLineNo.set(ln, []);
            byLineNo.get(ln).push(r);
        }

        for (const r of unpairedRows) {
            const ln = r.__unpaired_lineNo || deriveLineNo(r, config);
            const candidates = (byLineNo.get(ln) || []).filter(c => c !== r && !c.__unpaired);
            if (!candidates.length) continue;

            const rE = Number(r.East) || 0, rN = Number(r.North) || 0, rU = Number(r.Up) || 0;

            // Pass 1: Euclidean nearest-neighbour
            let bestP1 = null, bestDist1 = Infinity;
            for (const c of candidates) {
                const d = Math.sqrt(Math.pow((Number(c.East) || 0) - rE, 2) + Math.pow((Number(c.North) || 0) - rN, 2) + Math.pow((Number(c.Up) || 0) - rU, 2));
                if (d < bestDist1) { bestDist1 = d; bestP1 = c; }
            }

            // Pass 2: Orthogonal-axis refinement (prefer on-axis match)
            const skewLimit = config.coordinateSettings?.common3DLogic?.skew3PlaneLimit || 2000;
            let bestP2 = null, bestDist2 = Infinity;
            for (const c of candidates) {
                const dE = Math.abs((Number(c.East) || 0) - rE);
                const dN = Math.abs((Number(c.North) || 0) - rN);
                const dU = Math.abs((Number(c.Up) || 0) - rU);
                // On-axis: two of the three deltas must be within skewLimit
                const axisAligned = [dE < skewLimit, dN < skewLimit, dU < skewLimit].filter(Boolean).length >= 2;
                if (axisAligned) {
                    const d = Math.sqrt(dE * dE + dN * dN + dU * dU);
                    if (d < bestDist2) { bestDist2 = d; bestP2 = c; }
                }
            }

            const best = bestP2 || bestP1;
            if (best) {
                r.EndX = Number(best.East) || 0;
                r.EndY = Number(best.North) || 0;
                r.EndZ = Number(best.Up) || 0;
                r.__unpaired = false; // resolved
                r.__unpaired_resolved = true;
                console.log(`[Phase 0.25] Resolved unpaired Seq ${r.Sequence} (${ln}) → nearest in same LineNo via ${bestP2 ? 'Pass2-axis' : 'Pass1-euclidean'}, dist=${Math.min(bestDist1, bestDist2).toFixed(1)}mm`);
            } else {
                r.__unpaired_final = true; // still unresolved — logged in anomalies below
                console.warn(`[Phase 0.25] Could not resolve unpaired Seq ${r.Sequence} (${ln}) — no same-LineNo candidates`);
            }
        }
        console.info(`[Phase 0.25] Re-pairing complete: ${unpairedRows.length} unpaired rows processed.`);
    }

    const sourceRows = phase0Rows;

    // ── PHASE 0.6: ENRICH WITH Real_Type ────────────────────────────────────────
    // Real_Type rules:
    //   ANCI / RSTR / SUPPORT → always 'SUPPORT' (point supports, no look-ahead)
    //   All other rows        → own Type  (Real_Type === Type)
    // Real_Type is used downstream by Ray Mode grouping and DE/BO classification.
    {
        const _supportRawTypes = new Set(['ANCI', 'RSTR', 'SUPPORT']);
        for (const row of sourceRows) {
            const typ = String(row.Type || '').trim().toUpperCase();
            row.Real_Type = _supportRawTypes.has(typ) ? 'SUPPORT' : typ;
        }
    }

    // ── PHASE 0.6b: SYNC Type ← Real_Type for ELBO/TEE/OLET (PSI Correction OFF) ─
    // For ELBO, TEE, OLET rows only: overwrite Type with Real_Type so downstream
    // logic (grouper, point-builder, assembler) sees the canonical component type.
    // All other types are left unchanged (Real_Type === Type anyway).
    if (!(typeof window !== 'undefined' && window.__PSI_CORRECTION_MODE)) {
        const _6b_types = new Set(['ELBO', 'TEE', 'OLET']);
        for (const row of sourceRows) {
            if (row.Real_Type && _6b_types.has(String(row.Real_Type || '').trim().toUpperCase())) {
                row.Type = row.Real_Type;
            }
        }
    }

    // ── PHASE 0.7: ENRICH WITH DE/BO/NIL ────────────────────────────────────────
    // Classifies each row by the geometric relationship of the two adjacent vectors.
    //   V1 = prevRow → currRow,  V2 = currRow → nextRow
    //   NIL   = vectors inline (|dot|≈1) or perpendicular (dot≈0)
    //   BO    = first row (no prev vector) — branch-off / chain origin
    //   DE    = last row (no next vector) — dead end / chain terminal
    //   DE/BO = middle row where vectors don't satisfy either criterion
    // Reducer exception: if row.Type contains "REDU", recheck ignoring UP component.
    {
        const _INLINE_TOL = 0.15;  // |dot| > 1-tol → inline  (allows ~8° deviation)
        const _PERP_TOL   = 0.15;  // |dot| < tol   → 90°     (allows ~8° deviation)

        const _mag3  = (v) => Math.sqrt(v.E*v.E + v.N*v.N + v.U*v.U);
        const _norm3 = (v, m) => ({ E: v.E/m, N: v.N/m, U: v.U/m });
        const _dot3  = (a, b) => a.E*b.E + a.N*b.N + a.U*b.U;
        const _mag2h = (v) => Math.sqrt(v.E*v.E + v.N*v.N);
        const _dot2h = (a, b) => a.E*b.E + a.N*b.N;  // horizontal-only dot

        const _passes = (dot) =>
            Math.abs(dot) > (1 - _INLINE_TOL) ||  // inline or reverse-inline
            Math.abs(dot) < _PERP_TOL;             // 90 degrees

        for (let i = 0; i < sourceRows.length; i++) {
            const row = sourceRows[i];

            if (i === 0) { row['DE/BO'] = 'BO'; continue; }
            if (i === sourceRows.length - 1) { row['DE/BO'] = 'DE'; continue; }

            const prev = sourceRows[i - 1];
            const next = sourceRows[i + 1];

            const v1 = {
                E: (parseFloat(row.East)  || 0) - (parseFloat(prev.East)  || 0),
                N: (parseFloat(row.North) || 0) - (parseFloat(prev.North) || 0),
                U: (parseFloat(row.Up)    || 0) - (parseFloat(prev.Up)    || 0),
            };
            const v2 = {
                E: (parseFloat(next.East)  || 0) - (parseFloat(row.East)  || 0),
                N: (parseFloat(next.North) || 0) - (parseFloat(row.North) || 0),
                U: (parseFloat(next.Up)    || 0) - (parseFloat(row.Up)    || 0),
            };

            const m1 = _mag3(v1);
            const m2 = _mag3(v2);

            // Zero-length vector → same-position rows → treat as NIL
            if (m1 < 1e-6 || m2 < 1e-6) { row['DE/BO'] = 'NIL'; continue; }

            const dot = _dot3(_norm3(v1, m1), _norm3(v2, m2));

            if (_passes(dot)) { row['DE/BO'] = 'NIL'; continue; }

            // Reducer exception: recheck with horizontal (E,N) components only
            if (/REDU/i.test(String(row.Type || ''))) {
                const h1 = _mag2h(v1);
                const h2 = _mag2h(v2);
                if (h1 > 1e-6 && h2 > 1e-6) {
                    const dotH = _dot2h({ E: v1.E/h1, N: v1.N/h1 }, { E: v2.E/h2, N: v2.N/h2 });
                    if (_passes(dotH)) { row['DE/BO'] = 'NIL'; continue; }
                }
            }

            // Elbow/Bend 45° exception: cos(45°) = 0.707 — allow this angle for BEND/ELBOW rows
            if (/ELBO|BEND/i.test(String(row.Type || ''))) {
                if (Math.abs(Math.abs(dot) - 0.707) < _PERP_TOL) { row['DE/BO'] = 'NIL'; continue; }
            }

            // TEE / OLET branch-off points → BO; everything else → DE
            const _rt = String(row.Real_Type || '').trim().toUpperCase();
            row['DE/BO'] = (_rt === 'TEE' || _rt.includes('OLET')) ? 'BO' : 'DE';
        }
    }

    // Snapshot AFTER Phase 0.6/0.7 enrichment (Real_Type + DE/BO) but BEFORE Phase 0.5
    // mutates sourceRows in-place (renaming _pipe tail rows). Used by Stage 1.5 debug table.
    const rtMapSnapshot = sourceRows.map(r => Object.assign({}, r));

    // --- PHASE 0.5: ELBOW 3-ROW / TEE 4-ROW PIPE TAIL SPLIT (PSI correction only) ---
    // When PSI correction is active:
    //   ELBOW/BEND with exactly 3 rows → rename 3rd row to RefNo_pipe (PIPE)
    //   TEE         with exactly 4 rows → rename 4th row to RefNo_pipe (PIPE)
    // The renamed row gets:
    //   • Sequence  = (2nd-to-last same-refno row Seq) + 0.1  (matches injection convention)
    //   • EndX/Y/Z  = next CSV row coords so Len_Calc is correct
    //   • Point='1' so point-builder treats it as a single-row pipe
    if (typeof window !== 'undefined' && window.__PSI_CORRECTION_MODE) {
        const refnoRows = new Map();
        for (let i = 0; i < sourceRows.length; i++) {
            const ref = String(sourceRows[i].RefNo || '').trim();
            if (!refnoRows.has(ref)) refnoRows.set(ref, []);
            refnoRows.get(ref).push(i);
        }

        for (const [ref, indices] of refnoRows) {
            const firstType = String(sourceRows[indices[0]].Type || '').trim().toUpperCase();
            const isElbow = firstType.includes('ELBO') || firstType.includes('BEND');
            const isTee = firstType.includes('TEE');
            const target = isElbow ? 3 : isTee ? 4 : 0;
            if (!target || indices.length !== target) continue;

            // The row being promoted to PIPE
            const splitIdx = indices[indices.length - 1];
            const splitRow = sourceRows[splitIdx];
            // Previous same-refno row (for Seq base)
            const prevRow = sourceRows[indices[indices.length - 2]];
            // First row AFTER this entire group in the CSV
            const afterIdx = splitIdx + 1;
            const afterRow = afterIdx < sourceRows.length ? sourceRows[afterIdx] : null;

            // Seq: (prev row seq) + 0.1  — e.g. Seq 55 → 55.1
            const prevSeq = parseFloat(prevRow.Sequence) || 0;
            const newSeq = String(parseFloat((prevSeq + 0.1).toFixed(6)));

            // Coords of the _pipe row (its EP1) = ELBOW's lost EP2
            const e1 = parseFloat(splitRow.East) || 0;
            const n1 = parseFloat(splitRow.North) || 0;
            const u1 = parseFloat(splitRow.Up) || 0;
            // Coords of next component (its EP2 / Len_Calc target).
            // Look ahead up to 5 rows to find the first row with coordinates different from EP1
            // (afterRow may be at the same position if it's a zero-length bridge row).
            let e2 = e1, n2 = n1, u2 = u1;
            for (let _ai = afterIdx; _ai < Math.min(afterIdx + 5, sourceRows.length); _ai++) {
                const _ar = sourceRows[_ai];
                const _ae = parseFloat(_ar.East) || 0;
                const _an = parseFloat(_ar.North) || 0;
                const _au = parseFloat(_ar.Up) || 0;
                if (Math.sqrt((_ae-e1)**2 + (_an-n1)**2 + (_au-u1)**2) > 0.1) {
                    e2 = _ae; n2 = _an; u2 = _au; break;
                }
            }
            const len = Math.sqrt((e2 - e1) ** 2 + (n2 - n1) ** 2 + (u2 - u1) ** 2);

            // ── CRITICAL FIX: Give ELBOW its EP2 back ────────────────────
            // By taking the 3rd ELBOW row, the ELBOW group loses its EP2.
            // Stamp prevRow (CP row, i.e. the ELBOW's NEW last row) with
            // EndX/Y/Z = splitRow's original coords so point-builder's
            // hasStampedEnd logic can reconstruct pts['2'] for the ELBOW/BEND block.
            prevRow.EndX = e1;
            prevRow.EndY = n1;
            prevRow.EndZ = u1;

            // Mutate the split row in-place
            const newRef = ref + '_pipe';
            splitRow.RefNo = newRef;
            splitRow.Type = 'PIPE';
            splitRow.Sequence = newSeq;
            splitRow.Point = '1';      // single-row pipe: EP1 only
            splitRow.EndX = e2;
            splitRow.EndY = n2;
            splitRow.EndZ = u2;
            splitRow.Len_Calc = len;
            if (splitRow['Component Name'] !== undefined) splitRow['Component Name'] = 'PIPE';
            if (splitRow.componentName !== undefined) splitRow.componentName = 'PIPE';

            console.log(`[Phase 0.5 ${isElbow ? 'ELBOW' : 'TEE'} Split] ${ref} (${target} rows) → Seq ${newSeq}: ${newRef} Len=${len.toFixed(1)}mm | ELBOW prevRow given EndX/Y/Z=${e1},${n1},${u1}`);
        }
    }

    // 1. Sort rows purely by Sequence before math (just in case)
    let _lastSeenBore = 0;
    for (let i = 0; i < sourceRows.length; i++) {
        const rCurrent = { ...sourceRows[i] };

        // --- STAGE 1 BORE PUBLICATION TRACKER ---
        const _cb = parseFloat(rCurrent.Bore) || 0;
        if (_cb > 0) _lastSeenBore = _cb;

        // --- STAGE 1 SKIP FILTER ---
        // Completely exclude items marked as SKIP
        const rawTypeFilter = String(rCurrent.Type || rCurrent.COMPONENT || rCurrent.pcfType || "").trim().toUpperCase();
        if (rawTypeFilter === "SKIP" || rCurrent.skip === true) {
            continue;
        }

        // FIX: rNext must come from sourceRows (Phase-0 processed), not the raw rows array.
        const rNext = i < sourceRows.length - 1 ? sourceRows[i + 1] : null;

        let lenCalc = 0;

        // We assume East, North, Up are already numbers (stripped by input-tab using unit-transformer)
        const e1 = parseFloat(rCurrent.East) || 0;
        const n1 = parseFloat(rCurrent.North) || 0;
        const u1 = parseFloat(rCurrent.Up) || 0;

        let e2 = e1, n2 = n1, u2 = u1;

        const rawType = String(rCurrent.Type || "").trim().toUpperCase();
        const rigidStr = String(rCurrent.Rigid || "").trim().toUpperCase();
        const isSupport = rawType === "ANCI" || rawType === "SUPPORT"; // expand as needed
        const isEndFlange = rawType.includes('FLAN') && rigidStr === 'END';

        // OLETs and TEEs inherently bridge a Header (RefNo A) to a Branch (RefNo B).
        // We MUST force the algorithm to calculate physical distance across this RefNo discontinuity.
        const nextType = rNext ? String(rNext.Type || rNext.COMPONENT || "").trim().toUpperCase() : "";

        // Expanded logic to include TEE
        const isOletOrTeeConnection = (rawType.includes('OLET') || rawType.includes('TEE')) &&
            rNext &&
            !(nextType.includes('OLET') || nextType.includes('TEE'));

        if ((isSupport || isOletOrTeeConnection) && rNext) {
            // Supports and OLET Branches MUST calculate physical Euclidean limits to the next literal row sequence
            // regardless of what RefNo pipeline it belongs to computationally!
            e2 = parseFloat(rNext.East) || 0;
            n2 = parseFloat(rNext.North) || 0;
            u2 = parseFloat(rNext.Up) || 0;
        } else if (rNext && rNext.RefNo === rCurrent.RefNo) {
            // Try getting sequential distance to the next row natively (if it belongs to the same pipeline)
            e2 = parseFloat(rNext.East) || 0;
            n2 = parseFloat(rNext.North) || 0;
            u2 = parseFloat(rNext.Up) || 0;
        } else if (rCurrent.StartX !== undefined || rCurrent.EndX !== undefined) {
            // Self-Contained Cartesian coordinates (Single-Row Pipes like 1664 that dropped)
            const sx = parseFloat(rCurrent.StartX) || parseFloat(rCurrent.EndX) || 0;
            const sy = parseFloat(rCurrent.StartY) || parseFloat(rCurrent.EndY) || 0;
            const sz = parseFloat(rCurrent.StartZ) || parseFloat(rCurrent.EndZ) || 0;
            if (sx !== 0 || sy !== 0 || sz !== 0) {
                e2 = sx;
                n2 = sy;
                u2 = sz;
            }
        }

        // Len_Calc = Euclidean Distance
        lenCalc = Math.sqrt(Math.pow(e1 - e2, 2) + Math.pow(n1 - n2, 2) + Math.pow(u1 - u2, 2));

        // FLAN + RIGID END: always zero-length (blind flange / end cap — no pipe run through it).
        if (isEndFlange) { lenCalc = 0; e2 = e1; n2 = n1; u2 = u1; rCurrent.__gateCollapsed = true; }

        // FLAN capping: cap ALL non-END flanges to flangePcfThickness (default 6 mm).
        // Without this, EP2 = next-row coords, stretching the flange across the full pipe run.
        // START flanges: __gateCollapsed so Final Pass P-3 cannot re-expand EP2.
        // Non-START flanges: NOT gateCollapsed — remain ray-shooter eligible so bridge
        // pipes can be injected from their exit face to the next component.
        const isStartFlange = rawType.includes('FLAN') && rigidStr === 'START';
        const isAnyFlange = rawType.includes('FLAN') && !isEndFlange;
        if (isAnyFlange && lenCalc > 0) {
            const _maxFT = config.coordinateSettings?.flangePcfThickness ?? 6;
            if (lenCalc > _maxFT) {
                const _ftScale = _maxFT / lenCalc;
                e2 = e1 + (e2 - e1) * _ftScale;
                n2 = n1 + (n2 - n1) * _ftScale;
                u2 = u1 + (u2 - u1) * _ftScale;
                lenCalc = _maxFT;
            }
            if (isStartFlange) {
                rCurrent.__gateCollapsed = true; // START flanges are immutable through Final Pass
            }
        }

        // --- LEN_VEC: Full signed direction cosines of the EP1→EP2 direction ---
        // Computed immediately after lenCalc so it reflects true geometry before any gate collapse.
        // Format: "2[+0.998N+0.063Up]"  — axis count, then signed cosines for significant axes only.
        // __axisVec stores the unit vector for downstream use (ray shooter, Final Pass gate).
        // NOTE: Len_Vec and __axisVec are PRESERVED on gate collapse — they represent geometry, not distance.
        {
            const _EPSILON_V = 0.5;  // mm — threshold for "has movement" on an axis
            const _dxVs = e1 - e2, _dyVs = n1 - n2, _dzVs = u1 - u2;  // signed EP1→EP2
            const _mag  = Math.sqrt(_dxVs*_dxVs + _dyVs*_dyVs + _dzVs*_dzVs);
            let _cosE = 0, _cosN = 0, _cosU = 0;
            if (_mag > 0.001) { _cosE = _dxVs / _mag; _cosN = _dyVs / _mag; _cosU = _dzVs / _mag; }

            const _aE  = Math.abs(_dxVs) > _EPSILON_V;
            const _aN  = Math.abs(_dyVs) > _EPSILON_V;
            const _aUp = Math.abs(_dzVs) > _EPSILON_V;
            const _axisCount = (_aE ? 1 : 0) + (_aN ? 1 : 0) + (_aUp ? 1 : 0);

            // Slope tolerance: if a secondary axis is ≤ 1:100 of the primary, treat as single-axis.
            // This prevents mildly-sloped pipes (e.g. 13042mm East + 13mm Up ≈ 1:1004) from being
            // classified as multi-axis and triggering the push gate or Max-single-plane-Run caps.
            const _SLOPE_TOL = config.coordinateSettings?.singleAxisSlopeTolerance ?? 0.01; // 1:100
            const _primMag   = Math.max(Math.abs(_dxVs), Math.abs(_dyVs), Math.abs(_dzVs));
            const _aE_eff  = _aE  && (_primMag <= 0 || Math.abs(_dxVs) / _primMag > _SLOPE_TOL);
            const _aN_eff  = _aN  && (_primMag <= 0 || Math.abs(_dyVs) / _primMag > _SLOPE_TOL);
            const _aUp_eff = _aUp && (_primMag <= 0 || Math.abs(_dzVs) / _primMag > _SLOPE_TOL);
            const _effectiveAxisCount = (_aE_eff ? 1 : 0) + (_aN_eff ? 1 : 0) + (_aUp_eff ? 1 : 0);

            const _fmt = (v) => (v >= 0 ? '+' : '') + v.toFixed(3);
            const _parts = [];
            if (_aE)  _parts.push(`${_fmt(_cosE)}E`);
            if (_aN)  _parts.push(`${_fmt(_cosN)}N`);
            if (_aUp) _parts.push(`${_fmt(_cosU)}Up`);
            rCurrent.Len_Vec              = `${_axisCount}[${_parts.join('') || '0'}]`;
            rCurrent.__axisCount          = _axisCount;
            rCurrent.__effectiveAxisCount = _effectiveAxisCount;
            rCurrent.__axisVec            = { dE: _cosE, dN: _cosN, dU: _cosU };
        }

        // --- GLOBAL ELEMENT PUSH GATE ---
        // Applied at element creation time for every element about to enter validated[].
        // Engine-mode rules (mirrors Global Engine Behavior spec):
        //   Sequential (any chain):  no bore-ratio / 3D constraint here.
        //   Fuzzy (Single or Multi): multi-axis diagonal → bore ratio AND 3D rules apply.
        //     Collapse EP2→EP1 if multi-axis AND (lenCalc > maxDiagonalGap OR bore ratio out of bounds).
        const _pushIsFuzzy  = config.coordinateSettings?.pipelineMode === 'repair';
        const _pushMaxDiag  = config.coordinateSettings?.common3DLogic?.maxDiagonalGap  || 2000;
        const _pushBoreMin  = config.coordinateSettings?.boreRatioSettings?.minRatio ?? 0.5;
        const _pushBoreMax  = config.coordinateSettings?.boreRatioSettings?.maxRatio ?? 2.0;

        // Save the pre-gate EP2 coords for SUPPORT rows: the _Sp1 clone must always capture
        // the original reach of the support, even if the push gate later collapses e2/n2/u2.
        const _preGateE2 = isSupport ? e2 : null;
        const _preGateN2 = isSupport ? n2 : null;
        const _preGateU2 = isSupport ? u2 : null;
        const _preGateLen = isSupport ? lenCalc : null;

        if (_pushIsFuzzy && lenCalc > 0 && rCurrent.__effectiveAxisCount > 1 && !isSupport) {
            // Multi-axis (after slope tolerance): apply both bore ratio AND 3D geometry rules — collapse if EITHER fails.
            // SUPPORT rows are exempt: their _Sp1 clone must use the original EP2 regardless.
            // Mildly-sloped pipes (secondary axis ≤ 1:100 of primary) use effectiveAxisCount=1 → no collapse.
            const _boreA       = parseFloat(rCurrent.Bore) || 0;
            const _boreB       = rNext ? (parseFloat(rNext.Bore) || 0) : 0;
            const _boreRatio   = (_boreA > 0 && _boreB > 0) ? _boreA / _boreB : null;
            const _boreRatioFail = _boreRatio !== null && (_boreRatio < _pushBoreMin || _boreRatio > _pushBoreMax);
            const _3dFail      = lenCalc > _pushMaxDiag;

            if (_3dFail || _boreRatioFail) {
                const _reason = [
                    _3dFail        ? `3D skew ${lenCalc.toFixed(2)}mm > ${_pushMaxDiag}mm`                           : null,
                    _boreRatioFail ? `bore ratio ${_boreRatio.toFixed(3)} outside [${_pushBoreMin}–${_pushBoreMax}]` : null
                ].filter(Boolean).join(' + ');
                console.log(`[Push Gate] "${rCurrent.RefNo}" ${rCurrent.Len_Vec} — ${_reason} — collapsing EP2→EP1.`);
                e2 = e1; n2 = n1; u2 = u1;
                lenCalc = 0;
                rCurrent.__gateCollapsed = true; // tells Final Pass not to overwrite this collapse
            }
        }

        // Extract Raw CSV length BEFORE Euclidean overwrite (immune to CSV whitespace padding or case variance)
        const lenKey = Object.keys(rCurrent).find(k => {
            const up = k.trim().toUpperCase();
            return up === 'LEN_CALC' || up === 'LENCALC' || up === 'LENGTH';
        });
        const rawLenCalc = lenKey ? (parseFloat(rCurrent[lenKey]) || 0) : 0;

        // --- SUPPORT Sp1 CLONE + ZERO-LENGTH COLLAPSE ---
        // Always creates a _Sp1 PIPE clone when a support has a non-zero reach to the next component.
        // Uses the pre-gate EP2 coords so push-gate collapsing on the support row itself cannot
        // suppress the _Sp1 (supports are now exempt from the push gate above).
        let _sp1WasCreated = false;

        // Use pre-gate coords for support: if the support was skipped by push gate (now), these equal
        // current e2/n2/u2. If the push gate fired for another reason, _preGateE2 holds the original.
        const _sp1E2 = isSupport ? (_preGateE2 ?? e2) : e2;
        const _sp1N2 = isSupport ? (_preGateN2 ?? n2) : n2;
        const _sp1U2 = isSupport ? (_preGateU2 ?? u2) : u2;
        const _sp1Len = isSupport ? (_preGateLen ?? lenCalc) : lenCalc;

        const _supportMaxSeg = config.coordinateSettings?.maxSegmentLength ?? 20000;
        const rsCfg = config.coordinateSettings?.rayShooter ?? {};
        const isAnciConvertOn = (rsCfg.anciConvertMode !== 'OFF'); // default ON

        if (isSupport && _sp1Len > 0 && _sp1Len <= _supportMaxSeg) {  // upper-bound: Phase 3 segments if longer
            if (isAnciConvertOn) {
                // ANCI Convert mode = ON (default / original behavior):
                // Step 1: Build PIPE _bridged with the ORIGINAL geometry (before zeroing the support)
                const _sp1 = {
                    ...rCurrent,
                    RefNo:    (rCurrent.RefNo || rCurrent.Sequence) + '_Support',
                    Bore:     String(parseFloat(rCurrent.Bore) || _lastSeenBore || 0),
                    Sequence: String((parseFloat(rCurrent.Sequence) || 0) + 0.1),
                    Type:     'PipeWithSupport',   // guarded during ray shooting — renamed back to PIPE afterwards
                    Point:    '1',
                    East:     e1,
                    North:    n1,
                    Up:       u1,
                    EndX:     _sp1E2,
                    EndY:     _sp1N2,
                    EndZ:     _sp1U2,
                    Len_Calc: _sp1Len,
                    __sp1Preserved: true,  // tells Final Pass to honour pre-set EP1/EP2, not re-resolve
                    __supportPipe: true    // survives rename-back so downstream can still identify support pipes
                };
                // Step 2: Collapse the support itself to zero-length
                rCurrent.Len_Calc = 0;
                rCurrent.EndX = e1;
                rCurrent.EndY = n1;
                rCurrent.EndZ = u1;
                rCurrent.__gateCollapsed = true; // prevents Final Pass P-3 from re-resolving EP2 over this collapse

                validated.push(rCurrent);
                validated.push(_sp1);
                _sp1WasCreated = true;
                console.log(`[Support-Sp1] PIPE "${_sp1.RefNo}" created (${_sp1.Len_Calc.toFixed(2)}mm). Support "${rCurrent.RefNo}" collapsed to zero-length.`);
            } else {
                // ANCI Convert mode = OFF:
                // Keep the original ANCI with its full length. Do not split into 0-length ANCI + PipeWithSupport.
                rCurrent.Len_Calc = lenCalc;
                rCurrent.EndX = e2;
                rCurrent.EndY = n2;
                rCurrent.EndZ = u2;
                validated.push(rCurrent);
                console.log(`[Support-Sp1] ANCI Convert Mode OFF: Kept support "${rCurrent.RefNo}" with length ${_sp1Len.toFixed(2)}mm.`);
            }
        } else {
            // No split — attach normal coords and push
            rCurrent.Len_Calc = lenCalc;
            rCurrent.EndX = e2;
            rCurrent.EndY = n2;
            rCurrent.EndZ = u2;
            validated.push(rCurrent);
        }



        // --- PSI CORRECTION PASS (PHASE 1: DETECTION) ---
        // Executes strictly after spatial Euclidean calc, before Gap Fill logic.

        if (typeof window !== 'undefined' && window.__PSI_CORRECTION_MODE) {
            const typeStr = String(rCurrent.Type || rCurrent.COMPONENT || rCurrent.componentName || "").trim().toUpperCase();
            const rigidStr = String(rCurrent.Rigid || "").trim().toUpperCase();

            // 1. END Flanges -> PIPE
            // Matches 'FLAN' substring and 'END' with whitespace stripped
            if (rigidStr === 'END' && typeStr.includes('FLAN')) {
                // If the previous row has Rigid=START, collapse to zero length per user logic
                const rPrev = i > 0 ? sourceRows[i - 1] : null;
                const prevRigid = rPrev ? String(rPrev.Rigid || "").trim().toUpperCase() : "";
                
                if (prevRigid === 'START') {
                    lenCalc = 0;
                    rCurrent.Len_Calc = 0;
                    rCurrent.EndX = e1;
                    rCurrent.EndY = n1;
                    rCurrent.EndZ = u1;
                    console.log(`[PSI Correction] Collapsed END-Flange ${rCurrent.Sequence} to zero-length pipe (prev row was START).`);
                }

                if (rCurrent.Sequence) psiTargetSeqs.set(rCurrent.Sequence, lenCalc);
            }

            // 2. Extensional OLETs or TEEs -> PIPE
            // User specified: lencalc>0 AND that its next element is not an OLET/TEE
            const nextTypeStr = rNext ? String(rNext.Type || rNext.COMPONENT || rNext.componentName || "").trim().toUpperCase() : "";

            const isOletOrTee = typeStr.includes('OLET') || typeStr.includes('TEE');
            const nextIsOletOrTee = nextTypeStr.includes('OLET') || nextTypeStr.includes('TEE');

            // --- WATCH WINDOW HOOK FOR SEQUENCE 108 ---
            if (String(rCurrent.Sequence) === "108") {
                let logText = `[SEQ 108 EXECUTION WATCHER]\n`;
                logText += `0. Reference Number (RefNo):    [${rCurrent.RefNo}]\n`;
                logText += `1. Current Component === OLET/TEE?  [${isOletOrTee}] (Value: ${typeStr})\n`;
                logText += `2. Calculated Len_Calc > 0?     [${lenCalc > 0}] (Value: ${lenCalc.toFixed(2)}mm)\n`;
                logText += `3. Next Component !== OLET/TEE?     [${!nextIsOletOrTee}] (Value: ${nextTypeStr})\n`;

                if (isOletOrTee && lenCalc > 0 && !nextIsOletOrTee) {
                    logText += `\n>>> ALL CONDITIONS MET. MUTATING TO PIPE.`;
                } else {
                    logText += `\n>>> FAILED. DID NOT MUTATE.`;
                }

                if (typeof document !== 'undefined') {
                    const ww = document.getElementById('olet-watch-window');
                    if (ww) {
                        ww.innerText = logText;
                        ww.style.color = 'white';
                    }
                }
                console.log(logText); // Backup print
            }
            // ------------------------------------------

            if (isOletOrTee && lenCalc > 0 && !nextIsOletOrTee) {
                rCurrent.RefNo = (rCurrent.RefNo || rCurrent.Sequence) + '_pipe';
                rCurrent.Type = 'PIPE';
                if (rCurrent["Component Name"]) rCurrent["Component Name"] = 'PIPE';
                if (rCurrent.componentName) rCurrent.componentName = 'PIPE';
                console.log(`[PSI Correction] Inline mutated ${typeStr} ${rCurrent.Sequence} to PIPE (Len: ${lenCalc.toFixed(2)}mm)`);
            }
        }

        // ── DIAGNOSTIC: trace all _pipe creation paths for component 3064 ────────
        if (String(rCurrent.RefNo || '').includes('3064')) {
            console.warn(
                `[Pipe-Diag] RefNo="${rCurrent.RefNo}" Seq=${rCurrent.Sequence}\n` +
                `  rawType="${rawType}"  isSupport=${isSupport}  isOletOrTeeConn=${isOletOrTeeConnection}\n` +
                `  PSI_MODE=${typeof window !== 'undefined' && !!window.__PSI_CORRECTION_MODE}\n` +
                `  lenCalc=${lenCalc.toFixed(4)}mm  rNext=${rNext ? `"${rNext.RefNo}" type="${String(rNext.Type||'').trim()}"` : 'null'}\n` +
                `  Note: _pipe comes from PSI-Correction or Phase0.5, NOT from support injection (_Injected)`
            );
        }

        // 2. Point-Component Pipe Injection
        // The user specifically named supports. Supports typically have type SUPPORT or ANCI.
        // Let's check if the PCF keyword translates to a point item (SUPPORT, ANCI, etc).\n        // The user said: "check if any component (like support) has len_Calc>0, then add row just below that with Type=PIPE."
        const injThreshold   = Math.max(0.1, config.coordinateSettings?.continuityTolerance || 0.5);
        // Option A fix: suppress injection when gap is unrealistically large (cross-component CSV ordering artefact).
        // Default 5000mm covers any real support-to-pipe gap; 50m+ gaps are not real connections.
        const maxInjectionGap = config.coordinateSettings?.maxInjectionGap ?? 5000;


        // ── DIAGNOSTIC: trace injection gate for known components ──────────────
        const _diagRef = String(rCurrent.RefNo || '');
        if (_diagRef.includes('2483') || _diagRef.includes('6577')) {
            // Strip _Sp suffix to find base RefNo for dedup check
            const _baseRef = _diagRef.replace(/_Sp\d+$/, '');
            console.warn(
                `[Injection-Diag] RefNo="${_diagRef}" baseRef="${_baseRef}" Seq=${rCurrent.Sequence}\n` +
                `  rawType="${rawType}"  isSupport=${isSupport}\n` +
                `  lenCalc=${lenCalc.toFixed(4)}mm  threshold=${injThreshold}mm  lenCalc>=threshold=${lenCalc >= injThreshold}\n` +
                `  alreadyInjectedAsBase=${injectedBaseRefs.has(_baseRef)}\n` +
                `  rNext=${rNext ? `"${rNext.RefNo}" type="${String(rNext.Type||'').trim()}"` : 'null'}\n` +
                `  e1=(${e1},${n1},${u1})  e2=(${e2},${n2},${u2})\n` +
                `  WILL INJECT: ${isSupport && lenCalc >= injThreshold && !injectedBaseRefs.has(_baseRef)}`
            );
        }

        if (isSupport && !_sp1WasCreated && lenCalc >= injThreshold && lenCalc <= maxInjectionGap
                && (typeof window !== 'undefined' && window.__PSI_CORRECTION_MODE)) {
            // FIX: Strip the _Sp suffix to get the canonical base RefNo.
            // If any _Sp sibling of this support has already been injected, skip.
            // This prevents Phase-0 spool splits (_Sp1/_Sp2/...) from each injecting
            // their own pipe and creating duplicate _Injected rows.
            const baseRef = String(rCurrent.RefNo || '').replace(/_Sp\d+$/, '');
            if (injectedBaseRefs.has(baseRef)) {
                console.log(`[Injection-Skip] "${rCurrent.RefNo}" skipped — base "${baseRef}" already injected by a sibling _Sp row.`);
            } else {
                injectedBaseRefs.add(baseRef);

                // Inject a synthetic pipe group containing a single row (Start Point only)
                const currentSeq = parseFloat(rCurrent.Sequence) || 0;
                const refNoInjected = (rCurrent.RefNo || rCurrent.Sequence) + "_Injected";

                const syntheticPipe1 = {
                    ...rCurrent,
                    Sequence: String(currentSeq + 0.1),
                    Type: "PIPE",
                    "Component Name": rCurrent["Component Name"] || rCurrent.componentName || "PIPE",
                    RefNo: refNoInjected,
                    Point: "1",
                    East: e1,
                    North: n1,
                    Up: u1,
                    EndX: e2,
                    EndY: n2,
                    EndZ: u2
                };

                validated.push(syntheticPipe1);
                anomalies.push({
                    refNo: syntheticPipe1.RefNo,
                    severity: "INFO",
                    ruleId: "ROW-VAL-01",
                    description: `Injected missing PIPE after component ${rCurrent.Sequence} (Type: ${rawType}) due to Len_Calc=${lenCalc.toFixed(2)}mm`
                });
            }
        }
    } // end main for-loop

    _spTrack('Phase1-validated', validated);

    // ── TEE Branch-Point Enrichment (Phase 1 BP stamping) ────────────────────────
    // For every TEE component group (rows sharing the same RefNo and Type=TEE):
    //   1. Locate Point=1 (run start), Point=2 (run end), Point=3 (branch raw coords).
    //   2. Compute CP = midpoint of P1+P2 and run vector V_run = P2-P1.
    //   3. Project the raw CP→P3 branch vector onto the plane perpendicular to V_run
    //      (removes any along-run drift from CSV data imprecision).
    //   4. Stamp EndX/EndY/EndZ on the P3 row with CP + the corrected branch vector,
    //      and tag _isBranchPoint = true so buildPts prefers this over Final-Pass EndX.
    // This is done BEFORE the phase05Snapshot so the snapshot captures the correct values.
    {
        const _teeByRef = new Map(); // refNo → { '1': row, '2': row, '3': row }
        for (const row of validated) {
            const typ = String(row.Type || row.Real_Type || '').trim().toUpperCase();
            if (!typ.includes('TEE')) continue;
            const ref = String(row.RefNo || '').trim();
            const pt  = String(row.Point  || '').trim();
            if (!ref || !pt) continue;
            if (!_teeByRef.has(ref)) _teeByRef.set(ref, {});
            _teeByRef.get(ref)[pt] = row;
        }

        for (const [ref, tRows] of _teeByRef) {
            const p1 = tRows['1'], p2 = tRows['2'], p3 = tRows['3'];
            if (!p1 || !p2 || !p3) continue;

            const e1 = parseFloat(p1.East)  || 0, n1 = parseFloat(p1.North) || 0, u1 = parseFloat(p1.Up) || 0;
            const e2 = parseFloat(p2.East)  || 0, n2 = parseFloat(p2.North) || 0, u2 = parseFloat(p2.Up) || 0;
            const e3 = parseFloat(p3.East)  || 0, n3 = parseFloat(p3.North) || 0, u3 = parseFloat(p3.Up) || 0;

            const cpE = (e1 + e2) / 2, cpN = (n1 + n2) / 2, cpU = (u1 + u2) / 2;
            const runE = e2 - e1, runN = n2 - n1, runU = u2 - u1;
            const runLen2 = runE * runE + runN * runN + runU * runU;
            if (runLen2 < 1e-6) continue; // degenerate run — skip

            // Branch vector from CP to raw P3 coords
            const bE = e3 - cpE, bN = n3 - cpN, bU = u3 - cpU;
            // Remove along-run component (vector sense correction)
            const dot = (bE * runE + bN * runN + bU * runU) / runLen2;
            const perpE = bE - dot * runE, perpN = bN - dot * runN, perpU = bU - dot * runU;
            const perpLen = Math.sqrt(perpE * perpE + perpN * perpN + perpU * perpU);
            if (perpLen < 1.0) continue; // no meaningful branch direction

            p3.EndX = cpE + perpE;
            p3.EndY = cpN + perpN;
            p3.EndZ = cpU + perpU;
            p3._isBranchPoint = true; // tag: buildPts must use EndX, not raw East/North/Up
            console.log(`[TEE-BP] ${ref}: P3 branch stamped EndX=(${p3.EndX.toFixed(1)},${p3.EndY.toFixed(1)},${p3.EndZ.toFixed(1)}) perpLen=${perpLen.toFixed(1)}mm`);
        }
    }

    // Stage 0.5 snapshot — deep copy taken AFTER Phase 1 (Len_Vec / push gate / _Sp1)
    // and AFTER TEE BP stamping, but BEFORE PSI Phase 2 mutation, segmentation, and Final Pass.
    const phase05Snapshot = validated.map(r => Object.assign({}, r));

    // --- PSI CORRECTION PASS (PHASE 2: MUTATION) ---
    // Now that all physical endpoints have calculated lengths based on their original geometries,
    // we logically detach EXACTLY the specific row sequence generating the length into a standalone element.
    if (typeof window !== 'undefined' && window.__PSI_CORRECTION_MODE && psiTargetSeqs.size > 0) {
        for (let i = 0; i < validated.length; i++) {
            const r = validated[i];

            if (r.Sequence && psiTargetSeqs.has(r.Sequence)) {
                // Rename exactly per user instruction: detach ONLY this sequence row
                if (r.RefNo) r.RefNo = r.RefNo + '_pipe';
                r.Type = 'PIPE';
                if (r["Component Name"]) r["Component Name"] = 'PIPE';
                if (r.componentName) r.componentName = 'PIPE';

                // Explicitly bind the preserved physical length so the Final Pass array overwrite
                // does not zero it out when scanning the disjointed legacy arrays!
                r.Len_Calc = psiTargetSeqs.get(r.Sequence);

                // Zero-length _pipe rows (END-flange face markers) are pipeline endpoints that
                // need a bridge to the next physical component. Mark them for the ray shooter.
                if (parseFloat(r.Len_Calc) === 0) {
                    r.__needsBridge = true;
                }
            }
        }
        console.log(`[PSI Correction] Successfully mutated exactly ${psiTargetSeqs.size} sequencing elements to standalone PIPES.`);
    }

    // 3. Flat-Row Segmentation (Replaces segmentizer.js)
    // If a PIPE row has Len_Calc > maxPipeRun, physically slice it into smaller rows.
    maxSegmentLengthLimit = config.coordinateSettings?.common3DLogic?.maxPipeRun || 20000; // Typical fabrication limit
    const segmented = [];

    for (let i = 0; i < validated.length; i++) {
        const r = validated[i];

        // Only segment PIPEs (including mapped types like BRAN)
        const pcfType = config.componentTypeMap ? (config.componentTypeMap[String(r.Type || "").trim().toUpperCase()] || r.Type) : r.Type;
        if (pcfType !== "PIPE" || !r.Len_Calc || r.Len_Calc <= maxSegmentLengthLimit) {
            segmented.push(r);
            continue;
        }

        // This PIPE exceeds max length. We need its coordinate and the next coordinate.
        const e1 = parseFloat(r.East) || 0;
        const n1 = parseFloat(r.North) || 0;
        const u1 = parseFloat(r.Up) || 0;

        // The vector to the next row
        const rNext = validated[i + 1];
        if (!rNext) {
            segmented.push(r); // Cannot safely interpolate without a target
            continue;
        }

        const e2 = parseFloat(rNext.East) || 0;
        const n2 = parseFloat(rNext.North) || 0;
        const u2 = parseFloat(rNext.Up) || 0;

        const vecE = e2 - e1;
        const vecN = n2 - n1;
        const vecU = u2 - u1;
        const totalLen = Math.sqrt(vecE * vecE + vecN * vecN + vecU * vecU);

        if (totalLen <= maxSegmentLengthLimit) {
            segmented.push(r);
            continue;
        }

        const numSegments = Math.ceil(totalLen / maxSegmentLengthLimit);
        const segLen = totalLen / numSegments;
        const dirE = vecE / totalLen;
        const dirN = vecN / totalLen;
        const dirU = vecU / totalLen;

        anomalies.push({
            refNo: r.RefNo || r.Sequence,
            severity: "INFO",
            ruleId: "ROW-SEG-01",
            description: `Segmented long PIPE (${totalLen.toFixed(0)}mm) into ${numSegments} rows of ~${segLen.toFixed(0)}mm`
        });

        // Reinstating logic to break geometry connectivity (Len=0) across huge gaps to permanently prevent "skew lines".
        // Instead of linearly interpolating the huge gap, if it's considered an artifact/skip gap, we should segment it
        // Or actually, if it exceeds maxSegmentLength, the logic requested to segment but rename as `_SpX`.
        // The user specifically mentions "split pipes and missing gap components are now explicitly renamed with _SpX suffixes".

        let prevE = e1, prevN = n1, prevU = u1;
        for (let s = 0; s < numSegments; s++) {
            const isLast = s === numSegments - 1;
            const nextE = isLast ? e2 : prevE + (dirE * segLen);
            const nextN = isLast ? n2 : prevN + (dirN * segLen);
            const nextU = isLast ? u2 : prevU + (dirU * segLen);

            const segmentRow = { ...r };
            segmentRow.Sequence = `${r.Sequence}_Sp${s + 1}`;
            if (segmentRow.RefNo) segmentRow.RefNo = `${r.RefNo}_Sp${s + 1}`;

            segmentRow.East = prevE;
            segmentRow.North = prevN;
            segmentRow.Up = prevU;

            // The Len_Calc of this new segment is the distance to its respective next point
            segmentRow.Len_Calc = Math.max(0, Math.abs(prevE - nextE) + Math.abs(prevN - nextN) + Math.abs(prevU - nextU));
            segmentRow.EndX = nextE;
            segmentRow.EndY = nextN;
            segmentRow.EndZ = nextU;

            segmented.push(segmentRow);

            prevE = nextE;
            prevN = nextN;
            prevU = nextU;
        }
    }

    // 4. Flat-Row Overlap & Duplicate Removal (Replaces pipeline overlap resolver)
    const finalValidated = [];

    for (let s = 0; s < segmented.length; s++) {
        const curr = segmented[s];
        const prev = finalValidated.length > 0 ? finalValidated[finalValidated.length - 1] : null;
        const next = s < segmented.length - 1 ? segmented[s + 1] : null;

        const pcfTypeCurr = config.componentTypeMap ? (config.componentTypeMap[String(curr.Type || "").trim().toUpperCase()] || curr.Type) : curr.Type;
        if (pcfTypeCurr === "PIPE") {
            // Check 4a: Exact identical duplicate PIPE (same coords, same length)
            console.log("Checking duplication/foldback for", curr.Sequence, "vs prev", prev ? prev.Sequence : "null");
            const pcfTypePrev = prev ? (config.componentTypeMap ? (config.componentTypeMap[String(prev.Type || "").trim().toUpperCase()] || prev.Type) : prev.Type) : "";
            if (prev && pcfTypePrev === "PIPE") {
                const dx = Math.abs((curr.East || 0) - (prev.East || 0));
                const dy = Math.abs((curr.North || 0) - (prev.North || 0));
                const dz = Math.abs((curr.Up || 0) - (prev.Up || 0));
                if (dx < 0.1 && dy < 0.1 && dz < 0.1) {
                    anomalies.push({
                        refNo: curr.RefNo || curr.Sequence,
                        severity: "WARNING",
                        ruleId: "ROW-OVR-01",
                        description: `Dropped duplicate PIPE co-located with previous component at ${curr.East}, ${curr.North}, ${curr.Up}`
                    });
                    console.log("DROPPED DUPLICATE", curr.Sequence);
                    // continue; // Drop it (Temporary disable for user visibility)
                }
            }

            // Check 4b: Foldback PIPE (A -> B, then B -> A)
            if (prev && next) {
                // Vector of previous (A -> B)
                const vPrev = {
                    E: (curr.East || 0) - (prev.East || 0),
                    N: (curr.North || 0) - (prev.North || 0),
                    U: (curr.Up || 0) - (prev.Up || 0)
                };
                // Vector of current (B -> C)
                const vCurr = {
                    E: (next.East || 0) - (curr.East || 0),
                    N: (next.North || 0) - (curr.North || 0),
                    U: (next.Up || 0) - (curr.Up || 0)
                };

                const lenPrev = Math.sqrt(vPrev.E * vPrev.E + vPrev.N * vPrev.N + vPrev.U * vPrev.U);
                const lenCurr = Math.sqrt(vCurr.E * vCurr.E + vCurr.N * vCurr.N + vCurr.U * vCurr.U);

                if (lenPrev > 0.1 && lenCurr > 0.1) {
                    // Dot product over lengths (cosine of angle)
                    const dot = (vPrev.E * vCurr.E + vPrev.N * vCurr.N + vPrev.U * vCurr.U) / (lenPrev * lenCurr);
                    if (dot < -0.99) { // 180 degree foldback
                        anomalies.push({
                            refNo: curr.RefNo || curr.Sequence,
                            severity: "WARNING",
                            ruleId: "ROW-OVR-02",
                            description: `Dropped foldback PIPE. Reverses direction into previous component.`
                        });
                        console.log("DROPPED FOLDBACK", curr.Sequence);
                        // continue; // Drop it (Temporary disable for user visibility)
                    }
                }
            }
        }

        finalValidated.push(curr);
    }

    // ── Ray Mode: Stage 2-OUT basis filter ───────────────────────────────
    // In Ray Mode, only mappable fittings proceed to Final Pass, Ray Shooter,
    // and all downstream stages.  PIPE / BRAN and any type the config maps to
    // SKIP / UNKNOWN / MISC-COMPONENT (e.g. GASKET, PCOM, MISC) are stripped
    // here so Stage 3 onwards only sees the same 70-row set shown in Stage 2-OUT.
    if (typeof window !== 'undefined' && window.__RAY_MODE) {
        const _tm     = config.componentTypeMap ?? {};
        const _nonPcf = new Set(['SKIP', 'UNKNOWN', 'MISC-COMPONENT']);
        const _excl   = new Set([
            'PIPE', 'BRAN',
            ...Object.entries(_tm)
                .filter(([, v]) => _nonPcf.has(String(v).trim().toUpperCase()))
                .map(([k]) => k.trim().toUpperCase()),
        ]);
        const _supp = new Set(['ANCI', 'RSTR', 'SUPPORT']);
        for (let _i = finalValidated.length - 1; _i >= 0; _i--) {
            const _r = finalValidated[_i];
            const _t = String(_r.Type || '').trim().toUpperCase();
            if (_excl.has(_t)) { finalValidated.splice(_i, 1); continue; }
            const _l = parseFloat(_r.Len_Calc) || 0;
            // PRESERVE: Supports and Center Points (Point 0) must survive zero-length purge
            if (_l === 0 && !_supp.has(_t) && String(_r.Point ?? '').trim() !== '0') finalValidated.splice(_i, 1);
        }
        console.info(`[RayMode] Stage 2-OUT filter applied: ${finalValidated.length} rows remain for Final Pass & Ray Shooter.`);
    }

    _spTrack('Phase4-finalValidated-PRE-FinalPass', finalValidated);

    // Stage 0.9 snapshot — deep copy taken BEFORE Final Pass.
    // Shows post-PSI-Phase2, post-segmentation state: _pipe rows visible, __needsBridge flags set,
    // Len_Vec computed, push gate applied — pairStatus not yet assigned by Final Pass.
    const phase09Snapshot = finalValidated.map(r => Object.assign({}, r));

    // 5. Final Pass: Topology-aware EP2 resolution + Len_Calc recalculation.
    //
    //    EP2 resolution priority (per row):
    //      GUARD-0  __gateCollapsed        → keep zero (push gate already collapsed this)
    //      GUARD-A  __unpaired_resolved    → keep Phase 0.25 endpoint (do NOT overwrite)
    //      GUARD-B  isSynthetic (_pipe/_Injected) → keep existing EndX/Y/Z
    //      P-1      Next(Target) field     → topology-aware: resolve to row by Seq or RefNo
    //      P-2      Same-RefNo next row    → next row in array with identical RefNo
    //      P-3      Sequential fallback    → finalValidated[i+1], but ONLY if:
    //                 • same LineNo (fuzzy mode), OR
    //                 • any mode but cross-line gap ≤ maxSegment
    //      NONE     → EP2 = EP1 (zero length), pairStatus = 'Unpaired'

    const isFuzzyFinal = (config.coordinateSettings?.pipelineMode === 'repair');
    const maxSegFinal  = config.coordinateSettings?.maxSegmentLength
        || config.coordinateSettings?.common3DLogic?.maxPipeRun
        || 20000;

    // ── PRE-FINAL-PASS: Restore _Sp1 support clones EP2 from parent ─────────────
    // For support-clone _Sp1 rows (marked __sp1Preserved), EndX/Y/Z should already be set.
    // As a safety net: if EP1==EP2 (zero-length), look up the parent support row (base RefNo)
    // and its _Injected sibling to recover the original EP2 coordinates.
    for (let i = 0; i < finalValidated.length; i++) {
        const r = finalValidated[i];
        if (!r.__sp1Preserved) continue;

        const ex = parseFloat(r.EndX);
        const ey = parseFloat(r.EndY);
        const ez = parseFloat(r.EndZ);
        const rx = parseFloat(r.East)  || 0;
        const ry = parseFloat(r.North) || 0;
        const rz = parseFloat(r.Up)    || 0;

        // Only repair if EP1 == EP2 (genuinely zero-length)
        const epDist = Math.sqrt(Math.pow(rx-(ex||0),2) + Math.pow(ry-(ey||0),2) + Math.pow(rz-(ez||0),2));
        if (epDist > 0.1) continue; // already has valid EP2, skip

        // Try to find the _Injected sibling: RefNo = base + '_Injected'
        const baseRef = String(r.RefNo || '').replace(/_Sp\d+$/, '');
        const injRef  = baseRef + '_Injected';
        const injRow  = finalValidated.find(fr => String(fr.RefNo || '') === injRef);
        if (injRow) {
            const ix = parseFloat(injRow.EndX);
            const iy = parseFloat(injRow.EndY);
            const iz = parseFloat(injRow.EndZ);
            const injDist = Math.sqrt(Math.pow(rx-(ix||0),2) + Math.pow(ry-(iy||0),2) + Math.pow(rz-(iz||0),2));
            if (injDist > 0.1 && injDist < maxSegFinal) {
                r.EndX = ix || rx;
                r.EndY = iy || ry;
                r.EndZ = iz || rz;
                console.log(`[Sp1 Pre-Pass] "${r.RefNo}" recovered EP2 from ${injRef} — dist=${injDist.toFixed(2)}mm`);
                continue;
            }
        }

        // Fallback: look two rows ahead in finalValidated for a row with different coords
        for (let j = i + 1; j <= Math.min(i + 3, finalValidated.length - 1); j++) {
            const fwd = finalValidated[j];
            // Skip rows at same position as _Sp1
            const fx = parseFloat(fwd.East)  || 0;
            const fy = parseFloat(fwd.North) || 0;
            const fz = parseFloat(fwd.Up)    || 0;
            const fwdDist = Math.sqrt(Math.pow(rx-fx,2) + Math.pow(ry-fy,2) + Math.pow(rz-fz,2));
            if (fwdDist > 0.1 && fwdDist < maxSegFinal) {
                r.EndX = fx;
                r.EndY = fy;
                r.EndZ = fz;
                console.log(`[Sp1 Pre-Pass] "${r.RefNo}" recovered EP2 from row[${j}] "${fwd.RefNo}" — dist=${fwdDist.toFixed(2)}mm`);
                break;
            }
        }
    }

    _spTrack('Phase5-PreFinalPass-afterEP2Restore', finalValidated);

    // Pre-pass index maps for fast topology lookup
    const _fpSeqMap = new Map();  // Sequence string → array index in finalValidated
    const _fpRefMap = new Map();  // RefNo string    → array of indices in finalValidated
    for (let i = 0; i < finalValidated.length; i++) {
        const r   = finalValidated[i];
        const seq = String(r.Sequence ?? '').trim();
        if (seq) _fpSeqMap.set(seq, i);
        const ref = String(r.RefNo ?? '').trim();
        if (ref) {
            if (!_fpRefMap.has(ref)) _fpRefMap.set(ref, []);
            _fpRefMap.get(ref).push(i);
        }
    }

    for (let i = 0; i < finalValidated.length; i++) {
        const rCurrent = finalValidated[i];

        let lenCalc = 0;
        const e1 = parseFloat(rCurrent.East)  || 0;
        const n1 = parseFloat(rCurrent.North) || 0;
        const u1 = parseFloat(rCurrent.Up)    || 0;

        // ── Immutable guards ──────────────────────────────────────────
        const isGateCollapsed = rCurrent.__gateCollapsed    === true;
        const isResolved      = rCurrent.__unpaired_resolved === true;
        const isSynthetic     = rCurrent.RefNo &&
            (String(rCurrent.RefNo).includes('_Injected') || String(rCurrent.RefNo).includes('_pipe'));
        // _Sp1 support clones: EP1/EP2 were copied from parent support before it was zeroed.
        // Preserve them — do NOT let topology re-resolution overwrite with a wrong next row.
        const isSp1Preserved  = rCurrent.__sp1Preserved === true;

        if (isGateCollapsed || isResolved || isSynthetic || isSp1Preserved) {
            // __needsBridge rows are PSI face-markers whose Len_Calc was explicitly set to 0
            // by PSI Phase 2.  Any EndX/Y/Z inherited from Phase 1 / Phase 0.5 must be
            // discarded — the marker must remain at EP1 (zero-length) so that:
            //   a) _fpIsZeroLen returns true (P-3 stops at the bridge marker), and
            //   b) the ray shooter's injection creates the bridging PIPE instead.
            if (isSynthetic && rCurrent.__needsBridge) {
                rCurrent.EndX = e1;
                rCurrent.EndY = n1;
                rCurrent.EndZ = u1;
            } else if (rCurrent.EndX === undefined) {
                // Honour existing EndX/Y/Z — do not overwrite.
                rCurrent.EndX = e1;
                rCurrent.EndY = n1;
                rCurrent.EndZ = u1;
            }
            const ex = parseFloat(rCurrent.EndX) || 0;
            const ey = parseFloat(rCurrent.EndY) || 0;
            const ez = parseFloat(rCurrent.EndZ) || 0;
            lenCalc = Math.sqrt(Math.pow(e1 - ex, 2) + Math.pow(n1 - ey, 2) + Math.pow(u1 - ez, 2));
            if (isResolved && lenCalc > maxSegFinal) lenCalc = 0;

            // If EP1 == EP2 (zero length), attempt a single-step recovery for _Sp1:
            // look ahead to the next component and use its coords as EP2.
            if (isSp1Preserved && lenCalc === 0 && i < finalValidated.length - 1) {
                const _sp1Next = finalValidated[i + 1];
                const _nx = parseFloat(_sp1Next.East)  || 0;
                const _ny = parseFloat(_sp1Next.North) || 0;
                const _nz = parseFloat(_sp1Next.Up)    || 0;
                const _recovDist = Math.sqrt(Math.pow(e1 - _nx, 2) + Math.pow(n1 - _ny, 2) + Math.pow(u1 - _nz, 2));
                if (_recovDist > 0 && _recovDist < maxSegFinal) {
                    rCurrent.EndX = _nx;
                    rCurrent.EndY = _ny;
                    rCurrent.EndZ = _nz;
                    lenCalc = _recovDist;
                    console.log(`[Sp1 Recovery] "${rCurrent.RefNo}" recovered EP2 from next row — lenCalc=${lenCalc.toFixed(2)}mm`);
                }
            }

            rCurrent._pnt1Seq  = rCurrent.Sequence ?? (i + 1);
            rCurrent._pnt2Seq  = null;
            rCurrent.pairStatus = isGateCollapsed    ? 'Gate-Collapsed'
                                : isSp1Preserved     ? 'Sp1-Preserved'
                                : rCurrent.__unpaired_final ? 'Unpaired'
                                : 'Pair-Geo';
            rCurrent.Len_Calc = lenCalc;
            continue;
        }

        // ── P-1: Next(Target) from PCF table ─────────────────────────
        let rNext       = null;
        let nextSource  = null;

        const _ntStr = String(
            rCurrent['Next(Target)'] || rCurrent['Next Target'] || rCurrent.NextTarget || ''
        ).trim();

        // Helper: returns true if candidate is at the same EP1 as current row (would produce zero-length)
        const _fpIsZeroLen = (cand) => {
            const ce = parseFloat(cand.East)  || 0;
            const cn = parseFloat(cand.North) || 0;
            const cu = parseFloat(cand.Up)    || 0;
            return Math.sqrt((e1-ce)**2 + (n1-cn)**2 + (u1-cu)**2) < 0.1;
        };

        if (_ntStr && _ntStr !== 'N/A' && _ntStr !== '-') {
            const _idxBySeq = _fpSeqMap.has(_ntStr) ? _fpSeqMap.get(_ntStr) : -1;
            const _idxByRef = _fpRefMap.has(_ntStr) ? _fpRefMap.get(_ntStr)[0] : -1;
            const _idx      = _idxBySeq >= 0 ? _idxBySeq : _idxByRef;
            if (_idx >= 0 && _idx !== i) {
                const _cand = finalValidated[_idx];
                if (!_fpIsZeroLen(_cand)) {
                    rNext      = _cand;
                    nextSource = 'Next(Target)';
                } else {
                    console.log(`[Final Pass] Seq ${rCurrent.Sequence} — P-1 Next(Target) "${_ntStr}" is zero-length, skipping.`);
                }
            }
        }

        // ── P-2: Same-RefNo next row (skip zero-length candidates) ───
        if (!rNext) {
            const _curRef   = String(rCurrent.RefNo ?? '').trim();
            const _refIdxs  = _fpRefMap.get(_curRef) || [];
            const _posInRef = _refIdxs.indexOf(i);
            for (let _pi = _posInRef + 1; _pi < _refIdxs.length; _pi++) {
                const _cand = finalValidated[_refIdxs[_pi]];
                // CP rows (Point=0) are geometric junction centres — not connectable faces.
                // Must not be used as P-2 pairing targets even if they have non-zero coordinates.
                if (String(_cand.Point ?? '').trim() === '0') continue;
                if (!_fpIsZeroLen(_cand)) {
                    rNext      = _cand;
                    nextSource = 'same-RefNo';
                    break;
                }
                if (_cand.__needsBridge) {
                    // Bridge marker — stop here, don't look past it.
                    console.log(`[Final Pass] Seq ${rCurrent.Sequence} — P-2 hit __needsBridge marker "${_cand.RefNo}", stopping P-2 search.`);
                    break;
                }
                console.log(`[Final Pass] Seq ${rCurrent.Sequence} — P-2 same-RefNo candidate at idx ${_refIdxs[_pi]} is zero-length, skipping.`);
            }
        }

        // ── P-3: Sequential fallback (guarded by line boundary, skip zero-length) ──
        // Skip for DE rows — chain-boundary dead-ends; sequential look-ahead grabs wrong
        // CSV-adjacent partners. Ray shooter handles these via P4-LenVec instead.
        if (!rNext && rCurrent['DE/BO'] !== 'DE') {
            for (let _si = i + 1; _si <= Math.min(i + 5, finalValidated.length - 1); _si++) {
                const _candidate = finalValidated[_si];
                if (_fpIsZeroLen(_candidate)) {
                    if (_candidate.__needsBridge) {
                        // Bridge marker — stop here, don't look past it.
                        // Ray shooter will handle this orphan via P4 axis fallback.
                        console.log(`[Final Pass] Seq ${rCurrent.Sequence} — P-3 hit __needsBridge marker "${_candidate.RefNo}", stopping P-3 search.`);
                        break;
                    }
                    console.log(`[Final Pass] Seq ${rCurrent.Sequence} — P-3 sequential candidate[${_si}] "${_candidate.RefNo}" is zero-length, skipping.`);
                    continue;
                }

                let _allow = true;
                if (isFuzzyFinal) {
                    const lnA = deriveLineNo(rCurrent,   config);
                    const lnB = deriveLineNo(_candidate, config);
                    if (lnA && lnB && lnA !== lnB) {
                        const _dx = (parseFloat(_candidate.East)  || 0) - e1;
                        const _dy = (parseFloat(_candidate.North) || 0) - n1;
                        const _dz = (parseFloat(_candidate.Up)    || 0) - u1;
                        const _crossLineLimit = config.coordinateSettings?.common3DLogic?.maxDiagonalGap || 2000;
                        if (Math.sqrt(_dx*_dx + _dy*_dy + _dz*_dz) > _crossLineLimit) {
                            _allow = false;
                            console.log(`[Final Pass] Seq ${rCurrent.Sequence} — blocked cross-line sequential fallback (${lnA}→${lnB})`);
                        }
                    }
                }

                if (_allow) {
                    rNext      = _candidate;
                    nextSource = 'sequential';
                    break;
                }
            }
        }

        // ── Apply resolved rNext ──────────────────────────────────────
        if (rNext) {
            const e2 = parseFloat(rNext.East)  || 0;
            const n2 = parseFloat(rNext.North) || 0;
            const u2 = parseFloat(rNext.Up)    || 0;
            lenCalc       = Math.sqrt(Math.pow(e1-e2,2) + Math.pow(n1-n2,2) + Math.pow(u1-u2,2));
            rCurrent.EndX = e2;
            rCurrent.EndY = n2;
            rCurrent.EndZ = u2;
        } else {
            // No valid next found — zero length
            rCurrent.EndX = e1;
            rCurrent.EndY = n1;
            rCurrent.EndZ = u1;
            lenCalc = 0;
            rCurrent.Len_Calc = '0.00'; // Explicit physical trace normalization
        }

        // ── Final Pass Push Gate (re-check after EP2 is definitively resolved) ──
        // The main-loop push gate ran when e2 may have equalled e1 (e.g. _Sp rows with no
        // Cartesian coords → Len_Vec=0[0]). Now EP2 is set, so re-run the gate.
        if (!rCurrent.__gateCollapsed && isFuzzyFinal && lenCalc > 0) {
            const _fpEndX = parseFloat(rCurrent.EndX) || 0;
            const _fpEndY = parseFloat(rCurrent.EndY) || 0;
            const _fpEndZ = parseFloat(rCurrent.EndZ) || 0;
            const _fpDxVs = e1 - _fpEndX, _fpDyVs = n1 - _fpEndY, _fpDzVs = u1 - _fpEndZ;
            const _fpMag  = Math.sqrt(_fpDxVs*_fpDxVs + _fpDyVs*_fpDyVs + _fpDzVs*_fpDzVs);
            let _fpCosE = 0, _fpCosN = 0, _fpCosU = 0;
            if (_fpMag > 0.001) { _fpCosE = _fpDxVs / _fpMag; _fpCosN = _fpDyVs / _fpMag; _fpCosU = _fpDzVs / _fpMag; }

            const _fpAE  = Math.abs(_fpDxVs) > 0.5;
            const _fpAN  = Math.abs(_fpDyVs) > 0.5;
            const _fpAUp = Math.abs(_fpDzVs) > 0.5;
            const _fpAxes = (_fpAE ? 1 : 0) + (_fpAN ? 1 : 0) + (_fpAUp ? 1 : 0);

            // Slope tolerance for Final Pass gate — same 1:100 rule as main-loop gate
            const _fpSlopeTol = config.coordinateSettings?.singleAxisSlopeTolerance ?? 0.01;
            const _fpPrimMag  = Math.max(Math.abs(_fpDxVs), Math.abs(_fpDyVs), Math.abs(_fpDzVs));
            const _fpAE_eff   = _fpAE  && (_fpPrimMag <= 0 || Math.abs(_fpDxVs) / _fpPrimMag > _fpSlopeTol);
            const _fpAN_eff   = _fpAN  && (_fpPrimMag <= 0 || Math.abs(_fpDyVs) / _fpPrimMag > _fpSlopeTol);
            const _fpAUp_eff  = _fpAUp && (_fpPrimMag <= 0 || Math.abs(_fpDzVs) / _fpPrimMag > _fpSlopeTol);
            const _fpEffAxes  = (_fpAE_eff ? 1 : 0) + (_fpAN_eff ? 1 : 0) + (_fpAUp_eff ? 1 : 0);

            const _fpFmt = (v) => (v >= 0 ? '+' : '') + v.toFixed(3);
            const _fpParts = [];
            if (_fpAE)  _fpParts.push(`${_fpFmt(_fpCosE)}E`);
            if (_fpAN)  _fpParts.push(`${_fpFmt(_fpCosN)}N`);
            if (_fpAUp) _fpParts.push(`${_fpFmt(_fpCosU)}Up`);
            // Update Len_Vec and __axisVec with direction computed from resolved EP2
            rCurrent.Len_Vec              = `${_fpAxes}[${_fpParts.join('') || '0'}]`;
            rCurrent.__effectiveAxisCount = _fpEffAxes;
            rCurrent.__axisVec            = { dE: _fpCosE, dN: _fpCosN, dU: _fpCosU };

            if (_fpEffAxes > 1) {
                const _fpMaxDiag  = config.coordinateSettings?.common3DLogic?.maxDiagonalGap || 2000;
                const _fpBoreMin  = config.coordinateSettings?.boreRatioSettings?.minRatio ?? 0.5;
                const _fpBoreMax  = config.coordinateSettings?.boreRatioSettings?.maxRatio ?? 2.0;
                const _fpBoreA    = parseFloat(rCurrent.Bore) || 0;
                const _fpBoreB    = rNext ? (parseFloat(rNext.Bore) || 0) : 0;
                const _fpRatio    = (_fpBoreA > 0 && _fpBoreB > 0) ? _fpBoreA / _fpBoreB : null;
                const _fpBoreFail = _fpRatio !== null && (_fpRatio < _fpBoreMin || _fpRatio > _fpBoreMax);
                const _fp3dFail   = lenCalc > _fpMaxDiag;

                if (_fp3dFail || _fpBoreFail) {
                    const _fpReason = [
                        _fp3dFail   ? `3D skew ${lenCalc.toFixed(2)}mm > ${_fpMaxDiag}mm`                              : null,
                        _fpBoreFail ? `bore ratio ${_fpRatio.toFixed(3)} outside [${_fpBoreMin}–${_fpBoreMax}]`        : null
                    ].filter(Boolean).join(' + ');
                    console.log(`[Final Pass Gate] "${rCurrent.RefNo}" ${rCurrent.Len_Vec} — ${_fpReason} — collapsing EP2→EP1.`);
                    rCurrent.EndX = e1; rCurrent.EndY = n1; rCurrent.EndZ = u1;
                    lenCalc = 0;
                    rCurrent.Len_Calc = '0.00'; // Explicit physical trace normalization
                    rCurrent.__gateCollapsed = true;
                    // Len_Vec and __axisVec are PRESERVED (not zeroed) — geometry direction is still valid
                }
            }
        }

        // ── Pair status stamp ─────────────────────────────────────────
        rCurrent._pnt1Seq = rCurrent.Sequence ?? (i + 1);
        rCurrent._pnt2Seq = rNext ? (rNext.Sequence ?? null) : null;

        if (rCurrent.__gateCollapsed) {
            rCurrent.pairStatus = 'Gate-Collapsed';
        } else if (rCurrent.__unpaired_final) {
            rCurrent.pairStatus = 'Unpaired';
        } else if (nextSource === 'Next(Target)') {
            rCurrent.pairStatus = 'Paired-Target';
        } else if (nextSource === 'same-RefNo') {
            rCurrent.pairStatus = 'Paired-Seq';
        } else if (nextSource === 'sequential') {
            rCurrent.pairStatus   = 'Paired-Seq';
            rCurrent.__seqFallback = true;   // flagged for Ray Mode pairStatus reset — P-3 cross-component pairs are invalid in Ray Mode
        } else {
            rCurrent.pairStatus = 'Unpaired';
        }

        rCurrent.Len_Calc = lenCalc;
    }


    _spTrack('Phase5-FinalPass-COMPLETE', finalValidated);

    // ── Ray Mode: reset sequential pairings before Ray Shooter ──────────────
    // In Ray Mode only P-3 sequential fallback pairings are unreliable — the
    // Stage 2-OUT filtered set contains no PIPE rows to anchor a CSV-order chain,
    // so P-3 cross-component pairings are wrong.
    //
    // Rows resolved by P-1 (Next(Target)), P-2 (same-RefNo), Pair-Geo (PSI bridge
    // logic), Sp1-Preserved (PipeWithSupport bridge pipes), Gate-Collapsed and
    // Paired-Target are all geometrically valid and MUST stay as non-orphan
    // candidates for Pass 1 / Pass 2.  Blanket-resetting everything to 'Unpaired'
    // removes those anchors and leaves Pass 1 with nothing to target.
    //
    // Strategy: mark the __seqFallback flag during the Final Pass P-3 branch
    // (added below), then reset only those rows here.  All other pairStatus
    // values — Pair-Geo, Sp1-Preserved, Paired-Target, same-RefNo Paired-Seq —
    // are preserved so they remain valid Pass 1 candidates.
    if (typeof window !== 'undefined' && window.__RAY_MODE) {
        let _resetCount = 0;
        for (const r of finalValidated) {
            if (r.__seqFallback) {          // only rows paired by P-3 sequential fallback
                r.pairStatus = 'Unpaired';
                _resetCount++;
            }
        }
        console.info(`[RayMode] pairStatus reset → Unpaired for ${_resetCount} P-3 sequential-fallback rows. Geometry-valid rows preserved as Pass 1 candidates.`);
    }

    const _suppTypes = ['ANCI', 'RSTR', 'SUPPORT'];

    // ── Ray Mode: Assign __raySkip indicator ──────────────────────────────
    // Pre-calculates exactly which geometries the downstream ray-shooter will 
    // topologically ignore, ensuring structural visualizers can paint 'RaySkip:T'.
    for (const r of finalValidated) {
        let skip = false;
        const _t = String(r.Type || '').trim().toUpperCase();
        const _eff = (config.componentTypeMap?.[_t]) || _t;
        
        // Non-mappable components globally skipped
        if (['GASKET', 'MISC', 'PCOM'].includes(_eff)) skip = true;
        
        // Pipes are geometrically skipped.
        // NOTE: PipeWithSupport is NOT skipped — these support bridge pipes must remain
        // visible to the ray shooter as candidates so adjacent components can connect
        // through them. They are renamed to PIPE after the ray shooter completes (line 1569).
        if (_eff === 'PIPE') skip = true;
        
        // Center Points are skipped, strictly UNLESS they are structural supports
        if (String(r.Point ?? '').trim() === '0') {
            if (!_suppTypes.includes(_t)) skip = true;
        }
        
        // Overlap/Collapsed elements skipped
        if (r.__gateCollapsed) skip = true;
        
        r.__raySkip = skip;
    }

    // Stage 3.5 snapshot - deep copy taken RIGHT BEFORE Ray-Shooter physics executes
    const phase10Snapshot = finalValidated.map(r => Object.assign({}, r));

    // ── Stage 1C: Ray Shooter — resolve remaining orphans ────────────
    const rsResult = runRayShooter(finalValidated);
    const stage1cLog = rsResult.stage1cLog || [];

    // ── Post-ray-shooter: rename PipeWithSupport rows back to PIPE ────
    // Strip '_Support' suffix from RefNo so downstream grouper/sequencer
    // treat them as regular PIPE segments with a clean reference number.
    for (const row of finalValidated) {
        if (row.Type === 'PipeWithSupport') {
            row.Type = 'PIPE';
            if (typeof row.RefNo === 'string' && row.RefNo.endsWith('_Support')) {
                row.RefNo = row.RefNo.slice(0, -'_Support'.length);
            }
        }
    }

    _spTrack('Phase5-AfterRayShooter-FINAL', finalValidated);

    return { validated: finalValidated, anomalies, sourceRows, stage1cLog, phase05Snapshot, phase09Snapshot, phase10Snapshot, rtMapSnapshot };
}
