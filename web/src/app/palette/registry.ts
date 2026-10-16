// The command registry (OpenSpec change search-and-command-palette, design D5):
// every command the palette can run, each listed only when it applies and each
// running through the same function as the button, key or menu item it stands for.
// Object commands (project, saved view, label, section) are built from the menus'
// own item lists, so the two cannot drift; a guard test checks it.
import { createLabel } from '../../lib/labels'
import { createProject, deleteTask, detachOccurrence, parkTask, skipOccurrence, unparkTask, updateProject, updateTask } from '../../lib/ops'
import { reorderLabel, updateLabel } from '../../lib/labels'
import { deleteSection, renameSection, reorderSection } from '../../lib/sections'
import { syncNow } from '../../lib/sync'
import type { Label, Project, ProjectRole, Section, Task, User, View } from '../../lib/types'
import { createView, deleteView, reorderView, setPinned, setStartView, updateView } from '../../lib/views'
import { HUES } from '../../ui'
import type { IconName } from '../../ui'
import { labelMenuGroups } from '../LabelsView'
import type { ListState } from '../listActions'
import type { ActionGroup, ActionItem } from '../menus/ActionMenu'
import { projectMenuGroups, type MoveTarget } from '../ProjectHeader'
import { navigate, type Route } from '../router'
import { sectionMenuGroups } from '../Sections'
import { visibleSections } from '../settingsSections'
import { blockedByFocus, deadlineFocus, deferFocus, estimateFocus, placeInDay, sidebarFind } from '../signals'
import { setVimEnabled } from '../vim/prefs'
import { viewMenuGroups } from '../ViewsView'
import type { Entry, Step } from './entries'
import { runBulk } from '../bulk/BulkActions'
import { keysOf } from '../../lib/shortcuts'

/** What the registry needs to know about the screen the palette was opened on. */
export interface PaletteContext {
  route: Route
  user: User | null
  today: string
  /** The list on screen (selected task, open panel, pickers), or null. */
  list: ListState | null
  /** The selected (or open) task, when the list has one. */
  task?: Task
  /** The project, saved view or label of the current route, and the selected task's section. */
  project?: { row: Project; role: ProjectRole; shared: boolean; targets: MoveTarget[]; subCount: number; openTasks: number }
  view?: { row: View; peers: View[]; isStart: boolean }
  label?: { row: Label; labels: Label[] }
  section?: { row: Section; first: boolean; last: boolean; layout: 'list' | 'board'; count: number }
  /** The Filter view's current valid query, on the Filter view. */
  filterQuery: string | null
  /** What is typed in the box. */
  query: string
  vimEnabled: boolean
  showShortcuts: () => void
  /** Focus quick add on this screen; false when it has none. */
  focusQuickAdd: () => boolean
}

interface Command {
  id: string
  label: string
  icon?: IconName
  shortcut?: string
  /** Extra words that find the command ("todo", "done"). */
  keywords?: string
  /** The menu item this command stands for (guard test), when it comes from a menu. */
  menuLabel?: string
  run: () => unknown
}

// The "Go to" commands; their shortcut column is the registry's `go.*` rows (keyboard-shortcuts "Registry drives the guide and the palette").
const ROUTES: { label: string; route: Route; icon: IconName; shortcut?: string; keywords?: string }[] = [
  { label: 'Go to Inbox', route: { view: 'inbox' }, icon: 'inbox', shortcut: keysOf('go.inbox') },
  { label: 'Go to Today', route: { view: 'today' }, icon: 'calendar-check', shortcut: keysOf('go.today') },
  { label: 'Go to Upcoming', route: { view: 'upcoming' }, icon: 'calendar-days', shortcut: keysOf('go.upcoming') },
  { label: 'Go to Anytime', route: { view: 'anytime' }, icon: 'layers', shortcut: keysOf('go.anytime') },
  { label: 'Go to Someday', route: { view: 'someday' }, icon: 'archive', shortcut: keysOf('go.someday') },
  { label: 'Go to Assigned to me', route: { view: 'assigned' }, icon: 'user-check', shortcut: keysOf('go.assigned') },
  { label: 'Go to Calendar (Day)', route: { view: 'day' }, icon: 'clock', shortcut: keysOf('go.day'), keywords: 'day calendar' },
  { label: 'Go to Calendar (Week)', route: { view: 'week' }, icon: 'calendar-range', shortcut: keysOf('go.week'), keywords: 'week calendar' },
  { label: 'Go to Completed', route: { view: 'completed' }, icon: 'circle-check-big', shortcut: keysOf('go.completed') },
  { label: 'Go to Labels', route: { view: 'labels' }, icon: 'tag', shortcut: keysOf('go.labels') },
  { label: 'Go to Filter', route: { view: 'filter' }, icon: 'filter', shortcut: keysOf('go.filter') },
  { label: 'Go to Filters', route: { view: 'views' }, icon: 'list', shortcut: keysOf('go.views'), keywords: 'views saved filters boards dashboards' },
  { label: 'Go to Trash', route: { view: 'trash' }, icon: 'trash-2', shortcut: keysOf('go.trash') },
  { label: 'Go to Updates', route: { view: 'feed' }, icon: 'newspaper', shortcut: keysOf('go.feed'), keywords: 'activity feed changes' },
  { label: 'Go to Ask', route: { view: 'ask' }, icon: 'message-circle', shortcut: keysOf('go.ask') },
  { label: 'Open Help', route: { view: 'help' }, icon: 'list', shortcut: keysOf('go.help') },
  { label: 'Import data', route: { view: 'import' }, icon: 'upload', shortcut: keysOf('go.import') },
  { label: 'Go to Settings', route: { view: 'settings' }, icon: 'settings', shortcut: keysOf('go.settings') },
]

