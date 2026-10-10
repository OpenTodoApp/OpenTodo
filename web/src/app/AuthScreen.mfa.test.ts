// Second sign-in step (OpenSpec `mfa-totp`), rendered to static markup like the
// other component tests (no DOM library).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../lib/api'
import { MfaStepView, type MfaStepViewProps, mfaStepError } from './AuthScreen'

const noop = () => {}
function render(overrides: Partial<MfaStepViewProps> = {}): string {
  const props: MfaStepViewProps = {
    code: '', recovery: false, remember: false, busy: false, error: null,
    onCode: noop, onRecovery: noop, onRemember: noop, onSubmit: noop, onBack: noop, ...overrides,
  }
  return renderToStaticMarkup(createElement(MfaStepView, props))
}

describe('MfaStepView (mfaRequired)', () => {
  it('asks for the app code with a recovery toggle and a remember checkbox', () => {
    const html = render()
    expect(html).toContain('six-digit code from your authenticator app')
    expect(html).toMatch(/autocomplete="one-time-code"/i)
    expect(html).toMatch(/inputmode="numeric"/i)
    expect(html).toContain('Use a recovery code')
    expect(html).toContain('Remember this device for 30 days')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('Verify')
    expect(html).toContain('Back')
    expect(html).not.toContain('role="alert"')
  })

  it('switches to a recovery code field', () => {
    const html = render({ recovery: true })
    expect(html).toContain('Enter one of your recovery codes')
    expect(html).toContain('placeholder="XXXXX-XXXXX"')
    expect(html).toContain('Use a code from the app')
    expect(html).not.toContain('one-time-code')
  })

  it('keeps the remember choice', () => {
    expect(render({ remember: true })).toMatch(/type="checkbox" checked=""/)
  })
})

describe('second-step errors', () => {
  it('a wrong code stays on the code step with a message', () => {
    const next = mfaStepError(new ApiError(401, 'mfa_code_invalid', 'x'))
    expect(next.restart).toBe(false)
    expect(next.message).toContain('not valid')
    const html = render({ error: next.message })
    expect(html).toContain('role="alert"')
    expect(html).toContain('That code is not valid')
  })

  it('an exhausted or expired challenge goes back to the password', () => {
    const next = mfaStepError(new ApiError(401, 'mfa_challenge_invalid', 'x'))
    expect(next.restart).toBe(true)
    expect(next.message).toContain('Enter your password again')
  })

  it('rate limiting and network failures are explained', () => {
    expect(mfaStepError(new ApiError(429, 'rate_limited', 'x')).message).toContain('Too many attempts')
    expect(mfaStepError(new TypeError('fetch failed')).message).toContain('server reachable')
  })
})
