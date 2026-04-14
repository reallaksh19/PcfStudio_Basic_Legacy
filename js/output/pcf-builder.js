/**
 * pcf-builder.js — Unified Two-Mode PCF Generation
 *
 * Mode 1 (Phase 1): CSV → group → buildPts → zero-len filter → sequence → dispatch
 *   - Output contains: coordinates, SKEY, BendRadius, CP, BP — NO CA attributes
 *   - Stored in state: pcfPass1Lines
 *   - Populates PCF Table Form
 *
 * Mode 2 (Phase 2): PCF Table Form edits → serialize → full PCF with CA attributes
 *   - Stored in state: pcfLines
 *
 * Both modes use the same common header with PIPELINE-REFERENCE from filename.
 */

import { buildHeader } from '../converter/header-writer.js';
import { buildPts } from '../converter/point-builder.js';
import { groupByRefNo, getPipelineRef } from '../converter/grouper.js';
import { processGeometry } from '../geometry/pipeline.js';
import { runSequencer } from '../graph/sequencer.js';
import { dispatch } from '../converter/components/dispatcher.js';
import { filterPcfLines } from './pcf-cleaner.js';
import { getState } from '../state.js';
import { info, warn } from '../logger.js';

const MOD = 'pcf-builder';

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Derive PIPELINE-REFERENCE from filename stored in meta state.
 * @returns {string}
 */
function getPipelineRefFromFile() {
    const meta = getState('meta') || {};
    const raw = meta.filename || '';
    return raw ? raw.replace(/\.[^.]+$/, '') : '';
}

/**
 * Compute 3D distance between two point objects.
 * Handles both {E,N,U} and {x,y,z} formats.
 */
