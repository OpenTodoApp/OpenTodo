// @vitest-environment happy-dom
// The assistant's transcript (OpenSpec change assistant-generative-ui): task links
// in answers read from the device's rows (D7), the steps of an answer (D8), the
// message actions and following the stream.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSkills } from '../lib/assistantSkills'
import { openAssistantWith, resetAssistantStatus, setAssistantStatus, type AssistantStatus } from '../lib/assistantStatus'
import { db } from '../lib/db'
import { createTask, mutate, resetDeviceId } from '../lib/ops'
import { click, flush, key, render, type, waitFor } from '../ui/test-utils'
import { AssistantPanel, AssistantPanelBody, type PanelViewProps } from './assistant/AssistantPanel'

const noop = () => {}
const status: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'claude-opus-5-5', consented: true,
  disclosure_version: 4, fields: ['task titles and descriptions'], allow_member_keys: false, own_key_set: false, operator_key_set: true,
}

function panelProps(over: Partial<PanelViewProps> = {}): PanelViewProps {
  return {
    status, connected: true, messages: [], streaming: null, announce: '', statusAnnounce: '', review: null, result: null, reviewBusy: false, error: null,
    draft: '', consentBusy: false, consentError: null, threads: null, onToggle: noop, onApply: noop, onDiscard: noop, onUndo: noop, onDraft: noop,
    onSend: noop, onStop: noop, onAccept: noop, onPickThread: noop, ...over,
  }
}

/** Server-sent events of one turn. */
const sse = (...events: [string, unknown][]) => events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('')

let turns: { messages: { role: string; text: string }[] }[] = []
let reply = () => sse(['text', { text: 'Done.' }], ['done', { stop_reason: 'end_turn' }])
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  resetAssistantStatus()
  resetSkills([])
  setAssistantStatus(status)
  turns = []
  reply = () => sse(['text', { text: 'Done.' }], ['done', { stop_reason: 'end_turn' }])
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/v1/me/assistant') return new Response(JSON.stringify(status), { status: 200 })
    if (path === '/api/v1/assistant/skills') return new Response(JSON.stringify({ skills: [] }), { status: 200 })
    if (path === '/api/v1/assistant/turn') {
      turns.push(JSON.parse(String(init?.body)))
      return new Response(reply(), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }
    return new Response('{}', { status: 404 })
  }))
})
afterEach(() => vi.unstubAllGlobals())

const panel = () => render(<AssistantPanel onClose={noop} context={() => ({ view: 'today' })} onApplied={noop} />)

describe('task links in answers (D7)', () => {
  it('shows a linked task with its current title, opening it, and done when completed', async () => {
    const id = await createTask({ title: 'Pay taxes' })
    await mutate('task', id, { title: 'Pay taxes 2026' })
    const r = await render(<AssistantPanelBody {...panelProps({ messages: [{ role: 'assistant', text: `Start with [Pay taxes](?task=${id}).`, at: 1 }] })} />)
    await waitFor(() => r.container.querySelector(`a[href="?task=${id}"]`)?.textContent === 'Pay taxes 2026', 'the live title')
    await mutate('task', id, { completed_at: 1 })
    await waitFor(() => r.container.querySelector(`a[href="?task=${id}"]`)?.getAttribute('data-ref-state') === 'done', 'the done state')
  })

  it('keeps the model\'s text, not a link, for an id that is not on this device', async () => {
    const r = await render(<AssistantPanelBody {...panelProps({ messages: [{ role: 'assistant', text: 'Start with [Ghost](?task=nope).', at: 1 }] })} />)
    await waitFor(() => !!r.container.querySelector('[data-ref-state="muted"]'), 'the muted text')
    expect(r.container.querySelector('a[href="?task=nope"]')).toBeNull()
    expect(r.container.textContent).toContain('Ghost')
  })
})

