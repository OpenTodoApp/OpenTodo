import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshViewerZone } from './dates'
import { getMeta, useDatabase } from './db'
import { applyOps, getDeviceId, resetDeviceId } from './ops'
import type { Label, Op, Project, Task, View } from './types'
import {
  MAX_PANELS, START_VIEW_KEY, addPanel, compareTasks, createView, dashboardPanels, deleteView, evaluateViews, groupTasks,
  movePanel, removePanel, reorderView, resolveStartView, runView, setPanels, setPinned, setStartView, updateView, type ViewContext,
} from './views'

let n = 0
let db = useDatabase('views-init')
beforeEach(() => {
  db = useDatabase(`views-${Date.now()}-${n++}`)
  resetDeviceId()
})

const TODAY = '2026-10-10'

function task(p: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    title: p.id, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
    estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, section_id: null, ical_extra: null, created_at: 0, completed_at: null, deleted_at: null, _clock: {}, ...p,
  }
}
function project(p: Partial<Project> & Pick<Project, 'id' | 'name'>): Project {
  return { color: '#000', position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {}, ...p }
}
function label(p: Partial<Label> & Pick<Label, 'id' | 'name'>): Label {
  return { color: '#000', position: 0, created_at: 0, deleted_at: null, _clock: {}, ...p }
}
function view(p: Partial<View> & Pick<View, 'id' | 'query'>): View {
  return {
    name: p.id, kind: 'list', group_by: 'project', sort_by: 'due', sort_dir: 'asc', pinned: true, position: 0, color: '#000',
    panels: [], created_at: 0, deleted_at: null, _clock: {}, ...p,
  }
}

const LABELS = [label({ id: 'lw', name: 'work', position: 1 }), label({ id: 'lwait', name: 'waiting', position: 2 }), label({ id: 'le', name: 'errand', position: 3 })]
const PROJECTS = [
  project({ id: 'pw', name: 'Work', position: 1 }),
  project({ id: 'pc', name: 'Client A', parent_id: 'pw', position: 1 }),
  project({ id: 'ph', name: 'Home', position: 2 }),
  project({ id: 'pa', name: 'Old', position: 3, archived: true }),
]
const TASKS = [
  task({ id: 'overdue-p2', due: { date: '2026-10-08' }, priority: 2, labels: ['lw'], project_id: 'pw' }),
  task({ id: 'today-p1', due: { date: TODAY, time: '09:00' }, priority: 1, labels: ['lw'], project_id: 'pc' }),
  task({ id: 'today-p4', due: { date: TODAY }, priority: 4, labels: ['lw', 'le'] }),
  task({ id: 'tomorrow-p1', due: { date: '2026-10-11' }, priority: 1, labels: ['lw'], project_id: 'pw' }),
  task({ id: 'later-p3', due: { date: '2026-10-20' }, priority: 3, labels: ['lw'], project_id: 'ph' }),
  task({ id: 'undated-p1', priority: 1, labels: ['lw'], project_id: 'ph' }),
  task({ id: 'waiting', labels: ['lwait'] }),
  task({ id: 'done', completed_at: 5, labels: ['lw'] }),
  task({ id: 'gone', deleted_at: 5, labels: ['lw'] }),
  task({ id: 'archived', labels: ['lw'], project_id: 'pa' }),
]
const CTX: ViewContext = { today: TODAY, labels: LABELS, projects: PROJECTS, tasks: TASKS }
const ids = (ts: Task[]) => ts.map((t) => t.id)

