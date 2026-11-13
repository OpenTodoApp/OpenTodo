// @vitest-environment happy-dom
// The OAuth consent screen (OpenSpec change mcp-oauth, design D5): it names the
// app and what it may do, and only Allow asks the server for a code.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { click, mockFetch, render, waitFor } from '../ui/test-utils'
import { OAuthConsent, OAuthConsentView } from './OAuthConsent'
import { api } from '../lib/api'
import { takeConsentQuery } from './OAuthConsentHost'

afterEach(() => { vi.unstubAllGlobals() })

const dialog = () => document.querySelector<HTMLElement>('[data-testid="oauth-consent"]')
const query = 'client_id=c1&redirect_uri=https%3A%2F%2Foauth-redirect.googleusercontent.com%2Fr%2Fx&response_type=code'

function serve(scope: 'read' | 'agent', posts: unknown[]) {
  mockFetch((method, path, init) => {
    if (path !== '/api/v1/me/mcp-consent') return undefined
    if (method === 'POST') {
      posts.push(JSON.parse(String(init?.body)))
      return { redirect: 'https://oauth-redirect.googleusercontent.com/r/x?code=abc' }
    }
    return { client: { id: 'c1', name: 'Gemini', dynamic: true }, scope, redirectHost: 'oauth-redirect.googleusercontent.com' }
  })
}

describe('OAuthConsent', () => {
  it('names the app, what it may do and where the answer goes', async () => {
    serve('agent', [])
    await render(<OAuthConsent query={query} onDone={() => {}} />)
    await waitFor(() => dialog() !== null, 'the consent dialog')
    const text = dialog()!.textContent ?? ''
    expect(text).toContain('Connect Gemini to your account?')
    expect(text).toContain('create and change them')
    expect(text).toContain('registered itself')
    expect(text).toContain('oauth-redirect.googleusercontent.com')
  })

  it('asks for a code only when the person presses Allow', async () => {
    const posts: unknown[] = []
    serve('read', posts)
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    await render(<OAuthConsent query={query} onDone={() => {}} />)
    await waitFor(() => dialog() !== null, 'the consent dialog')
    expect(posts).toEqual([])
    await click(dialog()!.querySelector('[data-oauth-allow]')!)
    await waitFor(() => assign.mock.calls.length === 1, 'the redirect')
    expect(posts).toEqual([{ query, allow: true }])
    expect(assign).toHaveBeenCalledWith('https://oauth-redirect.googleusercontent.com/r/x?code=abc')
  })

  it('offers the workspaces when there are two or more, and Allow needs one chosen (token-workspaces D5)', async () => {
    const info = { client: { id: 'c1', name: 'Gemini', dynamic: true }, scope: 'agent' as const, redirectHost: 'x' }
    const two = [{ id: 'w-home', name: 'Home' }, { id: 'w-work', name: 'Work' }]
    const one = await render(<OAuthConsentView info={info} busy={false} workspaces={[two[0]]} onAllow={() => {}} onDeny={() => {}} />)
    expect(document.querySelector('[data-token-workspace-choice]')).toBeNull()
    await one.unmount()
    const none = await render(<OAuthConsentView info={info} busy={false} workspaces={two} only={[]} onAllow={() => {}} onDeny={() => {}} />)
    expect(document.querySelector('[data-token-workspace-choice]')).not.toBeNull()
    expect(document.querySelector<HTMLButtonElement>('[data-oauth-allow]')!.disabled).toBe(true)
    await none.unmount()
    await render(<OAuthConsentView info={info} busy={false} workspaces={two} only={['w-work']} onAllow={() => {}} onDeny={() => {}} />)
    expect(document.querySelector<HTMLButtonElement>('[data-oauth-allow]')!.disabled).toBe(false)
  })

  it('sends the chosen workspaces with Allow', async () => {
    const posts: unknown[] = []
    serve('agent', posts)
    await api.answerMcpConsent(query, true, ['w-work'])
    expect(posts).toEqual([{ query, allow: true, workspaces: ['w-work'] }])
  })

  it('takes the request out of the address once', () => {
    window.history.replaceState(null, '', `/?oauth_consent=${encodeURIComponent(query)}`)
    expect(takeConsentQuery()).toBe(query)
    expect(window.location.search).toBe('')
    expect(takeConsentQuery()).toBeNull()
  })
})
