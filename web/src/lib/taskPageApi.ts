// The guest side of a task page (OpenSpec task-pages): no cookies are sent, even
// from a browser that holds a session, so the answer is the same for everyone. Kept
// apart from api.ts so the page's bundle stays small.
import type { TaskPageResponse } from './types'

/** A failed request: the server's error code, or "network" when it could not be reached. */
export class PageError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { ...init, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' })
  } catch {
    throw new PageError(0, 'network')
  }
  const data = (await res.json().catch(() => ({}))) as { error?: { code?: string } }
  if (!res.ok) throw new PageError(res.status, data.error?.code ?? 'error')
  return data as T
}

const base = (secret: string) => `/api/v1/pages/${encodeURIComponent(secret)}`
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const pageApi = {
  get: (secret: string) => call<TaskPageResponse>(base(secret)),
  reply: (secret: string, body: { name: string; body: string } | { ciphertext: string }) =>
    call<{ id: string; pending?: boolean }>(`${base(secret)}/replies`, json(body)),
  tick: (secret: string, taskId: string, completed: boolean, name: string) =>
    call<{ taskId: string; completed_at: number | null }>(`${base(secret)}/tick`, json({ taskId, completed, name })),
  fileUrl: (secret: string, id: string) => `${base(secret)}/files/${encodeURIComponent(id)}`,
  mapStyleUrl: (secret: string) => `${base(secret)}/maps/style`,
}

/** The secret in /t/<secret>[/<label>], or "" when the address has none. */
export function secretFromPath(path: string): string {
  const m = /^\/t\/([A-Za-z0-9_-]{22})(?:\/|$)/.exec(path)
  return m ? m[1] : ''
}
