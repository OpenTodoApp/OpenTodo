// "Something isn't working" (OpenSpec `feedback-door`, design D2–D4). The app sends nothing: the
// two doors open a page or a mail message the person sends from their own program. This module is
// the text and the links only; the dialog and its clipboard fallback are in app/FeedbackDialog.tsx.

export const ISSUE_NEW_URL = 'https://github.com/OpenTodoApp/OpenTodo/issues/new'
/**
 * The project's published feedback mailbox (design D4). Empty until the maintainer names a
 * mailbox that receives mail: until then the dialog offers only Open on GitHub, and no address is
 * invented here.
 */
export const FEEDBACK_EMAIL = ''
/** A link longer than this may be cut by a browser or mail program: the body is copied instead (D3). */
export const URL_LIMIT = 1800
const TITLE_LIMIT = 80
const BROWSER_LIMIT = 120

export interface FeedbackContext {
  /** The server's version, or null when it has never been read. */
  version: string | null
  /** The router path the person was on, not a task title. */
  page: string
  /** The user agent, shortened. */
  browser: string
  /** The interface language code. */
  language: string
  offline: boolean
}

/**
 * The context block the text box ends with (D2). Its labels stay English so the title can tell it
 * from what the person wrote, whatever their language.
 */
export function contextBlock(c: FeedbackContext): string {
  return ['--', `OpenTodo ${c.version ?? 'unknown'}`, `Page: ${c.page}`, `Browser: ${c.browser}`, `Language: ${c.language}`, `Offline: ${c.offline ? 'yes' : 'no'}`].join('\n')
}

/** The box at open: the caret sits on an empty first line, the context block follows a blank line. */
export function startingText(c: FeedbackContext): string {
  return `\n\n${contextBlock(c)}`
}

/** The user agent, shortened to the first characters that name the browser. */
export function browserName(userAgent: string): string {
  return userAgent.trim().slice(0, BROWSER_LIMIT)
}

const CONTEXT_LINE = /^(--$|OpenTodo (\S+)$|Page: |Browser: |Language: |Offline: )/

/** The first line the person wrote (context lines skipped), cut to 80 characters; "Hello" when there is none. */
export function titleFor(text: string): string {
  const line = text.split('\n').map((l) => l.trim()).find((l) => l !== '' && !CONTEXT_LINE.test(l))
  if (!line) return 'Hello'
  return Array.from(line).slice(0, TITLE_LIMIT).join('')
}

/** The new-issue page of the repository, with the title and the body (null: no body). */
export function githubUrl(title: string, body: string | null): string {
  const params = new URLSearchParams({ title })
  if (body !== null) params.set('body', body)
  return `${ISSUE_NEW_URL}?${params.toString()}`
}

/** A new message to the feedback address. The subject and body are percent-encoded, as mail programs read them. */
export function mailtoUrl(address: string, title: string, body: string | null): string {
  const subject = `subject=${encodeURIComponent(title)}`
  const text = body === null ? '' : `&body=${encodeURIComponent(body)}`
  return `mailto:${address}?${subject}${text}`
}

/**
 * The link for a door, with the text when it fits (D3). Longer than the limit: the link without
 * the body, and `bodyOmitted` says the caller must copy the text for the person to paste.
 */
export function fitDoor(build: (body: string | null) => string, text: string): { url: string; bodyOmitted: boolean } {
  const url = build(text)
  if (url.length <= URL_LIMIT) return { url, bodyOmitted: false }
  return { url: build(null), bodyOmitted: true }
}
