// @vitest-environment happy-dom
// Density (OpenSpec change ux-overhaul, appearance-preferences "Density
// preference"): a synced additive preference applied as an attribute, which the
// stylesheet turns into 36 px rows on fine pointers while coarse pointers keep
// 44 px targets.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyAppearance, readAppearance, setAppearance } from '../lib/appearance'
import { db } from '../lib/db'
import { applyOps, resetDeviceId } from '../lib/ops'
import { click, flush, render } from '../ui/test-utils'
import { AppearanceProvider } from './AppearanceProvider'
import { AppearanceSection } from './AppearanceSection'
import css from '../index.css?raw'
import row from './TaskRow.tsx?raw'

const root = () => document.documentElement

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  root().removeAttribute('data-density')
})
afterEach(() => { document.body.innerHTML = ''; root().removeAttribute('data-density') })

describe('preference', () => {
  it('reads compact, treats an unknown value as comfortable and leaves the stored value alone', async () => {
    expect(readAppearance({ density: 'compact' } as never).density).toBe('compact')
    expect(readAppearance({ density: 'cosy' } as never).density).toBe('comfortable')
    expect(readAppearance(null).density).toBe('comfortable')
    await applyOps([{ id: 'd1', entity: 'user_prefs', entityId: 'me', field: 'density', value: 'cosy', ts: Date.now(), device: 'phone' }] as never)
    expect((await db.userPrefs.get('me'))?.density).toBe('cosy')
    expect(await db.outbox.count()).toBe(0)
  })

  it('is written as one op and applied as data-density on the root', async () => {
    await setAppearance('density', 'compact')
    expect((await db.outbox.toArray()).map((o) => `${o.field}=${o.value}`)).toEqual(['density=compact'])
    applyAppearance({ mode: 'system', accent: 'emerald', density: 'compact' })
    expect(root().getAttribute('data-density')).toBe('compact')
    applyAppearance({ mode: 'system', accent: 'emerald', density: 'comfortable' })
    expect(root().hasAttribute('data-density')).toBe(false)
  })

  it('the stylesheet tightens rows under compact and keeps touch targets on coarse pointers', () => {
    expect(css).toMatch(/\.row-pad \{ padding-block: 0\.5rem; \}/)
    expect(css).toMatch(/:root\[data-density="compact"\] \.row-pad \{ padding-block: 0\.25rem; \}/)
    expect(css).toMatch(/:root\[data-density="compact"\] \[data-sidebar-item\] \{ min-height: 2rem/)
    expect(css).toMatch(/:root\[data-density="compact"\] \[data-group-header\] \{ min-height: 2rem; \}/)
    const coarse = css.slice(css.indexOf('@media (pointer: coarse) {\n  :root[data-density="compact"]'))
    expect(coarse).toMatch(/\.row-pad \{ padding-block: 0\.5rem; \}/)
    expect(coarse).toMatch(/\[data-sidebar-item\] \{ min-height: 2\.75rem; \}/)
    // Task rows take their padding from the density class, not a fixed utility.
    expect(row).toMatch(/rounded-md px-2 row-pad/)
  })
})

describe('Appearance → Density', () => {
  it('Compact applies at once on this device and arrives on another device through sync', async () => {
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await flush(30)
    const option = (label: string) => [...document.querySelectorAll('[data-testid="appearance-density"] [role="radio"]')].find((b) => b.textContent === label)!
    expect(option('Comfortable').getAttribute('aria-checked')).toBe('true')
    await click(option('Compact'))
    await flush(40)
    expect(option('Compact').getAttribute('aria-checked')).toBe('true')
    expect(root().getAttribute('data-density')).toBe('compact')
    // The other device: the op arrives by sync and the root follows without any local write.
    await applyOps([{ id: 'd2', entity: 'user_prefs', entityId: 'me', field: 'density', value: 'comfortable', ts: Date.now() + 1000, device: 'tablet' }] as never)
    await flush(40)
    expect(root().hasAttribute('data-density')).toBe(false)
    expect(option('Comfortable').getAttribute('aria-checked')).toBe('true')
    await r.unmount()
  })
})
