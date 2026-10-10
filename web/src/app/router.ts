// A deliberately tiny history-based router: the app has a handful of views and
// every extra kilobyte matters on a low-end phone.
import { useMemo, useSyncExternalStore } from 'react'

export type Route =
  | { view: 'inbox' }
  | { view: 'today' }
  | { view: 'upcoming' }
  | { view: 'day'; date?: string }
  | { view: 'week'; date?: string }
  | { view: 'completed' }
  | { view: 'assigned' }
  | { view: 'project'; id: string }
  | { view: 'label'; id: string }
  | { view: 'labels' }
  | { view: 'filter' }
  | { view: 'views' }
  | { view: 'view'; id: string }
  | { view: 'settings' }
  | { view: 'import' }
  | { view: 'invite'; token: string }
  | { view: 'share' }
  | { view: 'trash' }

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean)
  switch (parts[0]) {
    case undefined:
    case 'inbox':
      return { view: 'inbox' }
    case 'today':
      return { view: 'today' }
    case 'upcoming':
      return { view: 'upcoming' }
    case 'completed':
      return { view: 'completed' }
    case 'assigned':
      return { view: 'assigned' }
    case 'day':
    case 'week':
      // An optional anchor date; anything that is not YYYY-MM-DD means "today".
      return parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) ? { view: parts[0], date: parts[1] } : { view: parts[0] }
    case 'settings':
      return parts[1] === 'import' ? { view: 'import' } : { view: 'settings' }
    case 'labels':
      return { view: 'labels' }
    case 'filter':
      return { view: 'filter' }
    case 'share':
      return { view: 'share' }
    case 'trash':
      return { view: 'trash' }
    case 'views':
      return { view: 'views' }
    case 'view':
      return parts[1] ? { view: 'view', id: parts[1] } : { view: 'views' }
    case 'project':
      return parts[1] ? { view: 'project', id: parts[1] } : { view: 'inbox' }
    case 'invite':
      // The secret is URL-safe base64; decode defensively in case a mail client encoded it.
      return parts[1] ? { view: 'invite', token: safeDecode(parts[1]) } : { view: 'inbox' }
    case 'label':
      return parts[1] ? { view: 'label', id: parts[1] } : { view: 'labels' }
    default:
      return { view: 'inbox' }
  }
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
      return `/${r.view}/${r.id}`
    case 'invite':
      return `/invite/${encodeURIComponent(r.token)}`
    case 'day':
    case 'week':
      return r.date ? `/${r.view}/${r.date}` : `/${r.view}`
    case 'inbox':
      return '/'
    case 'import':
      return '/settings/import'
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
