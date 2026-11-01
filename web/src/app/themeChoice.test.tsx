// @vitest-environment happy-dom
// The theme of each side in Settings and the provider (theme-engine tasks 5.2, 5.4,
// 7.2): one list for a fixed mode, a Light and a Dark list under System, one op per
// choice, keyboard operation, the theme applied live with its bar, the accent tiles'
// "From the theme" state, and the switch with the operating system. This version
// ships only the OpenTodo themes, so a test palette is added to the builtin list.
import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import { setAppearance, setAppearanceThemes } from '../lib/appearance'
import { BUILTIN_THEMES, type BuiltinTheme } from '../lib/theme/choice'
import { deriveTheme } from '../lib/theme/derive'
import { toApplied } from '../lib/theme/load'
import type { ThemeDocument } from '../lib/theme/format'
import { click, key, render, waitFor } from '../ui/test-utils'
import { AppearanceProvider } from './AppearanceProvider'
import { AppearanceSection } from './AppearanceSection'

const NIGHT: ThemeDocument = {
  opentodoTheme: 1, id: 'test-night', name: 'Test Night', author: 'Example', licence: 'MIT', kind: 'dark',
  seeds: { canvas: '#2e3440', surface: '#3b4252', text: '#eceff4', accent: '#88c0d0' }, bar: '#2e3440',
}
vi.mock('../lib/theme/load', async (orig) => {
  const real = await orig<typeof import('../lib/theme/load')>()
  return { ...real, loadAppliedTheme: async (id: string) => (id === 'test-night' ? real.resolveDocument(NIGHT) : null) }
})
const builtins = BUILTIN_THEMES as BuiltinTheme[]
builtins.push({ id: 'test-night', kind: 'dark' })
afterAll(() => { builtins.pop() })

// A controllable operating-system scheme.
let systemDark = false
const listeners = new Set<() => void>()
window.matchMedia = ((q: string) => ({
  get matches() { return q.includes('dark') ? systemDark : !systemDark },
  media: q,
  addEventListener: (_: string, f: () => void) => listeners.add(f),
  removeEventListener: (_: string, f: () => void) => listeners.delete(f),
})) as unknown as typeof window.matchMedia
const setSystemDark = (on: boolean) => { systemDark = on; for (const f of listeners) f() }

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  for (const a of ['data-theme', 'data-accent', 'data-ot-theme', 'style']) document.documentElement.removeAttribute(a)
  for (const m of [...document.head.querySelectorAll('meta, style')]) m.remove()
  localStorage.clear()
  setAppearanceThemes({})
  systemDark = false
})

const root = () => document.documentElement
const list = (side: string) => document.querySelector<HTMLElement>(`[data-theme-side="${side}"]`)
const card = (side: string, id: string) => list(side)!.querySelector<HTMLButtonElement>(`[data-theme-card="${id}"]`)!
const fields = async () => (await db.outbox.toArray()).map((o) => `${o.field}=${o.value}`)
const bars = () => [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => [m.content, m.getAttribute('media') ?? ''])

