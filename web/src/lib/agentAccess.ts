import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { api } from './api'
import { db, setMeta } from './db'

// Projects kept away from AI assistants (OpenSpec change agent-planning-fields,
// design D9). The switch is server access state like membership; this device
// keeps the ids from GET /api/v1/me so the share dialog and the assistant panel
// read the same offline. Changing it needs a connection.

export const AGENT_EXCLUSIONS_KEY = 'agentExcludedProjects'

/** Fetches the kept-away project ids and remembers them; offline keeps the last answer. */
export async function refreshAgentExclusions(): Promise<void> {
  try {
    const me = await api.me()
    if (Array.isArray(me.agent_excluded_projects)) await setMeta(AGENT_EXCLUSIONS_KEY, me.agent_excluded_projects)
  } catch {
    // Offline or signed out: the cached list stays.
  }
}

/** The kept-away project ids cached on this device, live. */
export function useAgentExclusions(): Set<string> {
  const row = useLiveQuery(() => db.meta.get(AGENT_EXCLUSIONS_KEY), [])
  return useMemo(() => new Set(Array.isArray(row?.value) ? (row.value as string[]) : []), [row])
}

/** The name of the project an inherited state comes from, live. */
export function useProjectName(id: string | null | undefined): string | undefined {
  return useLiveQuery(async () => (id ? (await db.projects.get(id))?.name : undefined), [id])
}

/** One project's state from the server: kept away, and the ancestor it inherits from. */
export function getProjectAgentAccess(projectId: string): Promise<{ kept_away: boolean; inherited_from: string | null }> {
  return api.getProjectAgentAccess(projectId)
}

/** Sets the project's own switch, then refreshes the cached list. */
export async function setProjectAgentAccess(projectId: string, keptAway: boolean): Promise<{ kept_away: boolean; inherited_from: string | null }> {
  const out = await api.setProjectAgentAccess(projectId, keptAway)
  await refreshAgentExclusions()
  return out
}
