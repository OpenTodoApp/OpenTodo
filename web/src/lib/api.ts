import { errorMessage } from './i18n/errors'
import { t } from './i18n/catalog'
import { fetchWithTimeout, NetworkError, RequestTimeoutError, timeouts } from './http'
import type { AssistantSkill } from './assistantSkills'
import type { AgentAccess, ApiToken, McpStatus, TokenScope } from './assistants'
import type { AssistantStatus } from './assistantStatus'
import type { AssistantOwnerSettings, AssistantMemberSettings, AssistantSettingsInput, AssistantTestDraft, AssistantTestResult, MyAssistantTestDraft, AssistantUsage, MyAssistantInput } from './assistantTypes'
import type { KeyRecord } from './crypto'
import type { RelayDevice } from './relay'
import type { AssertionJSON, CreationOptionsJSON, RegistrationJSON, RequestOptionsJSON } from './passkeys'
import type {
  ConfigWarning,
  AppPassword, CaldavSetting, EmailDigest, EmailDigestInput, EmailInbox,
  AccountRole, ActivityPage, AttachmentLimits, AttachmentSettings, CalendarEvent, CalendarFeed, CalendarSubscription, AdminUser, AppNotification, AuditEvent, AuditFilters, AuditSettings, AuthStatus, LinkedIdentity, OidcSettings, OidcSettingsInput, OidcStatus, OidcTestResult, BackupSecretFlags, BackupSecretUpdate, BackupSettings, BackupStatus, RestoreArchive, RestoreSource, RestoreState, StagedRestore, ImportJob, ImportOptions, ImportPreview, Invitation, InvitationPreview, LoginResult, HistoryPage, PendingSignup, SmtpSettings, SmtpSettingsInput, SmtpTestResult, Membership, MfaPolicy, ProjectInvite, ProjectInvitePreview, MfaStatus, Op, Passkey, ProjectRole, PurgeCounts, PushSubscriptionStatus, PushTestResponse, ResetPreview, SyncResponse, TrustedDevice, User, PublicLink, PublicList,
  Webhook, WebhookDelivery, WebhookEvent, WebhookInput, IssueActionResult, IssueConnection, IssueConnectionInput,
} from './types'

export { fetchWithTimeout, isTransientNetworkError, NetworkError, RequestTimeoutError, setRequestTimeouts, transferTimeoutMs } from './http'

export class ApiError extends Error {
  /** The server's own message (English, a machine contract). */
  readonly serverMessage: string
  /** `message` is translated by code when the client knows it (app-localization D6). */
  /** The input field a 400 invalid_input names, when the server says (issue-connections). */
  readonly field?: string
  constructor(public status: number, public code: string, message: string, field?: string) {
    super(errorMessage(code, message))
    this.serverMessage = message
    this.field = field
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

/** One address the map proxy found (task-locations "Setting a location"). */
export interface MapResult {
  name: string
  address: string
  lat: number
  lon: number
}

/** The owner's map switch and providers; `locked` names fields set by an OPENTODO_MAPS* variable. */
export interface MapsSetting {
  enabled: boolean
  tiles_url: string
  geocoder_url: string
  locked: string[]
  defaults: { tiles_url: string; geocoder_url: string }
}
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

/** Per-call options: the caller's abort signal (sign-out stops a sync exchange). */
interface RequestOptions { signal?: AbortSignal }

/** Sync protocol additions this client supports (POST /api/v1/sync `features`). */
export const SYNC_FEATURES = ['clock_skew', 'backfill_ack']

async function request<T>(method: string, path: string, body?: unknown, retried = false, opts: RequestOptions = {}): Promise<T> {
  try {
    return await send<T>(method, path, body, opts)
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      if (err.code === 'reauth_required' && !retried && (await reauthenticate())) {
        return request<T>(method, path, body, true, opts)
      }
      if (err.code === 'mfa_enrolment_required') enrolmentListeners.forEach((fn) => fn())
    }
    throw err
  }
}

async function send<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const res = await fetchWithTimeout(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    signal: opts.signal,
  })
  return parse<T>(res)
}

/** Multipart upload for the import routes: the file plus the options as one JSON part. */
async function upload<T>(path: string, file: Blob, filename: string, options: ImportOptions): Promise<T> {
  const form = new FormData()
  form.append('options', JSON.stringify(options))
  form.append('file', file, filename)
  const res = await fetchWithTimeout(path, { method: 'POST', body: form, credentials: 'same-origin', timeoutMs: timeouts.transfer })
  return parse<T>(res)
}

