/**
 * rc-stage3-ray-engine.js — Stage 3: Fittings PCF + Component list → Connection Map
 * Runs 4-pass algorithm: Pass 0 (gap fill), Pass 1 (bridge + early exit), Pass 2 (branch)
 * Outputs: injectedPipes[], connectionMap, orphanList
 * 100% independent — only imports from rc-config.js
 */

import {
  getRayConfig, vecSub, vecNorm, vecDot, vecScale, vecAdd, vecMag,
  ptEq, cardinalAxes, fmtNum
} from './rc-config.js';

// ── Endpoint face types ───────────────────────────────────────────────────────
// Each "face" is a shootable/hittable endpoint on a component
// { id, compRefNo, compType, faceKey, point, bore, connected, isStub }

let _faces    = [];  // all faces in engine
let _injected  = []; // injected PIPE bridges: { ep1, ep2, bore, pipelineRef }
let _connections = new Map(); // faceId → connected faceId
let _compCpMap   = new Map(); // compRefNo → true CP {x,y,z}  (B5: for P2 branch direction)
let _log      = null;

// ── Face key helpers ──────────────────────────────────────────────────────────
let _faceSeq = 0;
function makeFaceId() { return `F${++_faceSeq}`; }

// Fix B: Use 1mm grid (Math.round) instead of 0.01mm grid (toFixed(2)).
// toFixed(2) caused OLET6562.ep1 (1026294.973) and BEND8397.ep2 (1026294.975)
// to land in different buckets (0.97 vs 0.98) despite being 0.002mm apart.
function ptKey(pt) {
  return `${Math.round(pt.x)}_${Math.round(pt.y)}_${Math.round(pt.z)}`;
}

// ── Build face list from component array ──────────────────────────────────────

function buildFaces(components, cfg) {
  _faces = [];
  _connections = new Map();
  _injected = [];
  _faceSeq = 0;
  _compCpMap = new Map(); // B5: reset CP registry

  for (const c of components) {
    const isStub = c._isStub === true;

    // B5: store true CP for TEE and OLET so P2 uses correct branch direction
    if ((c.type === 'TEE' || c.type === 'OLET' || c.type === 'BEND') && c.cp) {
      _compCpMap.set(c.refNo, { ...c.cp });
    }

    if (c.type === 'SUPPORT') {
      // SUPPORT itself has no shootable face — only its stub PIPE does
      continue;
    }

    if (c.type === 'OLET') {
      // OLET: EP1 = upstream on-pipe face, EP2 = downstream on-pipe face (both at CP)
      // B6: EP2 is tagged _isOletDownstream so pass-through rule applies after EP1 connects
      const p = c.cp;
      if (p) {
        _faces.push({ id: makeFaceId(), compRefNo: c.refNo, compType: c.type,
          faceKey: 'ep1', point: { ...p }, bore: c.bore, connected: false, isStub });
        _faces.push({ id: makeFaceId(), compRefNo: c.refNo, compType: c.type,
          faceKey: 'ep2', point: { ...p }, bore: c.bore, connected: false, isStub,
          _isOletDownstream: true }); // B6 tag
      }
      if (c.bp) {
        _faces.push({ id: makeFaceId(), compRefNo: c.refNo, compType: c.type,
          faceKey: 'bp', point: { ...c.bp }, bore: Number(c.branchBore || 50),
          connected: false, isStub });
      }
      continue;
    }

    if (c.type === 'TEE') {
      if (c.ep1) _faces.push({ id: makeFaceId(), compRefNo: c.refNo, compType: c.type,
        faceKey: 'ep1', point: { ...c.ep1 }, bore: c.bore, connected: false, isStub });
      if (c.ep2) _faces.push({ id: makeFaceId(), compRefNo: c.refNo, compType: c.type,
        faceKey: 'ep2', point: { ...c.ep2 }, bore: c.bore, connected: false, isStub });
      if (c.bp)  _faces.push({ id: makeFaceId(), compRefNo: c.refNo, compType: c.type,
        faceKey: 'bp',  point: { ...c.bp },  bore: Number(c.branchBore || c.bore),
        connected: false, isStub });
      continue;
    }

    // Drop non-fitting, non-stub types (GASK, PCOM, MISC, ATTA, WELD, INST, etc.)
    // They must never enter _faces — not as ray sources, targets, or auto-connection partners.
    // This prevents GASK from firing rays (Gap A) and from triggering false DE-exits (Gap B).
    if (!cfg.fittingTypes.includes(c.type) && !isStub) continue;

    // FLANGE, BEND, VALVE, REDU, FBLI, and stub PIPEs
    if (c.ep1) _faces.push({ id: makeFaceId(), compRefNo: c.refNo, compType: c.type,
      faceKey: 'ep1', point: { ...c.ep1 }, bore: c.bore, connected: false, isStub });
    if (c.ep2) _faces.push({ id: makeFaceId(), compRefNo: c.refNo, compType: c.type,
      faceKey: 'ep2', point: { ...c.ep2 }, bore: c.bore, connected: false, isStub });
  }
}

