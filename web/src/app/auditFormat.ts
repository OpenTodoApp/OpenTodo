import type { AuditEvent, AuditEventName, AuditFilters } from '../lib/types'

export const AUDIT_LABELS: Record<AuditEventName, string> = {
  'login.succeeded': 'Signed in',
  'login.failed': 'Sign-in failed',
  logout: 'Signed out',
  'mfa.enrolled': 'Second factor enabled',
  'mfa.disabled': 'Second factor disabled',
  'mfa.reset': 'Second factor reset',
  'mfa.challenge_failed': 'Second-factor code rejected',
  'passkey.registered': 'Passkey added',
  'passkey.deleted': 'Passkey removed',
  'token.created': 'API token created',
  'token.revoked': 'API token revoked',
  'invitation.created': 'Invitation created',
  'invitation.accepted': 'Invitation accepted',
  'invitation.revoked': 'Invitation revoked',
  'role.changed': 'Role changed',
  'settings.changed': 'Setting changed',
  'identity.linked': 'Sign-in provider linked',
  'identity.unlinked': 'Sign-in provider unlinked',
  'export.requested': 'Data exported',
  'audit.exported': 'Audit log exported',
  'backup.created': 'Backup created',
  'backup.restored': 'Backup restored',
  'user.deactivated': 'Account deactivated',
  'user.reactivated': 'Account reactivated',
  'user.deleted': 'Account deleted',
  'password.reset_issued': 'Password reset link issued',
  'password.reset_completed': 'Password reset through a link',
  'password.changed': 'Password changed',
  'owner.transferred': 'Ownership transferred',
}

const REASONS: Record<string, string> = {
  wrong_password: 'wrong password',
  unknown_account: 'unknown account',
  rate_limited: 'too many attempts',
  deactivated: 'account deactivated',
  unknown_passkey: 'unknown passkey',
  passkey_rejected: 'passkey rejected',
  passkey_counter_regression: 'possible cloned passkey',
}

const SETTINGS: Record<string, string> = {
  'audit.retention_days': 'Audit retention (days)',
  'audit.log_ip': 'Address logging',
  webhooks_allow_private: 'Private webhook targets',
  'mcp.enabled': 'AI assistants (MCP)',
}

/** One-line summary of an event's allow-listed details. */
export function eventSummary(ev: AuditEvent): string {
  const d = ev.details
  const parts: string[] = []
  if (d.reason) parts.push(REASONS[d.reason] ?? d.reason.replace(/_/g, ' '))
  if (d.method && d.method !== 'password') parts.push(d.method === 'register' ? 'new account' : `via ${d.method}`)
  if (d.token_name) parts.push(`“${d.token_name}”${d.token_scope === 'read' ? ' (read-only)' : ''}`)
  if (d.passkey_name) parts.push(`“${d.passkey_name}”`)
  if (d.invited_email) parts.push(`for ${d.invited_email}`)
  if (d.setting) parts.push(`${SETTINGS[d.setting] ?? d.setting}: ${d.from ?? '?'} → ${d.to ?? '?'}`)
  else if (d.from || d.to) parts.push(`${d.from ?? '?'} → ${d.to ?? '?'}`)
  if (d.provider) parts.push(d.provider)
  if (d.count) parts.push(`${d.count} ${d.count === '1' ? 'event' : 'events'}`)
  return parts.join(' · ')
}

/** The account an event is about, for display: actor first, then target. */
export function eventAccount(ev: AuditEvent): string {
  return ev.actorEmail ?? ev.targetEmail ?? ev.details.email ?? (ev.actorId || ev.targetId ? 'deleted account' : '—')
}

/** Shortens a user agent to its most telling part for list display. */
export function shortAgent(ua: string): string {
  if (!ua) return 'unknown client'
  const m = ua.match(/(Firefox|Edg|Chrome|Safari)\/[\d.]+/)
  const os = ua.match(/\((?:[^;)]*; )?([^;)]+)/)
  if (m) return `${m[1] === 'Edg' ? 'Edge' : m[1]}${os ? ` on ${os[1]}` : ''}`
  return ua.length > 40 ? `${ua.slice(0, 40)}…` : ua
}

export type RangePreset = 'any' | '1d' | '7d' | '30d' | 'custom'

export interface FilterForm {
  name: '' | AuditEventName
  actor: string
  outcome: '' | 'success' | 'failure'
  range: RangePreset
  fromDate: string // YYYY-MM-DD, custom range only
  toDate: string
}

export const EMPTY_FORM: FilterForm = { name: '', actor: '', outcome: '', range: 'any', fromDate: '', toDate: '' }

const DAY = 24 * 60 * 60 * 1000

/** Turns the filter form into API filters; relative ranges are resolved against `now`. */
export function toFilters(form: FilterForm, now = Date.now()): AuditFilters {
  const f: AuditFilters = {}
  if (form.name) f.name = form.name
  if (form.actor.trim()) f.actor = form.actor.trim()
  if (form.outcome) f.outcome = form.outcome
  if (form.range === '1d') f.from = now - DAY
  if (form.range === '7d') f.from = now - 7 * DAY
  if (form.range === '30d') f.from = now - 30 * DAY
  if (form.range === 'custom') {
    if (form.fromDate) f.from = new Date(`${form.fromDate}T00:00:00`).getTime()
    if (form.toDate) f.to = new Date(`${form.toDate}T23:59:59.999`).getTime()
  }
  return f
}
