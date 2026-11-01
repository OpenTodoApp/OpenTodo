// The action toast's host: shows the message, leaves after the action window, and
// dismisses from its button.
// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '../ui/test-utils'
import { ToastActionHost } from './ToastActionHost'
import { hideActionToast, showActionToast } from './bulk/toastStore'

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

  it('Dismiss closes it', async () => {
    const r = await render(<ToastActionHost />)
    act(() => showActionToast('first'))
    await act(async () => { (toastEl()!.querySelector('[data-action-toast-dismiss]') as HTMLButtonElement).click() })
    expect(toastEl()).toBeNull()
    await r.unmount()
  })
})
