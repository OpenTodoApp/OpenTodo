// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetModuleState } from './moduleState'
import { createPersistedStore, createStoredValue, readEnum, readJSON, readString, removeItem, writeJSON, writeString } from './deviceStorage'

// A storage that refuses everything (blocked by privacy settings, or full).
const refusing = {
  getItem: () => { throw new Error('blocked') },
  setItem: () => { throw new Error('quota') },
  removeItem: () => { throw new Error('blocked') },
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})

describe('device storage', () => {
  it('reads and writes text, JSON and enums in either area', () => {
    expect(writeString('t.a', 'x')).toBe(true)
    expect(readString('t.a')).toBe('x')
    writeString('t.a', null)
    expect(readString('t.a')).toBeNull()
    writeString('t.s', 'y', 'session')
    expect(readString('t.s', 'session')).toBe('y')
    expect(readString('t.s')).toBeNull()
    removeItem('t.s', 'session')
    expect(readString('t.s', 'session')).toBeNull()

    writeJSON('t.j', { n: 1 })
    expect(readJSON('t.j', null)).toEqual({ n: 1 })
    expect(readJSON('t.j', 0, (v) => ((v as { n?: unknown }).n === 1 ? 7 : null))).toBe(7)
    expect(readJSON('t.j', 0, () => null)).toBe(0)
    writeString('t.j', '{not json')
    expect(readJSON('t.j', 'fallback')).toBe('fallback')

    writeString('t.e', 'week')
    expect(readEnum('t.e', ['day', 'week'] as const, 'day')).toBe('week')
    writeString('t.e', 'year')
    expect(readEnum('t.e', ['day', 'week'] as const, 'day')).toBe('day')
  })

  it('never throws when storage refuses', () => {
    vi.stubGlobal('localStorage', refusing)
    expect(readString('t.x')).toBeNull()
    expect(readJSON('t.x', 5)).toBe(5)
    expect(writeString('t.x', 'v')).toBe(false)
    expect(writeJSON('t.x', { a: 1 })).toBe(false)
    expect(() => removeItem('t.x')).not.toThrow()
  })
})

describe('createPersistedStore', () => {
  it('writes through, keeps a refused value in memory, and the test reset clears the key', () => {
    const s = createPersistedStore('test-persisted', 't.p', { parse: (raw) => raw ?? 'none', serialize: (v) => (v === 'none' ? null : v) })
    s.set('one')
    expect(readString('t.p')).toBe('one')
    vi.stubGlobal('localStorage', refusing)
    s.set('two')
    expect(s.get()).toBe('two')
    vi.unstubAllGlobals()
    resetModuleState()
    expect(s.get()).toBe('none')
    expect(readString('t.p')).toBeNull()
  })
})

describe('createStoredValue', () => {
  it('reads storage each time, keeps a stable snapshot per stored text, and follows other tabs', () => {
    const v = createStoredValue('t.v', { parse: (raw) => ({ on: raw === '1' }), serialize: (x) => (x.on ? '1' : null) }, { crossTab: true })
    const first = v.get()
    expect(v.get()).toBe(first)
    let calls = 0
    const off = v.subscribe(() => { calls++ })
    v.set({ on: true })
    expect(v.get().on).toBe(true)
    expect(calls).toBe(1)
    localStorage.setItem('t.v', '') // another tab wrote it
    window.dispatchEvent(new StorageEvent('storage', { key: 't.v' }))
    expect(calls).toBe(2)
    expect(v.get().on).toBe(false)
    off()
  })
})
