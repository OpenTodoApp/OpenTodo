import { ApiError } from './api'
import { getMeta, setMeta } from './db'
import type { Webhook, WebhookDelivery, WebhookEvent } from './types'
import { formatInstant } from './dates'
import { t, msg } from './i18n'

/** Subscribable events in display order, with labels for the Settings screen. */
export const WEBHOOK_EVENTS: { event: WebhookEvent; label: string }[] = [
  { event: 'task.created', label: msg('Task created') },
  { event: 'task.updated', label: msg('Task updated') },
  { event: 'task.completed', label: msg('Task completed') },
  { event: 'task.reopened', label: msg('Task reopened') },
  { event: 'task.deleted', label: msg('Task deleted') },
  { event: 'project.created', label: msg('Project created') },
  { event: 'project.updated', label: msg('Project updated') },
  { event: 'project.archived', label: msg('Project archived') },
  { event: 'project.deleted', label: msg('Project deleted') },
  // Imports are reported once per job, not once per task (harden-server-edges).
  { event: 'import.completed', label: msg('Import completed') },
  { event: 'import.undone', label: msg('Import undone') },
]

export type WebhookTone = 'ok' | 'warn' | 'off'

/** Status line for a webhook row: active, failing, paused by the user or disabled by the server. */
export function webhookStatus(h: Webhook): { label: string; tone: WebhookTone } {
  if (!h.enabled) {
    if (h.disabledReason === 'too_many_failures') return { label: t('Disabled after repeated failures'), tone: 'warn' }
    if (h.disabledReason) return { label: t('Disabled: {reason}', { reason: h.disabledReason }), tone: 'warn' }
    return { label: t('Paused'), tone: 'off' }
  }
  if (h.consecutiveFailures > 0) return { label: t('Active, {n} failed in a row', { n: h.consecutiveFailures }), tone: 'warn' }
  return { label: t('Active'), tone: 'ok' }
}

/**
 * True for plain-HTTP targets outside this machine: task content would cross the
 * network unencrypted. Loopback targets are not flagged.
 */
export function insecureTarget(url: string): boolean {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return false
  }
  if (u.protocol !== 'http:') return false
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return !(host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127\./.test(host))
}

/** Toggle one event in a selection, keeping the canonical order. */
export function toggleEvent(selected: WebhookEvent[], event: WebhookEvent): WebhookEvent[] {
  const set = new Set(selected)
  if (set.has(event)) set.delete(event)
  else set.add(event)
  return WEBHOOK_EVENTS.map((e) => e.event).filter((e) => set.has(e))
}

/** Human summary of a delivery's outcome for the log. */
export function deliveryOutcome(d: WebhookDelivery): string {
  const parts: string[] = []
  if (d.statusCode !== null) parts.push(`HTTP ${d.statusCode}`)
  if (d.error && !(d.statusCode !== null && d.error === `HTTP ${d.statusCode}`)) {
    parts.push(d.error === 'private_target' ? t('refused: private network target') : d.error)
  }
  if (d.durationMs !== null) parts.push(`${d.durationMs} ms`)
  if (d.status === 'retry' && d.nextAttemptAt) parts.push(t('next try {instant}', { instant: formatInstant(d.nextAttemptAt, 'datetime') }))
  return parts.join(' · ')
}

/** Error text for a failed webhook request. */
export function describeWebhookError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'private_target') {
      return t('That address is on a private network (LAN, localhost or similar). The server owner can allow private network targets below.')
    }
    if (err.code === 'limit_reached') return t('You already have the maximum of 20 webhooks.')
    return err.message
  }
  return t('The server is unreachable. Webhooks are managed on the server and need a connection.')
}

// The last fetched list is cached in the local meta table (cleared on sign-out)
// so the screen can show it while offline. It never contains secrets.
const CACHE_KEY = 'webhooks.cache'

export async function loadCachedWebhooks(): Promise<Webhook[] | null> {
  try {
    return await getMeta<Webhook[] | null>(CACHE_KEY, null)
  } catch {
    return null
  }
}

export async function cacheWebhooks(list: Webhook[]): Promise<void> {
  try {
    await setMeta(CACHE_KEY, list.map(({ secret: _secret, ...rest }) => rest))
  } catch {
    // Caching is a convenience; ignore storage failures.
  }
}
