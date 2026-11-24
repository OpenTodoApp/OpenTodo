// @vitest-environment happy-dom
// Choosing an open task as a project's next action (OpenSpec change choose-next-action,
// #1950): the next-action field in Loop home → Place and in the weekly review's project
// walk filters the project's open tasks; ↓ and Enter choose one, Enter alone still adds.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createTask, parkTask, resetDeviceId } from '../../lib/ops'
import type { User } from '../../lib/types'
import { click, key, render, type, waitFor } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { navigate } from '../router'
import { Shell } from '../Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User
const NOW = new Date(2026, 9, 14, 8, 0)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
})

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const options = () => [...document.querySelectorAll('[data-ticked-suggestions="next"] [role="option"]')].map((o) => o.textContent)
const submit = (field: HTMLInputElement | HTMLTextAreaElement) => act(async () => { field.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })

async function kitchen() {
  const pid = await createProject({ name: 'Kitchen renovation' })
  const tiler = await createTask({ title: 'Call the tiler', project_id: pid })
  const tiles = await createTask({ title: 'Choose tiles', project_id: pid })
  await parkTask(tiler)
  await parkTask(tiles)
  await createProject({ name: 'Garage' })
  return { pid, tiler, tiles }
}

async function openPlace(pid: string) {
  navigate({ view: 'inbox' }, { replace: true })
  navigate({ view: 'loop', move: 'place' })
  const r = await render(<Shell user={user} onLogout={() => {}} />)
  await waitFor(() => !!q(`[data-loop-add-next="${pid}"]`), 'the field')
  const field = q<HTMLInputElement>(`[data-loop-add-next="${pid}"]`)!
  await act(async () => { field.focus() })
  return { r, field }
}

describe('Place: choosing an open task as the next action', () => {
  it('typing filters the project’s open tasks; ↓ and Enter choose one, which leaves Someday, and the project leaves the list', async () => {
    const { pid, tiler } = await kitchen()
    const { r, field } = await openPlace(pid)
    await type(field, 'call')
    await waitFor(() => options().length === 1, 'one match')
    expect(options()).toEqual(['Call the tiler'])
    expect(field.getAttribute('role')).toBe('combobox')
    expect(field.getAttribute('aria-activedescendant')).toBeNull()
    await key(field, 'ArrowDown')
    expect(field.getAttribute('aria-activedescendant')).toBeTruthy()
    await key(field, 'Enter')
    await waitFor(() => !q(`[data-loop-project="${pid}"]`), 'the project leaves the list')
    expect((await db.tasks.get(tiler))!.start).toBeNull()
    expect((await db.tasks.where('project_id').equals(pid).count())).toBe(2)
    await r.unmount()
  })

  it('Enter without moving into the list adds what was typed', async () => {
    const { pid, tiler } = await kitchen()
    const { r, field } = await openPlace(pid)
    await type(field, 'Call')
    await waitFor(() => options().length === 1, 'the match')
    await key(field, 'Enter')
    await submit(field)
    await waitFor(() => !q(`[data-loop-project="${pid}"]`), 'the project leaves the list')
    const tasks = await db.tasks.where('project_id').equals(pid).toArray()
    expect(tasks.map((t) => t.title).sort()).toEqual(['Call', 'Call the tiler', 'Choose tiles'])
    expect((await db.tasks.get(tiler))!.start).toBe('someday')
    await r.unmount()
  })

  it('↓ in the empty field lists every open task in list order; Esc closes it', async () => {
    const { pid } = await kitchen()
    const { r, field } = await openPlace(pid)
    expect(options()).toEqual([])
    await key(field, 'ArrowDown')
    expect(options()).toEqual(['Call the tiler', 'Choose tiles'])
    await key(field, 'Escape')
    expect(options()).toEqual([])
    await r.unmount()
  })
})

describe('Project walk: choosing an open task as the next action', () => {
  async function garage() {
    const pid = await createProject({ name: 'Garage' })
    const measure = await createTask({ title: 'Measure wall', project_id: pid })
    const brackets = await createTask({ title: 'Buy shelf brackets', project_id: pid })
    await parkTask(brackets)
    navigate({ view: 'inbox' }, { replace: true })
    navigate({ view: 'review', step: 'projects' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => q('[data-walk-next]')?.textContent === 'Measure wall', 'the card')
    await click(q('[data-walk-action="add"]')!)
    await waitFor(() => !!q('[role="dialog"] textarea'), 'quick add')
    const input = q<HTMLTextAreaElement>('[role="dialog"] textarea')!
    await act(async () => { input.focus() })
    return { r, input, pid, measure, brackets }
  }

  it('lists the open tasks but the current next action, and choosing one makes it the next action on the card', async () => {
    const { r, input, pid, measure, brackets } = await garage()
    await key(input, 'ArrowDown')
    expect(options()).toEqual(['Buy shelf brackets'])
    await type(input, 'shelf')
    await waitFor(() => options().length === 1, 'the match')
    await key(input, 'ArrowDown')
    await key(input, 'Enter')
    await waitFor(() => q('[data-walk-next]')?.textContent === 'Buy shelf brackets', 'the chosen next action')
    expect(q('[role="dialog"]')).toBeNull()
    const [chosen, before] = [(await db.tasks.get(brackets))!, (await db.tasks.get(measure))!]
    expect(chosen.start).toBeNull()
    expect(chosen.position).toBeLessThan(before.position)
    expect(await db.tasks.where('project_id').equals(pid).count()).toBe(2)
    await r.unmount()
  })

  it('typing new text and Enter still creates a task', async () => {
    const { r, input, pid, brackets } = await garage()
    await type(input, 'Sweep the floor')
    await waitFor(() => options().length === 0, 'no match')
    await submit(input)
    await waitFor(() => !q('[role="dialog"]'), 'the dialog closes')
    const titles = (await db.tasks.where('project_id').equals(pid).toArray()).map((t) => t.title).sort()
    expect(titles).toEqual(['Buy shelf brackets', 'Measure wall', 'Sweep the floor'])
    expect((await db.tasks.get(brackets))!.start).toBe('someday')
    await r.unmount()
  })
})
