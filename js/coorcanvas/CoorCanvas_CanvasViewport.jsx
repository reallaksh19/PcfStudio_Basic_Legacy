/**
 * CoorCanvas_CanvasViewport.jsx
 * SVG canvas for CoorCanvas: rendering, event handling, zoom/pan,
 * OSnap markers, ghost preview, fitting HUD, and tolerance-based selection.
 */
import React, { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Move, RefreshCcw, ScanSearch } from "lucide-react";
import {
  findPipeSnap,
} from "./CoorCanvas_SnapEngine.js";
import {
  dist,
  inferHoverId,
} from "./CoorCanvas_GeometryUtils.js";

// ── OSnap marker SVG ──────────────────────────────────────────────────────────

function OSnapMarker({ snapTarget, worldToScreen }) {
  if (!snapTarget) return null;
  const s = worldToScreen(snapTarget.point);
  if (snapTarget.snapType === "endpoint") {
    return (
      <g pointerEvents="none">
        <rect x={s.x - 7} y={s.y - 7} width={14} height={14} fill="none" stroke="#22c55e" strokeWidth="2" />
        <line x1={s.x - 11} y1={s.y} x2={s.x + 11} y2={s.y} stroke="#22c55e" strokeWidth="1.4" />
        <line x1={s.x} y1={s.y - 11} x2={s.x} y2={s.y + 11} stroke="#22c55e" strokeWidth="1.4" />
      </g>
    );
  }
  if (snapTarget.snapType === "midpoint") {
    return (
      <g pointerEvents="none">
        <polygon
          points={`${s.x},${s.y - 9} ${s.x - 8},${s.y + 6} ${s.x + 8},${s.y + 6}`}
          fill="none" stroke="#eab308" strokeWidth="2"
        />
        <line x1={s.x} y1={s.y - 13} x2={s.x} y2={s.y + 10} stroke="#eab308" strokeWidth="1.4" />
      </g>
    );
  }
  // nearest — cyan cross
  return (
    <g pointerEvents="none">
      <circle cx={s.x} cy={s.y} r={8} fill="none" stroke="#06b6d4" strokeWidth="2" />
      <line x1={s.x - 12} y1={s.y} x2={s.x + 12} y2={s.y} stroke="#06b6d4" strokeWidth="1.6" />
      <line x1={s.x} y1={s.y - 12} x2={s.x} y2={s.y + 12} stroke="#06b6d4" strokeWidth="1.6" />
    </g>
  );
}

// ── Ghost preview overlay ─────────────────────────────────────────────────────

function GhostPreview({ mode, snapTarget, worldToScreen, bore, pipe }) {
  if (!snapTarget) return null;
  if (!["valve", "flange", "fvf", "reducer"].includes(mode)) return null;
  const s = worldToScreen(snapTarget.point);

  let rotDeg = 0;
  if (pipe?.start && pipe?.end) {
    const dx = pipe.end[0] - pipe.start[0];
    const dy = pipe.end[1] - pipe.start[1];
    rotDeg = Math.atan2(-dy, dx) * 180 / Math.PI;
  }
  const rot = `rotate(${rotDeg},${s.x},${s.y})`;

  if (mode === "valve") {
    return (
      <g transform={rot} pointerEvents="none" opacity="0.4">
        <polygon points={`${s.x - 9},${s.y - 6} ${s.x - 9},${s.y + 6} ${s.x},${s.y}`} fill="#92400e" />
        <polygon points={`${s.x + 9},${s.y - 6} ${s.x + 9},${s.y + 6} ${s.x},${s.y}`} fill="#92400e" />
      </g>
    );
  }
  if (mode === "flange") {
    return (
      <g transform={rot} pointerEvents="none" opacity="0.4">
        <rect x={s.x - 2} y={s.y - 6} width={4} height={12} fill="#92400e" />
      </g>
    );
  }
  if (mode === "fvf") {
    return (
      <g transform={rot} pointerEvents="none" opacity="0.4">
        <rect x={s.x - 9 - 3 - 3} y={s.y - 6} width={3} height={12} fill="#92400e" />
        <polygon points={`${s.x - 9},${s.y - 6} ${s.x - 9},${s.y + 6} ${s.x},${s.y}`} fill="#92400e" />
        <polygon points={`${s.x + 9},${s.y - 6} ${s.x + 9},${s.y + 6} ${s.x},${s.y}`} fill="#92400e" />
        <rect x={s.x + 9 + 3} y={s.y - 6} width={3} height={12} fill="#92400e" />
      </g>
    );
  }
  if (mode === "reducer") {
    return (
      <g transform={rot} pointerEvents="none" opacity="0.4">
        <polygon
          points={`${s.x - 10},${s.y - 8} ${s.x + 10},${s.y - 4} ${s.x + 10},${s.y + 4} ${s.x - 10},${s.y + 8}`}
          fill="#4338ca"
        />
      </g>
    );
  }
  return null;
}

