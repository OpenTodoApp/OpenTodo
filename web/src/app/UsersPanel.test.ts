// Component tests without a DOM (static markup), like the other panels.
import 'fake-indexeddb/auto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../lib/api'
import { db } from '../lib/db'
import type { AdminUser, User } from '../lib/types'
import { PasswordView } from './PasswordSection'
import { AdministrationSections, confirmCopy, DeleteDialog, describeUserError, TransferDialog, UsersView, type UsersViewProps } from './UsersPanel'

const owner: User = { id: 'o', email: 'owner@example.com', name: 'Owner', role: 'owner', createdAt: 0 }
const admin: User = { id: 'a', email: 'admin@example.com', name: 'Admin', role: 'admin', createdAt: 0 }
const member: User = { id: 'm', email: 'member@example.com', name: 'Member', role: 'member', createdAt: 0 }
const row = (u: User, status: AdminUser['status'] = 'active'): AdminUser => ({ ...u, lastLoginAt: 1_760_000_000_000, status })
const users = [row(owner), row(admin), row(member)]

const noop = () => {}
function render(over: Partial<UsersViewProps> = {}): string {
  const props: UsersViewProps = {
    viewer: owner, users, offline: false, busy: false, error: null, notice: null, resetLink: null, copied: false, dialog: null,
    onDeactivate: noop, onReactivate: noop, onReset: noop, onRole: noop, onMfaReset: noop, onOpenDialog: noop,
    onDelete: noop, onTransfer: noop, onCopy: noop, onDismissLink: noop, ...over,
  }
  return renderToStaticMarkup(createElement(UsersView, props))
}

/** The markup of one row, found by its data-user attribute. */
function rowHtml(html: string, email: string): string {
  const start = html.indexOf(`data-user="${email}"`)
  const end = html.indexOf('</li>', start)
  return html.slice(start, end)
}

describe('UsersView', () => {
  it('lists accounts with role and status badges, last sign-in and a summary', () => {
    const html = render()
    for (const u of users) expect(html).toContain(`data-user="${u.email}"`)
    expect(html).toContain('last sign-in')
    expect(html).toContain('>Admin<')
    expect(html).toContain('>Active<')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('3 accounts · 1 admin')
    expect(html).toContain('data-help-screen="settings/users"')
  })

  it('offers no action menu on rows the viewer may not act on', () => {
    const html = render({ viewer: admin })
    expect(rowHtml(html, member.email)).toContain('aria-label="Actions for Member"')
    expect(rowHtml(html, owner.email)).not.toContain('<button')
    expect(rowHtml(html, admin.email)).not.toContain('<button')
    expect(rowHtml(render(), owner.email)).not.toContain('<button')
  })

  it('marks a deactivated account', () => {
    const html = render({ users: [row(owner), row(member, 'deactivated')] })
    expect(rowHtml(html, member.email)).toContain('>Deactivated<')
    expect(html).toContain('2 accounts · 1 deactivated')
  })

  it('explains that it needs a connection offline', () => {
    expect(render({ offline: true })).toContain('needs a connection')
  })

  it('shows a reset link once with a copy button and the token caveat', () => {
    const html = render({ resetLink: { email: member.email, link: 'http://h/reset/otr_x', expiresAt: 1 } })
    expect(html).toContain('http://h/reset/otr_x')
    expect(html).toContain('Copy link')
    expect(html).toContain('will not be shown again')
    expect(html).toContain('API tokens keep working')
  })

  it('documents the keyboard actions', () => {
    const html = render()
    expect(html).toContain('<span class="kbd">d</span>')
    expect(html).toContain('<span class="kbd">r</span>')
    expect(html).toContain('<span class="kbd">Delete</span>')
  })

  it('names what each confirmation changes', () => {
    expect(confirmCopy({ kind: 'deactivate', user: row(member) }, 'Member')).toMatchObject({ tone: 'danger', title: 'Deactivate Member?' })
    expect(confirmCopy({ kind: 'deactivate', user: row(member) }, 'Member').consequence).toContain('API tokens')
    expect(confirmCopy({ kind: 'role', user: row(member), role: 'admin' }, 'Member').confirmLabel).toBe('Make admin')
    expect(confirmCopy({ kind: 'reset', user: row(member) }, 'Member').consequence).toContain('24 hours')
  })

  it('stores nothing about other accounts on the device', async () => {
    render()
    await db.open()
    for (const table of db.tables) {
      expect(table.name).not.toMatch(/user/i)
      const rows = JSON.stringify(await table.toArray())
      expect(rows).not.toContain(member.email)
      expect(rows).not.toContain(admin.email)
    }
  })
})

describe('dialogs', () => {
  it('asks for the email before deleting and mentions backups', () => {
    const html = renderToStaticMarkup(createElement(DeleteDialog, { user: row(member), busy: false, offline: false, onCancel: noop, onConfirm: noop }))
    expect(html).toContain(`Type <strong>${member.email}</strong> to confirm`)
    expect(html).toContain('backup')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Delete account/)
  })

  it('asks for the owner password before transferring and names the target', () => {
    const html = renderToStaticMarkup(createElement(TransferDialog, { user: row(admin), busy: false, offline: false, onCancel: noop, onConfirm: noop }))
    expect(html).toContain('Transfer ownership to Admin')
    expect(html).toContain('type="password"')
    expect(html).toContain('You become an admin')
  })

  it('maps server errors to explanations', () => {
    expect(describeUserError(new ApiError(403, 'forbidden', 'x'))).toContain('role does not allow')
    expect(describeUserError(new ApiError(400, 'confirmation_mismatch', 'x'))).toContain('does not match')
    expect(describeUserError(new TypeError('fetch'))).toContain('needs a connection')
  })
})

describe('Settings visibility', () => {
  it('shows the Users and Members sections to the owner and to admins', () => {
    for (const u of [owner, admin]) {
      const html = renderToStaticMarkup(createElement(AdministrationSections, { user: u }))
      expect(html).toContain('id="users-heading"')
      expect(html).toContain('id="members-heading"')
    }
  })

  it('hides both from members, who still get the Password section', () => {
    expect(renderToStaticMarkup(createElement(AdministrationSections, { user: member }))).toBe('')
    const closed = renderToStaticMarkup(createElement(PasswordView, {
      online: true, current: '', next: '', busy: false, error: null, done: false, onCurrent: noop, onNext: noop, onSubmit: noop,
    }))
    expect(closed).toContain('Change password')
    expect(closed).not.toContain('autoComplete="current-password"')
    const open = renderToStaticMarkup(createElement(PasswordView, {
      online: true, current: '', next: '', busy: false, error: null, done: false, onCurrent: noop, onNext: noop, onSubmit: noop, open: true,
    }))
    expect(open).toContain('autoComplete="current-password"')
  })

  it('disables the password form offline', () => {
    const pw = renderToStaticMarkup(createElement(PasswordView, {
      online: false, current: '', next: '', busy: false, error: null, done: false, onCurrent: noop, onNext: noop, onSubmit: noop,
    }))
    expect(pw).toContain('needs a connection')
    expect(pw).toMatch(/<button[^>]*disabled[^>]*>Change password/)
  })
})
