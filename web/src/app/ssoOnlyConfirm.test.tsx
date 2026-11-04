// @vitest-environment happy-dom
// "Require single sign-on" locks members out of passwords and passkeys, so
// checking it asks first; unchecking it does not.
import { describe, expect, it, vi } from 'vitest'
import type { OidcSettings } from '../lib/types'
import { click, render, waitFor } from '../ui/test-utils'
import { formFrom, SsoPanelView } from './SsoPanel'

const settings: OidcSettings = {
  enabled: true, issuer: 'https://sso.example.com', clientId: 'opentodo', clientSecret: '••••1234', clientSecretSet: true,
  displayName: 'Home SSO', scopes: 'openid email profile', allowProvision: false, ssoOnly: false, providerLogout: false, syncPictures: false,
  redirectUri: 'https://todo.example.com/api/v1/auth/oidc/callback', baseUrlConfigured: true,
  managedBy: { issuer: 'settings', clientId: 'settings', clientSecret: 'settings', displayName: 'settings', ssoOnly: 'settings' },
}

const ssoOnlyBox = () => [...document.querySelectorAll<HTMLLabelElement>('label')]
  .find((l) => l.textContent?.includes('Require single sign-on (SSO only)'))!.querySelector<HTMLInputElement>('input[type="checkbox"]')!
const dialog = () => document.querySelector<HTMLElement>('[role="alertdialog"], [role="dialog"]')
const button = (root: ParentNode, text: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)

function mount(ssoOnly: boolean, onChange = vi.fn()) {
  const s = { ...settings, ssoOnly }
  return render(<SsoPanelView configuring settings={s} form={formFrom(s)} online busy={false} error={null} notice={null} test={null}
    onChange={onChange} onSave={() => {}} onTest={() => {}} onRemoveSecret={() => {}} />).then(() => onChange)
}

describe('Require single sign-on', () => {
  it('asks before turning it on, and only changes the form on confirm', async () => {
    const onChange = await mount(false)
    await click(ssoOnlyBox())
    await waitFor(() => dialog()?.textContent?.includes('Require single sign-on?') === true, 'the confirmation')
    expect(onChange).not.toHaveBeenCalled()
    await click(button(dialog()!, 'Require single sign-on')!)
    await waitFor(() => onChange.mock.calls.length === 1, 'the change')
    expect(onChange).toHaveBeenCalledWith({ ssoOnly: true })
  })

  it('turns it off without asking', async () => {
    const onChange = await mount(true)
    await click(ssoOnlyBox())
    expect(dialog()).toBeNull()
    expect(onChange).toHaveBeenCalledWith({ ssoOnly: false })
  })
})
