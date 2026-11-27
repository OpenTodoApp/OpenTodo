// @vitest-environment happy-dom
// The floating add button and the quick add sheet (OpenSpec change ux-overhaul,
// app-shell "Add from anywhere"): a bottom sheet with its field focused, the
// view's defaults applied, keyboard-safe (the sheet sits above the on-screen
// keyboard through --vv-bottom), and the list visible behind it.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { addDaysISO, quickChoices, todayISO } from '../lib/dates'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { createSection, saveViewMode } from '../lib/sections'
import { bulkToast } from './bulk/toastStore'
import { listState } from './listActions'
import { resetPanel } from './panel'
import type { User } from '../lib/types'
import { act } from 'react'
import { click, key, render, type, minWidthPx, waitFor } from '../ui/test-utils'
import { navigate } from './router'
import { Shell } from './Shell'
import { setPhoneUiEnabled } from '../phone/prefs'

// Default to the earlier layout; the contextual-capture regressions below exercise both phone layouts.
beforeEach(() => setPhoneUiEnabled(false))

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const original = window.matchMedia
let width = 390

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  width = 390
  // A phone by default; the desktop regression sets width to 1280.
  window.matchMedia = ((q: string) => ({
    matches: minWidthPx(q) <= width, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { window.matchMedia = original; vi.unstubAllGlobals() })

const sheet = () => document.querySelector('[data-overlay="sheet"]')
const field = () => document.querySelector<HTMLTextAreaElement>('[data-quick-add-sheet] textarea[aria-label="Add a task"]')

describe('the add button', () => {
  it('opens quick add as a bottom sheet with the field focused, and the Upcoming default date applied', async () => {
    navigate({ view: 'upcoming' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-add-button]'), 'the add button')
    const button = document.querySelector<HTMLButtonElement>('[data-add-button]')!
    expect(button.getAttribute('aria-expanded')).toBe('false')
    await click(button)
    await waitFor(() => !!sheet() && !!field())
    await waitFor(() => document.activeElement === field(), 'the field focused')
    // Keyboard-safe: the sheet is bottom-anchored on the visual viewport, and the list stays behind it.
    expect((sheet() as HTMLElement).style.bottom).toContain('--vv-bottom')
    expect(document.querySelector('[data-list-page]')).toBeTruthy()
    // The bar and the button make room for the sheet.
    expect(document.querySelector('[data-tab-bar]')).toBeNull()

    await type(field()!, 'Call the plumber')
    await act(async () => { field()!.form!.requestSubmit() })
    await waitFor(async () => (await db.tasks.count()) === 1, 'the task')
    const tomorrow = new Date(todayISO())
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tasks = await db.tasks.toArray()
    expect(tasks.map((t) => [t.title, t.due?.date])).toEqual([['Call the plumber', tomorrow.toISOString().slice(0, 10)]])
    await r.unmount()
  })

  // #1038 (quick-add-keep-adding): the sheet stays open, empty and focused, for the next task.
  it('stays open after an add, with the field empty and focused, until it is closed', async () => {
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-add-button]'), 'the add button')
    await click(document.querySelector<HTMLButtonElement>('[data-add-button]')!)
    await waitFor(() => !!field())
    await type(field()!, 'Buy milk')
    await click(document.querySelector('[data-sheet-send]')!)
    await waitFor(async () => (await db.tasks.count()) === 1, 'the first task')
    await waitFor(() => field()?.value === '', 'the field cleared')
    expect(sheet()).toBeTruthy()
    expect(document.activeElement).toBe(field())
    await waitFor(() => document.querySelector('[data-sheet-added]')!.textContent === 'Added', 'the announcement')

    await type(field()!, 'Buy bread')
    await act(async () => { field()!.form!.requestSubmit() })
    await waitFor(async () => (await db.tasks.count()) === 2, 'the second task')
    expect((await db.tasks.orderBy('position').toArray()).map((t) => t.title)).toEqual(['Buy milk', 'Buy bread'])
    expect(sheet()).toBeTruthy()

    await key(field()!, 'Escape')
    await waitFor(() => !sheet())
    await r.unmount()
  })

  it('in a project the new task lands in that project; Escape closes the sheet', async () => {
    const { createProject } = await import('../lib/ops')
    const pid = await createProject({ name: 'Garden' })
    navigate({ view: 'project', id: pid })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-add-button]'), 'the add button')
    await click(document.querySelector<HTMLButtonElement>('[data-add-button]')!)
    await waitFor(() => !!field())
    await type(field()!, 'Mow the lawn')
    await act(async () => { field()!.form!.requestSubmit() })
    await waitFor(async () => (await db.tasks.count()) === 1, 'the task')
    expect((await db.tasks.toArray()).map((t) => t.project_id)).toEqual([pid])
    await key(field()!, 'Escape')
    await waitFor(() => !sheet())
    expect(document.querySelector('[data-add-button]')!.getAttribute('aria-expanded')).toBe('false')
    await r.unmount()
  })
})

describe('chips and tools (palette-quick-add D7; natural-language-capture "Quick add tools on a phone")', () => {
  async function openSheet() {
    navigate({ view: 'today' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-add-button]'), 'the add button')
    await click(document.querySelector<HTMLButtonElement>('[data-add-button]')!)
    await waitFor(() => !!field())
    return r
  }

  it('the project tool starts `#` at the end, keeps the field focused and opens the suggestions', async () => {
    const { createProject } = await import('../lib/ops')
    await createProject({ name: 'Home renovation' })
    const r = await openSheet()
    await type(field()!, 'Buy primer')
    // The tools keep focus in the field: they cancel the mouse down.
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    document.querySelector('[data-sheet-tool="project"]')!.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    await click(document.querySelector('[data-sheet-tool="project"]')!)
    await waitFor(() => field()!.value === 'Buy primer #', 'the # token')
    expect(document.activeElement).toBe(field())
    await waitFor(() => !!document.querySelector('[data-token-suggestions="project"]'))
    await r.unmount()
  })

  it('chips for what is understood, a dashed placeholder for the label, and send adds like Enter', async () => {
    const { createProject } = await import('../lib/ops')
    const pid = await createProject({ name: 'Home renovation' })
    const r = await openSheet()
    await type(field()!, 'Call Mia about the tiles tomorrow 5pm #HomeRenovation')
    await waitFor(() => !!document.querySelector('[data-sheet-chip="project"]'))
    expect(document.querySelector('[data-sheet-chip="due"]')!.textContent).toContain('17:00')
    expect(document.querySelector('[data-sheet-chip="project"]')!.textContent).toContain('Home renovation')
    expect(document.querySelector('[data-sheet-placeholder="label"]')).toBeTruthy()
    expect(document.querySelector('[data-sheet-placeholder="project"]')).toBeNull()
    // The placeholder repeats the toolbar's Label, so a screen reader does not meet it twice.
    expect(document.querySelector('[data-sheet-placeholder="label"]')!.getAttribute('aria-hidden')).toBe('true')
    expect(document.querySelector('[data-sheet-tool="label"]')!.getAttribute('aria-label')).toBe('Label')
    await click(document.querySelector('[data-sheet-send]')!)
    await waitFor(async () => (await db.tasks.count()) === 1, 'the task')
    expect((await db.tasks.toArray()).map((t) => [t.title, t.project_id, t.due?.time])).toEqual([['Call Mia about the tiles', pid, '17:00']])
    await r.unmount()
  })

  // #1035 (quick-add-notes D2): a phone has no Shift+Enter, so the tool row opens the notes.
  it('the Notes tool opens a notes field with the caret in it, and send saves them as the task notes', async () => {
    const r = await openSheet()
    await type(field()!, 'Read the article')
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    document.querySelector('[data-sheet-tool="notes"]')!.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    await click(document.querySelector('[data-sheet-tool="notes"]')!)
    const notes = () => document.querySelector<HTMLTextAreaElement>('[data-quick-add-sheet] textarea[aria-label="Notes"]')
    await waitFor(() => !!notes(), 'the notes field')
    expect(document.activeElement).toBe(notes())
    expect(document.querySelector('[data-sheet-tool="notes"]')!.getAttribute('aria-pressed')).toBe('true')
    await type(notes()!, 'https://example.com/article')
    await click(document.querySelector('[data-sheet-send]')!)
    await waitFor(async () => (await db.tasks.count()) === 1, 'the task')
    expect((await db.tasks.toArray()).map((t) => [t.title, t.description])).toEqual([['Read the article', 'https://example.com/article']])
    await r.unmount()
  })

  // #1624 (phone-quickadd-date-picker): the date tool opens a picker that writes the date into the line.
  it('the date tool opens a picker; a pick writes the date into the line as words, and send adds it', async () => {
    const r = await openSheet()
    await type(field()!, 'Call the plumber')
    const tool = () => document.querySelector<HTMLButtonElement>('[data-sheet-tool="when"]')!
    expect(tool().getAttribute('aria-expanded')).toBe('false')
    await click(tool())
    await waitFor(() => !!document.querySelector('[data-line-date-picker]'), 'the picker')
    expect(tool().getAttribute('aria-expanded')).toBe('true')
    // Its taps keep the focus, and the keyboard, in the line.
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    document.querySelector('[data-choice="tomorrow"]')!.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    await click(document.querySelector('[data-choice="tomorrow"]')!)
    await waitFor(() => field()!.value === 'Call the plumber tomorrow', 'the date in the line')
    await click(document.querySelector('[data-time="17:00"]')!)
    await waitFor(() => field()!.value === 'Call the plumber tomorrow 17:00', 'the time in the line')
    expect(document.querySelector('[data-sheet-chip="due"]')!.textContent).toContain('17:00')
    await waitFor(() => document.activeElement === field(), 'the field focused')
    await click(document.querySelector('[data-sheet-send]')!)
    await waitFor(async () => (await db.tasks.count()) === 1, 'the task')
    const tomorrow = quickChoices('due').find((c) => c.id === 'tomorrow')!.date
    expect((await db.tasks.toArray()).map((t) => [t.title, t.due])).toEqual([['Call the plumber', { date: tomorrow, time: '17:00' }]])
    // The line is empty for the next task, and the picker has closed with it.
    await waitFor(() => !document.querySelector('[data-line-date-picker]'), 'the picker closed')
    await r.unmount()
  })

  it('a pick replaces the line date rather than adding a second; Clear removes it', async () => {
    const r = await openSheet()
    await type(field()!, 'Call the plumber tomorrow')
    await click(document.querySelector('[data-sheet-tool="when"]')!)
    await waitFor(() => !!document.querySelector('[data-line-date-picker]'), 'the picker')
    expect(document.querySelector('[data-choice="tomorrow"]')!.getAttribute('aria-checked')).toBe('true')
    // A day from the month, three days on: the line's "tomorrow" is replaced by its words.
    const later = addDaysISO(todayISO(), 3)
    await click(document.querySelector(`[data-line-date-picker] [data-date="${later}"]`)!)
    await waitFor(() => !field()!.value.includes('tomorrow'), 'tomorrow replaced')
    expect(field()!.value.startsWith('Call the plumber ')).toBe(true)
    await waitFor(() => document.querySelector('[data-sheet-chip="due"]') !== null, 'the date chip')
    expect(document.querySelectorAll('[data-sheet-chip="due"]')).toHaveLength(1)
    await click(document.querySelector('[data-line-date-clear]')!)
    await waitFor(() => field()!.value === 'Call the plumber', 'the date removed')
    expect(document.querySelector('[data-sheet-chip="due"]')).toBeNull()
    await r.unmount()
  })
})

// #2105: section and board capture share the existing sheet.
describe('phone task capture', () => {
  beforeEach(() => { localStorage.clear(); resetPanel() })
  afterEach(resetPanel)
  const tasks = async () => (await db.tasks.toArray()).filter((t) => !t.deleted_at && t.title !== 'Existing')

  async function project(board = false) {
    const id = await createProject({ name: 'Work' })
    const section = await createSection(id, 'Doing')
    await createTask({ title: 'Existing', project_id: id })
    if (board) await saveViewMode(id, 'board')
    navigate({ view: 'project', id })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector(`[data-section-heading="${section}"]`), 'the section')
    return { ...r, id, section }
  }
  async function openSection(section: string) {
    const button = document.querySelector<HTMLButtonElement>(`[data-section-heading="${section}"] button[aria-label="Add a task to Doing"]`)!
    await click(button)
    await waitFor(() => !!field(), 'the shared sheet')
    return button
  }
  async function add(title: string, count: number) {
    await type(field()!, title)
    await click(document.querySelector('[data-sheet-send]')!)
    await waitFor(async () => (await tasks()).length === count, 'the saved task')
    await waitFor(() => field()?.value === '', 'ready for the next task')
  }

  for (const phoneUi of [false, true]) {
    it(`uses the sheet for a section with phone screens ${phoneUi ? 'on' : 'off'}, keeping context until closed`, async () => {
      setPhoneUiEnabled(phoneUi)
      const p = await project()
      expect(document.querySelector('[data-quick-add-row]')).toBeNull()
      const trigger = await openSection(p.section)
      expect(document.querySelector('[data-quick-add-section]')!.textContent).toContain('Doing')
      expect(document.querySelectorAll('textarea[aria-label="Add a task to Doing"]')).toHaveLength(0)
      await add('First', 1)
      await add('Second', 2)
      expect((await tasks()).map((t) => [t.project_id, t.section_id])).toEqual([[p.id, p.section], [p.id, p.section]])
      expect((await db.outbox.toArray()).some((op) => op.entity === 'task' && op.field === 'section_id' && op.value === p.section)).toBe(true)
      await key(field()!, 'Escape')
      await waitFor(() => !field())
      expect(document.activeElement).toBe(trigger)
      await click(document.querySelector('[data-add-button]')!)
      await waitFor(() => !!field())
      expect(document.querySelector('[data-quick-add-section]')).toBeNull()
      await add('Global', 3)
      expect((await tasks()).find((t) => t.title === 'Global')?.section_id).toBeNull()
      await p.unmount()
    })
  }

  it('clears the source section when a task explicitly names another project', async () => {
    const other = await createProject({ name: 'Home' })
    const p = await project()
    await openSection(p.section)
    await add('Elsewhere #Home', 1)
    expect((await tasks()).map((t) => [t.title, t.project_id, t.section_id])).toEqual([['Elsewhere', other, null]])
    await p.unmount()
  })

  it('applies section defaults to each pasted line, with project overrides and one Undo', async () => {
    const other = await createProject({ name: 'Home' })
    const p = await project()
    await openSection(p.section)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (kind: string) => kind === 'text/plain' ? 'First\nSecond #Home\nThird' : '' } })
    await act(async () => { field()!.dispatchEvent(event) })
    await waitFor(() => !!document.querySelector('[data-paste-add]'))
    await click(document.querySelector('[data-paste-add]')!)
    await waitFor(async () => (await tasks()).length === 3)
    const result = await tasks()
    expect(result.find((t) => t.title === 'First')).toMatchObject({ project_id: p.id, section_id: p.section })
    expect(result.find((t) => t.title === 'Second')).toMatchObject({ project_id: other, section_id: null })
    expect(result.find((t) => t.title === 'Third')).toMatchObject({ project_id: p.id, section_id: p.section })
    await waitFor(() => bulkToast()?.label === '3 tasks added', 'the batch Undo offer')
    const { undoBatch } = await import('../lib/undo')
    await act(async () => { await undoBatch(bulkToast()!.undoId!) })
    expect(await tasks()).toHaveLength(0)
    await p.unmount()
  })

  it('opens from either board control, including No section', async () => {
    const p = await project(true)
    await openSection(p.section)
    await add('In Doing', 1)
    await key(field()!, 'Escape')
    await waitFor(() => !field())
    await click(document.querySelector('[data-column-add=""]')!)
    await waitFor(() => !!field())
    expect(document.querySelector('[data-quick-add-section]')!.textContent).toContain('No section')
    await add('Unsectioned', 2)
    expect((await tasks()).find((t) => t.title === 'Unsectioned')).toMatchObject({ project_id: p.id, section_id: null })
    await p.unmount()
  })

  it('closes contextual capture when navigating, and q opens the ordinary sheet', async () => {
    const p = await project()
    await openSection(p.section)
    await act(async () => { navigate({ view: 'inbox' }) })
    await waitFor(() => !field())
    await act(async () => { listState()!.focusQuickAdd(null) })
    await waitFor(() => !!field())
    expect(document.querySelector('[data-quick-add-section]')).toBeNull()
    await add('Inbox task', 1)
    expect((await tasks())[0]).toMatchObject({ project_id: null, section_id: null })
    await p.unmount()
  })

  it('keeps the desktop top input and section inline editor', async () => {
    width = 1280
    const p = await project()
    expect(document.querySelector('[data-quick-add-row] textarea')).not.toBeNull()
    await click(document.querySelector(`[data-section-heading="${p.section}"] button[aria-label="Add a task to Doing"]`)!)
    await waitFor(() => !!document.querySelector('textarea[aria-label="Add a task to Doing"]'))
    expect(field()).toBeNull()
    await p.unmount()
  })
})
