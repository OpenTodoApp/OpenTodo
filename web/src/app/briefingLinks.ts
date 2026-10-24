// Where the briefing's parts lead (OpenSpec change briefing-links, design D2): a
// named task opens its page, a count of late tasks ticks exactly those rows in
// Today, a full day opens Upcoming at that day, and replies open the notifications.
// Nothing is written; a target that does not appear in time is left alone.
import { listState } from './listActions'
import { navigate, routePath, type Route } from './router'
import { notificationsOpen } from './signals'
import { openTaskPage } from './taskTrail'

/** How long to wait for the page to list what was asked for after a navigation. */
const WAIT_MS = 2000

const here = (r: Route) => typeof location !== 'undefined' && location.pathname === routePath(r)

/** Run `act` once `ready` holds, checking every frame, for at most WAIT_MS. */
function whenReady(ready: () => boolean, act: () => void): void {
  const until = Date.now() + WAIT_MS
  const step = () => {
    if (ready()) act()
    else if (Date.now() < until) requestAnimationFrame(step)
  }
  step()
}

const rowOf = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`)

/** A task the briefing names: its page, returning to the page it was opened from. */
export function openBriefingTask(id: string): void {
  openTaskPage(id)
}

/** Late tasks: Today's list ticks exactly these, selects the first and scrolls to it. */
export function revealTasks(ids: readonly string[]): void {
  if (ids.length === 0) return
  const today: Route = { view: 'today' }
  if (!here(today)) navigate(today)
  whenReady(() => {
    const list = listState()
    return here(today) && !!list && list.rows().some((t) => t.id === ids[0]) && !!rowOf(ids[0])
  }, () => {
    const list = listState()!
    const listed = new Set(list.rows().map((t) => t.id))
    const shown = ids.filter((id) => listed.has(id))
    list.tick?.(shown)
    list.select(shown[0])
    rowOf(shown[0])?.scrollIntoView?.({ block: 'center' })
  })
}

/** A full day: Upcoming, scrolled to that day's group. */
export function openUpcomingDay(date: string): void {
  const upcoming: Route = { view: 'upcoming' }
  if (!here(upcoming)) navigate(upcoming)
  const group = () => document.querySelector<HTMLElement>(`[data-group="${CSS.escape(date)}"]`)
  whenReady(() => here(upcoming) && !!group(), () => group()?.scrollIntoView?.({ block: 'start' }))
}

/** Replies that are not about one named task: the notifications list. */
export function openNotifications(): void {
  notificationsOpen.request('open')
}
