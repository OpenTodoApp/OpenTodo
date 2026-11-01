// A sync error is visible without hover (audit fix 3): the pill keeps its label in
// compact mode and the detail shows beside it; other states keep the quiet pill.
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

function setState(patch: Partial<typeof status>): void {
  status = { ...status, ...patch }
  for (const l of listeners) l()
}

beforeEach(() => {
  listeners = []
  status = { state: 'idle', pending: 0, lastSyncedAt: null, error: null, live: false, rejected: null }
})

describe('SyncStatus in error state', () => {
  it('shows the error text beside the pill, also in compact mode', async () => {
    const r = await render(<SyncStatus compact />)
    setState({ state: 'error', error: 'The server refused the exchange: bad cursor' })
    await waitFor(() => document.querySelector('[role="alert"]') !== null, 'the visible error')
    const alert = document.querySelector('[role="alert"]')!
    expect(alert.textContent).toContain('bad cursor')
    const pill = document.querySelector('[data-sync-status="error"]')!
    expect(pill.textContent).toContain('Sync error')
    await r.unmount()
  })

  it('stays a quiet dot while synced', async () => {
    const r = await render(<SyncStatus compact />)
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(document.querySelector('[data-sync-status="idle"]')).not.toBeNull()
    await r.unmount()
  })
})
