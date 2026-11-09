// @vitest-environment happy-dom
// Blocks in the assistant's answers (OpenSpec change assistant-generative-ui, tasks
// 3.1 to 3.7): stored with the answer, placed where they arrived, announced once,
// live from the device's rows, and each kind's own behaviour.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSkills } from '../lib/assistantSkills'
import { openAssistantWith, resetAssistantStatus, setAssistantStatus, type AssistantStatus } from '../lib/assistantStatus'
import { db, setMeta, type AssistantMessage } from '../lib/db'
import { createPlace, setMapsPref } from '../lib/locations'
import { createNote } from '../lib/noteOps'
import { createProject, createTask, mutate, resetDeviceId } from '../lib/ops'
import { createSection } from '../lib/sections'
import { click, render, waitFor } from '../ui/test-utils'
import { AssistantPanel, AssistantPanelBody, type PanelViewProps } from './assistant/AssistantPanel'
import { bulkToast, hideBulkToast } from './bulk/toastStore'

// The map itself needs WebGL: record what the block hands it, then render the real one.
const mapPoints: unknown[][] = []
vi.mock('./locations/LocationMap', async (load) => {
  const real = await load<typeof import('./locations/LocationMap')>()
  return { ...real, LocationMap: (p: Parameters<typeof real.LocationMap>[0]) => { mapPoints.push(p.points); return real.LocationMap(p) } }
})

const noop = () => {}
const status: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'm', consented: true,
  disclosure_version: 4, fields: [], allow_member_keys: false, own_key_set: false, operator_key_set: true,
}
const props = (over: Partial<PanelViewProps> = {}): PanelViewProps => ({
  status, connected: true, messages: [], streaming: null, announce: '', statusAnnounce: '', review: null, result: null, reviewBusy: false, error: null,
  draft: '', consentBusy: false, consentError: null, threads: null, onToggle: noop, onApply: noop, onDiscard: noop, onUndo: noop, onDraft: noop,
  onSend: noop, onStop: noop, onAccept: noop, onPickThread: noop, ...over,
})
const answer = (text: string, blocks: AssistantMessage['blocks'], extra: Partial<AssistantMessage> = {}): AssistantMessage => ({ role: 'assistant', text, blocks, at: 2, ...extra })
const sse = (...events: [string, unknown][]) => events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('')

let reply = () => sse(['text', { text: 'Done.' }], ['done', { stop_reason: 'end_turn' }])
let turns: { messages: { role: string; text: string }[] }[] = []
const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
  if (path === '/api/v1/me/assistant') return new Response(JSON.stringify(status), { status: 200 })
  if (path === '/api/v1/assistant/skills') return new Response(JSON.stringify({ skills: [] }), { status: 200 })
  if (path === '/api/v1/assistant/turn') {
    turns.push(JSON.parse(String(init?.body)))
    return new Response(reply(), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }
  return new Response('{}', { status: 404 })
})
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  resetAssistantStatus()
  resetSkills([])
  setAssistantStatus(status)
  turns = []
  mapPoints.length = 0
  fetchMock.mockClear()
  reply = () => sse(['text', { text: 'Done.' }], ['done', { stop_reason: 'end_turn' }])
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals(); hideBulkToast() })

const block = (root: ParentNode, kind: string) => root.querySelector<HTMLElement>(`[data-assistant-block="${kind}"]`)

describe('blocks in the conversation (3.1, 3.2)', () => {
  it('a streamed block is stored with the answer as ids only, placed where it arrived and announced once', async () => {
    const id = await createTask({ title: 'Pay taxes' })
    reply = () => sse(['text', { text: 'Here is what is overdue:\n\n' }], ['block', { kind: 'tasks', ids: [id] }], ['text', { text: 'Start with it.' }], ['done', { stop_reason: 'end_turn' }])
    openAssistantWith({ text: 'what is overdue?', send: true })
    await render(<AssistantPanel onClose={noop} context={() => ({ view: 'today' })} onApplied={noop} />)
    await waitFor(() => !!document.querySelector('[data-assistant-block="tasks"] [data-assistant-tasks]') && turns.length === 1, 'the tasks block')
    const [thread] = await db.assistantThreads.toArray()
    const stored = thread.messages.at(-1)!
    expect(stored.blocks).toEqual([{ at: 'Here is what is overdue:\n\n'.length, block: { kind: 'tasks', ids: [id] } }])
    expect(JSON.stringify(stored)).not.toContain('Pay taxes')
    // Text, then the block, then the rest of the text.
    const answerEl = block(document, 'tasks')!.closest('li')!
    const order = [...answerEl.querySelectorAll('p, [data-assistant-block]')].map((el) => (el.matches('[data-assistant-block]') ? 'block' : el.textContent))
    expect(order.indexOf('Here is what is overdue:')).toBeLessThan(order.indexOf('block'))
    expect(order.indexOf('block')).toBeLessThan(order.indexOf('Start with it.'))
    expect(block(document, 'tasks')!.getAttribute('aria-label')).toBe('1 task')
    // The live region names the block once, by its label, between the sentences around it.
    const live = document.querySelector('[data-assistant-live]')!.textContent!
    expect(live.match(/1 task\./g)).toHaveLength(1)
    expect(live).not.toContain('Pay taxes')
    expect(block(document, 'tasks')!.getAttribute('role')).toBe('group')
  })

  it('a block whose entity is gone says Removed; the rest of the answer stays', async () => {
    const n = await createNote({ title: 'Ideas', description: 'grow tomatoes' })
    const r = await render(<AssistantPanelBody {...props({ messages: [answer('See this note.', [{ at: 14, block: { kind: 'note', id: n } }])] })} />)
    await waitFor(() => !!r.container.querySelector('[data-assistant-note]'), 'the note')
    await mutate('note', n, { deleted_at: Date.now() })
    await waitFor(() => block(r.container, 'note')!.textContent === 'Removed', 'Removed')
    expect(r.container.textContent).toContain('See this note.')
  })
})

