// @vitest-environment happy-dom
// Links to other apps (OpenSpec change app-links): the Settings list refuses
// denied schemes; a note link opens only for the viewer's own list, after the
// confirmation the first time on a device; an app link origin chip likewise.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pendingAppLink, setAppLinkSchemes } from '../lib/appLinks'
import { click, render, type, waitFor } from '../ui/test-utils'
import { AppLinkConfirm } from './AppLinkConfirm'
import { AppLinksView } from './AppLinksSettings'
import { MarkdownView } from './MarkdownView'
import { OriginChip } from './OriginChip'

afterEach(() => {
  setAppLinkSchemes([])
  pendingAppLink.set(null)
  localStorage.clear()
  vi.restoreAllMocks()
})

const paper = '[paper](zotero://select/items/ABC)'

describe('Settings: Links to other apps', () => {
  it('adds a scheme and refuses a denied one', async () => {
    const onChange = vi.fn()
    const r = await render(<AppLinksView list={['mid']} onChange={onChange} />)
    const input = r.container.querySelector('[data-app-link-input]') as HTMLInputElement
    await type(input, 'javascript')
    await click(r.container.querySelector('[data-app-link-add]')!)
    expect(onChange).not.toHaveBeenCalled()
    expect(r.container.querySelector('[data-app-link-problem]')?.textContent).toBe('This kind of link can never open')
    await type(input, 'Zotero://')
    await click(r.container.querySelector('[data-app-link-add]')!)
    expect(onChange).toHaveBeenCalledWith(['mid', 'zotero'])
    await click(r.container.querySelector('[data-app-link-remove="mid"]')!)
    expect(onChange).toHaveBeenLastCalledWith([])
    await r.unmount()
  })
})

describe('a note link into another app', () => {
  it('is text with its address for a viewer who added no scheme', async () => {
    const r = await render(<MarkdownView source={paper} />)
    expect(r.container.querySelector('a')).toBeNull()
    expect(r.container.querySelector('[data-app-link="text"]')?.textContent).toBe('paper')
    await r.unmount()
  })

  it('opens after the confirmation, and at once once trusted on this device', async () => {
    setAppLinkSchemes(['zotero'])
    // Count the hand-over to the system only: the anchor launchAppLink makes, never the page's own link.
    const original = HTMLAnchorElement.prototype.click
    const launched: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      if (this.isConnected) original.call(this)
      else launched.push(this.href)
    })
    const r = await render(<><MarkdownView source={paper} /><AppLinkConfirm /></>)
    const link = () => r.container.querySelector('[data-app-link="open"]') as HTMLAnchorElement
    await waitFor(() => !!link(), 'the link')
    await click(link())
    await waitFor(() => !!document.querySelector('[data-testid="app-link-confirm"]'), 'the confirmation')
    expect(document.querySelector('[data-app-link-url]')?.textContent).toBe('zotero://select/items/ABC')
    expect(launched).toEqual([])
    await click(document.querySelector('[role="switch"]')!)
    await click(document.querySelector('[data-app-link-open]')!)
    expect(launched).toEqual(['zotero://select/items/ABC'])
    await click(link())
    expect(document.querySelector('[data-testid="app-link-confirm"]')).toBeNull()
    expect(launched).toHaveLength(2)
    await r.unmount()
  })

  it('a javascript: link stays text everywhere', async () => {
    setAppLinkSchemes(['javascript'])
    const r = await render(<MarkdownView source="[x](javascript:void)" />)
    expect(r.container.querySelector('a')).toBeNull()
    expect(r.container.textContent).toBe('x')
    await r.unmount()
  })
})

describe('an app link origin', () => {
  const origin = { kind: 'url' as const, url: 'zotero://select/items/ABC' }
  it('reads as the app and opens only for the viewer who allowed it', async () => {
    const r = await render(<OriginChip origin={origin} />)
    expect(r.container.textContent).toContain('Zotero')
    expect(r.container.querySelector('[data-app-link="open"]')).toBeNull()
    await r.unmount()
    setAppLinkSchemes(['zotero'])
    const ana = await render(<OriginChip origin={origin} />)
    await waitFor(() => !!ana.container.querySelector('[data-app-link="open"]'), 'an opening chip')
    await ana.unmount()
  })
})
