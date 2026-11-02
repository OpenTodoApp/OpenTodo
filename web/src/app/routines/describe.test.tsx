// @vitest-environment happy-dom
// routines-describe-it (tasks 2.1-2.3): Describe it on the Routines page only
// when the person can make an assistant turn, the sheet, the draft in the
// editor with the banner (unsaved, never saved or run by itself), the
// palette's hint, and an encrypted account drafting on its device.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createProject, resetDeviceId } from '../../lib/ops'
import { publishEncryption } from '../../lib/e2ee'
import { assistantStatus, resetAssistantStatus, setAssistantStatus, type AssistantStatus } from '../../lib/assistantStatus'
import { resetCatalogueCache } from '../../lib/rules/catalogue'
import { click, mockFetch, render, waitFor } from '../../ui/test-utils'
import { navigate, parseRoute, routePath } from '../router'

const device = vi.hoisted(() => ({ draft: null as null | ((text: string) => unknown) }))
vi.mock('../../lib/assistantDevice/settings', async (orig) => ({ ...(await orig<typeof import('../../lib/assistantDevice/settings')>()), getDeviceSetup: async () => ({ provider: 'anthropic', model: 'claude-opus-5-5', key: 'sk-device' }) }))
vi.mock('../../lib/rules/describeDevice', async (orig) => ({
  ...(await orig<typeof import('../../lib/rules/describeDevice')>()),
  draftOnDevice: async (text: string) => device.draft!(text),
}))

const { RoutinePage } = await import('./RoutinePage')
const { RoutinesView } = await import('./RoutinesView')
const { commands } = await import('../palette/registry')

let n = 0
let requests: { method: string; path: string }[] = []
let answer: unknown = null

const status = (more: Partial<AssistantStatus>): AssistantStatus => ({
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic', model: 'claude-opus-5-5', consented: true,
  disclosure_version: 2, fields: [], allow_member_keys: false, own_key_set: false, operator_key_set: true, mode: 'server', ...more,
})

