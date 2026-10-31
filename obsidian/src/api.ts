// The plugin's only network code: requests to the one server the user
// configured, through Obsidian's requestUrl (no CORS on desktop or mobile, no
// other destination; obsidian-plugin D13). Every call names its route.
import type { RequestUrlParam, RequestUrlResponse } from 'obsidian'
import type { KeyRecord } from '../../web/src/lib/crypto'
import type { Op } from './ops'
import type { Reply as VaultReply, Request as VaultRequest } from './vault/types'

export type Request = (req: RequestUrlParam) => Promise<RequestUrlResponse>

/** The server answered with an error envelope. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

/** The server could not be reached (offline, DNS, TLS, timeout). */
export class NetworkError extends Error {}

export interface Me {
  user: { id: string; name?: string; email?: string }
  encryption?: { enabled: boolean; keyVersion?: number }
  auth?: { method: string; scope: string; token_id?: string; token_name?: string }
  day_parts?: boolean
  energy_levels?: boolean
}

export interface ProjectRow {
  id: string
  name: string
  archived?: boolean
  deleted_at?: number | null
  parent_id?: string | null
  position?: number
  /** Set on shared projects: the caller's role (viewer, editor, admin, owner). */
  role?: string
  owner_id?: string
}

export interface LabelRow {
  id: string
  name: string
  position?: number
  created_at?: number
  deleted_at?: number | null
}

export interface Rejection {
  id: string
  reason: string
  message?: string
}

export interface SyncAnswer {
  applied: number
  duplicates: number
  rejected?: Rejection[]
  cursor: number
  serverTime?: number
  ops?: unknown[]
}

export class Client {
  constructor(private base: string, private token: string, private request: Request) {}

  private async call<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (auth) headers.Authorization = `Bearer ${this.token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    let res: RequestUrlResponse
    try {
      res = await this.request({ url: this.base + path, method, headers, body: body === undefined ? undefined : JSON.stringify(body), throw: false })
    } catch (err) {
      throw new NetworkError(err instanceof Error ? err.message : String(err))
    }
    let data: unknown = null
    try {
      data = res.text ? JSON.parse(res.text) : null
    } catch {
      data = null
    }
    if (res.status >= 400) {
      const e = (data as { error?: { code?: string; message?: string } } | null)?.error
      throw new ApiError(res.status, e?.code ?? `http_${res.status}`, e?.message ?? `HTTP ${res.status}`)
    }
    if (data === null || typeof data !== 'object') throw new ApiError(res.status, 'invalid_response', 'the server did not answer with JSON')
    return data as T
  }

  health(): Promise<{ status: string; version?: string }> {
    return this.call('GET', '/healthz', undefined, false)
  }

  me(): Promise<Me> {
    return this.call('GET', '/api/v1/me')
  }

  async projects(): Promise<ProjectRow[]> {
    return (await this.call<{ projects: ProjectRow[] }>('GET', '/api/v1/projects')).projects ?? []
  }

  async labels(): Promise<LabelRow[]> {
    return (await this.call<{ labels: LabelRow[] }>('GET', '/api/v1/labels')).labels ?? []
  }

  async task(id: string): Promise<{ id: string; project_id?: string | null; deleted_at?: number | null }> {
    return this.call('GET', `/api/v1/tasks/${encodeURIComponent(id)}`)
  }

  async keyRecord(): Promise<KeyRecord> {
    return (await this.call<{ keys: KeyRecord }>('GET', '/api/v1/encryption/keys')).keys
  }

  /** One full exchange of the vault sync (obsidian-vault-sync task 3.3): ops out, the log from the cursor back. */
  exchange(req: VaultRequest): Promise<VaultReply> {
    return this.call('POST', '/api/v1/sync', req)
  }

  /** A push-only exchange (D4): the server applies the ops and pulls nothing. */
  sync(device: string, ops: Op[]): Promise<SyncAnswer> {
    return this.call('POST', '/api/v1/sync', { device, cursor: 0, ops, features: ['push_only', 'clock_skew'] })
  }
}
