// Set today's focus to a list of tasks (OpenSpec change routines-engine, the Set
// today's focus step): the rules of the Daily check (focusEdit.ts, bento.ts) for
// a whole list at once. Three tasks keeps the first three open ones; Bento places
// them by estimate, then in the first free slot, and leaves out what finds no
// slot. internal/ruleval/focus.go is the same; both run focusSet.vectors.json.
import { bentoList, readBento, readBentoOrder, readFocusStyle, slotOrder } from './bento'
import { FOCUS_MAX } from './review'
import type { Task, UserPrefs } from './types'

export interface FocusPatch {
  focus_date: string
  focus: string
  /** Bento only: the slots ("L:<id>,M:<id>"); absent for Three tasks. */
  focus_slots?: string
}

/** The review fields that set today's focus to `ids` (open, live tasks only, in order). */
export function planSetFocus(ids: readonly string[], tasks: readonly Pick<Task, 'id' | 'estimate_minutes' | 'completed_at' | 'deleted_at'>[], prefs: Partial<UserPrefs> | null | undefined, today: string): FocusPatch {
  const byId = new Map(tasks.map((x) => [x.id, x]))
  const open = [...new Set(ids)].filter((id) => { const x = byId.get(id); return !!x && !x.completed_at && !x.deleted_at })
  if (readFocusStyle(prefs) !== 'bento') return { focus_date: today, focus: open.slice(0, FOCUS_MAX).join(',') }
  const read = readBento({ focus: open.join(','), focus_date: today, focus_slots: '' }, today, open.map((id) => byId.get(id) as Task))
  const order = readBentoOrder(prefs)
  const placed = { ...read, unsized: [] }
  return {
    focus_date: today,
    focus: bentoList(placed, order).map((x) => x.id).join(','),
    focus_slots: slotOrder(order).flatMap((s) => (placed.slots[s] ? [`${s}:${placed.slots[s]!.id}`] : [])).join(','),
  }
}
