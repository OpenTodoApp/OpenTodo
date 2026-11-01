// routines-editor 2.2-2.6: the draft edits, sentences, fixes, the device preview
// and the Add step search, without a screen.
import { describe, expect, it } from 'vitest'
import { applyCatalog } from '../i18n/catalog'
import it_ from '../../locales/it.json'
import type { RoutineStep, Task } from '../types'
import { draftError, draftOf, duplicateStep, moveStep, newId, newStep, removeStep, sameDraft, stepNumber, storedOf, type RoutineDraft } from './draft'
import { errorText, fixFor } from './fixes'
import { planDraft, type PreviewData } from './preview'
import { outputNames, searchKinds, sentenceParts } from './sentence'

const groceries: RoutineStep[] = [
  { id: 'g', kind: 'get_task', in: { task: { literal: { task: 't1' } } } },
  { id: 'a', kind: 'note_text', in: { of: { ref: 'g' } } },
  { id: 'b', kind: 'split_lines', in: { text: { ref: 'a' } } },
  { id: 'c', kind: 'create_tasks', in: { text: { ref: 'b' }, project: { literal: { project: 'p1' } } } },
]
const draft = (steps: RoutineStep[], trigger: RoutineDraft['trigger'] = { kind: 'manual' }): RoutineDraft => ({ name: 'Groceries', trigger, condition: null, steps })

const task = (id: string, title: string, description = ''): Task => ({ id, title, description, project_id: null, labels: [], priority: 4, created_at: 1, completed_at: null, deleted_at: null } as unknown as Task)

function data(tasks: Task[]): PreviewData {
  return {
    tasks, projects: [{ id: 'p1', name: 'Errands' } as never], today: '2026-11-01',
    match: { userId: 'u', today: '2026-11-01', parent: () => null, open: () => true, tracked: () => 0 },
    matchTask: (x) => ({ id: x.id, project_id: x.project_id, section_id: null, labels: x.labels, priority: x.priority, dueDate: null, deadline: null, start: null, evening: false, blocked_by: [], assignee_id: null, origin: null, habit: false, estimate_minutes: null }),
  }
}

describe('draft', () => {
  it('an old rule is one Change tasks card and saves back in the rule form ("An old rule")', () => {
    const rule = { name: 'Waiting', trigger: { kind: 'label.added' as const, label_id: 'l' }, condition: null, actions: { priority: 3 as const }, steps: null }
    const d = draftOf(rule)
    expect(d.steps.map((s) => s.kind)).toEqual(['change_tasks'])
    expect(storedOf(d)).toEqual({ actions: { priority: 3 }, steps: null })
    expect(sameDraft(d, draftOf(rule))).toBe(true)
    const more = { ...d, steps: [...d.steps, newStep('count', newId(d.steps), { id: 'a', type: 'tasks' })] }
    expect(storedOf(more).actions).toBeNull()
    expect(more.steps[1].in).toEqual({ list: { ref: 'a' } })
  })

  it('moves, duplicates and removes, and numbers steps in reading order', () => {
    const moved = moveStep(groceries, 'c', -1)!
    expect(moved.map((s) => s.id)).toEqual(['g', 'a', 'c', 'b'])
    expect(moveStep(groceries, 'g', -1)).toBeNull()
    const dup = duplicateStep(groceries, 'b')
    expect(dup.map((s) => s.id)).toEqual(['g', 'a', 'b', 'd', 'c'])
    expect(removeStep(groceries, 'b').map((s) => s.id)).toEqual(['g', 'a', 'c'])
    expect(stepNumber(groceries, 'c')).toBe(4)
  })
})

describe('sentences and outputs', () => {
  it('reads a step as a sentence with slots, and names outputs, numbered when repeated', () => {
    expect(sentenceParts(groceries[3])).toEqual([{ text: 'Create tasks from ' }, { slot: 'text' }, { text: ' in ' }, { slot: 'project' }])
    const names = outputNames([...groceries, { id: 'd', kind: 'split_lines', in: { text: { ref: 'a' } } }])
    expect(names.get('b')).toBe('the lines')
    expect(names.get('d')).toBe('the lines (2)')
  })

  it('finds steps by name and synonym in English, and in Italian with the Italian catalog ("Synonym in Italian")', () => {
    expect(searchKinds('mail')).toContain('email_me')
    expect(searchKinds('loop')).toContain('repeat')
    expect(searchKinds('rename')).toContain('update_project')
    applyCatalog('it', 'it', it_ as Record<string, string>)
    try {
      expect(searchKinds('ripeti')).toContain('repeat')
      expect(searchKinds('loop')).toContain('repeat')
    } finally {
      applyCatalog('en', 'en', {})
    }
  })
})

