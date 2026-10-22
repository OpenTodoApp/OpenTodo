// The task row and card (OpenSpec change ux-overhaul, task-list-presentation "One
// row anatomy", "Metadata language", "Completion feedback", "Bulk selection does
// not shift rows", "Drag feedback"; design D7). One row in every list: a fixed
// leading slot (the collapse chevron only on rows with children), one checkbox
// slot (the task's checkbox, or the selection box in its place on hover, focus or
// tick), the time column when the list has one, the title, a metadata line only when
// there is metadata, and a quiet trailing group. The board card is the same data as a card.
//
// One row language (OpenSpec change rows-v2, design D1 to D9): the row leaves out what
// the view or the group heading already says (`implied`, `omitLabel`) and colours only
// what needs attention. The time column holds the due time, else the deadline
// countdown (`timeColumn`, a fact of the whole list); the metadata line is one run of
// muted text separated by CSS middle dots; labels are the only chips (LabelChips);
// the project, the counts and the origin form the trailing group, in whose place the
// revealed actions (RowActionCluster) appear on a fine pointer.
import { Icon, LabelChips, ReadAs, ToneText, type IconName, type Tone } from '../ui'
import { memo, type ReactNode, useEffect, useRef, useState } from 'react'
import type { RowImplied } from '../lib/listGroups'
import { describeDeadline, describeDue, formatDate, localDueOf, logicalToday, zoneHint } from '../lib/dates'
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
import { originOf } from '../lib/taskOrigin'
import { trackedLabel, trackedText } from '../lib/time'
import { useTaskTracked } from '../lib/timeEntries'
import { OriginChip } from './OriginChip'
import { DEADLINE_TONE, dueTone, PRIORITY_RING } from './rowTone'
import { RowActionCluster } from './task-list/RowActionCluster'

/** Field values shown on a row before the rest collapse into "+n" (custom-fields). */
export const MAX_FIELD_BADGES = 3

/** Indentation stops growing after this level so deep trees stay readable on phones. */
export const MAX_INDENT = 3

/**
 * The date words of a row (calm-rows D4, rows-v2 D3): the day's words left out under a
 * heading that names it, the time left out when the time column holds it, evening left
 * out under This Evening, no repeat suffix (the repeat is its own item).
 */
export function rowDateText(due: { label: string; day: string; time: string | null } | null, dueDate: string | null, evening: boolean, implied: RowImplied | undefined, inColumn = false): string | null {
  const eve = evening && !implied?.evening
  if (!due) return eve ? t('This evening') : null
  const sameDay = !!implied?.date && dueDate === implied.date
  const words = sameDay ? (inColumn ? null : due.time) : inColumn ? due.day : due.label
  return [words, eve ? t('evening') : null].filter(Boolean).join(' · ') || null
}

/** One count of a row: subtask progress, notes, comments, attachments (calm-rows D7). */
export interface RowCount {
  key: 'progress' | 'notes' | 'comments' | 'attachments'
  icon?: IconName
  /** The visible text; none for an icon-only marker (notes). */
  text?: string
  /** The spoken phrase. */
  label: string
}

/** A row's counts in display order: the trailing group of a row, the end of a card's line. A new count is one more entry. */
export function rowCounts(c: { progress?: Progress; notes: boolean; comments: number; attachments: number }): RowCount[] {
  const out: RowCount[] = []
  if (c.progress && c.progress.total > 0) out.push({ key: 'progress', text: `${c.progress.done}/${c.progress.total}`, label: t('{done} of {total} subtasks completed', { done: c.progress.done, total: c.progress.total }) })
  if (c.notes) out.push({ key: 'notes', icon: 'list', label: t('Has notes') })
  if (c.comments > 0) out.push({ key: 'comments', icon: 'message-circle', text: String(c.comments), label: t('{n, plural, one {# comment} other {# comments}}', { n: c.comments }) })
  if (c.attachments > 0) out.push({ key: 'attachments', icon: 'paperclip', text: String(c.attachments), label: t('{n, plural, one {# attachment} other {# attachments}}', { n: c.attachments }) })
  return out
}

