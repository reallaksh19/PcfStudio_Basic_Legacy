/**
 * coord-topology-analyzer.js — Multi-pass 3D point topology classifier
 *
 * Pass 0: Build adjacency graph — degree of each node
 * Pass 1: Detect bends at degree-2 nodes (bulge primary + angle verification)
 * Pass 2: Detect branches at degree-3+ nodes (TEE)
 * Pass 3: Detect supports (supportName column) + log remarks/legends
 * Pass 4: Straight pipe segmentation — fill gaps between classified nodes
 *
 * Exports:
 *   analyzeTopology(runs, options) → { components, log, warnings }
 */

import { classifyAngle, computeBendGeometry, classifyBulgeAngle } from './coord-bend-calc.js';
import { computeTeeGeometry } from './coord-tee-calc.js';
import { getRayConfig } from '../ray-concept/rc-config.js';

const SNAP_TOL = 1.0; // mm — coordinate snap tolerance

function snapKey(pt) {
  const s = v => Math.round(Number(v) / SNAP_TOL) * SNAP_TOL;
  return `${s(pt.x)},${s(pt.y)},${s(pt.z)}`;
}

function toVec(pt) {
  return { x: parseFloat(pt.x) || 0, y: parseFloat(pt.y) || 0, z: parseFloat(pt.z) || 0 };
}

