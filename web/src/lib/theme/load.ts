// The lazy half of the theme engine (OpenSpec change theme-engine, design D5): reads a
// chosen theme's document, validates and migrates it, and derives it, or keeps the
// device's cached result when the document and the derivation are unchanged. Loaded
// only when a side's choice is a theme other than OpenTodo's and with Settings, never
// before the first paint.
import { deriveTheme, DERIVE_VERSION, type ResolvedTheme } from './derive'
import { validateTheme, type ThemeDocument } from './format'
import { themeHash, type AppliedTheme } from './apply'

const DOCS = import.meta.glob<ThemeDocument>('./builtin/*.json', { import: 'default' })

/** A shipped theme's document, or null when this app has no such theme. */
export async function builtinDocument(id: string): Promise<ThemeDocument | null> {
  const load = DOCS[`./builtin/${id}.json`]
  return load ? load() : null
}

/** The applied form of a resolved theme. */
export function toApplied(t: ResolvedTheme, hash: string): AppliedTheme {
  return { id: t.id, hash, kind: t.kind, tokens: t.tokens, bar: t.bar, ...(t.radius ? { radius: t.radius } : {}), ...(t.font ? { font: t.font } : {}), ...(t.list ? { list: t.list } : {}) }
}

/**
 * Resolves a document for applying: null when it is invalid or of a newer format
 * (the side then shows its default and nothing is written, themes "Format versions
 * and migration"); the cached result when its hash still matches.
 */
export function resolveDocument(doc: ThemeDocument, cached?: AppliedTheme): AppliedTheme | null {
  const r = validateTheme(doc)
  if (!r.ok) return null
  const hash = themeHash(JSON.stringify(doc), DERIVE_VERSION)
  if (cached && cached.id === r.doc.id && cached.hash === hash) return cached
  return toApplied(deriveTheme(r.doc), hash)
}

/** Loads, validates and resolves a shipped theme for one side. */
export async function loadAppliedTheme(id: string, cached?: AppliedTheme): Promise<AppliedTheme | null> {
  const doc = await builtinDocument(id)
  return doc ? resolveDocument(doc, cached) : null
}