/**
 * The counts (task-list-presentation "One row anatomy"): faint until the row is hovered
 * or holds focus, then muted; always in the page and read in full, never a control.
 */
export function RowCounts({ counts }: { counts: RowCount[] }) {
  return (
    // min-w-0 and overflow-hidden: in a very narrow panel the counts clip, never the page (they are read in full).
    <span data-row-counts="" className="flex min-w-0 items-center gap-2 overflow-hidden text-meta tabular-nums text-faint transition-colors duration-(--duration-ui) group-hover:text-muted group-focus-within:text-muted">
      {counts.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1" {...{ [`data-${c.key}`]: '' }}>
          {c.icon && <Icon name={c.icon} size="xs" />}
          <ReadAs label={c.label}>{c.text}</ReadAs>
        </span>
      ))}
    </span>
  )
}

/** The time column's value (rows-v2 D3): the due time in the date tone, else the deadline countdown in its tone. */
function TimeCell({ time, timeTone, deadline, deadlineLabel }: { time: string | null; timeTone: Tone; deadline: { label: string; tone: 'overdue' | 'soon' | 'later' } | null; deadlineLabel: string }) {
  return (
    <span data-row-time="" className="mt-0.5 flex h-5 w-(--row-time-w) shrink-0 items-center">
      {time ? <ToneText tone={timeTone} data-time="">{time}</ToneText>
        : deadline ? <ToneText tone={DEADLINE_TONE[deadline.tone]} data-deadline="" label={deadlineLabel}>{deadline.label}</ToneText>
        : null}
    </span>
  )
}

type FieldBadge = ReturnType<typeof fieldBadges>[number]

/** The values of the metadata line, computed once by the row. */
interface MetaValues {
  breadcrumb?: string | null
  date: string | null
  dateTone: Tone
  hint: string | null
  zone: string
  repeat: string | null
  /** The task repeats (not an occurrence of a series). */
  recurring: boolean
  deadline: { label: string; tone: 'overdue' | 'soon' | 'later' } | null
  deadlineLabel: string
  startText: string | null
  someday: boolean
  estimate: { text: string; label: string; tracked: boolean } | null
  blockedBy: number
  streak: HabitStats | null
  badges: FieldBadge[]
  assignee?: ReactNode
  origin?: ReactNode
  project?: ReactNode
  labels?: ReactNode
  counts?: ReactNode
}

/** Whether the line has anything to show (the project below 640 px counts; see `RowMeta`). */
function metaItems(m: MetaValues): number {
  return [m.breadcrumb, m.date, m.hint, m.repeat, m.deadline, m.startText, m.estimate, m.blockedBy > 0, m.streak, m.badges.length > 0, m.assignee, m.origin, m.labels, m.counts].filter(Boolean).length
}

