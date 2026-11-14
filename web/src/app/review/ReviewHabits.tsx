// Habits in the weekly review's Look back step (OpenSpec change habit-notes, design
// D6): each open habit with its thread for the review's week, the week's kept measure
// and the week's check-in notes, newest first, from the device's rows, offline too.
// Shown only while Habits is on and an open habit exists; it writes nothing. Its own
// chunk, loaded with the step.
import { useMemo } from 'react'
import { periodFor } from '../../lib/stats'
import { habitDays, habitRowsOf, isGraduated, isOpenHabit } from '../../lib/habits'
import { checkInsOf, spanMeasure } from '../../lib/habitNotes'
import { useHabitsEnabled } from '../../lib/habitPrefs'
import { t } from '../../lib/i18n'
import { useLiveTasks } from '../../lib/liveTasks'
import { formatDate } from '../../lib/dates'
import { ListGroupHeader } from '../../ui'
import { Markdown } from '../Markdown'
import { navigate } from '../router'
import { Thread } from '../habits/Thread'

export default function ReviewHabits({ today, weekStart }: { today: string; weekStart: number }) {
  const on = useHabitsEnabled()
  const tasks = useLiveTasks()
  const week = periodFor('this-week', today, weekStart)
  const habits = useMemo(() => {
    if (!tasks) return []
    const rowsOf = habitRowsOf(tasks)
    return tasks.filter((x) => isOpenHabit(x) && !isGraduated(x)).map((series) => {
      const rows = rowsOf(series)
      const days = habitDays(series, rows, week.start, today < week.end ? today : week.end, today)
      const notes = checkInsOf(series, rows).filter((c) => c.date >= week.start && c.date <= week.end)
      return { series, days, measure: spanMeasure(days), notes }
    })
  }, [tasks, week.start, week.end, today])
  if (!on || habits.length === 0) return null
  return (
    <section aria-label={t('Habits')} className="mt-4" data-review-habits>
      <ListGroupHeader title={t('Habits')} />
      <ul className="space-y-3">
        {habits.map(({ series, days, measure, notes }) => (
          <li key={series.id} data-review-habit={series.id}>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => navigate({ view: 'habits', id: series.id })}
                className="user-text min-w-0 flex-1 truncate rounded-chip text-left text-body text-default hover:underline focus-visible:outline-2 focus-visible:outline-focus">
                {series.title || t('Untitled')}
              </button>
              <Thread days={days} today={today} notes={new Set(notes.map((n) => n.date))} label={t('This week')} />
              <span className="w-16 shrink-0 text-right text-meta tabular-nums text-muted" data-review-measure>{t('{kept} of {of}', { kept: measure.kept, of: measure.of })}</span>
            </div>
            {notes.length > 0 && (
              <ul className="mt-1 space-y-1 border-l border-soft pl-3">
                {notes.map((n) => (
                  <li key={n.record.id} className="text-meta" data-review-note={n.date}>
                    <span className="text-muted">{formatDate(n.date, 'heading', undefined, today)}</span>
                    <Markdown source={n.record.description} taskId={n.record.id} className="text-body text-default" />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
