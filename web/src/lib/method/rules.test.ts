import { describe, expect, it } from 'vitest'
import fixture from '../../../../internal/digest/testdata/next_action_fixture.json'
import type { Label, Membership, Project, Section, Task } from '../types'
import { MethodRules, contextsOf, nextActions, oldSomeday, waitingTasks, withoutNextAction, type MethodInput } from './rules'

const DAY = 86_400_000

function inputOf(f: typeof fixture): MethodInput {
  const memberships = new Map<string, Membership>(Object.entries(f.roles).map(([projectId, role]) => [projectId, { projectId, role, ownerId: 'other', members: [] } as Membership]))
  return {
    tasks: f.tasks.map((t) => ({ title: t.id, labels: [], priority: 4, due: null, ...t }) as unknown as Task),
    projects: f.projects.map((p) => ({ archived: false, deleted_at: null, ...p }) as unknown as Project),
    sections: f.sections as unknown as Section[],
    memberships, me: f.me, today: f.today,
  }
}

describe('shared vectors (internal/digest/testdata/next_action_fixture.json)', () => {
  const input = inputOf(fixture)
  const rules = new MethodRules(input)

  it('lists the projects without a next action', () => {
    expect(withoutNextAction(input).map((p) => p.id)).toEqual(fixture.expected.withoutNextAction)
  })

  it('finds each project next action', () => {
    for (const [projectId, want] of Object.entries(fixture.expected.nextAction)) {
      expect(rules.nextActionOf(projectId)?.id ?? null, projectId).toBe(want)
    }
    expect(nextActions(input).map((n) => n.task.id)).toEqual(['g2', 't1', 'm2', 'f1', 'me1'])
  })

  it('marks stalled projects', () => {
    expect(rules.working.filter((p) => rules.stalled(p.id, fixture.now)).map((p) => p.id)).toEqual(fixture.expected.stalled)
  })

  it('lists what waits', () => {
    expect(waitingTasks(input).map((t) => t.id)).toEqual(fixture.expected.waiting)
  })
})

describe('method-views scenarios', () => {
  const base = (tasks: Partial<Task>[]): MethodInput => ({
    tasks: tasks.map((t, i) => ({ id: `t${i}`, title: `t${i}`, labels: [], project_id: 'p', parent_id: null, position: i, created_at: 0, completed_at: null, start: null, blocked_by: [], assignee_id: null, section_id: null, deleted_at: null, ...t }) as Task),
    projects: [{ id: 'p', name: 'Garage', position: 1, archived: false, deleted_at: null } as unknown as Project],
    sections: [], memberships: new Map(), me: 'me', today: '2026-10-18',
  })

  it('First in order, then Blocker completed elsewhere', () => {
    const tasks: Partial<Task>[] = [{ id: 'done', completed_at: 1 }, { id: 'brackets', blocked_by: ['wall'] }, { id: 'wall' }]
    expect(new MethodRules(base(tasks)).nextActionOf('p')?.id).toBe('wall')
    tasks[2] = { id: 'wall', completed_at: 5 }
    expect(new MethodRules(base(tasks)).nextActionOf('p')?.id).toBe('brackets')
  })

  it('Assigned to someone else: no next action, but waiting', () => {
    const input = base([{ id: 'tap', assignee_id: 'ana' }])
    expect(new MethodRules(input).nextActionOf('p')).toBeNull()
    expect(waitingTasks(input).map((t) => t.id)).toEqual(['tap'])
    expect(withoutNextAction(input)).toEqual([])
  })

  it('Only Someday tasks and Only a deferred task', () => {
    expect(withoutNextAction(base([{ start: 'someday' }, { start: 'someday' }])).map((p) => p.name)).toEqual(['Garage'])
    expect(withoutNextAction(base([{ start: '2027-03-01' }]))).toEqual([])
  })

  it('Stalled, and a New project that is not', () => {
    const now = Date.UTC(2026, 9, 18)
    const old = base([{ created_at: Date.UTC(2026, 7, 1) }, { created_at: Date.UTC(2026, 7, 2), completed_at: Date.UTC(2026, 8, 1) }])
    expect(new MethodRules(old).stalled('p', now)).toBe(true)
    expect(new MethodRules(base([{ created_at: now - 5 * DAY }])).stalled('p', now)).toBe(false)
  })

  it('Two contexts, and a label that is not one', () => {
    const labels = new Map<string, Label>([
      ['a', { id: 'a', name: '@calls', deleted_at: null } as Label],
      ['b', { id: 'b', name: '@errands', deleted_at: null } as Label],
      ['c', { id: 'c', name: 'urgent', deleted_at: null } as Label],
    ])
    expect(contextsOf({ labels: ['a', 'b', 'c'] }, labels).map((l) => l.name)).toEqual(['@calls', '@errands'])
  })

  it('old someday items are those older than 90 days, oldest first', () => {
    const now = Date.UTC(2026, 9, 18)
    const tasks = base([{ id: 'new', start: 'someday', created_at: now - 10 * DAY }, { id: 'old', start: 'someday', created_at: now - 200 * DAY }, { id: 'older', start: 'someday', created_at: now - 300 * DAY }]).tasks
    expect(oldSomeday(tasks, now).map((t) => t.id)).toEqual(['older', 'old'])
  })
})

describe('Next and Waiting groups', () => {
  it('Next groups by context, a task under each of its contexts, Anywhere last', async () => {
    const { nextGroups } = await import('./groups')
    const input = inputOf(fixture)
    const g2 = input.tasks.find((x) => x.id === 'g2')!
    g2.labels = ['calls', 'errands']
    const labels = [{ id: 'calls', name: '@calls', deleted_at: null }, { id: 'errands', name: '@errands', deleted_at: null }, { id: 'x', name: 'urgent', deleted_at: null }] as Label[]
    const groups = nextGroups(input, labels)
    expect(groups.map((g) => g.heading)).toEqual(['@calls', '@errands', 'Anywhere'])
    expect(groups[0].tasks.map((x) => x.id)).toEqual(['g2'])
    expect(groups[2].tasks.map((x) => x.id)).toEqual(['t1', 'm2', 'f1', 'me1'])
  })

  it('Waiting groups by person, then blocked tasks with their first open blocker', async () => {
    const { waitingGroups } = await import('./groups')
    const input = inputOf(fixture)
    ;(input.memberships as Map<string, Membership>).set('household', { projectId: 'household', role: 'editor', ownerId: 'ana', members: [{ userId: 'ana', name: 'Ana', email: 'ana@example.com' }] } as unknown as Membership)
    const groups = waitingGroups(input)
    expect(groups.map((g) => g.heading)).toEqual(['Ana', 'Blocked by another task'])
    expect(groups[0].tasks.map((x) => x.id)).toEqual(['h1'])
    expect(groups[1].tasks.map((x) => x.id)).toEqual(['g1', 'i1'])
    expect(groups[1].notes?.get('g1')).toBe('Waits for g2')
  })
})
