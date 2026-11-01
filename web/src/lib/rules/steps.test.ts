import { describe, expect, it } from 'vitest'
import type { RoutineStepType } from '../types'
import { cutText, filterLines, formatTemplate, holds, joinLines, periodRange, renderNumber, replaceText, resolveDate, sortLines, sortTasks, splitLines, take, type SortTask, type StepValue } from './stepData'
import { checkTypes, contentStep, dateLiteral, parseSteps, readRoutine, STEPS, stepError } from './steps'
import vectors from './steps.vectors.json'

interface CheckVector {
  name: string
  trigger: RoutineStepType
  steps: unknown
  types?: Record<string, RoutineStepType>
  content?: string
  error?: { step: string; input: string; code: string; message?: string }
}

type In = Record<string, unknown>

describe('routine steps (shared vectors with internal/ruleval)', () => {
  const checks = vectors.check as CheckVector[]
  it('has the vectors', () => expect(checks.length).toBeGreaterThanOrEqual(40))
  for (const v of checks) {
    it(v.name, () => {
      let types: Record<string, RoutineStepType> | undefined
      let steps
      try {
        steps = parseSteps(v.steps)
        types = checkTypes(steps, v.trigger)
      } catch (e) {
        const err = stepError(e)
        if (!err) throw e
        expect(v.error, `${err.code} ${err.message}`).toBeDefined()
        expect({ step: err.step, input: err.input, code: err.code }).toEqual({ step: v.error!.step, input: v.error!.input, code: v.error!.code })
        if (v.error!.message) expect(err.message).toBe(v.error!.message)
        return
      }
      expect(v.error).toBeUndefined()
      expect(types).toEqual(v.types)
      if (v.content !== undefined) expect(contentStep(steps, v.trigger, types)).toBe(v.content)
    })
  }

  for (const r of vectors.reading) {
    it(`reading: ${r.name}`, () => {
      const got = readRoutine(r.actions, r.steps)
      if (r.read === null) return expect(got).toBeNull()
      expect(got).toEqual({ steps: r.read, legacy: r.legacy })
    })
  }

  it('offers no step that leaves the server or edits routines', () => {
    for (const k of ['fetch_url', 'rss', 'email', 'run_script', 'create_event', 'create_routine', 'run_routine']) expect(STEPS.some((s) => s.kind === k)).toBe(false)
  })
})

describe('data steps (shared vectors with internal/ruleval)', () => {
  it('has the vectors', () => expect(vectors.data.length).toBeGreaterThanOrEqual(40))
  vectors.data.forEach((v, i) => {
    it(`${i} ${v.fn}`, () => {
      const a = v.in as In
      let got: unknown
      switch (v.fn) {
        case 'split_lines': got = splitLines(a.text as string).lines; break
        case 'join': got = joinLines(a.lines as string[], a.separator as string); break
        case 'format': got = formatTemplate(a.template as string, a.vals as Record<string, string>); break
        case 'replace': got = replaceText(a.text as string, a.find as string, a.with as string, a.case as boolean); break
        case 'filter_lines': got = filterLines(a.lines as string[], a.text as string, a.not as boolean); break
        case 'sort_lines': got = sortLines(a.lines as string[], a.desc as boolean); break
        case 'sort_tasks': got = sortTasks(a.tasks as SortTask[], a.by as string, a.desc as boolean).map((t) => t.id); break
        case 'take': got = take(a.list as string[], a.n as number, a.from_end as boolean); break
        case 'number': got = renderNumber(a.n as number); break
        case 'holds': got = holds(a.value as StepValue, a.is as Record<string, unknown>); break
        case 'cut': {
          const c = cutText(a.text as string)
          expect(c.truncated).toBe((v as { truncated?: boolean }).truncated ?? false)
          got = c.text
          break
        }
        case 'date': got = resolveDate(dateLiteral(a.literal)!, a.today as string); break
        case 'period': got = periodRange(a.period as string, a.today as string, a.week_start as number); break
        default: throw new Error(`unknown fn ${v.fn}`)
      }
      expect(got).toEqual(v.out)
    })
  })

  it('cuts a long note on a character boundary and splits at most 500 lines', () => {
    const long = 'é'.repeat(64 * 1024)
    const c = cutText(long)
    expect(c.truncated).toBe(true)
    expect(new TextEncoder().encode(c.text).length).toBe(64 * 1024)
    const odd = cutText('a' + long)
    expect(new TextEncoder().encode(odd.text).length).toBe(64 * 1024 - 1)
    const s = splitLines('x\n'.repeat(600))
    expect(s.lines.length).toBe(500)
    expect(s.truncated).toBe(true)
  })
})