// ── Initial connectivity: mark faces that share coordinates as connected ──────

function resolveInitialConnections() {
  const ptIndex = new Map(); // ptKey → [faceId, ...]

  for (const f of _faces) {
    const k = ptKey(f.point);
    if (!ptIndex.has(k)) ptIndex.set(k, []);
    ptIndex.get(k).push(f.id);
  }

  // For each group of faces at the same point, connect them to each other
  // BUT: OLET ep1/ep2 are at the same point — don't auto-connect to each other
  for (const [, ids] of ptIndex) {
    if (ids.length < 2) continue;
    // Connect all pairs EXCEPT same-component same-coord (OLET ep1↔ep2)
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const fa = faceById(ids[i]);
        const fb = faceById(ids[j]);
        if (!fa || !fb) continue;
        // Skip same-component connections (OLET ep1 ↔ ep2 at same coord)
        if (fa.compRefNo === fb.compRefNo) continue;
        // Skip stub→stub connections
        if (fa.isStub && fb.isStub) continue;
        // B7-root: Never auto-connect an OLET downstream (ep2) face at init.
        // When OLET ep1, ep2, and an upstream face (e.g. BEND.ep2) all share the
        // same 1mm bucket, the downstream ep2 would be marked connected here —
        // BEFORE P1 runs — making it invisible to the passthrough + 6-axis logic.
        // Leave ep2 free so rearmOletPassthroughs + P1 can route it correctly.
        if (fa._isOletDownstream || fb._isOletDownstream) continue;
        connect(fa, fb);
      }
    }
  }
}

function faceById(id) { return _faces.find(f => f.id === id); }

function connect(fa, fb) {
  fa.connected = true;
  fb.connected = true;
  _connections.set(fa.id, fb.id);
  _connections.set(fb.id, fa.id);
}

// ── Raycast ───────────────────────────────────────────────────────────────────

// overrides = { fixedTol?: number, maxDistance?: number }
// fixedTol:    absolute perpendicular tolerance (mm). When set, replaces the bore-based calc.
// maxDistance: cap on ray travel (mm). When set, overrides cfg.rayMaxDistance.
function raycast(origin, dir, excludeCompRefNo, cfg, overrides = {}) {
  const maxDist  = overrides.maxDistance ?? cfg.rayMaxDistance;
  const deadZone = cfg.deadZoneMin;
  const fixedTol = overrides.fixedTol ?? null;   // null → use bore-based tolerance

  let bestT    = maxDist;
  let bestFace = null;

  for (const f of _faces) {
    if (f.connected) continue;
    if (f.isStub)    continue;        // stubs are not ray targets
    if (f.compRefNo === excludeCompRefNo) continue; // no self-hit

    const vec  = vecSub(f.point, origin);
    const t    = vecDot(vec, dir);
    if (t < deadZone || t > maxDist) continue;

    const proj  = vecScale(dir, t);
    const perp  = vecSub(vec, proj);
    const perpD = vecMag(perp);
    const tol   = fixedTol !== null
      ? fixedTol
      : Math.max(f.bore * cfg.boreTolMultiplier, cfg.minBoreTol);
    if (perpD > tol) continue;

    if (t < bestT) { bestT = t; bestFace = f; }
  }

  return bestFace ? { face: bestFace, t: bestT } : null;
}

