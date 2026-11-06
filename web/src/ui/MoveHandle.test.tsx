// @vitest-environment happy-dom
// MoveHandle (OpenSpec change accessibility-aa D3, WCAG 2.2 2.5.7): a click without
// moving opens Move up and Move down; a press that moved (a drag) opens nothing.
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MoveHandle } from './MoveHandle'
import { click, render, waitFor } from './test-utils'

const items = () => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]

describe('MoveHandle', () => {
  it('opens Move up and Move down on a click, the first one disabled at the top, and moves', async () => {
    const onMove = vi.fn()
    const r = await render(<MoveHandle label="Move Ada" first last={false} onMove={onMove} data-drag-id="x" />)
    const handle = r.container.querySelector<HTMLButtonElement>('[data-move-handle]')!
    expect(handle.getAttribute('aria-label')).toBe('Move Ada')
    expect(handle.getAttribute('aria-haspopup')).toBe('menu')
    await click(handle)
    await waitFor(() => items().length === 2, 'the menu')
    expect(items().map((i) => [i.textContent?.replace(/Already first|Already last/, '').trim(), i.disabled])).toEqual([['Move up', true], ['Move down', false]])
    await click(items()[1])
    expect(onMove).toHaveBeenCalledWith(1)
    await r.unmount()
  })

  it('opens nothing when the press became a drag, and still starts the caller’s drag', async () => {
    const onPointerDown = vi.fn()
    const r = await render(<MoveHandle label="Move Ada" first={false} last={false} onMove={() => {}} onPointerDown={onPointerDown} />)
    const handle = r.container.querySelector<HTMLButtonElement>('[data-move-handle]')!
    await act(async () => {
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }))
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 40 }))
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, clientY: 40 }))
    })
    expect(onPointerDown).toHaveBeenCalledTimes(1)
    await click(handle)
    expect(items()).toHaveLength(0)
    // The next plain click opens it.
    await click(handle)
    await waitFor(() => items().length === 2, 'the menu')
    await r.unmount()
  })
})
