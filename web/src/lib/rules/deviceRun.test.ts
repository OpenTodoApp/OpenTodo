// Device runs of an encrypted account (OpenSpec change routines-ai-step, 3.5
// and 3.6): this device plans a routine on its decrypted copy, everything it
// sends is ciphertext, AI results wait as one sealed proposal that another
// device opens and applies.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'
import { decryptValue, generateAccountKey } from '../crypto'
import type { RoutineRunRequest } from '../relay'
import type { DeviceCommit } from './deviceTypes'

const key = vi.hoisted(() => ({ current: null as CryptoKey | null }))
vi.mock('../e2ee', async (orig) => ({ ...(await orig<typeof import('../e2ee')>()), currentKey: async () => key.current }))
const ai = vi.hoisted(() => ({ ready: true, answer: { text: 'Milk\nBread', lines: ['Milk', 'Bread'], input: 300, output: 40 } }))
vi.mock('./deviceAI', async (orig) => ({
  ...(await orig<typeof import('./deviceAI')>()),
  deviceAIReady: async () => ai.ready,
  completeOnDevice: async () => ai.answer,
}))

const { api, ApiError } = await import('../api')
const { runOnDevice } = await import('./deviceRun')
const { applyOpened, openProposal } = await import('./deviceProposal')

const req = (rule: string, more: Partial<RoutineRunRequest> = {}): RoutineRunRequest =>
  ({ op: 'routine.run', rule, run: 'run-1', occurrence: 'manual:run-1', at: Date.now(), rev: 'r', auto: false, tokens: 0, budget: 0, ...more })

async function seedRule(id: string, steps: unknown[]) {
  await db.rules.put({ id, name: 'Groceries', enabled: true, trigger: { kind: 'manual' }, condition: null, actions: null, steps, position: 1, created_at: 1, deleted_at: null } as never)
}

const isSealed = (v: unknown) => typeof v === 'string' && v.startsWith('enc:v1:')

beforeEach(async () => {
  await db.delete()
  await db.open()
  key.current = await generateAccountKey()
  ai.ready = true
})
afterEach(() => vi.restoreAllMocks())

describe('a device run', () => {
  it('plans on the decrypted copy and commits only ciphertext content', async () => {
    await db.projects.put({ id: 'p1', name: 'Groceries', description: '- oat milk\n- bread', deleted_at: null, archived: false, position: 1 } as never)
    await seedRule('g', [
      { id: 'p', kind: 'find_project', in: { name: { literal: 'Groceries' } } },
      { id: 'a', kind: 'note_text', in: { of: { ref: 'p' } } },
      { id: 'b', kind: 'split_lines', in: { text: { ref: 'a' } } },
      { id: 'c', kind: 'create_tasks', in: { text: { ref: 'b' } } },
    ])
    const commit = vi.spyOn(api, 'commitDeviceRun').mockResolvedValue({ run: { run_id: 'run-1', outcome: 'applied', writes: 2 } })
    const out = await runOnDevice(req('g'))
    expect(out).toMatchObject({ name: 'Groceries', outcome: 'applied', writes: 2 })
    const body = commit.mock.calls[0][1] as DeviceCommit
    expect(body.changes).toHaveLength(2)
    const titles: string[] = []
    for (const c of body.changes!) {
      expect(isSealed(c.fields.title)).toBe(true)
      titles.push(await decryptValue(key.current!, 'task', c.id, 'title', c.fields.title as string))
    }
    expect(titles).toEqual(['oat milk', 'bread'])
    // The step records hold ids and counts only.
    expect(JSON.stringify(body.steps)).not.toContain('oat milk')
    expect(JSON.stringify(body)).not.toContain('bread')
  })

  it('reports a failed step with its code', async () => {
    await seedRule('g', [{ id: 'p', kind: 'find_project', in: { name: { literal: 'Nowhere' } } }, { id: 'a', kind: 'note_text', in: { of: { ref: 'p' } } }])
    const fail = vi.spyOn(api, 'failDeviceRun').mockResolvedValue({ run: { run_id: 'run-1', outcome: 'failed' } })
    const out = await runOnDevice(req('g'))
    expect(out.outcome).toBe('failed')
    expect(fail.mock.calls[0][1]).toMatchObject({ step: 0, code: 'not_found' })
  })

  it('leaves the run waiting while this device is locked', async () => {
    key.current = null
    const commit = vi.spyOn(api, 'commitDeviceRun')
    expect((await runOnDevice(req('g'))).outcome).toBe('locked')
    expect(commit).not.toHaveBeenCalled()
  })
})

