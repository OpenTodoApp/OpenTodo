// OKLCH colours for the theme editor (OpenSpec change theme-editor, design D5):
// read a document colour (`#rrggbb` or `oklch(L C H)`), write one in the
// document grammar, keep it inside the sRGB gamut by lowering its chroma at the
// same lightness and hue, and show it as hex. Small and dependency-free: the
// colour field primitive (ui/ColourField) and the editor's lazy chunk share it.
import { hexToRgb, labToRgbRaw, lchToLab, rgbToLab, toHex } from '../colourMath'

export interface Oklch {
  /** Lightness, 0 to 1. */
  L: number
  /** Chroma, 0 to 0.37 in the editor (0.4 in the format). */
  C: number
  /** Hue in degrees, 0 to 360. */
  H: number
}

/** The largest chroma the editor's slider offers (design D5). */
export const MAX_CHROMA = 0.37
const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*[\d.]+\s*)?\)$/
const HEX = /^#[0-9a-fA-F]{6}$/
const TOLERANCE = 0.001

/** Reads `#rrggbb` (an alpha byte is ignored) or `oklch(L C H)`; null for anything else. */
export function parseOklch(v: string | undefined | null): Oklch | null {
  if (!v) return null
  const m = OKLCH.exec(v.trim())
  if (m) return { L: Number(m[1]), C: Number(m[2]), H: Number(m[3]) }
  const hex = v.trim().slice(0, 7)
  if (!HEX.test(hex)) return null
  const { L, A, B } = rgbToLab(hexToRgb(hex))
  const C = Math.hypot(A, B)
  return { L, C, H: C < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4
const r2 = (n: number) => Math.round(n * 100) / 100

/** Whether sRGB can show the colour (with the format's rounding tolerance). */
export function inGamut({ L, C, H }: Oklch): boolean {
  const { r, g, b } = labToRgbRaw(lchToLab(L, C, H))
  return [r, g, b].every((x) => x >= -TOLERANCE && x <= 1 + TOLERANCE)
}

/** The colour with its chroma lowered until sRGB shows it, at the same lightness and hue; `clamped` when it moved. */
export function clampToGamut(c: Oklch): { colour: Oklch; clamped: boolean } {
  const base = { L: Math.min(1, Math.max(0, c.L)), C: Math.min(0.4, Math.max(0, c.C)), H: ((c.H % 360) + 360) % 360 }
  if (inGamut(base)) return { colour: base, clamped: false }
  let lo = 0
  let hi = base.C
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inGamut({ ...base, C: mid })) lo = mid
    else hi = mid
  }
  return { colour: { ...base, C: Math.floor(lo * 1e4) / 1e4 }, clamped: true }
}

/** The colour in the document grammar: `oklch(L C H)`, rounded as the derivation writes. */
export function formatOklch(c: Oklch): string {
  return `oklch(${r4(c.L)} ${r4(c.C)} ${r2(c.H)})`
}

/** The colour as `#rrggbb` (what a person reads and types). */
export function oklchToHex(c: Oklch): string {
  return toHex(labToRgbRaw(lchToLab(c.L, c.C, c.H)))
}

/** Any document colour as `#rrggbb`; null when it is not one. */
export function colourToHex(v: string | undefined | null): string | null {
  if (v && HEX.test(v.trim().slice(0, 7)) && v.trim().length === 7) return v.trim().toLowerCase()
  const c = parseOklch(v)
  return c ? oklchToHex(c) : null
}
