// @vitest-environment happy-dom
// Appearance preference (OpenSpec change theming, tasks 3.1 and 3.3).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_THEMES, readThemeChoices, setDefaultThemeChoice, setInstanceThemeChoice, setThemeChoice } from './theme/choice'
import { NO_INSTANCE_THEMES, parseInstanceThemes, type InstanceThemes } from './theme/choice'
import type { AppliedTheme } from './theme/apply'
import { applyAppearance, setAppearanceThemes, CACHE_KEY, cachedCustom, deriveCustom, setCustomAccent, destinationOrder, moveDestination, orderDestinations, readAppearance, readSidebarCounts, setAppearance, setSidebarCounts } from './appearance'
import { db } from './db'
import { applyOps, resetDeviceId } from './ops'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-accent')
  document.documentElement.removeAttribute('style')
  for (const m of [...document.head.querySelectorAll('meta')]) m.remove()
  localStorage.clear()
})

describe('readAppearance', () => {
  it('defaults to system and emerald, and reads an unknown value as the default without writing', async () => {
    expect(readAppearance(null)).toEqual({ mode: 'system', accent: 'emerald', density: 'comfortable', sidebar: [] })
    expect(readAppearance({ theme_mode: 'dark', theme_accent: 'orange' } as never)).toEqual({ mode: 'dark', accent: 'orange', density: 'comfortable', sidebar: [] })
    expect(readAppearance({ theme_mode: 'sepia', theme_accent: 'ultraviolet', sidebar_destinations: 'someday,bogus', density: 'cosy' } as never)).toEqual({ mode: 'system', accent: 'emerald', density: 'comfortable', sidebar: ['someday'] })
    expect(await db.outbox.count()).toBe(0)
  })

  it('a change goes into the outbox as one op per field (offline-safe)', async () => {
    await setAppearance('theme_accent', 'teal')
    await setAppearance('theme_mode', 'dark')
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => [o.entity, o.entityId, o.field, o.value])).toEqual([
      ['user_prefs', 'me', 'theme_accent', 'teal'],
      ['user_prefs', 'me', 'theme_mode', 'dark'],
    ])
    expect(readAppearance(await db.userPrefs.get('me'))).toEqual({ mode: 'dark', accent: 'teal', density: 'comfortable', sidebar: [] })
  })
})

describe('sidebar counts (sidebar-polish 2.1)', () => {
  it('defaults to Inbox and Today; an unknown value reads as the default and is kept', async () => {
    expect(readSidebarCounts(null)).toBe('today')
    expect(readSidebarCounts({ sidebar_counts: 'all' } as never)).toBe('all')
    await applyOps([{ id: 'c1', entity: 'user_prefs', entityId: 'me', field: 'sidebar_counts', value: 'rainbow', ts: Date.now(), device: 'newer' }] as never)
    const row = await db.userPrefs.get('me')
    expect(readSidebarCounts(row)).toBe('today')
    expect(row?.sidebar_counts).toBe('rainbow')
    expect(await db.outbox.count()).toBe(0)
  })

  it('writes one op; the default is stored as empty', async () => {
    await setSidebarCounts('all')
    await setSidebarCounts('today')
    expect((await db.outbox.toArray()).map((o) => [o.field, o.value])).toEqual([['sidebar_counts', 'all'], ['sidebar_counts', '']])
  })
})

describe('orderDestinations (sidebar-polish 3.1)', () => {
  const primary = ['inbox', 'today', 'upcoming', 'calendar', 'someday'] as const
  it('no stored order: the default order', () => {
    expect(orderDestinations(primary, '')).toEqual([...primary])
    expect(orderDestinations(primary, undefined)).toEqual([...primary])
  })
  it('stored ids first in the stored order, the rest after in the default order', () => {
    expect(orderDestinations(primary, 'today,inbox,someday,upcoming,calendar')).toEqual(['today', 'inbox', 'someday', 'upcoming', 'calendar'])
    expect(orderDestinations(primary, 'calendar')).toEqual(['calendar', 'inbox', 'today', 'upcoming', 'someday'])
  })
  it('a newly promoted destination missing from the order lands last', () => {
    expect(orderDestinations(primary, 'today,inbox,upcoming,calendar')).toEqual(['today', 'inbox', 'upcoming', 'calendar', 'someday'])
  })
  it('unknown, duplicate and not-primary ids are ignored', () => {
    expect(orderDestinations(primary, 'hologram, today ,today,trash,inbox')).toEqual(['today', 'inbox', 'upcoming', 'calendar', 'someday'])
  })
  it('a move stores the whole order and keeps unknown ids', async () => {
    await applyOps([{ id: 'o1', entity: 'user_prefs', entityId: 'me', field: 'sidebar_order', value: 'today,hologram', ts: Date.now(), device: 'newer' }] as never)
    const row = await db.userPrefs.get('me')
    expect(destinationOrder(row).slice(0, 3)).toEqual(['today', 'inbox', 'upcoming'])
    expect(await moveDestination(row, 'today', -1)).toBe(false)
    expect(await moveDestination(row, 'calendar', -3)).toBe(true)
    const stored = (await db.userPrefs.get('me'))!.sidebar_order!.split(',')
    expect(stored.slice(0, 4)).toEqual(['calendar', 'today', 'inbox', 'upcoming'])
    expect(stored.at(-1)).toBe('hologram')
  })
})

