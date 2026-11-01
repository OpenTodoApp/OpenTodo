// @vitest-environment happy-dom
// routines-editor 3.1 and 3.2: the Inbox card "Routines since your last visit"
// (each routine-inbox scenario the device decides) and Settings → Notifications.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { resetDeviceId } from '../../lib/ops'
import { markRoutinesSeen } from '../../lib/rules/inbox'
import { createRule } from '../../lib/rules/store'
import type { RoutineInboxRun } from '../../lib/types'
import { click, mockFetch, render, waitFor } from '../../ui/test-utils'
import RoutinesInboxCard from './RoutinesInboxCard'
import { RoutineRunsSection } from './RoutineRunsSection'

let n = 0
let runs: RoutineInboxRun[] = []
let requests: { method: string; path: string }[] = []

const run = (rule: string, kind: 'failure' | 'success', at: number, more: Partial<RoutineInboxRun> = {}): RoutineInboxRun => ({
  id: at, run_id: `${rule}-${at}`, rule_id: rule, at, outcome: kind === 'failure' ? 'failed' : 'applied', source: 'schedule', run_as: 'u1', test: false,
  steps_count: 1, writes: 0, duration_ms: 5, undone_at: null, failed_step: kind === 'failure' ? 0 : -1, kind, steps: [], ...more,
})

