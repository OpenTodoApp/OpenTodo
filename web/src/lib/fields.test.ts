// Custom fields (OpenSpec custom-fields): the data layer. Two devices are two
// local databases that exchange their outboxes, as the server would relay them.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { occurrenceId } from './ids'
import { applyOps, completeTask, createProject, createTask, getDeviceId, mutate, resetDeviceId, updateTask } from './ops'
import {
  countValues, createField, deleteField, FieldError, fieldBadges, formatValue, liveFields, matchesType, MAX_FIELDS, parseLocaleNumber,
  parseOptions, renameField, reorderField, setFieldOptions, setFieldValue, validateValue,
} from './fields'
import { isContentField } from './e2ee'
import type { FieldDef, Op, Task } from './types'

let n = 0
const run = () => `fields-${Date.now()}-${n++}`

async function use(name: string) {
  useDatabase(name)
  resetDeviceId()
  await getDeviceId()
}

async function outbox(): Promise<Op[]> {
  return (await db.outbox.toArray()).map(({ local: _local, ...op }) => op as Op)
}

/** Every op each device produced reaches every device. */
async function syncAll(names: string[]) {
  const all: Op[] = []
  for (const name of names) {
    await use(name)
    all.push(...(await outbox()))
  }
  for (const name of names) {
    await use(name)
    await applyOps(all)
  }
}

beforeEach(async () => {
  await use(run())
})

const def = (id: string, extra: Partial<FieldDef> = {}): FieldDef => ({
  id, name: id, project_id: 'p', type: 'text', options: '', position: 0, created_at: 0, deleted_at: null, _clock: {}, ...extra,
})

describe('field entity and values in the local store', () => {
  it('a remote field op creates a definition row; an offline mutate queues one', async () => {
    await applyOps([{ id: 'o1', entity: 'field', entityId: 'f1', field: 'name', value: 'Cost', ts: 1, device: 'other' }])
    expect(await db.fields.get('f1')).toMatchObject({ name: 'Cost', type: 'text', options: '', deleted_at: null })
    const pid = await createProject({ name: 'Kitchen' })
    const id = await createField(pid, { name: 'Client', type: 'choice', options: 'Acme\nGlobex' })
    expect(await db.fields.get(id)).toMatchObject({ name: 'Client', project_id: pid, type: 'choice', options: 'Acme\nGlobex' })
    const queued = (await outbox()).filter((o) => o.entity === 'field' && o.entityId === id).map((o) => o.field).sort()
    expect(queued).toEqual(['created_at', 'deleted_at', 'name', 'options', 'position', 'project_id', 'type'])
  })

  it('a fields patch becomes one fields.<id> op per key, folded into row.fields', async () => {
    const id = await createTask({ title: 'Tiles' })
    await db.outbox.clear()
    await mutate('task', id, { fields: { cost: 120 } })
    const ops = await outbox()
    expect(ops.map((o) => [o.field, o.value])).toEqual([['fields.cost', 120]])
    const t = await db.tasks.get(id)
    expect(t?.fields).toEqual({ cost: 120 })
    expect(t?._clock['fields.cost']).toBeDefined()
    expect((t as unknown as Record<string, unknown>)['fields.cost']).toBeUndefined()
  })

  it('a row synced before the change reads as no values', async () => {
    await db.tasks.put({ id: 'old', title: 'Old', _clock: {} } as unknown as Task)
    const t = await db.tasks.get('old')
    expect(t?.fields ?? {}).toEqual({})
    await applyOps([{ id: 'o', entity: 'task', entityId: 'old', field: 'fields.cost', value: 5, ts: 10, device: 'd' }])
    expect((await db.tasks.get('old'))?.fields).toEqual({ cost: 5 })
  })
})

