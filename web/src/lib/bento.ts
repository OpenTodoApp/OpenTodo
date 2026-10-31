// Bento in the Daily check (OpenSpec change bento-daily-check): today's focus as
// a Large, a Medium and a Small slot. The plain id list `review.focus` stays what
// older clients read; `review.focus_slots` ("L:<id>,M:<id>,S:<id>") sits beside it,
// written in the same batch (design D3). This module reads: the preferences, the
// reconciled slots and the order every screen lists the focus in; reading never
// writes. Changing a Bento is lib/bentoSlots.ts, loaded with the Daily check.
import { storedFocus } from './review'
import type { Review, Task, UserPrefs } from './types'
import { USER_PREFS_ID } from './userPrefs'
import { mutate } from './ops'

export type BentoSlot = 'L' | 'M' | 'S'
/** Frog order: the order of the first free slot when an estimate decides nothing. */
export const BENTO_SLOTS: readonly BentoSlot[] = ['L', 'M', 'S']
export type FocusStyle = 'three' | 'bento'
export type BentoOrder = 'frog' | 'summit'

/** Small up to 30 minutes, Medium 31 to 89, Large 90 or more (D2). */
export const SMALL_MAX = 30
export const LARGE_MIN = 90

/** The slot an estimate suggests; null without a usable estimate. */
export function bentoSize(estimate: number | null | undefined): BentoSlot | null {
  if (typeof estimate !== 'number' || !Number.isFinite(estimate) || estimate <= 0) return null
  if (estimate <= SMALL_MAX) return 'S'
  return estimate >= LARGE_MIN ? 'L' : 'M'
}

/** The focus style; '' and unknown values read as Three tasks and are kept. */
export function readFocusStyle(prefs: Partial<UserPrefs> | null | undefined): FocusStyle {
  return prefs?.focus_style === 'bento' ? 'bento' : 'three'
}

/** The Bento order; '' and unknown values read as Frog and are kept. */
export function readBentoOrder(prefs: Partial<UserPrefs> | null | undefined): BentoOrder {
  return prefs?.bento_order === 'summit' ? 'summit' : 'frog'
}

/** The slots in listing order: Frog Large, Medium, Small; Summit Medium, Large, Small (D6). */
export function slotOrder(order: BentoOrder): BentoSlot[] {
  return order === 'summit' ? ['M', 'L', 'S'] : ['L', 'M', 'S']
}

/** The stored `focus_slots` entries in stored order; malformed entries are ignored. */
export function parseFocusSlots(raw: string | null | undefined): { slot: BentoSlot; id: string }[] {
  return (raw ?? '').split(',').flatMap((part) => {
    const m = /^\s*([LMS]):(.+?)\s*$/.exec(part)
    return m ? [{ slot: m[1] as BentoSlot, id: m[2] }] : []
  })
}

export interface BentoRead {
  slots: Record<BentoSlot, Task | null>
  /** Focused tasks no slot holds, in focus order (listed after the slots). */
  unsized: Task[]
}

type ReviewFocus = Pick<Review, 'focus' | 'focus_date'> & Partial<Pick<Review, 'focus_slots'>>

/**
 * Today's Bento from the review row (D3), writing nothing. Only ids of today's
 * `focus` found in `tasks` count. A `focus_slots` entry counts for such an id;
 * the rest take the slot their estimate suggests when free, then the first free
 * slot in Frog order, else they are Not sized.
 */
export function readBento(review: ReviewFocus | null | undefined, today: string, tasks: readonly Task[]): BentoRead {
  const byId = new Map(tasks.map((x) => [x.id, x]))
  const ids = [...new Set(storedFocus(review, today))].filter((id) => byId.has(id))
  const slots: Record<BentoSlot, Task | null> = { L: null, M: null, S: null }
  const placed = new Set<string>()
  const put = (slot: BentoSlot, id: string) => { slots[slot] = byId.get(id)!; placed.add(id) }
  const inFocus = new Set(ids)
  for (const e of parseFocusSlots(review?.focus_slots)) {
    if (inFocus.has(e.id) && !placed.has(e.id) && !slots[e.slot]) put(e.slot, e.id)
  }
  for (const id of ids) {
    if (placed.has(id)) continue
    const size = bentoSize(byId.get(id)!.estimate_minutes)
    if (size && !slots[size]) put(size, id)
  }
  for (const id of ids) {
    if (placed.has(id)) continue
    const free = BENTO_SLOTS.find((s) => !slots[s])
    if (free) put(free, id)
  }
  return { slots, unsized: ids.filter((id) => !placed.has(id)).map((id) => byId.get(id)!) }
}

/** The Bento's tasks in listing order: the slots by `order`, then Not sized. */
export function bentoList(read: BentoRead, order: BentoOrder): Task[] {
  return [...slotOrder(order).map((s) => read.slots[s]).filter((x): x is Task => !!x), ...read.unsized]
}

/**
 * Today's focus ids in the order every screen lists them (D6): in Bento the slot
 * order, else the stored order, unchanged. `tasks` are the rows the caller lists
 * from (the Loop home keeps completed ones); in Bento ids without a row are left out.
 */
export function orderedFocusIds(review: ReviewFocus | null | undefined, prefs: Partial<UserPrefs> | null | undefined, today: string, tasks: readonly Task[]): string[] {
  if (readFocusStyle(prefs) !== 'bento') return storedFocus(review, today)
  return bentoList(readBento(review, today, tasks), readBentoOrder(prefs)).map((x) => x.id)
}

/** Sets the focus style for the account: one synced op; the focus itself is not touched. */
export function setFocusStyle(style: FocusStyle): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { focus_style: style === 'bento' ? 'bento' : 'three' })
}

/** Sets the Bento order for the account: one synced op. */
export function setBentoOrder(order: BentoOrder): Promise<void> {
  return mutate('user_prefs', USER_PREFS_ID, { bento_order: order })
}
