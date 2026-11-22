// @vitest-environment happy-dom
// tablet-shells D1: the iPad's shortcut overlay sends a shortcut id, and the page presses
// that shortcut's own keys through the one dispatcher: overrides apply, focus in a text
// field does not stop it, and only the overlay's ids are accepted.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerShortcutScope, resetShortcutScopes } from '../app/shortcuts'
import { listenForShellShortcuts, pressShortcut, SHORTCUT_EVENT } from './shellShortcuts'

afterEach(() => { resetShortcutScopes(); document.body.innerHTML = '' })

describe('shell shortcuts', () => {
  it('runs each overlay shortcut through the dispatcher, a sequence included', () => {
    const ran: string[] = []
    const handler = (id: string) => () => void ran.push(id)
    registerShortcutScope({ scope: 'global', handlers: Object.fromEntries(['list.quick-add', 'global.palette', 'go.today', 'go.inbox', 'go.upcoming'].map((id) => [id, handler(id)])) })
    for (const id of ['list.quick-add', 'global.palette', 'go.today', 'go.inbox', 'go.upcoming']) expect(pressShortcut(id)).toBe(true)
    expect(ran).toEqual(['list.quick-add', 'global.palette', 'go.today', 'go.inbox', 'go.upcoming'])
  })

  it('does what the same key does on the screen: an override wins', () => {
    const ran: string[] = []
    registerShortcutScope({ scope: 'global', handlers: { 'list.quick-add': () => void ran.push('global') } })
    registerShortcutScope({ scope: 'calendar', handlers: { 'calendar.quick-add': () => void ran.push('calendar') } })
    pressShortcut('list.quick-add')
    expect(ran).toEqual(['calendar'])
  })

  it('works while a text field has focus, and refuses ids outside the overlay', () => {
    const quick = vi.fn()
    const trash = vi.fn()
    registerShortcutScope({ scope: 'global', handlers: { 'list.quick-add': quick, 'global.undo': trash } })
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    const stop = listenForShellShortcuts()
    window.dispatchEvent(new CustomEvent(SHORTCUT_EVENT, { detail: { id: 'list.quick-add' } }))
    window.dispatchEvent(new CustomEvent(SHORTCUT_EVENT, { detail: { id: 'global.undo' } }))
    window.dispatchEvent(new CustomEvent(SHORTCUT_EVENT, { detail: { id: 42 } }))
    stop()
    window.dispatchEvent(new CustomEvent(SHORTCUT_EVENT, { detail: { id: 'list.quick-add' } }))
    expect(quick).toHaveBeenCalledOnce()
    expect(trash).not.toHaveBeenCalled()
  })
})
