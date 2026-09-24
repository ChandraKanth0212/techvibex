import React from 'react';
import { LayoutDashboard, Activity, CheckCircle2, Clock, AlertTriangle, Layers } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';

export const DashboardPage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="Command Center Dashboard"
        description="Real-time integrated railway maintenance block monitoring and operational overview."
        icon={LayoutDashboard}
        badge="MODULE 4"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-mono">ACTIVE BLOCKS</p>
            <h3 className="text-2xl font-bold text-slate-100 mt-1 font-mono">14</h3>
            <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> 100% on schedule
            </p>
          </div>
          <div className="w-10 h-10 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-mono">PENDING REQUESTS</p>
            <h3 className="text-2xl font-bold text-slate-100 mt-1 font-mono">8</h3>
            <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Awaiting approval
            </p>
          </div>
          <div className="w-10 h-10 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-mono">CONFLICT ALERTS</p>
            <h3 className="text-2xl font-bold text-slate-100 mt-1 font-mono">3</h3>
            <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Time overlap risks
            </p>
          </div>
          <div className="w-10 h-10 rounded-md bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-mono">INTEGRATED GROUPS</p>
            <h3 className="text-2xl font-bold text-slate-100 mt-1 font-mono">6</h3>
            <p className="text-[11px] text-cyan-400 mt-1 flex items-center gap-1">
              <Layers className="w-3 h-3" /> Shadow blocks combined
            </p>
          </div>
          <div className="w-10 h-10 rounded-md bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="p-8 rounded-lg bg-slate-900/40 border border-dashed border-slate-800 text-center">
        <h4 className="text-sm font-medium text-slate-300">Command Center Shell Active</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
          Module 4 layout, navigation, and API service boundaries are established. Ready for component integration.
        </p>
      </div>
    </div>
  );
};
