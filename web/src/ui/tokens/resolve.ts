// Resolves the colour values of index.css the way a browser does (OpenSpec change
// tokens-v2, design D2), so the contrast check measures what is drawn: `oklch()`
// literals, `color-mix(in oklch | oklab | srgb, …)`, `var()` chains with fallbacks,
// `transparent`, hex and `rgb()`, and alpha composited over a background. Test and
// workbench code only: the production build never imports it.
export type Rgba = { r: number; g: number; b: number; a: number }
type Lab = { L: number; A: number; B: number; alpha: number }

export type Lookup = (name: string) => string | undefined

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.sign(c) * Math.abs(c) ** (1 / 2.4) - 0.055)

function rgbToLab({ r, g, b, a }: Rgba): Lab {
  const [lr, lg, lb] = [r, g, b].map(toLin)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    A: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    B: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    alpha: a,
  }
}

function labToRgb({ L, A, B, alpha }: Lab): Rgba {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  const [r, g, b] = lin.map((c) => Math.min(1, Math.max(0, fromLin(c))))
  return { r, g, b, a: alpha }
}

/** Below this chroma a hue carries no information and does not steer a mix (CSS "powerless"). */
const POWERLESS = 1e-4

function labToLch({ L, A, B, alpha }: Lab) {
  const C = Math.hypot(A, B)
  const H = C < POWERLESS ? NaN : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  return { L, C, H, alpha }
}

function lchToLab(L: number, C: number, H: number, alpha: number): Lab {
  const h = ((Number.isNaN(H) ? 0 : H) * Math.PI) / 180
  return { L, A: C * Math.cos(h), B: C * Math.sin(h), alpha }
}

/** Splits a function's arguments on top-level commas. */
function args(body: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '(') depth++
    else if (body[i] === ')') depth--
    else if (body[i] === ',' && depth === 0) {
      out.push(body.slice(start, i).trim())
      start = i + 1
    }
  }
  out.push(body.slice(start).trim())
  return out
}

/** The body of a function call `name(…)` at the start of `v`, or null. */
function call(v: string, name: string): string | null {
  if (!v.startsWith(`${name}(`) || !v.endsWith(')')) return null
  // The closing parenthesis must match the first opening one.
  let depth = 0
  for (let i = name.length; i < v.length; i++) {
    if (v[i] === '(') depth++
    else if (v[i] === ')' && --depth === 0) return i === v.length - 1 ? v.slice(name.length + 1, -1) : null
  }
  return null
}

function num(s: string, percentScale = 1): number {
  const t = s.trim()
  if (t === 'none') return NaN
  if (t.endsWith('%')) return (parseFloat(t) / 100) * percentScale
  const n = Number(t)
  if (Number.isNaN(n)) throw new Error(`not a number: ${s}`)
  return n
}

