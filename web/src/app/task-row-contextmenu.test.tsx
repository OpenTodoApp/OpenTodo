// @vitest-environment happy-dom
// Right-click on a task row opens the actions menu at the pointer
// (OpenSpec change task-row-context-menu): the row event, the selection rule,
// the anchor at the pointer and the drag guard in the list bindings.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import type { Task } from '../lib/types'
import { mockFetch, noPublicLinks, render, waitFor } from '../ui/test-utils'
import { TaskListView } from './TaskListView'
import { TaskRow } from './TaskRow'
import { useBulkList } from './bulk/useBulkList'
import { rowMenuIds, useListBindings, type BindingContext } from './task-list/useListBindings'

beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

/** A right-click at (x, y); returns the event so a test can read defaultPrevented. */
function rightClick(el: Element, x: number, y: number): MouseEvent {
  const e = new MouseEvent('contextmenu', { clientX: x, clientY: y, bubbles: true, cancelable: true })
  act(() => { el.dispatchEvent(e) })
  return e
}

function escape() {
  act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
}

const task = (over: Partial<Task>): Task => ({
  id: 't', title: 'Task', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {}, ...over,
} as Task)

/** The right-click menu's trigger: the fixed-position anchor (the Selection bar has its own, unpositioned, ellipsis trigger). */
const menuButton = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Actions for"]')].find((b) => b.style.position === 'fixed') ?? null

/** Right-click until the menu appears (rows re-render on the first store ticks). */
async function rightClickUntilMenu(row: () => Element | null, container: HTMLElement, x: number, y: number): Promise<MouseEvent> {
  let e!: MouseEvent
  await waitFor(() => {
    const el = row()
    if (!el) return false
    e = rightClick(el, x, y)
    return !!menuButton(container)
  })
  // One more, on a settled row: this dispatch goes through the real handler.
  e = rightClick(row()!, x, y)
  expect(e.defaultPrevented).toBe(true)
  return e
}

describe('the row event', () => {
  it('fires on the row with the pointer position and suppresses the browser menu', async () => {
    const spy = vi.fn()
    const r = await render(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} onContextMenu={spy} /></ul>)
    const li = r.container.querySelector('li[data-task-id]')!
    const e = rightClick(li, 240, 130)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toMatchObject({ clientX: 240, clientY: 130 })
    expect(e.type).toBe('contextmenu')
    // The suppression of the browser menu lives in the list handlers below
    // (useListBindings / useBulkList), not in the row, which only forwards.
    await r.unmount()
  })
})

describe('right-click in a list', () => {
  it('opens the actions menu anchored where the pointer was, and Escape closes it', async () => {
    await createTask({ title: 'Call mum' })
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => r.container.textContent!.includes('Call mum'))
    await rightClickUntilMenu(() => r.container.querySelector('[data-task-id]'), r.container, 120, 200)
    const trigger = menuButton(r.container)!
    expect(trigger.getAttribute('aria-label')).toBe('Actions for 1 task')
    expect(trigger.style.position).toBe('fixed')
    expect(trigger.style.left).toBe('120px')
    expect(trigger.style.top).toBe('200px')
    escape()
    await waitFor(() => !menuButton(r.container))
    await r.unmount()
  })

  it('right-clicking a ticked row targets the whole selection, an unticked row alone', async () => {
    const tasks = [task({ id: 'a', title: 'Alpha' }), task({ id: 'b', title: 'Beta' }), task({ id: 'c', title: 'Gamma' })]
    let bulk: ReturnType<typeof useBulkList> | null = null
    function Harness() {
      bulk = useBulkList(tasks)
      return (
        <ul>
          {tasks.map((t) => <TaskRow key={t.id} task={t} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} {...bulk!.rowProps(t.id)} />)}
          {bulk!.render(null)}
        </ul>
      )
    }
    const r = await render(<Harness />)
    const row = (id: string) => r.container.querySelector(`li[data-task-id="${id}"]`)!
    // Two ticked: the menu acts on both (the Selection bar's own rule).
    act(() => { bulk!.selection.set(['a', 'b']) })
    await waitFor(() => !!r.container.querySelector('li[data-task-id="a"][data-ticked]'))
    await rightClickUntilMenu(() => row('b'), r.container, 10, 20)
    expect(menuButton(r.container)!.getAttribute('aria-label')).toBe('Actions for 2 tasks')
    escape()
    await waitFor(() => !menuButton(r.container))
    // An unticked row: just itself, and the selection is untouched.
    await rightClickUntilMenu(() => row('c'), r.container, 30, 40)
    expect(menuButton(r.container)!.getAttribute('aria-label')).toBe('Actions for 1 task')
    expect([...bulk!.selection.ticked]).toEqual(['a', 'b'])
    await r.unmount()
  })
})

