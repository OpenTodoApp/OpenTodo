// The planning list's rows and its Time sectors source (OpenSpec change
// time-sectors, design D5): one heading per group (Carried over, This week …
// Later) with its count and the sum of known estimates, the available tasks as
// the list's ordinary rows (drag onto a time, or focus and press s), Do today on
// each, and a "2 waiting" footer that shows the group's waiting tasks instead.
// Placing a row sets its do-on date; the same batch clears its sector, so one Undo
// returns it to its group.
import { useMemo, useState } from 'react'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { formatMinutes } from '../../lib/duration'
import { t } from '../../lib/i18n'
import { sectorGroupName } from '../../lib/sectorNames'
import { sectorPlan } from '../../lib/sectorPlan'
import type { Project, Section, Task } from '../../lib/types'
import { EmptyState, IconButton } from '../../ui'
import { act } from '../actionError'
import { setDueWithUndo } from '../undoable'

interface RowActions {
  onPointerDown: (e: React.PointerEvent, id: string) => void
  onPlace: (id: string) => void
  onOpen: (id: string) => void
}

/** One task of the planning list: drag it onto a time, or focus it and press s (or Enter). */
export function PlanRow({ task, actions }: { task: Task; actions: () => RowActions | null }) {
  return (
    <button data-drag-id="sector-task"
      type="button"
      data-tray-task={task.id}
      onPointerDown={(e) => actions()?.onPointerDown(e, task.id)}
      onKeyDown={(e) => {
        if (e.key === 's' || e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          actions()?.onPlace(task.id)
        }
      }}
      onDoubleClick={() => actions()?.onOpen(task.id)}
      className="flex w-full min-w-0 cursor-grab touch-manipulation items-center gap-1 rounded-control px-2 py-1.5 text-left text-body hover:bg-sunken dark:hover:bg-raised"
    >
      <span className="truncate">{task.title || t('Untitled')}</span>
      {task.estimate_minutes ? <span className="ml-auto shrink-0 text-meta tabular-nums text-muted">{formatMinutes(task.estimate_minutes)}</span> : null}
    </button>
  )
}

export function SectorGroups({ tasks, projects, sections, today, actions }: {
  tasks: readonly Task[]
  projects: readonly Project[]
  sections: readonly Section[]
  today: string
  actions: () => RowActions | null
}) {
  const weekStart = useDateTimeFormat().resolved.weekStart
  const groups = useMemo(() => sectorPlan({ tasks, projects, sections, today, weekStart }), [tasks, projects, sections, today, weekStart])
  const [showWaiting, setShowWaiting] = useState<string | null>(null)
  if (!groups.length) return <EmptyState compact title={t('No task has a time sector.')} />
  return (
    <div className="space-y-3" data-sector-groups>
      {groups.map((g) => {
        const waiting = showWaiting === g.group
        const rows = waiting ? g.waiting : g.tasks
        const name = sectorGroupName(g.group)
        return (
          <section key={g.group} aria-label={name} data-sector-group={g.group}>
            <h3 className="mb-0.5 flex items-baseline gap-2 px-2 text-meta font-semibold text-muted">
              <span>{name}</span>
              <span className="font-normal tabular-nums text-faint">{g.tasks.length}{g.minutes ? ` · ${formatMinutes(g.minutes)}` : ''}</span>
            </h3>
            <ul className="space-y-0.5" aria-label={waiting ? t('Waiting in {group}', { group: name }) : name}>
              {rows.map((task) => (
                <li key={task.id} className="group flex min-w-0 items-center gap-0.5">
                  <PlanRow task={task} actions={actions} />
                  {!waiting && (
                    <IconButton icon="calendar-check" size="sm" label={t('Do today: {title}', { title: task.title || t('Untitled') })}
                      data-sector-today={task.id} onClick={() => act(setDueWithUndo(task.id, { date: today }))} />
                  )}
                </li>
              ))}
            </ul>
            {g.waiting.length > 0 && (
              <button type="button" aria-expanded={waiting} data-sector-waiting={g.group}
                className="mt-0.5 px-2 text-meta text-muted hover:text-default hover:underline"
                onClick={() => setShowWaiting(waiting ? null : g.group)}>
                {waiting ? t('Show the available tasks') : t('{n} waiting', { n: g.waiting.length })}
              </button>
            )}
          </section>
        )
      })}
    </div>
  )
}
