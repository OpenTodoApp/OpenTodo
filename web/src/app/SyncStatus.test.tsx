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
const { SyncStatus, syncStale, STALE_SYNC_MS } = await import('./SyncStatus')
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

// touch-sidebar-names: on touch the dot is the state; words show whole or not at all.
describe('SyncStatus words on touch', () => {
  const words = () => document.querySelector('[data-sync-status] .ui-whole')

  it('a running sync shows no words on touch, and keeps them in its name', async () => {
    const r = await render(<SyncStatus />)
    setState({ state: 'syncing' })
    await waitFor(() => words() !== null, 'the words')
    expect(words()!.textContent).toBe('Syncing…')
    expect(words()!.className).toContain('pointer-coarse:hidden')
    expect(document.querySelector('[data-sync-status]')!.getAttribute('aria-label')).toMatch(/^Syncing…/)
    await r.unmount()
  })

  it('a state that needs attention keeps its words where they fit whole, in a control that can narrow', async () => {
    const r = await render(<SyncStatus />)
    setState({ state: 'offline', pending: 2 })
    await waitFor(() => words() !== null, 'the words')
    expect(words()!.textContent).toBe('Offline · 2 pending')
    expect(words()!.className).not.toContain('pointer-coarse:hidden')
    const button = document.querySelector('[data-sync-status]')!
    expect(button.className).toContain('pointer-coarse:w-full')
    expect(button.parentElement!.className).toContain('pointer-coarse:min-w-11')
    await r.unmount()
  })
})

// sync-leader-takeover D4: data that stopped arriving without an error never reads as synced.
describe('SyncStatus when the sync went quiet', () => {
  it('says "Not synced since" once the last sync is older than the threshold, in idle or syncing', () => {
    const now = Date.UTC(2026, 10, 16, 12, 0)
    expect(syncStale('idle', now - STALE_SYNC_MS + 60_000, now)).toBe(false)
    expect(syncStale('idle', now - STALE_SYNC_MS - 60_000, now)).toBe(true)
    expect(syncStale('syncing', now - 3_600_000, now)).toBe(true)
    // A tab that never synced: counted from when it opened.
    expect(syncStale('idle', null, now, now - 60_000)).toBe(false)
    expect(syncStale('idle', null, now, now - STALE_SYNC_MS - 60_000)).toBe(true)
    // States that already say what is wrong keep their own words.
    for (const state of ['error', 'offline', 'unauthenticated', 'locked', 'restricted', 'limited']) expect(syncStale(state, now - 3_600_000, now)).toBe(false)
  })

  it('the dot leaves "Synced" for a named warning after an hour without a sync', async () => {
    setState({ state: 'idle', error: null, pending: 0, lastSyncedAt: Date.now() - 3_600_000 })
    const r = await render(<SyncStatus />)
    const button = r.container.querySelector<HTMLElement>('[data-sync-status]')!
    await waitFor(() => button.textContent!.startsWith('Not synced since'), 'the stale words')
    expect(button.querySelector('.bg-warning')).toBeTruthy()
    expect(button.getAttribute('aria-label')).toMatch(/^Not synced since/)
    await r.unmount()
  })
})
