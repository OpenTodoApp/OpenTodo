import type { AuthStatus, ImportJob, ImportOptions, ImportPreview, Invitation, InvitationPreview, Op, User } from './types'

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

  // Import runs on the server (docs/import.md): preview is a dry run, start returns a running job.
  previewImport: (file: Blob, filename: string, options: ImportOptions) =>
    upload<ImportPreview>('/api/v1/import/preview', file, filename, options),
  startImport: (file: Blob, filename: string, options: ImportOptions) =>
    upload<{ job: ImportJob }>('/api/v1/import', file, filename, options),
  listImportJobs: () => request<{ jobs: ImportJob[] }>('GET', '/api/v1/import/jobs'),
  getImportJob: (id: string) => request<{ job: ImportJob }>('GET', `/api/v1/import/jobs/${encodeURIComponent(id)}`),
  undoImport: (id: string) => request<{ job: ImportJob }>('POST', `/api/v1/import/jobs/${encodeURIComponent(id)}/undo`),
}

/** True for failures that mean "no server reachable" rather than a server answer. */
export function isNetworkError(err: unknown): boolean {
  return !(err instanceof ApiError)
}
