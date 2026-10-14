import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ArchivedProject } from '../lib/archive'
import type { PushState } from '../lib/push'
import type { EmailInbox, Project } from '../lib/types'
import { ArchivedProjectsList } from './ArchivedProjects'
import { CalendarSettingsView } from './CalendarSettings'
import { CaptureView } from './CaptureSettings'
import { EmailInboxView, type EmailInboxViewProps } from './EmailInboxPanel'
import { NotificationsView, PushDelivery } from './NotificationsSettings'
import { KeyboardView, StartViewView } from './PreferencesPanels'
import { AutoArchiveView } from './ProjectsSettings'
import { QuickAddSettingsSection } from './QuickAddSettings'
import { VoiceSettingsSection } from './VoiceSettings'

const noop = () => {}
const now = 1_760_000_060_000

const push: PushState = {
  supported: true, available: true, permission: 'granted', enabled: true, includeContent: false, needsRenewal: false,
  serviceWorker: true, serverUnreachable: false,
  subscription: { id: 's', deviceId: 'dev', includeContent: false, createdAt: 1, lastOkAt: now - 3_600_000, lastError: '', failures: 0, needsRenewal: false },
}
const notif = (state: PushState | null, message: { kind: 'error' | 'info'; text: string } | null = null) => (
  <NotificationsView state={state} busy={false} message={message} onEnable={noop} onIncludeContent={noop} onRenew={noop} now={now}
    delivery={state && <PushDelivery state={state} lastTest={null} online dev={false} busy={false} phase="idle" onTest={noop} onLocalTest={noop} onAction={noop} />} />
)

const inbox: EmailInbox = { enabledByOperator: true, address: 'todo+k3f9abc@example.com', enabled: true, allowlist: [], hourlyLimit: 60 }
const email = (over: Partial<EmailInboxViewProps>) => (
  <EmailInboxView inbox={inbox} draft="" copied={false} error={null} busy={false} onCopy={noop} onRotate={noop} onToggle={noop} onDraftChange={noop} onSaveAllowlist={noop} {...over} />
)

const project = (id: string, name: string, color: string) => ({ id, name, color, archived: true } as Project)
const rows: ArchivedProject[] = [
  { project: project('a', 'Garden', '#22c55e'), parentName: 'Home', open: 2, canRestore: true },
  { project: project('b', 'Trip 2026 with a rather long name that wraps on phones', '#3b82f6'), parentName: null, open: 1, canRestore: true },
  { project: project('c', 'Shared launch', '#8b5cf6'), parentName: null, open: 0, canRestore: false },
] as never

const meta: Meta = { title: 'Settings/App' }
export default meta
export const Preferences: StoryObj = {
  render: () => (
    <div className="space-y-6">
      <StartViewView views={[{ id: 'v1', name: 'Morning review' } as never]} startView="today" onChange={noop} />
      <CalendarSettingsView prefs={{ startHour: 6, endHour: 22, dayLength: 480 }} onSave={noop} />
      <KeyboardView vim={false} onVim={noop} />
    </div>
  ),
}
export const NotificationsOn: StoryObj = { render: () => notif(push) }
export const NotificationsBlocked: StoryObj = { render: () => notif({ ...push, enabled: false, permission: 'denied', subscription: null }) }
export const NotificationsRenew: StoryObj = { render: () => notif({ ...push, needsRenewal: true, subscription: { ...push.subscription!, failures: 5, lastError: 'push service answered 410' } }, { kind: 'error', text: 'The push service refused the subscription.' }) }
export const NotificationsServerOff: StoryObj = { render: () => notif({ ...push, available: false }) }
export const CaptureQuickAddAndVoice: StoryObj = { render: () => <div className="space-y-6"><QuickAddSettingsSection /><VoiceSettingsSection /></div> }
export const CaptureBookmarklet: StoryObj = { render: () => <CaptureView code="javascript:void(0)" copied="yes" onCopy={noop} /> }
export const EmailOn: StoryObj = { render: () => email({ copied: true }) }
export const EmailOff: StoryObj = { render: () => email({ inbox: { ...inbox, enabled: false, allowlist: ['me@example.org'] }, draft: 'me@example.org\nyou@example.org' }) }
export const EmailOffline: StoryObj = { render: () => email({ inbox: null }) }
export const EmailOperatorOff: StoryObj = { render: () => email({ inbox: { ...inbox, enabledByOperator: false, address: null } }) }
export const EmailError: StoryObj = { render: () => email({ error: 'allowlist: "nope" is not an email address' }) }
export const Projects: StoryObj = { render: () => <AutoArchiveView on onChange={noop}><ArchivedProjectsList rows={rows} onRestore={noop} /></AutoArchiveView> }
export const ProjectsEmpty: StoryObj = { render: () => <AutoArchiveView on={false} onChange={noop}><ArchivedProjectsList rows={[]} onRestore={noop} /></AutoArchiveView> }
