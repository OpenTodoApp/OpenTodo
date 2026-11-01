// Custom themes (OpenSpec change theme-editor, design D1, D2, D4): the user's own
// theme documents in the synced personal `theme` entity, at most 20 live ones per
// user and 16 KB each. Creating, saving and deleting go through the op log
// (offline at once, synced later); deleting a theme chosen for a side writes that
// side back to its default in the same undoable batch. Themes are appearance, not
// content: never encrypted. Lazy: Settings › Appearance and the editor load it.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { t } from '../i18n'
import { uuid } from '../ids'
import { getDeviceId, mutate } from '../ops'
import type { CustomTheme, UserPrefs } from '../types'
import { USER_PREFS_ID } from '../userPrefs'
import { applyBatch } from '../undo'
import type { AssistantUndo } from '../db'
import { choiceField, customChoice, type KnownCustomTheme, type Side } from './choice'
import { MAX_THEME_BYTES, THEME_FORMAT, validateTheme, type ThemeDocument, type ThemeKind } from './format'

/** The most live custom themes a user keeps (design D2). */
export const MAX_CUSTOM_THEMES = 20
/** The longest theme name (theme-engine D1). */
export const MAX_THEME_NAME = 60

/** A live custom theme: a row that is not deleted and has a document. */
export type LiveTheme = CustomTheme & { doc: ThemeDocument }

/** The live custom themes in their order (position, then creation). */
export function liveThemes(rows: readonly CustomTheme[]): LiveTheme[] {
  return rows.filter((r): r is LiveTheme => !r.deleted_at && !!r.doc && typeof r.doc === 'object')
    .sort((a, b) => a.position - b.position || a.created_at - b.created_at)
}

const NO_THEMES: LiveTheme[] = []

/** The live custom themes, live; undefined while the first read runs. */
export function useCustomThemes(): LiveTheme[] | undefined {
  return useLiveQuery(async () => liveThemes(await db.themes.toArray()), [])
}

/** The live custom themes, live; empty while loading. */
export function useCustomThemeList(): LiveTheme[] {
  return useCustomThemes() ?? NO_THEMES
}

/** What the theme choice needs of the custom themes: ids and kinds. */
export function knownCustom(list: readonly LiveTheme[]): KnownCustomTheme[] {
  return list.map((r) => ({ id: r.id, kind: r.doc.kind }))
}

/** Whether another theme may be added (design D2). */
export const canAddTheme = (count: number) => count < MAX_CUSTOM_THEMES

/** The message shown where adding a theme is unavailable. */
export const limitMessage = () => t('You have {n} themes; delete one to add another.', { n: MAX_CUSTOM_THEMES })

/** The size of a document as the server measures it: bytes of its UTF-8 JSON. */
export function themeBytes(doc: ThemeDocument): number {
  return new TextEncoder().encode(JSON.stringify(doc)).length
}

/** Why a document cannot be saved: invalid or too large; null when it can. */
export function saveError(doc: ThemeDocument): string | null {
  if (themeBytes(doc) > MAX_THEME_BYTES) return t('This theme is larger than 16 KB.')
  const r = validateTheme(doc)
  return r.ok ? null : t('This theme is not valid ({path}).', { path: r.path || r.error })
}

/**
 * Saves a document as the custom theme `id`: one op (`doc`) for a theme that
 * exists, and its creation fields too for a new one. The document's own id is the
 * entity id. Throws when the document is invalid or a new theme would pass the limit.
 */
export async function saveCustomTheme(id: string, doc: ThemeDocument, now = Date.now()): Promise<void> {
  const value: ThemeDocument = { ...doc, id }
  const error = saveError(value)
  if (error) throw new Error(error)
  const row = await db.themes.get(id)
  if (row && !row.deleted_at) {
    await mutate('theme', id, { doc: value })
    return
  }
  const live = liveThemes(await db.themes.toArray())
  if (!canAddTheme(live.length)) throw new Error(limitMessage())
  const position = Math.max(0, ...live.map((r) => r.position)) + 1024
  await mutate('theme', id, { doc: value, position, created_at: now, deleted_at: null })
}

/**
 * Deletes a custom theme (a tombstone) as one undoable batch; a side that has it
 * chosen goes back to its default in the same batch, so Undo restores both
 * (themes "Delete the chosen theme"). Returns the undo entry and the toast's text.
 */
export async function deleteCustomThemeUndoable(id: string, prefs: Partial<UserPrefs> | null | undefined, now = Date.now()): Promise<{ entry: AssistantUndo | null; label: string }> {
  const row = await db.themes.get(id)
  if (!row || row.deleted_at) return { entry: null, label: '' }
  await getDeviceId()
  const sides = (['light', 'dark'] as Side[]).filter((s) => prefs?.[choiceField(s)] === customChoice(id))
  const label = t('Theme deleted')
  const entry = await applyBatch([
    { entity: 'theme', entityId: id, patch: { deleted_at: now }, base: { deleted_at: null } },
    ...sides.map((s) => ({ entity: 'user_prefs' as const, entityId: USER_PREFS_ID, patch: { [choiceField(s)]: '' }, base: { [choiceField(s)]: customChoice(id) } })),
  ], { source: 'action', label })
  return { entry, label }
}

/** A new theme id (an entity id that is also a valid document id). */
export const newThemeId = () => uuid()

/** A name that no other theme has: the name, else with " (2)", " (3)"… (design D11). */
export function uniqueName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((n) => n.toLocaleLowerCase()))
  const base = name.trim().slice(0, MAX_THEME_NAME) || t('Untitled theme')
  if (!used.has(base.toLocaleLowerCase())) return base
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`
    const candidate = base.slice(0, MAX_THEME_NAME - suffix.length) + suffix
    if (!used.has(candidate.toLocaleLowerCase())) return candidate
  }
}

const clip = (s: string, n: number) => [...s].slice(0, n).join('')

/**
 * Customise (design D4): a copy that looks identical, named "<name> (custom)",
 * by the user, crediting the original's name, author and licence, keeping the
 * licence until the user changes it. Seeds and explicit tokens are copied.
 */
export function customiseDocument(source: ThemeDocument, author: string, id = newThemeId()): ThemeDocument {
  const credit = t('Based on {name} by {author} ({licence})', { name: source.name, author: source.author || t('unknown'), licence: source.licence || t('unknown') })
  const note = source.notes?.text ? `${credit}. ${source.notes.text}` : credit
  const { source: _src, ...rest } = source
  void _src
  return {
    ...rest,
    opentodoTheme: THEME_FORMAT,
    id,
    name: clip(t('{name} (custom)', { name: source.name }), MAX_THEME_NAME),
    author: clip(author, 120),
    licence: source.licence,
    notes: { ...(source.notes?.adapted ? { adapted: source.notes.adapted } : {}), text: clip(note, 500) },
  }
}

/** A new theme (design D4): OpenTodo's seeds of the side, every token derived. */
export function newDocument(base: ThemeDocument, author: string, name: string, id = newThemeId()): ThemeDocument {
  return { opentodoTheme: THEME_FORMAT, id, name: clip(name, MAX_THEME_NAME), author: clip(author, 120), licence: 'CC0-1.0', kind: base.kind, seeds: { ...base.seeds } }
}

/** A copy of a custom theme under a new id and a free name. */
export function duplicateDocument(doc: ThemeDocument, taken: readonly string[], id = newThemeId()): ThemeDocument {
  return { ...structuredClone(doc), id, name: uniqueName(doc.name, taken) }
}

/** The kind of the other side. */
export const otherKind = (k: ThemeKind): ThemeKind => (k === 'light' ? 'dark' : 'light')
