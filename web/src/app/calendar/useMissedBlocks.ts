// Today's missed blocks, live (OpenSpec change replan-the-day, design D1 and D4): what
// the Day and Week header, the calendar and Today menus and the command palette count
// before they offer "Re-plan the rest of the day".
import { useMemo } from 'react'
import { viewedTask } from '../../lib/dates'
import { useLiveProjects, useMembershipMap } from '../../lib/liveData'
import { NO_TASKS, useLiveTasks } from '../../lib/liveTasks'
import { missedBlocks, type MissedBlock, type ReplanTasksInput } from '../../lib/replan'
import { useMe, useRunningEntry } from '../../lib/timeEntries'
import { useToday, useViewerZone } from '../useViews'
import { useNowMinutes } from './useNowMinutes'

/** The task side of a re-plan: today's tasks in the viewer's zone, permissions, the running timer and the clock. */
export function useReplanTasksInput(): ReplanTasksInput {
  const today = useToday()
  const now = useNowMinutes()
  const zone = useViewerZone()
  const raw = useLiveTasks() ?? NO_TASKS
  const tasks = useMemo(() => raw.map((tk) => viewedTask(tk, zone)), [raw, zone])
  const projects = useLiveProjects()
  const memberships = useMembershipMap()
  const me = useMe()
  const runningTaskId = useRunningEntry()?.task_id ?? null
  return useMemo(() => ({ today, now, tasks, projects, memberships, me, runningTaskId }), [today, now, tasks, projects, memberships, me, runningTaskId])
}

/** Today's missed blocks (empty while nothing is behind). */
export function useMissedBlocks(): MissedBlock[] {
  const input = useReplanTasksInput()
  return useMemo(() => missedBlocks(input), [input])
}
