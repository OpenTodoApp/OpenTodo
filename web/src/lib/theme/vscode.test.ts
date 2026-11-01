// Importing a VS Code colour theme (OpenSpec change theme-editor, task 5.2, design D12).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import dark from './testdata/vscode/dark.json?raw'
import light from './testdata/vscode/light.json?raw'
import comments from './testdata/vscode/comments.jsonc?raw'
import include from './testdata/vscode/include.json?raw'
import settings from './testdata/vscode/settings.json?raw'
import { validateTheme } from './format'
import { parseJsonc, stripJsonc } from './jsonc'
import { ansiToHues, importVsCodeTheme, MAX_VSCODE_BYTES, readVsColour } from './vscode'

let requests = 0
beforeEach(() => {
  requests = 0
  vi.stubGlobal('fetch', vi.fn(() => { requests++; return Promise.reject(new Error('no network')) }))
})
afterEach(() => vi.unstubAllGlobals())

const ok = (text: string, file = '') => {
  const r = importVsCodeTheme(text, file, undefined, 'th-vs')
  if (!r.ok) throw new Error(r.message)
  return r
}
const from = (r: ReturnType<typeof ok>, target: string) => r.report.mapped.find((m) => m.target === target)

describe('the JSONC reader', () => {
  it('reads comments and trailing commas and keeps strings as they are', () => {
    expect(parseJsonc('{"a": "x // y", /* c */ "b": [1, 2,], // d\n}')).toEqual({ a: 'x // y', b: [1, 2] })
    expect(stripJsonc('{"a":"/* not */"}')).toBe('{"a":"/* not */"}')
    expect(() => parseJsonc('{"a": }')).toThrow()
  })
})

describe('importVsCodeTheme', () => {
  it('maps a dark theme: canvas from the side bar, surface from the editor, accent from the button, six label hues', () => {
    const r = ok(dark)
    expect(r.doc.kind).toBe('dark')
    expect(r.doc.name).toBe('Harbour Night')
    expect(r.doc.licence).toBe('unknown')
    expect(from(r, 'canvas')).toMatchObject({ key: 'sideBar.background', value: '#151b26' })
    expect(from(r, 'surface')).toMatchObject({ key: 'editor.background', value: '#1b2230' })
    expect(from(r, 'accent')).toMatchObject({ key: 'button.background', value: '#3d7bd9' })
    expect(from(r, 'muted')).toMatchObject({ key: 'descriptionForeground' })
    expect(from(r, 'danger')).toMatchObject({ kind: 'seed', key: 'errorForeground' })
    expect(r.report.mapped.filter((m) => m.target.startsWith('hue-'))).toHaveLength(6)
    // A translucent shadow keeps its alpha on the scrim; the bar comes from the title bar.
    expect(r.doc.tokens?.scrim).toBe('#00000080')
    expect(r.doc.bar).toBe('#121722')
    expect(r.report.derived).toContain('text-strong')
    expect(r.report.ignored).toEqual(expect.arrayContaining(['statusBar.background', 'terminal.ansiBlack', 'tokenColors']))
    expect(validateTheme(r.doc).ok).toBe(true)
  })

  it('maps a light theme and composites translucent colours over the editor background', () => {
    const r = ok(light)
    expect(r.doc.kind).toBe('light')
    expect(from(r, 'hover')?.value).toMatch(/^#[0-9a-f]{6}$/)
    expect(from(r, 'hover')?.value).not.toBe('#fbfaf7')
    expect(from(r, 'danger')).toMatchObject({ key: 'editorError.foreground' })
    expect(validateTheme(r.doc).ok).toBe(true)
  })

  it('reads comments and trailing commas', () => {
    const r = ok(comments)
    expect(r.doc).toMatchObject({ name: 'Commented', kind: 'dark' })
    expect(from(r, 'accent')?.value).toBe('#c06030')
  })

  it('reports an include and does not follow it', () => {
    const r = ok(include)
    expect(r.report.include).toBe('./base.json')
    expect(requests).toBe(0)
  })

  it('refuses a settings file without colors, and a file over 1 MB', () => {
    const r = importVsCodeTheme(settings)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.message).toMatch(/not a VS Code colour theme/)
    expect(importVsCodeTheme(dark, '', MAX_VSCODE_BYTES + 1).ok).toBe(false)
    expect(requests).toBe(0)
  })

  it('names a theme without a name after its file; high-contrast types map to their kind', () => {
    const r = ok('{"type":"hcDark","colors":{"editor.background":"#000000"}}', 'midnight-color-theme.json')
    expect(r.doc.name).toBe('midnight')
    expect(r.report).toMatchObject({ kind: 'dark', highContrast: true })
  })
})

describe('colours', () => {
  it('reads #rgb, #rgba, #rrggbb and #rrggbbaa', () => {
    expect(readVsColour('#fff')).toMatchObject({ r: 1, g: 1, b: 1, a: 1 })
    expect(readVsColour('#0008')?.a).toBeCloseTo(0x88 / 255)
    expect(readVsColour('red')).toBeNull()
  })

  it('gives each ANSI colour the nearest free label hue, greys none', () => {
    const got = ansiToHues({ 'terminal.ansiRed': '#e06c75', 'terminal.ansiBlue': '#61afef', 'terminal.ansiBrightRed': '#e06c75', 'terminal.ansiGreen': '#808080' })
    expect(got.map((g) => g.key)).toEqual(expect.arrayContaining(['terminal.ansiRed', 'terminal.ansiBlue']))
    expect(got.find((g) => g.key === 'terminal.ansiGreen')).toBeUndefined()
    expect(new Set(got.map((g) => g.hue)).size).toBe(got.length)
  })
})
