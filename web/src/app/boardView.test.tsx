import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { groupBySection } from '../lib/sections'
import type { Project, Section, Task } from '../lib/types'
import { BoardView } from './BoardView'

const project: Project = { id: 'p', name: 'Work', color: '#000', position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {} }
const section = (id: string, name: string, position: number): Section => ({ id, name, project_id: 'p', position, created_at: 0, deleted_at: null, _clock: {} })
const task = (id: string, section_id: string | null, position: number): Task => ({
  id, title: id, description: '', project_id: 'p', parent_id: null, priority: 4, due: null, labels: [], position, created_at: 0,
  completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, section_id, ical_extra: null, _clock: {},
})

function render(editable: boolean) {
  const groups = groupBySection('p', [task('a', 'doing', 1), task('b', null, 2), task('c', 'backlog', 3)], [section('doing', 'Doing', 2), section('backlog', 'Backlog', 1)])
  return renderToStaticMarkup(
    <BoardView project={project} columns={groups.map((g) => ({ key: g.key, section: g.section, cards: g.tasks }))} editable={editable}
      addingTo={null} setAddingTo={() => undefined} projects={[project]} labels={[]}
      renderCard={(t) => <li key={t.id} data-card={t.id}>{t.title}</li>} />,
  )
}

describe('BoardView', () => {
  it('renders No section first, then sections by position, each a drop target with a count', () => {
    const html = render(true)
    const order = [...html.matchAll(/data-drop-target="section:([^"]*)"/g)].map((m) => m[1])
    expect(order).toEqual(['', 'backlog', 'doing'])
    expect(html).toContain('aria-label="No section, 1 open task"')
    expect(html).toContain('aria-label="Doing, 1 open task"')
    expect([...html.matchAll(/data-card="([^"]+)"/g)].map((m) => m[1])).toEqual(['b', 'c', 'a'])
    expect(html).toContain('+ Add section')
  })

  it('offers no section menu, quick add or new section to viewers', () => {
    const html = render(false)
    expect(html).not.toContain('Section menu')
    expect(html).not.toContain('Add a task to')
    expect(html).not.toContain('+ Add section')
  })
})
