import React, { useState, useEffect } from 'react';
import { useSceneStore } from './Smart2Dcanvas_SceneStore';
import type { InlineItem, Support, Segment } from './Smart2Dcanvas_GeometryTypes';

// ----------- Segment (Pipe) Panel -----------
const SegmentPanel: React.FC<{ seg: Segment }> = ({ seg }) => {
  const updateSegment = useSceneStore((s) => s.updateSegment);
  const [form, setForm] = useState({
    bore: seg.sizeSpecFields?.bore || '',
    wallThickness: seg.sizeSpecFields?.wallThickness || '',
    temperature: seg.sizeSpecFields?.temperature || '',
    pressure: seg.sizeSpecFields?.pressure || '',
    spec: seg.sizeSpecFields?.spec || '',
    tag: seg.metadata?.tag || '',
  });

  useEffect(() => {
    setForm({
      bore: seg.sizeSpecFields?.bore || '',
      wallThickness: seg.sizeSpecFields?.wallThickness || '',
      temperature: seg.sizeSpecFields?.temperature || '',
      pressure: seg.sizeSpecFields?.pressure || '',
      spec: seg.sizeSpecFields?.spec || '',
      tag: seg.metadata?.tag || '',
    });
  }, [seg.id]);

  const handleSizeSpec = (field: string, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    updateSegment(seg.id, { sizeSpecFields: { ...(seg.sizeSpecFields || {}), [field]: value } });
  };
  const handleMeta = (field: string, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    updateSegment(seg.id, { metadata: { ...(seg.metadata || {}), [field]: value } });
  };

  const ptLen = seg.points.length;
  let lengthMm = 0;
  if (ptLen >= 2) {
    const a = seg.points[0], b = seg.points[ptLen - 1];
    lengthMm = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-blue-400 uppercase">Pipe Segment</div>
      <Field label="ID" value={seg.id.slice(0, 8) + '…'} readOnly />
      <Field label="Kind" value={seg.geometryKind} readOnly />
      <Field label="Length (approx mm)" value={String(lengthMm)} readOnly />
      <EditField label="Bore (NB)" value={form.bore} onChange={(v) => handleSizeSpec('bore', v)} placeholder="e.g. 150" />
      <EditField label="Wall Thickness" value={form.wallThickness} onChange={(v) => handleSizeSpec('wallThickness', v)} placeholder="e.g. SCH40" />
      <EditField label="Design Temp (°C)" value={form.temperature} onChange={(v) => handleSizeSpec('temperature', v)} placeholder="e.g. 100" />
      <EditField label="Design Pressure" value={form.pressure} onChange={(v) => handleSizeSpec('pressure', v)} placeholder="e.g. 150" />
      <EditField label="Spec" value={form.spec} onChange={(v) => handleSizeSpec('spec', v)} placeholder="e.g. A1B" />
      <EditField label="Tag" value={form.tag} onChange={(v) => handleMeta('tag', v)} placeholder="e.g. L-100" />
    </div>
  );
};

