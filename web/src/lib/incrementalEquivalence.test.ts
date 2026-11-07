// Incremental values equal a full recomputation (OpenSpec change incremental-list-updates,
// design D6). A seeded random account takes random writes, a step at a time, each step
// linked the way the task snapshot links its lists; after every step each value worked
// out from the changed rows is compared with its full form on the same rows. The keys a
// patched map notes are checked too: outside them it answers as the previous map.
import { describe, expect, it } from 'vitest'
import { badgeCounts, patchBadgeCounts } from './appBadge'
import { completedOn } from './dayLists'
import { todaySlots } from './closedListPrefs'
import { blockedMap, liveBlocked } from './dependencies'
import { availability } from './flow'
import { habitStatsMap, patchHabitStats } from './habits'
import { completedBySection, listGroups, patchCompletedBySection, patchTreeParts, patchViewTasks, splitLater, sectionBuckets, tasksForView, treeParts, type GroupInput, type ListScope, type TreeParts } from './listGroups'
import { flattenTree } from './tree'
import { openCountsByProject, openTasksOf, taskIndexOf } from './liveTasks'
import { currentDateTime, currentDayStart, logicalDay } from './dates'
import { labelCounts, patchLabelCounts, patchSidebarCounts, sidebarCounts } from './sidebarCounts'
import { buildTaskTree, liveProgress, progressMap } from './subtasks'
import { Derived, keysBetween, patchOrdered, type TaskChange } from './taskDelta'
import { deriveSets, patchSets } from './taskSnapshot'
import { flowView, nextFlowView } from './useFlow'
import type { Project, Section, Task } from './types'
import type { WorkspaceState } from './workspaces'

const TODAY = '2026-11-06'
const DAYS = ['2026-11-01', '2026-11-05', TODAY, '2026-11-07', '2026-11-09', '2026-11-20']

/** A small seeded generator (mulberry32), so a failure can be replayed. */
function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number) => Math.floor(next() * n)
  const pick = <T,>(xs: readonly T[]): T => xs[int(xs.length)]
  const chance = (p: number) => next() < p
  return { int, pick, chance }
}

type R = ReturnType<typeof rng>

const projects: Project[] = [
  { id: 'p-a', name: 'A', position: 1, archived: false, deleted_at: null, flow_mode: 'parallel' },
  { id: 'p-b', name: 'B', position: 2, archived: false, deleted_at: null, flow_mode: 'sequential' },
  { id: 'p-c', name: 'C', position: 3, archived: false, deleted_at: null, flow_mode: 'parallel' },
  { id: 'p-d', name: 'D', position: 4, archived: true, deleted_at: null },
  { id: 'p-e', name: 'E', position: 5, archived: false, deleted_at: null, flow_mode: 'area' },
] as Project[]
const sections: Section[] = [
  { id: 's-a1', project_id: 'p-a', name: 'A1', position: 1, deleted_at: null, flow_mode: 'sequential' },
  { id: 's-a2', project_id: 'p-a', name: 'A2', position: 2, deleted_at: null },
  { id: 's-b1', project_id: 'p-b', name: 'B1', position: 1, deleted_at: null },
  { id: 's-c1', project_id: 'p-c', name: 'C1', position: 1, deleted_at: null },
] as Section[]
const sectionMap = new Map(sections.map((s) => [s.id, s]))
const PROJECT_IDS = [null, null, 'p-a', 'p-a', 'p-b', 'p-c', 'p-d', 'p-e']
const LABELS = ['l1', 'l2', 'l3']
const USERS = [null, 'me', 'other']
const state: WorkspaceState = { current: '', defaultId: '', list: [] } as unknown as WorkspaceState

