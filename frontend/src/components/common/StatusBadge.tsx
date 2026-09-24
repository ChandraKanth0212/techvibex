import React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'cyan'
  | 'slate';

interface StatusBadgeProps {
  status: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant,
  size = 'sm',
  className,
}) => {
  // Infer variant if not provided
  let computedVariant: BadgeVariant = variant || 'slate';

  if (!variant) {
    const s = status.toUpperCase();
    if (['APPROVED', 'COMPLETED', 'RESOLVED', 'PUBLISHED', 'OPERATIONAL', 'GOOD', 'LOW'].includes(s)) {
      computedVariant = 'success';
    } else if (['PENDING', 'UNDER_REVIEW', 'MEDIUM', 'ANALYZING', 'FAIR', 'PRIORITIZED'].includes(s)) {
      computedVariant = 'warning';
    } else if (['REJECTED', 'CONFLICT', 'CRITICAL', 'HIGH', 'CANCELLED', 'OUT_OF_SERVICE', 'POOR', 'OPEN'].includes(s)) {
      computedVariant = 'danger';
    } else if (['IN_PROGRESS', 'SCHEDULED', 'INTEGRATION_CANDIDATE', 'MODIFIED'].includes(s)) {
      computedVariant = 'info';
    } else if (['DEFERRED', 'IGNORED'].includes(s)) {
      computedVariant = 'slate';
    } else if (['AI_PROPOSED'].includes(s)) {
      computedVariant = 'cyan';
    }
  }

  const variantStyles: Record<BadgeVariant, string> = {
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    warning: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    danger: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    cyan: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    purple: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    slate: 'bg-slate-700/30 text-slate-300 border-slate-700/50',
    default: 'bg-slate-800 text-slate-300 border-slate-700',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  const formatText = (text: string) => {
    return text.replace(/_/g, ' ');
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-mono font-medium rounded border tracking-wide uppercase whitespace-nowrap',
        variantStyles[computedVariant],
        sizeStyles[size],
        className
      )}
    >
      {formatText(status)}
    </span>
  );
};