// ----------- InlineItem Panel -----------
const InlineItemPanel: React.FC<{ item: InlineItem }> = ({ item }) => {
  const updateInlineItem = useSceneStore((s) => s.updateInlineItem);
  const [form, setForm] = useState({
    occupiedLength: String(item.occupiedLength ?? ''),
    weight: String(item.weight ?? ''),
    skey: item.metadata?.skey || '',
    tag: item.metadata?.tag || '',
    // valve/flange/fvf specific
    valveLen: String(item.metadata?.valveLen ?? item.occupiedLength ?? ''),
    valveWeight: String(item.metadata?.valveWeight ?? item.weight ?? ''),
    valveSkey: String(item.metadata?.valveSkey ?? item.metadata?.skey ?? ''),
    flangeLen: String(item.metadata?.flangeLen ?? ''),
    flangeWeight: String(item.metadata?.flangeWeight ?? ''),
    flangeSkey: String(item.metadata?.flangeSkey ?? ''),
    // reducer
    downstreamBore: String(item.downstreamBore ?? ''),
    reducerType: item.reducerType ?? 'concentric',
  });

  useEffect(() => {
    setForm({
      occupiedLength: String(item.occupiedLength ?? ''),
      weight: String(item.weight ?? ''),
      skey: item.metadata?.skey || '',
      tag: item.metadata?.tag || '',
      valveLen: String(item.metadata?.valveLen ?? item.occupiedLength ?? ''),
      valveWeight: String(item.metadata?.valveWeight ?? item.weight ?? ''),
      valveSkey: String(item.metadata?.valveSkey ?? item.metadata?.skey ?? ''),
      flangeLen: String(item.metadata?.flangeLen ?? ''),
      flangeWeight: String(item.metadata?.flangeWeight ?? ''),
      flangeSkey: String(item.metadata?.flangeSkey ?? ''),
      downstreamBore: String(item.downstreamBore ?? ''),
      reducerType: item.reducerType ?? 'concentric',
    });
  }, [item.id]);

  const upd = (updates: Partial<InlineItem>) => updateInlineItem(item.id, updates);
  const updMeta = (key: string, value: string) =>
    upd({ metadata: { ...(item.metadata || {}), [key]: value } });

  const labelMap: Record<string, string> = {
    valve: 'Valve',
    flange: 'Flange',
    fvf: 'FVF (Flange-Valve-Flange)',
    reducer: 'Reducer',
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-purple-400 uppercase">{labelMap[item.type] ?? item.type}</div>
      <Field label="ID" value={item.id.slice(0, 8) + '…'} readOnly />

      {item.type === 'valve' && (
        <>
          <EditField label="Length (mm)" value={form.valveLen}
            onChange={(v) => { setForm(p => ({ ...p, valveLen: v })); updMeta('valveLen', v); upd({ occupiedLength: parseFloat(v) || 0 }); }} />
          <EditField label="Weight (kg)" value={form.valveWeight}
            onChange={(v) => { setForm(p => ({ ...p, valveWeight: v })); updMeta('valveWeight', v); upd({ weight: parseFloat(v) || undefined }); }} />
          <EditField label="SKEY" value={form.valveSkey}
            onChange={(v) => { setForm(p => ({ ...p, valveSkey: v })); updMeta('skey', v); }} />
        </>
      )}

      {item.type === 'flange' && (
        <>
          <EditField label="Length (mm)" value={form.occupiedLength}
            onChange={(v) => { setForm(p => ({ ...p, occupiedLength: v })); upd({ occupiedLength: parseFloat(v) || 0 }); }} />
          <EditField label="Weight (kg)" value={form.weight}
            onChange={(v) => { setForm(p => ({ ...p, weight: v })); upd({ weight: parseFloat(v) || undefined }); }} />
          <EditField label="SKEY" value={form.skey}
            onChange={(v) => { setForm(p => ({ ...p, skey: v })); updMeta('skey', v); }} />
        </>
      )}

      {item.type === 'fvf' && (
        <>
          <EditField label="Valve Length (mm)" value={form.valveLen}
            onChange={(v) => { setForm(p => ({ ...p, valveLen: v })); updMeta('valveLen', v); }} />
          <EditField label="Valve Weight (kg)" value={form.valveWeight}
            onChange={(v) => { setForm(p => ({ ...p, valveWeight: v })); updMeta('valveWeight', v); }} />
          <EditField label="Valve SKEY" value={form.valveSkey}
            onChange={(v) => { setForm(p => ({ ...p, valveSkey: v })); updMeta('valveSkey', v); }} />
          <EditField label="Flange Length (mm)" value={form.flangeLen}
            onChange={(v) => { setForm(p => ({ ...p, flangeLen: v })); updMeta('flangeLen', v); }} />
          <EditField label="Flange Weight (kg)" value={form.flangeWeight}
            onChange={(v) => { setForm(p => ({ ...p, flangeWeight: v })); updMeta('flangeWeight', v); }} />
          <EditField label="Flange SKEY" value={form.flangeSkey}
            onChange={(v) => { setForm(p => ({ ...p, flangeSkey: v })); updMeta('flangeSkey', v); }} />
          <Field label="Total Length"
            value={String((parseFloat(form.valveLen) || 0) + 2 * (parseFloat(form.flangeLen) || 0)) + ' mm'}
            readOnly />
        </>
      )}

      {item.type === 'reducer' && (
        <>
          <Field label="Bore 1 (upstream)" value={(item.upstreamBore ?? '—') + ' mm'} readOnly />
          <EditField label="Bore 2 (downstream mm)" value={form.downstreamBore}
            onChange={(v) => { setForm(p => ({ ...p, downstreamBore: v })); upd({ downstreamBore: parseFloat(v) || 0 }); }} />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Type</label>
            <select
              className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white"
              value={form.reducerType}
              onChange={(e) => {
                const v = e.target.value as 'concentric' | 'eccentric';
                setForm(p => ({ ...p, reducerType: v }));
                upd({ reducerType: v });
                updMeta('skey', v === 'eccentric' ? 'REBW' : 'RCON');
              }}
            >
              <option value="concentric">Concentric</option>
              <option value="eccentric">Eccentric</option>
            </select>
          </div>
          <EditField label="SKEY" value={form.skey}
            onChange={(v) => { setForm(p => ({ ...p, skey: v })); updMeta('skey', v); }} />
          <EditField label="Length (mm)" value={form.occupiedLength}
            onChange={(v) => { setForm(p => ({ ...p, occupiedLength: v })); upd({ occupiedLength: parseFloat(v) || 0 }); }} />
        </>
      )}

      <EditField label="Tag" value={form.tag}
        onChange={(v) => { setForm(p => ({ ...p, tag: v })); updMeta('tag', v); }} />
    </div>
  );
};

