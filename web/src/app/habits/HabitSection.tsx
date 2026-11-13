// The habit section of a task's page (OpenSpec changes habits and habits-home): the
// Track as a habit switch, and for a habit its numbers (strength, kept and both
// streaks), the tiny version and the anchor, the month grid with editable past days,
// and Graduate or Resume. Off means off (habits-home D2): nothing at all while
// Habits is off; while it is not decided only the switch, which turns Habits on.
import { lazy, Suspense, useEffect, useState } from 'react'
import { graduate, resume } from '../../lib/habitActions'
import { habitStats, isGraduated, keptDays } from '../../lib/habits'
import { trackAsHabit, useHabitsChoice, useHabitsEnabled } from '../../lib/habitPrefs'
import { t } from '../../lib/i18n'
import { mutate } from '../../lib/ops'
import type { Task } from '../../lib/types'
import { Button, Input, Switch } from '../../ui'
import { act } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'
import { navigate } from '../router'
import { pickDay } from './habitUndo'

const HabitHistory = lazy(() => import('../HabitHistory').then((m) => ({ default: m.HabitHistory })))

/** A text field saved on blur or Enter, as one op. */
function HabitText({ task, field, label, placeholder }: { task: Task; field: 'habit_tiny' | 'habit_anchor'; label: string; placeholder: string }) {
  const stored = task[field] ?? ''
  const [value, setValue] = useState(stored)
  useEffect(() => setValue(stored), [stored])
  const save = () => { if (value.trim() !== stored) act(mutate('task', task.id, { [field]: value.trim() })) }
  return (
    <label className="flex items-center gap-2 text-meta text-muted">
      <span className="w-24 shrink-0">{label}</span>
      <Input value={value} maxLength={200} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }} data-habit-field={field} />
    </label>
  )
}

export function HabitSection({ task, related, today }: { task: Task; related: readonly Task[]; today: string }) {
  const choice = useHabitsChoice()
  const enabled = useHabitsEnabled()
  const [turnedOn, setTurnedOn] = useState(false)
  if (choice === undefined || choice === 'off') return null
  const stats = enabled && task.habit ? habitStats(task, related, today) : null
  const graduated = isGraduated(task)
  const undo = (p: Promise<{ entry: { id: string }; label: string } | null>) => act(p.then((r) => { if (r?.entry) showUndoToast(r.label, r.entry.id) }))
  return (
    <div className="space-y-2 pt-2" data-habit>
      {!graduated && (
        <Switch checked={!!task.habit} onChange={(v) => act(trackAsHabit(task, v, choice).then(setTurnedOn))} label={t('Track as a habit')}
          description={t('Streaks and a month history, counted on this device from the days done')} />
      )}
      {turnedOn && (
        <p className="text-meta text-muted" role="status" data-habits-turned-on>
          {t('Habits is on.')}{' '}
          <button type="button" className="text-accent underline" onClick={() => navigate({ view: 'habits' })}>{t('Open Habits')}</button>{' · '}
          <button type="button" className="text-accent underline" onClick={() => navigate({ view: 'settings', section: 'account', page: 'profile', anchor: 'how-you-work' })}>{t('Turn it off in How you work')}</button>
        </p>
      )}
      {enabled && task.habit && graduated && (
        <div className="flex items-center gap-2" data-habit-graduated>
          <p className="min-w-0 flex-1 text-meta text-muted">{t('Graduated')} · {t('{n, plural, one {Kept for # day} other {Kept for # days}}', { n: keptDays(task, related) })}</p>
          <Button size="sm" variant="secondary" onClick={() => undo(resume(task.id))} data-resume>{t('Resume')}</Button>
        </div>
      )}
      {stats && !graduated && (
        <>
          <p className="text-meta text-muted" data-habit-streak>
            {t('Strength {strength}', { strength: stats.strength })} · {t('{kept} of last {of}', { kept: stats.kept, of: stats.keptOf })} · {t('Streak {current} · Best {best}', { current: stats.current, best: stats.best })}
            {stats.backOnTrack ? ` · ${t('Back on track')}` : stats.overdue ? ` · ${t('at risk')}` : ''}
          </p>
          <HabitText task={task} field="habit_tiny" label={t('Tiny version')} placeholder={t('One page')} />
          <HabitText task={task} field="habit_anchor" label={t('After')} placeholder={t('After dinner')} />
        </>
      )}
      {task.habit && enabled && (
        <Suspense fallback={null}><HabitHistory series={task} records={related} today={today} onPick={graduated ? undefined : (date, c) => act(pickDay(task.id, date, c))} /></Suspense>
      )}
      {stats && !graduated && (
        <Button size="sm" variant="ghost" icon="graduation-cap" onClick={() => undo(graduate(task.id))} data-graduate>{t('Graduate')}</Button>
      )}
    </div>
  )
}
