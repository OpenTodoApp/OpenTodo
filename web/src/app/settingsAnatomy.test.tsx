// @vitest-environment happy-dom
// Settings card anatomy (OpenSpec change ux-overhaul, settings-navigation "Panel
// cards and rows", design D6): every card is a SettingsSection with heading,
// description and rows; no button or help link in a card header, and no native
// select in a settings panel. A source lint, in the style of the token lint; the
// card tiers (surfaces-v2 D9) are checked on the rendered pages.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../lib/types'
import { SettingRow, SettingsSection } from '../ui'
import { flush, render } from '../ui/test-utils'
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

/** Every primary card of a rendered page beyond the first, named by page and heading (surfaces-v2 D9). */
function primaryOffenders(page: string, root: ParentNode): string[] {
  const primary = [...root.querySelectorAll('[data-settings-card][data-tier="primary"]')]
  if (primary.length <= 1) return []
  const names = primary.map((c) => `"${c.querySelector('h2, h3')?.textContent ?? '?'}"`)
  return [`${page}: ${primary.length} primary cards (${names.join(', ')})`]
}

describe('card tiers (surfaces-v2 D9)', () => {
  const owner: User = { id: 'u1', email: 'ada@example.com', name: 'Ada', role: 'owner', createdAt: 1 }
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({
      matches: Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? 0) <= 1280, media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  })
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

  it('a section has the same heading, line and rows in both tiers; only the surface differs', async () => {
    const section = (tier: 'primary' | 'flat') => (
      <SettingsSection title="Backups" description="Snapshots of this server." learnMore="settings/server" tier={tier}>
        <SettingRow label="Schedule" description="Every night." control={<button type="button">Change</button>} />
      </SettingsSection>
    )
    const a = await render(section('primary'))
    const b = await render(section('flat'))
    const [p, f] = [a.container.querySelector('[data-settings-card]')!, b.container.querySelector('[data-settings-card]')!]
    expect(p.getAttribute('data-tier')).toBe('primary')
    expect(f.getAttribute('data-tier')).toBe('flat')
    expect(f.className).toBe('ui-section-flat')
    expect(p.className).toContain('shadow-1')
    const strip = (html: string) => html.replace(/ id="[^"]*"| aria-labelledby="[^"]*"/g, '')
    expect(strip(f.innerHTML)).toBe(strip(p.innerHTML))
    await a.unmount()
    await b.unmount()
  })

  it('a page with two primary cards is named with both cards', async () => {
    const r = await render(<>
      <SettingsSection title="Backups" tier="primary"><SettingRow label="A" /></SettingsSection>
      <SettingsSection title="Archive" tier="primary"><SettingRow label="B" /></SettingsSection>
    </>)
    expect(primaryOffenders('server', r.container)).toEqual(['server: 2 primary cards ("Backups", "Archive")'])
    await r.unmount()
  })

  it('every rendered settings page has at most one primary card', async () => {
    const offenders: string[] = []
    let primaries = 0
    for (const page of SETTINGS_SECTION_IDS) {
      const r = await render(<SettingsView user={owner} onLogout={() => {}} section={page} />)
      await flush(40)
      offenders.push(...primaryOffenders(page, r.container))
      primaries += r.container.querySelectorAll('[data-tier="primary"]').length
      await r.unmount()
    }
    expect(offenders).toEqual([])
    expect(primaries).toBeGreaterThan(5)
  })
})
