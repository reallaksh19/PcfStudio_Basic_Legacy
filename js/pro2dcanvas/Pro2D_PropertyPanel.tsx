import React from 'react';
import { useSceneStore } from '../smart2dcanvas/Smart2Dcanvas_SceneStore';

function readPath(obj: any, path: string) {
  return String(path || '').split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

const Row: React.FC<{ label: string; value: any; badge?: string }> = ({ label, value, badge }) => (
  <div className="grid grid-cols-[120px_1fr] gap-2 py-1 border-b border-slate-800 text-xs">
    <div className="text-slate-400 flex items-center gap-2"><span>{label}</span>{badge ? <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">{badge}</span> : null}</div>
    <div className="text-slate-200 break-all">{value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</div>
  </div>
);

const inputCls = 'w-full rounded border border-slate-700 bg-slate-950 text-slate-200 px-2 py-1 text-xs';

const Pro2D_PropertyPanel: React.FC<{
  doc: any;
  validation: any;
  onPatchEntity?: (entityId: string, patch: Record<string, unknown>) => void;
}> = ({ doc, validation, onPatchEntity }) => {
  const [collapsed, setCollapsed] = useState(false);
  const selectedIdsSet = useSceneStore((state) => state.selectedIds);
  const selectedIds = Array.from(selectedIdsSet);
  const selectedId = selectedIds[0];
  const entity = selectedId ? doc?.entities?.[selectedId] : null;
  const typeDefs = entity ? (doc?.headers?.byEntityType?.[entity.type] || []) : [];
  const fixedDefs = doc?.headers?.fixed || [];
  const dynamicDefs = Object.values(doc?.headers?.dynamic || {});

  return (
    <div className="h-full w-full bg-slate-950 text-slate-200 border-l border-slate-800 flex flex-col">
      <div className="px-3 py-2 border-b border-slate-800">
        <div className="text-sm font-semibold">Pro2D Properties</div>
        <div className="text-[11px] text-slate-400">Live scene-aware fixed, typed, and dynamic headers with basic write-back.</div>
      </div>
      <div className="p-3 overflow-auto flex-1 space-y-4">
        <section>
          <div className="text-xs uppercase tracking-wide text-amber-400 mb-2">Selection</div>
          <Row label="Selected IDs" value={selectedIds.join(', ') || 'none'} />
          <Row label="Entity Type" value={entity?.type} />
          <Row label="Route" value={entity?.routeId} />
          <Row label="Layer" value={entity?.layerId} />
        </section>

        {entity && (
          <section className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-cyan-400 mb-2">Edit</div>
            <label className="block text-xs">Layer
              <input className={inputCls} value={entity?.layerId || ''} onChange={(e) => onPatchEntity?.(entity.id, { 'layerId': e.target.value })} />
            </label>
            <label className="block text-xs">Label
              <input className={inputCls} value={entity?.display?.label || ''} onChange={(e) => onPatchEntity?.(entity.id, { 'display.label': e.target.value })} />
            </label>
            <label className="block text-xs">Route
              <input className={inputCls} value={entity?.routeId || ''} onChange={(e) => onPatchEntity?.(entity.id, { 'routeId': e.target.value })} />
            </label>
          </section>
        )}

        {entity && (
          <section>
            <div className="text-xs uppercase tracking-wide text-cyan-400 mb-2">Fixed Headers</div>
            {fixedDefs.map((def: any) => <Row key={def.key} label={def.label} value={readPath(entity, def.key)} badge={def.group} />)}
          </section>
        )}

        {entity && typeDefs.length > 0 && (
          <section>
            <div className="text-xs uppercase tracking-wide text-emerald-400 mb-2">{entity.type} Fields</div>
            {typeDefs.map((def: any) => <Row key={def.key} label={def.label} value={readPath(entity, def.key)} badge={def.group} />)}
          </section>
        )}

        {entity && dynamicDefs.length > 0 && (
          <section>
            <div className="text-xs uppercase tracking-wide text-fuchsia-400 mb-2">Dynamic Metadata</div>
            {dynamicDefs.map((def: any) => <Row key={def.key} label={def.label} value={readPath(entity, def.key)} badge={def.sourceKind || 'dynamic'} />)}
          </section>
        )}

        <section>
          <div className="text-xs uppercase tracking-wide text-orange-400 mb-2">Validation</div>
          <Row label="Errors" value={validation?.summary?.errors ?? 0} />
          <Row label="Warnings" value={validation?.summary?.warnings ?? 0} />
          <Row label="Entities" value={validation?.summary?.totalEntities ?? 0} />
          <Row label="Nodes" value={validation?.summary?.totalNodes ?? 0} />
          {(validation?.issues || []).slice(0, 12).map((issue: any, idx: number) => (
            <div key={`${issue.code}_${idx}`} className={`text-[11px] p-2 rounded border ${issue.severity === 'error' ? 'border-rose-800 bg-rose-950/30 text-rose-200' : 'border-amber-800 bg-amber-950/20 text-amber-200'}`}>
              <div className="font-semibold">{issue.code}</div>
              <div>{issue.message}</div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};

export default Pro2D_PropertyPanel;
