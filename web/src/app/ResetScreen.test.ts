// Reset-link screen, rendered to static markup like InviteScreen.test.ts.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ResetView, type ResetState } from './ResetScreen'
import { parseRoute, routePath } from './router'
import type { User } from '../lib/types'

const noop = () => {}
const render = (state: ResetState, user: User | null = null) =>
  renderToStaticMarkup(createElement(ResetView, { state, user, form: createElement('form', { id: 'reset-form' }), onRetry: noop, onLogout: noop }))

const member: User = { id: 'u1', email: 'm@example.com', name: 'M', role: 'member', createdAt: 0 }

describe('ResetView', () => {
  it('shows the form once the preview is ready', () => {
    const html = render({ kind: 'ready', preview: { email: 'm@example.com', expiresAt: 1 } })
    expect(html).toContain('Set a new password')
    expect(html).toContain('id="reset-form"')
  })

  it('offers a signed-in visitor to sign out first, without a form', () => {
    const html = render({ kind: 'ready', preview: { email: 'm@example.com', expiresAt: 1 } }, member)
    expect(html).toContain('already signed in')
    expect(html).toContain('Sign out and continue')
    expect(html).not.toContain('id="reset-form"')
  })

  it('explains an invalid link', () => {
    const html = render({ kind: 'invalid' })
    expect(html).toContain('no longer valid')
    expect(html).toContain('href="/"')
    expect(html).not.toContain('id="reset-form"')
  })

  it('waits for the network while offline and offers a retry', () => {
    const html = render({ kind: 'offline' })
    expect(html).toContain('offline')
    expect(html).toContain('Retry now')
    expect(html).not.toContain('id="reset-form"')
  })

  it('tells the visitor to wait when rate limited', () => {
    expect(render({ kind: 'rate-limited' })).toContain('Too many attempts')
  })
})

describe('reset route', () => {
  it('parses /reset/<token> and round-trips through routePath', () => {
    expect(parseRoute('/reset/otr_abc-DEF_123')).toEqual({ view: 'reset', token: 'otr_abc-DEF_123' })
    expect(routePath({ view: 'reset', token: 'otr_abc' })).toBe('/reset/otr_abc')
    expect(parseRoute('/reset/')).toEqual({ view: 'inbox' })
  })
})
