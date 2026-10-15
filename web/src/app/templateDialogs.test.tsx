// @vitest-environment happy-dom
// Duplicate, Save as template and From a template (OpenSpec change project-templates, tasks 4.1–4.3).
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { createProject, createSubtask, createTask, resetDeviceId } from '../lib/ops'
import { createSection } from '../lib/sections'
import { click, flush, key, render } from '../ui/test-utils'
import { ProjectHeader } from './ProjectHeader'
import { TaskListView } from './TaskListView'
import { TemplateDialog } from './TemplateDialogs'

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  useDatabase(`template-ui-${Date.now()}-${n++}`)
  resetDeviceId()
  setDateTime({ date_format: 'iso', time_format: '24h', week_start: 'mon' } as never)
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean | Promise<boolean>, ms = 2000) {
  for (let t = 0; t < ms && !(await ok()); t += 20) await flush(20)
  expect(await ok()).toBe(true)
}
const button = (name: string | RegExp) => [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].find((b) => (typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? '')))

async function openMenu() {
  await click(document.querySelector('button[aria-label="Project menu"], button[aria-haspopup="menu"]')!)
  await waitFor(() => !!button('Duplicate…'))
}

describe('project menu', () => {
  it('a viewer duplicates a shared project into a personal copy and it opens', async () => {
    const p = await createProject({ name: 'Trip to Rome' })
    await createTask({ title: 'Pack', project_id: p })
    await db.memberships.put({ projectId: p, role: 'viewer', ownerId: 'other', members: [] })
    const project = (await db.projects.get(p))!
    const r = await render(<ProjectHeader project={project} />)
    mounted.push(r)
    await openMenu()
    expect(button('Rename')).toBeUndefined()
    await click(button('Duplicate…')!)
    await waitFor(() => !!document.querySelector('[data-testid="duplicate-project"]'))
    expect(document.querySelector('[data-testid="duplicate-project"]')!.textContent).toContain('A personal copy')
    expect((document.querySelector('[data-testid="duplicate-project"] input') as HTMLInputElement).value).toBe('Trip to Rome copy')
    await waitFor(() => !!document.querySelector('[data-duplicate-count]')?.textContent?.startsWith('1 open task'))
    await click(button('Duplicate')!)
    await waitFor(async () => (await db.projects.count()) === 2)
    const copy = (await db.projects.toArray()).find((x) => x.id !== p)!
    expect(copy.name).toBe('Trip to Rome copy')
    expect(await db.memberships.get(copy.id)).toBeUndefined()
    expect((await db.tasks.toArray()).filter((t) => t.project_id === copy.id).map((t) => t.title)).toEqual(['Pack'])
    expect(location.pathname).toBe(`/project/${copy.id}`)
  })

  it('saves a template file with the project, its sections, open tasks and used labels', async () => {
    const p = await createProject({ name: 'Trip to Rome' })
    const s = await createSection(p, 'Before')
    await createTask({ title: 'Pack', project_id: p, section_id: s })
    let blob: Blob | null = null
    const real = URL.createObjectURL
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => { blob = b; return 'blob:x' }, revokeObjectURL: () => {} }))
    const r = await render(<ProjectHeader project={(await db.projects.get(p))!} />)
    mounted.push(r)
    await openMenu()
    await click(button('Save as template…')!)
    await waitFor(() => !!document.querySelector('[data-template-summary]'))
    await click(button('Download')!)
    await waitFor(() => blob !== null)
    const file = JSON.parse(await blob!.text())
    expect(file).toMatchObject({ format: 'opentodo-export', version: 1, template: { day: '2026-10-14' } })
    expect(file.sections.map((x: { name: string }) => x.name)).toEqual(['Before'])
    expect(file.tasks.map((x: { title: string }) => x.title)).toEqual(['Pack'])
    expect(file.reminders).toEqual([])
    URL.createObjectURL = real
  })
})

