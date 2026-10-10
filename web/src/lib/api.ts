import type { AssertionJSON, CreationOptionsJSON, RegistrationJSON, RequestOptionsJSON } from './passkeys'
import type {
  AuthStatus, Invitation, InvitationPreview, Op, Passkey, User, Webhook, WebhookDelivery, WebhookEvent, WebhookInput,
} from './types'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
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
  login: (email: string, password: string) => request<{ user: User }>('POST', '/api/v1/auth/login', { email, password }),
  logout: () => request<void>('POST', '/api/v1/auth/logout'),
  sync: (device: string, cursor: number, ops: Op[]) =>
    request<{ applied: number; ops: Op[]; cursor: number; hasMore: boolean; serverTime: number }>(
      'POST', '/api/v1/sync', { device, cursor, ops },
    ),
  listTokens: () => request<{ tokens: { id: string; name: string; createdAt: number; lastUsedAt: number | null }[] }>('GET', '/api/v1/tokens'),
  createToken: (name: string) => request<{ token: { id: string; name: string }; secret: string }>('POST', '/api/v1/tokens', { name }),
  deleteToken: (id: string) => request<void>('DELETE', `/api/v1/tokens/${id}`),
  // Passkeys (OpenSpec change `passkeys`). Binary fields are base64url strings.
  passkeyLoginOptions: () => request<{ publicKey: RequestOptionsJSON }>('POST', '/api/v1/auth/passkey/options', {}),
  passkeyLogin: (credential: AssertionJSON) => request<{ user: User }>('POST', '/api/v1/auth/passkey', { credential }),
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

/** True for failures that mean "no server reachable" rather than a server answer. */
export function isNetworkError(err: unknown): boolean {
  return !(err instanceof ApiError)
}
