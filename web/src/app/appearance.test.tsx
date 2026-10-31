// @vitest-environment happy-dom
// The Appearance panel and the provider (OpenSpec change theming, tasks 3.3 and 4.1).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { applyOps, resetDeviceId } from '../lib/ops'
import { setPromoted } from '../lib/appearance'
import { setMethodMode } from '../lib/method/mode'
import { click, flush, key, render, type, waitFor } from '../ui/test-utils'
import { AppearanceProvider } from './AppearanceProvider'
import { AppearanceSection, SidebarSection } from './AppearanceSection'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-accent')
  document.documentElement.removeAttribute('style')
  localStorage.clear()
})

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
    // End reaches the Custom tile last; with no colour stored it only takes focus (accent-colour D5).
    await key(tile('blue'), 'End')
    expect(document.activeElement).toBe(tile('custom'))
    await key(tile('custom'), 'ArrowLeft')
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

// accent-colour task 4.2: the Custom tile and its picker.
describe('Custom accent', () => {
  const picker = () => document.querySelector<HTMLElement>('[data-accent-picker]')
  const swatch = (hex: string) => document.querySelector<HTMLButtonElement>(`[data-swatch="${hex}"]`)!
  const hexField = () => document.querySelector<HTMLInputElement>('[data-accent-hex]')!
  const fields = async () => (await db.outbox.toArray()).map((o) => `${o.field}=${o.value}`)

  it('by keyboard: the tile opens the picker, arrows move through the swatches, Space picks one batch, Escape returns to the tile', async () => {
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(() => !!tile('custom'), 'the Custom tile')
    expect(tile('custom').textContent).toContain('Choose a colour')
    // From Graphite, the arrow moves onto Custom without selecting it (no colour yet).
    await click(tile('graphite'))
    await waitFor(() => tile('graphite').getAttribute('aria-checked') === 'true', 'graphite')
    await key(tile('graphite'), 'ArrowRight')
    expect(document.activeElement).toBe(tile('custom'))
    expect(tile('custom').getAttribute('aria-checked')).toBe('false')
    // Enter on a button activates it.
    await click(tile('custom'))
    await waitFor(() => !!picker()?.querySelector('[role="radio"]'), 'the picker loaded')
    const first = picker()!.querySelector<HTMLButtonElement>('[role="radio"]')!
    first.focus()
    await key(first, 'ArrowRight')
    const second = document.activeElement as HTMLButtonElement
    expect(second.getAttribute('data-swatch')).toBe('#ad4400')
    await key(second, 'ArrowDown')
    expect((document.activeElement as HTMLElement).getAttribute('data-swatch')).toBe('#962d00')
    expect(await db.outbox.count()).toBe(1) // only graphite: moving picks nothing
    // Space on a button activates it.
    await click(document.activeElement!)
    await waitFor(() => swatch('#962d00').getAttribute('aria-checked') === 'true', 'announced as selected')
    await waitFor(async () => (await db.outbox.count()) === 3, 'the batch')
    const ops = await db.outbox.toArray()
    expect(ops.slice(1).map((o) => `${o.field}=${o.value}`)).toEqual(['theme_accent=custom', 'theme_accent_custom=#962d00'])
    expect(ops[1].ts).toBe(ops[2].ts)
    await waitFor(() => root().getAttribute('data-accent') === 'custom', 'applied at once')
    expect(root().style.getPropertyValue('--ot-al-accent')).toBe('#962d00')
    expect(tile('custom').getAttribute('aria-checked')).toBe('true')
    expect(tile('custom').textContent).toContain('#962d00')
    await key(document, 'Escape')
    await waitFor(() => !picker(), 'closed')
    expect(document.activeElement).toBe(tile('custom'))
    await r.unmount()
  })

  it('a typed hex commits on Enter; an invalid one shows an error and writes nothing; a theme keeps the colour', async () => {
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(() => !!tile('custom'), 'the Custom tile')
    await click(tile('custom'))
    await waitFor(() => !!hexField(), 'the picker loaded')
    await type(hexField(), 'nope')
    await key(hexField(), 'Enter')
    await waitFor(() => !!picker()?.textContent?.includes('#rrggbb'), 'the inline error')
    expect(await db.outbox.count()).toBe(0)
    await type(hexField(), 'FFE066')
    // The preview follows while typing, without writing; the adjustment is named.
    await waitFor(() => !!picker()?.querySelector('[data-accent-adjusted]'), 'the adjusted note')
    expect(picker()!.querySelector('[data-accent-adjusted]')!.textContent).toContain('Adjusted for contrast')
    expect(await db.outbox.count()).toBe(0)
    await key(hexField(), 'Enter')
    await waitFor(async () => (await fields()).includes('theme_accent_custom=#ffe066'), 'written')
    await click(picker()!.querySelector<HTMLButtonElement>('.ui-btn--primary')!)
    await waitFor(() => !picker(), 'Done closes')
    // Teal, then Custom again: the colour was never cleared.
    await click(tile('teal'))
    await waitFor(() => root().getAttribute('data-accent') === 'teal', 'teal')
    expect(root().style.getPropertyValue('--ot-al-accent')).toBe('')
    expect((await db.userPrefs.get('me'))?.theme_accent_custom).toBe('#ffe066')
    await click(tile('custom'))
    await waitFor(() => root().getAttribute('data-accent') === 'custom', 'custom again')
    expect((await fields()).slice(-1)).toEqual(['theme_accent=custom'])
    await r.unmount()
  })
})

