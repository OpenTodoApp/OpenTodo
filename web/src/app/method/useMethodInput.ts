// The live rows the Open Loops rules read (OpenSpec change open-loops-method,
// design D3, D9): tasks, projects, sections, memberships, the user and the local
// date, recomputed when any of them changes on this or another device.
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { useLiveTasks } from '../../lib/liveTasks'
import { useAllProjects, useLiveSections, useMembershipMap } from '../../lib/localData'
import type { MethodInput } from '../../lib/method/rules'
import { currentUserId } from '../../lib/sharing'
import { useToday } from '../useViews'

/** The rules' input, or null until the tasks are read. */
export function useMethodInput(): MethodInput | null {
  const tasks = useLiveTasks()
  const projects = useAllProjects()
  const sections = useLiveSections()
  const memberships = useMembershipMap()
  const me = useLiveQuery(() => currentUserId(), [], null)
  const today = useToday()
  return useMemo(() => (tasks ? { tasks, projects, sections, memberships, me, today } : null), [tasks, projects, sections, memberships, me, today])
}
