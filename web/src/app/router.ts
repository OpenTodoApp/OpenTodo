// A deliberately tiny history-based router: the app has a handful of views and
// every extra kilobyte matters on a low-end phone.
import { useMemo, useSyncExternalStore } from 'react'
import { readCalendarMode } from '../lib/calendarMode'
import { resettable } from '../lib/moduleState'
import { displayTargetPath, parseDisplayOptions, parseDisplayTarget, serializeDisplayOptions, type DisplayOptions, type DisplayTarget } from './display/displayOptions'

export type Route =
  | { view: 'inbox' }
  | { view: 'today' }
  | { view: 'upcoming' }
  | { view: 'someday' }
  | { view: 'anytime' }
  | { view: 'day'; date?: string }
  | { view: 'week'; date?: string }
  | { view: 'month'; date?: string }
  // The Calendar's Plan mode (planner-view D1): the span starts on `date`, today when absent.
  | { view: 'plan'; date?: string }
  // The Calendar's Year mode (year-view D2): the year of `date`, this year when absent.
  | { view: 'year'; date?: string }
  | { view: 'completed' }
  | { view: 'assigned' }
  | { view: 'project'; id: string }
  | { view: 'task'; id: string }
  | { view: 'label'; id: string }
  | { view: 'labels' }
  // Saved locations (task-locations, the `place` entity): /locations, and /location/<id> lists the open tasks linked to one.
  | { view: 'places' }
  | { view: 'place'; id: string }
  // Routines (routines-editor; automation-rules before): /routines, /routines/runs
  // the Runs tab; the editor page (routines-editor-page D1) at /routines/new
  // (/routines#new before) and /routines/<id>, ?run=<run> one run on it; /rules is
  // the old address. The starters (routines-starters D5): /routines/starters and
  // /routines/starters/<slug>.
  | { view: 'rules'; create?: boolean; tab?: 'runs'; id?: string; run?: string; starters?: boolean; starter?: string; describe?: boolean
    /** The routines of one project (routines-shared D12): the list filtered, or a new routine of it. */
    project?: string }
  // All projects (sidebar-favourites D6): /projects, and /projects#archived with the archived projects open.
  | { view: 'projects'; archived?: boolean }
  | { view: 'filter'; q?: string }
  | { view: 'views' }
  | { view: 'view'; id: string }
  // A settings section, or one of its sub-pages at /settings/<section>/<page> (settings-subpages).
  | { view: 'settings'; section?: SettingsSectionId; page?: string; anchor?: string }
  // The theme editor (theme-editor D3): /settings/appearance/themes/<id>, a Settings sub-page.
  | { view: 'theme-editor'; id: string }
  | { view: 'import' }
  | { view: 'invite'; token: string }
  | { view: 'project-invite'; token: string }
  // A workspace invite link (workspaces): /invite/w/<token>.
  | { view: 'workspace-invite'; token: string }
  | { view: 'reset'; token: string }
  // The link that confirms a new sign-in email (settings-refresh D10).
  | { view: 'confirm-email'; token: string }
  | { view: 'triage' }
  | { view: 'forgot' }
  | { view: 'verify'; token: string }
  | { view: 'public'; token: string }
  | { view: 'share' }
  | { view: 'trash' }
  | { view: 'feed' }
  | { view: 'ask' }
  | { view: 'help'; page?: string; q?: string }
  // A chrome-free display of one view (display-mode): /display[/today|/upcoming|/project/<id>|/view/<id>]?<options>.
  | { view: 'display'; target: DisplayTarget; options: DisplayOptions }
  // Weekly review and Statistics (stats-and-review).
  | { view: 'review'; step?: string }
  | { view: 'stats' }
  // Open Loops (open-loops-method): the derived Next and Waiting views.
  | { view: 'next' }
  | { view: 'waiting' }
  | { view: 'loop' }
  // Focus (focus-mode D7): one task and a timer; /focus takes the first task of today's focus.
  | { view: 'focus'; id?: string }
  // Notes (notes-overview D7): every note, /notes/<id> one standalone note; `create` (/notes?new=1) starts a new note.
  | { view: 'notes'; id?: string; create?: boolean }

