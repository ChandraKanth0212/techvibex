import React from 'react';
import { Wrench } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';

export const MaintenancePage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="Maintenance Jobs & Work Orders"
        description="Track track maintenance, overhead equipment (OHE), and signaling work schedules."
        icon={Wrench}
      />
      <div className="p-8 rounded-lg bg-slate-900/40 border border-slate-800 text-center">
        <h4 className="text-sm font-medium text-slate-300">Maintenance Jobs Module Shell</h4>
        <p className="text-xs text-slate-400 mt-1">
          Route <span className="font-mono text-blue-400">/maintenance</span> loaded successfully.
        </p>
      </div>
    </div>
  );
};
