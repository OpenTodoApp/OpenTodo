// @vitest-environment happy-dom
// routines-editor screens: the Routines page (2.1), the sentence cards (2.2),
// pickers and chips (2.3), previews (2.4), fixes (2.5), Add step (2.6),
// unavailable steps (2.7), Test and Save (2.8), the history (2.9) and the
// keyboard and screen-reader names (4.1, 4.2).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createLabel } from '../../lib/labels'
import { createProject, createTask, resetDeviceId, updateProject } from '../../lib/ops'
import { publishEncryption } from '../../lib/e2ee'
import { resetCatalogueCache } from '../../lib/rules/catalogue'
import { createRule } from '../../lib/rules/store'
import { addressOf, canonicalPath, navigate, parseRoute, routePath } from '../router'
import type { RoutineCatalogueEntry, RoutineRun, RoutineStep } from '../../lib/types'
import { click, key, mockFetch, render, type, waitFor } from '../../ui/test-utils'
import { RoutineEditor } from './RoutineEditor'
import { RoutinePage } from './RoutinePage'
import { openRoutineDraft } from './routineNav'
import { RoutinesView } from './RoutinesView'
import { RunDetail } from './RunHistory'

let n = 0
let requests: { method: string; path: string; body?: unknown }[] = []
let status = { enabled: true, paused: false, rules: {} as Record<string, unknown> }
let catalogue: RoutineCatalogueEntry[] = []
let run: RoutineRun | null = null

