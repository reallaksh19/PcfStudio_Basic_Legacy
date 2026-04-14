import React from 'react';
import { Pro2D_ribbonSections } from './Pro2D_RibbonConfig.mjs';

type RibbonProps = {
  onAction: (actionId: string) => void;
};

const Pro2D_Ribbon: React.FC<RibbonProps> = ({ onAction }) => {
  return (
    <div className="border-b border-slate-800 bg-slate-950 text-slate-200">
      <div className="flex overflow-x-auto gap-3 p-2">
        {Pro2D_ribbonSections.map((section) => (
          <div key={section.id} className="min-w-max rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">{section.title}</div>
            <div className="flex gap-2 flex-wrap">
              {section.actions.map((action: any) => {
                const disabled = action.implemented === false;
                return (
                  <button
                    key={action.id}
                    className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-2 ${disabled ? 'border-slate-800 bg-slate-950 text-slate-500 cursor-not-allowed opacity-60' : 'border-slate-700 bg-slate-900 hover:border-amber-500 hover:text-amber-200'}`}
                    onClick={() => disabled ? null : onAction(action.id)}
                    title={disabled ? `${action.label} — ${action.note || 'Planned, not implemented yet.'}` : action.label}
                    disabled={disabled}
                  >
                    <span>{action.icon}</span>
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Pro2D_Ribbon;
