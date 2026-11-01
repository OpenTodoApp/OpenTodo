// @vitest-environment happy-dom
// The instance themes on the device (theme-instance-default D3, task 2.1): read
// when the version moves, remembered for offline use, never read for the same version.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const instanceThemes = vi.fn()
vi.mock('../api', () => ({ api: { instanceThemes: () => instanceThemes() } }))

import { getInstanceThemes, INSTANCE_THEMES_KEY, instanceTheme, parseInstanceThemes, setInstanceThemes } from './choice'
import { refreshInstanceThemes } from './instanceSync'

const doc = (kind: 'light' | 'dark') => ({ opentodoTheme: 1, id: 'whatever', name: 'House', author: 'Owner', licence: 'MIT', kind, seeds: { canvas: '#202020', surface: '#2a2a2a', text: '#eeeeee', accent: '#4c8bf5' } })
const answer = (version: number) => ({ version, default: { light: '', dark: 'instance:house1' }, themes: [{ id: 'house1', kind: 'dark', doc: doc('dark') }] })

beforeEach(() => {
  instanceThemes.mockReset()
  localStorage.clear()
  setInstanceThemes({ version: 0, default: { light: '', dark: '' }, themes: [] })
})

describe('instance themes on the device', () => {
  it('reads them when the version moves and remembers them on the device', async () => {
    instanceThemes.mockResolvedValue(answer(3))
    await refreshInstanceThemes(3)
    expect(instanceThemes).toHaveBeenCalledTimes(1)
    expect(getInstanceThemes().default.dark).toBe('instance:house1')
    // The document carries the server id.
    expect(instanceTheme('house1', 'dark')?.doc.id).toBe('house1')
    expect(instanceTheme('house1', 'light')).toBeNull()
    expect(JSON.parse(localStorage.getItem(INSTANCE_THEMES_KEY)!).version).toBe(3)
  })

  it('does not read them again for the same version, nor without one (an older server)', async () => {
    setInstanceThemes(answer(3))
    await refreshInstanceThemes(3)
    await refreshInstanceThemes(undefined)
    expect(instanceThemes).not.toHaveBeenCalled()
  })

  it('reads them again on a newer version, and keeps the remembered copy offline', async () => {
    setInstanceThemes(answer(3))
    instanceThemes.mockRejectedValue(new Error('offline'))
    await refreshInstanceThemes(4)
    expect(getInstanceThemes().version).toBe(3)
    expect(getInstanceThemes().themes).toHaveLength(1)
    instanceThemes.mockResolvedValue({ version: 4, default: { light: '', dark: '' }, themes: [] })
    await refreshInstanceThemes(4)
    expect(getInstanceThemes()).toEqual({ version: 4, default: { light: '', dark: '' }, themes: [] })
  })

  it('drops malformed entries', () => {
    expect(parseInstanceThemes(null)).toBeNull()
    expect(parseInstanceThemes({ themes: [] })).toBeNull()
    const p = parseInstanceThemes({ version: 1, default: { dark: 5 }, themes: [{ id: 'BAD!', kind: 'dark', doc: doc('dark') }, { id: 'ok', kind: 'light', doc: doc('dark') }, { id: 'fine', kind: 'light', doc: doc('light') }] })!
    expect(p.default).toEqual({ light: '', dark: '' })
    expect(p.themes.map((x) => x.id)).toEqual(['fine'])
  })
})
