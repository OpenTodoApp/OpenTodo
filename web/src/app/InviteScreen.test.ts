// Component test without a DOM: the pure InviteView renders every state to
// static markup, which is enough to assert what each visitor sees.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { InviteView, type InviteState } from './InviteScreen'
import { parseRoute, routePath } from './router'
import type { User } from '../lib/types'

const noop = () => {}
const render = (state: InviteState, user: User | null = null) =>
  renderToStaticMarkup(createElement(InviteView, { state, user, form: createElement('form', { id: 'accept' }), onRetry: noop, onLogout: noop }))

const owner: User = { id: 'u1', email: 'owner@example.com', name: 'Owner', role: 'owner', createdAt: 0 }

describe('InviteView', () => {
  it('asks a signed-in visitor to sign out first instead of attaching the invitation', () => {
    const html = render({ kind: 'ready', preview: { inviterName: 'Owner', email: null, expiresAt: 1 } }, owner)
    expect(html).toContain('already signed in')
    expect(html).toContain('Sign out and continue')
    expect(html).toContain('Owner')
    expect(html).not.toContain('id="accept"')
  })

  it('shows a retry message while offline and no form', () => {
    const html = render({ kind: 'offline' })
    expect(html).toContain('offline')
    expect(html).toContain('Retry now')
    expect(html).not.toContain('id="accept"')
  })

  it('explains an invalid link and links to sign-in without a form', () => {
    const html = render({ kind: 'invalid' })
    expect(html).toContain('no longer valid')
    expect(html).toContain('href="/"')
    expect(html).not.toContain('id="accept"')
  })

  it('renders the registration form once the preview is ready', () => {
    const html = render({ kind: 'ready', preview: { inviterName: 'Owner', email: 'a@example.com', expiresAt: 1 } })
    expect(html).toContain('id="accept"')
  })

  it('tells the visitor to wait when rate limited', () => {
    expect(render({ kind: 'rate-limited' })).toContain('Too many attempts')
  })
})

describe('invite route', () => {
  it('parses /invite/<token> and round-trips through routePath', () => {
    expect(parseRoute('/invite/oti_abc-DEF_123')).toEqual({ view: 'invite', token: 'oti_abc-DEF_123' })
    expect(routePath({ view: 'invite', token: 'oti_abc' })).toBe('/invite/oti_abc')
    expect(parseRoute('/invite/')).toEqual({ view: 'inbox' })
  })
})
