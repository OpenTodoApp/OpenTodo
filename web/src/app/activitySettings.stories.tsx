// settings-redesign: the Activity section, Recent activity for everyone and the owner's audit table.
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { AuditEvent } from '../lib/types'
import { ActivityView } from './ActivityPanel'
import { AuditTable } from './AuditPanel'

const now = 1_760_000_000_000
const firefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'
const ev = (id: number, name: AuditEvent['name'], minutesAgo: number, over: Partial<AuditEvent> = {}): AuditEvent => ({
  id, ts: now - minutesAgo * 60_000, name, outcome: 'success', actorId: 'm', actorEmail: 'me@example.com',
  targetId: null, targetEmail: null, ip: '192.0.2.10', userAgent: firefox, details: {}, ...over,
})
const events: AuditEvent[] = [
  ev(1, 'login.succeeded', 2),
  ev(2, 'login.failed', 50, { outcome: 'failure', actorId: null, actorEmail: null, targetId: 'm', targetEmail: 'me@example.com', ip: '203.0.113.7', details: { reason: 'wrong_password' } }),
  ev(3, 'token.created', 180, { details: { token_id: 't1', token_name: 'laptop script' } }),
  ev(4, 'logout', 60 * 26),
]
// 30 events over five days (settings-refresh D4): repeated sign-ins fold per client and day, failures warn, ten lines then Show all.
const chrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const many: AuditEvent[] = Array.from({ length: 30 }, (_, i) => {
  if (i % 7 === 3) return ev(100 + i, 'login.failed', i * 240, { outcome: 'failure', details: { reason: 'wrong_password' } })
  if (i % 9 === 5) return ev(100 + i, 'token.created', i * 240, { details: { token_name: `script ${i}` } })
  if (i === 20) return ev(100 + i, 'mfa.disabled', i * 240)
  return ev(100 + i, 'login.succeeded', i * 240, i % 2 ? { userAgent: chrome } : {})
})

const meta: Meta = { title: 'Settings/Activity' }
export default meta
export const RecentActivity: StoryObj = { render: () => <ActivityView status="ready" events={events} now={now} /> }
export const RecentActivityEmpty: StoryObj = { render: () => <ActivityView status="ready" events={[]} now={now} /> }
export const RecentActivityOffline: StoryObj = { render: () => <ActivityView status="offline" events={[]} now={now} /> }
export const RecentActivityError: StoryObj = { render: () => <ActivityView status="error" events={[]} error="The server could not load your activity." now={now} /> }
export const RecentActivityMany: StoryObj = { render: () => <ActivityView status="ready" events={many} now={now} /> }
export const AuditLogTable: StoryObj = { render: () => <AuditTable status="ready" events={events} /> }
export const AuditLogEmpty: StoryObj = { render: () => <AuditTable status="ready" events={[]} /> }
export const AuditLogOffline: StoryObj = { render: () => <AuditTable status="offline" events={[]} /> }
