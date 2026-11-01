import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from './db'
import * as status from './assistantStatus'
import { getTask } from './localData'
import { saveDeviceSetup } from './assistantDevice/settings'
import { createTaskThenSuggest, getSuggestAfterAdd, setSuggestAfterAdd, suggestAfterAdd, suggestionPrompt } from './assistantSuggest'

let n = 0
beforeEach(() => {
  useDatabase(`suggest-${Date.now()}-${n++}`)
  vi.restoreAllMocks()
})

const ready = { available: true, enabled: true, consented: true, reason: '' } as unknown as status.AssistantStatus
const device = {
  ...ready, mode: 'device', consented: false,
  device: { available: true, providers: ['anthropic'], origins: [], consented_provider: 'anthropic', anthropic_models: [], default_model: '' },
} as unknown as status.AssistantStatus

describe('suggest after adding', () => {
  it('is off by default and remembers the choice on this device', async () => {
    expect(await getSuggestAfterAdd()).toBe(false)
    await setSuggestAfterAdd(true)
    expect(await getSuggestAfterAdd()).toBe(true)
    await setSuggestAfterAdd(false)
    expect(await getSuggestAfterAdd()).toBe(false)
  })

  it('asks the assistant about exactly the new task, and sends at once', async () => {
    vi.spyOn(status, 'assistantStatus').mockReturnValue(ready)
    const open = vi.spyOn(status, 'openAssistantWith').mockImplementation(() => {})
    await setSuggestAfterAdd(true)
    await suggestAfterAdd('task-1', 'Call the garage tomorrow')
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith({ text: suggestionPrompt('Call the garage tomorrow'), selected: ['task-1'], send: true })
  })

  it('bounds the request: at most 4 subtasks, nothing else touched, no invented date', () => {
    const p = suggestionPrompt('Fix shelf')
    expect(p).toContain('“Fix shelf”')
    expect(p).toMatch(/at most 4 subtasks/)
    expect(p).toMatch(/Change nothing else/)
    expect(p).toMatch(/invent no date/)
  })

  it.each([
    ['the device did not turn it on', ready, false],
    ['the owner has not enabled the assistant', { ...ready, enabled: false }, true],
    ['the account is not allowed to use it', { ...ready, available: false }, true],
    ['the consent was not given', { ...ready, consented: false }, true],
    ['the status is not loaded yet', null, true],
  ])('does nothing when %s', async (_why, s, on) => {
    vi.spyOn(status, 'assistantStatus').mockReturnValue(s as status.AssistantStatus | null)
    const open = vi.spyOn(status, 'openAssistantWith').mockImplementation(() => {})
    await setSuggestAfterAdd(on)
    await suggestAfterAdd('task-1', 'x')
    expect(open).not.toHaveBeenCalled()
  })

  it('never throws, so adding a task cannot fail because of it', async () => {
    vi.spyOn(status, 'assistantStatus').mockImplementation(() => { throw new Error('boom') })
    await expect(suggestAfterAdd('task-1', 'x')).resolves.toBeUndefined()
  })

  it('asks on an encrypted account once this device consented to its provider', async () => {
    vi.spyOn(status, 'assistantStatus').mockReturnValue(device)
    const open = vi.spyOn(status, 'openAssistantWith').mockImplementation(() => {})
    await saveDeviceSetup({ provider: 'anthropic', model: 'claude-opus-5-5', savedAt: 1 })
    await setSuggestAfterAdd(true)
    await suggestAfterAdd('task-1', 'Call the garage tomorrow')
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('does nothing on an encrypted account without this device\'s consent, or for another provider', async () => {
    vi.spyOn(status, 'assistantStatus').mockReturnValue(device)
    const open = vi.spyOn(status, 'openAssistantWith').mockImplementation(() => {})
    await setSuggestAfterAdd(true)
    await suggestAfterAdd('task-1', 'x')
    expect(open).not.toHaveBeenCalled()
    await saveDeviceSetup({ provider: 'openai', model: 'gpt-4.1-mini', savedAt: 1 })
    await suggestAfterAdd('task-1', 'x')
    expect(open).not.toHaveBeenCalled()
  })

  it('createTaskThenSuggest creates the task first, then asks about it', async () => {
    vi.spyOn(status, 'assistantStatus').mockReturnValue(ready)
    const open = vi.spyOn(status, 'openAssistantWith').mockImplementation(() => {})
    await setSuggestAfterAdd(true)
    const id = await createTaskThenSuggest({ title: 'Call the garage tomorrow', project_id: null, labels: [] })
    expect((await getTask(id))?.title).toBe('Call the garage tomorrow')
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith(expect.objectContaining({ selected: [id], send: true })))
  })

  it('createTaskThenSuggest still returns the id when the setting is off', async () => {
    const open = vi.spyOn(status, 'openAssistantWith').mockImplementation(() => {})
    const id = await createTaskThenSuggest({ title: 'Buy milk', project_id: null, labels: [] })
    expect(typeof id).toBe('string')
    expect(open).not.toHaveBeenCalled()
  })
})
