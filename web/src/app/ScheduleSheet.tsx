// The scheduling sheet of Process the Inbox (OpenSpec change inbox-means-unplaced,
// design D8; inbox-triage "Scheduling sheet in triage"): choices counted back from
// the deadline on 1 to 6, then the Do on segment's quick choices, worded field and
// calendar with the deadline marked. Picking a date hands it to the triage view,
// which writes it like the panel and moves on; Escape closes without a write.
import { type KeyboardEvent } from 'react'
import { Dialog } from '../ui'
import { formatDate, logicalToday, quickChoices } from '../lib/dates'
import { t } from '../lib/i18n'
import { relativeDoOn } from '../lib/relativeDoOn'
import type { Task } from '../lib/types'
import { DatePicker } from './datetime/DatePicker'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { useShortcutScope } from './shortcuts'

export interface ScheduleSheetProps {
  task: Pick<Task, 'due' | 'deadline'>
  /** The do-on date picked; the caller writes it and moves on. */
  onPick: (iso: string) => void
  onClose: () => void
}

export function ScheduleSheet({ task, onPick, onClose }: ScheduleSheetProps) {
  const { resolved } = useDateTimeFormat()
  const today = logicalToday()
  const deadline = task.deadline ?? null
  const relative = relativeDoOn(deadline, today)
  // `1` to `6` while the sheet is open (registry entry triage.relative); never in the date field.
  useShortcutScope('view', {
    'triage.relative': (e) => {
      const c = relative.find((x) => x.key === e.key)
      if (!c) return false
      onPick(c.date)
    },
  }, { view: 'triage' })

  // Arrow keys move between the relative choices; Tab still walks every control.
  const onRowKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    e.preventDefault()
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
    buttons[(i + step + buttons.length) % buttons.length].focus()
  }

  return (
    <Dialog title={t('Schedule')} onClose={onClose} size="sm" placement="sheet" testId="schedule-sheet">
      <div className="space-y-4">
        {relative.length > 0 && (
          <div>
            <p className="mb-1.5 text-meta text-muted" id="schedule-relative">
              {t('Deadline {date}', { date: formatDate(deadline!, 'long', resolved) })}
            </p>
            <div role="group" aria-labelledby="schedule-relative" className="grid grid-cols-2 gap-1.5" onKeyDown={onRowKey} data-relative-choices>
              {relative.map((c) => (
                <button key={c.id} type="button" data-relative={c.id} aria-keyshortcuts={c.key}
                  aria-label={t('{choice}, {date}', { choice: c.label, date: formatDate(c.date, 'long', resolved) })}
                  className="flex min-h-11 items-center gap-2 rounded-control border border-default px-2.5 py-1 text-left text-meta text-default hover:bg-sunken dark:hover:bg-raised"
                  onClick={() => onPick(c.date)}>
                  <span className="ui-kbd shrink-0">{c.key}</span>
                  <span className="min-w-0">
                    <span className="block truncate">{c.label}</span>
                    <span className="block truncate text-faint">{formatDate(c.date, 'compact', resolved)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <DatePicker label={t('Due date')} value={task.due?.date ?? null} emptyText={t('Not scheduled')}
          choices={quickChoices('due').filter((c) => c.date !== null)}
          marked={deadline ? { date: deadline, label: t('deadline') } : undefined}
          onChange={(iso) => { if (iso) onPick(iso) }} />
      </div>
    </Dialog>
  )
}
