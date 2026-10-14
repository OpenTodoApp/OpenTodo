// @vitest-environment happy-dom
// settings-redesign D2: /settings/general becomes /settings/preferences in place.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../lib/types'
import { render } from '../ui/test-utils'
import { SettingsView } from './SettingsView'
import { parseRoute } from './router'

vi.mock('./SsoPanel', async (orig) => ({ ...(await orig<typeof import('./SsoPanel')>()), SsoPanel: () => <div /> }))

const member: User = { id: 'u1', email: 'sam@example.com', name: 'Sam', role: 'member', createdAt: 1 }
afterEach(() => vi.restoreAllMocks())

describe('legacy settings address', () => {
  it('replaces /settings/general with /settings/preferences without adding a history entry', async () => {
    history.replaceState(null, '', '/settings/general')
    const replace = vi.spyOn(history, 'replaceState')
    const push = vi.spyOn(history, 'pushState')
    const route = parseRoute(location.pathname)
    expect(route).toEqual({ view: 'settings', section: 'preferences' })
    const { container, unmount } = await render(<SettingsView user={member} onLogout={() => {}} section={route.view === 'settings' ? route.section : undefined} />)
    expect(container.querySelector('h1')?.textContent).toBe('Preferences')
    expect(replace).toHaveBeenCalledWith(null, '', '/settings/preferences')
    expect(push).not.toHaveBeenCalled()
    expect(location.pathname).toBe('/settings/preferences')
    await unmount()
  })
})