/** The metadata line (rows-v2 D4): one run of muted ToneText, dots drawn by CSS, then the label chips. */
function RowMeta({ m, card, projectOnlyBelowSm }: { m: MetaValues; card: boolean; projectOnlyBelowSm: boolean }) {
  const more = m.badges.slice(MAX_FIELD_BADGES)
  return (
    <div className={`${card ? 'mt-1' : 'mt-0.5'} flex flex-wrap items-center gap-x-1 gap-y-0.5 ${projectOnlyBelowSm ? 'sm:hidden' : ''}`} data-row-meta>
      {m.breadcrumb && <ToneText icon="corner-down-right" label={t('In {breadcrumb}', { breadcrumb: m.breadcrumb })} data-breadcrumb="">{m.breadcrumb}</ToneText>}
      {m.date && <ToneText tone={m.dateTone} data-date="">{m.date}</ToneText>}
      {m.hint && <ToneText tone="faint" data-zone-hint="" label={t('fixed to {zone}', { zone: m.zone })}>{m.hint}</ToneText>}
      {m.repeat && <ToneText icon="repeat" data-repeat="" data-recurring={m.recurring ? '' : undefined}>{m.repeat}</ToneText>}
      {m.deadline && <ToneText tone={DEADLINE_TONE[m.deadline.tone]} icon="hourglass" data-deadline="" label={m.deadlineLabel}>{m.deadline.label}</ToneText>}
      {m.startText && <ToneText icon={m.someday ? 'archive' : 'calendar-days'} data-start="">{m.startText}</ToneText>}
      {m.estimate && <ToneText data-estimate="" data-tracked={m.estimate.tracked ? '' : undefined} label={m.estimate.label}>{m.estimate.text}</ToneText>}
      {m.blockedBy > 0 && <ToneText icon="lock" data-blocked="" label={t('Blocked by {blockedBy}', { blockedBy: m.blockedBy })}>{m.blockedBy}</ToneText>}
      {m.streak && <ToneText icon="flame" data-streak="" data-at-risk={m.streak.atRisk ? '' : undefined} label={streakLabel(m.streak)}>{m.streak.current}</ToneText>}
      {m.badges.slice(0, MAX_FIELD_BADGES).map((b) => <ToneText key={b.def.id} data-field-badge={b.def.id}>{b.text}</ToneText>)}
      {more.length > 0 && (
        <ToneText data-field-more="" label={t('{count} more fields: {join}', { count: more.length, join: more.map((b) => b.text).join(', ') })}>+{more.length}</ToneText>
      )}
      {m.assignee && <span data-row-assignee="" className="inline-flex min-w-0 items-center gap-1 text-meta">{m.assignee}</span>}
      {m.origin}
      {m.project}
      {m.labels && <span data-row-labels="" className="ml-1 inline-flex max-w-full min-w-0 first:ml-0">{m.labels}</span>}
      {m.counts}
    </div>
  )
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
  /** The streak of a habit (OpenSpec habits), computed once by the list: an item after the repeat. */
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
  /** A list row, or a board card (rows-v2 D8: the card has no column; its line leads with the time). */
  shape?: 'row' | 'card'
  /** The list shows the time column (rows-v2 D2): one fact of the whole list, never per row. */
  timeColumn?: boolean
  /** The revealed actions (rows-v2 D7); off where the screen has its own controls (Close the day, D9). */
  actions?: boolean
  /** Opens the row menu, as `.` does: the revealed More action. */
  onMore?: () => void
  /** Stories: the revealed actions shown as if hovered. */
  forceActions?: boolean
  /** Starts a drag (board-view: move between sections; manual-ordering: place in a list). */
  onPointerDown?: (e: React.PointerEvent<HTMLLIElement>) => void
  /** Drop target key for lib/dnd (manual-ordering): the row accepts drops before, after or inside it. */
  dropKey?: string
  /** Where the dragged task would land relative to this row (manual-ordering). */
  dropIndicator?: 'before' | 'after' | 'inside' | null
  /** This row is the one being dragged: it lifts (an opacity change under reduced motion). */
  dragging?: boolean
  /** The columns layout shows field values in cells, so the row leaves out their values (custom-fields). */
  hideFieldBadges?: boolean
  /**
   * Position among the visible rows with the same parent (assistive-tech-semantics):
   * with `depth`, the row's aria-level, aria-posinset and aria-setsize, so the
   * subtask hierarchy is announced and not only indented.
   */
  posInSet?: number
  setSize?: number
  /** What the view or the group heading already says (calm-rows D3); the row leaves it out. */
  implied?: RowImplied
  /** The label whose view is open: the row leaves out its chip. */
  omitLabel?: string
  /** Every member's tracked minutes on the task, when it has entries (time-tracking D4); a running entry counts to the minute. */
  tracked?: number
  /** The inline editor in place of the title and metadata (inline-task-editing). */
  inline?: ReactNode
}

