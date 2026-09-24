import React, { useState, useMemo } from 'react';
import {
  Layers,
  Eye,
  Check,
  X,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DepartmentBadge } from '@/components/common/DepartmentBadge';
import { FilterBar } from '@/components/common/FilterBar';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import {
  useIntegratedBlocks,
  useApproveIntegratedBlock,
  useRejectIntegratedBlock,
  useUpdateIntegratedBlockStatus,
} from '@/hooks';
import type { IntegratedBlock, IntegratedBlockStatus } from '@/types/block';
import type { Department } from '@/types/asset';
import { formatTime, formatDate, formatDuration } from '@/utils';

export const IntegratedBlocksPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [triBundleOnly, setTriBundleOnly] = useState(false);

  const [selectedBlock, setSelectedBlock] = useState<IntegratedBlock | null>(null);

  const filters = useMemo(() => {
    return {
      department: selectedDept !== 'ALL' ? (selectedDept as Department) : undefined,
      status: selectedStatus !== 'ALL' ? (selectedStatus as IntegratedBlockStatus) : undefined,
    };
  }, [selectedDept, selectedStatus]);

  const { data: blocks, isLoading, isError, refetch } = useIntegratedBlocks(filters);
  const approveMutation = useApproveIntegratedBlock();
  const rejectMutation = useRejectIntegratedBlock();
  const updateStatusMutation = useUpdateIntegratedBlockStatus();

  const filteredBlocks = useMemo(() => {
    if (!blocks) return [];
    let result = blocks;

    if (triBundleOnly) {
      result = result.filter(
        (b) =>
          b.departments.includes('ENGINEERING') &&
          b.departments.includes('SNT') &&
          b.departments.includes('TRACTION')
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (b) =>
          b.blockId.toLowerCase().includes(q) ||
          b.sectionId.toLowerCase().includes(q) ||
          b.fromStation.toLowerCase().includes(q) ||
          b.toStation.toLowerCase().includes(q)
      );
    }

    return result;
  }, [blocks, triBundleOnly, searchQuery]);

  const hasActiveFilters =
    Boolean(searchQuery) || selectedDept !== 'ALL' || selectedStatus !== 'ALL' || triBundleOnly;

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedDept('ALL');
    setSelectedStatus('ALL');
    setTriBundleOnly(false);
  };

  const handleApprove = async (blockId: string) => {
    await approveMutation.mutateAsync({ blockId, reason: 'Approved by Chief Controller' });
    if (selectedBlock?.blockId === blockId) {
      setSelectedBlock((prev) => (prev ? { ...prev, status: 'APPROVED' } : null));
    }
  };

  const handleReject = async (blockId: string) => {
    await rejectMutation.mutateAsync({ blockId, reason: 'Rejected due to operational constraints' });
    if (selectedBlock?.blockId === blockId) {
      setSelectedBlock((prev) => (prev ? { ...prev, status: 'REJECTED' } : null));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Integrated Blocks Coordination"
        description="Multi-department bundled maintenance windows combining Engineering, S&T, and Traction into synchronized slots."
        icon={Layers}
        badge="SC DIVISION"
      />

      {/* Filter Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search block ID, section, or stations..."
        hasActiveFilters={hasActiveFilters}
        onClearFilters={handleClearFilters}
        totalCount={blocks?.length}
        filteredCount={filteredBlocks.length}
      >
        <select
          value={selectedDept}
          onChange={(e) => setSelectedDept(e.target.value)}
          className="bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
        >
          <option value="ALL">All Departments</option>
          <option value="ENGINEERING">Engineering Included</option>
          <option value="SNT">S&T Included</option>
          <option value="TRACTION">Traction Included</option>
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
        >
          <option value="ALL">All Statuses</option>
          <option value="AI_PROPOSED">AI_PROPOSED</option>
          <option value="UNDER_REVIEW">UNDER_REVIEW</option>
          <option value="APPROVED">APPROVED</option>
          <option value="MODIFIED">MODIFIED</option>
          <option value="REJECTED">REJECTED</option>
          <option value="PUBLISHED">PUBLISHED</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>

        <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none bg-slate-950 px-2.5 py-1.5 rounded-md border border-slate-700/80">
          <input
            type="checkbox"
            checked={triBundleOnly}
            onChange={(e) => setTriBundleOnly(e.target.checked)}
            className="rounded bg-slate-900 border-slate-700 text-cyan-400 focus:ring-0"
          />
          <span className="font-mono text-cyan-300 font-semibold">ENG + SNT + TRD (3-Dept)</span>
        </label>
      </FilterBar>

      {/* Main Table */}
      {isLoading ? (
        <LoadingState message="Loading integrated blocks..." />
      ) : isError ? (
        <div className="p-6 rounded-lg bg-rose-500/10 border border-rose-500/30 text-center">
          <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
          <p className="text-xs text-rose-300">Failed to load integrated blocks.</p>
          <button
            onClick={() => refetch()}
            className="mt-3 px-3 py-1.5 rounded bg-rose-500/20 text-rose-300 text-xs font-mono"
          >
            Retry
          </button>
        </div>
      ) : filteredBlocks.length === 0 ? (
        <EmptyState
          title="No integrated blocks found"
          description="Adjust your filters or toggle 3-Dept bundles."
        />
      ) : (
        <div className="rounded-lg bg-slate-900/60 border border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="bg-slate-900/80 text-[11px] text-slate-400 font-mono border-b border-slate-800">
                  <th className="py-3 px-4 font-semibold">Block ID</th>
                  <th className="py-3 px-3 font-semibold">Department Bundle</th>
                  <th className="py-3 px-3 font-semibold">Tasks</th>
                  <th className="py-3 px-3 font-semibold">Section & Corridor</th>
                  <th className="py-3 px-3 font-semibold">Date & Window</th>
                  <th className="py-3 px-3 font-semibold">Duration</th>
                  <th className="py-3 px-3 font-semibold">Feasibility</th>
                  <th className="py-3 px-3 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredBlocks.map((b) => {
                  const isTriBundle =
                    b.departments.includes('ENGINEERING') &&
                    b.departments.includes('SNT') &&
                    b.departments.includes('TRACTION');

                  return (
                    <tr
                      key={b.blockId}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                      onClick={() => setSelectedBlock(b)}
                    >
                      <td className="py-3 px-4 font-mono text-cyan-400 font-medium whitespace-nowrap">
                        {b.blockId}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {b.departments.map((d) => (
                            <DepartmentBadge key={d} department={d} size="sm" showIcon={false} />
                          ))}
                          {isTriBundle && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-gradient-to-r from-amber-500/20 via-cyan-500/20 to-purple-500/20 border border-cyan-500/40 text-cyan-300 font-bold">
                              TRI-BUNDLE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                        {b.taskIds.length} tasks
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                        <div className="font-medium text-slate-200">{b.sectionId}</div>
                        <div className="text-[10px] text-slate-400">
                          {b.fromStation} ↔ {b.toStation}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                        <div>{formatDate(b.date)}</div>
                        <div className="text-[10px] text-slate-400">
                          {formatTime(b.startTime)} - {formatTime(b.endTime)}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                        {formatDuration(b.durationMinutes)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {b.constraintValidation.overallFeasible ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                            <CheckCircle2 className="w-3 h-3" /> Feasible
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                            <AlertTriangle className="w-3 h-3" /> Review Clashes
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <StatusBadge status={b.status} size="sm" />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedBlock(b)}
                            className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 text-xs font-mono flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-400" />
                            <span>View</span>
                          </button>
                          {b.status !== 'APPROVED' && (
                            <button
                              onClick={() => handleApprove(b.blockId)}
                              disabled={approveMutation.isPending}
                              className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 text-xs"
                              title="Approve Integrated Block"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {b.status !== 'REJECTED' && (
                            <button
                              onClick={() => handleReject(b.blockId)}
                              disabled={rejectMutation.isPending}
                              className="p-1.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 text-xs"
                              title="Reject Integrated Block"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DETAIL MODAL ──────────────────────────────────────────────────────── */}
      {selectedBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold font-mono text-slate-100">{selectedBlock.blockId}</h3>
                    <StatusBadge status={selectedBlock.status} size="sm" />
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      Source: {selectedBlock.source}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedBlock.sectionId} ({selectedBlock.fromStation} ↔ {selectedBlock.toStation})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedBlock(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs font-sans">
              {/* Department Combination Highlight */}
              <div className="p-3.5 rounded-lg bg-slate-950/70 border border-cyan-500/30 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold tracking-wide">
                    Integrated Department Synergy
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedBlock.departments.map((d) => (
                      <DepartmentBadge key={d} department={d} size="md" />
                    ))}
                  </div>
                </div>
                <div className="text-right font-mono">
                  <p className="text-[10px] text-slate-400">Bundled Tasks</p>
                  <p className="text-lg font-bold text-cyan-300">{selectedBlock.taskIds.length}</p>
                </div>
              </div>

              {/* Window & Schedule Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-950/40 border border-slate-800">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Execution Date</span>
                  <p className="font-mono text-slate-200 font-bold mt-0.5">{formatDate(selectedBlock.date)}</p>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Start Time</span>
                  <p className="font-mono text-slate-200 font-bold mt-0.5">{formatTime(selectedBlock.startTime)}</p>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">End Time</span>
                  <p className="font-mono text-slate-200 font-bold mt-0.5">{formatTime(selectedBlock.endTime)}</p>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Duration</span>
                  <p className="font-mono text-cyan-400 font-bold mt-0.5">{formatDuration(selectedBlock.durationMinutes)}</p>
                </div>
              </div>

              {/* Constraint Feasibility Checks */}
              <div className="p-3.5 rounded-lg bg-slate-950/40 border border-slate-800 space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">
                  Feasibility & Safety Validation Matrix
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    {selectedBlock.constraintValidation.corridorAvailable ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    <span>Corridor Available</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    {selectedBlock.constraintValidation.requiredDurationSatisfied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    <span>Duration Satisfied</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    {!selectedBlock.constraintValidation.passengerTrainConflict ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    <span>Passenger Trains Clear</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    {!selectedBlock.constraintValidation.goodsTrainConflict ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    <span>Goods Paths Clear</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    {!selectedBlock.constraintValidation.resourceConflict ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    <span>Resources Allocated</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    {!selectedBlock.constraintValidation.locationConflict ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    <span>Work Zone Segregated</span>
                  </div>
                </div>
              </div>

              {/* Operational Impact */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-slate-950/40 border border-slate-800 text-center font-mono">
                <div>
                  <span className="text-[10px] text-slate-400">Trains Affected</span>
                  <p className="text-base font-bold text-amber-400 mt-0.5">
                    {selectedBlock.operationalImpact.trainsAffectedCount}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400">Estimated Delay</span>
                  <p className="text-base font-bold text-slate-200 mt-0.5">
                    {selectedBlock.operationalImpact.totalDelayMinutes}m
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400">Safety Risk Index</span>
                  <p className="text-base font-bold text-emerald-400 mt-0.5">
                    {selectedBlock.operationalImpact.safetyRiskIndex}/100
                  </p>
                </div>
              </div>

              {/* Bundled Task & Request IDs */}
              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-1.5 font-mono">
                <span className="text-[10px] text-slate-400 uppercase">Bundled Work Orders</span>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedBlock.taskIds.map((tid) => (
                    <span key={tid} className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[11px]">
                      {tid}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-400">Status:</span>
                <select
                  value={selectedBlock.status}
                  onChange={(e) =>
                    updateStatusMutation.mutate({
                      blockId: selectedBlock.blockId,
                      status: e.target.value as IntegratedBlockStatus,
                    })
                  }
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none"
                >
                  <option value="AI_PROPOSED">AI_PROPOSED</option>
                  <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="MODIFIED">MODIFIED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="PUBLISHED">PUBLISHED</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                {selectedBlock.status !== 'APPROVED' && (
                  <button
                    onClick={() => handleApprove(selectedBlock.blockId)}
                    disabled={approveMutation.isPending}
                    className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-mono font-medium flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                )}
                {selectedBlock.status !== 'REJECTED' && (
                  <button
                    onClick={() => handleReject(selectedBlock.blockId)}
                    disabled={rejectMutation.isPending}
                    className="px-3 py-1.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 text-xs font-mono flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedBlock(null)}
                  className="px-4 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-mono"
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
export default IntegratedBlocksPage;
