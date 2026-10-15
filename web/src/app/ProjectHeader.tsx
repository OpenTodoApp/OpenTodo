import { Button, Icon, type IconName, isIconName, PageHeader, Tooltip } from '../ui'
import { useLiveQuery } from 'dexie-react-hooks'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../lib/db'
import { archiveProject, deleteProject, moveProject, updateProject } from '../lib/ops'
import { buildProjectTree, descendantIds } from '../lib/projects'
import { canDeleteProject, canEditProject, canManageMembers } from '../lib/sharing'
import { flattenTree } from '../lib/tree'
import type { Project, ProjectRole } from '../lib/types'
import { navigate } from './router'
import { ShareDialog } from './ShareDialog'
import { DuplicateProjectDialog, SaveTemplateDialog } from './TemplateDialogs'
import { HistoryPanel } from './HistoryPanel'
import { ProjectActivity } from './ProjectActivity'
import { ActionMenu, type ActionGroup } from './menus/ActionMenu'
import { closePanel, openPanel, usePanelOccupantKey } from './panel'
import { PanelFrame } from './PanelFrame'
import { ProjectMark } from './Sidebar'
import { HUES, hueFor } from '../ui'

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

/** Colour swatches with radio semantics, inside the menu (they keep the menu open). */
function ColourSwatches({ project }: { project: Project }) {
  // A swatch is not a MenuItem, so picking one keeps the menu open to compare colours.
  const current = hueFor(project.color)
  return (
    <div role="group" aria-label="Colour" className="flex flex-wrap gap-1 px-1.5 py-1.5">
      {HUES.map((h) => (
        <button key={h.name} type="button" role="menuitemradio" aria-checked={h.name === current} aria-label={`Colour ${h.name}`} data-menu-label={`Colour ${h.name}`}
          className="touch-target inline-flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus"
          onClick={() => void updateProject(project.id, { color: h.hex })}>
          <span data-hue={h.name} className={`block h-5 w-5 rounded-full bg-hue-solid ${h.name === current ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}`} />
        </button>
      ))}
    </div>
  )
}

/**
 * The project menu as data (labels-and-menus D1), shared by the project header and
 * the command palette (search-and-command-palette D5) so both run the same handlers.
 */
export function projectMenuGroups(project: Project, o: { role: ProjectRole; shared: boolean; targets: MoveTarget[]; subCount: number; openTasks: number }, a: { rename: () => unknown; duplicate?: () => unknown; saveTemplate?: () => unknown }): ActionGroup[] {
  const { role, targets, subCount, openTasks } = o
  const tasksText = openTasks === 1 ? '1 open task' : `${openTasks} open tasks`
  const subsText = subCount ? ` Its ${subCount === 1 ? 'sub-project moves' : `${subCount} sub-projects move`} up one level.` : ''
  // Copies only read the project, so every role may make them (project-templates D6).
  const copies: ActionGroup[] = a.duplicate || a.saveTemplate ? [{ items: [
    ...(a.duplicate ? [{ kind: 'action' as const, id: 'duplicate', label: 'Duplicate…', icon: 'copy' as const, onSelect: a.duplicate }] : []),
    ...(a.saveTemplate ? [{ kind: 'action' as const, id: 'save-template', label: 'Save as template…', icon: 'download' as const, onSelect: a.saveTemplate }] : []),
  ] }] : []
  if (!canEditProject(role)) return copies
  return [
    ...copies,
    { items: [
      { kind: 'picker', id: 'move', label: 'Move to', icon: 'folder-input', shortcut: 'm', picker: {
        title: 'Move to', placeholder: 'Find a project…', emptyText: 'No other project can hold this one',
        source: targets, getKey: (t: MoveTarget) => t.id || '__top__', getLabel: (t: MoveTarget) => t.name, getPath: (t: MoveTarget) => t.path,
        selected: [project.parent_id ?? '__top__'], rankContext: 'project-move',
        onPick: (t: MoveTarget) => { void moveProject(project.id, t.id || null) },
      } },
      { kind: 'action', id: 'rename', label: 'Rename', icon: 'pencil', onSelect: a.rename },
      { kind: 'confirm', id: 'archive', label: subCount ? 'Archive with sub-projects' : 'Archive', icon: 'archive', confirm: {
        title: `Archive “${project.name}”?`, tone: 'default', confirmLabel: 'Archive',
        body: `It leaves the sidebar with ${tasksText}${subCount ? ` and ${subCount === 1 ? 'its sub-project' : `its ${subCount} sub-projects`}` : ''}. You can unarchive it from Settings → Projects.`,
        onConfirm: () => archiveProject(project.id).then(() => navigate({ view: 'inbox' })),
      } },
    ] },
    ...(canDeleteProject(role) ? [{ items: [{ kind: 'confirm' as const, id: 'delete', label: 'Delete project', icon: 'trash-2' as const, tone: 'danger' as const, confirm: {
      title: `Delete “${project.name}”?`, confirmLabel: 'Delete project',
      body: o.shared
        ? `It is deleted for every member. Copies of its ${tasksText} go to your Inbox.${subsText}`
        : `It moves to the Trash with ${tasksText}. You can restore it from the Trash.${subsText}`,
      onConfirm: () => deleteProject(project.id).then(() => navigate({ view: 'inbox' })),
    } }] }] : []),
  ]

}