describe('task list block (3.3)', () => {
  it('ticking a row completes the task as an op from this device, offline, with Undo', async () => {
    const id = await createTask({ title: 'Pay taxes' })
    const before = await db.outbox.count()
    const r = await render(<AssistantPanelBody {...props({ messages: [answer('', [{ at: 0, block: { kind: 'tasks', ids: [id, 'not-here'], title: 'Overdue' } }])] })} />)
    await waitFor(() => !!r.container.querySelector('[data-assistant-tasks] li'), 'the row')
    expect(r.container.querySelector('[data-assistant-tasks]')!.textContent).toContain('1 task removed')
    await click(r.container.querySelector<HTMLElement>('[data-assistant-tasks] [data-row-controls] button')!)
    await waitFor(async () => !!(await db.tasks.get(id))!.completed_at, 'completed')
    expect(await db.outbox.count()).toBeGreaterThan(before)
    await waitFor(() => !!bulkToast()?.undoId, 'the Undo toast')
    expect(fetchMock.mock.calls.some(([path]) => String(path).includes('/sync'))).toBe(false)
  })
})

describe('calendar block (3.4)', () => {
  it('shows the day\'s dated tasks in time order with the planned total, and no scroll region', async () => {
    await setMeta('calendar.grid', { startHour: 8, endHour: 18, dayLength: 240 })
    await createTask({ title: 'Review PR', due: { date: '2026-11-12', time: '11:00' }, estimate_minutes: 60 })
    await createTask({ title: 'Write report', due: { date: '2026-11-12', time: '09:00' }, estimate_minutes: 120 })
    await createTask({ title: 'Another day', due: { date: '2026-11-13' } })
    const r = await render(<AssistantPanelBody {...props({ messages: [answer('', [{ at: 0, block: { kind: 'calendar', date: '2026-11-12', span: 'day' } }])] })} />)
    await waitFor(() => r.container.querySelectorAll('[data-agenda-item]').length === 2, 'the two items')
    const titles = [...r.container.querySelectorAll('[data-agenda-item] button')].map((b) => b.textContent)
    expect(titles).toEqual(['Write report', 'Review PR'])
    expect(block(r.container, 'calendar')!.textContent).toMatch(/3h/)
    expect(r.container.querySelector('[data-assistant-block] [data-scroll-y]')).toBeNull()
  })
})

