// Tasks from a note's check-list lines (OpenSpec change note-checklist-tasks): Make tasks
// in a project or standalone note reads each line with quick-add syntax (D2), Make
// subtask keeps the line as the title; the tasks are planned here and written by the
// editor in one batch with the note (D3). Lazy chunk only (the notes editor).
import { logicalToday, resolveDateTime, systemDateTime } from './dates'
import { db } from './db'
import { dayPartsOn } from './dayParts'
import { energyLevelsOn } from './energy'
import { preferredLanguages } from './i18n'
import { findLabel, loadQuickAddSettings, parse, resolveDayMonthOrder, resolveLanguages, type ParseContext } from './nlp'
import { planTask, type Change, type NewTaskInput } from './ops'
import { timeSectorsOn } from './sectorNames'

/** The quick-add options of a line read now on this device, or null while parsing is off. */
async function parseContext(): Promise<Omit<ParseContext, 'dismissed'> | null> {
  const settings = loadQuickAddSettings()
  if (!settings.enabled) return null
  const prefs = await db.userPrefs.get('me')
  const langs = preferredLanguages()
  const now = new Date()
  return {
    today: logicalToday(),
    now: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    languages: resolveLanguages(settings, langs),
    dayMonthOrder: resolveDayMonthOrder(settings, langs, prefs),
    weekStart: resolveDateTime({ date_format: prefs?.date_format ?? 'system', time_format: prefs?.time_format ?? 'system', week_start: prefs?.week_start ?? 'system' }, systemDateTime()).weekStart,
    projects: (await db.projects.toArray()).map((p) => ({ id: p.id, name: p.name, archived: p.archived, deleted_at: p.deleted_at, parent_id: p.parent_id })),
    dayParts: dayPartsOn(prefs),
    energy: energyLevelsOn(prefs),
    sectors: timeSectorsOn(prefs),
  }
}

/**
 * A line read with quick-add syntax (D2): its title, date, priority, labels the
 * account has (a new label name stays out: the batch writes tasks and the note only),
 * and the other attributes; the line itself when the parse leaves no title.
 */
export async function lineInputs(lines: readonly string[]): Promise<Omit<NewTaskInput, 'project_id'>[]> {
  const ctx = await parseContext()
  const labels = (await db.labels.toArray()).filter((l) => !l.deleted_at).map((l) => ({ id: l.id, name: l.name }))
  return lines.map((line) => {
    const r = ctx ? parse(line, { ...ctx, dismissed: [] }) : null
    if (!r || !r.title.trim()) return { title: line }
    const out: Omit<NewTaskInput, 'project_id'> & { project_id?: string } = { title: r.title }
    if (r.due) out.due = r.due
    if (r.deadline) out.deadline = r.deadline
    if (r.start) out.start = r.start
    if (r.sector) out.sector = r.sector
    if (r.evening) out.evening = true
    else if (r.dayPart) out.day_part = r.dayPart
    if (r.recurrence) out.recurrence = r.recurrence
    if (r.priority) out.priority = r.priority
    if (r.energy) out.energy = r.energy
    if (r.estimateMinutes) out.estimate_minutes = r.estimateMinutes
    if (r.projectId) out.project_id = r.projectId
    const ids = r.labels.map((name) => findLabel(name, labels)?.id).filter((id): id is string => !!id)
    if (ids.length) out.labels = [...new Set(ids)]
    return out
  })
}

/** Where the tasks of a note go: subtasks of its task, or tasks in its project (a standalone note's Inbox without one). */
export type NoteTaskHome = { subtasksOf: string; projectId: string | null } | { projectId: string | null; workspaceId?: string | null }

/**
 * The tasks of the lines (D1, D2): one per line, subtasks with the line as the title,
 * tasks read with quick-add syntax; a checked line's task is completed.
 */
export async function planLineTasks(lines: readonly { title: string; checked: boolean }[], home: NoteTaskHome): Promise<{ id: string; change: Change }[]> {
  const inputs: NewTaskInput[] = 'subtasksOf' in home
    ? lines.map((l) => ({ title: l.title, parent_id: home.subtasksOf, project_id: home.projectId }))
    : (await lineInputs(lines.map((l) => l.title))).map((x) => ({ project_id: home.projectId, ...x }) as NewTaskInput)
  const out: { id: string; change: Change }[] = []
  for (const [i, input] of inputs.entries()) {
    const planned = await planTask({ ...input, completed: lines[i].checked })
    // A standalone note without a project: the Inbox of the note's workspace.
    if (!('subtasksOf' in home) && !input.project_id && home.workspaceId) planned.change.patch.workspace_id = home.workspaceId
    out.push(planned)
  }
  return out
}
