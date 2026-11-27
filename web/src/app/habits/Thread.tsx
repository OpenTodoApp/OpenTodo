// The thread (OpenSpec change habits-home, design D8): a habit's last seven days as
// marks on one line, inline SVG with no library. Marks differ by shape: filled for
// done, half filled for the tiny version, a dash for skipped, an empty circle for
// missed and a ring for today. A solid line joins consecutive kept days, a dotted
// one crosses a skip, none touches a miss, and a thin line marks two misses in a row
// (at risk) without a danger colour. Unscheduled days are blank. Every colour is a
// token: the hue of the habit (data-hue on an ancestor) over the surface.
//
// Each day is also a control with its date and state as its name; a past scheduled
// day opens Done, Tiny, Skipped and Clear (D6) through `onDay`.
import type { ReactNode } from 'react'
import type { DayCell, DayState } from '../../lib/habits'
import { editableDay } from '../../lib/habits'
import type { DayChoice } from '../../lib/habitActions'
import { t } from '../../lib/i18n'
import { DayMenu } from './DayMenu'
import { threadDayLabel } from './habitText'

const STEP = 24

type Link = 'solid' | 'dotted' | 'thin' | null

const isKept = (s: DayState) => s === 'done' || s === 'tiny' || s === 'partial'
const isMark = (s: DayState) => s !== 'blank' && s !== 'upcoming'

/** The line between two consecutive marked days. */
export function linkOf(a: DayState, b: DayState): Link {
  if (a === 'missed' && b === 'missed') return 'thin'
  if (a === 'missed' || b === 'missed' || a === 'pending' || b === 'pending') return null
  if (a === 'skipped' || b === 'skipped') return 'dotted'
  return isKept(a) && isKept(b) ? 'solid' : null
}

/** The filled wedge of a ring for `share` (0–1) of it, clockwise from the top. */
function wedge(x: number, y: number, r: number, share: number): string {
  const a = 2 * Math.PI * Math.min(Math.max(share, 0), 0.999)
  const ex = x + r * Math.sin(a)
  const ey = y - r * Math.cos(a)
  return `M ${x} ${y} L ${x} ${y - r} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)} Z`
}

function Mark({ cell, x, goal, step }: { cell: DayCell; x: number; goal?: number; step: number }): ReactNode {
  const y = step / 2
  const R = radius(step)
  const common = 'transition-[fill,stroke,opacity] duration-(--duration-moment)'
  switch (cell.state) {
    case 'done':
      return <circle cx={x} cy={y} r={R} className={`fill-hue-solid stroke-hue-solid ${common}`} data-mark="done" />
    case 'tiny':
      // Half filled: the left half solid, the ring whole.
      return (
        <g data-mark="tiny">
          <path d={`M ${x} ${y - R} A ${R} ${R} 0 0 0 ${x} ${y + R} Z`} className={`fill-hue-solid ${common}`} />
          <circle cx={x} cy={y} r={R - 0.75} fill="none" strokeWidth={1.5} className="stroke-hue-solid" />
        </g>
      )
    case 'partial':
      // Part of an amount (habit-targets D3): a wedge for the share reached, the ring whole.
      return (
        <g data-mark="partial">
          <path d={wedge(x, y, R, goal ? (cell.amount ?? 0) / goal : 0.5)} className={`fill-hue-solid ${common}`} />
          <circle cx={x} cy={y} r={R - 0.75} fill="none" strokeWidth={1.5} className="stroke-hue-solid" />
        </g>
      )
    case 'skipped':
      return <line x1={x - R} y1={y} x2={x + R} y2={y} strokeWidth={2} strokeLinecap="round" className="stroke-muted" data-mark="skipped" />
    case 'missed':
      return <circle cx={x} cy={y} r={R - 0.75} fill="none" strokeWidth={1.5} className="stroke-(--border-color-strong)" data-mark="missed" />
    case 'pending':
      return <circle cx={x} cy={y} r={R - 1} fill="none" strokeWidth={2} className={`stroke-hue-solid ${common}`} data-mark="today" />
    default:
      return null
  }
}

/** A mark's radius: 5 at the thread's 24 px a day, in step below (the phone row's week, habits-complete D1). */
const radius = (step: number) => Math.max(2.5, Math.round(step * 10 / 24) / 2)

export function Thread({ days, today, onPick, onNote, notes, label, goal, unit, step: size = STEP }: {
  days: readonly DayCell[]
  today: string
  /** Done, Tiny, Skipped or Clear chosen on a past scheduled day (D6); omitted where days are not editable (the strip). */
  onPick?: (date: string, choice: DayChoice) => void
  /** Note on a past day (habit-notes D2). */
  onNote?: (date: string) => void
  /** The days with a check-in note: a small mark under the day (habit-notes D3). */
  notes?: ReadonlySet<string>
  label?: string
  /** An amount habit's goal and unit (habit-targets D3): days fill by their share and read "5 of 8 glasses". */
  goal?: number
  unit?: string
  /** Pixels a day: 24, or smaller for a read-only week (the phone row). */
  step?: number
}) {
  const R = radius(size)
  const width = size * days.length
  const x = (i: number) => size / 2 + i * size
  const links: { i: number; j: number; kind: Link }[] = []
  let prev = -1
  days.forEach((d, i) => {
    if (!isMark(d.state)) return
    if (prev >= 0) links.push({ i: prev, j: i, kind: linkOf(days[prev].state, d.state) })
    prev = i
  })
  return (
    <div role="group" aria-label={label ?? t('Last seven days')} className="relative shrink-0" style={{ width, height: size }} data-thread>
      <svg width={width} height={size} viewBox={`0 0 ${width} ${size}`} aria-hidden="true" className="absolute inset-0 overflow-visible">
        {links.map(({ i, j, kind }) => kind && (
          <line key={`${i}-${j}`} x1={x(i) + R} y1={size / 2} x2={x(j) - R} y2={size / 2} data-link={kind}
            strokeWidth={kind === 'thin' ? 1 : 2} strokeLinecap="round" strokeDasharray={kind === 'dotted' ? '1 3' : undefined}
            className={kind === 'thin' ? 'stroke-faint' : kind === 'dotted' ? 'stroke-muted' : 'stroke-hue-solid transition-opacity duration-(--duration-moment)'} />
        ))}
        {days.map((d, i) => <Mark key={d.date} cell={d} x={x(i)} goal={goal} step={size} />)}
        {days.map((d, i) => notes?.has(d.date) && <circle key={`n-${d.date}`} cx={x(i)} cy={size - 1.5} r={size < 24 ? 1 : 1.5} className="fill-accent" data-note-mark={d.date} />)}
      </svg>
      <div className="absolute inset-0 flex">
        {days.map((d) => {
          const name = threadDayLabel(d.date, d.state, !!notes?.has(d.date), goal && d.amount ? { amount: d.amount, goal, unit } : undefined)
          const editable = !!onPick && editableDay(d, today)
          return editable ? (
            <DayMenu key={d.date} cell={d} label={name} onPick={(c) => onPick!(d.date, c)} onNote={onNote ? () => onNote(d.date) : undefined}
              triggerClassName="h-6 w-6 rounded-chip focus-visible:outline-2 focus-visible:outline-focus" />
          ) : (
            <span key={d.date} role="img" aria-label={name} data-day={d.date} data-state={d.state} aria-current={d.today ? 'date' : undefined} style={{ width: size }} />
          )
        })}
      </div>
    </div>
  )
}
