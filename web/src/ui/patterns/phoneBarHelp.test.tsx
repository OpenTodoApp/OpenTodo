// @vitest-environment happy-dom
// Help in the phone bar's menu (OpenSpec change phone-header-room): the bar gives Help to
// the page's menu as its last item and keeps the button only on a page without a menu.
import { afterEach, describe, expect, it } from 'vitest'
import { closeHelp, useHelpRequest, type HelpRequest } from '../../lib/helpRequest'
import { Menu } from '../overlay/Menu'
import { MenuItem } from '../Menu'
import { click, key, render, waitFor } from '../test-utils'
import { PageActions } from './PageHeader'

let request: HelpRequest | null = null
function Probe() {
  request = useHelpRequest()
  return null
}

const helpButton = () => document.querySelector('button[data-help-screen]:not([role="menuitem"])')
const items = () => [...document.querySelectorAll<HTMLElement>('[role="menu"] [role^="menuitem"]')]
const print = <MenuItem label="Print…" onSelect={() => {}} />

afterEach(() => { closeHelp(); request = null })

describe('Help in the phone bar', () => {
  it('is the last item of the overflow menu, opens the screen’s guide and returns focus to the menu button', async () => {
    const r = await render(<><Probe /><PageActions overflow={print} help="inbox" helpInMenu /></>)
    expect(helpButton()).toBeNull()
    const trigger = r.container.querySelector<HTMLElement>('button[aria-label="More actions"]')!
    await click(trigger)
    await waitFor(() => items().length === 2, 'the menu with Help')
    const help = items()[1]
    expect(help.textContent).toBe('Help')
    expect(help.getAttribute('data-help-screen')).toBe('inbox')
    expect(help.previousElementSibling?.getAttribute('role')).toBe('separator')
    // Reachable by keyboard: End moves to the last item.
    await key(items()[0], 'End')
    expect(document.activeElement).toBe(help)
    await click(help)
    expect(request).toEqual({ screen: 'inbox', trigger })
    await r.unmount()
  })

  it('joins a page’s own menu, also behind a picker step', async () => {
    function Own({ kind }: { kind: 'menu' | 'dialog' }) {
      return <Menu kind={kind} label="Project menu" trigger="…">{kind === 'menu' ? print : <p>Move to…</p>}</Menu>
    }
    const r = await render(<PageActions menu={<Own kind="menu" />} help="project" helpInMenu />)
    expect(helpButton()).toBeNull()
    await click(r.container.querySelector('button[aria-label="Project menu"]')!)
    await waitFor(() => items().length === 2, 'the menu with Help')
    expect(items()[1].getAttribute('data-help-screen')).toBe('project')
    // A picker step takes the menu's place: no Help item in it, and no button back in the bar.
    await r.rerender(<PageActions menu={<Own kind="dialog" />} help="project" helpInMenu />)
    expect(document.querySelector('[data-help-screen]')).toBeNull()
    await r.unmount()
  })

  it('stays a button on a page without a menu, or whose menu cannot hold it', async () => {
    const bare = await render(<PageActions help="settings" helpInMenu />)
    expect(helpButton()?.getAttribute('aria-label')).toBe('Help')
    await bare.unmount()
    const other = await render(<PageActions menu={<button type="button">Revoke</button>} help="settings" helpInMenu />)
    expect(helpButton()).not.toBeNull()
    await other.unmount()
    const panel = await render(<PageActions menu={<Menu label="Colours" trigger="…"><p>Panel</p></Menu>} help="settings" helpInMenu />)
    expect(helpButton()).not.toBeNull()
    await panel.unmount()
  })

  it('stays a button beside the menu in a page header (from 768 px)', async () => {
    const r = await render(<PageActions overflow={print} help="inbox" />)
    expect(helpButton()).not.toBeNull()
    await click(r.container.querySelector('button[aria-label="More actions"]')!)
    await waitFor(() => items().length === 1, 'the menu')
    expect(items()[0].textContent).toBe('Print…')
    await r.unmount()
  })
})
