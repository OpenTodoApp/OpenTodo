import { describe, expect, it } from 'vitest'
import { Client, type Request } from './api'
import { Outbox } from './outbox'
import { memoryStorage } from './storage'

const op = (id: string, ts = 1) => ({ id, entity: 'task', entityId: 't-' + id, field: 'title', value: id, ts, device: 'obsidian:x' })

function client(answers: ((ops: { id: string; ts: number }[]) => unknown)[]) {
  const seen: { id: string; ts: number }[][] = []
  const request: Request = async (req) => {
    const ops = JSON.parse(String(req.body)).ops
    seen.push(ops)
    const body = answers.shift()!(ops)
    return { status: 200, text: JSON.stringify(body), json: body, headers: {}, arrayBuffer: new ArrayBuffer(0) }
  }
  return { c: new Client('https://t.example', 'tok', request), seen }
}

describe('outbox', () => {
  it('stamps ops refused as too far ahead again and sends them in the same push', async () => {
    const box = new Outbox(memoryStorage())
    box.add([{ id: 'e1', taskId: 't-a', title: 'a', note: 'n.md', project: null, ops: [op('a', 9e15)] }])
    const now = Date.now()
    const { c, seen } = client([
      () => ({ applied: 0, duplicates: 0, rejected: [{ id: 'a', reason: 'clock_skew' }], cursor: 1, serverTime: now }),
      () => ({ applied: 1, duplicates: 0, rejected: [], cursor: 2, serverTime: now }),
    ])
    const res = await box.push(c, 'obsidian:x')
    expect(res.kind).toBe('pushed')
    expect(seen.length).toBe(2)
    expect(seen[1][0].id).toBe('a')
    expect(seen[1][0].ts).toBeLessThan(now + 5 * 60_000)
    expect(box.waiting).toBe(0)
  })

  it('splits a long queue into batches of whole entries', async () => {
    const box = new Outbox(memoryStorage())
    box.add(Array.from({ length: 3 }, (_, i) => ({ id: `e${i}`, taskId: `t${i}`, title: '', note: '', project: null, ops: Array.from({ length: 200 }, (_, j) => op(`${i}-${j}`)) })))
    const ok = () => ({ applied: 1, duplicates: 0, rejected: [], cursor: 1, serverTime: Date.now() })
    const { c, seen } = client([ok, ok, ok])
    await box.push(c, 'obsidian:x')
    expect(seen.map((s) => s.length)).toEqual([400, 200])
  })
})
