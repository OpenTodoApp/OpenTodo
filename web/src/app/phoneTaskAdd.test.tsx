// @vitest-environment happy-dom
// Issue #2105: phone list and section capture share the floating button's sheet.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { createSection, saveViewMode } from '../lib/sections'
import type { User } from '../lib/types'
import { setPhoneUiEnabled } from '../phone/prefs'
import { click, key, minWidthPx, render, type, waitFor } from '../ui/test-utils'
import { bulkToast } from './bulk/toastStore'
import { listState } from './listActions'
import { resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const originalMedia = window.matchMedia
let width = 390
const field = () => document.querySelector<HTMLTextAreaElement>('[data-quick-add-sheet] textarea[aria-label="Add a task"]')
const tasks = async () => (await db.tasks.toArray()).filter((t) => !t.deleted_at && t.title !== 'Existing')

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  width = 390
  window.matchMedia = ((q: string) => ({
    matches: q.includes('min-width') ? minWidthPx(q) <= width : false,
    media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { window.matchMedia = originalMedia; vi.unstubAllGlobals(); resetPanel() })

async function project(board = false) {
  const id = await createProject({ name: 'Work' })
  const section = await createSection(id, 'Doing')
  await createTask({ title: 'Existing', project_id: id })
  if (board) await saveViewMode(id, 'board')
  navigate({ view: 'project', id })
  const r = await render(<Shell user={user} onLogout={() => {}} />)
  await waitFor(() => !!document.querySelector(`[data-section-heading="${section}"]`), 'the section')
  return { ...r, id, section }
}
async function openSection(section: string) {
  const button = document.querySelector<HTMLButtonElement>(`[data-section-heading="${section}"] button[aria-label="Add a task to Doing"]`)!
  await click(button)
  await waitFor(() => !!field(), 'the shared sheet')
  return button
}
async function add(title: string, count: number) {
  await type(field()!, title)
  await click(document.querySelector('[data-sheet-send]')!)
  await waitFor(async () => (await tasks()).length === count, 'the saved task')
  await waitFor(() => field()?.value === '', 'ready for the next task')
}

describe('phone task capture', () => {
  for (const phoneUi of [false, true]) {
    it(`uses the sheet for a section with phone screens ${phoneUi ? 'on' : 'off'}, keeping context until closed`, async () => {
      setPhoneUiEnabled(phoneUi)
      const p = await project()
      expect(document.querySelector('[data-quick-add-row]')).toBeNull()
      const trigger = await openSection(p.section)
      expect(document.querySelector('[data-quick-add-section]')!.textContent).toContain('Doing')
      expect(document.querySelectorAll('textarea[aria-label="Add a task to Doing"]')).toHaveLength(0)
      await add('First', 1)
      await add('Second', 2)
      expect((await tasks()).map((t) => [t.project_id, t.section_id])).toEqual([[p.id, p.section], [p.id, p.section]])
      expect((await db.outbox.toArray()).some((op) => op.entity === 'task' && op.field === 'section_id' && op.value === p.section)).toBe(true)
      await key(field()!, 'Escape')
      await waitFor(() => !field())
      expect(document.activeElement).toBe(trigger)
      await click(document.querySelector('[data-add-button]')!)
      await waitFor(() => !!field())
      expect(document.querySelector('[data-quick-add-section]')).toBeNull()
      await add('Global', 3)
      expect((await tasks()).find((t) => t.title === 'Global')?.section_id).toBeNull()
      await p.unmount()
    })
  }

  it('clears the source section when a task explicitly names another project', async () => {
    const other = await createProject({ name: 'Home' })
    const p = await project()
    await openSection(p.section)
    await add('Elsewhere #Home', 1)
    expect((await tasks()).map((t) => [t.title, t.project_id, t.section_id])).toEqual([['Elsewhere', other, null]])
    await p.unmount()
  })

  it('applies section defaults to each pasted line, with project overrides and one Undo', async () => {
    const other = await createProject({ name: 'Home' })
    const p = await project()
    await openSection(p.section)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (kind: string) => kind === 'text/plain' ? 'First\nSecond #Home\nThird' : '' } })
    await act(async () => { field()!.dispatchEvent(event) })
    await waitFor(() => !!document.querySelector('[data-paste-add]'))
    await click(document.querySelector('[data-paste-add]')!)
    await waitFor(async () => (await tasks()).length === 3)
    const result = await tasks()
    expect(result.find((t) => t.title === 'First')).toMatchObject({ project_id: p.id, section_id: p.section })
    expect(result.find((t) => t.title === 'Second')).toMatchObject({ project_id: other, section_id: null })
    expect(result.find((t) => t.title === 'Third')).toMatchObject({ project_id: p.id, section_id: p.section })
    await waitFor(() => bulkToast()?.label === '3 tasks added', 'the batch Undo offer')
    const { undoBatch } = await import('../lib/undo')
    await act(async () => { await undoBatch(bulkToast()!.undoId!) })
    expect(await tasks()).toHaveLength(0)
    await p.unmount()
  })

  it('opens from either board control, including No section', async () => {
    const p = await project(true)
    await openSection(p.section)
    await add('In Doing', 1)
    await key(field()!, 'Escape')
    await waitFor(() => !field())
    await click(document.querySelector('[data-column-add=""]')!)
    await waitFor(() => !!field())
    expect(document.querySelector('[data-quick-add-section]')!.textContent).toContain('No section')
    await add('Unsectioned', 2)
    expect((await tasks()).find((t) => t.title === 'Unsectioned')).toMatchObject({ project_id: p.id, section_id: null })
    await p.unmount()
  })

  it('closes contextual capture when navigating, and q opens the ordinary sheet', async () => {
    const p = await project()
    await openSection(p.section)
    await act(async () => { navigate({ view: 'inbox' }) })
    await waitFor(() => !field())
    await act(async () => { listState()!.focusQuickAdd(null) })
    await waitFor(() => !!field())
    expect(document.querySelector('[data-quick-add-section]')).toBeNull()
    await add('Inbox task', 1)
    expect((await tasks())[0]).toMatchObject({ project_id: null, section_id: null })
    await p.unmount()
  })

  it('keeps the desktop top input and section inline editor', async () => {
    width = 1280
    const p = await project()
    expect(document.querySelector('[data-quick-add-row] textarea')).not.toBeNull()
    await click(document.querySelector(`[data-section-heading="${p.section}"] button[aria-label="Add a task to Doing"]`)!)
    await waitFor(() => !!document.querySelector('textarea[aria-label="Add a task to Doing"]'))
    expect(field()).toBeNull()
    await p.unmount()
  })
})