/** Completion feedback: the check mark animates and the row fades before it leaves; reopening is immediate. */
function useCompletion(done: boolean, onToggle: () => void) {
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
  return { completing, toggle }
}

/**
 * Memoized (large-list-performance D1): a list re-renders a row only when one of its
 * props changes, so callers pass stable handlers and per-row values (`selected` is a
 * boolean, not the list's selected id).
 */
export const TaskRow = memo(function TaskRow({ task, project, labels = [], assignee, assignedToMe = false, selected, showProject, depth = 0, progress, blockedBy = 0, habit = null, breadcrumb, hasChildren = false, collapsed = false, readOnly = false, onToggle, onOpen, onToggleCollapse, shape = 'row', timeColumn = false, actions = true, onMore, forceActions = false, onPointerDown, dropKey, dropIndicator = null, dragging = false, ticked = false, showCheckbox = false, onTick, hideFieldBadges = false, posInSet, setSize, implied, omitLabel, tracked: trackedProp, inline }: TaskRowProps) {
  const card = shape === 'card'
  // One shared, ticking map for every row (time-tracking D4); stories and tests may pass the figure.
  const trackedLive = useTaskTracked(task.id)
  const tracked = trackedProp ?? trackedLive
  const dt = useDateTimeFormat()
  const due = describeDue(task.due, undefined, undefined, dt.resolved)
  const done = !!task.completed_at
  // Start dates, Someday and This Evening (someday-and-evening D2): they say why a
  // task is in Later, or in Today without a date.
  const start = task.start ?? null
  const startText = done || !start || (start === 'someday' && implied?.someday) ? null
    : start === 'someday' ? t('Someday')
    : start > logicalToday() ? t('Starts {date}', { date: formatDate(start, 'compact', dt.resolved) }) : t('Started {date}', { date: formatDate(start, 'compact', dt.resolved) })
  const deadline = done ? null : describeDeadline(task.deadline, undefined, task.due ? localDueOf(task.due).date : null)
  const deadlineLabel = deadline ? t('Deadline {date}, {label}', { date: formatDate(task.deadline!, 'long', dt.resolved), label: deadline.label }) : ''
  // The column (rows-v2 D2, D3): the due time, else the deadline countdown; the line never repeats it.
  const column = timeColumn && !card
  const timeInColumn = column && !!due?.time
  const deadlineInColumn = column && !due?.time && !!deadline
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
  const counts = rowCounts({ progress, notes: !!task.description, comments, attachments })
  // Custom field values of the task's project (custom-fields): three values, then "+n".
  const fieldDefs = useFieldDefs()
  // Tracked time joins the estimate: one item, `35m / 1h` (time-tracking).
  const estimate = tracked !== undefined
    ? { text: trackedText(tracked, task.estimate_minutes ?? null), label: trackedLabel(tracked, task.estimate_minutes ?? null), tracked: true }
    : task.estimate_minutes ? { text: formatMinutes(task.estimate_minutes), label: t('Estimate {minutes}', { minutes: formatMinutes(task.estimate_minutes) }), tracked: false } : null
  // Where the task came from (task-origin D7): quiet text, in the trailing group of a row and the line of a card.
  const origin = originOf(task)
  const originChip = origin ? <OriginChip origin={origin} quiet /> : null
  const projectName = showProject && project ? project.name : null
  const hint = zoneHint(task.due)
  const m: MetaValues = {
    breadcrumb,
    date: rowDateText(due, task.due ? localDueOf(task.due).date : null, !!task.evening && !done, implied, timeInColumn),
    dateTone: due ? dueTone(due.tone, !!due.time) : 'muted',
    hint, zone: task.due?.tz ?? '',
    repeat: task.recurrence ? t('repeats') : task.series_id ? t('occurrence') : null, recurring: !!task.recurrence,
    deadline: deadlineInColumn ? null : deadline, deadlineLabel,
    startText, someday: start === 'someday',
    estimate, blockedBy: done ? 0 : blockedBy, streak: habit && !done ? habit : null,
    badges: hideFieldBadges ? [] : fieldBadges(task, fieldDefs, dt.resolved),
    assignee: assignee && task.assignee_id ? <AssigneeChip id={task.assignee_id} name={assignee} me={assignedToMe} /> : null,
    origin: null,
    labels: <LabelChips labels={labels} omit={omitLabel} />,
    counts: card && counts.length > 0 ? <RowCounts counts={counts} /> : null,
  }
  if (!labels.some((l) => l.id !== omitLabel)) m.labels = null
  // The project (rows-v2 D6): the trailing group from 640 px, the end of the line below (and always on a card).
  if (projectName) m.project = <span data-project="" className={`inline-flex max-w-48 min-w-0 items-center gap-1 text-meta text-muted ${card ? '' : 'sm:hidden'}`}><span className="truncate">{projectName}</span></span>
  const items = metaItems(m)
  const meta = (items > 0 || m.project) && <RowMeta m={m} card={card} projectOnlyBelowSm={items === 0 && !card} />
  const revealed = !card && !readOnly && !inline && actions

  const { completing, toggle } = useCompletion(done, onToggle)
  const checked = done || completing
  const feedback = dragFeedback(prefersReducedMotion())
  const lift = dragging ? feedback.lift : ''
  const fade = completing ? 'opacity-50' : '' // tone-lint-allow: a completing row fades out (motion), not quieter text
  // The origin is a link, so it never sits inside the open button: on a card it ends the
  // card at the top right, as before rows-v2 (a link nested in a button is invalid).
  const trailing = card ? originChip && <span data-row-trailing="" className="ml-auto flex shrink-0 items-start">{originChip}</span>
    : (projectName || counts.length > 0 || originChip) && (
    // min-w-0: in a narrow column (a dashboard panel) the project name gives way, never the page.
    <span data-row-trailing="" className={`ml-auto mt-0.5 flex h-5 min-w-0 items-center gap-2 transition-opacity duration-(--duration-ui) ${revealed ? (forceActions ? 'md:pointer-fine:opacity-0' : 'md:pointer-fine:group-hover:opacity-0 md:pointer-fine:group-focus-within:opacity-0') : ''}`}>
      {projectName && <span data-project="" className="hidden max-w-48 min-w-0 truncate text-meta text-muted sm:inline">{projectName}</span>}
      {counts.length > 0 && <RowCounts counts={counts} />}
      {originChip && <span className="flex shrink-0">{originChip}</span>}
    </span>
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
      className={`group relative flex items-start gap-2 rounded-control px-2 transition-[opacity,transform] duration-(--duration-emphasis) ease-calm ${card ? 'py-2 border border-default bg-surface shadow-1' : 'row-pad'} ${dropIndicator === 'inside' ? feedback.inside : ''} ${ticked ? 'bg-accent-soft' : selected ? (card ? 'ring-1 ring-accent/50' : 'row-selected') : card ? '' : 'row-hover'} ${fade} ${lift}`}
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
      {column && <TimeCell time={due?.time ?? null} timeTone={due ? dueTone(due.tone, true) : 'muted'} deadline={deadlineInColumn ? deadline : null} deadlineLabel={deadlineLabel} />}
      {inline ?? <button type="button" className="flex min-w-0 flex-1 flex-col text-left" data-row-open
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
      </button>}
      {trailing}
      {revealed && <RowActionCluster task={task} onMore={onMore} force={forceActions} />}
    </li>
  )
})

/** The board card: the same row data as a card (sections-and-boards "Card content"). */
export function TaskCard(props: Omit<TaskRowProps, 'shape'>) {
  return <TaskRow {...props} shape="card" />
}
