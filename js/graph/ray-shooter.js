/**
 * ray-shooter.js — Stage 1C: Topology-Based Ray Shooter
 *
 * Runs after the Final Pass to resolve orphaned rows (pairStatus === 'Unpaired'
 * and not __gateCollapsed) that the sequential / topology pairing could not handle.
 *
 * Algorithm (4 passes per orphan):
 *   P1 — Stage 1B candidates, same bore
 *   P2 — Stage 1B candidates, any bore  (→ injects synthetic REDUCER for PIPE→PIPE bore mismatch)
 *   P3 — Stage 1A candidates (configurable OFF, default OFF)
 *   P4 — Global axis fallback when Len_Vec direction is ambiguous (dot product < 0.1 with known pair)
 *
 * For each orphan:
 *   - Shoot a parametric ray  P(t) = EP1 + t * dir  in ±dir
 *   - Collect ALL candidate hits within tubeRadius tolerance
 *   - Pick the shortest (smallest t)
 *   - Immediately update orphan's EndX/Y/Z, Len_Calc, pairStatus, Len_Vec
 *
 * Config toggles live under  config.coordinateSettings.rayShooter.*
 */

import { getConfig } from '../config/config-store.js';

const LOG = '[RayShooter]';

/* ─── Public API ──────────────────────────────────────────────────── */

/**
 * @param {Array}  rows     finalValidated (mutated in place)
 * @returns {{ rows: Array, stage1cLog: Array }}
 */