describe('Settings › Appearance › Theme', () => {
  it('under System shows a Light and a Dark list, each named with its selected theme', async () => {
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(() => !!list('dark'), 'the two lists')
    const group = (side: string) => list(side)!.querySelector('[role="radiogroup"]')!
    expect(document.getElementById(group('light').getAttribute('aria-labelledby')!)!.textContent).toBe('Light')
    expect(document.getElementById(group('dark').getAttribute('aria-labelledby')!)!.textContent).toBe('Dark')
    expect(card('light', 'opentodo-light').getAttribute('aria-checked')).toBe('true')
    expect(card('dark', 'opentodo-dark').getAttribute('aria-checked')).toBe('true')
    expect(card('light', 'opentodo-light').textContent).toContain('OpenTodo Light')
    expect(card('light', 'opentodo-light').textContent).toContain('by OpenTodo contributors')
    // Choosing the theme already chosen writes nothing.
    await click(card('dark', 'opentodo-dark'))
    expect(await fields()).toEqual([])
    await r.unmount()
  })

  it('a fixed mode shows one list, for its side', async () => {
    await setAppearance('theme_mode', 'dark')
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(() => !!list('dark') && !list('light'), 'the dark list alone')
    await r.unmount()
  })

  it('choosing a dark theme writes one op, applies it live with its bar, and the accent comes from it', async () => {
    await setAppearance('theme_mode', 'dark')
    await setAppearance('theme_accent', 'teal')
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(() => !!list('dark'), 'the dark list')
    const before = (await fields()).length
    // By keyboard: the arrow moves to the next card and selects it.
    card('dark', 'opentodo-dark').focus()
    await key(card('dark', 'opentodo-dark'), 'ArrowRight')
    await waitFor(() => root().getAttribute('data-ot-theme') === 'test-night', 'the theme applied')
    expect((await fields()).slice(before)).toEqual(['theme_dark=builtin:test-night'])
    expect(document.activeElement).toBe(card('dark', 'test-night'))
    expect(root().getAttribute('data-theme')).toBe('dark')
    expect(document.getElementById('ot-theme')!.textContent).toContain('--ot-canvas:')
    expect(bars()).toEqual([['#2e3440', '']])
    expect(JSON.parse(localStorage.getItem('ot.theme')!).dark.id).toBe('test-night')
    await waitFor(() => !!document.querySelector('[data-accent-from-theme]'), 'the accent from the theme')
    expect(document.querySelector('[data-theme-tile="teal"]')).toBeNull()
    // Back to OpenTodo Dark: the default is stored as empty, the sheet goes, Teal is back.
    await click(card('dark', 'opentodo-dark'))
    await waitFor(() => !root().hasAttribute('data-ot-theme'), 'the theme removed')
    expect((await fields()).slice(before)).toEqual(['theme_dark=builtin:test-night', 'theme_dark='])
    expect(document.getElementById('ot-theme')).toBeNull()
    expect(root().getAttribute('data-accent')).toBe('teal')
    await waitFor(() => !!document.querySelector('[data-theme-tile="teal"]'), 'the accent tiles')
    expect(localStorage.getItem('ot.theme')).toBeNull()
    await r.unmount()
  })

  it('under System follows the operating system between OpenTodo Light and a dark theme', async () => {
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(() => !!list('dark'), 'the lists')
    await click(card('dark', 'test-night'))
    await waitFor(async () => (await fields()).includes('theme_dark=builtin:test-night'), 'the op')
    // A light system: OpenTodo Light, exactly as without a theme, with the dark side's bar for later.
    await waitFor(() => bars().some(([c]) => c === '#2e3440'), 'the dark bar')
    expect(root().hasAttribute('data-ot-theme')).toBe(false)
    expect(root().hasAttribute('data-theme')).toBe(false)
    expect(bars()).toEqual([['#047857', '(prefers-color-scheme: light)'], ['#2e3440', '(prefers-color-scheme: dark)']])
    setSystemDark(true)
    await waitFor(() => root().getAttribute('data-ot-theme') === 'test-night', 'dark at sunset')
    expect(root().getAttribute('data-theme')).toBe('dark')
    setSystemDark(false)
    await waitFor(() => !root().hasAttribute('data-ot-theme'), 'light again')
    expect(root().hasAttribute('data-theme')).toBe(false)
    await r.unmount()
  })

  it('a choice this version cannot show reads as the default, says so, and writes nothing', async () => {
    const { applyOps } = await import('../lib/ops')
    await applyOps([{ id: 'n1', entity: 'user_prefs', entityId: 'me', field: 'theme_dark', value: 'builtin:from-the-future', ts: '0000001:0000:dev', device: 'phone' }] as never)
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(() => !!list('dark')?.textContent?.includes('Made with a newer version of OpenTodo'), 'the note')
    expect(card('dark', 'opentodo-dark').getAttribute('aria-checked')).toBe('true')
    expect(root().hasAttribute('data-ot-theme')).toBe(false)
    expect(await db.outbox.count()).toBe(0)
    await r.unmount()
  })
})

describe('a theme on the root keeps the derived look', () => {
  it('the provider applies the cached theme without waiting for the derivation', async () => {
    // A device that remembered the dark theme: it is on the root before the lazy chunk answers.
    const cached = toApplied(deriveTheme(NIGHT), 'stale-hash')
    localStorage.setItem('ot.theme', JSON.stringify({ dark: cached }))
    setAppearanceThemes({ dark: cached })
    await setAppearance('theme_mode', 'dark')
    const { setThemeChoice } = await import('../lib/theme/choice')
    await setThemeChoice('dark', 'test-night')
    const r = await render(<AppearanceProvider><div /></AppearanceProvider>)
    await waitFor(() => root().getAttribute('data-ot-theme') === 'test-night', 'applied')
    // The fresh result replaces the stale cache entry.
    await waitFor(() => JSON.parse(localStorage.getItem('ot.theme')!).dark.hash !== 'stale-hash', 'cache refreshed')
    await r.unmount()
  })
})