beforeEach(() => {
  useDatabase(`routines-inbox-${Date.now()}-${n++}`)
  resetDeviceId()
  localStorage.clear()
  runs = []
  requests = []
  mockFetch((method, path) => {
    requests.push({ method, path })
    if (path === '/api/v1/me/rules/runs') return { runs, seen_at: 0, hide_successes: false }
    if (path.endsWith('/dismiss')) return {}
    return {}
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const lines = () => [...document.querySelectorAll<HTMLElement>('[data-inbox-line]')].map((l) => l.textContent ?? '')
const marker = async () => (await db.userPrefs.get('me'))?.routines_seen_at ?? 0

async function routines(): Promise<{ sweep: string; digest: string }> {
  const sweep = await createRule({ name: 'Morning sweep', trigger: { kind: 'schedule', at: '07:00', weekdays: [6, 7] }, actions: { priority: 3 } })
  const digest = await createRule({ name: 'Weekly digest', trigger: { kind: 'manual' }, actions: null, steps: [{ id: 'a', kind: 'email_me', in: { subject: { literal: 'x' }, text: { literal: 'y' } } }] })
  // A device that already holds a marker (no per-device baseline).
  await markRoutinesSeen(1)
  return { sweep, digest }
}

describe('Routines card in the Inbox', () => {
  it('"Monday morning": one line per routine, the failure first, each opening its run', async () => {
    const { sweep, digest } = await routines()
    runs = [
      run(digest, 'failure', 300, { steps: [{ index: 0, step_id: 'a', kind: 'email_me', status: 'unavailable', duration_ms: 0, items: 0, output: 'none', ids: [], error: 'email_not_configured' }] }),
      run(sweep, 'success', 200, { writes: 5, steps: [{ index: 0, step_id: 'a', kind: 'change_tasks', status: 'ok', duration_ms: 2, items: 5, output: 'tasks', ids: [] }] }),
      run(sweep, 'success', 100, { writes: 4, steps: [{ index: 0, step_id: 'a', kind: 'change_tasks', status: 'ok', duration_ms: 2, items: 4, output: 'tasks', ids: [] }] }),
    ]
    const r = await render(<RoutinesInboxCard />)
    await waitFor(() => lines().length === 2, 'two lines')
    expect(lines()[0]).toBe('Weekly digest failed · Not available: outgoing email is not set up')
    expect(lines()[1]).toBe('Morning sweep ran 2 times · 9 tasks changed')
    await click(document.querySelector('[data-inbox-line="failure"] button')!)
    expect(location.pathname + location.search).toBe(`/routines/${digest}?run=${digest}-300`)
    await r.unmount()
  })

  it('"Nothing new": no card', async () => {
    await routines()
    const r = await render(<RoutinesInboxCard />)
    await waitFor(() => requests.some((q) => q.path === '/api/v1/me/rules/runs'), 'the fetch')
    expect(document.querySelector('[data-routines-inbox]')).toBeNull()
    await r.unmount()
  })

  it('"Run by an assistant" and "Seen on the phone": named, and seen after 2 seconds on screen', async () => {
    const { sweep } = await routines()
    runs = [run(sweep, 'success', 500, { source: 'mcp', writes: 3, steps: [{ index: 0, step_id: 'a', kind: 'create_tasks', status: 'ok', duration_ms: 2, items: 3, output: 'tasks', ids: [] }] })]
    // The card on screen: an observer that sees it at once.
    vi.stubGlobal('IntersectionObserver', class { constructor(private cb: (e: { isIntersecting: boolean }[]) => void) {} observe() { this.cb([{ isIntersecting: true }]) } disconnect() {} })
    const r = await render(<RoutinesInboxCard />)
    await waitFor(() => lines().length === 1, 'the line')
    expect(lines()[0]).toMatch(/^Morning sweep · run by an AI assistant · 3 tasks created · /)
    await waitFor(async () => (await marker()) === 500, 'the marker moved', 5000)
    await r.unmount()
  })

  it('"Concurrent marks": the marker never moves back', async () => {
    await markRoutinesSeen(800)
    expect(await markRoutinesSeen(750)).toBe(false)
    expect(await marker()).toBe(800)
  })

  it('a device without a marker takes its first fetch as the baseline: old successes do not flood the card', async () => {
    const sweep = await createRule({ name: 'Morning sweep', trigger: { kind: 'task.created' }, actions: { priority: 3 } })
    runs = [run(sweep, 'success', 100), run(sweep, 'failure', 90)]
    const r = await render(<RoutinesInboxCard />)
    await waitFor(() => lines().length === 1, 'the failure only')
    expect(lines()[0]).toMatch(/failed/)
    expect(localStorage.getItem('routines.inboxBaseline')).toBe('100')
    await r.unmount()
  })

  it('Dismiss hides a success line on every device (the server keeps it), Mark as seen moves the marker', async () => {
    const { sweep, digest } = await routines()
    runs = [run(digest, 'failure', 300), run(sweep, 'success', 200)]
    const r = await render(<RoutinesInboxCard />)
    await waitFor(() => lines().length === 2, 'two lines')
    await click(document.querySelector('[aria-label="Dismiss Morning sweep"]')!)
    await waitFor(() => lines().length === 1 && requests.some((q) => q.method === 'POST' && q.path === `/api/v1/rules/${sweep}/runs/${sweep}-200/dismiss`), 'dismissed')
    await click([...document.querySelectorAll('[data-routines-inbox] button')].find((b) => b.textContent === 'Mark as seen')!)
    await waitFor(async () => (await marker()) === 300, 'marked')
    await r.unmount()
  })
})

describe('Hide successful runs', () => {
  it('"Only what needs me": the card shows only the failure, and the setting is in Settings → Notifications', async () => {
    const { sweep, digest } = await routines()
    runs = [run(digest, 'failure', 300), run(sweep, 'success', 200)]
    const s = await render(<RoutineRunsSection />)
    await waitFor(() => !!document.querySelector('[data-routine-runs-switch] [role="switch"]'), 'the switch')
    await click(document.querySelector('[data-routine-runs-switch] [role="switch"]')!)
    await waitFor(async () => (await db.userPrefs.get('me'))?.routines_hide_successes === 'on', 'the setting')
    await s.unmount()
    const r = await render(<RoutinesInboxCard />)
    await waitFor(() => lines().length === 1, 'one line')
    expect(lines()[0]).toMatch(/^Weekly digest failed/)
    await r.unmount()
  })
})
