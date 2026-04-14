import React, { useMemo, useState } from 'react';
import Smart2Dcanvas_CanvasViewport from '../smart2dcanvas/Smart2Dcanvas_CanvasViewport';
import Smart2Dcanvas_StatusBar from '../smart2dcanvas/Smart2Dcanvas_StatusBar';
import { useSceneStore } from '../smart2dcanvas/Smart2Dcanvas_SceneStore';
import Pro2D_Ribbon from './Pro2D_Ribbon';
import Pro2D_LeftRail from './Pro2D_LeftRail';
import Pro2D_PropertyPanel from './Pro2D_PropertyPanel';
import Pro2D_DebugDock from './Pro2D_DebugDock';
import Pro2D_CoorOpsPanel from './Pro2D_CoorOpsPanel';
import Pro2D_3DThumbnail from './Pro2D_3DThumbnail';
import { Pro2D_buildMockState, Pro2D_fromCoord2PcfSnapshot, Pro2D_toSceneBundle, Pro2D_createEmptyState, Pro2D_safeCoordSnapshot, Pro2D_mergeSceneIntoState, Pro2D_patchState } from './Pro2D_Canonical.mjs';
import { Pro2D_validateState } from './Pro2D_ValidationEngine.mjs';
import { Pro2D_runBenchmark } from './Pro2D_Benchmark.mjs';
import { Pro2D_exportSimpleSvg } from './Pro2D_SvgAdapter.mjs';
import { Pro2D_exportSimpleDxf, Pro2D_importSimpleDxf } from './Pro2D_DxfAdapter.mjs';
import { Pro2D_runEmitPipeline, Pro2D_extractPipelineInput } from './Pro2D_EmitEngine.mjs';
import { Pro2D_toolMap } from './Pro2D_ToolRegistry.mjs';
import { useShallow } from 'zustand/react/shallow';
import { generatePCF } from '../coord2pcf/coord-pcf-emitter.js';

function pushToStore(bundle: any) {
  useSceneStore.getState().loadSceneBundle(bundle);
}

