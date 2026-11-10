// @vitest-environment happy-dom
// The task panel's proportions (OpenSpec change sidebar-brand-and-row-grid, design D5 and
// D6; web-app "Task panel proportions", "Task panel tabs", "Compact estimate editor"): the
// checkbox in a box of the title's first line, the title one step smaller in the panel,
// 32 px facet lines (44 px on touch), the tab row that fits, and the estimate editor.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createTask } from '../../lib/ops'
import { click, key, render, type } from '../../ui/test-utils'
import { EstimateField } from '../EstimateField'
import { open, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()
afterEach(() => { vi.restoreAllMocks() })

describe('panel proportions', () => {
  it('Two-line title: the checkbox stands in a box of the first line\'s height, so it is centred on that line; its left edge is the facet icons\'', async () => {
    const id = await createTask({ title: 'Email cutting board company about the warped board and the replacement they promised' })
    const { container, unmount } = await open(id)
    await waitFor(() => !!container.querySelector('[data-panel-check]'))
    const box = container.querySelector('[data-panel-check]')!
    // The panel's title is the title step (16 px, 24 px lines): the box is one line tall.
    expect(box.className).toMatch(/\bh-6\b/)
    expect(box.className).toContain('self-start')
    expect(box.className).toContain('items-center')
    expect(container.querySelector('[data-task-title]')!.className).toContain('text-title')
    expect(container.querySelector('[data-task-title]')!.className).not.toContain('text-h3')
    // The head pads like the body (px-4), so the circle and the facet icons share their left edge.
    expect(box.parentElement!.className).toContain('px-4')
    await unmount()
  })

  it('Touch: every facet line is 32 px, 44 px on a coarse pointer', async () => {
    const id = await createTask({ title: 'Paint', estimate_minutes: 30 })
    const { container, unmount } = await open(id)
    await waitFor(() => container.querySelectorAll('[data-facet]').length > 0)
    for (const line of container.querySelectorAll('[data-facet]')) {
      const icon = line.querySelector(':scope > span, :scope > * > span[aria-hidden]')!
      expect(icon.className).toContain('h-8')
      expect(icon.className).toContain('pointer-coarse:h-11')
      for (const part of line.querySelectorAll('[data-part]')) {
        expect(part.className).toContain('min-h-8')
        expect(part.className).toContain('pointer-coarse:min-h-11')
      }
    }
    await unmount()
  })
})

describe('tabs that fit', () => {
  it('A narrow panel: icons with "4" and "1h 20m", the selected tab keeps its word, the names read in full', async () => {
    const id = await createTask({ title: 'Paint' })
    const now = Date.now()
    for (let i = 0; i < 4; i++) await db.comments.put({ id: `c${i}`, task_id: id, author_id: 'u-me', body: `Note ${i}`, created_at: now + i, updated_at: now + i, deleted_at: null, _clock: {} } as never)
    await db.timeEntries.put({ id: 'e1', task_id: id, user_id: 'u-me', started_at: now - 80 * 60000, ended_at: now, note: '', created_at: now, deleted_at: null, _clock: {} } as never)
    // The row is 22 rem; every word needs more, the selected word alone fits.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.matches('[data-tabs-row]') ? 352 : 0 })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      const shapes = this.parentElement?.matches('[data-tabs-row]') && this.getAttribute('aria-hidden') === 'true' ? [...this.parentElement.querySelectorAll(':scope > [aria-hidden="true"]')] : []
      return shapes[0] === this ? 420 : shapes[1] === this ? 300 : 0
    })
    const { container, unmount } = await open(id)
    await waitFor(() => container.querySelector('[data-tabs-row]')?.getAttribute('data-tabs-fit') === '1', 'the narrow shape')
    const row = container.querySelector('[data-tabs-row]')!
    expect(row.className).not.toContain('overflow-x-auto')
    expect(row.hasAttribute('data-scroll-x')).toBe(false)
    const tab = (k: string) => row.querySelector<HTMLElement>(`[role="tab"][data-tab="${k}"]`)!
    await waitFor(() => tab('comments').getAttribute('aria-label') === 'Comments, 4' && tab('time').querySelector('[data-tab-value]')?.textContent === '1h 20m', 'the counts')
    expect(tab('time').getAttribute('aria-label')).toBe('Time, 1 hour 20 minutes')
    expect(tab('comments').querySelector('svg')).not.toBeNull()
    // The selected tab (Comments) keeps its word; the others are their icons and values.
    expect(tab('comments').textContent).toContain('Comments')
    expect(tab('activity').textContent).toBe('')
    expect(tab('time').textContent).toBe('1h 20m')
    await unmount()
  })
})

describe('the compact estimate editor', () => {
  const editor = async (estimate: number | null) => {
    const id = await createTask({ title: 'Paint', estimate_minutes: estimate })
    const task = (await db.tasks.get(id))!
    return { id, r: await render(<EstimateField task={task} />) }
  }

  it('Preset: one field and four presets in the interface face; 30m writes 30 minutes and is selected', async () => {
    const { id, r } = await editor(null)
    const presets = [...r.container.querySelectorAll<HTMLButtonElement>('[data-estimate-preset]')]
    expect(presets.map((b) => b.textContent)).toEqual(['15m', '30m', '1h', '2h'])
    for (const b of presets) expect(b.className).not.toContain('font-mono')
    expect(r.container.querySelectorAll('input')).toHaveLength(1)
    expect(r.container.querySelector('button[aria-label="Clear estimate"]')).toBeNull()
    await click(presets[1])
    await waitFor(async () => (await db.tasks.get(id))!.estimate_minutes === 30)
    expect(presets[1].getAttribute('aria-pressed')).toBe('true')
    await r.unmount()
  })

  it('Arrow keys: from 1h, ↑ twice reads "1h 30m" and Enter writes 90 minutes', async () => {
    const { id, r } = await editor(60)
    const input = r.container.querySelector('input')!
    await key(input, 'ArrowUp')
    await key(input, 'ArrowUp')
    expect(input.value).toBe('1h 30m')
    expect((await db.tasks.get(id))!.estimate_minutes).toBe(60)
    await key(input, 'Enter')
    await waitFor(async () => (await db.tasks.get(id))!.estimate_minutes === 90)
    await key(input, 'ArrowDown')
    expect(input.value).toBe('1h 15m')
    await r.unmount()
  })

  it('A value outside the range is refused with a message and leaves the task unchanged', async () => {
    const { id, r } = await editor(45)
    const input = r.container.querySelector('input')!
    await type(input, '9999h')
    await key(input, 'Enter')
    await waitFor(() => !!r.container.querySelector('[role="alert"]'))
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect((await db.tasks.get(id))!.estimate_minutes).toBe(45)
    await r.unmount()
  })
})