describe('steps of an answer (D8)', () => {
  it('a finished answer lists its steps in a closed disclosure outside the live regions', async () => {
    const r = await render(<AssistantPanelBody {...panelProps({ messages: [{ role: 'assistant', text: 'Two tasks.', status: ['Looking at Today…', 'Searching “tax”…'], at: 1 }] })} />)
    const steps = r.container.querySelector<HTMLDetailsElement>('details[data-assistant-steps]')!
    expect(steps.open).toBe(false)
    expect(steps.querySelector('summary')!.textContent).toBe('2 steps')
    expect([...steps.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Looking at Today…', 'Searching “tax”…'])
    expect(steps.closest('[aria-live]')).toBeNull()
    await click(steps.querySelector('summary')!)
    expect(steps.open).toBe(true)
  })

  it('an answer without steps shows no disclosure', async () => {
    const r = await render(<AssistantPanelBody {...panelProps({ messages: [{ role: 'assistant', text: 'Hi.', at: 1 }] })} />)
    expect(r.container.querySelector('[data-assistant-steps]')).toBeNull()
  })

  it('the streamed status lines stay on the stored answer', async () => {
    reply = () => sse(['status', { text: 'Looking at Today…' }], ['text', { text: 'Two tasks.' }], ['done', { stop_reason: 'end_turn' }])
    openAssistantWith({ text: 'what is due?', send: true })
    await panel()
    await waitFor(() => !!document.querySelector('[data-assistant-steps]'), 'the steps of the answer')
    expect(document.querySelector('[data-assistant-steps] summary')!.textContent).toBe('1 step')
    const stored = await db.assistantThreads.toArray()
    expect(stored[0].messages.at(-1)!.status).toEqual(['Looking at Today…'])
  })
})

describe('following the stream (D8)', () => {
  it('stops following when the person scrolls up and offers Jump to latest, which goes back to the end', async () => {
    reply = () => sse(['text', { text: 'A long answer.' }], ['done', { stop_reason: 'end_turn' }])
    openAssistantWith({ text: 'plan my week', send: true })
    await panel()
    await waitFor(() => turns.length === 1 && !!document.querySelector('[aria-label="Conversation"] li:nth-child(2)'), 'the answer')
    const scroller = document.querySelector<HTMLElement>('[data-assistant-scroll]')!
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => 2000 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => 500 })
    expect(document.querySelector('[data-assistant-jump]')).toBeNull()
    const scrollTo = async (y: number) => {
      scroller.scrollTop = y
      scroller.dispatchEvent(new Event('scroll'))
      await flush(10)
    }
    await scrollTo(1499)
    await scrollTo(300)
    await waitFor(() => !!document.querySelector('[data-assistant-jump]'), 'Jump to latest')
    await click(document.querySelector('[data-assistant-jump] button')!)
    await waitFor(() => !document.querySelector('[data-assistant-jump]'), 'back at the end')
    await waitFor(() => scroller.scrollTop > 1000, 'scrolled to the end')
  })
})

