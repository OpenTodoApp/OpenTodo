// Re-plan the rest of the day (OpenSpec change replan-the-day, design D1 and D2): which
// of today's timed blocks were missed, and a deterministic first-fit proposal that
// moves them, in their original order, into the free time between now and the grid's
// end. Pure functions: the clock, the preferences, the permissions and the events are
// inputs, so every device computes the same proposal and tests pin the clock.
import { blockFor, DEFAULT_BLOCK_MINUTES, eventBlocks, formatTime, SLOT_MINUTES } from './calendar'
import { addDaysISO, dueFromView } from './dates'
import type { Change } from './ops'
import { canEditTask } from './sharing'
import type { CalendarEvent, Due, Membership, Project, Task } from './types'

export interface ReplanTasksInput {
  /** The logical today (date-time-preferences "Logical today"). */
  today: string
  /** Minutes since the logical today's midnight; past 24:00 while the day start is after midnight. */
  now: number
  /** Live tasks with their due in the viewer's zone (viewedTask). */
  tasks: readonly Task[]
  projects: readonly Pick<Project, 'id' | 'archived'>[]
  memberships: Map<string, Membership>
  /** The signed-in account, or null (then no assignee is "another member"). */
  me: string | null
  /** The task of the user's running time entry, never moved. */
  runningTaskId: string | null
}

export interface ReplanInput extends ReplanTasksInput {
  /** The device's grid end hour (time-blocking "Grid preferences"). */
  endHour: number
  /** Events drawn on this device (enabled subscriptions, Calendars toggle on); empty when hidden or unknown. */
  events: readonly CalendarEvent[]
  zone?: string
}

export interface MissedBlock {
  id: string
  /** The block's start, minutes from midnight. */
  start: number
  /** Its estimate, or the 30-minute default. */
  length: number
  priority: number
}

export interface ReplanMove extends MissedBlock {
  /** The proposed start, minutes from midnight of the logical today. */
  to: number
}

export interface ReplanProposal {
  moves: ReplanMove[]
  /** Missed blocks that find no free interval before the grid end, in packing order. */
  unfit: MissedBlock[]
}

const lengthOf = (task: Pick<Task, 'estimate_minutes'>): number => (task.estimate_minutes && task.estimate_minutes > 0 ? task.estimate_minutes : DEFAULT_BLOCK_MINUTES)

/** Open, live tasks due today with a time, outside archived projects: the blocks the grid draws today. */
function todayBlocks(input: Pick<ReplanTasksInput, 'tasks' | 'projects' | 'today'>): Task[] {
  const archived = new Set(input.projects.filter((p) => p.archived).map((p) => p.id))
  return input.tasks.filter((tk) => !tk.deleted_at && !tk.completed_at && tk.due?.date === input.today && !!tk.due.time
    && !(tk.project_id && archived.has(tk.project_id)) && blockFor(tk) !== null)
}

/** Whether a block may be moved by this person (design D1): editable, not someone else's, not being worked on. */
function movable(tk: Task, input: ReplanTasksInput): boolean {
  if (!canEditTask(tk, input.memberships)) return false
  if (tk.project_id && input.memberships.has(tk.project_id) && tk.assignee_id && tk.assignee_id !== input.me) return false
  return tk.id !== input.runningTaskId
}

/** Sorted by original due time, then priority (1 first), then task id. */
function byPlan(a: MissedBlock, b: MissedBlock): number {
  return a.start - b.start || a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * Today's missed blocks: open timed tasks whose block (start plus estimate, or plus
 * 30 minutes) ended at or before now, that the person may move. A block still running
 * is in progress, not missed.
 */
export function missedBlocks(input: ReplanTasksInput): MissedBlock[] {
  const out: MissedBlock[] = []
  for (const tk of todayBlocks(input)) {
    const b = blockFor(tk)!
    const length = lengthOf(tk)
    if (b.start + length > input.now || !movable(tk, input)) continue
    out.push({ id: tk.id, start: b.start, length, priority: tk.priority })
  }
  return out.sort(byPlan)
}

interface Interval { start: number; end: number }