/**
 * Streams a backup archive to the server as the raw body. XMLHttpRequest, not
 * fetch, because only it reports upload progress everywhere. A 413 comes from a
 * reverse proxy in front of OpenTodo (our own limit is a 507).
 */
function uploadArchive(file: Blob, onProgress?: (fraction: number) => void): Promise<StagedRestore> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/v1/backups/restore/uploads')
    xhr.withCredentials = true
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total) }
    xhr.timeout = timeouts.transfer
    xhr.ontimeout = () => reject(new RequestTimeoutError())
    xhr.onerror = () => reject(new NetworkError())
    xhr.onload = () => {
      let data: { error?: { code: string; message: string } } & Partial<StagedRestore> = {}
      try { data = JSON.parse(xhr.responseText || '{}') } catch { /* a proxy's HTML page */ }
      if (xhr.status === 201) return resolve(data as StagedRestore)
      if (xhr.status === 413) return reject(new ApiError(413, 'proxy_too_large', t('Your reverse proxy refused the upload. Raise its body size limit, or restore from the backup destination instead.')))
      reject(new ApiError(xhr.status, data.error?.code ?? 'error', data.error?.message ?? xhr.statusText))
    }
    xhr.send(file)
  })
}

/** The answer to an attachment upload: the status and the error code, if any. */
export interface UploadResult { status: number; code?: string; message?: string }

/**
 * Sends a file's stored bytes for an attachment row (attachments D3), with
 * XMLHttpRequest for upload progress. Resolves with the status whatever it is;
 * rejects only when the network failed.
 */
function uploadAttachmentContent(id: string, blob: Blob, onProgress?: (fraction: number) => void): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `/api/v1/attachments/${encodeURIComponent(id)}/content`)
    xhr.withCredentials = true
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total) }
    xhr.timeout = timeouts.transfer
    xhr.ontimeout = () => reject(new RequestTimeoutError())
    xhr.onerror = () => reject(new NetworkError())
    xhr.onload = () => {
      let data: { error?: { code: string; message: string } } = {}
      try { data = JSON.parse(xhr.responseText || '{}') } catch { /* a proxy's HTML page */ }
      resolve({ status: xhr.status, code: data.error?.code, message: data.error?.message })
    }
    xhr.send(blob)
  })
}

/**
 * The whole server as one backup archive (OpenSpec `multi-tenant-host`: a hosted
 * owner takes their data away). A stale session is confirmed first, as for any
 * sensitive request.
 */
async function downloadServerArchive(retried = false): Promise<{ blob: Blob; filename: string }> {
  const res = await fetchWithTimeout('/api/v1/export/archive', { credentials: 'same-origin', timeoutMs: timeouts.transfer })
  if (!res.ok) {
    try {
      await parse(res)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'reauth_required' && !retried && (await reauthenticate())) return downloadServerArchive(true)
      throw err
    }
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'opentodo-archive.tar.gz'
  return { blob: await res.blob(), filename: name }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const data = await res.json().catch((err: unknown) => {
    // The deadline passed while the body was still arriving: no answer, not an empty one.
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw new RequestTimeoutError()
    return {}
  })
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string; field?: string } }).error
    throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? res.statusText, err?.field)
  }
  return data as T
}

