// @vitest-environment happy-dom
// A sidebar row on touch (OpenSpec change touch-sidebar-names, GitHub issue 1380): the
// row's menu button takes no room and a hold on the row opens its menu; the foot's name
// and the sync words show whole or not at all.
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOUCH_HOLD_MS } from '../lib/dnd'
import { render, waitFor } from '../ui/test-utils'
import { Menu, MenuItem, SidebarItem } from '../ui'
import { holdForRowMenu } from './rowMenuHold'

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

const TOUCH_ID = 5
const pointer = (target: EventTarget, type: string, x: number, y: number, pointerType = 'touch') => act(() => {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: TOUCH_ID, pointerType, clientX: x, clientY: y, isPrimary: true }))
})

function rows(onOpen: () => void) {
  return (
    <div data-sidebar-scroll onPointerDown={holdForRowMenu}>
      <div data-sidebar-group-header><button type="button" aria-haspopup="menu">Add</button></div>
      <div data-menu-row>
        <SidebarItem label="Home renovation" count={7} onClick={onOpen} />
        <Menu kind="menu" label="Menu for project Home renovation" trigger="…" triggerClassName="hover-reveal">
          <MenuItem label="Rename" onSelect={() => {}} />
        </Menu>
      </div>
      <div data-plain><SidebarItem label="Inbox" onClick={onOpen} /></div>
    </div>
  )
}
const menuOpen = () => !!document.querySelector('[role="menu"]')
/** Past the hold on a stepped clock: for the cases where it must not arm, so there is no condition to wait for. */
const pastTheHold = () => act(() => { vi.advanceTimersByTime(TOUCH_HOLD_MS + 60) })

describe('a hold on a sidebar row', () => {
  it('arms with a tint and opens the row\'s menu on release, without opening the row', async () => {
    const onOpen = vi.fn()
    const r = await render(rows(onOpen))
    const item = r.container.querySelector<HTMLElement>('[data-menu-row] [data-sidebar-item]')!
    pointer(item.querySelector('.truncate')!, 'pointerdown', 40, 60)
    await waitFor(() => item.hasAttribute('data-touch-hold'), 'the row to arm')
    expect(menuOpen()).toBe(false)
    pointer(window, 'pointerup', 41, 61)
    expect(item.hasAttribute('data-touch-hold')).toBe(false)
    // The click that follows the release is swallowed: the row does not open.
    act(() => { item.click() })
    expect(onOpen).not.toHaveBeenCalled()
    await waitFor(menuOpen, 'the menu to open')
    expect(r.container.querySelector('[data-menu-row] button[aria-haspopup]')!.getAttribute('aria-expanded')).toBe('true')
    await r.unmount()
  })

  it('a tap, a scroll, a mouse and a row without a menu open nothing', async () => {
    const onOpen = vi.fn()
    const r = await render(rows(onOpen))
    const item = r.container.querySelector<HTMLElement>('[data-menu-row] [data-sidebar-item]')!
    vi.useFakeTimers()
    // A tap: released before the hold.
    pointer(item, 'pointerdown', 40, 60)
    pointer(window, 'pointerup', 40, 60)
    act(() => { item.click() })
    expect(onOpen).toHaveBeenCalledTimes(1)
    // A scroll: moved before the hold.
    pointer(item, 'pointerdown', 40, 60)
    pointer(window, 'pointermove', 40, 90)
    pastTheHold()
    expect(item.hasAttribute('data-touch-hold')).toBe(false)
    pointer(window, 'pointerup', 40, 90)
    // A mouse press never arms.
    pointer(item, 'pointerdown', 40, 60, 'mouse')
    pastTheHold()
    expect(item.hasAttribute('data-touch-hold')).toBe(false)
    pointer(window, 'pointerup', 40, 60, 'mouse')
    // A destination has no menu, and a group heading's own menu is not a row's.
    for (const el of [r.container.querySelector('[data-plain] [data-sidebar-item]')!, r.container.querySelector('[data-sidebar-group-header] button')!]) {
      pointer(el, 'pointerdown', 40, 60)
      pastTheHold()
      expect(r.container.querySelector('[data-touch-hold]')).toBeNull()
      pointer(window, 'pointerup', 40, 60)
    }
    pastTheHold()
    expect(menuOpen()).toBe(false)
    vi.useRealTimers()
    await r.unmount()
  })
})

describe('the styles', () => {
  it('on touch the row\'s menu button takes no room, is out of a finger\'s way and shows with keyboard focus', async () => {
    const css = (await import('../index.css?raw')).default.replace(/\s+/g, ' ')
    const from = css.indexOf('On touch a sidebar row\'s name has the room')
    const block = css.slice(from, css.indexOf('/* Whole or not at all', from))
    expect(block).toContain('@media (pointer: coarse) {')
    expect(block).toContain('[data-sidebar-scroll] [data-menu-row] button[aria-haspopup] { position: absolute;')
    expect(block).toContain('[data-sidebar-scroll] [data-menu-row] button[aria-haspopup]:not(:focus-visible) { opacity: 0; pointer-events: none; }')
    // Never `display: none` or `visibility: hidden`: the button stays in the Tab order and the accessibility tree.
    expect(block).not.toMatch(/display: none|visibility: hidden/)
  })

  it('`ui-whole` is one line that wraps, on touch only', async () => {
    const css = (await import('../index.css?raw')).default.replace(/\s+/g, ' ')
    expect(css).toContain('@media (pointer: coarse) { .ui-whole { display: flex; flex-wrap: wrap; align-content: flex-start; height: 1lh; overflow: hidden; } .ui-whole::before { content: ""; height: 1lh; } .ui-whole > * { flex: none; white-space: nowrap; } }')
  })
})
