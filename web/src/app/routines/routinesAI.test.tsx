// @vitest-environment happy-dom
// routines-ai-step on the device: the AI card's estimate and Test asking first
// (4.1, "Estimate first"), Apply without asking with its reason, fallback
// notice and budget (4.2), the proposal review, the Inbox card and the bell
// (4.3), and accepting the assistant's terms for routines (1.3).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAssistantStatus, type AssistantStatus } from '../../lib/assistantStatus'
import { db, useDatabase } from '../../lib/db'
import { publishEncryption } from '../../lib/e2ee'
import { createTask, resetDeviceId } from '../../lib/ops'
import { resetCatalogueCache } from '../../lib/rules/catalogue'
import { inboxLines } from '../../lib/rules/inbox'
import { describeItem } from '../../lib/rules/proposal'
import { createRule } from '../../lib/rules/store'
import type { RoutineAIUsage, RoutineInboxRun, RoutineProposal, RoutineStep } from '../../lib/types'
import { click, mockFetch, render, waitFor } from '../../ui/test-utils'
import { UserAssistantSettings } from '../assistant/AssistantSettings'
import { RoutineEditor } from './RoutineEditor'
import { ProposalView } from './ProposalReview'

let n = 0
let requests: { method: string; path: string; body?: Record<string, unknown> }[] = []
let usage: RoutineAIUsage = { days: [], budget: 20000, mode: null }

const status = (extra: Partial<AssistantStatus> = {}): AssistantStatus => ({
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'claude-opus-5-5', consented: true,
  disclosure_version: 3, fields: ['task titles and descriptions'], allow_member_keys: false, own_key_set: false, operator_key_set: true, routines_consented: true, ...extra,
})

