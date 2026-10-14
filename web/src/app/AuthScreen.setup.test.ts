// First-run setup with OPENTODO_SETUP_TOKEN (OpenSpec `owner-bootstrap`), rendered
// to static markup like the other AuthScreen tests.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api'
import type { AuthStatus } from '../lib/types'
import { AuthScreen, describeAuthError } from './AuthScreen'

const setup: AuthStatus = { setupRequired: true, signupAllowed: true, authenticated: false, user: null, version: 'test' }

function render(status: AuthStatus): string {
  vi.stubGlobal('location', { search: '', pathname: '/', hash: '' })
  return renderToStaticMarkup(createElement(AuthScreen, { status, onAuthenticated: () => {} }))
}

afterEach(() => vi.unstubAllGlobals())

describe('AuthScreen setup token', () => {
  it('asks for the token with a hint when the server requires one', () => {
    const html = render({ ...setup, setupTokenRequired: true })
    expect(html).toContain('Setup token')
    expect(html).toContain('OPENTODO_SETUP_TOKEN')
    expect(html).toContain('Create owner account')
  })

  it('keeps the plain first-run form without a configured token', () => {
    expect(render(setup)).not.toContain('Setup token')
    expect(render({ ...setup, setupTokenRequired: false })).not.toContain('Setup token')
  })

  it('never asks once an owner exists', () => {
    expect(render({ ...setup, setupRequired: false, setupTokenRequired: true })).not.toContain('Setup token')
  })

  it('explains a wrong token', () => {
    const msg = describeAuthError(new ApiError(403, 'setup_token_invalid', 'the setup token is missing or wrong'))
    expect(msg).toContain('OPENTODO_SETUP_TOKEN')
  })
})