function dist(p1, p2) {
    if (!p1 || !p2) return -1;
    const dx = (p2.E ?? p2.x ?? 0) - (p1.E ?? p1.x ?? 0);
    const dy = (p2.N ?? p2.y ?? 0) - (p1.N ?? p1.y ?? 0);
    const dz = (p2.U ?? p2.z ?? 0) - (p1.U ?? p1.z ?? 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ── MODE 1: Phase 1 PCF from CSV ───────────────────────────────────

/**
 * Build Phase 1 PCF from raw normalizedRows.
 * Contains: coordinates, SKEY, BendRadius, CP, BP — NO Component Attributes.
 *
 * @param {object[]} normalizedRows  — from state: normalizedRows
 * @param {object}   config          — full config
 * @param {number}   tolerance       — zero-length drop threshold (mm), default 6
 * @returns {{ lines: string[], groups: Map, seqResult: object }}
 */
export function buildPhase1PCF(normalizedRows, config, tolerance = 6) {
    info(MOD, 'buildPhase1PCF', `Building Phase 1 PCF (tolerance=${tolerance}mm)...`);

    // 1. Derive PIPELINE-REFERENCE from filename
    const pipelineRef = getPipelineRefFromFile();

    // 2. Group rows by RefNo
    const rawGroups = groupByRefNo(normalizedRows, config);

    // 3. Full geometry processing (buildPts, overlap resolution, gap fill)
    const { groups, anomalies } = processGeometry(rawGroups, config);

    // 4. Build pts for ALL groups before filtering
    for (const [, g] of groups) {
        if (!g.pts || Object.keys(g.pts).length === 0) {
            try { g.pts = buildPts(g, config); } catch (e) { /* ignore */ }
        }
    }

    // 4b. TEE Branch Point Inference (EP3 / pts['3'])
    // For TEE groups whose CSV has no Point=3 row, find the branch connector
    // by scanning for a component whose EP1 or EP2 lies ON the TEE run segment.
    try {
        const snapTol = config?.coordinateSettings?.continuityTolerance ?? 1.0;
        const near = (a, b) => b && a &&
            Math.abs(a.E - b.E) < snapTol &&
            Math.abs(a.N - b.N) < snapTol &&
            Math.abs(a.U - b.U) < snapTol;
        const onSegment = (p, a, b) => {
            if (!p || !a || !b) return false;
            const abE = b.E - a.E, abN = b.N - a.N, abU = b.U - a.U;
            const len2 = abE * abE + abN * abN + abU * abU;
            if (len2 < 0.01) return false;
            const apE = p.E - a.E, apN = p.N - a.N, apU = p.U - a.U;
            const t = (apE * abE + apN * abN + apU * abU) / len2;
            if (t < 0 || t > 1) return false;
            const projE = a.E + t * abE, projN = a.N + t * abN, projU = a.U + t * abU;
            return Math.hypot(p.E - projE, p.N - projN, p.U - projU) < snapTol * 3;
        };

        for (const [teeRef, teeGroup] of groups) {
            if (teeGroup.pcfType !== 'TEE') continue;
            if (teeGroup.pts?.['3']) continue; // already populated from CSV
            const ep1 = teeGroup.pts?.['1'];
            const ep2 = teeGroup.pts?.['2'];
            if (!ep1 || !ep2) continue;

            for (const [candidateRef, candidateGroup] of groups) {
                if (candidateRef === teeRef) continue;
                if (!candidateGroup.pts) continue;
                const cEP1 = candidateGroup.pts['1'];
                const cEP2 = candidateGroup.pts['2'];

                let branchFarPt = null;
                if (cEP1 && onSegment(cEP1, ep1, ep2) && !near(cEP1, ep1) && !near(cEP1, ep2)) {
                    branchFarPt = cEP2;
                } else if (cEP2 && onSegment(cEP2, ep1, ep2) && !near(cEP2, ep1) && !near(cEP2, ep2)) {
                    branchFarPt = cEP1;
                }

                if (branchFarPt) {
                    const bore = branchFarPt.bore > 0 ? branchFarPt.bore : (ep2?.bore || ep1?.bore || 0);
                    teeGroup.pts['3'] = { ...branchFarPt, bore };
                    console.log(`[TEE TRACKER] [Phase 1] TEE ${teeRef}: pts['3'] geometrically inferred branch => X:${branchFarPt.E}, Y:${branchFarPt.N}, Z:${branchFarPt.U}, Bore:${bore}`);
                    break;
                }
            }
        }
    } catch (e) {
        console.warn('[pcf-builder] TEE branch inference failed (non-fatal):', e.message);
    }

    // 5. Zero-length filter — drop PIPE/OLET where EP1↔EP2 < tolerance
    let dropped = 0;
    for (const [ref, g] of groups) {
        const type = (g.pcfType || '').toUpperCase();
        if (type === 'PIPE' || type.includes('OLET')) {
            const d = dist(g.pts?.['1'], g.pts?.['2']);
            if (d >= 0 && d < tolerance) {
                g.skip = true;
                dropped++;
                console.log(`[Phase1] Zero-len drop: ${ref} (${d.toFixed(2)}mm < ${tolerance}mm)`);
            }
        }
    }
    if (dropped > 0) {
        console.log(`[Phase1] Dropped ${dropped} zero-length PIPE/OLET components`);
    }

    // 6. Sequence
    const seqResult = runSequencer(groups, config);

    // 7. Assemble — Mode 1: suppress CA blocks
    const lines = [];
    lines.push(...buildHeader(pipelineRef));
    lines.push('');

    const cfg1 = { ...config, suppressCA: true }; // flag for dispatchers
    let written = 0;

    for (const refno of seqResult.ordered) {
        const group = groups.get(refno);
        if (!group || group.skip) continue;
        const blockLines = dispatch(group, cfg1) || [];
        if (blockLines.length > 0) {
            lines.push(...blockLines);
            lines.push('');
            written++;
        }
    }

    // Orphans (also filtered)
    for (const refno of seqResult.orphans) {
        const group = groups.get(refno);
        if (!group || group.skip) continue;
        const blockLines = dispatch(group, cfg1) || [];
        if (blockLines.length > 0) {
            lines.push(...blockLines);
            lines.push('');
            written++;
        }
    }

    info(MOD, 'buildPhase1PCF', `Phase 1 done. ${written} components, ${lines.length} lines.`);
    return { lines: filterPcfLines(lines), groups, seqResult, anomalies };
}

// ── MODE 2: Phase 2 PCF from PCF Table ─────────────────────────────

/**
 * Build Phase 2 PCF from edited PCF Table Form data.
 * Full PCF including CA attributes. No zero-length filtering needed
 * (table already filtered in Phase 1).
 *
 * @param {Array[]}  tableData   — 2D array from table (each row is an array of cell values)
 * @param {object}   headerMap   — { columnName: colIndex }
 * @param {object}   config      — full config
 * @param {object}   groups      — ComponentGroup Map (fallback for non-editable fields)
 * @returns {{ lines: string[] }}
 */
export function buildPhase2PCF(tableData, headerMap, config, groups) {
    info(MOD, 'buildPhase2PCF', 'Building Phase 2 PCF from Table Form...');

    const pipelineRef = getPipelineRefFromFile();
    const lines = [];
    lines.push(...buildHeader(pipelineRef));
    lines.push('');

    // Delegate to TableRegenerator which handles the full serialization with CA
    // We import it lazily to avoid circular deps
    try {
        const { TableRegenerator } = lazyRequireRegenerator();
        const regen = new TableRegenerator({ log: console.log });
        const regenLines = regen.regenerate(tableData, headerMap, groups);
        if (Array.isArray(regenLines)) {
            // regenLines starts with its own header — replace with our common header
            const firstComponent = regenLines.findIndex(l =>
                /^(PIPE|BEND|TEE|FLANGE|VALVE|SUPPORT|OLET|REDUCER|ELBOW)$/.test(l.trim())
            );
            if (firstComponent > 0) {
                lines.push(...regenLines.slice(firstComponent));
            } else {
                lines.push(...regenLines);
            }
        }
    } catch (e) {
        warn(MOD, 'buildPhase2PCF', `TableRegenerator failed: ${e.message}`);
    }

    info(MOD, 'buildPhase2PCF', `Phase 2 done. ${lines.length} lines.`);
    return { lines: filterPcfLines(lines) };
}

// Lazy import to avoid circular dependency at module load time
let _regen = null;
function lazyRequireRegenerator() {
    if (!_regen) {
        // dynamic import not available in sync context; use a pre-populated module cache
        throw new Error('TableRegenerator must be injected via setRegenerator()');
    }
    return _regen;
}

/**
 * Inject TableRegenerator to avoid circular imports.
 * Call this once from the app bootstrap.
 * @param {{ TableRegenerator: class }} mod
 */
export function setRegenerator(mod) {
    _regen = mod;
}