describe('the list bindings', () => {
  const ctxOver = (over: Partial<BindingContext> = {}): BindingContext => ({
    route: { view: 'today' }, rows: [], columns: [], board: false, manual: false,
    selectedId: null, setSelectedId: vi.fn(), openId: null, isReadOnly: () => false,
    taskMap: new Map(), ticked: ['a', 'b'],
    selection: { ticked: new Set(['a', 'b']), toggle: vi.fn(), extendTo: vi.fn(), selectAll: vi.fn(), set: vi.fn(), clear: vi.fn() },
    ui: { pickerFor: null, setPickerFor: vi.fn(), assignFor: null, setAssignFor: vi.fn(), prompt: null, setPrompt: vi.fn(), addingUnder: null, setAddingUnder: vi.fn(), addingTo: null, setAddingTo: vi.fn(), openActions: vi.fn() },
    setSelectMode: vi.fn(), toggleComplete: vi.fn(), toggleCollapsed: vi.fn(), startDrag: vi.fn(), setExpandedId: vi.fn(),
    quickAddRef: { current: null }, insertAfter: { current: null }, listRoot: { current: null },
    projectReadOnly: false, openContextMenu: vi.fn(), openRowMenu: vi.fn(), draggingId: null, ...over,
  } as BindingContext)

  it('delegates to the shared row-menu rule, and stays silent while a drag is lifted', async () => {
    const openRowMenu = vi.fn()
    let actions: ReturnType<typeof useListBindings> | null = null
    function Harness({ c }: { c: BindingContext }) {
      actions = useListBindings(c)
      return null
    }
    const r = await render(<Harness c={ctxOver({ openRowMenu })} />)
    const ev = (x: number, y: number) => new MouseEvent('contextmenu', { clientX: x, clientY: y, cancelable: true })
    const ok = ev(55, 66)
    act(() => { actions!.context(ok as never, task({ id: 'b' })) })
    expect(ok.defaultPrevented).toBe(true)
    expect(openRowMenu).toHaveBeenCalledTimes(1)
    expect(openRowMenu.mock.calls[0][1]).toBe(55)
    expect(openRowMenu.mock.calls[0][2]).toBe(66)
    expect(openRowMenu.mock.calls[0][0]).toMatchObject({ id: 'b' })
    // A lifted drag wins: nothing opens (the native menu is still suppressed).
    await r.rerender(<Harness c={ctxOver({ openRowMenu, draggingId: 'a' })} />)
    const during = ev(70, 80)
    act(() => { actions!.context(during as never, task({ id: 'b' })) })
    expect(during.defaultPrevented).toBe(true)
    expect(openRowMenu).toHaveBeenCalledTimes(1)
    await r.unmount()
  })

  it('the shared rule: the ticked selection when the row is one of it, else the row', () => {
    expect(rowMenuIds(task({ id: 'b' }), new Set(['a', 'b']))).toEqual(['a', 'b'])
    expect(rowMenuIds(task({ id: 'z' }), new Set(['a', 'b']))).toEqual(['z'])
    expect(rowMenuIds(task({ id: 'b' }), new Set())).toEqual(['b'])
  })
})

// Touch: hold and release (task-row-context-menu). A mouse never sends this gesture:
// the hold arms the row (tint feedback), a release opens the menu at the finger, a
// move ends the hold — a scroll on a plain row, the drag itself on a draggable one.
describe('touch hold', () => {
  const TOUCH_ID = 3
  const touch = (target: EventTarget, type: string, x: number, y: number) => act(() => {
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: TOUCH_ID, pointerType: 'touch',
      clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true,
    }))
  })
  const release = (x: number, y: number) => touch(window, 'pointerup', x, y)

  it('a held row arms, and releasing opens its menu at the finger; a move before the hold is a scroll', async () => {
    const spy = vi.fn()
    const r = await render(<ul><TaskRow task={task({})} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} onContextMenu={spy} /></ul>)
    const li = r.container.querySelector('li[data-task-id]')!
    // Held still: the row tints (feedback), but nothing opens yet.
    touch(li, 'pointerdown', 40, 60)
    await waitFor(() => li.hasAttribute('data-touch-hold'), 'the row to arm')
    expect(spy).not.toHaveBeenCalled()
    release(44, 64)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toMatchObject({ clientX: 44, clientY: 64 })
    expect(li.hasAttribute('data-touch-hold')).toBe(false)
    // Moved before the hold elapsed: the page scrolls, no menu.
    touch(li, 'pointerdown', 40, 60)
    touch(window, 'pointermove', 90, 60)
    expect(li.hasAttribute('data-touch-hold')).toBe(false)
    release(90, 60)
    expect(spy).toHaveBeenCalledTimes(1)
    await r.unmount()
  })

  it('hold and release on a list row opens the actions menu anchored at the finger', async () => {
    await createTask({ title: 'Call mum' })
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => r.container.textContent!.includes('Call mum'), 'the task in the list')
    const li = r.container.querySelector('li[data-task-id]')!
    touch(li, 'pointerdown', 120, 200)
    await waitFor(() => li.hasAttribute('data-touch-hold'), 'the row to arm')
    release(120, 200)
    await waitFor(() => !!menuButton(r.container), 'the menu to open at the finger')
    const trigger = menuButton(r.container)!
    expect(trigger.getAttribute('aria-label')).toBe('Actions for 1 task')
    expect(trigger.style.position).toBe('fixed')
    expect(trigger.style.left).toBe('120px')
    expect(trigger.style.top).toBe('200px')
    escape()
    await waitFor(() => !menuButton(r.container), 'the menu to close')
    await r.unmount()
  })

  it('a held row that moves drags instead: the ghost lifts and no menu opens', async () => {
    await createTask({ title: 'Call mum' })
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => r.container.textContent!.includes('Call mum'), 'the task in the list')
    const li = r.container.querySelector('li[data-task-id]')!
    touch(li, 'pointerdown', 100, 150)
    await waitFor(() => li.hasAttribute('data-touch-hold'), 'the row to arm')
    touch(window, 'pointermove', 150, 190)
    await waitFor(() => !!document.querySelector('[data-drag-ghost]'), 'the drag to lift')
    // The drag lifted and took over the feedback; the release is a drop, not a menu.
    expect(li.hasAttribute('data-touch-hold')).toBe(false)
    release(150, 190)
    await waitFor(() => !document.querySelector('[data-drag-ghost]'), 'the drag to end')
    expect(menuButton(r.container)).toBeNull()
    await r.unmount()
  })
})
