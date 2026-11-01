// routines-dynamic-data D2, D3: the data that flows into a step, the wiring of a
// new step, Pick's modes and the fixes that wire flowing data, without a screen.
import { describe, expect, it } from 'vitest'
import type { RoutineStep } from '../types'
import { draftTypes, fitOf, flowingTo, flowingTypeAt, insertNewStep, pickModeOf, setPickMode, sortBeforePick, type RoutineDraft } from './draft'
import { fixFor } from './fixes'
import { outputNames } from './sentence'
import { stepKind } from './steps'
import { conditionParts, triggerText } from './summary'
import { lastChangedDay } from '../../app/routines/data'

const find: RoutineStep = { id: 'a', kind: 'find_tasks', in: { condition: { literal: { due: 'overdue' } } } }
const draft = (steps: RoutineStep[], trigger: RoutineDraft['trigger'] = { kind: 'manual' }): RoutineDraft => ({ name: 'x', trigger, condition: null, steps })
const input = (kind: string, name: string) => stepKind(kind)!.inputs.find((d) => d.name === name)!

describe('flowing data (routines-dynamic-data D3)', () => {
  it('a list fits a one-task input, once per task', () => {
    expect(fitOf(input('add_comment', 'task'), 'tasks')).toBe('each')
    expect(fitOf(input('change_tasks', 'tasks'), 'task')).toBe('yes')
    expect(fitOf(input('notify', 'text'), 'tasks')).toBe('no')
  })

  it('a new comment after Find tasks reads the tasks; after Pick, the picked task', () => {
    let d = draft([find])
    d = insertNewStep(d, { parent: '', block: '', index: -1 }, 'add_comment', 'b', draftTypes(d))
    expect(d.steps[1].in?.task).toEqual({ ref: 'a' })
    d = draft([find])
    d = insertNewStep(d, { parent: '', block: '', index: -1 }, 'take', 'b', draftTypes(d))
    expect(d.steps[1].in).toEqual({ list: { ref: 'a' }, n: { literal: 1 }, from: { literal: 'start' } })
    d = insertNewStep(d, { parent: '', block: '', index: -1 }, 'add_comment', 'c', draftTypes(d))
    expect(d.steps[2].in?.task).toEqual({ ref: 'b' })
  })

  it('inside a Repeat a new step reads the item, first', () => {
    const d0 = draft([find, { id: 'b', kind: 'repeat', in: { list: { ref: 'a' } }, do: [] }])
    const d = insertNewStep(d0, { parent: 'b', block: 'do', index: -1 }, 'add_comment', 'c', draftTypes(d0))
    expect(d.steps[1].do![0].in?.task).toEqual({ ref: 'item' })
    expect(flowingTo(d, 'c', draftTypes(d0)).map((f) => f.ref)).toEqual(['item', 'a'])
    expect(flowingTypeAt(d0, { parent: 'b', block: 'do', index: -1 }, draftTypes(d0))).toBe('task')
  })

  it('an event routine\'s first step reads the task that triggered; a manual one\'s is never wired by itself', () => {
    const ev = draft([], { kind: 'label.added', label_id: 'l1' })
    expect(insertNewStep(ev, { parent: '', block: '', index: -1 }, 'add_comment', 'a', {}).steps[0].in?.task).toEqual({ ref: 'trigger' })
    const man = draft([])
    expect(insertNewStep(man, { parent: '', block: '', index: -1 }, 'add_comment', 'a', {}).steps[0].in?.task).toBeUndefined()
    expect(flowingTo(man, 'a', {}, true).map((f) => f.ref)).toEqual(['trigger'])
    expect(flowingTypeAt(man, { parent: '', block: '', index: -1 }, {})).toBe('start')
  })

  it('"Empty task input": the fix uses the tasks; "Nothing flowing": it inserts Find tasks, never a task picker', () => {
    const d = draft([find, { id: 'b', kind: 'add_comment', in: { text: { literal: 'x' } } }])
    const flow = { types: { a: 'tasks' as const }, name: (r: string) => (r === 'a' ? 'the tasks' : r) }
    const fix = fixFor(d, { step: 'b', input: 'task', code: 'missing_input', message: '' }, flow)!
    expect(fix.label).toBe('Use the tasks')
    expect(fix.kind === 'edit' && fix.apply(d).steps[1].in?.task).toEqual({ ref: 'a' })
    const lone = draft([{ id: 'a', kind: 'add_comment', in: { text: { literal: 'x' } } }])
    const fix2 = fixFor(lone, { step: 'a', input: 'task', code: 'missing_input', message: '' }, { types: {}, name: (r) => r })!
    expect(fix2.label).toBe('Find tasks…')
    const after = fix2.kind === 'edit' ? fix2.apply(lone) : lone
    expect(after.steps.map((s) => s.kind)).toEqual(['find_tasks', 'add_comment'])
    expect(after.steps[1].in?.task).toEqual({ ref: after.steps[0].id })
    expect(JSON.stringify(after)).not.toContain('get_task')
  })
})

