// @vitest-environment happy-dom
// Restore from a backup in Settings → Backups (OpenSpec backup-restore-web, tasks 5.2–5.6).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setReauthHandler } from '../lib/api'
import type { RestoreState, StagedRestore } from '../lib/types'
import { click, flush, render, type } from '../ui/test-utils'
import { RestoreSection, RestoreSectionView, type RestoreSectionViewProps } from './RestoreSection'

const ARCHIVE = 'opentodo-20261013-030000-4f1c0a9e.tar.gz.enc'

function emptyState(patch: Partial<RestoreState> = {}): RestoreState {
  return { staged: null, last: null, safetyCopies: [], undoAvailable: false, freeBytes: 50e9, uploadLimit: 49e9, ...patch }
}

const staged: StagedRestore = {
  id: 'a'.repeat(32), source: 'archive', archive: ARCHIVE, size: 182344, encrypted: true, verified: true,
  manifest: { appVersion: '0.4.0', schemaVersion: 31, createdAt: '2026-10-13T03:00:00Z', encrypted: true },
  counts: { accounts: 2, projects: 7, tasks: 214, ops: 5120 }, createdAt: 0, expiresAt: 0,
}

interface Call { method: string; path: string; body?: unknown }

/** A fake server: routes answer from the table, every call is recorded. */
function fakeServer(routes: Record<string, (body: unknown, n: number) => [number, unknown]>) {
  const calls: Call[] = []
  const counts: Record<string, number> = {}
  const fetchFn = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, path, body })
    const key = `${method} ${path}`
    counts[key] = (counts[key] ?? 0) + 1
    const route = routes[key]
    const [status, data] = route ? route(body, counts[key]) : [404, { error: { code: 'not_found', message: 'nope' } }]
    return new Response(status === 204 ? null : JSON.stringify(data), { status })
  })
  vi.stubGlobal('fetch', fetchFn)
  return calls
}

const err = (code: string, message = code) => ({ error: { code, message } })
const base = {
  'GET /api/v1/backups/restore': () => [200, emptyState()] as [number, unknown],
  'GET /api/v1/backups/archives': () => [200, { destination: '/data/backups', archives: [{ name: ARCHIVE, size: 182344, createdAt: Date.UTC(2026, 9, 13, 3), encrypted: true }] }] as [number, unknown],
}

beforeEach(() => { document.body.innerHTML = '' })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const byText = (text: string, sel = 'button') => [...document.querySelectorAll(sel)].find((b) => b.textContent?.includes(text)) as HTMLElement | undefined

function viewProps(patch: Partial<RestoreSectionViewProps> = {}): RestoreSectionViewProps {
  const noop = () => {}
  return {
    offline: false, state: emptyState(), archives: { destination: '/data/backups', archives: [] }, archivesError: null, tab: 'destination',
    uploadProgress: null, preparing: null, error: null, onTab: noop, onPreview: noop, onUpload: noop, onUndo: noop, onDeleteCopy: noop, ...patch,
  }
}

