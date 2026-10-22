// On-drop rules of boards of filters (OpenSpec change rule-boards, design D4): a
// pure planner from a column's rule to ordinary field changes, reusing the bulk
// planners so a drop behaves like the single-task actions (recurring roll-forward,
// subtree completion, un-parking on a date, the section cleared on a project
// change, labels read just before being written and written whole), and the
// one-line wording shown on the panel, in Arrange and in the toast.
import { mergeChanges, planComplete, planDue, planLabels, planMoveGroups, planPriority, planReopen } from '../bulk'
import type { Change } from '../ops'
import { RULE_DUE, RULE_START, RULE_STATE, type Label, type Membership, type OnDropRule, type Project, type RuleActions, type Section, type Task } from '../types'
import { addDays } from './match'
import { t } from '../i18n'

export interface RuleContext {
  now: number
  /** The logical today (day-boundary): what `due: today|tomorrow|next-week` resolve against. */
  today: string
  /** Live labels; ids of deleted labels in a rule are skipped. */
  labels: readonly Pick<Label, 'id' | 'deleted_at'>[]
  memberships: Map<string, Membership>
  me: string | null
}

const inDays = (v: unknown): v is { in_days: number } =>
  !!v && typeof v === 'object' && typeof (v as { in_days?: unknown }).in_days === 'number' && Number.isInteger((v as { in_days: number }).in_days) && (v as { in_days: number }).in_days >= 0 && (v as { in_days: number }).in_days <= 365

/**
 * An automation rule's actions with only what this build understands
 * (automation-rules D4): the on-drop keys plus `due: {in_days}`, `deadline`,
 * `assignee`, `comment`, `notify` and `webhook`. Null when nothing is left.
 */
export function knownActions(actions: unknown): RuleActions | null {
  const base = knownRule(actions) as RuleActions | null
  if (!actions || typeof actions !== 'object' || Array.isArray(actions)) return base
  const a = actions as Record<string, unknown>
  const out: RuleActions = { ...(base ?? {}) }
  if (inDays(a.due)) out.due = { in_days: a.due.in_days }
  if (a.deadline === 'clear' || inDays(a.deadline)) out.deadline = a.deadline === 'clear' ? 'clear' : { in_days: (a.deadline as { in_days: number }).in_days }
  if (a.assignee === 'me' || a.assignee === 'clear') out.assignee = a.assignee
  const c = a.comment as { text?: unknown } | null | undefined
  if (c && typeof c === 'object' && typeof c.text === 'string' && c.text) out.comment = { text: c.text }
  if (a.notify === true) out.notify = true
  const w = a.webhook as { webhook_id?: unknown } | null | undefined
  if (w && typeof w === 'object' && typeof w.webhook_id === 'string' && w.webhook_id) out.webhook = { webhook_id: w.webhook_id }
  return Object.keys(out).length ? out : null
}

const isPriority = (p: unknown): p is 1 | 2 | 3 | 4 => p === 1 || p === 2 || p === 3 || p === 4
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): v is T => typeof v === 'string' && (allowed as readonly string[]).includes(v)
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/**
 * The rule with only what this build understands: unknown keys and values of the
 * wrong shape are ignored (they stay in the row, D2). Null when nothing is left.
 */
export function knownRule(rule: unknown): OnDropRule | null {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return null
  const r = rule as Record<string, unknown>
  const out: OnDropRule = {}
  if (ids(r.add_labels).length) out.add_labels = ids(r.add_labels)
  if (ids(r.remove_labels).length) out.remove_labels = ids(r.remove_labels)
  if (isPriority(r.priority)) out.priority = r.priority
  if (oneOf(r.due, RULE_DUE)) out.due = r.due
  if (oneOf(r.start, RULE_START)) out.start = r.start
  if (oneOf(r.state, RULE_STATE)) out.state = r.state
  const sec = r.section as Record<string, unknown> | null | undefined
  if (sec && typeof sec === 'object' && typeof sec.project_id === 'string' && sec.project_id) {
    out.section = { project_id: sec.project_id, section_id: typeof sec.section_id === 'string' ? sec.section_id : null }
  }
  return Object.keys(out).length ? out : null
}

/** Whether a view has a rule a drop can apply (its panel is a drop target). */
export const hasRule = (view: { on_drop?: unknown }): boolean => knownRule(view.on_drop) !== null

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Patches without the fields a row already has: a change the task already has is not written. */
function withoutNoops(changes: Change[], rows: Map<string, Task>): Change[] {
  const out: Change[] = []
  for (const c of changes) {
    const row = c.entity === 'task' ? (rows.get(c.entityId) as unknown as Record<string, unknown> | undefined) : undefined
    if (!row) { out.push(c); continue }
    const patch = Object.fromEntries(Object.entries(c.patch).filter(([f, v]) => !same(row[f], v)))
    if (Object.keys(patch).length) out.push({ ...c, patch })
  }
  return out
}

