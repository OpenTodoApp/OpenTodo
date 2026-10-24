// The `workspace:` term (OpenSpec change group-mentions, design D6).
import { describe, expect, it } from 'vitest'
import { workspaceFilterContext } from '../../app/useWorkspaceFilter'
import type { Label, Project, Task, View } from '../types'
import { evaluateViews, runView } from '../views'
import { runFilter, type FilterContext } from './evaluate'
import { FilterSyntaxError, parse, printQuery, tokenize } from './parse'
import { formatQuery, stripPositions } from './builder'

const WS = [
  { id: 'w-personal', name: 'Personal' },
  { id: 'w-home', name: 'Home' },
  { id: 'w-side', name: 'Side projects' },
]

function project(id: string, name: string, workspace_id: string | null, parent_id: string | null = null): Project {
  return { id, name, color: '#000', position: 0, archived: false, parent_id, created_at: 0, deleted_at: null, _clock: {}, workspace_id } as Project
}
function label(id: string, name: string, workspace_id: string | null): Label {
  return { id, name, color: '#000', position: 0, created_at: 0, deleted_at: null, _clock: {}, workspace_id } as Label
}
function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [],
    position: 0, created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...extra,
  }
}

const PROJECTS = [project('p-garden', 'Garden', null), project('p-house', 'House', 'w-home'), project('p-room', 'Room', null, 'p-house'), project('p-app', 'App', 'w-side')]
const LABELS = [label('l-errand-p', 'errand', null), label('l-errand-h', 'errand', 'w-home')]
const TASKS = [
  task('weed', { project_id: 'p-garden', due: { date: '2026-10-20' } }),
  task('paint', { project_id: 'p-house', priority: 1, labels: ['l-errand-h'] }),
  task('lamp', { project_id: 'p-room' }),
  task('inbox-home', { workspace_id: 'w-home' } as Partial<Task>),
  task('step', { parent_id: 'inbox-home' }),
  task('ship', { project_id: 'p-app', priority: 1 }),
  task('stray', { workspace_id: 'w-gone' } as Partial<Task>),
]
const EVERY = workspaceFilterContext('w-personal', WS, PROJECTS, LABELS, TASKS)
// The current workspace is Personal: only its own data.
const HERE_TASKS = TASKS.filter((t) => EVERY.workspaceOf!(t) === 'w-personal')
const CTX: FilterContext = { today: '2026-10-20', labels: [LABELS[0]], projects: [PROJECTS[0]], tasks: HERE_TASKS, ...EVERY }

const ids = (q: string, ctx: FilterContext = CTX) => {
  const r = runFilter(q, HERE_TASKS, ctx)
  if (!r.ok) throw new Error(r.error)
  return r.tasks.map((t) => t.id).sort()
}

describe('workspace: term', () => {
  it('tokenises bare, quoted and spaced names, in any case', () => {
    expect(tokenize('workspace:Home')).toMatchObject([{ type: 'workspace', name: 'Home', pos: 0 }])
    expect(tokenize('workspace: "Side projects"')).toMatchObject([{ type: 'workspace', name: 'Side projects' }])
    expect(tokenize('WORKSPACE: home')).toMatchObject([{ type: 'workspace', name: 'home' }])
  })

  it('round-trips through the printer and the builder formatter', () => {
    for (const q of ['workspace: Home', 'workspace: "Side projects" & p1', '!workspace: Home', '(workspace: Home | workspace: Work) & today']) {
      const ast = parse(q)!
      expect(stripPositions(parse(printQuery(ast))!)).toEqual(stripPositions(ast))
      expect(formatQuery(parse(formatQuery(ast))!)).toBe(formatQuery(ast))
    }
    expect(formatQuery(parse('workspace:"Side projects"')!)).toBe('workspace: "Side projects"')
  })

  it('reports a missing name like the Go parser', () => {
    for (const [q, pos] of [['workspace:', 1], ['p1 & workspace: ', 6]] as const) {
      try {
        parse(q)
        throw new Error('parsed')
      } catch (e) {
        expect(e).toBeInstanceOf(FilterSyntaxError)
        expect((e as Error).message).toBe(`Expected a workspace name after "workspace:" at position ${pos}`)
      }
    }
  })

  it('matches the tasks of the named workspace, ignoring case, across every workspace', () => {
    expect(ids('workspace: home')).toEqual(['inbox-home', 'lamp', 'paint', 'step'])
    expect(ids('workspace: "Side projects" & p1')).toEqual(['ship'])
    expect(ids('workspace: Home & no project')).toEqual(['inbox-home', 'step'])
    // A workspace this device does not know reads as the default.
    expect(ids('workspace: Personal')).toEqual(['stray', 'weed'])
  })

  it('resolves labels and projects in every workspace when the query names a workspace', () => {
    expect(ids('workspace: Home & @errand')).toEqual(['paint'])
    expect(ids('(workspace: Home | workspace: Personal) & #House')).toEqual(['paint'])
    expect(ids('(workspace: Home | workspace: Personal) & ##House')).toEqual(['lamp', 'paint'])
  })

  it('keeps the current workspace without the term', () => {
    expect(ids('no labels')).toEqual(['stray', 'weed'])
  })

  it('warns about an unknown workspace and matches nothing', () => {
    const r = runFilter('workspace: Garage', HERE_TASKS, CTX)
    expect(r).toMatchObject({ ok: true, tasks: [], warnings: ['No workspace named "Garage"'] })
  })

  it('saved views and their counts follow the same rule', () => {
    const view = (id: string, query: string) => ({ id, name: id, query, kind: 'list', deleted_at: null, position: 0, _clock: {} }) as unknown as View
    const ctx = { ...CTX, tasks: HERE_TASKS }
    const r = runView(view('v', 'workspace: Home & p1'), ctx)
    expect(r.ok && r.tasks.map((t) => t.id)).toEqual(['paint'])
    const counts = evaluateViews([view('home', 'workspace: Home'), view('here', 'p4')], ctx, 0)
    expect(counts.get('home')).toMatchObject({ ok: true, count: 4 })
    expect(counts.get('here')).toMatchObject({ ok: true, count: 2 })
  })
})
