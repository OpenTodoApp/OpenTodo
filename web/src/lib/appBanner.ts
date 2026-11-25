// Safari's Smart App Banner on a task's page (ios-app-banner): the service worker
// answers navigations from the cached page, so it adds the tag the server adds
// (internal/web/appbanner.go) to the pages it serves itself.

/** The App Store id of the OpenTodo app for iPhone and iPad. */
const APP_STORE_ID = '6832200428'

/** The task id of a `/task/<id>` address, or null for any other path. */
export function taskPageId(pathname: string): string | null {
  const m = /^\/task\/([^/]+)$/.exec(pathname)
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return null
  }
}

/** The page with the banner right after `<head>`, opening the app at `origin`'s task `id`. */
export function withAppBanner(page: string, origin: string, id: string): string {
  const i = page.indexOf('<head>')
  if (i < 0) return page
  // encodeURIComponent leaves no quote, angle bracket, ampersand or comma.
  const meta = `<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}, app-argument=${origin}/task/${encodeURIComponent(id)}">`
  const at = i + '<head>'.length
  return page.slice(0, at) + meta + page.slice(at)
}