beforeEach(() => {
  useDatabase(`routines-view-${Date.now()}-${n++}`)
  resetDeviceId()
  requests = []
  status = { enabled: true, paused: false, rules: {} }
  catalogue = []
  run = null
  localStorage.clear()
  resetCatalogueCache()
  publishEncryption({ enabled: false })
  mockFetch((method, path, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ method, path, body })
    if (path === '/api/v1/me/rules') return status
    if (path === '/api/v1/me/rules/catalogue') return { steps: catalogue }
    if (path === '/api/v1/me/rules/runs') return { runs: run ? [run] : [] }
    if (path === '/api/v1/rules/test') return { run: { outcome: 'applied', failed_step: -1 }, steps: [], writes: 2, test: true }
    if (/\/api\/v1\/rules\/[^/]+\/runs\/[^/]+\/undo$/.test(path)) return { restored: 10, kept: 1, not_undoable: [] }
    if (/\/api\/v1\/rules\/[^/]+\/runs\/[^/]+$/.test(path)) return run
    if (/\/api\/v1\/rules\/[^/]+\/run$/.test(path)) return { run: { run_id: 'r9', outcome: 'applied', failed_step: -1, writes: 2 }, steps: [], writes: 2, test: !!body?.test }
    if (path === '/api/v1/webhooks') return { webhooks: [], events: [] }
    if (path === '/api/v1/me') return { user: { id: 'u1' }, mfa: {} }
    return {}
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const rows = () => [...document.querySelectorAll<HTMLElement>('[data-rule-row]')]
const cards = () => [...document.querySelectorAll<HTMLElement>('[data-step-card]')]
const button = (text: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!
const editorText = () => document.querySelector('[data-testid="routine-editor"]')?.textContent ?? ''

// Groceries reads a project's note, chosen in the picker: no task chosen by hand (routines-dynamic-data).
async function groceries(): Promise<{ id: string; project: string; list: string }> {
  const project = await createProject({ name: 'Errands' })
  const list = await createProject({ name: 'Groceries' })
  await updateProject(list, { description: ['- oat milk', '- bread', '- eggs', '- apples', '- rice', '- tea', '- soap'].join('\n') })
  const steps: RoutineStep[] = [
    { id: 'a', kind: 'note_text', in: { of: { literal: { project: list } } } },
    { id: 'b', kind: 'split_lines', in: { text: { ref: 'a' } } },
    { id: 'c', kind: 'create_tasks', in: { text: { ref: 'b' }, project: { literal: { project } } } },
  ]
  const id = await createRule({ name: 'Groceries', trigger: { kind: 'schedule', at: '17:00', weekdays: [5] }, actions: null, steps })
  return { id, project, list }
}

describe('Routines page', () => {
  it('"Old address": /rules opens /routines, and a run link keeps its routine', () => {
    expect(canonicalPath('/rules')).toBe('/routines')
    expect(parseRoute('/routines/r1?run=x9')).toEqual({ view: 'rules', id: 'r1', run: 'x9' })
    expect(routePath({ view: 'rules', tab: 'runs' })).toBe('/routines/runs')
    // The editor page (routines-editor-page D1).
    expect(parseRoute('/routines/new')).toEqual({ view: 'rules', create: true })
    expect(parseRoute('/routines#new')).toEqual({ view: 'rules', create: true })
    expect(routePath({ view: 'rules', create: true })).toBe('/routines/new')
    expect(canonicalPath('/rules/r1')).toBe('/routines/r1')
    expect(addressOf({ pathname: '/routines/r1', search: '?run=x9' })).toBe('/routines/r1?run=x9')
    expect(addressOf({ pathname: '/routines', search: '?x=1' })).toBe('/routines')
  })

  it('"Reading the list" and "A routine\'s row": the line, the counts, Run now and the switch', async () => {
    const waiting = await createLabel({ name: 'waiting' })
    const legacy = await createRule({ name: 'Waiting', trigger: { kind: 'label.added', label_id: waiting }, actions: { priority: 3 } })
    const { id } = await groceries()
    status.rules[legacy] = { last_run: Date.UTC(2026, 9, 20, 9), runs_7d: 14 }
    status.rules[id] = { last_run: Date.UTC(2026, 9, 30, 17), runs_7d: 1 }
    const r = await render(<RoutinesView />)
    await waitFor(() => rows().length === 2 && /14 runs this week/.test(rows()[0].textContent ?? '') && /When label waiting is added → priority 3/.test(rows()[0].textContent ?? ''), 'the legacy row')
    await waitFor(() => /→ get the note text of Groceries, split the note text into lines, create tasks from the lines in Errands/.test(rows()[1].textContent ?? ''), 'the routine row')
    expect(rows()[1].textContent).toContain('1 run this week')
    expect(rows()[1].querySelector('[aria-label="Run now: Groceries"]')).not.toBeNull()
    await click(rows()[0].querySelector('[role="switch"]')!)
    await waitFor(() => rows()[0].querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'false', 'the rule off')
    await r.unmount()
  })

  it('"Provider removed": the row says how many steps are not available', async () => {
    const digest = await createRule({ name: 'Digest', trigger: { kind: 'manual' }, actions: null, steps: [{ id: 'a', kind: 'email_me', in: { subject: { literal: 'Hi' }, text: { literal: 'x' } } }] })
    catalogue = [{ kind: 'email_me', group: 'communication', available: false, reason: 'email_not_configured', setting: 'server.email' }]
    const r = await render(<RoutinesView />)
    await waitFor(() => /1 step not available/.test(rows()[0]?.textContent ?? ''), 'the count')
    await click(rows()[0].querySelector('button[data-edit-routine]')!)
    expect(location.pathname).toBe(`/routines/${digest}`)
    await r.unmount()
    const page = await render(<RoutinePage route={{ view: 'rules', id: digest }} />)
    await waitFor(() => /Not available: outgoing email is not set up on this server/.test(editorText()), 'the badge')
    expect(document.querySelector<HTMLAnchorElement>('[data-unavailable] a')!.getAttribute('href')).toBe('/settings/server')
    await page.unmount()
  })

  it('offline: routines are listed and the runs need a connection', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await createRule({ name: 'A', trigger: { kind: 'task.created' }, actions: { priority: 1 } })
    const r = await render(<RoutinesView />)
    await waitFor(() => rows().length === 1, 'the row')
    expect(document.body.textContent).toContain('run on the server after the next sync')
    await r.unmount()
  })
})

describe('Routine editor', () => {
  it('"Reading a routine": one card per step in order, and the screen-reader names', async () => {
    const { id } = await groceries()
    const rule = (await db.rules.get(id))!
    const r = await render(<RoutineEditor rule={rule} onBack={() => {}} />)
    await waitFor(() => cards().length === 3 && cards()[2].getAttribute('aria-label') === 'Create tasks from the lines in Errands', 'three cards')
    expect(document.querySelector('[data-when-card]')!.textContent).toContain('Friday at 17:00')
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual([
      'Get the note text of Groceries', 'Split the note text into lines', 'Create tasks from the lines in Errands'])
    // "Screen reader": the project word of Create tasks.
    expect(cards()[2].querySelector('[data-word="Project"]')!.getAttribute('aria-label')).toBe('Project: Errands, change')
    await r.unmount()
  })

  it('"Preview offline": the split lines are previewed from local data, five and "+ 2 more"', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { id } = await groceries()
    const r = await render(<RoutineEditor rule={(await db.rules.get(id))!} onBack={() => {}} />)
    await waitFor(() => /\+ 2 more/.test(cards()[1]?.textContent ?? ''), 'the preview')
    expect(cards()[1].textContent).toContain('oat milk')
    expect(cards()[2].textContent).toContain('Would create 7 tasks in Errands')
    expect(requests.some((q) => q.path === '/api/v1/rules/test')).toBe(false)
    await r.unmount()
  })

  it('"An old rule": a When card and a Change tasks card, and saving unchanged writes nothing', async () => {
    const id = await createRule({ name: 'Waiting', trigger: { kind: 'task.created' }, actions: { priority: 3 } })
    const before = await db.outbox.count()
    const done = vi.fn()
    const r = await render(<RoutineEditor rule={(await db.rules.get(id))!} onBack={() => {}} onSaved={done} />)
    await waitFor(() => cards().length === 1 && !!document.querySelector('[data-when-card]'), 'the cards')
    expect(cards()[0].getAttribute('data-step-kind')).toBe('change_tasks')
    expect(document.querySelector('[data-unsaved]')).toBeNull()
    await click(button('Save'))
    expect(done).not.toHaveBeenCalled()
    expect(await db.outbox.count()).toBe(before)
    await r.unmount()
  })

  it('"Saved offline": a Count step added through Add step is saved as ops', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { id } = await groceries()
    const done = vi.fn()
    const r = await render(<RoutineEditor rule={(await db.rules.get(id))!} onBack={() => {}} onSaved={done} />)
    await waitFor(() => cards().length === 3, 'the cards')
    await click(document.querySelector('[data-add-step]')!)
    await waitFor(() => !!document.querySelector('[data-testid="add-step"]'), 'the sheet')
    // "Suggestions after lines" is the list after Split; here the step above is Create tasks.
    await type(document.querySelector<HTMLInputElement>('[data-testid="add-step"] input')!, 'count')
    await click(document.querySelector('[data-add-kind="count"] button')!)
    await waitFor(() => cards().length === 4, 'the new card')
    await click(button('Save'))
    await waitFor(() => done.mock.calls.length === 1, 'saved')
    const saved = await db.rules.get(id)
    expect(saved!.steps!.map((s) => s.kind)).toEqual(['note_text', 'split_lines', 'create_tasks', 'count'])
    expect(saved!.steps![3].in).toEqual({ list: { ref: 'c' } })
    await r.unmount()
  })

  it('"Suggestions after lines" and "Search for an unavailable step"', async () => {
    catalogue = [{ kind: 'email_me', group: 'communication', available: false, reason: 'email_not_configured', setting: 'server.email' }]
    const r = await render(<RoutineEditor draft={{ name: 'x', trigger: { kind: 'manual' }, condition: null, steps: [{ id: 'a', kind: 'split_lines', in: { text: { literal: 'a' } } }] }} onBack={() => {}} />)
    await waitFor(() => cards().length === 1, 'the card')
    await click(document.querySelector('[data-add-step]')!)
    await waitFor(() => !!document.querySelector('[data-add-suggested]'), 'the suggestions')
    await waitFor(() => localStorage.getItem('routines.catalogue') !== null, 'the catalogue')
    const suggested = [...document.querySelectorAll('[data-add-suggested] [data-add-kind]')].map((x) => x.getAttribute('data-add-kind'))
    expect(suggested).toEqual(['create_tasks', 'take', 'count', 'join', 'sort', 'append_to_note'])
    expect(document.querySelector('[data-add-group="communication"] [data-add-kind="email_me"]')).toBeNull()
    await type(document.querySelector<HTMLInputElement>('[data-testid="add-step"] input')!, 'mail')
    await waitFor(() => !!document.querySelector('[data-add-results] [data-add-kind="email_me"][data-unavailable]'), 'the dimmed result')
    expect(document.querySelector('[data-add-results] [data-add-kind="email_me"]')!.textContent).toContain('Set up email to use this')
    await r.unmount()
  })

  it('"Fix in one tap" and "Removed step": errors on the card, a fix, and Save blocked', async () => {
    const steps: RoutineStep[] = [
      { id: 'a', kind: 'find_tasks', in: { condition: { literal: { due: 'today' } } } },
      { id: 'b', kind: 'notify', in: { text: { ref: 'a' } } },
    ]
    const r = await render(<RoutineEditor draft={{ name: 'Due today', trigger: { kind: 'manual' }, condition: null, steps }} onBack={() => {}} />)
    await waitFor(() => /Notify me expects Text, got Tasks/.test(cards()[1]?.textContent ?? ''), 'the error')
    await click(button('Save'))
    await waitFor(() => /Fix step 2 first/.test(document.querySelector('[data-save-error]')?.textContent ?? ''), 'save blocked')
    await click(button('Insert Format text', cards()[1]))
    await waitFor(() => cards().length === 3 && !document.querySelector('[data-step-error]'), 'fixed')
    // Ctrl+Z takes the fix back as one edit.
    await key(document.querySelector('[data-routine-editor]')!, 'z', { ctrlKey: true })
    await waitFor(() => cards().length === 2, 'undone')
    await r.unmount()
  })

  it('"Keyboard only": Alt+↑ moves the focused card, focus stays, the move is announced', async () => {
    const steps: RoutineStep[] = [
      { id: 'a', kind: 'split_lines', in: { text: { literal: 'a\nb' } } },
      { id: 'b', kind: 'join', in: { lines: { ref: 'a' } } },
      { id: 'c', kind: 'count', in: { list: { ref: 'a' } } },
    ]
    const r = await render(<RoutineEditor draft={{ name: 'x', trigger: { kind: 'manual' }, condition: null, steps }} onBack={() => {}} />)
    await waitFor(() => cards().length === 3, 'the cards')
    const count = cards()[2]
    count.focus()
    await key(count, 'ArrowUp', { altKey: true })
    await waitFor(() => cards()[1].getAttribute('data-step-card') === 'c', 'moved')
    await waitFor(() => document.activeElement?.getAttribute('data-step-card') === 'c', 'focus kept')
    expect(document.querySelector('[data-announce]')!.textContent).toBe('Moved up: Count')
    await r.unmount()
  })

  it('"A chip from an earlier step": the text of Notify me is edited in the card, and + value inserts the count', async () => {
    const steps: RoutineStep[] = [
      { id: 'a', kind: 'split_lines', in: { text: { literal: 'a\nb' } } },
      { id: 'b', kind: 'count', in: { list: { ref: 'a' } } },
      { id: 'c', kind: 'notify', in: { text: { literal: 'x' } } },
    ]
    const r = await render(<RoutineEditor draft={{ name: 'x', trigger: { kind: 'manual' }, condition: null, steps }} onBack={() => {}} />)
    await waitFor(() => cards().length === 3, 'the cards')
    await click(cards()[2].querySelector('[data-word="Text"]')!)
    // "Text in place": no dialog; the field sits in the card.
    await waitFor(() => !!cards()[2].querySelector('[data-inline-text] textarea'), 'the field in the card')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await click(button('value', cards()[2]))
    await waitFor(() => [...document.querySelectorAll('[data-word-choices] [role="option"]')].some((o) => o.textContent === 'the count'), 'the values')
    await click([...document.querySelectorAll<HTMLElement>('[data-word-choices] [role="option"]')].find((o) => o.textContent === 'the count')!)
    await waitFor(() => /«the count»/.test(cards()[2].querySelector<HTMLTextAreaElement>('[data-inline-text] textarea')?.value ?? ''), 'the chip in the field')
    await key(cards()[2].querySelector('[data-inline-text] textarea')!, 'Enter')
    await waitFor(() => /«the count»/.test(cards()[2].querySelector('[data-word="Text"]')?.textContent ?? ''), 'the chip in the text')
    await r.unmount()
  })

  it('"Only fitting outputs": the count first, the tasks under Needs conversion, in a list next to the word', async () => {
    const steps: RoutineStep[] = [
      { id: 'a', kind: 'find_tasks', in: { condition: { literal: {} } } },
      { id: 'b', kind: 'count', in: { list: { ref: 'a' } } },
      { id: 'c', kind: 'create_tasks', in: { title: { literal: 'x' }, priority: { literal: 4 } } },
    ]
    const r = await render(<RoutineEditor draft={{ name: 'x', trigger: { kind: 'manual' }, condition: null, steps }} onBack={() => {}} />)
    await waitFor(() => cards().length === 3, 'the cards')
    await click(cards()[2].querySelector('[data-word="Priority"]')!)
    const opts = () => [...document.querySelectorAll<HTMLElement>('[data-word-choices] [role="option"]')]
    await waitFor(() => opts().length > 0, 'the list')
    expect(document.querySelector('[data-overlay="popover"], [data-overlay="sheet"]')).not.toBeNull()
    expect(opts()[0].textContent).toBe('the count')
    expect(opts()[1].textContent).toContain('the tasks')
    expect(opts()[1].textContent).toContain('Insert Count')
    expect(document.querySelector('[data-word-footer] input[type="number"]')).not.toBeNull()
    await r.unmount()
  })

  it('"Test a routine": the test result is shown and nothing is written', async () => {
    const { id } = await groceries()
    const before = await db.tasks.count()
    const r = await render(<RoutineEditor rule={(await db.rules.get(id))!} onBack={() => {}} />)
    await waitFor(() => cards().length === 3, 'the cards')
    await click(button('Test'))
    await waitFor(() => !!document.querySelector('[data-test-result]'), 'the result')
    expect(requests.some((q) => q.path === `/api/v1/rules/${id}/run` && (q.body as { test: boolean }).test)).toBe(true)
    expect(document.querySelector('[data-announce]')!.textContent).toContain('nothing was written')
    expect(await db.tasks.count()).toBe(before)
    await r.unmount()
  })
})

