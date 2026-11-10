// What the assistant remembers (OpenSpec change assistant-memory, task 1.2):
// items are written locally first through the op log, queued for sync, and the
// 21st is refused on the device.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { addMemory, clearMemory, cleanMemory, deleteMemory, editMemory, liveMemory, MAX_MEMORY_ITEMS, MemoryError, memoryTexts, moveMemory } from './memory'

let n = 0
beforeEach(() => {
  useDatabase(`memory-${Date.now()}-${n++}`)
})

const texts = async () => (await liveMemory()).map((m) => m.text)

describe('memory items', () => {
  it('are added offline, queued as ops of the memory entity and kept in order', async () => {
    await addMemory('  I work Monday\nto Thursday ', 1)
    await addMemory('Mornings are for deep work', 2)
    expect(await texts()).toEqual(['I work Monday to Thursday', 'Mornings are for deep work'])
    const queued = await db.outbox.toArray()
    expect(new Set(queued.map((o) => o.entity))).toEqual(new Set(['memory']))
    expect(queued.map((o) => o.field)).toEqual(expect.arrayContaining(['text', 'position', 'created_at']))
  })

  it('refuse the 21st item, an empty or long text and a duplicate', async () => {
    for (let i = 0; i < MAX_MEMORY_ITEMS; i++) await addMemory(`Fact ${i}`)
    await expect(addMemory('One more')).rejects.toMatchObject({ code: 'full' })
    expect((await liveMemory()).length).toBe(MAX_MEMORY_ITEMS)
    await deleteMemory((await liveMemory())[0].id)
    await expect(addMemory('   ')).rejects.toBeInstanceOf(MemoryError)
    await expect(addMemory('x'.repeat(201))).rejects.toMatchObject({ code: 'invalid' })
    await expect(addMemory('fact 3')).rejects.toMatchObject({ code: 'duplicate' })
    await addMemory('One more')
    expect((await liveMemory()).length).toBe(MAX_MEMORY_ITEMS)
  })

  it('are edited, moved, deleted and cleared as tombstones', async () => {
    const a = await addMemory('Anna is my manager')
    const b = await addMemory('Likes tea')
    await editMemory(a, 'Anna is my mentor')
    await moveMemory(b, -1)
    expect(await texts()).toEqual(['Likes tea', 'Anna is my mentor'])
    await deleteMemory(b)
    expect(await memoryTexts()).toEqual(['Anna is my mentor'])
    expect((await db.memories.get(b))?.deleted_at).toBeTruthy()
    await clearMemory()
    expect(await texts()).toEqual([])
    expect(await db.memories.count()).toBe(2)
  })

  // "Memory stays in the app": routines run on a device never read memory.
  it('are never read by routines on the device', () => {
    const sources = import.meta.glob('./rules/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    expect(Object.keys(sources).length).toBeGreaterThan(5)
    for (const [file, text] of Object.entries(sources)) {
      expect(/from '\.\.\/(\.\.\/)?memory'|db\.memories|memoryTexts/.test(text), file).toBe(false)
    }
  })

  it('are cut to 200 characters for a turn', () => {
    expect([...cleanMemory('é'.repeat(210))].length).toBe(200)
  })
})
