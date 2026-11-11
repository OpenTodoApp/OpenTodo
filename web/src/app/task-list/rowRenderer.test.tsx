// @vitest-environment happy-dom
// The list keeps each row's element while nothing that row shows changed
// (list-rendering-at-scale D5, D6): a write renews the progress, blocker, flow and
// habit maps, and only the rows whose own answers changed are made again.
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { flatRow, type ListRow } from '../../lib/listGroups'
import type { Progress } from '../../lib/subtasks'
import type { Task } from '../../lib/types'
import { noteKeys } from '../../lib/taskDelta'
import { render } from '../../ui/test-utils'
import { useRowRenderer, type RowContext } from './ListGroups'
import type { RowActions } from './TaskListRow'

const task = (id: string): Task => ({ id, title: id, notes: '', project_id: null, section_id: null, parent_id: null, position: 1, priority: 4, due: null, deadline: null, start: null, labels: [], completed_at: null, deleted_at: null, created_at: 1, updated_at: 1, assignee_id: null } as unknown as Task)
const noop = () => {}
const actions: RowActions = { toggle: noop, toggleCollapse: noop, open: noop, openPage: noop, tick: noop, drag: noop, grip: noop, gripTap: noop, more: noop, expand: noop, context: noop, contextAt: noop }
const NONE = new Set<string>()
const readOnly = () => false
// The list-wide fields: the same objects from one render to the next, as the list keeps them.
const LABELS = new Map()
const FIELDS: RowContext['projectFieldDefs'] = []

function context(over: Partial<RowContext> = {}): RowContext {
  return {
    view: 'project', projectMap: new Map(), labelMap: LABELS, memberMap: new Map(), selectedId: null, progress: new Map(), blocked: new Map(),
    habits: new Map(), isReadOnly: readOnly, board: false, manual: true, treeView: true, dropAt: null, draggingId: null, ticked: NONE, showCheckbox: false,
    fieldColumns: false, projectFieldDefs: FIELDS, siblingPos: new Map(), timeColumn: false, actions, addingUnder: null, onCloseSubtask: noop, subtaskAddOpen: null, openSubtaskAdd: noop, ...over,
  }
}

function Probe({ c, rows, out }: { c: RowContext; rows: ListRow[]; out: ReactNode[][] }) {
  const renderRow = useRowRenderer(c)
  out.push(rows.map(renderRow))
  return null
}

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

  it('makes every row again when a list-wide field changes', async () => {
    const out: ReactNode[][] = []
    const r = await render(<Probe c={context()} rows={rows} out={out} />)
    await r.rerender(<Probe c={context({ showCheckbox: true })} rows={rows} out={out} />)
    const [first, second] = out.slice(-2)
    second.forEach((el, i) => expect(el).not.toBe(first[i]))
    await r.unmount()
  })
})
