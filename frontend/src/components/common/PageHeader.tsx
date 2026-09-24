import React from 'react';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon: Icon,
  badge,
  actions,
}) => {
  return (
    <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-800">
      <div className="flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-100">{title}</h1>
            {badge && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 font-semibold">
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>
      </div>

      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
};
