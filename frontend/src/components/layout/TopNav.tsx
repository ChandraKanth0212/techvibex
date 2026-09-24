import React, { useState } from 'react';
import {
  Bell,
  Search,
  Building2,
  RefreshCw,
  UserCheck,
  Zap
} from 'lucide-react';
import { API_CONFIG } from '@/services/api.config';

export const TopNav: React.FC = () => {
  const [selectedDivision, setSelectedDivision] = useState('SC - Secunderabad');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  return (
    <header className="h-16 bg-[#0F172A] border-b border-slate-800 px-6 flex items-center justify-between shrink-0 select-none">
      {/* Search & Global Context */}
      <div className="flex items-center gap-4 flex-1 max-w-xl">
        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search block ID, train #, section..."
            className="w-full bg-slate-900 border border-slate-700/80 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Railway Division Dropdown */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-900 border border-slate-800 text-xs">
          <Building2 className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-slate-400">Division:</span>
          <select
            value={selectedDivision}
            onChange={(e) => setSelectedDivision(e.target.value)}
            className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer"
          >
            <option value="SC - Secunderabad" className="bg-slate-900 text-slate-200">SC - Secunderabad</option>
            <option value="HYB - Hyderabad" className="bg-slate-900 text-slate-200">HYB - Hyderabad</option>
            <option value="BZA - Vijayawada" className="bg-slate-900 text-slate-200">BZA - Vijayawada</option>
            <option value="GNT - Guntur" className="bg-slate-900 text-slate-200">GNT - Guntur</option>
          </select>
        </div>
      </div>

      {/* Right Tools & Status Indicators */}
      <div className="flex items-center gap-3">
        {/* Data Source Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono bg-blue-500/10 text-blue-300 border-blue-500/30">
          <Zap className="w-3 h-3 text-blue-400" />
          <span>{API_CONFIG.useMock ? 'Mock API Active' : 'Live Gateway'}</span>
        </div>

        {/* Sync Button */}
        <button
          onClick={handleRefresh}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
          title="Refresh Data Feed"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
        </button>

        {/* Notifications */}
        <div className="relative">
          <button className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors relative">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-slate-900"></span>
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-slate-800 my-auto"></div>

        {/* User Badge */}
        <div className="flex items-center gap-2.5 pl-1">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-400 font-semibold text-xs">
            M4
          </div>
          <div className="hidden md:block text-left">
            <div className="text-xs font-semibold text-slate-200 leading-tight">Chief Controller</div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-emerald-400 inline" /> Module 4 Lead
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
