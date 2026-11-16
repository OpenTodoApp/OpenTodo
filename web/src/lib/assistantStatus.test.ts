// The assistant's status on a demo instance (demo-mode): known without a request.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>()
  return { ...original, api: { getMyAssistant: vi.fn(async () => { throw new Error('not on the demo') }) } }
})

import { api } from './api'
import { assistantStatus, DEMO_STATUS, refreshAssistantStatus } from './assistantStatus'
import { setDemo } from './demoState'

describe('refreshAssistantStatus', () => {
  afterEach(() => setDemo(null))

  it('on a demo instance, takes the demo status without asking the server', async () => {
    setDemo({ sandboxHours: { idle: 2, max: 24 } } as never)
    expect(await refreshAssistantStatus()).toEqual(DEMO_STATUS)
    expect(assistantStatus()).toEqual(DEMO_STATUS)
    expect(api.getMyAssistant).not.toHaveBeenCalled()
  })
})
