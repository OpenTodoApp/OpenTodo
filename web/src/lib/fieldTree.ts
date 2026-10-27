// Which custom fields apply to a project (OpenSpec inherited-custom-fields D1):
// its ancestors' live definitions, farthest first, then its own. Pure, so the
// filter engine, the panel and the definition checks share one rule; the Go port
// is internal/sync ApplicableFields, pinned by fields.vectors.json.
import { byPosition } from './ordering'
import { descendants } from './tree'
import type { FieldDef, Project } from './types'

/** Live definitions of a project, in position order. Inbox (null) has none. */
export function liveFields(projectId: string | null | undefined, defs: readonly FieldDef[]): FieldDef[] {
  if (!projectId) return []
  return defs.filter((d) => d.project_id === projectId && !d.deleted_at).sort(byPosition)
}

/** The part of a project the inheritance rule reads. */
export type FieldProject = Pick<Project, 'id' | 'parent_id'> & { deleted_at?: number | null }

/**
 * The projects whose fields apply to `projectId` (OpenSpec inherited-custom-fields
 * D1): its ancestors farthest first, then the project itself. Ancestors follow raw
 * parent pointers through the given live projects and stop at a missing or
 * deleted parent or a project already visited, so a cycle from concurrent moves
 * lists no project twice. Pinned against the Go port by fields.vectors.json.
 */
export function fieldChain(projectId: string, projects: readonly FieldProject[] | ReadonlyMap<string, FieldProject>): string[] {
  const byId = projects instanceof Map ? projects : new Map((projects as readonly FieldProject[]).map((p) => [p.id, p]))
  const chain = [projectId]
  const seen = new Set(chain)
  // A deleted project is no part of the tree: its own fields still apply, no ancestor's.
  let cur = byId.get(projectId)
  if (cur?.deleted_at) cur = undefined
  while (cur?.parent_id) {
    const parent = byId.get(cur.parent_id)
    if (!parent || parent.deleted_at || seen.has(parent.id)) break
    seen.add(parent.id)
    chain.push(parent.id)
    cur = parent
  }
  return chain.reverse()
}

/**
 * The fields that apply to a project: the live definitions of its ancestors,
 * farthest first, then its own, each group in position order. Inbox (null) has none.
 */
export function applicableFields(projectId: string | null | undefined, projects: readonly FieldProject[] | ReadonlyMap<string, FieldProject>, defs: readonly FieldDef[]): FieldDef[] {
  if (!projectId) return []
  return fieldChain(projectId, projects).flatMap((pid) => liveFields(pid, defs))
}

/**
 * A memoizing lookup of applicable fields per project, for lists that resolve
 * many rows at once (the badges, the filters): one chain walk per project.
 */
export function applicableFieldsLookup(projects: readonly FieldProject[], defs: readonly FieldDef[]): (projectId: string | null | undefined) => FieldDef[] {
  const byId = new Map(projects.map((p) => [p.id, p]))
  const cache = new Map<string, FieldDef[]>()
  return (projectId) => {
    if (!projectId) return []
    let hit = cache.get(projectId)
    if (!hit) {
      hit = applicableFields(projectId, byId, defs)
      cache.set(projectId, hit)
    }
    return hit
  }
}

/** The live projects below `projectId` at any depth, following raw parent pointers (cycle-safe). */
export function fieldDescendants(projectId: string, projects: readonly FieldProject[]): string[] {
  return [...descendants(projectId, projects.filter((p) => !p.deleted_at))]
}
