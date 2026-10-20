// @vitest-environment happy-dom
// The capture screen records where a task came from (OpenSpec change task-origin,
// share-capture "Capture screen"): the origin is saved in the same op batch as
// the task, and the URL still ends the notes.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import { parseShare } from '../lib/share'
import { flush, render } from '../ui/test-utils'
import { setPendingShare, ShareCapture } from './ShareCapture'

let n = 0
beforeEach(() => {
  useDatabase(`share-origin-${Date.now()}-${n++}`)
  resetDeviceId()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  vi.stubGlobal('close', () => {})
})
afterEach(() => {
  setPendingShare(null)
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function saveShare(search: string) {
  setPendingShare(parseShare(search))
  const r = await render(<ShareCapture />)
  await flush(80)
  await act(async () => { (document.getElementById('share-capture') as HTMLFormElement).requestSubmit() })
  for (let i = 0; i < 100 && (await db.tasks.count()) === 0; i++) await flush(20)
  await r.unmount()
  const [task] = await db.tasks.toArray()
  return task
}

describe('capture origin', () => {
  it('an issue page shared from the extension is saved with its issue origin, offline, in the task batch', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const task = await saveShare('?title=Login%20times%20out&url=https://github.com/o/r/issues/7')
    expect(task.origin).toEqual({ kind: 'issue', provider: 'github', id: 'o/r#7', url: 'https://github.com/o/r/issues/7', title: 'Login times out' })
    expect(task.description.endsWith('https://github.com/o/r/issues/7')).toBe(true)
    const ops = await db.outbox.toArray()
    const batches = new Set(ops.filter((o) => o.entityId === task.id && (o.field === 'title' || o.field === 'origin')).map((o) => o.ts))
    expect(ops.some((o) => o.entityId === task.id && o.field === 'origin')).toBe(true)
    // Title and origin carry the same timestamp: one mutate, one batch.
    expect(batches.size).toBe(1)
  })

  it('a text-only share has no origin', async () => {
    const task = await saveShare('?text=just%20a%20thought')
    expect(task.origin ?? null).toBeNull()
    expect((await db.outbox.toArray()).some((o) => o.field === 'origin')).toBe(false)
  })
})
