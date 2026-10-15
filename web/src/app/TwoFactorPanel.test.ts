// Component tests for Settings → Two-factor authentication, the enrolment
// wizard, the recovery codes and the re-authentication dialog (OpenSpec
// `mfa-totp`). Static markup only, as in the other panel tests.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MfaStatus, TrustedDevice } from '../lib/types'
import { ReauthDialogView, type ReauthDialogViewProps } from './ReauthDialog'
import {
  MfaPolicyPanelView,
  browserName, EnrolmentStepView, groupKey, RecoveryCodesView, TwoFactorPanelView, type TwoFactorPanelViewProps,
} from './TwoFactorPanel'

const noop = () => {}
const now = Date.UTC(2026, 9, 10, 12)
const off: MfaStatus = { enrolled: false, recoveryCodesRemaining: 0, policy: 'none', required: false, restricted: false }
const on: MfaStatus = { enrolled: true, recoveryCodesRemaining: 9, policy: 'none', required: false, restricted: false }
const devices: TrustedDevice[] = [{
  id: 'd1', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  createdAt: now - 3_600_000, expiresAt: now + 29 * 86_400_000, lastUsedAt: now - 10_000,
}]

function panel(overrides: Partial<TwoFactorPanelViewProps>): string {
  const props: TwoFactorPanelViewProps = {
    status: off, online: true, isOwner: false, busy: false, error: null, devices: [], policy: null,
    onStart: noop, onDisable: noop, onRegenerate: noop, onForgetDevice: noop, onForgetAll: noop, now, ...overrides,
  }
  return renderToStaticMarkup(createElement(TwoFactorPanelView, props))
}
const disabledButtons = (html: string) => (html.match(/<button[^>]*disabled=""/g) ?? []).length
// The Help link (user-documentation) stays usable offline: help ships with the app.
const allButtons = (html: string) => (html.match(/<button(?![^>]*data-help-screen)/g) ?? []).length

describe('TwoFactorPanelView', () => {
  it('offers setup when off', () => {
    const html = panel({})
    expect(html).toContain('Two-factor authentication')
    expect(html).toMatch(/data-hue="slate"[^>]*><span[^>]*>Off<\/span>/)
    expect(html).toContain('Set up two-factor authentication')
    expect(disabledButtons(html)).toBe(0)
    expect(html).not.toContain('Remembered browsers')
  })

  it('shows remaining codes, remembered browsers and actions when on', () => {
    const html = panel({ status: on, devices })
    expect(html).toMatch(/data-hue="green"[^>]*><span[^>]*>On<\/span>/)
    expect(html).toContain('9 of 10 recovery codes left')
    expect(html).toContain('New recovery codes')
    expect(html).toContain('Turn off')
    expect(html).toContain('Safari on macOS')
    expect(html).toContain('Used just now')
    expect(html).toContain('aria-label="Actions for Safari on macOS"')
    expect(html).toContain('Forget all browsers')
    expect(disabledButtons(html)).toBe(0)
  })

  it('warns when few recovery codes are left', () => {
    const few = panel({ status: { ...on, recoveryCodesRemaining: 2 } })
    expect(few).toContain('Few recovery codes left')
    expect(few).toContain('data-hue="orange"')
    expect(few).toMatch(/ui-btn--primary[^"]*"[^>]*>New recovery codes/)
  })

  it('cannot be turned off when the policy requires it', () => {
    const html = panel({ status: { ...on, required: true, policy: 'all' } })
    expect(html).toContain('Required by the server owner')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Turn off/)
  })

  it('offline, says it needs a connection and shows no on or off state', () => {
    const html = panel({ status: on, devices, online: false, isOwner: true, policy: 'owner' })
    expect(html).toContain('needs a connection')
    expect(html).not.toContain('data-testid="mfa-status"')
    expect(html).not.toContain('Turn off')
    expect(disabledButtons(html)).toBe(allButtons(html))
  })

  it('links the owner to the server policy in Access policies, and only the owner', () => {
    const owner = panel({ isOwner: true, policy: 'all' })
    expect(owner).toContain('data-testid="mfa-policy-link"')
    expect(owner).toContain('required for every account')
    expect(owner).toContain('href="/settings/people"')
    expect(owner).not.toContain('Policy for this server')
    expect(panel({ isOwner: false })).not.toContain('mfa-policy-link')
  })

  it('the policy panel shows the select with the current policy, read-only offline', () => {
    const view = (p: Partial<Parameters<typeof MfaPolicyPanelView>[0]>) => renderToStaticMarkup(createElement(MfaPolicyPanelView, { policy: 'all', online: true, busy: false, error: null, onPolicy: () => {}, ...p }))
    const html = view({})
    expect(html).toContain('Policy for this server')
    expect(html).toContain('id="mfa-policy-select"')
    expect(html).toContain('<option value="all" selected="">Required for every account</option>')
    expect(view({ online: false })).toMatch(/<select[^>]*disabled=""/)
  })

})

