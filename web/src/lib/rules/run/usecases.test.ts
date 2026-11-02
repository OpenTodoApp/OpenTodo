// The use-case suite (web/src/lib/rules/usecases.json) through the device's
// planner: every case is seeded as internal/rules/usecases_test.go seeds it,
// planned with planRoutine, its changes laid over the rows, and compared with
// the same expectations the server's run must meet. The shared vectors of the
// device runs (routines-ai-step D7): a device and the server plan the same.
import { describe, expect, it } from 'vitest'
import suite from '../usecases.json'
import templates from '../../../generated/templates.json'
import { parseSteps } from '../steps'
import type { RoutineStep } from '../../types'
import { planRoutine, type AIAnswer, type LibraryTemplate, type Row, type RunPlan, type RunWorld } from '.'

interface UcTask { id: string; title?: string; due?: string; completed_on?: string; labels?: string[]; priority?: number; project_id?: string; parent_id?: string; description?: string; changed_on?: string; deleted?: boolean }
interface UcSeed { tasks?: UcTask[]; projects?: { id: string; name: string; description?: string; archived?: boolean; deleted?: boolean }[]; labels?: { id: string; name: string }[]; views?: { id: string; name: string; query: string }[]
  entries?: { id: string; task_id: string; started: string; ended?: string }[] }
interface UcExpect {
  outcome?: string; comments?: Record<string, string[]>; changed?: Record<string, Record<string, unknown>>; created?: Record<string, unknown>[]
  appended?: Record<string, string[]>; notices?: string[]; webhooks?: { text: string | null; tasks: string[] }[]; emails?: { subject: string; text: string }[]
  focus?: string; timer?: string; created_count?: number
  changed_projects?: Record<string, Record<string, unknown>>; created_projects?: string[]; sections?: string[]; labels_created?: string[]; favourites?: string
}
interface UcCase extends UcSeed {
  row: number; name: string; seed?: string; trigger: { kind: string } & Record<string, unknown>; condition?: Record<string, unknown>; run_on?: string
  steps: unknown; webhooks?: string[]; email?: boolean; ai?: { text?: string; lines?: string[] }[]; expect: UcExpect
}

const file = suite as unknown as { seeds: Record<string, UcSeed>; cases: UcCase[] }
const NOW = Date.UTC(2026, 9, 21, 12)
const TODAY = '2026-10-21'

const dayMs = (d: string, h = 10) => Date.parse(`${d}T00:00:00Z`) + h * 3_600_000

function seedWorld(c: UcCase): RunWorld {
  const seed: UcSeed = { ...c }
  if (c.seed) seed.tasks = [...(file.seeds[c.seed].tasks ?? []), ...(c.tasks ?? [])]
  const changed: Record<string, string> = {}
  const tasks: Row[] = (seed.tasks ?? []).map((x, i) => {
    changed[x.id] = x.changed_on ?? TODAY
    return {
      id: x.id, title: x.title || x.id, labels: x.labels ?? [], priority: x.priority || 4, created_at: 1, deleted_at: x.deleted ? 5 : null,
      completed_at: x.completed_on ? dayMs(x.completed_on) : null, position: i + 1, description: x.description ?? '', project_id: x.project_id || null,
      parent_id: x.parent_id || null, due: x.due ? { date: x.due } : null,
    }
  })
  const projects: Row[] = (seed.projects ?? []).map((p) => ({
    id: p.id, name: p.name, description: p.description ?? '', created_at: 1, deleted_at: p.deleted ? 5 : null, ...(p.archived ? { archived: true } : {}),
  }))
  return {
    userId: 'alice', today: TODAY, now: NOW, weekStart: 1, offset: 0, dayStart: '', tasks, projects,
    labels: (seed.labels ?? []).map((l) => ({ id: l.id, name: l.name, created_at: 1, deleted_at: null })), sections: [],
    views: (seed.views ?? []).map((v) => ({ id: v.id, name: v.name, query: v.query, created_at: 1, deleted_at: null })),
    timeEntries: (seed.entries ?? []).map((x) => ({ id: x.id, task_id: x.task_id, user_id: 'alice', started_at: Date.parse(x.started), ended_at: x.ended ? Date.parse(x.ended) : null, note: '', created_at: 1, deleted_at: null })),
    memberships: new Map(), changed, encrypted: false, templates: (templates as unknown as { templates: LibraryTemplate[] }).templates,
    env: { automations: true, energy: true, webhooks: c.webhooks ?? [], emailConfigured: !!c.email, emailVerified: !!c.email, ai: !!c.ai, aiConsent: !!c.ai },
  }
}

function taskState(t: Row): Record<string, unknown> {
  const labels = [...((t.labels as string[]) ?? [])].sort().join(',')
  const s = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    title: s(t.title), due: (t.due as { date?: string } | null)?.date ?? '', priority: Number(t.priority ?? 0), labels, project_id: s(t.project_id),
    parent_id: s(t.parent_id), description: s(t.description), completed: t.completed_at !== null && t.completed_at !== undefined, deleted: t.deleted_at !== null && t.deleted_at !== undefined,
  }
}

