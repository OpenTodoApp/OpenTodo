// The counts on the phone tab bar (OpenSpec change phone-delight, design D7): the Inbox's
// and Today's open tasks, the numbers the drawer shows, from the same function, counted
// once the writes settle as the app badge is. And the task a hold on Today opens: the
// first open task due today at a time still ahead.
import { useMemo } from 'react'
import { taskIndexOf, useLiveTasks, useOpenTasks } from '../lib/liveTasks'
import { useMe } from '../lib/sharing'
import { sidebarCounts } from '../lib/sidebarCounts'
import { liveProgress } from '../lib/subtasks'
import type { Task } from '../lib/types'
import { useSettledValue } from '../lib/useSettledValue'
import { useToday } from './useViews'

export function useTabCounts(): { inbox: number; today: number } {
  const open = useOpenTasks()
  const live = useSettledValue(useLiveTasks() ?? open)
  const today = useToday()
  const me = useMe()
  return useMemo(() => {
    if (!me) return { inbox: 0, today: 0 }
    const c = sidebarCounts(live, today, me, { parentOf: (id) => taskIndexOf(live).get(id), hasChildren: (id) => liveProgress(live).has(id) })
    return { inbox: c.inbox.size, today: c.today }
  }, [live, today, me])
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** The first open task due today at a time still ahead, or null. */
export function nextTimedToday(open: readonly Task[], today: string, now: Date): Task | null {
  const at = hhmm(now)
  let best: Task | null = null
  for (const x of open) {
    const time = x.due?.date === today && !x.completed_at && !x.deleted_at ? x.due.time : undefined
    if (time && time >= at && (!best || time < best.due!.time!)) best = x
  }
  return best
}
