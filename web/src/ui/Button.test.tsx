// @vitest-environment happy-dom
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { Button, IconButton } from './Button'
import { click, flush, render } from './test-utils'

describe('Button', () => {
  it('double activation runs once while busy, then accepts again', async () => {
    let calls = 0
    let finish: () => void = () => {}
    const { container, unmount } = await render(
      <Button variant="primary" onClick={() => { calls++; return new Promise<void>((r) => { finish = r }) }}>Save</Button>,
    )
    const btn = container.querySelector('button')!
    await click(btn)
    await click(btn)
    expect(calls).toBe(1)
    expect(btn.getAttribute('aria-busy')).toBe('true')
    expect(btn.querySelector('[data-icon="loader-circle"]')).not.toBeNull()
    finish()
    await flush()
    expect(btn.hasAttribute('aria-busy')).toBe(false)
    await click(btn)
    expect(calls).toBe(2)
    await unmount()
  })

  it('renders variant, size and icons', async () => {
    const { container, unmount } = await render(<Button variant="danger" size="sm" icon="trash-2">Delete</Button>)
    const btn = container.querySelector('button')!
    expect(btn.className).toContain('ui-btn--danger')
    expect(btn.className).toContain('ui-btn--sm')
    expect(btn.getAttribute('type')).toBe('button')
    expect(btn.querySelector('[data-icon="trash-2"]')?.getAttribute('aria-hidden')).toBe('true')
    await unmount()
  })
})

describe('IconButton', () => {
  it('has an accessible name and a tooltip', async () => {
    const { container, unmount } = await render(<IconButton icon="ellipsis" label="Label actions" />)
    const btn = container.querySelector('button')!
    expect(btn.getAttribute('aria-label')).toBe('Label actions')
    // The tooltip primitive, not the native title (ux-overhaul).
    expect(btn.getAttribute('title')).toBeNull()
    await act(async () => { btn.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
    expect(document.querySelector('[role="tooltip"]')!.textContent).toBe('Label actions')
    await unmount()
  })
})
