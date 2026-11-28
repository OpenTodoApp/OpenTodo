// The week at a glance above the Habits screen's board (OpenSpec change habits-board,
// design D3): Today as a ring and "2 of 5", the share of the last seven days' due days
// kept, and the longest running streak with its habit. From the device's rows only.
import { useMemo } from 'react'
import { weekProgress, type DayProgress } from '../../lib/habitDay'
import { habitStats, habitTarget, type HabitOptions } from '../../lib/habits'
import { t } from '../../lib/i18n'
import type { Task } from '../../lib/types'
import { StatTile } from '../review/charts'

const R = 16
const C = 2 * Math.PI * R

function TodayTile({ progress }: { progress: DayProgress }) {
  const share = progress.due ? progress.kept / progress.due : 0
  return (
    <div className="surface-card min-w-0 p-3" data-tile="today">
      <dt className="text-meta text-muted">{t('Today')}</dt>
      <dd className="flex items-center justify-between gap-3">
        <span className="text-display tabular-nums text-strong" data-tile-value>{progress.due ? t('{kept} of {of}', { kept: progress.kept, of: progress.due }) : '–'}</span>
        <svg viewBox="0 0 40 40" width="44" height="44" className="-mt-4 shrink-0 -rotate-90" aria-hidden="true">
          <circle cx="20" cy="20" r={R} fill="none" strokeWidth="4" className="stroke-(--border-color-default)" />
          {share > 0 && <circle cx="20" cy="20" r={R} fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-accent" strokeDasharray={`${C * share} ${C}`} />}
        </svg>
      </dd>
    </div>
  )
}

export function HabitsOverview({ habits, rowsOf, today, opts, progress }: {
  habits: readonly Task[]
  rowsOf: (t: Task) => readonly Task[]
  today: string
  opts?: HabitOptions
  progress: DayProgress
}) {
  const { week, best } = useMemo(() => {
    const d = new Date(`${today}T00:00:00Z`)
    const dates = Array.from({ length: 7 }, (_, i) => new Date(d.getTime() - (6 - i) * 86_400_000).toISOString().slice(0, 10))
    // A target habit's streak counts weeks, so it is left out of the longest run of days.
    let best: { n: number; title: string } | null = null
    for (const x of habits) {
      if (habitTarget(x)) continue
      const n = habitStats(x, rowsOf(x), today, opts)?.current ?? 0
      if (n > 0 && (!best || n > best.n)) best = { n, title: x.title || t('Untitled') }
    }
    return { week: weekProgress(habits, rowsOf, dates, today, opts), best }
  }, [habits, rowsOf, today, opts])
  return (
    <dl className="mb-4 grid max-w-[60rem] grid-cols-1 gap-3 min-[30rem]:grid-cols-3" data-habits-overview>
      <TodayTile progress={progress} />
      <StatTile testId="week" label={t('Last 7 days')} value={week.due ? `${Math.round((week.kept / week.due) * 100)} %` : '–'}
        note={week.due ? t('{kept} of {of}', { kept: week.kept, of: week.due }) : undefined} />
      <StatTile testId="streak" label={t('Streak')} value={best ? t('{n, plural, one {# day} other {# days}}', { n: best.n }) : '–'} note={best?.title} />
    </dl>
  )
}
