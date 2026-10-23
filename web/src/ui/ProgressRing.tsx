// ProgressRing (OpenSpec change projects-table, design D5): a 14 px ring whose arc
// shows a share from 0 to 1, in the colour of its text (the accent by default), on a
// faint track of the same colour. Decorative: the percentage beside it is the value.
const R = 5
const C = 2 * Math.PI * R

export interface ProgressRingProps {
  /** The share done, 0 to 1. */
  value: number
  className?: string
}

export function ProgressRing({ value, className = 'text-accent' }: ProgressRingProps) {
  const share = Math.min(1, Math.max(0, value))
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" data-progress-ring className={`shrink-0 -rotate-90 ${className}`}>
      <circle cx="7" cy="7" r={R} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      {share > 0 && <circle cx="7" cy="7" r={R} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        strokeDasharray={`${share * C} ${C}`} />}
    </svg>
  )
}
