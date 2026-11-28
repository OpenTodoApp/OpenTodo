// A day's mark, the same on the phone's rows and the desktop's week board (OpenSpec
// changes habits-complete D1 and habits-board D2), in the habit's hue (data-hue on an ancestor).
import type { CSSProperties } from 'react'
import type { DayState } from '../../lib/habits'
import { Icon } from '../../ui'

/** A day's mark (habits-complete D1, habits-board D2): kept fills it, the tiny version half, an amount its share, skipped a dash, missed a dashed edge, a rest day faint. */
export function DayMark({ state, later, share, size = 'md' }: { state: DayState; later: boolean; share?: number; size?: 'md' | 'lg' }) {
  const base = `flex ${size === 'lg' ? 'h-8 w-8' : 'h-7 w-7'} items-center justify-center rounded-full border-2 transition-colors duration-(--duration-moment)`
  if (share !== undefined && share < 1 && state !== 'done') {
    const style = { backgroundImage: `conic-gradient(var(--hue-solid) ${Math.round(share * 360)}deg, transparent 0)` } as CSSProperties
    return <span aria-hidden data-ring="partial" className={`${base} border-hue-solid`} style={style} />
  }
  switch (state) {
    case 'done': return <span aria-hidden data-ring="done" className={`${base} border-hue-solid bg-hue-solid text-surface`}><Icon name="check" size="xs" /></span>
    case 'tiny': return <span aria-hidden data-ring="tiny" className={`${base} border-hue-solid bg-[linear-gradient(90deg,var(--hue-solid)_50%,transparent_50%)]`} />
    case 'skipped': return <span aria-hidden data-ring="skipped" className={`${base} border-input text-muted`}><Icon name="minus" size="xs" /></span>
    case 'missed': return <span aria-hidden data-ring="missed" className={`${base} border-dashed border-strong`} />
    case 'rest': return <span aria-hidden data-ring="rest" className={`${base} border-default`} />
    default: return <span aria-hidden data-ring={later ? 'later' : 'due'} className={`${base} border-hue-solid ${later ? 'border-dashed' : ''}`} />
  }
}

