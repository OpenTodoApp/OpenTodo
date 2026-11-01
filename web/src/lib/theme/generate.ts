// Generates the OpenTodo theme documents and the derivation's reference values
// from index.css (OpenSpec change theme-engine, design D3, D9). index.css stays
// the source of the default tokens; themes.test.ts fails when the generated files
// are stale and rewrites them with UPDATE_THEMES=1 (scripts/themes-sync.mjs). Test
// and tooling code only: it reads the stylesheet with the token resolver, which the
// production build never imports.
import { block, declarations, parseConstants, parseThemes } from '../../ui/tokens/css'
import { DERIVED_TOKENS } from '../../ui/tokens/pairs'
import { parseRgba, substitute, toHex } from '../../ui/tokens/resolve'
import { composite, rgbToLab } from '../colourMath'
import { DARK_BAR, ACCENTS } from '../../ui/tokens/accents'
import { CSS_TOKENS, THEME_TOKENS, cssName } from './tokens'
import type { ThemeDocument, ThemeKind } from './format'

export type Lch = [number, number, number, number]

export interface Reference {
  /** The mix ratios of the stylesheet's derived steps, as fractions. */
  mix: Record<string, number>
  light: Record<string, Lch>
  dark: Record<string, Lch>
}

const LITERAL = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/
const round = (n: number, d: number) => Number(n.toFixed(d))

function lchOf(raw: string, lookup: (n: string) => string | undefined): Lch {
  const v = substitute(raw, lookup).trim()
  const m = LITERAL.exec(v)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
  const { L, A, B, alpha } = rgbToLab(parseRgba(v))
  const C = Math.hypot(A, B)
  const H = C < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  return [round(L, 6), round(C, 6), round(H, 4), round(alpha, 4)]
}

/** Every token of a mode as the stylesheet declares it on the root, the chart ramp included. */
export function modeTokens(css: string, kind: ThemeKind): Record<string, string> {
  const t = parseThemes(css)
  const ramp = declarations(block(css, ':root, [data-theme], [data-accent] {').body)
  return { ...(kind === 'light' ? t.lightTokens : t.darkTokens), ...ramp }
}

/** The reference values of each mode and the mix ratios, read from the stylesheet. */
export function reference(css: string): Reference {
  const constants = parseConstants(css)
  const pct = (v: string) => Number(v.replace('%', '')) / 100
  const mix: Record<string, number> = {}
  for (const [k, v] of Object.entries(constants)) if (k.startsWith('mix-')) mix[k.slice(4)] = pct(v)
  // The chart ramp's ratios (stats-dashboard D2) and the past calendar block (surfaces-v2 D3).
  const ramp = declarations(block(css, ':root, [data-theme], [data-accent] {').body)
  for (const n of [1, 2, 3, 4]) mix[`chart-seq-${n}`] = pct(/ (\d+)%/.exec(ramp[`chart-seq-${n}`])![1])
  mix.past = pct(/ (\d+)%/.exec(DERIVED_TOKENS['hue-red-past'])![1])
  const side = (tokens: Record<string, string>) => Object.fromEntries(CSS_TOKENS.map((n) => [n, lchOf(tokens[n], (x) => tokens[x])]))
  return { mix, light: side(modeTokens(css, 'light')), dark: side(modeTokens(css, 'dark')) }
}

/** The resolved `#rrggbb` of every token of a mode (translucent ones composited over the surface; the scrim keeps its alpha). */
function resolvedHex(tokens: Record<string, string>, name: string): string {
  const lookup = (n: string) => tokens[n]
  const c = parseRgba(tokens[name], lookup)
  if (c.a >= 1) return toHex(c)
  if (name === 'scrim') return toHex(c) + Math.round(c.a * 255).toString(16).padStart(2, '0')
  return toHex(composite(c, parseRgba(tokens.surface, lookup)))
}

/** OpenTodo Light or OpenTodo Dark as a theme document (design D9): the seeds as written, every token's resolved value. */
export function opentodoDocument(css: string, kind: ThemeKind): ThemeDocument {
  const tokens = modeTokens(css, kind)
  const lit = (n: string) => substitute(tokens[n], (x) => tokens[x]).trim()
  return {
    opentodoTheme: 1,
    id: `opentodo-${kind}`,
    name: kind === 'light' ? 'OpenTodo Light' : 'OpenTodo Dark',
    author: 'OpenTodo contributors',
    licence: 'AGPL-3.0-only',
    source: 'web/src/index.css',
    kind,
    seeds: { canvas: lit('canvas'), surface: lit('surface'), text: lit('text'), accent: lit('accent') },
    tokens: Object.fromEntries(THEME_TOKENS.map((n) => [n, resolvedHex(tokens, cssName(n))])),
    bar: kind === 'light' ? ACCENTS[0].bar : DARK_BAR,
  }
}

/** The files themes-sync writes, by path relative to web/src/lib/theme. */
export function generatedFiles(css: string): Record<string, string> {
  // One token per line: arrays of numbers stay on the line of their name.
  const json = (v: unknown) => JSON.stringify(v, null, 2).replace(/\[\n\s+([^\]]*?)\n\s+\]/g, (_, inner: string) => `[${inner.split(/,\n\s+/).join(', ')}]`) + '\n'
  return {
    'reference.json': json(reference(css)),
    'builtin/opentodo-light.json': json(opentodoDocument(css, 'light')),
    'builtin/opentodo-dark.json': json(opentodoDocument(css, 'dark')),
  }
}
