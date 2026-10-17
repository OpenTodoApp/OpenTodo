// Shared live snapshots (OpenSpec change web-layering, design D2).
import { describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { derived, liveSnapshot } from './liveSnapshot'
import { createProject } from './ops'

let n = 0
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10))
  expect(ok()).toBe(true)
}

describe('liveSnapshot', () => {
  it('one query serves every subscriber and follows writes', async () => {
    useDatabase(`snapshot-${Date.now()}-${n++}`)
    const names = liveSnapshot('test projects', async () => (await db.projects.toArray()).map((p) => p.name).sort())
    let calls = 0
    const stopA = names.subscribe(() => calls++)
    const stopB = names.subscribe(() => undefined)
    await until(() => names.read() !== undefined)
    expect(names.read()).toEqual([])
    await createProject({ name: 'Home' })
    await until(() => names.read()?.length === 1)
    expect(names.read()).toEqual(['Home'])
    expect(Object.isFrozen(names.read())).toBe(true)
    expect(calls).toBeGreaterThanOrEqual(2)
    stopA()
    stopB()
    expect(names.read()).toBeUndefined()
  })

  it('keeps following the database after it is deleted and opened again', async () => {
    useDatabase(`snapshot-${Date.now()}-${n++}`)
    const names = liveSnapshot('test projects', async () => (await db.projects.toArray()).map((p) => p.name))
    const stop = names.subscribe(() => undefined)
    await createProject({ name: 'Before' })
    await until(() => names.read()?.length === 1)
    await db.delete()
    await db.open()
    await createProject({ name: 'After' })
    await until(() => names.read()?.[0] === 'After')
    stop()
  })

  it('restarts on a new database instance', async () => {
    useDatabase(`snapshot-${Date.now()}-${n++}`)
    const names = liveSnapshot('test projects', async () => (await db.projects.toArray()).map((p) => p.name))
    const stop = names.subscribe(() => undefined)
    await createProject({ name: 'First' })
    await until(() => names.read()?.length === 1)
    stop()
    useDatabase(`snapshot-${Date.now()}-${n++}`)
    const stop2 = names.subscribe(() => undefined)
    await until(() => names.read() !== undefined)
    expect(names.read()).toEqual([])
    stop2()
  })
})

describe('derived', () => {
  it('computes once per source object', () => {
    let runs = 0
    const count = derived((xs: number[]) => { runs++; return xs.length })
    const a = [1, 2]
    expect(count(a)).toBe(2)
    expect(count(a)).toBe(2)
    expect(count([1])).toBe(1)
    expect(runs).toBe(2)
  })
})