function dist3D(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

/**
 * Analyze topology for all parsed runs.
 * @param {Array<{points: Point3D[], metadata: object}>} runs  — from text/csv parsers
 * @param {{ bore: number, bendRadius?: number }}         options
 * @returns {{ components: ClassifiedComponent[], log: string[], warnings: string[] }}
 */
export function analyzeTopology(runs, options = {}) {
  const cfg        = getRayConfig();
  const bore       = parseFloat(options.bore) || 250;
  const coordScale = parseFloat(options.coordScale) || 1.0; // scale factor (e.g., 1000 for m->mm)
  const bendRadius = options.bendRadius ? parseFloat(options.bendRadius) : bore * 1.5;

  const log = [];
  const warnings = [];
  const allComponents = [];

  // Helper to scale points directly inside the analyzer
  const scalePt = p => ({ x: p.x * coordScale, y: p.y * coordScale, z: p.z * coordScale });


  // ── PIPE-ONLY DEBUG MODE ───────────────────────────────────────────────────
  // When pipeOnly=true: skip all bend/tee detection, emit one PIPE per consecutive
  // point pair. Lets us verify raw coordinate topology before adding elbow geometry.
  if (options.pipeOnly) {
    log.push('[PIPE-ONLY MODE] Skipping all bend/tee detection — emitting raw pipe segments.');
    for (let runIdx = 0; runIdx < runs.length; runIdx++) {
      const run = runs[runIdx];
      const pts = run.points.map(p => ({ ...toVec(p), ...scalePt(p), _raw: p }));
      log.push(`  Run ${runIdx + 1}: ${pts.length} raw points → ${pts.length - 1} pipe(s) (Scale: ${coordScale})`);
      for (let i = 0; i < pts.length - 1; i++) {
        const ep1 = { x: pts[i].x, y: pts[i].y, z: pts[i].z };
        const ep2 = { x: pts[i+1].x, y: pts[i+1].y, z: pts[i+1].z };
        if (dist3D(ep1, ep2) > 0.01) {
          allComponents.push({ type: 'PIPE', ep1, ep2, bore });
        }

      }
    }
    return { components: allComponents, log, warnings };
  }
  // ────────────────────────────────────────────────────────────────────────────



  for (let runIdx = 0; runIdx < runs.length; runIdx++) {
    const run = runs[runIdx];
    let pts = run.points.map(p => ({ ...toVec(p), ...scalePt(p), _raw: p }));

    // ── Deduplicate: remove ONLY genuinely coincident consecutive points (< 0.1 mm/scaled unit) ──
    const MIN_SEG = 0.1; 
    pts = pts.filter((p, i) => {
      if (i === 0) return true;
      return dist3D(p, pts[i - 1]) >= MIN_SEG;
    });

    if (pts.length < 2) {
      warnings.push(`Run ${runIdx + 1}: Only ${pts.length} point(s) after deduplication — need ≥ 2`);
      continue;
    }

    log.push(`\n=== Run ${runIdx + 1}: ${run.points.length} raw → ${pts.length} points, Scale=${coordScale}, layer="${run.metadata?.layer || ''}" ===`);

    // ── Pass 0: Build adjacency graph ─────────────────────────────────────
    const keys = pts.map(p => snapKey(p));
    const nodeMap = new Map(); // key → { pt, rawPt, neighbors: Set<key>, degree, originalIndex }

    for (let i = 0; i < pts.length; i++) {
      const k = keys[i];
      if (!nodeMap.has(k)) {
        nodeMap.set(k, { pt: pts[i], rawPt: run.points[i], neighbors: new Set(), originalIndex: i });
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const kA = keys[i], kB = keys[i + 1];
      if (kA === kB) continue;
      nodeMap.get(kA)?.neighbors.add(kB);
      nodeMap.get(kB)?.neighbors.add(kA);
    }
    for (const [, node] of nodeMap) node.degree = node.neighbors.size;

    log.push(`  Pass 0: ${nodeMap.size} unique nodes`);

    // Enrich maps from raw point data (CSV)
    const deBoMap     = new Map();
    const supportMap  = new Map();
    const remarksMap  = new Map();
    for (let i = 0; i < pts.length; i++) {
      const rp = run.points[i];
      const k  = keys[i];
      if (!rp) continue;
      const deBo = String(rp.deBo || '').trim().toUpperCase();
      if (deBo === 'DE' || deBo === 'BO') deBoMap.set(k, deBo);
      if (rp.supportName?.trim()) supportMap.set(k, rp.supportName.trim());
      if (rp.remarks?.trim())     remarksMap.set(k, rp.remarks.trim());
    }

    // ── Pass 1: Bend detection (sequential triples) ────────────────────────
    const bendNodes   = new Set();
    const bendResults = new Map();

    for (let i = 1; i < pts.length - 1; i++) {
      const pPrev = pts[i - 1], pVert = pts[i], pNext = pts[i + 1];
      const key   = keys[i];
      const rawPt = run.points[i];

      // Bulge-based detection (primary trigger for arc segments)
      const bulgeClass = rawPt?.bulge != null ? classifyBulgeAngle(Number(rawPt.bulge)) : null;

      // Adjacent-segment angle (verification / primary when no bulge)
      const { angleDeg, bendClass } = classifyAngle(pPrev, pVert, pNext);

      // Resolve final class: bulge overrides if it gives 45°/90°
      let finalClass = bendClass;
      if (bulgeClass === '90' || bulgeClass === '45') finalClass = bulgeClass;

      if (finalClass === 'collinear') continue;

      // Compute tangent-point geometry
      const geo = computeBendGeometry(pPrev, pVert, pNext, bendRadius, finalClass);

      const bulgeNote = bulgeClass ? ` | bulge=${rawPt.bulge}(${bulgeClass})` : '';
      const angleNote = `angle=${angleDeg.toFixed(1)}°(${bendClass})`;
      log.push(`  BEND [${i}] key=${key}: ${angleNote}${bulgeNote} → class=${finalClass}, offset=${geo.tangentOffset.toFixed(2)}mm`);

      bendNodes.add(key);
      bendResults.set(key, { type: 'BEND', ...geo, bore, seqIndex: i });
    }
    log.push(`  Pass 1: ${bendNodes.size} bend(s)`);

    // ── Pass 2: Branch detection (degree >= 3) ────────────────────────────
    const teeNodes   = new Set();
    const teeResults = new Map();

    for (const [key, node] of nodeMap) {
      if (node.degree < 3) continue;
      // Note: we might need to handle tees at bend endpoints, but for now standard logic applies

      const neighborPts = [...node.neighbors]
        .map(k => nodeMap.get(k)?.pt)
        .filter(Boolean);

      const geo = computeTeeGeometry(node.pt, neighborPts, bore, bore, cfg);
      if (!geo) continue;

      log.push(`  TEE key=${key}: degree=${node.degree}, brlen=${geo.brlen?.toFixed(1)}mm, cpErr=${geo.cpMidpointError?.toFixed(3)}mm`);
      teeNodes.add(key);
      teeResults.set(key, { type: 'TEE', ...geo, bore, seqIndex: node.originalIndex });
    }
    log.push(`  Pass 2: ${teeNodes.size} tee(s)`);

    // ── Pass 3: Support + Remarks ─────────────────────────────────────────
    const supportNodes   = new Set();
    const supportResults = new Map();

    for (const [key, supName] of supportMap) {
      if (bendNodes.has(key) || teeNodes.has(key)) continue;
      const node = nodeMap.get(key);
      log.push(`  SUPPORT key=${key}: name="${supName}"`);
      supportNodes.add(key);
      supportResults.set(key, {
        type: 'SUPPORT', coords: node?.pt, supportName: supName, bore: 0,
        seqIndex: node?.originalIndex,
      });
    }

    for (const [key, remark] of remarksMap) {
      log.push(`  LEGEND key=${key}: "${remark}"`);
    }

    for (const [key, flag] of deBoMap) {
      log.push(`  DE/BO key=${key}: flag="${flag}"`);
    }

    log.push(`  Pass 3: ${supportNodes.size} support(s)`);

    // ── Pass 4: Emit one component per ordered point, then pipe between them ──
    const classifiedKeys = new Set([...bendNodes, ...teeNodes, ...supportNodes]);
    const comps = [];

    // Helper: get the "outgoing" point of a classified component at pts[i]
    function getOutgoing(key, idx) {
      if (bendNodes.has(key)) return bendResults.get(key).ep2;
      if (teeNodes.has(key)) return teeResults.get(key).cp;
      if (supportNodes.has(key)) return supportResults.get(key).coords || pts[idx];
      return pts[idx];
    }

    // Helper: get the "incoming" point of a classified component at pts[i]
    function getIncoming(key, idx) {
      if (bendNodes.has(key)) return bendResults.get(key).ep1;
      if (teeNodes.has(key)) return teeResults.get(key).cp;
      if (supportNodes.has(key)) return supportResults.get(key).coords || pts[idx];
      return pts[idx];
    }

    let prevOutgoing = null; // tracks the outgoing tangent point of the last emitted component

    for (let i = 0; i < pts.length; i++) {
      const key = keys[i];
      const isClassified = classifiedKeys.has(key);

      if (isClassified) {
        // Get this node's incoming tangent
        const incomingPt = getIncoming(key, i);

        // Emit a PIPE from the previous outgoing to this incoming
        const pipeFrom = prevOutgoing || pts[0];
        const pipeTo   = incomingPt;
        const pipeDist = dist3D(pipeFrom, pipeTo);
        if (pipeDist > 1.0) comps.push({ type: 'PIPE', ep1: { ...pipeFrom }, ep2: { ...pipeTo }, bore });

        // Emit the classified component
        if (bendNodes.has(key))    comps.push(bendResults.get(key));
        if (teeNodes.has(key))     comps.push(teeResults.get(key));
        if (supportNodes.has(key)) comps.push(supportResults.get(key));

        // Update outgoing to this node's outgoing tangent
        prevOutgoing = { ...getOutgoing(key, i) };

      } else if (i === pts.length - 1) {
        // Last point — close with a pipe
        const pipeFrom = prevOutgoing || pts[0];
        const pipeTo   = pts[i];
        const pipeDist = dist3D(pipeFrom, pipeTo);
        if (pipeDist > 1.0) comps.push({ type: 'PIPE', ep1: { ...pipeFrom }, ep2: { ...pipeTo }, bore });
      }
    }

    // Safety: if no classified nodes at all, emit one pipe for the whole run
    if (comps.length === 0 && pts.length >= 2) {
      comps.push({ type: 'PIPE', ep1: { ...pts[0] }, ep2: { ...pts[pts.length - 1] }, bore });
    }

    const pipeCount = comps.filter(c => c.type === 'PIPE').length;
    log.push(`  Pass 4: ${pipeCount} pipe segment(s)`);
    log.push(`  Run ${runIdx + 1} total: ${comps.length} components`);

    allComponents.push(...comps);
  }

  return { components: allComponents, log, warnings };
}
