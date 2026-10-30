// @vitest-environment happy-dom
// Appearance preference (OpenSpec change theming, tasks 3.1 and 3.3).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyAppearance, CACHE_KEY, destinationOrder, moveDestination, orderDestinations, readAppearance, readSidebarCounts, setAppearance, setSidebarCounts } from './appearance'
import { db } from './db'
import { applyOps, resetDeviceId } from './ops'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-accent')
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
