// A deliberately tiny history-based router: the app has a handful of views and
// every extra kilobyte matters on a low-end phone.
import { useMemo, useSyncExternalStore } from 'react'

export type Route =
  | { view: 'inbox' }
  | { view: 'today' }
  | { view: 'upcoming' }
  | { view: 'completed' }
  | { view: 'project'; id: string }
  | { view: 'settings' }
  | { view: 'invite'; token: string }

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
    case 'settings':
      return { view: 'settings' }
    case 'project':
      return parts[1] ? { view: 'project', id: parts[1] } : { view: 'inbox' }
    case 'invite':
      // The secret is URL-safe base64; decode defensively in case a mail client encoded it.
      return parts[1] ? { view: 'invite', token: safeDecode(parts[1]) } : { view: 'inbox' }
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
      return `/project/${r.id}`
    case 'invite':
      return `/invite/${encodeURIComponent(r.token)}`
    case 'inbox':
      return '/'
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

export function navigate(r: Route): void {
  const path = routePath(r)
  if (path === current) return
  history.pushState(null, '', path)
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
