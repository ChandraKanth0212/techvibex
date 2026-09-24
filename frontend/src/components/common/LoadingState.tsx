import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading data...',
}) => {
  return (
    <div className="py-12 px-4 text-center rounded-lg border border-slate-800 bg-slate-900/20">
      <Loader2 className="w-6 h-6 text-blue-400 animate-spin mx-auto mb-2" />
      <p className="text-xs text-slate-400 font-mono">{message}</p>
    </div>
  );
};
