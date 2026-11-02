// @vitest-environment happy-dom
// routines-engine 3.6: "Run routine…" in the palette.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../../lib/db'
import { resetDeviceId } from '../../lib/ops'
import { createRule } from '../../lib/rules/store'
import type { Task, User } from '../../lib/types'
import { mockFetch, waitFor } from '../../ui/test-utils'
import { bulkToast, hideBulkToast } from '../bulk/toastStore'
import { commands, type PaletteContext } from './registry'
import { readsTask, runRoutineNow } from './routineCommand'

let n = 0
let requests: { path: string; body: Record<string, unknown> }[] = []

beforeEach(() => {
  useDatabase(`routine-cmd-${Date.now()}-${n++}`)
  resetDeviceId()
  requests = []
  hideBulkToast()
  mockFetch((_m, path, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    requests.push({ path, body })
    if (path.endsWith('/run')) return { run: { run_id: 'run-1', outcome: 'applied', writes: 3 }, steps: [], writes: 3, test: false }
    if (path.endsWith('/undo')) return { restored: 3, kept: 0, not_undoable: [] }
    return {}
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const ctx: PaletteContext = { route: { view: 'inbox' }, user, today: '2026-11-01', list: null, filterQuery: null, query: '', vimEnabled: false, showShortcuts: () => {}, focusQuickAdd: () => false }
const task = { id: 't1', title: 'Call the plumber' } as Task

describe('Run routine…', () => {
  it('is a command, and Go to Routines too', () => {
    const cmds = commands(ctx)
    expect(cmds.some((c) => c.id === 'routine:run' && c.label === 'Run routine…')).toBe(true)
    expect(cmds.some((c) => c.label === 'Go to Routines')).toBe(true)
  })

  it('runs it with the open task when it reads one, then offers View run and Undo', async () => {
    const id = await createRule({ name: 'Waiting follow-up', trigger: { kind: 'label.added', label_id: 'l1' }, actions: { priority: 1 } })
    const { db } = await import('../../lib/db')
    const rule = (await db.rules.get(id))!
    expect(readsTask(rule)).toBe(true)
    await runRoutineNow(rule, task)
    await waitFor(() => bulkToast()?.label === 'Waiting follow-up: 3 items written', 'the toast')
    expect(requests[0].path).toBe(`/api/v1/rules/${id}/run`)
    expect(requests[0].body.task_id).toBe('t1')
    expect(bulkToast()?.action?.label).toBe('View run')
    bulkToast()!.second!.run()
    await waitFor(() => bulkToast()?.result === '3 restored, 0 kept because they changed after the run', 'the undo result')
    expect(requests[1].path).toBe(`/api/v1/rules/${id}/runs/run-1/undo`)
  })

  it('offline: nothing runs and it says it needs a connection', async () => {
    const id = await createRule({ name: 'Groceries', trigger: { kind: 'task.created' }, actions: { priority: 1 } })
    const { db } = await import('../../lib/db')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await runRoutineNow((await db.rules.get(id))!, undefined)
    expect(bulkToast()?.label).toBe('Groceries: needs a connection')
    expect(requests.length).toBe(0)
  })
})
