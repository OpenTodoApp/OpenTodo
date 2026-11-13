import { Icon } from '../ui'
import { keysOf } from '../lib/shortcuts'
import { Tooltip } from '../ui'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useSeriesRecords } from '../lib/localData'
import { formatShort, logicalToday, weekday } from '../lib/dates'
import { habitRule } from '../lib/habits'
import { detachOccurrence, setRecurrence, skipOccurrence } from '../lib/ops'
import { firstOccurrence, parseRule, previewOccurrences, RULE_SUGGESTIONS } from '../lib/recurrence'
import { pieceRule, seriesBudget } from '../lib/recurring'
import { walkOccurrences } from '../lib/occurrences'
import type { Task } from '../lib/types'
import { t } from '../lib/i18n'
import { act } from './actionError'
// The habit section loads with the first habit (habits-home): none of it is on the first load.
const HabitSection = lazy(() => import('./habits/HabitSection').then((m) => ({ default: m.HabitSection })))


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

  // Occurrence records of this series: the `for N times` count and the exception
  // dates the preview leaves out (series-exceptions).
  const related = useSeriesRecords(task.id)
  const today = logicalToday()
  const budget = useMemo(() => seriesBudget(task, related, task.due?.date, today), [task, related, today])

  const parsed = useMemo(() => (draft.trim() ? parseRule(draft) : null), [draft])
  const preview = useMemo(() => {
    if (!parsed?.ok) return []
    const due = task.due?.date ?? firstOccurrence(parsed.rule, today)
    // A completion-relative rule counts from today's completion; a calendar rule leaves the exceptions out.
    if (parsed.rule.afterCompletion) return previewOccurrences(parsed.rule, due, today, budget.taken, 3)
    return walkOccurrences(pieceRule(parsed.rule, budget), due, today, budget.taken, due, '9999-12-31', (d) => d, budget.except).dates.slice(0, 3)
  }, [parsed, task.due?.date, today, budget])

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
          <button className="ui-btn ui-btn--ghost ui-btn--md" aria-label={t('Stop repeating')} onClick={() => { setDraft(''); act(setRecurrence(task.id, null)) }}><Icon name="x" /></button>
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
            <button className="ui-btn ui-btn--ghost ui-btn--sm text-meta" onClick={() => act(skip())}>{t('⤼ Skip')}</button>
          </Tooltip>
          <Tooltip label={t('Edit this occurrence alone and move the series on')} shortcut={keysOf('list.detach')}>
            <button className="ui-btn ui-btn--ghost ui-btn--sm text-meta" onClick={() => void detach()}>{t('This occurrence only')}</button>
          </Tooltip>
        </div>
      )}
      {notice && <p className="text-meta text-muted" role="status">{notice}</p>}
      {habitOffered && <Suspense fallback={null}><HabitSection task={task} related={related} today={today} /></Suspense>}
    </div>
  )
}
