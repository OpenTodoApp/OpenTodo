import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { createProject, createTask, resetDeviceId, setTaskCompleted } from '../lib/ops'
import type { Task } from '../lib/types'
import { registerListState, taskDefaults, type ListState } from './listActions'
import { listActions, makeListActions } from './vim/actions'

let n = 0
beforeEach(() => {
  useDatabase(`list-actions-${Date.now()}-${n++}`)
  resetDeviceId()
})

/** A list over the given task ids, read fresh from IndexedDB like the live query does. */
async function list(ids: string[], opts: Partial<ListState> = {}) {
  const state = { rows: [] as Task[], selected: null as string | null, open: null as string | null, focused: null as string | null | undefined }
  const refresh = async () => {
    state.rows = (await Promise.all(ids.map((id) => db.tasks.get(id)))).filter((t): t is Task => !!t && !t.deleted_at)
  }
  await refresh()
  const actions = makeListActions({
    rows: () => state.rows,
    columns: () => null,
    selected: () => state.selected,
    select: (id) => (state.selected = id),
    openId: () => state.open,
    open: (id) => (state.open = id),
    readOnly: () => false,
    manual: () => true,
    focusQuickAdd: (after) => {
      state.focused = after
      return true
    },
    toggleComplete: (id, completed) => setTaskCompleted(id, completed),
    ...opts,
  })
  return { state, actions, refresh }
}

describe('list actions', () => {
  it('deleteSelected writes a tombstone op', async () => {
    const a = await createTask({ title: 'a' })
    const b = await createTask({ title: 'b' })
    const { state, actions } = await list([a, b])
    state.selected = a
    state.open = a
    await actions.deleteSelected()
    expect((await db.tasks.get(a))?.deleted_at).toBeTypeOf('number')
    const ops = await db.outbox.toArray()
    expect(ops.some((o) => o.entityId === a && o.field === 'deleted_at' && typeof o.value === 'number')).toBe(true)
    expect(state.selected).toBe(b)
    expect(state.open).toBeNull()
  })

  it('toggleCompleteSelected flips completed_at', async () => {
    const a = await createTask({ title: 'a' })
    const { state, actions, refresh } = await list([a])
    state.selected = a
    await actions.toggleCompleteSelected()
    expect((await db.tasks.get(a))?.completed_at).toBeTypeOf('number')
    await refresh()
    await actions.toggleCompleteSelected()
    expect((await db.tasks.get(a))?.completed_at).toBeNull()
  })

  it('leaves read-only tasks alone', async () => {
    const a = await createTask({ title: 'a' })
    const { state, actions } = await list([a], { readOnly: () => true })
    state.selected = a
    const before = await db.outbox.count()
    await actions.deleteSelected()
    await actions.toggleCompleteSelected()
    await actions.setPrioritySelected(1)
    expect(await db.outbox.count()).toBe(before)
  })

  it('moves the selection with clamping, first and last', async () => {
    const ids = [await createTask({ title: '1' }), await createTask({ title: '2' }), await createTask({ title: '3' }), await createTask({ title: '4' })]
    const { state, actions } = await list(ids)
    actions.moveSelection(3)
    expect(state.selected).toBe(ids[2])
    actions.moveSelection(5)
    expect(state.selected).toBe(ids[3])
    actions.moveSelection(-2)
    expect(state.selected).toBe(ids[1])
    actions.selectFirst()
    expect(state.selected).toBe(ids[0])
    actions.selectLast()
    expect(state.selected).toBe(ids[3])
    actions.selectIndex(1)
    expect(state.selected).toBe(ids[1])
  })

  it('moves within a board column', async () => {
    const ids = [await createTask({ title: '1' }), await createTask({ title: '2' }), await createTask({ title: '3' })]
    const { state } = await list(ids)
    const tasks = state.rows
    const board = makeListActions({ ...actionsState(state), columns: () => [[tasks[0]], [tasks[1], tasks[2]]] })
    state.selected = ids[1]
    board.moveSelection(5)
    expect(state.selected).toBe(ids[2])
  })

  it('o remembers the selection only in manually ordered views', async () => {
    const a = await createTask({ title: 'a' })
    const manual = await list([a])
    manual.state.selected = a
    manual.actions.openQuickAdd()
    expect(manual.state.focused).toBe(a)
    const sorted = await list([a], { manual: () => false })
    sorted.state.selected = a
    sorted.actions.openQuickAdd()
    expect(sorted.state.focused).toBeNull()
  })

  it('registers and unregisters', () => {
    const state = actionsState({ rows: [], selected: null, open: null })
    const off = registerListState(state)
    const actions = listActions()
    expect(actions).not.toBeNull()
    expect(listActions()).toBe(actions)
    off()
    expect(listActions()).toBeNull()
  })

  it('gives new tasks the view defaults', async () => {
    const p = await createProject({ name: 'Work' })
    expect(taskDefaults({ view: 'project', id: p }, '2026-10-10')).toEqual({ project_id: p, due: null, labels: [] })
    expect(taskDefaults({ view: 'upcoming' }, '2026-10-31').due).toEqual({ date: '2026-11-01' })
    expect(taskDefaults({ view: 'assigned' }, '2026-10-10', 'u1').assignee_id).toBe('u1')
  })
})

function actionsState(state: { rows: Task[]; selected: string | null; open: string | null }): ListState {
  return {
    rows: () => state.rows,
    columns: () => null,
    selected: () => state.selected,
    select: (id) => (state.selected = id),
    openId: () => state.open,
    open: (id) => (state.open = id),
    readOnly: () => false,
    manual: () => true,
    focusQuickAdd: () => true,
    toggleComplete: () => Promise.resolve(),
  }
}
