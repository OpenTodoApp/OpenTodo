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
import { flush, mockFetch, noPublicLinks, render } from '../ui/test-utils'
import { TaskListView } from './TaskListView'
import { TaskRow } from './TaskRow'
import { useBulkList } from './bulk/useBulkList'
import { useListBindings, type BindingContext } from './task-list/useListBindings'

beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

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
    setSelectMode: vi.fn(), toggleComplete: vi.fn(), toggleCollapsed: vi.fn(), startDrag: vi.fn(),
    quickAddRef: { current: null }, insertAfter: { current: null }, listRoot: { current: null },
    projectReadOnly: false, openContextMenu: vi.fn(), draggingId: null, ...over,
  } as BindingContext)

  it('opens for the ticked selection, and stays silent while a drag is lifted', async () => {
    const open = vi.fn()
    let actions: ReturnType<typeof useListBindings> | null = null
    function Harness({ c }: { c: BindingContext }) {
      actions = useListBindings(c)
      return null
    }
    const r = await render(<Harness c={ctxOver({ openContextMenu: open })} />)
    const ev = (x: number, y: number) => new MouseEvent('contextmenu', { clientX: x, clientY: y, cancelable: true })
    const ok = ev(55, 66)
    act(() => { actions!.context(ok as never, task({ id: 'b' })) })
    expect(ok.defaultPrevented).toBe(true)
    expect(open).toHaveBeenCalledWith(['a', 'b'], 55, 66)
    // A lifted drag wins: nothing opens (the native menu is still suppressed).
    await r.rerender(<Harness c={ctxOver({ openContextMenu: open, draggingId: 'a' })} />)
    const during = ev(70, 80)
    act(() => { actions!.context(during as never, task({ id: 'b' })) })
    expect(during.defaultPrevented).toBe(true)
    expect(open).toHaveBeenCalledTimes(1)
    await r.unmount()
  })
})
