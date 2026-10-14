import { Icon } from '../ui/Icon'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/db'
import { formatShort, todayISO, weekday } from '../lib/dates'
import { detachOccurrence, setRecurrence, skipOccurrence } from '../lib/ops'
import { firstOccurrence, parseRule, previewOccurrences, RULE_SUGGESTIONS } from '../lib/recurrence'
import { completedOccurrences } from '../lib/recurring'
import type { Task } from '../lib/types'

/**
 * The detail panel's recurrence controls (OpenSpec change recurring-tasks): the
 * rule with suggestions and validation, a live preview of the next three
 * occurrences computed locally (works offline), and Skip / This occurrence only.
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
  const related = useLiveQuery(() => db.tasks.filter((t) => t.series_id === task.id).toArray(), [task.id], [] as Task[])
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
  const skip = async () => {
    setNotice((await skipOccurrence(task.id)) ? null : 'This is the last occurrence; complete or delete it instead.')
  }
  const detach = async () => {
    const copy = await detachOccurrence(task.id)
    if (copy) onOpen?.(copy)
    else setNotice('This is the last occurrence; edit the task itself instead.')
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <input
          className="input"
          aria-label="Repeat rule"
          list="recurrence-suggestions"
          placeholder="Does not repeat (e.g. every weekday)"
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
          <button className="btn-ghost" aria-label="Stop repeating" title="Stop repeating" onClick={() => { setDraft(''); void setRecurrence(task.id, null) }}><Icon name="x" /></button>
        )}
      </div>
      <datalist id="recurrence-suggestions">
        {RULE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
      </datalist>
      {error && <p className="text-xs text-red-600 dark:text-red-400" role="alert">Not a rule I understand: {error}. The previous rule is kept.</p>}
      {preview.length > 0 && (
        <p className="text-xs text-muted" data-recurrence-preview>
          Next: {preview.map((d) => `${weekday(d).slice(0, 3)} ${formatShort(d)}`).join(' · ')}
        </p>
      )}
      {parsed?.ok && preview.length === 0 && <p className="text-xs text-muted">No further occurrences: the next completion ends the series.</p>}
      {recurring && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button className="btn-ghost text-xs" onClick={() => void skip()} title="Move to the next occurrence without completing (Shift+S)">
            ⤼ Skip <span className="kbd ml-1">⇧S</span>
          </button>
          <button className="btn-ghost text-xs" onClick={() => void detach()} title="Make a standalone copy of this occurrence and move the series on (Shift+O)">
            This occurrence only <span className="kbd ml-1">⇧O</span>
          </button>
        </div>
      )}
      {notice && <p className="text-xs text-muted" role="status">{notice}</p>}
    </div>
  )
}