// ── Fitting HUD ───────────────────────────────────────────────────────────────

function FittingHUD({
  mode, snapTarget, cursorScreen, bore,
  valveLen, setValveLen, valveWeight, setValveWeight, valveSkey, setValveSkey,
  flangeLen, setFlangeLen, flangeWeight, setFlangeWeight, flangeSkey, setFlangeSkey,
  supportName, setSupportName,
  reducerBore2, setReducerBore2, reducerType, setReducerType, reducerSkey, setReducerSkey,
}) {
  const showModes = ["support", "valve", "flange", "fvf", "reducer"];
  if (!showModes.includes(mode) || !snapTarget) return null;

  const style = {
    position: "absolute",
    left: Math.min(cursorScreen.x + 16, cursorScreen.containerWidth - 260),
    top: Math.max(cursorScreen.y - 90, 4),
    zIndex: 30,
    background: "rgba(15,23,42,0.92)",
    color: "#e2e8f0",
    borderRadius: "10px",
    padding: "8px 12px",
    fontSize: "11px",
    minWidth: "220px",
    maxWidth: "280px",
    pointerEvents: "auto",
    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
  };

  const distLabel = snapTarget.snapType === "endpoint" ? "endpoint" :
    snapTarget.snapType === "midpoint" ? "midpoint" : "nearest";

  return (
    <div style={style}>
      <div style={{ color: "#94a3b8", marginBottom: 6, fontSize: 10 }}>
        Snap: {snapTarget.point[0].toFixed(1)}, {snapTarget.point[1].toFixed(1)} [{distLabel}]
      </div>

      {mode === "support" && (
        <div className="flex items-center gap-1">
          <span style={{ color: "#94a3b8" }}>Name:</span>
          <input
            value={supportName} onChange={e => setSupportName(e.target.value)}
            style={inputStyle} />
        </div>
      )}

      {mode === "valve" && (
        <div className="space-y-1">
          <HudRow label="Len" unit="mm" value={valveLen} onChange={e => setValveLen(e.target.value)} type="number" />
          <HudRow label="Wt"  unit="kg" value={valveWeight} onChange={e => setValveWeight(e.target.value)} />
          <HudRow label="SKEY" value={valveSkey} onChange={e => setValveSkey(e.target.value)} />
        </div>
      )}

      {mode === "flange" && (
        <div className="space-y-1">
          <HudRow label="Len" unit="mm" value={flangeLen} onChange={e => setFlangeLen(e.target.value)} type="number" />
          <HudRow label="Wt"  unit="kg" value={flangeWeight} onChange={e => setFlangeWeight(e.target.value)} />
          <HudRow label="SKEY" value={flangeSkey} onChange={e => setFlangeSkey(e.target.value)} />
        </div>
      )}

      {mode === "fvf" && (
        <div className="space-y-1">
          <div style={{ color: "#94a3b8" }}>
            Valve ({Number(valveLen) || 500}mm) + Flange ({Number(flangeLen) || 100}mm)×2
            = {(Number(valveLen) || 500) + (Number(flangeLen) || 100) * 2}mm total
          </div>
        </div>
      )}

      {mode === "reducer" && (
        <div className="space-y-1">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#94a3b8", width: 36 }}>⌀1:</span>
            <span style={{ color: "#cbd5e1" }}>{bore}mm <span style={{ color: "#475569" }}>(pipe)</span></span>
          </div>
          <HudRow label="⌀2" unit="mm" value={reducerBore2} onChange={e => setReducerBore2(e.target.value)} type="number" />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#94a3b8", width: 36 }}>Type:</span>
            <select
              value={reducerType} onChange={e => setReducerType(e.target.value)}
              style={{ ...inputStyle, width: 120 }}>
              <option value="concentric">Concentric</option>
              <option value="eccentric">Eccentric</option>
            </select>
          </div>
          <HudRow label="SKEY" value={reducerSkey} onChange={e => setReducerSkey(e.target.value)} />
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  background: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 5,
  color: "#e2e8f0",
  fontSize: 11,
  padding: "2px 6px",
  width: 80,
  outline: "none",
};

function HudRow({ label, unit, value, onChange, type = "text" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ color: "#94a3b8", width: 36, flexShrink: 0 }}>{label}:</span>
      <input type={type} value={value} onChange={onChange} style={{ ...inputStyle, width: 80 }} />
      {unit && <span style={{ color: "#475569" }}>{unit}</span>}
    </div>
  );
}

// ── Support cross ─────────────────────────────────────────────────────────────

function drawSupportCross(point, worldToScreen, selected, hovered, color = "#16a34a") {
  const c = worldToScreen(point);
  const size  = selected ? 9 : hovered ? 8 : 7;
  const width = selected ? 3.2 : hovered ? 2.8 : 2.4;
  return (
    <g>
      <line x1={c.x - size} y1={c.y} x2={c.x + size} y2={c.y} stroke={color} strokeWidth={width} strokeLinecap="round" />
      <line x1={c.x} y1={c.y - size} x2={c.x} y2={c.y + size} stroke={color} strokeWidth={width} strokeLinecap="round" />
    </g>
  );
}

// ── Main CanvasViewport ───────────────────────────────────────────────────────

export default function CoorCanvas_CanvasViewport({
  viewport, setViewport,
  mode, setMode,
  emits, setEmits,
  finalElements, baseElements,
  allSupports, manualSupports, setManualSupports,
  placedFittings, setPlacedFittings,
  selectedIds, setSelectedIds,
  hoveredId, setHoveredId,
  draftEmit, setDraftEmit,
  snapTarget, setSnapTarget,
  marqueeRect, setMarqueeRect,
  statusText, setStatusText,
  bore,
  sceneBounds,
  showGrid, gridLines,
  showDimensions,
  previewPoints,
  canvasSize, setCanvasSize,
  emitHits,
  supportName, setSupportName,
  supportGuidPrefix,
  valveLen, setValveLen,
  valveWeight, setValveWeight,
  flangeLen, setFlangeLen,
  flangeWeight, setFlangeWeight,
  valveSkey, setValveSkey,
  flangeSkey, setFlangeSkey,
  reducerBore2, setReducerBore2,
  reducerType, setReducerType,
  reducerSkey, setReducerSkey,
  reducerLen, setReducerLen,
  fittingProps,
  fitToBounds, centerOnBounds, zoomBy,
  screenToWorld, worldToScreen,
  handleSelect,
  resetDemo,
  selectedBounds,
  expandBounds,
  placedFittingsCount,
}) {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const panRef = useRef(null);
  const dragFittingRef = useRef(null);
  const [cursorScreen, setCursorScreen] = useState({ x: 0, y: 0, containerWidth: 1000 });

  // ── Resize observer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width, height });
      }
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [setCanvasSize]);

  // ── Non-passive wheel zoom ──────────────────────────────────────────────────
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1.1 : 0.9, [e.clientX - rect.left, e.clientY - rect.top]);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [zoomBy]);

  // ── Cursor tracking helper ─────────────────────────────────────────────────
  const updateHover = (clientX, clientY) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const world = screenToWorld(sx, sy);
    const toleranceWorld = 12 / viewport.scale;

    setHoveredId(inferHoverId(world, emits, finalElements, allSupports, toleranceWorld));

    const placementModes = ["emit", "support", "valve", "flange", "fvf", "reducer"];
    if (placementModes.includes(mode)) {
      setSnapTarget(findPipeSnap(world, baseElements, toleranceWorld));
    } else {
      setSnapTarget(null);
    }

    setStatusText(`X ${world[0].toFixed(1)}  Y ${world[1].toFixed(1)}  Scale ${viewport.scale.toFixed(4)}`);

    const wrapRect = wrapRef.current?.getBoundingClientRect();
    if (wrapRect) {
      setCursorScreen({ x: clientX - wrapRect.left, y: clientY - wrapRect.top, containerWidth: wrapRect.width });
    }
  };

  // ── Event handlers ─────────────────────────────────────────────────────────

  const onPointerDown = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);
    const toleranceWorld = 12 / viewport.scale;

    if (mode === "support") {
      const snap = snapTarget || findPipeSnap(world, baseElements, toleranceWorld);
      if (snap) {
        const nextIndex = manualSupports.length + 1;
        setManualSupports((prev) => [
          ...prev,
          {
            id: `ms-${Date.now()}`,
            refNo: `MANUAL/${supportName}${String(nextIndex).padStart(3, "0")}`,
            point: snap.point,
            name: supportName,
            guid: `${supportGuidPrefix}M${String(nextIndex).padStart(5, "0")}.1`,
            source: "manual",
          },
        ]);
      }
      return;
    }

    if (mode === "reducer") {
      const snap = snapTarget || findPipeSnap(world, baseElements, toleranceWorld);
      if (snap) {
        const reducerTypeFinal = reducerType || "concentric";
        const skeyFinal = reducerSkey || (reducerTypeFinal === "eccentric" ? "REBW" : "RCON");
        setPlacedFittings((prev) => [
          ...prev,
          {
            id: `fit-${Date.now()}`,
            type: "reducer",
            pipeIndex: snap.pipeIndex,
            point: snap.point,
            length: Number(reducerLen) || 300,
            upstreamBore: bore,
            downstreamBore: Number(reducerBore2) || 200,
            reducerType: reducerTypeFinal,
            skey: skeyFinal,
          },
        ]);
      }
      return;
    }

    if (mode === "valve" || mode === "flange" || mode === "fvf") {
      const snap = snapTarget || findPipeSnap(world, baseElements, toleranceWorld);
      if (snap) {
        if (mode === "fvf") {
          setPlacedFittings((prev) => [
            ...prev,
            {
              id: `fit-${Date.now()}`, type: "fvf",
              pipeIndex: snap.pipeIndex, point: snap.point,
              length: (Number(flangeLen) || 100) * 2 + (Number(valveLen) || 500),
              flangeLen: Number(flangeLen) || 100,
              valveLen: Number(valveLen) || 500,
              flangeWeight, valveWeight,
              flangeSkey: flangeSkey || fittingProps?.flangeSkey || "FLWN",
              valveSkey:  valveSkey  || fittingProps?.valveSkey  || "VLBT",
            },
          ]);
        } else {
          const isValve = mode === "valve";
          const len  = isValve ? valveLen  : flangeLen;
          const wt   = isValve ? valveWeight : flangeWeight;
          const skey = isValve
            ? (valveSkey  || fittingProps?.valveSkey  || "VLBT")
            : (flangeSkey || fittingProps?.flangeSkey || "FLWN");
          setPlacedFittings((prev) => [
            ...prev,
            { id: `fit-${Date.now()}`, type: mode, pipeIndex: snap.pipeIndex, point: snap.point, length: Number(len) || 0, weight: wt, skey },
          ]);
        }
      }
      return;
    }

    if (mode === "select") {
      // 1. Check direct hit on placed fittings
      const hitFitting = placedFittings.find((f) => dist(world, f.point) <= toleranceWorld);
      if (hitFitting) {
        handleSelect(`fitting:${hitFitting.id}`, e.shiftKey || e.metaKey);
        dragFittingRef.current = hitFitting.id;
        return;
      }
      // 2. Tolerance-based hit detection on pipe/bend/emit/support
      const hoverHit = inferHoverId(world, emits, finalElements, allSupports, toleranceWorld);
      if (hoverHit) {
        handleSelect(hoverHit, e.shiftKey || e.metaKey);
        return;
      }
      // 3. Clicked empty space — clear selection & start pan
      if (!e.shiftKey && !e.metaKey) setSelectedIds([]);
      panRef.current = { sx: e.clientX, sy: e.clientY, tx: viewport.tx, ty: viewport.ty };
      return;
    }

    if (mode === "emit") {
      setDraftEmit({ p1: world, p2: world });
      return;
    }

    if (mode === "marquee") {
      setMarqueeRect({ x1: sx, y1: sy, x2: sx, y2: sy });
      return;
    }

    // pan mode — always start pan
    panRef.current = { sx: e.clientX, sy: e.clientY, tx: viewport.tx, ty: viewport.ty };
  };

  const onPointerMove = (e) => {
    updateHover(e.clientX, e.clientY);
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    if (draftEmit) { setDraftEmit((prev) => ({ ...prev, p2: world })); return; }
    if (marqueeRect) { setMarqueeRect((prev) => ({ ...prev, x2: sx, y2: sy })); return; }

    if (dragFittingRef.current) {
      const snap = findPipeSnap(world, baseElements, 20 / viewport.scale);
      if (snap) {
        setPlacedFittings((prev) => prev.map((f) =>
          f.id === dragFittingRef.current ? { ...f, point: snap.point, pipeIndex: snap.pipeIndex } : f,
        ));
      }
      return;
    }

    if (panRef.current) {
      const dx = e.clientX - panRef.current.sx;
      const dy = e.clientY - panRef.current.sy;
      setViewport((v) => ({ ...v, tx: panRef.current.tx + dx, ty: panRef.current.ty + dy }));
    }
  };

  const onPointerUp = () => {
    dragFittingRef.current = null;
    if (draftEmit) {
      if (dist(draftEmit.p1, draftEmit.p2) > 10 / viewport.scale) {
        setEmits((prev) => [...prev, { id: `e${Date.now()}`, p1: draftEmit.p1, p2: draftEmit.p2 }]);
      }
      setDraftEmit(null);
      return;
    }
    if (marqueeRect) {
      const minX = Math.min(marqueeRect.x1, marqueeRect.x2);
      const minY = Math.min(marqueeRect.y1, marqueeRect.y2);
      const maxX = Math.max(marqueeRect.x1, marqueeRect.x2);
      const maxY = Math.max(marqueeRect.y1, marqueeRect.y2);
      if (maxX - minX > 12 && maxY - minY > 12) {
        const w1 = screenToWorld(minX, maxY);
        const w2 = screenToWorld(maxX, minY);
        fitToBounds({ minX: w1[0], minY: w1[1], maxX: w2[0], maxY: w2[1], width: Math.max(1, w2[0] - w1[0]), height: Math.max(1, w2[1] - w1[1]) });
      }
      setMarqueeRect(null);
      if (mode === "marquee") setMode("select");
      return;
    }
    panRef.current = null;
  };

  const cursorClass = mode === "emit" || mode === "support" || mode === "marquee"
    ? "cursor-crosshair"
    : mode === "pan" ? "cursor-grab active:cursor-grabbing"
    : "cursor-default";

  const marqueeStyle = marqueeRect ? {
    x: Math.min(marqueeRect.x1, marqueeRect.x2),
    y: Math.min(marqueeRect.y1, marqueeRect.y2),
    width: Math.abs(marqueeRect.x2 - marqueeRect.x1),
    height: Math.abs(marqueeRect.y2 - marqueeRect.y1),
  } : null;

  const isPlacementMode = ["emit", "support", "valve", "flange", "fvf", "reducer"].includes(mode);

  // Snap target pipe (for ghost preview rotation)
  const snapPipe = snapTarget?.pipeIndex != null ? baseElements[snapTarget.pipeIndex] : null;

  return (
    <div ref={wrapRef} className="relative h-[76vh] min-h-[620px] bg-white">
      {/* Top-left controls */}
      <div className="absolute left-4 top-4 z-20 flex flex-wrap gap-2 rounded-2xl border bg-white/90 p-2 shadow-sm backdrop-blur">
        <Button size="sm" variant="outline" className="rounded-xl" onClick={resetDemo}>
          <RefreshCcw className="mr-2 h-4 w-4" /> Reset
        </Button>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setMode("marquee")}>
          <ScanSearch className="mr-2 h-4 w-4" /> Marquee zoom
        </Button>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setMode("pan")}>
          <Move className="mr-2 h-4 w-4" /> Pan
        </Button>
      </div>

      {/* Top-right badges */}
      <div className="absolute right-4 top-4 z-20 flex flex-wrap gap-2">
        <Badge variant="secondary" className="rounded-full px-3 py-1.5">Mode: {mode}</Badge>
        <Badge variant="secondary" className="rounded-full px-3 py-1.5">Emits: {emits.length}</Badge>
        <Badge variant="secondary" className="rounded-full px-3 py-1.5">Supports: {allSupports.length}</Badge>
        {placedFittingsCount > 0 && (
          <Badge variant="secondary" className="rounded-full px-3 py-1.5" style={{ backgroundColor: "#92400e", color: "#fff" }}>
            Fittings: {placedFittingsCount}
          </Badge>
        )}
        <Badge variant="secondary" className="rounded-full px-3 py-1.5">Selected: {selectedIds.length}</Badge>
      </div>

      {/* Fitting HUD */}
      <FittingHUD
        mode={mode} snapTarget={snapTarget} cursorScreen={cursorScreen} bore={bore}
        valveLen={valveLen} setValveLen={setValveLen}
        valveWeight={valveWeight} setValveWeight={setValveWeight}
        valveSkey={valveSkey} setValveSkey={setValveSkey}
        flangeLen={flangeLen} setFlangeLen={setFlangeLen}
        flangeWeight={flangeWeight} setFlangeWeight={setFlangeWeight}
        flangeSkey={flangeSkey} setFlangeSkey={setFlangeSkey}
        supportName={supportName} setSupportName={setSupportName}
        reducerBore2={reducerBore2} setReducerBore2={setReducerBore2}
        reducerType={reducerType} setReducerType={setReducerType}
        reducerSkey={reducerSkey} setReducerSkey={setReducerSkey}
      />

      {/* SVG canvas */}
      <svg
        ref={svgRef}
        className={`h-full w-full ${cursorClass}`}
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={() => { onPointerUp(); setHoveredId(null); setSnapTarget(null); }}
      >
        <rect x="0" y="0" width={canvasSize.width} height={canvasSize.height} fill="#ffffff" />

        {/* Grid */}
        <g>
          {gridLines.map((g, idx) => {
            if (g.kind === "v") {
              const p1 = worldToScreen([g.value, sceneBounds.minY]);
              const p2 = worldToScreen([g.value, sceneBounds.maxY]);
              return <line key={`gv-${idx}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#eef2f7" strokeWidth="1" />;
            }
            const p1 = worldToScreen([sceneBounds.minX, g.value]);
            const p2 = worldToScreen([sceneBounds.maxX, g.value]);
            return <line key={`gh-${idx}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#eef2f7" strokeWidth="1" />;
          })}
        </g>

        {/* Pipes and bends */}
        <g>
          {finalElements.map((elem, idx) => {
            const selected = selectedIds.includes(`${elem.kind === "PIPE" ? "pipe" : "bend"}:${idx}`);
            const hovered  = hoveredId === `${elem.kind === "PIPE" ? "pipe" : "bend"}:${idx}`;
            if (elem.kind === "PIPE") {
              const a   = worldToScreen(elem.start);
              const b   = worldToScreen(elem.end);
              const mid = worldToScreen([(elem.start[0] + elem.end[0]) / 2, (elem.start[1] + elem.end[1]) / 2]);
              return (
                <g key={`pipe-${idx}`}>
                  <line
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={selected ? "#0f172a" : hovered ? "#1d4ed8" : "#2563eb"}
                    strokeWidth={selected ? 8 : hovered ? 7 : 5}
                    strokeLinecap="round"
                  />
                  {showDimensions && (
                    <text x={mid.x + 8} y={mid.y - 8} className="fill-slate-500 text-[11px]">
                      {dist(elem.start, elem.end).toFixed(0)}
                    </text>
                  )}
                </g>
              );
            }
            // BEND
            const p1 = worldToScreen(elem.ep1);
            const p2 = worldToScreen(elem.ep2);
            const cp = worldToScreen(elem.cp);
            return (
              <g key={`bend-${idx}`}>
                <path
                  d={`M ${p1.x} ${p1.y} Q ${cp.x} ${cp.y} ${p2.x} ${p2.y}`}
                  fill="none"
                  stroke={selected ? "#9a3412" : hovered ? "#ea580c" : "#f97316"}
                  strokeWidth={selected ? 7 : hovered ? 6 : 4}
                  strokeLinecap="round"
                />
                <circle
                  cx={cp.x} cy={cp.y}
                  r={selected ? 5.5 : hovered ? 5 : 3.5}
                  fill={selected ? "#9a3412" : hovered ? "#ea580c" : "#fb923c"}
                />
              </g>
            );
          })}
        </g>

        {/* Emits */}
        <g>
          {emits.map((emit, idx) => {
            const a = worldToScreen(emit.p1);
            const b = worldToScreen(emit.p2);
            const hit = emitHits[idx];
            const selected = selectedIds.includes(`emit:${emit.id}`);
            const hovered  = hoveredId === `emit:${emit.id}`;
            const stroke   = hit
              ? (selected ? "#166534" : hovered ? "#15803d" : "#16a34a")
              : (selected ? "#991b1b" : hovered ? "#dc2626" : "#ef4444");
            return (
              <g key={emit.id}>
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={stroke}
                  strokeWidth={selected ? 5 : hovered ? 4 : 3}
                  strokeDasharray={hit ? "10 6" : "7 5"}
                  strokeLinecap="round"
                />
                <circle cx={a.x} cy={a.y} r={selected ? 5.5 : hovered ? 5 : 4} fill={stroke} />
                <circle cx={b.x} cy={b.y} r={selected ? 5.5 : hovered ? 5 : 4} fill={stroke} />
                {hit && (() => {
                  const hp = worldToScreen(hit.hitPoint);
                  return <circle cx={hp.x} cy={hp.y} r={selected ? 7 : hovered ? 6 : 5} fill="#f59e0b" stroke="#fff" strokeWidth="2" />;
                })()}
              </g>
            );
          })}
          {draftEmit && (() => {
            const a = worldToScreen(draftEmit.p1);
            const b = worldToScreen(draftEmit.p2);
            return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0f172a" strokeWidth={3} strokeDasharray="8 6" />;
          })()}
        </g>

        {/* Supports */}
        <g>
          {allSupports.map((support) => {
            const selected = selectedIds.includes(`support:${support.id}`);
            const hovered  = hoveredId === `support:${support.id}`;
            return (
              <g key={support.id}>
                {drawSupportCross(support.point, worldToScreen, selected, hovered, support.source === "emit" ? "#16a34a" : "#22c55e")}
              </g>
            );
          })}
        </g>

        {/* Placed fittings */}
        <g>
          {placedFittings.map((f) => {
            const s        = worldToScreen(f.point);
            const selected = selectedIds.includes(`fitting:${f.id}`);
            const color    = selected ? "#b45309" : "#92400e";
            const hw = selected ? 11 : 9;
            const hh = selected ? 8 : 6;

            const pipe = f.pipeIndex != null ? baseElements[f.pipeIndex] : null;
            let rotDeg = 0;
            if (pipe?.start && pipe?.end) {
              const dx = pipe.end[0] - pipe.start[0];
              const dy = pipe.end[1] - pipe.start[1];
              rotDeg = Math.atan2(-dy, dx) * 180 / Math.PI;
            }
            const rot = `rotate(${rotDeg},${s.x},${s.y})`;

            if (f.type === "valve") {
              return (
                <g key={f.id} transform={rot}>
                  <polygon points={`${s.x - hw},${s.y - hh} ${s.x - hw},${s.y + hh} ${s.x},${s.y}`} fill={color} />
                  <polygon points={`${s.x + hw},${s.y - hh} ${s.x + hw},${s.y + hh} ${s.x},${s.y}`} fill={color} />
                  {selected && <circle cx={s.x} cy={s.y} r={hw + 3} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4 3" />}
                </g>
              );
            }
            if (f.type === "fvf") {
              const flw = 3, gap = 3;
              return (
                <g key={f.id} transform={rot}>
                  <rect x={s.x - hw - gap - flw} y={s.y - hh} width={flw} height={hh * 2} fill={color} />
                  <polygon points={`${s.x - hw},${s.y - hh} ${s.x - hw},${s.y + hh} ${s.x},${s.y}`} fill={color} />
                  <polygon points={`${s.x + hw},${s.y - hh} ${s.x + hw},${s.y + hh} ${s.x},${s.y}`} fill={color} />
                  <rect x={s.x + hw + gap} y={s.y - hh} width={flw} height={hh * 2} fill={color} />
                  {selected && <rect x={s.x - hw - gap - flw - 2} y={s.y - hh - 2} width={(hw + gap + flw) * 2 + 4} height={hh * 2 + 4} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4 3" />}
                </g>
              );
            }
            if (f.type === "reducer") {
              const rColor = selected ? "#3730a3" : "#4338ca";
              const bh = selected ? 10 : 8;
              const th = selected ? 5 : 4;
              return (
                <g key={f.id} transform={rot}>
                  <polygon
                    points={`${s.x - hw},${s.y - bh} ${s.x + hw},${s.y - th} ${s.x + hw},${s.y + th} ${s.x - hw},${s.y + bh}`}
                    fill={rColor} opacity="0.9"
                  />
                  {selected && <rect x={s.x - hw - 2} y={s.y - bh - 2} width={hw * 2 + 4} height={bh * 2 + 4} fill="none" stroke={rColor} strokeWidth="1.5" strokeDasharray="4 3" />}
                </g>
              );
            }
            // flange
            return (
              <g key={f.id} transform={rot}>
                <rect x={s.x - 2} y={s.y - hh} width={4} height={hh * 2} fill={color} />
                {selected && <rect x={s.x - hw - 2} y={s.y - hh - 2} width={hw * 2 + 4} height={hh * 2 + 4} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4 3" />}
              </g>
            );
          })}
        </g>

        {/* OSnap marker (typed by snapType) */}
        {isPlacementMode && snapTarget && (
          <OSnapMarker snapTarget={snapTarget} worldToScreen={worldToScreen} />
        )}

        {/* Ghost preview overlay */}
        {isPlacementMode && snapTarget && (
          <GhostPreview mode={mode} snapTarget={snapTarget} worldToScreen={worldToScreen} bore={bore} pipe={snapPipe} />
        )}

        {/* Marquee */}
        {marqueeStyle && (
          <rect x={marqueeStyle.x} y={marqueeStyle.y} width={marqueeStyle.width} height={marqueeStyle.height} fill="rgba(59,130,246,0.10)" stroke="#3b82f6" strokeDasharray="6 4" />
        )}

        {/* Preview support-coordinate points (cyan) */}
        <g pointerEvents="none">
          {previewPoints.map((pt, i) => {
            const s = worldToScreen(pt);
            return (
              <g key={`prev-${i}`}>
                <circle cx={s.x} cy={s.y} r={7} fill="#06b6d4" opacity={0.85} />
                <circle cx={s.x} cy={s.y} r={10} fill="none" stroke="#06b6d4" strokeWidth="1.5" opacity={0.5} />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
