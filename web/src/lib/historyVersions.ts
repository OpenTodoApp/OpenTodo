// Readable versions for the task panel's History tab (OpenSpec task-detail-redesign,
// design D7; trash-and-history "Readable versions"). Pure: change sets of one
// author and device, each within the window of the previous one, merge into one
// version; a field changed twice collapses to its first `from` and last `to`.
import { fieldLabel } from './history'
import type { ChangeSet } from './types'
import { t, formatList } from './i18n'

export const VERSION_WINDOW_MS = 5 * 60_000

export interface VersionChange {
  field: string
  from: unknown
  to: unknown
  /** Every op behind this change (a collapsed field keeps all of them). */
  opIds: string[]
  /** The write lost under last-writer-wins: shown "not applied", still restorable. */
  lost: boolean
}

export interface Version {
  /** The newest op id of the version (stable key). */
  id: string
  userId: string
  device: string
  device_label?: string
  /** Newest and oldest change-set time. */
  ts: number
  firstTs: number
  changes: VersionChange[]
}

/**
 * Change sets in any order → versions, newest first. Sets merge when they share
 * user and device and each is at most `windowMs` after the previous one. Lost
 * changes are never collapsed with applied ones, so their marker survives.
 */
export function toVersions(sets: readonly ChangeSet[], opts: { windowMs?: number } = {}): Version[] {
  const windowMs = opts.windowMs ?? VERSION_WINDOW_MS
  const ordered = [...sets].sort((a, b) => a.ts - b.ts)
  const out: Version[] = []
  for (const set of ordered) {
    const last = out[out.length - 1]
    const joins = last && last.userId === set.userId && last.device === set.device && set.ts - last.ts <= windowMs
    const v: Version = joins ? last : { id: '', userId: set.userId, device: set.device, device_label: set.device_label, ts: set.ts, firstTs: set.ts, changes: [] }
    if (!joins) out.push(v)
    v.ts = set.ts
    v.device_label ??= set.device_label
    for (const c of set.changes) {
      // Bookkeeping that rides with completed_at (completed-date-filters D5): not a change of its own.
      if (c.field === 'completed_by') continue
      const lost = !!c.lost
      const same = lost ? undefined : v.changes.find((x) => x.field === c.field && !x.lost)
      if (same) {
        same.to = c.to
        same.opIds.push(c.opId)
      } else {
        v.changes.push({ field: c.field, from: c.from, to: c.to, opIds: [c.opId], lost })
      }
      v.id = c.opId
    }
  }
  return out.reverse()
}

const VERB_ORDER = ['title', 'due', 'project_id', 'priority', 'assignee_id', 'completed_at', 'deleted_at']

function verbOf(c: VersionChange): string {
  switch (c.field) {
    case 'title': return t('renamed', { context: 'version' })
    case 'due': return t('rescheduled', { context: 'version' })
    case 'project_id': return t('moved', { context: 'version' })
    case 'priority': return t('reprioritised', { context: 'version' })
    case 'assignee_id': return c.to == null ? t('unassigned', { context: 'version' }) : t('reassigned', { context: 'version' })
    case 'completed_at': return c.to == null ? t('reopened', { context: 'version' }) : t('completed', { context: 'version' })
    case 'deleted_at': return c.to == null ? t('restored', { context: 'version' }) : t('deleted', { context: 'version' })
    case 'description': case 'notes_doc': return t('edited the notes')
    default: return t('edited the {field}', { field: fieldLabel(c.field) })
  }
}

/** "Renamed and rescheduled", "Renamed, rescheduled, and moved", "Completed"; the creating version reads "Created". */
export function summarizeVersion(v: Pick<Version, 'changes'>): string {
  // The version that created the entity sets every field at once; it reads "Created".
  if (v.changes.some((c) => c.field === 'created_at')) return t('Created')
  const rank = (f: string) => { const i = VERB_ORDER.indexOf(f); return i < 0 ? VERB_ORDER.length : i }
  const verbs: string[] = []
  for (const c of [...v.changes].sort((a, b) => rank(a.field) - rank(b.field))) {
    const verb = verbOf(c)
    if (!verbs.includes(verb)) verbs.push(verb)
  }
  if (!verbs.length) return t('No changes')
  const text = formatList(verbs, true)
  return text[0].toUpperCase() + text.slice(1)
}
