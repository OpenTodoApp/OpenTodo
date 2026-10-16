// Field-name completion for the Filter view (OpenSpec custom-fields, design D5):
// after an opening double quote that is not a label or project name, the
// matching custom field names are offered; picking one closes the quote.
import type { FieldDef } from '../types'

export interface FieldSuggestion {
  name: string
  /** The query with the quoted name completed and a space after it. */
  query: string
}

/**
 * The field names to offer for `query`: when its last double quote opens an
 * unfinished quoted text not preceded by `@`, `#` or `search:`, every distinct
 * live field name starting with the typed prefix (ignoring case), at most eight.
 */
export function fieldSuggestions(query: string, defs: readonly FieldDef[], limit = 8): FieldSuggestion[] {
  let open = -1
  for (let i = 0; i < query.length; i++) {
    if (query[i] === '\\') {
      i++
      continue
    }
    if (query[i] === '"') open = open < 0 ? i : -1
  }
  if (open < 0) return []
  const before = query.slice(0, open).trimEnd()
  if (/[@#]$/.test(query.slice(0, open)) || /search:$/i.test(before)) return []
  const prefix = query.slice(open + 1).toLocaleLowerCase()
  const seen = new Set<string>()
  const out: FieldSuggestion[] = []
  for (const d of [...defs].sort((a, b) => a.name.localeCompare(b.name))) {
    const key = d.name.toLocaleLowerCase()
    if (d.deleted_at || seen.has(key) || !key.startsWith(prefix)) continue
    seen.add(key)
    out.push({ name: d.name, query: `${query.slice(0, open)}"${d.name.replace(/["\\]/g, (c) => '\\' + c)}" ` })
    if (out.length >= limit) break
  }
  return out
}
