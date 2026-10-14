// settings-redesign: the Security section's Passkeys and Linked accounts cards in each state.
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { LinkedIdentity, Passkey } from '../lib/types'
import { SecurityPanelView, type SecurityPanelViewProps } from './SecurityPanel'
import { LinkedAccountsView, type LinkedAccountsViewProps } from './SsoPanel'

const noop = () => {}
const now = 1_760_000_000_000
const keys: Passkey[] = [
  { id: 'a', name: 'Phone', createdAt: now - 30 * 86_400_000, lastUsedAt: now - 3_600_000, suspiciousAt: null, backedUp: true },
  { id: 'b', name: 'Security key', createdAt: now - 90 * 86_400_000, lastUsedAt: null, suspiciousAt: null, backedUp: false },
]
const many: Passkey[] = Array.from({ length: 8 }, (_, i) => ({
  id: `k${i}`, name: `Laptop ${i + 1}`, createdAt: now - (i + 1) * 86_400_000, lastUsedAt: now - i * 3_600_000, suspiciousAt: null, backedUp: i % 2 === 0,
}))
const passkeys: SecurityPanelViewProps = {
  available: true, supported: true, online: true, passkeys: keys, domain: 'todo.example.com', pageHost: 'todo.example.com',
  busy: false, error: null, onAdd: noop, onRename: noop, onDelete: noop, now,
}
const ids: LinkedIdentity[] = [{ id: 'i1', issuer: 'https://sso.example.com', email: 'me@example.com', createdAt: now - 86_400_000, lastLoginAt: now - 60_000 }]
const linked: LinkedAccountsViewProps = {
  identities: ids, provider: { enabled: true, displayName: 'Home SSO', ssoOnly: false }, online: true, busy: false,
  error: null, notice: null, onUnlink: noop, now,
}

const meta: Meta = { title: 'Settings/Security' }
export default meta
export const Passkeys: StoryObj = { render: () => <SecurityPanelView {...passkeys} /> }
export const PasskeysEmpty: StoryObj = { render: () => <SecurityPanelView {...passkeys} passkeys={[]} /> }
export const PasskeysOffline: StoryObj = { render: () => <SecurityPanelView {...passkeys} online={false} /> }
export const PasskeysError: StoryObj = { render: () => <SecurityPanelView {...passkeys} error="The server refused the passkey." /> }
export const PasskeysMany: StoryObj = { render: () => <SecurityPanelView {...passkeys} passkeys={many} /> }
export const PasskeysSuspicious: StoryObj = { render: () => <SecurityPanelView {...passkeys} passkeys={[{ ...keys[0], suspiciousAt: now - 60_000 }, keys[1]]} /> }
export const PasskeysWrongDomain: StoryObj = { render: () => <SecurityPanelView {...passkeys} pageHost="192.168.1.10" /> }
export const LinkedAccounts: StoryObj = { render: () => <LinkedAccountsView {...linked} /> }
export const LinkedAccountsEmpty: StoryObj = { render: () => <LinkedAccountsView {...linked} identities={[]} /> }
export const LinkedAccountsOffline: StoryObj = { render: () => <LinkedAccountsView {...linked} online={false} /> }
export const LinkedAccountsError: StoryObj = { render: () => <LinkedAccountsView {...linked} error="This identity is already linked to another account." /> }
