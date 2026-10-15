import { Icon } from '../ui/Icon'
import { describeDeadline, describeDue, formatDate, localDueOf, todayISO, zoneHint } from '../lib/dates'
import { formatMinutes } from '../lib/duration'
import type { Progress } from '../lib/subtasks'
import type { Label, Project, Task } from '../lib/types'
import { LabelChip } from './LabelPicker'
import { AssigneeChip } from './AssigneePicker'
import { useCommentCount } from './useCommentCounts'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { notYetEncrypted, useEncryption } from '../lib/e2ee'
import { useDateTimeFormat } from './DateTimePrefsProvider'

// Priority tokens (design-system): ring in the priority colour, soft fill behind it.
const PRIORITY_RING: Record<number, string> = {
  1: 'border-p1 bg-p1-soft',
  2: 'border-p2 bg-p2-soft',
  3: 'border-p3 bg-p3-soft',
  4: 'border-p4 bg-p4-soft',
}

const DUE_TONE = {
  overdue: 'text-danger',
  today: 'text-success',
  soon: 'text-(--ot-hue-violet-text)',
  later: 'text-muted',
}

// Deadline countdown tones (OpenSpec change deadlines, design D2).
const DEADLINE_TONE = {
  overdue: 'text-danger',
  soon: 'text-warning',
  later: 'text-muted',
}

/** Indentation stops growing after this level so deep trees stay readable on phones. */
export const MAX_INDENT = 3

