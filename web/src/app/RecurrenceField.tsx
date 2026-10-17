import { Icon } from '../ui'
import { keysOf } from '../lib/shortcuts'
import { Switch, Tooltip } from '../ui'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/db'
import { formatShort, todayISO, weekday } from '../lib/dates'
import { habitRule, habitStats } from '../lib/habits'
import { detachOccurrence, mutate, setRecurrence, skipOccurrence } from '../lib/ops'
import { firstOccurrence, parseRule, previewOccurrences, RULE_SUGGESTIONS } from '../lib/recurrence'
import { completedOccurrences } from '../lib/recurring'
import type { Task } from '../lib/types'
import { HabitHistory } from './HabitHistory'
import { t } from '../lib/i18n'

/**
 * The detail panel's recurrence controls (OpenSpec change recurring-tasks): the
 * rule with suggestions and validation, a live preview of the next three
 * occurrences computed locally (works offline), and Skip / This occurrence only.
 * For a calendar rule it also offers "Track as a habit" and, for a habit, the
 * streak and the month history (OpenSpec change habits, design D5), all derived
 * from the records already on the device.
 */
export function RecurrenceField({ task, onOpen }: { task: Task; onOpen?: (id: string) => void }) {
  const [draft, setDraft] = useState(task.recurrence ?? '')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    setDraft(task.recurrence ?? '')
    setError(null)
  }, [task.id, task.recurrence])

  // Occurrence records of this series, for the `for N times` count in the preview.
  const related = useLiveQuery(() => db.tasks.filter((tk) => tk.series_id === task.id).toArray(), [task.id], [] as Task[])
  const done = useMemo(() => completedOccurrences(task.id, related, task.due?.date), [task.id, related, task.due?.date])

  const today = todayISO()
  const parsed = useMemo(() => (draft.trim() ? parseRule(draft) : null), [draft])
  const preview = useMemo(() => {
    if (!parsed?.ok) return []
    const due = task.due?.date ?? firstOccurrence(parsed.rule, today)
    return previewOccurrences(parsed.rule, due, today, done, 3)
  }, [parsed, task.due?.date, today, done])

  const commit = async () => {
    setNotice(null)
    const res = await setRecurrence(task.id, draft)
    if (!res.ok) setError(res.error)
    else {
      setError(null)
      setDraft(res.rule ?? '')
    }
  }

  const recurring = !!task.recurrence && !task.completed_at
  // Habits (OpenSpec habits): only a calendar rule has a schedule to measure.
  const habitOffered = recurring && !task.deleted_at && habitRule(task) !== null
  const stats = useMemo(() => (habitOffered && task.habit ? habitStats(task, related, today) : null), [habitOffered, task, related, today])
  const skip = async () => {
    setNotice((await skipOccurrence(task.id)) ? null : t('This is the last occurrence; complete or delete it instead.'))
  }
  const detach = async () => {
    const copy = await detachOccurrence(task.id)
    if (copy) onOpen?.(copy)
    else setNotice(t('This is the last occurrence; edit the task itself instead.'))
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <input
          className="ui-input"
          aria-label={t('Repeat rule')}
          list="recurrence-suggestions"
          // Rules are English in every language (the grammar is shared with the server), so the example is not translated.
          placeholder={t('Does not repeat (e.g. {example})', { example: 'every weekday' })}
          value={draft}
          maxLength={200}
          aria-invalid={!!error}
          onChange={(e) => { setDraft(e.target.value); setError(null) }}
          onBlur={() => { if (draft !== (task.recurrence ?? '')) void commit() }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void commit() }
            if (e.key === 'Escape') { setDraft(task.recurrence ?? ''); setError(null) }
          }}
        />
        {task.recurrence && (
          <button className="ui-btn ui-btn--ghost ui-btn--md" aria-label={t('Stop repeating')} onClick={() => { setDraft(''); void setRecurrence(task.id, null) }}><Icon name="x" /></button>
        )}
      </div>
      <datalist id="recurrence-suggestions">
        {RULE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
      </datalist>
      {!draft.trim() && !error && (
        <p className="text-meta text-faint" data-recurrence-hint>{t('Type any interval or pattern, such as {examples}.', { examples: 'every 3 months, every 2nd tuesday, every 10 days after completion' })}</p>
      )}
      {error && <p className="text-meta text-danger" role="alert">{t('Not a rule I understand: {error}. The previous rule is kept.', { error })}</p>}
      {preview.length > 0 && (
        <p className="text-meta text-muted" data-recurrence-preview>
          {t('Next: {join}', { join: preview.map((d) => `${weekday(d).slice(0, 3)} ${formatShort(d)}`).join(' · ') })}
        </p>
      )}
      {parsed?.ok && preview.length === 0 && <p className="text-meta text-muted">{t('No further occurrences: the next completion ends the series.')}</p>}
      {recurring && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Tooltip label={t('Move to the next occurrence without completing')} shortcut={keysOf('list.skip')}>
            <button className="ui-btn ui-btn--ghost ui-btn--sm text-meta" onClick={() => void skip()}>{t('⤼ Skip')}</button>
          </Tooltip>
          <Tooltip label={t('Make a standalone copy of this occurrence and move the series on')} shortcut={keysOf('list.detach')}>
            <button className="ui-btn ui-btn--ghost ui-btn--sm text-meta" onClick={() => void detach()}>{t('This occurrence only')}</button>
          </Tooltip>
        </div>
      )}
      {notice && <p className="text-meta text-muted" role="status">{notice}</p>}
      {habitOffered && (
        <div className="space-y-2 pt-2" data-habit>
          <Switch checked={!!task.habit} onChange={(v) => void mutate('task', task.id, { habit: v })} label={t('Track as a habit')}
            description={t('Streaks and a month history, counted on this device from the days done')} />
          {stats && (
            <>
              <p className="text-meta text-muted" data-habit-streak>{t('Streak {current} · Best {best}', { current: stats.current, best: stats.best })}{stats.atRisk ? ` · ${t('at risk')}` : ''}</p>
              <HabitHistory series={task} records={related} today={today} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
