import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { createField, deleteField, FieldError, formatValue, MAX_FIELDS, parseOptions, renameField, reorderField, setFieldOptions, validateValue } from './fields'
import { getDeviceId, mutate, resetDeviceId } from './ops'

let n = 0
beforeEach(async () => {
  useDatabase(`fields-${Date.now()}-${n++}`)
  resetDeviceId()
  await getDeviceId()
})

describe('values by type (custom-fields 2.4)', () => {
  const def = (type: string, options = '') => ({ type, options })
  it('validates and normalises each type', () => {
    expect(validateValue(def('number'), '1,234.5')).toEqual({ ok: true, value: 1234.5 })
    expect(validateValue(def('number'), '1.234,5', ',')).toEqual({ ok: true, value: 1234.5 })
    expect(validateValue(def('number'), 'abc').ok).toBe(false)
    expect(validateValue(def('date'), '2026-02-30').ok).toBe(false)
    expect(validateValue(def('date'), '2026-02-28')).toEqual({ ok: true, value: '2026-02-28' })
    expect(validateValue(def('choice', 'Draft\nSent'), 'sent')).toEqual({ ok: true, value: 'Sent' })
    expect(validateValue(def('choice', 'Draft\nSent'), 'Paid').ok).toBe(false)
    expect(validateValue(def('link'), 'javascript:alert(1)').ok).toBe(false)
    expect(validateValue(def('link'), 'https://example.com/q')).toEqual({ ok: true, value: 'https://example.com/q' })
    expect(validateValue(def('checkbox'), true)).toEqual({ ok: true, value: true })
    expect(validateValue(def('text'), '')).toEqual({ ok: true, value: null })
  })
  it('formats for display, plain text for a mismatch', () => {
    expect(formatValue(def('number'), 1234.5, 'de-DE')).toBe('1.234,5')
    expect(formatValue(def('checkbox'), true)).toBe('Yes')
    expect(formatValue(def('number'), 'not a number')).toBe('not a number')
    expect(parseOptions(' A \n\nB\n')).toEqual(['A', 'B'])
  })
})

describe('definitions (custom-fields 2.4)', () => {
  it('creates in order, refuses duplicates ignoring case and more than 30 fields', async () => {
    const a = await createField('p1', { name: 'Cost', type: 'number' })
    const b = await createField('p1', { name: 'Client', type: 'text' })
    expect((await db.fields.get(b))!.position).toBeGreaterThan((await db.fields.get(a))!.position)
    await expect(createField('p1', { name: 'cost', type: 'text' })).rejects.toBeInstanceOf(FieldError)
    await createField('p2', { name: 'Cost', type: 'text' }) // another project may reuse the name
    for (let i = 2; i < MAX_FIELDS; i++) await createField('p1', { name: `F${i}`, type: 'text' })
    await expect(createField('p1', { name: 'One more', type: 'text' })).rejects.toThrow(/at most 30/)
    await expect(renameField(b, 'COST')).rejects.toBeInstanceOf(FieldError)
    expect(await reorderField(b, 'top')).toBe(true)
    await deleteField(a)
    expect((await db.fields.get(a))!.deleted_at).not.toBeNull()
  })

  it('renaming an option rewrites the tasks that hold it, one op per task', async () => {
    const id = await createField('p1', { name: 'Status', type: 'choice', options: 'Draft\nSent' })
    for (const [t, v] of [['t1', 'Draft'], ['t2', 'Draft'], ['t3', 'Sent']] as const) {
      await mutate('task', t, { title: t, project_id: 'p1', fields: { [id]: v } })
    }
    await db.outbox.clear()
    await setFieldOptions(id, ['In progress', 'Sent'], { Draft: 'In progress' })
    const ops = await db.outbox.toArray()
    expect(ops.filter((o) => o.entity === 'task').map((o) => [o.entityId, o.field, o.value]).sort()).toEqual([
      ['t1', `fields.${id}`, 'In progress'], ['t2', `fields.${id}`, 'In progress'],
    ])
    expect(new Set(ops.map((o) => o.ts)).size).toBe(1)
    expect((await db.tasks.get('t3'))!.fields![id]).toBe('Sent')
  })
})
