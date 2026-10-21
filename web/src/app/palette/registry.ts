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
import { createView, deleteView, reorderView, setStartView, updateView } from '../../lib/views'
import { setFavourite } from '../../lib/favourites'
import { HUES } from '../../ui'
import type { IconName } from '../../ui'
import { labelMenuGroups } from '../LabelsView'
import type { ListState } from '../listActions'
import type { ActionGroup, ActionItem } from '../menus/ActionMenu'
import { projectMenuGroups, type MoveTarget } from '../ProjectHeader'
import { navigate, type Route } from '../router'
import { sectionMenuGroups } from '../Sections'
import { requestTemplateDialog } from '../TemplateDialogs'
import { visibleSections } from '../settingsSections'
import { blockedByFocus, deadlineFocus, deferFocus, estimateFocus, locationFocus, placeInDay, sidebarFind } from '../signals'
import { setVimEnabled } from '../vim/prefs'
import { viewMenuGroups } from '../ViewsView'
import type { Entry, Step } from './entries'
import { runBulk } from '../bulk/BulkActions'
import { keysOf } from '../../lib/shortcuts'
import { hueName } from '../../lib/colourNames'
import { t, msg, translatedList } from '../../lib/i18n'

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
  project?: { row: Project; role: ProjectRole; shared: boolean; targets: MoveTarget[]; subCount: number; openTasks: number; pinned?: boolean }
  view?: { row: View; peers: View[]; isStart: boolean }
  label?: { row: Label; labels: Label[]; pinned?: boolean }
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
type RouteCommand = { label: string; route: Route; icon: IconName; shortcut?: string; keywords?: string }
const ROUTES: RouteCommand[] = translatedList<RouteCommand, 'label'>([
  { label: msg('Go to Inbox'), route: { view: 'inbox' }, icon: 'inbox', shortcut: keysOf('go.inbox') },
  { label: msg('Go to Today'), route: { view: 'today' }, icon: 'calendar-check', shortcut: keysOf('go.today') },
  { label: msg('Go to Upcoming'), route: { view: 'upcoming' }, icon: 'calendar-days', shortcut: keysOf('go.upcoming') },
  { label: msg('Go to Anytime'), route: { view: 'anytime' }, icon: 'layers', shortcut: keysOf('go.anytime') },
  { label: msg('Go to Someday'), route: { view: 'someday' }, icon: 'archive', shortcut: keysOf('go.someday') },
  { label: msg('Go to Assigned to me'), route: { view: 'assigned' }, icon: 'user-check', shortcut: keysOf('go.assigned') },
  { label: msg('Go to Calendar (Day)'), route: { view: 'day' }, icon: 'clock', shortcut: keysOf('go.day'), keywords: 'day calendar' },
  { label: msg('Go to Calendar (Week)'), route: { view: 'week' }, icon: 'calendar-range', shortcut: keysOf('go.week'), keywords: 'week calendar' },
  { label: msg('Go to Calendar (Plan)'), route: { view: 'plan' }, icon: 'calendar-range', shortcut: keysOf('go.plan'), keywords: 'plan next two weeks capacity calendar' },
  { label: msg('Go to Completed'), route: { view: 'completed' }, icon: 'circle-check-big', shortcut: keysOf('go.completed') },
  { label: msg('Go to Projects'), route: { view: 'projects' }, icon: 'folder', shortcut: keysOf('go.projects'), keywords: 'all projects archived tree' },
  { label: msg('Go to Labels'), route: { view: 'labels' }, icon: 'tag', shortcut: keysOf('go.labels') },
  { label: msg('Go to Filter'), route: { view: 'filter' }, icon: 'filter', shortcut: keysOf('go.filter') },
  { label: msg('Go to Filters'), route: { view: 'views' }, icon: 'list', shortcut: keysOf('go.views'), keywords: 'views saved filters boards dashboards' },
  { label: msg('Go to Trash'), route: { view: 'trash' }, icon: 'trash-2', shortcut: keysOf('go.trash') },
  // Saved locations (task-locations D7): a command without a default key.
  { label: msg('Go to Locations'), route: { view: 'places' }, icon: 'map-pin', keywords: 'places map addresses' },
  { label: msg('Go to Updates'), route: { view: 'feed' }, icon: 'newspaper', shortcut: keysOf('go.feed'), keywords: 'activity feed changes' },
  { label: msg('Go to Ask'), route: { view: 'ask' }, icon: 'message-circle', shortcut: keysOf('go.ask') },
  { label: msg('Open Help'), route: { view: 'help' }, icon: 'list', shortcut: keysOf('go.help') },
  { label: msg('Go to Review'), route: { view: 'review' }, icon: 'clipboard-check', shortcut: keysOf('go.review'), keywords: 'weekly review' },
  { label: msg('Close the day'), route: { view: 'review', step: 'close' }, icon: 'moon', shortcut: keysOf('go.close'), keywords: 'end of day evening tomorrow carry over' },
  { label: msg('Go to the Loop home'), route: { view: 'loop' }, icon: 'rotate-ccw', shortcut: keysOf('go.loop'), keywords: 'open loops method home dashboard' },
  { label: msg('Go to Next'), route: { view: 'next' }, icon: 'arrow-right', shortcut: keysOf('go.next'), keywords: 'next actions contexts open loops' },
  { label: msg('Go to Waiting'), route: { view: 'waiting' }, icon: 'hourglass', shortcut: keysOf('go.waiting'), keywords: 'waiting for delegated blocked open loops' },
  { label: msg('Go to Focus'), route: { view: 'focus' }, icon: 'clock', shortcut: keysOf('go.focus'), keywords: 'focus timer pomodoro flowtime countdown session' },
  { label: msg('Go to Statistics'), route: { view: 'stats' }, icon: 'chart-column', shortcut: keysOf('go.stats'), keywords: 'stats productivity completed' },
  { label: msg('Import data'), route: { view: 'import' }, icon: 'upload', shortcut: keysOf('go.import') },
  { label: msg('Go to Settings'), route: { view: 'settings' }, icon: 'settings', shortcut: keysOf('go.settings') },
], 'label')

