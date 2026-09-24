import React from 'react';
import { GitMerge } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';

export const CorridorsPage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="Corridors & Track Sections"
        description="Railway route section capacity, speed limits, and maintenance history."
        icon={GitMerge}
      />
      <div className="p-8 rounded-lg bg-slate-900/40 border border-slate-800 text-center">
        <h4 className="text-sm font-medium text-slate-300">Corridors Shell</h4>
        <p className="text-xs text-slate-400 mt-1">
          Route <span className="font-mono text-blue-400">/corridors</span> loaded successfully.
        </p>
      </div>
    </div>
  );
};