// ── Infer axis vector from component EP1→EP2 direction ───────────────────────

function inferDir(face, allFaces) {
  if (face.compType === 'BEND') {
    const cp = _compCpMap.get(face.compRefNo);
    if (cp) {
      const d = vecSub(face.point, cp);
      if (vecMag(d) >= 1e-6) return vecNorm(d);
    }
  }

  // Get sibling face of same component (ep2 if we are ep1, and vice versa)
  const sibKey = face.faceKey === 'ep1' ? 'ep2' : 'ep1';
  const sib    = allFaces.find(
    f => f.compRefNo === face.compRefNo && f.faceKey === sibKey
  );
  if (!sib) return null;
  const d = vecSub(face.point, sib.point);
  if (vecMag(d) < 1e-6) return null;
  return vecNorm(d); // points away from sibling (outward direction)
}

// ── Inject a bridge PIPE ──────────────────────────────────────────────────────

function injectBridge(fa, fb, pipelineRef, cfg) {
  const bore = Math.min(fa.bore, fb.bore);
  _injected.push({
    ep1: { ...fa.point },
    ep2: { ...fb.point },
    bore,
    pipelineRef,
    fromRefNo: fa.compRefNo,  // audit trail
    toRefNo:   fb.compRefNo
  });
  connect(fa, fb);

  // B6: OLET pass-through — when EP1 gets connected from upstream,
  // EP2 (downstream face at same coord) gets a synthetic bridge in opposite direction.
  // This allows the downstream pipe run to originate from the OLET exit point.

  // We must arm the target OLET's ep2 even if the shooter was an OLET ep2.
  // Check fa
  if ((fa.compType === 'OLET' || fa.compType === 'TEE') && (fa.faceKey === 'ep1' || fa.faceKey === 'ep2')) {
    const targetKey = fa.faceKey === 'ep1' ? 'ep2' : 'ep1';
    const targetFace = _faces.find(f => f.compRefNo === fa.compRefNo && f.faceKey === targetKey && !f.connected);
    if (targetFace) {
      const incomingDir = vecNorm(vecSub(fa.point, fb.point));
      if (vecMag(incomingDir) >= 1e-6) {
        targetFace._passthroughDir = incomingDir;
        _log?.('S3-P1', 'olet-passthrough-armed', fa.compRefNo, { targetId: targetFace.id, dir: incomingDir });
      }
    }
  }
  // Check fb
  if ((fb.compType === 'OLET' || fb.compType === 'TEE') && (fb.faceKey === 'ep1' || fb.faceKey === 'ep2')) {
    const targetKey = fb.faceKey === 'ep1' ? 'ep2' : 'ep1';
    const targetFace = _faces.find(f => f.compRefNo === fb.compRefNo && f.faceKey === targetKey && !f.connected);
    if (targetFace) {
      const incomingDir = vecNorm(vecSub(fb.point, fa.point));
      if (vecMag(incomingDir) >= 1e-6) {
        targetFace._passthroughDir = incomingDir;
        _log?.('S3-P1', 'olet-passthrough-armed', fb.compRefNo, { targetId: targetFace.id, dir: incomingDir });
      }
    }
  }
}

// ── 6-axis 2-pass fallback helper (used by P1 fallback and P3) ───────────────
// Pass 1: 4 horizontal axes (±X, ±Y), tight diameter (default 6 mm → radius 3 mm), max 20 000 mm.
// Pass 2: all 6 axes, wider diameter (default 25 mm → radius 12.5 mm; REDU: 100 mm), max 20 000 mm.
// "diameter" = perpendicular cylinder diameter; tolerance = diameter / 2.
// Same-run co-axial faces have perp ≈ 0 → pass both. Cross-run faces (~125 mm offset) → blocked.



