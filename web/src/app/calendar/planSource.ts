// The planning list's source (time-blocking "Planning list and phone agenda", OpenSpec
// change plan-list-sources): the Inbox, tasks without a date, earlier tasks, a project,
// a label or a saved view. The choice is a per-device key ("label:<id>", "view:<id>"),
// remembered like the project choice was; a source that is gone reads as the Inbox.
import { localDueOf } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { inboxTasks } from '../../lib/inbox'
import { compareDueThenPriority } from '../../lib/ordering'
import type { Label, Project, Task, View } from '../../lib/types'
import { isDashboard, runView, type ViewContext } from '../../lib/views'

export const TRAY_KEY = 'opentodo.calendar.tray'
/** The list shows at most this many tasks. */
export const PLAN_LIST_LIMIT = 200

export function readTray(): string {
  try {
    return localStorage.getItem(TRAY_KEY) ?? 'inbox'
  } catch {
    return 'inbox'
  }
}

export function saveTray(source: string): void {
  try { localStorage.setItem(TRAY_KEY, source) } catch { /* per-device convenience only */ }
}

export type PlanSourceKind = 'list' | 'project' | 'label' | 'view'

export interface PlanSource {
  key: string
  kind: PlanSourceKind
  label: string
  /** A project's or label's stored colour. */
  color?: string | null
}

export interface PlanSourceData {
  projects: readonly Project[]
  labels: readonly Label[]
  views: readonly View[]
}

/** Every source the picker offers: the three lists, live projects, labels, list views. */
export function planSources({ projects, labels, views }: PlanSourceData): PlanSource[] {
  return [
    { key: 'inbox', kind: 'list', label: t('Inbox') },
    { key: 'nodate', kind: 'list', label: t('No date') },
    { key: 'overdue', kind: 'list', label: t('Earlier') },
    ...projects.filter((p) => !p.archived && !p.deleted_at).map((p): PlanSource => ({ key: `project:${p.id}`, kind: 'project', label: p.name, color: p.color })),
    ...labels.filter((l) => !l.deleted_at).map((l): PlanSource => ({ key: `label:${l.id}`, kind: 'label', label: l.name, color: l.color })),
    ...views.filter((v) => !v.deleted_at && !isDashboard(v)).map((v): PlanSource => ({ key: `view:${v.id}`, kind: 'view', label: v.name })),
  ]
}

/** The chosen source, or the Inbox when it is gone (a deleted label, an archived project). */
export function resolveSource(key: string, sources: readonly PlanSource[]): PlanSource {
  return sources.find((s) => s.key === key) ?? sources[0]
}

/**
 * The open tasks of a source, sorted by due date then priority (a view keeps its own
 * order), at most `PLAN_LIST_LIMIT`. Completed, deleted and archived-project tasks never
 * appear, whatever a view's options say.
 */
export function planSourceTasks(source: PlanSource, d: PlanSourceData & { tasks: readonly Task[]; today: string; ctx?: ViewContext }): Task[] {
  const archived = new Set(d.projects.filter((p) => p.archived).map((p) => p.id))
  const usable = (task: Task) => !task.completed_at && !task.deleted_at && !(task.project_id && archived.has(task.project_id))
  if (source.kind === 'view') {
    const view = d.views.find((v) => `view:${v.id}` === source.key)
    const r = view && d.ctx ? runView(view, d.ctx) : null
    return r?.ok ? r.tasks.filter(usable).slice(0, PLAN_LIST_LIMIT) : []
  }
  const open = d.tasks.filter(usable)
  let out: Task[]
  if (source.key === 'nodate') out = open.filter((task) => !task.due)
  else if (source.key === 'overdue') out = open.filter((task) => task.due && localDueOf(task.due).date < d.today)
  else if (source.kind === 'project') out = open.filter((task) => task.project_id === source.key.slice(8))
  else if (source.kind === 'label') out = open.filter((task) => task.labels.includes(source.key.slice(6)))
  else out = inboxTasks(open, [...d.tasks])
  return out.sort(compareDueThenPriority).slice(0, PLAN_LIST_LIMIT)
}
