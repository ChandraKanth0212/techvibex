import React from 'react';
import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';

export const AnalyticsPage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="System Analytics & KPIs"
        description="Corridor utilization, block fulfillment rate, and train delay impact metrics."
        icon={BarChart3}
      />
      <div className="p-8 rounded-lg bg-slate-900/40 border border-slate-800 text-center">
        <h4 className="text-sm font-medium text-slate-300">Analytics Shell</h4>
        <p className="text-xs text-slate-400 mt-1">
          Route <span className="font-mono text-blue-400">/analytics</span> loaded successfully.
        </p>
      </div>
    </div>
  );
};