/**
 * The proposal (design D2): from now rounded up to the next 15-minute mark to the grid
 * end, each missed block in plan order takes the first interval on a 15-minute mark
 * that holds its whole length around other open timed blocks of today and busy timed
 * events; the interval then becomes busy. Blocks that find none are unfit.
 */
export function replan(input: ReplanInput): ReplanProposal {
  const missed = missedBlocks(input)
  const missedIds = new Set(missed.map((m) => m.id))
  const start = Math.ceil(input.now / SLOT_MINUTES) * SLOT_MINUTES
  const end = input.endHour * 60
  const busy: Interval[] = []
  for (const tk of todayBlocks(input)) {
    if (missedIds.has(tk.id)) continue
    const b = blockFor(tk)!
    busy.push({ start: b.start, end: b.start + lengthOf(tk) })
  }
  // Free and all-day events are not obstacles; zero-length events take no time.
  const timed = input.events.filter((ev) => !ev.free && !ev.allDay && !(ev.start.date === ev.end.date && ev.start.time === ev.end.time && ev.start.tz === ev.end.tz))
  for (const ev of eventBlocks(timed, input.today, input.zone)) busy.push({ start: ev.start, end: ev.end })

  const moves: ReplanMove[] = []
  const unfit: MissedBlock[] = []
  for (const m of missed) {
    const at = firstFit(busy, start, end, m.length)
    if (at === null) { unfit.push(m); continue }
    busy.push({ start: at, end: at + m.length })
    moves.push({ ...m, to: at })
  }
  return { moves, unfit }
}

/** The first start on a 15-minute mark at or after `from` where `length` fits before `end` without touching a busy interval. */
function firstFit(busy: readonly Interval[], from: number, end: number, length: number): number | null {
  let at = from
  while (at + length <= end) {
    let clash = -1
    for (const b of busy) if (b.start < at + length && b.end > at) clash = Math.max(clash, b.end)
    if (clash < 0) return at
    at = Math.ceil(clash / SLOT_MINUTES) * SLOT_MINUTES
  }
  return null
}

/** What happens to the blocks that do not fit (design D4): left where they are (default) or moved to tomorrow. */
export type UnfitChoice = 'leave' | 'tomorrow'

/** Whether moving a task to tomorrow puts it after its deadline day. */
export function afterDeadline(task: Pick<Task, 'deadline'> | undefined, today: string): boolean {
  return !!task?.deadline && task.deadline < addDaysISO(today, 1)
}

/**
 * The batch of a re-plan (design D4): one `due` edit per move, and with "Move to
 * tomorrow" one per unfit task (the next logical day, the same time). Each due is
 * written in the task's own zone as a drag writes it. `stored` holds the due values
 * the preview was computed from; a task whose live row is no longer open, no longer
 * editable or whose due changed since is skipped and counted.
 */
export function replanChanges(proposal: ReplanProposal, opts: {
  today: string
  choice: UnfitChoice
  /** The due each task had when the preview was shown (stored form, its own zone). */
  stored: ReadonlyMap<string, Due | null>
  /** The live rows right before writing. */
  live: ReadonlyMap<string, Task>
  memberships: Map<string, Membership>
  zone?: string
}): { changes: Change[]; skipped: number } {
  const changes: Change[] = []
  let skipped = 0
  const write = (id: string, date: string, minutes: number) => {
    const row = opts.live.get(id)
    if (!row || row.deleted_at || row.completed_at || !canEditTask(row, opts.memberships) || !sameDue(row.due, opts.stored.get(id))) { skipped++; return }
    changes.push({ entity: 'task', entityId: id, patch: { due: dueFromView(row.due, { date, time: formatTime(minutes) }, opts.zone) } })
  }
  for (const m of proposal.moves) write(m.id, opts.today, m.to)
  if (opts.choice === 'tomorrow') for (const u of proposal.unfit) write(u.id, addDaysISO(opts.today, 1), u.start)
  return { changes, skipped }
}

function sameDue(a: Due | null | undefined, b: Due | null | undefined): boolean {
  return (a?.date ?? null) === (b?.date ?? null) && (a?.time ?? null) === (b?.time ?? null) && (a?.tz ?? null) === (b?.tz ?? null)
}
