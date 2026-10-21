// The task row and card (OpenSpec change ux-overhaul, task-list-presentation "One
// row anatomy", "Metadata language", "Completion feedback", "Bulk selection does
// not shift rows", "Drag feedback"; design D7). One row in every list: a fixed
// leading slot (the collapse chevron only on rows with children), one checkbox
// slot (the task's checkbox, or the selection box in its place on hover, focus or
// tick), the title, and a metadata line only when there is metadata, built from
// three styles: ToneText for the date and the deadline, LabelChip, NeutralChip
// for counts and the project. The board card is the same data as a card.
//
// Calm and Detailed rows (OpenSpec change calm-rows, task-list-presentation "Metadata
// language", "Row detail in lists"; design D2 to D7): Detailed is the language above,
// unchanged. Calm, the default, leaves out what the view or the group heading already
// says (`implied`, `omitLabel`), colours only what needs attention, shows labels as
// dots (LabelDots) and moves the counts into a quiet trailing group (`rowCounts`).
import { Icon, LabelChip, LabelDots, NeutralChip, ReadAs, ToneText, type IconName, type Tone } from '../ui'
import { memo, type ReactNode, useEffect, useRef, useState } from 'react'
import { useRowDetail, type RowDetail } from '../lib/appearance'
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
import { isInboxTask } from '../lib/inbox'
import { OriginChip } from './OriginChip'

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

// Calm rows (calm-rows D5): only P1 and P2 are coloured; P3 and P4 get the neutral ring.
const PRIORITY_RING_CALM: Record<number, string> = {
  1: 'border-p1 bg-p1-soft',
  2: 'border-p2 bg-p2-soft',
  3: 'border-input',
  4: 'border-input',
}

const DUE_TONE: Record<'overdue' | 'today' | 'soon' | 'later', Tone> = { overdue: 'danger', today: 'success', soon: 'violet', later: 'muted' }
/** Calm rows (calm-rows D4): muted, except overdue and a timed task due today. */
function dueToneCalm(tone: 'overdue' | 'today' | 'soon' | 'later', timed: boolean): Tone {
  return tone === 'overdue' ? 'danger' : tone === 'today' && timed ? 'accent' : 'muted'
}
// Deadline countdown tones (OpenSpec change deadlines, design D2).
const DEADLINE_TONE: Record<'overdue' | 'soon' | 'later', Tone> = { overdue: 'danger', soon: 'warning', later: 'muted' }

/** Indentation stops growing after this level so deep trees stay readable on phones. */
export const MAX_INDENT = 3

/** The date phrase of a row: the due text with evening and repeat as suffixes ("Today · evening · repeats"). */
export function dateText(dueLabel: string | null, evening: boolean, recurring: boolean, occurrence = false): string | null {
  if (!dueLabel) return null
  return [dueLabel, evening ? t('evening') : null, recurring ? t('repeats') : occurrence ? t('occurrence') : null].filter(Boolean).join(' · ')
}

/** The date phrase of a Calm row (calm-rows D4): the day's words left out under a heading that names it, evening left out under This Evening, no repeat suffix. */
export function calmDateText(due: { label: string; time: string | null } | null, dueDate: string | null, evening: boolean, implied: RowImplied | undefined): string | null {
  const sameDay = !!due && !!implied?.date && dueDate === implied.date
  const words = due ? (sameDay ? due.time : due.label) : null
  const eve = evening && !implied?.evening
  if (!due) return eve ? t('This evening') : null
  return [words, eve ? t('evening') : null].filter(Boolean).join(' · ') || null
}

/** One count of a row: subtask progress, notes, comments, attachments (calm-rows D7). */
export interface RowCount {
  key: 'progress' | 'notes' | 'comments' | 'attachments' | 'tracked'
  icon?: IconName
  /** The visible text; none for an icon-only marker (notes). */
  text?: string
  /** The spoken phrase. */
  label: string
}

/**
 * A row's counts in display order. Both details render this list: Detailed as chips
 * in the metadata line, Calm in the quiet trailing group. A new count is one more entry.
 */
export function rowCounts(c: { progress?: Progress; notes: boolean; comments: number; attachments: number; tracked?: { tracked: number; estimate: number | null } }): RowCount[] {
  const out: RowCount[] = []
  // Tracked time (time-tracking, calm-rows' model): first in the quiet group of a Calm row.
  if (c.tracked) out.push({ key: 'tracked', icon: 'timer', text: trackedText(c.tracked.tracked, c.tracked.estimate), label: trackedLabel(c.tracked.tracked, c.tracked.estimate) })
  if (c.progress && c.progress.total > 0) out.push({ key: 'progress', text: `${c.progress.done}/${c.progress.total}`, label: t('{done} of {total} subtasks completed', { done: c.progress.done, total: c.progress.total }) })
  if (c.notes) out.push({ key: 'notes', icon: 'list', label: t('Has notes') })
  if (c.comments > 0) out.push({ key: 'comments', icon: 'message-circle', text: String(c.comments), label: t('{n, plural, one {# comment} other {# comments}}', { n: c.comments }) })
  if (c.attachments > 0) out.push({ key: 'attachments', icon: 'paperclip', text: String(c.attachments), label: t('{n, plural, one {# attachment} other {# attachments}}', { n: c.attachments }) })
  return out
}

