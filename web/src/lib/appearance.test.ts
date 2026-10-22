// @vitest-environment happy-dom
// Appearance preference (OpenSpec change theming, tasks 3.1 and 3.3).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyAppearance, CACHE_KEY, readAppearance, setAppearance } from './appearance'
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
    expect(metas()).toEqual([['#0c0f16', '']])
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!)).toEqual({ mode: 'dark', accent: 'orange', bar: '#c2410c' })
  })

  it('light mode uses the accent as the bar; system emits both with media queries; emerald removes the attribute', () => {
    applyAppearance({ mode: 'light', accent: 'blue' })
    expect(metas()).toEqual([['#1d4ed8', '']])
    applyAppearance({ mode: 'system', accent: 'emerald' })
    const root = document.documentElement
    expect(root.hasAttribute('data-theme')).toBe(false)
    expect(root.hasAttribute('data-accent')).toBe(false)
    expect(metas()).toEqual([['#047857', '(prefers-color-scheme: light)'], ['#0c0f16', '(prefers-color-scheme: dark)']])
  })
})
