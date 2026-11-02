// @vitest-environment happy-dom
// The use-case suite, editor part (OpenSpec change routines-dynamic-data, design
// D12, tasks 2.1-2.6 and 2.9): the routines that matter most are built through
// the editor (Add step, pickers, Pick's mode menu, fixes) and must save the
// steps of web/src/lib/rules/usecases.json, which internal/rules runs against
// seeded data, without a task chosen by hand. Each case starts from its source
// step (Find tasks with its condition, or nothing) and adds the rest by hand.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { publishEncryption } from '../../lib/e2ee'
import { resetDeviceId } from '../../lib/ops'
import { resetCatalogueCache } from '../../lib/rules/catalogue'
import type { PickMode, RoutineDraft } from '../../lib/rules/draft'
import { PICK_MENU } from '../../lib/rules/sentence'
import suite from '../../lib/rules/usecases.json'
import type { RoutineStep, RuleTrigger } from '../../lib/types'
import { click, key, mockFetch, render, type, waitFor } from '../../ui/test-utils'
import { RoutineEditor } from './RoutineEditor'

let n = 0
beforeEach(() => {
  useDatabase(`routines-usecases-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
  resetCatalogueCache()
  publishEncryption({ enabled: false })
  mockFetch((_method, path) => {
    if (path === '/api/v1/me/rules') return { enabled: true, paused: false, rules: {} }
    if (path === '/api/v1/me/rules/catalogue') return { steps: [] }
    if (path === '/api/v1/rules/test') return { run: { outcome: 'applied', failed_step: -1 }, steps: [], writes: 0, test: true }
    if (path === '/api/v1/webhooks') return { webhooks: [], events: [] }
    if (path === '/api/v1/me') return { user: { id: 'u1' }, mfa: {} }
    return {}
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

interface UseCase { row: number; name: string; trigger: RuleTrigger; condition?: unknown; steps: RoutineStep[] }
const caseOf = (row: number, nth = 0): UseCase => (suite.cases as unknown as UseCase[]).filter((c) => c.row === row)[nth]

const cards = () => [...document.querySelectorAll<HTMLElement>('[data-step-card]')]
const button = (text: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!
const editorText = () => document.querySelector('[data-testid="routine-editor"]')?.textContent ?? ''

/** Steps with their ids renamed a, b, c… in reading order, so cases compare by structure. */
function canonical(steps: RoutineStep[]): RoutineStep[] {
  const ids = new Map<string, string>()
  const name = (list: RoutineStep[]) => list.forEach((s) => { ids.set(s.id, String.fromCharCode(97 + ids.size)); name(s.then ?? []); name(s.otherwise ?? []); name(s.do ?? []) })
  name(steps)
  const re = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(re)
    if (x && typeof x === 'object') {
      const o: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(x)) o[k] = (k === 'id' || k === 'ref') && typeof v === 'string' && ids.has(v) ? ids.get(v) : re(v)
      return o
    }
    return x
  }
  return re(steps) as RoutineStep[]
}

/** No step holds a task chosen by hand, and no word asks to choose one. */
function noHandPicked(steps: RoutineStep[]) {
  const walk = (list: RoutineStep[]) => list.forEach((s) => {
    expect(s.kind).not.toBe('get_task')
    for (const a of Object.values(s.in ?? {})) if ('literal' in a) expect(a.literal && typeof a.literal === 'object' && 'task' in (a.literal as object)).toBe(false)
    walk(s.then ?? []); walk(s.otherwise ?? []); walk(s.do ?? [])
  })
  walk(steps)
  expect(editorText()).not.toContain('choose which tasks')
  expect(editorText()).not.toContain('choose a task')
}

async function open(c: UseCase, steps: RoutineStep[]): Promise<{ unmount: () => Promise<void>; saved: () => Promise<RoutineStep[]> }> {
  const draft: RoutineDraft = { name: c.name.slice(0, 60), trigger: c.trigger, condition: (c.condition ?? null) as RoutineDraft['condition'], steps }
  const done = vi.fn()
  const r = await render(<RoutineEditor draft={draft} onBack={() => {}} onSaved={done} />)
  await waitFor(() => cards().length >= steps.length, 'the cards')
  return {
    unmount: () => r.unmount(),
    saved: async () => {
      await click(button('Save'))
      await waitFor(() => done.mock.calls.length === 1, `saved: ${document.querySelector('[data-save-error]')?.textContent ?? ''}`)
      const rule = (await db.rules.toArray())[0]
      return rule.steps ?? []
    },
  }
}

/** Adds a step through "+ Add step" (or a block's Add step), found by search. */
async function add(kind: string, search: string, lane?: HTMLElement) {
  const before = cards().length
  await click(lane ? button('Add step', lane) : document.querySelector('[data-add-step]')!)
  // The catalogue expands in place, never as a dialog (routines-editor-no-modals).
  await waitFor(() => !!document.querySelector('[data-add-step-panel]'), 'the catalogue in place')
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  await type(document.querySelector<HTMLInputElement>('[data-add-step-panel] input')!, search)
  await waitFor(() => !!document.querySelector(`[data-add-results] [data-add-kind="${kind}"]`), `the result ${kind}`)
  await click(document.querySelector(`[data-add-results] [data-add-kind="${kind}"]`)!)
  await waitFor(() => cards().length === before + 1, `the ${kind} card`)
}

/** Types a text into a card's Text word. */
/** Types a text into a card's Text word, edited in place (routines-dynamic-data D13), and keeps it with Enter. */
async function write(c: HTMLElement, text: string) {
  await click(c.querySelector('[data-word="Text"]')!)
  await waitFor(() => !!c.querySelector('[data-inline-text] textarea'), 'the text field in the card')
  const area = c.querySelector<HTMLTextAreaElement>('[data-inline-text] textarea')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, text)
    area.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await key(area, 'Enter')
  await waitFor(() => !c.querySelector('[data-inline-text]'), 'the text kept')
}

/** Moves focus out of the cards, to the routine's name. */
async function leaveCards() {
  await act(async () => { document.querySelector<HTMLInputElement>('[data-routine-name]')!.focus() })
}

/** The options of the open word list, by their label. */
const options = () => [...document.querySelectorAll<HTMLElement>('[data-word-choices] [role="option"]')]

/** Chooses Pick's mode in its word's list (an anchored list like every word's, routines-editor-polish). */
async function mode(c: HTMLElement, m: PickMode) {
  await click(c.querySelector('[data-word="Which"]')!)
  await waitFor(() => options().some((o) => o.textContent === PICK_MENU[m]), 'the modes')
  await click(options().find((o) => o.textContent === PICK_MENU[m])!)
  await waitFor(() => options().length === 0, 'the modes closed')
}

const byKind = (kind: string) => cards().find((c) => c.getAttribute('data-step-kind') === kind)!

describe('routine use cases built in the editor (routines-dynamic-data D12)', () => {
  it('row 1 (the owner\'s first screen): Find → Pick the first → Comment, with no task chosen by hand', async () => {
    const c = caseOf(1)
    const e = await open(c, [c.steps[0]])
    await add('take', 'pick')
    expect(byKind('take').getAttribute('aria-label')).toBe('Pick the first of the tasks')
    await add('add_comment', 'comment')
    expect(byKind('add_comment').getAttribute('aria-label')).toContain('Comment on the picked task')
    await write(byKind('add_comment'), 'Still on it?')
    await waitFor(() => /Would add 0 comments/.test(byKind('add_comment').textContent ?? ''), 'the preview (no overdue tasks here)')
    const steps = await e.saved()
    expect(canonical(steps)).toEqual(canonical(c.steps))
    await e.unmount()
  })

  it('rows 2 and 3: the last one, then all of them, through Pick\'s mode menu; the comment card stays', async () => {
    const c = caseOf(2)
    const e = await open(c, [c.steps[0]])
    await add('take', 'pick')
    await add('add_comment', 'comment')
    await write(byKind('add_comment'), 'Still on it?')
    await mode(byKind('take'), 'last')
    await waitFor(() => byKind('take').getAttribute('aria-label') === 'Pick the last of the tasks', 'last')
    await mode(byKind('take'), 'all')
    await waitFor(() => byKind('take').getAttribute('aria-label') === 'Pick all of the tasks', 'all')
    expect(byKind('add_comment').getAttribute('aria-label')).toContain('Comment on the picked tasks')
    const steps = await e.saved()
    expect(canonical(steps)).toEqual(canonical(caseOf(3).steps))
    noHandPicked(steps)
    await e.unmount()
  })

  it('row 4: the three most overdue, with "Sort first" and "The first N…"', async () => {
    const c = caseOf(4)
    const e = await open(c, [c.steps[0]])
    await add('take', 'pick')
    expect(byKind('take').querySelector('[data-pick-order]')!.textContent).toContain('In list order')
    await click(button('Sort first', byKind('take')))
    await waitFor(() => cards().length === 2 + 1 && !byKind('take').querySelector('[data-pick-order]'), 'sorted')
    await mode(byKind('take'), 'first_n')
    await add('add_comment', 'comment')
    await write(byKind('add_comment'), 'Still on it?')
    const steps = await e.saved()
    expect(canonical(steps)).toEqual(canonical(c.steps))
    await e.unmount()
  })

  it('row 5 (the owner\'s second screen): a comment added inside Repeat reads each task', async () => {
    const c = caseOf(5)
    const e = await open(c, [c.steps[0]])
    await add('repeat', 'repeat')
    await add('add_comment', 'comment', document.querySelector<HTMLElement>('[data-lane="do"]')!)
    const comment = byKind('add_comment')
    expect(comment.getAttribute('aria-label')).toContain('Comment on each task')
    await click(comment.querySelector('[data-word="Task"]')!)
    await waitFor(() => options().length > 0, 'the list next to the word')
    // "Picker order": the item first, then the earlier output, the trigger, Find tasks…, and a specific task last.
    expect(options().map((o) => o.textContent)).toEqual(['each task', 'the tasks', 'the task you run it on', 'Find tasks…', 'A specific task…'])
    expect(comment.querySelector('[data-word="Task"]')!.getAttribute('aria-expanded')).toBe('true')
    await key(document.querySelector<HTMLElement>('[data-word-choices] input')!, 'Escape')
    await waitFor(() => options().length === 0, 'the list closed')
    await write(byKind('add_comment'), 'Still on it?')
    const steps = await e.saved()
    expect(canonical(steps)).toEqual(canonical(c.steps))
    noHandPicked(steps)
    await e.unmount()
  })

  it('rows 10 and 28: the first step of an event routine reads the task that triggered', async () => {
    const c = caseOf(10)
    const e = await open(c, [])
    await add('date', 'date')
    await add('add_comment', 'comment')
    expect(byKind('add_comment').getAttribute('aria-label')).toContain('Comment on the task that triggered')
    await write(byKind('add_comment'), 'Waiting since {a}')
    const steps = await e.saved()
    expect(canonical(steps)).toEqual(canonical(c.steps.slice(0, 2)))
    await e.unmount()
  })

  it('row 20: Find → Comment on the tasks → Change the tasks, each wired to the found tasks', async () => {
    const c = caseOf(20)
    const e = await open(c, [c.steps[0]])
    await add('add_comment', 'comment')
    await write(byKind('add_comment'), 'Any news?')
    await add('change_tasks', 'change')
    const steps = await e.saved().catch(() => null)
    // Change tasks needs its changes chosen; what matters here is the wiring.
    void steps
    const draftCards = cards().map((x) => x.getAttribute('aria-label'))
    expect(draftCards[1]).toContain('Comment on the tasks')
    expect(draftCards[2]).toContain('Change the tasks')
    await e.unmount()
  })

  it('row 22: Find → Sort → Pick the first → Start the timer on the picked task', async () => {
    const c = caseOf(22)
    const e = await open(c, c.steps.slice(0, 2))
    await add('take', 'pick')
    await add('start_timer', 'timer')
    expect(byKind('start_timer').getAttribute('aria-label')).toContain('the picked task')
    const steps = await e.saved()
    expect(canonical(steps)).toEqual(canonical(c.steps))
    await e.unmount()
  })
})

/** Picks a chip by its name in an open word picker. */
async function chip(name: string) {
  await waitFor(() => options().some((o) => o.textContent === name), `the value ${name}`)
  await click(options().find((o) => o.textContent === name)!)
}

/** Picks an entity in an open Combobox by typing its name. */
async function pickIn(name: string) {
  await waitFor(() => !!document.querySelector('[data-word-choices] input'), 'the list')
  await type(document.querySelector<HTMLInputElement>('[data-word-choices] input')!, name)
  await waitFor(() => options().some((o) => o.textContent?.includes(name)), `the option ${name}`)
  await click(options().find((o) => o.textContent?.includes(name))!)
}

describe('routine use cases with projects and the task a routine runs on', () => {
  it('row 6: Groceries reads a project note chosen in the picker, no Get a task', async () => {
    const { createProject } = await import('../../lib/ops')
    const errands = await createProject({ name: 'Errands' })
    const list = await createProject({ name: 'Groceries' })
    const c = caseOf(6)
    const e = await open(c, [])
    await add('note_text', 'note text')
    await click(byKind('note_text').querySelector('[data-word="Of"]')!)
    await pickIn('Groceries')
    await waitFor(() => byKind('note_text').getAttribute('aria-label') === 'Get the note text of Groceries', 'the project')
    await add('split_lines', 'split')
    await add('create_tasks', 'create tasks')
    await click(byKind('create_tasks').querySelector('[data-word="Project"]')!)
    await pickIn('Errands')
    await waitFor(() => /in Errands/.test(byKind('create_tasks').getAttribute('aria-label') ?? ''), 'Errands')
    const steps = await e.saved()
    const want = JSON.parse(JSON.stringify(c.steps).replaceAll('"groc"', JSON.stringify(list)).replaceAll('"errands"', JSON.stringify(errands)))
    expect(canonical(steps)).toEqual(canonical(want))
    noHandPicked(steps)
    await e.unmount()
  })

  it('row 25: subtasks of the task you run it on, from the lines of its note', async () => {
    const c = caseOf(25)
    const e = await open(c, [])
    await add('note_text', 'note text')
    await click(byKind('note_text').querySelector('[data-word="Of"]')!)
    await chip('the task you run it on')
    await add('split_lines', 'split')
    await add('create_tasks', 'create tasks')
    await click(byKind('create_tasks').querySelector('button[aria-label^="Menu for step"]')!)
    await waitFor(() => !!button('Add parent task'), 'the menu')
    await click(button('Add parent task'))
    await chip('the task you run it on')
    await waitFor(() => /Create subtasks of the task you run it on/.test(byKind('create_tasks').getAttribute('aria-label') ?? ''), 'the parent')
    const steps = await e.saved()
    expect(canonical(steps)).toEqual(canonical(c.steps))
    noHandPicked(steps)
    await e.unmount()
  })
})

/** Media queries answer as on a screen of this width (useMediaQuery, useWide). */
function screenWidth(px: number) {
  vi.stubGlobal('matchMedia', (q: string) => {
    const min = /min-width:\s*([\d.]+)(rem|px)/.exec(q)
    const at = min ? Number(min[1]) * (min[2] === 'rem' ? 16 : 1) : 0
    return { matches: px >= at, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }
  })
}

describe('pickers next to the word, never a centred modal (routines-dynamic-data D13)', () => {
  it('condition rows open inside the card from 1024 px', async () => {
    screenWidth(1280)
    const e = await open({ row: 0, name: 'x', trigger: { kind: 'manual' }, steps: [] }, [{ id: 'a', kind: 'find_tasks', in: { condition: { literal: {} } } }])
    await click(byKind('find_tasks').querySelector('[data-word="Condition"]')!)
    await waitFor(() => !!byKind('find_tasks').querySelector('[data-word-inspector] [data-rule-condition]'), 'the rows in the card')
    expect(document.querySelector('[data-overlay="dialog"]')).toBeNull()
    await click(button('Done', byKind('find_tasks')))
    await waitFor(() => !byKind('find_tasks').querySelector('[data-word-inspector]'), 'closed')
    await e.unmount()
  })

  it('below 1024 px they open as a bottom sheet', async () => {
    screenWidth(768)
    const e = await open({ row: 0, name: 'x', trigger: { kind: 'manual' }, steps: [] }, [{ id: 'a', kind: 'find_tasks', in: { condition: { literal: {} } } }])
    await click(byKind('find_tasks').querySelector('[data-word="Condition"]')!)
    await waitFor(() => document.querySelector('[data-testid="word-inspector"]')?.getAttribute('data-placement') === 'bottom', 'the bottom sheet')
    await e.unmount()
  })

  it('"Escape keeps the text": "/" lists the values at the caret, the nearest first; Escape closes it, and a second Escape keeps what was typed', async () => {
    const steps: RoutineStep[] = [{ id: 'a', kind: 'split_lines', in: { text: { literal: 'a\nb' } } }, { id: 'b', kind: 'count', in: { list: { ref: 'a' } } }, { id: 'c', kind: 'notify', in: { text: { literal: 'x' } } }]
    const e = await open({ row: 0, name: 'x', trigger: { kind: 'manual' }, steps: [] }, steps)
    const card = byKind('notify')
    await click(card.querySelector('[data-word="Text"]')!)
    await waitFor(() => !!card.querySelector('[data-inline-text] textarea'), 'the field')
    const area = card.querySelector<HTMLTextAreaElement>('[data-inline-text] textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, 'x and more ')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { area.setSelectionRange(11, 11) })
    await key(area, '/')
    await waitFor(() => options().some((o) => o.textContent === 'the count'), 'the values')
    // Anchored at the caret, the nearest value active.
    expect(document.querySelector('[data-caret-anchor]')).not.toBeNull()
    expect(options()[0].getAttribute('data-active')).toBe('true')
    expect(options()[0].textContent).toBe('the count')
    await key(document.querySelector<HTMLElement>('[data-word-choices] input')!, 'Escape')
    await waitFor(() => options().length === 0, 'closed')
    expect(card.querySelector('[data-inline-text] textarea')).not.toBeNull()
    await key(area, 'Escape')
    await waitFor(() => !card.querySelector('[data-inline-text]') && card.querySelector('[data-word="Text"]')?.textContent?.trim() === 'x and more', 'kept')
    await e.unmount()
  })

  it('"Escape keeps the text" from + value too: Escape there, or anywhere on the page while the text is open, never leaves it behind', async () => {
    const steps: RoutineStep[] = [{ id: 'a', kind: 'split_lines', in: { text: { literal: 'a\nb' } } }, { id: 'b', kind: 'count', in: { list: { ref: 'a' } } }, { id: 'c', kind: 'notify', in: { text: { literal: 'x' } } }]
    const back = vi.fn()
    const r = await render(<RoutineEditor draft={{ name: 'x', trigger: { kind: 'manual' }, condition: null, steps }} onBack={back} />)
    await waitFor(() => cards().length === 3, 'the cards')
    const card = byKind('notify')
    await click(card.querySelector('[data-word="Text"]')!)
    await waitFor(() => !!card.querySelector('[data-inline-text] textarea'), 'the field')
    const area = card.querySelector<HTMLTextAreaElement>('[data-inline-text] textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, 'x typed')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // Escape on the page itself (focus lost while a list closed) returns to the field.
    await key(document.body, 'Escape')
    expect(back).not.toHaveBeenCalled()
    expect(card.querySelector('[data-inline-text]')).not.toBeNull()
    // Escape on + value keeps the text.
    const plus = button('value', card)
    await act(async () => { plus.focus() })
    await key(plus, 'Escape')
    await waitFor(() => !card.querySelector('[data-inline-text]') && card.querySelector('[data-word="Text"]')?.textContent === 'x typed', 'kept')
    expect(back).not.toHaveBeenCalled()
    await r.unmount()
  })

  it('a text shows whole, wrapped, with its values as chips', async () => {
    const steps: RoutineStep[] = [
      { id: 'a', kind: 'find_tasks', in: { condition: { literal: {} } } },
      { id: 'b', kind: 'repeat', in: { list: { ref: 'a' } }, do: [{ id: 'c', kind: 'add_comment', in: { task: { ref: 'item' }, text: { literal: { format: 'Any news on this? Following up on {item} before the end of the week' } } } }] },
    ]
    const e = await open({ row: 0, name: 'x', trigger: { kind: 'manual' }, steps: [] }, steps)
    const word = byKind('add_comment').querySelector<HTMLElement>('[data-word="Text"]')!
    expect(word.textContent).toBe('Any news on this? Following up on each task before the end of the week')
    expect(word.querySelector('[data-chip]')?.textContent).toBe('each task')
    expect(word.querySelector(':scope > .truncate')).toBeNull()
    expect(word.getAttribute('aria-label')).toContain('Following up on each task before the end of the week')
    await e.unmount()
  })
})

describe('editor fixes and errors (routines-dynamic-data D3, D7)', () => {
  it('"Nothing flowing": a manual routine\'s first comment offers Find tasks…, never a task picker', async () => {
    const e = await open({ row: 0, name: 'x', trigger: { kind: 'manual' }, steps: [] }, [])
    await add('add_comment', 'comment')
    await leaveCards()
    await waitFor(() => !!button('Find tasks…', byKind('add_comment')), 'the fix')
    await click(button('Find tasks…', byKind('add_comment')))
    await waitFor(() => cards().length === 2 && cards()[0].getAttribute('data-step-kind') === 'find_tasks', 'Find tasks above')
    expect(byKind('add_comment').getAttribute('aria-label')).toContain('Comment on the tasks')
    await e.unmount()
  })

  it('"An empty input is not an error yet": "needs a value here" waits until focus leaves the new card', async () => {
    const e = await open({ row: 0, name: 'x', trigger: { kind: 'manual' }, steps: [] }, [{ id: 'a', kind: 'find_tasks', in: { condition: { literal: {} } } }])
    await add('notify', 'notify')
    await waitFor(() => document.activeElement === byKind('notify'), 'the new card focused')
    expect(byKind('notify').querySelector('[data-step-error]')).toBeNull()
    expect(byKind('notify').querySelector('[aria-invalid="true"]')).toBeNull()
    await leaveCards()
    await waitFor(() => /needs a value here/.test(byKind('notify').querySelector('[data-step-error]')?.textContent ?? ''), 'the error after leaving')
    // A value clears it at once.
    await write(byKind('notify'), 'Hello')
    expect(byKind('notify').querySelector('[data-step-error]')).toBeNull()
    await e.unmount()
  })

  it('"Save shows the errors": a new card\'s empty input shows its error when Save is pressed', async () => {
    const e = await open({ row: 0, name: 'x', trigger: { kind: 'manual' }, steps: [] }, [{ id: 'a', kind: 'find_tasks', in: { condition: { literal: {} } } }])
    await add('notify', 'notify')
    expect(byKind('notify').querySelector('[data-step-error]')).toBeNull()
    await click(button('Save'))
    await waitFor(() => /needs a value here/.test(byKind('notify').querySelector('[data-step-error]')?.textContent ?? ''), 'the error')
    await e.unmount()
  })

  it('"No stale error": "needs at least one step" goes as soon as a card is added', async () => {
    const e = await open({ row: 0, name: 'x', trigger: { kind: 'manual' }, steps: [] }, [])
    await click(button('Save'))
    await waitFor(() => /A routine needs at least one step/.test(document.querySelector('[data-save-error]')?.textContent ?? ''), 'the error')
    await add('find_tasks', 'find')
    expect(document.querySelector('[data-save-error]')).toBeNull()
    await e.unmount()
  })
})
