// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { Menu } from '../app/overlay/Menu'
import { MenuGroup, MenuItem, MenuSeparator, nextIndex } from './Menu'
import { click, flush, key, render } from './test-utils'

function ViewMenu({ calls }: { calls: string[] }) {
  return (
    <Menu label="View actions" trigger="More" kind="menu">
      <MenuGroup>
        <MenuItem label="Rename" icon="pencil" shortcut="R" onSelect={() => calls.push('rename')} />
        <MenuItem label="Move up" icon="arrow-up" onSelect={() => calls.push('up')} disabled description="Already first" />
        <MenuItem label="Move down" icon="arrow-down" onSelect={() => calls.push('down')} />
        <MenuItem label="Pin to sidebar" checked={false} onSelect={() => calls.push('pin')} />
      </MenuGroup>
      <MenuSeparator />
      <MenuItem label="Delete view" icon="trash-2" danger onSelect={() => calls.push('delete')} />
    </Menu>
  )
}

async function open(calls: string[]) {
  const r = await render(<ViewMenu calls={calls} />)
  const trigger = r.container.querySelector('button')!
  trigger.focus()
  await click(trigger)
  await flush(20)
  return { ...r, trigger, menu: document.querySelector('[role="menu"]')! }
}

describe('Menu kind="menu"', () => {
  it('opens on the first item; Down twice then Enter runs the third enabled item and returns focus', async () => {
    const calls: string[] = []
    const { trigger, menu, unmount } = await open(calls)
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(document.activeElement?.textContent).toContain('Rename')
    await key(document.activeElement!, 'ArrowDown') // Move up is disabled: skipped
    await key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement?.textContent).toContain('Pin to sidebar')
    await key(document.activeElement!, 'Enter')
    await click(document.activeElement!) // Enter on a native button activates it
    await flush(20)
    expect(calls).toEqual(['pin'])
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(menu).toBeTruthy()
    await unmount()
  })

  it('type-ahead moves to the next item starting with the letter; Home and End jump', async () => {
    const calls: string[] = []
    const { unmount } = await open(calls)
    await key(document.activeElement!, 'd')
    expect(document.activeElement?.textContent).toContain('Delete view')
    await new Promise((r) => setTimeout(r, 550)) // type-ahead buffer resets after 500 ms
    await key(document.activeElement!, 'm') // wraps; "Move up" is disabled and skipped
    expect(document.activeElement?.textContent).toContain('Move down')
    await key(document.activeElement!, 'Home')
    expect(document.activeElement?.textContent).toContain('Rename')
    await key(document.activeElement!, 'End')
    expect(document.activeElement?.textContent).toContain('Delete view')
    await key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement?.textContent).toContain('Rename')
    await unmount()
  })

  it('announces the shortcut and the reason an item is unavailable', async () => {
    const { unmount } = await open([])
    const items = [...document.querySelectorAll('[role^="menuitem"]')]
    const rename = items.find((i) => i.textContent?.includes('Rename'))!
    const desc = rename.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)!.textContent).join(' ')
    expect(desc).toBe('R')
    expect(rename.getAttribute('aria-keyshortcuts')).toBe('R')
    const up = items.find((i) => i.textContent?.includes('Move up'))!
    expect(up.hasAttribute('disabled')).toBe(true)
    expect(up.textContent).toContain('Already first')
    expect(items.find((i) => i.textContent?.includes('Pin'))!.getAttribute('role')).toBe('menuitemcheckbox')
    await unmount()
  })
})

describe('nextIndex', () => {
  it('wraps and jumps', () => {
    expect(nextIndex('ArrowDown', 2, 3)).toBe(0)
    expect(nextIndex('ArrowUp', 0, 3)).toBe(2)
    expect(nextIndex('ArrowDown', -1, 3)).toBe(0)
    expect(nextIndex('End', 0, 3)).toBe(2)
    expect(nextIndex('x', 0, 3)).toBeNull()
  })
})

describe('Menu kind="dialog" (default)', () => {
  it('keeps the dialog semantics for panels with form controls', async () => {
    const r = await render(<Menu label="Label actions" trigger="…"><select aria-label="Merge into"><option>x</option></select></Menu>)
    expect(r.container.querySelector('button')!.getAttribute('aria-haspopup')).toBe('dialog')
    await r.unmount()
    void vi
  })
})
