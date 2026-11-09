// The contrast check of a resolved theme (OpenSpec change theme-engine, design
// D10): the pairs of ui/tokens/pairs.ts measured on the values the theme writes,
// translucent ones composited over the surface, the past calendar block's fill and
// the section header tint mixed as the stylesheet mixes them. The same measurement
// as the CI gate in contrast.test.ts, without its stylesheet parser, for the editor's
// live warnings; the test asserts both agree on every shipped theme. Lazy chunk only.
import { composite, hexToRgb, labToRgb, lchToLab, ratioOf, rgbToLab, type Lab, type Rgba } from '../colourMath'
import { GLYPH_PAIRS, PAIRS, type Pair } from '../../ui/tokens/pairs'
import referenceJson from './reference.json'
import type { ResolvedTheme } from './derive'

export interface ContrastFailure {
  theme: string
  fg: string
  bg: string
  kind: Pair['kind']
  ratio: number
  min: number
}

const MIX = (referenceJson as { mix: Record<string, number> }).mix
/** The derived hue steps of pairs.ts DERIVED_TOKENS: the soft fill mixed towards a surface. */
const DERIVED: Record<string, { ratio: number; base: string }> = {
  past: { ratio: MIX.past, base: 'surface' },
  tint: { ratio: MIX.tint, base: 'surface' },
}
const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/

function lab(v: string): Lab {
  const m = OKLCH.exec(v)
  if (m) return lchToLab(Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4]))
  const c = rgbToLab(hexToRgb(v.slice(0, 7)))
  return { ...c, alpha: v.length === 9 ? parseInt(v.slice(7), 16) / 255 : 1 }
}

/** Every failing pair of a resolved theme, in the order of pairs.ts. */
export function checkTheme(t: ResolvedTheme, pairs: readonly Pair[] = [...PAIRS, ...GLYPH_PAIRS]): ContrastFailure[] {
  const cache = new Map<string, Lab>()
  const get = (n: string): Lab => {
    let c = cache.get(n)
    if (c) return c
    const derived = /^(hue-[a-z]+)-(past|tint)$/.exec(n)
    if (derived) {
      const { ratio: r, base } = DERIVED[derived[2]]
      const s = get(`${derived[1]}-soft`)
      const u = get(base)
      c = { L: s.L * r + u.L * (1 - r), A: s.A * r + u.A * (1 - r), B: s.B * r + u.B * (1 - r), alpha: 1 }
    } else {
      const v = t.tokens[n]
      if (!v) throw new Error(`checkTheme: theme ${t.id} has no token ${n}`)
      c = lab(v)
    }
    cache.set(n, c)
    return c
  }
  const white: Rgba = { r: 1, g: 1, b: 1, a: 1 }
  const opaque = (n: string): Rgba => {
    const c = labToRgb(get(n))
    if (c.a >= 1) return c
    const s = labToRgb(get('surface'))
    return composite(c, s.a >= 1 ? s : composite(s, white))
  }
  const out: ContrastFailure[] = []
  for (const p of pairs) {
    const back = opaque(p.bg)
    const front = labToRgb(get(p.fg))
    const ratio = ratioOf(front.a >= 1 ? front : composite(front, back), back)
    if (ratio + 1e-9 < p.min) out.push({ theme: t.id, fg: p.fg, bg: p.bg, kind: p.kind, ratio, min: p.min })
  }
  return out
}

/** One line per failure: theme, pair, measured and required ratio. */
export function describeFailure(f: ContrastFailure): string {
  return `${f.theme}: ${f.fg} on ${f.bg} (${f.kind}) ${f.ratio.toFixed(2)}:1, needs ${f.min}:1`
}
