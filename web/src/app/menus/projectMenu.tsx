// The project menu as data (labels-and-menus D1): its groups and the "Move to" targets,
// shared by the project header and the sidebar (useProjectMenu) and the command palette.
import { moveProjectToWorkspaceUndoable } from '../../lib/undoActions'
import { showUndoToast } from '../bulk/toastStore'
import { archiveProject, deleteProject, moveProject } from '../../lib/ops'
import { buildProjectTree, descendantIds } from '../../lib/projects'
import { canDeleteProject, canEditProject, canEditTasks } from '../../lib/sharing'
import { flattenTree } from '../../lib/tree'
import type { Project, ProjectRole } from '../../lib/types'
import { navigate } from '../router'
import type { ActionGroup } from './ActionMenu'
import { projectIconItem, projectRenameItem } from './projectAppearance'
import { keysOf } from '../../lib/shortcuts'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { pinItem } from './pinItem'
import { projectFlowItem } from './flowMenu'
import { maintenanceItem, reviewEveryItem } from './reviewMenu'
import type { MethodMode } from '../../lib/method/mode'
import { openTaskCount } from '../../lib/liveTasks'
import { listModeItem } from './listMenu'

/** A "Move to" target: a project, or the top level (id ''). */
export interface MoveTarget { id: string; name: string; path: string[] }

/**
 * Valid "Move to" targets (labels-and-menus 3.2): live, non-archived projects other
 * than the project itself and its descendants, each with its parent path, plus
 * "Top level" first.
 */
