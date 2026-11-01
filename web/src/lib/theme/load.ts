// The lazy half of the theme engine (OpenSpec change theme-engine, design D5): reads a
// chosen theme's document, validates and migrates it, and derives it, or keeps the
// device's cached result when the document and the derivation are unchanged. Loaded
// only when a side's choice is a theme other than OpenTodo's (a built-in or one of the user's
// own themes, theme-editor D1) and with Settings, never
// before the first paint.
import { deriveTheme, DERIVE_VERSION, type ResolvedTheme } from './derive'
import { validateTheme, type ThemeDocument } from './format'
import { themeHash, type AppliedTheme } from './apply'
import { db } from '../db'

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
export async function loadAppliedTheme(id: string, cached?: AppliedTheme, side?: ThemeDocument['kind']): Promise<AppliedTheme | null> {
  const doc = await builtinDocument(id)
  // A theme of the other kind reads as the side's default (choice.ts reads unknown ids provisionally).
  if (!doc || (side && doc.kind !== side)) return null
  return resolveDocument(doc, cached)
}

/**
 * Loads, validates and resolves one of the user's own themes (theme-editor D1)
 * from the synced table: null when it is missing, deleted, without a document or
 * of the other kind (the side then shows its default and nothing is written).
 * The applied id is the entity id, whatever the document says.
 */
export async function loadCustomAppliedTheme(id: string, cached?: AppliedTheme, side?: ThemeDocument['kind']): Promise<AppliedTheme | null> {
  const row = await db.themes.get(id)
  if (!row || row.deleted_at || !row.doc) return null
  if (side && row.doc.kind !== side) return null
  return resolveDocument({ ...row.doc, id }, cached)
}
