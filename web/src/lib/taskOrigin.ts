// A task's origin (OpenSpec change task-origin): recognition of issue links and
// the small readers the row chip, the panel, the filter and the palette share.
//
// The recognition table is the TypeScript twin of internal/origin (Go); both
// run the shared vectors in internal/origin/testdata/origin_vectors.json, so a
// URL captured on a phone, through the CLI or by an assistant yields the same
// origin. Nothing here makes a request: only the URL's host and path are read.
// (lib/origin.ts is unrelated: it explains a refusal for the page's own host.)
import { has, openObsidian, shell } from './shell'
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

// Obsidian note links (OpenSpec change obsidian-origin, design D2): the one
// origin URL that is not http(s), `obsidian://open?vault=<vault>&file=<note>` in
// exactly that shape. Every other Obsidian action can write or run something and
// `path=` opens any file, so they are refused. The TypeScript twin of
// internal/origin/obsidian.go; both run the "obsidian" vectors.
const OBSIDIAN_PREFIX = 'obsidian://open?'
export const MAX_OBSIDIAN_VAULT = 255
export const MAX_OBSIDIAN_FILE = 1024
/** Characters a query value may hold unencoded; '+', '&', '=', '#', '?' and spaces must be percent-encoded. */
const VALUE_CHARS = /^[A-Za-z0-9\-._~!$'()*,;:@/%]*$/

/** A parsed Obsidian note link: the vault's name and the note as the link names it. */
export interface ObsidianLink {
  vault: string
  file: string
}

function decodeObsidianValue(raw: string): string | null {
  if (!VALUE_CHARS.test(raw)) return null
  let s: string
  try {
    s = decodeURIComponent(raw)
  } catch {
    return null
  }
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    if (c < 0x20 || (c >= 0x7f && c < 0xa0)) return null
  }
  return s
}

/**
 * The vault and note of an Obsidian note link of the one accepted shape (design
 * D2): `obsidian://open?` then exactly `vault` (1–255 characters) and `file`
 * (1–1024, not starting with "/") once each, at most 2048 bytes. Null otherwise.
 * The shells run the same check before handing a link to the system.
 */
export function obsidianLink(raw: string): ObsidianLink | null {
  if (!raw.startsWith(OBSIDIAN_PREFIX) || new TextEncoder().encode(raw).length > MAX_ORIGIN_URL) return null
  const parts = raw.slice(OBSIDIAN_PREFIX.length).split('&')
  if (parts.length !== 2) return null
  const out: Partial<ObsidianLink> = {}
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq < 0) return null
    const name = part.slice(0, eq)
    if (name !== 'vault' && name !== 'file') return null
    if (out[name] !== undefined) return null
    const value = decodeObsidianValue(part.slice(eq + 1))
    if (value === null) return null
    const n = Array.from(value).length
    if (n < 1 || n > (name === 'vault' ? MAX_OBSIDIAN_VAULT : MAX_OBSIDIAN_FILE)) return null
    if (name === 'file' && value.startsWith('/')) return null
    out[name] = value
  }
  return out.vault !== undefined && out.file !== undefined ? { vault: out.vault, file: out.file } : null
}

/** The note's vault-relative path a link opens: its file, with ".md" when the last segment has no extension. */
export function obsidianNotePath(link: ObsidianLink): string {
  const last = link.file.slice(link.file.lastIndexOf('/') + 1)
  return last.lastIndexOf('.') > 0 ? link.file : `${link.file}.md`
}

/**
 * The link of an `obsidian` origin when `url` is a valid note link to the note
 * `id` names (design D2), so a crafted origin cannot show one note and open
 * another. Checked on the device after decryption: the server never saw an
 * encrypted origin.
 */
export function obsidianURL(url: string | undefined, id: string | undefined): ObsidianLink | null {
  const link = url ? obsidianLink(url) : null
  if (!link || !id) return null
  return id === obsidianNotePath(link) || id === `${link.file}.md` ? link : null
}

/** The last segment of a vault-relative path without ".md". */
export function obsidianNoteName(id: string): string {
  return id.slice(id.lastIndexOf('/') + 1).replace(/\.md$/, '')
}

/**
 * The short text a chip shows: an Obsidian note reads as its title, else its
 * name (obsidian-origin D5); a message open in a web mail client (an email
 * origin with a URL and a provider) reads as the provider, "Gmail" or "Outlook"
 * (extension-v2); else the external id, else the URL's host. An email origin
 * without a link has no readable label (its id is a Message-ID): callers show "Email".
 */
export function originLabel(origin: Origin): string {
  if (origin.kind === 'obsidian') return origin.title || obsidianNoteName(origin.id ?? '')
  if (origin.kind === 'email') return origin.url && origin.provider ? origin.provider.charAt(0).toUpperCase() + origin.provider.slice(1) : ''
  return origin.id || originHost(origin)
}

/** Where a valid Obsidian note lives, for its tooltip "Open in Obsidian: <vault> › <path>"; null for any other origin. */
export function obsidianPlace(origin: Origin): { vault: string; path: string } | null {
  const link = origin.kind === 'obsidian' ? obsidianURL(origin.url, origin.id) : null
  return link ? { vault: link.vault, path: origin.id ?? '' } : null
}

/** The icon for an origin's kind, from the app's icon set. */
export function originIcon(origin: Origin): 'link' | 'at-sign' | 'download' | 'notebook-pen' {
  if (origin.kind === 'obsidian') return 'notebook-pen'
  return origin.kind === 'email' ? 'at-sign' : origin.kind === 'import' ? 'download' : 'link'
}

/**
 * The address the device may open for an origin, as it reads it after any
 * decryption ("Origin links open only http(s)"): an http(s) URL of any kind but
 * `obsidian`, or the valid note link of an `obsidian` origin. In a native shell a
 * note link opens only when the shell lists `obsidian-links`. Null otherwise: the
 * chip then has no link, and its menu offers Copy link when there is a URL.
 */
export function originLink(origin: Origin): { href: string; obsidian: boolean } | null {
  if (!origin.url) return null
  if (origin.kind === 'obsidian') {
    if (!obsidianURL(origin.url, origin.id)) return null
    return !shell() || has('obsidian-links') ? { href: origin.url, obsidian: true } : null
  }
  return httpURL(origin.url) ? { href: origin.url, obsidian: false } : null
}

/** Whether `value` names the origin's provider, or its kind when it has none (the `origin:` filter term). */
export function originMatches(origin: Origin | null, value: string): boolean {
  if (!origin) return false
  return (origin.provider ?? origin.kind).toLowerCase() === value.toLowerCase()
}

/**
 * Open the origin: an http(s) URL in a new tab without passing the opener or the
 * referrer; an Obsidian note through the system (design D4), in a browser by an
 * ordinary link activation (the browser asks before opening the app and leaves
 * no tab behind), in a shell through its external-link method. Opens nothing
 * when `originLink` gives no link.
 */
export function openOrigin(origin: Origin): void {
  const link = originLink(origin)
  if (!link) return
  if (!link.obsidian) {
    window.open(link.href, '_blank', 'noopener,noreferrer')
  } else if (shell()) {
    openObsidian(link.href)
  } else {
    const a = document.createElement('a')
    a.href = link.href
    a.rel = 'noreferrer'
    a.click()
  }
}
