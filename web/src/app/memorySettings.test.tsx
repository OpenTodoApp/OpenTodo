// @vitest-environment happy-dom
// assistant-memory 3.1 ("Managing memory"): Settings lists the items under the
// assistant, adds, edits, reorders and deletes them locally first, refuses a
// 21st, and Clear all asks before deleting every one.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { addMemory, liveMemory, MAX_MEMORY_ITEMS } from '../lib/memory'
import { click, key, render, type, waitFor } from '../ui/test-utils'
import { MemorySettings } from './assistant/MemorySettings'

let n = 0
beforeEach(() => {
  useDatabase(`memory-settings-${Date.now()}-${n++}`)
})

const texts = (c: HTMLElement) => [...c.querySelectorAll('[data-memory-text]')].map((b) => b.textContent)

describe('Memory in Settings', () => {
  it('shows while the assistant is unavailable only when items are kept, so they can be removed', async () => {
    const { container, unmount } = await render(<MemorySettings available={false} />)
    expect(container.querySelector('[data-memory-list]')).toBeNull()
    await addMemory('Anna is my manager')
    await waitFor(() => texts(container).length === 1, 'the kept item')
    await unmount()
  })

  it('adds, edits, moves and deletes an item', async () => {
    const { container, unmount } = await render(<MemorySettings available />)
    await waitFor(() => !!container.querySelector('[data-memory-add]'), 'Add')
    await click(container.querySelector('[data-memory-add]')!)
    const input = container.querySelector<HTMLInputElement>('[data-memory-input]')!
    await type(input, 'Anna is my manager')
    await key(input, 'Enter')
    await waitFor(() => texts(container).length === 1, 'the item')
    await click(container.querySelector('[data-memory-add]')!)
    const second = container.querySelector<HTMLInputElement>('[data-memory-input]')!
    await type(second, 'Does not work on Fridays')
    await key(second, 'Enter')
    await waitFor(() => texts(container).length === 2, 'two items')
    expect(texts(container)).toEqual(['Anna is my manager', 'Does not work on Fridays'])

    // Edit in place.
    await click(container.querySelectorAll('[data-memory-text]')[0])
    const edit = container.querySelector<HTMLInputElement>('[data-memory-input]')!
    await type(edit, 'Anna is my mentor')
    await key(edit, 'Enter')
    await waitFor(() => texts(container)[0] === 'Anna is my mentor', 'the edit')

    // Alt+Down moves it.
    await key(container.querySelectorAll('[data-memory-text]')[0], 'ArrowDown', { altKey: true })
    await waitFor(() => texts(container)[0] === 'Does not work on Fridays', 'the move')

    // Delete is a tombstone.
    await click(container.querySelector('[data-memory-item] [data-memory-delete]')!)
    await waitFor(() => texts(container).length === 1, 'the delete')
    expect((await liveMemory()).map((m) => m.text)).toEqual(['Anna is my mentor'])
    expect(await db.memories.count()).toBe(2)
    await unmount()
  })

  it('refuses a 21st item and clears all after asking', async () => {
    for (let i = 0; i < MAX_MEMORY_ITEMS; i++) await addMemory(`Fact ${i}`)
    const { container, unmount } = await render(<MemorySettings available />)
    await waitFor(() => texts(container).length === MAX_MEMORY_ITEMS, 'the items')
    expect(container.querySelector('[data-memory-add]')).toBeNull()
    expect(container.querySelector('[data-memory-full]')?.textContent).toBe('Memory holds 20 items. Remove one first.')
    await click(container.querySelector('[data-memory-clear]')!)
    const confirm = await waitFor(() => !!document.querySelector('[role="alertdialog"]'), 'the confirmation').then(() => [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find((b) => b.textContent === 'Clear all')!)
    await click(confirm)
    await waitFor(async () => (await liveMemory()).length === 0, 'cleared')
    await unmount()
  })
})
