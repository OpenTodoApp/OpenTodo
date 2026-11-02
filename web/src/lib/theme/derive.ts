// Derivation of a theme from its seeds (OpenSpec change theme-engine, design D3;
// themes "Missing tokens are derived from the seeds"). Every token a document does
// not set starts from OpenTodo's own value for the theme's kind (reference.json,
// generated from index.css) carried onto the theme's seeds: the lightness keeps its
// offset from the seed it is anchored to, a neutral seed keeps OpenTodo's slate
// tint and a coloured one gives its own hue. Mixed steps (accent hover, soft and
// focus, the label palette's soft and text steps, the chart ramp) use the
// stylesheet's ratios. Then each token, or each family of tokens that move
// together, walks one axis (OKLCH lightness at a fixed hue, chroma clamped to the
// sRGB gamut) to the nearest value at which every contrast pair of ui/tokens/pairs.ts
// it takes part in passes, measured on the value that is written. A value that
// already passes does not move, so OpenTodo's seeds reproduce the stylesheet. An
// explicit value is never moved, even when it fails a pair (checkTheme reports it).
// Pure and deterministic; client-only, in the lazy theme chunk (never before the
// first paint: public/appearance.js applies the cached result).
import referenceJson from './reference.json'
import { composite, deltaE, hexToRgb, labToRgb, lchToLab, luminance, rgbToLab, toLin, type Lab, type Rgba } from '../colourMath'
import { GLYPH_PAIRS, PAIRS, type Pair } from '../../ui/tokens/pairs'
import { RED_GUARD } from '../accentDerive'
import { GAMUT_TOLERANCE, type ThemeDocument, type ThemeKind } from './format'
import { CSS_TOKENS, cssName, DEFAULT_RADIUS, FONT_STACKS, HUES, RADIUS_STEPS, type RadiusStep } from './tokens'

/** Bumped when a derivation step changes, so devices re-derive their cached themes. */
export const DERIVE_VERSION = 1

/** A resolved theme: every token's value as the app writes it, plus shape, type and the bar. */
export interface ResolvedTheme {
  id: string
  kind: ThemeKind
  /** Every token of CSS_TOKENS (stylesheet names, no `--ot-` prefix): `oklch(L C H)` or `oklch(L C H / a)`. */
  tokens: Record<string, string>
  /** The browser and system bar colour, `#rrggbb`. */
  bar: string
  radius?: Record<RadiusStep, number>
  /** A CSS font-family stack; absent for the bundled typeface. */
  font?: string
  /** The list text size in px, only when it is not 13. */
  list?: 14 | 15
  /** Derived tokens (and seeds) that moved away from their starting value to pass their pairs. */
  adjusted: string[]
}

type Lch = { L: number; C: number; H: number; a: number }
type Reference = { mix: Record<string, number>; light: Record<string, number[]>; dark: Record<string, number[]> }
const REF = referenceJson as unknown as Reference
const MIX = REF.mix

const STEP = 0.005
const MAX_STEPS = 200
/** Below this chroma a seed counts as neutral: it takes OpenTodo's tint. */
const NEUTRAL = 0.01
const ALL_PAIRS: readonly Pair[] = [...PAIRS, ...GLYPH_PAIRS]
const WHITE: Lch = { L: 1, C: 0, H: 0, a: 1 }
const BLACK: Lch = { L: 0, C: 0, H: 0, a: 1 }
const STATUS = ['success', 'warning', 'danger', 'info'] as const
/** Tokens that keep their own pairs on other units' soft fills (State.pairs). */
const FOLLOWERS = new Set<string>(['text-strong', 'text', 'muted', 'faint', ...STATUS])

const r4 = (n: number) => Math.round(n * 1e4) / 1e4
const r2 = (n: number) => Math.round(n * 100) / 100
/** Rounds to what is written: L and C to 4 places, the hue to 2, alpha to 2. */
const q = (c: Lch): Lch => ({ L: r4(Math.min(1, Math.max(0, c.L))), C: r4(Math.max(0, c.C)), H: r2(((c.H % 360) + 360) % 360), a: r2(Math.min(1, Math.max(0, c.a))) })