/**
 * The changes a drop of `task` on a column with `rule` makes, merged per task.
 * Order (D4): labels removed then added, priority, due, start, state, then the
 * project and section (last, so a move across sharing scopes copies the task with
 * the rule's other changes already on it). Empty means the task already matched.
 */
export function planRule(task: Task, all: Task[], rule: OnDropRule | RuleActions | null | undefined, ctx: RuleContext): Change[] {
  const r = knownActions(rule)
  if (!r) return []
  const live = new Set(ctx.labels.filter((l) => !l.deleted_at).map((l) => l.id))
  let cur: Task = task
  const changes: Change[] = []
  const take = (planned: Change[]) => {
    for (const c of planned) {
      changes.push(c)
      if (c.entity === 'task' && c.entityId === task.id) cur = { ...cur, ...(c.patch as Partial<Task>) }
    }
  }
  for (const id of r.remove_labels ?? []) if (live.has(id)) take(planLabels([cur], id, false))
  for (const id of r.add_labels ?? []) if (live.has(id)) take(planLabels([cur], id, true))
  if (r.priority) take(planPriority([cur], r.priority))
  if (r.due === 'clear') { if (cur.due) take(planDue([cur], null, ctx.today)) }
  else if (r.due && typeof r.due === 'object') take(planDue([cur], addDays(ctx.today, r.due.in_days), ctx.today))
  else if (r.due) take(planDue([cur], r.due, ctx.today))
  if (r.start === 'someday') {
    if (cur.start !== 'someday' || cur.due || cur.evening) take([{ entity: 'task', entityId: task.id, patch: { start: 'someday', due: null, evening: false } }])
  } else if (r.start === 'clear' && cur.start) take([{ entity: 'task', entityId: task.id, patch: { start: null } }])
  // Automation-only keys (automation-rules "Actions"): deadline and assignee. The
  // comment, notification and webhook run on the server only.
  if (r.deadline) take([{ entity: 'task', entityId: task.id, patch: { deadline: r.deadline === 'clear' ? null : addDays(ctx.today, r.deadline.in_days) } }])
  if (r.assignee) take([{ entity: 'task', entityId: task.id, patch: { assignee_id: r.assignee === 'me' ? ctx.me : null } }])
  const tree = all.map((x) => (x.id === task.id ? cur : x))
  if (r.state === 'complete' && !cur.completed_at) take(planComplete([cur], tree, ctx.now, ctx.today))
  else if (r.state === 'reopen' && cur.completed_at) take(planReopen([cur]))
  if (r.section) {
    const target = { projectId: r.section.project_id, sectionId: r.section.section_id }
    const moved = all.map((x) => (x.id === task.id ? cur : x))
    for (const g of planMoveGroups([cur], moved, target, ctx.memberships, ctx.me, ctx.now)) take(g.changes)
  }
  return withoutNoops(mergeChanges(changes), new Map(all.map((x) => [x.id, x])))
}

export interface RuleNames {
  labels: readonly Pick<Label, 'id' | 'name' | 'deleted_at'>[]
  projects: readonly Pick<Project, 'id' | 'name' | 'deleted_at'>[]
  sections: readonly Pick<Section, 'id' | 'name' | 'deleted_at'>[]
}

/** The rule's parts as lower-case phrases ("adds errand", "priority 1", "due today"). */
export function ruleParts(rule: OnDropRule | null | undefined, names: RuleNames): string[] {
  const r = knownRule(rule)
  if (!r) return []
  const label = (id: string) => names.labels.find((l) => l.id === id && !l.deleted_at)?.name
  const list = (xs: string[] | undefined) => (xs ?? []).map(label).filter((n): n is string => !!n).join(', ')
  const parts: string[] = []
  const adds = list(r.add_labels), removes = list(r.remove_labels)
  if (adds) parts.push(t('adds {labels}', { labels: adds }))
  if (removes) parts.push(t('removes {labels}', { labels: removes }))
  if (r.priority) parts.push(t('priority {p}', { p: r.priority }))
  if (r.due === 'today') parts.push(t('due today'))
  else if (r.due === 'tomorrow') parts.push(t('due tomorrow'))
  else if (r.due === 'next-week') parts.push(t('due next week'))
  else if (r.due === 'clear') parts.push(t('no date'))
  if (r.start === 'someday') parts.push(t('moves to Someday'))
  else if (r.start === 'clear') parts.push(t('start cleared'))
  if (r.section) {
    const project = names.projects.find((p) => p.id === r.section!.project_id && !p.deleted_at)?.name ?? t('a removed project')
    const section = r.section.section_id ? names.sections.find((s) => s.id === r.section!.section_id && !s.deleted_at)?.name : undefined
    parts.push(section ? t('section {section} of {project}', { section, project }) : t('project {project}', { project }))
  }
  if (r.state === 'complete') parts.push(t('completes'))
  else if (r.state === 'reopen') parts.push(t('reopens'))
  return parts
}

/** The rule in one line, sentence case ("Adds errand, due today"); empty without a rule. */
export function describeRule(rule: OnDropRule | null | undefined, names: RuleNames): string {
  const text = ruleParts(rule, names).join(', ')
  return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : ''
}
