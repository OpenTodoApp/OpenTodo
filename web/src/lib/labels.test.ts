import { beforeEach, describe, expect, it } from 'vitest'
import { useDatabase } from './db'
import {
  LabelExistsError, activeLabels, addLabel, countOpenByLabel, createLabel, deleteLabel, duplicateLabelIds,
  mergeLabels, removeLabel, reorderLabel, resolveLabels, updateLabel,
} from './labels'
import { applyOps, createTask, resetDeviceId } from './ops'
import type { Label, Op } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`labels-${Date.now()}-${n++}`)
  resetDeviceId()
})

const remoteOp = (p: Pick<Op, 'entityId' | 'field' | 'value' | 'ts' | 'device'> & Partial<Op>): Op => ({
  id: crypto.randomUUID(), entity: 'task', ...p,
})

describe('createLabel / updateLabel / reorderLabel', () => {
  it('creates a label with a colour and refuses a duplicate name ignoring case', async () => {
    const db = useDatabase(`create-${Date.now()}`)
    const id = await createLabel({ name: ' errand ' })
    const l = await db.labels.get(id)
    expect(l?.name).toBe('errand')
    expect(l?.color).toMatch(/^#/)
    expect(l?.deleted_at).toBeNull()
    expect((await db.outbox.toArray()).filter((o) => o.entity === 'label')).toHaveLength(5)

    await expect(createLabel({ name: 'Errand' })).rejects.toBeInstanceOf(LabelExistsError)
    await expect(createLabel({ name: 'Errand' })).rejects.toMatchObject({ existing: { id } })
    expect(await db.labels.count()).toBe(1)
    // A deleted label does not block the name.
    await deleteLabel(id)
    const again = await createLabel({ name: 'ERRAND' })
    expect(again).not.toBe(id)
  })

  it('rename is exactly one op and never writes a task', async () => {
    const db = useDatabase(`rename-${Date.now()}`)
    const id = await createLabel({ name: 'errand' })
    const tasks = await Promise.all(Array.from({ length: 5 }, (_, i) => createTask({ title: `t${i}` })))
    for (const t of tasks) await addLabel(t, id)
    const before = await db.outbox.count()
    await updateLabel(id, { name: 'errands' })
    const after = await db.outbox.orderBy('local').toArray()
    expect(after.length - before).toBe(1)
    expect(after.at(-1)).toMatchObject({ entity: 'label', entityId: id, field: 'name', value: 'errands' })
    for (const t of tasks) expect((await db.tasks.get(t))?.labels).toEqual([id])
    await expect(updateLabel(id, { name: '' })).rejects.toThrow()
    const other = await createLabel({ name: 'call' })
    await expect(updateLabel(other, { name: 'Errands' })).rejects.toBeInstanceOf(LabelExistsError)
  })

  it('reorders by swapping positions with the neighbour', async () => {
    const db = useDatabase(`reorder-${Date.now()}`)
    const a = await createLabel({ name: 'a' })
    await new Promise((r) => setTimeout(r, 2))
    const b = await createLabel({ name: 'b' })
    await new Promise((r) => setTimeout(r, 2))
    const c = await createLabel({ name: 'c' })
    expect(activeLabels(await db.labels.toArray()).map((l) => l.id)).toEqual([a, b, c])
    await reorderLabel(c, -1)
    expect(activeLabels(await db.labels.toArray()).map((l) => l.id)).toEqual([a, c, b])
    await reorderLabel(a, -1) // already first: no-op
    expect(activeLabels(await db.labels.toArray()).map((l) => l.id)).toEqual([a, c, b])
    await reorderLabel(a, 1)
    expect(activeLabels(await db.labels.toArray()).map((l) => l.id)).toEqual([c, a, b])
  })
})

describe('addLabel / removeLabel', () => {
  it('sequential adds keep both', async () => {
    const db = useDatabase(`seq-${Date.now()}`)
    const errand = await createLabel({ name: 'errand' })
    const call = await createLabel({ name: 'call' })
    const t = await createTask({ title: 'x' })
    expect(await addLabel(t, errand)).toBe(true)
    expect(await addLabel(t, call)).toBe(true)
    expect(await addLabel(t, call)).toBe(false) // idempotent, no op written
    expect((await db.tasks.get(t))?.labels).toEqual([errand, call])
    const labelOps = (await db.outbox.toArray()).filter((o) => o.entityId === t && o.field === 'labels')
    expect(labelOps.map((o) => o.value)).toEqual([[], [errand], [errand, call]])
    await removeLabel(t, errand)
    expect((await db.tasks.get(t))?.labels).toEqual([call])
  })

  it('concurrent adds resolve to the newer array on every replica', async () => {
    const results: string[] = []
    for (const order of [[0, 1], [1, 0]]) {
      const db = useDatabase(`conc-${order.join('')}-${Date.now()}`)
      const ops = [
        remoteOp({ entityId: 't1', field: 'labels', value: ['errand'], ts: 1000, device: 'A' }),
        remoteOp({ entityId: 't1', field: 'labels', value: ['call'], ts: 2000, device: 'B' }),
      ]
      for (const i of order) await applyOps([ops[i]])
      results.push(JSON.stringify((await db.tasks.get('t1'))?.labels))
    }
    expect(results).toEqual(['["call"]', '["call"]'])
  })

  it('a local add is a whole-array write that a later remote write replaces', async () => {
    const db = useDatabase(`lww-${Date.now()}`)
    const errand = await createLabel({ name: 'errand' })
    const t = await createTask({ title: 'x' })
    await addLabel(t, errand)
    const local = (await db.tasks.get(t))!._clock.labels
    await applyOps([remoteOp({ entityId: t, field: 'labels', value: ['remote'], ts: local.ts + 1, device: 'B' })])
    expect((await db.tasks.get(t))?.labels).toEqual(['remote'])
    await applyOps([remoteOp({ entityId: t, field: 'labels', value: ['stale'], ts: local.ts - 1, device: 'B' })])
    expect((await db.tasks.get(t))?.labels).toEqual(['remote'])
  })
})

describe('deleteLabel / mergeLabels', () => {
  it('delete removes from tasks with one op per carrying task', async () => {
    const db = useDatabase(`del-${Date.now()}`)
    const errand = await createLabel({ name: 'errand' })
    const keep = await createLabel({ name: 'keep' })
    const carriers = [await createTask({ title: 'a' }), await createTask({ title: 'b' }), await createTask({ title: 'c' })]
    const bystander = await createTask({ title: 'd' })
    for (const id of carriers) await addLabel(id, errand)
    await addLabel(carriers[0], keep)
    await addLabel(bystander, keep)
    const before = await db.outbox.count()
    await deleteLabel(errand)
    const after = await db.outbox.orderBy('local').toArray().then((l) => l.slice(before))
    expect(after.filter((o) => o.entity === 'task')).toHaveLength(3)
    expect(after.filter((o) => o.entity === 'label')).toHaveLength(1)
    expect((await db.labels.get(errand))?.deleted_at).toBeTruthy()
    for (const id of carriers) expect((await db.tasks.get(id))?.labels).not.toContain(errand)
    expect((await db.tasks.get(carriers[0]))?.labels).toEqual([keep])
    expect((await db.tasks.get(bystander))?.labels).toEqual([keep])
  })

  it('merge yields the union without duplicates and deletes the source', async () => {
    const db = useDatabase(`merge-${Date.now()}`)
    const target = await createLabel({ name: 'errand' })
    // A concurrent duplicate arrives from another device (the local rule would refuse it).
    const source = 'dup-label'
    await applyOps([
      { id: 'r1', entity: 'label', entityId: source, field: 'name', value: 'Errand', ts: 1, device: 'B' },
      { id: 'r2', entity: 'label', entityId: source, field: 'color', value: '#000', ts: 1, device: 'B' },
      { id: 'r3', entity: 'label', entityId: source, field: 'created_at', value: 1, ts: 1, device: 'B' },
    ])
    expect(duplicateLabelIds(await db.labels.toArray())).toEqual(new Set([target, source]))

    const onlySource = [await createTask({ title: '1' }), await createTask({ title: '2' })]
    const onlyTarget = [await createTask({ title: '3' }), await createTask({ title: '4' }), await createTask({ title: '5' })]
    const both = await createTask({ title: '6' })
    for (const id of onlySource) await addLabel(id, source)
    for (const id of onlyTarget) await addLabel(id, target)
    await addLabel(both, source)
    await addLabel(both, target)

    const before = await db.outbox.count()
    await mergeLabels(source, target)
    const written = (await db.outbox.orderBy('local').toArray()).slice(before)
    expect(written.filter((o) => o.entity === 'task')).toHaveLength(3) // 2 source-only + 1 both
    for (const id of [...onlySource, ...onlyTarget, both]) {
      expect((await db.tasks.get(id))?.labels).toEqual([target])
    }
    expect((await db.labels.get(source))?.deleted_at).toBeTruthy()
    expect(duplicateLabelIds(await db.labels.toArray()).size).toBe(0)
    const carrying = await db.tasks.filter((t) => t.labels.includes(target)).count()
    expect(carrying).toBe(6)
  })
})

describe('display helpers', () => {
  const mk = (id: string, name: string, deleted = false): Label => ({
    id, name, color: '#000', position: 0, created_at: 0, deleted_at: deleted ? 1 : null, _clock: {},
  })

  it('resolveLabels hides unknown and deleted ids but keeps the array intact', () => {
    const byId = new Map([['a', mk('a', 'errand')], ['gone', mk('gone', 'old', true)]])
    const ids = ['a', 'not-yet-received', 'gone']
    expect(resolveLabels(ids, byId).map((l) => l.name)).toEqual(['errand'])
    expect(ids).toEqual(['a', 'not-yet-received', 'gone'])
    // Once the label arrives the chip appears.
    byId.set('not-yet-received', mk('not-yet-received', 'call'))
    expect(resolveLabels(ids, byId).map((l) => l.name)).toEqual(['errand', 'call'])
  })

  it('duplicateLabelIds ignores case and deleted labels', () => {
    const set = duplicateLabelIds([mk('1', 'Errand'), mk('2', 'errand '), mk('3', 'call'), mk('4', 'CALL', true)])
    expect(set).toEqual(new Set(['1', '2']))
  })

  it('countOpenByLabel counts open tasks once per label', () => {
    const task = (labels: string[], completed = false, deleted = false) => ({
      id: crypto.randomUUID(), title: '', description: '', project_id: null, parent_id: null, priority: 4 as const, due: null,
      labels, position: 0, created_at: 0, completed_at: completed ? 1 : null, deleted_at: deleted ? 1 : null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, section_id: null, _clock: {},
    })
    const counts = countOpenByLabel([task(['a', 'b']), task(['a', 'a']), task(['a'], true), task(['b'], false, true), task([])])
    expect(counts.get('a')).toBe(2)
    expect(counts.get('b')).toBe(1)
    expect(counts.get('c')).toBeUndefined()
  })
})
