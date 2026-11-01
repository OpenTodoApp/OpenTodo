// The use-case suite of OpenSpec change routines-dynamic-data (design D12):
// internal/rules runs every case against seeded data (usecases_test.go); here
// the device's checker must accept every case's steps, so the device and the
// server agree each routine is valid. Editor cases hold no task chosen by hand.
import { describe, expect, it } from 'vitest'
import type { RoutineStep } from '../types'
import { checkTypes, parseSteps, triggerOutput } from './steps'
import suite from './usecases.json'

interface UseCase { row: number; name: string; editor?: boolean; trigger: { kind: string }; condition?: unknown; steps: unknown }

const cases = suite.cases as UseCase[]

function walk(list: RoutineStep[], fn: (s: RoutineStep) => void) {
  for (const s of list) {
    fn(s)
    walk(s.then ?? [], fn); walk(s.otherwise ?? [], fn); walk(s.do ?? [], fn)
  }
}

describe('routine use cases (shared with internal/rules)', () => {
  it('has the cases', () => expect(cases.length).toBeGreaterThanOrEqual(25))
  for (const c of cases) {
    it(`${c.row}: ${c.name}`, () => {
      const steps = parseSteps(c.steps)
      expect(() => checkTypes(steps, triggerOutput(c.trigger.kind, !!c.condition))).not.toThrow()
      if (!c.editor) return
      walk(steps, (s) => {
        expect(s.kind).not.toBe('get_task')
        for (const a of Object.values(s.in ?? {})) {
          if ('literal' in a) expect(a.literal && typeof a.literal === 'object' && 'task' in (a.literal as object)).toBe(false)
        }
      })
    })
  }
})
