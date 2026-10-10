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
  it('offers a scope choice with full access preselected', () => {
    const html = render()
    expect(html).toContain('aria-label="Token scope"')
    expect(html).toMatch(/<option value="full" selected="">Full access<\/option>/)
    expect(html).toContain('<option value="read">Read-only</option>')
    expect(render({ scope: 'read' })).toMatch(/<option value="read" selected="">Read-only<\/option>/)
  })

  it('labels each token with its scope; tokens from before scopes read as full', () => {
    const html = render({ tokens: [token(), token({ id: 't2', name: 'assistant', scope: 'read' }), token({ id: 't3', name: 'old', scope: undefined })] })
    expect(html).toContain('assistant')
    expect((html.match(/>read-only</g) ?? []).length).toBe(1)
    expect((html.match(/>full access</g) ?? []).length).toBe(2)
    expect(html).toContain('aria-label="Revoke assistant"')
  })

  it('shows the secret once and the empty state', () => {
    expect(render({ secret: 'ot_secret123' })).toContain('ot_secret123')
    expect(render()).not.toContain('ot_')
    expect(render()).toContain('No tokens yet.')
  })

  it('maps scopes to labels', () => {
    expect(scopeLabel('read')).toBe('read-only')
    expect(scopeLabel('full')).toBe('full access')
    expect(scopeLabel(undefined)).toBe('full access')
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
