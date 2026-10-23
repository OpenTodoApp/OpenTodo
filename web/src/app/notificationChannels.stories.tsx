import type { Meta, StoryObj } from '@storybook/react-vite'
import type { NotificationChannel } from '../lib/notificationChannels'
import { channelDraftOf, newChannelDraft } from './NotificationChannelEditor'
import { ChannelsView, type ChannelsViewProps } from './NotificationChannels'

// Settings → Notifications → Delivery channels (OpenSpec change notification-channels, task 3.1).

const noop = () => {}
const now = 1_760_000_060_000

const channel = (over: Partial<NotificationChannel> = {}): NotificationChannel => ({
  id: 'n1', kind: 'ntfy', name: 'Phone', url: 'https://ntfy.sh', topic: 'ada-tasks', events: ['reminder', 'assigned', 'mentioned'], includeTitles: true,
  enabled: true, lang: 'en', tokenSet: false, lastOkAt: now - 180_000, failures: 0, createdAt: now - 86_400_000 * 3, updatedAt: now - 600_000, ...over,
})
const pushover = channel({ id: 'p1', kind: 'pushover', name: 'Pushover', url: undefined, topic: undefined, includeTitles: false, tokenSet: true, userKeySet: true, lastOkAt: null })
const failing = channel({ id: 'g1', kind: 'gotify', name: 'Home server', url: 'https://gotify.home.example', topic: undefined, tokenSet: true,
  enabled: false, disabledReason: 'too_many_failures', lastError: 'HTTP 401', failures: 20 })
const webhook = channel({ id: 'w1', kind: 'webhook', name: 'Home Assistant', url: 'https://ha.example.com/api/webhook/opentodo', topic: undefined, secretSet: true, includeTitles: false })

const view = (over: Partial<ChannelsViewProps> = {}) => (
  <ChannelsView isOwner enabled connected encrypted={false} channels={[channel(), pushover, failing, webhook]} busy={false} error={null}
    draft={null} fieldError={null} secret={null} tests={{ p1: 'Test delivered.' }} now={now}
    onToggle={noop} onDraftChange={noop} onSave={noop} onSetEnabled={noop} onTest={noop} onRotate={noop} onDelete={noop} onSecretSeen={noop} {...over} />
)

const meta: Meta = { title: 'Settings/Notifications/Delivery channels' }
export default meta
export const Channels: StoryObj = { render: () => view() }
export const Empty: StoryObj = { render: () => view({ channels: [], tests: {} }) }
export const MemberWhileOff: StoryObj = { render: () => view({ isOwner: false, enabled: false, channels: null }) }
export const Offline: StoryObj = { render: () => view({ connected: false }) }
export const SecretOnce: StoryObj = { render: () => view({ secret: { name: 'Home Assistant', value: 'whsec_9fK2mQ7xVb4LpT1cRz8NwY3dHs6GaJ0e' } }) }
export const AddNtfy: StoryObj = { render: () => view({ draft: { ...newChannelDraft('ntfy'), topic: 'ada-tasks' } }) }
export const EditPushover: StoryObj = { render: () => view({ draft: channelDraftOf(pushover) }) }
export const EncryptedEditor: StoryObj = { render: () => view({ encrypted: true, draft: channelDraftOf(channel()) }) }
