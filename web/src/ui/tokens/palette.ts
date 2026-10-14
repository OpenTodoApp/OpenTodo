// OpenSpec design-system "Stored colours render through the palette". Projects,
// labels and views store a free hex string in ops; at render time it maps to the
// nearest of the 12 palette hues (data-hue="…"), whose solid/soft/text steps come
// from tokens and follow the theme. Rendering never writes the stored value back.
import { HUE_NAMES } from './pairs'

export type HueName = (typeof HUE_NAMES)[number]

/** Canonical hex per hue: what a colour pick stores. The first nine are the original LABEL_PALETTE. */
export const HUES: ReadonlyArray<{ name: HueName; hex: string }> = [
  { name: 'red', hex: '#ef4444' },
  { name: 'orange', hex: '#f97316' },
  { name: 'yellow', hex: '#eab308' },
  { name: 'lime', hex: '#84cc16' },
  { name: 'green', hex: '#22c55e' },
  { name: 'teal', hex: '#14b8a6' },
  { name: 'cyan', hex: '#06b6d4' },
  { name: 'blue', hex: '#3b82f6' },
  { name: 'indigo', hex: '#6366f1' },
  { name: 'violet', hex: '#8b5cf6' },
  { name: 'pink', hex: '#ec4899' },
  { name: 'slate', hex: '#64748b' },
]

function hexToRgb(value: string): [number, number, number] | null {
  const v = value.trim().toLowerCase()
  const short = v.match(/^#([0-9a-f]{3})$/)
  if (short) return [...short[1]].map((c) => parseInt(c + c, 16)) as [number, number, number]
  const long = v.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/)
  if (!long) return null
  return [0, 2, 4].map((i) => parseInt(long[1].slice(i, i + 2), 16)) as [number, number, number]
}

// sRGB → OKLCh chroma and hue angle (Björn Ottosson's OKLab). Palette hues differ
// by hue, while stored colours vary in lightness, so matching uses the hue angle.
function chromaHue([r, g, b]: [number, number, number]): { c: number; h: number } {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

/** Below this OKLCh chroma a colour reads as grey and maps to slate. */
const GREY_CHROMA = 0.06
const CHROMATIC = HUES.filter((h) => h.name !== 'slate').map((h) => ({ name: h.name, h: chromaHue(hexToRgb(h.hex)!).h }))

/** The palette hue for a stored colour: exact canonical match, else slate for greys, else nearest hue angle. */
export function hueFor(stored: string | null | undefined): HueName {
  if (!stored) return 'slate'
  const exact = HUES.find((h) => h.hex === stored.trim().toLowerCase())
  if (exact) return exact.name
  const rgb = hexToRgb(stored)
  if (!rgb) return 'slate'
  const { c, h } = chromaHue(rgb)
  if (c < GREY_CHROMA) return 'slate'
  let best: HueName = 'slate'
  let bestDist = Infinity
  for (const hue of CHROMATIC) {
    const d = Math.min(Math.abs(h - hue.h), 360 - Math.abs(h - hue.h))
    if (d < bestDist) [best, bestDist] = [hue.name, d]
  }
  return best
}
