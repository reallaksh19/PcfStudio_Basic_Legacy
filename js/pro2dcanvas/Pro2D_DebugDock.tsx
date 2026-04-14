import React, { useMemo, useState } from 'react';

type LogEntry = { ts: string; level: string; category: string; text: string };

const Pro2D_DebugDock: React.FC<{
  logs: LogEntry[];
  validation: any;
  benchmark: any;
  pipelineMetrics: any;
  onAction?: (actionId: string) => void;
}> = ({ logs, validation, benchmark, pipelineMetrics, onAction }) => {
  const [levelFilter, setLevelFilter] = useState<'all'|'info'|'error'>('all');
  const filteredLogs = useMemo(() => logs.filter((log) => levelFilter === 'all' ? true : log.level === levelFilter).slice(-60).reverse(), [logs, levelFilter]);

  return (
    <div className="bg-black/60 text-[11px] text-slate-300 grid grid-cols-3 min-h-[140px] max-h-[180px] overflow-hidden">
      <div className="border-r border-slate-800 p-2 overflow-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="uppercase tracking-wide text-cyan-400">Action Log</div>
          <div className="flex gap-1">
            <button className="px-1 rounded border border-slate-700" onClick={() => setLevelFilter('all')}>All</button>
            <button className="px-1 rounded border border-slate-700" onClick={() => setLevelFilter('info')}>Info</button>
            <button className="px-1 rounded border border-slate-700" onClick={() => setLevelFilter('error')}>Err</button>
            <button className="px-1 rounded border border-slate-700" onClick={() => onAction?.('copyLogs')}>Copy</button>
            <button className="px-1 rounded border border-slate-700" onClick={() => onAction?.('clearLogs')}>Clear</button>
          </div>
        </div>
        <div className="space-y-1">
          {filteredLogs.length === 0 ? <div className="text-slate-500">No actions recorded.</div> : filteredLogs.map((log, i) => (
            <div key={i} className={log.level === 'error' ? 'text-rose-300' : 'text-slate-300'}>
              <span className="text-slate-500">[{log.ts.slice(11,19)}]</span> <span className="text-sky-300">[{log.category}]</span> {log.text}
            </div>
          ))}
        </div>
      </div>
      <div className="border-r border-slate-800 p-2 overflow-auto">
        <div className="uppercase tracking-wide text-amber-400 mb-2">Validation</div>
        <div>Errors: {validation?.summary?.errors ?? 0}</div>
        <div>Warnings: {validation?.summary?.warnings ?? 0}</div>
        <div>Entities: {validation?.summary?.totalEntities ?? 0}</div>
        <div>Nodes: {validation?.summary?.totalNodes ?? 0}</div>
        <div>Routes: {validation?.summary?.totalRoutes ?? 0}</div>
        <div className="mt-2 space-y-1">
          {(validation?.issues || []).slice(0, 8).map((issue: any, idx: number) => (
            <div key={idx} className={issue.severity === 'error' ? 'text-rose-300' : 'text-amber-200'}>{issue.code}: {issue.message}</div>
          ))}
        </div>
      </div>
      <div className="p-2 overflow-auto">
        <div className="uppercase tracking-wide text-emerald-400 mb-2">Performance / Pipeline</div>
        <div>Emit route points: {pipelineMetrics?.routePointCount ?? '—'}</div>
        <div>Emit count: {pipelineMetrics?.emitCount ?? '—'}</div>
        <div>Auto supports: {pipelineMetrics?.autoSupportCount ?? '—'}</div>
        <div>Final elements: {pipelineMetrics?.finalElementCount ?? '—'}</div>
        <div className="mt-2">Benchmark mock load: {benchmark?.phase1LoadMs ?? '—'} ms</div>
        <div>Benchmark validate: {benchmark?.phase1ValidateMs ?? '—'} ms</div>
        <div>Benchmark scene bundle: {benchmark?.phase1SceneBundleMs ?? '—'} ms</div>
        <div>Benchmark emit pipeline: {benchmark?.phase2EmitPipelineMs ?? '—'} ms</div>
        <div>Benchmark 10k load: {benchmark?.phase3Load10kMs ?? '—'} ms</div>
        <div>Benchmark 10k validate: {benchmark?.phase3Validate10kMs ?? '—'} ms</div>
      </div>
    </div>
  );
};

export default Pro2D_DebugDock;
