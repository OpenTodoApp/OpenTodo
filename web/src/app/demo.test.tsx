// Demo instance UI (OpenSpec `demo-mode`, `demo-sandboxes`), rendered to static
// markup like the other component tests: sign-in panel, banner, expiry screen,
// Settings and sharing gating, plus the sandbox helpers of lib/demo.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../lib/api'
import { demoBannerText, demoDetailsText, DEMO_LIMIT_NOTICE, expireSandboxIfGone, getDemo, isDemoRestricted, sandboxErrorMessage, setDemo, startSandbox } from '../lib/demo'
import type { AuthStatus, DemoInfo, Project, User } from '../lib/types'
import { DemoBanner, DemoExpiredScreen } from './App'
import { AuthScreen } from './AuthScreen'
import { SettingsView } from './SettingsView'
import { ShareDialog } from './ShareDialog'

const info: DemoInfo = { token: 'tok-1', sandboxHours: { idle: 2, max: 24 }, resetsAt: 1 }
const base: AuthStatus = { setupRequired: false, signupAllowed: false, authenticated: false, user: null, version: 'test' }
const user: User = { id: 'u1', email: 'demo@example.com', name: 'Alex Demo', role: 'member', createdAt: 1 }

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'https://demo.example', search: '', pathname: '/', hash: '' })
})
afterEach(() => {
  setDemo(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sign-in screen', () => {
  it('offers a private sandbox and shows no credentials on a demo instance', () => {
    const html = renderToStaticMarkup(<AuthScreen status={{ ...base, demo: info }} onAuthenticated={() => {}} />)
    expect(html).toContain('data-testid="demo-panel"')
    expect(html).toContain('Try the demo')
    expect(html).toContain('private sandbox')
    expect(html).toContain('2 hours of inactivity')
    // No shared account, no password, no sign-in form.
    expect(html).not.toContain('demo@example.com')
    expect(html).not.toContain('opentodo-demo')
    expect(html).not.toContain('type="password"')
  })

  it('shows nothing of the kind on a normal server', () => {
    const html = renderToStaticMarkup(<AuthScreen status={base} onAuthenticated={() => {}} />)
    expect(html).not.toContain('Try the demo')
    expect(html).not.toContain('demo-panel')
  })
})

describe('banner and state', () => {
  it('reads the idle lifetime from the demo record (lean-chrome D2)', () => {
    expect(demoBannerText(info)).toBe("Demo: private sandbox, deleted after 2 h of inactivity. Don't store anything personal.")
    expect(demoBannerText({ sandboxHours: { idle: 3, max: 24 } })).toBe("Demo: private sandbox, deleted after 3 h of inactivity. Don't store anything personal.")
    expect(demoDetailsText({ sandboxHours: { idle: 3, max: 12 }, resetsAt: 0 })).toBe("This demo sandbox is private to you. It is deleted after 3 hours of inactivity, 12 hours after it was created at the latest, and at the nightly reset. Don't store anything personal.")
    setDemo({ ...info, sandboxHours: { idle: 3, max: 24 } })
    const html = renderToStaticMarkup(<DemoBanner />)
    expect(html).toContain('Demo: private sandbox, deleted after 3 h of inactivity.')
    expect(html).toContain('role="status"')
    expect(html).toContain('data-testid="demo-banner"')
    expect(html).not.toContain('demo-limit')
  })

  it('shows the write-limit notice when the sandbox used its budget', () => {
    const html = renderToStaticMarkup(<DemoBanner notice={DEMO_LIMIT_NOTICE} />)
    expect(html).toContain('data-testid="demo-limit"')
    expect(html).toContain('reached its limit')
  })

  it('records and clears the demo state without keeping the single-use token', () => {
    setDemo(info)
    expect(getDemo()).toEqual({ ...info, token: '' })
    setDemo(undefined)
    expect(getDemo()).toBeNull()
  })

  it('recognises the refusal error', () => {
    expect(isDemoRestricted(new ApiError(403, 'demo_restricted', 'Import is disabled on this demo instance.'))).toBe(true)
    expect(isDemoRestricted(new ApiError(403, 'forbidden', 'no'))).toBe(false)
    expect(isDemoRestricted(null)).toBe(false)
  })
})

describe('sandbox creation', () => {
  it('posts the page token and signs in', async () => {
    const create = vi.spyOn(api, 'demoSandbox').mockResolvedValue({ user })
    await expect(startSandbox('tok-1')).resolves.toEqual(user)
    expect(create).toHaveBeenCalledWith('tok-1')
  })

  it('retries once with a fresh token when the page token is stale', async () => {
    const create = vi.spyOn(api, 'demoSandbox')
      .mockRejectedValueOnce(new ApiError(403, 'demo_token', 'expired'))
      .mockResolvedValueOnce({ user })
    vi.spyOn(api, 'authStatus').mockResolvedValue({ ...base, demo: { ...info, token: 'tok-2' } })
    await expect(startSandbox('tok-1')).resolves.toEqual(user)
    expect(create).toHaveBeenLastCalledWith('tok-2')
  })

  it('explains a busy demo, a rate limit and a stale page', () => {
    expect(sandboxErrorMessage(new ApiError(503, 'demo_busy', 'x'))).toBe('The demo is busy, try again in a few minutes.')
    expect(sandboxErrorMessage(new ApiError(429, 'rate_limited', 'x'))).toContain('Too many new sandboxes')
    expect(sandboxErrorMessage(new ApiError(403, 'demo_token', 'x'))).toContain('Reload')
    expect(sandboxErrorMessage(new TypeError('fetch failed'))).toContain('could not be reached')
  })
})

describe('expired sandbox', () => {
  it('clears the local data of a device whose sandbox is gone', async () => {
    const clear = vi.fn(async () => {})
    await expect(expireSandboxIfGone({ demo: info, authenticated: false }, true, clear)).resolves.toBe(true)
    expect(clear).toHaveBeenCalledOnce()
  })

  it('leaves everything alone for a first visit, a live session or a normal server', async () => {
    const clear = vi.fn(async () => {})
    await expect(expireSandboxIfGone({ demo: info, authenticated: false }, false, clear)).resolves.toBe(false)
    await expect(expireSandboxIfGone({ demo: info, authenticated: true }, true, clear)).resolves.toBe(false)
    await expect(expireSandboxIfGone({ authenticated: false }, true, clear)).resolves.toBe(false)
    expect(clear).not.toHaveBeenCalled()
  })

  it('shows the expiry screen with a way to start again', () => {
    const html = renderToStaticMarkup(<DemoExpiredScreen onStarted={() => {}} />)
    expect(html).toContain('Your demo sandbox has expired')
    expect(html).toContain('Start a new sandbox')
  })
})

describe('Settings', () => {
  it('shows every card on a demo instance, disabling the refused ones under one note, and disables Import', () => {
    setDemo(info)
    const page = (section: 'account' | 'general' | 'data') => renderToStaticMarkup(<SettingsView user={user} onLogout={() => {}} section={section} />)
    const account = page('account')
    expect(account.match(/data-testid="demo-restricted"/g)).toHaveLength(1)
    expect(account).toContain('id="password-heading"')
    expect(account).toMatch(/<fieldset disabled=""[^>]*data-demo-disabled/)
    const data = page('data')
    expect(data).toMatch(/<button[^>]*disabled=""[^>]*>Import data<\/button>/)
    expect(data).toContain('Import: Disabled on this demo instance.')
    expect(data).not.toContain('href="/settings/import"')
    // Local preferences and the export keep working.
    expect(data).toContain('Download export (JSON)')
    expect(page('general')).toContain('Vim keybindings')
    expect(page('general')).not.toContain('demo-restricted')
  })

  it('shows every section without the note on a normal server', () => {
    const account = renderToStaticMarkup(<SettingsView user={user} onLogout={() => {}} section="account" />)
    expect(account).not.toContain('demo-restricted')
    expect(account).not.toContain('data-demo-disabled')
    expect(account).toContain('id="password-heading"')
    expect(renderToStaticMarkup(<SettingsView user={user} onLogout={() => {}} section="data" />)).toContain('href="/settings/import"')
  })
})

describe('Share dialog', () => {
  const project = { id: 'p1', name: 'Home renovation' } as Project
  const membership = {
    projectId: 'p1', role: 'owner' as const, ownerId: 'u1',
    members: [
      { userId: 'u1', name: 'Alex Demo', email: 'sandbox-1@demo.invalid', role: 'owner' as const },
      { userId: 'u2', name: 'Sam Rivera', email: 'collab-1@demo.invalid', role: 'editor' as const },
    ],
  }

  it('lists members without any membership control on a demo instance', () => {
    setDemo(info)
    const html = renderToStaticMarkup(<ShareDialog project={project} userId="u1" cached={membership} onClose={() => {}} />)
    expect(html).toContain('Sam Rivera')
    expect(html).toContain('Sharing changes: Disabled on this demo instance.')
    expect(html).not.toContain('>Share</button>')
    expect(html).not.toContain('Make owner: Sam Rivera')
    expect(html).not.toContain('Remove Sam Rivera')
  })

  it('keeps the controls on a normal server', () => {
    const html = renderToStaticMarkup(<ShareDialog project={project} userId="u1" cached={membership} onClose={() => {}} />)
    expect(html).toContain('>Share</button>')
    expect(html).toContain('Remove Sam Rivera')
  })
})