/** Replaces every `var(--x[, fallback])` with its value, recursively. */
export function substitute(value: string, lookup: Lookup, depth = 0): string {
  if (depth > 32) throw new Error(`var() cycle near ${value}`)
  const at = value.indexOf('var(')
  if (at < 0) return value
  let level = 0
  let end = -1
  for (let i = at + 3; i < value.length; i++) {
    if (value[i] === '(') level++
    else if (value[i] === ')' && --level === 0) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error(`unterminated var(): ${value}`)
  const [name, ...rest] = args(value.slice(at + 4, end))
  const found = lookup(name.replace(/^--ot-/, '').replace(/^--/, ''))
  const replacement = found ?? (rest.length ? rest.join(', ') : undefined)
  if (replacement === undefined) throw new Error(`unknown token ${name}`)
  return substitute(value.slice(0, at) + substitute(replacement, lookup, depth + 1) + value.slice(end + 1), lookup, depth + 1)
}

function parse(raw: string): Lab {
  const v = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (v === 'transparent') return { L: 0, A: 0, B: 0, alpha: 0 }
  if (v === 'white') return rgbToLab({ r: 1, g: 1, b: 1, a: 1 })
  if (v === 'black') return rgbToLab({ r: 0, g: 0, b: 0, a: 1 })
  let m = v.match(/^#([0-9a-f]{3,8})$/)
  if (m) {
    const h = m[1].length <= 4 ? [...m[1]].map((c) => c + c).join('') : m[1]
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    return rgbToLab({ r, g, b, a })
  }
  let body = call(v, 'rgb') ?? call(v, 'rgba')
  if (body !== null) {
    const [rgb, alpha] = body.includes('/') ? body.split('/') : [body, undefined]
    const parts = rgb.split(/[\s,]+/).filter(Boolean)
    const a = alpha !== undefined ? num(alpha) : parts.length === 4 ? num(parts[3]) : 1
    const [r, g, b] = parts.slice(0, 3).map((p) => num(p, 255) / 255)
    return rgbToLab({ r, g, b, a })
  }
  body = call(v, 'oklch')
  if (body !== null) {
    const [lch, alpha] = body.split('/')
    const [L, C, H] = lch.trim().split(/\s+/)
    return lchToLab(num(L), num(C, 0.4), num(H), alpha !== undefined ? num(alpha) : 1)
  }
  body = call(v, 'oklab')
  if (body !== null) {
    const [lab, alpha] = body.split('/')
    const [L, A, B] = lab.trim().split(/\s+/)
    return { L: num(L), A: num(A, 0.4), B: num(B, 0.4), alpha: alpha !== undefined ? num(alpha) : 1 }
  }
  body = call(v, 'color-mix')
  if (body !== null) return mix(body)
  throw new Error(`unsupported colour: ${raw}`)
}

/** `color-mix(in <space>, a [p%], b [q%])` per CSS Color 5, premultiplied, shorter hue arc. */
function mix(body: string): Lab {
  const [space, first, second] = args(body)
  const sp = space.replace(/^in /, '').trim()
  const split = (s: string): [string, number | undefined] => {
    const m = s.match(/^(.*?)\s+([\d.]+)%$/) ?? s.match(/^([\d.]+)%\s+(.*)$/)
    if (!m) return [s, undefined]
    return /%$/.test(s) ? [m[1], Number(m[2]) / 100] : [m[2], Number(m[1]) / 100]
  }
  const [aStr, pa] = split(first)
  const [bStr, pb] = split(second)
  let p1 = pa ?? (pb !== undefined ? 1 - pb : 0.5)
  let p2 = pb ?? 1 - p1
  const sum = p1 + p2
  const alphaScale = sum < 1 ? sum : 1
  p1 /= sum
  p2 /= sum
  const a = parse(aStr)
  const b = parse(bStr)
  const alpha = a.alpha * p1 + b.alpha * p2
  if (sp === 'oklch') {
    const x = labToLch(a)
    const y = labToLch(b)
    let h1 = Number.isNaN(x.H) ? y.H : x.H
    let h2 = Number.isNaN(y.H) ? x.H : y.H
    if (!Number.isNaN(h1) && !Number.isNaN(h2)) {
      if (h2 - h1 > 180) h1 += 360
      else if (h1 - h2 > 180) h2 += 360
    }
    const H = Number.isNaN(h1) ? NaN : (h1 * p1 + h2 * p2) % 360
    const pm = (u: number, ua: number, w: number, wa: number) => (alpha === 0 ? 0 : (u * ua * p1 + w * wa * p2) / alpha)
    return { ...lchToLab(pm(x.L, x.alpha, y.L, y.alpha), pm(x.C, x.alpha, y.C, y.alpha), H, alpha * alphaScale) }
  }
  if (sp === 'oklab') {
    const pm = (u: number, w: number) => (alpha === 0 ? 0 : (u * a.alpha * p1 + w * b.alpha * p2) / alpha)
    return { L: pm(a.L, b.L), A: pm(a.A, b.A), B: pm(a.B, b.B), alpha: alpha * alphaScale }
  }
  if (sp === 'srgb') {
    const x = labToRgb(a)
    const y = labToRgb(b)
    const pm = (u: number, w: number) => (alpha === 0 ? 0 : (u * x.a * p1 + w * y.a * p2) / alpha)
    return rgbToLab({ r: pm(x.r, y.r), g: pm(x.g, y.g), b: pm(x.b, y.b), a: alpha * alphaScale })
  }
  throw new Error(`unsupported mix space: ${space}`)
}

/** Parses a colour value (after `var()` substitution when a lookup is given) to sRGB with alpha. */
export function parseRgba(value: string, lookup?: Lookup): Rgba {
  return labToRgb(parse(lookup ? substitute(value, lookup) : value))
}

/** `fg` drawn over the opaque `bg`, as the browser composites (in gamma-encoded sRGB). */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 }
}

export function toHex({ r, g, b }: Rgba): string {
  return '#' + [r, g, b].map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('')
}

/** OKLab lightness of a resolved colour (0 to 1). */
export function lightness(c: Rgba): number {
  return rgbToLab(c).L
}

/** Euclidean OKLab distance × 100 (ΔE OK). */
export function deltaE(x: Rgba, y: Rgba): number {
  const a = rgbToLab(x)
  const b = rgbToLab(y)
  return Math.hypot(a.L - b.L, a.A - b.A, a.B - b.B) * 100
}

/**
 * Resolves token `name` from a token map (names without the `--ot-` prefix) to an
 * opaque colour: a translucent value is composited over `bg` (a token name or a
 * colour), which defaults to the `surface` token.
 */
export function resolveToken(tokens: Record<string, string>, name: string, bg?: string): Rgba {
  const lookup: Lookup = (n) => tokens[n]
  if (!(name in tokens)) throw new Error(`unknown token ${name}`)
  const c = parseRgba(tokens[name], lookup)
  if (c.a >= 1) return c
  const under = bg === undefined ? 'surface' : bg
  const back = under in tokens ? resolveToken(tokens, under) : parseRgba(under, lookup)
  return composite(c, back.a >= 1 ? back : composite(back, { r: 1, g: 1, b: 1, a: 1 }))
}

function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b)
}

/** WCAG 2.x contrast ratio of two opaque colours. */
export function ratioOf(a: Rgba, b: Rgba): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** Contrast of token `fg` over token `bg` in a token map: bg over the surface, fg over bg. */
export function tokenContrast(tokens: Record<string, string>, fg: string, bg: string): number {
  const back = resolveToken(tokens, bg)
  const lookup: Lookup = (n) => tokens[n]
  const front = parseRgba(tokens[fg], lookup)
  return ratioOf(front.a >= 1 ? front : composite(front, back), back)
}

/** Converts an sRGB hex to an `oklch(L C H)` literal (for authoring and docs). */
export function hexToOklch(hex: string, digits = 4): string {
  const { L, C, H } = labToLch(parse(hex))
  const f = (n: number) => Number(n.toFixed(digits)).toString()
  return `oklch(${f(L)} ${f(C)} ${Number.isNaN(H) ? 0 : f(H)})`
}
