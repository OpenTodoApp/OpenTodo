// Skeleton (OpenSpec change ux-overhaul, design-system "Skeleton primitive"): the
// shape of what is loading, shown wherever local data is awaited, never a spinner
// or a "Loading…" sentence. The shimmer is still under reduced motion.
import type { HTMLAttributes } from 'react'
import { t } from '../lib/i18n'

export type SkeletonShape = 'row' | 'line' | 'card'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  shape?: SkeletonShape
  /** How many of the shape to show. */
  count?: number
  /** Accessible status text; one per group, not per shape. */
  label?: string
}

const BLOCK = 'animate-pulse bg-sunken motion-reduce:animate-none dark:bg-raised'

function Shape({ shape, i }: { shape: SkeletonShape; i: number }) {
  if (shape === 'line') return <div className={`h-3.5 rounded-chip ${BLOCK}`} style={{ width: `${[92, 70, 84, 60][i % 4]}%` }} />
  if (shape === 'card') {
    return (
      <div className="rounded-card border border-default bg-surface p-4">
        <div className={`mb-3 h-4 w-2/5 rounded-chip ${BLOCK}`} />
        <div className={`mb-2 h-3.5 w-full rounded-chip ${BLOCK}`} />
        <div className={`h-3.5 w-3/4 rounded-chip ${BLOCK}`} />
      </div>
    )
  }
  return (
    <div className="flex min-h-(--size-row) items-center gap-2 px-2 py-2">
      <span className="h-5 w-4 shrink-0" />
      <div className={`h-5 w-5 shrink-0 rounded-full ${BLOCK}`} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className={`h-3.5 rounded-chip ${BLOCK}`} style={{ width: `${[72, 48, 64, 56][i % 4]}%` }} />
        {i % 2 === 0 && <div className={`h-3 w-24 rounded-chip ${BLOCK}`} />}
      </div>
    </div>
  )
}

export function Skeleton({ shape = 'row', count = 3, label = t('Loading'), className, ...rest }: SkeletonProps) {
  return (
    <div role="status" aria-label={label} aria-busy="true" data-skeleton={shape} {...rest}
      className={`${shape === 'line' ? 'space-y-2' : shape === 'card' ? 'space-y-3' : ''}${className ? ` ${className}` : ''}`}>
      {Array.from({ length: count }, (_, i) => <Shape key={i} shape={shape} i={i} />)}
      <span className="sr-only">{label}…</span>
    </div>
  )
}