describe('days of the month and "not changed for" (routines-dynamic-data D5)', () => {
  const names = { labels: [], projects: [], sections: [] }
  it('reads a monthly schedule and a stale-task condition', () => {
    expect(triggerText({ kind: 'schedule', at: '09:00', month_days: [15, 1, 'last'] }, names)).toBe('every month on 1, 15 and the last day at 09:00')
    expect(conditionParts({ unchanged: { days: 30 } }, names)).toEqual(['not changed for 30 days'])
  })

  it('a task\'s last change is the newest of its field clocks', () => {
    expect(lastChangedDay({ _clock: { title: { ts: Date.UTC(2026, 8, 1, 12), device: 'd' }, due: { ts: Date.UTC(2026, 8, 15, 12), device: 'd' } } })).toBe('2026-09-15')
    expect(lastChangedDay({ _clock: {} })).toBe('')
  })
})

describe('Pick (routines-dynamic-data D2)', () => {
  const pick = (inp: RoutineStep['in']): RoutineDraft => draft([find, { id: 'b', kind: 'take', in: { list: { ref: 'a' }, ...inp } }])

  it('reads its mode from take and filter', () => {
    expect(pickModeOf({ kind: 'take', in: { n: { literal: 1 } } })).toBe('first')
    expect(pickModeOf({ kind: 'take', in: { from: { literal: 'end' } } })).toBe('last')
    expect(pickModeOf({ kind: 'take', in: { n: { literal: 3 }, from: { literal: 'end' } } })).toBe('last_n')
    expect(pickModeOf({ kind: 'take', in: { from: { literal: 'all' } } })).toBe('all')
    expect(pickModeOf({ kind: 'filter', in: {} })).toBe('where')
  })

  it('switches modes in place, keeping the id and the list; where becomes a Filter and back', () => {
    let d = setPickMode(pick({ n: { literal: 1 }, from: { literal: 'start' } }), 'b', 'where')
    expect(d.steps[1]).toEqual({ id: 'b', kind: 'filter', in: { list: { ref: 'a' }, where: { literal: {} } } })
    d = setPickMode(d, 'b', 'last_n')
    expect(d.steps[1]).toEqual({ id: 'b', kind: 'take', in: { list: { ref: 'a' }, n: { literal: 3 }, from: { literal: 'end' } } })
    d = setPickMode(d, 'b', 'all')
    expect(d.steps[1]).toEqual({ id: 'b', kind: 'take', in: { list: { ref: 'a' }, from: { literal: 'all' } } })
  })

  it('"Sort first" puts a Sort by due between the list and Pick', () => {
    const d = sortBeforePick(pick({ n: { literal: 1 } }), 'b')
    expect(d.steps.map((s) => s.kind)).toEqual(['find_tasks', 'sort', 'take'])
    expect(d.steps[2].in?.list).toEqual({ ref: d.steps[1].id })
  })

  it('names its output by mode and type', () => {
    const d = pick({ n: { literal: 1 } })
    expect(outputNames(d.steps, undefined, draftTypes(d)).get('b')).toBe('the picked task')
    const all = setPickMode(d, 'b', 'all')
    expect(outputNames(all.steps, undefined, draftTypes(all)).get('b')).toBe('the picked tasks')
  })
})