describe('EnrolmentStepView', () => {
  const enrollment = {
    secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
    uri: 'otpauth://totp/OpenTodo:a%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=OpenTodo',
    expiresAt: now + 600_000,
  }
  it('shows a locally rendered QR code, the manual key and a code field', () => {
    const html = renderToStaticMarkup(createElement(EnrolmentStepView, {
      enrollment, code: '', busy: false, disabled: false, error: null, onCode: noop, onConfirm: noop, onCancel: noop,
    }))
    expect(html).toMatch(/<svg[^>]*role="img"[^>]*aria-label="QR code/)
    expect(html).toMatch(/<path d="M\d/)
    expect(html).not.toContain('<img') // no image request carrying the secret
    expect(html).toContain('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')
    expect(html).toContain('Code from the app')
    expect(html).toContain('Turn on')
  })

  it('shows a confirmation error', () => {
    const html = renderToStaticMarkup(createElement(EnrolmentStepView, {
      enrollment, code: '1', busy: false, disabled: false, error: 'That code does not match.', onCode: noop, onConfirm: noop,
    }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('That code does not match.')
  })
})

describe('RecoveryCodesView', () => {
  const codes = Array.from({ length: 10 }, (_, i) => `AAAA${i}-BBBB${i}`)
  it('lists the codes once with copy and download, and requires an acknowledgement', () => {
    const html = renderToStaticMarkup(createElement(RecoveryCodesView, {
      codes, acknowledged: false, copied: false, onAcknowledge: noop, onCopy: noop, onDownload: noop, onDone: noop,
    }))
    for (const c of codes) expect(html).toContain(c)
    expect(html).toContain('will not be shown again')
    expect(html).toContain('Copy codes')
    expect(html).toContain('Download as text')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Done/)
  })
  it('enables Done once acknowledged', () => {
    const html = renderToStaticMarkup(createElement(RecoveryCodesView, {
      codes, acknowledged: true, copied: true, onAcknowledge: noop, onCopy: noop, onDownload: noop, onDone: noop,
    }))
    expect(html).not.toMatch(/disabled=""[^>]*>Done/)
    expect(html).toContain('Copied')
  })
})

describe('ReauthDialogView', () => {
  function dialog(o: Partial<ReauthDialogViewProps>) {
    return renderToStaticMarkup(createElement(ReauthDialogView, {
      mode: 'password', value: '', busy: false, error: null, onMode: noop, onValue: noop, onSubmit: noop, onCancel: noop, ...o,
    }))
  }
  it('asks for the password in a modal dialog', () => {
    const html = dialog({})
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain("Confirm it&#x27;s you")
    expect(html).toContain('type="password"')
    expect(html).toContain('Use an app code instead')
  })
  it('switches to a code and shows errors', () => {
    const html = dialog({ mode: 'code', error: 'That code is not valid.' })
    expect(html).toMatch(/autocomplete="one-time-code"/i)
    expect(html).toContain('Use my password instead')
    expect(html).toContain('That code is not valid.')
  })
})

describe('helpers', () => {
  it('groups the key and names browsers', () => {
    expect(groupKey('ABCDEFGHIJ')).toBe('ABCD EFGH IJ')
    expect(browserName('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36')).toBe('Chrome on Linux')
    expect(browserName('')).toBe('Browser')
  })
})
