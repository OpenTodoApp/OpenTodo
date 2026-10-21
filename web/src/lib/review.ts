// The reviews (OpenSpec changes `stats-and-review` D3, D4 and `open-loops-method`
// D4, D5, D6): the weekly review's seven steps in three phases, derived from the
// local rows with the definitions of lib/stats.ts and lib/method/rules.ts; the
// project walk's queue; the Daily check's focus and the Monthly look's areas;
// and the synced personal `review` row and per-project review stamps that record
// them. Pure apart from the writers at the end, each one op set.
import { bulkLabel, mergeChanges, planDue, toProposed } from './bulk'
import { todayList } from './dayLists'
import { addDaysISO, currentDayStart, daysBetweenISO, logicalDay } from './dates'
import { mutate, type Change } from './ops'
import { canEditProject, canEditTasks, roleOf } from './sharing'
import { compute, countedTasks, overdueOf, sharedIds, type StatsInput } from './stats'
import { applyBatch } from './undo'
import { db, type AssistantUndo } from './db'
import { MethodRules, waitingTasks, type MethodInput } from './method/rules'
import { qualifies } from './triage'
import type { Membership, Project, Review, Task } from './types'
import { isSomeday, isStarted } from './views'
import { t, msg, translatedMap } from './i18n'

export const REVIEW_ID = 'me'
const DAY_MS = 86_400_000
/** A review is due when the last one is more than seven days old, or there was none. */
export const REVIEW_INTERVAL_MS = 7 * DAY_MS
/** The Monthly look is due after thirty days. */
export const MONTHLY_INTERVAL_MS = 30 * DAY_MS
/** A project counts as reviewed in the walk for this long. */
export const WALK_FRESH_MS = 7 * DAY_MS
/** Today's focus holds at most this many tasks. */
export const FOCUS_MAX = 3

export type StepId = 'clear' | 'sweep' | 'back' | 'waiting' | 'projects' | 'ahead' | 'someday'
export const STEP_IDS: readonly StepId[] = ['clear', 'sweep', 'back', 'waiting', 'projects', 'ahead', 'someday']
export const STEP_TITLES = translatedMap<StepId>({
  clear: msg('Inbox'), sweep: msg('Mind sweep'), back: msg('Look back'), waiting: msg('Waiting'), projects: msg('Projects'), ahead: msg('Look ahead'), someday: msg('Someday'),
})
export type PhaseId = 'clear' | 'current' | 'creative'
export const PHASE_OF: Readonly<Record<StepId, PhaseId>> = { clear: 'clear', sweep: 'clear', back: 'current', waiting: 'current', projects: 'current', ahead: 'current', someday: 'creative' }
export const PHASE_TITLES = translatedMap<PhaseId>({ clear: msg('Get clear'), current: msg('Get current'), creative: msg('Get creative') })

/** Trigger prompts of the Mind sweep: fixed copy, no data of their own. */
export const SWEEP_PROMPTS = [
  msg('Calls to return'), msg('Messages to answer'), msg('Promises to someone'), msg('Things at home to fix'), msg('Errands and shopping'),
  msg('Money, bills and paperwork'), msg('Work in progress'), msg('People to see or thank'), msg('Health and appointments'), msg('Ideas you keep coming back to'),
] as const

/** One project of the walk, with what its card shows. */
export interface WalkProject {
  project: Project
  nextAction: Task | null
  waiting: number
  deferred: number
  stalled: boolean
  /** Without a next action (method-views). */
  needsNext: boolean
  /** When this user last marked it reviewed; 0 = never. */
  reviewedAt: number
  /** The user may archive it (owner or admin of a shared project, always for their own). */
  canArchive: boolean
}

export interface ReviewSteps {
  /** Open top-level Inbox tasks, in Inbox order. */
  inbox: Task[]
  /** Completed this week (the count Look back shows). */
  completedThisWeek: number
  overdue: Task[]
  waiting: Task[]
  /** Working projects, least recently reviewed first. */
  walk: WalkProject[]
  /** Open tasks due today and in the next six days, by due date. */
  ahead: Task[]
  /** Someday tasks, oldest first. */
  someday: Task[]
  done: Record<StepId, boolean>
  /** What is left per step (always-done steps have nothing to finish). */
  left: Record<StepId, number>
}

export interface ReviewInput extends MethodInput {
  /** Completions this week, from lib/stats.ts `compute` with the current week. */
  completedThisWeek: number
  /** The user's review stamp per project id (project_prefs.reviewed_at). */
  reviewedAt: ReadonlyMap<string, number>
  now: number
}

