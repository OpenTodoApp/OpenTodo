// The task row and card (OpenSpec change ux-overhaul, task-list-presentation "One
// row anatomy", "Metadata language", "Completion feedback", "Bulk selection does
// not shift rows", "Drag feedback"; design D7). One row in every list: a fixed
// leading slot (the collapse chevron only on rows with children), one checkbox
// slot (the task's checkbox, or the selection box in its place on hover, focus or
// tick), the title, and a metadata line only when there is metadata, built from
// three styles: ToneText for the date and the deadline, LabelChip, NeutralChip
// for counts and the project. The board card is the same data as a card.
import { Icon, LabelChip, NeutralChip, ReadAs, ToneText, type Tone } from '../ui'
import { memo, useEffect, useRef, useState } from 'react'
import { describeDeadline, describeDue, formatDate, localDueOf, todayISO, zoneHint } from '../lib/dates'
import { formatMinutes } from '../lib/duration'
import type { Progress } from '../lib/subtasks'
import { streakLabel, type HabitStats } from '../lib/habits'
import type { Label, Project, Task } from '../lib/types'
import { AssigneeChip } from './AssigneePicker'
import { useAttachmentCount, useCommentCount, useSharedProject } from './useCommentCounts'
import { notYetEncrypted, useEncryption } from '../lib/e2ee'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { completionDelay, prefersReducedMotion } from './motion'
import { dragFeedback } from './listDrop'
import { fieldBadges } from '../lib/fields'
import { useFieldDefs } from './useFields'
import { t } from '../lib/i18n'

/** Field badges shown on a row before the rest collapse into "+n" (custom-fields). */
export const MAX_FIELD_BADGES = 3

// Priority tokens (design-system): ring in the priority colour, soft fill behind it.
// The priority ring of an open task; a done one gets the filled check alone, since both
// set the border and the background and the ring would win over the check.
const PRIORITY_RING: Record<number, string> = {
  1: 'border-p1 bg-p1-soft',
  2: 'border-p2 bg-p2-soft',
  3: 'border-p3 bg-p3-soft',
  4: 'border-p4 bg-p4-soft',
}

const DUE_TONE: Record<'overdue' | 'today' | 'soon' | 'later', Tone> = { overdue: 'danger', today: 'success', soon: 'violet', later: 'muted' }
// Deadline countdown tones (OpenSpec change deadlines, design D2).
const DEADLINE_TONE: Record<'overdue' | 'soon' | 'later', Tone> = { overdue: 'danger', soon: 'warning', later: 'muted' }

/** Indentation stops growing after this level so deep trees stay readable on phones. */
export const MAX_INDENT = 3

/** The date phrase of a row: the due text with evening and repeat as suffixes ("Today · evening · repeats"). */
export function dateText(dueLabel: string | null, evening: boolean, recurring: boolean, occurrence = false): string | null {
  if (!dueLabel) return null
  return [dueLabel, evening ? t('evening') : null, recurring ? t('repeats') : occurrence ? t('occurrence') : null].filter(Boolean).join(' · ')
}

export interface TaskRowProps {
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
  /** Open blockers (task-dependencies): above 0 the row is dimmed with a lock marker. */
  blockedBy?: number
  /** The streak of a habit (OpenSpec habits), computed once by the list: a chip after the repeat indicator. */
  habit?: HabitStats | null
  /** Title of the parent when the task is shown outside its parent's subtree. */
  breadcrumb?: string | null
  hasChildren?: boolean
  collapsed?: boolean
  /** Viewer of a shared project: the row can be opened but not completed. */
  readOnly?: boolean
  onToggle: () => void
  /** Opens the task; Shift or Ctrl/⌘ clicks tick instead when `onTick` is set (bulk-edit D3). */
  onOpen: (e?: React.MouseEvent) => void
  /** Ticked for a bulk action (bulk-edit). */
  ticked?: boolean
  /** Checkboxes always shown: something is ticked, or touch Select mode is on. */
  showCheckbox?: boolean
  /** Tick or untick; `range` for Shift (extend from the anchor). */
  onTick?: (range: boolean) => void
  onToggleCollapse?: () => void
  /** Board card styling (board-view). */
  card?: boolean
  /** Starts a drag (board-view: move between sections; manual-ordering: place in a list). */
  onPointerDown?: (e: React.PointerEvent<HTMLLIElement>) => void
  /** Drop target key for lib/dnd (manual-ordering): the row accepts drops before, after or inside it. */
  dropKey?: string
  /** Where the dragged task would land relative to this row (manual-ordering). */
  dropIndicator?: 'before' | 'after' | 'inside' | null
  /** This row is the one being dragged: it lifts (an opacity change under reduced motion). */
  dragging?: boolean
  /** The columns layout shows field values in cells, so the row leaves out their badges (custom-fields). */
  hideFieldBadges?: boolean
  /**
   * Position among the visible rows with the same parent (assistive-tech-semantics):
   * with `depth`, the row's aria-level, aria-posinset and aria-setsize, so the
   * subtask hierarchy is announced and not only indented.
   */
  posInSet?: number
  setSize?: number
}

