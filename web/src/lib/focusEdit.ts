// Changing today's focus (OpenSpec change phone-touch-focus, design D2): the rules
// `f` follows in the Daily check, shared with the tap paths (an empty slot's picker,
// Add to focus, the task menus). Three tasks adds, removes and refuses a fourth;
// Bento places by estimate (bento-daily-check D5). Every write is one batch on the
// review row with Undo. Callers show the outcome: the Daily check in its status line,
// the menus and the picker in a toast.
import { readBento, readFocusStyle, readBentoOrder, type BentoSlot } from './bento'
import { logicalToday } from './dates'
import { db } from './db'
import { bentoPress, SLOT_NAMES, takenMessage, withPlaced, withRemoved, writeBento } from './bentoSlots'
import { t } from './i18n'
import { updateTask } from './ops'
import { FOCUS_MAX, focusTasks, REVIEW_ID, storedFocus } from './review'
import type { Review, Task, UserPrefs } from './types'
import { applyBatch } from './undo'
import { USER_PREFS_ID } from './userPrefs'

/** What the rules read: the review row, the preferences, the logical today and the tasks (at least the focused ones and the one pressed). */
export interface FocusContext {
  review: (Pick<Review, 'focus' | 'focus_date'> & Partial<Pick<Review, 'focus_slots'>>) | null | undefined
  prefs: Partial<UserPrefs> | null | undefined
  today: string
  tasks: readonly Task[]
}

/** The context for `ids` from the local rows (the menus): the focused tasks and the given ones. */
export async function readFocusContext(ids: readonly string[]): Promise<FocusContext> {
  const [review, prefs] = await Promise.all([db.review.get(REVIEW_ID), db.userPrefs.get(USER_PREFS_ID)])
  const today = logicalToday()
  const want = [...new Set([...storedFocus(review, today), ...ids])]
  const tasks = (await db.tasks.bulkGet(want)).filter((x): x is Task => !!x)
  return { review, prefs, today, tasks }
}

export type FocusOutcome =
  /** Written: the message and the Undo entry. */
  | { kind: 'done'; text: string; undoId: string | null }
  /** Nothing written: the message, and the task to offer Choose a slot for when a slot was taken. */
  | { kind: 'refused'; text: string; choose?: Task }
  /** Bento without a usable estimate: ask for a slot. */
  | { kind: 'choose'; task: Task }

const open = (tasks: readonly Task[]) => tasks.filter((x) => !x.completed_at && !x.deleted_at)
const leftText = (task: Task) => t('{title} left today’s focus.', { title: task.title })
const fullBento = () => t('Every slot is full. Take one out first.')

/** Today's Bento as the rules see it: completed and deleted tasks are out, without a write. */
export function bentoOf(ctx: FocusContext) {
  return readBento(ctx.review, ctx.today, open(ctx.tasks))
}

async function writeThree(ctx: FocusContext, ids: string[], text: string): Promise<FocusOutcome> {
  const entry = await applyBatch([{
    entity: 'review', entityId: REVIEW_ID,
    patch: { focus_date: ctx.today, focus: ids.join(',') },
    base: { focus: ctx.review?.focus ?? '', focus_date: ctx.review?.focus_date ?? '' },
  }], { source: 'action', label: text })
  return { kind: 'done', text, undoId: entry?.id ?? null }
}

async function writeSlots(ctx: FocusContext, next: ReturnType<typeof bentoOf>, text: string): Promise<FocusOutcome> {
  const entry = await writeBento(ctx.review, next, readBentoOrder(ctx.prefs), ctx.today, text)
  return { kind: 'done', text, undoId: entry?.id ?? null }
}

/** Puts `task` in `slot`; refused when the slot holds another task. */
export function placeFocus(ctx: FocusContext, task: Task, slot: BentoSlot): Promise<FocusOutcome> {
  const read = bentoOf(ctx)
  const next = withPlaced(read, task, slot)
  if (!next) return Promise.resolve({ kind: 'refused', text: takenMessage(slot, read.slots[slot]!), choose: task })
  return writeSlots(ctx, next, t('{title} is in the {slot} slot.', { title: task.title, slot: SLOT_NAMES[slot] }))
}

/** What `f` does on `task`: in or out of the focus by the style's rules. */
export async function pressFocus(ctx: FocusContext, task: Task): Promise<FocusOutcome> {
  if (readFocusStyle(ctx.prefs) !== 'bento') {
    const current = focusTasks(ctx.review, ctx.today, ctx.tasks).map((x) => x.id)
    if (current.includes(task.id)) return writeThree(ctx, current.filter((x) => x !== task.id), leftText(task))
    if (current.length >= FOCUS_MAX) return { kind: 'refused', text: t('Today’s focus holds {n} tasks. Take one out first.', { n: FOCUS_MAX }) }
    return writeThree(ctx, [...current, task.id], t('{title} is in today’s focus.', { title: task.title }))
  }
  const read = bentoOf(ctx)
  const press = bentoPress(read, task)
  switch (press.kind) {
    case 'remove': return writeSlots(ctx, withRemoved(read, task.id), leftText(task))
    case 'place': return placeFocus(ctx, task, press.slot)
    case 'taken': return { kind: 'refused', text: takenMessage(press.slot, press.occupant), choose: task }
    case 'choose': return { kind: 'choose', task }
    case 'full': return { kind: 'refused', text: fullBento() }
  }
}

/** Set estimate… (bento-daily-check D5): sets the estimate, then places the task by it. */
export async function estimateAndPlace(ctx: FocusContext, task: Task, minutes: number): Promise<FocusOutcome> {
  await updateTask(task.id, { estimate_minutes: minutes })
  const sized = { ...task, estimate_minutes: minutes }
  return pressFocus({ ...ctx, tasks: ctx.tasks.map((x) => (x.id === task.id ? sized : x)) }, sized)
}
