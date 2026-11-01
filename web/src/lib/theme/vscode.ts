// Importing a VS Code colour theme (OpenSpec change theme-editor, design D12): a
// file of at most 1 MB read with a small JSONC reader; its kind and its workbench
// `colors` mapped onto OpenTodo's seeds and tokens by one written table (first key
// present wins), translucent colours composited over what they sit on, the
// terminal's ANSI colours given to the nearest label hues, everything else left
// to the derivation. Syntax colours are ignored (there is no code editor) and
// `include` is reported, never followed: the importer reads one file and never
// fetches. The report says what was mapped, derived and ignored. Lazy chunk.
import { composite, hexToRgb, toHex, type Rgba } from '../colourMath'
import { t } from '../i18n'
import { THEME_FORMAT, type ThemeDocument, type ThemeKind } from './format'
import { parseJsonc } from './jsonc'
import { parseOklch } from './oklch'
import { HUES, THEME_TOKENS, type Hue } from './tokens'
import { uuid } from '../ids'

/** The largest VS Code theme file the importer reads (design D12). */
export const MAX_VSCODE_BYTES = 1024 * 1024

/** Seeds and tokens, each from the first VS Code key the file has (design D12). */
export const SEED_KEYS: Record<string, readonly string[]> = {
  canvas: ['sideBar.background', 'activityBar.background', 'editor.background'],
  surface: ['editor.background'],
  text: ['editor.foreground', 'foreground'],
  accent: ['button.background', 'focusBorder', 'textLink.foreground'],
  danger: ['errorForeground', 'editorError.foreground'],
  warning: ['editorWarning.foreground'],
  info: ['editorInfo.foreground'],
  success: ['gitDecoration.addedResourceForeground', 'terminal.ansiGreen'],
}

export const TOKEN_KEYS: Record<string, readonly string[]> = {
  'on-accent': ['button.foreground'],
  'accent-hover': ['button.hoverBackground'],
  'accent-text': ['textLink.foreground'],
  focus: ['focusBorder'],
  muted: ['descriptionForeground'],
  faint: ['disabledForeground', 'editorLineNumber.foreground'],
  raised: ['editorWidget.background', 'menu.background', 'quickInput.background'],
  pop: ['editorWidget.background', 'menu.background', 'quickInput.background'],
  sunken: ['input.background'],
  hover: ['list.hoverBackground'],
  selected: ['list.activeSelectionBackground'],
  'selected-row': ['list.inactiveSelectionBackground'],
  border: ['panel.border', 'sideBar.border', 'editorGroup.border'],
  'border-soft': ['panel.border', 'sideBar.border', 'editorGroup.border'],
  'border-input': ['input.border'],
  'line-strong': ['widget.border', 'contrastBorder'],
  highlight: ['editor.findMatchHighlightBackground'],
  scrim: ['widget.shadow'],
}

export const BAR_KEYS = ['titleBar.activeBackground'] as const
const ANSI = ['Red', 'Yellow', 'Green', 'Cyan', 'Blue', 'Magenta'] as const
export const ANSI_KEYS = [...ANSI.map((c) => `terminal.ansi${c}`), ...ANSI.map((c) => `terminal.ansiBright${c}`)]

/** OpenTodo's label hues by angle (reference.json, light), slate left out: it is a grey. */
const HUE_ANGLE: Partial<Record<Hue, number>> = { red: 27.33, orange: 41.12, yellow: 58.32, lime: 131.59, green: 149.21, teal: 184.7, cyan: 221.72, blue: 262.88, indigo: 276.97, violet: 293.01, pink: 0.58 }
/** A bright ANSI colour takes a free label hue only this close (degrees). */
const BRIGHT_REACH = 30
/** Below this chroma an ANSI colour is a grey and gives no hue. */
const GREY = 0.03

export interface MappedValue {
  /** A seed, a document token or `bar`. */
  target: string
  kind: 'seed' | 'token' | 'bar'
  /** The VS Code key it came from. */
  key: string
  value: string
}