describe('restore section view (5.2, 5.5)', () => {
  it('lists the archives of the destination with an encrypted marker', async () => {
    fakeServer(base)
    const r = await render(<RestoreSection offline={false} />)
    await flush(20)
    const list = document.querySelector('[aria-label="Archives in the destination"]')!
    expect(list.textContent).toContain(ARCHIVE)
    expect(list.textContent).toContain('encrypted')
    expect(byText('Preview')).toBeTruthy()
    await r.unmount()
  })

  it('names an unreachable destination and keeps upload possible', async () => {
    fakeServer({ ...base, 'GET /api/v1/backups/archives': () => [502, err('destination_error', 'http://nas.local/dav/: connection refused')] })
    const r = await render(<RestoreSection offline={false} />)
    await flush(20)
    expect(document.querySelector('[data-testid="restore-archives"]')!.textContent).toContain('nas.local/dav')
    expect(document.querySelector('[data-testid="restore-archives"]')!.textContent).toContain('You can still upload')
    await r.unmount()
  })

  it('offline: actions are disabled with a note', async () => {
    const r = await render(<RestoreSectionView {...viewProps({ offline: true, archives: { destination: 'x', archives: [{ name: ARCHIVE, size: 1, createdAt: 0, encrypted: false }] } })} />)
    expect(document.body.textContent).toContain('needs a connection')
    expect(byText('Preview')!.hasAttribute('disabled')).toBe(true)
    expect((document.querySelector('input[name="restore-source"]') as HTMLInputElement).disabled).toBe(true)
    await r.unmount()
  })

  it('shows upload progress in a live region', async () => {
    const r = await render(<RestoreSectionView {...viewProps({ tab: 'upload', uploadProgress: 0.42 })} />)
    const progress = document.querySelector('[data-testid="restore-upload-progress"]')!
    expect(progress.getAttribute('aria-live')).toBe('polite')
    expect(progress.textContent).toContain('42%')
    await r.unmount()
  })

  it('reports the last restore, offers undo only while its safety copy exists', async () => {
    const last = { source: 'archive' as const, archive: ARCHIVE, actorId: 'u', requestedAt: 0, finishedAt: Date.UTC(2026, 9, 14), ok: true, safetyCopy: 'opentodo.db.pre-restore-20261014-090000' }
    let r = await render(<RestoreSectionView {...viewProps({ state: emptyState({ last, undoAvailable: true }) })} />)
    expect(document.querySelector('[data-testid="restore-last"]')!.textContent).toContain(`Restored from ${ARCHIVE}`)
    expect(byText('Undo last restore')).toBeTruthy()
    await r.unmount()
    r = await render(<RestoreSectionView {...viewProps({ state: emptyState({ last, undoAvailable: false }) })} />)
    expect(byText('Undo last restore')).toBeUndefined()
    await r.unmount()
    r = await render(<RestoreSectionView {...viewProps({ state: emptyState({ last: { ...last, ok: false, error: 'archive integrity check failed' } }) })} />)
    const banner = document.querySelector('[data-testid="restore-last"]')!
    expect(banner.textContent).toContain('failed')
    expect(banner.textContent).toContain('archive integrity check failed')
    expect(banner.querySelector('[role="alert"]')).toBeTruthy()
    await r.unmount()
  })

  it('deleting a safety copy asks first, then deletes and refreshes', async () => {
    const copy = { name: 'opentodo.db.pre-restore-20261014-090000', size: 1 << 20, createdAt: Date.UTC(2026, 9, 14, 9) }
    let state = emptyState({ safetyCopies: [copy] })
    const calls = fakeServer({ ...base,
      'GET /api/v1/backups/restore': () => [200, state],
      [`DELETE /api/v1/backups/restore/safety-copies/${copy.name}`]: () => { state = emptyState(); return [204, null] },
    })
    const r = await render(<RestoreSection offline={false} />)
    await flush(20)
    await click(document.querySelector(`button[aria-label="Delete safety copy ${copy.name}"]`)!)
    await flush(10)
    const dialog = document.querySelector('[role="alertdialog"]')!
    expect(dialog.textContent).toContain(copy.name)
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    await click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Delete safety copy')!)
    await flush(30)
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true)
    expect(document.querySelector('[data-testid="restore-safety-copies"]')).toBeNull()
    await r.unmount()
  })
})