export const api = {
  authStatus: () => request<AuthStatus>('GET', '/api/v1/auth/status'),
  /** Hosted servers only: the owner's download of the whole server (multi-tenant-host). */
  downloadServerArchive: () => downloadServerArchive(),
  /** Demo instance (OpenSpec `demo-sandboxes`): create a private sandbox and sign into it. */
  demoSandbox: (token: string) => request<{ user: User }>('POST', '/api/v1/demo/sandbox', { token }),
  /**
   * Register an account. `invitation` is the secret from an invite link; it admits one member while sign-up is closed.
   * `projectInvite` is a project invite link secret: the new account joins that project in the same step.
   * `setupToken` is the operator's OPENTODO_SETUP_TOKEN, required for the first account when configured.
   */
  register: (email: string, name: string, password: string, invitation?: string, projectInvite?: string, setupToken?: string) =>
    request<{ user: User; projectId?: string; verificationRequired?: never } | { verificationRequired: true; user?: never; projectId?: never }>('POST', '/api/v1/auth/register', {
      email, name, password, ...(invitation ? { invitation } : {}), ...(projectInvite ? { projectInvite } : {}),
      ...(setupToken ? { setupToken } : {}),
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
  me: () => request<{ user: User; mfa: MfaStatus; config_warnings?: ConfigWarning[]; attachments?: AttachmentLimits; maps?: boolean }>('GET', '/api/v1/me'),
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
  // `features` tells the server which protocol additions this client handles
  // (sync-convergence): `clock_skew` refusals and confirmed backfill pages.
  sync: (device: string, cursor: number, ops: Op[], tzOffset?: number, backfillAck = 0, signal?: AbortSignal) =>
    request<SyncResponse>('POST', '/api/v1/sync', {
      device, cursor, ops, ...(tzOffset === undefined ? {} : { tzOffset }),
      features: SYNC_FEATURES, ...(backfillAck > 0 ? { backfillAck } : {}),
    }, false, { signal }),
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
  pushTest: (deviceId: string) => request<PushTestResponse>('POST', '/api/v1/push/test', { deviceId }),
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
  // Device relay for encrypted accounts' AI connectors (mcp-device-relay).
  relayDevices: () => request<{ devices: RelayDevice[] }>('GET', '/api/v1/relay/devices'),
  relayOptIn: (device: string, label: string) => request<void>('PUT', `/api/v1/relay/devices/${encodeURIComponent(device)}`, { label }),
  relayOptOut: (device: string, reason: 'user' | 'locked' = 'user') => request<void>('DELETE', `/api/v1/relay/devices/${encodeURIComponent(device)}?reason=${reason}`),
  relayAnswer: (id: string, box: string) => request<void>('POST', `/api/v1/relay/answers/${encodeURIComponent(id)}`, { box }),
  deleteToken: (id: string) => request<void>('DELETE', `/api/v1/tokens/${id}`),
  // CalDAV (OpenSpec change `caldav`): the owner toggle and per-user app passwords.
  // End-to-end encryption (OpenSpec `e2ee`): only wrapped key material ever goes here.
  encryptionKeys: () => request<{ keys: KeyRecord }>('GET', '/api/v1/encryption/keys'),
  putEncryptionKeys: (record: KeyRecord) => request<{ keys: KeyRecord; digestDisabled?: boolean; issueConnectionsStopped?: string[] }>('PUT', '/api/v1/encryption/keys', {
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
  // The weekly email digest (stats-and-review): server data, needs a connection.
  emailDigest: () => request<EmailDigest>('GET', '/api/v1/me/email-digest'),
  updateEmailDigest: (patch: EmailDigestInput) => request<EmailDigest>('PUT', '/api/v1/me/email-digest', patch),
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
  createInvitation: (input: { email?: string; expiresInHours?: number; send?: boolean } = {}) =>
    request<{ invitation: Invitation; link: string; sent?: boolean }>('POST', '/api/v1/invitations', input),
  revokeInvitation: (id: string) => request<void>('DELETE', `/api/v1/invitations/${id}`),
  previewInvitation: (token: string) => request<InvitationPreview>('GET', `/api/v1/invitations/${encodeURIComponent(token)}`),
  // Project invite links (OpenSpec `project-invite-links`): managed by the project's owner and admins; the link is returned once.
  listProjectInvites: (projectId: string) =>
    request<{ invites: ProjectInvite[] }>('GET', `/api/v1/projects/${encodeURIComponent(projectId)}/invites`),
  createProjectInvite: (projectId: string, input: { role: ProjectRole; email?: string; expiresInHours?: number; send?: boolean }) =>
    request<{ invite: ProjectInvite; link: string; newAccounts: boolean; sent?: boolean }>('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/invites`, input),
  revokeProjectInvite: (projectId: string, id: string) =>
    request<void>('DELETE', `/api/v1/projects/${encodeURIComponent(projectId)}/invites/${encodeURIComponent(id)}`),
  // Public links (OpenSpec `public-links`): managed by the project's owner and admins; the link is returned once.
  listPublicLinks: (projectId: string) => request<{ links: PublicLink[] }>('GET', `/api/v1/projects/${encodeURIComponent(projectId)}/public-links`),
  createPublicLink: (projectId: string, input: { rights: 'view' | 'tick'; name?: string; expiresInDays?: number }) =>
    request<PublicLink & { link: string }>('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/public-links`, input),
  revokePublicLink: (projectId: string, id: string) =>
    request<void>('DELETE', `/api/v1/projects/${encodeURIComponent(projectId)}/public-links/${encodeURIComponent(id)}`),
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
  /** Mails the reset link to the account (outgoing email); the administrator never sees it. */
  sendPasswordReset: (id: string) =>
    request<{ expiresAt: number; sent: true }>('POST', `/api/v1/users/${encodeURIComponent(id)}/password-reset`, { send: true }),
  transferOwnership: (id: string, password: string) =>
    request<{ user: AdminUser }>('POST', `/api/v1/users/${encodeURIComponent(id)}/transfer-ownership`, { password }),
  /**
   * Signs out every session (this one too), forgets remembered browsers and
   * revokes API tokens and app passwords (route-authorization-policy).
   */
  signOutEverywhere: () => request<void>('POST', '/api/v1/me/sign-out-everywhere'),
  /** Every signed-in user: signs out the other sessions, keeps this one. */
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('POST', '/api/v1/me/password', { currentPassword, newPassword }),
  // Outgoing email (OpenSpec `outgoing-email`): owner settings, the forgot-password request and verified sign-up.
  smtpSettings: () => request<SmtpSettings>('GET', '/api/v1/settings/smtp'),
  saveSmtpSettings: (input: SmtpSettingsInput) => request<SmtpSettings>('PUT', '/api/v1/settings/smtp', input),
  testSmtp: () => request<SmtpTestResult>('POST', '/api/v1/settings/smtp/test', {}),
  /** Always answers the same way, whether or not the address has an account. */
  requestPasswordReset: (email: string) => request<{ ok: true }>('POST', '/api/v1/auth/password-reset', { email }),
  verifyPreview: (token: string) => request<PendingSignup>('GET', `/api/v1/auth/verify/${encodeURIComponent(token)}`),
  verifyComplete: (token: string) => request<{ user: User }>('POST', `/api/v1/auth/verify/${encodeURIComponent(token)}`, {}),
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
  // Web restore (backup-restore-web). Confirm and safety-copy delete are fresh
  // routes: a stale session gets the re-authentication prompt, then one retry.
  backupArchives: () => request<{ destination: string; archives: RestoreArchive[] }>('GET', '/api/v1/backups/archives'),
  restoreState: () => request<RestoreState>('GET', '/api/v1/backups/restore'),
  prepareRestore: (source: RestoreSource, passphrase?: string) =>
    request<StagedRestore>('POST', '/api/v1/backups/restore/prepare', { source, ...(passphrase ? { passphrase } : {}) }),
  cancelRestore: (id: string) => request<void>('DELETE', `/api/v1/backups/restore/${encodeURIComponent(id)}`),
  confirmRestore: (id: string) => request<{ status: string }>('POST', '/api/v1/backups/restore', { id, confirm: 'RESTORE' }),
  deleteSafetyCopy: (name: string) => request<void>('DELETE', `/api/v1/backups/restore/safety-copies/${encodeURIComponent(name)}`),
  uploadRestoreArchive: (file: Blob, onProgress?: (fraction: number) => void) => uploadArchive(file, onProgress),
  // Attachments (OpenSpec attachments D4). Metadata is ops; only the bytes and the
  // owner's settings travel over these routes.
  uploadAttachment: (id: string, blob: Blob, onProgress?: (fraction: number) => void) => uploadAttachmentContent(id, blob, onProgress),
  attachmentSettings: () => request<AttachmentSettings>('GET', '/api/v1/settings/attachments'),
  // Calendar feeds (OpenSpec calendar-feeds).
  calendarFeedsSetting: () => request<{ enabled: boolean }>('GET', '/api/v1/settings/calendar-feeds'),
  setCalendarFeedsSetting: (enabled: boolean) => request<{ enabled: boolean }>('PUT', '/api/v1/settings/calendar-feeds', { enabled }),
  calendarSubscriptions: () => request<{ subscriptions: CalendarSubscription[] }>('GET', '/api/v1/calendar-feeds/subscriptions'),
  createCalendarSubscription: (body: { url: string; name?: string; color?: string }) =>
    request<{ subscription: CalendarSubscription }>('POST', '/api/v1/calendar-feeds/subscriptions', body),
  updateCalendarSubscription: (id: string, body: { url?: string; name?: string; color?: string; enabled?: boolean }) =>
    request<{ subscription: CalendarSubscription }>('PATCH', `/api/v1/calendar-feeds/subscriptions/${encodeURIComponent(id)}`, body),
  deleteCalendarSubscription: (id: string) => request<void>('DELETE', `/api/v1/calendar-feeds/subscriptions/${encodeURIComponent(id)}`),
  refreshCalendarSubscription: (id: string) =>
    request<{ subscription: CalendarSubscription }>('POST', `/api/v1/calendar-feeds/subscriptions/${encodeURIComponent(id)}/refresh`),
  calendarEvents: (from: string, to: string) =>
    request<{ events: CalendarEvent[]; subscriptions: CalendarSubscription[] }>('GET', `/api/v1/calendar-feeds/events?from=${from}&to=${to}`),
  calendarFeed: () => request<{ feed: CalendarFeed | null }>('GET', '/api/v1/calendar-feeds/feed'),
  rotateCalendarFeed: () => request<{ feed: CalendarFeed; url: string }>('POST', '/api/v1/calendar-feeds/feed'),
  revokeCalendarFeed: () => request<void>('DELETE', '/api/v1/calendar-feeds/feed'),
  // Issue import (OpenSpec issue-connections): connections are server data, never ops.
  /** Maps (task-locations): address search and reverse search through the server's map proxy. */
  mapSearch: (q: string, lang: string) =>
    request<{ results: MapResult[] }>('GET', `/api/v1/maps/search?q=${encodeURIComponent(q)}&lang=${encodeURIComponent(lang)}&limit=5`),
  mapReverse: (lat: number, lon: number, lang: string) =>
    request<{ result: MapResult | null }>('GET', `/api/v1/maps/reverse?lat=${lat}&lon=${lon}&lang=${encodeURIComponent(lang)}`),
  getMapsSetting: () => request<MapsSetting>('GET', '/api/v1/settings/maps'),
  putMapsSetting: (s: { enabled: boolean; tiles_url?: string; geocoder_url?: string }) => request<MapsSetting>('PUT', '/api/v1/settings/maps', s),
  getIssuesSetting: () => request<{ enabled: boolean }>('GET', '/api/v1/settings/issues'),
  putIssuesSetting: (enabled: boolean) => request<{ enabled: boolean }>('PUT', '/api/v1/settings/issues', { enabled }),
  listIssueConnections: () => request<{ connections: IssueConnection[] }>('GET', '/api/v1/issues/connections'),
  createIssueConnection: (body: IssueConnectionInput) => request<{ connection: IssueConnection }>('POST', '/api/v1/issues/connections', body),
  patchIssueConnection: (id: string, body: IssueConnectionInput) =>
    request<{ connection: IssueConnection }>('PATCH', `/api/v1/issues/connections/${encodeURIComponent(id)}`, body),
  deleteIssueConnection: (id: string) => request<void>('DELETE', `/api/v1/issues/connections/${encodeURIComponent(id)}`),
  testIssueConnection: (id: string) => request<IssueActionResult>('POST', `/api/v1/issues/connections/${encodeURIComponent(id)}/test`),
  syncIssueConnection: (id: string) => request<IssueActionResult>('POST', `/api/v1/issues/connections/${encodeURIComponent(id)}/sync`),
  saveAttachmentSettings: (s: AttachmentSettings) => request<AttachmentSettings>('PUT', '/api/v1/settings/attachments', s),
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
  /** Tests a provider with the on-screen values; absent fields use the saved settings (assistant-test-unsaved-settings). */
  testAssistant: (provider: string, draft: AssistantTestDraft = {}) => request<AssistantTestResult>('POST', '/api/v1/settings/assistant/test', { provider, ...draft }),
  getMyAssistant: () => request<AssistantStatus>('GET', '/api/v1/me/assistant'),
  /** Built-in assistant skills (assistant-skills); empty when the assistant is not available to you. */
  assistantSkills: () => request<{ skills: AssistantSkill[] }>('GET', '/api/v1/assistant/skills'),
  setMyAssistant: (input: MyAssistantInput) => request<AssistantStatus>('PUT', '/api/v1/me/assistant', input),
  /** Your own provider's "Test connection" (assistant-member-provider; sessions only, rate limited). */
  testMyAssistant: (draft: MyAssistantTestDraft = {}) => request<AssistantTestResult>('POST', '/api/v1/me/assistant/test', draft),
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

/**
 * The guest side of a public link (OpenSpec `public-links`, design D8): no
 * cookies are sent, even from a browser that holds a session, so the answer is
 * the same for everyone.
 */
export const publicApi = {
  list: async (token: string): Promise<PublicList> =>
    parse<PublicList>(await fetchWithTimeout(`/api/v1/public/${encodeURIComponent(token)}`, { credentials: 'omit', cache: 'no-store' })),
  tick: async (token: string, taskId: string, completed: boolean): Promise<{ taskId: string; completed_at: number | null }> =>
    parse(await fetchWithTimeout(`/api/v1/public/${encodeURIComponent(token)}/tick`, {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, completed }),
    })),
}

