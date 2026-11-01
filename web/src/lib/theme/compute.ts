// What the theme editor computes on a draft (OpenSpec change theme-editor, design
// D8): the resolved theme, its failing pairs and the fixes. Kept apart so it runs
// in a worker (resolver.ts): deriving a document whose seeds sit in the middle
// band, where the search walks far, can take a second or more, and the editor must
// stay responsive while a slider moves.
import { checkTheme, type ContrastFailure } from './check'
import { deriveTheme, type ResolvedTheme } from './derive'
import { fixAll, fixPair, pairRatio, withToken, type Fix } from './fix'
import type { ThemeDocument } from './format'
import { GLYPH_PAIRS, PAIRS, type Pair } from '../../ui/tokens/pairs'
import { colourToHex } from './oklch'
import { cssName } from './tokens'

export interface Resolution {
  resolved: ResolvedTheme
  failures: ContrastFailure[]
  /** Each stylesheet token's worst pair (the lowest ratio for its minimum): the ratio, the minimum and the other token. */
  worst: Record<string, { ratio: number; min: number; other: string }>
}

export type ComputeRequest =
  | { type: 'resolve'; doc: ThemeDocument }
  | { type: 'fix'; doc: ThemeDocument; pair: { fg: string; bg: string } }
  | { type: 'fixAll'; doc: ThemeDocument }

export type FixOutcome = {
  doc: ThemeDocument
  fixes: Fix[]
  /** The fixed pair's ratio after the fix (one pair), for the announcement. */
  ratio?: number
}

export type ComputeResult = Resolution | FixOutcome | null

const ALL_PAIRS: readonly Pair[] = [...PAIRS, ...GLYPH_PAIRS]

export function resolveDraft(doc: ThemeDocument): Resolution {
  const resolved = deriveTheme(doc)
  // Every pair measured once (a minimum of Infinity makes checkTheme report each ratio).
  const measured = checkTheme(resolved, ALL_PAIRS.map((p) => ({ ...p, min: Infinity })))
  const worst: Resolution['worst'] = {}
  measured.forEach((m, i) => {
    const min = ALL_PAIRS[i].min
    for (const [tok, other] of [[m.fg, m.bg], [m.bg, m.fg]]) {
      const w = worst[tok]
      if (!w || m.ratio / min < w.ratio / w.min) worst[tok] = { ratio: m.ratio, min, other }
    }
  })
  return { resolved, failures: checkTheme(resolved), worst }
}

export function compute(req: ComputeRequest): ComputeResult {
  if (req.type === 'resolve') return resolveDraft(req.doc)
  if (req.type === 'fixAll') return fixAll(req.doc)
  const fix = fixPair(req.doc, req.pair)
  if (!fix) return null
  const doc = withToken(req.doc, fix.token, fix.value)
  return { doc, fixes: [fix], ratio: pairRatio(deriveTheme(doc), req.pair.fg, req.pair.bg) }
}

/**
 * The document with every explicit token that its seeds already give dropped
 * (theme-editor D4): a copy of a theme that writes out all its values (OpenTodo's
 * own) then follows its seeds, and still looks the same, colour for colour as the
 * screen shows it. A token whose value the derivation would not reproduce stays set.
 */
export function simplifyDocument(doc: ThemeDocument): ThemeDocument {
  if (!doc.tokens) return doc
  const original = doc.tokens
  const hex = (v: string | undefined) => (v ? colourToHex(v) : null)
  let keep = { ...original }
  for (let round = 0; round < 4; round++) {
    const derived = deriveTheme({ ...doc, tokens: keep }).tokens
    const dropped = Object.keys(keep).filter((tok) => hex(keep[tok]) === hex(derived[cssName(tok)]))
    const trial = Object.fromEntries(Object.entries(keep).filter(([tok]) => !dropped.includes(tok)))
    const after = deriveTheme({ ...doc, tokens: trial }).tokens
    // Only what still comes out the same is dropped; the rest is kept and tried again.
    const back = dropped.filter((tok) => hex(after[cssName(tok)]) !== hex(original[tok]))
    const next = { ...trial, ...Object.fromEntries(back.map((tok) => [tok, original[tok]])) }
    const settled = Object.keys(next).length === Object.keys(keep).length
    keep = next
    if (settled) break
  }
  const { tokens: _t, ...rest } = doc
  void _t
  return Object.keys(keep).length ? { ...rest, tokens: keep } : rest
}
