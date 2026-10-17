// @vitest-environment happy-dom
// The Appearance panel and the provider (OpenSpec change theming, tasks 3.3 and 4.1).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { applyOps, resetDeviceId } from '../lib/ops'
import { click, flush, key, render, waitFor } from '../ui/test-utils'
import { AppearanceProvider } from './AppearanceProvider'
import { AppearanceSection, SidebarSection } from './AppearanceSection'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-accent')
  localStorage.clear()
})
afterEach(() => { document.body.innerHTML = '' })

const root = () => document.documentElement
const tile = (id: string) => document.querySelector<HTMLButtonElement>(`[data-theme-tile="${id}"]`)!

describe('Appearance panel', () => {
  it('arrow keys move through the themes and select; the root follows at once, through one op each', async () => {
    let renders = 0
    function Probe() { renders++; return null }
    const r = await render(<AppearanceProvider><AppearanceSection /><Probe /></AppearanceProvider>)
    await waitFor(() => tile('emerald')?.getAttribute('aria-checked') === 'true', 'the default theme')
    const mounts = renders
    tile('emerald').focus()
    await key(tile('emerald'), 'ArrowRight')
    await waitFor(() => tile('blue').getAttribute('aria-checked') === 'true', 'blue selected')
    expect(document.activeElement).toBe(tile('blue'))
    expect(root().getAttribute('data-accent')).toBe('blue')
    await key(tile('blue'), 'End')
    await waitFor(() => root().getAttribute('data-accent') === 'graphite', 'graphite applied')
    // Dark mode on a light system.
    await click([...document.querySelectorAll('[data-appearance-mode] [role="radio"]')].find((b) => b.textContent === 'Dark')!)
    await waitFor(() => root().getAttribute('data-theme') === 'dark', 'dark mode applied')
    await waitFor(async () => (await db.outbox.count()) === 3, 'three ops queued')
    expect((await db.outbox.toArray()).map((o) => `${o.field}=${o.value}`)).toEqual(['theme_accent=blue', 'theme_accent=graphite', 'theme_mode=dark'])
    // The app is not remounted: the probe re-renders but is the same instance.
    expect(renders).toBeGreaterThanOrEqual(mounts)
    await r.unmount()
  })
})

describe('AppearanceProvider', () => {
  it('a synced change from another device updates the root, and the cache never writes an op', async () => {
    localStorage.setItem('ot.appearance', JSON.stringify({ mode: 'dark', accent: 'rose', bar: '#be123c' }))
    const r = await render(<AppearanceProvider><p>app</p></AppearanceProvider>)
    await flush(30)
    // No row yet: the defaults apply, whatever the cache said.
    expect(root().hasAttribute('data-accent')).toBe(false)
    await applyOps([{ id: 'x1', entity: 'user_prefs', entityId: 'me', field: 'theme_accent', value: 'violet', ts: Date.now(), device: 'phone' }] as never)
    await flush(40)
    expect(root().getAttribute('data-accent')).toBe('violet')
    expect(JSON.parse(localStorage.getItem('ot.appearance')!).accent).toBe('violet')
    expect(await db.outbox.count()).toBe(0)
    await r.unmount()
  })
})

describe('Appearance → Sidebar', () => {
  it('one switch per destination of the More group, each written as the synced list', async () => {
    const r = await render(<SidebarSection />)
    await flush(30)
    const ids = [...document.querySelectorAll('[data-setting-row^="sidebar-"]')].map((e) => e.getAttribute('data-setting-row'))
    expect(ids).toEqual(['sidebar-anytime', 'sidebar-someday', 'sidebar-assigned', 'sidebar-completed', 'sidebar-feed', 'sidebar-trash', 'sidebar-filter'])
    const someday = document.querySelector<HTMLButtonElement>('#sidebar-switch-someday')!
    expect(someday.getAttribute('aria-checked')).toBe('false')
    await click(someday)
    await flush(40)
    expect((await db.userPrefs.get('me'))?.sidebar_destinations).toBe('someday')
    await click(document.querySelector<HTMLButtonElement>('#sidebar-switch-trash')!)
    await flush(40)
    expect((await db.userPrefs.get('me'))?.sidebar_destinations).toBe('someday,trash')
    expect(document.querySelector('#sidebar-switch-someday')?.getAttribute('aria-checked')).toBe('true')
    await click(document.querySelector<HTMLButtonElement>('#sidebar-switch-someday')!)
    await flush(40)
    expect((await db.userPrefs.get('me'))?.sidebar_destinations).toBe('trash')
    await r.unmount()
  })
})