describe('createView / updateView / deleteView', () => {
  it('creates a pinned list view through the op log with default options, last in order', async () => {
    const a = await createView({ name: ' Work tomorrow ', query: '@work & due <= tomorrow & p1' })
    const b = await createView({ name: 'Waiting', query: '@waiting', pinned: false })
    const va = await db.views.get(a)
    expect(va).toMatchObject({ name: 'Work tomorrow', query: '@work & due <= tomorrow & p1', kind: 'list', group_by: 'project', sort_by: 'due', sort_dir: 'asc', pinned: true, panels: [], deleted_at: null })
    expect((await db.views.get(b))!.position).toBeGreaterThan(va!.position)
    const outbox = await db.outbox.toArray()
    expect(outbox.filter((o) => o.entity === 'view' && o.entityId === a)).toHaveLength(12)
  })

  it('refuses an empty name, an empty query and a query that does not parse', async () => {
    await expect(createView({ name: ' ', query: 'p1' })).rejects.toThrow('name')
    await expect(createView({ name: 'x', query: '  ' })).rejects.toThrow('must not be empty')
    await expect(createView({ name: 'x', query: '@work p1' })).rejects.toThrow('Expected "&" or "|" before "p1" at position 7')
    expect(await db.views.count()).toBe(0)
  })

  it('updates only changed fields, validates the query and never changes the kind', async () => {
    const id = await createView({ name: 'Work', query: '@work' })
    const before = await db.outbox.count()
    await updateView(id, { query: '@work & !@waiting', group_by: 'due', name: 'Work' })
    const ops = (await db.outbox.toArray()).slice(before)
    expect(ops.map((o) => o.field).sort()).toEqual(['group_by', 'query'])
    expect((await db.views.get(id))!.query).toBe('@work & !@waiting')
    await expect(updateView(id, { query: 'p5' })).rejects.toThrow('Priority must be')
    await expect(updateView(id, { name: '' })).rejects.toThrow()
    expect('kind' in ({} as Parameters<typeof updateView>[1])).toBe(false)
  })

  it('pins, unpins, reorders among pinned views and tombstones on delete', async () => {
    const a = await createView({ name: 'Work tomorrow', query: '@work' })
    const b = await createView({ name: 'Waiting', query: '@waiting' })
    await reorderView(b, -1)
    const pos = async (id: string) => (await db.views.get(id))!.position
    expect(await pos(b)).toBeLessThan(await pos(a))
    await reorderView(b, -1) // already first: no-op
    expect(await pos(b)).toBeLessThan(await pos(a))
    await setPinned(b, false)
    expect((await db.views.get(b))!.pinned).toBe(false)
    await deleteView(a)
    expect((await db.views.get(a))!.deleted_at).toBeTypeOf('number')
  })

  it('a view saved offline converges with a remote edit of another option', async () => {
    const id = await createView({ name: 'Work', query: '@work' })
    await updateView(id, { group_by: 'due' })
    const local = await db.views.get(id)
    // Another device changed the sort meanwhile (older timestamp, different field): both survive.
    // Its device id sorts after any local UUID, so a tie with the creation's timestamp (both
    // local writes in consecutive milliseconds) still resolves in its favour.
    await applyOps([{ id: 'r1', entity: 'view', entityId: id, field: 'sort_by', value: 'priority', ts: local!._clock.group_by.ts - 1, device: '~B' } as Op])
    expect(await db.views.get(id)).toMatchObject({ group_by: 'due', sort_by: 'priority' })
  })
})

describe('dashboards', () => {
  it('sets, adds, moves and removes panels; a dashboard cannot nest a dashboard', async () => {
    const today = await createView({ name: 'Today p1', query: 'today & p1' })
    const waiting = await createView({ name: 'Waiting', query: '@waiting' })
    const dash = await createView({ name: 'Morning', kind: 'dashboard' })
    const other = await createView({ name: 'Evening', kind: 'dashboard' })
    expect((await db.views.get(dash))!.query).toBe('')

    await setPanels(dash, [today, waiting, today])
    expect((await db.views.get(dash))!.panels).toEqual([today, waiting])
    await expect(setPanels(dash, [today, other])).rejects.toThrow('cannot contain another dashboard')
    await expect(addPanel(dash, dash)).rejects.toThrow('cannot contain itself')
    await expect(setPanels(today, [waiting])).rejects.toThrow('Only dashboards')
    await expect(setPanels(dash, Array.from({ length: MAX_PANELS + 1 }, (_, i) => `v${i}`))).rejects.toThrow('at most 6')
    expect((await db.views.get(dash))!.panels).toEqual([today, waiting])

    await movePanel(dash, waiting, -1)
    expect((await db.views.get(dash))!.panels).toEqual([waiting, today])
    await removePanel(dash, waiting)
    expect((await db.views.get(dash))!.panels).toEqual([today])
  })

  it('a deleted panel view becomes a placeholder and can still be removed', async () => {
    const errands = await createView({ name: 'Errands', query: '@errand' })
    const waiting = await createView({ name: 'Waiting', query: '@waiting' })
    const dash = await createView({ name: 'Morning', kind: 'dashboard' })
    await setPanels(dash, [errands, waiting])
    await deleteView(errands)
    const views = await db.views.toArray()
    const panels = dashboardPanels((await db.views.get(dash))!, views, evaluateViews(views, CTX))
    expect(panels.map((p) => p.kind)).toEqual(['removed', 'view'])
    expect(panels[1].kind === 'view' && panels[1].summary.ok && panels[1].summary.count).toBe(1)
    await removePanel(dash, errands)
    expect((await db.views.get(dash))!.panels).toEqual([waiting])
  })
})

