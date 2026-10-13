import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, createTask, getDeviceId, mutate, resetDeviceId } from './ops'
import {
  applyChanges, describe as describeChange, dueWords, refreshReview, reviewChangeSet, sameValue, SSEParser, takeSentences,
  turnMessages, undoChanges, UNDO_KEEP, usageLine,
} from './assistant'
import type { ProposedChange } from './assistantTypes'

let n = 0
beforeEach(() => {
  useDatabase(`assistant-${Date.now()}-${n++}`)
  resetDeviceId()
})

const due = (date: string) => ({ date })

async function task(title: string, extra: Record<string, unknown> = {}) {
  const id = await createTask({ title, due: due('2026-10-14') })
  if (Object.keys(extra).length) await mutate('task', id, extra)
  return id
}

function reschedule(id: string, from: string, to: string): ProposedChange {
  return { entity: 'task', entityId: id, patch: { due: due(to) }, base: { due: due(from) } }
}

describe('SSEParser', () => {
  it('assembles events from arbitrary chunks', () => {
    const p = new SSEParser()
    const stream = 'event: text\ndata: {"text":"Hel"}\n\nevent: text\ndata: {"text":"lo"}\n\nevent: done\r\ndata: {"stop_reason":"end_turn"}\r\n\r\n'
    const out = []
    for (let i = 0; i < stream.length; i += 7) out.push(...p.feed(stream.slice(i, i + 7)))
    expect(out).toEqual([{ type: 'text', text: 'Hel' }, { type: 'text', text: 'lo' }, { type: 'done', stop_reason: 'end_turn' }])
  })
})

describe('takeSentences', () => {
  it('announces at sentence boundaries, never mid-sentence', () => {
    expect(takeSentences('You have three tasks')).toEqual(['', 'You have three tasks'])
    expect(takeSentences('You have three tasks. The first is')).toEqual(['You have three tasks.', 'The first is'])
    expect(takeSentences('Done! Next? Maybe… ok')).toEqual(['Done! Next? Maybe…', 'ok'])
    expect(takeSentences('A list:\n- one')).toEqual(['A list:', '- one'])
    expect(takeSentences('Version 1.5 is')).toEqual(['', 'Version 1.5 is'])
  })
})

