// The worker's reads of its trust record: no record is cached like any record, a failed
// read is not, the last record read stands in while the store cannot be read, and the
// remembered refusal mode decides for a worker that never read one.
import { describe, expect, it, vi } from 'vitest'
import { trustReader, type TrustRecord } from './appTrust'

const rec = (refuse: boolean) => ({ mode: 'signed', keys: [], refuse, announced: [] }) as unknown as TrustRecord
const memory = (on: boolean | null = false) => { let v = on; return { get: vi.fn(async () => v), set: vi.fn(async (x: boolean) => { v = x }) } }

describe('trustReader', () => {
  it('caches a record and "no record", and reads again after forget', async () => {
    const load = vi.fn(async () => null)
    const r = trustReader(load, memory())
    expect(await r.read()).toEqual({ record: null, unreadable: false, refuse: false })
    await r.read()
    expect(load).toHaveBeenCalledOnce()
    r.forget()
    await r.read()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not cache a failed read, and keeps the last record read meanwhile', async () => {
    let fail = false
    const load = vi.fn(async () => { if (fail) throw new Error('unreadable'); return rec(true) })
    const m = memory()
    const r = trustReader(load, m)
    expect((await r.read()).refuse).toBe(true)
    expect(m.set).toHaveBeenCalledWith(true)
    r.forget()
    fail = true
    expect(await r.read()).toMatchObject({ unreadable: true, refuse: true, record: { refuse: true } })
    fail = false
    expect(await r.read()).toMatchObject({ unreadable: false, refuse: true })
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('a worker that never read its record follows the remembered mode', async () => {
    const load = async () => { throw new Error('unreadable') }
    expect(await trustReader(load, memory(true)).read()).toEqual({ record: null, unreadable: true, refuse: true })
    expect(await trustReader(load, memory(false)).read()).toEqual({ record: null, unreadable: true, refuse: false })
  })

  it('a remembered mode that cannot be read either is unknown, and unknown refuses', async () => {
    const load = async () => { throw new Error('unreadable') }
    const rejecting = { get: async () => { throw new Error('caches') }, set: async () => undefined }
    expect(await trustReader(load, rejecting).read()).toEqual({ record: null, unreadable: true, refuse: true })
    expect(await trustReader(load, { get: async () => null, set: async () => undefined }).read()).toMatchObject({ refuse: true })
  })

  it('a save stands in after a forget and a failed read, and its mode is remembered', async () => {
    let fail = false
    const load = vi.fn(async () => { if (fail) throw new Error('unreadable'); return rec(false) })
    const m = memory()
    const r = trustReader(load, m)
    expect((await r.read()).refuse).toBe(false)
    await r.saved(rec(true))
    expect(m.set).toHaveBeenLastCalledWith(true)
    r.forget()
    fail = true
    expect(await r.read()).toMatchObject({ unreadable: true, refuse: true, record: { refuse: true } })
  })

  it('a stand-in never overrides a mode remembered since', async () => {
    let fail = false
    const m = memory()
    const r = trustReader(async () => { if (fail) throw new Error('unreadable'); return rec(false) }, m)
    await r.read()
    await m.set(true) // another worker
    r.forget()
    fail = true
    expect((await r.read()).refuse).toBe(true)
  })

  it('no remembered mode is unknown and refuses; report-only works once the record can be read', async () => {
    let fail = true
    const r = trustReader(async () => { if (fail) throw new Error('unreadable'); return rec(false) }, memory(null))
    expect(await r.read()).toEqual({ record: null, unreadable: true, refuse: true })
    fail = false
    expect(await r.read()).toMatchObject({ unreadable: false, refuse: false })
  })
})
