import { Button, Icon, IconPicker, PageHeader, Tooltip } from '../ui'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useMembership, useProjects } from '../lib/localData'
import { useDemo } from '../lib/demo'
import { useOnline } from '../lib/online'
import { archiveProject, deleteProject, moveProject, updateProject } from '../lib/ops'
import { buildProjectTree, descendantIds } from '../lib/projects'
import { canDeleteProject, canEditProject, canEditTasks, canManageMembers } from '../lib/sharing'
import { flattenTree } from '../lib/tree'
import type { Project, ProjectRole } from '../lib/types'
import { navigate } from './router'
import { DEFAULT_DISPLAY_OPTIONS } from './display/displayOptions'
import { ShareDialog } from './ShareDialog'
import { DuplicateProjectDialog, SaveTemplateDialog } from './TemplateDialogs'
import { FieldsDialog } from './FieldsDialog'
import { HistoryPanel } from './HistoryPanel'
import { ProjectActivity } from './ProjectActivity'
import { ActionMenu, type ActionGroup } from './menus/ActionMenu'
import { iconPickerSpec } from './menus/stylePickers'
import { closePanel, openPanel, usePanelOccupantKey } from './panel'
import { PanelFrame } from './PanelFrame'
import { ProjectMark } from './Sidebar'
import { useShortcutScope } from './shortcuts'
import { keysOf } from '../lib/shortcuts'
import { HUES, hueFor } from '../ui'
import { t } from '../lib/i18n'
import { roleName } from '../lib/roleNames'
import { hueName } from '../lib/colourNames'
import { act } from './actionError'
import { setFavourite } from '../lib/favourites'
import { useIsFavourite } from './useFavourites'
import { pinItem } from './menus/pinItem'
import { useOpenTaskCount } from '../lib/liveTasks'
import { useProjectViewMode, useShowCompletedPref } from '../lib/liveData'
import { saveShowCompleted } from '../lib/sections'

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
    <div role="group" aria-label={t('Colour')} className="flex flex-wrap gap-1 px-1.5 py-1.5">
      {HUES.map((h) => (
        <button key={h.name} type="button" role="menuitemradio" aria-checked={h.name === current} aria-label={t('Colour {name}', { name: hueName(h.name) })} data-menu-label={`Colour ${h.name}`}
          className="touch-target inline-flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus"
          onClick={() => act(updateProject(project.id, { color: h.hex }))}>
          <span data-hue={h.name} className={`block h-5 w-5 rounded-full bg-hue-solid ${h.name === current ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}`} />
        </button>
      ))}
    </div>
  )
}

/**
 * The project menu as data (labels-and-menus D1), shared by the project header and
 * the command palette (search-and-command-palette D5) so both run the same handlers.
 * "Pin to sidebar" (sidebar-favourites) is offered to every role: it changes the
 * user's own preferences, never the project.
 */