describe('turnMessages', () => {
  it('keeps the last 40 messages and summarises the rest in one line', () => {
    const history = Array.from({ length: 60 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', text: `m${i}`, at: i }))
    const msgs = turnMessages(history, 'now?')
    expect(msgs.length).toBeLessThanOrEqual(40)
    expect(msgs[0].role).toBe('user')
    expect(msgs[0].text).toMatch(/earlier messages were left out/)
    expect(msgs.at(-1)).toEqual({ role: 'user', text: 'now?' })
  })
  it('leaves out refused and failed answers', () => {
    const msgs = turnMessages([{ role: 'user', text: 'a', at: 1 }, { role: 'assistant', text: 'x', stop: 'refusal', at: 2 }], 'b')
    expect(msgs.map((m) => m.text)).toEqual(['a', 'b'])
  })
})

describe('words', () => {
  it('formats due dates and usage', () => {
    expect(dueWords({ date: '2026-10-16' })).toBe('Fri 16 Oct')
    expect(dueWords({ date: '2026-10-16', time: '09:00' })).toBe('Fri 16 Oct 09:00')
    expect(dueWords(null)).toBe('none')
    expect(usageLine({ input: 1000, output: 240, month_total: 90_000, cap: 500_000 })).toBe('1,240 tokens · this month 18% of your limit')
    expect(usageLine({ input: 1000, output: 240, month_total: 0, cap: 0, own_key: true })).toBe('1,240 tokens · your key')
    expect(usageLine({ input: 1, output: 1 })).toBe('2 tokens')
  })
  it('describes each change in words', () => {
    const names = { projects: new Map([['g', 'Garden']]), labels: new Map([['l1', 'errand']]), sections: new Map(), tasks: new Map() }
    const d = describeChange({ entity: 'task', entityId: 't', patch: { due: due('2026-10-16'), completed_at: 5, priority: 1, project_id: 'g', labels: ['l1'] }, base: { due: due('2026-10-14'), priority: 4, project_id: null, labels: [] } },
      { title: 'Water plants' }, names)
    expect(d.title).toBe('Water plants')
    expect(d.lines).toEqual(['Due Wed 14 Oct → Fri 16 Oct', 'Completed', 'Priority P4 → P1', 'Moved from Inbox to Garden', 'Labels: +errand'])
    expect(describeChange({ entity: 'task', entityId: 'n', create: true, patch: { title: 'Buy seeds', project_id: 'g' } }, undefined, names).title).toBe('New task in Garden: Buy seeds')
  })
  it('compares values regardless of key order', () => {
    expect(sameValue({ date: 'x', time: 'y' }, { time: 'y', date: 'x' })).toBe(true)
    expect(sameValue(undefined, null)).toBe(true)
    expect(sameValue({ date: 'x' }, { date: 'z' })).toBe(false)
  })
})

describe('review', () => {
  it('unchecks and marks an item changed since proposed, drops a missing one', async () => {
    const a = await task('Water plants')
    const b = await task('Call Ann')
    const r = await reviewChangeSet([reschedule(a, '2026-10-14', '2026-10-16'), reschedule(b, '2026-10-14', '2026-10-16'), reschedule('gone', '2026-10-14', '2026-10-16')])
    expect(r.items.map((i) => [i.state, i.checked])).toEqual([['ok', true], ['ok', true]])
    expect(r.dropped).toHaveLength(1)
    // Another device changes b's due date after the proposal arrived.
    await applyOps([{ id: crypto.randomUUID(), entity: 'task', entityId: b, field: 'due', value: due('2026-10-20'), ts: Date.now() + 10_000, device: 'phone' }])
    const fresh = await refreshReview(r)
    const stale = fresh.items.find((i) => i.change.entityId === b)!
    expect(stale.state).toBe('stale')
    expect(stale.checked).toBe(false)
    // Applying the checked part leaves the newer value in place.
    await applyChanges(fresh.items.filter((i) => i.checked).map((i) => i.change))
    expect((await db.tasks.get(b))!.due).toEqual(due('2026-10-20'))
    expect((await db.tasks.get(a))!.due).toEqual(due('2026-10-16'))
  })
})

describe('apply', () => {
  it('applies one batch with device assistant:<device-id>, queued in the outbox (works offline)', async () => {
    const ids = [await task('A'), await task('B'), await task('C')]
    await db.outbox.clear()
    // Offline: any network use fails the test. Applying is local only.
    const offline = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
    try {
      const undo = await applyChanges(ids.map((id) => reschedule(id, '2026-10-14', '2026-10-16')))
      expect(undo?.count).toBe(3)
      const queued = await db.outbox.toArray()
      const device = await getDeviceId()
      expect(queued).toHaveLength(3)
      expect(new Set(queued.map((o) => o.device))).toEqual(new Set([`assistant:${device}`]))
      expect(new Set(queued.map((o) => o.ts)).size).toBe(1)
      for (const id of ids) expect((await db.tasks.get(id))!.due).toEqual(due('2026-10-16'))
      expect(offline).not.toHaveBeenCalled()
    } finally {
      offline.mockRestore()
    }
  })

  it('creates entities from their full patch and undoes them into the Trash', async () => {
    const id = crypto.randomUUID()
    const undo = await applyChanges([{ entity: 'task', entityId: id, create: true, patch: { title: 'Buy seeds', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 1, created_at: Date.now(), completed_at: null, deleted_at: null } }])
    expect((await db.tasks.get(id))!.title).toBe('Buy seeds')
    const res = await undoChanges(undo!.id)
    expect(res.restored).toBe(1)
    expect((await db.tasks.get(id))!.deleted_at).toBeTruthy()
  })
})

describe('undo', () => {
  it('restores the previous values in one batch', async () => {
    const ids: string[] = []
    for (let i = 0; i < 12; i++) ids.push(await task(`T${i}`))
    const undo = await applyChanges(ids.map((id) => reschedule(id, '2026-10-14', '2026-10-16')))
    await db.outbox.clear()
    const res = await undoChanges(undo!.id)
    expect(res).toEqual({ restored: 12, skipped: [] })
    for (const id of ids) expect((await db.tasks.get(id))!.due).toEqual(due('2026-10-14'))
    const queued = await db.outbox.toArray()
    expect(queued).toHaveLength(12)
    expect(new Set(queued.map((o) => o.ts)).size).toBe(1)
    // Once undone, a second undo does nothing.
    expect(await undoChanges(undo!.id)).toEqual({ restored: 0, skipped: [] })
  })

  it('skips a field edited by hand after the assistant and names it', async () => {
    const a = await task('Water plants')
    const b = await task('Call Ann')
    const undo = await applyChanges([reschedule(a, '2026-10-14', '2026-10-16'), reschedule(b, '2026-10-14', '2026-10-16')])
    await mutate('task', b, { due: due('2026-10-30') })
    const res = await undoChanges(undo!.id)
    expect(res.restored).toBe(1)
    expect(res.skipped).toEqual(['Call Ann'])
    expect((await db.tasks.get(b))!.due).toEqual(due('2026-10-30'))
    expect((await db.tasks.get(a))!.due).toEqual(due('2026-10-14'))
  })

  it('keeps the last 20 change sets undoable', async () => {
    const a = await task('A')
    for (let i = 0; i < UNDO_KEEP + 3; i++) await applyChanges([{ entity: 'task', entityId: a, patch: { priority: (i % 3) + 1 }, base: {} }])
    expect(await db.assistantUndo.count()).toBe(UNDO_KEEP)
  })
})
