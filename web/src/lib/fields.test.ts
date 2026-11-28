// Custom fields (OpenSpec custom-fields): the data layer. Two devices are two
// local databases that exchange their outboxes, as the server would relay them.
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { occurrenceId } from './ids'
import { applyOps, completeTask, createProject, createTask, getDeviceId, mutate, resetDeviceId, updateTask } from './ops'
import {
  countValues, createField, FieldError, fieldBadges, formatValue, liveFields, matchesType, MAX_FIELDS, parseLocaleNumber,
  parseOptions, renameField, reorderField, setFieldOptions, setFieldValue, validateValue, applicableFields, fieldDescendants, type FieldProject,
  createWorkspaceField, workspaceFieldsOf, fieldPlace,
} from './fields'
import { deleteFieldUndoable as deleteField } from './undoActions'
import vectors from './fields.vectors.json'
import { isContentField } from './e2ee'
import type { FieldDef, Op, Task, Workspace } from './types'
import { Partition } from './workspaces'

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

// Inherited fields (OpenSpec inherited-custom-fields): the shared vectors pin the
// resolver against internal/sync, then the definition checks across a tree.
describe('inherited fields', () => {
  it('matches the shared vectors', () => {
    for (const c of vectors.cases) {
      // With workspaces (workspace-fields D2) the case places its projects.
      const w = (c as { workspaces?: { default: string; known: string[]; owned?: string[]; foreign?: string[] } }).workspaces
      const place = w ? fieldPlace(new Partition(w.default, w.known, c.projects as FieldProject[]), w.owned ?? w.known, w.foreign ?? []) : undefined
      const got = applicableFields(c.project, c.projects as FieldProject[], c.fields as unknown as FieldDef[], place).map((d) => d.id)
      expect(got, c.name).toEqual(c.want)
    }
    for (const c of vectors.descendants) {
      expect(fieldDescendants(c.project, c.projects as FieldProject[]).sort(), c.name).toEqual(c.want)
    }
  })

  describe('checks across a project tree', () => {
    beforeEach(async () => { await use(run()) })

    it('a sub-project cannot reuse an inherited name, nor a parent a sub-project\'s name', async () => {
      const scoring = await createProject({ name: 'Scoring' })
      const topicA = await createProject({ name: 'Topic A', parent_id: scoring })
      const topicB = await createProject({ name: 'Topic B', parent_id: scoring })
      const detail = await createProject({ name: 'Detail', parent_id: topicA })
      await createField(scoring, { name: 'WSJF', type: 'number' })
      await createField(topicB, { name: 'Size', type: 'number' })
      await expect(createField(detail, { name: 'wsjf', type: 'number' })).rejects.toThrow(/inherits a field named “wsjf” from “Scoring”/)
      await expect(createField(scoring, { name: 'size', type: 'number' })).rejects.toThrow(/sub-project “Topic B” already has a field named “size”/)
      const own = await createField(topicA, { name: 'Notes', type: 'text' })
      await expect(renameField(own, 'WSJF')).rejects.toThrow(/from “Scoring”/)
      const defs = await db.fields.toArray()
      const projects = await db.projects.toArray()
      expect(applicableFields(detail, projects, defs).map((d) => d.name)).toEqual(['WSJF', 'Notes'])
    })

    it('the limit counts inherited fields, for every sub-project below', async () => {
      const root = await createProject({ name: 'Root' })
      const child = await createProject({ name: 'Child', parent_id: root })
      for (let i = 0; i < MAX_FIELDS - 1; i++) {
        await mutate('field', `own-${i}`, { name: `F${i}`, project_id: child, type: 'text', options: '', position: i, created_at: 1, deleted_at: null })
      }
      await createField(root, { name: 'Last', type: 'text' })
      await expect(createField(root, { name: 'One more', type: 'text' })).rejects.toThrow(/sub-project “Child” would have more than 30 fields/)
      await expect(createField(child, { name: 'One more', type: 'text' })).rejects.toThrow(/at most 30 fields/)
    })

    it('renaming an option rewrites tasks of sub-projects too, and badges show inherited values', async () => {
      const root = await createProject({ name: 'Root' })
      const child = await createProject({ name: 'Child', parent_id: root })
      const stage = await createField(root, { name: 'Stage', type: 'choice', options: 'Quote\nOrdered' })
      const inChild = await createTask({ title: 'Tiles', project_id: child })
      await setFieldValue(inChild, stage, 'Ordered')
      expect(await setFieldOptions(stage, 'Quote\nOn order', { Ordered: 'On order' })).toBe(1)
      const task = (await db.tasks.get(inChild))!
      expect(task.fields?.[stage]).toBe('On order')
      const defs = await db.fields.toArray()
      const projects = await db.projects.toArray()
      expect(fieldBadges(task, defs).map((b) => b.text)).toEqual([])
      expect(fieldBadges(task, defs, undefined, (pid) => applicableFields(pid, projects, defs)).map((b) => b.text)).toEqual(['Stage On order'])
      expect(countValues(stage, await db.tasks.toArray())).toBe(1)
    })
  })

  // Workspace fields (OpenSpec workspace-fields): no project, the personal
  // scope, before every project's own fields; names and the limit across the workspace.
  describe('workspace fields', () => {
    const ws = (id: string, name: string, isDefault: boolean): Workspace => ({ id, name, icon: '', color: '', default: isDefault, role: 'owner', ownerId: 'u1' })
    const home = ws('home', 'Personal', true)
    const work = ws('work', 'Work', false)
    beforeEach(async () => {
      await use(run())
      await db.workspaces.bulkPut([home, work])
    })
    const place = async () => fieldPlace(new Partition('home', ['home', 'work'], await db.projects.toArray()), ['home', 'work'], [])

    it('applies to every project of its workspace, first, and writes no project_id', async () => {
      const kitchen = await createProject({ name: 'Kitchen' })
      const office = await createProject({ name: 'Office' })
      await mutate('project', office, { workspace_id: 'work' })
      const client = await createWorkspaceField(home, { name: 'Client', type: 'text' })
      const own = await createField(kitchen, { name: 'Cost', type: 'number' })
      const ops = (await outbox()).filter((o) => o.entityId === client)
      expect(ops.map((o) => o.field)).not.toContain('project_id')
      expect(ops.find((o) => o.field === 'workspace_id')?.value).toBeNull()
      expect(ops.map((o) => o.field)).toContain('name')
      const defs = await db.fields.toArray()
      const projects = await db.projects.toArray()
      expect(applicableFields(kitchen, projects, defs, await place()).map((d) => d.id)).toEqual([client, own])
      expect(applicableFields(office, projects, defs, await place()).map((d) => d.id)).toEqual([])
      expect((await workspaceFieldsOf('home')).map((d) => d.id)).toEqual([client])
      const remote = await createWorkspaceField(work, { name: 'Client', type: 'text' })
      expect((await db.fields.get(remote))?.workspace_id).toBe('work')
    })

    it('refuses a name a project of the workspace or the workspace already uses', async () => {
      const kitchen = await createProject({ name: 'Kitchen' })
      await createField(kitchen, { name: 'Size', type: 'number' })
      await expect(createWorkspaceField(home, { name: 'size', type: 'number' })).rejects.toThrow(/project “Kitchen” already has a field named “size”/)
      const client = await createWorkspaceField(home, { name: 'Client', type: 'text' })
      await expect(createWorkspaceField(home, { name: 'CLIENT', type: 'text' })).rejects.toThrow(/workspace already has a field named/)
      await expect(createField(kitchen, { name: 'client', type: 'text' })).rejects.toThrow(/already has a field named “client” from “Personal”/)
      await expect(renameField(client, 'Size')).rejects.toThrow(/project “Kitchen”/)
      await renameField(client, 'Customer')
      expect((await db.fields.get(client))?.name).toBe('Customer')
    })

    it('leaves out a project someone else shared, and a workspace the person does not own', async () => {
      const theirs = await createProject({ name: 'Garden' })
      await createField(theirs, { name: 'Client', type: 'text' })
      await db.memberships.put({ projectId: theirs, role: 'editor', ownerId: 'u2', members: [] })
      await db.workspaces.put({ ...work, role: 'admin' })
      // The shared-in project neither clashes with the workspace field nor counts toward its limit.
      const client = await createWorkspaceField(home, { name: 'Client', type: 'text' })
      await expect(createWorkspaceField(work, { name: 'Stage', type: 'text' })).rejects.toThrow()
      const tree = { projects: await db.projects.toArray(), defs: await db.fields.toArray() }
      const placed = fieldPlace(new Partition('home', ['home', 'work'], tree.projects), ['home'], [theirs])
      expect(applicableFields(theirs, tree.projects, tree.defs, placed).map((d) => d.name)).toEqual(['Client'])
      expect(applicableFields(theirs, tree.projects, tree.defs, placed).map((d) => d.id)).not.toContain(client)
    })

    it('counts toward every project\'s limit of 30', async () => {
      const kitchen = await createProject({ name: 'Kitchen' })
      for (let i = 0; i < MAX_FIELDS - 1; i++) {
        await mutate('field', `own-${i}`, { name: `F${i}`, project_id: kitchen, type: 'text', options: '', position: i, created_at: 1, deleted_at: null })
      }
      await createWorkspaceField(home, { name: 'Last', type: 'text' })
      await expect(createWorkspaceField(home, { name: 'One more', type: 'text' })).rejects.toThrow(/project “Kitchen” would have more than 30 fields/)
      await expect(createField(kitchen, { name: 'One more', type: 'text' })).rejects.toThrow(/at most 30 fields/)
    })

    it('renames an option in the tasks of every project of the workspace and reorders among its fields', async () => {
      const kitchen = await createProject({ name: 'Kitchen' })
      const stage = await createWorkspaceField(home, { name: 'Stage', type: 'choice', options: 'Quote\nOrdered' })
      const second = await createWorkspaceField(home, { name: 'Client', type: 'text' })
      const task = await createTask({ title: 'Tiles', project_id: kitchen })
      await setFieldValue(task, stage, 'Ordered')
      expect(await setFieldOptions(stage, 'Quote\nOn order', { Ordered: 'On order' })).toBe(1)
      expect((await db.tasks.get(task))?.fields?.[stage]).toBe('On order')
      expect(await reorderField(second, -1)).toBe(true)
      expect((await workspaceFieldsOf('home')).map((d) => d.id)).toEqual([second, stage])
    })
  })
})
