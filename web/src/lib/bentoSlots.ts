// Changing a Bento (OpenSpec change bento-daily-check, design D5): what `f` does,
// the slot names, and the one undoable batch on the review row. Only the Daily
// check uses it, so it loads with the review screens; the read every screen needs
// is lib/bento.ts.
import { msg, t, translatedMap } from './i18n'
import { REVIEW_ID } from './review'
import type { ProposedChange } from './assistantTypes'
import type { Review, Task } from './types'
import { applyBatch } from './undo'
import type { AssistantUndo } from './db'
import { BENTO_SLOTS, bentoList, bentoSize, slotOrder, type BentoOrder, type BentoRead, type BentoSlot } from './bento'

export const SLOT_NAMES = translatedMap<BentoSlot>({ L: msg('Large'), M: msg('Medium'), S: msg('Small') })
/** What an empty slot reads ("Large · 90 min or more"). */
export const SLOT_HINTS = translatedMap<BentoSlot>({ L: msg('Large · 90 min or more'), M: msg('Medium · 31 to 89 min'), S: msg('Small · up to 30 min') })

type ReviewFocus = Pick<Review, 'focus' | 'focus_date'> & Partial<Pick<Review, 'focus_slots'>>

/** The free slots in Frog order. */
export function freeSlots(read: BentoRead): BentoSlot[] {
  return BENTO_SLOTS.filter((s) => !read.slots[s])
}

/** The slot holding `id`, or null. */
export function slotOf(read: BentoRead, id: string): BentoSlot | null {
  return BENTO_SLOTS.find((s) => read.slots[s]?.id === id) ?? null
}

/** The review fields a Bento writes for `read`: focus in listing order, the slot entries, the date. */
export function bentoPatch(read: BentoRead, order: BentoOrder, today: string): { focus: string; focus_slots: string; focus_date: string } {
  return {
    focus_date: today,
    focus: bentoList(read, order).map((x) => x.id).join(','),
    focus_slots: slotOrder(order).flatMap((s) => (read.slots[s] ? [`${s}:${read.slots[s]!.id}`] : [])).join(','),
  }
}

/** `read` with `task` put in `slot` (taken out of any other first); null when the slot holds another task. */
export function withPlaced(read: BentoRead, task: Task, slot: BentoSlot): BentoRead | null {
  const occupant = read.slots[slot]
  if (occupant && occupant.id !== task.id) return null
  const slots = { ...read.slots }
  for (const s of BENTO_SLOTS) if (slots[s]?.id === task.id) slots[s] = null
  slots[slot] = task
  return { slots, unsized: read.unsized.filter((x) => x.id !== task.id) }
}

/** `read` without `id`, in a slot or Not sized. */
export function withRemoved(read: BentoRead, id: string): BentoRead {
  const slots = { ...read.slots }
  for (const s of BENTO_SLOTS) if (slots[s]?.id === id) slots[s] = null
  return { slots, unsized: read.unsized.filter((x) => x.id !== id) }
}

/** What `f` does on a task in Bento (D5), decided without writing. */
export type BentoPress =
  | { kind: 'remove' }
  | { kind: 'place'; slot: BentoSlot }
  | { kind: 'taken'; slot: BentoSlot; occupant: Task }
  | { kind: 'choose' }
  | { kind: 'full' }

export function bentoPress(read: BentoRead, task: Task): BentoPress {
  if (slotOf(read, task.id) || read.unsized.some((x) => x.id === task.id)) return { kind: 'remove' }
  if (freeSlots(read).length === 0) return { kind: 'full' }
  const size = bentoSize(task.estimate_minutes)
  if (!size) return { kind: 'choose' }
  const occupant = read.slots[size]
  return occupant ? { kind: 'taken', slot: size, occupant } : { kind: 'place', slot: size }
}

/** The one review change for an Undo batch: the three focus fields with their values before. */
export function bentoChange(review: ReviewFocus | null | undefined, patch: ReturnType<typeof bentoPatch>): ProposedChange {
  return {
    entity: 'review', entityId: REVIEW_ID, patch,
    base: { focus: review?.focus ?? '', focus_slots: review?.focus_slots ?? '', focus_date: review?.focus_date ?? '' },
  }
}

/** The occupied-slot message (D5): "Large holds Write the report." */
export function takenMessage(slot: BentoSlot, occupant: Task): string {
  return t('{slot} holds {title}.', { slot: SLOT_NAMES[slot], title: occupant.title })
}

/** Writes the Bento `next` as one undoable batch on the review row (D5); returns the Undo entry. */
export function writeBento(review: ReviewFocus | null | undefined, next: BentoRead, order: BentoOrder, today: string, label: string): Promise<AssistantUndo | null> {
  return applyBatch([bentoChange(review, bentoPatch(next, order, today))], { source: 'action', label })
}
