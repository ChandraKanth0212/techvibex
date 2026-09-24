import React from 'react';
import { CalendarDays } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';

export const PlannerPage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="Interactive Block Planner"
        description="Visual Gantt and timeline slot allocation for corridor maintenance windows."
        icon={CalendarDays}
      />
      <div className="p-8 rounded-lg bg-slate-900/40 border border-slate-800 text-center">
        <h4 className="text-sm font-medium text-slate-300">Block Planner Shell</h4>
        <p className="text-xs text-slate-400 mt-1">
          Route <span className="font-mono text-blue-400">/planner</span> loaded successfully.
        </p>
      </div>
    </div>
  );
};
