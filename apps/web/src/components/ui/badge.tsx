import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        success: 'border-transparent bg-emerald-500/10 text-emerald-600',
        warning: 'border-transparent bg-amber-500/10 text-amber-600',
        destructive: 'border-transparent bg-destructive/10 text-destructive',
        outline: 'text-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

/** Maps a status string to a badge variant for consistent status coloring. */
export function statusVariant(value?: string | null): VariantProps<typeof badgeVariants>['variant'] {
  switch ((value ?? '').toUpperCase()) {
    case 'ACTIVE':
    case 'APPROVED':
    case 'COMPLETED':
    case 'TRUE':
    case 'OK':
      return 'success';
    case 'PENDING':
    case 'IN_PROGRESS':
    case 'ONBOARDING':
    case 'IDLE':
    case 'MAINTENANCE':
      return 'warning';
    case 'REJECTED':
    case 'INACTIVE':
    case 'LOCKED':
    case 'CLOSED':
    case 'SUSPENDED':
    case 'CANCELLED':
      return 'destructive';
    default:
      return 'secondary';
  }
}