let serial = 0
function newTask(r: R, ids: readonly string[]): Task {
  serial++
  const id = `t${String(r.int(1e6)).padStart(6, '0')}-${serial}`
  const project_id = r.pick(PROJECT_IDS)
  const own = sections.filter((s) => s.project_id === project_id)
  return {
    id, title: `Task ${serial}`, description: '', project_id, section_id: own.length && r.chance(0.6) ? r.pick(own).id : null,
    parent_id: ids.length && r.chance(0.2) ? r.pick(ids) : null, priority: r.pick([1, 2, 3, 4]), position: r.int(50),
    due: r.chance(0.4) ? { date: r.pick(DAYS) } : null, deadline: r.chance(0.1) ? r.pick(DAYS) : null,
    start: r.chance(0.15) ? r.pick(['someday', '2026-11-20', '2026-11-01']) : null, labels: LABELS.filter(() => r.chance(0.3)),
    completed_at: r.chance(0.25) ? Date.parse(`${r.pick(DAYS)}T10:00:00Z`) + r.int(3) * 1000 : null, deleted_at: null,
    created_at: serial, updated_at: serial, estimate_minutes: null, recurrence: null, series_id: null,
    assignee_id: r.pick(USERS), blocked_by: ids.length && r.chance(0.1) ? [r.pick(ids)] : [],
  } as unknown as Task
}

/** A habit and its occurrence records, so habit streaks are part of the account. */
function habit(id: string, records: number): Task[] {
  const series = { id, title: 'Stretch', description: '', project_id: null, section_id: null, parent_id: null, priority: 4, position: 1, due: { date: TODAY },
    deadline: null, start: null, labels: [], completed_at: null, deleted_at: null, created_at: 1, updated_at: 1, estimate_minutes: null,
    recurrence: 'every day', series_id: null, habit: true, assignee_id: null, blocked_by: [] } as unknown as Task
  const recs = Array.from({ length: records }, (_, i) => ({ ...series, id: `${id}-r${i}`, recurrence: null, habit: undefined, series_id: id,
    due: { date: `2026-11-0${i + 1}` }, completed_at: Date.parse(`2026-11-0${i + 1}T09:00:00Z`) }) as unknown as Task)
  return [series, ...recs]
}

const byId = (a: Task, b: Task) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** One random write: the changed rows (a new object for each). */
function write(r: R, rows: readonly Task[]): Task[] {
  const ids = rows.map((t) => t.id)
  const kind = r.int(14)
  if (kind === 0 || !rows.length) return [newTask(r, ids)]
  const t = r.pick(rows)
  const edit = (over: Partial<Task>): Task[] => [{ ...t, ...over }]
  switch (kind) {
    case 1: case 2: return edit({ completed_at: t.completed_at ? null : Date.parse(`${TODAY}T12:00:00Z`) + r.int(1000) })
    case 3: return edit({ title: `${t.title}!` })
    case 4: { const p = r.pick(PROJECT_IDS); return edit({ project_id: p, section_id: null }) }
    case 5: { const own = sections.filter((s) => s.project_id === t.project_id); return edit({ section_id: own.length ? r.pick(own).id : null }) }
    case 6: return edit({ parent_id: r.chance(0.5) ? null : r.pick(ids) })
    case 7: return edit({ due: r.chance(0.3) ? null : { date: r.pick(DAYS) } })
    case 8: return edit({ start: r.pick([null, 'someday', '2026-11-20']) })
    case 9: return edit({ deleted_at: 1 })
    case 10: return edit({ blocked_by: r.chance(0.4) ? [] : [r.pick(ids)] })
    case 11: return edit({ labels: LABELS.filter(() => r.chance(0.4)) })
    case 12: return edit({ assignee_id: r.pick(USERS), priority: r.pick([1, 2, 3, 4]) })
    default: return edit({ position: r.int(50) })
  }
}

/** The stored rows after `changed`, sorted by id, and the changes as the snapshot records them. */
function apply(rows: readonly Task[], changed: readonly Task[]): { rows: Task[]; changes: TaskChange[] } {
  // As the snapshot records them: each changed id once, its stored row before and after.
  const map = new Map(rows.map((t) => [t.id, t]))
  const changes = new Map<string, TaskChange>()
  for (const c of changed) {
    changes.set(c.id, { id: c.id, before: changes.get(c.id)?.before ?? map.get(c.id), after: c })
    map.set(c.id, c)
  }
  return { rows: [...map.values()].sort(byId), changes: [...changes.values()] }
}