/** The walk's projects: every working project, never reviewed first, then the oldest stamp, then sidebar order. */
export function walkProjects(input: ReviewInput, rules = new MethodRules(input)): WalkProject[] {
  const memberships = input.memberships as Map<string, Membership>
  return rules.working.map((project) => ({
    project,
    nextAction: rules.nextActionOf(project.id),
    waiting: rules.waitingIn(project.id).length,
    deferred: rules.deferredIn(project.id).length,
    stalled: rules.stalled(project.id, input.now),
    needsNext: rules.needsNextAction(project.id),
    reviewedAt: input.reviewedAt.get(project.id) ?? 0,
    canArchive: canEditProject(roleOf(project.id, memberships)),
  })).sort((a, b) => a.reviewedAt - b.reviewedAt || a.project.position - b.project.position || a.project.name.localeCompare(b.project.name))
}

/** Reviewed in the walk: stamped in the last seven days. */
export const freshlyReviewed = (w: Pick<WalkProject, 'reviewedAt'>, now: number): boolean => w.reviewedAt > 0 && now - w.reviewedAt <= WALK_FRESH_MS

export function reviewSteps(input: ReviewInput): ReviewSteps {
  const shared = new Set((input.memberships as Map<string, Membership>).keys())
  const statsInput: StatsInput = { tasks: input.tasks, projects: input.projects, shared, me: input.me, today: input.today }
  const counted = countedTasks(statsInput)
  const inbox = counted.filter(qualifies).sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1))
  const overdue = overdueOf(counted, input.projects, input.today)
  const until = addDaysISO(input.today, 6)
  const archived = new Set(input.projects.filter((p) => p.archived || p.deleted_at).map((p) => p.id))
  const ahead = counted
    .filter((task) => task.completed_at === null && task.due && task.due.date >= input.today && task.due.date <= until && !(task.project_id && archived.has(task.project_id)))
    .sort((a, b) => (a.due!.date < b.due!.date ? -1 : a.due!.date > b.due!.date ? 1 : a.priority - b.priority))
  const someday = input.tasks
    .filter((task) => !task.deleted_at && !task.completed_at && isSomeday(task) && !(task.project_id && archived.has(task.project_id)))
    .sort((a, b) => a.created_at - b.created_at)
  const walk = walkProjects(input)
  const projectsLeft = walk.filter((w) => w.needsNext || !freshlyReviewed(w, input.now)).length
  const left: Record<StepId, number> = { clear: inbox.length, sweep: 0, back: overdue.length, waiting: 0, projects: projectsLeft, ahead: 0, someday: 0 }
  const done = Object.fromEntries(STEP_IDS.map((s) => [s, left[s] === 0])) as Record<StepId, boolean>
  return { inbox, completedThisWeek: input.completedThisWeek, overdue, waiting: waitingTasks(input), walk, ahead, someday, done, left }
}

/** The step the screen opens on: the first that is not done, else Look ahead. */
export function firstUnfinished(done: Record<StepId, boolean>): StepId {
  return STEP_IDS.find((s) => !done[s]) ?? 'ahead'
}

/** Whether the weekly review is due: never finished, or more than seven days ago. */
export function reviewDue(completedAt: number | null | undefined, now = Date.now()): boolean {
  return !completedAt || now - completedAt > REVIEW_INTERVAL_MS
}

/** Whether the Monthly look is due: never finished, or more than thirty days ago. */
export function monthlyDue(monthlyAt: number | null | undefined, now = Date.now()): boolean {
  return !monthlyAt || now - monthlyAt > MONTHLY_INTERVAL_MS
}

/** Whether the Daily check is due: not done on the user's logical today (day-boundary D4). */
export function dailyDue(dailyAt: number | null | undefined, today: string): boolean {
  return !dailyAt || logicalDay(dailyAt, currentDayStart()) !== today
}

/** When the last review was, in words: "today", "yesterday", "9 days ago" or "never". */
export function reviewAgo(completedAt: number | null | undefined, now = Date.now()): string {
  if (!completedAt) return t('never')
  // Logical days (day-boundary D4): a review finished at 01:00 before a 04:00 day start was "yesterday's".
  const dayStart = currentDayStart()
  const days = Math.max(0, daysBetweenISO(logicalDay(completedAt, dayStart), logicalDay(now, dayStart)))
  return days === 0 ? t('today') : days === 1 ? t('yesterday') : t('{n} days ago', { n: days })
}