describe('values converge per field (spec)', () => {
  it('Different fields on two devices: both edits are kept', async () => {
    const a = run()
    const b = run()
    await use(a)
    const id = await createTask({ title: 'Tiles' })
    await syncAll([a, b])
    await use(a)
    await setFieldValue(id, 'cost', 120)
    await use(b)
    await setFieldValue(id, 'client', 'Acme')
    await syncAll([a, b])
    for (const d of [a, b]) {
      await use(d)
      expect((await db.tasks.get(id))?.fields).toEqual({ cost: 120, client: 'Acme' })
    }
  })

  it('Same field on two devices: the newer write wins, other fields untouched', async () => {
    const a = run()
    const b = run()
    await use(a)
    const id = await createTask({ title: 'Tiles' })
    await setFieldValue(id, 'client', 'Acme')
    await syncAll([a, b])
    await use(a)
    await setFieldValue(id, 'cost', 120)
    await use(b)
    await setFieldValue(id, 'cost', 150)
    await syncAll([a, b])
    const values = new Set<unknown>()
    for (const d of [a, b]) {
      await use(d)
      const f = (await db.tasks.get(id))?.fields
      expect(f?.client).toBe('Acme')
      values.add(f?.cost)
    }
    expect(values.size).toBe(1)
  })

  it('Clear a value: null on every device', async () => {
    const a = run()
    const b = run()
    await use(a)
    const id = await createTask({ title: 'Tiles' })
    await setFieldValue(id, 'client', 'Acme')
    await syncAll([a, b])
    await use(b)
    await setFieldValue(id, 'client', null)
    await syncAll([a, b])
    await use(a)
    expect((await db.tasks.get(id))?.fields).toEqual({ client: null })
  })

  it('moving a task keeps its values in the data', async () => {
    const kitchen = await createProject({ name: 'Kitchen' })
    const garden = await createProject({ name: 'Garden' })
    const cost = await createField(kitchen, { name: 'Cost', type: 'number' })
    const id = await createTask({ title: 'Tiles', project_id: kitchen })
    await setFieldValue(id, cost, 120)
    await updateTask(id, { project_id: garden })
    const t = (await db.tasks.get(id))!
    expect(t.fields).toEqual({ [cost]: 120 })
    expect(fieldBadges(t, await db.fields.toArray())).toEqual([])
    await updateTask(id, { project_id: kitchen })
    expect(fieldBadges((await db.tasks.get(id))!, await db.fields.toArray()).map((b) => b.text)).toEqual(['Cost 120'])
  })
})

describe('occurrence records carry values', () => {
  it('completing a series copies its values into the record, under the server record id', async () => {
    const id = await createTask({ title: 'Water plants', due: { date: '2026-10-12' }, recurrence: 'every week' })
    await setFieldValue(id, 'cost', 40)
    await setFieldValue(id, 'client', null)
    const recordId = await completeTask(id, { today: '2026-10-12' })
    expect(recordId).toBe(occurrenceId(id, '2026-10-12'))
    expect((await db.tasks.get(recordId!))?.fields).toEqual({ cost: 40, client: null })
  })
})

describe('validation and formatting', () => {
  it('validates each type and clears on empty input', () => {
    expect(validateValue(def('n', { type: 'number' }), '120', 'en')).toEqual({ ok: true, value: 120 })
    expect(validateValue(def('n', { type: 'number' }), '1,234.5', 'en')).toEqual({ ok: true, value: 1234.5 })
    expect(validateValue(def('n', { type: 'number' }), '1.234,5', 'de')).toEqual({ ok: true, value: 1234.5 })
    expect(validateValue(def('n', { type: 'number' }), 'abc', 'en').ok).toBe(false)
    expect(validateValue(def('n', { type: 'number' }), '', 'en')).toEqual({ ok: true, value: null })
    expect(validateValue(def('d', { type: 'date' }), '2026-02-30').ok).toBe(false)
    expect(validateValue(def('d', { type: 'date' }), '2026-10-16')).toEqual({ ok: true, value: '2026-10-16' })
    expect(validateValue(def('c', { type: 'choice', options: 'Quote\nOrdered' }), 'Ordered')).toEqual({ ok: true, value: 'Ordered' })
    expect(validateValue(def('c', { type: 'choice', options: 'Quote\nOrdered' }), 'Done').ok).toBe(false)
    expect(validateValue(def('l', { type: 'link' }), 'https://example.com/quote.pdf').ok).toBe(true)
    expect(validateValue(def('l', { type: 'link' }), 'javascript:alert(1)').ok).toBe(false)
    expect(validateValue(def('t'), 'x'.repeat(2001)).ok).toBe(false)
    expect(validateValue(def('b', { type: 'checkbox' }), true)).toEqual({ ok: true, value: true })
    expect(parseLocaleNumber('-3.5e2', 'en')).toBe(-350)
    expect(parseOptions(' a \n\n b ')).toEqual(['a', 'b'])
  })

  it('formats numbers with digit grouping and spots values that no longer match', () => {
    expect(formatValue(def('n', { type: 'number' }), 1234567)).toBe(new Intl.NumberFormat().format(1234567))
    expect(matchesType(def('n', { type: 'number' }), 'cheap')).toBe(false)
    expect(matchesType(def('n', { type: 'number' }), 3)).toBe(true)
  })

  it('badges: non-empty values in definition order; a checked box reads as its name', () => {
    const defs = [def('cost', { name: 'Cost', type: 'number', position: 1 }), def('status', { name: 'Status', type: 'choice', position: 2 }),
      def('paid', { name: 'Paid', type: 'checkbox', position: 3 }), def('client', { name: 'Client', position: 4 })]
    const t = { project_id: 'p', fields: { cost: 120, status: 'Ordered', paid: true, client: null } }
    expect(fieldBadges(t, defs).map((b) => b.text)).toEqual(['Cost 120', 'Status Ordered', 'Paid'])
    expect(fieldBadges({ project_id: null, fields: t.fields }, defs)).toEqual([])
  })

  it('custom field names, options and values are content fields', () => {
    expect(isContentField('field', 'name')).toBe(true)
    expect(isContentField('field', 'options')).toBe(true)
    expect(isContentField('field', 'type')).toBe(false)
    expect(isContentField('task', 'fields.f1')).toBe(true)
    expect(isContentField('task', 'fields.')).toBe(false)
  })
})

