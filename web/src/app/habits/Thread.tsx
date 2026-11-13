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
const R = 5

type Link = 'solid' | 'dotted' | 'thin' | null

const isKept = (s: DayState) => s === 'done' || s === 'tiny'
const isMark = (s: DayState) => s !== 'blank' && s !== 'upcoming'

/** The line between two consecutive marked days. */
export function linkOf(a: DayState, b: DayState): Link {
  if (a === 'missed' && b === 'missed') return 'thin'
  if (a === 'missed' || b === 'missed' || a === 'pending' || b === 'pending') return null
  if (a === 'skipped' || b === 'skipped') return 'dotted'
  return isKept(a) && isKept(b) ? 'solid' : null
}

function Mark({ cell, x }: { cell: DayCell; x: number }): ReactNode {
  const y = STEP / 2
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

export function Thread({ days, today, onPick, label }: {
  days: readonly DayCell[]
  today: string
  /** Done, Tiny, Skipped or Clear chosen on a past scheduled day (D6); omitted where days are not editable (the strip). */
  onPick?: (date: string, choice: DayChoice) => void
  label?: string
}) {
  const width = STEP * days.length
  const x = (i: number) => STEP / 2 + i * STEP
  const links: { i: number; j: number; kind: Link }[] = []
  let prev = -1
  days.forEach((d, i) => {
    if (!isMark(d.state)) return
    if (prev >= 0) links.push({ i: prev, j: i, kind: linkOf(days[prev].state, d.state) })
    prev = i
  })
  return (
    <div role="group" aria-label={label ?? t('Last seven days')} className="relative shrink-0" style={{ width, height: STEP }} data-thread>
      <svg width={width} height={STEP} viewBox={`0 0 ${width} ${STEP}`} aria-hidden="true" className="absolute inset-0 overflow-visible">
        {links.map(({ i, j, kind }) => kind && (
          <line key={`${i}-${j}`} x1={x(i) + R} y1={STEP / 2} x2={x(j) - R} y2={STEP / 2} data-link={kind}
            strokeWidth={kind === 'thin' ? 1 : 2} strokeLinecap="round" strokeDasharray={kind === 'dotted' ? '1 3' : undefined}
            className={kind === 'thin' ? 'stroke-faint' : kind === 'dotted' ? 'stroke-muted' : 'stroke-hue-solid transition-opacity duration-(--duration-moment)'} />
        ))}
        {days.map((d, i) => <Mark key={d.date} cell={d} x={x(i)} />)}
      </svg>
      <div className="absolute inset-0 flex">
        {days.map((d) => {
          const name = threadDayLabel(d.date, d.state)
          const editable = !!onPick && editableDay(d, today)
          return editable ? (
            <DayMenu key={d.date} cell={d} label={name} onPick={(c) => onPick!(d.date, c)}
              triggerClassName="h-6 w-6 rounded-chip focus-visible:outline-2 focus-visible:outline-focus" />
          ) : (
            <span key={d.date} role="img" aria-label={name} data-day={d.date} data-state={d.state} aria-current={d.today ? 'date' : undefined} style={{ width: STEP }} />
          )
        })}
      </div>
    </div>
  )
}
