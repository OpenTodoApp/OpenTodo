import type { Meta, StoryObj } from '@storybook/react-vite'
import type { AdminUser, Invitation, SmtpSettings, User } from '../lib/types'
import { ConfigWarningList } from './ConfigWarnings'
import { MembersView, type MembersViewProps, NewInvitationDialog } from './MembersPanel'
import { draftFrom, OutgoingEmailView, type OutgoingEmailViewProps } from './OutgoingEmailPanel'
import { UsersView, type UsersViewProps } from './UsersPanel'

const noop = () => {}
const now = 1_760_000_000_000
const day = 86_400_000
const owner: User = { id: 'o', email: 'owner@example.com', name: 'Robin Owner', role: 'owner', createdAt: now - 400 * day }
const admin: User = { id: 'a', email: 'sam@example.com', name: 'Sam Admin', role: 'admin', createdAt: now - 120 * day }
const member: User = { id: 'm', email: 'kim@example.com', name: 'Kim Member', role: 'member', createdAt: now - 30 * day }
const row = (u: User, status: AdminUser['status'] = 'active', lastLoginAt: number | null = now - day): AdminUser => ({ ...u, status, lastLoginAt })
const users = [row(owner, 'active', now - 60_000), row(admin), row(member), row({ ...member, id: 'x', email: 'alex@example.com', name: 'Alex Former' }, 'deactivated', null)]
const many = Array.from({ length: 24 }, (_, i) => row({ id: `u${i}`, email: `person${i}@example.com`, name: `Person ${i + 1}`, role: i % 6 === 0 ? 'admin' : 'member', createdAt: now - i * day }, i % 7 === 3 ? 'deactivated' : 'active'))

const usersBase: UsersViewProps = {
  viewer: owner, users, offline: false, busy: false, error: null, notice: null, resetLink: null, copied: false, dialog: null,
  onDeactivate: noop, onReactivate: noop, onReset: noop, onRole: noop, onMfaReset: noop, onOpenDialog: noop,
  onDelete: noop, onTransfer: noop, onCopy: noop, onDismissLink: noop,
}

const inv = (id: string, status: Invitation['status'], email: string | null, accepted = false): Invitation => ({
  id, status, email, role: 'member', createdBy: 'o', createdByName: 'Robin Owner', createdAt: now - 2 * day, expiresAt: now + 5 * day,
  acceptedAt: accepted ? now - day : null, acceptedBy: accepted ? { id: 'm', email: email ?? 'kim@example.com', name: 'Kim Member' } : null, revokedAt: status === 'revoked' ? now - day : null,
})
const invitations = [inv('i1', 'pending', 'friend@example.com'), inv('i2', 'pending', null), inv('i3', 'accepted', 'kim@example.com', true), inv('i4', 'expired', null), inv('i5', 'revoked', 'old@example.com')]
const membersBase: MembersViewProps = {
  invitations, offline: false, busy: false, error: null, links: { i1: 'https://todo.example.com/invite/oti_abc123' }, copied: null,
  onNew: noop, onCopy: noop, onRevoke: noop,
}
const dialog = { busy: false, offline: false, error: null, copied: false, onCreate: noop, onCopy: noop, onClose: noop }

const meta: Meta = { title: 'Settings/Administration' }
export default meta
export const UsersAsOwner: StoryObj = { render: () => <UsersView {...usersBase} /> }
export const UsersAsAdmin: StoryObj = { render: () => <UsersView {...usersBase} viewer={admin} /> }
export const UsersEmpty: StoryObj = { render: () => <UsersView {...usersBase} users={[]} /> }
export const UsersOffline: StoryObj = { render: () => <UsersView {...usersBase} offline /> }
export const UsersError: StoryObj = { render: () => <UsersView {...usersBase} error="An admin cannot change another admin." /> }
export const UsersResetLink: StoryObj = { render: () => <UsersView {...usersBase} resetLink={{ email: member.email, link: 'https://todo.example.com/reset/otr_9f2c', expiresAt: now + day }} /> }
export const UsersMany: StoryObj = { render: () => <UsersView {...usersBase} users={[row(owner), ...many]} /> }
export const Members: StoryObj = { render: () => <MembersView {...membersBase} /> }
export const MembersEmpty: StoryObj = { render: () => <MembersView {...membersBase} invitations={[]} /> }
export const MembersOffline: StoryObj = { render: () => <MembersView {...membersBase} offline /> }
export const MembersError: StoryObj = { render: () => <MembersView {...membersBase} error="This invitation was already accepted and cannot be revoked." /> }
export const MembersMany: StoryObj = { render: () => <MembersView {...membersBase} invitations={Array.from({ length: 20 }, (_, i) => inv(`m${i}`, (['pending', 'accepted', 'expired', 'revoked'] as const)[i % 4], i % 3 ? `guest${i}@example.com` : null, i % 4 === 1))} /> }
export const NewInvitation: StoryObj = { render: () => <NewInvitationDialog {...dialog} link={null} /> }
export const InvitationCreated: StoryObj = { render: () => <NewInvitationDialog {...dialog} link="https://todo.example.com/invite/oti_abc123" /> }
export const ConfigWarning: StoryObj = {
  render: () => <ConfigWarningList warnings={[{ variable: 'OPENTODO_TRUSTED_PROXIES', message: 'Some entries are not valid CIDR ranges and were ignored.', ignored: ['10.0.0.0/33', 'proxy.local'] }]} />,
}

const smtpOn: SmtpSettings = {
  configured: true, host: 'smtp.example.com', port: 587, security: 'starttls', username: 'todo@example.com', passwordSet: true,
  from: 'OpenTodo <todo@example.com>', managedBy: { host: 'env', port: 'env' }, lastTest: { at: now - 3_600_000, outcome: 'sent' },
}
const smtpBase: OutgoingEmailViewProps = {
  settings: smtpOn, offline: false, busy: false, error: null, draft: null, test: null, onConfigure: noop, onDraft: noop, onSave: noop, onTest: noop,
}
export const OutgoingEmailNotConfigured: StoryObj = {
  render: () => <OutgoingEmailView {...smtpBase} settings={{ ...smtpOn, configured: false, host: '', port: 0, security: '', username: '', passwordSet: false, from: '', managedBy: {}, lastTest: null }} />,
}
export const OutgoingEmailFailedTest: StoryObj = {
  render: () => <OutgoingEmailView {...smtpBase} test={{ outcome: 'failed', to: owner.email, stage: 'auth', reply: '535 5.7.8 Username and Password not accepted' }} />,
}
export const OutgoingEmailForm: StoryObj = { render: () => <OutgoingEmailView {...smtpBase} draft={draftFrom(smtpOn)} /> }