export function TaskRow({ task, project, labels = [], assignee, assignedToMe = false, selected, showProject, depth = 0, progress, breadcrumb, hasChildren = false, collapsed = false, readOnly = false, onToggle, onOpen, onToggleCollapse, card = false, onPointerDown, dropKey, dropIndicator = null }: {
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
  /** Starts a drag (board-view: move between sections; manual-ordering: place in a list). */
  onPointerDown?: (e: React.PointerEvent<HTMLLIElement>) => void
  /** Drop target key for lib/dnd (manual-ordering): the row accepts drops before, after or inside it. */
  dropKey?: string
  /** Where the dragged task would land relative to this row (manual-ordering). */
  dropIndicator?: 'before' | 'after' | 'inside' | null
}) {
  const dt = useDateTimeFormat()
  const due = describeDue(task.due, undefined, undefined, dt.resolved)
  // A zoned due seen from another zone shows its original time and zone (absolute-datetimes).
  const hint = zoneHint(task.due)
  const done = !!task.completed_at
  // Start dates, Someday and This Evening (someday-and-evening D2): chips say why a
  // task is in Later, or in Today without a date.
  const start = task.start ?? null
  const startChip = done || !start ? null
    : start === 'someday' ? { icon: 'archive' as const, label: 'Someday' }
    : { icon: 'calendar-days' as const, label: `${start > todayISO() ? 'Starts' : 'Started'} ${formatDate(start, 'compact', dt.resolved)}` }
  const deadline = done ? null : describeDeadline(task.deadline, undefined, task.due ? localDueOf(task.due).date : null)
  const comments = useCommentCount(task.id)
  // End-to-end encryption (OpenSpec e2ee): content the server still holds in
  // plaintext is marked until an unlocked device has re-written it.
  const enc = useEncryption()
  const shared = useLiveQuery(async () => (enc.enabled && task.project_id ? !!(await db.memberships.get(task.project_id)) : false), [enc.enabled, task.project_id], false)
  const unencrypted = notYetEncrypted(task as unknown as Record<string, unknown>, 'task', !shared)
  const undecryptable = !!task._e2ee?.raw?.title
  return (
    <li
      data-task-id={task.id}
      data-depth={depth}
      data-drop-target={dropKey}
      data-draggable={onPointerDown ? '' : undefined}
      onPointerDown={onPointerDown}
      style={depth ? { paddingLeft: `${Math.min(depth, MAX_INDENT) * 1.5 + 0.5}rem` } : undefined}
      className={`group relative flex items-start gap-2 rounded-md px-2 py-2 ${dropIndicator === 'inside' ? 'ring-2 ring-accent' : ''} ${card ? `border border-default shadow-sm ${selected ? '' : 'bg-surface'}` : ''} ${selected ? 'bg-sunken dark:bg-raised ring-1 ring-accent/50' : 'hover:bg-canvas dark:hover:bg-raised'}`}
    >
      {(dropIndicator === 'before' || dropIndicator === 'after') && (
        // 2 px drop indicator between rows (manual-ordering design D5).
        <span aria-hidden="true" data-drop-indicator={dropIndicator}
          className={`pointer-events-none absolute inset-x-0 h-0.5 rounded bg-accent ${dropIndicator === 'before' ? '-top-px' : '-bottom-px'}`} />
      )}
      {onToggleCollapse && (
        // Tree views reserve a fixed slot so circles line up whether or not a row has children.
        <span className="mt-0.5 flex h-5 w-4 shrink-0 items-center justify-center">
          {hasChildren && (
            <button
              type="button"
              aria-label={collapsed ? 'Expand subtasks' : 'Collapse subtasks'}
              aria-expanded={!collapsed}
              onClick={onToggleCollapse}
              className="flex h-5 w-4 items-center justify-center rounded text-xs text-faint hover:bg-sunken hover:text-muted dark:hover:bg-raised"
            >
              <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${collapsed ? '' : 'rotate-90'}`} />
            </button>
          )}
        </span>
      )}
      <button
        type="button"
        aria-label={done ? 'Reopen task' : 'Complete task'}
        onClick={onToggle}
        disabled={readOnly}
        className="group/check touch-target inline-flex items-center justify-center mt-0.5 shrink-0 self-start rounded-full pointer-coarse:-my-2.5 pointer-coarse:-ml-3 pointer-coarse:-mr-1"
      >
        <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${PRIORITY_RING[task.priority]} ${done ? 'bg-faint border-input text-on-accent' : 'group-hover/check:bg-success-soft'}`}>
          {done && <Icon name="check" size="xs" />}
        </span>
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className={`truncate text-sm ${done ? 'text-faint line-through' : ''}`}>
          {undecryptable ? <span className="italic text-faint" title="This title could not be decrypted with this device's key">{task.title}</span>
            : task.title || <span className="italic text-faint">Untitled</span>}
          {unencrypted && (
            <span className="ml-2 rounded bg-warning-soft px-1.5 py-0.5 align-middle text-[11px] text-on-warning-soft" title="The server still holds this text unencrypted; it is encrypted after the next sync of an unlocked device.">
              not yet encrypted
            </span>
          )}
          {progress && progress.total > 0 && (
            <span className="ml-2 rounded bg-sunken dark:bg-raised px-1.5 py-0.5 align-middle font-mono text-[11px] text-muted" title="Completed subtasks">
              {progress.done}/{progress.total}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {breadcrumb && <span className="inline-flex min-w-0 items-center gap-1 text-faint" title="Parent task"><Icon name="corner-down-right" size="xs" /><span className="truncate">{breadcrumb}</span></span>}
          {due && <span className={DUE_TONE[due.tone]}>{due.label}{hint && <> <span className="text-faint" title={`Fixed to ${task.due!.tz}`}>({hint})</span></>}</span>}
          {deadline && (
            <span className={`inline-flex items-center gap-0.5 ${DEADLINE_TONE[deadline.tone]}`} data-deadline
              title={`Deadline ${formatDate(task.deadline!, 'long', dt.resolved)}`} aria-label={`Deadline ${formatDate(task.deadline!, 'long', dt.resolved)}, ${deadline.label}`}>
              <Icon name="hourglass" size="xs" />{deadline.label}
            </span>
          )}
          {startChip && (
            <span className="inline-flex items-center gap-0.5 text-muted" data-start>
              <Icon name={startChip.icon} size="xs" />{startChip.label}
            </span>
          )}
          {task.evening && !done && (
            <span className="text-(--ot-hue-indigo-text)" title="This Evening" aria-label="This Evening" data-evening><Icon name="moon" size="xs" /></span>
          )}
          {task.recurrence ? (
            <span className="text-muted" title={`Repeats ${task.recurrence}`} aria-label={`Repeats ${task.recurrence}`} data-recurring><Icon name="repeat" size="xs" /></span>
          ) : task.series_id ? (
            <span className="text-faint" title="Occurrence of a recurring task" aria-label="Occurrence of a recurring task"><Icon name="repeat" size="xs" /></span>
          ) : null}
          {task.estimate_minutes ? (
            <span className="rounded bg-sunken dark:bg-raised px-1.5 font-mono text-[11px] text-muted" title="Estimate" data-estimate>
              {formatMinutes(task.estimate_minutes)}
            </span>
          ) : null}
          {assignee && task.assignee_id && <AssigneeChip id={task.assignee_id} name={assignee} me={assignedToMe} />}
          {task.description && <span className="text-faint" title="Has notes" aria-label="Has notes"><Icon name="list" size="xs" /></span>}
          {comments > 0 && (
            <span className="text-faint" title={`${comments} comment${comments === 1 ? '' : 's'}`} aria-label={`${comments} comment${comments === 1 ? '' : 's'}`} data-comments>
              <span className="inline-flex items-center gap-0.5"><Icon name="message-circle" size="xs" />{comments}</span>
            </span>
          )}
          {labels.length > 0 && (
            <span className="flex flex-wrap gap-1">{labels.map((l) => <LabelChip key={l.id} label={l} />)}</span>
          )}
          {showProject && project && (
            <span className="flex items-center gap-1 text-muted">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
              {project.name}
            </span>
          )}
          {showProject && !project && !task.project_id && <span className="text-faint">Inbox</span>}
        </div>
      </button>
    </li>
  )
}