/** Icons a project may carry (project-organization "Project icon"), from the bundled set. */
export const PROJECT_ICONS: readonly IconName[] = [
  'briefcase', 'house', 'heart', 'star', 'book-open', 'rocket', 'graduation-cap', 'plane', 'car', 'gift',
  'music', 'coffee', 'leaf', 'dumbbell', 'wallet', 'shopping-cart', 'camera', 'wrench', 'lightbulb', 'flame', 'anchor', 'globe', 'palette', 'folder',
]

/** Icon choices with radio semantics, inside the menu (they keep the menu open); "none" is the colour dot. */
function IconSwatches({ project }: { project: Project }) {
  const current = project.icon && isIconName(project.icon) ? project.icon : null
  const pick = (icon: string | null) => void updateProject(project.id, { icon })
  return (
    <div role="group" aria-label="Icon" className="flex flex-wrap gap-0.5 border-t border-default px-1.5 py-1.5" data-project-icons>
      <button type="button" role="menuitemradio" aria-checked={current === null} aria-label="No icon" data-menu-label="No icon"
        className={`touch-target inline-flex h-8 w-8 items-center justify-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-focus ${current === null ? 'bg-accent-soft' : 'hover:bg-sunken dark:hover:bg-raised'}`}
        onClick={() => pick(null)}>
        <span className="block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
      </button>
      {PROJECT_ICONS.map((name) => (
        <button key={name} type="button" role="menuitemradio" aria-checked={current === name} aria-label={`Icon ${name}`} data-menu-label={`Icon ${name}`}
          className={`touch-target inline-flex h-8 w-8 items-center justify-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-focus ${current === name ? 'bg-accent-soft' : 'text-muted hover:bg-sunken dark:hover:bg-raised'}`}
          style={current === name ? { color: project.color } : undefined} onClick={() => pick(name)}>
          <Icon name={name} />
        </button>
      ))}
    </div>
  )
}

const ACTIVITY_PANEL = 'project-activity'
const HISTORY_PANEL = 'project-history'