// ── PASS 0 — Gap Fill (≤ gapFillTolerance mm) ─────────────────────────────────

function runPass0(pipelineRef, cfg) {
  const tol       = cfg.gapFillTolerance;
  const fillTypes = cfg.gapFillTypes;
  let filled      = 0;

  const orphans = _faces.filter(f => !f.connected && fillTypes.includes(f.compType));

  for (const f of orphans) {
    if (f.connected) continue;
    // Find nearest unconnected face within gap tolerance
    let bestDist = Infinity;
    let bestF    = null;
    for (const g of _faces) {
      if (g.id === f.id) continue;
      if (g.connected)   continue;
      if (g.compRefNo === f.compRefNo) continue;
      const dist = vecMag(vecSub(f.point, g.point));
      if (dist <= tol && dist < bestDist) { bestDist = dist; bestF = g; }
    }
    if (bestF) {
      // Stretch f.point to meet bestF.point
      f.point = { ...bestF.point };
      _log?.('S3-P0', 'gap-filled', f.compRefNo,
        { from: f.point, to: bestF.point, dist: bestDist });
      connect(f, bestF);
      filled++;
    }
  }
  return filled;
}

// ── PASS 1 — Bridging ──────────────────────────────────────────────────────────

// Mitigation M1 (Fix B): When OLET.ep1 connects during resolveInitialConnections
// (not via injectBridge), the passthrough arming in injectBridge is bypassed.
// This sweep re-arms any OLET ep2 whose ep1 is now connected but ep2 is still dark.
function rearmOletPassthroughs() {
  const oletEp1Faces = _faces.filter(
    f => (f.compType === 'OLET' || f.compType === 'TEE') && f.faceKey === 'ep1' && f.connected
  );
  for (const ep1 of oletEp1Faces) {
    const ep2 = _faces.find(
      f => f.compRefNo === ep1.compRefNo && f.faceKey === 'ep2' && !f.connected
    );
    if (!ep2) continue;                          // ep2 already connected — skip
    if (ep2._passthroughDir) continue;           // already armed via injectBridge — skip
    // Get the partner face that ep1 connected to
    const partnerId = _connections.get(ep1.id);
    const partner   = _faces.find(f => f.id === partnerId);
    if (!partner) continue;

    let incomingDir = vecNorm(vecSub(ep1.point, partner.point));
    if (vecMag(incomingDir) < 1e-6) {
      if (partner._passthroughDir) {
        incomingDir = partner._passthroughDir;
      } else {
        continue;
      }
    }
    ep2._passthroughDir = incomingDir;
    _log?.('S3-P1', 'olet-ep2-rearmed', ep1.compRefNo,
      { ep2Id: ep2.id, dir: incomingDir, partner: partner.compRefNo });
  }

  const oletEp2Faces = _faces.filter(
    f => (f.compType === 'OLET' || f.compType === 'TEE') && f.faceKey === 'ep2' && f.connected
  );
  for (const ep2 of oletEp2Faces) {
    const ep1 = _faces.find(
      f => f.compRefNo === ep2.compRefNo && f.faceKey === 'ep1' && !f.connected
    );
    if (!ep1) continue;                          // ep1 already connected — skip
    if (ep1._passthroughDir) continue;           // already armed via injectBridge — skip
    // Get the partner face that ep2 connected to
    const partnerId = _connections.get(ep2.id);
    const partner   = _faces.find(f => f.id === partnerId);
    if (!partner) continue;

    let incomingDir = vecNorm(vecSub(ep2.point, partner.point));
    if (vecMag(incomingDir) < 1e-6) {
      if (partner._passthroughDir) {
        incomingDir = partner._passthroughDir;
      } else {
        continue;
      }
    }
    ep1._passthroughDir = incomingDir;
    _log?.('S3-P1', 'olet-ep1-rearmed', ep2.compRefNo,
      { ep1Id: ep1.id, dir: incomingDir, partner: partner.compRefNo });
  }
}

