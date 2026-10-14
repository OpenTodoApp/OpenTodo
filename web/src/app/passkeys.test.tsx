// @vitest-environment happy-dom
// settings-redesign: removing a passkey confirms in a dialog; Rename edits in place.
import { describe, expect, it, vi } from 'vitest'
import type { Passkey } from '../lib/types'
import { click, flush, render } from '../ui/test-utils'
import { SecurityPanel } from './SecurityPanel'

const keys: Passkey[] = [{ id: 'a', name: 'Phone', createdAt: 1, lastUsedAt: null, suspiciousAt: null, backedUp: true }]
const api = vi.hoisted(() => ({
  authStatus: vi.fn(async () => ({ passkeysAvailable: true, passkeyDomain: '' })),
  listPasskeys: vi.fn(async () => ({ passkeys: keys })),
  deletePasskey: vi.fn(async () => {}),
}))
vi.mock('../lib/api', async (orig) => ({ ...(await orig<typeof import('../lib/api')>()), api }))
vi.mock('../lib/online', () => ({ useOnline: () => true }))
vi.mock('../lib/passkeys', async (orig) => ({ ...(await orig<typeof import('../lib/passkeys')>()), passkeysSupported: () => true }))

describe('SecurityPanel', () => {
  it('removes a passkey only after confirming in a dialog', async () => {
    const { container, unmount } = await render(<SecurityPanel />)
    await flush(30)
    await click(container.querySelector('[aria-label="Actions for Phone"]')!)
    await flush(30)
    await click([...document.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent?.includes('Remove'))!)
    await flush(30)
    expect(api.deletePasskey).not.toHaveBeenCalled()
    const dialog = document.querySelector('[data-testid="confirm-dialog"]')!
    expect(dialog.textContent).toContain('Phone')
    expect(document.activeElement?.textContent).toBe('Cancel')
    await click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Remove passkey')!)
    await flush(30)
    expect(api.deletePasskey).toHaveBeenCalledWith('a')
    await unmount()
  })
})
