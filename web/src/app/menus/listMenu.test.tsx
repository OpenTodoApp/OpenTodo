// @vitest-environment happy-dom
// The project menu's "List…" step (OpenSpec reusable-lists, task 4.1): the
// switches write the project's synced fields, Sort into aisles shows only while
// Reusable list is on, turning it on offers the missing aisle sections once, and
// a viewer sees the switches disabled.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { createProject, resetDeviceId } from '../../lib/ops'
import { createSection } from '../../lib/sections'
import { click, render, waitFor } from '../../ui/test-utils'
import { ListModeStep } from './ListModeStep'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

const switchNamed = (c: HTMLElement, name: string) =>
  [...c.querySelectorAll<HTMLButtonElement>('button[role="switch"]')].find((b) => b.closest('label')?.textContent?.includes(name)) ?? null

describe('List step', () => {
  it('turns the mode and aisles on and adds the missing aisle sections in store order', async () => {
    const pid = await createProject({ name: 'Groceries' })
    await createSection(pid, 'Deli')
    const r = await render(<ListModeStep projectId={pid} canEdit />)
    await waitFor(() => switchNamed(r.container, 'Reusable list') !== null, 'the switch')
    expect(switchNamed(r.container, 'Sort into aisles')).toBeNull()
    await click(switchNamed(r.container, 'Reusable list')!)
    await waitFor(async () => (await db.projects.get(pid))?.reusable === true, 'reusable written')
    await waitFor(() => switchNamed(r.container, 'Sort into aisles') !== null, 'the aisles switch')
    await click(switchNamed(r.container, 'Sort into aisles')!)
    await waitFor(() => r.container.querySelector('[data-aisle-offer]') !== null, 'the offer')
    expect((await db.projects.get(pid))?.aisles).toBe(true)
    expect(r.container.querySelector('[data-aisle-offer]')!.textContent).toContain('Produce')
    const add = [...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Add sections')!
    await click(add)
    await waitFor(() => r.container.querySelector('[data-aisle-offer]') === null, 'the offer closes')
    const sections = (await db.sections.where('project_id').equals(pid).toArray()).sort((a, b) => a.position - b.position)
    expect(sections.map((s) => s.aisle ?? null)).toEqual([null, 'produce', 'bakery', 'dairy', 'meat', 'frozen', 'pantry', 'drinks', 'household', 'personal'])
    expect(sections[3].name).toBe('Dairy and eggs')
    expect(sections[3].icon).toBe('milk')
    await r.unmount()
  })

  it('Not now leaves the sections alone; turning the mode off writes no task', async () => {
    const pid = await createProject({ name: 'Groceries' })
    const r = await render(<ListModeStep projectId={pid} canEdit />)
    await waitFor(() => switchNamed(r.container, 'Reusable list') !== null, 'the switch')
    await click(switchNamed(r.container, 'Reusable list')!)
    await waitFor(() => switchNamed(r.container, 'Sort into aisles') !== null, 'the aisles switch')
    await click(switchNamed(r.container, 'Sort into aisles')!)
    await waitFor(() => r.container.querySelector('[data-aisle-offer]') !== null, 'the offer')
    await click([...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Not now')!)
    expect(await db.sections.count()).toBe(0)
    const before = (await db.outbox.toArray()).filter((o) => o.entity === 'task').length
    await click(switchNamed(r.container, 'Reusable list')!)
    await waitFor(async () => (await db.projects.get(pid))?.reusable === false, 'off')
    expect((await db.outbox.toArray()).filter((o) => o.entity === 'task').length).toBe(before)
    await r.unmount()
  })

  it('shows a viewer the switches disabled', async () => {
    const pid = await createProject({ name: 'Groceries' })
    const r = await render(<ListModeStep projectId={pid} canEdit={false} />)
    await waitFor(() => switchNamed(r.container, 'Reusable list') !== null, 'the switch')
    expect(switchNamed(r.container, 'Reusable list')!.disabled).toBe(true)
    expect(r.container.textContent).toContain('Only editors can change this.')
    await r.unmount()
  })
})
