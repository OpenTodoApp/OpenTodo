// The custom accent derivation (OpenSpec change accent-colour, design D2;
// appearance-preferences "Custom accent colour", design-system "Custom accent
// meets every accent contrast pair"). One picked colour becomes the values an
// accent theme declares in index.css: the light accent, the bright dark-mode
// accent text, the text on the accent (white) and, when needed, a dark-mode
// button. The search keeps the picked hue and moves only the OKLCH lightness
// (chroma clamped to the sRGB gamut) until every pair of ui/tokens/pairs.ts that
// has an accent-derived token on either side passes in that mode, measured as
// the contrast check measures it: the stylesheet's mixes resolved, each value
// rounded to the #rrggbb that is applied. A red pick is turned away from the
// danger and priority-1 colours until it is as far from them as Rose is.
//
// Client-only and deterministic (vectors in accent.vectors.json); loaded lazily
// with Settings and the first start of a custom accent, never before the first
// paint (public/appearance.js applies the cached result).
import { deltaE, hexToRgb, labToRgb, labToRgbRaw, lchToLab, ratioOf, rgbToLab, toHex, type Lab, type Rgba } from './colourMath'
import { GLYPH_PAIRS, PAIRS, type Pair } from '../ui/tokens/pairs'
import { ACCENT_TOKENS } from '../ui/tokens/accents'

/** The derived values, each `#rrggbb`. */
export interface DerivedAccent {
  /** The picked colour, normalised. */
  input: string
  /** `--ot-al-accent`: buttons, links and the light browser bar. */
  light: string
  /** `--ot-ad-accent-text`: dark-mode accent text, focus, soft steps and the chart. */
  dark: string
  /** `--ot-a-on-accent`: always white, as for every built-in theme. */
  on: string
  /** `--ot-ad-accent`: the dark-mode button, only when the light accent fails there. */
  button?: string
  /** Whether the lightness or the hue moved away from the pick (the picker says so). */
  adjusted: { lightness: boolean; hue: boolean }
}

/**
 * The mode tokens the accent pairs are measured on, as declared in index.css
 * (`oklch(L C H)`); accentDerive.test.ts checks them against the stylesheet.
 */
export const BASE_TOKENS: Record<'light' | 'dark', Record<string, [number, number, number]>> = {
  light: {
    canvas: [0.9542, 0.0034, 247.86], surface: [1, 0, 0], raised: [0.9757, 0, 0], pop: [1, 0, 0], 'selected-row': [0.9632, 0.0034, 247.86],
    'text-strong': [0.2126, 0.0067, 258.37], text: [0.2126, 0.0067, 258.37], muted: [0.491, 0.0142, 259.82], faint: [0.5145, 0.0133, 252.19],
    danger: [0.5283, 0.1796, 27.4], warning: [0.4921, 0.1095, 66.01], info: [0.5071, 0.162, 260.46], success: [0.5081, 0.1049, 165.61], p1: [0.5771, 0.2152, 27.33],
  },
  dark: {
    canvas: [0.1635, 0.0045, 264.44], surface: [0.1959, 0.0062, 271.09], raised: [0.2184, 0.0079, 274.56], pop: [0.2271, 0.0079, 274.58], 'selected-row': [0.2389, 0.0082, 264.41],
    'text-strong': [0.9459, 0.0029, 264.54], text: [0.9459, 0.0029, 264.54], muted: [0.7273, 0.0111, 261.78], faint: [0.66, 0.0147, 262.36],
    danger: [0.6986, 0.1576, 23.81], warning: [0.7665, 0.1303, 73.04], info: [0.6988, 0.133, 259.53], success: [0.7729, 0.1535, 163.22], p1: [0.7106, 0.1661, 22.22],
  },
}

/** The `--ot-mix-*` ratios of index.css the accent steps use (checked by accentDerive.test.ts). */
export const MIX = { hover: 0.86, softLight: 0.1, softTextLight: 0.8, focusLight: 0.85, softDark: 0.14, softTextDark: 0.8 }

/**
 * The red guard (design D2 step 2): the smallest OKLab ΔE of the built-in Rose
 * theme from the danger and priority-1 colours of each mode, its light accent in
 * light and its accent text in dark, rounded down. A derived accent must be at
 * least this far from both, in both modes. accentDerive.test.ts recomputes it.
 */
export const RED_GUARD = { light: 4.13, dark: 2.72 }

/** The lightness step of the searches, and how many steps they may take. */
const STEP = 0.005
const MAX_STEPS = 200
/** The danger hue (light mode) the guard turns away from. */
const DANGER_HUE = BASE_TOKENS.light.danger[2]
/** The dark-mode button must stand out from the dark canvas (design D2 step 5). */
const BUTTON_ON_CANVAS = 3