function toLab(c: Lch): Lab {
  return lchToLab(c.L, c.C, c.H, c.a)
}
function fromLab({ L, A, B, alpha }: Lab): Lch {
  const C = Math.hypot(A, B)
  return { L, C, H: C < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360, a: alpha }
}
// Values are never changed once made, so their sRGB is computed once.
const rgbCache = new WeakMap<Lch, Rgba>()
function rgbOf(c: Lch): Rgba {
  let x = rgbCache.get(c)
  if (!x) rgbCache.set(c, (x = labToRgb(toLab(c))))
  return x
}
const lumCache = new WeakMap<Rgba, number>()
function lum(x: Rgba): number {
  let l = lumCache.get(x)
  if (l === undefined) lumCache.set(x, (l = luminance(x)))
  return l
}
/** WCAG contrast of two opaque colours (colourMath's ratioOf, with the luminance kept). */
function contrast(a: Rgba, b: Rgba): number {
  const x = lum(a)
  const y = lum(b)
  return x > y ? (x + 0.05) / (y + 0.05) : (y + 0.05) / (x + 0.05)
}

/** Formats a value as the stylesheet writes one. */
export function formatLch(c: Lch): string {
  return c.a < 1 ? `oklch(${c.L} ${c.C} ${c.H} / ${c.a})` : `oklch(${c.L} ${c.C} ${c.H})`
}

const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/
/** Reads a value of the document grammar (format.ts has validated it). */
export function parseColour(v: string): Lch {
  const m = OKLCH.exec(v)
  if (m) return { L: Number(m[1]), C: Number(m[2]), H: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) }
  const rgb = hexToRgb(v.slice(0, 7))
  const a = v.length === 9 ? parseInt(v.slice(7), 16) / 255 : 1
  return q({ ...fromLab(rgbToLab(rgb)), a })
}

// The gamut test in linear light: the same bounds as GAMUT_TOLERANCE on the encoded channels, without the power per channel.
const LIN_LO = -GAMUT_TOLERANCE / 12.92
const LIN_HI = toLin(1 + GAMUT_TOLERANCE)
function linearInGamut({ L, A, B }: Lab): boolean {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return r >= LIN_LO && r <= LIN_HI && g >= LIN_LO && g <= LIN_HI && b >= LIN_LO && b <= LIN_HI
}

/**
 * The colour of lightness L at the hue and at most the chroma of `c` that sRGB can
 * show, rounded. A colour that does not move keeps its chroma: the browser clips it
 * as the contrast check does, so OpenTodo's own values stay exactly as written.
 */
function fit(c: Lch, L = c.L): Lch {
  if (L === c.L) return q(c)
  const inGamut = (C: number) => linearInGamut(lchToLab(L, C, c.H))
  let C = c.C
  if (!inGamut(C)) {
    let lo = 0
    let hi = C
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(mid)) lo = mid
      else hi = mid
    }
    C = lo
  }
  return q({ L, C, H: c.H, a: c.a })
}

/** `color-mix(in oklch, x p, y)` with an achromatic y (black or white): the hue of x. */
function mixToward(x: Lch, p: number, y: Lch): Lch {
  return q({ L: x.L * p + y.L * (1 - p), C: x.C * p, H: x.H, a: 1 })
}
/** `color-mix(in oklab, x p, y)` of two opaque colours. */
function mixLabRaw(x: Lch, p: number, y: Lch): Lch {
  const a = toLab(x)
  const b = toLab(y)
  return fromLab({ L: a.L * p + b.L * (1 - p), A: a.A * p + b.A * (1 - p), B: a.B * p + b.B * (1 - p), alpha: 1 })
}
const mixLab = (x: Lch, p: number, y: Lch) => q(mixLabRaw(x, p, y))

/** A neutral token carried from its OpenTodo anchor `rA` onto the theme's anchor `a`. */
function carryNeutral(r: Lch, rA: Lch, a: Lch): Lch {
  const L = r.L + (a.L - rA.L)
  if (a.C < NEUTRAL) return { L, C: r.C, H: r.H, a: r.a }
  return { L, C: Math.max(0, a.C + r.C - rA.C), H: a.H, a: r.a }
}
/** A coloured token carried from its OpenTodo anchor `rA` onto `a`: lightness offset, chroma ratio, hue offset. */
function carryHue(r: Lch, rA: Lch, a: Lch, rL: Lch = rA, l: Lch = a): Lch {
  const k = rA.C > NEUTRAL ? Math.min(2, Math.max(0, a.C / rA.C)) : 1
  return { L: r.L + (l.L - rL.L), C: r.C * k, H: a.C < NEUTRAL ? r.H : r.H + (a.H - rA.H), a: r.a }
}

