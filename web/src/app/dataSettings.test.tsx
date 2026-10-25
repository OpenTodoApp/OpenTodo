// Settings → Data (settings-redesign 6.1): export, import, sync summary and the owner's link to Backups.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { YourDataView } from './DataSettings'

/** The card's markup without its Learn more link, the one help link a card may carry (settings-copy D3). */
const withoutLearnMore = (html: string) => html.replace(/<button[^>]*data-learn-more[^>]*>Learn more<\/button>/g, '')


const idle = { state: 'idle' as const, pending: 0, lastSyncedAt: null, error: null }
const render = (over: Partial<Parameters<typeof YourDataView>[0]> = {}) =>
  renderToStaticMarkup(<YourDataView demo={false} isOwner={false} sync={idle} {...over} />)

describe('YourDataView', () => {
  it('shows export and import rows with the help link', () => {
    const html = render()
    expect(html).toContain('id="data-heading"')
    expect(withoutLearnMore(html)).not.toContain('data-help-screen')
    expect(html).toContain('href="/api/v1/export"')
    expect(html).toContain('Download export (JSON)')
    expect(html).toContain('href="/settings/import"')
    expect(html).not.toContain('backups-link')
  })
  it('summarises sync with a badge and what is waiting', () => {
    expect(render()).toMatch(/data-status="ok"[^>]*><span[^>]*><\/span><span[^>]*>Up to date<\/span>/)
    const waiting = render({ sync: { ...idle, state: 'offline', pending: 3 } })
    expect(waiting).toContain('Offline')
    expect(waiting).toContain('3 changes waiting to upload.')
    const failed = render({ sync: { ...idle, state: 'error', error: 'The server answered 500.' } })
    expect(failed).toContain('role="alert"')
    expect(failed).toContain('The server answered 500.')
  })
  it('links the owner to Backups', () => {
    const html = render({ isOwner: true })
    expect(html).toContain('data-testid="backups-link"')
    expect(html).toContain('href="/settings/server/backups"')
  })
  it('disables import on a demo instance with the exact note', () => {
    const html = render({ demo: true })
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Import data<\/button>/)
    expect(html).toContain('Import: Disabled on this demo instance.')
    expect(html).not.toContain('href="/settings/import"')
  })
  it('shows attachment usage with the per-file limit and offers the ZIP export', () => {
    const MB = 1 << 20
    const html = render({ attachments: { enabled: true, used_bytes: 230 * MB, quota_bytes: 1024 * MB, max_file_bytes: 25 * MB } })
    expect(html).toContain('230 MB of 1 GB used')
    expect(html).toContain('up to 25 MB each')
    expect(html).toContain('href="/api/v1/export?format=zip"')
    expect(render({ attachments: { enabled: true, used_bytes: 0, quota_bytes: 0, max_file_bytes: MB } })).toContain('0 bytes used (no total)')
    expect(render({ demo: true, attachments: { enabled: false, used_bytes: 0, quota_bytes: 0, max_file_bytes: MB } })).not.toContain('format=zip')
    expect(render()).not.toContain('attachment-usage')
  })
})
