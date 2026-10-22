import { beforeEach, describe, expect, it } from 'vitest'
import { useDatabase } from '../db'
import { applyOps, resetDeviceId } from '../ops'
import type { Op, RuleActions } from '../types'
import { MAX_RULES, activeRules, createRule, deleteRule, duplicateRule, isKnownRule, reorderRule, setRuleEnabled, updateRule } from './store'

let n = 0
let db = useDatabase('rules-store-init')
beforeEach(() => {
  db = useDatabase(`rules-store-${Date.now()}-${n++}`)
  resetDeviceId()
})

const WAITING = { name: 'Label waiting → move to Waiting', trigger: { kind: 'label.added' as const, label_id: 'lw' }, actions: { section: { project_id: 'p', section_id: 's' } } }

describe('rule store', () => {
  it('lists a rule saved offline at once, on, with an op per field in the outbox', async () => {
    const id = await createRule(WAITING)
    const row = await db.rules.get(id)
    expect(row).toMatchObject({ name: WAITING.name, enabled: true, condition: null, deleted_at: null })
    const fields = (await db.outbox.toArray()).filter((o) => o.entityId === id).map((o) => o.field).sort()
    expect(fields).toEqual(['actions', 'condition', 'created_at', 'deleted_at', 'enabled', 'name', 'position', 'trigger'])
  })

  it('refuses the 51st rule and a rule without a name or an action', async () => {
    for (let i = 0; i < MAX_RULES; i++) await createRule({ ...WAITING, name: `r${i}` })
    await expect(createRule(WAITING)).rejects.toThrow(/at most 50/)
    await expect(createRule({ ...WAITING, name: ' ' })).rejects.toThrow()
  })

  it('refuses empty actions', async () => {
    await expect(createRule({ ...WAITING, actions: {} as RuleActions })).rejects.toThrow()
  })

  it('writes only the changed field, so a rename keeps an action key this build does not know', async () => {
    const id = await createRule(WAITING)
    const row = (await db.rules.get(id))!
    await applyOps([{ id: 'r1', entity: 'rule', entityId: id, field: 'actions', value: { assistant: { prompt: 'x' } }, ts: row._clock.actions.ts + 1, device: '~new' } as Op])
    const newer = (await db.rules.get(id))!
    expect(isKnownRule(newer)).toBe(false)
    const before = (await db.outbox.count())
    await updateRule(id, { name: 'Renamed' })
    const after = await db.outbox.toArray()
    expect(after.length).toBe(before + 1)
    expect(after[after.length - 1].field).toBe('name')
    expect((await db.rules.get(id))!.actions).toEqual({ assistant: { prompt: 'x' } })
  })

  it('knows the rules this build can edit', () => {
    expect(isKnownRule({ trigger: { kind: 'task.created' }, condition: null, actions: { priority: 1 } } as never)).toBe(true)
    expect(isKnownRule({ trigger: { kind: 'tomorrow.someday' }, condition: null, actions: { priority: 1 } } as never)).toBe(false)
    expect(isKnownRule({ trigger: { kind: 'task.created' }, condition: { mood: 'happy' }, actions: { priority: 1 } } as never)).toBe(false)
  })

  it('switches, duplicates, reorders and deletes', async () => {
    const a = await createRule({ ...WAITING, name: 'A' })
    const b = await createRule({ ...WAITING, name: 'B' })
    await setRuleEnabled(a, false)
    expect((await db.rules.get(a))!.enabled).toBe(false)
    const c = await duplicateRule(b)
    expect((await db.rules.get(c))).toMatchObject({ name: 'B (copy)', enabled: false })
    await reorderRule(c, -1)
    expect(activeRules(await db.rules.toArray()).map((r) => r.name)).toEqual(['A', 'B (copy)', 'B'])
    await deleteRule(a)
    expect(activeRules(await db.rules.toArray()).map((r) => r.name)).toEqual(['B (copy)', 'B'])
  })
})
