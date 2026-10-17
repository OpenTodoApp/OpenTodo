// Requests with a deadline (OpenSpec change client-sync-robustness): every call
// to the server gets a timeout, so a stalled request cannot hold up the sync
// loop, and the errors that mean "no answer" are told apart from bugs.
import { t } from './i18n/catalog'

/** A request that got no answer in time. Transient: the caller may try again later. */
export class RequestTimeoutError extends Error {
  constructor() {
    super(t('The server took too long to answer. Your changes stay on this device.'))
    this.name = 'RequestTimeoutError'
  }
}

/**
 * The network failed before any answer arrived (fetch's own TypeError). Only
 * this, a timeout and `navigator.onLine === false` mean "offline"; a TypeError
 * thrown by our own code is a bug and is reported as one.
 */
export class NetworkError extends TypeError {
  constructor(cause?: unknown) {
    super('network error', cause === undefined ? undefined : { cause })
    this.name = 'NetworkError'
  }
}

/** Whether an error means "no answer from the server": try again later, with backoff. */
export function isTransientNetworkError(err: unknown): boolean {
  return err instanceof NetworkError || err instanceof RequestTimeoutError
}

/** Ordinary requests; a stalled one must not hold up the next sync for ever. */
const DEFAULT_TIMEOUT_MS = 30_000
/** Uploads and downloads of files and archives, which may be large on slow links. */
const TRANSFER_TIMEOUT_MS = 10 * 60_000
export const timeouts = { request: DEFAULT_TIMEOUT_MS, transfer: TRANSFER_TIMEOUT_MS }

/** Test hook: shorten (or restore, with no argument) the request timeouts. */
export function setRequestTimeouts(next?: Partial<typeof timeouts>): void {
  timeouts.request = next?.request ?? DEFAULT_TIMEOUT_MS
  timeouts.transfer = next?.transfer ?? TRANSFER_TIMEOUT_MS
}

/** The transfer timeout, for downloads made outside this module (attachments). */
export function transferTimeoutMs(): number {
  return timeouts.transfer
}

/** A signal that aborts after `ms`, or when `outer` aborts, whichever comes first. */
function deadline(ms: number, outer?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  if (!outer) return timeout
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([timeout, outer])
  const c = new AbortController()
  const stop = (s: AbortSignal) => c.abort(s.reason)
  if (outer.aborted) stop(outer)
  outer.addEventListener('abort', () => stop(outer), { once: true })
  timeout.addEventListener('abort', () => stop(timeout), { once: true })
  return c.signal
}

/**
 * fetch with a deadline. A timeout becomes RequestTimeoutError, a network
 * failure NetworkError; an abort by the caller's own signal is passed on as is.
 */
export async function fetchWithTimeout(input: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = timeouts.request, signal: outer, ...rest } = init
  const signal = deadline(timeoutMs, outer ?? undefined)
  try {
    return await fetch(input, { ...rest, signal })
  } catch (err) {
    if (outer?.aborted) throw err
    if (signal.aborted) throw new RequestTimeoutError()
    if (err instanceof TypeError) throw new NetworkError(err)
    throw err
  }
}

