// The closed list's preferences and its one personal choice (OpenSpec change
// today-closed-list, design D3, D5): the Today limit and the Done today group on the
// user_prefs row, the taken slots on the review row. Reads never write; every write
// is one synced op through mutate(), offline included.
import { overdueInToday } from './views'
import { localDueOf } from './dates'
import { fillSlots, giveBackSlotList, readTodayLimit, takeSlotList, takenSlots, TODAY_LIMIT_MAX, type SlotFill, type SlotTask } from './closedList'
import { readMethodMode } from './method/mode'
import { mutate } from './ops'
import type { Review, Task, UserPrefs } from './types'
import { USER_PREFS_ID } from './userPrefs'

/** The personal review row's id (the same row as today's focus). */
const REVIEW_ID = 'me'

/**
 * Whether Today ends with the Done today group (D5): the stored choice, else shown in
 * the method modes (companion, first) and hidden in Simple lists. Nothing is written.
 */
export function doneTodayShown(prefs: Partial<UserPrefs> | null | undefined): boolean {
  const v = prefs?.today_done
  if (v === 'shown') return true
  if (v === 'hidden') return false
  return readMethodMode(prefs) !== 'lists'
}

/** Sets the Today limit (0 = off); refuses anything but a whole number from 0 to 20. */
export function setTodayLimit(limit: number): Promise<void> {
  if (!Number.isInteger(limit) || limit < 0 || limit > TODAY_LIMIT_MAX) return Promise.reject(new Error('today limit out of range'))
  return mutate('user_prefs', USER_PREFS_ID, { today_limit: limit })
}

/** Shows or hides the Done today group on every device of the account. */
export function setDoneTodayShown(shown: boolean): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { today_done: shown ? 'shown' : 'hidden' })
}

/** Whether Today's overflow menu offers the closed list (D5): the method modes, or once a limit is set. */
export function closedListOffered(prefs: Partial<UserPrefs> | null | undefined): boolean {
  return readMethodMode(prefs) !== 'lists' || readTodayLimit(prefs?.today_limit) > 0
}

/** One of Today's tasks as the slot rule reads it. */
export function slotTaskOf(task: Task, today: string, blocked: { has(id: string): boolean }): SlotTask {
  return {
    id: task.id, created_at: task.created_at, earlier: overdueInToday(task, today),
    due: task.due ? localDueOf(task.due).date : (task.deadline ?? null), habit: !!task.habit, blocked: blocked.has(task.id),
  }
}

/**
 * Today's slots from its open tasks (D1, D2): `available` is the project-flow rule
 * (a task held in sequence or blocked never counts).
 */
export function todaySlots(tasks: readonly Task[], today: string, prefs: Partial<UserPrefs> | null | undefined, review: Review | null | undefined,
  available: (id: string) => boolean): SlotFill {
  return fillSlots({ tasks: tasks.map((t) => slotTaskOf(t, today, { has: (id) => !available(id) })), limit: prefs?.today_limit, today, review }, (t) => !t.blocked)
}

/** Take a slot (D3): lets a waiting task in for the logical day; 'full' writes nothing. */
export async function takeSlot(review: Review | null | undefined, today: string, fill: SlotFill, id: string): Promise<'taken' | 'full'> {
  const next = takeSlotList(fill, takenSlots(review, today), id)
  if (next === 'full') return 'full'
  await mutate('review', REVIEW_ID, { slots_date: today, slots: next.join(',') })
  return 'taken'
}

/** Give back the slot: the task goes back to the usual fill order. */
export async function giveBackSlot(review: Review | null | undefined, today: string, id: string): Promise<void> {
  await mutate('review', REVIEW_ID, { slots_date: today, slots: giveBackSlotList(takenSlots(review, today), id).join(',') })
}
