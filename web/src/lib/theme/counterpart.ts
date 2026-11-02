// The counterpart of a theme (OpenSpec change theme-editor, design D9): a new draft
// of the other kind with the same accent and status seeds, the canvas, surface and
// text seeds mirrored in lightness at their own hues (each keeps its distance from
// OpenTodo's seed of its kind, on the other side's OpenTodo seed), and no explicit
// tokens, so every other colour is derived and passes by construction.
import dark from './builtin/opentodo-dark.json'
import light from './builtin/opentodo-light.json'
import type { ThemeDocument, ThemeKind } from './format'
import { clampToGamut, formatOklch, parseOklch } from './oklch'

const OWN: Record<ThemeKind, ThemeDocument> = { light: light as unknown as ThemeDocument, dark: dark as unknown as ThemeDocument }
const MIRRORED = ['canvas', 'surface', 'text'] as const

/** The document of the other kind (design D9); `id` and `name` are the new draft's. */
export function counterpartDocument(doc: ThemeDocument, id: string, name: string): ThemeDocument {
  const kind: ThemeKind = doc.kind === 'light' ? 'dark' : 'light'
  const seeds: ThemeDocument['seeds'] = { ...doc.seeds }
  for (const s of MIRRORED) {
    const c = parseOklch(doc.seeds[s])
    const from = parseOklch(OWN[doc.kind].seeds[s])!
    const to = parseOklch(OWN[kind].seeds[s])!
    if (!c) continue
    const L = Math.min(1, Math.max(0, to.L - (c.L - from.L)))
    seeds[s] = formatOklch(clampToGamut({ ...c, L }).colour)
  }
  const { tokens: _t, bar: _b, notes: _n, ...rest } = doc
  void _t; void _b; void _n
  return { ...rest, id, name, kind, seeds }
}