beforeEach(() => {
  useDatabase(`routines-ai-${Date.now()}-${n++}`)
  resetDeviceId()
  requests = []
  usage = { days: [], budget: 20000, mode: null }
  localStorage.clear()
  resetCatalogueCache()
  publishEncryption({ enabled: false })
  setAssistantStatus(status())
  mockFetch((method, path, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ method, path, body })
    if (path === '/api/v1/me/rules/catalogue') return { steps: [] }
    if (path === '/api/v1/rules/test' || /\/api\/v1\/rules\/[^/]+\/run$/.test(path)) return { run: { outcome: 'applied', failed_step: -1 }, steps: [{ index: 0, step_id: 'b', kind: 'ask_ai', status: body?.call_ai ? 'ok' : 'skipped', duration_ms: 1, items: 1, output: 'lines', ids: [], tokens: body?.call_ai ? 3412 : undefined, estimate: 3500, preview: body?.call_ai ? ['Send the slides'] : [] }], writes: 1, test: true }
    if (/\/api\/v1\/rules\/[^/]+\/ai-usage$/.test(path)) return usage
    if (path === '/api/v1/me/assistant') return status({ routines_consented: true })
    if (path === '/api/v1/me') return { user: { id: 'u1' }, mfa: {} }
    return {}
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const button = (text: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!

async function notesRoutine(more: RoutineStep[] = []): Promise<string> {
  const task = await createTask({ title: 'Team meeting', description: 'x'.repeat(12000) })
  const steps: RoutineStep[] = [
    { id: 'g', kind: 'get_task', in: { task: { literal: { task } } } },
    { id: 'a', kind: 'note_text', in: { of: { ref: 'g' } } },
    { id: 'b', kind: 'ask_ai', in: { instruction: { literal: 'list the action items, one per line' }, context: { ref: 'a' }, answer: { literal: 'lines' } } },
    { id: 'c', kind: 'create_tasks', in: { text: { ref: 'b' } } },
    ...more,
  ]
  return createRule({ name: 'Notes to tasks', trigger: { kind: 'manual' }, actions: null, steps })
}

describe('AI steps in the editor', () => {
  it('"Estimate first": the card estimates, Test asks before anything is sent, then shows the answer and the real count', async () => {
    const id = await notesRoutine()
    const rule = (await db.rules.get(id))!
    const r = await render(<RoutineEditor rule={rule} onBack={() => undefined} />)
    await waitFor(() => !!document.querySelector('[data-preview="ai"]'), 'the AI card preview')
    expect(document.querySelector('[data-preview="ai"]')!.textContent).toMatch(/The AI answer appears when you Test · about [\d,.]+ tokens/)
    await click(button('Test'))
    await waitFor(() => /This test sends the inputs to Anthropic \(Claude\) and uses about [\d,.]+ tokens/.test(document.body.textContent ?? ''), 'the question first')
    expect(requests.some((x) => x.path.includes('/run') && x.body?.call_ai)).toBe(false)
    const confirm = button('Test', document.querySelector('[data-testid="confirm-dialog"]')!)
    await click(confirm)
    await waitFor(() => !!document.querySelector('[data-test-tokens]'), 'the real count')
    expect(requests.find((x) => x.path.endsWith(`/rules/${id}/run`))?.body).toMatchObject({ test: true, call_ai: true })
    expect(document.querySelector('[data-test-tokens]')!.textContent).toContain('3,412')
    expect(document.querySelector('[data-test-ai="b"]')!.textContent).toContain('Written by AI')
    await r.unmount()
  })

  it('"Not allowed": Apply without asking is disabled with the reason when the routine also completes tasks', async () => {
    const id = await notesRoutine([{ id: 'd', kind: 'change_tasks', in: { tasks: { ref: 'c' }, set: { literal: { state: 'complete' } } } }])
    const rule = (await db.rules.get(id))!
    const r = await render(<RoutineEditor rule={rule} onBack={() => undefined} />)
    await waitFor(() => !!document.querySelector('[data-routine-ai] [role="switch"]'), 'the AI settings')
    const sw = document.querySelector<HTMLButtonElement>('[data-routine-ai] [role="switch"]')!
    expect(sw.disabled).toBe(true)
    expect(document.querySelector('[data-routine-ai]')!.textContent).toContain('Turn this off to complete tasks: Apply without asking only adds and sets fields')
    await r.unmount()
  })

  it('the fallback notice, turning it on again (a new op) and the budget', async () => {
    const id = await notesRoutine()
    await db.rules.update(id, { ai_apply: 'auto' })
    usage = { days: [{ day: new Date().toISOString().slice(0, 10), tokens: 3200 }], budget: 20000, mode: { auto: false, asked: true, reason: 'failures', at: 1 } }
    const rule = (await db.rules.get(id))!
    const r = await render(<RoutineEditor rule={rule} onBack={() => undefined} />)
    await waitFor(() => /Apply without asking was turned off after two failed runs in a row/.test(document.body.textContent ?? ''), 'the notice')
    expect(document.querySelector('[data-ai-usage]')!.textContent).toMatch(/AI tokens today: 3,200 of 20,000/)
    const sw = document.querySelector<HTMLButtonElement>('[data-routine-ai] [role="switch"]')!
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await click(sw)
    await waitFor(() => sw.getAttribute('aria-checked') === 'true', 'on again')
    await waitFor(async () => (await db.outbox.toArray()).some((o) => o.field === 'ai_apply' && JSON.stringify(o.value).includes('auto')), 'one ai_apply op')
    await r.unmount()
  })
})

const proposal: RoutineProposal = {
  id: 'p1', rule_id: 'r1', run_id: 'run1', created_at: 1, expires_at: Date.UTC(2026, 10, 8), state: 'waiting', items: 9, applied: 0, skipped: 0, encrypted: false,
  list: Array.from({ length: 9 }, (_, i) => ({ key: `e:task:t${i}`, kind: 'change' as const, entity: 'task', id: `t${i}`, fields: { section_id: 'work' }, before: { section_id: null }, ai: i < 3 })),
}
const names = { title: (id: string) => `Task ${id}`, projectName: () => '', labelName: () => '', sectionName: (id: string) => (id === 'work' ? 'Work' : '') }

describe('Reviewing a proposal', () => {
  it('"Apply some": two unticked, Apply sends the other seven; Written by AI is marked', async () => {
    const applied: string[][] = []
    const r = await render(<ProposalView proposal={proposal} names={names} online busy={false} error="" onApply={(k) => applied.push(k)} onDismiss={() => undefined} />)
    const boxes = [...document.querySelectorAll<HTMLInputElement>('[data-proposal-item] input[type="checkbox"]')]
    expect(boxes).toHaveLength(9)
    expect(document.querySelector('[data-proposal-item="e:task:t0"]')!.textContent).toContain('Written by AI')
    expect(document.querySelector('[data-proposal-item="e:task:t0"]')!.textContent).toContain('Section: none → Work')
    await click(boxes[7])
    await click(boxes[8])
    await click(document.querySelector<HTMLButtonElement>('[data-proposal-apply]')!)
    expect(applied).toEqual([proposal.list!.slice(0, 7).map((i) => i.key)])
    await r.unmount()
  })

  it('offline: Apply and Dismiss need a connection', async () => {
    const r = await render(<ProposalView proposal={proposal} names={names} online={false} busy={false} error="" onApply={() => undefined} onDismiss={() => undefined} />)
    expect(document.querySelector<HTMLButtonElement>('[data-proposal-apply]')!.disabled).toBe(true)
    expect(document.body.textContent).toContain('Needs a connection')
    await r.unmount()
  })

  it('describes created tasks, comments and side effects', () => {
    expect(describeItem({ key: 'e:task:n', kind: 'create', entity: 'task', id: 'n', fields: { title: 'Book the room' }, ai: true }, names).text).toBe('Create the task “Book the room”')
    expect(describeItem({ key: 's:0', kind: 'notify', ai: false, side: { kind: 'notify', notice: { text: 'Done' } } }, names).text).toBe('Notify me: Done')
  })
})

const inboxRun = (extra: Partial<RoutineInboxRun>): RoutineInboxRun => ({
  id: 1, run_id: 'run1', rule_id: 'r1', at: 10, outcome: 'proposal', source: 'schedule', run_as: 'u1', test: false, steps_count: 3, writes: 0, duration_ms: 5,
  undone_at: null, failed_step: -1, kind: 'proposal', ...extra,
})

describe('the Inbox card', () => {
  it('"Friday evening": a waiting proposal comes first and reads "proposal waiting · Review"; an auto run offers Undo', () => {
    const lines = inboxLines([
      inboxRun({ rule_id: 'r2', run_id: 'run2', kind: 'success', outcome: 'applied', writes: 6, ai_auto: true, steps: [{ index: 1, step_id: 'c', kind: 'create_tasks', status: 'ok', duration_ms: 1, items: 6, output: 'tasks', ids: [] }] }),
      inboxRun({}),
    ], [{ id: 'r1', name: 'Sort inbox' }, { id: 'r2', name: 'Meeting notes to tasks' }], () => 'today')
    expect(lines.map((l) => l.text)).toEqual(['Sort inbox · proposal waiting · Review', 'Meeting notes to tasks · 6 tasks created by AI · today'])
    expect(lines[1].auto).toBe(true)
  })
})

describe('consent for routines', () => {
  it('"Existing consent": Accept for routines shows the paragraph and accepts', async () => {
    const accepted = vi.fn()
    const r = await render(<UserAssistantSettings status={status({ routines_consented: false })} usage={null} autoApply={false} suggestAfterAdd={false} onSuggestAfterAdd={() => undefined} connected busy={false} error={null} cleared={false}
      onWithdraw={() => undefined} onOwnKey={() => undefined} onAutoApply={() => undefined} onClear={() => undefined} onAcceptRoutines={accepted} />)
    expect(document.querySelector('[data-consent-routines]')!.textContent).toContain('on a schedule or after an event')
    await click(document.querySelector<HTMLButtonElement>('[data-assistant-accept-routines]')!)
    expect(accepted).toHaveBeenCalled()
    await r.unmount()
  })
})
