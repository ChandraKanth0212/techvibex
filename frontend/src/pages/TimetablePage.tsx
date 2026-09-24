import React from 'react';
import { TrainTrack } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';

export const TimetablePage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="Train Timetable & Schedules"
        description="Passenger and freight train schedules across monitored railway corridors."
        icon={TrainTrack}
      />
      <div className="p-8 rounded-lg bg-slate-900/40 border border-slate-800 text-center">
        <h4 className="text-sm font-medium text-slate-300">Timetable Shell</h4>
        <p className="text-xs text-slate-400 mt-1">
          Route <span className="font-mono text-blue-400">/timetable</span> loaded successfully.
        </p>
      </div>
    </div>
  );
};
