import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Wrench,
  FileCheck2,
  Layers,
  CalendarDays,
  AlertTriangle,
  GitMerge,
  TrainTrack,
  Sparkles,
  BarChart3,
  ClipboardList,
  Settings,
  TrainFront
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavGroup {
  label: string;
  items: {
    title: string;
    href: string;
    icon: React.ElementType;
    badge?: string;
  }[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { title: 'Block Planner', href: '/planner', icon: CalendarDays },
      { title: 'Conflicts', href: '/conflicts', icon: AlertTriangle, badge: 'Live' },
    ],
  },
  {
    label: 'Block Management',
    items: [
      { title: 'Maintenance Jobs', href: '/maintenance', icon: Wrench },
      { title: 'Block Requests', href: '/block-requests', icon: FileCheck2 },
      { title: 'Integrated Blocks', href: '/integrated-blocks', icon: Layers },
    ],
  },
  {
    label: 'Corridor & Timetable',
    items: [
      { title: 'Corridors & Sections', href: '/corridors', icon: GitMerge },
      { title: 'Train Timetable', href: '/timetable', icon: TrainTrack },
    ],
  },
  {
    label: 'Intelligence & Insights',
    items: [
      { title: 'AI Recommendations', href: '/ai-recommendations', icon: Sparkles, badge: 'AI' },
      { title: 'Analytics & KPIs', href: '/analytics', icon: BarChart3 },
      { title: 'Audit Log', href: '/audit-log', icon: ClipboardList },
    ],
  },
  {
    label: 'System',
    items: [
      { title: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 bg-[#0F172A] border-r border-slate-800 flex flex-col shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-16 px-5 border-b border-slate-800 flex items-center justify-between bg-[#0B0F19]/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/10">
            <TrainFront className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-100 tracking-wide text-base leading-tight">RAILOPT</h1>
            <p className="text-[10px] text-blue-400 font-mono font-medium tracking-wider uppercase">Command Center UI</p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          M4
        </span>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            <h2 className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
              {group.label}
            </h2>
            <div className="space-y-0.5 pt-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between px-3 py-2 text-xs font-medium rounded-md transition-all duration-150',
                        isActive
                          ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      )
                    }
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.title}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={cn(
                          'text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold',
                          item.badge === 'AI'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Module Status Footer */}
      <div className="p-3 border-t border-slate-800 bg-[#0B0F19]/40">
        <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-mono text-slate-300">Mock API Ready</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">v0.1.0</span>
        </div>
      </div>
    </aside>
  );
};
