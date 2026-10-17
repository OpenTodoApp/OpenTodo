// @vitest-environment happy-dom
// Settings → Administration → Users: each row's menu offers only the viewer's actions.
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AdminUser, User } from '../lib/types'
import { click, flush, key, render } from '../ui/test-utils'
import { UsersView, type UsersViewProps } from './UsersPanel'

const owner: User = { id: 'o', email: 'owner@example.com', name: 'Owner', role: 'owner', createdAt: 0 }
const admin: User = { id: 'a', email: 'admin@example.com', name: 'Admin', role: 'admin', createdAt: 0 }
const member: User = { id: 'm', email: 'member@example.com', name: 'Member', role: 'member', createdAt: 0 }
const row = (u: User, status: AdminUser['status'] = 'active'): AdminUser => ({ ...u, lastLoginAt: 1_760_000_000_000, status })
const noop = () => {}

function props(over: Partial<UsersViewProps>): UsersViewProps {
  return {
    viewer: owner, users: [row(owner), row(admin), row(member)], offline: false, busy: false, error: null, notice: null, resetLink: null,
    copied: false, dialog: null, onDeactivate: noop, onReactivate: noop, onReset: noop, onRole: noop, onMfaReset: noop, onOpenDialog: noop,
    onDelete: noop, onTransfer: noop, onCopy: noop, onDismissLink: noop, ...over,
  }
}

async function menuOf(over: Partial<UsersViewProps>, email: string) {
  const r = await render(createElement(UsersView, props(over)))
  const li = r.container.querySelector(`[data-user="${email}"]`)!
  await click(li.querySelector('button[aria-haspopup="menu"]')!)
  await flush(20)
  const items = [...document.querySelectorAll('[role="menu"] [role^="menuitem"]')] as HTMLButtonElement[]
  return { ...r, items, labels: items.map((i) => i.getAttribute('data-menu-label')) }
}

describe('UsersView row menus', () => {
  it('gives an admin member actions only', async () => {
    const m = await menuOf({ viewer: admin }, member.email)
    expect(m.labels).toEqual(['Deactivate', 'Reset password', 'Delete account'])
    await m.unmount()
  })

  it('gives the owner role toggles, two-factor reset and transfer', async () => {
    const m = await menuOf({}, member.email)
    expect(m.labels).toContain('Make admin')
    expect(m.labels).toContain('Reset two-factor authentication')
    await m.unmount()
    const a = await menuOf({}, admin.email)
    expect(a.labels).toContain('Make member')
    expect(a.labels).toContain('Transfer ownership')
    await a.unmount()
  })

  it('offers reactivate on a deactivated account, without reset', async () => {
    const m = await menuOf({ users: [row(owner), row(member, 'deactivated')] }, member.email)
    expect(m.labels).toContain('Reactivate')
    expect(m.labels).not.toContain('Deactivate')
    expect(m.labels).not.toContain('Reset password')
    await m.unmount()
  })

  it('disables every action offline', async () => {
    const m = await menuOf({ offline: true }, member.email)
    expect(m.items.length).toBeGreaterThan(0)
    expect(m.items.every((i) => i.disabled)).toBe(true)
    await m.unmount()
  })

  it('keeps the row keys: d deactivates, r resets, Delete opens the delete dialog', async () => {
    const onDeactivate = vi.fn(), onReset = vi.fn(), onOpenDialog = vi.fn()
    const { container, unmount } = await render(createElement(UsersView, props({ onDeactivate, onReset, onOpenDialog })))
    const focusable = container.querySelector(`[data-user="${member.email}"] [tabindex="0"]`)!
    await key(focusable, 'd')
    await key(focusable, 'r')
    await key(focusable, 'Delete')
    expect(onDeactivate).toHaveBeenCalledTimes(1)
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(onOpenDialog).toHaveBeenCalledWith({ kind: 'delete', user: expect.objectContaining({ email: member.email }) })
    await unmount()
  })
})