const WHITE: Lab = { L: 1, A: 0, B: 0, alpha: 1 }
const BLACK: Lab = { L: 0, A: 0, B: 0, alpha: 1 }

type Mode = 'light' | 'dark'
/** The tokens an accent is measured on, per mode, as OKLCH triples (BASE_TOKENS by default). */
export type BaseTokens = Record<Mode, Record<string, [number, number, number]>>
type Base = Record<Mode, Record<string, Lab>>
const toBase = (t: BaseTokens): Base => ({
  light: Object.fromEntries(Object.entries(t.light).map(([k, [L, C, H]]) => [k, lchToLab(L, C, H)])),
  dark: Object.fromEntries(Object.entries(t.dark).map(([k, [L, C, H]]) => [k, lchToLab(L, C, H)])),
})
const DEFAULT_BASE = toBase(BASE_TOKENS)

/** `color-mix(in oklch, x p, y)` with an achromatic y (black or white): the hue of x, L and C mixed. */
function mixToward(x: Lab, p: number, y: Lab): Lab {
  return { L: x.L * p + y.L * (1 - p), A: x.A * p, B: x.B * p, alpha: 1 }
}

/** `color-mix(in oklab, x p, y)`. */
function mixLab(x: Lab, p: number, y: Lab): Lab {
  return { L: x.L * p + y.L * (1 - p), A: x.A * p + y.A * (1 - p), B: x.B * p + y.B * (1 - p), alpha: 1 }
}

/** The accent tokens of a mode from its inputs, as the stylesheet derives them, in OKLab. */
function accentTokens(base: Base, mode: Mode, accent: Lab, text: Lab): Record<string, Lab> {
  const b = base[mode]
  if (mode === 'light') {
    return {
      accent, 'accent-hover': mixToward(accent, MIX.hover, BLACK), 'on-accent': WHITE, 'accent-text': accent,
      'accent-soft': mixLab(accent, MIX.softLight, b.surface), 'accent-soft-text': mixToward(accent, MIX.softTextLight, BLACK),
      focus: mixToward(accent, MIX.focusLight, WHITE), 'chart-base': accent, sidebar: b.canvas,
    }
  }
  return {
    accent, 'accent-hover': mixToward(accent, MIX.hover, BLACK), 'on-accent': WHITE, 'accent-text': text,
    'accent-soft': mixLab(text, MIX.softDark, b.surface), 'accent-soft-text': mixToward(text, MIX.softTextDark, WHITE),
    focus: text, 'chart-base': text, sidebar: b.canvas,
  }
}

const DERIVED: readonly string[] = [...ACCENT_TOKENS, 'sidebar']
/** Every pair of the contrast check with an accent-derived token on either side (the sidebar mixes the accent in). */
export const ACCENT_PAIRS: readonly Pair[] = [...PAIRS, ...GLYPH_PAIRS].filter((p) => DERIVED.includes(p.fg) || DERIVED.includes(p.bg))
const BUTTON: readonly string[] = ['accent', 'accent-hover', 'on-accent']
/** The pairs of the dark button alone (white on the accent and its hover). */
const BUTTON_PAIRS = ACCENT_PAIRS.filter((p) => BUTTON.includes(p.fg) && BUTTON.includes(p.bg))
const TEXT_PAIRS = ACCENT_PAIRS.filter((p) => !BUTTON_PAIRS.includes(p))

function passes(base: Base, mode: Mode, pairs: readonly Pair[], accent: Lab, text: Lab): boolean {
  const tokens = accentTokens(base, mode, accent, text)
  const rgb = (name: string): Rgba => {
    const lab = tokens[name] ?? base[mode][name]
    if (!lab) throw new Error(`accentDerive: no value for token ${name}; add it to BASE_TOKENS`)
    return labToRgb(lab)
  }
  return pairs.every((p) => ratioOf(rgb(p.fg), rgb(p.bg)) + 1e-9 >= p.min)
}

/** The colour of lightness L, hue H and chroma at most C that sRGB can show, rounded to #rrggbb. */
function displayable(L: number, C: number, H: number): { hex: string; lab: Lab } {
  const inGamut = (c: number) => {
    const { r, g, b } = labToRgbRaw(lchToLab(L, c, H))
    return [r, g, b].every((x) => x >= -1e-7 && x <= 1 + 1e-7)
  }
  let c = C
  if (!inGamut(c)) {
    let lo = 0
    let hi = C
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(mid)) lo = mid
      else hi = mid
    }
    c = lo
  }
  const hex = toHex(labToRgb(lchToLab(L, c, H)))
  return { hex, lab: rgbToLab(hexToRgb(hex)) }
}

