// @vitest-environment happy-dom
// The toast after Undo leaves (GitHub issue 348, design-system "Toast primitive"):
// clicking Undo focuses the button and then removes it, and browsers do not always
// report that focus left; the "Undone." result must still leave on its own, and every
// toast can be dismissed with its close button or Escape.
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '../../ui/test-utils'
import { ACTION_TOAST_MS, hideBulkToast, showBulkToast, showUndoToast } from './toastStore'
import { UndoToast } from './UndoToast'

vi.mock('../../lib/undo', () => ({
  undoBatch: vi.fn(async () => ({ restored: 1, skipped: [] })),
  undoTaskCount: vi.fn(async () => 1),
}))

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }) })
afterEach(() => {
  act(() => hideBulkToast())
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const toastEl = () => document.querySelector<HTMLElement>('[data-bulk-toast]')
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve() })

describe('the toast after Undo', () => {
  it('reads "Undone." and leaves five seconds later, although focus was on the removed Undo button', async () => {
    const r = await render(<UndoToast />)
    act(() => showUndoToast('Task completed', 'u1'))
    advance(4_000)
    const undo = toastEl()!.querySelector<HTMLButtonElement>('[data-toast-undo]')!
    // A click focuses the button; removing it fires no focusout here, as in Chrome under React.
    act(() => { undo.focus(); undo.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
    act(() => { undo.click() })
    await settle()
    expect(toastEl()!.querySelector('[role="status"]')!.textContent).toBe('Undone.')
    expect(toastEl()!.querySelector('[data-toast-undo]')).toBeNull()
    // The result has a time of its own (not the second left of the offer) and then leaves.
    advance(ACTION_TOAST_MS - 100)
    expect(toastEl()).not.toBeNull()
    advance(200)
    expect(toastEl()).toBeNull()
    await r.unmount()
  })

  it('the close button dismisses a toast at once', async () => {
    const r = await render(<UndoToast />)
    act(() => showBulkToast('3 tasks rescheduled', 'u1'))
    const close = toastEl()!.querySelector<HTMLButtonElement>('button[data-toast-dismiss]')!
    expect(close.getAttribute('aria-label')).toBe('Dismiss')
    act(() => { close.click() })
    expect(toastEl()).toBeNull()
    await r.unmount()
  })

  it('Escape with focus inside dismisses it and gives focus back to where it was', async () => {
    const before = document.createElement('button')
    document.body.append(before)
    before.focus()
    const r = await render(<UndoToast />)
    act(() => showUndoToast('Task completed', 'u1'))
    const undo = toastEl()!.querySelector<HTMLButtonElement>('[data-toast-undo]')!
    act(() => { undo.focus(); undo.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: before })) })
    act(() => { undo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(toastEl()).toBeNull()
    expect(document.activeElement).toBe(before)
    await r.unmount()
  })
})