function runPass1A(pipelineRef, cfg) {
  const deTypes = cfg.deTypes;
  let totalBridged = 0;
  let bridgedInLoop = 0;

  do {
    bridgedInLoop = 0;
    rearmOletPassthroughs();

    for (const f of _faces) {
      if (f.connected || f.isStub) continue;
      if (f.faceKey === 'bp') continue;

      if ((f._isOletDownstream || f.compType === 'TEE' || f.compType === 'OLET') && f._passthroughDir) {
        _log?.('S3-P1A', 'ray-cast', f.compRefNo,
          { origin: f.point, dir: f._passthroughDir, method: 'olet-passthrough' });
        const hit = raycast(f.point, f._passthroughDir, f.compRefNo, cfg);
        if (hit) {
          _log?.('S3-P1A', 'hit', f.compRefNo,
            { target: hit.face.compRefNo, t: hit.t, faceKey: hit.face.faceKey });
          injectBridge(f, hit.face, pipelineRef, cfg);
          bridgedInLoop++;
        }
        continue;
      }

      if (deTypes.includes(f.compType)) {
        const sibling = _faces.find(
          s => s.compRefNo === f.compRefNo && s.id !== f.id && s.connected
        );
        if (sibling) {
          _log?.('S3-P1A', 'early-exit', f.compRefNo,
            { reason: 'DE type, sibling connected', faceKey: f.faceKey });
          continue;
        }
      }

      const axDir = inferDir(f, _faces);
      if (axDir) {
        _log?.('S3-P1A', 'ray-cast', f.compRefNo,
          { origin: f.point, dir: axDir, method: 'axis-vector' });
        // Pass-A: Primary ray, tight 3mm radius cylinder — direction is precisely inferred
        // from component geometry (not a blind cardinal guess), so no maxDistance cap here.
        // P1B/P1C 6-axis fallback uses 20000mm cap to prevent cross-run false connections.
        const hit = raycast(f.point, axDir, f.compRefNo, cfg, { fixedTol: 3 });
        if (hit) {
          _log?.('S3-P1A', 'hit', f.compRefNo,
            { target: hit.face.compRefNo, t: hit.t, faceKey: hit.face.faceKey });
          injectBridge(f, hit.face, pipelineRef, cfg);
          bridgedInLoop++;
        }
      }
    }
    totalBridged += bridgedInLoop;
  } while (bridgedInLoop > 0);

  return totalBridged;
}

function runPass1B(pipelineRef, cfg) {
  let bridged = 0;
  const p1Tol  = (cfg.sixAxP1Diameter ?? 6) / 2;
  const p1Dist = cfg.sixAxP1MaxDist ?? 20000;
  const hAxes  = cardinalAxes().filter(ax => Math.abs(ax.z) < 0.5);

  for (const f of _faces) {
    if (f.connected || f.isStub) continue;
    if (f.faceKey === 'bp') continue;

    // We only shoot in pass-B if we couldn't connect in Pass-A
    const axDir = inferDir(f, _faces);
    if (!axDir) continue; // If direction is unknown, don't guess blindly

    for (const ax of hAxes) {
      if (vecDot(axDir, ax) < 0.5) continue;
      if (f.connected) break;
      _log?.('S3-P1B', 'ray-cast', f.compRefNo, { dir: ax, method: '6ax-p1', tol: p1Tol });
      const hit = raycast(f.point, ax, f.compRefNo, cfg, { fixedTol: p1Tol, maxDistance: p1Dist });
      if (hit) {
        _log?.('S3-P1B', 'hit', f.compRefNo,
          { target: hit.face.compRefNo, t: hit.t, faceKey: hit.face.faceKey, via: '6ax-p1' });
        injectBridge(f, hit.face, pipelineRef, cfg);
        bridged++;
        break;
      }
    }
  }
  return bridged;
}

