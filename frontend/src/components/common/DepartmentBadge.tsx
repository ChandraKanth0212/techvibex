import React from 'react';
import { Department } from '@/types/asset';
import { cn } from '@/lib/utils';
import { Hammer, Radio, Zap } from 'lucide-react';

interface DepartmentBadgeProps {
  department: Department | string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export const DepartmentBadge: React.FC<DepartmentBadgeProps> = ({
  department,
  showIcon = true,
  size = 'sm',
  className,
}) => {
  const dept = department.toUpperCase();

  let label = department;
  let colorClass = 'bg-slate-800 text-slate-300 border-slate-700';
  let Icon = Hammer;

  if (dept === 'ENGINEERING') {
    label = 'ENG (Civil/Track)';
    colorClass = 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    Icon = Hammer;
  } else if (dept === 'SNT') {
    label = 'S&T (Signals)';
    colorClass = 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30';
    Icon = Radio;
  } else if (dept === 'TRACTION') {
    label = 'TRD (Traction/OHE)';
    colorClass = 'bg-purple-500/10 text-purple-300 border-purple-500/30';
    Icon = Zap;
  }

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 gap-1.5',
    md: 'text-xs px-2.5 py-1 gap-2',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-mono font-medium rounded border tracking-wide whitespace-nowrap',
        colorClass,
        sizeStyles[size],
        className
      )}
      title={`Department: ${dept}`}
    >
      {showIcon && <Icon className="w-3 h-3 shrink-0" />}
      <span>{label}</span>
    </span>
  );
};