/**
 * Memoized (large-list-performance D1): a list re-renders a row only when one of its
 * props changes, so callers pass stable handlers and per-row values (`selected` is a
 * boolean, not the list's selected id).
 */
export const TaskRow = memo(function TaskRow({ task, project, labels = [], assignee, assignedToMe = false, selected, showProject, depth = 0, progress, blockedBy = 0, habit = null, breadcrumb, hasChildren = false, collapsed = false, readOnly = false, onToggle, onOpen, onToggleCollapse, card = false, onPointerDown, dropKey, dropIndicator = null, dragging = false, ticked = false, showCheckbox = false, onTick, hideFieldBadges = false, posInSet, setSize }: TaskRowProps) {
  const dt = useDateTimeFormat()
  const due = describeDue(task.due, undefined, undefined, dt.resolved)
  // A zoned due seen from another zone shows its original time and zone (absolute-datetimes).
  const hint = zoneHint(task.due)
  const done = !!task.completed_at
  // Start dates, Someday and This Evening (someday-and-evening D2): chips say why a
  // task is in Later, or in Today without a date.
  const start = task.start ?? null
  const startText = done || !start ? null
    : start === 'someday' ? t('Someday')
    : start > todayISO() ? t('Starts {date}', { date: formatDate(start, 'compact', dt.resolved) }) : t('Started {date}', { date: formatDate(start, 'compact', dt.resolved) })
  const deadline = done ? null : describeDeadline(task.deadline, undefined, task.due ? localDueOf(task.due).date : null)
  const comments = useCommentCount(task.id)
  const attachments = useAttachmentCount(task.id)
  // End-to-end encryption (OpenSpec e2ee): content the server still holds in
  // plaintext is marked until an unlocked device has re-written it.
  const enc = useEncryption()
  // One shared membership map for every row, not a live query per row (large-list-performance).
  const shared = useSharedProject(task.project_id, enc.enabled)
  const unencrypted = notYetEncrypted(task as unknown as Record<string, unknown>, 'task', !shared)
  const undecryptable = !!task._e2ee?.raw?.title
  // The name controls read for the task ("Complete Buy milk"); ciphertext is never read out.
  const name = undecryptable || !task.title ? t('Untitled') : task.title
  // Evening and repeat are suffixes of the date text, never separate glyphs; with no
  // date they stand on their own in the date tone.
  const date = dateText(due?.label ?? (task.evening && !done ? t('This evening') : null), !!task.evening && !done && !!due, !!task.recurrence, !!task.series_id)
  const streak = habit && !done ? habit : null
  // Custom field values of the task's project (custom-fields): three badges, then "+n".
  const fieldDefs = useFieldDefs()
  const badges = hideFieldBadges ? [] : fieldBadges(task, fieldDefs, dt.resolved)
  const moreBadges = badges.slice(MAX_FIELD_BADGES)
  const hasMeta = !!(badges.length > 0 || breadcrumb || date || streak || deadline || startText || (!due && !task.evening && (task.recurrence || task.series_id)) || task.estimate_minutes || (progress && progress.total > 0) || (blockedBy > 0 && !done)
    || (assignee && task.assignee_id) || task.description || comments > 0 || attachments > 0 || labels.length > 0 || (showProject && (project || !task.project_id)))

  // Completion feedback: the check mark animates and the row fades within the
  // emphasis duration before the row leaves or re-sorts; under reduced motion only
  // the opacity fades. Reopening is immediate.
  const [completing, setCompleting] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => { if (done) setCompleting(false) }, [done])
  const toggle = () => {
    if (done || completing) { onToggle(); return }
    const delay = completionDelay()
    if (delay === 0) { onToggle(); return }
    setCompleting(true)
    timer.current = setTimeout(() => { setCompleting(false); onToggle() }, delay)
  }
  const checked = done || completing
  const feedback = dragFeedback(prefersReducedMotion())
  const lift = dragging ? feedback.lift : ''

  const meta = hasMeta && (
    <div className={`${card ? 'mt-1' : 'mt-0.5'} flex flex-wrap items-center gap-x-2 gap-y-0.5`} data-row-meta>
      {breadcrumb && <NeutralChip icon="corner-down-right" label={t('In {breadcrumb}', { breadcrumb })} data-breadcrumb="">{breadcrumb}</NeutralChip>}
      {date && (
        <ToneText tone={due ? DUE_TONE[due.tone] : 'indigo'} data-date="" data-evening={task.evening && !done ? '' : undefined} data-recurring={task.recurrence ? '' : undefined}
          label={[date, hint ? t('fixed to {zone}', { zone: task.due?.tz ?? '' }) : null].filter(Boolean).join(', ')}>
          {date}{hint && <span className="text-faint"> ({hint})</span>}
        </ToneText>
      )}
      {!date && (task.recurrence || task.series_id) && (
        <ToneText tone="muted" data-recurring={task.recurrence ? '' : undefined}>{task.recurrence ? t('repeats') : t('occurrence')}</ToneText>
      )}
      {streak && (
        <NeutralChip icon="flame" data-streak="" data-at-risk={streak.atRisk ? '' : undefined} label={streakLabel(streak)}>{streak.current}</NeutralChip>
      )}
      {blockedBy > 0 && !done && (
        <NeutralChip icon="lock" data-blocked="" label={t('Blocked by {blockedBy}', { blockedBy })}>{blockedBy}</NeutralChip>
      )}
      {deadline && (
        <ToneText tone={DEADLINE_TONE[deadline.tone]} icon="hourglass" data-deadline="" label={t('Deadline {date}, {label}', { date: formatDate(task.deadline!, 'long', dt.resolved), label: deadline.label })}>
          {deadline.label}
        </ToneText>
      )}
      {startText && <ToneText tone="muted" icon={start === 'someday' ? 'archive' : 'calendar-days'} data-start="">{startText}</ToneText>}
      {task.estimate_minutes ? <NeutralChip data-estimate="" label={t('Estimate {minutes}', { minutes: formatMinutes(task.estimate_minutes) })}>{formatMinutes(task.estimate_minutes)}</NeutralChip> : null}
      {badges.slice(0, MAX_FIELD_BADGES).map((b) => <NeutralChip key={b.def.id} data-field-badge={b.def.id}>{b.text}</NeutralChip>)}
      {moreBadges.length > 0 && (
        <NeutralChip data-field-more="" label={t('{count} more fields: {join}', { count: moreBadges.length, join: moreBadges.map((b) => b.text).join(', ') })}>
          +{moreBadges.length}
        </NeutralChip>
      )}
      {progress && progress.total > 0 && <NeutralChip data-progress="" label={t('{done} of {total} subtasks completed', { done: progress.done, total: progress.total })}>{progress.done}/{progress.total}</NeutralChip>}
      {assignee && task.assignee_id && <AssigneeChip id={task.assignee_id} name={assignee} me={assignedToMe} />}
      {task.description && <NeutralChip icon="list" label={t('Has notes')} data-notes="" />}
      {comments > 0 && <NeutralChip icon="message-circle" data-comments="" label={t('{n, plural, one {# comment} other {# comments}}', { n: comments })}>{comments}</NeutralChip>}
      {attachments > 0 && <NeutralChip icon="paperclip" data-attachments="" label={t('{n, plural, one {# attachment} other {# attachments}}', { n: attachments })}>{attachments}</NeutralChip>}
      {labels.map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}
      {showProject && project && <NeutralChip dot={project.color} data-project="">{project.name}</NeutralChip>}
      {showProject && !project && !task.project_id && <NeutralChip data-project="">{t('Inbox')}</NeutralChip>}
    </div>
  )

  return (
    <li
      data-task-id={task.id}
      data-depth={depth}
      data-drop-target={dropKey}
      data-draggable={onPointerDown ? '' : undefined}
      data-ticked={ticked || undefined}
      data-completing={completing || undefined}
      data-dragging={dragging || undefined}
      aria-current={selected || undefined}
      aria-level={card || setSize === undefined ? undefined : depth + 1}
      aria-posinset={card ? undefined : posInSet}
      aria-setsize={card ? undefined : setSize}
      onPointerDown={onPointerDown}
      style={depth ? { paddingLeft: `${Math.min(depth, MAX_INDENT) * 1.5 + 0.5}rem` } : undefined}
      className={`group relative flex items-start gap-2 rounded-control px-2 transition-[opacity,transform] duration-(--duration-emphasis) ease-calm ${card ? 'py-2 border border-default bg-surface shadow-1' : 'row-pad'} ${dropIndicator === 'inside' ? feedback.inside : ''} ${ticked ? 'bg-accent-soft' : selected ? (card ? 'ring-1 ring-accent/50' : 'bg-sunken dark:bg-raised ring-1 ring-accent/50') : card ? '' : 'hover:bg-canvas dark:hover:bg-raised'} ${completing ? 'opacity-50' : ''} ${lift}`}
    >
      {(dropIndicator === 'before' || dropIndicator === 'after') && (
        // The drop position: a line with a dot at its start (task-list-presentation "Drag feedback").
        <span aria-hidden="true" data-drop-indicator={dropIndicator}
          className={`${feedback.line} ${dropIndicator === 'before' ? '-top-px' : '-bottom-px'}`} />
      )}
      {!card && (
        // Every list reserves the same leading slot ("One row anatomy"), so checkboxes line
        // up across tree and flat views; the chevron appears only on rows with children.
        <span className="mt-0.5 flex h-5 w-4 shrink-0 items-center justify-center" data-leading-slot>
          {onToggleCollapse && hasChildren && (
            <button
              type="button"
              aria-label={collapsed ? t('Expand subtasks') : t('Collapse subtasks')}
              aria-expanded={!collapsed}
              onClick={onToggleCollapse}
              className="flex h-5 w-4 items-center justify-center rounded-chip text-faint hover:bg-sunken hover:text-muted dark:hover:bg-raised pointer-coarse:-mx-3.5 pointer-coarse:-my-2.5 pointer-coarse:h-11 pointer-coarse:w-11"
            >
              <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${collapsed ? '' : 'rotate-90'}`} />
            </button>
          )}
        </span>
      )}
      {/* One slot for both boxes ("Bulk selection does not shift rows"): the task's
          checkbox, replaced by the selection box only while a selection is in progress
          (a row is ticked, or touch Select mode), in the same 20 px square, so the title
          never moves. Hover and focus never swap them: a click on the circle always
          completes (row-checkbox-completes). */}
      <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center self-start" data-row-controls data-selecting={onTick && !readOnly && (showCheckbox || ticked) ? '' : undefined}>
        <button
          type="button"
          aria-label={done ? t('Reopen {title}', { title: name }) : t('Complete {title}', { title: name })}
          onClick={toggle}
          disabled={readOnly}
          className={`group/check touch-target inline-flex items-center justify-center rounded-full pointer-coarse:-m-3 ${onTick && !readOnly && (showCheckbox || ticked) ? 'invisible' : ''}`}
        >
          <span data-check-mark className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors duration-(--duration-ui) ${checked ? 'bg-faint border-input text-on-accent' : `${PRIORITY_RING[task.priority]} group-hover/check:bg-success-soft`} ${completing ? 'row-check-pop' : ''}`}>
            {checked && <Icon name="check" size="xs" />}
          </span>
        </button>
        {onTick && !readOnly && (
          <label className={`absolute inset-0 cursor-pointer items-center justify-center ${showCheckbox || ticked ? 'inline-flex' : 'hidden'}`}>
            <input type="checkbox" className="h-4 w-4 accent-(--ot-accent)" checked={ticked} aria-label={t('Select {title}', { title: name })} data-tick
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onTick(e.shiftKey) }} onChange={() => {}} />
          </label>
        )}
      </span>
      <button type="button" className="min-w-0 flex-1 text-left" data-row-open
        onClick={(e) => {
          // Shift+click extends, Ctrl/⌘+click toggles the tick instead of opening (bulk-edit D3).
          if (onTick && !readOnly && (e.shiftKey || e.ctrlKey || e.metaKey)) { e.preventDefault(); onTick(e.shiftKey); return }
          onOpen(e)
        }}>
        <div className={`user-text text-body ${card ? '' : 'truncate'} ${checked ? 'text-faint line-through' : blockedBy > 0 ? 'text-muted' : ''}`} data-row-title>
          {undecryptable ? <span className="italic text-faint"><ReadAs label={t('This title could not be decrypted with this device\'s key')}>{task.title}</ReadAs></span>
            : task.title || <span className="italic text-faint">{t('Untitled')}</span>}
          {unencrypted && (
            <span className="ml-2 rounded-chip bg-warning-soft px-1.5 py-0.5 align-middle text-hint text-on-warning-soft">
              <ReadAs label={t('The server still holds this text unencrypted; it is encrypted after the next sync of an unlocked device.')}>{t('not yet encrypted')}</ReadAs>
            </span>
          )}
        </div>
        {meta}
      </button>
    </li>
  )
})

/** The board card: the same row data as a card (sections-and-boards "Card content"). */
export function TaskCard(props: Omit<TaskRowProps, 'card'>) {
  return <TaskRow {...props} card />
}
