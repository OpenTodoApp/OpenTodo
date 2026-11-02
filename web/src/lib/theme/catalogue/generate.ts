// Turns a palette of palettes.ts into its theme document (OpenSpec change
// theme-catalogue, design D3): the published colours as seeds and explicit tokens,
// the label hues the palette lacks at OpenTodo's hue with the palette's own lightness
// and chroma, then the "fix to AA" search: while a contrast pair fails, the explicit
// value it belongs to moves its OKLCH lightness only (the hue kept, the chroma
// clamped to the sRGB gamut) to the nearest value at which none of its pairs fails.
// A seed the derivation had to move is written as the value it moved to. Every value
// that differs from the published one is listed under notes.adapted with the
// published value. Deterministic; run by catalogue.test.ts (UPDATE_CATALOGUE=1
// rewrites the documents). Test and generator only.
import referenceJson from '../reference.json'
import { checkTheme, type ContrastFailure } from '../check'
import { deriveTheme, formatLch, parseColour } from '../derive'
import { colourError, type ThemeDocument } from '../format'
import { HUES, type Hue } from '../tokens'
import { labToRgb, lchToLab, toHex } from '../../colourMath'
import type { Palette } from './palettes'

type Lch = { L: number; C: number; H: number; a: number }
const REF = referenceJson as unknown as Record<'light' | 'dark', Record<string, number[]>>
const STEP = 0.0025
const SEEDS = ['canvas', 'surface', 'text', 'accent', 'success', 'warning', 'danger', 'info'] as const
const r4 = (n: number) => Math.round(n * 1e4) / 1e4

/** The colour at lightness L with the hue of c and at most its chroma, inside sRGB. */
export function atLightness(c: Lch, L: number): Lch {
  const ok = (C: number) => colourError(formatLch({ L: r4(L), C: r4(C), H: c.H, a: 1 })) === null
  let C = c.C
  if (!ok(C)) {
    let lo = 0
    let hi = C
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (ok(mid)) lo = mid
      else hi = mid
    }
    C = lo
  }
  return { L: r4(L), C: r4(C), H: c.H, a: 1 }
}

const hexOf = (v: string) => toHex(labToRgb(lchToLab(...(Object.values(parseColour(v)).slice(0, 3) as [number, number, number]))))

/** The label hues the palette lacks: OpenTodo's hue at the mean lightness and the strongest chroma of the palette's own hues. */
function missingHues(p: Palette): Partial<Record<Hue, string>> {
  const own = Object.entries(p.hues).filter(([h]) => h !== 'slate').map(([, v]) => parseColour(v!))
  const L = own.reduce((s, c) => s + c.L, 0) / own.length
  // The palette's strongest chroma, so a derived colour stays apart from its neighbours in a muted palette.
  const C = Math.max(...own.map((c) => c.C))
  const out: Partial<Record<Hue, string>> = {}
  for (const h of HUES) {
    if (p.hues[h]) continue
    const [, , H] = REF[p.kind][`hue-${h}-solid`]
    out[h] = formatLch(atLightness({ L, C, H, a: 1 }, L))
  }
  return out
}

/** The CSS names a document token's value is drawn as. */
function family(name: string): string[] {
  return name.startsWith('hue-') ? ['solid', 'soft', 'text', 'past'].map((s) => `${name}-${s}`) : [name]
}
/** The document token a CSS name belongs to. */
function base(css: string): string {
  const m = /^(hue-[a-z]+)-(solid|soft|text|past)$/.exec(css)
  return m ? m[1] : css
}

export interface Generated {
  doc: ThemeDocument
  /** The tokens that were derived rather than published (missing label hues). */
  derivedHues: Hue[]
}

