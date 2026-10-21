// The task panel's facet lines (OpenSpec change task-panel-facets, design D1): the
// task's properties as four short sentences, Where, When, How and Who, each an
// ordered list of parts. The words are the list row's (describeDue, the deadline
// countdown, formatMinutes), expanded where the panel has room, so the row and the
// panel tell the same story. Pure: everything the words need comes in `ctx`.
import { daysBetweenISO, describeDeadline, describeDue, formatDate, logicalToday, type ResolvedDateTime } from './dates'
import { formatMinutes } from './duration'
import { t } from './i18n'
import type { Due, Label, Priority, Task } from './types'

export type FacetId = 'where' | 'when' | 'how' | 'who'

/** The When popover's segments a part opens on. */
export type WhenSegmentId = 'due' | 'start' | 'deadline' | 'repeat' | 'reminders'

export type PartTone = 'overdue' | 'today' | 'soon' | 'later' | 'warning'

export interface FacetPart {
  /** The property it shows and edits (`data-part`): also the editing id. */
  id: string
  text: string
  tone?: PartTone
  /** For When parts: the segment of the popover it opens. */
  segment?: WhenSegmentId
  /** A placeholder for a property revealed by the Add menu without a value yet. */
  empty?: boolean
  /** Labels render as chips inside the How line. */
  labels?: Label[]
  /** Read as text, never a control (an origin without a link). */
  fixed?: boolean
  /** A tooltip (the origin's stored title). */
  tip?: string
  /** The separator before this part: a chevron between a project and its section, a middle dot otherwise. */
  sep?: 'chevron'
}

export interface FacetContext {
  /** The due as displayed (the viewer's zone), or null. */
  local: Due | null
  /** The city a timed due is fixed to, when it is zoned; null when floating. */
  zoneCity?: string | null
  projectName: string
  projectArchived?: boolean
  sectionName?: string | null
  parentTitle?: string | null
  /** The origin's short text, when the task has one, its stored title and whether it links somewhere. */
  originText?: string | null
  originTitle?: string | null
  originLinked?: boolean
  /** Where the task happens, as one line (task-locations), when it has a location. */
  locationText?: string | null
  labels: Label[]
  reminders: number
  blockerTitles: string[]
  blocks: number
  assigneeName?: string | null
  /** Optional properties the Add menu revealed without a value yet. */
  revealed?: ReadonlySet<string>
  today?: string
  dateTime?: ResolvedDateTime
}

export interface Facets { where: FacetPart[]; when: FacetPart[]; how: FacetPart[]; who: FacetPart[] }

const PRIORITY_TEXT: Record<Priority, string> = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4' }

/** "deadline Sun, Oct 25 · 9 days", "deadline today", "deadline Oct 18 · 3 days over". */
function deadlineText(deadline: string, ctx: FacetContext, today: string): string {
  const days = daysBetweenISO(today, deadline)
  if (days === 0) return t('deadline today')
  const when = formatDate(deadline, 'long', ctx.dateTime, today)
  const count = days > 0 ? t('{n, plural, one {# day} other {# days}}', { n: days }) : t('{n, plural, one {# day over} other {# days over}}', { n: -days })
  return t('deadline {date}, {count}', { date: when, count })
}

