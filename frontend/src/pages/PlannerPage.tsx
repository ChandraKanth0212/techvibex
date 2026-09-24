import React, { useState, useMemo } from 'react';
import {
  CalendarDays,
  AlertTriangle,
  Clock,
  TrainTrack,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DepartmentBadge } from '@/components/common/DepartmentBadge';
import { LoadingState } from '@/components/common/LoadingState';
import {
  useMaintenanceTasks,
  useIntegratedBlocks,
  useTrainSchedule,
  useConflicts,
} from '@/hooks';
import type { Department } from '@/types/asset';
import { formatTime, formatDate, formatDuration } from '@/utils';

export const PlannerPage: React.FC = () => {
  const [horizon, setHorizon] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const [selectedItem, setSelectedItem] = useState<{
    title: string;
    type: 'TASK' | 'BLOCK' | 'TRAIN';
    details: Record<string, any>;
  } | null>(null);

  const { data: tasks, isLoading: isTasksLoading } = useMaintenanceTasks();
  const { data: blocks, isLoading: isBlocksLoading } = useIntegratedBlocks();
  const { data: trains } = useTrainSchedule();
  const { data: conflicts } = useConflicts();

  // Find tasks/blocks that have conflicts
  const conflictedTaskIds = useMemo(() => {
    if (!conflicts) return new Set<string>();
    const ids = new Set<string>();
    conflicts
      .filter((c) => ['OPEN', 'UNDER_REVIEW'].includes(c.resolutionStatus))
      .forEach((c) => c.affectedTaskIds.forEach((id) => ids.add(id)));
    return ids;
  }, [conflicts]);

  const conflictedBlockIds = useMemo(() => {
    if (!conflicts) return new Set<string>();
    const ids = new Set<string>();
    conflicts
      .filter((c) => ['OPEN', 'UNDER_REVIEW'].includes(c.resolutionStatus))
      .forEach((c) => c.affectedBlockIds.forEach((id) => ids.add(id)));
    return ids;
  }, [conflicts]);

  const departments: { key: Department; label: string; sub: string }[] = [
    { key: 'ENGINEERING', label: 'Engineering Lane', sub: 'Track, Turnouts, Bridges' },
    { key: 'SNT', label: 'S&T Lane', sub: 'Signals, Point Machines, Axle Counters' },
    { key: 'TRACTION', label: 'Traction Lane', sub: 'OHE, Catenary, Isolators' },
  ];

  const isLoading = isTasksLoading || isBlocksLoading;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Corridor Block Planner"
        description="Synchronize multi-department maintenance slots alongside passenger train paths and freight corridors."
        icon={CalendarDays}
        badge="SC DIVISION"
        actions={
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 font-mono text-xs">
            <button
              onClick={() => setHorizon('WEEKLY')}
              className={`px-3 py-1 rounded transition-colors ${
                horizon === 'WEEKLY'
                  ? 'bg-blue-600 text-white font-medium shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Weekly Horizon (Sept 25 - Oct 01)
            </button>
            <button
              onClick={() => setHorizon('MONTHLY')}
              className={`px-3 py-1 rounded transition-colors ${
                horizon === 'MONTHLY'
                  ? 'bg-blue-600 text-white font-medium shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Monthly Horizon (Oct 02 - Oct 15)
            </button>
          </div>
        }
      />

      {/* Horizon summary banner */}
      <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2 text-slate-300">
          <Clock className="w-4 h-4 text-blue-400" />
          <span>Active Scope: </span>
          <span className="text-blue-400 font-bold">
            {horizon === 'WEEKLY' ? '7-Day Rolling Horizon (Execution Phase)' : '14-Day Strategic Planning Horizon'}
          </span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span> Integrated Bundles
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Department Tasks
          </span>
          <span className="flex items-center gap-1 text-rose-400 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" /> Overlap Clashes
          </span>
        </div>
      </div>

      {isLoading ? (
        <LoadingState message="Building planner timeline lanes..." />
      ) : (
        <div className="space-y-4">
          {/* ── DEPARTMENT LANES ────────────────────────────────────────────── */}
          {departments.map(({ key, label, sub }) => {
            const deptTasks = (tasks || []).filter((t) => t.department === key);
            const deptBlocks = (blocks || []).filter((b) => b.departments.includes(key));

            return (
              <div
                key={key}
                className="rounded-lg bg-slate-900/60 border border-slate-800 overflow-hidden"
              >
                <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <DepartmentBadge department={key} size="md" />
                    <div>
                      <h3 className="text-xs font-bold text-slate-200 font-mono">{label}</h3>
                      <p className="text-[10px] text-slate-400 font-mono">{sub}</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    {deptTasks.length} Work Orders | {deptBlocks.length} Integrated
                  </span>
                </div>

                <div className="p-3.5 overflow-x-auto">
                  <div className="flex gap-3 min-w-[700px]">
                    {/* Integrated Blocks for this dept */}
                    {deptBlocks.map((b) => {
                      const hasConflict = conflictedBlockIds.has(b.blockId);
                      return (
                        <div
                          key={b.blockId}
                          onClick={() =>
                            setSelectedItem({
                              title: `Integrated Block: ${b.blockId}`,
                              type: 'BLOCK',
                              details: b,
                            })
                          }
                          className={`p-3 rounded-lg border transition-all cursor-pointer w-64 shrink-0 font-mono text-xs flex flex-col justify-between ${
                            hasConflict
                              ? 'bg-rose-500/10 border-rose-500/40 hover:border-rose-500'
                              : 'bg-cyan-500/5 border-cyan-500/30 hover:border-cyan-500/60'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                              <span className="font-bold text-cyan-300">{b.blockId}</span>
                              {hasConflict ? (
                                <span className="text-[10px] text-rose-400 flex items-center gap-0.5">
                                  <AlertTriangle className="w-3 h-3" /> Conflict
                                </span>
                              ) : (
                                <StatusBadge status={b.status} size="sm" />
                              )}
                            </div>
                            <p className="text-slate-200 mt-2 font-medium truncate">{b.sectionId}</p>
                            <p className="text-[10px] text-slate-400">
                              {b.fromStation} ↔ {b.toStation}
                            </p>
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 flex justify-between items-center">
                            <span>{formatDate(b.date)}</span>
                            <span className="text-cyan-400 font-semibold">{formatDuration(b.durationMinutes)}</span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Department Specific Maintenance Tasks */}
                    {deptTasks.slice(0, 4).map((t) => {
                      const hasConflict = conflictedTaskIds.has(t.taskId);
                      return (
                        <div
                          key={t.taskId}
                          onClick={() =>
                            setSelectedItem({
                              title: `Maintenance Task: ${t.taskId}`,
                              type: 'TASK',
                              details: t,
                            })
                          }
                          className={`p-3 rounded-lg border transition-all cursor-pointer w-64 shrink-0 font-mono text-xs flex flex-col justify-between ${
                            hasConflict
                              ? 'bg-rose-500/10 border-rose-500/40 hover:border-rose-500'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                              <span className="font-bold text-blue-400">{t.taskId}</span>
                              {hasConflict ? (
                                <span className="text-[10px] text-rose-400 flex items-center gap-0.5">
                                  <AlertTriangle className="w-3 h-3" /> Conflict
                                </span>
                              ) : (
                                <StatusBadge status={t.status} size="sm" />
                              )}
                            </div>
                            <p className="text-slate-200 mt-2 font-sans truncate text-xs" title={t.workType}>
                              {t.workType}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{t.sectionId}</p>
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 flex justify-between items-center">
                            <span>{formatDate(t.requestedDate)}</span>
                            <span className="text-slate-300">{formatDuration(t.durationMinutes)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

          {/* ── TRAIN TIMETABLE CONSTRAINTS LANE ────────────────────────────── */}
          <div className="rounded-lg bg-slate-900/60 border border-slate-800 overflow-hidden">
            <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <TrainTrack className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-200 font-mono">Train Timetable Constraints Lane</h3>
                  <p className="text-[10px] text-slate-400 font-mono">High-priority express & passenger slots</p>
                </div>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {trains?.length ?? 0} Active Corridor Paths
              </span>
            </div>

            <div className="p-3.5 overflow-x-auto">
              <div className="flex gap-3 min-w-[700px]">
                {(trains || []).slice(0, 6).map((tr) => (
                  <div
                    key={tr.trainId}
                    onClick={() =>
                      setSelectedItem({
                        title: `Train Constraint: ${tr.trainNumber}`,
                        type: 'TRAIN',
                        details: tr,
                      })
                    }
                    className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 hover:border-slate-700 cursor-pointer w-60 shrink-0 font-mono text-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                        <span className="font-bold text-slate-200">{tr.trainNumber}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          {tr.trainType}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-2">{tr.sectionId}</p>
                      <p className="text-[10px] text-slate-400">{tr.direction} Line Priority P{tr.operationalPriority}</p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 flex justify-between">
                      <span>Window</span>
                      <span className="text-slate-200">
                        {formatTime(tr.arrivalTime)} - {formatTime(tr.departureTime)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DETAIL MODAL ──────────────────────────────────────────────────────── */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-sm font-mono text-slate-100">{selectedItem.title}</h3>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono">
              {Object.entries(selectedItem.details)
                .filter(([k]) => typeof selectedItem.details[k] !== 'object')
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between p-2 rounded bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400">{k}:</span>
                    <span className="text-slate-200 font-medium">{String(v)}</span>
                  </div>
                ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-mono"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default PlannerPage;