function runPass1C(pipelineRef, cfg) {
  let bridged = 0;
  for (const f of _faces) {
    if (f.connected || f.isStub) continue;
    if (f.faceKey === 'bp') continue;

    const p2Diam = f.compType === 'REDU'
      ? (cfg.sixAxP2DiamREDU ?? 100)
      : (cfg.sixAxP2Diameter ?? 25);
    const p2Tol  = p2Diam / 2;
    const p2Dist = cfg.sixAxP2MaxDist ?? 20000;

    const axDir = inferDir(f, _faces);
    if (!axDir) continue; // If direction is unknown, don't guess blindly

    for (const ax of cardinalAxes()) {
      if (vecDot(axDir, ax) < 0.5) continue;
      if (f.connected) break;
      _log?.('S3-P1C', 'ray-cast', f.compRefNo, { dir: ax, method: '6ax-p2', tol: p2Tol });
      const hit = raycast(f.point, ax, f.compRefNo, cfg, { fixedTol: p2Tol, maxDistance: p2Dist });
      if (hit) {
        _log?.('S3-P1C', 'hit', f.compRefNo,
          { target: hit.face.compRefNo, t: hit.t, faceKey: hit.face.faceKey, via: '6ax-p2' });
        injectBridge(f, hit.face, pipelineRef, cfg);
        bridged++;
        break;
      }
    }
  }
  return bridged;
}

function runPass1(components, pipelineRef, cfg) {
  let bridged = 0;
  bridged += runPass1A(pipelineRef, cfg);
  bridged += runPass1B(pipelineRef, cfg);
  bridged += runPass1C(pipelineRef, cfg);
  return bridged;
}

// ── PASS 2 — Branch Resolution (TEE / OLET BP) ────────────────────────────────

function runPass2(pipelineRef, cfg) {
  let resolved = 0;

  const bpFaces = _faces.filter(f => !f.connected && f.faceKey === 'bp');

  for (const f of bpFaces) {
    // B5: Use true CP from _compCpMap (not EP1 face) for branch direction
    const trueCP = _compCpMap.get(f.compRefNo);
    if (!trueCP) {
      _log?.('S3-P2', 'skip-no-cp', f.compRefNo, {});
      continue;
    }

    const branchDir = vecNorm(vecSub(f.point, trueCP));
    const hasDir   = vecMag(branchDir) > 1e-6;

    // Primary: shoot in normalize(BP - CP) direction
    if (hasDir) {
      _log?.('S3-P2', 'ray-cast', f.compRefNo,
        { origin: f.point, dir: branchDir, cp: trueCP });
      const hit = raycast(f.point, branchDir, f.compRefNo, cfg);
      if (hit) {
        _log?.('S3-P2', 'hit', f.compRefNo, { target: hit.face.compRefNo, t: hit.t });
        injectBridge(f, hit.face, pipelineRef, cfg);
        resolved++;
        continue;
      }
    }

    // Fallback 1: 6 cardinal axes from BP
    let hitFallback = null;
    for (const ax of cardinalAxes()) {
      if (hasDir && vecDot(branchDir, ax) < 0.5) continue;
      hitFallback = raycast(f.point, ax, f.compRefNo, cfg);
      if (hitFallback) {
        _log?.('S3-P2', 'hit-cardinal', f.compRefNo,
          { target: hitFallback.face.compRefNo, t: hitFallback.t, axis: ax });
        injectBridge(f, hitFallback.face, pipelineRef, cfg);
        resolved++;
        break;
      }
    }
    if (f.connected) continue;

    // Fallback 2: Proximity search — find nearest unconnected non-stub face
    // within proximityMaxDist. Candidate must align with branchDir within proximityMinDot.
    // Fix A: Raised dot threshold (0.2→cfg.proximityMinDot=0.85) and added hard
    // distance cap (cfg.proximityMaxDist=10000mm) to eliminate false 135km hits.
    const maxProxDist = cfg.proximityMaxDist || 10000;
    const minDot      = cfg.proximityMinDot  || 0.85;
    let bestDist      = maxProxDist;
    let bestTarget    = null;

    for (const g of _faces) {
      if (g.connected)   continue;
      if (g.isStub)      continue;
      if (g.compRefNo === f.compRefNo) continue;
      const dist = vecMag(vecSub(g.point, f.point));
      if (dist >= bestDist) continue;
      // Alignment check: target must be within ~32° of branch direction
      if (hasDir) {
        const dotVal = vecDot(vecNorm(vecSub(g.point, f.point)), branchDir);
        if (dotVal < minDot) continue; // Fix A: strict gate (was 0.2, now 0.85)
      }
      bestDist   = dist;
      bestTarget = g;
    }

    if (bestTarget) {
      _log?.('S3-P2', 'hit-proximity', f.compRefNo,
        { target: bestTarget.compRefNo, dist: bestDist });
      injectBridge(f, bestTarget, pipelineRef, cfg);
      resolved++;
    } else {
      _log?.('S3-P2', 'miss', f.compRefNo, { origin: f.point });
    }
  }
  return resolved;
}

