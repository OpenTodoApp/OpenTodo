// Routines of a shared project on this device (OpenSpec change routines-shared):
// which project a routine belongs to, who may change it, and the steps a
// shared routine cannot use. The server enforces all of it; the device mirrors
// it so the page and the editor say so before saving, offline too.
import { canEditProjectNote } from '../sharing'
import type { Membership, Rule } from '../types'
import type { Catalogue } from './catalogue'

/** Step kinds that act on personal things (internal/ruleval NotInShared). */
export const NOT_IN_SHARED: ReadonlySet<string> = new Set([
  'favourite', 'set_focus', 'start_timer', 'stop_timer', 'tracked_time',
  'create_project', 'update_project', 'project_from_template', 'create_labels',
  'email_me', 'webhook',
])

/** The shared project a routine belongs to, or null for a personal routine. */
export function sharedProjectOf(rule: Pick<Rule, 'project_id'> | null | undefined, memberships: Map<string, Membership>): string | null {
  const pid = rule?.project_id
  return pid && memberships.has(pid) ? pid : null
}

/** Whether the user may change a routine: their own, or a shared project's as an editor or above (D2). */
export function canEditRoutine(rule: Pick<Rule, 'project_id'> | null | undefined, memberships: Map<string, Membership>): boolean {
  const pid = sharedProjectOf(rule, memberships)
  return !pid || canEditProjectNote(memberships.get(pid)!.role)
}

/** The shared projects where the user may create routines (New routine's Where). */
export function routineProjects(memberships: Map<string, Membership>): string[] {
  return [...memberships.values()].filter((m) => canEditProjectNote(m.role)).map((m) => m.projectId)
}

/** The catalogue as a shared routine sees it: personal steps not available (D3), Email project members later (D8). */
export function sharedCatalogue(cat: Catalogue | null): Catalogue | null {
  if (!cat) return cat
  const out: Catalogue = {}
  for (const [kind, e] of Object.entries(cat)) {
    if (!e.available) out[kind] = e
    else if (NOT_IN_SHARED.has(kind)) out[kind] = { ...e, available: false, reason: 'not_in_shared' }
    else if (kind === 'email_members') out[kind] = { ...e, available: false, reason: 'not_yet' }
    else out[kind] = e
  }
  for (const kind of NOT_IN_SHARED) if (!out[kind]) out[kind] = { kind, group: '', available: false, reason: 'not_in_shared' }
  return out
}
