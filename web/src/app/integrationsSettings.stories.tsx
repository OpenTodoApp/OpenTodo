import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ApiToken } from '../lib/assistants'
import type { AppPassword, Webhook, WebhookDelivery } from '../lib/types'
import { CaldavView, type CaldavViewProps } from './CaldavPanel'
import { TokensView, type TokensViewProps } from './TokensSection'
import { emptyDraft, WebhooksView, type WebhooksViewProps } from './WebhooksPanel'

const noop = () => {}
const now = 1_760_000_060_000

const pw = (id: string, name: string, over: Partial<AppPassword> = {}): AppPassword => ({ id, name, createdAt: now - 86_400_000 * 9, lastUsedAt: now - 3_600_000, revokedAt: null, ...over })
const caldav = (over: Partial<CaldavViewProps> = {}) => (
  <CaldavView isOwner email="ada@example.com" setting={{ enabled: true, url: 'https://todo.example.com/dav/', secure: true }}
    passwords={[pw('a1', 'iPhone'), pw('a2', 'Thunderbird on the desk', { lastUsedAt: null }), pw('a3', 'Old tablet', { revokedAt: now - 86_400_000 })]}
    newName="" secret={null} error={null} busy={false}
    onToggle={noop} onNameChange={noop} onCreate={noop} onRevoke={noop} onNew={noop} onCloseNew={noop} {...over} />
)

const hook = (id: string, url: string, over: Partial<Webhook> = {}): Webhook => ({
  id, url, events: ['task.completed'], projectId: null, enabled: true, disabledReason: null, consecutiveFailures: 0, createdAt: now, updatedAt: now, ...over,
})
const deliveries: WebhookDelivery[] = [
  { id: 'd1', webhookId: 'w1', event: 'task.completed', status: 'delivered', attempts: 1, nextAttemptAt: null, statusCode: 200, error: null, responseExcerpt: 'ok', durationMs: 42, createdAt: now - 60_000, deliveredAt: now - 59_000 },
  { id: 'd2', webhookId: 'w1', event: 'task.created', status: 'failed', attempts: 5, nextAttemptAt: null, statusCode: 502, error: 'bad gateway', responseExcerpt: '<html>502</html>', durationMs: 1200, createdAt: now - 3_600_000, deliveredAt: null },
]
const hooks = [
  hook('w1', 'https://n8n.example.com/webhook/plants', { events: ['task.completed', 'task.created'], projectId: 'p1' }),
  hook('w2', 'http://homeassistant.local:8123/api/webhook/opentodo', { consecutiveFailures: 3 }),
  hook('w3', 'https://hooks.example.org/disabled', { enabled: false, disabledReason: 'failures' }),
]
const webhooks = (over: Partial<WebhooksViewProps> = {}) => (
  <WebhooksView isOwner connected webhooks={hooks} projects={[{ id: 'p1', name: 'Garden' }]} allowPrivate={false} busy={false} error={null}
    draft={null} secret={null} testResults={{}} log={null}
    onDraftChange={noop} onSave={noop} onDismissSecret={noop} onToggleEnabled={noop} onTest={noop} onDelete={noop}
    onOpenLog={noop} onRefreshLog={noop} onRedeliver={noop} onPolicyChange={noop} {...over} />
)

const token = (id: string, name: string, scope: ApiToken['scope'], lastUsedAt: number | null = null) => ({ id, name, scope, createdAt: now - 86_400_000 * 30, lastUsedAt }) as ApiToken
const tokens = (over: Partial<TokensViewProps> = {}) => (
  <TokensView tokens={[token('t1', 'laptop CLI', 'full', now - 3_600_000), token('t2', 'Dashboard', 'read'), token('t3', 'Desk assistant', 'agent', now)]}
    name="" scope="full" secret={null} error={null} onNameChange={noop} onScopeChange={noop} onCreate={noop} onRevoke={noop} onNew={noop} onCloseNew={noop} {...over} />
)

const meta: Meta = { title: 'Settings/Integrations' }
export default meta
export const CalendarApps: StoryObj = { render: () => caldav() }
export const CalendarAppsMember: StoryObj = { render: () => caldav({ isOwner: false, passwords: [] }) }
export const CalendarAppsWarnings: StoryObj = { render: () => caldav({ setting: { enabled: true, url: 'http://todo.local/dav/', secure: false, encryption: true }, error: 'The server refused the request.' }) }
export const CalendarAppsOffline: StoryObj = { render: () => caldav({ setting: null, passwords: null }) }
export const CalendarAppsNewPassword: StoryObj = { render: () => caldav({ creating: true, secret: 'abcd-efgh-ijkl-mnop' }) }
export const Webhooks: StoryObj = { render: () => webhooks({ testResults: { w2: { ok: false, text: 'Connection refused' } } }) }
export const WebhooksDeliveryLog: StoryObj = { render: () => webhooks({ log: { webhookId: 'w1', deliveries } }) }
export const WebhooksEmpty: StoryObj = { render: () => webhooks({ webhooks: [] }) }
export const WebhooksOffline: StoryObj = { render: () => webhooks({ connected: false, error: 'Webhooks are managed on your server; this requires a connection.' }) }
export const WebhooksForm: StoryObj = { render: () => webhooks({ draft: { ...emptyDraft(), url: 'http://example.com/hook' } }) }
export const WebhooksSecret: StoryObj = { render: () => webhooks({ secret: { webhookId: 'w1', value: 'whsec_3f9a0c1d2e' } }) }
export const ApiTokens: StoryObj = { render: () => tokens() }
export const ApiTokensEmpty: StoryObj = { render: () => tokens({ tokens: [] }) }
export const ApiTokensError: StoryObj = { render: () => tokens({ tokens: null, error: 'You are offline. Tokens are managed on your server.' }) }
export const ApiTokensNew: StoryObj = { render: () => tokens({ creating: true, scope: 'read', name: 'Dashboard' }) }
export const ApiTokensCreated: StoryObj = { render: () => tokens({ creating: true, secret: 'ot_8f2c41d09a7e' }) }