export interface VsCodeReport {
  name: string
  kind: ThemeKind
  /** The file's type was a high-contrast one (hcLight, hcDark). */
  highContrast: boolean
  mapped: MappedValue[]
  /** Document tokens left to the derivation. */
  derived: string[]
  /** `colors` keys not used, and the other top-level keys (tokenColors, semanticTokenColors). */
  ignored: string[]
  /** The file named another file to include; it was not read. */
  include?: string
}

export type VsCodeResult = { ok: true; doc: ThemeDocument; report: VsCodeReport } | { ok: false; message: string }

const HEXISH = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** A VS Code colour (#rgb, #rgba, #rrggbb, #rrggbbaa) as sRGB with alpha; null for anything else. */
export function readVsColour(v: unknown): Rgba | null {
  if (typeof v !== 'string' || !HEXISH.test(v.trim())) return null
  let h = v.trim().slice(1)
  if (h.length <= 4) h = [...h].map((c) => c + c).join('')
  const c = hexToRgb(`#${h.slice(0, 6)}`)
  return { ...c, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 }
}

/** The angular distance of two hues. */
const hueDistance = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

/** Gives the ANSI colours to label hues: the six normal ones to their nearest free hue, then the bright ones within reach. */
export function ansiToHues(colors: Record<string, string>): { hue: Hue; key: string; value: string }[] {
  const out: { hue: Hue; key: string; value: string }[] = []
  const free = new Set<Hue>(Object.keys(HUE_ANGLE) as Hue[])
  for (const [i, key] of ANSI_KEYS.entries()) {
    const value = colors[key]
    const c = value ? parseOklch(value) : null
    if (!c || c.C < GREY) continue
    let best: Hue | null = null
    for (const h of free) if (!best || hueDistance(c.H, HUE_ANGLE[h]!) < hueDistance(c.H, HUE_ANGLE[best]!)) best = h
    if (!best || (i >= ANSI.length && hueDistance(c.H, HUE_ANGLE[best]!) > BRIGHT_REACH)) continue
    free.delete(best)
    out.push({ hue: best, key, value })
  }
  return out.sort((a, b) => HUES.indexOf(a.hue) - HUES.indexOf(b.hue))
}

const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The kind of a VS Code `type`, or of the editor background when the type is missing. */
function kindOf(type: unknown, background: Rgba | null): { kind: ThemeKind; highContrast: boolean } {
  if (type === 'light' || type === 'vs') return { kind: 'light', highContrast: false }
  if (type === 'dark' || type === 'vs-dark') return { kind: 'dark', highContrast: false }
  if (type === 'hcLight') return { kind: 'light', highContrast: true }
  if (type === 'hcDark' || type === 'hc-black') return { kind: 'dark', highContrast: true }
  const lum = background ? 0.2126 * background.r + 0.7152 * background.g + 0.0722 * background.b : 0
  return { kind: lum > 0.5 ? 'light' : 'dark', highContrast: false }
}

/** Reads a VS Code colour theme file and maps it (design D12). `fileName` names the theme when the file has no name. */
export function importVsCodeTheme(text: string, fileName = '', bytes = new TextEncoder().encode(text).length, id = uuid()): VsCodeResult {
  if (bytes > MAX_VSCODE_BYTES) return { ok: false, message: t('The file is larger than 1 MB.') }
  let value: unknown
  try {
    value = parseJsonc(text)
  } catch {
    return { ok: false, message: t('The file is not valid JSON.') }
  }
  if (!plain(value) || !plain(value.colors)) return { ok: false, message: t('This file is not a VS Code colour theme: it has no colors.') }
  const raw = value.colors as Record<string, unknown>
  const surfaceRaw = readVsColour(raw['editor.background'])
  const { kind, highContrast } = kindOf(value.type, surfaceRaw)
  // What colours sit on: the editor background, else the kind's plain one.
  const ground: Rgba = surfaceRaw && surfaceRaw.a >= 1 ? surfaceRaw : surfaceRaw ? composite(surfaceRaw, kind === 'light' ? hexToRgb('#ffffff') : hexToRgb('#1e1e1e')) : hexToRgb(kind === 'light' ? '#ffffff' : '#1e1e1e')
  const opaque = (key: string): string | null => {
    const c = readVsColour(raw[key])
    if (!c) return null
    return toHex(c.a >= 1 ? c : composite(c, ground))
  }
  const used = new Set<string>()
  const mapped: MappedValue[] = []
  const first = (keys: readonly string[]) => {
    for (const key of keys) {
      const v = opaque(key)
      if (v) return { key, value: v }
    }
    return null
  }
  const seeds: Record<string, string> = {}
  for (const [seed, keys] of Object.entries(SEED_KEYS)) {
    const hit = first(keys)
    if (!hit) continue
    seeds[seed] = hit.value
    used.add(hit.key)
    mapped.push({ target: seed, kind: 'seed', key: hit.key, value: hit.value })
  }
  // A required seed the file does not give comes from OpenTodo's own of the kind.
  const fallback: Record<string, string> = kind === 'light'
    ? { canvas: '#eef0f2', surface: '#ffffff', text: '#17191c', accent: '#0f766e' }
    : { canvas: '#111315', surface: '#1a1d21', text: '#e7e9ec', accent: '#34d399' }
  for (const s of ['canvas', 'surface', 'text', 'accent']) seeds[s] ??= fallback[s]
  const tokens: Record<string, string> = {}
  for (const [token, keys] of Object.entries(TOKEN_KEYS)) {
    if (token === 'scrim') {
      const c = readVsColour(raw['widget.shadow'])
      if (!c) continue
      const hex = toHex(c) + (c.a < 1 ? Math.round(c.a * 255).toString(16).padStart(2, '0') : '')
      tokens.scrim = hex
      used.add('widget.shadow')
      mapped.push({ target: 'scrim', kind: 'token', key: 'widget.shadow', value: hex })
      continue
    }
    const hit = first(keys)
    if (!hit) continue
    tokens[token] = hit.value
    used.add(hit.key)
    mapped.push({ target: token, kind: 'token', key: hit.key, value: hit.value })
  }
  const ansi: Record<string, string> = {}
  for (const k of ANSI_KEYS) {
    const v = opaque(k)
    if (v) ansi[k] = v
  }
  for (const { hue, key, value: v } of ansiToHues(ansi)) {
    tokens[`hue-${hue}`] = v
    used.add(key)
    mapped.push({ target: `hue-${hue}`, kind: 'token', key, value: v })
  }
  const barHit = first(BAR_KEYS)
  if (barHit) {
    used.add(barHit.key)
    mapped.push({ target: 'bar', kind: 'bar', key: barHit.key, value: barHit.value })
  }
  const name = (typeof value.name === 'string' && value.name.trim()) || fileName.replace(/\.(jsonc?|json5)$/i, '').replace(/[-_]?color-?theme$/i, '').trim() || t('Imported theme')
  const author = typeof value.author === 'string' ? value.author : ''
  const doc: ThemeDocument = {
    opentodoTheme: THEME_FORMAT,
    id,
    name: [...name].slice(0, 60).join(''),
    author: [...author].slice(0, 120).join(''),
    licence: 'unknown',
    kind,
    seeds: seeds as ThemeDocument['seeds'],
    ...(Object.keys(tokens).length ? { tokens } : {}),
    ...(barHit ? { bar: barHit.value } : {}),
    notes: { text: t('Imported from a VS Code colour theme. Check the theme\'s licence before you share this file.') },
  }
  const derived = THEME_TOKENS.filter((tok) => !(tok in tokens) && !(tok in seeds))
  const ignored = [
    ...Object.keys(raw).filter((k) => !used.has(k)),
    ...['tokenColors', 'semanticTokenColors'].filter((k) => k in value),
  ].sort()
  const include = typeof value.include === 'string' ? value.include : undefined
  return { ok: true, doc, report: { name: doc.name, kind, highContrast, mapped, derived, ignored, ...(include ? { include } : {}) } }
}
