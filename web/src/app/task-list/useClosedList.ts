// Today's closed list on screen (OpenSpec change today-closed-list): the slots and the
// waiting tasks derived from local rows every time Today renders (D1), and the Done
// today group (D6). No write; Take a slot is the only one, in lib/closedListPrefs.
import { useEffect, useMemo, useRef, useState } from 'react'
import { publishClosedList } from './slotActions'
import { takenSlots, waitingNow, type SlotFill } from '../../lib/closedList'
import { currentDayStart, logicalDay, logicalToday, todayISO } from '../../lib/dates'
import { Derived, patchOrdered } from '../../lib/taskDelta'
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

const doneOn = (x: Task, today: string, dayStart: number) => x.completed_at !== null && !x.deleted_at && !x.skipped && logicalDay(x.completed_at, dayStart) === today
// completedOn's order with the id last (a stable sort of the snapshot, which is in id order).
const newestDone = (a: Task, b: Task) => (b.completed_at ?? 0) - (a.completed_at ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

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
  // Followed from the rows each write changed (incremental-list-updates D2).
  const doneOf = useRef(new Derived<Task[], [string, number]>(
    (tasks, today) => completedOn(tasks, today),
    (prev, changes, _tasks, today, dayStart) => patchOrdered(prev, changes, (x) => doneOn(x, today, dayStart), newestDone),
  )).current
  const doneToday = shown ? doneOf.get(allTasks, today, currentDayStart()) : null
  const list = useMemo(() => ({ fill, taken, waitingIds, review, doneToday }), [fill, taken, waitingIds, review, doneToday])
  // The row action, the Actions menu and the palette read Today's slots from here (slotActions).
  useEffect(() => {
    if (!on || !fill.limit) return
    publishClosedList({ list, today })
    return () => publishClosedList(null)
  }, [on, fill.limit, list, today])
  return list
}

/**
 * Now for the waiting tasks' passed times (today-waiting-time-passed D3): the wall time
 * of the logical today, refreshed on each minute boundary while `active` (tasks wait).
 */
export function useWaitingNow(active: boolean): string | undefined {
  const read = () => { const d = new Date(); return waitingNow(d, logicalToday(undefined, d.getTime()), todayISO(d)) }
  const [now, setNow] = useState(read)
  useEffect(() => {
    if (!active) return
    setNow(read())
    let timer: ReturnType<typeof setTimeout>
    const tick = () => { timer = setTimeout(() => { setNow(read()); tick() }, 60_000 - (Date.now() % 60_000) + 5) }
    tick()
    return () => clearTimeout(timer)
  }, [active])
  return active ? now : undefined
}
