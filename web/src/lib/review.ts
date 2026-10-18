// The reviews (OpenSpec changes `stats-and-review` D3, D4 and `open-loops-method`
// D4, D5, D6): the weekly review's seven steps in three phases, derived from the
// local rows with the definitions of lib/stats.ts and lib/method/rules.ts; the
// project walk's queue; the Daily check's focus and the Monthly look's areas;
// and the synced personal `review` row and per-project review stamps that record
// them. Pure apart from the writers at the end, each one op set.
import { addDaysISO, todayISO } from './dates'
import { mutate } from './ops'
import { canEditProject, roleOf } from './sharing'
import { countedTasks, overdueOf, type StatsInput } from './stats'
import { MethodRules, waitingTasks, type MethodInput } from './method/rules'
import { qualifies } from './triage'
import type { Membership, Project, Review, Task } from './types'
import { isSomeday } from './views'
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

/** Whether the Daily check is due: not done on the user's local date. */
export function dailyDue(dailyAt: number | null | undefined, today: string): boolean {
  return !dailyAt || todayISO(new Date(dailyAt)) !== today
}

/** When the last review was, in words: "today", "yesterday", "9 days ago" or "never". */
export function reviewAgo(completedAt: number | null | undefined, now = Date.now()): string {
  if (!completedAt) return t('never')
  const day = (ms: number) => { const d = new Date(ms); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) }
  const days = Math.max(0, Math.round((day(now) - day(completedAt)) / DAY_MS))
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
