// @vitest-environment happy-dom
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from '../ui/test-utils'
import { resetModuleState, resettableNames } from './moduleState'
import { createSignal, createStore } from './store'

describe('createStore', () => {
  it('notifies on a new value only, and updates from the current one', () => {
    const s = createStore('test-store-notify', 1)
    let calls = 0
    const off = s.subscribe(() => { calls++ })
    s.set(1)
    expect(calls).toBe(0)
    s.set(2)
    s.update((n) => n + 1)
    expect(s.get()).toBe(3)
    expect(calls).toBe(2)
    off()
    s.set(4)
    expect(calls).toBe(2)
  })

  it('registers its reset under its name', () => {
    const s = createStore('test-store-reset', 'a')
    s.set('b')
    expect(resettableNames()).toContain('test-store-reset')
    resetModuleState()
    expect(s.get()).toBe('a')
  })

  it('re-renders a component that uses it', async () => {
    const s = createStore('test-store-use', 'first')
    function Probe() {
      return <span>{s.use()}</span>
    }
    const { container } = await render(<Probe />)
    expect(container.textContent).toBe('first')
    await act(async () => s.set('second'))
    expect(container.textContent).toBe('second')
  })
})

describe('createSignal', () => {
  it('lets a listener unsubscribe while it runs', () => {
    const sig = createSignal()
    const seen: string[] = []
    const off = sig.subscribe(() => { seen.push('a'); off() })
    sig.subscribe(() => seen.push('b'))
    sig.notify()
    sig.notify()
    expect(seen).toEqual(['a', 'b', 'b'])
  })
})

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    if (statSync(file).isDirectory()) return sources(file)
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories|testkit)\.tsx?$/.test(name) ? [file] : []
  })
}

describe('store names', () => {
  it('are unique across the app, so no reset replaces another', () => {
    const names = sources(path.resolve(process.cwd(), 'src')).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/\b(?:create(?:Persisted)?Store(?:<[^(]*>)?|resettable)\('([^']+)'/g)].map((m) => m[1]))
    const repeated = names.filter((n, i) => names.indexOf(n) !== i)
    expect(repeated).toEqual([])
    expect(names.length).toBeGreaterThan(20)
  })
})
