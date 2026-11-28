// The live rows the Open Loops rules read (OpenSpec change open-loops-method,
// design D3, D9): tasks, projects, sections, memberships, the user and the local
// date, recomputed when any of them changes on this or another device.
import { useMemo } from 'react'
import { useLiveTasks } from '../../lib/liveTasks'
import { useAllProjects, useLiveSections, useMembershipMap } from '../../lib/localData'
import type { MethodInput } from '../../lib/method/rules'
import { useCurrentUserId } from '../../lib/sharing'
import { useToday } from '../useViews'

/**
 * The rules' input, or null until the tasks and the viewer are read: before the
 * viewer is known, the personal lists would keep tasks assigned to others (issue 2127).
 */
export function useMethodInput(): MethodInput | null {
  const tasks = useLiveTasks()
  const projects = useAllProjects()
  const sections = useLiveSections()
  const memberships = useMembershipMap()
  const me = useCurrentUserId()
  const today = useToday()
  return useMemo(() => (tasks && me !== undefined ? { tasks, projects, sections, memberships, me, today } : null), [tasks, projects, sections, memberships, me, today])
}
