// @vitest-environment happy-dom
// Subtasks in the task panel (OpenSpec change ux-overhaul, web-app "Task panel
// layout"): a checklist under the properties with a quiet add line, no heading
// until there is a subtask.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { createSubtask, createTask } from '../../lib/ops'
import { click, flush, key, spokenText, type, visibleText } from '../../ui/test-utils'
import { open, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()

const section = (root: ParentNode) => root.querySelector<HTMLElement>('[data-subtasks]')!

describe('subtasks', () => {
  it('an empty task shows only the add line; Enter adds a subtask and the checklist appears with its count', async () => {
    const id = await createTask({ title: 'Renovate' })
    const { container, unmount } = await open(id)
    const s = section(container)
    expect(s.querySelector('h3')).toBeNull()
    expect(s.querySelector('textarea')).toBeTruthy()
    expect(s.querySelector('textarea')!.className).not.toContain('input')
    const input = s.querySelector('textarea[aria-label="Add subtask"]') as HTMLTextAreaElement
    await type(input, 'Paint')
    await key(input, 'Enter')
    await waitFor(() => s.querySelectorAll('li').length === 1)
    expect(s.querySelector('h3')!.textContent).toContain('Subtasks')
    expect(s.querySelector('h3')!.textContent).toContain('0 of 1')
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
    expect(section(container).querySelector('h3')!.textContent).toContain('1 of 1')
    await unmount()
  })

  it('a viewer sees the checklist without the add line', async () => {
    const id = await createTask({ title: 'Renovate' })
    await createSubtask(id, 'Paint')
    const { container, unmount } = await open(id, { readOnly: true })
    await waitFor(() => section(container).querySelectorAll('li').length === 1)
    expect(section(container).querySelector('textarea')).toBeNull()
    await unmount()
  })
})

// GitHub issue 1549: a long subtask wraps while it is typed, like quick add's line.
describe('a long subtask wraps', () => {
  it('the field is one row with a hidden copy of its text that sets its height; a line break becomes a space and Enter adds the whole title', async () => {
    const id = await createTask({ title: 'Plan trip' })
    const { container, unmount } = await open(id)
    const s = section(container)
    const field = s.querySelector('textarea[aria-label="Add subtask"]') as HTMLTextAreaElement
    expect(field.getAttribute('rows')).toBe('1')
    const copy = s.querySelector<HTMLElement>('[data-add-subtask] [data-line-field-copy]')!
    expect(copy.getAttribute('aria-hidden')).toBe('true')
    expect(copy.parentElement).toBe(field.parentElement)
    await type(field, 'Ask the hotel whether the late check-in\non Friday still works')
    expect(field.value).toBe('Ask the hotel whether the late check-in on Friday still works')
    expect(copy.textContent).toBe('Ask the hotel whether the late check-in on Friday still works\u200b')
    field.focus()
    await key(field, 'Enter')
    await waitFor(() => s.querySelectorAll('li').length === 1)
    expect(s.querySelector('li')!.textContent).toBe('Ask the hotel whether the late check-in on Friday still works')
    expect(field.value).toBe('')
    await waitFor(() => document.activeElement === field)
    await unmount()
  })

  it('Enter that confirms an input method character adds nothing', async () => {
    const id = await createTask({ title: 'Plan trip' })
    const { container, unmount } = await open(id)
    const s = section(container)
    const field = s.querySelector('textarea[aria-label="Add subtask"]') as HTMLTextAreaElement
    await type(field, '荷物')
    await key(field, 'Enter', { isComposing: true })
    await flush()
    expect(s.querySelectorAll('li')).toHaveLength(0)
    expect(field.value).toBe('荷物')
    await unmount()
  })
})

// OpenSpec change paste-to-tasks, task 4.1: a pasted list in Add subtask.
describe('pasting several subtasks', () => {
  async function paste(input: HTMLTextAreaElement, text: string) {
    const e = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(e, 'clipboardData', { value: { files: [], getData: (kind: string) => (kind === 'text/plain' ? text : '') } })
    await act(async () => { input.dispatchEvent(e) })
    return e.defaultPrevented
  }

  it('one subtask per line in order, unparsed, no date, priority 4, the count updated, focus kept, one batch', async () => {
    const id = await createTask({ title: 'Plan trip' })
    const { container, unmount } = await open(id)
    const s = section(container)
    const input = s.querySelector('textarea[aria-label="Add subtask"]') as HTMLTextAreaElement
    input.focus()
    expect(await paste(input, '1. Passport\n2. Charger\n3. Tickets tomorrow p1')).toBe(true)
    await waitFor(() => !!document.querySelector('[data-paste-add]'))
    expect(document.querySelector('[data-paste-offer]')!.textContent).toContain('Add 3 subtasks, one per line?')
    expect(document.querySelector('[data-paste-add]')!.textContent).toContain('Add 3 subtasks')
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-paste-add]')!.click() })
    await waitFor(() => s.querySelectorAll('li').length === 3)
    expect([...s.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Passport', 'Charger', 'Tickets tomorrow p1'])
    expect(s.querySelector('h3')!.textContent).toContain('0 of 3')
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
    const input = section(container).querySelector('textarea[aria-label="Add subtask"]') as HTMLTextAreaElement
    await type(input, 'Pack ')
    await act(async () => { input.setSelectionRange(5, 5) })
    expect(await paste(input, 'one\ntwo')).toBe(false)
    expect(document.querySelector('[data-paste-offer]')).toBeNull()
    await unmount()
  })
})

// A quiet subtask checklist (OpenSpec change sidebar-brand-and-row-grid, design D7; web-app "Quiet subtask checklist").
describe('the quiet checklist', () => {
  const five = async () => {
    const id = await createTask({ title: 'Renovate' })
    const subs: string[] = []
    for (const title of ['Paint', 'Sand', 'Prime', 'Tile', 'Grout']) subs.push(await createSubtask(id, title))
    await db.tasks.update(subs[0], { completed_at: 1 })
    await db.tasks.update(subs[1], { completed_at: 1 })
    return id
  }

  it('Heading and items: "Subtasks", "2 of 5" and the bar in the heading, then five borderless rows, the done ones faint with their strike', async () => {
    const { container, unmount } = await open(await five())
    await waitFor(() => section(container).querySelectorAll('li').length === 5 && section(container).textContent!.includes('2 of 5'))
    const head = section(container).querySelector('[data-subtasks-head]')!
    const h3 = head.querySelector('h3')!
    expect(h3.className).toContain('font-medium')
    expect(head.className).toContain('text-meta')
    expect(h3.querySelector('svg')).toBeNull()
    expect(head.querySelector('[data-subtask-progress]')).not.toBeNull()
    // The share after the bar, read as a percentage (task-progress D3).
    const percent = head.querySelector('[data-subtask-percent]')!
    expect(visibleText(percent)).toBe('40%')
    expect(spokenText(percent)).toBe('40% done')
    expect(percent.previousElementSibling!.hasAttribute('data-subtask-progress')).toBe(true)
    for (const li of section(container).querySelectorAll('li')) {
      expect(li.className).not.toMatch(/\bborder\b|border-t/)
      expect(li.className).toContain('min-h-8')
      expect(li.className).toContain('pointer-coarse:min-h-11')
      expect(li.querySelector('[data-check-mark]')!.className).toContain('h-4 w-4')
    }
    const done = [...section(container).querySelectorAll('li')].filter((li) => li.querySelector('button[aria-pressed="true"]'))
    expect(done).toHaveLength(2)
    for (const li of done) expect(li.querySelectorAll('button')[1].className).toMatch(/text-faint line-through/)
    expect(section(container).querySelector<HTMLTextAreaElement>('textarea[aria-label="Add subtask"]')!.placeholder).toBe('Add a subtask')
    await unmount()
  })

  it('Tick offline: the row is done at once, the heading reads "3 of 5", and the change waits in the outbox', async () => {
    const { container, unmount } = await open(await five())
    await waitFor(() => section(container).textContent!.includes('2 of 5'))
    const before = await db.outbox.count()
    await click(section(container).querySelector<HTMLButtonElement>('button[aria-label="Complete Prime"]')!)
    await waitFor(() => section(container).textContent!.includes('3 of 5'))
    expect(section(container).querySelector('button[aria-label="Reopen Prime"]')).not.toBeNull()
    expect(await db.outbox.count()).toBeGreaterThan(before)
    await unmount()
  })
})

// OpenSpec change subtask-panel-order (GitHub issue 1577): subtasks change places where the task lists them.
describe('moving a subtask', () => {
  const titles = (root: ParentNode) => [...section(root).querySelectorAll('li')].map((li) => li.textContent)
  const handleOf = (root: ParentNode, title: string) => section(root).querySelector<HTMLButtonElement>(`button[aria-label="Move ${title} (Alt+Up or Alt+Down)"]`)
  const three = async () => {
    const id = await createTask({ title: 'Renovate' })
    const subs: string[] = []
    for (const title of ['Paint', 'Sand', 'Prime']) subs.push(await createSubtask(id, title))
    return { id, subs }
  }

  it('Alt+Down on the handle moves it one place, says so, writes only positions and keeps focus on the handle', async () => {
    const { id, subs } = await three()
    const { container, unmount } = await open(id)
    await waitFor(() => titles(container).length === 3)
    const before = await db.outbox.count()
    await key(handleOf(container, 'Paint')!, 'ArrowDown', { altKey: true })
    await waitFor(() => titles(container).join() === 'Sand,Paint,Prime')
    await waitFor(() => section(container).querySelector('[role="status"]')!.textContent === 'Paint moved to position 2 of 3')
    const ops = (await db.outbox.toArray()).slice(before)
    expect(ops.length).toBeGreaterThan(0)
    expect(ops.every((o) => o.field === 'position' && subs.includes(o.entityId))).toBe(true)
    await waitFor(() => document.activeElement === handleOf(container, 'Paint'))
    await key(handleOf(container, 'Prime')!, 'ArrowUp', { altKey: true, shiftKey: true })
    await waitFor(() => titles(container).join() === 'Prime,Sand,Paint')
    // At the edge nothing moves and nothing is written.
    const count = await db.outbox.count()
    await key(handleOf(container, 'Prime')!, 'ArrowUp', { altKey: true })
    expect(await db.outbox.count()).toBe(count)
    await unmount()
  })

  it('the handle opens Move up and Move down, the first one cannot move up', async () => {
    const { id } = await three()
    const { container, unmount } = await open(id)
    await waitFor(() => titles(container).length === 3)
    await click(handleOf(container, 'Paint')!)
    await waitFor(() => !!document.querySelector('[role="menuitem"]'))
    const item = (name: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent!.includes(name))!
    expect(item('Move up').matches('[aria-disabled="true"], :disabled')).toBe(true)
    await click(item('Move down'))
    await waitFor(() => titles(container).join() === 'Sand,Paint,Prime')
    await unmount()
  })

  it('a completed subtask has no handle and keeps its place; one open subtask has none either', async () => {
    const { id, subs } = await three()
    await db.tasks.update(subs[1], { completed_at: 1 })
    const { container, unmount } = await open(id)
    await waitFor(() => titles(container).length === 3)
    expect(handleOf(container, 'Sand')).toBeNull()
    await key(handleOf(container, 'Paint')!, 'ArrowDown', { altKey: true })
    await waitFor(() => titles(container).join() === 'Sand,Prime,Paint')
    await db.tasks.update(subs[2], { completed_at: 1 })
    await waitFor(() => section(container).querySelectorAll('[data-move-handle]').length === 0)
    await unmount()
  })

  it('a viewer has no handles', async () => {
    const { id } = await three()
    const { container, unmount } = await open(id, { readOnly: true })
    await waitFor(() => titles(container).length === 3)
    expect(section(container).querySelector('[data-move-handle]')).toBeNull()
    await unmount()
  })
})
