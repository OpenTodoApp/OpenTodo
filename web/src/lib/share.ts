import { t } from './i18n'
// Shared-content capture (OpenSpec `share-capture`): parse and sanitise what the
// share sheet, the bookmarklet or the browser extension hands to `/share`. Pure
// functions only; nothing here writes data or touches the network. The payload is
// plain text: it is rendered as text nodes and never executed or navigated to.

/** Longest title kept, in characters. */
export const TITLE_MAX = 500
/** Longest shared text kept, in characters (16 KB of ASCII). */
export const TEXT_MAX = 16 * 1024
/** Appended to text that was cut at TEXT_MAX. */
export const TRUNCATED_NOTE = '[truncated]'

export interface SharePayload {
  /** Shared title, single line, at most TITLE_MAX characters ('' when none). */
  title: string
  /** Shared text or selection, at most TEXT_MAX characters plus the note ('' when none). */
  text: string
  /** An http(s) URL, or null when none was shared or it had another scheme. */
  url: string | null
}

/** The URL itself when its scheme is http or https, otherwise null. */
export function safeUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"]+/gi

/**
 * The last http(s) URL inside free text, as some platforms put the shared link in
 * `text` instead of `url`. Trailing punctuation that usually ends a sentence is not
 * part of the URL.
 */
export function lastUrlIn(text: string): { url: string; index: number; length: number } | null {
  let found: { url: string; index: number; length: number } | null = null
  for (const m of text.matchAll(URL_IN_TEXT)) {
    const candidate = m[0].replace(/[.,;:!?)\]}'"]+$/, '')
    const url = safeUrl(candidate)
    if (url) found = { url, index: m.index ?? 0, length: candidate.length }
  }
  return found
}

function cut(s: string, max: number): string {
  if (s.length <= max) return s
  let end = max
  // Do not split a surrogate pair.
  const code = s.charCodeAt(end - 1)
  if (code >= 0xd800 && code <= 0xdbff) end--
  return s.slice(0, end)
}

/** Parse `/share` query parameters into a safe payload. */
export function parseShare(search: string | URLSearchParams): SharePayload {
  const q = typeof search === 'string' ? new URLSearchParams(search) : search
  const rawTitle = q.get('title') ?? ''
  let rawText = q.get('text') ?? ''
  const rawUrl = q.get('url') ?? ''

  let url = safeUrl(rawUrl)
  if (!rawUrl.trim()) {
    // URL-in-text fallback: only when no url was shared at all, so an unsafe url
    // that was dropped is not replaced by something else.
    const inText = lastUrlIn(rawText)
    if (inText) {
      url = inText.url
      rawText = (rawText.slice(0, inText.index) + rawText.slice(inText.index + inText.length)).trim()
    }
  }

  const title = cut(rawTitle.replace(/\s+/g, ' ').trim(), TITLE_MAX)
  let text = rawText.replace(/\r\n?/g, '\n').trim()
  if (text.length > TEXT_MAX) text = `${cut(text, TEXT_MAX)}\n${TRUNCATED_NOTE}`
  return { title, text, url }
}

/** True when the payload carries nothing worth capturing. */
export function isEmptyShare(p: SharePayload): boolean {
  return !p.title && !p.text && !p.url
}

/** The proposed task title: the shared title, else the URL's host, else the first line of text. */
export function proposedTitle(p: SharePayload): string {
  if (p.title) return p.title
  if (p.url) return new URL(p.url).host
  return cut(p.text.split('\n', 1)[0].trim(), TITLE_MAX)
}

/** The proposed description: the shared text followed by the URL. */
export function proposedDescription(p: SharePayload): string {
  return [p.text, p.url].filter(Boolean).join('\n\n')
}

/** The `/share` URL on `origin` for a page; used by the bookmarklet and mirrored by the extension. */
export function shareUrl(origin: string, page: { url?: string; title?: string; text?: string }): string {
  const q = new URLSearchParams()
  if (page.title) q.set('title', page.title)
  if (page.text) q.set('text', page.text)
  if (page.url) q.set('url', page.url)
  const s = q.toString()
  return `${origin.replace(/\/+$/, '')}/share${s ? `?${s}` : ''}`
}

/**
 * The bookmarklet for `origin`: reads the visited page's URL, title and selection
 * and opens `/share` in a small popup. It carries no token or credential; the
 * popup uses the app's own session cookie on the app's origin.
 */
export function bookmarklet(origin: string): string {
  const base = JSON.stringify(`${origin.replace(/\/+$/, '')}/share`)
  const code =
    `(function(){var e=encodeURIComponent,s=String(window.getSelection?getSelection():'').slice(0,16384),` +
    `u=${base}+'?url='+e(location.href)+'&title='+e(document.title)+(s?'&text='+e(s):'');` +
    `if(!window.open(u,'opentodo-capture','popup,width=480,height=640'))alert(${JSON.stringify(t('Allow pop-ups for this site to capture it to OpenTodo.'))})})()`
  return `javascript:${code}`
}

// ---- shared files (OpenSpec attachments, design D9) ----

/** At most this many files are taken from one share. */
export const MAX_SHARED_FILES = 10

/** One shared file on the capture screen; `refused` names why it will not be attached. */
export interface CapturedFile {
  key: string
  name: string
  type: string
  size: number
  blob: Blob
  refused?: string
}

/** Apply the share limits: the first ten files, none over the per-file limit (null when unknown). */
export function captureFiles(files: { name: string; type: string; blob: Blob }[], maxBytes: number | null, format: (n: number) => string): { files: CapturedFile[]; dropped: number } {
  const out = files.slice(0, MAX_SHARED_FILES).map((f, i): CapturedFile => ({
    key: `${i}-${f.name}`, name: f.name || 'file', type: f.type || 'application/octet-stream', size: f.blob.size, blob: f.blob,
    refused: maxBytes !== null && f.blob.size > maxBytes ? t('Too large: files may be at most {max} on this server.', { max: format(maxBytes) }) : undefined,
  }))
  return { files: out, dropped: Math.max(0, files.length - MAX_SHARED_FILES) }
}

/** The title for a share that carried only files: the first file's name without its extension. */
export function titleFromFiles(files: { name: string }[]): string {
  const name = files[0]?.name ?? ''
  return cut(name.replace(/\.[a-z0-9]{1,8}$/i, '').trim(), TITLE_MAX)
}
