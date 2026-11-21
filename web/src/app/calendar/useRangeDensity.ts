// The counts and calendar events of a range of compact month grids (year-view D3/D4,
// quarter-view-and-plan-spans D2): Year and Quarter draw the same density marks, so
// they share one pair of hooks that takes the range instead of a year or a quarter.
import { useCallback, useMemo } from 'react'
import { calendarTasks, eventsByDay } from '../../lib/calendar'
import { addDaysISO, viewedTask } from '../../lib/dates'
import { NO_TASKS, useLiveTasks } from '../../lib/liveTasks'
import { useProjects } from '../../lib/localData'
import { planSeries } from '../../lib/plan'
import { slotCapacity, slotsByDate, useSlots } from '../../lib/slots'
import { yearCounts } from '../../lib/yearView'
import { useViewerZone } from '../useViews'
import { useCalendarFeeds } from './useCalendarFeeds'
import { useCalendarChrome } from './useCalendarChrome'
import { useCalendarProjectionsOn } from './projectionSwitches'

/** The shown events per day of [from, to]: the enabled calendars while the toggle shows them. */
export function useRangeEvents(from: string, to: string) {
  const zone = useViewerZone()
  const feeds = useCalendarFeeds(from, to)
  const counts = useMemo(() => {
    const out = new Map<string, number>()
    for (const [d, x] of eventsByDay(feeds.visibleEvents, from, to, zone)) out.set(d, x.allDay.length + x.timed.length)
    return out
  }, [feeds.visibleEvents, from, to, zone])
  return { feeds, counts }
}

/** The density counts of [from, to]: the calendar's selection, the scope and filter, and the projections while shown. */
export function useRangeCounts(from: string, to: string, today: string) {
  const zone = useViewerZone()
  const projects = useProjects()
  const rawTasks = useLiveTasks() ?? NO_TASKS
  const viewed = useMemo(() => rawTasks.map((task) => viewedTask(task, zone)), [rawTasks, zone])
  const viewedMap = useMemo(() => new Map(viewed.map((task) => [task.id, task])), [viewed])
  const chrome = useCalendarChrome(viewed, projects, { projections: true, colorBy: false })
  const projectionsOn = useCalendarProjectionsOn()
  const keeps = chrome.keeps
  const shown = useMemo(() => calendarTasks(viewed, projects, from, to), [viewed, projects, from, to])
  const series = useMemo(() => (projectionsOn ? planSeries(rawTasks, projects).filter((s) => keeps(viewedMap.get(s.id) ?? s)) : []), [projectionsOn, rawTasks, projects, keeps, viewedMap])
  // Slots count once toward a day's capacity, as in Month (calendar-slots D6).
  const slotRows = useSlots()
  const days = useMemo(() => {
    const out: string[] = []
    for (let d = from; d <= to; d = addDaysISO(d, 1)) out.push(d)
    return out
  }, [from, to])
  const slotViews = useMemo(() => slotsByDate(slotRows, days, viewedMap), [slotRows, days, viewedMap])
  const counts = useMemo(() => yearCounts({ tasks: shown, keeps, series, records: rawTasks, today, from, to, zone }), [shown, keeps, series, rawTasks, today, from, to, zone])
  const extra = useCallback((d: string) => slotCapacity(slotViews.get(d)).extra, [slotViews])
  return { chrome, counts, extra }
}