describe('runView', () => {
  it('evaluates the query with the filter compiler: open only, no deleted or archived tasks', () => {
    const r = runView(view({ id: 'v', query: '@work', group_by: 'none' }), CTX)
    expect(r.ok && ids(r.tasks)).toEqual(['overdue-p2', 'today-p1', 'today-p4', 'tomorrow-p1', 'later-p3', 'undated-p1'])
  })

  it('shows the parse error and no results for a query that no longer parses', () => {
    expect(runView(view({ id: 'v', query: '@work & urgent' }), CTX)).toEqual({ ok: false, error: 'Unknown term "urgent" at position 9' })
  })

  it('keeps unknown names as warnings like the Filter view', () => {
    const r = runView(view({ id: 'v', query: '@nope | @waiting' }), CTX)
    expect(r.ok && r.warnings).toEqual(['No label named "nope"'])
    expect(r.ok && ids(r.tasks)).toEqual(['waiting'])
  })

  it('groups by due date under Overdue, Today, Tomorrow, later dates, then No date', () => {
    const r = runView(view({ id: 'v', query: '@work', group_by: 'due' }), CTX)
    expect(r.ok && r.groups.map((g) => g.heading).slice(0, 3)).toEqual(['Overdue', 'Today', 'Tomorrow'])
    expect(r.ok && r.groups.map((g) => g.key)).toEqual(['overdue', 'today', 'tomorrow', '2026-10-20', 'none'])
    expect(r.ok && r.groups.at(-1)!.heading).toBe('No date')
  })

  it('groups by project: Inbox first, then projects in sidebar tree order with their path', () => {
    const r = runView(view({ id: 'v', query: '@work' }), CTX)
    expect(r.ok && r.groups.map((g) => g.heading)).toEqual(['Inbox', 'Work', 'Work › Client A', 'Home'])
  })

  it('groups by priority 1 to 4 and by label in label order (a task under each of its labels)', () => {
    const p = runView(view({ id: 'v', query: '@work', group_by: 'priority' }), CTX)
    expect(p.ok && p.groups.map((g) => g.heading)).toEqual(['Priority 1', 'Priority 2', 'Priority 3', 'Priority 4'])
    const l = runView(view({ id: 'v', query: '@work | @waiting', group_by: 'label' }), CTX)
    expect(l.ok && l.groups.map((g) => g.heading)).toEqual(['work', 'waiting', 'errand'])
    expect(l.ok && ids(l.groups[2].tasks)).toEqual(['today-p4'])
    const none = runView(view({ id: 'v', query: 'no project & !@work', group_by: 'label' }), { ...CTX, labels: [] })
    expect(none.ok && none.groups.map((g) => g.heading)).toEqual(['No label'])
  })

  it('sorts by priority descending within groups: p1 first, p4 last', () => {
    const r = runView(view({ id: 'v', query: '@work', group_by: 'none', sort_by: 'priority', sort_dir: 'desc' }), CTX)
    expect(r.ok && r.tasks.map((t) => t.priority)).toEqual([1, 1, 1, 2, 3, 4])
    const asc = runView(view({ id: 'v', query: '@work', group_by: 'none', sort_by: 'priority', sort_dir: 'asc' }), CTX)
    expect(asc.ok && asc.tasks.map((t) => t.priority)).toEqual([4, 3, 2, 1, 1, 1])
    const grouped = runView(view({ id: 'v', query: '@work', group_by: 'due', sort_by: 'priority', sort_dir: 'desc' }), CTX)
    expect(grouped.ok && ids(grouped.groups[1].tasks)).toEqual(['today-p1', 'today-p4'])
  })

  it('sorts by due date with undated tasks last in both directions', () => {
    const asc = runView(view({ id: 'v', query: '@work', group_by: 'none' }), CTX)
    expect(asc.ok && ids(asc.tasks).at(-1)).toBe('undated-p1')
    const desc = runView(view({ id: 'v', query: '@work', group_by: 'none', sort_dir: 'desc' }), CTX)
    expect(desc.ok && ids(desc.tasks)).toEqual(['later-p3', 'tomorrow-p1', 'today-p4', 'today-p1', 'overdue-p2', 'undated-p1'])
  })

  it('sorts by title, created and position', () => {
    const ts = [task({ id: 'a', title: 'banana', created_at: 3, position: 2 }), task({ id: 'b', title: 'Apple', created_at: 1, position: 3 }), task({ id: 'c', title: 'cherry', created_at: 2, position: 1 })]
    expect(ids([...ts].sort(compareTasks('title', 'asc')))).toEqual(['b', 'a', 'c'])
    expect(ids([...ts].sort(compareTasks('title', 'desc')))).toEqual(['c', 'a', 'b'])
    expect(ids([...ts].sort(compareTasks('created', 'asc')))).toEqual(['b', 'c', 'a'])
    expect(ids([...ts].sort(compareTasks('position', 'desc')))).toEqual(['b', 'a', 'c'])
  })

  it('groups, sorts and filters zoned dues by their date in the viewer zone (absolute-datetimes)', () => {
    const real = Intl.DateTimeFormat.prototype.resolvedOptions
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (this: Intl.DateTimeFormat) {
      return { ...real.call(this), timeZone: 'Europe/Berlin' }
    })
    try {
      refreshViewerZone()
      // 02:00 Tokyo on the 11th is 19:00 in Berlin on the 10th (today).
      const tokyo = task({ id: 'tokyo', due: { date: '2026-10-11', time: '02:00', tz: 'Asia/Tokyo' } })
      const early = task({ id: 'early', due: { date: '2026-10-10', time: '20:00' } })
      const groups = groupTasks([tokyo, early], 'due', CTX)
      expect(groups.map((g) => g.key)).toEqual(['today'])
      expect(ids([early, tokyo].sort(compareTasks('due', 'asc')))).toEqual(['tokyo', 'early'])
      const r = runView(view({ id: 'v', query: 'today' }), { ...CTX, tasks: [tokyo] })
      expect(r.ok && r.tasks.length).toBe(1)
    } finally {
      spy.mockRestore()
      refreshViewerZone()
    }
  })

  it('reads unknown option values as defaults', () => {
    const r = runView(view({ id: 'v', query: '@work', group_by: 'colour', sort_by: 'mood' }), CTX)
    expect(r.ok && r.groups[0].heading).toBe('Inbox')
    expect(groupTasks([], 'none', CTX)).toEqual([])
  })
})