// ── PASS 3 — Cleanup sweep for still-unconnected retained faces ───────────────
// Safety net: after P1 + P2, any retained (non-stub, non-bp) face that is still
// unconnected gets one more chance via the 2-pass 6-axis helper. Uses the same
// tight tolerances as the P1 fallback to avoid cross-run false bridges.

function runPass3(pipelineRef, cfg) {
  let bridged = 0;

  for (const f of _faces) {
    if (f.connected || f.isStub || f.faceKey === 'bp') continue;

    _log?.('S3-P3', 'scanning', f.compRefNo, { faceKey: f.faceKey, origin: f.point });
    // For OLET/TEE, ep1 and ep2 share the same coordinate so inferDir returns null.
    // Fall back to the passthrough direction armed by injectBridge / rearmOletPassthroughs.
    let axDir = inferDir(f, _faces);
    if (!axDir) {
      if (f._passthroughDir) axDir = f._passthroughDir;
      else continue; // Direction truly unknown — skip
    }

    // Pass 1B fallback equivalent
    const p1Tol  = (cfg.sixAxP1Diameter ?? 6) / 2;
    const p1Dist = cfg.sixAxP1MaxDist ?? 20000;
    const hAxes  = cardinalAxes().filter(ax => Math.abs(ax.z) < 0.5);

    let hitResolved = false;
    for (const ax of hAxes) {
      if (vecDot(axDir, ax) < 0.5) continue;
      if (f.connected) break;
      const hit = raycast(f.point, ax, f.compRefNo, cfg, { fixedTol: p1Tol, maxDistance: p1Dist });
      if (hit) {
        injectBridge(f, hit.face, pipelineRef, cfg);
        bridged++;
        hitResolved = true;
        break;
      }
    }

    if (hitResolved) continue;

    // Pass 1C fallback equivalent
    const p2Diam = f.compType === 'REDU'
      ? (cfg.sixAxP2DiamREDU ?? 100)
      : (cfg.sixAxP2Diameter ?? 25);
    const p2Tol  = p2Diam / 2;
    const p2Dist = cfg.sixAxP2MaxDist ?? 20000;

    for (const ax of cardinalAxes()) {
      if (vecDot(axDir, ax) < 0.5) continue;
      if (f.connected) break;
      const hit = raycast(f.point, ax, f.compRefNo, cfg, { fixedTol: p2Tol, maxDistance: p2Dist });
      if (hit) {
        injectBridge(f, hit.face, pipelineRef, cfg);
        bridged++;
        break;
      }
    }

    if (!f.connected) {
      _log?.('S3-P3', 'miss', f.compRefNo, { origin: f.point, faceKey: f.faceKey });
    }
  }
  return bridged;
}

// ── Build connection map for Stage 4 ─────────────────────────────────────────

function buildConnectionMap() {
  const map = {};
  for (const f of _faces) {
    if (!map[f.compRefNo]) {
      map[f.compRefNo] = { type: f.compType, ep1: null, ep2: null, bp: null };
    }
    if (_connections.has(f.id)) {
      const partnerId   = _connections.get(f.id);
      const partnerFace = faceById(partnerId);
      map[f.compRefNo][f.faceKey] = partnerFace ? partnerFace.compRefNo : null;
    }
  }
  return map;
}

