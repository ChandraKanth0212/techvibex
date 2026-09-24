import React, { useState, useMemo } from 'react';
import {
  TrainTrack,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Boxes,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterBar } from '@/components/common/FilterBar';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import { useTrainSchedule, useGoodsForecasts, useConflicts } from '@/hooks';
import type { TrainType, TrainStatus } from '@/types/train';
import { formatTime } from '@/utils';

export const TimetablePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'TRAINS' | 'GOODS'>('TRAINS');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const filters = useMemo(() => {
    return {
      trainType: selectedType !== 'ALL' ? (selectedType as TrainType) : undefined,
      status: selectedStatus !== 'ALL' ? (selectedStatus as TrainStatus) : undefined,
    };
  }, [selectedType, selectedStatus]);

  const { data: trains, isLoading: isTrainsLoading, isError: isTrainsError, refetch } =
    useTrainSchedule(filters);
  const { data: goodsForecasts, isLoading: isGoodsLoading } = useGoodsForecasts();
  const { data: conflicts } = useConflicts();

  // Find sections that have train or goods conflicts
  const conflictSections = useMemo(() => {
    if (!conflicts) return new Set<string>();
    return new Set(
      conflicts
        .filter(
          (c) =>
            ['TRAIN', 'GOODS'].includes(c.type) &&
            ['OPEN', 'UNDER_REVIEW'].includes(c.resolutionStatus)
        )
        .map((c) => c.sectionId)
    );
  }, [conflicts]);

  const filteredTrains = useMemo(() => {
    if (!trains) return [];
    if (!searchQuery.trim()) return trains;
    const q = searchQuery.toLowerCase();
    return trains.filter(
      (t) =>
        t.trainNumber.toLowerCase().includes(q) ||
        t.trainId.toLowerCase().includes(q) ||
        t.sectionId.toLowerCase().includes(q)
    );
  }, [trains, searchQuery]);

  const filteredGoods = useMemo(() => {
    if (!goodsForecasts) return [];
    if (!searchQuery.trim()) return goodsForecasts;
    const q = searchQuery.toLowerCase();
    return goodsForecasts.filter(
      (g) =>
        g.forecastId.toLowerCase().includes(q) ||
        g.sectionId.toLowerCase().includes(q) ||
        g.source.toLowerCase().includes(q)
    );
  }, [goodsForecasts, searchQuery]);

  const hasActiveFilters = Boolean(searchQuery) || selectedType !== 'ALL' || selectedStatus !== 'ALL';

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedType('ALL');
    setSelectedStatus('ALL');
  };

  const getTypeBadge = (type: TrainType) => {
    let colorClass = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    if (type === 'EXPRESS') colorClass = 'bg-amber-500/10 text-amber-300 border-amber-500/30 font-bold';
    else if (type === 'GOODS') colorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';

    return (
      <span className={`px-2 py-0.5 rounded text-[11px] font-mono border ${colorClass}`}>
        {type}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Train Timetable & Freight Flow"
        description="Monitor passenger schedules, express corridors, and AI-assisted probabilistic goods train paths."
        icon={TrainTrack}
        badge="SC DIVISION"
        actions={
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 font-mono text-xs">
            <button
              onClick={() => setActiveTab('TRAINS')}
              className={`px-3 py-1 rounded transition-colors ${
                activeTab === 'TRAINS'
                  ? 'bg-blue-600 text-white font-medium shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Scheduled Trains ({trains?.length ?? 0})
            </button>
            <button
              onClick={() => setActiveTab('GOODS')}
              className={`px-3 py-1 rounded transition-colors ${
                activeTab === 'GOODS'
                  ? 'bg-blue-600 text-white font-medium shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Goods Forecasts ({goodsForecasts?.length ?? 0})
            </button>
          </div>
        }
      />

      {activeTab === 'TRAINS' ? (
        <>
          <FilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Search train number, ID, or section ID..."
            hasActiveFilters={hasActiveFilters}
            onClearFilters={handleClearFilters}
            totalCount={trains?.length}
            filteredCount={filteredTrains.length}
          >
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
            >
              <option value="ALL">All Train Types</option>
              <option value="EXPRESS">EXPRESS</option>
              <option value="PASSENGER">PASSENGER</option>
              <option value="GOODS">GOODS</option>
              <option value="OTHER">OTHER</option>
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
            >
              <option value="ALL">All Statuses</option>
              <option value="SCHEDULED">SCHEDULED</option>
              <option value="RUNNING">RUNNING</option>
              <option value="DELAYED">DELAYED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="REROUTED">REROUTED</option>
            </select>
          </FilterBar>

          {isTrainsLoading ? (
            <LoadingState message="Loading train timetables..." />
          ) : isTrainsError ? (
            <div className="p-6 rounded-lg bg-rose-500/10 border border-rose-500/30 text-center">
              <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
              <p className="text-xs text-rose-300">Failed to load train schedules.</p>
              <button
                onClick={() => refetch()}
                className="mt-3 px-3 py-1.5 rounded bg-rose-500/20 text-rose-300 text-xs font-mono"
              >
                Retry
              </button>
            </div>
          ) : filteredTrains.length === 0 ? (
            <EmptyState title="No trains match criteria" description="Try clearing filters or search query." />
          ) : (
            <div className="rounded-lg bg-slate-900/60 border border-slate-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="bg-slate-900/80 text-[11px] text-slate-400 font-mono border-b border-slate-800">
                      <th className="py-3 px-4 font-semibold">Train Number</th>
                      <th className="py-3 px-3 font-semibold">Train ID</th>
                      <th className="py-3 px-3 font-semibold">Type</th>
                      <th className="py-3 px-3 font-semibold">Direction</th>
                      <th className="py-3 px-3 font-semibold">Section</th>
                      <th className="py-3 px-3 font-semibold">Schedule (Arrival - Departure)</th>
                      <th className="py-3 px-3 font-semibold">Priority</th>
                      <th className="py-3 px-3 font-semibold">Conflict Risk</th>
                      <th className="py-3 px-4 font-semibold text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredTrains.map((t) => {
                      const hasConflict = conflictSections.has(t.sectionId);

                      return (
                        <tr key={t.trainId} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-100 text-sm whitespace-nowrap">
                            {t.trainNumber}
                          </td>
                          <td className="py-3 px-3 font-mono text-blue-400 whitespace-nowrap">
                            {t.trainId}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">{getTypeBadge(t.trainType)}</td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-300">
                              {t.direction === 'UP' ? (
                                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <ArrowDownRight className="w-3.5 h-3.5 text-blue-400" />
                              )}
                              {t.direction} Line
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                            {t.sectionId}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                            <span className="text-slate-200 font-semibold">{formatTime(t.arrivalTime)}</span>
                            {' → '}
                            <span className="text-slate-200 font-semibold">{formatTime(t.departureTime)}</span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                            P{t.operationalPriority}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {hasConflict ? (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded"
                                title="Block path conflict detected on this section"
                              >
                                <AlertTriangle className="w-3 h-3" /> Path Conflict
                              </span>
                            ) : (
                              <span className="text-[11px] font-mono text-emerald-400/80">Clear</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <StatusBadge status={t.status} size="sm" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Goods Freight Flow Forecast View */
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Boxes className="w-5 h-5 text-emerald-400" />
              <div>
                <h4 className="text-xs font-bold font-mono text-emerald-300 uppercase">
                  Probabilistic Freight Paths (FOIS Predictive Feeds)
                </h4>
                <p className="text-[11px] text-emerald-400/80">
                  Goods train projections used for shadow window identification without disrupting freight revenue.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-1 rounded bg-emerald-500/20 text-emerald-300">
              Live Freight Stream
            </span>
          </div>

          {isGoodsLoading ? (
            <LoadingState message="Loading goods forecasts..." />
          ) : filteredGoods.length === 0 ? (
            <EmptyState title="No goods forecasts available" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGoods.map((g) => (
                <div
                  key={g.forecastId}
                  className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-3 font-mono"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-bold text-emerald-400 text-sm">{g.forecastId}</span>
                    <StatusBadge status={g.status} size="sm" />
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Section:</span>
                      <span className="text-slate-200 font-bold">{g.sectionId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Expected Slot:</span>
                      <span className="text-slate-200">{formatTime(g.expectedTime)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Probability:</span>
                      <span className="text-emerald-400 font-bold">{Math.round(g.probability * 100)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Confidence:</span>
                      <span className="text-cyan-300">{g.confidence}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">Feed Source:</span>
                      <span className="text-slate-400 truncate max-w-[150px]">{g.source}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default TimetablePage;
