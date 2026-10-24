// Who a comment or a task's notes may mention (OpenSpec change group-mentions,
// D4): the project's members, then the groups of its workspace, read live from
// the device's cache so the completion and the chips work offline.
import { useMemo } from 'react'
import { mentionTargets, mentionToken, type MentionTarget } from '../lib/comments'
import { useMembershipMap, useProjectsOfEveryWorkspace, useWorkspaceGroups, useWorkspaceState } from '../lib/localData'
import { useMe } from '../lib/timeEntries'
import { Partition } from '../lib/workspaces'

export function useMentionTargets(projectId: string | null | undefined, me?: string | null): MentionTarget[] {
  const memberships = useMembershipMap()
  const groups = useWorkspaceGroups()
  const state = useWorkspaceState()
  const projects = useProjectsOfEveryWorkspace()
  const stored = useMe()
  const who = me === undefined ? stored : me
  return useMemo(() => {
    const p = new Partition(state.defaultId, state.list.map((w) => w.id), projects)
    return mentionTargets(projectId, memberships, groups, (id) => p.project(id), who)
  }, [projectId, memberships, groups, state, projects, who])
}

/** The chips a rendered body shows: each target's token with its name, and which tokens are groups. */
export function mentionChipsOf(targets: readonly MentionTarget[]): { names: Map<string, string>; groups: Set<string> } {
  const names = new Map<string, string>()
  const groups = new Set<string>()
  for (const m of targets) {
    const token = mentionToken(m)
    // A person and a group with the same token: the person wins (D4).
    if (names.has(token)) continue
    names.set(token, m.name || m.email)
    if (m.group) groups.add(token)
  }
  return { names, groups }
}
