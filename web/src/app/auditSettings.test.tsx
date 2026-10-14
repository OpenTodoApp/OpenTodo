// @vitest-environment happy-dom
// settings-redesign: turning off address logging erases stored addresses, so it confirms in a dialog.
import { describe, expect, it, vi } from 'vitest'
import { click, flush, render } from '../ui/test-utils'
import { AuditPanel } from './AuditPanel'

const api = vi.hoisted(() => ({
  listAudit: vi.fn(async () => ({ events: [], cursor: null })),
  getAuditSettings: vi.fn(async () => ({ retentionDays: 90, logIp: true })),
  updateAuditSettings: vi.fn(async (p: { logIp?: boolean }) => ({ retentionDays: 90, logIp: p.logIp ?? true })),
}))
vi.mock('../lib/api', async (orig) => ({ ...(await orig<typeof import('../lib/api')>()), api }))
vi.mock('../lib/online', () => ({ useOnline: () => true }))

describe('AuditPanel', () => {
  it('keeps filters and table in its card and confirms before erasing addresses', async () => {
    const { container, unmount } = await render(<AuditPanel />)
    await flush(30)
    const card = container.querySelector('[data-testid="audit-panel"]')!
    expect(card.querySelector('h2')?.textContent).toBe('Audit log')
    expect(card.querySelector('[aria-label="Audit log filters"]')).not.toBeNull()
    expect(card.textContent).toContain('No events match')
    const toggle = card.querySelector('[role="switch"]')!
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    await click(toggle)
    await flush(30)
    expect(api.updateAuditSettings).not.toHaveBeenCalled()
    const dialog = document.querySelector('[data-testid="confirm-dialog"]')!
    expect(dialog.textContent).toContain('erased')
    expect(document.activeElement?.textContent).toBe('Cancel')
    await click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Turn off and erase')!)
    await flush(30)
    expect(api.updateAuditSettings).toHaveBeenCalledWith({ logIp: false })
    expect(card.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false')
    await unmount()
  })
})
