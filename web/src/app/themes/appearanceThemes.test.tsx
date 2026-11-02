// @vitest-environment happy-dom
// Custom themes in Settings › Appearance (OpenSpec change theme-editor, tasks 2.1,
// 2.2): Your themes, the card menus, the 20-theme limit, the low-contrast mark,
// choosing a custom theme for its side, Customise and the delete of a chosen theme
// in one batch with Undo, all offline (the outbox only).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { mutate, resetDeviceId } from '../../lib/ops'
import { setAppearanceThemes } from '../../lib/appearance'
import { MAX_CUSTOM_THEMES, saveCustomTheme } from '../../lib/theme/custom'
import { readDraft } from '../../lib/theme/draft'
import type { ThemeDocument } from '../../lib/theme/format'
import { undoBatch } from '../../lib/undo'
import { click, render, waitFor } from '../../ui/test-utils'
import { AppearanceSection } from '../AppearanceSection'
const currentPath = () => location.pathname

const DOC = (over: Partial<ThemeDocument> = {}): ThemeDocument => ({
  opentodoTheme: 1, id: 'x', name: 'Night owl', author: 'Ana', licence: 'MIT', kind: 'dark',
  seeds: { canvas: '#1e2127', surface: '#282c34', text: '#e6e6e6', accent: '#61afef' }, ...over,
})

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  setAppearanceThemes({})
  history.replaceState(null, '', '/settings/appearance/theme')
})

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const fields = async () => (await db.outbox.toArray()).map((o) => `${o.entity}.${o.field}`)

describe('Your themes', () => {
  it('lists a custom theme in Your themes and in its side, and choosing it writes user:<id>', async () => {
    await saveCustomTheme('th-1', DOC())
    await db.outbox.clear()
    const r = await render(<AppearanceSection author="Ada" />)
    await waitFor(() => !!q('[data-custom-theme="th-1"]') && !!q('[data-theme-side="dark"] [data-theme-card="user:th-1"]'), 'the custom theme')
    expect(q('[data-your-themes-count]')!.textContent).toBe('1 of 20')
    await click(q('[data-theme-side="dark"] [data-theme-card="user:th-1"]')!)
    await waitFor(async () => (await db.userPrefs.get('me'))?.theme_dark === 'user:th-1', 'the choice')
    expect(await fields()).toEqual(['user_prefs.theme_dark'])
    await r.unmount()
  })

  it('marks a theme with failing pairs "Low contrast · n"', async () => {
    // Text barely darker than the surface: many pairs fail, and the theme is still kept.
    await saveCustomTheme('th-low', DOC({ tokens: { text: '#3a3f47', muted: '#30343a' } }))
    const r = await render(<AppearanceSection />)
    await waitFor(() => !!q('[data-theme-low-contrast]'), 'the low-contrast mark', 20_000)
    expect(q('[data-theme-low-contrast]')!.textContent).toMatch(/^Low contrast · \d+$/)
    await r.unmount()
  })

  it('at 20 themes New, Import and Customise are unavailable and say why', async () => {
    for (let i = 0; i < MAX_CUSTOM_THEMES; i++) await saveCustomTheme(`th-${i}`, DOC({ name: `Theme ${i}` }))
    const r = await render(<AppearanceSection />)
    await waitFor(() => !!q('[data-theme-limit]'), 'the limit note')
    expect(q('[data-theme-limit]')!.textContent).toBe('You have 20 themes; delete one to add another.')
    expect(q<HTMLButtonElement>('[data-theme-new]')!.disabled).toBe(true)
    expect(q<HTMLButtonElement>('[data-theme-import]')!.disabled).toBe(true)
    // A template can still be downloaded: it adds nothing.
    expect(q<HTMLButtonElement>('[data-theme-template]')!.disabled).toBe(false)
    await r.unmount()
  })

  it('Download a template saves a starter file of the theme in use that reads back as that theme', async () => {
    await saveCustomTheme('th-1', DOC())
    const files: { name: string; blob: Blob }[] = []
    const create = URL.createObjectURL
    let last: Blob | null = null
    URL.createObjectURL = (b: Blob) => { last = b; return 'blob:template' }
    const clickA = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { if (last) files.push({ name: this.download, blob: last }) }
    try {
      const r = await render(<AppearanceSection author="Ada" />)
      await waitFor(() => !!q('[data-theme-template]'), 'the button')
      await click(q('[data-theme-template]')!)
      await waitFor(() => files.length === 1, 'the file', 20_000)
      expect(files[0].name).toMatch(/-template\.opentodo-theme\.jsonc$/)
      const text = await files[0].blob.text()
      expect(text).toContain('"$schema"')
      expect(text).toContain('// "muted":')
      const { readThemeFile } = await import('../../lib/theme/files')
      expect(readThemeFile(text).ok).toBe(true)
      await r.unmount()
    } finally {
      URL.createObjectURL = create
      HTMLAnchorElement.prototype.click = clickA
    }
  })

  it('Customise on a built-in card opens the editor on an unsaved copy that credits it', async () => {
    const r = await render(<AppearanceSection author="Ada" />)
    await waitFor(() => !!q('[data-theme-menu="opentodo-dark"]'), 'the card menu')
    await click(q('[data-theme-menu="opentodo-dark"]')!)
    await waitFor(() => !!q('[data-theme-customise="opentodo-dark"]'), 'the menu')
    await click(q('[data-theme-customise="opentodo-dark"]')!)
    await waitFor(() => currentPath().startsWith('/settings/appearance/themes/'), 'the editor address', 20_000)
    const id = currentPath().split('/').pop()!
    const draft = readDraft(id)!
    expect(draft.doc).toMatchObject({ id, name: 'OpenTodo Dark (custom)', author: 'Ada', kind: 'dark', licence: 'AGPL-3.0-only' })
    expect(draft.doc.notes?.text).toMatch(/^Based on OpenTodo Dark by OpenTodo contributors/)
    expect(await db.outbox.count()).toBe(0)
    await r.unmount()
  })

  it('deleting the chosen theme sets the side back in one batch; Undo restores both', async () => {
    await saveCustomTheme('th-d', DOC())
    await mutate('user_prefs', 'me', { theme_dark: 'user:th-d' })
    await db.outbox.clear()
    const r = await render(<AppearanceSection />)
    await waitFor(() => !!q('[data-custom-theme="th-d"] [data-theme-menu="th-d"]'), 'the card menu')
    await click(q('[data-custom-theme="th-d"] [data-theme-menu="th-d"]')!)
    await waitFor(() => !!q('[data-theme-delete="th-d"]'), 'the menu')
    await click(q('[data-theme-delete="th-d"]')!)
    await waitFor(async () => (await db.userPrefs.get('me'))?.theme_dark === '', 'the side back to its default')
    expect((await db.themes.get('th-d'))?.deleted_at).toBeGreaterThan(0)
    expect((await fields()).sort()).toEqual(['theme.deleted_at', 'user_prefs.theme_dark'])
    const entry = (await db.assistantUndo.toArray()).pop()!
    await undoBatch(entry.id)
    expect((await db.userPrefs.get('me'))?.theme_dark).toBe('user:th-d')
    expect((await db.themes.get('th-d'))?.deleted_at).toBeNull()
    await r.unmount()
  })
})
