// native-shells: the web app's screens that change inside a native shell — Settings →
// Notifications through the app, the shell row in About, and the unlock screen with
// biometric unlock. In a browser none of these variants appear.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SettingsSection } from '../ui'
import { ShellAppRow } from './AboutSection'
import { ShellNotificationsView, type ShellNotificationsState } from './ShellNotifications'
import { UnlockView } from './UnlockScreen'

const noop = () => {}
const on: ShellNotificationsState = { enabled: true, includeContent: false, permission: 'granted' }
const notifications = (state: ShellNotificationsState, message: { kind: 'error' | 'info'; text: string } | null = null) => (
  <ShellNotificationsView state={state} busy={false} message={message} onEnable={noop} onIncludeContent={noop} onTest={noop} />
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
export const AboutAndroid: StoryObj = { render: () => <SettingsSection title="About"><ShellAppRow app={{ platform: 'android', version: '0.10.0', outdated: false }} /></SettingsSection> }
export const AboutAndroidOutdated: StoryObj = { render: () => <SettingsSection title="About"><ShellAppRow app={{ platform: 'android', version: '0.9.2', outdated: true }} /></SettingsSection> }
export const UnlockOfferBiometric: StoryObj = { render: () => unlock({ available: true, enabled: false }) }
export const UnlockWithBiometric: StoryObj = { render: () => unlock({ available: true, enabled: true }) }
