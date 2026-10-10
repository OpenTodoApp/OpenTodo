import { describeDue, zoneHint } from '../lib/dates'
import { formatMinutes } from '../lib/duration'
import type { Progress } from '../lib/subtasks'
import type { Label, Project, Task } from '../lib/types'
import { LabelChip } from './LabelPicker'
import { AssigneeChip } from './AssigneePicker'
import { useCommentCount } from './useCommentCounts'

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

/** Indentation stops growing after this level so deep trees stay readable on phones. */
export const MAX_INDENT = 3

export function TaskRow({ task, project, labels = [], assignee, assignedToMe = false, selected, showProject, depth = 0, progress, breadcrumb, hasChildren = false, collapsed = false, readOnly = false, onToggle, onOpen, onToggleCollapse, card = false, onPointerDown }: {
  task: Task
  project?: Project
  /** Already resolved: unknown and deleted label ids are not in this list. */
  labels?: Label[]
  /** Display name of the assignee, given only for tasks in shared projects (task-assignment). */
  assignee?: string | null
  assignedToMe?: boolean
  selected: boolean
  showProject: boolean
  depth?: number
  progress?: Progress
  /** Title of the parent when the task is shown outside its parent's subtree. */
  breadcrumb?: string | null
  hasChildren?: boolean
  collapsed?: boolean
  /** Viewer of a shared project: the row can be opened but not completed. */
  readOnly?: boolean
  onToggle: () => void
  onOpen: () => void
  onToggleCollapse?: () => void
  /** Board card styling (board-view). */
  card?: boolean
  /** Starts a drag (board-view: move between sections). */
  onPointerDown?: (e: React.PointerEvent<HTMLLIElement>) => void
}) {
  const due = describeDue(task.due)
  // A zoned due seen from another zone shows its original time and zone (absolute-datetimes).
  const hint = zoneHint(task.due)
  const done = !!task.completed_at
  const comments = useCommentCount(task.id)
  return (
    <li
      data-task-id={task.id}
      data-depth={depth}
      onPointerDown={onPointerDown}
      style={depth ? { paddingLeft: `${Math.min(depth, MAX_INDENT) * 1.5 + 0.5}rem` } : undefined}
      className={`group flex items-start gap-2 rounded-md px-2 py-2 ${card ? `border border-slate-200 shadow-sm dark:border-slate-700 ${selected ? '' : 'bg-white dark:bg-slate-950'}` : ''} ${selected ? 'bg-slate-100 ring-1 ring-emerald-500/50 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`}
    >
      {onToggleCollapse && (
        // Tree views reserve a fixed slot so circles line up whether or not a row has children.
        <span className="mt-0.5 flex h-5 w-4 shrink-0 items-center justify-center">
          {hasChildren && (
            <button
              type="button"
              aria-label={collapsed ? 'Expand subtasks' : 'Collapse subtasks'}
              aria-expanded={!collapsed}
              onClick={onToggleCollapse}
              className="flex h-5 w-4 items-center justify-center rounded text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700"
            >
              {collapsed ? '▸' : '▾'}
            </button>
          )}
        </span>
      )}
      <button
        type="button"
        aria-label={done ? 'Reopen task' : 'Complete task'}
        onClick={onToggle}
        disabled={readOnly}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${PRIORITY_RING[task.priority]} ${done ? 'bg-slate-400 border-slate-400 text-white' : 'hover:bg-emerald-100'}`}
      >
        {done && <span className="text-xs leading-none">✓</span>}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className={`truncate text-sm ${done ? 'text-slate-400 line-through' : ''}`}>
          {task.title || <span className="italic text-slate-400">Untitled</span>}
          {progress && progress.total > 0 && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 align-middle font-mono text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400" title="Completed subtasks">
              {progress.done}/{progress.total}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {breadcrumb && <span className="truncate text-slate-400" title="Parent task">↳ {breadcrumb}</span>}
          {due && <span className={DUE_TONE[due.tone]}>{due.label}{hint && <> <span className="text-slate-400" title={`Fixed to ${task.due!.tz}`}>({hint})</span></>}</span>}
          {task.recurrence ? (
            <span className="text-slate-500" title={`Repeats ${task.recurrence}`} aria-label={`Repeats ${task.recurrence}`} data-recurring>↻</span>
          ) : task.series_id ? (
            <span className="text-slate-300 dark:text-slate-600" title="Occurrence of a recurring task" aria-label="Occurrence of a recurring task">↻</span>
          ) : null}
          {task.estimate_minutes ? (
            <span className="rounded bg-slate-100 px-1.5 font-mono text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400" title="Estimate" data-estimate>
              {formatMinutes(task.estimate_minutes)}
            </span>
          ) : null}
          {assignee && <AssigneeChip name={assignee} me={assignedToMe} />}
          {task.description && <span className="text-slate-400">≡</span>}
          {comments > 0 && (
            <span className="text-slate-400" title={`${comments} comment${comments === 1 ? '' : 's'}`} aria-label={`${comments} comment${comments === 1 ? '' : 's'}`} data-comments>
              💬 {comments}
            </span>
          )}
          {labels.length > 0 && (
            <span className="flex flex-wrap gap-1">{labels.map((l) => <LabelChip key={l.id} label={l} />)}</span>
          )}
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
