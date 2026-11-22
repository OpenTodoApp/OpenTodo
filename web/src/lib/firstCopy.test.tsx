// @vitest-environment happy-dom
// The first copy of a new device (OpenSpec change first-copy-skeleton): the task
// snapshot reads as not loaded while a device that held nothing makes its first copy.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncState } from './types'

const sync = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const s = { started: true, state: 'syncing' as SyncState }
  return {
    s,
    notify: () => { for (const l of listeners) l() },
    mod: {
      FIRST_COPY_META: 'firstCopy',
      onSyncStatus: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
      syncSnapshot: () => ({ state: s.state }),
      syncStarted: () => s.started,
    },
  }
})
vi.mock('./sync', () => sync.mod)

import { db, setMeta, useDatabase } from './db'
import { holdLiveSnapshots } from './liveSnapshot'
import { resetModuleState } from './moduleState'
import { useFirstCopyPending } from './firstCopy'
import { render, waitFor } from '../ui/test-utils'

let n = 0
let seen: boolean[] = []
function Probe() { seen.push(useFirstCopyPending()); return null }
const last = () => seen[seen.length - 1]
// Still pending a while later: a slow machine can only make this pass, never fail.
// The first read decided: the phase left "unknown" (a re-render with the same answer).
const decided = () => waitFor(() => seen.length >= 2 && last() === true, 'the first read decided a copy')
const staysPending = () => expect(waitFor(() => last() === false, 'not yet', 400)).rejects.toThrow()

beforeEach(() => {
  resetModuleState()
  useDatabase(`first-copy-${Date.now()}-${n++}`)
  sync.s.started = true
  sync.s.state = 'syncing'
  seen = []
})
afterEach(() => resetModuleState())

describe('first copy of a new device', () => {
  it('is pending on an empty store until the first copy ends', async () => {
    const r = await render(<Probe />)
    await decided()
    // The first exchange marks the copy, the last page clears the marker (sync.ts).
    await setMeta('firstCopy', true)
    await staysPending()
    await setMeta('cursor', 7)
    await setMeta('firstCopy', false)
    await waitFor(() => last() === false, 'the copy ended')
    await r.unmount()
  })

  it('ends only after a long pull releases the task snapshot', async () => {
    const r = await render(<Probe />)
    await decided()
    // A multi-page first copy holds the snapshot; the last page clears the marker first.
    const release = holdLiveSnapshots()
    await setMeta('firstCopy', true)
    await setMeta('cursor', 9)
    await setMeta('firstCopy', false)
    await staysPending()
    release()
    await waitFor(() => last() === false, 'ended after the release')
    await r.unmount()
  })

  it('is not pending on a device that holds tasks (a restore re-seed included)', async () => {
    await db.tasks.put({ id: 't1', title: 'Kept', project_id: null } as never)
    await setMeta('cursor', 0)
    await setMeta('firstCopy', true)
    const r = await render(<Probe />)
    await waitFor(() => last() === false, 'shows what it has')
    await r.unmount()
  })

  it('decides again after a sign-out stops sync', async () => {
    await setMeta('cursor', 3)
    const r = await render(<Probe />)
    await waitFor(() => last() === false, 'a synced device')
    // Sign-out: sync stops, the device is cleared; the next sign-in starts sync again.
    sync.s.started = false
    sync.notify()
    await db.meta.clear()
    sync.s.started = true
    sync.notify()
    await waitFor(() => last() === true, 'a first copy again')
    await r.unmount()
  })

  it('is not pending before sync starts, or while it cannot go on', async () => {
    sync.s.started = false
    const r = await render(<Probe />)
    await waitFor(() => seen.length > 0 && last() === false, 'not started')
    sync.s.started = true
    sync.notify()
    await waitFor(() => last() === true, 'pending once sync runs')
    sync.s.state = 'offline'
    sync.notify()
    await waitFor(() => last() === false, 'not pending offline')
    await r.unmount()
  })
})
