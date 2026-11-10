// Close the day's screen logic (OpenSpec changes close-the-day, close-the-day-v2 and
// close-the-day-redesign): the steps, the day's figures, the carry-over decisions,
// tomorrow's first thing and the one close batch. Loaded with the screen only; what
// Today, the sidebar and Reopen need (the stamp, the record, Reopen) is lib/review.ts.
import { mergeChanges, planComplete, planDue, toProposed } from './bulk'
import { todayList } from './dayLists'
import { addDaysISO, currentDayStart, localDueOf, logicalDay } from './dates'
import { db, type AssistantUndo } from './db'
import { msg, t, translatedMap } from './i18n'
import type { MethodInput } from './method/rules'
import type { Change } from './ops'
import { carryOverOf, FOCUS_MAX, REVIEW_ID, storedFocus, TOMORROW_NOTE_MAX, type CarryOverItem, type CarryOverRecord, type FocusBefore } from './review'
import { canEditTasks, membershipMap, roleOf } from './sharing'
import { compute, countedTasks, sharedIds } from './stats'
import type { Membership, Review, Task } from './types'
import { applyBatch } from './undo'
import { isStarted } from './views'

export type CloseStepId = 'done' | 'moves' | 'first'
export const CLOSE_STEP_IDS: readonly CloseStepId[] = ['done', 'moves', 'first']
export const CLOSE_STEP_TITLES = translatedMap<CloseStepId>({ done: msg('What got done'), moves: msg('What moves'), first: msg('Tomorrow’s first thing') })
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
  /** Those tasks, in completion order. */
  completed: Task[]
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
  const statsInput = { tasks: input.tasks, projects: input.projects, shared: sharedIds([...memberships.values()]), me: input.me, today }
  const stats = compute(statsInput, { start: today, end: today }, weekStart)
  const done = stats.perDay.find((d) => d.date === today)?.count ?? 0
  // The rows behind that count (Statistics' own selection), in completion order.
  const completed = countedTasks(statsInput)
    .filter((x) => x.completed_at && logicalDay(x.completed_at, currentDayStart()) === today)
    .sort((a, b) => (a.completed_at ?? 0) - (b.completed_at ?? 0))
  const byId = new Map(input.tasks.filter((x) => !x.deleted_at).map((x) => [x.id, x]))
  const focus = storedFocus(review, today).map((id) => byId.get(id)).filter((x): x is Task => !!x)
  return { planned: unfinished.length + done, done, completed, focusDone: focus.filter((x) => x.completed_at).length, focusTotal: focus.length, unfinished }
}

/** One carry-over decision: device state until the day is closed (close-the-day-redesign D5). */
export type CarryDecision = { kind: 'tomorrow' } | { kind: 'day'; date: string } | { kind: 'someday' } | { kind: 'keep' } | { kind: 'done' }

/**
 * The carry-over as one list of changes (weekly-review "Carry-over is one batch"):
 * Tomorrow and a day are the bulk reschedule (a time of day kept, a parked task
 * un-parked), and a task in Today only because its start date came gets its start
 * cleared so it leaves Today; Someday is the patch parking writes; Done already is
 * the bulk complete (a series rolls, subtasks complete; `all` is every task, for
 * them); Keep writes nothing. Read-only tasks write nothing whatever their decision.
 */