describe('From a template', () => {
  const site = JSON.stringify({ format: 'opentodo-export', version: 1, exportedAt: '2026-10-14T08:00:00.000Z',
    labels: [{ id: 'l1', name: 'packing', color: '#22c55e' }], projects: [{ id: 'p1', name: 'Trip planning', color: '#3b82f6', position: 1 }],
    sections: [{ id: 's1', name: 'Before you go', project_id: 'p1', position: 1 }],
    tasks: [{ id: 't1', title: 'Book flights', project_id: 'p1', section_id: 's1', due: { date: '2026-10-21', time: '10:00' }, labels: ['l1'], position: 1 }] })

  async function pick(text: string, name = 'trip-planning.json') {
    const input = document.querySelector<HTMLInputElement>('[data-testid="template-file"]')!
    Object.defineProperty(input, 'files', { value: [new File([text], name, { type: 'application/json' })], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
  }

  it('starts the website template counting from today, twice as two projects', async () => {
    for (const round of [1, 2]) {
      const onClose = vi.fn()
      const r = await render(<TemplateDialog onClose={onClose} />)
      await pick(site)
      await waitFor(() => !!document.querySelector('[data-template-summary]'))
      expect(document.querySelector('[data-template-summary]')!.textContent).toContain('1 task')
      await click(button('Create')!)
      await waitFor(() => onClose.mock.calls.length > 0)
      await r.unmount()
      expect(await db.projects.count()).toBe(round)
    }
    const tasks = await db.tasks.toArray()
    expect(tasks.map((t) => t.due)).toEqual([{ date: '2026-10-21', time: '10:00' }, { date: '2026-10-21', time: '10:00' }])
    expect((await db.labels.toArray()).map((l) => l.name)).toEqual(['packing'])
  })

  it('refuses a CSV with a message naming the Import screen', async () => {
    const r = await render(<TemplateDialog onClose={() => {}} />)
    mounted.push(r)
    await pick('title,due\nBook flights,2026-10-21\n', 'tasks.csv')
    await waitFor(() => !!document.querySelector('[data-template-error]'))
    expect(document.querySelector('[data-template-error]')!.textContent).toContain('Settings → Data → Import')
    expect((button('Create') as HTMLButtonElement).disabled).toBe(true)
    expect(await db.projects.count()).toBe(0)
  })
})

describe('Shift+D', () => {
  it('copies a task with its three subtasks right below it and selects the copy', async () => {
    const p = await createProject({ name: 'Work' })
    const first = await createTask({ title: 'Release', project_id: p })
    for (const s of ['Build', 'Test', 'Ship']) await createSubtask(first, s)
    await createTask({ title: 'Next', project_id: p })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    mounted.push(r)
    await waitFor(() => !!document.querySelector('[data-task-id]'))
    await key(document.body, 'j')
    await key(document.body, 'D', { shiftKey: true })
    await waitFor(async () => (await db.tasks.count()) === 9)
    const top = (await db.tasks.toArray()).filter((t) => t.project_id === p && !t.parent_id).sort((a, b) => a.position - b.position)
    expect(top.map((t) => t.title)).toEqual(['Release', 'Release', 'Next'])
    const copy = top[1]
    expect((await db.tasks.toArray()).filter((t) => t.parent_id === copy.id)).toHaveLength(3)
    // The copy is the selected row.
    await waitFor(() => !!document.querySelector(`[data-task-id="${copy.id}"]`)?.className.includes('ring-accent'))
  })

  it('a viewer’s Shift+D writes nothing', async () => {
    const p = await createProject({ name: 'Shared' })
    await createTask({ title: 'Read only', project_id: p })
    await db.memberships.put({ projectId: p, role: 'viewer', ownerId: 'other', members: [] })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    mounted.push(r)
    await waitFor(() => !!document.querySelector('[data-task-id]'))
    const before = await db.outbox.count()
    await key(document.body, 'j')
    await key(document.body, 'D', { shiftKey: true })
    await flush(100)
    expect(await db.outbox.count()).toBe(before)
    expect(await db.tasks.count()).toBe(1)
  })
})
