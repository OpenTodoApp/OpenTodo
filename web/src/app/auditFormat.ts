import { roleName } from '../lib/roleNames'
import type { AuditEvent, AuditEventName, AuditFilters } from '../lib/types'
import { t, msg, translatedMap } from '../lib/i18n'

export const AUDIT_LABELS = translatedMap<AuditEventName>({
  'login.succeeded': msg('Signed in'),
  'login.failed': msg('Sign-in failed'),
  logout: msg('Signed out'),
  'mfa.enrolled': msg('Second factor enabled'),
  'mfa.disabled': msg('Second factor disabled'),
  'mfa.reset': msg('Second factor reset'),
  'mfa.challenge_failed': msg('Second-factor code rejected'),
  'passkey.registered': msg('Passkey added'),
  'passkey.deleted': msg('Passkey removed'),
  'token.created': msg('API token created'),
  'token.revoked': msg('API token revoked'),
  'app_password.created': msg('Calendar app password created'),
  'app_password.revoked': msg('Calendar app password revoked'),
  'calendar_feed.created': msg('Calendar feed URL created'),
  'calendar_feed.rotated': msg('Calendar feed URL replaced'),
  'calendar_feed.revoked': msg('Calendar feed URL revoked'),
  'email_inbox.created': msg('Email-to-task address created'),
  'email_inbox.rotated': msg('Email-to-task address rotated'),
  'email_inbox.updated': msg('Email-to-task setting changed'),
  'issue_connection.created': msg('Issue connection added'),
  'issue_connection.updated': msg('Issue connection changed'),
  'issue_connection.deleted': msg('Issue connection deleted'),
  'invitation.created': msg('Invitation created'),
  'invitation.accepted': msg('Invitation accepted'),
  'invitation.revoked': msg('Invitation revoked'),
  'project_invite.created': msg('Project invite link created'),
  'project_invite.revoked': msg('Project invite link revoked'),
  'project_invite.accepted': msg('Joined a project with a link'),
  'public_link.created': msg('Public link created'),
  'public_link.revoked': msg('Public link revoked'),
  'role.changed': msg('Role changed'),
  'settings.changed': msg('Setting changed'),
  'identity.linked': msg('Sign-in provider linked'),
  'identity.unlinked': msg('Sign-in provider unlinked'),
  'export.requested': msg('Data exported'),
  'audit.exported': msg('Audit log exported'),
  'backup.created': msg('Backup created'),
  'backup.restored': msg('Backup restored'),
  'backup.restore_requested': msg('Restore requested'),
  'backup.restore_failed': msg('Restore failed'),
  'backup.safety_copy_deleted': msg('Safety copy deleted'),
  'user.deactivated': msg('Account deactivated'),
  'user.reactivated': msg('Account reactivated'),
  'user.deleted': msg('Account deleted'),
  'password.reset_issued': msg('Password reset link issued'),
  'password.reset_completed': msg('Password reset through a link'),
  'password.changed': msg('Password changed'),
  'sessions.revoked': msg('Signed out everywhere'),
  'owner.transferred': msg('Ownership transferred'),
  'agent.write': msg('AI assistant made changes'),
  'email.sent': msg('Email sent'),
  'email.failed': msg('Email not sent'),
  'relay.enabled': msg('Device answers AI connectors'),
  'relay.disabled': msg('Device stopped answering AI connectors'),
})

const REASONS = translatedMap<string>({
  wrong_password: msg('wrong password'),
  unknown_account: msg('unknown account'),
  rate_limited: msg('too many attempts'),
  connect: msg('mail server unreachable'),
  tls: msg('secure connection failed'),
  auth: msg('mail server refused the sign-in'),
  send: msg('mail server refused the message'),
  encrypted_account: msg('encrypted account'),
  deactivated: msg('account deactivated'),
  unknown_passkey: msg('unknown passkey'),
  passkey_rejected: msg('passkey rejected'),
  passkey_counter_regression: msg('possible cloned passkey'),
  writes_disabled_by_owner: msg('assistant changes are off on this server'),
  writes_disabled_by_user: msg('assistant changes are off for this account'),
  encryption_enabled: msg('end-to-end encryption is on'),
  not_permitted: msg('not created by this assistant'),
  // relay.disabled (mcp-device-relay)
  user: msg('turned off'),
  locked: msg('device locked'),
  signed_out: msg('signed out'),
  encryption_off: msg('encryption turned off'),
  device_unavailable: msg('no device online to answer'),
  device_timeout: msg('the device did not answer in time'),
  declined_on_device: msg('declined on the device'),
  device_limit: msg('the device reached its limit'),
})

