import React, { useState, useMemo } from 'react';
import {
  FileCheck2,
  Eye,
  Check,
  X,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DepartmentBadge } from '@/components/common/DepartmentBadge';
import { FilterBar } from '@/components/common/FilterBar';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import {
  useBlockRequests,
  useApproveBlockRequest,
  useRejectBlockRequest,
  useUpdateBlockRequestStatus,
} from '@/hooks';
import type { BlockRequest, BlockRequestStatus } from '@/types/block';
import type { Department } from '@/types/asset';
import { formatTime, formatDate, formatDuration } from '@/utils';

export const BlockRequestsPage: React.FC = () => {
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');

  // Detail Modal & Action States
  const [selectedRequest, setSelectedRequest] = useState<BlockRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectPrompt, setShowRejectPrompt] = useState(false);

  // Queries & Mutations
  const filters = useMemo(() => {
    return {
      department: selectedDept !== 'ALL' ? (selectedDept as Department) : undefined,
      status: selectedStatus !== 'ALL' ? (selectedStatus as BlockRequestStatus) : undefined,
      priority: selectedPriority !== 'ALL' ? Number(selectedPriority) : undefined,
    };
  }, [selectedDept, selectedStatus, selectedPriority]);

  const { data: requests, isLoading, isError, refetch } = useBlockRequests(filters);
  const approveMutation = useApproveBlockRequest();
  const rejectMutation = useRejectBlockRequest();
  const updateStatusMutation = useUpdateBlockRequestStatus();

  // Search filter
  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    if (!searchQuery.trim()) return requests;

    const q = searchQuery.toLowerCase();
    return requests.filter(
      (r) =>
        r.requestId.toLowerCase().includes(q) ||
        r.taskId.toLowerCase().includes(q) ||
        r.sectionId.toLowerCase().includes(q)
    );
  }, [requests, searchQuery]);

  const hasActiveFilters =
    Boolean(searchQuery) ||
    selectedDept !== 'ALL' ||
    selectedStatus !== 'ALL' ||
    selectedPriority !== 'ALL';

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedDept('ALL');
    setSelectedStatus('ALL');
    setSelectedPriority('ALL');
  };

  const handleApprove = async (requestId: string) => {
    await approveMutation.mutateAsync({ requestId, reason: 'Approved by Planning Officer' });
    if (selectedRequest?.requestId === requestId) {
      setSelectedRequest((prev) => (prev ? { ...prev, status: 'APPROVED' } : null));
    }
  };

  const handleReject = async (requestId: string) => {
    await rejectMutation.mutateAsync({
      requestId,
      reason: rejectReason || 'Rejected by Planning Officer due to operational constraints',
    });
    setShowRejectPrompt(false);
    setRejectReason('');
    if (selectedRequest?.requestId === requestId) {
      setSelectedRequest((prev) => (prev ? { ...prev, status: 'REJECTED' } : null));
    }
  };

  const handleStatusChange = async (requestId: string, status: BlockRequestStatus) => {
    await updateStatusMutation.mutateAsync({ requestId, status });
    if (selectedRequest?.requestId === requestId) {
      setSelectedRequest((prev) => (prev ? { ...prev, status } : null));
    }
  };

  const getPriorityBadge = (priority: number) => {
    let colorClass = 'bg-slate-800 text-slate-300 border-slate-700';
    if (priority === 1) colorClass = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    else if (priority === 2) colorClass = 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    else if (priority === 3) colorClass = 'bg-blue-500/10 text-blue-400 border-blue-500/30';

    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-bold border ${colorClass}`}
      >
        P{priority}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Block Requests Management"
        description="Review, submit, validate and approve departmental maintenance corridor block applications."
        icon={FileCheck2}
        badge="SC DIVISION"
      />

      {/* Filter Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search request ID, task ID, or section ID..."
        hasActiveFilters={hasActiveFilters}
        onClearFilters={handleClearFilters}
        totalCount={requests?.length}
        filteredCount={filteredRequests.length}
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
          <option value="ANALYZING">ANALYZING</option>
          <option value="CONFLICT">CONFLICT</option>
          <option value="INTEGRATION_CANDIDATE">INTEGRATION_CANDIDATE</option>
          <option value="SCHEDULED">SCHEDULED</option>
          <option value="APPROVED">APPROVED</option>
          <option value="REJECTED">REJECTED</option>
          <option value="COMPLETED">COMPLETED</option>
        </select>

        {/* Priority Filter */}
        <select
          value={selectedPriority}
          onChange={(e) => setSelectedPriority(e.target.value)}
          className="bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
        >
          <option value="ALL">All Priorities</option>
          <option value="1">Priority 1 (Emergency)</option>
          <option value="2">Priority 2 (High)</option>
          <option value="3">Priority 3 (Standard)</option>
          <option value="4">Priority 4 (Routine)</option>
        </select>
      </FilterBar>

      {/* Main Table */}
      {isLoading ? (
        <LoadingState message="Loading block requests..." />
      ) : isError ? (
        <div className="p-6 rounded-lg bg-rose-500/10 border border-rose-500/30 text-center">
          <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
          <p className="text-xs text-rose-300 font-medium">Failed to load block requests.</p>
          <button
            onClick={() => refetch()}
            className="mt-3 px-3 py-1.5 rounded bg-rose-500/20 text-rose-300 text-xs font-mono hover:bg-rose-500/30"
          >
            Retry
          </button>
        </div>
      ) : filteredRequests.length === 0 ? (
        <EmptyState
          title="No block requests match criteria"
          description="Adjust your filters or search query to view requests."
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
                  <th className="py-3 px-4 font-semibold">Request ID</th>
                  <th className="py-3 px-3 font-semibold">Department</th>
                  <th className="py-3 px-3 font-semibold">Task ID</th>
                  <th className="py-3 px-3 font-semibold">Section</th>
                  <th className="py-3 px-3 font-semibold">Date</th>
                  <th className="py-3 px-3 font-semibold">Start</th>
                  <th className="py-3 px-3 font-semibold">End</th>
                  <th className="py-3 px-3 font-semibold">Duration</th>
                  <th className="py-3 px-3 font-semibold">Priority</th>
                  <th className="py-3 px-3 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRequests.map((r) => (
                  <tr
                    key={r.requestId}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    onClick={() => setSelectedRequest(r)}
                  >
                    <td className="py-3 px-4 font-mono text-blue-400 font-medium whitespace-nowrap">
                      {r.requestId}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <DepartmentBadge department={r.department} size="sm" showIcon={false} />
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {r.taskId}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {r.sectionId}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {formatDate(r.requestedDate)}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                      {formatTime(r.preferredStart)}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                      {formatTime(r.preferredEnd)}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {formatDuration(r.durationMinutes)}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getPriorityBadge(r.priority)}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <StatusBadge status={r.status} size="sm" />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedRequest(r)}
                          className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 text-xs font-mono flex items-center gap-1 transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-400" />
                          <span>View</span>
                        </button>

                        {/* Approve Quick Action */}
                        <button
                          onClick={() => handleApprove(r.requestId)}
                          disabled={approveMutation.isPending || r.status === 'APPROVED'}
                          className={`p-1.5 rounded text-xs font-mono transition-colors ${
                            r.status === 'APPROVED'
                              ? 'bg-emerald-500/5 text-emerald-500/30 cursor-not-allowed'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                          }`}
                          title="Approve Block Request"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>

                        {/* Reject Quick Action */}
                        <button
                          onClick={() => {
                            setSelectedRequest(r);
                            setShowRejectPrompt(true);
                          }}
                          disabled={rejectMutation.isPending || r.status === 'REJECTED'}
                          className={`p-1.5 rounded text-xs font-mono transition-colors ${
                            r.status === 'REJECTED'
                              ? 'bg-rose-500/5 text-rose-500/30 cursor-not-allowed'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'
                          }`}
                          title="Reject Block Request"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
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
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <FileCheck2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold font-mono text-slate-100">{selectedRequest.requestId}</h3>
                    <DepartmentBadge department={selectedRequest.department} size="sm" />
                    <StatusBadge status={selectedRequest.status} size="sm" />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Section: {selectedRequest.sectionId}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedRequest(null);
                  setShowRejectPrompt(false);
                }}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-md hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs font-sans">
              {/* Specs Grid */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Linked Task ID</span>
                  <p className="font-mono font-medium text-blue-400 mt-0.5">{selectedRequest.taskId}</p>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Block Type</span>
                  <p className="font-mono font-medium text-slate-200 mt-0.5">{selectedRequest.blockType}</p>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Priority Rating</span>
                  <div className="mt-1">{getPriorityBadge(selectedRequest.priority)}</div>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Submission Timestamp</span>
                  <p className="font-mono text-slate-300 mt-0.5">{formatDate(selectedRequest.submittedAt)} {formatTime(selectedRequest.submittedAt)}</p>
                </div>
              </div>

              {/* Window & Duration */}
              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Requested Block Window</span>
                  <span className="text-[11px] font-mono text-blue-400">
                    Duration: {formatDuration(selectedRequest.durationMinutes)} ({selectedRequest.durationMinutes} mins)
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono text-slate-200 pt-1">
                  <div>Date: <span className="text-slate-100 font-bold">{formatDate(selectedRequest.requestedDate)}</span></div>
                  <div>Start: <span className="text-slate-100 font-bold">{formatTime(selectedRequest.preferredStart)}</span></div>
                  <div>End: <span className="text-slate-100 font-bold">{formatTime(selectedRequest.preferredEnd)}</span></div>
                </div>
              </div>

              {/* Status Context Banner */}
              {selectedRequest.status === 'CONFLICT' && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-rose-300">Conflict Detected</p>
                    <p className="text-[11px] text-rose-400">
                      This block request overlaps with scheduled train paths or high-priority traffic.
                    </p>
                  </div>
                </div>
              )}

              {selectedRequest.status === 'INTEGRATION_CANDIDATE' && (
                <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center gap-2.5">
                  <Layers className="w-5 h-5 text-cyan-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-cyan-300">Integration Candidate</p>
                    <p className="text-[11px] text-cyan-400">
                      Eligible for shadow bundling into an Integrated Corridor Block.
                    </p>
                  </div>
                </div>
              )}

              {/* Rejection Prompt */}
              {showRejectPrompt && (
                <div className="p-3 rounded-lg bg-slate-950 border border-rose-500/40 space-y-2 animate-in fade-in">
                  <label className="text-[11px] font-mono text-rose-300 font-medium block">
                    Reason for Rejection:
                  </label>
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g., Traffic priority, non-feasible window, insufficient crew..."
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-rose-400"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setShowRejectPrompt(false)}
                      className="px-3 py-1 rounded text-xs font-mono text-slate-400 hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleReject(selectedRequest.requestId)}
                      disabled={rejectMutation.isPending}
                      className="px-3 py-1 rounded text-xs font-mono bg-rose-600 text-white font-bold hover:bg-rose-500"
                    >
                      {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              {/* Quick Status Override */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-400">Set Status:</span>
                <select
                  value={selectedRequest.status}
                  onChange={(e) => handleStatusChange(selectedRequest.requestId, e.target.value as BlockRequestStatus)}
                  disabled={updateStatusMutation.isPending}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="ANALYZING">ANALYZING</option>
                  <option value="CONFLICT">CONFLICT</option>
                  <option value="INTEGRATION_CANDIDATE">INTEGRATION_CANDIDATE</option>
                  <option value="SCHEDULED">SCHEDULED</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="COMPLETED">COMPLETED</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                {selectedRequest.status !== 'APPROVED' && (
                  <button
                    onClick={() => handleApprove(selectedRequest.requestId)}
                    disabled={approveMutation.isPending}
                    className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-mono font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                )}

                {selectedRequest.status !== 'REJECTED' && !showRejectPrompt && (
                  <button
                    onClick={() => setShowRejectPrompt(true)}
                    className="px-3 py-1.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 text-xs font-mono transition-colors flex items-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setSelectedRequest(null);
                    setShowRejectPrompt(false);
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
export default BlockRequestsPage;
