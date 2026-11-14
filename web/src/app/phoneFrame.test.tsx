// @vitest-environment happy-dom
// shell-first-paint: the cold-start skeleton holds the place of the phone's bar and tab
// bar with the frame the real ones use, and only where the shell will show them.
import { describe, expect, it } from 'vitest'
import { render } from '../ui/test-utils'
import { PHONE_BAR_FRAME, PHONE_BAR_LINE, PhoneFrameSkeleton, TAB_BAR_FRAME, TAB_FRAME, hasPhoneChrome } from './phoneFrame'
import { TabBar } from './TabBar'
import type { Route } from './router'

async function skeleton(route: Route, signedIn = true) {
  const { container } = await render(<PhoneFrameSkeleton route={route} signedIn={signedIn}><p data-rows /></PhoneFrameSkeleton>)
  const [bar, tabs] = [...container.querySelectorAll<HTMLElement>('div[aria-hidden]')]
  return { container, bar, tabs }
}

describe('the cold-start skeleton on a phone', () => {
  it('holds the bar and the tab bar in the real frame around the rows', async () => {
    const { container, bar, tabs } = await skeleton({ view: 'inbox' })
    expect(bar.className).toBe(`${PHONE_BAR_FRAME} ${PHONE_BAR_LINE}`)
    expect(tabs.className).toBe(TAB_BAR_FRAME)
    // Four tabs, each a button in the tab's box, so the touch rules size them as the real ones.
    expect([...tabs.children].map((tab) => `${tab.tagName} ${tab.className}`)).toEqual(Array(4).fill(`BUTTON ${TAB_FRAME} min-h-14`))
    expect([...tabs.querySelectorAll('button')].every((tab) => tab.disabled)).toBe(true)
    expect(container.querySelector('[data-rows]')).not.toBeNull()
    // Nothing in the chrome is announced or named: the rows carry the one status.
    expect(container.textContent).toBe('')
  })

  it('draws the same frame as the real tab bar', async () => {
    const { container } = await render(<TabBar route={{ view: 'inbox' }} onSearch={() => {}} />)
    const nav = container.querySelector('nav')!
    expect(nav.className).toBe(TAB_BAR_FRAME)
    expect(nav.children).toHaveLength(4)
    for (const tab of nav.children) expect(tab.className.startsWith(`${TAB_FRAME} `)).toBe(true)
    expect(nav.children[0].className).toContain('min-h-14')
  })

  it('leaves the hairline off a day page, as its bar does', async () => {
    for (const view of ['today', 'upcoming'] as const) expect((await skeleton({ view })).bar.className).toBe(`${PHONE_BAR_FRAME} `)
  })

  it('shows rows only on a device that was never signed in', async () => {
    const { container, bar } = await skeleton({ view: 'inbox' }, false)
    expect(bar).toBeUndefined()
    expect(container.querySelector('[data-rows]')).not.toBeNull()
  })

  it('shows rows only on a screen without the tab bar', async () => {
    for (const route of [{ view: 'share' }, { view: 'task', id: 't1' }, { view: 'invite', token: 'x' }, { view: 'rules', id: 'r1' }] as Route[]) {
      expect(hasPhoneChrome(route), route.view).toBe(false)
      expect((await skeleton(route)).bar, route.view).toBeUndefined()
    }
    for (const route of [{ view: 'inbox' }, { view: 'today' }, { view: 'rules' }, { view: 'settings' }] as Route[]) expect(hasPhoneChrome(route), route.view).toBe(true)
  })
})
