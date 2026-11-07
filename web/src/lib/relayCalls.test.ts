// Relay requests the device can see and refuse (OpenSpec change
// relay-request-transparency): each request names its call, a request without
// one is refused, the call being answered is published for the footer mark,
// and "Confirm reads first" sends decrypted values only on Allow.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { encryptValue, generateAccountKey } from './crypto'

const key = vi.hoisted(() => ({ current: null as CryptoKey | null }))
vi.mock('./e2ee', async (orig) => ({ ...(await orig<typeof import('./e2ee')>()), currentKey: async () => key.current }))

const { answer, onRelayChange, relaySnapshot, setConfirmReads, setConfirmWrites } = await import('./relay')

beforeEach(async () => {
  await db.delete()
  await db.open()
  key.current = await generateAccountKey()
  await setConfirmReads(false)
  await setConfirmWrites(false)
})

const call = { tool: 'list_tasks', token: 'Claude.ai', args: '{"project":"p1"}', write: false }
const read = async (titles: string[], c: Partial<typeof call> = call) => ({
  op: 'decrypt' as const,
  items: await Promise.all(titles.map(async (title, i) => ({ entity: 'task', id: `t${i}`, field: 'title', value: await encryptValue(key.current!, 'task', `t${i}`, 'title', title) }))),
  call: c as typeof call,
  deadline: Date.now() + 10_000,
})

/** Resolves with the first pending confirmation, deciding it. */
function decideNext(apply: boolean): Promise<NonNullable<ReturnType<typeof relaySnapshot>['pending']>> {
  return new Promise((resolve) => {
    const off = onRelayChange(() => {
      const p = relaySnapshot().pending
      if (p) {
        off()
        resolve(p)
        p.decide(apply)
      }
    })
  })
}

describe('requests name their call', () => {
  it('refuses a request that names no tool and decrypts nothing', async () => {
    const r = await read(['Call the plumber'], { tool: '' })
    expect(await answer(r)).toEqual({ error: 'refused' })
    expect(relaySnapshot().recent[0]).toMatchObject({ outcome: 'refused' })
  })

  it('publishes the call it is answering, then clears it; the recent list names the connector without the arguments', async () => {
    const seen: unknown[] = []
    const off = onRelayChange(() => seen.push(relaySnapshot().answering))
    expect(await answer(await read(['Buy paint']))).toEqual({ results: [{ value: 'Buy paint' }] })
    off()
    expect(seen).toContainEqual({ tool: 'list_tasks', token: 'Claude.ai' })
    expect(relaySnapshot().answering).toBeNull()
    expect(relaySnapshot().recent[0]).toMatchObject({ tool: 'list_tasks', token: 'Claude.ai', op: 'decrypt', count: 1, outcome: 'answered' })
    expect(JSON.stringify(relaySnapshot().recent)).not.toContain('p1')
    expect(JSON.stringify(relaySnapshot().recent)).not.toContain('Buy paint')
  })
})

describe('Confirm reads first', () => {
  it('shows the decrypted values with the call; Decline sends nothing', async () => {
    await setConfirmReads(true)
    const asked = decideNext(false)
    const out = await answer(await read(['Call the plumber', 'Buy paint']))
    const p = await asked
    expect(p).toMatchObject({ op: 'decrypt', tool: 'list_tasks', token: 'Claude.ai', args: '{"project":"p1"}' })
    expect(p.items.map((i) => i.value)).toEqual(['Call the plumber', 'Buy paint'])
    expect(out).toEqual({ error: 'declined_on_device' })
    expect(JSON.stringify(out)).not.toContain('plumber')
    expect(relaySnapshot().pending).toBeNull()
    expect(relaySnapshot().recent[0]).toMatchObject({ op: 'decrypt', outcome: 'declined_on_device' })
  })

  it('Allow sends the values', async () => {
    await setConfirmReads(true)
    const asked = decideNext(true)
    expect(await answer(await read(['Buy paint']))).toEqual({ results: [{ value: 'Buy paint' }] })
    await asked
  })

  it('does not ask for writes, and Confirm changes first does not ask for reads', async () => {
    await setConfirmReads(true)
    const w = await answer({ op: 'encrypt', items: [{ entity: 'task', id: 't1', field: 'title', value: 'x' }], call: { tool: 'create_tasks', write: true }, deadline: Date.now() + 10_000 })
    expect('results' in w && w.results[0].value?.startsWith('enc:v1:')).toBe(true)
    await setConfirmReads(false)
    await setConfirmWrites(true)
    expect(await answer(await read(['x']))).toEqual({ results: [{ value: 'x' }] })
  })

  it('answers declined when no decision comes before the deadline', async () => {
    await setConfirmReads(true)
    const r = await read(['Buy paint'])
    expect(await answer({ ...r, deadline: Date.now() + 600 })).toEqual({ error: 'declined_on_device' })
    expect(relaySnapshot().pending).toBeNull()
  })
})