describe('type errors and fixes', () => {
  const notify: RoutineStep[] = [
    { id: 'a', kind: 'find_tasks', in: { condition: { literal: { due: 'today' } } } },
    { id: 'b', kind: 'notify', in: { text: { ref: 'a' } } },
  ]

  it('"Fix in one tap": Notify me reading tasks gets Format text inserted', () => {
    const d = draft(notify)
    const e = draftError(d)!
    expect(errorText(d, e, outputNames(d.steps))).toBe('Notify me expects Text, got Tasks')
    const fix = fixFor(d, e)!
    expect(fix.kind === 'edit' && fix.label).toBe('Insert Format text')
    const fixed = fix.kind === 'edit' ? fix.apply(d) : d
    expect(fixed.steps.map((s) => s.kind)).toEqual(['find_tasks', 'format', 'notify'])
    expect(draftError(fixed)).toBeNull()
  })

  it('each fix of the table', () => {
    const cases: [RoutineStep[], string, string[]][] = [
      // Tasks → Number: Count.
      [[{ id: 'a', kind: 'find_tasks', in: { condition: { literal: {} } } }, { id: 'b', kind: 'create_tasks', in: { title: { literal: 'x' }, priority: { ref: 'a' } } }], 'Insert Count', ['find_tasks', 'count', 'create_tasks']],
      // Lines → Text: Join.
      [[{ id: 'a', kind: 'split_lines', in: { text: { literal: 'x' } } }, { id: 'b', kind: 'replace', in: { text: { ref: 'a' }, find: { literal: 'x' } } }], 'Insert Join', ['split_lines', 'join', 'replace']],
      // Text → Lines: Split into lines.
      [[{ id: 'a', kind: 'format', in: { template: { literal: 'x' } } }, { id: 'b', kind: 'join', in: { lines: { ref: 'a' } } }], 'Insert Split into lines', ['format', 'split_lines', 'join']],
      // Tasks to a single task: Repeat for each.
      [[{ id: 'a', kind: 'find_tasks', in: { condition: { literal: {} } } }, { id: 'b', kind: 'add_comment', in: { task: { ref: 'a' }, text: { literal: 'hi' } } }, { id: 'c', kind: 'start_timer', in: { task: { ref: 'a' } } }], 'Wrap in Repeat for each', []],
    ]
    for (const [steps, label, kinds] of cases) {
      const d = draft(steps)
      const e = draftError(d)
      if (!e) continue // the checker reads it per item: no fix needed
      const fix = fixFor(d, e)!
      expect(fix.label).toBe(label)
      if (fix.kind === 'edit' && kinds.length) expect(fix.apply(d).steps.map((s) => s.kind)).toEqual(kinds)
    }
  })

  it('"Removed step": the later card says the value no longer exists', () => {
    const d = draft(removeStep(groceries, 'b'))
    const e = draftError(d)!
    expect(e.step).toBe('c')
    expect(errorText(d, e, outputNames(groceries))).toBe('the lines no longer exists')
    expect(fixFor(d, e)).toEqual({ kind: 'choose', label: 'Choose another value', step: 'c', input: 'text' })
  })
})

describe('the device preview', () => {
  it('"Preview offline": a note split into lines, and the effect of Create tasks', () => {
    const note = ['- oat milk', '- bread', '- eggs', '- apples', '- rice', '- tea', '- soap'].join('\n')
    const p = planDraft(draft(groceries), data([task('t1', 'Groceries', note)]))
    const lines = p.get('b')
    expect(lines?.state === 'value' && lines.value.lines).toEqual(['oat milk', 'bread', 'eggs', 'apples', 'rice', 'tea', 'soap'])
    const c = p.get('c')
    expect(c?.state === 'effect' && c.text).toBe('Would create 7 tasks in Errands')
  })

  it('"Over a limit": 620 tasks are more than a run may write', () => {
    const many = Array.from({ length: 620 }, (_, i) => `item ${i}`)
    const p = planDraft(draft([{ id: 'a', kind: 'create_tasks', in: { text: { literal: many.join('\n') } } }]), data([]))
    const a = p.get('a')
    expect(a?.state === 'effect' && [a.n, a.max]).toEqual([620, 500])
  })

  it('"Nothing sent": Email me only says what it would do', () => {
    const p = planDraft(draft([{ id: 'a', kind: 'email_me', in: { subject: { literal: 'Hi' }, text: { literal: 'x' } } }]), data([]))
    expect(p.get('a')).toEqual({ state: 'effect', text: 'Would email you' })
  })

  it('an If runs one lane; steps planned only on the server say so', () => {
    const steps: RoutineStep[] = [
      { id: 'a', kind: 'split_lines', in: { text: { literal: 'a\nb\nc' } } },
      { id: 'b', kind: 'count', in: { list: { ref: 'a' } } },
      { id: 'c', kind: 'if', in: { value: { ref: 'b' }, is: { literal: { '>': 2 } } }, then: [{ id: 'd', kind: 'notify', in: { text: { literal: 'x' } } }], otherwise: [{ id: 'e', kind: 'stop' }] },
      { id: 'f', kind: 'tracked_time', in: { period: { literal: 'today' } } },
    ]
    const p = planDraft(draft(steps), data([]))
    expect(p.get('d')?.state).toBe('effect')
    expect(p.get('e')?.state).toBe('skipped')
    expect(p.get('f')?.state).toBe('server')
  })
})
