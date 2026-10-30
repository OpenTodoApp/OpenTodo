// Today's closed list on screen (OpenSpec change today-closed-list): the slots and the
// waiting tasks derived from local rows every time Today renders (D1), and the Done
// today group (D6). No write; Take a slot is the only one, in lib/closedListPrefs.
import { useEffect, useMemo } from 'react'
import { publishClosedList } from './slotActions'
import { takenSlots, type SlotFill } from '../../lib/closedList'
import { doneTodayShown, todaySlots } from '../../lib/closedListPrefs'
import { completedOn } from '../../lib/dayLists'
import { t } from '../../lib/i18n'
import { useReviewRow, useUserPrefsRow } from '../../lib/localData'
import type { FlowView } from '../../lib/useFlow'
import type { Review, Task } from '../../lib/types'

export interface ClosedList {
  /** The fill of Today's slots (limit 0 = off). */
  fill: SlotFill
  /** The ids let in with Take a slot today. */
  taken: readonly string[]
  /** Waiting ids, for row menus. */
  waitingIds: ReadonlySet<string>
  review: Review | null | undefined
  /** Tasks completed during the logical today, newest first; null while the group is hidden. */
  doneToday: Task[] | null
}

/** Today's lead line while a limit is on (D1, D6): "3 of 5", with "· 4 done" while Done today is shown; null when off. */
export function closedListMeta(c: Pick<ClosedList, 'fill' | 'doneToday'>): string | null {
  if (!c.fill.limit) return null
  const used = t('{used} of {limit}', { used: c.fill.slots.length, limit: c.fill.limit })
  return c.doneToday ? `${used} · ${t('{n, plural, one {# done} other {# done}}', { n: c.doneToday.length })}` : used
}

const NONE: SlotFill = { limit: 0, slots: [], waiting: [], chosen: 0 }

/**
 * `todayTasks` is Today's list before any per-device filter, `allTasks` every live
 * task. Off Today (`on` false) it is the empty fill.
 */
export function useClosedList(on: boolean, todayTasks: readonly Task[], allTasks: readonly Task[], today: string, flow: FlowView, blocked: { has(id: string): boolean }): ClosedList {
  const prefs = useUserPrefsRow()
  const review = useReviewRow()
  const limit = prefs?.today_limit
  const fill = useMemo(() => (on
    ? todaySlots(todayTasks, today, { today_limit: limit }, review, (id) => flow.state.available(id) && !blocked.has(id))
    : NONE), [on, todayTasks, today, limit, review, flow, blocked])
  const taken = useMemo(() => takenSlots(review, today), [review, today])
  const waitingIds = useMemo(() => new Set(fill.waiting), [fill])
  const shown = on && doneTodayShown(prefs)
  const doneToday = useMemo(() => (shown ? completedOn(allTasks, today) : null), [shown, allTasks, today])
  const list = useMemo(() => ({ fill, taken, waitingIds, review, doneToday }), [fill, taken, waitingIds, review, doneToday])
  // The row action, the Actions menu and the palette read Today's slots from here (slotActions).
  useEffect(() => {
    if (!on || !fill.limit) return
    publishClosedList({ list, today })
    return () => publishClosedList(null)
  }, [on, fill.limit, list, today])
  return list
}
