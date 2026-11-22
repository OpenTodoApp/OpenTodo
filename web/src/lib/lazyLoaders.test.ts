// lazy-retry-online: a loader that keeps its chunk forgets a failed load, so the next
// call fetches again (the template library stands for the five such loaders).
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ fail: true, calls: 0 }))
vi.mock('../generated/templates.json', () => {
  state.calls++
  if (state.fail) throw new TypeError('Failed to fetch dynamically imported module: /assets/templates.js')
  return { default: { schema: 1, templates: [] } }
})

describe('a loader that keeps its chunk', () => {
  it('forgets a failed load and loads on the next call', async () => {
    const { loadLibrary } = await import('./templateLibrary')
    await expect(loadLibrary()).rejects.toThrow()
    state.fail = false
    // The same module: before, the rejected promise was kept and returned forever.
    await expect(loadLibrary()).resolves.toEqual({ schema: 1, templates: [] })
    expect(state.calls).toBe(2)
  })
})