describe('retired row detail (rows-v2 D1)', () => {
  it('an incoming row_detail op is stored, exported with the row and changes nothing', async () => {
    await applyOps([{ id: 'r1', entity: 'user_prefs', entityId: 'me', field: 'row_detail', value: 'detailed', ts: Date.now(), device: 'old-phone' }] as never)
    const row = await db.userPrefs.get('me')
    expect(row?.row_detail).toBe('detailed')
    expect(readAppearance(row)).toEqual(readAppearance(null))
    expect(await db.outbox.count()).toBe(0)
  })

  it('an unknown value from a newer client is kept in the row', async () => {
    await applyOps([{ id: 'r2', entity: 'user_prefs', entityId: 'me', field: 'row_detail', value: 'verbose', ts: Date.now(), device: 'phone' }] as never)
    expect((await db.userPrefs.get('me'))?.row_detail).toBe('verbose')
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('applyAppearance', () => {
  const metas = () => [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => [m.content, m.getAttribute('media') ?? ''])

  it('dark mode with a theme: attributes, color-scheme, one dark bar, and the device cache', () => {
    applyAppearance({ mode: 'dark', accent: 'orange' })
    const root = document.documentElement
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.getAttribute('data-accent')).toBe('orange')
    expect(document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')!.content).toBe('dark')
    expect(metas()).toEqual([['#0d0e10', '']])
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!)).toEqual({ mode: 'dark', accent: 'orange', bar: '#c2410c' })
  })

  it('light mode uses the accent as the bar; system emits both with media queries; emerald removes the attribute', () => {
    applyAppearance({ mode: 'light', accent: 'blue' })
    expect(metas()).toEqual([['#1d4ed8', '']])
    applyAppearance({ mode: 'system', accent: 'emerald' })
    const root = document.documentElement
    expect(root.hasAttribute('data-theme')).toBe(false)
    expect(root.hasAttribute('data-accent')).toBe(false)
    expect(metas()).toEqual([['#047857', '(prefers-color-scheme: light)'], ['#0d0e10', '(prefers-color-scheme: dark)']])
  })
})

// accent-colour tasks 1.3, 3.1, 3.3: the custom accent read, written, applied and cached.
describe('custom accent', () => {
  const metas = () => [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => [m.content, m.getAttribute('media') ?? ''])
  const root = () => document.documentElement
  const prop = (n: string) => root().style.getPropertyValue(n)

  it('reads custom with a valid colour; a missing or malformed colour reads as emerald without writing', async () => {
    expect(readAppearance({ theme_accent: 'custom', theme_accent_custom: '#1f6feb' } as never)).toMatchObject({ accent: 'custom', custom: '#1f6feb' })
    for (const bad of [undefined, '', '#1F6FEB', '1f6feb', '#abc', 'blue', '#12345g']) {
      const a = readAppearance({ theme_accent: 'custom', theme_accent_custom: bad } as never)
      expect(a.accent, String(bad)).toBe('emerald')
      expect(a.custom, String(bad)).toBeUndefined()
    }
    // A built-in theme keeps the stored colour for the Custom tile.
    expect(readAppearance({ theme_accent: 'teal', theme_accent_custom: '#1f6feb' } as never)).toMatchObject({ accent: 'teal', custom: '#1f6feb' })
    expect(readAppearance({ theme_accent: 'ultraviolet' } as never).accent).toBe('emerald')
    expect(await db.outbox.count()).toBe(0)
  })

  it('choosing a colour writes the theme and the colour in one batch; a built-in theme later keeps the colour', async () => {
    await setCustomAccent('#1f6feb')
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => [o.field, o.value])).toEqual([['theme_accent', 'custom'], ['theme_accent_custom', '#1f6feb']])
    expect(new Set(ops.map((o) => o.ts)).size).toBe(1)
    await setAppearance('theme_accent', 'teal')
    const row = await db.userPrefs.get('me')
    expect(row?.theme_accent).toBe('teal')
    expect(row?.theme_accent_custom).toBe('#1f6feb')
    await expect(setCustomAccent('#ABC')).rejects.toThrow()
  })

  it('applies only the input properties with data-accent="custom", the derived light bar, and caches the values', async () => {
    const v = await deriveCustom('#000080')
    expect(v.button).toBeDefined()
    applyAppearance({ mode: 'light', accent: 'custom', custom: '#000080' }, document, v)
    expect(root().getAttribute('data-accent')).toBe('custom')
    expect(prop('--ot-al-accent')).toBe(v.light)
    expect(prop('--ot-ad-accent-text')).toBe(v.dark)
    expect(prop('--ot-a-on-accent')).toBe('#ffffff')
    expect(prop('--ot-ad-accent')).toBe(v.button)
    expect(prop('--ot-accent')).toBe('')
    expect(metas()).toEqual([[v.light, '']])
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!)).toEqual({ mode: 'light', accent: 'custom', bar: v.light, custom: { input: '#000080', ...v } })
    expect(cachedCustom('#000080')).toEqual(v)
    expect(cachedCustom('#1f6feb')).toBeNull()
    // System mode: the derived light accent in light, the dark canvas in dark.
    applyAppearance({ mode: 'system', accent: 'custom', custom: '#000080' }, document, v)
    expect(metas()).toEqual([[v.light, '(prefers-color-scheme: light)'], ['#0d0e10', '(prefers-color-scheme: dark)']])
    applyAppearance({ mode: 'dark', accent: 'custom', custom: '#000080' }, document, v)
    expect(metas()).toEqual([['#0d0e10', '']])
    // Back to a built-in theme: the inline values are cleared.
    applyAppearance({ mode: 'light', accent: 'blue', custom: '#000080' })
    expect(root().getAttribute('data-accent')).toBe('blue')
    for (const n of ['--ot-al-accent', '--ot-ad-accent-text', '--ot-a-on-accent', '--ot-ad-accent']) expect(prop(n), n).toBe('')
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!).custom).toBeUndefined()
  })

  it('a custom accent without derived values shows the default accent', () => {
    applyAppearance({ mode: 'light', accent: 'custom', custom: '#1f6feb' })
    expect(root().hasAttribute('data-accent')).toBe(false)
    expect(metas()).toEqual([['#047857', '']])
  })

  it('a malformed cache is not used', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ mode: 'light', accent: 'custom', bar: '#000000', custom: { input: '#1f6feb', light: 'red', dark: '#ffffff', on: '#ffffff' } }))
    expect(cachedCustom('#1f6feb')).toBeNull()
  })
})

