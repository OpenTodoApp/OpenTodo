// @vitest-environment happy-dom
// The theme editor (OpenSpec change theme-editor, tasks 4.1 to 4.8): routing and
// Back, seeds with live derivation, the Advanced list, history and per-token Undo,
// the draft and the leave prompt, live contrast with Fix and its announcement,
// shape and type in the preview without a font request, and the encryption note.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { publishEncryption } from '../../lib/e2ee'
import { resetDeviceId } from '../../lib/ops'
import { saveCustomTheme } from '../../lib/theme/custom'
import { readDraft, writeDraft } from '../../lib/theme/draft'
import type { ThemeDocument } from '../../lib/theme/format'
import light from '../../lib/theme/builtin/opentodo-light.json'
import { click, key, render, type, waitFor } from '../../ui/test-utils'
import { navigate, parseRoute } from '../router'
import { colourToHex } from '../../lib/theme/oklch'
import { ThemeEditorPage } from './ThemeEditor'

const SEEDS = (light as unknown as ThemeDocument).seeds
const DOC = (over: Partial<ThemeDocument> = {}): ThemeDocument => ({
  opentodoTheme: 1, id: 'th-e', name: 'Morning', author: 'Ana', licence: 'CC0-1.0', kind: 'light', seeds: { ...SEEDS }, ...over,
})

let requests: string[] = []
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  publishEncryption({ enabled: false })
  navigate({ view: 'inbox' })
  navigate({ view: 'theme-editor', id: 'th-e' })
  requests = []
  vi.stubGlobal('fetch', vi.fn(async (u: RequestInfo | URL) => { requests.push(String(u)); return new Response('{}', { status: 404 }) }))
})
afterEach(() => vi.unstubAllGlobals())

const q = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)
const row = (tok: string) => q(`[data-token-row="${tok}"]`)!
const preview = () => q('[data-theme-preview]')!
const ready = () => waitFor(() => !!q('[data-theme-contrast-count]') && q('[data-theme-contrast-count]')!.getAttribute('data-theme-contrast-count') !== '', 'the first resolution', 20_000)

async function setRange(input: HTMLInputElement, value: number) {
  await type(input, String(value))
}

/** Opens a colour field's picker and returns it. */
async function openPicker(swatch: HTMLElement) {
  await click(swatch)
  await waitFor(() => !!q('[data-colour-picker]'), 'the picker')
  return q('[data-colour-picker]')!
}

