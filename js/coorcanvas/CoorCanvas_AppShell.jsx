/**
 * CoorCanvas_AppShell.jsx
 * Root layout for the CoorCanvas workspace.
 * Holds all state and wires together: CanvasViewport, PropertyPanel, StatusBar.
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  Focus, Maximize2, MousePointer2, Move, PencilLine,
  ScanSearch, ShieldPlus, ZoomIn, ZoomOut, Grid3X3, Ruler,
} from "lucide-react";
import { Button }    from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";

import {
  buildBaseElements, computeEmitHits, applyEmitCuts, buildAutoSupports, mergeSupports,
  boundsFromPoints, expandBounds, combineBounds, getElementPoints, getEmitBounds,
} from "./CoorCanvas_GeometryUtils.js";
import { emitPCF } from "./CoorCanvas_ExportService.js";

import CoorCanvas_CanvasViewport from "./CoorCanvas_CanvasViewport.jsx";
import CoorCanvas_StatusBar       from "./CoorCanvas_StatusBar.jsx";
import CoorCanvas_PropertyPanel   from "./CoorCanvas_PropertyPanel.jsx";

// ── Default data ───────────────────────────────────────────────────────────────

const DEFAULT_ROUTE = [
  [0, 0], [0, 13000], [8000, 13000], [8000, 6000],
  [2000, 6000], [2000, -2000], [11000, -2000], [11000, 9000], [16000, 9000],
];
const DEFAULT_EMITS = [
  { id: "e1", p1: [-600, 4000],  p2: [800, 4000] },
  { id: "e2", p1: [700, 10000],  p2: [-600, 10000] },
  { id: "e3", p1: [4000, 12400], p2: [4000, 13200] },
  { id: "e4", p1: [8600, 9500],  p2: [7600, 9500] },
  { id: "e5", p1: [5000, 5400],  p2: [5000, 6200] },
  { id: "e6", p1: [1400, 2000],  p2: [2400, 2000] },
];
const HEADER = `ISOGEN-FILES ISOGEN.FLS
UNITS-BORE MM
UNITS-CO-ORDS MM
UNITS-WEIGHT KGS
UNITS-BOLT-DIA MM
UNITS-BOLT-LENGTH MM
PIPELINE-REFERENCE PIPLINELOOP
    PROJECT-IDENTIFIER P1
    AREA A1`;

// ── Inline SVG icons ───────────────────────────────────────────────────────────

const ValveIcon   = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="#92400e"><polygon points="1,3 8,8 1,13" /><polygon points="15,3 8,8 15,13" /></svg>;
const FlangeIcon  = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="#92400e"><rect x="6" y="2" width="4" height="12" /></svg>;
const FvfIcon     = () => <svg width="24" height="16" viewBox="0 0 24 16" fill="#92400e"><rect x="1" y="3" width="3" height="10" /><polygon points="5,3 11,8 5,13" /><polygon points="19,3 13,8 19,13" /><rect x="20" y="3" width="3" height="10" /></svg>;
const ReducerIcon = () => <svg width="20" height="16" viewBox="0 0 20 16" fill="#4338ca"><polygon points="0,2 20,5 20,11 0,14" /></svg>;

const modeMeta = {
  select:  { label: "Select",         icon: MousePointer2 },
  emit:    { label: "Create emit",    icon: PencilLine },
  support: { label: "Place support",  icon: ShieldPlus },
  valve:   { label: "Place valve",    icon: null, IconComponent: ValveIcon },
  flange:  { label: "Place flange",   icon: null, IconComponent: FlangeIcon },
  fvf:     { label: "Place FVF",      icon: null, IconComponent: FvfIcon },
  reducer: { label: "Place reducer",  icon: null, IconComponent: ReducerIcon },
  marquee: { label: "Marquee zoom",   icon: ScanSearch },
  pan:     { label: "Pan",            icon: Move },
};

// ── AppShell component ─────────────────────────────────────────────────────────

export default function CoorCanvas_AppShell({
  externalRoute    = null,
  externalEmits    = null,
  previewPoints    = [],
  onEmitsChange    = null,
  externalFittings = null,
  onFittingsChange = null,
  fittingProps     = null,
}) {
  // ── Route / project state ──────────────────────────────────────────────────
  const initRoute = (externalRoute ?? DEFAULT_ROUTE).map((p, idx) => ({ id: `r${idx + 1}`, x: String(p[0]), y: String(p[1]) }));
  const [routeRows, setRouteRows] = useState(initRoute);
  const [boreText, setBoreText]   = useState("250");
  const [headerText, setHeaderText] = useState(HEADER);
  const [roundToMm, setRoundToMm]   = useState(false);
  const [showGrid, setShowGrid]       = useState(true);
  const [showDimensions, setShowDimensions] = useState(false);

  // ── Canvas state ────────────────────────────────────────────────────────────
  const [mode, setMode]               = useState("select");
  const [emits, setEmits]             = useState(externalEmits ?? DEFAULT_EMITS);
  const [manualSupports, setManualSupports] = useState([]);
  const [placedFittings, setPlacedFittings] = useState(externalFittings ?? []);

  // ── Fitting toolbar state ───────────────────────────────────────────────────
  const [valveLen, setValveLen]       = useState(500);
  const [valveWeight, setValveWeight] = useState("");
  const [valveSkey, setValveSkey]     = useState(fittingProps?.valveSkey  || "VLBT");
  const [flangeLen, setFlangeLen]     = useState(100);
  const [flangeWeight, setFlangeWeight] = useState("");
  const [flangeSkey, setFlangeSkey]   = useState(fittingProps?.flangeSkey || "FLWN");

  // ── Reducer state ───────────────────────────────────────────────────────────
  const [reducerBore2, setReducerBore2] = useState(200);
  const [reducerType, setReducerType]   = useState("concentric");
  const [reducerSkey, setReducerSkey]   = useState("RCON");
  const [reducerLen, setReducerLen]     = useState(300);

  // ── Support state ───────────────────────────────────────────────────────────
  const [supportName, setSupportName]               = useState("CA150");
  const [supportGuidPrefix, setSupportGuidPrefix]   = useState("UCI:PS");

  // ── UI state ────────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState([]);
  const [hoveredId, setHoveredId]     = useState(null);
  const [draftEmit, setDraftEmit]     = useState(null);
  const [snapTarget, setSnapTarget]   = useState(null);
  const [marqueeRect, setMarqueeRect] = useState(null);
  const [statusText, setStatusText]   = useState("Ready");
  const [viewport, setViewport]       = useState({ scale: 0.08, tx: 120, ty: 380 });
  const [copied, setCopied]           = useState(false);
  const [canvasSize, setCanvasSize]   = useState({ width: 1000, height: 680 });

  const bore = Number(boreText) || 250;

  // ── External prop sync ──────────────────────────────────────────────────────
  useEffect(() => {
    if (externalRoute && externalRoute.length >= 2) {
      setRouteRows(externalRoute.map((p, idx) => ({ id: `r${idx + 1}`, x: String(p[0]), y: String(p[1]) })));
      setTimeout(() => setRouteRows((rows) => [...rows]), 0);
    }
  }, [externalRoute]);

  const lastExternalEmitsRef   = useRef(externalEmits);
  const emitCallbackMountedRef = useRef(false);
  useEffect(() => {
    if (externalEmits) { lastExternalEmitsRef.current = externalEmits; setEmits(externalEmits); }
  }, [externalEmits]);
  useEffect(() => {
    if (!emitCallbackMountedRef.current) { emitCallbackMountedRef.current = true; return; }
    if (onEmitsChange && emits !== lastExternalEmitsRef.current) onEmitsChange(emits);
  }, [emits]);

  useEffect(() => { if (externalFittings) setPlacedFittings(externalFittings); }, [externalFittings]);
  const fittingCallbackMountedRef = useRef(false);
  useEffect(() => {
    if (!fittingCallbackMountedRef.current) { fittingCallbackMountedRef.current = true; return; }
    if (onFittingsChange) onFittingsChange(placedFittings);
  }, [placedFittings]);

  // ── Memos ───────────────────────────────────────────────────────────────────
  const routeParse = useMemo(() => {
    try {
      const points = routeRows.map((row) => [Number(row.x), Number(row.y)]);
      if (points.some((p) => Number.isNaN(p[0]) || Number.isNaN(p[1]))) throw new Error("Route table contains invalid numeric values");
      if (points.length < 2) throw new Error("Need at least two route vertices");
      return { ok: true, points, error: "" };
    } catch (err) {
      return { ok: false, points: DEFAULT_ROUTE, error: err.message || "Invalid route table" };
    }
  }, [routeRows]);

  const baseElements  = useMemo(() => buildBaseElements(routeParse.points, bore), [routeParse.points, bore]);
  const emitHits      = useMemo(() => computeEmitHits(emits, baseElements), [emits, baseElements]);
  const finalElements = useMemo(() => applyEmitCuts(baseElements, emitHits), [baseElements, emitHits]);
  const autoSupports  = useMemo(() => buildAutoSupports(emitHits, supportName, supportGuidPrefix), [emitHits, supportName, supportGuidPrefix]);
  const allSupports   = useMemo(() => mergeSupports(autoSupports, manualSupports), [autoSupports, manualSupports]);
  const pcfText       = useMemo(() => emitPCF(finalElements, allSupports, bore, headerText, roundToMm), [finalElements, allSupports, bore, headerText, roundToMm]);

  const sceneBounds = useMemo(() => {
    const baseBounds    = boundsFromPoints(baseElements.flatMap(getElementPoints));
    const emitBds       = combineBounds(emits.map((emit, i) => getEmitBounds(emit, emitHits[i])));
    const supportBounds = boundsFromPoints(allSupports.map((s) => s.point));
    return expandBounds(combineBounds([baseBounds, emitBds, supportBounds]), 600);
  }, [baseElements, emits, emitHits, allSupports]);

  const selectedBounds = useMemo(() => {
    if (!selectedIds.length) return null;
    const bounds = [];
    selectedIds.forEach((id) => {
      if (id.startsWith("emit:")) {
        const emitId = id.split(":")[1];
        const index  = emits.findIndex((e) => e.id === emitId);
        if (index >= 0) bounds.push(getEmitBounds(emits[index], emitHits[index]));
      }
      if (id.startsWith("pipe:") || id.startsWith("bend:")) {
        const index = Number(id.split(":")[1]);
        const elem  = finalElements[index];
        if (elem) bounds.push(boundsFromPoints(getElementPoints(elem)));
      }
      if (id.startsWith("support:")) {
        const supportId = id.split(":")[1];
        const support   = allSupports.find((s) => s.id === supportId);
        if (support) bounds.push(boundsFromPoints([support.point]));
      }
    });
    return combineBounds(bounds);
  }, [selectedIds, emits, emitHits, finalElements, allSupports]);

  // ── View helpers ────────────────────────────────────────────────────────────
  const worldToScreen = useCallback(
    (p) => ({ x: p[0] * viewport.scale + viewport.tx, y: -p[1] * viewport.scale + viewport.ty }),
    [viewport],
  );
  const screenToWorld = useCallback(
    (sx, sy) => [(sx - viewport.tx) / viewport.scale, -(sy - viewport.ty) / viewport.scale],
    [viewport],
  );
  const fitToBounds = useCallback((b) => {
    if (!b || !canvasSize.width || !canvasSize.height) return;
    const pad = 52;
    const sx  = (canvasSize.width - pad * 2) / b.width;
    const sy  = (canvasSize.height - pad * 2) / b.height;
    const scale = Math.max(0.001, Math.min(sx, sy));
    const tx = (canvasSize.width - b.width * scale) / 2 - b.minX * scale;
    const ty = (canvasSize.height - b.height * scale) / 2 + b.maxY * scale;
    setViewport({ scale, tx, ty });
  }, [canvasSize]);
  const centerOnBounds = useCallback((b) => {
    if (!b || !canvasSize.width || !canvasSize.height) return;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    setViewport((v) => ({ ...v, tx: canvasSize.width / 2 - cx * v.scale, ty: canvasSize.height / 2 + cy * v.scale }));
  }, [canvasSize]);
  const zoomBy = useCallback((factor, pivot = [canvasSize.width / 2, canvasSize.height / 2]) => {
    const world = screenToWorld(pivot[0], pivot[1]);
    setViewport((v) => {
      const nextScale = Math.max(0.005, Math.min(10, v.scale * factor));
      return { scale: nextScale, tx: pivot[0] - world[0] * nextScale, ty: pivot[1] + world[1] * nextScale };
    });
  }, [canvasSize, screenToWorld]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const emitIds    = new Set(selectedIds.filter((id) => id.startsWith("emit:")).map((id) => id.split(":")[1]));
        const supportIds = new Set(selectedIds.filter((id) => id.startsWith("support:")).map((id) => id.split(":")[1]));
        const fittingIds = new Set(selectedIds.filter((id) => id.startsWith("fitting:")).map((id) => id.split(":")[1]));
        if (emitIds.size || supportIds.size || fittingIds.size) {
          e.preventDefault();
          if (emitIds.size)    setEmits((prev) => prev.filter((em) => !emitIds.has(em.id)));
          if (supportIds.size) setManualSupports((prev) => prev.filter((s) => !supportIds.has(s.id)));
          if (fittingIds.size) setPlacedFittings((prev) => prev.filter((f) => !fittingIds.has(f.id)));
          setSelectedIds((prev) => prev.filter((id) => !id.startsWith("emit:") && !id.startsWith("support:") && !id.startsWith("fitting:")));
        }
      }
      if (e.key.toLowerCase() === "f") fitToBounds(sceneBounds);
      if (e.key.toLowerCase() === "z" && selectedBounds) fitToBounds(expandBounds(selectedBounds, 200));
      if (e.key.toLowerCase() === "c" && selectedBounds) centerOnBounds(selectedBounds);
      if (e.key === "Escape") { setDraftEmit(null); setMarqueeRect(null); setMode("select"); }
      if (e.key === "+" || e.key === "=") zoomBy(1.15);
      if (e.key === "-") zoomBy(0.85);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, selectedBounds, centerOnBounds, fitToBounds, sceneBounds, zoomBy]);

  // ── Auto-fit on first load ─────────────────────────────────────────────────
  useEffect(() => { if (sceneBounds) fitToBounds(sceneBounds); }, [fitToBounds, sceneBounds]);

  // ── Callbacks ──────────────────────────────────────────────────────────────
  const handleSelect = useCallback((id, additive) => {
    setSelectedIds((prev) => additive ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id]);
  }, []);

  const copyPcf = async () => {
    await navigator.clipboard.writeText(pcfText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  // ── Route row helpers ──────────────────────────────────────────────────────
  const addRouteRow = () => {
    const last = routeRows[routeRows.length - 1] || { x: "0", y: "0" };
    setRouteRows((prev) => [...prev, { id: `r${Date.now()}`, x: last.x, y: last.y }]);
  };
  const removeRouteRow = (id) => setRouteRows((prev) => (prev.length <= 2 ? prev : prev.filter((row) => row.id !== id)));
  const updateRouteRow = (id, key, value) => setRouteRows((prev) => prev.map((row) => (row.id === id ? { ...row, [key]: value } : row)));

  const resetDemo = () => {
    setRouteRows(DEFAULT_ROUTE.map((p, idx) => ({ id: `r${idx + 1}`, x: String(p[0]), y: String(p[1]) })));
    setBoreText("250"); setEmits(DEFAULT_EMITS); setManualSupports([]);
    setSupportName("CA150"); setSupportGuidPrefix("UCI:PS");
    setSelectedIds([]); setHoveredId(null); setMode("select");
  };

  // ── Grid lines ──────────────────────────────────────────────────────────────
  const gridLines = useMemo(() => {
    if (!sceneBounds || !showGrid) return [];
    const step = sceneBounds.width > 30000 ? 2000 : sceneBounds.width > 10000 ? 1000 : 500;
    const lines = [];
    const minX = Math.floor(sceneBounds.minX / step) * step;
    const maxX = Math.ceil(sceneBounds.maxX / step) * step;
    const minY = Math.floor(sceneBounds.minY / step) * step;
    const maxY = Math.ceil(sceneBounds.maxY / step) * step;
    for (let x = minX; x <= maxX; x += step) lines.push({ kind: "v", value: x });
    for (let y = minY; y <= maxY; y += step) lines.push({ kind: "h", value: y });
    return lines;
  }, [sceneBounds, showGrid]);

  // ── Reducer type → default SKEY sync ──────────────────────────────────────
  useEffect(() => {
    if (reducerSkey === "RCON" || reducerSkey === "REBW") {
      setReducerSkey(reducerType === "eccentric" ? "REBW" : "RCON");
    }
  }, [reducerType]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-auto bg-slate-100/70 p-4 md:p-6">
      <div className="mx-auto max-w-[1680px] space-y-4">

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border bg-white px-5 py-4 shadow-sm">
          <div>
            <div className="text-2xl font-semibold tracking-tight text-slate-900">Professional Pipe Canvas Workspace</div>
            <div className="text-sm text-slate-500">Toolbar, zoom to selection, marquee zoom, object snap, live emit/support workflow, and dynamic PCF.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(modeMeta).map(([key, meta]) => {
              const Icon = meta.icon;
              const IC   = meta.IconComponent;
              return (
                <React.Fragment key={key}>
                  <Button
                    variant={mode === key ? "default" : "outline"}
                    className="rounded-2xl"
                    onClick={() => setMode(key)}
                  >
                    {IC ? <IC /> : <Icon className="mr-2 h-4 w-4" />}
                    <span className="ml-2">{meta.label}</span>
                  </Button>

                  {key === "valve" && mode === "valve" && (
                    <span className="flex items-center gap-1 text-xs">
                      <label className="text-slate-600">Len</label>
                      <input type="number" value={valveLen} onChange={e => setValveLen(e.target.value)} className="w-16 rounded border px-1 py-0.5 text-xs" placeholder="mm" />
                      <label className="text-slate-600">Wt</label>
                      <input type="text" value={valveWeight} onChange={e => setValveWeight(e.target.value)} className="w-16 rounded border px-1 py-0.5 text-xs" placeholder="kg" />
                      <label className="text-slate-600">SKEY</label>
                      <input type="text" value={valveSkey} onChange={e => setValveSkey(e.target.value)} className="w-16 rounded border px-1 py-0.5 text-xs" />
                    </span>
                  )}
                  {key === "flange" && mode === "flange" && (
                    <span className="flex items-center gap-1 text-xs">
                      <label className="text-slate-600">Len</label>
                      <input type="number" value={flangeLen} onChange={e => setFlangeLen(e.target.value)} className="w-16 rounded border px-1 py-0.5 text-xs" placeholder="mm" />
                      <label className="text-slate-600">Wt</label>
                      <input type="text" value={flangeWeight} onChange={e => setFlangeWeight(e.target.value)} className="w-16 rounded border px-1 py-0.5 text-xs" placeholder="kg" />
                      <label className="text-slate-600">SKEY</label>
                      <input type="text" value={flangeSkey} onChange={e => setFlangeSkey(e.target.value)} className="w-16 rounded border px-1 py-0.5 text-xs" />
                    </span>
                  )}
                  {key === "fvf" && mode === "fvf" && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      uses valve ({Number(valveLen) || 500}mm) + flange ({Number(flangeLen) || 100}mm ×2) = {(Number(valveLen) || 500) + (Number(flangeLen) || 100) * 2}mm total
                    </span>
                  )}
                  {key === "reducer" && mode === "reducer" && (
                    <span className="flex items-center gap-1 text-xs">
                      <label className="text-slate-600">⌀2</label>
                      <input type="number" value={reducerBore2} onChange={e => setReducerBore2(e.target.value)} className="w-16 rounded border px-1 py-0.5 text-xs" placeholder="mm" />
                      <label className="text-slate-600">Len</label>
                      <input type="number" value={reducerLen} onChange={e => setReducerLen(e.target.value)} className="w-16 rounded border px-1 py-0.5 text-xs" placeholder="mm" />
                      <label className="text-slate-600">Type</label>
                      <select value={reducerType} onChange={e => setReducerType(e.target.value)} className="rounded border px-1 py-0.5 text-xs">
                        <option value="concentric">Concentric</option>
                        <option value="eccentric">Eccentric</option>
                      </select>
                      <label className="text-slate-600">SKEY</label>
                      <input type="text" value={reducerSkey} onChange={e => setReducerSkey(e.target.value)} className="w-14 rounded border px-1 py-0.5 text-xs" />
                    </span>
                  )}
                </React.Fragment>
              );
            })}

            <Separator orientation="vertical" className="hidden h-8 sm:block" />
            <Button variant="outline" className="rounded-2xl" onClick={() => fitToBounds(sceneBounds)}>
              <Maximize2 className="mr-2 h-4 w-4" /> Fit
            </Button>
            <Button
              variant="outline" className="rounded-2xl"
              onClick={() => selectedBounds && fitToBounds(expandBounds(selectedBounds, 200))}
              disabled={!selectedBounds}
            >
              <Focus className="mr-2 h-4 w-4" /> Zoom selection
            </Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => centerOnBounds(selectedBounds || sceneBounds)}>
              Ctr
            </Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => zoomBy(1.15)}><ZoomIn className="h-4 w-4" /></Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => zoomBy(0.85)}><ZoomOut className="h-4 w-4" /></Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => setShowGrid((v) => !v)}>
              <Grid3X3 className="mr-2 h-4 w-4" /> {showGrid ? "Hide grid" : "Show grid"}
            </Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => setShowDimensions((v) => !v)}>
              <Ruler className="mr-2 h-4 w-4" /> {showDimensions ? "Hide dims" : "Show dims"}
            </Button>
          </div>
        </div>

        {/* ── Main layout ─────────────────────────────────────────────────── */}
        <div className="grid gap-6 xl:grid-cols-[1.5fr_0.5fr]">
          <Card className="overflow-hidden rounded-3xl border-0 shadow-xl shadow-slate-200/70">
            <CardContent className="p-0">
              <CoorCanvas_CanvasViewport
                viewport={viewport} setViewport={setViewport}
                mode={mode} setMode={setMode}
                emits={emits} setEmits={setEmits}
                finalElements={finalElements} baseElements={baseElements}
                allSupports={allSupports} manualSupports={manualSupports} setManualSupports={setManualSupports}
                placedFittings={placedFittings} setPlacedFittings={setPlacedFittings}
                selectedIds={selectedIds} setSelectedIds={setSelectedIds}
                hoveredId={hoveredId} setHoveredId={setHoveredId}
                draftEmit={draftEmit} setDraftEmit={setDraftEmit}
                snapTarget={snapTarget} setSnapTarget={setSnapTarget}
                marqueeRect={marqueeRect} setMarqueeRect={setMarqueeRect}
                statusText={statusText} setStatusText={setStatusText}
                bore={bore}
                sceneBounds={sceneBounds}
                showGrid={showGrid} gridLines={gridLines}
                showDimensions={showDimensions}
                previewPoints={previewPoints}
                canvasSize={canvasSize} setCanvasSize={setCanvasSize}
                emitHits={emitHits}
                supportName={supportName} setSupportName={setSupportName}
                supportGuidPrefix={supportGuidPrefix}
                valveLen={valveLen} setValveLen={setValveLen}
                valveWeight={valveWeight} setValveWeight={setValveWeight}
                valveSkey={valveSkey} setValveSkey={setValveSkey}
                flangeLen={flangeLen} setFlangeLen={setFlangeLen}
                flangeWeight={flangeWeight} setFlangeWeight={setFlangeWeight}
                flangeSkey={flangeSkey} setFlangeSkey={setFlangeSkey}
                reducerBore2={reducerBore2} setReducerBore2={setReducerBore2}
                reducerType={reducerType} setReducerType={setReducerType}
                reducerSkey={reducerSkey} setReducerSkey={setReducerSkey}
                reducerLen={reducerLen} setReducerLen={setReducerLen}
                fittingProps={fittingProps}
                fitToBounds={fitToBounds} centerOnBounds={centerOnBounds} zoomBy={zoomBy}
                screenToWorld={screenToWorld} worldToScreen={worldToScreen}
                handleSelect={handleSelect}
                resetDemo={resetDemo}
                selectedBounds={selectedBounds}
                expandBounds={expandBounds}
                placedFittingsCount={placedFittings.length}
              />
              <CoorCanvas_StatusBar mode={mode} statusText={statusText} snapTarget={snapTarget} />
            </CardContent>
          </Card>

          <CoorCanvas_PropertyPanel
            selectedIds={selectedIds}
            emits={emits} emitHits={emitHits}
            allSupports={allSupports} manualSupports={manualSupports}
            placedFittings={placedFittings} finalElements={finalElements} bore={bore}
            setEmits={setEmits} setManualSupports={setManualSupports}
            setPlacedFittings={setPlacedFittings} setSelectedIds={setSelectedIds}
            handleSelect={handleSelect}
            routeRows={routeRows} boreText={boreText} setBoreText={setBoreText}
            headerText={headerText} setHeaderText={setHeaderText}
            supportName={supportName} setSupportName={setSupportName}
            supportGuidPrefix={supportGuidPrefix} setSupportGuidPrefix={setSupportGuidPrefix}
            roundToMm={roundToMm} setRoundToMm={setRoundToMm}
            addRouteRow={addRouteRow} removeRouteRow={removeRouteRow}
            updateRouteRow={updateRouteRow} routeParse={routeParse}
            resetDemo={resetDemo}
            emitHitsForStats={emitHits}
            pcfText={pcfText} copied={copied} copyPcf={copyPcf}
          />
        </div>
      </div>
    </div>
  );
}
