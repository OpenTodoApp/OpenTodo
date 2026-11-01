// A routine's proposal as the review shows it (OpenSpec change
// routines-ai-step, design D3): each item's target and change in words, from
// this device's names. The server holds the proposal while it waits; applying
// it re-checks every item there. Pure: no reads, no writes.
import { t } from '../i18n'
import type { RoutineProposalItem } from '../types'

/** The names an item is described with (from this device's data). */
export interface ProposalNames {
  title: (taskId: string) => string
  projectName: (projectId: string) => string
  labelName: (labelId: string) => string
  sectionName: (sectionId: string) => string
}

/** One described item: what it does, and its field changes from old to new. */
export interface DescribedItem {
  key: string
  text: string
  changes: { field: string; from: string; to: string }[]
  ai: boolean
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function fieldValue(field: string, v: unknown, n: ProposalNames): string {
  if (v === null || v === undefined || v === '') return t('none')
  switch (field) {
    case 'priority': return t('P{n}', { n: Number(v) })
    case 'due':
    case 'deadline': {
      const d = v as { date?: string; time?: string }
      return [d?.date, d?.time].filter(Boolean).join(' ') || t('none')
    }
    case 'labels': return Array.isArray(v) ? (v as string[]).map((id) => n.labelName(id) || id).join(', ') || t('none') : t('none')
    case 'section_id': return n.sectionName(str(v)) || t('a removed section')
    case 'project_id': return n.projectName(str(v)) || t('Inbox')
    case 'completed_at': return t('completed')
    case 'deleted_at': return t('in the Trash')
  }
  return typeof v === 'string' ? v : JSON.stringify(v)
}

const FIELD: Record<string, () => string> = {
  title: () => t('Title'), description: () => t('Description'), priority: () => t('Priority'), due: () => t('Due date'), deadline: () => t('Deadline'),
  start: () => t('Start'), energy: () => t('Energy'), labels: () => t('Labels'), section_id: () => t('Section'), project_id: () => t('Project'),
  completed_at: () => t('Completed'), deleted_at: () => t('Trash'), assignee_id: () => t('Assignee'),
}

/** Fields that only follow another change (positions, timestamps) are not listed. */
const QUIET = new Set(['position', 'created_at', 'updated_at', 'author_id', 'mentions', 'parent_id', 'edited_at', 'series_id'])

/** Describes one item ("Change “Pay rent”: Priority P4 → P1"). */
export function describeItem(it: RoutineProposalItem, n: ProposalNames): DescribedItem {
  const f = it.fields ?? {}
  const base = { key: it.key, ai: it.ai, changes: [] as DescribedItem['changes'] }
  if (it.side) {
    const s = it.side
    if (it.kind === 'notify') return { ...base, text: s.notice ? t('Notify me: {text}', { text: s.notice.text }) : t('Notify me about the task {task}', { task: n.title(str(s.fired?.taskId)) || t('a task') }) }
    if (it.kind === 'email') return { ...base, text: t('Email me: {subject}', { subject: s.mail?.Subject ?? '' }) }
    return { ...base, text: t('Send the webhook') }
  }
  if (it.entity === 'task' && it.kind === 'create') {
    const project = n.projectName(str(f.project_id))
    return { ...base, text: project ? t('Create the task “{title}” in {project}', { title: str(f.title), project }) : t('Create the task “{title}”', { title: str(f.title) }) }
  }
  if (it.entity === 'comment') return { ...base, text: t('Comment on “{task}”: {text}', { task: n.title(str(f.task_id)) || t('a task'), text: str(f.body) }) }
  if (it.entity === 'label') return { ...base, text: t('Create the label {name}', { name: str(f.name) }) }
  if (it.entity === 'project') {
    return { ...base, text: it.kind === 'create' ? t('Create the project {name}', { name: str(f.name) }) : t('Change the project {name}', { name: n.projectName(str(it.id)) || str(f.name) }) }
  }
  if (it.entity === 'section') return { ...base, text: t('Create the section {name}', { name: str(f.name) }) }
  const target = it.entity === 'task' ? n.title(str(it.id)) || t('Deleted task') : it.entity ?? ''
  const changes = Object.keys(f).filter((k) => !QUIET.has(k)).sort().map((k) => ({
    field: FIELD[k]?.() ?? k,
    from: fieldValue(k, it.before?.[k], n),
    to: fieldValue(k, f[k], n),
  }))
  return { ...base, changes, text: t('Change “{task}”', { task: target }) }
}

/** The answer of an apply ("7 applied, 1 skipped because it changed"). */
export function appliedText(r: { applied: number; skipped: number; changed: number }): string {
  if (!r.skipped) return t('{n, plural, one {# change applied} other {# changes applied}}', { n: r.applied })
  return r.changed === r.skipped
    ? t('{n} applied, {m, plural, one {# skipped because it changed} other {# skipped because they changed}}', { n: r.applied, m: r.skipped })
    : t('{n} applied, {m} skipped', { n: r.applied, m: r.skipped })
}
