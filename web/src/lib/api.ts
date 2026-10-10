import type { AssertionJSON, CreationOptionsJSON, RegistrationJSON, RequestOptionsJSON } from './passkeys'
import type {
  AuditEvent, AuditFilters, AuditSettings, AuthStatus, BackupSecretFlags, BackupSecretUpdate, BackupSettings, BackupStatus, ImportJob, ImportOptions, ImportPreview, Invitation, InvitationPreview, LoginResult, Membership, MfaPolicy, MfaStatus, Op, Passkey, ProjectRole, PushSubscriptionStatus, SyncResponse, TrustedDevice, User,
  Webhook, WebhookDelivery, WebhookEvent, WebhookInput,
} from './types'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

// ---- global second-factor handling (OpenSpec `mfa-totp`) ----
//
// A sensitive route answers 403 `reauth_required` when the session has not
// proved its identity in the last ten minutes. The UI registers a handler that
// asks for the password or a code (ReauthDialog); after it succeeds the
// original request is repeated once. A 403 `mfa_enrolment_required` means the
// owner's policy requires a second factor this account lacks: listeners (the
// app shell) route to the enrolment wizard.

/** Resolves true once the user re-authenticated, false when they cancelled. */
export type ReauthHandler = () => Promise<boolean>
let reauthHandler: ReauthHandler | null = null
let reauthInFlight: Promise<boolean> | null = null
const enrolmentListeners = new Set<() => void>()

/** Registers the re-authentication prompt; returns an unregister function. */
export function setReauthHandler(h: ReauthHandler): () => void {
  reauthHandler = h
  return () => {
    if (reauthHandler === h) reauthHandler = null
  }
}

/** Subscribes to "this session must enrol a second factor"; returns an unsubscribe function. */
export function onEnrolmentRequired(fn: () => void): () => void {
  enrolmentListeners.add(fn)
  return () => enrolmentListeners.delete(fn)
}

function reauthenticate(): Promise<boolean> {
  if (!reauthHandler) return Promise.resolve(false)
  // Concurrent requests share one prompt.
  reauthInFlight ??= reauthHandler().finally(() => {
    reauthInFlight = null
  })
  return reauthInFlight
}

async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  try {
    return await send<T>(method, path, body)
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      if (err.code === 'reauth_required' && !retried && (await reauthenticate())) {
        return request<T>(method, path, body, true)
      }
      if (err.code === 'mfa_enrolment_required') enrolmentListeners.forEach((fn) => fn())
    }
    throw err
  }
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  return parse<T>(res)
}

/** Multipart upload for the import routes: the file plus the options as one JSON part. */
async function upload<T>(path: string, file: Blob, filename: string, options: ImportOptions): Promise<T> {
  const form = new FormData()
  form.append('options', JSON.stringify(options))
  form.append('file', file, filename)
  const res = await fetch(path, { method: 'POST', body: form, credentials: 'same-origin' })
  return parse<T>(res)
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string } }).error
    throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? res.statusText)
  }
  return data as T
}

