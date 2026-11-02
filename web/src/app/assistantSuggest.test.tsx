// @vitest-environment happy-dom
// Suggest after adding, in the panel (OpenSpec change assistant-suggest-after-add): the proposal of a turn the person
// did not type is always reviewed, a second add in a row does not replace the first suggestion, and the panel takes
// focus like any modal (the backdrop covers the quick-add line, so focus cannot usefully stay there).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAutoApply } from '../lib/assistant'
import { SUGGESTION_PROMPT, setSuggestAfterAdd, suggestAfterAdd } from '../lib/assistantSuggest'
import { openAssistantWith, resetAssistantStatus, setAssistantStatus, takeAssistantPrefill, type AssistantStatus } from '../lib/assistantStatus'
import { db } from '../lib/db'
import { getTask } from '../lib/localData'
import { createTask, resetDeviceId } from '../lib/ops'
import { render, waitFor } from '../ui/test-utils'
import { AssistantPanel } from './assistant/AssistantPanel'

const status: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'm', consented: true,
  disclosure_version: 1, fields: [], allow_member_keys: false, own_key_set: false, operator_key_set: true,
}

let turns: Record<string, unknown>[] = []
let taskId = ''
/** A change set the model proposes: a priority, which "Apply small changes without review" would apply by itself. */
function stubServer() {
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/v1/me/assistant') return new Response(JSON.stringify(status), { status: 200 })
    if (path === '/api/v1/assistant/skills') return new Response(JSON.stringify({ skills: [] }), { status: 200 })
    if (path === '/api/v1/assistant/turn') {
      turns.push(JSON.parse(String(init?.body)))
      const changeset = { type: 'changeset', items: [{ entity: 'task', entityId: taskId, patch: { priority: 1 }, base: { priority: 4 } }], limit: 50 }
      return new Response(`event: text\ndata: {"text":"Done."}\n\nevent: changeset\ndata: ${JSON.stringify(changeset)}\n\nevent: done\ndata: {"stop_reason":"end_turn"}\n\n`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }
    return new Response('{}', { status: 404 })
  }))
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetAssistantStatus()
  setAssistantStatus(status)
  turns = []
  taskId = await createTask({ title: 'Call the garage' })
  stubServer()
})
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

const panel = () => render(<AssistantPanel onClose={() => {}} context={() => ({ view: 'inbox' })} onApplied={() => {}} />)
const reviewShown = () => !!document.querySelector('[data-assistant-review]')

describe('the proposal of a suggestion', () => {
  it('is shown for review even when this device applies small changes without review', async () => {
    await setAutoApply(true)
    await setSuggestAfterAdd(true)
    await suggestAfterAdd(taskId)
    const r = await panel()
    await waitFor(reviewShown, 'the change set for review')
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({ selected: [taskId] })
    expect((turns[0].messages as { text: string }[]).at(-1)!.text).toBe(SUGGESTION_PROMPT)
    expect(document.querySelector('[data-assistant-result]')).toBeNull()
    expect((await getTask(taskId))?.priority).toBe(4)
    await r.unmount()
  })

  it('only a suggestion is forced to review: a request the person made themselves still auto-applies', async () => {
    await setAutoApply(true)
    openAssistantWith({ text: 'make it urgent', selected: [taskId], send: true })
    const r = await panel()
    await waitFor(() => !!document.querySelector('[data-assistant-result]'), 'the automatic apply')
    expect(reviewShown()).toBe(false)
    expect((await getTask(taskId))?.priority).toBe(1)
    await r.unmount()
  })

  it('does not force the next message of the same panel to review', async () => {
    await setAutoApply(true)
    await setSuggestAfterAdd(true)
    await suggestAfterAdd(taskId)
    const r = await panel()
    await waitFor(reviewShown, 'the change set for review')
    openAssistantWith({ text: 'make it urgent', selected: [taskId], send: true })
    await waitFor(() => !!document.querySelector('[data-assistant-result]'), 'the automatic apply of the typed request')
    await r.unmount()
  })
})

describe('two adds in a row', () => {
  it('the second add does not replace the first suggestion while its turn runs or waits for review', async () => {
    await setSuggestAfterAdd(true)
    const second = await createTask({ title: 'Buy stamps' })
    await suggestAfterAdd(taskId)
    const r = await panel()
    await suggestAfterAdd(second)
    expect(takeAssistantPrefill()).toBeNull()
    await waitFor(reviewShown, 'the first suggestion for review')
    await suggestAfterAdd(second)
    expect(takeAssistantPrefill()).toBeNull()
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({ selected: [taskId] })
    expect(document.querySelector<HTMLTextAreaElement>('[data-assistant-composer]')?.value).toBe('')
    await r.unmount()
  })
})

describe('focus', () => {
  const quickAdd = () => {
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    return input
  }

  it('moves into the panel when a suggestion opens it, as for any modal', async () => {
    const input = quickAdd()
    openAssistantWith({ text: SUGGESTION_PROMPT, selected: [taskId], send: true, review: true })
    const r = await panel()
    await waitFor(reviewShown, 'the change set for review')
    await waitFor(() => document.activeElement !== input, 'focus moved into the panel')
    expect(document.querySelector('[data-assistant-panel]')?.contains(document.activeElement)).toBe(true)
    await r.unmount()
  })

  it('still moves into the panel when the person opened it', async () => {
    const input = quickAdd()
    openAssistantWith({ text: 'what is due?' })
    const r = await panel()
    await waitFor(() => document.activeElement !== input, 'focus moved into the panel')
    expect(document.querySelector('[data-assistant-panel]')?.contains(document.activeElement)).toBe(true)
    await r.unmount()
  })
})