describe('message actions (D8)', () => {
  const answered = async (text = 'plan my week') => {
    openAssistantWith({ text, send: true })
    await panel()
    await waitFor(() => !!document.querySelector('[data-assistant-regenerate]'), 'the answer with its actions')
  }
  const priorityChange = (taskId: string) => ['changeset', { items: [{ entity: 'task', entityId: taskId, patch: { priority: 1 }, base: { priority: 4 } }], limit: 50 }] as [string, unknown]

  it('Copy puts the answer\'s Markdown on the clipboard', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    reply = () => sse(['text', { text: '**Two** tasks.' }], ['done', { stop_reason: 'end_turn' }])
    await answered()
    await click(document.querySelector('[data-assistant-copy]')!)
    await waitFor(() => writeText.mock.calls.length === 1, 'the copy')
    expect(writeText).toHaveBeenCalledWith('**Two** tasks.')
  })

  it('Regenerate runs the same question again in place of the answer and discards its unapplied proposal', async () => {
    const id = await createTask({ title: 'Report' })
    reply = () => sse(['text', { text: 'First.' }], priorityChange(id), ['done', { stop_reason: 'end_turn' }])
    await answered()
    await waitFor(() => !!document.querySelector('[data-assistant-review]'), 'the proposal')
    reply = () => sse(['text', { text: 'Second.' }], ['done', { stop_reason: 'end_turn' }])
    await click(document.querySelector('[data-assistant-regenerate]')!)
    await waitFor(() => turns.length === 2 && document.querySelector('[aria-label="Conversation"]')!.textContent!.includes('Second.'), 'the new answer')
    expect(turns[1].messages).toEqual(turns[0].messages)
    expect(document.querySelector('[data-assistant-review]')).toBeNull()
    const [thread] = await db.assistantThreads.toArray()
    expect(thread.messages.map((m) => [m.role, m.text])).toEqual([['user', 'plan my week'], ['assistant', 'Second.']])
    expect((await db.tasks.get(id))!.priority).toBe(4)
  })

  it('Regenerate keeps an applied proposal applied', async () => {
    const id = await createTask({ title: 'Report' })
    reply = () => sse(['text', { text: 'First.' }], priorityChange(id), ['done', { stop_reason: 'end_turn' }])
    await answered()
    await waitFor(() => !!document.querySelector('[data-assistant-apply]'), 'the proposal')
    await click(document.querySelector('[data-assistant-apply]')!)
    await waitFor(async () => (await db.tasks.get(id))!.priority === 1, 'the change applied')
    reply = () => sse(['text', { text: 'Second.' }], ['done', { stop_reason: 'end_turn' }])
    await click(document.querySelector('[data-assistant-regenerate]')!)
    await waitFor(() => turns.length === 2, 'the second turn')
    await waitFor(() => document.querySelector('[aria-label="Conversation"]')!.textContent!.includes('Second.'), 'the new answer')
    expect((await db.tasks.get(id))!.priority).toBe(1)
    expect(await db.assistantUndo.count()).toBe(1)
  })

  it('Edit puts the latest question back in the composer; sending replaces it and its answer', async () => {
    await answered()
    await click(document.querySelector('[data-assistant-edit]')!)
    const field = document.querySelector<HTMLTextAreaElement>('[data-assistant-panel] textarea')!
    await waitFor(() => field.value === 'plan my week', 'the question in the composer')
    await type(field, 'plan my week, no meetings Friday')
    await key(field, 'Enter')
    await waitFor(() => turns.length === 2, 'the edited question sent')
    expect(turns[1].messages.map((m) => m.text)).toEqual(['plan my week, no meetings Friday'])
    await waitFor(async () => (await db.assistantThreads.toArray())[0].messages.length === 2, 'the thread replaced')
    const [thread] = await db.assistantThreads.toArray()
    expect(thread.messages.map((m) => m.text)).toEqual(['plan my week, no meetings Friday', 'Done.'])
  })

  it('offers Regenerate and Edit only on the latest messages, and never for a question with pasted text', async () => {
    const msgs = [
      { role: 'user' as const, text: 'one', at: 1 }, { role: 'assistant' as const, text: 'A1', at: 2 },
      { role: 'user' as const, text: 'two', at: 3 }, { role: 'assistant' as const, text: 'A2', at: 4 },
    ]
    const r = await render(<AssistantPanelBody {...panelProps({ messages: msgs, canRedo: true, onRegenerate: noop, onEditLast: noop })} />)
    expect(r.container.querySelectorAll('[data-assistant-copy]')).toHaveLength(2)
    expect(r.container.querySelectorAll('[data-assistant-regenerate]')).toHaveLength(1)
    expect(r.container.querySelectorAll('[data-assistant-edit]')).toHaveLength(1)
    expect(r.container.querySelector('li:nth-child(3) [data-assistant-edit]')).not.toBeNull()
    const pasted = await render(<AssistantPanelBody {...panelProps({ messages: [{ ...msgs[0], pastedLines: 3 }, msgs[1]], canRedo: false, onRegenerate: noop, onEditLast: noop })} />)
    expect(pasted.container.querySelector('[data-assistant-regenerate], [data-assistant-edit]')).toBeNull()
  })

  it('Regenerate and Edit wait offline', async () => {
    const msgs = [{ role: 'user' as const, text: 'one', at: 1 }, { role: 'assistant' as const, text: 'A1', at: 2 }]
    const r = await render(<AssistantPanelBody {...panelProps({ messages: msgs, connected: false, canRedo: true, onRegenerate: noop, onEditLast: noop })} />)
    expect(r.container.querySelector<HTMLButtonElement>('[data-assistant-regenerate]')!.disabled).toBe(true)
    expect(r.container.querySelector<HTMLButtonElement>('[data-assistant-edit]')!.disabled).toBe(true)
  })
})