describe('AppearanceProvider', () => {
  it('a custom colour synced from another device applies without a reload and is cached for the first frame', async () => {
    const r = await render(<AppearanceProvider><p>app</p></AppearanceProvider>)
    const ts = Date.now()
    await applyOps([
      { id: 'c1', entity: 'user_prefs', entityId: 'me', field: 'theme_accent', value: 'custom', ts, device: 'phone' },
      { id: 'c2', entity: 'user_prefs', entityId: 'me', field: 'theme_accent_custom', value: '#1f6feb', ts, device: 'phone' },
    ] as never)
    await waitFor(() => root().getAttribute('data-accent') === 'custom', 'the synced custom accent')
    expect(root().style.getPropertyValue('--ot-al-accent')).toBe('#1567e2')
    expect(JSON.parse(localStorage.getItem('ot.appearance')!)).toMatchObject({ accent: 'custom', bar: '#1567e2', custom: { input: '#1f6feb', light: '#1567e2' } })
    expect(await db.outbox.count()).toBe(0)
    await r.unmount()
  })

  it('a synced change from another device updates the root, and the cache never writes an op', async () => {
    localStorage.setItem('ot.appearance', JSON.stringify({ mode: 'dark', accent: 'rose', bar: '#be123c' }))
    const r = await render(<AppearanceProvider><p>app</p></AppearanceProvider>)
    await waitFor(() => !root().hasAttribute('data-accent'), 'the defaults')
    // No row yet: the defaults apply, whatever the cache said.
    expect(root().hasAttribute('data-accent')).toBe(false)
    await applyOps([{ id: 'x1', entity: 'user_prefs', entityId: 'me', field: 'theme_accent', value: 'violet', ts: Date.now(), device: 'phone' }] as never)
    await waitFor(() => root().getAttribute('data-accent') === 'violet', 'the synced accent')
    expect(root().getAttribute('data-accent')).toBe('violet')
    expect(JSON.parse(localStorage.getItem('ot.appearance')!).accent).toBe('violet')
    expect(await db.outbox.count()).toBe(0)
    await r.unmount()
  })
})

