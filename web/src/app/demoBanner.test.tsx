// @vitest-environment happy-dom
// The one-line demo banner (OpenSpec change lean-chrome D2, demo-mode "Demo sign-in
// and banner"): the idle lifetime from the device's demo record, the session
// dismissal, Learn more opening the help screen `demo`, and the write-limit notice
// taking the line's place, dismissed or not. Nothing is written to the account.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { reloadBannerDismissed, setDemo } from '../lib/demo'
import { closeHelp, useHelpRequest } from '../lib/helpRequest'
import type { DemoInfo } from '../lib/types'
import { click, flush, render } from '../ui/test-utils'
import { DemoBanner } from './DemoBanner'

const info: DemoInfo = { token: '', sandboxHours: { idle: 3, max: 24 }, resetsAt: 0 }
let lastHelp: string | null = null
function HelpSpy() { lastHelp = useHelpRequest()?.screen ?? null; return null }
const banner = () => document.querySelector<HTMLElement>('[data-testid="demo-banner"]')

beforeEach(async () => {
  await db.delete()
  await db.open()
  sessionStorage.clear()
  localStorage.clear()
  reloadBannerDismissed()
  setDemo(info)
})
afterEach(() => {
  setDemo(null)
  closeHelp()
  document.body.innerHTML = ''
})

describe('demo banner', () => {
  it('is one line: the lead, the second sentence hidden below 640 px, Learn more and two controls, nothing that wraps', async () => {
    const r = await render(<DemoBanner />)
    const b = banner()!
    expect(b.getAttribute('role')).toBe('status')
    expect(b.className).toContain('whitespace-nowrap')
    expect(b.className).toContain('flex')
    const line = b.querySelector('[data-demo-line]')!
    expect(line.className).toContain('truncate')
    expect(line.textContent).toBe("Demo: private sandbox, deleted after 3 h of inactivity. Don't store anything personal.")
    expect(line.querySelector('span.hidden.sm\\:inline')!.textContent).toBe(" Don't store anything personal.")
    // One row: no block-level second line inside the strip.
    expect(b.querySelectorAll(':scope > p')).toHaveLength(1)
    expect(b.querySelector('[data-demo-learn-more]')!.textContent).toBe('Learn more')
    expect(b.querySelector('[data-demo-details]')!.getAttribute('aria-label')).toBe('Details')
    expect(b.querySelector('[data-demo-dismiss]')!.getAttribute('aria-label')).toBe('Dismiss')
    await r.unmount()
  })

  it('Learn more opens the help screen demo', async () => {
    const r = await render(<><DemoBanner /><HelpSpy /></>)
    await click(banner()!.querySelector('[data-demo-learn-more]')!)
    expect(lastHelp).toBe('demo')
    await r.unmount()
  })

  it('Details shows the full text in a dialog', async () => {
    const r = await render(<DemoBanner />)
    await click(banner()!.querySelector('[data-demo-details]')!)
    await flush(10)
    const dialog = document.querySelector('[data-testid="demo-details"]')!
    expect(dialog.textContent).toContain('3 hours of inactivity')
    expect(dialog.textContent).toContain('24 hours after it was created')
    expect(dialog.textContent).toContain('nightly reset')
    expect(dialog.textContent).toContain("Don't store anything personal.")
    await r.unmount()
  })

  it('Dismiss hides it for the session: it survives a re-render and a remount, not a cleared session, and writes nothing', async () => {
    const r = await render(<DemoBanner />)
    await click(banner()!.querySelector('[data-demo-dismiss]')!)
    expect(banner()).toBeNull()
    expect(sessionStorage.getItem('opentodo.demoBannerDismissed')).toBe('1')
    await r.rerender(<DemoBanner />)
    expect(banner()).toBeNull()
    await r.unmount()
    const again = await render(<DemoBanner />)
    expect(banner()).toBeNull()
    // A new browser session: the session storage is empty again.
    sessionStorage.clear()
    reloadBannerDismissed()
    await flush(10)
    expect(banner()).not.toBeNull()
    await again.unmount()
    expect(await db.outbox.count()).toBe(0)
    expect(localStorage.getItem('opentodo.demoBannerDismissed')).toBeNull()
  })

  it('shows the write-limit notice in its place after a dismissal, and the line again once writes are accepted', async () => {
    const r = await render(<DemoBanner />)
    await click(banner()!.querySelector('[data-demo-dismiss]')!)
    await r.rerender(<DemoBanner notice="This demo sandbox reached its limit of changes." />)
    expect(banner()!.querySelector('[data-testid="demo-limit"]')!.textContent).toContain('reached its limit')
    expect(banner()!.querySelector('[data-demo-line]')).toBeNull()
    await r.rerender(<DemoBanner />)
    expect(banner()).toBeNull()
    sessionStorage.clear()
    reloadBannerDismissed()
    await r.rerender(<DemoBanner notice={undefined} />)
    expect(banner()!.querySelector('[data-demo-line]')).not.toBeNull()
    await r.unmount()
  })
})
