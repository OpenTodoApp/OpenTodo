// @vitest-environment happy-dom
// Web restore helpers (OpenSpec backup-restore-web, tasks 5.1 and 5.4).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'
import { consumeRestored, markRestoring, needsPassphrase, restoreErrorMessage, waitForRestart } from './restore'

afterEach(() => { vi.unstubAllGlobals() })

describe('restore error copy (5.1)', () => {
  it('maps every documented code to plain words', () => {
    const msg = (code: string, m = 'detail') => restoreErrorMessage(new ApiError(400, code, m))
    expect(msg('passphrase_required')).toContain('Enter the passphrase')
    expect(msg('passphrase_invalid')).toContain('does not open')
    expect(msg('newer_schema', 'archive schema 40, this binary 31')).toContain('archive schema 40')
    expect(msg('integrity', 'checksum')).toContain('not a usable OpenTodo backup')
    expect(msg('insufficient_storage', '2 GiB needed')).toContain('2 GiB needed')
    expect(msg('not_found')).toContain('Choose the archive again')
    expect(msg('conflict')).toContain('backup is running')
    expect(restoreErrorMessage(new TypeError('offline'))).toContain('needs a connection')
    expect(needsPassphrase(new ApiError(422, 'passphrase_invalid', ''))).toBe(true)
    expect(needsPassphrase(new ApiError(400, 'integrity', ''))).toBe(false)
  })

  it('an upload refused by a reverse proxy (413) explains the body limit', async () => {
    class FakeXHR {
      status = 0
      responseText = ''
      upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null }
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      withCredentials = false
      open() {}
      setRequestHeader() {}
      send() {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent)
        this.status = 413
        this.responseText = '<html>413 Request Entity Too Large</html>'
        this.onload?.()
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
    const progress: number[] = []
    const err = await api.uploadRestoreArchive(new Blob(['x']), (f) => progress.push(f)).catch((e: unknown) => e)
    expect(progress).toEqual([0.5])
    expect(err).toBeInstanceOf(ApiError)
    expect(restoreErrorMessage(err)).toContain('reverse proxy')
  })
})

describe('waiting for the restart (5.4)', () => {
  function clock() {
    let t = 0
    return { now: () => t, sleep: async (ms: number) => { t += ms } }
  }

  it('reloads once the server went away and came back', async () => {
    const answers = [true, false, false, true] // old process, down, down, back
    const fetchFn = vi.fn(async () => {
      const up = answers.shift()
      if (up === false) throw new TypeError('down')
      return new Response('{}', { status: 200 })
    })
    const c = clock()
    await expect(waitForRestart({ fetchFn: fetchFn as unknown as typeof fetch, ...c })).resolves.toBe(true)
    expect(fetchFn).toHaveBeenCalledTimes(4)
    expect(c.now()).toBe(4000)
  })

  it('gives up after the budget and reports it', async () => {
    const c = clock()
    const fetchFn = vi.fn(async () => { throw new TypeError('down') })
    await expect(waitForRestart({ fetchFn: fetchFn as unknown as typeof fetch, budgetMs: 60_000, ...c })).resolves.toBe(false)
    expect(fetchFn).toHaveBeenCalledTimes(60)
  })

  it('the restored note is shown once after the reload', () => {
    markRestoring()
    expect(consumeRestored()).toBe(true)
    expect(consumeRestored()).toBe(false)
  })
})
