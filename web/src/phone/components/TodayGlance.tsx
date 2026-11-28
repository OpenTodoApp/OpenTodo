// Today at a glance on a phone (OpenSpec changes phone-modern-look D2, phone-delight
// D10): cards under Today's title, laid out as a bento rather than three equal tiles,
// so nothing is squeezed into a third of the width. Up next, the first open task of
// today whose time has not passed, is the wide card on top: its time large, how soon,
// and its title; it opens the task. Under it Done today, a ring of the tasks completed
// today out of those and the day's open ones, and Late, the tasks from earlier days,
// which scrolls to them; either takes the whole row when the other is not shown. The
// open tasks are the ones Today lists, so the cards agree with the list under them,
// also while Done today is hidden.
import { type ReactNode, useId, useMemo } from 'react'
import { formatMinutes } from '../../lib/duration'
import { dayOf } from '../../lib/feed'
import { t } from '../../lib/i18n'
import { useMinuteNow } from '../../lib/timeEntries'
import type { Task } from '../../lib/types'
import { Icon } from '../../ui'
import { openTaskFromList } from '../transition'

const hhmm = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

/** The tasks completed today, a skipped occurrence not counted. */
export function doneToday(all: readonly Task[], today: string): number {
  return all.filter((x) => x.completed_at && !x.skipped && dayOf(x.completed_at) === today).length
}

/** What the tiles show: from the tasks Today lists, every task (for those completed today) and the earlier count. */
export function glanceOf(listed: readonly Task[], all: readonly Task[], late: number, today: string, now: number) {
  const done = doneToday(all, today)
  const open = listed.filter((x) => !x.completed_at)
  const at = hhmm(now)
  // The next task at a time still ahead; when none is, the first of the day's in the list's order.
  const timed = open
    .filter((x) => x.due?.date === today && x.due.time && x.due.time >= at)
    .sort((a, b) => (a.due!.time! < b.due!.time! ? -1 : a.due!.time! > b.due!.time! ? 1 : 0))[0]
  const next = timed ?? open.find((x) => x.due?.date === today && !x.due.time) ?? null
  // The earlier tasks are in the list too; the ring counts the day's own.
  const total = done + open.filter((x) => x.due?.date === today || !x.due).length
  return { done, total, next, late }
}

/** The day's progress as a ring that moves to a new value (phone-delight D1); `small` is the bar's 20 px one (D9). */
export function Ring({ value, total, small = false }: { value: number; total: number; small?: boolean }) {
  const id = useId()
  const r = 15, c = 2 * Math.PI * r
  const share = total ? Math.min(1, value / total) : 0
  return (
    <svg viewBox="0 0 36 36" className={`${small ? 'h-5 w-5' : 'h-12 w-12 min-[380px]:h-14 min-[380px]:w-14'} shrink-0 -rotate-90`} aria-hidden>
      <defs>
        <linearGradient id={`${id}-arc`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--ot-accent)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--ot-info)' }} />
        </linearGradient>
      </defs>
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth={small ? 4 : 3.5} stroke="currentColor" className="text-muted opacity-15" />
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth={small ? 4 : 3.5} strokeLinecap="round" stroke={`url(#${id}-arc)`}
        className={share > 0 ? '' : 'opacity-0'} strokeDasharray={`${share * c} ${c}`} data-glance-ring />
    </svg>
  )
}

/** Minutes from `now` to `hhmm` today, or null once it has passed. */
function minutesUntil(hhmm: string, now: number): number | null {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(now)
  const mins = h * 60 + m - (d.getHours() * 60 + d.getMinutes())
  return mins >= 0 ? mins : null
}

const CARD = 'phone-tile relative flex min-w-0 overflow-hidden rounded-phone-card p-4 text-start shadow-2'
const PLAIN = 'bg-surface dark:bg-raised'
const LABEL = 'text-meta leading-tight text-muted'
/** A card's name, above its figure: small capitals that wrap rather than squeeze. */
const KICKER = 'text-hint font-semibold uppercase tracking-wide'

/** The Done today card: a button that opens the group once a task was done, a plain card before. */
function DoneCard({ onClick, className, children }: { onClick?: () => void; className: string; children: ReactNode }) {
  return onClick
    ? <button type="button" data-glance="done" onClick={onClick} className={`${className} press-selected`}>{children}</button>
    : <div data-glance="done" className={className}>{children}</div>
}

export function TodayGlance({ listed, all, late, today, onLate, onDone, at }: {
  listed: readonly Task[]; all: readonly Task[]; late: number; today: string; onLate: () => void
  /** Opens the Done today group (phone-calm D6); the card is a button while something was done. */
  onDone?: () => void
  /** A fixed time instead of the clock (a story). */
  at?: number
}) {
  const clock = useMinuteNow(at === undefined)
  const now = at ?? clock
  const g = useMemo(() => glanceOf(listed, all, late, today, now), [listed, all, late, today, now])
  if (!g.total && !g.late) return null
  const time = g.next?.due?.time
  const soon = time ? minutesUntil(time, now) : null
  const left = Math.max(0, g.total - g.done)
  return (
    <div data-today-glance className="mb-5 grid grid-cols-2 gap-2.5">
      {g.next && (
        <button type="button" data-glance="next" onClick={() => openTaskFromList(g.next!.id)}
          className={`${CARD} press-selected col-span-2 items-center gap-4 bg-linear-to-b from-accent-soft via-surface to-surface dark:via-raised dark:to-raised`}>
          <span className="flex shrink-0 flex-col items-start">
            <span className={`${KICKER} text-accent`}>{t('Up next')}</span>
            {time
              ? <span className="text-display tabular-nums text-strong">{time}</span>
              : <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-on-accent"><Icon name="sun" size="sm" /></span>}
            {soon !== null && soon > 0 && <span className={LABEL}>{t('in {time}', { time: formatMinutes(soon) })}</span>}
          </span>
          <span aria-hidden className="w-0.5 self-stretch rounded-full bg-accent/30" />
          <span className="line-clamp-2 min-w-0 flex-1 text-title text-strong">{g.next.title}</span>
          <Icon name="chevron-right" size="sm" className="shrink-0 text-faint" />
        </button>
      )}
      <DoneCard onClick={g.done > 0 ? onDone : undefined} className={`${CARD} ${PLAIN} flex-col gap-2 ${g.late ? '' : 'col-span-2'}`}>
        <span className={`${KICKER} text-muted`}>{t('Done today')}</span>
        <span className="flex items-center gap-3">
          <Ring value={g.done} total={g.total} />
          <span className="text-display tabular-nums text-strong">{g.done}<span className="text-h2 text-faint">/{g.total}</span></span>
          {!g.late && left > 0 && <span className="ms-auto text-meta text-muted tabular-nums">{t('{n} left', { n: left })}</span>}
        </span>
      </DoneCard>
      {g.late > 0 && (
        <button type="button" data-glance="late" onClick={onLate}
          className={`${CARD} press-selected flex-col gap-2 bg-linear-to-b from-danger-soft to-surface dark:to-raised`}>
          <span className={`${KICKER} text-danger`}>{t('Late')}</span>
          <span className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-danger text-on-accent min-[380px]:h-14 min-[380px]:w-14"><Icon name="circle-alert" size="md" /></span>
            <span className="text-display tabular-nums text-danger">{g.late}</span>
            <Icon name="chevron-right" size="sm" className="ms-auto shrink-0 text-faint" />
          </span>
        </button>
      )}
    </div>
  )
}
