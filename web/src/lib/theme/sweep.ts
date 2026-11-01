// The fixed sweep of seed sets the derivation must pass (theme-engine D10): 200
// themes of only seeds, light and dark, canvases across the hue circle and the
// lightness band of each kind, pale and saturated accents, with and without status
// seeds. contrast.test.ts derives each and requires every pair to pass. Test only.
import { labToRgb, lchToLab, toHex } from '../colourMath'
import type { ThemeDocument, ThemeKind } from './format'

export interface SeedSet {
  name: string
  kind: ThemeKind
  seeds: ThemeDocument['seeds']
}

const hex = (L: number, C: number, H: number) => toHex(labToRgb(lchToLab(L, C, H)))

function seedSet(i: number): SeedSet {
  const kind: ThemeKind = i % 2 === 0 ? 'light' : 'dark'
  const hue = (i * 37) % 360
  const band = Math.floor(i / 2) % 5
  const tint = [0, 0.008, 0.02, 0.035, 0.05][Math.floor(i / 10) % 5]
  const accentHue = (hue + 40 + i * 53) % 360
  const pale = i % 3 === 0
  const canvasL = kind === 'light' ? 0.9 + band * 0.02 : 0.13 + band * 0.035
  const surfaceL = kind === 'light' ? Math.min(1, canvasL + 0.03) : canvasL + 0.04
  const textL = kind === 'light' ? 0.18 + band * 0.04 : 0.97 - band * 0.03
  const accent = pale ? hex(kind === 'light' ? 0.88 : 0.9, 0.09, accentHue) : hex(kind === 'light' ? 0.55 : 0.68, 0.17, accentHue)
  const status = i % 4 < 2 ? {} : {
    success: hex(0.62, 0.15, 150), warning: hex(0.75, 0.15, 75), danger: hex(0.6, 0.19, 25), info: hex(0.6, 0.13, 250),
  }
  return {
    name: `sweep ${i}: ${kind}, canvas hue ${hue}, ${pale ? 'pale' : 'saturated'} accent hue ${accentHue}`,
    kind,
    seeds: { canvas: hex(canvasL, tint, hue), surface: hex(surfaceL, tint * 0.8, hue), text: hex(textL, tint * 0.5, hue), accent, ...status },
  }
}

export const SWEEP: readonly SeedSet[] = Array.from({ length: 200 }, (_, i) => seedSet(i))

export function sweepDocument(s: SeedSet): ThemeDocument {
  return { opentodoTheme: 1, id: s.name.split(':')[0].replace(' ', '-'), name: s.name.slice(0, 60), author: '', licence: '', kind: s.kind, seeds: s.seeds }
}
