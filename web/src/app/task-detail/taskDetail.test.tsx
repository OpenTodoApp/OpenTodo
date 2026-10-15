// @vitest-environment happy-dom
// The redesigned task panel (OpenSpec task-detail-redesign 2.2–2.5, 3.1–3.4, 4.1):
// header menu, properties rows, entity pickers, priority and the implicit "You".
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { activeLabels, createLabel } from '../../lib/labels'
import { archiveProject, createProject, createSubtask, createTask, resetDeviceId, setTaskCompleted, setTaskParent } from '../../lib/ops'
import { createSection, moveTaskToSection } from '../../lib/sections'
import { setCurrentUserId } from '../../lib/sharing'
import type { Label, Membership, Project } from '../../lib/types'
import { click, flush, key, render, type } from '../../ui/test-utils'
import { TaskDetail } from './TaskDetail'

const ME = 'u-me'
let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  useDatabase(`taskdetail-${Date.now()}-${n++}`)
  resetDeviceId()
  setCurrentUserId(ME)
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: true, weekStart: 1 })
})
afterEach(() => {
  vi.useRealTimers()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  document.body.innerHTML = ''
})

const settle = () => flush(40)
/** Live queries resolve in steps (task → project → sections); wait for the condition. */
async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

async function open(taskId: string, opts: { readOnly?: boolean; onClose?: () => void; onOpen?: (id: string) => void } = {}) {
  const projects = (await db.projects.toArray()) as Project[]
  const labels = new Map(((await db.labels.toArray()) as Label[]).map((l) => [l.id, l]))
  const r = await render(<TaskDetail taskId={taskId} userId={ME} projects={projects} labelMap={labels} onClose={opts.onClose ?? (() => {})} onOpen={opts.onOpen} readOnly={opts.readOnly} />)
  await settle()
  const row = (name: string) => r.container.querySelector(`[data-property="${name}"]`) as HTMLElement
  const valueButton = (name: string) => row(name).querySelector('button[aria-labelledby]') as HTMLButtonElement
  const options = (name: string) => [...row(name).querySelectorAll('[role="option"]')].map((o) => o.textContent ?? '')
  const pick = async (name: string, text: string) => {
    await click([...row(name).querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes(text))!)
    await settle()
  }
  return { ...r, row, valueButton, options, pick }
}

async function membership(projectId: string, ...members: string[]) {
  const m: Membership = { projectId, role: 'admin', ownerId: members[0], members: members.map((userId) => ({ userId, name: userId === ME ? 'Me' : userId, email: `${userId}@example.com`, role: 'editor' })) }
  await db.memberships.put(m)
}

describe('header (2.2)', () => {
  it('Delete in the header menu trashes the task and closes the panel; the menu works by keyboard', async () => {
    const id = await createTask({ title: 'Old errand' })
    const onClose = vi.fn()
    const { container, unmount } = await open(id, { onClose })
    const trigger = container.querySelector('button[aria-label="Task actions"]') as HTMLButtonElement
    trigger.focus()
    await click(trigger)
    await settle()
    expect(document.activeElement?.textContent).toContain('Copy link')
    await key(document.activeElement!, 'End')
    expect(document.activeElement?.textContent).toContain('Delete')
    await click(document.activeElement!)
    await settle()
    expect((await db.tasks.get(id))!.deleted_at).not.toBeNull()
    expect(onClose).toHaveBeenCalled()
    await unmount()
  })
})

describe('properties rows (2.3)', () => {
  it('values read as values: project, priority and the due date in the user format, no input boxes', async () => {
    const work = await createProject({ name: 'Work' })
    const id = await createTask({ title: 'Plan', project_id: work, priority: 2, due: { date: '2026-10-15', time: '09:00' } })
    const { container, row, unmount } = await open(id)
    expect(row('project').textContent).toContain('Work')
    expect(row('priority').querySelector('[aria-pressed="true"]')?.textContent).toBe('P2')
    expect(row('due').textContent).toContain('Thu 15 Oct · 09:00')
    expect(container.querySelector('section[aria-label="Properties"] input')).toBeNull()
    expect(row('estimate').textContent).toContain('No estimate')
    await unmount()
  })

  it('Enter on the Due row opens its editor with focus in it; Escape closes it with focus back on the row', async () => {
    const id = await createTask({ title: 'Plan', due: { date: '2026-10-15' } })
    const { row, valueButton, unmount } = await open(id)
    const button = valueButton('due')
    button.focus()
    await key(button, 'Enter')
    await click(button) // Enter on a native button activates it
    await settle()
    const input = row('due').querySelector('input') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(document.activeElement).toBe(input)
    await key(input, 'Escape')
    await settle()
    expect(row('due').querySelector('input')).toBeNull()
    expect(document.activeElement).toBe(valueButton('due'))
    await unmount()
  })
})

