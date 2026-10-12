// Server configuration warnings (OpenSpec `trusted-proxies-lenient`): the owner's
// notice on the Settings overview and Administration; nobody else sees it.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import type { ConfigWarning, User } from '../lib/types'
import { ConfigWarningList, loadConfigWarnings } from './ConfigWarnings'

const owner: User = { id: 'u1', email: 'o@example.com', name: 'O', role: 'owner', createdAt: 1 }
const admin: User = { ...owner, id: 'u2', role: 'admin' }
const member: User = { ...owner, id: 'u3', role: 'member' }
const warning: ConfigWarning = {
  variable: 'OPENTODO_TRUSTED_PROXIES',
  message: '"cloudflar" is not a valid entry and is ignored (did you mean "cloudflare"?). Fix the value in the server\'s environment and restart it.',
  ignored: ['cloudflar'],
}

afterEach(() => vi.restoreAllMocks())

describe('config warnings notice', () => {
  it('names the variable, the ignored value and the fix', () => {
    const html = renderToStaticMarkup(<ConfigWarningList warnings={[warning]} />)
    expect(html).toContain('data-testid="config-warnings"')
    expect(html).toContain('Server configuration warning<')
    expect(html).toContain('OPENTODO_TRUSTED_PROXIES')
    expect(html).toContain('cloudflar')
    expect(html).toContain('did you mean')
    expect(html).toContain('restart')
  })

  it('renders nothing without warnings', () => {
    expect(renderToStaticMarkup(<ConfigWarningList warnings={[]} />)).toBe('')
  })

  it('loads warnings for the owner only, and degrades to none', async () => {
    const me = vi.spyOn(api, 'me').mockResolvedValue({ user: owner, mfa: {} as never, config_warnings: [warning] })
    expect(await loadConfigWarnings(owner)).toEqual([warning])
    expect(await loadConfigWarnings(admin)).toEqual([])
    expect(await loadConfigWarnings(member)).toEqual([])
    expect(me).toHaveBeenCalledTimes(1)
    me.mockResolvedValue({ user: owner, mfa: {} as never })
    expect(await loadConfigWarnings(owner)).toEqual([])
    me.mockRejectedValue(new Error('offline'))
    expect(await loadConfigWarnings(owner)).toEqual([])
  })
})
