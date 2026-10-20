// OpenSpec change rule-boards, task 2.4: the Eisenhower matrix template.
import { beforeEach, describe, expect, it } from 'vitest'
import { BOARD_TEMPLATES, EISENHOWER } from './boardTemplates'
import { db, useDatabase } from './db'
import { favouritesOf } from './favourites'
import { parse } from './filter'
import { resetDeviceId } from './ops'
import type { Task } from './types'
import { USER_PREFS_ID } from './userPrefs'
import { createBoardFromTemplate, createView, evaluateViews } from './views'

let n = 0
beforeEach(() => {
  useDatabase(`board-templates-${Date.now()}-${n++}`)
  resetDeviceId()
})

const TODAY = '2026-10-14'

function task(p: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    title: p.id, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
    estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, section_id: null, ical_extra: null, created_at: 0, completed_at: null, deleted_at: null, _clock: {}, ...p,
  }
}

describe('Eisenhower matrix', () => {
  it('has the four quadrants of the spec, with their literal queries and rules', () => {
    expect(BOARD_TEMPLATES.map((b) => b.id)).toEqual(['eisenhower'])
    expect(EISENHOWER.columns.map((c) => [c.name, c.query, c.on_drop])).toEqual([
      ['Urgent and important', '(p1 | p2) & (due <= tomorrow | deadline <= tomorrow)', { priority: 1, due: 'today' }],
      ['Important, not urgent', '(p1 | p2) & !(due <= tomorrow | deadline <= tomorrow) & !someday', { priority: 2, due: 'next-week' }],
      ['Urgent, not important', '!(p1 | p2) & (due <= tomorrow | deadline <= tomorrow)', { priority: 3, due: 'today' }],
      ['Neither', '!(p1 | p2) & !(due <= tomorrow | deadline <= tomorrow) & !someday', { priority: 4, due: 'clear' }],
    ])
    for (const c of EISENHOWER.columns) expect(() => parse(c.query)).not.toThrow()
  })

  it('creates four unpinned filters and one pinned board in matrix order, in one batch (spec "Create the matrix")', async () => {
    const before = await createView({ name: 'Existing', query: 'p1' })
    const board = await createBoardFromTemplate(EISENHOWER, ' Eisenhower ')
    const views = await db.views.toArray()
    const dash = views.find((v) => v.id === board)!
    expect(dash).toMatchObject({ name: 'Eisenhower', kind: 'dashboard', pinned: true })
    const filters = dash.panels.map((id) => views.find((v) => v.id === id)!)
    expect(filters.map((f) => f.name)).toEqual(['Urgent and important', 'Important, not urgent', 'Urgent, not important', 'Neither'])
    expect(filters.every((f) => f.kind === 'list' && f.pinned === false && f.on_drop !== null)).toBe(true)
    // After the last view, in order, the board last.
    const existing = views.find((v) => v.id === before)!
    const positions = [...filters, dash].map((v) => v.position)
    expect(positions[0]).toBeGreaterThan(existing.position)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    // The board is a favourite by its pinned flag, after the existing ones; the filters are not.
    const prefs = await db.userPrefs.get(USER_PREFS_ID)
    expect(favouritesOf(prefs, { projects: [], labels: [], views }).map((f) => f.id)).toEqual([before, board])
    const stamps = new Set((await db.outbox.toArray()).filter((o) => o.entityId !== before).map((o) => `${o.ts}|${o.device}`))
    expect(stamps.size).toBe(1)
  })

  it('quadrants are exclusive and leave parked tasks out (spec "Quadrants are exclusive")', async () => {
    const board = await createBoardFromTemplate(EISENHOWER, 'Eisenhower')
    const views = await db.views.toArray()
    const panels = views.find((v) => v.id === board)!.panels.map((id) => views.find((v) => v.id === id)!)
    const tasks = [
      task({ id: 'p1-today', priority: 1, due: { date: TODAY } }),
      task({ id: 'p2-undated', priority: 2 }),
      task({ id: 'p4-yesterday', priority: 4, due: { date: '2026-10-13' } }),
      task({ id: 'p3-parked', priority: 3, start: 'someday' }),
    ]
    const out = evaluateViews(panels, { today: TODAY, labels: [], projects: [], tasks })
    const where = (id: string) => panels.filter((p) => { const s = out.get(p.id)!; return s.ok && s.tasks.some((tk) => tk.id === id) }).map((p) => p.name)
    expect(where('p1-today')).toEqual(['Urgent and important'])
    expect(where('p2-undated')).toEqual(['Important, not urgent'])
    expect(where('p4-yesterday')).toEqual(['Urgent, not important'])
    expect(where('p3-parked')).toEqual([])
  })

  it('refuses an empty name and writes nothing', async () => {
    await expect(createBoardFromTemplate(EISENHOWER, '  ')).rejects.toThrow('name')
    expect(await db.views.count()).toBe(0)
  })
})
