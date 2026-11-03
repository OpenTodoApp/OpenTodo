// A sync error is visible without hover (audit fix 3): the pill keeps its label in
// compact mode; the detail wraps beside it when expanded and, in the icon rail, is
// announced and shown in a toast on tap; other states keep the quiet pill.
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import { render, waitFor } from '../ui/test-utils'

let status = {
  state: 'idle' as string,
  pending: 0,
  lastSyncedAt: null as number | null,
  error: null as string | null,
  live: false,
  rejected: null,
}
let listeners: (() => void)[] = []
vi.mock('../lib/sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sync')>()
  return {
    ...actual,
    useSyncStatus: () => useSyncExternalStore(
      (fn: () => void) => { listeners.push(fn); return () => { listeners = listeners.filter((l) => l !== fn) } },
      () => status,
      () => status,
    ),
    requestSync: () => {},
  }
})
const { SyncStatus } = await import('./SyncStatus')
const { ToastActionHost: Toast } = await import('./ToastActionHost')
const { bulkToast, hideActionToast, hideBulkToast, showBulkToast } = await import('./bulk/toastStore')

function setState(patch: Partial<typeof status>): void {
  status = { ...status, ...patch }
  for (const l of listeners) l()
}

beforeEach(() => {
  hideBulkToast()
  hideActionToast()
  listeners = []
  status = { state: 'idle', pending: 0, lastSyncedAt: null, error: null, live: false, rejected: null }
})

describe('SyncStatus in error state', () => {
  const message = 'The server refused the exchange: bad cursor'

  it('announces the failure once and keeps the detail readable beside the pill when expanded', async () => {
    const r = await render(<SyncStatus />)
    setState({ state: 'error', error: message })
    await waitFor(() => document.querySelector('[role="alert"]') !== null, 'the visible error')
    const alert = document.querySelector('[role="alert"]')!
    // The live region holds a fixed sentence, so a changed detail is not announced again.
    expect(alert.textContent).toBe('Sync error')
    const detail = [...document.querySelectorAll('p')].find((p) => p.textContent === message)!
    expect(detail.className).toContain('line-clamp-2')
    expect(detail.className).toContain('break-words')
    expect(detail.className).not.toContain('truncate')
    expect(detail.className).not.toContain('sr-only')
    setState({ error: 'The server refused the exchange: other' })
    await waitFor(() => document.body.textContent!.includes(': other'), 'the new detail')
    expect(document.querySelector('[role="alert"]')!.textContent).toBe('Sync error')
    const pill = document.querySelector('[data-sync-status="error"]')!
    expect(pill.textContent).toContain('Sync error')
    await r.unmount()
  })

  it('in the icon rail keeps the detail for assistive technology and shows it in a toast on tap', async () => {
    const r = await render(<><SyncStatus compact /><Toast /></>)
    setState({ state: 'error', error: message })
    await waitFor(() => document.querySelector('[role="alert"]') !== null, 'the error')
    const detail = [...document.querySelectorAll('p')].find((p) => p.textContent === message)!
    expect(detail.className).toContain('sr-only')
    const pill = document.querySelector<HTMLButtonElement>('[data-sync-status="error"]')!
    expect(pill.getAttribute('aria-label')).toContain('bad cursor')
    pill.click()
    await waitFor(() => document.body.textContent!.split(message).length > 2, 'the toast with the full sentence')
    await r.unmount()
  })

  it('a tap in the icon rail keeps an Undo offer that is showing', async () => {
    const r = await render(<><SyncStatus compact /><Toast /></>)
    showBulkToast('Moved 1 task to the Trash', 'undo-1')
    setState({ state: 'error', error: message })
    await waitFor(() => document.querySelector('[role="alert"]') !== null, 'the error')
    document.querySelector<HTMLButtonElement>('[data-sync-status="error"]')!.click()
    // The detail waits behind the offer (ToastActionHost) instead of replacing it.
    expect(bulkToast()?.undoId).toBe('undo-1')
    hideBulkToast()
    await waitFor(() => document.body.textContent!.split(message).length > 2, 'the detail once the offer is gone')
    await r.unmount()
  })

  it('stays a quiet dot while synced', async () => {
    const r = await render(<SyncStatus compact />)
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(document.querySelector('[data-sync-status="idle"]')).not.toBeNull()
    await r.unmount()
  })
})