function ratio(get: (n: string) => Lch | undefined, fg: string, bg: string): number | null {
  const f = get(fg)
  const b = get(bg)
  if (!f || !b) return null
  const opaque = (c: Lch): Rgba => {
    const x = rgbOf(c)
    if (c.a >= 1) return x
    const s = get('surface')
    return composite(x, s && s.a >= 1 ? rgbOf(s) : { r: 1, g: 1, b: 1, a: 1 })
  }
  const back = opaque(b)
  const front = rgbOf(f)
  return contrast(f.a >= 1 ? front : composite(front, back), back)
}

/** The derivation state: the values so far, which are explicit, and the pairs of each token. */
class State {
  readonly v = new Map<string, Lch>()
  readonly fixed = new Set<string>()
  readonly adjusted = new Set<string>()
  constructor(readonly kind: ThemeKind) {}
  private past = new Map<string, { soft: Lch; surface: Lch; c: Lch }>()
  private pairsOf = new Map<string, Pair[]>()
  get = (n: string): Lch | undefined => {
    if (n.endsWith('-past')) {
      const soft = this.v.get(n.slice(0, -5) + '-soft')
      const surface = this.v.get('surface')
      if (!soft || !surface) return undefined
      const hit = this.past.get(n)
      if (hit && hit.soft === soft && hit.surface === surface) return hit.c
      const c = mixLabRaw(soft, MIX.past, surface)
      this.past.set(n, { soft, surface, c })
      return c
    }
    return this.v.get(n)
  }
  /** Sets a derived value; an explicit one is kept. */
  set(n: string, c: Lch) {
    if (!this.fixed.has(n)) this.v.set(n, c)
  }
  /**
   * The pairs a unit answers for: those with one of its tokens on either side,
   * except a tone or status colour of another unit drawn on its soft step (a tone on
   * the accent's or a label's soft fill): that one moves itself instead.
   */
  pairs(names: readonly string[]): Pair[] {
    const key = names.join(' ')
    let got = this.pairsOf.get(key)
    if (got) return got
    const all = new Set(names.flatMap((n) => (n.startsWith('hue-') && n.endsWith('-soft') ? [n, n.replace(/-soft$/, '-past')] : [n])))
    got = ALL_PAIRS.filter((p) => all.has(p.fg) || (all.has(p.bg) && !FOLLOWERS.has(p.fg)))
    this.pairsOf.set(key, got)
    return got
  }
  passes(pairs: readonly Pair[]): boolean {
    return pairs.every((p) => {
      const r = ratio(this.get, p.fg, p.bg)
      return r === null || r + 1e-9 >= p.min
    })
  }
  ref(n: string): Lch {
    const [L, C, H, a] = REF[this.kind][n]
    return { L, C, H, a }
  }
}

/** The lightness nearest `from` (in STEP steps, `first` direction first on a tie) at which `ok` holds. */
function nearest(from: number, first: 1 | -1, ok: (L: number) => boolean): number | null {
  for (let k = 0; k <= MAX_STEPS; k++) {
    for (const dir of k === 0 ? [0] : [first, -first]) {
      const L = from + dir * k * STEP
      if (L < 0 || L > 1) continue
      if (ok(L)) return L
    }
  }
  return null
}

/**
 * A family: tokens built from one free colour (its lightness searched). `build`
 * sets every token of the family from the free colour; the family moves only when
 * one of its pairs fails.
 */
interface Unit {
  names: string[]
  start: () => Lch
  build: (c: Lch) => void
  /** The token whose value is the free colour; when it is explicit the family is not searched. */
  base: string
}

function search(s: State, u: Unit) {
  const start = fit(u.start())
  const pairs = s.pairs(u.names)
  u.build(start)
  if (s.fixed.has(u.base) || s.passes(pairs)) return
  const dir = s.kind === 'light' ? -1 : 1
  const L = nearest(start.L, dir, (l) => {
    u.build(fit(start, l))
    return s.passes(pairs)
  })
  u.build(L === null ? start : fit(start, L))
  if (L !== null) s.adjusted.add(u.base)
}

function single(s: State, name: string, start: () => Lch): Unit {
  return { names: [name], base: name, start, build: (c) => s.set(name, c) }
}

