// A task's origin (OpenSpec change task-origin): recognition of issue links and
// the small readers the row chip, the panel, the filter and the palette share.
//
// The recognition table is the TypeScript twin of internal/origin (Go); both
// run the shared vectors in internal/origin/testdata/origin_vectors.json, so a
// URL captured on a phone, through the CLI or by an assistant yields the same
// origin. Nothing here makes a request: only the URL's host and path are read.
// (lib/origin.ts is unrelated: it explains a refusal for the page's own host.)
import type { Origin, Task } from './types'

export const MAX_ORIGIN_URL = 2048
export const MAX_ORIGIN_ID = 512
export const MAX_ORIGIN_TITLE = 500

/** Host-exact, path-anchored rules (design D3); keep in step with internal/origin/recognize.go. */
const RULES: { host: (h: string) => boolean; path: RegExp; origin: (m: RegExpExecArray) => { provider: string; id: string } }[] = [
  {
    host: (h) => h === 'github.com',
    path: /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/(issues|pull)\/([1-9][0-9]{0,9})(?:\/.*)?$/,
    origin: (m) => ({ provider: 'github', id: `${m[1]}/${m[2]}#${m[4]}` }),
  },
  {
    host: (h) => h === 'gitlab.com',
    path: /^\/((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+)\/-\/(issues|merge_requests)\/([1-9][0-9]{0,9})(?:\/.*)?$/,
    origin: (m) => ({ provider: 'gitlab', id: `${m[1]}${m[2] === 'merge_requests' ? '!' : '#'}${m[3]}` }),
  },
  {
    host: (h) => /^[a-z0-9][a-z0-9-]*\.atlassian\.net$/.test(h),
    path: /^\/browse\/([A-Za-z][A-Za-z0-9_]*-[1-9][0-9]{0,9})\/?$/,
    origin: (m) => ({ provider: 'jira', id: m[1].toUpperCase() }),
  },
  {
    host: (h) => h === 'linear.app',
    path: /^\/([A-Za-z0-9_-]+)\/issue\/([A-Za-z][A-Za-z0-9]*-[1-9][0-9]{0,9})(?:\/.*)?$/,
    origin: (m) => ({ provider: 'linear', id: m[2].toUpperCase() }),
  },
]

/** The parsed URL when `raw` is an http(s) URL with a host of at most MAX_ORIGIN_URL bytes. */
function httpURL(raw: string): URL | null {
  if (!raw || new TextEncoder().encode(raw).length > MAX_ORIGIN_URL) return null
  // "scheme://host" spelled out, as Go's url.Parse needs it: the browser parser
  // would also read "https:///x" or "https:x" as having a host.
  if (!/^https?:\/\/[^/\\]/i.test(raw)) return null
  try {
    const u = new URL(raw)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname ? u : null
  } catch {
    return null
  }
}

/** Cut a shared title to the origin's limit, as the capture screen cuts the task title. */
export function cutOriginTitle(title: string | undefined): string {
  const chars = Array.from((title ?? '').trim())
  return chars.length > MAX_ORIGIN_TITLE ? chars.slice(0, MAX_ORIGIN_TITLE).join('').trim() : chars.join('')
}

/**
 * The origin of a task made from `url`: the recognised issue
 * `{kind: "issue", provider, id, url}`, else `{kind: "url", url}`, with `title`
 * when one is given. Null for anything that is not an http(s) URL.
 */
export function originFromUrl(url: string, title?: string): Origin | null {
  const raw = url.trim()
  const u = httpURL(raw)
  if (!u) return null
  let origin: Origin = { kind: 'url', url: raw }
  const host = u.hostname.toLowerCase()
  for (const rule of RULES) {
    if (!rule.host(host)) continue
    const m = rule.path.exec(u.pathname)
    if (m) origin = { kind: 'issue', ...rule.origin(m), url: raw }
    break
  }
  const t = cutOriginTitle(title)
  if (t) origin.title = t
  return origin
}

/** The task's origin when it is a readable object; null when unset, undecryptable or from an older row. */
export function originOf(task: Pick<Task, 'origin'> | null | undefined): Origin | null {
  const o = task?.origin
  return o && typeof o === 'object' && typeof o.kind === 'string' ? o : null
}

/** The URL's host without "www.", or "" when there is none. */
export function originHost(origin: Origin): string {
  if (!origin.url) return ''
  try {
    return new URL(origin.url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * The short text a chip shows: a message open in a web mail client (an email
 * origin with a URL and a provider) reads as the provider, "Gmail" or "Outlook"
 * (extension-v2); else the external id, else the URL's host. An email origin
 * without a link has no readable label (its id is a Message-ID): callers show "Email".
 */
export function originLabel(origin: Origin): string {
  if (origin.kind === 'email') return origin.url && origin.provider ? origin.provider.charAt(0).toUpperCase() + origin.provider.slice(1) : ''
  return origin.id || originHost(origin)
}

/** The icon for an origin's kind, from the app's icon set. */
export function originIcon(origin: Origin): 'link' | 'at-sign' | 'download' {
  return origin.kind === 'email' ? 'at-sign' : origin.kind === 'import' ? 'download' : 'link'
}

/** Whether `value` names the origin's provider, or its kind when it has none (the `origin:` filter term). */
export function originMatches(origin: Origin | null, value: string): boolean {
  if (!origin) return false
  return (origin.provider ?? origin.kind).toLowerCase() === value.toLowerCase()
}

/** Open the origin's URL in a new tab without passing the opener or the referrer. */
export function openOrigin(origin: Origin): void {
  if (origin.url && httpURL(origin.url)) window.open(origin.url, '_blank', 'noopener,noreferrer')
}
