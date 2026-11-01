// The device planner's parts beyond the use cases: the rule actions against
// the server's fixture, ids the server would make for the same run, what auto
// mode allows, and the items of a proposal.
import { describe, expect, it } from 'vitest'
import cases from '../plan.fixture.json'
import { autoCheck, planActions, parseActions, planRoutine, proposalItems, type Row, type RunWorld } from '.'
import type { RoutineStep } from '../../types'

interface PlanCase {
  name: string; today: string; now: number; me: string; week_start: 'mon' | 'sun'; actions: unknown; task: Row
  live_labels: string[]; projects?: Record<string, boolean>; sections?: Record<string, string>; expect: Record<string, unknown>; skipped?: string[]
}

describe('rule actions (plan.fixture.json, shared with internal/rules Plan)', () => {
  for (const c of cases as unknown as PlanCase[]) {
    it(c.name, () => {
      const projects = c.projects ?? {}
      const got = planActions(parseActions(c.actions), c.task, {
        today: c.today, nowMs: c.now, userId: c.me, weekStart: c.week_start === 'sun' ? 0 : 1,
        labelLive: (id) => c.live_labels.includes(id), sectionProject: (id) => c.sections?.[id] ?? '',
        projectShared: (id) => projects[id] === true, projectLive: (id) => id in projects,
      })
      expect(got.patch).toEqual(c.expect)
      if (c.skipped) expect(got.skipped).toEqual(c.skipped)
    })
  }
})

const NOW = Date.UTC(2026, 9, 21, 12)

function world(more: Partial<RunWorld> = {}): RunWorld {
  return {
    userId: 'alice', today: '2026-10-21', now: NOW, weekStart: 1, offset: 0, dayStart: '', tasks: [], projects: [], labels: [], sections: [], views: [],
    timeEntries: [], memberships: new Map(), encrypted: true, env: { ai: true, aiConsent: true }, ...more,
  }
}

const rule = (steps: unknown[]) => ({ id: 'r1', name: 'Routine', steps: steps as RoutineStep[], trigger: { kind: 'manual' } })
const task = (id: string, more: Row = {}): Row => ({ id, title: id, labels: [], priority: 4, project_id: null, parent_id: null, due: null, completed_at: null, deleted_at: null, position: 1, ...more })

describe('planRoutine', () => {
  it('names created entities as the server does (internal/agenttools requestSeed, entityID)', async () => {
    // Computed by internal/ids NameID for user alice, token rule:r1, request run-1:2:0:0.
    const plan = await planRoutine(world(), rule([
      { id: 'a', kind: 'date', in: {} },
      { id: 'b', kind: 'date', in: {} },
      { id: 'c', kind: 'create_tasks', in: { text: { literal: 'A\nB' } } },
    ]), { key: 'manual:run-1', runId: 'run-1' })
    expect(plan.changes.map((c) => c.id)).toEqual(['f8a93c70-4e56-8cac-8bee-3394325e0e52', 'a7d40ea9-7612-89e2-a14c-33ce1d9c42eb'])
  })

  it('names a comment as the server does (routine-comment)', async () => {
    const plan = await planRoutine(world({ tasks: [task('t1')] }), rule([
      { id: 'a', kind: 'date', in: {} },
      { id: 'b', kind: 'date', in: {} },
      { id: 'c', kind: 'add_comment', in: { task: { literal: { task: 't1' } }, text: { literal: 'Hi' } } },
    ]), { key: 'manual:run-1', runId: 'run-1' })
    expect(plan.changes[0]).toMatchObject({ entity: 'comment', id: '9e9009d4-4bc5-827e-80b2-bb49e04f1811', create: true })
  })

  it('estimates an AI step without calling the model in a test, and records tokens on a run', async () => {
    let calls = 0
    const ai = async () => { calls++; return { text: 'Short.', input: 120, output: 30 } }
    const steps = [{ id: 'a', kind: 'ask_ai', in: { instruction: { literal: 'Say hi' } } }]
    const test = await planRoutine(world(), rule(steps), { key: 't', runId: 't', test: true, ai })
    expect(calls).toBe(0)
    expect(test.records[0]).toMatchObject({ status: 'skipped' })
    expect(test.records[0].estimate).toBeGreaterThan(0)
    const run = await planRoutine(world(), rule(steps), { key: 'k', runId: 'r', ai })
    expect(calls).toBe(1)
    expect(run.tokens).toBe(150)
    expect(run.aiTexts).toEqual(['Short.'])
  })

  it('fails an AI step past the daily budget before calling the model', async () => {
    let calls = 0
    const plan = await planRoutine(world(), { ...rule([{ id: 'a', kind: 'ask_ai', in: { instruction: { literal: 'Say hi' } } }]), aiBudget: 1000 },
      { key: 'k', runId: 'r', aiTokensToday: 950, ai: async () => { calls++; return { text: 'x', input: 1, output: 1 } } })
    expect(calls).toBe(0)
    expect(plan.outcome).toBe('failed')
    expect(plan.records[0].error).toBe('ai_budget')
  })

  it('shows Ask AI unavailable on an encrypted account without the on-device assistant', async () => {
    const plan = await planRoutine(world({ env: { ai: false } }), rule([{ id: 'a', kind: 'ask_ai', in: { instruction: { literal: 'Say hi' } } }]), { key: 'k', runId: 'r' })
    expect(plan.records[0]).toMatchObject({ status: 'unavailable', error: 'unavailable:ai_encrypted' })
  })
})

describe('auto mode and proposals', () => {
  const answer = async () => ({ lines: ['One', 'Two'], input: 10, output: 10 })
  const steps = [
    { id: 'a', kind: 'ask_ai', in: { instruction: { literal: 'List' }, answer: { literal: 'lines' } } },
    { id: 'b', kind: 'create_tasks', in: { text: { ref: 'a' } } },
  ]

  it('allows creating tasks, and lists them as items Written by AI', async () => {
    const w = world()
    const plan = await planRoutine(w, rule(steps), { key: 'k', runId: 'r', ai: answer })
    expect(autoCheck(w, rule(steps), plan)).toBe('')
    const items = proposalItems(w, plan)
    expect(items.map((i) => [i.kind, i.entity, i.fields?.title, i.ai])).toEqual([['create', 'task', 'One', true], ['create', 'task', 'Two', true]])
  })

  it('refuses completing tasks and more than 20 items', async () => {
    const w = world({ tasks: [task('t1')] })
    const done = rule([...steps, { id: 'c', kind: 'change_tasks', in: { tasks: { literal: { task: 't1' } }, set: { literal: { state: 'complete' } } } }])
    expect(autoCheck(w, done, await planRoutine(w, done, { key: 'k', runId: 'r', ai: answer }))).toBe('disallowed_write')
    const many = async () => ({ lines: Array.from({ length: 21 }, (_, i) => `Task ${i}`), input: 1, output: 1 })
    expect(autoCheck(w, rule(steps), await planRoutine(w, rule(steps), { key: 'k', runId: 'r', ai: many }))).toBe('limit')
  })

  it('shows a change with the values it was planned on', async () => {
    const w = world({ tasks: [task('t1', { priority: 4 })] })
    const r = rule([{ id: 'a', kind: 'change_tasks', in: { tasks: { literal: { task: 't1' } }, set: { literal: { priority: 1 } } } }])
    const items = proposalItems(w, await planRoutine(w, r, { key: 'k', runId: 'r' }))
    expect(items).toEqual([{ key: 'e:task:t1', kind: 'change', entity: 'task', id: 't1', fields: { priority: 1 }, before: { priority: 4 }, ai: false }])
  })
})
