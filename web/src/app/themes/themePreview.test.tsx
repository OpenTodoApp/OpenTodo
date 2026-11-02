// @vitest-environment happy-dom
// The live preview (OpenSpec change theme-editor, task 4.6, design D9): the preview's
// surface follows the draft while the page root keeps the active theme; the preview
// is inert and described; the counterpart keeps the accent and passes every pair.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { resetDeviceId } from '../../lib/ops'
import { checkTheme } from '../../lib/theme/check'
import { counterpartDocument } from '../../lib/theme/counterpart'
import { deriveTheme } from '../../lib/theme/derive'
import type { ThemeDocument } from '../../lib/theme/format'
import light from '../../lib/theme/builtin/opentodo-light.json'
import nord from '../../lib/theme/builtin/nord.json'
import { render } from '../../ui/test-utils'
import { PREVIEW_TABS, PreviewSurface } from './ThemePreview'

const DOC = { opentodoTheme: 1, id: 'p', name: 'P', author: '', licence: 'CC0-1.0', kind: 'light', seeds: (light as unknown as ThemeDocument).seeds } as ThemeDocument

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  document.documentElement.removeAttribute('style')
})

describe('the preview', () => {
  it('carries the draft on its own subtree and leaves the page root alone, on every screen', async () => {
    const a = deriveTheme({ ...DOC, seeds: { ...DOC.seeds, surface: '#fff8e7' } })
    for (const tab of PREVIEW_TABS) {
      const r = await render(<PreviewSurface resolved={a} kind="light" tab={tab} />)
      const el = document.querySelector<HTMLElement>(`[data-theme-preview="${tab}"]`)!
      expect(el.style.getPropertyValue('--ot-surface')).toBe(a.tokens.surface)
      expect(el.hasAttribute('inert')).toBe(true)
      expect(el.getAttribute('aria-label')).toMatch(/^Preview of the theme on /)
      expect(document.documentElement.style.getPropertyValue('--ot-surface')).toBe('')
      expect(document.documentElement.hasAttribute('data-ot-theme')).toBe(false)
      await r.unmount()
    }
    // Changing the surface changes the board's columns' surface at once.
    const b = deriveTheme({ ...DOC, seeds: { ...DOC.seeds, surface: '#e7f3ff' } })
    const r = await render(<PreviewSurface resolved={b} kind="light" tab="board" />)
    expect(document.querySelector<HTMLElement>('[data-theme-preview="board"]')!.style.getPropertyValue('--ot-surface')).toBe(b.tokens.surface)
    expect(b.tokens.surface).not.toBe(a.tokens.surface)
    await r.unmount()
  })

  it('never reads the user\'s own data', async () => {
    await db.tasks.put({ id: 'mine', title: 'My private task' } as never)
    const r = await render(<PreviewSurface resolved={deriveTheme(DOC)} kind="light" tab="list" />)
    expect(document.body.textContent).not.toContain('My private task')
    expect(document.body.textContent).toContain('Choose the paint for the hallway')
    await r.unmount()
  })
})

describe('the counterpart (design D9)', () => {
  it('keeps the accent and status seeds, mirrors the surfaces and text, and passes every pair', () => {
    for (const src of [DOC, nord as unknown as ThemeDocument]) {
      const c = counterpartDocument(src, 'c', 'C')
      expect(c.kind).toBe(src.kind === 'light' ? 'dark' : 'light')
      expect(c.seeds.accent).toBe(src.seeds.accent)
      for (const s of ['success', 'warning', 'danger', 'info']) expect(c.seeds[s]).toBe(src.seeds[s])
      expect(c.tokens).toBeUndefined()
      expect(checkTheme(deriveTheme(c))).toEqual([])
    }
  })
})
