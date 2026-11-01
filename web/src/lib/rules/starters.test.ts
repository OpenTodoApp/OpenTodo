// The routine starters (OpenSpec change routines-starters, design D2, D3): every
// starter of generated/routineStarters.json, its choices filled, in every
// language it is translated into, must pass the device's step checker, so the
// device and the server (internal/rules/starters_test.go runs each one) agree
// it is a valid routine. No starter holds a task chosen by hand.
import { describe, expect, it } from 'vitest'
import library from '../../generated/routineStarters.json'
import type { RoutineStep } from '../types'
import { draftError } from './draft'
import { missingChoices, searchStarters, starterDraft, starterNeeds, type Starter } from './starters'
import { walkSteps } from './steps'

const starters = (library as unknown as { starters: Starter[] }).starters

const filledValues = (s: Starter) => Object.fromEntries(Object.keys(s.ask).map((name) => [name, `id-${name}`]))

describe('routine starters (shared with internal/rules)', () => {
  it('has the starters', () => expect(starters.length).toBeGreaterThanOrEqual(8))

  for (const s of starters) {
    describe(s.slug, () => {
      for (const lang of s.languages) {
        it(`type-checks in ${lang}`, () => {
          const d = starterDraft(s, filledValues(s), lang)
          expect(draftError(d)).toBeNull()
          expect(JSON.stringify(d)).not.toContain('"ask"')
          expect(d.name).toBe(s.text.title[lang] ?? s.text.title.en)
        })
      }
      it('holds no task chosen by hand', () => {
        walkSteps(s.steps, (st: RoutineStep) => {
          expect(st.kind).not.toBe('get_task')
          for (const a of Object.values(st.in ?? {})) {
            if ('literal' in a) expect(!!a.literal && typeof a.literal === 'object' && 'task' in (a.literal as object)).toBe(false)
          }
        })
      })
    })
  }
})

describe('starter helpers', () => {
  const groceries = starters.find((s) => s.slug === 'groceries-from-note')!
  const sweep = starters.find((s) => s.slug === 'sunday-overdue-sweep')!

  it('fills the choices where they stand and leaves an unchosen one empty', () => {
    const d = starterDraft(groceries, { list: 'p1' }, 'en')
    expect(d.steps[0].in?.of).toEqual({ literal: { project: 'p1' } })
    expect(d.steps[2].in?.project).toEqual({ literal: { project: '' } })
    expect(missingChoices(groceries, { list: 'p1' })).toEqual(['into'])
    expect(missingChoices(groceries, { list: 'p1', into: 'p2' })).toEqual([])
  })

  it('fills a choice in the trigger', () => {
    const waiting = starters.find((s) => s.slug === 'waiting-follow-up')!
    expect(starterDraft(waiting, { waiting: 'l1' }, 'en').trigger).toEqual({ kind: 'label.added', label_id: 'l1' })
  })

  it('uses the texts of the language, keeping a format a format', () => {
    expect(starterDraft(sweep, {}, 'it').steps[2].in?.text).toEqual({ literal: { format: '{b} attività scadute spostate a lunedì' } })
    expect(starterDraft(sweep, {}, 'en').steps[2].in?.text).toEqual({ literal: { format: '{b} overdue tasks moved to Monday' } })
    const inbox = starters.find((s) => s.slug === 'inbox-over-20')!
    expect(starterDraft(inbox, {}, 'de').steps[2].then?.[0].in?.text).toEqual({ literal: { format: 'Dein Eingang enthält {b} Aufgaben: Zeit zum Sortieren' } })
  })

  it('names what a starter needs', () => {
    expect(starterNeeds(starters.find((s) => s.slug === 'friday-digest-email')!)).toEqual(['email_me'])
    expect(starterNeeds(starters.find((s) => s.slug === 'morning-focus')!)).toEqual(['set_focus'])
    expect(starterNeeds(groceries)).toEqual([])
  })

  it('searches title, summary and step names in the language and in English', () => {
    expect(searchStarters(starters, 'groceries', 'it').map((s) => s.slug)).toContain('groceries-from-note')
    expect(searchStarters(starters, 'spesa', 'it').map((s) => s.slug)).toEqual(['groceries-from-note'])
    expect(searchStarters(starters, 'email me', 'en').map((s) => s.slug)).toEqual(['friday-digest-email'])
    expect(searchStarters(starters, '', 'en')).toHaveLength(starters.length)
    expect(searchStarters(starters, 'xylophone', 'en')).toEqual([])
  })
})
