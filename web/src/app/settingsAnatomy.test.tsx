// @vitest-environment happy-dom
// Settings card anatomy (OpenSpec change ux-overhaul, settings-navigation "Panel
// cards and rows", design D6): every card is a SettingsSection with heading,
// description and rows; no button or help link in a card header, and no native
// select in a settings panel. A source lint, in the style of the token lint; the
// flat pages (precision-settings D3) are checked on the rendered pages.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../lib/types'
import { SettingRow, SettingsSection } from '../ui'
import { flush, render, minWidthPx } from '../ui/test-utils'
import { SETTINGS_SECTION_IDS } from './router'
import { SettingsView } from './SettingsView'

vi.mock('./SsoPanel', async (orig) => ({ ...(await orig<typeof import('./SsoPanel')>()), SsoPanel: () => <div /> }))

const sources = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx', '!./**/*.stories.tsx'], { query: '?raw', import: 'default', eager: true })

/** Files that render settings cards. */
const panels = Object.entries(sources).filter(([, src]) => /<SettingsSection\b/.test(src))

describe('settings cards', () => {
  it('render cards through SettingsSection in a good number of files', () => {
    expect(panels.length).toBeGreaterThan(20)
  })

  it('put no action and no help link in a card header', () => {
    const offenders: string[] = []
    for (const [path, src] of panels) {
      for (const m of src.matchAll(/<SettingsSection\b[^>]*?(?:\sactions=|\shelpId=)/gs)) offenders.push(`${path}: ${m[0].slice(0, 60)}…`)
      if (/<HelpLink\b|<HelpHeading\b/.test(src)) offenders.push(`${path}: renders a help link; the page header carries Help`)
    }
    expect(offenders).toEqual([])
  })

  it('reach Help only through a card\'s Learn more (settings-copy D3)', () => {
    const offenders = panels.filter(([, src]) => /\bopenHelp\(|data-help-screen=/.test(src)).map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('use the design-system Select, never a native select, in settings panels', () => {
    const offenders = panels.filter(([, src]) => /<select\b/.test(src)).map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('the primitive itself has no header slot for actions or help', () => {
    const primitive = import.meta.glob<string>('../ui/patterns/SettingsSection.tsx', { query: '?raw', import: 'default', eager: true })
    const src = Object.values(primitive)[0]
    expect(src).not.toMatch(/actions\??:/)
    expect(src).not.toMatch(/helpId/)
    expect(src).toMatch(/data-setting-status/)
  })
})

/** Sections of a rendered page drawn as a card surface, named by page and heading (precision-settings D3). */
function cardOffenders(page: string, root: ParentNode): string[] {
  return [...root.querySelectorAll('[data-settings-card]')]
    .filter((c) => /\b(shadow-1|rounded-card|bg-surface|bg-raised)\b/.test(c.className))
    .map((c) => `${page}: "${c.querySelector('h2, h3')?.textContent ?? '?'}" is drawn as a card`)
}

describe('flat settings pages (precision-settings D3)', () => {
  const owner: User = { id: 'u1', email: 'ada@example.com', name: 'Ada', role: 'owner', createdAt: 1 }
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({
      matches: minWidthPx(q) <= 1280, media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  })
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

  it('a section is a label-size heading, its line and rows between hairlines, with no icon', async () => {
    const r = await render(
      <SettingsSection title="Backups" icon="archive" description="Snapshots of this server." learnMore="settings/server">
        <SettingRow label="Schedule" description="Every night." control={<button type="button">Change</button>} />
      </SettingsSection>,
    )
    const card = r.container.querySelector('[data-settings-card]')!
    expect(card.className).toBe('ui-settings-section')
    expect(card.querySelector('h2')!.className).toContain('text-meta')
    expect(card.querySelector('svg')).toBeNull()
    expect(card.querySelector('[data-setting-control]')!.parentElement!.parentElement!.className).toContain('border-y')
    expect(card.querySelector('[data-setting-control]')).not.toBeNull()
    await r.unmount()
  })

  it('a section drawn as a card is named with its page', async () => {
    const r = await render(<section data-settings-card className="rounded-card bg-surface shadow-1"><h2>Backups</h2></section>)
    expect(cardOffenders('server', r.container)).toEqual(['server: "Backups" is drawn as a card'])
    await r.unmount()
  })

  it('no rendered settings page draws a section as a card', async () => {
    const offenders: string[] = []
    let sections = 0
    for (const page of SETTINGS_SECTION_IDS) {
      const r = await render(<SettingsView user={owner} onLogout={() => {}} section={page} />)
      await flush(40)
      offenders.push(...cardOffenders(page, r.container))
      sections += r.container.querySelectorAll('[data-settings-card]').length
      await r.unmount()
    }
    expect(offenders).toEqual([])
    expect(sections).toBeGreaterThan(20)
  })
})
