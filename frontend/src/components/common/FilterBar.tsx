import React from 'react';
import { Search, X } from 'lucide-react';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchPlaceholder?: string;
  children?: React.ReactNode;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
  totalCount?: number;
  filteredCount?: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search...',
  children,
  onClearFilters,
  hasActiveFilters,
  totalCount,
  filteredCount,
}) => {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 mb-4 space-y-3">
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-md pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 transition-colors font-sans"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Custom Filter Controls & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {children}

          {hasActiveFilters && onClearFilters && (
            <button
              onClick={onClearFilters}
              className="px-2.5 py-1.5 rounded text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-colors flex items-center gap-1 font-mono"
            >
              <X className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}

          {typeof filteredCount === 'number' && typeof totalCount === 'number' && (
            <div className="text-[11px] font-mono text-slate-400 pl-1 border-l border-slate-800 py-1">
              Showing <span className="text-slate-200 font-semibold">{filteredCount}</span> of {totalCount}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