describe('priority (2.4)', () => {
  it('sets the priority with the segmented control and with 1–4 inside the panel', async () => {
    const id = await createTask({ title: 'Plan' })
    const { row, valueButton, unmount } = await open(id)
    await click([...row('priority').querySelectorAll('button')].find((b) => b.textContent === 'P1')!)
    await settle()
    expect((await db.tasks.get(id))!.priority).toBe(1)
    valueButton('project').focus()
    await key(document.activeElement!, '3')
    await settle()
    expect((await db.tasks.get(id))!.priority).toBe(3)
    expect(row('priority').querySelector('[aria-pressed="true"]')?.textContent).toBe('P3')
    await unmount()
  })
})

describe('viewer mode (2.5)', () => {
  it('shows values without editors, a read-only note, no Complete or Delete, and keeps the composer', async () => {
    const id = await createTask({ title: 'Shared plan', priority: 2 })
    const { container, unmount } = await open(id, { readOnly: true })
    expect(container.querySelector('[role="note"]')?.textContent).toContain('Read-only')
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.includes('Complete'))).toBe(false)
    expect(container.querySelector('section[aria-label="Properties"] button[aria-labelledby]')).toBeNull()
    await click(container.querySelector('button[aria-label="Task actions"]')!)
    await settle()
    expect([...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)).not.toContain('Delete')
    expect(container.querySelector('textarea')).toBeTruthy()
    await unmount()
  })
})

