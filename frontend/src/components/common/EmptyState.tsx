import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No records found',
  description = 'Try adjusting your filters or search query.',
  icon: Icon = Inbox,
  action,
}) => {
  return (
    <div className="py-12 px-4 text-center rounded-lg border border-dashed border-slate-800 bg-slate-900/30">
      <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 mx-auto flex items-center justify-center text-slate-400 mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <h4 className="text-sm font-medium text-slate-200">{title}</h4>
      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
