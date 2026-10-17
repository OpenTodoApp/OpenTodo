// Settings → API tokens without a DOM: the pure TokensView is rendered to static
// markup, and the API client is checked for the scope it sends.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { scopeLabel, type ApiToken } from '../lib/assistants'
import { TokensView, type TokensViewProps } from './TokensSection'

const noop = () => {}

function render(over: Partial<TokensViewProps> = {}) {
  const props: TokensViewProps = {
    tokens: [], name: '', scope: 'full', secret: null, error: null,
    onNameChange: noop, onScopeChange: noop, onCreate: noop, onRevoke: noop, ...over,
  }
  return renderToStaticMarkup(<TokensView {...props} />)
}

const token = (over: Partial<ApiToken> = {}): ApiToken => ({ id: 't1', name: 'laptop CLI', scope: 'full', createdAt: 1, lastUsedAt: null, ...over })

describe('TokensView', () => {
  it('offers a scope choice in the New token dialog, with full access preselected', () => {
    expect(render()).not.toContain('aria-label="Token scope"')
    const html = render({ creating: true })
    expect(html).toContain('aria-label="Token scope"')
    expect(html).toMatch(/<option value="full" selected="">Full access<\/option>/)
    expect(html).toContain('<option value="read">Read-only</option>')
    expect(html).toContain('<option value="agent">AI assistant, can make changes</option>')
    expect(html).toContain('only while the server owner and you allow assistant changes')
    expect(render({ creating: true, scope: 'read' })).toMatch(/<option value="read" selected="">Read-only<\/option>/)
  })

  it('offers the admin scope with a warning shown only while it is chosen (route-authorization-policy)', () => {
    const html = render({ creating: true })
    expect(html).toContain('<option value="admin">Admin: full access plus credentials and administration</option>')
    expect(html).toContain('except managing sign-in credentials and administration')
    expect(html).not.toContain('An admin token can turn off two-factor authentication')
    const admin = render({ creating: true, scope: 'admin' })
    expect(admin).toMatch(/<option value="admin" selected="">/)
    expect(admin).toContain('An admin token can turn off two-factor authentication')
    expect(render({ tokens: [token({ scope: 'admin' })] })).toContain('>admin<')
  })

  it('labels each token with its scope; tokens from before scopes read as full', () => {
    const html = render({ tokens: [token(), token({ id: 't2', name: 'assistant', scope: 'read' }), token({ id: 't3', name: 'old', scope: undefined }),
      token({ id: 't4', name: 'desk', scope: 'agent' })] })
    expect((html.match(/>assistant, can make changes</g) ?? []).length).toBe(1)
    expect((html.match(/>read-only</g) ?? []).length).toBe(1)
    expect((html.match(/>full access</g) ?? []).length).toBe(2)
    expect(html).toContain('aria-label="Actions for assistant"')
    expect(html).toContain('New token')
  })

  it('shows the secret once in the dialog, with copy, and the empty state', () => {
    const shown = render({ creating: true, secret: 'ot_secret123' })
    expect(shown).toContain('ot_secret123')
    expect(shown).toContain('will not be shown again')
    expect(shown).toContain('>Copy<')
    expect(render()).not.toContain('ot_')
    const empty = render()
    expect(empty).toContain('No API tokens yet')
    expect(empty).toContain('without your password')
    expect(empty).toContain('New token')
  })

  it('maps scopes to labels', () => {
    expect(scopeLabel('read')).toBe('read-only')
    expect(scopeLabel('full')).toBe('full access')
    expect(scopeLabel(undefined)).toBe('full access')
    expect(scopeLabel('agent')).toBe('assistant, can make changes')
    expect(scopeLabel('admin')).toBe('admin')
  })
})

describe('api.createToken', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the scope only when one is chosen', async () => {
    const bodies: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ token: token({ scope: 'read' }), secret: 'ot_x' }), { status: 201, headers: { 'Content-Type': 'application/json' } })
    }))
    await api.createToken('assistant', 'read')
    await api.createToken('cli')
    expect(bodies).toEqual([{ name: 'assistant', scope: 'read' }, { name: 'cli' }])
  })
})