export function projectMenuGroups(project: Project, o: { role: ProjectRole; shared: boolean; targets: MoveTarget[]; subCount: number; openTasks: number; pinned?: boolean }, a: { rename: () => unknown; duplicate?: () => unknown; saveTemplate?: () => unknown; fields?: () => unknown; pin?: () => unknown }): ActionGroup[] {
  const { role, targets, subCount, openTasks } = o
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
  if (!canEditProject(role)) return [...pin, ...copies, ...fields]
  return [
    ...pin,
    ...copies,
    ...fields,
    { items: [
      { kind: 'picker', id: 'move', label: t('Move to'), icon: 'folder-input', shortcut: keysOf('project.move'), picker: {
        title: t('Move to'), placeholder: t('Find a project…'), emptyText: t('No other project can hold this one'),
        source: targets, getKey: (item: MoveTarget) => item.id || '__top__', getLabel: (entry: MoveTarget) => entry.name, getPath: (x1: MoveTarget) => x1.path,
        selected: [project.parent_id ?? '__top__'], rankContext: 'project-move',
        onPick: (item: MoveTarget) => { act(moveProject(project.id, item.id || null)) },
      } },
      { kind: 'action', id: 'rename', label: t('Rename'), icon: 'pencil', onSelect: a.rename },
      // The searchable icon picker (icons-and-section-style), inside the same overlay.
      { kind: 'step', id: 'icon', label: t('Icon'), icon: 'image', step: {
        title: t('Icon'),
        render: (done, back) => (
          <IconPicker value={project.icon} color={project.color} onClose={back}
            noneMark={<span className="block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />}
            onPick={(icon) => { act(updateProject(project.id, { icon })); done() }} />
        ),
        palette: iconPickerSpec(project.icon, (icon) => act(updateProject(project.id, { icon }))),
      } },
      { kind: 'confirm', id: 'archive', label: subCount ? t('Archive with sub-projects') : t('Archive'), icon: 'archive', confirm: {
        title: t('Archive “{name}”?', { name: project.name }), tone: 'default', confirmLabel: t('Archive'),
        body: subCount
          ? t('{tasks, plural, one {It leaves the sidebar with # open task} other {It leaves the sidebar with # open tasks}} {subs, plural, one {and its sub-project} other {and its # sub-projects}}. You can unarchive it from Settings → Data.', { tasks: openTasks, subs: subCount })
          : t('{tasks, plural, one {It leaves the sidebar with # open task.} other {It leaves the sidebar with # open tasks.}} You can unarchive it from Settings → Data.', { tasks: openTasks }),
        onConfirm: () => archiveProject(project.id).then(() => navigate({ view: 'inbox' })),
      } },
    ] },
    ...(canDeleteProject(role) ? [{ items: [{ kind: 'confirm' as const, id: 'delete', label: t('Delete project'), icon: 'trash-2' as const, tone: 'danger' as const, confirm: {
      title: t('Delete “{name}”?', { name: project.name }), confirmLabel: t('Delete project'),
      body: o.shared
        ? t('{n, plural, one {It is deleted for every member. A copy of its # open task goes to your Inbox.} other {It is deleted for every member. Copies of its # open tasks go to your Inbox.}}', { n: openTasks }) + subsText
        : t('{n, plural, one {It moves to the Trash with # open task. You can restore it from the Trash.} other {It moves to the Trash with # open tasks. You can restore it from the Trash.}}', { n: openTasks }) + subsText,
      onConfirm: () => deleteProject(project.id).then(() => navigate({ view: 'inbox' })),
    } }] }] : []),
  ]

}

const ACTIVITY_PANEL = 'project-activity'
const HISTORY_PANEL = 'project-history'

export function ProjectHeader({ project, userId, actions, layout, subtitle }: {
  project: Project
  userId?: string
  /** Below 768 px, a line under the title in the shell's bar (the board's current column). */
  subtitle?: ReactNode
  /** Page actions rendered after Share (the duration filter, touch Select). */
  actions?: ReactNode
  /** The List/Board control, first among the actions (app-shell "Page template"). */
  layout?: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [sharing, setSharing] = useState<false | true | 'public'>(false)
  // Cached membership (project-sharing): roles render the same offline.
  const membership = useMembership(project.id)
  const role = membership?.role ?? 'owner'
  const editable = canEditProject(role)
  const [name, setName] = useState(project.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const [startPicker, setStartPicker] = useState<string | null>(null)
  const occupant = usePanelOccupantKey()
  // The "Public" badge (public-links): read from the server while online, for the
  // owner and admins only; never from synced data, so it is absent offline.
  const online = useOnline()
  const demo = useDemo()
  const [publicLinks, setPublicLinks] = useState(0)
  const managesLinks = canManageMembers(role) && !demo
  useEffect(() => {
    if (!online || !managesLinks) { setPublicLinks(0); return }
    let cancelled = false
    api.listPublicLinks(project.id).then((r) => { if (!cancelled) setPublicLinks(r.links.length) }, () => { if (!cancelled) setPublicLinks(0) })
    return () => { cancelled = true }
  }, [online, managesLinks, project.id])

  const projects = useProjects()
  const targets = useMemo(() => moveTargets(project, projects), [projects, project])
  const subCount = useMemo(() => projects.filter((p) => p.parent_id === project.id && !p.deleted_at).length, [projects, project.id])
  const openTasks = useOpenTaskCount(project.id)
  const pinned = useIsFavourite('project', project.id)
  // "Show completed tasks" (project-completed-section): a list-layout preference of this device.
  const listLayout = useProjectViewMode(project.id) === 'list'
  const showCompleted = useShowCompletedPref(project.id)

  // Activity and History are occupants of the shell's panel slot (app-shell "The
  // panel slot has an address"), opened from the overflow menu or Shift+H.
  const showActivity = () => (occupant === ACTIVITY_PANEL ? closePanel() : openPanel(ACTIVITY_PANEL, () => <PanelFrame title={t('Activity')} testId="project-activity"><ProjectActivity project={project} /></PanelFrame>))
  const showHistory = () => (occupant === HISTORY_PANEL ? closePanel() : openPanel(HISTORY_PANEL, () => <PanelFrame title={t('History')} testId="project-history"><HistoryPanel entity="project" id={project.id} readOnly={!editable} embedded /></PanelFrame>))
  const activityRef = useRef(showActivity)
  activityRef.current = showActivity

  // `m` opens the menu on the Move picker, so a move is reachable without a mouse;
  // Shift+S opens the share dialog (members, roles, leave, transfer); Shift+H the activity.
  // The project's `view` scope (keyboard-shortcuts "Resolved conflicts"): Shift+S shares, Shift+H toggles the activity, `m` moves.
  useShortcutScope('view', {
    'project.share': () => setSharing(true),
    'project.activity': () => activityRef.current(),
    // `m` opens the menu straight into the "Move to" picker step.
    'project.move': () => { if (!editable) return false; setStartPicker('move'); setMenuOpen(true) },
    // Shift+F opens the Fields dialog for editors and above (custom-fields).
    'project.fields': () => { if (!canEditTasks(role)) return false; setDialog('fields') },
  }, { view: 'project' })

  async function save() {
    setEditing(false)
    if (name.trim() && name.trim() !== project.name) await updateProject(project.id, { name: name.trim() })
    else setName(project.name)
  }

  const [dialog, setDialog] = useState<'duplicate' | 'template' | 'fields' | null>(null)
  const panels: ActionGroup = { items: [
    ...(listLayout ? [{ kind: 'check' as const, id: 'show-completed', label: t('Show completed tasks'), icon: 'circle-check-big' as const, checked: showCompleted, onSelect: () => saveShowCompleted(project.id, !showCompleted) }] : []),
    { kind: 'action', id: 'activity', label: t('Activity'), icon: 'history', shortcut: keysOf('project.activity'), onSelect: showActivity },
    { kind: 'action', id: 'history', label: t('History'), icon: 'rotate-ccw', onSelect: showHistory },
    // Display mode (display-mode D6): the project in large type, without the shell.
    { kind: 'action', id: 'display', label: t('Display mode'), icon: 'monitor', onSelect: () => navigate({ view: 'display', target: { kind: 'project', id: project.id }, options: { ...DEFAULT_DISPLAY_OPTIONS } }) },
  ] }
  // Every role gets the copies (project-templates D6); editing items follow the role inside projectMenuGroups.
  const groups: ActionGroup[] = [
    ...projectMenuGroups(project, { role, shared: !!membership, targets, subCount, openTasks, pinned },
      { rename: () => setEditing(true), duplicate: () => setDialog('duplicate'), saveTemplate: () => setDialog('template'), fields: () => setDialog('fields'), pin: () => setFavourite('project', project.id, !pinned) }),
    panels,
  ]

  const title = editing ? (
    <input className="ui-input max-w-xs text-h1 font-semibold" autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label={t('Project name')}
      onBlur={() => void save()} onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setName(project.name); setEditing(false) } }} />
  ) : editable ? (
    <Tooltip label={t('Rename')}><button type="button" className="user-text min-w-0 truncate rounded-control text-left hover:bg-sunken dark:hover:bg-raised" onClick={() => setEditing(true)} data-project-name>{project.name}</button></Tooltip>
  ) : <span className="user-text min-w-0 truncate" data-project-name>{project.name}</span>

  const meta = (
    <>
      {membership && (
        <button type="button" className="flex items-center gap-1 text-meta text-muted hover:text-default" onClick={() => setSharing(true)}>
          {/* Named by its content (WCAG 2.5.3 Label in Name): the member list is visually hidden, the initials and count are not read. */}
          <span className="sr-only">{t('Members: {list}', { list: membership.members.map((m) => `${m.name || m.email} (${roleName(m.role)})`).join(', ') })}</span>
          <span aria-hidden className="flex -space-x-1">
            {membership.members.slice(0, 4).map((m) => (
              <span key={m.userId} className="flex h-5 w-5 items-center justify-center rounded-full border border-surface bg-sunken text-hint font-semibold uppercase text-muted dark:bg-raised">
                {(m.name || m.email).slice(0, 1)}
              </span>
            ))}
          </span>
          <span aria-hidden>{membership.members.length} · {roleName(role)}</span>
        </button>
      )}
      {role === 'viewer' && <span role="note" className="rounded-chip bg-sunken px-1.5 py-0.5 text-meta text-muted">{t('Read-only')}</span>}
      {online && managesLinks && publicLinks > 0 && (
        <button type="button" data-public-badge onClick={() => setSharing('public')}
          aria-label={t('{n, plural, one {Public: # active link. Open the public links} other {Public: # active links. Open the public links}}', { n: publicLinks })}
          className="inline-flex items-center gap-1 rounded-chip bg-warning-soft px-1.5 py-0.5 text-meta font-medium text-on-warning-soft hover:underline">
          <Icon name="globe" size="xs" />{t('Public')}
        </button>
      )}
    </>
  )

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} leading={<ProjectMark project={project} size="md" />} meta={meta} help="project"
        actions={<>
          {layout}
          <Tooltip label={canManageMembers(role) ? t('Share project') : t('Members')} shortcut={keysOf('project.share')}>
            <Button variant="ghost" size="sm" icon="users" onClick={() => setSharing(true)} aria-haspopup="dialog" data-project-share>{canManageMembers(role) ? t('Share') : t('Members')}</Button>
          </Tooltip>
          {actions}
        </>}
        menu={<ActionMenu label={t('Project menu')} title={project.name} groups={groups} header={editable ? <ColourSwatches project={project} /> : undefined}
          trigger={<Icon name="ellipsis" size="md" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 py-1.5" width="sm:w-72"
          open={menuOpen} onOpenChange={(v) => { setMenuOpen(v); if (!v) setStartPicker(null) }} startPicker={startPicker} />} />
      {sharing && <ShareDialog project={project} userId={userId ?? ''} cached={membership ?? undefined} section={sharing === 'public' ? 'public' : undefined}
        onPublicLinks={setPublicLinks} onClose={() => setSharing(false)} />}
      {dialog === 'duplicate' && <DuplicateProjectDialog project={project} shared={!!membership} onClose={() => setDialog(null)} />}
      {dialog === 'template' && <SaveTemplateDialog project={project} onClose={() => setDialog(null)} />}
      {dialog === 'fields' && <FieldsDialog project={project} onClose={() => setDialog(null)} />}
    </>
  )
}