export const api = {
  authStatus: () => request<AuthStatus>('GET', '/api/v1/auth/status'),
  /** Register an account. `invitation` is the secret from an invite link; it admits one member while sign-up is closed. */
  register: (email: string, name: string, password: string, invitation?: string) =>
    request<{ user: User }>('POST', '/api/v1/auth/register', invitation ? { email, name, password, invitation } : { email, name, password }),
  /** Password step. An account with a second factor answers with a challenge instead of a session. */
  login: (email: string, password: string) => request<LoginResult>('POST', '/api/v1/auth/login', { email, password }),
  /** Second sign-in step: a code from the app, or a recovery code. `remember` trusts this browser for 30 days. */
  mfaLogin: (challenge: string, code: string, opts: { recovery?: boolean; remember?: boolean } = {}) =>
    request<{ user: User }>('POST', '/api/v1/auth/mfa', {
      challenge, ...(opts.recovery ? { recoveryCode: code } : { code }), remember: !!opts.remember,
    }),
  /** Proves identity again (password or code) so sensitive actions work for ten minutes. */
  reauth: (input: { password: string } | { code: string }) =>
    request<{ reauthAt: number; validForMs: number }>('POST', '/api/v1/auth/reauth', input, true),
  me: () => request<{ user: User; mfa: MfaStatus }>('GET', '/api/v1/me'),
  mfaStatus: () => request<{ mfa: MfaStatus }>('GET', '/api/v1/mfa'),
  enrollTotp: () => request<{ secret: string; uri: string; expiresAt: number }>('POST', '/api/v1/mfa/totp/enroll', {}),
  confirmTotp: (code: string) => request<{ recoveryCodes: string[]; mfa: MfaStatus }>('POST', '/api/v1/mfa/totp/confirm', { code }),
  disableTotp: () => request<void>('DELETE', '/api/v1/mfa/totp'),
  regenerateRecoveryCodes: () => request<{ recoveryCodes: string[] }>('POST', '/api/v1/mfa/recovery-codes/regenerate', {}),
  listTrustedDevices: () => request<{ devices: TrustedDevice[] }>('GET', '/api/v1/mfa/trusted-devices'),
  forgetTrustedDevices: () => request<void>('DELETE', '/api/v1/mfa/trusted-devices'),
  forgetTrustedDevice: (id: string) => request<void>('DELETE', `/api/v1/mfa/trusted-devices/${encodeURIComponent(id)}`),
  getMfaPolicy: () => request<{ required: MfaPolicy }>('GET', '/api/v1/settings/mfa'),
  setMfaPolicy: (required: MfaPolicy) => request<{ required: MfaPolicy }>('PUT', '/api/v1/settings/mfa', { required }),
  resetMemberMfa: (userId: string) => request<void>('POST', `/api/v1/members/${encodeURIComponent(userId)}/mfa/reset`, {}),
  logout: () => request<void>('POST', '/api/v1/auth/logout'),
  /** `tzOffset` (minutes east of UTC) lets REST writes recompute relative reminders in this zone. */
  sync: (device: string, cursor: number, ops: Op[], tzOffset?: number) =>
    request<SyncResponse>('POST', '/api/v1/sync', tzOffset === undefined ? { device, cursor, ops } : { device, cursor, ops, tzOffset }),
  // Project sharing: membership is server-side authorization data, changed only through these routes.
  listMembers: (projectId: string) => request<Membership>('GET', `/api/v1/projects/${encodeURIComponent(projectId)}/members`),
  addMember: (projectId: string, email: string, role: ProjectRole) =>
    request<Membership>('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/members`, { email, role }),
  setMemberRole: (projectId: string, userId: string, role: ProjectRole) =>
    request<Membership>('PATCH', `/api/v1/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`, { role }),
  removeMember: (projectId: string, userId: string) =>
    request<void>('DELETE', `/api/v1/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`),
  transferProject: (projectId: string, userId: string) =>
    request<Membership>('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/transfer`, { userId }),
  // Web push (OpenSpec change `reminders`). 404 when the operator turned push off.
  pushKey: (device?: string) =>
    request<{ publicKey: string; subscription?: PushSubscriptionStatus | null }>(
      'GET', `/api/v1/push/vapid-key${device ? `?device=${encodeURIComponent(device)}` : ''}`,
    ),
  pushSubscribe: (body: { deviceId: string; endpoint: string; keys: { p256dh: string; auth: string }; includeContent: boolean }) =>
    request<{ subscription: PushSubscriptionStatus }>('POST', '/api/v1/push/subscriptions', body),
  pushUnsubscribe: (id: string) => request<void>('DELETE', `/api/v1/push/subscriptions/${encodeURIComponent(id)}`),
  listTokens: () => request<{ tokens: { id: string; name: string; createdAt: number; lastUsedAt: number | null }[] }>('GET', '/api/v1/tokens'),
  createToken: (name: string) => request<{ token: { id: string; name: string }; secret: string }>('POST', '/api/v1/tokens', { name }),
  deleteToken: (id: string) => request<void>('DELETE', `/api/v1/tokens/${id}`),
  // Passkeys (OpenSpec change `passkeys`). Binary fields are base64url strings.
  passkeyLoginOptions: () => request<{ publicKey: RequestOptionsJSON }>('POST', '/api/v1/auth/passkey/options', {}),
  /** A passkey without user verification on an enrolled account also answers with a challenge. */
  passkeyLogin: (credential: AssertionJSON) => request<LoginResult>('POST', '/api/v1/auth/passkey', { credential }),
  passkeyRegisterOptions: () => request<{ publicKey: CreationOptionsJSON }>('POST', '/api/v1/passkeys/register/options', {}),
  passkeyRegister: (name: string, credential: RegistrationJSON) =>
    request<{ passkey: Passkey }>('POST', '/api/v1/passkeys/register', { name, credential }),
  listPasskeys: () => request<{ passkeys: Passkey[] }>('GET', '/api/v1/passkeys'),
  renamePasskey: (id: string, name: string) => request<{ passkey: Passkey }>('PATCH', `/api/v1/passkeys/${encodeURIComponent(id)}`, { name }),
  deletePasskey: (id: string) => request<void>('DELETE', `/api/v1/passkeys/${encodeURIComponent(id)}`),

  // Invitations (owner only, except the public preview). The link is returned once at creation.
  listInvitations: () => request<{ invitations: Invitation[] }>('GET', '/api/v1/invitations'),
  createInvitation: (input: { email?: string; expiresInHours?: number } = {}) =>
    request<{ invitation: Invitation; link: string }>('POST', '/api/v1/invitations', input),
  revokeInvitation: (id: string) => request<void>('DELETE', `/api/v1/invitations/${id}`),
  previewInvitation: (token: string) => request<InvitationPreview>('GET', `/api/v1/invitations/${encodeURIComponent(token)}`),

  // Backups (owner only). Secrets are write-only: responses carry presence flags.
  backupStatus: () => request<BackupStatus>('GET', '/api/v1/backups'),
  backupSettings: () => request<{ settings: BackupSettings; secrets: BackupSecretFlags }>('GET', '/api/v1/backups/settings'),
  saveBackupSettings: (settings: BackupSettings, secrets: BackupSecretUpdate) =>
    request<{ settings: BackupSettings; secrets: BackupSecretFlags }>('PUT', '/api/v1/backups/settings', { settings, secrets }),
  runBackup: () => request<{ status: string }>('POST', '/api/v1/backups/run'),
  testBackupDestination: () => request<{ ok: boolean }>('POST', '/api/v1/backups/test'),
  // Audit log (owner only, except personal activity). Always fetched live and kept in
  // component state only: audit data is never written to IndexedDB or any cache.
  listAudit: (filters: AuditFilters = {}, cursor?: number | null, limit?: number) => {
    const q = auditQuery(filters)
    if (cursor) q.set('cursor', String(cursor))
    if (limit) q.set('limit', String(limit))
    const qs = q.toString()
    return request<{ events: AuditEvent[]; cursor: number | null }>('GET', `/api/v1/audit${qs ? `?${qs}` : ''}`)
  },
  getAuditSettings: () => request<AuditSettings>('GET', '/api/v1/settings/audit'),
  updateAuditSettings: (patch: Partial<AuditSettings>) => request<AuditSettings>('PUT', '/api/v1/settings/audit', patch),
  myActivity: () => request<{ events: AuditEvent[] }>('GET', '/api/v1/me/activity'),

  // Import runs on the server (docs/import.md): preview is a dry run, start returns a running job.
  previewImport: (file: Blob, filename: string, options: ImportOptions) =>
    upload<ImportPreview>('/api/v1/import/preview', file, filename, options),
  startImport: (file: Blob, filename: string, options: ImportOptions) =>
    upload<{ job: ImportJob }>('/api/v1/import', file, filename, options),
  listImportJobs: () => request<{ jobs: ImportJob[] }>('GET', '/api/v1/import/jobs'),
  getImportJob: (id: string) => request<{ job: ImportJob }>('GET', `/api/v1/import/jobs/${encodeURIComponent(id)}`),
  undoImport: (id: string) => request<{ job: ImportJob }>('POST', `/api/v1/import/jobs/${encodeURIComponent(id)}/undo`),

  // Webhooks (per user). The secret is returned once, in the create response.
  listWebhooks: () => request<{ webhooks: Webhook[]; events: WebhookEvent[] }>('GET', '/api/v1/webhooks'),
  createWebhook: (input: WebhookInput) => request<{ webhook: Webhook }>('POST', '/api/v1/webhooks', input),
  updateWebhook: (id: string, input: WebhookInput) =>
    request<{ webhook: Webhook }>('PATCH', `/api/v1/webhooks/${encodeURIComponent(id)}`, input),
  deleteWebhook: (id: string) => request<void>('DELETE', `/api/v1/webhooks/${encodeURIComponent(id)}`),
  testWebhook: (id: string) =>
    request<{ ok: boolean; delivery: WebhookDelivery }>('POST', `/api/v1/webhooks/${encodeURIComponent(id)}/test`),
  listDeliveries: (id: string) =>
    request<{ deliveries: WebhookDelivery[] }>('GET', `/api/v1/webhooks/${encodeURIComponent(id)}/deliveries`),
  redeliver: (id: string, deliveryId: string) =>
    request<{ delivery: WebhookDelivery }>(
      'POST', `/api/v1/webhooks/${encodeURIComponent(id)}/deliveries/${encodeURIComponent(deliveryId)}/redeliver`,
    ),
  // Owner-only policy: allow webhook targets on private networks (Home Assistant, n8n on the LAN).
  getWebhookPolicy: () => request<{ allowPrivate: boolean }>('GET', '/api/v1/settings/webhooks'),
  setWebhookPolicy: (allowPrivate: boolean) =>
    request<{ allowPrivate: boolean }>('PUT', '/api/v1/settings/webhooks', { allowPrivate }),
}

function auditQuery(f: AuditFilters): URLSearchParams {
  const q = new URLSearchParams()
  if (f.name) q.set('name', f.name)
  if (f.actor?.trim()) q.set('actor', f.actor.trim())
  if (f.target?.trim()) q.set('target', f.target.trim())
  if (f.outcome) q.set('outcome', f.outcome)
  if (f.from) q.set('from', String(Math.floor(f.from)))
  if (f.to) q.set('to', String(Math.floor(f.to)))
  return q
}

/** Download URL of the audit log export (NDJSON) carrying the same filters as the list. */
export function auditExportUrl(filters: AuditFilters = {}): string {
  const qs = auditQuery(filters).toString()
  return `/api/v1/audit/export${qs ? `?${qs}` : ''}`
}

/** True for failures that mean "no server reachable" rather than a server answer. */
export function isNetworkError(err: unknown): boolean {
  return !(err instanceof ApiError)
}
