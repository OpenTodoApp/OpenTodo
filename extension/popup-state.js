// The popup's logic without its page (OpenSpec change extension-v2, design D4;
// share-capture "Quick save"): what a save sends, in the order `ot add --natural`
// sends it. Tested with `node --test extension/popup.test.js` against a stubbed API.
import { descriptionOf } from './capture.js'

/**
 * What the popup starts with: the capture (captureFromMenu / captureFromTab) and,
 * for a message open in Gmail or Outlook, its recognition (mail.js): the subject
 * as the line and "From: …" leading the text. A mail whose header could not be
 * read still gives the subject and the permalink, without a From line.
 */
export function prefill(capture, mail = null) {
  const from = mail?.from ? `From: ${mail.from}` : ''
  return {
    line: mail ? mail.subject : capture.title,
    text: [from, String(capture.text ?? '').trim()].filter(Boolean).join('\n\n'),
    url: capture.url ?? '',
    imageUrl: capture.imageUrl ?? '',
    mailOrigin: mail?.origin ?? null,
  }
}

/** The origin a save sends: the mail's, else the one the parse recognised, else the page as a url origin; null once removed. */
export function originFor(p, parsed, keep = true) {
  if (!keep || !p.url) return null
  return p.mailOrigin ?? parsed?.origin ?? { kind: 'url', url: p.url }
}

/** The description a save sends: the image address, the text, then the page address when kept. */
export function descriptionFor(p, keep = true) {
  return descriptionOf({ imageUrl: p.imageUrl, text: p.text, url: p.url, keepUrl: keep })
}

/** What the capture screen (/share) gets in Capture screen mode and as the fallback. */
export function sharePage(p, line, keep = true) {
  return { title: line, text: descriptionOf({ imageUrl: p.imageUrl, text: p.text, keepUrl: false }), url: keep ? p.url : '' }
}

/**
 * The parse a save uses: the one for exactly this line, else a fresh one (the
 * user pressed Enter before the preview arrived), else none (the route is
 * unavailable: the line is the title).
 */
export async function parseForSave(api, line, last, ask) {
  if (last && last.line === line) return last.parsed
  if (!api || !ask) return null
  try {
    return await ask(line)
  } catch {
    return null
  }
}

/** A guard that lets one save run at a time: a second Enter while one is in flight does nothing. */
export function onceAtATime(fn) {
  let busy = false
  return async (...args) => {
    if (busy) return undefined
    busy = true
    try {
      return await fn(...args)
    } finally {
      busy = false
    }
  }
}

/**
 * The labels a save uses: the parse's labels unless the user picked labels in the
 * popup (picks win), each {id?, name}; names compare ignoring case.
 */
export function labelsFor(parsed, picked) {
  const list = picked ?? parsed?.fields?.labels ?? []
  const seen = new Set()
  return list.filter((l) => {
    const k = String(l.name).toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** The project a save uses: a pick (null = Inbox) wins over the parse. */
export function projectFor(parsed, picked) {
  if (picked !== undefined) return picked
  return parsed?.fields?.project_id ?? null
}

/**
 * The POST /api/v1/tasks body: the parse's title and fields (or the line as the
 * title when there is no parse), the project and label ids, the origin and the description.
 */
export function taskBody({ line, parsed, projectId, labelIds, origin, description }) {
  const f = parsed?.fields ?? {}
  const title = (parsed ? parsed.title : line).trim() || line.trim()
  const body = { title }
  for (const k of ['due', 'deadline', 'start', 'evening', 'priority', 'estimate_minutes', 'recurrence']) {
    if (f[k] !== undefined) body[k] = f[k]
  }
  if (projectId) body.project_id = projectId
  if (labelIds?.length) body.labels = labelIds
  if (origin) body.origin = origin
  if (description) body.description = description
  return body
}

/** A reminder body for POST /api/v1/reminders: relative, or an absolute floating moment in this device's zone. */
export function reminderBody(taskId, r) {
  if (r.kind === 'relative') return { task_id: taskId, kind: 'relative', offset_minutes: r.offset_minutes }
  const [y, mo, d] = r.date.split('-').map(Number)
  const [h, mi] = r.time.split(':').map(Number)
  return { task_id: taskId, kind: 'absolute', fire_at: new Date(y, mo - 1, d, h, mi).getTime() }
}

/** One closed time entry ending now for `30m/2h` (time already spent). */
export function spentBody(taskId, minutes, now = Date.now()) {
  return { taskId, startedAt: now - minutes * 60_000, endedAt: now }
}

/**
 * Save in Quick save mode: create the labels that do not exist, the task, then its
 * reminders and time spent. Returns the created task. Errors are the API's
 * (api.js ApiError); a failure after the task exists names the task in `taskId`.
 */
export async function quickSave(api, { line, parsed, picks = {}, origin, description, now }) {
  const labels = labelsFor(parsed, picks.labels)
  const ids = []
  let n = 0
  for (const l of labels) {
    if (l.id) ids.push(l.id)
    else ids.push((await api.createLabel(l.name, ++n)).id)
  }
  const task = await api.createTask(taskBody({ line, parsed, projectId: projectFor(parsed, picks.projectId), labelIds: ids, origin, description }), { ownReminders: (parsed?.fields?.reminders ?? []).length > 0 })
  try {
    let r = 0
    for (const rem of parsed?.fields?.reminders ?? []) await api.createReminder(reminderBody(task.id, rem), ++r)
    const spent = parsed?.fields?.spent_minutes ?? 0
    if (spent > 0) await api.createTimeEntry(spentBody(task.id, spent, now))
  } catch (err) {
    err.taskId = task.id
    throw err
  }
  return task
}

/** Calls `fn` once input has been quiet for `ms`, never for an empty line. */
export function debounceParse(fn, ms = 150, timers = globalThis) {
  let t = null
  return (line) => {
    if (t) timers.clearTimeout(t)
    t = null
    if (!line.trim()) return
    t = timers.setTimeout(() => {
      t = null
      fn(line)
    }, ms)
  }
}

/** The message key and the actions for a failed save (share-capture "Quick save"). */
export function failureOf(err) {
  switch (err?.kind) {
    case 'unreachable':
      return { key: 'popupUnreachable', capture: true, options: false }
    case 'unauthorized':
    case 'forbidden':
      return { key: 'popupTokenRefused', capture: true, options: true }
    case 'encrypted':
      return { key: 'popupEncrypted', capture: true, options: false }
    case 'rate_limited':
      return { key: 'popupRateLimited', capture: true, options: false }
    default:
      return { key: 'popupFailed', capture: true, options: false }
  }
}