describe('preview and confirmation (5.3)', () => {
  it('asks for the passphrase, retries with it, then needs the exact word RESTORE', async () => {
    const calls = fakeServer({ ...base,
      'POST /api/v1/backups/restore/prepare': (body) => {
        const pw = (body as { passphrase?: string }).passphrase
        if (!pw) return [422, err('passphrase_required')]
        if (pw !== 'right') return [422, err('passphrase_invalid')]
        return [200, staged]
      },
    })
    const r = await render(<RestoreSection offline={false} />)
    await flush(20)
    await click(byText('Preview')!)
    await flush(20)
    const pass = document.querySelector('input[name="restore-passphrase"]') as HTMLInputElement
    expect(pass).toBeTruthy()
    await type(pass, 'wrong')
    await click(byText('Verify')!)
    await flush(20)
    expect(document.querySelector('[data-testid="restore-dialog"] [role="alert"]')!.textContent).toContain('does not open')
    await type(document.querySelector('input[name="restore-passphrase"]') as HTMLInputElement, 'right')
    await click(byText('Verify')!)
    await flush(20)
    const preview = document.querySelector('[data-testid="restore-preview"]')!
    expect(preview.textContent).toContain('2 accounts, 7 projects, 214 tasks')
    expect(document.querySelector('[data-testid="restore-consequences"]')!.textContent).toContain('sends those newer changes back')
    const go = () => byText('Restore and restart')!
    expect(go().hasAttribute('disabled')).toBe(true)
    await type(document.querySelector('input[name="restore-confirm"]') as HTMLInputElement, 'restore')
    expect(go().hasAttribute('disabled')).toBe(true)
    expect(calls.filter((c) => c.path === '/api/v1/backups/restore' && c.method === 'POST')).toHaveLength(0)
    await type(document.querySelector('input[name="restore-confirm"]') as HTMLInputElement, 'RESTORE')
    expect(go().hasAttribute('disabled')).toBe(false)
    await r.unmount()
  })

  it('a stale session gets the re-authentication prompt, then the restore is sent again', async () => {
    const reauth = vi.fn(async () => true)
    const off = setReauthHandler(reauth)
    const calls = fakeServer({ ...base,
      'POST /api/v1/backups/restore/prepare': () => [200, staged],
      'POST /api/v1/backups/restore': (_b, n) => (n === 1 ? [403, err('reauth_required')] : [202, { status: 'restarting' }]),
      'GET /healthz': () => [200, { status: 'ok' }],
    })
    const r = await render(<RestoreSection offline={false} />)
    await flush(20)
    await click(byText('Preview')!)
    await flush(20)
    await type(document.querySelector('input[name="restore-confirm"]') as HTMLInputElement, 'RESTORE')
    await click(byText('Restore and restart')!)
    await flush(30)
    expect(reauth).toHaveBeenCalledTimes(1)
    const confirms = calls.filter((c) => c.path === '/api/v1/backups/restore' && c.method === 'POST')
    expect(confirms).toHaveLength(2)
    expect(confirms[1].body).toEqual({ id: staged.id, confirm: 'RESTORE' })
    expect(document.querySelector('[data-testid="restore-restarting"]')!.textContent).toContain('Restoring and restarting')
    expect(sessionStorage.getItem('opentodo.restored')).toBe('1')
    off()
    await r.unmount()
  })

  it('cancel discards the prepared restore', async () => {
    const calls = fakeServer({ ...base, 'POST /api/v1/backups/restore/prepare': () => [200, staged], [`DELETE /api/v1/backups/restore/${staged.id}`]: () => [204, null] })
    const r = await render(<RestoreSection offline={false} />)
    await flush(20)
    await click(byText('Preview')!)
    await flush(20)
    await click([...document.querySelectorAll('[data-testid="restore-dialog"] button')].find((b) => b.textContent === 'Cancel')!)
    await flush(20)
    expect(document.querySelector('[data-testid="restore-dialog"]')).toBeNull()
    expect(calls.some((c) => c.method === 'DELETE' && c.path.endsWith(staged.id))).toBe(true)
    await r.unmount()
  })
})

describe('accessibility (5.6)', () => {
  it('every control is a native, labelled element and the dialog is modal', async () => {
    fakeServer({ ...base, 'POST /api/v1/backups/restore/prepare': () => [200, staged] })
    const r = await render(<RestoreSection offline={false} />)
    await flush(20)
    for (const b of document.querySelectorAll('[data-testid="restore-section"] button')) {
      expect((b.textContent ?? '').trim() || b.getAttribute('aria-label')).toBeTruthy()
      expect((b as HTMLButtonElement).tabIndex).toBe(0)
    }
    await click(byText('Preview')!)
    await flush(20)
    const dialog = document.querySelector('[data-testid="restore-dialog"]')!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.querySelector('input[name="restore-confirm"]')!.closest('label, div')!.textContent).toContain('Type RESTORE to confirm')
    // Colour contrast needs layout and computed colours that happy-dom does not provide.
    const axe = (await import('axe-core')).default
    const res = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    const serious = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
    await r.unmount()
  })
})