const prompt = (title: string, label: string, initial: string, onSubmit: (v: string) => unknown): Step => ({ kind: 'prompt', title, label, initial, onSubmit })

/** Commands from an object menu: every enabled item, run as the menu runs it. */
function fromMenu(prefix: string, groups: ActionGroup[], idPrefix: string): Command[] {
  // A step (the icon grid, the colour swatches) runs here as its Combobox form; one without it is not listed.
  return groups.flatMap((g) => g.items).filter((i) => !i.disabled && (i.kind !== 'step' || i.step.palette)).map((i: ActionItem): Command => ({
    id: `${idPrefix}:${i.id}`, label: t('{object}: {action}', { object: prefix, action: i.label.replace(/…$/, '') }), icon: i.icon, shortcut: i.shortcut, menuLabel: i.kind === 'step' ? `${i.label}…` : i.label,
    run: () => (i.kind === 'picker' ? { kind: 'picker', picker: i.picker } as Step
      : i.kind === 'step' ? { kind: 'picker', picker: i.step.palette! } as Step
        : i.kind === 'confirm' ? { kind: 'confirm', confirm: i.confirm } as Step : i.onSelect()),
  }))
}

/** Every command available in this context, in registry order. */
export function commands(ctx: PaletteContext): Command[] {
  const out: Command[] = []
  // With tasks ticked, the task commands act on the selection (bulk-edit 6.3).
  const ticked = ctx.list?.ticked?.() ?? []
  if (ticked.length > 0 && ctx.list) {
    const list = ctx.list
    const n = t('{n, plural, one {# task} other {# tasks}}', { n: ticked.length })
    out.push(
      { id: 'sel:complete', label: t('Complete {tasks}', { tasks: n }), icon: 'check', shortcut: keysOf('list.complete'), run: () => runBulk(ticked, { kind: 'complete' }) },
      ...([1, 2, 3, 4] as const).map((p): Command => ({ id: `sel:p${p}`, label: t('Set priority {p} on {tasks}', { p, tasks: n }), icon: 'flag', shortcut: String(p), run: () => runBulk(ticked, { kind: 'priority', priority: p }) })),
      { id: 'sel:today', label: t('Reschedule {tasks} to today', { tasks: n }), icon: 'calendar-check', run: () => runBulk(ticked, { kind: 'due', pick: 'today' }) },
      { id: 'sel:tomorrow', label: t('Reschedule {tasks} to tomorrow', { tasks: n }), icon: 'calendar-days', run: () => runBulk(ticked, { kind: 'due', pick: 'tomorrow' }) },
      { id: 'sel:next-week', label: t('Reschedule {tasks} to next week', { tasks: n }), icon: 'calendar-range', run: () => runBulk(ticked, { kind: 'due', pick: 'next-week' }) },
      { id: 'sel:no-date', label: t('Remove the date from {tasks}', { tasks: n }), icon: 'x', run: () => runBulk(ticked, { kind: 'due', pick: null }) },
      ...(list.openActions ? [
        { id: 'sel:labels', label: t('Labels for {tasks}', { tasks: n }), icon: 'tag' as const, shortcut: keysOf('list.labels'), run: () => list.openActions!('labels') },
        { id: 'sel:move', label: t('Move {tasks} to a project', { tasks: n }), icon: 'folder-input' as const, run: () => list.openActions!('move') },
        { id: 'sel:assign', label: t('Assign {tasks}', { tasks: n }), icon: 'user-check' as const, shortcut: keysOf('list.assign'), run: () => list.openActions!('assign') },
      ] : []),
      { id: 'sel:trash', label: t('Move {tasks} to the Trash', { tasks: n }), icon: 'trash-2', shortcut: keysOf('list.delete'), run: () => runBulk(ticked, { kind: 'trash' }) },
    )
  }
  const tk = ticked.length > 0 ? undefined : ctx.task
  const writable = !!tk && !!ctx.list && !ctx.list.readOnly(tk)
  if (tk && ctx.list) {
    const title = `“${tk.title || t('Untitled')}”`
    const list = ctx.list
    out.push({ id: 'task:open', label: t('Open {title}', { title }), icon: 'chevron-right', shortcut: keysOf('list.open'), run: () => list.open(tk.id) })
    if (writable) {
      out.push(
        { id: 'task:complete', label: tk.completed_at ? t('Reopen {title}', { title }) : t('Complete {title}', { title }), icon: 'check', shortcut: keysOf('list.complete'), keywords: 'done finish', run: () => list.toggleComplete(tk.id, !tk.completed_at) },
        ...([1, 2, 3, 4] as const).map((p): Command => ({ id: `task:p${p}`, label: t('Set priority {p} on {title}', { p, title }), icon: 'flag', shortcut: String(p), run: () => updateTask(tk.id, { priority: p }) })),
        { id: 'task:estimate', label: t('Edit the estimate of {title}', { title }), icon: 'clock', shortcut: keysOf('list.estimate'), run: () => { estimateFocus.request(tk.id); list.open(tk.id) } },
        { id: 'task:deadline', label: t('Set the deadline of {title}', { title }), icon: 'hourglass', shortcut: keysOf('list.deadline'), run: () => { deadlineFocus.request(tk.id); list.open(tk.id) } },
        { id: 'task:blocked-by', label: t('Choose what {title} waits for', { title }), icon: 'lock', shortcut: keysOf('list.blocked-by'), keywords: 'blocked by depends dependency', run: () => { blockedByFocus.request(tk.id); list.open(tk.id) } },
        { id: 'task:location', label: t('Set the location of {title}', { title }), icon: 'map-pin', keywords: 'place address map where', run: () => { locationFocus.request(tk.id); list.open(tk.id) } },
        { id: 'task:defer', label: t('Defer {title}', { title }), icon: 'calendar-days', shortcut: keysOf('list.defer'), keywords: 'start later', run: () => { deferFocus.request(tk.id); list.open(tk.id) } },
        tk.start === 'someday'
          ? { id: 'task:unpark', label: t('Bring back {title} from Someday', { title }), icon: 'archive', shortcut: keysOf('list.park'), run: () => unparkTask(tk.id) }
          : { id: 'task:park', label: t('Park {title} in Someday', { title }), icon: 'archive', shortcut: keysOf('list.park'), run: () => parkTask(tk.id) },
        { id: 'task:evening', label: tk.evening ? t('Remove {title} from This Evening', { title }) : t('Mark {title} for This Evening', { title }), icon: 'moon', shortcut: keysOf('list.evening'), run: () => updateTask(tk.id, { evening: !tk.evening }) },
        { id: 'task:schedule', label: t('Schedule {title} in the Day view', { title }), icon: 'clock', shortcut: keysOf('list.schedule'), run: () => placeInDay(tk, ctx.today) },
      )
      if (list.openLabels) { const open = list.openLabels; out.push({ id: 'task:labels', label: t('Add labels to {title}', { title }), icon: 'tag', shortcut: keysOf('list.labels'), run: () => open(tk.id) }) }
      if (list.openAssignee) { const open = list.openAssignee; out.push({ id: 'task:assign', label: t('Assign {title}', { title }), icon: 'user-check', shortcut: keysOf('list.assign'), run: () => open(tk.id) }) }
      if (tk.recurrence) {
        out.push(
          { id: 'task:skip', label: t('Skip this occurrence of {title}', { title }), icon: 'repeat', shortcut: keysOf('list.skip'), run: () => skipOccurrence(tk.id) },
          { id: 'task:detach', label: t('This occurrence only: {title}', { title }), icon: 'repeat', shortcut: keysOf('list.detach'), run: () => detachOccurrence(tk.id) },
        )
      }
      if (!tk.completed_at) out.push({ id: 'task:focus', label: t('Focus on {title}', { title }), icon: 'clock', keywords: 'focus timer pomodoro session', run: () => navigate({ view: 'focus', id: tk.id }) })
      out.push({ id: 'task:trash', label: t('Move {title} to the Trash', { title }), icon: 'trash-2', shortcut: keysOf('list.delete'), keywords: 'delete remove', run: () => deleteTask(tk.id) })
    }
  }

  if (ctx.project) {
    const p = ctx.project
    const name = p.row.name
    out.push(...fromMenu(t('Project “{name}”', { name }), projectMenuGroups(p.row, p, {
      rename: () => prompt(t('Rename project'), t('Project name'), name, (v) => updateProject(p.row.id, { name: v.trim() })),
      pin: () => setFavourite('project', p.row.id, !p.pinned),
    }), 'project'))
    if (p.role !== 'viewer') {
      out.push(...HUES.map((h): Command => ({ id: `project:colour:${h.name}`, label: t('Project “{name}”: Colour {colour}', { name, colour: hueName(h.name) }), icon: 'palette', menuLabel: t('Colour {name}', { name: hueName(h.name) }), run: () => updateProject(p.row.id, { color: h.hex }) })))
    }
  }
  if (ctx.view) {
    const v = ctx.view
    out.push(...fromMenu(t('View “{name}”', { name: v.row.name }), viewMenuGroups(v.row, v.peers, v.isStart, {
      rename: () => prompt(t('Rename view'), t('View name'), v.row.name, (n) => updateView(v.row.id, { name: n })),
      move: (d) => reorderView(v.row.id, d),
      pin: (pinned) => setFavourite('view', v.row.id, pinned),
      startView: () => setStartView(`view:${v.row.id}`),
      remove: () => deleteView(v.row.id).then(() => navigate({ view: 'views' })),
    }), 'view'))
  }
  if (ctx.label) {
    const l = ctx.label
    out.push(...fromMenu(t('Label “{name}”', { name: l.row.name }), labelMenuGroups(l.row, l.labels, {
      edit: () => navigate({ view: 'labels' }),
      rename: () => prompt(t('Rename label'), t('Label name'), l.row.name, (n) => updateLabel(l.row.id, { name: n })),
      move: (to) => reorderLabel(l.row.id, to),
      pin: { checked: !!l.pinned, toggle: () => setFavourite('label', l.row.id, !l.pinned) },
    }), 'label'))
  }
  if (ctx.section) {
    const s = ctx.section
    out.push(...fromMenu(t('Section “{name}”', { name: s.row.name }), sectionMenuGroups(s.row.name, s, {
      section: s.row,
      rename: () => prompt(t('Rename section'), t('Section name'), s.row.name, (n) => renameSection(s.row.id, n)),
      move: (d) => reorderSection(s.row.id, d),
      remove: () => deleteSection(s.row.id),
    }), 'section'))
  }

  if (ctx.route.view === 'filter' && ctx.filterQuery) {
    const q = ctx.filterQuery
    out.push({ id: 'filter:save', label: t('Save filter as view'), icon: 'filter', shortcut: keysOf('filter.save'), run: () => prompt(t('Save view'), t('View name'), '', async (name) => {
      const id = await createView({ name, query: q })
      navigate({ view: 'view', id })
    }) })
  }

  out.push(
    { id: 'new:task', label: t('Quick add a task'), icon: 'plus', shortcut: keysOf('list.quick-add'), keywords: 'new task add create', run: () => { if (!ctx.focusQuickAdd()) navigate({ view: 'inbox' }) } },
    { id: 'new:project', label: t('New project'), icon: 'plus', keywords: 'add create', run: () => prompt(t('New project'), t('Project name'), '', async (name) => navigate({ view: 'project', id: await createProject({ name }) })) },
    { id: 'new:from-template', label: t('New project from a template'), icon: 'copy', keywords: t('template library add create'), run: () => requestTemplateDialog() },
    { id: 'new:label', label: t('New label'), icon: 'tag', keywords: 'add create', run: () => prompt(t('New label'), t('Label name'), '', async (name) => navigate({ view: 'label', id: await createLabel({ name }) })) },
    { id: 'new:dashboard', label: t('New dashboard'), icon: 'list', keywords: 'add create', run: () => prompt(t('New dashboard'), t('Dashboard name'), '', async (name) => navigate({ view: 'view', id: await createView({ name, kind: 'dashboard' }) })) },
    ...ROUTES.map((r): Command => ({ id: `go:${r.route.view}${'step' in r.route && r.route.step ? `:${r.route.step}` : ''}`, label: r.label, icon: r.icon, shortcut: r.shortcut, keywords: r.keywords, run: () => navigate(r.route) })),
    ...(ctx.user ? visibleSections(ctx.user) : []).map((s): Command => ({ id: `go:settings:${s.id}`, label: t('Open Settings: {section}', { section: s.label }), icon: s.icon, run: () => navigate({ view: 'settings', section: s.id }) })),
    { id: 'app:sync', label: t('Sync now'), icon: 'rotate-ccw', run: () => syncNow() },
    { id: 'app:shortcuts', label: t('Keyboard shortcuts'), icon: 'list', shortcut: keysOf('global.help'), run: () => ctx.showShortcuts() },
    { id: 'app:sidebar-find', label: t('Find in the sidebar'), icon: 'search', shortcut: keysOf('go.find'), keywords: t('project label filter'), run: () => sidebarFind.request('open') },
    { id: 'app:vim', label: ctx.vimEnabled ? t('Turn off Vim keybindings') : t('Turn on Vim keybindings'), icon: 'settings', run: () => setVimEnabled(!ctx.vimEnabled) },
  )
  if (ctx.query.trim()) {
    const q = ctx.query.trim()
    out.push({ id: 'app:help-search', label: t('Search Help for “{query}”', { query: q }), icon: 'search', run: () => navigate({ view: 'help', q }) })
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

