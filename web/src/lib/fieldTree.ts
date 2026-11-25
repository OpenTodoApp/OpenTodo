// Which custom fields apply to a project (OpenSpec inherited-custom-fields D1,
// workspace-fields D2): its workspace's live fields, then its ancestors' live
// definitions, farthest first, then its own. Pure, so the filter engine, the
// panel and the definition checks share one rule; the Go port is internal/sync
// ApplicableFields, pinned by fields.vectors.json.
import { compareByPosition } from './ordering'
import { descendants } from './tree'
import type { FieldDef, Project } from './types'

/**
 * Places projects in the account's workspaces (workspace-fields D2): a
 * Partition from lib/workspaces.ts is one. `project` gives a project's
 * workspace (its root's), `own('')` the default workspace.
 */
export interface FieldPlacement {
  project(id: string): string
  own(workspaceId: string | null | undefined): string
}

/** Whether a definition belongs to a workspace rather than a project (workspace-fields D1). */
export function isWorkspaceField(d: Pick<FieldDef, 'project_id'>): boolean {
  return !d.project_id
}

/**
 * The workspace a workspace field belongs to: its own workspace_id, null reading
 * as the default. Unlike a label's, an id the account does not know (a deleted
 * workspace) is not read as the default, so such a field applies nowhere.
 */
export function fieldWorkspace(d: Pick<FieldDef, 'workspace_id'>, place: FieldPlacement): string {
  return d.workspace_id || place.own('')
}

/** The live fields of one workspace, in position order. Without a placement there are none. */
export function workspaceFields(workspace: string, place: FieldPlacement | null | undefined, defs: readonly FieldDef[]): FieldDef[] {
  if (!place || !workspace) return []
  return defs.filter((d) => isWorkspaceField(d) && !d.deleted_at && fieldWorkspace(d, place) === workspace).sort(compareByPosition)
}

/** Live definitions of a project, in position order. Inbox (null) has none. */
export function liveFields(projectId: string | null | undefined, defs: readonly FieldDef[]): FieldDef[] {
  if (!projectId) return []
  return defs.filter((d) => d.project_id === projectId && !d.deleted_at).sort(compareByPosition)
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
 * The fields that apply to a project: its workspace's live fields (only with a
 * placement), then the live definitions of its ancestors, farthest first, then
 * its own, each group in position order. Inbox (null) has none.
 */
export function applicableFields(projectId: string | null | undefined, projects: readonly FieldProject[] | ReadonlyMap<string, FieldProject>, defs: readonly FieldDef[], place?: FieldPlacement | null): FieldDef[] {
  if (!projectId) return []
  const ws = place ? workspaceFields(place.project(projectId), place, defs) : []
  return [...ws, ...fieldChain(projectId, projects).flatMap((pid) => liveFields(pid, defs))]
}

/**
 * A memoizing lookup of applicable fields per project, for lists that resolve
 * many rows at once (the badges, the filters): one chain walk per project.
 */
export function applicableFieldsLookup(projects: readonly FieldProject[], defs: readonly FieldDef[], place?: FieldPlacement | null): (projectId: string | null | undefined) => FieldDef[] {
  const byId = new Map(projects.map((p) => [p.id, p]))
  const cache = new Map<string, FieldDef[]>()
  return (projectId) => {
    if (!projectId) return []
    let hit = cache.get(projectId)
    if (!hit) {
      hit = applicableFields(projectId, byId, defs, place)
      cache.set(projectId, hit)
    }
    return hit
  }
}

/** The live projects below `projectId` at any depth, following raw parent pointers (cycle-safe). */
export function fieldDescendants(projectId: string, projects: readonly FieldProject[]): string[] {
  return [...descendants(projectId, projects.filter((p) => !p.deleted_at))]
}
