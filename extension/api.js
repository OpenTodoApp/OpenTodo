// The extension's only network code (OpenSpec change extension-v2, design D2, D4):
// requests to the configured server with the user's API token, in Quick save mode
// only. Every request has a ten-second timeout; every create carries an
// Idempotency-Key, so a retry after a timeout never makes a second task.
// Tested with `node --test extension/api.test.js` against a stubbed fetch.

export const TIMEOUT_MS = 10_000

/** An API failure: kind is unreachable | unauthorized | forbidden | encrypted | rate_limited | invalid | failed. */
export class ApiError extends Error {
  constructor(kind, message, status = 0, code = '') {
    super(message)
    this.kind = kind
    this.status = status
    this.code = code
  }
}

/** The kind of a failed response, from its status and error code. */
export function errorKind(status, code) {
  if (status === 401) return 'unauthorized'
  if (code === 'encryption_enabled') return 'encrypted'
  if (status === 403) return 'forbidden'
  if (status === 429) return 'rate_limited'
  if (status === 400 || status === 422) return 'invalid'
  return 'failed'
}

/**
 * A client for one server and token. `fetchImpl` and `timeoutMs` are for tests.
 */
export function createApi({ server, token, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS, key = randomKey() }) {
  async function call(method, path, body, idempotency) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (idempotency) headers['Idempotency-Key'] = idempotency
    let res
    try {
      res = await fetchImpl(`${server}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal, credentials: 'omit' })
    } catch {
      throw new ApiError('unreachable', 'the server could not be reached')
    } finally {
      clearTimeout(timer)
    }
    let data = null
    try {
      data = await res.json()
    } catch {
      data = null
    }
    if (!res.ok) {
      const code = data?.error?.code ?? ''
      throw new ApiError(errorKind(res.status, code), data?.error?.message ?? `status ${res.status}`, res.status, code)
    }
    return data
  }
  return {
    key,
    me: () => call('GET', '/me'),
    projects: () => call('GET', '/projects').then((d) => d?.projects ?? []),
    labels: () => call('GET', '/labels').then((d) => d?.labels ?? []),
    parse: (line, url, today, now) => call('POST', '/quick-add/parse', { line, url: url || undefined, today, now }),
    createLabel: (name, n) => call('POST', '/labels', { name }, `${key}.l${n}`),
    // A dated task gets the account's default reminder (default-reminders D6),
    // unless the line carries its own reminders.
    createTask: (body, { ownReminders = false } = {}) => call('POST', body.due && !ownReminders ? '/tasks?default_reminder=true' : '/tasks', body, key),
    createReminder: (body, n) => call('POST', '/reminders', body, `${key}.r${n}`),
    createTimeEntry: (body) => call('POST', '/time-entries', body, `${key}.t`),
  }
}

/** A random id for one popup opening. */
export function randomKey() {
  const b = new Uint8Array(16)
  globalThis.crypto.getRandomValues(b)
  return 'ext-' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** The local date and time the parse route reads `tomorrow` and `9am` against. */
export function localNow(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return { today: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, now: `${p(d.getHours())}:${p(d.getMinutes())}` }
}