describe('choice block (3.5)', () => {
  it('choosing sends the option as the next message, marks it and disables the buttons', async () => {
    reply = () => sse(['text', { text: 'Which day?' }], ['block', { kind: 'choice', question: 'Saturday or Sunday?', options: ['Saturday', 'Sunday'] }], ['done', { stop_reason: 'end_turn' }])
    openAssistantWith({ text: 'move Clean garage', send: true })
    await render(<AssistantPanel onClose={noop} context={() => ({ view: 'today' })} onApplied={noop} />)
    await waitFor(() => document.querySelectorAll<HTMLButtonElement>('[data-choice-option]:not([disabled])').length === 2, 'the choice')
    reply = () => sse(['text', { text: 'Moved to Saturday.' }], ['done', { stop_reason: 'end_turn' }])
    await click([...document.querySelectorAll<HTMLButtonElement>('[data-choice-option]')].find((b) => b.textContent === 'Saturday')!)
    await waitFor(() => turns.length === 2, 'the choice sent')
    expect(turns[1].messages.at(-1)!.text).toBe('Saturday')
    await waitFor(() => document.body.textContent!.includes('Moved to Saturday.'), 'the answer to it')
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-choice-option]')]
    expect(buttons.every((b) => b.disabled)).toBe(true)
    expect(buttons.find((b) => b.textContent === 'Saturday')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('a double click on an option sends one turn', async () => {
    reply = () => sse(['block', { kind: 'choice', question: 'A or B?', options: ['A', 'B'] }], ['done', { stop_reason: 'end_turn' }])
    openAssistantWith({ text: 'pick', send: true })
    await render(<AssistantPanel onClose={noop} context={() => ({ view: 'today' })} onApplied={noop} />)
    await waitFor(() => document.querySelectorAll<HTMLButtonElement>('[data-choice-option]:not([disabled])').length === 2, 'the choice')
    reply = () => sse(['text', { text: 'Fine.' }], ['done', { stop_reason: 'end_turn' }])
    const a = [...document.querySelectorAll<HTMLButtonElement>('[data-choice-option]')].find((b) => b.textContent === 'A')!
    a.click()
    a.click()
    await waitFor(() => document.body.textContent!.includes('Fine.'), 'the answer')
    expect(turns).toHaveLength(2)
  })

  it('an older choice and a choice offline are disabled', async () => {
    const choice = { kind: 'choice' as const, question: 'A or B?', options: ['A', 'B'] }
    const older = await render(<AssistantPanelBody {...props({ onChoose: noop, messages: [answer('', [{ at: 0, block: choice }]), { role: 'user', text: 'never mind', at: 3 }] })} />)
    expect([...older.container.querySelectorAll<HTMLButtonElement>('[data-choice-option]')].every((b) => b.disabled)).toBe(true)
    const offline = await render(<AssistantPanelBody {...props({ onChoose: noop, connected: false, messages: [answer('', [{ at: 0, block: choice }])] })} />)
    expect([...offline.container.querySelectorAll<HTMLButtonElement>('[data-choice-option]')].every((b) => b.disabled)).toBe(true)
  })
})

describe('map block (3.6)', () => {
  it('with maps off shows the list only and makes no map request', async () => {
    await setMapsPref(false)
    const id = await createTask({ title: 'Pick up parcel', location: { name: 'Post office', lat: 52.5, lon: 13.4 } })
    const r = await render(<AssistantPanelBody {...props({ messages: [answer('', [{ at: 0, block: { kind: 'map', task_ids: [id] } }])] })} />)
    await waitFor(() => !!r.container.querySelector(`[data-map-item="${id}"]`), 'the list')
    expect(r.container.querySelector('[data-map-item]')!.textContent).toContain('Post office')
    expect(fetchMock.mock.calls.some(([path]) => String(path).includes('/maps'))).toBe(false)
    expect(r.container.querySelector('canvas, .maplibregl-map')).toBeNull()
  })

  it('hands the map one marker per listed item with coordinates, numbered like the list', async () => {
    await setMeta('mapsAvailable', true)
    const id = await createTask({ title: 'Pick up parcel', location: { name: 'Post office', lat: 52.5, lon: 13.4 } })
    const pl = await createPlace({ name: 'Stationer', address: 'Main St 1', geo: { lat: 52.51, lon: 13.41 } })
    const r = await render(<AssistantPanelBody {...props({ messages: [answer('', [{ at: 0, block: { kind: 'map', task_ids: [id], place_ids: [pl] } }])] })} />)
    await waitFor(() => r.container.querySelectorAll('[data-map-item]').length === 2, 'the list')
    expect(mapPoints.at(-1)).toEqual([{ lat: 52.5, lon: 13.4, label: '1. Pick up parcel' }, { lat: 52.51, lon: 13.41, label: '2. Stationer' }])
  })
})

describe('note and project blocks (3.7)', () => {
  it('a note shows its title and text and follows an edit', async () => {
    const n = await createNote({ title: 'Ideas', description: 'Grow **tomatoes**' })
    const r = await render(<AssistantPanelBody {...props({ messages: [answer('', [{ at: 0, block: { kind: 'note', id: n } }])] })} />)
    await waitFor(() => !!r.container.querySelector('[data-assistant-note] strong'), 'the note')
    await mutate('note', n, { title: 'Garden ideas' })
    await waitFor(() => r.container.querySelector('[data-assistant-note]')!.textContent!.includes('Garden ideas'), 'the edit')
  })

  it('a project shows its sections with their open tasks and follows a new task', async () => {
    const p = await createProject({ name: 'Move flat' })
    const design = await createSection(p, 'Design')
    await createSection(p, 'Build')
    await createTask({ title: 'Sketch', project_id: p, section_id: design })
    const r = await render(<AssistantPanelBody {...props({ messages: [answer('', [{ at: 0, block: { kind: 'project', id: p } }])] })} />)
    await waitFor(() => r.container.querySelectorAll('[data-outline-section]').length === 2, 'the outline')
    const rows = () => [...r.container.querySelectorAll('[data-outline-section]')].map((li) => li.textContent)
    expect(rows()).toEqual(['Design1 open', 'Build0 open'])
    await createTask({ title: 'Measure', project_id: p, section_id: design })
    await waitFor(() => rows()[0] === 'Design2 open', 'the new task counted')
  })
})
