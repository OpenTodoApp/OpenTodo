// Settings card anatomy (OpenSpec change ux-overhaul, settings-navigation "Panel
// cards and rows", design D6): every card is a SettingsSection with heading,
// description and rows; no button or help link in a card header, and no native
// select in a settings panel. A source lint, in the style of the token lint.
import { describe, expect, it } from 'vitest'

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