// ── Build orphan report ───────────────────────────────────────────────────────

function buildOrphanList() {
  return _faces
    .filter(f => !f.connected && !f.isStub)
    .map(f => ({ refNo: f.compRefNo, type: f.compType, faceKey: f.faceKey, point: f.point }));
}

// ── Connection matrix (for Debug tab) ─────────────────────────────────────────

function buildConnectionMatrix() {
  const seen = new Set();
  const rows = [];
  for (const f of _faces) {
    if (seen.has(f.compRefNo)) continue;
    seen.add(f.compRefNo);
    const ep1F = _faces.find(x => x.compRefNo === f.compRefNo && x.faceKey === 'ep1');
    const ep2F = _faces.find(x => x.compRefNo === f.compRefNo && x.faceKey === 'ep2');
    const bpF  = _faces.find(x => x.compRefNo === f.compRefNo && x.faceKey === 'bp');
    const ep1c = ep1F ? (ep1F.connected ? faceById(_connections.get(ep1F.id))?.compRefNo : 'ORPHAN') : '—';
    const ep2c = ep2F ? (ep2F.connected ? faceById(_connections.get(ep2F.id))?.compRefNo : 'ORPHAN') : '—';
    const bpc  = bpF  ? (bpF.connected  ? faceById(_connections.get(bpF.id))?.compRefNo  : 'ORPHAN') : '—';
    const allConn = [ep1F, ep2F, bpF].filter(Boolean).every(x => x.connected);
    const anyConn = [ep1F, ep2F, bpF].filter(Boolean).some(x => x.connected);
    rows.push({
      refNo: f.compRefNo, type: f.compType,
      ep1: ep1c, ep2: ep2c, bp: bpc,
      status: allConn ? 'FULL' : anyConn ? 'PARTIAL' : 'OPEN'
    });
  }
  return rows;
}

// ── Main Stage 3 function ─────────────────────────────────────────────────────

/**
 * @param {object[]} components  — from Stage 1 (includes PIPE comps for reference)
 * @param {string}   pipelineRef — for injected PIPE blocks
 * @param {function} logFn
 * @returns {{ injectedPipes, connectionMap, orphanList, connectionMatrix, passStats }}
 */
export function runStage3(components, pipelineRef, logFn = () => {}) {
  const cfg = getRayConfig();
  _log = logFn;

  // Only non-PIPE components participate in ray engine
  // (PIPE stubs from Stage 2 are marked _isStub)
  const fitComps = components.filter(c =>
    cfg.fittingTypes.includes(c.type) || c._isStub
  );

  buildFaces(fitComps, cfg);
  resolveInitialConnections();

  const stats = { p0: 0, p1: 0, p2: 0, p3: 0 };

  if (cfg.passEnabled.p0) {
    stats.p0 = runPass0(pipelineRef, cfg);
    logFn('S3-P0', 'pass-complete', '', { filled: stats.p0 });
  }

  if (cfg.passEnabled.p1) {
    stats.p1 = runPass1(components, pipelineRef, cfg);
    logFn('S3-P1', 'pass-complete', '', { bridged: stats.p1 });
  }

  if (cfg.passEnabled.p2) {
    stats.p2 = runPass2(pipelineRef, cfg);
    logFn('S3-P2', 'pass-complete', '', { resolved: stats.p2 });
  }

  // Fix B: P3 cleanup sweep — rescues retained faces orphaned by DE-type early-exit
  // (e.g. FLANGEs whose sibling was connected to an excluded GASK face in resolveInitialConnections)
  stats.p3 = runPass3(pipelineRef, cfg);
  logFn('S3-P3', 'pass-complete', '', { bridged: stats.p3 });

  return {
    injectedPipes:    [..._injected],
    connectionMap:    buildConnectionMap(),
    orphanList:       buildOrphanList(),
    connectionMatrix: buildConnectionMatrix(),
    passStats:        stats
  };
}