/** Today's focus as stored: the ids chosen on `today`, or none when it was chosen on another day. */
export function storedFocus(review: Pick<Review, 'focus' | 'focus_date'> | null | undefined, today: string): string[] {
  if (!review || review.focus_date !== today) return []
  return review.focus.split(',').map((s) => s.trim()).filter(Boolean)
}

/** Today's focus as shown: the stored ids that are still live, open tasks, in the stored order. */
export function focusTasks(review: Pick<Review, 'focus' | 'focus_date'> | null | undefined, today: string, tasks: readonly Task[]): Task[] {
  const byId = new Map(tasks.map((x) => [x.id, x]))
  return storedFocus(review, today).map((id) => byId.get(id)).filter((x): x is Task => !!x && !x.deleted_at && !x.completed_at)
}

/**
 * Toggles a task in today's focus; 'full' when it would be a fourth. Completed or
 * deleted tasks no longer count, so they free their place without a write of their own.
 */
export async function toggleFocus(review: Pick<Review, 'focus' | 'focus_date'> | null | undefined, today: string, tasks: readonly Task[], id: string): Promise<'added' | 'removed' | 'full'> {
  const current = focusTasks(review, today, tasks).map((x) => x.id)
  if (current.includes(id)) {
    await mutate('review', REVIEW_ID, { focus_date: today, focus: current.filter((x) => x !== id).join(',') })
    return 'removed'
  }
  if (current.length >= FOCUS_MAX) return 'full'
  await mutate('review', REVIEW_ID, { focus_date: today, focus: [...current, id].join(',') })
  return 'added'
}

/** An area of the Monthly look: a top-level project holding sub-projects, and those of them that need attention. */
export interface Area {
  project: Project
  children: Project[]
  attention: WalkProject[]
}

/** Areas (open-loops-method "Monthly look"): live top-level projects with live child projects, in sidebar order. */
export function areasOf(input: ReviewInput): Area[] {
  const walk = new Map(walkProjects(input).map((w) => [w.project.id, w]))
  const live = input.projects.filter((p) => !p.deleted_at && !p.archived)
  return live.filter((p) => !p.parent_id).sort((a, b) => a.position - b.position).flatMap((project) => {
    const children = live.filter((c) => c.parent_id === project.id).sort((a, b) => a.position - b.position)
    if (!children.length) return []
    const attention = children.map((c) => walk.get(c.id)).filter((w): w is WalkProject => !!w && (w.needsNext || w.stalled))
    return [{ project, children, attention }]
  })
}

/** Records a finished weekly review through the op log (offline-safe; the latest finish wins on every device). */
export function finishReview(now = Date.now()): Promise<void> {
  return mutate('review', REVIEW_ID, { completed_at: now })
}

/** Records a finished Daily check. */
export function finishDailyCheck(now = Date.now()): Promise<void> {
  return mutate('review', REVIEW_ID, { daily_at: now })
}

/** Records a finished Monthly look. */
export function finishMonthlyLook(now = Date.now()): Promise<void> {
  return mutate('review', REVIEW_ID, { monthly_at: now })
}

/** Marks a project reviewed by this user (project_prefs.reviewed_at, personal even for a shared project). */
export function markProjectReviewed(projectId: string, now = Date.now()): Promise<void> {
  return mutate('project_prefs', projectId, { reviewed_at: now })
}

// ---- Close the day (OpenSpec change close-the-day, design D3–D5, D8) ----

export type CloseStepId = 'summary' | 'carry' | 'note'
export const CLOSE_STEP_IDS: readonly CloseStepId[] = ['summary', 'carry', 'note']
export const CLOSE_STEP_TITLES = translatedMap<CloseStepId>({ summary: msg('How the day went'), carry: msg('Carry over'), note: msg('A line for tomorrow') })
/** Close the day has one phase. */
export const CLOSE_PHASE_TITLES = translatedMap<'close'>({ close: msg('Close the day') })
/** The longest line for tomorrow, in characters. */
export const TOMORROW_NOTE_MAX = 500

/**
 * Whether the day was closed on the user's logical `today` (weekly-review "Rhythm
 * markers", "Close the day is reachable"): derived from the stamp, so every device
 * gives the same answer for the same local date.
 */
export function dayClosed(closedAt: number | null | undefined, today: string): boolean {
  return !!closedAt && logicalDay(closedAt, currentDayStart()) === today
}

/**
 * Yesterday's line for tomorrow (weekly-review "Daily check"): the note of the latest
 * close when that close was on an earlier local day; null when there is none, it is
 * empty, or the day is already closed again. Needs no write to show or to hide.
 */