// ----------- Support Panel -----------
const SupportPanel: React.FC<{ support: Support }> = ({ support }) => {
  const updateSupport = useSceneStore((s) => s.updateSupport);
  const [type, setType] = useState(support.supportType || '');

  useEffect(() => { setType(support.supportType || ''); }, [support.id]);

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-green-400 uppercase">Support</div>
      <Field label="ID" value={support.id.slice(0, 8) + '…'} readOnly />
      <EditField label="Type / Name" value={type}
        onChange={(v) => { setType(v); updateSupport(support.id, { supportType: v }); }} />
      <Field label="X" value={support.x != null ? support.x.toFixed(1) : '—'} readOnly />
      <Field label="Y" value={support.y != null ? support.y.toFixed(1) : '—'} readOnly />
      {support.tag && <Field label="Tag" value={support.tag} readOnly />}
    </div>
  );
};

// ----------- Helpers -----------
const Field: React.FC<{ label: string; value: string; readOnly: true }> = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs text-gray-500">{label}</span>
    <span className="text-sm text-gray-300 font-mono break-all">{value}</span>
  </div>
);

const EditField: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string }> = ({ label, value, onChange, placeholder }) => (
  <div className="flex flex-col gap-0.5">
    <label className="text-xs text-gray-400">{label}</label>
    <input
      className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  </div>
);

// ----------- Main Panel -----------
const Smart2Dcanvas_PropertyPanel: React.FC = () => {
  const selectedIds = useSceneStore((state) => state.selectedIds);
  const segments = useSceneStore((state) => state.segments);
  const inlineItems = useSceneStore((state) => state.inlineItems);
  const supports = useSceneStore((state) => state.supports);
  const deleteSelected = useSceneStore((state) => state.deleteSelected);

  const ids = Array.from(selectedIds);
  const count = ids.length;

  // Determine what's selected
  const selSegments = ids.filter((id) => segments[id]);
  const selInline = ids.filter((id) => inlineItems[id]);
  const selSupports = ids.filter((id) => supports[id]);

  const typeCount = [selSegments.length > 0, selInline.length > 0, selSupports.length > 0].filter(Boolean).length;
  const mixed = typeCount > 1;

  return (
    <div className="w-64 bg-gray-800 border-l border-gray-700 flex flex-col shrink-0 z-10">
      <div className="h-10 border-b border-gray-700 flex items-center px-4 font-semibold text-gray-300">
        Properties
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {count === 0 ? (
          <div className="text-gray-500 text-sm text-center mt-10">No object selected</div>
        ) : mixed ? (
          <div className="text-gray-400 text-sm text-center mt-6">(multiple types selected)</div>
        ) : (
          <div className="space-y-5">
            {/* Single segment */}
            {count === 1 && selSegments.length === 1 && (
              <SegmentPanel seg={segments[selSegments[0]]} />
            )}

            {/* Multiple segments — show bore/spec common fields */}
            {selSegments.length > 1 && (
              <MultiSegmentPanel ids={selSegments} />
            )}

            {/* Single inline item */}
            {count === 1 && selInline.length === 1 && (
              <InlineItemPanel item={inlineItems[selInline[0]]} />
            )}

            {/* Single support */}
            {count === 1 && selSupports.length === 1 && (
              <SupportPanel support={supports[selSupports[0]]} />
            )}

            {/* Delete button */}
            <button
              onClick={deleteSelected}
              className="w-full mt-2 px-3 py-1.5 rounded bg-red-800 hover:bg-red-700 text-white text-sm font-medium transition-colors"
            >
              Delete Selected
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Multi-segment: edit bore/spec/temp/pressure for all selected
const MultiSegmentPanel: React.FC<{ ids: string[] }> = ({ ids }) => {
  const segments = useSceneStore((s) => s.segments);
  const updateSegment = useSceneStore((s) => s.updateSegment);
  const [form, setForm] = useState({ bore: '', wallThickness: '', temperature: '', pressure: '', spec: '' });

  const applyAll = (field: string, value: string) => {
    ids.forEach((id) => {
      if (segments[id]) {
        updateSegment(id, { sizeSpecFields: { ...(segments[id].sizeSpecFields || {}), [field]: value } });
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-blue-400 uppercase">Pipe Segments ({ids.length})</div>
      <p className="text-xs text-gray-500">Editing applies to all selected segments.</p>
      {(['bore', 'wallThickness', 'temperature', 'pressure', 'spec'] as const).map((field) => (
        <EditField key={field} label={field} value={form[field]}
          onChange={(v) => { setForm(p => ({ ...p, [field]: v })); applyAll(field, v); }} />
      ))}
    </div>
  );
};

export default Smart2Dcanvas_PropertyPanel;