describe('definition ops', () => {
  it('refuses a duplicate name ignoring case and a 31st field', async () => {
    const pid = await createProject({ name: 'Kitchen' })
    await createField(pid, { name: 'Cost', type: 'number' })
    await expect(createField(pid, { name: 'cost', type: 'text' })).rejects.toThrow(FieldError)
    for (let i = 1; i < MAX_FIELDS; i++) await createField(pid, { name: `F${i}`, type: 'text' })
    await expect(createField(pid, { name: 'One more', type: 'text' })).rejects.toThrow(`at most ${MAX_FIELDS}`)
  })

  it('renames, reorders and deletes without touching values', async () => {
    const pid = await createProject({ name: 'Kitchen' })
    const a = await createField(pid, { name: 'A', type: 'text' })
    const b = await createField(pid, { name: 'B', type: 'text' })
    await renameField(a, 'Alpha')
    await reorderField(b, -1)
    expect(liveFields(pid, await db.fields.toArray()).map((d) => d.name)).toEqual(['B', 'Alpha'])
    const id = await createTask({ title: 'x', project_id: pid })
    await setFieldValue(id, a, 'kept')
    await deleteField(a)
    expect(liveFields(pid, await db.fields.toArray()).map((d) => d.name)).toEqual(['B'])
    expect((await db.tasks.get(id))?.fields).toEqual({ [a]: 'kept' })
    expect(countValues(a, await db.tasks.toArray())).toBe(1)
  })

  it('renaming an option rewrites the tasks holding it, one op per task', async () => {
    const pid = await createProject({ name: 'Kitchen' })
    const status = await createField(pid, { name: 'Status', type: 'choice', options: 'Quote\nOrdered\nDone' })
    const t1 = await createTask({ title: 'Tiles', project_id: pid })
    const t2 = await createTask({ title: 'Paint', project_id: pid })
    const t3 = await createTask({ title: 'Sink', project_id: pid })
    await setFieldValue(t1, status, 'Ordered')
    await setFieldValue(t2, status, 'Ordered')
    await setFieldValue(t3, status, 'Quote')
    await db.outbox.clear()
    const n = await setFieldOptions(status, 'Quote\nOn order\nDone', { Ordered: 'On order' })
    expect(n).toBe(2)
    const ops = await outbox()
    expect(ops.filter((o) => o.entity === 'task').map((o) => [o.entityId, o.field, o.value]).sort()).toEqual(
      [[t1, `fields.${status}`, 'On order'], [t2, `fields.${status}`, 'On order']].sort())
    expect((await db.fields.get(status))?.options).toBe('Quote\nOn order\nDone')
    expect((await db.tasks.get(t3))?.fields?.[status]).toBe('Quote')
  })
})