export function planCarryOver(
  decisions: ReadonlyMap<string, CarryDecision>, tasks: readonly CarryTask[], today: string, all: Task[] = tasks.map((x) => x.task), now = Date.now(),
  memberships?: Map<string, Membership>,
): Change[] {
  const out: Change[] = []
  for (const { task, editable } of tasks) {
    const d = decisions.get(task.id) ?? { kind: 'tomorrow' }
    if (!editable || d.kind === 'keep') continue
    if (d.kind === 'done') {
      out.push(...planComplete([task], all, now, today, memberships))
      continue
    }
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

/** The decision of a row: the chosen one, else Tomorrow; Keep for a task the user may not edit. */
export function decisionOf(decisions: ReadonlyMap<string, CarryDecision>, x: CarryTask): CarryDecision {
  return x.editable ? decisions.get(x.task.id) ?? { kind: 'tomorrow' } : { kind: 'keep' }
}

/** What a close carried, by decision. */
export type Carried = Record<CarryDecision['kind'], number>

/** The rows' decisions counted; read-only rows count as kept. */
export function carriedOf(decisions: ReadonlyMap<string, CarryDecision>, tasks: readonly CarryTask[]): Carried {
  const out: Carried = { tomorrow: 0, day: 0, someday: 0, keep: 0, done: 0 }
  for (const x of tasks) out[decisionOf(decisions, x).kind]++
  return out
}

/**
 * Tomorrow's tasks as the last step offers them (weekly-review "Tomorrow's first
 * thing"): due on the day after `day` once tonight's decisions are applied, in the
 * order Today will list them that day.
 */
export function tomorrowsTasks(decisions: ReadonlyMap<string, CarryDecision>, tasks: readonly CarryTask[], day: string, all: readonly Task[]): Task[] {
  const next = addDaysISO(day, 1)
  const patched = new Map(planCarryOver(decisions, tasks, day, [...all]).map((c) => [c.entityId, c.patch]))
  const after = all.filter((x) => !x.deleted_at && !x.skipped).map((x) => (patched.has(x.id) ? { ...x, ...patched.get(x.id) } as Task : x))
  return todayList(after, next).filter((x) => x.due && localDueOf(x.due).date === next)
}

/**
 * The focus a close writes for tomorrow's first thing (close-the-day-redesign D4):
 * the task alone for a day with no focus yet; first in a focus already chosen for
 * that day, keeping at most three.
 */
export function seedFocus(review: Partial<FocusBefore> | null | undefined, next: string, id: string): Partial<FocusBefore> {
  if (review?.focus_date !== next) return { focus_date: next, focus: id, focus_slots: '' }
  const rest = (review.focus ?? '').split(',').map((s) => s.trim()).filter((x) => x && x !== id)
  return { focus: [id, ...rest].slice(0, FOCUS_MAX).join(',') }
}

export interface CloseInput {
  decisions: ReadonlyMap<string, CarryDecision>
  tasks: readonly CarryTask[]
  /** The day being closed. */
  day: string
  note: string
  /** Tomorrow's first thing: a task id, or null for none. */
  first: string | null
  /** Every task, for Done already (series and subtasks). */
  all?: Task[]
  now?: number
}

export interface CloseResult {
  entry: AssistantUndo | null
  label: string
  carried: Carried
}

/** The toast of a close: "Day closed · 3 moved to tomorrow", "Day closed · 2 tasks carried over" or "Day closed". */
export function closeLabel(carried: Carried): string {
  const moved = carried.tomorrow + carried.day + carried.someday + carried.done
  if (!moved) return t('Day closed')
  if (moved === carried.tomorrow) return t('Day closed · {n} moved to tomorrow', { n: moved })
  return t('{n, plural, one {Day closed · # task carried over} other {Day closed · # tasks carried over}}', { n: moved })
}

/**
 * Closes the day (weekly-review "Carry-over is one batch", "Closing the day"): ONE
 * undoable batch through the bulk path with the carry-over's task changes, tomorrow's
 * focus, the stamp, the note and the record of what changed. Undo is Reopen in one
 * step: every field goes back unless changed since, except the note, which is kept
 * for the next close. A record of the same day is extended, not replaced: a field
 * changed by both closes keeps its value before the first and after the latest.
 */
export async function closeTheDay(input: CloseInput): Promise<CloseResult> {
  const { decisions, tasks, day, first } = input
  const now = input.now ?? Date.now()
  const changes = planCarryOver(decisions, tasks, day, input.all, now, await membershipMap())
  const carried = carriedOf(decisions, tasks)
  // A decision that wrote nothing (a task already as it would be) counts as kept.
  for (const x of tasks) {
    const k = decisionOf(decisions, x).kind
    if (k !== 'keep' && !changes.some((c) => c.entityId === x.task.id)) { carried[k]--; carried.keep++ }
  }
  const proposed = await toProposed(changes)
  const items: CarryOverItem[] = proposed.flatMap((c) => Object.entries(c.patch).map(([field, after]) => ({ id: c.entityId, field, before: c.base?.[field] ?? null, after: after ?? null })))
  const current = await db.review.get(REVIEW_ID)
  const previous = carryOverOf(current)
  const same = previous?.date === day
  const record: CarryOverRecord = { date: day, items: same ? joinItems(previous!.items, items) : items }
  const before: FocusBefore = { focus_date: current?.focus_date ?? '', focus: current?.focus ?? '', focus_slots: current?.focus_slots ?? '' }
  const focus = first ? seedFocus(before, addDaysISO(day, 1), first) : {}
  if (same && previous!.focus) record.focus = previous!.focus
  else if (first) record.focus = before
  const patch: Record<string, unknown> = { ...focus, closed_at: now, closed_day: day, tomorrow_note: input.note.trim().slice(0, TOMORROW_NOTE_MAX), carry_over: JSON.stringify(record) }
  const base: Record<string, unknown> = { ...before, closed_at: current?.closed_at ?? 0, closed_day: current?.closed_day ?? '', tomorrow_note: current?.tomorrow_note ?? '', carry_over: current?.carry_over ?? '' }
  proposed.push({ entity: 'review', entityId: REVIEW_ID, patch, base: Object.fromEntries(Object.keys(patch).map((f) => [f, base[f]])) })
  const label = closeLabel(carried)
  const entry = await applyBatch(proposed, { source: 'bulk', label })
  if (!entry) return { entry, label, carried }
  // The note stays when the close is undone, as Reopen keeps it.
  const inverse = entry.inverse.map((inv) => (inv.entity === 'review' ? { ...inv, patch: Object.fromEntries(Object.entries(inv.patch).filter(([f]) => f !== 'tomorrow_note')) } : inv))
  const kept = { ...entry, inverse }
  await db.assistantUndo.put(kept)
  return { entry: kept, label, carried }
}

/** Two batches' items as one record: a field in both keeps the first value before and the latest value after. */
function joinItems(first: readonly CarryOverItem[], later: readonly CarryOverItem[]): CarryOverItem[] {
  const out = first.map((it) => ({ ...it }))
  for (const it of later) {
    const seen = out.find((x) => x.id === it.id && x.field === it.field)
    if (seen) seen.after = it.after
    else out.push(it)
  }
  return out
}
