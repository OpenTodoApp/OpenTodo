import { useMemo, useState } from 'react'
import { localDueOf } from '../../lib/dates'
import { formatMinutes } from '../../lib/duration'
import { t } from '../../lib/i18n'
import { useLiveProjects } from '../../lib/liveData'
import { NO_TASKS, useLiveTasks } from '../../lib/liveTasks'
import { compareDueThenPriority } from '../../lib/ordering'
import type { Task } from '../../lib/types'
import { Icon, MenuGroup, MenuItem, MenuSeparator } from '../../ui'
import { Menu } from '../../ui'
import { PanelFrame } from '../PanelFrame'
import { useToday } from '../useViews'
import { inboxTasks } from '../../lib/inbox'

const TRAY_KEY = 'opentodo.calendar.tray'

function readTray(): string {
  try {
    return localStorage.getItem(TRAY_KEY) ?? 'inbox'
  } catch {
    return 'inbox'
  }
}

export const PLAN_PANEL = 'calendar-plan'

export interface PlanActions {
  onPointerDown: (e: React.PointerEvent, id: string) => void
  onPlace: (id: string) => void
  onOpen: (id: string) => void
}

/**
 * The planning list in the shell's panel slot (time-blocking "Day and Week calendar
 * views"): the open tasks of one source (Inbox, no date, overdue or a project),
 * chosen with a design-system menu, to drag onto a time or place with `s`.
 */
export function PlanPanel({ actions }: { actions: React.RefObject<PlanActions> }) {
  const today = useToday()
  const projects = useLiveProjects()
  const tasks = useLiveTasks() ?? NO_TASKS
  const [source, setSource] = useState<string>(readTray)
  const choose = (v: string) => {
    setSource(v)
    try { localStorage.setItem(TRAY_KEY, v) } catch { /* per-device convenience only */ }
  }
  const live = projects.filter((p) => !p.archived)
  const archived = useMemo(() => new Set(projects.filter((p) => p.archived).map((p) => p.id)), [projects])
  const list = useMemo(() => {
    const open = tasks.filter((task) => !task.completed_at && !task.deleted_at && !(task.project_id && archived.has(task.project_id)))
    let out: Task[]
    if (source === 'nodate') out = open.filter((tk) => !tk.due)
    else if (source === 'overdue') out = open.filter((item) => item.due && localDueOf(item.due).date < today)
    else if (source.startsWith('project:')) out = open.filter((task) => task.project_id === source.slice(8))
    else out = inboxTasks(open, tasks)
    return out.sort(compareDueThenPriority).slice(0, 200)
  }, [tasks, archived, source, today])
  const sourceLabel = source === 'nodate' ? t('No date') : source === 'overdue' ? t('Overdue') : source.startsWith('project:') ? projects.find((p) => p.id === source.slice(8))?.name ?? t('Project') : t('Inbox')
  return (
    <PanelFrame title={t('Plan')} testId="calendar-plan"
      actions={(
        <Menu kind="menu" label={t('Plan from')} title={t('Plan from')} width="sm:w-64" align="end"
          trigger={<span className="inline-flex items-center gap-1 text-meta"><Icon name="filter" size="xs" />{sourceLabel}<Icon name="chevron-down" size="xs" /></span>}
          triggerClassName="inline-flex min-h-8 items-center rounded-control border border-default px-2.5 py-1 text-muted hover:bg-sunken dark:hover:bg-raised">
          <MenuItem label={t('Inbox')} icon="inbox" checked={source === 'inbox'} onSelect={() => choose('inbox')} />
          <MenuItem label={t('No date')} icon="calendar-days" checked={source === 'nodate'} onSelect={() => choose('nodate')} />
          <MenuItem label={t('Overdue')} icon="hourglass" checked={source === 'overdue'} onSelect={() => choose('overdue')} />
          {live.length > 0 && <MenuSeparator />}
          {live.length > 0 && (
            <MenuGroup label={t('Projects')}>
              {live.map((p) => <MenuItem key={p.id} label={p.name} icon="folder" checked={source === `project:${p.id}`} onSelect={() => choose(`project:${p.id}`)} />)}
            </MenuGroup>
          )}
        </Menu>
      )}>
      <p className="mb-2 text-meta text-faint">{t.rich('Drag a task onto a time, or focus one and press {key}.', { key: <span className="ui-kbd">s</span> })}</p>
      <ul className="space-y-0.5" aria-label={t('Tasks to plan')}>
        {list.length === 0 && <li className="px-1 py-2 text-meta text-faint">{t('Nothing here.')}</li>}
        {list.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              data-tray-task={task.id}
              onPointerDown={(e) => actions.current?.onPointerDown(e, task.id)}
              onKeyDown={(e) => {
                if (e.key === 's' || e.key === 'Enter') {
                  e.preventDefault()
                  e.stopPropagation()
                  actions.current?.onPlace(task.id)
                }
              }}
              onDoubleClick={() => actions.current?.onOpen(task.id)}
              className="flex w-full cursor-grab touch-manipulation items-center gap-1 rounded-control px-2 py-1.5 text-left text-body hover:bg-sunken dark:hover:bg-raised"
            >
              <span className="truncate">{task.title || t('Untitled')}</span>
              {task.estimate_minutes ? <span className="ml-auto shrink-0 text-meta tabular-nums text-muted">{formatMinutes(task.estimate_minutes)}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </PanelFrame>
  )
}
