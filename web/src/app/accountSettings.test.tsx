// @vitest-environment happy-dom
// web-app "Settings": sign out from the Account section confirms first.
import { describe, expect, it, vi } from 'vitest'
import { click, flush, key, render } from '../ui/test-utils'
import { SessionPanel } from './AccountSettings'

const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!

describe('SessionPanel', () => {
  it('signs out only after confirming', async () => {
    const onLogout = vi.fn()
    const { unmount } = await render(<SessionPanel onLogout={onLogout} />)
    await click(button('Sign out'))
    await flush(20)
    expect(onLogout).not.toHaveBeenCalled()
    expect(document.querySelector('[data-testid="confirm-dialog"]')?.textContent).toContain('local copy of your tasks is cleared')
    const confirm = [...document.querySelectorAll('[data-testid="confirm-dialog"] button')].find((b) => b.textContent === 'Sign out')!
    await click(confirm)
    await flush(20)
    expect(onLogout).toHaveBeenCalledTimes(1)
    await unmount()
  })

  it('Cancel clears nothing and returns focus to the Sign out button', async () => {
    const onLogout = vi.fn()
    const { unmount } = await render(<SessionPanel onLogout={onLogout} />)
    const signOut = button('Sign out')
    signOut.focus()
    await click(signOut)
    await flush(20)
    expect(document.activeElement?.textContent).toBe('Cancel')
    await key(document.activeElement!, 'Escape')
    await flush(20)
    expect(onLogout).not.toHaveBeenCalled()
    expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull()
    expect(document.activeElement).toBe(signOut)
    await unmount()
  })
})