describe('Routine editor page', () => {
  const nameInput = () => document.querySelector<HTMLInputElement>('[data-routine-name]')!

  it('"From a link": the breadcrumb, the cards and focus on the heading', async () => {
    const { id } = await groceries()
    const r = await render(<RoutinePage route={{ view: 'rules', id }} />)
    await waitFor(() => cards().length === 3, 'the cards')
    expect(document.querySelector('[data-breadcrumb]')!.textContent).toBe('RoutinesGroceries')
    expect(document.activeElement?.hasAttribute('data-page-title')).toBe(true)
    expect(document.querySelector('[data-unsaved]')).toBeNull()
    await r.unmount()
  })

  it('"Unsaved changes": leaving asks first; Cancel stays, Discard goes', async () => {
    const { id } = await groceries()
    navigate({ view: 'rules', id })
    const r = await render(<RoutinePage route={{ view: 'rules', id }} />)
    await waitFor(() => cards().length === 3, 'the cards')
    await type(nameInput(), 'Groceries for the week')
    await waitFor(() => !!document.querySelector('[data-unsaved]'), 'the indicator')
    await click(document.querySelector('[data-crumb="routines"]')!)
    await waitFor(() => /Discard your changes\?/.test(document.body.textContent ?? ''), 'the question')
    expect(location.pathname).toBe(`/routines/${id}`)
    await click(button('Cancel'))
    expect(nameInput().value).toBe('Groceries for the week')
    await click(document.querySelector('[data-crumb="routines"]')!)
    await waitFor(() => !!button('Discard'), 'asked again')
    await click(button('Discard'))
    await waitFor(() => location.pathname === '/routines', 'left')
    await r.unmount()
  })

  it('"Save a new routine": Ctrl+S saves, the address moves to its id, Run now and History appear', async () => {
    // A view's rule handed to the page (D1): one Change tasks card.
    openRoutineDraft({ name: '', trigger: { kind: 'task.created' }, condition: null, actions: { priority: 1 } })
    const r = await render(<RoutinePage route={{ view: 'rules', create: true }} />)
    await waitFor(() => cards().length === 1, 'the draft')
    // "Stale save message": the error goes with the next edit.
    await key(nameInput(), 's', { ctrlKey: true })
    await waitFor(() => /A routine needs a name/.test(document.querySelector('[data-save-error]')?.textContent ?? ''), 'no name yet')
    await type(nameInput(), 'Ping')
    expect(document.querySelector('[data-save-error]')).toBeNull()
    const press = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
    nameInput().dispatchEvent(press)
    expect(press.defaultPrevented).toBe(true)
    await waitFor(() => !!document.querySelector('[data-save-error]') || location.pathname !== '/routines/new', 'saved or refused')
    expect(document.querySelector('[data-save-error]')?.textContent ?? '').toBe('')
    await waitFor(() => /^\/routines\/[\w-]{36}$/.test(location.pathname), 'the new address')
    const id = location.pathname.split('/')[2]
    expect((await db.rules.get(id))!.name).toBe('Ping')
    expect((await db.rules.get(id))!.actions).toEqual({ priority: 1 })
    await waitFor(() => document.querySelector('[data-unsaved]') === null && !!button('Run now'), 'saved')
    await r.unmount()
  })

  it('"A run from the Runs tab": a live routine\'s run opens on its page', async () => {
    const { id } = await groceries()
    run = { id: 1, run_id: 'x1', rule_id: id, at: Date.UTC(2026, 9, 25, 7), outcome: 'applied', source: 'schedule', run_as: 'u1', test: false, steps_count: 4, writes: 7, duration_ms: 40, undone_at: null, failed_step: -1 }
    const r = await render(<RoutinesView route={{ view: 'rules', tab: 'runs' }} />)
    await waitFor(() => document.querySelectorAll('[data-run]').length === 1 && !!document.querySelector(`option[value="${id}"]`), 'the run')
    await click(document.querySelector('[data-run] button')!)
    expect(location.pathname + location.search).toBe(`/routines/${id}?run=x1`)
    await r.unmount()
    const page = await render(<RoutinePage route={parseRoute(`/routines/${id}?run=x1`) as Extract<ReturnType<typeof parseRoute>, { view: 'rules' }>} />)
    await waitFor(() => !!document.querySelector('[data-run-detail="x1"]') && !!document.querySelector('[data-runs-back]'), 'the detail inline')
    expect(document.querySelector('[data-testid="run-detail"]')).toBeNull()
    await page.unmount()
  })
})

