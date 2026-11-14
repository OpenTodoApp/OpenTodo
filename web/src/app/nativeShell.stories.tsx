// native-shells: the web app's screens that change inside a native shell — Settings →
// Notifications through the app, the shell row in About, and the unlock screen with
// biometric unlock. In a browser none of these variants appear.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SettingsSection } from '../ui'
import { ShellAppRow } from './AboutSection'
import { ShellNotificationsView, type ShellNotificationsState } from './ShellNotifications'
import type { ShellPushView } from '../lib/shellPush'
import { UnlockView } from './UnlockScreen'

const noop = () => {}
const on: ShellNotificationsState = { enabled: true, includeContent: false, permission: 'granted' }
const notifications = (state: ShellNotificationsState, message: { kind: 'error' | 'info'; text: string } | null = null, push: ShellPushView | null = null) => (
  <ShellNotificationsView state={state} busy={false} message={message} push={push} onPush={noop} onEnable={noop} onIncludeContent={noop} onTest={noop} />
)
const unlock = (biometric: { available: boolean; enabled: boolean }) => (
  <UnlockView kind="passphrase" busy={false} error={null} lost={false} onKind={noop} onSubmit={noop} onLost={noop} onConfirmLost={noop} onLogout={noop}
    biometric={biometric} remember onRemember={noop} onBiometric={noop} />
)

const meta: Meta = { title: 'Screens/Native shell' }
export default meta
export const NotificationsOn: StoryObj = { render: () => notifications(on, { kind: 'info', text: 'The app showed a test notification on this device.' }) }
export const NotificationsRefused: StoryObj = { render: () => notifications({ enabled: false, includeContent: false, permission: 'denied' }) }
export const NotificationsLateAlarms: StoryObj = { render: () => notifications({ ...on, permission: 'exact-denied' }) }
// shell-push: delivery through the user's UnifiedPush app, in the Android app only.
export const NotificationsPushOff: StoryObj = { render: () => notifications(on, null, { offered: true, available: true, enabled: false }) }
export const NotificationsPushOn: StoryObj = { render: () => notifications(on, null, { offered: true, available: true, enabled: true }) }
export const NotificationsPushNoApp: StoryObj = { render: () => notifications(on, null, { offered: true, available: false, enabled: false }) }
export const NotificationsPushFailed: StoryObj = { render: () => notifications(on, { kind: 'error', text: 'The server could not be reached.' }, { offered: true, available: true, enabled: false }) }
export const AboutAndroid: StoryObj = { render: () => <SettingsSection title="About"><ShellAppRow app={{ platform: 'android', version: '0.10.0', outdated: false }} /></SettingsSection> }
export const AboutAndroidOutdated: StoryObj = { render: () => <SettingsSection title="About"><ShellAppRow app={{ platform: 'android', version: '0.9.2', outdated: true }} /></SettingsSection> }
export const UnlockOfferBiometric: StoryObj = { render: () => unlock({ available: true, enabled: false }) }
export const UnlockWithBiometric: StoryObj = { render: () => unlock({ available: true, enabled: true }) }
