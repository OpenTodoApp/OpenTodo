// @vitest-environment happy-dom
// automation-rules screens: the Rules page (4.1), the editor (4.2), the history
// (4.3) and the owner's Automations card (4.5).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../../lib/db'
import { createLabel } from '../../lib/labels'
import { createTask, resetDeviceId } from '../../lib/ops'
import { publishEncryption } from '../../lib/e2ee'
import { createRule } from '../../lib/rules/store'
import type { RuleRun } from '../../lib/types'
import { click, mockFetch, render, type, waitFor } from '../../ui/test-utils'
import { AutomationsServerPanel } from './AutomationsSettings'
import { RuleDialog } from './RuleDialog'
import { RulesView } from './RulesView'

let n = 0
let requests: { method: string; path: string; body?: unknown }[] = []
let online = true
let status = { enabled: true, paused: false, rules: {} as Record<string, unknown> }
let setting = { enabled: true, locked: false, locked_by: '' }
let runs: RuleRun[] = []

beforeEach(() => {
  useDatabase(`rules-view-${Date.now()}-${n++}`)
  resetDeviceId()
  requests = []
  online = true
  status = { enabled: true, paused: false, rules: {} }
  setting = { enabled: true, locked: false, locked_by: '' }
  runs = []
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
    if (path.endsWith('/runs')) return { runs }
    if (path === '/api/v1/webhooks') return { webhooks: [], events: [] }
    if (path === '/api/v1/me') return { user: { id: 'u1' }, mfa: {} }
    return {}
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const rows = () => [...document.querySelectorAll<HTMLElement>('[data-rule-row]')]
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.includes(label))!

describe('Rules page', () => {
  it('reads the list: switch, summary, last run and 7-day count', async () => {
    const waiting = await createLabel({ name: 'waiting' })
    const id = await createRule({ name: 'Waiting', trigger: { kind: 'label.added', label_id: waiting }, actions: { priority: 3 } })
    status.rules[id] = { last_run: Date.UTC(2026, 9, 20, 9), runs_7d: 4 }
    const r = await render(<RulesView />)
    await waitFor(() => rows().length === 1 && /4 runs in 7 days/.test(rows()[0].textContent ?? ''), 'the row with its counts')
    expect(rows()[0].textContent).toMatch(/When label waiting is added → priority 3/)
    await click(rows()[0].querySelector('[role="switch"]')!)
    await waitFor(() => rows()[0].querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'false', 'the rule off')
    await r.unmount()
  })

  it('says automations are off and offers to resume paused rules', async () => {
    await createRule({ name: 'A', trigger: { kind: 'task.created' }, actions: { priority: 1 } })
    status.enabled = false
    let r = await render(<RulesView />)
    await waitFor(() => document.body.textContent?.includes('Automations are off on this server') ?? false, 'the off notice')
    await r.unmount()
    status = { enabled: true, paused: true, rules: {} }
    r = await render(<RulesView />)
    await waitFor(() => document.body.textContent?.includes('Your rules are paused') ?? false, 'the paused notice')
    await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Resume')!)
    expect(requests.some((q) => q.path === '/api/v1/me/rules/paused' && (q.body as { paused: boolean }).paused === false)).toBe(true)
    await r.unmount()
  })

  it('offline: rules are listed with no counts and a note', async () => {
    online = false
    await createRule({ name: 'A', trigger: { kind: 'task.created' }, actions: { priority: 1 } })
    const r = await render(<RulesView />)
    await waitFor(() => rows().length === 1, 'the row')
    expect(document.body.textContent).toContain('run on the server after the next sync')
    await r.unmount()
  })

  it('deletes a rule through its dialog', async () => {
    await createRule({ name: 'Gone', trigger: { kind: 'task.created' }, actions: { priority: 1 } })
    const r = await render(<RulesView />)
    await waitFor(() => rows().length === 1, 'the row')
    await click(document.querySelector('[aria-label="Menu for rule Gone"]')!)
    await click(menuItem('Delete rule'))
    const confirm = [...document.querySelectorAll<HTMLElement>('[role="alertdialog"] button, [role="dialog"] button')].find((b) => b.textContent === 'Delete rule')!
    await click(confirm)
    await waitFor(() => rows().length === 0, 'no rows')
    await r.unmount()
  })

  it('shows a rule’s history with a deleted task by id', async () => {
    const id = await createRule({ name: 'Sweep', trigger: { kind: 'task.created' }, actions: { priority: 1 } })
    const task = await createTask({ title: 'Water plants' })
    runs = [{ id: 1, rule_id: id, occurrence: 'sched:1', at: Date.UTC(2026, 9, 18, 18), outcome: 'applied', changes: [{ task_id: task, fields: {} }, { task_id: 'gone-1234567', fields: {} }], depth: 2 }]
    const r = await render(<RulesView />)
    await waitFor(() => rows().length === 1, 'the row')
    await click(document.querySelector('[aria-label="Menu for rule Sweep"]')!)
    await click(menuItem('History'))
    await waitFor(() => !!document.querySelector('[data-rule-run="applied"]'), 'the run')
    document.querySelector<HTMLElement>('[data-rule-run] details')!.setAttribute('open', '')
    await waitFor(() => /Water plants/.test(document.querySelector('[data-rule-run]')!.textContent ?? ''), 'the title')
    expect(document.querySelector('[data-rule-run]')!.textContent).toContain('Deleted task (gone-123)')
    await r.unmount()
  })
})

describe('Rule editor', () => {
  it('builds a rule and shows the live count', async () => {
    const errand = await createLabel({ name: 'errand' })
    await createTask({ title: 'Buy milk', labels: [errand] })
    await createTask({ title: 'Other' })
    const done = vi.fn()
    const r = await render(<RuleDialog me="u1" onClose={done} draft={{ name: '', trigger: { kind: 'task.created' }, condition: { labels: { all: [errand] } }, actions: {} }} />)
    await waitFor(() => /1 open task matches now/.test(document.querySelector('[data-rule-count]')?.textContent ?? ''), 'the live count')
    await type(document.querySelector<HTMLInputElement>('[data-testid="rule-dialog"] input')!, 'Errands first')
    const priority = [...document.querySelectorAll<HTMLSelectElement>('[data-rule-actions] select')][0]
    priority.value = '1'
    priority.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => !(document.querySelector('[data-testid="rule-dialog"] button[type="submit"]') as HTMLButtonElement).disabled, 'save enabled')
    await click(document.querySelector('[data-testid="rule-dialog"] button[type="submit"]')!)
    await waitFor(() => done.mock.calls.length === 1, 'closed after save')
    await r.unmount()
  })

  it('disables the comment for an encrypted account and names terms not carried over', async () => {
    publishEncryption({ enabled: true })
    const r = await render(<RuleDialog me="u1" onClose={() => {}} draft={{ name: 'x', trigger: { kind: 'task.created' }, condition: null, actions: {}, dropped: ['search: "oat milk"'] }} />)
    expect(document.querySelector<HTMLTextAreaElement>('[data-rule-actions] textarea')!.disabled).toBe(true)
    expect(document.querySelector('[data-rule-dropped]')!.textContent).toContain('search: "oat milk" cannot be used in a rule')
    await r.unmount()
  })
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
