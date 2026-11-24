// Wildcard names (OpenSpec change filter-wildcards): in a label, project or
// section term, `*` matches any run of characters, none included; `\*` is a
// literal star and `\\` a literal backslash (any other backslash is itself).
// A name that is exactly a live item's name means that item, so a query saved
// before wildcards keeps its meaning. Matched without regular expressions, so a
// name cannot inject one; internal/filter/names.go is the same code in Go.
import { nameKey } from '../fieldNames'

/** A real name as a term writes it: its backslashes and stars are literal. */
export const literalName = (name: string): string => name.replace(/[\\*]/g, (c) => '\\' + c)

/** A term's name read as pieces between its wildcards, escapes resolved: one piece when it has none. */
function pieces(name: string): string[] {
  const parts = ['']
  for (let i = 0; i < name.length; i++) {
    const c = name[i]
    if (c === '*') parts.push('')
    else if (c === '\\' && (name[i + 1] === '*' || name[i + 1] === '\\')) parts[parts.length - 1] += name[++i]
    else parts[parts.length - 1] += c
  }
  return parts
}

/** A term's name without its escapes, for a lookup by exact name (meaningful when it has no wildcard). */
export const unescapeName = (name: string): string => pieces(name).join('*')

/** The pieces between a name's wildcards, in lower case; null when it has none. */
export function wildcardParts(name: string): string[] | null {
  const parts = pieces(name.trim())
  return parts.length < 2 ? null : parts.map((p) => p.toLocaleLowerCase())
}

/** Whether a name key (`nameKey`) fits the pieces: the first a prefix, the last a suffix, the others in order between. */
function fitsParts(key: string, parts: readonly string[]): boolean {
  const first = parts[0]
  const last = parts[parts.length - 1]
  const end = key.length - last.length
  if (end < first.length || !key.startsWith(first) || !key.endsWith(last)) return false
  let at = first.length
  for (let i = 1; i < parts.length - 1; i++) {
    const j = key.indexOf(parts[i], at)
    if (j < 0 || j + parts[i].length > end) return false
    at = j + parts[i].length
  }
  return true
}

/**
 * The ids a term's name picks from ids by name key; undefined when none. The
 * name exactly as written wins (`@to*do` is the label "to*do" while it exists),
 * then the pattern, then the name with its escapes resolved.
 */
export function idsNamed(byName: ReadonlyMap<string, string[]>, name: string): string[] | undefined {
  const exact = byName.get(nameKey(name))
  if (exact) return exact
  const parts = wildcardParts(name)
  if (!parts) return byName.get(nameKey(unescapeName(name)))
  const ids = [...byName].flatMap(([key, list]) => (fitsParts(key, parts) ? list : []))
  return ids.length ? ids : undefined
}
