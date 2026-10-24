// @vitest-environment happy-dom
// The board on a phone (OpenSpec change ux-overhaul, sections-and-boards "Board on
// a phone"): below 640 px columns are 88 % of the screen with snapping, a dot pager
// follows the scroll and names the current column, which also goes to the page bar.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Project, Section, Task } from '../lib/types'
import { click, flush, render, minWidthPx } from '../ui/test-utils'
import { BoardView, type BoardColumn } from './BoardView'

const original = window.matchMedia
let width = 390
beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: minWidthPx(q) <= width, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
})
afterEach(() => { window.matchMedia = original; document.body.innerHTML = '' })

const project = { id: 'p1', name: 'Garden', color: '#0f0', parent_id: null, position: 0, archived: false, created_at: 0, deleted_at: null, _clock: {} } as unknown as Project
const section = (id: string, name: string, position: number): Section => ({ id, project_id: 'p1', name, position, created_at: 0, deleted_at: null, _clock: {} } as unknown as Section)
const task = (id: string, section_id: string): Task => ({ id, title: `Task ${id}`, description: '', project_id: 'p1', parent_id: null, section_id, priority: 4, due: null, labels: [], position: 0, created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {} } as unknown as Task)
const columns: BoardColumn[] = [
  { key: 's1', section: section('s1', 'Plan', 0), cards: [task('a', 's1')] },
  { key: 's2', section: section('s2', 'Plant', 1), cards: [task('b', 's2')] },
  { key: 's3', section: section('s3', 'Harvest', 2), cards: [] },
]

function board(onCurrentColumn?: (name: string | null) => void) {
  return render(<BoardView project={project} columns={columns} editable addingTo={null} setAddingTo={() => {}} projects={[project]} labels={[]}
    renderCard={(t) => <li key={t.id} data-task-id={t.id}>{t.title}</li>} onCurrentColumn={onCurrentColumn} />)
}

describe('below 640 px', () => {
  it('columns are 88 vw with snapping, the pager has one dot per column and names the current one', async () => {
    const names: (string | null)[] = []
    const r = await board((n) => names.push(n))
    await flush()
    const cols = [...document.querySelectorAll('[data-column]')]
    expect(cols).toHaveLength(3)
    for (const c of cols) expect(c.className).toMatch(/w-\[88vw\].*snap-start|snap-start.*w-\[88vw\]/)
    expect(document.querySelector('[data-board]')!.className).toContain('snap-x')
    const dots = [...document.querySelectorAll('[data-board-dot]')]
    expect(dots).toHaveLength(3)
    expect(dots[0].getAttribute('aria-current')).toBe('true')
    expect(dots[0].getAttribute('aria-label')).toBe('Plan, column 1 of 3')
    expect(names).toEqual(['Plan'])
    // Every dot is a 44 px target.
    for (const d of dots) expect(d.className).toContain('touch-target')
    // The current column follows the scroll position.
    const scroller = document.querySelector<HTMLElement>('[data-board]')!
    Object.defineProperty(scroller, 'scrollLeft', { value: 400, configurable: true })
    Object.defineProperty(cols[0] as HTMLElement, 'offsetWidth', { value: 343, configurable: true })
    scroller.dispatchEvent(new Event('scroll'))
    await flush()
    expect(document.querySelector('[data-board-dot="current"]')!.getAttribute('aria-label')).toBe('Plant, column 2 of 3')
    expect(names[names.length - 1]).toBe('Plant')
    await r.unmount()
    // Unmounting clears the bar's subtitle.
    expect(names[names.length - 1]).toBeNull()
  })

  it('a dot scrolls its column into view', async () => {
    const r = await board()
    await flush()
    const scrolled: string[] = []
    for (const c of document.querySelectorAll<HTMLElement>('[data-column]')) c.scrollIntoView = () => { scrolled.push(c.getAttribute('data-column')!) }
    await click(document.querySelectorAll<HTMLButtonElement>('[data-board-dot]')[2])
    expect(scrolled).toEqual(['s3'])
    await r.unmount()
  })
})

describe('from 640 px', () => {
  it('has no pager and 18 rem columns', async () => {
    width = 1024
    const r = await board()
    await flush()
    expect(document.querySelector('[data-board-pager]')).toBeNull()
    expect(document.querySelector('[data-column]')!.className).toContain('sm:w-72')
    await r.unmount()
    width = 390
  })
})
