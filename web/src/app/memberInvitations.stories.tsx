import type { Meta, StoryObj } from '@storybook/react-vite'
import type { MemberInvitation, PendingMember } from '../lib/types'
import { InvitationsView } from './MemberInvitations'
import { PendingInvitations } from './PendingInvitations'

const noop = () => {}
const expires = new Date(2026, 10, 10, 12).getTime()
const invitations: MemberInvitation[] = [
  { id: 'i1', kind: 'project', targetId: 'p1', targetName: 'Garden', role: 'editor', inviterId: 'u-ada', inviterName: 'Ada Lovelace', createdAt: 1, expiresAt: expires },
  { id: 'i2', kind: 'workspace', targetId: 'w1', targetName: 'Choir committee', role: 'member', inviterId: 'u-max', inviterName: 'Maximilian Alexander von Habsburg-Lothringen', createdAt: 1, expiresAt: expires },
]
const pending: PendingMember[] = [
  { id: 'x1', email: 'dan@example.com', role: 'editor', invitedBy: 'u-ada', createdAt: 1, expiresAt: expires },
  { id: 'x2', email: 'a.very.long.email.address.for.testing@subdomain.example.com', role: 'viewer', invitedBy: 'u-ada', createdAt: 1, expiresAt: expires },
]

/** Invitations to join (member-add-consent): Settings → Account → Invitations, and the share dialog's waiting rows. */
const meta: Meta = { title: 'Settings/Invitations' }
export default meta
export const Open: StoryObj = { render: () => <div className="max-w-xl"><InvitationsView list={invitations} online error={null} onAnswered={noop} /></div> }
export const None: StoryObj = { render: () => <div className="max-w-xl"><InvitationsView list={[]} online error={null} onAnswered={noop} /></div> }
export const Offline: StoryObj = { render: () => <div className="max-w-xl"><InvitationsView list={invitations.slice(0, 1)} online={false} error={null} onAnswered={noop} /></div> }
export const WaitingForAnAnswer: StoryObj = { render: () => <div className="max-w-md"><PendingInvitations pending={pending} onCancel={noop} /></div> }
