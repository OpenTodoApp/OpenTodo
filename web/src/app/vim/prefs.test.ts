import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearVimPref, isVimEnabled, setVimEnabled, subscribeVim, VIM_KEY } from './prefs'

// Vitest runs in node: give the module a Storage-shaped stand-in.
class MemoryStorage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.get(k) ?? null }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  removeItem(k: string) { this.m.delete(k) }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
}

const g = globalThis as { localStorage?: Storage }
let saved: Storage | undefined
beforeEach(() => {
  saved = g.localStorage
  g.localStorage = new MemoryStorage() as unknown as Storage
})
afterEach(() => {
  g.localStorage = saved
})

describe('vim preference', () => {
  it('defaults to off', () => {
    expect(isVimEnabled()).toBe(false)
  })

  it('toggle notifies subscribers', () => {
    let calls = 0
    const off = subscribeVim(() => calls++)
    setVimEnabled(true)
    expect(isVimEnabled()).toBe(true)
    expect(g.localStorage?.getItem(VIM_KEY)).toBe('1')
    setVimEnabled(false)
    expect(isVimEnabled()).toBe(false)
    expect(calls).toBe(2)
    off()
    setVimEnabled(true)
    expect(calls).toBe(2)
  })

  it('sign-out clears it', () => {
    setVimEnabled(true)
    clearVimPref()
    expect(isVimEnabled()).toBe(false)
    expect(g.localStorage?.getItem(VIM_KEY)).toBeNull()
  })

  it('is off when storage is unavailable', () => {
    g.localStorage = undefined
    expect(isVimEnabled()).toBe(false)
    expect(() => setVimEnabled(true)).not.toThrow()
  })
})
