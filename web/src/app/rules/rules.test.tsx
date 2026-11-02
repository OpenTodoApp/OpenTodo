// @vitest-environment happy-dom
// automation-rules screens: the owner's Automations card (4.5). The Routines
// page, the editor and the history are tested in ../routines/routines.test.tsx.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../../lib/db'
import { publishEncryption } from '../../lib/e2ee'
import { resetDeviceId } from '../../lib/ops'
import { click, mockFetch, render, waitFor } from '../../ui/test-utils'
import { AutomationsServerPanel } from './AutomationsSettings'

let n = 0
let requests: { method: string; path: string; body?: unknown }[] = []
let online = true
let status = { enabled: true, paused: false, rules: {} as Record<string, unknown> }
let setting = { enabled: true, locked: false, locked_by: '' }

beforeEach(() => {
  useDatabase(`rules-view-${Date.now()}-${n++}`)
  resetDeviceId()
  requests = []
  online = true
  status = { enabled: true, paused: false, rules: {} }
  setting = { enabled: true, locked: false, locked_by: '' }
  publishEncryption({ enabled: false })
  mockFetch((method, path, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ method, path, body })
    if (!online) throw new TypeError('Failed to fetch')
    if (path === '/api/v1/me/rules') return status
    if (path === '/api/v1/me/rules/paused') { status.paused = body.paused; return { enabled: status.enabled, paused: status.paused } }
    if (path === '/api/v1/settings/automations') {
      if (method === 'PUT') setting.enabled = body.enabled
      return setting
    }
    if (path === '/api/v1/webhooks') return { webhooks: [], events: [] }
    if (path === '/api/v1/me') return { user: { id: 'u1' }, mfa: {} }
    return {}
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Automations setting', () => {
  it('the owner turns automations off', async () => {
    const r = await render(<AutomationsServerPanel />)
    await waitFor(() => !!document.querySelector('[data-automations-server] [role="switch"]'), 'the switch')
    await click(document.querySelector('[data-automations-server] [role="switch"]')!)
    await waitFor(() => setting.enabled === false, 'the PUT')
    await r.unmount()
  })

  it('the variable wins: read-only, naming it', async () => {
    setting = { enabled: false, locked: true, locked_by: 'OPENTODO_AUTOMATIONS' }
    const r = await render(<AutomationsServerPanel />)
    await waitFor(() => document.body.textContent?.includes('Set by OPENTODO_AUTOMATIONS') ?? false, 'the variable named')
    expect(document.querySelector<HTMLButtonElement>('[data-automations-server] [role="switch"]')!.disabled).toBe(true)
    await r.unmount()
  })
})