/** Steps 1 to 3 and 5 to 6 of design D3, as search units in order. */
function units(s: State, seeds: Record<string, Lch>): Unit[] {
  const light = s.kind === 'light'
  const out: Unit[] = []
  // 2. The tone scale, anchored on the text seed.
  out.push(single(s, 'text', () => seeds.text))
  for (const t of ['text-strong', 'muted', 'faint']) out.push(single(s, t, () => carryNeutral(s.ref(t), s.ref('text'), s.get('text')!)))
  // 3. Lines, anchored on the surface.
  for (const t of ['border', 'border-soft', 'line-strong', 'border-input']) out.push(single(s, t, () => carryNeutral(s.ref(t), s.ref('surface'), s.get('surface')!)))
  // 5. Status: the seed or OpenTodo's colour; the soft step follows the surface, its text the status.
  for (const st of STATUS) {
    out.push({
      names: [st, `${st}-soft`, `${st}-soft-text`], base: st,
      start: () => seeds[st] ?? s.ref(st),
      build: (c) => {
        s.set(st, c)
        const base = s.get(st)!
        s.set(`${st}-soft`, fit(carryHue(s.ref(`${st}-soft`), s.ref(st), base, s.ref('surface'), s.get('surface')!)))
        s.set(`${st}-soft-text`, fit(carryHue(s.ref(`${st}-soft-text`), s.ref(st), base)))
      },
    })
  }
  // 7. The label palette: OpenTodo's hue, its soft step mixed into the surface (canvas in dark), its text toward black (white).
  for (const h of HUES) {
    const solid = `hue-${h}-solid`
    out.push({
      names: [solid, `hue-${h}-soft`, `hue-${h}-text`], base: solid,
      start: () => s.ref(solid),
      build: (c) => {
        s.set(solid, c)
        const base = s.get(solid)!
        s.set(`hue-${h}-soft`, mixLab(base, light ? MIX['hue-soft-light'] : MIX['hue-soft-dark'], s.get(light ? 'surface' : 'canvas')!))
        s.set(`hue-${h}-text`, mixToward(base, light ? MIX['hue-text-light'] : MIX['hue-text-dark'], light ? BLACK : WHITE))
      },
    })
  }
  // 6. Priorities: p1 follows danger, p2 the orange label hue, p3 info, p4 the slate label hue.
  const anchors: Record<string, string> = { p1: 'danger', p2: 'hue-orange-solid', p3: 'info', p4: 'hue-slate-solid' }
  for (const [p, a] of Object.entries(anchors)) {
    out.push({
      names: [p, `${p}-soft`], base: p,
      start: () => carryHue(s.ref(p), s.ref(a), s.get(a)!),
      build: (c) => {
        s.set(p, c)
        s.set(`${p}-soft`, fit(carryHue(s.ref(`${p}-soft`), s.ref(p), s.get(p)!, s.ref('surface'), s.get('surface')!)))
      },
    })
  }
  return out
}

const ACCENT_FAMILY = ['accent', 'accent-hover', 'on-accent', 'accent-text', 'accent-soft', 'accent-soft-text', 'focus', 'chart-base']
const BUTTON = ['accent', 'accent-hover', 'on-accent']

/** Sets the accent family from the button, the text on it and (in dark) the accent text, as the stylesheet mixes them. */
function buildAccent(s: State, button: Lch, on: Lch, text: Lch) {
  const surface = s.get('surface')!
  s.set('accent', button)
  const b = s.get('accent')!
  s.set('accent-hover', mixToward(b, MIX['accent-hover'], BLACK))
  s.set('on-accent', on)
  if (s.kind === 'light') {
    s.set('accent-text', b)
    s.set('accent-soft', mixLab(b, MIX['accent-soft-light'], surface))
    s.set('accent-soft-text', mixToward(b, MIX['accent-soft-text-light'], BLACK))
    s.set('focus', mixToward(b, MIX['accent-focus-light'], WHITE))
    s.set('chart-base', b)
    return
  }
  s.set('accent-text', text)
  const t = s.get('accent-text')!
  s.set('accent-soft', mixLab(t, MIX['accent-soft-dark'], surface))
  s.set('accent-soft-text', mixToward(t, MIX['accent-soft-text-dark'], WHITE))
  s.set('focus', t)
  s.set('chart-base', t)
}

/** The pairs the accent answers for (a tone or status colour on its soft step moves itself instead). */
const accentPairs = (s: State) => s.pairs(ACCENT_FAMILY)

/** Whether an accent keeps the red guard's distance from the theme's danger and priority-1 colours. */
function farFromRed(s: State, c: Lch): boolean {
  const x = rgbOf(c)
  return Math.min(deltaE(x, rgbOf(s.get('danger')!)), deltaE(x, rgbOf(s.get('p1')!))) >= RED_GUARD[s.kind]
}

