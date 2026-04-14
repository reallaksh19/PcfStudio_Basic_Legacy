/**
 * CoorCanvas_PropertyPanel.jsx
 * Right-panel for CoorCanvas: Selection Properties + Project Setup +
 * Emit/Support Manager + Final PCF output.
 */
import React, { useState } from "react";
import {
  Copy, Crosshair, Plus, RefreshCcw, Route, Trash2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border bg-slate-50 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

// ── Selection Properties section ───────────────────────────────────────────────

function SelectionProperties({
  selectedIds, emits, emitHits, allSupports, placedFittings, finalElements, bore,
  setEmits, setManualSupports, setPlacedFittings, setSelectedIds, handleSelect,
}) {
  const [open, setOpen] = useState(true);

  if (!selectedIds.length) {
    return (
      <Card className="rounded-3xl border-0 shadow-xl shadow-slate-200/70">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Selection Properties</CardTitle>
          <button onClick={() => setOpen(v => !v)} className="text-xs text-slate-400">{open ? "▲" : "▼"}</button>
        </CardHeader>
        {open && (
          <CardContent>
            <p className="text-sm text-slate-400 italic">No object selected</p>
          </CardContent>
        )}
      </Card>
    );
  }

  // Gather selected objects
  const selFittings = selectedIds
    .filter(id => id.startsWith("fitting:"))
    .map(id => placedFittings.find(f => f.id === id.split(":")[1]))
    .filter(Boolean);
  const selEmits = selectedIds
    .filter(id => id.startsWith("emit:"))
    .map(id => emits.find(e => e.id === id.split(":")[1]))
    .filter(Boolean);
  const selSupports = selectedIds
    .filter(id => id.startsWith("support:"))
    .map(id => allSupports.find(s => s.id === id.split(":")[1]))
    .filter(Boolean);

  const updateFitting = (id, updates) => {
    setPlacedFittings(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };
  const deleteFitting = (id) => {
    setPlacedFittings(prev => prev.filter(f => f.id !== id));
    setSelectedIds(prev => prev.filter(x => x !== `fitting:${id}`));
  };
  const deleteEmit = (id) => {
    setEmits(prev => prev.filter(e => e.id !== id));
    setSelectedIds(prev => prev.filter(x => x !== `emit:${id}`));
  };
  const deleteSupport = (id) => {
    setManualSupports(prev => prev.filter(s => s.id !== id));
    setSelectedIds(prev => prev.filter(x => x !== `support:${id}`));
  };

  return (
    <Card className="rounded-3xl border-0 shadow-xl shadow-slate-200/70">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Selection Properties</CardTitle>
        <button onClick={() => setOpen(v => !v)} className="text-xs text-slate-400">{open ? "▲" : "▼"}</button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4 max-h-[360px] overflow-auto">
          {/* Emit properties */}
          {selEmits.map((emit, idx) => {
            const hit = emitHits[emits.findIndex(e => e.id === emit.id)];
            return (
              <div key={emit.id} className="rounded-2xl border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{emit.id} <span className="text-xs text-slate-400">Emit</span></span>
                  <Button size="icon" variant="ghost" className="rounded-xl h-7 w-7" onClick={() => deleteEmit(emit.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="text-xs font-mono text-slate-600">
                  P1 {emit.p1[0].toFixed(1)}, {emit.p1[1].toFixed(1)}<br />
                  P2 {emit.p2[0].toFixed(1)}, {emit.p2[1].toFixed(1)}
                </div>
                {hit
                  ? <div className="text-xs text-emerald-600">Hit at {hit.hitPoint[0].toFixed(1)}, {hit.hitPoint[1].toFixed(1)}</div>
                  : <div className="text-xs text-rose-600">No pipe hit</div>}
              </div>
            );
          })}

          {/* Support properties */}
          {selSupports.map(support => (
            <div key={support.id} className="rounded-2xl border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{support.id} <span className="text-xs text-slate-400">Support</span></span>
                {support.source === "manual" && (
                  <Button size="icon" variant="ghost" className="rounded-xl h-7 w-7" onClick={() => deleteSupport(support.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="text-xs font-mono text-slate-600">
                {support.point[0].toFixed(1)}, {support.point[1].toFixed(1)}
              </div>
              <div className="text-xs text-slate-500">{support.name} / {support.guid}</div>
              {support.source === "emit" && <Badge variant="secondary" className="text-xs">Auto (emit)</Badge>}
            </div>
          ))}

          {/* Fitting properties */}
          {selFittings.map(f => (
            <FittingProperties key={f.id} fitting={f} onUpdate={updateFitting} onDelete={deleteFitting} bore={bore} />
          ))}

          {/* Pipe/bend info */}
          {selectedIds.filter(id => id.startsWith("pipe:") || id.startsWith("bend:")).map(id => {
            const idx = Number(id.split(":")[1]);
            const elem = finalElements[idx];
            if (!elem) return null;
            if (elem.kind === "PIPE") {
              const len = Math.hypot(elem.end[0] - elem.start[0], elem.end[1] - elem.start[1]);
              return (
                <div key={id} className="rounded-2xl border p-3 space-y-1">
                  <div className="text-sm font-medium">Pipe segment <span className="text-xs text-slate-400">#{idx}</span></div>
                  <div className="text-xs text-slate-600">Length: {len.toFixed(1)} mm</div>
                  <div className="text-xs text-slate-500">Source: {elem.source}</div>
                </div>
              );
            }
            return (
              <div key={id} className="rounded-2xl border p-3 space-y-1">
                <div className="text-sm font-medium">Bend <span className="text-xs text-slate-400">#{idx}</span></div>
                <div className="text-xs text-slate-600">R: {elem.radius.toFixed(1)} mm  Angle: {elem.angle_deg}°</div>
                <div className="text-xs text-slate-500">SKEY: {elem.skey}</div>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}

function FittingProperties({ fitting: f, onUpdate, onDelete, bore }) {
  const up = (field, val) => onUpdate(f.id, { [field]: val });

  return (
    <div className="rounded-2xl border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium capitalize">{f.type} <span className="text-xs text-slate-400">Fitting</span></span>
        <Button size="icon" variant="ghost" className="rounded-xl h-7 w-7" onClick={() => onDelete(f.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Common: position info */}
      <div className="text-xs font-mono text-slate-500">
        Pipe #{f.pipeIndex ?? "—"}  •  {f.point[0].toFixed(1)}, {f.point[1].toFixed(1)}
      </div>

      {/* Valve */}
      {f.type === "valve" && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <Label className="text-xs">Length (mm)</Label>
            <Input value={f.length ?? ""} onChange={e => up("length", Number(e.target.value))} className="h-7 rounded-xl text-xs" />
          </div>
          <div>
            <Label className="text-xs">Weight (kg)</Label>
            <Input value={f.weight ?? ""} onChange={e => up("weight", e.target.value)} className="h-7 rounded-xl text-xs" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">SKEY</Label>
            <Input value={f.skey ?? ""} onChange={e => up("skey", e.target.value)} className="h-7 rounded-xl text-xs" />
          </div>
        </div>
      )}

      {/* Flange */}
      {f.type === "flange" && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <Label className="text-xs">Length (mm)</Label>
            <Input value={f.length ?? ""} onChange={e => up("length", Number(e.target.value))} className="h-7 rounded-xl text-xs" />
          </div>
          <div>
            <Label className="text-xs">Weight (kg)</Label>
            <Input value={f.weight ?? ""} onChange={e => up("weight", e.target.value)} className="h-7 rounded-xl text-xs" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">SKEY</Label>
            <Input value={f.skey ?? ""} onChange={e => up("skey", e.target.value)} className="h-7 rounded-xl text-xs" />
          </div>
        </div>
      )}

      {/* FVF */}
      {f.type === "fvf" && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <Label className="text-xs">Valve len (mm)</Label>
            <Input value={f.valveLen ?? ""} onChange={e => up("valveLen", Number(e.target.value))} className="h-7 rounded-xl text-xs" />
          </div>
          <div>
            <Label className="text-xs">Flange len (mm)</Label>
            <Input value={f.flangeLen ?? ""} onChange={e => up("flangeLen", Number(e.target.value))} className="h-7 rounded-xl text-xs" />
          </div>
          <div>
            <Label className="text-xs">Valve wt (kg)</Label>
            <Input value={f.valveWeight ?? ""} onChange={e => up("valveWeight", e.target.value)} className="h-7 rounded-xl text-xs" />
          </div>
          <div>
            <Label className="text-xs">Flange wt (kg)</Label>
            <Input value={f.flangeWeight ?? ""} onChange={e => up("flangeWeight", e.target.value)} className="h-7 rounded-xl text-xs" />
          </div>
          <div>
            <Label className="text-xs">Valve SKEY</Label>
            <Input value={f.valveSkey ?? ""} onChange={e => up("valveSkey", e.target.value)} className="h-7 rounded-xl text-xs" />
          </div>
          <div>
            <Label className="text-xs">Flange SKEY</Label>
            <Input value={f.flangeSkey ?? ""} onChange={e => up("flangeSkey", e.target.value)} className="h-7 rounded-xl text-xs" />
          </div>
          <div className="col-span-2 text-slate-500">
            Total: {((f.valveLen || 0) + (f.flangeLen || 0) * 2).toFixed(0)} mm
          </div>
        </div>
      )}

      {/* Reducer */}
      {f.type === "reducer" && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <Label className="text-xs">⌀ Upstream (mm)</Label>
            <Input value={f.upstreamBore ?? bore} onChange={e => up("upstreamBore", Number(e.target.value))} className="h-7 rounded-xl text-xs" />
          </div>
          <div>
            <Label className="text-xs">⌀ Downstream (mm)</Label>
            <Input value={f.downstreamBore ?? ""} onChange={e => up("downstreamBore", Number(e.target.value))} className="h-7 rounded-xl text-xs" />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <select
              value={f.reducerType ?? "concentric"}
              onChange={e => up("reducerType", e.target.value)}
              className="h-7 w-full rounded-xl border px-2 text-xs"
            >
              <option value="concentric">Concentric</option>
              <option value="eccentric">Eccentric</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">SKEY</Label>
            <Input value={f.skey ?? ""} onChange={e => up("skey", e.target.value)} className="h-7 rounded-xl text-xs" />
          </div>
          <div>
            <Label className="text-xs">Length (mm)</Label>
            <Input value={f.length ?? ""} onChange={e => up("length", Number(e.target.value))} className="h-7 rounded-xl text-xs" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main PropertyPanel export ──────────────────────────────────────────────────

export default function CoorCanvas_PropertyPanel({
  // Selection state
  selectedIds, emits, emitHits, allSupports, placedFittings, finalElements, bore,
  setEmits, setManualSupports, setPlacedFittings, setSelectedIds, handleSelect, manualSupports,
  // Project setup
  routeRows, boreText, setBoreText, headerText, setHeaderText,
  supportName, setSupportName, supportGuidPrefix, setSupportGuidPrefix,
  roundToMm, setRoundToMm,
  addRouteRow, removeRouteRow, updateRouteRow, routeParse,
  resetDemo,
  // Stats
  finalElements: fe, emitHitsForStats,
  // PCF
  pcfText, copied, copyPcf,
}) {
  return (
    <div className="space-y-6">
      {/* Selection Properties */}
      <SelectionProperties
        selectedIds={selectedIds}
        emits={emits} emitHits={emitHits}
        allSupports={allSupports} manualSupports={manualSupports}
        placedFittings={placedFittings} finalElements={finalElements} bore={bore}
        setEmits={setEmits} setManualSupports={setManualSupports}
        setPlacedFittings={setPlacedFittings} setSelectedIds={setSelectedIds}
        handleSelect={handleSelect}
      />

      {/* Project setup */}
      <Card className="rounded-3xl border-0 shadow-xl shadow-slate-200/70">
        <CardHeader>
          <CardTitle>Project setup</CardTitle>
          <CardDescription>Table-based route editing, support defaults, and live PCF generation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Bore (mm)</Label>
              <Input value={boreText} onChange={(e) => setBoreText(e.target.value)} className="rounded-2xl" />
            </div>
            <div className="grid gap-2">
              <Label>Output rounding</Label>
              <Button
                variant={roundToMm ? "default" : "outline"}
                className="justify-start rounded-2xl"
                onClick={() => setRoundToMm((v) => !v)}
              >
                {roundToMm ? "Round to whole mm" : "Keep decimal mm"}
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Support name</Label>
              <Input value={supportName} onChange={(e) => setSupportName(e.target.value)} className="rounded-2xl" />
            </div>
            <div className="grid gap-2">
              <Label>Support GUID prefix</Label>
              <Input value={supportGuidPrefix} onChange={(e) => setSupportGuidPrefix(e.target.value)} className="rounded-2xl" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Route className="h-4 w-4 text-slate-500" />
                <Label>Route vertices</Label>
              </div>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={addRouteRow}>
                <Plus className="mr-2 h-4 w-4" /> Add row
              </Button>
            </div>
            <div className="overflow-hidden rounded-2xl border bg-white">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="border-b px-3 py-2 text-left font-medium">#</th>
                    <th className="border-b px-3 py-2 text-left font-medium">X</th>
                    <th className="border-b px-3 py-2 text-left font-medium">Y</th>
                    <th className="border-b px-3 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {routeRows.map((row, idx) => (
                    <tr key={row.id} className="odd:bg-white even:bg-slate-50/40">
                      <td className="border-b px-3 py-2 font-medium text-slate-500">{idx + 1}</td>
                      <td className="border-b px-3 py-2">
                        <Input value={row.x} onChange={(e) => updateRouteRow(row.id, "x", e.target.value)} className="h-9 rounded-xl" />
                      </td>
                      <td className="border-b px-3 py-2">
                        <Input value={row.y} onChange={(e) => updateRouteRow(row.id, "y", e.target.value)} className="h-9 rounded-xl" />
                      </td>
                      <td className="border-b px-3 py-2 text-right">
                        <Button size="icon" variant="ghost" className="rounded-xl" onClick={() => removeRouteRow(row.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {routeParse.ok
              ? <Badge className="rounded-full">Route table valid</Badge>
              : <Badge variant="destructive" className="rounded-full">{routeParse.error}</Badge>
            }
          </div>
        </CardContent>
      </Card>

      {/* Emit & support manager */}
      <Card className="rounded-3xl border-0 shadow-xl shadow-slate-200/70">
        <CardHeader>
          <CardTitle>Emit & support manager</CardTitle>
          <CardDescription>Emit hits create support objects automatically. Manual supports can be placed with snap-on-hover.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-h-[420px] overflow-auto">
          <div className="space-y-3">
            <div className="text-sm font-medium text-slate-700">Emit lines</div>
            {emits.map((emit, idx) => {
              const hit = emitHits[idx];
              const selected = selectedIds.includes(`emit:${emit.id}`);
              return (
                <div key={emit.id} className={`rounded-2xl border p-3 transition ${selected ? "border-slate-900 bg-slate-50" : "bg-white hover:border-slate-300"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 text-sm">
                      <div className="font-medium">{emit.id}</div>
                      <div className="font-mono text-xs text-slate-600">P1 {emit.p1[0].toFixed(1)}, {emit.p1[1].toFixed(1)}</div>
                      <div className="font-mono text-xs text-slate-600">P2 {emit.p2[0].toFixed(1)}, {emit.p2[1].toFixed(1)}</div>
                      {hit
                        ? <div className="font-mono text-xs text-emerald-700">Cut / support at {hit.hitPoint[0].toFixed(1)}, {hit.hitPoint[1].toFixed(1)}</div>
                        : <div className="font-mono text-xs text-rose-700">No pipe hit</div>
                      }
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button size="icon" variant="outline" className="rounded-xl" onClick={() => handleSelect(`emit:${emit.id}`, false)}>
                        <Crosshair className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" className="rounded-xl" onClick={() => setEmits((prev) => prev.filter((e) => e.id !== emit.id))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="text-sm font-medium text-slate-700">Manual supports</div>
            {manualSupports.length === 0
              ? <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">Use Place support mode, hover until snap appears, then click on the pipe.</div>
              : manualSupports.map((support) => {
                const selected = selectedIds.includes(`support:${support.id}`);
                return (
                  <div key={support.id} className={`rounded-2xl border p-3 transition ${selected ? "border-slate-900 bg-slate-50" : "bg-white hover:border-slate-300"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 text-sm">
                        <div className="font-medium">{support.id}</div>
                        <div className="font-mono text-xs text-slate-600">{support.point[0].toFixed(1)}, {support.point[1].toFixed(1)}</div>
                        <div className="text-xs text-slate-600">{support.name} / {support.guid}</div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button size="icon" variant="outline" className="rounded-xl" onClick={() => handleSelect(`support:${support.id}`, false)}>
                          <Crosshair className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="outline" className="rounded-xl" onClick={() => setManualSupports((prev) => prev.filter((s) => s.id !== support.id))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            }
          </div>
        </CardContent>
      </Card>

      {/* Final PCF */}
      <Card className="rounded-3xl border-0 shadow-xl shadow-slate-200/70">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Final PCF</CardTitle>
              <CardDescription>Generated dynamically from current geometry, bends, emit cuts, and support locations.</CardDescription>
            </div>
            <Button variant="outline" className="rounded-2xl" onClick={copyPcf}>
              <Copy className="mr-2 h-4 w-4" /> {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-4">
            <Stat label="Pipes"    value={String(finalElements.filter((e) => e.kind === "PIPE").length)} />
            <Stat label="Bends"    value={String(finalElements.filter((e) => e.kind === "BEND").length)} />
            <Stat label="Emits"    value={String(emitHitsForStats.filter(Boolean).length)} />
            <Stat label="Supports" value={String(allSupports.length)} />
          </div>
          <div className="grid gap-2">
            <Label>Header block</Label>
            <Textarea value={headerText} onChange={(e) => setHeaderText(e.target.value)} className="min-h-[120px] rounded-2xl font-mono text-xs" />
          </div>
          <Separator />
          <Textarea value={pcfText} readOnly className="min-h-[320px] rounded-2xl font-mono text-xs" />
        </CardContent>
      </Card>
    </div>
  );
}
