// @vitest-environment happy-dom
// Subtasks in the task panel (OpenSpec change ux-overhaul, web-app "Task panel
// layout"): a checklist under the properties with a quiet add line, no heading
// until there is a subtask.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { createSubtask, createTask } from '../../lib/ops'
import { click, key, type } from '../../ui/test-utils'
import { open, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()

const section = (root: ParentNode) => root.querySelector<HTMLElement>('[data-subtasks]')!

describe('subtasks', () => {
  it('an empty task shows only the add line; Enter adds a subtask and the checklist appears with its count', async () => {
    const id = await createTask({ title: 'Renovate' })
    const { container, unmount } = await open(id)
    const s = section(container)
    expect(s.querySelector('h3')).toBeNull()
    expect(s.querySelector('input')).toBeTruthy()
    expect(s.querySelector('input')!.className).not.toContain('input')
    const input = s.querySelector('input[aria-label="Add subtask"]') as HTMLInputElement
    await type(input, 'Paint')
    await key(input, 'Enter')
    input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await waitFor(() => s.querySelectorAll('li').length === 1)
    expect(s.querySelector('h3')!.textContent).toContain('Subtasks')
    expect(s.querySelector('h3')!.textContent).toContain('0/1')
    expect(input.value).toBe('')
    await unmount()
  })

  it('ticking the checklist completes the subtask and updates the count', async () => {
    const id = await createTask({ title: 'Renovate' })
    const sub = await createSubtask(id, 'Paint')
    const { container, unmount } = await open(id)
    await waitFor(() => section(container).querySelectorAll('li').length === 1)
    const box = section(container).querySelector<HTMLButtonElement>('button[aria-label="Complete Paint"]')!
    expect(box.getAttribute('aria-pressed')).toBe('false')
    await click(box)
    await waitFor(() => !!(section(container).querySelector('button[aria-label="Reopen Paint"]')))
    expect((await db.tasks.get(sub))!.completed_at).not.toBeNull()
    expect(section(container).querySelector('h3')!.textContent).toContain('1/1')
    await unmount()
  })

  it('a viewer sees the checklist without the add line', async () => {
    const id = await createTask({ title: 'Renovate' })
    await createSubtask(id, 'Paint')
    const { container, unmount } = await open(id, { readOnly: true })
    await waitFor(() => section(container).querySelectorAll('li').length === 1)
    expect(section(container).querySelector('input')).toBeNull()
    await unmount()
  })
})
