import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearLocalData, db, useDatabase } from './db'
import { resetDeviceId } from './ops'
import { clearThreads, getAutoApply, listThreads, newThread, pruneThreads, saveThread, setAutoApply, THREAD_KEEP } from './assistant'

let n = 0
beforeEach(() => {
  useDatabase(`assistant-store-${Date.now()}-${n++}`)
  resetDeviceId()
})

describe('assistant conversations on the device', () => {
  it('are never ops: saving a thread adds nothing to the outbox', async () => {
    const t = newThread('anthropic')
    t.messages.push({ role: 'user', text: 'plan my week', at: 1 }, { role: 'assistant', text: 'Here is a plan.', at: 2 })
    await saveThread(t)
    expect(await db.outbox.count()).toBe(0)
    expect((await listThreads())[0].messages).toHaveLength(2)
  })

  it('are cleared at sign-out', async () => {
    await saveThread(newThread('anthropic'))
    await db.assistantUndo.put({ id: 'u', created_at: 1, count: 1, inverse: [], clocks: [] })
    await clearLocalData()
    expect(await listThreads()).toEqual([])
    expect(await db.assistantUndo.count()).toBe(0)
  })

  it('keep at most 50 threads and 30 days', async () => {
    const now = Date.now()
    for (let i = 0; i < THREAD_KEEP + 5; i++) {
      const t = newThread('anthropic')
      t.updated_at = now - i * 1000
      await db.assistantThreads.put(t)
    }
    const old = newThread('anthropic')
    old.updated_at = now - 31 * 86_400_000
    await db.assistantThreads.put(old)
    await pruneThreads(now)
    const left = await listThreads()
    expect(left).toHaveLength(THREAD_KEEP)
    expect(left.some((t) => t.id === old.id)).toBe(false)
    await clearThreads()
    expect(await listThreads()).toEqual([])
  })

  it('auto-apply is off by default and per device', async () => {
    expect(await getAutoApply()).toBe(false)
    await setAutoApply(true)
    expect(await getAutoApply()).toBe(true)
  })
})
