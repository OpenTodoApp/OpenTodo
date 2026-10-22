// settings-redesign: the owner's Single sign-on card (Access policies), closed and configuring.
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { OidcSettings } from '../lib/types'
import { formFrom, SsoPanelView, type SsoPanelViewProps } from './SsoPanel'

const noop = () => {}
const settings: OidcSettings = {
  enabled: true, issuer: 'https://sso.example.com', clientId: 'opentodo', clientSecret: '••••1234', clientSecretSet: true,
  displayName: 'Home SSO', scopes: 'openid email profile', allowProvision: false, ssoOnly: false, providerLogout: false, syncPictures: false,
  redirectUri: 'https://todo.example.com/api/v1/auth/oidc/callback', baseUrlConfigured: true,
  managedBy: { issuer: 'settings', clientId: 'settings', clientSecret: 'settings', displayName: 'settings', ssoOnly: 'settings' },
}
const off: OidcSettings = { ...settings, enabled: false, issuer: '', clientId: '', clientSecret: '', clientSecretSet: false, displayName: '' }
const base: SsoPanelViewProps = {
  settings, form: formFrom(settings), online: true, busy: false, error: null, notice: null, test: null,
  onChange: noop, onSave: noop, onTest: noop, onRemoveSecret: noop,
}

const meta: Meta = { title: 'Settings/Single sign-on' }
export default meta
export const On: StoryObj = { render: () => <SsoPanelView {...base} /> }
export const Off: StoryObj = { render: () => <SsoPanelView {...base} settings={off} form={formFrom(off)} /> }
export const Configuring: StoryObj = { render: () => <SsoPanelView {...base} configuring test={{ ok: true, issuer: settings.issuer, authorizationHost: 'sso.example.com', tokenHost: 'sso.example.com', endSessionSupported: true }} /> }
export const Offline: StoryObj = { render: () => <SsoPanelView {...base} online={false} /> }
export const WithError: StoryObj = { render: () => <SsoPanelView {...base} configuring error="discovery failed: the issuer did not answer." /> }
export const NoBaseUrl: StoryObj = { render: () => <SsoPanelView {...base} configuring settings={{ ...settings, baseUrlConfigured: false, ssoOnly: true }} /> }
