import React, { useState, useMemo } from 'react';
import {
  ClipboardList,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterBar } from '@/components/common/FilterBar';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import { useAuditLog } from '@/hooks';
import { formatTime, formatDate } from '@/utils';

export const AuditLogPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<string>('ALL');

  const filters = useMemo(() => {
    return {
      entityType: selectedEntity !== 'ALL' ? selectedEntity : undefined,
    };
  }, [selectedEntity]);

  const { data: auditLog, isLoading, isError, refetch } = useAuditLog(filters);

  const filteredLogs = useMemo(() => {
    if (!auditLog) return [];
    if (!searchQuery.trim()) return auditLog;
    const q = searchQuery.toLowerCase();
    return auditLog.filter(
      (e) =>
        e.auditId.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.entityId.toLowerCase().includes(q) ||
        e.userId.toLowerCase().includes(q) ||
        (e.reason && e.reason.toLowerCase().includes(q))
    );
  }, [auditLog, searchQuery]);

  const hasActiveFilters = Boolean(searchQuery) || selectedEntity !== 'ALL';

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedEntity('ALL');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Command Center Audit Trail"
        description="Immutable governance log capturing manual overrides, approvals, block cancellations, and AI acceptances."
        icon={ClipboardList}
        badge="SECURITY & GOVERNANCE"
      />

      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search audit ID, action, entity ID, or user..."
        hasActiveFilters={hasActiveFilters}
        onClearFilters={handleClearFilters}
        totalCount={auditLog?.length}
        filteredCount={filteredLogs.length}
      >
        <select
          value={selectedEntity}
          onChange={(e) => setSelectedEntity(e.target.value)}
          className="bg-slate-950 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
        >
          <option value="ALL">All Entity Types</option>
          <option value="BLOCK_REQUEST">BLOCK_REQUEST</option>
          <option value="INTEGRATED_BLOCK">INTEGRATED_BLOCK</option>
          <option value="CONFLICT">CONFLICT</option>
          <option value="AI_RECOMMENDATION">AI_RECOMMENDATION</option>
          <option value="MAINTENANCE_TASK">MAINTENANCE_TASK</option>
        </select>
      </FilterBar>

      {isLoading ? (
        <LoadingState message="Loading governance audit events..." />
      ) : isError ? (
        <div className="p-6 rounded-lg bg-rose-500/10 border border-rose-500/30 text-center">
          <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
          <p className="text-xs text-rose-300">Failed to load audit logs.</p>
          <button
            onClick={() => refetch()}
            className="mt-3 px-3 py-1.5 rounded bg-rose-500/20 text-rose-300 text-xs font-mono"
          >
            Retry
          </button>
        </div>
      ) : filteredLogs.length === 0 ? (
        <EmptyState title="No audit entries match criteria" description="Try clearing filters." />
      ) : (
        <div className="rounded-lg bg-slate-900/60 border border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="bg-slate-900/80 text-[11px] text-slate-400 font-mono border-b border-slate-800">
                  <th className="py-3 px-4 font-semibold">Timestamp</th>
                  <th className="py-3 px-3 font-semibold">Audit ID</th>
                  <th className="py-3 px-3 font-semibold">User & Role</th>
                  <th className="py-3 px-3 font-semibold">Entity</th>
                  <th className="py-3 px-3 font-semibold">Action Taken</th>
                  <th className="py-3 px-3 font-semibold">Status Transition</th>
                  <th className="py-3 px-4 font-semibold">Reason / Context</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLogs.map((log) => (
                  <tr key={log.auditId} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                      <div>{formatDate(log.timestamp)}</div>
                      <div className="text-[10px] text-slate-400">{formatTime(log.timestamp)} UTC</div>
                    </td>
                    <td className="py-3 px-3 font-mono text-blue-400 whitespace-nowrap">
                      {log.auditId}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                      <div className="font-semibold text-slate-200">{log.userId}</div>
                      <div className="text-[10px] text-slate-400">{log.userRole}</div>
                    </td>
                    <td className="py-3 px-3 font-mono whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700 block w-fit">
                        {log.entityType}
                      </span>
                      <span className="text-[11px] text-cyan-300 mt-0.5 block">{log.entityId}</span>
                    </td>
                    <td className="py-3 px-3 text-slate-200 whitespace-nowrap font-medium">
                      {log.action}
                    </td>
                    <td className="py-3 px-3 font-mono whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {log.previousStatus && (
                          <>
                            <StatusBadge status={log.previousStatus} size="sm" />
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                          </>
                        )}
                        <StatusBadge status={log.newStatus} size="sm" />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-400 max-w-[260px] truncate text-[11px]" title={log.reason}>
                      {log.reason || '---'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
export default AuditLogPage;
