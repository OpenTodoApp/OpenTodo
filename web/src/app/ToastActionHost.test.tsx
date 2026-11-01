// The action toast's host: shows the message, leaves after the action window, and
// dismisses from its button.
// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '../ui/test-utils'
import { ToastActionHost } from './ToastActionHost'
import { hideActionToast, hideBulkToast, showActionToast, showBulkToast } from './bulk/toastStore'

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }) })
afterEach(() => {
  act(() => hideActionToast())
  vi.useRealTimers()
})

const toastEl = () => document.querySelector('[data-action-toast]')
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('the action toast host', () => {
  it('shows a failure and leaves after the action window', async () => {
    const r = await render(<ToastActionHost />)
    act(() => showActionToast('The time entry could not be started; this session is not being tracked. (test)'))
    expect(toastEl()).not.toBeNull()
    expect(toastEl()!.querySelector('[role="status"]')!.textContent).toContain('not being tracked')
    advance(5_100)
    expect(toastEl()).toBeNull()
    await r.unmount()
  })

  it('a new message replaces the previous one', async () => {
    const r = await render(<ToastActionHost />)
    act(() => showActionToast('first'))
    advance(1_000)
    act(() => showActionToast('second'))
    expect(toastEl()!.querySelector('[role="status"]')!.textContent).toBe('second')
    await r.unmount()
  })

  it('waits while an undo offer shows, then takes its place with a full window', async () => {
    const r = await render(<ToastActionHost />)
    act(() => showBulkToast('3 tasks trashed', 'u1'))
    act(() => showActionToast('The time entry could not be started; this session is not being tracked. (test)'))
    expect(toastEl()).toBeNull()
    advance(6_000)
    expect(toastEl()).toBeNull()
    act(() => hideBulkToast())
    expect(toastEl()).not.toBeNull()
    advance(5_100)
    expect(toastEl()).toBeNull()
    await r.unmount()
  })

  it('the window starts when first shown, not when raised', async () => {
    const r = await render(<ToastActionHost />)
    act(() => showBulkToast('3 tasks trashed', 'u1'))
    act(() => showActionToast('first failure'))
    advance(4_000)
    act(() => hideBulkToast())
    expect(toastEl()).not.toBeNull()
    advance(1_000)
    expect(toastEl()).not.toBeNull()
    advance(4_200)
    expect(toastEl()).toBeNull()
    await r.unmount()
  })

  it('hover holds the message', async () => {
    const r = await render(<ToastActionHost />)
    act(() => showActionToast('first failure'))
    advance(4_000)
    const el = toastEl()!
    await act(async () => { el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: document.body })) })
    advance(6_000)
    expect(toastEl()).not.toBeNull()
    await act(async () => { el.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body })) })
    advance(5_100)
    expect(toastEl()).toBeNull()
    await r.unmount()
  })

  it('the hold resets when the message changes, so the next one expires on its own', async () => {
    const r = await render(<ToastActionHost />)
    act(() => showActionToast('first failure'))
    const el = toastEl()!
    el.querySelector('[data-action-toast-dismiss]')!.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }))
    await act(async () => { (el.querySelector('[data-action-toast-dismiss]') as HTMLButtonElement).click() })
    expect(toastEl()).toBeNull()
    act(() => showActionToast('second failure'))
    advance(5_100)
    expect(toastEl()).toBeNull()
    await r.unmount()
  })

  it('the region moves aside when it would cover the focused element', async () => {
    const r = await render(<ToastActionHost />)
    act(() => showActionToast('first failure'))
    expect(document.querySelector('[data-toast-region]')!.getAttribute('data-toast-side')).toBe('end')
    await r.unmount()
  })

  it('Dismiss closes it', async () => {
    const r = await render(<ToastActionHost />)
    act(() => showActionToast('first'))
    await act(async () => { (toastEl()!.querySelector('[data-action-toast-dismiss]') as HTMLButtonElement).click() })
    expect(toastEl()).toBeNull()
    await r.unmount()
  })
})