/**
 * Step 4: the accent. The button keeps the seed's hue and moves its lightness until
 * the text on it (white, or the theme's darkest colour, whichever needs the smaller
 * move) passes; in dark the accent text is the seed when it already reads on the
 * surfaces, else OpenTodo's step above the button, lifted until every accent pair
 * passes. A red accent turns away from danger until it keeps the red guard.
 */
function deriveAccentFamily(s: State, seed: Lch) {
  const pairs = accentPairs(s)
  const buttonPairs = pairs.filter((p) => BUTTON.includes(p.fg) && BUTTON.includes(p.bg))
  const textPairs = pairs.filter((p) => !buttonPairs.includes(p))
  const dark: Lch = s.kind === 'light' ? s.get('text')! : s.get('canvas')!
  const onChoices = s.fixed.has('on-accent') ? [s.get('on-accent')!] : [WHITE, dark]
  const dangerH = s.get('danger')!.H
  const diff = ((seed.H - dangerH + 540) % 360) - 180
  const turnDir = diff >= 0 ? 1 : -1
  const light = s.kind === 'light'
  for (let turn = 0; turn <= 180; turn += seed.C < NEUTRAL ? 181 : 1) {
    const at = fit({ ...seed, H: (seed.H + turnDir * turn + 360) % 360 })
    // The button and the text on it.
    let best: { b: Lch; on: Lch; move: number } | null = null
    for (const on of onChoices) {
      const check = light ? pairs : buttonPairs
      const ok = (b: Lch) => { buildAccent(s, b, on, light ? b : at); return s.passes(check) }
      const L = s.fixed.has('accent') ? (ok(s.get('accent')!) ? at.L : null) : nearest(at.L, on === WHITE ? -1 : 1, (l) => ok(fit(at, l)))
      if (L === null) continue
      const move = Math.abs(L - at.L)
      if (!best || move < best.move - 1e-9) best = { b: fit(at, L), on, move }
    }
    if (!best) continue
    let text = best.b
    if (!light) {
      buildAccent(s, best.b, best.on, at)
      const start = s.passes(textPairs) ? at : fit(carryHue(s.ref('accent-text'), s.ref('accent'), at))
      const ok = (t: Lch) => { buildAccent(s, best!.b, best!.on, t); return s.passes(textPairs) }
      const L = s.fixed.has('accent-text') ? (ok(start) ? start.L : null) : nearest(start.L, 1, (l) => ok(fit(start, l)))
      if (L === null) continue
      text = fit(start, L)
    }
    buildAccent(s, best.b, best.on, text)
    if (!farFromRed(s, s.get(light ? 'accent' : 'accent-text')!)) continue
    if (turn > 0 || best.move > 0) s.adjusted.add('accent')
    return
  }
  // No lightness passes at any hue (only with explicit values that fail): keep the seed; checkTheme reports it.
  buildAccent(s, seed, onChoices[0], seed)
}

/** Step 1: surfaces from the canvas and surface seeds; seeds in the middle band move out of it until text can read. */
function surfaces(s: State, seeds: Record<string, Lch>) {
  for (const n of ['canvas', 'surface']) s.set(n, seeds[n])
  for (const n of ['raised', 'pop', 'hover']) s.set(n, fit(carryNeutral(s.ref(n), s.ref('surface'), s.get('surface')!)))
  for (const n of ['sunken', 'selected', 'selected-row']) s.set(n, fit(carryNeutral(s.ref(n), s.ref('canvas'), s.get('canvas')!)))
  s.set('sidebar', s.get('canvas')!)
}

/** Whether some text lightness at the text seed's hue reaches its pairs on the theme's surfaces. */
function textCanRead(s: State, seed: Lch): boolean {
  const pairs = s.pairs(['text']).filter((p) => ['canvas', 'surface', 'raised', 'sunken', 'pop', 'hover', 'selected-row', 'selected', 'sidebar'].includes(p.bg))
  const ok = (l: number) => { s.set('text', fit(seed, l)); return s.passes(pairs) }
  return nearest(seed.L, s.kind === 'light' ? -1 : 1, ok) !== null
}

