// @vitest-environment happy-dom
// Custom themes (OpenSpec change theme-editor, tasks 1.3, 2.1, 2.2): saving, the
// limit, deletion of a chosen theme with Undo, Customise and New, and the loader.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { applyOps, mutate, resetDeviceId } from '../ops'
import { undoBatch } from '../undo'
import nord from './builtin/nord.json'
import light from './builtin/opentodo-light.json'
import { readThemeChoices } from './choice'
import { customiseDocument, deleteCustomThemeUndoable, duplicateDocument, liveThemes, knownCustom, MAX_CUSTOM_THEMES, newDocument, saveCustomTheme, uniqueName } from './custom'
import { validateTheme, type ThemeDocument } from './format'
import { loadCustomAppliedTheme } from './load'

const NORD = nord as unknown as ThemeDocument
const LIGHT = light as unknown as ThemeDocument

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
})

describe('custom themes', () => {
  it('a new theme writes its creation fields; saving again writes one op (doc)', async () => {
    await saveCustomTheme('th-1', { ...NORD, id: 'whatever' })
    const created = await db.outbox.toArray()
    expect(created.map((o) => o.field).sort()).toEqual(['created_at', 'deleted_at', 'doc', 'position'])
    expect((await db.themes.get('th-1'))?.doc?.id).toBe('th-1')
    await db.outbox.clear()
    await saveCustomTheme('th-1', { ...NORD, name: 'Nord 2' })
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => [o.entity, o.field])).toEqual([['theme', 'doc']])
  })

  it('refuses an invalid document and the 21st theme; themes over the limit from other devices are kept', async () => {
    await expect(saveCustomTheme('bad', { ...NORD, seeds: { ...NORD.seeds, canvas: 'url(x)' } })).rejects.toThrow()
    for (let i = 0; i < MAX_CUSTOM_THEMES; i++) await saveCustomTheme(`th-${i}`, NORD)
    await expect(saveCustomTheme('th-21', NORD)).rejects.toThrow(/20 themes/)
    // A 21st arriving from another device offline is kept and listed.
    await applyOps([{ id: 'o1', entity: 'theme', entityId: 'remote', field: 'doc', value: { ...NORD, id: 'remote' }, ts: '9999999999999:0000:phone', device: 'phone' }] as never)
    expect(liveThemes(await db.themes.toArray())).toHaveLength(MAX_CUSTOM_THEMES + 1)
  })

  it('deleting the theme chosen for a side writes the side back in the same batch, and Undo restores both', async () => {
    await saveCustomTheme('th-d', NORD)
    await mutate('user_prefs', 'me', { theme_dark: 'user:th-d', theme_light: '' })
    const prefs = await db.userPrefs.get('me')
    const { entry } = await deleteCustomThemeUndoable('th-d', prefs)
    expect(entry).not.toBeNull()
    expect((await db.themes.get('th-d'))?.deleted_at).toBeGreaterThan(0)
    expect((await db.userPrefs.get('me'))?.theme_dark).toBe('')
    const rows = await db.themes.toArray()
    expect(readThemeChoices(await db.userPrefs.get('me'), null, knownCustom(liveThemes(rows))).dark).toMatchObject({ status: 'default', id: 'opentodo-dark' })
    await undoBatch(entry!.id)
    expect((await db.themes.get('th-d'))?.deleted_at).toBeNull()
    expect((await db.userPrefs.get('me'))?.theme_dark).toBe('user:th-d')
  })

  it('the loader applies a live custom theme of the side, and nothing for a deleted or other-kind one', async () => {
    await saveCustomTheme('th-n', NORD)
    const applied = await loadCustomAppliedTheme('th-n', undefined, 'dark')
    expect(applied?.id).toBe('th-n')
    expect(applied?.kind).toBe('dark')
    expect(await loadCustomAppliedTheme('th-n', undefined, 'light')).toBeNull()
    expect(await loadCustomAppliedTheme('missing', undefined, 'dark')).toBeNull()
    await mutate('theme', 'th-n', { deleted_at: 1 })
    expect(await loadCustomAppliedTheme('th-n', undefined, 'dark')).toBeNull()
  })
})

describe('Customise and New (design D4)', () => {
  it('Customise Nord: "Nord (custom)", by the user, crediting Nord, same licence, same colours', () => {
    const c = customiseDocument(NORD, 'Ana', 'th-c')
    expect(c).toMatchObject({ id: 'th-c', name: 'Nord (custom)', author: 'Ana', licence: 'MIT', kind: 'dark', seeds: NORD.seeds, tokens: NORD.tokens })
    expect(c.notes?.text).toMatch(/^Based on Nord by Sven Greb \(MIT\)/)
    expect(c.source).toBeUndefined()
    expect(validateTheme(c).ok).toBe(true)
  })

  it('New starts from the side\'s OpenTodo seeds with every token derived', () => {
    const n = newDocument(LIGHT, 'Ana', 'My theme', 'th-n')
    expect(n).toMatchObject({ id: 'th-n', name: 'My theme', kind: 'light', seeds: LIGHT.seeds })
    expect(n.tokens).toBeUndefined()
    expect(validateTheme(n).ok).toBe(true)
  })

  it('a name taken gets " (2)", then " (3)"', () => {
    expect(uniqueName('Nord', ['Other'])).toBe('Nord')
    expect(uniqueName('Nord', ['nord'])).toBe('Nord (2)')
    expect(uniqueName('Nord', ['Nord', 'Nord (2)'])).toBe('Nord (3)')
    expect(duplicateDocument(NORD, ['Nord'], 'th-x')).toMatchObject({ id: 'th-x', name: 'Nord (2)' })
  })
})