/** A count as a chip in the metadata line (Detailed rows). */
function CountChip({ c }: { c: RowCount }) {
  return <NeutralChip icon={c.icon} label={c.label} {...{ [`data-${c.key}`]: '' }}>{c.text}</NeutralChip>
}

/**
 * The quiet trailing group of a Calm row (task-list-presentation "One row anatomy"):
 * faint until the row is hovered or holds focus, then muted; always in the page and
 * read in full, never a control.
 */
export function RowCounts({ counts, card }: { counts: RowCount[]; card?: boolean }) {
  return (
    <span data-row-counts="" className={`${card ? 'ml-auto' : 'ml-auto mt-0.5 h-5'} flex shrink-0 items-center gap-2 text-meta tabular-nums text-faint transition-colors duration-(--duration-ui) group-hover:text-muted group-focus-within:text-muted`}>
      {counts.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1" {...{ [`data-${c.key}`]: '' }}>
          {c.icon && <Icon name={c.icon} size="xs" />}
          <ReadAs label={c.label}>{c.text}</ReadAs>
        </span>
      ))}
    </span>
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
  /** Calm or Detailed (calm-rows D2): the user's preference unless given (stories, tests). */
  detail?: RowDetail
  /** What the view or the group heading already says (calm-rows D3); Calm rows leave it out. */
  implied?: RowImplied
  /** The label whose view is open: Calm rows leave out its dot and name. */
  omitLabel?: string
  /** Every member's tracked minutes on the task, when it has entries (time-tracking D4); a running entry counts to the minute. */
  tracked?: number
  /** The inline editor in place of the title and metadata (inline-task-editing). */
  inline?: ReactNode
}

/**
 * Memoized (large-list-performance D1): a list re-renders a row only when one of its
 * props changes, so callers pass stable handlers and per-row values (`selected` is a
 * boolean, not the list's selected id).
 */
