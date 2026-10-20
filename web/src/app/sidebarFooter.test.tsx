// @vitest-environment happy-dom
// The sidebar footer is one row (OpenSpec change quiet-sidebar, design D5, app-shell
// "Compact sidebar on a desktop"): the account menu (Settings, Help, Keyboard
// shortcuts, Sign out), the assistant, notifications, the sync dot and collapse.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { click, flush, key, render, spokenText, type, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'
import { Sidebar } from './Sidebar'
import { SidebarFooter } from './SidebarFooter'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const long = { ...user, name: 'Alexandra Konstantinopoulou' } as User

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
})
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); resetPanel() })

const account = (root: ParentNode = document) => root.querySelector<HTMLButtonElement>('[data-account-menu]')!
const items = () => [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')]

describe('one footer row', () => {
  it('Footer names: the account menu button is the name; each icon has its name; the menu items carry their shortcuts', async () => {
    const r = await render(<SidebarFooter route={{ view: 'inbox' }} user={user} collapsed={false} onShortcuts={() => {}} onAssistant={() => {}} onToggleCollapse={() => {}} onSignOut={() => {}} />)
    await flush(50)
    const row = r.container.querySelector('[data-footer-icons]')!
    expect(r.container.querySelectorAll('[data-footer-icons]')).toHaveLength(1)
    expect(account(row).getAttribute('aria-label')).toBeNull()
    expect(spokenText(account(row))).toBe('Ada')
    expect(account(row).getAttribute('aria-haspopup')).toBe('menu')
    const names = [...row.querySelectorAll('button')].slice(1).map((b) => b.getAttribute('aria-label') ?? '')
    expect(names[0]).toBe('Assistant')
    expect(names[1]).toBe('Notifications')
    expect(names[2]).toMatch(/^(Synced|Offline|Syncing)/)
    expect(names[3]).toBe('Collapse sidebar')
    await click(account(row))
    await waitFor(() => items().length > 0)
    expect(items().map((b) => b.getAttribute('data-menu-label'))).toEqual(['Settings', 'Help', 'Keyboard shortcuts', 'Sign out'])
    expect(items().map((b) => b.getAttribute('aria-keyshortcuts'))).toEqual(['g s', 'g ?', '?', null])
    expect(document.querySelector('[data-help-button]')).not.toBeNull()
    expect(document.querySelector('[data-shortcuts-button]')).not.toBeNull()
    expect(document.querySelector('[role="menu"] [role="separator"]')).not.toBeNull()
    await r.unmount()
  })

  it('the account control is current while Settings, Import or Help is open', async () => {
    for (const view of ['settings', 'import', 'help', 'inbox'] as const) {
      const r = await render(<SidebarFooter route={{ view } as never} user={user} collapsed={false} />)
      expect(account(r.container).getAttribute('aria-current')).toBe(view === 'inbox' ? null : 'page')
      await r.unmount()
    }
  })

  it('Narrow sidebar: a long name truncates, every icon button stays at least 32 px, nothing wraps', async () => {
    const r = await render(<div style={{ width: '15rem' }}><SidebarFooter route={{ view: 'inbox' }} user={long} collapsed={false} onAssistant={() => {}} onToggleCollapse={() => {}} /></div>)
    await flush(50)
    const row = r.container.querySelector('[data-footer-icons]')!
    expect(row.className).not.toContain('flex-wrap')
    expect(row.className).not.toContain('flex-col')
    expect(account(row).className).toContain('min-w-0')
    expect(account(row).querySelector('.truncate')?.textContent).toBe('Alexandra Konstantinopoulou')
    for (const b of [...row.querySelectorAll('button.ui-btn--icon')]) expect(b.className).toMatch(/ui-btn--(sm|md)/)
    await r.unmount()
  })

  it('the icon rail stacks the avatar, the bell, the sync dot, Search and collapse; the name is the tooltip', async () => {
    const r = await render(<SidebarFooter route={{ view: 'inbox' }} user={user} collapsed onSearch={() => {}} onToggleCollapse={() => {}} />)
    await flush(50)
    const row = r.container.querySelector('[data-footer-icons]')!
    expect(row.className).toContain('flex-col')
    expect(account(row).getAttribute('aria-label')).toBe('Account menu for Ada')
    expect(row.querySelector('[data-palette-button]')).not.toBeNull()
    expect(row.querySelector('[data-notifications]')).not.toBeNull()
    await r.unmount()
  })
})

describe('Help and sign out from the account menu', () => {
  it('Help from the account menu, g ? and the palette all open Help', async () => {
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!account())
    await click(account())
    await waitFor(() => items().length > 0)
    await click(document.querySelector<HTMLElement>('[data-help-button]')!)
    await waitFor(() => location.pathname === '/help')
    expect(account().getAttribute('aria-current')).toBe('page')
    navigate({ view: 'inbox' })
    await waitFor(() => location.pathname !== '/help')
    await flush(50)
    ;(document.activeElement as HTMLElement | null)?.blur()
    await key(document.body, 'g')
    await key(document.body, '?', { shiftKey: true })
    await waitFor(() => location.pathname === '/help')
    navigate({ view: 'inbox' })
    await waitFor(() => location.pathname !== '/help')
    await click(document.querySelector<HTMLElement>('[data-palette-button]')!)
    const input = await (async () => { await waitFor(() => !!document.querySelector('[role="dialog"] input')); return document.querySelector<HTMLInputElement>('[role="dialog"] input')! })()
    await type(input, 'Open Help')
    await flush(50)
    await key(input, 'Enter')
    await waitFor(() => location.pathname === '/help')
    await r.unmount()
  })

  it('Sign out from the sidebar: the confirmation opens on Cancel, Escape returns to the account control, confirming signs out', async () => {
    const out = vi.fn()
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} onSignOut={out} />)
    await flush(50)
    await click(account(r.container))
    await waitFor(() => items().length > 0)
    await click(document.querySelector<HTMLElement>('[data-sign-out-button]')!)
    await waitFor(() => !!document.querySelector('[data-testid="confirm-dialog"]'))
    expect(document.querySelector('[data-testid="confirm-dialog"]')!.textContent).toContain('Sign out of this device?')
    await waitFor(() => document.activeElement?.textContent === 'Cancel')
    await key(document.activeElement!, 'Escape')
    await waitFor(() => !document.querySelector('[data-testid="confirm-dialog"]'))
    await waitFor(() => document.activeElement === account(r.container))
    expect(out).not.toHaveBeenCalled()
    await click(account(r.container))
    await waitFor(() => items().length > 0)
    await click(document.querySelector<HTMLElement>('[data-sign-out-button]')!)
    await waitFor(() => !!document.querySelector('[data-testid="confirm-dialog"]'))
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="confirm-dialog"] button')].find((b) => b.textContent === 'Sign out')!
    await click(confirm)
    await waitFor(() => out.mock.calls.length === 1)
    await r.unmount()
  })
})
