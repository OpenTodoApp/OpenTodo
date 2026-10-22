// @vitest-environment happy-dom
// One row anatomy (OpenSpec changes ux-overhaul and rows-v2, task-list-presentation): every
// list reserves the same leading slot, so checkboxes align across flat and tree
// views, and the metadata line exists only when there is metadata.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import type { Label, Project, Task } from '../lib/types'
import { flush, render, mockFetch, noPublicLinks, spokenText, visibleText } from '../ui/test-utils'
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
    if (child.querySelector('button[aria-label^="Complete "], button[aria-label^="Reopen "]') || child.matches('button[aria-label^="Complete "]')) break
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

// One row language (OpenSpec change rows-v2, task-list-presentation "Metadata
// language", "Time column", "One row anatomy"; design D1 to D6).
describe('one row language (rows-v2)', () => {
  const row = (over: Partial<Task>, extra: Partial<React.ComponentProps<typeof TaskRow>> = {}) =>
    render(<ul><TaskRow task={task(over)} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} {...extra} /></ul>)
  const L = (id: string, name: string) => ({ id, name, color: '#0f0' }) as unknown as Label
  const atNoon = async <T,>(fn: () => Promise<T>) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
    try { return await fn() } finally { vi.useRealTimers() }
  }

  it('a recurring evening task under This Evening shows no date text and a muted repeat icon with "repeats"', () => atNoon(async () => {
    const r = await row({ due: { date: '2026-10-14' }, evening: true, recurrence: 'every day' }, { implied: { date: '2026-10-14', evening: true } })
    expect(r.container.querySelector('[data-date]')).toBeNull()
    const repeat = r.container.querySelector('[data-repeat]')!
    expect(visibleText(repeat)).toBe('repeats')
    expect(repeat.className).toContain('text-muted')
    expect(repeat.querySelector('svg')).toBeTruthy()
    await r.unmount()
  }))

  it('a timed task due today: "10:00" in the accent colour under Today, "Today 10:00" elsewhere', () => atNoon(async () => {
    const inToday = await row({ due: { date: '2026-10-14', time: '10:00' } }, { implied: { date: '2026-10-14' } })
    const d = inToday.container.querySelector('[data-date]')!
    expect(visibleText(d)).toBe('10:00')
    expect(d.className).toContain('text-accent')
    await inToday.unmount()
    const elsewhere = await row({ due: { date: '2026-10-14', time: '10:00' } })
    expect(visibleText(elsewhere.container.querySelector('[data-date]')!)).toBe('Today 10:00')
    expect(elsewhere.container.querySelector('[data-date]')!.className).toContain('text-accent')
    await elsewhere.unmount()
  }))

  // The due ladder (page-rhythm D7, task-list-presentation "Due ladder in Calm rows").
  const dateOf = async (over: Partial<Task>, extra: Partial<React.ComponentProps<typeof TaskRow>> = {}) => {
    const r = await row(over, extra)
    const d = r.container.querySelector('[data-date]')
    const out = d ? { text: visibleText(d), cls: d.className } : null
    await r.unmount()
    return out
  }

  it('the due ladder: later muted, tomorrow default, today accent (timed or not), earlier danger', () => atNoon(async () => {
    expect((await dateOf({ due: { date: '2026-10-18' } }))!.cls).toContain('text-muted')
    const tomorrow = (await dateOf({ due: { date: '2026-10-15' } }))!
    expect(tomorrow.text).toBe('Tomorrow')
    expect(tomorrow.cls).toContain('text-default')
    const today = (await dateOf({ due: { date: '2026-10-14' } }))!
    expect(today.text).toBe('Today')
    expect(today.cls).toContain('text-accent')
    expect((await dateOf({ due: { date: '2026-10-11' } }, { implied: { date: '2026-10-14' } }))!.cls).toContain('text-danger')
    // A heading for the day leaves the date text out, under Today and under Tomorrow.
    expect(await dateOf({ due: { date: '2026-10-14' } }, { implied: { date: '2026-10-14' } })).toBeNull()
    expect(await dateOf({ due: { date: '2026-10-15' } }, { implied: { date: '2026-10-15' } })).toBeNull()
  }))

  it('the deadline keeps its countdown tone beside a ladder date', () => atNoon(async () => {
    const r = await row({ due: { date: '2026-10-15' }, deadline: '2026-10-16' })
    expect(r.container.querySelector('[data-date]')!.className).toContain('text-default')
    const deadline = r.container.querySelector('[data-deadline]')!
    expect(visibleText(deadline)).toBe('2d')
    expect(deadline.className).toContain('text-warning')
    await r.unmount()
  }))

  it('midnight moves a task up the ladder: tomorrow, then today, then earlier', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
      expect((await dateOf({ due: { date: '2026-10-15' } }))!.cls).toContain('text-default')
      vi.setSystemTime(new Date(2026, 9, 15, 12, 0))
      const today = (await dateOf({ due: { date: '2026-10-15' } }))!
      expect([today.text, today.cls.includes('text-accent')]).toEqual(['Today', true])
      vi.setSystemTime(new Date(2026, 9, 16, 12, 0))
      expect((await dateOf({ due: { date: '2026-10-15' } }))!.cls).toContain('text-danger')
    } finally { vi.useRealTimers() }
  })

  it('P1 and P2 keep their ring colour, P3 and P4 get the neutral ring', async () => {
    const ring = async (priority: Task['priority']) => {
      const r = await row({ priority })
      const cls = r.container.querySelector('[data-check-mark]')!.className
      await r.unmount()
      return cls
    }
    expect(await ring(1)).toContain('border-p1')
    expect(await ring(2)).toContain('border-p2')
    expect(await ring(3)).toContain('border-input')
    expect(await ring(3)).not.toContain('border-p3')
    expect(await ring(4)).toContain('border-input')
    expect(await ring(4)).not.toContain('border-p4')
  })

  it('One run of text: no item of the line has a pill background; the dots are generated content, not text', () => atNoon(async () => {
    const fields = await row({ due: { date: '2026-10-16', time: '14:00' }, estimate_minutes: 45, recurrence: 'every week', start: '2026-10-01' }, { blockedBy: 2, breadcrumb: 'Parent', timeColumn: true, implied: { date: '2026-10-16' } })
    const meta = fields.container.querySelector('[data-row-meta]')!
    expect(meta.children.length).toBeGreaterThan(3)
    for (const item of meta.children) expect(item.className).not.toMatch(/\bbg-|rounded-chip/)
    // No separator text node: a screen reader hears the items without the dots.
    expect(meta.textContent).not.toContain('·')
    expect(visibleText(fields.container.querySelector('[data-estimate]')!)).toBe('45m')
    expect(spokenText(fields.container.querySelector('[data-estimate]')!)).toBe('Estimate 45m')
    expect(fields.container.querySelector('[data-row-time]')!.textContent).toBe('14:00')
    expect(fields.container.querySelector('[data-date]')).toBeNull()
    await fields.unmount()
  }))

  it('Three labels on a row: two chips and "+1", read in full; the open label is left out', async () => {
    const labels = [L('l1', 'errand'), L('l2', 'call'), L('l3', 'home')]
    const r = await row({ labels: ['l1', 'l2', 'l3'] }, { labels })
    const group = r.container.querySelector('[data-row-meta] [data-label-chips]')!
    expect([...group.querySelectorAll('[data-label-chip]')].map((c) => c.textContent)).toEqual(['errand', 'call'])
    expect(visibleText(group.querySelector('[data-label-more]')!)).toBe('+1')
    expect(spokenText(group)).toBe('Labels: errand, call, home')
    await r.unmount()
    const inView = await row({ labels: ['l1', 'l2', 'l3'] }, { labels, omitLabel: 'l1' })
    expect([...inView.container.querySelectorAll('[data-label-chip]')].map((c) => c.textContent)).toEqual(['call', 'home'])
    expect(inView.container.querySelector('[data-label-more]')).toBeNull()
    await inView.unmount()
  })

  it('counts sit in the quiet trailing group after the open button, read in full; a row with only counts is one line', async () => {
    const r = await row({ description: 'n' }, { progress: { done: 2, total: 3 } })
    const li = r.container.querySelector('li')!
    const trailing = li.querySelector(':scope > [data-row-trailing]')!
    expect(trailing.previousElementSibling!.hasAttribute('data-row-open')).toBe(true)
    const counts = trailing.querySelector('[data-row-counts]')!
    for (const cls of ['text-faint', 'group-hover:text-muted', 'group-focus-within:text-muted', 'tabular-nums']) expect(counts.className).toContain(cls)
    expect(trailing.hasAttribute('aria-hidden')).toBe(false)
    expect(counts.querySelector('button, [tabindex]')).toBeNull()
    expect(visibleText(counts.querySelector('[data-progress]')!)).toBe('2/3')
    expect(spokenText(counts.querySelector('[data-progress]')!)).toBe('2 of 3 subtasks completed')
    expect(spokenText(counts.querySelector('[data-notes]')!)).toBe('Has notes')
    expect(li.querySelector('[data-row-meta]')).toBeNull()
    await r.unmount()
  })

  it('Tracked time stays one item: "35m / 1h" in the line, no second item', async () => {
    const r = await row({ estimate_minutes: 60 }, { tracked: 35 })
    const items = r.container.querySelectorAll('[data-estimate]')
    expect(items.length).toBe(1)
    expect(visibleText(items[0])).toBe('35m / 1h')
    expect(items[0].hasAttribute('data-tracked')).toBe(true)
    expect(r.container.querySelector('[data-row-counts] [data-tracked]')).toBeNull()
    await r.unmount()
  })

  it('Project at the row\'s end: one name in the trailing group from 640 px, one at the end of the line below', async () => {
    const r = await row({ estimate_minutes: 30 }, { showProject: true, project: { id: 'p', name: 'Home renovation', color: '#f00' } as unknown as Project })
    const wide = r.container.querySelector('[data-row-trailing] [data-project]')!
    const narrow = r.container.querySelector('[data-row-meta] [data-project]')!
    expect(wide.textContent).toBe('Home renovation')
    expect(wide.className).toMatch(/\bhidden\b.*\bsm:inline\b|\bsm:inline\b.*\bhidden\b/)
    expect(narrow.className).toContain('sm:hidden')
    expect(wide.className).toContain('text-muted')
    expect(wide.className).not.toMatch(/\bbg-/)
    await r.unmount()
    // A row whose only metadata is the project keeps one line from 640 px.
    const only = await row({}, { showProject: true, project: { id: 'p', name: 'Home', color: '#f00' } as unknown as Project })
    expect(only.container.querySelector('[data-row-meta]')!.className).toContain('sm:hidden')
    await only.unmount()
  })

  it('Inbox rows: a task without a project shows no "Inbox" word', async () => {
    const r = await row({}, { showProject: true })
    expect(r.container.textContent).not.toContain('Inbox')
    expect(r.container.querySelector('[data-project]')).toBeNull()
    await r.unmount()
  })

  it('the Someday item is left out in the Someday view and kept elsewhere', async () => {
    const inView = await row({ start: 'someday' }, { implied: { someday: true } })
    expect(inView.container.querySelector('[data-start]')).toBeNull()
    await inView.unmount()
    const later = await row({ start: 'someday' })
    expect(visibleText(later.container.querySelector('[data-start]')!)).toBe('Someday')
    await later.unmount()
  })

  it('Card content: the time leads the line, two label chips and "+1", the counts end the line, no column', () => atNoon(async () => {
    const labels = [L('l1', 'errand'), L('l2', 'call'), L('l3', 'home')]
    const r = await row({ due: { date: '2026-10-16', time: '10:00' }, estimate_minutes: 60, labels: ['l1', 'l2', 'l3'], description: 'x' }, { shape: 'card', timeColumn: true, labels })
    const meta = r.container.querySelector('[data-row-meta]')!
    expect(r.container.querySelector('[data-row-time]')).toBeNull()
    expect(meta.firstElementChild!.hasAttribute('data-date')).toBe(true)
    expect(visibleText(meta.firstElementChild!)).toContain('10:00')
    expect(r.container.querySelectorAll('[data-label-chip]').length).toBe(2)
    expect(meta.lastElementChild!.hasAttribute('data-row-counts')).toBe(true)
    expect(r.container.querySelector('[data-row-trailing]')).toBeNull()
    expect(r.container.querySelector('[data-row-actions]')).toBeNull()
    await r.unmount()
  }))
})