export const TaskRow = memo(function TaskRow({ task, project, labels = [], assignee, assignedToMe = false, selected, showProject, depth = 0, progress, blockedBy = 0, habit = null, breadcrumb, hasChildren = false, collapsed = false, readOnly = false, onToggle, onOpen, onToggleCollapse, card = false, onPointerDown, dropKey, dropIndicator = null, dragging = false, ticked = false, showCheckbox = false, onTick, hideFieldBadges = false, posInSet, setSize, detail: detailProp, implied, omitLabel, tracked: trackedProp, inline }: TaskRowProps) {
  // One shared, ticking map for every row (time-tracking D4); stories and tests may pass the figure.
  const trackedLive = useTaskTracked(task.id)
  const tracked = trackedProp ?? trackedLive
  const dt = useDateTimeFormat()
  const preferred = useRowDetail()
  const calm = (detailProp ?? preferred) === 'calm'
  const due = describeDue(task.due, undefined, undefined, dt.resolved)
  // A zoned due seen from another zone shows its original time and zone (absolute-datetimes).
  const hint = zoneHint(task.due)
  const done = !!task.completed_at
  // Start dates, Someday and This Evening (someday-and-evening D2): chips say why a
  // task is in Later, or in Today without a date.
  const start = task.start ?? null
  const startText = done || !start ? null
    : start === 'someday' ? t('Someday')
    : start > logicalToday() ? t('Starts {date}', { date: formatDate(start, 'compact', dt.resolved) }) : t('Started {date}', { date: formatDate(start, 'compact', dt.resolved) })
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
  const date = calm
    ? calmDateText(due, task.due ? localDueOf(task.due).date : null, !!task.evening && !done, implied)
    : dateText(due?.label ?? (task.evening && !done ? t('This evening') : null), !!task.evening && !done && !!due, !!task.recurrence, !!task.series_id)
  const dateTone: Tone = calm ? (due ? dueToneCalm(due.tone, !!due.time) : 'muted') : due ? DUE_TONE[due.tone] : 'indigo'
  // Calm: the repeat mark is a muted icon with its word after the date, never a suffix (calm-rows D4).
  const repeat = task.recurrence || task.series_id ? (task.recurrence ? t('repeats') : t('occurrence')) : null
  const showStart = !!startText && !(calm && start === 'someday' && implied?.someday)
  // Tracked time joins the estimate chip in Detailed and the quiet group in Calm: one figure, never a second chip.
  const trackedCount = tracked !== undefined ? { tracked, estimate: task.estimate_minutes ?? null } : undefined
  const counts = rowCounts({ progress, notes: !!task.description, comments, attachments, tracked: calm ? trackedCount : undefined })
  const streak = habit && !done ? habit : null
  // Custom field values of the task's project (custom-fields): three badges, then "+n".
  const fieldDefs = useFieldDefs()
  const badges = hideFieldBadges ? [] : fieldBadges(task, fieldDefs, dt.resolved)
  const moreBadges = badges.slice(MAX_FIELD_BADGES)
  const shownLabels = calm && omitLabel ? labels.filter((l) => l.id !== omitLabel) : labels
  // In Calm the counts are not metadata: a row with only counts stays one line (calm-rows D7).
  const hasMeta = !!(badges.length > 0 || breadcrumb || date || streak || deadline || showStart || (calm ? !!repeat : (!due && !task.evening && repeat)) || (task.estimate_minutes && !(calm && trackedCount)) || (!calm && trackedCount) || (blockedBy > 0 && !done)
    || (assignee && task.assignee_id) || (!calm && counts.length > 0) || shownLabels.length > 0 || (showProject && (project || !task.project_id)))

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

  const progressCount = counts.find((c) => c.key === 'progress')
  const quiet = calm && counts.length > 0 ? <RowCounts counts={counts} card={card} /> : null
  // Where the task came from (task-origin D7): a trailing chip outside the open button,
  // quiet in Calm (see OriginChip for the Calm rule).
  const origin = originOf(task)
  const originChip = origin ? <OriginChip origin={origin} quiet={calm} /> : null
  const meta = (hasMeta || (card && quiet)) && (
    <div className={`${card ? 'mt-1' : 'mt-0.5'} flex flex-wrap items-center gap-x-2 gap-y-0.5`} data-row-meta>
      {breadcrumb && <NeutralChip icon="corner-down-right" label={t('In {breadcrumb}', { breadcrumb })} data-breadcrumb="">{breadcrumb}</NeutralChip>}
      {date && (
        <ToneText tone={dateTone} data-date="" data-evening={task.evening && !done ? '' : undefined} data-recurring={!calm && task.recurrence ? '' : undefined}
          label={[date, hint ? t('fixed to {zone}', { zone: task.due?.tz ?? '' }) : null].filter(Boolean).join(', ')}>
          {date}{hint && <span className="text-faint"> ({hint})</span>}
        </ToneText>
      )}
      {repeat && (calm || !date) && (
        <ToneText tone="muted" icon={calm ? 'repeat' : undefined} data-recurring={task.recurrence ? '' : undefined} data-repeat="">{repeat}</ToneText>
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
      {showStart && <ToneText tone="muted" icon={start === 'someday' ? 'archive' : 'calendar-days'} data-start="">{startText}</ToneText>}
      {!calm && trackedCount
        ? <NeutralChip data-estimate="" data-tracked="" label={trackedLabel(trackedCount.tracked, trackedCount.estimate)}>{trackedText(trackedCount.tracked, trackedCount.estimate)}</NeutralChip>
        : task.estimate_minutes && !(calm && trackedCount) ? <NeutralChip data-estimate="" label={t('Estimate {minutes}', { minutes: formatMinutes(task.estimate_minutes) })}>{formatMinutes(task.estimate_minutes)}</NeutralChip> : null}
      {badges.slice(0, MAX_FIELD_BADGES).map((b) => <NeutralChip key={b.def.id} data-field-badge={b.def.id}>{b.text}</NeutralChip>)}
      {moreBadges.length > 0 && (
        <NeutralChip data-field-more="" label={t('{count} more fields: {join}', { count: moreBadges.length, join: moreBadges.map((b) => b.text).join(', ') })}>
          +{moreBadges.length}
        </NeutralChip>
      )}
      {!calm && progressCount && <CountChip c={progressCount} />}
      {assignee && task.assignee_id && <AssigneeChip id={task.assignee_id} name={assignee} me={assignedToMe} />}
      {!calm && counts.filter((c) => c !== progressCount).map((c) => <CountChip key={c.key} c={c} />)}
      {calm ? <LabelDots labels={shownLabels} /> : labels.map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}
      {showProject && project && <NeutralChip dot={project.color} data-project="">{project.name}</NeutralChip>}
      {showProject && !project && !task.project_id && isInboxTask(task) && <NeutralChip data-project="">{t('Inbox')}</NeutralChip>}
      {card && quiet}
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
      className={`group relative flex items-start gap-2 rounded-control px-2 transition-[opacity,transform] duration-(--duration-emphasis) ease-calm ${card ? 'py-2 border border-default bg-surface shadow-1' : 'row-pad'} ${dropIndicator === 'inside' ? feedback.inside : ''} ${ticked ? 'bg-accent-soft' : selected ? (card ? 'ring-1 ring-accent/50' : 'row-selected') : card ? '' : 'row-hover'} ${completing ? 'opacity-50' : ''} ${lift}`}
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
          <span data-check-mark className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors duration-(--duration-ui) ${checked ? 'bg-faint border-input text-on-accent' : `${(calm ? PRIORITY_RING_CALM : PRIORITY_RING)[task.priority]} group-hover/check:bg-success-soft`} ${completing ? 'row-check-pop' : ''}`}>
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
      {originChip
        ? <span className="ml-auto flex shrink-0 items-start gap-2" data-row-trailing>{originChip}{!card && quiet}</span>
        : !card && quiet}
    </li>
  )
})

/** The board card: the same row data as a card (sections-and-boards "Card content"). */
export function TaskCard(props: Omit<TaskRowProps, 'card'>) {
  return <TaskRow {...props} card />
}
