// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { resetPanel } from '../app/panel'
import { navigate } from '../app/router'
import { Shell } from '../app/Shell'
import { resetTaskTrail } from '../app/taskTrail'
import { logicalToday } from '../lib/dates'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { minWidthPx, render, waitFor } from '../ui/test-utils'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

beforeEach(async () => {
  localStorage.clear()
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  resetTaskTrail()
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('pointer: coarse') || (q.includes('min-width') && minWidthPx(q) <= 390),
    media: q, onchange: null, addEventListener() {}, removeEventListener() {},
  }))
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})

afterEach(() => {
  resetPanel()
  resetTaskTrail()
  vi.unstubAllGlobals()
})

function pointer(type: string, clientX: number) {
  return new PointerEvent(type, { bubbles: true, pointerType: 'touch', pointerId: 7, isPrimary: true, button: 0, clientX, clientY: 100 })
}

async function swipeLeft(row: HTMLElement, travel: number) {
  await act(async () => row.dispatchEvent(pointer('pointerdown', 300)))
  await act(async () => window.dispatchEvent(pointer('pointermove', 280)))
  await act(async () => window.dispatchEvent(pointer('pointermove', 300 - travel)))
}

it.each(['today', 'project'] as const)('focuses the title editor on a short swipe in the phone %s list', async (view) => {
  const project = await createProject({ name: 'Work' })
  const id = await createTask({ title: 'Order the tiles', project_id: project, due: { date: logicalToday() } })
  navigate(view === 'today' ? { view } : { view, id: project })
  const app = await render(<Shell user={user} onLogout={() => {}} />)
  const row = () => document.querySelector<HTMLElement>(`[data-phone-row="${id}"]`)!
  try {
    await waitFor(() => !!row(), 'phone row')
    await swipeLeft(row(), 72)
    await act(async () => window.dispatchEvent(pointer('pointerup', 228)))
    const editor = () => row().querySelector<HTMLInputElement>('[data-inline-title]')
    await waitFor(() => editor() !== null && document.activeElement === editor(), 'focused inline title')
    expect(editor()?.value).toBe('Order the tiles')
    expect(document.querySelector('[data-testid="phone-date-sheet"]')).toBeNull()
  } finally {
    await app.unmount()
  }
})

it('switches the revealed action at full travel and opens the phone date sheet', async () => {
  const id = await createTask({ title: 'Order the tiles' })
  navigate({ view: 'inbox' })
  const app = await render(<Shell user={user} onLogout={() => {}} />)
  const row = () => document.querySelector<HTMLElement>(`[data-phone-row="${id}"]`)!
  const edge = () => row().querySelector('[data-swipe-edge="left"]')
  try {
    await waitFor(() => !!row(), 'phone row')
    await swipeLeft(row(), 72)
    expect(edge()?.textContent).toContain('Edit')
    expect(edge()?.hasAttribute('data-full-swipe')).toBe(false)
    await act(async () => window.dispatchEvent(pointer('pointermove', 192)))
    expect(edge()?.textContent).toContain('Schedule')
    expect(edge()?.hasAttribute('data-full-swipe')).toBe(true)
    await act(async () => window.dispatchEvent(pointer('pointerup', 192)))
    await waitFor(() => !!document.querySelector('[data-testid="phone-date-sheet"]'), 'phone date sheet')
    expect(row().querySelector('[data-inline-title]')).toBeNull()
  } finally {
    await act(async () => window.dispatchEvent(pointer('pointercancel', 192)))
    await app.unmount()
  }
})
