// @vitest-environment happy-dom
// The shortcut dispatcher (OpenSpec change ux-overhaul, keyboard-shortcuts "One
// shortcut registry with scopes"): table-driven per scope from the registry, plus
// the resolution rules: innermost scope wins and runs once, an inactive scope does
// nothing, overrides order siblings, sequences share the `g` prefix with the Vim
// layer, text fields keep single keys, a handler can fall through.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chordsOf, SHORTCUTS, type Shortcut, type ShortcutScope } from '../../lib/shortcuts'
import { armGPrefix, clearPrefix, dispatch, installShortcutDispatcher, isPrefixPending, registerShortcutScope, resetShortcutScopes, type ScopeFrame } from './dispatch'

type Mods = Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }>

function press(key: string, mods: Mods = {}, target: EventTarget = document.body): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })
  target.dispatchEvent(e)
  return e
}

/** Presses that type a registry chord sequence; returns the events (the last one ran the action). */
function pressChord(seq: ReturnType<typeof chordsOf>[number]): KeyboardEvent[] {
  return seq.map((c) => {
    const key = c.key === 'escape' ? 'Escape' : c.key === 'enter' ? 'Enter' : c.key === 'tab' ? 'Tab' : c.key === 'delete' ? 'Delete' : c.key === 'backspace' ? 'Backspace'
      : c.key === 'arrowup' ? 'ArrowUp' : c.key === 'arrowdown' ? 'ArrowDown' : c.key === 'arrowleft' ? 'ArrowLeft' : c.key === 'arrowright' ? 'ArrowRight'
      : c.key === 'contextmenu' ? 'ContextMenu' : c.key === 'f2' ? 'F2' : c.key === 'f10' ? 'F10' : c.shift && /^[a-z]$/.test(c.key) ? c.key.toUpperCase() : c.key
    return press(key, { ctrlKey: c.ctrl === 'ctrl' || c.ctrl === 'either', metaKey: c.ctrl === 'meta', altKey: c.alt, shiftKey: c.shift })
  })
}

let release = () => {}
beforeEach(() => { release = installShortcutDispatcher() })
afterEach(() => { release(); resetShortcutScopes(); document.body.innerHTML = ''; vi.restoreAllMocks() })

const dispatched = SHORTCUTS.filter((s) => !s.note && !s.local)
const scopes = [...new Set(dispatched.map((s) => s.scope))] as ShortcutScope[]

describe.each(scopes)('scope %s', (scope) => {
  const entries = dispatched.filter((s) => s.scope === scope)
  it.each(entries.map((s) => [s.id, s] as [string, Shortcut]))('%s runs once per chord and claims the key', (_id, entry) => {
    const ran: string[] = []
    const frame: ScopeFrame = { scope, view: entry.views?.[0], handlers: { [entry.id]: () => { ran.push(entry.id) } } }
    const off = registerShortcutScope(frame)
    for (const seq of chordsOf(entry)) {
      ran.length = 0
      const events = pressChord(seq)
      expect(ran, `${entry.id} on ${seq.map((c) => c.key).join(' ')}`).toEqual([entry.id])
      expect(events[events.length - 1].defaultPrevented).toBe(!entry.passive)
      expect(isPrefixPending()).toBe(false)
    }
    off()
  })
})

describe('resolution', () => {
  it('the innermost scope wins and the action runs once (panel priority over the list)', () => {
    const ran: string[] = []
    const panel = document.createElement('aside')
    const button = document.createElement('button')
    panel.append(button)
    document.body.append(panel)
    registerShortcutScope({ scope: 'list', handlers: { 'list.priority': () => { ran.push('list') } } })
    registerShortcutScope({ scope: 'panel', within: () => panel, handlers: { 'panel.priority': () => { ran.push('panel') } } })
    button.focus()
    press('1', {}, button)
    expect(ran).toEqual(['panel'])
    // Focus outside the panel: the panel scope is not active, the list's action runs.
    button.blur()
    press('1')
    expect(ran).toEqual(['panel', 'list'])
  })

  it('a scope that is not on screen does nothing and logs no error', () => {
    const error = vi.spyOn(console, 'error')
    const e = press('c')
    expect(e.defaultPrevented).toBe(false)
    expect(error).not.toHaveBeenCalled()
  })

  it('an overriding sibling runs first: `a` adds a card on a board, a subtask in a list', () => {
    const ran: string[] = []
    registerShortcutScope({ scope: 'list', handlers: { 'list.add-subtask': () => { ran.push('subtask') } } })
    press('a')
    expect(ran).toEqual(['subtask'])
    const off = registerShortcutScope({ scope: 'board', handlers: { 'board.add': () => { ran.push('card') } } })
    press('a')
    expect(ran).toEqual(['subtask', 'card'])
    off()
    press('a')
    expect(ran).toEqual(['subtask', 'card', 'subtask'])
  })

  it('a handler returning false lets the key fall through to the outer scope', () => {
    const ran: string[] = []
    registerShortcutScope({ scope: 'global', handlers: { 'global.sidebar': () => { ran.push('sidebar') } } })
    registerShortcutScope({ scope: 'calendar', handlers: { 'calendar.range-prev': () => { ran.push('calendar'); return false } } })
    press('[')
    expect(ran).toEqual(['calendar', 'sidebar'])
  })

  it('Shift+K skips an occurrence while Shift+S in a project still opens Share', () => {
    const ran: string[] = []
    registerShortcutScope({ scope: 'view', view: 'project', handlers: { 'project.share': () => { ran.push('share') } } })
    registerShortcutScope({ scope: 'list', handlers: { 'list.skip': () => { ran.push('skip') } } })
    press('K', { shiftKey: true })
    press('S', { shiftKey: true })
    expect(ran).toEqual(['skip', 'share'])
  })

  it('a `view` entry applies only in its view', () => {
    const ran: string[] = []
    registerShortcutScope({ scope: 'view', view: 'inbox', handlers: { 'project.share': () => { ran.push('share') } } })
    press('S', { shiftKey: true })
    expect(ran).toEqual([])
  })

  it('single keys stay out of text fields; entries marked `typing` still fire', () => {
    const ran: string[] = []
    const input = document.createElement('input')
    document.body.append(input)
    registerShortcutScope({ scope: 'list', handlers: { 'list.complete': () => { ran.push('c') }, 'list.escape': () => { ran.push('esc') } } })
    registerShortcutScope({ scope: 'global', handlers: { 'global.palette': () => { ran.push('palette') } } })
    press('c', {}, input)
    press('k', { ctrlKey: true }, input)
    press('Escape', {}, input)
    expect(ran).toEqual(['palette', 'esc'])
  })

  it('non-global scopes wait behind a dialog', () => {
    const ran: string[] = []
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    registerShortcutScope({ scope: 'list', handlers: { 'list.complete': () => { ran.push('c') } } })
    registerShortcutScope({ scope: 'global', handlers: { 'global.help': () => { ran.push('?') } } })
    press('c')
    press('?', { shiftKey: true })
    expect(ran).toEqual(['?'])
  })
})

