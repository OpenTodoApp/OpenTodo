// A deliberately tiny history-based router: the app has a handful of views and
// every extra kilobyte matters on a low-end phone.
import { useMemo, useSyncExternalStore } from 'react'
import { readCalendarMode } from '../lib/calendarMode'
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
  | { view: 'completed' }
  | { view: 'assigned' }
  | { view: 'project'; id: string }
  | { view: 'task'; id: string }
  | { view: 'label'; id: string }
  | { view: 'labels' }
  // Saved locations (task-locations, the `place` entity): /locations, and /location/<id> lists the open tasks linked to one.
  | { view: 'places' }
  | { view: 'place'; id: string }
  // All projects (sidebar-favourites D6): /projects, and /projects#archived with the archived projects open.
  | { view: 'projects'; archived?: boolean }
  | { view: 'filter'; q?: string }
  | { view: 'views' }
  | { view: 'view'; id: string }
  | { view: 'settings'; section?: SettingsSectionId; anchor?: string }
  | { view: 'import' }
  | { view: 'invite'; token: string }
  | { view: 'project-invite'; token: string }
  | { view: 'reset'; token: string }
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

/** Settings sections, each at /settings/<id> (settings-navigation); ten, in list order. */
export const SETTINGS_SECTION_IDS = [
  'account', 'appearance',
  'general', 'notifications', 'capture', 'about',
  'integrations', 'data',
  'people', 'server',
] as const
export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number]

/**
 * Section ids of earlier layouts, opened as the section that now holds their
 * content, at the anchor of that content (settings-navigation "Legacy settings
 * addresses"). The address is replaced in place.
 */
export const LEGACY_SETTINGS_IDS: Readonly<Record<string, { section: SettingsSectionId; anchor?: string }>> = {
  security: { section: 'account', anchor: 'security' },
  encryption: { section: 'account', anchor: 'encryption' },
  activity: { section: 'account', anchor: 'sessions' },
  preferences: { section: 'general' },
  projects: { section: 'data', anchor: 'projects' },
  ai: { section: 'integrations', anchor: 'ai' },
  admin: { section: 'people' },
  access: { section: 'people', anchor: 'access-policies' },
  backups: { section: 'server' },
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
      // An optional anchor date; anything that is not YYYY-MM-DD means "today".
      return parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) ? { view: parts[0], date: parts[1] } : { view: parts[0] }
    case 'calendar':
      // One Calendar destination (ux-overhaul): Day, Week, Month or Plan as last used on this device.
      return { view: readCalendarMode() }
    case 'settings':
      // /settings/import is the import screen; an unknown section shows the overview.
      if (parts[1] === 'import') return { view: 'import' }
      if (parts[1] && parts[1] in LEGACY_SETTINGS_IDS) { const l = LEGACY_SETTINGS_IDS[parts[1]]; return { view: 'settings', section: l.section, ...(l.anchor ? { anchor: l.anchor } : {}) } }
      return isSettingsSection(parts[1]) ? { view: 'settings', section: parts[1] } : { view: 'settings' }
    case 'labels':
      return { view: 'labels' }
    case 'locations':
      return { view: 'places' }
    case 'location':
      return parts[1] ? { view: 'place', id: parts[1] } : { view: 'places' }
    case 'projects':
      return hash === 'archived' ? { view: 'projects', archived: true } : { view: 'projects' }
    case 'filter': {
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
    case 'views':
      return { view: 'views' }
    case 'view':
      return parts[1] ? { view: 'view', id: parts[1] } : { view: 'views' }
    case 'project':
      return parts[1] ? { view: 'project', id: parts[1] } : { view: 'inbox' }
    case 'task':
      // The expanded task page (ux-overhaul, app-shell "Panel width and expansion").
      return parts[1] ? { view: 'task', id: parts[1] } : { view: 'inbox' }
    case 'invite':
      // /invite/p/<token> is a project invite link (project-invite-links).
      if (parts[1] === 'p') return parts[2] ? { view: 'project-invite', token: safeDecode(parts[2]) } : { view: 'inbox' }
      // The secret is URL-safe base64; decode defensively in case a mail client encoded it.
      return parts[1] ? { view: 'invite', token: safeDecode(parts[1]) } : { view: 'inbox' }
    case 'reset':
      // Password reset link from an administrator or `opentodo reset-owner-password`.
      return parts[1] ? { view: 'reset', token: safeDecode(parts[1]) } : { view: 'inbox' }
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
  if (parts[0] === 'activity' || parts[0] === 'calendar') return routePath(parseRoute(path))
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
    case 'view':
    case 'task':
      return `/${r.view}/${r.id}`
    case 'place':
      return `/location/${r.id}`
    case 'places':
      return '/locations'
    case 'invite':
    case 'reset':
      return `/${r.view}/${encodeURIComponent(r.token)}`
    case 'project-invite':
      return `/invite/p/${encodeURIComponent(r.token)}`
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
      return r.date ? `/${r.view}/${r.date}` : `/${r.view}`
    case 'inbox':
      return '/'
    case 'settings':
      return r.section ? `/settings/${r.section}` : '/settings'
    case 'import':
      return '/settings/import'
    case 'projects':
      return r.archived ? '/projects#archived' : '/projects'
    case 'feed':
      return '/updates'
    case 'ask':
      return '/ask'
    case 'filter':
      return r.q ? `/filter?q=${encodeURIComponent(r.q)}` : '/filter'
    case 'display': {
      const q = serializeDisplayOptions(r.options)
      return `${displayTargetPath(r.target)}${q ? `?${q}` : ''}`
    }
    case 'review':
      return r.step ? `/review/${r.step}` : '/review'
    case 'focus':
      return r.id ? `/focus/${encodeURIComponent(r.id)}` : '/focus'
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
  return loc.pathname === '/display' || loc.pathname.startsWith('/display/') ? `${loc.pathname}${loc.search}` : loc.pathname
}

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
    track(addressOf(location))
    listeners.forEach((fn) => fn())
  })
}

/** Go to a route; `replace` swaps the current history entry (the start view on launch, leaving the capture screen). */
export function navigate(r: Route, opts: { replace?: boolean } = {}): void {
  const path = routePath(r)
  if (path === current) return
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
