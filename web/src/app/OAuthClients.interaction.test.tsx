// @vitest-environment happy-dom
// OAuth clients for ChatGPT, Claude and other apps (OpenSpec change
// mcp-oauth-connector-redirects, task 2.1): the App choice sends the platform,
// Other app sends the one exact address typed, and each row names its app.
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { oauthClientApp, type McpOAuthClient, type McpOAuthPlatform } from '../lib/assistants'
import { click, mockFetch, render, type, waitFor } from '../ui/test-utils'
import { OAuthClients } from './OAuthClients'

const platforms: McpOAuthPlatform[] = [
  { id: 'google', name: 'Gemini', redirect_uris: ['https://oauth-redirect.googleusercontent.com/r/', 'https://oauth-redirect.googleusercontent.com/a/'] },
  { id: 'openai', name: 'ChatGPT', redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect', 'https://chatgpt.com/connector/oauth/'] },
  { id: 'anthropic', name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'] },
]

const client = (over: Partial<McpOAuthClient>): McpOAuthClient => ({
  id: 'c1', name: 'x', redirect_uris: [], scope: 'read', dynamic: false, created_by: 'u', created_at: 0, last_used_at: null, secret_set: true, ...over,
})

function serve(clients: McpOAuthClient[]) {
  const posted: Record<string, unknown>[] = []
  mockFetch((method, path, init) => {
    if (path !== '/api/v1/settings/mcp/clients') return undefined
    if (method === 'GET') {
      return { clients, platforms, redirect_uris: [], authorize_url: '', token_url: '', discovery_url: '', metadata_url: '', resource: '' }
    }
    if (method === 'POST') {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      posted.push(body)
      return { client: client({ id: 'new', name: String(body.name) }), secret: 's3cret' }
    }
    return undefined
  })
  return posted
}

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OAuth clients', () => {
  it('creates a ChatGPT client by platform, named after the app unless a name is typed', async () => {
    const posted = serve([])
    const r = await render(<OAuthClients disabled={false} />)
    await waitFor(() => !!r.container.querySelector('[data-oauth-client-app]'), 'the App choice')
    const app = r.container.querySelector<HTMLSelectElement>('[data-oauth-client-app]')!
    expect([...app.options].map((o) => o.textContent)).toEqual(['Gemini', 'ChatGPT', 'Claude', 'Other app'])
    await choose(app, 'openai')
    expect(r.container.querySelector<HTMLInputElement>('[data-oauth-client-name]')!.placeholder).toBe('ChatGPT')
    expect(r.container.querySelector('[data-oauth-client-redirect]')).toBeNull()
    await click(r.container.querySelector('[data-oauth-create]')!)
    await waitFor(() => posted.length === 1, 'the create request')
    expect(posted[0]).toEqual({ name: 'ChatGPT', scope: 'read', platform: 'openai' })
  })

  it('Other app needs the exact address and sends it as the only redirect', async () => {
    const posted = serve([])
    const r = await render(<OAuthClients disabled={false} />)
    await waitFor(() => !!r.container.querySelector('[data-oauth-client-app]'), 'the App choice')
    await choose(r.container.querySelector<HTMLSelectElement>('[data-oauth-client-app]')!, 'custom')
    const field = r.container.querySelector<HTMLInputElement>('[data-oauth-client-redirect]')!
    expect(field).toBeTruthy()
    await click(r.container.querySelector('[data-oauth-create]')!)
    expect(posted).toHaveLength(0)
    expect(r.container.textContent).toContain('Enter the address the app returns to after you sign in.')
    await type(r.container.querySelector<HTMLInputElement>('[data-oauth-client-name]')!, 'Desk')
    await type(field, ' https://assistant.example/oauth/callback ')
    await click(r.container.querySelector('[data-oauth-create]')!)
    await waitFor(() => posted.length === 1, 'the create request')
    expect(posted[0]).toEqual({ name: 'Desk', scope: 'read', redirect_uris: ['https://assistant.example/oauth/callback'] })
  })

  it('names each client by its app, or by its custom address host', async () => {
    serve([
      client({ id: 'a', name: 'Work ChatGPT', redirect_uris: platforms[1].redirect_uris }),
      client({ id: 'b', name: 'Desk', redirect_uris: ['https://assistant.example/cb'] }),
    ])
    const r = await render(<OAuthClients disabled={false} />)
    await waitFor(() => r.container.querySelectorAll('[data-oauth-client-for]').length === 2, 'the client rows')
    expect([...r.container.querySelectorAll('[data-oauth-client-for]')].map((e) => e.textContent)).toEqual(['ChatGPT', 'assistant.example'])
  })
})

describe('oauthClientApp', () => {
  it('needs all of a platform’s addresses and nothing else', () => {
    expect(oauthClientApp({ redirect_uris: platforms[2].redirect_uris }, platforms)).toBe('Claude')
    expect(oauthClientApp({ redirect_uris: [platforms[2].redirect_uris[0]] }, platforms)).toBe('claude.ai')
    expect(oauthClientApp({ redirect_uris: [...platforms[1].redirect_uris, 'https://x.example/cb'] }, platforms)).toBe('chatgpt.com')
    expect(oauthClientApp({ redirect_uris: [] }, platforms)).toBe('')
  })
})
