// @vitest-environment happy-dom
// Hosted service (OpenSpec `multi-tenant-host`, design D4): the operator owns
// outgoing email, single sign-on, backups and attachment limits, so their
// panels and search rows are hidden; the owner gets "Download your data".
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setHosted } from '../lib/hosted'
import type { User } from '../lib/types'
import { click, flush, render } from '../ui/test-utils'
import { ServerArchiveView } from './ServerArchivePanel'
import { visibleEntries } from './settingsIndex'
import { SettingsView } from './SettingsView'

const owner: User = { id: 'u1', email: 'owner@example.com', name: 'Owner', role: 'owner', createdAt: 1 }

beforeEach(() => {
  history.replaceState(null, '', '/settings/server')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  setHosted(false)
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('hosted settings', () => {
  it('hides the operator rows from search and adds the download', () => {
    const labels = () => visibleEntries(owner).map((e) => e.label)
    expect(labels()).toEqual(expect.arrayContaining(['Backups', 'Outgoing email', 'Attachments', 'Single sign-on']))
    expect(labels()).not.toContain('Download your data')
    setHosted(true)
    expect(labels()).not.toEqual(expect.arrayContaining(['Backups']))
    for (const l of ['Backups', 'Outgoing email', 'Attachments', 'Single sign-on']) expect(labels()).not.toContain(l)
    expect(labels()).toContain('Download your data')
    expect(labels()).toContain('Audit log')
  })

  it('shows the archive download instead of the operator panels', async () => {
    setHosted(true)
    const r = await render(<SettingsView user={owner} onLogout={() => {}} section="server" />)
    await flush(20)
    // The overview lists Download your data and none of the operator's pages.
    expect([...r.container.querySelectorAll('[data-settings-subpage]')].map((a) => a.getAttribute('data-settings-subpage')))
      .toEqual(['download', 'branding', 'maps', 'automations', 'audit'])
    await r.unmount()
    const download = await render(<SettingsView user={owner} onLogout={() => {}} section="server" page="download" />)
    await flush(20)
    expect(download.container.querySelector('[data-testid="server-archive"]')).not.toBeNull()
    await download.unmount()
    for (const page of ['backups', 'outgoing-email', 'attachments']) {
      const p = await render(<SettingsView user={owner} onLogout={() => {}} section="server" page={page} />)
      await flush(20)
      expect(p.container.querySelector('[data-settings-page]')).toBeNull()
      await p.unmount()
    }
  })

  it('keeps a self-hosted server exactly as before', async () => {
    const r = await render(<SettingsView user={owner} onLogout={() => {}} section="server" page="attachments" />)
    await flush(20)
    expect(r.container.querySelector('[data-testid="server-archive"]')).toBeNull()
    expect(r.container.querySelector('#attachments-settings-heading')).not.toBeNull()
    await r.unmount()
  })

  it('downloads on request, and only online', async () => {
    const onDownload = vi.fn()
    const r = await render(<ServerArchiveView online busy={false} error={null} onDownload={onDownload} />)
    const button = [...r.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Download archive'))!
    await click(button)
    expect(onDownload).toHaveBeenCalledOnce()
    await r.unmount()
    const off = await render(<ServerArchiveView online={false} busy={false} error={null} onDownload={onDownload} />)
    expect([...off.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Download archive'))?.disabled).toBe(true)
    expect(off.container.textContent).toContain('offline')
    await off.unmount()
  })
})
