// What the theme editor computes on a draft (OpenSpec change theme-editor, design
// D8): the resolved theme, its failing pairs and the fixes. Kept apart so it runs
// in a worker (resolver.ts): deriving a document whose seeds sit in the middle
// band, where the search walks far, can take a second or more, and the editor must
// stay responsive while a slider moves.
import { checkTheme, type ContrastFailure } from './check'
import { deriveTheme, type ResolvedTheme } from './derive'
import { fixAll, fixPair, pairRatio, withToken, type Fix } from './fix'
import type { ThemeDocument } from './format'

export interface Resolution {
  resolved: ResolvedTheme
  failures: ContrastFailure[]
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

export function resolveDraft(doc: ThemeDocument): Resolution {
  const resolved = deriveTheme(doc)
  return { resolved, failures: checkTheme(resolved) }
}

export function compute(req: ComputeRequest): ComputeResult {
  if (req.type === 'resolve') return resolveDraft(req.doc)
  if (req.type === 'fixAll') return fixAll(req.doc)
  const fix = fixPair(req.doc, req.pair)
  if (!fix) return null
  const doc = withToken(req.doc, fix.token, fix.value)
  return { doc, fixes: [fix], ratio: pairRatio(deriveTheme(doc), req.pair.fg, req.pair.bg) }
}