// theme-engine D6, task 4.2: the theme of each side.
describe('theme choice per side', () => {
  it('reads empty, the OpenTodo themes, and anything else as the side default without writing', async () => {
    const read = (light: unknown, dark: unknown = '') => readThemeChoices({ theme_light: light, theme_dark: dark } as never)
    expect(readThemeChoices(null)).toEqual({ light: { stored: '', status: 'default', id: 'opentodo-light' }, dark: { stored: '', status: 'default', id: 'opentodo-dark' } })
    expect(read('builtin:opentodo-light').light).toMatchObject({ status: 'default', id: 'opentodo-light' })
    expect(read('', 'builtin:opentodo-dark').dark).toMatchObject({ status: 'default', id: 'opentodo-dark' })
    // A theme of the other kind, a malformed value: invalid. Unknown and reserved themes: from a newer version.
    expect(read('builtin:opentodo-dark').light).toMatchObject({ stored: 'builtin:opentodo-dark', status: 'invalid', id: 'opentodo-light' })
    expect(read('url(x)').light).toMatchObject({ status: 'invalid', id: 'opentodo-light' })
    expect(read(42).light).toMatchObject({ stored: '', status: 'default' })
    // Without the lazy catalogue an unlisted builtin reads as a theme provisionally (the loader decides);
    // with the list of the themes this app has, an unknown one is from a newer version.
    expect(read('builtin:nord').light).toMatchObject({ stored: 'builtin:nord', status: 'theme', id: 'nord' })
    expect(readThemeChoices({ theme_light: 'builtin:from-the-future' } as never, BUILTIN_THEMES).light).toMatchObject({ status: 'newer', id: 'opentodo-light' })
    // A custom theme (theme-editor D1): provisional without the list (the loader decides).
    expect(read('', 'user:0b5e0d8c-4f7c-4d3e-9c1e-2f3a4b5c6d7e').dark).toMatchObject({ status: 'theme', id: '0b5e0d8c-4f7c-4d3e-9c1e-2f3a4b5c6d7e', custom: true })
    // A server theme this device has not read (theme-instance-default) reads as the side's default; the value stays.
    expect(read('', 'instance:corporate').dark).toMatchObject({ stored: 'instance:corporate', status: 'default', id: 'opentodo-dark' })
    expect(await db.outbox.count()).toBe(0)
  })

  it('reads a custom theme against the live list: missing or deleted reads as the default, other kind as invalid (theme-editor 1.3)', () => {
    const custom = [{ id: 'th-dark', kind: 'dark' as const }, { id: 'th-light', kind: 'light' as const }]
    const row = (dark: string, light = '') => ({ theme_dark: dark, theme_light: light }) as never
    expect(readThemeChoices(row('user:th-dark'), BUILTIN_THEMES, custom).dark).toEqual({ stored: 'user:th-dark', status: 'theme', id: 'th-dark', custom: true })
    expect(readThemeChoices(row('user:gone'), BUILTIN_THEMES, custom).dark).toEqual({ stored: 'user:gone', status: 'default', id: 'opentodo-dark' })
    expect(readThemeChoices(row('user:th-light'), BUILTIN_THEMES, custom).dark).toMatchObject({ status: 'invalid', id: 'opentodo-dark' })
    expect(readThemeChoices(row('', 'user:th-light'), BUILTIN_THEMES, custom).light).toMatchObject({ status: 'theme', id: 'th-light', custom: true })
  })

  it('an incoming choice is stored, kept as it is and changes nothing on this version', async () => {
    await applyOps([{ id: 't1', entity: 'user_prefs', entityId: 'me', field: 'theme_dark', value: 'builtin:from-the-future', ts: '0000001:0000:dev', device: 'phone' }] as never)
    const row = await db.userPrefs.get('me')
    expect(row?.theme_dark).toBe('builtin:from-the-future')
    expect(readThemeChoices(row, BUILTIN_THEMES).dark.status).toBe('newer')
    expect(await db.outbox.count()).toBe(0)
  })

  it('choosing writes one op for one side; the default is stored as empty', async () => {
    await setThemeChoice('dark', 'opentodo-dark')
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => [o.entity, o.field, o.value])).toEqual([['user_prefs', 'theme_dark', '']])
    await expect(setThemeChoice('light', 'opentodo-dark')).rejects.toThrow()
  })
})