/**
 * The lightness nearest `from` (in STEP steps, `first` direction first on a tie)
 * at which `ok` holds, or null. For a fixed hue with chroma clamped to the gamut
 * luminance is monotone in L, so this walks one axis.
 */
function nearest(from: number, first: 1 | -1, ok: (L: number) => boolean): { L: number; moved: boolean } | null {
  for (let k = 0; k <= MAX_STEPS; k++) {
    for (const dir of k === 0 ? [0] : [first, -first]) {
      const L = from + dir * k * STEP
      if (L < 0 || L > 1) continue
      if (ok(L)) return { L, moved: k > 0 }
    }
  }
  return null
}

function oklch(hex: string) {
  const { L, A, B } = rgbToLab(hexToRgb(hex))
  const C = Math.hypot(A, B)
  return { L, C, H: C < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

/** The light accent and the dark accent text at one hue, or null when no lightness passes. */
function atHue(base: Base, L0: number, C0: number, H: number) {
  const light = nearest(L0, -1, (L) => passes(base, 'light', ACCENT_PAIRS, displayable(L, C0, H).lab, WHITE))
  if (!light) return null
  const lightAccent = displayable(light.L, C0, H)
  const dark = nearest(L0, 1, (L) => passes(base, 'dark', TEXT_PAIRS, lightAccent.lab, displayable(L, C0, H).lab))
  if (!dark) return null
  return { light: lightAccent, lightMoved: light.moved, dark: displayable(dark.L, C0, H), lightL: light.L }
}

/** Whether a light accent and a dark accent text keep the red guard's distance. */
export function farFromRed(light: string, dark: string, base: Base = DEFAULT_BASE): boolean {
  const far = (mode: Mode, hex: string) => {
    const c = hexToRgb(hex)
    return Math.min(deltaE(c, labToRgb(base[mode].danger)), deltaE(c, labToRgb(base[mode].p1))) >= RED_GUARD[mode]
  }
  return far('light', light) && far('dark', dark)
}

/** The smallest distance of a light accent and a dark accent text from the red of their mode (for tests and the guard's constant). */
export function redDistance(mode: Mode, hex: string, base: Base = DEFAULT_BASE): number {
  const c = hexToRgb(hex)
  return Math.min(deltaE(c, labToRgb(base[mode].danger)), deltaE(c, labToRgb(base[mode].p1)))
}

/**
 * Accepts `rgb` or `rrggbb`, with or without `#`, in any case, around spaces;
 * returns lowercase `#rrggbb`, or null for anything else.
 */
export function normalizeHex(raw: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw.trim())
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return `#${h.toLowerCase()}`
}

/**
 * Derives the custom accent of a `#rrggbb` colour (design D2) on the given base
 * tokens, OpenTodo's own by default (theme-engine D3 generalises the search so the
 * base is a parameter). Throws on anything else.
 */
export function deriveAccent(hex: string, tokens: BaseTokens = BASE_TOKENS): DerivedAccent {
  const base = tokens === BASE_TOKENS ? DEFAULT_BASE : toBase(tokens)
  const input = normalizeHex(hex)
  if (!input || !input.startsWith('#') || input.length !== 7) throw new Error(`deriveAccent: not a colour: ${hex}`)
  const { L: L0, C: C0, H: H0 } = oklch(input)
  // Turn away from the danger hue, the side the pick is on (towards orange on a tie).
  const diff = ((H0 - (tokens.light.danger?.[2] ?? DANGER_HUE) + 540) % 360) - 180
  const dir = diff >= 0 ? 1 : -1
  for (let turn = 0; turn <= 180; turn++) {
    const H = (H0 + dir * turn + 360) % 360
    const got = atHue(base, L0, C0, H)
    if (!got || !farFromRed(got.light.hex, got.dark.hex, base)) continue
    // The dark-mode button: the light accent unless white on it or its edge on the dark canvas fails there.
    const canvas = labToRgb(base.dark.canvas)
    const buttonOk = (lab: Lab) => passes(base, 'dark', BUTTON_PAIRS, lab, got.dark.lab) && ratioOf(labToRgb(lab), canvas) >= BUTTON_ON_CANVAS
    let button: string | undefined
    if (!buttonOk(got.light.lab)) {
      const found = nearest(got.lightL, 1, (L) => buttonOk(displayable(L, C0, H).lab))
      if (found) button = displayable(found.L, C0, H).hex
    }
    return { input, light: got.light.hex, dark: got.dark.hex, on: '#ffffff', ...(button ? { button } : {}), adjusted: { lightness: got.lightMoved, hue: turn > 0 } }
  }
  throw new Error(`deriveAccent: no accent passes for ${input}`)
}
