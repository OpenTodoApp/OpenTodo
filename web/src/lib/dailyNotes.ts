// Daily notes (OpenSpec change daily-notes): one standalone note per day, the
// same note on every device. Its id is derived from the user and the day (D1,
// Go sync.DailyNoteID), it is written only at the first change (D3), and its
// template text is written once as the plain-text projection, from which the
// fold-back builds the document (D2). The creation folds under a name of its day
// and text, not the write's clock (richtext.ts foldBack), so two devices, or a
// device and the routine step, that create the same day build the same body and
// what each side types into it merges ("Two devices offline").
import { addDaysISO, logicalToday } from './dates'
import { db } from './db'
import { DAILY_TITLE, dailyNoteId } from './dailyNoteId'
import { builtinNoteTemplates, builtinText, fillContextNow, fillTemplate } from './noteTemplates'
import { foldNote, mutateMany, type Change } from './ops'
import { currentUserId } from './sharing'
import type { Note, UserPrefs } from './types'
import { workspaceFields } from './workspaces'

/** The built-in template a daily note starts from unless the setting names another. */
export const BUILTIN_DAILY = 'daily'

export { dailyNoteId } from './dailyNoteId'

/** Whether Daily notes is on for the account (off by default). */
export function dailyNotesOn(prefs: Partial<UserPrefs> | null | undefined): boolean {
  return prefs?.daily_notes === true
}

/** Today for daily notes: the local date after the day start (D4). */
export function dailyToday(now = Date.now()): string {
  return logicalToday(undefined, now)
}

/** The day `n` days from `day`. */
export const shiftDay = (day: string, n: number): string => addDaysISO(day, n)

/** Whether `day` is a calendar date written YYYY-MM-DD. */
export function isDay(day: string | null | undefined): day is string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const d = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day
}

/** A daily note's title: its weekday and date in the user's date order, as the server writes it. */
export function dailyTitle(day: string): string {
  return fillTemplate(DAILY_TITLE, '', { ...fillContextNow(), date: day }).title
}

/** What a daily note's template is: a template note, the built-in Daily, or none (D1, data model). */
export type DailyTemplate = { kind: 'none' } | { kind: 'builtin' } | { kind: 'note'; note: Pick<Note, 'title' | 'description' | 'labels'> }

/** The template the settings name, an unknown or trashed id read as the built-in Daily (the setting keeps its value). */
export function dailyTemplateOf(prefs: Partial<UserPrefs> | null | undefined, notes: readonly Note[]): DailyTemplate {
  const v = prefs?.daily_notes_template ?? ''
  if (v === 'none') return { kind: 'none' }
  if (!v) return { kind: 'builtin' }
  const note = notes.find((n) => n.id === v && !n.deleted_at && n.template)
  return note ? { kind: 'note', note } : { kind: 'builtin' }
}

/** The draft of a day: its title, the filled template text and the template's labels. */
export interface DailyDraft {
  title: string
  description: string
  labels: string[]
}

/** The draft of `day` from `template`; the placeholders are filled for that day. */
export async function dailyDraft(day: string, template: DailyTemplate, now = Date.now()): Promise<DailyDraft> {
  const title = dailyTitle(day)
  if (template.kind === 'none') return { title, description: '', labels: [] }
  const ctx = { ...fillContextNow(now), date: day }
  if (template.kind === 'note') {
    return { title, description: fillTemplate(template.note.title ?? '', template.note.description ?? '', ctx).text, labels: [...(template.note.labels ?? [])] }
  }
  const builtin = (await builtinNoteTemplates()).find((b) => b.slug === BUILTIN_DAILY)
  if (!builtin) return { title, description: '', labels: [] }
  const b = builtinText(builtin)
  return { title, description: fillTemplate(b.title, b.body, ctx).text, labels: [] }
}

/**
 * The changes that bring `day`'s note into being for `userId`: a new note with
 * the draft's title, text only and labels, `day` and the setting's project
 * (D2); a note of that day in the Trash comes back instead, as it is (spec
 * "Deleted and opened again"); a live one needs nothing.
 */
export async function planDailyNote(userId: string, day: string, prefs: Partial<UserPrefs> | null | undefined, draft: DailyDraft, now = Date.now()): Promise<Change[]> {
  const id = dailyNoteId(userId, day)
  const existing = await db.notes.get(id)
  if (existing && !existing.deleted_at) return []
  if (existing) return [{ entity: 'note', entityId: id, patch: { deleted_at: null } }]
  const project = prefs?.daily_notes_project || null
  const projectRow = project ? await db.projects.get(project) : undefined
  const projectId = projectRow && !projectRow.deleted_at ? project : null
  return [{
    entity: 'note', entityId: id, patch: {
      title: draft.title, day, description: draft.description, project_id: projectId, labels: draft.labels,
      position: now, created_at: now, deleted_at: null, template: false,
      ...(projectId ? {} : await workspaceFields()),
    },
  }]
}

/** Writes `day`'s note when it does not exist yet (or brings it back) and builds its document; returns its id, or null when signed out. */
export async function ensureDailyNote(day: string, prefs: Partial<UserPrefs> | null | undefined, now = Date.now()): Promise<string | null> {
  const userId = await currentUserId()
  if (!userId) return null
  const notes = await db.notes.toArray()
  const draft = await dailyDraft(day, dailyTemplateOf(prefs, notes), now)
  const changes = await planDailyNote(userId, day, prefs, draft, now)
  if (changes.length) {
    await mutateMany(changes)
    await foldNote('note', dailyNoteId(userId, day))
  }
  return dailyNoteId(userId, day)
}
