// @vitest-environment happy-dom
// The plugin enable/disable list (OpenSpec change plugin-section, plugins "Enable
// and disable state", design D3): the CSV reader, the toggle through the op log,
// and the id of a newer build, which is ignored but never rewritten.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { applyOps, resetDeviceId } from './ops'
import { readDisabledPlugins, setPluginEnabled } from './plugins'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

describe('readDisabledPlugins', () => {
  it('reads a missing or empty field as every plugin on', () => {
    expect([...readDisabledPlugins(null)]).toEqual([])
    expect([...readDisabledPlugins({})]).toEqual([])
    expect([...readDisabledPlugins({ disabled_plugins: '' })]).toEqual([])
  })

  it('reads the comma-separated ids, including ids this build does not ship', () => {
    expect([...readDisabledPlugins({ disabled_plugins: 'daily-digest,from-the-future' })].sort()).toEqual(['daily-digest', 'from-the-future'])
  })
})

describe('setPluginEnabled', () => {
  it('turns a plugin off and on through the op log, keeping ids this build does not ship', async () => {
    await setPluginEnabled('daily-digest', false)
    expect((await db.userPrefs.get('me'))?.disabled_plugins).toBe('daily-digest')
    await expect(db.outbox.count()).resolves.toBe(1)
    // A list from another device or a newer build arrives as one last-writer-wins value, unknown id included.
    await applyOps([{ id: 'x1', entity: 'user_prefs', entityId: 'me', field: 'disabled_plugins', value: 'from-the-future', ts: Date.now(), device: 'phone' }] as never)
    expect((await db.userPrefs.get('me'))?.disabled_plugins).toBe('from-the-future')
    // Toggling one plugin keeps every other id, including the one this build does not ship.
    await setPluginEnabled('other-plugin', false)
    const off = (await db.userPrefs.get('me'))?.disabled_plugins ?? ''
    expect(new Set(off.split(','))).toEqual(new Set(['from-the-future', 'other-plugin']))
    // Enabling a plugin that is not in the list changes nothing at all.
    await setPluginEnabled('daily-digest', true)
    expect((await db.userPrefs.get('me'))?.disabled_plugins).toBe(off)
    await setPluginEnabled('other-plugin', true)
    expect((await db.userPrefs.get('me'))?.disabled_plugins).toBe('from-the-future')
  })
})
