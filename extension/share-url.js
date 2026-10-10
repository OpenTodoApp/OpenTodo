// Pure helpers shared by the background script and the options page. They mirror
// web/src/lib/share.ts (the app re-validates everything it receives anyway).

/** Selection longer than this is cut before it goes into the URL; the app keeps 16 KB. */
export const MAX_TEXT = 16 * 1024
/** Title longer than this is cut; the app keeps 500 characters. */
export const MAX_TITLE = 500

/**
 * The server's origin from what the user typed, or null when it is not an http(s)
 * URL. A bare host gets https://. Paths, queries and fragments are dropped.
 */
export function normalizeServer(input) {
  let s = String(input ?? '').trim()
  if (!s) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`
  let u
  try {
    u = new URL(s)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (!u.hostname || u.username || u.password) return null
  return u.origin
}

/** True for page URLs worth sending (http and https only). */
export function isWebUrl(url) {
  try {
    const p = new URL(url).protocol
    return p === 'http:' || p === 'https:'
  } catch {
    return false
  }
}

/** The capture screen URL on `server` for a page: /share?title=…&text=…&url=… */
export function buildShareUrl(server, page) {
  const origin = normalizeServer(server)
  if (!origin) throw new Error('invalid server URL')
  const q = new URLSearchParams()
  const title = String(page?.title ?? '').slice(0, MAX_TITLE)
  const text = String(page?.text ?? '').slice(0, MAX_TEXT)
  if (title) q.set('title', title)
  if (text) q.set('text', text)
  if (page?.url && isWebUrl(page.url)) q.set('url', page.url)
  const query = q.toString()
  return `${origin}/share${query ? `?${query}` : ''}`
}

/** Encode a pending capture for the options page's query string (first run). */
export function encodePending(page) {
  const q = new URLSearchParams()
  for (const k of ['title', 'text', 'url']) if (page?.[k]) q.set(k, String(page[k]))
  return q.toString()
}

/** Read a pending capture back from the options page's query string, or null. */
export function decodePending(search) {
  const q = new URLSearchParams(search)
  const page = { title: q.get('title') ?? '', text: q.get('text') ?? '', url: q.get('url') ?? '' }
  return page.title || page.text || page.url ? page : null
}
