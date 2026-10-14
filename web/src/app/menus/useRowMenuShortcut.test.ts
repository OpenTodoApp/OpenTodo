import { describe, expect, it } from 'vitest'
import { handleRowKey, type RowMenuHandlers } from './useRowMenuShortcut'

function setup() {
  const calls: string[] = []
  const h: RowMenuHandlers = { openMenu: () => calls.push('menu'), rename: () => calls.push('rename'), move: (to) => calls.push(`move:${to}`) }
  const ev = (key: string, mods: Partial<{ shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}, target: EventTarget = { tagName: 'BUTTON' } as unknown as EventTarget) =>
    handleRowKey({ key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, target, ...mods }, h)
  return { calls, ev }
}

describe('row menu shortcuts (labels-and-menus 1.6)', () => {
  it('"." , Shift+F10 and ContextMenu open the menu', () => {
    const { calls, ev } = setup()
    expect(ev('.')).toBe(true)
    expect(ev('F10', { shiftKey: true })).toBe(true)
    expect(ev('ContextMenu')).toBe(true)
    expect(ev('F10')).toBe(false)
    expect(calls).toEqual(['menu', 'menu', 'menu'])
  })

  it('F2 renames and Alt+arrows reorder, Alt+Shift to the ends', () => {
    const { calls, ev } = setup()
    ev('F2'); ev('ArrowUp', { altKey: true }); ev('ArrowDown', { altKey: true }); ev('ArrowUp', { altKey: true, shiftKey: true }); ev('ArrowDown', { altKey: true, shiftKey: true })
    expect(calls).toEqual(['rename', 'move:-1', 'move:1', 'move:top', 'move:bottom'])
  })

  it('does nothing while typing in a field or with Ctrl/Cmd', () => {
    const { calls, ev } = setup()
    expect(ev('.', {}, { tagName: 'INPUT' } as unknown as EventTarget)).toBe(false)
    expect(ev('.', {}, { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(false)
    expect(ev('.', { ctrlKey: true })).toBe(false)
    expect(calls).toEqual([])
  })
})