const aiSteps = [
  { id: 'a', kind: 'ask_ai', in: { instruction: { literal: 'what do we need?' }, answer: { literal: 'lines' } } },
  { id: 'b', kind: 'create_tasks', in: { text: { ref: 'a' } } },
]

describe('AI results on an encrypted account', () => {
  it('waits as one sealed proposal that a second device opens and applies (two devices)', async () => {
    await seedRule('s', aiSteps)
    const commit = vi.spyOn(api, 'commitDeviceRun').mockResolvedValue({ run: { run_id: 'run-1', outcome: 'proposal', writes: 0 } })
    // The laptop runs it: the proposal is one envelope, its token count on the record.
    expect((await runOnDevice(req('s'))).outcome).toBe('proposal')
    const body = commit.mock.calls[0][1] as DeviceCommit
    expect(body.changes).toBeUndefined()
    expect(body.proposal?.items).toBe(2)
    expect(isSealed(body.proposal?.envelope)).toBe(true)
    expect(body.tokens).toBe(340)
    expect(body.proposal!.envelope).not.toContain('Milk')

    // The phone opens it with the account key and applies one of the two items.
    const proposal = { id: 'p1', run_id: 'run-1', envelope: body.proposal!.envelope }
    const opened = await openProposal(key.current!, proposal)
    expect(opened.items.map((i) => i.fields?.title)).toEqual(['Milk', 'Bread'])
    expect(opened.items.every((i) => i.ai)).toBe(true)
    const apply = vi.spyOn(api, 'applyEncryptedProposal').mockResolvedValue({ state: 'partly_applied', applied: 1, skipped: 1, changed: 0, refused: 0, run_id: 'run-1', rule_id: 's' })
    await applyOpened(key.current!, proposal, opened, [opened.items[0].key])
    const sent = apply.mock.calls[0][1]
    expect(sent.skipped).toBe(1)
    expect(sent.changes).toHaveLength(1)
    const c = sent.changes![0]
    expect(isSealed(c.fields.title)).toBe(true)
    expect(await decryptValue(key.current!, 'task', c.id, 'title', c.fields.title as string)).toBe('Milk')
    // Another key does not open it.
    await expect(openProposal(await generateAccountKey(), proposal)).rejects.toThrow()
  })

  it('in auto mode commits the changes, and resubmits as a proposal when the server falls back', async () => {
    await seedRule('s', aiSteps)
    const commit = vi.spyOn(api, 'commitDeviceRun')
      .mockRejectedValueOnce(new ApiError(409, 'fallback', 'apply without asking does not allow this result'))
      .mockResolvedValueOnce({ run: { run_id: 'run-1', outcome: 'proposal', writes: 0 } })
    expect((await runOnDevice(req('s', { auto: true }))).outcome).toBe('proposal')
    expect((commit.mock.calls[0][1] as DeviceCommit).changes).toHaveLength(2)
    expect((commit.mock.calls[1][1] as DeviceCommit).proposal?.items).toBe(2)
  })

  it('fails the AI step when this device cannot run AI steps', async () => {
    ai.ready = false
    await seedRule('s', aiSteps)
    const fail = vi.spyOn(api, 'failDeviceRun').mockResolvedValue({ run: { run_id: 'run-1', outcome: 'failed' } })
    expect((await runOnDevice(req('s'))).outcome).toBe('failed')
    expect(fail.mock.calls[0][1]).toMatchObject({ code: 'unavailable:ai_encrypted' })
  })
})