describe('time column (rows-v2 D2, D3)', () => {
  const row = (over: Partial<Task>, extra: Partial<React.ComponentProps<typeof TaskRow>> = {}) =>
    render(<ul><TaskRow task={task(over)} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} timeColumn {...extra} /></ul>)
  const atNoon = async <T,>(fn: () => Promise<T>) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
    try { return await fn() } finally { vi.useRealTimers() }
  }

  it('A day scans as a schedule: the column sits between the checkbox and the title at the shared width, empty for an untimed row', () => atNoon(async () => {
    const timed = await row({ due: { date: '2026-10-14', time: '09:00' } }, { implied: { date: '2026-10-14' } })
    const cell = timed.container.querySelector('[data-row-time]')!
    expect(cell.previousElementSibling!.hasAttribute('data-row-controls')).toBe(true)
    expect(cell.nextElementSibling!.hasAttribute('data-row-open')).toBe(true)
    expect(cell.className).toContain('w-(--row-time-w)')
    expect(visibleText(cell)).toBe('09:00')
    expect(cell.querySelector('[data-time]')!.className).toContain('text-accent')
    expect(cell.querySelector('[data-time]')!.className).toContain('tabular-nums')
    // The line never repeats the time.
    expect(timed.container.querySelector('[data-date]')).toBeNull()
    await timed.unmount()
    const untimed = await row({ due: { date: '2026-10-14' } }, { implied: { date: '2026-10-14' } })
    expect(untimed.container.querySelector('[data-row-time]')!.textContent).toBe('')
    await untimed.unmount()
  }))

  it('No column for an untimed list: titles start right after the checkbox', async () => {
    const r = await row({}, { timeColumn: false })
    expect(r.container.querySelector('[data-row-time]')).toBeNull()
    await r.unmount()
  })

  it('Deadline in the column: "3d" in the warning tone, not repeated in the line', () => atNoon(async () => {
    const r = await row({ deadline: '2026-10-17' })
    const cell = r.container.querySelector('[data-row-time]')!
    expect(visibleText(cell)).toBe('3d')
    expect(cell.querySelector('[data-deadline]')!.className).toContain('text-warning')
    expect(r.container.querySelectorAll('[data-deadline]').length).toBe(1)
    expect(r.container.querySelector('[data-row-meta]')).toBeNull()
    await r.unmount()
  }))

  it('Time and deadline: the time in the column, the countdown with its hourglass in the line', () => atNoon(async () => {
    const r = await row({ due: { date: '2026-10-14', time: '10:00' }, deadline: '2026-10-17' })
    expect(visibleText(r.container.querySelector('[data-row-time]')!)).toBe('10:00')
    const line = r.container.querySelector('[data-row-meta] [data-deadline]')!
    expect(visibleText(line)).toBe('3d')
    expect(line.querySelector('svg')).toBeTruthy()
    // Elsewhere than Today the day's words stay, without the time.
    expect(visibleText(r.container.querySelector('[data-date]')!)).toBe('Today')
    await r.unmount()
  }))

  it('Overdue time: the column and the date in the danger tone', () => atNoon(async () => {
    const r = await row({ due: { date: '2026-10-13', time: '18:00' } })
    expect(r.container.querySelector('[data-row-time] [data-time]')!.className).toContain('text-danger')
    expect(r.container.querySelector('[data-date]')!.className).toContain('text-danger')
    await r.unmount()
  }))

  it('Width follows the time format: switching to 12-hour widens every column at once, through one CSS variable', async () => {
    const { rowTimeWidth } = await import('../lib/rowTime')
    const { setUserPref } = await import('../lib/userPrefs')
    const { DateTimePrefsProvider } = await import('./DateTimePrefsProvider')
    expect(rowTimeWidth(false)).toBe('3.25rem')
    expect(rowTimeWidth(true)).toBe('4.75rem')
    await setUserPref('time_format', '24h')
    const r = await render(<DateTimePrefsProvider><ul><TaskRow task={task({ due: { date: '2030-01-01', time: '21:00' } })} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} timeColumn /></ul></DateTimePrefsProvider>)
    await waitFor(() => document.documentElement.style.getPropertyValue('--row-time-w') === '3.25rem')
    await setUserPref('time_format', '12h')
    await waitFor(() => document.documentElement.style.getPropertyValue('--row-time-w') === '4.75rem')
    await waitFor(() => /9:00\s?PM/i.test(r.container.querySelector('[data-row-time]')!.textContent ?? ''))
    await r.unmount()
    const { setDateTime } = await import('../lib/dates')
    setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  })
})