/** Settings sections, each at /settings/<id> (settings-navigation), in list order (workspaces added Workspaces, settings-subpages Language and region). */
export const SETTINGS_SECTION_IDS = [
  'account', 'workspaces', 'appearance',
  'general', 'language', 'notifications', 'capture', 'about',
  'integrations', 'data',
  'people', 'server',
] as const
export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number]

/**
 * Section ids of earlier layouts, opened as the section or sub-page that now
 * holds their content, at the anchor of that content (settings-navigation "Legacy
 * settings addresses"). The address is replaced in place.
 */
export const LEGACY_SETTINGS_IDS: Readonly<Record<string, { section: SettingsSectionId; page?: string; anchor?: string }>> = {
  security: { section: 'account', page: 'security' },
  encryption: { section: 'account', page: 'encryption' },
  activity: { section: 'account', page: 'activity' },
  preferences: { section: 'general' },
  projects: { section: 'data', anchor: 'projects' },
  ai: { section: 'integrations', page: 'assistant' },
  admin: { section: 'people' },
  access: { section: 'people', page: 'access-policies' },
  backups: { section: 'server', page: 'backups' },
}

function isSettingsSection(s: string | undefined): s is SettingsSectionId {
  return (SETTINGS_SECTION_IDS as readonly string[]).includes(s ?? '')
}

