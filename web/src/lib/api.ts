import type { AgentAccess, ApiToken, McpStatus, TokenScope } from './assistants'
import type { AssistantStatus } from './assistantStatus'
import type { AssistantOwnerSettings, AssistantMemberSettings, AssistantSettingsInput, AssistantTestResult, AssistantUsage, MyAssistantInput } from './assistantTypes'
import type { KeyRecord } from './crypto'
import type { AssertionJSON, CreationOptionsJSON, RegistrationJSON, RequestOptionsJSON } from './passkeys'
import type {
  ConfigWarning,
  AppPassword, CaldavSetting, EmailInbox,
  AccountRole, ActivityPage, AdminUser, AppNotification, AuditEvent, AuditFilters, AuditSettings, AuthStatus, LinkedIdentity, OidcSettings, OidcSettingsInput, OidcStatus, OidcTestResult, BackupSecretFlags, BackupSecretUpdate, BackupSettings, BackupStatus, ImportJob, ImportOptions, ImportPreview, Invitation, InvitationPreview, LoginResult, HistoryPage, Membership, MfaPolicy, ProjectInvite, ProjectInvitePreview, MfaStatus, Op, Passkey, ProjectRole, PurgeCounts, PushSubscriptionStatus, ResetPreview, SyncResponse, TrustedDevice, User,
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
  /** Demo instance (OpenSpec `demo-sandboxes`): create a private sandbox and sign into it. */
  demoSandbox: (token: string) => request<{ user: User }>('POST', '/api/v1/demo/sandbox', { token }),
  /**
   * Register an account. `invitation` is the secret from an invite link; it admits one member while sign-up is closed.
   * `projectInvite` is a project invite link secret: the new account joins that project in the same step.
   */
  register: (email: string, name: string, password: string, invitation?: string, projectInvite?: string) =>
    request<{ user: User; projectId?: string }>('POST', '/api/v1/auth/register', {
      email, name, password, ...(invitation ? { invitation } : {}), ...(projectInvite ? { projectInvite } : {}),
    }),
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
  /** `config_warnings` is present for the owner's session only (trusted-proxies-lenient). */
  me: () => request<{ user: User; mfa: MfaStatus; config_warnings?: ConfigWarning[] }>('GET', '/api/v1/me'),
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
  /** Ends the session. `redirect` is the provider's end-session URL when the owner enabled provider sign-out. */
  logout: () => request<{ redirect?: string } | undefined>('POST', '/api/v1/auth/logout'),
  // Single sign-on (OpenSpec `oidc-login`): the sign-in itself is a browser navigation to oidcStartUrl.
  getOidcSettings: () => request<OidcSettings>('GET', '/api/v1/settings/oidc'),
  saveOidcSettings: (input: OidcSettingsInput) => request<OidcSettings>('PUT', '/api/v1/settings/oidc', input),
  /** Runs discovery against `issuer`, or the saved issuer when omitted. */
  testOidc: (issuer?: string) => request<OidcTestResult>('POST', '/api/v1/settings/oidc/test', issuer ? { issuer } : {}),
  listIdentities: () => request<{ identities: LinkedIdentity[]; provider: OidcStatus }>('GET', '/api/v1/me/identities'),
  unlinkIdentity: (id: string) => request<void>('DELETE', `/api/v1/me/identities/${encodeURIComponent(id)}`),
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
  // Trash and history (OpenSpec change `trash-and-history`): history is read live, never cached.
  history: (entity: 'task' | 'project', id: string, before?: number) =>
    request<HistoryPage>('GET', `/api/v1/${entity}s/${encodeURIComponent(id)}/history${before ? `?before=${before}` : ''}`),
  purge: (entity: 'task' | 'project', id: string) =>
    request<{ purged: PurgeCounts }>('DELETE', `/api/v1/${entity}s/${encodeURIComponent(id)}/purge`),
  emptyTrash: () => request<{ purged: PurgeCounts }>('POST', '/api/v1/trash/purge'),
  // Activity (comments-and-activity): older events than the device keeps, newest first.
  activity: (entity: 'task' | 'project', id: string, before?: string) =>
    request<ActivityPage>('GET', `/api/v1/${entity}s/${encodeURIComponent(id)}/activity${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  // Activity feed (activity-feed): events across the caller's shared projects, newest first.
  feed: (opts: { cursor?: string; project?: string; actor?: string; kind?: string } = {}) => {
    const q = new URLSearchParams()
    for (const k of ['cursor', 'project', 'actor', 'kind'] as const) if (opts[k]) q.set(k, opts[k] as string)
    const s = q.toString()
    return request<ActivityPage>('GET', `/api/v1/activity${s ? `?${s}` : ''}`)
  },
  // Web push (OpenSpec change `reminders`). 404 when the operator turned push off.
  pushKey: (device?: string) =>
    request<{ publicKey: string; subscription?: PushSubscriptionStatus | null }>(
      'GET', `/api/v1/push/vapid-key${device ? `?device=${encodeURIComponent(device)}` : ''}`,
    ),
  pushSubscribe: (body: { deviceId: string; endpoint: string; keys: { p256dh: string; auth: string }; includeContent: boolean }) =>
    request<{ subscription: PushSubscriptionStatus }>('POST', '/api/v1/push/subscriptions', body),
  pushUnsubscribe: (id: string) => request<void>('DELETE', `/api/v1/push/subscriptions/${encodeURIComponent(id)}`),
  // In-app notifications (task-assignment): server-side account data, cached locally.
  listNotifications: () => request<{ notifications: AppNotification[]; unread: number }>('GET', '/api/v1/notifications'),
  readNotification: (id: string) => request<void>('POST', `/api/v1/notifications/${encodeURIComponent(id)}/read`),
  listTokens: () => request<{ tokens: ApiToken[] }>('GET', '/api/v1/tokens'),
  /** scope `read` tokens are refused on every write route (mcp-server). */
  createToken: (name: string, scope?: TokenScope) =>
    request<{ token: ApiToken; secret: string }>('POST', '/api/v1/tokens', scope ? { name, scope } : { name }),
  // AI assistants (mcp-server): status for everyone, the toggle for the owner.
  getMcpSettings: () => request<McpStatus>('GET', '/api/v1/settings/mcp'),
  setMcpSettings: (enabled: boolean) => request<McpStatus>('PUT', '/api/v1/settings/mcp', { enabled }),
  /** Owner only: "AI assistants may make changes" (mcp-write-tools). */
  setMcpWrites: (writesEnabled: boolean) => request<McpStatus>('PUT', '/api/v1/settings/mcp', { writes_enabled: writesEnabled }),
  /** The user's own "Allow AI assistants to make changes" switch. */
  getAgentAccess: () => request<AgentAccess>('GET', '/api/v1/me/agent-access'),
  setAgentAccess: (allowWrites: boolean) => request<AgentAccess>('PUT', '/api/v1/me/agent-access', { allow_writes: allowWrites }),
  deleteToken: (id: string) => request<void>('DELETE', `/api/v1/tokens/${id}`),
  // CalDAV (OpenSpec change `caldav`): the owner toggle and per-user app passwords.
  // End-to-end encryption (OpenSpec `e2ee`): only wrapped key material ever goes here.
  encryptionKeys: () => request<{ keys: KeyRecord }>('GET', '/api/v1/encryption/keys'),
  putEncryptionKeys: (record: KeyRecord) => request<{ keys: KeyRecord }>('PUT', '/api/v1/encryption/keys', {
    version: record.version, kdf: record.kdf, salt: record.salt, iterations: record.iterations,
    wrappedByPassphrase: record.wrappedByPassphrase, wrappedByRecovery: record.wrappedByRecovery,
  }),
  deleteEncryptionKeys: () => request<void>('DELETE', '/api/v1/encryption/keys'),
  purgeEncryptionHistory: () => request<{ purged: number; notice: string }>('POST', '/api/v1/encryption/purge-history'),
  caldavSetting: () =>request<CaldavSetting>('GET', '/api/v1/settings/caldav'),
  setCaldavEnabled: (enabled: boolean) => request<CaldavSetting>('PUT', '/api/v1/settings/caldav', { enabled }),
  listAppPasswords: () => request<{ appPasswords: AppPassword[] }>('GET', '/api/v1/app-passwords'),
  createAppPassword: (name: string) => request<{ appPassword: AppPassword; secret: string }>('POST', '/api/v1/app-passwords', { name }),
  revokeAppPassword: (id: string) => request<void>('DELETE', `/api/v1/app-passwords/${encodeURIComponent(id)}`),
  // Email to task (OpenSpec change `email-to-task`): the caller's secret inbox address.
  emailInbox: () => request<EmailInbox>('GET', '/api/v1/email-inbox'),
  updateEmailInbox: (patch: { enabled?: boolean; allowlist?: string[] }) => request<EmailInbox>('PATCH', '/api/v1/email-inbox', patch),
  rotateEmailInbox: () => request<EmailInbox>('POST', '/api/v1/email-inbox/rotate'),
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

  // Invitations (owner and admins, except the public preview). The link is returned once at creation.
  listInvitations: () => request<{ invitations: Invitation[] }>('GET', '/api/v1/invitations'),
  createInvitation: (input: { email?: string; expiresInHours?: number } = {}) =>
    request<{ invitation: Invitation; link: string }>('POST', '/api/v1/invitations', input),
  revokeInvitation: (id: string) => request<void>('DELETE', `/api/v1/invitations/${id}`),
  previewInvitation: (token: string) => request<InvitationPreview>('GET', `/api/v1/invitations/${encodeURIComponent(token)}`),
  // Project invite links (OpenSpec `project-invite-links`): managed by the project's owner and admins; the link is returned once.
  listProjectInvites: (projectId: string) =>
    request<{ invites: ProjectInvite[] }>('GET', `/api/v1/projects/${encodeURIComponent(projectId)}/invites`),
  createProjectInvite: (projectId: string, input: { role: ProjectRole; email?: string; expiresInHours?: number }) =>
    request<{ invite: ProjectInvite; link: string; newAccounts: boolean }>('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/invites`, input),
  revokeProjectInvite: (projectId: string, id: string) =>
    request<void>('DELETE', `/api/v1/projects/${encodeURIComponent(projectId)}/invites/${encodeURIComponent(id)}`),
  previewProjectInvite: (token: string) => request<ProjectInvitePreview>('GET', `/api/v1/project-invites/${encodeURIComponent(token)}`),
  acceptProjectInvite: (token: string) =>
    request<{ projectId: string; role: ProjectRole }>('POST', `/api/v1/project-invites/${encodeURIComponent(token)}/accept`, {}),
  getProjectInviteSettings: () => request<{ membersCanInviteNewPeople: boolean }>('GET', '/api/v1/settings/project-invites'),
  putProjectInviteSettings: (membersCanInviteNewPeople: boolean) =>
    request<{ membersCanInviteNewPeople: boolean }>('PUT', '/api/v1/settings/project-invites', { membersCanInviteNewPeople }),

  // User administration (OpenSpec `user-management`): owner and admins. Every
  // mutating route is a sensitive one (reauth_required is answered by the
  // ReauthDialog). Results stay in component state, never in IndexedDB.
  listUsers: () => request<{ users: AdminUser[] }>('GET', '/api/v1/users'),
  setUserRole: (id: string, role: Exclude<AccountRole, 'owner'>) =>
    request<{ user: AdminUser }>('PUT', `/api/v1/users/${encodeURIComponent(id)}/role`, { role }),
  deactivateUser: (id: string) => request<{ user: AdminUser }>('POST', `/api/v1/users/${encodeURIComponent(id)}/deactivate`, {}),
  reactivateUser: (id: string) => request<{ user: AdminUser }>('POST', `/api/v1/users/${encodeURIComponent(id)}/reactivate`, {}),
  /** Permanent. `confirmEmail` must be the account's email. */
  deleteUser: (id: string, confirmEmail: string) =>
    request<void>('DELETE', `/api/v1/users/${encodeURIComponent(id)}`, { confirmEmail }),
  /** The link is returned once; nothing is emailed. */
  issuePasswordReset: (id: string, expiresInHours?: number) =>
    request<{ expiresAt: number; link: string }>('POST', `/api/v1/users/${encodeURIComponent(id)}/password-reset`,
      expiresInHours === undefined ? {} : { expiresInHours }),
  transferOwnership: (id: string, password: string) =>
    request<{ user: AdminUser }>('POST', `/api/v1/users/${encodeURIComponent(id)}/transfer-ownership`, { password }),
  /** Every signed-in user: signs out the other sessions, keeps this one. */
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('POST', '/api/v1/me/password', { currentPassword, newPassword }),
  // Reset links: public, no session needed.
  previewPasswordReset: (token: string) => request<ResetPreview>('GET', `/api/v1/password-resets/${encodeURIComponent(token)}`),
  resetPassword: (token: string, password: string) =>
    request<void>('POST', `/api/v1/password-resets/${encodeURIComponent(token)}`, { password }),

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
  // In-app assistant (OpenSpec `in-app-assistant`): owner settings (keys go in,
  // only presence flags come back), the user's consent and own key, usage.
  getAssistantSettings: () => request<AssistantOwnerSettings | AssistantMemberSettings>('GET', '/api/v1/settings/assistant'),
  saveAssistantSettings: (input: AssistantSettingsInput) => request<AssistantOwnerSettings>('PUT', '/api/v1/settings/assistant', input),
  testAssistant: (provider: string) => request<AssistantTestResult>('POST', '/api/v1/settings/assistant/test', { provider }),
  getMyAssistant: () => request<AssistantStatus>('GET', '/api/v1/me/assistant'),
  setMyAssistant: (input: MyAssistantInput) => request<AssistantStatus>('PUT', '/api/v1/me/assistant', input),
  /** Your own provider's "Test connection" (assistant-member-provider; sessions only, rate limited). */
  testMyAssistant: () => request<AssistantTestResult>('POST', '/api/v1/me/assistant/test'),
  assistantUsage: () => request<AssistantUsage>('GET', '/api/v1/me/assistant/usage'),
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

/**
 * Where the browser goes to sign in with the provider. With a session the same
 * route links the provider to the signed-in account instead.
 */
export const OIDC_START_URL = '/api/v1/auth/oidc/start'

/** True for failures that mean "no server reachable" rather than a server answer. */
export function isNetworkError(err: unknown): boolean {
  return !(err instanceof ApiError)
}
