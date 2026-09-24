import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Eye,
  CheckCircle2,
  ShieldAlert,
  X,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterBar } from '@/components/common/FilterBar';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import {
  useConflicts,
  useResolveConflict,
  useMarkConflictUnderReview,
  useIgnoreConflict,
} from '@/hooks';
import type { Conflict, ConflictType, ConflictSeverity, ConflictResolutionStatus } from '@/types/conflict';
import { formatTime, formatDate } from '@/utils';

export const ConflictsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);

  const filters = useMemo(() => {
    return {
      type: selectedType !== 'ALL' ? (selectedType as ConflictType) : undefined,
      severity: selectedSeverity !== 'ALL' ? (selectedSeverity as ConflictSeverity) : undefined,
      resolutionStatus: selectedStatus !== 'ALL' ? (selectedStatus as ConflictResolutionStatus) : undefined,
    };
  }, [selectedType, selectedSeverity, selectedStatus]);

  const { data: conflicts, isLoading, isError, refetch } = useConflicts(filters);

  const resolveMutation = useResolveConflict();
  const underReviewMutation = useMarkConflictUnderReview();
  const ignoreMutation = useIgnoreConflict();

  const filteredConflicts = useMemo(() => {
    if (!conflicts) return [];
    if (!searchQuery.trim()) return conflicts;
    const q = searchQuery.toLowerCase();
    return conflicts.filter(
      (c) =>
        c.conflictId.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.sectionId.toLowerCase().includes(q)
    );
  }, [conflicts, searchQuery]);

  const hasActiveFilters =
    Boolean(searchQuery) ||
    selectedType !== 'ALL' ||
    selectedSeverity !== 'ALL' ||
    selectedStatus !== 'ALL';

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedType('ALL');
    setSelectedSeverity('ALL');
    setSelectedStatus('ALL');
  };

  const handleResolve = async (conflictId: string) => {
    await resolveMutation.mutateAsync({ conflictId, reason: 'Resolved by controller' });
    if (selectedConflict?.conflictId === conflictId) {
      setSelectedConflict((prev) => (prev ? { ...prev, resolutionStatus: 'RESOLVED' } : null));
    }
  };

  const handleUnderReview = async (conflictId: string) => {
    await underReviewMutation.mutateAsync({ conflictId });
    if (selectedConflict?.conflictId === conflictId) {
      setSelectedConflict((prev) => (prev ? { ...prev, resolutionStatus: 'UNDER_REVIEW' } : null));
    }
  };

  const handleIgnore = async (conflictId: string) => {
    await ignoreMutation.mutateAsync({ conflictId, reason: 'Ignored as non-critical or acceptable overlap' });
    if (selectedConflict?.conflictId === conflictId) {
      setSelectedConflict((prev) => (prev ? { ...prev, resolutionStatus: 'IGNORED' } : null));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Operational Conflicts Resolution"
        description="Detect and resolve scheduling clashes, track resource bottlenecks, train timetable overlaps, and safety risks."
        icon={AlertTriangle}
        badge="SC DIVISION"
      />

      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search conflict ID, description, or section ID..."
        hasActiveFilters={hasActiveFilters}
        onClearFilters={handleClearFilters}
        totalCount={conflicts?.length}
        filteredCount={filteredConflicts.length}
      >
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
        >
          <option value="ALL">All Conflict Types</option>
          <option value="TIME">TIME</option>
          <option value="LOCATION">LOCATION</option>
          <option value="TRAIN">TRAIN</option>
          <option value="GOODS">GOODS</option>
          <option value="RESOURCE">RESOURCE</option>
          <option value="CORRIDOR">CORRIDOR</option>
          <option value="DURATION">DURATION</option>
          <option value="DEPENDENCY">DEPENDENCY</option>
        </select>

        <select
          value={selectedSeverity}
          onChange={(e) => setSelectedSeverity(e.target.value)}
          className="bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
        >
          <option value="ALL">All Severity</option>
          <option value="CRITICAL">CRITICAL</option>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
        >
          <option value="ALL">All Statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="UNDER_REVIEW">UNDER_REVIEW</option>
          <option value="RESOLVED">RESOLVED</option>
          <option value="IGNORED">IGNORED</option>
        </select>
      </FilterBar>

      {isLoading ? (
        <LoadingState message="Scanning corridor conflicts..." />
      ) : isError ? (
        <div className="p-6 rounded-lg bg-rose-500/10 border border-rose-500/30 text-center">
          <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
          <p className="text-xs text-rose-300">Failed to load conflict records.</p>
          <button
            onClick={() => refetch()}
            className="mt-3 px-3 py-1.5 rounded bg-rose-500/20 text-rose-300 text-xs font-mono"
          >
            Retry
          </button>
        </div>
      ) : filteredConflicts.length === 0 ? (
        <EmptyState title="No conflicts found" description="All corridor sections are clear of detected clashes." />
      ) : (
        <div className="rounded-lg bg-slate-900/60 border border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="bg-slate-900/80 text-[11px] text-slate-400 font-mono border-b border-slate-800">
                  <th className="py-3 px-4 font-semibold">Conflict ID</th>
                  <th className="py-3 px-3 font-semibold">Type</th>
                  <th className="py-3 px-3 font-semibold">Severity</th>
                  <th className="py-3 px-3 font-semibold">Section</th>
                  <th className="py-3 px-3 font-semibold">Affected Blocks / Tasks</th>
                  <th className="py-3 px-3 font-semibold">Description</th>
                  <th className="py-3 px-3 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredConflicts.map((c) => (
                  <tr
                    key={c.conflictId}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    onClick={() => setSelectedConflict(c)}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-rose-400 whitespace-nowrap">
                      {c.conflictId}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-200 border border-slate-700">
                        {c.type}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <StatusBadge status={c.severity} size="sm" />
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {c.sectionId}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {c.affectedBlockIds.map((bid) => (
                          <span key={bid} className="text-[10px] px-1 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                            {bid}
                          </span>
                        ))}
                        {c.affectedTaskIds.map((tid) => (
                          <span key={tid} className="text-[10px] px-1 py-0.2 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30">
                            {tid}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3 max-w-[240px] truncate text-slate-200" title={c.description}>
                      {c.description}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <StatusBadge status={c.resolutionStatus} size="sm" />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedConflict(c)}
                          className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 text-xs font-mono flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-400" />
                          <span>View</span>
                        </button>

                        {/* Resolve */}
                        {c.resolutionStatus !== 'RESOLVED' && (
                          <button
                            onClick={() => handleResolve(c.conflictId)}
                            disabled={resolveMutation.isPending}
                            className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 text-xs font-mono"
                            title="Resolve Conflict"
                          >
                            Resolve
                          </button>
                        )}

                        {/* Under Review */}
                        {c.resolutionStatus === 'OPEN' && (
                          <button
                            onClick={() => handleUnderReview(c.conflictId)}
                            disabled={underReviewMutation.isPending}
                            className="px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 text-xs font-mono"
                            title="Mark Under Review"
                          >
                            Review
                          </button>
                        )}

                        {/* Ignore */}
                        {c.resolutionStatus !== 'IGNORED' && c.resolutionStatus !== 'RESOLVED' && (
                          <button
                            onClick={() => handleIgnore(c.conflictId)}
                            disabled={ignoreMutation.isPending}
                            className="px-2 py-1 rounded bg-slate-800 text-slate-400 hover:bg-slate-700 text-xs font-mono"
                            title="Ignore Conflict"
                          >
                            Ignore
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

      {/* ── DETAIL MODAL ──────────────────────────────────────────────────────── */}
      {selectedConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold font-mono text-slate-100">{selectedConflict.conflictId}</h3>
                    <StatusBadge status={selectedConflict.severity} size="sm" />
                    <StatusBadge status={selectedConflict.resolutionStatus} size="sm" />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Section: {selectedConflict.sectionId}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedConflict(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs font-sans">
              {/* Type and Detection Time */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800 font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">Conflict Classification</span>
                  <p className="text-slate-200 font-bold mt-0.5">{selectedConflict.type}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">Detection Timestamp</span>
                  <p className="text-slate-300 mt-0.5">
                    {formatDate(selectedConflict.detectedAt)} {formatTime(selectedConflict.detectedAt)}
                  </p>
                </div>
              </div>

              {/* Description */}
              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-1">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">
                  Conflict Description
                </span>
                <p className="text-slate-200 leading-relaxed text-xs">{selectedConflict.description}</p>
              </div>

              {/* Suggested Action */}
              {selectedConflict.suggestedAction && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-mono text-blue-300 uppercase font-bold block">
                      Recommended Mitigation
                    </span>
                    <p className="text-blue-200 text-xs mt-0.5">{selectedConflict.suggestedAction}</p>
                  </div>
                </div>
              )}

              {/* Affected Entities */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold block">
                  Affected Blocks & Tasks
                </span>
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-2 font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400">Integrated Blocks:</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {selectedConflict.affectedBlockIds.length > 0 ? (
                        selectedConflict.affectedBlockIds.map((bid) => (
                          <span key={bid} className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                            {bid}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 text-xs">None directly tied</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400">Maintenance Tasks:</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {selectedConflict.affectedTaskIds.map((tid) => (
                        <span key={tid} className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300">
                          {tid}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedConflict.resolutionStatus !== 'RESOLVED' && (
                  <button
                    onClick={() => handleResolve(selectedConflict.conflictId)}
                    disabled={resolveMutation.isPending}
                    className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-mono font-medium flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Resolve</span>
                  </button>
                )}
                {selectedConflict.resolutionStatus === 'OPEN' && (
                  <button
                    onClick={() => handleUnderReview(selectedConflict.conflictId)}
                    disabled={underReviewMutation.isPending}
                    className="px-3 py-1.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 text-xs font-mono"
                  >
                    Mark Under Review
                  </button>
                )}
                {selectedConflict.resolutionStatus !== 'IGNORED' && (
                  <button
                    onClick={() => handleIgnore(selectedConflict.conflictId)}
                    disabled={ignoreMutation.isPending}
                    className="px-3 py-1.5 rounded bg-slate-800 text-slate-400 hover:bg-slate-700 text-xs font-mono"
                  >
                    Ignore
                  </button>
                )}
              </div>

              <button
                onClick={() => setSelectedConflict(null)}
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
export default ConflictsPage;
