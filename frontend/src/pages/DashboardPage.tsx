import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  Clock,
  AlertTriangle,
  Layers,
  AlertOctagon,
  CalendarClock,
  TrendingUp,
  ArrowRight,
  Check,
  X,
  ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { KpiCard } from '@/components/common/KpiCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DepartmentBadge } from '@/components/common/DepartmentBadge';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import {
  useDashboardMetrics,
  useDepartmentSummaries,
  useMaintenanceTasks,
  useBlockRequests,
  useConflicts,
  useIntegratedBlocks,
  useApproveBlockRequest,
  useRejectBlockRequest,
} from '@/hooks';
import { formatTime } from '@/utils';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  // Data queries
  const { data: metrics, isLoading: isMetricsLoading, isError: isMetricsError } = useDashboardMetrics();
  const { data: deptSummaries, isLoading: isDeptLoading } = useDepartmentSummaries();
  const { data: tasks, isLoading: isTasksLoading } = useMaintenanceTasks();
  const { data: requests, isLoading: isRequestsLoading } = useBlockRequests();
  const { data: conflicts, isLoading: isConflictsLoading } = useConflicts();
  const { data: integratedBlocks, isLoading: isBlocksLoading } = useIntegratedBlocks();

  // Mutations
  const approveMutation = useApproveBlockRequest();
  const rejectMutation = useRejectBlockRequest();

  // Filtered views for useful sections
  const criticalTasks = (tasks || [])
    .filter((t) => t.criticality === 'CRITICAL' || t.overdueDays > 0)
    .slice(0, 5);

  const pendingRequests = (requests || [])
    .filter((r) => ['PENDING', 'ANALYZING', 'INTEGRATION_CANDIDATE'].includes(r.status))
    .slice(0, 5);

  const activeConflicts = (conflicts || [])
    .filter((c) => ['OPEN', 'UNDER_REVIEW'].includes(c.resolutionStatus))
    .slice(0, 5);

  const activeBlocksSummary = (integratedBlocks || []).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Command Center Dashboard"
        description="Real-time integrated railway maintenance block monitoring and operational overview."
        icon={LayoutDashboard}
        badge="MODULE 4"
      />

      {/* ── 1. KPI CARDS ────────────────────────────────────────────────────────── */}
      {isMetricsError ? (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
          Failed to load dashboard metrics. Please try again.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <KpiCard
            title="Active Blocks"
            value={metrics?.activeBlocks ?? 0}
            icon={Activity}
            color="blue"
            loading={isMetricsLoading}
            subtitle="Scheduled / in action"
            onClick={() => navigate('/integrated-blocks')}
          />
          <KpiCard
            title="Pending Requests"
            value={metrics?.pendingRequests ?? 0}
            icon={Clock}
            color="amber"
            loading={isMetricsLoading}
            subtitle="Awaiting authorization"
            onClick={() => navigate('/block-requests')}
          />
          <KpiCard
            title="Conflicts"
            value={metrics?.conflictAlerts ?? 0}
            icon={AlertTriangle}
            color="rose"
            loading={isMetricsLoading}
            subtitle="Live risk detections"
            onClick={() => navigate('/conflicts')}
          />
          <KpiCard
            title="Integrated Blocks"
            value={metrics?.integratedBlocks ?? 0}
            icon={Layers}
            color="cyan"
            loading={isMetricsLoading}
            subtitle="Multi-department shared"
            onClick={() => navigate('/integrated-blocks')}
          />
          <KpiCard
            title="Critical Tasks"
            value={metrics?.criticalTasks ?? 0}
            icon={AlertOctagon}
            color="rose"
            loading={isMetricsLoading}
            subtitle="Immediate priority"
            onClick={() => navigate('/maintenance')}
          />
          <KpiCard
            title="Overdue Tasks"
            value={metrics?.overdueTasks ?? 0}
            icon={CalendarClock}
            color="amber"
            loading={isMetricsLoading}
            subtitle="Exceeded schedule target"
            onClick={() => navigate('/maintenance')}
          />
          <KpiCard
            title="Corridor Utilization"
            value={`${metrics?.corridorUtilization ?? 0}%`}
            icon={TrendingUp}
            color="emerald"
            loading={isMetricsLoading}
            subtitle="Capacity utilized"
            onClick={() => navigate('/corridors')}
          />
        </div>
      )}

      {/* ── 2. DEPARTMENT SUMMARY ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            Department Maintenance Breakdown
          </h2>
          <span className="text-[11px] text-slate-400 font-mono">Secunderabad Division (SC)</span>
        </div>

        {isDeptLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-lg bg-slate-900/40 border border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(deptSummaries || []).map((summary) => (
              <div
                key={summary.department}
                className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                  <DepartmentBadge department={summary.department} size="md" />
                  <span className="text-[11px] font-mono text-slate-400">
                    {summary.totalTasks} Total Tasks
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3 pt-1 text-center font-mono">
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                    <p className="text-[10px] text-slate-400 uppercase">Critical</p>
                    <p className="text-base font-bold text-rose-400 mt-0.5">{summary.criticalTasks}</p>
                  </div>
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                    <p className="text-[10px] text-slate-400 uppercase">Pending</p>
                    <p className="text-base font-bold text-amber-400 mt-0.5">{summary.pendingRequests}</p>
                  </div>
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                    <p className="text-[10px] text-slate-400 uppercase">Bundled</p>
                    <p className="text-base font-bold text-cyan-400 mt-0.5">{summary.integratedBlocks}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 3. USEFUL SECTIONS (2x2 GRID) ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 1: Critical Maintenance */}
        <div className="rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-rose-400" />
              <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wide">
                Critical Maintenance Work
              </h3>
            </div>
            <button
              onClick={() => navigate('/maintenance')}
              className="text-[11px] text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1 transition-colors"
            >
              <span>View All</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="p-3 flex-1">
            {isTasksLoading ? (
              <LoadingState message="Loading critical tasks..." />
            ) : criticalTasks.length === 0 ? (
              <EmptyState title="No critical tasks" description="All high-priority maintenance jobs are clear." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="text-[11px] text-slate-400 font-mono border-b border-slate-800/80">
                      <th className="pb-2 font-medium">Task ID</th>
                      <th className="pb-2 font-medium">Dept</th>
                      <th className="pb-2 font-medium">Work Description</th>
                      <th className="pb-2 font-medium">Section</th>
                      <th className="pb-2 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {criticalTasks.map((t) => (
                      <tr
                        key={t.taskId}
                        onClick={() => navigate('/maintenance')}
                        className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 font-mono text-blue-400 font-medium">{t.taskId}</td>
                        <td className="py-2.5">
                          <DepartmentBadge department={t.department} size="sm" showIcon={false} />
                        </td>
                        <td className="py-2.5 max-w-[200px] truncate text-slate-200" title={t.workType}>
                          {t.workType}
                        </td>
                        <td className="py-2.5 font-mono text-slate-400">{t.sectionId}</td>
                        <td className="py-2.5 text-right">
                          <StatusBadge status={t.status} size="sm" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Pending Blocks */}
        <div className="rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wide">
                Pending Block Applications
              </h3>
            </div>
            <button
              onClick={() => navigate('/block-requests')}
              className="text-[11px] text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1 transition-colors"
            >
              <span>View All</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="p-3 flex-1">
            {isRequestsLoading ? (
              <LoadingState message="Loading pending requests..." />
            ) : pendingRequests.length === 0 ? (
              <EmptyState title="No pending requests" description="No block applications are awaiting authorization." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="text-[11px] text-slate-400 font-mono border-b border-slate-800/80">
                      <th className="pb-2 font-medium">Req ID</th>
                      <th className="pb-2 font-medium">Dept</th>
                      <th className="pb-2 font-medium">Section</th>
                      <th className="pb-2 font-medium">Duration</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {pendingRequests.map((r) => (
                      <tr key={r.requestId} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 font-mono text-blue-400 font-medium">{r.requestId}</td>
                        <td className="py-2">
                          <DepartmentBadge department={r.department} size="sm" showIcon={false} />
                        </td>
                        <td className="py-2 font-mono text-slate-300">{r.sectionId}</td>
                        <td className="py-2 font-mono text-slate-400">{r.durationMinutes}m</td>
                        <td className="py-2">
                          <StatusBadge status={r.status} size="sm" />
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => approveMutation.mutate({ requestId: r.requestId })}
                              title="Approve Request"
                              disabled={approveMutation.isPending}
                              className="p-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => rejectMutation.mutate({ requestId: r.requestId })}
                              title="Reject Request"
                              disabled={rejectMutation.isPending}
                              className="p-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Active Conflicts */}
        <div className="rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wide">
                Active Operational Conflicts
              </h3>
            </div>
            <button
              onClick={() => navigate('/conflicts')}
              className="text-[11px] text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1 transition-colors"
            >
              <span>Manage Conflicts</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="p-3 flex-1">
            {isConflictsLoading ? (
              <LoadingState message="Loading conflicts..." />
            ) : activeConflicts.length === 0 ? (
              <EmptyState title="No active conflicts" description="Zero conflicts detected across corridors." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="text-[11px] text-slate-400 font-mono border-b border-slate-800/80">
                      <th className="pb-2 font-medium">Conflict ID</th>
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Severity</th>
                      <th className="pb-2 font-medium">Section</th>
                      <th className="pb-2 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {activeConflicts.map((c) => (
                      <tr
                        key={c.conflictId}
                        onClick={() => navigate('/conflicts')}
                        className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 font-mono text-rose-400 font-medium">{c.conflictId}</td>
                        <td className="py-2.5 font-mono text-slate-300 text-[11px]">{c.type}</td>
                        <td className="py-2.5">
                          <StatusBadge status={c.severity} size="sm" />
                        </td>
                        <td className="py-2.5 font-mono text-slate-400">{c.sectionId}</td>
                        <td className="py-2.5 text-right">
                          <StatusBadge status={c.resolutionStatus} size="sm" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Integrated Block Summary */}
        <div className="rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wide">
                Integrated Block Bundles
              </h3>
            </div>
            <button
              onClick={() => navigate('/integrated-blocks')}
              className="text-[11px] text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1 transition-colors"
            >
              <span>View All Blocks</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="p-3 flex-1">
            {isBlocksLoading ? (
              <LoadingState message="Loading integrated blocks..." />
            ) : activeBlocksSummary.length === 0 ? (
              <EmptyState title="No integrated blocks" description="No combined blocks currently created." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="text-[11px] text-slate-400 font-mono border-b border-slate-800/80">
                      <th className="pb-2 font-medium">Block ID</th>
                      <th className="pb-2 font-medium">Section</th>
                      <th className="pb-2 font-medium">Time Window</th>
                      <th className="pb-2 font-medium">Departments</th>
                      <th className="pb-2 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {activeBlocksSummary.map((b) => (
                      <tr
                        key={b.blockId}
                        onClick={() => navigate('/integrated-blocks')}
                        className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 font-mono text-cyan-400 font-medium">{b.blockId}</td>
                        <td className="py-2.5 font-mono text-slate-300">{b.sectionId}</td>
                        <td className="py-2.5 font-mono text-slate-400 text-[11px]">
                          {formatTime(b.startTime)} - {formatTime(b.endTime)} ({b.durationMinutes}m)
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-1">
                            {b.departments.map((d) => (
                              <DepartmentBadge key={d} department={d} size="sm" showIcon={false} />
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 text-right">
                          <StatusBadge status={b.status} size="sm" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default DashboardPage;
