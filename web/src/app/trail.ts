// The path to a project as trail steps (OpenSpec accessibility "Location and link
// purpose", accessibility-aaa D7): its ancestors from the top, each a link that
// navigates in the app, optionally ending with the project itself.
import { useMemo } from 'react'
import type { Project } from '../lib/types'
import { ancestors } from '../lib/tree'
import type { TrailStep } from '../ui'
import { navigate, routePath } from './router'

export function projectTrail(projectId: string | null | undefined, projects: readonly Project[], includeSelf: boolean): TrailStep[] {
  if (!projectId) return []
  const byId = new Map(projects.map((p) => [p.id, p]))
  const own = byId.get(projectId)
  if (!own) return []
  const chain = ancestors(own.id, byId, { parentId: (p) => p.parent_id }).reverse()
  if (includeSelf) chain.push(own)
  return chain.map((p) => ({ label: p.name, href: routePath({ view: 'project', id: p.id }), onSelect: () => navigate({ view: 'project', id: p.id }) }))
}

/** The trail of a project, memoised; empty when `enabled` is false or the project is top-level and `includeSelf` is false. */
export function useProjectTrail(projectId: string | null | undefined, projects: readonly Project[], includeSelf: boolean, enabled = true): TrailStep[] {
  return useMemo(() => (enabled ? projectTrail(projectId, projects, includeSelf) : []), [enabled, projectId, projects, includeSelf])
}
