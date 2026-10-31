// @vitest-environment happy-dom
// Energy on the docked panel and the task page (OpenSpec change task-energy,
// "Energy levels switch" and "Energy entry and display"): offered only while the
// switch is on, a value set elsewhere always shown with Clear, read-only for a
// viewer, and the choice reachable with the arrows and Enter.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { setEnergyLevels } from '../../lib/energy'
import { createTask } from '../../lib/ops'
import type { Label, Project, Task } from '../../lib/types'
import { click, flush, key, render, visibleText } from '../../ui/test-utils'
import { TaskFacts } from './TaskFacts'
import { open, ME, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()

const energyOf = async (id: string) => ((await db.tasks.get(id)) as Task | undefined)?.energy ?? ''
const radios = () => [...document.querySelectorAll<HTMLButtonElement>('[data-energy-choice] [role="radio"]')]

describe('energy on the docked panel', () => {
  it('switch on: Add offers Energy, a tap chooses Low and the How line reads it', async () => {
    await setEnergyLevels(true)
    const id = await createTask({ title: 'Inbox zero' })
    const view = await open(id)
    await waitFor(async () => (await db.userPrefs.toArray()).length > 0, 'the preference')
    expect(view.row('energy')).toBeNull()
    await view.add('Energy')
    await waitFor(() => radios().length === 3, 'the energy choice')
    await click(radios().find((r) => r.textContent === 'Low')!)
    await waitFor(async () => (await energyOf(id)) === 'low', 'the write')
    await waitFor(() => !!view.row('energy') && visibleText(view.row('energy')).includes('Low'), 'the part')
    await view.unmount()
  })

  it('switch off: Add does not offer Energy; a value set elsewhere shows and can be cleared', async () => {
    const id = await createTask({ title: 'Report', energy: 'deep' })
    const view = await open(id)
    await waitFor(() => !!view.row('energy'), 'the energy part')
    expect(visibleText(view.row('energy'))).toContain('Deep')
    const items = await view.addItems()
    expect(items.some((i) => i.textContent?.includes('Energy'))).toBe(false)
    await key(document.activeElement!, 'Escape')
    await click(view.valueButton('energy'))
    await waitFor(() => !!view.editor()?.querySelector('[data-facet-clear]'), 'Clear')
    await click(view.editor()!.querySelector('[data-facet-clear]')!)
    await waitFor(async () => (await energyOf(id)) === '', 'cleared')
    await view.unmount()
  })

  it('a viewer sees the value without a control', async () => {
    await setEnergyLevels(true)
    const id = await createTask({ title: 'Shared', energy: 'deep' })
    const view = await open(id, { readOnly: true })
    await waitFor(() => !!view.row('energy'), 'the energy part')
    expect(view.row('energy').tagName).not.toBe('BUTTON')
    expect(view.addButton()).toBeNull()
    await view.unmount()
  })

  it('the arrows move between the levels and Enter chooses one, without a pointer', async () => {
    const id = await createTask({ title: 'Plan', energy: 'deep' })
    const view = await open(id)
    await waitFor(() => !!view.row('energy'), 'the energy part')
    await click(view.valueButton('energy'))
    await waitFor(() => radios().length === 3, 'the energy choice')
    const deep = radios()[0]
    expect(deep.getAttribute('aria-checked')).toBe('true')
    expect(deep.tabIndex).toBe(0)
    deep.focus()
    await key(deep, 'ArrowRight')
    expect(document.activeElement).toBe(radios()[1])
    // Enter on a native button activates it.
    await click(document.activeElement!)
    await waitFor(async () => (await energyOf(id)) === 'medium', 'medium chosen')
    await view.unmount()
  })
})

describe('energy on the task page', () => {
  const page = async (id: string, readOnly = false) => {
    const task = (await db.tasks.get(id)) as Task
    const projects = (await db.projects.toArray()) as Project[]
    const r = await render(<TaskFacts task={task} userId={ME} readOnly={readOnly} projects={projects} labelMap={new Map<string, Label>()} childCount={0} />)
    await flush()
    return r
  }
  it('offers Set energy while on and unset; hides it while off; shows a value either way', async () => {
    const plain = await createTask({ title: 'Plain' })
    let r = await page(plain)
    expect(r.container.querySelector('[data-fact="energy"]')).toBeNull()
    await r.unmount()
    await setEnergyLevels(true)
    await waitFor(async () => (await db.userPrefs.toArray()).length > 0, 'the preference')
    r = await page(plain)
    await waitFor(() => !!r.container.querySelector('[data-fact="energy"]'), 'the Energy fact')
    expect(visibleText(r.container.querySelector('[data-fact="energy"]')!)).toContain('Set energy')
    await r.unmount()
    const set = await createTask({ title: 'Set', energy: 'low' })
    r = await page(set, true)
    await waitFor(() => !!r.container.querySelector('[data-fact="energy"]'), 'the Energy fact')
    expect(visibleText(r.container.querySelector('[data-fact="energy"]')!)).toContain('Low')
    expect(r.container.querySelector('[data-fact="energy"] button')).toBeNull()
    await r.unmount()
  })
})