const Pro2D_AppShell: React.FC = () => {
  const [doc, setDoc] = useState<any>(() => Pro2D_createEmptyState('Pro2D Empty'));
  const [validation, setValidation] = useState<any>({ issues: [], summary: { errors: 0, warnings: 0, totalEntities: 0, totalRoutes: 0, totalNodes: 0 } });
  const [benchmark, setBenchmark] = useState<any>(null);
  const [lastSvg, setLastSvg] = useState('');
  const [lastDxf, setLastDxf] = useState('');
  const [inputSnapshot, setInputSnapshot] = useState<any>({ parsedRuns: [], supportPoints: [], canvasFittings: [], options: {} });
  const [pipelineMetrics, setPipelineMetrics] = useState<any>(null);
  const [logs, setLogs] = useState<Array<{ ts: string; level: string; category: string; text: string }>>([]);
  const clearSelection = useSceneStore((state) => state.clearSelection);
  const scene = useSceneStore(useShallow((state) => ({
    revision: state.revision,
    nodes: state.nodes,
    segments: state.segments,
    inlineItems: state.inlineItems,
    supports: state.supports,
    fittings: state.fittings,
    underlayImages: state.underlayImages,
  })));

  const liveDoc = useMemo(
    () => Pro2D_mergeSceneIntoState(doc, scene),
    [doc, scene.revision, scene.nodes, scene.segments, scene.inlineItems, scene.supports, scene.fittings, scene.underlayImages]
  );

  const summaryText = useMemo(() => {
    const s = validation?.summary;
    return `${s?.totalEntities ?? 0} entities · ${s?.totalNodes ?? 0} nodes · ${s?.errors ?? 0} errors · ${s?.warnings ?? 0} warnings`;
  }, [validation]);

  const addLog = (level: string, category: string, text: string) => {
    setLogs((prev) => [...prev, { ts: new Date().toISOString(), level, category, text }].slice(-400));
  };

  const loadDoc = (nextDoc: any, source = 'doc') => {
    const validated = Pro2D_validateState(nextDoc);
    setDoc({ ...nextDoc });
    setValidation({ ...validated });
    pushToStore(Pro2D_toSceneBundle(nextDoc));
    clearSelection();
    addLog('info', source, `loaded ${Object.keys(nextDoc?.entities || {}).length} entities / ${Object.keys(nextDoc?.nodes || {}).length} nodes`);
  };

  const patchEntity = (entityId: string, patch: Record<string, unknown>) => {
    const next = Pro2D_patchState(liveDoc, entityId, patch);
    loadDoc(next, 'patch');
  };

  const recomputePipelineMetrics = (sourceDoc: any) => {
    const metrics = Pro2D_runEmitPipeline(Pro2D_extractPipelineInput(sourceDoc)).metrics;
    setPipelineMetrics(metrics);
    return metrics;
  };

  const onAction = (actionId: string, payload?: any) => {
    if (actionId === 'loadMock') {
      const next = Pro2D_buildMockState();
      loadDoc(next, 'mock');
      recomputePipelineMetrics(next);
      return;
    }
    if (actionId === 'pullInput') {
      try {
        const getter = (window as any).__getCoord2PcfSnapshot;
        const snapshot = typeof getter === 'function' ? getter() : {};
        const safe = Pro2D_safeCoordSnapshot(snapshot);
        setInputSnapshot(safe);
        const next = Pro2D_fromCoord2PcfSnapshot(safe);
        loadDoc(next, 'coord2pcf');
        recomputePipelineMetrics(next);
      } catch (err: any) {
        addLog('error', 'coord2pcf', `snapshot pull failed: ${err?.message || String(err)}`);
      }
      return;
    }
    if (actionId === 'validate') {
      const result = { ...Pro2D_validateState(liveDoc) };
      setValidation(result);
      addLog(result.summary.errors > 0 ? 'error' : 'info', 'validate', `${result.summary.errors} errors / ${result.summary.warnings} warnings`);
      return;
    }
    if (actionId === 'benchmark') {
      const result = Pro2D_runBenchmark(liveDoc);
      setBenchmark(result);
      addLog('info', 'benchmark', `mock=${result.phase1LoadMs}ms validate=${result.phase1ValidateMs}ms 10k=${result.phase3Load10kMs}ms`);
      return;
    }
    if (actionId === 'clear') {
      loadDoc(Pro2D_createEmptyState('Pro2D Empty'), 'clear');
      setPipelineMetrics(null);
      return;
    }
    if (actionId === 'exportSvg') {
      setLastSvg(Pro2D_exportSimpleSvg(liveDoc));
      addLog('info', 'interop', 'SVG export generated from live document');
      return;
    }
    
    if (actionId === 'importDxf') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.dxf';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const entities = Pro2D_importSimpleDxf(text);
        
        const next = Pro2D_createEmptyState('Imported DXF');
        next.document.sourceKinds = ['dxf'];
        
        // Basic mapping of DXF lines to pipes
        let routeNodes = [];
        let nodeIdx = 1;
        let segIdx = 1;
        
        entities.forEach(ent => {
          if (ent.type === 'LINE') {
            const n1Id = 'n' + nodeIdx++;
            const n2Id = 'n' + nodeIdx++;
            next.nodes[n1Id] = { id: n1Id, pt: { x: parseFloat(ent['10']), y: parseFloat(ent['20']), z: parseFloat(ent['30']) || 0 }, kind: 'PIPE_ENDPOINT', entityIds: ['seg_' + segIdx] };
            next.nodes[n2Id] = { id: n2Id, pt: { x: parseFloat(ent['11']), y: parseFloat(ent['21']), z: parseFloat(ent['31']) || 0 }, kind: 'PIPE_ENDPOINT', entityIds: ['seg_' + segIdx] };
            
            next.entities['seg_' + segIdx] = {
              id: 'seg_' + segIdx, type: 'PIPE', routeId: 'route_main', layerId: ent['8'] || 'Default',
              geometry: { nodeIds: [n1Id, n2Id] },
              topology: { connectionNodeIds: [n1Id, n2Id], prevEntityId: null, nextEntityId: null },
              engineering: { nd: 100, specKey: 'BEBW' },
              display: { visible: true, label: 'seg_' + segIdx },
              metadata: { imported: { dxf: { layer: ent['8'] } } }, provenance: [], dynamic: {}
            };
            
            routeNodes.push('seg_' + segIdx);
            segIdx++;
          }
        });
        
        next.routes = { route_main: { id: 'route_main', entityIds: routeNodes, startNodeId: 'n1', endNodeId: 'n' + (nodeIdx - 1), routeKind: 'PRIMARY' } };
        
        loadDoc(next, 'dxf_import');
        recomputePipelineMetrics(next);
      };
      input.click();
      return;
    }
    if (actionId === 'exportDxf') {
      setLastDxf(Pro2D_exportSimpleDxf(Pro2D_toSceneBundle(liveDoc)));
      addLog('info', 'interop', 'DXF export generated from live scene bundle');
      return;
    }
    if (actionId === 'emitCuts' || actionId === 'autoSupports') {
      const metrics = recomputePipelineMetrics(liveDoc);
      addLog('info', 'pipeline', `${actionId} emits=${metrics.emitCount} supports=${metrics.autoSupportCount} elements=${metrics.finalElementCount}`);
      return;
    }
    if (actionId === 'routeToPcf') {
      const selectedIds = Array.from(useSceneStore.getState().selectedIds);
      const docEntities = liveDoc.entities || {};
      const docNodes = liveDoc.nodes || {};
      
      let entitiesToExport = Object.values(docEntities);
      if (selectedIds.length > 0) {
          entitiesToExport = selectedIds.map(id => docEntities[id]).filter(Boolean);
      }
      
      const pcfComponents = [];
      let seq = 1;
      
      // Basic mapping from Pro2D segments to PCF components (simulating what Coor2PCF does)
      entitiesToExport.forEach(ent => {
          if (ent.type === 'PIPE' || ent.type === 'SEGMENT') {
              const nodeIds = ent.geometry?.nodeIds || [];
              const n1 = docNodes[nodeIds[0]]?.pt || {x: 0, y: 0, z: 0};
              const n2 = docNodes[nodeIds[nodeIds.length - 1]]?.pt || {x: 0, y: 0, z: 0};
              pcfComponents.push({
                  type: 'PIPE',
                  seqNo: seq++,
                  ep1: { x: n1.x, y: n1.y, z: n1.z || 0 },
                  ep2: { x: n2.x, y: n2.y, z: n2.z || 0 },
                  bore: ent.engineering?.nd || 100,
                  ca: {}
              });
          }
      });
      
      if (pcfComponents.length === 0) {
          addLog('error', 'interop', 'No pipes found to export to PCF');
          return;
      }
      
      const { pcfText } = generatePCF(pcfComponents, {
          bore: pcfComponents[0].bore || 100,
          pipelineRef: 'PRO2D_EXPORT',
          ca: {},
          decimalPrecision: 4,
          windowsLineEndings: true
      });
      
      // Download it
      const blob = new Blob([pcfText], { type: 'text/plain' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'pro2d_export.pcf'; a.click();
      URL.revokeObjectURL(url);
      
      addLog('info', 'interop', `Exported PCF with ${pcfComponents.length} components (${selectedIds.length > 0 ? 'selected' : 'all'})`);
      return;
    }
    if (actionId === 'copyLogs') {
      const text = logs.map((x) => `[${x.ts}] [${x.level}] [${x.category}] ${x.text}`).join('\n');
      navigator.clipboard?.writeText(text).catch(() => {});
      addLog('info', 'debug', 'log copied to clipboard');
      return;
    }
    if (actionId === 'clearLogs') {
      setLogs([]);
      return;
    }
    if (actionId.startsWith('tool_')) {
      const toolId = actionId.replace('tool_', '');
      const meta: any = Pro2D_toolMap[toolId];
      if (meta?.implemented === false) {
        addLog('error', 'tool', `[${toolId}] ${meta.note || 'Planned, not implemented yet.'}`);
        return;
      }
      if (toolId === 'marquee') {
        useSceneStore.getState().setActiveTool('marquee' as any);
        addLog('info', 'tool', 'marquee uses select-mode drag selection in current viewport');
        return;
      }
      if (toolId === 'underlay') {
        addLog('info', 'tool', 'underlay is store-supported; image picker wiring remains external');
        return;
      }
      useSceneStore.getState().setActiveTool(toolId as any);
      addLog('info', 'tool', `${toolId} activated${payload ? ` (${JSON.stringify(payload)})` : ''}`);
      return;
    }
    addLog('error', 'unhandled', `${actionId} has no command implementation`);
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-200">
      <Pro2D_Ribbon onAction={(id) => onAction(id)} />
      <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/80 text-xs flex items-center justify-between">
        <div>
          <span className="font-semibold text-amber-300">Pro 2D Canvas</span>
          <span className="ml-2 text-slate-400">Revised patch: live-state property sync, safer Coor2PCF pull, truthful pipeline metrics, non-duplicated left rail.</span>
        </div>
        <div className="text-slate-300">{summaryText}</div>
      </div>
      <div className="flex min-h-0 flex-1">
        <Pro2D_LeftRail />
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 relative">
            <Smart2Dcanvas_CanvasViewport />
          <Pro2D_3DThumbnail entities={liveDoc.entities} nodes={liveDoc.nodes} />
          </div>
          <div className="max-h-[230px] overflow-auto border-t border-slate-800">
            <Pro2D_CoorOpsPanel inputSnapshot={inputSnapshot} pipelineMetrics={pipelineMetrics} onAction={onAction} liveDoc={liveDoc} />
          </div>
          {(lastSvg || lastDxf) && (
            <div className="border-t border-slate-800 bg-slate-950 text-xs grid grid-cols-2 gap-0 max-h-40 overflow-auto">
              <div className="border-r border-slate-800 p-2">
                <div className="uppercase text-[10px] tracking-wide text-cyan-400 mb-1">SVG export preview</div>
                <pre className="whitespace-pre-wrap break-all text-slate-300">{lastSvg || '—'}</pre>
              </div>
              <div className="p-2">
                <div className="uppercase text-[10px] tracking-wide text-emerald-400 mb-1">DXF export preview</div>
                <pre className="whitespace-pre-wrap break-all text-slate-300">{lastDxf || '—'}</pre>
              </div>
            </div>
          )}
          <div className="max-h-[180px] overflow-hidden border-t border-slate-800">
            <Pro2D_DebugDock logs={logs} validation={validation} benchmark={benchmark} pipelineMetrics={pipelineMetrics} onAction={onAction} />
          </div>
          <Smart2Dcanvas_StatusBar />
        </div>
        <div className="w-[360px] min-w-[360px]">
          <Pro2D_PropertyPanel doc={liveDoc} validation={validation} onPatchEntity={patchEntity} />
        </div>
      </div>
    </div>
  );
};

export default Pro2D_AppShell;
