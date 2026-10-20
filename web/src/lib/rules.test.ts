// OpenSpec change rule-boards, task 2.2: the on-drop rule planner and its wording.
import { beforeEach, describe, expect, it } from 'vitest'
import { readTicked } from './bulk'
import { weekStartOf } from './dates'
import { db, useDatabase } from './db'
import { occurrenceId } from './ids'
import { createLabel, deleteLabel } from './labels'
import { createProject, createSubtask, createTask, mutateMany, resetDeviceId, type Change } from './ops'
import { describeRule, knownRule, planRule, ruleParts, type RuleContext } from './rules'
import { createSection } from './sections'
import type { OnDropRule } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`rules-${Date.now()}-${n++}`)
  resetDeviceId()
})

const TODAY = '2026-10-14' // a Wednesday

async function plan(id: string, rule: OnDropRule, today = TODAY): Promise<Change[]> {
  const { tasks, all } = await readTicked([id])
  const ctx: RuleContext = { now: 1_000, today, labels: await db.labels.toArray(), memberships: new Map(), me: null }
  return planRule(tasks[0], all, rule, ctx)
}

const names = async () => ({ labels: await db.labels.toArray(), projects: await db.projects.toArray(), sections: await db.sections.toArray() })

describe('planRule', () => {
  it('drop with several changes: priority 1 and today in one patch (spec "Drop with several changes")', async () => {
    const id = await createTask({ title: 'Report', priority: 3 })
    const changes = await plan(id, { priority: 1, due: 'today' })
    expect(changes).toEqual([{ entity: 'task', entityId: id, patch: { priority: 1, due: { date: TODAY } } }])
  })

  it('resolves tomorrow and next week against the logical today it is given', async () => {
    const id = await createTask({ title: 'Plan' })
    expect((await plan(id, { due: 'tomorrow' }, '2026-10-14'))[0].patch).toEqual({ due: { date: '2026-10-15' } })
    // Next week is the first day of the following week per the user's week start.
    expect((await plan(id, { due: 'next-week' }, '2026-10-14'))[0].patch).toEqual({ due: { date: weekStartOf('2026-10-21') } })
  })

  it('a completion rule rolls a recurring task forward (spec "Drop that completes a recurring task")', async () => {
    const id = await createTask({ title: 'Weekly review', due: { date: TODAY }, recurrence: 'every week' })
    const changes = await plan(id, { state: 'complete' })
    await mutateMany(changes)
    expect(await db.tasks.get(id)).toMatchObject({ completed_at: null, due: { date: '2026-10-21' } })
    expect((await db.tasks.get(occurrenceId(id, TODAY)))!.completed_at).not.toBeNull()
  })

  it('a completion rule completes open subtasks; a reopen rule leaves an open task alone', async () => {
    const p = await createTask({ title: 'Move house' })
    const c = await createSubtask(p, 'Pack')
    const changes = await plan(p, { state: 'complete' })
    expect(changes.map((x) => x.entityId).sort()).toEqual([p, c].sort())
    expect(await plan(p, { state: 'reopen' })).toEqual([])
  })

  it('writes nothing when the task already matches (spec "Nothing to change")', async () => {
    const id = await createTask({ title: 'Done-ish', priority: 1, due: { date: TODAY } })
    expect(await plan(id, { priority: 1, due: 'today' })).toEqual([])
  })

  it('skips a deleted label and still applies the rest (spec "Rule names a deleted label")', async () => {
    const errand = await createLabel({ name: 'errand' })
    const keep = await createLabel({ name: 'keep' })
    await deleteLabel(errand)
    const id = await createTask({ title: 'Buy milk' })
    const changes = await plan(id, { add_labels: [errand, keep], priority: 2 })
    expect(changes).toEqual([{ entity: 'task', entityId: id, patch: { labels: [keep], priority: 2 } }])
  })

  it('removes then adds labels from the current array, written whole', async () => {
    const a = await createLabel({ name: 'waiting' })
    const b = await createLabel({ name: 'errand' })
    const c = await createLabel({ name: 'home' })
    const id = await createTask({ title: 'Call', labels: [a, c] })
    expect((await plan(id, { remove_labels: [a], add_labels: [b] }))[0].patch).toEqual({ labels: [c, b] })
  })

  it('clearing the date ends a recurrence; a date un-parks; someday parks', async () => {
    const rep = await createTask({ title: 'Gym', due: { date: TODAY }, recurrence: 'every day' })
    expect((await plan(rep, { due: 'clear' }))[0].patch).toEqual({ due: null, recurrence: null })
    const parked = await createTask({ title: 'Idea', start: 'someday' })
    expect((await plan(parked, { due: 'today' }))[0].patch).toEqual({ due: { date: TODAY }, start: null })
    const dated = await createTask({ title: 'Later', due: { date: TODAY } })
    expect((await plan(dated, { start: 'someday' }))[0].patch).toEqual({ start: 'someday', due: null })
    expect(await plan(parked, { start: 'someday' })).toEqual([])
    expect((await plan(parked, { start: 'clear' }))[0].patch).toEqual({ start: null })
  })

  it('moves to a section of another project and the subtree follows', async () => {
    const home = await createProject({ name: 'Home' })
    const doing = await createSection(home, 'Doing')
    const p = await createTask({ title: 'Paint' })
    const c = await createSubtask(p, 'Buy paint')
    const changes = await plan(p, { section: { project_id: home, section_id: doing } })
    expect(changes.find((x) => x.entityId === p)!.patch).toEqual({ project_id: home, section_id: doing })
    expect(changes.find((x) => x.entityId === c)!.patch).toEqual({ project_id: home })
  })

  it('ignores keys and values this build does not know', async () => {
    const id = await createTask({ title: 'x' })
    const rule = { colour: 'red', priority: 9, due: 'friday' } as unknown as OnDropRule
    expect(knownRule(rule)).toBeNull()
    expect(await plan(id, rule)).toEqual([])
  })
})

describe('describeRule', () => {
  it('reads "Adds errand, due today" and lower-case parts for the toast', async () => {
    const errand = await createLabel({ name: 'errand' })
    expect(describeRule({ add_labels: [errand], due: 'today' }, await names())).toBe('Adds errand, due today')
    expect(ruleParts({ priority: 1, due: 'today' }, await names()).join(', ')).toBe('priority 1, due today')
    expect(describeRule({ state: 'complete' }, await names())).toBe('Completes')
    expect(describeRule(null, await names())).toBe('')
  })

  it('names the section and project, and leaves out a deleted label', async () => {
    const home = await createProject({ name: 'Home' })
    const doing = await createSection(home, 'Doing')
    const waiting = await createLabel({ name: 'waiting' })
    const gone = await createLabel({ name: 'gone' })
    await deleteLabel(gone)
    expect(describeRule({ section: { project_id: home, section_id: doing } }, await names())).toBe('Section Doing of Home')
    expect(describeRule({ remove_labels: [waiting, gone], due: 'clear' }, await names())).toBe('Removes waiting, no date')
  })
})
