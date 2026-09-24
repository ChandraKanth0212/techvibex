import React from 'react';
import { Settings } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';

export const SettingsPage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="System Settings"
        description="Configure API integration thresholds, notification rules, and system preferences."
        icon={Settings}
      />
      <div className="p-8 rounded-lg bg-slate-900/40 border border-slate-800 text-center">
        <h4 className="text-sm font-medium text-slate-300">Settings Shell</h4>
        <p className="text-xs text-slate-400 mt-1">
          Route <span className="font-mono text-blue-400">/settings</span> loaded successfully.
        </p>
      </div>
    </div>
  );
};
