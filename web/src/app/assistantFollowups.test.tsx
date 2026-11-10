// @vitest-environment happy-dom
// Follow-up suggestions (OpenSpec change assistant-followups, task 1.2): chips under
// the latest answer; activating one sends its text as the next message; disabled
// offline; none on older answers or with a choice.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSkills } from '../lib/assistantSkills'
import { openAssistantWith, resetAssistantStatus, setAssistantStatus, type AssistantStatus } from '../lib/assistantStatus'
import { answerFollowups, followupsOf } from '../lib/assistantBlocks'
import { db, type AssistantMessage } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import { click, render, waitFor } from '../ui/test-utils'
import { AssistantPanel, AssistantPanelBody, type PanelViewProps } from './assistant/AssistantPanel'
import { hideBulkToast } from './bulk/toastStore'

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
const sse = (...events: [string, unknown][]) => events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('')
const answer = (extra: Partial<AssistantMessage> = {}): AssistantMessage => ({ role: 'assistant', text: 'Three tasks are overdue.', at: 2, followups: ['Move them to Friday', 'Break down #2'], ...extra })
const chips = (root: ParentNode) => [...root.querySelectorAll<HTMLButtonElement>('[data-followup]')]

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
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals(); hideBulkToast() })

describe('follow-up suggestions', () => {
  it('tapping a suggestion sends its text as the next message; the stored answer keeps it out of its text and blocks', async () => {
    reply = () => sse(['text', { text: 'Three tasks are overdue.' }], ['block', { kind: 'followups', suggestions: ['Move them to Friday', 'Plan tomorrow'] }], ['done', { stop_reason: 'end_turn' }])
    openAssistantWith({ text: 'what is overdue?', send: true })
    await render(<AssistantPanel onClose={noop} context={() => ({ view: 'today' })} onApplied={noop} />)
    await waitFor(() => chips(document).length === 2 && chips(document).every((b) => !b.disabled), 'the suggestions')
    const [thread] = await db.assistantThreads.toArray()
    const stored = thread.messages.at(-1)!
    expect(stored.followups).toEqual(['Move them to Friday', 'Plan tomorrow'])
    expect(stored.blocks).toBeUndefined()
    // The chips sit after the actions row, in a named group, each named by its text.
    const group = document.querySelector('[data-assistant-followups]')!
    expect(group.getAttribute('role')).toBe('group')
    expect(document.querySelector('[data-assistant-actions]')!.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    reply = () => sse(['text', { text: 'Moved to Friday.' }], ['done', { stop_reason: 'end_turn' }])
    const move = chips(document).find((b) => b.textContent === 'Move them to Friday')!
    await click(move)
    move.click()
    await waitFor(() => document.body.textContent!.includes('Moved to Friday.'), 'the answer to it')
    expect(turns).toHaveLength(2)
    expect(turns[1].messages.at(-1)).toMatchObject({ role: 'user', text: 'Move them to Friday' })
    // The earlier answer's suggestions are gone once a later message exists.
    expect(chips(document)).toHaveLength(0)
  })

  it('older answers show none, offline they are disabled, and an answer with a choice shows none', async () => {
    const older = await render(<AssistantPanelBody {...props({ onFollowUp: noop, messages: [answer(), { role: 'user', text: 'thanks', at: 3 }] })} />)
    expect(chips(older.container)).toHaveLength(0)
    const offline = await render(<AssistantPanelBody {...props({ onFollowUp: noop, connected: false, messages: [answer()] })} />)
    expect(chips(offline.container)).toHaveLength(2)
    expect(chips(offline.container).every((b) => b.disabled)).toBe(true)
    const choice = { kind: 'choice' as const, question: 'A or B?', options: ['A', 'B'] }
    const asked = await render(<AssistantPanelBody {...props({ onFollowUp: noop, messages: [answer({ blocks: [{ at: 0, block: choice }] })] })} />)
    expect(chips(asked.container)).toHaveLength(0)
  })

  it('reads a follow-ups event: 1 to 3 trimmed texts of at most 60 characters', () => {
    expect(followupsOf({ kind: 'followups', suggestions: [' A ', '', 3, 'B', 'C', 'D'] })).toEqual(['A', 'B', 'C'])
    expect(followupsOf({ kind: 'followups', suggestions: [] })).toBeNull()
    expect(followupsOf({ kind: 'tasks', ids: ['t1'] })).toBeNull()
    expect(answerFollowups({ followups: ['A'] })).toEqual(['A'])
  })
})
