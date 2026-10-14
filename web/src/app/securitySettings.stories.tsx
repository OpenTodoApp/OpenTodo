import type { Meta, StoryObj } from '@storybook/react-vite'
import type { MfaStatus, TrustedDevice } from '../lib/types'
import { SessionPanel } from './AccountSettings'
import { PasswordView } from './PasswordSection'
import { MfaPolicyPanelView, TwoFactorPanelView, type TwoFactorPanelViewProps } from './TwoFactorPanel'

const noop = () => {}
const now = 1_760_000_000_000
const off: MfaStatus = { enrolled: false, recoveryCodesRemaining: 0, policy: 'none', required: false, restricted: false }
const on: MfaStatus = { ...off, enrolled: true, recoveryCodesRemaining: 7 }
const devices: TrustedDevice[] = [
  { id: 'd1', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', createdAt: now - 3_600_000, expiresAt: now + 29 * 86_400_000, lastUsedAt: now - 60_000 },
  { id: 'd2', userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', createdAt: now - 9 * 86_400_000, expiresAt: now + 21 * 86_400_000, lastUsedAt: now - 2 * 86_400_000 },
]
const base: TwoFactorPanelViewProps = {
  status: off, online: true, isOwner: false, busy: false, error: null, devices: [], policy: null,
  onStart: noop, onDisable: noop, onRegenerate: noop, onForgetDevice: noop, onForgetAll: noop, now,
}
const pw = { current: '', next: '', busy: false, error: null, done: false, onCurrent: noop, onNext: noop, onSubmit: noop }

const meta: Meta = { title: 'Settings/You' }
export default meta
export const TwoFactorOff: StoryObj = { render: () => <TwoFactorPanelView {...base} /> }
export const TwoFactorOn: StoryObj = { render: () => <TwoFactorPanelView {...base} status={on} devices={devices} isOwner policy="owner" /> }
export const TwoFactorFewCodes: StoryObj = { render: () => <TwoFactorPanelView {...base} status={{ ...on, recoveryCodesRemaining: 2 }} devices={[]} /> }
export const TwoFactorOffline: StoryObj = { render: () => <TwoFactorPanelView {...base} status={on} online={false} /> }
export const TwoFactorPolicy: StoryObj = { render: () => <MfaPolicyPanelView policy="owner" online busy={false} error={null} onPolicy={noop} /> }
export const Password: StoryObj = { render: () => <PasswordView {...pw} online /> }
export const PasswordOpen: StoryObj = { render: () => <PasswordView {...pw} online open error="Your current password is not correct." /> }
export const PasswordOffline: StoryObj = { render: () => <PasswordView {...pw} online={false} /> }
export const Session: StoryObj = { render: () => <SessionPanel onLogout={noop} /> }