export function ProjectHeader({ project, userId, actions, layout }: {
  project: Project
  userId?: string
  /** Page actions rendered after Share (the duration filter, touch Select). */
  actions?: ReactNode
  /** The List/Board control, first among the actions (app-shell "Page template"). */
  layout?: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [sharing, setSharing] = useState(false)
  // Cached membership (project-sharing): roles render the same offline.
  const membership = useLiveQuery(() => db.memberships.get(project.id), [project.id])
  const role = membership?.role ?? 'owner'
  const editable = canEditProject(role)
  const [name, setName] = useState(project.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const [startPicker, setStartPicker] = useState<string | null>(null)
  const occupant = usePanelOccupantKey()

  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [] as Project[])
  const targets = useMemo(() => moveTargets(project, projects), [projects, project])
  const subCount = useMemo(() => projects.filter((p) => p.parent_id === project.id && !p.deleted_at).length, [projects, project.id])
  const openTasks = useLiveQuery(() => db.tasks.filter((t) => t.project_id === project.id && !t.deleted_at && !t.completed_at).count(), [project.id], 0)

  // Activity and History are occupants of the shell's panel slot (app-shell "The
  // panel slot has an address"), opened from the overflow menu or Shift+H.
  const showActivity = () => (occupant === ACTIVITY_PANEL ? closePanel() : openPanel(ACTIVITY_PANEL, () => <PanelFrame title="Activity" testId="project-activity"><ProjectActivity project={project} /></PanelFrame>))
  const showHistory = () => (occupant === HISTORY_PANEL ? closePanel() : openPanel(HISTORY_PANEL, () => <PanelFrame title="History" testId="project-history"><HistoryPanel entity="project" id={project.id} readOnly={!editable} embedded /></PanelFrame>))
  const activityRef = useRef(showActivity)
  activityRef.current = showActivity

  // `m` opens the menu on the Move picker, so a move is reachable without a mouse;
  // Shift+S opens the share dialog (members, roles, leave, transfer); Shift+H the activity.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key !== 'm' && e.key !== 'S' && e.key !== 'H') || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'S') {
        e.preventDefault()
        setSharing(true)
        return
      }
      if (e.key === 'H') {
        e.preventDefault()
        activityRef.current()
        return
      }
      if (!editable) return
      e.preventDefault()
      // `m` opens the menu straight into the "Move to" picker step.
      setStartPicker('move')
      setMenuOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editable])

  async function save() {
    setEditing(false)
    if (name.trim() && name.trim() !== project.name) await updateProject(project.id, { name: name.trim() })
    else setName(project.name)
  }

  const [dialog, setDialog] = useState<'duplicate' | 'template' | null>(null)
  const panels: ActionGroup = { items: [
    { kind: 'action', id: 'activity', label: 'Activity', icon: 'history', shortcut: 'Shift+H', onSelect: showActivity },
    { kind: 'action', id: 'history', label: 'History', icon: 'rotate-ccw', onSelect: showHistory },
  ] }
  // Every role gets the copies (project-templates D6); editing items follow the role inside projectMenuGroups.
  const groups: ActionGroup[] = [
    ...projectMenuGroups(project, { role, shared: !!membership, targets, subCount, openTasks },
      { rename: () => setEditing(true), duplicate: () => setDialog('duplicate'), saveTemplate: () => setDialog('template') }),
    panels,
  ]

  const title = editing ? (
    <input className="ui-input max-w-xs text-h1 font-semibold" autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name"
      onBlur={() => void save()} onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setName(project.name); setEditing(false) } }} />
  ) : editable ? (
    <Tooltip label="Rename"><button type="button" className="user-text min-w-0 truncate rounded-control text-left hover:bg-sunken dark:hover:bg-raised" onClick={() => setEditing(true)} data-project-name>{project.name}</button></Tooltip>
  ) : <span className="user-text min-w-0 truncate" data-project-name>{project.name}</span>

  const meta = (
    <>
      {membership && (
        <button type="button" className="flex items-center gap-1 text-meta text-muted hover:text-default" onClick={() => setSharing(true)} aria-label={`Members: ${membership.members.map((m) => `${m.name || m.email} (${m.role})`).join(', ')}`}>
          <span className="flex -space-x-1">
            {membership.members.slice(0, 4).map((m) => (
              <span key={m.userId} className="flex h-5 w-5 items-center justify-center rounded-full border border-surface bg-sunken text-hint font-semibold uppercase text-muted dark:bg-raised">
                {(m.name || m.email).slice(0, 1)}
              </span>
            ))}
          </span>
          <span>{membership.members.length} · {role}</span>
        </button>
      )}
      {role === 'viewer' && <span role="note" className="rounded-chip bg-sunken px-1.5 py-0.5 text-meta text-muted">Read-only</span>}
    </>
  )

  return (
    <>
      <PageHeader title={title} leading={<ProjectMark project={project} size="md" />} meta={meta} help="project"
        actions={<>
          {layout}
          <Tooltip label={canManageMembers(role) ? 'Share project' : 'Members'} shortcut="Shift+S">
            <Button variant="ghost" size="sm" icon="users" onClick={() => setSharing(true)} aria-haspopup="dialog" data-project-share>{canManageMembers(role) ? 'Share' : 'Members'}</Button>
          </Tooltip>
          {actions}
        </>}
        menu={<ActionMenu label="Project menu" title={project.name} groups={groups} header={editable ? <><ColourSwatches project={project} /><IconSwatches project={project} /></> : undefined}
          trigger={<Icon name="ellipsis" size="md" />} triggerClassName="btn-ghost touch-target px-2 py-1.5" width="sm:w-72"
          open={menuOpen} onOpenChange={(v) => { setMenuOpen(v); if (!v) setStartPicker(null) }} startPicker={startPicker} />} />
      {sharing && <ShareDialog project={project} userId={userId ?? ''} cached={membership} onClose={() => setSharing(false)} />}
      {dialog === 'duplicate' && <DuplicateProjectDialog project={project} shared={!!membership} onClose={() => setDialog(null)} />}
      {dialog === 'template' && <SaveTemplateDialog project={project} onClose={() => setDialog(null)} />}
    </>
  )
}
