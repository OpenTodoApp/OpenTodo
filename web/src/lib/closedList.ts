// Today's closed list (OpenSpec change today-closed-list): an optional limit on how
// many of Today's available tasks it lists, filled first come, first served (D2),
// the rest waiting for a slot. Pure functions over local rows: the slots are derived
// every time Today renders, never stored (D1); the only write is Take a slot, a
// personal list of ids for the logical day on the review row (D3).
//
// The Go twin is internal/closedlist; both evaluate web/src/lib/closedList.vectors.json
// and must agree. Change them together.
import type { Review, UserPrefs } from './types'

/** The largest limit (and the most ids a taken list keeps). */
export const TODAY_LIMIT_MAX = 20
/** The limit choices of Settings (Custom takes any whole number from 1 to 20). */
export const TODAY_LIMIT_CHOICES = [3, 5, 7, 10] as const

/** The limit as stored: 0 (off) for a missing, non-integer or out-of-range value; the stored value is never rewritten. */
export function readTodayLimit(raw: unknown): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= TODAY_LIMIT_MAX ? raw : 0
}

/** The account's limit, 0 when off. */
export function todayLimitOf(prefs: Pick<UserPrefs, 'today_limit'> | null | undefined): number {
  return readTodayLimit(prefs?.today_limit)
}

/** A comma-separated id list of `date`, or none when it was chosen on another day. */
function idsOf(list: string | undefined, date: string | undefined, today: string): string[] {
  if (!list || date !== today) return []
  return list.split(',').map((s) => s.trim()).filter(Boolean)
}

/** The ids let in with Take a slot today, in the order taken (another day's list reads as empty). */
export function takenSlots(review: Pick<Review, 'slots' | 'slots_date'> | null | undefined, today: string): string[] {
  return idsOf(review?.slots, review?.slots_date, today)
}

/** One of Today's open tasks as the rule reads it. */
export interface SlotTask {
  id: string
  created_at: number
  /** In Today's Earlier group (overdue, or a passed deadline). */
  earlier?: boolean
  /** The date Earlier sorts by (the due date, else the deadline), YYYY-MM-DD. */
  due?: string | null
  /** A habit never takes a slot (D4). */
  habit?: boolean
  /** Blocked by an open task: the fallback rule when no availability predicate is given. */
  blocked?: boolean
}

export interface SlotInput {
  /** Today's open tasks, in any order. */
  tasks: readonly SlotTask[]
  /** The stored limit (read with readTodayLimit). */
  limit: unknown
  /** The logical today, YYYY-MM-DD. */
  today: string
  review?: Pick<Review, 'focus' | 'focus_date' | 'slots' | 'slots_date'> | null
}

export interface SlotFill {
  /** 0 when the limit is off. */
  limit: number
  /** The tasks in the slots, in fill order. */
  slots: string[]
  /** The tasks waiting for a slot, in fill order (the first comes in next). */
  waiting: string[]
  /** How many slots hold a focus or taken task (Take a slot is refused when it equals the limit). */
  chosen: number
}

/** The fallback rule (D7, project-flow-modes not wired): available means not blocked. */
export const notBlocked = (t: SlotTask): boolean => !t.blocked

const byCreation = (a: SlotTask, b: SlotTask) => a.created_at - b.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const byDue = (a: SlotTask, b: SlotTask) => {
  const ad = a.due ?? ''
  const bd = b.due ?? ''
  return ad < bd ? -1 : ad > bd ? 1 : byCreation(a, b)
}

/**
 * Fills Today's slots (D2): today's focus, then the taken tasks in the order taken,
 * then Earlier oldest due first, then the rest oldest created first, ties by id. Only
 * available tasks count; habits never do. With the limit off every counted task is in
 * the slots and none waits.
 */
export function fillSlots(input: SlotInput, available: (t: SlotTask) => boolean = notBlocked): SlotFill {
  const limit = readTodayLimit(input.limit)
  const counted = input.tasks.filter((t) => !t.habit && available(t))
  const byId = new Map(counted.map((t) => [t.id, t]))
  const order: string[] = []
  const seen = new Set<string>()
  const push = (id: string) => { if (byId.has(id) && !seen.has(id)) { seen.add(id); order.push(id) } }
  idsOf(input.review?.focus, input.review?.focus_date, input.today).forEach(push)
  idsOf(input.review?.slots, input.review?.slots_date, input.today).forEach(push)
  const chosen = order.length
  counted.filter((t) => t.earlier && !seen.has(t.id)).sort(byDue).forEach((t) => push(t.id))
  counted.filter((t) => !seen.has(t.id)).sort(byCreation).forEach((t) => push(t.id))
  if (!limit) return { limit: 0, slots: order, waiting: [], chosen: 0 }
  return { limit, slots: order.slice(0, limit), waiting: order.slice(limit), chosen: Math.min(chosen, limit) }
}

/**
 * The taken list after Take a slot for `id` (D3), or 'full' when every slot already
 * holds a focus or taken task. Ids that no longer count are dropped; at most twenty.
 */
export function takeSlotList(fill: SlotFill, taken: readonly string[], id: string): string[] | 'full' {
  if (fill.limit && fill.chosen >= fill.limit) return 'full'
  const live = new Set([...fill.slots, ...fill.waiting])
  const kept = taken.filter((x) => x !== id && live.has(x))
  return [...kept, id].slice(-TODAY_LIMIT_MAX)
}

/** The taken list after Give back the slot for `id`. */
export function giveBackSlotList(taken: readonly string[], id: string): string[] {
  return taken.filter((x) => x !== id)
}