describe('the editor page', () => {
  it('opens at /settings/appearance/themes/<id>, and Back returns to Appearance', async () => {
    expect(parseRoute('/settings/appearance/themes/th-e')).toEqual({ view: 'theme-editor', id: 'th-e' })
    await saveCustomTheme('th-e', DOC())
    const r = await render(<ThemeEditorPage id="th-e" />)
    await ready()
    expect(q<HTMLInputElement>('[data-theme-name]')!.value).toBe('Morning')
    await click(q('[data-testid="theme-editor-header"] [data-page-back]')!)
    expect(location.pathname).toBe('/settings/appearance/theme')
    await r.unmount()
  })

  it('says when the theme does not exist', async () => {
    const r = await render(<ThemeEditorPage id="nope" />)
    await waitFor(() => !!q('[data-theme-editor-missing]'), 'the missing state')
    await r.unmount()
  })

  it('changing the accent seed updates derived tokens and keeps a set one', async () => {
    await saveCustomTheme('th-e', DOC({ tokens: { 'accent-text': '#0b5e3a' } }))
    await db.outbox.clear()
    const r = await render(<ThemeEditorPage id="th-e" />)
    await ready()
    const before = preview().style.getPropertyValue('--ot-accent')
    const picker = await openPicker(q('[data-theme-seed="accent"] [data-colour-swatch]')!)
    await setRange(q<HTMLInputElement>('[data-colour-axis="H"]', picker)!, 30)
    await waitFor(() => preview().style.getPropertyValue('--ot-accent') !== before, 'the accent to follow', 20_000)
    expect(preview().style.getPropertyValue('--ot-accent-hover')).not.toBe('')
    expect(readDraft('th-e')!.doc.tokens!['accent-text']).toBe('#0b5e3a')
    expect(readDraft('th-e')!.doc.seeds.accent).toMatch(/^oklch\(/)
    // Nothing is written before Save.
    expect(await db.outbox.count()).toBe(0)
    await r.unmount()
  })

  it('a base colour is a compact row: typing a hex sets it, and its contrast warning shows beside it', async () => {
    // Text set almost the colour of the surface: it fails, and the Text row says so beside the colour.
    await saveCustomTheme('th-e', DOC({ tokens: { text: '#dddddd' } }))
    const r = await render(<ThemeEditorPage id="th-e" />)
    await ready()
    await waitFor(() => !!q('[data-theme-seed="text"] [data-colour-warning]'), 'the warning beside Text', 20_000)
    expect(q('[data-theme-seed="text"] [data-colour-warning]')!.textContent).toMatch(/pairs? below AA/)
    const hex = q<HTMLInputElement>('[data-theme-seed="accent"] [data-colour-row-hex]')!
    expect(hex.getAttribute('aria-label')).toBe('Accent, hex value')
    await type(hex, '#1d4ed8')
    await key(hex, 'Enter')
    await waitFor(() => readDraft('th-e')?.doc.seeds.accent === '#1d4ed8', 'the seed set')
    // Not a colour: said on the row, nothing written.
    await type(hex, 'blue')
    await key(hex, 'Enter')
    await waitFor(() => q('[data-theme-seed="accent"] [data-colour-warning]')?.textContent === 'Enter a colour as #rrggbb or #rgb.', 'the hex error')
    expect(readDraft('th-e')!.doc.seeds.accent).toBe('#1d4ed8')
    await r.unmount()
  })

  it('Advanced is folded with its counts until opened', async () => {
    await saveCustomTheme('th-e', DOC({ tokens: { faint: '#62686f' } }))
    const r = await render(<ThemeEditorPage id="th-e" />)
    await ready()
    const details = q<HTMLDetailsElement>('[data-theme-advanced-details]')!
    expect(details.open).toBe(false)
    expect(q('[data-theme-advanced-counts]')!.textContent).toBe('1 set')
    await r.unmount()
  })

  it('the Advanced list filters by name and id, and setting a token makes it Set', async () => {
    await saveCustomTheme('th-e', DOC())
    const r = await render(<ThemeEditorPage id="th-e" />)
    await ready()
    await type(q<HTMLInputElement>('[data-theme-token-filter]')!, 'muted')
    await waitFor(() => !!q('[data-token-row="muted"]') && !q('[data-token-row="canvas"]'), 'the filtered list')
    expect(row('muted').getAttribute('data-token-state')).toBe('derived')
    const before = preview().style.getPropertyValue('--ot-muted')
    const picker = await openPicker(q('[data-colour-swatch]', row('muted'))!)
    const hex = q<HTMLInputElement>('[data-colour-hex]', picker)!
    await type(hex, '#6b7280')
    await key(hex, 'Enter')
    await waitFor(() => row('muted').getAttribute('data-token-state') === 'set', 'muted set')
    await waitFor(() => preview().style.getPropertyValue('--ot-muted') !== before, 'the preview to follow', 20_000)
    expect(colourToHex(preview().style.getPropertyValue('--ot-muted'))).toBe('#6b7280')
    // The filter matches the id too, and English names.
    await type(q<HTMLInputElement>('[data-theme-token-filter]')!, 'border-input')
    await waitFor(() => !!q('[data-token-row="border-input"]'), 'by id')
    await r.unmount()
  })

  it('Reset makes a set token derived again; its Undo brings the value back; Ctrl+Z undoes', async () => {
    await saveCustomTheme('th-e', DOC({ tokens: { faint: '#777777' } }))
    const r = await render(<ThemeEditorPage id="th-e" />)
    await ready()
    await type(q<HTMLInputElement>('[data-theme-token-filter]')!, 'faint')
    await waitFor(() => !!q('[data-token-row="faint"] [data-token-reset]'), 'the reset button')
    await click(q('[data-token-row="faint"] [data-token-reset]')!)
    await waitFor(() => row('faint').getAttribute('data-token-state') === 'derived', 'faint derived')
    await click(q('[data-token-row="faint"] [data-token-undo]')!)
    await waitFor(() => row('faint').getAttribute('data-token-state') === 'set', 'faint set again')
    await click(q('[data-theme-undo]')!)
    await waitFor(() => row('faint').getAttribute('data-token-state') === 'derived', 'undone')
    await r.unmount()
  })

  it('a draft survives a reload; Save writes one op and says how many pairs fail', async () => {
    await saveCustomTheme('th-e', DOC())
    await db.outbox.clear()
    writeDraft('th-e', { v: 1, doc: DOC({ tokens: { muted: '#b8bcc2', faint: '#c4c8cc', border: '#d0d3d6' } }), base: JSON.stringify({ ...DOC(), id: 'th-e' }) })
    const r = await render(<ThemeEditorPage id="th-e" />)
    await ready()
    expect(q('[data-theme-editor]')!.hasAttribute('data-theme-dirty')).toBe(true)
    expect(await db.outbox.count()).toBe(0)
    await click(q('[data-theme-save]')!)
    await waitFor(async () => (await db.outbox.count()) === 1, 'one op')
    expect((await db.outbox.toArray())[0].field).toBe('doc')
    expect(readDraft('th-e')).toBeNull()
    await r.unmount()
  })

  it('leaving with unsaved changes asks: Keep editing stays, Discard leaves', async () => {
    await saveCustomTheme('th-e', DOC())
    const r = await render(<ThemeEditorPage id="th-e" />)
    await ready()
    await type(q<HTMLInputElement>('[data-theme-name]')!, 'Evening')
    await waitFor(() => q('[data-theme-editor]')!.hasAttribute('data-theme-dirty'), 'dirty')
    await click(q('[data-testid="theme-editor-header"] [data-page-back]')!)
    await waitFor(() => !!q('[data-theme-discard]'), 'the leave prompt')
    await click(q('[data-theme-discard]')!)
    expect(location.pathname).toBe('/settings/appearance/theme')
    expect(readDraft('th-e')).toBeNull()
    await r.unmount()
  })

  it('a failing pair can be fixed, and the result and the count are announced', async () => {
    await saveCustomTheme('th-e', DOC({ tokens: { muted: 'oklch(0.75 0.05 250)' } }))
    const r = await render(<ThemeEditorPage id="th-e" />)
    await ready()
    const count = () => Number(q('[data-theme-contrast-count]')!.getAttribute('data-theme-contrast-count'))
    expect(count()).toBeGreaterThan(0)
    const before = count()
    const fix = q('[data-theme-failure^="muted/"] [data-theme-fix]')!
    await click(fix)
    await waitFor(() => /^Muted text now \d+\.\d to 1 on /.test(q('[data-theme-announce]')!.textContent ?? ''), 'the fix announced', 20_000)
    await waitFor(() => count() < before, 'fewer failing pairs', 20_000)
    await waitFor(() => /pairs? below AA|Every pair reaches AA/.test(q('[data-theme-announce]')!.textContent ?? ''), 'the count announced', 20_000)
    await r.unmount()
  })

  it('radius and an installed font apply in the preview, and no font is requested', async () => {
    await saveCustomTheme('th-e', DOC())
    const r = await render(<ThemeEditorPage id="th-e" />)
    await ready()
    await click(q('[data-theme-radius] [role="radio"]:nth-child(3)')!)
    await waitFor(() => preview().style.getPropertyValue('--ot-radius-card') === '12px', 'the round corners', 20_000)
    await click(q('[data-theme-font] [role="radio"]:last-child')!)
    await waitFor(() => !!q('[data-theme-local-font]'), 'the font name field')
    await type(q<HTMLInputElement>('[data-theme-local-font]')!, 'Atkinson Hyperlegible')
    await waitFor(() => preview().style.getPropertyValue('--ot-font').startsWith('"Atkinson Hyperlegible"'), 'the font in the preview', 20_000)
    expect(requests).toEqual([])
    await r.unmount()
  })

  it('on an encrypted account says that themes are not encrypted', async () => {
    publishEncryption({ enabled: true })
    await saveCustomTheme('th-e', DOC())
    const r = await render(<ThemeEditorPage id="th-e" />)
    await ready()
    expect(document.body.textContent).toContain('Themes are not encrypted. Don\'t put private information in a theme\'s name or notes.')
    await r.unmount()
  })
})
