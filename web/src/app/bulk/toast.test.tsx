// @vitest-environment happy-dom
// The toast primitive (OpenSpec change moments-and-onboarding, task 6.2;
// design-system "Toast primitive"): pause on hover and focus, replacement, keyboard
// reach without taking focus, never covering the focused element, fade only.
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '../../ui/test-utils'
import { ACTION_TOAST_MS, hideBulkToast, showBulkToast, showUndoToast } from './toastStore'
import { TOAST_MS, UndoToast } from './UndoToast'

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }) })
afterEach(() => {
  act(() => hideBulkToast())
  vi.useRealTimers()
  document.body.innerHTML = ''
  document.documentElement.style.removeProperty('--toast-clearance')
})

const toastEl = () => document.querySelector<HTMLElement>('[data-bulk-toast]')
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('the toast primitive', () => {
  it('Pause on hover: a batch toast hovered at 8 s stays while hovered and leaves 2 s after the pointer leaves', async () => {
    const r = await render(<UndoToast />)
    act(() => showBulkToast('3 tasks rescheduled', 'u1'))
    expect(TOAST_MS).toBe(10_000)
    advance(8_000)
    act(() => { toastEl()!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: document.body })) })
    advance(10_000)
    expect(toastEl()).not.toBeNull()
    act(() => { toastEl()!.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body })) })
    advance(1_900)
    expect(toastEl()).not.toBeNull()
    advance(200)
    expect(toastEl()).toBeNull()
    await r.unmount()
  })

  it('pauses while focus is inside, and an action on one task stays five seconds', async () => {
    const r = await render(<UndoToast />)
    act(() => showUndoToast('Completed', 'u1'))
    expect(ACTION_TOAST_MS).toBe(5_000)
    const undo = toastEl()!.querySelector<HTMLButtonElement>('[data-toast-undo]')!
    act(() => { undo.focus(); undo.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
    advance(20_000)
    expect(toastEl()).not.toBeNull()
    act(() => { undo.blur(); undo.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null })) })
    advance(5_100)
    expect(toastEl()).toBeNull()
    await r.unmount()
  })

  it('Replacement: one toast, the newer offer only', async () => {
    const r = await render(<UndoToast />)
    act(() => showUndoToast('Completed', 'u1'))
    advance(2_000)
    act(() => showUndoToast('Deleted', 'u2'))
    expect(document.querySelectorAll('[data-bulk-toast]')).toHaveLength(1)
    expect(toastEl()!.querySelector('[role="status"]')!.textContent).toBe('Deleted')
    await r.unmount()
  })

  it('Keyboard: Undo first, then the second control; the toast never takes focus by itself', async () => {
    const before = document.createElement('button')
    document.body.append(before)
    before.focus()
    const r = await render(<UndoToast />)
    act(() => showBulkToast('Added to Home', 'u1', { action: { label: 'Open', run: () => {} } }))
    expect(document.activeElement).toBe(before)
    const controls = [...toastEl()!.querySelectorAll('button')].map((b) => b.textContent)
    expect(controls).toEqual(['Undo', 'Open'])
    expect(toastEl()!.querySelector('[role="status"]')).not.toBeNull()
    await r.unmount()
  })

  it('Focused row stays visible: the content column gets a bottom scroll padding of the toast height while it shows', async () => {
    const r = await render(<UndoToast />)
    act(() => showUndoToast('Completed', 'u1'))
    expect(document.documentElement.style.getPropertyValue('--toast-clearance')).toMatch(/^\d+px$/)
    const css = (await import('../../index.css?raw')).default
    expect(css).toMatch(/\.ui-toast-clear \{ scroll-padding-bottom: var\(--toast-clearance, 0px\); \}/)
    act(() => hideBulkToast())
    expect(document.documentElement.style.getPropertyValue('--toast-clearance')).toBe('')
    await r.unmount()
  })

  it('Opposite corner: from 640 px a focused element under the region sends the toast to the other corner', async () => {
    const mm = vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ matches: q.includes('640'), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList)
    const field = document.createElement('input')
    document.body.append(field)
    field.getBoundingClientRect = () => ({ left: 900, right: 1000, top: 700, bottom: 740, width: 100, height: 40, x: 900, y: 700, toJSON() {} }) as DOMRect
    field.focus()
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return (this.hasAttribute('data-toast-region') && this.getAttribute('data-toast-side') === 'end'
        ? { left: 650, right: 1010, top: 690, bottom: 760, width: 360, height: 70 }
        : { left: 16, right: 376, top: 690, bottom: 760, width: 360, height: 70 }) as DOMRect
    })
    const r = await render(<UndoToast />)
    act(() => showUndoToast('Completed', 'u1'))
    expect(document.querySelector('[data-toast-region]')!.getAttribute('data-toast-side')).toBe('start')
    rect.mockRestore()
    mm.mockRestore()
    await r.unmount()
  })

  it('Reduced motion: it only fades (an opacity animation), with no movement', async () => {
    const css = (await import('../../index.css?raw')).default
    expect(css).toMatch(/\.ui-toast \{ animation: dialog-sheet-fade /)
    expect(css).toMatch(/@keyframes dialog-sheet-fade \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/)
    const r = await render(<UndoToast />)
    act(() => showUndoToast('Completed', 'u1'))
    expect(toastEl()!.className).toContain('ui-toast')
    expect(toastEl()!.className).not.toMatch(/translate|slide/)
    await r.unmount()
  })
})