/** Builds the four facet lines of a task. */
export function facetsOf(task: Task, ctx: FacetContext): Facets {
  const today = ctx.today ?? logicalToday()
  const revealed = ctx.revealed ?? new Set<string>()
  const date = (iso: string) => formatDate(iso, 'long', ctx.dateTime, today)

  // Where: project › section, the parent, the origin.
  const where: FacetPart[] = [{ id: 'project', text: ctx.projectArchived ? `${ctx.projectName} ${t('(archived)')}` : ctx.projectName }]
  if (ctx.sectionName) where.push({ id: 'section', text: ctx.sectionName, sep: 'chevron' })
  else if (revealed.has('section')) where.push({ id: 'section', text: t('No section'), empty: true, sep: 'chevron' })
  if (ctx.parentTitle != null) where.push({ id: 'parent', text: t('under {title}', { title: ctx.parentTitle || t('Untitled') }) })
  else if (revealed.has('parent')) where.push({ id: 'parent', text: t('No parent'), empty: true })
  if (ctx.originText) where.push({ id: 'origin', text: ctx.originText, tip: ctx.originTitle || undefined, fixed: !ctx.originLinked })
  if (ctx.locationText) where.push({ id: 'location', text: ctx.locationText })
  else if (revealed.has('location')) where.push({ id: 'location', text: t('Location'), empty: true })

  // When: do on (with evening and the zone), repeat, deadline, start, reminders.
  const when: FacetPart[] = []
  const due = describeDue(ctx.local, today, undefined, ctx.dateTime)
  if (due) when.push({ id: 'due', text: ctx.zoneCity ? `${due.label} ${ctx.zoneCity}` : due.label, tone: due.tone, segment: 'due' })
  if (task.evening) when.push({ id: 'evening', text: t('evening'), segment: 'due' })
  if (task.recurrence) when.push({ id: 'repeat', text: task.recurrence, segment: 'repeat' })
  else if (revealed.has('repeat')) when.push({ id: 'repeat', text: t('Repeat'), segment: 'repeat', empty: true })
  if (task.deadline) {
    const tone = describeDeadline(task.deadline, today, ctx.local?.date ?? null)?.tone
    when.push({ id: 'deadline', text: deadlineText(task.deadline, ctx, today), tone: tone === 'overdue' ? 'overdue' : tone === 'soon' ? 'warning' : undefined, segment: 'deadline' })
  } else if (revealed.has('deadline')) when.push({ id: 'deadline', text: t('Deadline'), segment: 'deadline', empty: true })
  if (task.start === 'someday') when.push({ id: 'when', text: t('Someday'), segment: 'start' })
  else if (task.start) when.push({ id: 'when', text: task.start > today ? t('from {date}', { date: date(task.start) }) : t('since {date}', { date: date(task.start) }), segment: 'start' })
  else if (revealed.has('when')) when.push({ id: 'when', text: t('Start'), segment: 'start', empty: true })
  if (ctx.reminders > 0) when.push({ id: 'reminders', text: t('{reminders, plural, one {# reminder} other {# reminders}}', { reminders: ctx.reminders }), segment: 'reminders' })
  else if (revealed.has('reminders')) when.push({ id: 'reminders', text: t('Reminder'), segment: 'reminders', empty: true })
  // Nothing set: one part that reads so, and opens Do on.
  if (!due && !when.some((p) => p.id !== 'evening')) when.unshift({ id: 'due', text: t('Not scheduled'), segment: 'due', empty: true })
  else if (!due) when.unshift({ id: 'due', text: t('No date'), segment: 'due', empty: true })

  // How: priority, estimate, labels.
  const how: FacetPart[] = [{ id: 'priority', text: PRIORITY_TEXT[task.priority] ?? 'P4' }]
  if (task.estimate_minutes !== null) how.push({ id: 'estimate', text: formatMinutes(task.estimate_minutes) })
  else if (revealed.has('estimate')) how.push({ id: 'estimate', text: t('Estimate'), empty: true })
  if (ctx.labels.length) how.push({ id: 'labels', text: ctx.labels.map((l) => l.name).join(', '), labels: ctx.labels })
  else if (revealed.has('labels')) how.push({ id: 'labels', text: t('Labels'), empty: true })

  // Who: assignee, blocked by, blocks; the line is shown only when it has a part.
  const who: FacetPart[] = []
  if (ctx.assigneeName) who.push({ id: 'assignee', text: ctx.assigneeName })
  else if (revealed.has('assignee')) who.push({ id: 'assignee', text: t('Unassigned'), empty: true })
  if (ctx.blockerTitles.length) {
    const first = ctx.blockerTitles[0] || t('Untitled')
    who.push({ id: 'blocked-by', text: ctx.blockerTitles.length === 1 ? t('waits for {title}', { title: first }) : t('waits for {n, plural, one {# task} other {# tasks}}', { n: ctx.blockerTitles.length }) })
  } else if (revealed.has('blocked-by')) who.push({ id: 'blocked-by', text: t('Blocked by'), empty: true })
  if (ctx.blocks > 0) who.push({ id: 'blocks', text: t('blocks {n}', { n: ctx.blocks }) })

  return { where, when, how, who }
}
