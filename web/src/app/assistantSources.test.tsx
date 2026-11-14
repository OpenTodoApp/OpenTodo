// @vitest-environment happy-dom
// Tool sources in the answer (OpenSpec change assistant-tool-sources): what a
// read returned, in place, closed by default, opening to the device's rows.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSkills } from '../lib/assistantSkills'
import { openAssistantWith, resetAssistantStatus, setAssistantStatus, type AssistantStatus } from '../lib/assistantStatus'
import { splitAnswer } from '../lib/assistantBlocks'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { click, render, waitFor } from '../ui/test-utils'
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

const sse = (...events: [string, unknown][]) => events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('')
let reply = () => ''
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  resetAssistantStatus()
  resetSkills([])
  setAssistantStatus(status)
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    if (path === '/api/v1/me/assistant') return new Response(JSON.stringify(status), { status: 200 })
    if (path === '/api/v1/assistant/skills') return new Response(JSON.stringify({ skills: [] }), { status: 200 })
    if (path === '/api/v1/assistant/turn') return new Response(reply(), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    return new Response('{}', { status: 404 })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('splitAnswer with sources', () => {
  it('places a source where its read ran, before a block at the same point', () => {
    const source = { of: 'tasks' as const, ids: ['t1'], total: 1 }
    const block = { kind: 'note' as const, id: 'n1' }
    expect(splitAnswer('Intro. Rest.', [{ at: 7, block }], [{ at: 7, source }, { at: 0, source }])).toEqual([
      { kind: 'source', source, index: 1 },
      { kind: 'text', text: 'Intro. ' },
      { kind: 'source', source, index: 0 },
      { kind: 'block', block, index: 0 },
      { kind: 'text', text: 'Rest.' },
    ])
  })
})

describe('tool sources (assistant-tool-sources)', () => {
  it('a source is one closed line that opens to the tasks the tool returned, from the device', async () => {
    const a = await createTask({ title: 'Pay rent' })
    const b = await createTask({ title: 'Call Bea' })
    const r = await render(<AssistantPanelBody {...panelProps({ messages: [{ role: 'assistant', text: 'Two tasks are due.', sources: [{ at: 0, source: { of: 'tasks', ids: [a, b, 'gone'], total: 5 } }], at: 1 }] })} />)
    await waitFor(() => !!r.container.querySelector('details[data-assistant-source="tasks"]'), 'the source line')
    const line = r.container.querySelector<HTMLDetailsElement>('details[data-assistant-source="tasks"]')!
    expect(line.open).toBe(false)
    expect(line.querySelector('summary')!.textContent).toBe('Looked at 5 tasks')
    expect(line.closest('[aria-live]')).toBeNull()
    await click(line.querySelector('summary')!)
    await waitFor(() => line.querySelectorAll('li').length === 4, 'the rows')
    expect([...line.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Pay rent', 'Call Bea', 'Removed', 'and 2 more'])
  })

  it('an empty result reads "No projects found" with nothing to open', async () => {
    const r = await render(<AssistantPanelBody {...panelProps({ messages: [{ role: 'assistant', text: 'None.', sources: [{ at: 0, source: { of: 'projects', ids: [], total: 0 } }], at: 1 }] })} />)
    await waitFor(() => !!r.container.querySelector('[data-assistant-source="projects"]'), 'the source line')
    const line = r.container.querySelector('[data-assistant-source="projects"]')!
    expect(line.tagName).toBe('P')
    expect(line.textContent).toBe('No projects found')
  })

  it('the streamed source is stored with the answer as ids, and its line names the project', async () => {
    const p = await createProject({ name: 'Garden' })
    reply = () => sse(['status', { text: 'Looking at your projects…' }], ['source', { of: 'projects', ids: [p], total: 1 }], ['text', { text: 'One project.' }], ['done', { stop_reason: 'end_turn' }])
    openAssistantWith({ text: 'which projects?', send: true })
    await render(<AssistantPanel onClose={noop} context={() => ({ view: 'today' })} onApplied={noop} />)
    await waitFor(() => !!document.querySelector('details[data-assistant-source]'), 'the source line')
    const stored = await db.assistantThreads.toArray()
    expect(stored[0].messages.at(-1)!.sources).toEqual([{ at: 0, source: { of: 'projects', ids: [p], total: 1 } }])
    expect(JSON.stringify(stored[0].messages.at(-1)!.sources)).not.toContain('Garden')
    const line = document.querySelector<HTMLDetailsElement>('details[data-assistant-source]')!
    await click(line.querySelector('summary')!)
    await waitFor(() => line.querySelector('li')?.textContent === 'Garden', 'the project row')
  })
})
