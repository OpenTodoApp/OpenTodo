// @vitest-environment happy-dom
// A header follows its own width (OpenSpec change tablet-header-room): narrower than
// 40 rem it gives Help to the page's menu and the title gives way before the actions
// wrap, as it does at every width; a lead line shows whole or not at all; a wide header
// keeps its Help button.
import { afterEach, describe, expect, it } from 'vitest'
import { MenuItem } from '../Menu'
import { click, render, waitFor } from '../test-utils'
import { PageHeader } from './PageHeader'

const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth')

/** Lays the header out at `header` px (400 is narrow with touch and with a mouse); the lead line's content is `lead` px wide in a box of `box` px. */
function layout(header: number, lead = 0, box = 0) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.hasAttribute('data-page-lead') ? box : header } })
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get(this: HTMLElement) { return this.hasAttribute('data-page-lead') ? lead : 0 } })
}

afterEach(() => {
  if (width) Object.defineProperty(HTMLElement.prototype, 'clientWidth', width)
  if (scroll) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', scroll)
})

const helpButton = () => document.querySelector('button[data-help-screen]:not([role="menuitem"])')
const print = <MenuItem label="Print…" onSelect={() => {}} />

describe('a page header follows its own width', () => {
  it('narrower than 40 rem: Help is the menu’s last item and the title gives way', async () => {
    layout(400)
    const r = await render(<PageHeader title="Inbox" overflow={print} help="inbox" />)
    const header = r.container.querySelector('[data-page-header]')!
    expect(header.hasAttribute('data-page-narrow')).toBe(true)
    expect(helpButton()).toBeNull()
    expect(r.container.querySelector('[data-page-title]')!.className).toContain('max-w-max')
    await click(r.container.querySelector('button[aria-label="More actions"]')!)
    await waitFor(() => document.querySelectorAll('[role="menu"] [role^="menuitem"]').length === 2, 'the menu with Help')
    expect([...document.querySelectorAll('[role="menu"] [role^="menuitem"]')].at(-1)?.getAttribute('data-help-screen')).toBe('inbox')
    await r.unmount()
  })

  it('a narrow header without a menu keeps the Help button', async () => {
    layout(400)
    const r = await render(<PageHeader title="Settings" help="settings" />)
    expect(helpButton()?.getAttribute('aria-label')).toBe('Help')
    await r.unmount()
  })

  it('from 40 rem: the Help button, and the title still gives way before the actions wrap (issue 2134)', async () => {
    layout(702)
    const r = await render(<PageHeader title="Inbox" overflow={print} help="inbox" />)
    expect(r.container.querySelector('[data-page-header]')!.hasAttribute('data-page-narrow')).toBe(false)
    expect(helpButton()?.getAttribute('aria-label')).toBe('Help')
    expect(r.container.querySelector('[data-page-title]')!.className).toContain('max-w-max')
    await r.unmount()
  })

  it('a lead line that does not fit is hidden, not cut; one that fits shows', async () => {
    layout(400, 60, 24)
    const cut = await render(<PageHeader title="Inbox" meta="3 to sort" />)
    expect(cut.container.querySelector('[data-page-lead]')!.className).toContain('invisible')
    await cut.unmount()
    layout(1014, 60, 400)
    const whole = await render(<PageHeader title="Inbox" meta="3 to sort" />)
    expect(whole.container.querySelector('[data-page-lead]')!.className).not.toContain('invisible')
    await whole.unmount()
  })
})
