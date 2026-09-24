import React, { useState, useMemo } from 'react';
import {
  GitMerge,
  Eye,
  AlertTriangle,
  Clock,
  Layers,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterBar } from '@/components/common/FilterBar';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import { useCorridors, useIntegratedBlocks } from '@/hooks';
import type { Corridor } from '@/types/corridor';
import { formatTime } from '@/utils';

export const CorridorsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedLine, setSelectedLine] = useState<string>('ALL');
  const [selectedCorridor, setSelectedCorridor] = useState<Corridor | null>(null);

  const { data: corridors, isLoading, isError, refetch } = useCorridors();
  const { data: integratedBlocks } = useIntegratedBlocks();

  const filteredCorridors = useMemo(() => {
    if (!corridors) return [];
    return corridors.filter((c) => {
      if (selectedStatus !== 'ALL' && c.status !== selectedStatus) return false;
      if (selectedLine !== 'ALL' && c.line !== selectedLine) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.corridorId.toLowerCase().includes(q) ||
          c.sectionId.toLowerCase().includes(q) ||
          c.fromStation.toLowerCase().includes(q) ||
          c.toStation.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [corridors, selectedStatus, selectedLine, searchQuery]);

  const hasActiveFilters =
    Boolean(searchQuery) || selectedStatus !== 'ALL' || selectedLine !== 'ALL';

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedStatus('ALL');
    setSelectedLine('ALL');
  };

  // Helper to find affected blocks for a corridor
  const getAffectedBlocks = (sectionId: string) => {
    return (integratedBlocks || []).filter((b) => b.sectionId === sectionId);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Corridors & Section Capacity"
        description="Monitor sectional track availability, maintenance shadow windows, utilization rates, and line congestion."
        icon={GitMerge}
        badge="SC DIVISION"
      />

      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search corridor ID, section, or station codes..."
        hasActiveFilters={hasActiveFilters}
        onClearFilters={handleClearFilters}
        totalCount={corridors?.length}
        filteredCount={filteredCorridors.length}
      >
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
        >
          <option value="ALL">All Statuses</option>
          <option value="OPERATIONAL">OPERATIONAL</option>
          <option value="CONGESTED">CONGESTED</option>
          <option value="BLOCKED">BLOCKED</option>
          <option value="MAINTENANCE_IN_PROGRESS">MAINTENANCE_IN_PROGRESS</option>
        </select>

        <select
          value={selectedLine}
          onChange={(e) => setSelectedLine(e.target.value)}
          className="bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
        >
          <option value="ALL">All Track Lines</option>
          <option value="UP">UP Line</option>
          <option value="DOWN">DOWN Line</option>
          <option value="THIRD_LINE">THIRD_LINE</option>
          <option value="SINGLE_LINE">SINGLE_LINE</option>
        </select>
      </FilterBar>

      {isLoading ? (
        <LoadingState message="Loading corridors & sections..." />
      ) : isError ? (
        <div className="p-6 rounded-lg bg-rose-500/10 border border-rose-500/30 text-center">
          <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
          <p className="text-xs text-rose-300">Failed to load corridor records.</p>
          <button
            onClick={() => refetch()}
            className="mt-3 px-3 py-1.5 rounded bg-rose-500/20 text-rose-300 text-xs font-mono"
          >
            Retry
          </button>
        </div>
      ) : filteredCorridors.length === 0 ? (
        <EmptyState title="No corridors match filters" description="Try selecting a different status or line." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCorridors.map((c) => {
            const affected = getAffectedBlocks(c.sectionId);
            const totalAvailMins = c.availableWindows
              .filter((w) => w.status === 'AVAILABLE')
              .reduce((sum, w) => sum + w.durationMinutes, 0);

            // Estimated utilization ratio based on affected blocks vs total slots
            const utilizationPercent = Math.min(
              100,
              Math.max(20, Math.round((affected.length / Math.max(1, c.capacity / 10)) * 100))
            );

            return (
              <div
                key={c.corridorId}
                onClick={() => setSelectedCorridor(c)}
                className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-blue-400">{c.corridorId}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                        {c.line}
                      </span>
                    </div>
                    <StatusBadge status={c.status} size="sm" />
                  </div>

                  <div className="mt-3 space-y-1">
                    <h4 className="text-xs font-bold text-slate-200">{c.sectionId}</h4>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {c.fromStation} ↔ {c.toStation}
                    </p>
                  </div>

                  {/* Availability Windows & Capacity */}
                  <div className="grid grid-cols-2 gap-2 my-3 p-2.5 rounded bg-slate-950/60 border border-slate-800 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Availability</span>
                      <span className="text-emerald-400 font-semibold">
                        {c.availableWindows.length} slots ({totalAvailMins}m)
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Track Capacity</span>
                      <span className="text-slate-300 font-semibold">{c.capacity} trains/day</span>
                    </div>
                  </div>

                  {/* Utilization Progress Bar */}
                  <div className="space-y-1 my-2">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>Corridor Utilization</span>
                      <span className="text-slate-200 font-bold">{utilizationPercent}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          utilizationPercent > 80
                            ? 'bg-rose-500'
                            : utilizationPercent > 60
                            ? 'bg-amber-400'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${utilizationPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Affected Blocks count */}
                  <div className="mt-3 flex items-center justify-between text-[11px] font-mono pt-2 border-t border-slate-800/80">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-cyan-400" />
                      Active Blocks:
                    </span>
                    <span className="font-bold text-cyan-300">{affected.length} Blocks Assigned</span>
                  </div>
                </div>

                <div className="mt-4 pt-2 flex justify-end">
                  <span className="text-xs font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1">
                    <span>View Slots</span>
                    <Eye className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── DETAIL MODAL ──────────────────────────────────────────────────────── */}
      {selectedCorridor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <GitMerge className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold font-mono text-slate-100">{selectedCorridor.corridorId}</h3>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                      Line: {selectedCorridor.line}
                    </span>
                    <StatusBadge status={selectedCorridor.status} size="sm" />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedCorridor.sectionId} ({selectedCorridor.fromStation} ↔ {selectedCorridor.toStation})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCorridor(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs font-sans">
              {/* Windows Schedule */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-mono text-slate-300 uppercase font-semibold flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  Available Maintenance Windows
                </h4>
                <div className="space-y-1.5">
                  {selectedCorridor.availableWindows.map((w) => (
                    <div
                      key={w.windowId}
                      className="p-2.5 rounded bg-slate-950/60 border border-slate-800 flex items-center justify-between font-mono"
                    >
                      <div>
                        <div className="text-slate-200 font-medium">
                          {formatTime(w.start)} - {formatTime(w.end)} ({w.durationMinutes} mins)
                        </div>
                        {w.restriction && (
                          <div className="text-[10px] text-amber-400 mt-0.5">{w.restriction}</div>
                        )}
                      </div>
                      <StatusBadge status={w.status} size="sm" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Restrictions */}
              {selectedCorridor.restrictions.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-1">
                  <span className="text-[10px] font-mono text-amber-300 uppercase font-bold">
                    Section Speed & Work Restrictions
                  </span>
                  <ul className="list-disc list-inside text-amber-200/90 text-xs space-y-0.5">
                    {selectedCorridor.restrictions.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Affected Blocks in Section */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-mono text-slate-300 uppercase font-semibold flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  Active Integrated Blocks on this Section
                </h4>
                {getAffectedBlocks(selectedCorridor.sectionId).length === 0 ? (
                  <p className="text-slate-400 font-mono text-xs italic">No blocks scheduled currently.</p>
                ) : (
                  <div className="space-y-1.5">
                    {getAffectedBlocks(selectedCorridor.sectionId).map((b) => (
                      <div
                        key={b.blockId}
                        className="p-2.5 rounded bg-slate-950/40 border border-slate-800 flex items-center justify-between font-mono"
                      >
                        <div>
                          <div className="text-cyan-300 font-medium">{b.blockId}</div>
                          <div className="text-[10px] text-slate-400">
                            {formatTime(b.startTime)} - {formatTime(b.endTime)} ({b.durationMinutes}m)
                          </div>
                        </div>
                        <StatusBadge status={b.status} size="sm" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedCorridor(null)}
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
export default CorridorsPage;