const prompt = (title: string, label: string, initial: string, onSubmit: (v: string) => unknown): Step => ({ kind: 'prompt', title, label, initial, onSubmit })

/** Commands from an object menu: every enabled item, run as the menu runs it. */
function fromMenu(prefix: string, groups: ActionGroup[], idPrefix: string): Command[] {
  return groups.flatMap((g) => g.items).filter((i) => !i.disabled).map((i: ActionItem): Command => ({
    id: `${idPrefix}:${i.id}`, label: `${prefix}: ${i.label.replace(/…$/, '')}`, icon: i.icon, shortcut: i.shortcut, menuLabel: i.label,
    run: () => (i.kind === 'picker' ? { kind: 'picker', picker: i.picker } as Step : i.kind === 'confirm' ? { kind: 'confirm', confirm: i.confirm } as Step : i.onSelect()),
  }))
}

/** Every command available in this context, in registry order. */
export function commands(ctx: PaletteContext): Command[] {
  const out: Command[] = []
  // With tasks ticked, the task commands act on the selection (bulk-edit 6.3).
  const ticked = ctx.list?.ticked?.() ?? []
  if (ticked.length > 0 && ctx.list) {
    const list = ctx.list
    const n = `${ticked.length} ${ticked.length === 1 ? 'task' : 'tasks'}`
    out.push(
      { id: 'sel:complete', label: `Complete ${n}`, icon: 'check', shortcut: keysOf('list.complete'), run: () => runBulk(ticked, { kind: 'complete' }) },
      ...([1, 2, 3, 4] as const).map((p): Command => ({ id: `sel:p${p}`, label: `Set priority ${p} on ${n}`, icon: 'flag', shortcut: String(p), run: () => runBulk(ticked, { kind: 'priority', priority: p }) })),
      { id: 'sel:today', label: `Reschedule ${n} to today`, icon: 'calendar-check', run: () => runBulk(ticked, { kind: 'due', pick: 'today' }) },
      { id: 'sel:tomorrow', label: `Reschedule ${n} to tomorrow`, icon: 'calendar-days', run: () => runBulk(ticked, { kind: 'due', pick: 'tomorrow' }) },
      { id: 'sel:next-week', label: `Reschedule ${n} to next week`, icon: 'calendar-range', run: () => runBulk(ticked, { kind: 'due', pick: 'next-week' }) },
      { id: 'sel:no-date', label: `Remove the date from ${n}`, icon: 'x', run: () => runBulk(ticked, { kind: 'due', pick: null }) },
      ...(list.openActions ? [
        { id: 'sel:labels', label: `Labels for ${n}`, icon: 'tag' as const, shortcut: keysOf('list.labels'), run: () => list.openActions!('labels') },
        { id: 'sel:move', label: `Move ${n} to a project`, icon: 'folder-input' as const, run: () => list.openActions!('move') },
        { id: 'sel:assign', label: `Assign ${n}`, icon: 'user-check' as const, shortcut: keysOf('list.assign'), run: () => list.openActions!('assign') },
      ] : []),
      { id: 'sel:trash', label: `Move ${n} to the Trash`, icon: 'trash-2', shortcut: keysOf('list.delete'), run: () => runBulk(ticked, { kind: 'trash' }) },
    )
  }
  const t = ticked.length > 0 ? undefined : ctx.task
  const writable = !!t && !!ctx.list && !ctx.list.readOnly(t)
  if (t && ctx.list) {
    const title = `“${t.title || 'Untitled'}”`
    const list = ctx.list
    out.push({ id: 'task:open', label: `Open ${title}`, icon: 'chevron-right', shortcut: keysOf('list.open'), run: () => list.open(t.id) })
    if (writable) {
      out.push(
        { id: 'task:complete', label: `${t.completed_at ? 'Reopen' : 'Complete'} ${title}`, icon: 'check', shortcut: keysOf('list.complete'), keywords: 'done finish', run: () => list.toggleComplete(t.id, !t.completed_at) },
        ...([1, 2, 3, 4] as const).map((p): Command => ({ id: `task:p${p}`, label: `Set priority ${p} on ${title}`, icon: 'flag', shortcut: String(p), run: () => updateTask(t.id, { priority: p }) })),
        { id: 'task:estimate', label: `Edit the estimate of ${title}`, icon: 'clock', shortcut: keysOf('list.estimate'), run: () => { estimateFocus.request(t.id); list.open(t.id) } },
        { id: 'task:deadline', label: `Set the deadline of ${title}`, icon: 'hourglass', shortcut: keysOf('list.deadline'), run: () => { deadlineFocus.request(t.id); list.open(t.id) } },
        { id: 'task:blocked-by', label: `Choose what ${title} waits for`, icon: 'lock', shortcut: keysOf('list.blocked-by'), keywords: 'blocked by depends dependency', run: () => { blockedByFocus.request(t.id); list.open(t.id) } },
        { id: 'task:defer', label: `Defer ${title}`, icon: 'calendar-days', shortcut: keysOf('list.defer'), keywords: 'start later', run: () => { deferFocus.request(t.id); list.open(t.id) } },
        t.start === 'someday'
          ? { id: 'task:unpark', label: `Bring back ${title} from Someday`, icon: 'archive', shortcut: keysOf('list.park'), run: () => unparkTask(t.id) }
          : { id: 'task:park', label: `Park ${title} in Someday`, icon: 'archive', shortcut: keysOf('list.park'), run: () => parkTask(t.id) },
        { id: 'task:evening', label: `${t.evening ? 'Remove' : 'Mark'} ${title} ${t.evening ? 'from' : 'for'} This Evening`, icon: 'moon', shortcut: keysOf('list.evening'), run: () => updateTask(t.id, { evening: !t.evening }) },
        { id: 'task:schedule', label: `Schedule ${title} in the Day view`, icon: 'clock', shortcut: keysOf('list.schedule'), run: () => placeInDay(t, ctx.today) },
      )
      if (list.openLabels) { const open = list.openLabels; out.push({ id: 'task:labels', label: `Add labels to ${title}`, icon: 'tag', shortcut: keysOf('list.labels'), run: () => open(t.id) }) }
      if (list.openAssignee) { const open = list.openAssignee; out.push({ id: 'task:assign', label: `Assign ${title}`, icon: 'user-check', shortcut: keysOf('list.assign'), run: () => open(t.id) }) }
      if (t.recurrence) {
        out.push(
          { id: 'task:skip', label: `Skip this occurrence of ${title}`, icon: 'repeat', shortcut: keysOf('list.skip'), run: () => skipOccurrence(t.id) },
          { id: 'task:detach', label: `This occurrence only: ${title}`, icon: 'repeat', shortcut: keysOf('list.detach'), run: () => detachOccurrence(t.id) },
        )
      }
      out.push({ id: 'task:trash', label: `Move ${title} to the Trash`, icon: 'trash-2', shortcut: keysOf('list.delete'), keywords: 'delete remove', run: () => deleteTask(t.id) })
    }
  }

  if (ctx.project) {
    const p = ctx.project
    const name = p.row.name
    out.push(...fromMenu(`Project “${name}”`, projectMenuGroups(p.row, p, {
      rename: () => prompt('Rename project', 'Project name', name, (v) => updateProject(p.row.id, { name: v.trim() })),
    }), 'project'))
    if (p.role !== 'viewer') {
      out.push(...HUES.map((h): Command => ({ id: `project:colour:${h.name}`, label: `Project “${name}”: Colour ${h.name}`, icon: 'palette', menuLabel: `Colour ${h.name}`, run: () => updateProject(p.row.id, { color: h.hex }) })))
    }
  }
  if (ctx.view) {
    const v = ctx.view
    out.push(...fromMenu(`View “${v.row.name}”`, viewMenuGroups(v.row, v.peers, v.isStart, {
      rename: () => prompt('Rename view', 'View name', v.row.name, (n) => updateView(v.row.id, { name: n })),
      move: (d) => reorderView(v.row.id, d),
      pin: (pinned) => setPinned(v.row.id, pinned),
      startView: () => setStartView(`view:${v.row.id}`),
      remove: () => deleteView(v.row.id).then(() => navigate({ view: 'views' })),
    }), 'view'))
  }
  if (ctx.label) {
    const l = ctx.label
    out.push(...fromMenu(`Label “${l.row.name}”`, labelMenuGroups(l.row, l.labels, {
      edit: () => navigate({ view: 'labels' }),
      rename: () => prompt('Rename label', 'Label name', l.row.name, (n) => updateLabel(l.row.id, { name: n })),
      move: (to) => reorderLabel(l.row.id, to),
    }), 'label'))
  }
  if (ctx.section) {
    const s = ctx.section
    out.push(...fromMenu(`Section “${s.row.name}”`, sectionMenuGroups(s.row.name, s, {
      rename: () => prompt('Rename section', 'Section name', s.row.name, (n) => renameSection(s.row.id, n)),
      move: (d) => reorderSection(s.row.id, d),
      remove: () => deleteSection(s.row.id),
    }), 'section'))
  }

  if (ctx.route.view === 'filter' && ctx.filterQuery) {
    const q = ctx.filterQuery
    out.push({ id: 'filter:save', label: 'Save filter as view', icon: 'filter', shortcut: keysOf('filter.save'), run: () => prompt('Save view', 'View name', '', async (name) => {
      const id = await createView({ name, query: q })
      navigate({ view: 'view', id })
    }) })
  }

  out.push(
    { id: 'new:task', label: 'Quick add a task', icon: 'plus', shortcut: keysOf('list.quick-add'), keywords: 'new task add create', run: () => { if (!ctx.focusQuickAdd()) navigate({ view: 'inbox' }) } },
    { id: 'new:project', label: 'New project', icon: 'plus', keywords: 'add create', run: () => prompt('New project', 'Project name', '', async (name) => navigate({ view: 'project', id: await createProject({ name }) })) },
    { id: 'new:label', label: 'New label', icon: 'tag', keywords: 'add create', run: () => prompt('New label', 'Label name', '', async (name) => navigate({ view: 'label', id: await createLabel({ name }) })) },
    { id: 'new:dashboard', label: 'New dashboard', icon: 'list', keywords: 'add create', run: () => prompt('New dashboard', 'Dashboard name', '', async (name) => navigate({ view: 'view', id: await createView({ name, kind: 'dashboard' }) })) },
    ...ROUTES.map((r): Command => ({ id: `go:${r.route.view}`, label: r.label, icon: r.icon, shortcut: r.shortcut, keywords: r.keywords, run: () => navigate(r.route) })),
    ...(ctx.user ? visibleSections(ctx.user) : []).map((s): Command => ({ id: `go:settings:${s.id}`, label: `Open Settings: ${s.label}`, icon: s.icon, run: () => navigate({ view: 'settings', section: s.id }) })),
    { id: 'app:sync', label: 'Sync now', icon: 'rotate-ccw', run: () => syncNow() },
    { id: 'app:shortcuts', label: 'Keyboard shortcuts', icon: 'list', shortcut: keysOf('global.help'), run: () => ctx.showShortcuts() },
    { id: 'app:sidebar-find', label: 'Find in the sidebar', icon: 'search', shortcut: keysOf('go.find'), keywords: 'project label filter', run: () => sidebarFind.request('open') },
    { id: 'app:vim', label: `${ctx.vimEnabled ? 'Turn off' : 'Turn on'} Vim keybindings`, icon: 'settings', run: () => setVimEnabled(!ctx.vimEnabled) },
  )
  if (ctx.query.trim()) {
    const q = ctx.query.trim()
    out.push({ id: 'app:help-search', label: `Search Help for “${q}”`, icon: 'search', run: () => navigate({ view: 'help', q }) })
  }
  return out
}

/** Commands as palette entries. */
export function commandEntries(ctx: PaletteContext): Entry[] {
  return commands(ctx).filter((c) => c.id !== 'app:help-search').map(toEntry)
}

function toEntry(c: Command): Entry {
  return { kind: 'command', key: `cmd:${c.id}`, label: c.label, icon: c.icon, shortcut: c.shortcut, keywords: c.keywords, run: c.run }
}

/** "Search Help for …", listed after every match. */
export function trailingEntries(ctx: PaletteContext): Entry[] {
  return commands(ctx).filter((c) => c.id === 'app:help-search').map(toEntry)
}

/** Commands that act on the screen (selected task, current project, view, label or filter): listed first in an empty box. */
export function contextEntries(ctx: PaletteContext): Entry[] {
  return commandEntries(ctx).filter((e) => /^cmd:(sel|task|project|view|label|section|filter):/.test(e.key))
}

