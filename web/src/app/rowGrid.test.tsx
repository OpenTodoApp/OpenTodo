// @vitest-environment happy-dom
// The row grid (OpenSpec change sidebar-brand-and-row-grid, design D2 to D4;
// task-list-presentation "One row anatomy", "Time column", "Metadata language"): the
// slots project, labels, estimate, date and assignee in list-wide tracks, a slot no row
// uses taking no width, the marks on the title's first baseline, and the part of the
// day as its icon in the time column. Layout itself is the browser's: the stylesheet's
// rules are checked as text, the measured alignment in the stories and baselines.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { hasTimeColumn } from '../lib/rowTime'
import { listSlotsOff, unusedSlots } from '../lib/rowSlots'
import type { Label, Project, Task } from '../lib/types'
import { mockFetch, noPublicLinks, render, spokenText, waitFor } from '../ui/test-utils'
import { TaskListView } from './TaskListView'
import { TaskRow, type TaskRowProps } from './TaskRow'
import css from '../index.css?raw'

beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

const task = (over: Partial<Task>): Task => ({
  id: 't', title: 'Task', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {}, ...over,
} as Task)
const row = (over: Partial<Task>, extra: Partial<TaskRowProps> = {}) =>
  render(<ul><TaskRow task={task(over)} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} {...extra} /></ul>)
const L = (id: string, name: string) => ({ id, name, color: '#0f0' }) as unknown as Label
const atNoon = async <T,>(fn: () => Promise<T>) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  try { return await fn() } finally { vi.useRealTimers() }
}
/** The stylesheet's rule text for a selector inside the wide container query. */
const wide = css.slice(css.indexOf('@container row (width >= 40rem) {\n  /* align-content'))

describe('the slots (D2)', () => {
  it('Slots line up when values are missing: every slot has its named track, the date ends the column', () => {
    expect(wide).toMatch(/grid-template-columns: \[project\] var\(--slot-project\) \[labels\] var\(--slot-labels\) \[estimate\] var\(--slot-estimate\) \[date\] var\(--slot-date\) \[assignee\] var\(--slot-assignee\)/)
    for (const slot of ['project', 'labels', 'estimate', 'date', 'assignee']) expect(wide).toContain(`[data-row-cell="${slot}"] { grid-column: ${slot};`)
    // One grid row: a cell placed before an earlier track never wraps to a new line.
    expect(wide).toContain('[data-row-cell] { grid-row: 1;')
    // Dates and figures end their slots.
    expect(wide).toMatch(/\[data-row-cell="date"\] \{ grid-column: date; justify-content: flex-end; \}/)
  })

  it('An empty slot keeps its width: a row with only a date and a row with only a label share the tracks', () => atNoon(async () => {
    const dated = await row({ due: { date: '2026-10-20' } }, { slotsOff: 'project estimate assignee' })
    const labelled = await row({ labels: ['l1'] }, { labels: [L('l1', 'errand')], slotsOff: 'project estimate assignee' })
    for (const r of [dated, labelled]) {
      const props = r.container.querySelector('[data-row-props]')!
      // The list's fact, the same string on every row: the tracks are decided once.
      expect(props.getAttribute('data-slots-off')).toBe('project estimate assignee')
    }
    expect(dated.container.querySelector('[data-row-cell="date"]')).not.toBeNull()
    expect(dated.container.querySelector('[data-row-cell="labels"]')).toBeNull()
    expect(labelled.container.querySelector('[data-row-cell="labels"]')).not.toBeNull()
    await dated.unmount(); await labelled.unmount()
  }))

  it('A slot no row uses takes no width: decided from the list\'s rows', () => {
    const rows = [task({ id: 'a', labels: ['x'], due: { date: '2026-10-20' } }), task({ id: 'b', project_id: 'p' })]
    expect(unusedSlots(rows)).toBe('estimate assignee')
    expect(unusedSlots(rows, { tracked: true })).toBe('assignee')
    expect(unusedSlots(rows, { omitLabel: 'x' })).toBe('labels estimate assignee')
    expect(unusedSlots(rows, { hidden: ['date'] })).toBe('estimate date assignee')
    // A heading that names the day leaves the date slot empty (Upcoming).
    expect(unusedSlots(rows, { dateShown: () => false })).toBe('estimate date assignee')
    expect(unusedSlots([task({ estimate_minutes: 30, assignee_id: 'u', project_id: 'p', labels: ['y'], evening: true })])).toBe('')
    // A list that does not follow tracked time keeps its estimate slot.
    expect(listSlotsOff(rows)).toBe('assignee')
    for (const slot of ['project', 'labels', 'estimate', 'date', 'assignee']) expect(wide).toContain(`[data-row-props][data-slots-off~="${slot}"] { --slot-${slot}: 0rem; }`)
    // Each slot carries its lead gap, so a 0-wide slot leaves no gap.
    expect(wide).toMatch(/\[data-row-props\] \{\n\s+--slot-project[^}]*column-gap: 0;/)
  })

  it('A slot no row uses: a project list without estimates marks it on every row', () => atNoon(async () => {
    const p = await createProject({ name: 'Home' })
    await createTask({ title: 'Paint', project_id: p, labels: [], due: { date: '2026-10-20' } })
    await createTask({ title: 'Sand', project_id: p, due: { date: '2026-10-21' } })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelectorAll('[data-row-props]').length === 2, 'two rows')
    for (const props of r.container.querySelectorAll('[data-row-props]')) expect(props.getAttribute('data-slots-off')).toBe('labels estimate assignee')
    await r.unmount()
  }))

  it('Compact density keeps the slots: the density changes the row height only', () => {
    const compact = css.split('\n').filter((l) => l.includes('[data-density="compact"]'))
    expect(compact.length).toBeGreaterThan(0)
    for (const l of compact) expect(l).not.toMatch(/--slot-|data-row-props|data-row-cell/)
  })

  it('The deadline is never a slot: in the facts, and the phone row\'s one cell when nothing comes before it', () => atNoon(async () => {
    const r = await row({ deadline: '2026-10-17' })
    expect(r.container.querySelector('[data-row-rest] [data-deadline]')).not.toBeNull()
    expect(r.container.querySelector('[data-row-cell="deadline"][data-row-phone]')).not.toBeNull()
    expect(css).toContain('[data-row-cell="deadline"] { display: none; }')
    expect(css).toContain('[data-row-props] > [data-row-cell="deadline"][data-row-phone] { display: inline-flex; }')
    await r.unmount()
    const dated = await row({ deadline: '2026-10-17', due: { date: '2026-10-15' } })
    expect(dated.container.querySelector('[data-row-cell="deadline"]')).toBeNull()
    await dated.unmount()
  }))
})

