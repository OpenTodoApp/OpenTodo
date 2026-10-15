import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, getDeviceId, mutate, resetDeviceId } from './ops'
import type { Op } from './types'

let n = 0
async function use(name: string) {
  useDatabase(name)
  resetDeviceId()
  await getDeviceId()
}
async function outbox(): Promise<Op[]> {
  return (await db.outbox.toArray()).map(({ local: _l, ...op }) => op as Op)
}
async function exchange(a: string, b: string) {
  await use(a)
  const fromA = await outbox()
  await use(b)
  const fromB = await outbox()
  await applyOps(fromA)
  await use(a)
  await applyOps(fromB)
}

beforeEach(async () => {
  await use(`cf-${Date.now()}-${n++}`)
})

describe('custom field definitions and values (custom-fields 2.1, 2.2)', () => {
  it('a remote field op creates a row; an offline mutate queues it', async () => {
    await applyOps([{ id: 'f1', entity: 'field', entityId: 'cost', field: 'name', value: 'Cost', ts: 10, device: 'other' }])
    expect((await db.fields.get('cost'))?.name).toBe('Cost')
    await mutate('field', 'client', { name: 'Client', project_id: 'p', type: 'text', options: '', position: 1, created_at: 1, deleted_at: null })
    expect((await outbox()).filter((o) => o.entity === 'field')).toHaveLength(7)
  })

  it('a fields patch becomes one op per key; values fold into row.fields', async () => {
    await mutate('task', 't1', { title: 'Quote' })
    await db.outbox.clear()
    await mutate('task', 't1', { fields: { cost: 120, client: 'Acme' } })
    const ops = await outbox()
    expect(ops.map((o) => o.field).sort()).toEqual(['fields.client', 'fields.cost'])
    expect((await db.tasks.get('t1'))?.fields).toEqual({ cost: 120, client: 'Acme' })
  })

  it('different fields on two devices both survive; the same field converges by last writer', async () => {
    const a = `A-${n++}`
    const b = `B-${n++}`
    await use(a)
    await mutate('task', 't1', { title: 'Quote' })
    await exchange(a, b)
    await use(a)
    await db.outbox.clear()
    await mutate('task', 't1', { fields: { cost: 100 } })
    await use(b)
    await db.outbox.clear()
    await mutate('task', 't1', { fields: { client: 'Acme', cost: 150 } })
    await exchange(a, b)
    await use(a)
    const ta = (await db.tasks.get('t1'))!.fields
    await use(b)
    const tb = (await db.tasks.get('t1'))!.fields
    expect(ta).toEqual(tb)
    expect(ta?.client).toBe('Acme')
    expect(ta?.cost).toBe(150)
  })

  it('clearing a value writes null; a row from before the change reads as empty', async () => {
    await mutate('task', 't1', { title: 'Quote', fields: { cost: 120 } })
    await mutate('task', 't1', { fields: { cost: null } })
    expect((await db.tasks.get('t1'))?.fields).toEqual({ cost: null })
    await db.tasks.put({ ...(await db.tasks.get('t1'))!, id: 'old', fields: undefined })
    expect((await db.tasks.get('old'))?.fields ?? {}).toEqual({})
  })
})
