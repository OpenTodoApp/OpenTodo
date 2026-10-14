// @vitest-environment happy-dom
// settings-redesign "Forms open from actions": the password form is closed until asked for.
import { describe, expect, it, vi } from 'vitest'
import { click, flush, key, render } from '../ui/test-utils'
import { PasswordSection } from './PasswordSection'

vi.mock('../lib/online', () => ({ useOnline: () => true }))

describe('PasswordSection', () => {
  it('shows no password fields until "Change password", focuses the first field, and Escape returns focus', async () => {
    const { container, unmount } = await render(<PasswordSection />)
    expect(container.querySelector('input[type="password"]')).toBeNull()
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Change password')!
    await click(button)
    await flush()
    const first = container.querySelector('input[autocomplete="current-password"]') as HTMLInputElement
    expect(first).not.toBeNull()
    expect(document.activeElement).toBe(first)
    await key(first, 'Escape')
    await flush()
    expect(container.querySelector('input[type="password"]')).toBeNull()
    const again = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Change password')!
    expect(document.activeElement).toBe(again)
    await unmount()
  })
})
