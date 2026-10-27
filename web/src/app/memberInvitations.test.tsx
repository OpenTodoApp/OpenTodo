// @vitest-environment happy-dom
// Invitations to join a project or workspace (OpenSpec change member-add-consent):
// the notification with Accept and Decline, Settings → Account → Invitations, and
// the share dialog's "Waiting for an answer" rows.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../lib/api'
import { db, useDatabase } from '../lib/db'
import type { MemberInvitation, PendingMember } from '../lib/types'
import { click, render, waitFor } from '../ui/test-utils'
import { InvitationsPanel } from './MemberInvitations'
import { NotificationBell } from './NotificationBell'
import { PendingInvitations } from './PendingInvitations'

// Answering asks for a sync; the tests check the calls, not the exchange.
vi.mock('../lib/sync', async (original) => ({ ...(await original<typeof import('../lib/sync')>()), requestSync: vi.fn() }))

let n = 0
beforeEach(() => { useDatabase(`invitations-${Date.now()}-${n++}`) })
afterEach(() => { vi.restoreAllMocks() })

const payload = { invitationId: 'i1', target: 'project' as const, targetId: 'p1', targetName: 'Garden', inviterId: 'alice', inviterName: 'Alice', role: 'editor' as const, at: 1 }
const buttonNamed = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name)

describe('invitation notification', () => {
  it('names the inviter, the project and the role, and Accept marks it read', async () => {
    await db.notifications.put({ id: 'n1', kind: 'member_invitation', createdAt: 1_760_000_000_000, readAt: null, payload })
    const accept = vi.spyOn(api, 'acceptMemberInvitation').mockResolvedValue({ kind: 'project', targetId: 'p1', role: 'editor' })
    vi.spyOn(api, 'readNotification').mockResolvedValue(undefined)
    const r = await render(<NotificationBell />)
    await waitFor(() => !!document.querySelector('[data-unread]'))
    await click(document.querySelector('[data-notifications]')!)
    await waitFor(() => !!document.querySelector('[data-kind="member_invitation"]'))
    expect(document.querySelector('[data-kind="member_invitation"]')!.textContent).toContain('Alice invited you to the project Garden as editor')
    await click(buttonNamed('Accept')!)
    await waitFor(async () => (await db.notifications.get('n1'))?.readAt !== null, 'the notification is read')
    expect(accept).toHaveBeenCalledWith('i1')
    await waitFor(() => !buttonNamed('Accept'), 'the buttons are gone')
    await r.unmount()
  })

  it('an invitation that can no longer be accepted says so and is marked read', async () => {
    await db.notifications.put({ id: 'n2', kind: 'member_invitation', createdAt: 1_760_000_000_000, readAt: null, payload: { ...payload, invitationId: 'i2', target: 'workspace', targetName: 'Family', role: 'member' } })
    vi.spyOn(api, 'acceptMemberInvitation').mockRejectedValue(new ApiError(410, 'invitation_stale', 'stale'))
    vi.spyOn(api, 'readNotification').mockResolvedValue(undefined)
    const r = await render(<NotificationBell />)
    await waitFor(() => !!document.querySelector('[data-unread]'))
    await click(document.querySelector('[data-notifications]')!)
    await waitFor(() => !!document.querySelector('[data-kind="member_invitation"]'))
    expect(document.querySelector('[data-kind="member_invitation"]')!.textContent).toContain('Alice invited you to the workspace Family as member')
    await click(buttonNamed('Accept')!)
    await waitFor(async () => (await db.notifications.get('n2'))?.readAt !== null, 'the notification is read')
    await r.unmount()
  })
})

describe('Settings → Account → Invitations', () => {
  const inv: MemberInvitation = { id: 'i1', kind: 'project', targetId: 'p1', targetName: 'Garden', role: 'viewer', inviterId: 'alice', inviterName: 'Alice', createdAt: 1, expiresAt: 1_800_000_000_000 }

  it('lists open invitations and reloads after Decline', async () => {
    const list = vi.spyOn(api, 'listMemberInvitations').mockResolvedValueOnce({ invitations: [inv] }).mockResolvedValueOnce({ invitations: [] })
    const decline = vi.spyOn(api, 'declineMemberInvitation').mockResolvedValue(undefined)
    const r = await render(<InvitationsPanel />)
    await waitFor(() => !!document.querySelector('[data-invitation="i1"]'))
    expect(document.querySelector('[data-invitation="i1"]')!.textContent).toContain('Alice invited you to the project Garden as viewer')
    await click(buttonNamed('Decline')!)
    await waitFor(() => !!document.querySelector('[data-no-invitations]'), 'the empty state after the answer')
    expect(decline).toHaveBeenCalledWith('i1')
    expect(list).toHaveBeenCalledTimes(2)
    await r.unmount()
  })
})

describe('pending rows', () => {
  it('lists the address and role with Cancel, and nothing when there are none', async () => {
    const pending: PendingMember[] = [{ id: 'x1', email: 'dan@example.com', role: 'editor', invitedBy: 'alice', createdAt: 1, expiresAt: 1_800_000_000_000 }]
    const cancel = vi.fn()
    const r = await render(<PendingInvitations pending={pending} onCancel={cancel} />)
    const row = document.querySelector('[data-pending-invitation="x1"]')!
    expect(document.body.textContent).toContain('Waiting for an answer')
    expect(row.textContent).toContain('dan@example.com')
    expect(row.textContent).toContain('editor')
    await click(row.querySelector('button')!)
    expect(cancel).toHaveBeenCalledWith(pending[0])
    await r.unmount()
    const empty = await render(<PendingInvitations pending={[]} onCancel={cancel} />)
    expect(document.querySelector('[data-pending-invitations]')).toBeNull()
    await empty.unmount()
  })
})