/** Derives every token of a valid document (design D3). Deterministic; never moves an explicit value. */
export function deriveTheme(doc: ThemeDocument): ResolvedTheme {
  const s = new State(doc.kind)
  for (const [k, v] of Object.entries(doc.tokens ?? {})) {
    const n = cssName(k)
    if (!CSS_TOKENS.includes(n)) continue // unknown tokens are kept in the document and ignored here
    s.v.set(n, parseColour(v))
    s.fixed.add(n)
  }
  const seeds: Record<string, Lch> = {}
  for (const [k, v] of Object.entries(doc.seeds)) if (typeof v === 'string') seeds[k] = parseColour(v)
  // Seeds in the middle band, where neither black nor white text reaches 4.5:1, move toward the kind's end.
  for (let i = 0; i < 40; i++) {
    surfaces(s, seeds)
    if (textCanRead(s, seeds.text)) break
    const d = doc.kind === 'light' ? 0.02 : -0.02
    for (const n of ['canvas', 'surface'] as const) if (!s.fixed.has(n)) seeds[n] = fit(seeds[n], Math.min(1, Math.max(0, seeds[n].L + d)))
    s.adjusted.add('surface')
  }
  surfaces(s, seeds)
  const list = units(s, seeds)
  for (const u of list) search(s, u)
  deriveAccentFamily(s, seeds.accent)
  // 8. The rest: the scrim, the search highlight and its text, the chart ramp.
  const rest = (): Unit[] => [
    { names: ['highlight', 'highlight-text'], base: 'highlight-text',
      start: () => carryHue(s.ref('highlight-text'), s.ref('text'), s.get('text')!),
      build: (c) => {
        s.set('highlight', fit(carryHue(s.ref('highlight'), s.ref('warning'), s.get('warning')!, s.ref('surface'), s.get('surface')!)))
        s.set('highlight-text', c)
      } },
  ]
  s.set('scrim', s.ref('scrim'))
  for (const u of rest()) search(s, u)
  // Later steps can make an earlier token's pair fail (a tone on the accent's soft step): search those again.
  for (let pass = 0; pass < 3; pass++) {
    let moved = false
    for (const u of [...list, ...rest()]) {
      if (s.fixed.has(u.base) || s.passes(s.pairs(u.names))) continue
      search(s, u)
      moved = true
    }
    if (!s.passes(accentPairs(s))) { deriveAccentFamily(s, seeds.accent); moved = true }
    if (!moved) break
  }
  const surface = s.get('surface')!
  const base = s.get('chart-base')!
  s.set('chart-seq-1', mixLab(s.get('faint')!, MIX['chart-seq-1'], surface))
  for (const n of [2, 3, 4]) s.set(`chart-seq-${n}`, mixLab(base, MIX[`chart-seq-${n}`], surface))
  s.set('chart-seq-5', base)

  const tokens: Record<string, string> = {}
  for (const n of CSS_TOKENS) tokens[n] = formatLch(s.get(n)!)
  const hex = (c: Lch) => '#' + [rgbOf(c)].map(({ r, g, b }) => [r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join(''))[0]
  return {
    id: doc.id,
    kind: doc.kind,
    tokens,
    bar: doc.bar ? hex(parseColour(doc.bar)) : hex(s.get(doc.kind === 'light' ? 'accent' : 'canvas')!),
    ...(doc.shape?.radius ? { radius: radiusScale(doc.shape.radius) } : {}),
    ...fontOf(doc),
    adjusted: [...s.adjusted].sort(),
  }
}

/** A partial radius scale filled by keeping today's proportions to the nearest given step (design D1). */
export function radiusScale(given: Partial<Record<RadiusStep, number>>): Record<RadiusStep, number> {
  const known = RADIUS_STEPS.filter((k) => typeof given[k] === 'number')
  const out = {} as Record<RadiusStep, number>
  RADIUS_STEPS.forEach((k, i) => {
    if (typeof given[k] === 'number') { out[k] = given[k]!; return }
    if (!known.length) { out[k] = DEFAULT_RADIUS[k]; return }
    const near = [...known].sort((a, b) => Math.abs(RADIUS_STEPS.indexOf(a) - i) - Math.abs(RADIUS_STEPS.indexOf(b) - i))[0]
    out[k] = Math.min(20, Math.max(0, Math.round((DEFAULT_RADIUS[k] * given[near]!) / DEFAULT_RADIUS[near])))
  })
  return out
}

function fontOf(doc: ThemeDocument): Pick<ResolvedTheme, 'font' | 'list'> {
  const f = doc.type?.family
  const font = !f || f === 'inter' ? undefined : typeof f === 'string' ? FONT_STACKS[f] : `"${f.local}", ${FONT_STACKS.system}`
  const list = doc.type?.list === 14 || doc.type?.list === 15 ? doc.type.list : undefined
  return { ...(font ? { font } : {}), ...(list ? { list } : {}) }
}
