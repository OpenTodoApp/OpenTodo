// @vitest-environment happy-dom
// One row anatomy (OpenSpec change ux-overhaul, task-list-presentation): every
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

describe('metadata language (ux-overhaul 8.1)', () => {
  const row = (over: Partial<Task>, extra: Partial<React.ComponentProps<typeof TaskRow>> = {}) =>
    render(<ul><TaskRow task={task(over)} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} {...extra} /></ul>)

  it('Detailed: a recurring evening task due today reads "Today · evening · repeats" in the date tone, with no separate icons', async () => {
    const { vi } = await import('vitest')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
    try {
      const r = await row({ due: { date: '2026-10-14' }, evening: true, recurrence: 'every day' }, { detail: 'detailed' })
      const date = r.container.querySelector('[data-date]')!
      expect(visibleText(date)).toBe('Today · evening · repeats')
      expect(date.className).toContain('text-success')
      expect(date.querySelector('svg')).toBeNull()
      expect(r.container.querySelector('[data-evening]')).toBe(date)
      expect(r.container.querySelector('[data-recurring]')).toBe(date)
      await r.unmount()
    } finally { vi.useRealTimers() }
  })

  it('Detailed: counts are neutral chips with tabular figures, never a monospace face; the project is a chip with its colour', async () => {
    const r = await row({ estimate_minutes: 90, description: 'notes' }, { detail: 'detailed', progress: { done: 1, total: 3 }, showProject: true, project: { id: 'p', name: 'Home', color: '#f00' } as unknown as Project })
    const estimate = r.container.querySelector('[data-estimate]')!
    expect(visibleText(estimate)).toBe('1h 30m')
    expect(estimate.className).toContain('tabular-nums')
    expect(estimate.className).not.toContain('font-mono')
    expect(visibleText(r.container.querySelector('[data-progress]')!)).toBe('1/3')
    expect(r.container.querySelector('[data-project]')!.textContent).toBe('Home')
    expect(spokenText(r.container.querySelector('[data-notes]')!)).toBe('Has notes')
    expect(r.container.querySelector('[title]')).toBeNull()
    await r.unmount()
  })

  it('Detailed: labels are label chips; the title line carries no chips', async () => {
    const r = await row({ labels: ['l1'] }, { detail: 'detailed', labels: [{ id: 'l1', name: 'errand', color: '#0f0' } as unknown as Label], progress: { done: 0, total: 2 } })
    expect(r.container.querySelector('[data-row-meta] [data-label-chip]')!.textContent).toBe('errand')
    expect(r.container.querySelector('[data-row-title] [data-progress]')).toBeNull()
    await r.unmount()
  })
})

