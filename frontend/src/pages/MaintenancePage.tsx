import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wrench,
  Eye,
  AlertTriangle,
  X,
  MapPin,
  FileCheck2,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DepartmentBadge } from '@/components/common/DepartmentBadge';
import { FilterBar } from '@/components/common/FilterBar';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import {
  useMaintenanceTasks,
  useDeferMaintenanceTask,
  useUpdateTaskStatus,
} from '@/hooks';
import type { MaintenanceTask, TaskStatus } from '@/types/maintenance';
import type { Department, CriticalityLevel } from '@/types/asset';
import { formatTime, formatDate, formatDuration } from '@/utils';

export const MaintenancePage: React.FC = () => {
  const navigate = useNavigate();

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedCriticality, setSelectedCriticality] = useState<string>('ALL');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Detail Modal state
  const [selectedTask, setSelectedTask] = useState<MaintenanceTask | null>(null);
  const [deferReason, setDeferReason] = useState('');
  const [showDeferPrompt, setShowDeferPrompt] = useState(false);

  // Queries & Mutations
  const filters = useMemo(() => {
    return {
      department: selectedDept !== 'ALL' ? (selectedDept as Department) : undefined,
      status: selectedStatus !== 'ALL' ? (selectedStatus as TaskStatus) : undefined,
      criticality: selectedCriticality !== 'ALL' ? (selectedCriticality as CriticalityLevel) : undefined,
      overdueOnly: overdueOnly || undefined,
    };
  }, [selectedDept, selectedStatus, selectedCriticality, overdueOnly]);

  const { data: tasks, isLoading, isError, refetch } = useMaintenanceTasks(filters);
  const deferMutation = useDeferMaintenanceTask();
  const updateStatusMutation = useUpdateTaskStatus();

  // Client-side text search
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    if (!searchQuery.trim()) return tasks;

    const q = searchQuery.toLowerCase();
    return tasks.filter(
      (t) =>
        t.taskId.toLowerCase().includes(q) ||
        t.assetId.toLowerCase().includes(q) ||
        t.workType.toLowerCase().includes(q) ||
        t.sectionId.toLowerCase().includes(q) ||
        t.location.toLowerCase().includes(q)
    );
  }, [tasks, searchQuery]);

  const hasActiveFilters =
    Boolean(searchQuery) ||
    selectedDept !== 'ALL' ||
    selectedStatus !== 'ALL' ||
    selectedCriticality !== 'ALL' ||
    overdueOnly;

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedDept('ALL');
    setSelectedStatus('ALL');
    setSelectedCriticality('ALL');
    setOverdueOnly(false);
  };

  const handleDefer = async (taskId: string) => {
    await deferMutation.mutateAsync({ taskId, reason: deferReason || 'Deferred by planning officer' });
    setShowDeferPrompt(false);
    setDeferReason('');
    if (selectedTask?.taskId === taskId) {
      setSelectedTask((prev) => (prev ? { ...prev, status: 'DEFERRED' } : null));
    }
  };

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    await updateStatusMutation.mutateAsync({ taskId, status, reason: 'Status updated via command center' });
    if (selectedTask?.taskId === taskId) {
      setSelectedTask((prev) => (prev ? { ...prev, status } : null));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Maintenance Jobs & Work Orders"
        description="Comprehensive track, signaling, and traction maintenance task schedule and status management."
        icon={Wrench}
        badge="SC DIVISION"
      />

      {/* Filter Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search task ID, asset, work type, section, or location..."
        hasActiveFilters={hasActiveFilters}
        onClearFilters={handleClearFilters}
        totalCount={tasks?.length}
        filteredCount={filteredTasks.length}
      >
        {/* Department Filter */}
        <select
          value={selectedDept}
          onChange={(e) => setSelectedDept(e.target.value)}
          className="bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
        >
          <option value="ALL">All Departments</option>
          <option value="ENGINEERING">Engineering (Civil)</option>
          <option value="SNT">S&T (Signals)</option>
          <option value="TRACTION">Traction (OHE)</option>
        </select>

        {/* Status Filter */}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
        >
          <option value="ALL">All Statuses</option>
          <option value="PENDING">PENDING</option>
          <option value="PRIORITIZED">PRIORITIZED</option>
          <option value="SCHEDULED">SCHEDULED</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="DEFERRED">DEFERRED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>

        {/* Criticality Filter */}
        <select
          value={selectedCriticality}
          onChange={(e) => setSelectedCriticality(e.target.value)}
          className="bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
        >
          <option value="ALL">All Criticality</option>
          <option value="CRITICAL">CRITICAL</option>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
        </select>

        {/* Overdue Filter Checkbox */}
        <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none bg-slate-950 px-2.5 py-1.5 rounded-md border border-slate-700/80">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
            className="rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-0"
          />
          <span className="font-mono text-amber-400">Overdue Only</span>
        </label>
      </FilterBar>

      {/* Main Table */}
      {isLoading ? (
        <LoadingState message="Loading maintenance work orders..." />
      ) : isError ? (
        <div className="p-6 rounded-lg bg-rose-500/10 border border-rose-500/30 text-center">
          <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
          <p className="text-xs text-rose-300 font-medium">Failed to load maintenance tasks.</p>
          <button
            onClick={() => refetch()}
            className="mt-3 px-3 py-1.5 rounded bg-rose-500/20 text-rose-300 text-xs font-mono hover:bg-rose-500/30"
          >
            Retry
          </button>
        </div>
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          title="No maintenance tasks match criteria"
          description="Adjust your filters or search term to view tasks."
          action={
            hasActiveFilters ? (
              <button
                onClick={handleClearFilters}
                className="text-xs font-mono text-blue-400 hover:underline"
              >
                Clear all filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg bg-slate-900/60 border border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="bg-slate-900/80 text-[11px] text-slate-400 font-mono border-b border-slate-800">
                  <th className="py-3 px-4 font-semibold">Task ID</th>
                  <th className="py-3 px-3 font-semibold">Department</th>
                  <th className="py-3 px-3 font-semibold">Asset</th>
                  <th className="py-3 px-3 font-semibold">Work Type</th>
                  <th className="py-3 px-3 font-semibold">Section</th>
                  <th className="py-3 px-3 font-semibold">Criticality</th>
                  <th className="py-3 px-3 font-semibold">Urgency</th>
                  <th className="py-3 px-3 font-semibold">Overdue</th>
                  <th className="py-3 px-3 font-semibold">Duration</th>
                  <th className="py-3 px-3 font-semibold">Requested Window</th>
                  <th className="py-3 px-3 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredTasks.map((t) => (
                  <tr
                    key={t.taskId}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    onClick={() => setSelectedTask(t)}
                  >
                    <td className="py-3 px-4 font-mono text-blue-400 font-medium whitespace-nowrap">
                      {t.taskId}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <DepartmentBadge department={t.department} size="sm" showIcon={false} />
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap" title={t.assetId}>
                      {t.assetId}
                    </td>
                    <td className="py-3 px-3 max-w-[220px] truncate text-slate-200" title={t.workType}>
                      {t.workType}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {t.sectionId}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <StatusBadge status={t.criticality} size="sm" />
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <StatusBadge status={t.urgency} size="sm" />
                    </td>
                    <td className="py-3 px-3 font-mono whitespace-nowrap">
                      {t.overdueDays > 0 ? (
                        <span className="text-rose-400 font-semibold bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded text-[11px]">
                          +{t.overdueDays}d
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">On time</span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {formatDuration(t.durationMinutes)}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                      <div>{formatDate(t.requestedDate)}</div>
                      <div className="text-[10px] text-slate-400">
                        {formatTime(t.preferredStart)} - {formatTime(t.preferredEnd)}
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <StatusBadge status={t.status} size="sm" />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedTask(t)}
                          className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 text-xs font-mono flex items-center gap-1 transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-400" />
                          <span>View</span>
                        </button>
                        {t.status !== 'DEFERRED' && t.status !== 'COMPLETED' && (
                          <button
                            onClick={() => {
                              setSelectedTask(t);
                              setShowDeferPrompt(true);
                            }}
                            className="px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 text-xs font-mono transition-colors"
                            title="Defer Task"
                          >
                            Defer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DETAIL MODAL / DRAWER ──────────────────────────────────────────────── */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold font-mono text-slate-100">{selectedTask.taskId}</h3>
                    <DepartmentBadge department={selectedTask.department} size="sm" />
                    <StatusBadge status={selectedTask.status} size="sm" />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedTask.workType}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedTask(null);
                  setShowDeferPrompt(false);
                }}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-md hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs font-sans">
              {/* Asset & Location Info */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Asset ID</span>
                  <p className="font-mono font-medium text-slate-200 mt-0.5">{selectedTask.assetId}</p>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Section ID</span>
                  <p className="font-mono font-medium text-slate-200 mt-0.5">{selectedTask.sectionId}</p>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Block Type</span>
                  <p className="font-mono font-medium text-slate-200 mt-0.5">{selectedTask.blockType}</p>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Location / Chainage</span>
                  <p className="text-slate-200 mt-0.5 flex items-center gap-1 font-mono">
                    <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    {selectedTask.location}
                  </p>
                </div>
              </div>

              {/* Priority & Scheduling Specs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Criticality</span>
                  <div className="mt-1">
                    <StatusBadge status={selectedTask.criticality} />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Urgency</span>
                  <div className="mt-1">
                    <StatusBadge status={selectedTask.urgency} />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Risk Level</span>
                  <p className="font-mono font-bold text-rose-400 mt-1">{selectedTask.riskLevel}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Overdue Days</span>
                  <p className="font-mono font-bold mt-1 text-slate-200">
                    {selectedTask.overdueDays > 0 ? (
                      <span className="text-rose-400">+{selectedTask.overdueDays} Days</span>
                    ) : (
                      <span className="text-emerald-400">On Track</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Window & Duration */}
              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Requested Window</span>
                  <span className="text-[11px] font-mono text-blue-400">
                    Duration: {formatDuration(selectedTask.durationMinutes)} ({selectedTask.durationMinutes} mins)
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono text-slate-200 pt-1">
                  <div>Date: <span className="text-slate-100 font-bold">{formatDate(selectedTask.requestedDate)}</span></div>
                  <div>Start: <span className="text-slate-100 font-bold">{formatTime(selectedTask.preferredStart)}</span></div>
                  <div>End: <span className="text-slate-100 font-bold">{formatTime(selectedTask.preferredEnd)}</span></div>
                </div>
              </div>

              {/* Required Resources */}
              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800">
                <span className="text-[10px] font-mono text-slate-400 uppercase">Allocated Resources</span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedTask.requiredResources.map((res) => (
                    <span
                      key={res}
                      className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 font-mono text-[11px]"
                    >
                      {res}
                    </span>
                  ))}
                </div>
              </div>

              {/* Linked Defect */}
              {selectedTask.defectId && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <div>
                      <p className="text-xs font-mono font-medium text-amber-300">Linked Defect Record</p>
                      <p className="text-[11px] font-mono text-amber-400/80">Ref: {selectedTask.defectId}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                    Auto-escalated
                  </span>
                </div>
              )}

              {/* Defer Reason Input Section */}
              {showDeferPrompt && (
                <div className="p-3 rounded-lg bg-slate-950 border border-amber-500/40 space-y-2 animate-in fade-in">
                  <label className="text-[11px] font-mono text-amber-300 font-medium block">
                    Reason for Deferral:
                  </label>
                  <input
                    type="text"
                    value={deferReason}
                    onChange={(e) => setDeferReason(e.target.value)}
                    placeholder="e.g., Corridor traffic congestion, resource reassignment..."
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setShowDeferPrompt(false)}
                      className="px-3 py-1 rounded text-xs font-mono text-slate-400 hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDefer(selectedTask.taskId)}
                      disabled={deferMutation.isPending}
                      className="px-3 py-1 rounded text-xs font-mono bg-amber-500 text-slate-950 font-bold hover:bg-amber-400"
                    >
                      {deferMutation.isPending ? 'Deferring...' : 'Confirm Deferral'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              {/* Status Update Quick Select */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-400">Update Status:</span>
                <select
                  value={selectedTask.status}
                  onChange={(e) => handleStatusChange(selectedTask.taskId, e.target.value as TaskStatus)}
                  disabled={updateStatusMutation.isPending}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="PRIORITIZED">PRIORITIZED</option>
                  <option value="SCHEDULED">SCHEDULED</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="DEFERRED">DEFERRED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/block-requests')}
                  className="px-3 py-1.5 rounded bg-blue-600/10 text-blue-400 border border-blue-500/30 hover:bg-blue-600/20 text-xs font-mono transition-colors flex items-center gap-1.5"
                  title="View Department Block Requests"
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>Block Requests</span>
                </button>
                {selectedTask.status !== 'DEFERRED' && !showDeferPrompt && (
                  <button
                    onClick={() => setShowDeferPrompt(true)}
                    className="px-3 py-1.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 text-xs font-mono transition-colors"
                  >
                    Defer Task
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedTask(null);
                    setShowDeferPrompt(false);
                  }}
                  className="px-4 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-mono transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default MaintenancePage;