describe('sequences', () => {
  it('`g` arms the prefix, the second key completes it, a stray key ends it', () => {
    const ran: string[] = []
    registerShortcutScope({ scope: 'global', handlers: { 'go.today': () => { ran.push('today') } } })
    registerShortcutScope({ scope: 'list', handlers: { 'list.complete': () => { ran.push('c') } } })
    const g = press('g')
    expect(g.defaultPrevented).toBe(true)
    expect(isPrefixPending()).toBe(true)
    press('t')
    expect(ran).toEqual(['today'])
    expect(isPrefixPending()).toBe(false)
    press('g')
    press('c')
    // `g c` is Completed; the list's `c` did not run.
    expect(ran).toEqual(['today'])
    press('g')
    press('z')
    expect(isPrefixPending()).toBe(false)
    press('c')
    expect(ran).toEqual(['today', 'c'])
  })

  it('the prefix expires on its own', () => {
    vi.useFakeTimers()
    registerShortcutScope({ scope: 'global', handlers: { 'go.today': () => {} } })
    press('g')
    expect(isPrefixPending()).toBe(true)
    vi.advanceTimersByTime(900)
    expect(isPrefixPending()).toBe(false)
    vi.useRealTimers()
  })

  it('the Vim layer shares the prefix: its capturing frame sees `g g`, navigation keeps `g t`', () => {
    const ran: string[] = []
    registerShortcutScope({ scope: 'global', handlers: { 'go.today': () => { ran.push('today') } } })
    registerShortcutScope({
      scope: 'vim', capture: true, handlers: {},
      any: (e) => {
        if (e.key === 'g' && isPrefixPending()) { ran.push('gg'); clearPrefix(); return true }
        return false
      },
    })
    press('g')
    press('g')
    expect(ran).toEqual(['gg'])
    expect(isPrefixPending()).toBe(false)
    press('g')
    press('t')
    expect(ran).toEqual(['gg', 'today'])
    armGPrefix()
    expect(isPrefixPending()).toBe(true)
    clearPrefix()
  })
})

describe('frames', () => {
  it('a capturing frame runs before deeper scopes; `any` can consume a key or just watch it', () => {
    const ran: string[] = []
    registerShortcutScope({ scope: 'panel', handlers: { 'panel.escape': () => { ran.push('panel') } } })
    registerShortcutScope({ scope: 'list', capture: true, handlers: { 'list.dictate-stop': () => { ran.push('dictation') } }, any: (e) => { ran.push(`saw ${e.key}`) } })
    press('Escape')
    expect(ran).toEqual(['saw Escape', 'dictation'])
  })

  it('a paused frame is skipped, and modifier keys alone do nothing', () => {
    const ran: string[] = []
    let paused = true
    registerShortcutScope({ scope: 'list', paused: () => paused, handlers: { 'list.complete': () => { ran.push('c') } } })
    press('c')
    expect(ran).toEqual([])
    paused = false
    press('Shift', { shiftKey: true })
    press('c')
    expect(ran).toEqual(['c'])
  })

  it('dispatch() reports whether anything ran', () => {
    registerShortcutScope({ scope: 'list', handlers: { 'list.complete': () => {} } })
    expect(dispatch(new KeyboardEvent('keydown', { key: 'c', cancelable: true }))).toBe(true)
    expect(dispatch(new KeyboardEvent('keydown', { key: 'y', cancelable: true }))).toBe(false)
  })
})