export function parseRoute(pathname: string): Route {
  const [address, hash = ''] = pathname.split('#')
  const [path, query = ''] = address.split('?')
  const parts = path.split('/').filter(Boolean)
  switch (parts[0]) {
    case undefined:
    case 'inbox':
      return { view: 'inbox' }
    case 'today':
      return { view: 'today' }
    case 'upcoming':
      return { view: 'upcoming' }
    case 'someday':
      return { view: 'someday' }
    case 'anytime':
      return { view: 'anytime' }
    case 'completed':
      return { view: 'completed' }
    case 'assigned':
      return { view: 'assigned' }
    case 'day':
    case 'week':
    case 'month':
    case 'plan':
    case 'year':
      // An optional anchor date; anything that is not YYYY-MM-DD means "today".
      return parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) ? { view: parts[0], date: parts[1] } : { view: parts[0] }
    case 'calendar':
      // One Calendar destination (ux-overhaul): Day, Week, Month, Plan or Year as last used on this device.
      return { view: readCalendarMode() }
    case 'settings':
      // /settings/import is the import screen; an unknown section shows the overview.
      if (parts[1] === 'import') return { view: 'import' }
      if (parts[1] && parts[1] in LEGACY_SETTINGS_IDS) { const l = LEGACY_SETTINGS_IDS[parts[1]]; return { view: 'settings', section: l.section, ...(l.page ? { page: l.page } : {}), ...(l.anchor ? { anchor: l.anchor } : {}) } }
      // A sub-page id is checked against the section table by the Settings screen (settings-subpages).
      if (!isSettingsSection(parts[1])) return { view: 'settings' }
      if (parts[1] === 'appearance' && parts[2] === 'themes' && parts[3] && /^[a-z0-9-]{1,64}$/.test(parts[3])) return { view: 'theme-editor', id: parts[3] }
      return parts[2] && /^[a-z][a-z-]*$/.test(parts[2]) ? { view: 'settings', section: parts[1], page: parts[2] } : { view: 'settings', section: parts[1] }
    case 'labels':
      return { view: 'labels' }
    case 'locations':
      return { view: 'places' }
    case 'rules':
    case 'routines':
    {
      // ?project=<id>: the routines of one project, or a new one of it (routines-shared D12).
      const project = new URLSearchParams(query).get('project')
      const inProject = project && /^[\w-]{1,64}$/.test(project) ? { project } : {}
      if (hash === 'new' || parts[1] === 'new') return { view: 'rules', create: true, ...inProject }
      // /routines/describe: the Routines page with Describe it open (routines-describe-it).
      if (parts[1] === 'describe') return { view: 'rules', describe: true }
      if (parts[1] === 'starters') return parts[2] && /^[a-z0-9-]{1,64}$/.test(parts[2]) ? { view: 'rules', starters: true, starter: parts[2] } : { view: 'rules', starters: true }
      // ?run=<id>: a run opened from a notification, a channel message or an email.
      const run = new URLSearchParams(query).get('run')
      const base: Route = parts[1] === 'runs' ? { view: 'rules', tab: 'runs' } : parts[1] && /^[\w-]{1,64}$/.test(parts[1]) ? { view: 'rules', id: parts[1] } : { view: 'rules', ...inProject }
      return run && /^[\w-]{1,64}$/.test(run) ? { ...base, run } as Route : base
    }
    case 'location':
      return parts[1] ? { view: 'place', id: parts[1] } : { view: 'places' }
    case 'projects':
      return hash === 'archived' ? { view: 'projects', archived: true } : { view: 'projects' }
    case 'filter': {
      // The address before views-and-display, replaced by /views/new.
      // An initial query from the command palette (search-and-command-palette D4).
      const q = new URLSearchParams(query).get('q') ?? undefined
      return q ? { view: 'filter', q } : { view: 'filter' }
    }
    case 'share':
      return { view: 'share' }
    case 'trash':
      return { view: 'trash' }
    case 'updates':
    case 'activity':
      // "Updates" (ux-overhaul vocabulary); /activity is the old address.
      return { view: 'feed' }
    case 'ask':
      return { view: 'ask' }
    case 'help': {
      // In-app Help (user-documentation): /help, /help/<guide>, /help?q=<topic>.
      const q = new URLSearchParams(query).get('q') ?? undefined
      return { view: 'help', ...(parts[1] ? { page: safeDecode(parts[1]) } : {}), ...(q ? { q } : {}) }
    }
    case 'views': {
      // Views (views-and-display D1): /views, /views/new (the New view page, with an
      // initial query from the command palette) and /views/<id>.
      if (parts[1] === 'new') {
        const q = new URLSearchParams(query).get('q') ?? undefined
        return q ? { view: 'filter', q } : { view: 'filter' }
      }
      return parts[1] ? { view: 'view', id: parts[1] } : { view: 'views' }
    }
    case 'view':
      // The address before views-and-display, replaced by /views/<id>.
      return parts[1] ? { view: 'view', id: parts[1] } : { view: 'views' }
    case 'project':
      return parts[1] ? { view: 'project', id: parts[1] } : { view: 'inbox' }
    case 'task':
      // The expanded task page (ux-overhaul, app-shell "Panel width and expansion").
      return parts[1] ? { view: 'task', id: parts[1] } : { view: 'inbox' }
    case 'invite':
      // /invite/p/<token> is a project invite link (project-invite-links).
      if (parts[1] === 'p') return parts[2] ? { view: 'project-invite', token: safeDecode(parts[2]) } : { view: 'inbox' }
      if (parts[1] === 'w') return parts[2] ? { view: 'workspace-invite', token: safeDecode(parts[2]) } : { view: 'inbox' }
      // The secret is URL-safe base64; decode defensively in case a mail client encoded it.
      return parts[1] ? { view: 'invite', token: safeDecode(parts[1]) } : { view: 'inbox' }
    case 'reset':
      // Password reset link from an administrator or `opentodo reset-owner-password`.
      return parts[1] ? { view: 'reset', token: safeDecode(parts[1]) } : { view: 'inbox' }
    case 'confirm-email':
      return parts[1] ? { view: 'confirm-email', token: safeDecode(parts[1]) } : { view: 'inbox' }
    case 'triage':
      // Process the Inbox one task at a time (inbox-triage).
      return { view: 'triage' }
    case 'forgot':
      // Self-service password reset request (outgoing-email).
      return { view: 'forgot' }
    case 'verify':
      // Emailed sign-up confirmation (outgoing-email); completes only on the button.
      return parts[1] ? { view: 'verify', token: safeDecode(parts[1]) } : { view: 'inbox' }
    case 'public':
      // A public link to a project's list (public-links): no sign-in, no sync.
      return parts[1] ? { view: 'public', token: safeDecode(parts[1]) } : { view: 'inbox' }
    case 'label':
      return parts[1] ? { view: 'label', id: parts[1] } : { view: 'labels' }
    case 'display':
      // Display mode (display-mode D2): an unknown target shows Today; options come from the query.
      return { view: 'display', target: parseDisplayTarget(parts.slice(1)) ?? { kind: 'today' }, options: parseDisplayOptions(query) }
    // The weekly review and the statistics (stats-and-review).
    case 'review':
      return parts[1] ? { view: 'review', step: parts[1] } : { view: 'review' }
    case 'next':
      return { view: 'next' }
    case 'waiting':
      return { view: 'waiting' }
    case 'loop':
      return { view: 'loop' }
    case 'stats':
      return { view: 'stats' }
    case 'focus':
      return parts[1] ? { view: 'focus', id: safeDecode(parts[1]) } : { view: 'focus' }
    case 'notes':
      return parts[1] ? { view: 'notes', id: safeDecode(parts[1]) } : { view: 'notes' }
    default:
      return { view: 'inbox' }
  }
}

