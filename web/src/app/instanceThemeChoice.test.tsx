// @vitest-environment happy-dom
// The server's themes in Settings › Appearance and the provider (theme-instance-default
// task 2.3): "Default (Server default: name)" first, the server's themes "From this
// server" with the default marked, choosing and customising them but not changing
// them, OpenTodo's theme stored by name while a server default is set, and the
// default applied to a member who never chose a theme without any op.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import { setAppearance, setAppearanceThemes } from '../lib/appearance'
import { setInstanceThemes } from '../lib/theme/instance'
import { click, render, waitFor } from '../ui/test-utils'
import { AppearanceProvider } from './AppearanceProvider'
import { AppearanceSection } from './AppearanceSection'

const doc = (name: string, kind: 'light' | 'dark') => ({
  opentodoTheme: 1, id: 'x', name, author: 'The owner', licence: 'MIT', kind,
  seeds: kind === 'dark' ? { canvas: '#2e3440', surface: '#3b4252', text: '#eceff4', accent: '#88c0d0' } : { canvas: '#fdf6e3', surface: '#fffdf5', text: '#30363d', accent: '#268bd2' },
  bar: kind === 'dark' ? '#2e3440' : '#268bd2',
})
const serve = (dark = 'instance:house1') => setInstanceThemes({
  version: 2, default: { light: '', dark },
  themes: [{ id: 'house1', kind: 'dark', doc: doc('House Night', 'dark') }, { id: 'house2', kind: 'light', doc: doc('House Day', 'light') }],
})

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  for (const a of ['data-theme', 'data-accent', 'data-ot-theme', 'style']) document.documentElement.removeAttribute(a)
  for (const m of [...document.head.querySelectorAll('meta, style')]) m.remove()
  localStorage.clear()
  setAppearanceThemes({})
  setInstanceThemes({ version: 0, default: { light: '', dark: '' }, themes: [] })
})

const root = () => document.documentElement
const list = (side: string) => document.querySelector<HTMLElement>(`[data-theme-side="${side}"]`)
const card = (side: string, id: string) => list(side)?.querySelector<HTMLButtonElement>(`[data-theme-card="${id}"]`) ?? null
const fields = async () => (await db.outbox.toArray()).map((o) => `${o.field}=${o.value}`)

describe('server themes in Settings › Appearance', () => {
  it('a member who never chose a theme gets the server default, named in Default, without any op', async () => {
    serve()
    await setAppearance('theme_mode', 'dark')
    const before = (await fields()).length
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(() => !!card('dark', 'server-default'), 'the Default card')
    expect(card('dark', 'server-default')!.textContent).toContain('Default (Server default: House Night)')
    expect(card('dark', 'server-default')!.getAttribute('aria-checked')).toBe('true')
    expect(card('dark', 'instance:house1')!.textContent).toContain('From this server · Server default')
    // The light theme is offered on the light side only.
    expect(card('dark', 'instance:house2')).toBeNull()
    await waitFor(() => root().getAttribute('data-ot-theme') === 'house1', 'the house theme applied')
    expect((await fields()).length).toBe(before)
    await r.unmount()
  })

  it('choosing OpenTodo Dark stores it by name, so it wins over the default; Default stores empty again', async () => {
    serve()
    await setAppearance('theme_mode', 'dark')
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(() => root().getAttribute('data-ot-theme') === 'house1', 'the house theme')
    const before = (await fields()).length
    await click(card('dark', 'opentodo-dark')!)
    await waitFor(() => !root().hasAttribute('data-ot-theme'), 'OpenTodo Dark')
    await click(card('dark', 'server-default')!)
    await waitFor(() => root().getAttribute('data-ot-theme') === 'house1', 'the house theme again')
    expect((await fields()).slice(before)).toEqual(['theme_dark=builtin:opentodo-dark', 'theme_dark='])
    await r.unmount()
  })

  it('a server theme is chosen by its id and offers Customise and Export, not Edit or Delete', async () => {
    serve('')
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(() => !!card('light', 'instance:house2'), 'the server theme')
    expect(card('light', 'server-default')).toBeNull()
    expect(card('light', 'instance:house2')!.textContent).toContain('From this server')
    await click(card('light', 'instance:house2')!)
    await waitFor(async () => (await fields()).includes('theme_light=instance:house2'), 'the op')
    await click(document.querySelector<HTMLElement>('[data-theme-menu="instance:house2"]')!)
    await waitFor(() => !!document.querySelector('[data-theme-customise="instance:house2"]'), 'the menu')
    const items = [...document.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent ?? '')
    expect(items.some((x) => x.includes('Customise'))).toBe(true)
    expect(items.some((x) => x.includes('Export'))).toBe(true)
    expect(items.some((x) => x.includes('Delete') || x.includes('Edit'))).toBe(false)
    await r.unmount()
  })

  it('a removed server theme falls back to the default and keeps the stored choice', async () => {
    serve('')
    await setAppearance('theme_mode', 'dark')
    const r = await render(<AppearanceProvider><AppearanceSection /></AppearanceProvider>)
    await waitFor(() => !!card('dark', 'instance:house1'), 'the server theme')
    await click(card('dark', 'instance:house1')!)
    await waitFor(() => root().getAttribute('data-ot-theme') === 'house1', 'applied')
    const before = (await fields()).length
    setInstanceThemes({ version: 3, default: { light: '', dark: '' }, themes: [] })
    await waitFor(() => !root().hasAttribute('data-ot-theme'), 'back to the default')
    expect((await fields()).length).toBe(before)
    expect((await db.userPrefs.get('me'))?.theme_dark).toBe('instance:house1')
    await r.unmount()
  })
})
