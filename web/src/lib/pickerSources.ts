// Option lists for the entity pickers (OpenSpec task-detail-redesign, design D2;
// capability `entity-pickers`). Pure builders over local rows that return the
// items a Combobox shows in natural order, with the domain exclusion rules
// applied. Ranking stays in the Combobox (pick history per rank context); these
// builders never sort by use. Pass the fields straight to the Combobox:
//
//   <Combobox source={items} getKey={(i) => i.key} getLabel={(i) => i.label}
//     getPath={(i) => i.path} getSecondary={(i) => i.meta} pinned={[INBOX_KEY]} … />
import { buildProjectTree } from './projects'
import { compareByPosition } from './ordering'
import { buildTree, descendants, flattenTree, type Tree } from './tree'
import type { Membership, Project, Section, Task } from './types'
import { t } from './i18n'

/** Key of the Inbox option (the task's `project_id` is null). */
export const INBOX_KEY = 'inbox'
/** Key of the "No parent" / "No section" option. */
export const NONE_KEY = 'none'

export type PickerMarker = 'archived' | 'completed' | 'deleted'

export interface PickerItem {
  /** Option key: an entity id, INBOX_KEY or NONE_KEY. */
  key: string
  /** The value to write: the entity id, or null for the Inbox / "No …" option. */
  value: string | null
  label: string
  /** Ancestor names, root first (empty at the top level). */
  path: string[]
  /** Secondary text: a marker ("archived", "completed", "deleted") or the task's section. */
  meta?: string
  /** Set only for a current value that is no longer a normal choice; listed first. */
  marker?: PickerMarker
  /** Projects: colour dot. */
  color?: string
  /** Projects: shared with other people. */
  shared?: boolean
  /** Extra words the search matches, not shown ("inbox" for "No project"). */
  keywords?: string
}

/** The search words of an item, for a combobox's getKeywords. */
export const itemKeywords = (i: PickerItem): string | undefined => i.keywords

function pathOf<T>(tree: Tree<T>, id: string, label: (item: T) => string): string[] {
  const out: string[] = []
  const seen = new Set<string>([id])
  let parent = tree.nodes.get(id)?.parent ?? null
  while (parent && !seen.has(parent)) {
    seen.add(parent)
    const n = tree.nodes.get(parent)
    if (!n) break
    out.unshift(label(n.item))
    parent = n.parent
  }
  return out
}

/** Ancestor names of any project, following raw parent pointers (also for an archived one). */
function rawProjectPath(id: string, byId: Map<string, Project>): string[] {
  const out: string[] = []
  const seen = new Set<string>([id])
  let p = byId.get(id)?.parent_id ?? null
  while (p && !seen.has(p)) {
    seen.add(p)
    const parent = byId.get(p)
    if (!parent) break
    out.unshift(parent.name)
    p = parent.parent_id
  }
  return out
}

export interface ProjectSourceOptions {
  /** The current project id (null = Inbox); an archived or deleted one is listed first, marked. */
  current?: string | null
  /** Offer the Inbox first (default true). The sidebar's "Parent project" uses false and adds its own "None". */
  inbox?: boolean
  /** Shared projects get `shared: true`. */
  memberships?: Map<string, Membership>
  /** Projects that may not be chosen (e.g. a project and its descendants as its own parent). */
  exclude?: ReadonlySet<string>
}

/**
 * Project options: an archived or deleted current project (marked), "No project"
 * (the Inbox icon, found by typing "inbox"; inbox-means-unplaced D6: a task there is
 * an Inbox task only while it is not scheduled), then every live project in sidebar
 * tree order with its parent path, so two projects with the same name are told apart.
 */
export function projectSource(projects: readonly Project[], opts: ProjectSourceOptions = {}): PickerItem[] {
  const { current = null, inbox = true, memberships, exclude } = opts
  const out: PickerItem[] = []
  const byId = new Map(projects.map((p) => [p.id, p]))
  const cur = current ? byId.get(current) : undefined
  if (cur && (cur.archived || cur.deleted_at)) {
    const marker: PickerMarker = cur.deleted_at ? 'deleted' : 'archived'
    out.push({ key: cur.id, value: cur.id, label: cur.name, path: rawProjectPath(cur.id, byId), meta: marker, marker, color: cur.color, shared: memberships?.has(cur.id) })
  }
  if (inbox) out.push({ key: INBOX_KEY, value: null, label: t('No project'), path: [], keywords: `inbox ${t('Inbox')}` })
  const tree = buildProjectTree(projects)
  for (const n of flattenTree(tree.roots)) {
    if (exclude?.has(n.id)) continue
    out.push({ key: n.id, value: n.id, label: n.item.name, path: pathOf(tree, n.id, (p) => p.name), color: n.item.color, shared: memberships?.has(n.id) })
  }
  return out
}

/**
 * Parent task options for `task`: "No parent", then the open, non-deleted tasks of
 * its project except itself and its descendants, in tree order with their own
 * parent path and section. A completed or deleted current parent is listed first,
 * marked; other completed tasks are not offered.
 */
export function parentSource(tasks: readonly Task[], task: Pick<Task, 'id' | 'project_id' | 'parent_id'>, sections: readonly Section[] = []): PickerItem[] {
  const sameProject = tasks.filter((tk) => (tk.project_id ?? null) === (task.project_id ?? null))
  const excluded = descendants(task.id, sameProject)
  excluded.add(task.id)
  const sectionName = new Map(sections.map((s) => [s.id, s.name]))
  const out: PickerItem[] = []
  const cur = task.parent_id ? tasks.find((tk) => tk.id === task.parent_id) : undefined
  if (cur && (cur.completed_at || cur.deleted_at)) {
    const marker: PickerMarker = cur.deleted_at ? 'deleted' : 'completed'
    out.push({ key: cur.id, value: cur.id, label: cur.title || t('Untitled'), path: [], meta: marker, marker })
  }
  out.push({ key: NONE_KEY, value: null, label: t('No parent'), path: [] })
  const open = sameProject.filter((task) => !task.completed_at && !task.deleted_at && !excluded.has(task.id))
  const tree = buildTree(open)
  for (const n of flattenTree(tree.roots)) {
    const section = n.item.section_id ? sectionName.get(n.item.section_id) : undefined
    out.push({ key: n.id, value: n.id, label: n.item.title || t('Untitled'), path: pathOf(tree, n.id, (task) => task.title || t('Untitled')), meta: section })
  }
  return out
}

/** Section options of `projectId`: "No section", then its live sections in board order. */
export function sectionSource(sections: readonly Section[], projectId: string | null): PickerItem[] {
  const live = sections.filter((s) => s.project_id === projectId && !s.deleted_at).sort(compareByPosition)
  return [{ key: NONE_KEY, value: null, label: t('No section'), path: [] }, ...live.map((s) => ({ key: s.id, value: s.id, label: s.name, path: [] }))]
}