/**
 * Old and alias addresses (`/activity`, `/calendar`, earlier settings ids) open
 * their page under its current address, replacing the entry (no extra history).
 */
export function canonicalPath(pathname: string): string | null {
  const [path] = pathname.split('?')
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'activity' || parts[0] === 'calendar' || parts[0] === 'rules') return routePath(parseRoute(path))
  // /filter and /view/<id> before views-and-display (D1); the caller keeps the query (?q=).
  if (parts[0] === 'filter') return '/views/new'
  if (parts[0] === 'view') return routePath(parseRoute(path))
  if (parts[0] === 'settings' && parts[1] && parts[1] in LEGACY_SETTINGS_IDS) return routePath(parseRoute(path))
  return null
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function routePath(r: Route): string {
  switch (r.view) {
    case 'project':
    case 'label':
    case 'task':
      return `/${r.view}/${r.id}`
    case 'view':
      return `/views/${r.id}`
    case 'place':
      return `/location/${r.id}`
    case 'places':
      return '/locations'
    case 'rules':
      if (r.describe) return '/routines/describe'
      if (r.starters) return r.starter ? `/routines/starters/${encodeURIComponent(r.starter)}` : '/routines/starters'
      return (r.create ? '/routines/new' : r.tab === 'runs' ? '/routines/runs' : r.id ? `/routines/${encodeURIComponent(r.id)}` : '/routines') + (r.run ? `?run=${encodeURIComponent(r.run)}` : '')
        + (r.project && !r.id && r.tab !== 'runs' ? `?project=${encodeURIComponent(r.project)}` : '')
    case 'invite':
    case 'reset':
    case 'confirm-email':
      return `/${r.view}/${encodeURIComponent(r.token)}`
    case 'project-invite':
      return `/invite/p/${encodeURIComponent(r.token)}`
    case 'workspace-invite':
      return `/invite/w/${encodeURIComponent(r.token)}`
    case 'forgot':
      return '/forgot'
    case 'verify':
      return `/verify/${encodeURIComponent(r.token)}`
    case 'public':
      return `/public/${encodeURIComponent(r.token)}`
    case 'day':
    case 'week':
    case 'month':
    case 'plan':
    case 'year':
      return r.date ? `/${r.view}/${r.date}` : `/${r.view}`
    case 'inbox':
      return '/'
    case 'settings':
      return r.section ? `/settings/${r.section}${r.page ? `/${r.page}` : ''}` : '/settings'
    case 'theme-editor':
      return `/settings/appearance/themes/${encodeURIComponent(r.id)}`
    case 'import':
      return '/settings/import'
    case 'projects':
      return r.archived ? '/projects#archived' : '/projects'
    case 'feed':
      return '/updates'
    case 'ask':
      return '/ask'
    case 'filter':
      return r.q ? `/views/new?q=${encodeURIComponent(r.q)}` : '/views/new'
    case 'display': {
      const q = serializeDisplayOptions(r.options)
      return `${displayTargetPath(r.target)}${q ? `?${q}` : ''}`
    }
    case 'review':
      return r.step ? `/review/${r.step}` : '/review'
    case 'focus':
      return r.id ? `/focus/${encodeURIComponent(r.id)}` : '/focus'
    case 'notes':
      return r.id ? `/notes/${encodeURIComponent(r.id)}` : r.create ? '/notes?new=1' : '/notes'
    case 'help':
      return `/help${r.page ? `/${encodeURIComponent(r.page)}` : ''}${r.q ? `?q=${encodeURIComponent(r.q)}` : ''}`
    default:
      return `/${r.view}`
  }
}

