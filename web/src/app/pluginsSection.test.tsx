// @vitest-environment happy-dom
// Settings → Plugins (OpenSpec change plugin-section, plugins "The Plugins
// settings section"): every registered plugin with its one-line description and
// a switch, off state read from the synced list, and a toggle written through
// the operation log (design D3).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { applyOps, resetDeviceId } from '../lib/ops'
import { click, render, waitFor } from '../ui/test-utils'
import { PLUGINS } from '../plugins/registry'
import { PluginsSection } from './PluginsSection'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

describe('the Plugins section', () => {
  it('lists every registered plugin with its switch on, except the disabled ones', async () => {
    await applyOps([{ id: 'x1', entity: 'user_prefs', entityId: 'me', field: 'disabled_plugins', value: 'daily-digest', ts: Date.now(), device: 'phone' }] as never)
    const r = await render(<PluginsSection />)
    const rows = [...document.querySelectorAll('[data-setting-row^="plugin-"]')]
    expect(rows.map((row) => row.getAttribute('data-setting-row'))).toEqual(PLUGINS.map((p) => `plugin-${p.id}`))
    for (const p of PLUGINS) {
      const row = document.querySelector(`[data-setting-row="plugin-${p.id}"]`)!
      expect(row.textContent).toContain(p.name)
      expect(row.textContent).toContain(p.description)
    }
    await waitFor(() => document.querySelector('#plugin-daily-digest-switch')?.getAttribute('aria-checked') === 'false', 'the disabled switch')
    await r.unmount()
  })

  it('flipping a switch writes the synced list through the op log', async () => {
    const r = await render(<PluginsSection />)
    const sw = () => document.querySelector<HTMLButtonElement>('#plugin-daily-digest-switch')!
    await waitFor(() => sw().getAttribute('aria-checked') === 'true', 'the switch on')
    await click(sw())
    await waitFor(async () => (await db.userPrefs.get('me'))?.disabled_plugins === 'daily-digest', 'the switch stored')
    await waitFor(() => sw().getAttribute('aria-checked') === 'false', 'the switch off')
    await click(sw())
    await waitFor(async () => (await db.userPrefs.get('me'))?.disabled_plugins === '', 'the switch cleared')
    await waitFor(() => sw().getAttribute('aria-checked') === 'true', 'the switch on again')
    await r.unmount()
  })
})