describe('evaluateViews', () => {
  it('counts match the runner results and panels list the first tasks in view order', () => {
    const views = [
      view({ id: 'work', query: '@work', group_by: 'due' }),
      view({ id: 'waiting', query: '@waiting' }),
      view({ id: 'p1', query: 'p1 & due <= tomorrow' }),
      view({ id: 'all', query: '@work | completed' }),
      view({ id: 'broken', query: 'p5' }),
      view({ id: 'dash', query: '', kind: 'dashboard', panels: ['work'] }),
      view({ id: 'deleted', query: 'p1', deleted_at: 1 }),
    ]
    const res = evaluateViews(views, CTX, 3)
    for (const id of ['work', 'waiting', 'p1']) {
      const r = runView(views.find((v) => v.id === id)!, CTX)
      const s = res.get(id)!
      expect(s.ok && r.ok && s.count).toBe(r.ok ? r.tasks.length : -1)
      expect(s.ok && ids(s.tasks)).toEqual(r.ok ? ids(r.groups.flatMap((g) => g.tasks)).slice(0, 3) : [])
    }
    // The count is of open matches, even when the query also lists completed tasks.
    const all = res.get('all')!
    expect(all.ok && all.count).toBe(6)
    expect(res.get('broken')).toMatchObject({ ok: false })
    expect(res.has('dash')).toBe(false)
    expect(res.has('deleted')).toBe(false)
  })

  it('evaluates a few pinned views over many tasks quickly', () => {
    const many = Array.from({ length: 5000 }, (_, i) => task({ id: `t${i}`, priority: ((i % 4) + 1) as Task['priority'], labels: i % 3 ? ['lw'] : ['le'], due: i % 5 ? { date: '2026-10-1' + (i % 9) } : null }))
    const views = Array.from({ length: 8 }, (_, i) => view({ id: `v${i}`, query: i % 2 ? '@work & p1' : 'due <= tomorrow | @errand' }))
    const start = performance.now()
    const res = evaluateViews(views, { ...CTX, tasks: many })
    expect(performance.now() - start).toBeLessThan(200)
    expect(res.size).toBe(8)
  })
})

describe('start view', () => {
  it('defaults to the Inbox and is stored per device in meta, never in the op log', async () => {
    expect(await resolveStartView()).toEqual({ kind: 'builtin', view: 'inbox', removed: false })
    await setStartView('today')
    expect(await resolveStartView()).toEqual({ kind: 'builtin', view: 'today', removed: false })
    const id = await createView({ name: 'Work tomorrow', query: '@work' })
    const before = await db.outbox.count()
    await setStartView(`view:${id}`)
    expect(await resolveStartView()).toEqual({ kind: 'saved', id })
    expect(await db.outbox.count()).toBe(before)
  })

  it('falls back to the Inbox with a notice when the saved start view was deleted elsewhere', async () => {
    const id = await createView({ name: 'Work tomorrow', query: '@work' })
    await setStartView(`view:${id}`)
    await getDeviceId()
    await applyOps([{ id: 'del', entity: 'view', entityId: id, field: 'deleted_at', value: Date.now(), ts: Date.now() + 60_000, device: 'phone' }])
    expect(await resolveStartView()).toEqual({ kind: 'builtin', view: 'inbox', removed: true })
    // The notice is shown once: the preference is reset.
    expect(await getMeta(START_VIEW_KEY, null)).toBe('inbox')
    expect(await resolveStartView()).toEqual({ kind: 'builtin', view: 'inbox', removed: false })
    await setStartView('view:never-existed')
    expect(await resolveStartView()).toMatchObject({ view: 'inbox', removed: true })
  })
})