describe('revealed row actions (rows-v2 D7)', () => {
  const row = (extra: Partial<React.ComponentProps<typeof TaskRow>> = {}) =>
    render(<ul><TaskRow task={task({ priority: 3 })} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} {...extra} /></ul>)

  it('three real buttons after the open control, shown only on a fine pointer from 768 px, revealed on hover and focus', async () => {
    const r = await row({ onMore: () => {}, progress: { done: 1, total: 2 } })
    const cluster = r.container.querySelector('[data-row-actions]')!
    expect([...cluster.querySelectorAll('[data-row-action]')].map((b) => b.getAttribute('data-row-action'))).toEqual(['schedule', 'priority', 'more'])
    for (const cls of ['hidden', 'md:pointer-fine:flex', 'opacity-0', 'group-hover:opacity-100', 'group-focus-within:opacity-100']) expect(cluster.className.split(/\s+/)).toContain(cls)
    // The trailing group fades in its place but stays heard.
    const trailing = r.container.querySelector('[data-row-trailing]')!
    expect(trailing.className).toContain('md:pointer-fine:group-hover:opacity-0')
    expect(trailing.hasAttribute('aria-hidden')).toBe(false)
    // Tab order: open control, then Schedule, Priority, More.
    const order = [...r.container.querySelectorAll('li button')].map((b) => b.getAttribute('data-row-action') ?? (b.hasAttribute('data-row-open') ? 'open' : 'check'))
    expect(order).toEqual(['check', 'open', 'schedule', 'priority', 'more'])
    await r.unmount()
  })

  it('no actions for a viewer, on a card, while editing inline, or where the screen has its own controls', async () => {
    for (const extra of [{ readOnly: true }, { shape: 'card' as const }, { inline: <span /> }, { actions: false }]) {
      const r = await row(extra)
      expect(r.container.querySelector('[data-row-actions]')).toBeNull()
      await r.unmount()
    }
  })

  it('More is offered only where the list has a row menu', async () => {
    const r = await row({})
    expect(r.container.querySelector('[data-row-action="more"]')).toBeNull()
    await r.unmount()
  })

  it('Esc on an action returns focus to the open control', async () => {
    const r = await row({ onMore: () => {} })
    const more = r.container.querySelector<HTMLButtonElement>('[data-row-action="more"]')!
    await act(async () => { more.focus() })
    await act(async () => { more.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(document.activeElement).toBe(r.container.querySelector('[data-row-open]'))
    await r.unmount()
  })

  it('Priority from the row writes the change through the op log', async () => {
    const { click } = await import('../ui/test-utils')
    const id = await createTask({ title: 'Ring', priority: 3 })
    const stored = (await db.tasks.get(id))!
    const r = await render(<ul><TaskRow task={stored} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)
    await click(r.container.querySelector('[data-row-action="priority"]')!)
    const p1 = [...document.querySelectorAll('[role^="menuitem"]')].find((el) => el.textContent?.includes('P1'))!
    await click(p1)
    await flush(50)
    expect((await db.tasks.get(id))!.priority).toBe(1)
    expect(await db.outbox.count()).toBeGreaterThan(0)
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

  it('completes at once: the write never waits for the animation, with or without reduced motion (motion-v2 D2)', async () => {
    const { click } = await import('../ui/test-utils')
    for (const reduce of [false, true]) {
      const restore = stubMotion(reduce)
      try {
        let toggled = 0
        const r = await render(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => { toggled++ }} onOpen={() => {}} /></ul>)
        await click(r.container.querySelector('button[aria-label="Complete Task"]')!)
        expect(toggled).toBe(1)
        await r.unmount()
      } finally { restore() }
    }
  })

  it('a departing row is done, hidden from assistive technology, inert and has no task id; rolled and restored rows are marked', async () => {
    const leave = await render(<ul><TaskRow task={task({})} motion="leave" selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)
    const li = leave.container.querySelector('li')!
    expect(li.getAttribute('data-departing')).toBe('t')
    expect(li.hasAttribute('data-task-id')).toBe(false)
    expect(li.getAttribute('aria-hidden')).toBe('true')
    expect(li.hasAttribute('inert')).toBe(true)
    // The check mark shows done while the sequence plays.
    expect(li.querySelector('[data-check-mark] svg')).not.toBeNull()
    expect(li.style.getPropertyValue('--row-h')).toMatch(/px$/)
    await leave.unmount()
    const rolled = await render(<ul><TaskRow task={task({})} motion="rolled" selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)
    expect(rolled.container.querySelector('li')!.hasAttribute('data-rolled')).toBe(true)
    expect(rolled.container.querySelector('li')!.getAttribute('data-task-id')).toBe('t')
    await rolled.unmount()
    const restored = await render(<ul><TaskRow task={task({})} motion="restored" selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)
    expect(restored.container.querySelector('li')!.hasAttribute('data-restored')).toBe(true)
    await restored.unmount()
  })

  it('without a selection in progress the circle is the only box: hover and focus never swap in the selection box', async () => {
    let toggled = 0
    const r = await render(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => { toggled++ }} onOpen={() => {}} onTick={() => {}} /></ul>)
    const complete = r.container.querySelector('button[aria-label="Complete Task"]')!
    expect(complete.className).not.toMatch(/invisible/)
    const tickLabel = r.container.querySelector('[data-tick]')!.closest('label')!
    expect(tickLabel.className).toMatch(/\bhidden\b/)
    // Only one display utility: `inline-flex` beside `hidden` would win and cover the circle.
    expect(tickLabel.className).not.toMatch(/inline-flex/)
    expect(tickLabel.className).not.toMatch(/group-hover|group-focus-within/)
    await r.rerender(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => { toggled++ }} onOpen={() => {}} onTick={() => {}} showCheckbox /></ul>)
    expect(r.container.querySelector('button[aria-label="Complete Task"]')!.className).toMatch(/invisible/)
    expect(r.container.querySelector('[data-tick]')!.closest('label')!.className).toMatch(/inline-flex/)
    expect(r.container.querySelector('[data-tick]')!.closest('label')!.className).not.toMatch(/\bhidden\b/)
    expect(toggled).toBe(0)
    await r.unmount()
  })

  it('the selection box lives in the same slot as the task checkbox, so the title keeps its place', async () => {
    const r = await render(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} onTick={() => {}} /></ul>)
    const li = r.container.querySelector('[data-task-id]')!
    const slot = li.querySelector('[data-row-controls]')!
    expect(slot.querySelector('button[aria-label="Complete Task"]')).toBeTruthy()
    expect(slot.querySelector('[data-tick]')).toBeTruthy()
    // Leading slot, the one control slot, then the title: nothing is inserted on hover or tick.
    const children = [...li.children].map((c) => (c.hasAttribute('data-leading-slot') ? 'slot' : c.hasAttribute('data-row-controls') ? 'controls' : c.hasAttribute('data-row-actions') ? 'actions' : c.tagName.toLowerCase()))
    expect(children).toEqual(['slot', 'controls', 'button', 'actions'])
    await r.rerender(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} onTick={() => {}} ticked showCheckbox /></ul>)
    const after = [...r.container.querySelector('[data-task-id]')!.children].map((c) => (c.hasAttribute('data-leading-slot') ? 'slot' : c.hasAttribute('data-row-controls') ? 'controls' : c.hasAttribute('data-row-actions') ? 'actions' : c.tagName.toLowerCase()))
    expect(after).toEqual(children)
    expect(r.container.querySelector('[data-row-controls]')!.hasAttribute('data-selecting')).toBe(true)
    await r.unmount()
  })
})