describe('Appearance → Sidebar', () => {
  it('one switch per destination of the More group, each written as the synced list', async () => {
    const r = await render(<SidebarSection />)
    await waitFor(() => document.querySelectorAll('[data-destination-row] [role="switch"]').length === 12, 'the switches')
    const ids = [...document.querySelectorAll('[data-destination-row]')].map((e) => e.getAttribute('data-destination-row'))
    expect(ids).toEqual(['inbox', 'today', 'upcoming', 'calendar', 'loop', 'next', 'waiting', 'anytime', 'someday', 'assigned', 'completed', 'feed', 'trash', 'filter', 'focus', 'notes'])
    // The fixed four have no switch; the promotable ones keep their setting row ids for links.
    expect(document.querySelector('[data-destination-row="inbox"] [role="switch"]')).toBeNull()
    expect(document.querySelector('[data-setting-row="sidebar-someday"]')?.getAttribute('data-destination-row')).toBe('someday')
    const someday = document.querySelector<HTMLButtonElement>('#sidebar-switch-someday')!
    expect(someday.getAttribute('aria-checked')).toBe('false')
    await click(someday)
    await waitFor(async () => (await db.userPrefs.get('me'))?.sidebar_destinations === 'someday', 'someday stored')
    expect((await db.userPrefs.get('me'))?.sidebar_destinations).toBe('someday')
    await click(document.querySelector<HTMLButtonElement>('#sidebar-switch-trash')!)
    await waitFor(async () => (await db.userPrefs.get('me'))?.sidebar_destinations === 'someday,trash' && document.querySelector('#sidebar-switch-someday')?.getAttribute('aria-checked') === 'true', 'trash stored')
    expect((await db.userPrefs.get('me'))?.sidebar_destinations).toBe('someday,trash')
    expect(document.querySelector('#sidebar-switch-someday')?.getAttribute('aria-checked')).toBe('true')
    await click(document.querySelector<HTMLButtonElement>('#sidebar-switch-someday')!)
    await waitFor(async () => (await db.userPrefs.get('me'))?.sidebar_destinations === 'trash', 'someday removed')
    expect((await db.userPrefs.get('me'))?.sidebar_destinations).toBe('trash')
    await r.unmount()
  })
})

describe('Appearance → Sidebar counts and destination order (sidebar-polish 2.1, 3.3)', () => {
  const rows = () => [...document.querySelectorAll('[data-destination-row]')].map((e) => e.getAttribute('data-destination-row'))
  const handle = (id: string) => document.querySelector<HTMLButtonElement>(`[data-destination-row="${id}"] [data-destination-handle]`)!

  it('Default: "Inbox and Today" is selected; choosing "Every list" writes the synced preference', async () => {
    const r = await render(<SidebarSection />)
    const option = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('[data-testid="sidebar-counts"] [role="radio"]')].find((b) => b.textContent === name)!
    await waitFor(() => !!option('Inbox and Today'), 'the counts choice')
    expect(option('Inbox and Today').getAttribute('aria-checked')).toBe('true')
    await click(option('Every list'))
    await waitFor(async () => (await db.userPrefs.get('me'))?.sidebar_counts === 'all', 'stored')
    await waitFor(() => option('Every list').getAttribute('aria-checked') === 'true', 'selected')
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => [o.entity, o.field, o.value])).toEqual([['user_prefs', 'sidebar_counts', 'all']])
    await r.unmount()
  })

  it('Keyboard: Alt+↑ twice on Calendar moves it above Today and Upcoming, announced, focus kept on its handle', async () => {
    const r = await render(<SidebarSection />)
    await waitFor(() => !!handle('calendar'), 'the list')
    handle('calendar').focus()
    await key(handle('calendar'), 'ArrowUp', { altKey: true })
    await waitFor(() => rows()[2] === 'calendar', 'moved once')
    await waitFor(() => document.activeElement === handle('calendar'), 'focus kept')
    await key(handle('calendar'), 'ArrowUp', { altKey: true })
    await waitFor(() => rows()[1] === 'calendar', 'moved twice')
    expect(rows().slice(0, 4)).toEqual(['inbox', 'calendar', 'today', 'upcoming'])
    expect((await db.userPrefs.get('me'))?.sidebar_order?.split(',').slice(0, 4)).toEqual(['inbox', 'calendar', 'today', 'upcoming'])
    await waitFor(() => document.querySelector('[data-setting-row="sidebar-destinations"] [role="status"]')?.textContent === 'Calendar moved to position 2 of 16', 'announced')
    await waitFor(() => document.activeElement === handle('calendar'), 'focus kept')
    await r.unmount()
  })

  it('Move up from the row menu; an id this client does not know is kept in the stored order', async () => {
    await applyOps([{ id: 'o1', entity: 'user_prefs', entityId: 'me', field: 'sidebar_order', value: 'inbox,today,hologram', ts: Date.now(), device: 'newer' }] as never)
    const r = await render(<SidebarSection />)
    await waitFor(() => !!document.querySelector('[data-destination-row="today"] button[aria-haspopup]'), 'the row menu')
    await click(document.querySelector('[data-destination-row="today"] button[aria-haspopup]')!)
    await waitFor(() => !!document.querySelector('[data-menu-label="Move up"]'), 'the menu')
    await click(document.querySelector('[data-menu-label="Move up"]')!)
    await waitFor(() => rows()[0] === 'today', 'Today first')
    const stored = (await db.userPrefs.get('me'))?.sidebar_order?.split(',') ?? []
    expect(stored.slice(0, 2)).toEqual(['today', 'inbox'])
    expect(stored).toContain('hologram')
    await r.unmount()
  })
})

