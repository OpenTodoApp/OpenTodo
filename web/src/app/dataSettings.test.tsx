// Settings → Data (settings-redesign 6.1): export, import, sync summary and the owner's link to Backups.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { YourDataView } from './DataSettings'

const idle = { state: 'idle' as const, pending: 0, lastSyncedAt: null, error: null }
const render = (over: Partial<Parameters<typeof YourDataView>[0]> = {}) =>
  renderToStaticMarkup(<YourDataView demo={false} isOwner={false} sync={idle} {...over} />)

describe('YourDataView', () => {
  it('shows export and import rows with the help link', () => {
    const html = render()
    expect(html).toContain('id="data-heading"')
    expect(html).toContain('data-help-screen="settings/data"')
    expect(html).toContain('href="/api/v1/export"')
    expect(html).toContain('Download export (JSON)')
    expect(html).toContain('href="/settings/import"')
    expect(html).not.toContain('backups-link')
  })
  it('summarises sync with a badge and what is waiting', () => {
    expect(render()).toMatch(/data-hue="green"[^>]*><span[^>]*>Up to date<\/span>/)
    const waiting = render({ sync: { ...idle, state: 'offline', pending: 3 } })
    expect(waiting).toContain('Offline')
    expect(waiting).toContain('3 change(s) waiting to upload.')
    const failed = render({ sync: { ...idle, state: 'error', error: 'The server answered 500.' } })
    expect(failed).toContain('role="alert"')
    expect(failed).toContain('The server answered 500.')
  })
  it('links the owner to Backups', () => {
    const html = render({ isOwner: true })
    expect(html).toContain('data-testid="backups-link"')
    expect(html).toContain('href="/settings/backups"')
  })
  it('disables import on a demo instance with the exact note', () => {
    const html = render({ demo: true })
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Import data…<\/button>/)
    expect(html).toContain('Import: Disabled on this demo instance.')
    expect(html).not.toContain('href="/settings/import"')
  })
})
