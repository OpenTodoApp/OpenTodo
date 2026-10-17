// @vitest-environment happy-dom
// Priority as one chip (OpenSpec change ux-overhaul, web-app "Task panel layout",
// task 3.5): the chip reads the level; its editor is the four options and closes on
// a pick; 1–4 inside the panel still set it.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { createTask } from '../../lib/ops'
import { click, key } from '../../ui/test-utils'
import { open, settle, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()

describe('priority chip', () => {
  it('reads the level without options until opened; a pick writes it and closes the editor', async () => {
    const id = await createTask({ title: 'Plan', priority: 2 })
    const { row, valueButton, unmount } = await open(id)
    expect(row('priority').querySelector('[data-priority-value]')?.textContent).toBe('P2')
    expect(row('priority').querySelector('[aria-pressed]')).toBeNull()
    await click(valueButton('priority'))
    await settle()
    const options = [...row('priority').querySelectorAll<HTMLButtonElement>('[role="group"] button')]
    expect(options.map((b) => b.textContent)).toEqual(['P1', 'P2', 'P3', 'P4'])
    expect(options.find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent).toBe('P2')
    await click(options[0])
    await settle()
    expect((await db.tasks.get(id))!.priority).toBe(1)
    expect(row('priority').querySelector('[role="group"]')).toBeNull()
    expect(row('priority').querySelector('[data-priority-value]')?.textContent).toBe('P1')
    expect(document.activeElement).toBe(valueButton('priority'))
    await unmount()
  })

  it('1–4 inside the panel set the priority', async () => {
    const id = await createTask({ title: 'Plan' })
    const { row, valueButton, unmount } = await open(id)
    valueButton('project').focus()
    await key(document.activeElement!, '3')
    await waitFor(() => row('priority').querySelector('[data-priority-value]')?.textContent === 'P3', 'the chip reads P3')
    expect((await db.tasks.get(id))!.priority).toBe(3)
    expect(row('priority').querySelector('[data-priority-value]')?.textContent).toBe('P3')
    await unmount()
  })

  it('a viewer reads the level with no editor', async () => {
    const id = await createTask({ title: 'Plan', priority: 1 })
    const { row, unmount } = await open(id, { readOnly: true })
    expect(row('priority').textContent).toContain('P1')
    expect(row('priority').querySelector('button')).toBeNull()
    await unmount()
  })
})
