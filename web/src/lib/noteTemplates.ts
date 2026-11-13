// Note templates (OpenSpec change note-templates): a template is a note with
// `template` set (D1); a note made from one is a plain copy written on the
// device in one batch (D2); four placeholders are filled once, as
// internal/templatelib does (D3), pinned by
// internal/templatelib/testdata/placeholders.vectors.json; the built-in ones
// come from the template library (D4), loaded only when a template list opens.
import { currentDateTime } from './dates'
import { logicalToday } from './dates'
import { currentLanguage } from './i18n'
import { createNoteUndoable, type Converted } from './noteOps'
import { membershipMap, roleOf } from './sharing'
import type { Note } from './types'

export { fillTemplate, formatPlaceholderDate, formatPlaceholderTime, unknownPlaceholders, type FillContext } from './noteTemplateFill'
import type { FillContext } from './noteTemplateFill'
import { fillTemplate } from './noteTemplateFill'

/** The placeholders' context now: the user's day start, date and time preferences and interface language. */
export function fillContextNow(now = Date.now()): FillContext {
  const p = currentDateTime()
  const d = new Date(now)
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { date: logicalToday(undefined, now), time, order: p.order, hour12: p.hour12, lang: currentLanguage() }
}

/** A built-in note template of the library (templates/notes/), text per language. */
export interface BuiltinNoteTemplate {
  slug: string
  icon: string
  title: Record<string, string>
  summary: Record<string, string>
  body: Record<string, string>
}

const pick = (m: Record<string, string>, lang: string) => m[lang] ?? m.en ?? ''

/** The built-in note templates, read lazily from the compiled library. */
export async function builtinNoteTemplates(): Promise<BuiltinNoteTemplate[]> {
  const lib = (await import('../generated/templates.json')).default as unknown as { notes?: BuiltinNoteTemplate[] }
  return lib.notes ?? []
}

/** A built-in's title, summary and body in the interface language (English otherwise). */
export function builtinText(b: BuiltinNoteTemplate, lang = currentLanguage()): { title: string; summary: string; body: string } {
  return { title: pick(b.title, lang), summary: pick(b.summary, lang), body: pick(b.body, lang) }
}

/** What a note is made from: one of the user's templates, or a built-in one. */
export type TemplateSource = { kind: 'note'; note: Pick<Note, 'title' | 'description' | 'project_id' | 'labels'> } | { kind: 'builtin'; template: BuiltinNoteTemplate }

/**
 * Creates a note from a template in one undoable batch (D2): its title, text,
 * project and labels with the placeholders filled, `template` false. A viewer
 * of the template's project gets the copy without a project; a built-in goes
 * to `projectId` (an `in:` chip of the search field) or none.
 */
export async function createFromTemplate(src: TemplateSource, opts: { projectId?: string | null; now?: number } = {}): Promise<Converted> {
  const ctx = fillContextNow(opts.now)
  if (src.kind === 'builtin') {
    const b = builtinText(src.template)
    const filled = fillTemplate(b.title, b.body, ctx)
    return createNoteUndoable({ title: filled.title, description: filled.text, project_id: opts.projectId ?? null, labels: [] })
  }
  const n = src.note
  const filled = fillTemplate(n.title ?? '', n.description ?? '', ctx)
  let projectId = n.project_id ?? null
  if (projectId && roleOf(projectId, await membershipMap()) === 'viewer') projectId = null
  return createNoteUndoable({ title: filled.title, description: filled.text, project_id: projectId, labels: [...(n.labels ?? [])] })
}
