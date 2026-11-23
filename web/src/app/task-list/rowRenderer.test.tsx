// @vitest-environment happy-dom
// The list keeps each row's element while nothing that row shows changed
// (list-rendering-at-scale D5, D6): a write renews the progress, blocker, flow and
// habit maps, and only the rows whose own answers changed are made again.
import { useMemo, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { flatRow, type ListGroup, type ListRow } from '../../lib/listGroups'
import type { Progress } from '../../lib/subtasks'
import type { Task } from '../../lib/types'
import { noteKeys } from '../../lib/taskDelta'
import { render } from '../../ui/test-utils'
import { GroupedList, rowRenderer, useRowRenderer, type RowContext } from './ListGroups'
import { markGhost } from '../motion'
import { ViewResults } from '../views/ViewResults'
import { TaskRow } from '../TaskRow'
import type { RowActions } from './TaskListRow'

const task = (id: string): Task => ({ id, title: id, notes: '', project_id: null, section_id: null, parent_id: null, position: 1, priority: 4, due: null, deadline: null, start: null, labels: [], completed_at: null, deleted_at: null, created_at: 1, updated_at: 1, assignee_id: null } as unknown as Task)
const noop = () => {}
const actions: RowActions = { toggle: noop, toggleCollapse: noop, open: noop, openPage: noop, editTitle: noop, tick: noop, drag: noop, grip: noop, gripTap: noop, more: noop, expand: noop, context: noop, contextAt: noop }
const NONE = new Set<string>()
const readOnly = () => false
// The list-wide fields: the same objects from one render to the next, as the list keeps them.
const LABELS = new Map()
const FIELDS: RowContext['projectFieldDefs'] = []

function context(over: Partial<RowContext> = {}): RowContext {
  return {
    view: 'project', projectMap: new Map(), labelMap: LABELS, memberMap: new Map(), selectedId: null, progress: new Map(), blocked: new Map(),
    habits: new Map(), isReadOnly: readOnly, board: false, manual: true, treeView: true, dropAt: null, draggingId: null, ticked: NONE, showCheckbox: false,
    fieldColumns: false, projectFieldDefs: FIELDS, siblingPos: new Map(), timeColumn: false, actions, addingUnder: null, onCloseSubtask: noop, subtaskAddOpen: null, openSubtaskAdd: noop, subtaskAddEnds: new Map(), ...over,
  }
}

function Probe({ c, rows, out }: { c: RowContext; rows: ListRow[]; out: ReactNode[][] }) {
  const renderRow = useRowRenderer(c)
  out.push(rows.map((row) => renderRow(row)))
  return null
}

function Sections({ groups, fieldColumns = false }: { groups: ListGroup[]; fieldColumns?: boolean }) {
  const c = useMemo(() => context({ fieldColumns }), [fieldColumns])
  const renderRow = useRowRenderer(c)
  return <GroupedList groups={groups} view="inbox" fieldColumns={fieldColumns} projectFieldDefs={FIELDS} editable={false}
    renderRow={renderRow} addingTo={null} setAddingTo={noop} onToggleSection={noop} doneBySection={new Map()}
    revealed={NONE} onReveal={noop} toggleCollapsed={noop} collapsedGroups={NONE} projects={[]} labels={[]} />
}

const group = (key: string, rows: ListRow[]): ListGroup => ({ key, rows, heading: key, count: rows.length })
const roots = (...ids: string[]) => ids.map((id) => flatRow(task(id)))
const separatorIds = () => [...document.querySelectorAll('[data-task-group-separator]')]
  .map((line) => line.closest('[data-task-id]')?.getAttribute('data-task-id'))

describe('task group separators', () => {
  it('follows the current group boundaries after collapse, reorder and completion', async () => {
    const [parent, next, last, work, home] = roots('parent', 'next', 'last', 'work', 'home')
    const child = { ...flatRow(task('child')), depth: 1 }
    const grandchild = { ...flatRow(task('grandchild')), depth: 2 }
    const second = group('Second', [work, home])
    const r = await render(<Sections groups={[group('First', [parent, child, grandchild, next, last]), second]} />)
    expect(separatorIds()).toEqual(['next', 'last', 'home'])
    await r.rerender(<Sections groups={[group('First', [last, { ...parent, collapsed: true }, next]), second]} />)
    expect(separatorIds()).toEqual(['parent', 'next', 'home'])
    await r.rerender(<Sections groups={[group('First', [{ ...last, task: markGhost({ ...last.task }) }, next]), second]} />)
    expect(separatorIds()).toEqual(['home'])
    await r.unmount()
  })

  it('keeps task groups across rendering blocks and through the custom field table', async () => {
    const rows = roots(...Array.from({ length: 51 }, (_, i) => `row-${i}`))
    rows[25] = { ...rows[25], depth: 1 }
    const r = await render(<Sections groups={[group('Tasks', rows)]} />)
    const starts = [...document.querySelectorAll('.row-block > ul > li:first-child')]
    expect(starts.map((row) => row.getAttribute('data-task-id'))).toEqual(['row-0', 'row-25', 'row-50'])
    expect(separatorIds()).toEqual(rows.filter((_, i) => i !== 0 && i !== 25).map((row) => row.task.id))
    await r.rerender(<Sections groups={[group('Tasks', rows.slice(24, 27))]} fieldColumns />)
    expect(document.querySelector('[data-columns-row="row-26"] [data-task-group-separator]')).not.toBeNull()
    expect(separatorIds()).toEqual(['row-26'])
    await r.unmount()
  })

  it('respects visible nesting in saved results and leaves board cards alone', async () => {
    const first = { key: 'first', heading: 'First', tasks: [task('parent'), task('child'), task('other')] }
    const second = { key: 'second', heading: 'Second', tasks: [task('last')] }
    const results = (layout: 'list' | 'board') => (
      <ViewResults groups={[first, second]} layout={layout} isNested={(key) => key === 'first:child'}
        renderTask={(item, key, shape, groupSeparator) => <TaskRow key={key} task={item} shape={shape} groupSeparator={groupSeparator}
          selected={false} showProject={false} onOpen={noop} onToggle={noop} />} />
    )
    const r = await render(results('list'))
    expect(separatorIds()).toEqual(['other'])
    await r.rerender(results('board'))
    expect(separatorIds()).toEqual([])
    await r.unmount()
  })
})

describe('useRowRenderer', () => {
  const rows = [flatRow(task('a')), flatRow(task('b')), flatRow(task('c'))]
  const progress = (b: Progress) => new Map([['a', { done: 1, total: 2 }], ['b', b]])

  it('keeps every element when a write renews the maps with the same answers', async () => {
    const out: ReactNode[][] = []
    const r = await render(<Probe c={context({ progress: progress({ done: 0, total: 1 }) })} rows={rows} out={out} />)
    await r.rerender(<Probe c={context({ progress: progress({ done: 0, total: 1 }), blocked: new Map(), isReadOnly: () => false })} rows={rows} out={out} />)
    const [first, second] = out.slice(-2)
    second.forEach((el, i) => expect(el).toBe(first[i]))
    await r.unmount()
  })

  it('makes again only the rows whose answers changed', async () => {
    const out: ReactNode[][] = []
    const r = await render(<Probe c={context({ progress: progress({ done: 0, total: 1 }) })} rows={rows} out={out} />)
    await r.rerender(<Probe c={context({ progress: progress({ done: 1, total: 1 }), selectedId: 'c' })} rows={rows} out={out} />)
    const [first, second] = out.slice(-2)
    expect(second[0]).toBe(first[0])
    expect(second[1]).not.toBe(first[1])
    expect(second[2]).not.toBe(first[2])
    await r.unmount()
  })

  it('with the keys a patched map noted, looks up only those rows (incremental-list-updates D3)', async () => {
    const out: ReactNode[][] = []
    const before = progress({ done: 0, total: 1 })
    const first = context({ progress: before })
    const r = await render(<Probe c={first} rows={rows} out={out} />)
    // A patch renewed the map and noted 'b'; 'a' reads differently but was not noted, so it is not looked up.
    const after = new Map([['a', { done: 2, total: 2 }], ['b', { done: 1, total: 1 }]])
    const looked: string[] = []
    const spy = new Proxy(after, { get: (m, k) => { if (k === 'get') return (id: string) => { looked.push(id); return m.get(id) }; const v = Reflect.get(m, k, m); return typeof v === 'function' ? v.bind(m) : v } })
    noteKeys(before, spy, new Set(['b']))
    // The other maps stay the objects they were, as a write that touched only progress leaves them.
    await r.rerender(<Probe c={{ ...first, progress: spy as Map<string, Progress> }} rows={rows} out={out} />)
    const [was, now] = out.slice(-2)
    expect(now[0]).toBe(was[0])
    expect(now[1]).not.toBe(was[1])
    expect(now[2]).toBe(was[2])
    expect(looked.filter((id) => id !== 'b')).toEqual([])
    await r.unmount()
  })

  it('makes again the row an "Add a subtask" line turns on for when its parent is selected', async () => {
    // The line shows for the selected parent but lives on the row its subtree ends at
    // (quick-subtask-add): the ending row reads differently, the others are kept.
    const parent = task('p'), last = task('l')
    const marked: ListRow = { ...flatRow(last), parent: 'p', depth: 1, subtaskAdds: [{ task: parent, depth: 0 }] }
    const markedRows = [flatRow(parent), marked, flatRow(task('o'))]
    const ends = new Map([['p', 'l']])
    const out: ReactNode[][] = []
    const r = await render(<Probe c={context({ subtaskAddEnds: ends })} rows={markedRows} out={out} />)
    await r.rerender(<Probe c={context({ selectedId: 'p', subtaskAddEnds: ends })} rows={markedRows} out={out} />)
    const [first, second] = out.slice(-2)
    // The parent re-draws as the selected row, the ending row for the line it now shows.
    expect(second[0]).not.toBe(first[0])
    expect(second[1]).not.toBe(first[1])
    expect(second[2]).toBe(first[2])
    await r.unmount()
  })

  it('draws no "Add a subtask" line on a departing row or while a drag runs', async () => {
    const parent = task('p'), last = task('l')
    const marked: ListRow = { ...flatRow(last), parent: 'p', depth: 1, subtaskAdds: [{ task: parent, depth: 0 }] }
    const r1 = await render(<ul>{rowRenderer(context({ draggingId: 'x' }))(marked)}</ul>)
    expect(document.querySelector('[data-subtask-adds]')).toBeNull()
    await r1.unmount()
    const ghost = { ...marked, task: markGhost(task('g')) }
    const r2 = await render(<ul>{rowRenderer(context())(ghost)}</ul>)
    expect(document.querySelector('[data-subtask-adds]')).toBeNull()
    await r2.unmount()
  })

  it('makes every row again when a list-wide field changes', async () => {
    const out: ReactNode[][] = []
    const r = await render(<Probe c={context()} rows={rows} out={out} />)
    await r.rerender(<Probe c={context({ showCheckbox: true })} rows={rows} out={out} />)
    const [first, second] = out.slice(-2)
    second.forEach((el, i) => expect(el).not.toBe(first[i]))
    await r.unmount()
  })
})