describe('entity pickers (3.1–3.4)', () => {
  it('Project: creates a project offline and moves the task into it', async () => {
    const id = await createTask({ title: 'Plant tomatoes' })
    const { row, valueButton, pick, unmount } = await open(id)
    await click(valueButton('project'))
    await settle()
    await type(row('project').querySelector('input[role="combobox"]') as HTMLInputElement, 'Garden')
    await pick('project', 'Create “Garden”')
    const garden = (await db.projects.toArray()).find((p) => p.name === 'Garden')!
    expect(garden).toBeTruthy()
    expect((await db.tasks.get(id))!.project_id).toBe(garden.id)
    expect((await db.outbox.toArray()).some((o) => o.entity === 'project' && o.entityId === garden.id)).toBe(true)
    await unmount()
  })

  it('Project: follows the copy after a move into a shared project, and lists an archived current project first', async () => {
    const shared = await createProject({ name: 'Family' })
    await membership(shared, ME, 'u-bob')
    const id = await createTask({ title: 'Book flights' })
    const onOpen = vi.fn()
    const first = await open(id, { onOpen })
    await click(first.valueButton('project'))
    await settle()
    await first.pick('project', 'Family')
    expect(onOpen).toHaveBeenCalledWith(expect.not.stringMatching(new RegExp(`^${id}$`)))
    await first.unmount()

    const old = await createProject({ name: 'Old stuff' })
    const t2 = await createTask({ title: 'Archived task', project_id: old })
    await archiveProject(old)
    const second = await open(t2)
    await click(second.valueButton('project'))
    await settle()
    expect(second.options('project')[0]).toContain('Old stuff')
    expect(second.options('project')[0]).toContain('archived')
    await second.unmount()
  })

  it('Section: a subtask follows its parent; a top-level task picks a section offline', async () => {
    const p = await createProject({ name: 'Home' })
    const doing = await createSection(p, 'Doing')
    await createSection(p, 'Done')
    const parent = await createTask({ title: 'Renovate', project_id: p })
    await moveTaskToSection(parent, doing)
    const sub = await createSubtask(parent, 'Paint')
    const a = await open(sub)
    await waitFor(() => !!a.row('section'))
    expect(a.row('section').textContent).toContain('Doing')
    expect(a.row('section').textContent).toContain('follow their parent')
    expect(a.valueButton('section')).toBeNull()
    await a.unmount()

    const top = await createTask({ title: 'Buy paint', project_id: p })
    const b = await open(top)
    await waitFor(() => !!b.row('section'))
    await click(b.valueButton('section'))
    await settle()
    await b.pick('section', 'Done')
    const done = (await db.sections.toArray()).find((s) => s.name === 'Done')!
    expect((await db.tasks.get(top))!.section_id).toBe(done.id)
    expect(b.row('section').textContent).toContain('Done')
    await b.unmount()
  })

  it('Parent: excludes the task and its descendants; a completed current parent is listed first, marked', async () => {
    const a = await createTask({ title: 'Task A' })
    await createSubtask(a, 'Task B')
    await createTask({ title: 'Task C' })
    const v = await open(a)
    await click(v.valueButton('parent'))
    await settle()
    const opts = v.options('parent')
    expect(opts.some((o) => o.includes('Task A'))).toBe(false)
    expect(opts.some((o) => o.includes('Task B'))).toBe(false)
    expect(opts.some((o) => o.includes('Task C'))).toBe(true)
    await v.unmount()

    const parent = await createTask({ title: 'Finished parent' })
    const child = await createTask({ title: 'Child' })
    await setTaskParent(child, parent)
    await createTask({ title: 'Another done' }).then((id) => setTaskCompleted(id, true))
    await setTaskCompleted(parent, true)
    const w = await open(child)
    await click(w.valueButton('parent'))
    await settle()
    const list = w.options('parent')
    expect(list[0]).toContain('Finished parent')
    expect(list[0]).toContain('completed')
    expect(list.some((o) => o.includes('Another done'))).toBe(false)
    await w.unmount()
  })

  it('Labels and Assignee: add and remove a label, pick an assignee in a shared project', async () => {
    const team = await createProject({ name: 'Team' })
    await membership(team, ME, 'u-bob')
    const errand = await createLabel({ name: 'errand' })
    const id = await createTask({ title: 'Order parts', project_id: team })
    const v = await open(id)
    await click(v.valueButton('labels'))
    await settle()
    await v.pick('labels', 'errand')
    expect((await db.tasks.get(id))!.labels).toEqual([errand])
    await click(v.row('labels').querySelector(`button[aria-label="Remove label errand"]`)!)
    await settle()
    expect((await db.tasks.get(id))!.labels).toEqual([])
    expect((await db.labels.toArray().then(activeLabels)).length).toBe(1)

    expect(v.row('assignee').textContent).toContain('Unassigned')
    await click(v.valueButton('assignee'))
    await settle()
    await v.pick('assignee', 'u-bob')
    expect((await db.tasks.get(id))!.assignee_id).toBe('u-bob')
    await v.unmount()
  })
})

describe('assignee in personal scopes (4.1)', () => {
  it('reads "You" without writing an op; the switch assigns; a second member brings back "Unassigned"', async () => {
    const p = await createProject({ name: 'Solo' })
    const id = await createTask({ title: 'Read a book', project_id: p })
    const before = await db.outbox.count()
    const v = await open(id)
    expect(v.row('assignee').textContent).toContain('You')
    const sw = v.row('assignee').querySelector('[role="switch"]') as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await settle()
    expect(await db.outbox.count()).toBe(before)

    await click(sw)
    await settle()
    expect((await db.tasks.get(id))!.assignee_id).toBe(ME)
    // Assigned to me lists explicitly assigned tasks.
    expect((await db.tasks.where('assignee_id').equals(ME).toArray()).map((t) => t.id)).toEqual([id])
    await click(sw)
    await settle()
    expect((await db.tasks.get(id))!.assignee_id).toBeNull()

    await act(async () => { await membership(p, ME, 'u-bob') })
    await settle()
    expect(v.row('assignee').textContent).toContain('Unassigned')
    expect(v.row('assignee').querySelector('[role="switch"]')).toBeNull()
    await v.unmount()
  })
})

