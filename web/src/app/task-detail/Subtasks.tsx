// The task's subtasks as a quiet checklist under a heading that carries the weight
// (sidebar-brand-and-row-grid D7): "Subtasks", "2 of 5" and the progress bar, then
// borderless 32 px rows with a 16 px checkbox, and the add field as the last row. On the
// task page the list keeps its bordered block (task-full-page D1) with the same rows.
// With two subtasks or more the head has "One at a time" (subtask-flow): the task's
// subtasks are then offered in list order, each after the one before.
import { type FormEvent, useRef, useState } from 'react'
import { createSubtask } from '../../lib/ops'
import type { Task } from '../../lib/types'
import { t } from '../../lib/i18n'
import { Icon, Switch } from '../../ui'
import { taskFlowOf } from '../../lib/flow'
import { flowUndoable } from '../../lib/undoActions'
import { showUndoToast } from '../bulk/toastStore'
import { addTasksUndoable, subtaskInputs } from '../../lib/pasteTasks'
import { showBulkToast } from '../bulk/toastStore'
import { usePasteOffer } from '../quickadd/PasteOffer'

export interface SubtasksProps {
  task: Task
  items: Task[]
  progress: { done: number; total: number }
  readOnly: boolean
  /** The page's bordered block (head, rows, add line) instead of the panel's bare list. */
  boxed?: boolean
  /** The add line under the list (off in an expanded row, row-expand D3). */
  add?: boolean
  onToggle: (task: Task) => void
  onOpen?: (id: string) => void
}

export function Subtasks({ task, items, progress, readOnly, boxed = false, add = true, onToggle, onOpen }: SubtasksProps) {
  // 32 px rows (44 px on a coarse pointer), no border, no background of their own.
  const row = `flex min-h-8 items-center gap-2 rounded-control pointer-coarse:min-h-11 hover:bg-sunken dark:hover:bg-raised ${boxed ? 'mx-1 px-2' : 'px-1'}`
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const inOrder = taskFlowOf(task) === 'sequential'
  // Where subtasks are listed with their add line, in every mode: it is about what the page shows.
  const flow = add && items.length > 1 && (inOrder || !readOnly)
  const setInOrder = async (on: boolean) => {
    const r = await flowUndoable('task', task.id, on ? 'sequential' : '', on ? t('Subtasks one at a time') : t('Subtasks in any order'))
    if (r.entry) showUndoToast(r.label, r.entry.id)
  }
  return (
    <section aria-label={t('Subtasks')} data-subtasks className={boxed ? 'overflow-hidden rounded-card border border-default' : undefined}>
      {(items.length > 0 || boxed) && (
        // The switch sits beside the heading, never inside it, so the heading reads as its name and count.
        <div className={`flex min-h-8 items-center gap-2 text-meta ${boxed ? 'px-3' : 'px-1'}`} data-subtasks-head>
          <h3 className="flex items-baseline gap-2 font-medium text-default">
            {t('Subtasks')}
            {items.length > 0 && <span className="font-normal tabular-nums text-faint" data-subtask-count>{t('{done} of {total}', progress)}</span>}
          </h3>
          {flow && (
            <span className="ml-auto" data-subtask-flow>
              <Switch checked={inOrder} onChange={(on) => { void setInOrder(on) }} label={t('One at a time')} disabled={readOnly} />
            </span>
          )}
          {items.length > 0 && (
            <span className={`${flow ? 'ml-2 ' : 'ml-auto '}h-1 w-16 overflow-hidden rounded-full bg-sunken`} aria-hidden="true" data-subtask-progress>
              <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </span>
          )}
        </div>
      )}
      <ul className={`empty:hidden ${boxed ? 'pb-1' : ''}`} aria-label={t('Subtasks')}>
        {items.map((c) => (
          <li key={c.id} className={row}>
            <button
              type="button"
              aria-label={c.completed_at ? t('Reopen {title}', { title: c.title }) : t('Complete {title}', { title: c.title })}
              aria-pressed={!!c.completed_at}
              onClick={() => onToggle(c)}
              disabled={readOnly}
              className="touch-target inline-flex size-5 shrink-0 items-center justify-center rounded-full"
            >
              {/* The circle is a span: on a touch screen the button grows to 44 px, the circle stays 16 px. */}
              <span data-check-mark className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${c.completed_at ? 'border-accent bg-accent text-on-accent' : 'border-input hover:bg-success-soft'}`}>
                {c.completed_at && <Icon name="check" size={10} />}
              </span>
            </button>
            <button type="button" className={`min-w-0 flex-1 truncate text-left text-body ${c.completed_at ? 'text-faint line-through' : 'text-default'}`} onClick={() => onOpen?.(c.id)}>
              {c.title || <span className="italic text-faint">{t('Untitled')}</span>}
            </button>
          </li>
        ))}
      </ul>
      {!readOnly && add && <div className={boxed ? 'border-t border-soft px-2' : undefined}><AddSubtask parent={task} /></div>}
    </section>
  )
}

/** "Add subtask" input: creates on Enter and stays focused for the next entry. */
export function AddSubtask({ parent }: { parent: Task }) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const title = value.trim()
    if (!title) return
    setValue('')
    await createSubtask(parent.id, title)
    ref.current?.focus()
  }
  // A pasted list (paste-to-tasks D7): one subtask per line, unparsed, in one batch with one Undo.
  const paste = usePasteOffer({
    field: ref,
    kind: 'subtasks',
    onConfirm: async (lines) => {
      const added = await addTasksUndoable(subtaskInputs(parent, lines), { subtasks: true })
      showBulkToast(added.label, added.undoId)
      ref.current?.focus()
    },
    onPasteAsLine: (text) => { setValue(text); ref.current?.focus() },
  })
  return (
    <form onSubmit={(e) => void submit(e)} className="flex min-h-8 items-center gap-2 px-1 pointer-coarse:min-h-11" data-add-subtask>
      <span className="flex size-5 shrink-0 items-center justify-center text-faint"><Icon name="plus" size="xs" /></span>
      <input
        ref={ref}
        className="min-w-0 flex-1 rounded-chip bg-transparent py-1 text-body text-default placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
        placeholder={t('Add a subtask')}
        aria-label={t('Add subtask')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPaste={paste.onPaste}
        onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
      />
      {paste.offer}
    </form>
  )
}
