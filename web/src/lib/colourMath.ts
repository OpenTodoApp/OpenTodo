// The colour maths shared by the token resolver (ui/tokens/resolve.ts, test and
// workbench code) and the custom accent derivation (accentDerive.ts, loaded with
// Settings): sRGB to and from OKLab, WCAG luminance and contrast, hex. Pure and
// tiny, so the lazy Settings chunk does not pull the CSS parser in.
export type Rgba = { r: number; g: number; b: number; a: number }
export type Lab = { L: number; A: number; B: number; alpha: number }

export const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.sign(c) * Math.abs(c) ** (1 / 2.4) - 0.055)

export function rgbToLab({ r, g, b, a }: Rgba): Lab {
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

/** OKLab to gamma-encoded sRGB, unclamped (a channel outside 0 to 1 is out of gamut). */
export function labToRgbRaw({ L, A, B, alpha }: Lab): Rgba {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  const [r, g, b] = lin.map(fromLin)
  return { r, g, b, a: alpha }
}

/** OKLab to sRGB, each channel clamped to the gamut (as the token resolver draws). */
export function labToRgb(lab: Lab): Rgba {
  const { r, g, b, a } = labToRgbRaw(lab)
  const c = (x: number) => Math.min(1, Math.max(0, x))
  return { r: c(r), g: c(g), b: c(b), a }
}

export function lchToLab(L: number, C: number, H: number, alpha = 1): Lab {
  const h = ((Number.isNaN(H) ? 0 : H) * Math.PI) / 180
  return { L, A: C * Math.cos(h), B: C * Math.sin(h), alpha }
}

export function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b)
}

/** WCAG 2.x contrast ratio of two opaque colours. */
export function ratioOf(a: Rgba, b: Rgba): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** `fg` drawn over the opaque `bg`, as the browser composites (in gamma-encoded sRGB). */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 }
}

export function toHex({ r, g, b }: Rgba): string {
  return '#' + [r, g, b].map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('')
}

/** `#rrggbb` (lowercase or not) to sRGB; anything else throws. */
export function hexToRgb(hex: string): Rgba {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`)
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
  return { r, g, b, a: 1 }
}

/** Euclidean OKLab distance × 100 (ΔE OK). */
export function deltaE(x: Rgba, y: Rgba): number {
  const a = rgbToLab(x)
  const b = rgbToLab(y)
  return Math.hypot(a.L - b.L, a.A - b.A, a.B - b.B) * 100
}
