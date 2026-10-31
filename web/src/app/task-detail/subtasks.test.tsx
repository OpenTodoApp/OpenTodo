// @vitest-environment happy-dom
// Subtasks in the task panel (OpenSpec change ux-overhaul, web-app "Task panel
// layout"): a checklist under the properties with a quiet add line, no heading
// until there is a subtask.
import 'fake-indexeddb/auto'
import { act } from 'react'
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
    // The circle is drawn inside the button, so a touch screen's 44 px minimum enlarges
    // the tap area and not the circle (a giant checkbox on an iPhone).
    expect(box.className).not.toContain('border-2')
    expect(box.querySelector('[data-check-mark]')!.className).toContain('h-4 w-4')
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

// OpenSpec change paste-to-tasks, task 4.1: a pasted list in Add subtask.
describe('pasting several subtasks', () => {
  async function paste(input: HTMLInputElement, text: string) {
    const e = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(e, 'clipboardData', { value: { files: [], getData: (kind: string) => (kind === 'text/plain' ? text : '') } })
    await act(async () => { input.dispatchEvent(e) })
    return e.defaultPrevented
  }

  it('one subtask per line in order, unparsed, no date, priority 4, the count updated, focus kept, one batch', async () => {
    const id = await createTask({ title: 'Plan trip' })
    const { container, unmount } = await open(id)
    const s = section(container)
    const input = s.querySelector('input[aria-label="Add subtask"]') as HTMLInputElement
    input.focus()
    expect(await paste(input, '1. Passport\n2. Charger\n3. Tickets tomorrow p1')).toBe(true)
    await waitFor(() => !!document.querySelector('[data-paste-add]'))
    expect(document.querySelector('[data-paste-offer]')!.textContent).toContain('Add 3 subtasks, one per line?')
    expect(document.querySelector('[data-paste-add]')!.textContent).toContain('Add 3 subtasks')
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-paste-add]')!.click() })
    await waitFor(() => s.querySelectorAll('li').length === 3)
    expect([...s.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Passport', 'Charger', 'Tickets tomorrow p1'])
    expect(s.querySelector('h3')!.textContent).toContain('0/3')
    const subs = (await db.tasks.toArray()).filter((x) => x.parent_id === id)
    expect(subs.every((x) => x.due === null && x.priority === 4)).toBe(true)
    // Locally first, as one batch: every op of the paste shares one clock in the outbox.
    const ops = (await db.outbox.toArray()).filter((o) => subs.some((x) => x.id === o.entityId))
    expect(new Set(ops.map((o) => o.ts)).size).toBe(1)
    await waitFor(() => document.activeElement === input)
    expect(input.value).toBe('')
    await unmount()
  })

  it('a field with text is left alone', async () => {
    const id = await createTask({ title: 'Plan trip' })
    const { container, unmount } = await open(id)
    const input = section(container).querySelector('input[aria-label="Add subtask"]') as HTMLInputElement
    await type(input, 'Pack ')
    await act(async () => { input.setSelectionRange(5, 5) })
    expect(await paste(input, 'one\ntwo')).toBe(false)
    expect(document.querySelector('[data-paste-offer]')).toBeNull()
    await unmount()
  })
})