/** The theme document of a palette. Throws when a failing pair has no explicit value to move. */
export function generateTheme(p: Palette): Generated {
  const extra = missingHues(p)
  const published: Record<string, string> = {}
  const tokens: Record<string, string> = {}
  for (const [k, v] of Object.entries(p.tokens)) { tokens[k] = v!; published[k] = v! }
  // In dark, the palette's accent is the accent text (links, the active item); the button under white or dark text is derived from it.
  if (p.kind === 'dark' && !tokens['accent-text']) { tokens['accent-text'] = p.seeds.accent; published['accent-text'] = p.seeds.accent }
  for (const h of HUES) {
    const v = p.hues[h]
    if (v) { tokens[`hue-${h}`] = v; published[`hue-${h}`] = v } else tokens[`hue-${h}`] = extra[h]!
  }
  const seeds: Record<string, string> = { ...p.seeds }
  const doc = (): ThemeDocument => ({
    opentodoTheme: 1, id: p.id, name: p.name, author: p.project.author, licence: 'MIT', source: p.project.source, kind: p.kind,
    seeds: { ...seeds } as ThemeDocument['seeds'], tokens: { ...tokens }, bar: p.seeds.canvas,
  })
  const failures = (d: ThemeDocument): ContrastFailure[] => checkTheme(deriveTheme(d))
  const fixed = new Set(Object.keys(tokens))
  for (let round = 0; round < 80; round++) {
    const fails = failures(doc())
    if (!fails.length) break
    const f = fails[0]
    const fg = base(f.fg)
    const bg = base(f.bg)
    // The accent family is derived from the accent text in dark: when the text is explicit, it is the value to move.
    const accentFamily = (n: string) => n.startsWith('accent') || n === 'on-accent' || n === 'focus'
    const move = fixed.has(fg) ? fg : fixed.has(bg) && bg !== 'canvas' && bg !== 'surface' ? bg
      : fixed.has('accent-text') && (accentFamily(fg) || accentFamily(bg)) ? 'accent-text' : null
    if (!move) throw new Error(`${p.id}: ${f.fg} on ${f.bg} fails (${f.ratio.toFixed(2)}:1) and neither is an explicit value`)
    const names = new Set(family(move))
    const start = parseColour(tokens[move])
    // A text or mark moves away from its background: darker in light, lighter in dark; a background the other way.
    const first = (p.kind === 'light') === (move === fg) ? -1 : 1
    const passes = (L: number): string | null => {
      if (L < 0 || L > 1) return null
      const v = formatLch(atLightness(start, L))
      const trial = { ...doc(), tokens: { ...tokens, [move]: v } }
      return failures(trial).some((x) => names.has(x.fg) || names.has(x.bg)) ? null : v
    }
    // Coarse steps of four, alternating directions, then the nearest fine step back toward the published value.
    let found: string | null = null
    for (let k = 4; k <= 400 && !found; k += 4) {
      for (const dir of [first, -first]) {
        if (!passes(start.L + dir * k * STEP)) continue
        for (let j = k - 3; j <= k && !found; j++) found = passes(start.L + dir * j * STEP)
        break
      }
    }
    if (!found) throw new Error(`${p.id}: no lightness of ${move} passes its pairs`)
    tokens[move] = found
  }
  // Seeds the derivation moved: written as the value they moved to (the text, the accent, a status colour).
  for (let pass = 0; pass < 3; pass++) {
    const t = deriveTheme(doc())
    let changed = false
    for (const s of SEEDS) {
      if (s === 'canvas' || s === 'surface' || (s === 'accent' && p.kind === 'dark')) continue
      const token = s
      if (hexOf(t.tokens[token]) === hexOf(seeds[s])) continue
      // Written inside the sRGB gamut (a derived value may sit just outside it, as the browser clips it).
      const c = parseColour(t.tokens[token])
      seeds[s] = formatLch(atLightness(c, c.L))
      changed = true
    }
    if (!changed) break
  }
  const out = doc()
  const left = failures(out)
  if (left.length) throw new Error(`${p.id}: still failing: ${left.map((f) => `${f.fg} on ${f.bg}`).join(', ')}`)
  const adapted: Record<string, string> = {}
  for (const s of SEEDS) if (seeds[s] !== p.seeds[s]) adapted[s] = p.seeds[s]
  for (const [k, v] of Object.entries(published)) if (tokens[k] !== v) adapted[k] = v
  const derivedHues = HUES.filter((h) => !p.hues[h])
  out.notes = {
    ...(Object.keys(adapted).length ? { adapted } : {}),
    text: `${p.name} by ${p.project.author}, mapped onto OpenTodo's tokens by web/src/lib/theme/builtin/MAPPING.md.${derivedHues.length ? ` Label colours not in the palette (${derivedHues.join(', ')}) use OpenTodo's hue at the palette's lightness and chroma.` : ''}${Object.keys(adapted).length ? ' Some colours were adapted for contrast: their published values are under adapted.' : ''}`,
  }
  return { doc: out, derivedHues }
}