describe('Run history', () => {
  it('"Run detail" and "Undo from the detail"', async () => {
    const id = await createRule({ name: 'Weekly digest', trigger: { kind: 'manual' }, actions: null, steps: [
      { id: 'a', kind: 'find_tasks', in: { condition: { literal: {} } } },
      { id: 'b', kind: 'count', in: { list: { ref: 'a' } } },
      { id: 'c', kind: 'email_me', in: { subject: { literal: 'Digest' }, text: { literal: 'x' } } },
      { id: 'd', kind: 'notify', in: { text: { literal: 'x' } } },
    ] })
    const task = await createTask({ title: 'Water plants' })
    run = { id: 1, run_id: 'x1', rule_id: id, at: Date.UTC(2026, 9, 25, 7), outcome: 'failed', source: 'schedule', run_as: 'u1', test: false, steps_count: 4, writes: 11, duration_ms: 40, undone_at: null, failed_step: 2,
      steps: [
        { index: 0, step_id: 'a', kind: 'find_tasks', status: 'ok', duration_ms: 3, items: 2, output: 'tasks', ids: [task, 'gone-1'] },
        { index: 1, step_id: 'b', kind: 'count', status: 'ok', duration_ms: 1, items: 1, output: 'number', ids: [] },
        { index: 2, step_id: 'c', kind: 'email_me', status: 'unavailable', duration_ms: 0, items: 0, output: 'none', ids: [], error: 'email_not_configured' },
      ] }
    const rule = (await db.rules.get(id))!
    const r = await render(<RunDetail rule={rule} runId="x1" onClose={() => {}} />)
    await waitFor(() => document.querySelectorAll('[data-run-step]').length === 4, 'the steps')
    const steps = [...document.querySelectorAll('[data-run-step]')].map((x) => x.getAttribute('data-run-step'))
    expect(steps).toEqual(['ok', 'ok', 'unavailable', 'not_run'])
    expect(document.body.textContent).toContain('Not available: outgoing email is not set up on this server')
    expect(document.body.textContent).toContain('Failed at step 3')
    await waitFor(() => /Water plants/.test(document.querySelector('[data-run-step="ok"]')!.textContent ?? ''), 'the title')
    expect(document.querySelector('[data-run-step="ok"]')!.textContent).toContain('Deleted task')
    await click(button('Undo run'))
    await waitFor(() => /10 restored, 1 kept because they changed after the run/.test(document.body.textContent ?? ''), 'the answer')
    await r.unmount()
  })

  it('"Offline history": the last fetched page with its age', async () => {
    const id = await createRule({ name: 'A', trigger: { kind: 'manual' }, actions: null, steps: [{ id: 'a', kind: 'notify', in: { text: { literal: 'x' } } }] })
    localStorage.setItem('routines.runs.all', JSON.stringify({ at: Date.now() - 2 * 3600_000, runs: [{ id: 1, run_id: 'x', rule_id: id, at: 1, outcome: 'applied', source: 'schedule', run_as: 'u1', test: false, steps_count: 1, writes: 1, duration_ms: 3, undone_at: null, failed_step: -1 }] }))
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const r = await render(<RoutinesView route={{ view: 'rules', tab: 'runs' }} />)
    await waitFor(() => /Updated 2 h ago/.test(document.body.textContent ?? ''), 'the age')
    expect(document.querySelectorAll('[data-run]').length).toBe(1)
    await r.unmount()
  })
})
