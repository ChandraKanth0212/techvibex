import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: React.ReactNode;
  color?: 'blue' | 'amber' | 'emerald' | 'rose' | 'cyan' | 'purple';
  loading?: boolean;
  className?: string;
  onClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  icon: Icon,
  subtitle,
  color = 'blue',
  loading = false,
  className,
  onClick,
}) => {
  const colorStyles = {
    blue: {
      iconBg: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
      borderHover: 'hover:border-blue-500/40',
      valueColor: 'text-slate-100',
    },
    emerald: {
      iconBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
      borderHover: 'hover:border-emerald-500/40',
      valueColor: 'text-emerald-400',
    },
    amber: {
      iconBg: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
      borderHover: 'hover:border-amber-500/40',
      valueColor: 'text-amber-300',
    },
    rose: {
      iconBg: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
      borderHover: 'hover:border-rose-500/40',
      valueColor: 'text-rose-400',
    },
    cyan: {
      iconBg: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
      borderHover: 'hover:border-cyan-500/40',
      valueColor: 'text-cyan-400',
    },
    purple: {
      iconBg: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
      borderHover: 'hover:border-purple-500/40',
      valueColor: 'text-purple-300',
    },
  };

  const scheme = colorStyles[color];

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-4 rounded-lg bg-slate-900/60 border border-slate-800 transition-all flex items-center justify-between',
        onClick && 'cursor-pointer hover:bg-slate-900/90',
        scheme.borderHover,
        className
      )}
    >
      <div className="flex-1 pr-3">
        <p className="text-[11px] text-slate-400 font-mono tracking-wider uppercase font-semibold">
          {title}
        </p>
        <div className="mt-1">
          {loading ? (
            <div className="h-7 w-16 bg-slate-800 animate-pulse rounded my-1" />
          ) : (
            <h3 className={cn('text-2xl font-bold font-mono tracking-tight', scheme.valueColor)}>
              {value}
            </h3>
          )}
        </div>
        {subtitle && <div className="text-[11px] text-slate-400 mt-1">{subtitle}</div>}
      </div>

      <div
        className={cn(
          'w-10 h-10 rounded-md border flex items-center justify-center shrink-0 shadow-sm',
          scheme.iconBg
        )}
      >
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );
};
