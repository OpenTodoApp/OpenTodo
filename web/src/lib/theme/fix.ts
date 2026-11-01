// Fix to AA (OpenSpec change theme-editor, design D8): for a failing contrast pair,
// keep a colour's hue and move only its lightness to the nearest value at which
// every pair that colour is in passes. The colour moved is the pair's explicit
// token (the foreground when both are); derived tokens pass by construction. When
// no lightness of that colour can pass at its hue, the other colour of the pair
// moves instead, and the result says so. A fix is written as an explicit value,
// so it is one undoable change. Lazy: the editor's chunk only.
import { GLYPH_PAIRS, PAIRS, type Pair } from '../../ui/tokens/pairs'
import { checkTheme, type ContrastFailure } from './check'
import { deriveTheme, type ResolvedTheme } from './derive'
import type { ThemeDocument } from './format'
import { clampToGamut, formatOklch, parseOklch } from './oklch'
import { ALPHA_TOKEN, cssName, THEME_TOKENS } from './tokens'
import { withToken } from './draft'

export { withToken }

const ALL_PAIRS: readonly Pair[] = [...PAIRS, ...GLYPH_PAIRS]
const STEP = 0.005
const MAX_STEPS = 200

/** The document token of a stylesheet token (`hue-red-solid` is `hue-red`), or null for one a document cannot set. */
export function docToken(css: string): string | null {
  const hue = /^(hue-[a-z]+)-solid$/.exec(css)
  if (hue) return hue[1]
  return THEME_TOKENS.includes(css) && !css.startsWith('hue-') ? css : null
}

/** The pairs a document token takes part in, on either side. */
export function pairsOf(token: string): Pair[] {
  const css = cssName(token)
  return ALL_PAIRS.filter((p) => p.fg === css || p.bg === css)
}

/** The measured ratio of one pair of a resolved theme. */
export function pairRatio(t: ResolvedTheme, fg: string, bg: string): number {
  return checkTheme(t, [{ fg, bg, min: Infinity, kind: 'text' }])[0]?.ratio ?? 21
}

export interface Fix {
  /** The document token that moved. */
  token: string
  /** Its new explicit value, `oklch(L C H)` at the same hue. */
  value: string
  /** The other colour of the pair moved: no lightness of the first could pass (design D8). */
  movedOther: boolean
}

/** The nearest lightness of `css` at its hue at which every pair passes, written as a value; null when none does. */
function nearestPassing(t: ResolvedTheme, css: string, pairs: readonly Pair[]): string | null {
  const start = parseOklch(t.tokens[css])
  if (!start) return null
  const at = (L: number) => formatOklch(clampToGamut({ ...start, L }).colour)
  const passes = (v: string) => checkTheme({ ...t, tokens: { ...t.tokens, [css]: v } }, pairs).length === 0
  for (let k = 1; k <= MAX_STEPS; k++) {
    for (const dir of [1, -1]) {
      const L = start.L + dir * k * STEP
      if (L < 0 || L > 1) continue
      const v = at(L)
      if (passes(v)) return v
    }
  }
  return null
}

/**
 * The fix of one failing pair (design D8), or null when neither colour can be set
 * by a document (a label's derived soft and text steps) or none can pass.
 */
export function fixPair(doc: ThemeDocument, f: Pick<ContrastFailure, 'fg' | 'bg'>, resolved: ResolvedTheme = deriveTheme(doc)): Fix | null {
  const fg = docToken(f.fg)
  const bg = docToken(f.bg)
  const explicit = (tok: string | null) => !!tok && doc.tokens?.[tok] !== undefined
  const order = (explicit(fg) || !explicit(bg) ? [fg, bg] : [bg, fg]).filter((x): x is string => !!x && x !== ALPHA_TOKEN)
  for (const [i, token] of order.entries()) {
    const value = nearestPassing(resolved, cssName(token), pairsOf(token))
    if (value) return { token, value, movedOther: i > 0 }
  }
  return null
}

/**
 * Fix all (design D8): every fix applied in turn on the re-derived document, as
 * one change. Returns the document and the fixes made; a pair no fix can reach stays.
 */
export function fixAll(doc: ThemeDocument): { doc: ThemeDocument; fixes: Fix[] } {
  let cur = doc
  const fixes: Fix[] = []
  const tried = new Set<string>()
  for (let round = 0; round < 60; round++) {
    const resolved = deriveTheme(cur)
    const failing = checkTheme(resolved).filter((x) => !tried.has(`${x.fg}/${x.bg}`))
    if (!failing.length) break
    const f = failing[0]
    tried.add(`${f.fg}/${f.bg}`)
    const fix = fixPair(cur, f, resolved)
    if (!fix) continue
    cur = withToken(cur, fix.token, fix.value)
    fixes.push(fix)
  }
  return { doc: cur, fixes }
}
