// @vitest-environment happy-dom
// Priority as a part of the How line (OpenSpec changes ux-overhaul and
// task-panel-facets): the part reads the level; its popover is the four options and
// closes on a pick; 1–4 inside the panel still set it. Level 4 unnamed is no
// priority (priority-none): a faint placeholder, None in the picker, issue #1225.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { createTask } from '../../lib/ops'
import { setPriorityNames } from '../../lib/priority'
import { click, key, visibleText } from '../../ui/test-utils'
import { open, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()

describe('priority part', () => {
  it('reads the level without options until opened; a pick writes it and closes the editor', async () => {
    const id = await createTask({ title: 'Plan', priority: 2 })
    const { row, valueButton, editor, unmount } = await open(id)
    expect(visibleText(row('priority'))).toBe('P2')
    expect(editor()).toBeNull()
    await click(valueButton('priority'))
    await waitFor(() => !!editor()?.querySelector('[role="group"] button'), 'the priority editor')
    const options = [...editor()!.querySelectorAll<HTMLButtonElement>('[role="group"] button')]
    expect(options.map((b) => b.textContent)).toEqual(['P1', 'P2', 'P3', 'None'])
    expect(options.find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent).toBe('P2')
    await click(options[0])
    await waitFor(async () => (await db.tasks.get(id))!.priority === 1 && !editor(), 'the priority written')
    expect((await db.tasks.get(id))!.priority).toBe(1)
    expect(editor()).toBeNull()
    await waitFor(() => visibleText(row('priority')) === 'P1', 'the part reads P1')
    expect(document.activeElement).toBe(valueButton('priority'))
    await unmount()
  })

  it('no priority (#1225): a new task shows a faint placeholder, None in the picker takes a priority away again', async () => {
    const id = await createTask({ title: 'Consider a new bike' })
    expect((await db.tasks.get(id))!.priority).toBe(4)
    const { row, valueButton, editor, unmount } = await open(id)
    expect(visibleText(row('priority'))).toBe('Priority')
    expect(row('priority').className).toContain('text-faint')
    await click(valueButton('priority'))
    await waitFor(() => !!editor()?.querySelector('[role="group"] button'), 'the priority editor')
    let options = [...editor()!.querySelectorAll<HTMLButtonElement>('[role="group"] button')]
    expect(options.find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent).toBe('None')
    expect(options[3].getAttribute('aria-label')).toBe('No priority')
    await click(options[0])
    await waitFor(() => visibleText(row('priority')) === 'P1', 'the part reads P1')
    await click(valueButton('priority'))
    await waitFor(() => !!editor()?.querySelector('[role="group"] button'), 'the priority editor again')
    options = [...editor()!.querySelectorAll<HTMLButtonElement>('[role="group"] button')]
    await click(options.find((b) => b.textContent === 'None')!)
    await waitFor(async () => (await db.tasks.get(id))!.priority === 4 && visibleText(row('priority')) === 'Priority', 'no priority again')
    expect(row('priority').className).toContain('text-faint')
    await unmount()
  })

  it('a name for level 4 wins over no priority (priority-none)', async () => {
    setPriorityNames(['', '', '', 'Whenever'])
    const id = await createTask({ title: 'Repaint the fence' })
    const { row, valueButton, editor, unmount } = await open(id)
    expect(visibleText(row('priority'))).toBe('Whenever')
    expect(row('priority').className).not.toContain('text-faint')
    await click(valueButton('priority'))
    await waitFor(() => !!editor()?.querySelector('[role="group"] button'), 'the priority editor')
    expect([...editor()!.querySelectorAll('[role="group"] button')].map((b) => b.textContent)).toEqual(['P1', 'P2', 'P3', 'Whenever'])
    await unmount()
  })

  it('1–4 inside the panel set the priority', async () => {
    const id = await createTask({ title: 'Plan' })
    const { row, valueButton, unmount } = await open(id)
    valueButton('project').focus()
    await key(document.activeElement!, '3')
    await waitFor(() => visibleText(row('priority')) === 'P3', 'the part reads P3')
    expect((await db.tasks.get(id))!.priority).toBe(3)
    await unmount()
  })

  it('a viewer reads the level with no editor', async () => {
    const id = await createTask({ title: 'Plan', priority: 1 })
    const { row, unmount } = await open(id, { readOnly: true })
    expect(row('priority').textContent).toContain('P1')
    expect(row('priority').tagName).not.toBe('BUTTON')
    await unmount()
  })
})