// Task origins (OpenSpec change task-origin, task-list-presentation "Metadata language").
describe('origin chip', () => {
  const issue = { kind: 'issue' as const, provider: 'github', id: 'o/r#7', url: 'https://github.com/o/r/issues/7' }
  const row = (over: Partial<Task>, extra: Partial<React.ComponentProps<typeof TaskRow>> = {}) =>
    render(<ul><TaskRow task={task(over)} selected={false} showProject={false} onToggle={() => {}} onOpen={extra.onOpen ?? (() => {})} {...extra} /></ul>)

  {
    it('an issue chip is a link to the issue whose click does not open the row', async () => {
      const onOpen = vi.fn()
      const r = await row({ origin: issue }, { onOpen })
      const chip = r.container.querySelector<HTMLAnchorElement>('a[data-origin]')!
      expect(chip.getAttribute('href')).toBe(issue.url)
      expect(chip.target).toBe('_blank')
      expect(chip.rel).toBe('noopener noreferrer')
      expect(chip.getAttribute('aria-label')).toBe('Opens the source o/r#7')
      expect(visibleText(chip)).toBe('o/r#7')
      // A link never sits inside the row's open button.
      expect(chip.closest('[data-row-open]')).toBeNull()
      chip.addEventListener('click', (e) => e.preventDefault())
      chip.click()
      expect(onOpen).not.toHaveBeenCalled()
      await r.unmount()
    })
  }

  it('the chip is quiet like the counts and never one of the metadata items of a row', async () => {
    const r = await row({ origin: issue, estimate_minutes: 30 }, { progress: { done: 1, total: 2 } })
    const trailing = r.container.querySelector('li > [data-row-trailing]')!
    expect(trailing.querySelector('[data-origin]')).toBeTruthy()
    expect(trailing.querySelector('[data-row-counts]')).toBeTruthy()
    expect(trailing.querySelector('[data-origin] .text-faint')!.className).toContain('group-hover:text-muted')
    expect(r.container.querySelector('[data-row-meta] [data-origin]')).toBeNull()
    await r.unmount()
  })

  it('an email origin reads "Email" with the at sign, is not a link and never shows the Message-ID', async () => {
    const r = await row({ origin: { kind: 'email', id: '<a1@mail.example>' } })
    const chip = r.container.querySelector('[data-origin="email"]')!
    expect(chip.tagName).toBe('SPAN')
    expect(r.container.querySelector('a[data-origin]')).toBeNull()
    expect(visibleText(chip)).toBe('Email')
    expect(spokenText(chip)).toBe('From Email')
    expect(r.container.textContent).not.toContain('a1@mail.example')
    await r.unmount()
  })

  it('a task without an origin has no chip; the card variant shows it, with the page title as tooltip', async () => {
    const bare = await row({}, { shape: 'card' })
    expect(bare.container.querySelector('[data-origin]')).toBeNull()
    await bare.unmount()
    const card = await row({ origin: { kind: 'url', url: 'https://example.org/post', title: 'Interesting article' } }, { shape: 'card' })
    const chip = card.container.querySelector<HTMLAnchorElement>('a[data-origin="url"]')!
    expect(visibleText(chip)).toBe('example.org')
    // The stored page title is the chip's tooltip, never a second line.
    await act(async () => { chip.focus() })
    expect(document.querySelector('[data-tooltip]')?.textContent).toBe('Interesting article')
    await card.unmount()
  })

  it('an undecryptable origin shows no chip', async () => {
    const r = await row({ origin: '[Cannot decrypt]' })
    expect(r.container.querySelector('[data-origin]')).toBeNull()
    await r.unmount()
  })
})

describe('calmer hover and selection (ux-feedback-2 D5)', () => {
  const twoLine = task({ estimate_minutes: 30, due: { date: '2026-10-22', time: '09:00' }, priority: 2 })

  it('Hover over a two-line row: only the row\'s neutral tint; nothing in the metadata line reacts to hover', async () => {
    const r = await render(<ul><TaskRow task={twoLine} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)
    const li = r.container.querySelector('[data-task-id]')!
    expect(li.className).toContain('row-hover')
    expect(li.className).not.toMatch(/\bhover:(bg|ring|border|shadow)/)
    const meta = r.container.querySelector('[data-row-meta]')!
    for (const el of [meta, ...meta.querySelectorAll('*')]) expect(String(el.getAttribute('class') ?? '')).not.toMatch(/(^|\s)(group-)?hover:/)
    await r.unmount()
  })

  it('Hover over the selected row adds nothing: the selected row has no hover style of its own', async () => {
    const r = await render(<ul><TaskRow task={twoLine} selected showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)
    const li = r.container.querySelector('[data-task-id]')!
    expect(li.className).toContain('row-selected')
    expect(li.className).not.toContain('row-hover')
    expect(li.className).not.toMatch(/\bhover:/)
    await r.unmount()
  })
})
