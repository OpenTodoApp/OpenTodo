import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hlcLast, hlcNow, hlcOffset, hlcSeedOffset } from './hlc'
import { resetModuleState, resettable, resettableNames } from './moduleState'
import { syncSnapshot } from './sync'

describe('module state reset (T1)', () => {
  it('runs every registered reset', () => {
    let calls = 0
    resettable('test-counter', () => { calls++ })
    resetModuleState()
    resetModuleState()
    expect(calls).toBe(2)
  })

  it('the shared setup gives every test a fresh clock and sync status (first half)', () => {
    hlcSeedOffset(12_345)
    hlcNow()
    expect(hlcOffset()).toBe(12_345)
  })

  it('the shared setup gives every test a fresh clock and sync status (second half)', () => {
    expect(hlcOffset()).toBe(0)
    expect(hlcLast()).toBe(0)
    expect(syncSnapshot()).toMatchObject({ state: 'idle', pending: 0, rejected: null })
    expect(resettableNames()).toEqual(expect.arrayContaining(['hlc', 'sync', 'deviceId']))
  })
})

// Module-level `let` outside tests: each such file either registers a reset with
// resettable() or is counted here. The count may only go down; a new stateful
// module registers its reset instead (improvement plan T1).
const UNREGISTERED_CEILING = 49

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    if (statSync(file).isDirectory()) return sources(file)
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories|testkit)\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [file] : []
  })
}

describe('stateful modules', () => {
  it('register a reset, or the unregistered count does not grow', () => {
    const root = path.resolve(process.cwd(), 'src')
    const unregistered = sources(root).filter((file) => {
      const text = readFileSync(file, 'utf8')
      return /^let /m.test(text) && !/\bresettable\(/.test(text)
    }).map((f) => path.relative(root, f))
    expect(unregistered.length, `files with module-level let and no resettable():\n${unregistered.join('\n')}`).toBeLessThanOrEqual(UNREGISTERED_CEILING)
  })
})
