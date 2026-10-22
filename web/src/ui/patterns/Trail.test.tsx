// @vitest-environment happy-dom
// OpenSpec accessibility "Location and link purpose" (accessibility-aaa D7).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '../test-utils'
import { Trail } from './Trail'

afterEach(() => { document.body.innerHTML = '' })

describe('Trail', () => {
  it('is a landmark named by the caller with one link per step and drawn, unread separators', async () => {
    const onSelect = vi.fn()
    await render(<Trail label="You are here" steps={[{ label: 'Work', href: '/project/work', onSelect }, { label: 'Clients', href: '/project/clients' }]} />)
    const nav = document.querySelector('nav[aria-label="You are here"]')!
    expect(nav).toBeTruthy()
    const links = [...nav.querySelectorAll('a')]
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['Work', '/project/work'], ['Clients', '/project/clients']])
    // The separator between the steps is an icon hidden from assistive technology; the list order carries the path.
    expect(nav.querySelectorAll('li').length).toBe(2)
    expect(nav.querySelectorAll('svg[aria-hidden="true"]').length).toBe(1)
    expect(nav.textContent).not.toContain('›')
    // A plain click navigates in the app; a modified click keeps the href for the browser.
    const plain = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    links[0].dispatchEvent(plain)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(plain.defaultPrevented).toBe(true)
    const modified = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true })
    links[0].dispatchEvent(modified)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(modified.defaultPrevented).toBe(false)
  })

  it('renders nothing without steps', async () => {
    await render(<Trail label="You are here" steps={[]} />)
    expect(document.querySelector('nav')).toBeNull()
  })
})
