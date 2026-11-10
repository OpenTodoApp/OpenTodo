// A remember proposal in the review (OpenSpec change assistant-memory, task
// 2.1, "Remember a working week"): it reads "Remember: …" with a checkbox, only
// applying it creates the item (with device assistant:<id>), Undo removes it, and
// with Memory full it is left out with a note.
import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { resetDeviceId } from './ops'
import { applyChanges, reviewChangeSet, undoChanges } from './assistant'
import { addMemory, liveMemory, MAX_MEMORY_ITEMS } from './memory'
import type { ProposedChange } from './assistantTypes'

let n = 0
beforeEach(() => {
  useDatabase(`assistant-memory-${Date.now()}-${n++}`)
  resetDeviceId()
})

const remember = (id: string, text: string): ProposedChange => ({ entity: 'memory', entityId: id, create: true, patch: { text, position: 5, created_at: 5 } })

it('reviews, applies and undoes a memory item', async () => {
  const review = await reviewChangeSet([remember('m1', 'Does not work on Fridays')])
  expect(review.items.map((i) => [i.title, i.checked])).toEqual([['Remember: Does not work on Fridays', true]])
  expect(await db.memories.count()).toBe(0)
  const undo = await applyChanges(review.items.map((i) => i.change))
  expect((await liveMemory()).map((m) => m.text)).toEqual(['Does not work on Fridays'])
  expect((await db.outbox.toArray()).every((o) => o.device.startsWith('assistant:'))).toBe(true)
  await undoChanges(undo!.id)
  expect(await liveMemory()).toEqual([])
})

it('leaves out a memory item when Memory is full', async () => {
  for (let i = 0; i < MAX_MEMORY_ITEMS - 1; i++) await addMemory(`Fact ${i}`)
  const review = await reviewChangeSet([remember('a', 'Twentieth'), remember('b', 'Twenty-first')])
  expect(review.items.map((i) => i.title)).toEqual(['Remember: Twentieth'])
  expect(review.dropped).toEqual(['Memory holds 20 items, so “Twenty-first” was left out. Remove one in Settings first.'])
})