// theme-instance-default D3, task 2.2: the server's default and themes.
describe('theme choice with a server default', () => {
  const houseDoc = { opentodoTheme: 1, id: 'x', name: 'House', author: 'Owner', licence: 'MIT', kind: 'dark', seeds: { canvas: '#202020', surface: '#2a2a2a', text: '#eeeeee', accent: '#4c8bf5' } }
  const inst = (light = '', dark = 'instance:house1'): InstanceThemes => parseInstanceThemes({ version: 3, default: { light, dark }, themes: [{ id: 'house1', kind: 'dark', doc: houseDoc }] })!
  const row = (light: string, dark: string) => ({ theme_light: light, theme_dark: dark }) as never

  it('an empty side follows the server default; the member\'s own choice wins', () => {
    const c = readThemeChoices(row('', ''), BUILTIN_THEMES, null, inst('builtin:catppuccin-latte'))
    expect(c.dark).toEqual({ stored: '', status: 'theme', id: 'house1', instance: true, fromDefault: true })
    // Without the catalogue an unlisted builtin default reads as a theme provisionally.
    expect(readThemeChoices(row('', ''), null, null, inst('builtin:catppuccin-latte')).light).toMatchObject({ status: 'theme', id: 'catppuccin-latte', fromDefault: true })
    expect(readThemeChoices(row('', 'builtin:nord'), null, null, inst()).dark).toEqual({ stored: 'builtin:nord', status: 'theme', id: 'nord' })
    // OpenTodo's theme chosen by name wins over the server default.
    expect(readThemeChoices(row('', 'builtin:opentodo-dark'), BUILTIN_THEMES, null, inst()).dark).toMatchObject({ status: 'default', id: 'opentodo-dark' })
    expect(readThemeChoices(row('', ''), BUILTIN_THEMES, null, NO_INSTANCE_THEMES).dark).toMatchObject({ status: 'default', id: 'opentodo-dark' })
  })

  it('an instance theme is chosen by its server id; one that is gone falls back to the side default', () => {
    expect(readThemeChoices(row('', 'instance:house1'), BUILTIN_THEMES, null, inst('', '')).dark).toEqual({ stored: 'instance:house1', status: 'theme', id: 'house1', instance: true })
    expect(readThemeChoices(row('instance:house1', ''), BUILTIN_THEMES, null, inst('', '')).light).toMatchObject({ status: 'invalid', id: 'opentodo-light' })
    // Removed by the owner while another default is set: that default applies, the stored value stays.
    const removed = parseInstanceThemes({ version: 4, default: { light: '', dark: 'builtin:nord' }, themes: [] })!
    expect(readThemeChoices(row('', 'instance:house1'), BUILTIN_THEMES.concat({ id: 'nord', kind: 'dark' }), null, removed).dark)
      .toEqual({ stored: 'instance:house1', status: 'theme', id: 'nord', fromDefault: true })
    // A deleted custom theme follows the server default too.
    expect(readThemeChoices(row('', 'user:gone'), BUILTIN_THEMES, [], inst()).dark).toMatchObject({ stored: 'user:gone', id: 'house1', fromDefault: true })
  })

  it('with a server default, choosing OpenTodo\'s theme stores it by name; Default stores empty', async () => {
    await setThemeChoice('dark', 'opentodo-dark', BUILTIN_THEMES, inst())
    await setDefaultThemeChoice('dark')
    await setInstanceThemeChoice('light', 'house1')
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => [o.field, o.value])).toEqual([['theme_dark', 'builtin:opentodo-dark'], ['theme_dark', ''], ['theme_light', 'instance:house1']])
  })
})

