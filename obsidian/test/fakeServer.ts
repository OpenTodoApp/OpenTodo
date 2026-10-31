// A small stand-in for an OpenTodo server behind requestUrl: the routes the
// plugin calls, with ops applied once by id, refusals for viewers' projects and
// a switch to go offline. The real server is exercised by e2e.test.ts.
import type { RequestUrlParam, RequestUrlResponse } from 'obsidian'
import { json } from './obsidian'

export interface FakeOptions {
  version?: string
  scope?: string
  encrypted?: boolean
  record?: unknown
}

export class FakeServer {
  offline = false
  /** Drop the answer after applying (an interrupted push). */
  dropNextAnswer = false
  version: string
  scope: string
  encrypted: boolean
  record: unknown
  token = 'secret-full'
  projects: Record<string, unknown>[] = []
  labels: Record<string, unknown>[] = []
  /** Projects in which ops are refused (the caller became a viewer). */
  viewerOf = new Set<string>()
  ops = new Map<string, { entity: string; entityId: string; field: string; value: unknown; ts: number; device: string }>()
  pushes: { device: string; features: string[]; ops: number }[] = []

  constructor(o: FakeOptions = {}) {
    this.version = o.version ?? '0.20.0'
    this.scope = o.scope ?? 'full'
    this.encrypted = o.encrypted ?? false
    this.record = o.record ?? null
  }

  /** A row of an entity from the applied ops (last writer wins). */
  row(entity: string, id: string): Record<string, unknown> | null {
    const out: Record<string, unknown> = {}
    const clock: Record<string, number> = {}
    let any = false
    for (const op of this.ops.values()) {
      if (op.entity !== entity || op.entityId !== id) continue
      any = true
      if (op.ts >= (clock[op.field] ?? -1)) {
        clock[op.field] = op.ts
        out[op.field] = op.value
      }
    }
    return any ? out : null
  }

  /** Seeds an entity as another device wrote it. */
  put(entity: string, id: string, fields: Record<string, unknown>, ts = Date.now()): void {
    for (const [field, value] of Object.entries(fields)) {
      const opId = `seed-${entity}-${id}-${field}-${ts}`
      this.ops.set(opId, { entity, entityId: id, field, value, ts, device: 'web:seed', id: opId } as never)
    }
  }

  tasks(): Record<string, unknown>[] {
    const ids = new Set([...this.ops.values()].filter((o) => o.entity === 'task').map((o) => o.entityId))
    return [...ids].map((id) => ({ id, ...this.row('task', id) }))
  }

  handle = async (req: RequestUrlParam): Promise<RequestUrlResponse> => {
    if (this.offline) throw new Error('net::ERR_INTERNET_DISCONNECTED')
    const u = new URL(req.url)
    const method = req.method ?? 'GET'
    if (u.pathname === '/healthz') return json(200, { status: 'ok', version: this.version })
    if (req.headers?.Authorization !== `Bearer ${this.token}`) return json(401, { error: { code: 'unauthorized', message: 'not signed in' } })
    const route = `${method} ${u.pathname}`
    if (route === 'GET /api/v1/me') {
      return json(200, { user: { id: 'u1', name: 'Ada', email: 'ada@example.com' }, encryption: { enabled: this.encrypted, keyVersion: 1 }, auth: { method: 'token', scope: this.scope, token_name: 'Laptop' }, day_parts: false, energy_levels: false })
    }
    if (route === 'GET /api/v1/projects') return json(200, { projects: this.projects })
    if (route === 'GET /api/v1/labels') return json(200, { labels: this.labels })
    if (route === 'GET /api/v1/encryption/keys') return this.record ? json(200, { keys: this.record }) : json(404, { error: { code: 'encryption_disabled', message: 'off' } })
    if (method === 'GET' && u.pathname.startsWith('/api/v1/tasks/')) {
      const id = decodeURIComponent(u.pathname.slice('/api/v1/tasks/'.length))
      const row = this.row('task', id)
      return row ? json(200, { id, ...row }) : json(404, { error: { code: 'not_found', message: 'no task' } })
    }
    if (route === 'POST /api/v1/sync') {
      if (this.scope === 'read') return json(403, { error: { code: 'insufficient_scope', message: 'read token' } })
      const body = JSON.parse(String(req.body)) as { device: string; cursor: number; features: string[]; ops: { id: string; entity: string; entityId: string; field: string; value: unknown; ts: number; device: string }[] }
      this.pushes.push({ device: body.device, features: body.features, ops: body.ops.length })
      // A full exchange (the vault sync) gets the log from its cursor; a push-only one nothing.
      const pulled = body.features.includes('push_only') ? [] : [...this.ops.values()].slice(body.cursor)
      let applied = 0
      let duplicates = 0
      const rejected: { id: string; reason: string }[] = []
      const refusedTasks = new Set(body.ops.filter((o) => o.entity === 'task' && o.field === 'project_id' && this.viewerOf.has(String(o.value))).map((o) => o.entityId))
      for (const op of body.ops) {
        if (op.entity === 'task' && refusedTasks.has(op.entityId)) {
          rejected.push({ id: op.id, reason: 'forbidden' })
          continue
        }
        if (this.ops.has(op.id)) duplicates++
        else {
          this.ops.set(op.id, op)
          applied++
        }
      }
      if (this.dropNextAnswer) {
        this.dropNextAnswer = false
        throw new Error('net::ERR_CONNECTION_RESET')
      }
      return json(200, { applied, duplicates, rejected, ops: pulled, cursor: this.ops.size, hasMore: false, serverTime: Date.now(), generation: 'g1', memberships: [] })
    }
    return json(404, { error: { code: 'not_found', message: route } })
  }
}
