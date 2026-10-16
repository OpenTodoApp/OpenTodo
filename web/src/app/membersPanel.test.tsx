// @vitest-environment happy-dom
// Settings → Administration → Members: invitations as rows, the one-time link in a dialog.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Invitation } from '../lib/types'
import { click, flush, key, render } from '../ui/test-utils'
import { MembersView, type MembersViewProps, NewInvitationDialog } from './MembersPanel'

const noop = () => {}
const inv = (id: string, status: Invitation['status'], email: string | null): Invitation => ({
  id, status, email, role: 'member', createdBy: 'o', createdByName: 'Owner', createdAt: 0, expiresAt: 1, acceptedAt: null, acceptedBy: null, revokedAt: null,
})
const invitations = [inv('i1', 'pending', 'friend@example.com'), inv('i2', 'accepted', 'kim@example.com'), inv('i3', 'expired', null)]
const props = (over: Partial<MembersViewProps> = {}): MembersViewProps => ({
  invitations, offline: false, busy: false, error: null, links: { i1: 'http://h/invite/oti_x' }, copied: null, onNew: noop, onCopy: noop, onRevoke: noop, ...over,
})
const html = (over: Partial<MembersViewProps> = {}) => renderToStaticMarkup(createElement(MembersView, props(over)))

describe('MembersView', () => {
  it('lists invitations with a status badge and counts the pending ones', () => {
    const h = html()
    expect(h).toContain('id="members-heading"')
    expect(h).not.toContain('data-help-screen')
    expect(h).toContain('data-invitation="i1"')
    expect(h).toContain('>Pending<')
    expect(h).toContain('>Accepted<')
    expect(h).toContain('Anyone with the link')
    expect(h).toMatch(/data-testid="invitations-summary">1 pending/)
    expect(h).not.toContain('oti_x') // the link stays out of the list
    expect(h).toContain('aria-label="Actions for the invitation friend@example.com"')
    expect(h).not.toContain('Actions for the invitation kim@example.com')
  })

  it('shows an empty state and an offline note', () => {
    expect(html({ invitations: [] })).toContain('No invitations yet')
    const off = html({ offline: true })
    expect(off).toContain('You are offline')
    expect(off).toMatch(/<button[^>]*disabled=""[^>]*>(<[^>]+>)*New invitation/)
  })

  it('Enter copies a link created in this session and Delete asks to revoke', async () => {
    const onCopy = vi.fn(), onRevoke = vi.fn()
    const { container, unmount } = await render(createElement(MembersView, props({ onCopy, onRevoke })))
    const r = container.querySelector('[data-invitation="i1"] [tabindex="0"]')!
    await key(r, 'Enter')
    await key(r, 'Delete')
    expect(onCopy).toHaveBeenCalledWith('i1')
    expect(onRevoke).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1' }))
    await unmount()
  })

  it('opens the row menu with copy and revoke', async () => {
    const { container, unmount } = await render(createElement(MembersView, props()))
    await click(container.querySelector('[data-invitation="i1"] button[aria-haspopup="menu"]')!)
    await flush(20)
    const labels = [...document.querySelectorAll('[role="menu"] [role^="menuitem"]')].map((i) => i.getAttribute('aria-label'))
    expect(labels).toEqual(['Copy link', 'Revoke'])
    await unmount()
  })
})

describe('NewInvitationDialog', () => {
  const base = { busy: false, offline: false, error: null, copied: false, onCreate: noop, onCopy: noop, onClose: noop }
  it('asks for an optional email and an expiry, then shows the link once', async () => {
    const form = await render(createElement(NewInvitationDialog, { ...base, link: null }))
    expect(document.body.textContent).toContain('Email (optional)')
    expect(document.querySelector('select')?.value).toBe('168')
    await form.unmount()
    const done = await render(createElement(NewInvitationDialog, { ...base, link: 'http://h/invite/oti_x' }))
    expect(document.body.textContent).toContain('http://h/invite/oti_x')
    expect(document.body.textContent).toContain('will not be shown again')
    await done.unmount()
  })
})