/** The plan laid over the rows, as a commit writes it (with the open subtasks of a completed task). */
function apply(w: RunWorld, plan: RunPlan) {
  const tasks = new Map(w.tasks.map((t) => [t.id as string, { ...t }]))
  const projects = new Map(w.projects.map((p) => [p.id as string, { ...p }]))
  const comments: Row[] = []
  const entries = new Map(w.timeEntries.map((e) => [e.id as string, { ...e }]))
  let review: Row = {}
  const sections: Row[] = []
  const labels: Row[] = []
  let prefs: Row = {}
  for (const m of plan.changes) {
    if (m.entity === 'section') sections.push({ id: m.id, ...m.patch })
    if (m.entity === 'label' && m.create) labels.push({ id: m.id, ...m.patch })
    if (m.entity === 'user_prefs') prefs = { ...prefs, ...m.patch }
    const into = m.entity === 'task' ? tasks : m.entity === 'project' ? projects : m.entity === 'time_entry' ? entries : null
    if (into) into.set(m.id, { ...(into.get(m.id) ?? { id: m.id }), ...m.patch })
    if (m.entity === 'comment') comments.push({ id: m.id, ...m.patch })
    if (m.entity === 'review') review = { ...review, ...m.patch }
  }
  for (const id of plan.completing) {
    const done = tasks.get(id)?.completed_at
    const open = (pid: string): string[] => [...tasks.values()].filter((t) => t.parent_id === pid && !t.completed_at && !t.deleted_at).flatMap((t) => [t.id as string, ...open(t.id as string)])
    for (const sub of open(id)) tasks.set(sub, { ...tasks.get(sub)!, completed_at: done })
  }
  return { tasks, projects, comments, entries, review, sections, labels, prefs }
}

describe('routine use cases on the device planner (shared with internal/rules)', () => {
  for (const c of file.cases) {
    it(`${String(c.row).padStart(2, '0')} ${c.name}`, async () => {
      const w = seedWorld(c)
      const answers = [...(c.ai ?? [])]
      const ai = async (): Promise<AIAnswer> => ({ ...(answers.shift() ?? { text: '' }), input: 100, output: 20 })
      const rule = { id: 'uc', name: c.name, steps: parseSteps(c.steps) as RoutineStep[], trigger: c.trigger, condition: (c.condition ?? null) as never }
      const plan = await planRoutine(w, rule, { key: 'manual:run-1', runId: 'run-1', triggerTaskId: c.run_on, ai })
      expect(plan.outcome, JSON.stringify(plan.records)).toBe(c.expect.outcome ?? 'applied')
      const after = apply(w, plan)
      const before = new Map(w.tasks.map((t) => [t.id as string, taskState(t)]))
      const changed: Record<string, Record<string, unknown>> = {}
      const created: Record<string, unknown>[] = []
      const appended: Record<string, string[]> = {}
      for (const [id, t] of after.tasks) {
        const now = taskState(t)
        const old = before.get(id)
        if (old) {
          for (const [k, v] of Object.entries(now)) if (JSON.stringify(old[k]) !== JSON.stringify(v)) (changed[id] ??= {})[k] = v
        } else {
          const x: Record<string, unknown> = { title: now.title }
          for (const k of ['project_id', 'parent_id', 'due']) if (now[k] !== '') x[k] = now[k]
          created.push(x)
        }
        const a = Object.entries(t).filter(([f, v]) => f.startsWith('appends.') && typeof v === 'string' && v).map(([, v]) => (v as string).trim()).sort()
        if (a.length) appended[id] = a
      }
      for (const p of w.projects) {
        const row = after.projects.get(p.id as string)!
        const d = (row.description as string) ?? ''
        if (d !== p.description) appended[p.id as string] = [d.slice((p.description as string).length).trim()]
      }
      created.sort((a, b) => (String(a.title) < String(b.title) ? -1 : String(a.title) > String(b.title) ? 1 : 0))
      const comments: Record<string, string[]> = {}
      for (const cm of after.comments) (comments[cm.task_id as string] ??= []).push(cm.body as string)
      const notices = plan.sides.filter((s) => s.kind === 'notify').map((s) => s.notice!.text)
      const webhooks = plan.sides.filter((s) => s.kind === 'webhook').map((s) => ({ text: s.delivery!.Text, tasks: [...s.delivery!.TaskIDs].sort() }))
      const emails = plan.sides.filter((s) => s.kind === 'email').map((s) => `${s.mail!.Subject}|${s.mail!.Text}`)
      const e = c.expect
      expect(changed).toEqual(e.changed ?? {})
      if (e.created_count) expect(created.length).toBe(e.created_count)
      else expect(created).toEqual(e.created ?? [])
      expect(comments).toEqual(e.comments ?? {})
      expect(appended).toEqual(e.appended ?? {})
      expect(notices).toEqual(e.notices ?? [])
      expect(webhooks).toEqual((e.webhooks ?? []).map((x) => ({ text: x.text ?? null, tasks: x.tasks })))
      expect(emails).toEqual((e.emails ?? []).map((m) => `${m.subject}|${m.text}`))
      if (e.focus) expect(after.review.focus).toBe(e.focus)
      const changedProjects: Record<string, Record<string, unknown>> = {}
      const createdProjects: string[] = []
      for (const [id, p] of after.projects) {
        const old = w.projects.find((x) => x.id === id)
        if (!old) { createdProjects.push(p.name as string); continue }
        if (old.name !== p.name) (changedProjects[id] ??= {}).name = p.name
        if ((old.archived ?? false) !== (p.archived ?? false)) (changedProjects[id] ??= {}).archived = p.archived
      }
      // The project keys are compared when a case states them.
      if (e.changed_projects) expect(changedProjects).toEqual(e.changed_projects)
      if (e.created_projects) expect(createdProjects.sort()).toEqual(e.created_projects)
      if (e.sections) expect(after.sections.map((x) => `${after.projects.get(x.project_id as string)?.name}/${x.name}`).sort()).toEqual(e.sections)
      if (e.labels_created) expect(after.labels.map((x) => x.name as string).sort()).toEqual(e.labels_created)
      if (e.favourites !== undefined) expect((after.prefs.favourites as string) ?? '').toBe(e.favourites)
      const running = [...after.entries.values()].find((x) => x.ended_at === null)
      expect((running?.task_id as string) ?? '').toBe(e.timer ?? '')
    })
  }
})
