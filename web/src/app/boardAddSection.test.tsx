// @vitest-environment happy-dom
// The board's "Add a section" column (OpenSpec change precision-boards-timeline D4,
// sections-and-boards "Board view"): a dashed column at the end of an editable board
// that turns into the section name field; a read-only board has none.
import { afterEach, describe, expect, it } from 'vitest'
import type { Project, Section, Task } from '../lib/types'
import { click, flush, render } from '../ui/test-utils'
import { BoardView, type BoardColumn } from './BoardView'

afterEach(() => { document.body.innerHTML = '' })

const project = { id: 'p1', name: 'Home', color: '#0f0', parent_id: null, position: 0, archived: false, created_at: 0, deleted_at: null, _clock: {} } as unknown as Project
const section = { id: 's1', project_id: 'p1', name: 'Kitchen', position: 0, created_at: 0, deleted_at: null, _clock: {} } as unknown as Section
const task = { id: 'a', title: 'Order the worktop', description: '', project_id: 'p1', parent_id: null, section_id: 's1', priority: 4, due: null, labels: [], position: 0, created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {} } as unknown as Task
const columns: BoardColumn[] = [{ key: 's1', section, cards: [task] }]

const board = (editable: boolean) => render(<BoardView project={project} columns={columns} editable={editable} addingTo={null} setAddingTo={() => {}} projects={[project]} labels={[]}
  renderCard={(t) => <li key={t.id} data-task-id={t.id}>{t.title}</li>} />)

describe('Add a section column', () => {
  it('ends an editable board as a dashed column and opens the name field', async () => {
    const r = await board(true)
    const add = document.querySelector<HTMLButtonElement>('[data-board] > [data-add-section]')!
    expect(add.className).toContain('ui-column-add')
    expect(add.textContent).toBe('Add a section')
    expect(add.querySelector('[data-icon="plus"]')).not.toBeNull()
    expect(document.querySelector('[data-board]')!.lastElementChild).toBe(add)
    await click(add)
    await flush()
    expect(document.querySelector('[data-add-section]')).toBeNull()
    expect(document.querySelector('input[aria-label="New section name"]')).not.toBeNull()
    await r.unmount()
  })

  it('is absent from a read-only board, and so is "Add a task"', async () => {
    const r = await board(false)
    expect(document.querySelector('[data-add-section]')).toBeNull()
    expect(document.querySelector('[data-column-add]')).toBeNull()
    await r.unmount()
  })
})
