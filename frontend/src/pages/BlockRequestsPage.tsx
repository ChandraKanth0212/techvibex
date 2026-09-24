import React from 'react';
import { FileCheck2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';

export const BlockRequestsPage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="Block Requests Management"
        description="Review, submit, and approve divisional maintenance block applications."
        icon={FileCheck2}
      />
      <div className="p-8 rounded-lg bg-slate-900/40 border border-slate-800 text-center">
        <h4 className="text-sm font-medium text-slate-300">Block Requests Module Shell</h4>
        <p className="text-xs text-slate-400 mt-1">
          Route <span className="font-mono text-blue-400">/block-requests</span> loaded successfully.
        </p>
      </div>
    </div>
  );
};
