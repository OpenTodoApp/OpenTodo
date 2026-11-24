import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, resetDeviceId } from './ops'
import { setCurrentUserId } from './sharing'
import { AccountMismatchError, reseedAfterRestore, setSyncAccount } from './sync'

// Signing in to a fresh server at the same origin (a different account) gives a
// new log generation, which drives a reseed: every local field is re-sent. If
// the local data still belongs to the previous account, that would upload it
// into the new account. The reseed refuses while the signed-in account and the
// local data's account disagree (client-data-safety).

let n = 0
beforeEach(() => {
  useDatabase(`reseed-acct-${Date.now()}-${n++}`)
  resetDeviceId()
  setSyncAccount(null)
})

describe('reseed after a restore under a switched account', () => {
  it("refuses, and re-uploads nothing, when the signed-in account differs from the data's", async () => {
    await setCurrentUserId('A')
    await applyOps([{ id: 'o1', entity: 'task', entityId: 't1', field: 'title', value: 'A private task', ts: 5, device: 'd' }])
    expect(await db.tasks.count()).toBe(1)

    // B is now signed in (a fresh server), but the local marker is still A's.
    setSyncAccount('B')
    await expect(reseedAfterRestore('gen-B')).rejects.toBeInstanceOf(AccountMismatchError)
    expect((await db.outbox.toArray()).filter((o) => o.entity === 'task')).toHaveLength(0)
  })

  it('re-seeds normally when the signed-in account owns the data', async () => {
    await setCurrentUserId('A')
    await applyOps([{ id: 'o1', entity: 'task', entityId: 't1', field: 'title', value: 'Mine', ts: 5, device: 'd' }])

    setSyncAccount('A')
    await reseedAfterRestore('gen-B')
    expect((await db.outbox.toArray()).some((o) => o.entity === 'task' && o.entityId === 't1' && o.field === 'title')).toBe(true)
  })
})
