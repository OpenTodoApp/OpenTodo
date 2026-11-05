// @vitest-environment happy-dom
// Whether rules can be made here (section-rule-and-sub-projects D2): read from
// /me, remembered on the device, kept when offline, off until known.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockFetch } from '../../ui/test-utils'
import { automationsOn as current, refreshAutomationsOn, setAutomationsOn } from './automationsOn'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('automations on', () => {
  it('remembers what the server says', async () => {
    mockFetch((m, path) => (m === 'GET' && path === '/api/v1/me' ? { user: { id: 'u1' }, automations: { enabled: false, paused: false } } : undefined))
    setAutomationsOn(true)
    await refreshAutomationsOn()
    expect(current()).toBe(false)
  })

  it('keeps the last answer when the server cannot be reached', async () => {
    setAutomationsOn(true)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await refreshAutomationsOn()
    expect(current()).toBe(true)
  })
})