describe('applyAppearance with a theme (theme-engine D4, D8)', () => {
  const theme = (kind: 'light' | 'dark', bar: string): AppliedTheme => ({ id: `t-${kind}`, hash: 'h', kind, bar, tokens: { canvas: kind === 'dark' ? 'oklch(0.2 0.02 260)' : 'oklch(0.97 0.01 90)' } })
  const metas = () => [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => [m.content, m.getAttribute('media') ?? ''])
  beforeEach(() => {
    document.documentElement.removeAttribute('data-ot-theme')
    document.getElementById('ot-theme')?.remove()
    setAppearanceThemes({})
  })

  it('applies the theme of the side shown, with its kind and its bar, and caches it', () => {
    setAppearanceThemes({ dark: theme('dark', '#2e3440') })
    applyAppearance({ mode: 'dark', accent: 'teal' })
    expect(document.documentElement.getAttribute('data-ot-theme')).toBe('t-dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(metas()).toEqual([['#2e3440', '']])
    expect(JSON.parse(localStorage.getItem('ot.theme')!).dark.id).toBe('t-dark')
    // The accent preference is kept for the OpenTodo themes (D7).
    expect(document.documentElement.getAttribute('data-accent')).toBe('teal')
  })

  it('under system: the bar of each side, and the theme only while its side shows', () => {
    setAppearanceThemes({ dark: theme('dark', '#2e3440') })
    applyAppearance({ mode: 'system', accent: 'emerald' })
    // happy-dom reports a light scheme: the light side is OpenTodo Light, exactly as without a theme.
    expect(document.documentElement.hasAttribute('data-ot-theme')).toBe(false)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(metas()).toEqual([['#047857', '(prefers-color-scheme: light)'], ['#2e3440', '(prefers-color-scheme: dark)']])
  })

  it('the OpenTodo themes write no sheet and keep the bars as before', () => {
    applyAppearance({ mode: 'light', accent: 'orange' })
    expect(document.getElementById('ot-theme')).toBeNull()
    expect(metas()).toEqual([['#c2410c', '']])
    expect(localStorage.getItem('ot.theme')).toBeNull()
  })
})
