// A deliberately tiny history-based router: the app has a handful of views and
// every extra kilobyte matters on a low-end phone.
import { useMemo, useSyncExternalStore } from 'react'
import { readCalendarMode } from '../lib/calendarMode'

export type Route =
  | { view: 'inbox' }
  | { view: 'today' }
  | { view: 'upcoming' }
  | { view: 'someday' }
  | { view: 'anytime' }
  | { view: 'day'; date?: string }
  | { view: 'week'; date?: string }
  | { view: 'completed' }
  | { view: 'assigned' }
  | { view: 'project'; id: string }
  | { view: 'task'; id: string }
  | { view: 'label'; id: string }
  | { view: 'labels' }
  | { view: 'filter'; q?: string }
  | { view: 'views' }
  | { view: 'view'; id: string }
  | { view: 'settings'; section?: SettingsSectionId }
  | { view: 'import' }
  | { view: 'invite'; token: string }
  | { view: 'project-invite'; token: string }
  | { view: 'reset'; token: string }
  | { view: 'public'; token: string }
  | { view: 'share' }
  | { view: 'trash' }
  | { view: 'feed' }
  | { view: 'ask' }
  | { view: 'help'; page?: string; q?: string }

/** Settings sections, each at /settings/<id> (settings-navigation); order is the overview's. */
export const SETTINGS_SECTION_IDS = [
  'account', 'security', 'encryption', 'activity',
  'preferences', 'notifications', 'capture', 'projects',
  'data', 'integrations', 'ai',
  'admin', 'backups', 'access',
] as const
export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number]

/** Section ids of an earlier layout, opened as their new section (settings-redesign D2). */
export const LEGACY_SETTINGS_IDS: Readonly<Record<string, SettingsSectionId>> = { general: 'preferences' }

function isSettingsSection(s: string | undefined): s is SettingsSectionId {
  return (SETTINGS_SECTION_IDS as readonly string[]).includes(s ?? '')
}

export function parseRoute(pathname: string): Route {
  const [path, query = ''] = pathname.split('?')
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
      // An optional anchor date; anything that is not YYYY-MM-DD means "today".
      return parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) ? { view: parts[0], date: parts[1] } : { view: parts[0] }
    case 'calendar':
      // One Calendar destination (ux-overhaul): Day or Week as last used on this device.
      return { view: readCalendarMode() }
    case 'settings':
      // /settings/import is the import screen; an unknown section shows the overview.
      if (parts[1] === 'import') return { view: 'import' }
      if (parts[1] && parts[1] in LEGACY_SETTINGS_IDS) return { view: 'settings', section: LEGACY_SETTINGS_IDS[parts[1]] }
      return isSettingsSection(parts[1]) ? { view: 'settings', section: parts[1] } : { view: 'settings' }
    case 'labels':
      return { view: 'labels' }
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
    case 'public':
      // A public link to a project's list (public-links): no sign-in, no sync.
      return parts[1] ? { view: 'public', token: safeDecode(parts[1]) } : { view: 'inbox' }
    case 'label':
      return parts[1] ? { view: 'label', id: parts[1] } : { view: 'labels' }
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
    case 'invite':
    case 'reset':
      return `/${r.view}/${encodeURIComponent(r.token)}`
    case 'project-invite':
      return `/invite/p/${encodeURIComponent(r.token)}`
    case 'public':
      return `/public/${encodeURIComponent(r.token)}`
    case 'day':
    case 'week':
      return r.date ? `/${r.view}/${r.date}` : `/${r.view}`
    case 'inbox':
      return '/'
    case 'settings':
      return r.section ? `/settings/${r.section}` : '/settings'
    case 'import':
      return '/settings/import'
    case 'feed':
      return '/updates'
    case 'ask':
      return '/ask'
    case 'filter':
      return r.q ? `/filter?q=${encodeURIComponent(r.q)}` : '/filter'
    case 'help':
      return `/help${r.page ? `/${encodeURIComponent(r.page)}` : ''}${r.q ? `?q=${encodeURIComponent(r.q)}` : ''}`
    default:
      return `/${r.view}`
  }
}

const listeners = new Set<() => void>()
let current = typeof location !== 'undefined' ? location.pathname : '/'

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    current = location.pathname
    listeners.forEach((fn) => fn())
  })
}

/** Go to a route; `replace` swaps the current history entry (the start view on launch, leaving the capture screen). */
export function navigate(r: Route, opts: { replace?: boolean } = {}): void {
  const path = routePath(r)
  if (path === current) return
  if (opts.replace) history.replaceState(null, '', path)
  else history.pushState(null, '', path)
  current = path
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
