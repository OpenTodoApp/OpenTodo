// Reactions on comments (OpenSpec change editor-everywhere, design D8): one
// `reactions.<account>` op per account, so concurrent reactions never collide.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { applyOps, createTask, readField, resetDeviceId } from './ops'
import { setCurrentUserId } from './sharing'
import { createComment, myReactions, reactionCounts, setMyReactions, toggleReaction } from './comments'
import type { Op } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`reactions-${Date.now()}-${n++}`)
  resetDeviceId()
})

const remote = (entityId: string, field: string, value: unknown, ts: number, device: string): Op => ({
  id: crypto.randomUUID(), entity: 'comment', entityId, field, value, ts, device,
})

describe('reactions (editor-everywhere D8)', () => {
  it('toggles the own reaction offline as one op of the account', async () => {
    await setCurrentUserId('me')
    const task = await createTask({ title: 'Lunch' })
    const id = await createComment({ taskId: task, body: 'Pizza?' })
    await db.outbox.clear()
    await toggleReaction(id, 'heart')
    await toggleReaction(id, 'thumbs_up')
    const row = (await db.comments.get(id))!
    expect(myReactions(row, 'me')).toEqual(['thumbs_up', 'heart'])
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => o.field)).toEqual(['reactions.me', 'reactions.me'])
    expect(ops[1].value).toEqual(['thumbs_up', 'heart'])
    // Toggling again removes it; the row keeps an empty list for the account.
    await toggleReaction(id, 'heart')
    expect(myReactions((await db.comments.get(id))!, 'me')).toEqual(['thumbs_up'])
  })

  it('an unchanged list writes nothing', async () => {
    await setCurrentUserId('me')
    const task = await createTask({ title: 'Lunch' })
    const id = await createComment({ taskId: task, body: 'Pizza?' })
    await setMyReactions(id, ['check'])
    await db.outbox.clear()
    await setMyReactions(id, ['check'])
    expect(await db.outbox.count()).toBe(0)
  })

  it('two accounts reacting at once converge, in any order', async () => {
    await setCurrentUserId('me')
    const task = await createTask({ title: 'Lunch' })
    const id = await createComment({ taskId: task, body: 'Pizza?' })
    const a = remote(id, 'reactions.alice', ['thumbs_up'], 5000, 'da')
    const b = remote(id, 'reactions.bob', ['thumbs_up', 'party'], 5000, 'db')
    await applyOps([b, a])
    await applyOps([a, b])
    const row = (await db.comments.get(id))!
    expect(reactionCounts(row)).toEqual([
      { name: 'thumbs_up', accounts: ['alice', 'bob'] },
      { name: 'party', accounts: ['bob'] },
    ])
    expect(readField(row as unknown as Record<string, unknown>, 'reactions.bob')).toEqual(['thumbs_up', 'party'])
    // A later list from the same account replaces only that account's list.
    await applyOps([remote(id, 'reactions.alice', [], 6000, 'da')])
    expect(reactionCounts((await db.comments.get(id))!)).toEqual([
      { name: 'thumbs_up', accounts: ['bob'] },
      { name: 'party', accounts: ['bob'] },
    ])
  })
})
