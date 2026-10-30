// Revision history (OpenSpec change `trash-and-history`, design D3/D4). History is
// read live from the server's operation log and kept in component state only:
// offline the panel says it needs a connection instead of showing stale data.
// Restoring an earlier value is an ordinary edit with the current clock, so it
// applies locally at once, appears in the history itself and converges by LWW.
import { api } from './api'
import { decryptChanges } from './e2ee'
import { updateProject, updateTask } from './ops'
import type { ChangeSet, HistoryPage, Membership, Origin, Project, Task } from './types'
import { originLabel } from './taskOrigin'
import { formatDate, formatInstant } from './dates'
import { fieldValueLabel } from './fieldNames'
import { t, msg, translatedMap } from './i18n'

/** One page of history; ciphertext values (OpenSpec e2ee) are decrypted for display. */
export async function fetchHistory(entity: 'task' | 'project', id: string, before?: number): Promise<HistoryPage> {
  const page = await api.history(entity, id, before)
  const decrypted = await Promise.all(page.changeSets.map(async (s) => ({ ...s, changes: await decryptChanges(entity, id, s.changes) })))
  // A write that kept the value (for example the plain-text copy of a note rewritten
  // when the note is upgraded) changes nothing a person can see or restore.
  const changeSets = decrypted
    .map((s) => ({ ...s, changes: s.changes.filter((c) => c.lost || JSON.stringify(c.from) !== JSON.stringify(c.to)) }))
    .filter((s) => s.changes.length > 0)
  return { ...page, changeSets }
}

/**
 * How a change set's device appears: "this device" for ours, "API" for REST
 * writes, the server's label for AI assistant writes ("AI assistant (Desk
 * assistant)" for your own token, mcp-write-tools), otherwise "another device"
 * with a short id; the author's name is added when someone else made the change
 * (shared projects).
 */
export function deviceLabel(set: Pick<ChangeSet, 'device' | 'userId' | 'device_label'>, myDevice: string, myUserId?: string, memberships: Membership[] = []): string {
  const base = set.device === myDevice ? t('this device')
    : set.device_label ? set.device_label
    : set.device === 'server' || set.device.startsWith('server:') ? 'API'
    : set.device.startsWith('agent:') ? t('AI assistant')
    : set.device.startsWith('caldav:') ? t('a calendar app (CalDAV)')
    : set.device.startsWith('issues:') ? t('issue import')
    : set.device.startsWith('calsync:') ? t('calendar sync')
    : set.device.startsWith('public:') ? t('a public link')
    : set.device.startsWith('vault:') ? t('a Markdown vault')
    : t('another device ({id})', { id: set.device.slice(0, 4) })
  // A guest's tick is written as the link's creator; the label names the link, not them (public-links D6).
  if (set.device.startsWith('public:')) return base
  if (!myUserId || set.userId === myUserId) return base
  for (const m of memberships) {
    const who = m.members.find((x) => x.userId === set.userId)
    if (who) return `${who.name || who.email} · ${base}`
  }
  return base
}

/** Fields whose old value can be put back from the timeline. */
export const RESTORABLE: Record<'task' | 'project', readonly string[]> = {
  task: ['title', 'description', 'priority', 'due', 'labels', 'estimate_minutes', 'deadline', 'start', 'evening', 'recurrence', 'completed_at', 'deleted_at', 'project_id', 'parent_id'],
  // A project's note (project-notes): its Markdown projection; the device folds it into notes_doc.
  project: ['name', 'color', 'archived', 'parent_id', 'deleted_at', 'description'],
}

export function canRestoreField(entity: 'task' | 'project', field: string): boolean {
  // A custom field value (custom-fields) is put back like any field: one `fields.<id>` op.
  return RESTORABLE[entity].includes(field) || (entity === 'task' && fieldValueLabel(field) !== null)
}

/**
 * Put back an earlier value of one field as a new op (design D4). For tasks this
 * goes through updateTask, so a project change keeps subtrees together and moves
 * across sharing scopes as copy + tombstone. Returns the task id afterwards.
 */
export async function restoreValue(entity: 'task' | 'project', id: string, field: string, value: unknown): Promise<string> {
  if (!canRestoreField(entity, field)) throw new Error(t('{field} cannot be restored', { field }))
  if (entity === 'task') return updateTask(id, { [field]: value } as Partial<Omit<Task, 'id' | '_clock'>>, { restore: true })
  await updateProject(id, { [field]: value } as Partial<Omit<Project, 'id' | '_clock'>>)
  return id
}

/** Reference fields whose ids the timeline shows by name, and their labels. */
const REF_LABELS = translatedMap<string>({ assignee_id: msg('assignee'), project_id: msg('project'), section_id: msg('section'), parent_id: msg('parent') })
/** Labels of fields whose name alone reads badly. */
const FIELD_LABELS = translatedMap<string>({ blocked_by: msg('waiting for'), description: msg('notes'), notes_doc: msg('notes'), origin: msg('origin') })

/** The label of a field in the timeline (`assignee_id` reads as "assignee"). */
export function fieldLabel(field: string): string {
  return REF_LABELS[field] ?? FIELD_LABELS[field] ?? fieldValueLabel(field) ?? field.replace(/_/g, ' ')
}

/**
 * A short human rendering of a field value for the timeline. `names` resolves ids
 * of reference fields (people, projects, sections, tasks) to names from local data;
 * an id it does not know is shown as "unknown".
 */
export function formatValue(field: string, value: unknown, names?: (field: string, id: string) => string | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  if (field in REF_LABELS && typeof value === 'string' && names) return names(field, value) ?? t('unknown')
  if (field.endsWith('_at') && typeof value === 'number') return formatInstant(value, 'datetime')
  if (field === 'due' && typeof value === 'object') {
    const d = value as { date?: string; time?: string }
    return [d.date, d.time].filter(Boolean).join(' ')
  }
  if (field === 'deadline' && typeof value === 'string') return formatDate(value, 'compact')
  if (field === 'start' && typeof value === 'string') return value === 'someday' ? t('Someday') : formatDate(value, 'compact')
  if (field === 'evening' && typeof value === 'boolean') return value ? t('on') : t('off')
  if (field === 'priority') return `P${String(value)}`
  // A task's origin (task-origin D12): its id or host, "Email" for a mail.
  if (field === 'origin' && typeof value === 'object') return originLabel(value as Origin) || t('Email')
  if (field === 'estimate_minutes' && typeof value === 'number') return t('{value} min', { value })
  if (field === 'blocked_by' && Array.isArray(value) && names) return value.length ? value.map((id) => names('parent_id', String(id)) ?? t('unknown')).join(', ') : '—'
  if (Array.isArray(value)) return value.length ? t('{n, plural, one {# item} other {# items}}', { n: value.length }) : '—'
  if (typeof value === 'boolean') return value ? t('yes') : t('no')
  const s = typeof value === 'string' ? value : JSON.stringify(value)
  return s.length > 80 ? `${s.slice(0, 79)}…` : s
}

/** The task ids that parent changes in these change sets name (for useReferenceNames). */
export function parentRefs(sets: readonly Pick<ChangeSet, 'changes'>[]): string[] {
  return [...new Set(sets.flatMap((cs) => cs.changes.filter((c) => c.field === 'parent_id').flatMap((c) => [c.from, c.to]).filter((v): v is string => typeof v === 'string')))]
}
