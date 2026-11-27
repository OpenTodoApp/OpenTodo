// Today at a glance on a phone (OpenSpec change phone-modern-look, design D2): up to
// three tiles under Today's title. Done today, a ring of the tasks completed today
// out of those and the day's open ones; Up next, the first open task of today whose
// time has not passed, which opens it; Late, the tasks from earlier days, which
// scrolls to them. The open tasks are the ones Today lists, so the tiles agree with
// the list under them, also while Done today is hidden.
import { useMemo } from 'react'
import { dayOf } from '../../lib/feed'
import { t } from '../../lib/i18n'
import { useMinuteNow } from '../../lib/timeEntries'
import type { Task } from '../../lib/types'
import { Icon } from '../../ui'
import { openTaskFromList } from '../transition'

const hhmm = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

/** What the tiles show: from the tasks Today lists, every task (for those completed today) and the earlier count. */
export function glanceOf(listed: readonly Task[], all: readonly Task[], late: number, today: string, now: number) {
  const done = all.filter((x) => x.completed_at && !x.skipped && dayOf(x.completed_at) === today).length
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

function Ring({ value, total }: { value: number; total: number }) {
  const r = 15, c = 2 * Math.PI * r
  const share = total ? Math.min(1, value / total) : 0
  return (
    <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" stroke="currentColor" className="text-muted opacity-20" />
      {share > 0 && <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-accent" strokeDasharray={`${share * c} ${c}`} />}
    </svg>
  )
}

const TILE = 'phone-tile flex min-w-0 flex-col justify-between gap-2 rounded-phone-card bg-surface p-3 text-start shadow-2 dark:bg-raised'

export function TodayGlance({ listed, all, late, today, onLate, at }: {
  listed: readonly Task[]; all: readonly Task[]; late: number; today: string; onLate: () => void
  /** A fixed time instead of the clock (a story). */
  at?: number
}) {
  const clock = useMinuteNow(at === undefined)
  const now = at ?? clock
  const g = useMemo(() => glanceOf(listed, all, late, today, now), [listed, all, late, today, now])
  if (!g.total && !g.late) return null
  return (
    <div data-today-glance className={`mb-5 grid gap-2.5 ${[g.next, g.late].filter(Boolean).length === 2 ? 'grid-cols-[1fr_1.5fr_1fr]' : g.next || g.late ? 'grid-cols-[1fr_2fr]' : 'grid-cols-1'}`}>
      <div className={TILE} data-glance="done">
        <Ring value={g.done} total={g.total} />
        <div className="min-w-0">
          <p className="text-title text-strong tabular-nums">{g.done}<span className="text-muted">/{g.total}</span></p>
          <p className="truncate text-meta text-muted">{t('Done today')}</p>
        </div>
      </div>
      {g.next && (
        <button type="button" className={`${TILE} press-selected`} data-glance="next" onClick={() => openTaskFromList(g.next!.id)}>
          <span className="inline-flex h-9 items-center gap-1.5 self-start rounded-full bg-accent-soft px-3 text-meta font-semibold text-accent tabular-nums">
            <Icon name={g.next.due?.time ? 'clock' : 'sun'} size="sm" />{g.next.due?.time ?? t('Today')}
          </span>
          <span className="min-w-0">
            <span className="line-clamp-2 text-prose font-medium leading-snug text-strong">{g.next.title}</span>
            <span className="block truncate text-meta text-muted">{t('Up next')}</span>
          </span>
        </button>
      )}
      {g.late > 0 && (
        <button type="button" className={`${TILE} press-selected`} data-glance="late" onClick={onLate}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-danger-soft text-danger"><Icon name="circle-alert" size="sm" /></span>
          <span className="min-w-0">
            <span className="block text-title text-danger tabular-nums">{g.late}</span>
            <span className="block truncate text-meta text-muted">{t('Late')}</span>
          </span>
        </button>
      )}
    </div>
  )
}
