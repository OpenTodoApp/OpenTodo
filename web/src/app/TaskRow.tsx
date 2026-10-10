import { describeDue } from '../lib/dates'
import type { Project, Task } from '../lib/types'

const PRIORITY_RING: Record<number, string> = {
  1: 'border-red-500 bg-red-50 dark:bg-red-950/40',
  2: 'border-orange-500 bg-orange-50 dark:bg-orange-950/40',
  3: 'border-blue-500 bg-blue-50 dark:bg-blue-950/40',
  4: 'border-slate-300 dark:border-slate-600',
}

const DUE_TONE = {
  overdue: 'text-red-600 dark:text-red-400',
  today: 'text-emerald-700 dark:text-emerald-400',
  soon: 'text-violet-700 dark:text-violet-400',
  later: 'text-slate-500',
}

export function TaskRow({ task, project, selected, showProject, onToggle, onOpen }: {
  task: Task
  project?: Project
  selected: boolean
  showProject: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const due = describeDue(task.due)
  const done = !!task.completed_at
  return (
    <li
      data-task-id={task.id}
      className={`group flex items-start gap-3 rounded-md px-2 py-2 ${selected ? 'bg-slate-100 ring-1 ring-emerald-500/50 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`}
    >
      <button
        type="button"
        aria-label={done ? 'Reopen task' : 'Complete task'}
        onClick={onToggle}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${PRIORITY_RING[task.priority]} ${done ? 'bg-slate-400 border-slate-400 text-white' : 'hover:bg-emerald-100'}`}
      >
        {done && <span className="text-xs leading-none">✓</span>}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className={`truncate text-sm ${done ? 'text-slate-400 line-through' : ''}`}>{task.title || <span className="italic text-slate-400">Untitled</span>}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {due && <span className={DUE_TONE[due.tone]}>{due.label}</span>}
          {task.description && <span className="text-slate-400">≡</span>}
          {showProject && project && (
            <span className="flex items-center gap-1 text-slate-500">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
              {project.name}
            </span>
          )}
          {showProject && !project && !task.project_id && <span className="text-slate-400">Inbox</span>}
        </div>
      </button>
    </li>
  )
}
