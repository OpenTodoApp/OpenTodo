// Label matching of the read tools (assistant-eval-gaps), the twin of
// internal/agenttools/labelmatch.go, pinned by labelMatch.vectors.json: a query
// that is a label's name plus a trailing "s" or "es" finds that label. It adds
// matches only and never stems, so other languages just get no extra match.
import { PREFIX as CIPHERTEXT_PREFIX } from '../crypto'

const query = (q: string) => q.trim().toLowerCase().replace(/^[#@]+/, '')
const stored = (name: string) => (name.startsWith(CIPHERTEXT_PREFIX) ? '' : name.trim().toLowerCase())
const pluralOf = (q: string, name: string) => ['s', 'es'].some((end) => q.endsWith(end) && q.length > end.length && q.slice(0, -end.length) === name)

/** list_tasks' label argument against a label name: the same name ignoring case, or its simple plural. */
export function labelFilterMatches(name: string, q: string): boolean {
  const n = stored(name)
  const w = query(q)
  return !!n && !!w && (n === w || pluralOf(w, n))
}

/** search_tasks' rule for a task's label: the name holds the query, or the query is its simple plural. */
export function labelSearchMatches(name: string, q: string): boolean {
  const n = stored(name)
  const w = query(q)
  return !!n && !!w && (n.includes(w) || pluralOf(w, n))
}
