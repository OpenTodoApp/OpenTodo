// Demo instance UI (OpenSpec `demo-mode`), rendered to static markup like the
// other component tests: sign-in panel, banner, Settings and sharing gating.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api'
import { DEMO_BANNER, getDemo, isDemoRestricted, setDemo } from '../lib/demo'
import type { AuthStatus, DemoInfo, Project, User } from '../lib/types'
import { DemoBanner } from './App'
import { AuthScreen } from './AuthScreen'
import { SettingsView } from './SettingsView'
import { ShareDialog } from './ShareDialog'

const info: DemoInfo = { email: 'demo@example.com', password: 'opentodo-demo', resetsAt: 1 }
const base: AuthStatus = { setupRequired: false, signupAllowed: false, authenticated: false, user: null, version: 'test' }
const user: User = { id: 'u1', email: 'demo@example.com', name: 'Alex Demo', role: 'member', createdAt: 1 }

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'https://demo.example', search: '', pathname: '/', hash: '' })
})
afterEach(() => {
  setDemo(null)
  vi.unstubAllGlobals()
})

describe('sign-in screen', () => {
  it('shows the demo credentials and a one-click sign-in on a demo instance', () => {
    const html = renderToStaticMarkup(<AuthScreen status={{ ...base, demo: info }} onAuthenticated={() => {}} />)
    expect(html).toContain('data-testid="demo-panel"')
    expect(html).toContain('demo@example.com')
    expect(html).toContain('opentodo-demo')
    expect(html).toContain('Try the demo')
  })

  it('shows nothing of the kind on a normal server', () => {
    const html = renderToStaticMarkup(<AuthScreen status={base} onAuthenticated={() => {}} />)
    expect(html).not.toContain('Try the demo')
    expect(html).not.toContain('demo-panel')
  })
})

describe('banner and state', () => {
  it('uses the fixed banner text', () => {
    expect(renderToStaticMarkup(<DemoBanner />)).toContain('Demo instance — data resets every night, don&#x27;t store anything private.')
    expect(DEMO_BANNER).toBe("Demo instance — data resets every night, don't store anything private.")
  })

  it('records and clears the demo state', () => {
    setDemo(info)
    expect(getDemo()).toEqual(info)
    setDemo(undefined)
    expect(getDemo()).toBeNull()
  })

  it('recognises the refusal error', () => {
    expect(isDemoRestricted(new ApiError(403, 'demo_restricted', 'Import is disabled on this demo instance.'))).toBe(true)
    expect(isDemoRestricted(new ApiError(403, 'forbidden', 'no'))).toBe(false)
    expect(isDemoRestricted(null)).toBe(false)
  })
})

describe('Settings', () => {
  it('replaces restricted sections with a note and disables Import on a demo instance', () => {
    setDemo(info)
    const html = renderToStaticMarkup(<SettingsView user={user} onLogout={() => {}} />)
    expect(html).toContain('data-testid="demo-restricted"')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Import data…<\/button>/)
    expect(html).toContain('Import: Disabled on this demo instance.')
    expect(html).not.toContain('id="password-heading"')
    expect(html).not.toContain('href="/settings/import"')
    // Local preferences and the export keep working.
    expect(html).toContain('Download export (JSON)')
    expect(html).toContain('Vim keybindings')
  })

  it('shows every section on a normal server', () => {
    const html = renderToStaticMarkup(<SettingsView user={user} onLogout={() => {}} />)
    expect(html).not.toContain('demo-restricted')
    expect(html).toContain('id="password-heading"')
    expect(html).toContain('href="/settings/import"')
  })
})

describe('Share dialog', () => {
  const project = { id: 'p1', name: 'Home renovation' } as Project
  const membership = {
    projectId: 'p1', role: 'owner' as const, ownerId: 'u1',
    members: [
      { userId: 'u1', name: 'Alex Demo', email: 'demo@example.com', role: 'owner' as const },
      { userId: 'u2', name: 'Sam Rivera', email: 'sam@example.com', role: 'editor' as const },
    ],
  }

  it('lists members without any membership control on a demo instance', () => {
    setDemo(info)
    const html = renderToStaticMarkup(<ShareDialog project={project} userId="u1" cached={membership} onClose={() => {}} />)
    expect(html).toContain('Sam Rivera')
    expect(html).toContain('Sharing changes: Disabled on this demo instance.')
    expect(html).not.toContain('>Share</button>')
    expect(html).not.toContain('Make Sam Rivera the owner')
    expect(html).not.toContain('Remove Sam Rivera')
  })

  it('keeps the controls on a normal server', () => {
    const html = renderToStaticMarkup(<ShareDialog project={project} userId="u1" cached={membership} onClose={() => {}} />)
    expect(html).toContain('>Share</button>')
    expect(html).toContain('Remove Sam Rivera')
  })
})