describe('marks on the title\'s baseline (D3)', () => {
  it('Marks on the title\'s baseline: the priority, the repeat icon and "2/3" in one run after the title', () => atNoon(async () => {
    const r = await row({ priority: 1, recurrence: 'every week', title: 'A title that is long enough to wrap onto a second line in a narrow list' }, { progress: { done: 2, total: 3 } })
    const head = r.container.querySelector('[data-row-head]')!
    expect(head.className).toContain('items-baseline')
    const marks = head.querySelector('[data-row-marks]')!
    expect(marks.previousElementSibling!.hasAttribute('data-row-title')).toBe(true)
    expect(marks.className).toContain('row-marks')
    expect(marks.querySelector('[data-priority-mark="1"]')).not.toBeNull()
    expect(spokenText(marks.querySelector('[data-repeat]')!)).toBe('repeats')
    expect(marks.querySelector('[data-row-counts] [data-progress]')!.textContent).toContain('2/3')
    // 12 px icons at the metadata size.
    for (const icon of marks.querySelectorAll('svg')) expect(icon.getAttribute('width')).toBe('12')
    expect(css).toMatch(/\.row-marks \{[^}]*font-size: var\(--text-meta\)/)
    expect(css).toMatch(/\.row-marks::before \{ content: '\\200b'/)
    // The head and the slots align on the first baseline, so a wrapped title keeps its facts on line one.
    expect(wide).toContain('align-items: first baseline;')
    await r.unmount()
  }))
})

describe('the part of the day in the time column (D4)', () => {
  it('Evening in the column: the icon named "Evening", no "evening" in the date words', () => atNoon(async () => {
    const evening = await row({ due: { date: '2026-10-16' }, evening: true }, { timeColumn: true, implied: { date: '2026-10-16' } })
    const cell = evening.container.querySelector('[data-row-time]')!
    expect(cell.querySelector('[data-row-part="evening"] [data-icon="moon"]')).not.toBeNull()
    expect(spokenText(cell)).toBe('Evening')
    expect(evening.container.textContent).not.toMatch(/evening/)
    await evening.unmount()
    const timed = await row({ due: { date: '2026-10-16', time: '09:00' } }, { timeColumn: true, implied: { date: '2026-10-16' } })
    expect(timed.container.querySelector('[data-row-time]')!.textContent).toBe('09:00')
    await timed.unmount()
  }))

  it('Morning and Afternoon take their icons; a heading that states the part leaves it out', () => atNoon(async () => {
    const morning = await row({ due: { date: '2026-10-16' }, day_part: 'morning' }, { timeColumn: true })
    expect(morning.container.querySelector('[data-row-part="morning"] [data-icon="sunrise"]')).not.toBeNull()
    await morning.unmount()
    const under = await row({ due: { date: '2026-10-14' }, evening: true }, { timeColumn: true, implied: { date: '2026-10-14', evening: true } })
    expect(under.container.querySelector('[data-row-part]')).toBeNull()
    await under.unmount()
  }))

  it('Without the column the part stays a word after the date', () => atNoon(async () => {
    const r = await row({ due: { date: '2026-10-16' }, evening: true })
    expect(r.container.querySelector('[data-row-part]')).toBeNull()
    expect(r.container.querySelector('[data-date]')!.textContent).toMatch(/evening/)
    await r.unmount()
  }))

  it('A part of the day gives a list its column', () => {
    expect(hasTimeColumn([task({ evening: true })])).toBe(true)
    expect(hasTimeColumn([task({ day_part: 'afternoon' })])).toBe(true)
    expect(hasTimeColumn([task({ evening: true, completed_at: 1 })])).toBe(false)
    expect(hasTimeColumn([task({})])).toBe(false)
  })
})

describe('Project at the row\'s end', () => {
  it('the project slot holds the name with its dot', async () => {
    const r = await row({}, { showProject: true, project: { id: 'p', name: 'Home renovation', color: '#f00' } as unknown as Project })
    expect(r.container.querySelector('[data-row-cell="project"] [data-project]')!.textContent).toBe('Home renovation')
    await r.unmount()
  })
})