export function yesterdaysNote(review: Pick<Review, 'closed_at' | 'tomorrow_note'> | null | undefined, today: string): string | null {
  if (!review?.closed_at || logicalDay(review.closed_at, currentDayStart()) >= today) return null
  return review.tomorrow_note?.trim() || null
}

/** Records a close (weekly-review "Closing the day"): the time and the trimmed note, one op pair through the outbox. */
export function closeDay(note: string, now = Date.now()): Promise<void> {
  return mutate('review', REVIEW_ID, { closed_at: now, tomorrow_note: note.trim().slice(0, TOMORROW_NOTE_MAX) })
}

/** One unfinished task of Today and whether the user may change it (a viewer gets Keep only). */
export interface CarryTask {
  task: Task
  editable: boolean
}

export interface DaySummary {
  /** What Today still lists plus what was completed today. */
  planned: number
  /** Completed on the local date, counted as Statistics counts (per-day chart). */
  done: number
  focusDone: number
  focusTotal: number
  /** Every open task Today lists, in Today's order. */
  unfinished: CarryTask[]
}

/**
 * How the day went (weekly-review "How the day went", design D3): pure, from the
 * local rows. `done` is Statistics' per-day count for today, so the two never
 * disagree; deleted tasks and skipped habit occurrences count nowhere.
 */
export function daySummary(input: MethodInput, review: Pick<Review, 'focus' | 'focus_date'> | null | undefined, weekStart = 1): DaySummary {
  const { today } = input
  const memberships = input.memberships as Map<string, Membership>
  const archived = new Set(input.projects.filter((p) => p.archived || p.deleted_at).map((p) => p.id))
  const live = input.tasks.filter((x) => !x.deleted_at && !x.skipped && !(x.project_id && archived.has(x.project_id)))
  const unfinished = todayList(live, today).map((task) => ({ task, editable: canEditTasks(roleOf(task.project_id, memberships)) }))
  const stats = compute({ tasks: input.tasks, projects: input.projects, shared: sharedIds([...memberships.values()]), me: input.me, today }, { start: today, end: today }, weekStart)
  const done = stats.perDay.find((d) => d.date === today)?.count ?? 0
  const byId = new Map(input.tasks.filter((x) => !x.deleted_at).map((x) => [x.id, x]))
  const focus = storedFocus(review, today).map((id) => byId.get(id)).filter((x): x is Task => !!x)
  return { planned: unfinished.length + done, done, focusDone: focus.filter((x) => x.completed_at).length, focusTotal: focus.length, unfinished }
}

/** One carry-over decision; nothing is stored until Apply (design D4). */
export type CarryDecision = { kind: 'tomorrow' } | { kind: 'day'; date: string } | { kind: 'someday' } | { kind: 'keep' }

/**
 * The carry-over as one list of changes (weekly-review "Carry-over is one batch"):
 * Tomorrow and a day are the bulk reschedule (a time of day kept, a parked task
 * un-parked), and a task in Today only because its start date came gets its start
 * cleared so it leaves Today; Someday is the patch parking writes; Keep writes
 * nothing. Read-only tasks write nothing whatever their decision.
 */
export function planCarryOver(decisions: ReadonlyMap<string, CarryDecision>, tasks: readonly CarryTask[], today: string): Change[] {
  const out: Change[] = []
  for (const { task, editable } of tasks) {
    const d = decisions.get(task.id) ?? { kind: 'tomorrow' }
    if (!editable || d.kind === 'keep') continue
    if (d.kind === 'someday') {
      const patch: Record<string, unknown> = { start: 'someday' }
      if (task.due) patch.due = null
      if (task.evening) patch.evening = false
      out.push({ entity: 'task', entityId: task.id, patch })
      continue
    }
    const [change] = planDue([task], d.kind === 'tomorrow' ? 'tomorrow' : d.date, today)
    if (isStarted(task, today)) change.patch = { ...change.patch, start: null }
    out.push(change)
  }
  return mergeChanges(out)
}

/** The toast of a carry-over: the bulk "n tasks rescheduled" when every applied decision is a date, else "n tasks carried over". */
export function carryOverLabel(decisions: readonly CarryDecision[]): string {
  const n = decisions.length
  return decisions.every((d) => d.kind === 'tomorrow' || d.kind === 'day')
    ? bulkLabel({ kind: 'due', pick: 'tomorrow' }, n)
    : t('{n, plural, one {# task carried over} other {# tasks carried over}}', { n })
}

