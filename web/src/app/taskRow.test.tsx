// @vitest-environment happy-dom
// One row anatomy (OpenSpec change ux-overhaul, task-list-presentation): every
// list reserves the same leading slot, so checkboxes align across flat and tree
// views, and the metadata line exists only when there is metadata.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { Label, Project, Task } from '../lib/types'
import { flush, render, mockFetch, noPublicLinks } from '../ui/test-utils'
import { TaskListView } from './TaskListView'
import { TaskRow } from './TaskRow'

// The project header asks the server for its public links.
beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals() })

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})
afterEach(() => { document.body.innerHTML = '' })

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

const task = (over: Partial<Task>): Task => ({
  id: 't', title: 'Task', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {}, ...over,
} as Task)

/** The children of a row before its checkbox: the leading slot, and the tick box when the list offers one. */
function anatomy(li: Element): string[] {
  const out: string[] = []
  for (const child of li.children) {
    if (child.querySelector('button[aria-label="Complete task"], button[aria-label="Reopen task"]') || child.matches('button[aria-label="Complete task"]')) break
    if (child.hasAttribute('data-drop-indicator')) continue
    out.push(child.hasAttribute('data-leading-slot') ? 'slot' : child.tagName.toLowerCase())
  }
  return out
}

describe('leading slot', () => {
  it('is reserved in flat and tree views alike, with the chevron only on rows with children', async () => {
    const project = await createProject({ name: 'Home' })
    const parent = await createTask({ title: 'Plan trip', project_id: project, due: { date: '2026-10-14' } })
    await createTask({ title: 'Book flights', project_id: project, parent_id: parent })
    await createTask({ title: 'Call mum', due: { date: '2026-10-14' } })
    const { setDateTime } = await import('../lib/dates')
    setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
    const { vi } = await import('vitest')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
    try {
      const today = await render(<TaskListView route={{ view: 'today' }} />)
      await waitFor(() => today.container.textContent!.includes('Call mum'))
      const flat = [...today.container.querySelectorAll('[data-task-id]')]
      expect(flat.length).toBeGreaterThan(0)
      for (const li of flat) expect(anatomy(li)[0]).toBe('slot')
      expect(today.container.querySelector('[data-leading-slot] button')).toBeNull()
      await today.unmount()

      const list = await render(<TaskListView route={{ view: 'project', id: project }} />)
      await waitFor(() => list.container.textContent!.includes('Book flights'))
      const rows = [...list.container.querySelectorAll('[data-task-id]')]
      for (const li of rows) expect(anatomy(li)[0]).toBe('slot')
      const parentRow = rows.find((r) => r.getAttribute('data-task-id') === parent)!
      expect(parentRow.querySelector('[data-leading-slot] button[aria-expanded]')).toBeTruthy()
      const childRow = rows.find((r) => r.textContent?.includes('Book flights'))!
      expect(childRow.querySelector('[data-leading-slot] button')).toBeNull()
      await list.unmount()
    } finally {
      vi.useRealTimers()
      setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
    }
  })
})

describe('metadata line', () => {
  it('is absent on a bare task and present once there is something to show', async () => {
    const bare = await render(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)
    expect(bare.container.querySelector('[data-row-meta]')).toBeNull()
    await bare.unmount()
    const dated = await render(<ul><TaskRow task={task({ estimate_minutes: 30 })} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)
    expect(dated.container.querySelector('[data-row-meta]')).toBeTruthy()
    await dated.unmount()
  })
})

describe('metadata language (ux-overhaul 8.1)', () => {
  const row = (over: Partial<Task>, extra: Partial<React.ComponentProps<typeof TaskRow>> = {}) =>
    render(<ul><TaskRow task={task(over)} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} {...extra} /></ul>)

  it('a recurring evening task due today reads "Today · evening · repeats" in the date tone, with no separate icons', async () => {
    const { vi } = await import('vitest')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
    try {
      const r = await row({ due: { date: '2026-10-14' }, evening: true, recurrence: 'every day' })
      const date = r.container.querySelector('[data-date]')!
      expect(date.textContent).toBe('Today · evening · repeats')
      expect(date.className).toContain('text-success')
      expect(date.querySelector('svg')).toBeNull()
      expect(r.container.querySelector('[data-evening]')).toBe(date)
      expect(r.container.querySelector('[data-recurring]')).toBe(date)
      await r.unmount()
    } finally { vi.useRealTimers() }
  })

  it('counts are neutral chips with tabular figures, never a monospace face; the project is a chip with its colour', async () => {
    const r = await row({ estimate_minutes: 90, description: 'notes' }, { progress: { done: 1, total: 3 }, showProject: true, project: { id: 'p', name: 'Home', color: '#f00' } as unknown as Project })
    const estimate = r.container.querySelector('[data-estimate]')!
    expect(estimate.textContent).toBe('1h 30m')
    expect(estimate.className).toContain('tabular-nums')
    expect(estimate.className).not.toContain('font-mono')
    expect(r.container.querySelector('[data-progress]')!.textContent).toBe('1/3')
    expect(r.container.querySelector('[data-project]')!.textContent).toBe('Home')
    expect(r.container.querySelector('[data-notes]')!.getAttribute('aria-label')).toBe('Has notes')
    expect(r.container.querySelector('[title]')).toBeNull()
    await r.unmount()
  })

  it('labels are label chips; the title line carries no chips', async () => {
    const r = await row({ labels: ['l1'] }, { labels: [{ id: 'l1', name: 'errand', color: '#0f0' } as unknown as Label], progress: { done: 0, total: 2 } })
    expect(r.container.querySelector('[data-row-meta] [data-label-chip]')!.textContent).toBe('errand')
    expect(r.container.querySelector('[data-row-title] [data-progress]')).toBeNull()
    await r.unmount()
  })
})

