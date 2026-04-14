import React, { useMemo, useState } from 'react';

type OpsProps = {
  inputSnapshot: any;
  pipelineMetrics: any;
  liveDoc: any;
  onAction: (actionId: string, payload?: any) => void;
};

const tabButton = (active: boolean) => `px-3 py-1.5 rounded-md border text-xs ${active ? 'border-amber-500 bg-amber-500/10 text-amber-200' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'}`;
const block = 'rounded border border-slate-800 bg-slate-900/60 p-2 space-y-2';
const actionBtn = 'rounded border border-slate-700 bg-slate-900 hover:border-amber-500 hover:text-amber-200 px-2 py-1 text-xs';
const inputCls = 'rounded border border-slate-700 bg-slate-950 text-slate-200 px-2 py-1 text-xs';

const Pro2D_CoorOpsPanel: React.FC<OpsProps> = ({ inputSnapshot, pipelineMetrics, liveDoc, onAction }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'route'|'emit'|'fittings'|'pcf'>('route');
  const [supportType, setSupportType] = useState('REST');
  const [reducerType, setReducerType] = useState('concentric');
  const [valveLength, setValveLength] = useState('100');
  const metrics = useMemo(() => pipelineMetrics || { routePointCount: 0, emitCount: 0, autoSupportCount: 0, finalElementCount: 0 }, [pipelineMetrics]);
  return (
    <div className="p-3 text-xs text-slate-300 bg-slate-950 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-amber-400">CoorCanvas / Coor2PCF operator panel</div>
          <div className="text-[11px] text-slate-500">Dedicated Route / Emit / Fittings / PCF tabs. Live metrics now derive from the current document, not mock-only input.</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className={tabButton(activeTab === 'route')} onClick={() => setActiveTab('route')}>Route</button>
          <button className={tabButton(activeTab === 'emit')} onClick={() => setActiveTab('emit')}>Emit</button>
          <button className={tabButton(activeTab === 'fittings')} onClick={() => setActiveTab('fittings')}>Fittings</button>
          <button className={tabButton(activeTab === 'pcf')} onClick={() => setActiveTab('pcf')}>PCF</button>
        </div>
      </div>
      {!collapsed && activeTab === 'route' && (
        <div className="grid grid-cols-3 gap-3">
          <div className={block}>
            <div className="font-semibold text-slate-200">Imported route snapshot</div>
            <div>Runs: {inputSnapshot?.parsedRuns?.length || 0}</div>
            <div>Support points: {inputSnapshot?.supportPoints?.length || 0}</div>
            <div>Canvas fittings: {inputSnapshot?.canvasFittings?.length || 0}</div>
            <div>Bore: {inputSnapshot?.options?.bore || 250}</div>
            <div>Pipeline Ref: {inputSnapshot?.options?.pipelineRef || '—'}</div>
          </div>
          <div className={block}>
            <div className="font-semibold text-slate-200">Route actions</div>
            <div className="flex gap-2 flex-wrap">
              <button className={actionBtn} onClick={() => onAction('pullInput')}>Pull Input</button>
              <button className={actionBtn} onClick={() => onAction('validate')}>Validate Route</button>
              <button className={actionBtn} onClick={() => onAction('benchmark')}>Run Bench</button>
            </div>
            <div className="text-slate-500">Current live document entities: {Object.keys(liveDoc?.entities || {}).length}</div>
          </div>
          <div className={block}>
            <div className="font-semibold text-slate-200">Live route metrics</div>
            <div>Route points: {metrics.routePointCount || 0}</div>
            <div>Final elements: {metrics.finalElementCount || 0}</div>
            <div>Auto supports: {metrics.autoSupportCount || 0}</div>
            <div>Total entities: {Object.keys(liveDoc?.entities || {}).length}</div>
          </div>
        </div>
      )}
      {!collapsed && activeTab === 'emit' && (
        <div className="grid grid-cols-2 gap-3">
          <div className={block}>
            <div className="font-semibold text-slate-200">Emit operators</div>
            <div className="flex gap-2 flex-wrap">
              <button className={actionBtn} onClick={() => onAction('emitCuts')}>Run Emit Cuts</button>
              <button className={actionBtn} onClick={() => onAction('autoSupports')}>Auto Supports</button>
            </div>
            <div className="text-slate-500">Metrics now rerun against the current document route extraction path.</div>
          </div>
          <div className={block}>
            <div className="font-semibold text-slate-200">Emit metrics</div>
            <div>Emit count: {metrics.emitCount || 0}</div>
            <div>Auto supports: {metrics.autoSupportCount || 0}</div>
            <div>Final elements: {metrics.finalElementCount || 0}</div>
          </div>
        </div>
      )}
      {!collapsed && activeTab === 'fittings' && (
        <div className="grid grid-cols-3 gap-3">
          <div className={block}>
            <div className="font-semibold text-slate-200">Quick insert</div>
            <div className="flex gap-2 flex-wrap">
              <button className={actionBtn} onClick={() => onAction('tool_valve', { length: Number(valveLength) || 100 })}>Valve</button>
              <button className={actionBtn} onClick={() => onAction('tool_flange')}>Flange</button>
              <button className={actionBtn} onClick={() => onAction('tool_fvf')}>FVF</button>
              <button className={actionBtn} onClick={() => onAction('tool_reducer', { reducerType })}>Reducer</button>
              <button className={actionBtn} onClick={() => onAction('tool_support', { supportType })}>Support</button>
            </div>
            <div className="text-slate-500">Fitting icons are intentionally kept out of the left rail to avoid repetition and keep authoring commands in one dedicated operator surface.</div>
          </div>
          <div className={block}>
            <div className="font-semibold text-slate-200">Parameters</div>
            <label className="block">Valve length<input className={inputCls} value={valveLength} onChange={(e) => setValveLength(e.target.value)} /></label>
            <label className="block">Reducer type<select className={inputCls} value={reducerType} onChange={(e) => setReducerType(e.target.value)}><option value="concentric">Concentric</option><option value="eccentric">Eccentric</option></select></label>
            <label className="block">Support type<input className={inputCls} value={supportType} onChange={(e) => setSupportType(e.target.value)} /></label>
          </div>
          <div className={block}>
            <div className="font-semibold text-slate-200">Planned but still blocked</div>
            <div className="flex gap-2 flex-wrap">
              <button className={actionBtn} onClick={() => onAction('tool_bend')}>Bend</button>
              <button className={actionBtn} onClick={() => onAction('tool_tee')}>Tee</button>
            </div>
            <div className="text-slate-500">Visible by design for gap analysis, but still disabled until canonical insertion logic is added.</div>
          </div>
        </div>
      )}
      {!collapsed && activeTab === 'pcf' && (
        <div className="grid grid-cols-2 gap-3">
          <div className={block}>
            <div className="font-semibold text-slate-200">PCF interop</div>
            <div className="flex gap-2 flex-wrap">
              <button className={actionBtn} onClick={() => onAction('routeToPcf')}>Route → PCF</button>
              <button className={actionBtn} onClick={() => onAction('exportDxf')}>Export DXF</button>
              <button className={actionBtn} onClick={() => onAction('exportSvg')}>Export SVG</button>
            </div>
            <div className="text-slate-500">DXF exporter upgraded from pseudo-CSV to a minimal ASCII DXF ENTITIES section.</div>
          </div>
          <div className={block}>
            <div className="font-semibold text-slate-200">PCF notes</div>
            <div>This revision closes build blockers and improves truthfulness of metrics. It does not claim bend/tee authoring, repair tools, or full DXF round-trip completeness.</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pro2D_CoorOpsPanel;