/** One field the carry-over changed (ux-feedback-2 D1): the task, the field and its value before and after. */
export interface CarryOverItem {
  id: string
  field: string
  before: unknown
  after: unknown
}

/** What the latest carry-over changed, stored on the review row as `carry_over` so Reopen works on every device. */
export interface CarryOverRecord {
  date: string
  items: CarryOverItem[]
}

/** The stored carry-over, or null when there is none or it does not parse. */
export function carryOverOf(review: Pick<Review, 'carry_over'> | null | undefined): CarryOverRecord | null {
  if (!review?.carry_over) return null
  try {
    const r = JSON.parse(review.carry_over) as CarryOverRecord
    return typeof r?.date === 'string' && Array.isArray(r.items) ? r : null
  } catch {
    return null
  }
}

/**
 * Applies the carry-over as ONE undoable batch through the bulk path; null when
 * nothing is written. The same batch records what it changed on the review row
 * (weekly-review "Reopen the day"), so its Undo also restores the previous record.
 */
export async function applyCarryOver(decisions: ReadonlyMap<string, CarryDecision>, tasks: readonly CarryTask[], today: string): Promise<{ entry: AssistantUndo | null; label: string; count: number }> {
  const changes = planCarryOver(decisions, tasks, today)
  const applied = tasks.filter((x) => changes.some((c) => c.entityId === x.task.id)).map((x) => decisions.get(x.task.id) ?? { kind: 'tomorrow' as const })
  const label = carryOverLabel(applied)
  const proposed = await toProposed(changes)
  if (proposed.length === 0) return { entry: null, label, count: 0 }
  const items: CarryOverItem[] = proposed.flatMap((c) => Object.entries(c.patch).map(([field, after]) => ({ id: c.entityId, field, before: c.base?.[field] ?? null, after: after ?? null })))
  const current = await db.review.get(REVIEW_ID)
  const record: CarryOverRecord = { date: today, items }
  proposed.push({ entity: 'review', entityId: REVIEW_ID, patch: { carry_over: JSON.stringify(record) }, base: { carry_over: current?.carry_over ?? '' } })
  const entry = await applyBatch(proposed, { source: 'bulk', label })
  return { entry, label, count: changes.length }
}

/** Whether "Reopen the day" is offered: the day was closed on the user's logical `today`. */
export function canReopenDay(review: Pick<Review, 'closed_at'> | null | undefined, today: string): boolean {
  return dayClosed(review?.closed_at, today)
}

export interface ReopenResult {
  entry: AssistantUndo | null
  label: string
  /** Tasks put back. */
  restored: number
  /** Titles of tasks left alone because they changed after the close. */
  skipped: string[]
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * Reopens a day closed today (weekly-review "Reopen the day", ux-feedback-2 D1):
 * ONE undoable batch writes each recorded field back to its value before the
 * carry-over where the task still holds the value the carry-over wrote (others
 * are left alone and named), clears `closed_at` and empties `carry_over`, and
 * keeps the line for tomorrow. A record from another day restores only the stamp.
 */
export async function reopenDay(today: string): Promise<ReopenResult> {
  const review = await db.review.get(REVIEW_ID)
  if (!canReopenDay(review, today)) return { entry: null, label: '', restored: 0, skipped: [] }
  const record = carryOverOf(review)
  const changes: Change[] = []
  const skipped: string[] = []
  if (record && record.date === today) {
    const byTask = new Map<string, CarryOverItem[]>()
    for (const it of record.items) byTask.set(it.id, [...(byTask.get(it.id) ?? []), it])
    for (const [id, items] of byTask) {
      const task = await db.tasks.get(id)
      if (!task || task.deleted_at) continue
      const row = task as unknown as Record<string, unknown>
      if (items.some((it) => !same(row[it.field], it.after))) {
        skipped.push(task.title)
        continue
      }
      changes.push({ entity: 'task', entityId: id, patch: Object.fromEntries(items.map((it) => [it.field, it.before])) })
    }
  }
  const restored = changes.length
  const label = restored
    ? t('{n, plural, one {Day reopened, # task back in Today} other {Day reopened, # tasks back in Today}}', { n: restored })
    : t('Day reopened')
  const proposed = await toProposed(changes)
  proposed.push({ entity: 'review', entityId: REVIEW_ID, patch: { closed_at: 0, carry_over: '' }, base: { closed_at: review?.closed_at ?? 0, carry_over: review?.carry_over ?? '' } })
  const entry = await applyBatch(proposed, { source: 'bulk', label })
  return { entry, label, restored, skipped }
}
