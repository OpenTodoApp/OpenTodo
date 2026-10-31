// Upcoming's "Show repeating occurrences" (OpenSpec change series-occurrences, design
// D4): off by default and per device. While it is on, the projections of the 14 days
// after today join their day groups as read-only rows outside the counts; the series
// Upcoming's duration and query filters keep are the ones projected. The math loads
// only once the switch is on, so the first load carries the switch alone.
import { useEffect, useMemo, useState } from 'react'
import type { ListGroup } from '../../lib/listGroups'
import { useUpcomingProjectionsOn } from '../calendar/projectionSwitches'
import type { UpcomingInput } from './upcomingCompute'

type Compute = typeof import('./upcomingCompute')['upcomingWithProjections']

export function useUpcomingGroups(upcoming: boolean, groups: ListGroup[], input: UpcomingInput): ListGroup[] {
  const on = useUpcomingProjectionsOn() && upcoming
  const [compute, setCompute] = useState<{ fn: Compute } | null>(null)
  useEffect(() => {
    if (!on || compute) return
    let live = true
    void import('./upcomingCompute').then((m) => { if (live) setCompute({ fn: m.upcomingWithProjections }) })
    return () => { live = false }
  }, [on, compute])
  const { allTasks, projects, today, zone, duration, queryTest, resolved } = input
  return useMemo(() => (on && compute ? compute.fn(groups, { allTasks, projects, today, zone, duration, queryTest, resolved }) : groups),
    [on, compute, groups, allTasks, projects, today, zone, duration, queryTest, resolved])
}
