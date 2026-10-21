import type { Meta, StoryObj } from '@storybook/react-vite'
import type { AssistantStatus } from '../lib/assistantStatus'
import type { AssistantOwnerSettings } from '../lib/assistantTypes'
import { AssistantsView, type AssistantsViewProps } from './AssistantsPanel'
import { RelayConfirmView } from './RelayConfirm'
import { RelayIndicatorView, RelayView, type RelayViewProps } from './RelaySettings'
import { draftFrom, OwnerAssistantSettings, OwnerAssistantSummary, UserAssistantSettings } from './assistant/AssistantSettings'

const noop = () => {}
const endpoint = 'https://todo.example.com/mcp'
const saved: AssistantOwnerSettings = {
  enabled: true, active: true, default_provider: 'anthropic', allow_member_keys: true, cap_member_keys: false, own_key_members: 2,
  monthly_token_cap_per_user: 500000, allow_private_endpoint: false,
  anthropic_models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], default_model: 'claude-opus-5-5',
  providers: {
    anthropic: { enabled: true, model: 'claude-opus-5-5', key_set: true, label: 'Anthropic (Claude)' },
    openai: { enabled: true, model: 'gpt-4.1-mini', key_set: false, label: 'OpenAI' },
    gemini: { enabled: false, model: '', key_set: false, label: 'Google Gemini' },
    compatible: { enabled: false, model: '', key_set: false, label: 'compatible', base_url: '' },
  },
}
const status: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'claude-opus-5-5', consented: true,
  disclosure_version: 1, fields: [], allow_member_keys: true, own_key_set: false, operator_key_set: true, source: 'server', own_key_in_use: false,
  server_provider: 'anthropic', server_provider_label: 'Anthropic (Claude)', server_model: 'claude-opus-5-5', server_own_key_set: false, own_provider: null,
  member_providers: ['anthropic', 'openai', 'gemini'], anthropic_models: saved.anthropic_models, cap_member_keys: false,
}
const user = (over: Partial<Parameters<typeof UserAssistantSettings>[0]> = {}) => (
  <UserAssistantSettings status={status} usage={{ month: '2026-10', input_tokens: 80000, output_tokens: 10000, total_tokens: 90000, turns: 12, cap: 500000, resets_at: '2026-11-01' }}
    autoApply={false} connected busy={false} error={null} cleared={false} onWithdraw={noop} onOwnKey={noop} onAutoApply={noop} onClear={noop}
    onSaveOwn={async () => true} onTestOwn={noop} {...over} />
)
const card = (children: React.ReactNode) => <section className="rounded-card border border-default bg-surface p-4 shadow-1 sm:p-6">{children}</section>

const assistants = (over: Partial<AssistantsViewProps> = {}) => (
  <AssistantsView isOwner connected status={{ enabled: true, writes_enabled: true, endpoint }} access={{ allow_writes: true, owner_allows_writes: true }}
    busy={false} error={null} secret={null} copied={null}
    onToggle={noop} onToggleWrites={noop} onToggleAccess={noop} onCreateToken={noop} onCopy={noop} onDismissSecret={noop} {...over} />
)

const meta: Meta = { title: 'Settings/AI' }
export default meta
export const AssistantOwner: StoryObj = { render: () => card(<><OwnerAssistantSummary saved={saved} connected onConfigure={noop} />{user()}</>) }
export const AssistantOwnerOff: StoryObj = { render: () => card(<OwnerAssistantSummary saved={{ ...saved, enabled: false, allow_member_keys: false }} connected={false} onConfigure={noop} />) }
export const AssistantConfigure: StoryObj = {
  render: () => card(<OwnerAssistantSettings saved={saved} draft={draftFrom(saved)} connected busy={false} error="The compatible endpoint is a private address." message={null}
    tests={{ anthropic: { ok: true, message: 'Connected: claude-opus-5-5 answered.' }, openai: { ok: false, code: 'no_key', message: 'No API key is saved' } }}
    onChange={noop} onSave={noop} onTest={noop} onCancel={noop} />),
}
export const AssistantMemberOwnKey: StoryObj = {
  render: () => card(user({ status: { ...status, source: 'own', provider: 'openai', provider_label: 'OpenAI', model: 'gpt-member-1', own_key_set: true, own_key_in_use: true,
    own_provider: { provider: 'openai', provider_label: 'OpenAI', model: 'gpt-member-1', key_set: true } }, ownTest: { ok: true, message: 'Connected.' } })),
}
export const AssistantNotConsented: StoryObj = { render: () => card(user({ status: { ...status, consented: false, allow_member_keys: false }, usage: null, error: 'The server is unreachable.' })) }
export const AssistantOff: StoryObj = { render: () => card(user({ status: { ...status, enabled: false } })) }
export const AssistantsMcp: StoryObj = { render: () => assistants() }
export const AssistantsMcpOff: StoryObj = { render: () => assistants({ status: { enabled: false, endpoint } }) }
export const AssistantsMcpMember: StoryObj = { render: () => assistants({ isOwner: false, status: { enabled: true, endpoint }, access: { allow_writes: false, owner_allows_writes: false } }) }
export const AssistantsMcpOffline: StoryObj = { render: () => assistants({ connected: false }) }
export const AssistantsMcpToken: StoryObj = { render: () => assistants({ secret: 'ot_assistant123', secretScope: 'read', error: null }) }

// Device relay for encrypted accounts (mcp-device-relay).
const at = Date.UTC(2026, 9, 21, 9, 30)
const relay = (over: Partial<RelayViewProps> = {}) => card(
  <RelayView unlocked optedIn={false} connected={false} confirmWrites={false} devices={[]} recent={[]} busy={false} error={null}
    onToggle={noop} onConfirmWrites={noop} {...over} />,
)
export const RelayOff: StoryObj = { render: () => relay() }
export const RelayLocked: StoryObj = { render: () => relay({ unlocked: false }) }
export const RelayOn: StoryObj = {
  render: () => relay({
    optedIn: true, connected: true, confirmWrites: true,
    devices: [{ deviceId: 'a', label: 'Firefox on Linux', enabledAt: at, online: true, thisSession: true }, { deviceId: 'b', label: 'Safari on macOS', enabledAt: at, online: true, thisSession: false }],
    recent: [
      { at, tool: 'list_tasks', op: 'decrypt', count: 24, outcome: 'answered' },
      { at: at - 60_000, tool: 'create_tasks', op: 'encrypt', count: 1, outcome: 'declined_on_device' },
    ],
  }),
}
export const RelayConfirmSheet: StoryObj = {
  render: () => <RelayConfirmView tool="create_tasks" token="Claude.ai" onApply={noop} onDecline={noop}
    items={[{ entity: 'task', id: 't1', field: 'title', value: 'Call the plumber about the leak' }, { entity: 'task', id: 't1', field: 'description', value: 'Ask whether the boiler can be checked on the same visit.' }]} />,
}
export const RelayIndicatorBusy: StoryObj = { render: () => <div className="flex items-center gap-1 p-2"><RelayIndicatorView busy /></div> }