// Calm rows, the default (OpenSpec change calm-rows, design D10).
describe('Calm rows', () => {
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

  it('dates are muted except overdue; a heading for another day leaves the date alone', () => atNoon(async () => {
    const untimed = await row({ due: { date: '2026-10-14' } })
    expect(untimed.container.querySelector('[data-date]')!.className).toContain('text-muted')
    await untimed.unmount()
    const late = await row({ due: { date: '2026-10-11' } }, { implied: { date: '2026-10-14' } })
    expect(late.container.querySelector('[data-date]')!.className).toContain('text-danger')
    await late.unmount()
    const tomorrow = await row({ due: { date: '2026-10-15' } }, { implied: { date: '2026-10-15' } })
    expect(tomorrow.container.querySelector('[data-date]')).toBeNull()
    await tomorrow.unmount()
  }))

  it('P1 and P2 keep their ring colour, P3 and P4 get the neutral ring; Detailed colours all four', async () => {
    const ring = async (priority: Task['priority'], detail?: 'detailed') => {
      const r = await row({ priority }, { detail })
      const cls = r.container.querySelector('[data-check-mark]')!.className
      await r.unmount()
      return cls
    }
    expect(await ring(1)).toContain('border-p1')
    expect(await ring(2)).toContain('border-p2')
    expect(await ring(3)).toContain('border-input')
    expect(await ring(3)).not.toContain('border-p3')
    expect(await ring(4)).toContain('border-input')
    expect(await ring(3, 'detailed')).toContain('border-p3')
    expect(await ring(4, 'detailed')).toContain('border-p4')
  })

  it('labels are dots with the first name and "+2", read in full; the open label is left out', async () => {
    const labels = [L('l1', 'errand'), L('l2', 'call'), L('l3', 'home')]
    const r = await row({ labels: ['l1', 'l2', 'l3'] }, { labels })
    const dots = r.container.querySelector('[data-row-meta] [data-label-dots]')!
    expect(r.container.querySelector('[data-label-chip]')).toBeNull()
    expect(visibleText(dots)).toBe('errand +2')
    expect(spokenText(dots)).toBe('Labels: errand, call, home')
    await r.unmount()
    const inView = await row({ labels: ['l1', 'l2', 'l3'] }, { labels, omitLabel: 'l1' })
    expect(spokenText(inView.container.querySelector('[data-label-dots]')!)).toBe('Labels: call, home')
    await inView.unmount()
    const detailed = await row({ labels: ['l1', 'l2', 'l3'] }, { labels, omitLabel: 'l1', detail: 'detailed' })
    expect([...detailed.container.querySelectorAll('[data-label-chip]')].map((c) => c.textContent)).toEqual(['errand', 'call', 'home'])
    await detailed.unmount()
  })

  it('counts sit in a quiet trailing group after the open button, read in full; a row with only counts is one line', async () => {
    const r = await row({ description: 'n' }, { progress: { done: 2, total: 3 } })
    const li = r.container.querySelector('li')!
    const counts = li.querySelector(':scope > [data-row-counts]')!
    expect(counts.previousElementSibling!.hasAttribute('data-row-open')).toBe(true)
    for (const cls of ['text-faint', 'group-hover:text-muted', 'group-focus-within:text-muted', 'tabular-nums']) expect(counts.className).toContain(cls)
    expect(counts.hasAttribute('aria-hidden')).toBe(false)
    expect(counts.querySelector('button, [tabindex]')).toBeNull()
    expect(visibleText(counts.querySelector('[data-progress]')!)).toBe('2/3')
    expect(spokenText(counts.querySelector('[data-progress]')!)).toBe('2 of 3 subtasks completed')
    expect(spokenText(counts.querySelector('[data-notes]')!)).toBe('Has notes')
    expect(li.querySelector('[data-row-meta]')).toBeNull()
    await r.unmount()
  })

  it('the Someday chip is left out in the Someday view and kept elsewhere', async () => {
    const inView = await row({ start: 'someday' }, { implied: { someday: true } })
    expect(inView.container.querySelector('[data-start]')).toBeNull()
    await inView.unmount()
    const later = await row({ start: 'someday' })
    expect(visibleText(later.container.querySelector('[data-start]')!)).toBe('Someday')
    await later.unmount()
  })

  it('on a card the counts end the metadata line', async () => {
    const r = await row({ labels: ['l1'] }, { card: true, labels: [L('l1', 'errand')], progress: { done: 0, total: 2 } })
    expect(r.container.querySelector('[data-row-meta] > [data-row-counts]')).toBeTruthy()
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
      await click(li.querySelector('button[aria-label="Complete Task"]')!)
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
      await click(q.container.querySelector('button[aria-label="Complete Task"]')!)
      expect(toggled).toBe(1)
      expect(q.container.querySelector('[data-completing]')).toBeNull()
      await q.unmount()
      expect(vi).toBeTruthy()
    } finally { restore() }
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
    const children = [...li.children].map((c) => (c.hasAttribute('data-leading-slot') ? 'slot' : c.hasAttribute('data-row-controls') ? 'controls' : c.tagName.toLowerCase()))
    expect(children).toEqual(['slot', 'controls', 'button'])
    await r.rerender(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} onTick={() => {}} ticked showCheckbox /></ul>)
    const after = [...r.container.querySelector('[data-task-id]')!.children].map((c) => (c.hasAttribute('data-leading-slot') ? 'slot' : c.hasAttribute('data-row-controls') ? 'controls' : c.tagName.toLowerCase()))
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

  for (const detail of ['calm', 'detailed'] as const) {
    it(`${detail}: an issue chip is a link to the issue whose click does not open the row`, async () => {
      const onOpen = vi.fn()
      const r = await row({ origin: issue }, { detail, onOpen })
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

  it('Calm: the chip is quiet like the counts and never one of the metadata items', async () => {
    const r = await row({ origin: issue, estimate_minutes: 30 }, { detail: 'calm', progress: { done: 1, total: 2 } })
    const trailing = r.container.querySelector('li > [data-row-trailing]')!
    expect(trailing.querySelector('[data-origin]')).toBeTruthy()
    expect(trailing.querySelector('[data-row-counts]')).toBeTruthy()
    expect(trailing.querySelector('[data-origin] .text-faint')!.className).toContain('group-hover:text-muted')
    expect(r.container.querySelector('[data-row-meta] [data-origin]')).toBeNull()
    await r.unmount()
  })

  it('an email origin reads "Email" with the at sign, is not a link and never shows the Message-ID', async () => {
    const r = await row({ origin: { kind: 'email', id: '<a1@mail.example>' } }, { detail: 'detailed' })
    const chip = r.container.querySelector('[data-origin="email"]')!
    expect(chip.tagName).toBe('SPAN')
    expect(r.container.querySelector('a[data-origin]')).toBeNull()
    expect(visibleText(chip)).toBe('Email')
    expect(spokenText(chip)).toBe('From Email')
    expect(r.container.textContent).not.toContain('a1@mail.example')
    await r.unmount()
  })

  it('a task without an origin has no chip; the card variant shows it, with the page title as tooltip', async () => {
    const bare = await row({}, { card: true })
    expect(bare.container.querySelector('[data-origin]')).toBeNull()
    await bare.unmount()
    const card = await row({ origin: { kind: 'url', url: 'https://example.org/post', title: 'Interesting article' } }, { card: true, detail: 'detailed' })
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