beforeEach(() => {
  useDatabase(`routine-describe-${Date.now()}-${n++}`)
  resetDeviceId()
  resetAssistantStatus()
  requests = []
  localStorage.clear()
  resetCatalogueCache()
  publishEncryption({ enabled: false })
  history.replaceState(null, '', '/routines')
  // The router keeps its own address: move it back too, so each test's navigation is a change.
  navigate({ view: 'rules' }, { replace: true })
  mockFetch((method, path) => {
    requests.push({ method, path })
    if (path === '/api/v1/me/rules') return { enabled: true, paused: false, rules: {} }
    if (path === '/api/v1/me/rules/catalogue') return { steps: [] }
    if (path === '/api/v1/me/rules/runs') return { runs: [] }
    if (path === '/api/v1/webhooks') return { webhooks: [], events: [] }
    if (path === '/api/v1/me') return { user: { id: 'u1' }, mfa: {} }
    if (path === '/api/v1/assistant/routine-draft') return answer
    if (path === '/api/v1/me/assistant') return assistantStatus() ?? status({})
    return {}
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const describeButton = () => document.querySelector<HTMLButtonElement>('[data-describe-routine]')

async function typeInto(el: HTMLTextAreaElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function draftOf(groceries: string, errands: string) {
  return {
    name: 'Groceries', trigger: { kind: 'schedule', at: '17:00', weekdays: [5] }, condition: null,
    steps: [
      { id: 'a', kind: 'note_text', in: { of: { literal: { project: groceries } } } },
      { id: 'b', kind: 'split_lines', in: { text: { ref: 'a' } } },
      { id: 'c', kind: 'create_tasks', in: { text: { ref: 'b' }, project: { literal: { project: errands } } } },
    ],
  }
}

describe('Describe it route', () => {
  it('reads and writes /routines/describe', () => {
    expect(parseRoute('/routines/describe')).toEqual({ view: 'rules', describe: true })
    expect(routePath({ view: 'rules', describe: true })).toBe('/routines/describe')
  })
})

describe('Describe it on the Routines page', () => {
  it('"No provider": the page offers New routine and Start from a starter only, and the palette says how to set it up', async () => {
    setAssistantStatus(status({ available: false, enabled: false, reason: 'disabled', consented: false, mode: '' }))
    const r = await render(<RoutinesView route={{ view: 'rules' }} />)
    await waitFor(() => !!document.querySelector('[data-open-starters]'), 'the page')
    expect(describeButton()).toBeNull()
    await r.unmount()
    const ctx = { route: { view: 'rules' }, user: null, today: '2026-11-06', list: null, filterQuery: null, query: 'describe', vimEnabled: false, showShortcuts: () => {}, focusQuickAdd: () => false } as never
    const ids = commands(ctx).map((c) => c.id)
    expect(ids).toContain('routine:describe-setup')
    expect(ids).not.toContain('routine:describe')
  })

  it('not consented yet: no Describe it', async () => {
    setAssistantStatus(status({ consented: false }))
    const r = await render(<RoutinesView route={{ view: 'rules' }} />)
    await waitFor(() => !!document.querySelector('[data-open-starters]'), 'the page')
    expect(describeButton()).toBeNull()
    await r.unmount()
  })

  it('"A sentence becomes a draft", then "Nothing is saved"', async () => {
    const groceries = await createProject({ name: 'Groceries' })
    const errands = await createProject({ name: 'Errands' })
    answer = { draft: draftOf(groceries, errands), note: '', errors: [], warnings: [], usage: { input: 1, output: 1, month_total: 2, cap: 0, own_key: false } }
    setAssistantStatus(status({}))
    const r = await render(<RoutinesView route={{ view: 'rules' }} />)
    await waitFor(() => !!describeButton(), 'Describe it offered')
    await click(describeButton()!)
    await waitFor(() => !!document.querySelector('[data-describe-text]'), 'the panel')
    // In place on the page, never a dialog (routines-editor-no-modals).
    expect(document.querySelector('[data-describe-panel]')).toBeTruthy()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(describeButton()!.getAttribute('aria-expanded')).toBe('true')
    await typeInto(document.querySelector('[data-describe-text]')!, 'every Friday at five, make tasks in Errands from my Groceries note')
    await click(document.querySelector('[data-describe-submit]')!)
    await waitFor(() => location.pathname === '/routines/new', 'the editor opens')
    await r.unmount()

    const page = await render(<RoutinePage route={{ view: 'rules', create: true }} />)
    await waitFor(() => document.querySelectorAll('[data-step-card]').length === 3, 'the three steps')
    expect(document.querySelector('[data-ai-drafted]')?.textContent).toContain('Drafted by AI: check each step, then Save')
    expect(document.querySelector('[data-unsaved]')).toBeTruthy()
    expect(document.querySelector<HTMLInputElement>('[data-routine-name]')!.value).toBe('Groceries')
    await page.unmount()
    // Nothing is saved and nothing ran: one draft request, no write, no run, no test.
    expect(await db.rules.count()).toBe(0)
    expect(requests.filter((q) => q.method !== 'GET')).toEqual([{ method: 'POST', path: '/api/v1/assistant/routine-draft' }])
  })

  it('a model that drafts nothing: its words in the sheet, no editor', async () => {
    answer = { draft: null, note: 'Email is not available here.', errors: [{ code: 'no_draft', message: 'x' }], warnings: [] }
    setAssistantStatus(status({}))
    const r = await render(<RoutinesView route={{ view: 'rules', describe: true }} />)
    await waitFor(() => !!document.querySelector('[data-describe-text]'), 'the sheet from /routines/describe')
    await typeInto(document.querySelector('[data-describe-text]')!, 'email me my week')
    await click(document.querySelector('[data-describe-submit]')!)
    await waitFor(() => document.querySelector('[data-describe-note]')?.textContent === 'Email is not available here.', 'the note')
    expect(location.pathname).toBe('/routines')
    await r.unmount()
  })

  it('"Encrypted account": the draft runs on the device and the server gets no draft request', async () => {
    const groceries = await createProject({ name: 'Groceries' })
    const errands = await createProject({ name: 'Errands' })
    device.draft = () => ({ draft: draftOf(groceries, errands), note: '', errors: [] })
    setAssistantStatus(status({ available: true, consented: false, mode: 'device', device: { available: true, providers: ['anthropic'], origins: [], consented_provider: 'anthropic', anthropic_models: [], default_model: '' } }))
    const r = await render(<RoutinesView route={{ view: 'rules' }} />)
    await waitFor(() => !!describeButton(), 'Describe it offered on this device')
    await click(describeButton()!)
    await typeInto(document.querySelector('[data-describe-text]')!, 'every Friday at five, make tasks in Errands from my Groceries note')
    await click(document.querySelector('[data-describe-submit]')!)
    await waitFor(() => location.pathname === '/routines/new', 'the editor opens')
    await r.unmount()
    expect(requests.some((q) => q.path === '/api/v1/assistant/routine-draft')).toBe(false)
  })
})
