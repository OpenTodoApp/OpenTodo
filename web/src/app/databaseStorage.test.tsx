// @vitest-environment happy-dom
// The Database storage card on Settings → Server → Backups (OpenSpec op-log-compaction, task 4.1).
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StorageStatus } from '../lib/types'
import { render, waitFor } from '../ui/test-utils'
import { DatabaseStoragePanel, DatabaseStorageView } from './DatabaseStoragePanel'

const MB = 1024 * 1024
const status = (patch: Partial<StorageStatus> = {}): StorageStatus => ({
  database_bytes: 48 * MB, free_bytes: 3 * MB, wal_bytes: 4 * MB, conversion: 'done',
  last_compaction: { at: Date.UTC(2026, 9, 31, 12), ops_removed: 12400, value_bytes_removed: 200 * MB, file_bytes_reclaimed: 210 * MB, more: false, converted: false },
  ...patch,
})

function serve(body: StorageStatus) {
  const fetchFn = vi.fn(async (_path: string) => new Response(JSON.stringify(body), { status: 200 }))
  vi.stubGlobal('fetch', fetchFn)
  return fetchFn
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = '' })

describe('Database storage card', () => {
  it('shows the owner the size, the free space and the last compaction', async () => {
    const fetchFn = serve(status())
    const r = await render(<DatabaseStoragePanel isOwner />)
    await waitFor(() => !!document.querySelector('[data-testid="last-compaction"]'), 'the numbers')
    expect(fetchFn.mock.calls[0][0]).toBe('/api/v1/settings/storage')
    expect(document.querySelector('[data-testid="database-size"]')!.textContent).toBe('48.0 MB, 3.0 MB free inside the file')
    const last = document.querySelector('[data-testid="last-compaction"]')!.textContent!
    expect(last).toContain('12,400 old note versions removed, 210.0 MB reclaimed')
    expect(last).toContain('Oct')
    expect(document.querySelector('[data-testid="database-storage"]')!.textContent).toContain('Database storage')
    await r.unmount()
  })

  it('says how much disk space the one-time conversion waits for', async () => {
    const r = await render(<DatabaseStorageView status={status({ conversion: 'no_space', conversion_needed_bytes: 3300 * MB, last_compaction: null })} offline={false} error={null} />)
    const card = document.querySelector('[data-testid="database-storage"]')!
    expect(card.textContent).toContain('needs 3.22 GB of free disk space; old versions still go')
    expect(card.textContent).toContain('Not yet')
    await r.unmount()
  })

  it('offline: says it needs a connection and shows no numbers', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const fetchFn = serve(status())
    const r = await render(<DatabaseStoragePanel isOwner />)
    const card = document.querySelector('[data-testid="database-storage"]')!
    expect(card.textContent).toContain('Database storage needs a connection to the server.')
    expect(card.querySelector('[data-testid="database-size"]')).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
    await r.unmount()
  })

  it('is never shown to anyone but the owner', async () => {
    const fetchFn = serve(status())
    const r = await render(<DatabaseStoragePanel isOwner={false} />)
    expect(document.querySelector('[data-testid="database-storage"]')).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
    await r.unmount()
  })
})
