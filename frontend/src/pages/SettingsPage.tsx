import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  Building2,
  Sliders,
  RotateCcw,
  CheckCircle2,
  Shield,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { useResetDemo } from '@/hooks';

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const resetDemo = useResetDemo();

  const [selectedDivision, setSelectedDivision] = useState('SC');
  const [minConfidence, setMinConfidence] = useState(75);
  const [maxDelayTolerance, setMaxDelayTolerance] = useState(30);
  const [autoFlagOverdue, setAutoFlagOverdue] = useState(true);
  const [notifyConflicts, setNotifyConflicts] = useState(true);
  const [isResetSuccess, setIsResetSuccess] = useState(false);

  const handleReset = async () => {
    await resetDemo();
    await queryClient.invalidateQueries();
    setIsResetSuccess(true);
    setTimeout(() => setIsResetSuccess(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="System & Division Settings"
        description="Configure operational division parameters, optimization heuristics, and demo environment settings."
        icon={Settings}
        badge="SC SECUNDERABAD"
      />

      {/* ── 1. Operational Division Configuration ─────────────────────────────────── */}
      <div className="p-5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
          <Building2 className="w-5 h-5 text-blue-400" />
          <div>
            <h3 className="text-xs font-bold font-mono text-slate-200 uppercase">
              Railway Division & Zone Configuration
            </h3>
            <p className="text-[11px] text-slate-400">
              Assigned territorial boundary and divisional control center context.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
          <div>
            <label className="text-[11px] font-mono text-slate-400 block mb-1">
              Active Control Division
            </label>
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
            >
              <option value="SC">SC - Secunderabad (South Central Railway)</option>
              <option value="HYB">HYB - Hyderabad (South Central Railway)</option>
              <option value="BZA">BZA - Vijayawada (South Central Railway)</option>
              <option value="GNT">GNT - Guntur (South Central Railway)</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-mono text-slate-400 block mb-1">
              Zonal Headquarters
            </label>
            <div className="bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 font-mono text-xs">
              South Central Railway (SCR), Rail Nilayam
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Optimization Heuristics & Rules ───────────────────────────────────── */}
      <div className="p-5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
          <Sliders className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="text-xs font-bold font-mono text-slate-200 uppercase">
              Optimization Heuristics & Shadow Windows
            </h3>
            <p className="text-[11px] text-slate-400">
              Heuristic thresholds governing multi-department bundling proposals.
            </p>
          </div>
        </div>

        <div className="space-y-4 text-xs font-sans">
          <div>
            <div className="flex justify-between font-mono mb-1 text-slate-300">
              <span>Minimum Bundling Synergy Confidence:</span>
              <span className="text-cyan-400 font-bold">{minConfidence}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="95"
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400 mt-0.5">
              Blocks below this threshold will not be flagged as candidate shadow bundles.
            </p>
          </div>

          <div>
            <div className="flex justify-between font-mono mb-1 text-slate-300">
              <span>Maximum Passenger Train Delay Tolerance:</span>
              <span className="text-amber-400 font-bold">{maxDelayTolerance} minutes</span>
            </div>
            <input
              type="range"
              min="10"
              max="60"
              step="5"
              value={maxDelayTolerance}
              onChange={(e) => setMaxDelayTolerance(Number(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer"
            />
          </div>

          <div className="pt-2 flex flex-col gap-2 font-mono">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoFlagOverdue}
                onChange={(e) => setAutoFlagOverdue(e.target.checked)}
                className="rounded bg-slate-950 border-slate-700 text-blue-500"
              />
              <span>Auto-escalate tasks overdue by &gt; 7 days to CRITICAL priority</span>
            </label>

            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyConflicts}
                onChange={(e) => setNotifyConflicts(e.target.checked)}
                className="rounded bg-slate-950 border-slate-700 text-blue-500"
              />
              <span>Real-time conflict detection alerts across corridor channels</span>
            </label>
          </div>
        </div>
      </div>

      {/* ── 3. Demo Environment Controls ────────────────────────────────────────── */}
      <div className="p-5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
          <RotateCcw className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="text-xs font-bold font-mono text-slate-200 uppercase">
              SIH Demo Environment Controls
            </h3>
            <p className="text-[11px] text-slate-400">
              Reset prototype in-memory mutations back to fresh canonical state.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-950/60 p-4 rounded-lg border border-slate-800 font-mono text-xs">
          <div>
            <p className="text-slate-200 font-semibold">Reset Demo Data State</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Reverts all approved/rejected requests, deferred tasks, and resolved conflicts.
            </p>
          </div>

          <button
            onClick={handleReset}
            className="px-4 py-2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 font-bold transition-colors flex items-center gap-2"
          >
            {isResetSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Demo State Reset!</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                <span>Reset Demo State</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── 4. System Status Diagnostic ─────────────────────────────────────────── */}
      <div className="p-4 rounded-lg bg-slate-950/40 border border-slate-800/80 flex items-center justify-between font-mono text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>System Status:</span>
          <span className="text-emerald-400 font-bold">RailOpt M4 Command Center Online</span>
        </div>
        <div className="text-[10px] text-slate-400">
          SECUNDERABAD (SC) v0.1.0 • TanStack Query Active
        </div>
      </div>
    </div>
  );
};
export default SettingsPage;
