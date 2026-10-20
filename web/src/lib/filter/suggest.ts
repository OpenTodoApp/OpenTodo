// Field-name completion for the Filter view (OpenSpec custom-fields, design D5):
// after an opening double quote that is not a label or project name, the
// matching custom field names are offered; picking one closes the quote.
import type { FieldDef, Task } from '../types'
import { originOf } from '../taskOrigin'

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

const ORIGIN_KINDS = ['url', 'email', 'issue', 'import']

/**
 * Values to offer after `origin:` (OpenSpec task-origin, design D9): the four
 * kinds and the providers found on the local tasks, starting with the typed
 * prefix, at most eight. Picking one completes the term and adds a space.
 */
export function originSuggestions(query: string, tasks: readonly Task[], limit = 8): FieldSuggestion[] {
  const m = /(^|[\s(!&|])origin:\s*([^\s"&|()!<>=]*)$/i.exec(query)
  if (!m) return []
  const prefix = m[2].toLowerCase()
  const start = query.length - m[2].length
  const providers = new Set<string>()
  for (const task of tasks) {
    const p = originOf(task)?.provider
    if (p && !task.deleted_at) providers.add(p)
  }
  const out: FieldSuggestion[] = []
  for (const name of [...ORIGIN_KINDS, ...[...providers].sort()]) {
    if (name === prefix || !name.startsWith(prefix) || out.some((s) => s.name === name)) continue
    out.push({ name, query: `${query.slice(0, start)}${name} ` })
    if (out.length >= limit) break
  }
  return out
}
