// @vitest-environment happy-dom
// History tab (task-detail-redesign 8.1–8.3): versions with summaries, grouped
// bursts, readable values, lost changes, restoring a whole version, offline and 404.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { toVersions } from '../../lib/historyVersions'
import { createTask, resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import type { ChangeSet, HistoryPage } from '../../lib/types'
import { click, render, waitFor } from '../../ui/test-utils'
import { HistoryTab, HistoryView, type HistoryViewProps } from './HistoryTab'

const fetchHistory = vi.fn<(entity: string, id: string, before?: number) => Promise<HistoryPage>>()
vi.mock('../../lib/history', async (orig) => ({ ...(await orig<typeof import('../../lib/history')>()), fetchHistory: (...a: [string, string, number?]) => fetchHistory(...a) }))
vi.mock('../../lib/sync', async (orig) => ({ ...(await orig<typeof import('../../lib/sync')>()), syncNow: vi.fn(async () => {}) }))

const MIN = 60_000
const NOW = new Date(2026, 9, 14, 12).getTime()
let n = 0
const set = (ts: number, changes: { field: string; from?: unknown; to?: unknown; lost?: boolean }[], device = 'phone', userId = 'me'): ChangeSet =>
  ({ ts, device, userId, changes: changes.map((c) => ({ opId: `op${++n}`, from: null, to: null, ...c })) })
const page = (changeSets: ChangeSet[]): HistoryPage => ({ entity: 'task', id: 't1', changeSets, more: false })

function view(sets: ChangeSet[], over: Partial<HistoryViewProps> = {}): HistoryViewProps {
  return {
    state: 'idle', versions: toVersions(sets), author: (v) => ({ id: v.userId, name: v.userId === 'me' ? 'You' : 'Ana', device: v.device }),
    refName: (f, id) => ({ 'project_id:p-work': 'Work' } as Record<string, string>)[`${f}:${id}`], labels: new Map(), readOnly: false,
    canLoadOlder: false, onLoadOlder: vi.fn(), onRestoreValue: vi.fn(async () => {}), onRestoreVersion: vi.fn(async () => {}), now: NOW, ...over,
  }
}
const button = (root: ParentNode, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!

afterEach(() => { vi.unstubAllGlobals(); fetchHistory.mockReset() })

describe('HistoryView', () => {
  it('reads a version as a summary line with author, device and time', async () => {
    const v = await render(<HistoryView {...view([set(NOW - 2 * 60 * MIN, [{ field: 'title', from: 'a', to: 'b' }, { field: 'due', to: { date: '2026-10-20' } }])])} />)
    const item = v.container.querySelector('[data-version]')!
    expect(item.querySelector('button[aria-expanded]')!.textContent).toBe('Renamed and rescheduled')
    expect(item.textContent).toContain('You · phone · ')
    expect(item.textContent).toContain('2 h ago')
    await v.unmount()
  })

  it('shows readable values when expanded', async () => {
    const v = await render(<HistoryView {...view([set(NOW - MIN, [{ field: 'priority', from: 4, to: 1 }, { field: 'project_id', from: null, to: 'p-work' }])])} />)
    await click(v.container.querySelector('[data-version] button[aria-expanded]')!)
    const prio = v.container.querySelector('[data-change="priority"]')!
    expect(prio.textContent).toContain('Priority')
    expect(prio.querySelector('del')!.textContent).toBe('P4')
    expect(prio.querySelector('ins')!.textContent).toBe('P1')
    const proj = v.container.querySelector('[data-change="project_id"]')!
    expect(proj.textContent).toMatch(/Project\s*/)
    expect(proj.querySelector('del')!.textContent).toBe('Inbox')
    expect(proj.querySelector('ins')!.textContent).toBe('Work')
    await v.unmount()
  })

  it('marks a lost change "not applied" and keeps it restorable', async () => {
    const p = view([set(NOW - MIN, [{ field: 'title', from: 'a', to: 'lost title', lost: true }])])
    const v = await render(<HistoryView {...p} />)
    await click(v.container.querySelector('[data-version] button[aria-expanded]')!)
    const row = v.container.querySelector('[data-change="title"]')!
    expect(row.textContent).toContain('not applied')
    expect(row.className).toContain('border-dashed')
    await click(button(row, 'Restore this value'))
    expect(p.onRestoreValue).toHaveBeenCalledWith('title', 'lost title')
    await v.unmount()
  })

  it('says once that note versions older than 30 days are kept one per day (op-log-compaction 4.2)', async () => {
    const DAY = 24 * 60 * MIN
    const recent = await render(<HistoryView {...view([set(NOW - DAY, [{ field: 'description', from: 'a', to: 'b' }])])} />)
    expect(recent.container.querySelector('[data-testid="history-notes-daily"]')).toBeNull()
    await recent.unmount()
    const v = await render(<HistoryView {...view([
      set(NOW - DAY, [{ field: 'description', from: 'b', to: 'c' }]),
      set(NOW - 35 * DAY, [{ field: 'title', from: 'x', to: 'y' }]),
      set(NOW - 40 * DAY, [{ field: 'description', from: 'a2', to: 'b' }]),
      set(NOW - 41 * DAY, [{ field: 'description', from: 'a', to: 'a2' }]),
    ])} />)
    const lines = v.container.querySelectorAll('[data-testid="history-notes-daily"]')
    expect(lines).toHaveLength(1)
    expect(lines[0].textContent).toBe('Older note versions are kept one per day (UTC).')
    // Above the first note revision older than 30 days, not above the older title change.
    expect(lines[0].closest('li')!.querySelector('[data-version]')!.textContent).toContain('notes')
    await v.unmount()
  })

  it('hides restore controls for viewers', async () => {
    const v = await render(<HistoryView {...view([set(NOW - MIN, [{ field: 'title', from: 'a', to: 'b' }])], { readOnly: true })} />)
    await click(v.container.querySelector('[data-version] button[aria-expanded]')!)
    expect(v.container.textContent).not.toContain('Restore')
    await v.unmount()
  })

  it('states offline and missing history with empty states', async () => {
    const off = await render(<HistoryView {...view([], { state: 'offline' })} />)
    expect(off.container.textContent).toContain('History needs a connection to the server')
    expect(off.container.querySelector('[data-version]')).toBeNull()
    await off.unmount()
    const none = await render(<HistoryView {...view([], { state: 'empty' })} />)
    expect(none.container.textContent).toContain('No history on the server yet')
    await none.unmount()
  })
})

describe('HistoryTab', () => {
  let k = 0
  beforeEach(async () => {
    useDatabase(`histtab-${Date.now()}-${k++}`)
    resetDeviceId()
    await setCurrentUserId('me')
  })

  it('groups a burst on one phone into one version', async () => {
    fetchHistory.mockResolvedValue(page([set(NOW - 3 * MIN, [{ field: 'title', from: 'a', to: 'b' }]), set(NOW - MIN, [{ field: 'priority', from: 4, to: 2 }])]))
    const v = await render(<HistoryTab taskId="t1" readOnly={false} />)
    await waitFor(() => !!v.container.querySelector('[data-version]'), 'the versions')
    expect(v.container.querySelectorAll('[data-version]')).toHaveLength(1)
    expect(v.container.querySelector('[data-version] button[aria-expanded]')!.textContent).toBe('Renamed and reprioritised')
    await v.unmount()
  })

  it('labels a public link tick as the link, not as the member who created it', async () => {
    const tick = { ...set(NOW - MIN, [{ field: 'completed_at', from: null, to: NOW - MIN }], 'public:l1', 'me'), device_label: 'Public link (Grandma)' }
    fetchHistory.mockResolvedValue(page([tick]))
    const v = await render(<HistoryTab taskId="t1" readOnly={false} />)
    await waitFor(() => !!v.container.querySelector('[data-version]'), 'the versions')
    const meta = [...v.container.querySelectorAll('[data-version] div.text-meta')].pop()!.textContent!
    expect(meta).toMatch(/^Public link \(Grandma\) · /)
    expect(meta).not.toContain('You')
    await v.unmount()
  })

  it('says offline without asking the server and lists no versions', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    const v = await render(<HistoryTab taskId="t1" readOnly={false} />)
    await waitFor(() => v.container.textContent!.includes('History needs a connection'), 'the offline note')
    expect(fetchHistory).not.toHaveBeenCalled()
    expect(v.container.textContent).toContain('History needs a connection to the server')
    await v.unmount()
  })

  it('shows the 404 empty state', async () => {
    fetchHistory.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }))
    const v = await render(<HistoryTab taskId="t1" readOnly={false} />)
    await waitFor(() => v.container.textContent!.includes('No history on the server yet'), 'the empty state')
    expect(v.container.textContent).toContain('No history on the server yet')
    await v.unmount()
  })

  it('restores a whole version after one confirmation: two ops, then one new version', async () => {
    const id = await createTask({ title: 'Now', due: { date: '2026-10-30' } })
    await db.outbox.clear()
    const old = set(NOW - 60 * MIN, [{ field: 'title', from: 'Was', to: 'Then' }, { field: 'due', from: null, to: { date: '2026-10-20' } }])
    fetchHistory.mockResolvedValueOnce(page([old]))
    const v = await render(<HistoryTab taskId={id} readOnly={false} />)
    await waitFor(() => !!v.container.querySelector('[data-version] button[aria-expanded]'), 'the versions')
    await click(v.container.querySelector('[data-version] button[aria-expanded]')!)
    await click(button(v.container, 'Restore this version'))
    const dialog = document.querySelector('[data-testid="confirm-dialog"]')!
    expect(dialog.textContent).toContain('Title')
    expect(dialog.textContent).toContain('Due date')
    const restoredSet = set(NOW, [{ field: 'title', from: 'Now', to: 'Then' }, { field: 'due', from: { date: '2026-10-30' }, to: { date: '2026-10-20' } }], 'laptop')
    fetchHistory.mockResolvedValueOnce(page([old, restoredSet]))
    await click(button(dialog, 'Restore'))
    await waitFor(() => v.container.querySelectorAll('[data-version]').length === 2, 'the restored version listed')
    const task = (await db.tasks.get(id))!
    expect(task.title).toBe('Then')
    expect(task.due).toEqual({ date: '2026-10-20' })
    const ops = (await db.outbox.toArray()).map((o) => o.field).sort()
    expect(ops).toEqual(['due', 'title'])
    expect(fetchHistory).toHaveBeenCalledTimes(2)
    expect(v.container.querySelectorAll('[data-version]')).toHaveLength(2)
    expect(v.container.querySelector('[role="status"]')!.textContent).toContain('Restored title, due date')
    await v.unmount()
  })
})
