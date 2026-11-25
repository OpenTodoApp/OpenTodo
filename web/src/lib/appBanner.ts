// Safari's Smart App Banner on a task's page (ios-app-banner): the service worker
// answers navigations from the cached page, so it adds the tag the server adds
// (internal/web/appbanner.go) to the pages it serves itself, naming its own origin.
// Both read paths and escape ids alike (the shared appBanner.vectors.json).

const APP_STORE_ID = '6832200428'

/** The task id of `/task/<id>`, decoded, or null: a trailing slash, an id holding a `/` (an escaped %2F too) or a deeper path gets no banner. */
export function taskPageId(pathname: string): string | null {
  const m = /^\/task\/([^/]+)$/.exec(pathname)
  if (!m) return null
  try {
    const id = decodeURIComponent(m[1])
    return id.includes('/') ? null : id
  } catch {
    return null
  }
}

/** The id escaped to unreserved characters only (A-Z a-z 0-9 - . _ ~), as Go's AppBannerArgument escapes it. */
const escapeId = (id: string) => encodeURIComponent(id).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

/** The page with the banner right after `<head>`, opening the app at `origin`'s task `id`. */
export function withAppBanner(page: string, origin: string, id: string): string {
  const i = page.indexOf('<head>')
  if (i < 0) return page
  const meta = `<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}, app-argument=${origin}/task/${escapeId(id)}">`
  const at = i + '<head>'.length
  return page.slice(0, at) + meta + page.slice(at)
}