describe('completion feedback (8.2) and the shared checkbox slot (8.3)', () => {
  const stubMotion = (reduce: boolean) => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({
      matches: q.includes('prefers-reduced-motion') ? reduce : false, media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    return () => { window.matchMedia = original }
  }

  it('animates the check mark and fades the row before completing; reduced motion completes at once', async () => {
    const { vi } = await import('vitest')
    const { click } = await import('../ui/test-utils')
    let restore = stubMotion(false)
    try {
      let toggled = 0
      const r = await render(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => { toggled++ }} onOpen={() => {}} /></ul>)
      const li = r.container.querySelector('[data-task-id]')!
      await click(li.querySelector('button[aria-label="Complete task"]')!)
      expect(li.hasAttribute('data-completing')).toBe(true)
      expect(li.className).toContain('opacity-50')
      expect(li.querySelector('[data-check-mark]')!.className).toContain('row-check-pop')
      expect(toggled).toBe(0)
      await waitFor(() => toggled === 1, 1500)
      await r.unmount()
      restore()
      restore = stubMotion(true)
      toggled = 0
      const q = await render(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => { toggled++ }} onOpen={() => {}} /></ul>)
      await click(q.container.querySelector('button[aria-label="Complete task"]')!)
      expect(toggled).toBe(1)
      expect(q.container.querySelector('[data-completing]')).toBeNull()
      await q.unmount()
      expect(vi).toBeTruthy()
    } finally { restore() }
  })

  it('without a selection in progress the circle is the only box: hover and focus never swap in the selection box', async () => {
    let toggled = 0
    const r = await render(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => { toggled++ }} onOpen={() => {}} onTick={() => {}} /></ul>)
    const complete = r.container.querySelector('button[aria-label="Complete task"]')!
    expect(complete.className).not.toMatch(/invisible/)
    const tickLabel = r.container.querySelector('[data-tick]')!.closest('label')!
    expect(tickLabel.className).toMatch(/\bhidden\b/)
    // Only one display utility: `inline-flex` beside `hidden` would win and cover the circle.
    expect(tickLabel.className).not.toMatch(/inline-flex/)
    expect(tickLabel.className).not.toMatch(/group-hover|group-focus-within/)
    await r.rerender(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => { toggled++ }} onOpen={() => {}} onTick={() => {}} showCheckbox /></ul>)
    expect(r.container.querySelector('button[aria-label="Complete task"]')!.className).toMatch(/invisible/)
    expect(r.container.querySelector('[data-tick]')!.closest('label')!.className).toMatch(/inline-flex/)
    expect(r.container.querySelector('[data-tick]')!.closest('label')!.className).not.toMatch(/\bhidden\b/)
    expect(toggled).toBe(0)
    await r.unmount()
  })

  it('the selection box lives in the same slot as the task checkbox, so the title keeps its place', async () => {
    const r = await render(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} onTick={() => {}} /></ul>)
    const li = r.container.querySelector('[data-task-id]')!
    const slot = li.querySelector('[data-row-controls]')!
    expect(slot.querySelector('button[aria-label="Complete task"]')).toBeTruthy()
    expect(slot.querySelector('[data-tick]')).toBeTruthy()
    // Leading slot, the one control slot, then the title: nothing is inserted on hover or tick.
    const children = [...li.children].map((c) => (c.hasAttribute('data-leading-slot') ? 'slot' : c.hasAttribute('data-row-controls') ? 'controls' : c.tagName.toLowerCase()))
    expect(children).toEqual(['slot', 'controls', 'button'])
    await r.rerender(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} onTick={() => {}} ticked showCheckbox /></ul>)
    const after = [...r.container.querySelector('[data-task-id]')!.children].map((c) => (c.hasAttribute('data-leading-slot') ? 'slot' : c.hasAttribute('data-row-controls') ? 'controls' : c.tagName.toLowerCase()))
    expect(after).toEqual(children)
    expect(r.container.querySelector('[data-row-controls]')!.hasAttribute('data-selecting')).toBe(true)
    await r.unmount()
  })
})