describe('deadline row (OpenSpec deadlines 3.1)', () => {
  it('typing fri writes the next Friday and leaves the due date alone; the row shows the date and countdown', async () => {
    const id = await createTask({ title: 'Report', due: { date: '2026-10-15' } })
    const { row, valueButton, unmount } = await open(id)
    expect(row('deadline').textContent).toContain('No deadline')
    await click(valueButton('deadline'))
    await settle()
    const input = row('deadline').querySelector('input') as HTMLInputElement
    expect(document.activeElement).toBe(input)
    await type(input, 'fri')
    await key(input, 'Enter')
    await settle()
    const t = (await db.tasks.get(id))!
    expect(t.deadline).toBe('2026-10-16')
    expect(t.due).toEqual({ date: '2026-10-15' })
    await key(row('deadline').querySelector('input') ?? input, 'Escape')
    await settle()
    expect(row('deadline').textContent).toContain('Fri 16 Oct')
    expect(row('deadline').textContent).toContain('in 2 days')
    await unmount()
  })

  it('clearing writes null', async () => {
    const id = await createTask({ title: 'Report', deadline: '2026-10-20' })
    const { row, valueButton, unmount } = await open(id)
    await click(valueButton('deadline'))
    await settle()
    await click(row('deadline').querySelector('button[aria-label="Clear deadline"]')!)
    await settle()
    expect((await db.tasks.get(id))!.deadline).toBeNull()
    await unmount()
  })

  it('a viewer sees the deadline as text, and the row passes axe', async () => {
    const id = await createTask({ title: 'Report', deadline: '2026-10-12' })
    const { row, unmount } = await open(id, { readOnly: true })
    expect(row('deadline').querySelector('button, input')).toBeNull()
    expect(row('deadline').textContent).toContain('2 days over')
    const axe = (await import('axe-core')).default
    const res = await axe.run(row('deadline'), { rules: { 'color-contrast': { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    await unmount()
  })
})

describe('when row and evening switch (OpenSpec someday-and-evening 3.2)', () => {
  it('a start after the due date is refused in the field', async () => {
    const id = await createTask({ title: 'Report', due: { date: '2026-10-16' } })
    const { row, valueButton, unmount } = await open(id)
    expect(row('when').textContent).toContain('Anytime')
    await click(valueButton('when'))
    await settle()
    const input = row('when').querySelector('input') as HTMLInputElement
    await type(input, '2026-10-21')
    await key(input, 'Enter')
    await settle()
    expect(row('when').textContent).toContain('on or before the due date')
    expect((await db.tasks.get(id))!.start ?? null).toBeNull()
    await type(input, '2026-10-15')
    await key(input, 'Enter')
    await settle()
    expect((await db.tasks.get(id))!.start).toBe('2026-10-15')
    await unmount()
  })

  it('parks from the row, toggles evening, and passes axe', async () => {
    const id = await createTask({ title: 'Idea', due: { date: '2026-10-16' } })
    const { row, valueButton, unmount } = await open(id)
    await click(valueButton('when'))
    await settle()
    await click([...row('when').querySelectorAll('button')].find((b) => b.textContent?.includes('Someday'))!)
    await settle()
    expect(await db.tasks.get(id)).toMatchObject({ start: 'someday', due: null })
    await click(row('evening').querySelector('[role="switch"]')!)
    await settle()
    expect((await db.tasks.get(id))!.evening).toBe(true)
    const axe = (await import('axe-core')).default
    for (const name of ['when', 'evening']) {
      const res = await axe.run(row(name), { rules: { 'color-contrast': { enabled: false } } })
      expect(res.violations.map((v) => v.id)).toEqual([])
    }
    await unmount()
  })

  it('viewers see text', async () => {
    const id = await createTask({ title: 'Idea', start: 'someday', evening: true })
    const { row, unmount } = await open(id, { readOnly: true })
    expect(row('when').querySelector('button, input')).toBeNull()
    expect(row('when').textContent).toContain('Someday')
    expect(row('evening').querySelector('[role="switch"]')).toBeNull()
    await unmount()
  })
})