const entries = <V,>(m: ReadonlyMap<string, V>) => [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
const SCOPES: ListScope[] = [
  { view: 'inbox' }, { view: 'today' }, { view: 'upcoming' }, { view: 'someday' }, { view: 'anytime' }, { view: 'completed' }, { view: 'assigned' },
  { view: 'project', id: 'p-a' }, { view: 'project', id: 'p-b' }, { view: 'project', id: 'p-d' }, { view: 'label', id: 'l1' },
]

/** The project or Inbox list's groups from its tasks, the pure part of useListModel. */
function projectGroups(view: 'project' | 'inbox', projectId: string | null, tasks: Task[], all: readonly Task[], blocked: { has(id: string): boolean }): ReturnType<typeof listGroups> {
  const split = splitLater(tasks, TODAY)
  const tree = buildTaskTree(split.later.length ? split.active : tasks)
  const buckets = sectionBuckets(projectId, tree, sections)
  const input: GroupInput = {
    view, tasks, laterTasks: split.later, tree, today: TODAY, resolved: currentDateTime(), collapsed: new Set(), blocked,
    taskMap: new Map(all.map((t) => [t.id, t])), projects, projectMap: new Map(projects.map((p) => [p.id, p])), board: false, columns: [],
    buckets, sectionCount: buckets ? sections.filter((s) => s.project_id === projectId).length : 0, collapsedSections: [], logbook: null,
  }
  return listGroups(input)
}
const groupIds = (gs: ReturnType<typeof listGroups>) => gs.map((g) => [g.key, g.count ?? null, g.rows.map((row) => [row.task.id, row.task.title, row.depth, row.parent, row.hasChildren, row.breadcrumb])])

function run(seed: number, steps: number) {
  const r = rng(seed)
  // The stored rows (deleted ones included, as the snapshot holds them) and the snapshot's visible sets.
  let stored: Task[] = [...habit('h1', 3)]
  for (let i = 0; i < 120; i++) stored.push(newTask(r, stored.map((t) => t.id)))
  stored = apply([], stored).rows
  let sets = deriveSets(stored, projects, state)
  const views = SCOPES.map((scope) => new Derived<Task[], []>(
    (tasks) => tasksForView(scope, tasks, projects, TODAY, 'me'),
    (prev, changes, tasks) => {
      const out = patchViewTasks(prev, changes, scope, projects, TODAY, { parentOf: (id) => taskIndexOf(tasks).get(id), hasChildren: (id) => liveProgress(tasks).has(id) }, 'me')
      if (out) used.views++
      return out
    },
  ))
  const used = { views: 0, counts: 0, flowKeys: 0, tree: 0 }
  const habits = new Derived<Map<string, ReturnType<typeof habitStatsMap> extends Map<string, infer V> ? V : never>, [string]>(habitStatsMap, patchHabitStats)
  const done = new Derived<Map<string, Task[]>, [string | null, Map<string, Section>]>(completedBySection, patchCompletedBySection)
  const look = (live: readonly Task[]) => ({ parentOf: (id: string) => taskIndexOf(live).get(id), hasChildren: (id: string) => liveProgress(live).has(id) })
  let live = sets.here
  const counts = new Derived<ReturnType<typeof sidebarCounts>, [string, null, string]>(
    (open, today, hide, user) => sidebarCounts(open, today, hide, user, look(live)),
    (prev, changes, open, today, hide, user) => { const out = patchSidebarCounts(prev, changes, open, today, hide, user, look(live)); if (out) used.counts++; return out },
  )
  const labels = new Derived<Map<string, number>, [ReadonlySet<string>]>(labelCounts, patchLabelCounts)
  const archived = new Set(['p-d'])
  const badge = new Derived<Record<string, number>, [string, number]>((open, today, days) => badgeCounts(open, today, days), (prev, ch, open, today, days) => patchBadgeCounts(prev, ch, open, today, days))
  const doneToday = new Derived<Task[], [string]>((tasks, today) => completedOn(tasks, today),
    (prev, ch, _t, today) => patchOrdered(prev, ch, (x) => x.completed_at !== null && !x.deleted_at && !x.skipped && logicalDay(x.completed_at, currentDayStart()) === today,
      (a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0) || byId(a, b)))
  let flow: Parameters<typeof nextFlowView>[0] = null
  const parts = (['p-a', null] as const).map(() => new Derived<TreeParts, [boolean, boolean, string, string | null, Section[]]>(treeParts,
    (prev, changes, tasks) => { const out = patchTreeParts(prev, changes, (id) => tasks.some((t) => t.parent_id === id)); if (out) used.tree++; return out }))
  const shape = (p: TreeParts) => ({
    split: p.split && [p.split.active.map((t) => t.id), p.split.later.map((t) => t.id)],
    tree: p.tree && flattenTree(p.tree.roots).map((n) => [n.id, n.item.title, n.parent, n.depth, n.children.map((c) => c.id), p.tree!.nodes.get(n.id) === n]),
    nodes: p.tree && [...p.tree.nodes.keys()].sort(),
    buckets: p.buckets && p.buckets.map((g) => [g.key, g.tasks.map((t) => t.id), g.roots.map((n) => [n.id, n.item === g.tasks.find((t) => t.id === n.id)])]),
  })

  for (let step = 0; step < steps; step++) {
    const changed: Task[] = []
    for (let k = r.chance(0.2) ? 1 + r.int(4) : 1; k > 0; k--) changed.push(...write(r, apply(stored, changed).rows))
    const next = apply(stored, changed)
    stored = next.rows
    // Now and then a change the snapshot cannot name row by row: derived in full, no link.
    const linked = !r.chance(0.05)
    const before = sets
    const patched = linked ? patchSets(sets, next.changes, projects, state) : null
    const full = deriveSets(stored, projects, state)
    sets = patched ?? full
    const at = `seed ${seed} step ${step}`
    expect(sets.every.map((t) => t.id), at).toEqual(full.every.map((t) => t.id))
    expect(sets.every.every((t, i) => t === full.every[i]), at).toBe(true)
    live = sets.here
    const all = sets.here

    expect(entries(taskIndexOf(all)), at).toEqual(entries(new Map(all.map((t) => [t.id, t]))))
    expect(openTasksOf(all), at).toEqual(all.filter((t) => !t.completed_at))
    const ownOpen = new Map<string, number>()
    for (const t of all) if (!t.completed_at && t.project_id) ownOpen.set(t.project_id, (ownOpen.get(t.project_id) ?? 0) + 1)
    expect(entries(openCountsByProject(all)), at).toEqual(entries(ownOpen))

    const progressBefore = liveProgress(before.here)
    const progress = liveProgress(all)
    expect(entries(progress), at).toEqual(entries(progressMap(all)))
    const pk = keysBetween(progressBefore, progress)
    if (pk) for (const t of all) if (!pk.has(t.id)) expect(progress.get(t.id), at).toEqual(progressBefore.get(t.id))

    const blockedBefore = liveBlocked(before.here)
    const blocked = liveBlocked(all)
    expect(entries(blocked), at).toEqual(entries(blockedMap(all)))
    const bk = keysBetween(blockedBefore, blocked)
    if (bk) for (const t of all) if (!bk.has(t.id)) expect(blocked.get(t.id), at).toEqual(blockedBefore.get(t.id))

    expect(entries(habits.get(all, TODAY)), at).toEqual(entries(habitStatsMap(all, TODAY)))

    const index = taskIndexOf(all)
    const prevView = flow?.view
    const view = nextFlowView(flow, all, projects, sections, TODAY, index)
    flow = { tasks: all, projects, sections, today: TODAY, view }
    const fresh = flowView(all, availability({ tasks: all, projects, sections, today: TODAY }), sections)
    const fk = prevView ? keysBetween(prevView, view) : null
    if (fk) used.flowKeys++
    for (const t of all) {
      expect(view.state.get(t.id), at).toEqual(fresh.state.get(t.id))
      expect(view.waitsFor(t.id), at).toBe(fresh.waitsFor(t.id))
      if (fk && prevView && !fk.has(t.id)) expect(view.waitsFor(t.id), `${at} flow key ${t.id}`).toBe(prevView.waitsFor(t.id))
    }

    SCOPES.forEach((scope, i) => {
      const got = views[i].get(all)
      const want = tasksForView(scope, all, projects, TODAY, 'me')
      expect(got.map((t) => t.id), `${at} ${scope.view} ${'id' in scope ? scope.id : ''}`).toEqual(want.map((t) => t.id))
      expect(got.every((t, j) => t === want[j]), at).toBe(true)
    })
    const held = { has: (id: string) => blocked.has(id) || view.state.waits(id) }
    const freshHeld = { has: (id: string) => blockedMap(all).has(id) || fresh.state.waits(id) }
    const projectList = views[SCOPES.findIndex((s) => s.view === 'project' && s.id === 'p-a')].get(all)
    expect(groupIds(projectGroups('project', 'p-a', projectList, all, held)), at).toEqual(groupIds(projectGroups('project', 'p-a', tasksForView({ view: 'project', id: 'p-a' }, all, projects, TODAY), all, freshHeld)))
    const inboxList = views[0].get(all)
    expect(groupIds(projectGroups('inbox', null, inboxList, all, held)), at).toEqual(groupIds(projectGroups('inbox', null, tasksForView({ view: 'inbox' }, all, projects, TODAY), all, freshHeld)))
    ;(['p-a', null] as const).forEach((pid, i) => {
      const list = pid ? projectList : inboxList
      const got = parts[i].get(list, true, false, TODAY, pid, sections)
      const want = treeParts(pid ? tasksForView({ view: 'project', id: pid }, all, projects, TODAY) : tasksForView({ view: 'inbox' }, all, projects, TODAY), true, false, TODAY, pid, sections)
      expect(shape(got), `${at} tree ${pid}`).toEqual(shape(want))
    })
    const todayList = views[1].get(all)
    const slots = todaySlots(todayList, TODAY, { today_limit: 5 }, null, (id) => view.state.available(id) && !blocked.has(id))
    const freshSlots = todaySlots(tasksForView({ view: 'today' }, all, projects, TODAY, 'me'), TODAY, { today_limit: 5 }, null, (id) => fresh.state.available(id) && !blockedMap(all).has(id))
    expect(slots, at).toEqual(freshSlots)
    expect(doneToday.get(all, TODAY).map((t) => t.id), at).toEqual(completedOn(all, TODAY).map((t) => t.id))

    for (const pid of ['p-a', 'p-b']) {
      const got = done.get(all, pid, sectionMap)
      expect(entries(got).map(([k, v]) => [k, v.map((t) => t.id)]), at).toEqual(entries(completedBySection(all, pid, sectionMap)).map(([k, v]) => [k, v.map((t) => t.id)]))
    }

    const open = openTasksOf(all)
    const c = counts.get(all, TODAY, null, 'me')
    const fc = sidebarCounts([...all], TODAY, null, 'me', look(all))
    expect([[...c.inbox].sort(), c.today, c.assigned, entries(c.own)], at).toEqual([[...fc.inbox].sort(), fc.today, fc.assigned, entries(fc.own)])
    expect(entries(labels.get(open, archived)), at).toEqual(entries(labelCounts(open, archived)))
    expect(badge.get(open, TODAY, 3), at).toEqual(badgeCounts(open, TODAY, 3))

  }
  // The patches did the work: most steps were followed row by row, not worked out in full.
  expect(used.views, 'view patches').toBeGreaterThan(steps * SCOPES.length * 0.6)
  expect(used.counts, 'count patches').toBeGreaterThan(steps * 0.5)
  expect(used.flowKeys, 'flow keys').toBeGreaterThan(steps * 0.2)
  expect(used.tree, 'tree patches').toBeGreaterThan(steps * 0.1)
}

describe('incremental values equal a full recomputation', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`after random writes (seed ${seed})`, () => run(seed, 150))
  }
})

describe('patchTreeParts', () => {
  const t = (id: string, over: Partial<Task> = {}) => ({ id, title: id, description: '', project_id: 'p-a', section_id: null, parent_id: null, priority: 4, position: 1, due: null, labels: [], completed_at: null, deleted_at: null, created_at: 1, recurrence: null, series_id: null, ...over }) as unknown as Task
  it('a parent and its subtask that leave in one write: worked out in full, or the subtask first and then its parent', () => {
    const parent = t('a')
    const child = t('b', { parent_id: 'a' })
    const c = t('c')
    const prev = treeParts([parent, child, c], true, false, TODAY, 'p-a', sections)
    const changes: TaskChange[] = [{ id: 'a', before: parent, after: undefined }, { id: 'b', before: child, after: undefined }]
    expect(patchTreeParts(prev, changes, () => false)).toBeNull()
    const got = patchTreeParts(prev, [...changes].reverse(), () => false)!
    expect(flattenTree(got.tree!.roots).map((n) => n.id)).toEqual(['c'])
    expect([...got.tree!.nodes.keys()]).toEqual(['c'])
  })
})
