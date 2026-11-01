// @vitest-environment happy-dom
// The built-in catalogue in Settings › Appearance (theme-catalogue tasks 3.1 to 3.3):
// the palettes listed only on the side of their kind, OpenTodo first and then by
// name; choosing one offline applies it at once and writes one op; under System the
// counterpart offer writes one more op only when accepted; About this theme shows the
// credits and opens nothing outside the server's origin.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import { setAppearance, setAppearanceThemes } from '../lib/appearance'
import { click, render, waitFor } from '../ui/test-utils'
import { AppearanceProvider } from './AppearanceProvider'
import { AppearanceSection } from './AppearanceSection'

let systemDark = false
window.matchMedia = ((q: string) => ({
  get matches() { return q.includes('dark') ? systemDark : !systemDark },
  media: q,
  addEventListener: () => {},
  removeEventListener: () => {},
})) as unknown as typeof window.matchMedia

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
afterEach(() => { vi.restoreAllMocks() })

const root = () => document.documentElement
const list = (side: string) => document.querySelector<HTMLElement>(`[data-theme-side="${side}"]`)
const cards = (side: string) => [...list(side)!.querySelectorAll<HTMLButtonElement>('[data-theme-card]')].map((c) => c.dataset.themeCard)
const card = (side: string, id: string) => list(side)!.querySelector<HTMLButtonElement>(`[data-theme-card="${id}"]`)!
const fields = async () => (await db.outbox.toArray()).map((o) => `${o.field}=${o.value}`)
const loaded = () => !!list('dark')?.querySelector('[data-theme-card="nord"]')

describe('the built-in catalogue in Settings', () => {
  it('lists each palette on the side of its kind only, OpenTodo first and then by name', async () => {
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(loaded, 'the catalogue')
    expect(cards('light')).toEqual(['opentodo-light', 'catppuccin-latte', 'gruvbox-light', 'one-light', 'rose-pine-dawn', 'solarized-light', 'tokyo-night-light'])
    expect(cards('dark')).toEqual(['opentodo-dark', 'catppuccin-mocha', 'dracula', 'gruvbox-dark', 'nord', 'one-dark', 'rose-pine', 'solarized-dark', 'tokyo-night'])
    expect(card('dark', 'nord').textContent).toContain('by Sven Greb')
    await r.unmount()
  })

  it('choosing Gruvbox Dark offline applies it at once and writes one op', async () => {
    await setAppearance('theme_mode', 'dark')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(loaded, 'the catalogue')
    const before = (await fields()).length
    await click(card('dark', 'gruvbox-dark'))
    await waitFor(() => root().getAttribute('data-ot-theme') === 'gruvbox-dark', 'Gruvbox Dark applied')
    expect((await fields()).slice(before)).toEqual(['theme_dark=builtin:gruvbox-dark'])
    expect(document.getElementById('ot-theme')!.textContent).toContain('--ot-canvas:')
    expect(card('dark', 'gruvbox-dark').getAttribute('aria-checked')).toBe('true')
    // A fixed mode: no counterpart offer.
    expect(document.querySelector('[data-theme-offer]')).toBeNull()
    // Offline: the document is in the app, the choice waits in the outbox; nothing is fetched.
    expect(fetchSpy).not.toHaveBeenCalled()
    await r.unmount()
  })

  it('under System offers the counterpart: accepting writes one op for the other side', async () => {
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(loaded, 'the catalogue')
    await click(card('light', 'solarized-light'))
    await waitFor(() => !!document.querySelector('[data-theme-offer="dark"]'), 'the offer')
    const offer = document.querySelector<HTMLElement>('[data-theme-offer="dark"]')!
    expect(offer.textContent).toContain('Also use Solarized Dark at night')
    await waitFor(async () => (await fields()).length === 1, 'the first op')
    expect(await fields()).toEqual(['theme_light=builtin:solarized-light'])
    await click(offer.querySelector<HTMLButtonElement>('button')!)
    await waitFor(async () => (await fields()).length === 2, 'the second op')
    expect(await fields()).toEqual(['theme_light=builtin:solarized-light', 'theme_dark=builtin:solarized-dark'])
    await waitFor(() => !document.querySelector('[data-theme-offer]'), 'the offer gone')
    await waitFor(() => card('dark', 'solarized-dark').getAttribute('aria-checked') === 'true', 'the dark side')
    await r.unmount()
  })

  it('dismissing the offer writes nothing more, and a side already of the family is not offered', async () => {
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(loaded, 'the catalogue')
    await click(card('dark', 'tokyo-night'))
    await waitFor(() => !!document.querySelector('[data-theme-offer="light"]'), 'the offer')
    expect(document.querySelector('[data-theme-offer="light"]')!.textContent).toContain('Also use Tokyo Night Light by day')
    await click(document.querySelector<HTMLButtonElement>('[data-theme-offer="light"] button[aria-label="Dismiss"]')!)
    await waitFor(() => !document.querySelector('[data-theme-offer]'), 'dismissed')
    await waitFor(async () => (await fields()).length === 1, 'the op')
    expect(await fields()).toEqual(['theme_dark=builtin:tokyo-night'])
    // Nord has no light counterpart: nothing to offer.
    await click(card('dark', 'nord'))
    await waitFor(async () => (await fields()).length === 2, 'the op')
    expect(document.querySelector('[data-theme-offer]')).toBeNull()
    await r.unmount()
  })

  it('About this theme shows the credits and opens nothing outside the server', async () => {
    await setAppearance('theme_mode', 'dark')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(loaded, 'the catalogue')
    expect(document.querySelector('[data-theme-about]')).toBeNull()
    await click(card('dark', 'catppuccin-mocha'))
    await waitFor(() => !!document.querySelector('[data-theme-about="catppuccin-mocha"]'), 'the About button')
    await click(document.querySelector<HTMLButtonElement>('[data-theme-about="catppuccin-mocha"]')!)
    await waitFor(() => !!document.querySelector('[data-theme-about-dialog="catppuccin-mocha"]'), 'the dialog')
    const d = document.querySelector<HTMLElement>('[data-theme-about-dialog]')!
    for (const s of ['Catppuccin', 'MIT', 'Copyright (c) 2021 Catppuccin', 'https://github.com/catppuccin/catppuccin', 'OpenTodo is not affiliated with this project']) expect(d.textContent).toContain(s)
    // The project's address is text, never a link or an image.
    expect([...d.querySelectorAll('a, img, iframe')].map((e) => e.getAttribute('href') ?? e.getAttribute('src'))).toEqual([d.querySelector('[data-theme-licence]')!.getAttribute('href')])
    const licence = new URL(d.querySelector('[data-theme-licence]')!.getAttribute('href')!, location.href)
    expect(licence.origin).toBe(location.origin)
    expect(licence.pathname).toMatch(/CREDITS.*\.md$/)
    expect(fetchSpy).not.toHaveBeenCalled()
    await r.unmount()
  })

  it('the details say when colours were adapted for contrast', async () => {
    await setAppearance('theme_mode', 'dark')
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(loaded, 'the catalogue')
    await click(card('dark', 'nord'))
    await waitFor(() => !!document.querySelector('[data-theme-about="nord"]'), 'the About button')
    await click(document.querySelector<HTMLButtonElement>('[data-theme-about="nord"]')!)
    await waitFor(() => !!document.querySelector('[data-theme-adapted]'), 'the note')
    expect(document.querySelector('[data-theme-adapted]')!.textContent).toBe('Some colours were adapted for contrast')
    await r.unmount()
  })
})
