import type { AuditEvent, AuditFilters, AuditSettings, AuthStatus, Invitation, InvitationPreview, Op, User } from './types'

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

  // Invitations (owner only, except the public preview). The link is returned once at creation.
  listInvitations: () => request<{ invitations: Invitation[] }>('GET', '/api/v1/invitations'),
  createInvitation: (input: { email?: string; expiresInHours?: number } = {}) =>
    request<{ invitation: Invitation; link: string }>('POST', '/api/v1/invitations', input),
  revokeInvitation: (id: string) => request<void>('DELETE', `/api/v1/invitations/${id}`),
  previewInvitation: (token: string) => request<InvitationPreview>('GET', `/api/v1/invitations/${encodeURIComponent(token)}`),

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
