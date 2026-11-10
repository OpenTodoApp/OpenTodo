// @vitest-environment happy-dom
// The brand line at the sidebar's end (OpenSpec change sidebar-brand-and-row-grid, design
// D1; app-shell "Brand line in the sidebar footer", instance-branding): the mark, the
// name and the version, opening Settings › About, with the What's new dot while unread.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBranding } from '../lib/branding'
import { db } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import { lastServerVersion, rememberServerVersion } from '../lib/serverVersion'
import { newsSeen } from '../lib/whatsNew'
import type { User } from '../lib/types'
import { click, render, visibleText, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { parseRoute } from './router'
import { Sidebar } from './Sidebar'
import { SidebarFooter } from './SidebarFooter'

vi.mock('../generated/newsIndex.json', () => ({ default: { latest: '0.22.0', versions: ['0.22.0'] } }))

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const line = (root: ParentNode) => root.querySelector<HTMLButtonElement>('[data-brand-line]')!

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  setBranding(undefined)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
})
afterEach(() => { vi.unstubAllGlobals(); setBranding(undefined); resetPanel() })

describe('the brand line', () => {
  it('Unbranded: the mark and "OpenTodo 0.22.0" in the faint tone under the account row; it opens Settings › About', async () => {
    newsSeen.set('0.22.0')
    rememberServerVersion('0.22.0')
    const r = await render(<SidebarFooter route={{ view: 'inbox' }} user={user} collapsed={false} />)
    await waitFor(() => !!line(r.container), 'the brand line')
    const footer = r.container.querySelector('[data-sidebar-footer]')!
    // Under the footer row, as the sidebar's last line.
    const children = [...footer.children].filter((c) => !c.classList.contains('sr-only'))
    expect(children.indexOf(line(r.container))).toBeGreaterThan(children.indexOf(footer.querySelector('[data-footer-icons]')!))
    expect(line(r.container).querySelector('[data-brand-mark]')).not.toBeNull()
    expect(visibleText(line(r.container))).toBe('OpenTodo 0.22.0')
    expect(line(r.container).className).toContain('text-faint')
    expect(line(r.container).className).toContain('hover:text-muted')
    expect(line(r.container).querySelector('[data-news-dot]')).toBeNull()
    await click(line(r.container))
    expect(parseRoute(location.pathname)).toMatchObject({ view: 'settings', section: 'about' })
    await r.unmount()
  })

  it('Offline: the version the device last received stays', async () => {
    newsSeen.set('0.22.0')
    lastServerVersion.set('0.21.3')
    const r = await render(<SidebarFooter route={{ view: 'inbox' }} user={user} collapsed={false} />)
    await waitFor(() => !!line(r.container))
    expect(visibleText(line(r.container))).toBe('OpenTodo 0.21.3')
    // No request of its own.
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    await r.unmount()
  })

  it('Branded: the logo and "Acme Tasks 0.22.0" in the line, the workspace picture in the header', async () => {
    newsSeen.set('0.22.0')
    rememberServerVersion('0.22.0')
    setBranding({ name: 'Acme Tasks', logoVersion: 2 })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} onSearch={() => {}} />)
    await waitFor(() => !!line(r.container))
    expect(visibleText(line(r.container))).toBe('Acme Tasks 0.22.0')
    expect(line(r.container).querySelector('img[data-instance-logo]')!.getAttribute('src')).toBe('/branding/logo-32.png?v=2')
    const header = r.container.querySelector('[data-sidebar-header]')!
    expect(header.querySelector('[data-workspace-mark]')).not.toBeNull()
    expect(header.querySelector('img')).toBeNull()
    expect(visibleText(header)).not.toContain('Acme Tasks')
    await r.unmount()
  })

  it('Unread news: the accent dot, said in the name, gone once What\'s new is read', async () => {
    rememberServerVersion('0.22.0')
    const r = await render(<SidebarFooter route={{ view: 'inbox' }} user={user} collapsed={false} />)
    await waitFor(() => !!line(r.container)?.querySelector('[data-news-dot]'), 'the dot')
    expect(line(r.container).getAttribute('aria-label')).toBe('OpenTodo 0.22.0, new notes')
    newsSeen.set('0.22.0')
    await waitFor(() => !line(r.container).querySelector('[data-news-dot]'), 'the dot leaves')
    await r.unmount()
  })

  it('Rail: the mark alone, the name and version in its accessible name', async () => {
    newsSeen.set('0.22.0')
    rememberServerVersion('0.22.0')
    const r = await render(<SidebarFooter route={{ view: 'inbox' }} user={user} collapsed />)
    await waitFor(() => !!line(r.container))
    expect(line(r.container).querySelector('[data-brand-text]')).toBeNull()
    expect(line(r.container).getAttribute('aria-label')).toBe('OpenTodo 0.22.0')
    await r.unmount()
  })
})