/**
 * The address the router tracks: the path, plus the query on display routes,
 * whose presentation options live there (display-mode D2).
 */
export function addressOf(loc: Pick<Location, 'pathname' | 'search'>): string {
  // A routine's page keeps ?run=<run> (routines-editor-page D1), so a reload shows the run.
  return loc.pathname === '/display' || loc.pathname.startsWith('/display/') || loc.pathname.startsWith('/routines/') ? `${loc.pathname}${loc.search}` : loc.pathname
}

/**
 * A page with unsaved changes (the routine editor, routines-editor-page D4): asked
 * before every navigation; it returns true when it took over (it asks first and
 * calls `go` to continue), false to let the navigation happen.
 */
export type LeaveGuard = (go: () => void) => boolean
let leaveGuard: LeaveGuard | null = null

/** Install or remove the page's leave guard. */
export function setLeaveGuard(guard: LeaveGuard | null): void {
  leaveGuard = guard
}
resettable('leaveGuard', () => { leaveGuard = null })

const listeners = new Set<() => void>()
let current = typeof location !== 'undefined' ? addressOf(location) : '/'
// The last address outside the Focus screen, where its Esc returns (focus-mode D7).
let beforeFocus = current.startsWith('/focus') ? '/' : current
const isFocusPath = (p: string) => p === '/focus' || p.startsWith('/focus/')
function track(next: string): void {
  if (!isFocusPath(current) && isFocusPath(next)) beforeFocus = current
  current = next
}

/** The view to go back to from the Focus screen: the last one shown before it, else the Inbox. */
export function routeBeforeFocus(): Route {
  return parseRoute(beforeFocus)
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    // The browser's Back already left the page: put its address back and ask (D4).
    if (leaveGuard) {
      history.pushState(null, '', current)
      leaveGuard(() => { leaveGuard = null; history.back() })
      return
    }
    track(addressOf(location))
    listeners.forEach((fn) => fn())
  })
}

/** Go to a route; `replace` swaps the current history entry (the start view on launch, leaving the capture screen). */
export function navigate(r: Route, opts: { replace?: boolean } = {}): void {
  const path = routePath(r)
  if (path === current) return
  if (leaveGuard && leaveGuard(() => { leaveGuard = null; navigate(r, opts) })) return
  if (opts.replace) history.replaceState(null, '', path)
  else history.pushState(null, '', path)
  track(path)
  listeners.forEach((fn) => fn())
}

export function useRoute(): Route {
  const path = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current,
    () => '/',
  )
  // Memoized so effects that depend on the route only re-run on real navigation.
  return useMemo(() => parseRoute(path), [path])
}
