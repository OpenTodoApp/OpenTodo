// The vault's exchange (obsidian-vault-sync task 3.3) against a scripted
// transport: the request the plugin's client sends, cursor paging until hasMore
// is false, ops refused for clock skew re-sent with their ids, and the server's
// clock adopted as in internal/vault/exchange.go.
import { describe, expect, it } from 'vitest'
import type { RequestUrlParam } from 'obsidian'
import { Client } from '../api'
import { clientTransport } from '../vaultSync'
import { sync } from './engine'
import { MemoryFiles } from './memory'
import { newState } from './state'
import type { Op } from './store'
import type { Reply, Request } from './types'

const NOW = Date.UTC(2026, 10, 2, 9)
const op = (n: number, entityId: string, field: string, value: unknown): Op => ({ id: `s${n}`, entity: 'task', entityId, field, value, ts: n, device: 'app' })

describe('the vault exchange', () => {
  it('the client sends the full exchange to /api/v1/sync with the token', async () => {
    const seen: RequestUrlParam[] = []
    const c = new Client('https://todo.example.com', 'tok', async (r) => {
      seen.push(r)
      return { status: 200, text: JSON.stringify({ ops: [], cursor: 7, hasMore: false }), json: null, headers: {}, arrayBuffer: new ArrayBuffer(0) } as never
    })
    const rep = await clientTransport(c).exchange({ device: 'vault:abc', cursor: 3, ops: [], features: ['clock_skew', 'backfill_ack'] })
    expect(rep.cursor).toBe(7)
    expect(seen[0]).toMatchObject({ url: 'https://todo.example.com/api/v1/sync', method: 'POST', headers: { Authorization: 'Bearer tok' } })
    expect(JSON.parse(String(seen[0].body))).toEqual({ device: 'vault:abc', cursor: 3, ops: [], features: ['clock_skew', 'backfill_ack'] })
  })

  it('pulls page by page, re-sends ops refused for clock skew and follows the server clock', async () => {
    const reqs: Request[] = []
    const pages: Reply[] = [
      { ops: [op(1, 't1', 'title', 'Water'), op(2, 't1', 'project_id', null)], cursor: 2, hasMore: true, serverTime: NOW + 10_000 },
      { ops: [op(3, 't2', 'title', 'Rent'), op(4, 't2', 'project_id', null)], cursor: 4, hasMore: false, serverTime: NOW + 10_000 },
    ]
    let skewed = false
    const transport = {
      async exchange(req: Request): Promise<Reply> {
        reqs.push(JSON.parse(JSON.stringify(req)))
        if (req.ops.length === 0) return pages.shift() ?? { ops: [], cursor: req.cursor, hasMore: false, serverTime: NOW + 10_000 }
        if (!skewed) {
          skewed = true
          return { ops: [], cursor: req.cursor, rejected: req.ops.map((o) => ({ id: o.id, reason: 'clock_skew' })), serverTime: NOW + 10_000 }
        }
        return { ops: [], cursor: req.cursor + req.ops.length, serverTime: NOW + 10_000 }
      },
    }
    const files = new MemoryFiles()
    const state = newState('default', 'https://todo.example.com', 'vault:paged')
    await sync({ files, transport, userID: 'u1', zone: 'UTC', now: () => NOW, state })
    expect(reqs.map((r) => r.cursor)).toEqual([0, 2])
    expect(reqs.every((r) => r.device === 'vault:paged' && r.features?.join() === 'clock_skew,backfill_ack')).toBe(true)
    expect(files.files.get('Inbox.md')).toBe('- [ ] Water 🆔 t1\n- [ ] Rent 🆔 t2\n')
    // The server is 10 s ahead: the vault adopts the offset.
    expect(state.offset).toBe(10_000)
    files.files.set('Inbox.md', '- [x] Water ✅ 2026-11-02 🆔 t1\n- [ ] Rent 🆔 t2\n')
    reqs.length = 0
    await sync({ files, transport, userID: 'u1', zone: 'UTC', now: () => NOW })
    const pushes = reqs.filter((r) => r.ops.length > 0)
    expect(pushes).toHaveLength(2)
    expect(pushes[1].ops.map((o) => o.id)).toEqual(pushes[0].ops.map((o) => o.id))
    expect(pushes[1].ops[0].ts).toBeGreaterThan(pushes[0].ops[0].ts)
  })
})
