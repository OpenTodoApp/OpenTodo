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
    // Retention and addresses are their own card under the log.
    expect(card.querySelector('[role="switch"]')).toBeNull()
    const settingsCard = container.querySelector('[data-testid="audit-settings"]')!
    expect(settingsCard.querySelector('h2')?.textContent).toBe('Audit settings')
    const toggle = settingsCard.querySelector('[role="switch"]')!
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
    expect(settingsCard.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false')
    await unmount()
  })

  it('Owner filters and exports: filters show as chips that remove themselves, Export carries them, a line opens its details', async () => {
    api.listAudit.mockResolvedValue({ events: [{ id: 7, ts: Date.now() - 60_000, name: 'login.failed', outcome: 'failure', actorId: null, actorEmail: null,
      targetId: 'm', targetEmail: 'member@example.com', ip: '192.0.2.9', userAgent: '', details: { reason: 'wrong_password' } }], cursor: null } as never)
    const { container, unmount } = await render(<AuditPanel />)
    await flush(30)
    const card = container.querySelector('[data-testid="audit-panel"]')!
    const select = (label: string) => [...card.querySelectorAll('label')].find((l) => l.textContent === label)!.parentElement!.querySelector('select')!
    const choose = async (el: HTMLSelectElement, v: string) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); await flush(30) }
    await choose(select('Event'), 'login.failed')
    await choose(select('When'), '1d')
    expect([...card.querySelectorAll('[data-audit-chip]')].map((c) => c.textContent)).toEqual(['Sign-in failed', 'Last 24 hours'])
    const href = card.querySelector<HTMLAnchorElement>('[data-audit-export]')!.getAttribute('href')!
    expect(href).toContain('name=login.failed')
    expect(href).toContain('from=')
    await click(card.querySelector('[data-audit-chip="range"]')!)
    expect([...card.querySelectorAll('[data-audit-chip]')].map((c) => c.textContent)).toEqual(['Sign-in failed'])
    expect(card.querySelector<HTMLAnchorElement>('[data-audit-export]')!.getAttribute('href')).not.toContain('from=')
    // Below 768 px the filters sit behind "Filters".
    const filters = card.querySelector('#audit-filters')!
    expect(filters.className).toContain('hidden')
    await click(card.querySelector('[data-audit-filters-toggle]')!)
    expect(filters.className).not.toMatch(/(^| )hidden( |$)/)
    // A line opens its details in place.
    const line = card.querySelector<HTMLButtonElement>('[data-event="login.failed"] button')!
    await click(line)
    expect(line.getAttribute('aria-expanded')).toBe('true')
    expect(card.querySelector('[data-audit-details]')?.textContent).toContain('wrong password')
    await unmount()
  })
})
