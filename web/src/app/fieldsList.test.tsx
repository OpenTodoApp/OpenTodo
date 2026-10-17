// @vitest-environment happy-dom
// Custom fields in lists (OpenSpec custom-fields): badges on rows and board cards
// ("Field badges on a card", "More than three values"), a moved task shows only
// its new project's fields, and the columns layout ("Switch to columns",
// "Narrow screen").
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createField, setFieldValue } from '../lib/fields'
import { createProject, createTask, resetDeviceId, updateTask } from '../lib/ops'
import { loadListColumns, saveViewMode } from '../lib/sections'
import { click, flush, render, mockFetch, noPublicLinks, spokenText, visibleText } from '../ui/test-utils'
import { TaskListView } from './TaskListView'

// The project header asks the server for its public links.
beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals() })

const original = window.matchMedia
let width = 1280
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  width = 1280
  window.matchMedia = ((q: string) => ({
    matches: Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? 0) <= width, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
})
afterEach(() => { window.matchMedia = original; document.body.innerHTML = '' })

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

const badgesOf = (c: HTMLElement, taskId: string) =>
  [...c.querySelectorAll(`[data-task-id="${taskId}"] [data-field-badge]`)].map((e) => e.textContent)

async function kitchen() {
  const pid = await createProject({ name: 'Kitchen' })
  const cost = await createField(pid, { name: 'Cost', type: 'number' })
  const status = await createField(pid, { name: 'Status', type: 'choice', options: 'Quote\nOrdered' })
  const paid = await createField(pid, { name: 'Paid', type: 'checkbox' })
  const client = await createField(pid, { name: 'Client', type: 'text' })
  const id = await createTask({ title: 'Tiles', project_id: pid })
  await setFieldValue(id, cost, 120)
  await setFieldValue(id, status, 'Ordered')
  await setFieldValue(id, paid, true)
  await setFieldValue(id, client, null)
  return { pid, cost, status, paid, client, id }
}

describe('field badges', () => {
  it('Field badges on a card: values in definition order, a checked box by name, nothing for an empty value', async () => {
    const { pid, id } = await kitchen()
    await saveViewMode(pid, 'board')
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => badgesOf(r.container, id).length === 3)
    expect(badgesOf(r.container, id)).toEqual(['Cost 120', 'Status Ordered', 'Paid'])
    expect(r.container.querySelector('[data-board]')).not.toBeNull()
    await r.unmount()
  })

  it('More than three values: three badges and "+2" whose accessible name lists the rest', async () => {
    const { pid, id, client } = await kitchen()
    const note = await createField(pid, { name: 'Note', type: 'text' })
    await setFieldValue(id, client, 'Acme')
    await setFieldValue(id, note, 'Grey')
    await saveViewMode(pid, 'board')
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => !!r.container.querySelector(`[data-task-id="${id}"] [data-field-more]`))
    expect(badgesOf(r.container, id)).toEqual(['Cost 120', 'Status Ordered', 'Paid'])
    const more = r.container.querySelector(`[data-task-id="${id}"] [data-field-more]`)!
    expect(visibleText(more)).toBe('+2')
    expect(spokenText(more)).toBe('2 more fields: Client Acme, Note Grey')
    await r.unmount()
  })

  it('a task moved to a project without the field shows no badge; the data keeps the value', async () => {
    const { id, cost } = await kitchen()
    const garden = await createProject({ name: 'Garden' })
    await updateTask(id, { project_id: garden })
    const r = await render(<TaskListView route={{ view: 'project', id: garden }} />)
    await waitFor(() => !!r.container.querySelector(`[data-task-id="${id}"]`))
    await flush(100)
    expect(badgesOf(r.container, id)).toEqual([])
    expect((await db.tasks.get(id))!.fields?.[cost]).toBe(120)
    await r.unmount()
  })
})

describe('columns layout', () => {
  it('Switch to columns: header cells and per-type cells, remembered per project on this device', async () => {
    const { pid, id } = await kitchen()
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => !!r.container.querySelector('[data-columns-toggle]'))
    await click(r.container.querySelector('[data-columns-toggle]')!)
    await waitFor(() => !!r.container.querySelector('[role="table"]'))
    const headers = [...r.container.querySelectorAll('[role="columnheader"]')].map((e) => e.textContent)
    expect(headers).toEqual(['Task', 'Cost', 'Status', 'Paid', 'Client'])
    const row = r.container.querySelector(`[data-columns-row="${id}"]`)!
    expect([...row.querySelectorAll('[data-cell]')].map((e) => e.textContent)).toEqual(['120', 'Ordered', 'Yes', ''])
    // Cells replace the badges; the row keeps its controls.
    expect(badgesOf(r.container, id)).toEqual([])
    expect(row.querySelector('button[aria-label^="Complete "]')).not.toBeNull()
    expect(await loadListColumns(pid)).toBe(true)
    expect(await db.outbox.filter((o) => o.field.startsWith('list-columns')).count()).toBe(0)
    await r.unmount()
  })

  it('Narrow screen: no columns and no header row, values as badges', async () => {
    const { pid, id } = await kitchen()
    width = 390
    const { saveListColumns } = await import('../lib/sections')
    await saveListColumns(pid, true)
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => badgesOf(r.container, id).length === 3)
    expect(r.container.querySelector('[role="table"]')).toBeNull()
    expect(r.container.querySelector('[data-columns-toggle]')).toBeNull()
    await r.unmount()
  })

  it('is not offered when the project has no fields', async () => {
    const pid = await createProject({ name: 'Garden' })
    await createTask({ title: 'Seeds', project_id: pid })
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => !!r.container.querySelector('[data-task-id]'))
    expect(r.container.querySelector('[data-columns-toggle]')).toBeNull()
    await r.unmount()
  })
})