const EMAIL_KINDS = translatedMap<string>({
  verify_signup: msg('Sign-up confirmation'),
  password_reset: msg('Password reset'),
  invitation: msg('Invitation'),
  project_invite: msg('Project invite'),
  test: msg('Test message'),
})

const SETTINGS = translatedMap<string>({
  'audit.retention_days': msg('Audit retention (days)'),
  'audit.log_ip': msg('Address logging'),
  webhooks_allow_private: msg('Private webhook targets'),
  'mcp.enabled': msg('AI assistants (MCP)'),
  'mcp.writes': msg('AI assistants may make changes'),
  'agent.writes': msg('Allow AI assistants to make changes'),
  'project_invites.members_create_accounts': msg('Members can invite new people with project links'),
  'smtp.host': msg('Outgoing email server'),
  'smtp.port': msg('Outgoing email port'),
  'smtp.security': msg('Outgoing email security'),
  'smtp.user': msg('Outgoing email username'),
  'smtp.password': msg('Outgoing email password'),
  'smtp.from': msg('Outgoing email From address'),
})

/** One-line summary of an event's allow-listed details. */
export function eventSummary(ev: AuditEvent): string {
  const d = ev.details
  const parts: string[] = []
  if (d.reason) parts.push(REASONS[d.reason] ?? d.reason.replace(/_/g, ' '))
  if (d.email_kind) parts.push(t('{kind} to {email}', { kind: EMAIL_KINDS[d.email_kind] ?? d.email_kind.replace(/_/g, ' '), email: d.email ?? '?' }))
  if (d.method && d.method !== 'password') parts.push(d.method === 'register' ? t('new account') : t('via {method}', { method: d.method }))
  if (d.tool) parts.push(d.tool)
  if (d.relay_device_label) parts.push(`“${d.relay_device_label}”`)
  if (d.token_name) parts.push(d.token_scope === 'read' ? t('“{name}” (read-only)', { name: d.token_name }) : d.token_scope === 'agent' ? t('“{name}” (assistant, can make changes)', { name: d.token_name }) : d.token_scope === 'admin' ? t('“{name}” (admin)', { name: d.token_name }) : `“${d.token_name}”`)
  if (d.session_count) parts.push(t('{n, plural, one {# session} other {# sessions}}', { n: Number(d.session_count) }))
  if (d.token_count && d.token_count !== '0') parts.push(t('{n, plural, one {# API token} other {# API tokens}}', { n: Number(d.token_count) }))
  if (d.app_password_count && d.app_password_count !== '0') parts.push(t('{n, plural, one {# app password} other {# app passwords}}', { n: Number(d.app_password_count) }))
  if (d.passkey_name) parts.push(`“${d.passkey_name}”`)
  if (d.project_role) parts.push(t('as {role}', { role: roleName(d.project_role) }))
  if (d.link_rights) parts.push(d.link_rights === 'tick' ? t('can tick off tasks') : t('view only'))
  if (d.invited_email) parts.push(t('for {email}', { email: d.invited_email }))
  if (d.setting) parts.push(`${SETTINGS[d.setting] ?? d.setting}: ${d.from ?? '?'} → ${d.to ?? '?'}`)
  else if (d.from || d.to) parts.push(`${d.from ?? '?'} → ${d.to ?? '?'}`)
  if (d.provider) parts.push(d.provider)
  if (d.count) {
    const n = Number(d.count)
    parts.push(ev.name === 'agent.write' ? t('{n, plural, one {# item changed} other {# items changed}}', { n }) : t('{n, plural, one {# event} other {# events}}', { n }))
  }
  return parts.join(' · ')
}

/** The account an event is about, for display: actor first, then target. */
export function eventAccount(ev: AuditEvent): string {
  return ev.actorEmail ?? ev.targetEmail ?? ev.details.email ?? (ev.actorId || ev.targetId ? t('deleted account') : '—')
}

/** Shortens a user agent to its most telling part for list display. */
export function shortAgent(ua: string): string {
  if (!ua) return t('unknown client')
  const m = ua.match(/(Firefox|Edg|Chrome|Safari)\/[\d.]+/)
  const os = ua.match(/\((?:[^;)]*; )?([^;)]+)/)
  if (m) return os ? t('{browser} on {os}', { browser: m[1] === 'Edg' ? 'Edge' : m[1], os: os[1] }) : m[1] === 'Edg' ? 'Edge' : m[1]
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