export function runRayShooter(rows) {
    const config   = getConfig();
    const rsCfg    = config.coordinateSettings?.rayShooter ?? {};
    const enabled  = rsCfg.enabled !== false;      // default ON
    if (!enabled || !rows || rows.length === 0) return { rows, stage1cLog: [] };

    const maxRayLen   = rsCfg.maxRayLength ?? 20000;   // 20 m
    const tubeTol     = rsCfg.tubeTolerance ?? 50.0;   // 50 mm radius — wider tube catches mildly-sloped pipes
    const passP3On    = rsCfg.passP3Stage1A !== false ? false : true;  // default OFF
    const dotThresh   = 0.10;  // dot product below this → use P4 global-axis fallback

    const stage1cLog  = [];
    const injectedRows = [];   // bridging PIPEs for immutable fittings (FLANGEs etc.)

    // ── Type helpers ─────────────────────────────────────────────────
    const _getEff = (type) => {
        const raw = String(type || '').trim().toUpperCase();
        return (config.componentTypeMap?.[raw]) || raw;
    };

    // Non-mappable types (GASKET, MISC, PCOM etc.) — configured or default.
    // These never initiate rays; they have no connectable faces.
    const nonMappable = new Set(
        (rsCfg.nonMappableTypes ?? ['GASKET', 'MISC', 'PCOM']).map(t => String(t).trim().toUpperCase())
    );

    // Branch-point component types — Point=3/4 of these are TEE/OLET branch faces.
    const branchTypes = new Set(
        (rsCfg.branchTypes ?? ['TEE', 'OLET', 'CROSS']).map(t => String(t).trim().toUpperCase())
    );

    // An orphan is eligible to initiate a ray (Pass 1 / Pass 2) if it is:
    //   • actually unpaired / needs-bridge
    //   • NOT a PIPE (PIPEs are resolved sequentially)
    //   • NOT a non-mappable type (GASKET / MISC / PCOM have no connectable faces)
    //   • NOT a CP row (Point=0) — geometric junction centres are not pipe faces
    const _isEligible = (orphan) => {
        if (!_isOrphan(orphan)) return false;
        if (orphan.__raySkip) return false;
        return true;
    };

    // ── True exit face resolver ────────────────────────────────────────
    // For multi-row fittings (ELBO, TEE …), the EP1 row's EndX/Y/Z is just the
    // tangent/connection point, not the component's output face.  The true exit
    // lives on the CP row (Point=0, same RefNo) at *its* EndX/Y/Z.
    // Falls back through:  CP.EndX/Y/Z → orphan.EndX/Y/Z → orphan.East/North/Up
    const _exitFace = (orphan) => {
        const ox = parseFloat(orphan.East)  || 0;
        const oy = parseFloat(orphan.North) || 0;
        const oz = parseFloat(orphan.Up)    || 0;
        const pt = String(orphan.Point ?? '').trim();
        const ref = orphan.RefNo;

        // For elbows/bends specifically, we MUST use the CP row's EndX/Y/Z
        // to shoot the ray since it represents the actual exit face.
        const type = String(orphan.Type || '').trim().toUpperCase();
        const isElbow = type.includes('ELBO') || type.includes('BEND');

        // EP1 rows of multi-row fittings → chain through CP row
        if (pt === '1' && ref) {
            const cp = rows.find(r =>
                r.RefNo === ref && String(r.Point ?? '').trim() === '0'
            );
            if (cp) {
                const cx = parseFloat(cp.EndX), cy = parseFloat(cp.EndY), cz = parseFloat(cp.EndZ);
                if (isFinite(cx) && isFinite(cy) && isFinite(cz)) {
                    // For elbows we can compute the precise direction from CP East/North/Up to CP EndX/EndY/EndZ
                    // and store it in orphan to override the default __axisVec, which might be wrong for skew.
                    if (isElbow) {
                        const cpX = parseFloat(cp.East) || 0, cpY = parseFloat(cp.North) || 0, cpZ = parseFloat(cp.Up) || 0;
                        const dx = cx - cpX, dy = cy - cpY, dz = cz - cpZ;
                        const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
                        if (mag > 0.001) {
                            orphan.__axisVec = { dE: dx/mag, dN: dy/mag, dU: dz/mag };
                        }
                    }
                    return { x: cx, y: cy, z: cz };
                }
            }
        }

        // Single-row fittings / EP2 / BP → own EndX/Y/Z
        const eX = parseFloat(orphan.EndX), eY = parseFloat(orphan.EndY), eZ = parseFloat(orphan.EndZ);
        if (isFinite(eX) && isFinite(eY) && isFinite(eZ) &&
            !(eX === ox && eY === oy && eZ === oz)) {
            return { x: eX, y: eY, z: eZ };
        }

        // Fallback — entry face
        return { x: ox, y: oy, z: oz };
    };

    // ── Shared post-hit resolution (used by both passes) ─────────────
    // Mutates orphan in-place; pushes injected bridging row if fitting.
    // Returns true if orphan was resolved.
    const _resolveOrphan = (orphan, hit, passLabel) => {
        const ox   = parseFloat(orphan.East)  || 0;
        const oy   = parseFloat(orphan.North) || 0;
        const oz   = parseFloat(orphan.Up)    || 0;
        const oBore = parseFloat(orphan.Bore) || 0;

        const cand  = hit.candidate;
        const hitX  = parseFloat(cand.East)  || 0;
        const hitY  = parseFloat(cand.North) || 0;
        const hitZ  = parseFloat(cand.Up)    || 0;
        const newLen = _dist(ox, oy, oz, hitX, hitY, hitZ);

        const _effType   = _getEff(orphan.Type);
        const _isFitting = _effType !== 'PIPE';

        if (_isFitting) {
            // Fitting is immutable — inject a synthetic bridging PIPE from its true exit face.
            // For multi-row fittings (ELBO, TEE …) the exit lives on the CP row, not the EP1 row.
            const _exit = _exitFace(orphan);
            const exitX = _exit.x, exitY = _exit.y, exitZ = _exit.z;
            const bridgeLen = _dist(exitX, exitY, exitZ, hitX, hitY, hitZ);

            const injRow         = Object.assign({}, orphan);
            injRow.RefNo         = String(orphan.RefNo || orphan.Sequence || '') + '_bridged';
            injRow.Type          = 'PIPE';
            // Bridge starts at the fitting's exit face
            injRow.East          = exitX;
            injRow.North         = exitY;
            injRow.Up            = exitZ;
            injRow.EndX          = hitX;
            injRow.EndY          = hitY;
            injRow.EndZ          = hitZ;
            injRow.Len_Calc      = bridgeLen.toFixed(2);
            injRow.pairStatus    = 'Pair-Geo';
            injRow.__rayShot     = true;
            injRow.__rsFPass     = passLabel;
            injRow.__injected    = true;
            injRow.__needsBridge = false;

            const _dx = hitX - exitX, _dy = hitY - exitY, _dz = hitZ - exitZ;
            const _mg = Math.sqrt(_dx*_dx + _dy*_dy + _dz*_dz);
            if (_mg > 0.001) {
                const _cE = _dx/_mg, _cN = _dy/_mg, _cU = _dz/_mg;
                const _EPS = 0.5;
                const _aE = Math.abs(_dx) > _EPS, _aN = Math.abs(_dy) > _EPS, _aU = Math.abs(_dz) > _EPS;
                const _ac = (_aE?1:0) + (_aN?1:0) + (_aU?1:0);
                const _fmt = v => (v >= 0 ? '+' : '') + v.toFixed(3);
                const _pts = [];
                if (_aE) _pts.push(`${_fmt(_cE)}E`);
                if (_aN) _pts.push(`${_fmt(_cN)}N`);
                if (_aU) _pts.push(`${_fmt(_cU)}Up`);
                injRow.Len_Vec   = `${_ac}[${_pts.join('') || '0'}]`;
                injRow.__axisVec = { dE: _cE, dN: _cN, dU: _cU };
                orphan.__axisVec = injRow.__axisVec;
            }

            injectedRows.push(injRow);
            orphan.pairStatus = 'Pair-Geo';
            orphan.__rayShot  = true;
            orphan.__rsFPass  = passLabel;

            // Architect Rule: Establish dual-membrane collision to prevent bidirectional duplicate firing
            orphan.__hitTargets = orphan.__hitTargets || new Set();
            cand.__hitTargets = cand.__hitTargets || new Set();
            if (cand.RefNo) orphan.__hitTargets.add(cand.RefNo);
            if (orphan.RefNo) cand.__hitTargets.add(orphan.RefNo);

            stage1cLog.push({
                RefNo:    orphan.RefNo,
                Pass:     passLabel + '+Inject',
                Bore:     oBore,
                EP1:      `(${exitX.toFixed(1)}, ${exitY.toFixed(1)}, ${exitZ.toFixed(1)})`,
                EP2:      `(${hitX}, ${hitY}, ${hitZ})`,
                Len_Calc: bridgeLen.toFixed(2),
                Len_Vec:  injRow.Len_Vec || '',
                CandRef:  cand.RefNo,
                Reducer:  '',
            });
            console.log(`${LOG} ${orphan.RefNo} → ${passLabel}+Inject, len=${bridgeLen.toFixed(2)}mm, cand="${cand.RefNo}"`);
            return true;
        }

        // PIPE orphan — update geometry in-place (kept for completeness; normally filtered out)
        const ep2IsBlank = !orphan.EndX || parseFloat(orphan.EndX) === parseFloat(orphan.East);
        if (ep2IsBlank) {
            orphan.EndX = hitX; orphan.EndY = hitY; orphan.EndZ = hitZ;
        } else {
            const lenCurrent = _dist(ox, oy, oz, parseFloat(orphan.EndX)||0, parseFloat(orphan.EndY)||0, parseFloat(orphan.EndZ)||0);
            if (newLen < lenCurrent) { orphan.EndX = hitX; orphan.EndY = hitY; orphan.EndZ = hitZ; }
        }
        orphan.Len_Calc   = _dist(ox, oy, oz, parseFloat(orphan.EndX), parseFloat(orphan.EndY), parseFloat(orphan.EndZ)).toFixed(2);
        orphan.pairStatus = 'Pair-Geo';
        orphan.__rayShot  = true;
        orphan.__rsFPass  = passLabel;

        const dx = parseFloat(orphan.EndX)-ox, dy = parseFloat(orphan.EndY)-oy, dz = parseFloat(orphan.EndZ)-oz;
        const mag = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if (mag > 0.001) {
            const cE=dx/mag, cN=dy/mag, cU=dz/mag, EPS=0.5;
            const aE=Math.abs(dx)>EPS, aN=Math.abs(dy)>EPS, aU=Math.abs(dz)>EPS;
            const ac=(aE?1:0)+(aN?1:0)+(aU?1:0);
            const fmt=v=>(v>=0?'+':'')+v.toFixed(3), pts=[];
            if (aE) pts.push(`${fmt(cE)}E`);
            if (aN) pts.push(`${fmt(cN)}N`);
            if (aU) pts.push(`${fmt(cU)}Up`);
            orphan.Len_Vec   = `${ac}[${pts.join('')||'0'}]`;
            orphan.__axisVec = { dE:cE, dN:cN, dU:cU };
        }
        stage1cLog.push({
            RefNo:    orphan.RefNo, 'DE/BO': orphan['DE/BO']||'NIL',
            Pass:     passLabel, Bore: oBore,
            EP1:      `(${ox.toFixed(1)}, ${oy.toFixed(1)}, ${oz.toFixed(1)})`,
            EP2:      `(${orphan.EndX}, ${orphan.EndY}, ${orphan.EndZ})`,
            Len_Calc: orphan.Len_Calc, Len_Vec: orphan.Len_Vec,
            CandRef:  cand.RefNo, Reducer: hit.injectReducer ? 'Yes' : '',
        });
        console.log(`${LOG} ${orphan.RefNo} → ${passLabel}, len=${orphan.Len_Calc}mm, cand="${cand.RefNo}"`);
        return true;
    };

    // ── Shared shoot helper (LenVec → Axis fallback) ──────────────────
    const _shootOrphan = (orphan, pool, candFilter) => {
        // Fire from the fitting's true exit face (chains through CP row for ELBOs etc.)
        const _exit = _exitFace(orphan);
        const rx = _exit.x, ry = _exit.y, rz = _exit.z;

        const vec = orphan.__axisVec || { dE:0, dN:0, dU:0 };
        const hasDirVec = (vec.dE*vec.dE + vec.dN*vec.dN + vec.dU*vec.dU) > 0.001;

        let hit = null;
        if (hasDirVec) {
            hit = _shoot(orphan, rx, ry, rz, vec, true, pool, maxRayLen, tubeTol, candFilter);
            if (hit) hit.pass = 'P-LenVec';
        }
        if (!hit && orphan['DE/BO'] !== 'DE') {
            const axes = [
                { dE:1,dN:0,dU:0 }, { dE:-1,dN:0,dU:0 },
                { dE:0,dN:1,dU:0 }, { dE:0,dN:-1,dU:0 },
                { dE:0,dN:0,dU:1 }, { dE:0,dN:0,dU:-1 },
            ];
            for (const axVec of axes) {
                hit = _shoot(orphan, rx, ry, rz, axVec, true, pool, maxRayLen, tubeTol, candFilter);
                if (hit) { hit.pass = 'P-Axis'; break; }
            }
        }
        return hit;
    };

    // ════════════════════════════════════════════════════════════════════
    // PASS 0 — Face-proximity snap (Ray Mode)
    //
    // Two directional sub-rays per component, both limited to pass0MaxGap (6 mm):
    //
    //   Sub-ray A  origin = EP1,  direction = −axis  (outward from inlet face)
    //              Checks cand.EP2 (EndX/Y/Z).  If hit → cand.EP2 snaps to r.EP1.
    //
    //   Sub-ray B  origin = EP2,  direction = +axis  (outward from outlet face)
    //              Checks cand.EP1 (East/North/Up).  If hit → r.EP2 snaps to cand.EP1.
    //
    // Unlike Pass 1 / Pass 2 this fires a single-direction ray (no ± reversal) and
    // uses a minimum t of 0.1 mm instead of the existing 6 mm dead-zone.
    //
    // Iteration order: FLANGE first, then VALVE, then everything else.
    // This ensures FLANGEs claim their face connections before other types do,
    // which matches the physical rule "prefer to extend the flange".
    //
    // Candidate filter:
    //   • different RefNo (not own component)
    //   • not __gateCollapsed, not nonMappable, not Point=0
    //   • NOT a branchType (TEE/OLET branch faces are reserved for Pass 2)
    //   • pairStatus === 'Unpaired'  (Q5: skip already-resolved candidates)
    //
    // No _bridged pipe is injected — the gap (≤ 6 mm) is absorbed directly into
    // the component's own geometry by snapping the relevant endpoint.
    // NOTE: pass0MaxGap is strictly enforced. If distance > pass0MaxGap, no snap occurs.
    // ════════════════════════════════════════════════════════════════════

    const pass0MaxGap = rsCfg.pass0MaxGap ?? 6.0;  // mm, configurable

    // Type priority for Pass 0 iteration order (lower index = processed first)
    const _p0TypeOrder = ['FLANGE', 'VALVE'];
    const _p0Priority  = (type) => {
        const eff = _getEff(type);
        const idx = _p0TypeOrder.indexOf(eff);
        return idx >= 0 ? idx : _p0TypeOrder.length;
    };

    // Candidate guard for Pass 0 — applied inside both sub-ray filters
    const _p0CanUse = (r, cand) => {
        if (cand === r) return false;
        if (cand.RefNo && r.RefNo && cand.RefNo === r.RefNo) return false;
        if (cand.__raySkip) return false; // Replaces nonMappable/Point=0 exclusions
        
        const effC   = _getEff(cand.Type);
        const candPt = String(cand.Point ?? '').trim();
        // Only the branch-face rows (Point=3/4) of TEE/OLET/CROSS are reserved for Pass 2.
        // The component's EP1 (Point=1) and EP2 (Point=2) rows participate in Pass 0 normally.
        if (branchTypes.has(effC) && (candPt === '3' || candPt === '4')) return false;
        if (cand.pairStatus !== 'Unpaired') return false;
        return true;
    };

    // Coordinate extractors for _shootP0
    const _ep1C = (c) => ({
        cx: parseFloat(c.East)  || 0,
        cy: parseFloat(c.North) || 0,
        cz: parseFloat(c.Up)   || 0,
    });
    const _ep2C = (c) => ({
        cx: parseFloat(c.EndX) || parseFloat(c.East)  || 0,
        cy: parseFloat(c.EndY) || parseFloat(c.North) || 0,
        cz: parseFloat(c.EndZ) || parseFloat(c.Up)   || 0,
    });

    // Build sorted Pass 0 iteration array (stable sort preserves relative order within same priority)
    const pass0Rows = [...rows].sort((a, b) => _p0Priority(a.Type) - _p0Priority(b.Type));

    for (const r of pass0Rows) {
        // Skip non-eligible initiators
        if (r.__raySkip)                                    continue;
        if (r.pairStatus !== 'Unpaired')                   continue;  // already resolved
        
        const effR = _getEff(r.Type);
        const _rPt = String(r.Point ?? '').trim();
        // Branch-face rows (Point=3/4) of TEE/OLET/CROSS are Pass 2 targets — they
        // do not initiate Pass 0 rays.  EP1/EP2 rows (Point=1/2) of those same
        // components fire normally so that the TEE/OLET body gets resolved here.
        if (branchTypes.has(effR) && (_rPt === '3' || _rPt === '4')) continue;

        const ep1x = parseFloat(r.East)  || 0;
        const ep1y = parseFloat(r.North) || 0;
        const ep1z = parseFloat(r.Up)    || 0;
        // For zero-length rows (EP2 not yet set), Sub-ray B fires from EP1 — correct
        // because inlet and outlet faces coincide at the same point.
        const ep2x = parseFloat(r.EndX) || ep1x;
        const ep2y = parseFloat(r.EndY) || ep1y;
        const ep2z = parseFloat(r.EndZ) || ep1z;

        // Compute axis direction: EP1 → EP2, or fall back to stored __axisVec
        let axisVec = null;
        const _ddx = ep2x - ep1x, _ddy = ep2y - ep1y, _ddz = ep2z - ep1z;
        const _mag = Math.sqrt(_ddx*_ddx + _ddy*_ddy + _ddz*_ddz);
        if (_mag > 0.1) {
            axisVec = { dE: _ddx/_mag, dN: _ddy/_mag, dU: _ddz/_mag };
        } else if (r.__axisVec) {
            axisVec = r.__axisVec;
        }
        if (!axisVec) continue;  // no direction — cannot define inlet/outlet orientation

        const negAxis = { dE: -axisVec.dE, dN: -axisVec.dN, dU: -axisVec.dU };

        // ── Sub-ray A : EP1 → backward (−axis) — find upstream cand via cand.EP2 ──
        const hitA = _shootP0(ep1x, ep1y, ep1z, negAxis, rows, pass0MaxGap, tubeTol,
            (cand) => _p0CanUse(r, cand), _ep2C);

        if (hitA) {
            const cand = hitA.candidate;
            // Extend cand: snap its outlet face (EP2) to r's inlet face (EP1)
            cand.EndX     = ep1x;
            cand.EndY     = ep1y;
            cand.EndZ     = ep1z;
            cand.Len_Calc = _dist(
                parseFloat(cand.East) || 0,
                parseFloat(cand.North) || 0,
                parseFloat(cand.Up) || 0,
                ep1x, ep1y, ep1z
            ).toFixed(2);
            cand.pairStatus = 'Pair-Face';
            cand.__p0Shot   = true;
            r.__p0InletHit  = true;   // inlet of r now connected; EP2-side may still be Unpaired
            stage1cLog.push({
                Pass: 'P0-A', RefNo: r.RefNo, CandRef: cand.RefNo,
                Gap: hitA.t.toFixed(2), Action: `${cand.RefNo} EP2 → ${r.RefNo} EP1`,
            });
            console.log(`${LOG} P0-A: "${cand.RefNo}" EP2 snapped to "${r.RefNo}" EP1 (gap ${hitA.t.toFixed(2)} mm)`);
        }

        // ── Sub-ray B : EP2 → forward (+axis) — find downstream cand via cand.EP1 ──
        // r.pairStatus is still 'Unpaired' even if A hit (A resolves cand, not r's EP2 side)
        const hitB = _shootP0(ep2x, ep2y, ep2z, axisVec, rows, pass0MaxGap, tubeTol,
            (cand) => _p0CanUse(r, cand), _ep1C);

        if (hitB) {
            const cand = hitB.candidate;
            // Extend r: snap its outlet face (EP2) to cand's inlet face (EP1)
            r.EndX     = parseFloat(cand.East)  || 0;
            r.EndY     = parseFloat(cand.North) || 0;
            r.EndZ     = parseFloat(cand.Up)    || 0;
            r.Len_Calc = _dist(ep1x, ep1y, ep1z, r.EndX, r.EndY, r.EndZ).toFixed(2);
            r.pairStatus = 'Pair-Face';
            r.__p0Shot   = true;
            stage1cLog.push({
                Pass: 'P0-B', RefNo: r.RefNo, CandRef: cand.RefNo,
                Gap: hitB.t.toFixed(2), Action: `${r.RefNo} EP2 → ${cand.RefNo} EP1`,
            });
            console.log(`${LOG} P0-B: "${r.RefNo}" EP2 snapped to "${cand.RefNo}" EP1 (gap ${hitB.t.toFixed(2)} mm)`);
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // PASS 1 — Orphaned fittings → EP1 of any candidate
    //   Orphan initiators : Unpaired non-PIPE, non-nonMappable types
    //                       (FLANGE, VALVE, ELBOW, TEE, OLET …)
    //   Candidate pool    : full rows array
    //   Action: Always creates a synthetic _bridged pipe between the orphan
    //           and the hit candidate.
    // ════════════════════════════════════════════════════════════════════
    const candidatePool = rows;

    for (let i = 0; i < rows.length; i++) {
        const orphan = rows[i];
        if (!_isEligible(orphan)) continue;

        // Force 'true' filter so the ray intersects remaining floating spatial points
        // It always creates a bridging pipe since _isFitting logic is applied for fittings.
        const hit = _shootOrphan(orphan, candidatePool, (c) => true);
        if (hit) _resolveOrphan(orphan, hit, hit.pass + '-O2O');
    }

    // ════════════════════════════════════════════════════════════════════
    // PASS 2 — Branch connections: TEE / OLET / CROSS branch-face candidates
    //   Candidate pool : Point=3 and Point=4 rows of PAIRED branch-type
    //                    components — these are the physical branch faces.
    //   Orphan initiators : same eligibility as Pass 1; only still-orphaned
    //                       rows are attempted (Pass 1 may have resolved some).
    //   Purpose : captures fittings (e.g. FLANGEs) that connect to a TEE
    //             or OLET branch port, which EP1-only scanning cannot reach.
    // ════════════════════════════════════════════════════════════════════
    // Build a RefNo → boolean map: true if that component has ≥1 non-orphan sibling row.
    // Used so that in Ray Mode (all rows reset to Unpaired) a TEE/OLET whose EP1/EP2
    // were resolved by Pass 0 still contributes its Point=3/4 face as a Pass 2 target.
    const _refHasResolved = new Map();
    for (const r of rows) {
        if (!r.RefNo || _isOrphan(r)) continue;
        _refHasResolved.set(String(r.RefNo), true);
    }

    const branchCandPool = rows.filter(r => {
        if (!branchTypes.has(_getEff(r.Type))) return false;  // TEE, OLET, CROSS only
        const pt = String(r.Point ?? '').trim();
        if (pt !== '3' && pt !== '4') return false;           // branch-face rows only
        // Allow branch faces to be candidates regardless of orphan status in Ray Mode
        // since Pass 1 created _bridged pipes and many nodes are still technically "orphans".
        // The ray shooter should be able to hit any TEE/OLET branch port.
        return true;
    });

    if (branchCandPool.length > 0) {
        for (let i = 0; i < rows.length; i++) {
            const orphan = rows[i];
            if (!_isEligible(orphan)) continue;   // only still-orphaned eligible fittings

            const hit = _shootOrphan(orphan, branchCandPool, () => true);  // all pool rows are paired
            if (hit) _resolveOrphan(orphan, hit, hit.pass + '-Branch');
        }
    }

    // Append all injected bridging PIPEs (created for immutable fittings)
    for (const inj of injectedRows) rows.push(inj);

    return { rows, stage1cLog };
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

function _isOrphan(row) {
    if (row.__raySkip) return false;
    if (row.pairStatus === 'Unpaired') return true;
    // Zero-length _pipe end-face markers: they have a valid position but no outgoing connection.
    // Treat as bridgeable orphans so the ray shooter can connect them to the next component.
    if (row.__needsBridge && !row.__rayShot) return true;
    return false;
}

/**
 * Parametric ray shoot.
 * Tries both +dir and −dir.
 * Returns the closest candidate hit or null.
 */
function _shoot(orphan, ox, oy, oz, dir, hasDirVec, pool, maxLen, tol, filter) {
    if (!hasDirVec) return null;
    let best = null;

    for (let s = 1; s >= -1; s -= 2) {   // s = +1 (forward) then −1 (backward)
        const dE = dir.dE * s;
        const dN = dir.dN * s;
        const dU = dir.dU * s;

        for (const cand of pool) {
            if (cand === orphan) continue;
            if (cand.RefNo && orphan.RefNo && cand.RefNo === orphan.RefNo) continue; // skip own component's rows
            if (cand.__raySkip) continue;
            if (!filter(cand))  continue;
            if (orphan.__hitTargets && cand.RefNo && orphan.__hitTargets.has(cand.RefNo)) continue;

            const cx = parseFloat(cand.East)  || 0;
            const cy = parseFloat(cand.North) || 0;
            const cz = parseFloat(cand.Up)    || 0;

            // Parameter t along the ray: project candidate EP1 onto ray direction
            const t = (cx - ox) * dE + (cy - oy) * dN + (cz - oz) * dU;
            if (t < 6.0 || t > maxLen) continue;  // t<6mm excludes same-position candidates & micro-gaps

            // Perpendicular distance from ray to candidate point
            const px = ox + t * dE - cx;
            const py = oy + t * dN - cy;
            const pz = oz + t * dU - cz;
            const perp = Math.sqrt(px*px + py*py + pz*pz);
            if (perp > tol) continue;

            if (!best || t < best.t) {
                best = { t, candidate: cand };
            }
        }
    }

    return best;
}

/**
 * Get direction vector of orphan's known sequential predecessor/successor pair
 * (the _pnt2Seq pre-collapse match — stored on the row before Final Pass collapsing).
 */
function _getKnownPairVec(orphan, rows) {
    const seqHint = orphan._pnt2Seq;
    if (!seqHint) return null;
    const pair = rows.find(r => r.Sequence == seqHint);
    return pair?.__axisVec || null;
}

function _dist(x1, y1, z1, x2, y2, z2) {
    return Math.sqrt((x1-x2)**2 + (y1-y2)**2 + (z1-z2)**2);
}

/**
 * Pass 0 single-direction ray shoot.
 *
 * Unlike _shoot() this fires in ONE direction only (no ± reversal) and uses
 * a minimum t of 0.1 mm so it can detect face contacts as small as 0.1 mm
 * (the existing _shoot dead-zone of 6 mm would miss all Pass 0 targets).
 *
 * @param {number}   ox/oy/oz   - ray origin
 * @param {{dE,dN,dU}} dir      - unit direction vector (already normalised)
 * @param {Array}    pool       - candidate rows
 * @param {number}   maxLen     - maximum ray length (mm)
 * @param {number}   tol        - tube radius tolerance (mm)
 * @param {Function} filter     - (cand) => boolean, pre-checked before geometry
 * @param {Function} getCoords  - (cand) => {cx,cy,cz} — which endpoint to test
 *                                 Use _ep1C for cand.EP1, _ep2C for cand.EP2
 * @returns {{ t: number, candidate: object } | null}
 */
function _shootP0(ox, oy, oz, dir, pool, maxLen, tol, filter, getCoords) {
    let best = null;
    const { dE, dN, dU } = dir;

    for (const cand of pool) {
        if (cand.__raySkip) continue;
        if (!filter(cand)) continue;

        const { cx, cy, cz } = getCoords(cand);

        // Parameter t: projection of (cand_coords − origin) onto ray direction
        const t = (cx - ox) * dE + (cy - oy) * dN + (cz - oz) * dU;
        if (t < 0.1 || t > maxLen) continue;   // 0.1 mm min avoids same-position self-hit

        // Also check absolute 3D euclidean distance to strictly enforce the gap.
        const absDist = Math.sqrt((cx - ox)**2 + (cy - oy)**2 + (cz - oz)**2);
        if (absDist > maxLen) continue;

        // Perpendicular distance from the ray axis to the candidate point
        const px = ox + t * dE - cx;
        const py = oy + t * dN - cy;
        const pz = oz + t * dU - cz;
        if (Math.sqrt(px*px + py*py + pz*pz) > tol) continue;

        if (!best || t < best.t) best = { t, candidate: cand };
    }

    return best;
}
