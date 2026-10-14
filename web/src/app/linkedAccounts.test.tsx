// @vitest-environment happy-dom
// settings-redesign: unlinking confirms first; the link flow confirms on /settings/security.
import { describe, expect, it, vi } from 'vitest'
import { click, flush, render } from '../ui/test-utils'
import { LinkedAccountsPanel } from './SsoPanel'

const api = vi.hoisted(() => ({
  listIdentities: vi.fn(async () => ({
    identities: [{ id: 'i1', issuer: 'https://sso.example.com', email: 'me@example.com', createdAt: 1, lastLoginAt: 2 }],
    provider: { enabled: true, displayName: 'Home SSO', ssoOnly: false },
  })),
  unlinkIdentity: vi.fn(async () => {}),
}))
vi.mock('../lib/api', async (orig) => ({ ...(await orig<typeof import('../lib/api')>()), api }))
vi.mock('../lib/online', () => ({ useOnline: () => true }))

describe('LinkedAccountsPanel', () => {
  it('shows the ?linked confirmation and unlinks only after confirming', async () => {
    history.replaceState(null, '', '/settings/security?linked=1')
    const { container, unmount } = await render(<LinkedAccountsPanel />)
    await flush(30)
    expect(container.textContent).toContain('Linked. You can now sign in with the provider.')
    await click(container.querySelector('[aria-label="Actions for me@example.com"]')!)
    await flush(30)
    await click([...document.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent?.includes('Unlink'))!)
    await flush(30)
    expect(api.unlinkIdentity).not.toHaveBeenCalled()
    const dialog = document.querySelector('[data-testid="confirm-dialog"]')!
    await click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Unlink')!)
    await flush(30)
    expect(api.unlinkIdentity).toHaveBeenCalledWith('i1')
    await unmount()
  })

  it('shows the error from the link flow', async () => {
    history.replaceState(null, '', '/settings/security?error=identity_taken')
    const { container, unmount } = await render(<LinkedAccountsPanel />)
    await flush(30)
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/already linked/)
    await unmount()
  })
})