describe('Appearance → Sidebar in Open Loops first (open-loops-method 6.2)', () => {
  it('the destination switches are disabled with the explanation, and the stored list is kept', async () => {
    await setPromoted(null, 'someday', true)
    await setMethodMode('first')
    const r = await render(<SidebarSection />)
    await waitFor(() => !!document.querySelector<HTMLButtonElement>('#sidebar-switch-someday')?.disabled, 'the switches disabled')
    const someday = document.querySelector<HTMLButtonElement>('#sidebar-switch-someday')!
    expect(someday.disabled).toBe(true)
    expect(someday.getAttribute('aria-checked')).toBe('true')
    expect(r.container.textContent).toContain('The full Open Loops method arranges the sidebar')
    await r.unmount()
  })
})

describe('Appearance → Haptic feedback (motion-v2 4.4)', () => {
  const setVibrate = (fn: unknown) => {
    if (fn) Object.defineProperty(navigator, 'vibrate', { value: fn, configurable: true, writable: true })
    else delete (navigator as { vibrate?: unknown }).vibrate
  }
  afterEach(() => setVibrate(undefined))

  it('is hidden on a device that cannot vibrate, and nothing is written', async () => {
    setVibrate(undefined)
    const r = await render(<AppearanceSection />)
    await waitFor(() => r.container.textContent !== '', 'the section')
    await flush()
    expect(document.querySelector('#appearance-haptics-switch')).toBeNull()
    expect((await db.userPrefs.get('me'))?.haptics).toBeUndefined()
    await r.unmount()
  })

  it('on a device that can vibrate it is on by default and turning it off writes the synced preference', async () => {
    setVibrate(() => true)
    const r = await render(<AppearanceSection />)
    await waitFor(() => !!document.querySelector('#appearance-haptics-switch'), 'the haptics switch')
    const sw = document.querySelector<HTMLButtonElement>('#appearance-haptics-switch')!
    expect(sw.getAttribute('aria-checked')).toBe('true')
    await click(sw)
    await waitFor(async () => (await db.userPrefs.get('me'))?.haptics === 'off', 'haptics off stored')
    expect((await db.userPrefs.get('me'))?.haptics).toBe('off')
    expect((await db.outbox.toArray()).some((o) => o.entity === 'user_prefs' && o.field === 'haptics' && o.value === 'off')).toBe(true)
    await r.unmount()
  })
})