export function moveTargets(project: Project, projects: Project[]): MoveTarget[] {
  const live = projects.filter((p) => !p.deleted_at && !p.archived)
  const byId = new Map(live.map((p) => [p.id, p]))
  const excluded = descendantIds(project.id, live)
  const pathOf = (p: Project): string[] => {
    const out: string[] = []
    const seen = new Set<string>()
    for (let cur = p.parent_id ? byId.get(p.parent_id) : undefined; cur && !seen.has(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) {
      seen.add(cur.id)
      out.unshift(cur.name)
    }
    return out
  }
  const rest = flattenTree(buildProjectTree(live).roots)
    .filter((n) => n.id !== project.id && !excluded.has(n.id))
    .map((n) => ({ id: n.id, name: n.item.name, path: pathOf(n.item) }))
  return [{ id: '', name: 'Top level', path: [] }, ...rest]
}

/**
 * The project menu as data (labels-and-menus D1), shared by the project header and
 * the command palette (search-and-command-palette D5) so both run the same handlers.
 * "Pin to sidebar" (sidebar-favourites) is offered to every role: it changes the
 * user's own preferences, never the project.
 */
export function projectMenuGroups(project: Project, o: { role: ProjectRole; shared: boolean; targets: MoveTarget[]; subCount: number; openTasks?: number; pinned?: boolean; workspaces?: { id: string; name: string }[]; mode?: MethodMode; reviewEvery?: string }, a: { rename: () => unknown; duplicate?: () => unknown; saveTemplate?: () => unknown; fields?: () => unknown; pin?: () => unknown; left?: () => unknown }): ActionGroup[] {
  const { role, targets, subCount, openTasks } = o
  // After an archive or delete: the caller's step (the Inbox for the page of the project), else the Inbox.
  const left = () => { void (a.left ? a.left() : navigate({ view: 'inbox' })) }
  // A consequence naming the open tasks: from the count the caller holds, or, while
  // that has not loaded yet, read when the confirmation opens (never "0 open tasks").
  const withCount = (text: (n: number) => string) =>
    openTasks === undefined ? async () => text(await openTaskCount(project.id)) : text(openTasks)
  const pin: ActionGroup[] = a.pin ? [{ items: [pinItem(!!o.pinned, a.pin)] }] : []
  const subsText = subCount ? ` ${t('{n, plural, one {Its sub-project moves up one level.} other {Its # sub-projects move up one level.}}', { n: subCount })}` : ''
  // Copies only read the project, so every role may make them (project-templates D6).
  const copies: ActionGroup[] = a.duplicate || a.saveTemplate ? [{ items: [
    ...(a.duplicate ? [{ kind: 'action' as const, id: 'duplicate', label: t('Duplicate…'), icon: 'copy' as const, onSelect: a.duplicate }] : []),
    ...(a.saveTemplate ? [{ kind: 'action' as const, id: 'save-template', label: t('Save as template…'), icon: 'download' as const, onSelect: a.saveTemplate }] : []),
  ] }] : []
  // Custom fields (custom-fields): whoever edits the project's tasks manages its fields; viewers do not.
  const fields: ActionGroup[] = a.fields && canEditTasks(role) ? [{ items: [
    { kind: 'action', id: 'fields', label: t('Fields…'), icon: 'list', shortcut: keysOf('project.fields'), onSelect: a.fields },
  ] }] : []
  // "Review every…" (project-review-cadence D6): personal, for whoever is in the walk (editors and up).
  const every = o.mode && canEditTasks(role) ? reviewEveryItem(project.id, o.reviewEvery, { mode: o.mode }) : null
  const review: ActionGroup[] = every ? [{ items: [every] }] : []
  // "List…" (reusable-lists D7): the reusable-list switches; editors and up change them, viewers see them.
  const list: ActionGroup[] = [{ items: [listModeItem(project, { canEdit: canEditTasks(role) })] }]
  if (!canEditProject(role)) return [...pin, ...copies, ...fields, ...review, ...list]
  // "Flow…" (project-flow-modes D7): the menus pass the mode; the palette offers its own "Set project flow…".
  const flow = o.mode ? projectFlowItem(project, { mode: o.mode, canEdit: true }) : null
  // "Put in maintenance" / "End maintenance" (project-review-cadence D6): owner and admins, like the flow.
  const maintenance = o.mode ? maintenanceItem(project, { mode: o.mode, canEdit: true }) : null
  return [
    ...pin,
    ...copies,
    ...fields,
    ...review,
    ...list,
    { items: [
      { kind: 'picker', id: 'move', label: t('Move to'), icon: 'folder-input', shortcut: keysOf('project.move'), picker: {
        title: t('Move to'), placeholder: t('Find a project…'), emptyText: t('No other project can hold this one'),
        source: targets, getKey: (item: MoveTarget) => item.id || '__top__', getLabel: (entry: MoveTarget) => entry.name, getPath: (x1: MoveTarget) => x1.path,
        selected: [project.parent_id ?? '__top__'], rankContext: 'project-move',
        onPick: (item: MoveTarget) => { act(moveProject(project.id, item.id || null)) },
      } },
      // Only the owner moves a project to another of their workspaces (workspaces D7).
      ...(role === 'owner' && o.workspaces?.length ? [{ kind: 'picker' as const, id: 'move-workspace', label: t('Move to workspace…'), icon: 'layers' as const, picker: {
        title: t('Move to workspace'), placeholder: t('Find a workspace…'), emptyText: t('No other workspace'),
        source: o.workspaces, getKey: (w: { id: string }) => w.id, getLabel: (w: { name: string }) => w.name, rankContext: 'project-move-workspace',
        onPick: (w: { id: string; name: string }) => { void moveProjectToWorkspaceUndoable(project.id, w.id, w.name).then((r) => { if (r.entry) showUndoToast(r.label, r.entry.id) }) },
      } }] : []),
      projectRenameItem(a.rename),
      projectIconItem(project),
      ...(flow ? [flow] : []),
      ...(maintenance ? [maintenance] : []),
      { kind: 'confirm', id: 'archive', label: subCount ? t('Archive with sub-projects') : t('Archive'), icon: 'archive', confirm: {
        title: t('Archive “{name}”?', { name: project.name }), tone: 'default', confirmLabel: t('Archive'),
        body: withCount((tasks) => subCount
          ? t('{tasks, plural, one {It leaves the sidebar with # open task} other {It leaves the sidebar with # open tasks}} {subs, plural, one {and its sub-project} other {and its # sub-projects}}. You can unarchive it from Settings → Data.', { tasks, subs: subCount })
          : t('{tasks, plural, one {It leaves the sidebar with # open task.} other {It leaves the sidebar with # open tasks.}} You can unarchive it from Settings → Data.', { tasks })),
        onConfirm: () => archiveProject(project.id).then(left),
      } },
    ] },
    ...(canDeleteProject(role) ? [{ items: [{ kind: 'confirm' as const, id: 'delete', label: t('Delete project'), icon: 'trash-2' as const, tone: 'danger' as const, confirm: {
      title: t('Delete “{name}”?', { name: project.name }), confirmLabel: t('Delete project'),
      body: withCount((n) => o.shared
        ? t('{n, plural, one {It is deleted for every member. A copy of its # open task goes to your Inbox.} other {It is deleted for every member. Copies of its # open tasks go to your Inbox.}}', { n }) + subsText
        : t('{n, plural, one {It moves to the Trash with # open task. You can restore it from the Trash.} other {It moves to the Trash with # open tasks. You can restore it from the Trash.}}', { n }) + subsText),
      onConfirm: () => deleteProject(project.id).then(left),
    } }] }] : []),
  ]

}
