// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { currentUserId, setCurrentUserId } from '../lib/sharing'
import { clearIfDifferentAccount } from './signOut'

// A session that ends without a sign-out (an expired or revoked cookie) leaves
// the account's local copy in place. When a different account then signs in on
// the same device, that copy must be cleared before the new account can see or
// upload it (client-data-safety).

let n = 0
async function signedInAs(user: string): Promise<void> {
  useDatabase(`acct-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId(user)
}

describe('a different account signing in on this device', () => {
  it("clears the previous account's local copy before the new account uses it", async () => {
    await signedInAs('A')
    await createTask({ title: 'A private task' })
    expect(await db.tasks.count()).toBe(1)

    const cleared = await clearIfDifferentAccount('B')
    expect(cleared).toBe(true)
    expect(await db.tasks.count()).toBe(0)
    expect(await currentUserId()).toBeNull()
  })

  it('keeps the data when the same account signs back in after an expired session', async () => {
    await signedInAs('A')
    await createTask({ title: 'Still mine' })

    const cleared = await clearIfDifferentAccount('A')
    expect(cleared).toBe(false)
    expect(await db.tasks.count()).toBe(1)
    expect(await currentUserId()).toBe('A')
  })

  it('does nothing on the first sign-in on a fresh device', async () => {
    useDatabase(`acct-${Date.now()}-${n++}`)
    resetDeviceId()
    expect(await clearIfDifferentAccount('A')).toBe(false)
  })

  it('clears data left with no recorded owner (a lost marker write)', async () => {
    useDatabase(`acct-${Date.now()}-${n++}`)
    resetDeviceId()
    // Data on the device but no userId marker: its owner is unknown.
    await createTask({ title: 'Ownerless task' })
    expect(await currentUserId()).toBeNull()
    expect(await db.tasks.count()).toBe(1)

    const cleared = await clearIfDifferentAccount('A')
    expect(cleared).toBe(true)
    expect(await db.tasks.count()).toBe(0)
  })
})
